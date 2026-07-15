---
date: 2026-06-27
status: in-progress
subject: light-hash-scan-policy
---

# Goal

Add a `blake3-light` content fingerprint that hashes compile-time-configured uniform file samples. At scan start, allow the user to choose between full hash work and light-only hash work. Full hash work also computes the light fingerprint.

# Context

Some disks are too slow or too power-expensive for full-file hashing. The app still needs useful metadata and heuristic duplicate candidates on those volumes. The light hash should make scan coverage practical without pretending it is a cryptographic full-content identity.

Future scan-start parameters may include thumbnail generation, perceptual image hashes, and optional enrichment passes. This should not become a pile of one-off booleans.

# Product Integration

- Existing product model: a scan indexes file metadata and currently computes full BLAKE3/SHA-256 identity for every file. Duplicate detection and delete-check treat BLAKE3 matches as exact content identity.
- New requirement's real intent: separate “inventory this disk cheaply” from “prove exact byte-level duplicate identity.”
- Cleanest integrated model: scan start accepts a scan policy describing which content processors run. Hash processors are one category: full BLAKE3 and BLAKE3-light. Future processors such as thumbnails and perceptual hashes can plug into the same policy shape.
- Existing pieces that should move, change, or disappear: duplicate detection must not silently use `blake3-light` as equivalent to full BLAKE3. Exact duplicate views stay full-hash based; light hashes produce candidate/probable duplicate groups until explicitly promoted or confirmed.
- Architecture impact: files need separate columns for full and light hash data plus scan/policy metadata. Search/table UI can expose both. Duplicate-cache fingerprints need to include hash mode.
- Why this is better than a local patch: simply replacing `blake3` with a sampled hash would make delete checks unsafe and corrupt the meaning of existing duplicate counts.

# Decisions

- `blake3` remains the exact-content hash.
- `blake3_light` is a heuristic fingerprint and must be displayed/labeled separately.
- Light hash sampling is compile-time configurable with `FILE_CENSUS_LIGHT_HASH_SLICE_COUNT`, `FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH`, and `FILE_CENSUS_LIGHT_HASH_TERMINAL_SLICE_WIDTH`.
- Defaults are 3 slices total, 5 MiB interior slices, and 5 MiB terminal slices: start, one interior sample, and end.
- `FILE_CENSUS_LIGHT_HASH_SLICE_COUNT` must be at least 2. `FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH` and `FILE_CENSUS_LIGHT_HASH_TERMINAL_SLICE_WIDTH` must be greater than 0. The first and last slices are anchored at file start/end and use terminal width; interior slices use normal slice width and are evenly distributed across the file.
- For files smaller than or equal to `2 * terminal_slice_width + (slice_count - 2) * slice_width`, `blake3_light` hashes the whole file and can equal the full BLAKE3 value if both are computed with the same hasher input.
- Scan policy should be explicit and extensible. Initial implementation may expose hash modes first, but should name the concept as scan work/policy rather than “just a hash flag.”
- Duplicate detection defaults stay exact/full-hash. Light-hash duplicate candidates should be separate or clearly marked before they influence delete-check.
- Light-hash work is not useful enough unless delete-check can use it as an explicit "likely covered elsewhere" signal. Exact-safe and likely-safe must be separate outputs; the app must not collapse heuristic coverage into the exact `safe` boolean.
- Extra metadata should be stored content-addressably: canonical metadata blob bytes, SHA-256 of those bytes, metadata type, and per-file scan/path/type refs. This lets light-hash delete-check later compare EXIF or other enrichment without requiring a full content hash.
- This project is greenfield. Backwards-compatible schema migrations should be compacted into the canonical schema instead of preserving old column-add/backfill paths.

# Implementation Steps

- [x] Create this plan before source edits.
- [x] Add DB schema for `files.blake3_light` and any minimal scan policy fields required.
- [x] Add scanner support for hash modes: full and light.
- [x] Add CLI scan-start flags for hash policy.
- [x] Add UI scan-start controls for hash policy without cluttering the primary flow.
- [ ] Expose `blake3_light` in file/search/grid data where useful.
- [x] Keep exact duplicate detection using full `blake3`; add a clearly separate light-candidate path for delete-check likely-coverage.
- [x] Add content-addressed metadata blob storage and per-file metadata refs, starting with EXIF.
- [x] Compact old schema migrations into the canonical greenfield schema.
- [x] Add backend tests for light hash sampling, scan policy, and duplicate semantics.
- [x] Add UI tests/previews if scan-start UI changes.

# Learning Log

