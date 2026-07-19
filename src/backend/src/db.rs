use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::search::{
    FileSearchExpression, FileSearchFilter, FileSearchOperator, FileSearchQuery, FileSearchTerm,
};

const DEFAULT_TREE_PAGE_LIMIT: u32 = 500;

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LocationType {
    Unknown,
    Local,
    Disk,
    Nas,
}

impl fmt::Display for LocationType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LocationType::Unknown => f.write_str("unknown"),
            LocationType::Local => f.write_str("local"),
            LocationType::Disk => f.write_str("disk"),
            LocationType::Nas => f.write_str("nas"),
        }
    }
}

impl TryFrom<String> for LocationType {
    type Error = anyhow::Error;

    fn try_from(value: String) -> Result<Self> {
        match value.as_str() {
            "unknown" => Ok(LocationType::Unknown),
            "local" => Ok(LocationType::Local),
            "disk" => Ok(LocationType::Disk),
            "nas" => Ok(LocationType::Nas),
            other => anyhow::bail!("unknown location type: {other}"),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Location {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub kind: LocationType,
    pub root_path: PathBuf,
    pub notes: Option<String>,
    pub representative_scan_id: Option<String>,
    pub disabled: bool,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct LocationInput {
    pub kind: LocationType,
    pub name: String,
    pub slug: String,
    pub root_path: PathBuf,
    pub notes: Option<String>,
}

#[derive(Clone, Debug)]
pub struct LocationUpdate {
    pub kind: LocationType,
    pub name: String,
    pub root_path: PathBuf,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Scan {
    pub id: String,
    pub location_id: String,
    pub location_slug: String,
    pub location_name: String,
    pub offset_path: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub file_count: u64,
    pub dir_count: u64,
    pub error_count: u64,
    pub total_bytes: u64,
    pub status: String,
    pub is_representative: bool,
    pub notes: Option<String>,
}

/// The location and running scan reserved by a compatible bootstrap request.
///
/// The database transaction either verifies an existing compatible location or
/// creates the missing location before reserving this scan, so a failed setup
/// never leaves behind a partially-created location.
#[derive(Clone, Debug)]
pub struct BootstrapScan {
    pub location: Location,
    pub scan_id: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanExclude {
    pub id: i64,
    pub scan_id: String,
    pub pattern: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct FileRow {
    pub scan_id: String,
    pub location_slug: String,
    pub location_name: String,
    /// Filesystem topology (`file` or `dir`) remains in `kind`; this is a
    /// response-only semantic category inferred from the filename extension.
    pub file_kind: String,
    pub kind: String,
    pub path: String,
    pub name: String,
    pub size: u64,
    pub blake3: String,
    pub sha256: String,
    pub ctime: Option<String>,
    pub mtime: Option<String>,
    pub mode: Option<u32>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct FileOccurrence {
    pub scan_id: String,
    pub scan_started_at: String,
    pub scan_finished_at: Option<String>,
    pub scan_status: String,
    pub location_slug: String,
    pub location_name: String,
    pub kind: String,
    pub path: String,
    pub name: String,
    pub size: u64,
    pub blake3: String,
    pub sha256: String,
    pub ctime: Option<String>,
    pub mtime: Option<String>,
    pub mode: Option<u32>,
    pub error: Option<String>,
}

/// A filesystem target that was authorized against one scan's current
/// non-destructive visibility boundary.
///
/// Callers must launch the returned path directly rather than reading the
/// scan or location again, which would reintroduce a visibility TOCTOU gap.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VisibleScanActionTarget {
    pub filesystem_path: PathBuf,
    pub kind: String,
}

/// A source-validated page of visible content occurrences. The origin check
/// and the occurrence collection share one read snapshot so a newly excluded
/// source cannot authorize a later cross-scan result set.
#[derive(Clone, Debug, Serialize)]
pub struct FileOccurrencePage {
    pub occurrences: Vec<FileOccurrence>,
    pub total: u64,
    pub limit: u32,
    pub offset: u64,
    pub has_more: bool,
    pub next_offset: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DuplicateGroup {
    pub blake3: String,
    pub size: u64,
    pub count: u64,
    /// Shared semantic category for the visible files, or `mixed` when their
    /// filename-derived categories disagree.
    pub file_kind: String,
    pub files: Vec<FileRow>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub file_count: u64,
    pub blake3: Option<String>,
    pub sha256: Option<String>,
    pub ctime: Option<String>,
    pub mtime: Option<String>,
    pub mode: Option<u32>,
    pub duplicate_file_count: u64,
    pub original_file_count: u64,
    pub same_scan_duplicate_file_count: u64,
    /// Distinct-content count: unique (blake3,size) in the folder subtree on dir
    /// rows, 1 on file rows. The redefined "Uniq".
    #[serde(default)]
    pub distinct_count: u64,
    /// Backup safety for a file: "safe" (exact copy elsewhere), "warn" (light
    /// copy only), "unsafe" (no copy), or "" when the duplicate cache has no
    /// ready run. On directory rows this is "" and the rollup counts apply.
    #[serde(default)]
    pub backup_status: String,
    /// Directory rollups: how many UNIQUE contents in the subtree fall in each
    /// External tier. `safe_count` + `warn_count` + `unsafe_count` == distinct.
    #[serde(default)]
    pub safe_count: u64,
    #[serde(default)]
    pub unsafe_count: u64,
    #[serde(default)]
    pub warn_count: u64,
    #[serde(default)]
    pub copies_here: u64,
    #[serde(default)]
    pub copies_away: u64,
}

/// A persisted-cache lifecycle record for the effective duplicate comparison
/// scope. It is intentionally separate from the live duplicate counters on a
/// tree row: callers can render a truthful cache state without treating a
/// partial cache run as data truth.
#[derive(Clone, Debug, Serialize)]
pub struct DuplicateCacheStatus {
    pub fingerprint: Option<String>,
    pub status: String,
    pub run_id: Option<String>,
    pub total_files: u64,
    pub processed_files: u64,
    pub scan_count: u64,
    pub started_at: Option<String>,
    pub ready_at: Option<String>,
    pub error: Option<String>,
}

/// A fully materialized, post-filter tree page. `limit` and `offset` refer to
/// the tree itself; a supplied search query contributes only its filter AST.
#[derive(Clone, Debug, Serialize)]
pub struct TreePage {
    pub entries: Vec<TreeEntry>,
    pub limit: u32,
    pub offset: u32,
    pub total: u64,
    pub has_more: bool,
    pub next_offset: Option<u32>,
    pub duplicate_cache: DuplicateCacheStatus,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeleteCheckResult {
    pub scan_id: String,
    pub safe: bool,
    pub total_count: u64,
    pub missing_count: u64,
    pub checked_files: Vec<TreeEntry>,
    pub missing_files: Vec<TreeEntry>,
}

#[derive(Clone, Debug, Serialize)]
pub struct StoredThumbnail {
    pub blake3: String,
    pub size: u64,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct NewThumbnail {
    pub blake3: String,
    pub size: u64,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct ThumbnailCandidate {
    pub blake3: String,
    pub size: u64,
    pub path: String,
}

#[derive(Clone, Debug)]
pub struct NewFile {
    pub scan_id: String,
    pub kind: String,
    pub path: String,
    pub name: String,
    pub size: u64,
    pub blake3: String,
    pub sha256: String,
    // Heuristic sampled fingerprint (plan-064). Empty when not computed (dirs,
    // errors, or a full scan that predates light hashing). Never an exact
    // identity — exact dedup/delete-check stay on `blake3`.
    pub blake3_light: String,
    pub ctime: Option<String>,
    pub mtime: Option<String>,
    pub mode: Option<u32>,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ReusableFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub blake3: String,
    pub sha256: String,
    pub ctime: Option<String>,
    pub mtime: Option<String>,
    pub mode: Option<u32>,
}

/// A cached EXIF extraction row (keyed by blake3+size) as stored in `file_exif`.
#[derive(Clone, Debug)]
pub struct CachedExif {
    pub status: String,
    pub source_path: Option<String>,
    pub fields_json: String,
    pub error: Option<String>,
}

/// Read-only material collected before an update scan reserves its new scan
/// record. Keeping this separate lets callers validate the source/root first,
/// then perform the small create-and-copy-excludes transaction atomically.
#[derive(Clone, Debug)]
pub struct UpdateScanSeed {
    pub source_scan_id: String,
    pub location: Location,
    pub offset_path: PathBuf,
    pub reusable_files: HashMap<String, ReusableFile>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Overview {
    pub location_count: u64,
    pub scan_count: u64,
    pub file_count: u64,
    pub total_bytes: u64,
    pub duplicate_groups: u64,
}

/// Query-local visibility state for persistent, non-destructive scan excludes.
///
/// Matchers are compiled once per involved scan and are then used to populate
/// the connection-local `excluded_file_ids` table before any public query
/// pagination, counting, or duplicate grouping happens in SQL.
struct ScanVisibility {
    matchers: HashMap<String, Option<Gitignore>>,
}

#[derive(Clone, Debug)]
struct TreeSourceRow {
    file: FileRow,
    // Per-file duplicate counters sourced from the precomputed
    // `duplicate_cache_path_counts` table for the scope's ready cache run, not
    // recomputed inline. They are 0 ("unknown") when no ready cache run exists.
    duplicate_file_count: u64,
    original_file_count: u64,
    same_scan_duplicate_file_count: u64,
}

impl ScanVisibility {
    fn load<I>(conn: &Connection, scan_ids: I) -> Result<Self>
    where
        I: IntoIterator<Item = String>,
    {
        let scan_ids = scan_ids.into_iter().collect::<HashSet<_>>();
        let mut matchers = HashMap::with_capacity(scan_ids.len());
        let mut patterns_stmt = conn.prepare(
            "SELECT pattern FROM scan_excludes WHERE scan_id = ?1 ORDER BY id",
        )?;

        for scan_id in scan_ids {
            let patterns = patterns_stmt
                .query_map([scan_id.as_str()], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let matcher = build_scan_exclude_matcher(&patterns)?;
            matchers.insert(scan_id, matcher);
        }

        Ok(Self { matchers })
    }

    fn is_visible(&self, scan_id: &str, path: &str, is_dir: bool) -> bool {
        !self
            .matchers
            .get(scan_id)
            .map_or(false, |matcher| scan_path_is_excluded(matcher, path, is_dir))
    }
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let db = Self {
            path: path.as_ref().to_path_buf(),
        };
        let mut conn = db.connect()?;
        db.migrate(&mut conn)?;
        Ok(db)
    }

    pub fn connect(&self) -> Result<Connection> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating db parent {}", parent.display()))?;
        }
        let conn = Connection::open(&self.path)
            .with_context(|| format!("opening sqlite database {}", self.path.display()))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        // Wait up to 30s on a contended write instead of failing immediately with
        // SQLITE_BUSY; concurrent scans/readers legitimately hold the write lock
        // (plan-038).
        conn.busy_timeout(std::time::Duration::from_secs(30))?;
        Ok(conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn migrate(&self, conn: &mut Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('unknown', 'local', 'disk', 'nas')),
                root_path TEXT NOT NULL,
                notes TEXT,
                representative_scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,
                disabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                location_id TEXT NOT NULL REFERENCES locations(id),
                offset_path TEXT NOT NULL DEFAULT '/',
                started_at TEXT NOT NULL,
                finished_at TEXT,
                file_count INTEGER NOT NULL DEFAULT 0,
                dir_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'running',
                notes TEXT,
                nickname TEXT,
                hash_policy TEXT NOT NULL DEFAULT 'full'
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY,
                scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                size INTEGER NOT NULL,
                blake3 TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                blake3_light TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'dir')),
                ctime TEXT,
                mtime TEXT,
                mode INTEGER,
                error TEXT,
                UNIQUE(scan_id, path)
            );

            CREATE TABLE IF NOT EXISTS file_thumbnails (
                blake3 TEXT NOT NULL,
                size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                data BLOB NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (blake3, size)
            );

            CREATE TABLE IF NOT EXISTS file_exif (
                blake3 TEXT NOT NULL,
                size INTEGER NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('ok', 'empty', 'unsupported', 'unavailable', 'error')),
                source_scan_id TEXT,
                source_path TEXT,
                fields_json TEXT NOT NULL DEFAULT '[]',
                error TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (blake3, size)
            );

            CREATE TABLE IF NOT EXISTS scan_excludes (
                id INTEGER PRIMARY KEY,
                scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                pattern TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(scan_id, pattern)
            );

            CREATE TABLE IF NOT EXISTS duplicate_cache_runs (
                id TEXT PRIMARY KEY,
                fingerprint TEXT NOT NULL UNIQUE,
                fingerprint_payload TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('building', 'ready', 'failed')),
                total_files INTEGER NOT NULL DEFAULT 0,
                processed_files INTEGER NOT NULL DEFAULT 0,
                started_at TEXT NOT NULL,
                ready_at TEXT,
                error TEXT
            );

            CREATE TABLE IF NOT EXISTS duplicate_cache_run_scans (
                run_id TEXT NOT NULL REFERENCES duplicate_cache_runs(id) ON DELETE CASCADE,
                scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                location_id TEXT NOT NULL,
                location_slug TEXT NOT NULL,
                scan_started_at TEXT NOT NULL,
                scan_finished_at TEXT,
                file_count INTEGER NOT NULL,
                dir_count INTEGER NOT NULL,
                error_count INTEGER NOT NULL,
                total_bytes INTEGER NOT NULL,
                PRIMARY KEY (run_id, scan_id)
            );

            CREATE TABLE IF NOT EXISTS duplicate_cache_path_counts (
                run_id TEXT NOT NULL REFERENCES duplicate_cache_runs(id) ON DELETE CASCADE,
                scan_id TEXT NOT NULL,
                path TEXT NOT NULL,
                -- Immediate parent directory of `path` ('' for top-level entries).
                -- Indexed so browsing a folder is an O(children) lookup instead of
                -- an O(subtree) aggregation over every descendant file.
                parent_path TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'dir')),
                -- Subtree rollups on dir rows (own value on file rows) so a folder
                -- listing reads counts/size/count without scanning its descendants.
                file_count INTEGER NOT NULL DEFAULT 0,
                total_size INTEGER NOT NULL DEFAULT 0,
                -- Distinct-content count: unique (blake3,size) in the subtree on dir
                -- rows, 1 on file rows. This is the redefined "Uniq".
                distinct_count INTEGER NOT NULL DEFAULT 0,
                duplicate_file_count INTEGER NOT NULL DEFAULT 0,
                original_file_count INTEGER NOT NULL DEFAULT 0,
                same_scan_duplicate_file_count INTEGER NOT NULL DEFAULT 0,
                safe_file_count INTEGER NOT NULL DEFAULT 0,
                warn_file_count INTEGER NOT NULL DEFAULT 0,
                unsafe_file_count INTEGER NOT NULL DEFAULT 0,
                copies_here INTEGER NOT NULL DEFAULT 0,
                copies_away INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (run_id, scan_id, path)
            );

            -- Persistent exclusion cache. Recomputing which files an exclude
            -- pattern hides means glob-matching every file in the scan, which is
            -- O(files) per browse/search/delete-check. Materialize it once,
            -- keyed by a fingerprint of (patterns + file_count + max_id), and
            -- only rebuild when that changes.
            CREATE TABLE IF NOT EXISTS scan_exclusion_cache (
                scan_id TEXT PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
                fingerprint TEXT NOT NULL,
                built_at TEXT NOT NULL,
                -- Visible (non-excluded, non-error) file totals, computed during
                -- the same O(files) pass that builds the exclusion set. Read on
                -- every tree navigation for the scope fingerprint/status, so
                -- caching them avoids a per-navigation SUM(size) over the scan.
                visible_file_count INTEGER NOT NULL DEFAULT 0,
                visible_total_bytes INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS scan_excluded_files (
                scan_id TEXT NOT NULL,
                file_id INTEGER NOT NULL,
                PRIMARY KEY (scan_id, file_id)
            ) WITHOUT ROWID;

            CREATE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug);
            CREATE INDEX IF NOT EXISTS idx_scans_location ON scans(location_id);
            CREATE INDEX IF NOT EXISTS idx_files_scan_path ON files(scan_id, path);
            CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
            CREATE INDEX IF NOT EXISTS idx_files_blake3_size ON files(blake3, size);
            CREATE INDEX IF NOT EXISTS idx_scan_excludes_scan ON scan_excludes(scan_id);
            CREATE INDEX IF NOT EXISTS idx_duplicate_cache_runs_fingerprint_status ON duplicate_cache_runs(fingerprint, status);
            CREATE INDEX IF NOT EXISTS idx_duplicate_cache_run_scans_run ON duplicate_cache_run_scans(run_id);
            CREATE INDEX IF NOT EXISTS idx_duplicate_cache_path_counts_run_scan_path ON duplicate_cache_path_counts(run_id, scan_id, path);
            -- The parent_path index is created in migrate() after the ALTER that
            -- adds the column, so pre-existing databases don't fail here.
            CREATE INDEX IF NOT EXISTS idx_file_exif_status ON file_exif(status);
            "#,
        )?;
        if !column_exists(conn, "locations", "representative_scan_id")? {
            conn.execute(
                "ALTER TABLE locations ADD COLUMN representative_scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL",
                [],
            )?;
        }
        if !column_exists(conn, "scans", "notes")? {
            conn.execute("ALTER TABLE scans ADD COLUMN notes TEXT", [])?;
        }
        if !column_exists(conn, "locations", "disabled")? {
            conn.execute(
                "ALTER TABLE locations ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !column_exists(conn, "files", "kind")? {
            conn.execute(
                "ALTER TABLE files ADD COLUMN kind TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('file', 'dir'))",
                [],
            )?;
        }
        if !column_exists(conn, "files", "ctime")? {
            conn.execute("ALTER TABLE files ADD COLUMN ctime TEXT", [])?;
        }
        // Columns below live in the fresh CREATE TABLE, but a pre-existing
        // database only picks them up through these idempotent ALTERs. They are
        // required by current queries (representative-scan selection reads
        // `scans.hash_policy`; the scan/dedup paths read `files.blake3_light`),
        // so a database missing them fails on load, not just on write.
        if !column_exists(conn, "scans", "nickname")? {
            conn.execute("ALTER TABLE scans ADD COLUMN nickname TEXT", [])?;
        }
        if !column_exists(conn, "scans", "hash_policy")? {
            conn.execute(
                "ALTER TABLE scans ADD COLUMN hash_policy TEXT NOT NULL DEFAULT 'full'",
                [],
            )?;
        }
        if !column_exists(conn, "files", "blake3_light")? {
            conn.execute(
                "ALTER TABLE files ADD COLUMN blake3_light TEXT NOT NULL DEFAULT ''",
                [],
            )?;
        }
        // Backup-classification columns on the duplicate path-count cache
        // (safe/warn/unsafe rollups + copy counts). Older cache rows are simply
        // stale until the next rebuild, so a default of 0 is safe.
        for column in [
            "safe_file_count",
            "warn_file_count",
            "unsafe_file_count",
            "copies_here",
            "copies_away",
            "file_count",
            "total_size",
            "distinct_count",
        ] {
            if !column_exists(conn, "duplicate_cache_path_counts", column)? {
                conn.execute(
                    &format!(
                        "ALTER TABLE duplicate_cache_path_counts ADD COLUMN {column} INTEGER NOT NULL DEFAULT 0"
                    ),
                    [],
                )?;
            }
        }
        if !column_exists(conn, "duplicate_cache_path_counts", "parent_path")? {
            conn.execute(
                "ALTER TABLE duplicate_cache_path_counts ADD COLUMN parent_path TEXT NOT NULL DEFAULT ''",
                [],
            )?;
        }
        for column in ["visible_file_count", "visible_total_bytes"] {
            if !column_exists(conn, "scan_exclusion_cache", column)? {
                conn.execute(
                    &format!(
                        "ALTER TABLE scan_exclusion_cache ADD COLUMN {column} INTEGER NOT NULL DEFAULT 0"
                    ),
                    [],
                )?;
                // Force a one-time exclusion-cache rebuild so the new totals get
                // populated (the old fingerprint would otherwise skip it).
                conn.execute(
                    "UPDATE scan_exclusion_cache SET fingerprint = fingerprint || '\u{1f}stale'",
                    [],
                )?;
            }
        }
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_duplicate_cache_path_counts_run_scan_parent ON duplicate_cache_path_counts(run_id, scan_id, parent_path)",
            [],
        )?;
        migrate_locations_type_check(conn)?;
        Ok(())
    }

    pub fn add_location(&self, input: LocationInput) -> Result<Location> {
        let conn = self.connect()?;
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO locations (id, slug, name, type, root_path, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.slug,
                input.name,
                input.kind.to_string(),
                input.root_path.to_string_lossy(),
                input.notes,
                created_at,
            ],
        )?;
        invalidate_duplicate_cache_conn(&conn)?;
        self.location_by_id(&id)?
            .context("inserted location was not found")
    }

    pub fn locations(&self) -> Result<Vec<Location>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, slug, name, type, root_path, notes, representative_scan_id, disabled, created_at FROM locations ORDER BY slug",
        )?;
        let rows = stmt.query_map([], location_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn update_location(&self, slug: &str, input: LocationUpdate) -> Result<Location> {
        let conn = self.connect()?;
        let updated = conn.execute(
            "UPDATE locations SET name = ?1, type = ?2, root_path = ?3, notes = ?4 WHERE slug = ?5",
            params![
                input.name,
                input.kind.to_string(),
                input.root_path.to_string_lossy(),
                input.notes,
                slug,
            ],
        )?;
        if updated == 0 {
            anyhow::bail!("location not found: {slug}");
        }
        invalidate_duplicate_cache_conn(&conn)?;
        self.location_by_slug(slug)?
            .with_context(|| format!("updated location was not found: {slug}"))
    }

    pub fn set_location_disabled(&self, slug: &str, disabled: bool) -> Result<Location> {
        let conn = self.connect()?;
        let updated = conn.execute(
            "UPDATE locations SET disabled = ?1 WHERE slug = ?2",
            params![disabled, slug],
        )?;
        if updated == 0 {
            anyhow::bail!("location not found: {slug}");
        }
        invalidate_duplicate_cache_conn(&conn)?;
        self.location_by_slug(slug)?
            .with_context(|| format!("updated location was not found: {slug}"))
    }

    pub fn scan_ids_for_location(&self, slug: &str) -> Result<Vec<String>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT s.id
            FROM scans s
            JOIN locations l ON l.id = s.location_id
            WHERE l.slug = ?1
            "#,
        )?;
        let rows = stmt.query_map([slug], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn delete_location(&self, slug: &str) -> Result<bool> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let location_id = tx
            .query_row("SELECT id FROM locations WHERE slug = ?1", [slug], |row| {
                row.get::<_, String>(0)
            })
            .optional()?;
        let Some(location_id) = location_id else {
            return Ok(false);
        };

        tx.execute(
            "DELETE FROM files WHERE scan_id IN (SELECT id FROM scans WHERE location_id = ?1)",
            [&location_id],
        )?;
        tx.execute("DELETE FROM scans WHERE location_id = ?1", [&location_id])?;
        tx.execute("DELETE FROM locations WHERE id = ?1", [&location_id])?;
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(true)
    }

    pub fn set_representative_scan(&self, scan_id: &str) -> Result<Scan> {
        let conn = self.connect()?;
        let scan = conn
            .query_row(
                r#"
                SELECT s.id, s.location_id, l.slug, l.name, s.offset_path, s.started_at, s.finished_at,
                       s.file_count, s.dir_count, s.error_count, s.total_bytes, s.status,
                       COALESCE(l.representative_scan_id = s.id, 0), s.notes
                FROM scans s
                JOIN locations l ON l.id = s.location_id
                WHERE s.id = ?1
                "#,
                [scan_id],
                scan_from_row,
            )
            .optional()?
            .with_context(|| format!("scan not found: {scan_id}"))?;
        conn.execute(
            "UPDATE locations SET representative_scan_id = ?1 WHERE id = ?2",
            params![scan_id, scan.location_id],
        )?;
        invalidate_duplicate_cache_conn(&conn)?;
        self.scan_by_id(scan_id)?
            .with_context(|| format!("representative scan not found after update: {scan_id}"))
    }

    pub fn clear_representative_scan(&self, scan_id: &str) -> Result<Scan> {
        let scan = self
            .scan_by_id(scan_id)?
            .with_context(|| format!("scan not found: {scan_id}"))?;
        let conn = self.connect()?;
        conn.execute(
            "UPDATE locations SET representative_scan_id = NULL WHERE id = ?1 AND representative_scan_id = ?2",
            params![scan.location_id, scan_id],
        )?;
        invalidate_duplicate_cache_conn(&conn)?;
        self.scan_by_id(scan_id)?
            .with_context(|| format!("scan not found after representative clear: {scan_id}"))
    }

    pub fn update_scan_notes(&self, scan_id: &str, notes: Option<String>) -> Result<Scan> {
        let conn = self.connect()?;
        let updated = conn.execute(
            "UPDATE scans SET notes = ?1 WHERE id = ?2",
            params![notes, scan_id],
        )?;
        if updated == 0 {
            anyhow::bail!("scan not found: {scan_id}");
        }
        self.scan_by_id(scan_id)?
            .with_context(|| format!("updated scan was not found: {scan_id}"))
    }

    pub fn update_scan_nickname(&self, scan_id: &str, nickname: Option<String>) -> Result<Scan> {
        let conn = self.connect()?;
        let updated = conn.execute(
            "UPDATE scans SET nickname = ?1 WHERE id = ?2",
            params![nickname, scan_id],
        )?;
        if updated == 0 {
            anyhow::bail!("scan not found: {scan_id}");
        }
        self.scan_by_id(scan_id)?
            .with_context(|| format!("updated scan was not found: {scan_id}"))
    }

    pub fn set_scan_hash_policy(&self, scan_id: &str, policy: &str) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "UPDATE scans SET hash_policy = ?1 WHERE id = ?2",
            params![policy, scan_id],
        )?;
        Ok(())
    }

    /// Caches an EXIF extraction keyed by content identity (blake3, size), so a
    /// single successful read serves the same content anywhere and survives a
    /// source drive going offline (plan-040).
    #[allow(clippy::too_many_arguments)]
    pub fn cache_file_exif(
        &self,
        blake3: &str,
        size: u64,
        status: &str,
        source_scan_id: Option<&str>,
        source_path: Option<&str>,
        fields_json: &str,
        error: Option<&str>,
    ) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            r#"
            INSERT INTO file_exif
                (blake3, size, status, source_scan_id, source_path, fields_json, error, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(blake3, size) DO UPDATE SET
                status = excluded.status,
                source_scan_id = excluded.source_scan_id,
                source_path = excluded.source_path,
                fields_json = excluded.fields_json,
                error = excluded.error,
                updated_at = excluded.updated_at
            "#,
            params![
                blake3,
                size,
                status,
                source_scan_id,
                source_path,
                fields_json,
                error,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn cached_file_exif(&self, blake3: &str, size: u64) -> Result<Option<CachedExif>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT status, source_path, fields_json, error FROM file_exif WHERE blake3 = ?1 AND size = ?2",
            params![blake3, size],
            |row| {
                Ok(CachedExif {
                    status: row.get(0)?,
                    source_path: row.get(1)?,
                    fields_json: row.get(2)?,
                    error: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn scan_by_id(&self, scan_id: &str) -> Result<Option<Scan>> {
        let conn = self.connect()?;
        conn.query_row(
            r#"
            SELECT s.id, s.location_id, l.slug, l.name, s.offset_path, s.started_at, s.finished_at,
                   s.file_count, s.dir_count, s.error_count, s.total_bytes, s.status,
                   COALESCE(l.representative_scan_id = s.id, 0), s.notes
            FROM scans s
            JOIN locations l ON l.id = s.location_id
            WHERE s.id = ?1
            "#,
            [scan_id],
            scan_from_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn location_by_slug(&self, slug: &str) -> Result<Option<Location>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, slug, name, type, root_path, notes, representative_scan_id, disabled, created_at FROM locations WHERE slug = ?1",
            [slug],
            location_from_row,
        )
        .optional()
        .map_err(Into::into)
    }

    fn location_by_id(&self, id: &str) -> Result<Option<Location>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, slug, name, type, root_path, notes, representative_scan_id, disabled, created_at FROM locations WHERE id = ?1",
            [id],
            location_from_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn start_scan(&self, location: &Location, offset_path: &Path) -> Result<String> {
        let conn = self.connect()?;
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO scans (id, location_id, offset_path, started_at, status) VALUES (?1, ?2, ?3, ?4, 'running')",
            params![
                id,
                location.id,
                offset_path.to_string_lossy(),
                Utc::now().to_rfc3339(),
            ],
        )?;
        invalidate_duplicate_cache_conn(&conn)?;
        Ok(id)
    }

    /// Atomically creates a missing Unknown location and reserves a running
    /// date-derived scan for it.
    ///
    /// Callers must supply a canonical, validated source root and a validated
    /// offset. For an existing location, this transaction canonicalizes its
    /// stored root and requires it to match, preserving the legacy
    /// path-equivalence behavior without repointing the location. The location
    /// insertion, scan ID reservation, and scan insertion share one
    /// `BEGIN IMMEDIATE` transaction.
    pub fn bootstrap_location_and_start_scan(
        &self,
        slug: &str,
        canonical_root: &Path,
        offset_path: &Path,
        started_at: DateTime<Utc>,
    ) -> Result<BootstrapScan> {
        if slug.trim().is_empty() {
            anyhow::bail!("volume slug must not be blank");
        }
        if canonical_root.as_os_str().is_empty() {
            anyhow::bail!("source path must not be blank");
        }

        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let location = match location_by_slug_from_conn(&tx, slug)? {
            Some(location) => {
                let existing_root = location.root_path.canonicalize().with_context(|| {
                    format!(
                        "canonicalizing existing location {slug} root {}",
                        location.root_path.display()
                    )
                })?;
                if !existing_root.is_dir() {
                    anyhow::bail!(
                        "existing location {slug} root {} is not a directory",
                        location.root_path.display()
                    );
                }
                if existing_root.as_path() != canonical_root {
                    anyhow::bail!(
                        "existing location {slug} root {} does not match source path {}",
                        existing_root.display(),
                        canonical_root.display()
                    );
                }
                location
            }
            None => {
                let location = Location {
                    id: Uuid::new_v4().to_string(),
                    slug: slug.to_string(),
                    name: slug.to_string(),
                    kind: LocationType::Unknown,
                    root_path: canonical_root.to_path_buf(),
                    notes: None,
                    representative_scan_id: None,
                    disabled: false,
                    created_at: Utc::now().to_rfc3339(),
                };
                tx.execute(
                    "INSERT INTO locations (id, slug, name, type, root_path, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        location.id,
                        location.slug,
                        location.name,
                        location.kind.to_string(),
                        location.root_path.to_string_lossy(),
                        location.notes,
                        location.created_at,
                    ],
                )?;
                location
            }
        };
        let scan_id = Self::next_date_derived_scan_id(&tx, &started_at, &location.slug)?;
        tx.execute(
            "INSERT INTO scans (id, location_id, offset_path, started_at, status) VALUES (?1, ?2, ?3, ?4, 'running')",
            params![
                scan_id,
                location.id,
                offset_path.to_string_lossy(),
                started_at.to_rfc3339(),
            ],
        )?;
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(BootstrapScan { location, scan_id })
    }

    /// Atomically inserts a running scan with an ID derived from the supplied
    /// UTC start time and the stored location slug. Collisions use `--2`,
    /// `--3`, and so on, chosen and inserted inside one write transaction.
    pub fn start_scan_with_started_at(
        &self,
        location: &Location,
        offset_path: &Path,
        started_at: DateTime<Utc>,
    ) -> Result<String> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let id = Self::next_date_derived_scan_id(&tx, &started_at, &location.slug)?;
        tx.execute(
            "INSERT INTO scans (id, location_id, offset_path, started_at, status) VALUES (?1, ?2, ?3, ?4, 'running')",
            params![
                id,
                location.id,
                offset_path.to_string_lossy(),
                started_at.to_rfc3339(),
            ],
        )?;
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(id)
    }

    fn next_date_derived_scan_id(
        conn: &Connection,
        started_at: &DateTime<Utc>,
        slug: &str,
    ) -> Result<String> {
        let base = format!("{}--{slug}", started_at.format("%Y%m%dT%H%M%SZ"));
        let mut suffix = 1_u64;
        loop {
            let candidate = if suffix == 1 {
                base.clone()
            } else {
                format!("{base}--{suffix}")
            };
            let exists = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM scans WHERE id = ?1)",
                [candidate.as_str()],
                |row| row.get::<_, bool>(0),
            )?;
            if !exists {
                return Ok(candidate);
            }
            suffix = suffix
                .checked_add(1)
                .context("exhausted date-derived scan ID collision suffixes")?;
        }
    }

    /// Reads the source data needed for an update scan without creating any
    /// new database rows. Callers should validate filesystem/root constraints
    /// after this phase and before `create_update_scan_from_seed`.
    pub fn update_scan_seed(&self, source_scan_id: &str) -> Result<UpdateScanSeed> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let source_scan = scan_by_id_from_conn(&tx, source_scan_id)?
            .with_context(|| format!("unknown source scan: {source_scan_id}"))?;
        let location = location_by_id_from_conn(&tx, &source_scan.location_id)?
            .with_context(|| format!("unknown source location: {}", source_scan.location_id))?;
        let reusable_files = reusable_files_for_scan_conn(&tx, source_scan_id)?;
        let seed = UpdateScanSeed {
            source_scan_id: source_scan_id.to_string(),
            location,
            offset_path: PathBuf::from(&source_scan.offset_path),
            reusable_files,
        };
        tx.commit()?;
        Ok(seed)
    }

    /// Atomically reserves the destination scan and copies the source scan's
    /// exclude policy. It verifies that the seed's source, location, and root
    /// have not changed since the read phase; any setup failure rolls back the
    /// new scan row instead of leaving an orphaned running scan behind.
    pub fn create_update_scan_from_seed(&self, seed: &UpdateScanSeed) -> Result<String> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let source = tx
            .query_row(
                "SELECT location_id, offset_path FROM scans WHERE id = ?1",
                [&seed.source_scan_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
            .with_context(|| format!("unknown source scan: {}", seed.source_scan_id))?;
        let expected_offset = seed.offset_path.to_string_lossy().to_string();
        if source.0 != seed.location.id || source.1 != expected_offset {
            anyhow::bail!("source scan changed while preparing update; retry the update");
        }
        let current_root = tx
            .query_row(
                "SELECT root_path FROM locations WHERE id = ?1",
                [&seed.location.id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .with_context(|| format!("source location disappeared: {}", seed.location.id))?;
        let expected_root = seed.location.root_path.to_string_lossy().to_string();
        if current_root != expected_root {
            anyhow::bail!("source location changed while preparing update; retry the update");
        }

        let scan_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO scans (id, location_id, offset_path, started_at, status) VALUES (?1, ?2, ?3, ?4, 'running')",
            params![
                scan_id,
                seed.location.id,
                expected_offset,
                Utc::now().to_rfc3339(),
            ],
        )?;
        tx.execute(
            r#"
            INSERT OR IGNORE INTO scan_excludes (scan_id, pattern, created_at)
            SELECT ?1, pattern, created_at
            FROM scan_excludes
            WHERE scan_id = ?2
            "#,
            params![scan_id, seed.source_scan_id],
        )?;
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(scan_id)
    }

    pub fn insert_file_batch(&self, files: &[NewFile]) -> Result<()> {
        if files.is_empty() {
            return Ok(());
        }

        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO files (scan_id, kind, path, name, size, blake3, sha256, blake3_light, ctime, mtime, mode, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for file in files {
                stmt.execute(params![
                    file.scan_id,
                    file.kind,
                    file.path,
                    file.name,
                    file.size,
                    file.blake3,
                    file.sha256,
                    file.blake3_light,
                    file.ctime,
                    file.mtime,
                    file.mode,
                    file.error,
                ])?;
            }
        }
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(())
    }

    pub fn reusable_files_for_scan(
        &self,
        scan_id: &str,
    ) -> Result<std::collections::HashMap<String, ReusableFile>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT path, name, size, blake3, sha256, ctime, mtime, mode
            FROM files
            WHERE scan_id = ?1 AND kind = 'file' AND error IS NULL
            "#,
        )?;
        let rows = stmt.query_map([scan_id], |row| {
            Ok(ReusableFile {
                path: row.get(0)?,
                name: row.get(1)?,
                size: row.get(2)?,
                blake3: row.get(3)?,
                sha256: row.get(4)?,
                ctime: row.get(5)?,
                mtime: row.get(6)?,
                mode: row.get(7)?,
            })
        })?;
        let mut files = std::collections::HashMap::new();
        for file in rows {
            let file = file?;
            files.insert(file.path.clone(), file);
        }
        Ok(files)
    }

    pub fn finish_scan(
        &self,
        scan_id: &str,
        file_count: u64,
        dir_count: u64,
        error_count: u64,
        total_bytes: u64,
        status: &str,
    ) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        write_scan_terminal_state(
            &tx,
            scan_id,
            file_count,
            dir_count,
            error_count,
            total_bytes,
            status,
        )?;
        if let Err(invalidation_error) = invalidate_duplicate_cache_conn(&tx) {
            // Do not leave a terminal scan as `running` solely because a
            // cache DELETE failed. The failed transaction rolls back first;
            // the fallback below writes only the terminal scan state. Any
            // retained cache run is safe to keep: the current-scope
            // fingerprint includes terminal status, counts, and finished_at,
            // so current_duplicate_cache_status reports that old run as
            // `stale`, never as a usable matching cache.
            drop(tx);
            let fallback = conn
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .with_context(|| {
                    format!(
                        "duplicate cache invalidation failed while finalizing scan {scan_id}: {invalidation_error:#}; unable to begin status-only fallback"
                    )
                })?;
            write_scan_terminal_state(
                &fallback,
                scan_id,
                file_count,
                dir_count,
                error_count,
                total_bytes,
                status,
            )
            .with_context(|| {
                format!(
                    "duplicate cache invalidation failed while finalizing scan {scan_id}: {invalidation_error:#}; status-only fallback failed"
                )
            })?;
            fallback.commit().with_context(|| {
                format!(
                    "duplicate cache invalidation failed while finalizing scan {scan_id}: {invalidation_error:#}; unable to commit status-only fallback"
                )
            })?;
            return Ok(());
        }
        tx.commit()?;
        Ok(())
    }

    /// Marks scans left in a non-terminal state (running/paused/stopping/…) as
    /// `interrupted`. A freshly opened process owns no in-flight scans, so any
    /// such row is the residue of an abrupt termination (crash, kill, power
    /// loss) — the worker threads that would have finalized it are gone. Returns
    /// the affected scan ids. `interrupted` is terminal-but-not-`complete`, so
    /// these scans stay out of the duplicate / delete-check scope automatically.
    ///
    /// Intended to run once at startup (see `App::open`), before any in-process
    /// scan begins.
    pub fn reconcile_interrupted_scans(&self) -> Result<Vec<String>> {
        let conn = self.connect()?;
        let ids: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM scans WHERE status NOT IN ('complete', 'failed', 'stopped', 'interrupted')",
            )?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        if ids.is_empty() {
            return Ok(ids);
        }
        let now = Utc::now().to_rfc3339();
        // Clear any lingering pause/stop control flag too, but only if the
        // column exists (older databases may predate the control_state ALTER).
        if column_exists(&conn, "scans", "control_state")? {
            conn.execute(
                "UPDATE scans SET status = 'interrupted', finished_at = COALESCE(finished_at, ?1), control_state = NULL \
                 WHERE status NOT IN ('complete', 'failed', 'stopped', 'interrupted')",
                params![now],
            )?;
        } else {
            conn.execute(
                "UPDATE scans SET status = 'interrupted', finished_at = COALESCE(finished_at, ?1) \
                 WHERE status NOT IN ('complete', 'failed', 'stopped', 'interrupted')",
                params![now],
            )?;
        }
        Ok(ids)
    }

    pub fn update_scan_counts(
        &self,
        scan_id: &str,
        file_count: u64,
        dir_count: u64,
        error_count: u64,
        total_bytes: u64,
    ) -> Result<()> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute(
            "UPDATE scans SET file_count = ?1, dir_count = ?2, error_count = ?3, total_bytes = ?4 WHERE id = ?5",
            params![file_count, dir_count, error_count, total_bytes, scan_id],
        )?;
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(())
    }

    pub fn delete_scan(&self, scan_id: &str) -> Result<bool> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let deleted = tx.execute("DELETE FROM scans WHERE id = ?1", [scan_id])?;
        if deleted > 0 {
            invalidate_duplicate_cache_conn(&tx)?;
        }
        tx.commit()?;
        Ok(deleted > 0)
    }

    /// Deletes one visible indexed file or directory path in a single
    /// write transaction. The method rechecks visibility itself so a caller's
    /// earlier tree lookup cannot race a later exclude update. A directory
    /// deletion is rejected when it would also delete an excluded descendant;
    /// excludes are a query filter, never permission to discard raw rows.
    pub fn delete_scan_path(&self, scan_id: &str, path: &str) -> Result<u64> {
        self.delete_visible_scan_path(scan_id, path)
    }

    pub fn delete_visible_scan_path(&self, scan_id: &str, path: &str) -> Result<u64> {
        let normalized = normalize_file_path(path);
        if normalized.is_empty() {
            anyhow::bail!("refusing to delete the scan root; delete the scan instead");
        }
        let descendant_like = format!("{}/%", normalized.replace('%', "\\%").replace('_', "\\_"));
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        ensure_scan_exists(&tx, scan_id)?;

        let direct_kind = tx
            .query_row(
                "SELECT kind FROM files WHERE scan_id = ?1 AND path = ?2",
                params![scan_id, normalized],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let has_descendants = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM files WHERE scan_id = ?1 AND path LIKE ?2 ESCAPE '\\')",
            params![scan_id, descendant_like],
            |row| row.get::<_, bool>(0),
        )?;
        if direct_kind.is_none() && !has_descendants {
            tx.commit()?;
            return Ok(0);
        }

        let is_dir = direct_kind.as_deref() == Some("dir") || has_descendants;
        let visibility = ScanVisibility::load(&tx, [scan_id.to_string()])?;
        if !visibility.is_visible(scan_id, &normalized, is_dir) {
            anyhow::bail!("path is excluded from scan: {normalized}");
        }
        if is_dir && scan_path_has_excluded_descendants_in_conn(&tx, scan_id, &normalized)? {
            anyhow::bail!(
                "refusing to delete directory {normalized}: it contains excluded descendants"
            );
        }

        let deleted = tx.execute(
            "DELETE FROM files WHERE scan_id = ?1 AND (path = ?2 OR path LIKE ?3 ESCAPE '\\')",
            params![scan_id, normalized, descendant_like],
        )? as u64;
        if deleted > 0 {
            refresh_scan_file_counts(&tx, scan_id)?;
            invalidate_duplicate_cache_conn(&tx)?;
        }
        tx.commit()?;
        Ok(deleted)
    }

    /// Resolves an OS action target from one coherent scan visibility state.
    ///
    /// The short immediate transaction is the linearization point between an
    /// action request and a concurrent scan-exclude update: an exclude update
    /// either commits before this method and hides the path, or commits after
    /// this method has authorized and returned the target. The transaction is
    /// intentionally committed before the caller launches the external OS
    /// action, so a slow launcher never holds the database writer lock.
    pub fn resolve_visible_scan_action_target(
        &self,
        scan_id: &str,
        path: &str,
    ) -> Result<VisibleScanActionTarget> {
        let path = normalize_scan_action_path(path)?;
        self.resolve_visible_scan_action_target_normalized(scan_id, &path)?
            .with_context(|| format!("path not found or excluded from scan: {path}"))
    }

    /// Resolves an OS action target if the indexed path is still visible.
    ///
    /// This keeps a stale work item distinct from a failed authorization: a
    /// missing, excluded, or errored entry returns `None`, while malformed
    /// paths and database/transaction failures remain errors.
    pub fn resolve_visible_scan_action_target_if_visible(
        &self,
        scan_id: &str,
        path: &str,
    ) -> Result<Option<VisibleScanActionTarget>> {
        let path = normalize_scan_action_path(path)?;
        self.resolve_visible_scan_action_target_normalized(scan_id, &path)
    }

    fn resolve_visible_scan_action_target_normalized(
        &self,
        scan_id: &str,
        path: &str,
    ) -> Result<Option<VisibleScanActionTarget>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (root_path, offset_path): (String, String) = tx
            .query_row(
                r#"
                SELECT l.root_path, s.offset_path
                FROM scans s
                JOIN locations l ON l.id = s.location_id
                WHERE s.id = ?1
                "#,
                [scan_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .with_context(|| format!("scan or location not found: {scan_id}"))?;
        let offset_path = normalized_scan_action_offset_path(&offset_path)?;

        prepare_excluded_file_ids(&tx, [scan_id.to_string()])?;
        let direct_kind: Option<String> = tx
            .query_row(
                r#"
                SELECT f.kind
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                WHERE f.scan_id = ?1
                  AND f.path = ?2
                  AND f.error IS NULL
                  AND excluded_f.id IS NULL
                "#,
                params![scan_id, &path],
                |row| row.get(0),
            )
            .optional()?;
        let kind = match direct_kind {
            Some(kind) => kind,
            None => {
                let descendant_like = scan_path_descendant_like(&path);
                let has_visible_descendants: bool = tx.query_row(
                    r#"
                    SELECT EXISTS(
                        SELECT 1
                        FROM files f
                        LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                        WHERE f.scan_id = ?1
                          AND f.path LIKE ?2 ESCAPE '\'
                          AND f.error IS NULL
                          AND excluded_f.id IS NULL
                    )
                    "#,
                    params![scan_id, descendant_like],
                    |row| row.get(0),
                )?;
                if !has_visible_descendants {
                    tx.commit()?;
                    return Ok(None);
                }
                "dir".to_string()
            }
        };

        let target = VisibleScanActionTarget {
            filesystem_path: PathBuf::from(root_path).join(offset_path).join(&path),
            kind,
        };
        tx.commit()?;
        Ok(Some(target))
    }

    pub fn scan_excludes(&self, scan_id: &str) -> Result<Vec<ScanExclude>> {
        let conn = self.connect()?;
        ensure_scan_exists(&conn, scan_id)?;
        scan_excludes_from_conn(&conn, scan_id)
    }

    pub fn scan_exclude_patterns(&self, scan_id: &str) -> Result<Vec<String>> {
        let conn = self.connect()?;
        ensure_scan_exists(&conn, scan_id)?;
        scan_exclude_patterns_from_conn(&conn, scan_id)
    }

    /// Returns whether a path remains visible through this scan's persistent
    /// exclude filter. This is intentionally a query-layer predicate: it never
    /// removes indexed rows or changes stored scan counts.
    pub fn scan_path_is_visible(&self, scan_id: &str, path: &str, is_dir: bool) -> Result<bool> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        ensure_scan_exists(&tx, scan_id)?;
        let visibility = ScanVisibility::load(&tx, [scan_id.to_string()])?;
        let visible = visibility.is_visible(scan_id, path, is_dir);
        tx.commit()?;
        Ok(visible)
    }

    /// Reports whether deleting this directory would remove any raw indexed
    /// row hidden by the scan's current exclude filter. This is deliberately a
    /// read-only preflight; `delete_visible_scan_path` performs the same check
    /// again inside its write transaction to close the TOCTOU window.
    pub fn scan_path_has_excluded_descendants(&self, scan_id: &str, path: &str) -> Result<bool> {
        let normalized = normalize_file_path(path);
        if normalized.is_empty() {
            anyhow::bail!("scan root has no deletable path descendants");
        }
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        ensure_scan_exists(&tx, scan_id)?;
        let has_excluded_descendants =
            scan_path_has_excluded_descendants_in_conn(&tx, scan_id, &normalized)?;
        tx.commit()?;
        Ok(has_excluded_descendants)
    }

    pub fn set_scan_excludes(
        &self,
        scan_id: &str,
        patterns: Vec<String>,
    ) -> Result<Vec<ScanExclude>> {
        let patterns = normalize_scan_exclude_patterns(patterns);
        build_scan_exclude_matcher(&patterns)?;

        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        ensure_scan_exists(&tx, scan_id)?;
        tx.execute("DELETE FROM scan_excludes WHERE scan_id = ?1", [scan_id])?;

        let created_at = Utc::now().to_rfc3339();
        {
            let mut stmt = tx.prepare(
                "INSERT INTO scan_excludes (scan_id, pattern, created_at) VALUES (?1, ?2, ?3)",
            )?;
            for pattern in patterns {
                stmt.execute(params![scan_id, pattern, created_at])?;
            }
        }

        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        self.scan_excludes(scan_id)
    }

    pub fn append_exact_scan_exclude(
        &self,
        scan_id: &str,
        path: &str,
        kind: &str,
    ) -> Result<Vec<ScanExclude>> {
        let pattern = exact_scan_exclude_pattern(path, kind)?;
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        ensure_scan_exists(&tx, scan_id)?;
        tx.execute(
            "INSERT OR IGNORE INTO scan_excludes (scan_id, pattern, created_at) VALUES (?1, ?2, ?3)",
            params![scan_id, pattern, Utc::now().to_rfc3339()],
        )?;
        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        self.scan_excludes(scan_id)
    }

    pub fn copy_scan_excludes(&self, source_scan_id: &str, target_scan_id: &str) -> Result<()> {
        let patterns = normalize_scan_exclude_patterns(self.scan_exclude_patterns(source_scan_id)?);
        build_scan_exclude_matcher(&patterns)?;

        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        ensure_scan_exists(&tx, target_scan_id)?;

        let created_at = Utc::now().to_rfc3339();
        {
            let mut stmt = tx.prepare(
                "INSERT OR IGNORE INTO scan_excludes (scan_id, pattern, created_at) VALUES (?1, ?2, ?3)",
            )?;
            for pattern in patterns {
                stmt.execute(params![target_scan_id, pattern, created_at])?;
            }
        }

        invalidate_duplicate_cache_conn(&tx)?;
        tx.commit()?;
        Ok(())
    }

    pub fn current_duplicate_scope_fingerprint(&self) -> Result<Option<String>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let fingerprint = current_duplicate_scope(&tx)?.map(|scope| scope.fingerprint);
        tx.commit()?;
        Ok(fingerprint)
    }

    /// Returns the lifecycle state of the persisted duplicate-count cache for
    /// the *current* effective representative scope. A run from a previous
    /// scope is reported as stale rather than being presented as usable.
    pub fn current_duplicate_cache_status(&self) -> Result<DuplicateCacheStatus> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let status = Self::current_duplicate_cache_status_for_conn(&tx)?;
        tx.commit()?;
        Ok(status)
    }

    fn current_duplicate_cache_status_for_conn(conn: &Connection) -> Result<DuplicateCacheStatus> {
        let Some(scope) = current_duplicate_scope(conn)? else {
            return Ok(DuplicateCacheStatus {
                fingerprint: None,
                status: "empty".to_string(),
                run_id: None,
                total_files: 0,
                processed_files: 0,
                scan_count: 0,
                started_at: None,
                ready_at: None,
                error: None,
            });
        };
        if scope.scans.is_empty() {
            return Ok(DuplicateCacheStatus {
                fingerprint: Some(scope.fingerprint),
                status: "empty".to_string(),
                run_id: None,
                total_files: scope.total_visible_files,
                processed_files: 0,
                scan_count: 0,
                started_at: None,
                ready_at: None,
                error: None,
            });
        }

        let status = conn
            .query_row(
                r#"
                SELECT id, status, total_files, processed_files, started_at, ready_at, error
                FROM duplicate_cache_runs
                WHERE fingerprint = ?1
                "#,
                [&scope.fingerprint],
                |row| {
                    Ok(DuplicateCacheStatus {
                        fingerprint: Some(scope.fingerprint.clone()),
                        status: row.get(1)?,
                        run_id: Some(row.get(0)?),
                        total_files: row.get(2)?,
                        processed_files: row.get(3)?,
                        scan_count: scope.scans.len() as u64,
                        started_at: row.get(4)?,
                        ready_at: row.get(5)?,
                        error: row.get(6)?,
                    })
                },
            )
            .optional()?;
        if let Some(status) = status {
            return Ok(status);
        }

        let stale_runs = scalar_u64(conn, "SELECT COUNT(*) FROM duplicate_cache_runs")?;
        Ok(DuplicateCacheStatus {
            fingerprint: Some(scope.fingerprint),
            status: if stale_runs > 0 {
                "stale".to_string()
            } else {
                "missing".to_string()
            },
            run_id: None,
            total_files: scope.total_visible_files,
            processed_files: 0,
            scan_count: scope.scans.len() as u64,
            started_at: None,
            ready_at: None,
            error: None,
        })
    }

    /// Builds a cache atomically from the current visible duplicate scope. A
    /// run becomes `ready` only after every visible file in the same snapshot
    /// has contributed its path and ancestor counts.
    pub fn rebuild_duplicate_cache_for_current_scope(&self) -> Result<Option<String>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let Some(scope) = current_duplicate_scope(&tx)? else {
            tx.commit()?;
            return Ok(None);
        };
        if scope.scans.is_empty() {
            tx.commit()?;
            return Ok(None);
        }

        let run_id = Uuid::new_v4().to_string();
        let started_at = Utc::now().to_rfc3339();
        tx.execute(
            "DELETE FROM duplicate_cache_runs WHERE fingerprint = ?1",
            [&scope.fingerprint],
        )?;
        tx.execute(
            r#"
            INSERT INTO duplicate_cache_runs
                (id, fingerprint, fingerprint_payload, status, total_files, processed_files, started_at)
            VALUES
                (?1, ?2, ?3, 'building', ?4, 0, ?5)
            "#,
            params![
                run_id,
                scope.fingerprint,
                scope.payload_json,
                scope.total_visible_files,
                started_at,
            ],
        )?;
        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO duplicate_cache_run_scans
                    (run_id, scan_id, location_id, location_slug, scan_started_at, scan_finished_at,
                     file_count, dir_count, error_count, total_bytes)
                VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
            )?;
            for scan in &scope.scans {
                stmt.execute(params![
                    run_id,
                    scan.scan_id,
                    scan.location_id,
                    scan.location_slug,
                    scan.started_at,
                    scan.finished_at,
                    scan.file_count,
                    scan.dir_count,
                    scan.error_count,
                    scan.total_bytes,
                ])?;
            }
        }

        let files = duplicate_cache_scope_files(&tx, &scope.scans)?;
        let path_counts = duplicate_cache_path_counts(&files);
        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO duplicate_cache_path_counts
                    (run_id, scan_id, path, parent_path, kind, file_count, total_size,
                     distinct_count, safe_file_count, warn_file_count, unsafe_file_count,
                     copies_here, copies_away)
                VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                ON CONFLICT(run_id, scan_id, path) DO UPDATE SET
                    parent_path = excluded.parent_path,
                    kind = excluded.kind,
                    file_count = excluded.file_count,
                    total_size = excluded.total_size,
                    distinct_count = excluded.distinct_count,
                    safe_file_count = excluded.safe_file_count,
                    warn_file_count = excluded.warn_file_count,
                    unsafe_file_count = excluded.unsafe_file_count,
                    copies_here = excluded.copies_here,
                    copies_away = excluded.copies_away
                "#,
            )?;
            for ((scan_id, path), counts) in &path_counts {
                let parent_path = path.rsplit_once('/').map(|(parent, _)| parent).unwrap_or("");
                stmt.execute(params![
                    run_id,
                    scan_id,
                    path,
                    parent_path,
                    counts.kind,
                    counts.file_count,
                    counts.total_size,
                    counts.distinct_count,
                    counts.safe_file_count,
                    counts.warn_file_count,
                    counts.unsafe_file_count,
                    counts.copies_here,
                    counts.copies_away,
                ])?;
            }
        }

        let processed_files = files.len() as u64;
        if processed_files == scope.total_visible_files {
            tx.execute(
                r#"
                UPDATE duplicate_cache_runs
                SET status = 'ready', processed_files = ?1, ready_at = ?2
                WHERE id = ?3
                "#,
                params![processed_files, Utc::now().to_rfc3339(), run_id],
            )?;
        } else {
            tx.execute(
                r#"
                UPDATE duplicate_cache_runs
                SET status = 'failed', processed_files = ?1, error = ?2
                WHERE id = ?3
                "#,
                params![
                    processed_files,
                    format!(
                        "processed {processed_files} files but expected {}",
                        scope.total_visible_files
                    ),
                    run_id,
                ],
            )?;
        }
        tx.commit()?;
        Ok(Some(run_id))
    }

    pub fn scans(&self) -> Result<Vec<Scan>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT s.id, s.location_id, l.slug, l.name, s.offset_path, s.started_at, s.finished_at,
                   s.file_count, s.dir_count, s.error_count, s.total_bytes, s.status,
                   COALESCE(l.representative_scan_id = s.id, 0), s.notes
            FROM scans s
            JOIN locations l ON l.id = s.location_id
            ORDER BY s.started_at DESC
            "#,
        )?;
        let rows = stmt.query_map([], scan_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn scan_files(&self, scan_id: &str, limit: u32) -> Result<Vec<FileRow>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        prepare_excluded_file_ids(&tx, [scan_id.to_string()])?;
        let files = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN scans s ON s.id = f.scan_id
                JOIN locations l ON l.id = s.location_id
                WHERE excluded_f.id IS NULL AND f.scan_id = ?1 AND f.kind = 'file'
                ORDER BY f.id DESC
                LIMIT ?2
                "#,
            )?;
            let x = stmt.query_map(params![scan_id, limit], file_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        tx.commit()?;
        Ok(files)
    }

    /// Reads a persisted scan tree page from one SQLite snapshot. Excluded rows
    /// are materialized before matching, directory aggregation, counting, and
    /// pagination. `query.limit` and `query.offset` are intentionally ignored:
    /// this endpoint owns its own page window.
    pub fn scan_tree_page(
        &self,
        scan_id: &str,
        prefix: &str,
        limit: Option<u32>,
        offset: u32,
        depth: u32,
        query: Option<&FileSearchQuery>,
    ) -> Result<TreePage> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        ensure_scan_exists(&tx, scan_id)?;

        // Compute the cache status first. This touches the connection-local
        // visibility table for its effective scope, so reload the precise tree
        // scope immediately afterwards before reading tree rows.
        let duplicate_cache = Self::current_duplicate_cache_status_for_conn(&tx)?;

        let normalized = normalize_tree_prefix(prefix);
        // Tie the tree's duplicate counters to the same cache run this page
        // reports as its status. Only a ready run has materialized path counts.
        let ready_run_id = if duplicate_cache.status == "ready" {
            duplicate_cache.run_id.as_deref()
        } else {
            None
        };
        let filter = query.and_then(|q| q.filter.as_ref());
        // Browsing (depth 1, no filter) is the hot path: aggregate immediate
        // children in SQL, anti-joining the persistent per-scan exclusion cache
        // directly (indexed) instead of copying ~140k excluded ids into a temp
        // table on every navigation. Deeper/filtered reads keep the general
        // row-fold path, which still uses the temp `excluded_file_ids`.
        let entries = if depth == 1 && filter.is_none() {
            ensure_scan_exclusion_cache_ready(&tx, scan_id)?;
            scan_tree_immediate_children(&tx, scan_id, &normalized, ready_run_id)?
        } else {
            let selected_location_id = scan_location_id(&tx, scan_id)?;
            let mut visibility_scan_ids = vec![scan_id.to_string()];
            visibility_scan_ids.extend(duplicate_scope_scan_ids(
                &tx,
                selected_location_id.as_deref(),
            )?);
            prepare_excluded_file_ids(&tx, visibility_scan_ids)?;
            let rows = scan_tree_source_rows(&tx, scan_id, &normalized, ready_run_id)?;
            build_tree_page_entries(rows, &normalized, depth, filter)?
        };
        let total = entries.len() as u64;
        let limit = limit.unwrap_or(DEFAULT_TREE_PAGE_LIMIT).max(1);
        let start = usize::try_from(offset)
            .unwrap_or(usize::MAX)
            .min(entries.len());
        let end = start
            .saturating_add(usize::try_from(limit).unwrap_or(usize::MAX))
            .min(entries.len());
        let has_more = end < entries.len();
        let next_offset = has_more.then(|| u32::try_from(end).unwrap_or(u32::MAX));
        let page = TreePage {
            entries: entries.into_iter().skip(start).take(end - start).collect(),
            limit,
            offset: u32::try_from(start).unwrap_or(u32::MAX),
            total,
            has_more,
            next_offset,
            duplicate_cache,
        };
        tx.commit()?;
        Ok(page)
    }

    /// Exports every descendant file under `prefix` as a tab-separated verdict
    /// table (header + one row per file), for acting on the dedup analysis with
    /// external tools. `backup` filters to a tier ("unsafe" | "warn" | "safe") or
    /// "all". `verdict` uses plain words; hashes are included for exact matching.
    pub fn export_verdicts_tsv(&self, scan_id: &str, prefix: &str, backup: &str) -> Result<String> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        ensure_scan_exists(&tx, scan_id)?;
        let duplicate_cache = Self::current_duplicate_cache_status_for_conn(&tx)?;
        ensure_scan_exclusion_cache_ready(&tx, scan_id)?;

        let normalized = normalize_tree_prefix(prefix);
        let ready_run_id = if duplicate_cache.status == "ready" {
            duplicate_cache.run_id.clone()
        } else {
            None
        };
        let like = if normalized.is_empty() {
            "%".to_string()
        } else {
            format!("{}%", normalized.replace('%', "\\%").replace('_', "\\_"))
        };
        let backup_where = match backup {
            "unsafe" => " AND COALESCE(dc.unsafe_file_count, 0) > 0",
            "warn" => " AND COALESCE(dc.warn_file_count, 0) > 0",
            "safe" => " AND COALESCE(dc.safe_file_count, 0) > 0",
            _ => "",
        };
        let sql = format!(
            "SELECT f.path, f.size, f.blake3, f.blake3_light, f.mtime, \
                    COALESCE(dc.safe_file_count, 0), COALESCE(dc.warn_file_count, 0), \
                    COALESCE(dc.unsafe_file_count, 0), COALESCE(dc.copies_here, 0), \
                    COALESCE(dc.copies_away, 0) \
             FROM files f \
             LEFT JOIN scan_excluded_files excluded_f \
                    ON excluded_f.scan_id = f.scan_id AND excluded_f.file_id = f.id \
             LEFT JOIN duplicate_cache_path_counts dc \
                    ON dc.run_id = ?3 AND dc.scan_id = f.scan_id AND dc.path = f.path \
             WHERE excluded_f.file_id IS NULL AND f.scan_id = ?1 AND f.error IS NULL \
               AND f.kind = 'file' AND f.path LIKE ?2 ESCAPE '\\'{backup_where} \
             ORDER BY f.path"
        );
        let mut out =
            String::from("path\tsize\tverdict\tcopies_here\tcopies_away\tblake3\tblake3_light\tmtime\n");
        let mut stmt = tx.prepare(&sql)?;
        let mut rows = stmt.query(params![scan_id, like, ready_run_id])?;
        while let Some(row) = rows.next()? {
            let path: String = row.get(0)?;
            let size: i64 = row.get(1)?;
            let blake3: String = row.get(2)?;
            let blake3_light: String = row.get(3)?;
            let mtime: Option<String> = row.get(4)?;
            let safe: i64 = row.get(5)?;
            let warn: i64 = row.get(6)?;
            let unsafe_: i64 = row.get(7)?;
            let here: i64 = row.get(8)?;
            let away: i64 = row.get(9)?;
            let verdict = if ready_run_id.is_none() {
                "unknown"
            } else if unsafe_ > 0 {
                if here > 0 {
                    "unsafe_no_offdisk_backup"
                } else {
                    "unsafe_last_copy"
                }
            } else if warn > 0 {
                "partial_light_match"
            } else {
                "safe_exact_elsewhere"
            };
            // Paths/hashes never contain tabs or newlines here, but sanitize
            // defensively so one row can never break the columnar format.
            let clean = |s: &str| s.replace(['\t', '\n', '\r'], " ");
            out.push_str(&format!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
                clean(&path),
                size,
                verdict,
                here,
                away,
                clean(&blake3),
                clean(&blake3_light),
                mtime.as_deref().unwrap_or(""),
            ));
        }
        drop(rows);
        drop(stmt);
        tx.commit()?;
        Ok(out)
    }

    /// Paginated flat list of every descendant file under `prefix`, each carrying
    /// its backup safety status from the cache. Powers the Flat view. `backup`
    /// filters to a tier ("unsafe" | "warn" | "safe") or "all". Filtering happens
    /// in SQL so pagination stays correct over the filtered set.
    pub fn scan_flat_page(
        &self,
        scan_id: &str,
        prefix: &str,
        backup: &str,
        limit: Option<u32>,
        offset: u32,
    ) -> Result<TreePage> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        ensure_scan_exists(&tx, scan_id)?;
        let duplicate_cache = Self::current_duplicate_cache_status_for_conn(&tx)?;
        ensure_scan_exclusion_cache_ready(&tx, scan_id)?;

        let normalized = normalize_tree_prefix(prefix);
        let ready_run_id = if duplicate_cache.status == "ready" {
            duplicate_cache.run_id.clone()
        } else {
            None
        };
        let like = if normalized.is_empty() {
            "%".to_string()
        } else {
            format!("{}%", normalized.replace('%', "\\%").replace('_', "\\_"))
        };
        // Fixed set → safe to inline into the SQL.
        let backup_where = match backup {
            "unsafe" => " AND COALESCE(dc.unsafe_file_count, 0) > 0",
            "warn" => " AND COALESCE(dc.warn_file_count, 0) > 0",
            "safe" => " AND COALESCE(dc.safe_file_count, 0) > 0",
            _ => "",
        };
        let limit = limit.unwrap_or(DEFAULT_TREE_PAGE_LIMIT).max(1);
        let base_from = format!(
            "FROM files f \
             LEFT JOIN scan_excluded_files excluded_f \
                    ON excluded_f.scan_id = f.scan_id AND excluded_f.file_id = f.id \
             LEFT JOIN duplicate_cache_path_counts dc \
                    ON dc.run_id = ?3 AND dc.scan_id = f.scan_id AND dc.path = f.path \
             WHERE excluded_f.file_id IS NULL AND f.scan_id = ?1 AND f.error IS NULL \
               AND f.kind = 'file' AND f.path LIKE ?2 ESCAPE '\\'{backup_where}"
        );

        // The total drives pagination. Counting `files` joined to the cache over
        // every descendant is O(subtree) (~18s on the default DB's 133k-file
        // scan). Instead read it from the pre-rolled cache: summing the
        // per-child rollup columns over `parent_path = prefix` yields the subtree
        // total (files or a backup tier) in O(children) via the parent_path index.
        let covers_cache = match ready_run_id.as_deref() {
            Some(run_id) => duplicate_cache_covers_scan(&tx, run_id, scan_id)?,
            None => false,
        };
        let total = if covers_cache {
            let run_id = ready_run_id.as_deref().expect("covered implies ready run");
            let parent_path = normalized.strip_suffix('/').unwrap_or(&normalized);
            let (files_c, unsafe_c, warn_c, safe_c): (i64, i64, i64, i64) = tx.query_row(
                "SELECT COALESCE(SUM(file_count), 0), COALESCE(SUM(unsafe_file_count), 0), \
                        COALESCE(SUM(warn_file_count), 0), COALESCE(SUM(safe_file_count), 0) \
                 FROM duplicate_cache_path_counts \
                 WHERE run_id = ?1 AND scan_id = ?2 AND parent_path = ?3",
                params![run_id, scan_id, parent_path],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )?;
            let tier = match backup {
                "unsafe" => unsafe_c,
                "warn" => warn_c,
                "safe" => safe_c,
                _ => files_c,
            };
            tier.max(0) as u64
        } else {
            // No cache yet: backup tiers are unknown, so count all visible files
            // under the prefix (the filter has nothing to apply against).
            tx.query_row(
                "SELECT COUNT(*) FROM files f \
                 LEFT JOIN scan_excluded_files excluded_f \
                        ON excluded_f.scan_id = f.scan_id AND excluded_f.file_id = f.id \
                 WHERE excluded_f.file_id IS NULL AND f.scan_id = ?1 AND f.error IS NULL \
                   AND f.kind = 'file' AND f.path LIKE ?2 ESCAPE '\\'",
                params![scan_id, like],
                |row| row.get::<_, i64>(0),
            )? as u64
        };

        let entries = {
            let sql = format!(
                "SELECT f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, \
                        COALESCE(dc.safe_file_count, 0), COALESCE(dc.warn_file_count, 0), \
                        COALESCE(dc.unsafe_file_count, 0), COALESCE(dc.copies_here, 0), \
                        COALESCE(dc.copies_away, 0) \
                 {base_from} ORDER BY f.path LIMIT ?4 OFFSET ?5"
            );
            let mut stmt = tx.prepare(&sql)?;
            let rows = stmt.query_map(
                params![scan_id, like, ready_run_id, limit, offset],
                |row| {
                    let safe: i64 = row.get(8)?;
                    let warn: i64 = row.get(9)?;
                    let unsafe_: i64 = row.get(10)?;
                    let backup_status = if unsafe_ > 0 {
                        "unsafe"
                    } else if warn > 0 {
                        "warn"
                    } else if safe > 0 {
                        "safe"
                    } else {
                        ""
                    };
                    Ok(TreeEntry {
                        name: row.get(1)?,
                        path: row.get(0)?,
                        kind: "file".to_string(),
                        size: row.get::<_, i64>(2)?.max(0) as u64,
                        file_count: 1,
                        blake3: Some(row.get(3)?),
                        sha256: Some(row.get(4)?),
                        ctime: row.get(5)?,
                        mtime: row.get(6)?,
                        mode: row.get(7)?,
                        duplicate_file_count: 0,
                        original_file_count: 0,
                        same_scan_duplicate_file_count: 0,
                        distinct_count: 1,
                        backup_status: backup_status.to_string(),
                        safe_count: 0,
                        unsafe_count: 0,
                        warn_count: 0,
                        copies_here: row.get::<_, i64>(11)?.max(0) as u64,
                        copies_away: row.get::<_, i64>(12)?.max(0) as u64,
                    })
                },
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        let end = offset as usize + entries.len();
        let has_more = (end as u64) < total;
        let next_offset = has_more.then(|| end as u32);
        let page = TreePage {
            entries,
            limit,
            offset,
            total,
            has_more,
            next_offset,
            duplicate_cache,
        };
        tx.commit()?;
        Ok(page)
    }

    pub fn delete_check(&self, scan_id: &str, prefix: &str) -> Result<DeleteCheckResult> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let normalized = normalize_tree_prefix(prefix);
        let include_all = normalized.is_empty();
        let selected_paths = if include_all {
            Vec::new()
        } else {
            vec![normalized]
        };
        prepare_selected_paths(&tx, &selected_paths)?;
        let result = delete_check_for_selection(&tx, scan_id, include_all, false)?;
        tx.commit()?;
        Ok(result)
    }

    pub fn delete_check_paths(&self, scan_id: &str, paths: &[String]) -> Result<DeleteCheckResult> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let mut selected_paths = paths
            .iter()
            .map(|path| normalize_file_path(path))
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>();
        selected_paths.sort();
        selected_paths.dedup();
        prepare_selected_paths(&tx, &selected_paths)?;
        let result = delete_check_for_selection(&tx, scan_id, false, true)?;
        tx.commit()?;
        Ok(result)
    }

    pub fn find_files(&self, query: &str, limit: u32) -> Result<Vec<FileRow>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let scan_ids = scan_ids_matching_file_query(&tx, &like)?;
        prepare_excluded_file_ids(&tx, scan_ids)?;
        let files = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN scans s ON s.id = f.scan_id
                JOIN locations l ON l.id = s.location_id
                WHERE excluded_f.id IS NULL
                  AND (f.path LIKE ?1 ESCAPE '\' OR f.name LIKE ?1 ESCAPE '\')
                ORDER BY s.started_at DESC, f.path
                LIMIT ?2
                "#,
            )?;
            let x = stmt.query_map(params![like, limit], file_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        tx.commit()?;
        Ok(files)
    }

    /// Executes the structured `files.search` query against visible indexed
    /// rows. Scope selection, exclude filtering, AST evaluation, offset, and
    /// limit all happen inside one read transaction so a hidden row cannot
    /// consume a page slot or leak through a concurrent exclude update.
    pub fn search_files(&self, query: &FileSearchQuery) -> Result<Vec<FileRow>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let scan_ids = search_scope_scan_ids(&tx, query)?;
        if scan_ids.is_empty() {
            tx.commit()?;
            return Ok(Vec::new());
        }
        prepare_search_scope(&tx, &scan_ids)?;
        prepare_excluded_file_ids(&tx, scan_ids)?;
        let rows = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256,
                       f.ctime, f.mtime, f.mode, f.error
                FROM files f
                JOIN search_file_scope scope ON scope.scan_id = f.scan_id
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN scans s ON s.id = f.scan_id
                JOIN locations l ON l.id = s.location_id
                WHERE excluded_f.id IS NULL
                ORDER BY s.started_at DESC, f.path
                "#,
            )?;
            let x = stmt.query_map([], file_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        let mut matches = Vec::new();
        for file in rows {
            let matched = query
                .filter
                .as_ref()
                .map(|filter| filter_matches(filter, &file))
                .transpose()?
                .unwrap_or(true);
            if matched {
                matches.push(file);
            }
        }
        let offset = usize::try_from(query.effective_offset()).unwrap_or(usize::MAX);
        let limit = usize::try_from(query.effective_limit()).unwrap_or(usize::MAX);
        let results = matches.into_iter().skip(offset).take(limit).collect();
        tx.commit()?;
        Ok(results)
    }

    pub fn file_occurrences(&self, blake3: &str, size: u64) -> Result<Vec<FileOccurrence>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let scan_ids = scan_ids_with_file_occurrence(&tx, blake3, size)?;
        prepare_excluded_file_ids(&tx, scan_ids)?;
        let occurrences = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.scan_id, s.started_at, s.finished_at, s.status, l.slug, l.name,
                       f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN scans s ON s.id = f.scan_id
                JOIN locations l ON l.id = s.location_id
                WHERE excluded_f.id IS NULL
                  AND f.kind = 'file' AND f.error IS NULL AND f.blake3 = ?1 AND f.size = ?2
                ORDER BY l.slug, s.started_at DESC, f.path
                "#,
            )?;
            let x = stmt.query_map(params![blake3, size], occurrence_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        tx.commit()?;
        Ok(occurrences)
    }

    /// Validates a visible file origin and pages its visible content
    /// occurrences in one consistent snapshot. This is the transport-safe
    /// replacement for an origin visibility check followed by a separate
    /// `file_occurrences` call.
    pub fn visible_file_occurrences_page(
        &self,
        scan_id: &str,
        path: &str,
        blake3: &str,
        size: u64,
        requested_limit: u32,
        requested_offset: u64,
    ) -> Result<FileOccurrencePage> {
        let path = normalize_file_path(path);
        if path.is_empty() {
            anyhow::bail!("file occurrence origin must not be the scan root");
        }
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        ensure_scan_exists(&tx, scan_id)?;
        let mut visibility_scan_ids = scan_ids_with_file_occurrence(&tx, blake3, size)?;
        if !visibility_scan_ids.iter().any(|candidate| candidate == scan_id) {
            visibility_scan_ids.push(scan_id.to_string());
        }
        prepare_excluded_file_ids(&tx, visibility_scan_ids)?;

        let origin = tx
            .query_row(
                r#"
                SELECT f.kind, f.blake3, f.size
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                WHERE excluded_f.id IS NULL
                  AND f.scan_id = ?1
                  AND f.path = ?2
                  AND f.error IS NULL
                "#,
                params![scan_id, path],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, u64>(2)?,
                    ))
                },
            )
            .optional()?
            .with_context(|| "file occurrence origin was not found or is excluded")?;
        if origin.0 != "file" {
            anyhow::bail!("file occurrence origin must be a file");
        }
        if origin.1 != blake3 || origin.2 != size {
            anyhow::bail!("file occurrence origin does not match the requested content hash");
        }

        let occurrences = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.scan_id, s.started_at, s.finished_at, s.status, l.slug, l.name,
                       f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN scans s ON s.id = f.scan_id
                JOIN locations l ON l.id = s.location_id
                WHERE excluded_f.id IS NULL
                  AND f.kind = 'file'
                  AND f.error IS NULL
                  AND f.blake3 = ?1
                  AND f.size = ?2
                ORDER BY l.slug, s.started_at DESC, f.path
                "#,
            )?;
            let x = stmt.query_map(params![blake3, size], occurrence_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        let total = occurrences.len();
        let limit = requested_limit.max(1);
        let start = usize::try_from(requested_offset)
            .unwrap_or(usize::MAX)
            .min(total);
        let end = start
            .saturating_add(usize::try_from(limit).unwrap_or(usize::MAX))
            .min(total);
        let has_more = end < total;
        let page = FileOccurrencePage {
            occurrences: occurrences.into_iter().skip(start).take(end - start).collect(),
            total: u64::try_from(total).unwrap_or(u64::MAX),
            limit,
            offset: u64::try_from(start).unwrap_or(u64::MAX),
            has_more,
            next_offset: has_more.then(|| u64::try_from(end).unwrap_or(u64::MAX)),
        };
        tx.commit()?;
        Ok(page)
    }

    pub fn thumbnail(&self, blake3: &str, size: u64) -> Result<Option<StoredThumbnail>> {
        let conn = self.connect()?;
        conn.query_row(
            r#"
            SELECT blake3, size, mime_type, width, height, data, created_at
            FROM file_thumbnails
            WHERE blake3 = ?1 AND size = ?2
            "#,
            params![blake3, size],
            |row| {
                Ok(StoredThumbnail {
                    blake3: row.get(0)?,
                    size: row.get(1)?,
                    mime_type: row.get(2)?,
                    width: row.get(3)?,
                    height: row.get(4)?,
                    data: row.get(5)?,
                    created_at: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn upsert_thumbnail(&self, thumbnail: NewThumbnail) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            r#"
            INSERT INTO file_thumbnails (blake3, size, mime_type, width, height, data, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(blake3, size) DO UPDATE SET
                mime_type = excluded.mime_type,
                width = excluded.width,
                height = excluded.height,
                data = excluded.data,
                created_at = excluded.created_at
            "#,
            params![
                thumbnail.blake3,
                thumbnail.size,
                thumbnail.mime_type,
                thumbnail.width,
                thumbnail.height,
                thumbnail.data,
                Utc::now().to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn thumbnail_candidates(
        &self,
        scan_id: &str,
        prefix: &str,
        recursive: bool,
    ) -> Result<Vec<ThumbnailCandidate>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        prepare_excluded_file_ids(&tx, [scan_id.to_string()])?;
        let normalized = normalize_tree_prefix(prefix);
        let like = if normalized.is_empty() {
            "%".to_string()
        } else {
            format!("{}%", normalized.replace('%', "\\%").replace('_', "\\_"))
        };
        let candidates = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.blake3, f.size, f.path
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                WHERE excluded_f.id IS NULL
                  AND f.scan_id = ?1
                  AND f.kind = 'file'
                  AND f.error IS NULL
                  AND f.path LIKE ?2 ESCAPE '\'
                  AND (?3 OR instr(substr(f.path, length(?4) + 1), '/') = 0)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM file_thumbnails t
                      WHERE t.blake3 = f.blake3 AND t.size = f.size
                  )
                ORDER BY f.path
                "#,
            )?;
            let x = stmt.query_map(params![scan_id, like, recursive, normalized], |row| {
                Ok(ThumbnailCandidate {
                    blake3: row.get(0)?,
                    size: row.get(1)?,
                    path: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        tx.commit()?;
        Ok(candidates)
    }

    pub fn thumbnail_candidates_paths(
        &self,
        scan_id: &str,
        paths: &[String],
        recursive: bool,
    ) -> Result<Vec<ThumbnailCandidate>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        prepare_excluded_file_ids(&tx, [scan_id.to_string()])?;
        let mut selected_paths = paths
            .iter()
            .map(|path| normalize_file_path(path))
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>();
        selected_paths.sort();
        selected_paths.dedup();
        prepare_selected_paths(&tx, &selected_paths)?;
        let candidates = {
            let mut stmt = tx.prepare(
                r#"
                SELECT DISTINCT f.blake3, f.size, f.path
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                WHERE excluded_f.id IS NULL
                  AND f.scan_id = ?1
                  AND f.kind = 'file'
                  AND f.error IS NULL
                  AND EXISTS (
                      SELECT 1
                      FROM selected_paths p
                      WHERE f.path = p.path
                         OR (
                             substr(f.path, 1, length(p.path) + 1) = p.path || '/'
                             AND (?2 OR instr(substr(f.path, length(p.path) + 2), '/') = 0)
                         )
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM file_thumbnails t
                      WHERE t.blake3 = f.blake3 AND t.size = f.size
                  )
                ORDER BY f.path
                "#,
            )?;
            let x = stmt.query_map(params![scan_id, recursive], |row| {
                Ok(ThumbnailCandidate {
                    blake3: row.get(0)?,
                    size: row.get(1)?,
                    path: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };
        tx.commit()?;
        Ok(candidates)
    }

    pub fn duplicate_groups(&self, limit: u32) -> Result<Vec<DuplicateGroup>> {
        self.duplicate_groups_for_scans(limit, &[])
    }

    /// Returns duplicate groups from either an explicit scan selection or the
    /// normal representative/latest-complete scan scope when no scans are
    /// selected. A group requires files from at least two locations, even when
    /// callers select multiple scans from the same location.
    pub fn duplicate_groups_for_scans(
        &self,
        limit: u32,
        scan_ids: &[String],
    ) -> Result<Vec<DuplicateGroup>> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let visibility_scan_ids = prepare_duplicate_group_scope(&tx, scan_ids)?;
        prepare_excluded_file_ids(&tx, visibility_scan_ids)?;
        let groups = {
            let mut stmt = tx.prepare(
                r#"
                SELECT f.blake3, f.size, COUNT(DISTINCT scope.location_id) AS copies
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN duplicate_group_scope scope ON scope.scan_id = f.scan_id
                WHERE excluded_f.id IS NULL
                  AND f.kind = 'file' AND f.error IS NULL AND f.size > 0
                GROUP BY f.blake3, f.size
                HAVING COUNT(DISTINCT scope.location_id) > 1
                ORDER BY size DESC
                LIMIT ?1
                "#,
            )?;
            let x = stmt.query_map([limit], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?,
                    row.get::<_, u64>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
            x
        };

        let mut out = Vec::new();
        for (blake3, size, count) in groups {
            let files = {
                let mut files_stmt = tx.prepare(
                    r#"
                    SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
                    FROM files f
                    LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                    JOIN scans s ON s.id = f.scan_id
                    JOIN locations l ON l.id = s.location_id
                    JOIN duplicate_group_scope scope ON scope.scan_id = f.scan_id
                    WHERE excluded_f.id IS NULL
                      AND f.kind = 'file' AND f.blake3 = ?1 AND f.size = ?2
                      AND f.id IN (
                        SELECT MIN(scoped.id)
                        FROM files scoped
                        LEFT JOIN excluded_file_ids excluded_scoped ON excluded_scoped.id = scoped.id
                        JOIN duplicate_group_scope scoped_scope ON scoped_scope.scan_id = scoped.scan_id
                        WHERE excluded_scoped.id IS NULL
                          AND scoped.kind = 'file' AND scoped.blake3 = ?1 AND scoped.size = ?2 AND scoped.error IS NULL
                        GROUP BY scoped.scan_id
                      )
                    ORDER BY l.slug, f.path
                    "#,
                )?;
                let x = files_stmt
                    .query_map(params![blake3, size], file_from_row)?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                x
            };
            let file_kind =
                duplicate_group_file_kind(files.iter().map(|file| file.file_kind.as_str()));
            out.push(DuplicateGroup {
                blake3,
                size,
                count,
                file_kind,
                files,
            });
        }
        tx.commit()?;
        Ok(out)
    }

    pub fn overview(&self) -> Result<Overview> {
        let mut conn = self.connect()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let visibility_scan_ids = duplicate_scope_scan_ids(&tx, None)?;
        prepare_excluded_file_ids(&tx, visibility_scan_ids)?;
        let location_count = scalar_u64(&tx, "SELECT COUNT(*) FROM locations")?;
        let scan_count = scalar_u64(&tx, "SELECT COUNT(*) FROM scans")?;
        // These inventory totals intentionally stay physical: excludes are
        // non-destructive per-scan query filters, not a mutation of stored
        // scan counts or indexed bytes.
        let file_count = scalar_u64(&tx, "SELECT COUNT(*) FROM files WHERE kind = 'file'")?;
        let total_bytes = scalar_u64(
            &tx,
            "SELECT COALESCE(SUM(size), 0) FROM files WHERE kind = 'file' AND error IS NULL",
        )?;
        let duplicate_groups = scalar_u64(
            &tx,
            r#"
            WITH duplicate_scope AS (
                SELECT l.id AS location_id,
                       COALESCE(
                           l.representative_scan_id,
                           (
                               SELECT s2.id
                               FROM scans s2
                               WHERE s2.location_id = l.id AND s2.status = 'complete' AND s2.hash_policy != 'light'
                               ORDER BY s2.started_at DESC
                               LIMIT 1
                           )
                       ) AS scan_id
                FROM locations l
                WHERE l.disabled = 0
            )
            SELECT COUNT(*)
            FROM (
                SELECT 1
                FROM files f
                LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
                JOIN duplicate_scope ds ON ds.scan_id = f.scan_id
                WHERE excluded_f.id IS NULL
                  AND f.kind = 'file' AND f.error IS NULL AND f.size > 0
                GROUP BY f.blake3, f.size
                HAVING COUNT(DISTINCT ds.location_id) > 1
            )
            "#,
        )?;
        let overview = Overview {
            location_count,
            scan_count,
            file_count,
            total_bytes,
            duplicate_groups,
        };
        tx.commit()?;
        Ok(overview)
    }
}

fn scalar_u64(conn: &Connection, sql: &str) -> Result<u64> {
    conn.query_row(sql, [], |row| row.get(0))
        .map_err(Into::into)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(columns.iter().any(|name| name == column))
}

/// SQLite cannot alter a CHECK constraint in place. Older databases accepted
/// only local/disk/nas location types, so rebuild that one table when its
/// stored DDL does not admit `unknown`. Foreign-key enforcement is disabled
/// only for the table swap, then the rebuilt graph is checked before commit.
fn migrate_locations_type_check(conn: &mut Connection) -> Result<()> {
    if locations_type_check_supports_unknown(conn)? {
        return Ok(());
    }

    let foreign_keys_enabled = conn.query_row("PRAGMA foreign_keys", [], |row| {
        row.get::<_, i64>(0)
    })? != 0;
    if foreign_keys_enabled {
        conn.pragma_update(None, "foreign_keys", "OFF")?;
    }

    let migration_result = (|| -> Result<()> {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(
            r#"
            CREATE TABLE locations__type_unknown_migration (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('unknown', 'local', 'disk', 'nas')),
                root_path TEXT NOT NULL,
                notes TEXT,
                representative_scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,
                disabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            INSERT INTO locations__type_unknown_migration (
                id, slug, name, type, root_path, notes, representative_scan_id, disabled,
                created_at
            )
            SELECT id, slug, name, type, root_path, notes, representative_scan_id, disabled,
                   created_at
            FROM locations;

            DROP TABLE locations;
            ALTER TABLE locations__type_unknown_migration RENAME TO locations;
            CREATE INDEX idx_locations_slug ON locations(slug);
            "#,
        )?;
        ensure_foreign_keys_valid(&tx)?;
        tx.commit()?;
        Ok(())
    })();

    let restore_foreign_keys_result = if foreign_keys_enabled {
        conn.pragma_update(None, "foreign_keys", "ON")
    } else {
        Ok(())
    };

    match migration_result {
        Ok(()) => {
            restore_foreign_keys_result?;
            Ok(())
        }
        Err(error) => {
            restore_foreign_keys_result?;
            Err(error)
        }
    }
}

fn locations_type_check_supports_unknown(conn: &Connection) -> Result<bool> {
    let schema: String = conn.query_row(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'locations'",
        [],
        |row| row.get(0),
    )?;
    Ok(schema.to_ascii_lowercase().contains("'unknown'"))
}

fn ensure_foreign_keys_valid(conn: &Connection) -> Result<()> {
    let mut statement = conn.prepare("PRAGMA foreign_key_check")?;
    let mut rows = statement.query([])?;
    if let Some(row) = rows.next()? {
        let table: String = row.get(0)?;
        let rowid: Option<i64> = row.get(1)?;
        let parent: String = row.get(2)?;
        anyhow::bail!(
            "foreign-key check failed after locations type migration: table={table}, rowid={}, parent={parent}",
            rowid.map_or_else(|| "unknown".to_string(), |value| value.to_string())
        );
    }
    Ok(())
}

fn normalize_tree_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim_matches('/');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}/")
    }
}

fn normalize_file_path(path: &str) -> String {
    path.trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect::<Vec<_>>()
        .join("/")
}

/// Normalizes an untrusted action path without allowing it to escape the
/// scan's stored root. Both separator styles are parsed so Windows-form input
/// cannot regain traversal semantics after validation.
fn normalize_scan_action_path(path: &str) -> Result<String> {
    let path = normalize_scan_action_relative_path(path, "scan path")?;
    if path.is_empty() {
        anyhow::bail!("path must not be the scan root");
    }
    Ok(path)
}

/// Converts the persisted scan offset into a safe location-relative action
/// root. Existing malformed rows fail closed instead of being silently
/// rewritten before an OS action is launched.
fn normalized_scan_action_offset_path(offset_path: &str) -> Result<PathBuf> {
    Ok(PathBuf::from(normalize_scan_action_relative_path(
        offset_path,
        "scan offset path",
    )?))
}

fn normalize_scan_action_relative_path(path: &str, label: &str) -> Result<String> {
    if path.contains('\0') {
        anyhow::bail!("{label} may not contain a NUL byte");
    }

    let mut prefix = path.chars();
    if prefix.next().is_some_and(is_scan_action_path_separator)
        && prefix.next().is_some_and(is_scan_action_path_separator)
    {
        anyhow::bail!("{label} may not contain a UNC or device prefix");
    }

    let mut normalized = Vec::new();
    for part in path.split(is_scan_action_path_separator) {
        match part {
            "" | "." => {}
            ".." => anyhow::bail!("{label} may not contain traversal"),
            _ if looks_like_windows_drive_prefix(part) => {
                anyhow::bail!("{label} may not contain a Windows drive prefix")
            }
            _ => normalized.push(part),
        }
    }
    Ok(normalized.join("/"))
}

fn is_scan_action_path_separator(character: char) -> bool {
    character == '/' || character == '\\'
}

fn looks_like_windows_drive_prefix(part: &str) -> bool {
    let bytes = part.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn scan_path_descendant_like(path: &str) -> String {
    let escaped = path
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("{escaped}/%")
}

pub fn exact_scan_exclude_pattern(path: &str, kind: &str) -> Result<String> {
    let normalized = normalize_file_path(path);
    if normalized.is_empty() {
        anyhow::bail!("refusing to exclude the scan root; delete the scan instead");
    }

    let escaped = escape_gitignore_literal(&normalized);
    match kind {
        "dir" => Ok(format!("/{escaped}/")),
        "file" => Ok(format!("/{escaped}")),
        other => anyhow::bail!("unknown scan exclude kind: {other}"),
    }
}

pub fn build_scan_exclude_matcher(patterns: &[String]) -> Result<Option<Gitignore>> {
    if patterns.iter().all(|pattern| pattern.trim().is_empty()) {
        return Ok(None);
    }

    let mut builder = GitignoreBuilder::new("/");
    for pattern in patterns {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            continue;
        }
        builder
            .add_line(None, pattern)
            .with_context(|| format!("invalid scan exclude pattern: {pattern}"))?;
    }
    builder
        .build()
        .map(Some)
        .context("building scan exclude matcher")
}

pub fn scan_path_is_excluded(matcher: &Option<Gitignore>, path: &str, is_dir: bool) -> bool {
    let Some(matcher) = matcher else {
        return false;
    };

    let normalized = normalize_file_path(path);
    if normalized.is_empty() {
        return false;
    }
    matcher
        .matched_path_or_any_parents(Path::new(&normalized), is_dir)
        .is_ignore()
}

fn escape_gitignore_literal(path: &str) -> String {
    let mut escaped = String::with_capacity(path.len());
    for ch in path.chars() {
        match ch {
            '\\' | '*' | '?' | '[' | ']' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn normalize_scan_exclude_patterns(patterns: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for pattern in patterns {
        let pattern = pattern.trim().to_string();
        if pattern.is_empty() || !seen.insert(pattern.clone()) {
            continue;
        }
        normalized.push(pattern);
    }
    normalized
}

fn ensure_scan_exists(conn: &Connection, scan_id: &str) -> Result<()> {
    let exists: Option<i64> = conn
        .query_row("SELECT 1 FROM scans WHERE id = ?1", [scan_id], |row| {
            row.get(0)
        })
        .optional()?;
    if exists.is_none() {
        anyhow::bail!("scan not found: {scan_id}");
    }
    Ok(())
}

fn scan_excludes_from_conn(conn: &Connection, scan_id: &str) -> Result<Vec<ScanExclude>> {
    let mut stmt = conn.prepare(
        "SELECT id, scan_id, pattern, created_at FROM scan_excludes WHERE scan_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map([scan_id], |row| {
        Ok(ScanExclude {
            id: row.get(0)?,
            scan_id: row.get(1)?,
            pattern: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn scan_exclude_patterns_from_conn(conn: &Connection, scan_id: &str) -> Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT pattern FROM scan_excludes WHERE scan_id = ?1 ORDER BY id")?;
    let rows = stmt.query_map([scan_id], |row| row.get::<_, String>(0))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

/// Builds the connection-local exclusion set for a public query.
///
/// The raw `files` table stays authoritative for ingestion, scan reuse, and
/// stored counts. Public query methods anti-join this temporary table only
/// after this function has applied every involved scan's matcher in Rust.
fn prepare_excluded_file_ids<I>(conn: &Connection, scan_ids: I) -> Result<()>
where
    I: IntoIterator<Item = String>,
{
    let visibility = ScanVisibility::load(conn, scan_ids)?;
    conn.execute(
        "CREATE TEMP TABLE IF NOT EXISTS excluded_file_ids (id INTEGER PRIMARY KEY)",
        [],
    )?;
    conn.execute("DELETE FROM excluded_file_ids", [])?;

    for (scan_id, matcher) in &visibility.matchers {
        if matcher.is_none() {
            continue;
        }
        // Materialize (or reuse) the persistent per-scan exclusion set instead
        // of glob-matching every file on every call, then copy the matched ids
        // into the connection-local temp table the queries anti-join.
        ensure_scan_exclusion_cache(conn, scan_id, matcher)?;
        conn.execute(
            "INSERT OR IGNORE INTO excluded_file_ids (id)
             SELECT file_id FROM scan_excluded_files WHERE scan_id = ?1",
            [scan_id],
        )?;
    }

    Ok(())
}

/// Ensures `scan_excluded_files` holds the current exclusion set for `scan_id`.
/// The set only changes when the exclude patterns change or the scan's files
/// change, so a fingerprint of (patterns, file_count, max_id) gates the rebuild:
/// the expensive O(files) glob pass runs once, and every later browse/search
/// just reads the cached ids.
fn ensure_scan_exclusion_cache(
    conn: &Connection,
    scan_id: &str,
    matcher: &Option<Gitignore>,
) -> Result<()> {
    let patterns: String = {
        let mut stmt =
            conn.prepare("SELECT pattern FROM scan_excludes WHERE scan_id = ?1 ORDER BY id")?;
        let rows = stmt.query_map([scan_id], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?.join("\n")
    };
    let (file_count, max_id): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COALESCE(MAX(id), 0) FROM files WHERE scan_id = ?1",
        [scan_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let fingerprint = format!("{patterns}\u{1f}{file_count}\u{1f}{max_id}");

    let stored: Option<String> = conn
        .query_row(
            "SELECT fingerprint FROM scan_exclusion_cache WHERE scan_id = ?1",
            [scan_id],
            |row| row.get(0),
        )
        .optional()?;
    if stored.as_deref() == Some(fingerprint.as_str()) {
        return Ok(());
    }

    conn.execute("DELETE FROM scan_excluded_files WHERE scan_id = ?1", [scan_id])?;
    let mut visible_file_count: i64 = 0;
    let mut visible_total_bytes: i64 = 0;
    {
        let mut files_stmt =
            conn.prepare("SELECT id, path, kind, size, error FROM files WHERE scan_id = ?1")?;
        let mut insert_stmt = conn.prepare(
            "INSERT OR IGNORE INTO scan_excluded_files (scan_id, file_id) VALUES (?1, ?2)",
        )?;
        let rows = files_stmt.query_map([scan_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                row.get::<_, Option<String>>(4)?,
            ))
        })?;
        for row in rows {
            let (id, path, kind, size, error) = row?;
            let is_dir = kind == "dir";
            let excluded = scan_path_is_excluded(matcher, &path, is_dir);
            if excluded {
                insert_stmt.execute(params![scan_id, id])?;
            } else if !is_dir && error.is_none() {
                // Mirror `visible_scan_file_totals`: non-excluded files without an
                // error. Computed here so navigation can read it in O(1).
                visible_file_count += 1;
                visible_total_bytes += size.max(0);
            }
        }
    }
    conn.execute(
        "INSERT OR REPLACE INTO scan_exclusion_cache
            (scan_id, fingerprint, built_at, visible_file_count, visible_total_bytes)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            scan_id,
            fingerprint,
            Utc::now().to_rfc3339(),
            visible_file_count,
            visible_total_bytes
        ],
    )?;
    Ok(())
}

/// Ensures the persistent exclusion set for one scan is current, building the
/// matcher from that scan's patterns. Cheap after the first build (fingerprint
/// gated). Callers that anti-join `scan_excluded_files` directly (the browse hot
/// path) use this instead of `prepare_excluded_file_ids`, avoiding a per-query
/// copy of every excluded id into a temp table.
fn ensure_scan_exclusion_cache_ready(conn: &Connection, scan_id: &str) -> Result<()> {
    let patterns: Vec<String> = {
        let mut stmt =
            conn.prepare("SELECT pattern FROM scan_excludes WHERE scan_id = ?1 ORDER BY id")?;
        let rows = stmt.query_map([scan_id], |row| row.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let matcher = build_scan_exclude_matcher(&patterns)?;
    ensure_scan_exclusion_cache(conn, scan_id, &matcher)
}

/// Browsing hot case (depth 1, no filter). When a ready duplicate cache covers
/// this scan, immediate children are read straight from the pre-rolled
/// `duplicate_cache_path_counts` rows via the `parent_path` index — an
/// O(children) lookup that never scans the subtree. Otherwise it falls back to
/// aggregating descendant file rows in SQL (O(subtree), correct but slow), which
/// is only hit before the cache is built.
fn scan_tree_immediate_children(
    conn: &Connection,
    scan_id: &str,
    normalized_prefix: &str,
    ready_run_id: Option<&str>,
) -> Result<Vec<TreeEntry>> {
    if let Some(run_id) = ready_run_id {
        if duplicate_cache_covers_scan(conn, run_id, scan_id)? {
            return scan_tree_immediate_children_from_cache(
                conn,
                scan_id,
                normalized_prefix,
                run_id,
            );
        }
    }
    scan_tree_immediate_children_aggregate(conn, scan_id, normalized_prefix, ready_run_id)
}

/// True when the ready cache run has materialized rows for this scan, so the
/// pre-rolled `parent_path` fast path can be used instead of subtree aggregation.
fn duplicate_cache_covers_scan(conn: &Connection, run_id: &str, scan_id: &str) -> Result<bool> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM duplicate_cache_path_counts WHERE run_id = ?1 AND scan_id = ?2 LIMIT 1",
            params![run_id, scan_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

/// O(children) immediate-children read: every direct child (file or dir) is a
/// single pre-rolled cache row selected by the `parent_path` index. Dir rows
/// already carry subtree file_count/total_size and duplicate/backup rollups;
/// `files` is joined only to recover each child's own metadata (hashes, times,
/// mode). No descendant scan, no temp exclusion table.
fn scan_tree_immediate_children_from_cache(
    conn: &Connection,
    scan_id: &str,
    normalized_prefix: &str,
    run_id: &str,
) -> Result<Vec<TreeEntry>> {
    let parent_path = normalized_prefix
        .strip_suffix('/')
        .unwrap_or(normalized_prefix);
    let mut stmt = conn.prepare(
        r#"
        SELECT dc.path, dc.kind, dc.file_count, dc.total_size,
               dc.duplicate_file_count, dc.original_file_count, dc.same_scan_duplicate_file_count,
               dc.safe_file_count, dc.warn_file_count, dc.unsafe_file_count,
               dc.copies_here, dc.copies_away,
               f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.size,
               dc.distinct_count
        FROM duplicate_cache_path_counts dc
        LEFT JOIN files f ON f.scan_id = dc.scan_id AND f.path = dc.path
        WHERE dc.run_id = ?1 AND dc.scan_id = ?2 AND dc.parent_path = ?3
        ORDER BY dc.path
        "#,
    )?;
    let rows = stmt.query_map(params![run_id, scan_id, parent_path], |row| {
        let path: String = row.get(0)?;
        let kind: String = row.get(1)?;
        let file_count = row.get::<_, i64>(2)?.max(0) as u64;
        let total_size = row.get::<_, i64>(3)?.max(0) as u64;
        let dup = row.get::<_, i64>(4)?.max(0) as u64;
        let orig = row.get::<_, i64>(5)?.max(0) as u64;
        let same_dup = row.get::<_, i64>(6)?.max(0) as u64;
        let safe = row.get::<_, i64>(7)?.max(0) as u64;
        let warn = row.get::<_, i64>(8)?.max(0) as u64;
        let unsafe_ = row.get::<_, i64>(9)?.max(0) as u64;
        let copies_here = row.get::<_, i64>(10)?.max(0) as u64;
        let copies_away = row.get::<_, i64>(11)?.max(0) as u64;
        let distinct = row.get::<_, i64>(18)?.max(0) as u64;
        let name = path
            .rsplit_once('/')
            .map(|(_, tail)| tail.to_string())
            .unwrap_or_else(|| path.clone());
        if kind == "dir" {
            Ok(TreeEntry {
                path,
                name,
                kind: "dir".to_string(),
                size: total_size,
                file_count,
                blake3: None,
                sha256: None,
                ctime: row.get(14)?,
                mtime: row.get(15)?,
                mode: row.get(16)?,
                duplicate_file_count: dup,
                original_file_count: orig,
                same_scan_duplicate_file_count: same_dup,
                distinct_count: distinct,
                backup_status: String::new(),
                safe_count: safe,
                unsafe_count: unsafe_,
                warn_count: warn,
                copies_here: 0,
                copies_away: 0,
            })
        } else {
            let backup_status = if unsafe_ > 0 {
                "unsafe"
            } else if warn > 0 {
                "warn"
            } else if safe > 0 {
                "safe"
            } else {
                ""
            };
            Ok(TreeEntry {
                path,
                name,
                kind: "file".to_string(),
                size: row.get::<_, Option<i64>>(17)?.unwrap_or(total_size as i64).max(0) as u64,
                file_count: 1,
                blake3: row.get(12)?,
                sha256: row.get(13)?,
                ctime: row.get(14)?,
                mtime: row.get(15)?,
                mode: row.get(16)?,
                duplicate_file_count: dup,
                original_file_count: orig,
                same_scan_duplicate_file_count: same_dup,
                distinct_count: 1,
                backup_status: backup_status.to_string(),
                safe_count: 0,
                unsafe_count: 0,
                warn_count: 0,
                copies_here,
                copies_away,
            })
        }
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

/// Fallback aggregation path (no ready cache yet): aggregate the immediate
/// children entirely in SQL and return only the ~N child rows, instead of
/// streaming every descendant row into Rust and folding there. Semantics match
/// `build_tree_page_entries` for depth 1: each descendant file rolls into its
/// immediate-child directory, and immediate-child files are listed directly.
fn scan_tree_immediate_children_aggregate(
    conn: &Connection,
    scan_id: &str,
    normalized_prefix: &str,
    ready_run_id: Option<&str>,
) -> Result<Vec<TreeEntry>> {
    let prefix_len = normalized_prefix.chars().count() as i64;
    let like = if normalized_prefix.is_empty() {
        "%".to_string()
    } else {
        format!(
            "{}%",
            normalized_prefix.replace('%', "\\%").replace('_', "\\_")
        )
    };
    let mut stmt = conn.prepare(
        r#"
        WITH src AS (
            SELECT
                substr(f.path, ?4 + 1) AS rest,
                f.path AS path, f.kind AS kind, f.size AS size,
                f.blake3 AS blake3, f.sha256 AS sha256,
                f.ctime AS ctime, f.mtime AS mtime, f.mode AS mode,
                COALESCE(dc.duplicate_file_count, 0) AS dfc,
                COALESCE(dc.original_file_count, 0) AS ofc,
                COALESCE(dc.same_scan_duplicate_file_count, 0) AS sdfc,
                COALESCE(dc.safe_file_count, 0) AS sfc,
                COALESCE(dc.warn_file_count, 0) AS wfc,
                COALESCE(dc.unsafe_file_count, 0) AS ufc,
                COALESCE(dc.copies_here, 0) AS ch,
                COALESCE(dc.copies_away, 0) AS ca
            FROM files f
            LEFT JOIN scan_excluded_files excluded_f
                   ON excluded_f.scan_id = f.scan_id AND excluded_f.file_id = f.id
            LEFT JOIN duplicate_cache_path_counts dc
                   ON dc.run_id = ?3 AND dc.scan_id = f.scan_id AND dc.path = f.path
            WHERE excluded_f.file_id IS NULL
              AND f.scan_id = ?1
              AND f.error IS NULL
              AND f.path LIKE ?2 ESCAPE '\'
        )
        SELECT
            CASE WHEN instr(rest, '/') > 0 THEN substr(rest, 1, instr(rest, '/') - 1) ELSE rest END AS child,
            MAX(CASE WHEN instr(rest, '/') > 0 OR kind = 'dir' THEN 1 ELSE 0 END) AS is_dir,
            SUM(CASE WHEN kind = 'file' THEN 1 ELSE 0 END) AS file_count,
            SUM(CASE WHEN kind = 'file' THEN size ELSE 0 END) AS total_size,
            -- Duplicate/backup counters roll up from FILE rows only; the cache
            -- also stores rolled-up rows on directory paths, which must not be summed.
            SUM(CASE WHEN kind = 'file' THEN dfc ELSE 0 END) AS dup,
            SUM(CASE WHEN kind = 'file' THEN ofc ELSE 0 END) AS orig,
            SUM(CASE WHEN kind = 'file' THEN sdfc ELSE 0 END) AS same_dup,
            MAX(CASE WHEN kind = 'dir' AND instr(rest, '/') = 0 THEN ctime END) AS dir_ctime,
            MAX(CASE WHEN kind = 'dir' AND instr(rest, '/') = 0 THEN mtime END) AS dir_mtime,
            MAX(CASE WHEN kind = 'dir' AND instr(rest, '/') = 0 THEN mode END) AS dir_mode,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN path END) AS file_path,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN size END) AS file_size,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN blake3 END) AS file_blake3,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN sha256 END) AS file_sha256,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN ctime END) AS file_ctime,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN mtime END) AS file_mtime,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN mode END) AS file_mode,
            SUM(CASE WHEN kind = 'file' THEN wfc ELSE 0 END) AS warn_sum,
            SUM(CASE WHEN kind = 'file' THEN ufc ELSE 0 END) AS unsafe_sum,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN sfc END) AS file_safe,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN wfc END) AS file_warn,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN ufc END) AS file_unsafe,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN ch END) AS file_here,
            MAX(CASE WHEN kind = 'file' AND instr(rest, '/') = 0 THEN ca END) AS file_away
        FROM src
        WHERE rest <> ''
        GROUP BY child
        ORDER BY child
        "#,
    )?;
    let rows = stmt.query_map(params![scan_id, like, ready_run_id, prefix_len], |row| {
        let child: String = row.get(0)?;
        let is_dir: i64 = row.get(1)?;
        let file_count = row.get::<_, i64>(2)?.max(0) as u64;
        let total_size = row.get::<_, i64>(3)?.max(0) as u64;
        let dup = row.get::<_, i64>(4)?.max(0) as u64;
        let orig = row.get::<_, i64>(5)?.max(0) as u64;
        let same_dup = row.get::<_, i64>(6)?.max(0) as u64;
        let warn_sum = row.get::<_, i64>(17)?.max(0) as u64;
        let unsafe_sum = row.get::<_, i64>(18)?.max(0) as u64;
        if is_dir == 1 {
            Ok(TreeEntry {
                path: format!("{normalized_prefix}{child}"),
                name: child,
                kind: "dir".to_string(),
                size: total_size,
                file_count,
                blake3: None,
                sha256: None,
                ctime: row.get(7)?,
                mtime: row.get(8)?,
                mode: row.get(9)?,
                duplicate_file_count: dup,
                original_file_count: orig,
                same_scan_duplicate_file_count: same_dup,
                distinct_count: 0,
                backup_status: String::new(),
                safe_count: 0,
                unsafe_count: unsafe_sum,
                warn_count: warn_sum,
                copies_here: 0,
                copies_away: 0,
            })
        } else {
            let file_path: Option<String> = row.get(10)?;
            let file_safe = row.get::<_, Option<i64>>(19)?.unwrap_or(0);
            let file_warn = row.get::<_, Option<i64>>(20)?.unwrap_or(0);
            let file_unsafe = row.get::<_, Option<i64>>(21)?.unwrap_or(0);
            let backup_status = if file_unsafe > 0 {
                "unsafe"
            } else if file_warn > 0 {
                "warn"
            } else if file_safe > 0 {
                "safe"
            } else {
                ""
            };
            Ok(TreeEntry {
                path: file_path.unwrap_or_else(|| format!("{normalized_prefix}{child}")),
                name: child,
                kind: "file".to_string(),
                size: row.get::<_, Option<i64>>(11)?.unwrap_or(0).max(0) as u64,
                file_count: 1,
                blake3: row.get(12)?,
                sha256: row.get(13)?,
                ctime: row.get(14)?,
                mtime: row.get(15)?,
                mode: row.get(16)?,
                duplicate_file_count: dup,
                original_file_count: orig,
                same_scan_duplicate_file_count: same_dup,
                distinct_count: 1,
                backup_status: backup_status.to_string(),
                safe_count: 0,
                unsafe_count: 0,
                warn_count: 0,
                copies_here: row.get::<_, Option<i64>>(22)?.unwrap_or(0).max(0) as u64,
                copies_away: row.get::<_, Option<i64>>(23)?.unwrap_or(0).max(0) as u64,
            })
        }
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn scan_tree_source_rows(
    conn: &Connection,
    scan_id: &str,
    normalized_prefix: &str,
    ready_run_id: Option<&str>,
) -> Result<Vec<TreeSourceRow>> {
    let like = if normalized_prefix.is_empty() {
        "%".to_string()
    } else {
        format!(
            "{}%",
            normalized_prefix.replace('%', "\\%").replace('_', "\\_")
        )
    };
    // Folder browsing is the hot path, so it must not recompute duplicate
    // counters inline (correlated subqueries per descendant row are O(rows) and
    // dominate wall time). Instead we read the per-scan-per-path counts that the
    // background duplicate cache already materialized for the scope's ready run.
    // When no ready run exists, `?3` is NULL, the LEFT JOIN misses, and the
    // counters render as 0 ("unknown"). See plan-032/plan-039.
    let mut stmt = conn.prepare(
        r#"
        SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256,
               f.ctime, f.mtime, f.mode, f.error,
               COALESCE(dc.duplicate_file_count, 0),
               COALESCE(dc.original_file_count, 0),
               COALESCE(dc.same_scan_duplicate_file_count, 0)
        FROM files f
        LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
        JOIN scans s ON s.id = f.scan_id
        JOIN locations l ON l.id = s.location_id
        LEFT JOIN duplicate_cache_path_counts dc
               ON dc.run_id = ?3
              AND dc.scan_id = f.scan_id
              AND dc.path = f.path
        WHERE excluded_f.id IS NULL
          AND f.scan_id = ?1
          AND f.error IS NULL
          AND f.path LIKE ?2 ESCAPE '\'
        ORDER BY f.path
        "#,
    )?;
    let rows = stmt.query_map(params![scan_id, like, ready_run_id], |row| {
        let name: String = row.get(5)?;
        Ok(TreeSourceRow {
            file: FileRow {
                scan_id: row.get(0)?,
                location_slug: row.get(1)?,
                location_name: row.get(2)?,
                file_kind: semantic_file_kind(&name).to_string(),
                kind: row.get(3)?,
                path: row.get(4)?,
                name,
                size: row.get(6)?,
                blake3: row.get(7)?,
                sha256: row.get(8)?,
                ctime: row.get(9)?,
                mtime: row.get(10)?,
                mode: row.get(11)?,
                error: row.get(12)?,
            },
            duplicate_file_count: row.get(13)?,
            original_file_count: row.get(14)?,
            same_scan_duplicate_file_count: row.get(15)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn build_tree_page_entries(
    rows: Vec<TreeSourceRow>,
    normalized_prefix: &str,
    depth: u32,
    filter: Option<&FileSearchFilter>,
) -> Result<Vec<TreeEntry>> {
    let mut directories = BTreeMap::<String, TreeEntry>::new();
    let mut files = BTreeMap::<String, TreeEntry>::new();

    for row in rows {
        let matches = filter
            .map(|filter| filter_matches(filter, &row.file))
            .transpose()?
            .unwrap_or(true);
        if !matches {
            continue;
        }
        let Some(relative) = row.file.path.strip_prefix(normalized_prefix) else {
            continue;
        };
        if relative.is_empty() {
            continue;
        }
        let parts = relative
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.is_empty() {
            continue;
        }

        let is_file = row.file.kind == "file";
        let directory_parts = if is_file {
            parts.len().saturating_sub(1)
        } else {
            parts.len()
        };
        // Per-file counters already come from the duplicate cache (0 when no
        // ready run). Directory rows roll them up via the fold below.
        let duplicate_file_count = if is_file { row.duplicate_file_count } else { 0 };
        let original_file_count = if is_file { row.original_file_count } else { 0 };
        let same_scan_duplicate_file_count = if is_file {
            row.same_scan_duplicate_file_count
        } else {
            0
        };

        for index in 1..=directory_parts {
            if depth != 0 && index > depth as usize {
                break;
            }
            let path = format!("{}{}", normalized_prefix, parts[..index].join("/"));
            let entry = directories.entry(path.clone()).or_insert_with(|| TreeEntry {
                name: parts[index - 1].to_string(),
                path,
                kind: "dir".to_string(),
                size: 0,
                file_count: 0,
                blake3: None,
                sha256: None,
                ctime: None,
                mtime: None,
                mode: None,
                duplicate_file_count: 0,
                original_file_count: 0,
                same_scan_duplicate_file_count: 0,
                distinct_count: 0,
                // Backup rollups are populated by the depth-1 fast path used for
                // browsing; the general fold path (filters/depth>1) leaves them 0.
                backup_status: String::new(),
                safe_count: 0,
                unsafe_count: 0,
                warn_count: 0,
                copies_here: 0,
                copies_away: 0,
            });
            if !is_file && index == directory_parts {
                entry.ctime = row.file.ctime.clone();
                entry.mtime = row.file.mtime.clone();
                entry.mode = row.file.mode;
            }
            if is_file {
                entry.size = entry.size.saturating_add(row.file.size);
                entry.file_count = entry.file_count.saturating_add(1);
                entry.duplicate_file_count = entry
                    .duplicate_file_count
                    .saturating_add(duplicate_file_count);
                entry.original_file_count = entry
                    .original_file_count
                    .saturating_add(original_file_count);
                entry.same_scan_duplicate_file_count = entry
                    .same_scan_duplicate_file_count
                    .saturating_add(same_scan_duplicate_file_count);
            }
        }

        if is_file && (depth == 0 || parts.len() <= depth as usize) {
            let name = parts
                .last()
                .copied()
                .unwrap_or(row.file.name.as_str())
                .to_string();
            files.insert(
                row.file.path.clone(),
                TreeEntry {
                    name,
                    path: row.file.path,
                    kind: "file".to_string(),
                    size: row.file.size,
                    file_count: 1,
                    blake3: Some(row.file.blake3),
                    sha256: Some(row.file.sha256),
                    ctime: row.file.ctime,
                    mtime: row.file.mtime,
                    mode: row.file.mode,
                    duplicate_file_count,
                    original_file_count,
                    same_scan_duplicate_file_count,
                    distinct_count: 1,
                    backup_status: String::new(),
                    safe_count: 0,
                    unsafe_count: 0,
                    warn_count: 0,
                    copies_here: 0,
                    copies_away: 0,
                },
            );
        }
    }

    directories.extend(files);
    Ok(directories.into_values().collect())
}

fn prepare_search_scope(conn: &Connection, scan_ids: &[String]) -> Result<()> {
    conn.execute(
        "CREATE TEMP TABLE IF NOT EXISTS search_file_scope (scan_id TEXT PRIMARY KEY)",
        [],
    )?;
    conn.execute("DELETE FROM search_file_scope", [])?;
    let mut insert = conn.prepare("INSERT OR IGNORE INTO search_file_scope (scan_id) VALUES (?1)")?;
    for scan_id in scan_ids {
        insert.execute([scan_id])?;
    }
    Ok(())
}

fn search_scope_scan_ids(conn: &Connection, query: &FileSearchQuery) -> Result<Vec<String>> {
    if let Some(requested) = query.scan_ids.as_ref().filter(|ids| !ids.is_empty()) {
        let mut stmt = conn.prepare("SELECT id FROM scans WHERE id = ?1")?;
        let mut scan_ids = Vec::new();
        let mut seen = HashSet::new();
        for requested_id in requested {
            if !seen.insert(requested_id) {
                continue;
            }
            if let Some(scan_id) = stmt
                .query_row([requested_id], |row| row.get::<_, String>(0))
                .optional()?
            {
                scan_ids.push(scan_id);
            }
        }
        return Ok(scan_ids);
    }

    if query.representative_only == Some(false) {
        let mut stmt = conn.prepare("SELECT id FROM scans ORDER BY started_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        return rows
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into);
    }

    duplicate_scope_scan_ids(conn, None)
}

fn scan_path_has_excluded_descendants_in_conn(
    conn: &Connection,
    scan_id: &str,
    path: &str,
) -> Result<bool> {
    let visibility = ScanVisibility::load(conn, [scan_id.to_string()])?;
    let Some(Some(matcher)) = visibility.matchers.get(scan_id) else {
        return Ok(false);
    };
    let descendant_like = format!("{}/%", path.replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn.prepare(
        "SELECT path, kind FROM files WHERE scan_id = ?1 AND path LIKE ?2 ESCAPE '\\'",
    )?;
    let rows = stmt.query_map(params![scan_id, descendant_like], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (child_path, kind) = row?;
        let normalized_child = normalize_file_path(&child_path);
        if !normalized_child.is_empty()
            && matcher
                .matched_path_or_any_parents(Path::new(&normalized_child), kind == "dir")
                .is_ignore()
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn scan_location_id(conn: &Connection, scan_id: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT location_id FROM scans WHERE id = ?1",
        [scan_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

/// Materializes the scan/location pairs used by duplicate grouping.
///
/// Explicit selections retain every existing selected scan. An empty selection
/// retains the long-standing enabled-location representative/latest-complete
/// scope used by `duplicate_groups`.
fn prepare_duplicate_group_scope(
    conn: &Connection,
    requested_scan_ids: &[String],
) -> Result<Vec<String>> {
    conn.execute(
        "CREATE TEMP TABLE IF NOT EXISTS duplicate_group_scope (scan_id TEXT PRIMARY KEY, location_id TEXT NOT NULL)",
        [],
    )?;
    conn.execute("DELETE FROM duplicate_group_scope", [])?;

    let mut insert_stmt = conn.prepare(
        "INSERT OR IGNORE INTO duplicate_group_scope (scan_id, location_id) VALUES (?1, ?2)",
    )?;
    let mut scope_scan_ids = Vec::new();

    if requested_scan_ids.is_empty() {
        let mut scope_stmt = conn.prepare(
            r#"
            SELECT l.id,
                   COALESCE(
                       l.representative_scan_id,
                       (
                           SELECT s2.id
                           FROM scans s2
                           WHERE s2.location_id = l.id AND s2.status = 'complete' AND s2.hash_policy != 'light'
                           ORDER BY s2.started_at DESC
                           LIMIT 1
                       )
                   ) AS scan_id
            FROM locations l
            WHERE l.disabled = 0
            "#,
        )?;
        let rows = scope_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        for row in rows {
            let (location_id, scan_id) = row?;
            if let Some(scan_id) = scan_id {
                insert_stmt.execute(params![&scan_id, &location_id])?;
                scope_scan_ids.push(scan_id);
            }
        }
    } else {
        let mut scan_stmt = conn.prepare("SELECT id, location_id FROM scans WHERE id = ?1")?;
        let mut seen = HashSet::new();
        for scan_id in requested_scan_ids {
            if !seen.insert(scan_id) {
                continue;
            }
            let scan = scan_stmt
                .query_row([scan_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .optional()?;
            if let Some((scan_id, location_id)) = scan {
                insert_stmt.execute(params![&scan_id, &location_id])?;
                scope_scan_ids.push(scan_id);
            }
        }
    }

    Ok(scope_scan_ids)
}

fn duplicate_scope_scan_ids(
    conn: &Connection,
    excluded_location_id: Option<&str>,
) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT COALESCE(
            (
                SELECT rep.id FROM scans rep
                WHERE rep.id = l.representative_scan_id AND rep.hash_policy != 'light'
            ),
            (
                SELECT s2.id
                FROM scans s2
                WHERE s2.location_id = l.id AND s2.status = 'complete' AND s2.hash_policy != 'light'
                ORDER BY s2.started_at DESC
                LIMIT 1
            )
        )
        FROM locations l
        WHERE l.disabled = 0
          AND (?1 IS NULL OR l.id != ?1)
        "#,
    )?;
    let rows = stmt.query_map([excluded_location_id], |row| row.get::<_, Option<String>>(0))?;
    let mut scan_ids = Vec::new();
    for row in rows {
        if let Some(scan_id) = row? {
            scan_ids.push(scan_id);
        }
    }
    Ok(scan_ids)
}

#[derive(Clone, Debug)]
struct DuplicateScope {
    fingerprint: String,
    payload_json: String,
    scans: Vec<DuplicateScopeScan>,
    total_visible_files: u64,
}

#[derive(Clone, Debug)]
struct DuplicateScopeScan {
    location_id: String,
    location_slug: String,
    scan_id: String,
    started_at: String,
    finished_at: Option<String>,
    file_count: u64,
    dir_count: u64,
    error_count: u64,
    total_bytes: u64,
}

#[derive(Clone, Debug)]
struct DuplicateScopeLocationRow {
    location_id: String,
    location_slug: String,
    representative_scan_id: Option<String>,
    scan_id: Option<String>,
    status: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    file_count: Option<u64>,
    dir_count: Option<u64>,
    error_count: Option<u64>,
    total_bytes: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
struct DuplicateScopePayload {
    version: u8,
    locations: Vec<DuplicateScopeLocationPayload>,
}

#[derive(Clone, Debug, Serialize)]
struct DuplicateScopeLocationPayload {
    location_id: String,
    location_slug: String,
    representative_scan_id: Option<String>,
    effective_scan: Option<DuplicateScopeScanPayload>,
}

#[derive(Clone, Debug, Serialize)]
struct DuplicateScopeScanPayload {
    scan_id: String,
    status: String,
    started_at: String,
    finished_at: Option<String>,
    file_count: u64,
    dir_count: u64,
    error_count: u64,
    total_bytes: u64,
    visible_file_count: u64,
    visible_total_bytes: u64,
    exclude_patterns: Vec<String>,
}

#[derive(Clone, Debug)]
struct DuplicateCacheFile {
    scan_id: String,
    location_id: String,
    path: String,
    blake3: String,
    blake3_light: String,
    size: u64,
}

#[derive(Clone, Debug, Default)]
struct DuplicatePathCounts {
    kind: String,
    // Subtree file INSTANCE count / byte size on dir rows; own 1 / size on files.
    file_count: u64,
    total_size: u64,
    // Distinct-content count: number of unique (blake3,size) in the subtree on
    // dir rows; 1 on file rows. This is the redefined "Uniq".
    distinct_count: u64,
    // Cross-location (External) backup classification. On FILE rows exactly one
    // is 1 (the file's own tier). On DIR rows these are UNIQUE-CONTENT counts:
    // how many distinct contents in the subtree fall in each tier. `safe` = an
    // exact full-hash copy exists in ANOTHER location; `warn`/partial = only a
    // light-hash (same-size) copy in another location; `unsafe` = neither.
    safe_file_count: u64,
    warn_file_count: u64,
    unsafe_file_count: u64,
    // Exact copies of this file's content: `here` in the same location (excl.
    // self), `away` in other locations. 0 on dir rows. Drives "[X copies exist]".
    copies_here: u64,
    copies_away: u64,
}

impl DuplicatePathCounts {
    fn empty(kind: &str) -> Self {
        DuplicatePathCounts {
            kind: kind.to_string(),
            ..Default::default()
        }
    }
}

fn current_duplicate_scope(conn: &Connection) -> Result<Option<DuplicateScope>> {
    let mut stmt = conn.prepare(
        r#"
        WITH effective_locations AS (
            SELECT l.id AS location_id,
                   l.slug AS location_slug,
                   l.representative_scan_id,
                   COALESCE(
                       l.representative_scan_id,
                       (
                           SELECT s2.id
                           FROM scans s2
                           WHERE s2.location_id = l.id AND s2.status = 'complete' AND s2.hash_policy != 'light'
                           ORDER BY s2.started_at DESC
                           LIMIT 1
                       )
                   ) AS effective_scan_id
            FROM locations l
            WHERE l.disabled = 0
        )
        SELECT e.location_id, e.location_slug, e.representative_scan_id,
               s.id, s.status, s.started_at, s.finished_at,
               s.file_count, s.dir_count, s.error_count, s.total_bytes
        FROM effective_locations e
        LEFT JOIN scans s ON s.id = e.effective_scan_id
        ORDER BY e.location_slug, e.location_id
        "#,
    )?;
    let location_rows = stmt
        .query_map([], |row| {
            Ok(DuplicateScopeLocationRow {
                location_id: row.get(0)?,
                location_slug: row.get(1)?,
                representative_scan_id: row.get(2)?,
                scan_id: row.get(3)?,
                status: row.get(4)?,
                started_at: row.get(5)?,
                finished_at: row.get(6)?,
                file_count: row.get(7)?,
                dir_count: row.get(8)?,
                error_count: row.get(9)?,
                total_bytes: row.get(10)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if location_rows.is_empty() {
        return Ok(None);
    }

    let scan_ids = location_rows
        .iter()
        .filter_map(|row| row.scan_id.clone())
        .collect::<Vec<_>>();
    // Ensure the persistent exclusion set exists for each scope scan (cheap when
    // the exclusion fingerprint is unchanged). `visible_scan_file_totals` below
    // anti-joins `scan_excluded_files` directly, so no temp-table copy is needed.
    for scan_id in &scan_ids {
        ensure_scan_exclusion_cache_ready(conn, scan_id)?;
    }

    let mut locations = Vec::with_capacity(location_rows.len());
    let mut scans = Vec::with_capacity(scan_ids.len());
    let mut total_visible_files: u64 = 0;
    for row in location_rows {
        let effective_scan = if let Some(scan_id) = row.scan_id {
            let (visible_file_count, visible_total_bytes) = visible_scan_file_totals(conn, &scan_id)?;
            total_visible_files = total_visible_files.saturating_add(visible_file_count);
            let exclude_patterns = scan_exclude_patterns_from_conn(conn, &scan_id)?;
            let status = row.status.unwrap_or_default();
            let started_at = row.started_at.unwrap_or_default();
            let file_count = row.file_count.unwrap_or(0);
            let dir_count = row.dir_count.unwrap_or(0);
            let error_count = row.error_count.unwrap_or(0);
            let total_bytes = row.total_bytes.unwrap_or(0);
            scans.push(DuplicateScopeScan {
                location_id: row.location_id.clone(),
                location_slug: row.location_slug.clone(),
                scan_id: scan_id.clone(),
                started_at: started_at.clone(),
                finished_at: row.finished_at.clone(),
                file_count,
                dir_count,
                error_count,
                total_bytes,
            });
            Some(DuplicateScopeScanPayload {
                scan_id,
                status,
                started_at,
                finished_at: row.finished_at,
                file_count,
                dir_count,
                error_count,
                total_bytes,
                visible_file_count,
                visible_total_bytes,
                exclude_patterns,
            })
        } else {
            None
        };
        locations.push(DuplicateScopeLocationPayload {
            location_id: row.location_id,
            location_slug: row.location_slug,
            representative_scan_id: row.representative_scan_id,
            effective_scan,
        });
    }

    let payload_json = serde_json::to_string(&DuplicateScopePayload {
        // Bump when the cache's stored SHAPE changes so existing "ready" runs are
        // treated as stale and rebuilt. v3 added the backup classification
        // columns (safe/warn/unsafe + copies_here/copies_away). v4 added
        // parent_path + per-dir file_count/total_size rollups for O(children)
        // folder browsing. v5 made the safe/warn/unsafe classification
        // cross-location only (same-location duplicates no longer count as safe).
        // v6 changed dir tier counts to UNIQUE-content (distinct blake3,size per
        // tier) and added distinct_count; retired duplicate/original/same-scan.
        version: 6,
        locations,
    })?;
    let fingerprint = blake3::hash(payload_json.as_bytes()).to_hex().to_string();
    Ok(Some(DuplicateScope {
        fingerprint,
        payload_json,
        scans,
        total_visible_files,
    }))
}

fn visible_scan_file_totals(conn: &Connection, scan_id: &str) -> Result<(u64, u64)> {
    // Read the precomputed totals cached alongside the exclusion set. They are
    // refreshed by `ensure_scan_exclusion_cache` on the same trigger (patterns or
    // the scan's files changing), so reading them avoids a per-navigation
    // COUNT/SUM(size) scan over the whole scan (~133k rows on the default DB).
    // Callers ensure the exclusion cache first; fall back to a live scan only if
    // the cache row is somehow absent.
    let cached: Option<(i64, i64)> = conn
        .query_row(
            "SELECT visible_file_count, visible_total_bytes FROM scan_exclusion_cache WHERE scan_id = ?1",
            [scan_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    if let Some((count, bytes)) = cached {
        return Ok((count.max(0) as u64, bytes.max(0) as u64));
    }
    conn.query_row(
        r#"
        SELECT COUNT(*), COALESCE(SUM(f.size), 0)
        FROM files f
        LEFT JOIN scan_excluded_files excluded_f
          ON excluded_f.scan_id = f.scan_id AND excluded_f.file_id = f.id
        WHERE excluded_f.file_id IS NULL
          AND f.scan_id = ?1
          AND f.kind = 'file'
          AND f.error IS NULL
        "#,
        [scan_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(Into::into)
}

fn duplicate_cache_scope_files(
    conn: &Connection,
    scans: &[DuplicateScopeScan],
) -> Result<Vec<DuplicateCacheFile>> {
    if scans.is_empty() {
        return Ok(Vec::new());
    }
    let scan_ids = scans
        .iter()
        .map(|scan| scan.scan_id.clone())
        .collect::<Vec<_>>();
    prepare_excluded_file_ids(conn, scan_ids.clone())?;
    conn.execute(
        "CREATE TEMP TABLE IF NOT EXISTS duplicate_cache_file_scope (scan_id TEXT PRIMARY KEY)",
        [],
    )?;
    conn.execute("DELETE FROM duplicate_cache_file_scope", [])?;
    let mut insert = conn.prepare(
        "INSERT OR IGNORE INTO duplicate_cache_file_scope (scan_id) VALUES (?1)",
    )?;
    for scan_id in &scan_ids {
        insert.execute([scan_id])?;
    }

    let mut stmt = conn.prepare(
        r#"
        SELECT f.scan_id, s.location_id, f.path, f.blake3, f.blake3_light, f.size
        FROM files f
        JOIN duplicate_cache_file_scope scope ON scope.scan_id = f.scan_id
        LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
        JOIN scans s ON s.id = f.scan_id
        WHERE excluded_f.id IS NULL
          AND f.kind = 'file'
          AND f.error IS NULL
        ORDER BY f.scan_id, f.path
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DuplicateCacheFile {
            scan_id: row.get(0)?,
            location_id: row.get(1)?,
            path: row.get(2)?,
            blake3: row.get(3)?,
            blake3_light: row.get(4)?,
            size: row.get(5)?,
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn duplicate_cache_path_counts(
    files: &[DuplicateCacheFile],
) -> BTreeMap<(String, String), DuplicatePathCounts> {
    // Per exact (blake3,size): how many copies live in each location. Drives the
    // ⌂ same-location / ↗ other-location copy counts and the External tier.
    let mut exact_counts_by_location = HashMap::<(String, u64), HashMap<String, u64>>::new();
    // Per light (blake3_light,size): copies in each location (non-empty light
    // only). A light copy in ANOTHER location is the cross-location "partial"
    // tier. Same size is required (plan-064): a matching light hash with a
    // different size is a false positive and is never keyed together here.
    let mut light_counts_by_location = HashMap::<(String, u64), HashMap<String, u64>>::new();
    for file in files {
        *exact_counts_by_location
            .entry((file.blake3.clone(), file.size))
            .or_default()
            .entry(file.location_id.clone())
            .or_default() += 1;
        if !file.blake3_light.is_empty() {
            *light_counts_by_location
                .entry((file.blake3_light.clone(), file.size))
                .or_default()
                .entry(file.location_id.clone())
                .or_default() += 1;
        }
    }

    // Tier of one content, cross-location (External): 2=safe (exact copy in
    // another location), 1=partial (only a light copy there), 0=unsafe.
    let external_tier = |blake3: &str, blake3_light: &str, size: u64, location_id: &str| -> u8 {
        let exact_away: u64 = exact_counts_by_location
            .get(&(blake3.to_string(), size))
            .map(|counts| {
                counts
                    .iter()
                    .filter(|(loc, _)| *loc != location_id)
                    .map(|(_, c)| *c)
                    .sum()
            })
            .unwrap_or(0);
        if exact_away > 0 {
            return 2;
        }
        if blake3_light.is_empty() {
            return 0;
        }
        let light_away: u64 = light_counts_by_location
            .get(&(blake3_light.to_string(), size))
            .map(|counts| {
                counts
                    .iter()
                    .filter(|(loc, _)| *loc != location_id)
                    .map(|(_, c)| *c)
                    .sum()
            })
            .unwrap_or(0);
        if light_away > 0 {
            1
        } else {
            0
        }
    };

    let mut path_counts = BTreeMap::<(String, String), DuplicatePathCounts>::new();
    // Per-content group within a scan: (external tier, instance paths). Folders
    // roll up UNIQUE content per tier, so we group instances by content first.
    let mut content_groups = HashMap::<(String, String, u64), (u8, Vec<String>)>::new();

    for file in files {
        let hash_key = (file.blake3.clone(), file.size);
        let per_location = exact_counts_by_location.get(&hash_key);
        let here = per_location
            .and_then(|counts| counts.get(&file.location_id))
            .copied()
            .unwrap_or(0)
            .saturating_sub(1); // other exact copies in the same location
        let away: u64 = per_location
            .map(|counts| {
                counts
                    .iter()
                    .filter(|(location_id, _)| *location_id != &file.location_id)
                    .map(|(_, count)| *count)
                    .sum()
            })
            .unwrap_or(0);
        let tier = external_tier(&file.blake3, &file.blake3_light, file.size, &file.location_id);
        let (safe, warn, unsafe_) = match tier {
            2 => (1, 0, 0),
            1 => (0, 1, 0),
            _ => (0, 0, 1),
        };

        // File leaf row: own external tier (one-hot) + exact copy counts.
        let file_row = path_counts
            .entry((file.scan_id.clone(), file.path.clone()))
            .or_insert_with(|| DuplicatePathCounts::empty("file"));
        file_row.kind = "file".to_string();
        file_row.file_count = 1;
        file_row.total_size = file.size;
        file_row.distinct_count = 1;
        file_row.safe_file_count = safe;
        file_row.warn_file_count = warn;
        file_row.unsafe_file_count = unsafe_;
        file_row.copies_here = here;
        file_row.copies_away = away;

        // Instance rollup to ancestor dirs: file_count + total_size only. Tier
        // and distinct counts come from the unique-content pass below.
        for ancestor in duplicate_cache_ancestor_paths(&file.path) {
            let dir_row = path_counts
                .entry((file.scan_id.clone(), ancestor))
                .or_insert_with(|| DuplicatePathCounts::empty("dir"));
            if dir_row.kind != "file" {
                dir_row.kind = "dir".to_string();
            }
            dir_row.file_count = dir_row.file_count.saturating_add(1);
            dir_row.total_size = dir_row.total_size.saturating_add(file.size);
        }

        let group = content_groups
            .entry((file.scan_id.clone(), file.blake3.clone(), file.size))
            .or_insert((tier, Vec::new()));
        group.0 = tier;
        group.1.push(file.path.clone());
    }

    // Unique-content folder rollups: each distinct content counts ONCE per folder
    // that contains it (union of its instances' ancestors), toward that folder's
    // tier bucket and its distinct-content total.
    for ((scan_id, _blake3, _size), (tier, paths)) in &content_groups {
        let mut folders = HashSet::<String>::new();
        for path in paths {
            for ancestor in duplicate_cache_ancestor_paths(path) {
                folders.insert(ancestor);
            }
        }
        for folder in folders {
            let dir_row = path_counts
                .entry((scan_id.clone(), folder))
                .or_insert_with(|| DuplicatePathCounts::empty("dir"));
            dir_row.distinct_count = dir_row.distinct_count.saturating_add(1);
            match tier {
                2 => dir_row.safe_file_count = dir_row.safe_file_count.saturating_add(1),
                1 => dir_row.warn_file_count = dir_row.warn_file_count.saturating_add(1),
                _ => dir_row.unsafe_file_count = dir_row.unsafe_file_count.saturating_add(1),
            }
        }
    }
    path_counts
}

fn duplicate_cache_ancestor_paths(path: &str) -> Vec<String> {
    let parts = path.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
    if parts.len() <= 1 {
        return Vec::new();
    }
    (1..parts.len()).map(|index| parts[..index].join("/")).collect()
}

fn write_scan_terminal_state(
    conn: &Connection,
    scan_id: &str,
    file_count: u64,
    dir_count: u64,
    error_count: u64,
    total_bytes: u64,
    status: &str,
) -> Result<()> {
    let updated = conn.execute(
        "UPDATE scans SET finished_at = ?1, file_count = ?2, dir_count = ?3, error_count = ?4, total_bytes = ?5, status = ?6 WHERE id = ?7",
        params![
            Utc::now().to_rfc3339(),
            file_count,
            dir_count,
            error_count,
            total_bytes,
            status,
            scan_id,
        ],
    )?;
    if updated != 1 {
        anyhow::bail!(
            "expected to finalize exactly one scan {scan_id}, but updated {updated} rows"
        );
    }
    Ok(())
}

fn invalidate_duplicate_cache_conn(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM duplicate_cache_runs", [])?;
    Ok(())
}

fn scan_ids_matching_file_query(conn: &Connection, like: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT DISTINCT scan_id
        FROM files
        WHERE path LIKE ?1 ESCAPE '\' OR name LIKE ?1 ESCAPE '\'
        "#,
    )?;
    let rows = stmt.query_map([like], |row| row.get::<_, String>(0))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn scan_ids_with_file_occurrence(
    conn: &Connection,
    blake3: &str,
    size: u64,
) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT DISTINCT scan_id
        FROM files
        WHERE kind = 'file' AND error IS NULL AND blake3 = ?1 AND size = ?2
        "#,
    )?;
    let rows = stmt.query_map(params![blake3, size], |row| row.get::<_, String>(0))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn refresh_scan_file_counts(conn: &Connection, scan_id: &str) -> Result<()> {
    let (file_count, error_count, total_bytes): (u64, u64, u64) = conn.query_row(
        r#"
        SELECT
            COUNT(*) FILTER (WHERE kind = 'file' AND error IS NULL),
            COUNT(*) FILTER (WHERE kind = 'file' AND error IS NOT NULL),
            COALESCE(SUM(CASE WHEN kind = 'file' AND error IS NULL THEN size ELSE 0 END), 0)
        FROM files
        WHERE scan_id = ?1
        "#,
        [scan_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    conn.execute(
        "UPDATE scans SET file_count = ?1, error_count = ?2, total_bytes = ?3 WHERE id = ?4",
        params![file_count, error_count, total_bytes, scan_id],
    )?;
    Ok(())
}

fn prepare_selected_paths(conn: &Connection, paths: &[String]) -> Result<()> {
    conn.execute(
        "CREATE TEMP TABLE IF NOT EXISTS selected_paths (path TEXT NOT NULL PRIMARY KEY)",
        [],
    )?;
    conn.execute("DELETE FROM selected_paths", [])?;
    let mut stmt = conn.prepare("INSERT OR IGNORE INTO selected_paths (path) VALUES (?1)")?;
    for path in paths {
        stmt.execute([path])?;
    }
    Ok(())
}

fn delete_check_for_selection(
    conn: &Connection,
    scan_id: &str,
    include_all: bool,
    paths_mode: bool,
) -> Result<DeleteCheckResult> {
    let selected_location_id = scan_location_id(conn, scan_id)?;
    let mut visibility_scan_ids = vec![scan_id.to_string()];
    visibility_scan_ids.extend(duplicate_scope_scan_ids(conn, selected_location_id.as_deref())?);
    prepare_excluded_file_ids(conn, visibility_scan_ids)?;

    let total_count = conn.query_row(
        r#"
        SELECT COUNT(*)
        FROM files f
        LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
        WHERE excluded_f.id IS NULL
          AND f.scan_id = ?1
          AND f.kind = 'file'
          AND f.error IS NULL
          AND (
              ?2
              OR EXISTS (
                  SELECT 1
                  FROM selected_paths p
                  WHERE (
                      ?3
                      AND (f.path = p.path OR substr(f.path, 1, length(p.path) + 1) = p.path || '/')
                  )
                  OR (
                      NOT ?3
                      AND substr(f.path, 1, length(p.path)) = p.path
                  )
              )
          )
        "#,
        params![scan_id, include_all, paths_mode],
        |row| row.get(0),
    )?;
    let mut all_stmt = conn.prepare(
        r#"
        SELECT f.name, f.path, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode
        FROM files f
        LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
        WHERE excluded_f.id IS NULL
          AND f.scan_id = ?1
          AND f.kind = 'file'
          AND f.error IS NULL
          AND (
              ?2
              OR EXISTS (
                  SELECT 1
                  FROM selected_paths p
                  WHERE (
                      ?3
                      AND (f.path = p.path OR substr(f.path, 1, length(p.path) + 1) = p.path || '/')
                  )
                  OR (
                      NOT ?3
                      AND substr(f.path, 1, length(p.path)) = p.path
                  )
              )
          )
        ORDER BY f.path
        "#,
    )?;
    let checked_files = all_stmt
        .query_map(
            params![scan_id, include_all, paths_mode],
            tree_file_from_row,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut stmt = conn.prepare(
        r#"
        WITH selected_scan AS (
            SELECT location_id
            FROM scans
            WHERE id = ?1
        ),
        duplicate_scope AS (
            SELECT l.id AS location_id,
                   COALESCE(
                       l.representative_scan_id,
                       (
                           SELECT s2.id
                           FROM scans s2
                           WHERE s2.location_id = l.id AND s2.status = 'complete' AND s2.hash_policy != 'light'
                           ORDER BY s2.started_at DESC
                           LIMIT 1
                       )
                   ) AS scan_id
            FROM locations l
            WHERE l.disabled = 0 AND l.id != (SELECT location_id FROM selected_scan)
        ),
        -- Materialize the set of (blake3, size) present in any other in-scope
        -- location exactly once, instead of a correlated per-candidate-file
        -- subquery over the whole files table (plan-036 `other_hashes` CTE).
        other_hashes AS (
            SELECT DISTINCT other.blake3, other.size
            FROM files other
            LEFT JOIN excluded_file_ids excluded_other ON excluded_other.id = other.id
            JOIN duplicate_scope ds ON ds.scan_id = other.scan_id
            WHERE excluded_other.id IS NULL
              AND other.kind = 'file'
              AND other.error IS NULL
        )
        SELECT f.name, f.path, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode
        FROM files f
        LEFT JOIN excluded_file_ids excluded_f ON excluded_f.id = f.id
        WHERE excluded_f.id IS NULL
          AND f.scan_id = ?1
          AND f.kind = 'file'
          AND f.error IS NULL
          AND (
              ?2
              OR EXISTS (
                  SELECT 1
                  FROM selected_paths p
                  WHERE (
                      ?3
                      AND (f.path = p.path OR substr(f.path, 1, length(p.path) + 1) = p.path || '/')
                  )
                  OR (
                      NOT ?3
                      AND substr(f.path, 1, length(p.path)) = p.path
                  )
              )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM other_hashes oh
              WHERE oh.blake3 = f.blake3
                AND oh.size = f.size
          )
        ORDER BY f.path
        "#,
    )?;
    let missing_files = stmt
        .query_map(
            params![scan_id, include_all, paths_mode],
            tree_file_from_row,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let missing_count = missing_files.len() as u64;
    Ok(DeleteCheckResult {
        scan_id: scan_id.to_string(),
        safe: missing_count == 0,
        total_count,
        missing_count,
        checked_files,
        missing_files,
    })
}

fn filter_matches(filter: &FileSearchFilter, file: &FileRow) -> Result<bool> {
    match &filter.term {
        FileSearchTerm::Filter => match &filter.operator {
            FileSearchOperator::And => Ok(filter_expression_list(filter)?
                .iter()
                .map(|item| filter_matches(item, file))
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .all(|matched| matched)),
            FileSearchOperator::Or => Ok(filter_expression_list(filter)?
                .iter()
                .map(|item| filter_matches(item, file))
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .any(|matched| matched)),
            FileSearchOperator::Not => Ok(!filter_matches(filter_expression_one(filter)?, file)?),
            _ => anyhow::bail!("filter term only supports and, or, and not operators"),
        },
        FileSearchTerm::Ctime | FileSearchTerm::Mtime => date_filter_matches(filter, file),
        _ => string_filter_matches(filter, file),
    }
}

fn string_filter_matches(filter: &FileSearchFilter, file: &FileRow) -> Result<bool> {
    let expression = search_expression_string("string", &filter.expression)?;
    let normalized_extension;
    let expression = if matches!(&filter.term, FileSearchTerm::Extension) {
        normalized_extension = normalize_extension_expression(expression)?;
        normalized_extension.as_str()
    } else {
        expression
    };
    let values = string_values_for_term(&filter.term, file)?;
    match &filter.operator {
        FileSearchOperator::Equal => Ok(values.iter().any(|value| value == expression)),
        FileSearchOperator::NotEqual => Ok(values.iter().all(|value| value != expression)),
        FileSearchOperator::Substring => Ok(values
            .iter()
            .any(|value| contains_case_insensitive(value, expression))),
        FileSearchOperator::NotSubstring => Ok(values
            .iter()
            .all(|value| !contains_case_insensitive(value, expression))),
        FileSearchOperator::Regex => {
            let regex = Regex::new(expression).context("invalid regex search expression")?;
            Ok(values.iter().any(|value| regex.is_match(value)))
        }
        FileSearchOperator::NotRegex => {
            let regex = Regex::new(expression).context("invalid regex search expression")?;
            Ok(values.iter().all(|value| !regex.is_match(value)))
        }
        FileSearchOperator::Fuzzy => Ok(values.iter().any(|value| fuzzy_matches(value, expression))),
        FileSearchOperator::NotFuzzy => Ok(values
            .iter()
            .all(|value| !fuzzy_matches(value, expression))),
        _ => anyhow::bail!("string term does not support this operator"),
    }
}

fn date_filter_matches(filter: &FileSearchFilter, file: &FileRow) -> Result<bool> {
    let value = match &filter.term {
        FileSearchTerm::Ctime => file.ctime.as_deref(),
        FileSearchTerm::Mtime => file.mtime.as_deref(),
        _ => None,
    };
    let Some(value) = value else {
        return Ok(false);
    };
    let value = DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .ok();
    let Some(value) = value else {
        return Ok(false);
    };
    match &filter.operator {
        FileSearchOperator::After => Ok(value >= search_timestamp(
            "date after",
            search_expression_string("date", &filter.expression)?,
        )?),
        FileSearchOperator::Before => Ok(value <= search_timestamp(
            "date before",
            search_expression_string("date", &filter.expression)?,
        )?),
        FileSearchOperator::Between => {
            let (from, to) = search_expression_range("date between", &filter.expression)?;
            let from = search_timestamp("date between from", from)?;
            let to = search_timestamp("date between to", to)?;
            if from > to {
                anyhow::bail!("date between from must be before to");
            }
            Ok(value >= from && value <= to)
        }
        _ => anyhow::bail!("date term supports after, before, and between operators"),
    }
}

fn string_values_for_term(term: &FileSearchTerm, file: &FileRow) -> Result<Vec<String>> {
    Ok(match term {
        FileSearchTerm::Text => vec![file.path.clone(), file.name.clone()],
        FileSearchTerm::Name => vec![file.name.clone()],
        FileSearchTerm::Path => vec![file.path.clone()],
        FileSearchTerm::Extension => vec![file_extension(&file.name).unwrap_or_default()],
        FileSearchTerm::LocationSlug => vec![file.location_slug.clone()],
        FileSearchTerm::LocationName => vec![file.location_name.clone()],
        FileSearchTerm::Kind => vec![file.kind.clone()],
        FileSearchTerm::Filter | FileSearchTerm::Ctime | FileSearchTerm::Mtime => {
            anyhow::bail!("unsupported string term")
        }
    })
}

fn filter_expression_list(filter: &FileSearchFilter) -> Result<&[FileSearchFilter]> {
    match &filter.expression {
        FileSearchExpression::Filters(items) => Ok(items),
        _ => anyhow::bail!("and/or operator requires a list expression"),
    }
}

fn filter_expression_one(filter: &FileSearchFilter) -> Result<&FileSearchFilter> {
    match &filter.expression {
        FileSearchExpression::Filter(item) => Ok(item),
        _ => anyhow::bail!("not operator requires one filter expression"),
    }
}

fn search_expression_string<'a>(
    label: &str,
    expression: &'a FileSearchExpression,
) -> Result<&'a str> {
    match expression {
        FileSearchExpression::String(value) if !value.trim().is_empty() => Ok(value.trim()),
        FileSearchExpression::String(_) => anyhow::bail!("{label} filter requires a value"),
        _ => anyhow::bail!("{label} filter requires a string expression"),
    }
}

fn search_expression_range<'a>(
    label: &str,
    expression: &'a FileSearchExpression,
) -> Result<(&'a str, &'a str)> {
    match expression {
        FileSearchExpression::Range { from, to } if !from.trim().is_empty() && !to.trim().is_empty() => {
            Ok((from.trim(), to.trim()))
        }
        FileSearchExpression::Range { .. } => anyhow::bail!("{label} filter requires both range bounds"),
        _ => anyhow::bail!("{label} filter requires a range expression"),
    }
}

fn search_timestamp(label: &str, value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .with_context(|| format!("{label} must be an RFC3339 timestamp"))
}

fn normalize_extension_expression(value: &str) -> Result<String> {
    let extension = value.trim().trim_start_matches('.').to_lowercase();
    if extension.is_empty() {
        anyhow::bail!("extension filter requires a value");
    }
    if extension.contains('/') || extension.contains('\\') {
        anyhow::bail!("extension filter only accepts a filename extension");
    }
    Ok(extension)
}

fn file_extension(name: &str) -> Option<String> {
    let filename = name.rsplit('/').next().unwrap_or(name);
    let (_, extension) = filename.rsplit_once('.')?;
    (!extension.is_empty()).then(|| extension.to_lowercase())
}

fn contains_case_insensitive(value: &str, needle: &str) -> bool {
    value.to_lowercase().contains(&needle.to_lowercase())
}

fn fuzzy_matches(value: &str, pattern: &str) -> bool {
    let mut value_chars = value.chars().flat_map(char::to_lowercase);
    for needle in pattern.chars().flat_map(char::to_lowercase) {
        if !value_chars.any(|candidate| candidate == needle) {
            return false;
        }
    }
    true
}

fn scan_by_id_from_conn(conn: &Connection, scan_id: &str) -> Result<Option<Scan>> {
    conn.query_row(
        r#"
        SELECT s.id, s.location_id, l.slug, l.name, s.offset_path, s.started_at, s.finished_at,
               s.file_count, s.dir_count, s.error_count, s.total_bytes, s.status,
               COALESCE(l.representative_scan_id = s.id, 0), s.notes
        FROM scans s
        JOIN locations l ON l.id = s.location_id
        WHERE s.id = ?1
        "#,
        [scan_id],
        scan_from_row,
    )
    .optional()
    .map_err(Into::into)
}

fn location_by_id_from_conn(conn: &Connection, id: &str) -> Result<Option<Location>> {
    conn.query_row(
        "SELECT id, slug, name, type, root_path, notes, representative_scan_id, disabled, created_at FROM locations WHERE id = ?1",
        [id],
        location_from_row,
    )
    .optional()
    .map_err(Into::into)
}

fn location_by_slug_from_conn(conn: &Connection, slug: &str) -> Result<Option<Location>> {
    conn.query_row(
        "SELECT id, slug, name, type, root_path, notes, representative_scan_id, disabled, created_at FROM locations WHERE slug = ?1",
        [slug],
        location_from_row,
    )
    .optional()
    .map_err(Into::into)
}

fn reusable_files_for_scan_conn(
    conn: &Connection,
    scan_id: &str,
) -> Result<HashMap<String, ReusableFile>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT path, name, size, blake3, sha256, ctime, mtime, mode
        FROM files
        WHERE scan_id = ?1 AND kind = 'file' AND error IS NULL
        "#,
    )?;
    let rows = stmt.query_map([scan_id], |row| {
        Ok(ReusableFile {
            path: row.get(0)?,
            name: row.get(1)?,
            size: row.get(2)?,
            blake3: row.get(3)?,
            sha256: row.get(4)?,
            ctime: row.get(5)?,
            mtime: row.get(6)?,
            mode: row.get(7)?,
        })
    })?;
    let mut files = HashMap::new();
    for file in rows {
        let file = file?;
        files.insert(file.path.clone(), file);
    }
    Ok(files)
}

fn location_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Location> {
    let kind: String = row.get(3)?;
    let kind = LocationType::try_from(kind).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, err.into())
    })?;
    Ok(Location {
        id: row.get(0)?,
        slug: row.get(1)?,
        name: row.get(2)?,
        kind,
        root_path: PathBuf::from(row.get::<_, String>(4)?),
        notes: row.get(5)?,
        representative_scan_id: row.get(6)?,
        disabled: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn scan_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Scan> {
    Ok(Scan {
        id: row.get(0)?,
        location_id: row.get(1)?,
        location_slug: row.get(2)?,
        location_name: row.get(3)?,
        offset_path: row.get(4)?,
        started_at: row.get(5)?,
        finished_at: row.get(6)?,
        file_count: row.get(7)?,
        dir_count: row.get(8)?,
        error_count: row.get(9)?,
        total_bytes: row.get(10)?,
        status: row.get(11)?,
        is_representative: row.get(12)?,
        notes: row.get(13)?,
    })
}

fn tree_file_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TreeEntry> {
    Ok(TreeEntry {
        name: row.get(0)?,
        path: row.get(1)?,
        kind: "file".to_string(),
        size: row.get(2)?,
        file_count: 1,
        blake3: Some(row.get(3)?),
        sha256: Some(row.get(4)?),
        ctime: row.get(5)?,
        mtime: row.get(6)?,
        mode: row.get(7)?,
        duplicate_file_count: 0,
        original_file_count: 0,
        same_scan_duplicate_file_count: 0,
        distinct_count: 1,
        backup_status: String::new(),
        safe_count: 0,
        unsafe_count: 0,
        warn_count: 0,
        copies_here: 0,
        copies_away: 0,
    })
}

fn file_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRow> {
    let name: String = row.get(5)?;
    Ok(FileRow {
        scan_id: row.get(0)?,
        location_slug: row.get(1)?,
        location_name: row.get(2)?,
        file_kind: semantic_file_kind(&name).to_string(),
        kind: row.get(3)?,
        path: row.get(4)?,
        name,
        size: row.get(6)?,
        blake3: row.get(7)?,
        sha256: row.get(8)?,
        ctime: row.get(9)?,
        mtime: row.get(10)?,
        mode: row.get(11)?,
        error: row.get(12)?,
    })
}

/// Returns the compact semantic category used by the UI and CLI duplicate
/// surfaces. This deliberately derives from a response filename only: the
/// persisted `files.kind` remains the filesystem topology (`file` or `dir`).
fn semantic_file_kind(name: &str) -> &'static str {
    let extension = name
        .rsplit_once('.')
        .map(|(_, extension)| extension)
        .filter(|extension| !extension.is_empty())
        .map(str::to_ascii_lowercase);
    let Some(extension) = extension.as_deref() else {
        return "other";
    };

    match extension {
        "avif" | "bmp" | "cr2" | "cr3" | "dng" | "gif" | "heic" | "heif" | "jpe"
        | "jpeg" | "jpg" | "jxl" | "nef" | "orf" | "png" | "raf" | "raw" | "rw2"
        | "svg" | "tif" | "tiff" | "webp" => "image",
        "3g2" | "3gp" | "asf" | "avi" | "flv" | "m2ts" | "m4v" | "mkv" | "mov"
        | "mp4" | "mpeg" | "mpg" | "mts" | "ogv" | "ts" | "vob" | "webm" | "wmv" => {
            "video"
        }
        "c" | "cc" | "cfg" | "conf" | "cpp" | "css" | "csv" | "go" | "h" | "hpp"
        | "htm" | "html" | "ini" | "java" | "js" | "json" | "jsx" | "kt" | "kts"
        | "log" | "markdown" | "md" | "mjs" | "php" | "py" | "r" | "rb" | "rs" | "rst"
        | "rtf" | "sh" | "sql" | "swift" | "tex" | "toml" | "tsx" | "txt"
        | "xml" | "yaml" | "yml" | "zsh" => "text",
        _ => "other",
    }
}

fn duplicate_group_file_kind<'a>(file_kinds: impl IntoIterator<Item = &'a str>) -> String {
    let mut file_kinds = file_kinds.into_iter();
    let Some(first) = file_kinds.next() else {
        return "other".to_string();
    };
    if file_kinds.all(|file_kind| file_kind == first) {
        first.to_string()
    } else {
        "mixed".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn location_type_unknown_round_trips() {
        assert_eq!(LocationType::Unknown.to_string(), "unknown");
        assert_eq!(
            LocationType::try_from("unknown".to_string()).unwrap(),
            LocationType::Unknown
        );
    }

    #[test]
    fn date_derived_scan_ids_use_supplied_time_and_collision_suffixes() {
        let root = test_root("date-derived-scan-id");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Unknown,
                name: "Archive".to_string(),
                slug: "archive-volume".to_string(),
                root_path: root.join("archive"),
                notes: None,
            })
            .unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        let first = db
            .start_scan_with_started_at(&location, Path::new("/"), started_at.clone())
            .unwrap();
        let second = db
            .start_scan_with_started_at(&location, Path::new("/"), started_at.clone())
            .unwrap();
        let third = db
            .start_scan_with_started_at(&location, Path::new("/"), started_at.clone())
            .unwrap();

        assert_eq!(first, "20260715T123456Z--archive-volume");
        assert_eq!(second, "20260715T123456Z--archive-volume--2");
        assert_eq!(third, "20260715T123456Z--archive-volume--3");
        for scan_id in [&first, &second, &third] {
            let scan = db.scan_by_id(scan_id).unwrap().unwrap();
            assert_eq!(scan.started_at, started_at.to_rfc3339());
            assert_eq!(scan.status, "running");
        }
    }

    #[test]
    fn scan_tree_page_surfaces_backup_status_from_built_cache() {
        let root = test_root("backup-status-tree");
        let db = Database::open(root.join("state.db")).unwrap();
        let loc = |slug: &str, name: &str| {
            db.add_location(LocationInput {
                kind: LocationType::Local,
                name: name.to_string(),
                slug: slug.to_string(),
                root_path: root.join(slug),
                notes: None,
            })
            .unwrap()
        };
        let src = loc("src", "Source");
        let bak = loc("bak", "Backup");
        let src_scan = db.start_scan(&src, Path::new("/")).unwrap();
        let bak_scan = db.start_scan(&bak, Path::new("/")).unwrap();
        let file = |scan: &str, path: &str, size: u64, b3: &str, light: &str| NewFile {
            scan_id: scan.to_string(),
            kind: "file".to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap().to_string(),
            size,
            blake3: b3.to_string(),
            sha256: b3.to_string(),
            blake3_light: light.to_string(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        };
        let dir = |scan: &str, path: &str| NewFile {
            scan_id: scan.to_string(),
            kind: "dir".to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap().to_string(),
            size: 0,
            blake3: String::new(),
            sha256: String::new(),
            blake3_light: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        };
        db.insert_file_batch(&[
            dir(&src_scan, "dir"),
            file(&src_scan, "dir/exact.jpg", 100, "HEX", "LEX"),
            file(&src_scan, "dir/only.raw", 300, "HONLY", "LONLY"),
            file(&src_scan, "dir/similar.jpg", 200, "HSIMA", "LSIM"),
        ])
        .unwrap();
        db.insert_file_batch(&[
            file(&bak_scan, "exact.jpg", 100, "HEX", "LEX"), // exact copy of src exact.jpg
            file(&bak_scan, "similar.jpg", 200, "HSIMB", "LSIM"), // light-only match
        ])
        .unwrap();
        db.finish_scan(&src_scan, 3, 1, 0, 600, "complete").unwrap();
        db.finish_scan(&bak_scan, 2, 0, 0, 300, "complete").unwrap();
        db.set_representative_scan(&src_scan).unwrap();
        db.set_representative_scan(&bak_scan).unwrap();

        crate::duplicate_cache::run_rebuild_duplicate_cache(&db, &crate::events::EventHub::default());
        assert_eq!(db.current_duplicate_cache_status().unwrap().status, "ready");

        let page = db.scan_tree_page(&src_scan, "dir", Some(50), 0, 1, None).unwrap();
        let status = |name: &str| {
            page.entries
                .iter()
                .find(|e| e.name == name)
                .unwrap_or_else(|| panic!("missing {name}"))
                .backup_status
                .clone()
        };
        assert_eq!(status("exact.jpg"), "safe");
        assert_eq!(status("only.raw"), "unsafe");
        assert_eq!(status("similar.jpg"), "warn");

        // The parent folder rolls up 1 unsafe + 1 warn.
        let root_page = db.scan_tree_page(&src_scan, "", Some(50), 0, 1, None).unwrap();
        let folder = root_page.entries.iter().find(|e| e.name == "dir").unwrap();
        assert_eq!(folder.unsafe_count, 1);
        assert_eq!(folder.warn_count, 1);

        // Flat view: all three descendant files, each with its backup status.
        let flat = db.scan_flat_page(&src_scan, "", "all", Some(50), 0).unwrap();
        assert_eq!(flat.total, 3);
        assert!(flat.entries.iter().all(|e| e.kind == "file"));
        assert_eq!(flat.entries.iter().find(|e| e.name == "exact.jpg").unwrap().backup_status, "safe");
        // Flat view filtered to the unsafe tier returns just the blocker.
        let flat_unsafe = db.scan_flat_page(&src_scan, "", "unsafe", Some(50), 0).unwrap();
        assert_eq!(flat_unsafe.total, 1);
        assert_eq!(flat_unsafe.entries[0].name, "only.raw");
    }

    #[test]
    fn duplicate_cache_path_counts_classifies_backup_safety() {
        let f = |scan: &str, loc: &str, path: &str, blake3: &str, light: &str, size: u64| DuplicateCacheFile {
            scan_id: scan.to_string(),
            location_id: loc.to_string(),
            path: path.to_string(),
            blake3: blake3.to_string(),
            blake3_light: light.to_string(),
            size,
        };
        let files = vec![
            // safe: exact copy in another location
            f("s1", "locA", "dir/exact.jpg", "HASH_EXACT", "LIGHT_EXACT", 100),
            f("s2", "locB", "backup/exact.jpg", "HASH_EXACT", "LIGHT_EXACT", 100),
            // warn: no exact elsewhere, but a light-hash match in another location
            f("s1", "locA", "dir/similar.jpg", "HASH_SIM_A", "LIGHT_SIM", 200),
            f("s2", "locB", "backup/similar.jpg", "HASH_SIM_B", "LIGHT_SIM", 200),
            // unsafe: only copy anywhere
            f("s1", "locA", "dir/only.raw", "HASH_ONLY", "LIGHT_ONLY", 300),
            // same-location-only duplicate: a second exact copy in the SAME
            // location. This is NOT a cross-location backup, so it is `unsafe`
            // even though it has a ⌂ here copy.
            f("s1", "locA", "dir/dup1.png", "HASH_DUP", "LIGHT_DUP", 400),
            f("s1", "locA", "dir/dup2.png", "HASH_DUP", "LIGHT_DUP", 400),
            // light match but only within the SAME location -> not likely-safe.
            f("s1", "locA", "dir/lite1.png", "HASH_L1", "LIGHT_LOCAL", 500),
            f("s1", "locA", "dir/lite2.png", "HASH_L2", "LIGHT_LOCAL", 500),
        ];
        let counts = duplicate_cache_path_counts(&files);

        let get = |path: &str| counts.get(&("s1".to_string(), path.to_string())).unwrap();
        let exact = get("dir/exact.jpg");
        assert_eq!((exact.safe_file_count, exact.warn_file_count, exact.unsafe_file_count), (1, 0, 0));
        assert_eq!((exact.copies_here, exact.copies_away), (0, 1));

        let similar = get("dir/similar.jpg");
        assert_eq!((similar.safe_file_count, similar.warn_file_count, similar.unsafe_file_count), (0, 1, 0));

        let only = get("dir/only.raw");
        assert_eq!((only.safe_file_count, only.warn_file_count, only.unsafe_file_count), (0, 0, 1));

        let dup1 = get("dir/dup1.png");
        assert_eq!(
            (dup1.safe_file_count, dup1.warn_file_count, dup1.unsafe_file_count),
            (0, 0, 1),
            "same-location-only duplicate is not a cross-location backup"
        );
        assert_eq!((dup1.copies_here, dup1.copies_away), (1, 0), "same-location duplicate still counts as ⌂ here");

        let lite1 = get("dir/lite1.png");
        assert_eq!(
            (lite1.safe_file_count, lite1.warn_file_count, lite1.unsafe_file_count),
            (0, 0, 1),
            "same-location-only light match is not likely-safe"
        );

        // The `dir` folder rolls up UNIQUE content per tier. Distinct contents:
        // HASH_EXACT (safe), HASH_SIM_A (warn), HASH_ONLY, HASH_DUP, HASH_L1,
        // HASH_L2 (all unsafe). dup1/dup2 share HASH_DUP so they count once.
        // => 1 safe, 1 warn, 4 unsafe, 6 distinct contents (though 7 instances).
        let dir = get("dir");
        assert_eq!(dir.kind, "dir");
        assert_eq!((dir.safe_file_count, dir.warn_file_count, dir.unsafe_file_count), (1, 1, 4));
        assert_eq!(dir.distinct_count, 6, "unique (blake3,size) contents in the folder");
        assert_eq!(dir.file_count, 7, "file instances in the folder");
    }

    #[test]
    fn reconcile_interrupted_scans_finalizes_only_non_terminal_scans() {
        let root = test_root("reconcile-interrupted-scans");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Archive".to_string(),
                slug: "archive".to_string(),
                root_path: root.join("archive"),
                notes: None,
            })
            .unwrap();

        let running = db.start_scan(&location, Path::new("/")).unwrap();
        let paused = db.start_scan(&location, Path::new("/")).unwrap();
        let stopping = db.start_scan(&location, Path::new("/")).unwrap();
        let complete = db.start_scan(&location, Path::new("/")).unwrap();
        let failed = db.start_scan(&location, Path::new("/")).unwrap();
        db.finish_scan(&complete, 5, 1, 0, 100, "complete").unwrap();
        db.finish_scan(&failed, 0, 0, 3, 0, "failed").unwrap();
        {
            let conn = db.connect().unwrap();
            conn.execute("UPDATE scans SET status = 'paused' WHERE id = ?1", params![paused])
                .unwrap();
            conn.execute("UPDATE scans SET status = 'stopping' WHERE id = ?1", params![stopping])
                .unwrap();
        }

        let recovered = db.reconcile_interrupted_scans().unwrap();
        assert_eq!(recovered.len(), 3, "running/paused/stopping are all orphaned");
        for id in [&running, &paused, &stopping] {
            assert!(recovered.contains(id));
            let scan = db.scan_by_id(id).unwrap().unwrap();
            assert_eq!(scan.status, "interrupted");
            assert!(scan.finished_at.is_some(), "interrupted scans get a finished_at");
        }
        // Terminal scans are left untouched.
        assert_eq!(db.scan_by_id(&complete).unwrap().unwrap().status, "complete");
        assert_eq!(db.scan_by_id(&failed).unwrap().unwrap().status, "failed");

        // Idempotent: a second pass finds nothing to recover.
        assert!(db.reconcile_interrupted_scans().unwrap().is_empty());
    }

    #[test]
    fn bootstrap_location_and_scan_reserves_date_ids_without_repointing_locations() {
        let root = test_root("bootstrap-location-and-scan");
        let source_root = root.join("source");
        std::fs::create_dir_all(&source_root).unwrap();
        let canonical_source = source_root.canonicalize().unwrap();
        let db = Database::open(root.join("state.db")).unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        let first = db
            .bootstrap_location_and_start_scan(
                "archive-volume",
                &canonical_source,
                Path::new("/"),
                started_at.clone(),
            )
            .unwrap();
        assert_eq!(first.scan_id, "20260715T123456Z--archive-volume");
        assert_eq!(first.location.kind, LocationType::Unknown);
        assert_eq!(first.location.name, "archive-volume");
        assert_eq!(first.location.root_path, canonical_source);

        let second = db
            .bootstrap_location_and_start_scan(
                "archive-volume",
                &canonical_source,
                Path::new("/"),
                started_at.clone(),
            )
            .unwrap();
        assert_eq!(
            second.scan_id,
            "20260715T123456Z--archive-volume--2"
        );
        assert_eq!(db.locations().unwrap().len(), 1);
        assert_eq!(db.scans().unwrap().len(), 2);

        let other_source = root.join("other-source");
        std::fs::create_dir_all(&other_source).unwrap();
        let error = db
            .bootstrap_location_and_start_scan(
                "archive-volume",
                &other_source.canonicalize().unwrap(),
                Path::new("/"),
                started_at,
            )
            .expect_err("mismatched existing roots must not create a scan");
        assert!(error.to_string().contains("does not match source path"));
        assert_eq!(db.locations().unwrap().len(), 1);
        assert_eq!(db.scans().unwrap().len(), 2);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bootstrap_location_and_scan_rolls_back_location_when_scan_insert_fails() {
        let root = test_root("bootstrap-scan-rollback");
        let source_root = root.join("source");
        std::fs::create_dir_all(&source_root).unwrap();
        let canonical_source = source_root.canonicalize().unwrap();
        let db = Database::open(root.join("state.db")).unwrap();
        let conn = db.connect().unwrap();
        conn.execute_batch(
            r#"
            CREATE TRIGGER force_bootstrap_scan_failure
            BEFORE INSERT ON scans
            BEGIN
                SELECT RAISE(ABORT, 'forced bootstrap scan failure');
            END;
            "#,
        )
        .unwrap();
        drop(conn);

        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);
        let error = db
            .bootstrap_location_and_start_scan(
                "archive-volume",
                &canonical_source,
                Path::new("/"),
                started_at,
            )
            .expect_err("forced scan insert failure must roll back the location");
        assert!(error.to_string().contains("forced bootstrap scan failure"));
        assert!(db.locations().unwrap().is_empty());
        assert!(db.scans().unwrap().is_empty());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bootstrap_location_and_scan_accepts_equivalent_noncanonical_existing_root() {
        let root = test_root("bootstrap-noncanonical-existing-root");
        let source_root = root.join("source");
        std::fs::create_dir_all(&source_root).unwrap();
        let stored_root = root.join("source/../source");
        let canonical_source = source_root.canonicalize().unwrap();
        let db = Database::open(root.join("state.db")).unwrap();
        let existing = db
            .add_location(LocationInput {
                kind: LocationType::Disk,
                name: "Archive".to_string(),
                slug: "archive-volume".to_string(),
                root_path: stored_root.clone(),
                notes: None,
            })
            .unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        let reservation = db
            .bootstrap_location_and_start_scan(
                "archive-volume",
                &canonical_source,
                Path::new("/"),
                started_at,
            )
            .unwrap();
        assert_eq!(reservation.location.id, existing.id);
        assert_eq!(reservation.location.root_path, stored_root);
        assert_eq!(db.locations().unwrap().len(), 1);
        assert_eq!(db.scans().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(root);
    }

    fn cached_scan_with_invalidation_failure(name: &str) -> (PathBuf, Database, String) {
        let root = test_root(name);
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Archive".to_string(),
                slug: "archive".to_string(),
                root_path: root.join("location"),
                notes: None,
        })
        .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        db.set_representative_scan(&scan_id).unwrap();
        db.rebuild_duplicate_cache_for_current_scope()
            .unwrap()
            .expect("the representative running scan has a cache scope");
        assert_eq!(db.current_duplicate_cache_status().unwrap().status, "ready");
        let conn = db.connect().unwrap();
        conn.execute_batch(
            r#"
            CREATE TRIGGER force_duplicate_cache_invalidation_failure
            BEFORE DELETE ON duplicate_cache_runs
            BEGIN
                SELECT RAISE(ABORT, 'forced duplicate cache invalidation failure');
            END;
            "#,
        )
        .unwrap();
        drop(conn);

        (root, db, scan_id)
    }

    #[test]
    fn update_scan_counts_rolls_back_when_cache_invalidation_fails() {
        let (root, db, scan_id) =
            cached_scan_with_invalidation_failure("update-scan-counts-cache-rollback");

        let error = db
            .update_scan_counts(&scan_id, 7, 2, 1, 42)
            .expect_err("cache invalidation failure must roll back progress counts");
        assert!(
            error
                .to_string()
                .contains("forced duplicate cache invalidation failure"),
            "{error:#}"
        );

        let scan = db.scan_by_id(&scan_id).unwrap().unwrap();
        assert_eq!(scan.status, "running");
        assert!(scan.finished_at.is_none());
        assert_eq!(scan.file_count, 0);
        assert_eq!(scan.dir_count, 0);
        assert_eq!(scan.error_count, 0);
        assert_eq!(scan.total_bytes, 0);

        let conn = db.connect().unwrap();
        let cache_runs: u64 = conn
            .query_row("SELECT COUNT(*) FROM duplicate_cache_runs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(cache_runs, 1);
        drop(conn);
        assert_eq!(db.current_duplicate_cache_status().unwrap().status, "ready");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn finish_scan_persists_terminal_state_when_cache_invalidation_fails() {
        for (case, status, file_count, dir_count, error_count, total_bytes) in [
            ("complete", "complete", 7_u64, 2_u64, 1_u64, 42_u64),
            ("failed", "failed", 0_u64, 0_u64, 1_u64, 0_u64),
        ] {
            let (root, db, scan_id) = cached_scan_with_invalidation_failure(&format!(
                "finish-scan-cache-status-{case}"
            ));

            db.finish_scan(
                &scan_id,
                file_count,
                dir_count,
                error_count,
                total_bytes,
                status,
            )
            .expect("terminal fallback must preserve the intended scan status");

            let scan = db.scan_by_id(&scan_id).unwrap().unwrap();
            assert_eq!(scan.status, status);
            assert!(scan.finished_at.is_some());
            assert_eq!(scan.file_count, file_count);
            assert_eq!(scan.dir_count, dir_count);
            assert_eq!(scan.error_count, error_count);
            assert_eq!(scan.total_bytes, total_bytes);

            let conn = db.connect().unwrap();
            let cache_runs: u64 = conn
                .query_row("SELECT COUNT(*) FROM duplicate_cache_runs", [], |row| row.get(0))
                .unwrap();
            assert_eq!(cache_runs, 1);
            drop(conn);
            assert_eq!(db.current_duplicate_cache_status().unwrap().status, "stale");

            let _ = std::fs::remove_dir_all(root);
        }
    }

    #[test]
    fn finish_scan_rejects_a_missing_scan_without_invalidating_cache() {
        let (root, db, _) =
            cached_scan_with_invalidation_failure("finish-scan-missing-scan");

        let error = db
            .finish_scan("missing-scan", 7, 2, 1, 42, "complete")
            .expect_err("a deleted scan must not look successfully finalized");
        assert!(
            error
                .to_string()
                .contains("expected to finalize exactly one scan missing-scan"),
            "{error:#}"
        );

        let conn = db.connect().unwrap();
        let cache_runs: u64 = conn
            .query_row("SELECT COUNT(*) FROM duplicate_cache_runs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(cache_runs, 1);
        drop(conn);
        assert_eq!(db.current_duplicate_cache_status().unwrap().status, "ready");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn finish_scan_propagates_terminal_update_failure_without_fallback() {
        let root = test_root("finish-scan-update-failure");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Archive".to_string(),
                slug: "archive".to_string(),
                root_path: root.join("location"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        let conn = db.connect().unwrap();
        conn.execute_batch(
            r#"
            CREATE TRIGGER force_terminal_update_failure
            BEFORE UPDATE OF status ON scans
            WHEN NEW.status = 'complete'
            BEGIN
                SELECT RAISE(ABORT, 'forced terminal update failure');
            END;
            "#,
        )
        .unwrap();
        drop(conn);

        let error = db
            .finish_scan(&scan_id, 7, 2, 1, 42, "complete")
            .expect_err("a terminal UPDATE failure must propagate");
        assert!(
            error
                .to_string()
                .contains("forced terminal update failure"),
            "{error:#}"
        );

        let scan = db.scan_by_id(&scan_id).unwrap().unwrap();
        assert_eq!(scan.status, "running");
        assert!(scan.finished_at.is_none());
        assert_eq!(scan.file_count, 0);
        assert_eq!(scan.dir_count, 0);
        assert_eq!(scan.error_count, 0);
        assert_eq!(scan.total_bytes, 0);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_locations_type_check_migrates_without_losing_rows_or_foreign_keys() {
        let root = test_root("legacy-location-type-check");
        std::fs::create_dir_all(&root).unwrap();
        let db_path = root.join("state.db");

        let legacy = Connection::open(&db_path).unwrap();
        legacy.pragma_update(None, "foreign_keys", "ON").unwrap();
        legacy
            .execute_batch(
                r#"
                CREATE TABLE locations (
                    id TEXT PRIMARY KEY,
                    slug TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('local', 'disk', 'nas')),
                    root_path TEXT NOT NULL,
                    notes TEXT,
                    representative_scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,
                    disabled INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE scans (
                    id TEXT PRIMARY KEY,
                    location_id TEXT NOT NULL REFERENCES locations(id),
                    offset_path TEXT NOT NULL DEFAULT '/',
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    file_count INTEGER NOT NULL DEFAULT 0,
                    dir_count INTEGER NOT NULL DEFAULT 0,
                    error_count INTEGER NOT NULL DEFAULT 0,
                    total_bytes INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'running',
                    notes TEXT
                );

                INSERT INTO locations (
                    id, slug, name, type, root_path, notes, disabled, created_at
                ) VALUES (
                    'location-legacy', 'archive', 'Archive', 'disk', '/Volumes/archive',
                    'preserve me', 1, '2026-07-14T00:00:00Z'
                );
                INSERT INTO scans (id, location_id, started_at, status, notes) VALUES (
                    'scan-legacy', 'location-legacy', '2026-07-14T00:00:00Z', 'complete',
                    'preserve scan'
                );
                UPDATE locations
                SET representative_scan_id = 'scan-legacy'
                WHERE id = 'location-legacy';
                "#,
            )
            .unwrap();
        drop(legacy);

        let db = Database::open(&db_path).unwrap();
        let locations = db.locations().unwrap();
        assert_eq!(locations.len(), 1);
        let location = &locations[0];
        assert_eq!(location.id, "location-legacy");
        assert_eq!(location.slug, "archive");
        assert_eq!(location.kind, LocationType::Disk);
        assert_eq!(location.notes.as_deref(), Some("preserve me"));
        assert_eq!(location.representative_scan_id.as_deref(), Some("scan-legacy"));
        assert!(location.disabled);
        assert_eq!(
            db.scan_by_id("scan-legacy")
                .unwrap()
                .unwrap()
                .location_slug,
            "archive"
        );

        let unknown = db
            .add_location(LocationInput {
                kind: LocationType::Unknown,
                name: "Unclassified".to_string(),
                slug: "unclassified".to_string(),
                root_path: root.join("unclassified"),
                notes: None,
            })
            .unwrap();
        assert_eq!(unknown.kind, LocationType::Unknown);

        let conn = db.connect().unwrap();
        assert!(locations_type_check_supports_unknown(&conn).unwrap());
        ensure_foreign_keys_valid(&conn).unwrap();
        assert!(conn
            .execute(
                "UPDATE locations SET representative_scan_id = 'missing-scan' WHERE id = 'location-legacy'",
                [],
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO scans (id, location_id, started_at) VALUES ('orphan-scan', 'missing-location', '2026-07-14T00:00:00Z')",
                [],
            )
            .is_err());
    }

    #[test]
    fn legacy_database_gains_hash_policy_and_blake3_light_columns_on_open() {
        // Reproduces the recovery gap where a pre-existing database lacked the
        // `scans.hash_policy`, `scans.nickname`, and `files.blake3_light`
        // columns that current queries require. Opening it must add them so the
        // representative-scan / duplicate-scope queries stop failing with
        // "no such column".
        let root = test_root("legacy-hash-policy-columns");
        std::fs::create_dir_all(&root).unwrap();
        let db_path = root.join("state.db");

        let legacy = Connection::open(&db_path).unwrap();
        legacy
            .execute_batch(
                r#"
                CREATE TABLE locations (
                    id TEXT PRIMARY KEY,
                    slug TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('local', 'disk', 'nas')),
                    root_path TEXT NOT NULL,
                    notes TEXT,
                    representative_scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,
                    disabled INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE scans (
                    id TEXT PRIMARY KEY,
                    location_id TEXT NOT NULL REFERENCES locations(id),
                    offset_path TEXT NOT NULL DEFAULT '/',
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    file_count INTEGER NOT NULL DEFAULT 0,
                    dir_count INTEGER NOT NULL DEFAULT 0,
                    error_count INTEGER NOT NULL DEFAULT 0,
                    total_bytes INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'running',
                    notes TEXT
                );
                CREATE TABLE files (
                    id INTEGER PRIMARY KEY,
                    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    name TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    blake3 TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'file',
                    ctime TEXT,
                    mtime TEXT,
                    mode INTEGER,
                    error TEXT,
                    UNIQUE(scan_id, path)
                );
                INSERT INTO locations (id, slug, name, type, root_path, disabled, created_at)
                VALUES ('loc-1', 'archive', 'Archive', 'disk', '/Volumes/archive', 0, '2026-07-14T00:00:00Z');
                INSERT INTO scans (id, location_id, started_at, status)
                VALUES ('scan-1', 'loc-1', '2026-07-14T00:00:00Z', 'complete');
                "#,
            )
            .unwrap();
        drop(legacy);

        // Opening runs migrate(), which must add the missing columns.
        let db = Database::open(&db_path).unwrap();
        let conn = db.connect().unwrap();
        assert!(column_exists(&conn, "scans", "hash_policy").unwrap());
        assert!(column_exists(&conn, "scans", "nickname").unwrap());
        assert!(column_exists(&conn, "files", "blake3_light").unwrap());

        // The added column carries the correct default and the query that
        // previously failed now runs.
        let policy: String = conn
            .query_row(
                "SELECT hash_policy FROM scans WHERE id = 'scan-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(policy, "full");
        let rep: Option<String> = conn
            .query_row(
                r#"SELECT (
                    SELECT s2.id FROM scans s2
                    WHERE s2.location_id = l.id AND s2.status = 'complete'
                      AND s2.hash_policy != 'light'
                    ORDER BY s2.started_at DESC LIMIT 1
                ) FROM locations l WHERE l.id = 'loc-1'"#,
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rep.as_deref(), Some("scan-1"));
    }

    #[test]
    fn clear_representative_scan_only_clears_when_scan_is_current_representative() {
        let root = test_root("clear-representative");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Test".to_string(),
                slug: "test".to_string(),
                root_path: root.join("location"),
                notes: None,
            })
            .unwrap();
        let first_scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        let second_scan_id = db.start_scan(&location, Path::new("/next")).unwrap();

        db.set_representative_scan(&second_scan_id).unwrap();

        let first_scan = db.clear_representative_scan(&first_scan_id).unwrap();
        assert!(!first_scan.is_representative);
        assert_eq!(
            db.location_by_slug("test")
                .unwrap()
                .unwrap()
                .representative_scan_id,
            Some(second_scan_id.clone())
        );

        let second_scan = db.clear_representative_scan(&second_scan_id).unwrap();
        assert!(!second_scan.is_representative);
        assert_eq!(
            db.location_by_slug("test")
                .unwrap()
                .unwrap()
                .representative_scan_id,
            None
        );
    }

    #[test]
    fn delete_check_paths_includes_selected_files_and_folder_descendants() {
        let root = test_root("delete-check-paths");
        let db = Database::open(root.join("state.db")).unwrap();
        let source_location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: root.join("source"),
                notes: None,
            })
            .unwrap();
        let copy_location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Copy".to_string(),
                slug: "copy".to_string(),
                root_path: root.join("copy"),
                notes: None,
            })
            .unwrap();
        let source_scan_id = db.start_scan(&source_location, Path::new("/")).unwrap();
        let copy_scan_id = db.start_scan(&copy_location, Path::new("/")).unwrap();
        db.insert_file_batch(&[
            test_file(&source_scan_id, "keep.txt", 1, "hash-keep"),
            test_file(&source_scan_id, "folder/copied.txt", 2, "hash-copied"),
            test_file(&source_scan_id, "folder/missing.txt", 3, "hash-missing"),
            test_file(&source_scan_id, "other.txt", 4, "hash-other"),
            test_file(&copy_scan_id, "keep.txt", 1, "hash-keep"),
            test_file(&copy_scan_id, "folder/copied.txt", 2, "hash-copied"),
        ])
        .unwrap();
        db.finish_scan(&source_scan_id, 4, 0, 0, 10, "complete")
            .unwrap();
        db.finish_scan(&copy_scan_id, 2, 0, 0, 3, "complete")
            .unwrap();

        let result = db
            .delete_check_paths(
                &source_scan_id,
                &[
                    "keep.txt".to_string(),
                    "folder".to_string(),
                    "..".to_string(),
                ],
            )
            .unwrap();

        assert_eq!(result.total_count, 3);
        assert!(!result.safe);
        assert_eq!(result.missing_count, 1);
        assert_eq!(
            result
                .checked_files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            vec!["folder/copied.txt", "folder/missing.txt", "keep.txt"]
        );
        assert_eq!(result.missing_files[0].path, "folder/missing.txt");
    }

    #[test]
    fn thumbnail_candidate_paths_include_exact_files_and_respect_folder_recursion() {
        let root = test_root("thumbnail-candidate-paths");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: root.join("source"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        db.insert_file_batch(&[
            test_file(&scan_id, "image.jpg", 1, "hash-image"),
            test_file(&scan_id, "folder/direct.jpg", 2, "hash-direct"),
            test_file(&scan_id, "folder/sub/nested.jpg", 3, "hash-nested"),
            test_file(&scan_id, "other.jpg", 4, "hash-other"),
        ])
        .unwrap();

        let shallow = db
            .thumbnail_candidates_paths(
                &scan_id,
                &["image.jpg".to_string(), "folder".to_string()],
                false,
            )
            .unwrap();
        assert_eq!(
            shallow
                .iter()
                .map(|candidate| candidate.path.as_str())
                .collect::<Vec<_>>(),
            vec!["folder/direct.jpg", "image.jpg"]
        );

        let recursive = db
            .thumbnail_candidates_paths(&scan_id, &["folder".to_string()], true)
            .unwrap();
        assert_eq!(
            recursive
                .iter()
                .map(|candidate| candidate.path.as_str())
                .collect::<Vec<_>>(),
            vec!["folder/direct.jpg", "folder/sub/nested.jpg"]
        );
    }

    #[test]
    fn scan_excludes_filter_public_queries_without_mutating_physical_files() {
        let root = test_root("scan-exclude-visibility");
        let db = Database::open(root.join("state.db")).unwrap();
        let source = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: root.join("source"),
                notes: None,
            })
            .unwrap();
        let copy = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Copy".to_string(),
                slug: "copy".to_string(),
                root_path: root.join("copy"),
                notes: None,
            })
            .unwrap();
        let source_scan_id = db.start_scan(&source, Path::new("/")).unwrap();
        let copy_scan_id = db.start_scan(&copy, Path::new("/")).unwrap();
        db.insert_file_batch(&[
            test_file(&source_scan_id, "visible.txt", 1, "hash-visible"),
            test_file(&source_scan_id, "hidden.txt", 2, "hash-hidden"),
            NewFile {
                scan_id: source_scan_id.clone(),
                kind: "dir".to_string(),
                path: "hidden-dir".to_string(),
                name: "hidden-dir".to_string(),
                size: 0,
                blake3: String::new(),
                sha256: String::new(),
                blake3_light: String::new(),
                ctime: None,
                mtime: None,
                mode: None,
                error: None,
            },
            test_file(
                &source_scan_id,
                "hidden-dir/nested.txt",
                3,
                "hash-nested",
            ),
            test_file(&copy_scan_id, "visible.txt", 1, "hash-visible"),
            test_file(&copy_scan_id, "hidden.txt", 2, "hash-hidden"),
            test_file(&copy_scan_id, "hidden-dir/nested.txt", 3, "hash-nested"),
        ])
        .unwrap();
        db.finish_scan(&source_scan_id, 3, 1, 0, 6, "complete")
            .unwrap();
        db.finish_scan(&copy_scan_id, 3, 0, 0, 6, "complete")
            .unwrap();
        db.set_scan_excludes(
            &source_scan_id,
            vec!["/hidden.txt".to_string(), "/hidden-dir/".to_string()],
        )
        .unwrap();

        assert!(db
            .scan_path_is_visible(&source_scan_id, "visible.txt", false)
            .unwrap());
        assert!(!db
            .scan_path_is_visible(&source_scan_id, "hidden.txt", false)
            .unwrap());
        assert!(!db
            .scan_path_is_visible(&source_scan_id, "hidden-dir", true)
            .unwrap());
        assert!(!db
            .scan_path_is_visible(&source_scan_id, "hidden-dir/nested.txt", false)
            .unwrap());

        // Raw reuse and stored counts remain physical; excludes are query-only.
        assert_eq!(db.reusable_files_for_scan(&source_scan_id).unwrap().len(), 3);
        assert_eq!(
            db.scan_by_id(&source_scan_id).unwrap().unwrap().file_count,
            3
        );

        // The raw newest row is hidden, so this also proves the visible limit
        // is applied after Rust visibility filtering.
        let visible_files = db.scan_files(&source_scan_id, 1).unwrap();
        assert_eq!(
            visible_files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            vec!["visible.txt"]
        );
        assert_eq!(visible_files[0].kind, "file");
        assert_eq!(visible_files[0].file_kind, "text");

        // Duplicate counters now come from the cache (covered by
        // scan_tree_duplicate_counts_come_from_cache_not_inline); here we assert
        // the visibility boundary through the production paged tree path.
        let tree = db
            .scan_tree_page(&source_scan_id, "", Some(50), 0, 1, None)
            .unwrap();
        assert_eq!(
            tree.entries.iter().map(|entry| entry.path.as_str()).collect::<Vec<_>>(),
            vec!["visible.txt"]
        );

        let found_hidden = db.find_files("hidden", 20).unwrap();
        assert_eq!(found_hidden.len(), 2);
        assert!(found_hidden
            .iter()
            .all(|file| file.scan_id == copy_scan_id));
        assert_eq!(
            db.file_occurrences("hash-hidden", 2)
                .unwrap()
                .iter()
                .map(|file| file.scan_id.as_str())
                .collect::<Vec<_>>(),
            vec![copy_scan_id.as_str()]
        );

        let delete_check = db.delete_check(&source_scan_id, "").unwrap();
        assert!(delete_check.safe);
        assert_eq!(delete_check.total_count, 1);
        assert_eq!(delete_check.checked_files[0].path, "visible.txt");
        assert_eq!(
            db.delete_check_paths(&source_scan_id, &["hidden-dir".to_string()])
                .unwrap()
                .total_count,
            0
        );

        assert_eq!(
            db.thumbnail_candidates(&source_scan_id, "", true)
                .unwrap()
                .iter()
                .map(|candidate| candidate.path.as_str())
                .collect::<Vec<_>>(),
            vec!["visible.txt"]
        );
        assert!(db
            .thumbnail_candidates_paths(&source_scan_id, &["hidden-dir".to_string()], true)
            .unwrap()
            .is_empty());

        let duplicate_groups = db.duplicate_groups(20).unwrap();
        assert_eq!(duplicate_groups.len(), 1);
        assert_eq!(duplicate_groups[0].blake3, "hash-visible");
        assert_eq!(duplicate_groups[0].file_kind, "text");
        assert!(duplicate_groups[0]
            .files
            .iter()
            .all(|file| file.file_kind == "text"));
        assert_eq!(db.duplicate_groups_for_scans(20, &[]).unwrap().len(), 1);
        assert!(db
            .duplicate_groups_for_scans(20, std::slice::from_ref(&source_scan_id))
            .unwrap()
            .is_empty());
        assert_eq!(
            db.duplicate_groups_for_scans(
                20,
                &[source_scan_id.clone(), copy_scan_id.clone()],
            )
            .unwrap()[0]
                .blake3,
            "hash-visible"
        );
        assert_eq!(db.overview().unwrap().duplicate_groups, 1);
        assert_eq!(db.overview().unwrap().file_count, 6);

        // Cache scope metadata follows the same visible-file boundary as the
        // public duplicate query, while physical overview counts stay raw.
        assert!(db.current_duplicate_scope_fingerprint().unwrap().is_some());
        assert_eq!(db.current_duplicate_cache_status().unwrap().total_files, 4);
    }

    #[test]
    fn visible_tree_search_and_delete_share_the_exclude_boundary() {
        let root = test_root("visible-tree-search-delete");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: root.join("source"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        db.insert_file_batch(&[
            NewFile {
                scan_id: scan_id.clone(),
                kind: "dir".to_string(),
                path: "folder".to_string(),
                name: "folder".to_string(),
                size: 0,
                blake3: String::new(),
                sha256: String::new(),
                blake3_light: String::new(),
                ctime: None,
                mtime: None,
                mode: None,
                error: None,
            },
            test_file(&scan_id, "folder/visible.txt", 1, "visible-hash"),
            test_file(&scan_id, "folder/hidden.txt", 2, "hidden-hash"),
        ])
        .unwrap();
        db.finish_scan(&scan_id, 2, 1, 0, 3, "complete")
            .unwrap();
        db.set_scan_excludes(&scan_id, vec!["/folder/hidden.txt".to_string()])
            .unwrap();

        let page = db
            .scan_tree_page(&scan_id, "", Some(20), 0, 1, None)
            .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.entries[0].path, "folder");
        assert_eq!(page.entries[0].file_count, 1);
        assert_eq!(page.entries[0].size, 1);

        let matches = db
            .search_files(&FileSearchQuery {
                filter: Some(FileSearchFilter {
                    term: FileSearchTerm::Text,
                    operator: FileSearchOperator::Substring,
                    expression: FileSearchExpression::String("hidden".to_string()),
                }),
                limit: Some(20),
                offset: None,
                representative_only: None,
                scan_ids: Some(vec![scan_id.clone()]),
            })
            .unwrap();
        assert!(matches.is_empty());

        assert!(db
            .scan_path_has_excluded_descendants(&scan_id, "folder")
            .unwrap());
        assert!(db.delete_visible_scan_path(&scan_id, "folder").is_err());
        assert_eq!(db.reusable_files_for_scan(&scan_id).unwrap().len(), 2);

        let occurrences = db
            .visible_file_occurrences_page(
                &scan_id,
                "folder/visible.txt",
                "visible-hash",
                1,
                20,
                0,
            )
            .unwrap();
        assert_eq!(occurrences.total, 1);
        assert!(db
            .visible_file_occurrences_page(
                &scan_id,
                "folder/hidden.txt",
                "hidden-hash",
                2,
                20,
                0,
            )
            .is_err());
    }

    #[test]
    fn scan_excludes_are_a_filter_and_never_delete_physical_files() {
        let root = test_root("excludes-non-destructive");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Media".to_string(),
                slug: "media".to_string(),
                root_path: root.join("location"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        db.insert_file_batch(&[
            test_file(&scan_id, "keep.txt", 10, "hash-keep"),
            test_file(&scan_id, "logs/app.tmp", 20, "hash-a"),
            test_file(&scan_id, "logs/debug.tmp", 30, "hash-b"),
        ])
        .unwrap();
        db.finish_scan(&scan_id, 3, 0, 0, 60, "complete").unwrap();

        let physical_count = |db: &Database| -> u64 {
            db.connect()
                .unwrap()
                .query_row(
                    "SELECT COUNT(*) FROM files WHERE scan_id = ?1",
                    [&scan_id],
                    |row| row.get(0),
                )
                .unwrap()
        };
        assert_eq!(physical_count(&db), 3);

        // A pattern that matches files must never delete physical rows — excludes
        // are a scan-scoped visibility filter only.
        db.set_scan_excludes(&scan_id, vec!["*.tmp".to_string(), "logs/".to_string()])
            .unwrap();
        assert_eq!(physical_count(&db), 3, "set_scan_excludes must not delete files");

        // Appending an exact-path exclude likewise never deletes.
        db.append_exact_scan_exclude(&scan_id, "keep.txt", "file").unwrap();
        assert_eq!(
            physical_count(&db),
            3,
            "append_exact_scan_exclude must not delete files"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn file_exif_cache_round_trips_by_content_identity() {
        let root = test_root("file-exif-cache");
        let db = Database::open(root.join("state.db")).unwrap();

        db.cache_file_exif(
            "hash-a",
            100,
            "ok",
            Some("scan-1"),
            Some("/x/a.jpg"),
            "[{\"group\":\"EXIF\",\"tag\":\"Make\",\"value\":\"Canon\"}]",
            None,
        )
        .unwrap();
        let cached = db.cached_file_exif("hash-a", 100).unwrap().unwrap();
        assert_eq!(cached.status, "ok");
        assert_eq!(cached.source_path.as_deref(), Some("/x/a.jpg"));
        assert!(cached.fields_json.contains("Canon"));

        // Re-caching the same content identity updates in place.
        db.cache_file_exif("hash-a", 100, "unsupported", None, None, "[]", None)
            .unwrap();
        assert_eq!(
            db.cached_file_exif("hash-a", 100).unwrap().unwrap().status,
            "unsupported"
        );
        assert!(db.cached_file_exif("missing", 1).unwrap().is_none());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn scan_tree_duplicate_counts_come_from_cache_not_inline() {
        // Folder browsing must not recompute duplicate counters inline (the hot
        // path); they come from the precomputed per-scan-per-path duplicate
        // cache. Until a ready cache run exists they render as unknown (0).
        let root = test_root("scan-tree-cache-counts");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Media".to_string(),
                slug: "media".to_string(),
                root_path: root.join("location"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        let dir_row = NewFile {
            scan_id: scan_id.clone(),
            kind: "dir".to_string(),
            path: "folder".to_string(),
            name: "folder".to_string(),
            size: 0,
            blake3: String::new(),
            sha256: String::new(),
            blake3_light: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        };
        // Two files in the same folder share content (same blake3+size) → they
        // are same-scan duplicates of each other.
        db.insert_file_batch(&[
            dir_row,
            test_file(&scan_id, "folder/a.txt", 10, "dup-hash"),
            test_file(&scan_id, "folder/b.txt", 10, "dup-hash"),
        ])
        .unwrap();
        db.finish_scan(&scan_id, 2, 1, 0, 20, "complete").unwrap();
        db.set_representative_scan(&scan_id).unwrap();

        // Before any cache run the tree reports backup status as unknown ("").
        let page = db.scan_tree_page(&scan_id, "folder", Some(20), 0, 1, None).unwrap();
        let file_a = page.entries.iter().find(|e| e.path == "folder/a.txt").unwrap();
        assert_eq!(file_a.backup_status, "");

        // After the cache is ready the backup rollups come from the cache, per
        // path. Exercise the real trigger core used by completion/startup hooks.
        crate::duplicate_cache::run_rebuild_duplicate_cache(&db, &crate::events::EventHub::default());
        assert_eq!(db.current_duplicate_cache_status().unwrap().status, "ready");

        // Both files share content in the ONLY location, so cross-location they
        // are unsafe, each with one same-location copy (⌂ here = 1).
        let file_page = db.scan_tree_page(&scan_id, "folder", Some(20), 0, 1, None).unwrap();
        for name in ["folder/a.txt", "folder/b.txt"] {
            let entry = file_page.entries.iter().find(|e| e.path == name).unwrap();
            assert_eq!(entry.backup_status, "unsafe", "{name}");
            assert_eq!(entry.copies_here, 1, "{name}");
            assert_eq!(entry.copies_away, 0, "{name}");
        }

        // The directory row: 2 file instances but 1 UNIQUE content, which is
        // unsafe (no cross-location copy).
        let root_page = db.scan_tree_page(&scan_id, "", Some(20), 0, 1, None).unwrap();
        let folder = root_page.entries.iter().find(|e| e.path == "folder").unwrap();
        assert_eq!(folder.kind, "dir");
        assert_eq!(folder.file_count, 2, "instances");
        assert_eq!(folder.distinct_count, 1, "unique contents");
        assert_eq!((folder.safe_count, folder.warn_count, folder.unsafe_count), (0, 0, 1));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn visible_scan_action_target_resolves_visible_file_and_direct_or_synthetic_directory() {
        let root = test_root("visible-scan-action-target");
        let location_root = root.join("location");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: location_root.clone(),
                notes: None,
            })
            .unwrap();
        let scan_id = db
            .start_scan(&location, Path::new("/scan-subdirectory"))
            .unwrap();
        db.insert_file_batch(&[
            test_file(&scan_id, "visible.txt", 1, "visible-hash"),
            NewFile {
                scan_id: scan_id.clone(),
                kind: "dir".to_string(),
                path: "empty-dir".to_string(),
                name: "empty-dir".to_string(),
                size: 0,
                blake3: String::new(),
                sha256: String::new(),
                blake3_light: String::new(),
                ctime: None,
                mtime: None,
                mode: None,
                error: None,
            },
            test_file(&scan_id, "synthetic-dir/child.txt", 2, "child-hash"),
        ])
        .unwrap();

        let file = db
            .resolve_visible_scan_action_target(&scan_id, "/visible.txt")
            .unwrap();
        assert_eq!(file.kind, "file");
        assert_eq!(
            file.filesystem_path,
            location_root.join("scan-subdirectory").join("visible.txt")
        );
        assert_eq!(
            db.resolve_visible_scan_action_target_if_visible(&scan_id, "visible.txt")
                .unwrap()
                .unwrap()
                .kind,
            "file"
        );

        let direct_dir = db
            .resolve_visible_scan_action_target(&scan_id, "empty-dir")
            .unwrap();
        assert_eq!(direct_dir.kind, "dir");
        assert_eq!(
            direct_dir.filesystem_path,
            location_root.join("scan-subdirectory").join("empty-dir")
        );

        let synthetic_dir = db
            .resolve_visible_scan_action_target(&scan_id, "synthetic-dir")
            .unwrap();
        assert_eq!(synthetic_dir.kind, "dir");
        assert_eq!(
            synthetic_dir.filesystem_path,
            location_root.join("scan-subdirectory").join("synthetic-dir")
        );
    }

    #[test]
    fn visible_scan_action_target_rejects_excluded_error_missing_and_unsafe_paths() {
        let root = test_root("visible-scan-action-target-rejections");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: root.join("location"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        db.insert_file_batch(&[
            test_file(&scan_id, "visible.txt", 1, "visible-hash"),
            test_file(&scan_id, "hidden.txt", 2, "hidden-hash"),
            test_file(&scan_id, "hidden-dir/child.txt", 3, "hidden-child-hash"),
            test_file(&scan_id, "literalXdir/child.txt", 4, "literal-child-hash"),
            NewFile {
                scan_id: scan_id.clone(),
                kind: "file".to_string(),
                path: "failed.txt".to_string(),
                name: "failed.txt".to_string(),
                size: 0,
                blake3: String::new(),
                sha256: String::new(),
                blake3_light: String::new(),
                ctime: None,
                mtime: None,
                mode: None,
                error: Some("permission denied".to_string()),
            },
        ])
        .unwrap();
        db.set_scan_excludes(
            &scan_id,
            vec!["/hidden.txt".to_string(), "/hidden-dir/".to_string()],
        )
        .unwrap();
        let excludes_before = db.scan_exclude_patterns(&scan_id).unwrap();

        for path in [
            "hidden.txt",
            "hidden-dir",
            "failed.txt",
            "missing.txt",
            // The percent must remain literal in the descendant LIKE query.
            "literal%dir",
        ] {
            assert!(
                db.resolve_visible_scan_action_target(&scan_id, path)
                    .is_err(),
                "{path} must not resolve to an action target"
            );
            assert!(
                db.resolve_visible_scan_action_target_if_visible(&scan_id, path)
                    .unwrap()
                    .is_none(),
                "{path} must be a normal stale/hidden result"
            );
        }
        for path in [
            "",
            "/",
            ".",
            "..",
            "../visible.txt",
            r"..\visible.txt",
            r"\\server\share",
            "//server/share",
            r"C:\visible.txt",
            "C:visible.txt",
            "nul\0byte",
        ] {
            assert!(
                db.resolve_visible_scan_action_target(&scan_id, path)
                    .is_err(),
                "unsafe path {path:?} must not resolve"
            );
            assert!(
                db.resolve_visible_scan_action_target_if_visible(&scan_id, path)
                    .is_err(),
                "unsafe path {path:?} must remain an error"
            );
        }
        assert!(
            db.resolve_visible_scan_action_target_if_visible("missing-scan", "visible.txt")
                .is_err(),
            "missing scan must remain an error"
        );

        assert_eq!(db.scan_exclude_patterns(&scan_id).unwrap(), excludes_before);
        let raw_file_count: u64 = db
            .connect()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM files WHERE scan_id = ?1",
                [&scan_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(raw_file_count, 5);
    }

    #[test]
    fn visible_scan_action_target_fails_closed_for_an_unsafe_stored_offset() {
        let root = test_root("visible-scan-action-target-offset");
        let db = Database::open(root.join("state.db")).unwrap();
        let location = db
            .add_location(LocationInput {
                kind: LocationType::Local,
                name: "Source".to_string(),
                slug: "source".to_string(),
                root_path: root.join("location"),
                notes: None,
            })
            .unwrap();
        let scan_id = db.start_scan(&location, Path::new("/")).unwrap();
        db.insert_file_batch(&[test_file(&scan_id, "visible.txt", 1, "visible-hash")])
            .unwrap();
        db.connect()
            .unwrap()
            .execute(
                "UPDATE scans SET offset_path = ?1 WHERE id = ?2",
                params!["../outside", &scan_id],
            )
            .unwrap();

        assert!(db
            .resolve_visible_scan_action_target(&scan_id, "visible.txt")
            .is_err());
        assert!(db
            .resolve_visible_scan_action_target_if_visible(&scan_id, "visible.txt")
            .is_err());
    }

    #[test]
    fn filename_categories_cover_duplicate_ui_contracts() {
        assert_eq!(semantic_file_kind("beach.JPG"), "image");
        assert_eq!(semantic_file_kind("archive.MOV"), "video");
        assert_eq!(semantic_file_kind("notes.md"), "text");
        assert_eq!(semantic_file_kind("payload.bin"), "other");
        assert_eq!(
            duplicate_group_file_kind(["image", "image"].iter().copied()),
            "image"
        );
        assert_eq!(
            duplicate_group_file_kind(["image", "video"].iter().copied()),
            "mixed"
        );
        assert_eq!(
            duplicate_group_file_kind(std::iter::empty::<&str>()),
            "other"
        );
    }

    fn test_file(scan_id: &str, path: &str, size: u64, hash: &str) -> NewFile {
        NewFile {
            scan_id: scan_id.to_string(),
            kind: "file".to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap().to_string(),
            size,
            blake3: hash.to_string(),
            sha256: hash.to_string(),
            blake3_light: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        }
    }

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "file-census-db-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
}

fn occurrence_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileOccurrence> {
    Ok(FileOccurrence {
        scan_id: row.get(0)?,
        scan_started_at: row.get(1)?,
        scan_finished_at: row.get(2)?,
        scan_status: row.get(3)?,
        location_slug: row.get(4)?,
        location_name: row.get(5)?,
        kind: row.get(6)?,
        path: row.get(7)?,
        name: row.get(8)?,
        size: row.get(9)?,
        blake3: row.get(10)?,
        sha256: row.get(11)?,
        ctime: row.get(12)?,
        mtime: row.get(13)?,
        mode: row.get(14)?,
        error: row.get(15)?,
    })
}
