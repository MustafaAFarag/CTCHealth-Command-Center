import { db } from "@/lib/db";
import { computeHealth, dateOnlyUTC } from "@/lib/health";
import { sanitizePerson } from "@/lib/sanitize-person";
import { requireSession } from "@/lib/session";
import { PeopleFilter } from "@/components/filters/people-filter";
import {
  firstSearchParam,
  parseFilterParams,
  type FilterSearchParams,
} from "@/components/filters/parse-filter-params";
import {
  parsePeopleParam,
  personWhereClause,
} from "@/components/filters/parse-people-param";

import { ProjectsPageClient } from "./projects-page-client";
import type { ProjectRow } from "@/components/projects-table/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<FilterSearchParams>;
}) {
  const params = await searchParams;
  const peopleParam = firstSearchParam(params.people);

  const [activePeopleRaw, allPeopleRaw] = await Promise.all([
    db.person.findMany({
      where: { active: true, isDemo: false },
      orderBy: { name: "asc" },
    }),
    db.person.findMany({ where: { isDemo: false }, orderBy: { name: "asc" } }),
  ]);
  const activePeople = activePeopleRaw.map(sanitizePerson);
  const allPeople = allPeopleRaw.map(sanitizePerson);

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
    where: {
      archived: false,
      isDemo,
      ...personWhereClause(selectedIds),
    },
    select: { client: true },
  });

  const clientOptions = Array.from(
    new Set(unfilteredProjects.map((project) => project.client)),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((client) => ({ value: client, label: client }));

  const filters = parseFilterParams(params, {
    clients: clientOptions.map((option) => option.value),
    ownerIds: allPeople.map((person) => person.id),
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
      ...(filters.category.length > 0
        ? { category: { in: filters.category } }
        : {}),
      ...(filters.owner.length > 0
        ? { ownerId: { in: filters.owner } }
        : {}),
    },
    include: { owner: true },
  });

  const people = allPeople;
  const today = dateOnlyUTC(new Date());

  const rows: ProjectRow[] = projects
    .map((project) => ({
      id: project.id,
      version: project.version,
      name: project.name,
      client: project.client,
      category: project.category,
      status: project.status,
      priority: project.priority,
      ownerId: project.ownerId,
      ownerName: project.owner.name,
      progress: project.progress,
      startDate: project.startDate.toISOString(),
      endDate: project.endDate.toISOString(),
      health: computeHealth(
        {
          status: project.status,
          endDate: project.endDate,
          progress: project.progress,
        },
        today,
      ),
    }))
    .filter(
      (project) =>
        filters.health.length === 0 ||
        filters.health.includes(project.health),
    );

  const ownerOptions = Array.from(
    new Map(people.map((person) => [person.id, person.name])).entries(),
  ).map(([value, label]) => ({ value, label }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} project{rows.length === 1 ? "" : "s"} across the
            portfolio.
          </p>
        </div>
        <PeopleFilter
          people={activePeople}
          selectedIds={selectedIds}
          isAll={isAll}
          sessionPersonId={sessionPersonId}
        />
      </header>

      <ProjectsPageClient
        rows={rows}
        clientOptions={clientOptions}
        ownerOptions={ownerOptions}
        totalCount={unfilteredProjects.length}
        people={people}
      />
    </div>
  );
}
