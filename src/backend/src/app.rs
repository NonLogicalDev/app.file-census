use std::path::{Path as FsPath, PathBuf};
use std::process::Command;
use std::sync::Arc;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::{
    Database, Location, LocationInput, LocationType, LocationUpdate,
};
use crate::events::{AppEvent, EventHub};
use crate::media;
use crate::scanner::{self, ScanProgressStore};
use crate::search::FileSearchQuery;

#[derive(Clone)]
pub struct AppCore {
    db: Arc<Database>,
    progress: ScanProgressStore,
    events: EventHub,
}

impl AppCore {
    pub fn open(db_path: PathBuf) -> Result<Self> {
        let events = EventHub::default();
        Ok(Self {
            db: Arc::new(Database::open(db_path)?),
            progress: ScanProgressStore::with_events(events.clone()),
            events,
        })
    }

    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<AppEvent> {
        self.events.subscribe()
    }

    pub async fn handle(&self, method: &str, params: Option<Value>) -> Result<Value> {
        match method {
            "overview.get" => Ok(serde_json::to_value(self.db.overview()?)?),
            "locations.list" => Ok(serde_json::to_value(locations_with_liveness(&self.db)?)?),
            "locations.open_folder" => {
                let params: LocationFolderParams = decode_params(params)?;
                let path = location_child_path(
                    &self.db,
                    &params.slug,
                    params.path.as_deref().unwrap_or(""),
                )?;
                open_in_system(&path)?;
                Ok(serde_json::json!({ "opened": true }))
            }
            "locations.add" => {
                let params: AddLocationRequest = decode_params(params)?;
                let location = self.db.add_location(LocationInput {
                    kind: params.kind,
                    name: params.name,
                    slug: params.slug,
                    root_path: params.root_path,
                    notes: params.notes,
                })?;
                self.events.emit("location_added", &location);
                Ok(serde_json::to_value(location)?)
            }
            "locations.update" => {
                let params: UpdateLocationRequest = decode_params(params)?;
                let location = self.db.update_location(
                    &params.slug,
                    LocationUpdate {
                        kind: params.kind,
                        name: params.name,
                        root_path: params.root_path,
                        notes: params.notes,
                    },
                )?;
                self.events.emit("location_updated", &location);
                Ok(serde_json::to_value(location)?)
            }
            "locations.delete" => {
                let params: LocationSlugParams = decode_params(params)?;
                let scan_ids = self.db.scan_ids_for_location(&params.slug)?;
                for scan_id in &scan_ids {
                    self.progress.remove(scan_id);
                }
                let deleted = self.db.delete_location(&params.slug)?;
                if deleted {
                    self.events.emit(
                        "location_deleted",
                        serde_json::json!({ "slug": params.slug, "scan_ids": scan_ids }),
                    );
                }
                Ok(serde_json::json!({ "deleted": deleted }))
            }
            "locations.set_disabled" => {
                let params: SetLocationDisabledParams = decode_params(params)?;
                let location = self
                    .db
                    .set_location_disabled(&params.slug, params.disabled)?;
                self.events.emit("location_updated", &location);
                Ok(serde_json::to_value(location)?)
            }
            "scans.list" => Ok(serde_json::to_value(self.db.scans()?)?),
            "scans.running" => Ok(serde_json::to_value(self.progress.running())?),
            "scans.open_folder" => {
                let params: ScanFolderParams = decode_params(params)?;
                let path = scan_folder_path(
                    &self.db,
                    &params.scan_id,
                    params.path.as_deref(),
                )?;
                open_in_system(&path)?;
                Ok(serde_json::json!({ "opened": true }))
            }
            "scans.start" => {
                let params: StartScanParams = decode_params(params)?;
                Ok(serde_json::to_value(
                    self.start_scan_job(
                        params.slug,
                        params.offset.unwrap_or_else(|| PathBuf::from("/")),
                    )
                    .await?,
                )?)
            }
            "scans.update" => {
                let params: ScanIdParams = decode_params(params)?;
                Ok(serde_json::to_value(
                    self.start_update_scan_job(params.scan_id).await?,
                )?)
            }
            "scans.progress" => {
                let params: ScanIdParams = decode_params(params)?;
                Ok(serde_json::to_value(self.progress.get(&params.scan_id))?)
            }
            "scans.stop" => {
                let params: ScanIdParams = decode_params(params)?;
                let requested = self.progress.stop(&params.scan_id);
                self.events.emit(
                    "scan_stop_requested",
                    serde_json::json!({ "scan_id": params.scan_id, "stop_requested": requested }),
                );
                Ok(serde_json::json!({ "stop_requested": requested }))
            }
            "scans.delete" => {
                let params: ScanIdParams = decode_params(params)?;
                self.progress.remove(&params.scan_id);
                let deleted = self.db.delete_scan(&params.scan_id)?;
                if deleted {
                    self.events.emit(
                        "scan_deleted",
                        serde_json::json!({ "scan_id": params.scan_id }),
                    );
                }
                Ok(serde_json::json!({ "deleted": deleted }))
            }
            "scans.delete_path" => {
                let params: DeleteScanPathParams = decode_params(params)?;
                let path = normalized_scan_path(&params.path)?;
                let deleted = self.db.delete_visible_scan_path(&params.scan_id, &path)?;
                if deleted > 0 {
                    self.events.emit(
                        "scan_path_deleted",
                        serde_json::json!({ "scan_id": params.scan_id, "path": path, "deleted": deleted }),
                    );
                }
                Ok(serde_json::json!({ "deleted": deleted }))
            }
            "scans.set_representative" => {
                let params: ScanIdParams = decode_params(params)?;
                let scan = self.db.set_representative_scan(&params.scan_id)?;
                self.events.emit("scan_representative_set", &scan);
                Ok(serde_json::to_value(scan)?)
            }
            "scans.clear_representative" => {
                let params: ScanIdParams = decode_params(params)?;
                let scan = self.db.clear_representative_scan(&params.scan_id)?;
                self.events.emit("scan_representative_set", &scan);
                Ok(serde_json::to_value(scan)?)
            }
            "scans.update_notes" => {
                let params: UpdateScanNotesRequest = decode_params(params)?;
                let scan = self.db.update_scan_notes(&params.scan_id, params.notes)?;
                self.events.emit("scan_notes_updated", &scan);
                Ok(serde_json::to_value(scan)?)
            }
            "scans.excludes.get" => {
                let params: ScanIdParams = decode_params(params)?;
                Ok(serde_json::to_value(self.db.scan_excludes(&params.scan_id)?)?)
            }
            "scans.excludes.set" => {
                let params: SetScanExcludesParams = decode_params(params)?;
                let excludes = self
                    .db
                    .set_scan_excludes(&params.scan_id, params.patterns)?;
                self.events.emit(
                    "scan_excludes_updated",
                    serde_json::json!({ "scan_id": params.scan_id }),
                );
                Ok(serde_json::to_value(excludes)?)
            }
            "scans.excludes.append_exact_path" => {
                let params: AppendExactScanExcludeParams = decode_params(params)?;
                let excludes = self
                    .db
                    .append_exact_scan_exclude(&params.scan_id, &params.path, &params.kind)?;
                self.events.emit(
                    "scan_excludes_updated",
                    serde_json::json!({ "scan_id": params.scan_id }),
                );
                Ok(serde_json::to_value(excludes)?)
            }
            "scans.delete_check" => {
                let params: DeleteCheckParams = decode_params(params)?;
                let result =
                    if let Some(paths) = params.paths.as_ref().filter(|paths| !paths.is_empty()) {
                        self.db.delete_check_paths(&params.scan_id, paths)?
                    } else {
                        self.db
                            .delete_check(&params.scan_id, params.path.as_deref().unwrap_or(""))?
                    };
                Ok(serde_json::to_value(result)?)
            }
            "scans.tree" => {
                let params: TreeRpcParams = decode_params(params)?;
                Ok(serde_json::to_value(self.db.scan_tree_page(
                    &params.scan_id,
                    params.path.as_deref().unwrap_or(""),
                    params.limit,
                    params.offset.unwrap_or(0),
                    params.depth.unwrap_or(1),
                    params.query.as_ref(),
                )?)?)
            }
            "files.find" => {
                let params: FindQuery = decode_params(params)?;
                Ok(serde_json::to_value(
                    self.db.find_files(&params.q, params.limit.unwrap_or(200))?,
                )?)
            }
            "files.search" => {
                let query: FileSearchQuery = decode_params(params)?;
                Ok(serde_json::to_value(self.db.search_files(&query)?)?)
            }
            "files.occurrences" => {
                let params: FileOccurrencesParams = decode_params(params)?;
                let page = self.db.visible_file_occurrences_page(
                    &params.scan_id,
                    &params.path,
                    &params.blake3,
                    params.size,
                    params.limit.unwrap_or(100).max(1),
                    params.offset.unwrap_or(0),
                )?;
                Ok(serde_json::to_value(page)?)
            }
            "files.details" => {
                let params: FileOccurrencesParams = decode_params(params)?;
                file_details_page(&self.db, &params)
            }
            "files.open" => {
                let params: FilePathActionParams = decode_params(params)?;
                let path = scan_child_path(&self.db, &params.scan_id, &params.path)?;
                open_in_system(&path)?;
                Ok(serde_json::json!({ "opened": true }))
            }
            "files.reveal" => {
                let params: FilePathActionParams = decode_params(params)?;
                let path = scan_child_path(&self.db, &params.scan_id, &params.path)?;
                reveal_in_system(&path)?;
                Ok(serde_json::json!({ "revealed": true }))
            }
            "dupes.list" => {
                let params: LimitQuery = decode_params(params).unwrap_or(LimitQuery {
                    limit: Some(100),
                    scan_ids: Vec::new(),
                });
                Ok(serde_json::to_value(
                    self.db.duplicate_groups_for_scans(
                        params.limit.unwrap_or(100),
                        &params.scan_ids,
                    )?,
                )?)
            }
            "thumbnails.build" => {
                let params: BuildThumbnailsParams = decode_params(params)?;
                let path = params.path.as_deref().unwrap_or("");
                let result =
                    if let Some(paths) = params.paths.as_ref().filter(|paths| !paths.is_empty()) {
                        media::build_thumbnails_for_paths(
                            &self.db,
                            &params.scan_id,
                            paths,
                            path,
                            params.recursive,
                        )?
                    } else {
                        media::build_thumbnails(&self.db, &params.scan_id, path, params.recursive)?
                    };
                self.events.emit("thumbnails_built", &result);
                Ok(serde_json::to_value(result)?)
            }
            _ => anyhow::bail!("method not found"),
        }
    }

