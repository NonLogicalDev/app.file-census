---
date: 2026-06-13
status: complete
subject: ui-progress-activity-breadcrumb-polish
---

# UI Progress, Activity, Breadcrumb Polish

## Goal

Fix the scan progress count mismatch and compact the app chrome while preserving the Codex-like shell:

- Make scan counts read consistently between the selected location/scan label and progress activity.
- Move Activity out of the sidebar section into a first-class Tasks page.
- Compact Dashboard, Locations, Duplicates, Search navigation by moving descriptions into native hover text.
- Rework file breadcrumbs as stable Apple-esque pills with separators and readable hover states.
- Keep the file toolbar stable when files are selected; do not insert a Clear selection button that shifts other controls.

## Context

The sidebar became visually crowded after adding top-level sections, locations, scan history, live status, options, and activity cards. Activity also used compact progress pool cards against the dark sidebar, which made pool titles low contrast. File breadcrumbs currently inherit generic button hover behavior, causing dark hover states and unreadable text in some themes.

## Decisions

- Treat activity as a destination, not a persistent sidebar widget. The sidebar should stay navigation-first.
- Keep top-level nav descriptions available via `title`/`aria-label`, not visible text.
- Use a separate selection summary row below the folder toolbar so toolbar buttons never jump when selection count changes.
- Progress pool lane counts are work queue items, not necessarily indexed file count. File count labels should come from the scan progress `file_count` field only.

## Implementation Steps

- [x] Add a first-class Tasks route/page fed by `runningProgress` and `eventLog`.
- [x] Remove visible descriptions from sidebar nav and top bar.
- [x] Move sidebar Activity rendering to the Tasks page and improve progress pool contrast.
- [x] Restyle breadcrumbs as compact pills with dash separators and stable readable hover states.
- [x] Move Clear selection out of the finder toolbar.
- [x] Verify progress count semantics and adjust labels if needed.
- [x] Run UI tests/build and browser verification.

## Learning Log

- 2026-06-13 20:28 - Activity in the sidebar duplicates dashboard concerns and competes with location/scan navigation. A Tasks page is a cleaner long-term container for running scans and future background jobs.
- 2026-06-13 20:34 - Progress counts are not intended to match: scan totals are indexed files/bytes, while pool lanes are per-stage work items. UI copy should state that distinction.
- 2026-06-13 20:39 - Vite build writes a temporary timestamped config module and needs escalated permissions in this managed sandbox. Captured this in `AGENTS.md` to avoid repeating the known failing attempt.

## Work Log

- [x] 2026-06-13 20:28 - Created plan and started investigation of shell, explorer, and progress rendering.
- [x] 2026-06-13 20:28 - Implemented Tasks page and compact sidebar/topbar chrome.
- [x] 2026-06-13 20:34 - Moved Clear selection out of the folder toolbar, fixed scan status pill width, and clarified indexed-file versus work-item labels.
- [x] 2026-06-13 20:34 - Ran `npm --prefix ui test`: 77 tests passed.
- [x] 2026-06-13 20:39 - Ran `npm --prefix ui run build` with escalation: Vite production build succeeded.
- [x] 2026-06-13 20:39 - Browser-verified fresh dev route: Dashboard no longer renders Active scans, Tasks route exists, sidebar nav is compact with hover titles, and topbar descriptions are removed.

## Unfinished Work

- [x] Run final tests, build, browser check, and checkpoint.
