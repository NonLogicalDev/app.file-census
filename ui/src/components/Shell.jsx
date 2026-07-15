import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandPalette } from './command-palette/index.js';
import { Icon } from './Icon.jsx';
import ScanProgressPools from './ScanProgressPools.jsx';
import {
  appMainClassName,
  appShellClassName,
  appSidebarClassName,
  Button,
  cn,
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
  sidebarActivityClassName,
  sidebarBrandClassName,
  sidebarBrandSubtitleClassName,
  sidebarConnectionPillClassName,
  sidebarDisclosureClassName,
  sidebarEmptyClassName,
  sidebarFooterClassName,
  sidebarHoverZoneClassName,
  sidebarIconButtonClassName,
  sidebarLocationBodyClassName,
  sidebarLocationClassName,
  sidebarLocationGroupClassName,
  sidebarLocationListClassName,
  sidebarLocationMetaClassName,
  sidebarLocationRowClassName,
  sidebarNavButtonClassName,
  sidebarNavClassName,
  sidebarOverlayCloseClassName,
  sidebarProgressClassName,
  sidebarProgressPathClassName,
  sidebarScanBodyClassName,
  sidebarScanClassName,
  sidebarScanListClassName,
  sidebarScanStatusClassName,
  sidebarResizeHandleClassName,
  sidebarSectionClassName,
  sidebarSectionTitleClassName,
  sidebarSpacerClassName,
  sidebarWindowControlsClassName,
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
import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH
} from './ui/shellClasses.js';
import { bytes, isActiveStatus, scanLabel, statusLabel, when } from '../utils/format.js';

const tabs = [
  ['dashboard', 'Dashboard', 'Current database and activity'],
  ['locations', 'Locations', 'Sources and scans'],
  ['duplicates', 'Duplicates', 'Content seen elsewhere'],
  ['search', 'Search', 'Find by path or name'],
  ['tasks', 'Tasks', 'Running scanner work'],
  ['options', 'Options', 'Database and app settings']
];

const tabIcons = {
  dashboard: 'dashboard',
  duplicates: 'duplicates',
  locations: 'locations',
  options: 'options',
  search: 'searchFiles',
  tasks: 'tasks'
};

const SIDEBAR_HIDDEN_STORAGE_KEY = 'file-census.sidebar.hidden';
const SIDEBAR_WIDTH_STORAGE_KEY = 'file-census.sidebar.width';
const SIDEBAR_KEYBOARD_STEP = 16;
const SIDEBAR_KEYBOARD_LARGE_STEP = 48;

function readSidebarPreference(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSidebarPreference(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function readStoredSidebarHidden() {
  return readSidebarPreference(SIDEBAR_HIDDEN_STORAGE_KEY) === 'true';
}

function readStoredSidebarWidth() {
  return clampSidebarWidth(readSidebarPreference(SIDEBAR_WIDTH_STORAGE_KEY));
}

function isCompactViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 960px)').matches;
}