    async fn start_scan_job(
        &self,
        slug: String,
        offset: PathBuf,
    ) -> Result<ScanStartedResponse<'static>> {
        let prepared = scanner::prepare_scan(&self.db, &slug, &offset)?;
        self.run_prepared_scan(prepared, None).await
    }

    async fn start_update_scan_job(
        &self,
        source_scan_id: String,
    ) -> Result<ScanStartedResponse<'static>> {
        let prepared = scanner::prepare_update_scan(&self.db, &source_scan_id)?;
        let source_scan_id_for_event = source_scan_id.clone();
        self.run_prepared_scan(prepared, Some(source_scan_id_for_event))
            .await
    }

    async fn run_prepared_scan(
        &self,
        prepared: scanner::PreparedScan,
        source_scan_id: Option<String>,
    ) -> Result<ScanStartedResponse<'static>> {
        let scan_id = prepared.scan_id.clone();
        self.progress.start(&prepared);
        if let Some(source_scan_id) = source_scan_id {
            self.events.emit(
                "scan_update_started",
                serde_json::json!({ "scan_id": scan_id, "source_scan_id": source_scan_id }),
            );
        }

        let db = (*self.db).clone();
        let progress = self.progress.clone();
        let scan_id_for_task = scan_id.clone();
        tokio::task::spawn_blocking(move || {
            match scanner::run_prepared_scan(&db, prepared, Some(progress.clone())) {
                Ok(summary) if summary.status == "stopped" => progress.stopped(&summary.scan_id),
                Ok(summary) => progress.finish(&summary),
                Err(error) => progress.fail(&scan_id_for_task, error.to_string()),
            }
        });

        Ok(ScanStartedResponse {
            scan_id,
            status: "running",
        })
    }
}

