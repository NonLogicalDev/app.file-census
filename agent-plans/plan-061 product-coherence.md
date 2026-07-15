---
date: 2026-06-16
status: in-progress
subject: product-coherence
---

# Goal

Re-evaluate the recent UI changes and make a product-level plan for integrating them into a coherent file-census experience instead of continuing to stack local controls onto existing pages.

# Context

Recent work made real progress: scan, search, duplicates, delete check, and preview surfaces increasingly share `FileGrid`, filters, scan scope controls, task progress, and component previews. The product shape has not caught up. Several user-facing concepts are now implemented page-by-page:

- scan browsing modes
- delete-check mode and delete-check set management
- flat/tree result views
- advanced filters
- scan scope
- column visibility/order
- task/activity progress

The result is a UI where individual features exist, but the larger model is harder to explain than it should be.

# Product Integration

- Existing product model: Dashboard, Tasks, Locations, Duplicates, Search, and Options are top-level pages. Locations owns scan browsing; Search and Duplicates own their own result modes; FileGrid is shared technically but not yet expressed as a shared product concept.
- New requirement's real intent: stop short-term feature attachment and rework recent UI additions into one coherent product model for exploring files, comparing file sets, and checking deletability.
- Cleanest integrated model: define a shared **File Results Workspace** used by Scan, Search, Duplicates, and Delete Check. It has the same conceptual slots everywhere: query/filter, scope, mode, path/context, table/tree, columns, selection, row actions, and details.
- Existing pieces that should move, change, or disappear:
  - Replace nested scan tabs with one scan mode selector: `List | Tree | Delete Check`.
  - Move column visibility/order into a reusable table configuration popover and direct header interactions, not a page-sized control slab.
  - Make filters a collapsible shared panel with stable placement across Scan/Search/Duplicates/Delete Check.
  - Treat scan scope as a reusable scope selector with consistent page placement and route state.
  - Keep page-specific actions separate from mode selection and table configuration.
  - Move activity/task status into Tasks/sidebar summary and keep workspace pages focused on the user's current file question.
- Architecture impact: centralize result-view state and UI primitives around shared components instead of letting each page own its own local controls. The route model should encode the same shared concepts across pages.
- Why this is better than a local patch: it reduces conceptual clutter, avoids repeated page-specific fixes, and makes future file-processing features integrate through a known workspace model instead of inventing new page surfaces.

# Evaluation Findings

- Scan preview `preview.html#/file-explorer/file-tree-tab` currently renders two mode systems: `Files | Delete Check` and then `List | File tree` inside Files. This is the concrete nested-tab failure.
- Search preview `preview.html#/search/column-controls` shows column configuration as a large inline slab with checkbox plus left/right buttons for each column. It proves functionality but is not an acceptable product interaction for reordering columns.
- Duplicates preview `preview.html#/duplicates/kind-grouping-tree` is closer structurally because it uses the shared table/tree layout, but it still owns filter/scope/mode controls locally rather than participating in a shared workspace model.
- The app server on `localhost:3839` was not running during this review, so browser validation used the component preview server on `localhost:4174`.

# Decisions

- Product coherence is the primary objective for the next UI iteration. Do not treat this as a set of isolated visual bugs.
- The shared abstraction should be user-facing as well as technical: "file results workspace" is the product model; `FileGrid` is only the implementation detail.
- Scan, Search, Duplicates, and Delete Check should converge on the same layout order:
  1. page title / top-bar actions
  2. committed query/filter/scope area
  3. one primary mode selector where the page has multiple modes
  4. path/context controls where relevant
  5. table/tree results
  6. details modal for individual files
- Avoid nested mode selectors. If a new mode appears, re-evaluate the whole mode set.
- Keep direct manipulation close to the table: sort, resize, and eventually reorder columns should happen at the header/table level; the Columns control should manage visibility, reset, presets, and fallback ordering.

# Implementation Steps