- 2026-06-27 16:55 - User explicitly wants this designed with future scan-start processors in mind: thumbnails, video/image previews, and perceptual hashes. Model should be a scan policy, not one bespoke `--light` flag.
- 2026-06-27 16:55 - Safety boundary: light hashes are useful heuristics, not proof. Delete-check and exact duplicate detection must continue to require full hashes unless a later workflow explicitly confirms candidates.
- 2026-06-27 17:07 - User clarified that without a light-hash-backed "most likely fine to delete" signal, the feature is underdone. Implementation should return exact missing files plus likely-covered files separately.
- 2026-06-27 17:12 - User refined `blake3-light` to a compile-time configurable uniform sampler with `slice_width` and `slice_count` instead of fixed first/last chunks. This is a better primitive because it preserves the performance knob while improving confidence on large files.
- 2026-06-27 17:26 - Exact delete-check `safe` remains full-hash only. New `likely_safe` reports sampled-hash coverage separately; the UI calls this "Likely covered elsewhere" instead of "Safe to delete."
- 2026-06-27 17:40 - User refined the sampler again: terminal slices should be independently sized because start/end carry format headers, footers, and container metadata differently from interior samples. The build-time knob is `FILE_CENSUS_LIGHT_HASH_TERMINAL_SLICE_WIDTH`.
- 2026-06-27 17:45 - User explicitly rejected runtime configuration for sampler shape. Keep slice count/widths compile-time for now; scan runtime policy should decide whether to run full or light-only hash work plus later enrichment passes, not alter the light-hash algorithm.
- 2026-06-28 00:17 - User refined scan-start policy: expose only Full or Light. Full means exact hashes plus `blake3_light`; Light means sampled fingerprint only. There should not be a separate user-facing Both option.
- 2026-06-28 00:33 - Delete-check match taxonomy: exact match is full `blake3` plus size; strong match is `blake3_light` plus size; same `blake3_light` with different sizes is a false positive and must not cover the file. Do not use ctime/mtime because copying commonly destroys those timestamps. Very strong match should eventually mean `blake3_light` plus size plus exact EXIF, but current EXIF storage is keyed by full `blake3,size`, so light-only EXIF matching needs a separate design.
- 2026-06-27 18:43 - Metadata CAS design: store metadata blobs by SHA-256 of canonical bytes plus metadata type, and attach refs by `(scan_id, path, metadata_type)`. Blob payloads must exclude occurrence-specific fields such as source path so identical metadata can dedupe across files/scans.
- 2026-06-27 18:43 - Greenfield migration cleanup: remove old compatibility shims from `migrate` and keep the full current schema plus current indexes as the source of truth.

# Work Log

- [x] 2026-06-27 16:55 - Created plan for light hash scan policy and future scan-start processor parameters.
- [x] 2026-06-27 16:59 - Checkpointed plan before source edits: `d74a8fd`.
- [x] 2026-06-27 17:07 - Add `blake3_light` storage, hash policy pipeline, and delete-check likely coverage semantics.
- [x] 2026-06-27 17:12 - Rework light hashing from fixed edge slices to compile-time configurable uniform slices.
- [x] 2026-06-27 17:24 - Added scan-start modal preview and visually checked `/preview.html#/modals/scan-start-policy`.
- [x] 2026-06-27 17:26 - Verified backend compile, focused scanner/delete-check tests, UI build, and focused UI tests.
- [x] 2026-06-27 17:40 - Split terminal slice width from interior slice width and changed default sampling to start, one interior slice, and end.
- [x] 2026-06-27 17:44 - Verified terminal-width sampler tests and backend compile check.
- [x] 2026-06-28 00:21 - Removed the user-facing Both hash option, made Full compute exact plus light hashes, and verified the scan-start modal preview in the in-app browser.
- [x] 2026-06-28 00:33 - Fixed delete-check likely coverage so full exact hash matches cover files even when `blake3_light` is missing.
- [x] 2026-06-27 18:43 - Added content-addressed metadata refs, EXIF ref persistence, ref-count triggers, and compacted greenfield migrations.
- [x] 2026-06-27 18:54 - Verified focused metadata/EXIF tests, backend compile check, and the backend DB test suite.

# Unfinished Work

- [ ] Add `blake3_light` as an optional visible/searchable table column where it helps inspection.
- [ ] Consider storing the light-hash sampler policy per scan before exposing runtime-configurable slice count/width.
- [ ] Add update/repair hash-policy flags if the product should allow changing hash mode on those flows too.
- [ ] Use metadata refs in delete-check so light-only content can report "very strong" matches when `blake3_light`, size, and EXIF metadata hash all match.
