# Agent-Plans Index

A catalog of every plan in this repo, summarized, with the most consequential highlighted.

- **Active plans** live at `agent-plans/*.md` (currently plan-061, plan-065, plan-066).
- **Historical plans** (41 files) live at `agent-plans/recovered/historical/` — exact, success-gated reconstructions from Codex session logs, byte-verified against `historical/ARCHIVE_MANIFEST.json`. They are product history, **not** authoritative over the active recovery plan, and old "done"/verification claims are not assumed to hold in the current checkout.
- **Predeletion snapshots** live at `agent-plans/recovered/*.predeletion.md`.
- `workqueue.yaml` is the live rebuild/acceptance ledger.

**Consequence legend:** ⭐ FOUNDATIONAL (architecture/pattern everything builds on) · ● HIGH (major, still load-bearing) · ◐ MEDIUM (meaningful but localized) · ○ LOW (small polish / superseded).

> **Version note:** plan-061 active == historical (identical). plan-065 historical == predeletion (the 2026-07-11 *forward* production-integration contract); the **active** plan-065 is a *separate* 2026-07-14 **disaster-recovery** plan. plan-066 historical == predeletion (53-line stub); the **active** plan-066 is a newer, detailed version.

---

## ⭐ Most consequential (read these first)

| Plan | Why it matters |
|---|---|
| **plan-065 shadcn-dark-ui-redesign** (active, recovery) | Current source-of-truth governing doc: rebuild after the 2026-07-15 disk-cleanup deletion via deterministic replay of exact Codex-log snapshots. Documents the UI recovery-horizon gap (promoted UI is pre-redesign June source; July redesign edits survive only as excluded diff events). |
| **plan-061 product-coherence** (active) | Defines the shared **File Results Workspace** model (query/scope/mode/path/table-tree/columns/selection/actions/details) that the entire dark redesign is built on. |
| **plan-037 → plan-038 architecture-decisions / p0-implementation** | The canonical `docs/architecture-decisions.md` and its P0 implementation: deletable active-looking rows, durable scan-control persistence, 30s SQLite busy wait, and the **perf-gate** safety net (`tests/perf_gates.rs`). |
| **plan-036 discovery-speed-parity** | Two-stage scanner architecture (full discovery → metadata/hash enrichment), parallel `ignore::WalkBuilder`, 2,048-row batches, ≤150ms progress sampling. Benchmark discipline (dua-cli parity). |
| **plan-032 websocket-stop-wedge** | Multiplexed WebSocket (independent reader/writer/event tasks), per-RPC concurrency + `rpc.cancel`, folder-paged `scans.tree` with depth — **and removed the duplicate-count CTE from the tree hot path** (root browse → ~0.08s). See perf note below. |
| **plan-006 → plan-019 styling-framework / tailwind-full-migration** | Established the Tailwind-3 + local-primitives styling stack and per-module class helpers used by all UI. |
| **plan-001 / plan-003 codex-layout / sidebar-scan-tree** | The sidebar/top-bar app-shell and the location-vs-scan two-level route model that navigation everywhere assumes. |
| **plan-004 tanstack-browser-components** | TanStack Table as the file-browser infra (replaced AG Grid). |
| **plan-021 notion-style-search-filters** | Canonical filter AST (`{term, operator, expression}`) + shared `SearchFilterControls` spanning backend/CLI/URL/UI. |
| **plan-031 chunked-progress-events** | Two-lane event architecture + the rule "persistence must never block the scan hot path." |

> ⚠️ **Live perf finding (browsing lag):** the recovered `scan_tree` / `scan_tree_source_rows` **reintroduced** the duplicate-count subqueries that plan-032 removed — two correlated per-row aggregates over `files`. On a copy of the prod DB, root browse of the biggest scan (26,676 files) measured **0.49s wall / 0.33s CPU**, vs **0.155s / 0.014s CPU** with them removed. The precomputed per-scan-per-dir replacement (`duplicate_cache_path_counts`) exists but is **write-only** — nothing reads it. Fix = drop the inline subqueries (render counters unknown while missing) and read the cache when a `duplicate_cache_runs` row is `ready`.

---

## App shell, navigation & layout

