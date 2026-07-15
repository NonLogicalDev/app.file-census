import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Columns3,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Film,
  Folder,
  FolderOpen,
  HardDrive,
  Hash,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import {
  buildDirectoryNavigationTree,
  buildWorkspaceFileTreeRows,
  directoryPathAncestors,
  filesInDirectory,
  normalizeDirectoryPath
} from '../directoryTree.js'
import { locations, scanFiles, scans } from '../mockData.js'
import './location.css'

const MODES = ['Files', 'File tree', 'Delete Check']
const COLUMN_OPTIONS = [
  ['name', 'Name'],
  ['path', 'Path'],
  ['size', 'Size'],
  ['modified', 'Modified'],
  ['kind', 'Kind'],
]

const formatBytes = (value) => {
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`
}

const normalizeFile = (item, index) => {
  const path = item.path || item.relativePath || `/NLMedia/${item.name || `file-${index + 1}`}`
  const name = item.name || path.split('/').filter(Boolean).at(-1) || `file-${index + 1}`
  return {
    ...item,
    id: item.id || `${path}-${index}`,
    name,
    path,
    size: item.size ?? item.bytes ?? 0,
    sizeLabel: item.sizeLabel || formatBytes(item.size ?? item.bytes),
    modified: item.modified || item.modifiedAt || item.mtime || '2026-07-11 18:42',
    kind: item.kind || item.type || name.split('.').at(-1)?.toUpperCase() || 'File',
    hashStatus: item.hashStatus === 'verified'
      ? 'Exact hash'
      : item.hashStatus === 'pending'
        ? 'Light hash only'
        : String(item.hashStatus || 'Light hash only'),
  }
}

const fileIcon = (file) => {
  const kind = `${file.kind} ${file.name}`.toLowerCase()
  if (/image|jpg|jpeg|png|tiff|heic|raw/.test(kind)) return FileImage
  if (/video|mov|mp4|mkv|film/.test(kind)) return Film
  if (/audio|wav|mp3|flac|music/.test(kind)) return Music2
  if (/archive|zip|tar|gz|7z/.test(kind)) return FileArchive
  if (/json|xml|code|js|ts|css|html/.test(kind)) return FileCode2
  if (/text|document|pdf|md|txt|doc/.test(kind)) return FileText
  return File
}

const valueForSort = (file, key) => {
  if (key === 'size') return Number(file.size) || 0
  return `${file[key] ?? ''}`.toLocaleLowerCase()
}

function DirectoryNavigationItem({ node, depth = 0, selectedPath, expandedPaths, onSelect, onToggle }) {
  const selected = node.path === selectedPath
  const expanded = expandedPaths.has(node.path)
  const canExpand = node.children.length > 0

  return (
    <div role="treeitem" aria-level={depth + 1} aria-selected={selected} aria-expanded={canExpand ? expanded : undefined}>
      <div className={`loc-tree-item${selected ? ' loc-selected' : ''}`} style={{ '--tree-indent': `${depth * 13}px` }}>
        {canExpand ? (
          <button className="loc-tree-toggle" type="button" onClick={() => onToggle(node.path)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="loc-tree-toggle-spacer" />
        )}
        <button className="loc-tree-label" type="button" onClick={() => onSelect(node.path)}>
          <Folder size={14} strokeWidth={1.7} />
          <span>{node.name}</span>
          <span className="loc-tree-count">{node.fileCount.toLocaleString()}</span>
        </button>
      </div>
      {canExpand && expanded && (
        <div role="group">
          {node.children.map((child) => (
            <DirectoryNavigationItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceFileTree({ rows, selectedFolderPath, selectedFile, onSelectFolder, onToggleFolder, onSelectFile }) {
  return (
    <div className="loc-file-tree-view" role="tree" aria-label="Files in current workspace">
      {rows.map((row) => {
        if (row.kind === 'file') {
          const Icon = fileIcon(row.file)
          const selected = selectedFile?.id === row.file.id
          return (
            <button
              key={`file:${row.file.id}`}
              type="button"
              className={`loc-file-tree-row loc-file-tree-file${selected ? ' loc-selected' : ''}`}
              style={{ '--tree-indent': `${row.depth * 14}px` }}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={selected}
              onClick={() => onSelectFile(row.file)}
            >
              <span className="loc-file-tree-toggle-spacer" aria-hidden="true" />
              <Icon size={15} />
              <span className="loc-file-tree-name">{row.file.name}</span>
              <span className="loc-file-tree-detail">{row.file.sizeLabel}</span>
            </button>
          )
        }

        const { node, depth, expandable, expanded } = row
        const selected = node.path === selectedFolderPath
        return (
          <div
            className={`loc-file-tree-row loc-file-tree-folder${selected ? ' loc-selected' : ''}`}
            style={{ '--tree-indent': `${depth * 14}px` }}
            key={`folder:${node.id}`}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={selected}
            aria-expanded={expandable ? expanded : undefined}
          >
            {expandable ? (
              <button className="loc-file-tree-toggle" type="button" onClick={() => onToggleFolder(node.path)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : <span className="loc-file-tree-toggle-spacer" aria-hidden="true" />}
            {node.path ? <Folder size={15} /> : <FolderOpen size={15} />}
            <button className="loc-file-tree-label" type="button" onClick={() => onSelectFolder(node.path)}>
              <span className="loc-file-tree-name">{node.name}</span>
              <span className="loc-file-tree-detail">{node.fileCount.toLocaleString()} files</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function SortLabel({ column, label, sort, onSort }) {
  const active = sort.key === column
  return (
    <button type="button" className={`loc-sort-label${active ? ' is-active' : ''}`} onClick={() => onSort(column)}>
      <span>{label}</span>
      {active && (sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  )
}

export default function LocationScreen({ commandLocationId, commandScanId, onCommandContextChange }) {
  const [activeLocationId, setActiveLocationId] = useState(commandLocationId || locations[0]?.id || 'nl-media-01')
  const location = locations.find((item) => item.id === activeLocationId) || locations[0] || {}
  const scan = scans.find((item) => item.id === commandScanId && item.locationId === location.id)
    || scans.find((item) => item.locationId === location.id && item.isRepresentative)
    || scans.find((item) => item.locationId === location.id)
    || scans[0]
    || {}
  const normalizedFiles = useMemo(() => (scanFiles[scan.id] || []).map(normalizeFile), [scan.id])
  const directoryTree = useMemo(() => buildDirectoryNavigationTree(normalizedFiles), [normalizedFiles])
  const activeFolderPath = useMemo(() => {
    const firstSegments = normalizeDirectoryPath(normalizedFiles[0]?.path).split('/').filter(Boolean)
    return firstSegments.length > 1 ? firstSegments[0] : ''
  }, [normalizedFiles])
  const [mode, setMode] = useState('Files')
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(() => new Set(COLUMN_OPTIONS.map(([key]) => key)))
  const [selectedFolderPath, setSelectedFolderPath] = useState(activeFolderPath)
  const [navigationExpandedPaths, setNavigationExpandedPaths] = useState(() => new Set(directoryPathAncestors(activeFolderPath)))
  const [workspaceExpandedPaths, setWorkspaceExpandedPaths] = useState(() => new Set(directoryPathAncestors(activeFolderPath)))
  const [selectedFile, setSelectedFile] = useState(normalizedFiles[0] || null)
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1360)
  const inspectorToggleRef = useRef(null)
  const inspectorCloseRef = useRef(null)
  const inspectorWasOpen = useRef(inspectorOpen)
  const [kindFilter, setKindFilter] = useState('any')
  const [sizeFilter, setSizeFilter] = useState('any')
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' })
  const [pathIndex, setPathIndex] = useState(1)
  const [stagedDeleteCheckIds, setStagedDeleteCheckIds] = useState(() => new Set())

  useEffect(() => {
    if (commandLocationId && locations.some((item) => item.id === commandLocationId)) {
      setActiveLocationId(commandLocationId)
    }
  }, [commandLocationId])

  useEffect(() => {
    const firstFolderPath = activeFolderPath
    setSelectedFolderPath(firstFolderPath)
    setNavigationExpandedPaths(new Set(directoryPathAncestors(firstFolderPath)))
    setWorkspaceExpandedPaths(new Set(directoryPathAncestors(firstFolderPath)))
    setSelectedFile(filesInDirectory(normalizedFiles, firstFolderPath)[0] || normalizedFiles[0] || null)
    setStagedDeleteCheckIds(new Set())
    setPathIndex(firstFolderPath ? 1 : 0)
  }, [activeFolderPath, directoryTree, location.id, normalizedFiles])

  const history = selectedFolderPath ? ['Root', `Root/${selectedFolderPath}`] : ['Root']
  const currentPath = history[pathIndex]

  const selectFolder = useCallback((path) => {
    const nextPath = normalizeDirectoryPath(path)
    const firstFile = filesInDirectory(normalizedFiles, nextPath)[0] || normalizedFiles[0] || null
    setSelectedFolderPath(nextPath)
    setPathIndex(nextPath ? 1 : 0)
    setNavigationExpandedPaths((current) => new Set([...current, ...directoryPathAncestors(nextPath)]))
    setWorkspaceExpandedPaths((current) => new Set([...current, ...directoryPathAncestors(nextPath)]))
    setSelectedFile(firstFile)
  }, [normalizedFiles])

  const toggleNavigationFolder = useCallback((path) => {
    const nextPath = normalizeDirectoryPath(path)
    setNavigationExpandedPaths((current) => {
      const next = new Set(current)
      if (next.has(nextPath)) next.delete(nextPath)
      else next.add(nextPath)
      return next
    })
  }, [])

  const toggleWorkspaceFolder = useCallback((path) => {
    const nextPath = normalizeDirectoryPath(path)
    setWorkspaceExpandedPaths((current) => {
      const next = new Set(current)
      if (next.has(nextPath)) next.delete(nextPath)
      else next.add(nextPath)
      return next
    })
  }, [])

  const filteredFiles = useMemo(() => {
    const scopedFiles = pathIndex === 0
      ? normalizedFiles
      : filesInDirectory(normalizedFiles, selectedFolderPath)
    const needle = query.trim().toLocaleLowerCase()
    const queryMatches = needle
      ? scopedFiles.filter((file) => `${file.name} ${file.path} ${file.kind}`.toLocaleLowerCase().includes(needle))
      : scopedFiles
    const result = queryMatches.filter((file) => {
      const kindMatches = kindFilter === 'any' || file.kind === kindFilter
      const size = Number(file.size) || 0
      const sizeMatches = sizeFilter === 'any'
        || (sizeFilter === 'small' && size < 100 * 1024 ** 2)
        || (sizeFilter === 'medium' && size >= 100 * 1024 ** 2 && size < 1024 ** 3)
        || (sizeFilter === 'large' && size >= 1024 ** 3)
      return kindMatches && sizeMatches
    })
    return [...result].sort((left, right) => {
      const a = valueForSort(left, sort.key)
      const b = valueForSort(right, sort.key)
      const comparison = typeof a === 'number' ? a - b : a.localeCompare(b)
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [kindFilter, normalizedFiles, pathIndex, query, selectedFolderPath, sizeFilter, sort])

  const workspaceDirectoryTree = useMemo(() => buildDirectoryNavigationTree(filteredFiles), [filteredFiles])
  const workspaceTreeRows = useMemo(
    () => buildWorkspaceFileTreeRows(workspaceDirectoryTree, filteredFiles, workspaceExpandedPaths),
    [filteredFiles, workspaceDirectoryTree, workspaceExpandedPaths]
  )

  const visibleSelectedFile = selectedFile
    ? filteredFiles.find((file) => file.id === selectedFile.id) || null
    : null
  const showInspector = inspectorOpen && visibleSelectedFile

  useEffect(() => {
    if (visibleSelectedFile) return
    setSelectedFile(filteredFiles[0] || null)
  }, [filteredFiles, visibleSelectedFile])

  const selectFile = (file) => {
    setSelectedFile(file)
    setInspectorOpen(true)
  }

  const toggleInspector = useCallback(() => {
    if (showInspector) {
      setInspectorOpen(false)
      return
    }
    if (!visibleSelectedFile && filteredFiles[0]) setSelectedFile(filteredFiles[0])
    setInspectorOpen(true)
  }, [filteredFiles, showInspector, visibleSelectedFile])

  const closeInspector = useCallback(() => setInspectorOpen(false), [])

  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1359px)').matches
    if (compact && inspectorOpen) inspectorCloseRef.current?.focus()
    if (compact && !inspectorOpen && inspectorWasOpen.current) inspectorToggleRef.current?.focus()
    inspectorWasOpen.current = inspectorOpen

    if (!compact || !inspectorOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeInspector()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeInspector, inspectorOpen])

  const updateSort = (key) => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
  }

  const toggleColumn = (key) => {
    setVisibleColumns((current) => {
      const next = new Set(current)
      if (next.has(key) && next.size > 1) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onPrototypeCommand = useCallback((event) => {
      const command = event.detail || {}
      if (command.type === 'location-mode' && MODES.includes(command.value)) setMode(command.value)
      if (command.type === 'location-inspector') toggleInspector()
      if (command.type === 'location-advanced') setAdvancedOpen(true)
      if (command.type === 'location-columns') setColumnMenuOpen(true)
      if (command.type === 'open-location' && command.locationId) setActiveLocationId(command.locationId)
      if (command.type === 'location-stage-delete-check') {
        const fileId = command.fileId || selectedFile?.id
        if (fileId) setStagedDeleteCheckIds((current) => new Set(current).add(fileId))
        setMode('Delete Check')
      }
    }, [selectedFile?.id, toggleInspector])

  useEffect(() => {
    window.addEventListener('redesign:prototype-command', onPrototypeCommand)
    return () => window.removeEventListener('redesign:prototype-command', onPrototypeCommand)
  }, [onPrototypeCommand])

  useEffect(() => {
    onCommandContextChange?.({
      location,
      scan,
      selectedFile: visibleSelectedFile,
      stagedDeleteCheckIds: [...stagedDeleteCheckIds],
    })
  }, [location, onCommandContextChange, scan, stagedDeleteCheckIds, visibleSelectedFile])

  return (
    <section className="rd-screen rd-location-screen" aria-label="Location scan browser prototype">
      <header className="loc-route-bar">
        <div className="loc-route-identity">
          <HardDrive size={15} />
          <strong>{scan.isRepresentative ? 'Representative scan' : scan.status === 'running' ? 'Live scan' : 'Historical scan'}</strong>
          <span>{scan.status || 'Completed'}</span>
        </div>
        <div className="loc-route-meta">
          <span>{scan.shortName || scan.finishedAt || 'Jul 8, 2026 at 1:16 AM'}</span>
          <span className="loc-route-divider" aria-hidden="true" />
          <span>{scan.fileCount?.toLocaleString?.() || '12,438'} files</span>
          <span>{formatBytes(scan.totalBytes)}</span>
        </div>
      </header>

      <div className="loc-workspace-row">
        <div className="loc-mode-selector" aria-label="Browser mode">
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option ? 'is-active' : ''}
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
            >
              {option === 'Delete Check' && <CheckSquare2 size={13} />}
              {option}
            </button>
          ))}
        </div>

        <form
          className="loc-query"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(draftQuery)
          }}
        >
          <Search size={14} />
          <input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search this scan"
            aria-label="Search this scan"
          />
          {draftQuery && (
            <button type="button" className="loc-query-clear" onClick={() => setDraftQuery('')} aria-label="Clear search input">
              <X size={13} />
            </button>
          )}
          <button type="submit" className="loc-query-submit" aria-label="Run search">
            Search
          </button>
        </form>

        <div className="loc-toolbar-actions">
          <button
            type="button"
            className={`loc-control-button${advancedOpen ? ' is-active' : ''}`}
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            aria-label="Advanced filters"
          >
            <SlidersHorizontal size={14} />
            <span className="loc-control-label">Advanced filters</span>
            <ChevronDown size={13} className={advancedOpen ? 'is-rotated' : ''} />
          </button>
          <div className="loc-column-control">
            <button
              type="button"
              className={`loc-control-button${columnMenuOpen ? ' is-active' : ''}`}
              onClick={() => setColumnMenuOpen((open) => !open)}
              aria-expanded={columnMenuOpen}
              aria-label="Choose visible columns"
            >
              <Columns3 size={14} />
              <span className="loc-control-label">Columns</span>
              <ChevronDown size={13} />
            </button>
            {columnMenuOpen && (
              <div className="loc-column-menu" role="menu" aria-label="Visible columns">
                <div className="loc-menu-heading">Visible columns</div>
                {COLUMN_OPTIONS.map(([key, label]) => (
                  <button key={key} type="button" role="menuitemcheckbox" aria-checked={visibleColumns.has(key)} onClick={() => toggleColumn(key)}>
                    <span className="loc-menu-check">{visibleColumns.has(key) && <Check size={13} />}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            ref={inspectorToggleRef}
            type="button"
            className={`loc-control-button loc-inspector-toggle${showInspector ? ' is-active' : ''}`}
            onClick={toggleInspector}
            disabled={!filteredFiles.length}
            aria-expanded={Boolean(showInspector)}
            aria-controls="loc-file-inspector"
          >
            {showInspector ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            <span className="loc-control-label">Inspector</span>
          </button>
        </div>
      </div>

      {advancedOpen && (
        <div className="loc-advanced-row">
          <span className="loc-advanced-label">Filter</span>
          <label className="loc-filter-select">
            <span className="sr-only">File kind</span>
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              <option value="any">Any kind</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="image">Image</option>
              <option value="archive">Archive</option>
              <option value="database">Database</option>
              <option value="document">Document</option>
              <option value="disk-image">Disk image</option>
            </select>
            <ChevronDown size={12} />
          </label>
          <label className="loc-filter-select">
            <span className="sr-only">File size</span>
            <select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
              <option value="any">Any size</option>
              <option value="small">Under 100 MB</option>
              <option value="medium">100 MB–1 GB</option>
              <option value="large">1 GB and larger</option>
            </select>
            <ChevronDown size={12} />
          </label>
          <span className="loc-advanced-hint">Filters apply locally to this scan.</span>
        </div>
      )}

      <nav className="loc-path-strip" aria-label="Current path">
        <button type="button" disabled={pathIndex === 0} onClick={() => {
          setPathIndex(0)
        }} aria-label="Back">
          <ArrowLeft size={14} />
        </button>
        <button type="button" disabled={pathIndex === history.length - 1} onClick={() => {
          selectFolder(selectedFolderPath)
        }} aria-label="Forward">
          <ArrowRight size={14} />
        </button>
        <span className="loc-path-separator" />
        {currentPath.split('/').filter(Boolean).map((part, index, parts) => (
          <span className="loc-crumb" key={`${part}-${index}`}>
            {index > 0 && <ChevronRight size={12} />}
            <button type="button" onClick={() => {
              if (index === 0) setPathIndex(0)
              else selectFolder(parts.slice(1, index + 1).join('/'))
            }}>{part}</button>
            {index === parts.length - 1 && <span className="loc-path-count">{filteredFiles.length} items</span>}
          </span>
        ))}
        {query && <span className="loc-query-state">Query: “{query}”</span>}
      </nav>

      {mode === 'Delete Check' && (
        <div className="loc-delete-state" role="status">
          <CheckSquare2 size={15} />
          <strong>{stagedDeleteCheckIds.size ? `${stagedDeleteCheckIds.size} staged locally` : '12,438 checked'}</strong>
          <span>{stagedDeleteCheckIds.size ? 'Selected files are ready for verification review' : '12,431 exact-content matches'}</span>
          <span className="loc-delete-warning">{stagedDeleteCheckIds.size ? 'Prototype only' : '7 not covered'}</span>
          <span className="loc-delete-note">Light hashes are only candidates and are never treated as exact-safe.</span>
        </div>
      )}

      <div className={`loc-browser${showInspector ? ' has-inspector' : ''}`}>
        <aside className="loc-context-pane" aria-label="Folder tree">
          <div className="loc-pane-heading">
            <span>Folders</span>
          </div>
          <div className="loc-tree" role="tree">
            <DirectoryNavigationItem
              node={directoryTree}
              selectedPath={pathIndex === 0 ? '' : selectedFolderPath}
              expandedPaths={navigationExpandedPaths}
              onSelect={selectFolder}
              onToggle={toggleNavigationFolder}
            />
          </div>
          <div className="loc-tree-footer">
            <span>{directoryTree.children.length} root folder{directoryTree.children.length === 1 ? '' : 's'} loaded</span>
          </div>
        </aside>

        <main className="loc-results-pane">
          {mode === 'File tree' ? (
            <WorkspaceFileTree
              rows={workspaceTreeRows}
              selectedFolderPath={pathIndex === 0 ? '' : selectedFolderPath}
              selectedFile={selectedFile}
              onSelectFolder={selectFolder}
              onToggleFolder={toggleWorkspaceFolder}
              onSelectFile={selectFile}
            />
          ) : (
            <div className="loc-table-wrap">
              <table className="loc-file-table">
                <thead>
                  <tr>
                    {visibleColumns.has('name') && <th><SortLabel column="name" label="Name" sort={sort} onSort={updateSort} /></th>}
                    {visibleColumns.has('path') && <th><SortLabel column="path" label="Path" sort={sort} onSort={updateSort} /></th>}
                    {visibleColumns.has('size') && <th className="is-number"><SortLabel column="size" label="Size" sort={sort} onSort={updateSort} /></th>}
                    {visibleColumns.has('modified') && <th><SortLabel column="modified" label="Modified" sort={sort} onSort={updateSort} /></th>}
                    {visibleColumns.has('kind') && <th><SortLabel column="kind" label="Kind" sort={sort} onSort={updateSort} /></th>}
                    {mode === 'Delete Check' && <th>Verification</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => {
                    const Icon = fileIcon(file)
                    const selected = selectedFile?.id === file.id
                    return (
                      <tr
                        key={file.id}
                        className={selected ? 'loc-selected' : ''}
                        onClick={() => selectFile(file)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            selectFile(file)
                          }
                        }}
                        role="row"
                        tabIndex={0}
                        aria-selected={selected}
                      >
                        {visibleColumns.has('name') && (
                          <td className="loc-name-cell">
                            <Icon size={14} strokeWidth={1.7} />
                            <span title={file.name}>{file.name}</span>
                          </td>
                        )}
                        {visibleColumns.has('path') && <td className="loc-path-cell" title={file.path}>{file.path}</td>}
                        {visibleColumns.has('size') && <td className="is-number">{file.sizeLabel}</td>}
                        {visibleColumns.has('modified') && <td>{file.modified}</td>}
                        {visibleColumns.has('kind') && <td>{file.kind}</td>}
                        {mode === 'Delete Check' && (
                          <td>
                            <span className={file.hashStatus.toLowerCase().includes('exact') ? 'loc-verification is-exact' : 'loc-verification'}>
                              {file.hashStatus.toLowerCase().includes('exact') ? <Check size={12} /> : <Hash size={12} />}
                              {file.hashStatus}
                            </span>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!filteredFiles.length && (
                <div className="loc-empty-state">
                  <Search size={18} />
                  No files match “{query}”
                </div>
              )}
            </div>
          )}
        </main>

        {showInspector && (
          <>
          <button
            type="button"
            className="loc-inspector-scrim"
            onClick={closeInspector}
            aria-label="Close inspector"
            tabIndex={-1}
          />
          <aside id="loc-file-inspector" className="loc-inspector" aria-label="File inspector">
            <div className="loc-pane-heading">
              <span>Inspector</span>
              <button ref={inspectorCloseRef} type="button" onClick={closeInspector} aria-label="Close inspector"><PanelRightClose size={14} /></button>
            </div>
            <div className="loc-inspector-title">
              {(() => { const Icon = fileIcon(visibleSelectedFile); return <Icon size={18} /> })()}
              <div><strong>{visibleSelectedFile.name}</strong><span>{visibleSelectedFile.kind}</span></div>
            </div>
            <dl>
              <div><dt>Path</dt><dd>{visibleSelectedFile.path}</dd></div>
              <div><dt>Size</dt><dd>{visibleSelectedFile.sizeLabel}</dd></div>
              <div><dt>Modified</dt><dd>{visibleSelectedFile.modified}</dd></div>
              <div><dt>Scan</dt><dd>{location.name ? `${location.name} · ${scan.shortName || scan.name || 'scan'}` : 'NLMedia representative scan'}</dd></div>
            </dl>
            <div className="loc-inspector-section">
              <span>Content verification</span>
              <strong className={visibleSelectedFile.hashStatus.toLowerCase().includes('exact') ? 'is-exact' : ''}>
                {visibleSelectedFile.hashStatus.toLowerCase().includes('exact') ? <Check size={13} /> : <Hash size={13} />}
                {visibleSelectedFile.hashStatus}
              </strong>
              {!visibleSelectedFile.hashStatus.toLowerCase().includes('exact') && <p>Candidate only. Verify full content before deletion.</p>}
            </div>
          </aside>
          </>
        )}
      </div>
    </section>
  )
}
