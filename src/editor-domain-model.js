import { listEditorFeatureContracts, validateEditorFeatureContracts } from "./kits/editor-feature-contracts-kit/index.js";

const DEFAULT_VECTOR = Object.freeze({ x: 0, y: 0, z: 0 });

export const ADDABLE_DOMAIN_KITS = Object.freeze([
  {
    id: "audio-feedback-domain-kit",
    domain: "audio-feedback",
    domainPath: "n:audio-feedback",
    label: "Audio Feedback",
    subtitle: "Audio event descriptors",
    status: "experimental",
    provides: ["n:audio-feedback", "audio:feedback"],
    events: ["audioFeedback.cued"],
    config: {
      enabled: true,
      events: ["audioFeedback.cued"],
      outputs: ["audio:feedback"]
    }
  },
  {
    id: "composition-planning-domain-kit",
    domain: "composition-planning",
    domainPath: "n:composition-planning",
    label: "Composition Planning",
    subtitle: "Install plans and dependency gaps",
    status: "experimental",
    requires: ["domain:capability-graph"],
    provides: ["domain:composition-planning", "domain:install-plan"],
    events: ["compositionPlanning.planned", "compositionPlanning.validated"],
    config: {
      enabled: true,
      events: ["compositionPlanning.planned", "compositionPlanning.validated"],
      outputs: ["domain:install-plan"]
    }
  },
  {
    id: "persistence-domain-service-kit",
    domain: "persistence",
    domainPath: "n:persistence",
    label: "Persistence",
    subtitle: "Project file snapshots",
    status: "experimental",
    provides: ["n:persistence", "save:scene", "file:project"],
    events: ["persistence.saved", "persistence.loaded", "persistence.exported", "persistence.imported"],
    config: {
      enabled: true,
      events: ["persistence.saved", "persistence.loaded", "persistence.exported", "persistence.imported"],
      outputs: ["save:scene", "file:project"]
    }
  }
]);

export const SCENE_AUTHORING_PRESETS = Object.freeze([
  {
    id: "arena-blockout-preset",
    label: "Arena Blockout",
    subtitle: "Floor, cover, spawn, and goal markers",
    defaultCount: 96,
    componentName: "arenaBlockout",
    domainKits: ["n:scene"],
    colors: ["#64748b", "#475569", "#334155", "#22c55e", "#f59e0b"]
  },
  {
    id: "platform-run-preset",
    label: "Platform Run",
    subtitle: "Sequenced traversal lane",
    defaultCount: 64,
    componentName: "platformRun",
    domainKits: ["n:scene", "n:input"],
    colors: ["#60a5fa", "#93c5fd", "#2563eb", "#22c55e", "#f59e0b"]
  },
  {
    id: "physics-stress-grid-preset",
    label: "Physics Stress Grid",
    subtitle: "Dense rigidbody test field",
    defaultCount: 256,
    componentName: "physicsStress",
    domainKits: ["n:scene", "n:physics"],
    colors: ["#d1d5db", "#fca5a5", "#fcd34d", "#86efac", "#93c5fd"]
  }
]);

