export const commandRoutes = {
  locations: '#/redesign/location-scan-browser',
  duplicates: '#/redesign/duplicates',
  tasks: '#/redesign/tasks',
};

const sharedLocations = [
  {
    id: 'location-nlmedia',
    label: 'NLMedia 01',
    detail: 'Online · representative scan Jul 8, 1:16 AM · 417,892 files',
    keywords: 'location volume current media representative scan',
    icon: 'hard-drive',
    action: { type: 'open-location', locationId: 'nl-media-01', value: 'NLMedia 01', notice: 'Opened NLMedia 01 representative scan.' },
  },
  {
    id: 'location-nlbackup',
    label: 'NLBackup',
    detail: 'Online · representative scan Jul 10, 8:18 PM',
    keywords: 'location volume backup scan complete',
    icon: 'database',
    action: { type: 'open-location', locationId: 'nl-backup', value: 'NLBackup', notice: 'Opened NLBackup representative scan.' },
  },
  {
    id: 'location-archive',
    label: 'Archive Cold 02',
    detail: 'Offline · representative scan Jun 28, 3:04 PM',
    keywords: 'location volume archive cold offline scan',
    icon: 'archive',
    action: { type: 'open-location', locationId: 'archive-cold-02', value: 'Archive Cold 02', notice: 'Opened Archive Cold 02 representative scan.' },
  },
];

const sharedNavigation = [
  { id: 'nav-locations', label: 'Locations', detail: 'Browse scans and files', keywords: 'navigation go', icon: 'hard-drive', href: commandRoutes.locations },
  { id: 'nav-duplicates', label: 'Duplicates', detail: 'Compare exact content identity', keywords: 'navigation go copy hashes', icon: 'copy', href: commandRoutes.duplicates },
  { id: 'nav-tasks', label: 'Tasks', detail: 'Inspect background work', keywords: 'navigation go queue workers', icon: 'list-checks', href: commandRoutes.tasks },
  { id: 'nav-options', label: 'Options', detail: 'Application preferences', keywords: 'navigation settings preferences menu', icon: 'settings', action: { type: 'notice', value: 'Options opened in this prototype.' } },
  { id: 'nav-help', label: 'Help', detail: 'Keyboard shortcuts and support', keywords: 'navigation docs shortcuts menu', icon: 'help', action: { type: 'notice', value: 'Help opened in this prototype.' } },
];

function compactHash(hash, fallback = 'Verified content hash') {
  const value = String(hash || '');
  return value.length > 24 ? `${value.slice(0, 16)}…${value.slice(-7)}` : value || fallback;
}

function buildLocationContext(context) {
  const file = context.selectedFile || {};
  const location = context.location || {};
  const fileName = file.name || 'Brand_Film_Master_v18.mov';
  const relativePath = file.path || 'Projects/Brand Film/Exports/Brand_Film_Master_v18.mov';
  const mountPath = location.mountPath || '/Volumes/NLMedia 01';
  const fullPath = relativePath.startsWith('/') ? relativePath : `${mountPath}/${relativePath}`;
  const hash = file.hash || 'b3:0017d9c42a18fca682e09b4ddf1236b8e';
  return [
  {
    id: 'file-reveal',
    label: 'Reveal in Finder',
    detail: 'Desktop app only',
    keywords: 'file reveal finder show',
    icon: 'folder-open',
    disabled: true,
  },
  {
    id: 'file-open-folder',
    label: 'Open containing folder',
    detail: 'Desktop app only',
    keywords: 'file reveal finder directory',
    icon: 'folder',
    disabled: true,
  },
  {
    id: 'file-copy-path',
    label: 'Copy full path',
    detail: fullPath,
    keywords: `file clipboard path ${fileName}`,
    icon: 'copy',
    action: { type: 'notice', value: 'Full path staged locally (clipboard is disabled in the prototype).' },
  },
  {
    id: 'file-copy-hash',
    label: 'Copy BLAKE3 hash',
    detail: compactHash(hash),
    keywords: 'file clipboard checksum exact identity hash',
    icon: 'hash',
    action: { type: 'notice', value: 'BLAKE3 hash staged locally (clipboard is disabled in the prototype).' },
  },
  {
    id: 'file-find-duplicates',
    label: 'Find exact duplicates',
    detail: 'Search by verified content identity',
    keywords: 'file duplicate copies hash exact',
    icon: 'scan-search',
    href: commandRoutes.duplicates,
    action: { type: 'find-exact-duplicates', fileId: file.id, name: fileName, hash, notice: `Finding exact duplicates of ${fileName}.` },
  },
  {
    id: 'file-delete-check',
    label: 'Add to Delete Check',
    detail: `Mark ${fileName} for verification`,
    keywords: 'file safety verify delete check',
    icon: 'check-square',
    action: { type: 'location-stage-delete-check', fileId: file.id, value: fileName, notice: `Added ${fileName} to Delete Check.` },
  },
  ];
}

