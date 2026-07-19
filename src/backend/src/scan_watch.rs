//! Ratatui-based live scan-progress watcher for the CLI (`scans watch`).
//!
//! Polls a running server's `/api/scans/running` and renders a per-scan
//! dashboard (discovery / metadata / hashing gauges + current path). Falls back
//! to periodic text lines when stdout is not a TTY, so it stays usable when
//! piped or captured in tests.

use std::io::{self, IsTerminal, Write};
use std::time::{Duration, Instant};

use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyModifiers};
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::ExecutableCommand;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Gauge, Paragraph};
use ratatui::{Frame, Terminal};
use serde_json::Value;

/// One scan's progress, extracted from the running-scans JSON.
struct ScanRow {
    label: String,
    status: String,
    files: u64,
    dirs: u64,
    errors: u64,
    current_path: String,
    discovery: (u64, u64),
    metadata: (u64, u64),
    hashing: (u64, u64),
}

fn pool_progress(pools: &Value, name: &str) -> (u64, u64) {
    let pool = &pools[name];
    let get = |k: &str| pool.get(k).and_then(Value::as_u64).unwrap_or(0);
    let completed = get("completed");
    let total = completed + get("failed") + get("queued") + get("active");
    (completed, total)
}

fn rows_from_running(running: &Value, filter: Option<&str>) -> Vec<ScanRow> {
    let empty = Vec::new();
    let items = running.as_array().unwrap_or(&empty);
    items
        .iter()
        .filter(|item| {
            filter.map_or(true, |id| item.get("scan_id").and_then(Value::as_str) == Some(id))
        })
        .map(|item| {
            let str_field = |k: &str| item.get(k).and_then(Value::as_str).unwrap_or("").to_string();
            let u64_field = |k: &str| item.get(k).and_then(Value::as_u64).unwrap_or(0);
            let name = {
                let n = str_field("location_name");
                if n.is_empty() { str_field("location_slug") } else { n }
            };
            let pools = &item["pools"];
            ScanRow {
                label: name,
                status: str_field("status"),
                files: u64_field("file_count"),
                dirs: u64_field("dir_count"),
                errors: u64_field("error_count"),
                current_path: str_field("current_path"),
                discovery: pool_progress(pools, "discovery"),
                metadata: pool_progress(pools, "metadata"),
                hashing: pool_progress(pools, "hashing"),
            }
        })
        .collect()
}

/// Runs the watcher until the user quits (q / Esc / Ctrl-C) or `max_ticks` is
/// reached (used for tests / non-interactive runs). `poll` returns the parsed
/// `/api/scans/running` JSON array.
pub fn run<F>(scan_id: Option<String>, max_ticks: Option<u32>, poll: F) -> Result<()>
where
    F: Fn() -> Result<Value>,
{
    if io::stdout().is_terminal() {
        run_tui(scan_id, max_ticks, poll)
    } else {
        run_text(scan_id, max_ticks.unwrap_or(u32::MAX), poll)
    }
}

fn run_text<F>(scan_id: Option<String>, max_ticks: u32, poll: F) -> Result<()>
where
    F: Fn() -> Result<Value>,
{
    let mut out = io::stdout();
    for _ in 0..max_ticks {
        let running = poll()?;
        let rows = rows_from_running(&running, scan_id.as_deref());
        if rows.is_empty() {
            writeln!(out, "no running scans")?;
            return Ok(());
        }
        for row in &rows {
            writeln!(
                out,
                "{} [{}] files={} dirs={} err={} disc={}/{} meta={}/{} hash={}/{} :: {}",
                row.label,
                row.status,
                row.files,
                row.dirs,
                row.errors,
                row.discovery.0,
                row.discovery.1,
                row.metadata.0,
                row.metadata.1,
                row.hashing.0,
                row.hashing.1,
                row.current_path,
            )?;
        }
        out.flush()?;
        std::thread::sleep(Duration::from_millis(500));
    }
    Ok(())
}

