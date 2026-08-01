export const EDITOR_PROJECT_VERSION = "0.4.0";
export const COMPOSITION_TREE_SCHEMA = "nexusengine.composition-tree/1";
export const PROJECT_REGISTRY_SCHEMA = "nexusengine.composition-registry/3";

const METADATA_SOURCE_COMMIT = "0000000000000000000000000000000000000000";
const METADATA_SOURCE_INTEGRITY = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const asList = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

function hash(value) {
  const text = JSON.stringify(value);
  let code = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    code ^= text.charCodeAt(index);
    code = Math.imul(code, 0x01000193);
  }
  return `project-${(code >>> 0).toString(16).padStart(8, "0")}`;
}

function slug(value) {
  return String(value ?? "record").replace(/^n:/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "record";
}

function inferSchema(value = {}) {
  const properties = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    const type = Array.isArray(entry) ? "array" : entry === null ? ["null", "object"] : typeof entry;
    properties[key] = { type };
  }
  return { type: "object", properties, additionalProperties: true };
}

function immediateParentPath(path) {
  const separator = String(path).lastIndexOf(":");
  return separator <= 1 ? null : String(path).slice(0, separator);
}

function pathHierarchy(paths) {
  const result = new Set();
  for (const path of paths) {
    let current = String(path);
    while (current) {
      result.add(current);
      current = immediateParentPath(current);
    }
  }
  return [...result].sort((left, right) => {
    const depth = left.split(":").length - right.split(":").length;
    return depth || left.localeCompare(right);
  });
}

export function createProjectRegistryOverlay(project) {
  const sourceId = `project:${slug(project.domainPath ?? project.title)}`;
  const rows = asList(project.domainStack);
  const rowsByPath = new Map(rows.filter((row) => row?.domainPath).map((row) => [String(row.domainPath), row]));
  const paths = pathHierarchy(rowsByPath.keys());
  const domains = [{
    id: "project-root-domain",
    domainPath: "n:project",
    parentDomainPath: null,
    label: project.title ?? "Game Root",
    status: "project-local",
    responsibility: "Own the authored project composition boundary.",
    ownedMeaning: ["The authored game composition boundary."],
    forbiddenResponsibilities: ["browser lifecycle", "renderer implementation", "GPU device ownership"],
    requires: [],
    provides: ["n:project"],
    settingsSchema: { type: "object", additionalProperties: true },
    sourceRegistryId: sourceId,
    metadata: { compositionRoot: true, projectLocal: true }
  }];
  const kits = [];
  const usedIds = new Set(["project-root-domain"]);
  const domainIdByPath = new Map();
  const kitIdByPath = new Map();
  for (const domainPath of paths) {
    const row = rowsByPath.get(domainPath);
    let id = `project-domain-${slug(domainPath)}`;
    while (usedIds.has(id)) id = `${id}-local`;
    usedIds.add(id);
    domainIdByPath.set(domainPath, id);
    domains.push({
      id,
      domainPath,
      parentDomainPath: immediateParentPath(domainPath),
      label: row?.label ?? domainPath.split(":").at(-1),
      status: row?.status ?? "project-local",
      responsibility: row?.subtitle ?? `Own project-local meaning bounded by ${domainPath}.`,
      ownedMeaning: [row?.subtitle ?? `Project-local meaning bounded by ${domainPath}.`],
      forbiddenResponsibilities: ["browser lifecycle", "renderer implementation", "GPU device ownership"],
      requires: [],
      provides: [domainPath],
      settingsSchema: inferSchema(project.kitConfigs?.[domainPath] ?? {}),
      sourceRegistryId: sourceId,
      metadata: {
        projectLocal: true,
        syntheticParent: !row,
        legacyId: row?.id ?? null
      }
    });
  }
  for (const row of rows) {
    if (!row?.domainPath) continue;
    let id = String(row.kitId ?? row.id ?? `project-kit-${slug(row.domainPath)}`);
    if (usedIds.has(id)) id = `project-kit-${slug(id)}-${kits.length + 1}`;
    usedIds.add(id);
    if (!kitIdByPath.has(row.domainPath)) kitIdByPath.set(row.domainPath, id);
    const config = clone(project.kitConfigs?.[row.domainPath] ?? { enabled: true });
    kits.push({
      id,
      version: EDITOR_PROJECT_VERSION,
      status: row.status === "missing" ? "blocked" : "project-local",
      kind: row.type ?? "domain-service-kit",
      responsibility: row.subtitle ?? `Represent project-local behavior for ${row.domainPath}.`,
      domainPath: row.domainPath,
      parentDomainPath: immediateParentPath(row.domainPath),
      apiName: null,
      apiVisibility: "public",
      requires: clone(row.requires ?? []),
      provides: [...new Set([row.domainPath, ...(row.provides ?? [])])],
      composes: [],
      defaults: config,
      settingsSchema: inferSchema(config),
      source: {
        registryId: sourceId,
        subpath: null,
        exportName: null,
        environments: [],
        permissions: [],
        installable: false
      },
      metadata: {
        projectLocal: true,
        legacyId: row.id ?? null,
        label: row.label,
        subtitle: row.subtitle,
        preview: null
      }
    });
  }
  const content = { domains, kits, recipes: [] };
  return {
    schema: PROJECT_REGISTRY_SCHEMA,
    registryId: sourceId,
    revision: 1,
    sources: [{
      registryId: sourceId,
      package: "nexusengine-editor-project",
      version: EDITOR_PROJECT_VERSION,
      sourceCommit: METADATA_SOURCE_COMMIT,
      integrity: METADATA_SOURCE_INTEGRITY,
      status: "metadata-only",
      environments: ["browser", "node"],
      permissions: [],
      metadata: { projectLocal: true, executable: false, contentIdentity: hash(content) }
    }],
    ...content
  };
}

