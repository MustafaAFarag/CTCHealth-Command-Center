"use server";

import { revalidatePath } from "next/cache";
import type { Milestone } from "@prisma/client";

import { db } from "@/lib/db";
import { dateOnlyUTC, deriveProgress } from "@/lib/health";
import { requireSession } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import { idSchema, milestoneInputSchema } from "@/lib/validation";

const PROJECT_ROUTES = ["/projects", "/board", "/timeline", "/archived"] as const;

const CONFLICT_MESSAGE =
  "Project changed while you were editing — reload and retry.";

function revalidateProjectRoutes(): void {
  for (const route of PROJECT_ROUTES) {
    revalidatePath(route);
  }
  // Detail pages render milestones and optimistic-lock versions too.
  revalidatePath("/projects/[id]", "page");
}

// Progress is derived from deliverables once a project has any; this bypasses
// project.version on purpose so an open project-edit form can't false-CONFLICT.
async function syncProjectProgress(projectId: string): Promise<void> {
  const milestones = await db.milestone.findMany({
    where: { projectId },
    select: { done: true },
  });

  if (milestones.length === 0) {
    return;
  }

  const doneCount = milestones.filter((milestone) => milestone.done).length;
  await db.project.update({
    where: { id: projectId },
    data: { progress: deriveProgress(doneCount, milestones.length) },
  });
}

async function requireSessionResult(): Promise<
  { ok: true; personId: string } | { ok: false; code: "UNAUTHORIZED"; error: string }
> {
  try {
    const session = await requireSession();
    return { ok: true, personId: session.personId };
  } catch {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      error: "You must be signed in to do that.",
    };
  }
}

async function checkAssignee(
  assigneeId: string,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "VALIDATION"; error: string }> {
  const assignee = await db.person.findUnique({
    where: { id: assigneeId },
    select: { active: true },
  });

  if (!assignee) {
    return { ok: false, code: "NOT_FOUND", error: "Assignee not found." };
  }

  if (!assignee.active) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Assignee must be an active person.",
    };
  }

  return { ok: true };
}

export async function createMilestone(
  projectId: string,
  input: unknown,
): Promise<ActionResult<Milestone>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsedProjectId = idSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid project id." };
  }
  projectId = parsedProjectId.data;

  const parsed = milestoneInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid milestone data.",
    };
  }

  const assigneeCheck = await checkAssignee(parsed.data.assigneeId);
  if (!assigneeCheck.ok) {
    return assigneeCheck;
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    return { ok: false, code: "NOT_FOUND", error: "Project not found." };
  }

  const milestone = await db.milestone.create({
    data: {
      projectId,
      name: parsed.data.name,
      dueDate: dateOnlyUTC(parsed.data.dueDate),
      done: parsed.data.done,
      assigneeId: parsed.data.assigneeId,
      updatedById: session.personId,
    },
  });

  await syncProjectProgress(projectId);
  revalidateProjectRoutes();
  return { ok: true, data: milestone };
}

export async function updateMilestone(
  id: string,
  version: number,
  input: unknown,
): Promise<ActionResult<Milestone>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid milestone id." };
  }
  id = parsedId.data;

  const parsed = milestoneInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid milestone data.",
    };
  }

  const assigneeCheck = await checkAssignee(parsed.data.assigneeId);
  if (!assigneeCheck.ok) {
    return assigneeCheck;
  }

  const updateResult = await db.milestone.updateMany({
    where: { id, version },
    data: {
      name: parsed.data.name,
      dueDate: dateOnlyUTC(parsed.data.dueDate),
      done: parsed.data.done,
      assigneeId: parsed.data.assigneeId,
      version: { increment: 1 },
      updatedById: session.personId,
    },
  });

  if (updateResult.count === 0) {
    const exists = await db.milestone.findUnique({
      where: { id },
      select: { id: true },
    });
    if (exists) {
      return { ok: false, code: "CONFLICT", error: CONFLICT_MESSAGE };
    }
    return { ok: false, code: "NOT_FOUND", error: "Milestone not found." };
  }

  const milestone = await db.milestone.findUniqueOrThrow({ where: { id } });
  await syncProjectProgress(milestone.projectId);
  revalidateProjectRoutes();
  return { ok: true, data: milestone };
}

export async function deleteMilestone(
  id: string,
  version: number,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSessionResult();
  if (!session.ok) {
    return session;
  }

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid milestone id." };
  }
  id = parsedId.data;

  const milestone = await db.milestone.findUnique({
    where: { id },
    select: { projectId: true },
  });
  const deleteResult = await db.milestone.deleteMany({ where: { id, version } });

  if (deleteResult.count === 0 || !milestone) {
    return { ok: false, code: "CONFLICT", error: CONFLICT_MESSAGE };
  }

  await syncProjectProgress(milestone.projectId);
  revalidateProjectRoutes();
  return { ok: true, data: { id } };
}
