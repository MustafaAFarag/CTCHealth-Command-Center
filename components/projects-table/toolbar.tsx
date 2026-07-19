"use client";

import { Archive, Plus, Search, X } from "lucide-react";

import { FilterDropdown } from "@/components/filters/filter-dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { healthLabel } from "@/lib/health";
import { cn } from "@/lib/utils";

import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
} from "./chip-maps";
import type { ProjectFilters, FilterKey } from "./use-projects-filters";

const HEALTH_OPTIONS = ["green", "amber", "red"] as const;

export function ProjectsToolbar({
  filters,
  clientOptions,
  ownerOptions,
  hasActiveUrlFilters,
  resultCount,
  totalCount,
  selectedCount,
  archiving,
  onSearchChange,
  onToggleFilter,
  onClearAll,
  onNewProject,
  onArchiveSelected,
}: {
  filters: ProjectFilters;
  clientOptions: { value: string; label: string }[];
  ownerOptions: { value: string; label: string }[];
  hasActiveUrlFilters: boolean;
  resultCount: number;
  totalCount: number;
  selectedCount: number;
  archiving: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilter: (key: FilterKey, value: string) => void;
  onClearAll: () => void;
  onNewProject: () => void;
  onArchiveSelected: () => void;
}) {
  const activeChips: { key: FilterKey; value: string; label: string }[] = [
    ...filters.client.map((value) => ({
      key: "client" as const,
      value,
      label: clientOptions.find((o) => o.value === value)?.label ?? value,
    })),
    ...filters.owner.map((value) => ({
      key: "owner" as const,
      value,
      label: ownerOptions.find((o) => o.value === value)?.label ?? value,
    })),
    ...filters.category.map((value) => ({
      key: "category" as const,
      value,
      label: CATEGORY_LABEL[value] ?? value,
    })),
    ...filters.status.map((value) => ({
      key: "status" as const,
      value,
      label: STATUS_LABEL[value] ?? value,
    })),
    ...filters.priority.map((value) => ({
      key: "priority" as const,
      value,
      label: PRIORITY_LABEL[value] ?? value,
    })),
    ...filters.health.map((value) => ({
      key: "health" as const,
      value,
      label: healthLabel(value as "green" | "amber" | "red"),
    })),
  ];

  const hasActiveFilters =
    hasActiveUrlFilters || activeChips.length > 0 || filters.search.length > 0;

  return (
    <div className="flex flex-col gap-2 border-b bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search name or client"
              className="pl-8"
            />
          </div>
          <FilterDropdown
            label="Client"
            options={clientOptions}
            selected={filters.client}
            searchable={clientOptions.length > 10}
            onToggle={(value) => onToggleFilter("client", value)}
          />
          <FilterDropdown
            label="Owner"
            options={ownerOptions}
            selected={filters.owner}
            onToggle={(value) => onToggleFilter("owner", value)}
          />
          <FilterDropdown
            label="Category"
            options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            selected={filters.category}
            onToggle={(value) => onToggleFilter("category", value)}
          />
          <FilterDropdown
            label="Status"
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            selected={filters.status}
            onToggle={(value) => onToggleFilter("status", value)}
          />
          <FilterDropdown
            label="Priority"
            options={Object.entries(PRIORITY_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            selected={filters.priority}
            onToggle={(value) => onToggleFilter("priority", value)}
          />
          <FilterDropdown
            label="Health"
            options={HEALTH_OPTIONS.map((value) => ({
              value,
              label: healthLabel(value),
            }))}
            selected={filters.health}
            onToggle={(value) => onToggleFilter("health", value)}
          />
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Clear all
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : `${resultCount} of ${totalCount}`}
          </span>
          {selectedCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={archiving}
              onClick={onArchiveSelected}
            >
              <Archive data-icon="inline-start" />
              Archive ({selectedCount})
            </Button>
          ) : null}
          <Button size="sm" onClick={onNewProject}>
            <Plus data-icon="inline-start" />
            New project
          </Button>
        </div>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={`${chip.key}-${chip.value}`}
              type="button"
              onClick={() => onToggleFilter(chip.key, chip.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/70",
              )}
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
