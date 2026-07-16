import { useMemo, useState } from 'react';

import { Icon } from '../Icon.jsx';
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  cn,
  fieldClassName
} from '../ui/index.jsx';
import {
  chipLabel,
  defaultOperatorForSearchTerm,
  exportSearchFilterState,
  importSearchFilterState,
  operatorsForSearchTerm,
  SEARCH_FILTER_TERMS
} from '../../utils/searchFilters.js';
import {
  addNodeToGroup,
  convertTermToGroup,
  createGroupNode,
  getDisplayNode,
  moveNodeToGroup,
  normalizedRootFilters,
  removeNode,
  setGroupOperator,
  simplifySingleChildGroup,
  toggleNodeExcluded
} from './searchFilterTree.js';

const rootPath = [];
const compactFieldClassName = fieldClassName({ className: 'min-h-8 px-2 py-1 text-sm' });

export default function SearchFilterControls({
  query,
  setQuery,
  filters = [],
  locations = [],
  busy = false,
  placeholder = 'filename or path',
  submitLabel = 'Search',
  helperText = '',
  onSubmit,
  onReplaceFilterState
}) {
  const [clipboardStatus, setClipboardStatus] = useState('');
  // Advanced filters stay collapsed for query-only use and auto-expand when the
  // route already carries structured filters (plan-027 progressive disclosure).
  const [advancedOpen, setAdvancedOpen] = useState(filters.length > 0);
  const [builder, setBuilder] = useState(null);
  const [draftTerm, setDraftTerm] = useState('extension');
  const [draftOperator, setDraftOperator] = useState(defaultOperatorForSearchTerm('extension'));
  const [draftValue, setDraftValue] = useState('');
  const [draftSecondValue, setDraftSecondValue] = useState('');
  const [draftGroupOperator, setDraftGroupOperator] = useState('and');
  const [draggingPath, setDraggingPath] = useState(null);
  const [dropTargetKey, setDropTargetKey] = useState('');

  const locationOptions = useMemo(() => locations || [], [locations]);
  const rootFilters = useMemo(() => normalizedRootFilters(filters), [filters]);
  const draftTermDefinition = SEARCH_FILTER_TERMS.find((term) => term.value === draftTerm) || SEARCH_FILTER_TERMS[0];
  const draftOperators = operatorsForSearchTerm(draftTerm);
  const canMutate = !busy && Boolean(onReplaceFilterState);
  const canAddDraft = draftOperator === 'between'
    ? draftValue.trim() && draftSecondValue.trim()
    : draftValue.trim();
  const builderTargetLabel = builder?.path?.length ? 'selected group' : 'root ALL group';

  function submitSearch(event) {
    event.preventDefault();
    onSubmit?.();
  }

  function replaceFilters(nextFilters) {
    onReplaceFilterState?.(query, nextFilters);
  }

  function mutateFilters(mutator) {
    if (!canMutate) return;
    replaceFilters(mutator(rootFilters));
  }

  function resetDraftValues() {
    setDraftValue('');
    setDraftSecondValue('');
  }

  function openBuilder(mode, path = rootPath) {
    setBuilder({ mode, path });
    setDraftGroupOperator('and');
    resetDraftValues();
  }

  function closeBuilder() {
    setBuilder(null);
    resetDraftValues();
  }

  function addDraftNode(event) {
    event.preventDefault();
    if (!builder || !canAddDraft || !canMutate) return;

    const rule = {
      term: draftTerm,
      operator: draftOperator,
      expression: draftOperator === 'between'
        ? { from: draftValue, to: draftSecondValue }
        : draftValue
    };
    const node = builder.mode === 'group'
      ? createGroupNode(draftGroupOperator, rule)
      : rule;
    if (!node) return;

    replaceFilters(addNodeToGroup(rootFilters, builder.path, node));
    closeBuilder();
  }

  function updateDraftTerm(term) {
    setDraftTerm(term);
    setDraftOperator(defaultOperatorForSearchTerm(term));
    resetDraftValues();
  }

  function updateDraftOperator(operator) {
    setDraftOperator(operator);
    resetDraftValues();
  }

  function clearFilters() {
    if (!canMutate || !rootFilters.length) return;
    closeBuilder();
    replaceFilters([]);
  }

  async function copyFilterJson() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setClipboardStatus('Clipboard unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(exportSearchFilterState(query, rootFilters));
      setClipboardStatus('Copied JSON');
    } catch {
      setClipboardStatus('Copy failed');
    }
  }

  async function pasteFilterJson() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setClipboardStatus('Clipboard unavailable');
      return;
    }
    try {
      const imported = importSearchFilterState(await navigator.clipboard.readText());
      if (!imported) {
        setClipboardStatus('Paste valid filter JSON');
        return;
      }
      closeBuilder();
      onReplaceFilterState?.(imported.query, imported.filters);
      setClipboardStatus('Pasted JSON');
    } catch {
      setClipboardStatus('Paste failed');
    }
  }

  function beginDrag(event, path) {
    const serializedPath = JSON.stringify(path);
    setDraggingPath(path);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-search-filter-path', serializedPath);
    event.dataTransfer.setData('text/plain', serializedPath);
  }

  function endDrag() {
    setDraggingPath(null);
    setDropTargetKey('');
  }

  function clearDropTarget() {
    setDropTargetKey('');
  }

  function allowGroupDrop(event, targetPath) {
    if (!draggingPath || isPathPrefix(draggingPath, targetPath)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetKey(pathKey(targetPath));
  }

  function dropOnGroup(event, targetPath) {
    event.preventDefault();
    const serializedPath = event.dataTransfer.getData('application/x-search-filter-path')
      || event.dataTransfer.getData('text/plain');
    const sourcePath = parsePath(serializedPath) || draggingPath;
    endDrag();
    if (!sourcePath || isPathPrefix(sourcePath, targetPath)) return;
    mutateFilters((current) => moveNodeToGroup(current, sourcePath, targetPath));
  }

  return (
    <section className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <form className="flex min-w-0 flex-1 items-center gap-2.5" onSubmit={submitSearch}>
          <input className={`${fieldClassName()} min-w-0 flex-1`} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={placeholder} />
          <Button type="submit" disabled={busy} icon={<Icon name="search" />}>{submitLabel}</Button>
        </form>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          icon={<Icon name="options" />}
          trailingIcon={<Icon name={advancedOpen ? 'chevronDown' : 'chevronRight'} />}
        >
          Advanced filters{rootFilters.length ? ` (${rootFilters.length})` : ''}
        </Button>
      </div>

      {advancedOpen && (
      <section className="grid gap-2 rounded-panel border border-border bg-surface p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-5 text-text">Filters</h2>
            <div className="text-xs text-muted">Root ALL group</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="secondary" disabled={!canMutate} onClick={() => openBuilder('rule')} icon={<Icon name="add" />}>
              Add rule
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!canMutate} onClick={() => openBuilder('group')} icon={<Icon name="recursive" />}>
              Add group
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!canMutate || !rootFilters.length} onClick={clearFilters} icon={<Icon name="delete" />}>
              Clear Filter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={copyFilterJson} icon={<Icon name="copy" />}>
              Copy JSON
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!onReplaceFilterState} onClick={pasteFilterJson} icon={<Icon name="paste" />}>
              Paste JSON
            </Button>
          </div>
        </div>

        {(clipboardStatus || helperText) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {clipboardStatus && <span>{clipboardStatus}</span>}
            {helperText && <span>{helperText}</span>}
          </div>
        )}

        <RootFilterGroup
          filters={rootFilters}
          isDropTarget={dropTargetKey === pathKey(rootPath)}
          busy={busy}
          canMutate={canMutate}
          onAddRule={() => openBuilder('rule')}
          onAddGroup={() => openBuilder('group')}
          onDragOver={(event) => allowGroupDrop(event, rootPath)}
          onDrop={(event) => dropOnGroup(event, rootPath)}
          onDragLeave={() => setDropTargetKey('')}
        >
          {rootFilters.length ? (
            rootFilters.map((filter, index) => (
              <FilterTreeNode
                key={`${pathKey([index])}:${JSON.stringify(filter)}`}
                node={filter}
                path={[index]}
                busy={busy}
                canMutate={canMutate}
                dropTargetKey={dropTargetKey}
                onAddRule={(path) => openBuilder('rule', path)}
                onAddGroup={(path) => openBuilder('group', path)}
                onBeginDrag={beginDrag}
                onClearDropTarget={clearDropTarget}
                onEndDrag={endDrag}
                onConvertTerm={(path) => mutateFilters((current) => convertTermToGroup(current, path))}
                onDragOverGroup={allowGroupDrop}
                onDropOnGroup={dropOnGroup}
                onRemove={(path) => mutateFilters((current) => removeNode(current, path))}
                onSetGroupOperator={(path, operator) => mutateFilters((current) => setGroupOperator(current, path, operator))}
                onSimplifyGroup={(path) => mutateFilters((current) => simplifySingleChildGroup(current, path))}
                onToggleExcluded={(path) => mutateFilters((current) => toggleNodeExcluded(current, path))}
              />
            ))
          ) : (
            <div className="rounded-ui border border-dashed border-border bg-surface px-2.5 py-2 text-sm text-muted">
              No filters
            </div>
          )}
        </RootFilterGroup>

        {builder && (
          <form className="grid gap-2 rounded-ui border border-accent-line bg-accent-soft/40 p-2" onSubmit={addDraftNode}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-[720px]:grid-cols-1">
              <span className="text-xs font-semibold text-muted">
                {builder.mode === 'group' ? `Group in ${builderTargetLabel}` : `Rule in ${builderTargetLabel}`}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-1.5 max-[720px]:justify-start">
                <Button type="submit" size="sm" disabled={!canMutate || !canAddDraft} icon={<Icon name="add" />}>Add</Button>
                <Button type="button" size="sm" variant="ghost" onClick={closeBuilder}>Cancel</Button>
              </div>
            </div>
            <div className={cn(
              'grid gap-2 max-[900px]:grid-cols-1',
              builder.mode === 'group'
                ? 'grid-cols-[minmax(92px,120px)_minmax(120px,170px)_minmax(120px,170px)_minmax(0,1fr)]'
                : 'grid-cols-[minmax(120px,170px)_minmax(120px,170px)_minmax(0,1fr)]'
            )}>
              {builder.mode === 'group' && (
                <select className={compactFieldClassName} value={draftGroupOperator} onChange={(event) => setDraftGroupOperator(event.currentTarget.value)}>
                  <option value="and">ALL</option>
                  <option value="or">ANY</option>
                </select>
              )}
              <select className={compactFieldClassName} value={draftTerm} onChange={(event) => updateDraftTerm(event.currentTarget.value)}>
                {SEARCH_FILTER_TERMS.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}
              </select>
              <select className={compactFieldClassName} value={draftOperator} onChange={(event) => updateDraftOperator(event.currentTarget.value)}>
                {draftOperators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
              </select>
              <DraftValueField
                draftTerm={draftTerm}
                draftOperator={draftOperator}
                draftTermDefinition={draftTermDefinition}
                draftValue={draftValue}
                draftSecondValue={draftSecondValue}
                locationOptions={locationOptions}
                onDraftValueChange={setDraftValue}
                onDraftSecondValueChange={setDraftSecondValue}
              />
            </div>
          </form>
        )}
      </section>
      )}
    </section>
  );
}

