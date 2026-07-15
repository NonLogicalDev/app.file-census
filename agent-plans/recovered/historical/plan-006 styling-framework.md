---
date: 2026-06-12
status: complete
subject: styling-framework
---

# Plan 006 - Styling Framework

## Goal

Rework the frontend styling system so new UI work uses a real styling framework or component styling layer instead of continuing to grow the bespoke `style.css`.

## Context

- The current React UI is mostly styled through `ui/src/style.css`, which has grown large and tightly couples layout, theme tokens, component variants, responsive behavior, and one-off page polish.
- The user wants the styling fix to become the primary next goal after the current sidebar scroll bug is fixed.
- The app is moving toward a Codex-like shell with dense local-file workflows, so the styling system needs to support compact navigation, menus, modals, file-browser tables, status pills, dangerous actions, and desktop/mobile/hover-sidebar behavior.
- TanStack work is planned separately in `plan-004`; styling choices should make that later table migration easier without merging the two projects.

## Decisions

- Treat `style.css` as migration source material, not a place for new bespoke component work.
- Use Tailwind CSS 3 plus small reusable React primitives for buttons, icon buttons, menus, modal surfaces, status pills, layout regions, and form fields.
- Keep CSS variables for durable theme tokens where they are useful, but move component styling into framework-backed classes and primitives.
- Do not adopt a full component framework such as Mantine in this pass. The app already has a custom Codex-like desktop shell, and a full framework would create substantial theme override work without solving the file-browser-specific needs.
- Stay on Tailwind 3 for the first integration batch because it matches the PostCSS/Vite plugin shape with low disruption. Revisit Tailwind 4 only as a separate upgrade.
- Avoid a visual redesign during the migration. Preserve the current Codex-like layout and only change visible UI where framework adoption requires or clearly improves consistency.

## Implementation Steps

1. Inventory current bespoke styling:
   - Identify global/base rules that should remain.
   - Identify component rules that should move into React primitives.
   - Identify third-party/legacy rules that must remain temporarily, such as AG Grid styling before the TanStack pass.
2. Choose the styling stack:
   - Compare Tailwind plus lightweight primitives against a React styling framework for this app’s density and desktop-like controls.
   - Record the decision in this plan before broad edits.
3. Add the chosen dependencies and configuration.
4. Create reusable UI primitives for common controls:
   - `Button`
   - `IconButton`
   - `Menu`
   - `Modal` shell
   - `StatusPill`
   - `Toolbar`
5. Convert `Shell.jsx` and the top-level app shell first.
6. Convert modal/action/button surfaces.
7. Convert file-browser surrounding chrome, leaving the table internals for the TanStack plan if needed.
8. Remove migrated CSS rules from `style.css` as each surface moves.
9. Verify:
   - `npm --prefix ui run build`
   - Desktop browser smoke test on the current location/scan route.
   - Compact browser smoke test for sidebar hover/open/close behavior.
   - Modal/menu/button hover and dangerous-action states.

## Learning Log

- The current bespoke stylesheet is the fastest source of visual truth, but it should not keep absorbing new design work.
- The next migration should preserve the current UI behavior and reduce future styling surface area before the TanStack table replacement begins.
- CSS inventory found that AG Grid styles should remain until `plan-004`; ordinary Tailwind classes should be used around the file browser, not inside AG Grid internals.
- AG Grid CSS must load before `style.css` so app-level `.ag-theme-quartz` overrides remain authoritative.
- `@tailwind utilities` belongs at the end of `style.css`, after the existing bespoke CSS, so migrated utility classes can override legacy selectors intentionally.
- The sidebar scroll containment hook depends on `.sidebar-location-list`; preserve that class until the behavior is replaced.
- Compact sidebar open state needs an explicit `.app-shell.sidebar-compact.sidebar-peeking .app-sidebar` transform rule because hover-mode transitions and utility classes make the intended state easier to regress during style migration.

## Work Log

- [x] 2026-06-12 15:23 - Created the styling-framework plan from the user request and promoted it to the next primary goal after the sidebar scroll fix.
- [x] 2026-06-12 15:36 - Installed Tailwind/PostCSS dev dependencies and added ESM Tailwind/PostCSS config.
- [x] 2026-06-12 15:36 - Added Tailwind layers to `style.css`, with utilities after legacy CSS.
- [x] 2026-06-12 15:36 - Moved AG Grid CSS imports ahead of app CSS and added Tailwind/PostCSS config files to the Rust UI embed build watch list.
- [x] 2026-06-12 15:36 - Added local UI primitives under `ui/src/components/ui/` via subagent: buttons, icon buttons, menu, status pill, toolbar, and class-name helper.
- [x] 2026-06-12 15:36 - Ran `npm --prefix ui run build`; build succeeded with only the existing Vite chunk-size warning.
- [x] 2026-06-12 15:45 - Integrated UI primitives into `Shell.jsx` for refresh/sidebar buttons, page action menu, topbar toolbar, add-location icon button, and connection pill.
- [x] 2026-06-12 15:45 - Browser-verified desktop shell: page action menu visible/aligned, file grid rows render, sidebar scroll delta 0px, main scroll delta 445.5px, no console errors.
- [x] 2026-06-12 15:45 - Browser-verified compact shell: sidebar opens/closes, page action menu stays inside viewport, sidebar scroll delta 0px, main scroll delta 520px, no console errors.
- [x] 2026-06-12 15:51 - Migrated modal action controls and file-browser chrome controls to local UI primitives.
- [x] 2026-06-12 15:51 - Browser-verified file toolbar/action toolbar roles, column picker toggle, scan-notes modal, add-location modal, submit/cancel button types, grid rows, and no console errors.
- [x] 2026-06-12 15:55 - Migrated App page-action buttons, empty-state add-location button, and search submit button to local primitives.
- [x] 2026-06-12 15:55 - Removed unused `LocationCard.jsx` and old location-card CSS from the pre-sidebar layout.
- [x] 2026-06-12 15:55 - Browser-verified migrated page action menu, edit-location modal, search form button, and no console errors.
- [x] 2026-06-12 15:59 - Audited the remaining stylesheet and removed only provably dead `location-header` and legacy `tree-row` CSS; kept global button and page-action list compatibility for current raw buttons/primitives.
- [x] 2026-06-12 16:03 - Fixed compact sidebar peeking after verification showed the topbar-open state was not translating the sidebar.
- [x] 2026-06-12 16:03 - Re-ran `npm --prefix ui run build`, `git diff --check`, desktop route/menu smoke test, and compact sidebar transform smoke test; all passed with only the existing Vite chunk-size warning.

## Unfinished Work

- [x] Inventory `style.css` and component surfaces.
- [x] Choose Tailwind or a React styling framework and record the decision.
- [x] Add dependencies/configuration.
- [x] Remove remaining obsolete bespoke CSS after confirming it is not needed by current routes.
- [x] Leave row-like scan/search/duplicate buttons for sidebar-scan-tree and TanStack passes unless a separate primitive emerges.
- [x] Browser-verify desktop and compact layouts after migration.
