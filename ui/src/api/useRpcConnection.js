import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriRuntime } from './desktopDatabase.js';
import { createAsyncEventQueue } from './eventQueue.js';
import { abortError, invokeNativeRpc } from './nativeRpc.js';
import { cancelPendingRpc, createPendingRpc, rejectAllPendingRpc, settlePendingRpc } from './rpcPending.js';

export function useRpcConnection({ onEvent, onOpen }) {
  const [status, setStatus] = useState('connecting');
  const [statusDetail, setStatusDetail] = useState('');
  const socketRef = useRef(null);
  const tauriInvokeRef = useRef(null);
  const pendingRef = useRef(new Map());
  const waitersRef = useRef([]);
  const nextIdRef = useRef(1);
  const eventRef = useRef(onEvent);
  const openRef = useRef(onOpen);
  const eventQueueRef = useRef(null);

  if (!eventQueueRef.current) {
    eventQueueRef.current = createAsyncEventQueue({
      dispatch: (appEvent) => eventRef.current?.(appEvent)
    });
  }

  useEffect(() => {
    eventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    openRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    let closing = false;
    let reconnectTimer = null;
    const tauriRuntime = isTauriRuntime();

    if (tauriRuntime) {
      let unlisten = null;
      setStatus('connecting');
      setStatusDetail('');
      Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event')
      ]).then(async ([coreApi, eventApi]) => {
        if (closing) return;
        tauriInvokeRef.current = coreApi.invoke;
        unlisten = await eventApi.listen('app-event', (event) => {
          eventQueueRef.current?.push({ kind: event.payload.kind, payload: event.payload.payload });
        });
        setStatus('live');
        setStatusDetail('');
        for (const waiter of waitersRef.current) waiter.resolve();
        waitersRef.current = [];
        openRef.current?.();
        eventQueueRef.current?.push({ kind: 'connected', payload: {} });
      }).catch((error) => {
        setStatus('reconnecting');
        setStatusDetail(error?.message || String(error));
        for (const waiter of waitersRef.current) waiter.reject(error);
        waitersRef.current = [];
      });

      return () => {
        closing = true;
        eventQueueRef.current?.clear();
        if (unlisten) unlisten();
      };
    }

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/events`);
      socketRef.current = socket;
      setStatus('connecting');
      setStatusDetail('');

      socket.addEventListener('open', () => {
        setStatus('live');
        setStatusDetail('');
        for (const waiter of waitersRef.current) waiter.resolve();
        waitersRef.current = [];
        openRef.current?.();
      });

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== undefined) {
          settlePendingRpc(pendingRef.current, message);
          return;
        }
        if (message.method === 'event') eventQueueRef.current?.push(message.params);
      });

      socket.addEventListener('close', () => {
        setStatus('reconnecting');
        setStatusDetail('WebSocket disconnected');
        rejectAllPendingRpc(pendingRef.current, new Error('WebSocket disconnected'));
        for (const waiter of waitersRef.current) waiter.reject(new Error('WebSocket disconnected'));
        waitersRef.current = [];
        if (!closing) reconnectTimer = window.setTimeout(connect, 1200);
      });

      socket.addEventListener('error', () => {
        setStatus('reconnecting');
        setStatusDetail('WebSocket error');
      });
    }

    connect();
    return () => {
      closing = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      eventQueueRef.current?.clear();
      socketRef.current?.close();
    };
  }, []);

  const waitForRpc = useCallback(() => {
    if (isTauriRuntime() && tauriInvokeRef.current) return Promise.resolve();
    if (socketRef.current?.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => waitersRef.current.push({ resolve, reject }));
  }, []);

  const rpc = useCallback(async (method, params = {}, options = {}) => {
    const { signal } = options;
    if (signal?.aborted) throw abortError();
    await waitForRpc();
    if (isTauriRuntime()) {
      return invokeNativeRpc(tauriInvokeRef.current, {
        requestId: `native-${nextIdRef.current++}`,
        method,
        params,
        signal
      });
    }
    if (signal?.aborted) throw abortError();
    const id = nextIdRef.current++;
    const payload = { jsonrpc: '2.0', id, method, params };
    const promise = createPendingRpc(pendingRef.current, id);
    let abortHandler = null;
    if (signal) {
      abortHandler = () => {
        const error = abortError();
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          const cancelId = nextIdRef.current++;
          socketRef.current.send(JSON.stringify({
            jsonrpc: '2.0',
            id: cancelId,
            method: 'rpc.cancel',
            params: { id }
          }));
        }
        cancelPendingRpc(pendingRef.current, id, error);
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    socketRef.current.send(JSON.stringify(payload));
    try {
      return await promise;
    } finally {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  }, [waitForRpc]);

  return { rpc, status, statusDetail };
}