- [ ] Define a shared workspace contract for result pages: route params, query/filter state, scan scope, mode, selected rows, path context, column config, and row actions.
- [x] Rework Scan Listing modes into one selector: `Files | File tree | Delete Check`; remove the inner `List | File tree` selector.
- [ ] Extract reusable result-mode primitives so Scan/Search/Duplicates do not each hand-roll tab labels and route wiring.
- [x] Replace Search column controls with a compact Columns popover:
  - visible column list
  - drag handle or keyboard-accessible reorder control
  - show/hide toggle
  - reset/default action
  - no full-width inline slab
- [ ] Add direct table-header affordance plan for column reordering/resizing that can apply to all `FileGrid` users.
- [ ] Normalize filter placement and behavior across Scan/Search/Duplicates/Delete Check:
  - text query takes effect on Enter or explicit action
  - advanced filters hidden by default
  - applied filter summary visible but compact
  - same route encoding where possible
- [ ] Normalize scan scope placement across Search and Duplicates, and decide whether Scan view needs a scope concept or only its selected scan context.
- [ ] Remove page-level stats and activity from file workspace pages unless they answer the current file question; keep Dashboard/Tasks/sidebar responsible for global status.
- [ ] Update component previews to reflect product states, not just isolated widgets:
  - Scan workspace modes
  - Search workspace flat/tree with compact columns popover
  - Duplicates workspace flat/tree with shared scope/filter
  - Delete Check workspace with include/exclude set and active filter summary
- [ ] Run browser preview review for each updated workspace state before implementation is called complete.
- [ ] Add structure tests that catch nested scan mode selectors and page-sized column controls.

# Learning Log

- 2026-06-16 09:26 - The key product failure is not "bad tabs"; it is local additive implementation without re-normalizing the product model as new requirements arrive.
- 2026-06-16 09:26 - Preview verification must judge coherence, not only feature presence.
- 2026-06-16 09:26 - Shared implementation (`FileGrid`) is not enough. The user-facing workspace model must also be shared.
- 2026-06-28 00:09 - Scan workspace mode is now first-class route state: `files`, `tree`, or `delete-check`. The tree mode no longer lives as component-local state nested under Files, so scan pages avoid the two-level tab failure and can deep-link to `?view=tree`.
- 2026-06-27 19:22 - Search column configuration now belongs in a compact Columns menu, not a workspace-width slab. This is still page-local state, but it moves the interaction toward the shared workspace contract: table configuration is a compact adjacent control, not a result-page mode.
- 2026-06-27 19:26 - Column order should use direct manipulation as the primary interaction. Native drag-and-drop inside the Columns menu is a better fit than making arrow buttons the main reorder control; arrows remain as fallback controls.

# Work Log

- [x] 2026-06-16 09:26 - Reviewed repo guidance, recent plan history, and recent UI/source surfaces.
- [x] 2026-06-16 09:26 - Browser-tested scan, search column controls, and duplicates tree previews on `localhost:4174`.
- [x] 2026-06-16 09:26 - Created the product-coherence plan with explicit product integration and implementation sequence.
- [x] 2026-06-28 00:09 - Collapsed scan page modes to a single `Files | File tree | Delete Check` selector and updated route parsing for `?view=tree`.
- [x] 2026-06-27 19:22 - Replaced Search column controls with compact menu and added structural regression coverage.
- [x] 2026-06-27 19:26 - Added drag-and-drop column ordering inside the Search Columns menu.
- [x] 2026-06-27 19:32 - Verified focused SearchPage structure tests, production UI build, and component preview rendering in the in-app browser. Coordinate drag in browser automation did not conclusively exercise the native drag path, but the rendered draggable handles/menu state looked correct.

# Unfinished Work

- [ ] Implement the coherent file results workspace model.
- [ ] Browser-review updated previews after implementation.
- [ ] Checkpoint after each stable UI milestone.
