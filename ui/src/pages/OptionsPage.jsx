import {
  Button,
  cardClassName,
  emptyTextClassName,
  mutedInlineClassName,
  pageGridClassName,
  pageHeaderClassName
} from '../components/ui/index.jsx';
import { Icon } from '../components/Icon.jsx';

export default function OptionsPage({
  databaseInfo,
  canChooseDatabase,
  busy,
  onChooseDatabase
}) {
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
    </section>
  );
}
