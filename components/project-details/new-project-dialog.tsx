"use client";

import type { Person } from "@prisma/client";
import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { DetailsTab } from "./details-tab";

export function NewProjectDialog({
  people,
  open,
  onOpenChange,
  onDownloadCsvTemplate,
  onImportCsv,
}: {
  people: Person[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloadCsvTemplate: () => void;
  onImportCsv: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>New project</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new project
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DetailsTab
            key={open ? "open" : "closed"}
            project={null}
            people={people}
            mode="new"
            onClose={() => onOpenChange(false)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Adding many? Fill the CSV template and import it.
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onDownloadCsvTemplate}>
              <Download data-icon="inline-start" />
              CSV template
            </Button>
            <Button variant="outline" size="sm" onClick={onImportCsv}>
              <Upload data-icon="inline-start" />
              Import CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
