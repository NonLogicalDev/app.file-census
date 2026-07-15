---
date: 2026-07-11
status: in-progress
subject: shadcn-dark-ui-redesign
---

# Goal

Rework file-census into a coherent dark desktop application inspired by the supplied shadcn/ui reference. The approval-first prototype phase is complete and the user approved full production integration on 2026-07-11. Integrate the approved design into the real application while preserving all route, state, transport, backend, performance, and browser/Tauri behavior.

**Non-negotiable visual-match requirement:** production must visually match the approved `67908d1` prototype—not merely share its colors, tokens, or rough information architecture. For the Location/Scan Browser, Duplicates, Tasks, Search, Shell, and Cmd-K, port the prototype's hierarchy, pane geometry, control bands, density, border treatment, typography, and responsive behavior into production-owned components, wiring only real production data/state/actions in place of mocks. A route is not "migrated" because source tests or builds pass. It is migrated only after exact-size browser-server captures are compared against the approved prototype and every material visual mismatch is either fixed or recorded as an open P0/P1/P2 issue. No rationalization, compatibility excuse, or partial reskin is acceptance evidence.

Completion of the production integration is the active goal. This plan is the durable source of truth: keep milestone checkboxes, acceptance evidence, decisions, learning notes, and work-log entries current throughout implementation.

`GOALS.md` is the thread-level completion contract. It reframes this work as an uninterrupted finish-to-evidence objective: production parity with the approved prototype, preserved real behavior, complete browser/native verification, and user approval are all required before this plan can be closed.

# Context

The current application contains the necessary workflows but has accumulated page-specific layout, styling, navigation, and control patterns. The result feels visually fragmented and consumes too much space around the file tables and task data that users care about most.

The supplied reference establishes the visual target: near-black surfaces, restrained borders, compact typography, quiet segmented controls, dense multi-pane layouts, familiar icons, and very little ornamental chrome. File-census is an operational tool rather than a documentation or marketing site, so the reference language should be applied to file exploration, duplicate analysis, scan activity, and location navigation rather than copied literally.

Work occurs on branch `redesign/shadcn-dark-shell`.

The durable visual reference is `ui/design-references/shadcn-dark-reference.jpg`.

The immutable approved prototype baseline is commit `67908d1`. Production work may copy or extract from that baseline, but must not rewrite its visual evidence or make future approval depend on uncommitted prototype state.

# Product Integration

- Existing product model: Dashboard, Tasks, Locations, Duplicates, Search, and Options are separate routes using a shared sidebar but locally composed page chrome, filters, tables, tabs, and status surfaces.
- New requirement's real intent: make the entire app feel like one deliberate, polished product and validate that model visually before paying the cost of production integration.
- Cleanest integrated model: a shared dark application shell and File Results Workspace with stable navigation, page title/actions, compact query and mode controls, context/sidebar panes, dense data tables, and details/activity regions.
- Existing pieces that should move, change, or disappear: ornamental cards, repeated page descriptions and stats, oversized control bands, inconsistent segmented controls, local page-specific chrome, and production styling that conflicts with the approved prototype.
- Architecture impact: phase one is an isolated prototype with mock data and dedicated preview routes. After approval, phase two will replace shared production primitives first and migrate pages onto them without changing backend contracts.
- Why this is better than a local patch: visual approval happens against a complete product model, and production integration can follow a known destination instead of accumulating another styling layer.

# Decisions

- Use a shadcn-inspired dark visual system, not a literal clone of the reference site's information architecture.
- Prototype the shared shell plus Location/Scan Browser, Duplicates, and Tasks because together they exercise navigation, tables, filters, panes, scan hierarchy, progress, and operational actions.
- Use realistic file-census mock data and working local prototype interactions.
- Keep the prototype isolated from production routes and backend communication.
- Add preview routes for each prototype screen and important interaction state.
- Keep prototype source under `ui/src/prototypes/redesign/` and expose it only through `preview.html`; do not import `App`, production pages, RPC hooks, or backend-aware components.
- Add a full-screen preview layout so screenshots are not distorted by the component-preview navigation frame.
- Capture desktop screenshots and run design QA against the supplied reference before presenting the direction.
- Stop for explicit user approval after screenshots. Production wiring is a later milestone.
- Extend the isolated prototype with one shared Cmd-K command palette that adapts to the current workflow and selected mock context. Keep location navigation, route/menu commands, view commands, and safe contextual file actions together rather than inventing separate menus.
- Model a scan as a snapshot of exactly one location. Its scan-context side tree may show that location’s root and directories only; it must never render file entries or a root-files pseudo-folder. Files belong exclusively in the main results workspace, including File tree mode. Other global locations remain in the application rail and command palette.
- User approval for production integration was received on 2026-07-11. The prior no-production-wiring boundary is lifted only for the planned migration below; it is not permission to change backend contracts without characterization and an explicit decision gate.
- Preserve the production state and transport model during the visual migration. Component extraction is allowed; behavior changes require their own tests and acceptance evidence.
- Keep global location/scan selection in the sidebar. The main scan workspace is scan-relative and must not repeat a second location/scan navigator.
- Treat `67908d1` as the immutable visual/interaction baseline and as the rollback point for production integration.
- The prototype-faithful sidebar remains fully collapsible: preserve persisted width, pointer and keyboard resizing, desktop collapse/peek behavior, compact-overlay mode, focus behavior, and the existing responsive safety constraints while replacing only its visual hierarchy.

# Prototype Implementation Steps

1. [x] Audit the current preview architecture, shared UI primitives, dependencies, and reference image.
2. [x] Define the prototype shell, visual tokens, layout proportions, and shared controls.
3. [x] Build an isolated Location/Scan Browser prototype with realistic file table data.
4. [x] Build an isolated Duplicates prototype using the same workspace model.
5. [x] Build an isolated Tasks prototype with active scan progress and controls.
6. [x] Add dedicated component-preview routes for the prototype screens and key states.
7. [x] Run focused tests and the production UI build without changing production behavior.
8. [x] Visually inspect the prototype in the in-app browser at desktop and constrained widths.
9. [x] Write `design-qa.md`, fix P0/P1/P2 prototype issues, and recapture screenshots.
10. [x] Present screenshots and stop for user approval before production integration.
11. [x] Add and browser-verify the shared Cmd-K command palette with realistic local interactions.
12. [x] Correct the scan-context hierarchy to one scan-owned location, recapture the Location workflow, and rerun design QA.

# Production Integration Phase

## Status and Approval

- **Status:** approved and in progress.
- **Approval:** on 2026-07-11, after review of the corrected Location/Scan Browser, Duplicates, Tasks, and Cmd-K captures, the user directed the team to checkpoint and complete the full implementation.
- **Active goal:** migrate every production route and shared interaction onto the approved dark product model, preserve behavior and transport parity, achieve the non-negotiable visual match defined above with real browser-server evidence, and keep this checklist current until the final acceptance gate passes.
- **Immutable baseline:** `67908d1` (`checkpoint :: prototype command palette and scan ownership`). This is the approved prototype and the production-integration rollback point.
- **Scope boundary:** production UI composition, styling, accessibility, and state-preserving component extraction are approved. Backend/API changes remain behind the decision gates below.

## Contracts and Invariants

These are release-blocking invariants. A visual milestone is not complete if it violates any item here.

### Routing and navigation

- Preserve browser-server history routes and native/Tauri hash routes through the existing `routeTo` / `parseRoute` model.
- Preserve `/dashboard`, `/tasks`, `/options`, `/duplicates`, `/search`, `/locations`, `/locations/:locationSlug`, and `/locations/:locationSlug/scans/:scanId`.
- Preserve route parameters and round trips:
  - scan workspace: `path`, `view=tree|delete-check`, `q`, and encoded `filters`;
  - duplicates: `scans`, `view=tree`, `q`, and encoded `filters`;
  - search: `scope=all|explicit`, `scans`, `view=tree`, `q`, and encoded `filters`.
- Preserve browser back/forward, direct deep-link hydration, route replacement versus route push, and Tauri hash parsing.
- Cmd-K navigation must call the same production navigation/state entry points as visible controls. It must not create a parallel router or silently discard active route parameters.

### Application state and async correctness

- Preserve `App` as the behavior owner during migration unless a separately tested extraction is safer. Visual components receive state and callbacks; they do not call transport directly.
- Preserve `latest.current` synchronization for event handlers and long-lived callbacks. Any extracted state owner must prove equivalent stale-closure protection before replacing it.
- Preserve refresh coalescing, event-driven refresh, database-change reset behavior, route hydration, scan progress merging, and active-scan optimistic control states.
- Preserve tree request cancellation with `AbortController`, monotonically increasing request IDs, request keys, and late-response rejection.
- Preserve independent `treeLoading`, `searchLoading`, `duplicatesLoading`, `refreshing`, and `busy` semantics. Do not replace truthful scoped loading states with one global spinner.
- A scan or location switch must clear or re-scope selected rows, Delete Check results, staged paths, path history, inspector state, and contextual commands before late data can render.
- Empty, loading, error, disconnected, interrupted, paused, stopping, and stale-result states must remain distinguishable.

### Transport and backend behavior

- Preserve `useRpcConnection`, JSON-RPC method names/payloads, WebSocket event handling, event lag recovery, event queue ordering, and user-visible event filtering.
- Preserve the desktop database bridge, browser-server database behavior, folder/database pickers, file open/reveal behavior, and native runtime detection.
- No production component may import prototype mock data or substitute local-only behavior for an RPC-backed action.
- No JSON-RPC, WebSocket/Tauri, Rust backend, database schema, or persistence change is allowed until a decision-gate milestone characterizes the existing contract and records why UI-only adaptation is insufficient.
- Browser-server and Tauri must present the same information and enabled/disabled action semantics, except for runtime-specific system affordances already present in production.

### Product ownership and scan model

- One scan belongs to exactly one location. Validate `scan.location_slug` / `scan.location_id` whenever constructing scan context.
- The sidebar owns global locations and their scans. The scan workspace owns only the selected scan's folder hierarchy, breadcrumb, rows, and inspector.
- Do not render multiple global locations beneath one scan. Do not repeat a second scan selector inside the main workspace.
- Location overview owns location metadata and scan management; the selected scan workspace is scan-relative and should show the location only as compact context.
- Dashboard and Tasks own global operational summaries. File workspaces must not repeat decorative global statistics or activity slabs.

### File Results Workspace and actions

- Scan excludes are stored per scan and filter every scan-scoped query/result/action surface. Changing an exclude never deletes indexed file records or rewrites scan history; explicit delete-path/delete-scan flows remain the only destructive paths.
- Preserve the single scan mode set `Files | File tree | Delete Check`; never restore nested view selectors.
- Preserve committed query behavior, advanced filter encoding/grouping, scope selection, flat/tree state, path history, selection, visible columns, and existing row ordering.
- Preserve FileGrid behavior: selection, parent rows, sorting, column visibility/order, responsive overflow, open/inspect actions, duplicate counts, and loading/empty states.
- Preserve folder-pane behavior: expand/collapse, stable indentation, aligned disclosure/icon/name columns, one-location root, selected-path synchronization, and no name offset regression.
- The side folder pane is directory-only. Filter/render only `kind === 'dir'` nodes while preserving lazy branch loading, pagination, selection, and path synchronization; root-level and nested files remain reachable only through the main FileGrid/results workspace.
- Preserve inspector truth: it follows the visible selected row, closes or updates when the row disappears, and never shows details from the prior scan/query.
- Preserve file action capability checks and production callbacks for open, reveal, browse folder, build thumbnails, scan EXIF, exclude path, delete path, file info, and exact-duplicate navigation.
- Destructive actions remain confirmation-gated through production modals. Cmd-K may stage a Delete Check or open an existing confirmation flow; it must not add a one-keystroke permanent delete.

### Delete Check

- Preserve `deleteCheckPathsByScan`; staged include/exclude paths are scoped to the selected scan and normalized through existing utilities.
- Preserve current-folder, selected-row, include, exclude, remove, clear, close-result, and rerun behavior.
- Preserve `buildDeleteCheckRequest` payload semantics and backend result truth. Do not infer deletability from prototype data or duplicate counts.
- Clear or safely restore Delete Check result/selection on route, scan, path, database, and deletion events exactly as production does today.
- Keep Delete Check visually part of the shared scan workspace while maintaining explicit warning semantics and confirmation boundaries.

### Duplicates, Search, and Tasks

- Preserve representative-scan defaults, explicit scan scope, duplicate cache status/rebuild behavior, flat/tree modes, occurrence actions, and navigation from a duplicate to its owning scan/path.
- Preserve Search all-scans versus explicit-scans scope, URL encoding, committed execution, results loading, tree grouping, columns, and file actions.
- Preserve live scan/task progress, pause/resume/stop/stopping transitions, log retention, duplicate-cache tasks, file-extra-info tasks, event updates, and cancellability rules.
- Do not label transient in-process activity as durable task history unless the backend gate proves it is persisted and queryable.

### Accessibility, density, and visual baseline

- Use semantic buttons, links, headings, table/grid roles, dialogs, menus, tabs, progress indicators, and status text. Icons alone require accessible names.
- Preserve visible keyboard focus, logical tab order, Escape dismissal, focus restoration, focus trapping for modal surfaces, menu roving/arrow-key behavior, and screen-reader labels.
- Support reduced motion and avoid animation-dependent state communication.
- Match the approved neutral dark tokens, compact typography/controls, one-pixel borders, sparse semantic color, Lucide icon language, and no gradients/ornamental cards.
- Validate production routes at exact 1440x900 and 1280x800 viewports with no horizontal page overflow, clipped critical actions, overlapping panes, or hidden contextual controls.

## Architecture and Ownership Decisions

- `App.jsx` remains the production orchestration boundary for route state, RPC calls, event reconciliation, async request invalidation, modal state, and action callbacks until milestone-specific tests justify extraction.
- `Shell.jsx` owns the persistent app frame: global route navigation, global location/scan navigation, responsive sidebar, route title/actions, connection status, global notifications, and the Cmd-K mount/shortcut.
- Production primitives live under `ui/src/components/ui/`. Prototype CSS and JSX are references, not production dependencies. Shared tokens belong in production CSS/theme sources.
- `LocationsPage.jsx` owns the location-level empty/overview state. `FileExplorer.jsx` owns the selected scan workspace composition. `FileGrid.jsx` remains the shared data-grid implementation used by scan, Duplicates, and Search.
- The folder context pane is a scan-owned, location-rooted, directory-only projection. It receives the active scan/location and loaded directory entries; it does not enumerate `locationList` or render file entries.
- The inspector is a shared workspace surface driven by selected production row data and existing file-info actions; it must not become a second source of selection state.
- Duplicates, Search, and Tasks retain their current production data owners while adopting the shared shell/workspace primitives. Consolidate presentation contracts only where equivalent behavior is demonstrated by tests.
- Cmd-K is a presentation and dispatch layer over existing production state/actions. Command definitions may be extracted to a pure model for testing, but command execution must delegate to production callbacks.
- `AppModals.jsx`, `Modal.jsx`, `Menu.jsx`, and `NotificationLayer.jsx` remain centralized cross-route surfaces and are migrated once, then reused everywhere.
- Component preview routes remain available for isolated states, but production acceptance is based on the compiled browser-server app and native/Tauri app with real state.
- Prototype source under `ui/src/prototypes/redesign/` remains isolated through `preview.html` until final acceptance. Delete or archive decisions are explicitly out of scope for the integration milestones.

## Backend Decision Gates

### Exact duplicate lookup from file context

- [x] Characterize current duplicate-group RPC data, FileGrid duplicate counts, representative-scan scope, file-info data, and navigation helpers.
- [x] Prove whether selecting “Find exact duplicates” can be implemented truthfully by routing to existing Duplicates state with a stable hash/query/filter already available in production: it cannot. `dupes.list` has no target-group RPC/filter and client filtering applies only to the loaded top 100 groups.
- [x] Record file identity semantics: groups are exact `(blake3, size, file_kind)` across representative-enabled locations or explicit >=2 scan scopes; `files.details` occurrences are global `(blake3, size)` and can exceed the selected group/scope. Existing detail actions truthfully inspect occurrences and reveal a selected occurrence in its owning scan, but are not a group deep link.
- [x] Existing data is insufficient for a truthful “Show exact duplicates” Cmd-K navigation. Keep the command absent/disabled rather than infer a result from name or size.
- [x] Proposed minimum future contract (requires explicit approval before backend work): a group query accepting `{ blake3, size, file_kind, canonical_scope }`, returning scoped/paginated group occurrences and a route target capable of focusing `{ scan_id, path }` after tree load. Rust tests must cover kind isolation, representative/explicit scope, pagination, non-hash/directory cases, and stale route resolution.
- [x] Acceptance: current palette never promises an exact duplicate group. Existing “Inspect content occurrences” behavior remains correctly labelled and uses real occurrence identity.

