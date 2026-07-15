---
date: 2026-06-13
status: complete
subject: websocket-stop-wedge
---

## Goal

Fix WebSocket live-update wedging and ensure scan control actions like Stop do not get stuck behind high-frequency scan progress events.

## Context

Recent changes made persisted progress snapshots nonblocking, but the browser still uses one WebSocket for both JSON-RPC commands and live events. Under heavy scanning, the old server loop could await outbound event sends and stop reading inbound JSON-RPC requests on that same socket.

## Decisions

- Keep JSON-RPC and event notifications on WebSocket as the primary browser communication path.
- Split server-side WebSocket work into independent reader, writer, and event-forwarder tasks so inbound control RPC can be read even while outbound events are slow.
- Prioritize RPC responses over event notifications in the writer.
- Keep live events granular in the backend, but coalesce scan progress/log traffic before sending it to the browser.
- Raw scan progress can remain high-frequency inside the backend; transport to UI should be chunked and bounded.
- Stop/pause/resume must remain responsive even if event delivery is slow or reconnecting.
- UI delete flows must stay true to the data source: no local removal of scans/locations until the backend confirms deletion and a refresh reads current state.
- Active scans must not be directly deleted. Delete should fail fast with a clear backend error until the scan is stopped/interrupted, because active scanner writers can still hold or reacquire DB write access.
- Progress/control state is cleanup state, not durable state. Do not call `progress.remove()` before the database delete has succeeded; doing so can discard the stop/control handle while the scanner still exists.
- Add CLI verbose logging for command start/completion/failure and elapsed time so scan/delete/repair behavior can be measured from the command line without guessing.
- JSON-RPC calls need CLI server-console timing logs. When running `file-census --verbose serve`, stderr should show when each RPC was received, how long it took, and whether it succeeded.

## Implementation Steps

- [x] Trace backend WebSocket event/RPC loop and frontend RPC transport.
- [x] Add regression tests for browser RPC transport separation and event chunk handling.
- [x] Split WebSocket reader/writer/event forwarding tasks while keeping browser RPC on WebSocket.
- [x] Coalesce scan progress/log events in the WebSocket sender path and handle log batches in UI.
- [x] Verify backend/UI tests and build.

## Learning Log

- Candidate root cause: browser RPC and live events share `/api/events`; the old server loop awaited event sends and read incoming RPC from the same task, so event backpressure could delay reading `scans.stop`.
- The copied app DB showed raw SQLite cascade delete for an inactive scan completes quickly in direct SQLite testing, so multi-minute UI deletes are unlikely to be caused by SQLite row count alone.
- Both Web/Tauri `scans.delete` and `locations.delete` paths removed progress/control state before calling the DB delete. If the scan is active, this can erase the only stop/control handle before durable deletion has committed.
- The database layer previously allowed deleting `running` scans and locations containing active scans. Tests now capture that as wrong behavior.
- WAL is already enabled on each SQLite connection via `PRAGMA journal_mode = WAL`; this is not the missing piece for the delete symptom.
- User confirmed interrupted scan delete still takes ages, so active-delete rejection is necessary but not the whole issue. Next measurement must split delete RPC time from post-delete refresh time.
- Current UI `refresh()` after delete reloads overview, locations, scans, running progress, duplicate groups, and the selected tree. If the delete RPC is fast but UI remains locked, the full refresh path is the likely delay.
- JSON-RPC calls currently do not render with timings in the CLI server console, leaving a visibility gap for the primary communication path.
- Clarification: the requested console logs are CLI/server console logs, not browser DevTools logs.
- Correction: log all JSON-RPC methods, including read-only tree/list/search calls, because refresh lockups can hide in read paths too.
- Trace verbosity should be intentionally noisy. At `-vvv`, server RPC logs may include full params/results and payload sizes so we can inspect pathological refresh/delete behavior without recompiling.
- User clarified the missing logs are from the running server console while deleting in the UI. The relevant path is the server JSON-RPC handler behind the UI WebSocket, so server stderr must log `scans.delete`/`locations.delete` received and completed entries.
- Added DB-level delete timing logs so a `scans.delete` RPC can be split into RPC receive/completion timing and SQLite delete timing.
- Acceptance run exposed the remaining WebSocket wedge: `websocket_reader` still awaited each RPC handler serially. A slow `scans.tree` request can block the reader from even receiving/logging a later `scans.delete` request from the UI.
- JSON-RPC permits out-of-order responses keyed by id, so WebSocket request handling should dispatch each valid request into its own task and send responses back through the response queue.
- `scans.tree` should be folder-paged. Normal Finder-style browsing uses `depth=1`; explicit recursive listings use `depth=0`. Pagination applies to the entries for that selected folder/depth combination.
- Project is greenfield: do not carry backwards-compatible response shapes. `scans.tree` returns a page object only; UI should consume that shape directly.
- The native/Tauri RPC path must match the web server JSON-RPC shape. No app surface should return the old raw `TreeEntry[]` shape for `scans.tree`.
- Full WebSocket multiplexing requires both sides to avoid serial event work: the server must read requests, write responses, and forward events independently; the client must settle RPC responses immediately and process notification events through an asynchronous bounded queue.
- Request cancellation needs a protocol-level control path. Client-side promise timeout is insufficient because it does not tell the server to stop stale work; `rpc.cancel` over WebSocket should abort the registered in-flight request and return a cancellation error to the original request id.
- Tauri cancellation is a separate parity problem: the desktop app uses native `invoke('rpc')`, not the WebSocket transport, so it needs native request IDs, an active-task registry, and a cancel command/event contract rather than only dropping the frontend promise.
- Loading state is data state. The UI should distinguish "not loaded yet" from "loaded and empty" for locations, scans, files, and search results; otherwise startup/refresh briefly lies to the user by rendering empty states.
- `scans.tree` must not compute duplicate counters inline. Folder browsing is the hot path; duplicate/original/same-scan duplicate counts should come from a future cache/background job and render as unknown while missing.
- Removing the tree duplicate-count CTE changed example DB steady-state timings to about 0.08s for root current-folder, 0.01s for the Photos library folder, and 0.02s for recursive root in the CLI timing probe.
- Folder descendant file counts are different from duplicate counts: current-folder tree listing already walks descendant file rows to compute folder size, so `TreeEntry.file_count` can be surfaced directly for directory rows without a new cache table. Revisit caching only if this existing fold becomes measured as a bottleneck.
- 2026-06-14 21:31 - The earlier "active scans must not be directly deleted" decision was superseded by `plan-038`: persisted active-looking rows can be stale after abrupt exits and must be deletable, while actual live workers remain controlled through `ScanProgressStore` and persisted control state.