function buildDuplicateContext(context) {
  const group = context.selectedGroup || {};
  const label = group.label || 'beach.JPG';
  const files = group.files || [];
  const firstFile = files[0] || {};
  const copyCount = files.length || group.count || 2;
  return [
    { id: 'duplicate-expand', label: 'Expand selected duplicate group', detail: `${label} · ${copyCount} exact copies`, keywords: 'current duplicate group files', icon: 'unfold', action: { type: 'duplicate-expand', groupId: group.id, notice: `Expanded ${label}.` } },
    { id: 'duplicate-copy-hash', label: 'Copy group hash', detail: compactHash(group.hash), keywords: 'current duplicate checksum identity hash', icon: 'hash', action: { type: 'notice', value: 'Duplicate group hash staged locally.' } },
    { id: 'duplicate-delete-check', label: 'Add selected copy to Delete Check', detail: firstFile.path || `Stage one copy of ${label} for review`, keywords: 'current duplicate safety delete verify', icon: 'check-square', action: { type: 'duplicate-stage-delete-check', groupId: group.id, path: firstFile.path, notice: `Added one copy of ${label} to Delete Check.` } },
    { id: 'duplicate-reveal', label: 'Reveal selected copy in Finder', detail: 'Desktop app only', keywords: 'current duplicate folder finder', icon: 'folder-open', disabled: true },
  ];
}

function buildTaskContext(context) {
  const task = context.selectedTask || {};
  const title = task.title || 'Scanning NLMedia 01';
  const rawStatus = String(task.status || 'running').toLocaleLowerCase();
  const status = rawStatus === 'complete' ? 'completed' : rawStatus;
  const running = status === 'running';
  const paused = status === 'paused';
  const unavailableReason = `Unavailable while task is ${status}.`;
  const cancellable = (running || paused) && task.cancellable !== false;
  return [
    { id: 'task-open', label: 'Open selected task', detail: `${title} · ${task.subtitle || task.phase || status}`, keywords: 'current task details workers', icon: 'activity', action: { type: 'notice', value: `Focused ${title}.` } },
    running
      ? { id: 'task-pause', label: 'Pause selected task', detail: 'Release active workers after current files', keywords: 'current task stop suspend workers', icon: 'pause', action: { type: 'task-transition', taskId: task.id, value: 'paused', notice: `Pause requested for ${title}.` } }
      : paused
        ? { id: 'task-resume', label: 'Resume selected task', detail: 'Restart workers from the saved queue', keywords: 'current task play continue workers', icon: 'activity', action: { type: 'task-transition', taskId: task.id, value: 'running', notice: `Resume requested for ${title}.` } }
        : { id: 'task-pause', label: 'Pause selected task', detail: unavailableReason, keywords: 'current task stop suspend workers', icon: 'pause', disabled: true },
    { id: 'task-stop', label: 'Stop selected task', detail: cancellable ? 'Finish current files, then stop workers' : task.cancellable === false ? 'This task cannot be stopped.' : unavailableReason, keywords: 'current task cancel workers', icon: 'circle-stop', disabled: !cancellable, action: cancellable ? { type: 'task-transition', taskId: task.id, value: 'stopping', notice: `Stop requested for ${title}.` } : undefined },
  ];
}

