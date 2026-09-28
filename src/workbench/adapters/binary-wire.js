import { assertBytes, editorError } from '../host-contract.js';
const LIMITS = Object.freeze({ maxBytes: 256 * 1024 * 1024, maxNodes: 200000, maxDepth: 128 });
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function walk(value, encode, options) {
  const limits = { ...LIMITS, ...options };
  for (const limit of Object.values(limits)) if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError('Invalid transport budget.');
  let nodes = 0, bytes = 0;
  const ancestors = new Set();
  function charge(length) {
    bytes += length;
    if (bytes > limits.maxBytes) throw editorError('EDITOR_WIRE_BUDGET', 'Combined binary payload exceeds the byte budget.');
  }
  function visit(item, depth) {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw editorError('EDITOR_WIRE_BUDGET', 'Transport structure exceeds its node/depth budget.');
    if (item === null || item === undefined || typeof item === 'boolean' || typeof item === 'string') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw editorError('EDITOR_WIRE_VALUE', 'Transport numbers must be finite.');
      return item;
    }
    if (typeof item !== 'object') throw editorError('EDITOR_WIRE_VALUE', 'Transport values must be JSON or byte arrays.');
    if (encode && (item instanceof Uint8Array || item instanceof ArrayBuffer)) {
      const input = assertBytes(item, 'transport', limits.maxBytes); charge(input.byteLength);
      let binary = '';
      for (let i = 0; i < input.length; i += 8192) binary += String.fromCharCode(...input.subarray(i, i + 8192));
      return { $editorBytes: 'base64/1', length: input.length, data: btoa(binary) };
    }
    if (ancestors.has(item)) throw editorError('EDITOR_WIRE_CYCLE', 'Transport values cannot be cyclic.');
    if (!encode && Object.hasOwn(item, '$editorBytes')) {
      const { $editorBytes: version, length, data } = item;
      if (version !== 'base64/1' || Object.keys(item).length !== 3 || !Number.isSafeInteger(length) || length < 0 || length > limits.maxBytes || typeof data !== 'string') {
        throw editorError('EDITOR_WIRE_BYTES', 'Invalid binary transport envelope.');
      }
      // Check actual encoded length BEFORE decoding, not just the claimed byte length.
      const expected = Math.ceil(length / 3) * 4;
      if (data.length !== expected || !BASE64.test(data)) throw editorError('EDITOR_WIRE_BYTES', 'Binary length or base64 syntax is invalid.');
      const decodedLength = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      if (decodedLength !== length) throw editorError('EDITOR_WIRE_BYTES', 'Binary length does not match its envelope.');
      charge(length);
      let decoded;
      try { decoded = atob(data); } catch { throw editorError('EDITOR_WIRE_BYTES', 'Malformed base64 data.'); }
      if (btoa(decoded) !== data) throw editorError('EDITOR_WIRE_BYTES', 'Base64 is not canonically encoded.');
      return Uint8Array.from(decoded, c => c.charCodeAt(0));
    }
    if (Object.hasOwn(item, '$editorBytes')) throw editorError('EDITOR_WIRE_BYTES', 'Binary-envelope keys are reserved for transport.');
    if (!Array.isArray(item) && ![null, Object.prototype].includes(Object.getPrototypeOf(item))) throw editorError('EDITOR_WIRE_VALUE', 'Unsupported transport object type.');
    ancestors.add(item);
    try {
      return Array.isArray(item) ? item.map(v => visit(v, depth + 1))
        : Object.fromEntries(Object.entries(item).map(([k, v]) => [k, visit(v, depth + 1)]));
    } finally { ancestors.delete(item); }
  }
  return visit(value, 0);
}
/** Explicit, bounded binary envelope used only at the local HTTP transport boundary. */
export const encodeWire = (value, options = {}) => walk(value, true, options);
export const decodeWire = (value, options = {}) => walk(value, false, options);