### Truthful task history

- [x] Characterize which task records come from persisted scans, current-process `scanProgress`, `backgroundTasks`, duplicate-cache events, file-extra-info events, and event-log memory.
- [x] Determine what survives refresh, browser-server restart, Tauri restart, and database switch: active task snapshots are process-local; refresh replaces them; server restart recovers live scans as interrupted; and a database boundary clears session projections before B hydrates.
- [x] Keep the UI labeled as current app-session activity whenever that is the truthful contract.
- [x] Durable cross-session task history is not necessary to match the approved interaction. Do not add a schema/RPC history layer without a separately approved product requirement.
- [x] Acceptance: Tasks and Cmd-K never present synthesized or session-only entries as durable historical truth.

## Milestone Checklist

## Synced Delivery State — 2026-07-12 13:30

The following source migrations are integrated and covered by the full UI suite (179 passing). They remain **in-progress** until their milestone-specific acceptance evidence, cross-route browser capture, native parity, and visual QA gates are complete:

| Workstream | Production implementation status | Evidence still required before closure |
| --- | --- | --- |
| Shell/sidebar/Cmd-K | Main-top-bar palette, prototype-faithful collapsible rail, real callbacks | both target viewport captures, keyboard/reconnect/hash/native parity |
| Locations/scan workspace | Direct production port with exact measured workspace geometry | 1280 capture, files/delete-check/actions/stale-state scenarios |
| Duplicates | Direct production workspace port | populated flat/tree/cache/scope/Cmd-K browser scenarios |
| Tasks | Direct queue/detail/events workspace port with UUID-stable live projections and truthful current-session labels | remaining stopping/long-content plus final cross-route visual matrix |
| Search | Direct continuous workspace port | deep-link/history/tree/rapid-change/1280 browser scenarios |
| Dashboard/Options/modals/menus | partial production styling/migration | full source and browser accessibility parity work |

Do not treat an `x` on a source-migration subtask as acceptance of the workstream. The milestone acceptance clauses and `GOALS.md` checklist govern closure.

### 0. Freeze baseline and characterize production contracts

**Dependencies:** approved prototype commit `67908d1`; no production edits before the baseline audit is recorded.

- [x] Confirm branch and clean/known worktree; record `git status`, `git log -1`, and `git diff --check` without absorbing unrelated user changes.
- [x] Tag `67908d1` in this plan as the immutable comparison and rollback baseline; inventory its screenshots and preview routes.
- [ ] Capture pre-migration production screenshots for every route at 1440x900 and 1280x800 against a disposable fixture database.
- [ ] Record existing console errors/warnings, keyboard behavior, route URLs, loading states, empty states, and responsive failures before attribution.
- [x] Inventory production component ownership, CSS/class helpers, icon mappings, modals, menus, notifications, and all preview routes.
- [x] Inventory every App state field, `latest.current` mirror, ref, async loader, RPC method, event kind, modal toggle, and page prop boundary touched by the redesign.
- [x] Add or update structural tests that lock scan-to-location ownership and production/prototype isolation; route parsing/serialization coverage remains a route-migration requirement.
- [x] Characterize both backend decision gates without implementing backend changes.
- [ ] Update this plan with the exact baseline commands, fixture path, server ports, screenshot paths, and audit findings.
- [ ] Acceptance: baseline is reproducible; all production contracts have an owner; unknown backend assumptions are explicitly gated; UI tests and production build still pass unchanged.
- [ ] Checkpoint only milestone-owned plan/tests/audit evidence as `checkpoint :: redesign integration baseline`.

### 1. Production theme and reusable primitives

**Dependencies:** milestone 0.

- [x] Port approved neutral color, spacing, typography, radius, border, focus, overlay, and semantic status tokens into production theme/CSS without importing prototype styles.
- [x] Normalize document/root/body sizing, background, text rendering, selection color, scrollbars, reduced motion, and default form typography.
- [x] Migrate `Button`, `IconButton`, `Surface`, `Toolbar`, `StatusPill`, segmented tabs, inputs, selects, checkboxes, pills/chips, dividers, and empty/loading primitives.
- [x] Preserve existing variants and capability semantics while matching compact dimensions and focus states.
- [ ] Audit `Icon.jsx` mappings against approved Lucide usage; add only familiar production icons with accessible labels.
- [x] Replace shared production utility/class helpers without stranding their existing consumers; page-local route migration remains explicitly deferred to its route milestones.
- [ ] Add component preview states for default, hover, focus, active, disabled, loading, warning, danger, and long-label cases.
- [x] Add/adjust unit and structure tests for class contracts and variants; overlay/menu accessibility and full no-gradient enforcement remain assigned to the cross-route accessibility milestone.
- [x] Browser-review primitive previews at 1440x900 and 1280x800 with zero warnings/errors; keyboard interaction receives full coverage with the Shell/menu/modal milestones.
- [ ] Acceptance: primitives match `67908d1`, existing callbacks/disabled states are unchanged, and production routes remain behaviorally usable during incremental migration.
- [x] Checkpointed the stable primitive migration as `5945f34` (`checkpoint :: dark production primitives`); remaining Milestone 1 icon and dedicated state-preview work rolls into the shell/accessibility passes.

### 2. Shared Shell, routing frame, notifications, and responsive sidebar

**Dependencies:** milestones 0-1.

- [x] Port the approved near-black shell language, compact route bar, global rail hierarchy, connection indicator, and page action placement into `Shell.jsx`.
- [x] Keep the existing top-level route set and Options entry; do not add decorative navigation destinations.
- [x] Keep the sidebar as the sole global owner of locations/scans; preserve expansion, active-scan auto-expansion, selected scan, active scan status, counts, and representative indication.
- [x] Remove redundant location/scan identity from the main route bar while retaining compact active context.
- [x] Preserve resizable sidebar min/default/max widths, persisted width, pointer/keyboard resize, hide/peek behavior, compact overlay, wheel handling, and focus behavior without changing the existing code path.
- [x] Preserve top-bar action overflow/menu behavior and route-driven closing without changing the existing code path.
- [ ] Migrate the initial application loading/boot surface and connection fallback so cold start, database hydration, and reconnect never flash the old theme or imply that loaded data is ready.
- [x] Migrate `NotificationLayer` into the approved shell language without changing event/message lifetime or announcement behavior.
- [ ] Verify route push/replace, browser back/forward, direct URLs, Tauri hash routes, database switch reset, and disconnected/reconnecting states.
- [ ] Add Shell preview routes for expanded/collapsed/compact sidebars, many scans, long names, disconnected transport, notifications, and action overflow.
- [ ] Acceptance: all routes remain reachable; global scan/location navigation is not duplicated; sidebar behavior and history work in browser-server and Tauri route modes; no page content is clipped at target sizes.
- [x] Checkpointed the stable shared-shell migration as `ad0965e` (`checkpoint :: dark production shell`); cold-start/notification and full route-parity checks remain in this milestone.

### 3. Dashboard migration

**Dependencies:** milestone 2.

- [x] Map existing Dashboard values to the approved dense operational layout; remove duplicated location/scan rosters and ornamental cards without dropping aggregate database metrics.
- [x] Preserve overview refresh/loading/error behavior, database context, aggregate counts, active progress, and recent events; Dashboard remains a passive overview with existing navigation unchanged.
- [x] Keep global activity summary concise and defer detailed logs/actions to Tasks.
- [x] Use shared primitives for status, compact metrics, empty state, and divider-row action summaries.
- [ ] Add preview/fixture states for empty database, populated database, active scans, failures/interrupted scans, disconnected transport, and partial loading.
- [ ] Add tests for displayed values, callback routing, loading truth, and absence of duplicated location/scan trees.
- [x] Browser-verify real production Dashboard at 1440x900 and 1280x800 with zero console errors.
- [ ] Acceptance: every pre-migration Dashboard capability remains available, denser hierarchy matches the approved shell, and Tasks remains the owner of detailed activity.
- [x] Checkpointed the stable Dashboard migration as `27999a4` (`checkpoint :: dark dashboard`); fixture-backed browser capture remains a later acceptance requirement.

### 4. Locations overview and location/scan selection

**Dependencies:** milestones 2-3.

- [x] Migrate the no-location, locations overview, selected-location/no-scan, and disconnected-location states in `LocationsPage.jsx` into a compact nonduplicative presentation.
- [x] Preserve add/edit/delete location, enable/disable duplicate detection, browse folder, start scan, scan options, notes, and active-scan deletion guards by keeping those actions at their existing top-bar/modal owners.
- [ ] Preserve scan list ordering, selected scan, representative scan, active scan, best/last successful scan derivation, and start/update/repair optimistic entries.
- [x] Ensure selecting a location does not silently select a scan from another location; enforce one scan -> one location in rendering and tests.
- [x] Keep global scan management in the sidebar/top bar; do not add a second global scan list to `FileExplorer`.
- [ ] Handle long location/scan names, many scans, empty scans, offline roots, running/paused/stopping/interrupted/failed/completed states, and deletion/database-switch resets.
- [ ] Add route/structure tests for `/locations`, `/locations/:slug`, selected scan validity, and scan ownership.
- [ ] Add preview states and browser-verify production at both target viewports.
- [ ] Acceptance: all location/scan management behavior survives; no scan renders under the wrong location; sidebar and main UI have distinct nonduplicative roles.
- [x] Checkpointed the stable Locations overview migration as `3ba5148` (`checkpoint :: dark locations`); target-viewport production browser evidence remains queued with the fixture pass.

### 5. Scan File Results Workspace foundation

**Dependencies:** milestones 1-2 and 4.

- [x] Recompose `FileExplorer.jsx` into the approved scan-relative workspace without moving RPC ownership out of `App.jsx`.
- [x] Preserve one mode selector: `Files | File tree | Delete Check`, including `view` route encoding and mode-specific state.
- [ ] Build the compact workspace header for scan label/status/counts and place infrequent scan management actions in the approved menu.
- [x] Build the single-location directory-only folder pane rooted at the active scan's location; preserve disclosure alignment, indentation, selection, and expand/collapse behavior, with no file rows or root-files pseudo-folder.
- [ ] Preserve back, forward, parent, breadcrumb/path navigation, direct path routes, history truncation after new navigation, and current-folder operations. User folder push/Back/Forward is now browser-proven; parent, breadcrumb, direct nested hydration, and history-truncation remain explicit route-matrix coverage.
- [ ] Migrate committed query, compact advanced filters, applied-filter summary, route encoding, and loading behavior.
- [ ] Migrate `FileGrid` styling and layout for dense rows, table header, sort state, column visibility/order, selection, parent entry, flat/tree rows, and overflow.
- [ ] Preserve tree page depth/limit/offset behavior and duplicate-cache status/rebuild notice.
- [ ] Preserve `treeAbortController`, request ID/key rejection, tree reload scheduling, and stale-result clearing during scan/path/query changes.
- [x] Implement the responsive pane model at 1280x800 without losing folder access or critical table actions.
- [ ] Add component previews for files/tree, folder expansion, empty folder, loading, long paths, no hash/metadata, interrupted scan, cache building/failed, selection, and constrained width.
- [ ] Add focused tests for route state, stale requests, selection reset, single-location root, aligned folder labels, no nested modes, and mixed directory/file branches (including root-level/nested files and paginated branches) proving no file node reaches the side tree.
- [ ] Acceptance: scan browsing is visually equivalent to `67908d1`, the side folder pane contains only directories while FileGrid is the sole file-rendering surface, all existing navigation/data contracts pass, and rapid scan/path/filter switching cannot display stale rows.
- [ ] Checkpoint as `checkpoint :: dark scan workspace`.

### 6. Inspector, Delete Check, and production file actions

**Dependencies:** milestone 5; exact-duplicate gate characterized in milestone 0.

- [x] Implement the approved inspector/drawer from real selected-row and file-info data; preserve close/update behavior when selection or result visibility changes, including Escape dismissal and focus restoration in the responsive production workspace (`file-inspector-keyboard-parity` P1).
- [ ] Preserve file open, reveal, browse folder, build thumbnails, scan EXIF, inspect info, exclude path, and delete path through existing production callbacks and capability checks.
- [ ] Preserve selection count, clear selection, bulk-thumbnail request, row-level actions, connected-location gating, and active-scan restrictions.
- [ ] Migrate Delete Check staging and result UI while retaining scan-scoped include/exclude/clear/remove/rerun behavior and request payload construction.
- [ ] Preserve delete path and delete scan confirmation modals, active-scan guards, successful refresh/reload, and failure messaging.
- [x] Implement exact-duplicate navigation only if the decision gate proves existing data/RPC truth; otherwise ship an honest disabled/explanatory command state and record follow-up.
- [ ] Add tests for stale inspector prevention, action callback arguments, disabled states, destructive confirmations, scan-scoped staged paths, request payloads, and route/scan/database resets.
- [ ] Add preview states for inspector open, multi-selection, Delete Check empty/safe/unsafe/error, staged scopes, disconnected actions, and confirmations.
- [ ] Browser-verify all actions against a disposable fixture database only; do not delete or mutate user data during QA.
- [ ] Acceptance: every pre-migration file action is reachable and truthful, destructive actions retain confirmation, and Delete Check never leaks state across scans.
- [ ] Checkpoint as `checkpoint :: dark file operations`.

### 7. Production Cmd-K command palette

**Dependencies:** milestones 2 and 4-6; both backend decision gates characterized.

- [x] Extract/adapt the prototype command model into production-safe pure definitions without importing mock data.
- [x] Mount one global palette in `Shell`; support Cmd-K and Ctrl-K, explicit close, Escape, backdrop close, focus trap, initial focus, and focus restoration.
- [x] Provide grouped commands for current context, Locations/scans, Navigation, View/Menu, and safe contextual file/task actions.
- [x] Build command availability from current route, selected location/scan/path/row/group/task, connection state, loading state, and existing action capability.
- [x] Dispatch route/view/location/scan commands through existing App/Shell callbacks and preserve route parameters where appropriate.
- [x] Implement keyboard navigation, active descendant/selection, Home/End, result count, type filtering, no-results state, shortcut hints, and scroll-into-view.
- [x] Ensure location and scan switch commands reset contextual state exactly like visible navigation.
- [x] Ensure Delete Check staging is allowed but permanent deletion is not a root one-keystroke command.
- [x] Implement exact-duplicate and task commands only to the truthful extent proven by their decision gates.
- [x] Add pure model tests for grouping, filtering, labels, context visibility, disabled states, and dispatch; add DOM/structure coverage for dialog/menu accessibility.
- [ ] Add preview and production browser scenarios on every route at both viewport sizes with zero console errors.
- [ ] Acceptance: palette results always reflect current production state, keyboard interaction is complete, no command bypasses guards/confirmations, and routing/state matches visible controls.
- [ ] Checkpoint as `checkpoint :: production command palette`.

### 8. Duplicates migration

**Dependencies:** milestones 1-2, 5-7; exact-duplicate gate resolved for UI scope.

