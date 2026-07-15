use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

fn file_census() -> Command {
    Command::new(env!("CARGO_BIN_EXE_file-census"))
}

fn temp_root(name: &str) -> PathBuf {
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("file-census-cli-{name}-{id}"))
}

fn run_json(args: &[&str]) -> Value {
    let output = file_census().args(args).output().unwrap();
    assert_success(output)
}

fn assert_success(output: Output) -> Value {
    assert!(
        output.status.success(),
        "command failed\nstatus: {}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error| {
        panic!(
            "stdout was not JSON: {error}\nstdout:\n{}",
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

fn db_path(root: &Path) -> PathBuf {
    root.join("state.sqlite")
}

#[test]
fn locations_add_and_list_support_json_output() {
    let root = temp_root("locations");
    let source = root.join("source");
    fs::create_dir_all(&source).unwrap();
    let db = db_path(&root);
    let db_arg = db.to_string_lossy().to_string();
    let source_arg = source.to_string_lossy().to_string();

    let added = run_json(&[
        "--db",
        &db_arg,
        "--json",
        "locations",
        "add",
        "local",
        "--name",
        "Smoke",
        "--slug",
        "local-smoke",
        "--path",
        &source_arg,
        "--notes",
        "fixture notes",
    ]);
    assert_eq!(added["slug"], "local-smoke");
    assert_eq!(added["name"], "Smoke");
    assert_eq!(added["notes"], "fixture notes");

    let locations = run_json(&["--db", &db_arg, "--json", "locations", "list"]);
    let locations = locations.as_array().expect("locations list is an array");
    assert_eq!(locations.len(), 1);
    assert_eq!(locations[0]["slug"], "local-smoke");
    assert_eq!(locations[0]["root_path"], source_arg);
}

#[test]
fn overview_supports_json_output() {
    let root = temp_root("overview");
    let source = root.join("source");
    fs::create_dir_all(&source).unwrap();
    let db = db_path(&root);
    let db_arg = db.to_string_lossy().to_string();
    let source_arg = source.to_string_lossy().to_string();

    run_json(&[
        "--db",
        &db_arg,
        "--json",
        "locations",
        "add",
        "local",
        "--name",
        "Overview",
        "--slug",
        "local-overview",
        "--path",
        &source_arg,
    ]);

    let overview = run_json(&["--db", &db_arg, "--json", "overview"]);
    assert_eq!(overview["location_count"], 1);
    assert_eq!(overview["scan_count"], 0);
    assert_eq!(overview["file_count"], 0);
}

#[test]
fn scans_start_runs_foreground_and_list_reports_completed_scan_as_json() {
    let root = temp_root("scan");
    let source = root.join("source");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("alpha.txt"), "same content\n").unwrap();
    fs::write(source.join("beta.txt"), "same content\n").unwrap();
    let db = db_path(&root);
    let db_arg = db.to_string_lossy().to_string();
    let source_arg = source.to_string_lossy().to_string();

    run_json(&[
        "--db",
        &db_arg,
        "--json",
        "locations",
        "add",
        "local",
        "--name",
        "Scan",
        "--slug",
        "local-scan",
        "--path",
        &source_arg,
    ]);

    let summary = run_json(&["--db", &db_arg, "--json", "scans", "start", "local-scan"]);
    assert_eq!(summary["status"], "complete");
    assert_eq!(summary["file_count"], 2);

    let scans = run_json(&["--db", &db_arg, "--json", "scans", "list"]);
    let scans = scans.as_array().expect("scans list is an array");
    assert_eq!(scans.len(), 1);
    assert_eq!(scans[0]["status"], "complete");
    assert_eq!(scans[0]["file_count"], 2);
}

#[test]
fn files_tree_delete_check_and_duplicates_support_json_output() {
    let root = temp_root("file-workflows");
    let source_a = root.join("source-a");
    let source_b = root.join("source-b");
    fs::create_dir_all(&source_a).unwrap();
    fs::create_dir_all(&source_b).unwrap();
    fs::write(source_a.join("shared.txt"), "same content\n").unwrap();
    fs::write(source_a.join("unique.txt"), "only here\n").unwrap();
    fs::write(source_b.join("shared.txt"), "same content\n").unwrap();
    let db = db_path(&root);
    let db_arg = db.to_string_lossy().to_string();
    let source_a_arg = source_a.to_string_lossy().to_string();
    let source_b_arg = source_b.to_string_lossy().to_string();

    run_json(&[
        "--db",
        &db_arg,
        "--json",
        "locations",
        "add",
        "local",
        "--name",
        "Source A",
        "--slug",
        "source-a",
        "--path",
        &source_a_arg,
    ]);
    run_json(&[
        "--db",
        &db_arg,
        "--json",
        "locations",
        "add",
        "local",
        "--name",
        "Source B",
        "--slug",
        "source-b",
        "--path",
        &source_b_arg,
    ]);
    let scan_a = run_json(&["--db", &db_arg, "--json", "scans", "start", "source-a"]);
    run_json(&["--db", &db_arg, "--json", "scans", "start", "source-b"]);
    let scan_a_id = scan_a["scan_id"].as_str().unwrap();

    let found = run_json(&["--db", &db_arg, "--json", "files", "find", "shared"]);
    assert_eq!(found.as_array().unwrap().len(), 2);

    let tree = run_json(&["--db", &db_arg, "--json", "scans", "tree", scan_a_id]);
    assert!(tree
        .as_array()
        .unwrap()
        .iter()
        .any(|entry| entry["path"] == "shared.txt"));

    let unsafe_check = run_json(&[
        "--db",
        &db_arg,
        "--json",
        "scans",
        "delete-check",
        scan_a_id,
        "--paths",
        "unique.txt",
    ]);
    assert_eq!(unsafe_check["safe"], false);
    assert_eq!(unsafe_check["missing_count"], 1);

    let duplicates = run_json(&["--db", &db_arg, "--json", "duplicates", "list"]);
    let duplicates = duplicates.as_array().unwrap();
    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0]["count"], 2);
}