#[derive(Serialize)]
pub struct LocationView {
    #[serde(flatten)]
    location: Location,
    connected: bool,
    liveness_checked_at: String,
    liveness_error: Option<String>,
}

pub fn locations_with_liveness(db: &Database) -> Result<Vec<LocationView>> {
    Ok(db
        .locations()?
        .into_iter()
        .map(location_with_liveness)
        .collect())
}

fn location_with_liveness(location: Location) -> LocationView {
    let liveness_checked_at = chrono::Utc::now().to_rfc3339();
    let liveness = match std::fs::metadata(&location.root_path) {
        Ok(metadata) if metadata.is_dir() => Ok(()),
        Ok(_) => Err("path is not a folder".to_string()),
        Err(error) => Err(error.to_string()),
    };
    LocationView {
        location,
        connected: liveness.is_ok(),
        liveness_checked_at,
        liveness_error: liveness.err(),
    }
}

fn decode_params<T: for<'de> Deserialize<'de>>(params: Option<Value>) -> Result<T> {
    Ok(serde_json::from_value(
        params.unwrap_or_else(|| serde_json::json!({})),
    )?)
}

fn location_child_path(db: &Database, slug: &str, relative_path: &str) -> Result<PathBuf> {
    let location = db
        .location_by_slug(slug)?
        .with_context(|| format!("location not found: {slug}"))?;
    Ok(location.root_path.join(clean_relative_path(relative_path)))
}

