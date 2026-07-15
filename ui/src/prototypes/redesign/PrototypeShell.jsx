import React, { useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  HardDrive,
  ListChecks,
  Search,
  Settings2
} from 'lucide-react';

import { locations, scans, tasks } from './mockData.js';

const routes = [
  {
    id: 'location',
    label: 'Locations',
    detail: 'Browse scans and files',
    href: '#/redesign/location-scan-browser',
    icon: HardDrive
  },
  {
    id: 'duplicates',
    label: 'Duplicates',
    detail: 'Compare content identity',
    href: '#/redesign/duplicates',
    icon: Copy,
    badge: '2.1 TB'
  },
  {
    id: 'tasks',
    label: 'Tasks',
    detail: 'Background work',
    href: '#/redesign/tasks',
    icon: ListChecks,
    badge: String(tasks.filter((task) => task.status === 'running' || task.status === 'queued').length)
  }
];

function StatusDot({ status }) {
  return <span className={`rd-status-dot rd-status-dot--${status}`} aria-label={status} />;
}

function RouteLink({ route, active }) {
  const Icon = route.icon;

  return (
    <a
      className={`rd-nav-link${active ? ' is-active' : ''}`}
      href={route.href}
      aria-current={active ? 'page' : undefined}
    >
      <Icon aria-hidden="true" />
      <span className="rd-nav-link__copy">
        <span>{route.label}</span>
        <small>{route.detail}</small>
      </span>
      {route.badge ? <span className="rd-nav-badge">{route.badge}</span> : null}
    </a>
  );
}

function LocationTree({ active, activeLocationId, activeScanId, onSelectScan }) {
  const [openLocations, setOpenLocations] = useState(() => new Set(['nl-media-01']));

  useEffect(() => {
    if (!activeLocationId) return;
    setOpenLocations((current) => new Set(current).add(activeLocationId));
  }, [activeLocationId]);

  function toggleLocation(locationId) {
    setOpenLocations((current) => {
      const next = new Set(current);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  }

  return (
    <div className="rd-location-tree" aria-label="Saved locations">
      <div className="rd-location-tree__heading">
        <span>Locations</span>
        <span>{locations.length}</span>
      </div>
      {locations.map((location) => {
        const isOpen = openLocations.has(location.id);
        const locationScans = scans.filter((scan) => scan.locationId === location.id);
        const DeviceIcon = location.status === 'offline' ? Archive : Database;

        return (
          <div className="rd-location-node" key={location.id}>
            <button
              className={`rd-location-row${active && location.id === activeLocationId ? ' rd-current' : ''}`}
              type="button"
              onClick={() => toggleLocation(location.id)}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              <DeviceIcon aria-hidden="true" />
              <span className="rd-location-row__label">{location.name}</span>
              <StatusDot status={location.status} />
            </button>
            {isOpen ? (
              <div className="rd-scan-list">
                {locationScans.map((scan) => (
                  <a
                    className={`rd-scan-row${active && scan.id === activeScanId ? ' rd-current' : ''}`}
                    href="#/redesign/location-scan-browser"
                    key={scan.id}
                    aria-current={active && scan.id === activeScanId ? 'page' : undefined}
                    onClick={() => onSelectScan?.(scan)}
                  >
                    <span className={`rd-scan-state rd-scan-state--${scan.status}`} />
                    <span>{scan.shortName}</span>
                    {scan.isRepresentative ? <span className="rd-nav-badge">rep</span> : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function PrototypeShell({ activeLocationId, activeScanId, screen, children, onOpenCommands, onSelectScan }) {
  const runningTask = tasks.find((task) => task.status === 'running');

  return (
    <div className="rd-shell">
      <aside className="rd-sidebar">
        <div className="rd-brand">
          <span className="rd-brand__mark" aria-hidden="true"><Database /></span>
          <span className="rd-brand__copy">
            <strong>file-census</strong>
            <small>Inventory workspace</small>
          </span>
        </div>

        <nav className="rd-primary-nav" aria-label="Primary navigation">
          {routes.map((route) => (
            <RouteLink key={route.id} route={route} active={route.id === screen} />
          ))}
        </nav>

        <button className="rd-command-button rd-command-trigger" onClick={onOpenCommands} type="button">
          <Search aria-hidden="true" />
          <span>Search or run command</span>
          <kbd>⌘K</kbd>
        </button>

        <LocationTree active={screen === 'location'} activeLocationId={activeLocationId} activeScanId={activeScanId} onSelectScan={onSelectScan} />

        <div className="rd-sidebar__spacer" />

        {runningTask ? (
          <a className="rd-running-task" href="#/redesign/tasks">
            <span className="rd-running-task__icon"><Activity aria-hidden="true" /></span>
            <span className="rd-running-task__copy">
              <span>{runningTask.progress}% · {runningTask.phase}</span>
              <small>{runningTask.rate}</small>
            </span>
            <span className="rd-running-task__bar" aria-hidden="true">
              <span style={{ width: `${runningTask.progress}%` }} />
            </span>
          </a>
        ) : null}

        <div className="rd-sidebar-footer">
          <button type="button"><CircleHelp aria-hidden="true" /><span>Help</span></button>
          <button type="button"><Settings2 aria-hidden="true" /><span>Options</span></button>
        </div>
      </aside>

      <section className="rd-app-frame">
        <main className="rd-main">
          <div className="rd-screen">{children}</div>
        </main>
      </section>
    </div>
  );
}
