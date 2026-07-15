import { useMemo, useState } from 'react';
import ScanProgressPools from '../components/ScanProgressPools.jsx';
import { Icon } from '../components/Icon.jsx';
import { Button, emptyTextClassName, fieldClassName } from '../components/ui/index.jsx';
import { formatUserEvent } from '../utils/events.js';
import { bytes, statusLabel } from '../utils/format.js';

const ACTIVE_STATES = ['running', 'paused', 'stopping', 'repairing', 'queued'];
const FINISHED_STATES = ['complete', 'completed', 'failed', 'stopped'];

function normalizedStatus(status) {
  const value = String(status || 'running').toLowerCase();
  return value === 'completed' ? 'complete' : value;
}

// Real status -> semantic color token family. Sparse, matching the approved dark palette.
function statusTone(status) {
  switch (normalizedStatus(status)) {
    case 'complete':
      return { dot: 'bg-success', pill: 'bg-success-soft text-success', icon: 'check' };
    case 'failed':
      return { dot: 'bg-danger', pill: 'bg-danger-soft text-danger', icon: 'warning' };
    case 'paused':
      return { dot: 'bg-warning', pill: 'bg-warning-soft text-warning', icon: 'pause' };
    case 'stopping':
      return { dot: 'bg-warning', pill: 'bg-warning-soft text-warning', icon: 'stop' };
    case 'queued':
      return { dot: 'bg-muted', pill: 'bg-surface-muted text-muted', icon: 'tasks' };
    default:
      return { dot: 'bg-info', pill: 'bg-info-soft text-info', icon: 'refresh' };
  }
}

// Unify live scans and background tasks into one truthful task model.
function scanTask(progress) {
  return {
    id: progress.scan_id,
    kind: 'scan',
    isScan: true,
    title: progress.location_name || progress.location_slug,
    subtitle: progress.current_path
      || `${progress.file_count} indexed files - ${bytes(progress.total_bytes)} - ${progress.error_count} errors`,
    status: normalizedStatus(progress.status),
    processed: progress.file_count,
    total: null,
    percent: null,
    errors: progress.error_count,
    progress
  };
}

function backgroundTask(task) {
  const total = Number(task.total || 0);
  const processed = Number(task.processed || 0);
  return {
    id: task.id,
    kind: 'background',
    isScan: false,
    title: task.title,
    subtitle: task.subtitle,
    status: normalizedStatus(task.status),
    processed,
    total,
    percent: total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : null,
    errors: task.errors ?? 0
  };
}

