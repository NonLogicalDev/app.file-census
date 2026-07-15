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
  locationOverviewClassName,
  locationShellClassName,
  locationSummaryGridClassName,
  locationSummaryItemClassName,
  locationSummaryLabelClassName,
  locationSummaryValueClassName,
  panelTitleClassName,
  panelTitleSubtextClassName,
  panelTitleTextClassName
} from '../components/ui/index.jsx';
import { scanDetail, scanLabel } from '../utils/format.js';

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
  const { location, scansLoading } = props;
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

      <section className={locationOverviewClassName}>
        <div className={panelTitleClassName}>
          <div className={panelTitleTextClassName}>
            <h2>Location Overview</h2>
            <p className={panelTitleSubtextClassName}>Select a scan from the sidebar to browse files for a specific scan.</p>
          </div>
        </div>

        <dl className={locationSummaryGridClassName}>
          <LocationFact label="Root path" value={location.root_path || 'Unavailable'} code />
          <LocationFact label="Location is" value={location.connected ? 'Connected' : 'Disconnected'} />
          <LocationFact label="Representative scan" value={scanFact(representative, scansLoading)} detail={representative ? scanDetail(representative) : ''} />
          <LocationFact label="Last successful scan" value={scanFact(latestGood, scansLoading)} detail={latestGood ? scanDetail(latestGood) : ''} />
          <LocationFact label="Total scans" value={String(location.scanCount || 0)} />
        </dl>

        {!location.scans.length && <p className={emptyTextClassName}>{scansLoading ? 'Loading scans...' : 'Run a scan to begin exploring this location.'}</p>}
      </section>
    </>
  );
}

function LocationFact({ label, value, detail = '', code = false }) {
  return (
    <div className={locationSummaryItemClassName({ emphasis: label === 'Root path' })}>
      {code ? <code className={locationSummaryValueClassName}>{value}</code> : <strong className={locationSummaryValueClassName}>{value}</strong>}
      {detail && <span className={panelTitleSubtextClassName}>{detail}</span>}
      <span className={locationSummaryLabelClassName}>{label}</span>
    </div>
  );
}

function scanFact(scan, loading) {
  if (scan) return scanLabel(scan);
  return loading ? 'Loading scans...' : 'None';
}
