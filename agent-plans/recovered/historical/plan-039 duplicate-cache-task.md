---
date: 2026-06-14
status: complete
subject: duplicate-cache-task
---

# Duplicate Cache Task

## Goal

Make duplicate-cache rebuilds visible as background tasks in the Tasks page, alongside scan work.

## Context

The backend already emits duplicate-cache lifecycle events:

- `duplicate_cache_rebuild_started`
- `duplicate_cache_ready`
- `duplicate_cache_rebuild_completed`
- `duplicate_cache_failed`

The UI tracked duplicate-cache status for tree rendering, but the Tasks page only rendered active scan progress. This made duplicate-cache rebuilds invisible even though they are background work.

## Decisions

- Keep the backend event model unchanged for this slice.
- Derive a UI task from duplicate-cache lifecycle events and current cache status.
- Render duplicate-cache tasks before scan tasks in the Tasks page.
- Remove the duplicate-cache task when the rebuild completes, is ready, or fails; completion/failure remains visible in recent events.

## Implementation Steps

- [x] Add UI background task state.
- [x] Convert duplicate-cache rebuild events/status into task records.
- [x] Render duplicate-cache tasks on the Tasks page.
- [x] Add scan task controls on the Tasks page.
- [x] Improve recent event labels/details for duplicate-cache events.
- [x] Run UI verification.
- [x] Checkpoint the change.

## Learning Log

- 2026-06-14 20:43 - Duplicate-cache work was already evented by the backend. The missing architecture piece was front-end task derivation, not a new backend task table.
- 2026-06-14 20:45 - Task-screen stop is currently supported for scan tasks through existing pause/resume/stop RPCs. Duplicate-cache task cancellation needs backend support before the UI can honestly expose Stop for it.

## Work Log

- [x] 2026-06-14 20:43 - Added `backgroundTasks` state in `App.jsx` and derived duplicate-cache tasks from lifecycle events.
- [x] 2026-06-14 20:43 - Updated `TasksPage` to show duplicate-cache active work with processed/total file progress.
- [x] 2026-06-14 20:43 - Added duplicate-cache event titles/details for Recent events.
- [x] 2026-06-14 20:45 - Passed existing scan stop/pause/resume handlers into `TasksPage` and rendered task action buttons for active scans.
- [x] 2026-06-14 20:45 - Ran `npm --prefix ui test`: 104 tests passed.
- [x] 2026-06-14 20:45 - Ran `npm --prefix ui run build`: Vite production build passed.

## Unfinished Work

- [x] Run UI verification and checkpoint.
