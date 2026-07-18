//! Performance gates for the scan/tree/delete/discovery hot paths.
//!
//! Recovered from the Codex session logs (see `agent-plans/plan-065`) and
//! adapted to the current backend surface. Gated behind the `perf-gates` cargo
//! feature so it is NOT part of the default `cargo test`; run with
//! `just perf-gates` (release, `--ignored`).
//!
//! Two gates from the original recovery are intentionally dropped because they
//! targeted APIs that do not exist in the current architecture:
//!   * the sync-vs-tokio `ScanRunnerKind` comparison — the scanner is a single
//!     sync `thread::scope` two-phase pipeline (plan-071), not two runners.
//!   * `Database::delete_check_scoped` — only `delete_check`/`delete_check_paths`
//!     exist; the plain-prefix gate below covers the delete-check hot path.

use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use file_census_backend::db::{Database, LocationInput, LocationType, NewFile};
use file_census_backend::search::{
    FileSearchExpression, FileSearchFilter, FileSearchOperator, FileSearchQuery, FileSearchTerm,
};
use file_census_backend::{media, scanner};

const DEFAULT_SYNTHETIC_FILES: usize = 4_000;

struct PerfFixture {
    db: Database,
    source_scan_id: String,
}

fn temp_root(name: &str) -> PathBuf {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("file-census-perf-{name}-{id}"))
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(default)
}

fn budget(name: &str, default_ms: u128) -> Duration {
    Duration::from_millis(
        std::env::var(name)
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(default_ms as u64),
    )
}

fn assert_under(label: &str, elapsed: Duration, budget: Duration) {
    assert!(
        elapsed <= budget,
        "{label} exceeded budget: elapsed={}ms budget={}ms",
        elapsed.as_millis(),
        budget.as_millis()
    );
    eprintln!(
        "perf-gate OK: {label} elapsed={}ms budget={}ms",
        elapsed.as_millis(),
        budget.as_millis()
    );
}

fn seed_perf_fixture(name: &str, file_count: usize) -> PerfFixture {
    let root = temp_root(name);
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

    let mut source_rows = Vec::with_capacity(file_count + 128);
    let mut copy_rows = Vec::with_capacity(file_count + 128);
    for folder in 0..64 {
        source_rows.push(test_dir(&source_scan_id, &format!("folder-{folder:03}")));
        copy_rows.push(test_dir(&copy_scan_id, &format!("folder-{folder:03}")));
        for sub in 0..4 {
            source_rows.push(test_dir(
                &source_scan_id,
                &format!("folder-{folder:03}/sub-{sub:02}"),
            ));
            copy_rows.push(test_dir(
                &copy_scan_id,
                &format!("folder-{folder:03}/sub-{sub:02}"),
            ));
        }
    }
    for index in 0..file_count {
        let folder = index % 64;
        let sub = index % 4;
        let path = format!("folder-{folder:03}/sub-{sub:02}/file-{index:06}.jpg");
        let hash = format!("hash-{index:06}");
        source_rows.push(test_file(&source_scan_id, &path, 1024 + index as u64, &hash));
        copy_rows.push(test_file(&copy_scan_id, &path, 1024 + index as u64, &hash));
    }

    db.insert_file_batch(&source_rows).unwrap();
    db.insert_file_batch(&copy_rows).unwrap();
    db.finish_scan(
        &source_scan_id,
        file_count as u64,
        (source_rows.len() - file_count) as u64,
        0,
        source_rows.iter().map(|row| row.size).sum(),
        "complete",
    )
    .unwrap();
    db.finish_scan(
        &copy_scan_id,
        file_count as u64,
        (copy_rows.len() - file_count) as u64,
        0,
        copy_rows.iter().map(|row| row.size).sum(),
        "complete",
    )
    .unwrap();
    db.set_representative_scan(&source_scan_id).unwrap();
    db.set_representative_scan(&copy_scan_id).unwrap();

    PerfFixture { db, source_scan_id }
}

