---
date: 2026-06-12
status: complete
subject: cli-file-processing
---

# Plan 020 - CLI File Processing

## Goal

Make the app capable of doing almost every file gathering and processing workflow through a polished CLI interface, not only through the web or desktop UI.

## Context

- The project started as a single Rust binary that can serve the UI and store state in SQLite.
- The scanner, duplicate analysis, delete check, metadata, EXIF, thumbnails, liveness, and repair/update logic are increasingly useful as headless operations.
- The user wants a great CLI interface for invoking these workflows directly.
- Latest reinforcement: the CLI should handle almost everything related to gathering and processing files, not only status lookup or simple scans.
- The CLI should share the same Rust core as web and Tauri so behavior does not drift.

## Decisions

- Treat CLI as a first-class product surface with stable commands, clear output, and script-friendly modes.
- Default output should be human-readable; every command that returns structured data should also support JSON.
- Long-running commands should show stable progress, support cancellation, and leave useful resumable state.
- Database location handling should match the app default and support explicit `--db`.
- First implementation batch should create a CLI parity foundation rather than every command at once: command hierarchy, `--json` plumbing, and shared-core dispatch for read/metadata workflows.
- Foreground CLI scans can support Ctrl-C cancellation, but a separate `file-census scans stop <id>` process cannot control scans running inside web/Tauri while scan control remains process-local. Defer cross-process pause/resume/stop until there is daemon/server IPC or an explicit `--server` targeting mode.

## Implementation Steps

1. Inventory current CLI commands and backend AppCore methods.
2. Design command groups for locations, scans, files, duplicates, delete-check, metadata, thumbnails, liveness, and maintenance.
3. Add JSON and table output modes where useful.
4. Route CLI operations through shared backend core methods used by web/Tauri.
5. Add integration tests around representative workflows using temporary SQLite databases.
6. Document common recipes in README or CLI help examples.

## First Batch Command Surface

```text
file-census --db <path> --json overview
file-census locations list
file-census locations add <local|disk|nas> --name <name> --slug <slug> --path <path> [--notes <text>]
file-census locations update <slug> [--kind ...] [--name ...] [--path ...] [--notes ...]
file-census locations enable <slug>
file-census locations disable <slug>
file-census locations delete <slug> --yes
file-census locations liveness [slug]
file-census locations open-folder <slug> [--path <relative-path>]
file-census scans list
file-census scans start <location-slug> [--offset /]
file-census scans update <scan-id>
file-census scans repair <scan-id>
file-census scans tree <scan-id> [--path <path>]
file-census scans delete-check <scan-id> [--path <path> | --paths <path>...]
file-census scans notes <scan-id> [--notes <text> | --clear]
file-census scans excludes get <scan-id>
file-census scans excludes set <scan-id> <pattern>...
file-census scans delete-path <scan-id> <path>
file-census scans set-representative <scan-id>
file-census scans clear-representative <scan-id>
file-census scans delete <scan-id> --yes
file-census files find <query> [--limit 50]
file-census files details --blake3 <hash> --size <bytes>
file-census files open <location-slug> <relative-path>
file-census files reveal <location-slug> <relative-path>
file-census duplicates list [--limit 50]
file-census thumbnails build <scan-id> [--path <path> | --paths <path>...] [--recursive]
```

## Learning Log

