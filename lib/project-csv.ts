import { z } from "zod";

import {
  projectCategorySchema,
  projectPrioritySchema,
  projectStatusSchema,
} from "./validation";

export const PROJECT_CSV_HEADERS = [
  "name",
  "client",
  "category",
  "status",
  "priority",
  "owner",
  "startDate",
  "endDate",
  "members",
  "deliverables",
] as const;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const csvDateSchema = z
  .string()
  .trim()
  .refine((value) => parseDateOnly(value) !== null, {
    message: "must be a valid date in YYYY-MM-DD format.",
  });

const csvProjectRowSchema = z
  .object({
    name: z.string().trim().min(1, "is required.").max(200, "must be 200 characters or fewer."),
    client: z.string().trim().min(1, "is required."),
    category: projectCategorySchema,
    status: projectStatusSchema,
    priority: projectPrioritySchema,
    owner: z.string().trim().min(1, "is required."),
    startDate: csvDateSchema,
    endDate: csvDateSchema,
    members: z.string(),
    deliverables: z.string(),
  })
  .superRefine((row, context) => {
    const startDate = parseDateOnly(row.startDate);
    const endDate = parseDateOnly(row.endDate);
    if (startDate && endDate && endDate < startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "must be on or after startDate.",
      });
    }
  });

export type ProjectCsvDeliverable = {
  name: string;
  dueDate: Date;
};

export type ProjectCsvRow = {
  rowNumber: number;
  name: string;
  client: string;
  category: z.infer<typeof projectCategorySchema>;
  status: z.infer<typeof projectStatusSchema>;
  priority: z.infer<typeof projectPrioritySchema>;
  ownerName: string;
  startDate: Date;
  endDate: Date;
  memberNames: string[];
  deliverables: ProjectCsvDeliverable[];
};

export type ResolvedProjectCsvRow = ProjectCsvRow & {
  ownerId: string;
  memberIds: string[];
};

type CsvResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] };

type CsvRecordParseResult =
  | { ok: true; records: string[][] }
  | { ok: false; rowNumber: number; message: string };