export function createCompositionFromLegacy(project, overlay = createProjectRegistryOverlay(project)) {
  const domains = new Map(overlay.domains.map((record) => [record.domainPath, record]));
  const nodes = [{ id: "game-root", kind: "domain", registryId: "project-root-domain", parentNodeId: null, order: 0, enabled: true, labelOverride: null, config: {} }];
  const domainNodeByPath = new Map();
  for (const record of overlay.domains.filter((domain) => domain.id !== "project-root-domain")) {
    const nodeId = `domain-node-${slug(record.domainPath)}`;
    domainNodeByPath.set(record.domainPath, nodeId);
    nodes.push({
      id: nodeId,
      kind: "domain",
      registryId: record.id,
      parentNodeId: record.parentDomainPath ? `domain-node-${slug(record.parentDomainPath)}` : "game-root",
      order: nodes.length,
      enabled: true,
      labelOverride: null,
      config: {}
    });
  }
  for (const record of overlay.kits) {
    nodes.push({
      id: `kit-node-${slug(record.id)}`,
      kind: "kit",
      registryId: record.id,
      parentNodeId: domainNodeByPath.get(record.domainPath),
      order: nodes.length,
      enabled: record.defaults?.enabled !== false,
      labelOverride: null,
      config: clone(record.defaults ?? {})
    });
  }
  return {
    schema: COMPOSITION_TREE_SCHEMA,
    id: slug(project.domainPath ?? project.title),
    revision: 1,
    registryHash: hash({ overlay: overlay.registryId, domains: domains.size }),
    rootNodeId: "game-root",
    nodes
  };
}