- CLI parity should be driven by workflows, not by exposing every internal RPC one-for-one.
- The CLI needs both interactive ergonomics and automation reliability.
- Audit found the current CLI covers only `location add`, `location list`, `scan`, `find`, `dupes`, and `serve`; it bypasses `AppCore` and calls `Database`/`scanner` directly, which risks behavior drift from web/native.
- `AppCore::handle` already covers most high-value workflows: locations, scans, update/repair/pause/resume/stop, delete check, file tree/search/details, dupes, thumbnails, and live progress.
- Web has a near-duplicate RPC dispatcher in `web.rs`; moving web/CLI onto the same `AppCore` command bus should reduce future drift.
- The first CLI implementation batch should focus on command hierarchy, `--json` output, and routing existing workflows through shared core methods before adding maintenance-only commands.
- A focused audit confirmed current CLI direct commands are only `location add/list`, `scan`, `find`, `dupes`, and `serve`, while `AppCore::handle` already exposes the richer command surface needed for CLI parity.
- Treat `pause`, `resume`, and `stop` carefully in CLI design: the current controls are in-memory and process-local, so they need either a foreground scan model or a way to target a live app/server process.
- Split `src/backend/src/main.rs` before expanding the CLI: keep parsing and `serve` in main, move command enums/dispatch into `cli.rs`, move output rendering into `cli/output.rs`, and expose typed helpers around `AppCore::handle` instead of duplicating business logic.
- Integration tests should start with temp SQLite workflows: locations add/list JSON, foreground scan completion, file find/tree/duplicate rows from a tiny fixture, delete-check unsafe case, and a focused cancellation unit test for the foreground scan runner.
- First implementation batch split CLI parsing/dispatch out of `main.rs` into `src/backend/src/cli.rs`; output rendering stayed in that module for now instead of a separate `cli/output.rs` because the command surface is still moving.
- Foreground CLI scans currently run through the scanner core directly and return the completed `ScanSummary`; this is correct for short-lived CLI processes and avoids the web/Tauri background job model.
- `--path` and `--paths` in `scans delete-check` are intentionally different: `--path` checks a folder/current view prefix, while `--paths` checks selected individual files/folders.
- Second-batch scan management commands now cover notes, excludes, scan deletion, path deletion, and representative status. These are database-backed operations and do not require a live app process.
- `scans excludes set` replaces the scan's exclude list with the provided patterns; keeping replacement semantics makes CLI automation deterministic.
- `scans delete` requires `--yes`; destructive CLI paths should stay explicit even in JSON/script mode.
- Explicit liveness checks and open/reveal helpers are still separate because they are host/environment interactions rather than pure SQLite operations.
- CLI liveness can safely reuse AppCore's liveness view and return either all locations or one location by slug; tests should not assume ordering of locations in the returned array.
- Host open/reveal commands should share AppCore path sanitization so CLI, web, and native cannot drift on relative child-path handling.
- Open/reveal commands are intentionally not invoked by automated tests because they launch host UI; cover their shared path sanitizer and pure liveness behavior instead.
- HTTP JSON-RPC at `/api/rpc` is the smallest practical bridge for server-targeted CLI controls: it preserves the app RPC vocabulary without adding a WebSocket client dependency to the CLI.
- `scans running`, `scans progress`, `scans pause`, `scans resume`, and `scans stop` are intentionally server-targeted because active scan state is process-local.
- JSON output is the current export surface for automation; dedicated database maintenance commands should be added when there is a concrete workflow rather than as speculative wrappers.

## Work Log

- [x] 2026-06-12 21:29 - Added CLI-first file processing task from user request.
- [x] 2026-06-12 21:47 - Completed read-only CLI audit: inventoried current commands, gaps against desired workflows, recommended hierarchy, shared-core refactor targets, and likely integration tests.
- [x] 2026-06-12 22:12 - Reinforced CLI scope from user request: support nearly all file gathering and processing operations from a polished command surface.
- [x] 2026-06-12 22:18 - Ran a second bounded CLI parity audit to confirm AppCore RPC coverage and the smallest useful implementation batch.
- [x] 2026-06-12 22:49 - Integrated subagent CLI audit into this plan: exact first-batch commands, Rust split targets, test starting points, and process-local scan-control risk.
- [x] 2026-06-12 23:17 - Implemented first CLI batch: global `--json`, `overview`, plural `locations`, `scans`, `files`, `duplicates`, and `thumbnails` command groups while keeping legacy `location`, `scan`, `find`, and `dupes` entrypoints.
- [x] 2026-06-12 23:17 - Added CLI integration tests for temp database workflows: locations add/list JSON, overview JSON, foreground scan completion/listing, files find, scan tree, delete-check selected file, and duplicates list.
- [x] 2026-06-12 23:17 - Verified CLI batch with `cargo test -p file-census-backend --test cli`, full `cargo test -p file-census-backend`, and `just build`.
- [x] 2026-06-12 23:24 - Added and verified scan management CLI commands for scan notes, excludes get/set, scan deletion, scan-path deletion, and representative set/clear using a RED/GREEN CLI integration test.
- [x] 2026-06-12 23:24 - Re-verified CLI second batch with full `cargo test -p file-census-backend`, `just build`, and `git diff --check`.
- [x] 2026-06-13 00:03 - Added CLI liveness checks plus host open/reveal command wiring through shared AppCore helpers; verified with focused CLI liveness and path sanitizer tests.
- [x] 2026-06-13 01:34 - Added HTTP JSON-RPC server endpoint and server-targeted CLI `scans running/progress/pause/resume/stop` controls.
- [x] 2026-06-13 01:34 - Added real-server CLI integration tests and updated README CLI/export/maintenance documentation.
- [x] 2026-06-13 01:34 - Verified final CLI batch with focused CLI tests, full backend tests, `just build`, and `git diff --check`.

## Unfinished Work

- [x] Inventory current CLI surface.
- [x] Design first-batch command hierarchy and output modes.
- [x] Implement first-batch CLI modules, JSON output, and core dispatch commands listed above.
- [x] Add CLI integration tests for temp database workflows before implementation.
- [x] Add second-batch CLI commands for scan notes/excludes, scan deletion/path deletion, and representative scan management.
- [x] Add explicit liveness checks and host open/reveal helpers where supported.
- [x] Add external pause/resume/stop through server targeting, document current liveness/export maintenance boundaries, and avoid speculative maintenance subcommands.
