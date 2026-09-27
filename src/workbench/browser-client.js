import { createAuthoringThreePreview } from "../authoring/preview/three-provider.js";
import { createBrowserWorkbenchHost, BROWSER_CORE_COMMIT } from "./browser-host.js";

const $ = (selector) => document.querySelector(selector);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") el.className = value;
    else if (key === "onclick") el.addEventListener("click", value);
    else if (key === "disabled") el.disabled = Boolean(value);
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) el.append(child?.nodeType ? child : document.createTextNode(String(child ?? "")));
  return el;
};
const button = (label, onclick, attrs = {}) => h("button", { class: "btn", onclick, ...attrs }, label);
const pill = (text, kind = "") => h("span", { class: `pill ${kind}` }, text);
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const uuid = () => crypto.randomUUID();
const browserHost = await createBrowserWorkbenchHost();
const state = { data: null, selected: null, tab: "assets", busy: false, error: null, message: "Opening…", mode: "Object", gameView: false, pressed: new Set(), previewUrl: null };

const provider = createAuthoringThreePreview({
  canvas: $("#viewport"),
  onSelect: (id) => { state.selected = id; render(); },
  onTransform: (transform) => updateTransformFromGizmo(transform),
});

async function rpc(method, params = {}) { return browserHost.execute(method, params); }

function revokePreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
}

async function refresh({ preview = true } = {}) {
  state.data = browserHost.state();
  if (preview) {
    try {
      const playState = state.data.workbench.play.state;
      const game = state.gameView && playState !== "stopped";
      const artifact = await browserHost.preview({ play: game });
      revokePreview();
      state.previewUrl = URL.createObjectURL(new Blob([artifact.bytes], { type: "model/gltf-binary" }));
      provider.setViewMode?.(game ? "game" : "scene");
      await provider.load(state.previewUrl, { ...state.data.view, width: Math.max(1, $("#viewport").clientWidth), height: Math.max(1, $("#viewport").clientHeight) }, { preserveCamera: game });
    } catch (error) {
      if (!/assembly|mesh|document|element missing/i.test(error.message)) throw error;
      provider.clear();
    }
  }
  render();
  return state.data;
}

async function run(label, action, { preview = true } = {}) {
  if (state.busy) return;
  state.busy = true; state.error = null; state.message = label; renderStatus();
  try {
    const result = await action();
    state.message = `${label} ✓`;
    await refresh({ preview });
    return result;
  } catch (error) {
    state.error = error.message;
    state.message = `${label} failed`;
    render();
    console.error(error);
    throw error;
  } finally {
    state.busy = false;
    renderStatus();
  }
}

async function ensureAssembly(node) {
  const assembly = state.data.assembly;
  const content = assembly?.content ?? { nodes: [], cameras: [], lights: [] };
  const nodes = [...content.nodes.filter((entry) => entry.id !== node.id), node];
  return rpc("execute", {
    requestId: uuid(), epoch: state.data.status.context.epoch,
    operations: [{ id: "assembly.set", args: { id: state.data.assemblyId, ...(assembly ? { expectedRevision: assembly.revision } : {}), content: { ...content, nodes } } }],
  });
}

async function createPrimitive(type) {
  return run(`Create ${type}`, async () => {
    const id = `${type}-${Date.now().toString(36)}`;
    await rpc("create", { requestId: uuid(), kind: "mesh", id, primitive: type });
    await refresh({ preview: false });
    await ensureAssembly({ id: `${id}-node`, name: id, meshId: id });
    state.selected = `${id}-node`;
  });
}

async function createValidationGame() {
  return run("Create proof game", () => rpc("create-validation-game"), { preview: true });
}

async function save() { return run("Save to IndexedDB", () => rpc("save"), { preview: false }); }
async function validate() { return run("Validate", () => rpc("validate-project"), { preview: false }); }

async function newProject() {
  const key = prompt("New browser project key", `project-${Date.now().toString(36)}`);
  if (!key) return;
  state.selected = null; state.gameView = false;
  return run("New project", () => rpc("new-project", { key }), { preview: true });
}

