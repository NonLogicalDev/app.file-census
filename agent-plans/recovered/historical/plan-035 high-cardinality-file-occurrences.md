---
date: 2026-06-14
status: complete
subject: high-cardinality-file-occurrences
---

# Goal

Prevent extremely common file hashes from forcing unbounded JSON-RPC payloads or UI renders.

# Context

macOS AppleDouble sidecar files such as `._Old Photos.photoslibrary` can have identical 4 KB content across many folders. Hash `663047e68174...` appears to be one of these high-cardinality boilerplate hashes. The app should still report truthful counts, but it should not fetch or render every occurrence by default.

# Decisions

- Keep duplicate/delete semantics truthful; do not silently ignore common hashes in backend safety checks.
- Bound occurrence expansion at the RPC/data model boundary instead of only hiding rows in React.
- File details should include total occurrence count plus a first page of occurrence rows.
- Additional occurrences should be loaded explicitly through paged `files.occurrences` requests.

# Implementation Steps

- [x] Add backend tests for bounded occurrence pages and file details total counts.
- [x] Add paged occurrence API shape to the database and JSON-RPC handlers.
- [x] Update file details to return total count, page metadata, and only the first occurrence page.
- [x] Update the file info modal to render total counts and load more occurrences explicitly.
- [x] Verify focused backend tests, UI tests, build, and checkpoint.

# Learning Log

- 2026-06-14 02:48 - The pasted sample is an AppleDouble `._*` sidecar: low-value metadata content that can create huge duplicate groups by hash.
- 2026-06-14 02:49 - Duplicate group listing already samples one file per scan; the unbounded risk is primarily `files.details`/`files.occurrences` returning every path for a hot hash.
- 2026-06-14 02:59 - In `db-example.db`, hash `663047e68174dc318547d1dfea9cade313c0820e4969891e219d02a978c1feab` at 4096 bytes has 24,363 occurrences. The new details response returns total count plus a 100-row first page.

# Work Log

- [x] 2026-06-14 02:48 - Inspected the pasted sample and duplicate/detail code paths.
- [x] 2026-06-14 02:49 - Added red backend test for bounded occurrence paging.
- [x] 2026-06-14 02:50 - Verified the red test fails because `Database::file_occurrences_page` does not exist.
- [x] 2026-06-14 02:52 - Implemented database occurrence paging and verified the focused paging test passes.
- [x] 2026-06-14 02:54 - Added and passed media-layer coverage for bounded file details metadata.
- [x] 2026-06-14 02:58 - Updated JSON-RPC occurrence calls and the file info modal to show total occurrences and load more pages explicitly.
- [x] 2026-06-14 03:00 - Verified full UI tests, full backend library tests, full build, and real-hash paged RPC behavior.

# Unfinished Work

- [x] Implement backend occurrence paging and bounded details.
- [x] Update file info modal for total count plus load-more paging.
- [x] Run verification and checkpoint.
