---
date: 2026-07-16
status: in-progress
subject: location-actions-deletecheck-excludes-scanstart-toasts
---

## Goal

Five location/scan UX fixes requested against the integrated redesign:
1. Move the per-row action menu to the **left** of the file list (before the select checkbox).
2. Add a button to **bulk-add** the selected folders/files to a Delete Check list.
3. Ensure **Excludes are never destructive** — a scan-scoped filter only, never delete files.
4. Bring back the **scan-start modal with options** (plan-064 hash policy Full/Light + offset).
5. Make **notifications short-lived toasts**, not in-layout page content (per plans).

## Context

- FileGrid (`ui/src/components/FileGrid.jsx`) builds columns: `select` first, then data, then `actions` last (right). Move `actions` before `select`.
- Delete Check runs on the current folder (`scans.delete_check`) or explicit `paths` (`delete_check_paths`). There is no persistent "staging list" in the UI; selected grid entries feed a one-shot check. Add a staged path set + a bulk-add affordance.
- **Excludes are already non-destructive**: `Database::set_scan_excludes` / `append_exact_scan_exclude` only touch the `scan_excludes` pattern table (INSERT); the only `DELETE FROM files` are location-delete (db.rs:667) and the explicit "Remove from scan" `delete_visible_scan_path` (db.rs:1282) — a separate action, not excludes. Task 3 = verify + guard test + keep the UI "Exclude" (filter) clearly distinct from "Remove from scan" (destructive).
- `scans.start` accepts `{ slug, offset: Option<PathBuf> }`. A hash policy is NOT yet a parameter (plan-064 Full/Light unrecovered; only the `blake3_light` sampler exists from plan-069 step 1). A fully functional hash-policy modal needs plan-069 layer 2–3.
- Notifications: `Shell` renders `{message && <p className={shellMessageClassName}>…</p>}` inline in the workspace. Replace with a floating, auto-dismissing toast.

## Decisions

- Excludes stay filter-only; add a regression test that `set_scan_excludes`/`append_exact_scan_exclude` never change the physical `files` row count. Keep the explicit destructive "Remove from scan" as a separate, clearly-labeled action.
- Delete Check gains a staged path list (client state) with a "Add to Delete Check" bulk action for the current selection; run the check over the staged set via `delete_check_paths`.
- Scan-start modal: offer offset (subfolder) + hash policy. Implement plan-069 layer 2–3 (blake3_light column + Full/Light `HashPolicy`) so the policy option is real, not decorative.
- Toasts: a small toast host in `Shell` fed by `message`; each toast auto-dismisses (~5s) and stacks; errors persist slightly longer. No layout shift.

## Implementation Steps

1. [x] FileGrid: `actions` column moved before `select` (menu opens align=start). Commit `631c5b6`.
2. [x] Toasts: Shell toast host, auto-dismiss ~5s, click-to-dismiss; removed the in-layout message. Commit `631c5b6`.
3. [x] Excludes: guard test proving set/append excludes never delete files; UI keeps Exclude (filter) vs Remove from scan (destructive) distinct. Commit `130ed88`.
4. [x] Delete Check: staged list + "Add to Delete Check (N)" bulk button + Run/Clear. Commit `ab8678d`.
5. [x] Scan-start modal: offset + Full/Light hash policy. Backend plan-069 layer 2–3 (blake3_light column/NewFile + HashPolicy + scanner + scans.hash_policy + light-scan dedup exclusion + restored missing scans.nickname column). Commits `acee3a3` (backend), `3b62534` (modal).

## Learning Log

- Excludes are already non-destructive at the DB layer; the risk is only UI confusion with the separate destructive "Remove from scan".

## Work Log

- [x] 2026-07-16 03:45 - Created plan; verified excludes are non-destructive; mapped FileGrid columns, delete-check flow, scans.start params, and the in-layout message render.

## Unfinished Work

- [x] Steps 1–5 complete and verified (66→67 backend tests, 138 UI tests, build clean).
- [ ] Follow-ups (optional): CLI `scans start --hash-policy` flag; light-hash `likely_safe`/"Likely covered elsewhere" delete-check signal (plan-069 layer 5); expose `blake3_light` as a grid column.
