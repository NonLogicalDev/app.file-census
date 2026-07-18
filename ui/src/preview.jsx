import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import ScanProgressPools from './components/ScanProgressPools.jsx';
import ScanScopeSelector from './components/search/ScanScopeSelector.jsx';
import DuplicatesPage from './pages/DuplicatesPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import PrototypeApp from './prototypes/redesign/PrototypeApp.jsx';
import { appMainClassName } from './components/ui/index.jsx';
import './style.css';

// Reproduces the real app-shell width chain (sidebar grid col + appMain) so
// TasksPage overflow behaves exactly as in production, with a punishing long
// current_path and large pool counts.
const STRESS_SCAN_PROGRESS = {
  scan_id: 'stress-scan',
  location_slug: 'disk-nlbackup',
  location_name: 'NLBackup',
  status: 'running',
  file_count: 3258,
  dir_count: 8422,
  error_count: 0,
  total_bytes: 7516192768,
  current_path:
    'PHOTO_FILTER/@Photos/Old Photos.photoslibrary/originals/6/6CE68EFC-27D2-43E6-AA07-480AFED9E4B1_1_105_c.jpeg',
  pools: {
    discovery: { completed: 283914, failed: 0, queued: 0, active: 0 },
    metadata: { completed: 283914, failed: 0, queued: 0, active: 0 },
    hashing: { completed: 3258, failed: 0, queued: 272230, active: 4 }
  },
  log: []
};

function TasksOverflowPreview() {
  return (
    <div className="grid min-h-screen grid-cols-[var(--sidebar-width)_minmax(0,1fr)] bg-bg text-text" style={{ '--sidebar-width': '360px' }}>
      <aside className="h-screen border-r border-sidebar-border bg-sidebar-bg" />
      <main className={appMainClassName}>
        <TasksPage
          runningProgress={[STRESS_SCAN_PROGRESS]}
          backgroundTasks={[]}
          eventLog={[]}
          onPauseScan={() => {}}
          onStopScan={() => {}}
          onResumeScan={() => {}}
        />
      </main>
    </div>
  );
}

const SAMPLE_SCAN_PROGRESS = {
  scan_id: 'preview-scan',
  location_slug: 'nl-media-01',
  location_name: 'NLMedia 01',
  status: 'running',
  file_count: 18420,
  dir_count: 944,
  error_count: 2,
  total_bytes: 4821914420,
  pools: {
    discovery: { completed: 283444, failed: 0, queued: 0, active: 0 },
    metadata: { completed: 92112, failed: 2, queued: 153840, active: 36 },
    hashing: { completed: 44018, failed: 0, queued: 201932, active: 12 }
  },
  log: []
};

const SAMPLE_SCANS = [
  {
    id: 'scan-media-july',
    nickname: 'July media',
    location_slug: 'nl-media-01',
    location_name: 'NLMedia 01',
    status: 'complete',
    file_count: 18420,
    started_at: '2026-07-14T15:30:00.000Z',
    is_representative: true
  },
  {
    id: 'scan-media-june',
    nickname: 'June media',
    location_slug: 'nl-media-01',
    location_name: 'NLMedia 01',
    status: 'complete',
    file_count: 18102,
    started_at: '2026-06-16T15:30:00.000Z',
    is_representative: false
  },
  {
    id: 'scan-archive-july',
    nickname: 'July archive',
    location_slug: 'archive-01',
    location_name: 'Archive 01',
    status: 'complete',
    file_count: 6931,
    started_at: '2026-07-13T09:15:00.000Z',
    is_representative: true
  }
];

const SAMPLE_LOCATIONS = [
  {
    slug: 'nl-media-01',
    name: 'NLMedia 01',
    scans: SAMPLE_SCANS.slice(0, 2),
    representativeScan: SAMPLE_SCANS[0]
  },
  {
    slug: 'archive-01',
    name: 'Archive 01',
    scans: SAMPLE_SCANS.slice(2),
    representativeScan: SAMPLE_SCANS[2]
  }
];

