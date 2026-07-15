export function requireTreePage(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Array.isArray(value.entries)
    || !Number.isInteger(value.limit)
    || !Number.isInteger(value.offset)
    || !Number.isInteger(value.total)
    || typeof value.has_more !== 'boolean'
    || !(value.next_offset === null || Number.isInteger(value.next_offset))
    || !isDuplicateCacheStatus(value.duplicate_cache)
  ) {
    throw new Error('scans.tree returned an invalid page');
  }
  return value;
}

function isDuplicateCacheStatus(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value.fingerprint === null || typeof value.fingerprint === 'string')
    && typeof value.status === 'string'
    && (value.run_id === null || typeof value.run_id === 'string')
    && Number.isInteger(value.total_files)
    && Number.isInteger(value.processed_files)
    && Number.isInteger(value.scan_count)
    && (value.started_at === null || typeof value.started_at === 'string')
    && (value.ready_at === null || typeof value.ready_at === 'string')
    && (value.error === null || typeof value.error === 'string')
  );
}
