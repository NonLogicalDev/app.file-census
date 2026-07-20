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
- Delete Check set is built iteratively (add/remove dirs/files over time) across
  multiple FOLDERS within one scan (clarified: not across physical disks).
- No nested additions for now: if a folder already encloses the item being
  added, refuse (keep the set an antichain per location).
- Retire Dup / Scan Dup / Uniq columns (the new backup display replaces them);
  optionally keep Uniq but redefine it as distinct-hash count in the folder.
- Process: use $Tasker_Plan religiously to record all work updates; keep this
  steering guidance in the plan in summarized form; prototype + screenshot UX
  before wiring.
- (2026-07-19, corrections) Do NOT present prototype mockups as shipped. The
  Internal/External toggle was called "shipped-adjacent" but was prototype-only —
  now built for real. Flat view was broken (web scans.tree ignored the flat
  param, returned folders) — fixed. Backup "Safe" filter showed a bogus ~189K at
  root (UI derived folder-safe as instance file_count minus unique unsafe/warn) —
  fixed to use the real safe_count. Use Chrome via CDP (`scratchpad/cdp.mjs`) to
  verify every feature in the RUNNING app (click → screenshot → assert); no
  "done" without a live screenshot. Work autonomously to completion, self-unblock,
  don't defer. Record ALL steering in the plan files; maintain
  `agent-plans/GOALS.md` as the ongoing goal doc.

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

## Design decisions confirmed 2026-07-19 (from prototype review)