- [x] Migrate `DuplicatesPage.jsx` to the approved shared workspace hierarchy using real duplicate groups and cache state.
- [x] Preserve representative-scan default, explicit scan scope, scan filtering, query/advanced filters, `scans` route encoding, and flat/tree mode.
- [x] Preserve cache empty/building/ready/failed states, rebuild action, loading truth, and event-driven updates. `duplicate-cache-failure-parity` is browser-proven with a real isolated failed rebuild: authoritative error status reaches the existing Retry cache control and retry remains truthful.
- [x] Preserve group identity, occurrence counts/bytes, kind grouping/tree, selected group/detail behavior, and stale-detail clearing after filters/scope updates.
- [x] Preserve open/reveal/inspect and navigation from an occurrence to its owning location/scan/path.
- [x] Ensure destination scan/location ownership is validated before navigation; no occurrence may open beneath a different location.
- [ ] Add preview states for representative default, explicit scope, no representatives, cache building/failure, large groups, stale selection, empty results, and constrained width.
- [ ] Add tests for route round trips, scope defaults, filtering, stale selection, action arguments, cache state, and exact-duplicate command handoff.
- [x] Browser-verify production Duplicates at both target sizes and through Cmd-K entry. `duplicates-toolbar-desktop-parity` is closed: compiled populated/no-match captures keep the real query/filter/scope/view/cache controls visible and interactive at 1440x900 and 1280x800.
- [ ] Acceptance: all duplicate analysis capabilities remain truthful and responsive; cache/scope is visible; no decorative global stats displace result data.
- [ ] Checkpoint as `checkpoint :: dark duplicates`.

### 9. Tasks migration

**Dependencies:** milestones 1-2 and 7; truthful-task-history gate resolved.

- [x] Migrate `TasksPage.jsx` to the approved dense active/recent work model using real `scanProgress`, scans, and `backgroundTasks`.
- [x] Preserve active scan progress, current path, counts/bytes/errors, pool metrics, bounded logs, pause/resume/stop/stopping behavior, and cancellability.
- [x] Preserve duplicate-cache and file-extra-info task status, event reconciliation, finished/stopped/failed transitions, and database-change resets.
- [x] Label session-only versus persisted records truthfully based on the backend gate; do not fabricate history timestamps or completion records.
- [x] Keep task detail/log expansion accessible and performant with long logs and many tasks. `tasks-log-workspace-parity` is browser-proven with an accessible, scrollable bounded disclosure of genuine live scan-log lines at both approval sizes.
- [x] Integrate safe contextual Cmd-K task actions through the same production callbacks.
- [ ] Add previews for running, paused, stopping, completed, interrupted, failed, noncancellable, concurrent tasks, long path/log, empty, and disconnected states.
- [x] Add tests for status mapping, action availability, event updates, log bounding, progress accessibility, and truthful-history labels.
- [ ] Browser-verify active transitions against the browser-server and at least one native/Tauri run. The browser-server real background workload is complete; remaining native/Tauri and route-state transition coverage stays explicit.
- [x] Keep Scan EXIF start feedback truthful to its existing background-task RPC metadata. `exif-task-feedback-parity` is browser-proven with real QA Tree File actions -> Scan EXIF copy that announces only the queued task.
- [ ] Acceptance: Tasks is the authoritative global activity surface, all live transitions remain correct, and no UI claims persistence the backend does not provide.
- [ ] Checkpoint as `checkpoint :: dark tasks`.

### 10. Search migration

**Dependencies:** milestones 1-2, 5-7.

- [x] Migrate `SearchPage.jsx`, `SearchFilterControls.jsx`, and `ScanScopeSelector.jsx` to the shared workspace hierarchy.
- [ ] Preserve committed query execution, empty-query behavior, advanced filters/grouping, `q`/`filters` route encoding, and pending route search.
- [ ] Preserve all-scans versus explicit-scans scope, selection pruning after refresh, `scope`/`scans` route encoding, and default behavior.
- [ ] Preserve flat/tree modes, result loading, FileGrid columns/order, tree grouping, row selection, inspector, and production file actions.
- [ ] Keep compact Columns menu with drag and keyboard fallback; do not restore page-sized column configuration.
- [x] Preserve no-results, no-scope, loading, stale-request, partial metadata, disconnected, and long-query/filter states. `search-stale-response-parity` is browser-proven: overlapping real replies cannot replace newer results and direct/history empty routes clear stale rows and inspector state.
- [x] Use `qa-search-race-harness` only as an opt-in disposable-fixture transport aid to deterministically reverse two real `files.search` replies for stale-response browser proof; it adds no production test mode or mock search payload.
- [ ] Integrate Search route/menu/view commands into Cmd-K without forking query state.
- [ ] Add route, scope, filter, columns, stale-result, and action regression tests plus representative component previews.
- [ ] Browser-verify direct deep links, history navigation, refresh, rapid search changes, both view modes, and both target viewports.
- [ ] Acceptance: Search retains all current scope/filter/route behavior, uses the same file-results language, and never displays results for a superseded request.
- [ ] Checkpoint as `checkpoint :: dark search`.

### 11. Options, AppModals, Menu/Modal accessibility, and cross-route cleanup

**Dependencies:** milestones 1-10.

- [x] Migrate `OptionsPage.jsx` without changing database chooser, database info, worker settings, validation, persistence, or native/browser capability semantics; browser-server proof covers invalid direct Save, valid persistence, Reset draft semantics, and keyboard-visible focus, while native chooser proof remains separately queued.
- [ ] Migrate every `AppModals.jsx` flow: add/edit/delete location, start/update/repair scan options, scan notes, scan excludes, scan/location/path confirmations, file info, thumbnail request, and any runtime/database dialogs.
- [ ] Migrate `Modal.jsx` overlay/dialog layout with focus trap, labelled title/description, Escape, close button, initial focus, focus restoration, nested control behavior, and background scroll prevention.
- [ ] Migrate `Menu.jsx` trigger/content/items/labels/separators with keyboard opening, arrow navigation, Home/End, Enter/Space activation, Escape, outside click, focus restoration, viewport collision handling, and disabled-item semantics.
- [ ] Audit page-action menus, Columns menu, row-action menus, scan actions, Cmd-K coexistence, and modal/menu stacking order.
- [ ] Audit `NotificationLayer` announcements, message severity, dismissal, overlap with dialogs/palette, and constrained-width placement.
- [ ] Remove obsolete production light-theme/page-local CSS only after `rg` confirms no consumers; preserve prototype isolation and do not bulk-rewrite unrelated styles.
- [ ] Audit copy for duplicated location/scan identity, vague destructive labels, unsupported “history,” and backend claims.
- [ ] Add accessibility structure/interaction tests and previews for every menu/modal/notification state, including long content and validation errors.
- [ ] Browser-run a keyboard-only pass across all production routes and modal/menu/palette combinations at both target sizes (`cross-route-keyboard-accessibility-matrix`).
- [ ] Acceptance: Options and every modal/menu action retain behavior, keyboard/focus contracts pass, no mixed legacy theme remains on a reachable production surface, and global context is not redundantly repeated.
- [ ] Checkpoint as `checkpoint :: dark options and modals`.

### 12. Full parity, performance, visual QA, and production acceptance

**Dependencies:** milestones 0-11 complete; both backend gates resolved or explicitly deferred with truthful UI.

- [ ] Run the complete automated command matrix below from a clean worktree and record versions/results in the Work Log.
- [ ] Run all browser-server scenarios against a disposable fixture database and preserve the fixture path plus launch command.
- [ ] Run native/Tauri smoke scenarios for startup, route/hash navigation, database chooser, folder chooser, open/reveal, scan/task events, reconnect, and shutdown (`native-route-system-affordance-matrix`; native Options remains its prerequisite).
- [ ] Capture exact 1440x900 and 1280x800 production screenshots for Dashboard, Locations overview, scan Files, scan File tree, Delete Check, inspector, Cmd-K default/context state, Duplicates flat/tree, Tasks active/detail, Search flat/tree, Options, and representative modals/menus.
- [ ] Compare production captures to `67908d1` and `ui/design-references/shadcn-dark-reference.jpg`; update `design-qa.md` with P0/P1/P2 findings and closure evidence.
- [ ] Verify console errors/warnings, failed requests, focus behavior, accessible names, overflow, clipping, density, long labels, empty/loading/error states, and reduced motion.
- [ ] Stress rapid route/scan/path/query/scope changes and confirm stale requests cannot overwrite current state.
- [x] Validate Delete Check and destructive flows only on disposable fixture paths; document that no user database or real files were mutated.
- [ ] Review `git diff`, `git diff --check`, production/prototype import boundaries, changed-file ownership, generated artifacts, and screenshot dimensions.
- [ ] Update every milestone checkbox, Decision Gate, Learning Log, Work Log, and Unfinished Work item with final evidence.
- [ ] Obtain explicit user acceptance of the production implementation screenshots and any documented backend deferrals.
- [ ] Acceptance: all commands and browser/native scenarios pass; no open P0/P1/P2 design issues; no behavior/transport regression; web/Tauri parity is demonstrated; user explicitly approves production integration.
- [ ] Checkpoint as `checkpoint :: complete dark redesign integration`.

## Automated Verification Matrix

Run focused tests during each milestone and the full matrix at milestone 12. Commands that create Vite temporary config files must be run with the repo-required elevated permission rather than first failing in the sandbox.

| Layer | Command | Required evidence |
| --- | --- | --- |
| UI unit/structure | `npm --prefix ui test` | All tests pass; record test count and duration. |
| Production UI bundle | `npm --prefix ui run build` | Escalated run passes with no unresolved imports or CSS build errors. |
| Rust workspace | `nix develop -c cargo test --workspace` | Backend/native unit and integration tests pass, or pre-existing failures are isolated with evidence. |
| Backend package | `nix develop -c cargo test -p file-census-backend` | RPC/event/tree/delete behavior remains green. |
| Native compile | `just desktop-check` | Embedded UI and Tauri Rust crate compile together. |
| Browser-server build | `just build` | Exact shipped browser-server composition builds. |
| Diff hygiene | `git diff --check` | No whitespace errors. |
| Production/prototype isolation | focused `rg` plus structure tests | No production import from `ui/src/prototypes/redesign/` or its mock data/CSS. |
| Performance hot paths | `just perf-gates` when backend/hot-path behavior changes | Required only if production work changes scan/tree/delete backend or request shape; otherwise record N/A and reason. |
| Native bundle | `just desktop-build-app` when release packaging is in scope/available | Record pass or an explicit environment limitation after `desktop-check` passes. |

## Browser and Native Scenario Matrix

### Preview versus production distinction

- Component previews run through Vite `preview.html` and are used for isolated state coverage only.
- Production browser-server acceptance must use a freshly built `file-census serve` process (`just run-with-db <fixture-db>` or equivalent) and production routes, not `preview.html`.
- Native acceptance must use `just desktop-run` / Tauri dev with the same disposable fixture database where runtime configuration allows it.
- Every screenshot filename and QA note must state `preview`, `browser-server`, or `tauri`; never treat a preview capture as proof of transport integration.

### Required scenarios at both 1440x900 and 1280x800

- [ ] Cold start with empty fixture DB; add-location affordance, empty Dashboard/Tasks/Search/Duplicates, Options/database context.
- [ ] Populated start; sidebar location/scan selection, direct scan deep link, browser back/forward, refresh hydration.
- [ ] Multiple locations with multiple scans each; verify each scan appears under only its owner and main workspace shows only the active scan's location tree.
- [ ] Location selected without a scan; connected/disconnected roots; long names; many scans; representative and active status.
- [ ] Scan Files mode; folder navigation/history/breadcrumb; committed query; advanced filters; columns; sorting; selection; inspector; open/reveal capability.
- [ ] Scan File tree mode; disclosure alignment, multiple depths, long names/counts, expansion, selected path, compact-width access.
- [x] Mixed root and nested files/directories in scan Files and File tree modes: verify the side folder pane contains only directories at every expanded depth, while files render exclusively in the main results workspace; verify lazy pagination still discovers later directories.
- [ ] Delete Check; current folder, selected files, include/exclude staging, clear/remove/rerun/result close, scan switch reset, safe confirmation behavior.
- [ ] Rapid scan/path/query switching under artificial or observed latency; no stale rows, inspector, selection, or loading indicator.
- [ ] Cmd-K on Dashboard, scan row selected, Duplicates group selected, and Tasks item selected; keyboard-only open/filter/navigate/execute/close/restore focus.
- [ ] Duplicates representative default and explicit scope; flat/tree; cache building/failed/ready; occurrence open/reveal/navigate.
- [ ] Tasks running/paused/stopping/failed/completed and background-task states; live event transitions; logs; disabled actions.
- [ ] Search all/explicit scope; direct encoded URL; flat/tree; query/filter changes; Columns menu; inspector/file actions.
- [ ] Options database and worker settings; validation, save/cancel, browser-only versus native-only controls.
- [ ] All AppModals, Menu variants, notifications, action overflow, nested palette/modal prevention, Escape/focus restoration.
- [ ] WebSocket disconnect/reconnect and event-lag recovery; loading/disabled states remain truthful (`event-lag-recovery-browser-parity`).
- [ ] Tauri hash-route parity, native database/folder pickers, open/reveal, active scan event updates, and database switch reset (`native-route-system-affordance-matrix`).
- [ ] Console and request log inspection after each workflow; zero new uncaught errors, rejected promises, invalid DOM/accessibility warnings, or failed production requests.

## Fixture Database and Destructive-Test Safety

- Use a task-specific disposable database and disposable filesystem tree under `/tmp` or another explicitly recorded test location.
- Never point browser QA, Tauri QA, Delete Check, scan deletion, path deletion, excludes, or database-switch tests at the user's normal database or irreplaceable files.
- Seed fixture locations with deterministic nested directories, long names, empty directories, duplicates, same-scan duplicates, unique files, metadata variants, and safe throwaway delete targets.
- Record fixture creation command/path in the Work Log. Do not commit generated databases, absolute machine paths, secrets, or large scan artifacts.
- Before a destructive scenario, confirm the displayed location root and scan ID belong to the fixture. Afterward, verify expected fixture-only effects and reset/reseed as needed.

## Checkpoint and Rollback Discipline

- Start every milestone from the prior stable checkpoint; do not combine unrelated milestones into one commit.
- Before shared component changes, record `git status` and preserve unrelated user work. Never reset or overwrite unknown changes.
- Use the exact checkpoint name listed by each milestone after its acceptance criteria and focused verification pass.
- If a milestone breaks routing, transport, stale-request protection, destructive safety, browser/Tauri parity, or another invariant, stop feature expansion and revert only the milestone-owned edits to the last stable checkpoint through a reviewed patch/commit—not a destructive worktree reset.
- Keep prototype `67908d1` available as visual/interaction truth. Compare production against it rather than incrementally normalizing drift.
- After every checkpoint, update the Work Log with commit ID, tests, browser evidence, remaining issues, and the next milestone dependency.
- No milestone may be marked complete on screenshots alone; automated behavior evidence and acceptance criteria are required.

## Production Acceptance Gate

Production integration is complete only when all of the following are checked:

- [ ] Milestones 0-12 and both backend decision gates are resolved, with no ambiguous pending checkbox hidden outside Unfinished Work.
- [ ] Full automated verification matrix passes, or a user-approved environment-only exception is documented.
- [ ] Browser-server and native/Tauri parity scenarios pass on disposable data.
- [ ] Exact 1440x900 and 1280x800 production captures cover all routes and critical interaction states.
- [ ] `design-qa.md` reports no open P0/P1/P2 issues and links to final production evidence.
- [ ] Routing, `latest.current`, async cancellation/stale-response protection, loading truth, Delete Check, filters, Tasks, and transport invariants are explicitly re-audited.
- [ ] Production source has no imports from redesign prototype/mock files and no hidden backend contract additions.
- [ ] User reviews the final production screenshots/behavior and explicitly approves the implementation.
- [ ] Final checkpoint `checkpoint :: complete dark redesign integration` is clean and recoverable.

# Learning Log

