"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { ActionResult } from "@/lib/types";
import { idSchema } from "@/lib/validation";

const notesJsonSchema = z.string().refine(
  (value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid notes content." },
);

const CONFLICT_MESSAGE =
  "Project changed while you were editing — reload and retry.";

export async function saveNotes(
  projectId: string,
  version: number,
  notesJson: unknown,
): Promise<ActionResult<{ version: number }>> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      error: "You must be signed in to do that.",
    };
  }

  const parsedProjectId = idSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    return { ok: false, code: "VALIDATION", error: "Invalid project id." };
  }
  projectId = parsedProjectId.data;

  const parsed = notesJsonSchema.safeParse(notesJson);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      error: parsed.error.issues[0]?.message ?? "Invalid notes content.",
    };
  }

  const updateResult = await db.project.updateMany({
    where: { id: projectId, version },
    data: {
      notes: parsed.data,
      version: { increment: 1 },
      updatedById: session.personId,
    },
  });

  if (updateResult.count === 0) {
    const exists = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (exists) {
      return { ok: false, code: "CONFLICT", error: CONFLICT_MESSAGE };
    }
    return { ok: false, code: "NOT_FOUND", error: "Project not found." };
  }

  revalidatePath("/projects");
  // Keep the detail page's project.version fresh, or its details form and
  // archive button submit stale versions and false-CONFLICT.
  revalidatePath("/projects/[id]", "page");
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { version: true },
  });
  return { ok: true, data: { version: project.version } };
}
