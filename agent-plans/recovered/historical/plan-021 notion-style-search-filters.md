---
date: 2026-06-12
status: complete
subject: notion-style-search-filters
---

# Plan 021 - Notion Style Search Filters

## Goal

Rework Search into a fast, powerful file-finding surface with a Notion-style interactive filter builder for filename, path, location, and date conditions.

## Design Brief

Build a fully interactive filter builder for the existing file-census Search page. Use the provided Notion screenshot as a reference for behavior and layout density: filter chips, inline condition rows, grouped rules, dropdown operators, and a compact builder that feels quick to manipulate. Do not copy the color scheme; match file-census styling and the ongoing Tailwind/component direction.

## Context

- Search currently has a single text input that calls `files.find` with `{ q, limit }` and searches filename/path fragments.
- The app already has route/deep-link support for `/search?q=...`; this needs to expand to structured filter state without breaking simple query links.
- Current route hydration sets the search input from `/search?q=...` but does not execute the search, so deep-linked search results can appear empty until the user submits.
- File rows already contain useful searchable metadata: scan id, location slug/name, kind, path, name, size, BLAKE3, SHA-256, ctime, mtime, mode, and error.
- Available DB columns:
  - `locations`: `slug`, `name`, `type`, `root_path`, `notes`, `representative_scan_id`, `disabled`, `created_at`.
  - `scans`: `location_id`, `offset_path`, `started_at`, `finished_at`, `file_count`, `dir_count`, `error_count`, `total_bytes`, `status`, `notes`.
  - `files`: `scan_id`, `path`, `name`, `size`, `blake3`, `sha256`, `kind`, `ctime`, `mtime`, `mode`, `error`, unique `(scan_id, path)`.
- Current indexes include `locations(slug)`, `scans(location_id)`, `files(scan_id,path)`, `files(name)`, and `files(blake3,size)`.
- Current `files.find` does escaped substring `LIKE` against relative `files.path` or `files.name`, ordered by newest scan. It does not filter disabled locations, errors, kind, or representative scans.
- `ctime`/`mtime` are nullable RFC3339 UTC strings, so normalized date ranges can be compared lexicographically in SQLite.
- The user wants a Notion-style condition builder, including date ranges for ctime/mtime, filename exact/regex/fuzzy/extension, full-path regex/fuzzy, and location regex/exact.
- The feature should be product-quality, fast, and feel "magical" without becoming a fragile bespoke query screen.
- Use subagents for parallel read/write work where file ownership can be kept disjoint.

## Decisions

- Represent filters as a JSON AST instead of ad hoc query params. This keeps URL state, RPC, CLI, tests, and future saved views aligned.
- Keep the simple text search as the fast first affordance, but treat it as one filter rule in the builder rather than a separate mode.
- Use canonical `term`/`operator`/`expression` filter nodes across backend, CLI, URL state, and UI state.
- Do not support backwards compatibility for the earlier `{ field, op, value }` rule shape or `{ filter: { and: [...] } }` wrapper. This app is greenfield; reject stale shapes clearly.
- Boolean composition is also a canonical node: `{ term: "filter", operator: "and" | "or", expression: [...] }`; negation is `{ term: "filter", operator: "not", expression: { ... } }`.
- The simple UI can still add flat chips, but those chips are canonical leaves. Backend and CLI support nested composition now so future UI can expose arbitrary groups without another API rewrite.
- Implement fuzzy matching in the backend with deterministic fzf-style subsequence scoring for names/paths before considering heavier native search dependencies.
- Implement regex through a controlled SQLite/user-function path or Rust-side filtering after a narrowed SQL candidate set. Do not pass arbitrary regex into unbounded full-table Rust scans without limits.
- Preserve deep links by serializing the canonical filter AST into a compact URL param. Stale pre-canonical filter links can be ignored instead of migrated.
- Reuse existing Tailwind primitives and TanStack where it improves result rendering; do not revive AG Grid or large bespoke CSS.

## Product Shape

- Top row: prominent "Search files" command input plus a compact filter-chip rail.
- Filter chips summarize active conditions: `Name contains invoice`, `mtime last 30 days`, `location is nl-media-01`.
- Builder popover: Notion-style rows with field selector, operator selector, value editor, row actions, and add/delete controls.
- First interaction from `+ Filter` should be a typeahead field picker, then operator picker, then focused value editor. Do not force users through a modal.
- Field-specific editors:
  - Filename: contains, exact, regex, fuzzy, extension, starts with, ends with.
  - Full path: contains, regex, fuzzy, starts with.
  - Location: exact slug/name, regex.
  - ctime/mtime: before, after, between, last N days, empty/not empty if needed.
  - Kind: file/folder/error as a later low-cost rule.
