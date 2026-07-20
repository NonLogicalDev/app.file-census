import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { bytes } from '../utils/format.js';

// App-level right-rail Inspector (docked beside the workspace like the left
// sidebar). Shows the clicked row's context plus lazy collapsible Preview and
// EXIF sections backed by the cheap files.preview RPC.
const inspectorActionButtonClassName =
  'inline-flex h-[26px] w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface-subtle px-2 text-[11px] text-muted transition-colors hover:bg-surface hover:text-text';

export default function InspectorPanel({
  inspected,
  activeScan,
  pinned = false,
  onTogglePin,
  onInspectFile,
  onOpenFile,
  onRevealFile,
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
  // User-resizable preview height (drag handle under the image), persisted.
  const PREVIEW_MIN_HEIGHT = 96;
  const PREVIEW_MAX_HEIGHT = 640;
  const [previewHeight, setPreviewHeight] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem('locations-inspector-preview-height'));
    return Number.isFinite(stored) && stored >= PREVIEW_MIN_HEIGHT
      ? Math.min(stored, PREVIEW_MAX_HEIGHT)
      : 192;
  });
  useEffect(() => {
    globalThis.localStorage?.setItem('locations-inspector-preview-height', String(previewHeight));
  }, [previewHeight]);
  const previewResizeSession = useRef(null);
  function clampPreviewHeight(value) {
    return Math.min(PREVIEW_MAX_HEIGHT, Math.max(PREVIEW_MIN_HEIGHT, Math.round(value)));
  }
  function startPreviewResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in older embedded webviews.
    }
    previewResizeSession.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: previewHeight
    };
  }
  function movePreviewResize(event) {
    const session = previewResizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPreviewHeight(clampPreviewHeight(session.startHeight + event.clientY - session.startY));
  }
  function finishPreviewResize(event) {
    const session = previewResizeSession.current;
    if (!session || (event && session.pointerId !== event.pointerId)) return;
    previewResizeSession.current = null;
    if (event?.currentTarget?.hasPointerCapture?.(session.pointerId)) {
      event.currentTarget.releasePointerCapture(session.pointerId);
    }
  }
  function handlePreviewResizeKeyDown(event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setPreviewHeight((current) => clampPreviewHeight(current + direction * step));
  }

  const [inspectedPreview, setInspectedPreview] = useState(null);
  const previewKey = inspected && inspected.kind === 'file' && inspected.blake3
    ? `${inspected.scan_id || ''}:${inspected.path}:${inspected.blake3}`
    : null;
  const inspectedPreviewKeyRef = useRef(null);
  useEffect(() => {
    if ((!previewOpen && !exifOpen) || !previewKey) return undefined;
    if (typeof onLoadFilePreview !== 'function') return undefined;
    if (inspectedPreviewKeyRef.current === previewKey) return undefined;
    let stale = false;
    // Debounced: fetch only after the selection settles, so holding an arrow
    // key skims rows without queueing a preview request per traversed row.
    const timer = setTimeout(() => {
      if (stale) return;
      inspectedPreviewKeyRef.current = previewKey;
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
    }, 180);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inspected is keyed by previewKey
  }, [previewOpen, exifOpen, previewKey, onLoadFilePreview]);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col" aria-label="File inspector">
      <div className="flex h-8 flex-none items-center justify-between border-b border-sidebar-border px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        <span>Inspector</span>
        <button
          type="button"
          onClick={onTogglePin}
          className={`grid h-5 w-5 place-items-center rounded transition-colors hover:text-text ${pinned ? 'text-accent' : 'text-text-tertiary'}`}
          aria-pressed={pinned}
          aria-label={pinned ? 'Unpin inspector (show on hover only)' : 'Pin inspector open'}
          title={pinned ? 'Unpin — the Inspector collapses to the right edge and shows on hover' : 'Pin the Inspector open as a docked panel'}
        >
          <Icon name="pin" className={`h-3.5 w-3.5 ${pinned ? '' : 'rotate-45'}`} />
        </button>
      </div>
      {inspected ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {/* [Icon + Name] */}
          <div className="flex items-start gap-2">
            <Icon
              name={inspected.kind === 'dir' ? 'folder' : 'file'}
              className="mt-0.5 h-[18px] w-[18px] flex-none text-text-tertiary"
            />
            <div className="min-w-0">
              <strong className="block truncate text-[12px] font-medium text-text">{inspected.name}</strong>
              <span className="text-[11px] text-text-tertiary">
                {inspected.kind === 'dir' ? 'Folder' : inspected.file_kind || 'File'}
              </span>
            </div>
          </div>
          {/* Actions: File Info (content-identity modal, files only) + system
              open/reveal for the on-disk copy. */}
          <div className="mt-2.5 grid gap-1.5">
            {typeof onInspectFile === 'function' && inspected.kind === 'file' && (
              <button
                type="button"
                onClick={() => onInspectFile(inspected)}
                className={inspectorActionButtonClassName}
              >
                <Icon name="rowActions" className="h-3.5 w-3.5" /> Open File Info
              </button>
            )}
            {(typeof onRevealFile === 'function' || typeof onOpenFile === 'function') && (
              <div className="grid grid-cols-2 gap-1.5">
                {typeof onRevealFile === 'function' && (
                  <button
                    type="button"
                    onClick={() => onRevealFile(inspected)}
                    className={inspectorActionButtonClassName}
                    title="Reveal this copy in the system file explorer"
                  >
                    <Icon name="revealFile" className="h-3.5 w-3.5" /> Reveal File
                  </button>
                )}
                {typeof onOpenFile === 'function' && (
                  <button
                    type="button"
                    onClick={() => onOpenFile(inspected)}
                    className={inspectorActionButtonClassName}
                    title="Open this copy with the system default app"
                  >
                    <Icon name="openFile" className="h-3.5 w-3.5" /> Open File
                  </button>
                )}
              </div>
            )}
          </div>
          <InspectorSection
            label="Preview"
            open={previewOpen}
            onToggle={() => setPreviewOpen((open) => !open)}
          >
            {inspected.kind === 'dir' ? (
              <p className="m-0 text-[11px] text-text-tertiary">
                Select a file to preview it.
              </p>
            ) : !previewKey ? (
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
                  className="w-full rounded-ui border border-border object-contain"
                  style={{ height: `${previewHeight}px` }}
                />
                {/* Drag handle: resize the preview area vertically. */}
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize preview"
                  aria-valuemin={PREVIEW_MIN_HEIGHT}
                  aria-valuemax={PREVIEW_MAX_HEIGHT}
                  aria-valuenow={previewHeight}
                  tabIndex={0}
                  className="group -my-0.5 flex h-2.5 w-full cursor-row-resize touch-none items-center justify-center focus-visible:outline-none"
                  onKeyDown={handlePreviewResizeKeyDown}
                  onLostPointerCapture={finishPreviewResize}
                  onPointerCancel={finishPreviewResize}
                  onPointerDown={startPreviewResize}
                  onPointerMove={movePreviewResize}
                  onPointerUp={finishPreviewResize}
                >
                  <span className="h-[3px] w-8 rounded-full bg-border transition-colors group-hover:bg-accent-line group-focus-visible:bg-accent-line" />
                </div>
                <p className="mb-0 mt-0.5 text-[10px] text-text-tertiary">
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
          {/* [regular info] */}
          <dl className="mt-3 grid gap-2.5 border-t border-sidebar-border pt-3 text-[11px]">
            <InspectorField label="Path" value={inspected.path} />
            <InspectorField label="Size" value={bytes(inspected.size)} />
            {inspected.kind === 'dir' && (
              <InspectorField label="Files" value={Number(inspected.file_count || 0).toLocaleString()} />
            )}
            {inspected.kind === 'dir' && inspected.distinct_count != null && (
              <InspectorField label="Unique contents" value={Number(inspected.distinct_count || 0).toLocaleString()} />
            )}
            <InspectorField label="Modified" value={formatInspectorDate(inspected.mtime)} />
            {activeScan && <InspectorField label="Scan" value={activeScan.nickname || activeScan.id} />}
          </dl>
          <InspectorSection
            label="EXIF"
            open={exifOpen}
            onToggle={() => setExifOpen((open) => !open)}
          >
            {inspected.kind === 'dir' ? (
              <p className="m-0 text-[11px] text-text-tertiary">
                Select a file to read its EXIF.
              </p>
            ) : !previewKey ? (
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