| Plan | Tag | Summary |
|---|---|---|
| plan-001 codex-layout | ⭐ | Codex-like app shell: persistent left sidebar owns nav (Locations/Duplicates/Search), `Shell.jsx` owns navigation, dense center file area; fixed a `FileGrid.jsx` React crash. |
| plan-003 sidebar-scan-tree | ⭐ | Locations as collapsible parents with scans as children; first-class `/locations/:slug` overview route distinct from `/scans/:scanId`. |
| plan-005 page-action-menu | ● | Moved page actions into a compact `details`-based top-bar menu (`Shell.jsx`); Refresh stays global. Later refined by plan-013. |
| plan-013 prominent-scan-now | ◐ | Pulled "Scan now" back out as a primary CTA in `LocationOverview` (vs buried in the menu). |
| plan-024 dashboard-shell-cleanup | ◐ | New top-level Dashboard route for DB metrics + live strip; page bodies cleaned; live status → sidebar footer. |
| plan-025 progress-activity-breadcrumb-polish | ○ | Sidebar Activity → first-class Tasks page; breadcrumb pills; stable selection-summary row. |

## Styling system

| Plan | Tag | Summary |
|---|---|---|
| plan-002 icon-system | ● | Shared `lucide-react` `Icon.jsx` wrapper replacing text-glyph placeholders. |
| plan-006 styling-framework | ⭐ | Migrated off bespoke CSS to Tailwind 3 + local primitives (`ui/components/ui/`: Button, Menu, StatusPill, Toolbar…). |
| plan-011 tab-rail-style | ○ | Dark macOS-style tab rail (CSS only) — immediately reversed by plan-012. |
| plan-012 integrated-tabs | ◐ | Final integrated segmented tab appearance/placement blended with app tokens. |
| plan-019 tailwind-full-migration | ⭐ | Full restyle in verified batches into helper modules (`shellClasses`, `explorerClasses`, `fileGridClasses`…); Button-variant color semantics. |

## File browser & table

| Plan | Tag | Summary |
|---|---|---|
| plan-004 tanstack-browser-components | ⭐ | Replaced AG Grid with `@tanstack/react-table`; preserved sorting/visibility/selection/delete-check modes. |
| plan-007 table-polish | ● | Finder-style compact table: header-drag sizing, multi-select, icon-only row-action menu; Delete Check as a routed subtab; backend path-set Delete Check + single-file thumbnails. |

## Search, filters & delete-check

| Plan | Tag | Summary |
|---|---|---|
| plan-021 notion-style-search-filters | ⭐ | Canonical JSON filter AST + `files.search` (SQL pushdown + bounded Rust post-filter); shared `SearchFilterControls`, URL serialization, CLI `--filter-json`. |
| plan-026 filter-inline-creation | ○ | Add rule/group as editable placeholder rows at the insertion point. |
| plan-027 advanced-filters-collapsed | ○ | Progressive disclosure: full expression editor hidden by default; auto-expands when the route already has filters. |
| plan-030 delete-check-active-filter | ◐ | Delete Check honors the active filter; candidate set = (includes or all) − excludes ∩ query; persistent per-scan include/exclude sets. |
| plan-034 explicit-filter-search-tree | ◐ | Draft-vs-committed filter state (commit on Enter/button); backend keeps dirs visible when descendants match; Search Flat/Tree tabs on shared FileGrid. |
| plan-035 high-cardinality-file-occurrences | ◐ | Bounded occurrence paging (`file_occurrences_page`); `files.details` returns total + 100-row first page (e.g. 24,363 AppleDouble occurrences). |

## Scanner architecture & performance

| Plan | Tag | Summary |
|---|---|---|
| plan-015 scan-pause-repair | ● | Per-scan control objects (stop/pause/resume/wake); non-destructive Repair via `prepare_repair_scan`; `scans.pause/resume/repair` RPCs. |
| plan-017 progress-bar-stability | ◐ | Fixed pool-percent denominators and long-path layout jitter; relabeled pool counters as work "items." |
| plan-028 abrupt-exit-scan-recovery | ● | Startup reconciliation (`recover_interrupted_scans`) marks orphaned active rows `interrupted`; emits `scan_recovery_completed`. |
| plan-036 discovery-speed-parity | ⭐ | Two-stage discovery/enrichment scanner; parallel walk; 2,048-row batches; `benchmark-discovery` harness; delete-check SQL 4.3s→0.05s. |
| plan-037 architecture-decisions | ⭐ | Canonical `docs/architecture-decisions.md` — facts vs recommendations; perf as first-class architecture. |
| plan-038 p0-architecture-implementation | ⭐ | Deletable active-looking rows; durable control persistence; 30s busy wait; perf gates (`just perf-gates`, `bench-discovery`). |
| plan-041 hash-queue-backpressure | ◐ | Unbounded hash queue (matched to worker model); Done/Queued/Active counters; route-addressable Vite component preview harness. |
| plan-062 schema-migration-order | ● | `migrate` order: tables → column migrations/backfills → indexes last (fixed `no such column: file_kind` startup panic); `unknown` LocationType. |
| plan-064 light-hash-scan-policy | ● | `blake3_light` sampled fingerprint + Full/Light scan policy; strict safety boundary (exact hash for dup/delete-check; light = `likely_safe`); CAS metadata store. |

