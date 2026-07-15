import FileExplorer from '../components/FileExplorer.jsx';
import { Icon } from '../components/Icon.jsx';
import {
  Button,
  emptyTextClassName,
  locationContentClassName,
  locationDetailClassName,
  locationEmptyStateClassName,
  locationNotesBodyClassName,
  locationNotesPanelClassName,
  locationOverviewActionsClassName,
  locationOverviewClassName,
  locationShellClassName,
  locationSummaryGridClassName,
  locationSummaryItemClassName,
  locationSummaryLabelClassName,
  locationSummaryValueClassName,
  panelTitleClassName,
  panelTitleSubtextClassName,
  panelTitleTextClassName,
  scanSummaryCardClassName,
  scanSummaryCodeClassName,
  scanSummaryGridClassName,
  scanSummaryLabelClassName,
  scanSummaryMutedClassName,
  scanSummaryValueClassName
} from '../components/ui/index.jsx';
import { bytes, scanDetail, scanLabel, statusLabel, when } from '../utils/format.js';

export default function LocationsPage(props) {
  const { selectedLocationView, selectedScanView, busy, locationsLoading } = props;

  return (
    <section className={locationShellClassName}>
      <section className={locationContentClassName}>
        {selectedLocationView ? (
          <LocationDetail
            {...props}
            location={selectedLocationView}
            activeScan={selectedScanView}
            busy={busy}
          />
        ) : (
          <div className={locationEmptyStateClassName}>
            <h2>{locationsLoading ? 'Loading locations' : 'No location selected'}</h2>
            <p>{locationsLoading ? 'Loading source locations and scans.' : 'Add a location or choose one from the sidebar to start browsing scans.'}</p>
            <Button onClick={props.onShowAddLocation} icon={<Icon name="add" />}>Add location</Button>
          </div>
        )}
      </section>
    </section>
  );
}

function LocationDetail(props) {
  const { location, activeScan } = props;

  if (activeScan) {
    return (
      <section className={locationDetailClassName}>
        <FileExplorer {...props} activeScan={activeScan} location={location} showScanActions={false} />
      </section>
    );
  }

  return <LocationOverview {...props} location={location} />;
}

function LocationOverview(props) {
  const { busy, location, scansLoading, onStartScan } = props;
  const representative = location.representativeScan;
  const latestGood = location.lastSuccessfulScan;

  return (
    <>
      {location.notes && (
        <section className={locationNotesPanelClassName}>
          <h3>Location notes</h3>
          <p className={locationNotesBodyClassName}>{location.notes}</p>
        </section>
      )}

      <div className={locationOverviewActionsClassName}>
        <Button onClick={() => onStartScan(location.slug)} disabled={busy} icon={<Icon name="scan" />}>
          Scan now
        </Button>
      </div>

      <section className={locationSummaryGridClassName}>
        <div className={locationSummaryItemClassName({ emphasis: true })}><strong className={locationSummaryValueClassName}>{location.scanCount}</strong><span className={locationSummaryLabelClassName}>Total scans</span></div>
        <div className={locationSummaryItemClassName()}><strong className={locationSummaryValueClassName}>{location.activeScan ? statusLabel(location.activeScan.status) : 'Idle'}</strong><span className={locationSummaryLabelClassName}>Current state</span></div>
        <div className={locationSummaryItemClassName()}><strong className={locationSummaryValueClassName}>{location.lastSuccessfulScan ? bytes(location.lastSuccessfulScan.total_bytes) : '0 B'}</strong><span className={locationSummaryLabelClassName}>Last indexed size</span></div>
        <div className={locationSummaryItemClassName()}><strong className={locationSummaryValueClassName}>{location.representativeScan ? when(location.representativeScan.started_at) : 'latest good'}</strong><span className={locationSummaryLabelClassName}>Representative scan</span></div>
      </section>

      <section className={locationOverviewClassName}>
        <div className={panelTitleClassName}>
          <div className={panelTitleTextClassName}>
            <h2>Location Overview</h2>
            <p className={panelTitleSubtextClassName}>Select a scan from the sidebar to browse files for a specific scan.</p>
          </div>
        </div>

        <div className={scanSummaryGridClassName}>
          <ScanSummaryCard title="Representative" scan={representative} onSelect={props.onSelectScan} loading={scansLoading} />
          <ScanSummaryCard title="Last successful" scan={latestGood} onSelect={props.onSelectScan} loading={scansLoading} />
          <article className={scanSummaryCardClassName}>
            <span className={scanSummaryLabelClassName}>Location</span>
            <strong className={scanSummaryValueClassName}>{location.connected ? 'Connected' : 'Disconnected'}</strong>
            <code className={scanSummaryCodeClassName}>{location.root_path}</code>
          </article>
        </div>

        {!location.scans.length && <p className={emptyTextClassName}>{scansLoading ? 'Loading scans...' : 'Run a scan to begin exploring this location.'}</p>}
      </section>
    </>
  );
}

function ScanSummaryCard({ title, scan, onSelect, loading = false }) {
  return (
    <article className={scanSummaryCardClassName}>
      <span className={scanSummaryLabelClassName}>{title}</span>
      {scan ? (
        <>
          <strong className={scanSummaryValueClassName}>{scanLabel(scan)}</strong>
          <small className={scanSummaryMutedClassName}>{scanDetail(scan)} - {bytes(scan.total_bytes)}</small>
          <Button variant="secondary" onClick={() => onSelect(scan.id)} icon={<Icon name="folder" />}>
            Open scan
          </Button>
        </>
      ) : loading ? (
        <p className={emptyTextClassName}>Loading scans...</p>
      ) : (
        <p className={emptyTextClassName}>No scan available.</p>
      )}
    </article>
  );
}
