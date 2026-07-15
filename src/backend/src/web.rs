use std::net::SocketAddr;
use std::path::{Path as FsPath, PathBuf};
use std::process::Command;
use std::sync::Arc;

use anyhow::{Context, Result};
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_http::trace::TraceLayer;

use crate::db::{
    Database, Location, LocationInput, LocationType, LocationUpdate,
};
use crate::events::{recv_app_event_tolerating_lag, EventHub};
use crate::media;
use crate::scanner::{self, ScanProgressStore};
use crate::search::FileSearchQuery;

#[derive(RustEmbed)]
#[folder = "../../ui/dist/"]
struct Assets;

#[derive(Clone)]
struct AppState {
    db: Arc<Database>,
    progress: ScanProgressStore,
    events: EventHub,
}

pub async fn serve(db_path: PathBuf, addr: SocketAddr) -> Result<()> {
    let listener = tokio::net::TcpListener::bind(addr).await?;
    serve_listener(db_path, listener).await
}

pub async fn serve_listener(db_path: PathBuf, listener: tokio::net::TcpListener) -> Result<()> {
    let events = EventHub::default();
    let state = AppState {
        db: Arc::new(Database::open(db_path)?),
        progress: ScanProgressStore::with_events(events.clone()),
        events,
    };

    let app = Router::new()
        .route("/api/events", get(events_ws))
        .route("/api/overview", get(overview))
        .route("/api/locations", get(locations).post(add_location))
        .route("/api/locations/:slug/scan", post(scan_location))
        .route("/api/scans/running", get(running_scans))
        .route("/api/scans/:id/progress", get(scan_progress))
        .route("/api/scans/:id/stop", post(stop_scan))
        .route("/api/scans/:id/files", get(scan_files))
        .route("/api/scans/:id/tree", get(scan_tree))
        .route("/api/scans/:id", delete(delete_scan))
        .route("/api/scans", get(scans))
        .route("/api/find", get(find))
        .route("/api/dupes", get(dupes))
        .fallback(static_handler)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    axum::serve(listener, app).await?;
    Ok(())
}

async fn overview(State(state): State<AppState>) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(state.db.overview()?))
}

async fn locations(State(state): State<AppState>) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(locations_with_liveness(&state.db)?))
}

async fn events_ws(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| events_socket(socket, state))
}

async fn events_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let hello = json_rpc_event("connected", serde_json::json!({}));
    if sender.send(Message::Text(hello.to_string())).await.is_err() {
        return;
    }
    let mut rx = state.events.subscribe();
    loop {
        tokio::select! {
            event = recv_app_event_tolerating_lag(&mut rx) => {
                let Some(event) = event else { break; };
                let notification = json_rpc_event(event.kind, event.payload);
                if sender.send(Message::Text(notification.to_string())).await.is_err() {
                    break;
                }
            }
            message = receiver.next() => {
                let Some(Ok(message)) = message else { break; };
                let Message::Text(text) = message else { continue; };
                let response = match serde_json::from_str::<RpcRequest>(&text) {
                    Ok(request) => handle_rpc(state.clone(), request).await,
                    Err(error) => json_rpc_error(Value::Null, -32700, error.to_string()),
                };
                if sender.send(Message::Text(response.to_string())).await.is_err() {
                    break;
                }
            }
        }
    }
}