- Results should render as a dense searchable table/list with path, name, location, size, modified, created, and duplicate hints where useful.
- Empty states should suggest quick filters based on typed input, for example turning `.jpg` into an extension rule or `/Photos/` into a path rule.
- Keyboard flow matters: `/` focuses query, `Cmd/Ctrl+K` opens add-filter, Enter applies the active edit, Escape closes popovers, and Backspace on an empty query should focus/remove the last chip.
- Empty states should distinguish no search yet, no matches, filters too narrow, and backend/search unavailable.
- V1 saved filters should be "copy link" via route state. Persistent saved filter views need a separate local-storage-vs-DB decision.

## Backend Shape

- Add a typed `FileSearchQuery` request next to the existing simple `files.find`.
- Keep `files.find` as a separate simple textual command for now, not as a structured filter compatibility layer.
- Add `files.search` RPC for structured search.
- Add REST parity as `POST /api/files/search` and CLI support later as `file-census files search --filter-json ...` plus ergonomic flags for common rules.
- Query planning should push cheap SQL filters first: location, kind, extension suffix, date ranges, exact/contains path/name.
- Apply regex/fuzzy after SQL narrowing with a default candidate cap and clear result limits.
- Search should default to representative scans and enabled locations where appropriate, matching duplicate/search semantics unless the user selects otherwise.
- Treat "full path" as an explicit computed search field: `location.root_path || '/' || files.path`. Keep relative path matching separate so users can target scan-relative layout when needed.
- Add a `kind` and `include_errors` rule even if the first UI hides it; these are cheap and make the AST durable for CLI use.
- Do not add `files.search` to only one RPC dispatcher. `AppCore` and web JSON-RPC currently have separate dispatch paths and must stay in sync.

## Filter AST Sketch

```json
{
  "filter": {
    "term": "filter",
    "operator": "and",
    "expression": [
      { "term": "extension", "operator": "equal", "expression": "jpg" },
      {
        "term": "mtime",
        "operator": "between",
        "expression": {
          "from": "2024-01-01T00:00:00Z",
          "to": "2025-01-01T00:00:00Z"
        }
      },
      {
        "term": "filter",
        "operator": "not",
        "expression": { "term": "location_slug", "operator": "equal", "expression": "scratch" }
      }
    ]
  },
  "limit": 200,
  "offset": 0
}
```

Every rule, including composition, uses `term`, `operator`, and `expression`. There is no legacy wrapper or alternate rule grammar.

## First Implementation Slice

Keep the first slice backend-first and intentionally smaller than the full Notion builder:

- Add structured `files.search` with canonical composable filters.
- Support SQL-pushdown rules for:
  - text contains across current filename/path behavior,
  - filename extension,
  - exact location slug,
  - `mtime` before/after/between,
  - `kind` file/folder where currently supported by indexed rows.
- Support Rust-side post-filter rules for regex, fuzzy, and inverse regex/fuzzy operators.
- Keep existing `/search?q=...` behavior by compiling the quick query into a canonical text-substring filter.
- Add the RPC to both dispatchers: `AppCore` and web JSON-RPC.
- Defer saved views and the TanStack result grid until the contract is verified.

## Backend Safety Notes

- Generate SQL only from whitelisted fields/operators; bind all user values as parameters.
- Cap `limit`, support `offset`, and reject or narrow unbounded regex/fuzzy queries.
- Compile regex once per request, reject oversized patterns, and use Rust's non-backtracking `regex` crate.
- Regex is not native in the current SQLite setup. Prefer Rust post-filtering after SQL candidate narrowing unless a `rusqlite` function feature/UDF is deliberately added.
- Fuzzy is also a Rust post-filter step; use deterministic subsequence scoring and bounded candidate sets.
- Normalize date inputs to RFC3339 UTC; exclude `NULL` timestamps by default unless a rule explicitly includes them.
- Decide and test whether search excludes disabled locations by default. Recommendation: default to enabled locations and representative scans, with explicit toggles for "include disabled" and "all scans".

## Implementation Steps

