use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::db::{Database, Location, NewFile, ReusableFile};
use crate::events::EventHub;

#[derive(Clone, Debug)]
pub struct ScanSummary {
    pub scan_id: String,
    pub status: String,
    pub file_count: u64,
    pub dir_count: u64,
    pub error_count: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanProgress {
    pub scan_id: String,
    pub location_slug: String,
    pub location_name: String,
    pub root_path: String,
    pub status: String,
    pub file_count: u64,
    pub dir_count: u64,
    pub error_count: u64,
    pub total_bytes: u64,
    pub current_path: Option<String>,
    pub message: Option<String>,
    pub log: Vec<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Clone, Default)]
pub struct ScanProgressStore {
    inner: Arc<Mutex<std::collections::HashMap<String, ScanProgress>>>,
    cancel: Arc<Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>>,
    events: Option<EventHub>,
}

impl ScanProgressStore {
    pub fn with_events(events: EventHub) -> Self {
        Self {
            inner: Arc::default(),
            cancel: Arc::default(),
            events: Some(events),
        }
    }

    pub fn start(&self, scan: &PreparedScan) {
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .insert(scan.scan_id.clone(), Arc::new(AtomicBool::new(false)));
        let progress = ScanProgress {
            scan_id: scan.scan_id.clone(),
            location_slug: scan.location.slug.clone(),
            location_name: scan.location.name.clone(),
            root_path: scan.scan_root.display().to_string(),
            status: "running".to_string(),
            file_count: 0,
            dir_count: 0,
            error_count: 0,
            total_bytes: 0,
            current_path: None,
            message: None,
            log: vec![match &scan.reuse_from_scan_id {
                Some(source_scan_id) => format!(
                    "Started update scan of {} ({}) from {} at {}",
                    scan.location.slug,
                    scan.location.name,
                    source_scan_id,
                    scan.scan_root.display()
                ),
                None => format!(
                    "Started scan of {} ({}) at {}",
                    scan.location.slug,
                    scan.location.name,
                    scan.scan_root.display()
                ),
            }],
            started_at: Utc::now().to_rfc3339(),
            finished_at: None,
        };
        self.inner
            .lock()
            .expect("scan progress lock poisoned")
            .insert(scan.scan_id.clone(), progress.clone());
        self.emit("scan_started", &progress);
    }

    pub fn update(&self, scan_id: &str, update: impl FnOnce(&mut ScanProgress)) {
        let (progress, log_lines) = if let Some(progress) = self
            .inner
            .lock()
            .expect("scan progress lock poisoned")
            .get_mut(scan_id)
        {
            let old_len = progress.log.len();
            update(progress);
            let log_lines = progress.log[old_len..].to_vec();
            (Some(progress.clone()), log_lines)
        } else {
            (None, Vec::new())
        };
        if let Some(progress) = progress {
            for line in log_lines {
                self.emit(
                    "scan_log",
                    serde_json::json!({
                        "scan_id": progress.scan_id,
                        "location_slug": progress.location_slug,
                        "line": line,
                    }),
                );
            }
            self.emit("scan_progress", &progress);
        }
    }

    pub fn finish(&self, summary: &ScanSummary) {
        self.update(&summary.scan_id, |progress| {
            progress.status = "complete".to_string();
            progress.file_count = summary.file_count;
            progress.dir_count = summary.dir_count;
            progress.error_count = summary.error_count;
            progress.total_bytes = summary.total_bytes;
            progress.current_path = None;
            progress.finished_at = Some(Utc::now().to_rfc3339());
            push_log(
                progress,
                format!(
                    "Completed: {} files, {} dirs, {} errors, {} bytes",
                    summary.file_count, summary.dir_count, summary.error_count, summary.total_bytes
                ),
            );
        });
        if let Some(progress) = self.get(&summary.scan_id) {
            self.emit("scan_finished", progress);
        }
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .remove(&summary.scan_id);
    }

    pub fn fail(&self, scan_id: &str, message: String) {
        self.update(scan_id, |progress| {
            progress.status = "failed".to_string();
            progress.message = Some(message);
            if let Some(message) = progress.message.clone() {
                push_log(progress, format!("Failed: {message}"));
            }
            progress.finished_at = Some(Utc::now().to_rfc3339());
        });
        if let Some(progress) = self.get(scan_id) {
            self.emit("scan_failed", progress);
        }
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .remove(scan_id);
    }

