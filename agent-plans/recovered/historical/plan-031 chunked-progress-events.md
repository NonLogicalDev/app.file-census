---
date: 2026-06-13
status: complete
subject: chunked-progress-events
---

## Goal

Restore live scan progress across app instances without reintroducing per-file SQLite event-journal writes, and make user-facing recent events useful rather than raw transport noise.

## Context

The repair performance investigation found native `AppCore` was synchronously recording high-frequency `scan_progress` events into `app_events`. Filtering those events fixed SQLite contention, but it removed the persisted progress path used by other app instances to learn about scans they did not start.

## Decisions

- Keep raw `scan_progress` and `scan_log` as live in-process events.
- Persist a throttled `scan_progress_snapshot` event for cross-instance updates.
- Compact persisted progress payloads, including only a small log tail.
- Persisted event writes must run off the scan hot path. The recorder can drop journal events if the bounded queue is full, but it must not block scanning.
- Keep SQLite connections in WAL mode and cover that with a regression test.
- Hide progress/log transport events from dashboard/task recent-event lists.

## Implementation Steps

- [x] Add backend test proving progress snapshots are chunked in the app event journal.
- [x] Add SQLite WAL regression coverage.
- [x] Implement throttled `scan_progress_snapshot` recording on a nonblocking journal queue.
- [x] Add UI helper/test for user-facing event filtering.
- [x] Apply dashboard/task filtering and labels.
- [x] Run backend and UI verification.

## Learning Log

- The app needs two event lanes: high-frequency live transport for the current process, and lower-frequency persisted journal events for cross-process awareness.
- Persisting every progress event creates SQLite writer pressure and fills `app_events` with non-user-facing noise.
- The event recorder previously ran synchronously inside `EventHub::emit`; any SQLite write there can block scan progress emission. The recorder now needs to enqueue quickly and let a background worker persist snapshots.

## Work Log

- [x] 2026-06-13 23:24 - Confirmed regression mechanism: cross-instance/native replay lost progress when raw `scan_progress` was fully removed from the event journal.
- [x] 2026-06-13 23:24 - Added failing backend regression for persisted `scan_progress_snapshot`.
- [x] 2026-06-13 23:30 - Added nonblocking journal queue, throttled snapshots, WAL coverage, and UI event filtering/formatting.
- [x] 2026-06-13 23:31 - Verified targeted backend snapshot/WAL tests, full backend tests, full UI tests, and Vite production build.

## Unfinished Work

- [x] Verify app instances receive chunked progress updates without repeated raw `scan_progress` dashboard rows.
