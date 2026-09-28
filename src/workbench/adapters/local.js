import { editorError, assertBytes } from "../host-contract.js";
import { encodeWire, decodeWire } from "./binary-wire.js";
export function createLocalWorkbenchAdapter({ baseUrl = globalThis.location?.href, fetchImpl = globalThis.fetch, timeoutMs = 120000 } = {}) {
  const base = new URL(baseUrl); let disposed = false;
  const pending = new Set();
  async function request(path, options = {}) {
    if (disposed) throw editorError("EDITOR_HOST_CLOSED", "Local adapter is disposed.");
    const controller = new AbortController(); pending.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(path, base), { cache: "no-store", ...options, signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw editorError(payload.error?.code ?? "EDITOR_HTTP", payload.error?.message ?? `Local host returned HTTP ${response.status}.`, payload.error?.details);
      return decodeWire(payload.result ?? payload);
    } finally { clearTimeout(timer); pending.delete(controller); }
  }
  return Object.freeze({
    state: () => request("./state"),
    execute: (method, params = {}) => request("./api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), method, params: encodeWire(params) }) }),
    async preview({ play = false } = {}) {
      const artifact = await request("./api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), method: play ? "runtime-preview" : "preview-artifact", params: {} }) });
      assertBytes(artifact.bytes); return artifact;
    },
    async dispose() { if (disposed) return; try { await request("./api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), method: "stop", params: {} }) }); } finally { disposed = true; for (const controller of pending) controller.abort(); pending.clear(); } },
  });
}
