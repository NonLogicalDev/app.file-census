---
date: 2026-07-14
status: in-progress
subject: shadcn-dark-ui-redesign
---

# Goal

Rebuild file-census as the approved compact, shadcn-inspired dark operational application while preserving real state, transport, backend behavior, and workflows. The original checkout was deleted; first recover every source artifact that can be deterministically reconstructed from its surviving session logs, then rebuild anything the evidence cannot restore.

# Context

The original branch, prototype source, production source, plans, and reference assets were removed during disk cleanup. Surviving Codex session logs contain structured `patch_apply_end` records, including complete historical file-add payloads and contextual update diffs. Recovery must use only exact, chronologically validated replay; no fuzzy patching or copied-context duplicates. The durable requirements retained from the product history are: main-top-bar Cmd-K; collapsible sidebar; one location per scan; directory-only folder/tree navigation; files only in the main workspace; non-destructive persisted per-scan excludes; dense dark shell; real Locations, Files/File tree, Duplicates, Tasks, Search, and Options workflows.

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

1. [x] Recreate requirements, task queue, reference-asset recovery gate, project toolchain, and a clean checkpoint.
2. [ ] Produce a source-recovery manifest, deterministically replay only validated historical changes into a temporary tree, and promote only verified source into this checkout.
3. [ ] Build the SQLite domain and JSON-RPC/browser-server foundation for locations, scans, files, and live progress.
4. [ ] Build the shared dark shell, persisted collapsible sidebar, routing, and main-top-bar Cmd-K.
5. [ ] Build the scan workspace with directory-only tree/folder navigation, main files/File tree modes, inspector, safe actions, and non-destructive exclusions.
6. [ ] Build Duplicates, Tasks, Search, Options, and cross-route accessibility/destructive-flow safety.
7. [ ] Run the complete validation/browser/native/design-QA matrix after reference recovery; resolve all P0/P1/P2 findings and obtain explicit approval.

# Learning Log

- Disk cleanup deleted the old checkout and its Git database. A new repository was initialized at the original path; source and verification must be rebuilt from requirements.
- Keep tool output and artifact growth bounded. No session/build/cache cleanup is allowed without explicit user direction.
- Historical `patch_apply_end` events preserve full `Add File` content and contextual `Update File` diffs. The recovery cutoff is immediately before the deletion report at `2026-07-15T05:35:46Z`; any event after it is recovery work, not original-source evidence.
- The same historical patch call is copied into many nested session logs. Deduplicate by preserved `call_id`, keep the earliest pre-cutoff occurrence, and abort a replay on its first context conflict rather than fuzzy-applying it.

# Work Log

- [x] 2026-07-14 22:45 - Initialized a new `redesign/shadcn-dark-shell` repository after confirming no checkout or recoverable Git object database remained.
- [x] 2026-07-14 22:45 - Recreated the durable goal, plan, agent instructions, and coordinator-owned workqueue with all implementation/acceptance claims reset.
- [x] 2026-07-14 22:55 - Confirmed that the surviving session logs contain structured, byte-complete historical additions and contextual patches; started a bounded deterministic recovery pass before implementing replacements.

# Unfinished Work

- [ ] Recover the deleted visual reference/prototype evidence from the user.
- [ ] Complete and validate the source-recovery manifest and temporary replay before copying any recovered source into the checkout.
- [ ] Complete every implementation and verification step above.
