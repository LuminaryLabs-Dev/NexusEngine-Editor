import {
  addSequenceStep,
  applyEditorProjectSnapshot,
  applyGameAuthoringTemplate,
  appendSceneObjectGroup,
  appendScenePreset,
  appendSceneObject,
  assignComponentToObject,
  assignComponentToObjects,
  assignDomainKitToObject,
  assignDomainKitToObjects,
  buildDomainStackHealth,
  buildEditorExportManifest,
  buildSceneObjectStats,
  clone,
  createEditorProject,
  createEditorProjectFileName,
  createEditorProjectSnapshot,
  createSequencePlaybackState,
  deleteSceneObject,
  duplicateSceneObject,
  filterDomainStack,
  filterSceneObjects,
  getSceneObject,
  getSceneObjectWindow,
  getGameAuthoringTemplate,
  getSceneAuthoringPreset,
  listGameAuthoringTemplates,
  listSceneAuthoringPresets,
  listSequenceEventOptions,
  reorderDomainKit,
  selectSceneObject,
  updateSequenceStepLink,
  validateSequenceLinks,
  updateSceneObjectTransform
} from "./editor-domain-model.js";
import { buildDskGameHtml, createDskGameFileName } from "./dsk-html-builder.js";
import {
  EDITOR_FEATURE_CONTRACTS_KIT_ID,
  listEditorFeatureContracts,
  validateEditorFeatureContracts
} from "./kits/editor-feature-contracts-kit/index.js";

export const NEXUS_ENGINE_CDN_URL = "https://cdn.jsdelivr.net/gh/LuminaryLabs-Dev/NexusEngine@0.0.3/src/index.js";
const DEFAULT_PROJECT_STORAGE_KEY = "nexusengine-editor:project-snapshot";
const VIEWPORT_TOOL_IDS = Object.freeze(["select", "move", "rotate", "scale", "pan"]);
const VIEWPORT_TOOL_SET = new Set(VIEWPORT_TOOL_IDS);

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.slice() : [value];
}

function normalizeTokenList(value, fieldName, kitId) {
  return asList(value).map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new TypeError(`Runtime kit ${kitId} has an invalid ${fieldName} entry.`);
    }
    return entry;
  });
}

function createFallbackNexusEngine() {
  function defineRuntimeKit(config = {}) {
    const id = config.id ?? "runtime-kit";
    return Object.freeze({
      id,
      requires: normalizeTokenList(config.requires, "requires", id),
      provides: normalizeTokenList(config.provides, "provides", id),
      bindings: Object.freeze({ ...(config.bindings ?? {}) }),
      metadata: Object.freeze({ ...(config.metadata ?? {}) }),
      install: config.install
    });
  }

  function createGameKitComposer(config = {}) {
    const sourceKits = asList(config.kits);
    const seenIds = new Set();
    const pending = [];
    for (const kit of sourceKits) {
      if (!kit || typeof kit !== "object") throw new TypeError("createGameKitComposer expects runtime kit objects.");
      if (typeof kit.id !== "string" || kit.id.trim().length === 0) throw new TypeError("Runtime kits composed for a game must have stable ids.");
      if (seenIds.has(kit.id)) throw new Error(`Duplicate runtime kit id: ${kit.id}`);
      seenIds.add(kit.id);
      pending.push(kit);
    }

    const orderedKits = [];
    const available = new Set(asList(config.provides));
    while (pending.length) {
      let installedIndex = -1;
      for (let index = 0; index < pending.length; index += 1) {
        const kit = pending[index];
        if (normalizeTokenList(kit.requires, "requires", kit.id).every((token) => available.has(token))) {
          installedIndex = index;
          break;
        }
      }
      if (installedIndex === -1) {
        const blocked = pending.map((kit) => ({
          id: kit.id,
          missing: normalizeTokenList(kit.requires, "requires", kit.id).filter((token) => !available.has(token))
        }));
        throw new Error(`Unable to resolve runtime kit dependencies: ${JSON.stringify(blocked)}`);
      }
      const [kit] = pending.splice(installedIndex, 1);
      orderedKits.push(kit);
      available.add(kit.id);
      for (const token of normalizeTokenList(kit.provides, "provides", kit.id)) available.add(token);
    }

    const bindings = {};
    for (const kit of orderedKits) Object.assign(bindings, kit.bindings ?? {});
    return Object.freeze({
      kits: orderedKits,
      orderedKits,
      installOrder: orderedKits.map((kit) => kit.id),
      provides: Array.from(available),
      bindings,
      getBinding(name) {
        return bindings[name];
      },
      hasProvider(name) {
        return available.has(name);
      }
    });
  }

  function createRealtimeGame(config = {}) {
    const composer = config.composer ?? createGameKitComposer({ kits: config.kits ?? [] });
    const engine = {
      world: {},
      scheduler: { addSystem() {} },
      n: {},
      kits: composer.kits.slice(),
      gameComposer: composer,
      game: {
        root: config.root ?? config.canvas ?? null,
        bindings: composer.bindings,
        installOrder: composer.installOrder
      }
    };
    for (const kit of composer.kits) {
      if (typeof kit.install === "function") kit.install({ engine, kit, world: engine.world });
    }
    return engine;
  }

  return Object.freeze({
    defineRuntimeKit,
    createGameKitComposer,
    createRealtimeGame
  });
}

function isNexusEngineModule(candidate) {
  return Boolean(
    candidate &&
    typeof candidate.defineRuntimeKit === "function" &&
    typeof candidate.createGameKitComposer === "function" &&
    typeof candidate.createRealtimeGame === "function"
  );
}