async function openProject() {
  const key = prompt("Open browser project key", localStorage.getItem("nexusengine-editor:last-project") || "default");
  if (!key) return;
  state.selected = null; state.gameView = false;
  return run("Open project", () => rpc("open-project", { key }), { preview: true });
}

function downloadBytes(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFormat(format) {
  return run(`Export ${format.toUpperCase()}`, async () => {
    const artifact = await rpc("export", { assemblyId: state.data.assemblyId, format });
    downloadBytes(artifact.bytes, artifact.fileName ?? `scene.${format}`, format === "glb" ? "model/gltf-binary" : "application/octet-stream");
    for (const [path, bytes] of Object.entries(artifact.resources ?? {})) {
      downloadBytes(bytes, path.split("/").pop());
    }
    return artifact.receipt;
  }, { preview: false });
}

async function importAsset() {
  const input = h("input", { type: "file", multiple: "true", accept: ".glb,.fbx,.usd,.usda,.usdz,.obj,.png,.jpg,.jpeg" });
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    const supported = new Set(["glb","fbx","usd","usda","usdz","obj"]);
    const primary = files.find((file) => supported.has(file.name.split(".").pop().toLowerCase()));
    if (!primary) return;
    const ext = primary.name.split(".").pop().toLowerCase();
    const format = ["usd","usda"].includes(ext) ? "usdz" : ext;
    const resources = {};
    for (const file of files) if (file !== primary) resources[file.name] = new Uint8Array(await file.arrayBuffer());
    await run(`Import ${primary.name}`, async () => {
      const inspection = await rpc("workbench-import-inspect", {
        requestId: uuid(), format, prefix: primary.name.replace(/\.[^.]+$/, ""), bytes: new Uint8Array(await primary.arrayBuffer()), resources,
      });
      if (inspection.validation?.errors) throw new Error(`Import validation has ${inspection.validation.errors} error(s).`);
      if (!confirm(`Import ${primary.name}? ${inspection.validation?.warnings ?? 0} warning(s).`)) return;
      return rpc("workbench-import-commit", { plan: inspection.plan });
    });
  };
  input.click();
}

async function play(action = "play") {
  return run(action, async () => {
    const result = await rpc(action, action === "play" ? { autoTick: true, controlledNodeId: "player-node" } : {});
    if (action === "play" || action === "resume") state.gameView = true;
    if (action === "stop") { state.gameView = false; state.pressed.clear(); provider.setViewMode?.("scene"); }
    return result;
  }, { preview: action !== "pause" });
}

function inputIntent() {
  const has = (key) => state.pressed.has(key);
  return {
    x: (has("d") || has("arrowright") ? 1 : 0) - (has("a") || has("arrowleft") ? 1 : 0),
    y: (has("w") || has("arrowup") ? 1 : 0) - (has("s") || has("arrowdown") ? 1 : 0),
    actions: { primary: has(" "), interact: has("e") },
  };
}
async function sendPlayInput() {
  if (state.data?.workbench?.play?.state === "stopped") return;
  try { await rpc("play-input", { intent: inputIntent() }); } catch {}
}

async function updateTransformFromGizmo(next) {
  const node = state.data?.assembly?.content?.nodes?.find((entry) => entry.id === next.id);
  if (!node || state.gameView) return;
  return updateNode(node, { ...node, transform: { translation: next.translation, rotation: next.rotation, scale: next.scale } });
}

async function updateNode(old, next) {
  const assembly = state.data.assembly;
  if (!assembly) return;
  const nodes = assembly.content.nodes.map((node) => node.id === old.id ? next : node);
  return run("Update object", () => rpc("execute", {
    requestId: uuid(), epoch: state.data.status.context.epoch,
    operations: [{ id: "assembly.set", args: { id: state.data.assemblyId, expectedRevision: assembly.revision, content: { ...assembly.content, nodes } } }],
  }));
}

