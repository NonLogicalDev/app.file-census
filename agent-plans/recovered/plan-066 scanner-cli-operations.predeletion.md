---
date: 2026-07-14
status: in-progress
subject: scanner-cli-operations
---

# Goal

Make scanner operation practical from the terminal without weakening the existing location, scan, database, or progress contracts. Add a concise CLI scan entry point that can bootstrap missing location/scan records from database location, filesystem path, and volume slug; add an opt-in Ratatui scanner-progress view with truthful queue progress and pending operations ordered by duration.

# Context

The current production redesign remains the release-critical UI work in `plan-065`, but the requested scanner workflows are a distinct CLI/terminal product scope. The durable queue owns this work as `cli-scan-bootstrap-*` and `scanner-progress-tui-*`. The same scan data must remain authoritative across CLI, browser-server, and Tauri surfaces. A disk-capacity gate currently prevents fresh linked binaries, so source-contract work may proceed, but no implementation is accepted without current CLI and terminal evidence.

# Product Integration

- Existing model: locations and scans are explicit persisted records; scanning has real queue/pool telemetry and CLI output.
- Intent: lower the friction of starting a scan and make long-running terminal scans legible without giving a second, divergent control plane.
- Integrated model: keep the established CLI commands compatible; add one clear shorthand that resolves/creates only missing records and runs the same scan lifecycle. The Ratatui view is an opt-in renderer over the same authoritative progress snapshot/events, with non-TTY/plain output preserved.
- Architecture impact: date-derived scan identity, collision policy, and terminal refresh lifecycle must be deterministic and testable. The terminal UI must not bypass cancellation, pause, worker controls, or persisted scan truth.

# Decisions

- The shorthand accepts exactly a database location, source path, and volume slug; it must auto-create only missing location/scan records and never silently repoint an existing location.
- The generated scan ID is derived from the scan start time in one documented, injectable format; collisions must resolve deterministically rather than overwrite records.
- The Ratatui surface is opt-in and must degrade to existing plain CLI progress for non-TTY/redirected output.
- Queue/pool progress, current operation, and pending work are rendered from authoritative scan telemetry. Pending operations sort longest-running first with stable ties; unknown timestamps remain visibly unknown rather than fabricated.
- The redesign acceptance gate remains honest: these new tasks are separate operational work, but their implementation and validation appear in `GOALS.md` and must not be silently omitted from the durable completion record.

# Implementation Steps

1. [ ] Characterize current CLI scan/location creation, identifiers, progress snapshots, and terminal behavior; record the compatible shorthand grammar and error/collision contract.
2. [ ] Implement and test the bootstrap shorthand using the existing location/scan lifecycle and an injectable clock/date boundary.
3. [ ] Design the Ratatui state projection, refresh/event loop, non-TTY fallback, resize/quit behavior, and duration ordering against real telemetry.
4. [ ] Implement the opt-in terminal renderer and focused unit/integration coverage without changing browser/Tauri transport ownership.
5. [ ] Run current binary, CLI, pseudo-terminal, browser/Tauri regression, performance, and accessibility evidence after the disk-capacity gate is resolved.
6. [ ] Reconcile the queue, this plan, `GOALS.md`, and the redesign acceptance gate before checkpointing a stable milestone.

# Learning Log

- The managed filesystem is at capacity: about 115 MiB free causes Vite temporary-config creation and Rust linker output to fail with `ENOSPC`. Offline Nix tooling itself is available under the approved escalated daemon; no cleanup is authorized yet.
- Progress UI must not invent task history or durations. Reuse real scan-pool/queue telemetry and preserve the existing noninteractive CLI behavior.

# Work Log

- [x] 2026-07-14 22:23 - Created this plan and initialized the bounded CLI-bootstrap and Ratatui workqueue graph from the user's requested terminal workflows.
- [ ] 2026-07-14 22:23 - Characterize the existing CLI grammar, scan identity contract, and live progress sources before implementation.

# Unfinished Work

- [ ] Complete `cli-scan-bootstrap-contract`, `cli-scan-bootstrap-implementation`, and `cli-scan-bootstrap-acceptance`.
- [ ] Complete `scanner-progress-tui-contract`, `scanner-progress-tui-implementation`, and `scanner-progress-tui-acceptance`.
- [ ] Obtain narrowly scoped approval for stale build-artifact cleanup before any linked-binary, embedded-build, or terminal acceptance claim.
