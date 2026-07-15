export const DEFAULT_RPC_TIMEOUT_MS = 30_000;

export function createPendingRpc(
  pendingMap,
  id,
  {
    timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout
  } = {}
) {
  let timeoutId = null;
  const promise = new Promise((resolve, reject) => {
    const entry = {
      resolve: (value) => {
        if (timeoutId !== null) clearTimeoutImpl(timeoutId);
        pendingMap.delete(id);
        resolve(value);
      },
      reject: (error) => {
        if (timeoutId !== null) clearTimeoutImpl(timeoutId);
        pendingMap.delete(id);
        reject(error);
      }
    };
    timeoutId = setTimeoutImpl(() => {
      if (pendingMap.get(id) === entry) {
        pendingMap.delete(id);
        reject(new Error(`RPC timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    pendingMap.set(id, entry);
  });
  return promise;
}

export function settlePendingRpc(pendingMap, message) {
  const pending = pendingMap.get(message.id);
  if (!pending) return false;
  if (message.error) pending.reject(new Error(message.error.message || 'RPC failed'));
  else pending.resolve(message.result);
  return true;
}

export function cancelPendingRpc(pendingMap, id, error = new Error('RPC cancelled')) {
  const pending = pendingMap.get(id);
  if (!pending) return false;
  pending.reject(error);
  return true;
}

export function rejectAllPendingRpc(pendingMap, error) {
  for (const pending of pendingMap.values()) pending.reject(error);
  pendingMap.clear();
}