export const GAME_AUTHORING_TEMPLATES = Object.freeze([
  {
    id: "chess-board-template",
    label: "Chess Board",
    subtitle: "Engine-authored chess board with 64 squares, 32 pieces, move sequencing, and HTML export",
    projectTitle: "Nexus Chess",
    domainPath: "n:game:chess",
    sceneFactory: "chess-board",
    replaceScene: true,
    replaceSequence: true,
    defaultCount: 96,
    installBundles: ["spatial-authoring-kits"],
    installKitIds: [
      "generic-input-actions-kit",
      "selection-domain-service-kit",
      "transform-domain-service-kit",
      "audio-feedback-domain-kit"
    ],
    domainManifests: [
      {
        id: "chess-rules-domain-kit",
        domain: "game:chess",
        domainPath: "n:game:chess",
        label: "Chess Rules",
        subtitle: "Board state, turns, legal moves, check, and mate state",
        status: "experimental",
        type: "editor-game-domain-kit",
        category: "Game Logic",
        requires: ["n:selection", "n:input"],
        provides: ["chess:board-state", "chess:legal-moves", "chess:move"],
        events: ["chess.square.selected", "chess.piece.selected", "chess.move.requested", "chess.move.resolved"],
        config: {
          enabled: true,
          sideToMove: "white",
          events: ["chess.square.selected", "chess.piece.selected", "chess.move.requested", "chess.move.resolved"],
          outputs: ["chess:board-state", "chess:legal-moves", "chess:move"]
        }
      }
    ],
    objectDomainKits: [
      "n:scene",
      "n:selection",
      "n:transform",
      "n:input",
      "n:game:chess"
    ],
    build: { maxDrawnObjects: 128, culling: "none" },
    viewport: { viewportMaxDrawnObjects: 128, viewportCulling: "none" },
    sequenceLinks: [
      {
        label: "select.piece",
        domainPath: "n:input",
        event: "input:pointer",
        targetDomainPath: "n:game:chess",
        targetOutput: "chess:legal-moves"
      },
      {
        label: "resolve.move",
        domainPath: "n:game:chess",
        event: "chess.move.requested",
        targetDomainPath: "n:transform",
        targetOutput: "spatial:transform"
      },
      {
        label: "move.feedback",
        domainPath: "n:game:chess",
        event: "chess.move.resolved",
        targetDomainPath: "n:audio-feedback",
        targetOutput: "audio:feedback"
      },
      {
        label: "export.board",
        domainPath: "n:audio-feedback",
        event: "audioFeedback.cued",
        targetDomainPath: "n:build:web",
        targetOutput: "export:html"
      }
    ]
  },
  {
    id: "target-clicker-template",
    label: "Target Clicker",
    subtitle: "Small 3D target range with clickable targets, scoring state, hit receipts, and HTML export",
    projectTitle: "Nexus Target Clicker",
    domainPath: "n:game:target-clicker",
    sceneFactory: "target-clicker",
    replaceScene: true,
    replaceSequence: true,
    defaultCount: 14,
    installBundles: ["spatial-authoring-kits"],
    installKitIds: [
      "generic-input-actions-kit",
      "selection-domain-service-kit",
      "transform-domain-service-kit",
      "audio-feedback-domain-kit"
    ],
    domainManifests: [
      {
        id: "runtime-interaction-domain-kit",
        domain: "runtime:interaction",
        domainPath: "n:runtime:interaction",
        label: "Runtime Interaction",
        subtitle: "Generic object click, score, receipt, and reset state",
        status: "experimental",
        type: "editor-runtime-domain-kit",
        category: "Runtime",
        requires: ["n:input", "n:selection"],
        provides: ["interaction:state", "interaction:hit-test", "score:value", "round:complete"],
        events: ["interaction.hit", "score.changed", "round.complete"],
        config: {
          enabled: true,
          events: ["interaction.hit", "score.changed", "round.complete"],
          outputs: ["interaction:state", "interaction:hit-test", "score:value", "round:complete"]
        }
      },
      {
        id: "target-clicker-domain-kit",
        domain: "game:target-clicker",
        domainPath: "n:game:target-clicker",
        label: "Target Clicker Rules",
        subtitle: "Hit testing, score state, target lifecycle, and round completion",
        status: "experimental",
        type: "editor-game-domain-kit",
        category: "Game Logic",
        requires: ["n:selection", "n:input"],
        provides: ["target:state", "target:hit-test", "score:value", "round:complete"],
        events: ["target.spawned", "target.hit", "score.changed", "round.complete"],
        config: {
          enabled: true,
          targetCount: 12,
          scorePerTarget: 10,
          events: ["target.spawned", "target.hit", "score.changed", "round.complete"],
          outputs: ["target:state", "target:hit-test", "score:value", "round:complete"]
        }
      }
    ],
    objectDomainKits: [
      "n:scene",
      "n:selection",
      "n:transform",
      "n:input",
      "n:runtime:interaction",
      "n:game:target-clicker"
    ],
    build: { maxDrawnObjects: 96, culling: "none" },
    viewport: { viewportMaxDrawnObjects: 96, viewportCulling: "none" },
    sequenceLinks: [
      {
        label: "aim.pointer",
        domainPath: "n:input",
        event: "input:pointer",
        targetDomainPath: "n:runtime:interaction",
        targetOutput: "interaction:hit-test"
      },
      {
        label: "score.hit",
        domainPath: "n:runtime:interaction",
        event: "interaction.hit",
        targetDomainPath: "n:game:target-clicker",
        targetOutput: "score:value"
      },
      {
        label: "hit.feedback",
        domainPath: "n:game:target-clicker",
        event: "score.changed",
        targetDomainPath: "n:audio-feedback",
        targetOutput: "audio:feedback"
      },
      {
        label: "round.export",
        domainPath: "n:game:target-clicker",
        event: "round.complete",
        targetDomainPath: "n:build:web",
        targetOutput: "export:html"
      }
    ]
  },
  {
    id: "gem-collector-template",
    label: "Gem Collector",
    subtitle: "Small collectible game proving generic runtime clickable interactions",
    projectTitle: "Nexus Gem Collector",
    domainPath: "n:game:gem-collector",
    sceneFactory: "gem-collector",
    replaceScene: true,
    replaceSequence: true,
    defaultCount: 14,
    installBundles: ["spatial-authoring-kits"],
    installKitIds: [
      "generic-input-actions-kit",
      "selection-domain-service-kit",
      "transform-domain-service-kit",
      "audio-feedback-domain-kit"
    ],
    domainManifests: [
      {
        id: "runtime-interaction-domain-kit",
        domain: "runtime:interaction",
        domainPath: "n:runtime:interaction",
        label: "Runtime Interaction",
        subtitle: "Generic object click, score, receipt, and reset state",
        status: "experimental",
        type: "editor-runtime-domain-kit",
        category: "Runtime",
        requires: ["n:input", "n:selection"],
        provides: ["interaction:state", "interaction:hit-test", "score:value", "round:complete"],
        events: ["interaction.hit", "score.changed", "round.complete"],
        config: {
          enabled: true,
          events: ["interaction.hit", "score.changed", "round.complete"],
          outputs: ["interaction:state", "interaction:hit-test", "score:value", "round:complete"]
        }
      },
      {
        id: "gem-collector-domain-kit",
        domain: "game:gem-collector",
        domainPath: "n:game:gem-collector",
        label: "Gem Collector Rules",
        subtitle: "Collectible state, score value, and round completion",
        status: "experimental",
        type: "editor-game-domain-kit",
        category: "Game Logic",
        requires: ["n:runtime:interaction"],
        provides: ["gem:state", "score:value", "round:complete"],
        events: ["gem.spawned", "gem.collected", "score.changed", "round.complete"],
        config: {
          enabled: true,
          gemCount: 12,
          events: ["gem.spawned", "gem.collected", "score.changed", "round.complete"],
          outputs: ["gem:state", "score:value", "round:complete"]
        }
      }
    ],
    objectDomainKits: [
      "n:scene",
      "n:selection",
      "n:transform",
      "n:input",
      "n:runtime:interaction",
      "n:game:gem-collector"
    ],
    build: { maxDrawnObjects: 96, culling: "none" },
    viewport: { viewportMaxDrawnObjects: 96, viewportCulling: "none" },
    sequenceLinks: [
      {
        label: "collect.pointer",
        domainPath: "n:input",
        event: "input:pointer",
        targetDomainPath: "n:runtime:interaction",
        targetOutput: "interaction:hit-test"
      },
      {
        label: "collect.gem",
        domainPath: "n:runtime:interaction",
        event: "interaction.hit",
        targetDomainPath: "n:game:gem-collector",
        targetOutput: "score:value"
      },
      {
        label: "collect.feedback",
        domainPath: "n:runtime:interaction",
        event: "score.changed",
        targetDomainPath: "n:audio-feedback",
        targetOutput: "audio:feedback"
      },
      {
        label: "collect.export",
        domainPath: "n:runtime:interaction",
        event: "round.complete",
        targetDomainPath: "n:build:web",
        targetOutput: "export:html"
      }
    ]
  },
  {
    id: "massive-defense-arena-template",
    label: "Massive Defense Arena",
    subtitle: "Physics arena with combat, status, audio, and export sequencing",
    projectTitle: "Massive Defense Arena",
    domainPath: "n:game:massive-defense-arena",
    presetId: "physics-stress-grid-preset",
    defaultCount: 640,
    installBundles: ["spatial-authoring-kits"],
    installKitIds: [
      "generic-defense-session-command-kit",
      "damage-health-domain-kit",
      "status-effect-domain-kit",
      "audio-feedback-domain-kit"
    ],
    objectDomainKits: [
      "n:physics",
      "n:generic-defense-session-command",
      "n:damage-health",
      "n:status-effect"
    ],
    build: { maxDrawnObjects: 180, culling: "distance-window" },
    viewport: { viewportMaxDrawnObjects: 160, viewportCulling: "distance-window" },
    sequenceLinks: [
      {
        label: "session.command",
        domainPath: "n:generic-defense-session-command",
        event: "sessionCommand.issued",
        targetDomainPath: "n:damage-health",
        targetOutput: "combat:health"
      },
      {
        label: "damage.feedback",
        domainPath: "n:damage-health",
        event: "damageHealth.applied",
        targetDomainPath: "n:audio-feedback",
        targetOutput: "audio:feedback"
      },
      {
        label: "audio.export",
        domainPath: "n:audio-feedback",
        event: "audioFeedback.cued",
        targetDomainPath: "n:build:web",
        targetOutput: "export:html"
      }
    ]
  },
  {
    id: "streaming-terrain-cargo-template",
    label: "Streaming Terrain Cargo",
    subtitle: "Terrain bands, vegetation placement, route cargo, and HTML export",
    projectTitle: "Streaming Terrain Cargo",
    domainPath: "n:game:streaming-terrain-cargo",
    presetId: "arena-blockout-preset",
    defaultCount: 720,
    installBundles: ["spatial-authoring-kits"],
    installKitIds: [
      "banded-infinite-terrain-kit",
      "vegetation-placement-domain-kit",
      "generic-route-cargo-extraction-kit",
      "audio-feedback-domain-kit"
    ],
    objectDomainKits: [
      "n:banded-infinite-terrain",
      "n:terrain-height",
      "n:route-clearance",
      "n:vegetation-placement",
      "n:route-cargo-extraction"
    ],
    build: { maxDrawnObjects: 220, culling: "distance-window" },
    viewport: { viewportMaxDrawnObjects: 180, viewportCulling: "distance-window" },
    sequenceLinks: [
      {
        label: "terrain.tick",
        domainPath: "n:banded-infinite-terrain",
        event: "on:tick",
        targetDomainPath: "n:vegetation-placement",
        targetOutput: "vegetation:placement"
      },
      {
        label: "cargo.route",
        domainPath: "n:vegetation-placement",
        event: "vegetationPlacement.placed",
        targetDomainPath: "n:route-cargo-extraction",
        targetOutput: "objective:cargo-extraction"
      },
      {
        label: "cargo.feedback",
        domainPath: "n:route-cargo-extraction",
        event: "cargo.delivered",
        targetDomainPath: "n:audio-feedback",
        targetOutput: "audio:feedback"
      },
      {
        label: "feedback.export",
        domainPath: "n:audio-feedback",
        event: "audioFeedback.cued",
        targetDomainPath: "n:build:web",
        targetOutput: "export:html"
      }
    ]
  }
]);

