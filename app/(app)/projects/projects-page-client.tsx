"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Person } from "@prisma/client";

import { ImportProjectsDialog } from "@/components/project-details/import-projects-dialog";
import { NewProjectDialog } from "@/components/project-details/new-project-dialog";
import { ProjectsTable } from "@/components/projects-table/projects-table";
import type { ProjectRow } from "@/components/projects-table/types";
import {
  importProjectsCsv,
  type ProjectCsvImportResult,
} from "@/lib/actions/projects";

const PROJECT_CSV_TEMPLATE = `name,client,category,status,priority,owner,startDate,endDate,members,deliverables
"Patient Portal Refresh","Northstar Biotech",tech,planning,high,"Thomas Mrosk",2026-08-01,2026-11-30,"Eman Osama;Manuel Mitola","Discovery approved|2026-08-15;Launch readiness|2026-11-15"
"Regional Launch, Wave 2","Aster Health",consultancy,on_hold,medium,"Eman Osama",2026-09-01,2027-01-15,,"Research report|2026-10-10"
`;

export function ProjectsPageClient({
  rows,
  clientOptions,
  ownerOptions,
  totalCount,
  people,
}: {
  rows: ProjectRow[];
  clientOptions: { value: string; label: string }[];
  ownerOptions: { value: string; label: string }[];
  totalCount: number;
  people: Person[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] =
    useState<ProjectCsvImportResult | null>(null);
  const [isImporting, startImport] = useTransition();

  function downloadCsvTemplate() {
    const blob = new Blob([PROJECT_CSV_TEMPLATE], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ctchealth-projects-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function chooseCsvFile() {
    fileInputRef.current?.click();
  }

  function importCsvFile(file: File) {
    setImportFileName(file.name);
    setImportResult(null);
    setImportOpen(true);

    const MAX_CSV_BYTES = 1_048_576;
    if (file.size > MAX_CSV_BYTES) {
      setImportResult({
        ok: false,
        code: "VALIDATION",
        error: "CSV file is too large.",
        errors: [
          `CSV file is too large — keep it under 1 MB (received ${file.size} bytes).`,
        ],
      });
      return;
    }

    startImport(async () => {
      try {
        const csvText = await file.text();
        const result = await importProjectsCsv(csvText);
        setImportResult(result);
        if (result.ok) {
          router.refresh();
        }
      } catch {
        setImportResult({
          ok: false,
          code: "ERROR",
          error: "Could not read or import the selected file.",
          errors: ["Could not read or import the selected file."],
        });
      }
    });
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            importCsvFile(file);
          }
        }}
      />
      <ProjectsTable
        rows={rows}
        clientOptions={clientOptions}
        ownerOptions={ownerOptions}
        totalCount={totalCount}
        onRowClick={(id) => router.push(`/projects/${id}`)}
        onNewProject={() => setNewOpen(true)}
        onDownloadCsvTemplate={downloadCsvTemplate}
        onImportCsv={chooseCsvFile}
      />
      <NewProjectDialog
        people={people}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
      <ImportProjectsDialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!isImporting) {
            setImportOpen(open);
          }
        }}
        fileName={importFileName}
        result={importResult}
        isPending={isImporting}
        onChooseFile={chooseCsvFile}
      />
    </>
  );
}