export function ensureProjectComposition(project) {
  project.version = EDITOR_PROJECT_VERSION;
  if (project.compositionRegistryOverlay?.schema !== PROJECT_REGISTRY_SCHEMA) {
    project.compositionRegistryOverlay = createProjectRegistryOverlay(project);
  }
  project.composition = project.composition?.schema === COMPOSITION_TREE_SCHEMA
    ? clone(project.composition)
    : createCompositionFromLegacy(project, project.compositionRegistryOverlay);
  project.previewReceipts = asList(project.previewReceipts).slice(-20).map(clone);
  const kitsByPath = new Map(project.compositionRegistryOverlay.kits.map((kit) => [kit.domainPath, kit]));
  const kitNodesByRegistry = new Map(project.composition.nodes.filter((node) => node.kind === "kit").map((node) => [node.registryId, node]));
  for (const object of project.scene3d?.objects ?? []) {
    if (!Array.isArray(object.kitNodeIds)) {
      object.kitNodeIds = asList(object.domainKits).map((path) => kitNodesByRegistry.get(kitsByPath.get(path)?.id)?.id).filter(Boolean);
    }
  }
  return project;
}

export function rebuildProjectCompositionFromLegacy(project) {
  project.compositionRegistryOverlay = createProjectRegistryOverlay(project);
  project.composition = createCompositionFromLegacy(project, project.compositionRegistryOverlay);
  return ensureProjectComposition(project);
}

function registryMaps(registry) {
  return {
    domains: new Map(registry.domains.map((record) => [record.id, record])),
    kits: new Map(registry.kits.map((record) => [record.id, record]))
  };
}

export function deriveLegacyCompositionProjections(project, registry) {
  const maps = registryMaps(registry);
  const domainNodes = new Map(project.composition.nodes.filter((node) => node.kind === "domain").map((node) => [node.id, node]));
  const rows = [];
  const configs = {};
  const seenPaths = new Set();
  for (const node of project.composition.nodes.filter((entry) => entry.kind === "kit" && entry.enabled)) {
    const kit = maps.kits.get(node.registryId);
    const parent = domainNodes.get(node.parentNodeId);
    const domain = parent ? maps.domains.get(parent.registryId) : null;
    if (!kit || seenPaths.has(kit.domainPath)) continue;
    seenPaths.add(kit.domainPath);
    rows.push({
      id: `domain-${slug(kit.domainPath)}`,
      kitId: kit.id,
      domain: kit.domain,
      domainPath: kit.domainPath,
      label: node.labelOverride ?? domain?.label ?? kit.metadata?.label ?? kit.id,
      subtitle: kit.metadata?.subtitle ?? `${kit.kind} · ${kit.status}`,
      status: ["blocked", "unsupported", "retired"].includes(kit.status) ? "missing" : "ready",
      type: kit.kind,
      category: kit.metadata?.category ?? "Composition",
      requires: clone(kit.requires),
      provides: clone(kit.provides),
      events: clone(node.config?.events ?? [])
    });
    configs[kit.domainPath] = { ...clone(kit.defaults ?? {}), ...clone(node.config ?? {}), enabled: node.enabled };
  }
  project.domainStack = rows;
  project.kitConfigs = configs;
  const kitNodes = new Map(project.composition.nodes.filter((node) => node.kind === "kit").map((node) => [node.id, maps.kits.get(node.registryId)]));
  for (const object of project.scene3d?.objects ?? []) {
    object.domainKits = asList(object.kitNodeIds).map((nodeId) => kitNodes.get(nodeId)?.domainPath).filter(Boolean);
  }
  return project;
}

function snapshotEngine(engine) {
  const snapshots = {};
  for (const [name, api] of Object.entries(engine?.n ?? {})) {
    if (typeof api?.getSnapshot !== "function") continue;
    try { snapshots[name] = clone(api.getSnapshot()); } catch (error) { snapshots[name] = { error: error.message }; }
  }
  return snapshots;
}

function stateDifference(before, after) {
  const changed = [];
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return { changedApis: changed, beforeCount: Object.keys(before).length, afterCount: Object.keys(after).length };
}

function jsonSafe(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value, (_key, entry) => {
      if (typeof entry === "bigint") return entry.toString();
      if (typeof entry === "function" || typeof entry === "symbol") return undefined;
      return entry;
    }));
  } catch {
    return null;
  }
}

