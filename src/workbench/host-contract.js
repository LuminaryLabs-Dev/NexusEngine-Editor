/** One transport-neutral contract consumed by the workbench GUI. */
export const HOST_SCHEMA = "nexusengine.editor-host/1";
export const AVAILABILITY = Object.freeze({
  available: "available", unsupported: "unsupported", local: "requires-local-host",
});
export function editorError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}
export function assertHost(host) {
  for (const method of ["state", "execute", "preview", "dispose"]) {
    if (typeof host?.[method] !== "function") throw new TypeError(`Editor host requires ${method}().`);
  }
  return host;
}
export function capabilitiesFor(environment, { persistent = true, build = false, storage = null } = {}) {
  const available = (reason = "") => ({ status: AVAILABILITY.available, reason });
  return Object.freeze({
    environment,
    storage: available(storage === "memory" ? "Core memory storage (session only)" : environment === "browser" ? "Core IndexedDB storage" : "Core filesystem storage"),
    save: persistent ? available() : { status: AVAILABILITY.unsupported, reason: "No persistent project target." },
    create: available(), import: available(), export: available(), play: available("Isolated preview runtime; not a physics-solver proof."),
    build: build ? available("Local Core Build toolchains are checked when planning.") : {
      status: AVAILABILITY.local, reason: "Core Build uses local toolchains. Open the project in the local host to build.",
    },
  });
}
export function assertBytes(value, label = "artifact", maxBytes = 256 * 1024 * 1024) {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes || bytes.byteLength > maxBytes) throw editorError("EDITOR_BYTES", `${label} must contain bounded byte data.`);
  return bytes;
}
export function cleanRelativePath(path) {
  if (typeof path !== "string" || !path || /^[a-z][a-z0-9+.-]*:/i.test(path) || /[\\\x00-\x1f]/.test(path) || path.split("/").some(p => !p || p === "." || p === "..")) {
    throw editorError("EDITOR_RESOURCE_PATH", "Resource paths must be safe relative paths.");
  }
  return path;
}
/** Errors are data at a transport boundary, not silent fallbacks. */
export function errorRecord(error) {
  return { code: error?.code ?? "EDITOR_ERROR", message: error?.message ?? String(error), details: error?.details ?? {} };
}

/** Source replacement and accepted previews obey the same Play guard on both transports. */
const SOURCE_COMMANDS = new Set([
  'create', 'execute', 'accept', 'undo', 'redo', 'load', 'new-project', 'open-project',
  'import', 'import-commit', 'workbench-import-commit', 'create-validation-game',
  'composition-ensure', 'composition-add-kit', 'composition-remove-kit',
  'composition-configure', 'composition-enable',
]);
export function assertSourceCommandAllowed(method, playState) {
  if (SOURCE_COMMANDS.has(method) && playState !== 'stopped') {
    throw editorError('EDITOR_SOURCE_PROTECTED', 'Stop Play before changing or replacing source.');
  }
}
