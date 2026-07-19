import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Person, Prisma } from "@prisma/client";

import { db } from "../lib/db";
import { dateOnlyUTC } from "../lib/health";
import { generatePassword, hashPassword } from "../lib/password";
import { assertProjectSeedAllowed } from "./seed-guard";

const SEED_TODAY = dateOnlyUTC(new Date("2026-07-19T00:00:00.000Z"));

const LOGIN_PERSONAS = [
  "Thomas Mrosk",
  "Eman Osama",
  "Manuel Mitola",
  "Nataliya Boyko",
  "Torben Guijarro",
  "Mai Ibrahim",
] as const;

const ADMIN_NAME = "Mustafa Ashraf";
const DEMO_NAME = "Demo";

const CATEGORIES = ["tech", "consultancy", "agency", "agents"] as const;
const STATUSES = ["planning", "active", "on_hold", "completed"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

const CLIENTS = [
  "Northstar Biotech",
  "Helix Therapeutics",
  "Aster Health",
  "Meridian Pharma",
  "Vantage Medical",
  "Orion Life Sciences",
  "Lumina Diagnostics",
  "Summit Oncology",
  "Cedar Clinical",
  "Bluebird Health",
  "Atlas Research",
  "NovaCare",
] as const;

const INITIATIVES = [
  "Portfolio command center",
  "Launch readiness program",
  "Clinical engagement strategy",
  "Medical education platform",
  "Field enablement rollout",
  "Evidence generation roadmap",
  "Patient support redesign",
  "Omnichannel content program",
  "Market access workshop",
  "Scientific communications hub",
  "Digital operations upgrade",
  "Regional advisory board",
  "Brand planning sprint",
] as const;

const DELIVERABLES = [
  "discovery and alignment",
  "pilot implementation",
  "regional rollout",
  "measurement framework",
  "content production",
] as const;

const SPECIAL_END_OFFSETS = [-30, -10, -1, 0, 1, 1, 7, 14, 14, 30, 30, 31];
const ARCHIVED_INDEXES = new Set([7, 15, 23, 31, 39, 47, 55, 63]);

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return dateOnlyUTC(result);
}

function projectName(index: number): string {
  if (index === 10) {
    return "Enterprise-wide medical communications transformation and cross-functional launch readiness program";
  }

  if (index === 11) {
    return "Integrated multi-market patient engagement ecosystem modernization and operating model rollout";
  }

  return `${INITIATIVES[index % INITIATIVES.length]} — ${DELIVERABLES[index % DELIVERABLES.length]} ${String(index + 1).padStart(2, "0")}`;
}

function endOffsetFor(index: number): number {
  return SPECIAL_END_OFFSETS[index] ?? 45 + ((index * 17) % 720);
}

function startOffsetFor(index: number, endOffset: number): number {
  if (index === 8) {
    return -740;
  }

  if (index === 9) {
    return -1_100;
  }

  return Math.min(-7 - ((index * 13) % 180), endOffset - 14);
}

function membersFor(
  index: number,
  ownerId: string,
  people: Person[],
): string[] {
  const memberCount = index % 5;
  const candidates = people.filter((person) => person.id !== ownerId);

  return Array.from(
    { length: memberCount },
    (_, offset) => candidates[(index + offset) % candidates.length].id,
  );
}

function milestonesFor(
  index: number,
  startOffset: number,
  endOffset: number,
  updaterId: string,
  ownerId: string,
  memberIds: string[],
): Prisma.MilestoneCreateWithoutProjectInput[] {
  const milestoneCount = index % 6;
  const span = endOffset - startOffset;
  const assigneeCandidates = [ownerId, ...memberIds];

  return Array.from({ length: milestoneCount }, (_, milestoneIndex) => {
    const dueOffset = Math.round(
      startOffset + (span * (milestoneIndex + 1)) / (milestoneCount + 1),
    );
    const assigneeId =
      assigneeCandidates[
        (index + milestoneIndex) % assigneeCandidates.length
      ];

    return {
      name: `Milestone ${milestoneIndex + 1}: ${DELIVERABLES[(index + milestoneIndex) % DELIVERABLES.length]}`,
      dueDate: addUtcDays(SEED_TODAY, dueOffset),
      done: (index + milestoneIndex) % 3 === 0,
      assignee: { connect: { id: assigneeId } },
      version: 1,
      createdAt: SEED_TODAY,
      updatedAt: SEED_TODAY,
      updatedBy: { connect: { id: updaterId } },
    };
  });
}

async function upsertPeople(): Promise<Person[]> {
  return Promise.all(
    [...LOGIN_PERSONAS, ADMIN_NAME].map((name) =>
      db.person.upsert({
        where: { name },
        update: {
          active: true,
          canLogin: true,
          isAdmin: name === ADMIN_NAME,
        },
        create: {
          name,
          active: true,
          canLogin: true,
          isAdmin: name === ADMIN_NAME,
          createdAt: SEED_TODAY,
        },
      }),
    ),
  );
}

