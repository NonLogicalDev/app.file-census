use std::collections::HashSet;
use std::fmt;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LocationType {
    Local,
    Disk,
    Nas,
}

impl fmt::Display for LocationType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
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

#[derive(Clone, Debug, Serialize)]
pub struct DuplicateGroup {
    pub blake3: String,
    pub size: u64,
    pub count: u64,
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

#[derive(Clone, Debug, Serialize)]
pub struct Overview {
    pub location_count: u64,
    pub scan_count: u64,
    pub file_count: u64,
    pub total_bytes: u64,
    pub duplicate_groups: u64,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let db = Self {
            path: path.as_ref().to_path_buf(),
        };
        let conn = db.connect()?;
        db.migrate(&conn)?;
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
        Ok(conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn migrate(&self, conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS locations (
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
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY,
                scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                size INTEGER NOT NULL,
                blake3 TEXT NOT NULL,
                sha256 TEXT NOT NULL,
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

            CREATE TABLE IF NOT EXISTS scan_excludes (
                id INTEGER PRIMARY KEY,
                scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
                pattern TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(scan_id, pattern)
            );

            CREATE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug);
            CREATE INDEX IF NOT EXISTS idx_scans_location ON scans(location_id);
            CREATE INDEX IF NOT EXISTS idx_files_scan_path ON files(scan_id, path);
            CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
            CREATE INDEX IF NOT EXISTS idx_files_blake3_size ON files(blake3, size);
            CREATE INDEX IF NOT EXISTS idx_scan_excludes_scan ON scan_excludes(scan_id);
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
        Ok(id)
    }

    pub fn insert_file_batch(&self, files: &[NewFile]) -> Result<()> {
        if files.is_empty() {
            return Ok(());
        }

        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT OR REPLACE INTO files (scan_id, kind, path, name, size, blake3, sha256, ctime, mtime, mode, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                    file.ctime,
                    file.mtime,
                    file.mode,
                    file.error,
                ])?;
            }
        }
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
        let conn = self.connect()?;
        conn.execute(
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
        Ok(())
    }

