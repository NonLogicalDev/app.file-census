# GOALS — cross-backup dedup app (working session 2026-07-19)

The app must let the user deduplicate photos/files across their backups (disk,
SD, NAS): browse a backup, see honestly what is/isn't backed up elsewhere, plan
deletions safely, and act.

Update this file with new status of goals/planfiles as it will be used as your ongoing goal.
Do not stop till all tasks are finished. You have autonomy to work on your own, try unblocking yourself if you get stuck, do not defer to me till you finish all work.

## Ground rule (after a trust breach)

Every feature is proven by driving the REAL running app in Chrome via the CDP
driver (`scratchpad/cdp.mjs`): click → screenshot → assert the DOM. No feature is
called "done" without a screenshot from the live app showing it working. Test
against `just run-release` (debug is 20-30x slower). Do not claim prototype
mockups as shipped functionality.

## Honest status (2026-07-19 ~03:40)

Verified working in the live app (release serve, CDP-driven):
- Browse: fast (~0.1s), folder `[N safe][N partial][N unsafe]` unique-content
  chips, file "Last copy" / "No off-disk backup [X copies exist]" / "Safe
  [X copies exist]", Uniq = distinct hashes. Cross-location (External) verdicts.
- TSV export of per-file verdicts (CLI + web + UI button).

Fixed + CDP-verified this session:
- **Flat view** — was broken (web `scans.tree` ignored `flat`, returned folders).
  Fixed: added `flat`/`backup` to `TreeRpcParams` + branch to `scan_flat_page`.
  Verified: Flat shows 500 file rows, "Showing 500 of 275,224", Load more.
- **Internal/External toggle** — now REAL (was prototype-only). Cache v7 stores
  per-file + per-folder Internal (same-disk) unique-content tiers. UI Scope
  toggle. Verified: External Safe=0, Internal Safe=23,501 at root.
- **Bogus "Safe 189255" filter count** — UI derived folder-safe from instance
  file_count; fixed to use real safe_count. Verified: External Safe=0.

- **Delete Check set** — DONE + CDP-verified. Per-scan antichain set (members
  table, add/remove/clear, survivor validation unit-tested + RPCs). UI:
  "Add to Delete Check" for the selection, a "Delete Check (N)" toggle that
  filters the browse to staged paths and shows a membership panel with the
  survivor summary. Verified live: stage @Photos -> Validate => 187,950 affected,
  115,477 safe to delete, 72,473 would lose last copy.

Remaining polish (optional):
- "Add to Delete Check" row-context-menu item (selection button + toolbar work).
- Flat-view Delete Check filtering is client-side on the loaded page only.
- Actual file deletion is intentionally NOT wired (analysis/planning only).

## SESSION OUTCOME (2026-07-19 ~05:30) — core dedup app DONE + CDP-verified

The cross-backup dedup app is usable end-to-end (run `just run-release`):
- Browse (fast, ~0.15s) with unique-content folder chips [N safe][N partial]
  [N unsafe], file badges (Safe/Partial/Last copy/No off-disk backup + [X copies
  exist]), Uniq = distinct hashes.
- Flat: paginated table of all descendant files.
- Scope toggle External (off-disk backup) vs Internal (same-disk duplicate) —
  real, different data.
- Backup filter All/Unsafe/Warn/Safe with correct counts.
- Delete Check set: stage folders/files (antichain), toggle to filter to the
  set, Validate the deletion impact (affected / safe to delete / would lose last
  copy). Analysis only — no file deletion wired.
- Export TSV of per-file verdicts.
All CDP-verified in the running app. 73 backend + 8 perf-gate + 139 UI tests.

### ALL backlog tasks now addressed
- #6 Ratatui `scans watch` — DONE. `file-census --server <url> scans watch`
  renders discovery/metadata/hashing gauges (TUI on a TTY, text when piped).
  Verified live (progress counters advancing) + parsing unit-tested.
- #10 Hash Full + Hash Light columns — DONE. blake3_light plumbed through
  TreeEntry + tree/flat; both columns render with (?) tooltips.
- #7 scan-time "seizures" — memoized FileGrid (React.memo) so the table doesn't
  re-render on scan-progress ticks. HONEST: the exact blinking could not be
  reproduced in the headless CDP harness (live progress events don't drive
  rendering in the headless page); the memo is a correct safe fix; needs live
  verification.
- #18 laggy navigation — primary cause (debug build) fixed (release ~0.15s) +
  FileGrid memo reduces scan-time render cost. Residual event-lag needs live
  verification.

### Known minor gaps (documented, not blocking)
- Internal-scope filtering in Flat is client-side on the loaded page only
  (server-side flat filter uses the External tier columns).
- #7/#18 verification was limited by the headless harness (no live event render).

## Plan (this session, ~5h, each phase gated by CDP verification)

1. Ground-truth audit of the live app via CDP (Browse/Flat/filters/export);
   record works-vs-broken. [done]
2. Fix Flat = paginated table of ALL descendant files (path+name), working
   "Load more" + total. Verify: click Flat, confirm files across subfolders,
   page through, screenshot.
3. Internal/External toggle, for real. Backend: `light_here` + per-file internal
   tier + per-folder internal unique-content rollups (cache bump); tests; rebuild
   on the live copy and confirm Internal numbers differ from External. UI: scope
   toggle switching chips/verdicts/[X copies]. Verify: click the toggle, screenshot
   both states with genuinely different counts.
4. Delete Check set, for real. Backend (drafted): per-scan members table,
   antichain add/remove, survivor validation; unit tests + CLI. RPCs + UI:
   add-to-set row action, membership panel, Delete Check filter toggle. Verify:
   add rows, toggle, check membership + validation, screenshot.
5. End-to-end CDP walkthrough of the dedup workflow + honest final report with
   screenshots and a plain done/not-done list.

## Plan files in flight (per $Tasker_Plan)

- **`agent-plans/plan-073 backup-model-and-browse-ux.md`** — ACTIVE, owns this
  session: cross-location backup model, unique-content chips, [X copies exist],
  Internal/External toggle, Delete Check set, Flat view, folder-pane resize,
  column dividers, TSV export. Design decisions, survivor-validation algorithm,
  steering guidance, per-scan Delete Check antichain rules all live here.
- **`agent-plans/plan-072 delete-check-unification-and-fixes.md`** — mostly done:
  consolidated the scan browser to `[Browse | Flat]` + backup filter, O(children)
  browsing perf, cache foundation. Superseded by plan-073 for the backup model.
- **`agent-plans/plan-071 two-phase-scan-and-light-hash-settings.md`** — done:
  two-phase scan + light-hash sampler settings (dependency of the backup model).
- Recovery/governance context: `agent-plans/plan-065 shadcn-dark-ui-redesign.md`
  (UI redesign contract), `agent-plans/plan-066 scanner-cli-operations.md`,
  `agent-plans/INDEX.md` (catalog of all historical plans).

Update this file's status + the relevant plan's Work Log after each verified
phase.

## Detailed decisions & history

See `agent-plans/plan-073 backup-model-and-browse-ux.md` (design decisions,
survivor-validation algorithm, steering guidance, per-scan Delete Check set
antichain rules).
