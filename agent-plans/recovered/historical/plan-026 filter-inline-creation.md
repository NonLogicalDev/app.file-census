---
date: 2026-06-13
status: complete
subject: filter-inline-creation
---

# Filter Inline Creation

## Goal

Make rule and group creation in the search filter builder feel like editing the final tree in place:

- New rule UI should render as an editable placeholder row exactly where the rule will be inserted.
- New group UI should render as an editable group placeholder where the group will be inserted.
- Creation controls should be a tiny visual variation of the final rule/group components, not a separate form or menu-heavy mode.
- The full expression tree should remain visible and stable during creation.

## Context

The current filter builder supports nested logical groups, editable terms, group negation, and group composition toggles, but creation still feels visually separate from the final tree. The desired model is direct manipulation: add creates an inline placeholder in the tree, then the user fills it in.

## Decisions

- Reuse the existing rule/group render components for placeholder rows where possible.
- Keep drag/drop and action-menu behavior consistent with existing nodes after a placeholder is committed.
- Do not change filter JSON semantics as part of this task.

## Implementation Steps

- [x] Inspect `SearchFilterControls.jsx` creation flow and current rule/group render boundaries.
- [x] Introduce editable placeholder node state for new rules and groups.
- [x] Render placeholders in the actual target position with the same grid and controls as persisted nodes.
- [x] Commit valid placeholders into the existing canonical filter tree.
- [x] Add or update focused tests for placeholder creation behavior.
- [x] Browser-verify search, duplicates, and scan filter surfaces.

## Learning Log

- 2026-06-13 20:38 - User preference: creation UI should be a tiny visual variation of the final rule/group shape, not a separate form or toolbar interaction.
- 2026-06-13 20:55 - Existing React component tests are not present; verification is via shared filter utility tests, production build, and browser interaction on the Search surface.
- 2026-06-13 20:56 - Browser verification on Vite-only Search confirmed the root inline placeholder appears inside the root group and replaces the `No filters` state. Committing the rule updates the URL filter JSON. Further mutation is disabled in the Vite-only run after the page waits on unavailable backend data.

## Work Log

- [x] 2026-06-13 20:38 - Captured follow-up task from UI review.
- [x] 2026-06-13 20:55 - Moved new rule and group creation into inline builders rendered at the target group path.
- [x] 2026-06-13 20:55 - Verified `npm --prefix ui test`.
- [x] 2026-06-13 20:55 - Verified `npm --prefix ui run build` with the known Vite sandbox workaround.
- [x] 2026-06-13 20:56 - Browser-verified root inline creation behavior on `http://127.0.0.1:3868/search`.

## Unfinished Work

- [x] Implement inline rule/group placeholder creation.