- 2026-07-11 20:05 - User explicitly split the redesign into an approval-first prototype phase and a later production integration phase. Do not wire prototype components into the real application before approval.
- 2026-07-11 20:05 - The reference is valuable for its dark visual language, density, border hierarchy, and compact segmented controls; file-census must retain its operational product model rather than inheriting the reference site's marketing structure.
- 2026-07-11 20:09 - The current `preview.html` entry is backend-free and excluded from the production Vite build. It is the correct isolation boundary for approval mockups.
- 2026-07-11 20:09 - Prototype anatomy: 224px navigation rail, 48px route bar, 44px workspace controls, dense 32px result rows, optional inspector pane, and neutral near-black tokens with sparse semantic color.
- 2026-07-11 20:09 - The in-app browser runtime initialized in the source thread but did not expose the `iab` backend; only Chrome was registered. The successor thread must reconnect and validate the in-app browser before screenshot QA.
- 2026-07-11 20:15 - The successor thread successfully connected to the `iab` backend and verified tab navigation, DOM inspection, viewport screenshot capture, and console-log reads against the real component preview. No Chrome fallback is needed.
- 2026-07-11 20:19 - The prototype will use three exact full-screen preview routes: `#/redesign/location-scan-browser`, `#/redesign/duplicates`, and `#/redesign/tasks`. Full-screen rendering must bypass the component-preview navigation frame while preserving all existing preview routes.
- 2026-07-11 20:19 - Measured reference tokens are `#09090b` canvas, `#18181b` subtle surface, `#27272a` selected/control surface, `#202024` structural rules, `#fafafa` primary text, `#a1a1aa` secondary text, and `#71717a` tertiary text. Use 1px dividers, 32px result rows, 6px control radii, no gradients, and no visible shadows.
- 2026-07-11 20:19 - Prototype interactions must preserve product semantics: one scan mode row, explicit query commits, collapsed advanced filters, representative duplicate scope by default, Tasks as the global activity destination, and Stop transitioning to `stopping` without optimistic removal.
- 2026-07-11 20:54 - Browser QA found and fixed approval-blocking layout and interaction defects: conditional Duplicates grid rows, compact inspector access, stale filtered detail, staged scope semantics, task action clipping, inert filters, low-contrast metadata, incomplete accessibility semantics, and sparse mock state.
- 2026-07-11 20:54 - User feedback identified a tree-alignment defect. File-tree headings and expandable rows now share fixed toggle, icon, and name columns, so the disclosure control no longer shifts folder names.
- 2026-07-11 20:54 - Final design QA passed with exact 1440x900 and 1280x800 captures, an additional 1280x800 open-drawer state, zero console errors, and independent visual/responsive reviews reporting no remaining P0/P1/P2 findings.
- 2026-07-11 21:14 - A user screenshot exposed the remaining context-tree defect: the prototype's label button inherited global `justify-content: center`, so rows without right-side counts centered their icon/name while counted rows happened to look left-aligned. The scoped `.loc-tree-label` now explicitly uses `justify-content: flex-start`; a structure test guards the override.
- 2026-07-11 21:20 - The apparent browser-policy blocker was recoverable: the preview server had stopped and the controlled tab had become a connection-error `data:` document whose outbound navigation was correctly denied. Restarting Vite and opening a fresh in-app tab restored supported local preview capture without using Chrome or another browser surface.
- 2026-07-11 21:20 - Post-fix DOM measurements confirm `justify-content: flex-start`; same-depth context-tree rows align their folder icons at x=265 and labels at x=285 at the constrained viewport. Exact 1440x900 and 1280x800 captures show the centering defect is gone with zero console errors.
- 2026-07-11 21:37 - Cmd-K should be a single adaptive global entry point: Current context first, then Locations, Navigation, and View/Menu commands. Destructive deletion does not belong in the root palette; stage files through Delete Check instead.
- 2026-07-11 21:37 - Product-model correction from the user: scans are per-location. The scan browser's context tree must project `scan.locationId` to one location rather than mapping the global locations collection beneath a scan.
- 2026-07-11 22:13 - Final ownership boundary: the sidebar answers which location and scan; the route bar describes only the active scan; the main left pane answers which folder inside that scan; the breadcrumb is scan-relative; and the table answers which files. This removes duplicated location/scan trees while preserving operational context.
- 2026-07-11 22:13 - Cmd-K is context-honest: commands use the currently visible file/group/task, scan switches replace the mock inventory, exact-duplicate navigation carries a clearable intent, task actions respect status/cancellability, and Delete Check staging resets when the scan changes.
- 2026-07-11 22:13 - Final visual contract: 620px compact dialog, dim-only backdrop, one-pixel focus-within ring, explicit `#27272a` selected result fill, 36px command rows, Lucide icons, no gradients or shadows, and correct constrained-width behavior.
- 2026-07-11 22:20 - The user approved moving from the isolated prototype into full production integration and asked that completion become an actively maintained goal. Commit `67908d1` is the immutable approved prototype baseline and rollback point.
- 2026-07-11 22:21 - Production architecture audit confirms the visual migration must preserve `App.jsx` orchestration, the synchronous `latest.current` mirror, browser/Tauri route duality, request cancellation and stale-response guards, scoped loading states, event-driven refresh, and the existing transport boundary.
- 2026-07-11 22:22 - Component ownership audit confirms the safest migration sequence is primitives -> Shell -> route surfaces -> cross-route modals/menus -> parity QA. Prototype JSX/CSS/mock data remain reference-only and must not become production dependencies.
- 2026-07-11 22:23 - Verification audit distinguishes isolated Vite component previews from the compiled browser-server product and native/Tauri runtime. Final approval requires all three where applicable, exact dual-viewport production captures, and disposable fixture data for destructive flows.
- 2026-07-11 22:24 - Exact duplicate lookup and task history are explicit backend decision gates. The UI must first characterize existing RPC/data truth; backend or schema changes are not assumed as part of the visual redesign.
- 2026-07-12 10:20 - User clarified that the approved prototype is not merely a visual reference: its component hierarchy, pane geometry, compact control bands, and command workflow are the direct production source contract. Port/copy that code into production-owned components and replace mock inputs only with existing real state/callbacks; do not approximate the layout through incremental restyling or import prototype modules at runtime.
- 2026-07-12 13:29 - Full-workspace validation exposed a pre-existing test-fixture mismatch after the `file_metadata_refs` foreign-key migration: the bounded EXIF worker-pool test created candidates without matching `files` rows. The test now seeds the matching rows before EXIF persistence, preserving the production FK invariant and the concurrency assertion. This is validation debt discovered during redesign verification, not a redesign transport-contract change.
- 2026-07-12 13:29 - Centralized dialog migration is intentionally API-compatible: every modal now uses semantic dialog/focus/scroll behavior, but Escape only delegates through existing `onClose`/cancel flows. This avoids silently inventing cancellation behavior for forms that currently have no close callback while still making destructive confirmations keyboard-complete.
- 2026-07-12 13:29 - Rich browser QA must use only disposable sources: two separately scanned locations provide cross-location duplicates and safe/unsafe Delete Check evidence; a nested source provides truthful tree/search data; and an API-started sparse-file scan is required for real server-owned pause/resume/stop Tasks transitions. Local synchronous CLI scans do not populate the running server task store.
- 2026-07-12 18:40 - User correction: folder/context navigation is a directory-only information architecture, not a mixed file listing. Preserve the raw mixed lazy-tree cache for the main FileGrid/File tree and derive a separate recursive directory projection at every navigation boundary; never invent a “Root files” pseudo-folder.
- 2026-07-12 18:40 - Tree depth must resolve to concrete pixel values before CSS layout. Custom-property multiplication in `calc()` is not a reliable cross-browser indentation mechanism; use a resolved `--tree-indent` length so disclosure, icon, and name slots remain aligned at every depth.
- 2026-07-14 10:55 - Live task identity is UUID-scoped, not kind-scoped. A `tasks.active` snapshot and incoming events must retain concurrent same-kind jobs; unknown backend timestamps remain null/unknown rather than client-fabricated.
- 2026-07-14 11:12 - Task detail receives the global in-memory event log, not a task-filtered stream. Its copy must say current app-session events for all tasks, and the Tasks filter must not expose unsupported finished-history state.
- 2026-07-14 11:12 - The local Nix-built macOS bundle cannot use hardened runtime with an ad-hoc signature because macOS rejects the Nix `libiconv` dependency under library validation. Keep ad-hoc local packaging with `hardenedRuntime: false`; a future Developer-ID/notarized distribution must use a separately provisioned signed dependency chain rather than treating this local setting as release distribution security.
- 2026-07-15 01:40 - Real event-lag proof must pause the upstream WebSocket socket before frames are read, not hold frames after the proxy has already drained them. A QA-only control may report only bounded event-kind/count evidence and must leave the real frame bytes untouched; the browser still owns proof of the production recovery behavior.
- 2026-07-15 01:40 - Performance validation is not complete when host storage interrupts the SQLite/fixture phase. Preserve the prior complete run as historical, record the partial fresh run honestly, and wait for capacity or explicit cleanup authorization rather than deleting local artifacts by assumption.
- 2026-07-15 01:45 - Once capacity is available, rerun the exact full performance command rather than accepting a partial result. A later 10/10 pass is valid only when it records fresh current-source timings and does not rely on a cleanup action that was never authorized.

# Work Log

