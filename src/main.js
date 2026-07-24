import { createEditorState, recordEditorEvent } from "./kits/editor-kits.js";
import {
  buildEditorExportManifest,
  getKitConfig,
  getSceneObject,
  getSelectedDomain,
  normalizeViewportRuntimeConfig,
  selectSceneObject
} from "./editor-domain-model.js";
import { createNexusEngineEditorRuntime, loadNexusEngineModule } from "./nexus-engine-editor-runtime.js";
import { createCompositionController } from "./editor-composition.js";
import { createEditorRegistrySnapshot } from "./editor-kit-registry.js";
import { createViewportRenderer } from "./viewport-webgl.js";

const state = createEditorState();
const root = document.querySelector("#app");
let viewportRenderer = null;
const WORKSPACE_CONTEXTS = Object.freeze(new Set(["structure", "inspector", "behavior"]));
const WORKSPACE_SIZE_LIMITS = Object.freeze({
  structure: Object.freeze({ key: "structureWidth", min: 220, max: 360 }),
  inspector: Object.freeze({ key: "inspectorWidth", min: 280, max: 440 }),
  context: Object.freeze({ key: "contextWidth", min: 280, max: 420 }),
  behavior: Object.freeze({ key: "behaviorHeight", min: 180, max: 420 }),
  compact: Object.freeze({ key: "compactContextHeight", min: 220, max: 420 })
});
const VIEWPORT_TOOL_BUTTONS = Object.freeze([
  { id: "select", label: "↖", title: "Select" },
  { id: "move", label: "✣", title: "Move" },
  { id: "rotate", label: "↻", title: "Rotate" },
  { id: "scale", label: "□", title: "Scale" },
  { id: "pan", label: "✋", title: "Pan" }
]);
function localWorkspaceResourceUrl(parameter) {
  const requested = new URLSearchParams(globalThis.location?.search ?? "").get(parameter);
  if (!requested || !["127.0.0.1", "localhost"].includes(globalThis.location?.hostname)) return null;
  try {
    const url = new URL(requested, globalThis.location.href);
    return url.origin === globalThis.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

const localEngineUrl = localWorkspaceResourceUrl("engine");
let projectSourceUrl = localWorkspaceResourceUrl("project");
const nexusEngineLoad = await loadNexusEngineModule({
  allowRemote: true,
  url: localEngineUrl ?? undefined,
  timeoutMs: localEngineUrl ? 30000 : 2500
});
state.editorRuntime = createNexusEngineEditorRuntime({
  NexusEngine: nexusEngineLoad.module,
  source: nexusEngineLoad.source,
  state,
  root,
  recordEvent: (type, payload) => recordEditorEvent(state, type, payload)
});
if (projectSourceUrl) {
  try {
    const response = await fetch(projectSourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.editorRuntime.getBinding("projectPersistence").importFile(await response.text(), new URL(projectSourceUrl).pathname);
  } catch (error) {
    projectSourceUrl = null;
    state.compositionUi.message = `Project could not be opened: ${error.message}`;
  }
}
function rebuildCompositionController(selectedNodeId = null) {
  state.compositionController?.stop?.();
  state.compositionController = createCompositionController({
    project: state.project,
    NexusEngine: nexusEngineLoad.module,
    registryImports: [createEditorRegistrySnapshot()],
    globalObject: globalThis
  });
  if (selectedNodeId) state.compositionController.select(selectedNodeId);
  return state.compositionController;
}
rebuildCompositionController();
state.configureSubject = "composition";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setMode(mode) {
  if (mode === "stopped") state.compositionController?.stop?.();
  if (mode === "stopped") state.playableRuntime = null;
  state.mode = mode;
  recordEditorEvent(state, `editor.${mode}`, { domainPath: "n:editor:status", mode });
  render();
}

function playEditor() {
  state.workspaceUi.projectActionsOpen = false;
  if (state.project.playable) {
    const entry = resolvePlayableEntry();
    if (!entry) {
      state.mode = "stopped";
      state.compositionUi.message = "Playable game unavailable: open this project from its served workspace path.";
      recordEditorEvent(state, "editor.play.blocked", { domainPath: "n:editor:composition", severity: "warning", message: state.compositionUi.message });
      render();
      return;
    }
    state.compositionController?.stop?.();
    state.playableRuntime = { id: state.project.playable.id, entry, status: "loading" };
    state.mode = "playing";
    recordEditorEvent(state, "editor.playable.started", { domainPath: state.project.domainPath, playableId: state.project.playable.id, entry });
    render();
    return;
  }
  const result = state.compositionController?.play?.(state.compositionController?.getSelectedNode?.()?.id ?? state.project.composition?.rootNodeId);
  if (result?.ok) {
    state.mode = "playing";
    recordEditorEvent(state, "editor.playing", { domainPath: "n:editor:status", mode: "playing", installOrder: result.installOrder });
  } else {
    state.mode = "stopped";
    state.compositionUi.message = result?.error ?? "Play unavailable.";
    recordEditorEvent(state, "editor.play.blocked", { domainPath: "n:editor:composition", severity: "warning", message: state.compositionUi.message });
  }
  render();
}

function selectDomain(domainPath) {
  state.selectedDomainPath = domainPath;
  state.configureSubject = domainPath === "n:scene" ? "object" : "domain";
  state.workspaceUi.activeContext = "inspector";
  if (domainPath === "n:scene") {
    const selected = selectSceneObject(state.project, state.selectedObjectId);
    state.selectedObjectId = selected?.id ?? "";
  }
  recordEditorEvent(state, "editor.domain.selected", { domainPath });
  render();
}

function selectObject(objectId) {
  const object = state.editorRuntime.getBinding("sceneObject").select(objectId);
  if (!object) return;
  state.configureSubject = "object";
  state.workspaceUi.activeContext = "inspector";
  render();
}

function selectStep(stepId) {
  state.selectedSequenceStepId = stepId;
  const step = state.project.sequenceSteps.find((item) => item.id === stepId);
  if (step) state.selectedDomainPath = step.domainPath;
  state.configureSubject = "sequence-step";
  state.workspaceUi.activeContext = "inspector";
  recordEditorEvent(state, "editor.sequence.selected", { domainPath: step?.domainPath ?? "n:editor:sequence", stepId });
  render();
}

function buildHtml() {
  state.workspaceUi.projectActionsOpen = false;
  const report = state.compositionController?.getValidation?.();
  if (state.compositionController?.isDirty?.() || report?.ok === false) {
    state.compositionUi.message = state.compositionController?.isDirty?.() ? "Apply the composition draft before Build." : report?.errors?.[0]?.message ?? "Composition is invalid.";
    render();
    return;
  }
  state.editorRuntime.getBinding("htmlBuild").build();
  render();
}

function downloadHtml() {
  if (!state.build.html) buildHtml();
  const blob = new Blob([state.build.html], { type: "text/html" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = state.build.fileName;
  link.click();
  URL.revokeObjectURL(href);
  recordEditorEvent(state, "editor.build.html.downloaded", {
    domainPath: "n:build:web",
    fileName: state.build.fileName
  });
  state.workspaceUi.projectActionsOpen = false;
  render();
}

function saveProject() {
  state.workspaceUi.projectActionsOpen = false;
  state.editorRuntime.getBinding("projectPersistence").saveLocal();
  render();
}

function loadProject() {
  state.workspaceUi.projectActionsOpen = false;
  state.editorRuntime.getBinding("projectPersistence").loadLocal();
  rebuildCompositionController();
  render();
}

function resetProject() {
  state.workspaceUi.projectActionsOpen = false;
  projectSourceUrl = null;
  state.editorRuntime.getBinding("projectPersistence").resetProject();
  rebuildCompositionController();
  render();
}

function exportProjectFile() {
  const file = state.editorRuntime.getBinding("projectPersistence").exportFile();
  const blob = new Blob([file.json], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(href);
  render();
}

async function importProjectFile(file) {
  if (!file) return;
  const serialized = await file.text();
  projectSourceUrl = null;
  state.editorRuntime.getBinding("projectPersistence").importFile(serialized, file.name);
  rebuildCompositionController();
  render();
}

function resolvePlayableEntry() {
  const entry = state.project.playable?.entry;
  if (!entry) return null;
  try {
    const url = new URL(entry, projectSourceUrl ?? globalThis.location.href);
    if (url.origin !== globalThis.location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

function selectCompositionNode(nodeId) {
  const node = state.compositionController?.select?.(nodeId);
  if (!node) return;
  const record = state.compositionController.getRecord?.(node);
  state.configureSubject = "composition";
  state.workspaceUi.activeContext = "inspector";
  if (record?.domainPath) state.selectedDomainPath = record.domainPath;
  state.compositionUi.message = "";
  recordEditorEvent(state, "editor.composition.selected", { domainPath: record?.domainPath ?? "n:editor:composition", nodeId });
  render();
}

function toggleCompositionAdd() {
  state.compositionUi.addOpen = !state.compositionUi.addOpen;
  state.workspaceUi.activeContext = "structure";
  state.compositionUi.message = "";
  render();
}

function addCompositionReference() {
  const result = state.compositionController?.add?.(state.compositionUi.addKind, state.compositionUi.selectedRegistryId);
  state.compositionUi.message = result?.ok ? `${state.compositionUi.addKind} added to the draft.` : result?.reason ?? "Unable to add registry reference.";
  if (result?.ok) {
    state.compositionUi.addOpen = false;
    state.configureSubject = "composition";
    state.workspaceUi.activeContext = "inspector";
  }
  render();
}

function applyCompositionDraft() {
  const result = state.compositionController?.apply?.();
  state.compositionUi.message = result?.ok ? "Accepted composition replaced atomically." : result?.report?.errors?.[0]?.message ?? "Apply failed; accepted composition is unchanged.";
  if (!result?.ok) state.workspaceUi.activeContext = "inspector";
  recordEditorEvent(state, result?.ok ? "editor.composition.applied" : "editor.composition.apply.failed", {
    domainPath: "n:editor:composition",
    severity: result?.ok ? "info" : "warning",
    revision: result?.composition?.revision,
    errors: result?.report?.errors ?? []
  });
  render();
}

async function runCompositionOnce() {
  state.compositionUi.message = "Running disposable preview…";
  render();
  const receipt = await state.compositionController?.runOnce?.();
  state.compositionUi.message = receipt?.ok ? `Preview passed in ${Math.round(receipt.durationMs ?? 0)}ms and was disposed.` : receipt?.error ?? "Preview failed.";
  state.workspaceUi.activeContext = "inspector";
  recordEditorEvent(state, receipt?.ok ? "editor.composition.preview.passed" : "editor.composition.preview.failed", {
    domainPath: "n:editor:composition",
    severity: receipt?.ok ? "info" : "warning",
    receipt
  });
  render();
}

function removeCompositionNode() {
  const result = state.compositionController?.remove?.();
  state.compositionUi.message = result?.ok ? "Reference removed from the draft." : result?.reason ?? "Unable to remove reference.";
  render();
}

function updateCompositionConfig(serialized) {
  try {
    const config = JSON.parse(serialized);
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("Kit config must be a JSON object.");
    state.compositionController.update({ config });
    state.compositionUi.message = "Draft settings updated; Apply is required.";
  } catch (error) {
    state.compositionUi.message = `Settings not changed: ${error.message}`;
  }
  render();
}

function updateCompositionConfigField(key, type, serialized) {
  try {
    let value;
    if (type === "boolean") value = serialized === "true";
    else if (type === "number" || type === "integer") {
      if (serialized === "") throw new TypeError(`${key} requires a number.`);
      value = Number(serialized);
      if (!Number.isFinite(value)) throw new TypeError(`${key} requires a finite number.`);
    } else if (type === "enum" || type === "json") value = JSON.parse(serialized);
    else value = serialized;
    state.compositionController.update({ config: { [key]: value } });
    state.compositionUi.message = `Draft ${key} setting updated; Apply is required.`;
  } catch (error) {
    state.compositionUi.message = `Setting not changed: ${error.message}`;
  }
  render();
}

function toggleKitPicker() {
  state.editorRuntime.getBinding("domainStack").togglePicker();
  render();
}

function updateKitPickerQuery(value) {
  const domainStack = state.editorRuntime.getBinding("domainStack");
  domainStack.setPickerQuery(value);
  const results = domainStack.searchKits();
  if (results.length && !results.some((kit) => kit.id === state.kitPicker.selectedKitId)) domainStack.selectKit(results[0].id);
  render();
}

function updateKitPickerCategory(value) {
  const domainStack = state.editorRuntime.getBinding("domainStack");
  domainStack.setPickerCategory(value);
  const results = domainStack.searchKits();
  if (results.length && !results.some((kit) => kit.id === state.kitPicker.selectedKitId)) domainStack.selectKit(results[0].id);
  render();
}

function selectRegistryKit(id) {
  state.editorRuntime.getBinding("domainStack").selectKit(id);
  render();
}

function setDomainStackView(mode) {
  state.editorRuntime.getBinding("domainStack").setViewMode(mode);
  render();
}

function updateDomainStackSearch(value) {
  state.editorRuntime.getBinding("domainStack").setStackQuery(value);
  render();
}

function updateDomainStackHealth(value) {
  state.editorRuntime.getBinding("domainStack").setHealthFilter(value);
  render();
}

function updateSceneObjectSearch(value) {
  state.editorRuntime.getBinding("sceneObject").setQuery(value);
  render();
}

function updateSceneObjectBatchSize(value) {
  state.editorRuntime.getBinding("sceneObject").setBatchSize(value);
  render();
}

function updateSceneObjectLimit(value) {
  state.editorRuntime.getBinding("sceneObject").setVisibleLimit(value);
  render();
}

function addObject() {
  state.editorRuntime.getBinding("sceneObject").addCube();
  render();
}

function addObjectGroup() {
  state.editorRuntime.getBinding("sceneObject").addCubeGroup();
  render();
}

function updateScenePreset(value) {
  state.editorRuntime.getBinding("scenePreset").setPreset(value);
  render();
}

function applyScenePreset() {
  state.editorRuntime.getBinding("scenePreset").apply();
  render();
}

function updateGameTemplate(value) {
  state.editorRuntime.getBinding("gameTemplate").setTemplate(value);
  render();
}

function applyGameTemplate() {
  try {
    state.editorRuntime.getBinding("gameTemplate").apply();
  } catch (error) {
    recordEditorEvent(state, "editor.game-template.cli-only", {
      domainPath: "n:editor:game-template",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  render();
}

function duplicateObject() {
  state.editorRuntime.getBinding("sceneObject").duplicateSelected();
  render();
}

function deleteObject() {
  state.editorRuntime.getBinding("sceneObject").deleteSelected();
  render();
}

function reorderKit() {
  state.editorRuntime.getBinding("domainStack").reorderSelected();
  render();
}

function addStep() {
  state.editorRuntime.getBinding("sequenceTimeline").addStep();
  render();
}

function toggleTimeline() {
  state.workspaceUi.timelineExpanded = !state.workspaceUi.timelineExpanded;
  if (state.workspaceUi.timelineExpanded) state.workspaceUi.activeContext = "behavior";
  render();
}

function setWorkspaceContext(context) {
  if (!WORKSPACE_CONTEXTS.has(context)) return;
  state.workspaceUi.activeContext = context;
  if (context === "behavior") state.workspaceUi.timelineExpanded = true;
  render();
}

function toggleProjectActions() {
  state.workspaceUi.projectActionsOpen = !state.workspaceUi.projectActionsOpen;
  render();
}

function resetWorkspaceLayout() {
  Object.assign(state.workspaceUi, {
    structureWidth: 270,
    inspectorWidth: 320,
    contextWidth: 320,
    behaviorHeight: 260,
    compactContextHeight: 300
  });
  state.workspaceUi.projectActionsOpen = false;
  recordEditorEvent(state, "editor.workspace.reset", { domainPath: "n:editor:dock" });
  render();
}

function setWorkspaceSize(kind, value, workspace = root.querySelector(".editor-workspace")) {
  const limits = WORKSPACE_SIZE_LIMITS[kind];
  if (!limits) return;
  const size = Math.max(limits.min, Math.min(limits.max, Math.round(Number(value) || limits.min)));
  state.workspaceUi[limits.key] = size;
  const variable = {
    structure: "--structure-size",
    inspector: "--inspector-size",
    context: "--context-size",
    behavior: "--behavior-size",
    compact: "--compact-context-size"
  }[kind];
  workspace?.style.setProperty(variable, `${size}px`);
  const separator = root.querySelector(`[data-workspace-resize="${kind}"]`);
  separator?.setAttribute("aria-valuenow", String(size));
}

function bindWorkspaceResizers() {
  for (const separator of root.querySelectorAll("[data-workspace-resize]")) {
    const kind = separator.dataset.workspaceResize;
    const limits = WORKSPACE_SIZE_LIMITS[kind];
    if (!limits) continue;
    const isVerticalSize = kind === "behavior" || kind === "compact";
    const pointerSign = kind === "inspector" || kind === "context" || isVerticalSize ? -1 : 1;
    separator.addEventListener("pointerdown", (event) => {
      const start = isVerticalSize ? event.clientY : event.clientX;
      const initial = state.workspaceUi[limits.key];
      separator.setPointerCapture(event.pointerId);
      separator.classList.add("resizing");
      const move = (moveEvent) => {
        const current = isVerticalSize ? moveEvent.clientY : moveEvent.clientX;
        setWorkspaceSize(kind, initial + ((current - start) * pointerSign));
      };
      const stop = () => {
        separator.classList.remove("resizing");
        separator.removeEventListener("pointermove", move);
        separator.removeEventListener("pointerup", stop);
        separator.removeEventListener("pointercancel", stop);
        recordEditorEvent(state, "editor.workspace.resized", {
          domainPath: "n:editor:dock",
          region: kind,
          size: state.workspaceUi[limits.key]
        });
      };
      separator.addEventListener("pointermove", move);
      separator.addEventListener("pointerup", stop);
      separator.addEventListener("pointercancel", stop);
    });
    separator.addEventListener("keydown", (event) => {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 16 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -16 : 0;
      if (!delta) return;
      event.preventDefault();
      setWorkspaceSize(kind, state.workspaceUi[limits.key] + (delta * pointerSign));
    });
  }
}

function linkEvent() {
  state.editorRuntime.getBinding("sequenceTimeline").linkEvent(readSequenceLinkPatch());
  render();
}

function updateSequenceLink(patch) {
  state.editorRuntime.getBinding("sequenceTimeline").updateStepLink(state.selectedSequenceStepId, patch);
  render();
}

function validateSequence() {
  state.editorRuntime.getBinding("sequenceTimeline").validate();
  render();
}

function runSequenceStep() {
  state.editorRuntime.getBinding("sequenceTimeline").runStep();
  render();
}

function runSequenceAll() {
  state.editorRuntime.getBinding("sequenceTimeline").runAll();
  render();
}

function resetSequencePlayback() {
  state.editorRuntime.getBinding("sequenceTimeline").resetPlayback();
  render();
}

function updatePhysicsConfig(field, value) {
  const config = getKitConfig(state.project, state.selectedDomainPath);
  if (field.startsWith("gravity.")) {
    config.gravity ??= { x: 0, y: -9.81, z: 0 };
    config.gravity[field.split(".")[1]] = Number(value);
  } else if (field === "enabled") {
    config.enabled = Boolean(value);
  } else if (field === "substeps") {
    config.substeps = Math.max(1, Number(value));
  } else {
    config[field] = value;
  }
  recordEditorEvent(state, "editor.config.changed", { domainPath: state.selectedDomainPath, field });
}

function updateBuildConfig(field, value) {
  const config = getKitConfig(state.project, "n:build:web");
  if (field === "maxDrawnObjects") {
    config.maxDrawnObjects = Math.max(25, Math.min(2000, Math.floor(Number(value) || 600)));
  } else if (field === "renderer") {
    config.renderer = value === "dom-cubes" ? "dom-cubes" : "canvas-3d";
  } else if (field === "culling") {
    config.culling = value === "none" ? "none" : "distance-window";
  } else if (field === "enabled") {
    config.enabled = Boolean(value);
  } else {
    config[field] = value;
  }
  recordEditorEvent(state, "editor.build.config.changed", { domainPath: "n:build:web", field });
}

function updateViewportConfig(field, value) {
  const config = getKitConfig(state.project, "n:render:three");
  if (field === "viewportMaxDrawnObjects") {
    config.viewportMaxDrawnObjects = Math.max(25, Math.min(3000, Math.floor(Number(value) || 700)));
  } else if (field === "renderer") {
    config.renderer = value === "css-fallback" ? "css-fallback" : "webgl";
  } else if (field === "viewportCulling") {
    config.viewportCulling = value === "none" ? "none" : "distance-window";
  } else if (field === "enabled") {
    config.enabled = Boolean(value);
  } else {
    config[field] = value;
  }
  recordEditorEvent(state, "editor.viewport.config.changed", { domainPath: "n:render:three", field });
}

function updateObjectTransform(field, value) {
  state.editorRuntime.getBinding("sceneObject").updateTransform(field, value);
}

function setViewportTool(tool) {
  state.editorRuntime.getBinding("viewportTools").setTool(tool);
  render();
}

function nudgeViewportSelection(axis, direction) {
  state.editorRuntime.getBinding("viewportTools").nudge(axis, direction);
  render();
}

function resetViewportSelectionTransform() {
  state.editorRuntime.getBinding("viewportTools").resetSelectedTransform();
  render();
}

function assignSelectedKitToObject() {
  state.editorRuntime.getBinding("sceneObject").assignSelectedDomain();
  render();
}

function assignSelectedKitToVisibleObjects() {
  state.editorRuntime.getBinding("sceneObject").assignSelectedDomainToVisible();
  render();
}

function compositionRecord(node) {
  if (!node || !state.compositionController?.registry) return null;
  const list = node.kind === "domain" ? state.compositionController.registry.domains : state.compositionController.registry.kits;
  return list.find((record) => record.id === node.registryId) ?? null;
}

function compositionNodeLabel(node) {
  const record = compositionRecord(node);
  if (node.id === state.project.composition?.rootNodeId) return node.labelOverride ?? state.project.title ?? "Game Root";
  return node.labelOverride ?? record?.label ?? record?.metadata?.label ?? record?.id ?? node.registryId;
}

function renderCompositionTree() {
  const controller = state.compositionController;
  if (!controller?.supported) return `<div class="composer-unavailable"><strong>Composition unavailable</strong><span>${escapeHtml(controller?.reason ?? "No compatible Engine module.")}</span></div>`;
  const tree = controller.getDraft();
  const selectedId = controller.getSelectedNode()?.id;
  const byParent = new Map();
  for (const node of tree.nodes) byParent.set(node.parentNodeId, [...(byParent.get(node.parentNodeId) ?? []), node]);
  for (const nodes of byParent.values()) nodes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const renderNode = (node, depth = 0) => {
    const record = compositionRecord(node);
    const children = byParent.get(node.id) ?? [];
    return `
      <div class="composition-branch">
        <button type="button" class="composition-node ${selectedId === node.id ? "selected" : ""} ${node.enabled ? "" : "disabled-node"}" data-composition-node="${escapeHtml(node.id)}" style="--tree-depth:${depth}">
          <span class="composition-disclosure">${children.length ? "▾" : "·"}</span>
          <span class="composition-kind">${node.kind === "domain" ? "◈" : "◇"}</span>
          <span class="composition-node-copy"><strong>${escapeHtml(compositionNodeLabel(node))}</strong><small><span class="composition-type-label">${node.kind === "domain" ? "Domain" : "Kit"}</span>${escapeHtml(record?.domainPath ?? node.registryId)}</small></span>
          <span class="composition-state">${node.enabled ? "●" : "○"}</span>
        </button>
        ${children.map((child) => renderNode(child, depth + 1)).join("")}
      </div>`;
  };
  const rootNode = tree.nodes.find((node) => node.id === tree.rootNodeId);
  return rootNode ? renderNode(rootNode) : `<div class="composer-unavailable">Missing composition root.</div>`;
}

function renderCompositionAdd() {
  if (!state.compositionUi.addOpen || !state.compositionController?.supported) return "";
  const kind = state.compositionUi.addKind;
  const query = state.compositionUi.addQuery.trim().toLowerCase();
  const options = state.compositionController.listAddOptions(kind).filter((entry) => !query || `${entry.label} ${entry.id} ${entry.domainPath}`.toLowerCase().includes(query));
  const selectedId = options.some((entry) => entry.id === state.compositionUi.selectedRegistryId) ? state.compositionUi.selectedRegistryId : options[0]?.id ?? "";
  state.compositionUi.selectedRegistryId = selectedId;
  return `
    <section class="composition-add-region" aria-label="Add to game structure">
      <div class="composition-add-kind" role="group" aria-label="Add type">
        <button type="button" data-add-kind="domain" class="${kind === "domain" ? "active" : ""}">Game Domain</button>
        <button type="button" data-add-kind="kit" class="${kind === "kit" ? "active" : ""}">Behavior Kit</button>
      </div>
      <input id="composition-add-search" type="search" value="${escapeHtml(state.compositionUi.addQuery)}" placeholder="Search valid ${kind}s">
      <select id="composition-add-select" ${options.length ? "" : "disabled"}>
        ${options.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === selectedId ? "selected" : ""}>${escapeHtml(entry.label)} — ${escapeHtml(entry.domainPath)}</option>`).join("") || `<option>No valid ${kind}s here</option>`}
      </select>
      <button id="composition-add-confirm" type="button" class="wide-action" ${selectedId ? "" : "disabled"}>Add ${kind === "domain" ? "Game Domain" : "Behavior Kit"}</button>
    </section>`;
}

function renderCompositionPanel() {
  const controller = state.compositionController;
  const report = controller?.getValidation?.() ?? { ok: false, errors: [] };
  const dirty = controller?.isDirty?.() === true;
  const actionMessage = !controller?.supported
    ? "Connect a NexusEngine build with Composition Tree support."
    : dirty
      ? "Draft changes must be applied before preview or play."
      : !report.ok
        ? "Resolve the listed composition issues before preview or play."
        : "Select an area or behavior to inspect and edit it.";
  return `
    <div class="panel-title"><span class="dock-anchor">⌜</span><h2>Game Structure</h2><span class="composition-badge ${report.ok ? "ok" : "error"}">${dirty ? "Draft" : report.ok ? "Applied" : "Invalid"}</span></div>
    ${renderCompositionAdd()}
    <div class="composition-summary ${report.ok ? "ok" : "error"}">
      <strong>${report.ok ? "Tree valid" : `${report.errors?.length ?? 0} blocking issue${report.errors?.length === 1 ? "" : "s"}`}</strong>
      <span>${escapeHtml(actionMessage)}</span>
    </div>
    <div class="composition-tree" role="tree">${renderCompositionTree()}</div>
    ${state.compositionUi.message ? `<div class="composition-message" aria-live="polite">${escapeHtml(state.compositionUi.message)}</div>` : ""}
  `;
}

function renderCompositionSchemaField(key, schema = {}, value) {
  const label = schema.title ?? key;
  const type = Array.isArray(schema.type) ? schema.type.find((entry) => entry !== "null") : schema.type;
  if (Array.isArray(schema.enum)) {
    return `<label class="composition-schema-field"><span>${escapeHtml(label)}</span><select data-composition-config-field="${escapeHtml(key)}" data-config-type="enum">${schema.enum.map((entry) => `<option value="${escapeHtml(JSON.stringify(entry))}" ${JSON.stringify(entry) === JSON.stringify(value) ? "selected" : ""}>${escapeHtml(String(entry))}</option>`).join("")}</select></label>`;
  }
  if (type === "boolean") {
    return `<label class="composition-schema-field"><span>${escapeHtml(label)}</span><select data-composition-config-field="${escapeHtml(key)}" data-config-type="boolean"><option value="true" ${value === true ? "selected" : ""}>On</option><option value="false" ${value === false ? "selected" : ""}>Off</option></select></label>`;
  }
  if (type === "number" || type === "integer") {
    return `<label class="composition-schema-field"><span>${escapeHtml(label)}</span><input data-composition-config-field="${escapeHtml(key)}" data-config-type="${type}" type="number" value="${escapeHtml(value ?? "")}" ${schema.minimum == null ? "" : `min="${escapeHtml(schema.minimum)}"`} ${schema.maximum == null ? "" : `max="${escapeHtml(schema.maximum)}"`} step="${type === "integer" ? "1" : "any"}"></label>`;
  }
  if (type === "string") {
    return `<label class="composition-schema-field"><span>${escapeHtml(label)}</span><input data-composition-config-field="${escapeHtml(key)}" data-config-type="string" type="text" value="${escapeHtml(value ?? "")}"></label>`;
  }
  return `<label class="composition-schema-field composition-schema-json"><span>${escapeHtml(label)}</span><textarea data-composition-config-field="${escapeHtml(key)}" data-config-type="json" rows="3">${escapeHtml(JSON.stringify(value ?? (type === "array" ? [] : {}), null, 2))}</textarea></label>`;
}

function renderCompositionSettings(node, record, rawOpen = false) {
  const properties = Object.entries(record?.settingsSchema?.properties ?? {});
  const kind = node?.kind === "domain" ? "Domain" : "Kit";
  return `<section class="composition-settings"><div class="config-list-title"><span>${kind} Settings</span><code>${escapeHtml(record?.status ?? "unknown")}</code></div>
    ${properties.length ? `<div class="composition-schema-fields">${properties.map(([key, schema]) => renderCompositionSchemaField(key, schema, node?.config?.[key])).join("")}</div>` : `<small>No declared ${kind.toLowerCase()} settings.</small>`}
    <details class="composition-raw-config" ${rawOpen ? "open" : ""}><summary>Advanced raw JSON</summary><textarea id="composition-config-json" rows="7" spellcheck="false">${escapeHtml(JSON.stringify(node?.config ?? {}, null, 2))}</textarea></details>
  </section>`;
}

function renderCompositionInspector() {
  const controller = state.compositionController;
  if (!controller?.supported) return `<div class="composer-unavailable"><strong>Registry v2 required</strong><span>${escapeHtml(controller?.reason ?? "")}</span></div>`;
  const node = controller.getSelectedNode();
  const record = controller.getRecord?.(node) ?? compositionRecord(node);
  const report = controller.getValidation();
  const issues = report.errors?.filter((entry) => !entry.nodeId || entry.nodeId === node?.id) ?? [];
  const receipts = controller.getReceipts().slice(-3).reverse();
  const isRoot = node?.id === state.project.composition?.rootNodeId;
  return `
    <div class="selected-kit composition-selection">
      <span class="selected-kit-icon">${node?.kind === "domain" ? "◈" : "◇"}</span>
      <span class="selected-kit-copy"><strong>${escapeHtml(compositionNodeLabel(node))}</strong><small>${escapeHtml(record?.domainPath ?? node?.registryId ?? "No node")}</small></span>
      <span class="domain-status ${node?.enabled ? "ready" : "attention"}"></span>
    </div>
    <label class="toggle-row"><span>Enabled</span><button type="button" id="composition-node-enabled" class="toggle ${node?.enabled ? "on" : ""}" aria-pressed="${node?.enabled ? "true" : "false"}" ${isRoot ? "disabled" : ""}><span></span></button></label>
    <label class="field-row">Display label<input id="composition-node-label" type="text" value="${escapeHtml(node?.labelOverride ?? "")}" placeholder="${escapeHtml(record?.label ?? record?.metadata?.label ?? "Use registry label")}"></label>
    ${node?.kind === "domain" ? `
      <section class="composition-boundary"><div class="config-list-title"><span>What this area owns</span><code>${escapeHtml(record?.status ?? "unknown")}</code></div>
        <p>${escapeHtml(record?.ownedMeaning?.[0] ?? "Natural-language meaning is supplied by the registry.")}</p>
        <small>Does not own: ${escapeHtml((record?.forbiddenResponsibilities ?? []).slice(0, 3).join(" · ") || "none declared")}</small>
      </section>` : ""}
    ${renderCompositionSettings(node, record, issues.length > 0)}
    ${issues.length ? `<div class="composition-issues">${issues.map((entry) => `<span><strong>${escapeHtml(entry.code)}</strong>${escapeHtml(entry.message)}</span>`).join("")}</div>` : ""}
    <button id="composition-remove" type="button" class="wide-action secondary" ${isRoot ? "disabled" : ""}>Remove selected</button>
    <details class="composition-advanced"><summary>Advanced registry details</summary>
      <div><small>Registry ID</small><code>${escapeHtml(record?.id ?? "")}</code></div>
      <div><small>Owning domain</small><code>${escapeHtml(record?.domainPath ?? "")}</code></div>
      <div><small>API</small><code>${escapeHtml([record?.apiName, record?.apiVisibility].filter(Boolean).join(" · ") || "not declared")}</code></div>
      <div><small>Requires</small><code>${escapeHtml((record?.requires ?? []).join(", ") || "none")}</code></div>
      <div><small>Provides</small><code>${escapeHtml((record?.provides ?? []).join(", ") || "none")}</code></div>
      <div><small>Source</small><code>${escapeHtml(record?.source?.registryId ?? record?.sourceRegistryId ?? "unknown")}</code></div>
      <div><small>Trusted export</small><code>${escapeHtml(record?.source?.trusted ? record.source.exportName : "no")}</code></div>
      ${record?.metadata?.performance ? `<div><small>Performance</small><code>${escapeHtml(JSON.stringify(record.metadata.performance))}</code></div>` : ""}
    </details>
    <section class="preview-receipts"><div class="config-list-title"><span>Recent previews</span><code>${controller.getReceipts().length}/20</code></div>
      ${receipts.map((receipt) => `<div class="preview-receipt ${receipt.ok ? "ok" : "error"}"><strong>${escapeHtml(receipt.verdict)}</strong><span>${escapeHtml(receipt.error ?? `${receipt.installOrder?.length ?? 0} kits · ${Math.round(receipt.durationMs ?? 0)}ms`)}</span></div>`).join("") || "<small>No preview has run.</small>"}
    </section>`;
}

function renderDomainStack() {
  const domainStack = state.editorRuntime.getBinding("domainStack");
  const rows = domainStack.getVisibleRows();
  if (!rows.length) return `<div class="empty-stack">No installed kits match this filter.</div>`;
  return rows.map((row, index) => {
    const domain = state.project.domainStack.find((item) => item.domainPath === row.domainPath) ?? row;
    const selected = domain.domainPath === state.selectedDomainPath ? "selected" : "";
    const subtitle = domain.domainPath === "n:scene" ? `${state.project.scene3d.objects.length} Scene Objects` : domain.subtitle;
    return `
      <button class="domain-row ${selected}" data-domain="${domain.domainPath}">
        <span class="domain-icon">${index === 0 ? "⌂" : index === 1 ? "□" : index === 2 ? "◉" : index === 3 ? "⌨" : index === 4 ? "⌁" : "◌"}</span>
        <span class="domain-copy"><strong>${escapeHtml(domain.domainPath)}</strong><small>${escapeHtml(subtitle)}${row.missingRequires.length ? ` · missing ${row.missingRequires.length}` : ""}</small></span>
        <span class="domain-status ${row.status}" aria-label="${row.status}"></span>
      </button>`;
  }).join("");
}

function renderDomainStackScaleControls() {
  const health = state.editorRuntime.getBinding("domainStack").getHealth();
  const visible = state.editorRuntime.getBinding("domainStack").getVisibleRows();
  const mode = state.domainStackView.mode;
  const healthText = health.ok ? `${health.kitCount} kits · ${health.providerCount} providers` : `${health.missingCount} missing deps · ${health.kitCount} kits`;
  const missingTokens = health.rows.flatMap((row) => row.missingRequires).slice(0, 4);
  return `
    <div class="domain-scale">
      <div class="domain-health ${health.ok ? "ok" : "warn"}"><span></span><strong>${escapeHtml(healthText)}</strong></div>
      <div class="domain-view-toggle" role="group" aria-label="Domain Stack view">
        <button id="stack-view" type="button" class="${mode === "stack" ? "active" : ""}">Stack</button>
        <button id="map-view" type="button" class="${mode === "map" ? "active" : ""}">Map</button>
      </div>
      <div class="domain-filter-grid">
        <label>Installed
          <input id="domain-stack-search" type="search" value="${escapeHtml(state.domainStackView.query)}" placeholder="filter installed kits">
        </label>
        <label>Health
          <select id="domain-health-filter">
            ${["all", "ready", "attention", "missing"].map((item) => `<option value="${item}" ${state.domainStackView.health === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="domain-visible-count">${visible.length} visible${missingTokens.length ? ` · missing ${escapeHtml(missingTokens.join(", "))}` : ""}</div>
    </div>
  `;
}

function renderDomainMap() {
  const rows = state.editorRuntime.getBinding("domainStack").getVisibleRows();
  if (!rows.length) return `<div class="empty-stack">No domain map nodes match this filter.</div>`;
  const byCategory = rows.reduce((groups, row) => {
    const key = row.category || "Core";
    groups[key] ??= [];
    groups[key].push(row);
    return groups;
  }, {});
  return Object.entries(byCategory).map(([category, categoryRows]) => `
    <section class="domain-map-group">
      <h3>${escapeHtml(category)}</h3>
      ${categoryRows.map((row) => `
        <button type="button" class="domain-map-node ${row.domainPath === state.selectedDomainPath ? "selected" : ""} ${row.status}" data-domain="${escapeHtml(row.domainPath)}">
          <span><strong>${escapeHtml(row.domainPath)}</strong><small>${escapeHtml(row.kitId)}</small></span>
          <span class="domain-map-meta">${row.provides.length} out · ${row.requires.length} in · ${row.childCount} sub</span>
          ${row.missingRequires.length ? `<code>missing ${escapeHtml(row.missingRequires.join(", "))}</code>` : ""}
        </button>
      `).join("")}
    </section>
  `).join("");
}

function renderTokenChips(items = [], empty = "none") {
  if (!items.length) return `<span class="kit-token muted">${escapeHtml(empty)}</span>`;
  return items.slice(0, 5).map((item) => `<span class="kit-token">${escapeHtml(item)}</span>`).join("");
}

function renderKitPicker() {
  const domainStack = state.editorRuntime.getBinding("domainStack");
  const registry = state.editorRuntime.getBinding("kitRegistry");
  const results = domainStack.searchKits();
  const selected = registry.get(state.kitPicker.selectedKitId) ?? results[0] ?? null;
  const plan = selected ? domainStack.createInstallPlan(selected.id, { includeChildren: Boolean(selected.children?.length) }) : null;
  const children = selected?.children?.map((id) => registry.get(id)).filter(Boolean) ?? [];
  const compatible = selected ? registry.findCompatibleKits(selected.id) : [];
  const categories = registry.categories();
  const grouped = results.reduce((groups, kit) => {
    const key = kit.category || "General";
    groups[key] ??= [];
    groups[key].push(kit);
    return groups;
  }, {});
  const optionGroups = Object.entries(grouped).map(([category, kits]) => `
    <optgroup label="${escapeHtml(category)}">
      ${kits.map((kit) => `<option value="${escapeHtml(kit.id)}" ${selected?.id === kit.id ? "selected" : ""}>${escapeHtml(kit.label)} / ${escapeHtml(kit.id)}</option>`).join("")}
    </optgroup>
  `).join("");

  return `
      <div class="kit-picker ${state.kitPicker.open ? "expanded" : "compact"}" data-domain-path="n:registry:search">
      <div class="kit-picker-head">
        <span><strong>Domain Service Kit Registry</strong><small>CLI-only kit install surface</small></span>
        <code>${results.length} kits</code>
      </div>
      <label class="kit-select-label">Registry Kit
        <select id="kit-select" ${selected ? "" : "disabled"}>
          ${optionGroups || '<option value="">No matching kits</option>'}
        </select>
      </label>
      <div class="kit-picker-grid">
        <label>Search
          <input id="kit-search" type="search" value="${escapeHtml(state.kitPicker.query)}" placeholder="domain, token, kit id">
        </label>
        <label>Domain
          <select id="kit-category">
            <option value="">All</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}" ${state.kitPicker.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
          </select>
        </label>
      </div>
      ${selected ? `
        <div class="kit-plan-summary">
          <span>${escapeHtml(selected.type)}</span>
          <span>${plan?.installOrder?.length ?? 0} install</span>
          <span>${children.length} sub</span>
          <span>${plan?.missing?.length ?? 0} missing</span>
        </div>
        ${children.length ? `
          <div class="kit-child-preview">
            <strong>Sub Domains</strong>
            <div class="kit-child-grid">
              ${children.map((kit) => `
                <span class="kit-child-row">
                  <code>${escapeHtml(kit.domainPath)}</code>
                  <small>${escapeHtml(kit.id)}</small>
                </span>
              `).join("")}
            </div>
          </div>
        ` : ""}
        <div class="kit-picker-actions">
          <code>npm run cli -- operations submit install-kit --param kit=${escapeHtml(selected.id)}${children.length ? " --param include_children=true" : ""}</code>
        </div>
        ${state.kitPicker.open ? `<div class="kit-detail">
          <div class="kit-detail-head">
            <strong>${escapeHtml(selected.label)}</strong>
            <small>${escapeHtml(selected.id)}</small>
          </div>
          <p>${escapeHtml(selected.subtitle)}</p>
          <div class="kit-meta-line"><span>${escapeHtml(selected.type)}</span><span>${escapeHtml(selected.path ?? "local registry")}</span></div>
          <div class="kit-token-row"><small>provides</small>${renderTokenChips(selected.provides)}</div>
          <div class="kit-token-row"><small>requires</small>${renderTokenChips(selected.requires)}</div>
          <div class="kit-token-row"><small>sub kits</small>${renderTokenChips(children.map((kit) => kit.id), "no child kits")}</div>
          <div class="kit-token-row"><small>compatible</small>${renderTokenChips(compatible.map((kit) => kit.id), "no dependency providers")}</div>
          ${plan?.missing?.length ? `<div class="kit-warning">Missing providers: ${escapeHtml(plan.missing.join(", "))}</div>` : ""}
        </div>` : ""}
      ` : `<div class="kit-detail empty">No registry kits match this filter.</div>`}
    </div>
  `;
}

function renderObjectList() {
  const objects = state.editorRuntime.getBinding("sceneObject").getWindow().objects;
  if (!objects.length) return `<div class="empty-stack">No scene objects match this filter.</div>`;
  return objects.map((object) => {
    const selected = object.id === state.selectedObjectId ? "selected" : "";
    return `<button type="button" class="object-row ${selected}" data-object="${object.id}"><span>${object.label}</span><code>${(object.domainKits ?? []).length} kits</code></button>`;
  }).join("");
}

function renderSceneConfig(selected) {
  const object = getSceneObject(state.project, state.selectedObjectId);
  const position = object?.transform?.position ?? { x: 0, y: 0, z: 0 };
  const scale = object?.transform?.scale ?? { x: 1, y: 1, z: 1 };
  const sceneObject = state.editorRuntime.getBinding("sceneObject");
  const scenePreset = state.editorRuntime.getBinding("scenePreset");
  const gameTemplate = state.editorRuntime.getBinding("gameTemplate");
  const sceneStats = sceneObject.getStats();
  const objectWindow = sceneObject.getWindow();
  const presets = scenePreset.list();
  const selectedPreset = scenePreset.getSelected() ?? presets[0];
  const gameTemplates = gameTemplate.list();
  const selectedGameTemplate = gameTemplate.getSelected() ?? gameTemplates[0];
  const selectedTemplateId = selectedGameTemplate?.id ?? "chess-board-template";
  const gameTemplateSlug = selectedTemplateId.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const gameTemplateCliCommand = `npm run cli -- operations submit game-template --param template=${selectedTemplateId} --param html=dist/games/${gameTemplateSlug}.html --param project=dist/games/${gameTemplateSlug}.project.json`;
  const batchSize = state.sceneObjectView.batchSize ?? 25;
  const visibleLimit = state.sceneObjectView.limit ?? 100;
  const presetRuns = state.project.scene3d.authoringPresets ?? [];
  const templateRuns = state.project.scene3d.gameTemplates ?? [];
  return `
    <div class="selected-kit">
      <span class="selected-kit-icon">□</span>
      <span class="selected-kit-copy"><strong>${selected?.domainPath ?? "n:scene"}</strong><small>${state.project.scene3d.objects.length} scene objects</small></span>
      <span class="domain-status ${selected?.status ?? "ready"}"></span>
    </div>
    <section class="object-section">
      <div class="config-list-title"><span>Scene Objects</span><code>${sceneStats.objectCount}</code></div>
      <div class="scene-scale">
        <strong>${sceneStats.objectCount} objects</strong>
        <span>${sceneStats.kitAssignments} kit links · ${sceneStats.componentAssignments} components</span>
        <span>${objectWindow.totalMatched} matches · showing ${objectWindow.objects.length}${objectWindow.hiddenCount ? ` · ${objectWindow.hiddenCount} hidden` : ""}</span>
      </div>
      <div class="scene-object-tools">
        <input id="object-search" type="search" value="${escapeHtml(state.sceneObjectView.query)}" placeholder="filter objects, kits, components">
        <button type="button" id="add-object" class="mini-button">+ Cube</button>
        <button type="button" id="add-object-group" class="mini-button">+ Grid</button>
      </div>
      <div class="scene-object-scale-controls">
        <label>Batch<input id="object-batch-size" type="number" min="1" max="1000" step="1" value="${batchSize}"></label>
        <label>Show
          <select id="object-visible-limit">
            ${[25, 100, 250, 500, 1000].map((limit) => `<option value="${limit}" ${Number(visibleLimit) === limit ? "selected" : ""}>${limit}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="scene-preset-controls">
        <label>Preset
          <select id="scene-preset-select">
            ${presets.map((preset) => `<option value="${escapeHtml(preset.id)}" ${selectedPreset?.id === preset.id ? "selected" : ""}>${escapeHtml(preset.label)}</option>`).join("")}
          </select>
        </label>
        <button type="button" id="apply-scene-preset" class="mini-button">Apply Preset</button>
      </div>
      <div class="scene-preset-meta">
        <strong>${escapeHtml(selectedPreset?.label ?? "Scene Preset")}</strong>
        <span>${escapeHtml(selectedPreset?.subtitle ?? "Structured scene objects")} · ${presetRuns.length} runs</span>
      </div>
      <div class="scene-preset-controls game-template-controls">
        <label>Game Template
          <select id="game-template-select">
            ${gameTemplates.map((template) => `<option value="${escapeHtml(template.id)}" ${selectedGameTemplate?.id === template.id ? "selected" : ""}>${escapeHtml(template.label)}</option>`).join("")}
          </select>
        </label>
        <button type="button" id="apply-game-template" class="mini-button" disabled title="Game templates install kits and must be run from the CLI.">CLI Only</button>
      </div>
      <div class="scene-preset-meta game-template-meta">
        <strong>${escapeHtml(selectedGameTemplate?.label ?? "Game Template")}</strong>
        <span>${escapeHtml(selectedGameTemplate?.subtitle ?? "Massive game composition")} · ${selectedGameTemplate?.defaultCount ?? 0} objects · ${templateRuns.length} runs</span>
        <code>${escapeHtml(gameTemplateCliCommand)}</code>
      </div>
      <div class="object-list">${renderObjectList()}</div>
    </section>
    <section class="object-section">
      <div class="config-list-title">
        <span>${object?.label ?? "Object"}</span>
        <code>${object?.id ?? "none"}</code>
      </div>
      <div class="scene-object-tools two">
        <button type="button" id="duplicate-object" class="mini-button">Duplicate</button>
        <button type="button" id="delete-object" class="mini-button" ${state.project.scene3d.objects.length <= 1 ? "disabled" : ""}>Delete</button>
      </div>
      <div class="field-grid">
        <label>Position X<input id="object-position-x" type="number" step="0.1" value="${position.x ?? 0}"></label>
        <label>Position Y<input id="object-position-y" type="number" step="0.1" value="${position.y ?? 0}"></label>
        <label>Position Z<input id="object-position-z" type="number" step="0.1" value="${position.z ?? 0}"></label>
      </div>
      <div class="field-grid">
        <label>Scale X<input id="object-scale-x" type="number" min="0.05" step="0.05" value="${scale.x ?? 1}"></label>
        <label>Scale Y<input id="object-scale-y" type="number" min="0.05" step="0.05" value="${scale.y ?? 1}"></label>
        <label>Scale Z<input id="object-scale-z" type="number" min="0.05" step="0.05" value="${scale.z ?? 1}"></label>
      </div>
    </section>
    ${renderEventList("Scene Outputs", ["out:scene", "out:selection", "out:transform"])}
  `;
}

function renderEventList(title, items = []) {
  return `
    <section class="config-list">
      <div class="config-list-title"><span>${title}</span><button type="button" class="mini-button">+ Add</button></div>
      ${items.map((item) => `<div class="config-item"><span>✓</span><code>${item}</code><button type="button" aria-label="Remove ${item}">⌫</button></div>`).join("")}
    </section>`;
}

function renderBuildConfig(selected, config) {
  const renderer = config.renderer === "dom-cubes" ? "dom-cubes" : "canvas-3d";
  const maxDrawnObjects = Math.max(25, Math.min(2000, Math.floor(Number(config.maxDrawnObjects) || 600)));
  const culling = config.culling === "none" ? "none" : "distance-window";
  const objectCount = state.project.scene3d.objects.length;
  const projectedCulled = culling === "none" ? 0 : Math.max(0, objectCount - maxDrawnObjects);
  return `
    <div class="selected-kit">
      <span class="selected-kit-icon">◎</span>
      <span class="selected-kit-copy"><strong>${selected?.domainPath ?? "n:build:web"}</strong><small>${selected?.subtitle ?? "Single HTML Export"}</small></span>
      <span class="domain-status ${selected?.status ?? "ready"}"></span>
    </div>
    <label class="toggle-row">
      <span>Enabled</span>
      <button type="button" id="build-enabled" class="toggle ${config.enabled ? "on" : ""}" aria-pressed="${config.enabled ? "true" : "false"}"><span></span></button>
    </label>
    <section class="object-section">
      <div class="config-list-title"><span>Runtime Budget</span><code>${objectCount} objects</code></div>
      <div class="scene-scale">
        <strong>${renderer}</strong>
        <span>${maxDrawnObjects} max drawn · ${projectedCulled} projected culled</span>
        <span>${culling} culling · ${config.target ?? "single-html"}</span>
      </div>
      <label class="field-row">Renderer
        <select id="build-runtime-renderer">
          ${["canvas-3d", "dom-cubes"].map((item) => `<option value="${item}" ${renderer === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
      <label class="field-row">Max Drawn<input id="build-max-drawn" type="number" min="25" max="2000" step="25" value="${maxDrawnObjects}"></label>
      <label class="field-row">Culling
        <select id="build-culling">
          ${["distance-window", "none"].map((item) => `<option value="${item}" ${culling === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
      <button type="button" id="build-profile-now" class="wide-action">Build With Profile</button>
    </section>
    ${renderEventList("Events", config.events)}
    ${renderEventList("Outputs", config.outputs)}
  `;
}

function renderViewportConfig(selected, config) {
  const runtime = normalizeViewportRuntimeConfig(state.project);
  const objectCount = state.project.scene3d.objects.length;
  const projectedCulled = runtime.culling === "none" ? 0 : Math.max(0, objectCount - runtime.maxDrawnObjects);
  return `
    <div class="selected-kit">
      <span class="selected-kit-icon">◇</span>
      <span class="selected-kit-copy"><strong>${selected?.domainPath ?? "n:render:three"}</strong><small>${selected?.subtitle ?? "Editor Viewport"}</small></span>
      <span class="domain-status ${selected?.status ?? "ready"}"></span>
    </div>
    <label class="toggle-row">
      <span>Enabled</span>
      <button type="button" id="viewport-enabled" class="toggle ${config.enabled ? "on" : ""}" aria-pressed="${config.enabled ? "true" : "false"}"><span></span></button>
    </label>
    <section class="object-section">
      <div class="config-list-title"><span>Viewport Budget</span><code>${objectCount} objects</code></div>
      <div class="scene-scale">
        <strong>${runtime.renderer}</strong>
        <span>${runtime.maxDrawnObjects} max drawn · ${projectedCulled} projected culled</span>
        <span>${runtime.culling} culling · selected object preserved</span>
      </div>
      <label class="field-row">Renderer
        <select id="viewport-runtime-renderer">
          ${["webgl", "css-fallback"].map((item) => `<option value="${item}" ${runtime.renderer === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
      <label class="field-row">Max Drawn<input id="viewport-max-drawn" type="number" min="25" max="3000" step="25" value="${runtime.maxDrawnObjects}"></label>
      <label class="field-row">Culling
        <select id="viewport-culling">
          ${["distance-window", "none"].map((item) => `<option value="${item}" ${runtime.culling === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
    </section>
    ${renderEventList("Events", config.events)}
    ${renderEventList("Outputs", config.outputs)}
  `;
}

function renderPersistenceConfig(selected, config) {
  const persistenceStatus = state.editorRuntime.getBinding("projectPersistence").getStatus();
  const localBytes = persistenceStatus.bytes ?? 0;
  const exportBytes = state.projectPersistence.exportBytes ?? 0;
  const importBytes = state.projectPersistence.importBytes ?? 0;
  const localLabel = persistenceStatus.hasLocalSnapshot ? "Local snapshot ready" : "No local snapshot";
  const lastFile = state.projectPersistence.lastImportFileName || state.projectPersistence.lastExportFileName || "No project file used";
  return `
    <div class="selected-kit">
      <span class="selected-kit-icon">▣</span>
      <span class="selected-kit-copy"><strong>${selected?.domainPath ?? "n:persistence"}</strong><small>${selected?.subtitle ?? "Project Files"}</small></span>
      <span class="domain-status ${selected?.status ?? "ready"}"></span>
    </div>
    <label class="toggle-row">
      <span>Enabled</span>
      <button type="button" id="config-enabled" class="toggle ${config.enabled ? "on" : ""}" aria-pressed="${config.enabled ? "true" : "false"}"><span></span></button>
    </label>
    <section class="object-section">
      <div class="config-list-title"><span>Project Snapshot</span><code>${escapeHtml(config.target ?? "local-and-file")}</code></div>
      <div class="scene-scale">
        <strong>${escapeHtml(localLabel)}</strong>
        <span>${localBytes} local bytes · ${exportBytes} exported bytes</span>
        <span>${importBytes} imported bytes · ${escapeHtml(lastFile)}</span>
      </div>
      <div class="project-file-actions">
        <button type="button" id="persistence-save-local" class="mini-button">Save Local</button>
        <button type="button" id="persistence-load-local" class="mini-button" ${persistenceStatus.hasLocalSnapshot ? "" : "disabled"}>Load Local</button>
        <button type="button" id="export-project" class="mini-button">Export Project</button>
        <button type="button" id="import-project" class="mini-button">Import Project</button>
      </div>
      <input id="project-file-input" class="project-file-input" type="file" accept="application/json,.json" hidden>
    </section>
    ${renderEventList("Events", config.events)}
    ${renderEventList("Outputs", config.outputs)}
  `;
}

function renderSequenceStepConfig() {
  const sequenceTimeline = state.editorRuntime.getBinding("sequenceTimeline");
  const { step, domains, sourceEvents, targetOutputs } = sequenceTimeline.getLinkOptions(state.selectedSequenceStepId);
  const playback = sequenceTimeline.getPlayback();
  if (!step) {
    return `
      <div class="selected-kit">
        <span class="selected-kit-icon">01</span>
        <span class="selected-kit-copy"><strong>Sequence Step</strong><small>No step selected</small></span>
        <span class="domain-status attention"></span>
      </div>
    `;
  }
  const sourceEventOptions = sourceEvents.length
    ? sourceEvents.map((eventName) => `<option value="${escapeHtml(eventName)}" ${step.event === eventName ? "selected" : ""}>${escapeHtml(eventName)}</option>`).join("")
    : `<option value="">No events</option>`;
  const targetOutputOptions = targetOutputs.length
    ? targetOutputs.map((output) => `<option value="${escapeHtml(output)}" ${step.targetOutput === output ? "selected" : ""}>${escapeHtml(output)}</option>`).join("")
    : `<option value="">No outputs</option>`;
  const linkSummary = `${step.event ?? "event"} -> ${step.targetDomainPath ?? "n:kit"} / ${step.targetOutput ?? "output"}`;
  return `
    <div class="selected-kit">
      <span class="selected-kit-icon">${String(step.order).padStart(2, "0")}</span>
      <span class="selected-kit-copy"><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.id)} · ${escapeHtml(step.domainPath)}</small></span>
      <span class="domain-status ${playback.activeStepId === step.id ? "attention" : "ready"}"></span>
    </div>
    <section class="object-section sequence-step-inspector">
      <div class="config-list-title"><span>Sequence Step</span><code>${escapeHtml(playback.status)}</code></div>
      <div class="scene-scale">
        <strong>${escapeHtml(linkSummary)}</strong>
        <span>${playback.runCount} receipts · active ${escapeHtml(playback.activeStepId || "no-step")}</span>
      </div>
      <label class="field-row">Label<input id="config-sequence-label" type="text" value="${escapeHtml(step.label)}"></label>
      <div class="sequence-inspector-grid">
        <label>Source Kit
          <select id="config-sequence-source-domain">
            ${domains.map((domain) => `<option value="${escapeHtml(domain.domainPath)}" ${step.domainPath === domain.domainPath ? "selected" : ""}>${escapeHtml(domain.domainPath)}</option>`).join("")}
          </select>
        </label>
        <label>Event
          <select id="config-sequence-event" ${sourceEvents.length ? "" : "disabled"}>${sourceEventOptions}</select>
        </label>
        <label>Target Kit
          <select id="config-sequence-target-domain">
            ${domains.map((domain) => `<option value="${escapeHtml(domain.domainPath)}" ${step.targetDomainPath === domain.domainPath ? "selected" : ""}>${escapeHtml(domain.domainPath)}</option>`).join("")}
          </select>
        </label>
        <label>Output
          <select id="config-sequence-target-output" ${targetOutputs.length ? "" : "disabled"}>${targetOutputOptions}</select>
        </label>
      </div>
      <div class="sequence-step-actions">
        <button type="button" id="config-link-event" class="mini-button">Link Step</button>
        <button type="button" id="config-run-step" class="mini-button">Run Step</button>
        <button type="button" id="config-validate-sequence" class="mini-button">Validate</button>
      </div>
    </section>
  `;
}

function renderConfigPanel() {
  const selected = getSelectedDomain(state.project, state.selectedDomainPath);
  const config = getKitConfig(state.project, selected?.domainPath ?? "n:scene");
  const gravity = config.gravity ?? { x: 0, y: 0, z: 0 };
  const visibleObjectCount = state.editorRuntime.getBinding("sceneObject").getVisibleObjects().length;
  const visibleObjectLabel = state.sceneObjectView.query ? `Filtered Objects (${visibleObjectCount})` : `Visible Objects (${visibleObjectCount})`;
  const configBody = state.configureSubject === "composition" ? renderCompositionInspector() : state.configureSubject === "sequence-step" ? renderSequenceStepConfig() : selected?.domainPath === "n:scene" ? renderSceneConfig(selected) : selected?.domainPath === "n:render:three" ? renderViewportConfig(selected, config) : selected?.domainPath === "n:build:web" ? renderBuildConfig(selected, config) : selected?.domainPath === "n:persistence" ? renderPersistenceConfig(selected, config) : `
    <div class="selected-kit">
      <span class="selected-kit-icon">□</span>
      <span class="selected-kit-copy"><strong>${selected?.domainPath ?? "n:scene"}</strong><small>${selected?.subtitle ?? "Domain Service Kit"}</small></span>
      <span class="domain-status ${selected?.status ?? "ready"}"></span>
    </div>
    <label class="toggle-row">
      <span>Enabled</span>
      <button type="button" id="config-enabled" class="toggle ${config.enabled ? "on" : ""}" aria-pressed="${config.enabled ? "true" : "false"}"><span></span></button>
    </label>
    <div class="field-grid">
      <label>Gravity X<input id="gravity-x" type="number" step="0.01" value="${gravity.x ?? 0}"></label>
      <label>Gravity Y<input id="gravity-y" type="number" step="0.01" value="${gravity.y ?? 0}"></label>
      <label>Gravity Z<input id="gravity-z" type="number" step="0.01" value="${gravity.z ?? 0}"></label>
    </div>
    <label class="field-row">Collider
      <select id="collider">
        ${["AABB", "OBB", "Capsule", "Mesh"].map((item) => `<option ${config.collider === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
    </label>
    <label class="field-row">Substeps<input id="substeps" type="number" min="1" step="1" value="${config.substeps ?? 1}"></label>
    <button type="button" id="assign-kit" class="wide-action">Assign To ${getSceneObject(state.project, state.selectedObjectId)?.label ?? "Object"}</button>
    <button type="button" id="assign-visible-kit" class="wide-action secondary" ${visibleObjectCount ? "" : "disabled"}>Assign To ${escapeHtml(visibleObjectLabel)}</button>
    ${(selected?.requires?.length || selected?.children?.length || config.sourcePath) ? `
      <section class="config-list compact">
        <div class="config-list-title"><span>Registry Metadata</span><code>${escapeHtml(selected?.kitId ?? selected?.id ?? "")}</code></div>
        ${config.sourcePath ? `<div class="config-item wide"><span>✓</span><code>${escapeHtml(config.sourcePath)}</code></div>` : ""}
        ${(selected?.requires ?? []).map((item) => `<div class="config-item wide"><span>↙</span><code>requires ${escapeHtml(item)}</code></div>`).join("")}
        ${(selected?.children ?? []).map((item) => `<div class="config-item wide"><span>↳</span><code>${escapeHtml(item)}</code></div>`).join("")}
      </section>
    ` : ""}
    ${renderEventList("Events", config.events)}
    ${renderEventList("Outputs", config.outputs)}
  `;
  return `
    <div class="panel-title">
      <span class="dock-anchor">⌝</span>
      <h2>Inspector</h2>
      <span class="panel-context-label">Selected settings</span>
    </div>
    ${configBody}
  `;
}

function renderSequenceSteps() {
  const playback = state.editorRuntime.getBinding("sequenceTimeline").getPlayback();
  return state.project.sequenceSteps.map((step) => {
    const selected = step.id === state.selectedSequenceStepId ? "selected" : "";
    const active = step.id === playback.activeStepId ? "playback-active" : "";
    const played = step.id === playback.lastStepId ? "played" : "";
    const target = step.targetOutput ? `${step.targetDomainPath ?? "n:kit"} / ${step.targetOutput}` : step.target;
    return `
      <button class="sequence-step ${selected} ${active} ${played}" data-step="${step.id}">
        <span class="step-number">${String(step.order).padStart(2, "0")}</span>
        <span><strong>${step.label}</strong><small>${escapeHtml(step.event ?? "event")} → ${escapeHtml(target)}</small></span>
        <span class="step-menu">⋮</span>
      </button>`;
  }).join('<span class="step-link" aria-hidden="true"></span>');
}

function renderSequencePlayback() {
  const playback = state.editorRuntime.getBinding("sequenceTimeline").getPlayback();
  const last = playback.receipts.at(-1) ?? null;
  const activeLabel = playback.activeStepId || "no-step";
  const receiptText = last ? `${last.event} → ${last.targetDomainPath} / ${last.targetOutput}` : "No sequence receipts yet";
  return `
    <div class="sequence-playback" data-playback-status="${escapeHtml(playback.status)}">
      <span><strong>${escapeHtml(playback.status)}</strong><small>${playback.runCount} receipts · active ${escapeHtml(activeLabel)}</small></span>
      <code>${escapeHtml(receiptText)}</code>
    </div>
  `;
}

function renderSequenceLinkEditor() {
  const sequenceTimeline = state.editorRuntime.getBinding("sequenceTimeline");
  const { step, domains, sourceEvents, targetOutputs } = sequenceTimeline.getLinkOptions(state.selectedSequenceStepId);
  if (!step) return `<div class="sequence-link-editor empty">No sequence step selected.</div>`;
  const domainOptions = domains.map((domain) => `<option value="${escapeHtml(domain.domainPath)}">${escapeHtml(domain.domainPath)} / ${escapeHtml(domain.kitId)}</option>`).join("");
  const sourceEventOptions = sourceEvents.length
    ? sourceEvents.map((eventName) => `<option value="${escapeHtml(eventName)}" ${step.event === eventName ? "selected" : ""}>${escapeHtml(eventName)}</option>`).join("")
    : `<option value="">No events</option>`;
  const targetOutputOptions = targetOutputs.length
    ? targetOutputs.map((output) => `<option value="${escapeHtml(output)}" ${step.targetOutput === output ? "selected" : ""}>${escapeHtml(output)}</option>`).join("")
    : `<option value="">No outputs</option>`;
  return `
    <div class="sequence-link-editor">
      <label>Source Kit
        <select id="sequence-source-domain">
          ${domains.map((domain) => `<option value="${escapeHtml(domain.domainPath)}" ${step.domainPath === domain.domainPath ? "selected" : ""}>${escapeHtml(domain.domainPath)}</option>`).join("") || domainOptions}
        </select>
      </label>
      <label>Event
        <select id="sequence-event" ${sourceEvents.length ? "" : "disabled"}>${sourceEventOptions}</select>
      </label>
      <label>Target Kit
        <select id="sequence-target-domain">
          ${domains.map((domain) => `<option value="${escapeHtml(domain.domainPath)}" ${step.targetDomainPath === domain.domainPath ? "selected" : ""}>${escapeHtml(domain.domainPath)}</option>`).join("") || domainOptions}
        </select>
      </label>
      <label>Output
        <select id="sequence-target-output" ${targetOutputs.length ? "" : "disabled"}>${targetOutputOptions}</select>
      </label>
    </div>
  `;
}

function readSequenceLinkPatch() {
  return {
    domainPath: root.querySelector("#sequence-source-domain")?.value,
    event: root.querySelector("#sequence-event")?.value,
    targetDomainPath: root.querySelector("#sequence-target-domain")?.value,
    targetOutput: root.querySelector("#sequence-target-output")?.value
  };
}

function readConfigSequencePatch() {
  return {
    label: root.querySelector("#config-sequence-label")?.value,
    domainPath: root.querySelector("#config-sequence-source-domain")?.value,
    event: root.querySelector("#config-sequence-event")?.value,
    targetDomainPath: root.querySelector("#config-sequence-target-domain")?.value,
    targetOutput: root.querySelector("#config-sequence-target-output")?.value
  };
}

function renderProofEvents() {
  return state.events.slice(-3).reverse().map((event) => `<span><strong>${event.type}</strong> ${event.domainPath}</span>`).join("");
}

function renderStatusLabel() {
  if (state.mode === "playing") return "Running";
  if (state.projectPersistence.status === "saved") return "Saved";
  if (state.projectPersistence.status === "loaded") return "Loaded";
  if (state.projectPersistence.status === "exported") return "Exported";
  if (state.projectPersistence.status === "imported") return "Imported";
  if (state.projectPersistence.status === "reset") return "New";
  if (state.projectPersistence.status === "missing") return "No Save";
  if (state.projectPersistence.status === "invalid") return "Import Error";
  return "Ready";
}

function getProjectedViewportStats() {
  const runtime = normalizeViewportRuntimeConfig(state.project);
  const totalObjects = state.project.scene3d.objects.length;
  const drawnObjects = runtime.culling === "none" ? totalObjects : Math.min(totalObjects, runtime.maxDrawnObjects);
  return {
    renderer: runtime.renderer,
    culling: runtime.culling,
    totalObjects,
    drawnObjects,
    culledObjects: Math.max(0, totalObjects - drawnObjects),
    maxDrawnObjects: runtime.maxDrawnObjects,
    frame: state.viewportRenderStats?.frame ?? 0
  };
}

function renderViewportStats(stats = getProjectedViewportStats()) {
  return `
    <div class="viewport-stats" id="viewport-stats" data-renderer="${escapeHtml(stats.renderer)}">
      <strong>${escapeHtml(stats.renderer)}</strong>
      <span>${stats.drawnObjects} drawn · ${stats.culledObjects} culled</span>
      <small>${stats.totalObjects} scene objects · ${escapeHtml(stats.culling)}</small>
    </div>
  `;
}

function renderViewportTools() {
  const active = state.editorRuntime.getBinding("viewportTools").getState().active;
  const authoringViews = Array.isArray(state.project.scene3d?.authoringViews) ? state.project.scene3d.authoringViews : [];
  const activeViewId = state.project.scene3d?.activeAuthoringViewId ?? authoringViews[0]?.id ?? "";
  return `
    <div class="viewport-tools" aria-label="Viewport tools">
      ${VIEWPORT_TOOL_BUTTONS.slice(0, 4).map((tool) => `<button class="${active === tool.id ? "active" : ""}" type="button" title="${tool.title}" data-viewport-tool="${tool.id}" aria-pressed="${active === tool.id ? "true" : "false"}">${tool.label}</button>`).join("")}
      <button id="add-object-viewport" type="button" title="Add cube">□+</button>
      ${VIEWPORT_TOOL_BUTTONS.slice(4).map((tool) => `<button class="${active === tool.id ? "active" : ""}" type="button" title="${tool.title}" data-viewport-tool="${tool.id}" aria-pressed="${active === tool.id ? "true" : "false"}">${tool.label}</button>`).join("")}
      ${authoringViews.length ? `<label class="viewport-view-picker" title="Choose an authored world view; drag to orbit, Shift-drag to pan, and use the wheel to zoom"><span>View</span><select id="viewport-authoring-view">${authoringViews.map((view) => `<option value="${escapeHtml(view.id)}" ${view.id === activeViewId ? "selected" : ""}>${escapeHtml(view.label)}</option>`).join("")}</select></label>` : ""}
    </div>
  `;
}

function selectAuthoringView(viewId) {
  const view = state.project.scene3d?.authoringViews?.find((entry) => entry.id === viewId);
  if (!view) return;
  state.project.scene3d.activeAuthoringViewId = view.id;
  state.project.scene3d.camera.position = { ...view.position };
  state.project.scene3d.camera.target = { ...view.target };
  if (Number.isFinite(Number(view.fov))) state.project.scene3d.camera.fov = Number(view.fov);
  recordEditorEvent(state, "editor.viewport.view.selected", { domainPath: "n:editor:viewport", viewId: view.id });
  render();
}

function renderViewportTransformControls() {
  const toolState = state.editorRuntime.getBinding("viewportTools").getState();
  if (!["move", "rotate", "scale"].includes(toolState.active)) return "";
  const object = getSceneObject(state.project, state.selectedObjectId);
  const step = toolState.active === "move" ? `${toolState.nudgeStep}m` : toolState.active === "rotate" ? `${toolState.rotateStep}deg` : `${toolState.scaleStep}`;
  return `
    <div class="viewport-transform-pad" data-active-tool="${escapeHtml(toolState.active)}">
      <div class="viewport-transform-head">
        <strong>${escapeHtml(toolState.active)}</strong>
        <small>${escapeHtml(object?.label ?? "No object")} · ${escapeHtml(step)}</small>
      </div>
      <div class="viewport-axis-controls">
        ${["x", "y", "z"].map((axis) => `
          <span>${axis.toUpperCase()}</span>
          <button type="button" data-transform-axis="${axis}" data-transform-direction="-1">−</button>
          <button type="button" data-transform-axis="${axis}" data-transform-direction="1">+</button>
        `).join("")}
      </div>
      <button type="button" id="reset-viewport-transform">Reset</button>
    </div>
  `;
}

function updateViewportStats(stats) {
  state.viewportRenderStats = { ...stats };
  const element = root.querySelector("#viewport-stats");
  if (element) {
    element.dataset.renderer = stats.renderer;
    element.innerHTML = `<strong>${escapeHtml(stats.renderer)}</strong><span>${stats.drawnObjects} drawn · ${stats.culledObjects} culled</span><small>${stats.totalObjects} scene objects · ${escapeHtml(stats.culling)}</small>`;
  }
  window.__NEXUS_VIEWPORT_RENDERER__ = {
    type: viewportRenderer?.type ?? "unknown",
    stats: state.viewportRenderStats,
    camera: viewportRenderer?.getCamera?.() ?? null
  };
}

function renderViewportStage(playableUrl) {
  if (playableUrl) {
    return `<iframe id="playable-game-frame" class="playable-game-frame" src="${escapeHtml(playableUrl)}" title="Play ${escapeHtml(state.project.playable?.title ?? state.project.title)}" allow="fullscreen; gamepad" referrerpolicy="no-referrer"></iframe>`;
  }
  const hasSpatialAuthoringMap = state.project.scene3d?.generatedGame?.authoringMapSchema === "nexusengine.game-authoring-map/1";
  const legacySelectionProxy = hasSpatialAuthoringMap ? "" : `
    <div class="camera-frustum"><span>Main Camera</span></div>
    <div class="light-rig"><span>☼</span></div>
    <button class="default-cube" id="select-cube" type="button" aria-label="${getSceneObject(state.project, state.selectedObjectId)?.label ?? "Default Cube"}">
      <span class="cube-face cube-front"></span>
      <span class="cube-face cube-top"></span>
      <span class="cube-face cube-side"></span>
    </button>
    <div class="transform-gizmo" aria-hidden="true">
      <span class="gizmo-axis gizmo-y"></span>
      <span class="gizmo-axis gizmo-x"></span>
      <span class="gizmo-axis gizmo-z"></span>
      <span class="gizmo-core"></span>
    </div>`;
  return `
    <canvas id="viewport-canvas" class="viewport-canvas" aria-label="WebGL 3D viewport"></canvas>
    <div class="horizon"></div>
    <div class="grid-floor"></div>
    <div class="red-axis"></div>
    <div class="green-axis"></div>
    ${legacySelectionProxy}
    <div class="axis-widget" aria-hidden="true">
      <span class="axis-dot axis-y">Y</span><span class="axis-dot axis-z">Z</span><span class="axis-dot axis-x">X</span>
    </div>`;
}

function render() {
  const manifest = buildEditorExportManifest(state.project);
  const persistenceStatus = state.editorRuntime.getBinding("projectPersistence").getStatus();
  const compositionReport = state.compositionController?.getValidation?.() ?? { ok: false };
  const compositionDirty = state.compositionController?.isDirty?.() === true;
  const compositionBlocked = !state.compositionController?.supported || compositionDirty || !compositionReport.ok;
  const actionReason = !state.compositionController?.supported
    ? "Composition Tree support is unavailable."
    : compositionDirty
      ? "Apply the current draft first."
      : !compositionReport.ok
        ? "Resolve composition validation errors first."
        : "";
  const timelineExpanded = state.workspaceUi?.timelineExpanded === true;
  const activeContext = WORKSPACE_CONTEXTS.has(state.workspaceUi?.activeContext) ? state.workspaceUi.activeContext : "structure";
  const projectActionsOpen = state.workspaceUi?.projectActionsOpen === true;
  const playableUrl = state.mode === "playing" ? resolvePlayableEntry() : null;
  const actionGuidance = state.mode === "playing" ? "" : actionReason || state.compositionUi.message || "";
  const workspaceStyle = [
    `--structure-size:${Math.round(state.workspaceUi.structureWidth)}px`,
    `--inspector-size:${Math.round(state.workspaceUi.inspectorWidth)}px`,
    `--context-size:${Math.round(state.workspaceUi.contextWidth)}px`,
    `--behavior-size:${timelineExpanded ? Math.round(state.workspaceUi.behaviorHeight) : 42}px`,
    `--compact-context-size:${Math.round(state.workspaceUi.compactContextHeight)}px`
  ].join(";");
  state.viewportRenderStats = getProjectedViewportStats();
  viewportRenderer?.dispose();
  root.innerHTML = `
    <header class="command-strip" data-domain-path="n:editor:header">
      <div class="brand-lockup"><strong>NexusEngine Editor</strong><span>${state.project.title}</span></div>
      <nav class="command-buttons hero-commands" aria-label="Composition commands">
        <button id="composition-add-toggle" type="button" ${state.compositionController?.supported ? "" : "disabled"} ${state.mode === "playing" ? "hidden" : ""} title="Add a registered game domain or behavior kit">+ Add<span class="wide-label"> System</span></button>
        <button id="composition-apply" type="button" ${compositionDirty ? "" : "disabled"} ${state.mode === "playing" ? "hidden" : ""} title="${compositionDirty ? "Validate and accept this draft" : "No unapplied draft changes"}">Apply<span class="wide-label"> Changes</span></button>
        <button id="composition-run-once" type="button" ${compositionBlocked ? "disabled" : ""} ${state.mode === "playing" ? "hidden" : ""} title="${escapeHtml(actionReason || "Preview the selected scope once in a disposable engine")}">Preview</button>
        <button id="play" class="primary" ${compositionBlocked || state.mode === "playing" ? "disabled" : ""} ${state.mode === "playing" ? "hidden" : ""} title="${escapeHtml(actionReason || "Play the accepted composition")}"><span>▶</span>Play</button>
        <button id="stop" ${state.mode === "playing" ? "" : "disabled hidden"} title="Stop the running preview"><span>■</span>Stop</button>
      </nav>
      <div class="command-end">
        <button id="project-actions-toggle" class="project-actions-toggle" type="button" ${state.mode === "playing" ? "hidden" : ""} aria-expanded="${projectActionsOpen}" aria-controls="project-actions">Project <span>${projectActionsOpen ? "▴" : "▾"}</span></button>
        <span class="status-pill ${state.mode === "playing" ? "playing" : ""}"><span></span>${renderStatusLabel()}</span>
      </div>
      <div class="action-guidance" aria-live="polite" ${actionGuidance ? "" : "hidden"}>${escapeHtml(actionGuidance)}</div>
    </header>
    <section id="project-actions" class="project-actions-strip" aria-label="Project actions" ${projectActionsOpen ? "" : "hidden"}>
      <button id="new-project" type="button"><span>◇</span>New</button>
      <button id="save" type="button"><span>▣</span>Save</button>
      <button id="load" type="button" ${persistenceStatus.hasLocalSnapshot ? "" : "disabled"}><span>↥</span>Load</button>
      <button id="build" type="button" ${compositionBlocked ? "disabled" : ""} title="${escapeHtml(actionReason)}"><span>&lt;/&gt;</span>Build HTML</button>
      <button id="download" type="button" ${state.build.status === "ready" ? "" : "disabled"}><span>◎</span>Export HTML</button>
      <button id="reset-workspace-layout" type="button"><span>↺</span>Reset Layout</button>
    </section>
    <main class="editor-workspace ${timelineExpanded ? "timeline-expanded" : "timeline-collapsed"}" data-active-context="${activeContext}" data-mode="${state.mode}" data-domain-path="n:editor:viewport" style="${workspaceStyle}">
      <aside class="workspace-dock composer-panel" data-panel="domainStack" data-domain-path="n:editor:dock:kits">
        ${renderCompositionPanel()}
      </aside>

      <div class="workspace-resizer workspace-resizer-structure" data-workspace-resize="structure" role="separator" tabindex="0" aria-label="Resize Game Structure" aria-orientation="vertical" aria-valuemin="220" aria-valuemax="360" aria-valuenow="${state.workspaceUi.structureWidth}"></div>

      <section class="viewport-pane" aria-label="3D editor viewport">
       <header class="viewport-command-row">
        ${renderViewportTools()}
       ${renderViewportTransformControls()}
       </header>
       <section class="scene-stage" data-content="${playableUrl ? "playable-game" : "authoring-scene"}">${renderViewportStage(playableUrl)}</section>
       <footer class="viewport-status-row">${renderViewportStats(state.viewportRenderStats)}</footer>
      </section>

      <div class="workspace-resizer workspace-resizer-inspector" data-workspace-resize="inspector" role="separator" tabindex="0" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="440" aria-valuenow="${state.workspaceUi.inspectorWidth}"></div>
      <div class="workspace-resizer workspace-resizer-context" data-workspace-resize="context" role="separator" tabindex="0" aria-label="Resize contextual workspace" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="420" aria-valuenow="${state.workspaceUi.contextWidth}"></div>

      <aside class="workspace-dock configure-panel" data-panel="configure" data-domain-path="n:editor:dock:inspector">
        ${renderConfigPanel()}
      </aside>

      <nav class="workspace-context-tabs" aria-label="Workspace regions">
        <button type="button" data-workspace-context="structure" class="${activeContext === "structure" ? "active" : ""}">Structure</button>
        <button type="button" data-workspace-context="inspector" class="${activeContext === "inspector" ? "active" : ""}">Inspector</button>
        <button type="button" data-workspace-context="behavior" class="${activeContext === "behavior" ? "active" : ""}">Behaviors</button>
      </nav>

      <div class="workspace-resizer workspace-resizer-behavior" data-workspace-resize="behavior" role="separator" tabindex="0" aria-label="Resize Behaviors" aria-orientation="horizontal" aria-valuemin="180" aria-valuemax="420" aria-valuenow="${state.workspaceUi.behaviorHeight}"></div>
      <div class="workspace-resizer workspace-resizer-compact" data-workspace-resize="compact" role="separator" tabindex="0" aria-label="Resize contextual workspace" aria-orientation="horizontal" aria-valuemin="220" aria-valuemax="420" aria-valuenow="${state.workspaceUi.compactContextHeight}"></div>

      <section class="workspace-dock sequence-panel ${timelineExpanded ? "expanded" : "collapsed"}" data-panel="sequence" data-domain-path="n:editor:dock:sequence">
        <button type="button" id="timeline-toggle" class="timeline-toggle" aria-expanded="${timelineExpanded}">
          <span class="timeline-chevron">${timelineExpanded ? "▾" : "▸"}</span>
          <strong>Behaviors &amp; Automation</strong>
          <span>${state.project.sequenceSteps.length} steps · ${state.editorRuntime.getBinding("sequenceTimeline").getPlayback().runCount} receipts</span>
          <small>${timelineExpanded ? "Collapse" : "Sequence Timeline"}</small>
        </button>
        <div class="timeline-content">
          <div class="sequence-steps">${renderSequenceSteps()}</div>
          ${renderSequenceLinkEditor()}
          ${renderSequencePlayback()}
          <div class="panel-actions timeline-actions"><button id="add-step" type="button">+ Step</button><button id="link-event" type="button">↗ Link Event</button><button id="validate-sequence" type="button">✓ Validate</button></div>
          <div class="panel-actions timeline-run-actions"><button id="run-step" type="button">▶ Step</button><button id="run-sequence" type="button">▶ Sequence</button><button id="reset-sequence" type="button">Reset</button></div>
          <div class="proof-line" aria-live="polite">${state.build.status === "ready" ? `${state.build.fileName} · ${state.build.bytes} bytes` : renderProofEvents()}</div>
        </div>
      </section>

      <script type="application/json" id="project-manifest">${JSON.stringify(manifest).replaceAll("<", "\\u003c")}</script>
      <script type="application/json" id="runtime-manifest">${JSON.stringify(state.editorRuntime.getSnapshot()).replaceAll("<", "\\u003c")}</script>
      <script type="application/json" id="persistence-manifest">${JSON.stringify(persistenceStatus).replaceAll("<", "\\u003c")}</script>
    </main>
  `;

  root.querySelector("#play").addEventListener("click", () => playEditor());
  root.querySelector("#stop").addEventListener("click", () => setMode("stopped"));
  root.querySelector("#project-actions-toggle").addEventListener("click", () => toggleProjectActions());
  root.querySelector("#reset-workspace-layout").addEventListener("click", () => resetWorkspaceLayout());
  root.querySelector("#save").addEventListener("click", () => saveProject());
  root.querySelector("#load").addEventListener("click", () => loadProject());
  root.querySelector("#new-project").addEventListener("click", () => resetProject());
  root.querySelector("#build").addEventListener("click", () => buildHtml());
  root.querySelector("#download").addEventListener("click", () => downloadHtml());
  root.querySelector("#persistence-save-local")?.addEventListener("click", () => saveProject());
  root.querySelector("#persistence-load-local")?.addEventListener("click", () => loadProject());
  root.querySelector("#export-project")?.addEventListener("click", () => exportProjectFile());
  root.querySelector("#import-project")?.addEventListener("click", () => root.querySelector("#project-file-input")?.click());
  root.querySelector("#project-file-input")?.addEventListener("change", (event) => {
    importProjectFile(event.target.files?.[0]).catch((error) => {
      recordEditorEvent(state, "editor.project.import.failed", {
        domainPath: "n:editor:persistence",
        severity: "warning",
        message: error.message
      });
      render();
    });
  });
  root.querySelector("#stack-view")?.addEventListener("click", () => setDomainStackView("stack"));
  root.querySelector("#map-view")?.addEventListener("click", () => setDomainStackView("map"));
  root.querySelector("#domain-stack-search")?.addEventListener("change", (event) => updateDomainStackSearch(event.target.value));
  root.querySelector("#domain-health-filter")?.addEventListener("change", (event) => updateDomainStackHealth(event.target.value));
  root.querySelector("#add-kit")?.addEventListener("click", () => toggleKitPicker());
  root.querySelector("#kit-search")?.addEventListener("change", (event) => updateKitPickerQuery(event.target.value));
  root.querySelector("#kit-category")?.addEventListener("change", (event) => updateKitPickerCategory(event.target.value));
  root.querySelector("#kit-select")?.addEventListener("change", (event) => selectRegistryKit(event.target.value));
  root.querySelector("#reorder-kit")?.addEventListener("click", () => reorderKit());
  root.querySelector("#composition-add-toggle")?.addEventListener("click", () => toggleCompositionAdd());
  root.querySelector("#composition-apply")?.addEventListener("click", () => applyCompositionDraft());
  root.querySelector("#composition-run-once")?.addEventListener("click", () => runCompositionOnce());
  root.querySelector("#timeline-toggle")?.addEventListener("click", () => toggleTimeline());
  for (const button of root.querySelectorAll("[data-workspace-context]")) {
    button.addEventListener("click", () => setWorkspaceContext(button.dataset.workspaceContext));
  }
  root.querySelector("#composition-add-search")?.addEventListener("input", (event) => {
    state.compositionUi.addQuery = event.target.value;
    render();
  });
  root.querySelector("#composition-add-select")?.addEventListener("change", (event) => {
    state.compositionUi.selectedRegistryId = event.target.value;
  });
  root.querySelector("#composition-add-confirm")?.addEventListener("click", () => addCompositionReference());
  for (const button of root.querySelectorAll("[data-add-kind]")) {
    button.addEventListener("click", () => {
      state.compositionUi.addKind = button.dataset.addKind;
      state.compositionUi.selectedRegistryId = "";
      render();
    });
  }
  for (const button of root.querySelectorAll("[data-composition-node]")) {
    button.addEventListener("click", () => selectCompositionNode(button.dataset.compositionNode));
  }
  root.querySelector("#composition-node-enabled")?.addEventListener("click", () => {
    const node = state.compositionController.getSelectedNode();
    state.compositionController.update({ enabled: !node.enabled });
    state.compositionUi.message = "Draft enabled state changed; Apply is required.";
    render();
  });
  root.querySelector("#composition-node-label")?.addEventListener("change", (event) => {
    state.compositionController.update({ labelOverride: event.target.value });
    state.compositionUi.message = "Draft label changed; Apply is required.";
    render();
  });
  root.querySelector("#composition-config-json")?.addEventListener("change", (event) => updateCompositionConfig(event.target.value));
  for (const field of root.querySelectorAll("[data-composition-config-field]")) {
    field.addEventListener("change", () => updateCompositionConfigField(field.dataset.compositionConfigField, field.dataset.configType, field.value));
  }
  root.querySelector("#composition-remove")?.addEventListener("click", () => removeCompositionNode());
  root.querySelector("#add-step")?.addEventListener("click", () => addStep());
  root.querySelector("#link-event")?.addEventListener("click", () => linkEvent());
  root.querySelector("#validate-sequence")?.addEventListener("click", () => validateSequence());
  root.querySelector("#run-step")?.addEventListener("click", () => runSequenceStep());
  root.querySelector("#run-sequence")?.addEventListener("click", () => runSequenceAll());
  root.querySelector("#reset-sequence")?.addEventListener("click", () => resetSequencePlayback());
  root.querySelector("#sequence-source-domain")?.addEventListener("change", (event) => updateSequenceLink({ domainPath: event.target.value }));
  root.querySelector("#sequence-event")?.addEventListener("change", (event) => updateSequenceLink({ event: event.target.value }));
  root.querySelector("#sequence-target-domain")?.addEventListener("change", (event) => updateSequenceLink({ targetDomainPath: event.target.value }));
  root.querySelector("#sequence-target-output")?.addEventListener("change", (event) => updateSequenceLink({ targetOutput: event.target.value }));
  root.querySelector("#config-sequence-label")?.addEventListener("change", (event) => updateSequenceLink({ label: event.target.value }));
  root.querySelector("#config-sequence-source-domain")?.addEventListener("change", (event) => updateSequenceLink({ domainPath: event.target.value }));
  root.querySelector("#config-sequence-event")?.addEventListener("change", (event) => updateSequenceLink({ event: event.target.value }));
  root.querySelector("#config-sequence-target-domain")?.addEventListener("change", (event) => updateSequenceLink({ targetDomainPath: event.target.value }));
  root.querySelector("#config-sequence-target-output")?.addEventListener("change", (event) => updateSequenceLink({ targetOutput: event.target.value }));
  root.querySelector("#config-link-event")?.addEventListener("click", () => {
    state.editorRuntime.getBinding("sequenceTimeline").linkEvent(readConfigSequencePatch());
    render();
  });
  root.querySelector("#config-run-step")?.addEventListener("click", () => runSequenceStep());
  root.querySelector("#config-validate-sequence")?.addEventListener("click", () => validateSequence());
  root.querySelector("#select-cube")?.addEventListener("click", () => selectObject(state.selectedObjectId));
  root.querySelector("#add-object-viewport")?.addEventListener("click", () => addObject());
  for (const button of root.querySelectorAll("[data-viewport-tool]")) {
    button.addEventListener("click", () => setViewportTool(button.dataset.viewportTool));
  }
  root.querySelector("#viewport-authoring-view")?.addEventListener("change", (event) => selectAuthoringView(event.target.value));
  for (const button of root.querySelectorAll("[data-transform-axis]")) {
    button.addEventListener("click", () => nudgeViewportSelection(button.dataset.transformAxis, Number(button.dataset.transformDirection)));
  }
  root.querySelector("#reset-viewport-transform")?.addEventListener("click", () => resetViewportSelectionTransform());
  for (const button of root.querySelectorAll("[data-domain]")) {
    button.addEventListener("click", () => selectDomain(button.dataset.domain));
  }
  for (const button of root.querySelectorAll("[data-object]")) {
    button.addEventListener("click", () => selectObject(button.dataset.object));
  }
  for (const button of root.querySelectorAll("[data-step]")) {
    button.addEventListener("click", () => selectStep(button.dataset.step));
  }
  root.querySelector("#add-object")?.addEventListener("click", () => addObject());
  root.querySelector("#add-object-group")?.addEventListener("click", () => addObjectGroup());
  root.querySelector("#scene-preset-select")?.addEventListener("change", (event) => updateScenePreset(event.target.value));
  root.querySelector("#apply-scene-preset")?.addEventListener("click", () => applyScenePreset());
  root.querySelector("#game-template-select")?.addEventListener("change", (event) => updateGameTemplate(event.target.value));
  root.querySelector("#apply-game-template")?.addEventListener("click", () => applyGameTemplate());
  root.querySelector("#duplicate-object")?.addEventListener("click", () => duplicateObject());
  root.querySelector("#delete-object")?.addEventListener("click", () => deleteObject());
  root.querySelector("#object-search")?.addEventListener("input", (event) => updateSceneObjectSearch(event.target.value));
  root.querySelector("#object-batch-size")?.addEventListener("change", (event) => updateSceneObjectBatchSize(event.target.value));
  root.querySelector("#object-visible-limit")?.addEventListener("change", (event) => updateSceneObjectLimit(event.target.value));
  root.querySelector("#assign-kit")?.addEventListener("click", () => assignSelectedKitToObject());
  root.querySelector("#assign-visible-kit")?.addEventListener("click", () => assignSelectedKitToVisibleObjects());
  root.querySelector("#build-enabled")?.addEventListener("click", () => {
    const config = getKitConfig(state.project, "n:build:web");
    updateBuildConfig("enabled", !config.enabled);
    render();
  });
  root.querySelector("#build-runtime-renderer")?.addEventListener("change", (event) => {
    updateBuildConfig("renderer", event.target.value);
    render();
  });
  root.querySelector("#build-max-drawn")?.addEventListener("change", (event) => {
    updateBuildConfig("maxDrawnObjects", event.target.value);
    render();
  });
  root.querySelector("#build-culling")?.addEventListener("change", (event) => {
    updateBuildConfig("culling", event.target.value);
    render();
  });
  root.querySelector("#build-profile-now")?.addEventListener("click", () => buildHtml());
  root.querySelector("#viewport-enabled")?.addEventListener("click", () => {
    const config = getKitConfig(state.project, "n:render:three");
    updateViewportConfig("enabled", !config.enabled);
    render();
  });
  root.querySelector("#viewport-runtime-renderer")?.addEventListener("change", (event) => {
    updateViewportConfig("renderer", event.target.value);
    render();
  });
  root.querySelector("#viewport-max-drawn")?.addEventListener("change", (event) => {
    updateViewportConfig("viewportMaxDrawnObjects", event.target.value);
    render();
  });
  root.querySelector("#viewport-culling")?.addEventListener("change", (event) => {
    updateViewportConfig("viewportCulling", event.target.value);
    render();
  });
  root.querySelector("#config-enabled")?.addEventListener("click", () => {
    const config = getKitConfig(state.project, state.selectedDomainPath);
    updatePhysicsConfig("enabled", !config.enabled);
    render();
  });
  for (const [id, field] of [["gravity-x", "gravity.x"], ["gravity-y", "gravity.y"], ["gravity-z", "gravity.z"], ["substeps", "substeps"], ["collider", "collider"]]) {
    root.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      updatePhysicsConfig(field, event.target.value);
      render();
    });
  }
  for (const [id, field] of [["object-position-x", "position.x"], ["object-position-y", "position.y"], ["object-position-z", "position.z"], ["object-scale-x", "scale.x"], ["object-scale-y", "scale.y"], ["object-scale-z", "scale.z"]]) {
    root.querySelector(`#${id}`)?.addEventListener("change", (event) => {
      updateObjectTransform(field, event.target.value);
      render();
    });
  }
  const compositionTree = root.querySelector(".composition-tree");
  const selectedCompositionNode = [...root.querySelectorAll("[data-composition-node]")]
    .find((node) => node.dataset.compositionNode === state.compositionController?.getSelectedNode?.()?.id);
  if (compositionTree && selectedCompositionNode) {
    const treeRect = compositionTree.getBoundingClientRect();
    const nodeRect = selectedCompositionNode.getBoundingClientRect();
    if (nodeRect.top < treeRect.top) compositionTree.scrollTop -= treeRect.top - nodeRect.top;
    else if (nodeRect.bottom > treeRect.bottom) compositionTree.scrollTop += nodeRect.bottom - treeRect.bottom;
  }
  bindWorkspaceResizers();
  const playableFrame = root.querySelector("#playable-game-frame");
  playableFrame?.addEventListener("load", () => {
    if (state.playableRuntime) state.playableRuntime.status = "ready";
    playableFrame.dataset.status = "ready";
    recordEditorEvent(state, "editor.playable.ready", { domainPath: state.project.domainPath, playableId: state.project.playable?.id });
  }, { once: true });
  const viewportCanvas = root.querySelector("#viewport-canvas");
  if (viewportCanvas) {
    viewportRenderer = createViewportRenderer(viewportCanvas, state.project, {
      getMode: () => state.mode,
      viewportConfig: normalizeViewportRuntimeConfig(state.project),
      onStats: updateViewportStats
    });
    window.__NEXUS_VIEWPORT_RENDERER__ = { type: viewportRenderer.type, stats: viewportRenderer.getStats?.() ?? state.viewportRenderStats };
  } else {
    viewportRenderer = null;
    window.__NEXUS_VIEWPORT_RENDERER__ = { type: "playable-project", stats: null, entry: playableUrl };
  }
  window.__NEXUS_EDITOR_RUNTIME__ = state.editorRuntime.getSnapshot();
  window.__NEXUS_EDITOR_STATE__ = state;
  window.__NEXUS_COMPOSITION__ = {
    supported: state.compositionController?.supported === true,
    source: nexusEngineLoad.source,
    dirty: state.compositionController?.isDirty?.() === true,
    validation: state.compositionController?.getValidation?.() ?? null,
    tree: state.compositionController?.getTree?.() ?? null,
    receipts: state.compositionController?.getReceipts?.() ?? []
  };
}

render();
