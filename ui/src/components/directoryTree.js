export const DIRECTORY_TREE_PAGE_LIMIT = 200;

export function directoryTreeScopeKey({ scanId, query = '', filters = [] } = {}) {
  return JSON.stringify({
    scanId: scanId || '',
    query: String(query || '').trim(),
    filters
  });
}

export function directoryOnlyEntries(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry || entry.kind !== 'dir' || typeof entry.path !== 'string' || seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
}

export function mergeDirectoryTreePage(current, page, { append = false } = {}) {
  const previous = append ? current?.entries || [] : [];
  const entries = directoryOnlyEntries([...previous, ...(page?.entries || [])]);

  return {
    entries,
    total: Number.isInteger(page?.total) ? page.total : entries.length,
    hasMore: Boolean(page?.has_more),
    nextOffset: page?.next_offset ?? null,
    scannedEntries: (append ? current?.scannedEntries || 0 : 0) + (page?.entries?.length || 0)
  };
}

export function directoryAncestorPaths(path, { includePath = false, maxDepth = Infinity } = {}) {
  const paths = [''];
  let current = '';
  const parts = String(path || '').split('/').filter(Boolean);
  const end = includePath ? parts.length : Math.max(parts.length - 1, 0);

  for (const part of parts.slice(0, Math.min(end, maxDepth))) {
    current = current ? `${current}/${part}` : part;
    paths.push(current);
  }
  return paths;
}