fn scan_child_path(db: &Database, scan_id: &str, relative_path: &str) -> Result<PathBuf> {
    Ok(db
        .resolve_visible_scan_action_target(scan_id, relative_path)?
        .filesystem_path)
}

fn scan_folder_path(
    db: &Database,
    scan_id: &str,
    relative_path: Option<&str>,
) -> Result<PathBuf> {
    let relative_path = normalized_scan_folder_path(relative_path)?;
    if relative_path.is_empty() {
        return scan_root_path(db, scan_id);
    }

    let target = db.resolve_visible_scan_action_target(scan_id, &relative_path)?;
    if target.kind != "dir" {
        anyhow::bail!("scan folder path must be a visible directory")
    }

    Ok(target.filesystem_path)
}

fn scan_root_path(db: &Database, scan_id: &str) -> Result<PathBuf> {
    let scan = db
        .scan_by_id(scan_id)?
        .with_context(|| format!("scan not found: {scan_id}"))?;
    let location = db
        .location_by_slug(&scan.location_slug)?
        .with_context(|| format!("location not found: {}", scan.location_slug))?;
    Ok(location
        .root_path
        .join(normalized_scan_offset_path(&scan.offset_path)?))
}

fn normalized_scan_path(path: &str) -> Result<String> {
    let path = normalized_relative_scan_path(path, "scan path")?;
    if path.is_empty() {
        anyhow::bail!("path must not be the scan root")
    }
    Ok(path)
}

fn normalized_scan_folder_path(path: Option<&str>) -> Result<String> {
    match path {
        Some(path) => normalized_relative_scan_path(path, "scan folder path"),
        None => Ok(String::new()),
    }
}

fn file_details_page(db: &Database, params: &FileOccurrencesParams) -> Result<Value> {
    let page = db.visible_file_occurrences_page(
        &params.scan_id,
        &params.path,
        &params.blake3,
        params.size,
        params.limit.unwrap_or(100).max(1),
        params.offset.unwrap_or(0),
    )?;
    let details = media::file_details_from_visible_occurrences(db, &page.occurrences)?;
    let mut response = serde_json::to_value(details)?;
    let object = response
        .as_object_mut()
        .context("serializing file details response")?;
    object.insert("occurrence_count".to_string(), Value::from(page.total));
    object.insert("occurrence_limit".to_string(), Value::from(page.limit));
    object.insert("occurrence_offset".to_string(), Value::from(page.offset));
    object.insert(
        "occurrences_truncated".to_string(),
        Value::from(page.has_more),
    );
    object.insert(
        "occurrence_next_offset".to_string(),
        serde_json::to_value(page.next_offset)?,
    );
    Ok(response)
}

fn clean_relative_path(path: &str) -> PathBuf {
    path.trim_start_matches('/')
        .split('/')
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .collect()
}

