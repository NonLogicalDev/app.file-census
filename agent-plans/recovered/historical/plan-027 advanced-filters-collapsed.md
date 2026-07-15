---
date: 2026-06-13
status: complete
subject: advanced-filters-collapsed
---

# Advanced Filters Collapsed

## Goal

Hide Advanced Filters by default until the user explicitly requests them.

## Context

The filter builder is powerful but visually heavy. Search, Duplicates, and scan views should start with the fast path visible: a compact query field and essential actions. The full expression-tree editor should appear only when the user asks for advanced filtering, or when an existing route/filter state requires showing it.

## Decisions

- Default collapsed on pages with no advanced filters.
- Auto-expand when the current route already contains structured filters.
- Preserve existing filter JSON and deep-link behavior.
- The collapsed state should not cause surrounding controls to jump during ordinary typing.

## Implementation Steps

- [x] Inspect `SearchFilterControls.jsx` and all call sites in Search, Duplicates, and scan file views.
- [x] Add a stable Advanced Filters disclosure control.
- [x] Keep query input visible while hiding the expression-tree editor by default.
- [x] Auto-open Advanced Filters when structured filters exist in route state.
- [x] Add focused tests for collapsed/default and auto-expanded states.
- [x] Browser-verify Search, Duplicates, and scan folder filter surfaces.

## Learning Log

- 2026-06-13 20:41 - User preference: advanced filtering should be progressive disclosure, not always occupying page space.

## Work Log

- [x] 2026-06-13 20:41 - Captured planned task from user request.
- [x] 2026-06-13 20:46 - Implemented progressive Advanced Filters disclosure in `SearchFilterControls`; advanced panel auto-opens when structured filters exist and is collapsed for query-only use.
- [x] 2026-06-13 20:49 - Ran `npm --prefix ui test`: 78 tests passed.
- [x] 2026-06-13 20:49 - Ran `npm --prefix ui run build` with escalation: Vite production build succeeded.
- [x] 2026-06-13 20:49 - Browser-verified Search without filters shows only query plus Advanced Filters button, Search with filter route auto-opens the tree, and Duplicates without filters stays collapsed.

## Unfinished Work

- [x] Run tests, build, browser verification, and checkpoint.
