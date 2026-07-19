"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Milestone, Person, Project, ProjectMember } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { dateOnlyUTC, deriveProgress } from "@/lib/health";
import {
  parseProjectCsv,
  resolveProjectCsvPeople,
} from "@/lib/project-csv";
import { requireSession } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import {
  idSchema,
  projectInputSchema,
  projectStatusSchema,
} from "@/lib/validation";

export type ProjectInput = z.infer<typeof projectInputSchema>;

export type ProjectWithRelations = Project & {
  owner: Person;
  members: (ProjectMember & { person: Person })[];
  milestones: Milestone[];
};

type ProjectStatus = z.infer<typeof projectStatusSchema>;

export type ProjectCsvImportResult =
  | { ok: true; data: { count: number } }
  | {
      ok: false;
      code: "VALIDATION" | "UNAUTHORIZED" | "ERROR";
      error: string;
      errors: string[];
    };

const projectVersionRefSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
});

export type ProjectVersionRef = z.infer<typeof projectVersionRefSchema>;

const PROJECT_ROUTES = ["/projects", "/board", "/timeline", "/archived"] as const;

const projectInclude = {
  owner: true,
  members: { include: { person: true } },
  milestones: true,
} satisfies Prisma.ProjectInclude;

const CONFLICT_MESSAGE =
  "Project changed while you were editing — reload and retry.";

function revalidateProjectRoutes(): void {
  for (const route of PROJECT_ROUTES) {
    revalidatePath(route);
  }
  // Detail pages render project fields and optimistic-lock versions too.
  revalidatePath("/projects/[id]", "page");
}

async function requireSessionResult(): Promise<
  | { ok: true; personId: string; isDemo: boolean }
  | { ok: false; code: "UNAUTHORIZED"; error: string }
> {
  try {
    const session = await requireSession();
    return { ok: true, personId: session.personId, isDemo: session.isDemo };
  } catch {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      error: "You must be signed in to do that.",
    };
  }
}

export async function createProject(
  input: unknown,
): Promise<ActionResult<ProjectWithRelations>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const { memberIds, startDate, endDate, ...rest } = parsed.data;
  const uniqueMemberIds = Array.from(new Set(memberIds));

  const project = await db.project.create({
    data: {
      ...rest,
      progress: 0,
      startDate: dateOnlyUTC(startDate),
      endDate: dateOnlyUTC(endDate),
      isDemo: session.isDemo,
      createdById: session.personId,
      updatedById: session.personId,
      members: {
        create: uniqueMemberIds.map((personId) => ({ personId })),
      },
    },
    include: projectInclude,
  });

  revalidateProjectRoutes();
  return { ok: true, data: project };
}

export async function importProjectsCsv(
  csvText: unknown,
): Promise<ProjectCsvImportResult> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return { ...session, errors: [session.error] };
  }

  const parsedText = z.string().min(1).safeParse(csvText);
  if (!parsedText.success) {
    const errors = ["Row 1: CSV file is empty or invalid."];
    return {
      ok: false,
      code: "VALIDATION",
      error: "CSV validation failed.",
      errors,
    };
  }

  const parsedCsv = parseProjectCsv(parsedText.data);
  if (!parsedCsv.ok) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "CSV validation failed.",
      errors: parsedCsv.errors,
    };
  }

  const people = await db.person.findMany({
    where: { isDemo: false },
    select: { id: true, name: true },
  });
  const resolvedCsv = resolveProjectCsvPeople(parsedCsv.data, people);
  if (!resolvedCsv.ok) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "CSV validation failed.",
      errors: resolvedCsv.errors,
    };
  }

  try {
    await db.$transaction(async (tx) => {
      for (const project of resolvedCsv.data) {
        await tx.project.create({
          data: {
            name: project.name,
            client: project.client,
            category: project.category,
            status: project.status,
            priority: project.priority,
            ownerId: project.ownerId,
            progress: deriveProgress(0, project.deliverables.length),
            startDate: dateOnlyUTC(project.startDate),
            endDate: dateOnlyUTC(project.endDate),
            version: 1,
            isDemo: session.isDemo,
            createdById: session.personId,
            updatedById: session.personId,
            members: {
              create: project.memberIds.map((personId) => ({ personId })),
            },
            milestones: {
              create: project.deliverables.map((deliverable) => ({
                name: deliverable.name,
                dueDate: dateOnlyUTC(deliverable.dueDate),
                done: false,
                version: 1,
                updatedById: session.personId,
              })),
            },
          },
        });
      }
    });
  } catch {
    const errors = [
      "Import failed before any projects were created. Please try again.",
    ];
    return {
      ok: false,
      code: "ERROR",
      error: errors[0],
      errors,
    };
  }

  revalidateProjectRoutes();
  return { ok: true, data: { count: resolvedCsv.data.length } };
}

