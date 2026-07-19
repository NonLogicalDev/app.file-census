import { useMemo } from 'react';
import { Icon } from './Icon.jsx';

// While Delete Check mode is on, folders that exist only in the REMAIN-set
// (unrelated to any staged member) are greyed out and not selectable — the
// scoped browse would show nothing there. In scope: staged members, their
// descendants, and their ancestors (the navigable chain). Root always is.
function pathInDeleteCheckScope(path, members) {
  if (!path) return true;
  return members.some((member) => {
    if (path === member.path) return true;
    if (member.kind === 'dir' && path.startsWith(`${member.path}/`)) return true;
    return member.path.startsWith(`${path}/`);
  });
}

export default function DirectoryTree({
  nodes = {},
  expandedPaths = [],
  loadingPaths = [],
  selectedPath = '',
  deleteCheckMode = false,
  deleteCheckSet = [],
  onToggle,
  onSelect,
  onLoadMore
}) {
  const expanded = useMemo(() => new Set(expandedPaths), [expandedPaths]);
  const loading = useMemo(() => new Set(loadingPaths), [loadingPaths]);
  const scopeMembers = deleteCheckMode ? deleteCheckSet : null;
  const root = { name: 'Scan root', path: '', kind: 'dir', file_count: 0 };

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-border bg-[#0d0d0f]" aria-label="Directory navigation">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        <span>Folders</span>
        <span>{Object.values(nodes).reduce((count, page) => count + (page?.entries?.length || 0), 0)} loaded</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1" role="tree" aria-label="Scan folders">
        <DirectoryBranch
          entry={root}
          depth={0}
          nodes={nodes}
          expanded={expanded}
          loading={loading}
          selectedPath={selectedPath}
          scopeMembers={scopeMembers}
          onToggle={onToggle}
          onSelect={onSelect}
          onLoadMore={onLoadMore}
          root
        />
      </div>
    </aside>
  );
}

function DirectoryBranch({
  entry,
  depth,
  nodes,
  expanded,
  loading,
  selectedPath,
  scopeMembers = null,
  onToggle,
  onSelect,
  onLoadMore,
  root = false
}) {
  const page = nodes[entry.path];
  const children = page?.entries || [];
  const isExpanded = expanded.has(entry.path);
  const isLoading = loading.has(entry.path);
  const hasPotentialChildren = root || !page || isLoading || children.length > 0 || page.hasMore;
  const isSelected = selectedPath === entry.path;
  // Delete Check mode: remain-set-only folders are visible but inert.
  const outOfScope = scopeMembers !== null && !pathInDeleteCheckScope(entry.path, scopeMembers);
  // Match the indentation the node's own children get (rendered at depth + 1),
  // including the 24px chevron gutter so placeholders align under child labels.
  const childIndent = 4 + (depth + 1) * 14 + 24;

  return (
    <div role="treeitem" aria-level={depth + 1} aria-selected={isSelected} aria-expanded={hasPotentialChildren ? isExpanded : undefined}>
      <div
        className={[
          'group flex h-7 min-w-0 items-center rounded-ui',
          outOfScope
            ? 'text-border-strong opacity-50'
            : isSelected
              ? 'bg-surface-muted text-text'
              : 'text-muted hover:bg-surface-subtle hover:text-muted-strong'
        ].join(' ')}
        style={{ paddingInlineStart: `${4 + depth * 14}px` }}
      >
        {hasPotentialChildren ? (
          <button
            type="button"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border-0 bg-transparent p-0 text-muted hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
            onClick={() => onToggle?.(entry.path)}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${entry.name}`}
          >
            <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={13} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          className={`flex h-full min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent px-0 pr-1.5 text-left text-[11px] text-inherit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-line ${outOfScope ? 'cursor-not-allowed' : ''}`}
          onClick={() => { if (!outOfScope) onSelect?.(entry.path); }}
          disabled={outOfScope}
          title={outOfScope ? `${entry.path} — not in the Delete Check set` : entry.path || 'Scan root'}
        >
          <Icon name="folder" size={14} className="shrink-0 text-muted group-hover:text-muted-strong" />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {Number.isFinite(entry.file_count) && entry.file_count > 0 && (
            <span className="shrink-0 text-[10px] text-muted">{entry.file_count.toLocaleString()}</span>
          )}
        </button>
      </div>
      {isExpanded && (
        <div role="group">
          {children.map((child) => (
            <DirectoryBranch
              key={child.path}
              entry={child}
              depth={depth + 1}
              nodes={nodes}
              expanded={expanded}
              loading={loading}
              selectedPath={selectedPath}
              scopeMembers={scopeMembers}
              onToggle={onToggle}
              onSelect={onSelect}
              onLoadMore={onLoadMore}
            />
          ))}
          {/* Status/placeholder rows sit at the child indent so they read as
              nested under this node rather than flush against the tree's edge. */}
          {isLoading && (
            <p className="py-1 pr-2 text-[10px] text-muted" style={{ paddingInlineStart: `${childIndent}px` }}>
              Loading folders…
            </p>
          )}
          {!isLoading && page && !children.length && !page.hasMore && (
            <p className="py-1 pr-2 text-[10px] text-muted" style={{ paddingInlineStart: `${childIndent}px` }}>
              No child folders.
            </p>
          )}
          {!isLoading && page?.hasMore && (
            <button
              type="button"
              className="mt-1 rounded-ui border border-border bg-surface px-2 py-1 text-[10px] font-semibold text-muted-strong hover:border-accent-line hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-line"
              style={{ marginInlineStart: `${childIndent}px` }}
              onClick={() => onLoadMore?.(entry.path)}
            >
              Scan next directory page
            </button>
          )}
        </div>
      )}
    </div>
  );
}