/// Normalizes an untrusted scan-relative path without allowing a caller to
/// change its target through `.`/`..` cleanup. Both separators are parsed so
/// Windows-form paths cannot regain traversal semantics after validation.
fn normalized_relative_scan_path(path: &str, label: &str) -> Result<String> {
    let mut prefix = path.chars();
    if prefix.next().map_or(false, is_path_separator)
        && prefix.next().map_or(false, is_path_separator)
    {
        anyhow::bail!("{label} may not contain a UNC or device prefix")
    }

    let mut normalized = Vec::new();
    for part in path.split(is_path_separator) {
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

fn is_path_separator(character: char) -> bool {
    character == '/' || character == '\\'
}

fn looks_like_windows_drive_prefix(part: &str) -> bool {
    let bytes = part.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// Converts the persisted scan offset into a location-relative action root.
///
/// Indexed file paths are already relative to this root, so actions must not
/// resolve them directly from the enclosing location. Stored traversal is
/// rejected rather than silently rewritten before an OS action is launched.
fn normalized_scan_offset_path(offset_path: &str) -> Result<PathBuf> {
    Ok(PathBuf::from(normalized_relative_scan_path(
        offset_path,
        "scan offset path",
    )?))
}

#[cfg(test)]
thread_local! {
    static TEST_SYSTEM_ACTIONS: std::cell::RefCell<Vec<(String, PathBuf)>> =
        std::cell::RefCell::new(Vec::new());
}

#[cfg(test)]
fn record_test_system_action(kind: &str, path: &FsPath) {
    TEST_SYSTEM_ACTIONS.with(|actions| {
        actions
            .borrow_mut()
            .push((kind.to_string(), path.to_path_buf()));
    });
}

#[cfg(test)]
fn take_test_system_actions() -> Vec<(String, PathBuf)> {
    TEST_SYSTEM_ACTIONS.with(|actions| std::mem::take(&mut *actions.borrow_mut()))
}

#[cfg(test)]
fn open_in_system(path: &FsPath) -> Result<()> {
    record_test_system_action("open", path);
    Ok(())
}

#[cfg(not(test))]
fn open_in_system(path: &FsPath) -> Result<()> {
    open::that(path).with_context(|| format!("opening {}", path.display()))
}

#[cfg(test)]
fn reveal_in_system(path: &FsPath) -> Result<()> {
    record_test_system_action("reveal", path);
    Ok(())
}

#[cfg(not(test))]
fn reveal_in_system(path: &FsPath) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .status()
            .with_context(|| format!("revealing {}", path.display()))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .status()
            .with_context(|| format!("revealing {}", path.display()))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let folder = if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        };
        open::that(folder).with_context(|| format!("revealing {}", path.display()))
    }
}

#[derive(Serialize)]
struct ScanStartedResponse<'a> {
    scan_id: String,
    status: &'a str,
}

#[derive(Deserialize)]
struct AddLocationRequest {
    kind: LocationType,
    name: String,
    slug: String,
    root_path: PathBuf,
    notes: Option<String>,
}
#[derive(Deserialize)]
struct UpdateLocationRequest {
    slug: String,
    kind: LocationType,
    name: String,
    root_path: PathBuf,
    notes: Option<String>,
}
#[derive(Deserialize)]
struct LocationFolderParams {
    slug: String,
    path: Option<String>,
}
#[derive(Deserialize)]
struct ScanFolderParams {
    scan_id: String,
    path: Option<String>,
}
#[derive(Deserialize)]
struct LocationSlugParams {
    slug: String,
}
#[derive(Deserialize)]
struct SetLocationDisabledParams {
    slug: String,
    disabled: bool,
}
#[derive(Deserialize)]
struct StartScanParams {
    slug: String,
    offset: Option<PathBuf>,
}
#[derive(Deserialize)]
struct ScanIdParams {
    scan_id: String,
}
#[derive(Deserialize)]
struct UpdateScanNotesRequest {
    scan_id: String,
    notes: Option<String>,
}

#[derive(Deserialize)]
struct SetScanExcludesParams {
    scan_id: String,
    patterns: Vec<String>,
}

#[derive(Deserialize)]
struct AppendExactScanExcludeParams {
    scan_id: String,
    path: String,
    kind: String,
}