- **Unifying model — "survives outside boundary B?"** A file's backup verdict is
  computed relative to a boundary: `safe` = an exact copy exists outside B;
  `partial` = only a blake3_light+same-size copy exists outside B; `last copy` =
  nothing outside B. The three modes just change B:
  - **External** (default): B = this location. Outside = other locations.
  - **Internal**: B = this file. Outside = the rest of this location.
  - **Delete Check**: B = the staged set. Outside = everything not in the set
    (this location's non-staged files AND other locations). "Everything else is
    considered external." This IS the refcount survivor check.
- **Folder chips count UNIQUE content**, not file instances: distinct
  (blake3,size) per folder per tier. 5 copies of one unsafe file = 1 unsafe.
  Requires the cache to roll up distinct-content-per-tier per directory.
- **"[X copies exist]"**: X = total instances of this content within the current
  scope (itself + its copies), e.g. "[3 copies exist]" = 3 total.
- **Delete Check toggle** acts as an advanced filter: the browse shows only the
  staged directories/files, and the Backup column recomputes with B = the set,
  so it directly shows what deletion would destroy.
- **The set is a PER-SCAN working set built iteratively across many folders.**
  (Clarified 2026-07-19: "multiple locations" meant multiple FOLDERS within the
  scan, NOT across physical disks.) Each member is a `(path, kind)` within one
  scan; the user adds/removes dirs/files from many folders of that scan before
  validating. Persist per-scan (matches plan-030's per-scan include set).
- **No nested additions (for now): the set is an antichain.** When adding path X,
  refuse if X is equal to, enclosed by, or encloses an existing member. The
  primary case the user named: "if a folder already encloses what we are trying
  to add, refuse." Also refuse the reverse (adding a folder that encloses an
  existing member) rather than silently absorbing it. Refusals surface a clear
  reason (e.g. "already covered by <ancestor>").
- **Validation algorithm (survivor-outside-set), derived for implementation.**
  Affected files = files under any staged folder + staged files (within the
  scan). For each affected file with content C=(blake3,size): total copies of C
  everywhere = `copies_here + 1 + copies_away` (from the cache); `inside` =
  count of affected instances of C. C's content is destroyed iff
  `copies_away == 0` AND every same-location copy is staged (`inside >=
  copies_here + 1`). "Would lose last copy" = affected files whose content is
  destroyed. Everything else survives outside the set.

## Column decisions 2026-07-19 (Dup / Scan Dup / Uniq)

- The new Backup display (folder `[N safe][N partial][N unsafe]` + file verdict
  with `[X copies exist]`) subsumes what Dup / Scan Dup / Uniq conveyed, so
  **remove the Dup and Scan Dup columns** — they are no longer needed.
- **Uniq may stay but is redefined**: it should mean the count of UNIQUE HASHES
  (distinct `(blake3,size)`) in the folder's subtree, i.e. how many distinct
  contents live here — NOT "files that only exist in this folder" (the current
  `original_file_count` meaning, which is confusing). Defer until the folder
  chip rollups land, since both read the same distinct-content cache rollup.

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
8. [x] Prototype the backup-display + delete-check UX; get decisions (done —
       `ui/src/prototypes/DeleteCheckPrototype.jsx`, routes
       `/prototype/backup-and-delete-check`, `/prototype/delete-check-active`).
9. [ ] Backend: store per-file exact_here/exact_away/light_here/light_away and
       roll up UNIQUE-content-per-tier per directory, so Internal/External and
       the folder chips derive without extra passes. Cache shape bump.
10. [ ] Backend: Delete-check scope — given a staged path set, compute each
        member's verdict with B = the set (copy survives outside the set?), and
        the roll-up "N would lose last copy". Reuse plan-030 include-set infra.
11. [ ] UI: folder cell = [N safe][N partial][N unsafe]; file cell = "Last copy"
        or verdict + "[X copies exist]"; rename warn->partial.
12. [ ] UI: Internal/External scope toggle wired to the two verdict sets.
13. [ ] UI: restore Add-to-Delete-Check actions + membership panel + a Delete
        Check toggle (filters to staged paths, recomputes verdicts vs the set).
14. [ ] Delete Check set is cross-location + iterative: app-level persisted set
        keyed by (scan/location, path, kind); add/remove members; enforce the
        antichain-per-location invariant (refuse nested adds with a reason);
        membership panel groups by location.
15. [ ] Remove Dup + Scan Dup columns; redefine Uniq = distinct-hash count (or
        drop it) once the folder chip rollups land.

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

## Work Log (2026-07-19 overnight autonomous build)

- [x] 02:20 - Backend step 9: unique-content folder rollups + distinct_count;
  retired dup/orig/same-scan; cache v6. 72 + perf gates green. Live copy:
  rebuild 3.5s, browse 0.11s, Photos 1 = 11,956 files / 4,890 unique. (`4cd32ca`)
- [x] 02:35 - UI steps 11-15: folder [N safe][N partial][N unsafe] chips; file
  "Last copy" vs "No off-disk backup [X copies exist]" (never mislabels a file
  with same-disk copies as last-copy); retire Dup/Scan Dup; Uniq = distinct
  hashes. Screenshot-verified. (`8d59950`)
- [x] 02:55 - Task #9: per-file verdict TSV export (db + CLI + web + UI button).
  275,492 rows in 3.1s; splits unsafe_last_copy vs unsafe_no_offdisk_backup.
  (`a769c80`)
- [x] 03:05 - Corrected the Delete Check set model to per-scan/multi-folder
  (not cross-physical-location) in the prototype + plan; derived the survivor
  validation algorithm.
- [ ] Delete Check set implementation deliberately deferred: it is a stateful,
  delete-adjacent feature that cannot be click-validated autonomously overnight.
  Backend + UI are fully specced above (antichain + survivor algorithm); build
  with the user present.

## Work Log (2026-07-19 overnight, cont.)

- [x] 03:50 - Fixed Flat (web scans.tree ignored flat param -> returned folders).
  CDP-verified: 500 file rows, "Showing 500 of 275,224". (`83e2245`)
- [x] 04:30 - Internal/External scope toggle built for REAL (cache v7 stores
  same-location unique-content tiers); fixed the bogus "Safe 189255" filter
  count (used real safe_count). CDP-verified: External Safe=0, Internal
  Safe=23,501. (`6f28790`)
- [x] 05:05 - Delete Check set end-to-end: per-scan antichain members table +
  survivor validation (unit-tested) + RPCs + UI (add / toggle / membership /
  validate). CDP-verified: stage @Photos -> 187,950 affected, 115,477 safe,
  72,473 last-copy. (`33cec70`, row menu `05:15`)
- [x] Verification harness: `scratchpad/cdp.mjs` drives the live app in Chrome;
  every feature proven by click+screenshot, not assertion.

## Burn-down 2026-07-19 (audit fixes + nav refresh) — decisions

- **Nav refresh**: split the crowded control row into two. Row 1: `[Browse|Flat]`
  view switch + command actions (Browse Folder / Build Thumbnails / Export TSV /
  Columns / Inspector). Row 2 (analysis row): Backup filter `[All|Safe|Partial|
  Unsafe]` + Scope `[External|Internal]` + persistent "Add to Delete Check"
  (disabled when nothing selected — no layout shift) + Delete Check toggle.
- **Delete Check filter, server-side (both views)**: `scans.tree` gains
  `delete_check: bool`. Browse: filter entries BEFORE pagination to rows that are
  staged, under a staged folder, or an ANCESTOR of a staged member (so the chain
  to staged paths stays navigable). Flat: SQL predicate (member paths + LIKE
  descendants) before LIMIT/OFFSET so pagination + totals are correct. Empty
  non-staged folders show an explicit "No Delete Check paths under this folder"
  message — the old silent-vanish is replaced by honest state, and toggle-off
  always restores.
- **deleteCheckMode lifts to App** so tree/flat fetches carry the flag.
- **Scope-aware everywhere**: flat `backup` filter switches to `int_*` columns
  when scope=internal; Export TSV takes `scope` and emits internal verdict words
  (`dup_on_disk`/`similar_on_disk`/`unique_on_disk`) when internal.
- **Header tooltips become real**: FileGrid header button renders
  `meta.tooltip` as `title` (making the previously-false claim true).
- **Memo made effective**: inline `onInspectRow` arrows replaced with a
  `useCallback` handler.
- **Validation staleness**: set changes mark the last validation `stale` (amber
  "re-validate" hint) instead of silently clearing it.
- Deferred (recorded, not hidden): panel/inspector coexistence, URL-persisted
  scope/mode, CLI `--delete-check` flag for `scans tree`.

## Delete Check as a browsing MODE (user refinement 2026-07-19 ~14:00)

Steering: (1) delete-check view must also show safe/partial files, not only
unsafe; (2) Delete Check is a mode of BROWSING — do not shove it into the
inspector slot; (3) entering the mode must update the Backup status strip;
(4) the Delete Check button must clearly light up while in the mode.

Decisions:
- Kill the side panel (it hijacked the Inspector column). Replace with a slim
  **Delete Check bar** directly above the results table (Browse AND Flat):
  member counts, Validate button + results inline (safe-to-delete / would-lose-
  last-copy, stale hint), Clear. The scoped browse itself IS the membership
  view; the Inspector works normally again.
- Backend computes a **delete_check_summary** on TreePage whenever
  delete_check=true: tier totals (external + internal, unique-content) summed
  O(members) from the members' own cache rows (dir rollup rows / file one-hot
  rows) + staged instance counts. Same sibling-dedup caveat as folder chips.
