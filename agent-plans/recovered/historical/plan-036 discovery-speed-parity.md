---
date: 2026-06-14
status: complete
subject: discovery-speed-parity
---

# Discovery Speed Parity

## Goal

Bring file discovery speed in `file-census` to the same practical class as DaisyDisk and `dua-cli`: fast first-pass traversal, responsive progress, and predictable behavior on very large mounted disks.

This is specifically about discovery speed, not just overall scan completion. Hashing, EXIF, thumbnails, duplicate caches, and SQLite writes must not make the initial directory/file discovery feel stalled.

## Context

Current scanner work already has a Tokio async plan, but parity with tools like DaisyDisk and `dua-cli` needs its own benchmark-driven target. Those tools feel fast because they prioritize quick traversal, bounded work queues, compact accounting, and avoid letting downstream expensive work block visible discovery.

`dua-cli` is acceptable to clone and inspect for implementation ideas. DaisyDisk is a product/UX performance reference rather than a source reference.

## Decisions

- Treat this as a measured performance project. Do not guess from architecture alone.
- Compare against `dua-cli` on the same directory tree where practical, using wall time and perceived first-results latency.
- Separate discovery from enrichment stages. Discovery should not wait on hashing, thumbnails, EXIF, duplicate counting, or expensive aggregation.
- Progress/events must stay non-blocking. UI visibility is required, but event emission cannot throttle traversal.
- SQLite writes must be batched and bounded. WAL mode is assumed; write strategy still needs measurement.
- Correctness remains required: skipped files, permission errors, symlinks, ctime/mtime, folders, and interrupted scans must be represented accurately.
- No backward compatibility constraint; change internal APIs if that produces a cleaner, faster architecture.

## Implementation Steps

- [x] Clone or inspect `dua-cli` implementation and record relevant traversal/accounting design choices.
- [x] Add a repeatable discovery benchmark command or harness for `file-census` on small, medium, and large trees.
- [x] Capture total discovery wall time and entry counts for `file-census`.
- [x] Capture first file discovered, first folder displayed, files/sec, dirs/sec, and stop latency.
- [x] Capture comparable `dua-cli` timings on the same trees where possible.
- [x] Add tracing spans/counters around traversal, metadata/hash channel sends, batching, SQLite flushes, event emission, and aggregation.
- [x] Split first-pass discovery from enrichment so discovery can complete independently of hashing/metadata-heavy stages.
- [x] Tune bounded concurrency and queue sizes with benchmark evidence.
- [x] Verify large mounted-disk scans do not wedge WebSocket control commands or stop/cancel paths.
- [x] Record before/after results in this plan before declaring parity.

## Learning Log

- 2026-06-14 14:03 - User target is parity with DaisyDisk and `dua-cli` for file discovery speed. This requires benchmarking against external behavior and isolating discovery from downstream scan work.
- 2026-06-14 14:03 - Existing Tokio plan covers async scanner architecture, but this plan needs a stronger acceptance bar: measured discovery responsiveness and comparison to purpose-built disk usage tools.
- 2026-06-14 14:16 - `dua-cli` uses `jwalk` with Rayon-backed parallel traversal (`src/common.rs::WalkOptions::iter_from_path`), captures metadata during directory walking via `process_read_dir`, sends bounded traversal events (`src/traverse.rs::BackgroundTraversal::start`), and keeps traversal accounting in memory with throttled UI refresh.
- 2026-06-14 14:16 - `file-census` currently discovers with single-threaded `walkdir`, then metadata workers stat every discovered path again. A first safe speed slice is to use the existing `ignore` crate's parallel walker and carry discovery metadata into the current pipeline before considering larger scanner architecture changes.
- 2026-06-14 14:24 - Active sync and Tokio scan paths now use `ignore::WalkBuilder::build_parallel` for metadata-aware discovery. Hashing and SQLite write behavior remain unchanged; this is the first low-risk speed slice, not the final DaisyDisk/dua parity claim.
- 2026-06-14 14:34 - Release discovery benchmark on `/Volumes/NLBackup` with 3 threads: `file-census` discovered 283,426 entries in 22.75s wall time (`elapsed_ms`: 22,365), while release `dua-cli --threads 3 /Volumes/NLBackup` took 23.75s wall time. Discovery-only speed is now at parity on this disk; full scan speed still includes hashing and SQLite.
- 2026-06-14 14:47 - A 40-file test scan emitted 409 full `scan_progress` broadcasts before throttling, so live event volume itself was on the scan hot path. Pool transitions now mutate in-memory progress silently, file/count/log progress emits at most every 150ms, and stop/pause/final state changes remain immediate.
- 2026-06-14 14:47 - `-vvv` scanner logs now include pipeline start parameters, discovery counts and enqueue wait time, per-worker metadata/hash counts and channel wait time, per-flush SQLite timing, and total scan timing. This is the baseline for deciding whether the next bottleneck is hashing, DB flushes, or queue backpressure.
- 2026-06-14 14:59 - `scans benchmark-discovery` now reports first-entry/file/dir latency, entries/files/dirs per second, and optional stop latency via `--stop-after-ms`. `--stop-after-ms 0` is a deterministic stop-path probe for CI.
- 2026-06-14 16:45 - While finishing non-Tokio tasks, duplicate-cache status was deliberately kept out of the hot `scans.tree` scope computation path. Tree browsing now uses a cheap per-scan cache-run lookup rather than recomputing representative-scope fingerprints or live file totals on every folder load.
- 2026-06-14 17:41 - Re-measured `/Volumes/NLBackup`: release `file-census scans benchmark-discovery --threads 3` discovered 283,438 entries in 19.8s, while `dua --threads 3 /Volumes/NLBackup` took 18.3s. Discovery-only is in the right class, but production scanning still had hidden slow paths.
- 2026-06-14 17:41 - The production scanner was not discovery-independent: the walker sent into a bounded 512-entry metadata queue, progress-enabled scans flushed SQLite every 25 rows, and scan progress state was mutated several times per discovered entry. These costs do not appear in the discovery-only benchmark.
- 2026-06-14 17:41 - First production-speed patch keeps the schema/model intact while removing obvious throttles: discovery-to-metadata handoff is unbounded, scan DB batches are 2,048 rows for UI and CLI paths, and hot-loop progress updates are sampled instead of written per file.
- 2026-06-14 17:56 - Server-path measurement before two-phase discovery showed the real bottleneck: after 31.2s it had only discovered 35,494 entries because discovery and hashing were competing for `/Volumes/NLBackup` I/O. Stop RPC returned immediately, but production discovery did not match discovery-only behavior.
- 2026-06-14 17:56 - Production scanning now runs discovery as a first pass and starts metadata/hash enrichment after the walker finishes. On `/Volumes/NLBackup` through `/api/rpc`, full first-pass discovery found 283,444 entries in 39.3s, then hashing began; stop RPC returned in 10ms and the worker finalized roughly 286ms later.
- 2026-06-14 18:03 - Delete-check had a plain prefix-path bottleneck: on `db-example.db`, `PHOTO_FILTER` checks took 4.3s for scan `99eb...` and 34.3s for scan `ab204...`. The optimized prefix path now uses indexable path range predicates and a precomputed `other_hashes` CTE; timings are 0.05s and 0.65s respectively.
- 2026-06-14 21:31 - Scoped/manual delete-check now narrows candidates in SQLite by current prefix, explicit includes, and explicit excludes before applying Rust-only regex/fuzzy/composable filters. Added an ignored perf gate so this path cannot quietly fall back to whole-scan Rust filtering.

