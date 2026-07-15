use std::sync::Arc;
use std::time::Instant;

use crate::db::Database;
use crate::events::EventHub;

pub fn spawn_rebuild_duplicate_cache(db: Arc<Database>, events: EventHub) {
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
    tokio::spawn(async move {
        let started = Instant::now();
        let worker_db = db.clone();
        let result = tokio::task::spawn_blocking(move || {
            let run_id = worker_db.rebuild_duplicate_cache_for_current_scope()?;
            let status = worker_db.current_duplicate_cache_status()?;
            Ok::<_, anyhow::Error>((run_id, status))
        })
        .await;

        match result {
            Ok(Ok((run_id, status))) => {
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
            Ok(Err(error)) => {
                events.emit(
                    "duplicate_cache_failed",
                    serde_json::json!({
                        "request_id": request_id,
                        "error": error.to_string(),
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
    });
}
