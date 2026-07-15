---
date: 2026-06-14
status: complete
subject: file-extra-info-scan
---

# File Extra Info Scan

## Goal

Add a dedicated File Extra Info Scan pass, with EXIF extraction as the first processor.

The pass should enrich already discovered files without slowing down discovery, metadata collection, hashing, duplicate cache building, tree browsing, delete checks, or scan controls.

## Context

We already have on-demand file details and EXIF-facing UI concepts, but EXIF should become a durable background processing pass rather than an incidental modal operation.

The current architecture direction is performance-first:

- Discovery must stay extremely fast and should only establish the file set.
- Metadata and hashing are separate worker pools.
- Heavy or optional enrichment should run as separate cancellable tasks.
- Live updates and task controls must flow through the existing JSON-RPC/WebSocket task model.
- UI should remain true to persisted data, not optimistic local guesses.

EXIF is the first extra metadata type, but the pass should be structured so later processors can be added without rewriting the task orchestration.

## Decisions

- Model this as `File Extra Info Scan`, not as part of base scan discovery.
- Start with an `exif` processor, but create the processor boundary now.
- Store extraction status, errors, and unsupported-file markers so common unsupported files are not retried endlessly.
- Treat EXIF as content-associated metadata when possible, keyed by content identity such as hash plus size, while retaining the source file occurrence used for extraction.
- Run the pass over explicit scopes: scan, folder path, selected files/folders, and eventually active filters.
- Make the task visible in Tasks, cancellable/stoppable, and observable through progress events.
- Batch DB writes and keep read-only tree/search/delete-check methods unblocked.
- Do not require backwards compatibility for intermediate schemas or RPC payloads.

## Implementation Steps

- [x] Add schema for extra info runs, per-file extraction status, and EXIF payload storage.
- [x] Add an `ExtraInfoProcessor` abstraction with `exif` as the first implementation.
- [x] Add a background task runner for File Extra Info Scan.
- [x] Add bounded concurrency for File Extra Info Scan work.
- [x] Emit task lifecycle/progress events over JSON-RPC/WebSocket.
- [x] Add CLI entrypoints for running EXIF enrichment by scan and optional path scope.
- [x] Add UI actions for scanning extra info from file/folder/scan contexts.
- [x] Update file details modal to read persisted EXIF first and clearly show missing, unsupported, unavailable, and error states.
- [x] Add tests for schema migration, unsupported file skips, extraction persistence, task cancellation, and UI data usage.
- [x] Add performance guardrails so EXIF extraction cannot block discovery, hash workers, delete, stop, or tree reads.

## Learning Log

- 2026-06-14 20:47: EXIF belongs in a separate enrichment pass because the base scan path is already being optimized around fast discovery and non-blocking controls.
- 2026-06-15 04:47 - Persisted EXIF is keyed by `(blake3, size)` so a successful extraction from any available occurrence can serve file details for the same content elsewhere.
- 2026-06-15 04:47 - Unsupported, unavailable, empty, and error statuses need to be terminal persisted markers so high-cardinality unsupported content does not get retried forever.
- 2026-06-15 04:47 - The current runner is a synchronous RPC/CLI implementation with start/finish events. The plan is not complete until this is converted into a non-blocking, cancellable background task with progress events.
- 2026-06-15 05:27 - File Extra Info Scan now has a separate in-memory task store and explicit `file_extra_info.stop` JSON-RPC path. Cancellation is cooperative between file candidates; this avoids relying on generic RPC cancellation for long-running background work.
- 2026-06-15 05:27 - Web and native app paths now return a running task immediately for `file_extra_info.scan` and continue EXIF enrichment in a background blocking task, keeping the request/response lane unblocked.
- 2026-06-15 05:27 - Progress is intentionally summarized as task counters instead of current-path streaming, matching the broader UX decision that tiny task cards should show done/queued/active style counters rather than long volatile paths.
- 2026-06-15 05:31 - EXIF extraction now runs through a bounded worker pool for filesystem/EXIF reads while SQLite persistence and progress emission remain serialized on the coordinator thread. This keeps IO parallel without creating multiple SQLite writers.
- 2026-06-15 05:36 - Guardrails now cover cooperative stop between queued EXIF candidates and an ignored perf gate that runs concurrent EXIF enrichment while scan tree and delete-check reads execute under a budget.

## Work Log

- [x] 2026-06-14 20:47 - Created the File Extra Info Scan task plan with EXIF as the first processor.
- [x] 2026-06-15 04:47 - Added `file_exif` and `file_extra_info_runs` schema, EXIF candidate selection, and persisted EXIF storage APIs.
- [x] 2026-06-15 04:47 - Added the `ExtraInfoProcessor` boundary, EXIF processor, and scoped EXIF enrichment runner.
- [x] 2026-06-15 04:47 - Added `file-extra-info exif` CLI entrypoint and `file_extra_info.scan` RPC in both web and native app paths.
- [x] 2026-06-15 04:47 - Updated file details to prefer persisted EXIF before falling back to on-demand extraction.
- [x] 2026-06-15 04:47 - Added File Explorer and FileGrid actions for scanning EXIF, event formatting, and a component preview check for the row action menu.
- [x] 2026-06-15 04:47 - Verified focused UI tests, full UI tests, backend package tests, production UI build, and in-app browser component preview.
- [x] 2026-06-15 05:27 - Added non-blocking File Extra Info task startup, task-id based stop control, progress/stop events, and Tasks UI stop affordance.
- [x] 2026-06-15 05:27 - Verified full UI tests, full backend package tests, production UI build, and in-app browser preview for the cancellable EXIF task card.
- [x] 2026-06-15 05:31 - Added bounded parallel EXIF extraction, queued/active task counters, stopped lifecycle events, and unit coverage for worker bounds.
- [x] 2026-06-15 05:31 - Verified focused media tests, full backend package tests, full UI tests, production UI build, and in-app browser preview for task counters.
- [x] 2026-06-15 05:36 - Added cooperative-stop worker-pool coverage and ignored `perf_gate_file_extra_info_does_not_block_tree_or_delete_check_reads`.
- [x] 2026-06-15 05:36 - Verified focused media tests, full backend package tests, and the specific ignored EXIF non-wedge perf gate.

## Unfinished Work

- [x] Convert the synchronous EXIF RPC path into a non-blocking background task runner.
- [x] Add cooperative stop/cancel controls for File Extra Info Scan tasks and expose them in Tasks.
- [x] Emit non-blocking progress events with processed/considered counters.
- [x] Add bounded worker-pool concurrency and queue/done/active counters for large EXIF batches.
- [x] Add stronger non-wedge performance tests proving EXIF work does not block scan controls, deletes, tree reads, or WebSocket handling under larger workloads.