export const DEFAULT_EDITOR_PROJECT = Object.freeze({
  title: "Starter 3D Scene",
  domainPath: "n:game:starter",
  version: "0.2.0",
  viewport: {
    mode: "3d",
    width: 1280,
    height: 720,
    background: "#0b1420",
    gridSize: 24
  },
  scene3d: {
    title: "Starter Scene",
    units: "meters",
    camera: {
      id: "camera-main",
      label: "Main Camera",
      position: { x: -4.4, y: 3.1, z: 5.2 },
      target: { ...DEFAULT_VECTOR }
    },
    light: {
      id: "sun-key",
      label: "Key Light",
      type: "directional",
      intensity: 1
    },
    objects: [
      {
        id: "cube-01",
        label: "Default Cube",
        type: "mesh:cube",
        selected: true,
        transform: {
          position: { ...DEFAULT_VECTOR, y: 1 },
          rotation: { ...DEFAULT_VECTOR },
          scale: { x: 1, y: 1, z: 1 }
        },
        material: {
          color: "#d1d5db",
          roughness: 0.58,
          metallic: 0.06
        },
        domainKits: ["n:scene"],
        components: {
          transform: { domainPath: "n:scene" }
        }
      }
    ]
  },
  domainStack: [
    { id: "domain-scene", domainPath: "n:scene", label: "Starter Scene", subtitle: "Scene Root", status: "ready" },
    { id: "domain-render-three", domainPath: "n:render:three", label: "Three Renderer", subtitle: "Render Engine", status: "ready" },
    { id: "domain-camera", domainPath: "n:camera", label: "Camera System", subtitle: "Orbit Camera", status: "ready" },
    { id: "domain-input", domainPath: "n:input", label: "Input System", subtitle: "Pointer + Keys", status: "ready" },
    { id: "domain-physics", domainPath: "n:physics", label: "Physics Engine", subtitle: "Rigidbodies + Queries", status: "attention" },
    {
      id: "domain-persistence",
      kitId: "persistence-domain-service-kit",
      domain: "persistence",
      domainPath: "n:persistence",
      label: "Persistence",
      subtitle: "Project Files",
      status: "ready",
      type: "domain-service-kit",
      category: "Project",
      provides: ["n:persistence", "save:scene", "file:project"],
      events: ["persistence.saved", "persistence.loaded", "persistence.exported", "persistence.imported"]
    },
    { id: "domain-build-web", domainPath: "n:build:web", label: "Web Build", subtitle: "Single HTML Export", status: "ready" }
  ],
  kitConfigs: {
    "n:scene": {
      enabled: true,
      events: ["on:load"],
      outputs: ["out:scene"]
    },
    "n:render:three": {
      enabled: true,
      renderer: "webgl",
      antialias: true,
      viewportMaxDrawnObjects: 700,
      viewportCulling: "distance-window",
      events: ["on:frame"],
      outputs: ["out:frame"]
    },
    "n:camera": {
      enabled: true,
      mode: "orbit",
      events: ["on:orbit", "on:focus"],
      outputs: ["out:view"]
    },
    "n:input": {
      enabled: true,
      events: ["input:pointer", "input:key"],
      outputs: ["out:command"]
    },
    "n:physics": {
      enabled: true,
      gravity: { x: 0, y: -9.81, z: 0 },
      collider: "AABB",
      substeps: 4,
      events: ["on:collide", "on:trigger", "on:rest"],
      outputs: ["out:velocity"]
    },
    "n:persistence": {
      enabled: true,
      target: "local-and-file",
      events: ["persistence.saved", "persistence.loaded", "persistence.exported", "persistence.imported"],
      outputs: ["save:scene", "file:project"]
    },
    "n:build:web": {
      enabled: true,
      target: "single-html",
      renderer: "canvas-3d",
      maxDrawnObjects: 600,
      culling: "distance-window",
      events: ["build:start", "build:finish"],
      outputs: ["export:html"]
    }
  },
  sequenceSteps: [
    { id: "step-01", order: 1, domainPath: "n:input", label: "input.pointer", event: "input:pointer", targetDomainPath: "n:camera", targetOutput: "out:view", target: "camera.orbit" },
    { id: "step-02", order: 2, domainPath: "n:physics", label: "physics.tick", event: "on:collide", targetDomainPath: "n:render:three", targetOutput: "out:frame", target: "render.frame" },
    { id: "step-03", order: 3, domainPath: "n:build:web", label: "build.web", event: "build:start", targetDomainPath: "n:build:web", targetOutput: "export:html", target: "export.html" }
  ]
});

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function listSceneAuthoringPresets() {
  return clone(SCENE_AUTHORING_PRESETS);
}

export function getSceneAuthoringPreset(id) {
  return SCENE_AUTHORING_PRESETS.find((preset) => preset.id === id) ?? SCENE_AUTHORING_PRESETS[0];
}

export function listGameAuthoringTemplates() {
  return clone(GAME_AUTHORING_TEMPLATES);
}

export function getGameAuthoringTemplate(id) {
  return GAME_AUTHORING_TEMPLATES.find((template) => template.id === id) ?? GAME_AUTHORING_TEMPLATES[0];
}

export function createSequencePlaybackState(project = DEFAULT_EDITOR_PROJECT) {
  const firstStep = project.sequenceSteps?.[0] ?? null;
  return {
    status: "idle",
    activeStepId: firstStep?.id ?? "",
    lastStepId: "",
    runCount: 0,
    receipts: []
  };
}

export function normalizeSequencePlaybackState(project = DEFAULT_EDITOR_PROJECT, input = {}) {
  const validStepIds = new Set((project.sequenceSteps ?? []).map((step) => step.id));
  const fallback = createSequencePlaybackState(project);
  const receipts = Array.isArray(input.receipts)
    ? input.receipts.filter((receipt) => validStepIds.has(receipt.stepId)).slice(-20).map(clone)
    : [];
  return {
    status: ["idle", "running", "complete", "blocked"].includes(input.status) ? input.status : fallback.status,
    activeStepId: validStepIds.has(input.activeStepId) ? input.activeStepId : fallback.activeStepId,
    lastStepId: validStepIds.has(input.lastStepId) ? input.lastStepId : "",
    runCount: Math.max(0, Math.floor(Number(input.runCount) || receipts.length)),
    receipts
  };
}

export function normalizeBuildRuntimeConfig(project = DEFAULT_EDITOR_PROJECT) {
  const config = project.kitConfigs?.["n:build:web"] ?? {};
  const renderer = config.renderer === "dom-cubes" ? "dom-cubes" : "canvas-3d";
  const culling = ["distance-window", "none"].includes(config.culling) ? config.culling : "distance-window";
  return {
    renderer,
    maxDrawnObjects: Math.max(25, Math.min(2000, Math.floor(Number(config.maxDrawnObjects) || 600))),
    culling
  };
}

export function normalizeViewportRuntimeConfig(project = DEFAULT_EDITOR_PROJECT) {
  const config = project.kitConfigs?.["n:render:three"] ?? {};
  const renderer = config.renderer === "css-fallback" ? "css-fallback" : "webgl";
  const culling = ["distance-window", "none"].includes(config.viewportCulling) ? config.viewportCulling : "distance-window";
  return {
    renderer,
    maxDrawnObjects: Math.max(25, Math.min(3000, Math.floor(Number(config.viewportMaxDrawnObjects) || 700))),
    culling
  };
}

export function createEditorProject(input = DEFAULT_EDITOR_PROJECT) {
  const project = {
    ...clone(DEFAULT_EDITOR_PROJECT),
    ...clone(input ?? {})
  };
  project.viewport = { ...clone(DEFAULT_EDITOR_PROJECT.viewport), ...(input.viewport ?? {}) };
  project.scene3d = { ...clone(DEFAULT_EDITOR_PROJECT.scene3d), ...(input.scene3d ?? {}) };
  project.scene3d.objects = Array.isArray(input.scene3d?.objects) && input.scene3d.objects.length
    ? clone(input.scene3d.objects)
    : clone(DEFAULT_EDITOR_PROJECT.scene3d.objects);
  project.domainStack = Array.isArray(input.domainStack) && input.domainStack.length
    ? clone(input.domainStack)
    : clone(DEFAULT_EDITOR_PROJECT.domainStack);
  const installedDomainPaths = new Set(project.domainStack.map((domain) => domain.domainPath));
  for (const domain of DEFAULT_EDITOR_PROJECT.domainStack) {
    if (!installedDomainPaths.has(domain.domainPath)) {
      project.domainStack.push(clone(domain));
      installedDomainPaths.add(domain.domainPath);
    }
  }
  project.kitConfigs = {
    ...clone(DEFAULT_EDITOR_PROJECT.kitConfigs),
    ...(input.kitConfigs ? clone(input.kitConfigs) : {})
  };
  project.sequenceSteps = Array.isArray(input.sequenceSteps) && input.sequenceSteps.length
    ? clone(input.sequenceSteps)
    : clone(DEFAULT_EDITOR_PROJECT.sequenceSteps);
  return project;
}

