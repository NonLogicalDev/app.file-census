---
date: 2026-06-12
status: complete
subject: sidebar-scan-tree
---

# Plan 003 - Sidebar Scan Tree

## Goal

Move scan history into the sidebar by turning locations into collapsible list/tree containers whose children are scans, with distinct location-overview and scan-detail selection states.

## Context

- The current Codex-like sidebar lists top-level app areas and flat location rows.
- Scan history still lives inside `LocationsPage`, above the file browser.
- The user wants scan history moved into the sidebar and locations to become collapsible lists/trees.
- When a location is selected directly, the main pane should show location stats and location-level actions.
- When a specific scan is selected, the main pane should show scan-level actions and the file browser only.
- This is an information-architecture change and should be handled separately from the icon-system pass.

## Decisions

- Keep top-level apps `Locations`, `Duplicates`, and `Search` vertical.
- In the Locations sidebar section, render each location as a collapsible parent row.
- Render scans as child rows under their location, with representative/active status, status label, file count, and timestamp in compact form.
- Selecting a location parent should navigate to a first-class location route such as `/locations/:slug` and show location stats, metadata/notes, liveness, last successful/representative scan context, and location-level actions such as edit, enable/disable duplicate participation, delete, scan/update, and browse folder.
- Selecting a scan child should preserve deep-link route semantics: `/locations/:slug/scans/:scanId`.
- Scan-detail routes should prioritize the file browser and scan-level controls. Do not repeat location stats or large scan history above the file table on scan routes.
- Remove the page-level scan history once the sidebar scan tree is in place so the file browser gets more space.
- Preserve running scan visibility: active scans should be visible as children immediately and show live status updates.

## Implementation Steps

1. Extend `Shell` location sidebar data rendering to support expanded/collapsed location parents.
2. Add scan child rows under each expanded location.
3. Pass `selectedScanId` and `onSelectScan` or equivalent navigation callback into `Shell`.
4. Add or formalize a location overview route state for `/locations/:slug`.
5. Split main-pane rendering:
   - Location selected: location stats, metadata/notes, liveness, latest/representative scan summary, and location-level actions.
   - Scan selected: scan-level actions, work log/progress where applicable, and files only.
6. Move scan-history selection affordances out of `LocationsPage`.
7. Keep a compact selected scan summary near the file browser only when it helps disambiguate the scan.
8. Verify deep links, reload behavior, active scan updates, location-only routes, scan routes, and sidebar compact/hover behavior.

## Learning Log

- `LocationsPage` currently owns the scan list and renders it before `FileExplorer`.
- `Shell` currently receives `locationList`, `selectedLocationSlug`, and `onChooseLocation`, but not scan selection callbacks.
- This task will likely touch both routing/data-flow in `App.jsx` and sidebar rendering in `Shell.jsx`.
- The selection model should not collapse location and scan into the same page state. Location rows and scan rows represent different levels of the object model and should produce different main-pane content.
- `/locations/:slug` now intentionally means a location overview with `selectedScanId = null`; `/locations/:slug/scans/:scanId` is the only route that loads file-tree state.
- Sidebar scan clicks must carry or derive the scan location slug, otherwise a cross-location click can route the previous location slug with the new scan id.
- Deleting a selected scan should fall back to the location overview, not another scan automatically, because location and scan are now separate object states.

## Work Log

- [x] 2026-06-12 14:55 - Created the sidebar scan-tree plan from the user request.
- [x] 2026-06-12 15:28 - Added the requirement that selecting a location shows stats/location actions, while selecting a scan shows scan actions and files only.
- [x] 2026-06-12 16:12 - Implemented first-class location overview routes by preserving `selectedScanId = null`, clearing file-tree state on location selection, and validating scan routes against the selected location.
- [x] 2026-06-12 16:12 - Moved scan history into the sidebar as collapsible location groups with scan child rows, selected scan state, active/representative indicators, and cross-location scan selection.
- [x] 2026-06-12 16:12 - Split the main locations page into location overview and scan detail modes; scan routes now show file browser only, with scan actions in the page action menu.
- [x] 2026-06-12 16:12 - Pruned old content-area scan-history CSS after verifying `scan-history`, `scan-list`, and `scan-tools` no longer render.
- [x] 2026-06-12 16:12 - Verified build, diff check, location overview route, scan detail route, sidebar click navigation both directions, and compact sidebar tree behavior.

## Unfinished Work

- [x] Implement collapsible location rows in the sidebar.
- [x] Move scan history selection into the sidebar.
- [x] Add a first-class location overview route/state for location stats and location-level actions.
- [x] Split scan route rendering so scan pages show scan-level actions and files only.
- [x] Remove the content-area scan history section from scan-detail routes.
- [x] Verify route/deep-link behavior after moving scan navigation.
