"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Person } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProject, updateProject } from "@/lib/actions/projects";
import type { ProjectWithRelations } from "@/lib/actions/projects";
import { dateOnlyUTC, deriveProgress } from "@/lib/health";
import { projectInputSchema } from "@/lib/validation";

import { MembersPicker, OwnerPicker } from "./people-picker";

const CATEGORY_OPTIONS = [
  { value: "tech", label: "Tech" },
  { value: "consultancy", label: "Consultancy" },
  { value: "agency", label: "Agency" },
  { value: "agents", label: "Agents" },
] as const;

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

type FormState = {
  name: string;
  client: string;
  category: string;
  status: string;
  priority: string;
  ownerId: string;
  memberIds: string[];
  startDate: string;
  endDate: string;
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

function defaultState(): FormState {
  const today = todayInputValue();
  return {
    name: "",
    client: "",
    category: "tech",
    status: "planning",
    priority: "medium",
    ownerId: "",
    memberIds: [],
    startDate: today,
    endDate: today,
  };
}

function stateFromProject(project: ProjectWithRelations): FormState {
  return {
    name: project.name,
    client: project.client,
    category: project.category,
    status: project.status,
    priority: project.priority,
    ownerId: project.ownerId,
    memberIds: project.members.map((member) => member.personId),
    startDate: toDateInputValue(project.startDate),
    endDate: toDateInputValue(project.endDate),
  };
}

function mapIssues(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in map)) {
      map[key] = issue.message;
    }
  }
  return map;
}

export function DetailsTab({
  project,
  people,
  mode,
  onClose,
}: {
  project: ProjectWithRelations | null;
  people: Person[];
  mode: "new" | "edit";
  onClose: () => void;
}) {
  const [state, setState] = useState<FormState>(() =>
    project ? stateFromProject(project) : defaultState(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [resetSignal, setResetSignal] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const deliverableCount = project?.milestones.length ?? 0;
  const deliverableDoneCount =
    project?.milestones.filter((milestone) => milestone.done).length ?? 0;
  const derivedProgress = deriveProgress(deliverableDoneCount, deliverableCount);

  useEffect(() => {
    if (resetSignal > 0) {
      nameRef.current?.focus();
    }
  }, [resetSignal]);

  function buildPayload(values: FormState) {
    return {
      name: values.name,
      client: values.client,
      category: values.category,
      status: values.status,
      priority: values.priority,
      ownerId: values.ownerId,
      memberIds: values.memberIds,
      startDate: dateOnlyUTC(new Date(values.startDate)),
      endDate: dateOnlyUTC(new Date(values.endDate)),
      // notes intentionally omitted — the Notes tab owns project.notes; a
      // stale copy here would clobber its autosaves.
    };
  }

  function submit(addAnother: boolean) {
    const parsed = projectInputSchema.safeParse(buildPayload(state));
    if (!parsed.success) {
      setErrors(mapIssues(parsed.error.issues));
      return;
    }
    setErrors({});

    startTransition(async () => {
      const result =
        mode === "new"
          ? await createProject(parsed.data)
          : await updateProject(project!.id, project!.version, parsed.data);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "new" ? "Project created." : "Project saved.");

      if (mode === "new" && addAnother) {
        setState(defaultState());
        setErrors({});
        setResetSignal((count) => count + 1);
        return;
      }

      if (mode === "new") {
        // Land on the new project's page so deliverables can be added
        // right away.
        router.push(`/projects/${result.data.id}`);
        return;
      }

      onClose();
    });
  }

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {mode === "edit" && project?.archived ? (
          <Badge variant="secondary">Archived</Badge>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            ref={nameRef}
            autoFocus
            value={state.name}
            disabled={isPending}
            aria-invalid={Boolean(errors.name)}
            onChange={(event) =>
              setState((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          {errors.name ? (
            <p className="text-xs text-destructive">{errors.name}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-client">Client</Label>
          <Input
            id="project-client"
            value={state.client}
            disabled={isPending}
            aria-invalid={Boolean(errors.client)}
            onChange={(event) =>
              setState((prev) => ({ ...prev, client: event.target.value }))
            }
          />
          {errors.client ? (
            <p className="text-xs text-destructive">{errors.client}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={state.category}
              disabled={isPending}
              onValueChange={(value) =>
                setState((prev) => ({ ...prev, category: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={state.priority}
              disabled={isPending}
              onValueChange={(value) =>
                setState((prev) => ({ ...prev, priority: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={state.status}
            disabled={isPending}
            onValueChange={(value) =>
              setState((prev) => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Owner</Label>
          <OwnerPicker
            people={people}
            value={state.ownerId}
            invalid={Boolean(errors.ownerId)}
            onChange={(ownerId) =>
              setState((prev) => ({ ...prev, ownerId }))
            }
          />
          {errors.ownerId ? (
            <p className="text-xs text-destructive">{errors.ownerId}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Team members</Label>
          <MembersPicker
            people={people}
            value={state.memberIds}
            onChange={(memberIds) =>
              setState((prev) => ({ ...prev, memberIds }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-progress">Progress</Label>
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${derivedProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {deliverableCount > 0
                ? `${deliverableDoneCount} of ${deliverableCount} done · ${derivedProgress}% — driven by deliverables`
                : "No deliverables yet — starts at 0%."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="project-start">Start date</Label>
            <Input
              id="project-start"
              type="date"
              value={state.startDate}
              disabled={isPending}
              aria-invalid={Boolean(errors.startDate)}
              onChange={(event) =>
                setState((prev) => ({ ...prev, startDate: event.target.value }))
              }
            />
            {errors.startDate ? (
              <p className="text-xs text-destructive">{errors.startDate}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-end">End date</Label>
            <Input
              id="project-end"
              type="date"
              value={state.endDate}
              disabled={isPending}
              aria-invalid={Boolean(errors.endDate)}
              onChange={(event) =>
                setState((prev) => ({ ...prev, endDate: event.target.value }))
              }
            />
            {errors.endDate ? (
              <p className="text-xs text-destructive">{errors.endDate}</p>
            ) : null}
          </div>
        </div>

      </div>

      <div className="flex justify-end gap-2 border-t bg-muted/30 px-4 py-3">
        {mode === "new" ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => submit(true)}
          >
            Save and add another
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {mode === "new" ? "Create project" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
