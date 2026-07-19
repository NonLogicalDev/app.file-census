---
date: 2026-07-19
status: in-progress
subject: backup-model-and-browse-ux
---

## Goal

Make the scan browser's backup signal honest and the deletion workflow
trustworthy, and remove the remaining browse friction (interactive latency,
column dividers, folders-pane sizing). Follow-on to plan-072 (which consolidated
the browser to `[Browse | Flat]` + backup filter and made queries O(children)).

## Context

Target surface: `src/backend/src/db.rs` (duplicate cache + classification),
`src/backend/src/web.rs` (RPC + cache rebuild triggers), `ui/src/App.jsx`,
`ui/src/components/{FileExplorer,FileGrid,DirectoryTree}.jsx`, `Justfile`.

Live default DB: `/Users/nonlogical/Library/Application Support/file-census/file-census.db`.
Reference scan `b668d2e6` (location `disk-nlbackup`, ~275k files under one
`PHOTO_FILTER` tree, incl. a `PhotoMerge` folder that merges copies of four
Photos libraries). `disk-nlbackup` is the only location with a complete
full-hash scan; the other location (`file-census`) is the app's own tiny DB dir.

Problems reported (2026-07-18/19):
1. Every folder in PhotoMerge showed "all backed up" (green Safe) — bogus,
   because the classification counted SAME-location duplicates as a backup.
2. The Delete Check "set" (add folders/files, then validate what deletion
   affects) was removed in plan-072's consolidation and is still needed; the
   current model is "far too confusing".
3. Changing the excludes list blanked the Backup column.
4. Interactive browsing still takes 3-5s per folder click in the live app.
5. Browse/Flat rows should count unique vs duplicated files (full + light).
6. Column dividers are too faint; resize handles are hard to grab.
7. The Folders (directory-tree) pane is fixed width and should be resizable.

Prior art (the user asked to reuse it, not re-invent):
- **plan-030 delete-check-active-filter**: the Delete Check *set* model —
  persistent per-scan include/exclude path sets; candidate = (includes or all)
  − excludes, then active filter; folders expand to descendants; include state
  survives navigation; selected rows = explicit path mode.
- **plan-064 light-hash-scan-policy**: exact `safe` (full blake3+size) must stay
  separate from `likely` (blake3_light + SAME size); a light hash with a
  different size is a false positive; never collapse heuristic into exact.
- **plan-039 duplicate-cache-task**: cache rebuilds already emit lifecycle
  events and render as background Tasks; no new task table needed.

## Steering Guidance (summarized, chronological)

Durable direction the user gave while this plan was built:
- "All backed up on every folder is bogus" — same-location duplicates must not
  read as backed up. Ambient markers do cross-location checks only.
- Bring back a Delete Check *set* to add folders/files to and validate what a
  deletion would affect; the current model is "far too confusing".
- Precompute duplicate info as a background task whenever the representative set
  or excludes change.
- Reuse prior designs — "we have been through some of this before, check the
  historical agent plans" (plan-030 set, plan-064 safety taxonomy, plan-039
  cache-as-task).
- Interactive browsing is still 3-5s per folder click — find hotspots.
- Folder Backup cell: show `[N safe] [N partial] [N unsafe]` counting UNIQUE
  files per category.
- Keep "Last copy"; for files that have copies show "[X copies exist]".
- Add a Backup scope toggle: Internal (inside location) vs External (outside).
- Prototype the delete-check UI: restore Add-to-Delete-Check actions, a
  membership listing, and a Delete Check toggle for Browse/Flat that filters the
  listing down to just the staged folders/files.
- Table columns need more prominent dividers; otherwise resizing is very hard.
- Folders pane must be resizable.
- Process: use $Tasker_Plan religiously to record all work updates; keep this
  steering guidance in the plan in summarized form; prototype + screenshot UX
  before wiring.

## Product Integration

- **Existing model**: one always-on backup marker per file/folder in Browse/Flat,
  computed by a refcount over the duplicate cache; "delete check" is just the
  backup filter.
- **Real intent**: two DIFFERENT questions were conflated. (a) "Is this backed up
  on another disk?" — an ambient, cross-location awareness signal. (b) "If I
  delete exactly these things, what is destroyed and is any content lost?" — a
  deliberate what-if over a chosen set, using refcounts that account for copies
  inside vs outside the set (incl. same-location).
- **Cleanest model**: keep the ambient marker but make it CROSS-LOCATION only;
  restore the Delete Check *set* (plan-030) as a separate surface that owns the
  refcount/what-if logic. Same-location duplicate counts become metadata
  (copies_here + folder dup counters), not a safety verdict.
- **Pieces that change**: `duplicate_cache_path_counts` classification
  (cross-location); cache-rebuild triggers (excludes/representative changes);
  FileExplorer gains a Delete Check set surface; FileGrid gains dup counters and
  stronger dividers; the folders pane becomes resizable.
- **Why better than a local patch**: the "all backed up" bug is a direct symptom
  of conflating the two questions; separating them fixes the bug and makes the
  delete workflow honest instead of a filter that lies.

## Decisions

- Ambient Browse/Flat markers are CROSS-LOCATION only: `safe` = exact copy in
  another location; `warn`/likely = blake3_light+same-size copy in another
  location (kept separate from exact per plan-064); `unsafe` = neither.
  Same-location copies are surfaced as `copies_here` metadata, never safety.
