---
date: 2026-06-12
status: complete
subject: table-polish
---

# Plan 007 - Table Polish

## Goal

Improve the file browser table so it behaves more like a compact Finder-style browser: resizable columns, tighter rows, less alarming row actions, multi-select workflows, and a first-class Delete Check subview under each scan.

## Context

- The file table now uses TanStack Table.
- The current row-level `Remove` button is too prominent for a destructive scan-index action.
- Delete Check was exposed as a scan/page action, but it checks either the currently viewed folder path or an explicit selected set, so it belongs in the scan file browser rather than the global page action menu.
- The user provided Finder/Drive-like screenshots as visual direction: compact rows, subtle row actions, and a dedicated trailing action affordance.
- Delete Check needs to become a separate scan subtab so users can inspect safety results without feeling trapped in an implicit file-browser mode.
- Users need to select more than one file or folder row and run Delete Check against that selected set.
- Build Thumbnails should be available for both current folders and selected file/folder rows.
- A representative scan also needs an explicit way to clear representative status.

## Decisions

- Make Delete Check a scan subtab with deep-link route state.
- Keep Delete Check launch controls in the folder/file toolbar, scoped to selected rows when any rows are selected and otherwise scoped to the current `selectedPath`.
- Remove Delete Check from the page action menu so it is not presented as a whole-scan/page action.
- Use TanStack column sizing with drag handles in the header for per-session table resizing.
- Replace visible `Remove` row buttons with an icon-only row action menu. The menu action remains destructive and uses dangerous coloring.
- Add multi-select checkboxes to file/folder rows. Parent pseudo-rows are navigational only and not selectable.
- Add row context actions for Build Thumbnails and Remove from scan. Keep destructive removal inside the menu.
- Use a pointer cursor only where a row interaction is actionable and a regular cursor elsewhere.
- Add a Clear representative action for representative scans.
- Keep rows compact and improve table appearance locally in `FileGrid.jsx` and `style.css`.

## Implementation Steps

1. Move Delete Check out of selected-scan page actions and into the scan file browser.
2. Add TanStack column sizing state and header resize handles.
3. Replace the row `Remove` button with a compact context-action menu button.
4. Add multi-select row state and call Delete Check with explicit selected paths when available.
5. Add a Delete Check scan subtab and route it with the selected scan URL.
6. Add Build Thumbnails targeting for current folders and selected file/folder rows.
7. Add Clear representative scan action.
8. Update table CSS for compact rows, subtle row hover, resize affordances, intentional cursors, and menu styling.
9. Verify build and browser behavior:
   - Delete Check appears inside the scan browser and opens the Delete Check subtab.
   - Page action menu no longer contains Delete Check.
   - Header columns can resize.
   - Row Remove is hidden behind a context menu.
   - Multi-selected files/folders can be checked as a Delete Check set.
   - Build Thumbnails can be launched for the current folder and row targets.
   - Representative scans can clear representative status.
   - Delete-check mode still hides row actions and shows full paths.

## Learning Log

- This repo does not currently have a frontend unit test harness; table interaction verification is browser-based for this pass.
- The backend Delete Check API was folder-prefix based; selected row support needs explicit path-set support to avoid overloading a single prefix.
- Selected-path thumbnail builds need backend support too because the existing thumbnail API treated `path` as a folder prefix, which cannot target one exact file.
- Delete Check results are now a scan subview routed with `view=delete-check`; the result itself is not persisted across reloads, so a deep link opens the tab and can rerun the check.
- Thumbnail actions remain disabled when the location liveness check reports disconnected because thumbnail generation needs access to source files, not only indexed metadata.

## Work Log

- [x] 2026-06-12 16:50 - Created the table-polish plan from the user request and moved Delete Check placement into scope.
- [x] 2026-06-12 16:57 - Expanded the plan for scan-level Delete Check tabs, multi-selection, thumbnail row actions, cursor behavior, and clearing representative scans.
- [x] 2026-06-12 17:11 - Implemented selected-path Delete Check, scan subview routing, resizable compact table columns, row action menus, Clear representative, selected-path thumbnail requests, sidebar name/path labels, and dark pill tab styling.
- [x] 2026-06-12 17:11 - Verified `npm --prefix ui run build`, `just build`, `nix develop -c cargo test -p file-census-backend`, `git diff --check`, and browser behavior for multi-select Delete Check, page action contents, row actions, tab styling, and sidebar location display.
- [x] 2026-06-12 17:25 - Refined shared tab styling to match the supplied macOS/iTerm-style rounded tab rail and verified scan tabs in-browser plus both tab surfaces in source.

## Unfinished Work

- [x] Move Delete Check from page actions into the scan file browser and separate Delete Check subtab.
- [x] Add table column resizing.
- [x] Add multi-select row state and selected-path Delete Check.
- [x] Replace prominent row Remove buttons with a compact row action menu.
- [x] Add Build Thumbnails actions for current folder and selected file/folder rows.
- [x] Add Clear representative action.
- [x] Browser-verify the updated table and Delete Check flow.
