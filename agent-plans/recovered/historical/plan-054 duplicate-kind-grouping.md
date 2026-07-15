---
date: 2026-06-15
status: complete
subject: duplicate-kind-grouping
---

# Duplicate Kind Grouping

## Goal

Group duplicate listings by content hash and broad file kind so users can reason about duplicate sets as meaningful families, not only raw hash buckets.

The target grouping key is `(BLAKE3 hash, file kind)`, with initial user-facing kinds such as image, text, and binary.

## Context

Duplicate listings currently focus on content hash. That is technically correct but not always user-friendly: very common files, tiny metadata artifacts, images, text files, and binary blobs can all appear in the same style of listing even though users evaluate them differently.

The user specifically wants duplicate groups keyed by hash and file kind, with kinds like image, text, and binary. We should inspect how `file(1)` classifies files before locking the taxonomy or implementation approach.

## Decisions

- Keep hash as the primary exact-content identity.
- Add a broad kind dimension for duplicate grouping and display.
- Research `file(1)`/libmagic behavior before defining our own taxonomy.
- Prefer evidence over guessing: find the `file(1)`/libmagic source or authoritative classification docs, then adapt the relevant ideas to file-census instead of cloning the entire behavior.
- Avoid slow per-render classification. Kind should be stored or cached as part of file metadata/extra info once the classification strategy is chosen.
- Preserve performance for duplicate listing, delete check, and scan tree views; grouping must not reintroduce expensive per-row work.

## Implementation Steps

- [x] Inspect existing duplicate query and UI grouping flow.
- [x] Inspect current metadata collected for MIME/type/kind and where it is stored.
- [x] Find and read the relevant `file(1)`/libmagic source or docs to understand practical classification categories.
- [x] Define a small durable kind taxonomy for UI grouping.
- [x] Add or migrate stored file-kind metadata.
- [x] Update duplicate grouping API to group by hash plus kind.
- [x] Update duplicate listing UI labels and filters to expose kind clearly.
- [x] Add tests for same-hash/different-kind grouping behavior.
- [x] Add or update preview routes for duplicate groups with mixed kinds.
- [x] Run backend tests, frontend tests, production build, and browser preview verification.

## Learning Log

- 2026-06-15 01:41 - Task added from user request: duplicate listings should group by hash and file kind, and the kind taxonomy should be informed by `file(1)`/libmagic rather than guessed.
- 2026-06-15 03:46 - User clarified desired examples: image, text, binary; implementation should inspect `file(1)` source behavior before settling the taxonomy.
- 2026-06-15 04:18 - Local `file(1)` evidence points to a staged classifier: filesystem tests, magic/MIME tests, then text/language tests. For file-census POC, we use a stored broad content kind derived from explicit MIME when available and from filename/MIME guess otherwise, avoiding per-render libmagic calls.
- 2026-06-15 04:18 - `files.kind` remains filesystem row kind (`file`/`dir`). New `files.file_kind` is the content taxonomy used by duplicate grouping: `image`, `video`, `audio`, `text`, `document`, `archive`, `binary`, `other`.
- 2026-06-15 04:18 - Duplicate groups now use `(blake3, size, file_kind)`, not only `(blake3, size)`. Keeping `size` in the key preserves the existing exact-content guard while adding the user-facing kind dimension.
- 2026-06-15 04:18 - Duplicate cache fingerprints were versioned so old cache entries do not silently serve pre-kind counts.
- 2026-06-15 08:38 - Follow-up `AddTask` request maps to this completed plan: duplicate listings are already tracked as hash plus file-kind grouping, with taxonomy informed by `file(1)`/libmagic behavior.
- 2026-06-15 10:20 - Follow-up `AddTask` request again maps to this completed plan. The durable requirement is duplicate grouping by content hash plus broad file kind (`image`, `text`, `binary`, etc.), with taxonomy informed by `file(1)`/libmagic source behavior.

## Work Log

- [x] 2026-06-15 01:41 - Created planned task for duplicate hash plus file-kind grouping.
- [x] 2026-06-15 03:46 - Updated the planned task with the explicit `(hash, kind)` grouping key and source-informed classification requirement.
- [x] 2026-06-15 04:18 - Added `files.file_kind` schema migration, backfill, insert classification, duplicate query grouping, and duplicate cache key changes.
- [x] 2026-06-15 04:18 - Added backend tests for same-hash/different-kind duplicate separation and scan-time kind classification.
- [x] 2026-06-15 04:18 - Updated duplicate UI, duplicate search text, tree leaf data, structure tests, and component preview routes for flat/tree duplicate kind grouping.
- [x] 2026-06-15 04:18 - Verified focused backend tests, full backend test suite, focused UI tests, full UI tests, production UI build, and in-app browser preview routes.
- [x] 2026-06-15 08:38 - Confirmed the new `AddTask` request is already represented by this completed plan rather than creating a duplicate task file.
- [x] 2026-06-15 10:20 - Re-confirmed the duplicate listing hash-plus-kind request belongs to this completed plan.

## Unfinished Work

- [x] Duplicate grouping by hash and file kind is implemented.