- [x] 2026-07-11 20:05 - Created branch `redesign/shadcn-dark-shell` from clean `main` at `d991b11`.
- [x] 2026-07-11 20:05 - Started the approval-first redesign plan and dispatched parallel architecture, dependency, and reference-design audits.
- [x] 2026-07-11 20:09 - Preserved the supplied reference image under `ui/design-references/` and recorded the isolated preview architecture.
- [x] 2026-07-11 20:15 - Recovered the source thread history, confirmed `redesign/shadcn-dark-shell` at `47615d2`, and validated the in-app browser against `preview.html` with zero console errors.
- [x] 2026-07-11 20:19 - Completed preview-architecture, visual-reference, and workflow-content audits; fixed the route, token, layout, mock-data, and interaction contracts for implementation.
- [x] 2026-07-11 20:54 - Built all three isolated workflows, passed 146 UI tests and the production UI build, completed interaction checks, fixed P0/P1/P2 QA findings, and preserved the production approval boundary.
- [x] 2026-07-11 20:55 - Prepared the final approval screenshot set and stopped before any production integration.
- [x] 2026-07-11 21:14 - Corrected inherited centering in context-tree labels from user screenshot evidence; all 146 UI tests and the production UI build pass.
- [x] 2026-07-11 21:20 - Restarted the stopped preview server, recovered the in-app browser through a fresh tab, captured exact 1440x900 and 1280x800 post-fix evidence, and returned design QA to passed.
- [x] 2026-07-11 22:13 - Built the shared Cmd-K prototype, corrected the scan/location ownership model, verified scan-specific mock inventories and contextual actions, passed 152 UI tests plus the production UI build, captured exact approval evidence, and cleared final code/visual QA with no P0/P1/P2 findings.
- [x] 2026-07-11 22:20 - Received explicit user approval for full production integration and set `67908d1` as the immutable prototype baseline.
- [x] 2026-07-11 22:21 - Consolidated architecture, component ownership, route/state, transport, async-correctness, accessibility, and verification audit findings into production invariants.
- [x] 2026-07-11 22:24 - Drafted the exhaustive milestones 0-12, backend decision gates, automated/native/browser matrices, fixture safety rules, rollback discipline, and production acceptance gate; production milestone execution remains pending.
- [x] 2026-07-11 22:35 - Checkpointed the exhaustive production plan before Milestone 0 source changes as `317283e`; no production source edits had started at that checkpoint.
- [ ] 2026-07-12 00:53 - Convert the completed architecture audit into Milestone 0 characterization tests and baseline evidence, then begin the isolated production-primitives migration.
- [x] 2026-07-12 01:12 - Added scan ownership and production/prototype-isolation guards, including authoritative `scan.location_slug` selection; focused tests passed (7/7).
- [x] 2026-07-12 01:19 - Ported dark production tokens and shared primitive/class layers; removed light table tokens, gradients, and decorative surface shadows while preserving FileGrid's fixed tree columns. Full UI tests passed (156/156); production Vite build passed.
- [x] 2026-07-12 01:25 - Visually reviewed component previews in the in-app browser at 1440x900 and 1280x800; progress and numeric tree previews are dark, compact, aligned, and emitted no console warnings or errors.
- [x] 2026-07-12 01:27 - Checkpointed the production primitives and Milestone 0 ownership guards as `5945f34`; next dependency is the shared shell migration.
- [x] 2026-07-12 01:35 - Migrated the real Shell’s route context and sidebar density without changing navigation/state callbacks; added Shell structure coverage. Full UI tests passed (158/158), production Vite build passed, and the 1280px sidebar preview had zero console warnings/errors.
- [x] 2026-07-12 01:36 - Checkpointed the shared-shell context and duplicate-reduction slice as `ad0965e`; next implementation slice is Dashboard and Locations overview composition.
- [x] 2026-07-12 01:42 - Migrated Dashboard to compact aggregate metrics, three active-work rows, and five recent-event rows; removed the duplicate location/latest-scan roster. Full UI tests passed (160/160); browser production capture remains queued with the populated fixture milestone.
- [x] 2026-07-12 01:43 - Checkpointed the Dashboard page migration as `27999a4`; Locations overview implementation remains in progress under the single-sidebar ownership model.
- [x] 2026-07-12 01:49 - Reworked Locations overview into compact root/connection/scan/activity metadata and read-only scan facts; removed duplicate in-page Scan now and Open scan controls while preserving empty/loading/notes/FileExplorer contracts. Full UI tests passed (162/162); build passed.
- [x] 2026-07-12 01:50 - Checkpointed the Locations overview migration as `3ba5148`; next critical product surface is the scan File Results Workspace.
- [x] 2026-07-12 02:02 - User rejected the live FileExplorer capture as a dark reskin of the legacy toolbar/panel stack rather than the approved shadcn workspace. Replaced it with the approved spatial hierarchy: compact shell, scan-relative folder context, dense results surface, and responsive inspector treatment.
- [x] 2026-07-12 02:05 - User explicitly directed the team to remove, not cosmetically retain, legacy production UI composition. Preserved state/transport behavior underneath while replacing the workspace card stack, duplicate context, and generic toolbar bands with the approved operational shell/workspace model.
- [x] 2026-07-12 02:14 - Replaced the production scan workspace’s stacked legacy composition with a scan-relative folder context pane, center results surface, responsive inspector, compact path strip, and mode-local Delete Check content. Real browser-server QA on the disposable fixture exposed missing `LocationsPage` empty-state imports; restored `Button` and `Icon` and added structure coverage. The hydrated `/locations/:slug/scans/:id?view=tree` route now renders with zero console warnings/errors at 1440x900 and 1280x800.
- [x] 2026-07-12 02:31 - Tightened production workspace data density after browser evidence: the default Name, Path, Size, Modified, and Kind columns fit together at 1280px without horizontal scrolling; the inspector now auto-opens only on very-wide viewports so it cannot hide a required default column at 1440px. Full UI suite passed (166/166), production Vite and embedded browser-server builds passed, and both 1440x900 and 1280x800 fixture captures emitted zero console warnings/errors.
- [x] 2026-07-12 10:20 - Re-opened and captured the approved 1440x900 Location/Scan Browser, Duplicates, and Tasks prototype routes in the in-app browser after the user requested the exact reference again. Reoriented the remaining production work from incremental visual translation to direct production-owned ports of the approved prototype component contracts, with only mock data/actions replaced by existing real application state and callbacks.
- [x] 2026-07-12 10:34 - Ported the prototype Tasks queue/detail/events hierarchy into the production-owned TasksPage using real running scans, background tasks, pools, events, and existing pause/resume/stop callbacks. Focused Tasks tests and production UI build passed. Captured the populated production-component preview at 1440x900; it matches the prototype’s route bar, controls, 360px queue, selected detail surface, worker/event split, and footer model.
- [x] 2026-07-12 10:36 - Ported the prototype Duplicates route/control/summary/results hierarchy into production-owned DuplicatesPage while retaining real duplicate rows, scope selection, filters, view mode, loading/empty states, and inspection. Focused/full UI tests, diff check, and production build passed before integration QA.
- [x] 2026-07-12 10:38 - Added a production-owned Cmd-K palette with no prototype runtime import. It is wired to actual navigation, locations/scans, safe scan actions, visible-file actions, current view commands, and existing callbacks; destructive deletion remains intentionally absent from the root palette. Focused tests, full UI suite (175), diff check, and production build passed before integration QA.
- [x] 2026-07-12 11:12 - Strengthened the active acceptance contract at the user's direction: exact prototype visual match is now a release-blocking condition with no test-only or partial-reskin exceptions. Reworked the real browser-server scan route to the prototype's measured 224px rail, 48px route bar, 44px controls, 32px path strip, 248px folder pane, 320px inspector, viewport-filling workspace, and visible Name/Path/Size/Modified/Kind defaults. Repeated embedded builds and browser screenshots until those measured geometry values matched the approved prototype and console output was clean. Remaining route coverage and final design QA are still required.
- [x] 2026-07-12 11:34 - Ported the production sidebar to the approved prototype hierarchy: 224px compact brand, dense navigation, rail-local Cmd-K, real location/scan tree, real live-work footer, and Help/Options footer. Kept Dashboard/Search and Add Location reachable. Preserved collapse/peek, responsive overlay, persisted width, and pointer/keyboard resize behavior; browser-server QA exercised the new rail-local Collapse sidebar control with zero console warnings/errors.
- [x] 2026-07-12 11:46 - Moved Cmd-K at the user's direction from the sidebar into the main UI top bar. The normal shared header and the scan workspace route bar now open the same production-owned palette through a scoped context bridge; keyboard Cmd/Ctrl+K behavior is unchanged. Sidebar remains fully collapsible through its rail-local control.
- [x] 2026-07-12 11:55 - Reworked the production Locations overview into a continuous source surface while retaining real source facts, quiet notes, loading/empty/disconnected states, and action paths. Full UI suite passed (178/178), production build passed, and browser-server QA confirmed the top-bar Cmd-K trigger opens the real command dialog with zero console warnings/errors.
- [x] 2026-07-12 12:03 - Ported production Search to the approved continuous workspace model: 48px route header, compact controls/status, scope popover, and full results canvas. Preserved committed query/filter behavior, URL state, real scope callbacks, flat/tree results, FileGrid interaction, and ordered columns. Full UI suite passed (179/179), build and diff check passed; browser-server visual QA remains queued with the cross-route pass.
- [x] 2026-07-12 13:30 - Synced the plan with integrated progress, created `GOALS.md` as the repo-level finish contract, and created the active thread goal explicitly requiring completion of every production, behavior, visual-QA, native, and user-approval gate. The goal is intentionally not eligible for closure until that exhaustive evidence exists.
- [x] 2026-07-12 13:29 - Reproduced and fixed the full-workspace Rust-test blocker in the bounded EXIF worker-pool fixture by inserting synthetic file records that satisfy the persisted metadata-reference foreign key. The focused backend test passes; full workspace and native validation remain in progress.
- [x] 2026-07-12 13:29 - Reconnected the in-app browser to the freshly compiled browser-server process and captured the production scan workspace plus Cmd-K at exactly 1440x900 and the scan workspace at exactly 1280x800 using only the disposable fixture database. The captures show the prototype-owned pane geometry, top-bar Cmd-K, and single-location scan tree with zero browser console warnings/errors. Cross-route state coverage remains open.
- [x] 2026-07-12 13:29 - Full Rust workspace validation passes after the EXIF fixture repair (94 backend unit, 21 CLI integration, and 2 native-app tests; 10 explicit performance gates intentionally ignored). `just desktop-check` also passes with a fresh embedded Vite build and native-app compile. Tauri packaging started but remains pending while its original runner holds the artifact lock; do not treat native bundle coverage as complete.
- [ ] 2026-07-12 13:29 - Complete the centralized modal and menu accessibility/visual migration, then port remaining Options, notification, Columns, and Dashboard legacy presentation surfaces onto those primitives before the next cross-route evidence pass.
- [x] 2026-07-12 13:29 - Replaced the shared modal overlay/dialog foundation with a compact neutral dark dialog, semantic labelling, focus trap/restoration, cleanup-safe scroll lock, and compatible Escape handling for existing cancellation flows. Focused structure tests pass (6/6); menu migration remains in progress.
- [x] 2026-07-12 13:29 - Upgraded the shared Menu primitive without breaking consumer APIs: trigger Arrow opening, roving Arrow/Home/End navigation, Escape/selection focus restoration, and disabled-item semantics now apply to existing route/action menus. Focused tests pass (3/3), and the integrated UI suite passes (185/185); the separate Columns popup still needs adoption of the primitive.
- [x] 2026-07-12 13:29 - Corrected the real 1280px scan-workspace density issue from browser evidence: the inspector now defaults to the 320px third pane only at >=1360px; below that it is a 360px dismissible overlay, leaving the 248px folder pane and readable table intact. Focused FileExplorer tests (6/6) and the embedded production build pass; final in-app-browser recapture remains required from the primary browser binding.
- [x] 2026-07-12 13:29 - Ported Options from the legacy stacked-card settings form to the compact continuous operational workspace: route header, divided database row, worker-pool strip, dense Metadata/Hashing rows, and action footer. Existing chooser, worker draft normalization, bounds, reset/save, busy state, and browser/native capability semantics are unchanged. Focused Options tests pass (4/4); full integration/browser verification remains queued.
- [x] 2026-07-12 13:29 - Replaced Dashboard's remaining card/grid composition with one dense operational workspace: compact context header, continuous metric strip, active-work pane, and recent-activity pane. Aggregate values, active filtering/statuses, and bounded activity semantics remain unchanged. Focused Dashboard tests pass (2/2); compiled browser evidence remains queued.
- [x] 2026-07-12 13:29 - Replaced the FileExplorer raw Columns popup with the shared controlled Menu primitive and checkbox menu items. Name-column locking, column visibility/order callbacks, multi-toggle behavior, and outside/Escape closure are preserved. Focused FileExplorer tests pass (7/7); browser keyboard verification remains queued.
- [x] 2026-07-12 13:44 - Created disposable backend-backed QA sources and scanned them through the production CLI: two representative locations produce one verified exact `(blake3,size,file_kind)` duplicate group with two occurrences, while a separate nested source provides real multi-depth tree/search data. Captured populated production Duplicates flat/tree at 1440x900 with zero console warnings/errors. Delete Check route is hydrated against the representative fixture scan; interaction-state captures remain open.
- [x] 2026-07-12 13:48 - Replaced destructive scan excludes with a non-destructive per-scan visibility contract. Raw `files` are retained by both sync and async scanners; materialized excluded paths drive `visible_files`, which all scan query surfaces use (tree/files/search/occurrences/duplicates/cache/Delete Check/metadata candidates). Update/repair copies rematerialize filters, duplicate cache is invalidated, explicit delete remains raw, and modal copy states that patterns hide rather than remove records. Focused backend sync/async regression tests, exclusion tests, UI copy tests, and formatter pass; full matrix/browser proof remains required.
- [x] 2026-07-12 13:52 - Replaced the final stale scanner assertion that expected exclusion pruning with retained-row/hidden-query/clear-restores coverage. Full backend suite now passes (96 unit, 21 CLI integration, doc tests; 10 explicit performance gates ignored). The live-scan sidebar runtime import regression is fixed and guarded by Shell structure coverage; rebuild/browser proof remains required.
- [x] 2026-07-12 14:01 - Rebuilt and browser-verified the exclusions and active-sidebar fixes in the compiled server. A real scan filter hid `Projects/Alpha` from the production tree, then clearing the filter restored it with no rescan. A server-owned 8 GiB sparse-fixture scan rendered running and paused Tasks states plus live sidebar progress with zero console errors; resume/stop controls reached the real server and cleared the active task. The stopping state was too brief to capture, so its existing behavior test remains acceptance evidence until a deliberately slowed fixture is added.
- [x] 2026-07-12 17:55 - Replaced the fake scan “trees” identified by user screenshot with an App-owned lazy branch cache: backend tree entries now report exclusion-aware `has_children`; the cache keys scan/path/query/filter context, merges pages, cancels stale branches, and loads only expanded/route-ancestor branches. The Folder pane is now a semantic recursive `ScanFolderTree`; File tree consumes cache-backed nested rows and requests child pages on disclosure. Empty directories have no false chevrons. Focused lazy-tree coverage passes (23); full UI suite passes (201) and production build passes. Browser visual proof is next.
- [x] 2026-07-12 18:02 - Browser-verified true nested folders and File tree using the disposable multi-depth fixture at 1440x900: root → Projects → Alpha → assets expands lazily in both surfaces with fixed disclosure/icon/name alignment and zero console errors. Full backend suite passes (97 unit, 21 CLI integration, doc tests; 10 explicit performance gates ignored) and full UI suite passes (201). Checkpointed all stable integration work as `e216724` (`checkpoint :: production lazy scan trees and non-destructive excludes`).
- [x] 2026-07-12 18:08 - Fresh validation passes: `just desktop-check`, `just build`, and `just perf-gates` (10/10 ignored release gates, 21.25s; sync best 1497ms, tokio best 1221ms). The native bundle now declares Tauri ad-hoc signing (`bundle.macOS.signingIdentity: "-"`); a fresh arm64 `.app` has sealed resources and passes `codesign --verify --deep --strict --verbose=4`. This validates local native packaging, not Developer-ID distribution/notarization.
- [x] 2026-07-12 18:22 - Expanded browser-server evidence on the disposable fixture: populated Search and Duplicates tree modes at both target viewports, direct scan back/forward history, rapid scan-route cancellation, contextual Cmd-K open/Escape, Columns menu open/Escape, compact Options, true off-rail sidebar collapse/restore, and an unsafe Delete Check result. Every exercised tab reported zero console warnings/errors; Delete Check only analyzed fixture paths and did not delete anything.
- [x] 2026-07-12 18:40 - Applied the user-corrected directory-only navigation contract. Production `ScanFolderTree` now consumes an immutable recursive directory projection while the raw mixed branch cache continues to feed FileGrid; folder-pane heading/footer counts are no longer mixed entry totals. Added root/nested-file and paginated-branch regression coverage without changing RPC, transport, or backend behavior.
- [x] 2026-07-12 18:40 - Rebuilt the isolated Location/Scan Browser side pane as a real recursive Scan-root directory tree with no file leaves or “Root files” bucket, and kept file leaves exclusively in its central File tree. Resolved the remaining P1 visually-flat tree by using concrete depth indentation and a tight disclosure focus treatment.
- [x] 2026-07-12 18:40 - Verified exact 1440x900 and 1280x800 prototype plus production browser-server captures against only `/tmp/file-census-redesign-fixture.sqlite`: root-only `scene-live.txt` is absent from the side folder tree and present in Files; nested `scene-001.mov` is absent from the side tree and present only in main File tree. Browser console warning/error logs are empty. Full UI suite passes (209/209) and the final production Vite build passes.
- [x] 2026-07-14 10:42 - Checkpointed the verified active-task, non-destructive-excludes, lazy-tree, and directory-only-navigation milestone as `7aa426d` (`checkpoint :: directory-only navigation and task truth`). Remaining acceptance work is limited to the explicit unfinished task/session, native parity, and final product-wide gates below.
- [x] 2026-07-14 10:49 - Initialized `agent-plans/workqueue.yaml` as the durable acceptance graph. The verified directory-navigation contract is succeeded; active-task identity/timestamp truth and current-session labels are claimed first, with native database-switch, reconnect, route-state, destructive-fixture, validation, visual-QA, and explicit approval gates queued behind their evidence prerequisites.
- [x] 2026-07-14 10:52 - Finished the session-history wording slice: Dashboard and selected Task detail now explicitly say current app-session activity, the global event stream is no longer misattributed to the selected task, and the unsupported finished-history filter is removed. Focused UI tests pass (4/4) and the full UI suite passes (210/210); live/native task-session evidence remains queued.
- [x] 2026-07-14 10:55 - Finished active live-task projection integrity: refresh snapshots dedupe background tasks by UUID, live same-kind task starts no longer evict each other, and missing backend `started_at` remains unknown rather than fabricated. Focused App helper regressions pass (9/9) and the full UI suite passes (210/210). Native A-to-B switch coverage and browser reconnect evidence are now active queue work.
- [x] 2026-07-14 11:12 - Closed the task-session/native evidence slice on disposable paths. Browser-server Tasks displayed a real running scan, retained it through Refresh, rendered paused/resume state, then cleared it on server restart while the database recovered the scan as interrupted; Cmd-K showed no invented task history and browser logs were empty. Native tests cover successful idle A→B state replacement plus failed-target preservation (9/9), and the rebuilt source Tauri bundle launched in an isolated home, switched populated A to empty B/C through the real chooser, then accepted a B-side location and live scan event. The local bundle now sets `hardenedRuntime: false` to load its Nix dependency; `codesign --verify --deep --strict --verbose=4` passes.
- [x] 2026-07-14 11:18 - Completed the explicit automated validation matrix after the task/native changes: `git diff --check`; 210 UI tests; 101 backend, 21 CLI, and 9 native Rust tests; `just desktop-check`; all 10 explicit performance gates (sync best 1275ms, Tokio best 1221ms); and source-bundle codesign verification all pass. The workspace perf target intentionally reports its 10 gates ignored; `just perf-gates` executes them successfully.
- [x] 2026-07-14 11:23 - Direct prototype audit reopened visual implementation work before final acceptance: production File tree still routes through a generic data table, Duplicates lacks its selected-group inspector, and several non-scan routes retain inset-card/raised-grid legacy treatment. These are now explicit queue-owned P1 ports, not screenshot exceptions.
- [x] 2026-07-14 11:34 - In-app-browser preview QA caught a File-tree port compatibility regression before acceptance: `expandedPaths` can be a `Set`, while the first row projection assumed an array. The real rendered state, full UI suite, and clean-console screenshots subsequently passed before the port was accepted.
- [x] 2026-07-14 11:54 - Kept the new durable workqueue current: added a separate `post-port-validation-matrix` (rather than reopening historical validation), made it depend on the File-tree, Duplicates-inspector, and shell parity ports, and made final visual acceptance depend on it. The graph now has 16 unique, acyclic tasks; browser work remains serialized through the in-app-browser resource.
- [x] 2026-07-14 11:55 - Landed the implementation-side operational-shell parity changes: one 48px global Cmd-K bar, no redundant local route headers, full-bleed neutral canvases, flatter dense grids/tabs, no elevated primary overlays, and real Duplicates/File-tree workspace ports. Initial compiled browser-server evidence at both 1440x900 and 1280x800 is clean; the three P1 queue claims remain open until a fresh post-notification build proves their full interaction matrices.
- [x] 2026-07-14 11:56 - Fixed repeated-identical notification delivery without changing transport ownership: `App` now emits monotonically keyed transient-message events and `NotificationLayer` consumes the event ID instead of permanently de-duping text. Focused notification coverage passes (4/4), full UI tests pass (217/217), production UI build and `git diff --check` pass. Browser dismissal/expiry/repeat proof remains a required overlay-matrix scenario.
- [x] 2026-07-14 12:22 - Closed `file-row-selection-cmdk-context` on the compiled fixture server: Files rows now establish compact visible selection context without restoring permanent utility columns; Cmd/Ctrl toggling, Enter selection, optional Selection/Actions Columns toggles, current-file Cmd-K actions, and zero console warnings/errors were verified in the in-app browser. Added nonvisual `aria-keyshortcuts="Enter Space"` plus standard Space-code handling; UI suite passes (218/218), `npm --prefix ui run build`, and `git diff --check` pass. Captured `/tmp/file-census-selection-cmdk-1280x800-final.png` and `/tmp/file-census-selection-cmdk-1440x900-final.png`.
- [x] 2026-07-14 12:27 - Closed `file-tree-workspace-port` after correcting the user-reported disclosure-indent defect in both production and the retained prototype: fixed leading grid tracks plus depth-aware left padding make disclosure, icon, and name indent as one unit at every level. Compiled QA Tree proof expanded `Projects -> Alpha -> assets`, kept files exclusively in the main workspace while the adjacent navigator stayed directory-only, selected a deep file, invoked safe Delete Check staging, and cleared it without a delete. UI suite passes (218/218), production UI build and `git diff --check` pass; console warning/error log is empty. Captured `/tmp/file-census-file-tree-deep-1440x900-aligned.png`, `/tmp/file-census-file-tree-deep-1280x800-aligned.png`, and the aligned component-preview reference.
- [x] 2026-07-14 12:42 - Closed `duplicates-inspector-workspace-port` after rebuilding the embedded production server from the Cmd-K safety guard. The real Duplicates workspace expands `shared.txt`, retains a selected occurrence and persistent inspector, opens the real two-copy File info dialog, and safely stages that occurrence in its owning scan's Delete Check without routing away from Duplicates. Cmd-K exposes only Current file actions (no stale Location/scan actions), and the compiled app reports zero console logs at both 1280x800 and 1440x900. UI suite passes (221/221), `npm --prefix ui run build`, `nix develop -c cargo build -p file-census-backend`, and `git diff --check` pass. Captured `/tmp/file-census-duplicates-tree-1280x800-final.png`, `/tmp/file-census-duplicates-tree-1440x900-final.png`, `/tmp/file-census-duplicates-cmdk-1280x800-final.png`, and `/tmp/file-census-duplicates-cmdk-1440x900-final.png`.
- [x] 2026-07-14 13:00 - Closed the shared-shell sidebar P1 without closing the route-wide shell port: persisted desktop collapse now removes the sidebar from grid flow, pins the main workspace to the peek-rail remainder, and suppresses passive re-peek after the Collapse click. Only explicit hover-zone/focus/click requests reopen the rail. Fresh compiled 1440x900 and 1280x800 captures confirm the narrow rail plus full workspace, persistence through reload, expanded recovery, and zero browser warnings/errors. UI suite passes (224/224), Vite and embedded backend builds pass. Captured `/tmp/file-census-shell-collapsed-1440x900-peek-guarded.png`, `/tmp/file-census-shell-collapsed-1280x800-reload-stable.png`, `/tmp/file-census-shell-expanded-1440x900-final.png`, and `/tmp/file-census-shell-expanded-1280x800-final.png`.
- [x] 2026-07-14 13:08 - Tasks route QA keeps the route-wide shell claim open and adds `tasks-operational-workspace-port`: the truthful empty state is browser-captured at both target sizes, but source audit found a residual legacy page-grid dependency and no selected-task Cmd-K context/action group. The new queue task owns production-only repair plus active/empty browser proof.
- [x] 2026-07-14 13:16 - Populated Search QA adds `search-workspace-toolbar-parity`: compiled `/search?scope=all&q=shared.txt` captures show the right-side scope/view/Columns controls cropping at 1440x900. The new task must preserve all real query/scope/view/Columns behavior and prove flat/tree/overlay states without collision at both target viewports.
- [x] 2026-07-14 13:18 - Closed `search-workspace-toolbar-parity` on the rebuilt embedded browser server. Fresh populated 1440x900 and 1280x800 captures keep query, Advanced filters, scan scope, Flat/Tree, and Columns visible; browser checks exercised those controls, expanded the real Tree result, opened File info at both sizes, and found zero console warning/error logs.
- [x] 2026-07-14 13:18 - Exercised a server-owned disposable `qa-live` scan through real production UI and Cmd-K: running, paused, resumed, and stopped state all traversed the existing JSON-RPC/WebSocket callbacks with no file deletion. The rebuilt Tasks port removes the legacy inset and supplies selected-task Pause/Resume/Stop Cmd-K actions. A real P1 remains: the shared rail showed 82% paused while Tasks showed 0% / 0 of 11 and `1 running`; `tasks-operational-workspace-port` remains claimed for pool-derived progress/status parity.
- [x] 2026-07-14 13:18 - Added `dashboard-options-state-truth` to the durable workqueue after source audit found Dashboard can render raw/stale active-work state and Options can fabricate worker defaults or mislabel a browser-server custom DB. This is implementation work, not a screenshot-only exception.
- [x] 2026-07-14 20:36 - Repaired and browser-proved Tasks’ authoritative live-pool projection on the rebuilt compiled browser server: the sidebar, selected queue row, detail overview, and Cmd-K all rendered the same paused task state and progress (91%, 10/11 work items). Exercised the existing Cmd-K Stop callback only against the disposable `qa-live` scan; it returned to the truthful empty-task workspace without a file action or deletion, and browser warning/error logs were empty. The port stays claimed because a direct prototype audit found remaining semantic-color/danger-control styling work.
- [x] 2026-07-14 20:36 - Repaired implementation-side Dashboard/Options state truth and browser-proved Dashboard’s real paused Active work projection. Targeted structure tests pass (19/19); Options loaded/browser-server, disconnected, and native visual coverage remains queued. The durable graph now contains explicit `shared-surface-prototype-parity` and `task-status-semantic-parity` work instead of leaving visual audit findings informal.
- [x] 2026-07-14 20:58 - Synced the durable workqueue after the shared parity passes. `shared-surface-prototype-parity`, `filter-disclosure-prototype-parity`, `task-status-semantic-parity`, and `tasks-operational-workspace-port` are succeeded with 239/239 UI tests, production builds, target-size captures, and clean browser logs. A real disposable QA Live Task was resumed through Cmd-K and paused again through the existing production callback, proving the palette is a dispatch layer rather than a mock menu.
- [x] 2026-07-14 20:58 - User-visible tree P1 remains active as `directory-tree-geometry-parity`: side directory navigation and main File tree must align disclosure/icon/name units at every depth while preserving directory-only side navigation and independent real lazy tree behavior. The workqueue now has 24 unique, acyclic tasks (15 succeeded, 4 claimed, 5 open).
- [x] 2026-07-14 21:04 - Closed `directory-tree-geometry-parity` on the rebuilt compiled production server. The side directory navigator now follows its exact compact 13px-per-depth prototype rhythm (24px disclosure slot, 14px glyph, 6px label gap), while the File tree intentionally keeps its distinct 14px-per-depth workspace grid. Real QA Tree expansion reached `Projects -> Alpha -> assets` at 1440x900 and 1280x800; the side pane contained directories only and `scene-001.mov` appeared only in the main File tree. UI suite passes (241/241), Vite and embedded-backend builds pass, browser warnings/errors are empty, and `/tmp/file-census-tree-geometry-1440x900-fixed.png` plus `/tmp/file-census-tree-geometry-1280x800-fixed.png` are the user-visible evidence. The durable graph is now 24 unique acyclic tasks (16 succeeded, 3 claimed, 5 open).
- [x] 2026-07-14 21:06 - Overlay/matrix source audit found an acceptance-blocking P1, so `overlay-accessibility-parity` was added and claimed rather than letting visual QA mask it: non-confirm AppModals lack visible-heading dialog names, the Duplicates scope dialog lacks Escape/outside-click/focus restoration, a nested occurrence menu's Escape closes its parent File-info dialog, and Cmd/Ctrl+K can stack the palette above an open modal. The durable graph is now 25 unique acyclic tasks (16 succeeded, 4 claimed, 5 open); focused source repair and compiled browser proof are required before the overlay matrix.
- [x] 2026-07-14 21:08 - Independent Dashboard/Options audit found the original source P1s remain resolved: Dashboard consumes the active-task live projection and has distinct state surfaces, while Options gates editing on authoritative settings and preserves truthful browser-server/native database ownership. No extra implementation task was added; `dashboard-options-state-truth` remains claimed only for compiled loading/failure/disconnect/native evidence through an external real-transport fault/delay harness, never a production mock.
- [x] 2026-07-14 21:10 - Captured compiled browser-server partial evidence at both approval viewports: Dashboard's truthful empty state (`/tmp/file-census-dashboard-empty-1440x900.png`, `/tmp/file-census-dashboard-empty-1280x800.png`) and Options' loaded server-managed database/settings state (`/tmp/file-census-options-loaded-1440x900.png`, `/tmp/file-census-options-loaded-1280x800.png`). These are user-visible progress captures, not closure: deterministic loading/failure/disconnect and native chooser/save coverage remain claimed.
- [x] 2026-07-14 21:11 - Per the `$Agent_Workqueue` recovery contract, rechecked and explicitly recovered the stale `dashboard-options-state-truth` claim after its source-audit executor completed. Its sole prerequisite is succeeded, no downstream task was unlocked, and root owns attempt 2 only for the still-required external real-transport/browser/native matrix.
- [x] 2026-07-14 21:17 - Closed `overlay-accessibility-parity` end to end. The source repair names every non-confirm AppModal, gives Duplicates scope a focus-restoring Escape/outside-dismissal contract, makes nested menus consume the first Escape before their parent dialog, blocks Cmd/Ctrl+K while an `aria-modal` dialog is present, and fixes shared menus into viewport-clamped placement outside scroll clipping. Independent source work plus integrated 244/244 UI tests, Vite build, embedded-backend build, and compiled in-app-browser interaction proof all pass. At 1440x900 and 1280x800, real Duplicates scope, File info, and occurrence actions exercised scope Escape/outside click/Cmd-K handoff, modal Cmd-K suppression, nested menu then dialog Escape order, and zero console warnings/errors. Captured `/tmp/file-census-duplicates-scope-1440x900-overlay.png`, `/tmp/file-census-duplicates-scope-1280x800-overlay.png`, `/tmp/file-census-file-info-menu-1440x900-overlay.png`, and `/tmp/file-census-file-info-menu-1280x800-overlay.png`. The graph is now 25 tasks (17 succeeded, 3 claimed, 5 open).
- [x] 2026-07-14 21:18 - Checkpointed the verified integrated tree and overlay milestone as `d2e192b` (`checkpoint :: production tree and overlay parity`). The checkpoint includes the production workspace ports, exact tree geometry, overlay accessibility/collision repair, current queue/plan/QA evidence, and no prototype-only dependency.
- [x] 2026-07-14 21:20 - Queue-coordinated `destructive-fixture-matrix` is now claimed after its two safety prerequisites succeeded. Root will use only QA Delete A at `/tmp/file-census-redesign-qa/delete-a`, stage Include in Delete Check, inspect/cancel confirmations, and verify retained files/rows; no delete/remove/exclude/confirm action is authorized in this matrix.
- [x] 2026-07-14 21:24 - Closed `destructive-fixture-matrix` safely on compiled QA Delete A at both target viewports. `evidence/shared.txt` was selected, explicitly locally included through the row action, Delete Check reported it as a candidate present in another location, and the local set was cleared. The disposable scan’s Delete scan confirmation was opened only to inspect copy/focus and closed with Escape; it was never confirmed. Temporary Actions column and selection state were restored, browser rows still showed `shared.txt` and `unique.txt`, source files remained 16 and 7 bytes respectively, and browser warning/error logs were empty. Captured `/tmp/file-census-delete-check-safe-1440x900.png`, `/tmp/file-census-delete-check-safe-1280x800.png`, `/tmp/file-census-delete-check-staged-1440x900.png`, `/tmp/file-census-delete-check-staged-1280x800.png`, `/tmp/file-census-delete-scan-confirmation-1440x900.png`, and `/tmp/file-census-delete-scan-confirmation-1280x800.png`. The graph is now 25 tasks (18 succeeded, 3 claimed, 4 open).
- [x] 2026-07-14 21:31 - Added real transport evidence without altering production behavior: stopped only the verified disposable `file-census-redesign-fixture.sqlite` server, captured Dashboard’s disconnected state, restarted the identical fixture command, and captured authoritative idle recovery. Both 1440x900 and 1280x800 screenshots are user-visible at `/tmp/file-census-dashboard-disconnected-1440x900.png`, `/tmp/file-census-dashboard-disconnected-1280x800.png`, `/tmp/file-census-dashboard-reconnected-1440x900.png`, and `/tmp/file-census-dashboard-reconnected-1280x800.png`; console warnings/errors stayed empty. `dashboard-options-state-truth` remains claimed for initial loading, worker-settings failure, and native Options evidence.
- [x] 2026-07-14 21:33 - Added and closed `qa-transport-fault-harness` as the narrow, QA-only solution to deterministic Dashboard/Options loading and `settings.worker_counts.get` failure evidence. It transparently proxies only a fresh disposable browser-server fixture and is never imported, exposed, or conditionally executed by production code. Its Node-core self-test passes; real fresh-session Dashboard/Options loading and Options worker-settings unavailable states were captured at both approval sizes with zero console warnings/errors. Exact temporary proxy/fixture PIDs were stopped after capture. The graph now has 26 unique, acyclic tasks (19 succeeded, 3 claimed, 4 open); `dashboard-options-state-truth` remains independently claimed until its browser/native evidence closes.
- [x] 2026-07-14 21:36 - Captured real production Options disconnect/recovery proof on the same disposable fixture, at 1440x900 and 1280x800. After the verified process was stopped, the browser kept previously authoritative worker values visible, accurately labelled the browser-server database, disabled both worker-mode selectors and save/reset actions, and displayed the read-only connection state. Restarting the exact fixture command restored the loaded controls; console warnings/errors stayed empty. Captured `/tmp/file-census-options-disconnected-1440x900.png` and `/tmp/file-census-options-disconnected-1280x800.png`. This is partial `dashboard-options-state-truth` evidence, not a substitute for loading/failure/native coverage.
- [x] 2026-07-14 21:45 - Used the QA-only fixture proxy end to end without changing production behavior: Dashboard rendered authoritative initial loading at `/tmp/file-census-dashboard-loading-1440x900.png` and `/tmp/file-census-dashboard-loading-1280x800.png`; Options rendered initial loading at `/tmp/file-census-options-loading-1440x900.png` and `/tmp/file-census-options-loading-1280x800.png`; and the only intercepted read response, `settings.worker_counts.get`, rendered authoritative unavailable state with all worker controls disabled at `/tmp/file-census-options-worker-settings-failure-1440x900.png` and `/tmp/file-census-options-worker-settings-failure-1280x800.png`. The isolated ports are closed. Native Options proof remains deliberately open.
- [x] 2026-07-14 21:50 - Checkpointed the deterministic browser-server transport QA harness and its captured evidence as `beb5019` (`checkpoint :: deterministic dashboard-options transport QA`). It contains only the QA-only loopback proxy, its self-test/guardrails, and durable plan/queue/QA updates; it does not alter production imports, UI state, backend behavior, or Tauri transport.
- [ ] 2026-07-14 21:52 - Native Options proof is ready to run against `FILE_CENSUS_DB=/tmp/file-census-native-options.sqlite` with an isolated HOME, but the local Mac is currently locked so the native app cannot be inspected or operated. Browser-server work continues; do not treat browser evidence as native acceptance.
- [x] 2026-07-14 21:55 - Added and closed `qa-dashboard-core-failure-harness` after the route-matrix audit identified the still-missing real Dashboard `failed` state. The extension is limited to the read-only `overview.get` response through the existing disposable loopback proxy; no production code or test mode is authorized. Its updated self-test proves cross-method fault isolation. A fresh disposable proxy route rendered explicit metrics and active-work failure state at `/tmp/file-census-dashboard-core-failure-1440x900.png` and `/tmp/file-census-dashboard-core-failure-1280x800.png` with zero console warnings/errors; its exact processes were stopped after capture. The graph now has 27 unique, acyclic tasks (20 succeeded, 3 claimed, 4 open).
- [x] 2026-07-14 22:05 - The current-source shell comparison found no new reachable P1 visual mismatch. It isolated two bounded P2 closures: the approved max-height 720px sidebar compaction and removal of dormant unused legacy card helpers.
- [x] 2026-07-14 22:07 - Reconciled every evidence-backed completed checkbox in the current production plan and synchronized the `$Agent_Workqueue`: 29 unique acyclic tasks now show 20 succeeded, 3 claimed, and 6 open. Native Options is explicit as `native-options-runtime-parity`; Dashboard/Options browser-state evidence is preserved instead of being implied by a broad claim.
- [x] 2026-07-14 22:18 - Closed the two bounded shell P2 items with integrated 241/241 UI tests, Vite build, direct helper-caller audit, normal 1440x900/1280x800 captures, and a fixed short-height 1440x700 browser capture. The first capture exposed nested-small specificity; `!hidden` repaired only the compact rule and preserved normal targets.
- [x] 2026-07-14 22:18 - Completed `options-form-validation-parity` on the disposable compiled browser server: invalid Absolute=0 direct Save stayed client-side without success notification; Absolute=1 used the real worker-settings persistence path; Reset returned to Auto as an unsaved draft and Save persisted it; native control focus remained visible. Captured `/tmp/file-census-options-1440x900-post-p2.png` and `/tmp/file-census-options-1280x800-post-p2.png` with zero console warnings/errors.
- [x] 2026-07-14 22:20 - Closed `dashboard-options-state-truth` after integrating the complete browser-server state matrix: Dashboard empty/loading/core failure/disconnect/recovery and Options loaded/loading/worker-failure/disconnect/recovery plus invalid-save/valid-save/reset/focus evidence all use real disposable-fixture state and clean browser logs. Native chooser/runtime proof remains exclusively in `native-options-runtime-parity`.
- [x] 2026-07-14 22:23 - Reopened `post-port-validation-matrix` before acceptance after route-source audit found two real P1s: File inspector Escape/focus restoration and duplicate-cache failed-event lifecycle. Its partial first command run remained diagnostic only; the fresh complete current-tree matrix later closed after both bounded repairs.
- [x] 2026-07-14 22:29 - Closed `file-inspector-keyboard-parity`: the rebuilt real File inspector focuses its close action when compact, Escape closes it and restores the trigger focus, desktop inline inspector remains usable, and a deep linked file stays only in the main table while the side folder tree remains directories-only. Integrated UI tests pass 242/242; all three browser captures have clean console logs.
- [x] 2026-07-14 22:33 - Closed `duplicate-cache-failure-parity`: a fresh cloned disposable DB with an INSERT-only cache trigger caused the real Build cache RPC/event path to fail, surfaced the existing enabled Retry cache control with authoritative error title at 1440x900 and 1280x800, and a retry remained truthful rather than returning to a stranded Building state. Embedded rebuild, 242/242 UI tests, focused backend tests 5/5, and clean console logs pass; port 3857 was stopped immediately.
- [x] 2026-07-14 22:33 - Reclaimed `post-port-validation-matrix` for its final permitted full evidence run after both P1 repairs succeeded; record only a complete clean result. The final current-tree result later closed cleanly.
- [x] 2026-07-14 22:36 - Interrupted the post-port validation attempt before acceptance: real 1440x900 no-match Duplicates capture clips the cache control. The focused `duplicates-toolbar-desktop-parity` repair later closed before the clean current-tree retry.
- [x] 2026-07-14 22:37 - Claimed `search-stale-response-parity` after source audit found older files.search responses can overwrite newer route/query state and empty direct/history Search routes can retain old rows. The bounded real App request/route repair and deterministic proxy proof subsequently closed this claim at 23:40.
- [x] 2026-07-14 22:34 - Checkpointed the integrated P1 repair batch as `5139068` (`checkpoint`): compact File inspector Escape/focus restoration, duplicate-cache failed-event lifecycle, rebuilt production evidence, current queue, QA notes, and screenshot references are recoverable before the route matrix continues.
- [x] 2026-07-14 22:26 - Expanded the disposable browser fixture only through the real Add Location dialog with `QA No Scan` (zero snapshots), then browser-captured populated Locations and the truthful selected/no-scan state at 1440x900 and 1280x800. The location has no fabricated scan, the sidebar shows it once, and console warnings/errors are zero.
- [x] 2026-07-14 15:42 - Initialized the durable Tasks follow-up queue: claimed `tasks-log-workspace-parity` for real bounded scan-log visibility, opened `background-task-fixture-matrix` for a truthful observable background workload, and opened `exif-task-feedback-parity` for undefined-count feedback. These gate post-port validation; no mock history or production test mode is allowed. All three later closed with compiled evidence.
- [x] 2026-07-14 15:42 - Rechecked the succeeded Tasks workspace prerequisite and claimed `exif-task-feedback-parity` for the narrow real-RPC feedback repair; no aggregate EXIF count may be invented in the UI. The claim later closed with real-RPC browser proof.
- [x] 2026-07-14 15:42 - Closed `exif-task-feedback-parity`: focused App coverage passes, and a rebuilt compiled QA Tree `File actions -> Scan EXIF` notification at 1280x800 says `EXIF metadata scan started. Follow progress in Tasks.` with no undefined completion counts and zero console warnings/errors.
- [x] 2026-07-14 15:42 - Corrected and claimed `background-task-fixture-matrix`: its disposable real-workload evidence is required to finish the live-log proof, so it now depends on the already-succeeded Tasks workspace port rather than creating a circular sequencing wait. It later closed with the real background workload and cleanup proof.
- [x] 2026-07-14 15:42 - Claimed `qa-search-race-harness`: the existing transparent QA proxy cannot reorder only `files.search`, so this bounded scripts-only task must provide deterministic real-transport stale-response browser evidence without a production test hook. It later closed without adding a production hook.
- [x] 2026-07-14 15:42 - Closed `duplicates-toolbar-desktop-parity` after a focused container-query repair and embedded rebuild. Real no-match and populated `shared.txt` Duplicates captures at 1440x900/1280x800 keep every query/filter/scope/view/cache control visible; Advanced filters, scope Cancel, Flat/Tree, and Build cache remained interactive with zero browser warnings/errors.
- [x] 2026-07-14 15:42 - Browser-proved the direct/history-reset half of `search-stale-response-parity` on the rebuilt production server: after real populated `shared.txt` Search, direct `/search` renders the honest empty state at 1440x900 and 1280x800 with no stale row or File info and zero console warnings/errors. Deterministic reordered-response proof remains gated by `qa-search-race-harness`.
- [x] 2026-07-14 15:42 - Claimed `page-actions-menu-viewport-parity` after compiled Location evidence found its DOM-open Page actions dialog visually absent/off-viewport at 1440x900. The actual shared menu geometry and keyboard Scan now path were repaired and closed with current compiled evidence at 23:40.
- [x] 2026-07-14 23:11 - Added and claimed `exif-progress-transport-parity` after a real 32,768-candidate disposable Scan EXIF task kept processing in the backend while Tasks remained at its initial 0 / 0 snapshot. The bounded backend repair, rebuild, and two-viewport browser proof later closed the claim.
- [x] 2026-07-14 23:15 - Added and claimed `scan-log-transport-parity` after the early-error 100,000-file fixture reported 512 real scan errors while the Tasks disclosure still had zero retained lines. The production WebSocket repair preserved bounded real lines and terminal ordering; the expanded scrollable log proof later closed the claim.
- [x] 2026-07-14 23:40 - Reconciled the `$Agent_Workqueue` after the fresh compiled evidence batch: 40 unique acyclic tasks now record 34 succeeded, 1 claimed (`browser-route-state-matrix`), and 5 open dependent gates. The queue remains the coordinator-owned source of truth; no worker transitioned it independently.
- [x] 2026-07-14 23:40 - Closed `search-stale-response-parity` and `qa-search-race-harness`: the opt-in loopback proxy self-test passes, an older real `shared.txt` response was deliberately released after newer `definitely-no-match`, and Search remained at 0 newest results with no inspector/selection at 1440x900 and 1280x800. Captures: `/tmp/file-census-search-race-1440x900.png` and `/tmp/file-census-search-race-1280x800.png`; browser logs were clean.
- [x] 2026-07-14 23:40 - Closed `tasks-log-workspace-parity`, `scan-log-transport-parity`, `background-task-fixture-matrix`, and `exif-progress-transport-parity`. Real 100,000-file/512-error active scans rendered and scrolled retained genuine Task log lines at both targets; the 32,768-candidate EXIF task advanced at both targets and then left the truthful active-only workspace on terminal completion. WebSocket capacity/order regressions, fixture/proxy Node tests, embedded rebuild, 248/248 UI tests, and console checks pass. QA servers on ports 3857 and 3864-3868 were stopped and only guarded `/tmp/file-census-qa-background.*` directories were removed.
- [x] 2026-07-14 23:40 - Closed `page-actions-menu-viewport-parity`: fresh embedded-server interaction kept Page actions viewport-clamped at both targets; native Scan now button focus and real dialog behavior, Escape return to Page actions, safe Delete-location cancellation, restored duplicate toggle, focused Menu/Shell tests (15/15), and clean console were all verified.
- [x] 2026-07-14 23:55 - Recorded the Files browser-history closure in the claimed `browser-route-state-matrix` after fresh compiled route evidence exposed a real defect: user-initiated scan-folder navigation had used replaceState. `loadTree` now pushes user folder moves while explicit tree hydration, event refresh, mutation recovery, and internal reconciliation remain replace-only. Direct `Projects/Alpha` -> `assets`, browser Back -> `Alpha`, and Forward -> `assets` were captured from a selected in-app-browser tab at exact target viewports with clean console logs: `/tmp/file-census-files-browser-back-1440x900.png` and `/tmp/file-census-files-browser-forward-1280x800.png`.
- [x] 2026-07-14 23:55 - Reconciled current route-matrix evidence and progress counts: one-scan Duplicates guard and Search direct/no-match Back/Forward exact captures are now recorded at both approval sizes; the integrated UI suite passes 249/249, focused Files route coverage passes 13/13, WebSocket-focused backend tests pass 5/5, and Vite plus the embedded backend build pass. The queue remains 40 unique acyclic tasks: 34 succeeded, 1 claimed, and 5 open dependent gates. Remaining matrix slices stay explicit; native Options remains a separate native-only gate.
- [x] 2026-07-14 23:58 - Expanded and initialized the durable `$Agent_Workqueue` for every remaining plan-065 runtime gap rather than leaving broad prose placeholders: `native-route-system-affordance-matrix`, `event-lag-recovery-browser-parity`, and `cross-route-keyboard-accessibility-matrix` now independently gate final acceptance. The queue has 43 unique acyclic tasks (34 succeeded, 1 claimed, 8 open); current Files Columns and inline/compact inspector captures remain within the claimed route matrix.
- [x] 2026-07-15 00:10 - Continued the real compiled Files route matrix at both exact targets: current Columns menu and in-place Advanced filters disclosure are visible; a real selected file uses the desktop inline inspector at 1440x900 and the explicit compact overlay at 1280x800; and the collapsible global rail leaves only a scan-relative directory-only folder pane when closed. All current console logs are empty. Captures: `/tmp/file-census-files-columns-1440x900-current.png`, `/tmp/file-census-files-columns-1280x800-current.png`, `/tmp/file-census-files-inspector-1440x900-current.png`, `/tmp/file-census-files-inspector-overlay-1280x800-current.png`, `/tmp/file-census-files-advanced-filters-1440x900-current.png`, `/tmp/file-census-files-advanced-filters-1280x800-current.png`, `/tmp/file-census-files-sidebar-collapsed-1440x900-current.png`, and `/tmp/file-census-files-sidebar-collapsed-1280x800-current.png`. The explicit long-label part of the scan-context deduplication slice remains pending.
- [x] 2026-07-15 00:15 - Claimed the third and final permitted `post-port-validation-matrix` attempt after every prerequisite rechecked succeeded. The complete current-tree record passes: UI 249/249; Rust workspace 135 passed/0 failed with 10 standard perf tests intentionally ignored; `just build`; `just desktop-check`; clean `git diff --check`; and `just perf-gates` 10/10 (sync best 1607ms, Tokio best 1601ms). No partial prior output was used as acceptance evidence.
- [x] 2026-07-15 00:30 - Continued the compiled route matrix with fresh current source: Duplicates rendered both a populated selected-group inspector and a truthful no-match state at 1440x900/1280x800 without stale group detail; Tasks rendered the current-session empty state at both targets without invented completed history. All console logs were empty. Captures: `/tmp/file-census-duplicates-populated-1440x900-current.png`, `/tmp/file-census-duplicates-populated-1280x800-current.png`, `/tmp/file-census-duplicates-no-match-1440x900-current.png`, `/tmp/file-census-duplicates-no-match-1280x800-current.png`, `/tmp/file-census-tasks-empty-1440x900-current.png`, and `/tmp/file-census-tasks-empty-1280x800-current.png`. Cache lifecycle and live/terminal Task coverage stay pending.

