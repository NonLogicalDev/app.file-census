import { scanLabel } from './format.js';

export function buildDuplicateTree(groups = [], scans = []) {
  const scanById = new Map((scans || []).filter(Boolean).map((scan) => [scan.id, scan]));
  const locations = new Map();

  for (const group of groups || []) {
    for (const file of group.files || []) {
      if (!file?.location_slug || !file.scan_id) continue;
      const locationKey = `location:${file.location_slug}`;
      let locationNode = locations.get(locationKey);
      if (!locationNode) {
        locationNode = {
          id: locationKey,
          type: 'location',
          name: file.location_name || file.location_slug,
          location_slug: file.location_slug,
          children: new Map()
        };
        locations.set(locationKey, locationNode);
      }

      const scanKey = `scan:${file.scan_id}`;
      let scanNode = locationNode.children.get(scanKey);
      if (!scanNode) {
        const scan = scanById.get(file.scan_id);
        scanNode = {
          id: scanKey,
          type: 'scan',
          name: scan ? scanLabel(scan) : file.scan_id,
          scan_id: file.scan_id,
          status: scan?.status || '',
          children: new Map()
        };
        locationNode.children.set(scanKey, scanNode);
      }

      insertFileNode(scanNode, group, file);
    }
  }

  return finalizeNodes([...locations.values()]);
}

function insertFileNode(scanNode, group, file) {
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
        name: part,
        path: prefix,
        scan_id: file.scan_id,
        children: new Map()
      };
      parent.children.set(folderKey, folderNode);
    }
    parent = folderNode;
  }

  parent.children.set(`file:${file.scan_id}:${file.path}`, {
    id: `file:${file.scan_id}:${file.path}`,
    type: 'file',
    name: fileName,
    path: file.path,
    scan_id: file.scan_id,
    size: file.size,
    blake3: file.blake3,
    file_kind: file.file_kind || group.file_kind || 'other',
    file,
    group
  });
}

function finalizeNodes(nodes) {
  return nodes
    .map((node) => {
      const children = node.children instanceof Map ? finalizeNodes([...node.children.values()]) : [];
      return { ...node, children };
    })
    .sort(compareDuplicateTreeNodes);
}

function compareDuplicateTreeNodes(a, b) {
  const rank = { location: 0, scan: 1, folder: 2, file: 3 };
  const rankDiff = (rank[a.type] ?? 9) - (rank[b.type] ?? 9);
  if (rankDiff) return rankDiff;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
}