export function createEditorProjectFileName(projectOrSnapshot = DEFAULT_EDITOR_PROJECT) {
  const project = projectOrSnapshot.project ?? projectOrSnapshot;
  const source = project.domainPath || project.title || "nexusengine-project";
  const slug = String(source)
    .trim()
    .replace(/^n:/, "n-")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "nexusengine-project"}.project.json`;
}

export function createEditorProjectSnapshot(project, editorState = {}) {
  return {
    version: "0.1.0",
    savedAt: new Date().toISOString(),
    project: clone(project),
    selection: {
      configureSubject: ["domain", "object", "sequence-step"].includes(editorState.configureSubject) ? editorState.configureSubject : "domain",
      domainPath: editorState.selectedDomainPath ?? "n:scene",
      sequenceStepId: editorState.selectedSequenceStepId ?? project.sequenceSteps?.[0]?.id ?? "",
      objectId: editorState.selectedObjectId ?? project.scene3d?.objects?.[0]?.id ?? ""
    },
    panelPositions: {},
    domainStackView: clone(editorState.domainStackView ?? {}),
    sceneObjectView: clone(editorState.sceneObjectView ?? {}),
    gameTemplateView: clone(editorState.gameTemplateView ?? {}),
    viewportTool: clone(editorState.viewportTool ?? {}),
    sequencePlayback: normalizeSequencePlaybackState(project, editorState.sequencePlayback ?? {})
  };
}

export function applyEditorProjectSnapshot(editorState, snapshot = {}) {
  const project = createEditorProject(snapshot.project ?? DEFAULT_EDITOR_PROJECT);
  editorState.project = project;
  editorState.selectedDomainPath = snapshot.selection?.domainPath && project.domainStack.some((domain) => domain.domainPath === snapshot.selection.domainPath)
    ? snapshot.selection.domainPath
    : project.domainStack[0]?.domainPath ?? "n:scene";
  editorState.selectedSequenceStepId = snapshot.selection?.sequenceStepId && project.sequenceSteps.some((step) => step.id === snapshot.selection.sequenceStepId)
    ? snapshot.selection.sequenceStepId
    : project.sequenceSteps[0]?.id ?? "";
  editorState.selectedObjectId = snapshot.selection?.objectId && project.scene3d.objects.some((object) => object.id === snapshot.selection.objectId)
    ? snapshot.selection.objectId
    : project.scene3d.objects[0]?.id ?? "";
  editorState.configureSubject = ["domain", "object", "sequence-step"].includes(snapshot.selection?.configureSubject)
    ? snapshot.selection.configureSubject
    : editorState.selectedDomainPath === "n:scene" ? "object" : "domain";
  selectSceneObject(project, editorState.selectedObjectId);
  editorState.panelPositions = {};
  editorState.domainStackView = {
    mode: snapshot.domainStackView?.mode === "map" ? "map" : "stack",
    query: String(snapshot.domainStackView?.query ?? ""),
    health: ["all", "ready", "attention", "missing"].includes(snapshot.domainStackView?.health) ? snapshot.domainStackView.health : "all"
  };
  editorState.sceneObjectView = {
    query: String(snapshot.sceneObjectView?.query ?? ""),
    limit: Math.max(1, Math.min(1000, Number(snapshot.sceneObjectView?.limit) || 100)),
    batchSize: Math.max(1, Math.min(1000, Number(snapshot.sceneObjectView?.batchSize) || 25)),
    presetId: getSceneAuthoringPreset(snapshot.sceneObjectView?.presetId)?.id ?? SCENE_AUTHORING_PRESETS[0].id
  };
  editorState.gameTemplateView = {
    selectedTemplateId: getGameAuthoringTemplate(snapshot.gameTemplateView?.selectedTemplateId)?.id ?? GAME_AUTHORING_TEMPLATES[0].id,
    lastAppliedTemplateId: String(snapshot.gameTemplateView?.lastAppliedTemplateId ?? ""),
    lastObjectCount: Math.max(0, Math.floor(Number(snapshot.gameTemplateView?.lastObjectCount) || 0)),
    lastSequenceStepIds: Array.isArray(snapshot.gameTemplateView?.lastSequenceStepIds) ? snapshot.gameTemplateView.lastSequenceStepIds.map(String) : []
  };
  editorState.viewportTool = {
    active: ["select", "move", "rotate", "scale", "pan"].includes(snapshot.viewportTool?.active) ? snapshot.viewportTool.active : "select",
    nudgeStep: Math.max(0.01, Math.min(10, Number(snapshot.viewportTool?.nudgeStep) || 0.25)),
    rotateStep: Math.max(1, Math.min(90, Number(snapshot.viewportTool?.rotateStep) || 15)),
    scaleStep: Math.max(0.01, Math.min(1, Number(snapshot.viewportTool?.scaleStep) || 0.1)),
    lastAction: String(snapshot.viewportTool?.lastAction ?? "")
  };
  editorState.sequencePlayback = normalizeSequencePlaybackState(project, snapshot.sequencePlayback ?? {});
  return project;
}

export function getSelectedDomain(project, domainPath) {
  return project.domainStack.find((domain) => domain.domainPath === domainPath) ?? project.domainStack[0] ?? null;
}

export function getKitConfig(project, domainPath) {
  if (!project.kitConfigs[domainPath]) {
    project.kitConfigs[domainPath] = {
      enabled: true,
      events: ["on:tick"],
      outputs: ["out:value"]
    };
  }
  return project.kitConfigs[domainPath];
}

export function getSceneObject(project, objectId) {
  return project.scene3d.objects.find((object) => object.id === objectId) ?? project.scene3d.objects[0] ?? null;
}

export function selectSceneObject(project, objectId) {
  const selected = getSceneObject(project, objectId);
  for (const object of project.scene3d.objects) object.selected = object.id === selected?.id;
  return selected;
}

function nextSceneObjectIndex(project) {
  const used = new Set(project.scene3d.objects.map((object) => object.id));
  let index = project.scene3d.objects.length + 1;
  while (used.has(`cube-${String(index).padStart(2, "0")}`)) index += 1;
  return index;
}

export function appendSceneObject(project) {
  const index = nextSceneObjectIndex(project);
  const lane = (index - 1) % 5;
  const row = Math.floor((index - 1) / 5);
  const colors = ["#d1d5db", "#93c5fd", "#86efac", "#fcd34d", "#fca5a5"];
  const object = {
    id: `cube-${String(index).padStart(2, "0")}`,
    label: `Cube ${index}`,
    type: "mesh:cube",
    selected: true,
    transform: {
      position: { x: (lane - 2) * 1.9, y: 1, z: -row * 1.9 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    material: {
      color: colors[(index - 1) % colors.length],
      roughness: 0.58,
      metallic: 0.06
    },
    domainKits: ["n:scene"],
    components: {
      transform: { domainPath: "n:scene" }
    }
  };
  for (const existing of project.scene3d.objects) existing.selected = false;
  project.scene3d.objects.push(object);
  return object;
}

export function appendSceneObjectGroup(project, count = 25) {
  const total = Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)));
  const added = [];
  const startCount = project.scene3d.objects.length;
  const projectedTotal = startCount + total;
  const columns = Math.min(32, Math.max(5, Math.ceil(Math.sqrt(projectedTotal))));
  const spacing = projectedTotal >= 250 ? 0.72 : 1.15;
  const scale = projectedTotal >= 250 ? 0.34 : 0.55;
  for (let index = 0; index < total; index += 1) {
    const object = appendSceneObject(project);
    const slot = startCount + index;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    object.transform.position = {
      x: (column - (columns - 1) / 2) * spacing,
      y: scale,
      z: -2.2 - row * spacing
    };
    object.transform.scale = { x: scale, y: scale, z: scale };
    added.push(object);
  }
  return added;
}

function getPresetRole(preset, index, total) {
  if (index === 0) return "spawn";
  if (index === total - 1) return "goal";
  if (preset.id === "platform-run-preset") return index % 8 === 0 ? "checkpoint" : "platform";
  if (preset.id === "physics-stress-grid-preset") return index % 9 === 0 ? "rigidbody-column" : "rigidbody";
  return index % 11 === 0 ? "cover" : "floor";
}

function getPresetPosition(preset, index, total) {
  const dense = total >= 250;
  if (preset.id === "platform-run-preset") {
    const lane = index % 8;
    const row = Math.floor(index / 8);
    return {
      x: (lane - 3.5) * 0.92,
      y: 0.36,
      z: -2 - row * 0.88
    };
  }
  const columns = Math.min(dense ? 42 : 24, Math.max(6, Math.ceil(Math.sqrt(total))));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const spacing = dense ? 0.58 : 0.82;
  return {
    x: (column - (columns - 1) / 2) * spacing,
    y: dense ? 0.24 : 0.34,
    z: -2.2 - row * spacing
  };
}

export function appendScenePreset(project, presetId = SCENE_AUTHORING_PRESETS[0].id, options = {}) {
  const preset = getSceneAuthoringPreset(presetId);
  const total = Math.max(1, Math.min(1000, Math.floor(Number(options.count) || preset.defaultCount || 25)));
  const added = [];
  const sequence = (project.scene3d.authoringPresets?.length ?? 0) + 1;
  const presetRunId = `${preset.id}-run-${String(sequence).padStart(2, "0")}`;
  const scale = total >= 250 ? 0.24 : total >= 100 ? 0.3 : 0.42;
  for (let index = 0; index < total; index += 1) {
    const object = appendSceneObject(project);
    const role = getPresetRole(preset, index, total);
    const position = getPresetPosition(preset, index, total);
    object.label = `${preset.label} ${String(index + 1).padStart(3, "0")}`;
    object.transform.position = position;
    object.transform.scale = { x: scale, y: scale, z: scale };
    object.material.color = preset.colors[index % preset.colors.length];
    object.domainKits = Array.from(new Set([...(object.domainKits ?? []), ...(preset.domainKits ?? [])]));
    object.components ??= {};
    object.components.scenePreset = {
      domainPath: "n:editor:scene-preset",
      presetId: preset.id,
      presetRunId,
      role,
      order: index + 1
    };
    object.components[preset.componentName] = {
      domainPath: "n:scene",
      role,
      presetRunId
    };
    if (object.domainKits.includes("n:physics")) {
      object.components.physics = {
        ...(object.components.physics ?? {}),
        domainPath: "n:physics",
        enabled: true,
        body: role === "rigidbody-column" ? "static" : "dynamic"
      };
    }
    added.push(object);
  }
  project.scene3d.authoringPresets ??= [];
  project.scene3d.authoringPresets.push({
    id: presetRunId,
    presetId: preset.id,
    label: preset.label,
    count: added.length,
    objectIds: added.map((object) => object.id),
    domainKits: clone(preset.domainKits ?? [])
  });
  return added;
}

function uniqueDomainPaths(items = []) {
  return Array.from(new Set(items.filter((item) => typeof item === "string" && item.startsWith("n:"))));
}

function createRuntimeClickableComponent(config = {}) {
  return {
    domainPath: "n:runtime:interaction",
    sourceDomainPath: config.sourceDomainPath ?? "n:input",
    targetDomainPath: config.targetDomainPath ?? "n:runtime:interaction",
    event: config.event ?? "interaction.hit",
    completeEvent: config.completeEvent ?? "round.complete",
    output: config.output ?? "score:value",
    completeOutput: config.completeOutput ?? "round:complete",
    points: Math.max(0, Math.floor(Number(config.points) || 0)),
    stateKey: config.stateKey ?? "hitObjectIds",
    singleUse: config.singleUse !== false,
    label: config.label ?? "Interaction Target",
    kind: config.kind ?? "target"
  };
}

const CHESS_FILES = Object.freeze(["a", "b", "c", "d", "e", "f", "g", "h"]);
const CHESS_BACK_RANK = Object.freeze(["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"]);
const CHESS_PIECE_SCALE = Object.freeze({
  pawn: { x: 0.26, y: 0.42, z: 0.26 },
  rook: { x: 0.34, y: 0.56, z: 0.34 },
  knight: { x: 0.32, y: 0.64, z: 0.32 },
  bishop: { x: 0.3, y: 0.72, z: 0.3 },
  queen: { x: 0.38, y: 0.86, z: 0.38 },
  king: { x: 0.42, y: 0.96, z: 0.42 }
});

function chessSquare(fileIndex, rank) {
  return `${CHESS_FILES[fileIndex]}${rank}`;
}

function chessPosition(fileIndex, rank) {
  return {
    x: (fileIndex - 3.5) * 0.82,
    z: (rank - 1 - 3.5) * 0.82
  };
}

function titleCase(value) {
  return String(value).slice(0, 1).toUpperCase() + String(value).slice(1);
}

function appendChessBoardScene(project, templateRunId) {
  const added = [];
  const boardObjectIds = [];
  const pieceObjectIds = [];
  const domainKits = ["n:scene", "n:selection", "n:transform", "n:input", "n:game:chess"];
  for (let rank = 1; rank <= 8; rank += 1) {
    for (let fileIndex = 0; fileIndex < CHESS_FILES.length; fileIndex += 1) {
      const square = chessSquare(fileIndex, rank);
      const position = chessPosition(fileIndex, rank);
      const dark = (fileIndex + rank) % 2 === 0;
      const object = appendSceneObject(project);
      object.label = `Square ${square}`;
      object.transform.position = { x: position.x, y: 0.03, z: position.z };
      object.transform.scale = { x: 0.78, y: 0.06, z: 0.78 };
      object.material = {
        color: dark ? "#475569" : "#d1d5db",
        roughness: 0.72,
        metallic: 0.02
      };
      object.domainKits = uniqueDomainPaths(domainKits);
      object.components = {
        transform: { domainPath: "n:transform" },
        selectable: { domainPath: "n:selection", selectable: true },
        chessSquare: {
          domainPath: "n:game:chess",
          templateRunId,
          square,
          file: CHESS_FILES[fileIndex],
          rank,
          color: dark ? "dark" : "light"
        },
        gameTemplate: {
          domainPath: "n:editor:game-template",
          templateId: "chess-board-template",
          templateRunId,
          role: "board-square"
        }
      };
      boardObjectIds.push(object.id);
      added.push(object);
    }
  }

  const addPiece = (side, piece, fileIndex, rank) => {
    const square = chessSquare(fileIndex, rank);
    const position = chessPosition(fileIndex, rank);
    const scale = CHESS_PIECE_SCALE[piece] ?? CHESS_PIECE_SCALE.pawn;
    const object = appendSceneObject(project);
    object.label = `${titleCase(side)} ${titleCase(piece)} ${square}`;
    object.transform.position = { x: position.x, y: 0.12 + scale.y / 2, z: position.z };
    object.transform.scale = { ...scale };
    object.material = {
      color: side === "white" ? "#f8fafc" : "#111827",
      roughness: 0.5,
      metallic: 0.08
    };
    object.domainKits = uniqueDomainPaths(domainKits);
    object.components = {
      transform: { domainPath: "n:transform" },
      selectable: { domainPath: "n:selection", selectable: true },
      chessPiece: {
        domainPath: "n:game:chess",
        templateRunId,
        side,
        piece,
        square,
        file: CHESS_FILES[fileIndex],
        rank,
        selected: side === "white" && piece === "king"
      },
      gameTemplate: {
        domainPath: "n:editor:game-template",
        templateId: "chess-board-template",
        templateRunId,
        role: `${side}-${piece}`
      }
    };
    pieceObjectIds.push(object.id);
    added.push(object);
    return object;
  };

  for (let fileIndex = 0; fileIndex < CHESS_FILES.length; fileIndex += 1) {
    addPiece("white", CHESS_BACK_RANK[fileIndex], fileIndex, 1);
    addPiece("white", "pawn", fileIndex, 2);
    addPiece("black", "pawn", fileIndex, 7);
    addPiece("black", CHESS_BACK_RANK[fileIndex], fileIndex, 8);
  }

  const selected = added.find((object) => object.components?.chessPiece?.side === "white" && object.components.chessPiece.piece === "king") ?? added[0] ?? null;
  for (const object of project.scene3d.objects) object.selected = object.id === selected?.id;
  project.scene3d.chess = {
    domainPath: "n:game:chess",
    templateRunId,
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    sideToMove: "white",
    boardObjectCount: boardObjectIds.length,
    pieceObjectCount: pieceObjectIds.length,
    boardObjectIds,
    pieceObjectIds,
    selectedPieceId: selected?.id ?? ""
  };
  return added;
}

function appendTargetClickerScene(project, templateRunId) {
  const added = [];
  const targetObjectIds = [];
  const domainKits = ["n:scene", "n:selection", "n:transform", "n:input", "n:runtime:interaction", "n:game:target-clicker"];
  const addObject = ({ label, role, position, scale, color, components = {} }) => {
    const object = appendSceneObject(project);
    object.label = label;
    object.transform.position = position;
    object.transform.scale = scale;
    object.material = {
      color,
      roughness: 0.48,
      metallic: role === "target" ? 0.12 : 0.04
    };
    object.domainKits = uniqueDomainPaths(domainKits);
    object.components = {
      transform: { domainPath: "n:transform" },
      selectable: { domainPath: "n:selection", selectable: true },
      gameTemplate: {
        domainPath: "n:editor:game-template",
        templateId: "target-clicker-template",
        templateRunId,
        role
      },
      ...components
    };
    added.push(object);
    return object;
  };

  addObject({
    label: "Target Range Backboard",
    role: "range-backboard",
    position: { x: 0, y: 1.8, z: -2.3 },
    scale: { x: 7.4, y: 2.2, z: 0.12 },
    color: "#1e293b",
    components: {
      targetRange: { domainPath: "n:game:target-clicker", templateRunId, role: "backboard" }
    }
  });
  addObject({
    label: "Start Pad",
    role: "start-pad",
    position: { x: 0, y: 0.08, z: 1.25 },
    scale: { x: 1.4, y: 0.12, z: 1.1 },
    color: "#0f766e",
    components: {
      targetStartPad: { domainPath: "n:game:target-clicker", templateRunId, role: "start" }
    }
  });

  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#38bdf8", "#a855f7"];
  for (let index = 0; index < 12; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const points = row === 0 ? 15 : row === 1 ? 10 : 5;
    const object = addObject({
      label: `Target ${String(index + 1).padStart(2, "0")}`,
      role: "target",
      position: {
        x: (column - 1.5) * 1.25,
        y: 2.46 - row * 0.62,
        z: -1.95
      },
      scale: { x: 0.42, y: 0.42, z: 0.16 },
      color: colors[index % colors.length],
      components: {
        targetClickerTarget: {
          domainPath: "n:game:target-clicker",
          templateRunId,
          targetId: `target-${String(index + 1).padStart(2, "0")}`,
          order: index + 1,
          points,
          hit: false
        },
        runtimeClickable: createRuntimeClickableComponent({
          targetDomainPath: "n:game:target-clicker",
          event: "interaction.hit",
          completeEvent: "round.complete",
          output: "score:value",
          completeOutput: "round:complete",
          points,
          label: `Target ${String(index + 1).padStart(2, "0")}`,
          kind: "target"
        })
      }
    });
    targetObjectIds.push(object.id);
  }

  const selected = added.find((object) => object.components?.targetClickerTarget) ?? added[0] ?? null;
  for (const object of project.scene3d.objects) object.selected = object.id === selected?.id;
  project.scene3d.targetClicker = {
    domainPath: "n:game:target-clicker",
    templateRunId,
    targetObjectCount: targetObjectIds.length,
    targetObjectIds,
    scorePerTarget: 10,
    score: 0,
    hitObjectIds: [],
    roundStatus: "ready"
  };
  project.scene3d.runtimeInteraction = {
    domainPath: "n:runtime:interaction",
    templateRunId,
    score: 0,
    hitObjectIds: [],
    roundStatus: "ready",
    targetObjectCount: targetObjectIds.length,
    targetObjectIds,
    events: ["interaction.hit", "score.changed", "round.complete"],
    outputs: ["interaction:state", "score:value", "round:complete"]
  };
  return added;
}

function appendGemCollectorScene(project, templateRunId) {
  const added = [];
  const gemObjectIds = [];
  const domainKits = ["n:scene", "n:selection", "n:transform", "n:input", "n:runtime:interaction", "n:game:gem-collector"];
  const addObject = ({ label, role, position, scale, color, components = {} }) => {
    const object = appendSceneObject(project);
    object.label = label;
    object.transform.position = position;
    object.transform.scale = scale;
    object.material = {
      color,
      roughness: role === "gem" ? 0.26 : 0.58,
      metallic: role === "gem" ? 0.38 : 0.06
    };
    object.domainKits = uniqueDomainPaths(domainKits);
    object.components = {
      transform: { domainPath: "n:transform" },
      selectable: { domainPath: "n:selection", selectable: true },
      gameTemplate: {
        domainPath: "n:editor:game-template",
        templateId: "gem-collector-template",
        templateRunId,
        role
      },
      ...components
    };
    added.push(object);
    return object;
  };

  addObject({
    label: "Collector Floor",
    role: "floor",
    position: { x: 0, y: 0.04, z: -1.2 },
    scale: { x: 5.8, y: 0.08, z: 3.8 },
    color: "#164e63",
    components: {
      collectorFloor: { domainPath: "n:game:gem-collector", templateRunId, role: "floor" }
    }
  });
  addObject({
    label: "Exit Beacon",
    role: "exit",
    position: { x: 0, y: 0.42, z: -3.25 },
    scale: { x: 0.62, y: 0.62, z: 0.62 },
    color: "#facc15",
    components: {
      collectorExit: { domainPath: "n:game:gem-collector", templateRunId, role: "exit" }
    }
  });

  const colors = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa"];
  for (let index = 0; index < 12; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const points = row === 0 ? 25 : row === 1 ? 15 : 10;
    const object = addObject({
      label: `Gem ${String(index + 1).padStart(2, "0")}`,
      role: "gem",
      position: {
        x: (column - 1.5) * 1.05,
        y: 0.55 + row * 0.05,
        z: -0.45 - row * 0.86
      },
      scale: { x: 0.34, y: 0.34, z: 0.34 },
      color: colors[index % colors.length],
      components: {
        gemCollectible: {
          domainPath: "n:game:gem-collector",
          templateRunId,
          gemId: `gem-${String(index + 1).padStart(2, "0")}`,
          order: index + 1,
          points,
          collected: false
        },
        runtimeClickable: createRuntimeClickableComponent({
          targetDomainPath: "n:game:gem-collector",
          event: "interaction.hit",
          completeEvent: "round.complete",
          output: "score:value",
          completeOutput: "round:complete",
          points,
          label: `Gem ${String(index + 1).padStart(2, "0")}`,
          kind: "collectible"
        })
      }
    });
    gemObjectIds.push(object.id);
  }

  const selected = added.find((object) => object.components?.gemCollectible) ?? added[0] ?? null;
  for (const object of project.scene3d.objects) object.selected = object.id === selected?.id;
  project.scene3d.gemCollector = {
    domainPath: "n:game:gem-collector",
    templateRunId,
    gemObjectCount: gemObjectIds.length,
    gemObjectIds,
    score: 0,
    hitObjectIds: [],
    roundStatus: "ready"
  };
  project.scene3d.runtimeInteraction = {
    domainPath: "n:runtime:interaction",
    templateRunId,
    score: 0,
    hitObjectIds: [],
    roundStatus: "ready",
    targetObjectCount: gemObjectIds.length,
    targetObjectIds: gemObjectIds,
    events: ["interaction.hit", "score.changed", "round.complete"],
    outputs: ["interaction:state", "score:value", "round:complete"]
  };
  return added;
}

export function applyGameAuthoringTemplate(project, templateId = GAME_AUTHORING_TEMPLATES[0].id, options = {}) {
  const template = getGameAuthoringTemplate(templateId);
  const total = Math.max(1, Math.min(1000, Math.floor(Number(options.count) || template.defaultCount || 500)));
  project.title = template.projectTitle ?? project.title;
  project.domainPath = template.domainPath ?? project.domainPath;
  if (template.replaceScene) {
    project.scene3d.objects = [];
    project.scene3d.authoringPresets = [];
    project.scene3d.gameTemplates = [];
    delete project.scene3d.chess;
    delete project.scene3d.targetClicker;
    delete project.scene3d.gemCollector;
    delete project.scene3d.runtimeInteraction;
  }
  if (template.replaceSequence) project.sequenceSteps = [];
  for (const manifest of template.domainManifests ?? []) installDomainKitManifest(project, manifest);
  const sequence = (project.scene3d.gameTemplates?.length ?? 0) + 1;
  const templateRunId = `${template.id}-run-${String(sequence).padStart(2, "0")}`;
  const objects = template.sceneFactory === "chess-board"
    ? appendChessBoardScene(project, templateRunId)
    : template.sceneFactory === "target-clicker"
      ? appendTargetClickerScene(project, templateRunId)
      : template.sceneFactory === "gem-collector"
        ? appendGemCollectorScene(project, templateRunId)
    : appendScenePreset(project, template.presetId, { count: total });
  const objectDomainKits = uniqueDomainPaths(template.objectDomainKits ?? []);
  for (const object of objects) {
    object.domainKits = uniqueDomainPaths([...(object.domainKits ?? []), ...objectDomainKits]);
    object.components ??= {};
    object.components.gameTemplate = {
      domainPath: "n:editor:game-template",
      templateId: template.id,
      templateRunId,
      role: object.components.gameTemplate?.role ?? object.components.scenePreset?.role ?? "template-object"
    };
    for (const domainPath of objectDomainKits) {
      const componentName = domainPath.replace(/^n:/, "").replaceAll(":", "-");
      object.components[componentName] = {
        ...(object.components[componentName] ?? {}),
        domainPath,
        enabled: true,
        templateRunId
      };
    }
  }
  project.kitConfigs["n:build:web"] = {
    ...(project.kitConfigs["n:build:web"] ?? {}),
    ...(template.build ?? {})
  };
  project.kitConfigs["n:render:three"] = {
    ...(project.kitConfigs["n:render:three"] ?? {}),
    ...(template.viewport ?? {})
  };
  project.scene3d.gameTemplates ??= [];
  const presetRun = project.scene3d.authoringPresets?.at(-1) ?? null;
  const run = {
    id: templateRunId,
    templateId: template.id,
    label: template.label,
    count: objects.length,
    presetId: template.presetId,
    presetRunId: presetRun?.id ?? "",
    objectIds: objects.map((object) => object.id),
    installBundles: clone(template.installBundles ?? []),
    installKitIds: clone(template.installKitIds ?? []),
    sequenceLabels: (template.sequenceLinks ?? []).map((link) => link.label),
    build: clone(template.build ?? {}),
    viewport: clone(template.viewport ?? {})
  };
  project.scene3d.gameTemplates.push(run);
  return { template: clone(template), objects, run };
}

export function duplicateSceneObject(project, objectId) {
  const source = getSceneObject(project, objectId);
  if (!source) return null;
  const index = nextSceneObjectIndex(project);
  const object = clone(source);
  object.id = `cube-${String(index).padStart(2, "0")}`;
  object.label = `${source.label} Copy`;
  object.selected = true;
  object.transform ??= {};
  object.transform.position ??= { x: 0, y: 1, z: 0 };
  object.transform.position.x = Number(object.transform.position.x ?? 0) + 1.35;
  object.transform.position.z = Number(object.transform.position.z ?? 0) - 1.35;
  for (const existing of project.scene3d.objects) existing.selected = false;
  project.scene3d.objects.push(object);
  return object;
}

export function deleteSceneObject(project, objectId) {
  if (project.scene3d.objects.length <= 1) return getSceneObject(project, objectId);
  const index = project.scene3d.objects.findIndex((object) => object.id === objectId);
  if (index < 0) return null;
  const [removed] = project.scene3d.objects.splice(index, 1);
  const next = project.scene3d.objects[Math.min(index, project.scene3d.objects.length - 1)] ?? project.scene3d.objects[0] ?? null;
  if (next) {
    for (const object of project.scene3d.objects) object.selected = object.id === next.id;
  }
  return removed;
}

export function buildSceneObjectStats(project) {
  const objects = project.scene3d.objects ?? [];
  const kitAssignments = objects.reduce((count, object) => count + (object.domainKits?.length ?? 0), 0);
  const componentAssignments = objects.reduce((count, object) => count + Object.keys(object.components ?? {}).length, 0);
  const typeCounts = objects.reduce((counts, object) => {
    counts[object.type] = (counts[object.type] ?? 0) + 1;
    return counts;
  }, {});
  return {
    objectCount: objects.length,
    kitAssignments,
    componentAssignments,
    typeCounts
  };
}

function sceneObjectMatchesQuery(object, query, looseQuery) {
  if (!query) return true;
  const text = [
    object.id,
    object.label,
    object.type,
    ...(object.domainKits ?? []),
    ...Object.keys(object.components ?? {})
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes(query) || text.replace(/[^a-z0-9]+/g, "").includes(looseQuery);
}

export function getSceneObjectWindow(project, options = {}) {
  const query = String(options.query ?? "").trim().toLowerCase();
  const looseQuery = query.replace(/[^a-z0-9]+/g, "");
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 100));
  const matches = project.scene3d.objects.filter((object) => sceneObjectMatchesQuery(object, query, looseQuery));
  const objects = matches.slice(0, limit);
  return {
    objects,
    totalObjects: project.scene3d.objects.length,
    totalMatched: matches.length,
    limit,
    hiddenCount: Math.max(0, matches.length - objects.length),
    query
  };
}

export function filterSceneObjects(project, options = {}) {
  return getSceneObjectWindow(project, options).objects;
}

export function updateSceneObjectTransform(project, objectId, path, value) {
  const object = getSceneObject(project, objectId);
  if (!object) return null;
  const [group, axis] = path.split(".");
  if (!["position", "rotation", "scale"].includes(group) || !["x", "y", "z"].includes(axis)) return object;
  const next = Number(value);
  if (!Number.isFinite(next)) return object;
  object.transform[group] ??= { x: 0, y: 0, z: 0 };
  object.transform[group][axis] = group === "scale" ? Math.max(0.05, next) : next;
  return object;
}

export function assignDomainKitToObject(project, objectId, domainPath) {
  const object = getSceneObject(project, objectId);
  if (!object || typeof domainPath !== "string" || !domainPath.startsWith("n:")) return null;
  object.domainKits = Array.from(new Set([...(object.domainKits ?? []), domainPath]));
  return object;
}

export function assignDomainKitToObjects(project, objectIds = [], domainPath) {
  const assigned = [];
  const ids = new Set(Array.isArray(objectIds) ? objectIds : []);
  for (const object of project.scene3d.objects) {
    if (!ids.has(object.id)) continue;
    const next = assignDomainKitToObject(project, object.id, domainPath);
    if (next) assigned.push(next);
  }
  return assigned;
}

export function assignComponentToObject(project, objectId, componentName, component = {}) {
  const object = getSceneObject(project, objectId);
  if (!object || typeof componentName !== "string" || componentName.trim().length === 0) return null;
  object.components ??= {};
  object.components[componentName] = {
    ...(object.components[componentName] ?? {}),
    ...component
  };
  return object;
}

export function assignComponentToObjects(project, objectIds = [], componentName, component = {}) {
  const assigned = [];
  const ids = new Set(Array.isArray(objectIds) ? objectIds : []);
  for (const object of project.scene3d.objects) {
    if (!ids.has(object.id)) continue;
    const next = assignComponentToObject(project, object.id, componentName, component);
    if (next) assigned.push(next);
  }
  return assigned;
}

function normalizeInstallableDomainPath(value, fallback = "n:kit") {
  if (typeof value === "string" && value.startsWith("n:")) return value;
  const clean = String(value ?? fallback)
    .replace(/^n:/, "")
    .replace(/[^a-z0-9:.-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `n:${clean || "kit"}`;
}

function domainIdFromPath(domainPath, prefix = "domain") {
  return `${prefix}-${domainPath.replace(/^n:/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

export function installDomainKitManifest(project, manifest = {}) {
  const domainPath = normalizeInstallableDomainPath(manifest.domainPath, manifest.domain ?? manifest.id ?? "kit");
  const existing = project.domainStack.find((domain) => domain.kitId === manifest.id || domain.domainPath === domainPath);
  if (existing) return existing;
  const kit = {
    id: domainIdFromPath(domainPath),
    kitId: manifest.id ?? domainIdFromPath(domainPath, "kit"),
    domain: manifest.domain ?? domainPath.replace(/^n:/, ""),
    domainPath,
    label: manifest.label ?? manifest.id ?? domainPath,
    subtitle: manifest.subtitle ?? manifest.metadata?.purpose ?? "Domain Service Kit",
    status: manifest.status ?? "experimental",
    type: manifest.type ?? "atomic-domain-service-kit",
    category: manifest.category ?? manifest.parentDomain ?? "General",
    parentDomain: manifest.parentDomain ?? null,
    requires: Array.isArray(manifest.requires) ? clone(manifest.requires) : [],
    provides: Array.isArray(manifest.provides) ? clone(manifest.provides) : [],
    resources: Array.isArray(manifest.resources) ? clone(manifest.resources) : [],
    publicApi: Array.isArray(manifest.publicApi) ? clone(manifest.publicApi) : [],
    children: Array.isArray(manifest.children) ? clone(manifest.children) : [],
    path: manifest.path ?? null
  };
  project.domainStack.push(kit);
  project.kitConfigs[kit.domainPath] = manifest.config ? {
    ...clone(manifest.config),
    requires: clone(kit.requires),
    resources: clone(kit.resources),
    publicApi: clone(kit.publicApi),
    children: clone(kit.children),
    sourcePath: kit.path
  } : {
    enabled: true,
    events: Array.isArray(manifest.events) && manifest.events.length ? clone(manifest.events) : ["on:tick"],
    outputs: kit.provides.length ? clone(kit.provides) : ["out:value"],
    requires: clone(kit.requires),
    resources: clone(kit.resources),
    publicApi: clone(kit.publicApi),
    children: clone(kit.children),
    sourcePath: kit.path
  };
  return kit;
}

export function appendDomainKit(project, template = null) {
  const existing = new Set(project.domainStack.map((domain) => domain.domainPath));
  const selected = template ?? ADDABLE_DOMAIN_KITS.find((kit) => !existing.has(kit.domainPath)) ?? ADDABLE_DOMAIN_KITS[0];
  const domainPath = normalizeInstallableDomainPath(selected.domainPath, selected.domain ?? selected.id);
  if (!existing.has(domainPath)) return installDomainKitManifest(project, selected);
  const suffix = `:${project.domainStack.length + 1}`;
  const kit = {
    id: `${domainIdFromPath(domainPath)}${suffix.replaceAll(":", "-")}`,
    kitId: selected.id ?? domainIdFromPath(domainPath, "kit"),
    domain: selected.domain ?? domainPath.replace(/^n:/, ""),
    domainPath: `${domainPath}${suffix}`,
    label: `${selected.label ?? domainPath} ${project.domainStack.length + 1}`,
    subtitle: selected.subtitle ?? "Domain Service Kit",
    status: selected.status ?? "experimental",
    type: selected.type ?? "atomic-domain-service-kit",
    category: selected.category ?? "General",
    parentDomain: selected.parentDomain ?? null,
    requires: Array.isArray(selected.requires) ? clone(selected.requires) : [],
    provides: Array.isArray(selected.provides) ? clone(selected.provides) : [],
    resources: Array.isArray(selected.resources) ? clone(selected.resources) : [],
    publicApi: Array.isArray(selected.publicApi) ? clone(selected.publicApi) : [],
    children: Array.isArray(selected.children) ? clone(selected.children) : [],
    path: selected.path ?? null
  };
  project.domainStack.push(kit);
  project.kitConfigs[kit.domainPath] = selected.config ? clone(selected.config) : {
    enabled: true,
    events: Array.isArray(selected.events) && selected.events.length ? clone(selected.events) : ["on:tick"],
    outputs: kit.provides.length ? clone(kit.provides) : ["out:value"],
    requires: clone(kit.requires),
    resources: clone(kit.resources),
    publicApi: clone(kit.publicApi),
    children: clone(kit.children),
    sourcePath: kit.path
  };
  return kit;
}

export function reorderDomainKit(project, domainPath) {
  const index = project.domainStack.findIndex((domain) => domain.domainPath === domainPath);
  if (index < 0 || project.domainStack.length < 2) return null;
  const nextIndex = index === 0 ? project.domainStack.length - 1 : index - 1;
  const [domain] = project.domainStack.splice(index, 1);
  project.domainStack.splice(nextIndex, 0, domain);
  return domain;
}

export function buildDomainStackHealth(project) {
  const providers = new Set();
  for (const domain of project.domainStack) {
    providers.add(domain.domainPath);
    if (domain.kitId) providers.add(domain.kitId);
    for (const token of domain.provides ?? []) providers.add(token);
  }
  const rows = project.domainStack.map((domain) => {
    const requires = Array.isArray(domain.requires) ? domain.requires : [];
    const provides = Array.isArray(domain.provides) ? domain.provides : [];
    const missingRequires = requires.filter((token) => !providers.has(token));
    const childCount = Array.isArray(domain.children) ? domain.children.length : 0;
    const status = missingRequires.length ? "missing" : domain.status === "attention" ? "attention" : "ready";
    return {
      id: domain.id,
      kitId: domain.kitId ?? domain.id,
      domainPath: domain.domainPath,
      label: domain.label,
      category: domain.category ?? "Core",
      status,
      requires,
      provides,
      missingRequires,
      childCount
    };
  });
  const missingCount = rows.reduce((count, row) => count + row.missingRequires.length, 0);
  return {
    ok: missingCount === 0,
    kitCount: project.domainStack.length,
    providerCount: providers.size,
    missingCount,
    rows
  };
}

export function filterDomainStack(project, options = {}) {
  const query = String(options.query ?? "").trim().toLowerCase();
  const health = options.health ?? "all";
  const rows = buildDomainStackHealth(project).rows;
  return rows.filter((row) => {
    const matchesQuery = !query || [
      row.kitId,
      row.domainPath,
      row.label,
      row.category,
      ...row.requires,
      ...row.provides,
      ...row.missingRequires
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
    const matchesHealth = health === "all" || row.status === health;
    return matchesQuery && matchesHealth;
  });
}

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())));
}