- The Backup strip uses delete_check_summary while the mode is on (scope-aware),
  so it shows the SET's safe/partial/unsafe — and the existing chips filter
  within the mode (Flat server-side tier+set predicates; Browse client-side over
  the server-scoped rows). That satisfies (1)+(3).
- Toggle active state becomes solid danger (unmissable), not a subtle tint.
- Row menu becomes membership-aware: staged member rows offer "Remove from
  Delete Check", others "Add to Delete Check".

## Collapsible side panels (user steering 2026-07-19 ~15:00, corrected)

Steering: the Inspector takes too much width from the table — make it a
separate RIGHT-side panel that must be manually expanded (default closed).
The Folders pane must be collapsible too.
Decisions: Inspector stays a right column but defaults CLOSED and only opens
via the toolbar toggle (persisted `locations-inspector-open`); row-click sets
the inspected file but does NOT auto-open the panel. Folders gets a toolbar
toggle too (default open, persisted `locations-folders-open`); collapsed, the
left column disappears entirely. Grid columns are built dynamically from the
two toggles, so with both closed the table spans the full width.

## Additional steering (2026-07-19 ~17:30)

- In Delete Check mode, the Folders sidebar tree must GREY OUT folders that are
  only in the remain-set (not staged / not an ancestor or descendant of a staged
  member) and refuse selecting them — avoids the confusing empty-folder jumps.
  Client-side: the set is small; reuse the staged/ancestor/descendant predicate.
- Perf fix landed alongside: visible_file_occurrences_page dropped the temp
  exclusion-table copy (file-info hung for content present in many scans);
  now anti-joins the persistent scan_excluded_files per visibility scan.

## AGREED Delete Check model (2026-07-19 ~16:10) — supersedes prior DC marker semantics

