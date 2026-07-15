---
date: 2026-07-14
status: in-progress
subject: scanner-cli-operations
---

# Goal

Rebuild two terminal workflows on top of the same real scan lifecycle: a compatible scan bootstrap shorthand and an opt-in Ratatui progress renderer.

# Context

The deleted implementation had an explicit terminal product direction. The shorthand must accept the global `--db` database option plus source path and volume slug; create only missing compatible location/scan records; generate deterministic date-based IDs; and preserve legacy commands. The TUI must show authoritative pool/queue progress plus bounded active work ordered by elapsed duration, with no fabricated queued-path history or RAM-heavy unbounded queue snapshot.

# Product Integration

- Keep existing CLI forms valid while adding a two-positional `scan <source-path> <volume-slug>` bootstrap form.
- Use the same persisted location/scan lifecycle as browser-server/Tauri; no terminal-only records or control plane.
- Keep TUI rendering opt-in, noninteractive/plain output intact, JSON clean, and terminal cleanup RAII-safe.
- Apply `--tui` only to local scan runners: shorthand/legacy `scan`, `scans start`, and `scans update`. Do not imply a live remote TUI for `scans progress` until a polling contract exists.

# Decisions

- Canonicalize the source directory before mutation; reject blank slug or mismatched existing location root without mutation.
- Generate UTC `YYYYMMDDTHHMMSSZ--<slug>` scan IDs with a deterministic collision suffix.
- Reserve the compatible location (when missing), the date-derived ID, and its scan row in one `BEGIN IMMEDIATE` database transaction; the CLI reaches that path through a public scanner API and never issues SQL. Source implementation is complete; toolchain-backed proof remains required.
- Define TUI “pending” as in-flight worker work. Add bounded active-operation metadata at worker start/finish; do not retain every unstarted path in memory.
- Active operations carry a monotonic per-scan identity, pool, path, and RFC3339 start time. Their projection sorts oldest-first by the stable identity; completion, failure, deactivation, and terminal scan states remove them.
- `--tui` conflicts with global `--json`; non-TTY output falls back to the existing plain printer. `q` and Ctrl-C request the existing graceful stop and wait for worker join rather than terminating the scanner thread.

# Implementation Steps

1. [x] Make missing-location creation and date-derived scan reservation one atomic bootstrap operation, with injectable UTC and no mutation on any validation/setup failure. Source-level implementation and static review are complete; runtime proof remains in step 4.
2. [x] Add the compatible two-positional source grammar while preserving legacy `scan <location-slug>` behavior.
3. [x] Add bounded per-worker active-operation telemetry to the scan progress model.
4. [ ] Add deterministic CLI parser/bootstrap coverage plus disposable source integration evidence for success, mismatch, invalid offset, collision, and concurrent first-use paths.
5. [ ] Implement Ratatui/Crossterm rendering behind `--tui`: a pure snapshot/view model, exact pool bars, oldest-first bounded active rows, non-TTY fallback, lag-safe refresh, RAII terminal restoration, resize redraw, and graceful quit.
6. [ ] Prove the terminal workflow against real disposable scans, resizing/quit, non-TTY fallback, and unchanged scan controls.

# Learning Log