#[derive(Deserialize)]
struct RpcRequest {
    jsonrpc: Option<String>,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

async fn handle_rpc(state: AppState, request: RpcRequest) -> Value {
    let id = request.id.unwrap_or(Value::Null);
    if request.jsonrpc.as_deref() != Some("2.0") {
        return json_rpc_error(id, -32600, "expected jsonrpc 2.0");
    }
    let result = handle_rpc_result(state, &request.method, request.params).await;
    match result {
        Ok(value) => serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": value }),
        Err(error) => json_rpc_error(id, -32000, error.to_string()),
    }
}

async fn handle_rpc_result(
    state: AppState,
    method: &str,
    params: Option<Value>,
) -> anyhow::Result<Value> {
    match method {
        "overview.get" => Ok(serde_json::to_value(state.db.overview()?)?),
        "locations.list" => Ok(serde_json::to_value(locations_with_liveness(&state.db)?)?),
        "locations.open_folder" => {
            let params: LocationFolderParams = decode_params(params)?;
            let path = location_child_path(
                &state.db,
                &params.slug,
                params.path.as_deref().unwrap_or(""),
            )?;
            open_in_system(&path)?;
            Ok(serde_json::json!({ "opened": true }))
        }
        "locations.add" => {
            let params: AddLocationRequest = decode_params(params)?;
            let location = state.db.add_location(LocationInput {
                kind: params.kind,
                name: params.name,
                slug: params.slug,
                root_path: params.root_path,
                notes: params.notes,
            })?;
            state.events.emit("location_added", &location);
            Ok(serde_json::to_value(location)?)
        }
        "locations.update" => {
            let params: UpdateLocationRequest = decode_params(params)?;
            let location = state.db.update_location(
                &params.slug,
                LocationUpdate {
                    kind: params.kind,
                    name: params.name,
                    root_path: params.root_path,
                    notes: params.notes,
                },
            )?;
            state.events.emit("location_updated", &location);
            Ok(serde_json::to_value(location)?)
        }
        "locations.delete" => {
            let params: LocationSlugParams = decode_params(params)?;
            let scan_ids = state.db.scan_ids_for_location(&params.slug)?;
            for scan_id in &scan_ids {
                state.progress.remove(scan_id);
            }
            let deleted = state.db.delete_location(&params.slug)?;
            if deleted {
                state.events.emit(
                    "location_deleted",
                    serde_json::json!({
                        "slug": params.slug,
                        "scan_ids": scan_ids,
                    }),
                );
            }
            Ok(serde_json::json!({ "deleted": deleted }))
        }
        "locations.set_disabled" => {
            let params: SetLocationDisabledParams = decode_params(params)?;
            let location = state
                .db
                .set_location_disabled(&params.slug, params.disabled)?;
            state.events.emit("location_updated", &location);
            Ok(serde_json::to_value(location)?)
        }
        "scans.list" => Ok(serde_json::to_value(state.db.scans()?)?),
        "scans.running" => Ok(serde_json::to_value(state.progress.running())?),
        "scans.open_folder" => {
            let params: ScanFolderParams = decode_params(params)?;
            let path = scan_folder_path(
                &state.db,
                &params.scan_id,
                params.path.as_deref(),
            )?;
            open_in_system(&path)?;
            Ok(serde_json::json!({ "opened": true }))
        }
        "scans.start" => {
            let params: StartScanParams = decode_params(params)?;
            Ok(serde_json::to_value(
                start_scan_job(
                    state,
                    params.slug,
                    params.offset.unwrap_or_else(|| PathBuf::from("/")),
                )
                .await?,
            )?)
        }
        "scans.update" => {
            let params: ScanIdParams = decode_params(params)?;
            Ok(serde_json::to_value(
                start_update_scan_job(state, params.scan_id).await?,
            )?)
        }
        "scans.progress" => {
            let params: ScanIdParams = decode_params(params)?;
            Ok(serde_json::to_value(state.progress.get(&params.scan_id))?)
        }
        "scans.stop" => {
            let params: ScanIdParams = decode_params(params)?;
            let requested = state.progress.stop(&params.scan_id);
            state.events.emit(
                "scan_stop_requested",
                serde_json::json!({
                    "scan_id": params.scan_id,
                    "stop_requested": requested,
                }),
            );
            Ok(serde_json::json!({ "stop_requested": requested }))
        }
        "scans.delete" => {
            let params: ScanIdParams = decode_params(params)?;
            state.progress.remove(&params.scan_id);
            let deleted = state.db.delete_scan(&params.scan_id)?;
            if deleted {
                state.events.emit(
                    "scan_deleted",
                    serde_json::json!({ "scan_id": params.scan_id }),
                );
            }
            Ok(serde_json::json!({ "deleted": deleted }))
        }
        "scans.delete_path" => {
            let params: DeleteScanPathParams = decode_params(params)?;
            let path = normalized_scan_path(&params.path)?;
            let deleted = state
                .db
                .delete_visible_scan_path(&params.scan_id, &path)?;
            if deleted > 0 {
                state.events.emit(
                    "scan_path_deleted",
                    serde_json::json!({
                        "scan_id": params.scan_id,
                        "path": path,
                        "deleted": deleted,
                    }),
                );
            }
            Ok(serde_json::json!({ "deleted": deleted }))
        }
        "scans.set_representative" => {
            let params: ScanIdParams = decode_params(params)?;
            let scan = state.db.set_representative_scan(&params.scan_id)?;
            state.events.emit("scan_representative_set", &scan);
            Ok(serde_json::to_value(scan)?)
        }
        "scans.clear_representative" => {
            let params: ScanIdParams = decode_params(params)?;
            let scan = state.db.clear_representative_scan(&params.scan_id)?;
            state.events.emit("scan_representative_set", &scan);
            Ok(serde_json::to_value(scan)?)
        }
        "scans.update_notes" => {
            let params: UpdateScanNotesRequest = decode_params(params)?;
            let scan = state.db.update_scan_notes(&params.scan_id, params.notes)?;
            state.events.emit("scan_notes_updated", &scan);
            Ok(serde_json::to_value(scan)?)
        }
        "scans.excludes.get" => {
            let params: ScanIdParams = decode_params(params)?;
            Ok(serde_json::to_value(state.db.scan_excludes(&params.scan_id)?)?)
        }
        "scans.excludes.set" => {
            let params: SetScanExcludesParams = decode_params(params)?;
            let excludes = state
                .db
                .set_scan_excludes(&params.scan_id, params.patterns)?;
            state.events.emit(
                "scan_excludes_updated",
                serde_json::json!({ "scan_id": params.scan_id }),
            );
            Ok(serde_json::to_value(excludes)?)
        }
        "scans.excludes.append_exact_path" => {
            let params: AppendExactScanExcludeParams = decode_params(params)?;
            let excludes = state
                .db
                .append_exact_scan_exclude(&params.scan_id, &params.path, &params.kind)?;
            state.events.emit(
                "scan_excludes_updated",
                serde_json::json!({ "scan_id": params.scan_id }),
            );
            Ok(serde_json::to_value(excludes)?)
        }
        "scans.delete_check" => {
            let params: DeleteCheckParams = decode_params(params)?;
            let result =
                if let Some(paths) = params.paths.as_ref().filter(|paths| !paths.is_empty()) {
                    state.db.delete_check_paths(&params.scan_id, paths)?
                } else {
                    state
                        .db
                        .delete_check(&params.scan_id, params.path.as_deref().unwrap_or(""))?
                };
            Ok(serde_json::to_value(result)?)
        }
        "scans.tree" => {
            let params: TreeRpcParams = decode_params(params)?;
            Ok(serde_json::to_value(state.db.scan_tree_page(
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
                state
                    .db
                    .find_files(&params.q, params.limit.unwrap_or(200))?,
            )?)
        }
        "files.search" => {
            let query: FileSearchQuery = decode_params(params)?;
            Ok(serde_json::to_value(state.db.search_files(&query)?)?)
        }
        "files.occurrences" => {
            let params: FileOccurrencesParams = decode_params(params)?;
            let page = state.db.visible_file_occurrences_page(
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
            file_details_page(&state.db, &params)
        }
        "files.open" => {
            let params: FilePathActionParams = decode_params(params)?;
            let path = scan_child_path(&state.db, &params.scan_id, &params.path)?;
            open_in_system(&path)?;
            Ok(serde_json::json!({ "opened": true }))
        }
        "files.reveal" => {
            let params: FilePathActionParams = decode_params(params)?;
            let path = scan_child_path(&state.db, &params.scan_id, &params.path)?;
            reveal_in_system(&path)?;
            Ok(serde_json::json!({ "revealed": true }))
        }
        "dupes.list" => {
            let params: LimitQuery = decode_params(params).unwrap_or(LimitQuery {
                limit: Some(100),
                scan_ids: Vec::new(),
            });
            Ok(serde_json::to_value(
                state.db.duplicate_groups_for_scans(
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
                        &state.db,
                        &params.scan_id,
                        paths,
                        path,
                        params.recursive,
                    )?
                } else {
                    media::build_thumbnails(&state.db, &params.scan_id, path, params.recursive)?
                };
            state.events.emit("thumbnails_built", &result);
            Ok(serde_json::to_value(result)?)
        }
        _ => anyhow::bail!("method not found"),
    }
}

fn decode_params<T: for<'de> Deserialize<'de>>(params: Option<Value>) -> anyhow::Result<T> {
    Ok(serde_json::from_value(
        params.unwrap_or_else(|| serde_json::json!({})),
    )?)
}

fn json_rpc_error(id: Value, code: i64, message: impl ToString) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message.to_string()
        }
    })
}

