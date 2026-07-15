import {
  emptyTextClassName,
  mutedInlineClassName,
  StatusPill
} from '../components/ui/index.jsx';
import { formatUserEvent } from '../utils/events.js';
import { bytes, isActiveStatus, statusLabel, when } from '../utils/format.js';

export default function DashboardPage({
  overview,
  liveScans = [],
  backgroundTasks = [],
  eventLog = [],
  activityState = 'initial-loading',
  activityDetail = ''
}) {
  const activeWork = dashboardWorkItems(liveScans, backgroundTasks);
  const isLive = activityState === 'live';

  return (
    <section
      aria-label="Dashboard workspace"
      className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-canvas"
    >
      <div className="min-w-0">
        {overview ? (
          <dl className="grid min-w-0 grid-cols-5 overflow-x-auto border-b border-border bg-surface-subtle max-[760px]:grid-cols-3" aria-label="Database metrics">
            <Metric label="Locations" value={overview.location_count} />
            <Metric label="Scans" value={overview.scan_count} />
            <Metric label="Files" value={overview.file_count} />
            <Metric label="Indexed" value={bytes(overview.total_bytes)} />
            <Metric label="Dupe groups" value={overview.duplicate_groups} />
          </dl>
        ) : (
          <div className="border-b border-border px-3 py-3">
            <p className={`${emptyTextClassName} m-0 text-sm`} role="status">{dashboardStateMessage(activityState, activityDetail, 'metrics')}</p>
          </div>
        )}
        {!isLive && overview && (
          <p className="m-0 border-b border-border bg-surface-subtle px-3 py-1.5 text-[11px] text-muted" role="status">
            {dashboardStateMessage(activityState, activityDetail, 'metrics')}
          </p>
        )}
      </div>

      <section className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] max-[900px]:grid-cols-1">
        <section className="grid min-h-0 min-w-0 grid-rows-[34px_minmax(0,1fr)] border-r border-border max-[900px]:border-b max-[900px]:border-r-0" aria-label="Active work">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-subtle px-3">
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Active work</h3>
            <StatusPill variant={activityPillVariant(activityState, activeWork.length)} dot>
              {activityPillLabel(activityState, activeWork.length)}
            </StatusPill>
          </div>

          {!isLive ? (
            <p className={`${emptyTextClassName} m-0 grid min-h-32 place-items-center px-3 text-center text-sm`} role="status">
              {dashboardStateMessage(activityState, activityDetail, 'activity')}
            </p>
          ) : activeWork.length ? (
            <div className="min-h-0 overflow-auto">
              {activeWork.slice(0, 3).map((item) => (
                <article
                  className="grid min-h-[64px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-3 py-2 last:border-b-0"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-xs font-medium text-ink">{item.title}</strong>
                    {item.subtitle && (
                      <span className="block truncate text-[11px] text-muted">{item.subtitle}</span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                      {item.facts.map((fact) => <span key={fact}>{fact}</span>)}
                    </div>
                  </div>
                  <StatusPill variant={scanStatusVariant(item.status)}>{statusLabel(item.status)}</StatusPill>
                </article>
              ))}
            </div>
          ) : (
            <p className={`${emptyTextClassName} m-0 grid min-h-32 place-items-center px-3 text-center text-sm`}>No active work is currently reported.</p>
          )}
        </section>

        <section className="grid min-h-0 min-w-0 grid-rows-[34px_minmax(0,1fr)]" aria-label="Current app-session activity">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-subtle px-3">
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Current app-session activity</h3>
            <span className={`${mutedInlineClassName} text-[11px]`}>{eventLog.length ? `${Math.min(eventLog.length, 5)} shown` : 'None'}</span>
          </div>
          {eventLog.length ? (
            <div className="min-h-0 overflow-auto">
              {eventLog.slice(0, 5).map((event, index) => {
                const formatted = formatUserEvent(event);
                return (
                  <div className="grid min-h-[42px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-2 text-[11px] last:border-b-0" key={`${event.kind}-${index}`}>
                    <strong className="truncate font-medium text-ink">{formatted.title}</strong>
                    {formatted.timeLabel && <span className={`${mutedInlineClassName} whitespace-nowrap text-[11px]`}>{formatted.timeLabel}</span>}
                    <span className={`${mutedInlineClassName} truncate text-[11px]`}>{formatted.detail}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`${emptyTextClassName} m-0 grid min-h-32 place-items-center px-3 text-center text-sm`}>No current app-session changes recorded.</p>
          )}
        </section>
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="grid min-w-[112px] content-center gap-1 border-r border-border px-3 py-2.5 last:border-r-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="m-0 truncate text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function scanStatusVariant(status) {
  if (status === 'stopping' || status === 'paused') return 'warning';
  if (status === 'interrupted' || status === 'failed') return 'danger';
  return 'primary';
}

function dashboardWorkItems(liveScans, backgroundTasks) {
  return [
    ...liveScans.filter((scan) => isActiveStatus(scan.status)).map((scan) => ({
      id: `scan:${scan.scan_id || scan.id}`,
      title: scan.location_name || scan.location_slug || 'Scan',
      subtitle: scan.location_name && scan.location_slug && scan.location_name !== scan.location_slug ? scan.location_slug : 'Scan',
      status: scan.status,
      facts: [
        `${Number(scan.file_count || 0).toLocaleString()} files`,
        bytes(scan.total_bytes),
        scan.started_at ? when(scan.started_at) : 'Started time unavailable'
      ]
    })),
    ...backgroundTasks.filter((task) => isActiveStatus(task.status)).map((task) => ({
      id: `task:${task.id}`,
      title: task.title || 'Background task',
      subtitle: task.subtitle || 'Background work',
      status: task.status,
      facts: [
        task.total ? `${Number(task.processed || 0).toLocaleString()} / ${Number(task.total).toLocaleString()} processed` : `${Number(task.processed || 0).toLocaleString()} processed`,
        task.active ? `${Number(task.active).toLocaleString()} active workers` : 'Worker count unavailable',
        task.started_at ? when(task.started_at) : 'Started time unavailable'
      ]
    }))
  ];
}

function activityPillLabel(activityState, activeCount) {
  if (activityState === 'initial-loading') return 'Loading';
  if (activityState === 'failed') return 'Load failed';
  if (activityState === 'disconnected') return 'Disconnected';
  return activeCount ? `${activeCount} active` : 'Idle';
}

function activityPillVariant(activityState, activeCount) {
  if (activityState === 'failed' || activityState === 'disconnected') return 'danger';
  if (activityState === 'initial-loading') return 'warning';
  return activeCount ? 'primary' : 'secondary';
}

function dashboardStateMessage(activityState, activityDetail, area) {
  if (activityState === 'initial-loading') {
    return area === 'metrics'
      ? 'Loading authoritative database metrics…'
      : 'Loading authoritative active work…';
  }
  if (activityState === 'disconnected') {
    return area === 'metrics'
      ? 'Database metrics are unavailable while the connection is disconnected.'
      : 'Live activity is unavailable while the connection is disconnected.';
  }
  if (activityState === 'failed') {
    const detail = activityDetail ? ` ${activityDetail}` : '';
    return area === 'metrics'
      ? `Unable to load database metrics.${detail}`
      : `Unable to load authoritative active work.${detail}`;
  }
  return area === 'metrics' ? 'No database metrics are available.' : 'No active work is currently reported.';
}
