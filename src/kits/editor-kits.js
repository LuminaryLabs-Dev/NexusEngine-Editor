export const EDITOR_KITS = Object.freeze([
  { id: "n-editor-kit", domainPath: "n:editor", label: "Editor Root", role: "root" },
  { id: "n-editor-viewport-kit", domainPath: "n:editor:viewport", label: "Viewport", role: "full-game-viewport" },
  { id: "n-editor-header-kit", domainPath: "n:editor:header", label: "Header", role: "play-stop-save-build" },
  { id: "n-editor-dock-kit", domainPath: "n:editor:dock", label: "Dock System", role: "dock-shell" },
  { id: "n-editor-kits-dock-kit", domainPath: "n:editor:dock:kits", label: "Kits Dock", role: "left-dock" },
  { id: "n-editor-inspector-dock-kit", domainPath: "n:editor:dock:inspector", label: "Inspector Dock", role: "right-dock" },
  { id: "n-editor-proof-dock-kit", domainPath: "n:editor:dock:proof", label: "Proof Dock", role: "bottom-dock" },
  { id: "n-editor-selection-kit", domainPath: "n:editor:selection", label: "Selection", role: "viewport-selection" },
  { id: "n-editor-status-kit", domainPath: "n:editor:status", label: "Status", role: "project-health" }
]);

export function createEditorKitRegistry(kits = EDITOR_KITS) {
  const byPath = new Map(kits.map((kit) => [kit.domainPath, Object.freeze({ ...kit })]));
  return Object.freeze({
    list() { return Array.from(byPath.values()); },
    get(domainPath) { return byPath.get(domainPath) ?? null; },
    has(domainPath) { return byPath.has(domainPath); }
  });
}

export function createEditorState() {
  const kitRegistry = createEditorKitRegistry();
  return {
    mode: "stopped",
    selectedDomainPath: "n:editor:viewport",
    build: {
      status: "idle",
      html: "",
      fileName: "",
      bytes: 0
    },
    docks: {
      kits: "hidden",
      inspector: "hidden",
      proof: "hidden"
    },
    events: [],
    kitRegistry
  };
}

export function recordEditorEvent(state, type, payload = {}) {
  const event = {
    domainPath: payload.domainPath ?? "n:editor",
    type,
    severity: payload.severity ?? "info",
    timestamp: new Date().toISOString(),
    payload
  };
  state.events.push(event);
  return event;
}
