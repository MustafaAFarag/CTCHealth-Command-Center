"use client";

import type { Person } from "@prisma/client";

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
  currentPersonId,
  open,
  onOpenChange,
}: {
  people: Person[];
  currentPersonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DetailsTab
            key={open ? "open" : "closed"}
            project={null}
            people={people}
            currentPersonId={currentPersonId}
            mode="new"
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
