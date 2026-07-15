---
date: 2026-06-12
status: complete
subject: prominent-scan-now
---

# Plan 013 - Prominent Scan Now

## Goal

Make `Scan now` a prominent primary action in the location overview instead of hiding it inside the page action menu.

## Context

- The Codex-style top bar moved page actions into a menu.
- That works for infrequent or destructive actions, but scanning is the primary location-level workflow.
- When a user selects a location without selecting a scan, they should see an obvious way to start a scan from the overview content.

## Decisions

- Keep `Scan now` in the page action menu for keyboard/menu consistency, but duplicate it as a prominent primary call-to-action in location overview.
- Place the action near the location summary/stats so it is visible before the scan cards.
- Use the existing primary `Button` styling and scan icon.
- Do not show the location overview CTA when a specific scan is selected; scan-level actions belong to the scan context.

## Implementation Steps

1. Add a primary `Scan now` button to `LocationOverview`.
2. Pass/use the existing `startScan` handler already available in location props.
3. Disable while `busy`.
4. Browser-verify selected-location overview and selected-scan views.

## Learning Log

- The page action menu should not hide the dominant task for a selected resource. It is better for secondary, dangerous, or less frequent actions.

## Work Log

- [x] 2026-06-12 18:22 - Created this task from the user request.
- [x] 2026-06-12 18:29 - Added a primary `Scan now` CTA to the selected-location overview.
- [x] 2026-06-12 18:29 - Ran `npm --prefix ui run build` and `just build`.
- [x] 2026-06-12 18:31 - Browser-verified the CTA appears on `/locations/progress-slow` and does not render on a selected scan detail route.