- The original source audit established that aggregate pool counts exist but queued paths have no truthful timestamps. The terminal UI must not invent that data.
- The promoted `src/backend/src/cli.rs` is a 1,778-line pre-conflict forensic prefix, not a valid canonical source: direct untruncated pre-deletion tail reads prove a 1,812-line file and disagree with the promoted file across checked overlap ranges. Do not append the 34 missing lines or merge them by hand.
- Existing `ScanCliProgressPrinter`, `ScanCliPool`, and `scan_cli_elapsed` are directly evidenced in historical source. No successful pre-deletion implementation patch for the requested simplified scan grammar, Ratatui dependency, renderer, or terminal acceptance result was recovered. Later source work covers the grammar/date-ID/telemetry portions, but not atomic bootstrap or a Ratatui renderer.
- The current shorthand calls `add_location` before `prepare_scan_with_started_at`; a later invalid offset/preparation failure can leave an empty location, and concurrent first use can race slug uniqueness. Move compatible-location lookup/create and date-ID reservation into one public database transaction after filesystem canonicalization.
- The shorthand now validates its source and offset before mutation, then calls the one-transaction database bootstrap operation. The helper retains legacy location-slug scans; the new form alone uses bootstrap. This is static source evidence until Rust tests run.
- `--db` is already a global optional flag, so the supported ergonomic form is `file-census --db <DB> scan <SOURCE_PATH> <VOLUME_SLUG>` rather than a third positional argument. Preserve that documented shape.
- The active-operation model is truthful and bounded, but current terminal output is only a one-line plain printer. It ignores active operations and is not a Ratatui interface.
- `run_prepared_scan_cli` already owns the local worker, event receiver, progress store, 100 ms loop, join/error path, and final summary. The TUI should consume authoritative `progress.get(scan_id)` snapshots there; it must not infer queued paths from events. Ratatui/Crossterm and their canonical lock resolution remain behind the explicit build-input approval gate.

# Work Log

- [x] 2026-07-14 22:45 - Recreated the CLI/TUI plan from durable requirements after the prior implementation was deleted.
- [x] 2026-07-15 00:47 - Audited direct pre-deletion CLI reads and preserved the source-recovery boundary: the latest 1,812-line tail cannot be safely merged into the 1,778-line recovered prefix, and the requested CLI/TUI work has no recovered implementation evidence.
- [x] 2026-07-15 04:18 - Added source-level date-derived scan identity: the database atomically reserves `YYYYMMDDTHHMMSSZ--<slug>` plus `--2`/`--3` collisions from an injected UTC time; the public scanner path preserves root validation and the two-positional CLI shorthand alone uses it. This does not yet atomically include missing-location creation, and CLI parser/bootstrap coverage still needs an injectable clock plus a real toolchain run.
- [x] 2026-07-15 04:30 - Added bounded active-operation telemetry to the real scanner pools: only in-flight worker operations are exposed, each with stable ID/pool/path/start time, and the oldest-first projection clears on every completion, failure, pool shutdown, and terminal state. Added focused source tests and passed `git diff --check`; no Rust toolchain or runtime test was provisioned.
- [x] 2026-07-15 05:18 - Replaced split bootstrap mutations with source-level `BEGIN IMMEDIATE` location/create-or-validate, date-ID reservation, and scan insertion. Added deterministic rollback/mismatch/collision/invalid-setup coverage and retained the Rust runtime-test gate.
- [x] 2026-07-15 05:34 - Completed the read-only Ratatui seam audit: existing local scan runners already expose truthful bounded progress at `run_prepared_scan_cli`; recorded the exact `--tui` surface, JSON/non-TTY policy, terminal lifecycle, and dependency gate without adding unproven dependencies.
- [ ] 2026-07-15 04:18 - Run the focused DB/scanner/CLI tests on a configured toolchain and record real shorthand/collision evidence before marking CLI bootstrap implementation or acceptance complete.
- [ ] 2026-07-15 04:30 - Add the opt-in Ratatui/Crossterm renderer only after approved dependency inputs are available; wire it to the existing event stream and active-operation projection without changing scan control ownership.
- [ ] 2026-07-15 05:18 - Run the focused DB/scanner/CLI tests after the approved toolchain/input restoration; then add the Ratatui dependency/renderer behind that explicit lockfile/dependency gate.

# Unfinished Work

- [ ] Complete all implementation and acceptance steps.
- [ ] Run the source-level atomic bootstrap through real concurrent first-use and CLI parsing tests once a Rust toolchain is available.
- [ ] Validate the date-derived ID and collision contract through the real CLI after the build-input gate is resolved.
- [ ] Validate telemetry cardinality, oldest-first display, terminal restoration, resize/quit, and non-TTY fallback through a real pseudo-terminal after the build-input gate is resolved.
- [ ] Approve canonical Ratatui/Crossterm dependency and lockfile resolution before renderer implementation.