function StatusPillInline({ status }) {
  const tone = statusTone(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${tone.pill}`}>
      <Icon name={tone.icon} className="h-3 w-3" />
      {statusLabel(status)}
    </span>
  );
}

export default function TasksPage({
  runningProgress = [],
  backgroundTasks = [],
  eventLog = [],
  busy = false,
  onStopScan
}) {
  const canStopScan = typeof onStopScan === 'function';

  const taskRows = useMemo(
    () => [...backgroundTasks.map(backgroundTask), ...runningProgress.map(scanTask)],
    [backgroundTasks, runningProgress]
  );

  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return taskRows.filter((task) => {
      const matchesFilter =
        filter === 'all'
        || (filter === 'active' && ACTIVE_STATES.includes(task.status))
        || (filter === 'finished' && FINISHED_STATES.includes(task.status));
      const matchesQuery = !needle || `${task.title} ${task.subtitle || ''}`.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, taskRows]);

  const runningCount = taskRows.filter((task) => task.status === 'running' || task.status === 'repairing').length;
  const queuedCount = taskRows.filter((task) => task.status === 'queued').length;

  const selectedTask =
    visibleTasks.find((task) => task.id === selectedId) || visibleTasks[0] || null;

  const taskEvents = eventLog.slice(0, 12).map((event, index) => ({
    event,
    index,
    formatted: formatUserEvent(event)
  }));

  const recentEventsSection = (
    <section className="grid min-h-0 content-start gap-2 p-3" aria-label="Recent events">
      <div className="flex items-center justify-between text-[0.72rem] font-[760] uppercase tracking-wide text-muted">
        <span className="inline-flex items-center gap-1.5"><Icon name="tasks" className="h-3.5 w-3.5" /> Recent events</span>
        <small className="normal-case tracking-normal">Newest first</small>
      </div>
      {taskEvents.length ? (
        <ul className="grid gap-1">
          {taskEvents.map(({ event, index, formatted }) => (
            <li
              key={`${event.kind}-${index}`}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-ui border border-border bg-surface-muted px-2.5 py-2 text-sm"
            >
              <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${statusTone(event.status || event.kind).dot}`} />
              <span className="grid min-w-0 gap-0.5">
                <strong className="truncate">{formatted.title}</strong>
                <span className="truncate text-muted">{formatted.detail}</span>
                {formatted.timeLabel && <span className="text-[0.7rem] text-muted">{formatted.timeLabel}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${emptyTextClassName} m-0 p-2`}>No recent events recorded.</p>
      )}
    </section>
  );

  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.72rem] font-[760] uppercase tracking-wide text-muted">Operations</span>
          <span className="text-muted">/</span>
          <h2 className="m-0 text-base normal-case tracking-normal text-text">Tasks</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${runningCount ? 'bg-info' : 'bg-muted'}`} />
            {runningCount} running
          </span>
          <span>{queuedCount} queued</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" className="h-3.5 w-3.5" />
          </span>
          <input
            className={`${fieldClassName} pl-8`}
            aria-label="Filter tasks"
            placeholder="Filter tasks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="inline-flex overflow-hidden rounded-ui border border-border bg-surface-muted" role="group" aria-label="Task status filter">
          {[
            ['active', 'Active'],
            ['all', 'All'],
            ['finished', 'Finished']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === value ? 'bg-surface text-text' : 'text-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-3 max-[1100px]:grid-cols-1">
        {/* Task queue (master) */}
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-panel border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[0.72rem] font-[760] uppercase tracking-wide text-muted">
            <span>Task queue</span>
            <span>{visibleTasks.length} shown</span>
          </div>
          <div className="min-h-0 overflow-auto p-2">
            {visibleTasks.length ? (
              <ul className="grid gap-1">
                {visibleTasks.map((task) => {
                  const selected = selectedTask?.id === task.id;
                  const tone = statusTone(task.status);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedId(task.id)}
                        className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 rounded-ui border p-2.5 text-left transition-colors ${
                          selected ? 'border-border-strong bg-surface-muted' : 'border-transparent hover:bg-surface-muted/60'
                        }`}
                      >
                        <span className={`mt-0.5 grid h-7 w-7 place-items-center rounded-ui border border-border bg-surface text-muted`}>
                          <Icon name={task.isScan ? 'scan' : 'exif'} className="h-3.5 w-3.5" />
                        </span>
                        <span className="grid min-w-0 gap-1">
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <strong className="truncate">{task.title}</strong>
                            <StatusPillInline status={task.status} />
                          </span>
                          <small className="truncate text-muted">{task.subtitle}</small>
                          {task.percent != null && (
                            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-surface">
                              <span className={`block h-full rounded-full ${tone.dot}`} style={{ width: `${task.percent}%` }} />
                            </span>
                          )}
                          <span className="flex items-center gap-3 text-[0.7rem] text-muted">
                            {task.percent != null && <span>{task.percent}%</span>}
                            {task.total ? (
                              <span>{task.processed.toLocaleString()} / {task.total.toLocaleString()}</span>
                            ) : (
                              <span>{Number(task.processed || 0).toLocaleString()} files</span>
                            )}
                          </span>
                        </span>
                        <Icon name="chevronRight" className="mt-1 h-3.5 w-3.5 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`${emptyTextClassName} m-0 p-4`}>No tasks match this filter.</p>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="grid min-h-0 overflow-hidden rounded-panel border border-border bg-surface">
          {selectedTask ? (
            <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-auto">
              <header className="flex items-start justify-between gap-3 border-b border-border p-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-ui border border-border bg-surface-muted text-muted">
                    <Icon name={selectedTask.isScan ? 'scan' : 'exif'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="m-0 truncate text-base">{selectedTask.title}</h3>
                      <StatusPillInline status={selectedTask.status} />
                    </div>
                    <p className="truncate text-sm text-muted" title={selectedTask.subtitle}>{selectedTask.subtitle}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {selectedTask.isScan && canStopScan && selectedTask.status !== 'stopping' && (
                    <Button variant="warning" onClick={() => onStopScan(selectedTask.id)} disabled={busy} icon={<Icon name="stop" />}>
                      Stop
                    </Button>
                  )}
                  {selectedTask.status === 'stopping' && (
                    <span className="text-xs text-muted">Stopping; workers finishing current files.</span>
                  )}
                </div>
              </header>

              <div className="grid gap-3 border-b border-border p-3">
                {selectedTask.isScan ? (
                  <ScanProgressPools progress={selectedTask.progress} />
                ) : (
                  <div className="grid gap-1">
                    <div className="flex items-baseline gap-2">
                      <strong className="text-xl">{selectedTask.percent ?? 0}%</strong>
                      <small className="text-muted">{statusLabel(selectedTask.status)}</small>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-info" style={{ width: `${selectedTask.percent ?? 0}%` }} />
                    </div>
                  </div>
                )}
                <dl className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 text-sm">
                  <div className="grid gap-0.5 rounded-ui border border-border bg-surface-muted px-2.5 py-2">
                    <dt className="text-[0.68rem] uppercase tracking-wide text-muted">Processed</dt>
                    <dd className="m-0 font-semibold">
                      {Number(selectedTask.processed || 0).toLocaleString()}{selectedTask.total ? ` / ${selectedTask.total.toLocaleString()}` : ''}
                    </dd>
                  </div>
                  <div className="grid gap-0.5 rounded-ui border border-border bg-surface-muted px-2.5 py-2">
                    <dt className="text-[0.68rem] uppercase tracking-wide text-muted">Status</dt>
                    <dd className="m-0 font-semibold">{statusLabel(selectedTask.status)}</dd>
                  </div>
                  <div className="grid gap-0.5 rounded-ui border border-border bg-surface-muted px-2.5 py-2">
                    <dt className="text-[0.68rem] uppercase tracking-wide text-muted">Errors</dt>
                    <dd className={`m-0 font-semibold ${Number(selectedTask.errors) > 0 ? 'text-warning' : ''}`}>
                      {Number(selectedTask.errors || 0).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                {(selectedTask.status === 'paused' || selectedTask.status === 'repairing') && (
                  <p className="m-0 text-xs text-muted">
                    {selectedTask.status === 'paused'
                      ? 'Pause and resume are unavailable in this build.'
                      : 'Repair is unavailable in this build.'}{' '}
                    Start a new scan to refresh this location.
                  </p>
                )}
              </div>

              {recentEventsSection}
            </div>
          ) : (
            <div className="grid min-h-0 content-start gap-2 overflow-auto">
              <div className="grid place-items-center border-b border-border p-6">
                <p className={`${emptyTextClassName} m-0`}>No background file work is running.</p>
              </div>
              {recentEventsSection}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
