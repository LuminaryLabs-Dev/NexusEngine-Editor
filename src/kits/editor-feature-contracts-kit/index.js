export const EDITOR_FEATURE_CONTRACTS_KIT_ID = "editor-feature-contracts-kit";

const featureSources = Object.freeze({
  sceneRecipes: "local:NexusEngine-Editor/src/editor-domain-model.js",
  dataRegistry: "local:NexusEngine-Editor/src/editor-domain-model.js",
  buildPlacement: "nexusengine/domains/object/placement",
  tokenRegistry: "nexusengine/domains/composition",
  genericInput: "nexusengine/domains/interaction/input",
  selection: "local:NexusEngine-Editor/src/nexus-engine-editor-runtime.js",
  renderer: "local:NexusEngine-Editor/src/viewport-webgl.js",
  sequence: "local:NexusEngine-Editor/src/editor-domain-model.js"
});

export const EDITOR_FEATURE_CONTRACTS = Object.freeze([
  {
    featureId: "top-command-strip",
    label: "Play, Stop, Save, Load, New, Build HTML, Export",
    domainPath: "n:editor:header",
    owningKitId: "editor-command-strip-kit",
    requires: ["n:editor", "n:editor:persistence", "n:build:web", "n:editor:dock:sequence"],
    provides: ["editor:command-strip", "editor:playback-command", "editor:build-command"],
    source: "local:NexusEngine-Editor/src/kits/editor-kits.js"
  },
  {
    featureId: "domain-stack-panel",
    label: "Installed Domain Stack with filtering, map mode, reorder, and CLI commands",
    domainPath: "n:editor:dock:kits",
    owningKitId: "editor-domain-stack-kit",
    requires: ["n:registry", "n:registry:install", "n:registry:health"],
    provides: ["editor:domain-stack", "editor:domain-map", "editor:kit-command-preview"],
    source: "local:NexusEngine-Editor/src/nexus-engine-editor-runtime.js"
  },
  {
    featureId: "registry-kit-picker",
    label: "Registry-backed kit dropdown with dependencies and sub-kit preview",
    domainPath: "n:registry",
    owningKitId: "editor-kit-registry-kit",
    requires: ["n:registry:index", "n:registry:search", "n:registry:dependency"],
    provides: ["editor:kit-picker", "editor:registry-manifest"],
    source: featureSources.tokenRegistry
  },
  {
    featureId: "cli-only-kit-install",
    label: "Browser read-only kit install surface with CLI mutation path",
    domainPath: "n:registry:install",
    owningKitId: "editor-kit-installer-kit",
    requires: ["n:registry", "n:policy:permissions"],
    provides: ["editor:cli-kit-install", "editor:install-plan"],
    source: "local:NexusEngine-Editor/scripts/nexus-engine-editor-cli.mjs"
  },
  {
    featureId: "webgl-viewport",
    label: "Fullscreen WebGL grid, default cube, camera/light markers, and axis widget",
    domainPath: "n:editor:viewport",
    owningKitId: "editor-viewport-kit",
    requires: ["n:render:three", "n:scene", "n:camera"],
    provides: ["editor:webgl-viewport", "editor:viewport-stats"],
    source: featureSources.renderer
  },
  {
    featureId: "viewport-transform-tools",
    label: "Select, Move, Rotate, Scale, and Pan toolbar actions",
    domainPath: "n:editor:selection",
    owningKitId: "editor-selection-kit",
    requires: ["n:scene", "n:input", "n:editor:viewport"],
    provides: ["editor:selection", "editor:viewport-tools"],
    source: featureSources.selection
  },
  {
    featureId: "scene-object-authoring",
    label: "Add cubes, add cube grids, search objects, select rows, duplicate, delete, and edit transforms",
    domainPath: "n:scene",
    owningKitId: "editor-scene-object-kit",
    requires: ["n:editor:composition", "n:editor:selection"],
    provides: ["editor:scene-object", "editor:object-transform", "editor:bulk-grid"],
    source: featureSources.buildPlacement
  },
  {
    featureId: "configure-panel",
    label: "Selected domain, kit, object, and sequence-step inspector",
    domainPath: "n:editor:dock:inspector",
    owningKitId: "editor-configure-panel-kit",
    requires: ["n:editor:dock", "n:scene", "n:editor:selection"],
    provides: ["editor:configure-panel", "editor:inspector"],
    source: "local:NexusEngine-Editor/src/main.js"
  },
  {
    featureId: "scene-presets",
    label: "Arena Blockout, Platform Run, and Physics Stress Grid structured cube layouts",
    domainPath: "n:editor:scene-preset",
    owningKitId: "editor-scene-preset-kit",
    requires: ["n:scene", "n:physics", "n:render:three"],
    provides: ["editor:scene-preset", "editor:role-stamping"],
    source: featureSources.sceneRecipes
  },
  {
    featureId: "game-template-authoring",
    label: "Chess, Target Clicker, Gem Collector, and large preset-backed game templates",
    domainPath: "n:editor:game-template",
    owningKitId: "editor-game-template-kit",
    requires: ["n:registry:install", "n:editor:scene-preset", "n:editor:dock:sequence"],
    provides: ["editor:game-template", "editor:template-scene-data"],
    source: featureSources.dataRegistry
  },
  {
    featureId: "sequence-timeline",
    label: "Add sequence steps and link source kit events to target kit outputs",
    domainPath: "n:editor:dock:sequence",
    owningKitId: "editor-sequence-timeline-kit",
    requires: ["n:registry", "n:editor:domain-stack", "n:editor:selection"],
    provides: ["editor:sequence-timeline", "editor:sequence-graph", "editor:sequence-receipts"],
    source: featureSources.sequence
  },
  {
    featureId: "project-persistence",
    label: "Save, Load, New, and portable .project.json export/import",
    domainPath: "n:persistence",
    owningKitId: "editor-project-persistence-kit",
    requires: ["n:editor:composition", "n:editor:status"],
    provides: ["editor:project-snapshot", "file:project", "save:scene"],
    source: "nexusengine/domains/runtime/persistence"
  },
  {
    featureId: "html-build-export",
    label: "Single-file HTML game build with canvas runtime, stats, culling, and embedded manifest",
    domainPath: "n:build:web",
    owningKitId: "editor-html-build-kit",
    requires: ["n:scene", "n:editor:dock:sequence", "n:persistence"],
    provides: ["editor:html-build", "export:html", "runtime:canvas-3d"],
    source: "local:NexusEngine-Editor/src/dsk-html-builder.js"
  },
  {
    featureId: "runtime-interactions",
    label: "Generic exported click, score, reset, and interaction receipt runtime",
    domainPath: "n:runtime:interaction",
    owningKitId: "editor-runtime-interaction-kit",
    requires: ["n:input", "n:scene", "n:editor:dock:sequence"],
    provides: ["editor:runtime-interaction", "interaction:hit", "score:value"],
    source: featureSources.genericInput
  },
  {
    featureId: "screenshot-mcp",
    label: "Screenshot-backed MCP diagnostic service",
    domainPath: "n:diagnostics",
    owningKitId: "editor-status-kit",
    requires: ["n:editor", "n:build:web"],
    provides: ["editor:screenshot-mcp", "editor:human-view-diagnostic"],
    source: "local:NexusEngine-Editor/scripts/nexus-engine-editor-screenshot-mcp.mjs"
  }
]);

export function listEditorFeatureContracts() {
  return EDITOR_FEATURE_CONTRACTS.map((contract) => ({
    ...contract,
    requires: [...contract.requires],
    provides: [...contract.provides]
  }));
}

export function getEditorFeatureContract(featureId) {
  return listEditorFeatureContracts().find((contract) => contract.featureId === featureId) ?? null;
}

export function validateEditorFeatureContracts(requiredFeatureIds = []) {
  const contracts = listEditorFeatureContracts();
  const byId = new Map(contracts.map((contract) => [contract.featureId, contract]));
  const missing = requiredFeatureIds.filter((featureId) => !byId.has(featureId));
  const invalid = contracts.filter((contract) => (
    !contract.domainPath ||
    !contract.owningKitId ||
    !contract.requires.length ||
    !contract.provides.length ||
    !contract.source
  )).map((contract) => contract.featureId);
  return {
    ok: missing.length === 0 && invalid.length === 0,
    total: contracts.length,
    missing,
    invalid,
    contracts
  };
}
