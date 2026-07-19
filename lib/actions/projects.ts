"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Milestone, Person, Project, ProjectMember } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { dateOnlyUTC } from "@/lib/health";
import { sanitizePerson } from "@/lib/sanitize-person";
import { requireSession } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import {
  idSchema,
  projectCreateSchema,
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

function sanitizeProjectResult(
  project: ProjectWithRelations,
): ProjectWithRelations {
  return {
    ...project,
    owner: sanitizePerson(project.owner),
    members: project.members.map((member) => ({
      ...member,
      person: sanitizePerson(member.person),
    })),
  };
}

async function assertRealPeople(
  personIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = Array.from(new Set(personIds));
  if (ids.length === 0) {
    return { ok: true };
  }
  const people = await db.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, isDemo: true },
  });

  if (people.length !== ids.length) {
    return { ok: false, error: "Owner or member not found." };
  }

  if (people.some((person) => person.isDemo)) {
    return {
      ok: false,
      error: "Demo people cannot be assigned to real projects.",
    };
  }

  return { ok: true };
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

  const parsed = projectCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid project data.",
    };
  }

  const { memberIds, deliverables, startDate, endDate, ...rest } = parsed.data;
  // The owner is never duplicated into the member list.
  const uniqueMemberIds = Array.from(new Set(memberIds)).filter(
    (personId) => personId !== rest.ownerId,
  );

  // The form defaults the owner to the session user; that self-ownership is
  // always allowed (demo included), so only check other people. Deliverable
  // assignees get the same vetting.
  const assigneeIds = deliverables.flatMap((deliverable) =>
    deliverable.assigneeId ? [deliverable.assigneeId] : [],
  );
  const idsToCheck = [
    ...(rest.ownerId === session.personId ? [] : [rest.ownerId]),
    ...uniqueMemberIds,
    ...assigneeIds.filter((personId) => personId !== session.personId),
  ];
  const peopleCheck = await assertRealPeople(idsToCheck);
  if (!peopleCheck.ok) {
    return { ok: false, code: "VALIDATION", error: peopleCheck.error };
  }

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
      milestones: {
        create: deliverables.map((deliverable) => ({
          name: deliverable.name,
          dueDate: dateOnlyUTC(deliverable.dueDate),
          done: false,
          assigneeId: deliverable.assigneeId ?? null,
          updatedById: session.personId,
        })),
      },
    },
    include: projectInclude,
  });

  revalidateProjectRoutes();
  return { ok: true, data: sanitizeProjectResult(project) };
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
  const uniqueMemberIds = Array.from(new Set(memberIds)).filter(
    (personId) => personId !== rest.ownerId,
  );

  const peopleCheck = await assertRealPeople([rest.ownerId, ...uniqueMemberIds]);
  if (!peopleCheck.ok) {
    return { ok: false, code: "VALIDATION", error: peopleCheck.error };
  }

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
  return { ok: true, data: sanitizeProjectResult(updated) };
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
