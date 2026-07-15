import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import {
  notificationCloseClassName,
  notificationLayerClassName,
  notificationTextClassName,
  notificationToastClassName
} from './ui/index.jsx';

const DEFAULT_TTL_MS = 7000;
const ERROR_TTL_MS = 12000;

export default function NotificationLayer({ message }) {
  const [notifications, setNotifications] = useState([]);
  const lastMessageRef = useRef('');
  const timeoutsRef = useRef(new Map());

  useEffect(() => () => {
    for (const timeout of timeoutsRef.current.values()) window.clearTimeout(timeout);
    timeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!message || message === lastMessageRef.current) return undefined;
    lastMessageRef.current = message;
    const notification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: message,
      variant: notificationVariant(message)
    };
    setNotifications((current) => [...current.slice(-3), notification]);
    const ttl = notification.variant === 'error' ? ERROR_TTL_MS : DEFAULT_TTL_MS;
    const timeout = window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      timeoutsRef.current.delete(notification.id);
    }, ttl);
    timeoutsRef.current.set(notification.id, timeout);
    return undefined;
  }, [message]);

  if (!notifications.length) return null;

  return (
    <section className={notificationLayerClassName} aria-live="polite" aria-label="Notifications">
      {notifications.map((notification) => (
        <article
          className={notificationToastClassName({ variant: notification.variant })}
          key={notification.id}
          role={notification.variant === 'error' ? 'alert' : 'status'}
        >
          <span className={notificationTextClassName}>{notification.text}</span>
          <button
            type="button"
            className={notificationCloseClassName}
            aria-label="Dismiss notification"
            title="Dismiss notification"
            onClick={() => {
              const timeout = timeoutsRef.current.get(notification.id);
              if (timeout) window.clearTimeout(timeout);
              timeoutsRef.current.delete(notification.id);
              setNotifications((current) => current.filter((item) => item.id !== notification.id));
            }}
          >
            <Icon name="close" />
          </button>
        </article>
      ))}
    </section>
  );
}

export function notificationVariant(message = '') {
  const text = message.toLowerCase();
  if (/\b(error|failed|failure|unable|cannot|can't)\b/.test(text)) return 'error';
  if (/\b(stop|stopped|warning|before deleting|unsafe)\b/.test(text)) return 'warning';
  if (/\b(saved|started|built|updated|deleted|removed|set|cleared|enabled|disabled|using database)\b/.test(text)) return 'success';
  return 'info';
}