#[derive(Serialize)]
struct LocationView {
    #[serde(flatten)]
    location: Location,
    connected: bool,
    liveness_checked_at: String,
    liveness_error: Option<String>,
}

fn locations_with_liveness(db: &Database) -> Result<Vec<LocationView>> {
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

fn open_in_system(path: &FsPath) -> Result<()> {
    open::that(path).with_context(|| format!("opening {}", path.display()))
}

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

fn json_rpc_event(kind: impl Into<String>, payload: impl Serialize) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "method": "event",
        "params": {
            "kind": kind.into(),
            "payload": serde_json::to_value(payload).unwrap_or(Value::Null)
        }
    })
}

async fn scans(State(state): State<AppState>) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(state.db.scans()?))
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

async fn add_location(
    State(state): State<AppState>,
    Json(input): Json<AddLocationRequest>,
) -> ApiResult<Json<impl Serialize>> {
    let location = state.db.add_location(LocationInput {
        kind: input.kind,
        name: input.name,
        slug: input.slug,
        root_path: input.root_path,
        notes: input.notes,
    })?;
    state.events.emit("location_added", &location);
    Ok(Json(location))
}

#[derive(Deserialize)]
struct ScanRequest {
    offset: Option<PathBuf>,
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

async fn scan_location(
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(input): Json<ScanRequest>,
) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(
        start_scan_job(
            state,
            slug,
            input.offset.unwrap_or_else(|| PathBuf::from("/")),
        )
        .await?,
    ))
}

