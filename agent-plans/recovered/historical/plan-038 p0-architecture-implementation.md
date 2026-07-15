---
date: 2026-06-14
status: complete
subject: p0-architecture-implementation
---

# P0 Architecture Implementation

## Goal

Implement the P0 recommendations from `docs/architecture-decisions.md` in focused, test-backed slices:

- Protect performance and control responsiveness with benchmark gates.
- Add durable scan job/control-state foundation.
- Preserve discovery/metadata/hash separation.
- Harden stop/delete behavior so stale active rows do not wedge the UI.

## Context

The architecture doc identified P0s after the scanner performance work. The current repo already has fast discovery, throttled progress, WAL, cancellable RPCs, and optimized plain prefix delete-check. Remaining P0 gaps are mostly around tests/gates, persisted scan operation state, and deletion semantics for active-looking rows left behind by interrupted processes.

## Decisions

- Start from the clean `3a1fe39` architecture checkpoint. `git checkpoint "before p0 implementation"` was attempted but correctly produced no commit because the tree was clean.
- Treat persisted `running/repairing/paused/stopping` rows as deletable from the DB layer. A DB row cannot prove a live worker exists; live workers are controlled through `ScanProgressStore`.
- Keep active worker stop/pause controls in memory for this slice, but persist requested control state so abrupt exits and cross-process observers can see user intent.
- Add benchmark commands/tests around existing hot paths before deeper scanner redesign.
- Preserve the two-stage production scanner. Do not reintroduce interleaved discovery and hashing.

## Implementation Steps

- [x] Create plan and record baseline checkpoint attempt.
- [x] Add failing DB tests for deleting persisted active scans and locations.
- [x] Implement deletion semantics and control-state persistence.
- [x] Add benchmark command surface for P0 read/delete hot paths.
- [x] Add tests for benchmark commands and scan-control persistence.
- [x] Run focused backend tests.
- [x] Checkpoint stable implementation batches.

## Learning Log

- 2026-06-14 18:30 - `delete_scan` and `delete_location` currently refuse `running`, `repairing`, `paused`, and `stopping` scan rows. That is safe for a live process but wrong for stale active rows from abrupt exit or UI deadlock scenarios.
- 2026-06-14 18:30 - Live process control remains `ScanProgressStore`; DB deletion should not be blocked by stale status strings.
- 2026-06-14 18:43 - Persisted stop/pause/resume requests now update scan status/control columns in SQLite while still waking local in-memory workers. This gives cross-process observers durable intent without replacing cooperative in-process controls yet.
- 2026-06-14 18:43 - Full delete-intent cleanup for truly live scans is larger than this slice. Current P0 fix removes the stale-row blocker and makes SQLite wait up to 30s on busy writes instead of failing immediately.
- 2026-06-14 19:00 - Performance gates are ignored integration tests by design. Normal tests compile them, while `just perf-gates` explicitly runs them in release mode. Budgets and synthetic scale are env-configurable.

## Work Log

- [x] 2026-06-14 18:30 - Attempted pre-work `git checkpoint "before p0 implementation"`; no commit created because the worktree was clean.
- [x] 2026-06-14 18:30 - Inspected scanner, app/web RPC, DB delete/recovery paths, CLI benchmark command, and Justfile.
- [x] 2026-06-14 18:43 - Added red tests for deleting persisted active scans/locations, verified expected failures, implemented DB delete behavior, and reran focused delete tests.
- [x] 2026-06-14 18:43 - Added durable scan-control request methods, wired AppCore and web RPC/REST stop/pause/resume through them, and verified focused control tests.
- [x] 2026-06-14 19:00 - Added `src/backend/tests/perf_gates.rs`, `just perf-gates`, and `just bench-discovery`.
- [x] 2026-06-14 19:00 - Verified perf-gate compilation and ran ignored release gates at validation scale: 7 passed.
- [x] 2026-06-14 19:04 - Ran full backend package tests: 61 lib tests passed, 18 CLI tests passed, 7 perf gates compiled as ignored, doc tests passed.
- [x] 2026-06-14 19:04 - Ran `just perf-gates` with validation scale overrides: 7 release perf gates passed.

## Unfinished Work

- [x] Run broader backend verification.
- [x] Checkpoint the full P0 implementation pass.
