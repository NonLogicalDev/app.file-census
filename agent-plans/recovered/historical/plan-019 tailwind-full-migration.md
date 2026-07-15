---
date: 2026-06-12
status: complete
subject: tailwind-full-migration
---

# Plan 019 - Tailwind Full Migration

## Goal

Fully rework frontend styling around Tailwind and local React primitives, reducing bespoke CSS to theme tokens, browser resets, and unavoidable complex surfaces.

## Context

- `plan-006 styling-framework.md` introduced Tailwind and initial primitives, but much of `ui/src/style.css` remains as bespoke app CSS.
- The user explicitly wants a full Tailwind rework, not just incremental use of utility classes.
- The app still needs a polished dense desktop UI: sidebar shell, top bar, menus, modals, tabs, file tables, progress widgets, danger states, and responsive hover sidebar.
- The TanStack table migration remains a separate but related component-system pass.

## Decisions

- Continue with Tailwind rather than introducing a second styling framework.
- Preserve CSS variables for app theme tokens and semantic colors.
- Convert repeated visual patterns into local primitives before deleting CSS, so utility strings do not become unmaintainable one-offs.
- Keep complex browser/table styling scoped until the TanStack table work decides the final table structure.

## Implementation Steps

1. Inventory all remaining selectors in `ui/src/style.css` by ownership: tokens/base, shell, controls, modals, tables, progress, legacy/dead.
2. Expand local primitives for tabs, panels, form fields, modal shell, progress bars, and table chrome.
3. Convert components to primitives and Tailwind classes in bounded batches.
4. Remove migrated CSS selectors after each verified batch.
5. Add visual regression smoke checks for desktop and compact layouts.
6. Verify `npm --prefix ui run build`, `just build`, and browser smoke routes after every batch.

## Learning Log

- Tailwind should reduce styling surface area, not just move CSS into JSX. The migration should create reusable primitives where patterns repeat.
- Do not combine this with behavior changes unless needed to preserve layout.
- First implementation batch should avoid table internals and migrate repeated modal/rounded-tab surfaces into local Tailwind primitives.
- CSS inventory found the remaining largest surfaces are shell/sidebar/topbar, file explorer, file grid, AppModals detail grids, progress pools, and smaller search/duplicate pages.
- Migrating modal wrappers and rounded tabs removes a full legacy CSS block while preserving the current visual model through reusable local primitives.
- Small Search and Duplicates page surfaces can share page/list/card helpers rather than retaining generic `.tool-*`, `.table`, `.result-row`, and `.dupe-*` selectors.
- Scan progress pools are isolated enough to migrate before the larger shell/sidebar pass; keep the outer progress cards for a later shell batch.
- File info modal detail surfaces are a good fit for a dedicated helper module: preview panels, metadata/EXIF grids, and occurrence cards repeat enough to avoid one-off utility strings.
- Global `code` styling forces nowrap, so metadata/EXIF helpers must explicitly set normal wrapping for full hashes and paths.
- Location overview surfaces are contained enough for a dedicated helper module: shell, empty state, notes callout, metric cards, and scan summary cards can move without touching the sidebar or file table.
- Shell status surfaces can migrate independently from the large sidebar/topbar refactor: overview metrics, message callout, live-update strip, and top running-progress cards share enough behavior for a `shellClasses` helper.
- Remaining CSS audit orders the rest by risk: stale selectors/button shims/icons/panel leftovers/forms first, then shell menus, FileExplorer frame, FileGrid table system, sidebar/app-shell responsive behavior, and final globals.
- Form fields are safe to migrate before column picker and file-table checkboxes: text/search/select/textarea controls can use `formClasses`, while checkbox-specific styling remains in FileExplorer/FileGrid batches.
- Legacy `className="secondary|warning|danger"` button shims should stay gone. Button color semantics now belong to the `Button` variant API, with a static migration test guarding against reintroducing those selectors/classes.
- The page-actions menu should not sniff button class names to recolor actions; doing so breaks once button variants move fully into Tailwind utilities.
- Global `nav` tab CSS was stale and risky because the only active `nav` is `.sidebar-nav`; a static guard now prevents reintroducing generic nav tab selectors.
- Icon/status indicator styling now lives in `Icon.jsx` defaults and `shellClasses` helpers for traffic dots, connection LEDs, location LEDs, and sidebar nav icons.
- Keep semantic shell indicators as helper classes rather than scattered inline strings; they encode state variants and reduce visual drift during the larger sidebar migration.
- Generic panel leftovers are now covered by shared page helpers: title rows, action toolbars, notes panels, log panels, and empty text should use `pageClasses` instead of resurrecting global selectors.
- Next safe Tailwind batch is FileExplorer chrome only: move explorer frame, header, finder toolbar, column picker, breadcrumbs, delete-check callout/empty, and tree empty chrome into helper classes while leaving `FileGrid` and `.file-grid*` untouched.
- Shell topbar and menu chrome can live in `shellClasses`: page actions still anchors by making the menu root static and the toolbar relative, preserving the right-aligned panel behavior without legacy `.page-actions-*` CSS.
- FileGrid can migrate safely before the final shell/sidebar batch if table behavior is encoded in a dedicated `fileGridClasses` module: preserve the scroll frame, sticky headers, row alternation, selected-row precedence, resize hit target, and row-action menu open state.
- The final shell/sidebar batch can live in `shellClasses` as well. Keep the actual hidden/peek/compact state machine explicit in helper arguments and use a data attribute for scroll containment instead of preserving legacy sidebar class selectors.
- After the final batch, `style.css` intentionally contains only Tailwind directives, theme tokens, element baseline defaults, and global typography/code defaults; there are no remaining component selectors.

## Work Log

