import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { computeHealth } from "@/lib/health";
import { sanitizePerson } from "@/lib/sanitize-person";
import { requireSession } from "@/lib/session";
import type { ProjectWithRelations } from "@/lib/actions/projects";

import { ProjectDetail } from "./project-detail";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const isDemo = session.isDemo;

  const [project, people] = await Promise.all([
    db.project.findUnique({
      where: { id, isDemo },
      include: {
        owner: true,
        members: { include: { person: true } },
        milestones: true,
      },
    }),
    db.person.findMany({ where: { isDemo: false }, orderBy: { name: "asc" } }),
  ]);

  if (!project) {
    notFound();
  }

  const safeProject = {
    ...project,
    owner: sanitizePerson(project.owner),
    members: project.members.map((member) => ({
      ...member,
      person: sanitizePerson(member.person),
    })),
  };

  const health = computeHealth({
    status: project.status,
    endDate: project.endDate,
    progress: project.progress,
  });

  return (
    <ProjectDetail
      project={safeProject as ProjectWithRelations}
      people={people.map(sanitizePerson)}
      health={health}
    />
  );
}