function labelFromDomainPath(domainPath) {
  return String(domainPath ?? "n:kit:step").replace(/^n:/, "").replaceAll(":", ".");
}

function findDomain(project, domainPath) {
  return project.domainStack.find((domain) => domain.domainPath === domainPath) ?? null;
}

export function listDomainEvents(project, domainPath) {
  const domain = findDomain(project, domainPath);
  const config = project.kitConfigs?.[domainPath] ?? {};
  return uniqueStrings([...(domain?.events ?? []), ...(config.events ?? [])]);
}

export function listDomainOutputs(project, domainPath) {
  const domain = findDomain(project, domainPath);
  const config = project.kitConfigs?.[domainPath] ?? {};
  return uniqueStrings([...(config.outputs ?? []), ...(domain?.provides ?? [])]);
}

export function listSequenceEventOptions(project) {
  return project.domainStack.map((domain) => ({
    id: domain.id,
    kitId: domain.kitId ?? domain.id,
    domainPath: domain.domainPath,
    label: domain.label,
    category: domain.category ?? "Core",
    events: listDomainEvents(project, domain.domainPath),
    outputs: listDomainOutputs(project, domain.domainPath)
  }));
}

function getNextDomainWithOutputs(project, domainPath) {
  const index = project.domainStack.findIndex((domain) => domain.domainPath === domainPath);
  if (index < 0 || project.domainStack.length === 0) return project.domainStack[0] ?? null;
  for (let offset = 1; offset <= project.domainStack.length; offset += 1) {
    const candidate = project.domainStack[(index + offset) % project.domainStack.length];
    if (listDomainOutputs(project, candidate.domainPath).length) return candidate;
  }
  return project.domainStack[index] ?? null;
}