- Duplicate cache is rebuilt (background Task) whenever the representative set or
  excludes change, not only on scan completion / reconnect.
- Interactive latency root cause is the DEBUG build, not the query. Dev `serve`
  ran `target/debug` (SQLite ~20-30x slower). Add release `run-*` recipes; the
  query itself is ~0.15s in release.
- Delete Check set is restored per plan-030 as a distinct surface (not folded
  back into the ambient browse tabs that plan-072 deliberately removed).

## Requirements added 2026-07-19 (backup display + delete-check set)

- Folder Backup cell shows three chips `[N safe] [N partial] [N unsafe]` where N
  counts UNIQUE files (deduped by content) in each category. Rename the light
  tier from "Similar"/"warn" to **partial** in the UI.
- File Backup cell: keep **"Last copy"** for the unsafe/last-copy case; for files
  that have copies show **"[X copies exist]"** instead of the ⌂/↗ glyphs.
- Add a **Backup scope toggle: Internal (inside this location) vs External
  (outside this location)**. External is the honest cross-location signal
  (current default); Internal answers "is there another copy on THIS disk".
  Requires per-file exact_here/exact_away/light_here/light_away in the cache so
  both classifications derive without a second pass.
- **Delete Check set** (prototype first): restore "Add to delete check" row/
  folder actions; show a delete-check membership listing; add a **Delete Check
  toggle** to Browse/Flat that filters the listing down to just the paths
  (folders/files) staged for deletion. Deletion validation (refcount survivor
  check) layers on top later.

## Implementation Steps

1. [x] Cross-location classification in `duplicate_cache_path_counts` (+ per-
       location light counts); cache shape -> v5; update tests.
2. [x] Rebuild-if-stale on `scans.excludes.set` / `.append_exact_path` /
       `scans.set_representative` / `scans.clear_representative` in web.rs.
3. [x] Diagnose interactive latency (debug vs release) with receipts; add
       `run-release` / `run-with-db-release` / `run-no-open-release` recipes.
4. [ ] Restore the Delete Check set (plan-030) as a separate surface: persistent
       include/exclude sets, folder expansion, what-if deletion validation with
       refcount survivor check. Prototype + screenshots before wiring.
5. [ ] Browse/Flat folder counters: unique vs duplicated (full + light),
       consistent with the cross-location classification.
6. [x] FileGrid: more prominent column dividers + easier-to-grab resize handles.
7. [x] Make the Folders (directory-tree) pane resizable (persisted width).

## Learning Log

- 2026-07-19 - "All backed up everywhere" was same-location duplicates counting
  as a backup. PhotoMerge merges four Photos libraries on ONE disk, so nearly
  every file had a within-disk twin -> all green. Cross-location classification
  flips PhotoMerge to all-unsafe (honest: no second full-hash location exists).
- 2026-07-19 - `invalidate_duplicate_cache_conn` DELETES all
  `duplicate_cache_runs`; nothing rebuilt after excludes/representative changes,
  so the Backup column went blank until the next scan/reconnect. Fixed by
  spawning `spawn_rebuild_if_stale` (status computes as `missing` -> rebuilds).
- 2026-07-19 - Interactive browse latency is the DEBUG build. Measured against
  the live data: `target/debug` serve = 3.0-4.9s per `scans.tree`; `target/
  release` serve = 3.16s cold then 0.12-0.29s warm. Same 5KB payload, so it is
  pure query CPU in the debug profile, not transport or React. Justfile `serve`
  recipes used `target/debug`.

## Work Log

- [x] 2026-07-19 00:05 - Read historical plans (030/039/064) per user request;
  confirmed the Delete Check set + safety-taxonomy + cache-as-task prior art.
- [x] 2026-07-19 00:10 - Reworked classification to cross-location only; added
  per-location light counts; bumped cache shape to v5; updated the two backup
  tests. `cargo test -p file-census-backend`: 72 pass.
- [x] 2026-07-19 00:12 - Rebuilt v5 cache on a copy of the live DB; PhotoMerge
  folders flipped from all-safe to all-unsafe (receipt via `scans tree`).
- [x] 2026-07-19 00:14 - Wired `spawn_rebuild_if_stale` after excludes /
  representative RPCs; verified `excludes set` -> runs=0 (missing) -> rebuild ->
  ready.
- [x] 2026-07-19 00:15 - Committed backend fixes (`54c7698`).
- [x] 2026-07-19 00:20 - Measured debug (3-5s) vs release (~0.15s warm) tree RPC
  against the live data; added release `run-*` Justfile recipes.
- [x] 2026-07-19 01:15 - FileGrid dividers (header border-strong + body divider)
  and visible-by-default resizer bar; 139 UI tests pass; screenshot-verified.
- [x] 2026-07-19 01:18 - Resizable Folders pane (drag handle, 160-520px,
  persisted to `locations-folders-width`). Committed `42fa6e9`.
- [ ] 2026-07-19 - Prototype the restored Delete Check set and screenshot before
  wiring (step 4).

## Unfinished Work

- [ ] Step 4: restore the Delete Check set (plan-030) as a separate surface with
  refcount survivor validation. Prototype + screenshots first.
- [ ] Step 5: Browse/Flat folder unique/dup(full+light) counters.
- [ ] Confirm the live app runs the release build (dev `serve` used debug); the
  `run-release` recipes now exist.