export default function Shell({
  overview,
  message,
  wsStatus,
  statusDetail,
  eventLog = [],
  runningProgress = [],
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
  commandGroups = [],
  topBarActions,
  children
}) {
  const [sidebarHidden, setSidebarHidden] = useState(readStoredSidebarHidden);
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [compactSidebar, setCompactSidebar] = useState(isCompactViewport);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [pageActionsOpen, setPageActionsOpen] = useState(false);
  const [expandedLocations, setExpandedLocations] = useState({});
  const sidebarRef = useRef(null);
  const sidebarResizeSession = useRef(null);
  const activeTabMeta = tabs.find(([id]) => id === activeTab) || tabs[0];
  const selectedLocation = locationList.find((location) => location.slug === selectedLocationSlug);
  const sidebarVisuallyOpen = compactSidebar ? sidebarPeeking : !sidebarHidden;
  const sidebarResizeDisabled = compactSidebar || sidebarHidden;

  const finishSidebarResize = useCallback((event) => {
    const session = sidebarResizeSession.current;
    if (!session || (event && session.pointerId !== event.pointerId)) return;
    const control = event?.currentTarget;
    sidebarResizeSession.current = null;
    if (control?.hasPointerCapture?.(session.pointerId)) {
      control.releasePointerCapture(session.pointerId);
    }
    setSidebarResizing(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 960px)');
    const update = () => setCompactSidebar(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    writeSidebarPreference(SIDEBAR_HIDDEN_STORAGE_KEY, String(sidebarHidden));
  }, [sidebarHidden]);

  useEffect(() => {
    writeSidebarPreference(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => () => {
    sidebarResizeSession.current = null;
  }, []);

  useEffect(() => {
    if (sidebarResizeDisabled) finishSidebarResize();
  }, [finishSidebarResize, sidebarResizeDisabled]);

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

  function startSidebarResize(event) {
    if (sidebarResizeDisabled || event.button !== 0) return;
    event.preventDefault();
    const control = event.currentTarget;
    try {
      control.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in older embedded webviews.
    }
    sidebarResizeSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth
    };
    setSidebarResizing(true);
  }

  function moveSidebarResize(event) {
    const session = sidebarResizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    setSidebarWidth(clampSidebarWidth(session.startWidth + event.clientX - session.startX));
  }

  function handleSidebarResizeKeyDown(event) {
    if (sidebarResizeDisabled) return;
    const step = event.shiftKey ? SIDEBAR_KEYBOARD_LARGE_STEP : SIDEBAR_KEYBOARD_STEP;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      setSidebarWidth((current) => clampSidebarWidth(current + direction * step));
      return;
    }
    if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    setSidebarWidth(event.key === 'Home' ? SIDEBAR_MIN_WIDTH : SIDEBAR_MAX_WIDTH);
  }

  return (
    <div
      className={appShellClassName({ sidebarHidden, compactSidebar })}
      style={{ '--sidebar-width': `${sidebarWidth}px` }}
    >
      <button
        type="button"
        className={sidebarHoverZoneClassName({
          visible: sidebarHidden || compactSidebar,
          peeking: sidebarPeeking
        })}
        aria-label="Show sidebar"
        onMouseEnter={() => setSidebarPeeking(true)}
        onFocus={() => setSidebarPeeking(true)}
        onClick={() => setSidebarPeeking(true)}
      />
      <aside
        id="app-sidebar"
        ref={sidebarRef}
        className={appSidebarClassName({ sidebarHidden, sidebarPeeking, compactSidebar })}
        aria-label="Application navigation"
        onMouseEnter={() => setSidebarPeeking(true)}
        onMouseLeave={() => setSidebarPeeking(false)}
      >
        <div
          aria-controls="app-sidebar"
          aria-disabled={sidebarResizeDisabled}
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuenow={sidebarWidth}
          aria-valuetext={`${sidebarWidth} pixels`}
          className={sidebarResizeHandleClassName({
            disabled: sidebarResizeDisabled,
            resizing: sidebarResizing
          })}
          onKeyDown={handleSidebarResizeKeyDown}
          onLostPointerCapture={finishSidebarResize}
          onPointerCancel={finishSidebarResize}
          onPointerDown={startSidebarResize}
          onPointerMove={moveSidebarResize}
          onPointerUp={finishSidebarResize}
          role="separator"
          tabIndex={sidebarResizeDisabled ? -1 : 0}
          title="Resize sidebar"
        />
        <div className={sidebarWindowControlsClassName({ compactSidebar })} aria-hidden="true">
          <span className={trafficDotClassName('red')} />
          <span className={trafficDotClassName('yellow')} />
          <span className={trafficDotClassName('green')} />
        </div>
        <IconButton
          onClick={() => setSidebarPeeking(false)}
          label="Close sidebar"
          title="Close sidebar"
          icon={<Icon name="sidebarClose" />}
          className={sidebarOverlayCloseClassName({ visible: compactSidebar && sidebarPeeking })}
        />

        <div className={sidebarBrandClassName}>
          <strong>file-census</strong>
          <span className={sidebarBrandSubtitleClassName}>Local file memory</span>
        </div>

        <nav className={sidebarNavClassName} aria-label="Primary">
          {tabs.map(([id, label, description]) => (
            <button key={id} className={sidebarNavButtonClassName({ active: activeTab === id })} onClick={() => setTab(id)}>
              <span className={navIconClassName}><Icon name={tabIcons[id]} className={navIconSvgClassName} /></span>
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </nav>

        <section className={sidebarSectionClassName}>
          <div className={sidebarSectionTitleClassName}>
            <span>Locations</span>
            <IconButton
              className={sidebarIconButtonClassName}
              onClick={onShowAddLocation}
              title="Add location"
              label="Add location"
              disabled={busy}
              icon={<Icon name="add" />}
            />
          </div>
          <div className={sidebarLocationListClassName} data-sidebar-location-list>
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
            {!locationList.length && <p className={sidebarEmptyClassName}>No locations yet.</p>}
          </div>
        </section>

        {runningProgress.length > 0 && (
          <section className={cn(sidebarSectionClassName, sidebarActivityClassName)}>
            <div className={sidebarSectionTitleClassName}>
              <span>Activity</span>
              <small>{runningProgress.length} running</small>
            </div>
            {runningProgress.slice(0, 3).map((progress) => (
              <article className={sidebarProgressClassName} key={progress.scan_id}>
                <strong>{progress.location_slug}</strong>
                <span>{progress.file_count} files - {bytes(progress.total_bytes)}</span>
                <ScanProgressPools progress={progress} compact />
                {progress.current_path && <code className={sidebarProgressPathClassName} title={progress.current_path}>{progress.current_path}</code>}
              </article>
            ))}
            {runningProgress.length > 3 && <p className={sidebarEmptyClassName}>+{runningProgress.length - 3} more scans</p>}
          </section>
        )}

        <div className={sidebarSpacerClassName} />

        <section className={sidebarFooterClassName}>
          <StatusPill
            variant="ghost"
            className={sidebarConnectionPillClassName}
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
              <h1 className={topbarTitleHeadingClassName}>{headerTitle(activeTabMeta)}</h1>
              <p className={topbarDescriptionClassName}>{headerContext(activeTab, selectedLocation, selectedScanId)}</p>
            </div>
          </div>
          <Toolbar className={headerActionsClassName}>
            <CommandPalette
              groups={commandGroups}
              title="Command menu"
              placeholder="Search locations, scans, and actions…"
              triggerLabel="Command"
              shortcutLabel="⌘K"
            />
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
    <div className={sidebarLocationGroupClassName({ disabled: location.disabled })}>
      <div className={sidebarLocationRowClassName}>
        <button
          type="button"
          className={sidebarDisclosureClassName}
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
        <div className={sidebarScanListClassName}>
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
      className={sidebarLocationClassName({ selected, hasSelectedScan, disabled: location.disabled })}
      onClick={onSelect}
      title={`${location.slug} - ${location.root_path}`}
      aria-label={`${location.name || location.slug}, ${location.root_path}`}
    >
      <span className={locationLedClassName({ connected: location.connected, compact: true })} title={livenessTitle(location)} />
      <span className={sidebarLocationBodyClassName}>
        <strong>{location.name || location.slug}</strong>
        <small>{location.root_path}</small>
      </span>
      <span className={sidebarLocationMetaClassName}>
        <strong>{location.scanCount}</strong>
        <small>{location.scanCount === 1 ? 'scan' : 'scans'}</small>
      </span>
    </button>
  );
}

function SidebarScanItem({ scan, selected, onSelect }) {
  return (
    <button
      type="button"
      className={sidebarScanClassName({ selected, active: isActiveStatus(scan.status) })}
      onClick={onSelect}
      title={scan.id}
    >
      <span className={sidebarScanStatusClassName({ selected, active: isActiveStatus(scan.status) })}>
        {scan.is_representative ? 'Rep' : statusLabel(scan.status)}
      </span>
      <span className={sidebarScanBodyClassName}>
        <strong>{scanLabel(scan)}</strong>
        <small>{scan.id}</small>
      </span>
    </button>
  );
}

function headerDescription(activeTab) {
  if (activeTab === 'dashboard') return 'Current database activity and recent app-session events.';
  if (activeTab === 'duplicates') return 'Review exact-content matches across representative scans.';
  if (activeTab === 'search') return 'Find files by name, extension, or path fragment.';
  if (activeTab === 'tasks') return 'Monitor running scanner work and recent events.';
  if (activeTab === 'options') return 'Choose the active database and manage local app settings.';
  return 'Choose a source location from the sidebar or add a new one.';
}

function headerContext(activeTab, location, selectedScanId) {
  if (activeTab === 'locations' && location) {
    const locationLabel = location.name || location.slug;
    const selectedScan = location.scans.find((scan) => scan.id === selectedScanId);
    if (selectedScan) return `${locationLabel} · ${scanLabel(selectedScan)}`;
    return locationLabel;
  }
  return headerDescription(activeTab);
}

function headerTitle(activeTabMeta) {
  return activeTabMeta[1];
}

function findSidebarScrollable(target, sidebar) {
  if (!(target instanceof Element)) return null;
  const scrollable = target.closest('[data-sidebar-location-list]');
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
