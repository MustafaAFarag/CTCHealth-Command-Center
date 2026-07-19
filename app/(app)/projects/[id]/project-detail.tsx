"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Person } from "@prisma/client";

import { NotesTab } from "@/components/notes/notes-tab";
import { DeliverablesSection } from "@/components/project-details/deliverables-section";
import { DetailsTab } from "@/components/project-details/details-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setArchived } from "@/lib/actions/projects";
import type { ProjectWithRelations } from "@/lib/actions/projects";
import { deriveProgress, healthLabel, type Health } from "@/lib/health";
import { cn } from "@/lib/utils";

const HEALTH_DOT: Record<Health, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const CATEGORY_LABEL: Record<string, string> = {
  tech: "Tech",
  consultancy: "Consultancy",
  agency: "Agency",
  agents: "Agents",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function ProjectDetail({
  project,
  people,
  health,
}: {
  project: ProjectWithRelations;
  people: Person[];
  health: Health;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const doneCount = project.milestones.filter((m) => m.done).length;
  const progress = deriveProgress(doneCount, project.milestones.length);

  function handleArchiveToggle() {
    startTransition(async () => {
      const result = await setArchived(
        [{ id: project.id, version: project.version }],
        !project.archived,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(project.archived ? "Project unarchived." : "Project archived.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Button asChild variant="ghost" size="icon-sm" className="mt-0.5">
              <Link href="/overview">
                <ArrowLeft />
                <span className="sr-only">Back to overview</span>
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {project.name}
                </h1>
                {project.archived ? (
                  <Badge variant="secondary">Archived</Badge>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{project.client}</span>
                <span aria-hidden>·</span>
                <span>{CATEGORY_LABEL[project.category] ?? project.category}</span>
                <span aria-hidden>·</span>
                <Badge variant="secondary">
                  {STATUS_LABEL[project.status] ?? project.status}
                </Badge>
                <Badge variant="outline">
                  {PRIORITY_LABEL[project.priority] ?? project.priority}
                </Badge>
                <span aria-hidden>·</span>
                <span>Owner: {project.owner.name}</span>
                <span aria-hidden>·</span>
                <span>
                  {dateFormatter.format(new Date(project.startDate))} →{" "}
                  {dateFormatter.format(new Date(project.endDate))}
                </span>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn("h-2 w-2 rounded-full", HEALTH_DOT[health])}
                  />
                  {healthLabel(health)}
                </span>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={handleArchiveToggle}
          >
            {project.archived ? "Unarchive" : "Archive"}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 max-w-md flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="rounded-lg border border-border">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">Details</h2>
          <DetailsTab
            key={project.id}
            project={project}
            people={people}
            mode="edit"
            onClose={() => router.refresh()}
          />
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border">
            <div className="px-4 py-3">
              <DeliverablesSection
                projectId={project.id}
                ownerId={project.ownerId}
                people={people}
                milestones={project.milestones}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <h2 className="border-b px-4 py-2.5 text-sm font-medium">Notes</h2>
            <div className="h-96">
              <NotesTab
                key={project.id}
                projectId={project.id}
                version={project.version}
                notes={project.notes}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