#[derive(Deserialize)]
struct DeleteScanPathParams {
    scan_id: String,
    path: String,
}
#[derive(Deserialize)]
struct DeleteCheckParams {
    scan_id: String,
    path: Option<String>,
    paths: Option<Vec<String>>,
}
#[derive(Deserialize)]
struct TreeRpcParams {
    scan_id: String,
    path: Option<String>,
    depth: Option<u32>,
    limit: Option<u32>,
    offset: Option<u32>,
    query: Option<FileSearchQuery>,
}
#[derive(Deserialize)]
struct FindQuery {
    q: String,
    limit: Option<u32>,
}
#[derive(Deserialize)]
struct FileOccurrencesParams {
    scan_id: String,
    path: String,
    blake3: String,
    size: u64,
    limit: Option<u32>,
    offset: Option<u64>,
}
#[derive(Deserialize)]
struct FilePathActionParams {
    scan_id: String,
    path: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::NewFile;

    #[test]
    fn scan_action_path_keeps_indexed_entry_under_nested_offset() {
        let location_root = PathBuf::from("location-root");
        let scan_root = location_root
            .join(normalized_scan_offset_path("/nested/album").unwrap());

        assert_eq!(
            scan_root,
            PathBuf::from("location-root/nested/album")
        );
        assert_eq!(
            scan_root.join(PathBuf::from(normalized_scan_path("cover.jpg").unwrap())),
            PathBuf::from("location-root/nested/album/cover.jpg")
        );
    }

    #[test]
    fn scan_folder_path_permits_root_and_normalizes_relative_path() {
        assert_eq!(normalized_scan_folder_path(None).unwrap(), "");
        assert_eq!(normalized_scan_folder_path(Some("")).unwrap(), "");
        assert_eq!(normalized_scan_folder_path(Some("/")).unwrap(), "");
        assert_eq!(
            normalized_scan_folder_path(Some(r"/nested\album/")).unwrap(),
            "nested/album"
        );
    }

    #[test]
    fn scan_folder_path_uses_scan_root_and_visible_directories_only() {
        let root = std::env::temp_dir().join(format!(
            "file-census-app-folder-path-{}",
            uuid::Uuid::new_v4()
        ));
        let location_root = root.join("location-root");
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
            .start_scan(&location, std::path::Path::new("/nested/album"))
            .unwrap();
        let entry = |kind: &str, path: &str| NewFile {
            scan_id: scan_id.clone(),
            kind: kind.to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            size: 0,
            blake3: String::new(),
            sha256: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        };
        db.insert_file_batch(&[
            entry("dir", "visible-dir"),
            entry("file", "visible-file.txt"),
            entry("dir", "hidden-dir"),
        ])
        .unwrap();
        db.set_scan_excludes(&scan_id, vec!["/hidden-dir/".to_string()])
            .unwrap();

        let scan_root = location_root.join("nested/album");
        assert_eq!(scan_folder_path(&db, &scan_id, None).unwrap(), scan_root);
        assert_eq!(
            scan_folder_path(&db, &scan_id, Some("visible-dir")).unwrap(),
            location_root.join("nested/album/visible-dir")
        );
        assert_eq!(
            scan_child_path(&db, &scan_id, "visible-file.txt").unwrap(),
            location_root.join("nested/album/visible-file.txt")
        );
        assert!(scan_folder_path(&db, &scan_id, Some("visible-file.txt")).is_err());
        assert!(scan_folder_path(&db, &scan_id, Some("hidden-dir")).is_err());
        assert!(scan_child_path(&db, &scan_id, "hidden-dir").is_err());

        let _ = std::fs::remove_dir_all(root);
    }

    fn scan_action_fixture(prefix: &str) -> (PathBuf, PathBuf, String) {
        let root = std::env::temp_dir().join(format!(
            "file-census-{prefix}-{}",
            uuid::Uuid::new_v4()
        ));
        let location_root = root.join("location-root");
        let scan_root = location_root.join("nested/album");
        std::fs::create_dir_all(scan_root.join("visible-dir")).unwrap();
        std::fs::create_dir_all(scan_root.join("excluded-dir")).unwrap();
        std::fs::write(scan_root.join("visible-file.txt"), "visible").unwrap();
        std::fs::write(scan_root.join("excluded-file.txt"), "excluded").unwrap();

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
            .start_scan(&location, std::path::Path::new("/nested/album"))
            .unwrap();
        let entry = |kind: &str, path: &str| NewFile {
            scan_id: scan_id.clone(),
            kind: kind.to_string(),
            path: path.to_string(),
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            size: 0,
            blake3: String::new(),
            sha256: String::new(),
            ctime: None,
            mtime: None,
            mode: None,
            error: None,
        };
        db.insert_file_batch(&[
            entry("file", "visible-file.txt"),
            entry("dir", "visible-dir"),
            entry("file", "excluded-file.txt"),
            entry("dir", "excluded-dir"),
        ])
        .unwrap();
        db.set_scan_excludes(
            &scan_id,
            vec!["/excluded-file.txt".to_string(), "/excluded-dir/".to_string()],
        )
        .unwrap();

        (root, location_root, scan_id)
    }

