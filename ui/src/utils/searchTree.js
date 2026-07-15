import { scanLabel } from './format.js';

export function buildSearchTree(files = [], scans = []) {
  const scanById = new Map((scans || []).filter(Boolean).map((scan) => [scan.id, scan]));
  const locations = new Map();

  for (const file of files || []) {
    if (!file?.location_slug || !file.scan_id) continue;
    const fileLike = isFileLike(file);
    const locationKey = `location:${file.location_slug}`;
    let locationNode = locations.get(locationKey);
    if (!locationNode) {
      locationNode = {
        id: locationKey,
        type: 'location',
        kind: 'location',
        name: file.location_name || file.location_slug,
        location_slug: file.location_slug,
        path: file.location_slug,
        file_count: 0,
        children: new Map()
      };
      locations.set(locationKey, locationNode);
    }
    locationNode.file_count += fileLike ? 1 : 0;

    const scanKey = `scan:${file.scan_id}`;
    let scanNode = locationNode.children.get(scanKey);
    if (!scanNode) {
      const scan = scanById.get(file.scan_id);
      scanNode = {
        id: scanKey,
        type: 'scan',
        kind: 'scan',
        name: scan ? scanLabel(scan) : file.scan_id,
        scan_id: file.scan_id,
        scan_started_at: scan?.started_at || null,
        ctime: scan?.started_at || null,
        status: scan?.status || '',
        file_count: 0,
        children: new Map()
      };
      locationNode.children.set(scanKey, scanNode);
    }
    scanNode.file_count += fileLike ? 1 : 0;

    insertFileNode(scanNode, file);
  }

  return finalizeNodes([...locations.values()]);
}

function insertFileNode(scanNode, file) {
  const fileLike = isFileLike(file);
  const parts = String(file.path || file.name || '').split('/').filter(Boolean);
  const fileName = parts.pop() || file.name || file.path || 'file';
  let parent = scanNode;
  let prefix = '';

  for (const part of parts) {
    prefix = prefix ? `${prefix}/${part}` : part;
    const folderKey = `folder:${file.scan_id}:${prefix}`;
    let folderNode = parent.children.get(folderKey);
    if (!folderNode) {
      folderNode = {
        id: folderKey,
        type: 'folder',
        kind: 'dir',
        name: part,
        path: prefix,
        scan_id: file.scan_id,
        file_count: 0,
        children: new Map()
      };
      parent.children.set(folderKey, folderNode);
    }
    folderNode.file_count += fileLike ? 1 : 0;
    parent = folderNode;
  }

  parent.children.set(`file:${file.scan_id}:${file.path}`, {
    id: `file:${file.scan_id}:${file.path}`,
    type: 'file',
    kind: file.kind || 'file',
    name: fileName,
    path: file.path,
    scan_id: file.scan_id,
    location_slug: file.location_slug,
    location_name: file.location_name,
    size: file.size,
    blake3: file.blake3,
    sha256: file.sha256,
    ctime: file.ctime,
    mtime: file.mtime,
    mode: file.mode,
    error: file.error,
    file_count: fileLike ? 1 : 0,
    file
  });
}

function finalizeNodes(nodes) {
  return nodes
    .map((node) => {
      const children = node.children instanceof Map ? finalizeNodes([...node.children.values()]) : [];
      return { ...node, children };
    })
    .sort(compareSearchTreeNodes);
}

function compareSearchTreeNodes(a, b) {
  const rank = { location: 0, scan: 1, folder: 2, file: 3 };
  const rankDiff = (rank[a.type] ?? 9) - (rank[b.type] ?? 9);
  if (rankDiff) return rankDiff;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function isFileLike(file) {
  return file?.kind !== 'dir' && file?.kind !== 'location' && file?.kind !== 'scan';
}
