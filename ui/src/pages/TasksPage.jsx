import ScanProgressPools from '../components/ScanProgressPools.jsx';
import { Icon } from '../components/Icon.jsx';
import {
  Button,
  cardClassName,
  emptyTextClassName,
  mutedInlineClassName,
  pageGridClassName,
  stackedListClassName
} from '../components/ui/index.jsx';
import { formatUserEvent } from '../utils/events.js';
import { bytes, statusLabel } from '../utils/format.js';

export default function TasksPage({
  runningProgress = [],
  backgroundTasks = [],
  eventLog = [],
  busy = false,
  onStopScan
}) {
  const activeCount = runningProgress.length + backgroundTasks.length;
  const canStopScan = typeof onStopScan === 'function';

  return (
    <section className={pageGridClassName}>
      <section className={cardClassName}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 className="m-0 text-base">Running</h2>
          <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-bold text-muted-strong">
            {activeCount} active
          </span>
        </div>

        {activeCount ? (
          <div className={stackedListClassName}>
            {backgroundTasks.map((task) => (
              <article className="grid gap-2 rounded-panel border border-border bg-surface-muted p-3" key={task.id}>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <strong className="block truncate">{task.title}</strong>
                    <span className="block truncate text-sm text-muted">{task.subtitle}</span>
                  </div>
                  <span className="rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
                    {task.status === 'running' ? 'Building' : statusLabel(task.status)}
                  </span>
                </div>
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-muted">
                    <span>Files processed</span>
                    <span>{task.processed.toLocaleString()} / {task.total.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border border-border bg-surface">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${task.total > 0 ? Math.min(100, Math.round((task.processed / task.total) * 100)) : 12}%` }}
                    />
                  </div>
                </div>
              </article>
            ))}
            {runningProgress.map((progress) => (
              <article className="grid gap-2 rounded-panel border border-border bg-surface-muted p-3" key={progress.scan_id}>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <strong className="block truncate">
                      {progress.location_name || progress.location_slug}
                      {progress.location_name && progress.location_name !== progress.location_slug && (
                        <span className={mutedInlineClassName}> {progress.location_slug}</span>
                      )}
                    </strong>
                    <span className="block truncate text-sm text-muted">
                      {progress.file_count} indexed files - {bytes(progress.total_bytes)} - {progress.error_count} errors
                    </span>
                  </div>
                  <span className="rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
                    {statusLabel(progress.status)}
                  </span>
                </div>
                <ScanProgressPools progress={progress} />
                {canStopScan && progress.status !== 'stopping' && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="warning" onClick={() => onStopScan(progress.scan_id)} disabled={busy} icon={<Icon name="stop" />}>Stop</Button>
                  </div>
                )}
                {(progress.status === 'paused' || progress.status === 'repairing') && (
                  <p className="m-0 text-xs text-muted">
                    {progress.status === 'paused'
                      ? 'Pause and resume are unavailable in this build.'
                      : 'Repair is unavailable in this build.'}{' '}
                    Use a new scan to refresh this location.
                  </p>
                )}
                {progress.current_path && (
                  <code className="block min-w-0 truncate text-sm text-muted" title={progress.current_path}>
                    {progress.current_path}
                  </code>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className={emptyTextClassName}>No background file work is running.</p>
        )}
      </section>

      <section className={cardClassName}>
        <h2 className="m-0 text-base">Recent events</h2>
        {eventLog.length ? (
          <div className={stackedListClassName}>
            {eventLog.slice(0, 12).map((event, index) => {
              const formatted = formatUserEvent(event);
              return (
                <div className="grid gap-1 rounded-ui border border-border bg-surface-muted p-2 text-sm" key={`${event.kind}-${index}`}>
                  <strong>{formatted.title}</strong>
                  <span className={mutedInlineClassName}>{formatted.detail}</span>
                  {formatted.timeLabel && <span className={mutedInlineClassName}>{formatted.timeLabel}</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className={emptyTextClassName}>No recent events recorded.</p>
        )}
      </section>
    </section>
  );
}
