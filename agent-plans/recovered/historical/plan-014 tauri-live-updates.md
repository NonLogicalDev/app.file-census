---
date: 2026-06-12
status: complete
subject: tauri-live-updates
---

# Plan 014 - Tauri Live Updates

## Goal

Fix live update propagation in the Tauri desktop app so native instances receive scan/status changes without manual refresh.

## Context

- Browser mode receives backend events over JSON-RPC/WebSocket.
- The Tauri app talks directly to the Rust core through native commands/events and does not run the localhost API server.
- User reports live updates do not appear to work in the Tauri app.
- Recent scan-progress work added richer live progress payloads; the native event path needs to carry the same semantics as the web event path.

## Decisions

- Treat Tauri live updates as a native-event parity bug, not a UI polling workaround.
- Compare `src/backend/src/app.rs` event emission with `src/backend/src/web.rs` WebSocket event forwarding.
- Verify that the frontend `useRpcConnection` receives and normalizes Tauri events the same way it handles web socket events.
- Prefer one shared event payload shape from the backend progress store for browser and native.
- Persist app events into a bounded SQLite event journal so separate native processes sharing the same DB can rebroadcast each other's updates.
- Native `DesktopState` owns an event-journal polling task and aborts/restarts it when the selected database changes.

## Implementation Steps

1. Inspect native app command/event bridge under `src/native_app`.
2. Inspect `ui/src/api/useRpcConnection.js` Tauri event subscription behavior.
3. Run `desktop-check` and, if practical, a local `desktop-run` smoke.
4. Fix event forwarding or frontend subscription gaps.
5. Verify scan start/progress/finish events update the UI in Tauri without route changes or manual refresh.

## Learning Log

- Native desktop should behave like the web app's live WebSocket mode even though it does not use the HTTP/WebSocket server.
- Root cause: each Tauri process owns its own `AppCore` and private in-memory `EventHub`, so direct-core native instances cannot observe events produced by another process unless events are persisted or shared through IPC.
- The frontend Tauri payload shape already matched the browser `event` params shape; the missing piece was cross-process event propagation, not React event normalization.
- The event journal starts polling from the current max event id so a newly opened app does not replay historical UI events, while ordinary RPC refresh still loads current DB state.

## Work Log

- [x] 2026-06-12 18:22 - Created this task from the user report that Tauri live updates are not working.
- [x] 2026-06-12 18:34 - Audited browser WebSocket event wrapping, Tauri `app-event` emission, `AppCore` event emission, and React `useRpcConnection`.
- [x] 2026-06-12 18:36 - Added a failing DB test for persisted app event ordering/filtering.
- [x] 2026-06-12 18:37 - Added bounded SQLite `app_events` journaling and EventHub recorder/broadcast-only paths.
- [x] 2026-06-12 18:39 - Added native AppCore journal polling and restarted the poller on database switch.
- [x] 2026-06-12 18:40 - Added an AppCore regression test proving one core can broadcast events recorded by another core.
- [x] 2026-06-12 18:40 - Verified with `cargo test -p file-census-backend app_events_are_recorded_and_read_by_other_sources_in_order`, `cargo test -p file-census-backend app_core_broadcasts_events_recorded_by_other_cores`, and `just desktop-check`.
