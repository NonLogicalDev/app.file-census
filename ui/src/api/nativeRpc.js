export function invokeNativeRpc(invoke, { requestId, method, params = {}, signal } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    let settled = false;
    let abortHandler = null;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      callback(value);
    };

    abortHandler = () => {
      void invoke('rpc_cancel', { requestId }).catch(() => {});
      finish(reject, abortError());
    };

    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    invoke('rpc', { requestId, method, params })
      .then((value) => finish(resolve, value))
      .catch((error) => finish(reject, error));
  });
}

export function abortError() {
  if (typeof DOMException !== 'undefined') return new DOMException('RPC cancelled', 'AbortError');
  const error = new Error('RPC cancelled');
  error.name = 'AbortError';
  return error;
}
