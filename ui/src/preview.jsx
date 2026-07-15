import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import ScanProgressPools from './components/ScanProgressPools.jsx';
import PrototypeApp from './prototypes/redesign/PrototypeApp.jsx';
import './style.css';

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