fn run_tui<F>(scan_id: Option<String>, max_ticks: Option<u32>, poll: F) -> Result<()>
where
    F: Fn() -> Result<Value>,
{
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    stdout.execute(EnterAlternateScreen)?;
    let backend = ratatui::backend::CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = tui_loop(&mut terminal, scan_id, max_ticks, poll);

    disable_raw_mode()?;
    terminal.backend_mut().execute(LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    result
}

fn tui_loop<B: ratatui::backend::Backend, F>(
    terminal: &mut Terminal<B>,
    scan_id: Option<String>,
    max_ticks: Option<u32>,
    poll: F,
) -> Result<()>
where
    F: Fn() -> Result<Value>,
{
    let mut ticks = 0u32;
    let mut last_poll = Instant::now() - Duration::from_secs(1);
    let mut rows: Vec<ScanRow> = Vec::new();
    let mut error: Option<String> = None;
    loop {
        if last_poll.elapsed() >= Duration::from_millis(300) {
            match poll() {
                Ok(running) => {
                    rows = rows_from_running(&running, scan_id.as_deref());
                    error = None;
                }
                Err(err) => error = Some(err.to_string()),
            }
            last_poll = Instant::now();
            ticks += 1;
            if let Some(max) = max_ticks {
                if ticks >= max {
                    return Ok(());
                }
            }
        }
        terminal.draw(|frame| draw(frame, &rows, error.as_deref()))?;
        if event::poll(Duration::from_millis(120))? {
            if let Event::Key(key) = event::read()? {
                let quit = matches!(key.code, KeyCode::Char('q') | KeyCode::Esc)
                    || (key.modifiers.contains(KeyModifiers::CONTROL)
                        && key.code == KeyCode::Char('c'));
                if quit {
                    return Ok(());
                }
            }
        }
    }
}

fn draw(frame: &mut Frame, rows: &[ScanRow], error: Option<&str>) {
    let area = frame.area();
    let header = Paragraph::new(Line::from(vec![
        Span::styled(
            " file-census — scan watch ",
            Style::default().add_modifier(Modifier::BOLD),
        ),
        Span::styled("(q to quit)", Style::default().fg(Color::DarkGray)),
    ]));
    let mut constraints = vec![Constraint::Length(1)];
    if rows.is_empty() {
        constraints.push(Constraint::Length(1));
    } else {
        for _ in rows {
            constraints.push(Constraint::Length(7));
        }
    }
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(area);
    frame.render_widget(header, chunks[0]);

    if rows.is_empty() {
        let msg = error.unwrap_or("no running scans");
        frame.render_widget(
            Paragraph::new(msg).style(Style::default().fg(Color::DarkGray)),
            chunks[1],
        );
        return;
    }
    for (i, row) in rows.iter().enumerate() {
        draw_scan(frame, chunks[i + 1], row);
    }
}

fn draw_scan(frame: &mut Frame, area: Rect, row: &ScanRow) {
    let title = format!(
        " {} [{}]  files {}  dirs {}  err {} ",
        row.label, row.status, row.files, row.dirs, row.errors
    );
    let block = Block::default().borders(Borders::ALL).title(title);
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let parts = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
            Constraint::Length(1),
        ])
        .split(inner);
    gauge(frame, parts[0], "Discovery", row.discovery, Color::Cyan);
    gauge(frame, parts[1], "Metadata ", row.metadata, Color::Yellow);
    gauge(frame, parts[2], "Hashing  ", row.hashing, Color::Green);
    let path = Paragraph::new(Line::from(vec![
        Span::styled("  ↳ ", Style::default().fg(Color::DarkGray)),
        Span::raw(&row.current_path),
    ]));
    frame.render_widget(path, parts[3]);
}

fn gauge(frame: &mut Frame, area: Rect, label: &str, (done, total): (u64, u64), color: Color) {
    let ratio = if total == 0 { 0.0 } else { done as f64 / total as f64 };
    let widget = Gauge::default()
        .gauge_style(Style::default().fg(color))
        .ratio(ratio.clamp(0.0, 1.0))
        .label(format!("{label} {done}/{total}"));
    frame.render_widget(widget, area);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_running_scans_into_rows_with_pool_totals_and_filter() {
        let running = json!([
            {
                "scan_id": "s1", "location_name": "NLBackup", "status": "running",
                "file_count": 100, "dir_count": 10, "error_count": 1,
                "current_path": "PHOTO_FILTER/a.jpg",
                "pools": {
                    "discovery": {"completed": 50, "failed": 0, "queued": 0, "active": 0},
                    "metadata": {"completed": 40, "failed": 0, "queued": 5, "active": 5},
                    "hashing": {"completed": 20, "failed": 1, "queued": 70, "active": 9}
                }
            },
            {
                "scan_id": "s2", "location_slug": "other", "status": "running",
                "file_count": 5, "pools": {}
            }
        ]);
        let all = rows_from_running(&running, None);
        assert_eq!(all.len(), 2);
        let r0 = &all[0];
        assert_eq!(r0.label, "NLBackup");
        assert_eq!(r0.discovery, (50, 50));
        assert_eq!(r0.metadata, (40, 50)); // 40 + 0 + 5 + 5
        assert_eq!(r0.hashing, (20, 100)); // 20 + 1 + 70 + 9
        assert_eq!(r0.current_path, "PHOTO_FILTER/a.jpg");
        // Missing name falls back to slug; empty pools -> (0,0).
        assert_eq!(all[1].label, "other");
        assert_eq!(all[1].hashing, (0, 0));
        // Filter to a single scan id.
        let one = rows_from_running(&running, Some("s2"));
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].label, "other");
    }
}