const SAMPLE_DUPLICATES = [
  {
    blake3: 'a79e2f3ab51c3240d97a7e09bf6a2fd5bd1da3dfb08764af3b7d2e93d0fc71b4',
    size: 4821344,
    file_kind: 'image',
    count: 2,
    files: [
      {
        scan_id: 'scan-media-july',
        location_slug: 'nl-media-01',
        location_name: 'NLMedia 01',
        path: 'Camera/2026/07/harbor.jpg',
        name: 'harbor.jpg',
        size: 4821344,
        blake3: 'a79e2f3ab51c3240d97a7e09bf6a2fd5bd1da3dfb08764af3b7d2e93d0fc71b4',
        file_kind: 'image'
      },
      {
        scan_id: 'scan-archive-july',
        location_slug: 'archive-01',
        location_name: 'Archive 01',
        path: 'Photo archive/harbor.jpg',
        name: 'harbor.jpg',
        size: 4821344,
        blake3: 'a79e2f3ab51c3240d97a7e09bf6a2fd5bd1da3dfb08764af3b7d2e93d0fc71b4',
        file_kind: 'image'
      }
    ]
  },
  {
    blake3: 'b27d03dbd28e3c02bfc58bd98dd3d58c2944fd5afe3bdc15c9ea9ebace4c4310',
    size: 96341020,
    file_kind: 'video',
    count: 2,
    files: [
      {
        scan_id: 'scan-media-july',
        location_slug: 'nl-media-01',
        location_name: 'NLMedia 01',
        path: 'Camera/2026/07/arrival.mov',
        name: 'arrival.mov',
        size: 96341020,
        blake3: 'b27d03dbd28e3c02bfc58bd98dd3d58c2944fd5afe3bdc15c9ea9ebace4c4310',
        file_kind: 'video'
      },
      {
        scan_id: 'scan-archive-july',
        location_slug: 'archive-01',
        location_name: 'Archive 01',
        path: 'Video archive/arrival.mov',
        name: 'arrival.mov',
        size: 96341020,
        blake3: 'b27d03dbd28e3c02bfc58bd98dd3d58c2944fd5afe3bdc15c9ea9ebace4c4310',
        file_kind: 'video'
      }
    ]
  }
];

const SAMPLE_SEARCH_RESULTS = [
  {
    scan_id: 'scan-media-july',
    location_slug: 'nl-media-01',
    location_name: 'NLMedia 01',
    kind: 'file',
    name: 'harbor.jpg',
    path: 'Camera/2026/07/harbor.jpg',
    size: 4821344,
    file_count: 1,
    duplicate_file_count: 1,
    original_file_count: 1,
    same_scan_duplicate_file_count: 0,
    blake3: 'a79e2f3ab51c3240d97a7e09bf6a2fd5bd1da3dfb08764af3b7d2e93d0fc71b4',
    ctime: '2026-07-14T15:30:00.000Z',
    mtime: '2026-07-14T15:30:00.000Z',
    mode: 420
  },
  {
    scan_id: 'scan-archive-july',
    location_slug: 'archive-01',
    location_name: 'Archive 01',
    kind: 'file',
    name: 'arrival.mov',
    path: 'Video archive/arrival.mov',
    size: 96341020,
    file_count: 1,
    duplicate_file_count: 1,
    original_file_count: 1,
    same_scan_duplicate_file_count: 0,
    blake3: 'b27d03dbd28e3c02bfc58bd98dd3d58c2944fd5afe3bdc15c9ea9ebace4c4310',
    ctime: '2026-07-13T09:15:00.000Z',
    mtime: '2026-07-13T09:15:00.000Z',
    mode: 420
  }
];

