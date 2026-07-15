export const commandRoutes = {
  locations: '#/redesign/location-scan-browser',
  duplicates: '#/redesign/duplicates',
  tasks: '#/redesign/tasks',
};

const sharedLocations = [
  {
    id: 'location-nlmedia',
    label: 'NLMedia 01',
    detail: 'Online · scan running · 283,444 files indexed',
    keywords: 'location volume current media scan',
    icon: 'hard-drive',
    action: { type: 'open-location', value: 'NLMedia 01' },
  },
  {
    id: 'location-nlbackup',
    label: 'NLBackup',
    detail: 'Online · representative scan Jul 10, 8:18 PM',
    keywords: 'location volume backup scan complete',
    icon: 'database',
    action: { type: 'open-location', value: 'NLBackup' },
  },
  {
    id: 'location-archive',
    label: 'Archive Cold 02',
    detail: 'Offline · representative scan Jun 28, 3:04 PM',
    keywords: 'location volume archive cold offline scan',
    icon: 'archive',
    action: { type: 'open-location', value: 'Archive Cold 02' },
  },
];

const sharedNavigation = [
  { id: 'nav-locations', label: 'Locations', detail: 'Browse scans and files', keywords: 'navigation go', icon: 'hard-drive', href: commandRoutes.locations },
  { id: 'nav-duplicates', label: 'Duplicates', detail: 'Compare exact content identity', keywords: 'navigation go copy hashes', icon: 'copy', href: commandRoutes.duplicates },
  { id: 'nav-tasks', label: 'Tasks', detail: 'Inspect background work', keywords: 'navigation go queue workers', icon: 'list-checks', href: commandRoutes.tasks },
  { id: 'nav-options', label: 'Options', detail: 'Application preferences', keywords: 'navigation settings preferences menu', icon: 'settings', action: { type: 'notice', value: 'Options opened in this prototype.' } },
  { id: 'nav-help', label: 'Help', detail: 'Keyboard shortcuts and support', keywords: 'navigation docs shortcuts menu', icon: 'help', action: { type: 'notice', value: 'Help opened in this prototype.' } },
];

const locationContext = [
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
    detail: '/Volumes/NLMedia 01/Projects/Brand Film/Exports/Brand_Film_Master_v18.mov',
    keywords: 'file clipboard path brand film master v18 mov',
    icon: 'copy',
    action: { type: 'notice', value: 'Full path staged locally (clipboard is disabled in the prototype).' },
  },
  {
    id: 'file-copy-hash',
    label: 'Copy BLAKE3 hash',
    detail: 'b3:0017d9c42a18…1236b8e',
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
  },
  {
    id: 'file-delete-check',
    label: 'Add to Delete Check',
    detail: 'Mark Brand_Film_Master_v18.mov for verification',
    keywords: 'file safety verify delete check',
    icon: 'check-square',
    action: { type: 'location-mode', value: 'Delete Check', notice: 'Added Brand_Film_Master_v18.mov to Delete Check.' },
  },
];

const duplicateContext = [
  { id: 'duplicate-expand', label: 'Expand selected duplicate group', detail: 'beach.JPG · 2 exact copies', keywords: 'current duplicate group files', icon: 'unfold', action: { type: 'notice', value: 'Expanded the selected duplicate group.' } },
  { id: 'duplicate-copy-hash', label: 'Copy group hash', detail: 'b3:4053988039bf…4f25d8', keywords: 'current duplicate checksum identity', icon: 'hash', action: { type: 'notice', value: 'Duplicate group hash staged locally.' } },
  { id: 'duplicate-delete-check', label: 'Add selected copy to Delete Check', detail: 'Review before reclaiming 3.1 MB', keywords: 'current duplicate safety delete verify', icon: 'check-square', action: { type: 'notice', value: 'Selected duplicate copy added to Delete Check.' } },
  { id: 'duplicate-reveal', label: 'Reveal selected copy in Finder', detail: 'Desktop app only', keywords: 'current duplicate folder finder', icon: 'folder-open', disabled: true },
];

const taskContext = [
  { id: 'task-open', label: 'Open selected task', detail: 'Scanning NLMedia 01 · Metadata and content hashing', keywords: 'current task details workers', icon: 'activity', action: { type: 'notice', value: 'Focused Scanning NLMedia 01.' } },
  { id: 'task-pause', label: 'Pause selected task', detail: 'Release active workers after current files', keywords: 'current task stop suspend workers', icon: 'pause', action: { type: 'task-transition', value: 'paused', notice: 'Pause requested for Scanning NLMedia 01.' } },
  { id: 'task-stop', label: 'Stop selected task', detail: 'Finish current files, then stop workers', keywords: 'current task cancel workers', icon: 'circle-stop', action: { type: 'task-transition', value: 'stopping', notice: 'Stop requested for Scanning NLMedia 01.' } },
];

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

export function buildCommandGroups(screen = 'location') {
  const activeScreen = ['location', 'duplicates', 'tasks'].includes(screen) ? screen : 'location';
  const contextual = activeScreen === 'location'
    ? { label: 'Current file · Brand_Film_Master_v18.mov', commands: locationContext }
    : activeScreen === 'duplicates'
      ? { label: 'Current duplicate group · beach.JPG', commands: duplicateContext }
      : { label: 'Current task · Scanning NLMedia 01', commands: taskContext };

  return [
    contextual,
    { label: 'Locations', commands: sharedLocations },
    { label: 'Navigation', commands: sharedNavigation },
    { label: 'View & menu', commands: viewCommands[activeScreen] },
  ];
}

export function filterCommandGroups(groups, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      commands: group.commands.filter((command) => (
        `${command.label} ${command.detail || ''} ${command.keywords || ''}`.toLocaleLowerCase().includes(needle)
      )),
    }))
    .filter((group) => group.commands.length > 0);
}
