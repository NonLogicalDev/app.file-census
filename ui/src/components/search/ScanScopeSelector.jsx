import { useMemo } from 'react';

import { Icon } from '../Icon.jsx';
import { Button, emptyTextClassName, mutedInlineClassName } from '../ui/index.jsx';
import { scanDetail, scanLabel } from '../../utils/format.js';

export default function ScanScopeSelector({
  title = 'Scan scope',
  scope = 'representative',
  allowAll = false,
  locations = [],
  scans = [],
  selectedScanIds = [],
  busy = false,
  loading = false,
  onScopeChange,
  onSetSelectedScanIds
}) {
  const selectedSet = useMemo(() => new Set(selectedScanIds || []), [selectedScanIds]);
  const scanGroups = useMemo(() => locations
    .map((location) => {
      const locationScans = (location.scans?.length ? location.scans : scans.filter((scan) => scan.location_slug === location.slug));
      return {
        location,
        scans: locationScans,
        representativeScan: location.representativeScan || locationScans.find((scan) => scan.is_representative) || null
      };
    })
    .filter((group) => group.scans.length), [locations, scans]);

  function setExplicitScanIds(nextScanIds) {
    const uniqueScanIds = [...new Set((nextScanIds || []).filter(Boolean))];
    onSetSelectedScanIds?.(uniqueScanIds);
    if (uniqueScanIds.length) onScopeChange?.('explicit');
  }

  function toggleScan(scanId) {
    setExplicitScanIds(selectedSet.has(scanId)
      ? selectedScanIds.filter((id) => id !== scanId)
      : [...selectedScanIds, scanId]);
  }

  function selectRepresentative(group) {
    const representativeId = group.representativeScan?.id;
    if (!representativeId) return;
    const locationScanIds = new Set(group.scans.map((scan) => scan.id));
    const next = [
      ...selectedScanIds.filter((scanId) => !locationScanIds.has(scanId)),
      representativeId
    ];
    setExplicitScanIds(next);
  }

  function clearSelection(nextScope = 'representative') {
    onScopeChange?.(nextScope);
  }

  const summary = scope === 'explicit'
    ? `${selectedScanIds.length} selected`
    : scope === 'all'
      ? 'All scans'
      : 'Representative scans';

  return (
    <section className="grid gap-3 rounded-panel border border-border bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-semibold text-text">{title}</h3>
          <p className="m-0 text-sm text-muted">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={scope === 'representative' ? 'secondary' : 'ghost'}
            size="sm"
            disabled={busy}
            onClick={() => clearSelection('representative')}
            icon={<Icon name="representative" />}
            title="Use the representative scan for each enabled location."
          >
            Representative
          </Button>
          {allowAll && (
            <Button
              variant={scope === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              disabled={busy}
              onClick={() => clearSelection('all')}
              icon={<Icon name="locations" />}
              title="Search every scan, including old and non-representative scans."
            >
              All scans
            </Button>
          )}
          <Button
            variant={scope === 'explicit' ? 'secondary' : 'ghost'}
            size="sm"
            disabled={busy}
            onClick={() => onScopeChange?.('explicit')}
            icon={<Icon name="scan" />}
            title="Choose exact scans below."
          >
            Selected scans
          </Button>
        </div>
      </div>

      <div className="grid max-h-64 gap-2 overflow-auto pr-1">
        {scanGroups.map((group) => (
          <div className="grid gap-1" key={group.location.slug}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {group.location.name || group.location.slug}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || !group.representativeScan}
                onClick={() => selectRepresentative(group)}
                icon={<Icon name="representative" />}
                title={group.representativeScan ? 'Select this location representative scan.' : 'No representative scan is set for this location.'}
              >
                Use representative
              </Button>
            </div>
            <div className="grid gap-1">
              {group.scans.map((scan) => (
                <label
                  key={scan.id}
                  className={[
                    'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-ui border px-2 py-1 text-sm transition',
                    scan.is_representative
                      ? 'border-accent-line bg-accent-soft'
                      : 'border-border bg-surface-muted hover:border-accent-line hover:bg-accent-soft'
                  ].join(' ')}
                  title={scan.id}
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(scan.id)}
                    disabled={busy}
                    onChange={() => toggleScan(scan.id)}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-medium text-text">{scanLabel(scan)}</span>
                    <span className="text-xs text-muted">{scanDetail(scan)}</span>
                    <code className="break-all text-xs text-muted">{scan.id}</code>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {scan.is_representative && (
                      <span className="rounded-full border border-accent-line bg-surface px-1.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-accent">
                        Rep
                      </span>
                    )}
                    <span className={mutedInlineClassName}>{scan.file_count || 0} indexed</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {!scanGroups.length && <p className={emptyTextClassName}>{loading ? 'Loading scans...' : 'No scans are available yet.'}</p>}
      </div>
    </section>
  );
}
