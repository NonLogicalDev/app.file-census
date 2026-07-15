---
date: 2026-06-12
status: complete
subject: integrated-tabs
---

# Plan 012 - Integrated Tabs

## Goal

Make tab controls feel integrated with the current file-census UI rather than like a dark detached strip.

## Context

- The previous tab rail interpreted the screenshot too literally and copied the dark macOS terminal chrome.
- The intended reference is the rounded segmented shape, not the dark palette.
- Tabs should divide the available container width equally and sit at the top of their page or modal context.

## Decisions

- Keep `.rounded-tabs` as the shared tab primitive.
- Style tabs with the app's light surface tokens: muted container, white selected segment, accent border/focus, restrained hover.
- Make tab buttons equal-width across the full container with no narrow `scan-tabs` cap.
- Move scan subview tabs to the top of the scan detail body, before the Files header and actions.
- Keep modal tabs directly below the modal title, which already satisfies the modal placement rule.

## Implementation Steps

1. Restyle `.rounded-tabs` to blend with light app surfaces.
2. Remove the fixed scan tab width and make segments equal-width.
3. Move scan tabs above the scan detail header.
4. Verify scan page tabs and file-info modal tabs in the browser.

## Learning Log

- “Like the screenshot” means rounded, integrated segmented control behavior; it does not mean copying the source image's dark chrome when the surrounding app surface is light.

## Work Log

- [x] 2026-06-12 18:19 - Created this plan from the tab style correction.
- [x] 2026-06-12 18:19 - Restyled `.rounded-tabs` to use the app's light surface tokens and equal-width full-container segments.
- [x] 2026-06-12 18:20 - Moved scan subview tabs to the top of the scan detail body, before the Files header and actions.
- [x] 2026-06-12 18:22 - Ran `npm --prefix ui run build` and `just build`; both passed.
- [x] 2026-06-12 18:25 - Browser-verified page tabs and file-info modal tabs: full width, equal segment widths, light integrated colors, correct placement, and no console errors.

## Unfinished Work

- [x] Restyle shared tab rail.
- [x] Move scan tabs to the top of the scan detail content.
- [x] Build and browser-verify.