async function upsertDemoPerson(): Promise<Person> {
  const passwordHash = await hashPassword(generatePassword());

  return db.person.upsert({
    where: { name: DEMO_NAME },
    update: {
      active: true,
      canLogin: true,
      isAdmin: false,
      isDemo: true,
      mustChangePassword: false,
    },
    create: {
      name: DEMO_NAME,
      active: true,
      canLogin: true,
      isAdmin: false,
      isDemo: true,
      mustChangePassword: false,
      passwordHash,
      createdAt: SEED_TODAY,
    },
  });
}

async function bootstrapPasswords(): Promise<void> {
  const passwordFile = path.resolve(
    process.cwd(),
    "prisma",
    "first-passwords.txt",
  );
  const people = await db.person.findMany({
    where: { passwordHash: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const batch = await Promise.all(
    people.map(async (person) => {
      const password = generatePassword();
      return {
        ...person,
        password,
        passwordHash: await hashPassword(password),
      };
    }),
  );

  if (batch.length > 0) {
    await writeFile(
      passwordFile,
      `${batch.map((person) => `${person.name}: ${person.password}`).join("\n")}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(passwordFile, 0o600).catch(() => undefined);
  }

  if (batch.length > 0) {
    await db.$transaction(
      batch.map((person) =>
        db.person.update({
          where: { id: person.id },
          data: {
            passwordHash: person.passwordHash,
            mustChangePassword: true,
          },
        }),
      ),
    );
  }

  console.log(
    `Wrote ${batch.length} first-time password${batch.length === 1 ? "" : "s"} to ${passwordFile}.`,
  );
}

function progressFromMilestones(
  milestones: Prisma.MilestoneCreateWithoutProjectInput[],
): number | null {
  if (milestones.length === 0) {
    return null;
  }

  const doneCount = milestones.filter((milestone) => milestone.done).length;
  return Math.round((100 * doneCount) / milestones.length);
}

function projectDataFor(index: number, people: Person[]): Prisma.ProjectCreateInput {
  const owner = people[index % people.length];
  const updater = people[index % people.length];
  const endOffset = endOffsetFor(index);
  const startOffset = startOffsetFor(index, endOffset);
  const memberIds = membersFor(index, owner.id, people);
  const milestones = milestonesFor(
    index,
    startOffset,
    endOffset,
    updater.id,
    owner.id,
    memberIds,
  );
  const progress = progressFromMilestones(milestones) ?? 0;

  return {
    name: projectName(index),
    client: CLIENTS[index % CLIENTS.length],
    category: CATEGORIES[index % CATEGORIES.length],
    status: index < SPECIAL_END_OFFSETS.length ? "active" : STATUSES[index % STATUSES.length],
    priority: PRIORITIES[index % PRIORITIES.length],
    isDemo: true,
    owner: { connect: { id: owner.id } },
    progress,
    archived: ARCHIVED_INDEXES.has(index),
    startDate: addUtcDays(SEED_TODAY, startOffset),
    endDate: addUtcDays(SEED_TODAY, endOffset),
    notes:
      index % 4 === 0
        ? JSON.stringify({
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: `Synthetic planning notes for project ${index + 1}.`,
                  },
                ],
              },
            ],
          })
        : null,
    version: 1,
    createdAt: SEED_TODAY,
    createdBy: { connect: { id: updater.id } },
    updatedAt: SEED_TODAY,
    updatedBy: { connect: { id: updater.id } },
    members: {
      create: memberIds.map((personId) => ({
        person: { connect: { id: personId } },
      })),
    },
    milestones: {
      create: milestones,
    },
  };
}

async function main(): Promise<void> {
  const allPeople = await upsertPeople();
  await upsertDemoPerson();
  await bootstrapPasswords();

  const people = allPeople.slice(0, LOGIN_PERSONAS.length);
  const existingProjectCount = await db.project.count();
  assertProjectSeedAllowed(existingProjectCount);

  const projects = Array.from({ length: 65 }, (_, index) =>
    projectDataFor(index, people),
  );

  await db.$transaction(async (transaction) => {
    await transaction.project.deleteMany();

    for (const data of projects) {
      await transaction.project.create({ data });
    }
  });

  const [projectCount, archivedCount, milestoneCount, memberCount] =
    await Promise.all([
      db.project.count(),
      db.project.count({ where: { archived: true } }),
      db.milestone.count(),
      db.projectMember.count(),
    ]);

  if (projectCount !== 65 || archivedCount !== 8) {
    throw new Error(
      `Seed verification failed: expected 65 projects and 8 archived, got ${projectCount} and ${archivedCount}.`,
    );
  }

  console.log(
    `Seeded ${allPeople.length} people, ${projectCount} projects (${archivedCount} archived), ${milestoneCount} milestones, and ${memberCount} memberships.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
