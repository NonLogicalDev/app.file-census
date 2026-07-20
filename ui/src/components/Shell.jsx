import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandPalette } from './command-palette/index.js';
import { Icon } from './Icon.jsx';
import {
  appMainClassName,
  appRightRailClassName,
  appRightRailOverlayClassName,
  railHoverZoneClassName,
  appShellClassName,
  appSidebarClassName,
  Button,
  headerActionsClassName,
  IconButton,
  Menu,
  MenuContent,
  MenuLabel,
  MenuTrigger,
  pageActionsListClassName,
  pageActionsMenuClassName,
  pageActionsPanelClassName,
  pageActionsPanelTitleClassName,
  pageActionsTriggerClassName,
  sidebarHoverZoneClassName,
  sidebarOverlayCloseClassName,
  sidebarResizeHandleClassName,
  topbarDescriptionClassName,
  topbarSidebarToggleClassName,
  topbarTitleClassName,
  topbarTitleCopyClassName,
  topbarTitleHeadingClassName,
  Toolbar,
  workspaceHeaderClassName
} from './ui/index.jsx';
import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH
} from './ui/shellClasses.js';
import { isActiveStatus, scanLabel, statusLabel, when } from '../utils/format.js';

const tabs = [
  ['dashboard', 'Dashboard', 'Current database and activity'],
  ['locations', 'Locations', 'Sources and scans'],
  ['duplicates', 'Duplicates', 'Content seen elsewhere'],
  ['search', 'Search', 'Find by path or name'],
  ['tasks', 'Tasks', 'Running scanner work'],
  ['options', 'Options', 'Database and app settings']
];


const SIDEBAR_HIDDEN_STORAGE_KEY = 'file-census.sidebar.hidden';
const SIDEBAR_WIDTH_STORAGE_KEY = 'file-census.sidebar.width';
const SIDEBAR_KEYBOARD_STEP = 16;
const SIDEBAR_KEYBOARD_LARGE_STEP = 48;
const RAIL_WIDTH_STORAGE_KEY = 'file-census.inspector.width';
const RAIL_MIN_WIDTH = 240;
const RAIL_MAX_WIDTH = 560;

