---
date: 2026-06-12
status: complete
subject: progress-bar-stability
---

# Plan 017 - Progress Bar Stability

## Goal

Fix scan progress bars so counts match the real scan work and the UI stays visually stable while paths change rapidly.

## Context

- Current progress bars can report counts that do not line up with the final scan file totals.
- Progress widgets resize or visually jump when long current paths stream through during active scans.
- The requested visual reference is Lightroom-style: compact label, fixed-width progress track, stable fill, and optional close/stop affordance.
- This extends `plan-010 scan-progress-pools.md`; it is a correctness and presentation pass, not another scanner architecture rewrite.

## Decisions

- Treat progress count correctness as a backend/UI contract issue. The UI should not paper over ambiguous counters with formatting alone.
- Keep current paths visible, but constrain them to fixed-height, truncated log/status regions so bar geometry never depends on path length.
- Prefer stable lane labels and counters over dynamically changing text inside the bar.

## Implementation Steps

1. Reproduce with a slow scan and capture progress event samples against final scan row counts.
2. Audit discovery, metadata, and hashing counters for off-by-one, directory/file inclusion mismatches, skipped update rows, and repair/update semantics.
3. Define which count each lane owns and document whether directories are included.
4. Render progress bars with fixed track dimensions, clipped current-path text, and stable label/counter positions.
5. Browser-verify active scan progress with long file paths and multiple concurrent pool updates.

## Learning Log

- Open question: whether the primary count shown to users should be files only, entries including directories, or per-lane work items. This needs to be explicit in labels.
- Long paths must be treated like log content, not layout content.
- Audit found pool percentages currently derive their denominator from `queued + active + completed + failed`, which changes as discovery finds more work. That explains progress moving backward or seeming detached from final scan totals.
- Top-level `file_count` is successful files only, while discovery/metadata lanes can count directories, skipped repair paths, sidecar DB files, and errored rows. Labels must distinguish final file totals from per-lane work-item counts.
- Repair and update scans need explicit labeling: repair can begin with seeded file counts, and update scans can reuse metadata/hashes so hashing lane counts are intentionally lower than final files.
- Layout instability is concentrated around raw `progress.current_path` rendering in `Shell.jsx` sidebar/main progress cards and insufficient truncation/fixed-height rules in `style.css`.
- UI pass now labels pool counters as worker-pool `items` rather than final files, and uses aria text that spells out done/failed/queued/active lane state.
- Long current paths are constrained with fixed row geometry and ellipsis in sidebar progress, main progress cards, and expanded scan pool metadata.
- Active browser verification with a 45k-file fixture made the isolated debug server unresponsive before useful DOM evidence was collected. Future active verification should use a deterministic scanner delay or smaller fixture plus immediate pause.
- Active browser verification succeeded with an isolated 5k-file fixture on port 3847. The UI showed scanning state, sidebar/main progress cards, worker-pool labels such as `Discovery113 items`, aria text such as `113 completed work items, 1 active`, fixed-height bars, and long `.progress-path`/`.scan-pool-path` rows clipped with `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`.

## Work Log

- [x] 2026-06-12 21:29 - Added task from user report and Lightroom-style reference screenshot.
- [x] 2026-06-12 21:47 - Completed read-only progress audit: mapped backend counter emitters, mismatch causes, unstable UI path rendering, and verification scenarios.
- [x] 2026-06-12 22:12 - Added focused progress view utility tests, updated progress pool labels, and constrained long-path rendering in progress widgets.
- [x] 2026-06-12 22:12 - Verified unit tests and production UI build before browser smoke.
- [x] 2026-06-12 22:18 - Completed active-scan browser verification on a smaller isolated fixture without overloading the server.

## Unfinished Work

- [x] Complete active-scan browser verification using a smaller fixture and immediate DOM inspection.
- [x] Align ambiguous backend pool counters with clearly labeled lane work-item totals.
- [x] Restyle progress bars so file paths cannot resize the widget.