function formatSequenceTarget(step) {
  if (step.targetDomainPath && step.targetOutput) {
    return `${labelFromDomainPath(step.targetDomainPath)}.${step.targetOutput}`;
  }
  return step.target ?? "sequence.next";
}

export function addSequenceStep(project, domainPath) {
  const selected = getSelectedDomain(project, domainPath);
  const order = project.sequenceSteps.length + 1;
  const sourceDomainPath = selected?.domainPath ?? "n:scene";
  const targetDomain = getNextDomainWithOutputs(project, sourceDomainPath);
  const targetDomainPath = targetDomain?.domainPath ?? sourceDomainPath;
  const step = {
    id: `step-${String(order).padStart(2, "0")}`,
    order,
    domainPath: sourceDomainPath,
    label: labelFromDomainPath(sourceDomainPath),
    event: listDomainEvents(project, sourceDomainPath)[0] ?? "on:tick",
    targetDomainPath,
    targetOutput: listDomainOutputs(project, targetDomainPath)[0] ?? "out:value",
    target: "sequence.next"
  };
  step.target = formatSequenceTarget(step);
  project.sequenceSteps.push(step);
  return step;
}

export function updateSequenceStepLink(project, stepId, patch = {}) {
  const step = project.sequenceSteps.find((item) => item.id === stepId) ?? project.sequenceSteps[0] ?? null;
  if (!step) return null;
  const requestedDomainPath = typeof patch.domainPath === "string" ? patch.domainPath : step.domainPath;
  if (findDomain(project, requestedDomainPath)) {
    const previousDefaultLabel = labelFromDomainPath(step.domainPath);
    const changedDomain = requestedDomainPath !== step.domainPath;
    const existingCustomLabel = step.label && step.label !== previousDefaultLabel;
    step.domainPath = requestedDomainPath;
    const requestedLabel = typeof patch.label === "string" ? patch.label.trim() : "";
    step.label = requestedLabel || (changedDomain && !existingCustomLabel ? labelFromDomainPath(requestedDomainPath) : step.label ?? labelFromDomainPath(requestedDomainPath));
  }
  const events = listDomainEvents(project, step.domainPath);
  if (typeof patch.event === "string" && events.includes(patch.event)) {
    step.event = patch.event;
  } else if (!events.includes(step.event)) {
    step.event = events[0] ?? step.event ?? "on:tick";
  }

  const requestedTargetDomainPath = typeof patch.targetDomainPath === "string" ? patch.targetDomainPath : step.targetDomainPath;
  if (findDomain(project, requestedTargetDomainPath)) {
    step.targetDomainPath = requestedTargetDomainPath;
  } else if (!findDomain(project, step.targetDomainPath)) {
    step.targetDomainPath = getNextDomainWithOutputs(project, step.domainPath)?.domainPath ?? step.domainPath;
  }
  const outputs = listDomainOutputs(project, step.targetDomainPath);
  if (typeof patch.targetOutput === "string" && outputs.includes(patch.targetOutput)) {
    step.targetOutput = patch.targetOutput;
  } else if (!outputs.includes(step.targetOutput)) {
    step.targetOutput = outputs[0] ?? step.targetOutput ?? "out:value";
  }
  step.target = typeof patch.target === "string" && patch.target.trim() ? patch.target.trim() : formatSequenceTarget(step);
  return step;
}