- [x] 2026-06-12 21:29 - Added full Tailwind migration task from user request.
- [x] 2026-06-12 22:20 - Started plan 019 after completing progress-bar stability; selected modal and rounded-tab primitives as the first low-risk Tailwind batch.
- [x] 2026-06-12 22:26 - Ran CSS inventory and converted modal shells plus rounded tabs to Tailwind primitives.
- [x] 2026-06-12 22:26 - Verified first Tailwind batch with targeted class tests, full UI tests, production build, rebuilt app smoke, scan tabs DOM check, and add-location modal DOM check.
- [x] 2026-06-12 22:31 - Converted Search and Duplicates page surfaces to shared Tailwind page/list/card helpers.
- [x] 2026-06-12 22:31 - Verified second Tailwind batch with targeted class tests, full UI tests, production build, selector cleanup check, rebuilt app smoke, and page-section DOM checks for Search and Duplicates.
- [x] 2026-06-12 22:38 - Converted `ScanProgressPools` to Tailwind progress helpers and removed legacy `scan-pool*` CSS.
- [x] 2026-06-12 22:38 - Verified progress batch with targeted class tests, full UI tests, production build, selector cleanup check, rebuilt active-scan browser smoke, and live progress DOM evidence.
- [x] 2026-06-12 22:49 - Converted file-info preview, metadata, EXIF, and occurrence surfaces to Tailwind detail helpers and removed the matching legacy CSS selectors.
- [x] 2026-06-12 22:49 - Verified detail-modal batch with red-green helper tests, full UI tests, production build, selector cleanup check, rebuilt app smoke, and browser checks across Preview, Metadata, and Locations tabs.
- [x] 2026-06-12 22:56 - Converted location overview shell, empty state, notes callout, metric cards, and scan summary cards to Tailwind helpers.
- [x] 2026-06-12 22:56 - Verified location overview batch with red-green helper tests, full UI tests, production build, selector cleanup check, rebuilt app smoke, and browser checks on `/locations/local-smoke`.
- [x] 2026-06-12 23:02 - Converted Shell overview metrics, message callout, live-update strip, and top running-progress cards to Tailwind helpers.
- [x] 2026-06-12 23:02 - Verified Shell batch with red-green helper tests, full UI tests, production build, selector cleanup check, rebuilt app smoke, and browser checks for metrics/live-strip rendering.
- [x] 2026-06-12 23:09 - Converted modal form fields plus Search and Duplicates inputs to Tailwind form helpers and removed the old global form/input/path-row layout CSS.
- [x] 2026-06-12 23:09 - Verified form batch with red-green helper tests, full UI tests, production build, selector cleanup check, rebuilt app smoke, and browser checks for Search, Duplicates, and Add Location fields.
- [x] 2026-06-12 23:30 - Removed legacy `secondary`, `warning`, and `danger` button class shims from JSX and CSS; converted the database chooser to the shared `Button` primitive.
- [x] 2026-06-12 23:30 - Added a static migration guard for legacy button variant selectors/classes and verified it RED/GREEN.
- [x] 2026-06-12 23:30 - Verified button-shim cleanup with full UI tests, production UI build, `just build`, and selector cleanup search. Browser smoke was blocked by the browser URL policy for this local target, so no alternate browser-control path was used.
- [x] 2026-06-12 23:42 - Removed stale global `nav` tab selectors and added a static guard to keep sidebar navigation from inheriting old page-tab CSS.
- [x] 2026-06-12 23:42 - Migrated icon/status indicator CSS into Tailwind helpers: default Icon sizing, traffic dots, connection LED, location LED, and sidebar nav icon wrappers.
- [x] 2026-06-12 23:42 - Verified icon/status batch with focused RED/GREEN tests, full UI tests, production UI build, `just build`, selector cleanup search, and `git diff --check`.
- [x] 2026-06-12 23:47 - Migrated `.empty`, `.panel-title`, `.detail-actions`, `.log`, `.notes-panel`, and `.scan-notes-panel` into page helper classes and removed their legacy CSS blocks.
- [x] 2026-06-12 23:47 - Verified panel/empty/log batch with focused RED/GREEN tests, full UI tests, production UI build, and `git diff --check`.
- [x] 2026-06-13 00:01 - Started FileExplorer chrome Tailwind worker with a UI-only write scope and explicit instruction to avoid FileGrid/table internals.
- [x] 2026-06-13 00:11 - Migrated FileExplorer chrome to `explorerClasses` Tailwind helpers, removed legacy explorer CSS blocks, and verified with focused UI tests, full UI tests, production build, spec review, and `git diff --check`.
- [x] 2026-06-13 00:26 - Migrated Shell topbar, page actions menu, and sidebar footer options menu chrome into `shellClasses` helpers; verified with focused UI tests, full UI tests, production build, selector search, and `git diff --check`.
- [x] 2026-06-13 01:08 - Migrated FileGrid table chrome, dense rows, checkbox sizing, file-name truncation, column resizers, and row action controls into `fileGridClasses`.
- [x] 2026-06-13 01:08 - Removed legacy FileGrid CSS selectors and verified the batch with focused FileGrid tests, full UI tests, production UI build, project `just build`, and `git diff --check`.
- [x] 2026-06-13 01:22 - Migrated app shell/sidebar layout, location tree, scan rows, activity cards, footer, and hidden/peek state styling into `shellClasses`.
- [x] 2026-06-13 01:22 - Removed all remaining component selectors from `style.css` and verified the final Tailwind batch with focused shell/sidebar tests, full UI tests, production UI build, project `just build`, desktop browser smoke for hide/restore/sidebar layout, and selector audit.

## Unfinished Work

- [x] Inventory remaining bespoke CSS.
- [x] Define remaining missing primitives.
- [x] Convert remaining styling in batches with browser verification.