async fn start_scan_job(
    state: AppState,
    slug: String,
    offset: PathBuf,
) -> anyhow::Result<ScanStartedResponse<'static>> {
    let prepared = scanner::prepare_scan(&state.db, &slug, &offset)?;
    let scan_id = prepared.scan_id.clone();
    state.progress.start(&prepared);

    let db = (*state.db).clone();
    let progress = state.progress.clone();
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

async fn start_update_scan_job(
    state: AppState,
    source_scan_id: String,
) -> anyhow::Result<ScanStartedResponse<'static>> {
    let prepared = scanner::prepare_update_scan(&state.db, &source_scan_id)?;
    let scan_id = prepared.scan_id.clone();
    state.progress.start(&prepared);
    state.events.emit(
        "scan_update_started",
        serde_json::json!({
            "scan_id": scan_id,
            "source_scan_id": source_scan_id,
        }),
    );

    let db = (*state.db).clone();
    let progress = state.progress.clone();
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

async fn scan_progress(
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
) -> ApiResult<Response> {
    match state.progress.get(&scan_id) {
        Some(progress) => Ok(Json(progress).into_response()),
        None => {
            let body = Json(serde_json::json!({
                "error": "scan progress not found"
            }));
            Ok((StatusCode::NOT_FOUND, body).into_response())
        }
    }
}

async fn running_scans(State(state): State<AppState>) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(state.progress.running()))
}