    #[tokio::test]
    async fn native_rpc_scan_actions_enforce_visible_offset_scope() {
        let (root, location_root, scan_id) = scan_action_fixture("app-action-rpc");
        let app = AppCore::open(root.join("state.db")).unwrap();
        let action_root = location_root.join("nested/album");

        assert_eq!(
            app.handle(
                "files.open",
                Some(serde_json::json!({
                    "scan_id": scan_id.clone(),
                    "path": "visible-file.txt"
                })),
            )
            .await
            .unwrap(),
            serde_json::json!({ "opened": true })
        );
        assert_eq!(
            app.handle(
                "files.reveal",
                Some(serde_json::json!({
                    "scan_id": scan_id.clone(),
                    "path": "visible-file.txt"
                })),
            )
            .await
            .unwrap(),
            serde_json::json!({ "revealed": true })
        );
        assert_eq!(
            app.handle(
                "scans.open_folder",
                Some(serde_json::json!({
                    "scan_id": scan_id.clone(),
                    "path": "visible-dir"
                })),
            )
            .await
            .unwrap(),
            serde_json::json!({ "opened": true })
        );
        assert_eq!(
            take_test_system_actions(),
            vec![
                ("open".to_string(), action_root.join("visible-file.txt")),
                ("reveal".to_string(), action_root.join("visible-file.txt")),
                ("open".to_string(), action_root.join("visible-dir")),
            ]
        );

        for (method, params) in [
            (
                "files.open",
                serde_json::json!({ "scan_id": scan_id.clone(), "path": "excluded-file.txt" }),
            ),
            (
                "files.reveal",
                serde_json::json!({ "scan_id": scan_id.clone(), "path": "excluded-file.txt" }),
            ),
            (
                "scans.open_folder",
                serde_json::json!({ "scan_id": scan_id.clone(), "path": "excluded-dir" }),
            ),
        ] {
            let error = app.handle(method, Some(params)).await.unwrap_err();
            assert!(
                error.to_string().contains("not found or excluded"),
                "{method}: {error:#}"
            );
        }
        assert!(take_test_system_actions().is_empty());

        drop(app);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn scan_path_rejects_traversal_with_any_separator() {
        for path in [
            "../x",
            "nested/../elsewhere",
            r"..\x",
            r"nested\..\elsewhere",
            r"nested/..\elsewhere",
            r"C:\elsewhere",
            "C:relative",
            "nested/C:relative",
            "//server/share",
            r"\\server\share",
            r"\\?\C:\elsewhere",
        ] {
            assert!(normalized_scan_path(path).is_err(), "{path}");
            assert!(normalized_scan_folder_path(Some(path)).is_err(), "{path}");
        }
        assert_eq!(
            normalized_scan_path(r"nested\cover.jpg").unwrap(),
            "nested/cover.jpg"
        );
    }

    #[test]
    fn scan_offset_rejects_traversal_with_any_separator() {
        for offset in [
            "nested/../elsewhere",
            r"nested\..\elsewhere",
            r"nested/..\elsewhere",
            r"C:\elsewhere",
            "C:relative",
            "nested/C:relative",
            "//server/share",
            r"\\server\share",
            r"\\?\C:\elsewhere",
        ] {
            assert!(normalized_scan_offset_path(offset).is_err(), "{offset}");
        }
        assert_eq!(
            normalized_scan_offset_path(r"\nested\album").unwrap(),
            PathBuf::from("nested/album")
        );
    }
}
#[derive(Deserialize)]
struct BuildThumbnailsParams {
    scan_id: String,
    path: Option<String>,
    paths: Option<Vec<String>>,
    recursive: bool,
}
#[derive(Deserialize)]
struct LimitQuery {
    limit: Option<u32>,
    #[serde(default)]
    scan_ids: Vec<String>,
}
