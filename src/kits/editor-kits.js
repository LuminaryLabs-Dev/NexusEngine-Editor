import { createEditorProject, createSequencePlaybackState } from "../editor-domain-model.js";
import { createEditorKitInstallSurface } from "../editor-kit-registry.js";
import { EDITOR_FEATURE_CONTRACTS_KIT_ID } from "./editor-feature-contracts-kit/index.js";

export const EDITOR_KITS = Object.freeze([
  { id: "editor-root-kit", domainPath: "n:editor", label: "Editor Root", role: "root" },
  { id: "editor-viewport-kit", domainPath: "n:editor:viewport", label: "3D Viewport", role: "full-3d-scene-viewport" },
  { id: "editor-command-strip-kit", domainPath: "n:editor:header", label: "Command Strip", role: "play-stop-save-build-export" },
  { id: "editor-overlay-panel-kit", domainPath: "n:editor:dock", label: "Docked Workspace System", role: "fixed-workspace-shell" },
  { id: "editor-domain-stack-kit", domainPath: "n:editor:dock:kits", label: "Domain Stack Panel", role: "left-domain-stack" },
  { id: "editor-configure-panel-kit", domainPath: "n:editor:dock:inspector", label: "Configure Panel", role: "right-configure" },
  { id: "editor-sequence-timeline-kit", domainPath: "n:editor:dock:sequence", label: "Sequence Timeline", role: "bottom-sequence" },
  { id: "editor-scene-preset-kit", domainPath: "n:editor:scene-preset", label: "Scene Presets", role: "mass-scene-authoring" },
  { id: "editor-game-template-kit", domainPath: "n:editor:game-template", label: "Game Templates", role: "massive-game-authoring" },
  { id: "editor-runtime-interaction-kit", domainPath: "n:runtime:interaction", label: "Runtime Interaction", role: "exported-clickable-interactions" },
  { id: "editor-project-persistence-kit", domainPath: "n:editor:persistence", label: "Project Persistence", role: "save-load-project-snapshots" },
  { id: "editor-selection-kit", domainPath: "n:editor:selection", label: "Selection", role: "viewport-domain-selection" },
  { id: EDITOR_FEATURE_CONTRACTS_KIT_ID, domainPath: "n:editor:feature-contracts", label: "Feature Contracts", role: "dsk-feature-ownership" },
  { id: "editor-status-kit", domainPath: "n:editor:status", label: "Status", role: "project-health" }
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
  const domainKitSurface = createEditorKitInstallSurface();
  return {
    mode: "stopped",
    configureSubject: "domain",
    selectedDomainPath: "n:physics",
    selectedSequenceStepId: "step-02",
    selectedObjectId: "cube-01",
    domainStackView: {
      mode: "stack",
      query: "",
      health: "all"
    },
    sceneObjectView: {
      query: "",
      limit: 100,
      batchSize: 25,
      presetId: "arena-blockout-preset"
    },
    gameTemplateView: {
      selectedTemplateId: "chess-board-template",
      lastAppliedTemplateId: "",
      lastObjectCount: 0,
      lastSequenceStepIds: []
    },
    kitPicker: {
      open: false,
      query: "",
      category: "",
      selectedKitId: "spatial-authoring-kits",
      lastInstallPlan: null
    },
    compositionUi: {
      addOpen: false,
      addKind: "domain",
      addQuery: "",
      selectedRegistryId: "",
      message: ""
    },
    viewportTool: {
      active: "select",
      nudgeStep: 0.25,
      rotateStep: 15,
      scaleStep: 0.1,
      lastAction: ""
    },
    workspaceUi: {
      timelineExpanded: false,
      inspectorOpen: true,
      projectActionsOpen: false,
      activeContext: "structure",
      structureWidth: 270,
      inspectorWidth: 320,
      contextWidth: 320,
      behaviorHeight: 260,
      compactContextHeight: 300
    },
    viewportRenderStats: {
      renderer: "webgl",
      culling: "distance-window",
      totalObjects: 1,
      drawnObjects: 1,
      culledObjects: 0,
      maxDrawnObjects: 700,
      frame: 0
    },
    projectPersistence: {
      status: "idle",
      storageKey: "nexusengine-editor:project-snapshot",
      lastSavedAt: "",
      lastLoadedAt: "",
      lastExportedAt: "",
      lastImportedAt: "",
      lastExportFileName: "",
      lastImportFileName: "",
      exportBytes: 0,
      importBytes: 0,
      lastExportJson: "",
      bytes: 0
    },
    project: createEditorProject(),
    sequencePlayback: createSequencePlaybackState(),
    build: {
      status: "idle",
      html: "",
      fileName: "",
      bytes: 0
    },
    events: [],
    kitRegistry,
    domainKitRegistry: domainKitSurface.registry,
    domainKitInstaller: domainKitSurface.installer
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