const PREVIEWS = [
  {
    path: '/redesign/location-scan-browser',
    group: 'Redesign prototype',
    variant: 'location and scan browser',
    title: 'Location / Scan Browser',
    description: 'Backend-free full-screen prototype for location-first file browsing.',
    fullScreen: true,
    render: () => <PrototypeApp screen="location" />
  },
  {
    path: '/redesign/duplicates',
    group: 'Redesign prototype',
    variant: 'duplicates',
    title: 'Duplicates',
    description: 'Backend-free full-screen prototype for exact duplicate comparison.',
    fullScreen: true,
    render: () => <PrototypeApp screen="duplicates" />
  },
  {
    path: '/redesign/tasks',
    group: 'Redesign prototype',
    variant: 'tasks',
    title: 'Tasks',
    description: 'Backend-free full-screen prototype for scan and enrichment activity.',
    fullScreen: true,
    render: () => <PrototypeApp screen="tasks" />
  },
  {
    path: '/tasks/overflow',
    group: 'TasksPage',
    variant: 'live scan overflow',
    title: 'Tasks live scan (overflow stress)',
    description: 'Real TasksPage in the app-shell width chain with a long current_path.',
    fullScreen: true,
    render: () => <TasksOverflowPreview />
  },
  {
    path: '/scan-scope/search',
    group: 'ScanScopeSelector',
    variant: 'search scope',
    title: 'Search scan scope',
    description: 'Representative, all-scan, and explicit scan choices for flat search results.',
    frameClassName: 'w-full max-w-[760px] border-border bg-surface text-text',
    render: () => <ScanScopePreview allowAll initialScope="all" />
  },
  {
    path: '/scan-scope/duplicates',
    group: 'ScanScopeSelector',
    variant: 'duplicate comparison scope',
    title: 'Duplicate comparison scope',
    description: 'Representative or explicitly selected scans for cross-scan duplicate groups.',
    frameClassName: 'w-full max-w-[760px] border-border bg-surface text-text',
    render: () => <ScanScopePreview initialScope="representative" />
  },
  {
    path: '/duplicates/click-affordance',
    group: 'DuplicatesPage',
    variant: 'file detail affordance',
    title: 'Duplicate file detail affordance',
    description: 'Flat duplicate rows expose a real file-detail action without leaving the current workflow.',
    frameClassName: 'w-full border-border bg-bg text-text',
    render: () => <DuplicatePreview />
  },
  {
    path: '/duplicates/kind-grouping-flat',
    group: 'DuplicatesPage',
    variant: 'content kinds flat',
    title: 'Duplicate content kinds — flat',
    description: 'Image and video duplicate groups retain content kind separately from filesystem topology.',
    frameClassName: 'w-full border-border bg-bg text-text',
    render: () => <DuplicatePreview />
  },
  {
    path: '/duplicates/kind-grouping-tree',
    group: 'DuplicatesPage',
    variant: 'content kinds tree',
    title: 'Duplicate content kinds — tree',
    description: 'The same duplicate records in the main-workspace tree result presentation.',
    frameClassName: 'w-full border-border bg-bg text-text',
    render: () => <DuplicatePreview initialView="tree" />
  },
  {
    path: '/file-grid/search-flat-results',
    group: 'SearchPage',
    variant: 'flat results',
    title: 'Search file grid',
    description: 'Search remains a single flat result workspace; scan directory trees belong to Locations.',
    frameClassName: 'w-full border-border bg-bg text-text',
    render: () => <SearchPreview />
  },
  {
    path: '/search/column-controls',
    group: 'SearchPage',
    variant: 'column visibility',
    title: 'Search columns',
    description: 'Supported FileGrid columns can be shown or hidden without offering ignored reordering controls.',
    frameClassName: 'w-full border-border bg-bg text-text',
    render: () => <SearchPreview initialShowColumnControls />
  },
  {
    path: '/scan-progress/expanded',
    group: 'ScanProgressPools',
    variant: 'expanded',
    title: 'Expanded progress',
    description: 'Main content width, as used on scan and task detail surfaces.',
    frameClassName: 'w-full border-border bg-surface text-text',
    render: () => <ScanProgressPools progress={SAMPLE_SCAN_PROGRESS} />
  },
  {
    path: '/scan-progress/compact',
    group: 'ScanProgressPools',
    variant: 'compact',
    title: 'Compact progress',
    description: 'Sidebar width, as used for dense running-task summaries.',
    frameClassName: 'w-[360px] border-[rgb(255_255_255_/_0.16)] bg-sidebar text-sidebar-text',
    render: () => <ScanProgressPools progress={SAMPLE_SCAN_PROGRESS} compact />
  }
];

function ScanScopePreview({ allowAll = false, initialScope = 'representative' }) {
  const [scope, setScope] = useState(initialScope);
  const [selectedScanIds, setSelectedScanIds] = useState([]);

  function onScopeChange(nextScope) {
    setScope(nextScope);
    if (nextScope !== 'explicit') setSelectedScanIds([]);
  }

  function onSetSelectedScanIds(nextScanIds) {
    setSelectedScanIds(nextScanIds);
    if (nextScanIds.length) setScope('explicit');
  }

  return (
    <ScanScopeSelector
      allowAll={allowAll}
      scope={scope}
      locations={SAMPLE_LOCATIONS}
      scans={SAMPLE_SCANS}
      selectedScanIds={selectedScanIds}
      onScopeChange={onScopeChange}
      onSetSelectedScanIds={onSetSelectedScanIds}
    />
  );
}