export async function updateProject(
  id: string,
  version: number,
  input: unknown,
): Promise<ActionResult<ProjectWithRelations>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid project id." };
  }
  id = parsedId.data;

  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const { memberIds, startDate, endDate, ...rest } = parsed.data;
  const uniqueMemberIds = Array.from(new Set(memberIds));

  const updated = await db.$transaction(async (tx) => {
    // Progress is derived from deliverables server-side
    // (lib/actions/milestones.ts); the details form no longer owns it.
    const updateResult = await tx.project.updateMany({
      where: { id, version, isDemo: session.isDemo },
      data: {
        ...rest,
        startDate: dateOnlyUTC(startDate),
        endDate: dateOnlyUTC(endDate),
        version: { increment: 1 },
        updatedById: session.personId,
      },
    });

    if (updateResult.count === 0) {
      return null;
    }

    await tx.projectMember.deleteMany({ where: { projectId: id } });
    if (uniqueMemberIds.length > 0) {
      await tx.projectMember.createMany({
        data: uniqueMemberIds.map((personId) => ({ projectId: id, personId })),
      });
    }

    return tx.project.findUniqueOrThrow({
      where: { id },
      include: projectInclude,
    });
  });

  if (updated === null) {
    const exists = await db.project.findUnique({
      where: { id, isDemo: session.isDemo },
      select: { id: true },
    });
    if (exists) {
      return { ok: false, code: "CONFLICT", error: CONFLICT_MESSAGE };
    }
    return { ok: false, code: "NOT_FOUND", error: "Project not found." };
  }

  revalidateProjectRoutes();
  return { ok: true, data: updated };
}

export async function setProjectStatus(
  id: string,
  version: number,
  status: unknown,
): Promise<ActionResult<{ id: string; version: number; status: ProjectStatus }>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid project id." };
  }
  id = parsedId.data;

  const parsed = projectStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid project status." };
  }

  const updateResult = await db.project.updateMany({
    where: { id, version, isDemo: session.isDemo },
    data: {
      status: parsed.data,
      version: { increment: 1 },
      updatedById: session.personId,
    },
  });

  if (updateResult.count === 0) {
    const exists = await db.project.findUnique({
      where: { id, isDemo: session.isDemo },
      select: { id: true },
    });
    if (exists) {
      return { ok: false, code: "CONFLICT", error: CONFLICT_MESSAGE };
    }
    return { ok: false, code: "NOT_FOUND", error: "Project not found." };
  }

  revalidateProjectRoutes();
  const project = await db.project.findUniqueOrThrow({
    where: { id },
    select: { id: true, version: true },
  });
  return { ok: true, data: { ...project, status: parsed.data } };
}

export async function setArchived(
  projects: ProjectVersionRef[],
  archived: boolean,
): Promise<ActionResult<{ count: number }>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsedProjects = z.array(projectVersionRefSchema).min(1).safeParse(projects);
  if (!parsedProjects.success) {
    return { ok: false, code: "VALIDATION", error: "Select at least one project." };
  }

  const results = await Promise.all(
    parsedProjects.data.map((project) =>
      db.project.updateMany({
        where: { id: project.id, version: project.version, isDemo: session.isDemo },
        data: {
          archived,
          version: { increment: 1 },
          updatedById: session.personId,
        },
      }),
    ),
  );

  revalidateProjectRoutes();
  const succeededCount = results.reduce((count, result) => count + result.count, 0);
  const failedCount = parsedProjects.data.length - succeededCount;

  if (failedCount > 0) {
    const action = archived ? "archived" : "unarchived";
    return {
      ok: false,
      code: "CONFLICT",
      error:
        `${failedCount} of ${parsedProjects.data.length} projects changed before this update. ` +
        `${succeededCount} ${succeededCount === 1 ? "project was" : "projects were"} ${action}; ` +
        `reload and retry the ${failedCount} failed ${failedCount === 1 ? "project" : "projects"}.`,
    };
  }

  return { ok: true, data: { count: succeededCount } };
}
