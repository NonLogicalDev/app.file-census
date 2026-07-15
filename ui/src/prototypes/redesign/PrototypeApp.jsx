import React, { useEffect, useState } from 'react';

import CommandPalette from './CommandPalette.jsx';
import { locations, scans } from './mockData.js';
import PrototypeShell from './PrototypeShell.jsx';
import DuplicatesScreen from './screens/DuplicatesScreen.jsx';
import LocationScreen from './screens/LocationScreen.jsx';
import TasksScreen from './screens/TasksScreen.jsx';
import './shared.css';

const screenComponents = {
  location: LocationScreen,
  duplicates: DuplicatesScreen,
  tasks: TasksScreen
};

export default function PrototypeApp({ screen = 'location' }) {
  const activeScreen = Object.hasOwn(screenComponents, screen) ? screen : 'location';
  const Screen = screenComponents[activeScreen];
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandContext, setCommandContext] = useState({});
  const [commandLocationId, setCommandLocationId] = useState(locations[0]?.id || 'nl-media-01');
  const [commandScanId, setCommandScanId] = useState(scans.find((scan) => scan.locationId === locations[0]?.id && scan.isRepresentative)?.id || scans[0]?.id);
  const [duplicateIntent, setDuplicateIntent] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const onPrototypeCommand = (event) => {
      if (event.detail?.type === 'open-location' && event.detail.locationId) {
        setCommandLocationId(event.detail.locationId);
        setCommandScanId(scans.find((scan) => scan.locationId === event.detail.locationId && scan.isRepresentative)?.id);
      }
      if (event.detail?.type === 'find-exact-duplicates') {
        setDuplicateIntent({
          fileId: event.detail.fileId,
          name: event.detail.name,
          hash: event.detail.hash,
        });
      }
    };
    window.addEventListener('redesign:prototype-command', onPrototypeCommand);
    return () => window.removeEventListener('redesign:prototype-command', onPrototypeCommand);
  }, []);

  return (
    <div data-redesign-prototype data-screen={activeScreen}>
      <PrototypeShell
        activeLocationId={commandLocationId}
        activeScanId={commandScanId}
        onOpenCommands={() => setCommandOpen(true)}
        onSelectScan={(scan) => {
          setCommandLocationId(scan.locationId);
          setCommandScanId(scan.id);
        }}
        screen={activeScreen}
      >
        <Screen
          commandLocationId={commandLocationId}
          commandScanId={commandScanId}
          duplicateIntent={duplicateIntent}
          onClearDuplicateIntent={() => setDuplicateIntent(null)}
          onCommandContextChange={setCommandContext}
        />
      </PrototypeShell>
      <CommandPalette
        context={commandContext}
        onNotice={setNotice}
        onOpenChange={setCommandOpen}
        open={commandOpen}
        screen={activeScreen}
      />
      {notice ? <div aria-atomic="true" aria-live="polite" className="rd-command-notice" role="status">{notice}</div> : null}
    </div>
  );
}