## Work Log

- [x] 2026-06-13 23:48 - Began systematic debugging after report that WebSocket live updates and Stop get wedged.
- [x] 2026-06-13 23:50 - Identified shared browser WebSocket RPC/event lane as the primary stop-wedge candidate.
- [x] 2026-06-13 23:55 - Rejected HTTP-RPC detour after user clarified WebSocket/events should remain the communication path.
- [x] 2026-06-13 23:56 - Added tests and implemented WebSocket task split plus event chunking.
- [x] 2026-06-14 00:05 - Copied the user app DB to `/private/tmp/file-census-debug.db` for measurements; direct inactive scan delete was sub-second.
- [x] 2026-06-14 00:09 - Added RED tests proving active scan/location deletes are currently accepted by the database layer.
- [x] 2026-06-14 00:13 - Enforced active-delete rejection and reordered progress cleanup after committed deletes.
- [x] 2026-06-14 00:18 - Added CLI `--verbose` command timing logs; fixed precedence so explicit `--verbose` overrides ambient `RUST_LOG=warn`.
- [x] 2026-06-14 00:21 - Added CLI server-console JSON-RPC timing logs, including delete RPCs.
- [x] 2026-06-14 00:28 - Added DB-level delete timing logs and tests that server stderr contains received/completed delete RPC entries with request id and elapsed time.
- [x] 2026-06-14 00:40 - Ran the requested server command on `db-example.db`; observed slow `scans.tree` blocking the WebSocket reader before delete could be received/logged.
- [x] 2026-06-14 00:41 - Made WebSocket JSON-RPC request handling concurrent.
- [x] 2026-06-14 00:47 - Added folder-scoped `scans.tree` paging with `depth`.
- [x] 2026-06-14 00:53 - Aligned native/Tauri `scans.tree` RPC to return the paged tree object with `limit`, `offset`, and `depth`.
- [x] 2026-06-14 01:08 - Added asynchronous client-side event queue so WebSocket events do not run inline with RPC response handling.
- [x] 2026-06-14 01:08 - Added client `AbortSignal` cancellation for tree RPCs and server-side `rpc.cancel` request registry support.
- [x] 2026-06-14 01:08 - Rerun exact acceptance flow against `db-example.db` and verify interrupted scan/location deletes plus CLI logs.
- [x] 2026-06-14 01:14 - Fix Tauri cancellation parity with a small prototype first, then add native request cancellation tests before implementation.
- [x] 2026-06-14 01:31 - Add explicit loading/awaiting states so startup and refresh do not temporarily render false "no locations" or "no files" states.
- [x] 2026-06-14 01:34 - Removed duplicate-count CTE work from `scans.tree`; tree rows now return null duplicate counters until a cache layer exists.
- [x] 2026-06-14 01:52 - Reused existing `TreeEntry.file_count` folder aggregation as the visible Files count in scan directory listings; skipped a new cache after deciding the count is already computed with folder size.
- [x] 2026-06-14 14:42 - Added WebSocket CLI regression tests for interrupted `scans.delete` and `locations.delete` RPC logging with request id and elapsed timing.
- [x] 2026-06-14 14:47 - Reran copied `db-example.db` WebSocket acceptance: `scans.delete` and `locations.delete` were received/logged while `scans.tree` was in flight; tree cancellation returned `-32800` promptly.
- [x] 2026-06-14 14:47 - Hid/guarded active-scan delete actions in the UI and added loading states for locations, scans, files, search, and duplicates.
- [x] 2026-06-14 16:28 - Added native/Tauri request-id cancellation registry plus `rpc_cancel` wiring so aborting a desktop RPC now propagates to backend work instead of only abandoning the JS promise.
- [x] 2026-06-14 16:31 - Closed the native abort race by queueing pre-start cancellations in the same registry lock as active request handles.
- [x] 2026-06-14 16:45 - Cleared the `TreePage` compile blocker and verified native cancellation with `cargo test -p file-census-native-app cancel_tracked_rpc` plus `just desktop-check`.
- [x] 2026-06-14 21:31 - Audited the plan against current code and documented that active-looking row deletion semantics are now owned by the later P0 architecture plan.

## Unfinished Work

- [x] Finish active-delete backend fix and make tests pass.
- [x] Add JSON-RPC timing logs visible in `file-census --verbose serve` stderr.
- [x] Hide/disable active-scan delete actions in the UI so the user path matches backend invariants.
- [x] Measure interrupted scan/location delete against copied app DB via CLI/backend instrumentation.
- [x] Fix Tauri cancellation so aborting a native RPC can cancel backend work instead of only abandoning the JS promise.
- [x] Render throbbers/skeletons/loading labels for initial locations, scans, files, and search/duplicate result loads instead of false empty states.
- [x] Run remaining UI/full build tests where practical.
