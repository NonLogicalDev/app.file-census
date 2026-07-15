import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  File,
  FileArchive,
  FileImage,
  FileVideo,
  FolderTree,
  Layers3,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { duplicateGroups, files, scans } from '../mockData.js';
import './duplicates.css';

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'];

function formatBytes(value) {
  let amount = Number(value) || 0;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < byteUnits.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount >= 10 || unitIndex === 0 ? Math.round(amount) : amount.toFixed(1)} ${byteUnits[unitIndex]}`;
}

function asGroupFiles(group) {
  if (Array.isArray(group.files)) return group.files;
  if (Array.isArray(group.copies)) return group.copies;
  return files.filter((file) => file.duplicateGroupId === group.id || file.groupId === group.id);
}

function groupLabel(group, index) {
  const firstFile = asGroupFiles(group)[0];
  return group.label || group.name || firstFile?.name || `Duplicate group ${index + 1}`;
}

function groupBytes(group) {
  const groupFiles = asGroupFiles(group);
  return Number(group.sizeBytes ?? group.size ?? group.fileSize ?? group.bytes ?? groupFiles[0]?.sizeBytes ?? groupFiles[0]?.size ?? 0);
}

function groupReclaimableBytes(group) {
  return Math.max(0, asGroupFiles(group).length - 1) * groupBytes(group);
}

function groupKind(group) {
  const value = String(group.kind || group.type || asGroupFiles(group)[0]?.kind || '').toLowerCase();
  if (value.includes('image') || value.includes('photo')) return 'image';
  if (value.includes('video') || value.includes('movie')) return 'video';
  if (value.includes('archive') || value.includes('zip')) return 'archive';
  return 'file';
}

function KindIcon({ kind }) {
  const Icon = kind === 'image' ? FileImage : kind === 'video' ? FileVideo : kind === 'archive' ? FileArchive : File;
  return <Icon aria-hidden="true" size={15} strokeWidth={1.75} />;
}

function scanLabel(scan, index) {
  return scan.label || scan.name || scan.locationName || `Scan ${index + 1}`;
}

function scanMeta(scan) {
  return scan.completedAt || scan.scannedAt || scan.date || scan.status || 'Completed scan';
}

function filePath(file) {
  return file.path || file.fullPath || file.location || file.name || 'Unknown path';
}

const initialSelectedScans = scans
  .filter((scan) => scan.isRepresentative)
  .slice(0, 2)
  .map((scan) => scan.id);

export default function DuplicatesScreen({ duplicateIntent, onClearDuplicateIntent, onCommandContextChange }) {
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [appliedScope, setAppliedScope] = useState('representative');
  const [pendingScope, setPendingScope] = useState('representative');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pendingScans, setPendingScans] = useState(initialSelectedScans);
  const [appliedScans, setAppliedScans] = useState(initialSelectedScans);
  const [scopeError, setScopeError] = useState('');
  const [minimumCopies, setMinimumCopies] = useState(2);
  const [kindFilter, setKindFilter] = useState('all');
  const [view, setView] = useState('flat');
  const [sort, setSort] = useState('copies');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set([duplicateGroups[0]?.id]));
  const [selectedGroupId, setSelectedGroupId] = useState(duplicateGroups[0]?.id ?? null);
  const [selectedFiles, setSelectedFiles] = useState(() => new Set());

  const scopedGroups = useMemo(() => {
    if (appliedScope === 'representative') return duplicateGroups;

    const includedScans = new Set(appliedScans);
    return duplicateGroups.filter((group) => {
      const groupFiles = asGroupFiles(group);
      return groupFiles.length >= 2 && groupFiles.every((file) => includedScans.has(file.scanId));
    });
  }, [appliedScans, appliedScope]);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = scopedGroups.filter((group, index) => {
      if (asGroupFiles(group).length < minimumCopies) return false;
      if (kindFilter !== 'all' && groupKind(group) !== kindFilter) return false;
      if (!needle) return true;
      const paths = asGroupFiles(group).map(filePath).join(' ');
      return `${groupLabel(group, index)} ${group.hash || ''} ${paths}`.toLowerCase().includes(needle);
    });

    return [...matching].sort((left, right) => {
      if (sort === 'size') return groupBytes(right) - groupBytes(left);
      if (sort === 'name') return groupLabel(left, 0).localeCompare(groupLabel(right, 0));
      return asGroupFiles(right).length - asGroupFiles(left).length;
    });
  }, [kindFilter, minimumCopies, query, scopedGroups, sort]);

  const selectedGroup = visibleGroups.find((group) => group.id === selectedGroupId) || visibleGroups[0] || null;
  const selectedGroupFiles = useMemo(() => selectedGroup ? asGroupFiles(selectedGroup) : [], [selectedGroup]);
  const selectedGroupFileCount = selectedGroupFiles.filter((file) => selectedFiles.has(filePath(file))).length;
  const treeView = view === 'tree';
  const totalCopies = visibleGroups.reduce((sum, group) => sum + asGroupFiles(group).length, 0);
  const reclaimable = visibleGroups.reduce((sum, group) => sum + groupReclaimableBytes(group), 0);

  function commitQuery(event) {
    event?.preventDefault();
    const nextQuery = draftQuery.trim();
    const intentQuery = duplicateIntent?.hash || duplicateIntent?.name || '';
    if (duplicateIntent && nextQuery !== intentQuery) onClearDuplicateIntent?.();
    setQuery(nextQuery);
  }

  function clearDuplicateIntent() {
    onClearDuplicateIntent?.();
    setDraftQuery('');
    setQuery('');
    setSelectedGroupId(duplicateGroups[0]?.id ?? null);
  }

  function togglePendingScan(id) {
    setPendingScans((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return [...next];
    });
    setScopeError('');
  }

  function resetScopeDraft() {
    setPendingScope(appliedScope);
    setPendingScans(appliedScans);
    setScopeError('');
  }

  function toggleScopePopover() {
    if (scopeOpen) {
      resetScopeDraft();
      setScopeOpen(false);
      return;
    }
    resetScopeDraft();
    setScopeOpen(true);
  }

  function cancelScope() {
    resetScopeDraft();
    setScopeOpen(false);
  }

  function applyScope() {
    if (pendingScope === 'selected' && pendingScans.length < 2) {
      setScopeError('Select at least two scans to compare.');
      return;
    }
    setAppliedScope(pendingScope);
    setAppliedScans(pendingScans);
    setScopeError('');
    setScopeOpen(false);
  }

  function toggleGroup(id) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFile(path) {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const appliedScopeLabel = appliedScope === 'representative'
    ? 'Representative scan set'
    : `${appliedScans.length} selected scans`;

  useEffect(() => {
    if (!duplicateIntent) return;
    const intentQuery = duplicateIntent.hash || duplicateIntent.name || '';
    const matchingGroup = duplicateGroups.find((group) => (
      (duplicateIntent.hash && group.hash === duplicateIntent.hash)
      || asGroupFiles(group).some((file) => file.name === duplicateIntent.name)
    ));
    setDraftQuery(intentQuery);
    setQuery(intentQuery);
    setAppliedScope('representative');
    setMinimumCopies(2);
    setKindFilter('all');
    setSelectedGroupId(matchingGroup?.id || null);
  }, [duplicateIntent]);

  const onPrototypeCommand = useCallback((event) => {
      const command = event.detail || {};
      if (command.type === 'duplicates-view' && ['flat', 'tree'].includes(command.value)) setView(command.value);
      if (command.type === 'duplicates-scope' && command.value === 'representative') setAppliedScope('representative');
      if (command.type === 'duplicates-advanced') setAdvancedOpen(true);
      if (command.type === 'duplicate-expand') {
        const groupId = command.groupId || selectedGroup?.id;
        if (groupId) setExpandedGroups((current) => new Set(current).add(groupId));
        if (groupId) setSelectedGroupId(groupId);
        setView('tree');
      }
      if (command.type === 'duplicate-stage-delete-check') {
        const path = command.path || selectedGroupFiles[0]?.path;
        if (path) setSelectedFiles((current) => new Set(current).add(path));
      }
    }, [selectedGroup?.id, selectedGroupFiles]);

  useEffect(() => {
    window.addEventListener('redesign:prototype-command', onPrototypeCommand);
    return () => window.removeEventListener('redesign:prototype-command', onPrototypeCommand);
  }, [onPrototypeCommand]);

  useEffect(() => {
    onCommandContextChange?.({
      selectedGroup: selectedGroup ? {
        ...selectedGroup,
        label: groupLabel(selectedGroup, duplicateGroups.indexOf(selectedGroup)),
        files: selectedGroupFiles,
      } : null,
      stagedPaths: [...selectedFiles],
    });
  }, [onCommandContextChange, selectedFiles, selectedGroup, selectedGroupFiles]);

  return (
    <section className={`rd-duplicates${advancedOpen ? ' has-advanced' : ''}`} aria-label="Duplicates workspace">
      <header className="rd-route-bar">
        <div className="rd-route-heading"><span>Analysis</span><strong>Duplicates</strong></div>
        <div className="rd-route-tools rd-duplicates__route-meta">
          <span>Exact content identity</span>
          <span>{duplicateGroups.length} groups indexed</span>
        </div>
      </header>

      <div className="rd-duplicates__controls">
        <form className="rd-query" onSubmit={commitQuery} role="search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="Filter duplicate groups"
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Filter by name, path, or hash"
            value={draftQuery}
          />
          <button className="rd-button rd-button--quiet" type="submit">Search</button>
        </form>

        <button
          aria-expanded={advancedOpen}
          className={`rd-button rd-button--quiet ${advancedOpen ? 'is-active' : ''}`}
          onClick={() => setAdvancedOpen((open) => !open)}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" size={14} />
          Advanced filters
          <ChevronDown aria-hidden="true" className={advancedOpen ? 'is-rotated' : ''} size={13} />
        </button>

        <div className="rd-scope-control">
          <button
            aria-expanded={scopeOpen}
            className="rd-button rd-button--quiet rd-scope-control__trigger"
            onClick={toggleScopePopover}
            type="button"
          >
            <Layers3 aria-hidden="true" size={14} />
            {appliedScopeLabel}
            <ChevronDown aria-hidden="true" size={13} />
          </button>

          {scopeOpen && (
            <div className="rd-scope-popover">
              <div className="rd-scope-popover__heading">Duplicate comparison scope</div>
              <label className="rd-radio-row">
                <input checked={pendingScope === 'representative'} name="scope" onChange={() => setPendingScope('representative')} type="radio" />
                <span>
                  <strong>Representative scans</strong>
                  <small>Newest completed scan for each location</small>
                </span>
              </label>
              <label className="rd-radio-row">
                <input checked={pendingScope === 'selected'} name="scope" onChange={() => setPendingScope('selected')} type="radio" />
                <span>
                  <strong>Selected scans</strong>
                  <small>Compare an exact set of scan snapshots</small>
                </span>
              </label>

              {pendingScope === 'selected' && (
                <div className="rd-scan-options">
                  {scans.map((scan, index) => (
                    <label className="rd-check-row" key={scan.id}>
                      <input checked={pendingScans.includes(scan.id)} onChange={() => togglePendingScan(scan.id)} type="checkbox" />
                      <span>
                        <strong>{scanLabel(scan, index)}</strong>
                        <small>{scanMeta(scan)}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {scopeError && <p className="rd-scope-error" role="alert">{scopeError}</p>}
              <div className="rd-scope-popover__actions">
                <button className="rd-button rd-button--quiet" onClick={cancelScope} type="button">Cancel</button>
                <button className="rd-button rd-button--primary" onClick={applyScope} type="button">Apply</button>
              </div>
            </div>
          )}
        </div>

        <div className="rd-segmented" aria-label="Duplicate result layout">
          <button aria-pressed={view === 'flat'} className={view === 'flat' ? 'is-active' : ''} onClick={() => setView('flat')} type="button">
            <List aria-hidden="true" size={13} /> Flat
          </button>
          <button aria-pressed={treeView} className={treeView ? 'is-active' : ''} onClick={() => setView('tree')} type="button">
            <FolderTree aria-hidden="true" size={13} /> Tree
          </button>
        </div>
      </div>

      {advancedOpen && (
        <div className="rd-duplicates__advanced">
          <label>
            Minimum copies
            <select onChange={(event) => setMinimumCopies(Number(event.target.value))} value={minimumCopies}>
              <option value="2">2</option><option value="3">3</option><option value="4">4</option>
            </select>
          </label>
          <label>
            Kind
            <select onChange={(event) => setKindFilter(event.target.value)} value={kindFilter}>
              <option value="all">All kinds</option><option value="image">Images</option><option value="video">Videos</option><option value="archive">Archives</option>
            </select>
          </label>
        </div>
      )}

      <div className="rd-duplicates__summary">
        <span><strong>{visibleGroups.length}</strong> groups</span>
        <span><strong>{totalCopies}</strong> copies</span>
        <span><strong>{formatBytes(reclaimable)}</strong> reclaimable</span>
        {query && <span className="rd-filter-chip">Filter: {query}</span>}
        {duplicateIntent && (
          <button aria-label={`Clear exact match filter for ${duplicateIntent.name}`} className="rd-filter-chip rd-filter-chip--clear" onClick={clearDuplicateIntent} type="button">
            <span>Exact matches for: {duplicateIntent.name}</span>
            <X aria-hidden="true" size={11} />
          </button>
        )}
      </div>

      <div className="rd-duplicates__workspace">
        <div className="rd-groups-pane">
          <div className="rd-table-head rd-group-grid">
            <span>Group</span>
            <span><button onClick={() => setSort('copies')} type="button">Copies <ChevronsUpDown aria-hidden="true" size={12} /></button></span>
            <span><button onClick={() => setSort('size')} type="button">Each <ChevronsUpDown aria-hidden="true" size={12} /></button></span>
            <span>Reclaimable</span>
          </div>

          <div className="rd-groups-list" role="list" aria-label="Duplicate groups">
            {visibleGroups.map((group, index) => {
              const groupFiles = asGroupFiles(group);
              const expanded = expandedGroups.has(group.id);
              const selected = selectedGroup?.id === group.id;
              const kind = groupKind(group);
              return (
                <div className="rd-group-block" key={group.id} role="listitem">
                  <div className={`rd-group-row rd-group-grid ${selected ? 'rd-selected' : ''}`}>
                    <div className="rd-group-row__cell">
                      <button
                        aria-expanded={treeView ? expanded : undefined}
                        aria-pressed={selected}
                        className="rd-group-row__name"
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          if (treeView) toggleGroup(group.id);
                        }}
                        type="button"
                      >
                        {treeView
                          ? expanded ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />
                          : <span className="rd-group-row__spacer" />}
                        <KindIcon kind={kind} />
                        <span>
                          <strong>{groupLabel(group, index)}</strong>
                          <small>{group.hash ? String(group.hash).slice(0, 16) : `${kind} content match`}</small>
                        </span>
                      </button>
                    </div>
                    <span>{groupFiles.length}</span>
                    <span>{formatBytes(groupBytes(group))}</span>
                    <span>{formatBytes(groupReclaimableBytes(group))}</span>
                  </div>

                  {treeView && expanded && (
                    <div className="rd-group-tree">
                      {groupFiles.map((file, fileIndex) => {
                        const path = filePath(file);
                        return (
                          <div key={`${group.id}-${path}-${fileIndex}`}>
                            <div>
                              <button aria-pressed={selectedFiles.has(path)} className="rd-group-tree__row" onClick={() => toggleFile(path)} type="button">
                                <span className={`rd-selection-box ${selectedFiles.has(path) ? 'rd-selected' : ''}`} aria-hidden="true" />
                                <File aria-hidden="true" size={13} />
                                <span>{path}</span>
                                <small>{file.modified || file.modifiedAt || '2026-07-11 18:42'}</small>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rd-duplicate-inspector" aria-label="Selected duplicate group">
          {selectedGroup ? (
            <>
              <div className="rd-inspector-heading">
                <KindIcon kind={groupKind(selectedGroup)} />
                <div>
                  <h2>{groupLabel(selectedGroup, duplicateGroups.indexOf(selectedGroup))}</h2>
                  <p>Exact content match</p>
                </div>
              </div>

              <dl className="rd-inspector-metrics">
                <div><dt>Copies</dt><dd>{selectedGroupFiles.length}</dd></div>
                <div><dt>File size</dt><dd>{formatBytes(groupBytes(selectedGroup))}</dd></div>
                <div><dt>Potential savings</dt><dd>{formatBytes(groupReclaimableBytes(selectedGroup))}</dd></div>
              </dl>

              <div className="rd-inspector-section">
                <div className="rd-inspector-section__title">Locations</div>
                <div className="rd-copy-list">
                  {selectedGroupFiles.map((file, index) => {
                    const path = filePath(file);
                    return (
                      <button aria-pressed={selectedFiles.has(path)} className={selectedFiles.has(path) ? 'rd-selected' : ''} key={`${path}-${index}`} onClick={() => toggleFile(path)} type="button">
                        <span className={`rd-selection-box ${selectedFiles.has(path) ? 'rd-selected' : ''}`} aria-hidden="true" />
                        <span><strong>{file.name || path.split('/').pop()}</strong><small>{path}</small></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rd-inspector-section rd-inspector-section--hash">
                <div className="rd-inspector-section__title">Content hash</div>
                <code>{selectedGroup.hash || 'sha256: exact-content-match'}</code>
              </div>

              <div className="rd-inspector-actions">
                <span>{selectedGroupFileCount} selected</span>
                <button className="rd-button rd-button--quiet" disabled={selectedGroupFileCount === 0} type="button">Review selection</button>
              </div>
            </>
          ) : (
            <div className="rd-empty-state">No duplicate groups match this filter.</div>
          )}
        </aside>
      </div>
    </section>
  );
}
