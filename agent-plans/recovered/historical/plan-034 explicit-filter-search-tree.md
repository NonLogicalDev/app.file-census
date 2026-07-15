---
date: 2026-06-14
status: complete
subject: explicit-filter-search-tree
---

# Goal

Make filtering explicit and trustworthy across the app:

- Text and advanced filters should affect data only after Enter or an explicit Search/Filter button.
- Scan folder listings should preserve directory context under filters and show matched descendant file counts.
- The Search page should expose both flat results and a reusable file-tree view.

# Context

The app currently treats URL/search state as the active filter state in several places, and some controls mutate that state immediately. That makes views react while a user is still editing a filter expression. Scan folder browsing also needs backend help: a directory should remain visible when any descendant file matches the active filter, even if the directory name itself does not match.

Follow-up UX requirements:

- Search defaults to representative scans only.
- Search has an explicit option to include all scans.
- Search Flat view columns should match the scan file list table semantics while adding Location, Scan, Name, FullPath, Size, BLAKE, ctime, mtime, and other file-list fields.
- Search Tree view should use the same TanStack-backed table layout as Flat view, not a separate bespoke tree renderer.
- Tree view hierarchy is Location -> Scan -> folder tree -> files.
- Tree view starts collapsed/concealed.
- Every Location, Scan, and folder row shows matched file count.
- Scan rows show the full scan UUID and creation/start date.
- Double-clicking a file in Search opens File Info modal.
- File Info modal has an explicit reveal-in-scan action for the selected occurrence/file.

# Decisions

- Keep route/query state as the committed filter source of truth.
- Add draft UI state where controls need in-progress edits; only commit draft state on Enter or explicit button press.
- Push scan tree filtering into the backend `scans.tree` path so file counts and visible folders are data-source truthful.
- Treat folder counts under an active filter as matched descendant file counts.
- Add Search page Flat/File tree tabs over the committed search result set.
- Reuse the shared TanStack `FileGrid` for Search Flat and Tree views.
- Keep Search Tree collapsed by default so large result sets do not explode vertically on first render.
- Search scope is representative scans by default; all-scan search is opt-in and route-preserved.

# Implementation Steps

- [x] Add failing backend coverage for `scans.tree` with query/filter semantics.
- [x] Add failing frontend utility/component coverage for search tree grouping and explicit commit behavior where practical.
- [x] Extend `scans.tree` request handling to accept the committed search query/filter payload.
- [x] Update scan tree aggregation to include directories with matched descendants and matched file counts.
- [x] Split draft filter editing from committed route/search state in React pages.
- [x] Add Search page Flat/File tree tabs.
- [x] Verify with focused tests, full UI tests, build, and browser smoke checks.

# Learning Log

- 2026-06-14 02:19 - Filtered directory visibility cannot be solved correctly by filtering only the current folder's rendered rows; the backend tree query needs to know whether descendant files match.
- 2026-06-14 02:19 - Route state remains the right deep-link source of truth, but editing controls need separate draft state to avoid live filtering while composing expressions.
- 2026-06-14 02:33 - `FileSearchQuery.limit/offset` should not influence `scans.tree`; tree pagination remains controlled by `TreePage.limit/offset`, while the search query contributes only its filter expression.
- 2026-06-14 02:33 - Filtered scan tree rows are synthesized from matched descendant files. Folder `file_count` and `size` represent matched descendant files under the active filter.
- 2026-06-14 02:48 - Browser smoke showed form submission was not enough for scan-tree search commit in the running app; the search field now handles Enter directly and commits the draft payload.
- 2026-06-14 20:57 - Search tree UX should reuse the TanStack file grid instead of rendering a separate block tree; otherwise flat and tree views diverge in columns, interactions, sorting, and file details behavior.
- 2026-06-14 20:57 - Search tree starts collapsed and must show matched file counts at every location, scan, and folder level before the user expands.
- 2026-06-14 21:02 - Scan rows in Search tree need stable identity, so show the full scan UUID plus start date instead of a status-only label.
- 2026-06-14 21:02 - Search should optimize for current duplicate/delete-check workflows by defaulting to representative scans while still allowing explicit all-scan searches.

# Work Log

- [x] 2026-06-14 02:19 - Started plan for explicit filter commits, filter-aware scan tree counts, and Search tree tabs.
- [x] 2026-06-14 02:26 - Added red backend test for recursive filter semantics in scan tree directory visibility.
- [x] 2026-06-14 02:27 - Added red frontend test for Search result tree grouping.
- [x] 2026-06-14 02:33 - Implemented filtered `scans.tree` backend path and Search tree utility; focused tests pass.
- [x] 2026-06-14 02:45 - Wired explicit draft-to-committed filter flow through scan, duplicate, and search pages.
- [x] 2026-06-14 02:47 - Added Search page Flat/File tree tabs with deep-linkable `view=tree` route state.
- [x] 2026-06-14 02:53 - Verified focused backend tests, full UI tests, full build, and browser smoke for Enter-only scan filtering plus recursive matched folder counts.
- [x] 2026-06-14 20:57 - Reworked Search File tree view to use the shared TanStack FileGrid hierarchy and open file info on double-click.
- [x] 2026-06-14 21:02 - Captured follow-up Search UX requirements in the active plan.
- [x] 2026-06-14 21:20 - Added representative-scan default search scope with an all-scans route option.
- [x] 2026-06-14 21:20 - Verified UI tests, Vite build, backend representative-only search behavior, backend build, and browser smoke.

# Unfinished Work

- [x] Add red tests before production code changes.
- [x] Finish explicit-commit frontend wiring and Search page tabs.
- [x] Reuse FileGrid/TanStack hierarchy for Search tree view.
- [x] Search file double-click opens File Info modal, with explicit reveal-in-scan action.
- [x] Add representative-only default search scope and all-scans option.
- [x] Run verification and checkpoint.