    pub fn stop(&self, scan_id: &str) -> bool {
        let cancel = self
            .cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .get(scan_id)
            .cloned();
        if let Some(cancel) = cancel {
            cancel.store(true, Ordering::Relaxed);
            self.update(scan_id, |progress| {
                progress.status = "stopping".to_string();
                progress.message = Some("Stop requested".to_string());
                push_log(progress, "Stop requested".to_string());
            });
            if let Some(progress) = self.get(scan_id) {
                self.emit("scan_stop_requested", progress);
            }
            true
        } else {
            false
        }
    }

    pub fn is_stop_requested(&self, scan_id: &str) -> bool {
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .get(scan_id)
            .is_some_and(|cancel| cancel.load(Ordering::Relaxed))
    }

    pub fn stopped(&self, scan_id: &str) {
        self.update(scan_id, |progress| {
            progress.status = "stopped".to_string();
            progress.current_path = None;
            progress.finished_at = Some(Utc::now().to_rfc3339());
            push_log(
                progress,
                "Stopped after flushing discovered files".to_string(),
            );
        });
        if let Some(progress) = self.get(scan_id) {
            self.emit("scan_stopped", progress);
        }
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .remove(scan_id);
    }

    pub fn remove(&self, scan_id: &str) {
        self.stop(scan_id);
        self.inner
            .lock()
            .expect("scan progress lock poisoned")
            .remove(scan_id);
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .remove(scan_id);
        self.emit(
            "scan_progress_removed",
            serde_json::json!({
                "scan_id": scan_id
            }),
        );
    }

    pub fn get(&self, scan_id: &str) -> Option<ScanProgress> {
        self.inner
            .lock()
            .expect("scan progress lock poisoned")
            .get(scan_id)
            .cloned()
    }

    pub fn running(&self) -> Vec<ScanProgress> {
        self.inner
            .lock()
            .expect("scan progress lock poisoned")
            .values()
            .filter(|progress| progress.status == "running" || progress.status == "stopping")
            .cloned()
            .collect()
    }

    fn emit(&self, kind: &str, payload: impl Serialize) {
        if let Some(events) = &self.events {
            events.emit(kind, payload);
        }
    }
}

fn push_log(progress: &mut ScanProgress, line: String) {
    progress
        .log
        .push(format!("{}  {line}", Utc::now().format("%H:%M:%S")));
    const MAX_LOG_LINES: usize = 200;
    if progress.log.len() > MAX_LOG_LINES {
        let remove_count = progress.log.len() - MAX_LOG_LINES;
        progress.log.drain(0..remove_count);
    }
}

#[derive(Clone)]
pub struct PreparedScan {
    pub scan_id: String,
    pub location: Location,
    pub scan_root: PathBuf,
    pub reuse_from_scan_id: Option<String>,
    reusable_files: HashMap<String, ReusableFile>,
}

pub fn scan_location(db: &Database, slug: &str, offset_path: &Path) -> Result<ScanSummary> {
    let prepared = prepare_scan(db, slug, offset_path)?;
    run_prepared_scan(db, prepared, None)
}

pub fn prepare_scan(db: &Database, slug: &str, offset_path: &Path) -> Result<PreparedScan> {
    let location = db
        .location_by_slug(slug)?
        .with_context(|| format!("unknown location slug: {slug}"))?;

    let scan_root = normalize_scan_root(&location.root_path, offset_path);
    let scan_id = db.start_scan(&location, offset_path)?;
    Ok(PreparedScan {
        scan_id,
        location,
        scan_root,
        reuse_from_scan_id: None,
        reusable_files: HashMap::new(),
    })
}

