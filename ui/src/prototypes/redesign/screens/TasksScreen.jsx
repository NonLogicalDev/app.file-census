import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  FileClock,
  Gauge,
  HardDrive,
  Image,
  ListFilter,
  Pause,
  Play,
  Search,
  ServerCog,
  TriangleAlert,
  Users,
} from 'lucide-react';

import { recentEvents, tasks } from '../mockData.js';
import './tasks.css';

const actionTimes = {
  paused: '20:26:12',
  running: '20:26:18',
  stopping: '20:26:31',
};

function taskStatus(task) {
  const status = String(task.status || 'queued').toLowerCase();
  return status === 'complete' ? 'completed' : status;
}

function workerCapacity(task) {
  if (task.workerCapacity != null) return Number(task.workerCapacity);
  if (task.workers != null && !Array.isArray(task.workers)) return Number(task.workers);
  if (Array.isArray(task.workers)) return task.workers.length;
  return task.kind === 'metadata' || task.type === 'metadata' ? 3 : 4;
}

function activeWorkerCount(task) {
  if (task.activeWorkers != null) return Number(task.activeWorkers);
  return ['running', 'stopping'].includes(taskStatus(task)) ? workerCapacity(task) : 0;
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function taskProgress(task) {
  if (task.progress != null) return Math.max(0, Math.min(100, Number(task.progress)));
  if (task.total) return Math.round((Number(task.processed || 0) / Number(task.total)) * 100);
  return 0;
}

function taskTypeIcon(task) {
  const value = `${task.type || ''} ${task.kind || ''} ${task.title || ''}`.toLowerCase();
  if (value.includes('exif') || value.includes('image') || value.includes('metadata')) return Image;
  return HardDrive;
}

function taskCategory(task) {
  const value = `${task.type || ''} ${task.kind || ''}`.toLowerCase();
  if (value.includes('metadata') || value.includes('exif') || value.includes('thumbnail')) return 'metadata';
  if (value.includes('analysis') || value.includes('duplicate')) return 'analysis';
  return 'scan';
}

function statusLabel(status) {
  if (status === 'paused') return 'Paused';
  if (status === 'stopping') return 'Stopping';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'queued') return 'Queued';
  return 'Running';
}

function statusIcon(status) {
  if (status === 'completed') return Check;
  if (status === 'failed') return TriangleAlert;
  if (status === 'paused') return Pause;
  if (status === 'stopping') return CircleStop;
  if (status === 'queued') return Clock3;
  return Activity;
}

function buildWorkers(task) {
  const capacity = workerCapacity(task);
  const active = activeWorkerCount(task);
  const progress = taskProgress(task);
  return Array.from({ length: capacity }, (_, index) => {
    const isActive = index < active;
    const kind = `${task.kind || task.type || ''}`.toLowerCase();
    const phase = taskStatus(task) === 'paused'
      ? 'Paused'
      : taskStatus(task) === 'stopping'
        ? index === capacity - 1 ? 'Draining queue' : 'Finishing current file'
        : kind.includes('metadata') || kind.includes('exif')
          ? index === 0 ? 'Reading EXIF blocks' : index === 1 ? 'Writing index rows' : 'Extracting thumbnails'
          : index === 0 ? 'Walking directories' : index === 1 ? 'Hashing changed files' : index === 2 ? 'Reading media metadata' : 'Writing scan batches';
    return {
      id: `${task.id}-worker-${index + 1}`,
      label: `Worker ${String(index + 1).padStart(2, '0')}`,
      state: isActive ? 'active' : 'idle',
      phase,
      progress: isActive ? Math.min(98, Math.max(4, progress + index * 7 - 8)) : 0,
    };
  });
}

function TaskStatus({ status }) {
  const Icon = statusIcon(status);
  return (
    <span className={`rd-task-status rd-task-status--${status}`}>
      <Icon aria-hidden="true" size={12} strokeWidth={2} />
      {statusLabel(status)}
    </span>
  );
}