#[test]
fn scan_management_commands_support_json_output() {
    let root = temp_root("scan-management");
    let source = root.join("source");
    fs::create_dir_all(&source).unwrap();
    fs::write(source.join("keep.txt"), "keep\n").unwrap();
    fs::write(source.join("delete-me.txt"), "remove\n").unwrap();
    let db = db_path(&root);
    let db_arg = db.to_string_lossy().to_string();
    let source_arg = source.to_string_lossy().to_string();

    run_json(&[
        "--db",
        &db_arg,
        "--json",
        "locations",
        "add",
        "local",
        "--name",
        "Managed",
        "--slug",
        "managed",
        "--path",
        &source_arg,
    ]);
    let scan = run_json(&["--db", &db_arg, "--json", "scans", "start", "managed"]);
    let scan_id = scan["scan_id"].as_str().unwrap();

    let noted = run_json(&[
        "--db",
        &db_arg,
        "--json",
        "scans",
        "notes",
        scan_id,
        "--notes",
        "known-good baseline",
    ]);
    assert_eq!(noted["notes"], "known-good baseline");

    let representative = run_json(&[
        "--db",
        &db_arg,
        "--json",
        "scans",
        "set-representative",
        scan_id,
    ]);
    assert_eq!(representative["is_representative"], true);

    let cleared = run_json(&[
        "--db",
        &db_arg,
        "--json",
        "scans",
        "clear-representative",
        scan_id,
    ]);
    assert_eq!(cleared["is_representative"], false);

    let excludes = run_json(&[
        "--db", &db_arg, "--json", "scans", "excludes", "set", scan_id, "*.tmp", "cache/",
    ]);
    assert_eq!(excludes.as_array().unwrap().len(), 2);
    let fetched_excludes = run_json(&[
        "--db", &db_arg, "--json", "scans", "excludes", "get", scan_id,
    ]);
    assert_eq!(fetched_excludes.as_array().unwrap().len(), 2);

    let deleted_path = run_json(&[
        "--db",
        &db_arg,
        "--json",
        "scans",
        "delete-path",
        scan_id,
        "delete-me.txt",
    ]);
    assert_eq!(deleted_path["deleted"], 1);
    let found_deleted = run_json(&["--db", &db_arg, "--json", "files", "find", "delete-me"]);
    assert_eq!(found_deleted.as_array().unwrap().len(), 0);

    let deleted_scan = run_json(&[
        "--db", &db_arg, "--json", "scans", "delete", scan_id, "--yes",
    ]);
    assert_eq!(deleted_scan["deleted"], true);
    let scans = run_json(&["--db", &db_arg, "--json", "scans", "list"]);
    assert_eq!(scans.as_array().unwrap().len(), 0);
}
