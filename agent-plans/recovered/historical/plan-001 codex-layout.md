---
date: 2026-06-12
status: complete
subject: codex-layout
checkpoint_before: fecffcc
---

# Plan 001 - Codex Layout

## Goal

Rework the web and desktop UI into a Codex-like app shell: a persistent left sidebar owns primary navigation, with Locations, Duplicates, and Search as top-level app areas. In Locations, individual locations appear as nested containers in the sidebar, while scans remain inside the selected location view.

## Context

- The user provided a Codex screenshot as the visual reference.
- Current UI uses a top tab bar and a horizontal location strip inside the content area.
- The user wants locations to become the primary navigational object and to contain scans.
- Routes are already first-class: `/locations/:slug/scans/:scanId`, `/duplicates`, and `/search`.

## Decisions

- Keep the existing route model and selection state. The redesign should not change backend APIs or URL semantics.
- Move top-level navigation from the content header into `Shell`.
- Pass `locationList`, `selectedLocationSlug`, and `onChooseLocation` into `Shell` so it can render the nested Locations section.
- Remove the page-level location strip from `LocationsPage`; the page should render the selected location detail or an empty state.
- Keep scan history in the selected location detail for now. Scans are children of a location, but they still need summary metadata and actions close to the file browser.
- Use a dark sidebar with muted borders, compact rows, and clear active states inspired by Codex. Keep the main working area light for dense file tables.
- Keep options and database selection in the sidebar footer/header area, not as a central workflow.

## Implementation Steps

1. Update `Shell.jsx` props and markup for the app shell:
   - Add sidebar top-level app buttons.
   - Add nested location list under Locations.
   - Move live status and options into compact sidebar regions.
2. Update `App.jsx` to pass location navigation props into `Shell`.
3. Simplify `LocationsPage.jsx` by removing the location strip.
4. Update `style.css`:
   - Add full-height shell grid.
   - Add dark sidebar styles and compact navigation rows.
   - Adjust main content padding and responsive behavior.
   - Retire top nav and horizontal location-strip dominance.
5. Verify with:
   - `npm --prefix ui run build`
   - Browser smoke test on the current local app route or `just run-no-open` if no server is active.

## Learning Log

- The previous layout spent too much vertical space on overview, location cards, scan history, then file browser. The new layout should reserve the center pane for browsing files and scan work.
- The current `Shell` is the right boundary for global navigation, connection status, refresh, and options.
- `LocationsPage` should become a content renderer for the selected location, not a navigation owner.
- Browser verification on a scanned route exposed an existing AG Grid React integration bug: a cell renderer returned a raw `HTMLButtonElement`, which crashed React in production. The fix is to return a React button from the renderer.
- AG Grid v35 reports a theme migration error when CSS file themes are used without explicitly selecting legacy theme mode. The short-term fix is `theme="legacy"`.
- Next table infrastructure decision: replace AG Grid and adjacent table/list widgets with TanStack Table in a separate pass. Do not fold that into the shell redesign; it affects sorting, filtering, column visibility, row actions, keyboard behavior, and file-table interaction contracts.
- Sidebar scroll containment needs to live at the shell boundary. The sidebar itself is fixed-height with `overflow: hidden`, and its nested scrollers may not always have scroll range; wheel input over those inert regions must not fall through to the document.

## Work Log

- [x] 2026-06-12 14:11 - Checkpointed existing work before edits: `fecffcc`.
- [x] 2026-06-12 14:12 - Created `agent-plans/plan-001 codex-layout.md`.
- [x] 2026-06-12 14:14 - Moved primary app navigation and nested location navigation into `Shell.jsx`.
- [x] 2026-06-12 14:15 - Simplified `LocationsPage.jsx` so it only renders the selected location detail or empty state.
- [x] 2026-06-12 14:16 - Added dark Codex-like sidebar styles, compact overview metrics, and mobile responsive sidebar behavior in `style.css`.
- [x] 2026-06-12 14:18 - Browser verification exposed a production React crash in `FileGrid.jsx`; replaced the raw DOM button cell renderer with a React button.
- [x] 2026-06-12 14:20 - Set AG Grid to `theme="legacy"` to match the imported CSS theme files and removed unnecessary row selection after it introduced checkbox UI.
- [x] 2026-06-12 14:22 - Verified desktop layout at 1440px: sidebar is 292px, file grid renders rows, and rebuilt assets have no current console errors or warnings.
- [x] 2026-06-12 14:23 - Verified mobile layout at 390px: top-level app labels fit, location list becomes horizontal, and file rows still render.
- [x] 2026-06-12 14:24 - Added project-level `AGENTS.md` instructions for plan files.
- [x] 2026-06-12 14:25 - Recorded the TanStack replacement request as a separate future table-infrastructure pass.
- [x] 2026-06-12 14:27 - Add a sidebar hide control and convert small viewport behavior to left-edge hover/focus overlay instead of top-rendered sidebar.
- [x] 2026-06-12 14:28 - Added project `AGENTS.md` direction to checkpoint often in git around meaningful task batches and risky transitions.
- [x] 2026-06-12 14:30 - Add proper icons for top-level sections, sidebar controls, buttons, table actions, and modal actions in a dedicated visual-system pass; completed under `plan-002 icon-system.md`.
- [x] 2026-06-12 14:37 - Move sidebar hide/restore into a Codex-like top bar and surface current page actions there.
- [x] 2026-06-12 14:41 - Verified desktop top bar: current location title/actions render, hide collapses sidebar to a left rail, restore returns the pinned sidebar.
- [x] 2026-06-12 14:41 - Verified mobile top bar: sidebar stays fixed/offscreen instead of rendering above content, and the top bar restore button opens it as an overlay.
- [x] 2026-06-12 14:44 - In hover mode, make the top bar button open the sidebar and put the close button inside the sidebar; keep primary nav vertical.
- [x] 2026-06-12 14:47 - Verified wide and compact sidebar behavior in the browser: wide mode top bar toggles the pinned sidebar, compact mode top bar opens the overlay, the sidebar close button closes it, and primary nav remains vertical.
- [x] 2026-06-12 14:48 - Ran `git diff --check` and `npm --prefix ui run build`; build succeeded with only the existing Vite chunk-size warning.
- [x] 2026-06-12 14:51 - Fix hidden hover-mode sidebar rail overlap by reserving the hover rail width in the shell layout.
- [x] 2026-06-12 14:52 - Verified the sidebar rail overlap regression: before fix compact hidden overlap was 8px and wide hidden overlap was 18px; after fix both measure 0px.
- [x] 2026-06-12 15:23 - Reproduced sidebar scroll chaining in the browser: wheel input over the sidebar moved the main document by 382.5px on desktop and 520px in compact mode.
- [x] 2026-06-12 15:26 - Verified sidebar wheel containment: desktop sidebar delta 0px, desktop main delta 382.5px, compact sidebar delta 0px, compact main delta 520px.
- [x] 2026-06-12 15:26 - Ran `npm --prefix ui run build`; build succeeded with only the existing Vite chunk-size warning.

## Unfinished Work

- [x] Replace text glyphs with proper icons across sections and buttons.
- [x] Plan the TanStack replacement as a separate pass covering file grid sorting, filters, column visibility, row actions, keyboard behavior, and any reusable table/list components.
