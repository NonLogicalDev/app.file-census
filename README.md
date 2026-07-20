# file-census

Cross-backup file inventory and deduplication analysis for photos and files
scattered across disks, SD cards, and NAS shares.

Scan each location into a local SQLite database, then browse everything in one
place and answer the question that actually matters before deleting anything:
**"is this backed up somewhere else, or is it the last copy?"**

file-census performs deletion *analysis only* — it never deletes or modifies
your files.

## What it does

- **Scan locations** (disks, folders, NAS mounts) into content-addressed
  inventories: BLAKE3 + SHA-256 full hashes, plus a fast sampled "light" hash
  for slow disks. Scans are resumable, pausable, and repairable.
- **Backup safety markers** on every file and folder: whether an exact copy
  exists on another location (external) or on the same disk (internal) —
  `UNIQUE` / `N dup` / `N dup (light)` pills, with unique-content rollups per
  folder.
- **Delete Check**: stage folders/files across a scan into a delete-set, then
  browse it with survival verdicts against everything that would remain —
  safe to delete / similar survives / would lose last copy.
- **Browse like a file manager**: tree-in-table with inline folder expansion,
  keyboard navigation (arrows expand/collapse/step), a pinnable Inspector rail
  with preview/EXIF, structured search filters (extension, dates, location,
  tags, regex/fuzzy…), and a paginated flat view.
- **Tags & notes** on any file occurrence (any UTF-8 tag, namespaced notes for
  external tooling), editable in the Inspector and queryable from the CLI for
  scripted cleanup workflows.
- **Duplicates explorer**, TSV verdict exports, cached thumbnails, EXIF.

Everything lives in one SQLite file. The web UI is embedded in the single
binary; a Tauri desktop app wraps the same core.

## Quick start

Requires [Nix](https://nixos.org) (flake dev shell) and [just](https://github.com/casey/just).

```sh
# build UI + release binary, then serve the web UI
just run-release                 # http://localhost:3838

# or against a specific database file
just run-with-db-release my.db
```

Register a location and scan it:

```sh
file-census locations add --slug nas-photos --name "NAS Photos" --path /Volumes/NAS/Photos nas
file-census scan nas-photos
file-census scans watch          # live TUI progress
```

Query from the CLI (everything supports `--json`):

```sh
file-census overview
file-census duplicates list
file-census scans tree SCAN_ID --flat --backup unsafe   # what is NOT backed up
file-census scans export-verdicts SCAN_ID > verdicts.tsv
file-census tags find "keep 📸"
file-census notes list
```

## Development

```sh
just build          # debug build (UI + backend)
just run            # debug serve (note: SQLite is 20-30x slower in debug)
nix develop -c cargo test --manifest-path src/backend/Cargo.toml
cd ui && nix develop -c npm test
```

Repo layout: `src/backend` (Rust: scanner, SQLite, web server, CLI),
`src/native_app` (Tauri shell), `ui` (React/Vite, embedded into the binary at
build time), `agent-plans/` (development planning logs).

## Status

Actively developed, database schema still evolving. Deletion remains
analysis-only by design.
