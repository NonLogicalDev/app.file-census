import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeNativeRpc } from './nativeRpc.js';

test('native rpc abort rejects locally without sending an unregistered cancel command', async () => {
  const calls = [];
  let resolveRpc = null;
  const controller = new AbortController();
  const promise = invokeNativeRpc(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === 'rpc') {
        return new Promise((resolve) => {
          resolveRpc = resolve;
        });
      }
      throw new Error(`unexpected native command: ${command}`);
    },
    {
      requestId: 'native-7',
      method: 'scans.tree',
      params: { scan_id: 'scan-1', path: '' },
      signal: controller.signal
    }
  );

  controller.abort();

  await assert.rejects(
    promise,
    (error) => error?.name === 'AbortError' && error?.message === 'RPC cancelled'
  );
  assert.deepEqual(calls, [
    {
      command: 'rpc',
      payload: {
        requestId: 'native-7',
        method: 'scans.tree',
        params: { scan_id: 'scan-1', path: '' }
      }
    }
  ]);

  resolveRpc?.({ ignored: true });
  await new Promise((resolve) => setImmediate(resolve));
});
