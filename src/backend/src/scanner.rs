use std::collections::HashMap;
use std::fs::{File, Metadata};
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, sync_channel, Receiver, Sender, SyncSender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::db::{
    build_scan_exclude_matcher, Database, Location, NewFile, ReusableFile,
};
use crate::events::EventHub;

/// Minimum wall-clock gap between full `scan_progress` snapshot emits per scan.
/// Bounds the clone+serialize cost to ~10 snapshots/second so per-item counter
/// updates stay cheap. Log events and forced flushes bypass this.
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Debug)]
pub struct ScanSummary {
    pub scan_id: String,
    pub status: String,
    pub file_count: u64,
    pub dir_count: u64,
    pub error_count: u64,
    pub total_bytes: u64,
}

/// One currently in-flight scanner worker operation. The operation ID is
/// monotonic within its scan, so snapshots can retain a stable oldest-first
/// order even when wall-clock timestamps share the same precision.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ScanActiveOperation {
    pub operation_id: u64,
    pub pool: String,
    pub path: String,
    pub started_at: String,
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
    /// Files seen by the discovery walker — the fast front-of-pipeline count.
    /// Leads `file_count` (which only counts fully hashed+persisted files) so
    /// the UI shows real progress during the discovery/metadata phase.
    #[serde(default)]
    pub discovered_files: u64,
    pub error_count: u64,
    pub total_bytes: u64,
    pub current_path: Option<String>,
    pub message: Option<String>,
    pub pools: ScanPools,
    /// Bounded in-flight work only; queued paths are never retained here.
    pub active_operations: Vec<ScanActiveOperation>,
    pub log: Vec<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    #[serde(skip)]
    next_active_operation_id: u64,
    /// Last time a full `scan_progress` snapshot was emitted for this scan.
    /// High-frequency per-item counter updates coalesce between emits so the
    /// hot path never pays the clone+serialize cost more than ~10×/second.
    #[serde(skip)]
    last_progress_emit: Option<Instant>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct ScanPools {
    pub discovery: ScanPoolProgress,
    pub metadata: ScanPoolProgress,
    pub hashing: ScanPoolProgress,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct ScanPoolProgress {
    pub queued: u64,
    pub active: u64,
    pub completed: u64,
    pub failed: u64,
    pub current_path: Option<String>,
}

/// Per-scan control shared with the worker pools. Stop is a one-way latch;
/// pause is reversible and parks cooperating workers on the condvar until they
/// are resumed or stopped.
#[derive(Default)]
pub struct ScanControl {
    stop: AtomicBool,
    paused: Mutex<bool>,
    wake: Condvar,
}

impl ScanControl {
    fn request_stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
        // Wake any parked workers so they observe the stop and drain/exit.
        let _guard = self.paused.lock().expect("scan pause lock poisoned");
        self.wake.notify_all();
    }

    fn is_stopped(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
    }

    fn set_paused(&self, value: bool) {
        let mut paused = self.paused.lock().expect("scan pause lock poisoned");
        *paused = value;
        self.wake.notify_all();
    }

    fn is_paused(&self) -> bool {
        *self.paused.lock().expect("scan pause lock poisoned")
    }

    /// Blocks while paused, returning as soon as the scan is resumed or stopped.
    /// Cheap (one short lock) when not paused.
    fn wait_while_paused(&self) {
        let mut paused = self.paused.lock().expect("scan pause lock poisoned");
        while *paused && !self.stop.load(Ordering::Relaxed) {
            paused = self.wake.wait(paused).expect("scan pause wait poisoned");
        }
    }
}

