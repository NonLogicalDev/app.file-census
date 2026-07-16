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
7. [x] Backfill inventory (see Backfill Inventory table) of everything else the recovery lost.

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
- [x] 2026-07-15 23:45 - Built the code-verified recovery backfill inventory (10 items); confirmed the duplicate-cache worker has zero callers and delete-check lost its sargable path-range optimization.

## Backfill Inventory (recovery losses, code-verified 2026-07-15)

Severity: **P1** blocks a core workflow / silently wrong; **P2** meaningful
feature or perf loss; **P3** cleanup.

| # | Lost capability | Plan | Evidence in current code | Sev |
|---|---|---|---|---|
| 1 | ✅ DONE — **Duplicate cache never built**. Wired `run_rebuild_duplicate_cache` (new sync core) on scan completion in all surfaces (app.rs/web.rs async, cli.rs foreground) + `spawn_rebuild_if_stale` at web startup. E2E verified: CLI scan → cache ready → tree browse reads per-scan-per-dir counts. | 039 | was: def only, no caller | P1 |
| 2 | ✅ DONE (plan-068) — **Scan pause/resume** restored: `ScanControl` (stop+pause Condvar), workers park via `wait_while_paused`, RPC `scans.pause`/`scans.resume` (AppCore/web/REST) + CLI + UI (FileExplorer + Tasks). | 015 | — | P2 |
| 3 | ✅ DONE (plan-068) — **Scan repair** restored: `prepare_repair_scan` seeds valid rows + reprocesses only missing, honest counts; RPC/CLI/UI. | 015,028 | — | P2 |
| 4 | ✅ DONE (CTE part) — **Delete-check optimization**. Replaced the correlated per-file `NOT EXISTS(files other …)` with a materialized `other_hashes` CTE (plan-036). Measured 2.49s→0.81s warm (~3×), identical results, on 16,349 files vs a 23,822-file other location. Deferred: sargable path-range predicate (the substr path scan is O(scan) not quadratic; risky upper-bound on arbitrary path bytes). | 036 | db.rs:3628 | P2 |
| 5 | **Light-hash scan policy** — fully absent. No `blake3_light` column, no Full/Light `HashPolicy`, no `likely_safe`/covered-elsewhere taxonomy, no CAS metadata blob store. | 064 | files schema has no blake3_light; scanner.rs has no hash policy | P2 |
| 6 | **EXIF enrichment** — partial. On-demand EXIF *viewing* already works (`media.rs::exif_for_path`, read live on file inspect). Missing: the plan-040 background enrichment PASS (bulk `file-extra-info exif` — CLI stubbed, no `file_extra_info.*` RPC, no `ExtraInfoProcessor`) and the `file_exif` cache population. Lower urgency since viewing works. | 040 | media.rs:292; cli.rs:1794 | P2 |
| 7 | **Discovery benchmark harness** — `scanner::benchmark_discovery` gone; `scans benchmark-discovery` stubbed; `perf_gates.rs` (gated behind `perf-gates` feature) references unrecovered APIs. | 036,038,065 | scanner.rs (no fn); cli.rs:859 | P2 |
| 8 | **UI recovery-horizon gap** — promoted production UI is pre-redesign June source; the July shadcn redesign survives only as excluded diff events. Being backfilled by re-porting the prototype screen-by-screen. | 065 | Tasks + Locations ported (commits 4066e66, c71ab0b) | P2 |
| 11 | **Scanner throughput regressions (plan-036)** — DONE(batch): write batch was `25` for progress scans / `500` CLI (plan-036 set **2,048** for both) — fixed. DEFERRED(arch): discovery→metadata handoff bounded at `sync_channel(512)` and hash queue `sync_channel(128)` (plan-036/041 unbounded), and scanning is interleaved rather than two-phase (discover-all → enrich); coupled + memory-sensitive, needs a scanner-architecture plan. | 036,041 | scanner.rs:570,595-596 | P2 |
| 9 | ✅ DONE — `scans nickname`. Added `Database::update_scan_nickname` (the `nickname` column already existed) and wired the CLI; empty string clears. Verified end-to-end. | — | cli.rs:958 | P3 |
| 10 | Redundant test-only `scan_tree` still computes duplicate counts inline (slow subqueries); only used by 2 tests. Remove or unify with `scan_tree_page`. | 032 | db.rs:1664 | P3 |

## Unfinished Work

- [x] 2026-07-16 - Wire duplicate-cache rebuild trigger (#1): scan-completion (app/web/cli) + web startup stale-guard. E2E verified. Note: cache is scoped to complete/representative scans, so interrupted/stopped scans (e.g. every scan in the current prod DB) show unknown (0) until a complete scan exists — this is more truthful than the old inline same-scan count off partial data.
- [x] 2026-07-16 - Delete-check `other_hashes` CTE (#4): 2.49s→0.81s warm, results identical. Deferred sargable path-range predicate + perf gate.
- [x] 2026-07-16 - Restored `scans nickname` (#9); EXIF viewing found already working (#6 narrowed to the background pass).
- [ ] 2026-07-16 - HEAVY items need a go/no-go — scoped below:
  - **#2/#3 pause/resume/repair (plan-015)**: infrastructure fully gone (scanner has only `cancel`/stop; no pause/wake Condvar, no `prepare_repair_scan`, no paused/repairing transitions). Large: per-scan control objects + cooperative pause checks in discovery/metadata/hashing hot loops + repair-seed query + RPC/CLI/UI. Risk: touches the scan hot path. ~own plan.
  - **#5 light-hash policy (plan-064)**: largest, and was `in-progress` (never finished) even pre-deletion. New schema column + sampled hash + Full/Light policy + `likely_safe` taxonomy + CAS store. Recommend: skip unless explicitly wanted.
  - **#6 EXIF background pass (plan-040)**: medium; viewing already works. Needs `ExtraInfoProcessor` + background task + RPC.
  - **#7 benchmark_discovery + perf_gates (plan-036/038)**: medium; non-user-facing harness. Useful to guard the perf work.
  - **#10 remove redundant `scan_tree`**: P3 cleanup; 2 tests depend on it (inline dup counts) so needs test rework.
- [ ] Scope pause/resume/repair restoration (#2,#3) — larger; needs scanner control-object work from plan-015.
- [ ] Scope light-hash policy + EXIF RPC restoration (#5,#6) if still desired.
- [ ] Recover `benchmark_discovery` + reconcile `perf_gates.rs` (#7).
- [ ] Continue UI horizon port (#8): remaining Duplicates polish, sidebar/command-palette.
- [ ] Remove redundant `scan_tree` (#10).
