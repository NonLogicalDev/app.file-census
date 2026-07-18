import { useEffect, useMemo, useRef, useState } from 'react';
import ScanProgressPools from '../components/ScanProgressPools.jsx';
import { Icon } from '../components/Icon.jsx';
import { Button } from '../components/ui/index.jsx';
import { formatUserEvent } from '../utils/events.js';
import { bytes, statusLabel } from '../utils/format.js';

const ACTIVE_STATES = ['running', 'paused', 'stopping', 'repairing', 'queued'];
const FINISHED_STATES = ['complete', 'completed', 'failed', 'stopped', 'interrupted'];

function normalizedStatus(status) {
  const value = String(status || 'running').toLowerCase();
  return value === 'completed' ? 'complete' : value;
}

// Sparse semantic status color, matching the approved dark palette.
function statusTextClass(status) {
  switch (normalizedStatus(status)) {
    case 'complete':
      return 'text-muted';
    case 'failed':
      return 'text-danger';
    case 'interrupted':
    case 'paused':
    case 'stopping':
      return 'text-warning';
    case 'queued':
      return 'text-muted';
    default:
      return 'text-success';
  }
}

function statusDotClass(status) {
  switch (normalizedStatus(status)) {
    case 'failed':
      return 'bg-danger';
    case 'interrupted':
    case 'paused':
    case 'stopping':
      return 'bg-warning';
    case 'complete':
    case 'queued':
      return 'bg-muted';
    default:
      return 'bg-success';
  }
}

function statusIcon(status) {
  switch (normalizedStatus(status)) {
    case 'complete':
      return 'check';
    case 'failed':
      return 'warning';
    case 'interrupted':
      return 'warning';
    case 'paused':
      return 'pause';
    case 'stopping':
      return 'stop';
    case 'queued':
      return 'tasks';
    default:
      return 'refresh';
  }
}

function poolCounts(pool = {}) {
  const processed = Math.max(0, Number(pool.completed || 0)) + Math.max(0, Number(pool.failed || 0));
  const observed = processed + Math.max(0, Number(pool.queued || 0)) + Math.max(0, Number(pool.active || 0));
  return { processed, observed };
}

// Truthful overall scan progress. Hashing is the long pole and every discovered
// file becomes a hash job, so once hashing has work the bar tracks hashed/total.
// Before that (the discovery/metadata phase) the bar reflects that phase but
// stays in its lower half, so a scan with 250k files still queued never reads
// as "done". Never returns 100% while the scan is still running.
function scanProgressView(progress) {
  const pools = progress?.pools;
  if (!pools) return { percent: null, hashed: null, totalFiles: null, phase: 'unknown' };
  const running = ['running', 'repairing', 'paused', 'stopping'].includes(normalizedStatus(progress.status));
  const hashing = poolCounts(pools.hashing);
  if (hashing.observed > 0) {
    const raw = Math.round((hashing.processed / hashing.observed) * 100);
    return {
      percent: running ? Math.min(raw, 99) : raw,
      hashed: hashing.processed,
      totalFiles: hashing.observed,
      phase: 'hashing'
    };
  }
  const metadata = poolCounts(pools.metadata);
  const discovery = poolCounts(pools.discovery);
  const phase1 = metadata.observed > 0 ? metadata : discovery;
  if (phase1.observed > 0) {
    const raw = Math.round((phase1.processed / phase1.observed) * 100);
    return { percent: Math.min(Math.round(raw / 2), 50), hashed: 0, totalFiles: null, phase: 'discovering' };
  }
  return { percent: 0, hashed: 0, totalFiles: null, phase: 'starting' };
}

function scanTask(progress) {
  const view = scanProgressView(progress);
  return {
    id: progress.scan_id,
    kind: 'scan',
    isScan: true,
    title: progress.location_name || progress.location_slug,
    subtitle: progress.current_path
      || `${Number(progress.file_count || 0).toLocaleString()} indexed files`,
    status: normalizedStatus(progress.status),
    processed: Number(progress.file_count || 0),
    total: null,
    percent: view.percent,
    hashed: view.hashed,
    totalFiles: view.totalFiles,
    phase: view.phase,
    errors: Number(progress.error_count || 0),
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
    errors: Number(task.errors || 0)
  };
}

function StatusText({ status }) {
  return (
    <span className={`inline-flex flex-none items-center gap-1 text-[11px] font-medium ${statusTextClass(status)}`}>
      <Icon name={statusIcon(status)} className="h-3 w-3" />
      {statusLabel(status)}
    </span>
  );
}

