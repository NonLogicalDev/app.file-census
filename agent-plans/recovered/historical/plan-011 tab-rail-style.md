---
date: 2026-06-12
status: complete
subject: tab-rail-style
---

# Plan 011 - Tab Rail Style

## Goal

Make every tab control in the app use the Codex/macOS-style rounded tab rail from the provided reference image.

## Context

- Tabs currently use the shared `.rounded-tabs` class in file details and scan subviews.
- The reference shows a compact dark rail with recessed inactive labels and a broad selected pill with a subtle outline, inset highlight, and shadow.
- This should become the default treatment whenever tabs are employed, not a one-off for a single modal.

## Decisions

- Keep one shared `.rounded-tabs` implementation so current and future tab controls inherit the same visual language.
- Preserve the existing accessible `role="tablist"` / `role="tab"` markup.
- Match the reference through CSS only for this pass: darker rail, inset top-bar feel, muted inactive labels, stronger selected pill, and responsive overflow safety.
- Do not introduce another tab component until the broader styling-framework work needs it.

## Implementation Steps

1. Update `.rounded-tabs`, `.scan-tabs`, and tab button states in `ui/src/style.css`.
2. Keep tab markup unchanged unless CSS alone cannot achieve the reference shape.
3. Build the React UI.
4. Browser-check the current scan route and file-info modal tab treatment.

## Learning Log

- The existing tab markup is already centralized enough for this visual update; the important durable rule is that app tabs should look like a dark rounded rail, not like ordinary buttons.

## Work Log

- [x] 2026-06-12 17:44 - Created this plan from the tab rail reference request.
- [x] 2026-06-12 17:44 - Updated shared tab CSS to use a dark rounded rail with recessed inactive tabs and an inset selected pill.
- [x] 2026-06-12 17:47 - Ran `npm --prefix ui run build`; build passed.
- [x] 2026-06-12 17:48 - Browser-verified scan subview tabs and file-info modal tabs on the local app route; no console errors.

## Unfinished Work

- [x] Update shared tab rail styling.
- [x] Run frontend build.
- [x] Browser-check tab rendering on the scan subview and file details modal.