function RootFilterGroup({
  filters,
  isDropTarget,
  busy,
  canMutate,
  children,
  onAddRule,
  onAddGroup,
  onDragOver,
  onDrop,
  onDragLeave
}) {
  return (
    <div
      className={cn(
        'grid gap-1.5 rounded-ui border border-border bg-surface-muted p-2',
        isDropTarget && 'border-accent bg-accent-soft'
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      <div className="grid min-h-9 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <span className="inline-flex h-7 items-center rounded-ui border border-border bg-surface px-2 text-xs font-bold text-muted-strong">
          ALL
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">Root group</div>
          <div className="text-xs text-muted">{filters.length} {filters.length === 1 ? 'node' : 'nodes'}</div>
        </div>
        <Menu>
          <MenuTrigger
            aria-label="Root filter actions"
            className="h-8 w-8 p-0"
            disabled={busy || !canMutate}
            icon={<Icon name="rowActions" />}
            size="sm"
            variant="ghost"
          />
          <MenuContent>
            <MenuLabel>Root actions</MenuLabel>
            <MenuItem icon={<Icon name="add" />} onClick={onAddRule}>Add rule</MenuItem>
            <MenuItem icon={<Icon name="recursive" />} onClick={onAddGroup}>Add group</MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="grid gap-1 border-l border-border pl-3">
        {children}
      </div>
    </div>
  );
}

function FilterTreeNode({
  node,
  path,
  busy,
  canMutate,
  dropTargetKey,
  onAddRule,
  onAddGroup,
  onBeginDrag,
  onClearDropTarget,
  onEndDrag,
  onConvertTerm,
  onDragOverGroup,
  onDropOnGroup,
  onRemove,
  onSetGroupOperator,
  onSimplifyGroup,
  onToggleExcluded
}) {
  const display = getDisplayNode(node);
  if (!display) return null;

  const key = pathKey(path);
  const isDropTarget = dropTargetKey === key;
  const canSimplify = display.isGroup && display.children.length === 1;
  const label = display.isGroup ? groupLabel(display) : chipLabel(display.node);

  return (
    <div
      className={cn(
        'grid gap-1 rounded-ui border border-border bg-surface',
        display.isGroup && 'bg-surface-muted',
        isDropTarget && 'border-accent bg-accent-soft'
      )}
      onDragOver={display.isGroup ? (event) => onDragOverGroup(event, path) : undefined}
      onDrop={display.isGroup ? (event) => onDropOnGroup(event, path) : undefined}
      onDragLeave={display.isGroup ? onClearDropTarget : undefined}
    >
      <div className="grid min-h-9 grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1">
        <span
          aria-label={`Move ${label}`}
          className="inline-flex h-7 w-6 cursor-grab items-center justify-center rounded-ui text-muted hover:bg-surface hover:text-text active:cursor-grabbing"
          draggable={canMutate && !busy}
          role="button"
          tabIndex={-1}
          title="Move"
          onDragEnd={onEndDrag}
          onDragStart={(event) => onBeginDrag(event, path)}
        >
          <Icon name="rowActions" />
        </span>
        <MatchToggle
          excluded={display.excluded}
          disabled={busy || !canMutate}
          onToggle={() => onToggleExcluded(path)}
        />
        <div className="min-w-0">
          {display.isGroup ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <select
                aria-label="Group operator"
                className={fieldClassName({ className: 'h-8 w-[86px] px-2 py-1 text-xs font-bold' })}
                disabled={busy || !canMutate}
                value={display.operator}
                onChange={(event) => onSetGroupOperator(path, event.currentTarget.value)}
              >
                <option value="and">ALL</option>
                <option value="or">ANY</option>
              </select>
              <span className="truncate text-sm font-medium text-text">{label}</span>
              <span className="text-xs text-muted">{display.children.length} {display.children.length === 1 ? 'node' : 'nodes'}</span>
            </div>
          ) : (
            <div className="truncate text-sm font-medium text-text">{label}</div>
          )}
        </div>
        <NodeActionsMenu
          isGroup={display.isGroup}
          canSimplify={canSimplify}
          busy={busy}
          canMutate={canMutate}
          onAddRule={() => onAddRule(path)}
          onAddGroup={() => onAddGroup(path)}
          onConvertTerm={() => onConvertTerm(path)}
          onRemove={() => onRemove(path)}
          onSimplifyGroup={() => onSimplifyGroup(path)}
        />
      </div>
      {display.isGroup && (
        <div className="grid gap-1 border-l border-border pb-1 pl-4 pr-1">
          {display.children.map((child, index) => (
            <FilterTreeNode
              key={`${pathKey([...path, index])}:${JSON.stringify(child)}`}
              node={child}
              path={[...path, index]}
              busy={busy}
              canMutate={canMutate}
              dropTargetKey={dropTargetKey}
              onAddRule={onAddRule}
              onAddGroup={onAddGroup}
              onBeginDrag={onBeginDrag}
              onClearDropTarget={onClearDropTarget}
              onEndDrag={onEndDrag}
              onConvertTerm={onConvertTerm}
              onDragOverGroup={onDragOverGroup}
              onDropOnGroup={onDropOnGroup}
              onRemove={onRemove}
              onSetGroupOperator={onSetGroupOperator}
              onSimplifyGroup={onSimplifyGroup}
              onToggleExcluded={onToggleExcluded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeActionsMenu({
  isGroup,
  canSimplify,
  busy,
  canMutate,
  onAddRule,
  onAddGroup,
  onConvertTerm,
  onRemove,
  onSimplifyGroup
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Filter node actions"
        className="h-8 w-8 p-0"
        disabled={busy || !canMutate}
        icon={<Icon name="rowActions" />}
        size="sm"
        variant="ghost"
      />
      <MenuContent>
        <MenuLabel>{isGroup ? 'Group actions' : 'Rule actions'}</MenuLabel>
        {isGroup ? (
          <>
            <MenuItem icon={<Icon name="add" />} onClick={onAddRule}>Add rule</MenuItem>
            <MenuItem icon={<Icon name="recursive" />} onClick={onAddGroup}>Add group</MenuItem>
            <MenuSeparator />
            <MenuItem disabled={!canSimplify} icon={<Icon name="repair" />} onClick={onSimplifyGroup}>Simplify single-child group</MenuItem>
          </>
        ) : (
          <MenuItem icon={<Icon name="recursive" />} onClick={onConvertTerm}>Convert term to group</MenuItem>
        )}
        <MenuSeparator />
        <MenuItem variant="danger" icon={<Icon name="delete" />} onClick={onRemove}>Remove</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function MatchToggle({ excluded, disabled, onToggle }) {
  return (
    <div className="inline-grid grid-cols-2 rounded-ui border border-border bg-surface p-0.5 text-[11px] font-bold uppercase leading-none text-muted">
      <button
        aria-pressed={!excluded}
        className={cn(
          'h-6 rounded-[5px] px-2',
          !excluded ? 'bg-accent text-white' : 'hover:bg-surface-muted hover:text-text'
        )}
        disabled={disabled || !excluded}
        type="button"
        onClick={onToggle}
      >
        Match
      </button>
      <button
        aria-pressed={excluded}
        className={cn(
          'h-6 rounded-[5px] px-2',
          excluded ? 'bg-danger text-white' : 'hover:bg-surface-muted hover:text-text'
        )}
        disabled={disabled || excluded}
        type="button"
        onClick={onToggle}
      >
        Exclude
      </button>
    </div>
  );
}

function DraftValueField({
  draftTerm,
  draftOperator,
  draftTermDefinition,
  draftValue,
  draftSecondValue,
  locationOptions,
  onDraftValueChange,
  onDraftSecondValueChange
}) {
  const valuePlaceholder = draftTerm === 'extension'
    ? 'jpg'
    : draftTerm === 'location_slug'
      ? 'choose a location'
      : draftTerm === 'kind'
        ? 'file'
        : draftTermDefinition.type === 'date'
          ? 'YYYY-MM-DD'
          : 'text or pattern';

  if (draftTerm === 'location_slug' && (draftOperator === 'equal' || draftOperator === 'not_equal')) {
    return (
      <select className={compactFieldClassName} value={draftValue} onChange={(event) => onDraftValueChange(event.currentTarget.value)}>
        <option value="">Location</option>
        {locationOptions.map((location) => <option key={location.slug} value={location.slug}>{location.name}</option>)}
      </select>
    );
  }

  if (draftTerm === 'kind') {
    return (
      <select className={compactFieldClassName} value={draftValue} onChange={(event) => onDraftValueChange(event.currentTarget.value)}>
        <option value="">Kind</option>
        <option value="file">File</option>
        <option value="dir">Folder</option>
      </select>
    );
  }

  if (draftOperator === 'between') {
    return (
      <div className="grid grid-cols-2 gap-2 max-[720px]:grid-cols-1">
        <input
          className={compactFieldClassName}
          type="date"
          value={draftValue}
          onChange={(event) => onDraftValueChange(event.currentTarget.value)}
          placeholder="from"
        />
        <input
          className={compactFieldClassName}
          type="date"
          value={draftSecondValue}
          onChange={(event) => onDraftSecondValueChange(event.currentTarget.value)}
          placeholder="to"
        />
      </div>
    );
  }

  return (
    <input
      className={compactFieldClassName}
      type={draftTermDefinition.type === 'date' ? 'date' : 'text'}
      value={draftValue}
      onChange={(event) => onDraftValueChange(event.currentTarget.value)}
      placeholder={valuePlaceholder}
    />
  );
}

function groupLabel(display) {
  const operator = display.operator === 'or' ? 'ANY' : 'ALL';
  return `${operator} group`;
}

function pathKey(path) {
  return path.length ? path.join('.') : 'root';
}

function parsePath(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(Number.isInteger) ? parsed : null;
  } catch {
    return null;
  }
}

function isPathPrefix(prefix, path) {
  return prefix.length <= path.length && prefix.every((part, index) => part === path[index]);
}