1. Integrate subagent audit results into this plan before implementation.
2. Define `FileSearchQuery`, rule fields, rule operators, result ordering, and URL serialization format.
3. Add backend tests for SQL-pushdown rules: name exact, extension case handling, relative path contains, full path contains, location slug/name exact, ctime/mtime range boundaries, `NULL` timestamp behavior, kind, and error inclusion/exclusion.
4. Add backend tests for regex/fuzzy behavior, invalid regex errors, broad-query rejection, and candidate caps.
5. Implement backend `files.search` while leaving `files.find` as a separate simple text path.
6. Add frontend filter-state utilities with tests for AST creation, chip labels, URL encode/decode, request payload building, and invalid URL fallback.
7. Add UI primitives for popover/listbox behavior before building the feature UI.
8. Build the Search filter builder UI with local primitives and Tailwind utilities.
9. Render results with sortable/filterable columns using a Search-specific TanStack table if it improves density and scanability.
10. Add CLI structured search once RPC behavior is stable.
11. Verify deep links, reload behavior, auto-run behavior, empty states, keyboard flow, and large-result performance.

## Subagent Plan

- Backend explorer: audit current DB schema, search RPC/CLI, SQLite feasibility, and test entry points.
- Frontend explorer: audit Search page state/routing, reusable primitives, TanStack options, and UX component boundaries.
- Backend worker: own `src/backend/src/db.rs`, `src/backend/src/app.rs`, backend tests, and CLI parity when implementation starts.
- Frontend state worker: own `ui/src/utils/searchFilters.js` and tests for AST defaults, add/remove/update, chip labels, request payloads, URL encode/decode, and invalid URL fallback.
- UI primitives worker: own `ui/src/components/ui/Popover.jsx`, `ui/src/components/ui/Listbox.jsx` or `CommandList.jsx`, exports, and primitive keyboard tests.
- Frontend UI worker: own `ui/src/components/search/SearchFilterBuilder.jsx`, `SearchFilterChip.jsx`, optional `searchFilterClasses.js`, and `ui/src/pages/SearchPage.jsx` after state contracts are fixed.
- Results table worker: own `ui/src/components/search/SearchResultsGrid.jsx` and stable column tests, with no App routing work.
- App integration worker: own `ui/src/App.jsx` search route state, auto-run behavior, and RPC payload integration.
- Reviewer agents: one spec-compliance pass and one code-quality pass after each implemented slice.

## Learning Log