export default function TasksScreen({ onCommandContextChange }) {
  const [taskRows, setTaskRows] = useState(() => tasks.map((task) => ({
    ...task,
    activeWorkers: activeWorkerCount(task),
    workerCapacity: workerCapacity(task),
  })));
  const [selectedTaskId, setSelectedTaskId] = useState(tasks.find((task) => taskStatus(task) === 'running')?.id || tasks[0]?.id || null);
  const [filter, setFilter] = useState('active');
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [localEvents, setLocalEvents] = useState(recentEvents);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState({ scan: true, metadata: true, analysis: true });
  const [announcement, setAnnouncement] = useState('');

  const visibleTasks = useMemo(() => {
    const needle = query.toLowerCase();
    return taskRows.filter((task) => {
      const status = taskStatus(task);
      const matchesFilter = filter === 'all'
        || (filter === 'active' && ['running', 'paused', 'stopping', 'queued'].includes(status))
        || (filter === 'finished' && ['completed', 'failed'].includes(status));
      const matchesType = enabledTypes[taskCategory(task)];
      const matchesQuery = !needle || `${task.title} ${task.subtitle || ''} ${task.locationName || ''}`.toLowerCase().includes(needle);
      return matchesFilter && matchesType && matchesQuery;
    });
  }, [enabledTypes, filter, query, taskRows]);

  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskId) || visibleTasks[0] || null;
  const selectedStatus = selectedTask ? taskStatus(selectedTask) : 'queued';
  const selectedProgress = selectedTask ? taskProgress(selectedTask) : 0;
  const workers = selectedTask ? buildWorkers(selectedTask) : [];
  const taskEvents = selectedTask
    ? localEvents.filter((event) => !event.taskId || event.taskId === selectedTask.id).slice(0, 10)
    : [];
  const runningCount = taskRows.filter((task) => taskStatus(task) === 'running').length;
  const queuedCount = taskRows.filter((task) => taskStatus(task) === 'queued').length;

  function commitQuery(event) {
    event.preventDefault();
    setQuery(draftQuery.trim());
  }

  const transitionTask = useCallback((nextStatus, targetTaskId = selectedTask?.id) => {
    const targetTask = taskRows.find((task) => task.id === targetTaskId);
    if (!targetTask) return;
    const nextActiveWorkers = nextStatus === 'paused'
      ? 0
      : nextStatus === 'running'
        ? targetTask.workerCapacity
        : targetTask.activeWorkers;

    setTaskRows((current) => current.map((task) => task.id === targetTask.id
      ? {
          ...task,
          status: nextStatus,
          phase: nextStatus === 'paused' ? 'Paused by operator' : nextStatus === 'stopping' ? 'Stopping workers' : 'Processing files',
          activeWorkers: nextActiveWorkers,
        }
      : task));

    const message = nextStatus === 'paused'
      ? 'Task paused; active workers released.'
      : nextStatus === 'running'
        ? `Task resumed with ${targetTask.workerCapacity} workers.`
        : 'Stop requested; workers will finish current files.';
    setAnnouncement(`${targetTask.title}: ${message}`);
    setLocalEvents((current) => [{
      id: `local-${targetTask.id}-${nextStatus}`,
      taskId: targetTask.id,
      time: actionTimes[nextStatus],
      status: nextStatus,
      message,
    }, ...current.filter((event) => event.id !== `local-${targetTask.id}-${nextStatus}`)]);
  }, [selectedTask?.id, taskRows]);

  function toggleTaskType(type) {
    setEnabledTypes((current) => ({ ...current, [type]: !current[type] }));
  }

  const onPrototypeCommand = useCallback((event) => {
      const command = event.detail || {};
      if (command.type === 'tasks-filter' && ['active', 'all', 'finished'].includes(command.value)) setFilter(command.value);
      if (command.type === 'tasks-menu') setFilterMenuOpen(true);
      if (command.type === 'task-transition' && ['running', 'paused', 'stopping'].includes(command.value)) transitionTask(command.value, command.taskId);
    }, [transitionTask]);

  useEffect(() => {
    window.addEventListener('redesign:prototype-command', onPrototypeCommand);
    return () => window.removeEventListener('redesign:prototype-command', onPrototypeCommand);
  }, [onPrototypeCommand]);

  useEffect(() => {
    onCommandContextChange?.({ selectedTask: selectedTask ? { ...selectedTask, status: selectedStatus } : null });
  }, [onCommandContextChange, selectedStatus, selectedTask]);

  return (
    <section className="rd-tasks" aria-label="Tasks workspace">
      <header className="rd-route-bar">
        <div className="rd-route-heading"><span>Operations</span><strong>Tasks</strong></div>
        <div className="rd-route-tools rd-tasks__route-meta">
          <span><Activity aria-hidden="true" size={13} /> {runningCount} running</span>
          <span>{queuedCount} queued</span>
        </div>
      </header>

      <div className="rd-tasks__controls">
        <form className="rd-task-query" onSubmit={commitQuery} role="search">
          <Search aria-hidden="true" size={14} />
          <input aria-label="Filter tasks" onChange={(event) => setDraftQuery(event.target.value)} placeholder="Filter tasks" value={draftQuery} />
          <button className="rd-task-query__submit" type="submit">Search</button>
        </form>

        <div className="rd-segmented rd-task-filter" aria-label="Task status filter">
          <button aria-pressed={filter === 'active'} className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')} type="button">Active</button>
          <button aria-pressed={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')} type="button">All</button>
          <button aria-pressed={filter === 'finished'} className={filter === 'finished' ? 'is-active' : ''} onClick={() => setFilter('finished')} type="button">Finished</button>
        </div>

        <span className="rd-task-count"><strong>{runningCount}</strong> running</span>
        <span className="rd-task-count"><strong>{queuedCount}</strong> queued</span>
        <div className="rd-task-filters">
          <button
            aria-controls="rd-task-filter-panel"
            aria-expanded={filterMenuOpen}
            className={`rd-button rd-button--quiet ${filterMenuOpen ? 'is-active' : ''}`}
            onClick={() => setFilterMenuOpen((current) => !current)}
            type="button"
          >
            <ListFilter aria-hidden="true" size={14} /> Filters
          </button>
          {filterMenuOpen && (
            <fieldset className="rd-task-filters__panel" id="rd-task-filter-panel">
              <legend>Task type</legend>
              {[
                ['scan', 'Scans'],
                ['metadata', 'Metadata'],
                ['analysis', 'Analysis'],
              ].map(([type, label]) => (
                <label key={type}>
                  <input checked={enabledTypes[type]} onChange={() => toggleTaskType(type)} type="checkbox" />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </div>

      <p aria-atomic="true" aria-live="polite" className="rd-sr-only">{announcement}</p>

      <div className="rd-tasks__workspace">
        <div className="rd-task-list-pane">
          <div className="rd-task-list-pane__head">
            <span>Task queue</span>
            <span>{visibleTasks.length} shown</span>
          </div>

          <div aria-label="Task queue" className="rd-task-list">
            {visibleTasks.map((task) => {
              const status = taskStatus(task);
              const progress = taskProgress(task);
              const Icon = taskTypeIcon(task);
              return (
                <button
                  className={`rd-task-row ${selectedTask?.id === task.id ? 'rd-selected' : ''}`}
                  aria-pressed={selectedTask?.id === task.id}
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  type="button"
                >
                  <span className="rd-task-row__icon"><Icon aria-hidden="true" size={15} /></span>
                  <span className="rd-task-row__main">
                    <span className="rd-task-row__topline"><strong>{task.title}</strong><TaskStatus status={status} /></span>
                    <small>{task.subtitle || task.locationName || task.phase}</small>
                    <span className="rd-task-row__progress"><span style={{ width: `${progress}%` }} /></span>
                    <span className="rd-task-row__meta">
                      <span>{progress}%</span>
                      <span>{formatInteger(task.processed)} / {formatInteger(task.total)}</span>
                      <span>{task.eta || (status === 'completed' ? 'Done' : '—')}</span>
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="rd-task-row__chevron" size={14} />
                </button>
              );
            })}
            {visibleTasks.length === 0 && <div className="rd-task-list__empty">No tasks match this filter.</div>}
          </div>
        </div>

        <div className="rd-task-detail">
          {selectedTask ? (
            <>
              <header className="rd-task-detail__header">
                <div className="rd-task-detail__identity">
                  <span className="rd-task-detail__icon">{(() => { const Icon = taskTypeIcon(selectedTask); return <Icon aria-hidden="true" size={17} />; })()}</span>
                  <div>
                    <div className="rd-task-detail__title-line"><h2>{selectedTask.title}</h2><TaskStatus status={selectedStatus} /></div>
                    <p>{selectedTask.subtitle || selectedTask.locationName || 'Background file operation'}</p>
                  </div>
                </div>
                <div className="rd-task-actions">
                  {selectedStatus === 'running' && (
                    <button className="rd-button rd-button--quiet" onClick={() => transitionTask('paused')} type="button"><Pause aria-hidden="true" size={14} /> Pause</button>
                  )}
                  {selectedStatus === 'paused' && (
                    <button className="rd-button rd-button--primary" onClick={() => transitionTask('running')} type="button"><Play aria-hidden="true" size={14} /> Resume</button>
                  )}
                  {['running', 'paused'].includes(selectedStatus) && selectedTask.cancellable !== false && (
                    <button className="rd-button rd-button--danger" onClick={() => transitionTask('stopping')} type="button"><CircleStop aria-hidden="true" size={14} /> Stop</button>
                  )}
                  {selectedStatus === 'stopping' && <span className="rd-stopping-note">Waiting for {selectedTask.activeWorkers} workers</span>}
                </div>
              </header>

              <div className="rd-task-overview">
                <div className="rd-task-overview__progress">
                  <span><strong>{selectedProgress}%</strong><small>{selectedTask.phase || statusLabel(selectedStatus)}</small></span>
                  <div><span style={{ width: `${selectedProgress}%` }} /></div>
                </div>
                <dl>
                  <div><dt>Processed</dt><dd>{formatInteger(selectedTask.processed)} / {formatInteger(selectedTask.total)}</dd></div>
                  <div><dt>Rate</dt><dd>{selectedTask.rate || '—'}</dd></div>
                  <div><dt>Remaining</dt><dd>{selectedTask.eta || '—'}</dd></div>
                  <div><dt>Started</dt><dd>{selectedTask.startedAt || '—'}</dd></div>
                  <div><dt>Errors</dt><dd className={Number(selectedTask.errors) > 0 ? 'is-warning' : ''}>{formatInteger(selectedTask.errors)}</dd></div>
                </dl>
              </div>

              <div className="rd-task-detail__body">
                <section className="rd-worker-section" aria-label="Worker pool">
                  <div className="rd-section-heading">
                    <span><ServerCog aria-hidden="true" size={14} /> Worker pool</span>
                    <small>{selectedTask.activeWorkers} active / {selectedTask.workerCapacity} capacity</small>
                  </div>
                  <div className="rd-worker-lanes">
                    {workers.map((worker) => (
                      <div className={`rd-worker-lane rd-worker-lane--${worker.state}`} key={worker.id}>
                        <span className="rd-worker-lane__state" aria-hidden="true" />
                        <strong>{worker.label}</strong>
                        <span>{worker.phase}</span>
                        <div className="rd-worker-lane__meter"><span style={{ width: `${worker.progress}%` }} /></div>
                        <small>{worker.state === 'active' ? `${worker.progress}% batch` : 'Idle'}</small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rd-events-section" aria-label="Recent task events">
                  <div className="rd-section-heading">
                    <span><FileClock aria-hidden="true" size={14} /> Recent events</span>
                    <small>Newest first</small>
                  </div>
                  <div className="rd-event-list">
                    {taskEvents.map((event) => (
                      <div className="rd-event-row" key={event.id}>
                        <span className={`rd-event-row__mark rd-event-row__mark--${event.status || 'info'}`} aria-hidden="true" />
                        <time>{event.time}</time>
                        <span>{event.message}</span>
                      </div>
                    ))}
                    {taskEvents.length === 0 && <div className="rd-event-list__empty">No recent events for this task.</div>}
                  </div>
                </section>
              </div>

              <footer className="rd-task-detail__footer">
                <span><Gauge aria-hidden="true" size={13} /> {selectedTask.rate || 'No current throughput'}</span>
                <span><Users aria-hidden="true" size={13} /> {selectedTask.activeWorkers} active workers</span>
                <span><Clock3 aria-hidden="true" size={13} /> {selectedTask.eta || 'No estimate'}</span>
              </footer>
            </>
          ) : (
            <div className="rd-task-detail__empty">Select a task to inspect its activity.</div>
          )}
        </div>
      </div>
    </section>
  );
}
