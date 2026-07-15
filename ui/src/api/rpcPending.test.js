import assert from 'node:assert/strict';
import test from 'node:test';

import { cancelPendingRpc, createPendingRpc, rejectAllPendingRpc, settlePendingRpc } from './rpcPending.js';

test('pending rpc resolves and clears its timeout entry', async () => {
  const pending = new Map();
  const cleared = [];
  const promise = createPendingRpc(pending, 7, {
    setTimeoutImpl: () => 'timer-7',
    clearTimeoutImpl: (timer) => cleared.push(timer)
  });

  assert.equal(pending.has(7), true);
  assert.equal(settlePendingRpc(pending, { id: 7, result: { ok: true } }), true);
  assert.deepEqual(await promise, { ok: true });
  assert.equal(pending.has(7), false);
  assert.deepEqual(cleared, ['timer-7']);
});

test('pending rpc rejects when the timeout fires', async () => {
  const pending = new Map();
  let timeoutCallback = null;
  const promise = createPendingRpc(pending, 8, {
    timeoutMs: 5,
    setTimeoutImpl: (callback) => {
      timeoutCallback = callback;
      return 'timer-8';
    },
    clearTimeoutImpl: () => {}
  });

  timeoutCallback();
  await assert.rejects(promise, /RPC timed out after 5ms/);
  assert.equal(pending.has(8), false);
});

test('rejects all pending rpc requests on disconnect', async () => {
  const pending = new Map();
  const first = createPendingRpc(pending, 1, {
    setTimeoutImpl: () => 'timer-1',
    clearTimeoutImpl: () => {}
  });
  const second = createPendingRpc(pending, 2, {
    setTimeoutImpl: () => 'timer-2',
    clearTimeoutImpl: () => {}
  });

  rejectAllPendingRpc(pending, new Error('WebSocket disconnected'));

  await assert.rejects(first, /WebSocket disconnected/);
  await assert.rejects(second, /WebSocket disconnected/);
  assert.equal(pending.size, 0);
});

test('cancels one pending rpc request', async () => {
  const pending = new Map();
  const cleared = [];
  const promise = createPendingRpc(pending, 9, {
    setTimeoutImpl: () => 'timer-9',
    clearTimeoutImpl: (timer) => cleared.push(timer)
  });

  assert.equal(cancelPendingRpc(pending, 9, new Error('cancelled')), true);
  assert.equal(settlePendingRpc(pending, { id: 9, result: { stale: true } }), false);

  await assert.rejects(promise, /cancelled/);
  assert.equal(pending.has(9), false);
  assert.deepEqual(cleared, ['timer-9']);
});
