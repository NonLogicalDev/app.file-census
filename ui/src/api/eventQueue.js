const DEFAULT_BATCH_SIZE = 50;

export function createAsyncEventQueue({
  dispatch,
  batchSize = DEFAULT_BATCH_SIZE,
  schedule = (callback) => window.setTimeout(callback, 0),
  cancel = (handle) => window.clearTimeout(handle)
}) {
  const queue = [];
  let scheduledHandle = null;

  function scheduleFlush() {
    if (scheduledHandle !== null) return;
    scheduledHandle = schedule(flush);
  }

  function flush() {
    scheduledHandle = null;
    const batch = queue.splice(0, batchSize);
    for (const event of batch) dispatch(event);
    if (queue.length) scheduleFlush();
  }

  return {
    push(event) {
      queue.push(event);
      scheduleFlush();
    },
    clear() {
      queue.length = 0;
      if (scheduledHandle !== null) {
        cancel(scheduledHandle);
        scheduledHandle = null;
      }
    }
  };
}
