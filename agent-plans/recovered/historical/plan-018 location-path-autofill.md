---
date: 2026-06-12
status: complete
subject: location-path-autofill
---

# Plan 018 - Location Path Autofill

## Goal

When a user selects a folder path for a new location, automatically populate empty name and slug fields with reasonable values.

## Context

- Adding a location currently requires manual name and slug entry even after choosing a folder path.
- The user wants slug generation to use `$TYPE-$SANITIZED_NAME`.
- Slugs should always be lowercase and follow DNS-name style rules.
- This should apply only when fields are empty so user-entered values are not overwritten unexpectedly.

## Decisions

- Use the selected folder basename as the default location name.
- Generate slugs from the selected type and sanitized name.
- DNS-style slug rules: lowercase ASCII alphanumerics and hyphens, no leading or trailing hyphen, no repeated hyphen, and no empty slug.
- Existing location slugs remain immutable during edit; this task is for add-location and any future editable slug creation flow.

## Implementation Steps

1. Add a shared `sanitizeSlugPart` helper with unit coverage for spaces, punctuation, Unicode, repeated separators, and empty names.
2. Update native folder-picker and typed path flows to fill `name` only when empty.
3. Update slug generation to fill `slug` only when empty and to update when type/name were auto-derived.
4. Add UI tests or focused component tests for non-overwrite behavior.
5. Browser-verify selecting a folder path produces expected name/slug defaults.

## Learning Log

- The useful behavior is autofill, not automation that fights the user. Once a user edits name or slug manually, the form should stop treating that field as derived.
- UI-only slug hygiene is now covered by a pure utility, but backend validation is still a separate possible hardening task if slugs become externally writable outside the React form.
- Browser verification showed the Type label is not exposed cleanly to `getByLabel` because the label contains option text; scoped modal selectors are more reliable for that control until form primitives improve label structure.

## Work Log

- [x] 2026-06-12 21:29 - Added task from user request.
- [x] 2026-06-12 21:44 - Added `locationDefaults` utility with Node tests for DNS-safe slug normalization, path basename extraction, derived field syncing, and manual override preservation.
- [x] 2026-06-12 21:44 - Wired add/edit location modal field updates through the derivation helper and added `npm --prefix ui test`.
- [x] 2026-06-12 21:44 - Verified with `npm --prefix ui test`, `npm --prefix ui run build`, and browser smoke testing against rebuilt server port `3845`.

## Unfinished Work

- [x] Implement DNS-safe slug generation.
- [x] Wire folder path selection to empty name/slug fields.
- [x] Verify manual edits are preserved.