function createProjectStorageAdapter(storage = globalThis?.localStorage) {
  const memory = new Map();
  return {
    getItem(key) {
      try {
        return storage?.getItem?.(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      try {
        storage?.setItem?.(key, value);
      } catch {
        memory.set(key, value);
      }
      if (!storage?.setItem) memory.set(key, value);
    },
    removeItem(key) {
      try {
        storage?.removeItem?.(key);
      } catch {
        memory.delete(key);
      }
      if (!storage?.removeItem) memory.delete(key);
    }
  };
}

export async function loadNexusEngineModule(options = {}) {
  const {
    allowRemote = true,
    globalObject = globalThis,
    importModule = (url) => import(url),
    timeoutMs = 2500,
    url = globalObject?.NEXUS_ENGINE_URL ?? NEXUS_ENGINE_CDN_URL
  } = options;

  if (isNexusEngineModule(globalObject?.NexusEngine)) {
    return { module: globalObject.NexusEngine, source: "global:NexusEngine" };
  }

  if (allowRemote && typeof url === "string" && url) {
    try {
      const module = await Promise.race([
        importModule(url),
        new Promise((_, reject) => {
          globalObject.setTimeout?.(() => reject(new Error("NexusEngine import timed out.")), timeoutMs);
        })
      ]);
      if (isNexusEngineModule(module)) return { module, source: url };
    } catch {
      return { module: null, source: "fallback:remote-unavailable" };
    }
  }

  return { module: null, source: "fallback:no-module" };
}

export function createEditorRuntimeKits(options = {}) {
  const { NexusEngine, state, recordEvent = () => {} } = options;
  const defineRuntimeKit = NexusEngine.defineRuntimeKit;
  const projectStorage = createProjectStorageAdapter(options.projectStorage);
  const projectStorageKey = state.projectPersistence?.storageKey ?? DEFAULT_PROJECT_STORAGE_KEY;
  const kitMutationMode = options.kitMutationMode === "cli" ? "cli" : "read-only";

  function assertKitMutationAllowed(action) {
    if (kitMutationMode === "cli") return;
    throw new Error(`${action} is CLI-only. Use npm run cli -- operations submit install-kit --param kit=<registry-kit-id>.`);
  }

  const composition = {
    getManifest() {
      return buildEditorExportManifest(state.project);
    },
    assignDomainKit(objectId, domainPath) {
      const object = assignDomainKitToObject(state.project, objectId, domainPath);
      if (object) recordEvent("editor.composition.domain-kit.assigned", { domainPath, objectId: object.id });
      return object;
    },
    assignDomainKitToObjects(objectIds, domainPath) {
      const objects = assignDomainKitToObjects(state.project, objectIds, domainPath);
      if (objects.length) recordEvent("editor.composition.domain-kit.bulk-assigned", { domainPath, count: objects.length });
      return objects;
    },
    assignComponent(objectId, componentName, component) {
      const object = assignComponentToObject(state.project, objectId, componentName, component);
      if (object) recordEvent("editor.composition.component.assigned", { domainPath: "n:scene", objectId: object.id, componentName });
      return object;
    },
    assignComponentToObjects(objectIds, componentName, component) {
      const objects = assignComponentToObjects(state.project, objectIds, componentName, component);
      if (objects.length) recordEvent("editor.composition.component.bulk-assigned", { domainPath: "n:scene", count: objects.length, componentName });
      return objects;
    }
  };

  const kitRegistry = {
    list(filter = {}) {
      return state.domainKitRegistry.list(filter);
    },
    search(query = "", filter = {}) {
      return state.domainKitRegistry.search(query, filter);
    },
    categories() {
      return state.domainKitRegistry.listCategories();
    },
    get(id) {
      return state.domainKitRegistry.get(id);
    },
    findCompatibleKits(id) {
      return state.domainKitRegistry.findCompatibleKits(id);
    },
    snapshot() {
      return state.domainKitRegistry.snapshot();
    }
  };

  function installKitInternal(id) {
    const result = state.domainKitInstaller.installKit(state.project, id);
    const domain = result.domain ?? result.installed?.at(-1) ?? null;
    if (domain) state.selectedDomainPath = domain.domainPath;
    state.configureSubject = "domain";
    state.kitPicker.lastInstallPlan = result.plan ?? null;
    recordEvent("editor.registry.install-kit", {
      domainPath: domain?.domainPath ?? "n:registry:install",
      kitId: id,
      installOrder: result.plan?.installOrder ?? []
    });
    return result;
  }

  function installDomainInternal(domain) {
    const result = state.domainKitInstaller.installDomain(state.project, domain);
    const selected = result.installed?.at(-1) ?? null;
    if (selected) state.selectedDomainPath = selected.domainPath;
    state.configureSubject = "domain";
    recordEvent("editor.registry.install-domain", { domainPath: selected?.domainPath ?? "n:registry:install", domain });
    return result;
  }

  function installBundleInternal(id) {
    const result = state.domainKitInstaller.installBundle(state.project, id);
    const selected = result.domain ?? result.installed?.at(-1) ?? null;
    if (selected) state.selectedDomainPath = selected.domainPath;
    state.configureSubject = "domain";
    state.kitPicker.lastInstallPlan = result.plan ?? null;
    recordEvent("editor.registry.install-bundle", {
      domainPath: selected?.domainPath ?? "n:registry:install",
      kitId: id,
      installOrder: result.plan?.installOrder ?? []
    });
    return result;
  }

  function installAllInternal() {
    const result = state.domainKitInstaller.installAll(state.project);
    const selected = result.installed?.at(-1) ?? null;
    if (selected) state.selectedDomainPath = selected.domainPath;
    state.configureSubject = "domain";
    recordEvent("editor.registry.install-all", { domainPath: selected?.domainPath ?? "n:registry:install", count: result.installed?.length ?? 0 });
    return result;
  }

  const kitInstaller = {
    mutationMode: kitMutationMode,
    createInstallPlan(id, options = {}) {
      return state.domainKitInstaller.createInstallPlan(id, options);
    },
    installKit(id) {
      assertKitMutationAllowed("installKit");
      return installKitInternal(id);
    },
    installDomain(domain) {
      assertKitMutationAllowed("installDomain");
      return installDomainInternal(domain);
    },
    installBundle(id) {
      assertKitMutationAllowed("installBundle");
      return installBundleInternal(id);
    },
    installAll() {
      assertKitMutationAllowed("installAll");
      return installAllInternal();
    }
  };

  const domainStack = {
    setViewMode(mode = "stack") {
      state.domainStackView.mode = mode === "map" ? "map" : "stack";
      recordEvent("editor.domain.view.changed", { domainPath: "n:editor:domain-stack", mode: state.domainStackView.mode });
      return state.domainStackView.mode;
    },
    setStackQuery(query = "") {
      state.domainStackView.query = String(query ?? "");
      return state.domainStackView.query;
    },
    setHealthFilter(health = "all") {
      state.domainStackView.health = ["all", "ready", "attention", "missing"].includes(health) ? health : "all";
      return state.domainStackView.health;
    },
    getHealth() {
      return buildDomainStackHealth(state.project);
    },
    getVisibleRows() {
      return filterDomainStack(state.project, state.domainStackView);
    },
    togglePicker(open = !state.kitPicker.open) {
      state.kitPicker.open = Boolean(open);
      recordEvent("editor.registry.picker", { domainPath: "n:registry:search", open: state.kitPicker.open });
      return state.kitPicker.open;
    },
    setPickerQuery(query = "") {
      state.kitPicker.query = String(query ?? "");
      return state.kitPicker.query;
    },
    setPickerCategory(category = "") {
      state.kitPicker.category = String(category ?? "");
      return state.kitPicker.category;
    },
    selectKit(id) {
      if (!state.domainKitRegistry.get(id)) return null;
      state.kitPicker.selectedKitId = id;
      state.kitPicker.lastInstallPlan = kitInstaller.createInstallPlan(id);
      recordEvent("editor.registry.selected", { domainPath: "n:registry:search", kitId: id });
      return state.domainKitRegistry.get(id);
    },
    getSelectedKit() {
      return state.domainKitRegistry.get(state.kitPicker.selectedKitId);
    },
    searchKits(query = state.kitPicker.query, filter = {}) {
      return kitRegistry.search(query, {
        ...filter,
        ...(state.kitPicker.category ? { category: state.kitPicker.category } : {})
      });
    },
    createInstallPlan(id = state.kitPicker.selectedKitId, options = {}) {
      return kitInstaller.createInstallPlan(id, options);
    },
    addKit(id = state.kitPicker.selectedKitId, options = {}) {
      assertKitMutationAllowed("addKit");
      const selected = state.domainKitRegistry.get(id);
      const result = selected?.children?.length && options.includeChildren ? installBundleInternal(id) : installKitInternal(id);
      const domain = result.domain ?? result.installed?.at(-1) ?? null;
      if (domain) state.selectedDomainPath = domain.domainPath;
      state.configureSubject = "domain";
      state.kitPicker.open = false;
      recordEvent("editor.domain.added", { domainPath: domain?.domainPath ?? "n:registry:install", kitId: id });
      return domain;
    },
    reorderSelected() {
      const kit = reorderDomainKit(state.project, state.selectedDomainPath);
      recordEvent("editor.domain.reordered", { domainPath: kit?.domainPath ?? state.selectedDomainPath });
      return kit;
    }
  };

  const sceneObject = {
    setQuery(query = "") {
      state.sceneObjectView.query = String(query ?? "");
      return state.sceneObjectView.query;
    },
    setBatchSize(count = 25) {
      state.sceneObjectView.batchSize = Math.max(1, Math.min(1000, Math.floor(Number(count) || 25)));
      return state.sceneObjectView.batchSize;
    },
    setVisibleLimit(limit = 100) {
      state.sceneObjectView.limit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 100)));
      return state.sceneObjectView.limit;
    },
    getStats() {
      return buildSceneObjectStats(state.project);
    },
    getWindow() {
      return getSceneObjectWindow(state.project, state.sceneObjectView);
    },
    getVisibleObjects() {
      return filterSceneObjects(state.project, state.sceneObjectView);
    },
    addCube() {
      const object = appendSceneObject(state.project);
      state.selectedObjectId = object.id;
      state.selectedDomainPath = "n:scene";
      state.configureSubject = "object";
      recordEvent("editor.scene.object.added", { domainPath: "n:scene", objectId: object.id });
      return object;
    },
    addCubeGroup(count = state.sceneObjectView.batchSize ?? 25) {
      const objects = appendSceneObjectGroup(state.project, count);
      const selected = objects.at(-1) ?? null;
      if (selected) {
        state.selectedObjectId = selected.id;
        state.selectedDomainPath = "n:scene";
        state.configureSubject = "object";
      }
      recordEvent("editor.scene.object.group.added", { domainPath: "n:scene", count: objects.length, selectedObjectId: selected?.id });
      return objects;
    },
    duplicateSelected() {
      const object = duplicateSceneObject(state.project, state.selectedObjectId);
      if (!object) return null;
      state.selectedObjectId = object.id;
      state.selectedDomainPath = "n:scene";
      state.configureSubject = "object";
      recordEvent("editor.scene.object.duplicated", { domainPath: "n:scene", objectId: object.id });
      return object;
    },
    deleteSelected() {
      const removed = deleteSceneObject(state.project, state.selectedObjectId);
      const selected = state.project.scene3d.objects.find((object) => object.selected) ?? state.project.scene3d.objects[0] ?? null;
      state.selectedObjectId = selected?.id ?? "";
      state.selectedDomainPath = "n:scene";
      state.configureSubject = "object";
      recordEvent("editor.scene.object.deleted", { domainPath: "n:scene", objectId: removed?.id ?? "" });
      return removed;
    },
    select(objectId) {
      const object = selectSceneObject(state.project, objectId);
      if (!object) return null;
      state.selectedObjectId = object.id;
      state.selectedDomainPath = "n:scene";
      state.configureSubject = "object";
      recordEvent("editor.scene.object.selected", { domainPath: "n:scene", objectId: object.id });
      return object;
    },
    updateTransform(field, value) {
      const object = updateSceneObjectTransform(state.project, state.selectedObjectId, field, value);
      if (object) recordEvent("editor.scene.object.transform.changed", { domainPath: "n:scene", objectId: object.id, field });
      return object;
    },
    assignSelectedDomain() {
      const object = composition.assignDomainKit(state.selectedObjectId, state.selectedDomainPath);
      if (!object) return null;
      const componentName = state.selectedDomainPath.replace(/^n:/, "").replaceAll(":", "-");
      composition.assignComponent(state.selectedObjectId, componentName, {
        domainPath: state.selectedDomainPath,
        enabled: true
      });
      return object;
    },
    assignSelectedDomainToVisible() {
      const visible = filterSceneObjects(state.project, state.sceneObjectView);
      const objectIds = visible.map((object) => object.id);
      const componentName = state.selectedDomainPath.replace(/^n:/, "").replaceAll(":", "-");
      const objects = composition.assignDomainKitToObjects(objectIds, state.selectedDomainPath);
      composition.assignComponentToObjects(objectIds, componentName, {
        domainPath: state.selectedDomainPath,
        enabled: true
      });
      recordEvent("editor.scene.object.visible-assigned", {
        domainPath: state.selectedDomainPath,
        count: objects.length,
        query: state.sceneObjectView.query
      });
      return objects;
    }
  };

  function ensureViewportToolState() {
    state.viewportTool ??= {};
    state.viewportTool.active = VIEWPORT_TOOL_SET.has(state.viewportTool.active) ? state.viewportTool.active : "select";
    state.viewportTool.nudgeStep = Math.max(0.01, Math.min(10, Number(state.viewportTool.nudgeStep) || 0.25));
    state.viewportTool.rotateStep = Math.max(1, Math.min(90, Number(state.viewportTool.rotateStep) || 15));
    state.viewportTool.scaleStep = Math.max(0.01, Math.min(1, Number(state.viewportTool.scaleStep) || 0.1));
    state.viewportTool.lastAction = String(state.viewportTool.lastAction ?? "");
    return state.viewportTool;
  }

  function selectedTransformValue(object, group, axis) {
    const fallback = group === "scale" ? 1 : 0;
    return Number(object?.transform?.[group]?.[axis] ?? fallback);
  }

  const viewportTools = {
    listTools() {
      return VIEWPORT_TOOL_IDS.slice();
    },
    getState() {
      return clone(ensureViewportToolState());
    },
    setTool(tool = "select") {
      const nextTool = VIEWPORT_TOOL_SET.has(tool) ? tool : "select";
      const toolState = ensureViewportToolState();
      toolState.active = nextTool;
      toolState.lastAction = `tool:${nextTool}`;
      if (nextTool !== "pan") {
        const selected = selectSceneObject(state.project, state.selectedObjectId);
        state.selectedObjectId = selected?.id ?? state.selectedObjectId;
        state.selectedDomainPath = "n:scene";
        state.configureSubject = "object";
      }
      recordEvent("editor.viewport.tool.selected", {
        domainPath: "n:editor:selection",
        tool: nextTool,
        objectId: state.selectedObjectId
      });
      return clone(toolState);
    },
    nudge(axis = "x", direction = 1) {
      const cleanAxis = ["x", "y", "z"].includes(axis) ? axis : "x";
      const toolState = ensureViewportToolState();
      const active = ["move", "rotate", "scale"].includes(toolState.active) ? toolState.active : "move";
      const object = getSceneObject(state.project, state.selectedObjectId);
      if (!object) return null;
      const group = active === "move" ? "position" : active === "rotate" ? "rotation" : "scale";
      const step = active === "move" ? toolState.nudgeStep : active === "rotate" ? toolState.rotateStep * Math.PI / 180 : toolState.scaleStep;
      const sign = Number(direction) < 0 ? -1 : 1;
      const current = selectedTransformValue(object, group, cleanAxis);
      const nextValue = active === "scale" ? Math.max(0.05, current + step * sign) : current + step * sign;
      const updated = updateSceneObjectTransform(state.project, object.id, `${group}.${cleanAxis}`, nextValue);
      state.selectedObjectId = updated?.id ?? object.id;
      state.selectedDomainPath = "n:scene";
      state.configureSubject = "object";
      toolState.active = active;
      toolState.lastAction = `${active}.${cleanAxis}${sign > 0 ? "+" : "-"}`;
      recordEvent("editor.viewport.tool.nudged", {
        domainPath: "n:editor:selection",
        tool: active,
        axis: cleanAxis,
        direction: sign,
        field: `${group}.${cleanAxis}`,
        value: updated?.transform?.[group]?.[cleanAxis],
        objectId: updated?.id
      });
      return updated;
    },
    resetSelectedTransform() {
      const object = getSceneObject(state.project, state.selectedObjectId);
      if (!object) return null;
      updateSceneObjectTransform(state.project, object.id, "position.x", 0);
      updateSceneObjectTransform(state.project, object.id, "position.y", 1);
      updateSceneObjectTransform(state.project, object.id, "position.z", 0);
      updateSceneObjectTransform(state.project, object.id, "rotation.x", 0);
      updateSceneObjectTransform(state.project, object.id, "rotation.y", 0);
      updateSceneObjectTransform(state.project, object.id, "rotation.z", 0);
      updateSceneObjectTransform(state.project, object.id, "scale.x", 1);
      updateSceneObjectTransform(state.project, object.id, "scale.y", 1);
      updateSceneObjectTransform(state.project, object.id, "scale.z", 1);
      const toolState = ensureViewportToolState();
      toolState.lastAction = "transform.reset";
      state.selectedDomainPath = "n:scene";
      state.configureSubject = "object";
      recordEvent("editor.viewport.tool.reset-transform", {
        domainPath: "n:editor:selection",
        objectId: object.id
      });
      return getSceneObject(state.project, object.id);
    }
  };

  const scenePreset = {
    list() {
      return listSceneAuthoringPresets();
    },
    getSelected() {
      return getSceneAuthoringPreset(state.sceneObjectView.presetId);
    },
    setPreset(id) {
      const preset = getSceneAuthoringPreset(id);
      if (!preset) return null;
      state.sceneObjectView.presetId = preset.id;
      recordEvent("editor.scene.preset.selected", { domainPath: "n:editor:scene-preset", presetId: preset.id });
      return preset;
    },
    apply(count = state.sceneObjectView.batchSize ?? undefined) {
      const preset = getSceneAuthoringPreset(state.sceneObjectView.presetId);
      const objects = appendScenePreset(state.project, preset.id, { count });
      const selected = objects.at(-1) ?? null;
      if (selected) {
        state.selectedObjectId = selected.id;
        state.selectedDomainPath = "n:scene";
        state.configureSubject = "object";
      }
      recordEvent("editor.scene.preset.applied", {
        domainPath: "n:editor:scene-preset",
        presetId: preset.id,
        count: objects.length,
        selectedObjectId: selected?.id
      });
      return objects;
    }
  };

  const gameTemplate = {
    list() {
      return listGameAuthoringTemplates();
    },
    getSelected() {
      return getGameAuthoringTemplate(state.gameTemplateView?.selectedTemplateId);
    },
    setTemplate(id) {
      const template = getGameAuthoringTemplate(id);
      state.gameTemplateView ??= {};
      state.gameTemplateView.selectedTemplateId = template.id;
      recordEvent("editor.game-template.selected", { domainPath: "n:editor:game-template", templateId: template.id });
      return template;
    },
    apply(count) {
      state.gameTemplateView ??= {};
      const template = getGameAuthoringTemplate(state.gameTemplateView.selectedTemplateId);
      if ((template.installBundles?.length ?? 0) || (template.installKitIds?.length ?? 0)) {
        assertKitMutationAllowed("applyGameTemplate");
      }
      const installed = [];
      for (const bundleId of template.installBundles ?? []) {
        installed.push(...(installBundleInternal(bundleId).installed ?? []));
      }
      for (const kitId of template.installKitIds ?? []) {
        installed.push(...(installKitInternal(kitId).installed ?? []));
      }
      const result = applyGameAuthoringTemplate(state.project, template.id, { count });
      const addedStepIds = [];
      for (const link of template.sequenceLinks ?? []) {
        const step = addSequenceStep(state.project, link.domainPath);
        const linked = updateSequenceStepLink(state.project, step.id, link);
        if (linked) addedStepIds.push(linked.id);
      }
      state.gameTemplateView = {
        ...state.gameTemplateView,
        selectedTemplateId: template.id,
        lastAppliedTemplateId: template.id,
        lastObjectCount: result.objects.length,
        lastSequenceStepIds: addedStepIds
      };
      const selected = result.objects.at(-1) ?? null;
      if (selected) {
        state.selectedObjectId = selected.id;
        state.selectedDomainPath = "n:scene";
        state.configureSubject = "object";
      }
      state.sequencePlayback = createSequencePlaybackState(state.project);
      recordEvent("editor.game-template.applied", {
        domainPath: "n:editor:game-template",
        templateId: template.id,
        objectCount: result.objects.length,
        installedKitCount: installed.length,
        sequenceStepCount: addedStepIds.length
      });
      return { ...result, installed, sequenceStepIds: addedStepIds };
    }
  };

  const sequenceTimeline = {
    ensurePlayback() {
      state.sequencePlayback = state.sequencePlayback ?? createSequencePlaybackState(state.project);
      if (!state.sequencePlayback.activeStepId || !state.project.sequenceSteps.some((step) => step.id === state.sequencePlayback.activeStepId)) {
        state.sequencePlayback.activeStepId = state.project.sequenceSteps[0]?.id ?? "";
      }
      return state.sequencePlayback;
    },
    getLinkOptions(stepId = state.selectedSequenceStepId) {
      const step = state.project.sequenceSteps.find((item) => item.id === stepId) ?? state.project.sequenceSteps[0] ?? null;
      const domains = listSequenceEventOptions(state.project);
      const sourceDomainPath = step?.domainPath ?? domains[0]?.domainPath ?? "";
      const targetDomainPath = step?.targetDomainPath ?? domains[0]?.domainPath ?? "";
      return {
        step,
        domains,
        sourceEvents: domains.find((domain) => domain.domainPath === sourceDomainPath)?.events ?? [],
        targetOutputs: domains.find((domain) => domain.domainPath === targetDomainPath)?.outputs ?? []
      };
    },
    getPlayback() {
      return clone(sequenceTimeline.ensurePlayback());
    },
    addStep() {
      const step = addSequenceStep(state.project, state.selectedDomainPath);
      state.selectedSequenceStepId = step.id;
      state.configureSubject = "sequence-step";
      state.sequencePlayback = { ...sequenceTimeline.ensurePlayback(), activeStepId: step.id };
      recordEvent("editor.sequence.step.added", { domainPath: step.domainPath, stepId: step.id });
      return step;
    },
    updateStepLink(stepId = state.selectedSequenceStepId, patch = {}) {
      const step = updateSequenceStepLink(state.project, stepId, patch);
      if (!step) return null;
      state.selectedSequenceStepId = step.id;
      state.selectedDomainPath = step.domainPath;
      state.configureSubject = "sequence-step";
      recordEvent("editor.sequence.link.updated", {
        domainPath: step.domainPath,
        stepId: step.id,
        event: step.event,
        targetDomainPath: step.targetDomainPath,
        targetOutput: step.targetOutput
      });
      return step;
    },
    linkEvent(patch = {}) {
      const step = state.project.sequenceSteps.find((item) => item.id === state.selectedSequenceStepId) ?? state.project.sequenceSteps[0];
      if (!step) return null;
      const linked = updateSequenceStepLink(state.project, step.id, patch);
      state.selectedSequenceStepId = linked.id;
      state.selectedDomainPath = linked.domainPath;
      state.configureSubject = "sequence-step";
      recordEvent("editor.sequence.event.linked", {
        domainPath: linked.domainPath,
        stepId: linked.id,
        event: linked.event,
        targetDomainPath: linked.targetDomainPath,
        targetOutput: linked.targetOutput
      });
      return linked;
    },
    runStep(stepId = state.selectedSequenceStepId) {
      const playback = sequenceTimeline.ensurePlayback();
      const ordered = state.project.sequenceSteps.slice().sort((a, b) => a.order - b.order);
      const step = ordered.find((item) => item.id === stepId) ?? ordered.find((item) => item.id === playback.activeStepId) ?? ordered[0] ?? null;
      if (!step) return null;
      const sequenceGraph = validateSequenceLinks(state.project);
      const link = sequenceGraph.links.find((item) => item.id === step.id);
      const status = link?.ok ? "delivered" : "blocked";
      const receipt = {
        id: `sequence-receipt-${String(playback.runCount + 1).padStart(3, "0")}`,
        stepId: step.id,
        order: step.order,
        domainPath: step.domainPath,
        event: step.event,
        targetDomainPath: step.targetDomainPath,
        targetOutput: step.targetOutput,
        status,
        errors: link?.errors ?? [],
        deliveredAt: new Date().toISOString()
      };
      const next = ordered.find((item) => item.order > step.order) ?? null;
      playback.runCount += 1;
      playback.lastStepId = step.id;
      playback.activeStepId = next?.id ?? step.id;
      playback.status = status === "blocked" ? "blocked" : next ? "running" : "complete";
      playback.receipts = [...(playback.receipts ?? []).slice(-19), receipt];
      state.selectedSequenceStepId = playback.activeStepId;
      const activeStep = state.project.sequenceSteps.find((item) => item.id === state.selectedSequenceStepId) ?? step;
      state.selectedDomainPath = activeStep.domainPath;
      state.configureSubject = "sequence-step";
      recordEvent("editor.sequence.step.ran", {
        domainPath: step.domainPath,
        stepId: step.id,
        event: step.event,
        targetDomainPath: step.targetDomainPath,
        targetOutput: step.targetOutput,
        status
      });
      return receipt;
    },
    runAll() {
      const playback = sequenceTimeline.ensurePlayback();
      const ordered = state.project.sequenceSteps.slice().sort((a, b) => a.order - b.order);
      const receipts = [];
      playback.status = "running";
      for (const step of ordered) {
        const receipt = sequenceTimeline.runStep(step.id);
        if (receipt) receipts.push(receipt);
        if (receipt?.status === "blocked") break;
      }
      playback.status = receipts.some((receipt) => receipt.status === "blocked") ? "blocked" : "complete";
      const last = receipts.at(-1) ?? null;
      if (last?.stepId) {
        playback.activeStepId = last.stepId;
        state.selectedSequenceStepId = last.stepId;
      }
      const selectedStep = state.project.sequenceSteps.find((step) => step.id === state.selectedSequenceStepId);
      if (selectedStep) state.selectedDomainPath = selectedStep.domainPath;
      state.configureSubject = "sequence-step";
      recordEvent("editor.sequence.run.completed", {
        domainPath: "n:editor:sequence",
        count: receipts.length,
        status: playback.status
      });
      return receipts;
    },
    resetPlayback() {
      state.sequencePlayback = createSequencePlaybackState(state.project);
      state.selectedSequenceStepId = state.sequencePlayback.activeStepId;
      const selectedStep = state.project.sequenceSteps.find((step) => step.id === state.selectedSequenceStepId);
      if (selectedStep) state.selectedDomainPath = selectedStep.domainPath;
      state.configureSubject = "sequence-step";
      recordEvent("editor.sequence.playback.reset", { domainPath: "n:editor:sequence" });
      return state.sequencePlayback;
    },
    validate() {
      const stackHealth = buildDomainStackHealth(state.project);
      const sequenceGraph = validateSequenceLinks(state.project);
      recordEvent("editor.sequence.validated", {
        domainPath: "n:editor:sequence",
        severity: sequenceGraph.invalidLinks.length || !stackHealth.ok ? "warning" : "info",
        invalidSteps: sequenceGraph.invalidLinks.map((link) => link.id),
        missingRequires: stackHealth.rows.flatMap((row) => row.missingRequires)
      });
      return { ok: sequenceGraph.ok && stackHealth.ok, invalidSteps: sequenceGraph.invalidLinks, sequenceGraph, stackHealth };
    }
  };

  const runtimeInteraction = {
    getState() {
      return state.project.scene3d?.runtimeInteraction ?? null;
    },
    getClickableObjects() {
      return (state.project.scene3d?.objects ?? []).filter((object) => object.components?.runtimeClickable);
    },
    getStats() {
      const runtimeState = state.project.scene3d?.runtimeInteraction ?? null;
      const clickableObjects = runtimeInteraction.getClickableObjects();
      return {
        domainPath: runtimeState?.domainPath ?? "n:runtime:interaction",
        clickableObjectCount: clickableObjects.length,
        score: Number(runtimeState?.score || 0),
        hitObjectCount: Array.isArray(runtimeState?.hitObjectIds) ? runtimeState.hitObjectIds.length : 0,
        roundStatus: runtimeState?.roundStatus ?? "idle"
      };
    }
  };

  const projectPersistence = {
    createSnapshot() {
      return createEditorProjectSnapshot(state.project, state);
    },
    getStatus() {
      const stored = projectStorage.getItem(projectStorageKey);
      return {
        ...state.projectPersistence,
        hasLocalSnapshot: Boolean(stored),
        storageKey: projectStorageKey,
        bytes: stored ? new TextEncoder().encode(stored).length : 0
      };
    },
    exportFile() {
      const snapshot = createEditorProjectSnapshot(state.project, state);
      const json = `${JSON.stringify(snapshot, null, 2)}\n`;
      const fileName = createEditorProjectFileName(snapshot);
      const bytes = new TextEncoder().encode(json).length;
      state.projectPersistence = {
        ...state.projectPersistence,
        status: "exported",
        lastSavedAt: snapshot.savedAt,
        lastExportedAt: snapshot.savedAt,
        lastExportFileName: fileName,
        lastExportJson: json,
        exportBytes: bytes
      };
      recordEvent("editor.project.exported", {
        domainPath: "n:editor:persistence",
        fileName,
        objectCount: snapshot.project.scene3d.objects.length,
        bytes
      });
      return { snapshot, json, fileName, bytes };
    },
    importFile(serialized, fileName = "project.project.json") {
      const json = typeof serialized === "string" ? serialized : String(serialized ?? "");
      const bytes = new TextEncoder().encode(json).length;
      let snapshot = null;
      try {
        snapshot = JSON.parse(json);
      } catch (error) {
        state.projectPersistence = {
          ...state.projectPersistence,
          status: "invalid",
          lastImportFileName: fileName,
          importBytes: bytes
        };
        recordEvent("editor.project.import.invalid", {
          domainPath: "n:editor:persistence",
          severity: "warning",
          fileName,
          message: error.message
        });
        throw new TypeError(`Project file is not valid JSON: ${error.message}`);
      }
      if (!snapshot?.project) {
        state.projectPersistence = {
          ...state.projectPersistence,
          status: "invalid",
          lastImportFileName: fileName,
          importBytes: bytes
        };
        recordEvent("editor.project.import.invalid", {
          domainPath: "n:editor:persistence",
          severity: "warning",
          fileName,
          message: "Missing project snapshot payload."
        });
        throw new TypeError("Project file is missing a project snapshot payload.");
      }
      applyEditorProjectSnapshot(state, snapshot);
      const importedAt = new Date().toISOString();
      state.projectPersistence = {
        ...state.projectPersistence,
        status: "imported",
        storageKey: projectStorageKey,
        lastSavedAt: snapshot.savedAt ?? state.projectPersistence?.lastSavedAt ?? "",
        lastImportedAt: importedAt,
        lastImportFileName: fileName,
        importBytes: bytes
      };
      state.build = { status: "idle", html: "", fileName: "", bytes: 0 };
      recordEvent("editor.project.imported", {
        domainPath: "n:editor:persistence",
        fileName,
        objectCount: state.project.scene3d.objects.length,
        bytes
      });
      return snapshot;
    },
    saveLocal() {
      const snapshot = createEditorProjectSnapshot(state.project, state);
      const serialized = JSON.stringify(snapshot);
      projectStorage.setItem(projectStorageKey, serialized);
      state.projectPersistence = {
        ...state.projectPersistence,
        status: "saved",
        storageKey: projectStorageKey,
        lastSavedAt: snapshot.savedAt,
        lastLoadedAt: state.projectPersistence?.lastLoadedAt ?? "",
        bytes: new TextEncoder().encode(serialized).length
      };
      recordEvent("editor.project.saved", {
        domainPath: "n:editor:persistence",
        objectCount: snapshot.project.scene3d.objects.length,
        bytes: state.projectPersistence.bytes
      });
      return snapshot;
    },
    loadLocal() {
      const serialized = projectStorage.getItem(projectStorageKey);
      if (!serialized) {
        state.projectPersistence = { ...state.projectPersistence, status: "missing", storageKey: projectStorageKey };
        recordEvent("editor.project.load.missing", { domainPath: "n:editor:persistence" });
        return null;
      }
      const snapshot = JSON.parse(serialized);
      applyEditorProjectSnapshot(state, snapshot);
      const loadedAt = new Date().toISOString();
      state.projectPersistence = {
        ...state.projectPersistence,
        status: "loaded",
        storageKey: projectStorageKey,
        lastSavedAt: snapshot.savedAt ?? state.projectPersistence?.lastSavedAt ?? "",
        lastLoadedAt: loadedAt,
        bytes: new TextEncoder().encode(serialized).length
      };
      state.build = { status: "idle", html: "", fileName: "", bytes: 0 };
      recordEvent("editor.project.loaded", {
        domainPath: "n:editor:persistence",
        objectCount: state.project.scene3d.objects.length,
        bytes: state.projectPersistence.bytes
      });
      return snapshot;
    },
    clearLocal() {
      projectStorage.removeItem(projectStorageKey);
      state.projectPersistence = { ...state.projectPersistence, status: "cleared", storageKey: projectStorageKey, bytes: 0 };
      recordEvent("editor.project.cleared", { domainPath: "n:editor:persistence" });
      return true;
    },
    resetProject() {
      projectStorage.removeItem(projectStorageKey);
      state.mode = "stopped";
      state.project = createEditorProject();
      state.selectedDomainPath = "n:physics";
      state.selectedSequenceStepId = state.project.sequenceSteps[1]?.id ?? state.project.sequenceSteps[0]?.id ?? "";
      state.selectedObjectId = state.project.scene3d.objects[0]?.id ?? "";
      state.configureSubject = "domain";
      state.sequencePlayback = createSequencePlaybackState(state.project);
      state.build = { status: "idle", html: "", fileName: "", bytes: 0 };
      state.projectPersistence = {
        ...state.projectPersistence,
        status: "reset",
        storageKey: projectStorageKey,
        lastSavedAt: "",
        lastLoadedAt: "",
        bytes: 0
      };
      recordEvent("editor.project.reset", { domainPath: "n:editor:persistence", objectCount: state.project.scene3d.objects.length });
      return createEditorProjectSnapshot(state.project, state);
    }
  };

  const htmlBuild = {
    build() {
      const manifest = buildEditorExportManifest(state.project);
      const html = buildDskGameHtml(manifest);
      state.build = {
        status: "ready",
        html,
        fileName: createDskGameFileName(manifest),
        bytes: new TextEncoder().encode(html).length
      };
      recordEvent("editor.build.html.ready", {
        domainPath: "n:build:web",
        fileName: state.build.fileName,
        bytes: state.build.bytes
      });
      return state.build;
    }
  };

  const featureContracts = {
    list: listEditorFeatureContracts,
    validate(requiredFeatureIds = []) {
      const validation = validateEditorFeatureContracts(requiredFeatureIds);
      recordEvent("editor.feature-contracts.validated", {
        domainPath: "n:editor:feature-contracts",
        severity: validation.ok ? "info" : "warning",
        total: validation.total,
        missing: validation.missing,
        invalid: validation.invalid
      });
      return validation;
    },
    getSnapshot() {
      return validateEditorFeatureContracts();
    }
  };

  return [
    defineRuntimeKit({
      id: "editor-composition-kit",
      provides: ["editor:composition"],
      bindings: { composition },
      metadata: { label: "Editor Composition", domainPath: "n:editor:composition" }
    }),
    defineRuntimeKit({
      id: EDITOR_FEATURE_CONTRACTS_KIT_ID,
      requires: ["editor:composition"],
      provides: ["editor:feature-contracts", "n:editor:feature-contracts"],
      bindings: { featureContracts },
      metadata: { label: "Editor Feature Contracts", domainPath: "n:editor:feature-contracts" }
    }),
    defineRuntimeKit({
      id: "editor-kit-registry-kit",
      requires: ["editor:composition", "editor:feature-contracts"],
      provides: ["editor:kit-registry", "n:registry", "n:registry:index", "n:registry:search", "n:registry:dependency"],
      bindings: { kitRegistry },
      metadata: { label: "Editor Kit Registry", domainPath: "n:registry" }
    }),
    defineRuntimeKit({
      id: "editor-kit-installer-kit",
      requires: ["editor:composition", "editor:kit-registry"],
      provides: ["editor:kit-installer", "n:registry:install", "n:registry:health"],
      bindings: { kitInstaller },
      metadata: { label: "Editor Kit Installer", domainPath: "n:registry:install" }
    }),
    defineRuntimeKit({
      id: "editor-domain-stack-kit",
      requires: ["editor:composition", "editor:kit-registry", "editor:kit-installer"],
      provides: ["editor:domain-stack"],
      bindings: { domainStack },
      metadata: { label: "Editor Domain Stack", domainPath: "n:editor:domain-stack" }
    }),
    defineRuntimeKit({
      id: "editor-scene-object-kit",
      requires: ["editor:composition"],
      provides: ["editor:scene-object"],
      bindings: { sceneObject },
      metadata: { label: "Editor Scene Objects", domainPath: "n:editor:scene-object" }
    }),
    defineRuntimeKit({
      id: "editor-scene-preset-kit",
      requires: ["editor:composition", "editor:scene-object"],
      provides: ["editor:scene-preset"],
      bindings: { scenePreset },
      metadata: { label: "Editor Scene Presets", domainPath: "n:editor:scene-preset" }
    }),
    defineRuntimeKit({
      id: "editor-selection-kit",
      requires: ["editor:composition", "editor:scene-object"],
      provides: ["editor:selection", "editor:viewport-tools", "n:editor:selection"],
      bindings: { viewportTools },
      metadata: { label: "Editor Selection Tools", domainPath: "n:editor:selection" }
    }),
    defineRuntimeKit({
      id: "editor-sequence-timeline-kit",
      requires: ["editor:composition", "editor:domain-stack", "editor:selection"],
      provides: ["editor:sequence-timeline"],
      bindings: { sequenceTimeline },
      metadata: { label: "Editor Sequence Timeline", domainPath: "n:editor:sequence-timeline" }
    }),
    defineRuntimeKit({
      id: "editor-game-template-kit",
      requires: ["editor:composition", "editor:kit-installer", "editor:scene-preset", "editor:sequence-timeline"],
      provides: ["editor:game-template", "n:editor:game-template"],
      bindings: { gameTemplate },
      metadata: { label: "Editor Game Templates", domainPath: "n:editor:game-template" }
    }),
    defineRuntimeKit({
      id: "editor-runtime-interaction-kit",
      requires: ["editor:composition", "editor:game-template", "editor:sequence-timeline"],
      provides: ["editor:runtime-interaction", "n:runtime:interaction"],
      bindings: { runtimeInteraction },
      metadata: { label: "Runtime Interaction", domainPath: "n:runtime:interaction" }
    }),
    defineRuntimeKit({
      id: "editor-project-persistence-kit",
      requires: ["editor:composition", "editor:runtime-interaction"],
      provides: ["editor:project-persistence", "n:persistence", "save:scene"],
      bindings: { projectPersistence },
      metadata: { label: "Editor Project Persistence", domainPath: "n:editor:persistence" }
    }),
    defineRuntimeKit({
      id: "editor-html-build-kit",
      requires: ["editor:composition", "editor:scene-object", "editor:sequence-timeline", "editor:project-persistence"],
      provides: ["editor:html-build"],
      bindings: { htmlBuild },
      metadata: { label: "Editor HTML Build", domainPath: "n:editor:html-build" }
    })
  ];
}

