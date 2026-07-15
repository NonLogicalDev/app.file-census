---
date: 2026-06-14
status: complete
subject: hash-queue-backpressure
---

# Hash Queue Backpressure

## Goal

Make scanner hash-queue backpressure match the actual worker model and make task progress bars represent worker state clearly.

## Context

The scanner currently runs one hash worker per CPU and three metadata workers per CPU, but both sync and async scan paths used a hardcoded hash queue capacity of `128`. On a 12-worker hash pool that is only about 10 queued files per worker, which is too shallow to be a meaningful memory guard and too likely to become accidental throughput backpressure.

Discovery and metadata handoff is already unbounded to prioritize fast first-pass discovery. Capping only metadata-to-hashing is inconsistent: it does not bound total scan memory, but it can make metadata workers block on hash enqueue and make progress counts lag because hashing queued counts only increase after metadata gets through the cap.

## Decisions

- Make the hash queue unbounded, matching the discovery/work handoff. The real limiter should be hash worker count and disk bandwidth, not a shallow queue.
- If scan memory needs bounding later, add a holistic scan memory/backpressure strategy instead of capping one internal stage.
- Render progress as `Done | Queued | Active` so the UI reflects worker state directly.
- Do not render the current file path in compact task progress. Current paths churn too quickly and pollute the task UX.
- Add a lightweight Vite component preview surface before adopting a heavier Storybook dependency.
- Component preview entries should be route-addressable by component and variant, using hash routes such as `preview.html#/scan-progress/expanded`.

## Implementation Steps

- [x] Add this plan.
- [x] Uncap hash queues in sync and async scan paths.
- [x] Update task progress labels to `Done | Queued | Active`.
- [x] Remove current-file rendering from task progress.
- [x] Add an isolated component preview command.
- [x] Add route-addressable component and variant preview stories.
- [x] Run focused backend and UI tests.

## Learning Log

- 2026-06-14 22:55 - A 128-slot hash queue is only about 10 jobs per hash worker on a 12-core machine. That does not provide useful memory protection compared with a larger bounded queue, but it can stall metadata enqueue work unnecessarily.
- 2026-06-14 23:09 - Revised decision: the hash queue should be unbounded like the discovery/work queue. A one-stage cap is not a coherent memory boundary and it makes task queue counts less truthful during scans.
- 2026-06-14 23:09 - Task progress bars should show state counters instead of current paths. File-level churn belongs in the work log, not the progress-card chrome.
- 2026-06-14 23:21 - Preview stories now use explicit component/variant route config. Hash routes keep the preview static-host friendly while preserving deep links for visual review.
- 2026-06-14 23:46 - Visual preview showed that separate expanded/compact structures made progress cards inconsistent and caused clipped labels. Use the compact-style header-plus-bar structure for both variants, with elapsed time at the card level.

## Work Log

- [x] 2026-06-14 22:55 - Created plan for hash queue backpressure adjustment.
- [x] 2026-06-14 22:55 - Replaced fixed 128-slot hash queues in sync and async scanner paths with worker-scaled capacity and trace logging.
- [x] 2026-06-14 22:55 - Verified focused scanner tests.
- [x] 2026-06-14 23:09 - Reworked the scanner hash queues to be unbounded in sync and async paths.
- [x] 2026-06-14 23:09 - Reworked scan progress pool UI to show `Done | Queued | Active` and added a Vite component preview entrypoint.
- [x] 2026-06-14 23:09 - Verified scanner tests, UI tests, and production UI build.
- [x] 2026-06-14 23:21 - Added route-addressable preview story config for component/variant links.
- [x] 2026-06-14 23:46 - Used the in-app browser to visually verify preview routes and fixed progress card clipping/contrast.
- [x] 2026-06-14 23:46 - Added elapsed time to progress cards and made expanded cards share the compact no-extra-line layout.

## Unfinished Work

- [x] Run focused backend/UI verification and checkpoint.