export function validateSequenceLinks(project) {
  const links = project.sequenceSteps.map((step) => {
    const errors = [];
    const source = findDomain(project, step.domainPath);
    const target = findDomain(project, step.targetDomainPath);
    const events = source ? listDomainEvents(project, step.domainPath) : [];
    const outputs = target ? listDomainOutputs(project, step.targetDomainPath) : [];
    if (!source) errors.push("missing-source-domain");
    if (!step.event) errors.push("missing-source-event");
    if (source && step.event && !events.includes(step.event)) errors.push("unknown-source-event");
    if (!step.targetDomainPath) errors.push("missing-target-domain");
    if (step.targetDomainPath && !target) errors.push("unknown-target-domain");
    if (!step.targetOutput) errors.push("missing-target-output");
    if (target && step.targetOutput && !outputs.includes(step.targetOutput)) errors.push("unknown-target-output");
    return {
      id: step.id,
      order: step.order,
      sourceDomainPath: step.domainPath,
      event: step.event ?? null,
      targetDomainPath: step.targetDomainPath ?? null,
      targetOutput: step.targetOutput ?? null,
      ok: errors.length === 0,
      errors
    };
  });
  return {
    ok: links.every((link) => link.ok),
    links,
    invalidLinks: links.filter((link) => !link.ok)
  };
}

export function buildEditorExportManifest(project) {
  return {
    title: project.title,
    domainPath: project.domainPath,
    version: project.version,
    viewport: clone(project.viewport),
    scene3d: clone(project.scene3d),
    domainStack: clone(project.domainStack),
    domainStackHealth: buildDomainStackHealth(project),
    kits: project.domainStack.map((domain) => ({
      kitId: domain.kitId ?? domain.id,
      domainPath: domain.domainPath,
      label: domain.label,
      requires: clone(domain.requires ?? []),
      provides: clone(domain.provides ?? []),
      children: clone(domain.children ?? [])
    })),
    kitConfigs: clone(project.kitConfigs),
    featureContracts: listEditorFeatureContracts(),
    featureContractValidation: validateEditorFeatureContracts(),
    runtime: normalizeBuildRuntimeConfig(project),
    sequenceSteps: clone(project.sequenceSteps),
    sequenceGraph: validateSequenceLinks(project)
  };
}
