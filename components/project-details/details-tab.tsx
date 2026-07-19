"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
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
import { dateOnlyUTC } from "@/lib/health";
import { projectCreateSchema, projectInputSchema } from "@/lib/validation";

import { AssigneeChip } from "./deliverables-section";
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

type DeliverableDraft = {
  name: string;
  dueDate: string;
  assigneeId: string;
};

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
  deliverables: DeliverableDraft[];
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

function defaultState(currentPersonId?: string): FormState {
  const today = todayInputValue();
  return {
    name: "",
    client: "",
    category: "tech",
    status: "planning",
    priority: "medium",
    ownerId: currentPersonId ?? "",
    memberIds: [],
    startDate: today,
    endDate: today,
    deliverables: [],
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
    deliverables: [],
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
  currentPersonId,
  mode,
  onClose,
}: {
  project: ProjectWithRelations | null;
  people: Person[];
  currentPersonId?: string;
  mode: "new" | "edit";
  onClose: () => void;
}) {
  const [state, setState] = useState<FormState>(() =>
    project ? stateFromProject(project) : defaultState(currentPersonId),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [resetSignal, setResetSignal] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
      // Deliverables are only collected at creation; the detail page's
      // deliverables section owns them afterwards.
      ...(mode === "new"
        ? {
            deliverables: values.deliverables.map((deliverable) => ({
              name: deliverable.name,
              dueDate: deliverable.dueDate
                ? dateOnlyUTC(new Date(deliverable.dueDate))
                : "",
              ...(deliverable.assigneeId
                ? { assigneeId: deliverable.assigneeId }
                : {}),
            })),
          }
        : {}),
      // notes intentionally omitted — the Notes tab owns project.notes; a
      // stale copy here would clobber its autosaves.
    };
  }

  function submit(addAnother: boolean) {
    const schema = mode === "new" ? projectCreateSchema : projectInputSchema;
    const parsed = schema.safeParse(buildPayload(state));
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
        setState(defaultState(currentPersonId));
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
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
              setState((prev) => ({
                ...prev,
                ownerId,
                memberIds: prev.memberIds.filter((id) => id !== ownerId),
              }))
            }
          />
          {errors.ownerId ? (
            <p className="text-xs text-destructive">{errors.ownerId}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>Team members</Label>
          <MembersPicker
            people={people.filter((person) => person.id !== state.ownerId)}
            value={state.memberIds}
            onChange={(memberIds) =>
              setState((prev) => ({ ...prev, memberIds }))
            }
          />
        </div>

        {mode === "new" ? (
          <div className="space-y-1.5">
            <Label>Deliverables</Label>
            <div className="space-y-2">
              {state.deliverables.map((deliverable, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={deliverable.name}
                    placeholder="Deliverable name"
                    disabled={isPending}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        deliverables: prev.deliverables.map((item, i) =>
                          i === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <Input
                    type="date"
                    className="w-36 shrink-0"
                    value={deliverable.dueDate}
                    disabled={isPending}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        deliverables: prev.deliverables.map((item, i) =>
                          i === index
                            ? { ...item, dueDate: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <AssigneeChip
                    people={people}
                    value={deliverable.assigneeId}
                    disabled={isPending}
                    onChange={(assigneeId) =>
                      setState((prev) => ({
                        ...prev,
                        deliverables: prev.deliverables.map((item, i) =>
                          i === index ? { ...item, assigneeId } : item,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove deliverable"
                    disabled={isPending}
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        deliverables: prev.deliverables.filter(
                          (_, i) => i !== index,
                        ),
                      }))
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    deliverables: [
                      ...prev.deliverables,
                      {
                        name: "",
                        dueDate: prev.endDate,
                        assigneeId: prev.ownerId,
                      },
                    ],
                  }))
                }
              >
                <Plus data-icon="inline-start" />
                Add deliverable
              </Button>
            </div>
            {errors.deliverables ? (
              <p className="text-xs text-destructive">
                Every deliverable needs a name and a due date.
              </p>
            ) : null}
          </div>
        ) : null}

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
