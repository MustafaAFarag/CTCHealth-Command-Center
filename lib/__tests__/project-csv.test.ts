import { describe, expect, it } from "vitest";

import {
  parseProjectCsv,
  PROJECT_CSV_HEADERS,
  resolveProjectCsvPeople,
} from "../project-csv";

const HEADER = PROJECT_CSV_HEADERS.join(",");

describe("parseProjectCsv", () => {
  it("parses quoted commas, escaped quotes, CRLF, empty lists, and trailing lines", () => {
    const result = parseProjectCsv(
      [
        HEADER,
        '"Launch, Wave 2",Aster Health,tech,planning,high,Thomas Mrosk,2026-08-01,2026-11-30,"Eman Osama;Manuel Mitola","Discovery ""approved""|2026-08-15;Launch|2026-11-15"',
        "Research sprint,Helix,consultancy,on_hold,medium,Eman Osama,2026-09-01,2026-09-01,,",
        "",
        "",
      ].join("\r\n"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      rowNumber: 2,
      name: "Launch, Wave 2",
      memberNames: ["Eman Osama", "Manuel Mitola"],
    });
    expect(result.data[0].deliverables.map((item) => item.name)).toEqual([
      'Discovery "approved"',
      "Launch",
    ]);
    expect(result.data[1].memberNames).toEqual([]);
    expect(result.data[1].deliverables).toEqual([]);
  });

  it("returns row-specific validation errors for every invalid row", () => {
    const result = parseProjectCsv(
      [
        HEADER,
        "Bad dates,Client,invalid,active,urgent,Owner,2026-02-30,2026-01-01,,Broken deliverable",
        "Missing owner,Client,tech,planning,low,,2026-01-01,2026-02-01,Person A;;Person B,Report|not-a-date",
      ].join("\n"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.startsWith("Row 2:"))).toBe(true);
    expect(result.errors.some((error) => error.startsWith("Row 3:"))).toBe(true);
    expect(result.errors).toContain(
      "Row 2: category must be one of tech|consultancy|agency|agents.",
    );
    expect(result.errors).toContain(
      'Row 2: deliverable 1 must use "Deliverable name|YYYY-MM-DD" format.',
    );
  });

  it("rejects the wrong columns and malformed quoted fields", () => {
    const wrongHeader = parseProjectCsv("name,client\nOne,Two");
    expect(wrongHeader).toEqual({
      ok: false,
      errors: [`Row 1: columns must be exactly ${HEADER}.`],
    });

    const malformed = parseProjectCsv(`${HEADER}\n"Unclosed,Client`);
    expect(malformed).toEqual({
      ok: false,
      errors: ["Row 2: quoted field is not closed."],
    });
  });
});

describe("resolveProjectCsvPeople", () => {
  it("matches names case-insensitively and de-duplicates members", () => {
    const parsed = parseProjectCsv(
      `${HEADER}\nProject,Client,agents,active,medium,THOMAS MROSK,2026-01-01,2026-02-01,eman osama;Eman Osama,`,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = resolveProjectCsvPeople(parsed.data, [
      { id: "owner-id", name: "Thomas Mrosk" },
      { id: "member-id", name: "Eman Osama" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      ownerId: "owner-id",
      memberIds: ["member-id"],
    });
  });

  it("returns row-specific errors for unknown people", () => {
    const parsed = parseProjectCsv(
      `${HEADER}\nProject,Client,agency,completed,low,Unknown Owner,2026-01-01,2026-02-01,Unknown Member,`,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = resolveProjectCsvPeople(parsed.data, []);
    expect(result).toEqual({
      ok: false,
      errors: [
        'Row 2: owner "Unknown Owner" does not match an existing person.',
        'Row 2: member "Unknown Member" does not match an existing person.',
      ],
    });
  });
});