    pub fn update_scan_counts(
        &self,
        scan_id: &str,
        file_count: u64,
        dir_count: u64,
        error_count: u64,
        total_bytes: u64,
    ) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "UPDATE scans SET file_count = ?1, dir_count = ?2, error_count = ?3, total_bytes = ?4 WHERE id = ?5",
            params![file_count, dir_count, error_count, total_bytes, scan_id],
        )?;
        Ok(())
    }

    pub fn delete_scan(&self, scan_id: &str) -> Result<bool> {
        let conn = self.connect()?;
        let deleted = conn.execute("DELETE FROM scans WHERE id = ?1", [scan_id])?;
        Ok(deleted > 0)
    }

    pub fn delete_scan_path(&self, scan_id: &str, path: &str) -> Result<u64> {
        let normalized = normalize_file_path(path);
        if normalized.is_empty() {
            anyhow::bail!("refusing to delete the scan root; delete the scan instead");
        }
        let descendant_like = format!("{}/%", normalized.replace('%', "\\%").replace('_', "\\_"));
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let deleted = tx.execute(
            "DELETE FROM files WHERE scan_id = ?1 AND (path = ?2 OR path LIKE ?3 ESCAPE '\\')",
            params![scan_id, normalized, descendant_like],
        )? as u64;
        refresh_scan_file_counts(&tx, scan_id)?;
        tx.commit()?;
        Ok(deleted)
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

        tx.commit()?;
        Ok(())
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
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
            FROM files f
            JOIN scans s ON s.id = f.scan_id
            JOIN locations l ON l.id = s.location_id
            WHERE f.scan_id = ?1 AND f.kind = 'file'
            ORDER BY f.id DESC
            LIMIT ?2
            "#,
        )?;
        let rows = stmt.query_map(params![scan_id, limit], file_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn scan_tree(&self, scan_id: &str, prefix: &str) -> Result<Vec<TreeEntry>> {
        let conn = self.connect()?;
        let normalized = normalize_tree_prefix(prefix);
        let like = if normalized.is_empty() {
            "%".to_string()
        } else {
            format!("{}%", normalized.replace('%', "\\%").replace('_', "\\_"))
        };
        let mut stmt = conn.prepare(
            r#"
            WITH selected_scan AS (
                SELECT location_id
                FROM scans
                WHERE id = ?1
            ),
            duplicate_scope AS (
                SELECT COALESCE(
                    l.representative_scan_id,
                    (
                        SELECT s2.id
                        FROM scans s2
                        WHERE s2.location_id = l.id AND s2.status = 'complete'
                        ORDER BY s2.started_at DESC
                        LIMIT 1
                    )
                ) AS scan_id
                FROM locations l
                WHERE l.disabled = 0 AND l.id != (SELECT location_id FROM selected_scan)
            )
            SELECT f.kind, f.path, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode,
                   (
                     SELECT COUNT(DISTINCT s2.location_id)
                     FROM files f2
                     JOIN scans s2 ON s2.id = f2.scan_id
                     WHERE f.kind = 'file'
                       AND f2.kind = 'file'
                       AND f2.error IS NULL
                       AND f2.blake3 = f.blake3
                       AND f2.size = f.size
                       AND f2.scan_id IN (SELECT scan_id FROM duplicate_scope WHERE scan_id IS NOT NULL)
                   ) AS other_location_count,
                   (
                     SELECT COUNT(*)
                     FROM files same_scan
                     WHERE same_scan.scan_id = f.scan_id
                       AND f.kind = 'file'
                       AND same_scan.kind = 'file'
                       AND same_scan.error IS NULL
                       AND same_scan.blake3 = f.blake3
                       AND same_scan.size = f.size
                   ) AS same_scan_count
            FROM files f
            WHERE f.scan_id = ?1 AND f.error IS NULL AND f.path LIKE ?2 ESCAPE '\'
            ORDER BY path
            "#,
        )?;
        let files = stmt
            .query_map(params![scan_id, like], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<u32>>(7)?,
                    row.get::<_, u64>(8)?,
                    row.get::<_, u64>(9)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut dirs: std::collections::BTreeMap<String, TreeEntry> =
            std::collections::BTreeMap::new();
        let mut out = Vec::new();

        for (
            kind,
            path,
            size,
            blake3,
            sha256,
            ctime,
            mtime,
            mode,
            other_location_count,
            same_scan_count,
        ) in files
        {
            let is_file = kind == "file";
            let duplicate_file_count = u64::from(is_file && other_location_count > 0);
            let original_file_count = u64::from(is_file && other_location_count == 0);
            let same_scan_duplicate_file_count = u64::from(is_file && same_scan_count > 1);
            let Some(rest) = path.strip_prefix(&normalized) else {
                continue;
            };
            if rest.is_empty() {
                continue;
            }
            if kind == "dir" && !rest.contains('/') {
                let entry = dirs.entry(rest.to_string()).or_insert_with(|| TreeEntry {
                    name: rest.to_string(),
                    path: path.clone(),
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
                });
                entry.ctime = ctime;
                entry.mtime = mtime;
                entry.mode = mode;
                continue;
            }
            if !is_file {
                continue;
            }
            if let Some((dir, _)) = rest.split_once('/') {
                let dir_path = format!("{normalized}{dir}");
                let entry = dirs.entry(dir.to_string()).or_insert_with(|| TreeEntry {
                    name: dir.to_string(),
                    path: dir_path,
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
                });
                entry.size += size;
                entry.file_count += 1;
                entry.duplicate_file_count += duplicate_file_count;
                entry.original_file_count += original_file_count;
                entry.same_scan_duplicate_file_count += same_scan_duplicate_file_count;
            } else {
                out.push(TreeEntry {
                    name: rest.to_string(),
                    path,
                    kind: "file".to_string(),
                    size,
                    file_count: 1,
                    blake3: Some(blake3),
                    sha256: Some(sha256),
                    ctime,
                    mtime,
                    mode,
                    duplicate_file_count,
                    original_file_count,
                    same_scan_duplicate_file_count,
                });
            }
        }

        let mut dir_entries = dirs.into_values().collect::<Vec<_>>();
        dir_entries.append(&mut out);
        Ok(dir_entries)
    }

    pub fn delete_check(&self, scan_id: &str, prefix: &str) -> Result<DeleteCheckResult> {
        let conn = self.connect()?;
        let normalized = normalize_tree_prefix(prefix);
        let include_all = normalized.is_empty();
        let selected_paths = if include_all {
            Vec::new()
        } else {
            vec![normalized]
        };
        prepare_selected_paths(&conn, &selected_paths)?;
        delete_check_for_selection(&conn, scan_id, include_all, false)
    }

    pub fn delete_check_paths(&self, scan_id: &str, paths: &[String]) -> Result<DeleteCheckResult> {
        let conn = self.connect()?;
        let mut selected_paths = paths
            .iter()
            .map(|path| normalize_file_path(path))
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>();
        selected_paths.sort();
        selected_paths.dedup();
        prepare_selected_paths(&conn, &selected_paths)?;
        delete_check_for_selection(&conn, scan_id, false, true)
    }

    pub fn find_files(&self, query: &str, limit: u32) -> Result<Vec<FileRow>> {
        let conn = self.connect()?;
        let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let mut stmt = conn.prepare(
            r#"
            SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
            FROM files f
            JOIN scans s ON s.id = f.scan_id
            JOIN locations l ON l.id = s.location_id
            WHERE f.path LIKE ?1 ESCAPE '\' OR f.name LIKE ?1 ESCAPE '\'
            ORDER BY s.started_at DESC, f.path
            LIMIT ?2
            "#,
        )?;
        let rows = stmt.query_map(params![like, limit], file_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn file_occurrences(&self, blake3: &str, size: u64) -> Result<Vec<FileOccurrence>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT f.scan_id, s.started_at, s.finished_at, s.status, l.slug, l.name,
                   f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
            FROM files f
            JOIN scans s ON s.id = f.scan_id
            JOIN locations l ON l.id = s.location_id
            WHERE f.kind = 'file' AND f.error IS NULL AND f.blake3 = ?1 AND f.size = ?2
            ORDER BY l.slug, s.started_at DESC, f.path
            "#,
        )?;
        let rows = stmt.query_map(params![blake3, size], occurrence_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
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
        let conn = self.connect()?;
        let normalized = normalize_tree_prefix(prefix);
        let like = if normalized.is_empty() {
            "%".to_string()
        } else {
            format!("{}%", normalized.replace('%', "\\%").replace('_', "\\_"))
        };
        let mut stmt = conn.prepare(
            r#"
            SELECT f.blake3, f.size, f.path
            FROM files f
            WHERE f.scan_id = ?1
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
        let rows = stmt.query_map(params![scan_id, like, recursive, normalized], |row| {
            Ok(ThumbnailCandidate {
                blake3: row.get(0)?,
                size: row.get(1)?,
                path: row.get(2)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn thumbnail_candidates_paths(
        &self,
        scan_id: &str,
        paths: &[String],
        recursive: bool,
    ) -> Result<Vec<ThumbnailCandidate>> {
        let conn = self.connect()?;
        let mut selected_paths = paths
            .iter()
            .map(|path| normalize_file_path(path))
            .filter(|path| !path.is_empty())
            .collect::<Vec<_>>();
        selected_paths.sort();
        selected_paths.dedup();
        prepare_selected_paths(&conn, &selected_paths)?;
        let mut stmt = conn.prepare(
            r#"
            SELECT DISTINCT f.blake3, f.size, f.path
            FROM files f
            WHERE f.scan_id = ?1
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
        let rows = stmt.query_map(params![scan_id, recursive], |row| {
            Ok(ThumbnailCandidate {
                blake3: row.get(0)?,
                size: row.get(1)?,
                path: row.get(2)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn duplicate_groups(&self, limit: u32) -> Result<Vec<DuplicateGroup>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            r#"
            WITH duplicate_scope AS (
                SELECT l.id AS location_id,
                       COALESCE(
                           l.representative_scan_id,
                           (
                               SELECT s2.id
                               FROM scans s2
                               WHERE s2.location_id = l.id AND s2.status = 'complete'
                               ORDER BY s2.started_at DESC
                               LIMIT 1
                           )
                       ) AS scan_id
                FROM locations l
                WHERE l.disabled = 0
            )
            SELECT f.blake3, f.size, COUNT(DISTINCT ds.location_id) AS copies
            FROM files f
            JOIN duplicate_scope ds ON ds.scan_id = f.scan_id
            WHERE f.kind = 'file' AND f.error IS NULL AND f.size > 0
            GROUP BY f.blake3, f.size
            HAVING COUNT(DISTINCT ds.location_id) > 1
            ORDER BY size DESC
            LIMIT ?1
            "#,
        )?;
        let groups = stmt
            .query_map([limit], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?,
                    row.get::<_, u64>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut out = Vec::new();
        for (blake3, size, count) in groups {
            let mut files_stmt = conn.prepare(
                r#"
                WITH duplicate_scope AS (
                    SELECT l.id AS location_id,
                           COALESCE(
                               l.representative_scan_id,
                               (
                                   SELECT s2.id
                                   FROM scans s2
                                   WHERE s2.location_id = l.id AND s2.status = 'complete'
                                   ORDER BY s2.started_at DESC
                                   LIMIT 1
                               )
                           ) AS scan_id
                    FROM locations l
                    WHERE l.disabled = 0
                )
                SELECT f.scan_id, l.slug, l.name, f.kind, f.path, f.name, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode, f.error
                FROM files f
                JOIN scans s ON s.id = f.scan_id
                JOIN locations l ON l.id = s.location_id
                JOIN duplicate_scope ds ON ds.scan_id = f.scan_id
                WHERE f.kind = 'file' AND f.blake3 = ?1 AND f.size = ?2
                  AND f.id IN (
                    SELECT MIN(scoped.id)
                    FROM files scoped
                    JOIN duplicate_scope scoped_ds ON scoped_ds.scan_id = scoped.scan_id
                    WHERE scoped.kind = 'file' AND scoped.blake3 = ?1 AND scoped.size = ?2 AND scoped.error IS NULL
                    GROUP BY scoped.scan_id
                  )
                ORDER BY l.slug, f.path
                "#,
            )?;
            let files = files_stmt
                .query_map(params![blake3, size], file_from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out.push(DuplicateGroup {
                blake3,
                size,
                count,
                files,
            });
        }
        Ok(out)
    }

    pub fn overview(&self) -> Result<Overview> {
        let conn = self.connect()?;
        let location_count = scalar_u64(&conn, "SELECT COUNT(*) FROM locations")?;
        let scan_count = scalar_u64(&conn, "SELECT COUNT(*) FROM scans")?;
        let file_count = scalar_u64(&conn, "SELECT COUNT(*) FROM files WHERE kind = 'file'")?;
        let total_bytes = scalar_u64(
            &conn,
            "SELECT COALESCE(SUM(size), 0) FROM files WHERE kind = 'file' AND error IS NULL",
        )?;
        let duplicate_groups = scalar_u64(
            &conn,
            r#"
            WITH duplicate_scope AS (
                SELECT l.id AS location_id,
                       COALESCE(
                           l.representative_scan_id,
                           (
                               SELECT s2.id
                               FROM scans s2
                               WHERE s2.location_id = l.id AND s2.status = 'complete'
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
                JOIN duplicate_scope ds ON ds.scan_id = f.scan_id
                WHERE f.kind = 'file' AND f.error IS NULL AND f.size > 0
                GROUP BY f.blake3, f.size
                HAVING COUNT(DISTINCT ds.location_id) > 1
            )
            "#,
        )?;
        Ok(Overview {
            location_count,
            scan_count,
            file_count,
            total_bytes,
            duplicate_groups,
        })
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
    let total_count = conn.query_row(
        r#"
        SELECT COUNT(*)
        FROM files f
        WHERE f.scan_id = ?1
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
        WHERE f.scan_id = ?1
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
                           WHERE s2.location_id = l.id AND s2.status = 'complete'
                           ORDER BY s2.started_at DESC
                           LIMIT 1
                       )
                   ) AS scan_id
            FROM locations l
            WHERE l.disabled = 0 AND l.id != (SELECT location_id FROM selected_scan)
        )
        SELECT f.name, f.path, f.size, f.blake3, f.sha256, f.ctime, f.mtime, f.mode
        FROM files f
        WHERE f.scan_id = ?1
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
              FROM files other
              JOIN duplicate_scope ds ON ds.scan_id = other.scan_id
              WHERE other.kind = 'file'
                AND other.error IS NULL
                AND other.size = f.size
                AND other.blake3 = f.blake3
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
    })
}

fn file_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRow> {
    Ok(FileRow {
        scan_id: row.get(0)?,
        location_slug: row.get(1)?,
        location_name: row.get(2)?,
        kind: row.get(3)?,
        path: row.get(4)?,
        name: row.get(5)?,
        size: row.get(6)?,
        blake3: row.get(7)?,
        sha256: row.get(8)?,
        ctime: row.get(9)?,
        mtime: row.get(10)?,
        mode: row.get(11)?,
        error: row.get(12)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn test_file(scan_id: &str, path: &str, size: u64, hash: &str) -> NewFile {
        NewFile {
            scan_id: scan_id.to_string(),
            kind: "file".to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap().to_string(),
            size,
            blake3: hash.to_string(),
            sha256: hash.to_string(),
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