## Events & live-update transport

| Plan | Tag | Summary |
|---|---|---|
| plan-014 tauri-live-updates | ● | Cross-process `app_events` journal + native polling task (each Tauri process has its own `AppCore`/EventHub). |
| plan-016 tauri-runtime-detection | ◐ | Treat `tauri:` protocol as native; grant event permissions in `capabilities/default.json` (fixed "reconnecting" loop). |
| plan-031 chunked-progress-events | ● | Two event lanes: high-freq in-process transport + throttled persisted `scan_progress_snapshot`; recorder off the hot path. |
| plan-032 websocket-stop-wedge | ⭐ | Multiplexed WebSocket, per-RPC tasks, `rpc.cancel` + native cancellation, folder-paged `scans.tree`, **duplicate-count CTE removed from tree**. |
| plan-063 live-progress-events | ◐ | Pool transitions emit (dropped `update_silent`); bars fill by completed work only; removed misleading `0 files` cards. |

## Duplicates & enrichment

| Plan | Tag | Summary |
|---|---|---|
| plan-039 duplicate-cache-task | ○ | Duplicate-cache rebuilds shown as background Tasks derived from lifecycle events (no new task table). |
| plan-040 file-extra-info-scan | ● | Extensible enrichment pass (EXIF first) keyed by `(blake3,size)`; `file_exif`/`file_extra_info_runs`; cancellable background task; perf-gated. |
| plan-054 duplicate-kind-grouping | ◐ | Group duplicates by `(blake3, size, file_kind)`; durable `files.file_kind` content taxonomy; versioned duplicate-cache fingerprints. |

## CLI / TUI

| Plan | Tag | Summary |
|---|---|---|
| plan-020 cli-file-processing | ● | Full CLI over the shared `AppCore` command bus; plural command groups + `--json`; HTTP `/api/rpc` for server-targeted scan control. |
| plan-066 scanner-cli-operations | ◐ | (active) `file-census --db <DB> scan <PATH> <SLUG>`; UTC `YYYYMMDDTHHMMSSZ--slug` IDs with atomic collision suffixes; per-worker telemetry; Ratatui renderer pending. |

## Small / self-contained UX

| Plan | Tag | Summary |
|---|---|---|
| plan-018 location-path-autofill | ○ | Auto-fill name/slug from picked folder (DNS-style slug helper); never overwrites manual edits. |

## Governance & recovery provenance

| File | Tag | Summary |
|---|---|---|
| plan-065 (active, recovery) | ⭐ | 2026-07-14 disaster-recovery rebuild; deterministic replay of exact `Add File` snapshots (excludes unsafe `patch_apply_end`/diff events); carries product requirements + non-destructive scan-excludes; documents UI recovery-horizon gap. |
| plan-065 (historical == predeletion) | ⭐ | 2026-07-11 *forward* production-integration contract: 13 milestones, release invariants, decision gates; "Synced Delivery State 2026-07-12" (Shell/Locations/Duplicates/Tasks/Search migrated, 179 UI tests). Proof the redesign was integrated pre-deletion. |
| plan-061 (active == historical) | ⭐ | File Results Workspace model (see highlights). |
| plan-066 (historical == predeletion) | ◐ | Original 53-line CLI-bootstrap + Ratatui contract stub. |
| recovered/README.md | ● | Provenance/ground-rules index: success-gated reconstruction; manifests (`ARCHIVE_MANIFEST.json`, `RECOVERY_REPORT.json` `conflict: null`); 25 plan paths deliberately unrecovered (no clean baseline/conflict). |
| workqueue.yaml | — | Live rebuild/acceptance ledger (tasks, prerequisites, evidence). |
