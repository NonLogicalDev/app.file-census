---
date: 2026-06-27
status: complete
subject: live-progress-events
---

# Goal

Make scan/task progress in the web interface truthful and resilient: worker-pool progress should not get stuck, discovery should not look like it discovered zero files/items while downstream stages move, and progress bars should represent current backend state rather than stale event fragments.

# Context

The tasks page showed active scans where discovery progress displayed `Done 0` while metadata and hashing had already processed work. Some progress bars also appeared stuck. The CLI work showed that the backend store has useful pool counters, but the web UI depends on websocket events and coalesced snapshots.

# Product Integration

- Existing product model: Tasks is the live operational view for scan work; websocket events are the primary live data path, with HTTP/RPC refresh as recovery.
- New requirement's real intent: the user needs to trust the Tasks page as a live control surface for long scans.
- Cleanest integrated model: pool counter transitions should update the canonical progress store and emit throttled snapshots directly from the backend; the UI should label pool counters as work items and render current done/queued/active/left state.
- Existing pieces that should move, change, or disappear: remove reliance on unrelated scan logs or summary updates to carry pool-counter state.
- Architecture impact: progress event emission becomes state-driven and throttled at the progress-store boundary instead of opportunistic at batch/log boundaries.
- Why this is better than a local patch: a UI-only refresh loop would mask stale events while preserving the underlying lie that worker-pool state changes are not actually reported.

# Decisions

- Use throttled progress emits for worker-pool transitions instead of silent updates.
- Keep high-frequency file log coalescing/dropping separate from progress state. Progress state should be compact and current; file logs can be lossy.
- Label discovery as work items, not files, because discovery counts file and directory work items.

# Implementation Steps

- [x] Identify whether stale web progress is produced in backend event emission or React state merging.
- [x] Change scanner worker-pool mutations from silent updates to throttled progress updates where appropriate.
- [x] Adjust progress rendering/tests so labels expose left/active/queued and avoid implying discovery file counts.
- [x] Run backend and UI tests for progress/event behavior.
- [x] Run component preview or browser verification for task progress if UI rendering changes materially.

# Learning Log

- 2026-06-27 16:33 - Worker-pool transitions mostly use `update_silent`, so websocket clients can remain stuck on an old pool state until some unrelated emitted event happens. This is the main cause of cursed task progress.
- 2026-06-27 16:38 - Progress bars were also visually lying: queued/active segments contributed to filled bar width, so `Done 0 | Active 1` could render as a full bar. Bars now represent completed work only; queued/active/left remain textual counters.
- 2026-06-27 16:42 - Recent-events scan-start cards should not show `0 files - 0 B`; scan start is an acceptance/lifecycle event, not a meaningful progress sample.

# Work Log

- [x] 2026-06-27 16:33 - Traced task progress from scanner pool updates through websocket coalescing and React task rendering.
- [x] 2026-06-27 16:39 - Switched worker-pool transitions to throttled progress emits and removed the now-unused silent progress mode.
- [x] 2026-06-27 16:42 - Changed progress bars to fill only by completed work, added UI tests, and removed misleading zero counts from scan-start recent events.
- [x] 2026-06-27 16:45 - Verified backend tests, UI tests, production UI build, and component previews for expanded/compact scan progress.

# Unfinished Work

N/A
