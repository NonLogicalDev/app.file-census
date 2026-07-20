import { useEffect, useState } from 'react';
import {
  Button,
  cardClassName,
  emptyTextClassName,
  mutedInlineClassName,
  pageGridClassName,
  pageHeaderClassName
} from '../components/ui/index.jsx';
import { Icon } from '../components/Icon.jsx';

const workerInputClassName =
  'h-9 w-full rounded-ui border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-tertiary focus:border-border-strong';

export default function OptionsPage({
  databaseInfo,
  canChooseDatabase,
  busy,
  onChooseDatabase,
  onLoadSettings,
  onSaveSettings
}) {
  // Global scan worker-pool defaults (used when a scan doesn't set its own).
  const [workerForm, setWorkerForm] = useState(null);
  const [workerStatus, setWorkerStatus] = useState('');
  useEffect(() => {
    let stale = false;
    onLoadSettings?.()
      .then((settings) => {
        if (stale || !settings) return;
        setWorkerForm({
          hash: settings.scan_hash_workers ?? '',
          metadata: settings.scan_metadata_workers ?? ''
        });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [onLoadSettings]);
  async function saveWorkerDefaults() {
    if (!workerForm) return;
    const parse = (value) => {
      const parsed = Number.parseInt(String(value ?? '').trim(), 10);
      return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 64) : null;
    };
    try {
      const saved = await onSaveSettings?.({
        scan_hash_workers: parse(workerForm.hash),
        scan_metadata_workers: parse(workerForm.metadata)
      });
      if (saved) {
        setWorkerForm({
          hash: saved.scan_hash_workers ?? '',
          metadata: saved.scan_metadata_workers ?? ''
        });
        setWorkerStatus('Saved.');
        setTimeout(() => setWorkerStatus(''), 2500);
      }
    } catch (error) {
      setWorkerStatus(error?.message || String(error));
    }
  }
  return (
    <section className={pageGridClassName}>
      <div className={pageHeaderClassName}>
        <div>
          <h2>Options</h2>
        </div>
      </div>

      <section className={cardClassName}>
        <div className="grid gap-1">
          <h3 className="m-0 text-base">Database</h3>
          <p className={mutedInlineClassName}>Current state store</p>
        </div>
        <code className="block min-w-0 overflow-hidden text-ellipsis rounded-ui border border-border bg-surface-muted px-2.5 py-2 text-sm text-muted-strong" title={databaseInfo?.path || 'Default database'}>
          {databaseInfo?.path || 'Default database'}
        </code>
        {canChooseDatabase ? (
          <div>
            <Button variant="secondary" onClick={onChooseDatabase} disabled={busy} icon={<Icon name="chooseDatabase" />}>
              Choose database
            </Button>
          </div>
        ) : (
          <p className={emptyTextClassName}>Database selection is available in the desktop app.</p>
        )}
      </section>

      <section className={cardClassName}>
        <div className="grid gap-1">
          <h3 className="m-0 text-base">Scan worker pools</h3>
          <p className={mutedInlineClassName}>
            Global defaults for new scans. A scan&rsquo;s own Start-scan values win over these;
            blank falls back to auto (hash: cores−1 capped at 8; metadata: 2). Raise hash workers
            for SSD/NAS sources, keep low for spinning disks.
          </p>
        </div>
        {workerForm ? (
          <div className="grid max-w-[480px] grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label className="grid gap-1 text-sm text-muted-strong">Hash workers
              <input
                className={workerInputClassName}
                type="number"
                min="1"
                max="64"
                placeholder="auto"
                value={workerForm.hash}
                onChange={(event) => setWorkerForm({ ...workerForm, hash: event.currentTarget.value })}
              />
            </label>
            <label className="grid gap-1 text-sm text-muted-strong">Metadata workers
              <input
                className={workerInputClassName}
                type="number"
                min="1"
                max="64"
                placeholder="auto (2)"
                value={workerForm.metadata}
                onChange={(event) => setWorkerForm({ ...workerForm, metadata: event.currentTarget.value })}
              />
            </label>
            <div className="col-span-full flex items-center gap-3">
              <Button variant="secondary" onClick={saveWorkerDefaults} disabled={busy} icon={<Icon name="save" />}>
                Save defaults
              </Button>
              {workerStatus && <span className={mutedInlineClassName}>{workerStatus}</span>}
            </div>
          </div>
        ) : (
          <p className={emptyTextClassName}>Loading settings…</p>
        )}
      </section>
    </section>
  );
}
