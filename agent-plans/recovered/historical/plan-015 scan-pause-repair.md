---
date: 2026-06-12
status: complete
subject: scan-pause-repair
---

# Plan 015 - Scan Pause And Repair

## Goal

Add scan controls for pausing active scans and repairing incomplete scan data by rescanning only missing or incomplete entries.

## Context

- Scans now run through discovery, metadata, and hashing worker pools.
- Current controls support stop, update scan, and exclude/delete paths.
- Stop ends the scan after flushing discovered files, but there is no reversible pause state.
- Update scan restarts from a previous scan and can reuse unchanged file metadata, but there is not yet a targeted repair mode for entries that are missing metadata, missing hashes, errored, or deleted from the scan.

## Decisions

- Treat pause as a scanner coordination feature, not a UI-only state. Worker pools must stop accepting new work, drain or park safely, and preserve enough state to continue or intentionally stop.
- Treat repair scan as distinct from update scan in user language:
  - `Update scan`: scan the location again and reuse unchanged prior entries.
  - `Repair scan`: focus on incomplete/missing scan rows and add/fix only what is needed.
- Repair should respect scan excludes and manually deleted scan paths.
- The UI should expose pause/resume only for active scans and repair only for non-active scans where it applies.
- Live progress events should include pause/resume/repair status changes so every app instance updates immediately.
- Repair creates a new scan, seeds it with valid file rows from the source scan, then walks the filesystem and only processes files that were not seeded.
- A row deleted from the source scan is treated as missing data and can be restored by repair if the file still exists on disk. Scan excludes remain respected.

## Implementation Steps

1. Define backend scan statuses and event names for `pausing`, `paused`, `resuming`, and `repairing`.
2. Extend `ScanProgressStore` cancellation/control state beyond stop-only booleans.
3. Update discovery, metadata, and hashing workers to honor pause without losing queued work.
4. Add repair preparation logic:
   - detect rows with errors, missing hashes, missing metadata, or missing expected descendants when possible.
   - reuse valid rows from the source scan.
   - only add/fix incomplete entries.
5. Add JSON-RPC methods and Tauri command/event parity for pause, resume, and repair.
6. Add UI controls scoped to active/non-active scans.
7. Verify pause/resume with an active large scan and repair with a scan containing deleted/error rows.

## Learning Log

- Pause is not the same as stop. Stop can discard scanner in-memory state after flushing; pause needs resumable worker coordination.
- Repair scan remains non-destructive by creating a new scan instead of mutating historical scans in place.
- The repair seed copies only valid file rows with non-empty hashes and no error. Directories are cheap to rediscover and are not seeded.
- Paused scans still need to be considered active so the sidebar, progress cards, and stop/resume actions remain reachable.

## Work Log

- [x] 2026-06-12 18:23 - Created this task from the user request.
- [x] 2026-06-12 18:43 - Used a read-only explorer subagent to map scanner control flow, DB methods, RPC dispatch, UI action points, and test locations.
- [x] 2026-06-12 18:44 - Added and watched a RED scanner test for pause/resume/stop-while-paused control state.
- [x] 2026-06-12 18:46 - Replaced stop-only atomics with per-scan control objects supporting stop, pause, resume, and pause wait/wake behavior.
- [x] 2026-06-12 18:47 - Added cooperative pause checks to discovery, metadata, and hash workers.
- [x] 2026-06-12 18:49 - Added and watched a RED scanner test for repair scans seeding valid rows and fixing missing/incomplete rows.
- [x] 2026-06-12 18:50 - Added DB repair seeding, `prepare_repair_scan`, repair skip paths, and initial progress/count seeding.
- [x] 2026-06-12 18:51 - Added `scans.pause`, `scans.resume`, and `scans.repair` JSON-RPC methods to native AppCore and web server dispatch.
- [x] 2026-06-12 18:52 - Added React actions, labels, and icons for Pause, Resume, and Repair scan.
- [x] 2026-06-12 18:53 - Verified with full backend tests, `npm --prefix ui run build`, `just desktop-check`, and `just build`.
- [x] 2026-06-12 18:54 - Browser-verified completed scan actions show `Update scan` and `Repair scan`, while a running scan shows `Pause` and `Stop`.
