| Date-Time | File | Type | Description | Status |
|---|---|---|---|---|
| 2026-07-19-0054 | 2026-07-19-0054-plan-t1-foundation.md | doc | T1 foundation implementation and handoff plan | done |
| 2026-07-19-0147 | 2026-07-19-0147-plan-t6-deadline-archived.md | doc | T6 deadline notifications and archived projects implementation plan | in progress |
| 2026-07-19-0231 | 2026-07-19-0231-plan-t10-deploy-artifacts.md | doc | T10 VPS deployment-artifacts implementation and handoff plan | done |
| 2026-07-19-0231 | next.config.ts | other | Enable Next.js standalone production output | done |
| 2026-07-19-0231 | .dockerignore | other | Exclude secrets, local databases, and build artifacts from Docker context | done |
| 2026-07-19-0231 | Dockerfile | other | Multi-stage non-root standalone image with Prisma migration runtime | done |
| 2026-07-19-0231 | deploy/docker-entrypoint.sh | other | Apply production migrations before starting the application | done |
| 2026-07-19-0231 | docker-compose.yml | other | Compose application, SQLite bind mount, and Caddy HTTPS proxy | done |
| 2026-07-19-0231 | Caddyfile | other | Domain-driven automatic HTTPS reverse proxy | done |
| 2026-07-19-0231 | deploy/backup.sh | other | WAL-safe nightly backup, integrity check, rotation, and off-box transfer stub | done |
| 2026-07-19-0231 | deploy/restore.md | doc | Exact SQLite restore and verification procedure | done |
| 2026-07-19-0231 | deploy/README.md | doc | VPS deploy, redeploy, backup, restore, seed, and Azure migration runbook | done |
| 2026-07-19-1148 | 2026-07-19-1148-plan-f5-review-fixes.md | doc | F5 adversarial-review fixes implementation and handoff plan | done |
| 2026-07-19-1203 | .dockerignore | other | Exclude restore safety copies and SQLite database sidecars from Docker context | done |
| 2026-07-19-1203 | CONTRACTS.md | doc | Update milestone deletion and archive action signatures for optimistic locking | done |
| 2026-07-19-1203 | app/layout.tsx | other | Mount the global toaster for authenticated and login routes | done |
| 2026-07-19-1203 | app/(app)/layout.tsx | other | Remove the duplicate authenticated-layout toaster | done |
| 2026-07-19-1203 | app/(app)/projects/page.tsx | other | Include project versions in active project table rows | done |
| 2026-07-19-1203 | app/(app)/archived/page.tsx | other | Include project versions in archived project rows | done |
| 2026-07-19-1203 | app/(app)/archived/archived-projects-table.tsx | other | Send version-guarded unarchive requests and reconcile partial conflicts | done |
| 2026-07-19-1203 | components/kanban/kanban-board.tsx | other | Reconcile returned card versions and roll back only failed cards | done |
| 2026-07-19-1203 | components/kanban/kanban-card.tsx | other | Normalize due-date display and overdue checks to UTC date-only values | done |
| 2026-07-19-1203 | components/notes/notes-tab.tsx | other | Serialize autosaves, flush pending edits, and expose retryable error state | done |
| 2026-07-19-1203 | components/project-panel/deliverables-section.tsx | other | Pass milestone versions to guarded deletion and toast conflicts | done |
| 2026-07-19-1203 | components/project-panel/project-panel.tsx | other | Await notes flushes before tab and panel navigation | done |
| 2026-07-19-1203 | components/projects-table/columns.tsx | other | Add sortable client column and UTC date-only handling | done |
| 2026-07-19-1203 | components/projects-table/projects-table.tsx | other | Archive only current filtered selections with row versions | done |
| 2026-07-19-1203 | components/projects-table/types.ts | other | Add optimistic-lock versions to project row DTOs | done |
| 2026-07-19-1203 | deploy/README.md | doc | Document guarded seeding and explicit destructive override | done |
| 2026-07-19-1203 | deploy/restore.md | doc | Store restore safety copies outside the repository checkout | done |
| 2026-07-19-1203 | lib/actions/milestones.ts | other | Transactional milestone limit and version-guarded deletion | done |
| 2026-07-19-1203 | lib/actions/projects.ts | other | Version-guard archive operations with partial-conflict reporting | done |
| 2026-07-19-1203 | lib/session.ts | other | Require SESSION_SECRET at first production runtime session use | done |
| 2026-07-19-1203 | prisma/seed.ts | other | Abort project replacement unless SEED_DESTRUCTIVE is explicit | done |
| 2026-07-19-1203 | prisma/seed-guard.ts | other | Extract destructive seed guard logic | done |
| 2026-07-19-1203 | prisma/seed-guard.test.ts | other | Cover empty, guarded, and destructive seed cases | done |
| 2026-07-19-1940 | 2026-07-19-1940-plan-csv-project-import.md | doc | CSV project bulk-import implementation and handoff plan | done |
| 2026-07-19-2001 | app/(app)/projects/projects-page-client.tsx | other | Wire CSV template download, file selection, import action state, and result dialog | done |
| 2026-07-19-2001 | components/project-details/import-projects-dialog.tsx | other | Display CSV import progress, success count, and row validation errors | done |
| 2026-07-19-2001 | components/projects-table/projects-table.tsx | other | Expose CSV controls in the project table and empty state | done |
| 2026-07-19-2001 | components/projects-table/toolbar.tsx | other | Add CSV template and import buttons beside New project | done |
| 2026-07-19-2001 | lib/actions/projects.ts | other | Add authenticated all-or-nothing CSV project import transaction | done |
| 2026-07-19-2001 | lib/project-csv.ts | other | Parse and validate project CSV rows and resolve people names | done |
| 2026-07-19-2001 | lib/validation.ts | other | Reuse exported project enum schemas across create and import validation | done |
| 2026-07-19-2001 | lib/__tests__/project-csv.test.ts | other | Cover CSV quoting, row validation, and people resolution | done |
