---
date: 2026-07-14
status: in-progress
subject: scanner-cli-operations
---

# Goal

Rebuild two terminal workflows on top of the same real scan lifecycle: a compatible scan bootstrap shorthand and an opt-in Ratatui progress renderer.

# Context

The deleted implementation had an explicit terminal product direction. The shorthand must accept a database location, source path, and volume slug; create only missing compatible location/scan records; generate deterministic date-based IDs; and preserve legacy commands. The TUI must show authoritative pool/queue progress plus bounded active work ordered by elapsed duration, with no fabricated queued-path history or RAM-heavy unbounded queue snapshot.

# Product Integration

- Keep existing CLI forms valid while adding a two-positional `scan <source-path> <volume-slug>` bootstrap form.
- Use the same persisted location/scan lifecycle as browser-server/Tauri; no terminal-only records or control plane.
- Keep TUI rendering opt-in, noninteractive/plain output intact, JSON clean, and terminal cleanup RAII-safe.

# Decisions

- Canonicalize the source directory before mutation; reject blank slug or mismatched existing location root without mutation.
- Generate UTC `YYYYMMDDTHHMMSSZ--<slug>` scan IDs with a deterministic collision suffix.
- Define TUI “pending” as in-flight worker work. Add bounded active-operation metadata at worker start/finish; do not retain every unstarted path in memory.

# Implementation Steps

1. [ ] Implement and test atomic CLI bootstrap location/scan resolution with injectable UTC clock/collision behavior.
2. [ ] Implement the compatible top-level CLI grammar, docs, plain/JSON behavior, and disposable integration matrix.
3. [ ] Add bounded per-worker active-operation telemetry to the scan progress model.
4. [ ] Implement Ratatui/Crossterm rendering, fallback, terminal restoration, and focused renderer tests.
5. [ ] Prove the terminal workflow against real disposable scans, resizing/quit, non-TTY fallback, and unchanged scan controls.

# Learning Log

- The original source audit established that aggregate pool counts exist but queued paths have no truthful timestamps. The terminal UI must not invent that data.
- The promoted `src/backend/src/cli.rs` is a 1,778-line pre-conflict forensic prefix, not a valid canonical source: direct untruncated pre-deletion tail reads prove a 1,812-line file and disagree with the promoted file across checked overlap ranges. Do not append the 34 missing lines or merge them by hand.
- Existing `ScanCliProgressPrinter`, `ScanCliPool`, and `scan_cli_elapsed` are directly evidenced in historical source. No successful pre-deletion implementation patch for the requested simplified scan grammar, Ratatui dependency, renderer, or terminal acceptance result was recovered; all five implementation steps remain new work after source closure.

# Work Log

- [x] 2026-07-14 22:45 - Recreated the CLI/TUI plan from durable requirements after the prior implementation was deleted.
- [x] 2026-07-15 00:47 - Audited direct pre-deletion CLI reads and preserved the source-recovery boundary: the latest 1,812-line tail cannot be safely merged into the 1,778-line recovered prefix, and the requested CLI/TUI work has no recovered implementation evidence.

# Unfinished Work

- [ ] Complete all implementation and acceptance steps.
