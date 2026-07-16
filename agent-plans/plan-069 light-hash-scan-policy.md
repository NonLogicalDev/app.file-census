---
date: 2026-07-16
status: in-progress
subject: light-hash-scan-policy
---

## Goal

Restore `blake3_light`, a compile-time-configured uniform-sample fingerprint for
cheaply inventorying slow disks, and a Full/Light scan policy (plan-064).
Backfill inventory item #5 from [plan-067](plan-067%20browsing-performance-restore.md).

## Context

plan-064 (recovered/historical) was `in-progress` (never finished) even before
the 2026-07-14 deletion, and none of it survived recovery: no `files.blake3_light`
column, no sampler, no Full/Light policy, no `likely_safe` delete-check, no CAS
metadata store. It is the largest and most safety-sensitive backfill item — it
touches the hashing hot path and delete-check safety.

## Decisions

- Implement in safe, independently-valuable layers, not one risky drop:
  1. **Sampler primitive** (this commit): pure, compile-time-configured
     (`FILE_CENSUS_LIGHT_HASH_SLICE_COUNT`≥2 default 3, `..._SLICE_WIDTH` default
     5 MiB, `..._TERMINAL_SLICE_WIDTH` default 5 MiB). First+last slices anchored
     at start/end using terminal width; interior slices use slice width, evenly
     distributed. Files ≤ `2*terminal + (count-2)*slice` hash whole → can equal
     full BLAKE3. No wiring into dedup/delete-check, so zero safety risk.
  2. Schema `files.blake3_light` + `NewFile.blake3_light`; populate during Full
     scans; add a Light scan policy (sampled-only).
  3. `likely_safe` delete-check taxonomy (exact = blake3+size; strong =
     blake3_light+size; different size = false positive) — **separate** output
     from the exact `safe` boolean. SAFETY-CRITICAL: do the layer deliberately.
  4. CAS metadata store (SHA-256-keyed blobs + per-file refs) — its own subsystem.
  5. CLI/UI scan-start Full/Light controls.
- `blake3` stays the exact-content hash; `blake3_light` is heuristic, labeled
  separately, and must never silently feed exact duplicate detection or the
  exact delete-check `safe`.

## Implementation Steps

1. [x] Sampler primitive: `light_hash_slice_plan(size)` + `blake3_light_of_bytes`/file, compile-time knobs, tests (whole-file threshold, slice offsets, determinism).
2. [ ] `files.blake3_light` column + `NewFile.blake3_light`; insert path; populate in `hash_open_file` (Full).
3. [ ] `HashPolicy` (Full/Light) through `prepare_scan`/scanner; Light computes light-only.
4. [ ] CLI `scans start --hash-policy` + UI scan-start control.
5. [ ] `likely_safe` delete-check taxonomy (SAFETY-CRITICAL, dedicated).
6. [ ] CAS metadata store + EXIF refs.
7. [ ] Expose blake3_light in grid/search where useful.

## Learning Log

- Safety boundary (plan-064): light hashes are heuristics, not proof. Exact
  delete-check `safe` and exact duplicate detection stay full-hash only; light
  coverage is a separate `likely_safe`/"Likely covered elsewhere" signal.

## Work Log

- [x] 2026-07-16 02:40 - Created plan; scoped the safe layering.

## Unfinished Work

- [ ] Steps 2–7. The sampler primitive (step 1) also unblocks `perf_gates.rs`'s
  `NewFile.blake3_light` once step 2 lands (backfill #7 full).
- [ ] Steps 5 (likely_safe) and 6 (CAS) are safety-/subsystem-scale; treat each as
  its own careful sub-effort rather than bundling.