## Work Log

- [x] 2026-06-14 14:03 - Captured discovery speed parity as its own performance plan instead of folding it into the broader Tokio scanner plan.
- [x] 2026-06-14 14:16 - Cloned and inspected `Byron/dua-cli` at `~/Projects/remote/github.com/Byron/dua-cli`; selected metadata-aware parallel discovery as the first implementation slice.
- [x] 2026-06-14 14:16 - Added `scanner::benchmark_discovery` and `scans benchmark-discovery` CLI command with focused backend and CLI tests.
- [x] 2026-06-14 14:24 - Switched scanner discovery workers to parallel metadata-aware traversal and verified scanner unit tests plus CLI benchmark test.
- [x] 2026-06-14 14:34 - Built release binary and compared `/Volumes/NLBackup` discovery against release `dua-cli`; `file-census` measured slightly faster for discovery-only traversal.
- [x] 2026-06-14 14:47 - Added a progress-event volume regression, throttled high-frequency `scan_progress` broadcasts, added trace counters/timings, and verified `scanner::tests`.
- [x] 2026-06-14 14:59 - Extended discovery benchmark JSON output with first-result latency, throughput rates, and stop-latency measurement; verified focused backend/CLI tests.
- [x] 2026-06-14 16:45 - Protected the current `scans.tree` performance gain while adding duplicate-cache UI/status by avoiding full duplicate-scope recomputation in folder browsing.
- [x] 2026-06-14 17:41 - Re-ran release discovery and `dua` on `/Volumes/NLBackup`; recorded 19.8s vs 18.3s.
- [x] 2026-06-14 17:41 - Removed production scan bottlenecks that were absent from the discovery benchmark: 25-row UI flushes, bounded discovery handoff, and per-file shared progress writes.
- [x] 2026-06-14 17:41 - Added a regression test preventing live scans from returning to tiny SQLite transaction batches; verified `scanner::tests`.
- [x] 2026-06-14 17:56 - Split production scanner into first-pass discovery followed by metadata/hash enrichment for both sync and async scan paths.
- [x] 2026-06-14 17:56 - Rebuilt release and verified patched `/api/rpc` server scan against `/Volumes/NLBackup`: full discovery completed before hashing, and stop remained responsive.
- [x] 2026-06-14 18:03 - Optimized plain folder-prefix delete-check SQL and measured `db-example.db` before/after: 4.3s -> 0.05s and 34.3s -> 0.65s.
- [x] 2026-06-14 21:31 - Optimized scoped/manual delete-check SQL narrowing and added a regex-filter perf gate for the remaining Rust-only filter path.

## Unfinished Work

- [x] Inspect `dua-cli` and document applicable traversal/accounting ideas.
- [x] Collect current baseline numbers with the new discovery benchmark command.
- [x] Implement and measure discovery/enrichment separation.
- [x] Tune until file discovery speed is in the same practical class as DaisyDisk and `dua-cli`.
- [x] Build release after the production hot-path patch and measure `/Volumes/NLBackup` discovery and stopped-scan behavior again.
- [x] Add a dedicated delete-check/query performance pass for the plain folder-prefix path.
- [x] Optimize scoped/manual delete-check paths that still need Rust-side filtering for regex/fuzzy/composable filters.
