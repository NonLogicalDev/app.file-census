import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { ConfirmModal, Modal } from './Modal.jsx';
import {
  actionToolbarClassName,
  Button,
  emptyTextClassName,
  exifGridClassName,
  exifPanelClassName,
  exifStatusClassName,
  fieldClassName,
  fieldLabelClassName,
  filePreviewImageClassName,
  filePreviewPanelClassName,
  filePreviewTextClassName,
  formStackClassName,
  metadataGridClassName,
  metadataItemClassName,
  metadataLabelClassName,
  metadataValueClassName,
  ModalHelp,
  ModalSurface,
  occurrenceCardClassName,
  occurrenceHeaderClassName,
  occurrenceHeaderMetaClassName,
  occurrenceListClassName,
  occurrenceLocationNameClassName,
  occurrencePathRowClassName,
  occurrencePathTextClassName,
  panelTitleClassName,
  panelTitleSubtextClassName,
  panelTitleTextClassName,
  pathInputRowClassName,
  selectClassName,
  SegmentedTab,
  SegmentedTabs,
  textAreaClassName,
  Toolbar
} from './ui/index.jsx';
import { bytes, statusLabel, when } from '../utils/format.js';
import { deriveLocationFields } from '../utils/locationDefaults.js';

export default function AppModals(props) {
  return (
    <>
      {props.showAddLocation && <LocationForm title="Add location" form={props.form} setForm={props.setForm} busy={props.busy} onSubmit={props.onAddLocation} onCancel={() => props.setShowAddLocation(false)} submitLabel="Add location" canChooseNativeFolder={props.canChooseNativeFolder} onChooseLocationFolder={props.onChooseLocationFolder} />}
      {props.showEditLocation && <LocationForm title="Edit location" form={props.editForm} setForm={props.setEditForm} busy={props.busy} onSubmit={props.onUpdateLocation} onCancel={() => props.setShowEditLocation(false)} submitLabel="Save location" slugDisabled canChooseNativeFolder={props.canChooseNativeFolder} onChooseLocationFolder={props.onChooseLocationFolder} />}
      {props.showScanNotes && (
        <Modal onClose={() => props.setShowScanNotes(false)}>
          <ModalSurface as="form" className={formStackClassName} onSubmit={(event) => { event.preventDefault(); props.onUpdateScanNotes(); }}>
            <h2>Scan notes</h2>
            <label className={fieldLabelClassName}>Notes<textarea className={textAreaClassName()} value={props.scanNotesForm.notes} onChange={(event) => props.setScanNotesForm({ ...props.scanNotesForm, notes: event.currentTarget.value })} placeholder="What makes this scan useful, suspicious, or representative?" /></label>
            <Toolbar className={actionToolbarClassName}>
              <Button type="submit" disabled={props.busy} icon={<Icon name="save" />}>Save notes</Button>
              <Button type="button" variant="secondary" onClick={() => props.setShowScanNotes(false)} icon={<Icon name="back" />}>Cancel</Button>
            </Toolbar>
          </ModalSurface>
        </Modal>
      )}
      {props.showScanExcludes && (
        <Modal onClose={() => props.setShowScanExcludes(false)}>
          <ModalSurface as="form" className={formStackClassName} onSubmit={(event) => { event.preventDefault(); props.onUpdateScanExcludes(); }}>
            <h2>Scan excludes</h2>
            <label className={fieldLabelClassName}>Gitignore-style patterns
              <textarea
                className={textAreaClassName()}
                value={props.scanExcludesForm.patterns}
                onChange={(event) => props.setScanExcludesForm({ ...props.scanExcludesForm, patterns: event.currentTarget.value })}
                placeholder={'*.tmp\ncache/\n/Photos/private/'}
              />
            </label>
            <ModalHelp>One pattern per line. Saving applies persistent visibility filters to this scan; matching indexed rows and source files stay unchanged.</ModalHelp>
            <Toolbar className={actionToolbarClassName}>
              <Button type="submit" disabled={props.busy} icon={<Icon name="save" />}>Save excludes</Button>
              <Button type="button" variant="secondary" onClick={() => props.setShowScanExcludes(false)} icon={<Icon name="back" />}>Cancel</Button>
            </Toolbar>
          </ModalSurface>
        </Modal>
      )}
      {props.scanStartForm && (
        <Modal onClose={() => props.setScanStartForm(null)}>
          <ModalSurface as="form" className={formStackClassName} onSubmit={(event) => { event.preventDefault(); props.onConfirmScanStart(); }}>
            <h2>Start scan</h2>
            <label className={fieldLabelClassName}>Subfolder to scan
              <input
                className="h-9 rounded-ui border border-border bg-surface px-3 text-sm text-text outline-none focus:border-border-strong"
                value={props.scanStartForm.offset}
                onChange={(event) => props.setScanStartForm({ ...props.scanStartForm, offset: event.currentTarget.value })}
                placeholder="/"
              />
            </label>
            <ModalHelp>Scans the whole location by default. Enter a subfolder (relative to the location root) to scan only part of it.</ModalHelp>
            <fieldset className="grid gap-2 rounded-ui border border-border bg-surface p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Hash work</legend>
              {[
                ['full', 'Full', 'Exact BLAKE3 + SHA-256, plus the light fingerprint. Required for exact duplicate detection and Delete Check.'],
                ['light', 'Light', 'Sampled fingerprint only — fast on slow or power-limited disks. Inventory-only: light scans are excluded from exact duplicate detection and Delete Check safety.']
              ].map(([value, label, detail]) => (
                <label key={value} className={`flex cursor-pointer items-start gap-2.5 rounded-ui border p-2.5 text-sm ${props.scanStartForm.hash_policy === value ? 'border-border-strong bg-surface-muted' : 'border-border'}`}>
                  <input
                    type="radio"
                    name="scan-hash-policy"
                    className="mt-0.5"
                    checked={props.scanStartForm.hash_policy === value}
                    onChange={() => props.setScanStartForm({ ...props.scanStartForm, hash_policy: value })}
                  />
                  <span className="min-w-0">
                    <strong className="block text-text">{label}</strong>
                    <span className="text-xs text-muted">{detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Toolbar className={actionToolbarClassName}>
              <Button type="submit" disabled={props.busy} icon={<Icon name="scan" />}>Start scan</Button>
              <Button type="button" variant="secondary" onClick={() => props.setScanStartForm(null)} icon={<Icon name="back" />}>Cancel</Button>
            </Toolbar>
          </ModalSurface>
        </Modal>
      )}
      {props.confirmDeleteScanId && (
        <ConfirmModal
          title="Delete scan"
          body="This removes the selected scan and all indexed file rows collected during it. The source files on disk are not touched."
          confirmLabel="Delete scan"
          onConfirm={() => props.onDeleteScan(props.confirmDeleteScanId)}
          onCancel={() => props.setConfirmDeleteScanId(null)}
          busy={props.busy}
        />
      )}
      {props.confirmDeletePath && (
        <ConfirmModal
          title={`Remove ${props.confirmDeletePath.kind === 'dir' ? 'folder' : 'file'} from scan`}
          body={`This removes indexed rows for ${props.confirmDeletePath.path} from this scan only. The source files on disk are not touched. A later update scan can repopulate ${props.confirmDeletePath.kind === 'dir' ? 'this folder' : 'this file'}.`}
          confirmLabel="Remove from scan"
          onConfirm={() => props.onDeleteScanPath(props.confirmDeletePath)}
          onCancel={() => props.setConfirmDeletePath(null)}
          busy={props.busy}
        />
      )}
      {props.confirmClearDeleteCheck && (
        <ConfirmModal
          title="Clear Delete Check set"
          body={`This removes all ${props.deleteCheckSetSize || ''} staged ${props.deleteCheckSetSize === 1 ? 'path' : 'paths'} from the Delete Check set for this scan. Nothing on disk is touched.`}
          confirmLabel="Clear set"
          onConfirm={() => {
            props.onClearDeleteCheck();
            props.setConfirmClearDeleteCheck(false);
          }}
          onCancel={() => props.setConfirmClearDeleteCheck(false)}
          busy={props.busy}
        />
      )}
      {props.confirmDeleteLocationSlug && (
        <ConfirmModal
          title="Delete location"
          body="This removes the location, every scan under it, and all indexed file rows for those scans. The source folder and files on disk are not touched."
          confirmLabel="Delete location"
          onConfirm={() => props.onDeleteLocation(props.confirmDeleteLocationSlug)}
          onCancel={() => props.setConfirmDeleteLocationSlug(null)}
          busy={props.busy}
        />
      )}
      {props.showBuildThumbnails && props.buildThumbnailRequest && <BuildThumbnailsModal {...props} />}
      {props.showFileInfo && !props.fileInfo && (
        <Modal onClose={() => props.setShowFileInfo(false)}>
          <ModalSurface className="gap-3">
            <h2>File info</h2>
            <p className="flex items-center gap-2 text-muted-strong leading-[1.45]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-border-strong" aria-hidden="true" />
              Loading file details… (Esc to cancel)
            </p>
          </ModalSurface>
        </Modal>
      )}
      {props.showFileInfo && props.fileInfo && <FileInfoModal {...props} />}
    </>
  );
}

function BuildThumbnailsModal(props) {
  const request = props.buildThumbnailRequest;
  const pathLabel = request.label || request.path || 'root';
  const isSelection = Boolean(request.paths?.length);
  return (
    <Modal onClose={() => props.setShowBuildThumbnails(false)}>
      <ModalSurface className="gap-3">
        <h2>Build thumbnails</h2>
        <p className="text-muted-strong leading-[1.45]">Build missing cached thumbnails for image files in <strong>{pathLabel}</strong>. Existing cached thumbnails are reused.</p>
        <Toolbar className={actionToolbarClassName}>
          <Button type="button" onClick={() => props.onBuildThumbnails(false)} disabled={props.busy} icon={<Icon name="currentFolder" />}>{isSelection ? 'Selected only' : 'Current folder'}</Button>
          <Button type="button" onClick={() => props.onBuildThumbnails(true)} disabled={props.busy} icon={<Icon name="recursive" />}>Recursive</Button>
          <Button type="button" variant="secondary" onClick={() => props.setShowBuildThumbnails(false)} disabled={props.busy} icon={<Icon name="close" />}>Cancel</Button>
        </Toolbar>
      </ModalSurface>
    </Modal>
  );
}

function LocationForm({ title, form, setForm, busy, onSubmit, onCancel, submitLabel, slugDisabled = false, canChooseNativeFolder = false, onChooseLocationFolder }) {
  const [autoFields, setAutoFields] = useState(() => ({
    name: !form.name,
    slug: !slugDisabled && !form.slug
  }));
  const update = (field, value) => {
    if (['kind', 'name', 'slug', 'root_path'].includes(field)) {
      const next = deriveLocationFields(form, { [field]: value }, autoFields, { slugDisabled });
      setAutoFields(next.auto);
      setForm(next.form);
      return;
    }
    setForm({ ...form, [field]: value });
  };
  const pickFolder = async () => {
    const path = await onChooseLocationFolder?.(form.root_path);
    if (path) update('root_path', path);
  };
  return (
    <Modal onClose={onCancel}>
      <ModalSurface as="form" className={formStackClassName} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <h2>{title}</h2>
        {slugDisabled && <label className={fieldLabelClassName}>Slug<input className={fieldClassName()} value={form.slug} disabled /></label>}
        <label className={fieldLabelClassName}>Type<select className={selectClassName()} value={form.kind} onChange={(event) => update('kind', event.currentTarget.value)}><option value="local">Local</option><option value="disk">Disk</option><option value="nas">NAS</option></select></label>
        <label className={fieldLabelClassName}>Name<input className={fieldClassName()} value={form.name} onChange={(event) => update('name', event.currentTarget.value)} required /></label>
        {!slugDisabled && <label className={fieldLabelClassName}>Slug<input className={fieldClassName()} value={form.slug} onChange={(event) => update('slug', event.currentTarget.value)} required /></label>}
        <label className={fieldLabelClassName}>Root path
          <div className={pathInputRowClassName}>
            <input className={fieldClassName()} value={form.root_path} onChange={(event) => update('root_path', event.currentTarget.value)} required placeholder="/Volumes/Archive" />
            {canChooseNativeFolder && <Button type="button" variant="secondary" onClick={pickFolder} disabled={busy} icon={<Icon name="folder" />}>Browse</Button>}
          </div>
        </label>
        <label className={fieldLabelClassName}>Notes<textarea className={textAreaClassName()} value={form.notes} onChange={(event) => update('notes', event.currentTarget.value)} /></label>
        <Toolbar className={actionToolbarClassName}>
          <Button type="submit" disabled={busy} icon={<Icon name="save" />}>{submitLabel}</Button>
          <Button type="button" variant="secondary" onClick={onCancel} icon={<Icon name="back" />}>Cancel</Button>
        </Toolbar>
      </ModalSurface>
    </Modal>
  );
}

// Groups a flat occurrence page by location -> scan for the Locations tab.
// Occurrences share the content hash by definition, so per-row hash/size
// repetition is dropped; each scan header notes whether it is the location's
// representative (effective) scan.
function groupOccurrences(occurrences = []) {
  const locations = new Map();
  for (const occurrence of occurrences) {
    const locationKey = occurrence.location_slug || occurrence.location_name || '?';
    if (!locations.has(locationKey)) {
      locations.set(locationKey, {
        slug: occurrence.location_slug,
        name: occurrence.location_name,
        total: 0,
        scans: new Map()
      });
    }
    const location = locations.get(locationKey);
    location.total += 1;
    if (!location.scans.has(occurrence.scan_id)) {
      location.scans.set(occurrence.scan_id, {
        scan_id: occurrence.scan_id,
        started_at: occurrence.scan_started_at,
        status: occurrence.scan_status,
        representative: Boolean(occurrence.representative),
        occurrences: []
      });
    }
    location.scans.get(occurrence.scan_id).occurrences.push(occurrence);
  }
  return [...locations.values()].map((location) => ({
    ...location,
    scans: [...location.scans.values()]
  }));
}

// Toggle a key's membership in a Set (immutable — returns a new Set).
function toggleKey(keys, key) {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function FileInfoModal(props) {
  const { fileInfo, busy } = props;
  const [tab, setTab] = useState('preview');
  // Locations tab: both grouping levels are collapsible — per-location cards
  // and each scan group inside them. Expanded by default; collapse on demand.
  const [collapsedLocations, setCollapsedLocations] = useState(() => new Set());
  const [collapsedScans, setCollapsedScans] = useState(() => new Set());
  const thumbnail = fileInfo.thumbnail;
  const exif = fileInfo.exif || { status: 'unavailable', fields: [] };
  const occurrenceCount = fileInfo.occurrence_count ?? fileInfo.occurrences.length;
  const visibleOccurrenceCount = fileInfo.occurrences.length;
  const hasMoreOccurrences = fileInfo.occurrence_next_offset != null && visibleOccurrenceCount < occurrenceCount;
  return (
    <Modal onClose={() => props.setShowFileInfo(false)}>
      <ModalSurface size="wide">
        <div className={panelTitleClassName}>
          <div className={panelTitleTextClassName}>
            <h2>File info</h2>
            <p className={panelTitleSubtextClassName}>{occurrenceCount} known {occurrenceCount === 1 ? 'copy' : 'copies'}</p>
          </div>
          <Toolbar className={actionToolbarClassName}>
            <Button type="button" variant="secondary" onClick={() => props.onRevealFileInScan?.(fileInfo.file)} disabled={busy} icon={<Icon name="revealFile" />}>Reveal File</Button>
            <Button type="button" variant="secondary" onClick={() => props.setShowFileInfo(false)} icon={<Icon name="close" />}>Close</Button>
          </Toolbar>
        </div>

        <SegmentedTabs role="tablist" aria-label="File details sections">
          {[
            ['preview', 'Preview'],
            ['metadata', 'Metadata'],
            ['exif', 'EXIF'],
            ['locations', 'Locations']
          ].map(([id, label]) => (
            <SegmentedTab
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              active={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </SegmentedTab>
          ))}
        </SegmentedTabs>

        <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'preview' && (
          <section className={filePreviewPanelClassName}>
            {thumbnail ? (
              <>
                <img className={filePreviewImageClassName} src={thumbnail.data_url} alt={fileInfo.file.name} />
                <p className={filePreviewTextClassName}>{thumbnail.width} x {thumbnail.height} - {thumbnail.cached ? 'cached thumbnail' : 'new thumbnail'}</p>
              </>
            ) : (
              <p className={filePreviewTextClassName}>No thumbnail is available. The file may be offline or not a supported image type.</p>
            )}
          </section>
        )}

        {tab === 'metadata' && (
          <section className={metadataGridClassName()}>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>Name</span><strong className={metadataValueClassName}>{fileInfo.file.name}</strong></div>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>Size</span><strong className={metadataValueClassName}>{bytes(fileInfo.file.size)}</strong></div>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>BLAKE3</span><code className={metadataValueClassName}>{fileInfo.file.blake3}</code></div>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>SHA-256</span><code className={metadataValueClassName}>{fileInfo.file.sha256}</code></div>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>CTime</span><strong className={metadataValueClassName}>{when(fileInfo.file.ctime)}</strong></div>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>Modified</span><strong className={metadataValueClassName}>{when(fileInfo.file.mtime)}</strong></div>
            <div className={metadataItemClassName()}><span className={metadataLabelClassName}>Mode</span><strong className={metadataValueClassName}>{fileInfo.file.mode || ''}</strong></div>
          </section>
        )}

        {tab === 'exif' && (
          <section className={exifPanelClassName}>
            <div className={exifStatusClassName}><strong>{exif.status}</strong>{exif.source_path && <code>{exif.source_path}</code>}</div>
            {exif.error && <p className={emptyTextClassName}>{exif.error}</p>}
            {exif.fields.length > 0 && (
              <div className={exifGridClassName}>
                {exif.fields.map((field) => (
                  <div key={`${field.group}-${field.tag}`}>
                    <span>{field.group}</span>
                    <strong>{field.tag}</strong>
                    <code>{field.value}</code>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'locations' && (
          <section className="grid gap-2.5">
            <div className="flex items-center justify-between gap-3 rounded-panel border border-border bg-surface-muted px-3 py-2 max-[720px]:items-stretch max-[720px]:flex-col">
              <div className="flex items-center gap-3">
                <SegmentedTabs role="tablist" aria-label="Occurrence scope">
                  <SegmentedTab type="button" role="tab" active={!props.fileOccAllScans} aria-selected={!props.fileOccAllScans} onClick={() => props.onSetFileOccurrenceScope?.(false)}>
                    Representative
                  </SegmentedTab>
                  <SegmentedTab type="button" role="tab" active={Boolean(props.fileOccAllScans)} aria-selected={Boolean(props.fileOccAllScans)} onClick={() => props.onSetFileOccurrenceScope?.(true)}>
                    All scans
                  </SegmentedTab>
                </SegmentedTabs>
                <p className="m-0 text-sm text-muted">
                  Showing <strong className="text-ink">{visibleOccurrenceCount}</strong> of <strong className="text-ink">{occurrenceCount}</strong>
                  {props.fileOccAllScans ? ' occurrences across all scans.' : ' occurrences in representative scans.'}
                  {fileInfo.occurrences_truncated && ' Loads in pages.'}
                </p>
              </div>
              {hasMoreOccurrences && (
                <Button type="button" variant="secondary" onClick={props.onLoadMoreFileOccurrences} disabled={busy}>
                  Load more
                </Button>
              )}
            </div>
            <div className={occurrenceListClassName}>
              {groupOccurrences(fileInfo.occurrences).map((location) => {
                const locationCollapsed = collapsedLocations.has(location.slug);
                return (
                  <article className={occurrenceCardClassName} key={location.slug}>
                    <button
                      type="button"
                      className={`${occurrenceHeaderClassName} w-full cursor-pointer border-0 bg-transparent text-left`}
                      aria-expanded={!locationCollapsed}
                      onClick={() => setCollapsedLocations((keys) => toggleKey(keys, location.slug))}
                    >
                      <strong className="inline-flex items-center gap-1.5">
                        <Icon name={locationCollapsed ? 'chevronRight' : 'chevronDown'} className="h-3.5 w-3.5 text-muted" />
                        {location.slug} <span className={occurrenceLocationNameClassName}>{location.name}</span>
                      </strong>
                      <span className={occurrenceHeaderMetaClassName}>
                        {location.total} {location.total === 1 ? 'copy' : 'copies'} · {location.scans.length} {location.scans.length === 1 ? 'scan' : 'scans'}
                      </span>
                    </button>
                    {!locationCollapsed && location.scans.map((scan) => {
                      const scanKey = `${location.slug}:${scan.scan_id}`;
                      const scanCollapsed = collapsedScans.has(scanKey);
                      return (
                        <div key={scan.scan_id} className="mt-2 first:mt-0">
                          <button
                            type="button"
                            className="mb-1 flex w-full cursor-pointer flex-wrap items-center gap-2 border-0 bg-transparent p-0 text-left text-[11px] text-muted transition-colors hover:text-text"
                            aria-expanded={!scanCollapsed}
                            onClick={() => setCollapsedScans((keys) => toggleKey(keys, scanKey))}
                          >
                            <Icon name={scanCollapsed ? 'chevronRight' : 'chevronDown'} className="h-3 w-3" />
                            <Icon name="scan" className="h-3.5 w-3.5" />
                            <span>{when(scan.started_at)}</span>
                            <span>· {statusLabel(scan.status)}</span>
                            {scan.representative && (
                              <span className="rounded-full border border-accent-line px-1.5 text-[10px] font-semibold text-accent">representative</span>
                            )}
                            <code className="text-[10px] text-text-tertiary">{scan.scan_id.slice(0, 8)}</code>
                            <span className="ml-auto text-[10px] text-text-tertiary">
                              {scan.occurrences.length} {scan.occurrences.length === 1 ? 'path' : 'paths'}
                            </span>
                          </button>
                          {!scanCollapsed && scan.occurrences.map((occurrence) => (
                            <div className={occurrencePathRowClassName} key={occurrence.path}>
                              <code className={occurrencePathTextClassName}>{occurrence.path}</code>
                              <span className="whitespace-nowrap text-[11px] text-text-tertiary">{when(occurrence.mtime)}</span>
                              <Toolbar className={actionToolbarClassName}>
                                <Button type="button" variant="secondary" onClick={() => props.onOpenOccurrence(occurrence)} disabled={busy} icon={<Icon name="openFile" />}>Open</Button>
                                <Button type="button" variant="secondary" onClick={() => props.onRevealOccurrence(occurrence)} disabled={busy} icon={<Icon name="revealFile" />}>Reveal</Button>
                              </Toolbar>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </article>
                );
              })}
            </div>
          </section>
        )}
        </div>
      </ModalSurface>
    </Modal>
  );
}
