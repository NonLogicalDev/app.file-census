---
date: 2026-07-15
status: in-progress
subject: browsing-performance-restore
---

## Goal

Restore fast directory/file browsing (and other perf work) that regressed during
the 2026-07-14 deletion recovery, and inventory what else the recovery lost so it
can be backfilled deliberately.

## Context

Browsing a large default DB (`~/Library/Application Support/file-census/file-census.db`,
230 MB, 75,788 files, 4 scans; biggest scan 26,676 files) is "very very laggy."
A gitignored working copy lives at `scratch-perf/file-census-copy.db`.

Root cause: the recovered `scan_tree_source_rows` (and the test-only `scan_tree`)
in `src/backend/src/db.rs` recompute duplicate counters **inline via two
correlated per-row subqueries** (`other_location_count` = COUNT(DISTINCT other
locations sharing blake3+size; `same_scan_count` = same-scan matches). For a
root browse that is O(descendants × 2 aggregate subqueries). This is a
regression: plan-032 (recovered/historical) explicitly removed that CTE from the
tree hot path — "`scans.tree` must not compute duplicate counters inline …
render as unknown while missing" — and measured their DB dropping to ~0.08s.

The precomputed replacement already exists: `duplicate_cache_path_counts`
(run_id, scan_id, path, kind → duplicate_file_count / original_file_count /
same_scan_duplicate_file_count), built per scope by `duplicate_cache.rs` /
`Database::rebuild_duplicate_cache_for_current_scope`. But in the recovered code
it was **write-only** — no query read it. This is the "duplicate count per scan
per dir, not a CTE" form the user recalled building.

## Product Integration

- Existing model: folder browsing = `scan_tree_page` → `scan_tree_source_rows`
  pulls all descendants under a path prefix, folds them into immediate children
  with `file_count`/`size` and duplicate rollups.
- Intent: browsing must be fast; duplicate counters are secondary and come from a
  background cache, rendering as unknown while the cache is not ready.
- Cleanest model: the tree query reads folder `file_count`/`size` from the
  existing descendant fold and duplicate counters from the scope's ready cache
  run via a PK JOIN — never recomputed inline. This matches plan-032/plan-039.
- Pieces that change: `scan_tree_source_rows` query + `TreeSourceRow` +
  `build_tree_page_entries` fold; `scan_tree_page` passes the ready run id. The
  test-only `scan_tree` is now redundant (still inline) and should be removed.
- Architecture impact: browsing no longer depends on live duplicate scanning;
  correctness of duplicate counters depends on the duplicate cache being built.

## Decisions

- Remove the inline duplicate-count subqueries from the browsing hot path; do NOT
  keep a fallback to them (that defeats the fix).
- Source duplicate counters from `duplicate_cache_path_counts` for the run that
  `scan_tree_page` already reports as the scope's `duplicate_cache` status, only
  when that status is `ready`. When absent, counters are 0 ("unknown").
- Bind the ready run id as `?3`; a NULL binding makes the LEFT JOIN miss, so no
  ready run ⇒ all counters 0 with no special-casing.
- Add the `busy_timeout` (30s) documented in plan-038 to `Database::connect`.
  Do NOT add undocumented PRAGMAs (mmap/cache_size) — plans only document WAL +
  busy_timeout.
- Left `scan_tree` (test-only, not reachable from app/web/cli) unchanged this
  pass to keep the diff isolated; flagged for removal in Unfinished Work.

## Implementation Steps

1. [x] `TreeSourceRow` carries `duplicate_file_count`/`original_file_count`/`same_scan_duplicate_file_count` sourced from the cache.
2. [x] Rewrite `scan_tree_source_rows`: drop the duplicate-scope CTEs and both correlated subqueries; LEFT JOIN `duplicate_cache_path_counts` on (run_id=?3, scan_id, path).
3. [x] `build_tree_page_entries` uses the three cache-sourced per-file counts directly (dir rows roll them up).
4. [x] `scan_tree_page` passes the scope's ready cache run id (from the `duplicate_cache` status it already computes).
5. [x] Add `busy_timeout(30s)` to `Database::connect` (plan-038).
6. [x] Regression test `scan_tree_duplicate_counts_come_from_cache_not_inline` (unknown=0 before cache; correct per-file and dir-rollup counts after `rebuild_duplicate_cache_for_current_scope`).
7. [ ] Backfill inventory (see Unfinished Work) of everything else the recovery lost.

## Learning Log

- Measured on `scratch-perf/file-census-copy.db`, biggest scan (26,676 files),
  root tree depth=1 via the real CLI `scans tree` path:
  - Old (inline subqueries): 1.99s cold / ~0.94s warm.
  - New (cache JOIN, no ready run): 0.29s cold / ~0.15s warm. ≈6× warm.
  - Raw SQL isolation: 0.49s→0.155s wall, user-CPU 0.33s→0.014s (~23×).
  The real-path gap exceeds raw SQL because the `excluded_file_ids` LEFT JOIN
  compounds the per-row subqueries.
- `duplicate_cache_path_counts(&files)` computes exactly the per-file booleans the
  tree needs (duplicate = another location shares blake3+size; original = its
  complement; same-scan = same blake3+size >1 in scan) and rolls them up to every
  ancestor dir path — a precise drop-in for the removed subqueries.
- `duplicate_cache_run_scans` maps runs→scans; `duplicate_cache_runs.status` gates
  readiness. `scan_tree_page` already computes the scope's `DuplicateCacheStatus`
  (run_id + status), so the tree can reuse it without a second lookup.
- Consequence of the fix: duplicate counters are 0 until a cache run is `ready`.
  The duplicate cache is built by the `duplicate_cache.rs` worker, which is NOT
  triggered on scan finish — so browsing shows 0 duplicates until something builds
  the cache. This is correct per plan-032 but needs an auto-rebuild trigger to be
  useful (backfill item).

## Work Log

- [x] 2026-07-15 22:10 - Copied prod DB to `scratch-perf/file-census-copy.db`; confirmed 75,788 files / 4 scans, 230 MB, only WAL+foreign_keys pragmas.
- [x] 2026-07-15 22:40 - Root-caused browsing lag to inline duplicate-count correlated subqueries in `scan_tree_source_rows`/`scan_tree`; confirmed `duplicate_cache_path_counts` is write-only (no reader).
- [x] 2026-07-15 22:55 - Cross-checked against plan-032 (CTE removal) and plan-038 (busy_timeout); reconstructed the intended cache-JOIN design.
- [x] 2026-07-15 23:20 - Implemented steps 1–5; backend compiles; 68 existing tests pass.
- [x] 2026-07-15 23:33 - Added regression test (step 6); full backend suite 69 tests pass. Measured ≈6× warm browse speedup end-to-end on the copy DB.
- [ ] 2026-07-15 23:40 - Build the recovery backfill inventory.

## Unfinished Work

- [ ] **Backfill inventory** — audit recovered code vs plan claims and enumerate lost work. Known candidates to confirm/scope:
  - [ ] Duplicate cache is never auto-rebuilt (no trigger on scan finish / location change), so browsing duplicate counters stay 0 until the Duplicates flow runs. Wire an auto/background rebuild (plan-039).
  - [ ] Scan **pause/resume** unavailable in this build (UI shows "unavailable"; core lost) — plan-015.
  - [ ] Scan **repair** unavailable (`scans repair` → `unavailable_command`; UI shows "Repair unavailable") — plan-015.
  - [ ] Verify plan-036 delete-check SQL optimization (indexable path-range predicates + `other_hashes` CTE; 4.3s→0.05s) survived recovery in `delete_check_*`.
  - [ ] `perf_gates.rs` is gated behind the `perf-gates` feature and targets some unrecovered APIs (plan-065) — reconcile.
  - [ ] Remove the redundant test-only `scan_tree` (inline subqueries) or unify it with `scan_tree_page`.
  - [ ] The UI recovery-horizon gap (pre-redesign June UI vs July redesign) — tracked in plan-065; Tasks + Locations already ported.
- [ ] Commit the perf fix as a checkpoint.