The set splits the scan into **delete-set** and **remain-set**. Delete Check ON
browses the delete-set (both views, server-scoped as built), and the Backup
markers RE-CLASSIFY each staged file against what survives the deletion:
safe = exact copy survives in the remain-set (same scan/disk) OR on an external
location; partial = only a light-hash survivor; unsafe = nothing survives (last
copy). Two staged twins are unsafe if nothing else survives. The markers ARE
the validation — the Validate button is removed; "would lose last copy" = the
mode's Unsafe total. Scope toggle in the mode: combined survivor universe
(option (a)); chips filter by survival tier. Strip in the mode = browsed
folder's delete-set FILE counts (sums to files shown); set totals live in the
DC bar.
Implementation: per-file classification is page-local (bounded GROUP BY queries
for inside-set exact/light counts + scan light totals; exact totals come from
cached copies_here/away). Folder rollups + totals come from a persisted
`delete_check_class` table built by a background pass (fingerprint = member
paths + cache run id), rebuilt on set mutations, `ready` flag + event
(`delete_check_class_ready`) so the UI shows "computing…" then refreshes.
Residual noted honestly: outside DC mode the strip still shows unique-content
counts (instance-count strip needs cache v8 per-dir instance tiers — queued).

## Strip semantics correction (user steering 2026-07-19 ~15:50, screenshot)

Steering: in Delete Check mode, browsing a 6,638-file folder showed
"Unsafe 0 / Warn 0 / Safe 1" (the SET totals) — unrelated to the folder on
screen. The strip numbers "should add up to the number of files in the folder";
delete check must let the user inspect ALL files of a folder classified by
safety.
Decisions: revert the strip=set-totals override. The Backup strip ALWAYS
describes the BROWSED FOLDER, and switches from unique-content counts to FILE
(instance) counts so safe+partial+unsafe sums to the folder's file count
(row chips keep unique-content counts per the earlier steering; strip tooltip
explains). While DC mode is on, the strip shows the folder∩set intersection
(folder's own counts when it lies inside a staged member; sum of staged members
under it otherwise; zeros when disjoint). Set-wide tier totals move into the
DC bar. Requires cache v8: per-dir instance-tier columns (ext+int).

## File Info modal rework (user steering 2026-07-19 ~15:40)