export function createNexusEngineEditorRuntime(options = {}) {
  const { state, root = null, canvas = null, NexusEngine: suppliedModule = null, source = "fallback:local" } = options;
  const kitMutationMode = options.kitMutationMode === "cli" ? "cli" : "read-only";
  const NexusEngine = isNexusEngineModule(suppliedModule) ? suppliedModule : createFallbackNexusEngine();
  const runtimeSource = isNexusEngineModule(suppliedModule) ? source : "fallback:compatible-nexusengine";
  const kits = createEditorRuntimeKits({
    NexusEngine,
    state,
    kitMutationMode,
    recordEvent: (type, payload) => options.recordEvent?.(type, payload)
  });
  const composer = NexusEngine.createGameKitComposer({ kits });
  const engine = NexusEngine.createRealtimeGame({ kits: composer.kits, composer, root, canvas });
  const bindings = composer.bindings ?? engine.game?.bindings ?? {};

  return {
    source: runtimeSource,
    engine,
    composer,
    kits,
    bindings,
    kitMutationMode,
    installOrder: composer.installOrder ?? kits.map((kit) => kit.id),
    provides: composer.provides ?? [],
    getBinding(name) {
      return typeof composer.getBinding === "function" ? composer.getBinding(name) : bindings[name];
    },
    getSnapshot() {
      return {
        source: runtimeSource,
        kitMutationMode,
        installOrder: composer.installOrder ?? [],
        provides: composer.provides ?? [],
        bindings: Object.keys(bindings)
      };
    }
  };
}
