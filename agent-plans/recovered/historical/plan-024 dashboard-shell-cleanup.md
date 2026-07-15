---
date: 2026-06-13
status: complete
subject: dashboard-shell-cleanup
---

# Plan 024 - Dashboard Shell Cleanup

## Goal

Move database-level metrics and live connection status out of every page body so Locations, Duplicates, and Search stay focused on their own work. Add a Dashboard page for global database stats.

## Decisions / Design Notes

- Keep live update status in the sidebar footer, where it is global app chrome.
- Remove the main content live-update strip and database metrics from the shell body.
- Add a top-level Dashboard tab for database-level metrics and high-level status.
- Keep page-level content focused: individual pages should not inherit global DB stats unless the page itself is the Dashboard.
- Preserve deep-link routes for existing Locations, Duplicates, and Search pages.
- Sidebar selected state must be visually stronger than hover state. A selected scan should keep its selected background even when hovered or active/running, and use an accent inset so the current scan is unambiguous in the scan tree.

## Work-Log

- [x] 2026-06-13 19:05 - Started Dashboard/shell cleanup plan from user request.
- [x] 2026-06-13 19:25 - Added Dashboard route/page for DB-level metrics and running activity.
- [x] 2026-06-13 19:25 - Removed global DB metrics, live-update strip, and top progress band from individual page bodies.
- [x] 2026-06-13 19:25 - Kept live-update status in the sidebar footer and verified Dashboard, Locations, Duplicates, Search, and root routes in browser.
- [x] 2026-06-14 01:52 - Strengthened selected scan styling so the active route's scan stays visibly highlighted in the sidebar even when active/running or hovered.

## Unfinished Work

- [x] Add Dashboard tab and route.
- [x] Move overview metrics into Dashboard.
- [x] Keep live update status only in sidebar chrome.
- [x] Remove global stats/status strips from individual page shell.
- [x] Verify navigation, build, and browser rendering.
