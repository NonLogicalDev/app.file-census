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
        <Modal>
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
        <Modal>
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
      {props.showFileInfo && props.fileInfo && <FileInfoModal {...props} />}
    </>
  );
}

function BuildThumbnailsModal(props) {
  const request = props.buildThumbnailRequest;
  const pathLabel = request.label || request.path || 'root';
  const isSelection = Boolean(request.paths?.length);
  return (
    <Modal>
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
    <Modal>
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

function FileInfoModal(props) {
  const { fileInfo, busy } = props;
  const [tab, setTab] = useState('preview');
  const thumbnail = fileInfo.thumbnail;
  const exif = fileInfo.exif || { status: 'unavailable', fields: [] };
  const occurrenceCount = fileInfo.occurrence_count ?? fileInfo.occurrences.length;
  const visibleOccurrenceCount = fileInfo.occurrences.length;
  const hasMoreOccurrences = fileInfo.occurrence_next_offset != null && visibleOccurrenceCount < occurrenceCount;
  return (
    <Modal>
      <ModalSurface size="wide">
        <div className={panelTitleClassName}>
          <div className={panelTitleTextClassName}>
            <h2>File info</h2>
            <p className={panelTitleSubtextClassName}>{occurrenceCount} known {occurrenceCount === 1 ? 'copy' : 'copies'}</p>
          </div>
          <Toolbar className={actionToolbarClassName}>
            <Button type="button" variant="secondary" onClick={() => props.onRevealFileInScan?.(fileInfo.file)} disabled={busy} icon={<Icon name="revealFile" />}>Reveal in scan</Button>
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
              <p className="m-0 text-sm text-muted">
                Showing <strong className="text-ink">{visibleOccurrenceCount}</strong> of <strong className="text-ink">{occurrenceCount}</strong> occurrences.
                {fileInfo.occurrences_truncated && ' This content appears many times, so occurrences load in pages.'}
              </p>
              {hasMoreOccurrences && (
                <Button type="button" variant="secondary" onClick={props.onLoadMoreFileOccurrences} disabled={busy}>
                  Load more
                </Button>
              )}
            </div>
            <div className={occurrenceListClassName}>
              {fileInfo.occurrences.map((occurrence) => (
                <article className={occurrenceCardClassName} key={`${occurrence.scan_id}-${occurrence.path}`}>
                  <div className={occurrenceHeaderClassName}>
                    <strong>{occurrence.location_slug} <span className={occurrenceLocationNameClassName}>{occurrence.location_name}</span></strong>
                    <span className={occurrenceHeaderMetaClassName}>{statusLabel(occurrence.scan_status)} - {when(occurrence.scan_started_at)}</span>
                  </div>
                  <div className={occurrencePathRowClassName}>
                    <code className={occurrencePathTextClassName}>{occurrence.path}</code>
                    <Toolbar className={actionToolbarClassName}>
                      <Button type="button" variant="secondary" onClick={() => props.onOpenOccurrence(occurrence)} disabled={busy} icon={<Icon name="openFile" />}>Open File</Button>
                      <Button type="button" variant="secondary" onClick={() => props.onRevealOccurrence(occurrence)} disabled={busy} icon={<Icon name="revealFile" />}>Reveal File</Button>
                    </Toolbar>
                  </div>
                  <div className={metadataGridClassName({ compact: true })}>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>Scan</span><code className={metadataValueClassName}>{occurrence.scan_id}</code></div>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>Size</span><strong className={metadataValueClassName}>{bytes(occurrence.size)}</strong></div>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>CTime</span><strong className={metadataValueClassName}>{when(occurrence.ctime)}</strong></div>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>Modified</span><strong className={metadataValueClassName}>{when(occurrence.mtime)}</strong></div>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>Mode</span><strong className={metadataValueClassName}>{occurrence.mode || ''}</strong></div>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>BLAKE3</span><code className={metadataValueClassName}>{occurrence.blake3}</code></div>
                    <div className={metadataItemClassName({ compact: true })}><span className={metadataLabelClassName}>SHA-256</span><code className={metadataValueClassName}>{occurrence.sha256}</code></div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </ModalSurface>
    </Modal>
  );
}