function clampRailWidth(value) {
  if (value == null || value === '') return 320;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 320;
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(parsed)));
}

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
  locationsLoading = false,
  selectedLocationSlug,
  selectedScanId,
  onChooseLocation,
  onSelectScan,
  onShowAddLocation,
  commandGroups = [],
  topBarActions,
  rightRail = null,
  rightRailOpen = true,
  children
}) {
  const [sidebarHidden, setSidebarHidden] = useState(readStoredSidebarHidden);
  const [sidebarPeeking, setSidebarPeeking] = useState(false);
  const [compactSidebar, setCompactSidebar] = useState(isCompactViewport);
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [pageActionsOpen, setPageActionsOpen] = useState(false);
  const [expandedLocations, setExpandedLocations] = useState({});
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const sidebarRef = useRef(null);
  const sidebarResizeSession = useRef(null);
  // Inspector right-rail width, persisted; resizable via its left-edge handle.
  const [railWidth, setRailWidth] = useState(() => clampRailWidth(readSidebarPreference(RAIL_WIDTH_STORAGE_KEY)));
  const [railResizing, setRailResizing] = useState(false);
  const [railPeeking, setRailPeeking] = useState(false);
  const railResizeSession = useRef(null);
  const activeTabMeta = tabs.find(([id]) => id === activeTab) || tabs[0];
  const selectedLocation = locationList.find((location) => location.slug === selectedLocationSlug);
  const sidebarVisuallyOpen = compactSidebar ? sidebarPeeking : !sidebarHidden;
  // Resizing works whenever the sidebar is visible — including the hover/peek
  // overlay (the peek is held open for the duration of the drag).
  const sidebarResizeDisabled = !sidebarVisuallyOpen && !sidebarPeeking;
  const runningScans = runningProgress.filter((progress) => isActiveStatus(progress.status));
  const runningScan = runningScans[0] || null;
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', detail: 'Overview and activity', icon: 'dashboard' },
    { id: 'locations', label: 'Locations', detail: 'Browse scans and files', icon: 'locations' },
    { id: 'duplicates', label: 'Duplicates', detail: 'Compare content identity', icon: 'duplicates', badge: overview?.duplicate_groups ? String(overview.duplicate_groups) : null },
    { id: 'tasks', label: 'Tasks', detail: 'Background work', icon: 'tasks', badge: runningScans.length ? String(runningScans.length) : null },
    { id: 'search', label: 'Search', detail: 'Find by path or name', icon: 'searchFiles' }
  ];

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

  useEffect(() => {
    writeSidebarPreference(RAIL_WIDTH_STORAGE_KEY, String(railWidth));
  }, [railWidth]);

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

  // Surface status/error messages as short-lived stacked toasts instead of
  // shifting the page layout. Each toast auto-dismisses after a few seconds.
  useEffect(() => {
    if (!message) return undefined;
    const id = (toastSeq.current += 1);
    const tone = toastTone(message);
    setToasts((current) => [...current, { id, text: message, tone }]);
    // Errors persist until dismissed so they can be read and copied; other
    // toasts stay short-lived to avoid clutter.
    if (tone === 'error') return undefined;
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
    return () => clearTimeout(timer);
  }, [message]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const copyToast = useCallback((text) => {
    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
  }, []);

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

  const finishRailResize = useCallback((event) => {
    const session = railResizeSession.current;
    if (!session || (event && session.pointerId !== event.pointerId)) return;
    const control = event?.currentTarget;
    railResizeSession.current = null;
    if (control?.hasPointerCapture?.(session.pointerId)) {
      control.releasePointerCapture(session.pointerId);
    }
    setRailResizing(false);
  }, []);

  function startRailResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const control = event.currentTarget;
    try {
      control.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in older embedded webviews.
    }
    railResizeSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: railWidth
    };
    setRailResizing(true);
  }

  function moveRailResize(event) {
    const session = railResizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    // The handle sits on the rail's LEFT edge: dragging left widens it.
    setRailWidth(clampRailWidth(session.startWidth - (event.clientX - session.startX)));
  }

  function handleRailResizeKeyDown(event) {
    const step = event.shiftKey ? SIDEBAR_KEYBOARD_LARGE_STEP : SIDEBAR_KEYBOARD_STEP;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? 1 : -1;
      setRailWidth((current) => clampRailWidth(current + direction * step));
      return;
    }
    if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    setRailWidth(event.key === 'Home' ? RAIL_MIN_WIDTH : RAIL_MAX_WIDTH);
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
      className={appShellClassName({ sidebarHidden, compactSidebar, rightRail: Boolean(rightRail) && rightRailOpen })}
      style={{ '--sidebar-width': `${sidebarWidth}px`, '--inspector-width': `${railWidth}px` }}
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
        onMouseLeave={() => {
          // Keep the hover overlay open while a resize drag is in flight —
          // the pointer often crosses the sidebar edge mid-drag.
          if (!sidebarResizeSession.current) setSidebarPeeking(false);
        }}
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
        <IconButton
          onClick={() => setSidebarPeeking(false)}
          label="Close sidebar"
          title="Close sidebar"
          icon={<Icon name="sidebarClose" />}
          className={sidebarOverlayCloseClassName({ visible: compactSidebar && sidebarPeeking })}
        />

        {/* Brand */}
        <div className="flex h-12 flex-none items-center gap-2.5 border-b border-sidebar-border px-3">
          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-md border border-border bg-surface text-muted">
            <Icon name="locations" className="h-3.5 w-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.1]">
            <strong className="truncate text-[12.5px] font-semibold text-text">file-census</strong>
            <small className="mt-[3px] truncate text-[11px] text-text-tertiary">Inventory workspace</small>
          </span>
          <span
            className={`h-1.5 w-1.5 flex-none rounded-full ${wsStatus === 'live' ? 'bg-success' : wsStatus === 'connecting' ? 'bg-warning' : 'bg-danger'}`}
            title={connectionLabel(wsStatus, statusDetail)}
          />
          {!compactSidebar && (
            <IconButton
              onClick={() => setSidebarHidden((hidden) => !hidden)}
              label={sidebarHidden ? 'Pin sidebar open' : 'Unpin sidebar (show on hover only)'}
              title={sidebarHidden ? 'Pin the sidebar open' : 'Unpin — the sidebar collapses to the left edge and shows on hover'}
              variant="ghost"
              aria-pressed={!sidebarHidden}
              className={`!h-6 !w-6 !min-h-0 !p-0 hover:!text-text ${sidebarHidden ? '!text-muted' : '!text-accent'}`}
              icon={<Icon name="pin" className={`h-3.5 w-3.5 ${sidebarHidden ? 'rotate-45' : ''}`} />}
            />
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex flex-none flex-col gap-0.5 p-2" aria-label="Primary">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`grid min-h-[44px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-[7px] py-[5px] text-left transition-colors ${
                  active ? 'border-border bg-surface-muted text-text' : 'border-transparent text-muted hover:bg-surface hover:text-text'
                }`}
              >
                <Icon name={item.icon} className="h-4 w-4" />
                <span className="flex min-w-0 flex-col leading-[1.1]">
                  <span className="truncate text-[12px] font-medium">{item.label}</span>
                  <small className="mt-[3px] truncate text-[11px] font-normal text-text-tertiary">{item.detail}</small>
                </span>
                {item.badge ? (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border bg-surface-subtle px-[5px] text-[11px] font-[550] leading-4 text-text-tertiary">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Locations tree */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto border-t border-sidebar-border p-2" data-sidebar-location-list>
          <div className="flex h-6 flex-none items-center justify-between px-[7px] text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
            <span>Locations</span>
            <span className="flex items-center gap-1.5">
              <span>{locationList.length}</span>
              <button
                type="button"
                onClick={onShowAddLocation}
                disabled={busy}
                title="Add location"
                aria-label="Add location"
                className="grid h-5 w-5 place-items-center rounded text-text-tertiary transition-colors hover:bg-surface hover:text-text disabled:opacity-40"
              >
                <Icon name="add" className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          {locationList.map((location) => (
            <SidebarLocationNode
              key={location.slug}
              location={location}
              expanded={Boolean(expandedLocations[location.slug])}
              current={activeTab === 'locations' && selectedLocationSlug === location.slug && !selectedScanId}
              selectedScanId={selectedScanId}
              onToggle={() => setExpandedLocations((current) => ({ ...current, [location.slug]: !current[location.slug] }))}
              onSelectLocation={() => onChooseLocation(location.slug)}
              onSelectScan={(scanId) => onSelectScan(scanId, location.slug)}
            />
          ))}
          {!locationList.length && (
            locationsLoading ? (
              <p className="flex items-center gap-1.5 px-[7px] py-2 text-[11px] text-text-tertiary">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-border-strong" aria-hidden="true" />
                Loading locations…
              </p>
            ) : (
              <p className="px-[7px] py-2 text-[11px] text-text-tertiary">No locations yet.</p>
            )
          )}
        </div>

        {/* Running task chip */}
        {runningScan && (
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className="relative mx-2 mb-2 grid min-h-[58px] flex-none grid-cols-[26px_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-border-strong"
          >
            <span className="grid h-[26px] w-[26px] place-items-center rounded-[5px] bg-info-soft text-info"><Icon name="tasks" className="h-3.5 w-3.5" /></span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[11px] font-[550] text-text">{runningScan.location_name || runningScan.location_slug}</span>
              <small className="mt-0.5 truncate text-[11px] text-text-tertiary">{Number(runningScan.file_count || 0).toLocaleString()} files · {statusLabel(runningScan.status)}</small>
            </span>
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-muted"><span className="block h-full w-2/5 animate-pulse bg-info" /></span>
          </button>
        )}

        {/* Footer */}
        <div className="grid h-[38px] flex-none grid-cols-2 gap-0.5 border-t border-sidebar-border px-2 py-[5px]">
          <button
            type="button"
            onClick={openCommandSearch}
            className="flex items-center justify-center gap-1.5 rounded-[5px] text-[11px] text-text-tertiary transition-colors hover:bg-surface hover:text-muted"
          >
            <Icon name="search" className="h-3.5 w-3.5" /> Help
          </button>
          <button
            type="button"
            onClick={() => setTab('options')}
            className="flex items-center justify-center gap-1.5 rounded-[5px] text-[11px] text-text-tertiary transition-colors hover:bg-surface hover:text-muted"
          >
            <Icon name="options" className="h-3.5 w-3.5" /> Options
          </button>
        </div>
      </aside>

      <main className={appMainClassName}>
        <header className={workspaceHeaderClassName}>
          <div className={topbarTitleClassName}>
            {/* Compact (mobile) still needs a way to summon the overlay sidebar;
                on desktop the sidebar is pinned/unpinned from its own header. */}
            {compactSidebar && (
              <IconButton
                onClick={() => setSidebarPeeking(true)}
                label="Open sidebar"
                title="Open sidebar"
                variant="secondary"
                className={topbarSidebarToggleClassName}
                icon={<Icon name="sidebarOpen" />}
              />
            )}
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

        {/* Database metrics live on the Dashboard, live scan progress on the
            Tasks page and the sidebar chip; the workspace stays uncluttered. */}
        {children}
      </main>

      {rightRail && rightRailOpen && (
        <aside className={`${appRightRailClassName} relative`} aria-label="Inspector rail">
          <div
            aria-label="Resize inspector"
            aria-orientation="vertical"
            aria-valuemax={RAIL_MAX_WIDTH}
            aria-valuemin={RAIL_MIN_WIDTH}
            aria-valuenow={railWidth}
            aria-valuetext={`${railWidth} pixels`}
            className={sidebarResizeHandleClassName({
              disabled: false,
              resizing: railResizing,
              className: '!left-[-4px] !right-auto'
            })}
            onKeyDown={handleRailResizeKeyDown}
            onLostPointerCapture={finishRailResize}
            onPointerCancel={finishRailResize}
            onPointerDown={startRailResize}
            onPointerMove={moveRailResize}
            onPointerUp={finishRailResize}
            role="separator"
            tabIndex={0}
          />
          {rightRail}
        </aside>
      )}

      {rightRail && !rightRailOpen && (
        <>
          {/* Collapsed-rail hover mode: hovering the right edge peeks the
              Inspector as an overlay; resize works and holds the peek open. */}
          <button
            type="button"
            className={railHoverZoneClassName({ visible: true, peeking: railPeeking })}
            aria-label="Show inspector"
            onMouseEnter={() => setRailPeeking(true)}
            onFocus={() => setRailPeeking(true)}
            onClick={() => setRailPeeking(true)}
          />
          <aside
            className={appRightRailOverlayClassName({ peeking: railPeeking })}
            aria-label="Inspector rail"
            onMouseEnter={() => setRailPeeking(true)}
            onMouseLeave={() => {
              if (!railResizeSession.current) setRailPeeking(false);
            }}
          >
            <div
              aria-label="Resize inspector"
              aria-orientation="vertical"
              aria-valuemax={RAIL_MAX_WIDTH}
              aria-valuemin={RAIL_MIN_WIDTH}
              aria-valuenow={railWidth}
              aria-valuetext={`${railWidth} pixels`}
              className={sidebarResizeHandleClassName({
                disabled: false,
                resizing: railResizing,
                className: '!left-[-4px] !right-auto'
              })}
              onKeyDown={handleRailResizeKeyDown}
              onLostPointerCapture={finishRailResize}
              onPointerCancel={finishRailResize}
              onPointerDown={startRailResize}
              onPointerMove={moveRailResize}
              onPointerUp={finishRailResize}
              role="separator"
              tabIndex={0}
            />
            {rightRail}
          </aside>
        </>
      )}

      {/* Short-lived status toasts (no layout shift). */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2 rounded-ui border px-3.5 py-2.5 text-left text-[12px] leading-relaxed shadow-lg ${toastToneClassName(toast.tone)}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon
                name={toast.tone === 'error' ? 'warning' : toast.tone === 'success' ? 'check' : 'tasks'}
                className={`mt-0.5 h-3.5 w-3.5 flex-none ${toastToneIconClassName(toast.tone)}`}
              />
              <span className="min-w-0 flex-1 select-text break-words [overflow-wrap:anywhere]">{toast.text}</span>
              <span className="flex flex-none items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => copyToast(toast.text)}
                  className="grid h-5 w-5 place-items-center rounded opacity-70 transition hover:opacity-100"
                  title="Copy message"
                  aria-label="Copy message"
                >
                  <Icon name="copy" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="grid h-5 w-5 place-items-center rounded opacity-70 transition hover:opacity-100"
                  title="Dismiss"
                  aria-label="Dismiss"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Toasts carry no explicit tone, so infer one from the text: backend/runtime
// failures read as errors (red), completed actions as success (green).
function toastTone(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(error|failed|fail|could not|couldn't|cannot|can't|unable|denied|invalid|not found|no such|refused|timed out|timeout)\b/.test(value)) {
    return 'error';
  }
  if (/\b(started|completed|complete|finished|added|created|saved|removed|deleted|cleared|updated|reconciled|done|success)\b/.test(value)) {
    return 'success';
  }
  return 'neutral';
}

function toastToneClassName(tone) {
  if (tone === 'error') {
    return 'border-danger bg-[color:color-mix(in_srgb,var(--danger)_16%,var(--surface))] text-text';
  }
  if (tone === 'success') {
    return 'border-success bg-[color:color-mix(in_srgb,var(--success)_16%,var(--surface))] text-text';
  }
  return 'border-border bg-surface text-text';
}

function toastToneIconClassName(tone) {
  if (tone === 'error') return 'text-danger';
  if (tone === 'success') return 'text-success';
  return 'text-muted';
}

function connectionLabel(status, detail) {
  if (status === 'live') return 'Live updates';
  if (status === 'connecting') return 'Connecting';
  return `Reconnecting${detail ? `: ${detail}` : ''}`;
}


// Opens the top-bar command palette (search/run command) via its ⌘K shortcut.
function openCommandSearch() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }));
}

function scanStateDot(status) {
  if (status === 'running' || status === 'repairing') return 'bg-info';
  if (status === 'complete' || status === 'completed') return 'bg-success';
  if (status === 'failed') return 'bg-danger';
  if (status === 'paused' || status === 'stopping') return 'bg-warning';
  return 'bg-text-tertiary';
}

function SidebarLocationNode({ location, expanded, current, selectedScanId, onToggle, onSelectLocation, onSelectScan }) {
  const hasScans = location.scans.length > 0;

  return (
    <div className="mt-px">
      <button
        type="button"
        onClick={() => {
          onSelectLocation();
          onToggle();
        }}
        aria-expanded={expanded}
        title={`${location.slug} — ${location.root_path}`}
        className={`grid h-[30px] w-full grid-cols-[12px_14px_minmax(0,1fr)_8px] items-center gap-1.5 rounded-[5px] px-[7px] text-left transition-colors ${
          current ? 'bg-surface text-text' : 'text-muted hover:bg-surface hover:text-text'
        } ${location.disabled ? 'opacity-60' : ''}`}
      >
        {hasScans ? (
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} className="h-[11px] w-[11px] text-text-tertiary" />
        ) : (
          <span />
        )}
        <Icon name="locations" className="h-[13px] w-[13px]" />
        <span className="truncate text-[11.5px] font-medium">{location.name || location.slug}</span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${location.connected ? 'bg-success' : 'bg-border-strong'}`}
          title={livenessTitle(location)}
        />
      </button>
      {expanded && hasScans && (
        <div className="mb-1 ml-[26px] mt-px border-l border-sidebar-border pl-[5px]">
          {location.scans.map((scan) => {
            const selected = scan.id === selectedScanId;
            return (
              <button
                key={scan.id}
                type="button"
                onClick={() => onSelectScan(scan.id)}
                aria-current={selected ? 'page' : undefined}
                title={scan.id}
                className={`grid h-[26px] w-full grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[5px] px-1.5 text-left text-[11px] transition-colors ${
                  selected ? 'bg-surface-subtle text-text' : 'text-text-tertiary hover:bg-surface-subtle hover:text-muted'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${scanStateDot(scan.status)}`} />
                <span className="truncate">{scanLabel(scan)}</span>
                {Number(scan.sparse_file_count || 0) > 0 ? (
                  <span
                    className="inline-flex h-4 items-center rounded-[4px] border border-warning bg-warning-soft px-[5px] text-[10px] font-bold uppercase text-warning"
                    title={`${Number(scan.sparse_file_count).toLocaleString()} sparse-only files — exact-duplicate matching cannot see them`}
                  >
                    sparse
                  </span>
                ) : null}
                {scan.is_representative ? (
                  <span className="inline-flex h-4 items-center rounded-[4px] border border-border bg-surface-subtle px-[5px] text-[10px] font-medium text-text-tertiary">rep</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
