"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Milestone, Person } from "@prisma/client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "@/lib/actions/milestones";
import { dateOnlyUTC } from "@/lib/health";
import { cn } from "@/lib/utils";

function toDateInputValue(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function AssigneeChip({
  people,
  value,
  onChange,
  disabled,
}: {
  people: Person[];
  value: string;
  onChange: (personId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activePeople = people.filter((person) => person.active);
  const selected = activePeople.find((person) => person.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={selected ? selected.name : "Assign"}
          className="shrink-0 rounded-full disabled:opacity-50"
        >
          <Avatar size="sm">
            <AvatarFallback>
              {selected ? initials(selected.name) : "?"}
            </AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Assign to..." />
          <CommandList>
            <CommandEmpty>No people found.</CommandEmpty>
            <CommandGroup>
              {activePeople.map((person) => (
                <CommandItem
                  key={person.id}
                  value={person.name}
                  data-checked={person.id === value}
                  onSelect={() => {
                    onChange(person.id);
                    setOpen(false);
                  }}
                >
                  {person.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DeliverablesSection({
  projectId,
  ownerId,
  people,
  milestones,
}: {
  projectId: string;
  ownerId: string;
  people: Person[];
  milestones: Milestone[];
}) {
  const sorted = [...milestones].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
  const remaining = sorted.filter((milestone) => !milestone.done);
  const completed = sorted.filter((milestone) => milestone.done);
  const groups = [
    { title: `Remaining (${remaining.length})`, items: remaining },
    { title: `Completed (${completed.length})`, items: completed },
  ].filter((group) => group.items.length > 0);

  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [newAssigneeId, setNewAssigneeId] = useState(ownerId);

  function handleAdd() {
    if (!newName.trim() || !newDate) {
      return;
    }
    startTransition(async () => {
      const result = await createMilestone(projectId, {
        name: newName,
        dueDate: dateOnlyUTC(new Date(newDate)),
        done: false,
        assigneeId: newAssigneeId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setNewName("");
      toast.success("Deliverable added.");
    });
  }

  function handleToggleDone(milestone: Milestone) {
    startTransition(async () => {
      const result = await updateMilestone(milestone.id, milestone.version, {
        name: milestone.name,
        dueDate: milestone.dueDate,
        done: !milestone.done,
        assigneeId: milestone.assigneeId ?? ownerId,
      });
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  function handleAssigneeChange(milestone: Milestone, assigneeId: string) {
    startTransition(async () => {
      const result = await updateMilestone(milestone.id, milestone.version, {
        name: milestone.name,
        dueDate: milestone.dueDate,
        done: milestone.done,
        assigneeId,
      });
      if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(milestone: Milestone) {
    startTransition(async () => {
      const result = await deleteMilestone(milestone.id, milestone.version);
      if (!result.ok) {
        if (result.code === "CONFLICT") {
          toast.error(result.error);
          return;
        }
        toast.error(result.error);
        return;
      }
      toast.success("Deliverable removed.");
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Deliverables</Label>
        <span className="text-xs text-muted-foreground">
          {completed.length}/{milestones.length} done
        </span>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {group.title}
          </p>
          <ul className="space-y-1">
            {group.items.map((milestone) => (
              <li
                key={milestone.id}
                className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
              >
                <Checkbox
                  checked={milestone.done}
                  disabled={isPending}
                  onCheckedChange={() => handleToggleDone(milestone)}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    milestone.done && "text-muted-foreground line-through",
                  )}
                >
                  {milestone.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {toDateInputValue(milestone.dueDate)}
                </span>
                <AssigneeChip
                  people={people}
                  value={milestone.assigneeId ?? ownerId}
                  disabled={isPending}
                  onChange={(assigneeId) =>
                    handleAssigneeChange(milestone, assigneeId)
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isPending}
                  onClick={() => handleDelete(milestone)}
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 />
                  <span className="sr-only">Delete deliverable</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {sorted.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">
          No deliverables yet.
        </p>
      ) : null}

      <div className="flex items-center gap-1.5">
          <Input
            placeholder="Add a deliverable"
            value={newName}
            disabled={isPending}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
            className="h-8 flex-1"
          />
          <Input
            type="date"
            value={newDate}
            disabled={isPending}
            onChange={(event) => setNewDate(event.target.value)}
            className="h-8 w-32"
          />
          <AssigneeChip
            people={people}
            value={newAssigneeId}
            disabled={isPending}
            onChange={setNewAssigneeId}
          />
          <Button
            type="button"
            size="icon-sm"
            disabled={isPending || !newName.trim() || !newDate}
            onClick={handleAdd}
          >
            <Plus />
            <span className="sr-only">Add deliverable</span>
          </Button>
      </div>
    </div>
  );
}
