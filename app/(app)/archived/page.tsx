import { db } from "@/lib/db";
import { sanitizePerson } from "@/lib/sanitize-person";
import { requireSession } from "@/lib/session";
import {
  ArchivedProjectsTable,
  type ArchivedProjectRow,
} from "@/app/(app)/archived/archived-projects-table";
import { PeopleFilter } from "@/components/filters/people-filter";
import { FilterBar } from "@/components/filters/filter-bar";
import {
  firstSearchParam,
  parseFilterParams,
  type FilterSearchParams,
} from "@/components/filters/parse-filter-params";
import {
  parsePeopleParam,
  personWhereClause,
} from "@/components/filters/parse-people-param";

export const dynamic = "force-dynamic";

const dateLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function ArchivedPage({
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
    where: { archived: true, isDemo, ...personWhereClause(selectedIds) },
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
      archived: true,
      isDemo,
      ...personWhereClause(selectedIds),
      ...(filters.client.length > 0
        ? { client: { in: filters.client } }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      version: true,
      name: true,
      client: true,
      category: true,
      startDate: true,
      endDate: true,
      owner: { select: { name: true } },
    },
  });

  const rows: ArchivedProjectRow[] = projects.map((project) => ({
    id: project.id,
    version: project.version,
    name: project.name,
    client: project.client,
    category: project.category,
    ownerName: project.owner.name,
    startDateLabel: dateLabel.format(project.startDate),
    endDateLabel: dateLabel.format(project.endDate),
  }));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Archived projects
          </h1>
          <p className="text-sm text-muted-foreground">
            Review archived work or return projects to the active portfolio.
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
            ]}
          />
        </div>
      </header>
      <ArchivedProjectsTable projects={rows} />
    </div>
  );
}