fn test_file(scan_id: &str, path: &str, size: u64, hash: &str) -> NewFile {
    NewFile {
        scan_id: scan_id.to_string(),
        kind: "file".to_string(),
        path: path.to_string(),
        name: path.rsplit('/').next().unwrap_or(path).to_string(),
        size,
        blake3: hash.to_string(),
        blake3_light: hash.to_string(),
        sha256: hash.to_string(),
        ctime: None,
        mtime: None,
        mode: None,
        error: None,
    }
}

fn test_dir(scan_id: &str, path: &str) -> NewFile {
    NewFile {
        scan_id: scan_id.to_string(),
        kind: "dir".to_string(),
        path: path.to_string(),
        name: path.rsplit('/').next().unwrap_or(path).to_string(),
        size: 0,
        blake3: String::new(),
        blake3_light: String::new(),
        sha256: String::new(),
        ctime: None,
        mtime: None,
        mode: None,
        error: None,
    }
}

#[test]
#[ignore]
fn perf_gate_discovery_only_traversal_stays_under_budget() {
    let root = temp_root("discovery");
    let source = root.join("source");
    for index in 0..env_usize("FILE_CENSUS_PERF_DISCOVERY_FILES", 1_000) {
        let dir = source.join(format!("folder-{:03}", index % 32));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("file-{index:06}.txt")), b"x").unwrap();
    }

    let started = Instant::now();
    let stats = scanner::benchmark_discovery(&source, None, Some(4), None).unwrap();
    let elapsed = started.elapsed();

    assert_eq!(stats.errors, 0);
    assert_under(
        "discovery-only traversal",
        elapsed,
        budget("FILE_CENSUS_PERF_DISCOVERY_MS", 2_000),
    );
}

#[test]
#[ignore]
fn perf_gate_discovery_stop_latency_stays_under_budget() {
    let root = temp_root("discovery-stop");
    let source = root.join("source");
    for index in 0..env_usize("FILE_CENSUS_PERF_DISCOVERY_STOP_FILES", 1_000) {
        let dir = source.join(format!("folder-{:03}", index % 32));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("file-{index:06}.txt")), b"x").unwrap();
    }

    let stats = scanner::benchmark_discovery(&source, None, Some(4), Some(Duration::ZERO)).unwrap();

    assert!(stats.stop_requested);
    assert_under(
        "discovery stop latency",
        Duration::from_millis(stats.stop_latency_ms.unwrap_or(u64::MAX)),
        budget("FILE_CENSUS_PERF_DISCOVERY_STOP_MS", 250),
    );
}

#[test]
#[ignore]
fn perf_gate_scan_tree_root_page_stays_under_budget() {
    let fixture = seed_perf_fixture(
        "tree-root",
        env_usize("FILE_CENSUS_PERF_SYNTHETIC_FILES", DEFAULT_SYNTHETIC_FILES),
    );

    let started = Instant::now();
    let page = fixture
        .db
        .scan_tree_page(&fixture.source_scan_id, "", Some(500), 0, 1, None)
        .unwrap();
    let elapsed = started.elapsed();

    assert!(!page.entries.is_empty());
    assert_under(
        "scan tree root page",
        elapsed,
        budget("FILE_CENSUS_PERF_TREE_MS", 500),
    );
}

#[test]
#[ignore]
fn perf_gate_scan_tree_filtered_page_stays_under_budget() {
    let fixture = seed_perf_fixture(
        "tree-filtered",
        env_usize("FILE_CENSUS_PERF_SYNTHETIC_FILES", DEFAULT_SYNTHETIC_FILES),
    );
    let query = FileSearchQuery {
        filter: Some(FileSearchFilter {
            term: FileSearchTerm::Name,
            operator: FileSearchOperator::Substring,
            expression: FileSearchExpression::String("file-0001".to_string()),
        }),
        limit: None,
        offset: None,
        representative_only: None,
        scan_ids: None,
    };

    let started = Instant::now();
    let page = fixture
        .db
        .scan_tree_page(&fixture.source_scan_id, "", Some(500), 0, 0, Some(&query))
        .unwrap();
    let elapsed = started.elapsed();

    assert!(!page.entries.is_empty());
    assert_under(
        "filtered scan tree page",
        elapsed,
        budget("FILE_CENSUS_PERF_FILTERED_TREE_MS", 1_500),
    );
}