- The screenshot reference is behavioral/layout guidance, not a color palette target.
- Product Design saved-context preflight found no saved context, so this feature should use the current file-census app styling and the provided screenshot only.
- Search should become a command surface for file investigation, not just a text box.
- The first useful version should feel good with a flat chip list, but the underlying AST must already support nested composition.
- Backend audit confirmed `files.path` is relative to the scan root, so full-path filtering must compose `locations.root_path` with `files.path` or return a computed field.
- Existing `files.find` can remain as a simple text command. New structured behavior lives behind `files.search` and `file-census files search --filter-json`.
- Regex/fuzzy cannot be pure SQLite with current dependencies; they need bounded Rust post-filtering or an intentional SQLite UDF dependency change.
- Frontend audit confirmed Search has only `query`, `results`, global `busy`, `/search?q=...`, and submit-driven `files.find`; deep-linked search currently hydrates but does not auto-run.
- Existing `Menu` is adequate for simple menu buttons, but not enough for a fast filter-builder combobox. Add focused popover/listbox primitives with Escape/outside-click/focus-return and roving keyboard selection.
- Search results should likely move from button cards to a dense Search-specific TanStack grid with columns for name/path, location, scan date/status, size, modified, duplicate count, and hash.
- Avoid overbuilding nested UI in v1. A fast flat chip list is enough because the backend and serialized AST already support `and`/`or`/`not`.
- Follow-up implementation slicing audit initially recommended flat SQL-backed filters, but the greenfield clarification moved the contract directly to canonical composition plus Rust-side regex/fuzzy.
- Avoid silently changing search scope in the first slice. If search later defaults to enabled representative scans, make that scope visible because current `files.find` searches more broadly.
- Label relative path and full path as different concepts; current rows store relative paths, while full-path search must compose location root plus file path.
- Backend structured search uses canonical `{ term, operator, expression }` nodes and exposes location filtering as `term: "location_slug"` to make slug semantics explicit.
- Keep `files.find` separate until there is a deliberate CLI/API cleanup task; do not make it a hidden adapter for old structured filter JSON.
- 2026-06-13: User clarified no backwards compatibility is needed. Supersede the early flat-first slice: structured search now uses only canonical `term`/`operator`/`expression` nodes, with composition represented by `term: "filter"`.
- 2026-06-13: UI search filter state should also be canonical AST leaves, not a second local `{ field, value }` representation. This prevents URL state, chips, RPC payloads, and CLI JSON from drifting apart.
- 2026-06-13: `files.find` can remain as an older simple text command, but `files.search` must not accept old structured-filter shapes.
- 2026-06-13: Follow-up bug showed the backend and URL state supported composed filters, but the UI only exposed leaf-rule creation. The filter controls need an explicit grouping action for existing rules so users can compose `and`/`or`/`not` groups without hand-editing URL JSON.
- 2026-06-13: Duplicates and Scan already consume global `q`/`filters` state internally, but controls were hidden or split across a local duplicates-only field. The correct product shape is one shared search/filter control surface across Search, Duplicates, and Scan.
- 2026-06-13: FileGrid select-all was rendered inside the generic sortable header button. Non-sortable headers produce a disabled wrapper button, which prevents the checkbox from receiving normal interaction.
- 2026-06-13: The shared filter control can now group existing chips into `All`, `Any`, or `Not` groups. `addSearchFilter` now dedupes exact canonical duplicates only, so users can create rules like `extension is jpg` and `extension is png` before grouping them.
- 2026-06-13: Browser automation against the already-open local URL was blocked by Browser Use URL policy, so this batch was verified through UI unit tests, production build, top-level build, static path checks, and the FileGrid root-cause code change instead of an automated browser click.
- 2026-06-13: Filter clipboard exchange uses the visible filter-state shape `{ "query": string, "filters": canonicalFilter[] }`. Paste replaces the current view's query and filters, and Search reruns the backend search immediately.
- 2026-06-13: The chip-based filter editor is not user-friendly for nested logic. Replace it with a persistent, dedicated filter panel that renders the full expression tree at all times, separate from unrelated page/tool actions.
- 2026-06-13: Treat the current top-level `filters` array as the root `ALL` group in the UI. This preserves the canonical URL/RPC shape while giving users a real tree editor.
- 2026-06-13: Negation is orthogonal to composition. Any term or group can be toggled between `MATCH` and `EXCLUDE`; the implementation should represent `EXCLUDE` as a canonical `{ term: "filter", operator: "not", expression: node }` wrapper rather than inventing a second grammar.
- 2026-06-13: Groups have only `ALL`/`ANY` composition plus an optional negation state. `NOT` should not appear as a separate one-child group type in the visible tree.
- 2026-06-13: Any term can be converted to a one-child group, and any one-child group can be simplified back to a term while preserving negation semantics.
- 2026-06-13: All structural actions except the `MATCH`/`EXCLUDE` toggle belong behind the existing action-menu button. This keeps rows compact and prevents delete/advanced actions from dominating the surface.
- 2026-06-13: The filter panel should reserve stable space and avoid moving unrelated UI elements during editing, adding, grouping, or drag/drop interactions.
- 2026-06-13: In-app Browser verification can open a fresh localhost tab and validate route/UI state, but its coordinate drag path paints the filter drop target without delivering the HTML5 `drop` event to React. Keep drag/drop reorder semantics covered by `moveSearchFilterNode` tests unless a full DOM testing stack or browser driver with HTML5 drag/drop support is added.

## Work Log

