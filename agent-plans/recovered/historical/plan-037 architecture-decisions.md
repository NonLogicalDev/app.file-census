---
date: 2026-06-14
status: complete
subject: architecture-decisions
---

# Architecture Decisions

## Goal

Create a durable architecture decision document for `file-census` that captures the current product/technical shape, the decisions made during the POC, and the staff-engineer improvements that should guide the next round of work.

## Context

The project has moved quickly through scanning, UI, desktop, WebSocket/RPC, duplicate-cache, delete-check, and performance iterations. The decisions are currently spread across README, design notes, plans, code, and session context. That makes it too easy to repeat old debates or regress performance.

## Decisions

- Write a current-state architecture document under `docs/`, not only a task plan.
- Separate architectural facts from recommendations. Facts should describe what exists now; recommendations should describe what should change next and why.
- Include performance decisions as first-class architecture because discovery speed, delete-check latency, WebSocket responsiveness, and SQLite write behavior are core product constraints.
- Call out risk areas directly instead of making the document read as if the POC is fully hardened.

## Implementation Steps

- [x] Inspect current backend, WebSocket, Tauri, search, duplicate-cache, and UI table code paths.
- [x] Create this plan with decisions and work log.
- [x] Write `docs/architecture-decisions.md`.
- [x] Link the architecture document from existing design documentation.
- [x] Run lightweight docs verification.
- [x] Checkpoint the documentation.

## Learning Log

- 2026-06-14 18:18 - Current code confirms SQLite WAL, app-event journaling, browser JSON-RPC/WebSocket, direct Tauri `AppCore` RPC, cancellable browser/native RPC requests, duplicate-cache readiness, and TanStack React Table usage.
- 2026-06-14 18:18 - The design documentation still carries some historical context. The new architecture doc should be the stable current-state reference, while `docs/design-iterations.md` remains useful chronology.

## Work Log

- [x] 2026-06-14 18:18 - Started architecture documentation pass from a clean worktree.
- [x] 2026-06-14 18:18 - Reviewed README, design iterations, backend app/web/scanner/events/db/search/cache paths, native Tauri bridge, and frontend RPC/table usage.
- [x] 2026-06-14 18:18 - Added `docs/architecture-decisions.md` and linked it from `docs/design-iterations.md`.
- [x] 2026-06-14 18:18 - Ran `git diff --check` and removed stale AG Grid references from design history.

## Unfinished Work

- [x] Checkpoint the architecture decision document.