// Truthful metric cells per task kind (no fabricated rate/eta).
function taskMetrics(task) {
  if (task.isScan) {
    const p = task.progress;
    return [
      ['Files', Number(p.file_count || 0).toLocaleString()],
      ['Dirs', Number(p.dir_count || 0).toLocaleString()],
      ['Size', bytes(p.total_bytes || 0)],
      ['Errors', Number(p.error_count || 0).toLocaleString(), Number(p.error_count) > 0],
      ['Status', statusLabel(task.status)]
    ];
  }
  return [
    ['Processed', `${task.processed.toLocaleString()}${task.total ? ` / ${task.total.toLocaleString()}` : ''}`],
    ['Errors', task.errors.toLocaleString(), task.errors > 0],
    ['Status', statusLabel(task.status)]
  ];
}

export default function TasksPage({
  runningProgress = [],
  backgroundTasks = [],
  eventLog = [],
  busy = false,
  onStopScan,
  onPauseScan,
  onResumeScan
}) {
  const canStopScan = typeof onStopScan === 'function';

  const taskRows = useMemo(
    () => [...backgroundTasks.map(backgroundTask), ...runningProgress.map(scanTask)],
    [backgroundTasks, runningProgress]
  );

  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // Resizable Task Queue column, persisted across sessions.
  const QUEUE_MIN = 260;
  const QUEUE_MAX = 640;
  const [queueWidth, setQueueWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem('tasks.queueWidth'));
    return Number.isFinite(stored) && stored >= QUEUE_MIN && stored <= QUEUE_MAX ? stored : 360;
  });
  const queueWidthRef = useRef(queueWidth);
  queueWidthRef.current = queueWidth;

  useEffect(() => {
    try {
      window.localStorage.setItem('tasks.queueWidth', String(queueWidth));
    } catch {
      /* best-effort persistence */
    }
  }, [queueWidth]);

  function startQueueResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = queueWidthRef.current;
    const onMove = (moveEvent) => {
      const next = Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, startWidth + (moveEvent.clientX - startX)));
      setQueueWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

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

  const selectedTask = visibleTasks.find((task) => task.id === selectedId) || visibleTasks[0] || null;

  const taskEvents = eventLog.slice(0, 40).map((event, index) => ({
    event,
    index,
    formatted: formatUserEvent(event)
  }));

  const eventsSection = (
    <section className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[34px_minmax(0,1fr)] overflow-hidden" aria-label="Recent events">
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar-bg px-3 text-[11px] font-medium text-muted-strong">
        <span className="inline-flex items-center gap-1.5"><Icon name="tasks" className="h-3.5 w-3.5" /> Recent events</span>
        <small className="text-muted">Newest first</small>
      </div>
      <div className="min-h-0 overflow-auto">
        {taskEvents.length ? (
          taskEvents.map(({ event, index, formatted }) => (
            <div
              key={`${event.kind}-${index}`}
              className="grid grid-cols-[7px_54px_minmax(0,1fr)] items-start gap-2 border-b border-surface px-2.5 py-2 text-[11px] leading-relaxed text-muted-strong"
            >
              <span className={`mt-1 h-[5px] w-[5px] rounded-full ${statusDotClass(event.status || event.kind)}`} />
              <time className="tabular-nums text-muted">{formatted.timeLabel || ''}</time>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <span className="text-text">{formatted.title}</span>
                {formatted.detail ? <span className="text-muted"> — {formatted.detail}</span> : null}
              </span>
            </div>
          ))
        ) : (
          <p className="px-3 py-5 text-[11px] text-muted">No recent events recorded.</p>
        )}
      </div>
    </section>
  );

  return (
    <section className="grid min-h-0 w-full min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_44px_minmax(0,1fr)] overflow-hidden text-[13px]">
      {/* Route bar */}
      <header className="flex items-center justify-between gap-3 pb-2">
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="font-[760] uppercase tracking-[0.04em] text-muted">Operations</span>
          <span className="text-muted">/</span>
          <strong className="text-sm font-semibold text-text">Tasks</strong>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${runningCount ? 'bg-success' : 'bg-muted'}`} />
            {runningCount} running
          </span>
          <span className="border-l border-sidebar-border pl-2">{queuedCount} queued</span>
        </div>
      </header>

      {/* Controls */}
      <div className="flex items-center gap-2 border-y border-sidebar-border">
        <label className="flex h-7 w-[270px] items-center gap-1 rounded-ui border border-border bg-surface px-2 text-muted focus-within:border-border-strong">
          <Icon name="search" className="h-3.5 w-3.5" />
          <input
            className="h-6 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-text outline-none placeholder:text-muted"
            aria-label="Filter tasks"
            placeholder="Filter tasks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="mr-auto inline-flex gap-0.5" role="group" aria-label="Task status filter">
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
              className={`h-6 rounded px-2 text-[11px] transition-colors ${
                filter === value ? 'bg-surface-muted text-text' : 'text-muted hover:bg-surface-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="whitespace-nowrap text-[11px] text-muted"><strong className="font-medium text-muted-strong">{runningCount}</strong> running</span>
        <span className="whitespace-nowrap text-[11px] text-muted"><strong className="font-medium text-muted-strong">{queuedCount}</strong> queued</span>
      </div>

      {/* Workspace */}
      <div
        className="grid min-h-0 w-full min-w-0 max-w-full overflow-hidden"
        style={{ gridTemplateColumns: `${queueWidth}px 6px minmax(0,1fr)` }}
      >
        {/* Master */}
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[31px_minmax(0,1fr)] overflow-hidden border-r border-sidebar-border bg-sidebar-bg">
          <div className="flex items-center justify-between border-b border-sidebar-border px-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
            <span>Task queue</span>
            <span>{visibleTasks.length} shown</span>
          </div>
          <div className="min-h-0 overflow-auto">
            {visibleTasks.length ? (
              visibleTasks.map((task) => {
                const selected = selectedTask?.id === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedId(task.id)}
                    className={`grid w-full grid-cols-[28px_minmax(0,1fr)_14px] items-start gap-2 border-b border-surface px-2.5 py-2 text-left ${
                      selected ? 'border-l-2 border-l-muted bg-surface pl-2' : ''
                    } hover:bg-surface`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-[5px] border border-border-strong bg-surface-muted text-muted">
                      <Icon name={task.isScan ? 'scan' : 'exif'} className="h-3.5 w-3.5" />
                    </span>
                    <span className="grid min-w-0 gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-xs font-medium text-text">{task.title}</strong>
                        <StatusText status={task.status} />
                      </span>
                      <small className="truncate text-[11px] text-muted">{task.subtitle}</small>
                      <span className="block h-[3px] overflow-hidden rounded-sm bg-surface-muted">
                        {task.percent != null && (
                          <span className="block h-full bg-muted-strong" style={{ width: `${task.percent}%` }} />
                        )}
                      </span>
                      <span className="flex items-center justify-between text-[11px] text-muted">
                        <span>{task.percent != null ? `${task.percent}%` : ''}</span>
                        <span>
                          {task.total
                            ? `${task.processed.toLocaleString()} / ${task.total.toLocaleString()}`
                            : `${task.processed.toLocaleString()} files`}
                        </span>
                      </span>
                    </span>
                    <Icon name="chevronRight" className="self-center text-border-strong" />
                  </button>
                );
              })
            ) : (
              <div className="grid min-h-40 place-items-center text-[12px] text-muted">No tasks match this filter.</div>
            )}
          </div>
        </div>

        {/* Resize handle for the Task Queue column */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize task queue"
          onMouseDown={startQueueResize}
          onDoubleClick={() => setQueueWidth(360)}
          className="group relative cursor-col-resize select-none border-r border-sidebar-border bg-sidebar-bg"
          title="Drag to resize · double-click to reset"
        >
          <span className="absolute inset-y-0 -left-1 -right-1 z-[1] block group-hover:bg-accent-line/20" />
        </div>

        {/* Detail — explicit single column so rows can't be sized to their
            widest content (long paths / pool counts) and overflow the pane. */}
        <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
          {selectedTask ? (
            <>
              <header className="flex min-h-16 items-center justify-between gap-3 border-b border-sidebar-border px-3.5 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-[5px] border border-border-strong bg-surface-muted text-muted">
                    <Icon name={selectedTask.isScan ? 'scan' : 'exif'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <h3 className="m-0 truncate text-sm font-semibold text-text">{selectedTask.title}</h3>
                      <StatusText status={selectedTask.status} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted" title={selectedTask.subtitle}>{selectedTask.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-2">
                  {selectedTask.isScan && selectedTask.status === 'paused' && typeof onResumeScan === 'function' && (
                    <Button variant="secondary" onClick={() => onResumeScan(selectedTask.id)} disabled={busy} icon={<Icon name="refresh" />}>
                      Resume
                    </Button>
                  )}
                  {selectedTask.isScan && selectedTask.status === 'running' && typeof onPauseScan === 'function' && (
                    <Button variant="secondary" onClick={() => onPauseScan(selectedTask.id)} disabled={busy} icon={<Icon name="pause" />}>
                      Pause
                    </Button>
                  )}
                  {selectedTask.isScan && canStopScan && selectedTask.status !== 'stopping' && (
                    <Button variant="warning" onClick={() => onStopScan(selectedTask.id)} disabled={busy} icon={<Icon name="stop" />}>
                      Stop
                    </Button>
                  )}
                  {selectedTask.status === 'stopping' && (
                    <span className="text-[11px] text-warning">Stopping; workers finishing files.</span>
                  )}
                </div>
              </header>

              {/* Overview: metric/progress | metric strip */}
              <div className="grid min-h-[76px] grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] border-b border-sidebar-border bg-sidebar-bg">
                <div className="grid content-center gap-2 border-r border-sidebar-border px-3.5 py-2.5">
                  <span className="flex items-baseline gap-2">
                    <strong className="text-lg font-semibold tabular-nums text-text">
                      {selectedTask.isScan
                        ? Number(selectedTask.processed || 0).toLocaleString()
                        : selectedTask.percent != null
                          ? `${selectedTask.percent}%`
                          : Number(selectedTask.processed || 0).toLocaleString()}
                    </strong>
                    <small className="text-[11px] text-muted">
                      {selectedTask.isScan
                        ? 'indexed files'
                        : selectedTask.percent != null
                          ? statusLabel(selectedTask.status)
                          : 'processed'}
                    </small>
                  </span>
                  <span className="block h-1 overflow-hidden rounded-sm bg-surface-muted">
                    <span
                      className={`block h-full ${selectedTask.status === 'failed' ? 'bg-danger' : 'bg-muted-strong'} ${selectedTask.percent == null ? 'animate-pulse' : ''}`}
                      style={{ width: `${selectedTask.percent ?? (selectedTask.isScan ? 0 : 100)}%` }}
                    />
                  </span>
                  {selectedTask.isScan && (
                    <span className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted">
                      <span>{selectedTask.percent != null ? `${selectedTask.percent}% hashed` : ''}</span>
                      <span className="truncate">
                        {selectedTask.totalFiles
                          ? `${Number(selectedTask.hashed || 0).toLocaleString()} / ${Number(selectedTask.totalFiles).toLocaleString()} files`
                          : selectedTask.phase === 'discovering'
                            ? 'discovering…'
                            : ''}
                      </span>
                    </span>
                  )}
                </div>
                <dl
                  className="m-0 grid"
                  style={{ gridTemplateColumns: `repeat(${taskMetrics(selectedTask).length}, minmax(0, 1fr))` }}
                >
                  {taskMetrics(selectedTask).map(([label, value, warn], i, arr) => (
                    <div key={label} className={`grid min-w-0 content-center gap-1 px-3 py-2.5 ${i < arr.length - 1 ? 'border-r border-sidebar-border' : ''}`}>
                      <dt className="truncate text-[11px] text-muted">{label}</dt>
                      <dd className={`m-0 truncate text-[11px] tabular-nums ${warn ? 'text-warning' : 'text-muted-strong'}`} title={String(value)}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Body: worker pool | events */}
              <div className="grid min-h-0 grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)]">
                <section className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[34px_minmax(0,1fr)] overflow-hidden border-r border-sidebar-border" aria-label="Worker pool">
                  <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar-bg px-3 text-[11px] font-medium text-muted-strong">
                    <span className="inline-flex items-center gap-1.5"><Icon name="tasks" className="h-3.5 w-3.5" /> Worker pool</span>
                    {selectedTask.isScan && selectedTask.progress?.pools && (
                      <small className="text-muted">
                        {Object.values(selectedTask.progress.pools).reduce((sum, pool) => sum + (pool.active || 0), 0)} active
                      </small>
                    )}
                  </div>
                  <div className="min-h-0 overflow-auto p-3">
                    {selectedTask.isScan ? (
                      <ScanProgressPools progress={selectedTask.progress} />
                    ) : (
                      <div className="grid grid-cols-[6px_minmax(0,1fr)_58px] items-center gap-2 border-b border-surface py-2 text-[11px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${selectedTask.status === 'running' ? 'bg-success' : 'bg-border-strong'}`} />
                        <span className="min-w-0">
                          <strong className="text-muted-strong">Background worker</strong>
                          <span className="ml-2 text-muted">{statusLabel(selectedTask.status)}</span>
                          <span className="mt-1 block h-[3px] overflow-hidden rounded-sm bg-surface-muted">
                            <span className="block h-full bg-muted-strong" style={{ width: `${selectedTask.percent ?? 0}%` }} />
                          </span>
                        </span>
                        <small className="text-right text-muted">{selectedTask.percent ?? 0}%</small>
                      </div>
                    )}
                  </div>
                </section>

                {eventsSection}
              </div>
            </>
          ) : (
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)]">{eventsSection}</div>
          )}
        </div>
      </div>
    </section>
  );
}
