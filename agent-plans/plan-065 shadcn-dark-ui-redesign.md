---
date: 2026-07-14
status: in-progress
subject: shadcn-dark-ui-redesign
---

# Goal

Rebuild file-census as the approved compact, shadcn-inspired dark operational application while preserving real state, transport, backend behavior, and workflows. The original checkout was deleted; first recover every source artifact that can be deterministically reconstructed from its surviving session logs, then rebuild anything the evidence cannot restore.

# Context

The original branch, prototype source, production source, plans, and reference assets were removed during disk cleanup. Surviving Codex session logs contain direct historical tool-call inputs, including complete file-add payloads and contextual update diffs. Recovery must use only exact, chronologically validated replay; `patch_apply_end` messages are excluded because nested logs can copy them as conversation context. The durable requirements retained from the product history are: main-top-bar Cmd-K; collapsible sidebar; one location per scan; directory-only folder/tree navigation; files only in the main workspace; non-destructive persisted per-scan excludes; dense dark shell; real Locations, Files/File tree, Duplicates, Tasks, Search, and Options workflows.

The original visual reference image and prototype commit are missing. Build real reusable production components now, but do not claim visual match or final acceptance until the user re-supplies the reference and current screenshots are compared directly.

# Product Integration

- Existing product model to rebuild: a Rust/SQLite core with browser-server and native/Tauri transports, and a JavaScript production UI using shared shell/workspace primitives.
- Intended model: a single dark application frame, global sidebar navigation, scan-relative file workspace, dense table/inspector composition, and one real command palette.
- What must not return: duplicate location/scan selectors, files in side folder views, legacy cards/toolbars, mock production data, separate router/action paths for Cmd-K, or destructive exclusion semantics.

# Decisions

- Start with a small, testable core and migrate one real workflow at a time; no static visual-only rebuild.
- Keep route, RPC, and UI contracts explicit so browser-server and Tauri can share behavior.
- Treat visibility/excludes as a backend predicate used by every scan-scoped result and action.
- Keep every historic claim unchecked until reimplemented and verified from this new checkout.

# Implementation Steps

1. [x] Recreate requirements, task queue, reference-asset recovery gate, and a clean recovery checkpoint.
2. [x] Produce a direct-event source-recovery manifest with a fixed pre-deletion cutoff and duplicate-safe ordering.
3. [x] Extract the latest verified whole-file snapshot per path into a reproducible temporary source tree, without claiming it is a coherent final build.
4. [ ] Recover the final workspace backbone and frontend boot closure as strict composite temporary trees using verified source snapshots as file-local horizons; promote only validated, coherent source into this checkout.
5. [ ] Build the SQLite domain and JSON-RPC/browser-server foundation for locations, scans, files, and live progress.
6. [ ] Build the shared dark shell, persisted collapsible sidebar, routing, and main-top-bar Cmd-K.
7. [ ] Build the scan workspace with directory-only tree/folder navigation, main files/File tree modes, inspector, safe actions, and non-destructive exclusions.
8. [ ] Build Duplicates, Tasks, Search, Options, and cross-route accessibility/destructive-flow safety.
9. [ ] Run the complete validation/browser/native/design-QA matrix after reference recovery; resolve all P0/P1/P2 findings and obtain explicit approval.

# Learning Log

- Disk cleanup deleted the old checkout and its Git database. A new repository was initialized at the original path; source and verification must be rebuilt from requirements.
- Keep tool output and artifact growth bounded. No session/build/cache cleanup is allowed without explicit user direction.
- Historical `patch_apply_end` events preserve full `Add File` content and contextual `Update File` diffs. The recovery cutoff is immediately before the deletion report at `2026-07-15T05:35:46Z`; any event after it is recovery work, not original-source evidence.
- The same historical patch call is copied into many nested session logs. Deduplicate by preserved `call_id`, keep the earliest pre-cutoff occurrence, and abort a replay on its first context conflict rather than fuzzy-applying it.
- The direct-event manifest contains 2,552 original calls, 3,273 source changes, and 262 unique paths. The first full-tree strict replay stopped at a historically recorded `rustfmt` boundary, so the recovery path is verified file snapshots plus only later exact patches, never inferred reformatting.
- `src/web.rs` has a complete verified historical snapshot at `2026-05-30T03:30:47Z` (213 output lines from a `sed -n '1,280p'` request). It can supersede formatter-affected patches before that time for this path only.
- A direct snapshot-index pass found 109 complete pre-deletion file-read events across 106 paths. The recovery tool validates direct call ID, logged command, source-log basename and line, output line count, and SHA-256 before reproducing the newest snapshot per path. It now generates a 106-file, 740 KB exact-source tree with no conflicts.
- The source-only mode and horizon mode are separate: source-only preserves the newest proven version of each allowlisted file; horizon mode applies only later exact patches and stops on the first conflict. Neither mode writes the active checkout.
- The 106-file tree is not ready to promote: it mixes POC-era root Rust with later workspace sources, has no full `ui/src/App.jsx` snapshot, and lacks final workspace modules/configuration such as backend `db`/`scanner`/`web`, native manifest/Tauri config, and HTML entries. The next recovery action is a final-architecture closure, not a bulk copy.

# Work Log

- [x] 2026-07-14 22:45 - Initialized a new `redesign/shadcn-dark-shell` repository after confirming no checkout or recoverable Git object database remained.
- [x] 2026-07-14 22:45 - Recreated the durable goal, plan, agent instructions, and coordinator-owned workqueue with all implementation/acceptance claims reset.
- [x] 2026-07-14 22:55 - Confirmed that the surviving session logs contain structured, byte-complete historical additions and contextual patches; started a bounded deterministic recovery pass before implementing replacements.
- [x] 2026-07-14 23:25 - Checkpointed the recovery ledger and strict-replay tool as `ee7a7c0` after staged whitespace validation.
- [x] 2026-07-14 23:27 - Replayed the direct-event manifest read-only: 2,552 calls across 262 paths; isolated the first strict conflict to a source-formatting transition and verified a complete post-format `src/web.rs` snapshot.
- [x] 2026-07-14 23:40 - Added provenance checks for direct command reads and generated a 25-file exact-source snapshot tree (244 KB) from the newest verified file versions; JSON/package parsing and recovery-report checks passed.
- [x] 2026-07-14 23:51 - Added the 109-entry provenance index and validated a complete 106-path, 740 KB source-only recovery tree with direct call/source-line/output-hash checks and no replay conflict.
- [x] 2026-07-14 23:51 - Audited the recovered tree for timestamp and import/workspace coherence; retained it as evidence only because final backend/native and frontend boot closures are still incomplete.

# Unfinished Work

- [ ] Recover the deleted visual reference/prototype evidence from the user.
- [ ] Use the verified snapshot index to recover the final workspace backbone and frontend boot closure with strict later-patch replay before copying any recovered source into the checkout.
- [ ] Complete every implementation and verification step above.
