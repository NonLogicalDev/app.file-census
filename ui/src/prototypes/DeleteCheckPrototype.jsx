import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon.jsx';

// Backend-free prototype for the 2026-07-19 backup-display + delete-check-set
// design (plan-073). Nothing here talks to the backend; it exists only to
// screenshot the proposed UX for alignment before wiring.
//
// Shows:
//  - Folder Backup cell as [N safe] [N partial] [N unsafe] (UNIQUE files each).
//  - File Backup cell as "Last copy" or a verdict + "[X copies exist]".
//  - Backup scope toggle: Internal (this disk) vs External (other disks).
//  - Delete Check set: add-to-set actions, a membership panel, and a Delete
//    Check toggle that filters the listing down to the staged paths.

const GB = 1024 ** 3;
const MB = 1024 ** 2;

// Each row carries BOTH scopes so the Internal/External toggle just re-reads.
// Folder unique counts: { safe, partial, unsafe }. File: { verdict, copies }.
// verdict: 'safe' (exact copy in scope), 'partial' (light copy), 'last' (none).
const FOLDERS = [
  {
    name: '@Photos', kind: 'dir', size: 171.6 * GB, files: 88231,
    external: { safe: 12, partial: 3, unsafe: 61240 },
    internal: { safe: 41200, partial: 120, unsafe: 46911 }
  },
  {
    name: 'Camera Roll', kind: 'dir', size: 57.8 * GB, files: 40122,
    external: { safe: 0, partial: 0, unsafe: 21044 },
    internal: { safe: 21000, partial: 40, unsafe: 4 }
  },
  {
    name: 'Screenshots', kind: 'dir', size: 774.8 * MB, files: 5192,
    external: { safe: 0, partial: 4, unsafe: 4788 },
    internal: { safe: 400, partial: 5, unsafe: 4787 }
  }
];
const FILES = [
  {
    name: 'IMG_2013.HEIC', kind: 'file', size: 3.6 * MB,
    external: { verdict: 'last', copies: 0 }, internal: { verdict: 'last', copies: 0 }
  },
  {
    name: 'IMG_2014.HEIC', kind: 'file', size: 3.7 * MB,
    external: { verdict: 'safe', copies: 1 }, internal: { verdict: 'safe', copies: 2 }
  },
  {
    name: 'edit_scratch.psd', kind: 'file', size: 209.7 * MB,
    external: { verdict: 'partial', copies: 1 }, internal: { verdict: 'last', copies: 0 }
  }
];
const ALL_ROWS = [...FOLDERS, ...FILES];

// The Delete Check set is a cross-location working set built iteratively. Each
// member carries its location + path + kind; it can span locations and stays an
// antichain per location (no member encloses another).
const STAGED = [
  { location: 'NLBackup', kind: 'dir', path: 'PHOTO_FILTER/Camera Roll' },
  { location: 'NLBackup', kind: 'dir', path: 'PHOTO_FILTER/Screenshots' },
  { location: 'NLBackup', kind: 'file', path: 'PHOTO_FILTER/IMG_2013.HEIC' },
  { location: 'SSD-Archive', kind: 'dir', path: 'exports/2019 masters' }
];
// Rows are the NLBackup PHOTO_FILTER children; stage-match is by that path.
const STAGED_HERE = new Set(
  STAGED.filter((m) => m.location === 'NLBackup').map((m) => m.path)
);
const STAGED_LOCATIONS = [...new Set(STAGED.map((m) => m.location))];

