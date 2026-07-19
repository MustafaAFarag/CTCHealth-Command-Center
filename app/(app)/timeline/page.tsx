import { db } from "@/lib/db";
import { sanitizePerson } from "@/lib/sanitize-person";
import { computeHealth, dateOnlyUTC } from "@/lib/health";
import { requireSession } from "@/lib/session";
import {
  GanttChart,
  type GanttRow,
} from "@/components/gantt/gantt-chart";
import { PeopleFilter } from "@/components/filters/people-filter";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  HEALTH_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  firstSearchParam,
  parseFilterParams,
  type FilterSearchParams,
} from "@/components/filters/parse-filter-params";
import {
  parsePeopleParam,
  personWhereClause,
} from "@/components/filters/parse-people-param";

export const dynamic = "force-dynamic";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<FilterSearchParams>;
}) {
  const params = await searchParams;
  const peopleParam = firstSearchParam(params.people);

  const activePeople = (
    await db.person.findMany({
      where: { active: true, isDemo: false },
      orderBy: { name: "asc" },
    })
  ).map(sanitizePerson);

  const session = await requireSession();
  const isDemo = session.isDemo;
  const sessionPersonId = session.personId;
  const effectivePeopleParam = peopleParam ?? (isDemo ? "all" : undefined);
  const { ids: selectedIds, isAll } = parsePeopleParam(
    effectivePeopleParam,
    activePeople.map((p) => p.id),
    sessionPersonId,
  );

  const unfilteredProjects = await db.project.findMany({
    where: { archived: false, isDemo, ...personWhereClause(selectedIds) },
    select: { client: true },
  });
  const clientOptions = Array.from(
    new Set(unfilteredProjects.map((project) => project.client)),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((client) => ({ value: client, label: client }));
  const filters = parseFilterParams(params, {
    clients: clientOptions.map((option) => option.value),
  });

  const projects = await db.project.findMany({
    where: {
      archived: false,
      isDemo,
      ...personWhereClause(selectedIds),
      ...(filters.client.length > 0
        ? { client: { in: filters.client } }
        : {}),
      ...(filters.status.length > 0
        ? { status: { in: filters.status } }
        : {}),
      ...(filters.priority.length > 0
        ? { priority: { in: filters.priority } }
        : {}),
    },
    include: { owner: true, milestones: true },
    orderBy: { endDate: "asc" },
  });

  const today = dateOnlyUTC(new Date());

  const rows: GanttRow[] = projects
    .slice()
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
    .map((project) => ({
      id: project.id,
      name: project.name,
      client: project.client,
      ownerName: project.owner.name,
      status: project.status,
      startDate: project.startDate.toISOString(),
      endDate: project.endDate.toISOString(),
      progress: project.progress,
      health: computeHealth(
        {
          status: project.status,
          endDate: project.endDate,
          progress: project.progress,
        },
        today,
      ),
      milestones: project.milestones.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        done: milestone.done,
        dueDate: milestone.dueDate.toISOString(),
      })),
    }))
    .filter(
      (project) =>
        filters.health.length === 0 ||
        filters.health.includes(project.health),
    );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
          <p className="text-sm text-muted-foreground">
            Portfolio Gantt across {rows.length} active project
            {rows.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PeopleFilter
            people={activePeople}
            selectedIds={selectedIds}
            isAll={isAll}
            sessionPersonId={sessionPersonId}
          />
          <FilterBar
            filters={[
              {
                key: "client",
                label: "Client",
                options: clientOptions,
                selected: filters.client,
                searchable: clientOptions.length > 10,
              },
              {
                key: "status",
                label: "Status",
                options: STATUS_FILTER_OPTIONS.map((option) => ({ ...option })),
                selected: filters.status,
              },
              {
                key: "priority",
                label: "Priority",
                options: PRIORITY_FILTER_OPTIONS.map((option) => ({
                  ...option,
                })),
                selected: filters.priority,
              },
              {
                key: "health",
                label: "Health",
                options: HEALTH_FILTER_OPTIONS.map((option) => ({
                  ...option,
                })),
                selected: filters.health,
              },
            ]}
          />
        </div>
      </header>
      <GanttChart rows={rows} />
    </div>
  );
}
