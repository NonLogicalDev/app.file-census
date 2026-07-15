import { Icon } from './Icon.jsx';
import { Button, ModalSurface, Toolbar } from './ui/index.jsx';
import { modalOverlayClassName } from './ui/surfaceClasses.js';

const actionToolbarClassName = 'detail-actions !items-start !gap-3 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none';

export function Modal({ children }) {
  return <div className={modalOverlayClassName}>{children}</div>;
}

export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, busy }) {
  return (
    <Modal>
      <ModalSurface className="gap-3">
        <h2>{title}</h2>
        <p className="text-muted-strong leading-[1.45]">{body}</p>
        <Toolbar className={actionToolbarClassName}>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy} icon={<Icon name="delete" />}>{confirmLabel}</Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} icon={<Icon name="back" />}>Cancel</Button>
        </Toolbar>
      </ModalSurface>
    </Modal>
  );
}
