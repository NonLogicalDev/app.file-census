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