#[derive(Clone, Default)]
pub struct ScanProgressStore {
    inner: Arc<Mutex<std::collections::HashMap<String, ScanProgress>>>,
    cancel: Arc<Mutex<std::collections::HashMap<String, Arc<ScanControl>>>>,
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
            .insert(scan.scan_id.clone(), Arc::new(ScanControl::default()));
        let progress = ScanProgress {
            scan_id: scan.scan_id.clone(),
            location_slug: scan.location.slug.clone(),
            location_name: scan.location.name.clone(),
            root_path: scan.scan_root.display().to_string(),
            status: "running".to_string(),
            file_count: 0,
            dir_count: 0,
            discovered_files: 0,
            error_count: 0,
            total_bytes: 0,
            current_path: None,
            message: None,
            pools: ScanPools::default(),
            active_operations: Vec::new(),
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
            next_active_operation_id: 1,
            last_progress_emit: None,
        };
        self.inner
            .lock()
            .expect("scan progress lock poisoned")
            .insert(scan.scan_id.clone(), progress.clone());
        self.emit("scan_started", &progress);
    }

    pub fn update(&self, scan_id: &str, update: impl FnOnce(&mut ScanProgress)) {
        let _ = self.update_with_result(scan_id, |progress| update(progress));
    }

    fn update_with_result<T>(
        &self,
        scan_id: &str,
        update: impl FnOnce(&mut ScanProgress) -> T,
    ) -> Option<T> {
        self.update_with_result_inner(scan_id, false, update)
    }

    /// Like `update`, but always emits a fresh snapshot regardless of the
    /// throttle window. Use at phase boundaries / terminal transitions where
    /// the final state must reach the UI promptly.
    fn update_flush(&self, scan_id: &str, update: impl FnOnce(&mut ScanProgress)) {
        let _ = self.update_with_result_inner(scan_id, true, |progress| update(progress));
    }

    fn update_with_result_inner<T>(
        &self,
        scan_id: &str,
        force_emit: bool,
        update: impl FnOnce(&mut ScanProgress) -> T,
    ) -> Option<T> {
        // Coalesce high-frequency progress updates: hold the lock only long
        // enough to mutate counters and decide whether this update crosses the
        // emit window. The full-struct clone + JSON serialize (the expensive
        // part) happens at most ~10×/second per scan, so discovery/metadata run
        // near their raw walk speed instead of paying it on every entry.
        let (snapshot, log_lines, log_ids, result) = {
            let mut guard = self.inner.lock().expect("scan progress lock poisoned");
            let Some(progress) = guard.get_mut(scan_id) else {
                return None;
            };
            let old_len = progress.log.len();
            let result = update(progress);
            let has_new_log = progress.log.len() > old_len;
            let now = Instant::now();
            let window_elapsed = progress
                .last_progress_emit
                .map_or(true, |last| now.duration_since(last) >= PROGRESS_EMIT_INTERVAL);
            // New log lines always flush (they mark meaningful events); pure
            // counter churn only emits once the throttle window elapses.
            let should_emit = force_emit || has_new_log || window_elapsed;
            let log_lines = if has_new_log {
                progress.log[old_len..].to_vec()
            } else {
                Vec::new()
            };
            let log_ids = (progress.scan_id.clone(), progress.location_slug.clone());
            let snapshot = if should_emit {
                progress.last_progress_emit = Some(now);
                Some(progress.clone())
            } else {
                None
            };
            (snapshot, log_lines, log_ids, Some(result))
        };
        for line in log_lines {
            self.emit(
                "scan_log",
                serde_json::json!({
                    "scan_id": log_ids.0,
                    "location_slug": log_ids.1,
                    "line": line,
                }),
            );
        }
        if let Some(progress) = snapshot {
            self.emit("scan_progress", &progress);
        }
        result
    }

    pub fn finish(&self, summary: &ScanSummary) {
        // `run_prepared_scan` owns the persisted terminal status and returns
        // it in the summary. Its caller owns exactly one progress terminal
        // transition, so preserve that status here instead of turning a
        // completed-with-errors scan into a false "complete" event.
        let terminal_event = match summary.status.as_str() {
            "failed" => "scan_failed",
            "stopped" => "scan_stopped",
            _ => "scan_finished",
        };
        self.update_flush(&summary.scan_id, |progress| {
            progress.status = summary.status.clone();
            progress.file_count = summary.file_count;
            progress.dir_count = summary.dir_count;
            progress.error_count = summary.error_count;
            progress.total_bytes = summary.total_bytes;
            progress.current_path = None;
            progress.active_operations.clear();
            progress.finished_at = Some(Utc::now().to_rfc3339());
            let terminal_log = match summary.status.as_str() {
                "failed" => format!(
                    "Failed: {} files, {} dirs, {} errors, {} bytes",
                    summary.file_count,
                    summary.dir_count,
                    summary.error_count,
                    summary.total_bytes
                ),
                "stopped" => format!(
                    "Stopped: {} files, {} dirs, {} errors, {} bytes",
                    summary.file_count,
                    summary.dir_count,
                    summary.error_count,
                    summary.total_bytes
                ),
                _ => format!(
                    "Completed: {} files, {} dirs, {} errors, {} bytes",
                    summary.file_count,
                    summary.dir_count,
                    summary.error_count,
                    summary.total_bytes
                ),
            };
            if summary.status == "failed" {
                progress.message = Some(terminal_log.clone());
            }
            push_log(progress, terminal_log);
        });
        if let Some(progress) = self.get(&summary.scan_id) {
            self.emit(terminal_event, progress);
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
            progress.active_operations.clear();
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

    fn control(&self, scan_id: &str) -> Option<Arc<ScanControl>> {
        self.cancel
            .lock()
            .expect("scan cancel lock poisoned")
            .get(scan_id)
            .cloned()
    }

    pub fn stop(&self, scan_id: &str) -> bool {
        if let Some(control) = self.control(scan_id) {
            control.request_stop();
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

    /// Requests a reversible pause. Returns false when the scan is unknown or
    /// already stopping.
    pub fn pause(&self, scan_id: &str) -> bool {
        let Some(control) = self.control(scan_id) else {
            return false;
        };
        if control.is_stopped() || control.is_paused() {
            return false;
        }
        control.set_paused(true);
        self.update(scan_id, |progress| {
            progress.status = "paused".to_string();
            progress.message = Some("Paused".to_string());
            push_log(progress, "Pause requested".to_string());
        });
        if let Some(progress) = self.get(scan_id) {
            self.emit("scan_paused", progress);
        }
        true
    }

    /// Resumes a paused scan. Returns false when the scan is unknown, stopping,
    /// or not paused.
    pub fn resume(&self, scan_id: &str) -> bool {
        let Some(control) = self.control(scan_id) else {
            return false;
        };
        if control.is_stopped() || !control.is_paused() {
            return false;
        }
        control.set_paused(false);
        self.update(scan_id, |progress| {
            progress.status = "running".to_string();
            progress.message = None;
            push_log(progress, "Resumed".to_string());
        });
        if let Some(progress) = self.get(scan_id) {
            self.emit("scan_resumed", progress);
        }
        true
    }

    /// Blocks the calling worker while the scan is paused. No-op when the scan
    /// has no live control (e.g. a progress-less CLI/test scan).
    pub fn wait_while_paused(&self, scan_id: &str) {
        if let Some(control) = self.control(scan_id) {
            control.wait_while_paused();
        }
    }

    pub fn is_paused(&self, scan_id: &str) -> bool {
        self.control(scan_id)
            .is_some_and(|control| control.is_paused())
    }

    pub fn is_stop_requested(&self, scan_id: &str) -> bool {
        self.control(scan_id)
            .is_some_and(|control| control.is_stopped())
    }

    pub fn stopped(&self, scan_id: &str) {
        self.update(scan_id, |progress| {
            progress.status = "stopped".to_string();
            progress.current_path = None;
            progress.active_operations.clear();
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

    /// Returns only currently in-flight operations, sorted by their monotonic
    /// start identity. This is intentionally a bounded projection rather than
    /// a history of queued or completed paths.
    pub fn active_operations_oldest_first(&self, scan_id: &str) -> Vec<ScanActiveOperation> {
        let mut operations = self
            .inner
            .lock()
            .expect("scan progress lock poisoned")
            .get(scan_id)
            .map(|progress| progress.active_operations.clone())
            .unwrap_or_default();
        operations.sort_by_key(|operation| operation.operation_id);
        operations
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

#[derive(Clone, Debug)]
pub struct PreparedScan {
    pub scan_id: String,
    pub location: Location,
    pub scan_root: PathBuf,
    pub reuse_from_scan_id: Option<String>,
    reusable_files: HashMap<String, ReusableFile>,
    /// Stored paths physically seeded by a repair scan; the walk skips these so
    /// only missing/incomplete entries are (re)processed. Empty for fresh and
    /// update scans.
    seeded_paths: std::collections::HashSet<String>,
    /// Counters for the physically-seeded rows, so a repair scan's final
    /// file_count/total_bytes include the seeded files it skipped. 0 otherwise.
    seeded_file_count: u64,
    seeded_total_bytes: u64,
    /// Hash work this scan performs (Full or Light).
    pub hash_policy: HashPolicy,
    /// Worker-pool overrides for this run; None falls back to the
    /// FILE_CENSUS_HASH_WORKERS / FILE_CENSUS_METADATA_WORKERS env vars,
    /// then the built-in auto sizing.
    pub hash_workers: Option<usize>,
    pub metadata_workers: Option<usize>,
    /// Sparse policy only: files SMALLER than this get full hashing (exact +
    /// sparse); None = the combined slice size (`sparse_whole_threshold`).
    pub sparse_full_below: Option<u64>,
    /// Gitignore-style patterns applied AT SCAN TIME — matches are pruned from
    /// the walk and never indexed, and baked into the scan row.
    pub scan_time_excludes: Vec<String>,
}

impl PreparedScan {
    /// Applies per-run worker-pool overrides (None leaves the default).
    pub fn with_workers(
        mut self,
        hash_workers: Option<usize>,
        metadata_workers: Option<usize>,
    ) -> Self {
        if hash_workers.is_some() {
            self.hash_workers = hash_workers;
        }
        if metadata_workers.is_some() {
            self.metadata_workers = metadata_workers;
        }
        self
    }

    /// Sets a custom sparse full-hash threshold. Values below the combined
    /// slice size are rejected: under that size the sampler reads the whole
    /// file anyway, so refusing the exact hash would only lose information.
    pub fn with_sparse_full_below(mut self, threshold: Option<u64>) -> Result<Self> {
        if let Some(threshold) = threshold {
            let minimum = sparse_whole_threshold();
            if threshold < minimum {
                anyhow::bail!(
                    "sparse full-hash threshold {threshold} is below the combined slice size {minimum};                      use at least {minimum} bytes"
                );
            }
            self.sparse_full_below = Some(threshold);
        }
        Ok(self)
    }

    /// Sets scan-time exclude patterns (trimmed; empties dropped).
    pub fn with_scan_time_excludes(mut self, patterns: Vec<String>) -> Self {
        let cleaned: Vec<String> = patterns
            .into_iter()
            .map(|pattern| pattern.trim().to_string())
            .filter(|pattern| !pattern.is_empty())
            .collect();
        if !cleaned.is_empty() {
            self.scan_time_excludes = cleaned;
        }
        self
    }
}

#[derive(Clone, Copy)]
enum PoolKind {
    Discovery,
    Metadata,
    Hashing,
}

impl PoolKind {
    fn name(self) -> &'static str {
        match self {
            PoolKind::Discovery => "discovery",
            PoolKind::Metadata => "metadata",
            PoolKind::Hashing => "hashing",
        }
    }
}

impl ScanProgress {
    fn start_active_operation(&mut self, kind: PoolKind, path: String) -> u64 {
        let operation_id = self.next_active_operation_id;
        self.next_active_operation_id = self
            .next_active_operation_id
            .checked_add(1)
            .expect("active operation IDs exhausted");
        self.active_operations.push(ScanActiveOperation {
            operation_id,
            pool: kind.name().to_string(),
            path,
            started_at: Utc::now().to_rfc3339(),
        });
        operation_id
    }

    fn remove_active_operation(&mut self, operation_id: Option<u64>) {
        let Some(operation_id) = operation_id else {
            return;
        };
        self.active_operations
            .retain(|operation| operation.operation_id != operation_id);
    }

    // Retained for pool-lifecycle tests; discovery no longer activates a
    // per-entry operation now that its walk is lock-free.
    #[allow(dead_code)]
    fn remove_active_operations_for_pool(&mut self, kind: PoolKind) {
        self.active_operations
            .retain(|operation| operation.pool != kind.name());
    }
}

#[derive(Clone, Copy)]
enum WorkKind {
    File,
    Dir,
}

struct WorkItem {
    absolute_path: PathBuf,
    relative_path: String,
    stored_path: String,
    name: String,
    kind: WorkKind,
}

struct HashJob {
    absolute_path: PathBuf,
    relative_path: String,
    stored_path: String,
    name: String,
    reusable: Option<ReusableFile>,
}

enum PipelineResult {
    Directory {
        row: Option<NewFile>,
    },
    File {
        row: NewFile,
        reused: bool,
        relative_path: String,
    },
    Error {
        row: NewFile,
        message: String,
        relative_path: String,
    },
    WalkError(String),
}

pub fn scan_location(db: &Database, slug: &str, offset_path: &Path) -> Result<ScanSummary> {
    let prepared = prepare_scan(db, slug, offset_path)?;
    run_prepared_scan(db, prepared, None)
}

pub fn prepare_scan(db: &Database, slug: &str, offset_path: &Path) -> Result<PreparedScan> {
    prepare_scan_with_policy(db, slug, offset_path, HashPolicy::Full)
}

pub fn prepare_scan_with_policy(
    db: &Database,
    slug: &str,
    offset_path: &Path,
    policy: HashPolicy,
) -> Result<PreparedScan> {
    prepare_scan_with_start(db, slug, offset_path, policy, |location| {
        db.start_scan(location, offset_path)
    })
}

/// Prepares a scan with a date-derived persisted identity. Supplying the UTC
/// start time keeps the identity deterministic for callers and tests.
pub fn prepare_scan_with_started_at(
    db: &Database,
    slug: &str,
    offset_path: &Path,
    started_at: DateTime<Utc>,
) -> Result<PreparedScan> {
    prepare_scan_with_start(db, slug, offset_path, HashPolicy::Full, |location| {
        db.start_scan_with_started_at(location, offset_path, started_at)
    })
}

/// Prepares the shorthand bootstrap form without leaving behind a location
/// when the source or offset is invalid. Filesystem validation happens before
/// the database transaction; location creation and date-derived scan
/// reservation then happen together inside that transaction.
pub fn prepare_bootstrap_scan_with_started_at(
    db: &Database,
    source_path: &Path,
    volume_slug: &str,
    offset_path: &Path,
    started_at: DateTime<Utc>,
) -> Result<PreparedScan> {
    if source_path.to_string_lossy().trim().is_empty() {
        anyhow::bail!("source path must not be blank");
    }
    if volume_slug.trim().is_empty() {
        anyhow::bail!("volume slug must not be blank");
    }

    let canonical_source = canonical_directory(source_path, "source path")?;
    let scan_root = resolve_contained_scan_root(&canonical_source, offset_path)?;
    let reservation = db.bootstrap_location_and_start_scan(
        volume_slug,
        &canonical_source,
        offset_path,
        started_at,
    )?;

    Ok(PreparedScan {
        scan_id: reservation.scan_id,
        location: reservation.location,
        scan_root,
        reuse_from_scan_id: None,
        reusable_files: HashMap::new(),
        seeded_paths: std::collections::HashSet::new(),
        seeded_file_count: 0,
        seeded_total_bytes: 0,
        hash_policy: HashPolicy::Full,
        hash_workers: None,
        metadata_workers: None,
        sparse_full_below: None,
        scan_time_excludes: Vec::new(),
    })
}

fn prepare_scan_with_start(
    db: &Database,
    slug: &str,
    offset_path: &Path,
    policy: HashPolicy,
    start_scan: impl FnOnce(&Location) -> Result<String>,
) -> Result<PreparedScan> {
    let location = db
        .location_by_slug(slug)?
        .with_context(|| format!("unknown location slug: {slug}"))?;

    // Refuse to start a scan on a location whose path is missing or unreachable
    // (e.g. a disconnected drive), before any scan record is created.
    if !location.root_path.is_dir() {
        anyhow::bail!(
            "cannot scan '{slug}': its path {} does not exist or is not a reachable directory. Reconnect the drive or edit the location.",
            location.root_path.display()
        );
    }

    let scan_root = resolve_contained_scan_root(&location.root_path, offset_path)?;
    let scan_id = start_scan(&location)?;
    db.set_scan_hash_policy(&scan_id, policy.as_str())?;
    Ok(PreparedScan {
        scan_id,
        location,
        scan_root,
        reuse_from_scan_id: None,
        reusable_files: HashMap::new(),
        seeded_paths: std::collections::HashSet::new(),
        seeded_file_count: 0,
        seeded_total_bytes: 0,
        hash_policy: policy,
        hash_workers: None,
        metadata_workers: None,
        sparse_full_below: None,
        scan_time_excludes: Vec::new(),
    })
}

pub fn prepare_update_scan(db: &Database, source_scan_id: &str) -> Result<PreparedScan> {
    let seed = db.update_scan_seed(source_scan_id)?;
    let scan_root = resolve_contained_scan_root(&seed.location.root_path, &seed.offset_path)?;
    let scan_id = db.create_update_scan_from_seed(&seed)?;
    Ok(PreparedScan {
        scan_id,
        location: seed.location,
        scan_root,
        reuse_from_scan_id: Some(seed.source_scan_id),
        reusable_files: seed.reusable_files,
        seeded_paths: std::collections::HashSet::new(),
        seeded_file_count: 0,
        seeded_total_bytes: 0,
        hash_policy: HashPolicy::Full,
        hash_workers: None,
        metadata_workers: None,
        sparse_full_below: None,
        scan_time_excludes: Vec::new(),
    })
}

/// Prepares a non-destructive repair of an incomplete scan. Creates a new scan,
/// physically seeds it with the valid rows (non-empty hash, no error) from the
/// source scan, and records those paths so the walk skips them — only
/// missing/incomplete entries are (re)processed. Valid rows whose files are now
/// gone are preserved because the walk never revisits seeded paths.
pub fn prepare_repair_scan(db: &Database, source_scan_id: &str) -> Result<PreparedScan> {
    let seed = db.update_scan_seed(source_scan_id)?;
    let scan_root = resolve_contained_scan_root(&seed.location.root_path, &seed.offset_path)?;
    let scan_id = db.create_update_scan_from_seed(&seed)?;
    let seeded_rows: Vec<NewFile> = seed
        .reusable_files
        .values()
        .map(|reusable| NewFile {
            scan_id: scan_id.clone(),
            kind: "file".to_string(),
            path: reusable.path.clone(),
            name: reusable.name.clone(),
            size: reusable.size,
            blake3: reusable.blake3.clone(),
            sha256: reusable.sha256.clone(),
            blake3_light: String::new(),
            ctime: reusable.ctime.clone(),
            mtime: reusable.mtime.clone(),
            mode: reusable.mode,
            error: None,
        })
        .collect();
    let seeded_paths: std::collections::HashSet<String> =
        seed.reusable_files.keys().cloned().collect();
    let seeded_file_count = seeded_rows.len() as u64;
    let seeded_total_bytes = seeded_rows.iter().map(|row| row.size).sum();
    if !seeded_rows.is_empty() {
        db.insert_file_batch(&seeded_rows)?;
    }
    Ok(PreparedScan {
        scan_id,
        location: seed.location,
        scan_root,
        reuse_from_scan_id: Some(seed.source_scan_id),
        reusable_files: HashMap::new(),
        seeded_paths,
        seeded_file_count,
        seeded_total_bytes,
        hash_policy: HashPolicy::Full,
        hash_workers: None,
        metadata_workers: None,
        sparse_full_below: None,
        scan_time_excludes: Vec::new(),
    })
}

/// Discovery-only traversal measurements for benchmarking file-census against
/// tools like `dua-cli`/DaisyDisk (plan-036). No metadata, hashing, or DB work.
#[derive(Debug, Clone, Default, Serialize)]
pub struct DiscoveryStats {
    pub entries: u64,
    pub files: u64,
    pub dirs: u64,
    pub errors: u64,
    pub elapsed_ms: u64,
    pub first_entry_ms: Option<u64>,
    pub first_file_ms: Option<u64>,
    pub first_dir_ms: Option<u64>,
    pub entries_per_sec: f64,
    pub files_per_sec: f64,
    pub dirs_per_sec: f64,
    pub threads: usize,
    pub stop_requested: bool,
    pub stop_latency_ms: Option<u64>,
}

/// Walks `source` and records discovery latency/throughput. When `stop_after`
/// is set, requests a stop once that budget elapses and records how long the
/// stop took to take effect (`Duration::ZERO` is a deterministic stop probe).
pub fn benchmark_discovery(
    source: &Path,
    excludes: Option<&[String]>,
    threads: Option<usize>,
    stop_after: Option<Duration>,
) -> Result<DiscoveryStats> {
    let canonical = canonical_directory(source, "benchmark source")?;
    let matcher = build_scan_exclude_matcher(excludes.unwrap_or(&[]))?;
    let mut stats = DiscoveryStats {
        threads: threads.unwrap_or_else(hash_worker_count).max(1),
        ..Default::default()
    };
    let started = Instant::now();
    let mut stop_requested_at: Option<Instant> = None;

    for entry in WalkDir::new(&canonical).follow_links(false) {
        if let Some(after) = stop_after {
            if stop_requested_at.is_none() && started.elapsed() >= after {
                stop_requested_at = Some(Instant::now());
                stats.stop_requested = true;
            }
        }
        if let Some(at) = stop_requested_at {
            stats.stop_latency_ms = Some(at.elapsed().as_millis() as u64);
            break;
        }

        match entry {
            Ok(entry) => {
                let is_dir = entry.file_type().is_dir();
                if let Some(matcher) = &matcher {
                    let relative = entry.path().strip_prefix(&canonical).unwrap_or(entry.path());
                    if !relative.as_os_str().is_empty()
                        && matcher
                            .matched_path_or_any_parents(relative, is_dir)
                            .is_ignore()
                    {
                        continue;
                    }
                }
                let elapsed_ms = started.elapsed().as_millis() as u64;
                stats.entries += 1;
                stats.first_entry_ms.get_or_insert(elapsed_ms);
                if is_dir {
                    stats.dirs += 1;
                    stats.first_dir_ms.get_or_insert(elapsed_ms);
                } else if entry.file_type().is_file() {
                    stats.files += 1;
                    stats.first_file_ms.get_or_insert(elapsed_ms);
                }
            }
            Err(_) => stats.errors += 1,
        }
    }

    let elapsed = started.elapsed();
    stats.elapsed_ms = elapsed.as_millis() as u64;
    let secs = elapsed.as_secs_f64().max(f64::MIN_POSITIVE);
    stats.entries_per_sec = stats.entries as f64 / secs;
    stats.files_per_sec = stats.files as f64 / secs;
    stats.dirs_per_sec = stats.dirs as f64 / secs;
    Ok(stats)
}

pub fn run_prepared_scan(
    db: &Database,
    prepared: PreparedScan,
    progress: Option<ScanProgressStore>,
) -> Result<ScanSummary> {
    // Batch SQLite writes at 2,048 rows for both UI and CLI paths (plan-036).
    // Progress counters update per result independently, so a larger write
    // batch keeps scan throughput up without starving live progress.
    let flush_size = 2048;
    let mut batch = Vec::with_capacity(flush_size);
    // Repair scans physically seed valid rows that the pipeline never emits, so
    // start the tallies at the seeded totals to keep the persisted counts honest.
    let mut file_count = prepared.seeded_file_count;
    let mut dir_count = 0;
    let mut error_count = 0;
    let mut total_bytes = prepared.seeded_total_bytes;
    let scan_id = prepared.scan_id.clone();

    // A prepared scan already has a persisted `running` row. Keep every
    // ordinary fallible path inside this closure so the outer match can make a
    // best-effort terminal transition without masking the original failure.
    let result = (|| -> Result<ScanSummary> {
    // Workers keep this canonical root for their own rechecks. Discovery's
    // `follow_links(false)` is not sufficient once a discovered path reaches
    // a later worker and the filesystem may have changed underneath it.
    let canonical_scan_root = canonical_directory(&prepared.scan_root, "scan root")?;
    let db_path = db.path().canonicalize().ok();
    let db_wal_path = sidecar_path(db.path(), "wal").and_then(|path| path.canonicalize().ok());
    let db_shm_path = sidecar_path(db.path(), "shm").and_then(|path| path.canonicalize().ok());
    let exclude_patterns = db.scan_exclude_patterns(&prepared.scan_id)?;
    // Excludes remain scan-scoped policy, but they must not suppress physical
    // indexing. Validate them here; query surfaces apply visibility later.
    let _ = build_scan_exclude_matcher(&exclude_patterns)?;
    // SCAN-TIME excludes are different: they prune the walk so matches are
    // never indexed at all (e.g. node_modules), and are baked into the scan
    // row. Build the matcher once and share it with the discovery walker.
    let scan_time_matcher = Arc::new(build_scan_exclude_matcher(&prepared.scan_time_excludes)?);
    // Pool sizing: per-run override > env var > auto. Hashing is the long
    // pole on fast media, so it is fully configurable (plan-036/071 history:
    // the old hard cap of 4 was too small for SSD/NAS sources).
    // Stored Options-page defaults slot between per-run overrides and env.
    let (stored_hash_workers, stored_metadata_workers) =
        db.scan_worker_defaults().unwrap_or((None, None));
    let metadata_workers = resolve_worker_count(
        prepared.metadata_workers.or(stored_metadata_workers),
        "FILE_CENSUS_METADATA_WORKERS",
        2,
    );
    let hash_workers = resolve_worker_count(
        prepared.hash_workers.or(stored_hash_workers),
        "FILE_CENSUS_HASH_WORKERS",
        hash_worker_count(),
    );
    let sparse_full_below = prepared.sparse_full_below.unwrap_or_else(sparse_whole_threshold);
    if matches!(prepared.hash_policy, HashPolicy::Light) {
        // Record the effective rule on the scan row for later inspection.
        let _ = db.set_scan_sparse_full_below(&prepared.scan_id, sparse_full_below);
    }
    // Bake the scan-time excludes into the scan row so the UI/CLI can show what
    // rule this scan ran under.
    if !prepared.scan_time_excludes.is_empty() {
        let _ = db.set_scan_time_excludes(&prepared.scan_id, &prepared.scan_time_excludes);
    }
    tracing::info!(
        target: "file_census::scanner",
        scan_id = %prepared.scan_id,
        metadata_workers,
        hash_workers,
        sparse_full_below,
        "scan worker pools sized"
    );

    // Two-phase scan (plan-071): discovery + metadata run to completion first,
    // buffering every file hash job in an UNBOUNDED channel so the walker never
    // competes with heavy hash reads on slow/removable media (SD cards). Phase 2
    // then drains the buffered jobs through the hash workers. We accept the
    // memory cost of holding all pending hash jobs between the two phases.
    let (hash_tx, hash_rx) = channel::<HashJob>();

    // Files (and all entries) seen by the discovery walker, updated lock-free by
    // the parallel walk and read into the live progress snapshot. `files` is
    // seeded so repair scans start from their physically-seeded totals.
    let discovered_files = Arc::new(AtomicU64::new(prepared.seeded_file_count));
    let discovered_entries = Arc::new(AtomicU64::new(0));

    // Result handling (DB batching + progress) is identical for both phases, so
    // both phase loops funnel every PipelineResult through this closure. Mutable
    // tallies are passed as arguments (not captured) so the closure can run in
    // sequence across two separate `thread::scope` blocks.
    let process_result = |result: PipelineResult,
                          batch: &mut Vec<NewFile>,
                          file_count: &mut u64,
                          dir_count: &mut u64,
                          error_count: &mut u64,
                          total_bytes: &mut u64|
     -> Result<()> {
        match result {
            PipelineResult::Directory { row } => {
                *dir_count += 1;
                if let Some(row) = row {
                    batch.push(row);
                }
            }
            PipelineResult::File {
                row,
                reused,
                relative_path,
            } => {
                *file_count += 1;
                *total_bytes += row.size;
                batch.push(row);
                if let Some(progress) = &progress {
                    progress.update(&prepared.scan_id, |state| {
                        state.current_path = Some(relative_path.clone());
                        push_log(state, format!("processed {relative_path}"));
                        if reused {
                            push_log(state, format!("reused metadata for {relative_path}"));
                        }
                    });
                }
            }
            PipelineResult::Error {
                row,
                message,
                relative_path,
            } => {
                *error_count += 1;
                batch.push(row);
                if let Some(progress) = &progress {
                    progress.update(&prepared.scan_id, |state| {
                        state.message = Some(message.clone());
                        push_log(state, format!("Error processing {relative_path}: {message}"));
                    });
                }
            }
            PipelineResult::WalkError(message) => {
                *error_count += 1;
                if let Some(progress) = &progress {
                    progress.update(&prepared.scan_id, |state| {
                        state.message = Some(message.clone());
                        push_log(state, format!("Walk error: {message}"));
                    });
                }
                eprintln!("walk error: {message}");
            }
        }

        flush_scan_batch(
            db,
            &prepared.scan_id,
            batch,
            flush_size,
            *file_count,
            *dir_count,
            *error_count,
            *total_bytes,
            progress.as_ref(),
        )?;
        update_progress_counts(
            progress.as_ref(),
            &prepared.scan_id,
            *file_count,
            *dir_count,
            *error_count,
            *total_bytes,
            discovered_files.load(Ordering::Relaxed),
            discovered_entries.load(Ordering::Relaxed),
        );
        Ok(())
    };

    // ---- Phase 1: discovery + metadata (directory rows flushed now, file hash
    // jobs buffered for phase 2) ----
    {
        // Unbounded so discovery walks at full speed and never backpressures on
        // metadata — the walk is the fast front that feeds every later stage.
        let (work_tx, work_rx) = channel::<WorkItem>();
        let (result_tx, result_rx) = sync_channel::<PipelineResult>(256);
        let work_rx = Arc::new(Mutex::new(work_rx));

        thread::scope(|scope| {
            for _ in 0..metadata_workers {
                let work_rx = Arc::clone(&work_rx);
                let hash_tx = hash_tx.clone();
                let result_tx = result_tx.clone();
                let progress = progress.clone();
                let scan_id = prepared.scan_id.clone();
                let reusable_files = &prepared.reusable_files;
                let seeded_paths = &prepared.seeded_paths;
                let db_path = db_path.as_ref();
                let db_wal_path = db_wal_path.as_ref();
                let db_shm_path = db_shm_path.as_ref();
                let scan_root = &canonical_scan_root;
                scope.spawn(move || {
                    metadata_worker(
                        work_rx,
                        hash_tx,
                        result_tx,
                        progress,
                        scan_id,
                        reusable_files,
                        seeded_paths,
                        db_path,
                        db_wal_path,
                        db_shm_path,
                        scan_root,
                    );
                });
            }

            let discovery_progress = progress.clone();
            let discovery_scan_id = prepared.scan_id.clone();
            let scan_root = &canonical_scan_root;
            let discovery_result_tx = result_tx.clone();
            let discovery_discovered_files = Arc::clone(&discovered_files);
            let discovery_discovered_entries = Arc::clone(&discovered_entries);
            let discovery_matcher = Arc::clone(&scan_time_matcher);
            scope.spawn(move || {
                discovery_worker(
                    scan_root,
                    work_tx,
                    discovery_result_tx,
                    discovery_progress,
                    discovery_scan_id,
                    &discovery_discovered_files,
                    &discovery_discovered_entries,
                    discovery_matcher.as_ref().as_ref(),
                );
            });
            drop(result_tx);

            for result in result_rx {
                process_result(
                    result,
                    &mut batch,
                    &mut file_count,
                    &mut dir_count,
                    &mut error_count,
                    &mut total_bytes,
                )?;
            }

            Ok::<(), anyhow::Error>(())
        })?;
    }
    // Every metadata worker has finished, so no more hash jobs will be queued.
    // Dropping the last sender lets phase 2's hash workers terminate once the
    // buffer drains.
    drop(hash_tx);

    // ---- Phase 2: hashing (drain the buffered jobs into file rows) ----
    // A scan stopped during phase 1 skips hashing entirely; the buffered jobs
    // are simply dropped and the scan finalizes as "stopped".
    let stopped_before_hashing = progress
        .as_ref()
        .is_some_and(|progress| progress.is_stop_requested(&prepared.scan_id));
    if !stopped_before_hashing {
        let hash_rx = Arc::new(Mutex::new(hash_rx));
        let (result_tx, result_rx) = sync_channel::<PipelineResult>(256);

        thread::scope(|scope| {
            let hash_policy = prepared.hash_policy;
            let hash_sparse_full_below = sparse_full_below;
            for _ in 0..hash_workers {
                let hash_rx = Arc::clone(&hash_rx);
                let result_tx = result_tx.clone();
                let progress = progress.clone();
                let scan_id = prepared.scan_id.clone();
                let scan_root = &canonical_scan_root;
                scope.spawn(move || {
                    hash_worker(
                        hash_rx,
                        result_tx,
                        progress,
                        scan_id,
                        scan_root,
                        hash_policy,
                        hash_sparse_full_below,
                    );
                });
            }
            drop(result_tx);

            for result in result_rx {
                process_result(
                    result,
                    &mut batch,
                    &mut file_count,
                    &mut dir_count,
                    &mut error_count,
                    &mut total_bytes,
                )?;
            }

            Ok::<(), anyhow::Error>(())
        })?;
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

    let stopped = progress
        .as_ref()
        .is_some_and(|progress| progress.is_stop_requested(&prepared.scan_id));
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
    })();

    match result {
        Ok(summary) => Ok(summary),
        Err(error) => {
            match db.finish_scan(
                &scan_id,
                file_count,
                dir_count,
                error_count,
                total_bytes,
                "failed",
            ) {
                Ok(()) => Err(error),
                Err(finalize_error) => Err(error.context(format!(
                    "also failed to finalize scan {scan_id} as failed: {finalize_error:#}"
                ))),
            }
        }
    }
}

fn discovery_worker(
    scan_root: &Path,
    work_tx: Sender<WorkItem>,
    result_tx: SyncSender<PipelineResult>,
    progress: Option<ScanProgressStore>,
    scan_id: String,
    discovered_files: &AtomicU64,
    discovered_entries: &AtomicU64,
    exclude_matcher: Option<&ignore::gitignore::Gitignore>,
) {
    let walk_start = Instant::now();
    // Single-threaded walk on purpose: discovery shares the disk with the
    // metadata `stat()` workers, and on slow/removable media (USB, SD) a
    // many-threaded walk just adds seek contention and runs SLOWER than one
    // walker feeding the metadata pool (measured 13s parallel vs ~5s here).
    // Bookkeeping is lock-free — only atomics + an unbounded send — so the walk
    // never contends on the progress mutex; the main loop syncs the atomics into
    // the live snapshot.
    // Scan-time excludes prune whole subtrees (e.g. node_modules) via
    // filter_entry, so the walker never descends into them — matches are never
    // indexed and the cost is never paid.
    let mut walker = WalkDir::new(scan_root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            let Some(matcher) = exclude_matcher else {
                return true;
            };
            let relative = entry.path().strip_prefix(scan_root).unwrap_or(entry.path());
            if relative.as_os_str().is_empty() {
                return true;
            }
            !matcher
                .matched_path_or_any_parents(relative, entry.file_type().is_dir())
                .is_ignore()
        });
    while let Some(entry) = walker.next() {
        if progress
            .as_ref()
            .is_some_and(|progress| progress.is_stop_requested(&scan_id))
        {
            break;
        }
        if let Some(progress) = progress.as_ref() {
            progress.wait_while_paused(&scan_id);
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                pool_fail(progress.as_ref(), &scan_id, PoolKind::Discovery, None);
                let _ = result_tx.send(PipelineResult::WalkError(err.to_string()));
                continue;
            }
        };
        let Some(work_item) = work_item_from_entry(scan_root, entry) else {
            continue;
        };
        if matches!(work_item.kind, WorkKind::File) {
            discovered_files.fetch_add(1, Ordering::Relaxed);
        }
        discovered_entries.fetch_add(1, Ordering::Relaxed);
        if work_tx.send(work_item).is_err() {
            break;
        }
    }

    if std::env::var_os("FC_SCAN_TIMING").is_some() {
        let secs = walk_start.elapsed().as_secs_f64();
        let walked = discovered_entries.load(Ordering::Relaxed);
        eprintln!(
            "[DISCOVERY] {walked} entries in {secs:.3}s ({:.0} entries/s)",
            walked as f64 / secs.max(1e-9)
        );
    } else {
        let _ = walk_start;
    }
}

fn metadata_worker(
    work_rx: Arc<Mutex<Receiver<WorkItem>>>,
    hash_tx: Sender<HashJob>,
    result_tx: SyncSender<PipelineResult>,
    progress: Option<ScanProgressStore>,
    scan_id: String,
    reusable_files: &HashMap<String, ReusableFile>,
    seeded_paths: &std::collections::HashSet<String>,
    db_path: Option<&PathBuf>,
    db_wal_path: Option<&PathBuf>,
    db_shm_path: Option<&PathBuf>,
    canonical_scan_root: &Path,
) {
    loop {
        let item = {
            let work_rx = work_rx.lock().expect("scan work receiver lock poisoned");
            work_rx.recv()
        };
        let item = match item {
            Ok(item) => item,
            Err(_) => break,
        };
        if let Some(progress) = progress.as_ref() {
            progress.wait_while_paused(&scan_id);
        }

        let path = progress_path(&item.relative_path);
        let operation_id = pool_start(progress.as_ref(), &scan_id, PoolKind::Metadata, &path);

        match item.kind {
            WorkKind::Dir => {
                // WalkDir's no-follow discovery guarantee ends when this
                // queued work item is consumed. Recheck directories too so a
                // late replacement cannot import metadata from outside root.
                match checked_directory_metadata(&item.absolute_path, canonical_scan_root) {
                    Ok(metadata) => {
                        let row = if item.relative_path.is_empty() {
                            None
                        } else {
                            Some(NewFile {
                                scan_id: scan_id.clone(),
                                kind: "dir".to_string(),
                                path: item.relative_path,
                                name: item.name,
                                size: 0,
                                blake3: String::new(),
                                sha256: String::new(),
                                blake3_light: String::new(),
                                ctime: metadata.ctime,
                                mtime: metadata.mtime,
                                mode: metadata.mode,
                                error: None,
                            })
                        };
                        if result_tx.send(PipelineResult::Directory { row }).is_err() {
                            pool_fail(
                                progress.as_ref(),
                                &scan_id,
                                PoolKind::Metadata,
                                operation_id,
                            );
                            break;
                        }
                        pool_complete(
                            progress.as_ref(),
                            &scan_id,
                            PoolKind::Metadata,
                            operation_id,
                        );
                    }
                    Err(err) => {
                        pool_fail(
                            progress.as_ref(),
                            &scan_id,
                            PoolKind::Metadata,
                            operation_id,
                        );
                        let message = err.to_string();
                        if item.relative_path.is_empty() {
                            // The scan root is not represented by a `files`
                            // row. Retain the failure count/log without
                            // fabricating a directory row for it.
                            if result_tx
                                .send(PipelineResult::WalkError(format!(
                                    "directory recheck failed at {}: {message}",
                                    item.absolute_path.display()
                                )))
                                .is_err()
                            {
                                break;
                            }
                        } else {
                            let row = error_directory_row(
                                &scan_id,
                                &item.stored_path,
                                &item.name,
                                message.clone(),
                            );
                            if result_tx
                                .send(PipelineResult::Error {
                                    row,
                                    message,
                                    relative_path: item.relative_path,
                                })
                                .is_err()
                            {
                                break;
                            }
                        }
                    }
                }
            }
            WorkKind::File => {
                // Repair scans physically seed valid rows; skip re-processing
                // them so only missing/incomplete entries are (re)walked.
                if seeded_paths.contains(&item.stored_path) {
                    pool_complete(progress.as_ref(), &scan_id, PoolKind::Metadata, operation_id);
                    continue;
                }
                // Recheck each discovered file before reading metadata. A path
                // may have been replaced with a symlink after WalkDir saw it.
                match checked_file_metadata(&item.absolute_path, canonical_scan_root) {
                    Ok(metadata) => {
                        if is_database_sidecar(
                            &item.absolute_path,
                            db_path,
                            db_wal_path,
                            db_shm_path,
                        ) {
                            pool_complete(
                                progress.as_ref(),
                                &scan_id,
                                PoolKind::Metadata,
                                operation_id,
                            );
                            continue;
                        }

                        // Reuse remains an optimization, but the hash worker
                        // validates it against metadata from the opened file
                        // descriptor rather than this path stat.
                        let reusable = reusable_files
                            .get(&item.stored_path)
                            .filter(|candidate| reusable_matches(candidate, &metadata))
                            .cloned();
                        pool_queue(
                            progress.as_ref(),
                            &scan_id,
                            PoolKind::Hashing,
                            &progress_path(&item.relative_path),
                        );
                        if hash_tx
                            .send(HashJob {
                                absolute_path: item.absolute_path,
                                relative_path: item.relative_path,
                                stored_path: item.stored_path,
                                name: item.name,
                                reusable,
                            })
                            .is_err()
                        {
                            pool_fail(
                                progress.as_ref(),
                                &scan_id,
                                PoolKind::Metadata,
                                operation_id,
                            );
                            break;
                        }
                        pool_complete(
                            progress.as_ref(),
                            &scan_id,
                            PoolKind::Metadata,
                            operation_id,
                        );
                    }
                    Err(err) => {
                        pool_fail(
                            progress.as_ref(),
                            &scan_id,
                            PoolKind::Metadata,
                            operation_id,
                        );
                        let message = err.to_string();
                        let row = error_file_row(
                            &scan_id,
                            &item.stored_path,
                            &item.name,
                            message.clone(),
                        );
                        if result_tx
                            .send(PipelineResult::Error {
                                row,
                                message,
                                relative_path: item.relative_path,
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
        }
    }
}

fn hash_worker(
    hash_rx: Arc<Mutex<Receiver<HashJob>>>,
    result_tx: SyncSender<PipelineResult>,
    progress: Option<ScanProgressStore>,
    scan_id: String,
    canonical_scan_root: &Path,
    hash_policy: HashPolicy,
    sparse_full_below: u64,
) {
    loop {
        let job = {
            let hash_rx = hash_rx.lock().expect("scan hash receiver lock poisoned");
            hash_rx.recv()
        };
        let job = match job {
            Ok(job) => job,
            Err(_) => break,
        };
        // Phase 2 drains a buffer of already-queued jobs, so honor a stop
        // request per item rather than only between phases.
        if progress
            .as_ref()
            .is_some_and(|progress| progress.is_stop_requested(&scan_id))
        {
            break;
        }
        if let Some(progress) = progress.as_ref() {
            progress.wait_while_paused(&scan_id);
        }

        let path = progress_path(&job.relative_path);
        let operation_id = pool_start(progress.as_ref(), &scan_id, PoolKind::Hashing, &path);

        let hashed = (|| -> Result<HashedFile> {
            // Recheck again immediately before opening. Metadata stored in a
            // successful row always comes from this opened descriptor.
            let (file, metadata) = open_checked_file(&job.absolute_path, canonical_scan_root)?;
            if let Some(hashed) = reusable_hashed_file(job.reusable.as_ref(), &metadata) {
                return Ok(hashed);
            }
            // Size-dependent sparse policy: below the threshold, full hashing
            // costs no more than sampling, so keep the exact hashes too.
            let effective_policy = if matches!(hash_policy, HashPolicy::Light)
                && metadata.size < sparse_full_below
            {
                HashPolicy::Full
            } else {
                hash_policy
            };
            hash_open_file(file, metadata, effective_policy)
        })();

        match hashed {
            Ok(hashed) => {
                let row = file_row(&scan_id, &job.stored_path, &job.name, hashed.clone());
                if result_tx
                    .send(PipelineResult::File {
                        row,
                        reused: hashed.reused,
                        relative_path: job.relative_path,
                    })
                    .is_err()
                {
                    pool_fail(
                        progress.as_ref(),
                        &scan_id,
                        PoolKind::Hashing,
                        operation_id,
                    );
                    break;
                }
                pool_complete(
                    progress.as_ref(),
                    &scan_id,
                    PoolKind::Hashing,
                    operation_id,
                );
            }
            Err(err) => {
                pool_fail(
                    progress.as_ref(),
                    &scan_id,
                    PoolKind::Hashing,
                    operation_id,
                );
                let message = err.to_string();
                let row = error_file_row(&scan_id, &job.stored_path, &job.name, message.clone());
                if result_tx
                    .send(PipelineResult::Error {
                        row,
                        message,
                        relative_path: job.relative_path,
                    })
                    .is_err()
                {
                    break;
                }
            }
        }
    }
}

fn work_item_from_entry(scan_root: &Path, entry: walkdir::DirEntry) -> Option<WorkItem> {
    let kind = if entry.file_type().is_dir() {
        WorkKind::Dir
    } else if entry.file_type().is_file() {
        WorkKind::File
    } else {
        return None;
    };
    let absolute_path = entry.path().to_path_buf();
    let relative_path = absolute_path
        .strip_prefix(scan_root)
        .unwrap_or(&absolute_path)
        .to_string_lossy()
        .to_string();
    let name = entry.file_name().to_string_lossy().to_string();
    let stored_path = if relative_path.is_empty() {
        name.clone()
    } else {
        relative_path.clone()
    };
    Some(WorkItem {
        absolute_path,
        relative_path,
        stored_path,
        name,
        kind,
    })
}

fn is_database_sidecar(
    path: &Path,
    db_path: Option<&PathBuf>,
    db_wal_path: Option<&PathBuf>,
    db_shm_path: Option<&PathBuf>,
) -> bool {
    let canonical_path = path.canonicalize().ok();
    canonical_path.as_ref().is_some_and(|path| {
        Some(path) == db_path || Some(path) == db_wal_path || Some(path) == db_shm_path
    })
}

fn reusable_hashed_file(
    reusable: Option<&ReusableFile>,
    metadata: &HashedFileMetadata,
) -> Option<HashedFile> {
    let reusable = reusable?;
    if !reusable_matches(reusable, metadata) {
        return None;
    }
    Some(HashedFile {
        // These values came from the descriptor the hash worker opened, not
        // from the metadata-stage path check.
        size: metadata.size,
        blake3: reusable.blake3.clone(),
        sha256: reusable.sha256.clone(),
        blake3_light: String::new(),
        ctime: metadata.ctime.clone(),
        mtime: metadata.mtime.clone(),
        mode: metadata.mode,
        reused: true,
    })
}

fn reusable_matches(reusable: &ReusableFile, metadata: &HashedFileMetadata) -> bool {
    reusable.size == metadata.size
        && reusable.ctime == metadata.ctime
        && reusable.mtime == metadata.mtime
        && reusable.mode == metadata.mode
}

fn file_row(scan_id: &str, path: &str, name: &str, hashed: HashedFile) -> NewFile {
    NewFile {
        scan_id: scan_id.to_string(),
        kind: "file".to_string(),
        path: path.to_string(),
        name: name.to_string(),
        size: hashed.size,
        blake3: hashed.blake3,
        sha256: hashed.sha256,
        blake3_light: hashed.blake3_light,
        ctime: hashed.ctime,
        mtime: hashed.mtime,
        mode: hashed.mode,
        error: None,
    }
}

fn error_file_row(scan_id: &str, path: &str, name: &str, message: String) -> NewFile {
    error_path_row(scan_id, "file", path, name, message)
}

fn error_directory_row(scan_id: &str, path: &str, name: &str, message: String) -> NewFile {
    error_path_row(scan_id, "dir", path, name, message)
}

fn error_path_row(
    scan_id: &str,
    kind: &str,
    path: &str,
    name: &str,
    message: String,
) -> NewFile {
    NewFile {
        scan_id: scan_id.to_string(),
        kind: kind.to_string(),
        path: path.to_string(),
        name: name.to_string(),
        size: 0,
        blake3: String::new(),
        sha256: String::new(),
        blake3_light: String::new(),
        ctime: None,
        mtime: None,
        mode: None,
        error: Some(message),
    }
}

fn flush_scan_batch(
    db: &Database,
    scan_id: &str,
    batch: &mut Vec<NewFile>,
    flush_size: usize,
    file_count: u64,
    dir_count: u64,
    error_count: u64,
    total_bytes: u64,
    progress: Option<&ScanProgressStore>,
) -> Result<()> {
    if batch.len() < flush_size {
        return Ok(());
    }
    db.insert_file_batch(batch)?;
    batch.clear();
    db.update_scan_counts(scan_id, file_count, dir_count, error_count, total_bytes)?;
    if let Some(progress) = progress {
        progress.update(scan_id, |state| {
            push_log(state, format!("Flushed {file_count} files to SQLite"));
        });
    }
    Ok(())
}

fn update_progress_counts(
    progress: Option<&ScanProgressStore>,
    scan_id: &str,
    file_count: u64,
    dir_count: u64,
    error_count: u64,
    total_bytes: u64,
    discovered_files: u64,
    discovered_entries: u64,
) {
    if let Some(progress) = progress {
        progress.update(scan_id, |state| {
            state.file_count = file_count;
            state.dir_count = dir_count;
            state.discovered_files = discovered_files;
            state.error_count = error_count;
            state.total_bytes = total_bytes;
            // Discovery counters come from the lock-free walk atomics; the
            // metadata backlog is what's been discovered but not yet stat'd.
            state.pools.discovery.completed = discovered_entries;
            let metadata = &mut state.pools.metadata;
            metadata.queued = discovered_entries
                .saturating_sub(metadata.completed + metadata.active + metadata.failed);
        });
    }
}

fn hash_worker_count() -> usize {
    std::thread::available_parallelism()
        .map(|parallelism| parallelism.get().saturating_sub(1).clamp(1, 8))
        .unwrap_or(2)
}

/// Explicit per-run override > env var > default, clamped to a sane range.
fn resolve_worker_count(explicit: Option<usize>, env_key: &str, default: usize) -> usize {
    explicit
        .or_else(|| std::env::var(env_key).ok().and_then(|value| value.trim().parse().ok()))
        .unwrap_or(default)
        .clamp(1, 64)
}

fn pool_queue(progress: Option<&ScanProgressStore>, scan_id: &str, kind: PoolKind, path: &str) {
    let Some(progress) = progress else {
        return;
    };
    let path = path.to_string();
    progress.update(scan_id, move |state| {
        let pool = scan_pool_mut(&mut state.pools, kind);
        pool.queued += 1;
        pool.current_path = Some(path);
    });
}

fn pool_start(
    progress: Option<&ScanProgressStore>,
    scan_id: &str,
    kind: PoolKind,
    path: &str,
) -> Option<u64> {
    let progress = progress?;
    let path = path.to_string();
    progress.update_with_result(scan_id, move |state| {
        {
            let pool = scan_pool_mut(&mut state.pools, kind);
            pool.queued = pool.queued.saturating_sub(1);
            pool.active += 1;
            pool.current_path = Some(path.clone());
        }
        state.current_path = Some(path.clone());
        state.start_active_operation(kind, path)
    })
}

#[allow(dead_code)]
fn pool_activate(
    progress: Option<&ScanProgressStore>,
    scan_id: &str,
    kind: PoolKind,
    path: &str,
) -> Option<u64> {
    let progress = progress?;
    let path = path.to_string();
    progress.update_with_result(scan_id, move |state| {
        {
            let pool = scan_pool_mut(&mut state.pools, kind);
            if pool.active == 0 {
                pool.active = 1;
            }
            pool.current_path = Some(path.clone());
        }
        state.current_path = Some(path.clone());
        state.start_active_operation(kind, path)
    })
}

#[allow(dead_code)]
fn pool_deactivate(progress: Option<&ScanProgressStore>, scan_id: &str, kind: PoolKind) {
    let Some(progress) = progress else {
        return;
    };
    progress.update(scan_id, move |state| {
        {
            let pool = scan_pool_mut(&mut state.pools, kind);
            pool.active = 0;
            pool.current_path = None;
        }
        state.remove_active_operations_for_pool(kind);
    });
}

fn pool_complete(
    progress: Option<&ScanProgressStore>,
    scan_id: &str,
    kind: PoolKind,
    operation_id: Option<u64>,
) {
    let Some(progress) = progress else {
        return;
    };
    progress.update(scan_id, move |state| {
        state.remove_active_operation(operation_id);
        {
            let pool = scan_pool_mut(&mut state.pools, kind);
            pool.active = pool.active.saturating_sub(1);
            pool.completed += 1;
            if pool.active == 0 {
                pool.current_path = None;
            }
        }
    });
}

fn pool_fail(
    progress: Option<&ScanProgressStore>,
    scan_id: &str,
    kind: PoolKind,
    operation_id: Option<u64>,
) {
    let Some(progress) = progress else {
        return;
    };
    progress.update(scan_id, move |state| {
        state.remove_active_operation(operation_id);
        {
            let pool = scan_pool_mut(&mut state.pools, kind);
            pool.active = pool.active.saturating_sub(1);
            pool.failed += 1;
            if pool.active == 0 {
                pool.current_path = None;
            }
        }
    });
}

fn scan_pool_mut(pools: &mut ScanPools, kind: PoolKind) -> &mut ScanPoolProgress {
    match kind {
        PoolKind::Discovery => &mut pools.discovery,
        PoolKind::Metadata => &mut pools.metadata,
        PoolKind::Hashing => &mut pools.hashing,
    }
}

fn progress_path(path: &str) -> String {
    if path.is_empty() {
        ".".to_string()
    } else {
        path.to_string()
    }
}

fn sidecar_path(path: &Path, suffix: &str) -> Option<PathBuf> {
    Some(PathBuf::from(format!("{}-{suffix}", path.to_str()?)))
}

fn canonical_directory(path: &Path, label: &str) -> Result<PathBuf> {
    let canonical = path
        .canonicalize()
        .with_context(|| format!("canonicalizing {label} {}", path.display()))?;
    if !canonical.is_dir() {
        anyhow::bail!("{label} {} is not a directory", path.display());
    }
    Ok(canonical)
}

fn resolve_contained_scan_root(location_root: &Path, offset: &Path) -> Result<PathBuf> {
    let canonical_location_root = location_root
        .canonicalize()
        .with_context(|| format!("canonicalizing location root {}", location_root.display()))?;
    let relative_offset = if offset == Path::new("/") || offset.as_os_str().is_empty() {
        PathBuf::new()
    } else if offset.is_absolute() {
        offset.strip_prefix("/").unwrap_or(offset).to_path_buf()
    } else {
        offset.to_path_buf()
    };
    let scan_root = canonical_location_root
        .join(relative_offset)
        .canonicalize()
        .with_context(|| {
            format!(
                "resolving scan offset {} beneath location root {}",
                offset.display(),
                canonical_location_root.display()
            )
        })?;

    if !scan_root.starts_with(&canonical_location_root) {
        anyhow::bail!(
            "scan offset {} resolves outside canonical location root {}: {}",
            offset.display(),
            canonical_location_root.display(),
            scan_root.display()
        );
    }

    Ok(scan_root)
}

#[derive(Clone)]
struct HashedFile {
    size: u64,
    blake3: String,
    sha256: String,
    blake3_light: String,
    ctime: Option<String>,
    mtime: Option<String>,
    mode: Option<u32>,
    reused: bool,
}

/// Hash work a scan performs. `Full` computes exact blake3/sha256 plus the light
/// fingerprint; `Light` computes only the sampled fingerprint (cheap on slow
/// disks) and is excluded from exact duplicate detection / delete-check.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HashPolicy {
    #[default]
    Full,
    Light,
}

impl HashPolicy {
    pub fn from_label(label: Option<&str>) -> Self {
        match label {
            Some(value)
                if value.eq_ignore_ascii_case("light")
                    || value.eq_ignore_ascii_case("sparse") =>
            {
                HashPolicy::Light
            }
            _ => HashPolicy::Full,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            HashPolicy::Full => "full",
            HashPolicy::Light => "light",
        }
    }
}

#[derive(Clone, Copy)]
enum CheckedPathKind {
    File,
    Directory,
}

fn checked_file_metadata(path: &Path, canonical_scan_root: &Path) -> Result<HashedFileMetadata> {
    let metadata = checked_regular_file(path, canonical_scan_root)?;
    Ok(hashed_file_metadata(&metadata))
}

fn checked_directory_metadata(
    path: &Path,
    canonical_scan_root: &Path,
) -> Result<HashedFileMetadata> {
    let metadata = checked_path_metadata(path, canonical_scan_root, CheckedPathKind::Directory)?;
    Ok(hashed_file_metadata(&metadata))
}

/// Best-effort path recheck before reading metadata or opening a file.
/// It rejects direct symlinks and any canonical target outside the scan root.
/// On Unix the hash path additionally proves its opened descriptor identity.
fn checked_regular_file(path: &Path, canonical_scan_root: &Path) -> Result<Metadata> {
    checked_path_metadata(path, canonical_scan_root, CheckedPathKind::File)
}

fn checked_path_metadata(
    path: &Path,
    canonical_scan_root: &Path,
    expected_kind: CheckedPathKind,
) -> Result<Metadata> {
    let metadata = std::fs::symlink_metadata(path)
        .with_context(|| format!("lstat {}", path.display()))?;
    let expected_label = match expected_kind {
        CheckedPathKind::File => "file",
        CheckedPathKind::Directory => "directory",
    };
    if metadata.file_type().is_symlink() {
        anyhow::bail!("refusing symlink {expected_label} {}", path.display());
    }
    let has_expected_kind = match expected_kind {
        CheckedPathKind::File => metadata.is_file(),
        CheckedPathKind::Directory => metadata.is_dir(),
    };
    if !has_expected_kind {
        anyhow::bail!("refusing non-{expected_label} path {}", path.display());
    }

    let canonical_path = path
        .canonicalize()
        .with_context(|| format!("canonicalizing {expected_label} {}", path.display()))?;
    if !canonical_path.starts_with(canonical_scan_root) {
        anyhow::bail!(
            "{expected_label} {} resolves outside canonical scan root {}: {}",
            path.display(),
            canonical_scan_root.display(),
            canonical_path.display()
        );
    }
    Ok(metadata)
}

fn open_checked_file(path: &Path, canonical_scan_root: &Path) -> Result<(File, HashedFileMetadata)> {
    // These checks stay adjacent to File::open: WalkDir's earlier no-follow
    // traversal does not protect against a later replacement.
    let pre_open_metadata = checked_regular_file(path, canonical_scan_root)?;
    let file = File::open(path).with_context(|| format!("open {}", path.display()))?;
    let opened_metadata = file
        .metadata()
        .with_context(|| format!("metadata for opened {}", path.display()))?;
    if !opened_metadata.is_file() {
        anyhow::bail!("opened non-file path {}", path.display());
    }
    let post_open_metadata = checked_regular_file(path, canonical_scan_root)?;

    #[cfg(unix)]
    {
        ensure_same_unix_file_identity(&pre_open_metadata, &opened_metadata, path)?;
        ensure_same_unix_file_identity(&post_open_metadata, &opened_metadata, path)?;
    }
    #[cfg(not(unix))]
    {
        // Rust's portable file API has no descriptor-relative no-follow open
        // or stable file identity. The adjacent second lstat/canonical-root
        // check above confirms the path is currently a regular in-root file,
        // but cannot prove it is the same object as the opened handle under
        // concurrent replacement. Metadata and bytes remain descriptor-based;
        // callers must treat this as best-effort TOCTOU mitigation.
        let _ = (&pre_open_metadata, &post_open_metadata);
    }
    Ok((file, hashed_file_metadata(&opened_metadata)))
}

#[cfg(unix)]
fn ensure_same_unix_file_identity(
    expected: &Metadata,
    opened: &Metadata,
    path: &Path,
) -> Result<()> {
    use std::os::unix::fs::MetadataExt;

    if expected.dev() != opened.dev() || expected.ino() != opened.ino() {
        anyhow::bail!("file changed while opening {}", path.display());
    }
    Ok(())
}

// --- blake3_light: compile-time-configured uniform-sample fingerprint (plan-064) ---
// `blake3_light` is a heuristic fingerprint for cheaply inventorying slow disks.
// It is NOT an exact-content identity: `blake3` stays the exact hash, and light
// hashes must never silently feed exact duplicate detection or the exact
// delete-check `safe`.

const fn parse_env_usize(value: Option<&str>, default: usize) -> usize {
    match value {
        Some(text) => {
            let bytes = text.as_bytes();
            if bytes.is_empty() {
                return default;
            }
            let mut index = 0;
            let mut acc = 0usize;
            while index < bytes.len() {
                let byte = bytes[index];
                if byte < b'0' || byte > b'9' {
                    return default;
                }
                acc = acc * 10 + (byte - b'0') as usize;
                index += 1;
            }
            acc
        }
        None => default,
    }
}

// At least 5 slices by default; the head and tail slices are configured
// independently and default larger than the interior slices, so file headers,
// container footers, and evenly-spaced interior samples all carry weight.
const LIGHT_HASH_SLICE_COUNT: usize = {
    let configured = parse_env_usize(option_env!("FILE_CENSUS_LIGHT_HASH_SLICE_COUNT"), 5);
    if configured < 5 {
        5
    } else {
        configured
    }
};
const LIGHT_HASH_SLICE_WIDTH: usize = {
    let configured = parse_env_usize(option_env!("FILE_CENSUS_LIGHT_HASH_SLICE_WIDTH"), 4 * 1024 * 1024);
    if configured == 0 {
        1
    } else {
        configured
    }
};
const LIGHT_HASH_HEAD_SLICE_WIDTH: usize = {
    let configured =
        parse_env_usize(option_env!("FILE_CENSUS_LIGHT_HASH_HEAD_SLICE_WIDTH"), 8 * 1024 * 1024);
    if configured == 0 {
        1
    } else {
        configured
    }
};
const LIGHT_HASH_TAIL_SLICE_WIDTH: usize = {
    let configured =
        parse_env_usize(option_env!("FILE_CENSUS_LIGHT_HASH_TAIL_SLICE_WIDTH"), 8 * 1024 * 1024);
    if configured == 0 {
        1
    } else {
        configured
    }
};

fn light_hash_slice_width(index: usize, count: usize) -> u64 {
    if index == 0 {
        LIGHT_HASH_HEAD_SLICE_WIDTH as u64
    } else if index == count - 1 {
        LIGHT_HASH_TAIL_SLICE_WIDTH as u64
    } else {
        LIGHT_HASH_SLICE_WIDTH as u64
    }
}

/// Byte ranges `blake3_light` samples for a file of `size` bytes. Small files
/// (≤ `head + tail + (count-2)*slice`) return a single whole-file range so the
/// light hash can equal the full BLAKE3. Larger files return `slice_count`
/// ranges: the first anchored at the start with head width, the last anchored at
/// the end with tail width, and interior ranges of slice width with evenly-spaced
/// start offsets.
fn light_hash_slice_plan(size: u64) -> Vec<(u64, u64)> {
    let count = LIGHT_HASH_SLICE_COUNT;
    let whole_threshold = sparse_whole_threshold();
    if size <= whole_threshold {
        return vec![(0, size)];
    }

    let mut plan = Vec::with_capacity(count);
    let denom = (count - 1) as f64;
    for index in 0..count {
        let width = light_hash_slice_width(index, count);
        let max_offset = size.saturating_sub(width);
        let fraction = index as f64 / denom;
        let offset = (fraction * max_offset as f64).round() as u64;
        let offset = offset.min(max_offset);
        let len = width.min(size - offset);
        plan.push((offset, len));
    }
    plan
}

// Compile-time guard: the default configuration honors the "at least 5 slices"
// requirement regardless of the env knobs.
const _: () = assert!(LIGHT_HASH_SLICE_COUNT >= 5);

/// Combined size of every sparse-hash slice (head + tail + interior). Files at
/// or below this size are read whole by the sampler, so full hashing costs no
/// more — it is both the whole-file sampling cutoff and the minimum legal
/// `sparse_full_below` threshold.
pub fn sparse_whole_threshold() -> u64 {
    LIGHT_HASH_HEAD_SLICE_WIDTH as u64
        + LIGHT_HASH_TAIL_SLICE_WIDTH as u64
        + (LIGHT_HASH_SLICE_COUNT as u64 - 2) * LIGHT_HASH_SLICE_WIDTH as u64
}

/// Computes `blake3_light` over an in-memory buffer (used for tests and small
/// inputs). Hashes the sampled ranges in order.
// Wired into the scanner hash pipeline in plan-069 step 2; until then only the
// primitive + tests exist.
#[allow(dead_code)]
fn blake3_light_of_bytes(bytes: &[u8]) -> String {
    let mut hasher = blake3::Hasher::new();
    for (offset, len) in light_hash_slice_plan(bytes.len() as u64) {
        let start = offset as usize;
        let end = start.saturating_add(len as usize).min(bytes.len());
        if start < end {
            hasher.update(&bytes[start..end]);
        }
    }
    hasher.finalize().to_hex().to_string()
}

fn hash_open_file(
    file: File,
    metadata: HashedFileMetadata,
    policy: HashPolicy,
) -> Result<HashedFile> {
    let mut reader = BufReader::new(file);

    if matches!(policy, HashPolicy::Light) {
        // Sampled-only: read just the sparse-hash slices, never the whole
        // file. Exact-hash columns stay EMPTY — a sparse match is sparse-tier
        // evidence only, never exact. (Files below the sparse_full_below
        // threshold are escalated to Full before reaching this branch.)
        let blake3_light = blake3_light_from_reader(&mut reader, metadata.size)?;
        return Ok(HashedFile {
            size: metadata.size,
            blake3: String::new(),
            sha256: String::new(),
            blake3_light,
            ctime: metadata.ctime,
            mtime: metadata.mtime,
            mode: metadata.mode,
            reused: false,
        });
    }

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

    // A full scan also records the light fingerprint (a cheap second pass over
    // the sampled ranges of the already-open file).
    let blake3_light = blake3_light_from_reader(&mut reader, metadata.size)?;

    Ok(HashedFile {
        size: metadata.size,
        blake3: blake3_hasher.finalize().to_hex().to_string(),
        sha256: hex::encode(sha256_hasher.finalize()),
        blake3_light,
        ctime: metadata.ctime,
        mtime: metadata.mtime,
        mode: metadata.mode,
        reused: false,
    })
}

/// Reads only the `blake3_light` sampled ranges from a seekable reader.
fn blake3_light_from_reader<R: Read + Seek>(reader: &mut R, size: u64) -> Result<String> {
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0_u8; 128 * 1024];
    for (offset, len) in light_hash_slice_plan(size) {
        reader.seek(SeekFrom::Start(offset))?;
        let mut remaining = len as usize;
        while remaining > 0 {
            let want = remaining.min(buffer.len());
            let read = reader.read(&mut buffer[..want])?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            remaining -= read;
        }
    }
    Ok(hasher.finalize().to_hex().to_string())
}

struct HashedFileMetadata {
    size: u64,
    ctime: Option<String>,
    mtime: Option<String>,
    mode: Option<u32>,
}

fn hashed_file_metadata(metadata: &Metadata) -> HashedFileMetadata {
    HashedFileMetadata {
        size: metadata.len(),
        ctime: ctime(metadata),
        mtime: metadata.modified().ok().map(system_time_to_rfc3339),
        mode: mode(metadata),
    }
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
    use crate::db::{Location, LocationInput, LocationType};

    #[test]
    fn scan_control_parks_while_paused_and_wakes_on_resume_or_stop() {
        use std::time::Duration;

        let control = Arc::new(ScanControl::default());
        assert!(!control.is_paused());

        // A parked worker stays blocked until resumed.
        control.set_paused(true);
        let parked = control.clone();
        let handle = thread::spawn(move || parked.wait_while_paused());
        thread::sleep(Duration::from_millis(40));
        assert!(!handle.is_finished(), "worker should still be parked while paused");
        control.set_paused(false);
        handle.join().unwrap();

        // Stop while paused unblocks immediately, even though still paused.
        control.set_paused(true);
        let parked = control.clone();
        let handle = thread::spawn(move || parked.wait_while_paused());
        thread::sleep(Duration::from_millis(20));
        control.request_stop();
        handle.join().unwrap();
        assert!(control.is_stopped());
    }

    #[test]
    fn blake3_light_small_file_equals_full_hash() {
        // Files at/below the whole-file threshold hash their entire contents, so
        // the light fingerprint equals the full BLAKE3 (plan-064).
        let data = b"the quick brown fox jumps over the lazy dog";
        assert_eq!(
            blake3_light_of_bytes(data),
            blake3::hash(data).to_hex().to_string()
        );
    }

    #[test]
    fn blake3_light_plan_samples_head_tail_and_interior() {
        assert!(
            LIGHT_HASH_SLICE_COUNT >= 5,
            "default light hash uses at least 5 slices"
        );
        let head = LIGHT_HASH_HEAD_SLICE_WIDTH as u64;
        let tail = LIGHT_HASH_TAIL_SLICE_WIDTH as u64;
        let slice = LIGHT_HASH_SLICE_WIDTH as u64;
        // Comfortably past the whole-file threshold so every slice is distinct.
        let size = head + tail + (LIGHT_HASH_SLICE_COUNT as u64 - 2) * slice + head + tail;
        let plan = light_hash_slice_plan(size);

        assert_eq!(plan.len(), LIGHT_HASH_SLICE_COUNT);
        assert_eq!(plan[0], (0, head), "first slice anchored at start with head width");
        let (last_off, last_len) = *plan.last().unwrap();
        assert_eq!(last_len, tail, "last slice uses tail width");
        assert_eq!(last_off + last_len, size, "last slice anchored at end");
        for window in plan.windows(2) {
            assert!(window[1].0 > window[0].0, "slice offsets strictly increase");
        }
    }

    #[test]
    fn blake3_light_ignores_unsampled_bytes_but_reflects_sampled_ones() {
        // Twice the summed slice widths guarantees uncovered gaps between slices.
        let widths_sum = LIGHT_HASH_HEAD_SLICE_WIDTH
            + LIGHT_HASH_TAIL_SLICE_WIDTH
            + (LIGHT_HASH_SLICE_COUNT - 2) * LIGHT_HASH_SLICE_WIDTH;
        let size = 2 * widths_sum + 4096;
        let mut buffer = vec![7u8; size];
        let plan = light_hash_slice_plan(size as u64);
        let covered = |index: usize| {
            plan.iter()
                .any(|&(offset, len)| index as u64 >= offset && (index as u64) < offset + len)
        };
        let base = blake3_light_of_bytes(&buffer);

        if let Some(gap) = (0..size).find(|&index| !covered(index)) {
            buffer[gap] ^= 0xFF;
            assert_eq!(
                blake3_light_of_bytes(&buffer),
                base,
                "an unsampled byte must not change the light hash"
            );
            buffer[gap] ^= 0xFF;
        }
        buffer[0] ^= 0xFF; // first terminal slice is always sampled
        assert_ne!(blake3_light_of_bytes(&buffer), base);
    }

    #[test]
    fn benchmark_discovery_counts_entries_and_supports_stop_probe() {
        let root = test_root("benchmark-discovery");
        let src = root.join("src");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("a.txt"), b"a").unwrap();
        std::fs::write(src.join("sub/b.txt"), b"b").unwrap();

        let stats = benchmark_discovery(&src, None, Some(2), None).unwrap();
        assert_eq!(stats.errors, 0);
        assert_eq!(stats.files, 2);
        assert!(stats.dirs >= 1);
        assert!(stats.first_entry_ms.is_some());

        // Deterministic stop probe: stop is requested up front.
        let stopped = benchmark_discovery(&src, None, Some(2), Some(Duration::ZERO)).unwrap();
        assert!(stopped.stop_requested);
        assert!(stopped.stop_latency_ms.is_some());

        let _ = std::fs::remove_dir_all(root);
    }

    fn physical_file_paths(db: &Database, scan_id: &str) -> Vec<String> {
        let conn = db.connect().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT path FROM files WHERE scan_id = ?1 AND kind = 'file' ORDER BY path",
            )
            .unwrap();
        stmt.query_map([scan_id], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    }

    #[test]
    fn prepare_scan_accepts_nested_offset_inside_location_root() {
        let root = test_root("scan-root-contained");
        let location_root = root.join("location");
        std::fs::create_dir_all(location_root.join("nested")).unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root.clone(),
            notes: None,
        })
        .unwrap();

        let prepared = prepare_scan(&db, "test", Path::new("/nested")).unwrap();

        assert_eq!(
            prepared.scan_root,
            location_root.join("nested").canonicalize().unwrap()
        );
        let scans = db.scans().unwrap();
        assert_eq!(scans.len(), 1);
        assert_eq!(scans[0].offset_path, "/nested");
    }

    #[test]
    fn prepare_scan_with_started_at_persists_date_derived_identity() {
        let root = test_root("scan-started-at");
        let location_root = root.join("location");
        std::fs::create_dir_all(&location_root).unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Unknown,
            name: "Archive".to_string(),
            slug: "archive-volume".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        let prepared = prepare_scan_with_started_at(
            &db,
            "archive-volume",
            Path::new("/"),
            started_at.clone(),
        )
        .unwrap();

        assert_eq!(prepared.scan_id, "20260715T123456Z--archive-volume");
        let scan = db.scan_by_id(&prepared.scan_id).unwrap().unwrap();
        assert_eq!(scan.started_at, started_at.to_rfc3339());
    }

    #[test]
    fn prepare_bootstrap_scan_creates_unknown_location_and_date_derived_scan() {
        let root = test_root("bootstrap-scan");
        let source_root = root.join("source");
        std::fs::create_dir_all(source_root.join("nested")).unwrap();
        let db = Database::open(root.join("state.db")).unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        let prepared = prepare_bootstrap_scan_with_started_at(
            &db,
            &source_root,
            "archive-volume",
            Path::new("/nested"),
            started_at.clone(),
        )
        .unwrap();

        assert_eq!(prepared.scan_id, "20260715T123456Z--archive-volume");
        assert_eq!(prepared.location.kind, LocationType::Unknown);
        assert_eq!(prepared.location.name, "archive-volume");
        assert_eq!(
            prepared.scan_root,
            source_root.join("nested").canonicalize().unwrap()
        );
        let scan = db.scan_by_id(&prepared.scan_id).unwrap().unwrap();
        assert_eq!(scan.started_at, started_at.to_rfc3339());
        assert_eq!(scan.offset_path, "/nested");

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn prepare_bootstrap_scan_rejects_invalid_setup_without_creating_a_location() {
        let root = test_root("bootstrap-scan-invalid-setup");
        let source_root = root.join("source");
        std::fs::create_dir_all(&source_root).unwrap();
        std::fs::create_dir_all(root.join("outside")).unwrap();
        let db = Database::open(root.join("state.db")).unwrap();
        let started_at = DateTime::parse_from_rfc3339("2026-07-15T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);

        for (offset, message) in [
            (Path::new("/missing"), "resolving scan offset /missing beneath location root"),
            (
                Path::new("../outside"),
                "resolves outside canonical location root",
            ),
        ] {
            let error = prepare_bootstrap_scan_with_started_at(
                &db,
                &source_root,
                "archive-volume",
                offset,
                started_at.clone(),
            )
            .expect_err("invalid bootstrap setup must be rejected before mutation");
            assert!(error.to_string().contains(message), "{error:#}");
            assert!(db.locations().unwrap().is_empty());
            assert!(db.scans().unwrap().is_empty());
        }

        let error = prepare_bootstrap_scan_with_started_at(
            &db,
            &source_root,
            "",
            Path::new("/"),
            started_at,
        )
        .expect_err("blank bootstrap slug must be rejected before mutation");
        assert!(error.to_string().contains("volume slug must not be blank"));
        assert!(db.locations().unwrap().is_empty());
        assert!(db.scans().unwrap().is_empty());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn prepare_scan_rejects_outside_or_missing_offsets_before_starting() {
        let root = test_root("scan-root-containment");
        let location_root = root.join("container/location");
        std::fs::create_dir_all(location_root.join("nested")).unwrap();
        std::fs::create_dir_all(root.join("container/outside")).unwrap();
        std::fs::create_dir_all(root.join("outside")).unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        for (offset, message) in [
            (Path::new("../outside"), "resolves outside canonical location root"),
            (
                Path::new("/../../outside"),
                "resolves outside canonical location root",
            ),
            (
                Path::new("/missing"),
                "resolving scan offset /missing beneath location root",
            ),
        ] {
            let error = prepare_scan(&db, "test", offset)
                .err()
                .expect("outside or missing offset should be rejected");
            assert!(error.to_string().contains(message), "{error:#}");
            assert!(db.scans().unwrap().is_empty());
        }
    }

    #[cfg(unix)]
    #[test]
    fn prepare_scan_rejects_symlink_offsets_outside_location_root_before_starting() {
        use std::os::unix::fs::symlink;

        let root = test_root("scan-root-symlink-containment");
        let location_root = root.join("location");
        let outside = root.join("outside");
        std::fs::create_dir_all(&location_root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, location_root.join("outside-link")).unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let error = prepare_scan(&db, "test", Path::new("/outside-link"))
            .err()
            .expect("outside symlink should be rejected");
        assert!(
            error
                .to_string()
                .contains("resolves outside canonical location root"),
            "{error:#}"
        );
        assert!(db.scans().unwrap().is_empty());
    }

    #[test]
    fn prepare_update_scan_validates_seed_before_creating_destination_scan() {
        let root = test_root("update-scan-seed-containment");
        let location_root = root.join("container/location");
        std::fs::create_dir_all(&location_root).unwrap();
        std::fs::create_dir_all(root.join("container/outside")).unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();
        let location = db.location_by_slug("test").unwrap().unwrap();
        let source_scan_id = db.start_scan(&location, Path::new("../outside")).unwrap();

        let error = prepare_update_scan(&db, &source_scan_id)
            .err()
            .expect("escaped source offset should be rejected");

        assert!(
            error
                .to_string()
                .contains("resolves outside canonical location root"),
            "{error:#}"
        );
        assert_eq!(db.scans().unwrap().len(), 1);
    }

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
        let after_delete = db
            .scan_tree_page(&initial.scan_id, "", Some(50), 0, 1, None, false)
            .unwrap();
        assert!(after_delete.entries.iter().all(|entry| entry.path != "sub"));

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
    fn repair_scan_seeds_valid_rows_and_reprocesses_only_missing_ones() {
        let root = test_root("repair-seeds");
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

        // Simulate an incomplete scan: one valid file row is gone.
        let deleted = db.delete_scan_path(&initial.scan_id, "sub/restore.txt").unwrap();
        assert_eq!(deleted, 1);

        let repaired = run_prepared_scan(
            &db,
            prepare_repair_scan(&db, &initial.scan_id).unwrap(),
            None,
        )
        .unwrap();
        // Final count includes the seeded valid row (keep.txt) plus the
        // reprocessed missing one (sub/restore.txt).
        assert_eq!(repaired.file_count, 2);

        let repaired_paths = db
            .scan_files(&repaired.scan_id, 10)
            .unwrap()
            .into_iter()
            .map(|file| file.path)
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            repaired_paths,
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

    #[test]
    fn scanning_a_missing_location_path_is_rejected_before_creating_a_scan() {
        let root = test_root("missing-location-path");
        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Gone".to_string(),
            slug: "gone".to_string(),
            root_path: root.join("does-not-exist"),
            notes: None,
        })
        .unwrap();

        let error = prepare_scan(&db, "gone", Path::new("/"))
            .unwrap_err()
            .to_string();
        assert!(error.contains("does not exist"), "unexpected error: {error}");
        assert!(
            db.scans().unwrap().is_empty(),
            "a rejected scan must not create a scan record"
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn light_scan_records_only_the_sampled_fingerprint_and_flags_the_scan() {
        let root = test_root("light-scan");
        let location_root = root.join("location");
        std::fs::create_dir_all(&location_root).unwrap();
        std::fs::write(location_root.join("a.txt"), b"content for light hashing").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let prepared =
            prepare_scan_with_policy(&db, "test", Path::new("/"), HashPolicy::Light).unwrap();
        let scan_id = prepared.scan_id.clone();
        let summary = run_prepared_scan(&db, prepared, None).unwrap();
        assert_eq!(summary.file_count, 1);

        let conn = db.connect().unwrap();
        let (blake3, blake3_light): (String, String) = conn
            .query_row(
                "SELECT blake3, blake3_light FROM files WHERE scan_id = ?1 AND kind = 'file'",
                [&scan_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(!blake3_light.is_empty());
        // Light scans carry the sampled fingerprint in both columns and are
        // flagged so exact duplicate detection excludes them.
        assert_eq!(blake3, blake3_light);
        let policy: String = conn
            .query_row("SELECT hash_policy FROM scans WHERE id = ?1", [&scan_id], |row| row.get(0))
            .unwrap();
        assert_eq!(policy, "light");
    }

    #[test]
    fn scan_indexes_files_matching_excludes() {
        let root = test_root("scan-excludes");
        let location_root = root.join("location");
        std::fs::create_dir_all(location_root.join("skip-dir")).unwrap();
        std::fs::write(location_root.join("keep.txt"), b"keep").unwrap();
        std::fs::write(location_root.join("skip.tmp"), b"skip").unwrap();
        std::fs::write(location_root.join("skip-dir/hidden.txt"), b"hidden").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let prepared = prepare_scan(&db, "test", Path::new("/")).unwrap();
        db.set_scan_excludes(
            &prepared.scan_id,
            vec!["*.tmp".to_string(), "skip-dir/".to_string()],
        )
        .unwrap();
        let summary = run_prepared_scan(&db, prepared, None).unwrap();

        assert_eq!(summary.file_count, 3);
        let paths = physical_file_paths(&db, &summary.scan_id);
        assert_eq!(paths, vec!["keep.txt", "skip-dir/hidden.txt", "skip.tmp"]);
    }

    #[test]
    fn run_prepared_scan_marks_reserved_scan_failed_after_an_ordinary_error() {
        let root = test_root("scan-finalization-on-error");
        let location_root = root.join("location");
        std::fs::create_dir_all(&location_root).unwrap();
        std::fs::write(location_root.join("one.txt"), b"one").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();
        let prepared = prepare_scan(&db, "test", Path::new("/")).unwrap();
        let scan_id = prepared.scan_id.clone();
        let conn = db.connect().unwrap();
        conn.execute_batch(
            r#"
            CREATE TRIGGER force_running_scan_count_failure
            BEFORE UPDATE OF file_count ON scans
            WHEN NEW.status = 'running'
            BEGIN
                SELECT RAISE(ABORT, 'forced running scan count failure');
            END;
            "#,
        )
        .unwrap();
        drop(conn);

        let error = run_prepared_scan(&db, prepared, None)
            .expect_err("the trigger should force a normal scan error");
        assert!(
            error
                .to_string()
                .contains("forced running scan count failure"),
            "{error:#}"
        );
        let scan = db.scan_by_id(&scan_id).unwrap().unwrap();
        assert_eq!(scan.status, "failed");
        assert!(scan.finished_at.is_some());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn progress_finish_honors_a_failed_summary_with_one_failed_terminal_event() {
        let terminal_events = Arc::new(Mutex::new(Vec::<String>::new()));
        let recorded_events = Arc::clone(&terminal_events);
        let progress = ScanProgressStore::with_events(EventHub::with_recorder(move |event| {
            if matches!(
                event.kind.as_str(),
                "scan_finished" | "scan_failed" | "scan_stopped"
            ) {
                recorded_events.lock().unwrap().push(event.kind.clone());
            }
        }));
        let prepared = PreparedScan {
            scan_id: "failed-summary-progress".to_string(),
            location: Location {
                id: "location".to_string(),
                slug: "test".to_string(),
                name: "Test".to_string(),
                kind: LocationType::Local,
                root_path: PathBuf::from("/tmp"),
                notes: None,
                representative_scan_id: None,
                disabled: false,
                created_at: "2026-07-15T00:00:00Z".to_string(),
            },
            scan_root: PathBuf::from("/tmp"),
            reuse_from_scan_id: None,
            reusable_files: HashMap::new(),
            seeded_paths: std::collections::HashSet::new(),
            seeded_file_count: 0,
            seeded_total_bytes: 0,
            hash_policy: HashPolicy::Full,
            hash_workers: None,
            metadata_workers: None,
            sparse_full_below: None,
            scan_time_excludes: Vec::new(),
        };
        progress.start(&prepared);
        progress.finish(&ScanSummary {
            scan_id: prepared.scan_id.clone(),
            status: "failed".to_string(),
            file_count: 0,
            dir_count: 1,
            error_count: 1,
            total_bytes: 0,
        });

        let state = progress.get(&prepared.scan_id).unwrap();
        assert_eq!(state.status, "failed");
        assert_eq!(state.file_count, 0);
        assert_eq!(state.dir_count, 1);
        assert_eq!(state.error_count, 1);
        assert!(state
            .message
            .as_deref()
            .is_some_and(|message| message.starts_with("Failed:")));
        assert_eq!(
            *terminal_events.lock().unwrap(),
            vec!["scan_failed".to_string()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn metadata_recheck_turns_a_late_symlink_replacement_into_an_error_row() {
        use std::os::unix::fs::symlink;

        let root = test_root("late-symlink-replacement");
        let scan_root = root.join("scan");
        let outside = root.join("outside.txt");
        std::fs::create_dir_all(&scan_root).unwrap();
        std::fs::write(scan_root.join("candidate.txt"), b"inside").unwrap();
        std::fs::write(&outside, b"outside").unwrap();

        let (work_tx, work_rx) = sync_channel(1);
        work_tx
            .send(WorkItem {
                absolute_path: scan_root.join("candidate.txt"),
                relative_path: "candidate.txt".to_string(),
                stored_path: "candidate.txt".to_string(),
                name: "candidate.txt".to_string(),
                kind: WorkKind::File,
            })
            .unwrap();
        std::fs::remove_file(scan_root.join("candidate.txt")).unwrap();
        symlink(&outside, scan_root.join("candidate.txt")).unwrap();
        drop(work_tx);

        let (hash_tx, _hash_rx) = channel::<HashJob>();
        let (result_tx, result_rx) = sync_channel(1);
        metadata_worker(
            Arc::new(Mutex::new(work_rx)),
            hash_tx,
            result_tx,
            None,
            "scan".to_string(),
            &HashMap::new(),
            &std::collections::HashSet::new(),
            None,
            None,
            None,
            &scan_root.canonicalize().unwrap(),
        );

        match result_rx.recv().unwrap() {
            PipelineResult::Error { row, message, .. } => {
                assert!(message.contains("refusing symlink file"), "{message}");
                assert_eq!(row.path, "candidate.txt");
                assert!(row.error.is_some());
                assert!(row.blake3.is_empty());
                assert!(row.sha256.is_empty());
            }
            _ => panic!("late symlink must not become a successful file row"),
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn directory_metadata_recheck_turns_a_late_symlink_replacement_into_a_dir_error_row() {
        use std::os::unix::fs::symlink;

        let root = test_root("late-directory-symlink-replacement");
        let scan_root = root.join("scan");
        let outside = root.join("outside");
        let candidate = scan_root.join("candidate");
        std::fs::create_dir_all(&candidate).unwrap();
        std::fs::create_dir_all(&outside).unwrap();

        let (work_tx, work_rx) = sync_channel(1);
        work_tx
            .send(WorkItem {
                absolute_path: candidate.clone(),
                relative_path: "candidate".to_string(),
                stored_path: "candidate".to_string(),
                name: "candidate".to_string(),
                kind: WorkKind::Dir,
            })
            .unwrap();
        std::fs::remove_dir(&candidate).unwrap();
        symlink(&outside, &candidate).unwrap();
        drop(work_tx);

        let (hash_tx, _hash_rx) = channel::<HashJob>();
        let (result_tx, result_rx) = sync_channel(1);
        metadata_worker(
            Arc::new(Mutex::new(work_rx)),
            hash_tx,
            result_tx,
            None,
            "scan".to_string(),
            &HashMap::new(),
            &std::collections::HashSet::new(),
            None,
            None,
            None,
            &scan_root.canonicalize().unwrap(),
        );

        match result_rx.recv().unwrap() {
            PipelineResult::Error { row, message, .. } => {
                assert!(message.contains("refusing symlink directory"), "{message}");
                assert_eq!(row.kind, "dir");
                assert_eq!(row.path, "candidate");
                assert!(row.error.is_some());
                assert_eq!(row.size, 0);
                assert!(row.ctime.is_none());
                assert!(row.mtime.is_none());
                assert!(row.mode.is_none());
            }
            _ => panic!("late symlink must not become a successful directory row"),
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn unix_identity_check_rejects_a_file_replacement_between_recheck_and_open() {
        let root = test_root("late-file-replacement");
        let scan_root = root.join("scan");
        std::fs::create_dir_all(&scan_root).unwrap();
        let candidate = scan_root.join("candidate.txt");
        let replacement = scan_root.join("replacement.txt");
        std::fs::write(&candidate, b"old").unwrap();
        std::fs::write(&replacement, b"replacement").unwrap();
        let canonical_root = scan_root.canonicalize().unwrap();

        let expected = checked_regular_file(&candidate, &canonical_root).unwrap();
        std::fs::rename(&replacement, &candidate).unwrap();
        let opened = File::open(&candidate).unwrap().metadata().unwrap();
        let error = ensure_same_unix_file_identity(&expected, &opened, &candidate)
            .expect_err("replacement between check and open must be rejected");
        assert!(error.to_string().contains("file changed while opening"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn update_scan_copies_excludes_and_indexes_matching_paths() {
        let root = test_root("update-respects-excludes");
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
        db.append_exact_scan_exclude(&initial.scan_id, "sub", "dir")
            .unwrap();

        let prepared = prepare_update_scan(&db, &initial.scan_id).unwrap();
        assert_eq!(
            db.scan_excludes(&prepared.scan_id)
                .unwrap()
                .iter()
                .map(|exclude| exclude.pattern.as_str())
                .collect::<Vec<_>>(),
            vec!["/sub/"]
        );
        let updated = run_prepared_scan(&db, prepared, None).unwrap();

        assert_eq!(updated.file_count, 2);
        let paths = physical_file_paths(&db, &updated.scan_id);
        assert_eq!(paths, vec!["keep.txt", "sub/restore.txt"]);
    }

    #[test]
    fn active_operations_are_oldest_first_and_exclude_queued_paths() {
        let (progress, scan_id) = progress_for_active_operation_test();

        pool_queue(
            Some(&progress),
            &scan_id,
            PoolKind::Metadata,
            "queued-only.txt",
        );
        assert!(progress.active_operations_oldest_first(&scan_id).is_empty());

        let metadata_operation = pool_start(
            Some(&progress),
            &scan_id,
            PoolKind::Metadata,
            "metadata.txt",
        )
        .expect("started metadata operation");
        pool_queue(
            Some(&progress),
            &scan_id,
            PoolKind::Hashing,
            "hashing.txt",
        );
        let hashing_operation = pool_start(
            Some(&progress),
            &scan_id,
            PoolKind::Hashing,
            "hashing.txt",
        )
        .expect("started hashing operation");

        let operations = progress.active_operations_oldest_first(&scan_id);
        assert_eq!(operations.len(), 2);
        assert_eq!(operations[0].operation_id, metadata_operation);
        assert_eq!(operations[0].pool, "metadata");
        assert_eq!(operations[0].path, "metadata.txt");
        assert!(chrono::DateTime::parse_from_rfc3339(&operations[0].started_at).is_ok());
        assert_eq!(operations[1].operation_id, hashing_operation);
        assert_eq!(operations[1].pool, "hashing");
        assert_eq!(operations[1].path, "hashing.txt");

        pool_complete(
            Some(&progress),
            &scan_id,
            PoolKind::Metadata,
            Some(metadata_operation),
        );
        let operations = progress.active_operations_oldest_first(&scan_id);
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].operation_id, hashing_operation);

        pool_fail(
            Some(&progress),
            &scan_id,
            PoolKind::Hashing,
            Some(hashing_operation),
        );
        assert!(progress.active_operations_oldest_first(&scan_id).is_empty());
    }

    #[test]
    fn deactivating_a_pool_removes_its_active_operations() {
        let (progress, scan_id) = progress_for_active_operation_test();
        let operation = pool_activate(Some(&progress), &scan_id, PoolKind::Discovery, ".")
            .expect("started discovery operation");

        let operations = progress.active_operations_oldest_first(&scan_id);
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].operation_id, operation);
        assert_eq!(operations[0].pool, "discovery");
        assert_eq!(operations[0].path, ".");

        pool_deactivate(Some(&progress), &scan_id, PoolKind::Discovery);
        assert!(progress.active_operations_oldest_first(&scan_id).is_empty());
    }

    #[test]
    fn scan_progress_reports_worker_pool_counters() {
        let root = test_root("scan-progress-pools");
        let location_root = root.join("location");
        std::fs::create_dir_all(location_root.join("nested")).unwrap();
        std::fs::write(location_root.join("one.txt"), b"one").unwrap();
        std::fs::write(location_root.join("nested/two.txt"), b"two").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let prepared = prepare_scan(&db, "test", Path::new("/")).unwrap();
        let scan_id = prepared.scan_id.clone();
        let progress = ScanProgressStore::default();
        progress.start(&prepared);
        let summary = run_prepared_scan(&db, prepared, Some(progress.clone())).unwrap();
        assert_eq!(summary.file_count, 2);

        let state = progress.get(&scan_id).unwrap();
        assert_eq!(state.pools.discovery.active, 0);
        assert_eq!(state.pools.metadata.active, 0);
        assert_eq!(state.pools.hashing.active, 0);
        assert!(state.pools.discovery.completed >= 3);
        assert!(state.pools.metadata.completed >= 3);
        assert_eq!(state.pools.hashing.completed, 2);
        assert_eq!(state.pools.hashing.failed, 0);
        assert!(state.active_operations.is_empty());
        assert!(progress.active_operations_oldest_first(&scan_id).is_empty());
    }

    #[test]
    fn scan_time_excludes_prune_the_walk_and_bake_into_the_scan() {
        let root = test_root("scan-time-excludes");
        let location_root = root.join("location");
        std::fs::create_dir_all(location_root.join("src")).unwrap();
        std::fs::create_dir_all(location_root.join("node_modules/pkg")).unwrap();
        std::fs::write(location_root.join("src/app.js"), b"keep").unwrap();
        std::fs::write(location_root.join("readme.md"), b"keep").unwrap();
        std::fs::write(location_root.join("node_modules/pkg/index.js"), b"skip").unwrap();
        std::fs::write(location_root.join("build.log"), b"skip").unwrap();

        let db = Database::open(root.join("state.db")).unwrap();
        db.add_location(LocationInput {
            kind: LocationType::Local,
            name: "Test".to_string(),
            slug: "test".to_string(),
            root_path: location_root,
            notes: None,
        })
        .unwrap();

        let prepared = prepare_scan(&db, "test", Path::new("/"))
            .unwrap()
            .with_scan_time_excludes(vec![
                "node_modules/".to_string(),
                "  ".to_string(), // dropped
                "*.log".to_string(),
            ]);
        let scan_id = prepared.scan_id.clone();
        let progress = ScanProgressStore::default();
        progress.start(&prepared);
        let summary = run_prepared_scan(&db, prepared, Some(progress)).unwrap();

        // Only src/app.js and readme.md are indexed; node_modules subtree and
        // build.log are pruned before hashing.
        assert_eq!(summary.file_count, 2, "excluded files must not be indexed");

        // The patterns are baked into the scan row (trimmed, empties dropped).
        let scan = db.scan_by_id(&scan_id).unwrap().unwrap();
        assert_eq!(scan.scan_time_excludes, vec!["node_modules/", "*.log"]);
    }

    fn progress_for_active_operation_test() -> (ScanProgressStore, String) {
        let scan_id = "active-operation-test".to_string();
        let progress = ScanProgressStore::default();
        progress.start(&PreparedScan {
            scan_id: scan_id.clone(),
            location: Location {
                id: "location".to_string(),
                slug: "test".to_string(),
                name: "Test".to_string(),
                kind: LocationType::Local,
                root_path: PathBuf::from("/tmp"),
                notes: None,
                representative_scan_id: None,
                disabled: false,
                created_at: "2026-07-15T00:00:00Z".to_string(),
            },
            scan_root: PathBuf::from("/tmp"),
            reuse_from_scan_id: None,
            reusable_files: HashMap::new(),
            seeded_paths: std::collections::HashSet::new(),
            seeded_file_count: 0,
            seeded_total_bytes: 0,
            hash_policy: HashPolicy::Full,
            hash_workers: None,
            metadata_workers: None,
            sparse_full_below: None,
            scan_time_excludes: Vec::new(),
        });
        (progress, scan_id)
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