- [x] 2026-06-12 23:34 - Added Notion-style search filters task from user request and screenshot reference.
- [x] 2026-06-12 23:34 - Started parallel backend and frontend explorer subagents for search-query and filter-builder audits.
- [x] 2026-06-12 23:34 - Integrated backend explorer findings into schema context, Backend Shape, filter AST, safety notes, and first backend tests.
- [x] 2026-06-12 23:34 - Integrated frontend explorer findings into Product Shape, primitive needs, keyboard flow, results design, route risks, and subagent write slices.
- [x] 2026-06-13 00:00 - Added first-slice implementation boundary from follow-up audit: backend `files.search` flat filters first, preserve `files.find`, defer full builder/TanStack result grid.
- [x] 2026-06-13 00:00 - Started backend worker for structured `files.search` RPC and data-layer tests.
- [x] 2026-06-13 00:12 - Implemented backend `files.search` first slice with flat SQL-backed filters for text contains, extension, `location_slug`, `mtime`, and kind; added AppCore and web JSON-RPC coverage.
- [x] 2026-06-13 00:12 - Fixed review-found wire-field mismatch from `location` to `location_slug`; verified focused search/RPC tests, full backend tests, UI tests, production build, and `git diff --check`.
- [x] 2026-06-13 00:13 - Added CLI structured-search parity for `file-census files search` with ergonomic filter flags and `--filter-json`; focused CLI parity tests pass.
- [x] 2026-06-13 00:24 - Added frontend structured search state, URL filter serialization, deep-link auto-run, compact filter chips, and a first inline filter builder using the backend `files.search` contract.
- [x] 2026-06-13 00:24 - Fixed frontend review findings: disabled-for-dupes locations remain selectable in Search filters, and degenerate extension filters like `.` are rejected after dot stripping.
- [x] 2026-06-13 00:45 - Reworked the in-flight structured search contract to greenfield canonical `term`/`operator`/`expression`; old `filter.and` and `{ field, op, value }` shapes are rejected.
- [x] 2026-06-13 00:45 - Added backend coverage for inverse SQL filters, nested `and`/`or`/`not`, regex, fuzzy, and Rust fallback extension normalization.
- [x] 2026-06-13 00:45 - Converted frontend search filter state, URL encoding, chips, and payload building to canonical AST leaves.
- [x] 2026-06-13 00:45 - Added follow-up task: fix up file display in the Search pane.
- [x] 2026-06-13 00:45 - Added follow-up task: ensure search parameters work in duplicate and scan tabs.
- [x] 2026-06-13 00:59 - Replaced Search result cards with the shared TanStack `FileGrid` table, including location and metadata columns.
- [x] 2026-06-13 00:59 - Applied canonical search `q`/`filters` route params to duplicate routes and scan routes.
- [x] 2026-06-13 00:59 - Verified Search table, scan-folder query filtering, and duplicates query filtering in the in-app browser against a temporary smoke database.
- [x] 2026-06-13 11:11 - Reopened plan for follow-up UI gaps: logical group controls, visible duplicate/scan search bars, and FileGrid select-all bug.
- [x] 2026-06-13 11:20 - Added shared `SearchFilterControls` with full-width query input, rule builder, active chips, and group actions for `All`, `Any`, and `Not`.
- [x] 2026-06-13 11:20 - Wired shared search/filter controls into Search, Duplicates, and Scan file browsing; removed the hidden duplicate-only filter path.
- [x] 2026-06-13 11:20 - Fixed FileGrid select-all by rendering non-sortable headers as plain content instead of disabled buttons.
- [x] 2026-06-13 11:20 - Verified with `npm --prefix ui test`, `npm --prefix ui run build`, `just build`, `git diff --check`, and static checks for the changed UI paths.
- [x] 2026-06-13 11:49 - Added follow-up for copying/pasting current filter state as JSON.
- [x] 2026-06-13 18:31 - Reopened plan for persistent full-tree filter editor with group negation, term/group conversion, action-menu consolidation, stable dedicated panel, and drag/drop tree manipulation.
- [x] 2026-06-13 18:31 - Implement the tree editor in the shared `SearchFilterControls` surface.
- [x] 2026-06-13 18:54 - Replaced the two-choice `MATCH`/`EXCLUDE` control with a single titled icon toggle button.
- [x] 2026-06-13 18:54 - Verified focused filter tests, full UI tests, production build, and browser DOM on Duplicates with pre-existing URL filters.
- [x] 2026-06-13 19:00 - Made root and nested group type controls compact clickable toggles and removed redundant filter helper copy.
- [x] 2026-06-13 19:15 - Made group creation render as a compact draft group with an inline child rule instead of a separate builder layout.
- [x] 2026-06-13 19:43 - Browser-verified the dedicated filter tree with two loaded rules and the Clear Filter action; the root action menu removed `filters` from the URL, preserved `q`, and rendered the empty root state. Drag/drop reorder remains covered by the search-filter move-helper tests because the Browser driver does not emit a usable HTML5 drop event.

## Unfinished Work

- [x] Integrate subagent audit findings.
- [x] Turn this task plan into a concrete implementation plan after the active Tailwind migration batch is stable.
- [x] Implement backend structured search with tests.
- [x] Implement frontend filter builder, URL state, and result rendering with tests.
- [x] Add CLI structured-search parity.
- [x] Fix up file display in the Search pane so results are dense, informative, and aligned with the file browser display model.
- [x] Ensure search parameters can be applied from the Duplicates tab and Scan tab, not only from the Search top-level page.
- [x] Add logical group controls to the search filter UI for composing active rules into `and`/`or`/`not` groups.
- [x] Replace Duplicates' narrow local filter field with the shared full-width search/filter surface.
- [x] Add the shared search/filter surface to Scan file browsing so current-folder file rows can be searched without URL editing.
- [x] Fix FileGrid header select-all on visible selectable rows; browser automation was blocked by local URL policy, so verification used static code checks plus build/test coverage.
- [x] Implement persistent full-tree filter management with stable layout.
- [x] Verify drag/drop tree editing and clear-filter behavior in the browser.
