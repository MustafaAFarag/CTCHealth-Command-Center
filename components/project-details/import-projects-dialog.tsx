"use client";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectCsvImportResult } from "@/lib/actions/projects";

export function ImportProjectsDialog({
  open,
  onOpenChange,
  fileName,
  result,
  isPending,
  onChooseFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  result: ProjectCsvImportResult | null;
  isPending: boolean;
  onChooseFile: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import projects</DialogTitle>
          <DialogDescription>
            {fileName || "Choose a CSV file using the project template."}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div
            className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-4 text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Validating and importing projects…
          </div>
        ) : result?.ok ? (
          <div
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
            role="status"
          >
            {result.data.count} project{result.data.count === 1 ? "" : "s"}{" "}
            imported
          </div>
        ) : result ? (
          <div
            className="max-h-56 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-destructive"
            role="alert"
          >
            <p className="mb-2 font-medium">Nothing was imported.</p>
            <ul className="space-y-1 text-xs">
              {result.errors.map((error, index) => (
                <li key={`${index}-${error}`}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onChooseFile}
          >
            Choose another CSV
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {result?.ok ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