async fn stop_scan(
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
) -> ApiResult<Json<impl Serialize>> {
    let requested = state.progress.stop(&scan_id);
    state.events.emit(
        "scan_stop_requested",
        serde_json::json!({
            "scan_id": scan_id,
            "stop_requested": requested,
        }),
    );
    Ok(Json(serde_json::json!({
        "scan_id": scan_id,
        "stop_requested": requested,
    })))
}

#[derive(Deserialize)]
struct ScanFilesQuery {
    limit: Option<u32>,
}

async fn scan_files(
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
    Query(query): Query<ScanFilesQuery>,
) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(
        state.db.scan_files(&scan_id, query.limit.unwrap_or(500))?,
    ))
}

#[derive(Deserialize)]
struct TreeQuery {
    path: Option<String>,
    depth: Option<u32>,
    limit: Option<u32>,
    offset: Option<u32>,
    /// URL-encoded JSON `FileSearchQuery`, kept separate from the tree page
    /// window so the same filter semantics apply to REST and JSON-RPC.
    query: Option<String>,
}

async fn scan_tree(
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
    Query(query): Query<TreeQuery>,
) -> ApiResult<Json<impl Serialize>> {
    let file_query = query
        .query
        .as_deref()
        .map(|raw| {
            serde_json::from_str::<FileSearchQuery>(raw)
                .context("tree query must be a JSON-encoded FileSearchQuery")
        })
        .transpose()?;
    Ok(Json(state.db.scan_tree_page(
        &scan_id,
        query.path.as_deref().unwrap_or(""),
        query.limit,
        query.offset.unwrap_or(0),
        query.depth.unwrap_or(1),
        file_query.as_ref(),
    )?))
}

async fn delete_scan(
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
) -> ApiResult<Response> {
    state.progress.remove(&scan_id);
    if state.db.delete_scan(&scan_id)? {
        state.events.emit(
            "scan_deleted",
            serde_json::json!({
                "scan_id": scan_id
            }),
        );
        Ok(StatusCode::NO_CONTENT.into_response())
    } else {
        let body = Json(serde_json::json!({
            "error": "scan not found"
        }));
        Ok((StatusCode::NOT_FOUND, body).into_response())
    }
}

#[derive(Serialize)]
struct ScanStartedResponse<'a> {
    scan_id: String,
    status: &'a str,
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

#[derive(Deserialize)]
struct BuildThumbnailsParams {
    scan_id: String,
    path: Option<String>,
    paths: Option<Vec<String>>,
    recursive: bool,
}

async fn find(
    State(state): State<AppState>,
    Query(query): Query<FindQuery>,
) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(
        state.db.find_files(&query.q, query.limit.unwrap_or(50))?,
    ))
}

#[derive(Deserialize)]
struct LimitQuery {
    limit: Option<u32>,
    #[serde(default)]
    scan_ids: Vec<String>,
}

async fn dupes(
    State(state): State<AppState>,
    Query(query): Query<LimitQuery>,
) -> ApiResult<Json<impl Serialize>> {
    Ok(Json(state.db.duplicate_groups_for_scans(
        query.limit.unwrap_or(50),
        &query.scan_ids,
    )?))
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let requested_path = uri.path().trim_start_matches('/');
    let asset_path = if requested_path.is_empty() {
        "index.html"
    } else {
        requested_path
    };

    match Assets::get(asset_path) {
        Some(content) => {
            let mime = mime_guess::from_path(asset_path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => match Assets::get("index.html") {
            Some(content) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from(content.data.into_owned()))
                .unwrap(),
            None => Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("not found"))
                .unwrap(),
        },
    }
}

type ApiResult<T> = std::result::Result<T, ApiError>;

struct ApiError(anyhow::Error);

impl<E> From<E> for ApiError
where
    E: Into<anyhow::Error>,
{
    fn from(error: E) -> Self {
        Self(error.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(serde_json::json!({
            "error": self.0.to_string(),
        }));
        (StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
    }
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
            "file-census-web-folder-path-{}",
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