pub fn prepare_update_scan(db: &Database, source_scan_id: &str) -> Result<PreparedScan> {
    let source_scan = db
        .scan_by_id(source_scan_id)?
        .with_context(|| format!("unknown source scan: {source_scan_id}"))?;
    let location = db
        .location_by_slug(&source_scan.location_slug)?
        .with_context(|| format!("unknown location slug: {}", source_scan.location_slug))?;
    let offset_path = PathBuf::from(&source_scan.offset_path);
    let scan_root = normalize_scan_root(&location.root_path, &offset_path);
    let scan_id = db.start_scan(&location, &offset_path)?;
    Ok(PreparedScan {
        scan_id,
        location,
        scan_root,
        reuse_from_scan_id: Some(source_scan_id.to_string()),
        reusable_files: db.reusable_files_for_scan(source_scan_id)?,
    })
}

pub fn run_prepared_scan(
    db: &Database,
    prepared: PreparedScan,
    progress: Option<ScanProgressStore>,
) -> Result<ScanSummary> {
    let db_path = db.path().canonicalize().ok();
    let db_wal_path = sidecar_path(db.path(), "wal").and_then(|path| path.canonicalize().ok());
    let db_shm_path = sidecar_path(db.path(), "shm").and_then(|path| path.canonicalize().ok());
    let flush_size = if progress.is_some() { 25 } else { 500 };
    let mut batch = Vec::with_capacity(flush_size);
    let mut file_count = 0;
    let mut dir_count = 0;
    let mut error_count = 0;
    let mut total_bytes = 0;
    let mut stopped = false;

    for entry in WalkDir::new(&prepared.scan_root).follow_links(false) {
        if progress
            .as_ref()
            .is_some_and(|progress| progress.is_stop_requested(&prepared.scan_id))
        {
            stopped = true;
            break;
        }

        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                error_count += 1;
                if let Some(progress) = &progress {
                    progress.update(&prepared.scan_id, |state| {
                        state.error_count = error_count;
                        state.message = Some(err.to_string());
                        push_log(state, format!("Walk error: {err}"));
                    });
                }
                eprintln!("walk error: {err}");
                continue;
            }
        };

        if entry.file_type().is_dir() {
            dir_count += 1;
            let absolute_path = entry.path();
            let relative_path = absolute_path
                .strip_prefix(&prepared.scan_root)
                .unwrap_or(absolute_path)
                .to_string_lossy()
                .to_string();
            if !relative_path.is_empty() {
                let name = entry.file_name().to_string_lossy().to_string();
                let metadata = path_metadata(absolute_path).ok();
                batch.push(NewFile {
                    scan_id: prepared.scan_id.clone(),
                    kind: "dir".to_string(),
                    path: relative_path,
                    name,
                    size: 0,
                    blake3: String::new(),
                    sha256: String::new(),
                    ctime: metadata
                        .as_ref()
                        .and_then(|metadata| metadata.ctime.clone()),
                    mtime: metadata
                        .as_ref()
                        .and_then(|metadata| metadata.mtime.clone()),
                    mode: metadata.as_ref().and_then(|metadata| metadata.mode),
                    error: None,
                });
            }
            if dir_count % 100 == 0 {
                if let Some(progress) = &progress {
                    progress.update(&prepared.scan_id, |state| {
                        state.dir_count = dir_count;
                    });
                }
            }
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        let absolute_path = entry.path();
        let canonical_path = absolute_path.canonicalize().ok();
        if canonical_path == db_path
            || canonical_path == db_wal_path
            || canonical_path == db_shm_path
        {
            continue;
        }

        let relative_path = absolute_path
            .strip_prefix(&prepared.scan_root)
            .unwrap_or(absolute_path)
            .to_string_lossy()
            .to_string();
        let name = entry.file_name().to_string_lossy().to_string();
        let stored_path = if relative_path.is_empty() {
            name.clone()
        } else {
            relative_path.clone()
        };
        if let Some(progress) = &progress {
            progress.update(&prepared.scan_id, |state| {
                state.current_path = Some(relative_path.clone());
                push_log(state, format!("processed {relative_path}"));
            });
        }

        match reusable_or_hash_file(absolute_path, prepared.reusable_files.get(&stored_path)) {
            Ok(hashed) => {
                file_count += 1;
                total_bytes += hashed.size;
                batch.push(NewFile {
                    scan_id: prepared.scan_id.clone(),
                    kind: "file".to_string(),
                    path: stored_path.clone(),
                    name,
                    size: hashed.size,
                    blake3: hashed.blake3,
                    sha256: hashed.sha256,
                    ctime: hashed.ctime,
                    mtime: hashed.mtime,
                    mode: hashed.mode,
                    error: None,
                });
                if hashed.reused {
                    if let Some(progress) = &progress {
                        progress.update(&prepared.scan_id, |state| {
                            push_log(state, format!("reused metadata for {relative_path}"));
                        });
                    }
                }
            }
            Err(err) => {
                error_count += 1;
                batch.push(NewFile {
                    scan_id: prepared.scan_id.clone(),
                    kind: "file".to_string(),
                    path: relative_path,
                    name,
                    size: 0,
                    blake3: String::new(),
                    sha256: String::new(),
                    ctime: None,
                    mtime: None,
                    mode: None,
                    error: Some(err.to_string()),
                });
            }
        }

        if batch.len() >= flush_size {
            db.insert_file_batch(&batch)?;
            batch.clear();
            db.update_scan_counts(
                &prepared.scan_id,
                file_count,
                dir_count,
                error_count,
                total_bytes,
            )?;
            if let Some(progress) = &progress {
                progress.update(&prepared.scan_id, |state| {
                    push_log(state, format!("Flushed {file_count} files to SQLite"));
                });
            }
        }

        if let Some(progress) = &progress {
            progress.update(&prepared.scan_id, |state| {
                state.file_count = file_count;
                state.dir_count = dir_count;
                state.error_count = error_count;
                state.total_bytes = total_bytes;
            });
        }
    }

    if !batch.is_empty() {
        db.insert_file_batch(&batch)?;
    }
    db.update_scan_counts(
        &prepared.scan_id,
        file_count,
        dir_count,
        error_count,
        total_bytes,
    )?;

    let status = if stopped {
        "stopped"
    } else if file_count == 0 && error_count > 0 {
        "failed"
    } else {
        "complete"
    };
    db.finish_scan(
        &prepared.scan_id,
        file_count,
        dir_count,
        error_count,
        total_bytes,
        status,
    )?;

    Ok(ScanSummary {
        scan_id: prepared.scan_id,
        status: status.to_string(),
        file_count,
        dir_count,
        error_count,
        total_bytes,
    })
}

