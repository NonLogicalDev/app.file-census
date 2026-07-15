---
date: 2026-06-12
status: complete
subject: icon-system
---

# Plan 002 - Icon System

## Goal

Replace single-character UI glyphs with a consistent, maintainable icon system using `lucide-react`.

## Context

- The current UI uses many text placeholders inside `<span className="icon">`, such as `+`, `x`, `r`, `o`, `v`, `!`, and `#`.
- Primary sidebar navigation also uses a local `navIcon()` function that returns text glyphs.
- The frontend previously had no dedicated icon dependency.
- User asked to start a new task for fixing the icon situation.

## Decisions

- Use `lucide-react` as the icon source. It provides familiar symbols for common actions and aligns with the frontend guidance to use lucide icons when available.
- Add a small local `Icon` wrapper so sizing, stroke width, `aria-hidden`, and CSS class behavior stay consistent.
- Keep visible button labels as-is for readability; icons are supplemental pictograms, not replacements for clear command text.
- Replace raw glyphs in primary navigation, top bar controls, file explorer controls, modals, search, and location actions.
- Treat this as a visual-system pass only. Do not change button semantics, routes, backend APIs, or table behavior.

## Implementation Steps

1. Install `lucide-react`.
2. Add `ui/src/components/Icon.jsx` with a reusable wrapper.
3. Replace raw `.icon` glyph spans and the `navIcon()` glyph helper.
4. Adjust CSS for SVG icons inside regular buttons, sidebar nav icons, and icon-only controls.
5. Verify with:
   - Raw glyph regression search
   - `npm --prefix ui run build`
   - Browser smoke test on the active route

## Learning Log

- Current glyph placeholders are spread across `App.jsx`, `Shell.jsx`, `FileExplorer.jsx`, `AppModals.jsx`, `Modal.jsx`, `LocationsPage.jsx`, and `SearchPage.jsx`.
- `lucide-react` installed successfully on 2026-06-12; npm reported existing audit findings that are out of scope for this visual pass.

## Work Log

- [x] 2026-06-12 14:54 - Created a new icon-system plan and confirmed the current UI still contains raw `.icon` glyph spans and the `navIcon()` helper.
- [x] 2026-06-12 14:54 - Installed `lucide-react` for the frontend icon pass.
- [x] 2026-06-12 14:54 - Replace raw glyphs with a local lucide icon wrapper.
- [x] 2026-06-12 14:57 - Verified raw glyph search is clean: no `<span className="icon">` placeholders and no `navIcon()` helper remain in `ui/src`.
- [x] 2026-06-12 14:58 - Ran `npm --prefix ui run build`; build succeeded with only the existing Vite chunk-size warning.
- [x] 2026-06-12 14:58 - Browser-verified the active route: sidebar navigation, top bar, location actions, file actions, and modal/button surfaces render SVG icons with no console warnings/errors.

## Unfinished Work

- [x] Replace raw glyph icon placeholders.
- [x] Verify the browser layout after icon replacement.