const viewCommands = {
  location: [
    { id: 'view-files', label: 'Show Files', detail: 'Switch browser to the file table', keywords: 'view menu mode', icon: 'list', action: { type: 'location-mode', value: 'Files', notice: 'Showing Files.' } },
    { id: 'view-file-tree', label: 'Show File tree', detail: 'Browse the selected scan as folders', keywords: 'view menu mode folders', icon: 'folder-tree', action: { type: 'location-mode', value: 'File tree', notice: 'Showing File tree.' } },
    { id: 'view-delete-check', label: 'Show Delete Check', detail: 'Review exact-content coverage', keywords: 'view menu mode verification', icon: 'check-square', action: { type: 'location-mode', value: 'Delete Check', notice: 'Showing Delete Check.' } },
    { id: 'view-inspector', label: 'Toggle Inspector', detail: 'Show metadata for the selected file', keywords: 'view menu panel details', icon: 'panel-right', action: { type: 'location-inspector', value: 'toggle', notice: 'Toggled the file inspector.' } },
    { id: 'view-filters', label: 'Advanced filters', detail: 'Filter by kind and file size', keywords: 'view menu filter', icon: 'sliders', action: { type: 'location-advanced', value: 'open', notice: 'Advanced filters opened.' } },
    { id: 'view-columns', label: 'Choose visible columns', detail: 'Name, path, size, modified, and kind', keywords: 'view menu columns table fields', icon: 'columns', action: { type: 'location-columns', value: 'open', notice: 'Column menu opened.' } },
  ],
  duplicates: [
    { id: 'view-duplicates-flat', label: 'Flat list', detail: 'Show duplicate groups as rows', keywords: 'view menu list', icon: 'list', action: { type: 'duplicates-view', value: 'flat', notice: 'Showing duplicate groups as a flat list.' } },
    { id: 'view-duplicates-tree', label: 'Folder tree', detail: 'Group copies by folder hierarchy', keywords: 'view menu folders', icon: 'folder-tree', action: { type: 'duplicates-view', value: 'tree', notice: 'Showing duplicates as a folder tree.' } },
    { id: 'view-representative', label: 'Representative scan set', detail: 'Compare the newest completed scan per location', keywords: 'view menu scope scans', icon: 'layers', action: { type: 'duplicates-scope', value: 'representative', notice: 'Using representative scans.' } },
    { id: 'view-duplicate-filters', label: 'Advanced filters', detail: 'Filter by copies, kind, and sort order', keywords: 'view menu filter', icon: 'sliders', action: { type: 'duplicates-advanced', value: 'open', notice: 'Advanced duplicate filters opened.' } },
  ],
  tasks: [
    { id: 'view-tasks-active', label: 'Show active tasks', detail: 'Running, paused, stopping, and queued', keywords: 'view menu filter', icon: 'activity', action: { type: 'tasks-filter', value: 'active', notice: 'Showing active tasks.' } },
    { id: 'view-tasks-all', label: 'Show all tasks', detail: 'Include completed and failed work', keywords: 'view menu filter history', icon: 'list', action: { type: 'tasks-filter', value: 'all', notice: 'Showing all tasks.' } },
    { id: 'view-tasks-finished', label: 'Show finished tasks', detail: 'Completed and failed work', keywords: 'view menu filter history', icon: 'check', action: { type: 'tasks-filter', value: 'finished', notice: 'Showing finished tasks.' } },
    { id: 'view-task-filters', label: 'Task type filters', detail: 'Scans, metadata, and analysis', keywords: 'view menu filter kinds', icon: 'sliders', action: { type: 'tasks-menu', value: 'open', notice: 'Task type filters opened.' } },
  ],
};

export function buildCommandGroups(screen = 'location', context = {}) {
  const activeScreen = ['location', 'duplicates', 'tasks'].includes(screen) ? screen : 'location';
  const contextual = activeScreen === 'location'
    ? {
        label: `Current file · ${context.selectedFile?.name || 'Brand_Film_Master_v18.mov'}`,
        commands: buildLocationContext(context),
      }
    : activeScreen === 'duplicates'
      ? {
          label: `Current duplicate group · ${context.selectedGroup?.label || 'beach.JPG'}`,
          commands: buildDuplicateContext(context),
        }
      : {
          label: `Current task · ${context.selectedTask?.title || 'Scanning NLMedia 01'}`,
          commands: buildTaskContext(context),
        };

  return [
    contextual,
    { label: 'Locations', commands: sharedLocations },
    { label: 'Navigation', commands: sharedNavigation },
    { label: 'View & menu', commands: viewCommands[activeScreen] },
  ];
}

function searchTokens(value) {
  return String(value || '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function commandSearchScore(command, query) {
  const queryTokens = searchTokens(query);
  if (!queryTokens.length) return 1;
  const labelTokens = searchTokens(command.label);
  const candidateTokens = searchTokens(`${command.label} ${command.detail || ''} ${command.keywords || ''}`);
  const normalizedQuery = queryTokens.join(' ');
  const normalizedLabel = labelTokens.join(' ');
  const compactQuery = queryTokens.join('');
  const compactLabel = labelTokens.join('');
  const compactCandidate = candidateTokens.join('');
  const matched = queryTokens.every((token) => candidateTokens.some((candidate) => candidate === token || candidate.startsWith(token) || candidate.includes(token)) || compactCandidate.includes(token));
  if (!matched) return 0;
  if (normalizedLabel === normalizedQuery || compactLabel === compactQuery) return 1000;
  if (normalizedLabel.startsWith(normalizedQuery)) return 800;
  const exactLabelTokens = queryTokens.filter((token) => labelTokens.includes(token)).length;
  const prefixLabelTokens = queryTokens.filter((token) => labelTokens.some((candidate) => candidate.startsWith(token))).length;
  return 300 + exactLabelTokens * 80 + prefixLabelTokens * 30;
}

export function filterCommandGroups(groups, query) {
  if (!String(query || '').trim()) return groups;
  return groups
    .map((group) => ({
      ...group,
      commands: group.commands
        .map((command, index) => ({ command, index, score: commandSearchScore(command, query) }))
        .filter((result) => result.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map((result) => result.command),
    }))
    .filter((group) => group.commands.length > 0);
}
