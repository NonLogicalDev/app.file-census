---
date: 2026-07-17
status: complete
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
3. [x] Verify: full backend suite (79 pass); real NLBackup scans — 347-file photoslibrary (correct counts, full hash population); 27G/14.5k-file perf scan (468s / ~58 MB/s full triple-hash, peak RSS 38 MB proving the unbounded hash buffer is cheap); boundary light-vs-full audit that surfaced the build.rs bug, now fixed and re-verified (28.13 MiB file samples correctly; 14/14 small files hash whole).

## Learning Log

- **`src/backend/build.rs` is the compile-time source of truth for the
  light-hash sampler knobs, NOT scanner.rs's `option_env!` defaults.** build.rs
  reads the real env (with its own defaults), re-emits each knob as a
  `cargo:rustc-env=...`, and `rerun-if-env-changed` tracks them. scanner.rs's
  `parse_env_usize(option_env!(...), DEFAULT)` then reads the *injected* value,
  so the scanner-side DEFAULT is dead code unless build.rs stops emitting that
  var. Keep the defaults in the two files in sync.
- That wiring — not a stale artifact — caused the earlier "at least 5 slices"
  failure: build.rs injected `SLICE_COUNT=2`. The scanner count clamp
  (`<5 → 5`) masked it, but `SLICE_WIDTH` had no clamp so build.rs's old 5 MiB
  default leaked through, inflating the whole-file threshold to 31 MiB and
  making 28–31 MiB files hash whole (blake3_light == blake3). Caught only by
  diffing light vs full on real 27G NLBackup media. Fix: update build.rs
  defaults (count 5, slice 4 MiB) and emit HEAD/TAIL (8 MiB).
- A compile-time `const _: () = assert!(LIGHT_HASH_SLICE_COUNT >= 5);` guards
  the count floor regardless of the env knobs.
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
- [x] 2026-07-17 - Step 3: NLBackup correctness scan (347 files, 0 errors, all hashes populated) + 27G perf scan (14577 files, 0 errors, 468s, peak RSS 38 MB). Two-phase ordering confirmed (all dirs flushed before any files).
- [x] 2026-07-17 - CLI `scans start --hash-policy full|light` flag added (plan-069 step 7).
- [x] 2026-07-17 - Found & fixed build.rs overriding light-hash defaults (old count 2 / slice 5 MiB, no HEAD/TAIL). Re-verified sampled-vs-whole boundary on real media.

## Unfinished Work

- [ ] None for plan-071. Remaining light-hash work lives in plan-069:
      `likely_safe` delete-check taxonomy (step 5) and CAS metadata store
      (step 6) — each its own safety-/subsystem-scale effort.
