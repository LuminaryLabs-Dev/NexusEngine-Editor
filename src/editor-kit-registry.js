import { clone, installDomainKitManifest } from "./editor-domain-model.js";

export const KIT_REGISTRY_VERSION = "0.1.0";
export const EDITOR_REGISTRY_SCHEMA = "nexusengine.composition-registry/3";

const METADATA_SOURCE_COMMIT = "0000000000000000000000000000000000000000";
const METADATA_SOURCE_INTEGRITY = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.slice() : [value];
}

function toDomainPath(domain, fallback = "kit") {
  const clean = String(domain ?? fallback)
    .trim()
    .replace(/^n:/, "")
    .replace(/[^a-z0-9:.-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `n:${clean || fallback}`;
}

export function normalizeKitManifest(input = {}) {
  const id = String(input.id ?? "").trim();
  if (!id) throw new TypeError("Kit manifest requires an id.");
  const domain = String(input.domain ?? id.replace(/-kit$/, "")).trim();
  const metadata = clone(input.metadata ?? {});
  return {
    version: input.version ?? KIT_REGISTRY_VERSION,
    id,
    domain,
    domainPath: input.domainPath ?? toDomainPath(domain, id),
    parentDomain: input.parentDomain ? String(input.parentDomain) : metadata.parentDomain ?? null,
    parentDomainPath: input.parentDomainPath ? String(input.parentDomainPath) : metadata.parentDomainPath ?? null,
    category: String(input.category ?? metadata.category ?? input.parentDomain ?? "General"),
    label: String(input.label ?? metadata.label ?? id),
    subtitle: String(input.subtitle ?? metadata.purpose ?? input.type ?? "Domain Service Kit"),
    type: String(input.type ?? "atomic-domain-service-kit"),
    status: String(input.status ?? "experimental"),
    apiVisibility: String(input.apiVisibility ?? input.visibility ?? "public"),
    factory: input.factory ? String(input.factory) : null,
    path: input.path ? String(input.path) : null,
    requires: asList(input.requires).map(String),
    provides: asList(input.provides).map(String),
    resources: asList(input.resources).map(String),
    events: asList(input.events).map(String),
    publicApi: asList(input.publicApi).map(String),
    descriptors: asList(input.descriptors).map(String),
    children: asList(input.children).map(String),
    defaults: clone(input.defaults ?? input.config ?? {}),
    settingsSchema: clone(input.settingsSchema ?? { type: "object", additionalProperties: true }),
    preview: input.preview == null ? null : clone(input.preview),
    source: clone(input.source ?? { registryId: "nexusengine-editor-registry", exportName: null, module: input.path ?? null, trusted: false }),
    rendererBoundary: { outputsDescriptors: false, ownsDom: false, ownsCanvas: false, ownsThreeObjects: false, ...(input.rendererBoundary ?? {}) },
    performance: { scalesWith: [], telemetry: [], degradationModes: [], ...(input.performance ?? {}) },
    snapshot: { supportsSnapshot: false, supportsReset: false, supportsLoadSnapshot: false, ...(input.snapshot ?? {}) },
    promotion: { level: input.status ?? "experimental", criteria: [], ...(input.promotion ?? {}) },
    metadata
  };
}

export function createEditorRegistrySnapshot(manifests = NEXUS_ENGINE_KIT_MANIFESTS) {
  const kits = asList(manifests).map(normalizeKitManifest);
  const paths = new Set(kits.map((kit) => kit.domainPath));
  const domains = [...paths].sort().map((domainPath) => {
    const first = kits.find((kit) => kit.domainPath === domainPath);
    const declaredParent = first?.parentDomainPath && paths.has(first.parentDomainPath) ? first.parentDomainPath : null;
    return {
      id: `editor-domain-${domainPath.replace(/^n:/, "").replace(/[^a-z0-9]+/gi, "-")}`,
      domainPath,
      parentDomainPath: declaredParent,
      label: first?.label ?? domainPath,
      status: first?.status ?? "experimental",
      responsibility: first?.subtitle ?? `Own Editor metadata bounded by ${domainPath}.`,
      ownedMeaning: [first?.subtitle ?? `Editor registry meaning bounded by ${domainPath}.`],
      forbiddenResponsibilities: ["browser lifecycle", "renderer implementation", "GPU device ownership"],
      requires: [],
      provides: [domainPath],
      settingsSchema: { type: "object", additionalProperties: true },
      sourceRegistryId: "nexusengine-editor-registry",
      metadata: { editorRegistry: true }
    };
  });
  const records = kits.map((kit) => ({
    id: kit.id,
    version: kit.version,
    status: kit.status,
    kind: kit.type,
    responsibility: kit.subtitle,
    domainPath: kit.domainPath,
    parentDomainPath: domains.find((domain) => domain.domainPath === kit.domainPath)?.parentDomainPath ?? null,
    apiVisibility: kit.apiVisibility,
    requires: clone(kit.requires),
    provides: clone(kit.provides),
    composes: clone(kit.children),
    defaults: clone(kit.defaults),
    settingsSchema: clone(kit.settingsSchema),
    source: {
      registryId: "nexusengine-editor-registry",
      subpath: null,
      exportName: null,
      environments: [],
      permissions: [],
      installable: false
    },
    metadata: {
      label: kit.label,
      subtitle: kit.subtitle,
      category: kit.category,
      declaredPackagePath: kit.path,
      preview: clone(kit.preview),
      rendererBoundary: kit.rendererBoundary,
      performance: kit.performance
    }
  }));
  return {
    schema: EDITOR_REGISTRY_SCHEMA,
    registryId: "nexusengine-editor-registry",
    revision: 1,
    sources: [{
      registryId: "nexusengine-editor-registry",
      package: "@luminarylabs/nexusengine-editor",
      version: KIT_REGISTRY_VERSION,
      sourceCommit: METADATA_SOURCE_COMMIT,
      integrity: METADATA_SOURCE_INTEGRITY,
      status: "metadata-only",
      environments: ["browser", "node"],
      permissions: [],
      metadata: { editorRegistry: true, executable: false }
    }],
    domains,
    kits: records,
    recipes: []
  };
}

export function validateKitManifest(input = {}) {
  const errors = [];
  let manifest = null;
  try {
    manifest = normalizeKitManifest(input);
  } catch (error) {
    errors.push(error.message);
  }
  if (manifest) {
    for (const key of ["requires", "provides", "resources", "events", "publicApi", "descriptors", "children"]) {
      if (!Array.isArray(manifest[key])) errors.push(`${key} must be an array`);
    }
  }
  return { ok: errors.length === 0, errors, manifest };
}

export function createKitRegistry(manifests = []) {
  const byId = new Map();
  const register = (input = {}) => {
    const result = validateKitManifest(input);
    if (!result.ok) return result;
    byId.set(result.manifest.id, result.manifest);
    return { ok: true, manifest: clone(result.manifest) };
  };
  for (const manifest of asList(manifests)) register(manifest);
  return Object.freeze({
    register,
    get(id) {
      return clone(byId.get(String(id)) ?? null);
    },
    list(filter = {}) {
      let values = [...byId.values()];
      if (filter.type) values = values.filter((manifest) => manifest.type === filter.type);
      if (filter.status) values = values.filter((manifest) => manifest.status === filter.status);
      if (filter.category) values = values.filter((manifest) => manifest.category === filter.category);
      if (filter.parentDomain) values = values.filter((manifest) => manifest.parentDomain === filter.parentDomain);
      if (filter.provides) values = values.filter((manifest) => manifest.provides.includes(filter.provides));
      if (filter.requires) values = values.filter((manifest) => manifest.requires.includes(filter.requires));
      return values.map(clone);
    },
    search(query = "", filter = {}) {
      const text = String(query ?? "").trim().toLowerCase();
      let values = this.list(filter);
      if (text) {
        values = values.filter((manifest) => [
          manifest.id,
          manifest.domain,
          manifest.domainPath,
          manifest.parentDomain,
          manifest.category,
          manifest.label,
          manifest.subtitle,
          ...manifest.provides,
          ...manifest.requires,
          ...manifest.children
        ].filter(Boolean).join(" ").toLowerCase().includes(text));
      }
      return values;
    },
    findByProvide(token) {
      return this.list({ provides: token });
    },
    findByRequire(token) {
      return this.list({ requires: token });
    },
    findCompatibleKits(id) {
      const kit = byId.get(String(id));
      if (!kit) return [];
      const required = new Set(kit.requires ?? []);
      return [...byId.values()]
        .filter((candidate) => candidate.id !== kit.id && candidate.provides?.some((token) => required.has(token)))
        .map(clone);
    },
    listCategories() {
      return Array.from(new Set([...byId.values()].map((manifest) => manifest.category))).sort();
    },
    listDeployKits() {
      return this.list().filter((manifest) => /deploy/i.test(manifest.type));
    },
    listDomainBoundaries() {
      return this.list().filter((manifest) => manifest.metadata?.boundary || manifest.descriptors?.length || manifest.resources?.length);
    },
    snapshot() {
      return { version: KIT_REGISTRY_VERSION, kits: this.list() };
    },
    registrySnapshot() {
      return createEditorRegistrySnapshot(this.list());
    }
  });
}

export const NEXUS_ENGINE_KIT_MANIFESTS = Object.freeze([
  {
    id: "kit-manifest-domain-kit",
    domain: "kit-manifest",
    domainPath: "n:kit-manifest",
    parentDomain: "registry",
    category: "Registry",
    label: "Kit Manifest Registry",
    subtitle: "Machine-readable kit manifests",
    type: "control-domain-service-kit",
    path: "nexusengine/domains/composition",
    provides: ["kit:manifest-registry", "kit:metadata", "domain:catalog"],
    resources: ["kitManifest.state"],
    events: ["kitManifest.registered", "kitManifest.validated"],
    publicApi: ["engine.kitManifest.registerManifest", "engine.kitManifest.listByDomain"],
    snapshot: { supportsSnapshot: true, supportsReset: true }
  },
  {
    id: "capability-graph-domain-kit",
    domain: "capability-graph",
    domainPath: "n:capability-graph",
    parentDomain: "registry",
    category: "Registry",
    label: "Capability Graph",
    subtitle: "Requires/provides graph",
    type: "control-domain-service-kit",
    path: "nexusengine/domains/composition",
    provides: ["domain:capability-graph"],
    resources: ["capabilityGraph.state"],
    publicApi: ["engine.capabilityGraph.buildGraph"],
    snapshot: { supportsSnapshot: true, supportsReset: true }
  },
  {
    id: "composition-planning-domain-kit",
    domain: "composition-planning",
    domainPath: "n:composition-planning",
    parentDomain: "registry",
    category: "Registry",
    label: "Composition Planning",
    subtitle: "Install plans and dependency gaps",
    type: "control-domain-service-kit",
    path: "nexusengine/domains/composition",
    requires: ["domain:capability-graph"],
    provides: ["domain:composition-planning", "domain:install-plan", "domain:dependency-gap-report"],
    resources: ["compositionPlanning.state"],
    events: ["compositionPlanning.planned", "compositionPlanning.validated"],
    publicApi: ["engine.compositionPlanning.createInstallPlan", "engine.compositionPlanning.validateComposition"],
    snapshot: { supportsSnapshot: true, supportsReset: true }
  },
  {
    id: "deploy-manifest-kit",
    domain: "deploy-manifest",
    domainPath: "n:deploy-manifest",
    parentDomain: "registry",
    category: "Registry",
    label: "Deploy Manifest",
    subtitle: "HTML/export deployment manifest",
    type: "deploy-kit",
    path: "@luminarylabs/nexusengine-kits/deploy-manifest-kit",
    provides: ["deploy:manifest", "export:html"],
    resources: ["deployManifest.state"],
    publicApi: ["engine.deployManifest.getState"]
  },
  {
    id: "spatial-authoring-kits",
    domain: "spatial-authoring",
    domainPath: "n:spatial-authoring",
    category: "Spatial Authoring",
    label: "Spatial Authoring Bundle",
    subtitle: "Scene graph, selection, transforms, widgets",
    type: "composite-domain-service-kit",
    path: "@luminarylabs/nexusengine-kits/spatial-authoring-kits",
    provides: ["domain:spatial-authoring"],
    children: [
      "spatial-scene-graph-kit",
      "selection-domain-service-kit",
      "transform-domain-service-kit",
      "widget-domain-service-kit",
      "interaction-domain-service-kit",
      "persistence-domain-service-kit"
    ],
    descriptors: ["spatial-authoring.stack"]
  },
  {
    id: "spatial-scene-graph-kit",
    domain: "spatial-scene-graph",
    domainPath: "n:spatial-scene-graph",
    parentDomain: "spatial-authoring",
    category: "Spatial Authoring",
    label: "Spatial Scene Graph",
    subtitle: "Object hierarchy and scene patches",
    path: "nexusengine/domains/world/scene",
    provides: ["n:spatial-scene-graph", "scene:graph"],
    resources: ["sceneGraph.state"],
    events: ["sceneGraph.patched"],
    publicApi: ["engine.sceneGraph.applyPatch", "engine.sceneGraph.getState"],
    snapshot: { supportsSnapshot: true, supportsReset: true }
  },
  {
    id: "selection-domain-service-kit",
    domain: "selection",
    domainPath: "n:selection",
    parentDomain: "spatial-authoring",
    category: "Spatial Authoring",
    label: "Selection",
    subtitle: "Selected object/domain state",
    path: "local:NexusEngine-Editor/src/nexus-engine-editor-runtime.js",
    requires: ["scene:graph"],
    provides: ["n:selection", "editor:selection"],
    resources: ["selection.state"],
    events: ["selection.changed"],
    publicApi: ["engine.selection.select", "engine.selection.getState"]
  },
  {
    id: "transform-domain-service-kit",
    domain: "transform",
    domainPath: "n:transform",
    parentDomain: "spatial-authoring",
    category: "Spatial Authoring",
    label: "Transform",
    subtitle: "Position, rotation, scale edits",
    path: "nexusengine/domains/spatial/transform-math",
    requires: ["scene:graph"],
    provides: ["n:transform", "spatial:transform"],
    resources: ["transform.state"],
    events: ["transform.changed"],
    publicApi: ["engine.transform.apply", "engine.transform.getState"]
  },
  {
    id: "widget-domain-service-kit",
    domain: "widget",
    domainPath: "n:widget",
    parentDomain: "spatial-authoring",
    category: "Spatial Authoring",
    label: "Widget",
    subtitle: "Gizmos and editor widgets",
    path: "local:NexusEngine-Editor/src/nexus-engine-editor-runtime.js",
    requires: ["spatial:transform"],
    provides: ["n:widget", "editor:widget"],
    descriptors: ["widget.descriptors"],
    publicApi: ["engine.widget.getDescriptors"]
  },
  {
    id: "interaction-domain-service-kit",
    domain: "interaction",
    domainPath: "n:interaction",
    parentDomain: "spatial-authoring",
    category: "Spatial Authoring",
    label: "Interaction",
    subtitle: "Object interaction requests",
    path: "nexusengine/domains/interaction",
    provides: ["n:interaction", "interaction:request"],
    resources: ["interaction.state"],
    events: ["interaction.requested", "interaction.completed"],
    publicApi: ["engine.interaction.request", "engine.interaction.getState"]
  },
  {
    id: "persistence-domain-service-kit",
    domain: "persistence",
    domainPath: "n:persistence",
    parentDomain: "spatial-authoring",
    category: "Spatial Authoring",
    label: "Persistence",
    subtitle: "Project file snapshots",
    path: "nexusengine/domains/runtime/persistence",
    provides: ["n:persistence", "save:scene", "file:project"],
    resources: ["persistence.state"],
    events: ["persistence.saved", "persistence.loaded", "persistence.exported", "persistence.imported"],
    publicApi: ["engine.persistence.save", "engine.persistence.load", "engine.persistence.exportProject", "engine.persistence.importProject"],
    snapshot: { supportsSnapshot: true, supportsReset: true, supportsLoadSnapshot: true }
  },
  {
    id: "render-descriptor-domain-kit",
    domain: "render-descriptor",
    domainPath: "n:render-descriptor",
    category: "Rendering",
    label: "Render Descriptor",
    subtitle: "Renderer-agnostic draw data",
    path: "nexusengine/domains/presentation/graphics",
    provides: ["n:render-descriptor", "render:descriptors"],
    descriptors: ["render.object", "render.layer"],
    rendererBoundary: { outputsDescriptors: true }
  },
  {
    id: "stereoscopic-render-domain-kit",
    domain: "stereoscopic-render",
    domainPath: "n:stereoscopic-render",
    category: "Rendering",
    label: "Stereoscopic Render",
    subtitle: "XR stereo render descriptors",
    path: "@luminarylabs/nexusengine-kits/stereoscopic-render-domain-kit",
    requires: ["render:descriptors"],
    provides: ["n:stereoscopic-render", "render:stereo"],
    descriptors: ["render.stereo"],
    rendererBoundary: { outputsDescriptors: true }
  },
  {
    id: "audio-feedback-domain-kit",
    domain: "audio-feedback",
    domainPath: "n:audio-feedback",
    category: "Presentation",
    label: "Audio Feedback",
    subtitle: "Audio event descriptors",
    path: "@luminarylabs/nexusengine-kits/audio-feedback-domain-kit",
    provides: ["n:audio-feedback", "audio:feedback"],
    resources: ["audioFeedback.state"],
    events: ["audioFeedback.cued"],
    descriptors: ["audio.cue"],
    publicApi: ["engine.audioFeedbackDomain.getState"]
  },
  {
    id: "generic-input-actions-kit",
    domain: "generic-input-actions",
    domainPath: "n:input-actions",
    category: "Input",
    label: "Input Actions",
    subtitle: "Semantic input action map",
    path: "nexusengine/domains/interaction/input",
    provides: ["n:input-actions", "input:actions"],
    resources: ["inputActions.state"],
    events: ["inputActions.changed"],
    publicApi: ["engine.genericInputActions.bind", "engine.genericInputActions.getState"]
  },
  {
    id: "world-zone-domain-kit",
    domain: "world-zone",
    domainPath: "n:world-zone",
    parentDomain: "open-world",
    category: "World",
    label: "World Zone",
    subtitle: "Zone membership and enter/exit events",
    path: "@luminarylabs/nexusengine-kits/world-zone-domain-kit",
    provides: ["n:world-zone", "world:zones"],
    resources: ["worldZoneDomain.state"],
    events: ["worldZone.entered", "worldZone.exited"],
    publicApi: ["engine.worldZoneDomain.register", "engine.worldZoneDomain.setEntityPosition"]
  },
  {
    id: "terrain-height-domain-kit",
    domain: "terrain-height",
    domainPath: "n:terrain-height",
    parentDomain: "terrain",
    category: "World",
    label: "Terrain Height",
    subtitle: "Height sampler service",
    path: "@luminarylabs/nexusengine-kits/terrain-height-domain-kit",
    provides: ["n:terrain-height", "terrain:height"],
    resources: ["terrainHeightDomain.state"],
    publicApi: ["engine.terrainHeightDomain.heightAt"]
  },
  {
    id: "route-clearance-domain-kit",
    domain: "route-clearance",
    domainPath: "n:route-clearance",
    parentDomain: "spatial-layout",
    category: "World",
    label: "Route Clearance",
    subtitle: "Route-safe spacing checks",
    path: "@luminarylabs/nexusengine-kits/route-clearance-domain-kit",
    provides: ["n:route-clearance", "placement:route-clearance"],
    resources: ["routeClearanceDomain.state"],
    events: ["routeClearance.checked"],
    publicApi: ["engine.routeClearanceDomain.check"]
  },
  {
    id: "vegetation-placement-domain-kit",
    domain: "vegetation-placement",
    domainPath: "n:vegetation-placement",
    parentDomain: "vegetation",
    category: "World",
    label: "Vegetation Placement",
    subtitle: "Accepted/rejected vegetation placement",
    path: "@luminarylabs/nexusengine-kits/vegetation-placement-domain-kit",
    requires: ["terrain:height", "placement:route-clearance"],
    provides: ["n:vegetation-placement", "vegetation:placement"],
    resources: ["vegetationPlacementDomain.state"],
    events: ["vegetationPlacement.placed", "vegetationPlacement.rejected"],
    publicApi: ["engine.vegetationPlacementDomain.tryPlace"]
  },
  {
    id: "damage-health-domain-kit",
    domain: "damage-health",
    domainPath: "n:damage-health",
    parentDomain: "combat",
    category: "Gameplay",
    label: "Damage Health",
    subtitle: "Health, damage, restore, defeat",
    path: "@luminarylabs/nexusengine-kits/damage-health-domain-kit",
    provides: ["n:damage-health", "combat:health"],
    resources: ["damageHealthDomain.state"],
    events: ["damageHealth.applied", "damageHealth.restored", "damageHealth.defeated"],
    publicApi: ["engine.damageHealthDomain.apply", "engine.damageHealthDomain.restore"]
  },
  {
    id: "mana-meter-domain-kit",
    domain: "mana-meter",
    domainPath: "n:mana-meter",
    parentDomain: "magic",
    category: "Gameplay",
    label: "Mana Meter",
    subtitle: "Mana spend, gain, regeneration",
    path: "@luminarylabs/nexusengine-kits/mana-meter-domain-kit",
    provides: ["n:mana-meter", "magic:mana"],
    resources: ["manaMeterDomain.state"],
    events: ["mana.changed", "mana.rejected"],
    publicApi: ["engine.manaMeterDomain.spend", "engine.manaMeterDomain.gain"]
  },
  {
    id: "status-effect-domain-kit",
    domain: "status-effect",
    domainPath: "n:status-effect",
    parentDomain: "combat",
    category: "Gameplay",
    label: "Status Effect",
    subtitle: "Timed effects and expiry",
    path: "@luminarylabs/nexusengine-kits/status-effect-domain-kit",
    provides: ["n:status-effect", "combat:statuses"],
    resources: ["statusEffectDomain.state"],
    events: ["statusEffect.applied", "statusEffect.expired"],
    publicApi: ["engine.statusEffectDomain.apply", "engine.statusEffectDomain.getEffects"]
  },
  {
    id: "generic-defense-session-command-kit",
    domain: "generic-defense-session-command",
    domainPath: "n:generic-defense-session-command",
    parentDomain: "generic-defense",
    category: "Gameplay",
    label: "Defense Session Command",
    subtitle: "Tower-defense session commands",
    path: "@luminarylabs/nexusengine-kits/generic-defense-session-command-kit",
    provides: ["n:generic-defense-session-command", "game:session-command"],
    resources: ["genericDefenseSessionCommand.state"],
    events: ["sessionCommand.issued"],
    publicApi: ["engine.genericDefenseSessionCommand.issue"]
  },
  {
    id: "generic-route-cargo-extraction-kit",
    domain: "generic-route-cargo-extraction",
    domainPath: "n:route-cargo-extraction",
    parentDomain: "route-objective",
    category: "Gameplay",
    label: "Route Cargo Extraction",
    subtitle: "Route progress plus cargo extraction",
    path: "@luminarylabs/nexusengine-kits/generic-route-cargo-extraction-kit",
    provides: ["n:route-cargo-extraction", "objective:cargo-extraction"],
    resources: ["routeCargoExtraction.state"],
    events: ["cargo.picked", "cargo.delivered"],
    publicApi: ["engine.genericRouteCargoExtraction.getState"]
  },
  {
    id: "banded-infinite-terrain-kit",
    domain: "banded-infinite-terrain",
    domainPath: "n:banded-infinite-terrain",
    parentDomain: "terrain",
    category: "World",
    label: "Banded Infinite Terrain",
    subtitle: "Streaming terrain bands",
    path: "@luminarylabs/nexusengine-kits/banded-infinite-terrain-kit",
    provides: ["n:banded-infinite-terrain", "terrain:streaming"],
    descriptors: ["terrain.band", "terrain.patch"],
    publicApi: ["engine.bandedInfiniteTerrain.getState"],
    performance: { scalesWith: ["active terrain bands"], telemetry: ["patchCount", "activeBandCount"], degradationModes: ["reduce active radius"] }
  },
  {
    id: "aerial-flight-kits",
    domain: "aerial-flight",
    domainPath: "n:aerial-flight",
    category: "Flight",
    label: "Aerial Flight Bundle",
    subtitle: "Flight body, weather, camera, mission",
    type: "composite-domain-service-kit",
    path: "@luminarylabs/nexusengine-kits/aerial-flight-kits",
    provides: ["n:aerial-flight", "aerial:body", "aerial:mission"],
    children: ["powered-aerial-flight-domain-kit", "aerial-camera-rig-domain-kit", "aerial-mission-sequence-kit"],
    descriptors: ["aerial.flight-stack"]
  }
]);

export function createKitInstaller(registry = createKitRegistry()) {
  const planFor = (id, options = {}) => {
    const manifest = registry.get(id);
    if (!manifest) return { ok: false, id, installOrder: [], missing: [String(id)], reason: "missing-kit" };
    const installOrder = [];
    const missing = [];
    for (const token of manifest.requires) {
      const provider = registry.findByProvide(token)[0];
      if (provider && !installOrder.includes(provider.id)) installOrder.push(provider.id);
      if (!provider) missing.push(token);
    }
    if (!installOrder.includes(manifest.id)) installOrder.push(manifest.id);
    if (options.includeChildren) {
      for (const childId of manifest.children) if (registry.get(childId) && !installOrder.includes(childId)) installOrder.push(childId);
    }
    return {
      ok: missing.length === 0,
      id: manifest.id,
      installOrder,
      missing,
      compatible: registry.findCompatibleKits(manifest.id),
      children: manifest.children.map((childId) => registry.get(childId)).filter(Boolean)
    };
  };

  const installPlan = (project, plan) => {
    const installed = [];
    for (const id of plan.installOrder) {
      const manifest = registry.get(id);
      if (!manifest) continue;
      installed.push(installDomainKitManifest(project, manifest));
    }
    return installed;
  };

  return Object.freeze({
    createInstallPlan: planFor,
    installKit(project, id) {
      const plan = planFor(id);
      const installed = installPlan(project, plan);
      return { ok: plan.ok, plan, manifest: registry.get(id), installed, domain: installed.at(-1) ?? null };
    },
    installDomain(project, domain) {
      const manifests = registry.list().filter((manifest) => manifest.domain === domain || manifest.parentDomain === domain || manifest.category === domain);
      const installed = manifests.map((manifest) => installDomainKitManifest(project, manifest));
      return { ok: installed.length > 0, domain, installed };
    },
    installBundle(project, id) {
      const plan = planFor(id, { includeChildren: true });
      const installed = installPlan(project, plan);
      return { ok: plan.ok, plan, manifest: registry.get(id), installed, domain: installed.at(-1) ?? null };
    },
    installAll(project) {
      const installed = registry.list().map((manifest) => installDomainKitManifest(project, manifest));
      return { ok: installed.length > 0, installed };
    }
  });
}

export function createEditorKitInstallSurface(manifests = NEXUS_ENGINE_KIT_MANIFESTS) {
  const registry = createKitRegistry(manifests);
  const installer = createKitInstaller(registry);
  return Object.freeze({ registry, installer });
}
