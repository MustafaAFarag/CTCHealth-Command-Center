# CSV Project Import Plan

## Goal

Add a focused bulk-project workflow to the Projects page: managers can download an exact-format CSV template, upload a CSV, see row-specific validation errors without any writes, or atomically create every valid project with its members and deliverables under the current session's demo scope.

## Checklist

- [x] Read the repository instructions and bundled Next.js server-action guidance.
- [x] Inspect the project schema, session/demo scoping, project actions, page client, toolbar, and dialog conventions.
- [x] Add a dependency-free CSV parser and import validation helpers with focused tests.
- [x] Add the authenticated, all-or-nothing project import server action.
- [x] Add CSV template download, CSV file selection, and minimal import-result dialog UI.
- [x] Run `npm run lint`, `npm run test`, and `npm run build` and resolve failures.
- [x] Record the final changed-file and gate summary.

## Decisions

- Parse the CSV text on the server so the server action treats the entire upload as untrusted input and owns canonical row numbering and validation.
- Call the server action from a client transition, consistent with the installed Next.js guidance for event-handler invocation.
- Resolve owner and member names case-insensitively against non-demo people, matching the existing app model in which both real and demo-scoped projects refer to the shared non-demo people directory.
- Validate every data row before starting the transaction; use a single interactive transaction for all nested project inserts.
- Generate the template in the browser with a Blob because the content is static and no route handler is needed.

## Current state

Implementation and validation are complete. Lint passed with the pre-existing TanStack Table compiler advisory, all 29 tests passed, and the production build passed after the configured Google Fonts were allowed through the network sandbox.

## Next steps

Hand off the changed-file list and gate results to the orchestrator. Do not commit or push.

## Blockers

None.
