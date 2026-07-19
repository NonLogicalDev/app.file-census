---
date: 2026-07-18
status: in-progress
subject: delete-check-unification-and-fixes
---

## Goal

Land the Delete Check redesign coherently and fix the regressions introduced by
reactive, half-finished iteration. The app is currently in a confused state:
two overlapping control sets, wrong/blank backup markers, sluggish browsing on
the default DB, and a hanging Delete Check.

## Confirmed facts (investigated, not assumed)

- **Redundant controls**: the Locations browser now shows BOTH the old subview
  tabs `[Files | File tree | Delete Check]` AND the new `[Browse | Flat]`
  toggle. This is incoherent and half-finished.
- **Backup markers wrong**: the ready duplicate-cache run (`f79e6aac`, scope =
  b668d2e6 only, 133,639 files = 275,492 − 141,853 `._*` excluded) has
  `safe/warn/unsafe/copies_here/copies_away` **all 0**. It was built by the old
  binary; the new columns defaulted to 0, and the rebuild fingerprint does NOT
  include a cache schema version, so `run_rebuild_duplicate_cache` SKIPS the
  rebuild → markers never populate. Root cause: fingerprint has no schema
  version.
- **No representative scans** are set for either location, and disk-nlbackup has
  5 scans (3 interrupted, 1 running, 1 complete). Scope/representative handling
  must be re-examined so the refcount model is meaningful and cannot count
  cross-scan snapshots of the same physical file as a "backup" (a risk once the
  cache actually computes).
- **Browsing still sluggish** on the default DB, and **Delete Check hangs** —
  both need to be measured (which query, how long) before fixing. Do NOT assume.

## Decisions (to confirm with user where noted)

- Intended view model: `[Browse]` = the tree table (immediate-children + folder
  nav); `[Flat]` = a paginated path+file list of all descendants. Retire
  `[Files | File tree | Delete Check]`. Backup filter `[All|Unsafe|Warn|Safe]`
  is the only "delete check" surface. Verdict/CTA appear only when filtering.
- Refcount safety must not treat another SCAN of the same location (a snapshot
  of the same physical files) as a backup. Only: (a) same-scan duplicate files
  at different paths, and (b) other LOCATIONS' representative scans, count.

## Implementation Steps

1. [x] Diagnose the three regressions with measurements (no guessing):
       a. browsing latency on the default DB (which query, wall time);
       b. what makes Delete Check hang (which call);
       c. confirm the stale-cache/fingerprint root cause end-to-end.
2. [x] Fix the cache fingerprint to include a schema version so column additions
       force a rebuild; verify markers populate on the live DB.
3. [ ] Make the refcount scope correct (representative-scan-based; exclude
       same-location cross-scan snapshots). Add tests.
4. [ ] Consolidate the interface: retire the old subview tabs; unify into
       `[Browse | Flat]` + Backup filter; Browse=tree, Flat=path+file list.
5. [ ] Fix / retire the hanging Delete Check path (old delete_check on 275k).
6. [ ] Row-select delete action with delete-time survivor check.
7. [ ] Verify end-to-end against /Volumes/NLBackup + the default DB.

## Perf receipts (default DB, scan b668d2e6, 133,639 visible files under one folder)

Measured on an isolated copy (release binary), warm runs:

| Operation                | Before      | After   |
|--------------------------|-------------|---------|
| Browse tree (root)       | 2.5–10 s    | ~0.15 s |
| Browse into PHOTO_FILTER | 0.45–2.1 s  | ~0.15 s |
| Flat list (all)          | 18 s (count)| ~0.5 s  |
| Flat list (unsafe)       | 6 s (count) | ~0.1 s  |
| delete-check (CLI)       | (UI hang)   | instant |

Root causes and fixes:
- Every tree navigation copied ~141k excluded ids into a temp table
  (`prepare_excluded_file_ids`) and then re-aggregated the whole subtree.
  → `scan_tree_immediate_children` now reads pre-rolled per-dir rows straight
  from `duplicate_cache_path_counts` via a new `parent_path` index (O(children));
  `visible_scan_file_totals` anti-joins the persistent `scan_excluded_files`.
- `current_duplicate_scope` (run on every navigation) did a `SUM(size)` over the
  whole scan per scope scan. → visible totals are cached in `scan_exclusion_cache`
  and refreshed on the same trigger as the exclusion set; read O(1).
- Flat `COUNT(*)` joined the cache over all 133k descendants. → total now sums
  the per-child rollup columns over `parent_path = prefix` (O(children)).
- Cache shape bumped to v4 (parent_path + per-dir file_count/total_size rollups).
- Added `duplicates rebuild` and `scans tree --flat --backup` CLI commands for
  deterministic measurement / parity.

## Learning Log

- Adding columns to a fingerprinted cache without bumping the fingerprint's
  schema version leaves existing "ready" runs stale forever — the rebuild skips.
- Reactive, per-message UI changes produced two overlapping control sets. The
  view model must be decided and consolidated in one pass, not accreted.

## Work Log

- [x] 2026-07-18 - Investigated: stale all-zero cache (old-binary build,
  fingerprint has no schema version); redundant control sets; no representative
  scans; scope was b668d2e6-only (excludes correctly honored).

## Unfinished Work

- [ ] Steps 1–7. Do not add further features until the interface is coherent and
  the regressions are measured and fixed.
