"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setArchived } from "@/lib/actions/projects";

import { columns } from "./columns";
import { ProjectsToolbar } from "./toolbar";
import { useProjectsFilters } from "./use-projects-filters";
import type { ProjectRow } from "./types";

export function ProjectsTable({
  rows,
  clientOptions,
  ownerOptions,
  totalCount,
  onRowClick,
  onNewProject,
}: {
  rows: ProjectRow[];
  clientOptions: { value: string; label: string }[];
  ownerOptions: { value: string; label: string }[];
  totalCount: number;
  onRowClick: (id: string) => void;
  onNewProject: () => void;
}) {
  const router = useRouter();
  const {
    filters,
    setSearch,
    toggleFilter,
    clearAll,
    filteredRows,
    hasActiveUrlFilters,
  } = useProjectsFilters(rows, clientOptions, ownerOptions);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "endDate", desc: false },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isArchiving, startArchiving] = useTransition();

  const table = useReactTable<ProjectRow>({
    data: filteredRows,
    columns,
    // Column `size` values are percentage weights (sum 100) — without this,
    // TanStack clamps them all to its default minSize of 20.
    defaultColumn: { minSize: 1 },
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  function archiveSelected() {
    const projects = table.getFilteredSelectedRowModel().rows.map((row) => ({
      id: row.original.id,
      version: row.original.version,
    }));
    if (projects.length === 0) {
      return;
    }
    startArchiving(async () => {
      const result = await setArchived(projects, true);
      if (!result.ok) {
        toast.error(result.error);
        if (result.code === "CONFLICT") {
          setRowSelection({});
          router.refresh();
        }
        return;
      }
      const count = result.data.count;
      toast.success(`${count} archived — view Archived`, {
        action: {
          label: "View Archived",
          onClick: () => router.push("/archived"),
        },
      });
      setRowSelection({});
      router.refresh();
    });
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16">
        <p className="text-sm text-muted-foreground">
          No projects yet — create the first one
        </p>
        <Button size="sm" onClick={onNewProject}>
          New project
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
      <ProjectsToolbar
        filters={filters}
        clientOptions={clientOptions}
        ownerOptions={ownerOptions}
        hasActiveUrlFilters={hasActiveUrlFilters}
        resultCount={filteredRows.length}
        totalCount={totalCount}
        selectedCount={selectedCount}
        archiving={isArchiving}
        onSearchChange={setSearch}
        onToggleFilter={toggleFilter}
        onClearAll={clearAll}
        onNewProject={onNewProject}
        onArchiveSelected={archiveSelected}
      />

      {filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <p className="text-sm text-muted-foreground">Nothing matches</p>
          <Button variant="link" size="sm" onClick={clearAll}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-10"
                      style={{ width: `${header.column.getSize()}%` }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="h-10 cursor-pointer"
                  onClick={() => onRowClick(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