#[test]
#[ignore]
fn perf_gate_delete_check_plain_prefix_stays_under_budget() {
    let fixture = seed_perf_fixture(
        "delete-check-prefix",
        env_usize("FILE_CENSUS_PERF_SYNTHETIC_FILES", DEFAULT_SYNTHETIC_FILES),
    );

    let started = Instant::now();
    let result = fixture
        .db
        .delete_check(&fixture.source_scan_id, "folder-001")
        .unwrap();
    let elapsed = started.elapsed();

    assert!(result.safe);
    assert_under(
        "plain prefix delete check",
        elapsed,
        budget("FILE_CENSUS_PERF_DELETE_CHECK_MS", 750),
    );
}

#[test]
#[ignore]
fn perf_gate_file_extra_info_does_not_block_tree_or_delete_check_reads() {
    let fixture = seed_perf_fixture(
        "file-extra-info-non-wedge",
        env_usize("FILE_CENSUS_PERF_EXTRA_INFO_FILES", DEFAULT_SYNTHETIC_FILES),
    );
    let exif_db = fixture.db.clone();
    let exif_scan_id = fixture.source_scan_id.clone();
    let read_scan_id = fixture.source_scan_id.clone();
    let exif_handle = thread::spawn(move || media::enrich_scan_exif(&exif_db, &exif_scan_id));

    let started = Instant::now();
    let page = fixture
        .db
        .scan_tree_page(&read_scan_id, "", Some(500), 0, 1, None)
        .unwrap();
    let delete_check = fixture.db.delete_check(&read_scan_id, "folder-001").unwrap();
    let elapsed = started.elapsed();
    let exif_result = exif_handle.join().unwrap().unwrap();

    assert!(!page.entries.is_empty());
    assert!(delete_check.safe);
    // The synthetic fixture seeds DB rows without on-disk files, so every row
    // resolves to a terminal (unavailable/error) status rather than a decoded
    // one — assert only that enrichment actually iterated the scan's files
    // concurrently with the reads, which is what this gate exercises.
    assert!(
        exif_result.processed
            + exif_result.cached_ok
            + exif_result.skipped
            + exif_result.errors
            > 0
    );
    assert_under(
        "file extra info concurrent tree/delete-check reads",
        elapsed,
        budget("FILE_CENSUS_PERF_EXTRA_INFO_READS_MS", 1_500),
    );
}

#[test]
#[ignore]
fn perf_gate_scan_delete_large_scan_stays_under_budget() {
    let fixture = seed_perf_fixture(
        "delete-scan",
        env_usize("FILE_CENSUS_PERF_SYNTHETIC_FILES", DEFAULT_SYNTHETIC_FILES),
    );

    let started = Instant::now();
    let deleted = fixture.db.delete_scan(&fixture.source_scan_id).unwrap();
    let elapsed = started.elapsed();

    assert!(deleted);
    assert_under(
        "scan delete",
        elapsed,
        budget("FILE_CENSUS_PERF_SCAN_DELETE_MS", 2_000),
    );
}

#[test]
#[ignore]
fn perf_gate_location_delete_large_location_stays_under_budget() {
    let fixture = seed_perf_fixture(
        "delete-location",
        env_usize("FILE_CENSUS_PERF_SYNTHETIC_FILES", DEFAULT_SYNTHETIC_FILES),
    );

    let started = Instant::now();
    let deleted = fixture.db.delete_location("source").unwrap();
    let elapsed = started.elapsed();

    assert!(deleted);
    assert_under(
        "location delete",
        elapsed,
        budget("FILE_CENSUS_PERF_LOCATION_DELETE_MS", 2_500),
    );
}