Steering: (1) convert the modal's tab selector to the segmented-chip form used
everywhere else (Browse|Flat / scope chips); (2) the Locations tab must show
only occurrences from REPRESENTATIVE scans (the per-location effective scan:
representative else latest complete full-hash) unless an "All scans" toggle is
selected, and the list must be grouped by location -> scan.
Decisions: extract the chip into a shared ui `SegmentedChip` (FileExplorer's
BackupFilterChip becomes a thin wrapper) so modal + explorer share one form.
Representative filtering is SERVER-side (a `representative_only` param on
files.details / files.occurrences filtering to the scope's effective scan ids)
so pagination totals stay correct; grouping is client-side presentation over
the loaded page (location header -> scan header -> compact path rows; drop the
per-occurrence blake3/sha repetition — occurrences share the content hash by
definition).

## Modal-rework work log 2026-07-19 (~19:00) — CDP-verified live (`f0daa00`)

Shipped: FileInfoModal tabs → SegmentedTabs chips (Preview/Metadata/EXIF/
Locations); Locations grouped location→scan→path rows with a `representative`
badge per scan header and compact Open/Reveal actions; Representative/All-scans
scope chips wired to `representative_only` on files.details (server-side, so
"Showing 100 of N" totals stay honest). Also in this batch: DirectoryTree greys
out remain-set-only folders in DC mode (disabled + tooltip, verified via
tree-probe: .Spotlight-V100/.TemporaryItems/.fseventsd inert, root+staged
active), and visible_file_occurrences_page now uses the persistent
scan_excluded_files anti-join per visibility scan (replacing the per-call temp
excluded_file_ids table) in both origin and occurrence queries.

CDP receipts (scan b668d2e6, content `._@Photos` blake3 663047e6…): modal opens
~5s; Representative shows "141575 known copies / Showing 100 of 141575 …
representative scans"; All scans flips to 244655; grouped card `disk-nlbackup
NLBackup` → scan header `7/18/2026 · Ready · representative · b668d2e6`.
Screenshots: shot-modal-locations-rep.png / shot-modal-locations-all.png.

Debugging lesson (recorded so no one chases this again): the "modal hang >45s"
was NOT a hang. WS frame tracing showed files.details resolving in ~4.3s and
the modal rendering; every probe failed on `indexOf('File info')` because the
h2 renders through CSS text-transform:uppercase and innerText returns the
TRANSFORMED text ("FILE INFO"). Probes must match case-insensitively or use
toUpperCase(). Secondary probe pitfall: wrapping window.WebSocket without
copying the OPEN/CLOSED statics kills the app's reconnect logic.

Not done from the modal spec: the shared `SegmentedChip` extraction (modal uses
SegmentedTabs directly; FileExplorer's BackupFilterChip still its own) — queued
as polish.

## Inspector Preview/EXIF work log 2026-07-19 (~20:00) — CDP-verified live (`64193c1`)

AddTask "Add preview and Exif as collapsible sections to the Inspector" done.
Design: a NEW lightweight `files.preview` RPC (media::file_preview) — cached
thumbnail + cached EXIF first, falling back to a live read of THIS scan's copy
only; deliberately no occurrence sweep so it stays cheap on row-click even for
content with 244k occurrences (files.details stays the heavy modal path).
Extracted EXIF/thumbnails are cached back, so browsing warms the cache. UI:
InspectorSection disclosure rows (chevron + uppercase label) under the field
list; open state persisted (locations-inspector-preview-open / -exif-open);
fetch gated on inspector open AND ≥1 section expanded; keyed scan:path:blake3
with stale-guard; selecting a new row while open refetches automatically.
CDP receipts: map_renditions JPG → 512×512 thumbnail rendered ("freshly
built"), EXIF honest "No Exif data found in JPEG"; `._` AppleDouble row →
"not a supported image" / "EXIF is only attempted for common image file
types". Screenshot: shot-inspector-preview-exif.png. Tests: 140 UI, 74 lib.

## Browse tree-in-table work log 2026-07-19 (~21:30) — CDP-verified live (`53756d0`)

User (mid-build, confirming the queued task): "Can we make Browse mode more
like tree mode? We still have not allowed expanding folders in the table."
Shipped inline folder expansion in the Browse table: disclosure chevron on dir
rows → lazily fetches that folder's page (scans.tree side-load, limit 500,
respects search + delete_check) and renders children indented in place via
TanStack subRows (expansion keyed by path; autoResetExpanded off so async
children and nested expansions survive). Backup-tier filter applies at every
depth; children sort dirs-first; >500 children shows an honest "open the
folder for the rest" placeholder; child cache clears on navigation/scan/DC/
search changes; failed fetches drop the node so re-expand retries. Flat stays
flat. Also this session: FileGrid render-count probe (`2fc4ba7`) proved the
memo live (Folders/Inspector toggles → 0 grid re-renders; row click → exactly
+1). CDP receipts: expand @Photos 11→23 rows, nested photoslibrary →55,
collapse →11, re-expand →55 instant from cache; Unsafe filter + expand → 0
safe-tier leaks in children. Two structure tests updated: the old "grid stays
flat/non-hierarchical" contract is superseded by this user request.
Screenshots: shot-browse-inline-expand.png.

## Interaction polish work log 2026-07-19 (~22:40) — CDP-verified live (`9adc2c1`)

Steering (three messages): (1) "move the ... context menu into right click menu
on table items"; (2) "move Clear Set next to add to delete check button as a
Clear Icon (no text), also ask for confirmation"; (3) "Make each scan location
+ scanid collapsible" in File Info / Locations (correction: BOTH levels).
Shipped: FileGrid's per-row "..." trigger column removed — the same four
actions open via right-click at the cursor (viewport-clamped; closes on
outside click/Escape/scroll/resize; parent+placeholder rows inert). Clear set
is now an icon-only trash button between "Add to Delete Check" and the mode
toggle, confirmed through the app-level ConfirmModal pattern (body names the
staged count; nothing on disk touched). File Info Locations groups collapse
per-location AND per-scan with independent chevron state; scan headers gained
a "N paths" count. CDP receipts: 0 aria-haspopup triggers left in the table;
right-click menu items [Add to Delete Check, Build thumbnails, Exclude from
scan, Remove from scan]; Esc closes; ../ row no menu; clear icon → confirm
modal → Cancel keeps badge at 1; Locations path rows 101→1 (scan collapse)
→0 (location collapse), scan state survives location re-expand. Tests: 143 UI.
Screenshots: shot-context-menu.png / shot-locations-collapsible.png /
shot-clear-confirm.png.

## Inspector rail work log 2026-07-19 (~23:40) — CDP-verified live (`401776c`)

Steering (three messages): "Clear button needs a less threatening icon"
(→ eraser, `41ed566`); "Move inspector panel to right rail like sidebar";
"Allow resizing sidebar and inspector in hover mode".
Shipped: Inspector extracted to InspectorPanel.jsx and docked as a Shell-level
right rail column [sidebar | main | rail] — full viewport height, sidebar-bg
chrome, persisted width (file-census.inspector.width, 240–560, default 320)
with a left-edge pointer+keyboard resize handle. App owns inspected +
inspectorOpen (same persisted key); FileExplorer keeps only the toggle and the
row highlight, and its browse grid is back to [folders?, table]. Sidebar
resizing now also works in the hover/peek overlay (was desktop-docked only);
the peek holds open while a drag is in flight. Bug found by receipt: rail
opened at 240 not 320 — Number(null)=0 clamped to min; clampRailWidth now
treats missing storage as default. CDP receipts: rail h=757 flush right,
populates on row click, drag 320→440 persisted; peek handle display=block +
aria-disabled=false, peek-drag 292→370 persisted. Tests: 144 UI.

## Inspector batch work log 2026-07-20 (~00:50) — CDP-verified live (`74c0dea`)

Five AddTasks from the user, all shipped:
1. Rail hover/peek: collapsed Inspector peeks from the right edge on hover
   (fixed overlay + hover zone, mirror of the sidebar's pattern); resize
   handle works during peek and holds it open through a drag. BUG caught by
   receipts: appending 'relative' after 'fixed' let Tailwind's position order
   flip the overlay into flow on the LEFT edge (left=422) — removed the class;
   now tucks to an 18px right-edge sliver and peeks flush right.
2. Inspector structure: [Icon+Name] / [Open File Info] / Preview(collapsible)
   / info fields / EXIF(collapsible). Verified order 25<40<112<225 in
   innerText offsets.
3. Table keyboard nav: focusable grid, ArrowUp/Down move the inspected row
   through the VISIBLE order (sorted + expanded subRows; parent/placeholder
   skipped), scrollIntoView nearest. Verified: Down×2 @Photos→Hmm→MergedLib,
   Up→Hmm.
4. Folder inspection: single click on dir rows feeds the Inspector (Folder
   label, Files 187,950 / Unique contents 76,210 for @Photos); dbl-click
   still navigates. Preview/EXIF show "Select a file…" hints for dirs.
5. Tree-in-table indent 16→48px per depth level (3x).
Tests: 146 UI. Screenshots: shot-rail-peek.png.

## Desktop parity pass 2026-07-20 (~02:00) — (`e78c55d`..`370f7e1`)

User: "lets do a pass to ensure that desktop app is fully equivalent superset
of webapp." Audit: RPC method names already matched 1:1 (38 each), but
BEHAVIOR did not. Gaps found + ported to app.rs:
1. spawn_delete_check_class_rebuild never existed natively — desktop DC mode
   would compute survival NEVER (stuck "computing survival…"). Ported thread +
   delete_check_class_ready emission at the same 4 call sites as web.
2. set/clear_representative + excludes.set/append_exact_path didn't spawn
   duplicate_cache::spawn_rebuild_if_stale natively → stale browse markers.
3. Export TSV was window.open('/api/…') — dead under Tauri. Native path:
   AppCore::export_verdicts_tsv + `verdicts_export` Tauri command (rfd save
   dialog, writes file, returns path) + UI branch in App.exportVerdicts.
Regression guard: app.rs test `native_app_handles_every_web_rpc` diffs the
`"x.y" =>` match arms of web.rs vs app.rs at test time — any web-only RPC now
fails the build. Native crate compile-verified (runtime click-through on the
Tauri shell still pending — needs a windowed session).
Also user steering in this pass: tree indent 48→22px/level (chevron centers
under parent icon, 137 vs 138 live) and non-expandable rows reserve the 16px
chevron slot (dir icon x=129 == file icon x=129). Learned + memorized: never
pkill file-census by name — the user runs their own CLI processes; kill only
port 3944.

## Actions/modal batch 2026-07-20 (~03:30) — CDP-verified live (`9bbdf57`)

Five rapid user asks, all shipped: (1) resizable Inspector preview height —
drag handle under the image, 96–640px persisted, keyboard arrows; verified
192→312. (2) Reveal File + Open File buttons beside Open File Info in the
Inspector (system reveal/open of THIS scan's copy; new stable
openFileInSystem/revealFileInSystem in App via files.open/files.reveal).
(3) Same actions + File Info at the top of the table context menu (both
Browse and Flat grids). (4) File Info modal "Reveal in scan" → "Reveal File"
(it reveals in the system explorer); ALL modals now close on Escape (Modal
gained an onClose prop, wired to all 7 instances). (5) EXIF cutoff fix (user
screenshot): exifStatusClassName now min-w-0 + flex-wrap + [&_code]:break-all
so long source paths wrap inside the modal instead of stretching it.
Receipts: ctx menu [File Info, Open File, Reveal File, +4 existing]; inspector
[Open File Info, Reveal File, Open File]; docWidth==vw on EXIF tab; Esc closes.
Tests: 146 UI. Screenshots: shot-preview-resize / shot-ctx-fileinfo /
shot-exif-wrap.

## Interaction batch 2026-07-20 (~04:40) — CDP-verified live (`fb4fb7c`)

Five rapid asks: (1) select column fixed at 28px, header checkbox REMOVED
(select-all read ambiguous). (2) Left/Right tree keys in Browse: Right expands
the focused folder / steps into first child; Left collapses, or jumps to the
parent row from files and collapsed folders (receipts: 11→23 rows, child step,
.DS_Store→@Photos parent jump, collapse back to 11). (3) File Info modal: wide
surface no longer scrolls — the title/Reveal/Close strip + tabs stay fixed,
only the tab page scrolls. (4) Folders toggle moved to nav row 1's far left,
before Browse|Flat. (5) "Browse Folder" → "Reveal Folder" (reveal icon).
Tests: 147 UI.

## Filters + perf work log 2026-07-20 (~05:40) — CDP-verified live (`32c27c8`, `fa970f8`)

(1) Editable filter rules (user + screenshot): clicking a rule label or "Edit
rule" in its menu opens an inline term/operator/value editor (same controls as
the Add-rule builder); replaceTermRule preserves the Match/Exclude wrapper.
Verified: jpg → png in place. (2) Zombie-folder bug (user report): the inline
expansion cache didn't clear on structured-filter changes — children fetched
under the old rule lingered. Cleared on searchFilters now; verified 0 lingering
depth>0 rows after a rule swap. (3) Slow sidebar on reload (task #35): root
cause = /api/overview ~10s cold (full files-table aggregates) AND the events
WS handled RPCs serially, so locations.list (18ms) queued behind it. Fixes:
overview_cache row (fingerprint = location/scan roster + latest duplicate-
cache ready_at) served stale-while-revalidate with a background refresh +
overview_updated event (web + native parity); events_socket now runs each RPC
in its own task behind an mpsc writer, so slow calls can't serialize fast
ones. Receipts: overview 5.8s once → 16ms; locations 22ms concurrent;
reload-to-sidebar ~1.6s (was 10s+). Tests: 147 UI / 75 backend.

## Pill unification 2026-07-20 (~06:20) — CDP-verified live (`7eccff5`)

User: unify "LAST COPY" + "UNIQUE HERE" → "UNIQUE"; "DUP HERE" → "N dup" and
"N dup (light)"; borders follow pill color. Shipped exactly that: internal
unique-here and external last-copy both read UNIQUE (red); internal exact dup
reads "N dup" (green, compact count, ×N chip dropped as redundant); light-only
match reads "N dup (light)" (amber). External "On-disk only ×N" kept as a
distinct state; DC-mode survival wording untouched. Badge + folder-chip
borders now full-strength color (was /40-/50 alpha). Receipts: external
[Unique, On-disk only], internal [Unique, 142k dup], border rgb == text rgb.
Screenshot: shot-pills.png.

## Panels work log 2026-07-19 (~15:20) — CDP-verified live (`bef165f`)

- [x] Inspector default-closed, manual toolbar toggle, persisted; row click no
  longer auto-opens. Folders pane collapsible via toolbar toggle, persisted.
  Dynamic grid columns; both closed = full-width table. Verified by measured
  widths: 938 default / 938 after row click / 618 inspector open / 1162 both
  collapsed / 938 restored.

## Mode-rework work log 2026-07-19 (~14:40) — CDP-verified live (`80900c6`)

- [x] deleteCheckBar above the table (Browse+Flat); side panel removed;
  Inspector restored in the mode.
- [x] TreePage.delete_check_summary (O(members) ext+int tier totals) +
  unit test; Backup strip switches to it, scope-aware, while the mode is on.
  Verified: folder 86,164 unsafe -> set 76,209; Internal safe 22,888 visible
  and filterable via the Safe chip inside the mode.
- [x] Toggle lights solid danger (computed style verified) + honest tooltip.
- [x] Membership-aware row menu (Add vs Remove from Delete Check).
- New task queued: #22 inline-expandable folders in Browse.

## Burn-down work log 2026-07-19 (~13:30) — all CDP-verified live

- [x] Two-row nav shipped: Row 1 view+commands; Row 2 Backup filter + Scope +
  persistent Add-to-Delete-Check + Delete Check toggle. (`bc3cdd9`)
- [x] Server-side Delete Check filter (Browse pre-pagination incl. ancestors;
  Flat SQL predicate). Verified: dc-ON browse = parent + @Photos only; dc-OFF
  restores; Flat dc-ON = "Showing 500 of 187,950" (exactly @Photos);
  non-staged folder returns 0 entries (CLI) with an explicit empty message.
- [x] Flat delete-check affordances: checkboxes, row-menu add, panel in Flat.
- [x] Real header tooltips (title from meta.tooltip; verified via DOM).
- [x] Scope-aware flat filter + TSV: internal-unsafe 53,322 / internal-safe
  134,628 (partitions 187,950 exactly) vs external-unsafe 187,886; TSV
  scope=internal emits dup_on_disk/unique_on_disk words.
- [x] Memo props stabilized (useCallback handleInspectRow, both grids).
- [x] Stale-validation banner instead of vanishing numbers.
- [x] Perf: dc flat count skips cache join without tier filter (2.2s->0.33s).
- Honest residuals: (a) live scan-time re-render check still needs a headed
  browser (task #19); (b) "Showing N of M" renders the previous total for ~2s
  while a tier+dc count loads (polish: loading shimmer); (c) sidebar-click nav
  into a non-staged folder wasn't exercised by the harness (selector miss) —
  server behavior unit+CLI-verified instead.

## Self-audit 2026-07-19 (user-requested; verified against code, not memory)

Cheats / workarounds of explicit requirements:
1. Delete Check filter toggle: user asked for a toggle that FILTERS Browse/Flat
   to staged paths. The buggy client-side filter was REMOVED instead of being
   fixed server-side (the SQL predicate already exists in delete_check_validate).
   The toggle now only opens the panel. Must be re-implemented server-side.
2. Flat view has NO delete-check affordances: no checkboxes, no row-menu add,
   and the panel renders only in Browse.
3. "(?) tooltips" on Hash Full/Hash Light/Uniq are FALSE claims: meta.tooltip is
   dead code (nothing renders it). Task #10's (?) icon spec is unimplemented.
4. Task #7 fix (React.memo on FileGrid) is DEFEATED by inline arrow props
   (onInspectRow at FileExplorer 287/325 recreated each render); the headless
   verification was meaningless (baseline also 0 — no live events headless).
Correctness gaps shipped as "minor":
5. Flat Backup filter is server-side on EXTERNAL columns regardless of the
   Internal scope toggle; slow-path (filtered/deep) rows have empty
   internal_status so Internal scope blanks/empties them.
6. Export TSV ignores the scope toggle (always External verdicts).
7. Top counter now = browsed folder's own rollup, but children chips still don't
   sum to it (unique-content dedup across siblings) and the UI never explains it.
UX debt: add-button layout shift (selection-gated), panel replaces Inspector
silently, validation clears with no stale marker, refusals join('\n') toast,
silent catch in set refresh, toggle badge (members) vs panel (affected files)
unlabeled, scope/dc-mode not persisted, dead zero fields in TreeEntry API.
Fix order: (P0) server-side set filter for Browse+Flat + Flat add/panel; real
header tooltips; (P1) stable FileGrid props so memo works + live re-verify #7;
scope-aware flat filter + TSV; (P2) polish list above.

## Unfinished Work

- [ ] Delete Check set: implement per the specced antichain + survivor
  validation (backend is unit-testable; UI needs click validation). Prototype
  done (`/prototype/backup-and-delete-check`, `/prototype/delete-check-active`).
- [ ] Internal/External scope toggle (external shipped as the default; internal
  needs light_here + per-file int tier stored — small backend add).
- [ ] Confirm the live app runs the release build (`just run-release`); dev
  `serve` used debug (3-5s vs ~0.15s).
