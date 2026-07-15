---
date: 2026-06-13
status: complete
subject: delete-check-active-filter
---

# Delete Check Active Filter

## Goal

Ensure Delete Check respects the currently active filter context.

- When a user filters a scan folder and runs Delete Check, the check set should match the visible filtered scope rather than silently using every file under the folder.
- Selected rows should continue to define an explicit delete-check set.
- The Delete Check tab should preserve enough context to make it clear which filter/search state was used.
- Users should be able to persistently mark folders/files as manually included or excluded from the delete-check candidate set before applying the active filter.

## Context

Delete Check is now a scan subview and can be launched from the folder toolbar or selected rows. Search/filter controls are shared across search, duplicates, and scan views, so Delete Check should consume the same query and structured filter state instead of bypassing it.

## Decisions

- Treat selected rows as the strongest user intent.
- Treat no selection as "current folder plus current active filter".
- Do not create a separate Delete Check filter UI.
- Candidate set semantics should be:
  - included paths, or all files if no includes exist
  - minus manually excluded paths
  - then active search/filter query
  - equals the files actually checked
- Includes and excludes should accept both files and folders. Folder entries expand to descendant files.
- Manual include/exclude state should survive folder navigation so the user can assemble a check set across multiple folders before running Delete Check.

## Implementation Steps

- [x] Inspect current Delete Check request payloads from `App.jsx` and backend RPC/HTTP handlers.
- [x] Extend Delete Check request semantics to carry current query and structured filters when no explicit row selection is supplied.
- [x] Apply the filter consistently in web/native backend paths.
- [x] Preserve visible Delete Check context in the tab/callout.
- [x] Add focused regression coverage.
- [x] Browser-verify filtered folder Delete Check behavior.
- [x] Add delete-check include/exclude set state in the UI.
- [x] Add row/folder actions to include or exclude files/folders from the check set.
- [x] Update Delete Check request payload/backend semantics to apply includes, excludes, then active filters in that order.
- [x] Show the include/exclude set summary in the Delete Check tab so the user can review and clear entries.
- [x] Add regression coverage for include-only, exclude-only, include-minus-exclude, folder expansion, and active-filter ordering.

## Learning Log

- 2026-06-13 20:55 - User requirement: Delete Check must respect the currently active filter.
- 2026-06-13 21:20 - Selected rows remain explicit path mode. Folder-scope Delete Check now sends the current query/filter as `query`, and the backend resolves matching files under the current folder before running existing path-set Delete Check logic.
- 2026-06-14 01:39 - New requirement: Delete Check needs persistent manual include/exclude path sets. The effective check set is `(includes or all files) - excludes`, then active filter is applied.
- 2026-06-14 16:38 - Manual include paths override current-folder scope so users can assemble Delete Check sets across folders; selected-row runs still stay explicit path mode.

## Work Log

- [x] 2026-06-13 20:55 - Captured task and expected semantics.
- [x] 2026-06-13 21:17 - Added failing backend regression for filtered Delete Check.
- [x] 2026-06-13 21:18 - Added `Database::delete_check_filtered` and wired `query` through native/web RPC handlers.
- [x] 2026-06-13 21:18 - Updated scan view Delete Check payload to include active search state for folder scope.
- [x] 2026-06-13 21:19 - Verified `nix develop -c cargo test -p file-census-backend`.
- [x] 2026-06-13 21:19 - Verified `npm --prefix ui test`.
- [x] 2026-06-13 21:19 - Verified `npm --prefix ui run build`.
- [x] 2026-06-13 21:21 - Browser-verified `q=copied` folder Delete Check only checked the filtered copied file and reported safe.
- [x] 2026-06-14 01:39 - Implement persistent file/folder include and exclude sets for Delete Check.
- [x] 2026-06-14 16:38 - Added persistent per-scan include/exclude UI state, current-folder include/exclude actions, row actions, and Delete Check set summary/removal controls.
- [x] 2026-06-14 16:38 - Added scoped backend delete-check semantics for include-only, exclude-only, include-minus-exclude, and manual-set-plus-filter flows.
- [x] 2026-06-14 16:38 - Verified `npm --prefix ui test`, `npm --prefix ui run build`, and `nix develop -c cargo test -p file-census-backend delete_check_`.

## Unfinished Work

- [x] Implement active-filter-aware Delete Check.
- [x] Implement manual include/exclude Delete Check sets with active-filter ordering.