- [x] 2026-07-15 00:35 - Reconciled the live `$Agent_Workqueue` after direct File Tree pointer testing exposed a real sidebar P1: the full-height collapsed edge strip opened the sidebar and became pass-through before pointer release, so a revealed location row could consume the click and clear the selected scan route. Added and claimed `sidebar-peek-hit-target-parity`; the repair holds the original hit target until pointer handoff and has focused Shell coverage. The incorrect click-through screenshot is explicitly rejected as acceptance evidence.
- [x] 2026-07-15 00:40 - Added and claimed `file-tree-root-context-parity` after source audit found the main production File tree hard-codes `Scan root` instead of showing truthful compact current context. The repair must preserve real lazy tree/action behavior, the one sidebar-owned global selector, and directory-only Folder navigation. The queue now has 45 unique acyclic tasks: 35 succeeded, 4 claimed, and 6 open.
- [x] 2026-07-15 00:40 - Claimed `event-lag-recovery-browser-parity` after a source audit found `events_lagged` could itself be dropped under outbound WebSocket pressure and recovery could retain stale Search/file overlays. The bounded source repair makes the lag notice non-droppable, clears stale file-facing state before authoritative refresh, and reruns the live Search context safely; focused UI 16/16, focused WebSocket 6 backend plus 2 CLI, Vite, rustfmt, and diff checks pass. Real lag/browser proof remains required.
- [x] 2026-07-15 01:10 - Reconciled and initialized the durable `$Agent_Workqueue` rather than leaving broad acceptance prose: `duplicate-cache-lifecycle-browser-parity` and `tasks-live-terminal-browser-parity` now own the two remaining compiled route-state slices; native evidence is split into `native-shell-picker-route-parity` and `native-system-actions-lifecycle-parity`, with the existing aggregate native gate waiting on both. `native-options-runtime-parity` is actively claimed for real desktop availability proof. The graph has 51 unique acyclic tasks: 38 succeeded, 4 claimed, and 9 open.
- [x] 2026-07-15 01:10 - Closed `sidebar-peek-hit-target-parity`, `file-tree-root-context-parity`, and `scan-context-header-parity` with current compiled File Tree captures. The repaired pointer edge rail preserves the selected URL before handoff; the directory-only Folder pane is rooted at QA Tree while the main tree is rooted at the selected workspace path; and the header carries one compact `QA Tree · 2026-07-12-13:42:45` identity without redundant small metadata. Exact captures: `/tmp/file-census-file-tree-canonical-current-1440x900.png` and `/tmp/file-census-file-tree-canonical-current-1280x800.png`; console logs are empty.
- [x] 2026-07-15 01:20 - Closed `current-source-validation-matrix` with a full fresh result rather than inherited history: UI 252/252; Rust workspace 136 passed/0 failed with 10 standard perf tests intentionally ignored (106 backend + 21 CLI + 9 native); `just build`; fresh `just desktop-check`; clean `git diff --check`; and `just perf-gates` 10/10. The 10,000-file performance comparison recorded sync best 1980ms (5049.9 files/s) and Tokio best 1695ms (5897.4 files/s).
- [x] 2026-07-15 01:35 - Closed `event-lag-recovery-source-integrity`: lag recovery now captures/awaits an in-flight pre-lag refresh and then starts a second authoritative refresh before rerunning active Search context. Focused App lag-recovery/structure/scan-progress coverage passes 17/17; `git diff --check` is clean. Browser proof and full current-source revalidation remain required.
- [x] 2026-07-15 01:25 - Reframed the P1 as its own durable `event-lag-recovery-source-integrity` claim and reopened `current-source-validation-matrix` behind it rather than treating a pre-repair green run as final. The queue now has 52 unique acyclic tasks: 38 succeeded, 5 claimed, and 9 open.
- [x] 2026-07-15 01:40 - Added and closed the explicit `event-lag-qa-harness-integrity` prerequisite. It is scripts-only and opt-in: a loopback/token-controlled proxy pauses/resumes the real upstream `/api/events` socket, forwards raw bytes unchanged after resume, and reports only bounded event-kind/count status; a real metadata-RPC burst driver restores original disposable notes. Focused Node coverage is 6/6. This is infrastructure, not browser acceptance evidence.
- [x] 2026-07-15 01:45 - Current-source revalidation now closes: UI 253/253, Rust 136/136, `just build`, fresh `just desktop-check`, clean diff, and a fresh `just perf-gates` 10/10 all pass. The 10,000-file comparison recorded sync best 1801ms (5551.5 files/s) and Tokio best 1719ms (5815.6 files/s). The earlier 8/10 disk-exhausted run remains historical; no files were removed by Codex before the successful rerun.
- [x] 2026-07-15 01:45 - Reconciled the durable `$Agent_Workqueue`: 54 unique, acyclic tasks now record 42 succeeded evidence slices, 3 active claims, and 9 open gates. The browser lag proof, native runtime work, and remaining route-state matrices are separately owned rather than hidden in broad prose.
- [x] 2026-07-14 18:50 - Reconciled the `$Agent_Workqueue` into 62 unique acyclic tasks: 41 succeeded, 5 claimed, and 16 open. Added explicit non-destructive scan-exclude coverage, long-label context, stale-state stress, component-preview, design-QA ledger, release-isolation, submitted-Search route, and late file-facing RPC lag-race owners; reopened current-source validation so prior green results remain historical only.
- [x] 2026-07-14 18:50 - A real paused-upstream lag exercise forwarded one genuine `events_lagged` envelope and cleared File info while updating the disposable marker, but exposed submitted Search state not persisting in App/route state. Submitted criteria now commit before routing; file-facing RPC results also carry an App-owned generation and cannot re-open stale File info, Delete Check, or occurrences after lag. Focused/full UI tests pass 255/255; compiled browser proof and fresh full validation remain pending.
- [x] 2026-07-14 18:50 - Removed an accidental visual-audit/release-audit dependency cycle from the durable queue: visual comparison now produces the findings that the downstream release-isolation audit consumes. No task was treated as ready merely because the graph was repaired.
- [x] 2026-07-14 18:58 - Applied readiness-derived claiming to the reconciled queue: released blocked aggregate browser/native/lag claims, recovered the two active source/browser claims to root, and made final acceptance explicitly wait on the release-isolation audit. The graph remains 62 unique, acyclic tasks with 41 succeeded, 2 claimed, and 19 open states.
- [x] 2026-07-14 19:02 - Added and claimed `event-lag-late-rpc-qa-harness`: it owns a bounded scripts-only hold/release control for one real file-facing reply, so late-RPC browser proof follows a real `events_lagged` envelope without delaying unrelated refreshes or using timing guesses. `lag-file-facing-async-invalidation` is correctly open behind that prerequisite. The queue now has 63 unique acyclic tasks: 41 succeeded, 2 claimed, and 20 open.
- [x] 2026-07-14 19:10 - Closed `event-lag-late-rpc-qa-harness`: the opt-in loopback/token control arms one allowlisted real `files.details`, `files.occurrences`, or `scans.delete_check` reply after backend emission, preserves its raw frame through manual/automatic release, and does not delay event frames. Node checks and the proxy/burst suite pass 10/10; no production source changed. Claimed `lag-file-facing-async-invalidation` for the compiled browser proof. The queue now has 63 unique acyclic tasks: 42 succeeded, 2 claimed, and 19 open.
- [x] 2026-07-14 19:12 - Reconciled every durable workqueue state before continuing: the 63-task graph is acyclic with 42 succeeded evidence slices, 2 active compiled-browser claims, 6 readiness-eligible next slices, and 13 downstream blocked gates. Added partial current-source evidence (UI 255/255, focused lag 5/5, QA proxy/burst 10/10, clean diff) without falsely closing the full validation matrix.
- [x] 2026-07-14 19:12 - Ran the first fresh compiled IAB event-lag exercise through the token-protected disposable proxy. A genuine `events_lagged` envelope was forwarded after upstream pause/resume; `q=needle.txt` survived in the route, the scan marker refreshed to `QA lag recovered final`, and console warnings/errors were empty. The run found a P1 persistent File inspector fallback retaining `needle.txt` after selection had cleared, so `lag-file-facing-async-invalidation` remains claimed while the narrow production UI repair and explicit held-reply release proof continue.
- [x] 2026-07-14 19:24 - Closed `search-committed-query-route-integrity` and `lag-file-facing-async-invalidation` only after a corrected compiled IAB replay. The first hold-before-burst ordering auto-released before the true lag notice arrived and was rejected. The accepted ordering queued a real `scans.delete_check` request behind paused upstream event traffic; the proxy forwarded exactly one genuine `events_lagged`, then a separate watcher manually released the original reply only when both conditions were true. At 1440x900 and 1280x800, `q=needle.txt`, the actual row, and the authoritative marker survived; selection, File inspector, and Delete Check remained cleared; console warnings/errors were empty. Proxy status: captured=1, manual release=1, auto release=0. Focused regression coverage is 17/17 and full UI 257/257.
- [x] 2026-07-14 19:24 - Kept the event-lag aggregate honest by adding and claiming `event-lag-active-task-recovery-parity`: the current scan/file proof cannot imply real active-task identity/progress/pause/terminal truth in Tasks, sidebar, and Cmd-K. The durable graph is 64 unique acyclic tasks: 44 succeeded, 1 claimed, and 19 open.
- [x] 2026-07-14 19:24 - Rebuilt the compiled server and accepted the real event-lag Search/File info/Delete Check recovery at 1440x900 and 1280x800, including the held late-RPC ordering proof and clean console logs.
- [x] 2026-07-14 19:40 - Completed the independent paused-active-task real-lag proof: a 100,000-file disposable Full-hash scan remained the same authoritative paused scan after the proxy forwarded exactly one genuine `events_lagged` envelope. Tasks, the 94% Paused sidebar rail, selected detail, and Cmd-K all retained matching identity/progress/action truth; 1440x900 and 1280x800 captures plus same-input reference comparisons found no targeted P0/P1/P2 visual issue. Closed `event-lag-active-task-recovery-parity` and its `event-lag-recovery-browser-parity` aggregate, then claimed the non-destructive `scan-exclude-filter-coverage-parity` slice. Native Options was not claimed because the Mac is manually locked, so its native-desktop resource is unavailable rather than silently substituted.
- [x] 2026-07-14 19:43 - Checkpointed the integrated event-lag recovery, QA harness, source repairs, browser evidence, and synchronized durable queue as `a2bd3d0` before beginning the next claimed scan-exclude proof.
- [x] 2026-07-14 19:51 - Re-synchronized the durable `$Agent_Workqueue` around the user’s non-destructive per-scan exclusion contract. The aggregate browser proof was deliberately released before fixture exercise and now waits on explicit P1 remediation gates: selected-scan exclusion events must invalidate stale Search/tree/inspector state, cached EXIF provenance must not expose a hidden identical path, and a two-client delayed-reply race must prove neither stale file-facing state nor a hidden path can return. The graph is 67 unique, acyclic tasks: 47 succeeded, 1 claimed, and 19 open; only the backend provenance gate is actively claimed.
- [x] 2026-07-14 19:58 - Completed the read-only acceptance-fixture audit. Existing opt-in background-task and late-file-RPC QA helpers can build the two-location duplicate fixture and hold a genuine `files.details` reply while a second IAB client persists a normal UI exclusion; no production mock or new QA script is necessary. The required proof sequence, raw DB/source integrity queries, and exact UI controls are recorded in the active queue task. The backend EXIF guard source patch is present and statically reviewed, but its Rust format/test/build remains unverified because the managed disk exhausted during Nix input fetch and the bootstrap cargo lacks macOS standard-library artifacts; no cleanup/deletion was performed.
- [x] 2026-07-14 20:04 - Ran the complete current UI suite after the scan-exclude client recovery: 260/260 pass. This is intentionally recorded as partial evidence only; the backend provenance guard still needs a valid Rust toolchain plus a fresh compiled production browser server before source validation or visual acceptance can close.
- [x] 2026-07-14 20:05 - Prepared two tiny matching disposable scan fixtures for the next real compiled-browser matrices and verified all three intended PNG pairs match byte-for-byte. No old compiled binary was used to collect acceptance evidence; the fixtures remain staged until the current backend/UI source can build.
- [x] 2026-07-14 20:06 - Built the current production UI bundle successfully (Vite, 1,817 modules) after the 260/260 UI suite. This verifies the frontend changes bundle cleanly; it deliberately does not substitute for the unavailable backend/embedded production build.
- [x] 2026-07-14 20:09 - Finished the exhaustive scan-exclude visibility audit and expanded the durable graph before accepting any fixture proof. Files/tree/Delete Check/Search/occurrences/duplicate source/cache/candidate selection/reuse are visibility-safe; cached excluded-only File details artifacts and direct open/reveal transports are P1 leaks, raw unlabelled scan counts need filtered semantics, and mid-thumbnail/EXIF exclusion is a P2 candidate-race. These are now four explicit remediation tasks plus the existing provenance/race gates. The graph is 72 unique, acyclic tasks: 48 succeeded, 4 claimed, and 20 open.
- [x] 2026-07-14 20:12 - Toolchain audit initially established no usable offline/no-cleanup Rust verification path, added an explicit approval-gated capacity/dev-shell recovery task, and preserved source/fixture work without deletion. Later escalation recovered the offline Nix shell for formatting and backend-library tests; the remaining blocker is disk capacity for linking/builds, not the toolchain closure.
- [x] 2026-07-14 22:23 - Reconciled `$Agent_Workqueue` against current source evidence and the user's new terminal workflows. EXIF provenance redaction and file-action UI callers now have explicit succeeded evidence; file-action transport and visible count tasks were released because CLI linking remains disk-blocked and directory/error summary semantics are incomplete. Added `plan-066 scanner-cli-operations.md` plus six durable CLI-bootstrap/Ratatui contract, implementation, and acceptance tasks. The queue has 80 unique acyclic tasks: 50 succeeded, 0 claimed, and 30 open.