fn sidecar_path(path: &Path, suffix: &str) -> Option<PathBuf> {
    Some(PathBuf::from(format!("{}-{suffix}", path.to_str()?)))
}

fn normalize_scan_root(root: &Path, offset: &Path) -> PathBuf {
    if offset == Path::new("/") || offset.as_os_str().is_empty() {
        root.to_path_buf()
    } else if offset.is_absolute() {
        let stripped = offset.strip_prefix("/").unwrap_or(offset);
        root.join(stripped)
    } else {
        root.join(offset)
    }
}

struct HashedFile {
    size: u64,
    blake3: String,
    sha256: String,
    ctime: Option<String>,
    mtime: Option<String>,
    mode: Option<u32>,
    reused: bool,
}

fn reusable_or_hash_file(path: &Path, reusable: Option<&ReusableFile>) -> Result<HashedFile> {
    let metadata = file_metadata(path)?;
    if let Some(reusable) = reusable {
        if reusable.size == metadata.size
            && reusable.ctime == metadata.ctime
            && reusable.mtime == metadata.mtime
            && reusable.mode == metadata.mode
        {
            return Ok(HashedFile {
                size: reusable.size,
                blake3: reusable.blake3.clone(),
                sha256: reusable.sha256.clone(),
                ctime: reusable.ctime.clone(),
                mtime: reusable.mtime.clone(),
                mode: reusable.mode,
                reused: true,
            });
        }
    }
    hash_file_with_metadata(path, metadata)
}

fn hash_file_with_metadata(path: &Path, metadata: HashedFileMetadata) -> Result<HashedFile> {
    let mut reader =
        BufReader::new(File::open(path).with_context(|| format!("open {}", path.display()))?);
    let mut blake3_hasher = blake3::Hasher::new();
    let mut sha256_hasher = Sha256::new();
    let mut buffer = [0_u8; 128 * 1024];

    loop {
        let bytes = reader.read(&mut buffer)?;
        if bytes == 0 {
            break;
        }
        blake3_hasher.update(&buffer[..bytes]);
        sha256_hasher.update(&buffer[..bytes]);
    }

    Ok(HashedFile {
        size: metadata.size,
        blake3: blake3_hasher.finalize().to_hex().to_string(),
        sha256: hex::encode(sha256_hasher.finalize()),
        ctime: metadata.ctime,
        mtime: metadata.mtime,
        mode: metadata.mode,
        reused: false,
    })
}

