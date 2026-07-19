import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import {
  computeHealth,
  dateOnlyUTC,
  deriveProgress,
  healthLabel,
  type Health,
} from "@/lib/health";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const HEALTH_DOT: Record<Health, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const HEALTH_RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1_000;

export default async function OverviewPage() {
  const session = await requireSession();
  const isDemo = session.isDemo;

  const projects = await db.project.findMany({
    where: isDemo
      ? { archived: false, isDemo: true }
      : {
          archived: false,
          isDemo: false,
          OR: [
            { ownerId: session.personId },
            { members: { some: { personId: session.personId } } },
          ],
        },
    include: { owner: true, milestones: true },
  });

  const today = dateOnlyUTC(new Date());
  const weekFromNow = new Date(today.getTime() + MILLISECONDS_PER_WEEK);

  const rows = projects
    .map((project) => {
      const doneCount = project.milestones.filter((m) => m.done).length;
      const progress = deriveProgress(doneCount, project.milestones.length);
      const nextDeliverable = project.milestones
        .filter((m) => !m.done)
        .sort(
          (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        )[0];
      return {
        id: project.id,
        name: project.name,
        client: project.client,
        status: project.status,
        ownerName: project.owner.name,
        endDate: project.endDate,
        progress,
        health: computeHealth(
          {
            status: project.status,
            endDate: project.endDate,
            progress,
          },
          today,
        ),
        nextDeliverable,
      };
    })
    .sort(
      (a, b) =>
        HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
        a.endDate.getTime() - b.endDate.getTime(),
    );

  const activeCount = rows.filter((row) => row.status === "active").length;
  const atRiskCount = rows.filter((row) => row.health !== "green").length;
  const dueThisWeek = projects
    .filter((project) => project.status !== "completed")
    .flatMap((project) => project.milestones)
    .filter((milestone) => {
      if (milestone.done) {
        return false;
      }
      const due = dateOnlyUTC(milestone.dueDate);
      return due.getTime() >= today.getTime() && due.getTime() < weekFromNow.getTime();
    }).length;
  const inFlight = rows.filter((row) => row.status !== "completed");
  const avgProgress =
    inFlight.length > 0
      ? Math.round(
          inFlight.reduce((sum, row) => sum + row.progress, 0) / inFlight.length,
        )
      : 0;

  const kpis = [
    { label: "Active projects", value: String(activeCount) },
    { label: "At risk", value: String(atRiskCount) },
    { label: "Due this week", value: String(dueThisWeek) },
    { label: "Avg progress", value: `${avgProgress}%` },
  ];

  const criticalRows = rows.filter((row) => row.health !== "green");

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {criticalRows.length} critical of {rows.length} project
          {rows.length === 1 ? "" : "s"}
          {isDemo ? "." : " you own or work on."}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-border px-4 py-3"
          >
            <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-border">
        <h2 className="border-b bg-card px-4 py-2.5 text-sm font-medium">
          Critical projects
        </h2>
        {criticalRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No critical projects — everything you own or work on is on track.
          </p>
        ) : (
          <ul className="divide-y">
            {criticalRows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/projects/${row.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      HEALTH_DOT[row.health],
                    )}
                    title={healthLabel(row.health)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {row.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.client} · {row.ownerName}
                    </span>
                  </span>
                  <span className="hidden w-40 shrink-0 text-xs text-muted-foreground sm:block">
                    {row.nextDeliverable
                      ? `Next: ${row.nextDeliverable.name} · ${dateFormatter.format(new Date(row.nextDeliverable.dueDate))}`
                      : `Ends ${dateFormatter.format(new Date(row.endDate))}`}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Badge>
                  <span className="hidden w-32 shrink-0 items-center gap-2 md:flex">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${row.progress}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {row.progress}%
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