async function deleteNode(node) {
  const assembly = state.data.assembly;
  state.selected = null;
  return run("Delete object", () => rpc("execute", {
    requestId: uuid(), epoch: state.data.status.context.epoch,
    operations: [{ id: "assembly.set", args: { id: state.data.assemblyId, expectedRevision: assembly.revision, content: { ...assembly.content, nodes: assembly.content.nodes.filter((entry) => entry.id !== node.id) } } }],
  }));
}

function setTab(tab) { state.tab = tab; renderBottom(); }

function renderMenus() {
  const el = clear($("#menus"));
  el.append(h("div", { class: "brand" }, h("strong", {}, "NEXUSENGINE"), h("span", {}, "EDITOR")));
  el.append(
    button("New", newProject), button("Open", openProject), button("Save", save), button("Import", importAsset),
    h("div", { class: "divider" }),
    button("Domains", () => setTab("domains")), button("Kits", () => setTab("kits")), button("Validation", () => setTab("validation")),
    button("Build", () => setTab("build")),
    h("span", { class: "spacer" }),
    pill(`Core ${BROWSER_CORE_COMMIT.slice(0, 8)}`, "ok")
  );
}

function renderToolbar() {
  const el = clear($("#toolbar")), p = state.data?.workbench?.play?.state ?? "stopped";
  el.append(
    button("▶ Play", () => play("play"), { class: "btn primary", disabled: p !== "stopped" }),
    button("⏸ Pause", () => play(p === "paused" ? "resume" : "pause"), { disabled: p === "stopped" }),
    button("■ Stop", () => play("stop"), { disabled: p === "stopped" }),
    button("Scene", () => { state.gameView = false; provider.setViewMode?.("scene"); refresh(); }, { class: !state.gameView ? "btn primary" : "btn" }),
    button("Game", () => { state.gameView = true; provider.setViewMode?.("game"); refresh(); }, { class: state.gameView ? "btn primary" : "btn", disabled: p === "stopped" }),
    h("div", { class: "divider" }),
    button("Validate", validate), button("Proof Game", createValidationGame, { disabled: Boolean(state.data?.workbench?.validationGame?.ready) }),
    h("div", { class: "divider" }),
    button("+ Cube", () => createPrimitive("box")), button("+ Sphere", () => createPrimitive("sphere")), button("+ Plane", () => createPrimitive("plane")), button("+ Torus", () => createPrimitive("torus")),
    h("span", { class: "spacer" }),
    button("GLB", () => exportFormat("glb")), button("FBX", () => exportFormat("fbx")), button("USDZ", () => exportFormat("usdz"))
  );
  for (const mode of ["Object","Edit","Sculpt","Paint","Rig","Animation"]) {
    el.append(button(mode, () => { state.mode = mode; renderToolbar(); renderInspector(); }, { class: mode === state.mode ? "btn primary" : "btn" }));
  }
}

function renderOutliner() {
  const el = clear($("#outliner-list")), nodes = state.data?.assembly?.content?.nodes ?? [];
  if (!nodes.length) el.append(h("div", { class: "empty" }, "No scene objects. Create a primitive or Proof Game."));
  for (const node of nodes) {
    el.append(h("button", { class: `tree-row ${state.selected === node.id ? "selected" : ""}`, onclick: () => {
      state.selected = node.id; provider.select(node.id); renderOutliner(); renderInspector();
    } }, node.meshId ? "◈" : "◇", " ", node.name ?? node.id));
  }
}

