---
date: 2026-06-13
status: complete
subject: abrupt-exit-scan-recovery
---

# Abrupt Exit Scan Recovery

## Goal

Recover cleanly when the app exits abruptly, especially while a scan is in progress.

## Context

Scans can be interrupted by process crashes, forced quit, machine sleep/shutdown, or closing the Tauri app while workers are running. On next startup, the app should detect scans left in an active/incomplete state and guide the user toward a repair or continuation path rather than silently showing stale `running`/`scanning` state.

## Decisions

- Treat active scan statuses found at startup with no live worker as interrupted.
- Surface interrupted scans clearly in the UI and CLI.
- Prefer “repair/continue” language over pretending the previous worker is still alive.
- Reuse existing repair/update scan mechanics where possible, but add explicit recovery affordances and state transitions where needed.
- Reconcile interrupted scans from app/server startup entrypoints, not from `Database::open`, because direct CLI readers may inspect a DB while another process is legitimately scanning.
- Current POC limitation: there is no durable cross-process scan worker lease/heartbeat yet, so startup recovery assumes the starting app/server owns reconciliation for that DB.

## Implementation Steps

- [x] Inspect scan status lifecycle in backend scanner, DB, RPC startup, and CLI paths.
- [x] Define interrupted/recoverable scan status behavior.
- [x] Add startup reconciliation for active scans without workers.
- [x] Expose interrupted scans through overview/scans APIs.
- [x] Add UI callout/action to repair or continue interrupted scans.
- [x] Add CLI output/command path for listing and repairing interrupted scans.
- [x] Add backend tests for active scan recovery after simulated abrupt exit.
- [x] Browser-verify interrupted scan UX.

## Learning Log

- 2026-06-13 20:43 - Recovery must be based on durable DB scan state plus current worker registry, not just frontend WebSocket status.
- 2026-06-13 21:01 - Durable scan state is `scans.status` plus `finished_at`; active persisted statuses are `running`, `repairing`, `paused`, and `stopping`.
- 2026-06-13 21:02 - `AppCore::open` and `web::serve_listener` are the app/server startup points; both now mark orphaned active scans `interrupted`.
- 2026-06-13 21:06 - Browser verification used a temporary seeded DB/server. Server startup converted a stale `running` scan to `interrupted`; the scan page displayed the `Interrupted` status and repair callout after WebSocket RPC connected.

## Work Log

- [x] 2026-06-13 20:43 - Captured planned recovery task from user request.
- [x] 2026-06-13 21:00 - Added failing backend regression test for active scan recovery.
- [x] 2026-06-13 21:01 - Added `Database::recover_interrupted_scans`.
- [x] 2026-06-13 21:02 - Wired recovery into native app and web server startup and emitted `scan_recovery_completed`.
- [x] 2026-06-13 21:03 - Added AppCore startup recovery test.
- [x] 2026-06-13 21:04 - Added frontend `Interrupted` status label and scan repair callout.
- [x] 2026-06-13 21:05 - Verified `npm --prefix ui test`.
- [x] 2026-06-13 21:05 - Verified `nix develop -c cargo test -p file-census-backend`.
- [x] 2026-06-13 21:05 - Verified `npm --prefix ui run build`.
- [x] 2026-06-13 21:06 - Browser-verified interrupted scan UX on a temporary server at port 3870.

## Unfinished Work

- [x] Implement abrupt-exit scan detection and repair/continue UX.