function DuplicatePreview({ initialView = 'flat' }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState([]);
  const [selectedScanIds, setSelectedScanIds] = useState([]);
  const [duplicateView, setDuplicateView] = useState(initialView);

  return (
    <DuplicatesPage
      query={query}
      setQuery={setQuery}
      filters={filters}
      locations={SAMPLE_LOCATIONS}
      scans={SAMPLE_SCANS}
      busy={false}
      filteredDupes={SAMPLE_DUPLICATES}
      selectedScanIds={selectedScanIds}
      duplicateView={duplicateView}
      onCommitSearch={() => {}}
      onReplaceFilterState={(nextQuery, nextFilters) => {
        setQuery(nextQuery);
        setFilters(nextFilters);
      }}
      onSetSelectedScanIds={setSelectedScanIds}
      onSetDuplicateView={setDuplicateView}
      onOpenDuplicate={() => {}}
    />
  );
}

function SearchPreview({ initialShowColumnControls = false }) {
  const [query, setQuery] = useState('harbor');
  const [filters, setFilters] = useState([]);
  const [searchAllScans, setSearchAllScans] = useState(true);
  const [selectedScanIds, setSelectedScanIds] = useState([]);

  function onSetSearchAllScans(nextAllScans) {
    setSearchAllScans(nextAllScans);
    setSelectedScanIds([]);
  }

  function onSetSelectedScanIds(nextScanIds) {
    setSelectedScanIds(nextScanIds);
    if (nextScanIds.length) setSearchAllScans(false);
  }

  return (
    <SearchPage
      query={query}
      setQuery={setQuery}
      filters={filters}
      locations={SAMPLE_LOCATIONS}
      scans={SAMPLE_SCANS}
      results={SAMPLE_SEARCH_RESULTS}
      busy={false}
      searchAllScans={searchAllScans}
      selectedScanIds={selectedScanIds}
      onSearch={() => {}}
      onSetSearchAllScans={onSetSearchAllScans}
      onSetSelectedScanIds={onSetSelectedScanIds}
      onReplaceFilterState={(nextQuery, nextFilters) => {
        setQuery(nextQuery);
        setFilters(nextFilters);
      }}
      onInspectResult={() => {}}
      initialShowColumnControls={initialShowColumnControls}
    />
  );
}

function routeFromHash(hash = '') {
  const route = String(hash || '').replace(/^#/, '') || '/scan-progress/expanded';
  return route.startsWith('/') ? route : `/${route}`;
}

function previewForRoute(route) {
  const normalized = routeFromHash(route);
  return PREVIEWS.find((preview) => preview.path === normalized)
    || PREVIEWS.find((preview) => preview.path === '/scan-progress/expanded');
}

function PreviewApp() {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const activePreview = useMemo(() => previewForRoute(route), [route]);

  if (activePreview.fullScreen) {
    return activePreview.render();
  }

  return (
    <main className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] bg-bg text-text">
        <aside className="min-h-screen border-r border-border bg-surface p-4 shadow-sm">
          <h1 className="mb-4 text-base font-bold">Component Preview</h1>
          <nav className="grid gap-1" aria-label="Component previews">
            {PREVIEWS.map((preview) => {
              const active = preview.path === activePreview.path;
              return (
                <a
                  key={preview.path}
                  className={[
                    'grid rounded-ui px-3 py-2 text-sm no-underline transition',
                    active
                      ? 'bg-accent-soft text-accent'
                      : 'text-muted-strong hover:bg-surface-muted'
                  ].join(' ')}
                  href={`#${preview.path}`}
                  title={`${preview.group}: ${preview.variant}`}
                >
                  <strong>{preview.title}</strong>
                  <span className="text-xs text-muted">{preview.group} / {preview.variant}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="grid min-w-0 content-start gap-6 p-8">
          <header className="grid gap-1 border-b border-border pb-4">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
              {activePreview.group} / {activePreview.variant}
            </span>
            <h2 className="m-0 text-2xl font-bold normal-case text-text">{activePreview.title}</h2>
            <p className="m-0 text-sm text-muted">{activePreview.description}</p>
            <code className="mt-2 w-fit rounded-ui border border-border bg-surface px-2 py-1 text-xs">
              preview.html#{activePreview.path}
            </code>
          </header>

          <article className={['rounded-panel border p-6 shadow-card', activePreview.frameClassName].join(' ')}>
            {activePreview.render()}
          </article>
        </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>
);
