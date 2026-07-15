use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;
use tokio::sync::broadcast::error::RecvError;

#[derive(Clone, Debug, Serialize)]
pub struct AppEvent {
    pub kind: String,
    pub payload: Value,
}

type EventRecorder = Arc<dyn Fn(&AppEvent) + Send + Sync>;

#[derive(Clone)]
pub struct EventHub {
    tx: broadcast::Sender<AppEvent>,
    recorder: Option<EventRecorder>,
}

impl Default for EventHub {
    fn default() -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self { tx, recorder: None }
    }
}

impl EventHub {
    pub fn with_recorder(recorder: impl Fn(&AppEvent) + Send + Sync + 'static) -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self {
            tx,
            recorder: Some(Arc::new(recorder)),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.tx.subscribe()
    }

    pub fn emit(&self, kind: impl Into<String>, payload: impl Serialize) {
        let payload = serde_json::to_value(payload).unwrap_or_else(|error| {
            serde_json::json!({
                "error": error.to_string()
            })
        });
        let event = AppEvent {
            kind: kind.into(),
            payload,
        };
        if let Some(recorder) = &self.recorder {
            recorder(&event);
        }
        self.broadcast(event);
    }

    pub fn broadcast(&self, event: AppEvent) {
        let _ = self.tx.send(event);
    }
}

pub async fn recv_app_event_tolerating_lag(
    rx: &mut broadcast::Receiver<AppEvent>,
) -> Option<AppEvent> {
    match rx.recv().await {
        Ok(event) => Some(event),
        Err(RecvError::Lagged(dropped)) => Some(AppEvent {
            kind: "events_lagged".to_string(),
            payload: serde_json::json!({ "dropped": dropped }),
        }),
        Err(RecvError::Closed) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn lagged_receivers_get_lag_event_and_continue() {
        let hub = EventHub::default();
        let mut rx = hub.subscribe();

        for index in 0..1100 {
            hub.emit("scan_progress", serde_json::json!({ "index": index }));
        }

        let lag = recv_app_event_tolerating_lag(&mut rx).await.unwrap();
        assert_eq!(lag.kind, "events_lagged");
        assert!(lag.payload["dropped"].as_u64().unwrap() > 0);

        let next = recv_app_event_tolerating_lag(&mut rx).await.unwrap();
        assert_eq!(next.kind, "scan_progress");
    }
}
