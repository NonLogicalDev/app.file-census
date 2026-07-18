---
date: 2026-07-17
status: in-progress
subject: two-phase-scan-and-light-hash-settings
---

## Goal

Performance round for scanning SD cards this weekend:
1. **Two-phase scan** — run discovery+metadata to completion first, then hash, so
   the walker never competes with heavy hash reads on slow/removable media
   (plan-036 architecture, backfill #11).
2. **Light-hash settings** — ≥5 slices by default, with **head and tail slice
   widths individually configurable and larger** than interior slices, for
   effective sampled fingerprints on SD cards (plan-064).

## Context

- Current `run_prepared_scan` (`src/backend/src/scanner.rs`) runs discovery,
  metadata, and hashing workers concurrently via one `thread::scope` with bounded
  channels (`work` 512, `hash` 128, `result` 256). On slow media, discovery and
  hashing compete for I/O so discovery feels stalled.
- Light-hash sampler consts: `LIGHT_HASH_SLICE_COUNT` (default 3), `SLICE_WIDTH`
  (interior, 5 MiB), and a single `TERMINAL_SLICE_WIDTH` (5 MiB) used for BOTH
  first and last slices. Compile-time env-configured (plan-064 kept it compile-time
  so the sampler shape is stable → light hashes are comparable).

## Decisions

- **Two-phase, barrier-separated.** Phase 1: discovery walker + metadata workers
  stat entries, flush directory rows, and buffer file `HashJob`s (unbounded, so
  the walker never blocks on backpressure). Phase 2: hash workers drain the
  buffered jobs → file rows. Hashing (the heavy read) never runs during the walk.
  Accept the memory cost of buffering hash jobs (unbounded, plan-036/041); log if
  it ever needs a cap.
- Stop stays responsive: a stopped scan after phase 1 skips phase 2 hashing; hash
  workers also check stop per item.
- **Light-hash sampler:** split `TERMINAL_SLICE_WIDTH` into separate
  `HEAD_SLICE_WIDTH` and `TAIL_SLICE_WIDTH`; default `SLICE_COUNT` = 5; head/tail
  default larger than interior. Keep compile-time env (`FILE_CENSUS_LIGHT_HASH_*`)
  so the sampler stays stable/comparable. Defaults: count 5, interior 4 MiB,
  head 8 MiB, tail 8 MiB.

## Implementation Steps

1. [x] Light-hash: separate head/tail widths, default count 5, larger head/tail; update `light_hash_slice_plan` + whole-file threshold; update tests.
2. [x] Two-phase: restructure `run_prepared_scan` into phase-1 (discovery+metadata, buffer hash jobs, flush dirs) + phase-2 (hash, flush files); unbounded hash channel; stop handling.
3. [~] Verify: full backend suite (79 pass), a real NLBackup scan (347-file photoslibrary: correct counts + full hash population; blake3_light==blake3 for sub-threshold files). Larger 27G/14.5k-file perf scan in progress.

## Learning Log

- The earlier "default light hash uses at least 5 slices" test failure was a
  stale build artifact, not a const-eval bug. A compile-time
  `const _: () = assert!(LIGHT_HASH_SLICE_COUNT >= 5);` now guards the default
  regardless of the env knobs, and the min-clamp raises any configured value
  below 5 up to 5.
- Two-phase needed no unbounded WORK channel — the walk/metadata pair stays
  balanced, so only the HASH channel is unbounded (buffers all pending jobs
  between phases). `sync_channel` and `channel` both yield the same
  `Receiver<T>`, so only `metadata_worker`'s sender param changed
  (`SyncSender`→`Sender`); `hash_worker` was untouched.
- A single `process_result` closure (mutable tallies passed as args, not
  captured) runs across both `thread::scope` blocks, keeping DB batching /
  progress identical for phase 1 and phase 2.

## Work Log

- [x] 2026-07-17 - Created plan; mapped `run_prepared_scan` scope/channels and the light-hash sampler consts.
- [x] 2026-07-17 - Step 1: split HEAD/TAIL widths (8 MiB each), default count 5 (min-clamped), compile-time assert, `light_hash_slice_width` helper; updated 2 tests. Committed.
- [x] 2026-07-17 - Step 2: two-phase restructure (unbounded hash buffer, shared process_result closure, per-item stop in hash_worker). 79 backend tests pass. Committed.
- [x] 2026-07-17 - Step 3 (partial): NLBackup correctness scan (347 files, 0 errors, all blake3/blake3_light/sha256 populated). 27G perf scan running.

## Unfinished Work

- [ ] Step 3: finish the 27G/14.5k-file perf scan; confirm timing/behaviour.
- [ ] CLI `scans start --hash-policy` flag (plan-069 step 7) so Light scans are
      launchable from the CLI for SD cards, not just the UI modal.
