import { editorError } from './host-contract.js';

/** Freeze a command at submission and serialize it; shutdown rejects new work immediately. */
export function createCommandQueue(dispatch, { maxPending = 64 } = {}) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new TypeError('Invalid queue capacity.');
  let tail = Promise.resolve(), closing = false, pending = 0, closePromise = null;
  function execute(method, params = {}) {
    if (closing) return Promise.reject(editorError('EDITOR_HOST_CLOSED', 'Editor host is closing or disposed.'));
    if (typeof method !== 'string' || !method.trim()) return Promise.reject(editorError('EDITOR_COMMAND', 'A command method is required.'));
    if (pending >= maxPending) return Promise.reject(editorError('EDITOR_QUEUE_FULL', 'Editor command queue is full.'));
    // Signals are live capabilities, not source documents; everything else is copied now.
    let input;
    try {
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw new TypeError('Command parameters must be an object.');
      const { signal, ...data } = params;
      input = structuredClone(data);
      if (signal !== undefined) {
        if (!(signal instanceof AbortSignal)) throw new TypeError('signal must be an AbortSignal.');
        input.signal = signal;
      }
    } catch (error) { return Promise.reject(editorError('EDITOR_COMMAND_INPUT', error.message)); }
    pending++;
    const job = tail.then(() => {
      if (input.signal?.aborted) throw editorError('EDITOR_CANCELLED', 'Command cancelled before execution.');
      return dispatch(method, input);
    });
    tail = job.then(() => { pending--; }, () => { pending--; });
    return job;
  }
  return Object.freeze({
    execute,
    idle: () => tail,
    close(cleanup = () => {}) {
      if (!closePromise) { closing = true; closePromise = tail.then(cleanup); }
      return closePromise;
    },
    get pending() { return pending; },
    get closing() { return closing; },
  });
}