function renderCapabilityInspector(el) {
  const selected = new Map((state.data?.workbench?.composition?.content?.nodes ?? []).filter((node) => node.kind === "kit" && node.enabled !== false).map((node) => [node.registryId, node]));
  const groups = [["PHYSICS","n:physics"],["INPUT","n:interaction:input"],["INTERACTION","n:interaction"],["PRESENTATION","n:presentation"],["SEQUENCE","n:authoring:sequence"]];
  for (const [label, prefix] of groups) {
    const kits = state.data?.workbench?.catalog?.kits?.filter((kit) => (kit.domainPath === prefix || kit.domainPath.startsWith(prefix + ":")) && selected.has(kit.id)) ?? [];
    el.append(h("div", { class: "section-title" }, label));
    if (!kits.length) { el.append(button("+ Add capability", () => setTab("kits"))); continue; }
    for (const kit of kits.slice(0, 8)) {
      const cnode = selected.get(kit.id);
      el.append(h("div", { class: "kv" }, h("span", {}, kit.id), button("Configure", async () => {
        const value = prompt(`Configure ${kit.id} as JSON`, JSON.stringify(cnode.config ?? {}, null, 2));
        if (value == null) return;
        await run(`Configure ${kit.id}`, () => rpc("composition-configure", { nodeId: cnode.id, config: JSON.parse(value) }), { preview: false });
      })));
    }
  }
}

function renderInspector() {
  const el = clear($("#inspector-body"));
  const node = state.data?.assembly?.content?.nodes?.find((entry) => entry.id === state.selected);
  el.append(h("div", { class: "small" }, `Mode: ${state.mode}`));
  if (!node) {
    el.append(h("div", { class: "empty" }, "Select an object."), button("Browse Kits", () => setTab("kits")));
    return;
  }
  el.append(h("h3", {}, node.name ?? node.id), h("div", { class: "muted" }, node.meshId ?? "Group"));
  const t = node.transform ?? { translation: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] };
  el.append(h("div", { class: "section-title" }, "TRANSFORM"));
  const xyz = h("div", { class: "xyz" });
  t.translation.forEach((value, index) => {
    const input = h("input", { type: "number", step: "0.1", value: String(value) });
    input.onchange = () => updateNode(node, { ...node, transform: { ...t, translation: t.translation.map((x, i) => i === index ? Number(input.value) : x) } });
    xyz.append(h("label", {}, ["X","Y","Z"][index], input));
  });
  el.append(xyz, h("div", { class: "section-title" }, "MESH"), h("div", {}, node.meshId ?? "None"), h("div", { class: "section-title" }, "MATERIALS"), h("div", {}, (node.materials ?? []).join(", ") || "None"));
  renderCapabilityInspector(el);
  el.append(h("div", { class: "section-title" }, "ACTIONS"), button("Delete", () => deleteNode(node)));
}

function catalogRow(title, description, actions = []) {
  return h("div", { class: "catalog-row" }, h("div", { class: "catalog-main" }, h("strong", {}, title), h("span", { class: "muted" }, description)), h("div", { class: "catalog-meta" }, ...actions));
}
function validationCard(title, value) {
  return h("div", { class: "validation-card" }, h("h3", {}, title), pill(value?.errors ? `${value.errors} errors` : value?.ok === false ? "invalid" : "valid", value?.errors || value?.ok === false ? "bad" : "ok"), h("pre", {}, JSON.stringify(value, null, 2)));
}

