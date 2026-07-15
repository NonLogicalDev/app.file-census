import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import ScanProgressPools from './ScanProgressPools.jsx';
import {
  appMainClassName,
  Button,
  connectionLedClassName,
  eventStripClassName,
  eventStripStatusClassName,
  headerActionsClassName,
  IconButton,
  locationLedClassName,
  metricItemClassName,
  metricLabelClassName,
  metricsClassName,
  metricValueClassName,
  navIconClassName,
  navIconSvgClassName,
  Menu,
  MenuContent,
  MenuLabel,
  MenuTrigger,
  optionsMenuClassName,
  optionsPanelClassName,
  optionsSectionClassName,
  optionsSectionCodeClassName,
  optionsSectionLabelClassName,
  optionsSummaryClassName,
  pageActionsListClassName,
  pageActionsMenuClassName,
  pageActionsPanelClassName,
  pageActionsPanelTitleClassName,
  pageActionsTriggerClassName,
  shellMessageClassName,
  StatusPill,
  topbarDescriptionClassName,
  topbarSidebarToggleClassName,
  topbarTitleClassName,
  topbarTitleCopyClassName,
  topbarTitleHeadingClassName,
  trafficDotClassName,
  topProgressBandClassName,
  topProgressCardClassName,
  topProgressCardMainClassName,
  topProgressLocationNameClassName,
  topProgressMetaClassName,
  topProgressPathClassName,
  topProgressStatusClassName,
  topProgressTitleClassName,
  Toolbar,
  workspaceHeaderClassName
} from './ui/index.jsx';
import { bytes, isActiveStatus, statusLabel, when } from '../utils/format.js';

const tabs = [
  ['locations', 'Locations', 'Sources and scans'],
  ['duplicates', 'Duplicates', 'Content seen elsewhere'],
  ['search', 'Search', 'Find by path or name']
];

const tabIcons = {
  duplicates: 'duplicates',
  locations: 'locations',
  search: 'searchFiles'
};

