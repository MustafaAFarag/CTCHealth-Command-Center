import { computeHealth } from "@/lib/health";
import { db } from "@/lib/db";
import { sanitizePerson } from "@/lib/sanitize-person";
import { requireSession } from "@/lib/session";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
  COLUMN_ORDER,
  COLUMN_TITLE,
  type KanbanCardData,
  type KanbanColumnData,
} from "@/components/kanban/types";
import { PeopleFilter } from "@/components/filters/people-filter";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  HEALTH_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  firstSearchParam,
  parseFilterParams,
  type FilterSearchParams,
} from "@/components/filters/parse-filter-params";
import {
  parsePeopleParam,
  personWhereClause,
} from "@/components/filters/parse-people-param";

export const dynamic = "force-dynamic";

export default async function BoardPage({
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
      ...(filters.priority.length > 0
        ? { priority: { in: filters.priority } }
        : {}),
    },
    include: { owner: true },
  });

  const columns: KanbanColumnData[] = COLUMN_ORDER.map((status) => ({
    status,
    title: COLUMN_TITLE[status],
    projects: [],
  }));

  const indexByStatus = new Map(columns.map((c, i) => [c.status, i]));

  for (const project of projects) {
    const health = computeHealth({
      status: project.status,
      endDate: project.endDate,
      progress: project.progress,
    });
    if (filters.health.length > 0 && !filters.health.includes(health)) {
      continue;
    }
    const card: KanbanCardData = {
      id: project.id,
      name: project.name,
      client: project.client,
      status: project.status as KanbanCardData["status"],
      priority: project.priority as KanbanCardData["priority"],
      endDate: project.endDate.toISOString(),
      version: project.version,
      health,
      ownerName: project.owner.name,
    };
    const idx = indexByStatus.get(card.status);
    if (idx !== undefined) {
      columns[idx].projects.push(card);
    }
  }

  for (const column of columns) {
    column.projects.sort((a, b) => a.endDate.localeCompare(b.endDate));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Board</h1>
          <p className="text-xs text-muted-foreground">
            Drag cards between columns to update status
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
      </div>
      <div className="min-h-0 flex-1">
        <KanbanBoard columns={columns} />
      </div>
    </div>
  );
}