function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function parseCsvRecords(input: string): CsvRecordParseResult {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  function finishField() {
    record.push(field);
    field = "";
    quoteClosed = false;
  }

  function finishRecord() {
    finishField();
    records.push(record);
    record = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else if (character === "\r") {
        field += "\n";
        if (text[index + 1] === "\n") {
          index += 1;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed) {
      if (character === ",") {
        finishField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
        finishRecord();
      } else if (character !== " " && character !== "\t") {
        return {
          ok: false,
          rowNumber: records.length + 1,
          message: "unexpected character after a closing quote.",
        };
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        return {
          ok: false,
          rowNumber: records.length + 1,
          message: "unexpected quote in an unquoted field.",
        };
      }
      inQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      finishRecord();
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    return {
      ok: false,
      rowNumber: records.length + 1,
      message: "quoted field is not closed.",
    };
  }

  if (record.length > 0 || field.length > 0 || quoteClosed) {
    finishRecord();
  }

  while (
    records.length > 0 &&
    records.at(-1)?.every((value) => value.trim().length === 0)
  ) {
    records.pop();
  }

  return { ok: true, records };
}

function zodIssueMessage(issue: z.core.$ZodIssue): string {
  const field = String(issue.path[0] ?? "row");
  if (field === "category") {
    return "category must be one of tech|consultancy|agency|agents.";
  }
  if (field === "status") {
    return "status must be one of planning|active|on_hold|completed.";
  }
  if (field === "priority") {
    return "priority must be one of high|medium|low.";
  }
  return `${field} ${issue.message}`;
}

function parseMemberNames(
  value: string,
  rowNumber: number,
  errors: string[],
): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  const names = value.split(";").map((name) => name.trim());
  if (names.some((name) => name.length === 0)) {
    errors.push(
      `Row ${rowNumber}: members must be semicolon-separated person names without empty entries.`,
    );
  }
  return names.filter((name) => name.length > 0);
}

function parseDeliverables(
  value: string,
  rowNumber: number,
  errors: string[],
): ProjectCsvDeliverable[] {
  if (value.trim().length === 0) {
    return [];
  }

  const deliverables: ProjectCsvDeliverable[] = [];
  for (const [index, item] of value.split(";").entries()) {
    const parts = item.split("|");
    if (parts.length !== 2) {
      errors.push(
        `Row ${rowNumber}: deliverable ${index + 1} must use "Deliverable name|YYYY-MM-DD" format.`,
      );
      continue;
    }

    const name = parts[0]?.trim() ?? "";
    const dueDateText = parts[1]?.trim() ?? "";
    const dueDate = parseDateOnly(dueDateText);
    if (name.length === 0) {
      errors.push(`Row ${rowNumber}: deliverable ${index + 1} name is required.`);
    } else if (name.length > 200) {
      errors.push(
        `Row ${rowNumber}: deliverable ${index + 1} name must be 200 characters or fewer.`,
      );
    }
    if (!dueDate) {
      errors.push(
        `Row ${rowNumber}: deliverable ${index + 1} due date must be a valid date in YYYY-MM-DD format.`,
      );
    }

    if (name.length > 0 && name.length <= 200 && dueDate) {
      deliverables.push({ name, dueDate });
    }
  }
  return deliverables;
}

export function parseProjectCsv(input: string): CsvResult<ProjectCsvRow[]> {
  const parsedCsv = parseCsvRecords(input);
  if (!parsedCsv.ok) {
    return {
      ok: false,
      errors: [`Row ${parsedCsv.rowNumber}: ${parsedCsv.message}`],
    };
  }

  const [headerRecord, ...dataRecords] = parsedCsv.records;
  if (!headerRecord) {
    return { ok: false, errors: ["Row 1: CSV header is required."] };
  }

  const headers = headerRecord.map((header) => header.trim());
  if (
    headers.length !== PROJECT_CSV_HEADERS.length ||
    headers.some((header, index) => header !== PROJECT_CSV_HEADERS[index])
  ) {
    return {
      ok: false,
      errors: [
        `Row 1: columns must be exactly ${PROJECT_CSV_HEADERS.join(",")}.`,
      ],
    };
  }

  if (dataRecords.length === 0) {
    return { ok: false, errors: ["Row 2: add at least one project."] };
  }

  const errors: string[] = [];
  const projects: ProjectCsvRow[] = [];

  for (const [index, record] of dataRecords.entries()) {
    const rowNumber = index + 2;
    if (record.length !== PROJECT_CSV_HEADERS.length) {
      errors.push(
        `Row ${rowNumber}: expected ${PROJECT_CSV_HEADERS.length} columns but found ${record.length}.`,
      );
      continue;
    }

    const rawRow = Object.fromEntries(
      PROJECT_CSV_HEADERS.map((header, columnIndex) => [
        header,
        record[columnIndex]?.trim() ?? "",
      ]),
    );
    const parsedRow = csvProjectRowSchema.safeParse(rawRow);
    if (!parsedRow.success) {
      errors.push(
        ...parsedRow.error.issues.map(
          (issue) => `Row ${rowNumber}: ${zodIssueMessage(issue)}`,
        ),
      );
    }

    const memberNames = parseMemberNames(rawRow.members, rowNumber, errors);
    const deliverables = parseDeliverables(
      rawRow.deliverables,
      rowNumber,
      errors,
    );

    if (!parsedRow.success) {
      continue;
    }

    const startDate = parseDateOnly(parsedRow.data.startDate);
    const endDate = parseDateOnly(parsedRow.data.endDate);
    if (!startDate || !endDate) {
      continue;
    }

    const rowHasErrors = errors.some((error) =>
      error.startsWith(`Row ${rowNumber}:`),
    );
    if (!rowHasErrors) {
      projects.push({
        rowNumber,
        name: parsedRow.data.name,
        client: parsedRow.data.client,
        category: parsedRow.data.category,
        status: parsedRow.data.status,
        priority: parsedRow.data.priority,
        ownerName: parsedRow.data.owner,
        startDate,
        endDate,
        memberNames,
        deliverables,
      });
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: projects };
}

export function resolveProjectCsvPeople(
  projects: ProjectCsvRow[],
  people: { id: string; name: string }[],
): CsvResult<ResolvedProjectCsvRow[]> {
  const peopleByName = new Map<string, { id: string; name: string }[]>();
  for (const person of people) {
    const key = person.name.trim().toLocaleLowerCase();
    peopleByName.set(key, [...(peopleByName.get(key) ?? []), person]);
  }

  const errors: string[] = [];
  const resolved: ResolvedProjectCsvRow[] = [];

  for (const project of projects) {
    const ownerMatches = peopleByName.get(
      project.ownerName.trim().toLocaleLowerCase(),
    );
    if (!ownerMatches || ownerMatches.length === 0) {
      errors.push(
        `Row ${project.rowNumber}: owner "${project.ownerName}" does not match an existing person.`,
      );
    } else if (ownerMatches.length > 1) {
      errors.push(
        `Row ${project.rowNumber}: owner "${project.ownerName}" matches multiple people.`,
      );
    }

    const memberIds: string[] = [];
    for (const memberName of project.memberNames) {
      const memberMatches = peopleByName.get(
        memberName.trim().toLocaleLowerCase(),
      );
      if (!memberMatches || memberMatches.length === 0) {
        errors.push(
          `Row ${project.rowNumber}: member "${memberName}" does not match an existing person.`,
        );
      } else if (memberMatches.length > 1) {
        errors.push(
          `Row ${project.rowNumber}: member "${memberName}" matches multiple people.`,
        );
      } else {
        memberIds.push(memberMatches[0].id);
      }
    }

    if (ownerMatches?.length === 1) {
      resolved.push({
        ...project,
        ownerId: ownerMatches[0].id,
        memberIds: Array.from(new Set(memberIds)),
      });
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: resolved };
}
