---
date: 2026-06-12
status: complete
subject: tauri-runtime-detection
---

# Plan 016 - Tauri Runtime Detection

## Goal

Fix the Tauri desktop app showing "Live updates reconnecting" by ensuring the UI uses the native RPC/event bridge inside the Tauri WebView.

## Context

- Browser mode at `localhost:3838` shows live updates connected, so the WebSocket path is healthy.
- The running native app reports its WebView URL as `tauri://localhost`.
- `isTauriRuntime()` only checked `window.__TAURI_INTERNALS__` and `window.__TAURI__`, so a Tauri v2 app without global Tauri API exposure can be misclassified as browser mode.
- When misclassified, the UI tries to connect to `ws://localhost/api/events` from `tauri://localhost`, which leaves the app in reconnecting state.

## Decisions

- Treat `tauri:` app protocol as a first-class native runtime signal.
- Grant the main window Tauri core event permissions so `@tauri-apps/api/event.listen` can subscribe to backend `app-event` messages.
- Verify with a focused Node regression and by rerunning the native app.

## Work Log

- [x] 2026-06-12 19:22 - Reproduced the bug in the native Tauri app and confirmed the WebView URL is `tauri://localhost`.
- [x] 2026-06-12 19:22 - Added a failing one-off regression check proving current detection rejects `tauri://localhost`.
- [x] 2026-06-12 19:26 - Found that `src/native_app/capabilities/default.json` had no permissions, which blocks Tauri core event listening in v2.
- [x] 2026-06-12 19:37 - Found that `desktop-run`/`cargo run` verification was showing a stale packaged app window; Tauri CLI executes build commands from `src/`, so config paths need to target `../ui`.
- [x] 2026-06-12 19:41 - Confirmed `frontendDist` is resolved from `src/native_app`, so it must remain `../../ui/dist` while commands use `../ui`.
- [x] 2026-06-12 19:45 - Rebuilt the macOS `.app` bundle and verified the packaged app shows `Live updates connected`.
- [x] 2026-06-12 19:54 - Made the native main window explicitly show and focus after creation because rebuilt packaged launches could register as foreground without a discoverable window.
- [x] 2026-06-12 20:02 - Investigated blank packaged windows and identified Tauri deep-route restoration as the risky path: browser mode keeps normal paths, while Tauri mode now stores routes in `location.hash` so the embedded app always loads from `index.html`.
- [x] 2026-06-12 20:07 - Built scratch prototypes under `/tmp/file-census-prototypes`: route/asset URL resolution and app route parity. Findings: Tauri hash routes preserve deep links while keeping asset requests rooted at `tauri://localhost/assets/...`; relative assets are unsafe if a Tauri window ever restores to a deep pathname.

## Unfinished Work

- [x] Patch runtime detection and rerun the regression.
- [x] Verify with the Tauri CLI path after fixing the frontend build paths.
- [x] Rebuild/rerun the native app and confirm the status changes from reconnecting to connected.
