import { useMemo, useState } from 'react';

import { Icon } from '../components/Icon.jsx';
import SearchFilterControls from '../components/search/SearchFilterControls.jsx';
import ScanScopeSelector from '../components/search/ScanScopeSelector.jsx';
import { bytes } from '../utils/format.js';
import { buildDuplicateTree } from '../utils/duplicateTree.js';
import {
  SegmentedTab,
  SegmentedTabs,
  cardClassName,
  emptyTextClassName,
  interactiveRowClassName,
  mutedInlineClassName,
  pageGridClassName,
  pageHeaderClassName,
  stackedListClassName
} from '../components/ui/index.jsx';

export default function DuplicatesPage({
  query,
  setQuery,
  filters,
  locations,
  scans,
  busy,
  filteredDupes,
  selectedScanIds,
  duplicateView,
  loading = false,
  onCommitSearch,
  onAddFilter,
  onRemoveFilter,
  onGroupFilters,
  onReplaceFilterState,
  onSetSelectedScanIds,
  onSetDuplicateView,
  onOpenDuplicate
}) {
  const tree = useMemo(() => buildDuplicateTree(filteredDupes, scans), [filteredDupes, scans]);
  const [collapsedKeys, setCollapsedKeys] = useState(new Set());

  function toggleCollapsed(nodeId) {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  return (
    <section className={pageGridClassName}>
      <div className={pageHeaderClassName}>
        <div>
          <h2>Cross-scan duplicates</h2>
        </div>
      </div>
      <SearchFilterControls
        query={query}
        setQuery={setQuery}
        filters={filters}
        locations={locations}
        busy={busy}
        placeholder="Filter duplicate groups by path, name, location, or hash"
        submitLabel="Filter"
        helperText="Applies to files inside each duplicate group."
        onSubmit={onCommitSearch}
        onAddFilter={onAddFilter}
        onRemoveFilter={onRemoveFilter}
        onGroupFilters={onGroupFilters}
        onReplaceFilterState={onReplaceFilterState}
      />

      <ScanScopeSelector
        scope={selectedScanIds.length ? 'explicit' : 'representative'}
        locations={locations}
        scans={scans}
        selectedScanIds={selectedScanIds}
        busy={busy}
        loading={loading}
        onScopeChange={(nextScope) => {
          if (nextScope === 'representative') onSetSelectedScanIds([]);
        }}
        onSetSelectedScanIds={onSetSelectedScanIds}
      />

      <SegmentedTabs role="tablist" aria-label="Duplicate result views">
        <SegmentedTab role="tab" aria-selected={duplicateView === 'flat'} active={duplicateView === 'flat'} onClick={() => onSetDuplicateView('flat')}>Flat</SegmentedTab>
        <SegmentedTab role="tab" aria-selected={duplicateView === 'tree'} active={duplicateView === 'tree'} onClick={() => onSetDuplicateView('tree')}>Tree</SegmentedTab>
      </SegmentedTabs>

      {duplicateView === 'flat' ? (
        <div className={stackedListClassName}>
          {filteredDupes.map((group) => (
            <article className={cardClassName} key={`${group.blake3}-${group.size}-${group.file_kind}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <strong>{group.count} scans - {bytes(group.size)}</strong>
                <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-bold uppercase text-muted" title="Content kind">
                  {kindLabel(group.file_kind)}
                </span>
              </div>
              <code>{group.blake3}</code>
              {group.files.map((file) => (
                <button type="button" className={interactiveRowClassName} key={`${file.scan_id}-${file.path}`} onClick={() => onOpenDuplicate(file)} title="Open file details">
                  <span className={mutedInlineClassName}>{file.location_slug} - {file.location_name}</span>
                  <code>{file.path}</code>
                  <span className={mutedInlineClassName}>{kindLabel(file.file_kind || group.file_kind)}</span>
                </button>
              ))}
            </article>
          ))}
          {!filteredDupes.length && <p className={emptyTextClassName}>{loading ? 'Loading duplicates...' : selectedScanIds.length === 1 ? 'Select at least two scans to compare explicitly.' : 'No cross-scan duplicates match.'}</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-panel border border-border bg-surface shadow-sm">
          {tree.length ? tree.map((node) => (
            <DuplicateTreeNode
              key={node.id}
              node={node}
              depth={0}
              collapsedKeys={collapsedKeys}
              onToggleCollapsed={toggleCollapsed}
              onOpenDuplicate={onOpenDuplicate}
            />
          )) : <p className={emptyTextClassName}>{loading ? 'Loading duplicates...' : selectedScanIds.length === 1 ? 'Select at least two scans to compare explicitly.' : 'No duplicate tree rows match.'}</p>}
        </div>
      )}
    </section>
  );
}

function kindLabel(kind) {
  const value = String(kind || 'other');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function DuplicateTreeNode({ node, depth, collapsedKeys, onToggleCollapsed, onOpenDuplicate }) {
  const hasChildren = Boolean(node.children?.length);
  const collapsed = collapsedKeys.has(node.id);
  const paddingLeft = `${0.75 + depth * 1.25}rem`;
  const iconName = node.type === 'location' ? 'locations' : node.type === 'scan' ? 'scan' : node.type === 'folder' ? 'folder' : 'file';

  return (
    <div>
      <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-3 py-1.5 text-sm odd:bg-surface-muted/60" style={{ paddingLeft }}>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-2 text-left"
          onClick={() => (node.type === 'file' ? onOpenDuplicate(node.file) : hasChildren && onToggleCollapsed(node.id))}
          title={node.type === 'file' ? 'Open file details' : hasChildren ? `${collapsed ? 'Expand' : 'Collapse'} ${node.type}` : undefined}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center text-muted">
            {hasChildren ? <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} /> : <Icon name={iconName} />}
          </span>
          <span className="truncate font-medium text-text">{node.name}</span>
        </button>
        {node.type === 'file' ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className={mutedInlineClassName}>{kindLabel(node.file_kind)}</span>
            <code className="truncate text-xs text-muted">{node.blake3?.slice(0, 12)}</code>
          </span>
        ) : <span className={mutedInlineClassName}>{node.children.length} rows</span>}
        {node.type === 'file' ? <span className={mutedInlineClassName}>{bytes(node.size)}</span> : <span className={mutedInlineClassName}>{node.status || node.location_slug || ''}</span>}
      </div>
      {hasChildren && !collapsed && node.children.map((child) => (
        <DuplicateTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          collapsedKeys={collapsedKeys}
          onToggleCollapsed={onToggleCollapsed}
          onOpenDuplicate={onOpenDuplicate}
        />
      ))}
    </div>
  );
}