function bytes(n) {
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

const chip = 'inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] font-bold tabular-nums';
const seg = (active) =>
  `rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${active ? 'bg-surface-muted text-text shadow-sm' : 'text-muted hover:text-text'}`;
const segWrap = 'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5';

function FolderBackup({ counts }) {
  const parts = [];
  if (counts.safe) parts.push(<span key="s" className={`${chip} border-success/45 text-success`}>{counts.safe.toLocaleString()} safe</span>);
  if (counts.partial) parts.push(<span key="p" className={`${chip} border-warning/50 text-warning`}>{counts.partial.toLocaleString()} partial</span>);
  if (counts.unsafe) parts.push(<span key="u" className={`${chip} border-danger/50 text-danger`}>{counts.unsafe.toLocaleString()} unsafe</span>);
  if (!parts.length) return <span className="text-[10px] text-success/80">all backed up</span>;
  return <span className="inline-flex flex-wrap items-center gap-1.5">{parts}</span>;
}

function FileBackup({ info }) {
  if (info.verdict === 'last') {
    return (
      <span className={`${chip} border-danger/50 bg-[color:color-mix(in_srgb,var(--danger)_14%,var(--surface))] text-danger`}>
        <Icon name="warning" className="h-3 w-3" /> Last copy
      </span>
    );
  }
  const tone = info.verdict === 'safe'
    ? 'border-success/40 bg-[color:color-mix(in_srgb,var(--success)_12%,var(--surface))] text-success'
    : 'border-warning/50 bg-warning-soft text-warning';
  const label = info.verdict === 'safe' ? 'Safe' : 'Partial';
  const total = info.copies + 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${chip} ${tone}`}>
        <Icon name={info.verdict === 'safe' ? 'check' : 'warning'} className="h-3 w-3" /> {label}
      </span>
      <span className="text-[10px] text-muted tabular-nums">[{total} copies exist]</span>
    </span>
  );
}

function Row({ row, scope, showMenu }) {
  const isStaged = STAGED_HERE.has(`PHOTO_FILTER/${row.name}`);
  return (
    <tr className="group border-b border-border hover:bg-surface-muted">
      <td className="w-8 border-r border-border px-2 py-1.5 text-center">
        <input type="checkbox" readOnly checked={isStaged} className="h-3.5 w-3.5 [accent-color:var(--accent)]" />
      </td>
      <td className="border-r border-border px-2 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <Icon name={row.kind === 'dir' ? 'folder' : 'file'} className={`h-[15px] w-[15px] ${row.kind === 'dir' ? 'text-accent' : 'text-muted'}`} />
          <span className={row.kind === 'dir' ? 'font-[650]' : ''}>{row.name}{row.kind === 'dir' ? '/' : ''}</span>
        </span>
      </td>
      <td className="border-r border-border px-2 py-1.5">
        {row.kind === 'dir' ? <FolderBackup counts={row[scope]} /> : <FileBackup info={row[scope]} />}
      </td>
      <td className="border-r border-border px-2 py-1.5 text-right tabular-nums text-muted">{bytes(row.size)}</td>
      <td className="relative px-2 py-1.5 text-right">
        {showMenu ? (
          <div className="absolute right-2 top-7 z-10 w-52 rounded-md border border-border bg-surface p-1 text-left shadow-lg">
            <div className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-text hover:bg-surface-muted">
              <Icon name="add" className="h-3.5 w-3.5 text-accent" /> Add to Delete Check
            </div>
            <div className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-muted hover:bg-surface-muted">
              <Icon name="thumbnails" className="h-3.5 w-3.5" /> Build thumbnails
            </div>
            <div className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-muted hover:bg-surface-muted">
              <Icon name="exclude" className="h-3.5 w-3.5" /> Exclude from scan
            </div>
          </div>
        ) : null}
        <Icon name="rowActions" className="h-4 w-4 text-text-tertiary opacity-60 group-hover:opacity-100" />
      </td>
    </tr>
  );
}

export default function DeleteCheckPrototype({ initialDeleteCheck = false, initialScope = 'external' }) {
  const [scope, setScope] = useState(initialScope);
  const [deleteCheck, setDeleteCheck] = useState(initialDeleteCheck);

  const rows = useMemo(() => {
    if (!deleteCheck) return ALL_ROWS;
    return ALL_ROWS.filter((r) => STAGED_HERE.has(`PHOTO_FILTER/${r.name}`));
  }, [deleteCheck]);

  return (
    <div className="min-h-screen bg-bg p-4 text-[13px] text-text">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="folder" className="h-4 w-4 text-muted" />
          <strong className="text-[13px]">Historical scan</strong>
          <span className="rounded-full border border-border bg-surface-subtle px-2 text-[10px] leading-[18px] text-muted">Ready</span>
        </div>
        <span className="text-[11px] text-text-tertiary">133,639 files · 253.4 GB</span>
      </div>

      {/* Controls row */}
      <div className="mb-2 flex flex-wrap items-center gap-3 border-y border-sidebar-border py-2">
        <div className={segWrap}>
          <button className={seg(true)}>Browse</button>
          <button className={seg(false)}>Flat</button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Backup</span>
          <div className={segWrap}>
            <button className={seg(true)}>All</button>
            <button className={seg(false)}><span className="text-success">●</span> Safe</button>
            <button className={seg(false)}><span className="text-warning">●</span> Partial</button>
            <button className={seg(false)}><span className="text-danger">●</span> Unsafe</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Scope</span>
          <div className={segWrap}>
            <button className={seg(scope === 'internal')} onClick={() => setScope('internal')}>
              <Icon name="locations" className="mr-1 inline h-3 w-3" />Internal
            </button>
            <button className={seg(scope === 'external')} onClick={() => setScope('external')}>
              <Icon name="representative" className="mr-1 inline h-3 w-3" />External
            </button>
          </div>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setDeleteCheck((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition ${
              deleteCheck ? 'border-danger/50 bg-[color:color-mix(in_srgb,var(--danger)_14%,var(--surface))] text-danger' : 'border-border bg-surface-subtle text-muted hover:text-text'
            }`}
          >
            <Icon name="deleteCheck" className="h-3.5 w-3.5" />
            Delete Check
            <span className={`ml-1 rounded-full px-1.5 text-[10px] ${deleteCheck ? 'bg-danger/20' : 'bg-surface-muted'}`}>{STAGED.length}</span>
          </button>
        </div>
      </div>

      {/* Scope hint */}
      <p className="mb-2 text-[11px] text-text-tertiary">
        {scope === 'external'
          ? 'External: “safe” means an exact copy exists on ANOTHER location (real backup). This disk has no second full-hash location, so almost everything is unsafe.'
          : 'Internal: “safe” means another copy of the same content exists on THIS disk (a within-disk duplicate).'}
      </p>

      <div className="grid gap-3" style={{ gridTemplateColumns: deleteCheck ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)' }}>
        {/* Table */}
        <div className="overflow-hidden rounded-md border border-sidebar-border bg-bg">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr className="bg-surface-muted text-[11px] text-muted">
                <th className="w-8 border-b border-r border-border-strong px-2 py-1.5"></th>
                <th className="border-b border-r border-border-strong px-2 py-1.5 text-left font-semibold">Name</th>
                <th className="border-b border-r border-border-strong px-2 py-1.5 text-left font-semibold">Backup {scope === 'internal' ? '(internal)' : '(external)'}</th>
                <th className="border-b border-r border-border-strong px-2 py-1.5 text-right font-semibold">Size</th>
                <th className="w-10 border-b border-border-strong px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.name} row={row} scope={scope} showMenu={!deleteCheck && row.name === 'IMG_2014.HEIC'} />
              ))}
            </tbody>
          </table>
          {deleteCheck && (
            <p className="border-t border-border bg-surface-subtle px-3 py-1.5 text-[11px] text-muted">
              Showing only this location's staged paths. The set also has members in other locations (see panel).
            </p>
          )}
        </div>

        {/* Delete Check membership panel */}
        {deleteCheck && (
          <aside className="flex flex-col rounded-md border border-danger/30 bg-sidebar-bg">
            <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-danger">Delete Check set</span>
              <button className="text-[11px] text-muted hover:text-text">Clear</button>
            </div>
            <div className="px-3 py-2 text-[11px] text-muted">
              {STAGED.filter((m) => m.kind === 'dir').length} folders · {STAGED.filter((m) => m.kind === 'file').length} file · {STAGED_LOCATIONS.length} locations · <strong className="text-text">45,315 files</strong> affected
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {STAGED_LOCATIONS.map((loc) => (
                <div key={loc}>
                  <p className="flex items-center gap-1.5 border-b border-sidebar-border/60 bg-surface-subtle px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                    <Icon name="locations" className="h-3 w-3" /> {loc}
                  </p>
                  {STAGED.filter((m) => m.location === loc).map((m) => (
                    <div key={m.path} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <Icon name={m.kind === 'dir' ? 'folder' : 'file'} className={`h-3.5 w-3.5 flex-none ${m.kind === 'dir' ? 'text-accent' : 'text-text-tertiary'}`} />
                      <span className="min-w-0 flex-1 truncate text-muted-strong">{m.path}</span>
                      <Icon name="close" className="h-3 w-3 flex-none text-text-tertiary hover:text-text" />
                    </div>
                  ))}
                </div>
              ))}
              <p className="px-3 py-2 text-[10px] leading-relaxed text-text-tertiary">
                Add/remove members over time across locations. Nested adds are
                refused: a folder already in the set blocks adding anything inside
                it.
              </p>
            </div>
            <div className="border-t border-sidebar-border p-3">
              <div className="mb-2 flex items-center gap-2 rounded border border-danger/40 bg-[color:color-mix(in_srgb,var(--danger)_10%,var(--surface))] px-2 py-1.5 text-[11px] text-danger">
                <Icon name="warning" className="h-3.5 w-3.5 flex-none" />
                <span><strong>44,931</strong> files would lose their last copy (external).</span>
              </div>
              <button className="w-full rounded-md border border-danger/50 bg-[color:color-mix(in_srgb,var(--danger)_16%,var(--surface))] py-1.5 text-[12px] font-semibold text-danger">
                Validate deletion…
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