# Historical Prototype Thread Handoff (Superseded)

The following handoff governed the approval-first prototype phase. It is retained as history but is superseded by the approved Production Integration phase above.

- Source Codex thread: `019e76d4-3180-7473-b7b1-366ac8014fbd`.
- The successor must be a new top-level project thread using the existing local checkout, not a forked conversation and not a new git worktree.
- Before acting, the successor must call `codex_app__read_thread` for the source thread with outputs included and paginate backward as needed to recover the full product history and user corrections.
- Then read `AGENTS.md`, this plan, `agent-plans/plan-061 product-coherence.md`, and the current branch status.
- The original handoff required phase-one-only isolated prototype screens, component-preview routes, browser screenshots, design QA, and explicit user approval.
- That approval boundary was satisfied on 2026-07-11. Production migration is now authorized only within this plan's invariants, milestones, decision gates, and checkpoint discipline.
- First operational check: connect to the in-app browser and verify tab discovery, DOM inspection, screenshot capture, and console logs. If `iab` remains unavailable, report the blocker rather than substituting Chrome without user approval.

# Unfinished Work

- [ ] Complete production milestones 0-12 in order, updating this plan and checkpointing each accepted milestone.
- [x] Resolve the exact-duplicate lookup and truthful-task-history backend decision gates without assuming backend changes.
- [x] Finish active-task snapshot hydration and native database-switch isolation so a refresh/reconnect or database change cannot show stale task state or imply durable task history.
- [x] Apply and browser-verify the directory-only side-folder rule in the production scan workspace, the Location/Scan Browser prototype, and every navigation-tree variant; add regression coverage for root-level files, nested files, and paginated mixed branches.
- [ ] Complete the queue-driven production browser route-state and overlay/menu/modal matrices at both target viewports, including constrained, loading/error, populated, and empty states.
- [x] Complete `sidebar-peek-hit-target-parity`: collapsed edge-rail pointer/focus activation preserves the exact selected scan/tree route before it hands pointer control to the revealed sidebar.
- [x] Complete `file-tree-root-context-parity`: the main-tree root label is truthful compact workspace context without creating a second global selector or leaking files into directory navigation.
- [x] Complete `scan-context-header-parity`: one compact location-plus-scan header identity replaces raw timestamp hierarchy and redundant small location metadata.
- [x] Complete `search-committed-query-route-integrity` and `lag-file-facing-async-invalidation` with compiled browser evidence; the complete green run remains historical, so `current-source-validation-matrix` is still pending.
- [x] Complete `event-lag-recovery-browser-parity`: a real WebSocket lag signal survived outbound backpressure and recovered authoritative Search/file-state on a disposable compiled browser server.
- [x] Complete `event-lag-active-task-recovery-parity`: a real paused disposable task rehydrated without stale task/UI/Cmd-K state after the same genuine event-lag path.
- [ ] Complete all explicit scan-exclude remediation/race gates—EXIF provenance is source-verified, but cached details artifacts, file-action all-transport proof, visible file/byte/directory/error summary semantics, background candidate recheck, remote delayed-reply proof, and aggregate filter coverage remain open—then re-claim `scan-exclude-filter-coverage-parity` for the persistent, non-destructive browser fixture proof. Continue current-source validation, stale-state stress, long-label scan context, Duplicates cache lifecycle, live/terminal Tasks lifecycle, and component previews. `native-options-runtime-parity` remains open until the manually locked native desktop becomes available.
- [ ] Follow `plan-066 scanner-cli-operations.md` through its CLI bootstrap and Ratatui scanner-progress acceptance tasks; neither task may bypass real scan lifecycle, terminal cleanup, or non-TTY behavior.
- [x] Complete `tasks-operational-workspace-port`: continuous Tasks shell, truthful selected-task Cmd-K context, live pool-derived progress/status agreement, and semantic/danger treatment are browser-proven without transport/capability bypasses.
- [x] Complete `dashboard-options-state-truth`: browser-server Dashboard/Options loading, failure, disconnect, save/reset, and focus truth are evidence-backed, with the native Options gate explicitly separate.
- [ ] Complete `native-options-runtime-parity` using a disposable DB/HOME after the local desktop is available; prove chooser ownership, validation/save/reset/cancel, and focus restoration at both target viewports without substituting browser evidence.
- [ ] Complete `native-shell-picker-route-parity` and `native-system-actions-lifecycle-parity` with real native window evidence before aggregating the native route/system gate.
- [x] Complete `file-inspector-keyboard-parity`: real scan File inspector dismisses with Escape and returns focus predictably at both target viewports.
- [x] Complete `duplicate-cache-failure-parity`: a failed rebuild event renders the real retry state instead of stranding the live UI at Building.
- [x] Complete `duplicates-toolbar-desktop-parity`: all real Duplicates query/filter/scope/view/cache controls are visible and operable at 1440x900 and 1280x800.
- [x] Complete `search-stale-response-parity`: real Search cancels/ignores superseded responses and clears stale rows/selection/inspector on empty direct/history routes.
- [x] Complete `qa-search-race-harness`: an opt-in disposable-fixture proxy ordering mode proves the real Search stale-response guard without a production mock route or payload.
- [x] Complete `page-actions-menu-viewport-parity`: real Location Page actions are visible, keyboard reachable, and viewport-clamped at both approval sizes.
- [x] Complete `tasks-log-workspace-parity`: the retained bounded live scan log renders accessibly in Tasks without claiming durable task history.
- [x] Complete `scan-log-transport-parity`: bounded genuine scan log batches survive outbound WebSocket pressure so Tasks can review actual error lines.
- [x] Complete `background-task-fixture-matrix`: a disposable real background task and long-log state are proven at both approval viewports without static mock rows.
- [x] Complete `exif-task-feedback-parity`: Scan EXIF start feedback reflects only real RPC task metadata and never displays undefined counts.
- [x] Complete `exif-progress-transport-parity`: a high-volume real Scan EXIF task shows current progress through the production WebSocket path without delaying terminal lifecycle truth.
- [x] Complete `qa-transport-fault-harness`: use only a transparent disposable-fixture QA proxy to capture deterministic Dashboard/Options initial-loading and worker-settings-specific failure, then stop the test process after evidence collection.
- [x] Complete `shared-surface-prototype-parity`, `filter-disclosure-prototype-parity`, and `task-status-semantic-parity`; real controls/filters/task state now match the approved compact near-black operational language with browser proof.
- [x] Complete `directory-tree-geometry-parity`; directly compare the real multi-depth production Folder pane and File tree against the approved prototype at both target viewports, fixing every disclosure/name offset without leaking files into side navigation.
- [x] Complete `overlay-accessibility-parity`; give every non-confirm dialog a real name, preserve nested menu-first Escape/focus restoration, give scope dialogs standard dismissal behavior, and suppress Cmd-K while a modal is open before overlay acceptance.
- [x] Run the separate post-port validation matrix only after all currently claimed P1/workspace ports have fresh compiled browser-server acceptance evidence.
- [x] Exercise Delete Check, destructive confirmations, and file actions only on the disposable fixture; record postconditions and no-delete safety evidence.
- [ ] Compare all final production captures with the approved prototype/reference, resolve every P0/P1/P2 issue, then obtain explicit user approval.
- [ ] Complete `duplicate-cache-lifecycle-browser-parity` and `tasks-live-terminal-browser-parity` using only the compiled disposable server before closing the broader route matrix.
- [ ] Pass the full browser-server/native verification and production acceptance gate, then obtain explicit user approval of the integrated result.