async function withTimeout(value, timeoutMs, globalObject) {
  if (!value || typeof value.then !== "function") return value;
  const setTimer = globalObject.setTimeout?.bind(globalObject) ?? setTimeout;
  const clearTimer = globalObject.clearTimeout?.bind(globalObject) ?? clearTimeout;
  let timer = null;
  try {
    return await Promise.race([
      value,
      new Promise((_, reject) => {
        timer = setTimer(() => reject(new Error(`Preview command timed out after ${timeoutMs}ms.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer != null) clearTimer(timer);
  }
}

async function executePreviewPlan(engine, plan, globalObject) {
  const commands = plan.order.filter((entry) => entry.preview?.command != null);
  if (!commands.length) {
    engine.tick(1 / 60);
    return [{ kind: "tick", delta: 1 / 60 }];
  }
  const results = [];
  for (const entry of commands) {
    const preview = entry.preview;
    const command = String(preview.command ?? "");
    if (preview.editorSafe !== true || !/^[A-Za-z][A-Za-z0-9]*$/.test(command)) {
      throw new Error(`Preview command for ${entry.registryId} is not declared editor-safe.`);
    }
    if (!entry.apiName || typeof engine.n?.[entry.apiName]?.[command] !== "function") {
      throw new Error(`Trusted preview command ${entry.apiName ?? "unknown"}.${command} is unavailable for ${entry.registryId}.`);
    }
    const timeoutMs = Math.min(5000, Math.max(1, Number(preview.timeoutMs ?? 1000) || 1000));
    const result = await withTimeout(engine.n[entry.apiName][command](clone(preview.args ?? {})), timeoutMs, globalObject);
    results.push({ kind: "command", registryId: entry.registryId, apiName: entry.apiName, command, result: jsonSafe(result) });
  }
  return results;
}

function disposeRuntime(runtime) {
  if (!runtime?.engine || runtime.disposed) return { ok: true, disposed: Boolean(runtime?.disposed), errors: [] };
  const engine = runtime.engine;
  const errors = [];
  const disposed = new Set();
  const dispose = (value, label, method = "dispose") => {
    if (!value || disposed.has(value) || typeof value[method] !== "function") return;
    disposed.add(value);
    try { value[method](); } catch (error) { errors.push(`${label}: ${error.message}`); }
  };
  for (const kit of [...(engine.kits ?? [])].reverse()) dispose(kit, `kit ${kit.id ?? "unknown"}`);
  for (const [kind, surfaces] of Object.entries(engine.__nexusSurfaceRegistry ?? {})) {
    for (const surface of surfaces ?? []) dispose(surface, `${kind} surface`);
  }
  dispose(engine.sequenceNodeRuntime, "sequence-node runtime");
  dispose(engine.sequenceRuntime, "sequence runtime");
  dispose(engine.renderer, "renderer");
  dispose(engine, "engine");
  runtime.engine = null;
  runtime.disposed = true;
  return { ok: errors.length === 0, disposed: true, errors };
}

function controllerUnavailable(project, reason) {
  const report = { schema: "nexusengine.composition-tree-validation/1", ok: false, errors: [{ code: "composition-tree-unavailable", nodeId: null, message: reason }], warnings: [] };
  return Object.freeze({
    supported: false,
    reason,
    registry: null,
    getAccepted: () => clone(project.composition),
    getDraft: () => clone(project.composition),
    getValidation: () => clone(report),
    isDirty: () => false,
    listAddOptions: () => [],
    select: () => null,
    getSelectedNode: () => null,
    add: () => ({ ok: false, reason }),
    remove: () => ({ ok: false, reason }),
    update: () => ({ ok: false, reason }),
    apply: () => ({ ok: false, report }),
    applyTree: () => ({ ok: false, report }),
    runOnce: async () => ({ ok: false, verdict: "unavailable", error: reason }),
    play: () => ({ ok: false, error: reason }),
    stop: () => ({ ok: true, stopped: false }),
    getReceipts: () => clone(project.previewReceipts ?? [])
  });
}

export function createCompositionController(options = {}) {
  const { project, NexusEngine, globalObject = globalThis } = options;
  ensureProjectComposition(project);
  const required = ["createEngineRegistrySnapshot", "mergeRegistrySnapshots", "normalizeCompositionTree", "validateCompositionTree", "planCompositionTree"];
  if (!NexusEngine || required.some((name) => typeof NexusEngine[name] !== "function")) {
    return controllerUnavailable(project, "Connected NexusEngine lacks composition-registry/3 support. Use the pinned 0.0.4 Engine package.");
  }
  let registry;
  try {
    const coreRegistry = NexusEngine.createEngineRegistrySnapshot();
    const coreIds = new Set([
      ...coreRegistry.domains,
      ...coreRegistry.kits,
      ...coreRegistry.recipes
    ].map((record) => record.id));
    const coreDomainsByPath = new Map(coreRegistry.domains.map((record) => [record.domainPath, record]));
    const domainReplacements = new Map();
    for (const domain of project.compositionRegistryOverlay.domains) {
      const coreDomain = coreDomainsByPath.get(domain.domainPath);
      if (coreDomain) domainReplacements.set(domain.id, coreDomain.id);
    }
    if (domainReplacements.size) {
      for (const node of project.composition.nodes) {
        if (node.kind === "domain" && domainReplacements.has(node.registryId)) {
          node.registryId = domainReplacements.get(node.registryId);
        }
      }
      project.compositionRegistryOverlay.domains = project.compositionRegistryOverlay.domains
        .filter((record) => !domainReplacements.has(record.id));
    }
    const occupiedIds = new Set([
      ...project.compositionRegistryOverlay.domains,
      ...project.compositionRegistryOverlay.kits,
      ...project.compositionRegistryOverlay.recipes
    ].map((record) => record.id));
    const occupiedPaths = new Set(project.compositionRegistryOverlay.domains.map((record) => record.domainPath));
    const imports = asList(options.registryImports).map((input) => ({
      ...clone(input),
      domains: asList(input.domains).filter((record) => !coreIds.has(record.id) && !coreDomainsByPath.has(record.domainPath) && !occupiedIds.has(record.id) && !occupiedPaths.has(record.domainPath)),
      kits: asList(input.kits).filter((record) => !coreIds.has(record.id) && !occupiedIds.has(record.id)),
      recipes: asList(input.recipes).filter((record) => !coreIds.has(record.id) && !occupiedIds.has(record.id))
    }));
    registry = NexusEngine.mergeRegistrySnapshots(coreRegistry, [...imports, project.compositionRegistryOverlay]);
  } catch (error) {
    return controllerUnavailable(project, `Project registry overlay was rejected: ${error.message}`);
  }
  const wasLegacyHash = !project.composition.registryHash || project.composition.registryHash.startsWith("project-");
  if (wasLegacyHash) project.composition.registryHash = registry.contentHash;
  project.composition = NexusEngine.normalizeCompositionTree(project.composition);
  let draft = clone(project.composition);
  let selectedNodeId = draft.rootNodeId;
  let dirty = false;
  let validation = NexusEngine.validateCompositionTree(draft, registry);
  let playRuntime = null;
  const maps = registryMaps(registry);

  function selected() { return draft.nodes.find((node) => node.id === selectedNodeId) ?? draft.nodes.find((node) => node.id === draft.rootNodeId) ?? null; }
  function activeTree() { return dirty ? draft : project.composition; }
  function refresh() { validation = NexusEngine.validateCompositionTree(draft, registry); return validation; }
  function markDirty() { dirty = JSON.stringify(draft) !== JSON.stringify(project.composition); refresh(); }
  function uniqueNodeId(prefix) { let index = 1; let id = `${prefix}-${index}`; const used = new Set(draft.nodes.map((node) => node.id)); while (used.has(id)) id = `${prefix}-${++index}`; return id; }
  function parentDomainRecord(node) { return node?.kind === "domain" ? maps.domains.get(node.registryId) : null; }
  function descendants(nodeId) {
    const result = []; const queue = draft.nodes.filter((node) => node.parentNodeId === nodeId);
    while (queue.length) { const node = queue.shift(); result.push(node); queue.push(...draft.nodes.filter((entry) => entry.parentNodeId === node.id)); }
    return result;
  }
  function references(node) {
    const kit = node.kind === "kit" ? maps.kits.get(node.registryId) : null;
    const domain = node.kind === "domain" ? maps.domains.get(node.registryId) : null;
    const path = kit?.domainPath ?? domain?.domainPath;
    const objectIds = (project.scene3d?.objects ?? []).filter((object) => asList(object.kitNodeIds).includes(node.id) || (path && asList(object.domainKits).includes(path))).map((object) => object.id);
    const sequenceIds = (project.sequenceSteps ?? []).filter((step) => path && (step.domainPath === path || step.targetDomainPath === path)).map((step) => step.id);
    return { objectIds, sequenceIds };
  }
  function stop() {
    if (!playRuntime) return { ok: true, stopped: false };
    if (playRuntime.frameId != null) globalObject.cancelAnimationFrame?.(playRuntime.frameId);
    if (playRuntime.intervalId != null) globalObject.clearInterval?.(playRuntime.intervalId);
    const disposal = disposeRuntime(playRuntime);
    playRuntime = null;
    return { ok: disposal.ok, stopped: true, disposed: disposal.disposed, errors: disposal.errors };
  }
  function planTree(scopeNodeId) {
    const plan = NexusEngine.planCompositionTree(project.composition, registry, { scopeNodeId });
    if (!plan.ok) return plan;
    return {
      ...clone(plan),
      order: plan.order.map((entry) => ({
        ...clone(entry),
        preview: clone(maps.kits.get(entry.registryId)?.metadata?.preview ?? null)
      }))
    };
  }
  async function createRuntime(plan) {
    const factories = [];
    for (const entry of plan.order) {
      const registrySource = registry.sources.find((source) => source.registryId === entry.source?.registryId);
      const source = { ...clone(registrySource ?? {}), ...clone(entry.source ?? {}) };
      const factory = await NexusEngine.resolveRegistryFactory?.(source);
      if (typeof factory !== "function") {
        return { ok: false, verdict: "unavailable", error: `Preview unavailable: no trusted provider for ${entry.registryId}.` };
      }
      factories.push(factory(clone(entry.config)));
    }
    const engine = NexusEngine.createEngine({
      domainKits: false,
      tick: { maxDelta: 1 / 15 },
      kits: factories
    });
    engine.game = { installOrder: plan.order.map((entry) => entry.registryId) };
    return { ok: true, engine, factories };
  }
  function addReceipt(receipt) {
    project.previewReceipts = [...asList(project.previewReceipts), clone(receipt)].slice(-20);
    return receipt;
  }
  function acceptTree(input) {
    const nextDraft = clone(NexusEngine.normalizeCompositionTree(input));
    const report = NexusEngine.validateCompositionTree(nextDraft, registry);
    if (!report.ok) return { ok: false, report: clone(report) };
    stop();
    nextDraft.revision = Number(project.composition.revision ?? 0) + 1;
    nextDraft.registryHash = registry.contentHash;
    project.composition = NexusEngine.normalizeCompositionTree(nextDraft);
    draft = clone(project.composition);
    if (!draft.nodes.some((node) => node.id === selectedNodeId)) selectedNodeId = draft.rootNodeId;
    dirty = false;
    refresh();
    deriveLegacyCompositionProjections(project, registry);
    return { ok: true, composition: clone(project.composition), report: clone(validation) };
  }

  deriveLegacyCompositionProjections(project, registry);
  return Object.freeze({
    supported: true,
    registry,
    getAccepted: () => clone(project.composition),
    getDraft: () => clone(draft),
    getValidation: () => clone(validation),
    isDirty: () => dirty,
    select(nodeId) { if (draft.nodes.some((node) => node.id === nodeId)) selectedNodeId = nodeId; return clone(selected()); },
    getSelectedNode: () => clone(selected()),
    getRecord(node = selected()) { return clone(node?.kind === "domain" ? maps.domains.get(node.registryId) : maps.kits.get(node?.registryId)); },
    listAddOptions(kind = null) {
      const parent = selected();
      const target = parent?.kind === "kit" ? draft.nodes.find((node) => node.id === parent.parentNodeId) : parent;
      if (!target || target.kind !== "domain") return [];
      const targetRecord = maps.domains.get(target.registryId);
      const placedDomains = new Set(draft.nodes.filter((node) => node.kind === "domain").map((node) => node.registryId));
      const placedKits = new Set(draft.nodes.filter((node) => node.kind === "kit").map((node) => node.registryId));
      const domains = registry.domains.filter((record) => !placedDomains.has(record.id) && (target.id === draft.rootNodeId ? !record.parentDomainPath : record.parentDomainPath === targetRecord?.domainPath)).map((record) => ({ kind: "domain", id: record.id, label: record.label, domainPath: record.domainPath }));
      const kits = registry.kits.filter((record) => !placedKits.has(record.id) && record.domainPath === targetRecord?.domainPath && !["blocked", "retired", "unsupported"].includes(record.status)).map((record) => ({ kind: "kit", id: record.id, label: record.metadata?.label ?? record.id, domainPath: record.domainPath }));
      return [...(kind === "kit" ? [] : domains), ...(kind === "domain" ? [] : kits)].sort((a, b) => a.domainPath.localeCompare(b.domainPath) || a.id.localeCompare(b.id));
    },
    add(kind, registryId) {
      const option = this.listAddOptions(kind).find((entry) => entry.id === registryId);
      if (!option) return { ok: false, reason: `Registry record ${registryId} is not valid below the selected boundary.` };
      const parent = selected()?.kind === "kit" ? draft.nodes.find((node) => node.id === selected().parentNodeId) : selected();
      const record = kind === "domain" ? maps.domains.get(registryId) : maps.kits.get(registryId);
      const node = {
        id: uniqueNodeId(`${kind}-${slug(registryId)}`), kind, registryId, parentNodeId: parent.id,
        order: draft.nodes.filter((entry) => entry.parentNodeId === parent.id).length,
        enabled: true, labelOverride: null, config: clone(record.defaults ?? {})
      };
      draft.nodes.push(node); selectedNodeId = node.id; markDirty(); return { ok: true, node: clone(node), report: clone(validation) };
    },
    remove(nodeId = selectedNodeId) {
      const node = draft.nodes.find((entry) => entry.id === nodeId);
      if (!node || node.id === draft.rootNodeId) return { ok: false, reason: "The game root cannot be removed." };
      if (descendants(node.id).length) return { ok: false, reason: "Remove child domains and kits first; nonempty domains never cascade." };
      const refs = references(node);
      if (refs.objectIds.length || refs.sequenceIds.length) return { ok: false, reason: "This node is referenced by scene objects or sequence steps.", references: refs };
      draft.nodes = draft.nodes.filter((entry) => entry.id !== node.id); selectedNodeId = node.parentNodeId; markDirty(); return { ok: true };
    },
    update(patch = {}) {
      const node = selected(); if (!node) return { ok: false, reason: "No selected composition node." };
      if ("enabled" in patch) node.enabled = Boolean(patch.enabled);
      if ("labelOverride" in patch) node.labelOverride = patch.labelOverride == null || patch.labelOverride === "" ? null : String(patch.labelOverride);
      if (patch.config) node.config = { ...clone(node.config), ...clone(patch.config) };
      markDirty(); return { ok: true, node: clone(node), report: clone(validation) };
    },
    resetDraft() { draft = clone(project.composition); selectedNodeId = draft.rootNodeId; dirty = false; refresh(); return clone(draft); },
    apply() {
      return acceptTree(draft);
    },
    applyTree: (tree) => acceptTree(tree),
    restoreTree(tree) {
      stop();
      project.composition = NexusEngine.normalizeCompositionTree(clone(tree));
      draft = clone(project.composition);
      selectedNodeId = draft.rootNodeId;
      dirty = false;
      refresh();
      deriveLegacyCompositionProjections(project, registry);
      return { ok: true, composition: clone(project.composition), report: clone(validation) };
    },
    async runOnce(scopeNodeId = selectedNodeId) {
      if (dirty) return addReceipt({ id: `preview-${Date.now()}`, at: new Date().toISOString(), scopeNodeId, verdict: "blocked", ok: false, error: "Apply the draft before preview." });
      const plan = planTree(scopeNodeId);
      if (!plan.ok) return addReceipt({ id: `preview-${Date.now()}`, at: new Date().toISOString(), scopeNodeId, verdict: "failed", ok: false, plan, error: plan.errors?.[0]?.message ?? "Composition plan failed." });
      const started = performance.now();
      let runtime = null;
      try {
        runtime = await createRuntime(plan);
        if (!runtime.ok) return addReceipt({ id: `preview-${Date.now()}`, at: new Date().toISOString(), scopeNodeId, resolvedKits: plan.order.map((entry) => entry.registryId), installOrder: plan.order.map((entry) => entry.registryId), verdict: runtime.verdict, ok: false, durationMs: performance.now() - started, error: runtime.error });
        const before = snapshotEngine(runtime.engine);
        const previewActions = await executePreviewPlan(runtime.engine, plan, globalObject);
        const after = snapshotEngine(runtime.engine);
        const events = [runtime.engine.getLastTickCommit?.()].filter(Boolean);
        const installOrder = runtime.engine.game?.installOrder ?? plan.order.map((entry) => entry.registryId);
        const disposal = disposeRuntime(runtime);
        if (!disposal.ok) throw new Error(`Preview disposal failed: ${disposal.errors.join("; ")}`);
        const receipt = addReceipt({
          id: `preview-${Date.now()}`, at: new Date().toISOString(), scopeNodeId,
          resolvedKits: plan.order.map((entry) => entry.registryId), installOrder,
          verdict: "passed", ok: true, stateDifference: stateDifference(before, after), previewActions, events,
          durationMs: performance.now() - started, disposed: disposal.disposed, error: null
        });
        return receipt;
      } catch (error) {
        const disposal = disposeRuntime(runtime);
        return addReceipt({ id: `preview-${Date.now()}`, at: new Date().toISOString(), scopeNodeId, verdict: "failed", ok: false, durationMs: performance.now() - started, disposed: disposal.disposed, disposalErrors: disposal.errors, error: error.message });
      } finally {
        disposeRuntime(runtime);
      }
    },
    async play(scopeNodeId = draft.rootNodeId) {
      if (dirty) return { ok: false, error: "Apply the draft before Play." };
      stop();
      const plan = planTree(scopeNodeId);
      if (!plan.ok) return { ok: false, error: plan.errors?.[0]?.message ?? "Composition plan failed." };
      const runtime = await createRuntime(plan);
      if (!runtime.ok) return runtime;
      playRuntime = { engine: runtime.engine, frameId: null, intervalId: null, lastTime: performance.now() };
      const frame = (time) => {
        if (!playRuntime?.engine) return;
        playRuntime.engine.tick(Math.min(1 / 15, Math.max(0, (time - playRuntime.lastTime) / 1000)));
        playRuntime.lastTime = time;
        playRuntime.frameId = globalObject.requestAnimationFrame?.(frame) ?? null;
      };
      if (globalObject.requestAnimationFrame) playRuntime.frameId = globalObject.requestAnimationFrame(frame);
      else playRuntime.intervalId = globalObject.setInterval?.(() => playRuntime?.engine?.tick(1 / 60), 1000 / 60);
      return { ok: true, installOrder: plan.order.map((entry) => entry.registryId) };
    },
    stop,
    getReceipts: () => clone(project.previewReceipts ?? []),
    getTree: () => clone(activeTree())
  });
}
