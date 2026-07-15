export function shortHash(hash) {
  return hash ? hash.slice(0, 12) : '';
}

export function when(value) {
  return value ? new Date(value).toLocaleString() : 'never';
}

export function bytes(value) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(value || 0);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function statusLabel(status) {
  if (status === 'complete') return 'Ready';
  if (status === 'running') return 'Scanning';
  if (status === 'repairing') return 'Repairing';
  if (status === 'paused') return 'Paused';
  if (status === 'stopping') return 'Stopping';
  if (status === 'stopped') return 'Stopped';
  if (status === 'interrupted') return 'Interrupted';
  if (status === 'failed') return 'Failed';
  return status || 'Unknown';
}

export function isActiveStatus(status) {
  return status === 'running' || status === 'repairing' || status === 'paused' || status === 'stopping';
}

export function scanLabel(scan) {
  return scan?.nickname || (scan?.started_at ? when(scan.started_at) : scan?.id || 'Scan');
}

export function scanDetail(scan) {
  const parts = [];
  if (scan?.status) parts.push(statusLabel(scan.status));
  if (typeof scan?.file_count === 'number') parts.push(`${scan.file_count} indexed`);
  if (scan?.started_at) parts.push(when(scan.started_at));
  return parts.join(' - ');
}
