import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { bytes } from '../utils/format.js';

// App-level right-rail Inspector (docked beside the workspace like the left
// sidebar). Shows the clicked row's context plus lazy collapsible Preview and
// EXIF sections backed by the cheap files.preview RPC.
export default function InspectorPanel({
  inspected,
  activeScan,
  onClose,
  onInspectFile,
  onLoadFilePreview
}) {
  // Preview/EXIF disclosure sections, persisted. Data loads lazily: only
  // while a section is expanded, and only for fully hashed file rows
  // (files.preview is cheap — cached thumbnail/EXIF first, no occurrence
  // sweep — but zero fetches is still cheaper).
  const [previewOpen, setPreviewOpen] = useState(
    () => globalThis.localStorage?.getItem('locations-inspector-preview-open') === '1'
  );
  const [exifOpen, setExifOpen] = useState(
    () => globalThis.localStorage?.getItem('locations-inspector-exif-open') === '1'
  );
  useEffect(() => {
    globalThis.localStorage?.setItem('locations-inspector-preview-open', previewOpen ? '1' : '0');
  }, [previewOpen]);
  useEffect(() => {
    globalThis.localStorage?.setItem('locations-inspector-exif-open', exifOpen ? '1' : '0');
  }, [exifOpen]);
  const [inspectedPreview, setInspectedPreview] = useState(null);
  const previewKey = inspected && inspected.kind === 'file' && inspected.blake3
    ? `${inspected.scan_id || ''}:${inspected.path}:${inspected.blake3}`
    : null;
  const inspectedPreviewKeyRef = useRef(null);
  useEffect(() => {
    if ((!previewOpen && !exifOpen) || !previewKey) return undefined;
    if (typeof onLoadFilePreview !== 'function') return undefined;
    if (inspectedPreviewKeyRef.current === previewKey) return undefined;
    inspectedPreviewKeyRef.current = previewKey;
    let stale = false;
    setInspectedPreview({ key: previewKey, loading: true });
    onLoadFilePreview(inspected)
      .then((data) => {
        if (stale) return;
        setInspectedPreview({
          key: previewKey,
          loading: false,
          thumbnail: data?.thumbnail || null,
          exif: data?.exif || null
        });
      })
      .catch((error) => {
        if (stale) return;
        // Allow a retry on the next expand/selection instead of pinning the error.
        inspectedPreviewKeyRef.current = null;
        setInspectedPreview({ key: previewKey, loading: false, error: error.message });
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inspected is keyed by previewKey
  }, [previewOpen, exifOpen, previewKey, onLoadFilePreview]);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col" aria-label="File inspector">
      <div className="flex h-8 flex-none items-center justify-between border-b border-sidebar-border px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        <span>Inspector</span>
        <button
          type="button"
          onClick={onClose}
          className="grid h-5 w-5 place-items-center rounded text-text-tertiary transition-colors hover:text-text"
          aria-label="Close inspector"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      {inspected ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-3 flex items-start gap-2">
            <Icon name="file" className="mt-0.5 h-[18px] w-[18px] flex-none text-text-tertiary" />
            <div className="min-w-0">
              <strong className="block truncate text-[12px] font-medium text-text">{inspected.name}</strong>
              <span className="text-[11px] text-text-tertiary">{inspected.file_kind || 'File'}</span>
            </div>
          </div>
          <dl className="grid gap-2.5 text-[11px]">
            <InspectorField label="Path" value={inspected.path} />
            <InspectorField label="Size" value={bytes(inspected.size)} />
            <InspectorField label="Modified" value={formatInspectorDate(inspected.mtime)} />
            {activeScan && <InspectorField label="Scan" value={activeScan.nickname || activeScan.id} />}
          </dl>
          <InspectorSection
            label="Preview"
            open={previewOpen}
            onToggle={() => setPreviewOpen((open) => !open)}
          >
            {!previewKey ? (
              <p className="m-0 text-[11px] text-text-tertiary">
                Preview needs a fully hashed file row.
              </p>
            ) : !inspectedPreview || inspectedPreview.key !== previewKey || inspectedPreview.loading ? (
              <p className="m-0 text-[11px] text-text-tertiary">Loading preview…</p>
            ) : inspectedPreview.error ? (
              <p className="m-0 text-[11px] text-warning">{inspectedPreview.error}</p>
            ) : inspectedPreview.thumbnail ? (
              <>
                <img
                  src={inspectedPreview.thumbnail.data_url}
                  alt={inspected.name}
                  className="max-h-48 w-full rounded-ui border border-border object-contain"
                />
                <p className="mb-0 mt-1 text-[10px] text-text-tertiary">
                  {inspectedPreview.thumbnail.width} × {inspectedPreview.thumbnail.height}
                  {inspectedPreview.thumbnail.cached ? ' · cached' : ' · freshly built'}
                </p>
              </>
            ) : (
              <p className="m-0 text-[11px] text-text-tertiary">
                No thumbnail — not a supported image, or the file is offline.
              </p>
            )}
          </InspectorSection>
          <InspectorSection
            label="EXIF"
            open={exifOpen}
            onToggle={() => setExifOpen((open) => !open)}
          >
            {!previewKey ? (
              <p className="m-0 text-[11px] text-text-tertiary">
                EXIF needs a fully hashed file row.
              </p>
            ) : !inspectedPreview || inspectedPreview.key !== previewKey || inspectedPreview.loading ? (
              <p className="m-0 text-[11px] text-text-tertiary">Loading EXIF…</p>
            ) : inspectedPreview.error ? (
              <p className="m-0 text-[11px] text-warning">{inspectedPreview.error}</p>
            ) : inspectedPreview.exif?.fields?.length ? (
              <dl className="grid gap-1.5 text-[11px]">
                {inspectedPreview.exif.fields.map((field) => (
                  <div key={`${field.group}-${field.tag}`} className="grid grid-cols-[minmax(0,45%)_minmax(0,1fr)] gap-2">
                    <dt className="truncate text-text-tertiary" title={`${field.group} · ${field.tag}`}>{field.tag}</dt>
                    <dd className="m-0 truncate text-muted-strong" title={field.value}>{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="m-0 text-[11px] text-text-tertiary">
                {inspectedPreview.exif?.error || 'No EXIF data for this file.'}
              </p>
            )}
          </InspectorSection>
          {typeof onInspectFile === 'function' && (
            <button
              type="button"
              onClick={() => onInspectFile(inspected)}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-text"
            >
              <Icon name="rowActions" className="h-3.5 w-3.5" /> Full details
            </button>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-4 text-center text-[11px] leading-relaxed text-text-tertiary">
          Select a row to keep its file context visible while you work in this scan.
        </div>
      )}
    </aside>
  );
}

function InspectorSection({ label, open, onToggle, children }) {
  return (
    <section className="mt-3 border-t border-sidebar-border pt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 border-0 bg-transparent p-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted transition-colors hover:text-text"
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" /> {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

function InspectorField({ label, value }) {
  return (
    <div>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 m-0 break-words text-muted-strong">{value || '—'}</dd>
    </div>
  );
}

function formatInspectorDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}
