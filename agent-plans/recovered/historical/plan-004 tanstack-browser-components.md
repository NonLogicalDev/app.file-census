---
date: 2026-06-12
status: complete
subject: tanstack-browser-components
---

# Plan 004 - TanStack Browser Components

## Goal

Rework file browsing and related data-heavy UI around TanStack components, starting with TanStack Table as the replacement for AG Grid.

## Context

- The current file browser uses AG Grid in `FileGrid.jsx`.
- The user previously called out AG Grid as a possible direction, then later asked to replace AG Grid and other components with TanStack at the opportune moment.
- The file browser needs sortable/filterable columns, column visibility, alternating row colors, double-click file inspection, folder navigation, delete-check mode, full path display, and duplicate/unique metrics.
- This should be a separate infrastructure pass after the current icon-system work.

## Decisions

- Prefer `@tanstack/react-table` for file tables and other browser-like tabular surfaces.
- Keep TanStack adoption incremental: replace `FileGrid.jsx` first, then evaluate search/duplicates/result lists if they benefit from shared table primitives.
- Preserve current route behavior, file browser callbacks, and existing `visibleColumns` preferences while changing rendering internals.
- Build a local table shell that supports Finder-like browsing needs: sortable headers, resizable/choosable columns where practical, keyboard-friendly rows, double-click row actions, and compact action cells.
- Avoid broad state-management changes unless TanStack adoption exposes a real need.

## Implementation Steps

1. Install TanStack dependencies for React table rendering.
2. Create a small file-browser table component around `@tanstack/react-table`.
3. Port `FileGrid.jsx` column definitions to TanStack column defs.
4. Preserve existing row interactions:
   - Double-click file opens info modal.
   - Double-click folder/parent navigates.
   - Delete-check mode hides remove actions.
   - Full path mode renders path + name as one column.
5. Recreate existing table features:
   - Sorting.
   - Filtering where needed.
   - Column visibility.
   - Alternating row colors.
   - Folder row styling.
6. Browser-verify representative routes, reload behavior, search/duplicates unaffected behavior, and delete-check mode.

## Learning Log

- `FileGrid.jsx` is the first replacement target and is already isolated behind props.
- Existing `fileColumns`, `visibleColumns`, and `gridVisibleColumns` are managed in `App.jsx`; the TanStack pass should reuse that state before introducing anything broader.
- Search and duplicates currently render custom result rows, not AG Grid. They may or may not need TanStack after the file browser replacement.
- AG Grid removal reduced the built CSS/JS payload substantially; after migration the Vite build no longer emits the previous large chunk warning.
- Search and duplicate result lists should not be forced into TanStack in this pass. They are custom row surfaces rather than the Finder-like file table; revisit only if they need sorting/filtering/column controls.

## Work Log

- [x] 2026-06-12 14:55 - Created the TanStack browser-components plan from the user request.
- [x] 2026-06-12 16:18 - Installed `@tanstack/react-table`, removed AG Grid packages, and removed AG Grid stylesheet imports.
- [x] 2026-06-12 16:18 - Replaced `FileGrid.jsx` with a TanStack Table implementation preserving existing props, sorting, column visibility, double-click folder/file actions, delete-check full-path mode, alternating rows, folder rows, and remove buttons.
- [x] 2026-06-12 16:18 - Replaced AG Grid theme CSS with local `.file-grid-table` styles and verified no AG Grid references remain in app source or package dependencies.
- [x] 2026-06-12 16:18 - Verified build, diff check, table render/sort, column picker hide/show, delete-check full-path mode, and folder double-click navigation in the browser.

## Unfinished Work

- [x] Replace AG Grid file browser with TanStack Table.
- [x] Decide whether search and duplicate result lists should share the same table primitive.
- [x] Remove AG Grid dependencies after all AG Grid usage is gone.