struct HashedFileMetadata {
    size: u64,
    ctime: Option<String>,
    mtime: Option<String>,
    mode: Option<u32>,
}

fn file_metadata(path: &Path) -> Result<HashedFileMetadata> {
    let metadata = path_metadata(path)?;
    Ok(HashedFileMetadata {
        size: metadata.size,
        ctime: metadata.ctime,
        mtime: metadata.mtime,
        mode: metadata.mode,
    })
}

fn path_metadata(path: &Path) -> Result<HashedFileMetadata> {
    let metadata = std::fs::metadata(path).with_context(|| format!("stat {}", path.display()))?;
    Ok(HashedFileMetadata {
        size: metadata.len(),
        ctime: ctime(&metadata),
        mtime: metadata.modified().ok().map(system_time_to_rfc3339),
        mode: mode(&metadata),
    })
}

fn system_time_to_rfc3339(time: SystemTime) -> String {
    let datetime: DateTime<Utc> = time.into();
    datetime.to_rfc3339()
}

#[cfg(unix)]
fn ctime(metadata: &std::fs::Metadata) -> Option<String> {
    use std::os::unix::fs::MetadataExt;
    DateTime::<Utc>::from_timestamp(metadata.ctime(), metadata.ctime_nsec() as u32)
        .map(|datetime| datetime.to_rfc3339())
}

#[cfg(not(unix))]
fn ctime(metadata: &std::fs::Metadata) -> Option<String> {
    metadata.created().ok().map(system_time_to_rfc3339)
}

#[cfg(unix)]
fn mode(metadata: &std::fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(metadata.permissions().mode())
}

#[cfg(not(unix))]
fn mode(_metadata: &std::fs::Metadata) -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{LocationInput, LocationType};

    #[test]
    fn update_scan_repopulates_rows_deleted_from_source_scan() {
        let root = test_root("update-repopulates");
        let location_root = root.join("location");
        std::fs::create_dir_all(location_root.join("sub")).unwrap();
        std::fs::write(location_root.join("keep.txt"), b"keep").unwrap();
        std::fs::write(location_root.join("sub/restore.txt"), b"restore").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let initial = scan_location(&db, "test", Path::new("/")).unwrap();
        assert_eq!(initial.file_count, 2);

        let deleted = db.delete_scan_path(&initial.scan_id, "sub").unwrap();
        assert_eq!(deleted, 2);
        let after_delete = db.scan_tree(&initial.scan_id, "").unwrap();
        assert!(after_delete.iter().all(|entry| entry.path != "sub"));

        let prepared = prepare_update_scan(&db, &initial.scan_id).unwrap();
        let updated = run_prepared_scan(&db, prepared, None).unwrap();
        assert_eq!(updated.file_count, 2);

        let updated_paths = db
            .scan_files(&updated.scan_id, 10)
            .unwrap()
            .into_iter()
            .map(|file| file.path)
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            updated_paths,
            ["keep.txt".to_string(), "sub/restore.txt".to_string()]
                .into_iter()
                .collect()
        );
    }

    #[test]
    fn deleting_a_file_from_scan_removes_only_that_scan_path() {
        let root = test_root("delete-scan-path");
        let location_root = root.join("location");
        std::fs::create_dir_all(&location_root).unwrap();
        std::fs::write(location_root.join("one.txt"), b"one").unwrap();
        std::fs::write(location_root.join("two.txt"), b"two").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let scan = scan_location(&db, "test", Path::new("/")).unwrap();
        assert_eq!(scan.file_count, 2);

        let deleted = db.delete_scan_path(&scan.scan_id, "one.txt").unwrap();
        assert_eq!(deleted, 1);
        let remaining = db.scan_files(&scan.scan_id, 10).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].path, "two.txt");
    }

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "file-census-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }
}
