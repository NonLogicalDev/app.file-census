use std::sync::Arc;
use std::time::Instant;

use crate::db::Database;
use crate::events::EventHub;

/// Rebuilds the duplicate-count cache for the current representative scope and
/// emits lifecycle events. Synchronous and runtime-free, so it can be called
/// directly from a scan-completion blocking thread as well as from the async
/// spawn wrapper below.
pub fn run_rebuild_duplicate_cache(db: &Database, events: &EventHub) {
    let request_id = uuid::Uuid::new_v4().to_string();
    let mut starting_status = db.current_duplicate_cache_status().ok();
    if let Some(status) = starting_status
        .as_mut()
        .filter(|status| status.status != "empty")
    {
        status.status = "building".to_string();
        status.processed_files = 0;
        status.started_at = Some(chrono::Utc::now().to_rfc3339());
        status.ready_at = None;
        status.error = None;
    }
    events.emit(
        "duplicate_cache_rebuild_started",
        serde_json::json!({ "request_id": request_id, "status": starting_status }),
    );

    let started = Instant::now();
    let result = (|| {
        let run_id = db.rebuild_duplicate_cache_for_current_scope()?;
        let status = db.current_duplicate_cache_status()?;
        Ok::<_, anyhow::Error>((run_id, status))
    })();

    match result {
        Ok((run_id, status)) => {
            let event_kind = if status.status == "ready" {
                "duplicate_cache_ready"
            } else {
                "duplicate_cache_rebuild_completed"
            };
            events.emit(
                event_kind,
                serde_json::json!({
                    "request_id": request_id,
                    "run_id": run_id,
                    "status": status,
                    "elapsed_ms": started.elapsed().as_millis() as u64
                }),
            );
        }
        Err(error) => {
            events.emit(
                "duplicate_cache_failed",
                serde_json::json!({
                    "request_id": request_id,
                    "error": error.to_string(),
                    "elapsed_ms": started.elapsed().as_millis() as u64
                }),
            );
        }
    }
}

/// Spawns an async rebuild of the duplicate-count cache. Requires a Tokio
/// runtime; use `run_rebuild_duplicate_cache` from non-async contexts.
pub fn spawn_rebuild_duplicate_cache(db: Arc<Database>, events: EventHub) {
    tokio::spawn(async move {
        let _ = tokio::task::spawn_blocking(move || run_rebuild_duplicate_cache(&db, &events)).await;
    });
}

/// Spawns a rebuild only when the cache is not already usable for the current
/// scope (stale after a scope change, never built, or previously failed).
/// Cheap no-op when the cache is `ready`, `building`, or `empty` (no scope).
pub fn spawn_rebuild_if_stale(db: Arc<Database>, events: EventHub) {
    let needs_rebuild = matches!(
        db.current_duplicate_cache_status()
            .map(|status| status.status)
            .as_deref(),
        Ok("stale") | Ok("missing") | Ok("failed")
    );
    if needs_rebuild {
        spawn_rebuild_duplicate_cache(db, events);
    }
}
