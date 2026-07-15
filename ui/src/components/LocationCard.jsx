import { statusLabel, when } from '../utils/format.js';

export default function LocationCard({ location, selected, onSelect }) {
  return (
    <button type="button" className={`location-card${selected ? ' selected' : ''}${location.disabled ? ' disabled-location' : ''}`} onClick={onSelect}>
      <div>
        <strong><span className={`location-led${location.connected ? ' connected' : ''}`} title={livenessTitle(location)} />{location.slug}</strong>
        <span>{location.name}</span>
      </div>
      <code>{location.root_path}</code>
      {location.notes && <p className="location-note-preview">{location.notes}</p>}
      <div className="location-stats">
        <span>{location.scanCount} scans</span>
        <span>{location.connected ? 'connected' : 'offline'}</span>
        {location.disabled && <span className="disabled-location-badge">disabled for dupes</span>}
        <span>{location.activeScan ? statusLabel(location.activeScan.status) : 'idle'}</span>
        <span>Rep: {location.representativeScan ? when(location.representativeScan.started_at) : 'latest good'}</span>
        <span>Last good: {when(location.lastSuccessfulScan?.finished_at)}</span>
      </div>
    </button>
  );
}

function livenessTitle(location) {
  return location.connected
    ? `Connected - checked ${when(location.liveness_checked_at)}`
    : `Disconnected - ${location.liveness_error || 'unreachable'}`;
}
