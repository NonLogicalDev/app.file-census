---
date: 2026-06-12
status: complete
subject: page-action-menu
---

# Plan 005 - Page Action Menu

## Goal

Move page-specific top-bar actions into a compact Codex-like menu button.

## Context

- The user supplied a Codex screenshot showing top-bar controls with a compact menu/popover pattern.
- `Shell.jsx` currently renders `topBarActions` directly in `.header-actions`.
- On a selected location route, the direct actions are `Edit`, `Disable dupes`, `Delete location`, and `Scan now`.

## Decisions

- Keep page action definitions owned by `App.jsx`; `Shell.jsx` should only decide where those actions are placed.
- Move page actions into a `details`-based top-bar menu so existing buttons and handlers can be reused.
- Keep `Refresh` visible as a global action outside the page-action menu.
- Use the existing lucide icon wrapper for the menu trigger.
- Preserve current page action button styles inside the menu, including dangerous colors.

## Implementation Steps

1. Add a page-action menu trigger to `Shell.jsx`.
2. Render `topBarActions` inside the menu panel instead of directly in the header.
3. Add CSS for a compact top-bar menu button and popover panel matching the current app shell.
4. Verify the active route:
   - Page action buttons are not direct header buttons.
   - Menu opens from the top bar.
   - Existing page actions are visible inside the menu.
   - Refresh remains directly visible.
5. Build and browser smoke test.

## Learning Log

- Pre-change browser check showed no `.page-actions-menu`; direct page actions in `.header-actions` were `Edit`, `Disable dupes`, `Delete location`, and `Scan now`.

## Work Log

- [x] 2026-06-12 15:12 - Captured the pre-change failing browser state for direct header page actions.
- [x] 2026-06-12 15:12 - Implement the compact page-action menu and verify it.
- [x] 2026-06-12 15:16 - Verified desktop and compact menu behavior: direct header page actions are hidden, `Refresh` remains direct, the menu opens with page actions, closes on outside click, and the `Edit` action opens the existing modal.
- [x] 2026-06-12 15:16 - Ran `npm --prefix ui run build`; build succeeded with only the existing Vite chunk-size warning.
- [x] 2026-06-12 15:18 - Move the page-action trigger to the far right and keep the workspace header aligned as a top bar at narrow widths.
- [x] 2026-06-12 15:19 - Verified alignment at 1440px, 390px, and 320px: action menu is rightmost, `Refresh` remains direct, direct page actions are hidden, panel stays inside viewport, and browser logs are clean.

## Unfinished Work

- [x] Move page actions into the menu.
- [x] Verify browser behavior and build.
- [x] Verify far-right action menu alignment across desktop and narrow widths.
