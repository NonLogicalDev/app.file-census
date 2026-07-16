---
date: 2026-07-16
status: in-progress
subject: scan-pause-resume-repair
---

## Goal

Restore reversible scan **pause/resume** and non-destructive **repair** control,
lost in the 2026-07-14 recovery (plan-015). Backfill inventory items #2/#3 from
[plan-067](plan-067%20browsing-performance-restore.md).

## Context

The recovered scanner (`src/backend/src/scanner.rs`) supports only stop, via a
per-scan `Arc<AtomicBool>` in `ScanProgressStore.cancel`. There is no pause/wake
coordination, no `prepare_repair_scan`, and the RPC/CLI surfaces are stubbed
(`scans pause/resume/repair` → `unavailable_command`; UI `FileExplorer.jsx` shows
"Pause and resume unavailable"/"Repair unavailable"). plan-015 shipped:
per-scan control objects (stop+pause+resume+wait/wake), cooperative pause checks
in the discovery/metadata/hashing workers, and a repair scan that seeds valid
rows (non-empty hash, no error) from a source scan then only processes un-seeded
files, respecting excludes.

## Decisions

- Pause is scanner coordination, not UI-only: workers park at a safe point
  (top of each work-item loop) via a `ScanControl` (stop `AtomicBool` + `Mutex<bool> paused` + `Condvar`). Stop wakes paused workers so they drain and exit.
- Pause/resume are in-memory (progress status + control). The DB `scans.status`
  stays `running` during a live scan; pause is inherently in-process (a crash
  while paused yields an interrupted scan, handled by existing recovery). Avoids
  extra DB writes on the hot path.
- Paused scans remain "active" so sidebar/progress/stop/resume stay reachable
  (UI `isActiveStatus` already includes `paused`).
- Repair = new scan seeded with valid source rows, then walk + process only
  un-seeded files; non-destructive (never mutates the source scan).
- CLI foreground scans cannot pause (no live control channel); the CLI
  pause/resume commands target a running server via the RPC client, matching stop.

## Implementation Steps

1. [x] `ScanControl` struct + swap `cancel` map to `Arc<ScanControl>`; keep stop semantics.
2. [x] `ScanProgressStore::{pause,resume,is_paused,wait_while_paused}` + `scan_paused`/`scan_resumed` events.
3. [x] Cooperative `wait_while_paused` at the top of discovery/metadata/hash worker loops.
4. [x] RPC `scans.pause`/`scans.resume` in AppCore (native) + web dispatch.
5. [x] CLI `scans pause`/`scans resume` via the server RPC client (un-stub).
6. [ ] `Database::prepare_repair_scan` + repair skip logic + `scans.repair` RPC/CLI.
7. [ ] UI: replace the "unavailable" callouts with real Pause/Resume/Repair actions.
8. [x] Tests: pause/resume/stop-while-paused control-state test; repair seeding test.

## Learning Log

- Pause ≠ stop: stop may discard in-memory state after flushing; pause must keep
  worker state resumable. `ScanControl::wait_while_paused` blocks on the Condvar
  while `paused && !stop`, so a stop during pause returns immediately and the
  worker drains.

## Work Log

- [x] 2026-07-16 00:50 - Created plan; mapped current stop-only control + worker loops.

## Unfinished Work

- [ ] Repair (step 6) + UI (step 7).
- [ ] Native (Tauri) pause/resume/repair buttons parity (shared AppCore RPC covers dispatch).
