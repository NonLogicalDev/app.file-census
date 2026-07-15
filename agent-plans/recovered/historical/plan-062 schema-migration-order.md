---
date: 2026-06-27
status: complete
subject: schema-migration-order
---

# Goal

Fix desktop/native startup on existing SQLite databases that predate `files.file_kind`, and make location-add CLI defaults work against both fresh and migrated databases.

# Context

`just desktop-run` currently panics during Tauri setup when opening an existing database:

```text
no such column: file_kind
CREATE INDEX IF NOT EXISTS idx_files_live_kind_hash_size_scan ON files(file_kind, blake3, size, scan_id)
```

The failing DB has an older `files` table. `Database::migrate` creates indexes in the same batch as `CREATE TABLE IF NOT EXISTS`, before the later `ALTER TABLE files ADD COLUMN file_kind` migration runs.

Follow-up CLI failure:

```text
file-census --db ./db-data/photos.db locations add --path /Volumes/MusicBox/@NonMusic --slug music-box-photos local
error: the following required arguments were not provided:
  --name <NAME>
```

`locations add` should default `name` to `slug`. Its kind positional should be optional, defaulting to `unknown`.

Foreground `scans start` should also stream human-readable progress logs. The user specifically needs the generated scan id and pending queue counts for discovery, metadata, and hashing while the command is running.

# Product Integration

- Existing product model: one SQLite DB should remain usable by CLI, web server, and Tauri desktop entrypoints; location kind is currently a narrow enum.
- New requirement's real intent: app startup must migrate old DBs before any schema-dependent indexes or queries run, CLI location creation should not require redundant metadata, and foreground scan commands should expose live operational state.
- Cleanest integrated model: phase schema work as tables first, column/data migrations second, indexes last; make `unknown` a first-class location kind rather than treating omitted kind as `local`; route foreground scan commands through the existing scan progress/event path so CLI output matches app progress semantics.
- Existing pieces that should move, change, or disappear: move all `CREATE INDEX IF NOT EXISTS` statements out of the initial table batch and run them after column migrations/backfills; migrate old `locations.type` constraints so `unknown` is valid.
- Architecture impact: migrations become order-safe for future indexed columns.
- Why this is better than a local patch: guarding only the `file_kind` index would leave the same failure mode for the next indexed migrated column.

# Decisions

- Keep the current migration style but make ordering explicit.
- Add a regression test that opens an old-schema DB with a `files` table lacking `kind`, `file_kind`, and `ctime`.
- Add `unknown` as a real `LocationType` and default CLI-added locations to it when the kind positional is omitted.
- Default CLI location name to slug when `--name` is omitted.
- Use `ScanProgressStore` for foreground human-mode `scans start/update/repair` output, while keeping JSON output machine-clean.
- Human CLI scan progress should be compact and package-manager-like: one start line, a single updating TTY status line, explicit left/active/queued counts, and no per-file path spam by default.
- Leave the existing dirty `Justfile` change untouched.

# Implementation Steps

- [x] Reproduce root cause from the panic and schema order.
- [x] Move index creation after column migrations.
- [x] Add old-schema migration regression coverage.
- [x] Add `locations add` defaults for omitted kind/name.
- [x] Stream foreground scan progress logs with scan id and per-stage pending queue counts.
- [x] Compact foreground scan progress into an `apt`/`uv`/`docker`-style status line with a hash-stage bar and explicit remaining work.
- [x] Run focused backend tests and `just desktop-run` or equivalent startup verification.

# Learning Log

- 2026-06-27 15:39 - Root cause is migration ordering, not Tauri-specific behavior. Existing DBs skip `CREATE TABLE IF NOT EXISTS files (...)`, then index creation references columns that are only added later in the function.
- 2026-06-27 15:47 - The first regression test exposed the same migration gap for `files.mtime` and `files.mode`; old DBs need all current query-selected columns added before indexes and queries.
- 2026-06-27 15:52 - `unknown` cannot be a CLI-only default because existing SQLite `locations.type` CHECK constraints reject it. It needs to be part of the domain enum plus a table-rebuild migration for old schemas.
- 2026-06-27 15:57 - Foreground scan commands already had structured progress through `ScanProgressStore`; the clean CLI integration is to reuse that event/progress path and print human output only when `--json` is not requested.
- 2026-06-27 23:08 - Queue counts alone were technically live but did not answer the user's real question: "how much is left?" Human CLI progress now reports done/total/left for discovery, metadata, and hashing, plus active/queued for hashing where backlog matters most.
- 2026-06-27 23:10 - Do not stream every processed file in foreground CLI mode. Long paths bury progress signal. Keep full event/log plumbing intact, but make the default terminal output operationally compact.

# Work Log

- [x] 2026-06-27 15:39 - Read repo guidance, reproduced the failure from the provided panic, and traced `file_kind` schema/index creation order.
- [x] 2026-06-27 15:52 - Added phased index creation, missing file-column migrations, `unknown` location kind, CLI defaults, and regression tests.
- [x] 2026-06-27 15:50 - Verified focused migration test, CLI location-add tests, full backend test suite, UI build, native app startup, and direct CLI smoke command with kind after flags.
- [x] 2026-06-27 15:57 - Added foreground scan progress streaming for human CLI output and regression coverage for scan id plus queue status.
- [x] 2026-06-27 23:10 - Reworked human scan output into compact status lines, verified focused CLI test, full backend test suite, release install, and plain `file-census` smoke command.

# Unfinished Work

- [x] Implement the migration order fix.
- [x] Verify old DB migration and native startup.