function renderBottom() {
  $("#bottom-tabs").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.tab));
  const el = clear($("#bottom-content")), wb = state.data?.workbench;
  if (!wb) return;
  if (state.tab === "assets") {
    for (const doc of state.data.documents) el.append(h("button", { class: "asset-row", onclick: () => { if (doc.kind === "assembly") return; } }, `${doc.kind} · ${doc.id}`));
  } else if (state.tab === "domains") {
    for (const domain of wb.catalog.domains) el.append(catalogRow(domain.domainPath, domain.responsibility, [pill(domain.installed ? "installed" : "available", domain.installed ? "ok" : ""), pill(domain.status)]));
  } else if (state.tab === "kits") {
    for (const kit of wb.catalog.kits) {
      const action = kit.selected
        ? button("Remove", () => run(`Remove ${kit.id}`, () => rpc("composition-remove-kit", { kitId: kit.id }), { preview: false }))
        : button("Add", () => run(`Add ${kit.id}`, () => rpc("composition-add-kit", { kitId: kit.id }), { preview: false }));
      el.append(catalogRow(kit.id, `${kit.domainPath} · ${kit.responsibility}`, [pill(kit.installed ? "runtime" : "catalog", kit.installed ? "ok" : ""), pill(kit.status), action]));
    }
  } else if (state.tab === "validation") {
    el.append(validationCard("Project", state.data.validation), validationCard("Composition", wb.compositionValidation));
  } else if (state.tab === "composition") {
    for (const node of wb.composition?.content?.nodes ?? []) el.append(catalogRow(node.registryId, `${node.kind} · parent ${node.parentNodeId ?? "root"}`, [pill(node.enabled === false ? "disabled" : "enabled", node.enabled === false ? "warn" : "ok")]));
  } else if (state.tab === "runtime") {
    el.append(catalogRow("PLAY MODE", "Runtime is cloned from Authoring; Stop discards runtime state.", [pill(wb.play.state, wb.play.state === "playing" ? "ok" : "")]));
    for (const [key, value] of Object.entries({ ticks: wb.play.ticks ?? 0, frame: wb.play.frame ?? 0, elapsed: Number(wb.play.elapsed ?? 0).toFixed(2), installedKits: (wb.play.installedKits ?? []).length })) el.append(h("div", { class: "kv" }, h("span", {}, key), h("span", {}, String(value))));
  } else if (state.tab === "build") {
    el.append(h("h3", {}, "BUILD"), h("div", { class: "notice" }, "Static GitHub Pages mode does not execute Core Build toolchains. Web/PCVR/Android/OpenXR builds require the local Editor host. Browser authoring, Play, import, validation and GLB/FBX/USDZ export remain available."));
    for (const id of state.data.browserCapabilities.buildTargets) el.append(catalogRow(id, "Requires local host", [pill("local host", "warn")]));
  } else {
    for (const receipt of [...(wb.receipts ?? [])].reverse()) el.append(h("div", { class: "console-row" }, h("span", { class: "muted" }, receipt.at?.slice(11,19) ?? ""), h("strong", {}, receipt.action), h("span", {}, receipt.kind)));
  }
}

function renderStatus() {
  const el = clear($("#statusbar"));
  if (!state.data) return;
  const s = state.data.status, wb = state.data.workbench;
  el.append(h("span", {}, state.message), state.error ? pill(state.error, "bad") : pill(s.dirty ? "Unsaved" : "Saved", s.dirty ? "warn" : "ok"), pill(s.projectKey), pill(`${wb.catalogSummary.domains} domains`), pill(`${wb.catalogSummary.kits} kits`), pill(`Play: ${wb.play.state}`), h("span", { class: "spacer" }), h("span", { class: "muted" }, `Core ${BROWSER_CORE_COMMIT.slice(0, 8)}`));
}

function render() {
  if (!state.data) return;
  renderMenus(); renderToolbar(); renderOutliner(); renderInspector(); renderBottom(); renderStatus();
  window.nexusWorkbench = { state, provider, host: browserHost, refresh, rpc };
}

for (const tab of $("#bottom-tabs").querySelectorAll("button")) tab.addEventListener("click", () => setTab(tab.dataset.tab));

window.addEventListener("keydown", (event) => {
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === "s") { event.preventDefault(); save(); return; }
  const key = event.key.toLowerCase();
  if (state.gameView && !command && ["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","e"," "].includes(key)) {
    event.preventDefault(); state.pressed.add(key); sendPlayInput();
  }
});
window.addEventListener("keyup", (event) => { const key = event.key.toLowerCase(); if (state.pressed.delete(key)) sendPlayInput(); });
window.addEventListener("resize", () => provider.resize(Math.max(1, $("#viewport").clientWidth), Math.max(1, $("#viewport").clientHeight)));
window.addEventListener("beforeunload", () => { revokePreview(); provider.dispose(); });

setInterval(() => {
  if (!state.busy && state.gameView && state.data?.workbench?.play?.state === "playing") refresh({ preview: true }).catch(() => {});
}, 300);

try {
  await refresh();
  state.message = "Ready";
  render();
} catch (error) {
  state.error = error.message;
  state.message = "Editor failed to open";
  console.error(error);
  renderStatus();
}