export default function Shell({
  overview,
  message,
  wsStatus,
  statusDetail,
  eventLog,
  runningProgress,
  activeTab,
  setTab,
  refresh,
  busy,
  databaseInfo,
  canChooseDatabase,
  onChooseDatabase,
  locationList = [],
  selectedLocationSlug,
  selectedScanId,
  onChooseLocation,
  onSelectScan,
  onShowAddLocation,
  topBarActions,
  children
}) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [compactSidebar, setCompactSidebar] = useState(() => window.matchMedia('(max-width: 960px)').matches);
  const [pageActionsOpen, setPageActionsOpen] = useState(false);
  const [expandedLocations, setExpandedLocations] = useState({});
  const sidebarRef = useRef(null);
  const activeTabMeta = tabs.find(([id]) => id === activeTab) || tabs[0];
  const selectedLocation = locationList.find((location) => location.slug === selectedLocationSlug);
  const sidebarVisuallyOpen = compactSidebar ? sidebarPeeking : !sidebarHidden;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 960px)');
    const update = () => setCompactSidebar(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setPageActionsOpen(false);
  }, [activeTab, selectedLocationSlug, selectedScanId]);

  useEffect(() => {
    if (!selectedLocationSlug) return;
    setExpandedLocations((current) => current[selectedLocationSlug] ? current : { ...current, [selectedLocationSlug]: true });
  }, [selectedLocationSlug]);

  useEffect(() => {
    setExpandedLocations((current) => {
      let changed = false;
      const next = { ...current };
      for (const location of locationList) {
        if (location.activeScan && !next[location.slug]) {
          next[location.slug] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [locationList]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return undefined;

    function onWheel(event) {
      if (event.defaultPrevented) return;

      const scrollable = findSidebarScrollable(event.target, sidebar);
      if (scrollable && canScrollElement(scrollable, event.deltaY)) return;

      event.preventDefault();
    }

    sidebar.addEventListener('wheel', onWheel, { passive: false });
    return () => sidebar.removeEventListener('wheel', onWheel);
  }, []);

  function toggleSidebar() {
    if (compactSidebar) {
      setSidebarPeeking(true);
      return;
    }
    setSidebarHidden((value) => !value);
    setSidebarPeeking(false);
  }

  return (
    <div className={`app-shell${sidebarHidden ? ' sidebar-hidden' : ''}${sidebarPeeking ? ' sidebar-peeking' : ''}${compactSidebar ? ' sidebar-compact' : ''}`}>
      <button
        type="button"
        className="sidebar-hover-zone"
        aria-label="Show sidebar"
        onMouseEnter={() => setSidebarPeeking(true)}
        onFocus={() => setSidebarPeeking(true)}
        onClick={() => setSidebarPeeking(true)}
      />
      <aside
        ref={sidebarRef}
        className="app-sidebar"
        aria-label="Application navigation"
        onMouseEnter={() => setSidebarPeeking(true)}
        onMouseLeave={() => setSidebarPeeking(false)}
      >
        <div className="sidebar-window-controls" aria-hidden="true">
          <span className={trafficDotClassName('red')} />
          <span className={trafficDotClassName('yellow')} />
          <span className={trafficDotClassName('green')} />
        </div>
        <IconButton
          onClick={() => setSidebarPeeking(false)}
          label="Close sidebar"
          title="Close sidebar"
          icon={<Icon name="sidebarClose" />}
          className={[
            'sidebar-overlay-close !h-[30px] !w-[30px] !border-[var(--sidebar-border)] !bg-[var(--sidebar-surface)] !p-0 !text-[color:var(--sidebar-muted)] !shadow-none',
            'hover:!border-[#5b6058] hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none',
            compactSidebar && sidebarPeeking ? '!inline-flex' : '!hidden'
          ].join(' ')}
        />

        <div className="sidebar-brand">
          <strong>file-census</strong>
          <span>Local file memory</span>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {tabs.map(([id, label, description]) => (
            <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <span className={navIconClassName}><Icon name={tabIcons[id]} className={navIconSvgClassName} /></span>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </nav>

        <section className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Locations</span>
            <IconButton
              className="sidebar-icon-button !h-[25px] !w-[25px] !border-[var(--sidebar-border)] !bg-[var(--sidebar-surface)] !p-0 !text-[color:var(--sidebar-text)] hover:!border-[#5b6058] hover:!bg-[var(--sidebar-surface-hover)] hover:!text-[color:var(--sidebar-text)] hover:!shadow-none"
              onClick={onShowAddLocation}
              title="Add location"
              label="Add location"
              disabled={busy}
              icon={<Icon name="add" />}
            />
          </div>
          <div className="sidebar-location-list">
            {locationList.map((location) => (
              <SidebarLocationGroup
                key={location.slug}
                location={location}
                expanded={Boolean(expandedLocations[location.slug])}
                selectedLocation={activeTab === 'locations' && selectedLocationSlug === location.slug && !selectedScanId}
                selectedScanId={selectedScanId}
                onToggle={() => setExpandedLocations((current) => ({ ...current, [location.slug]: !current[location.slug] }))}
                onSelectLocation={() => onChooseLocation(location.slug)}
                onSelectScan={(scanId) => onSelectScan(scanId, location.slug)}
              />
            ))}
            {!locationList.length && <p className="sidebar-empty">No locations yet.</p>}
          </div>
        </section>

        {runningProgress.length > 0 && (
          <section className="sidebar-section sidebar-activity">
            <div className="sidebar-section-title">
              <span>Activity</span>
              <small>{runningProgress.length} running</small>
            </div>
            {runningProgress.slice(0, 3).map((progress) => (
              <article className="sidebar-progress" key={progress.scan_id}>
                <strong>{progress.location_slug}</strong>
                <span>{progress.file_count} files - {bytes(progress.total_bytes)}</span>
                <ScanProgressPools progress={progress} compact />
                {progress.current_path && <code className="progress-path" title={progress.current_path}>{progress.current_path}</code>}
              </article>
            ))}
            {runningProgress.length > 3 && <p className="sidebar-empty">+{runningProgress.length - 3} more scans</p>}
          </section>
        )}

        <div className="sidebar-spacer" />

        <section className="sidebar-footer">
          <StatusPill
            variant="ghost"
            className="connection-pill !inline-flex !min-h-0 !items-center !gap-[7px] !rounded-none !border-0 !bg-transparent !p-0 !text-[0.84rem] !font-[650] !leading-normal !text-[color:var(--sidebar-muted)]"
            icon={<span className={connectionLedClassName({ live: wsStatus === 'live' })} />}
          >
            {connectionLabel(wsStatus, statusDetail)}
          </StatusPill>
          {canChooseDatabase && (
            <details className={optionsMenuClassName}>
              <summary className={optionsSummaryClassName}><Icon name="options" />Options</summary>
              <div className={optionsPanelClassName}>
                <section className={optionsSectionClassName}>
                  <span className={optionsSectionLabelClassName}>Database</span>
                  <code className={optionsSectionCodeClassName} title={databaseInfo?.path || 'Default database'}>{databaseInfo?.path || 'Default database'}</code>
                  <Button variant="secondary" onClick={onChooseDatabase} disabled={busy} icon={<Icon name="chooseDatabase" />}>Choose database</Button>
                </section>
              </div>
            </details>
          )}
        </section>
      </aside>

      <main className={appMainClassName}>
        <header className={workspaceHeaderClassName}>
          <div className={topbarTitleClassName}>
            <IconButton
              onClick={toggleSidebar}
              label={compactSidebar ? 'Open sidebar' : sidebarVisuallyOpen ? 'Hide sidebar' : 'Restore sidebar'}
              title={compactSidebar ? 'Open sidebar' : sidebarVisuallyOpen ? 'Hide sidebar' : 'Restore sidebar'}
              variant="secondary"
              className={topbarSidebarToggleClassName}
              icon={<Icon name={compactSidebar || !sidebarVisuallyOpen ? 'sidebarOpen' : 'sidebarClose'} />}
            />
            <div className={topbarTitleCopyClassName}>
              <h1 className={topbarTitleHeadingClassName}>{headerTitle(activeTab, selectedLocation, activeTabMeta)}</h1>
              <p className={topbarDescriptionClassName}>{headerDescription(activeTab, selectedLocation)}</p>
            </div>
          </div>
          <Toolbar className={headerActionsClassName}>
            <Button variant="secondary" onClick={refresh} disabled={busy} icon={<Icon name="refresh" />}>Refresh</Button>
            {topBarActions && (
              <Menu
                className={pageActionsMenuClassName}
                open={pageActionsOpen}
                onOpenChange={setPageActionsOpen}
              >
                <MenuTrigger
                  aria-label="Page actions"
                  title="Page actions"
                  icon={<Icon name="pageActions" />}
                  className={pageActionsTriggerClassName({ open: pageActionsOpen })}
                />
                <MenuContent className={pageActionsPanelClassName}>
                  <MenuLabel className={pageActionsPanelTitleClassName}>Page actions</MenuLabel>
                  <div
                    className={pageActionsListClassName}
                    onClick={(event) => {
                      if (event.target.closest('button')) setPageActionsOpen(false);
                    }}
                  >
                    {topBarActions}
                  </div>
                </MenuContent>
              </Menu>
            )}
          </Toolbar>
        </header>

        {overview && (
          <section className={metricsClassName}>
            <div className={metricItemClassName}><strong className={metricValueClassName}>{overview.location_count}</strong><span className={metricLabelClassName}>Locations</span></div>
            <div className={metricItemClassName}><strong className={metricValueClassName}>{overview.scan_count}</strong><span className={metricLabelClassName}>Scans</span></div>
            <div className={metricItemClassName}><strong className={metricValueClassName}>{overview.file_count}</strong><span className={metricLabelClassName}>Files</span></div>
            <div className={metricItemClassName}><strong className={metricValueClassName}>{bytes(overview.total_bytes)}</strong><span className={metricLabelClassName}>Indexed</span></div>
            <div className={metricItemClassName}><strong className={metricValueClassName}>{overview.duplicate_groups}</strong><span className={metricLabelClassName}>Dupe groups</span></div>
          </section>
        )}

        {message && <p className={shellMessageClassName}>{message}</p>}

        <section className={eventStripClassName}>
          <span className={eventStripStatusClassName({ live: wsStatus === 'live' })}>
            {connectionStripLabel(wsStatus, statusDetail)}
          </span>
          {eventLog[0] && <code>{eventLog[0].kind}</code>}
        </section>

        {runningProgress.length > 0 && (
          <section className={topProgressBandClassName}>
            {runningProgress.map((progress) => (
              <article className={topProgressCardClassName} key={progress.scan_id}>
                <div className={topProgressCardMainClassName}>
                  <strong className={topProgressTitleClassName}>{progress.location_slug} <span className={topProgressLocationNameClassName}>{progress.location_name}</span></strong>
                  <span className={topProgressMetaClassName}>{progress.file_count} files - {bytes(progress.total_bytes)} - {progress.error_count} errors</span>
                  {progress.current_path && <code className={topProgressPathClassName} title={progress.current_path}>{progress.current_path}</code>}
                  <ScanProgressPools progress={progress} compact />
                </div>
                <span className={topProgressStatusClassName}>{statusLabel(progress.status)}</span>
              </article>
            ))}
          </section>
        )}

        {children}
      </main>
    </div>
  );
}

function connectionLabel(status, detail) {
  if (status === 'live') return 'Live updates';
  if (status === 'connecting') return 'Connecting';
  return `Reconnecting${detail ? `: ${detail}` : ''}`;
}

function connectionStripLabel(status, detail) {
  if (status === 'live') return 'Live updates connected';
  if (status === 'connecting') return 'Live updates connecting';
  return `Live updates reconnecting${detail ? `: ${detail}` : ''}`;
}

function SidebarLocationGroup({ location, expanded, selectedLocation, selectedScanId, onToggle, onSelectLocation, onSelectScan }) {
  const hasScans = location.scans.length > 0;

  return (
    <div className={`sidebar-location-group${location.disabled ? ' disabled-location' : ''}`}>
      <div className="sidebar-location-row">
        <button
          type="button"
          className="sidebar-disclosure"
          onClick={onToggle}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${location.slug}`}
          aria-expanded={expanded}
          disabled={!hasScans}
          title={hasScans ? `${expanded ? 'Collapse' : 'Expand'} scans` : 'No scans'}
        >
          {hasScans && <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />}
        </button>
        <SidebarLocationItem location={location} selected={selectedLocation} hasSelectedScan={location.scans.some((scan) => scan.id === selectedScanId)} onSelect={onSelectLocation} />
      </div>
      {expanded && hasScans && (
        <div className="sidebar-scan-list">
          {location.scans.map((scan) => (
            <SidebarScanItem
              key={scan.id}
              scan={scan}
              selected={scan.id === selectedScanId}
              onSelect={() => onSelectScan(scan.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarLocationItem({ location, selected, hasSelectedScan, onSelect }) {
  return (
    <button
      type="button"
      className={`sidebar-location${selected ? ' selected' : ''}${hasSelectedScan ? ' contains-selected-scan' : ''}${location.disabled ? ' disabled-location' : ''}`}
      onClick={onSelect}
      title={`${location.slug} - ${location.root_path}`}
      aria-label={`${location.name || location.slug}, ${location.root_path}`}
    >
      <span className={locationLedClassName({ connected: location.connected, compact: true })} title={livenessTitle(location)} />
      <span className="sidebar-location-body">
        <strong>{location.name || location.slug}</strong>
        <small>{location.root_path}</small>
      </span>
      <span className="sidebar-location-meta">
        <strong>{location.scanCount}</strong>
        <small>{location.activeScan ? statusLabel(location.activeScan.status) : 'idle'}</small>
      </span>
    </button>
  );
}

function SidebarScanItem({ scan, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`sidebar-scan${selected ? ' selected' : ''}${isActiveStatus(scan.status) ? ' active-scan' : ''}`}
      onClick={onSelect}
      title={scan.id}
    >
      <span className="sidebar-scan-status">
        {scan.is_representative ? 'Rep' : statusLabel(scan.status)}
      </span>
      <span className="sidebar-scan-body">
        <strong>{statusLabel(scan.status)} - {scan.file_count} files</strong>
        <small>{when(scan.started_at)} - {bytes(scan.total_bytes)}</small>
      </span>
    </button>
  );
}

function headerDescription(activeTab, location) {
  if (activeTab === 'duplicates') return 'Review exact-content matches across representative scans.';
  if (activeTab === 'search') return 'Find files by name, extension, or path fragment.';
  if (location) return `${location.slug} - ${location.root_path}`;
  return 'Choose a source location from the sidebar or add a new one.';
}

function headerTitle(activeTab, location, activeTabMeta) {
  if (activeTab === 'locations' && location) return location.name || location.slug;
  return activeTabMeta[1];
}

function findSidebarScrollable(target, sidebar) {
  if (!(target instanceof Element)) return null;
  const scrollable = target.closest('.sidebar-location-list');
  if (scrollable && sidebar.contains(scrollable)) return scrollable;
  return null;
}

function canScrollElement(element, deltaY) {
  if (!element || element.scrollHeight <= element.clientHeight) return false;
  if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  if (deltaY < 0) return element.scrollTop > 1;
  return false;
}

function livenessTitle(location) {
  return location.connected
    ? `Connected - checked ${when(location.liveness_checked_at)}`
    : `Disconnected - ${location.liveness_error || 'unreachable'}`;
}
