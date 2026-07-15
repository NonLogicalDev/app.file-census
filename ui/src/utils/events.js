import { bytes, statusLabel, when } from './format.js';

const hiddenRecentEventKinds = new Set([
  'connected',
  'events_lagged',
  'scan_progress',
  'scan_progress_snapshot',
  'scan_log',
  'scan_log_batch',
  'file_extra_info_progress'
]);

const eventTitles = {
  database_changed: 'Database changed',
  location_added: 'Location added',
  location_updated: 'Location updated',
  location_deleted: 'Location deleted',
  scan_started: 'Scan started',
  scan_update_started: 'Update started',
  scan_repair_started: 'Repair started',
  scan_finished: 'Scan complete',
  scan_stopped: 'Scan stopped',
  scan_failed: 'Scan failed',
  scan_paused: 'Scan paused',
  scan_resumed: 'Scan resumed',
  scan_deleted: 'Scan deleted',
  scan_path_deleted: 'Path removed',
  scan_representative_set: 'Representative changed',
  scan_metadata_updated: 'Scan details updated',
  scan_notes_updated: 'Scan notes updated',
  scan_excludes_updated: 'Scan excludes updated',
  scan_recovery_completed: 'Recovery completed',
  duplicate_cache_rebuild_started: 'Duplicate cache started',
  duplicate_cache_ready: 'Duplicate cache ready',
  duplicate_cache_rebuild_completed: 'Duplicate cache complete',
  duplicate_cache_failed: 'Duplicate cache failed',
  file_extra_info_started: 'EXIF scan started',
  file_extra_info_finished: 'EXIF scan complete',
  file_extra_info_stopped: 'EXIF scan stopped',
  file_extra_info_stop_requested: 'EXIF scan stop requested',
  file_extra_info_failed: 'EXIF scan failed'
};

export function isUserVisibleEvent(event) {
  return Boolean(event?.kind) && !hiddenRecentEventKinds.has(event.kind);
}

export function formatUserEvent(event) {
  const payload = event?.payload || {};
  const title = eventTitles[event?.kind] || titleizeKind(event?.kind || 'event');
  const detail = eventDetail(event?.kind, payload);
  const time = payload.finished_at || payload.started_at || payload.created_at || null;

  return {
    title,
    detail,
    timeLabel: time ? when(time) : ''
  };
}

function eventDetail(kind, payload) {
  if (kind === 'scan_recovery_completed') {
    return `${payload.interrupted || 0} interrupted scans marked for repair`;
  }

  if (kind?.startsWith('duplicate_cache_')) {
    const status = payload.status || {};
    const parts = [];
    if (status.status) parts.push(statusLabel(status.status));
    if (typeof status.processed_files === 'number' || typeof status.total_files === 'number') {
      parts.push(`${(status.processed_files || 0).toLocaleString()} / ${(status.total_files || 0).toLocaleString()} files`);
    }
    if (typeof payload.elapsed_ms === 'number') parts.push(`${payload.elapsed_ms} ms`);
    if (payload.error) parts.push(payload.error);
    return parts.join(' - ') || 'Duplicate counters changed';
  }

  if (kind?.startsWith('file_extra_info_')) {
    const parts = [];
    if (payload.processor) parts.push(String(payload.processor).toUpperCase());
    if (typeof payload.processed === 'number' || typeof payload.considered === 'number') {
      parts.push(`${(payload.processed || 0).toLocaleString()} / ${(payload.considered || 0).toLocaleString()} files`);
    }
    if (typeof payload.enriched === 'number') parts.push(`${payload.enriched.toLocaleString()} enriched`);
    if (typeof payload.skipped === 'number') parts.push(`${payload.skipped.toLocaleString()} skipped`);
    if (Array.isArray(payload.errors) && payload.errors.length) parts.push(`${payload.errors.length.toLocaleString()} errors`);
    if (payload.path) parts.push(payload.path);
    if (payload.error || payload.message) parts.push(payload.error || payload.message);
    return parts.join(' - ') || 'Extra file metadata changed';
  }

  if (kind?.startsWith('location_')) {
    return locationLabel(payload) || payload.slug || 'Location list changed';
  }

  const parts = [];
  const location = locationLabel(payload);
  if (location) parts.push(location);
  if (payload.status) parts.push(statusLabel(payload.status));
  if (typeof payload.file_count === 'number') {
    parts.push(`${payload.file_count.toLocaleString()} files`);
  }
  if (typeof payload.total_bytes === 'number') {
    parts.push(bytes(payload.total_bytes));
  }
  if (typeof payload.error_count === 'number' && payload.error_count > 0) {
    parts.push(`${payload.error_count.toLocaleString()} errors`);
  }
  if (payload.path) parts.push(payload.path);
  if (payload.error || payload.message) parts.push(payload.error || payload.message);

  return parts.join(' - ') || 'Background file work changed';
}

function locationLabel(payload) {
  if (payload.location_name && payload.location_slug && payload.location_name !== payload.location_slug) {
    return `${payload.location_name} (${payload.location_slug})`;
  }
  return payload.location_name || payload.location_slug || payload.name || payload.slug || '';
}

function titleizeKind(kind) {
  return kind
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}
