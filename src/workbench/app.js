import { createAuthoringThreePreview } from "../authoring/preview/three-provider.js";
import { assertHost, cleanRelativePath, errorRecord } from "./host-contract.js";
import { createSceneCommands } from "./scene-commands.js";
import { element as h, empty } from "./ui/dom.js";
import { artifactDownload, triggerDownload } from "./ui/download.js";

/** The only GUI implementation. Neither HTTP nor Core persistence belongs in this file. */
export async function startWorkbench(adapter, { root = document, debug = false } = {}) {
  const host = assertHost(adapter), commands = createSceneCommands(host), $ = selector => root.querySelector(selector);
  const state = { data: null, selected: null, tab: "assets", busy: false, error: null, message: "Starting…", gameView: false, search: "", keys: new Set() };
  let disposed = false, framePending = false, previewPending = false, currentUrl = null;
  const listeners = [];
  const listen = (target, event, action) => { target.addEventListener(event, action); listeners.push(() => target.removeEventListener(event, action)); };
  const provider = createAuthoringThreePreview({ canvas: $("#viewport"),
    onSelect: id => { state.selected = id; provider.select(id); renderSelection(); },
    onTransform: t => run("Transform", () => commands.updateNode(t.id, { transform: { translation: t.translation, rotation: t.rotation, scale: t.scale } })) });
  const pill = (text, kind = "") => h("span", { class: `pill ${kind}` }, text);
  const action = (label, callback, attributes = {}) => h("button", { class: "btn", onclick: () => { Promise.resolve().then(callback).catch(showError); }, ...attributes }, label);
  const playing = () => state.data?.workbench?.play?.state !== "stopped";
  function showError(error) { state.error = errorRecord(error); state.message = error.message; renderStatus(); }
  async function refresh({ preview = true, preserveCamera = true } = {}) {
    if (disposed) return;
    state.data = await host.state();
    if (preview && !previewPending) {
      previewPending = true;
      try {
        if (!state.data.assembly) { provider.clear(); state.gameView = false; }
        else {
          const artifact = await host.preview({ play: playing() });
          const url = URL.createObjectURL(new Blob([artifact.bytes], { type: "model/gltf-binary" }));
          try {
            await provider.load(url, { ...state.data.view, width: Math.max(1, $("#viewport").clientWidth), height: Math.max(1, $("#viewport").clientHeight) }, { preserveCamera });
            if (currentUrl) URL.revokeObjectURL(currentUrl); currentUrl = url;
          } catch (error) { URL.revokeObjectURL(url); throw error; }
          if (state.gameView && !provider.inspect().hasGameCamera) state.gameView = false;
          provider.setViewMode(state.gameView ? "game" : "scene"); provider.select(state.selected);
        }
      } finally { previewPending = false; }
    }
    render();
  }
  async function run(label, fn, options = {}) {
    if (state.busy || disposed) return;
    state.busy = true; state.error = null; state.message = `${label}…`; render();
    try { const result = await fn(); await refresh(options); state.message = `${label} completed`; return result; }
    catch (error) { showError(error); return null; }
    finally { state.busy = false; render(); }
  }
  const editable = () => !state.busy && !playing();
  async function create(type) { return run(`Create ${type}`, async () => { state.selected = await commands.createPrimitive(type); }, { preserveCamera: false }); }
  async function save() { return run("Save", () => host.execute("save"), { preview: false }); }
  async function replaceProject(method) {
    if (state.data.status.dirty && !confirm("Discard unsaved changes in the current project?")) return;
    const local = state.data.capabilities.environment === "local";
    const key = prompt(local ? "Project folder" : "Browser project key", method === "new-project" ? `project-${Date.now().toString(36)}` : state.data.status.projectKey ?? state.data.status.projectRoot ?? "default");
    if (!key) return;
    await run(method === "new-project" ? "New project" : "Open project", async () => {
      const result = await host.execute(method, { key, directory: local ? key : undefined, discard: true });
      state.selected = null; state.gameView = false; state.keys.clear(); return result;
    }, { preserveCamera: false });
  }
  async function exportFormat(format) {
    return run(`Export ${format.toUpperCase()}`, async () => {
      const artifact = await host.execute("export", { assemblyId: state.data.assemblyId, format });
      triggerDownload(artifactDownload(artifact)); return artifact.receipt;
    }, { preview: false });
  }
  async function importFiles(files) {
    const primaries = files.filter(f => /\.(glb|fbx|usda?|usdz|obj)$/i.test(f.name));
    if (primaries.length !== 1) throw new Error("Select one model and any required companion resource files.");
    const main = primaries[0], ext = main.name.split(".").pop().toLowerCase();
    const format = ["usd", "usda"].includes(ext) ? "usdz" : ext;
    const resources = Object.create(null); let total = 0;
    for (const file of files) {
      if ((total += file.size) > 64 * 1024 * 1024) throw new Error("Import selection exceeds the 64 MiB transport limit.");
      if (file !== main) { const path = cleanRelativePath(file.webkitRelativePath || file.name); if (resources[path]) throw new Error(`Duplicate resource ${path}.`); resources[path] = new Uint8Array(await file.arrayBuffer()); }
    }
    return run(`Import ${main.name}`, async () => {
      const result = await host.execute("import-inspect", { requestId: crypto.randomUUID(), format,
        prefix: `import-${crypto.randomUUID()}`, bytes: new Uint8Array(await main.arrayBuffer()), resources });
      if (result.validation.errors) throw Object.assign(new Error("Core rejected the import."), { details: result.validation });
      const messages = result.validation.issues?.map(i => i.message).join("\n") ?? "";
      if (!confirm(`Import ${main.name}?\n${messages}`)) return;
      return host.execute("import-commit", { plan: result.plan });
    }, { preserveCamera: false });
  }
  function importDialog() {
    const picker = h("input", { type: "file", multiple: true, accept: ".glb,.fbx,.usd,.usda,.usdz,.obj,.png,.jpg,.jpeg,.mtl,.bin", hidden: "", "data-testid": "import-files" });
    listen(picker, "change", () => importFiles([...picker.files]).catch(showError).finally(() => picker.remove()));
    document.body.append(picker); picker.click();
  }
  async function play(method) {
    await run(method, async () => {
      const p = method === "play" ? { autoTick: true, assemblyId: state.data.assemblyId,
        controlledNodeId: state.data.workbench.validationGame.ready ? "player-node" : state.selected ?? state.data.assembly?.content.nodes.find(n => n.meshId)?.id } : {};
      const result = await host.execute(method, p);
      state.keys.clear();
      if (method === "play" || method === "resume") state.gameView = Boolean(state.data.assembly?.content.cameras.length);
      if (method === "stop") state.gameView = false;
      return result;
    });
    if (method === "play") $("#viewport").focus();
  }
  function inputIntent() {
    const has = k => state.keys.has(k);
    return { x: Number(has("d") || has("arrowright")) - Number(has("a") || has("arrowleft")),
      y: Number(has("w") || has("arrowup")) - Number(has("s") || has("arrowdown")),
      actions: { primary: has(" "), interact: has("e") } };
  }
  async function sendInput() { if (playing()) await host.execute("play-input", { intent: inputIntent() }); }
  function catalogRow(title, description, controls = []) { return h("div", { class: "catalog-row" }, h("div", { class: "catalog-main" }, h("strong", {}, title), h("span", { class: "muted" }, description)), h("div", { class: "catalog-meta" }, ...controls)); }
  function report(title, value) { return h("section", { class: "validation-card" }, h("h3", {}, title), h("pre", {}, JSON.stringify(value, null, 2))); }
  function tab(name) { state.tab = name; renderBottom(); }
  function renderMenus() {
    const el = empty($("#menus"));
    el.append(h("div", { class: "brand" }, h("strong", {}, "NEXUSENGINE"), h("span", {}, "EDITOR")),
      action("New", () => replaceProject("new-project"), { disabled: state.busy }), action("Open", () => replaceProject("open-project"), { disabled: state.busy }),
      action("Save", save, { disabled: state.busy || state.data.capabilities.save.status !== "available" }), action("Import", importDialog, { disabled: !editable() }),
      action("Undo", () => run("Undo", () => commands.travel("undo")), { disabled: !editable() }), action("Redo", () => run("Redo", () => commands.travel("redo")), { disabled: !editable() }),
      h("span", { class: "spacer" }), pill(state.data.capabilities.environment), action("About", () => alert(`Core: ${state.data.status.runtime?.coreCommit ?? state.data.status.runtime?.version}\nOne GUI · Core Authoring APIs`)));
  }
  function renderToolbar() {
    const el = empty($("#toolbar")), p = state.data.workbench.play.state;
    el.append(action("▶ Play", () => play("play"), { disabled: state.busy || p !== "stopped" || !state.data.assembly, "data-testid": "play" }),
      action(p === "paused" ? "Resume" : "Pause", () => play(p === "paused" ? "resume" : "pause"), { disabled: state.busy || !["paused", "playing"].includes(p), "data-testid": "pause" }),
      action("Stop", () => play("stop"), { disabled: state.busy || p === "stopped", "data-testid": "stop" }),
      action("Scene", () => { state.gameView = false; provider.setViewMode("scene"); renderToolbar(); }),
      action("Game", () => { provider.setViewMode("game"); state.gameView = true; renderToolbar(); }, { disabled: !playing() || !state.data.assembly?.content.cameras.length }),
      action("Validate", () => run("Validate", async () => { await host.execute("validate-project"); tab("validation"); }, { preview: false })),
      action("Proof Game", () => run("Create proof scene", () => host.execute("create-validation-game"), { preserveCamera: false }), { disabled: !editable() || Boolean(state.data.assembly) }),
      ...["box", "sphere", "plane", "torus"].map(type => action(`+ ${type === "box" ? "Cube" : type[0].toUpperCase() + type.slice(1)}`, () => create(type), { disabled: !editable(), "data-testid": `create-${type}` })),
      action("Frame", () => provider.frame()), h("span", { class: "spacer" }),
      ...state.data.exportFormats.map(f => action(f.format.toUpperCase(), () => exportFormat(f.format), { disabled: state.busy || !state.data.assembly })));
    $("#viewport-label").textContent = state.gameView ? "GAME VIEW · Preview movement" : "SCENE VIEW";
  }
  function renderSelection() {
    const el = empty($("#outliner-list"));
    if (!state.data.assembly) el.append(h("div", { class: "empty" }, "Create or import a model to begin."));
    for (const node of state.data.assembly?.content.nodes ?? []) el.append(action(node.name, () => { state.selected = node.id; provider.select(node.id); renderSelection(); }, { class: `tree-row ${state.selected === node.id ? "selected" : ""}`, "data-node-id": node.id }));
    renderInspector();
  }
  function renderInspector() {
    const el = empty($("#inspector-body")), node = state.data.assembly?.content.nodes.find(n => n.id === state.selected);
    if (!node) { el.append(h("div", { class: "empty" }, "Select a scene object.")); return; }
    el.append(h("h3", {}, node.name), h("div", { class: "muted" }, node.meshId ?? "Group"));
    for (const [property, labels] of [["translation", ["X", "Y", "Z"]], ["rotation", ["X", "Y", "Z", "W"]], ["scale", ["X", "Y", "Z"]]]) {
      el.append(h("div", { class: "section-title" }, property.toUpperCase())); const fields = h("div", { class: "xyz" });
      node.transform[property].forEach((value, index) => {
        const input = h("input", { type: "number", step: property === "rotation" ? ".01" : ".1", value, disabled: !editable(), "aria-label": `${property} ${labels[index]}` });
        input.addEventListener("change", () => { const v = Number(input.value); if (!Number.isFinite(v)) return showError(new Error("A finite transform value is required."));
          const transform = structuredClone(node.transform); transform[property][index] = v; run("Transform", () => commands.updateNode(node.id, { transform })); });
        fields.append(h("label", {}, labels[index], input));
      }); el.append(fields);
    }
    el.append(h("div", { class: "section-title" }, "MATERIALS"));
    const materialDocs = state.data.documents.filter(d => d.kind === "material");
    if (!node.materials.length) el.append(h("div", { class: "muted" }, "No material slots assigned."));
    node.materials.forEach((id, slot) => {
      const select = h("select", { disabled: !editable(), "aria-label": `Material ${slot}` }, ...materialDocs.map(d => h("option", { value: d.id }, d.id))); select.value = id;
      select.addEventListener("change", () => run("Assign material", () => commands.updateNode(node.id, { materials: node.materials.map((value, i) => i === slot ? select.value : value) }))); el.append(select);
    });
    if (node.meshId && !node.materials.length && materialDocs.length) el.append(action("Assign material", () => run("Assign material", () => commands.updateNode(node.id, { materials: [materialDocs[0].id] })), { disabled: !editable() }));
    el.append(h("div", { class: "section-title" }, "PROJECT CAPABILITIES"), h("p", { class: "small" }, "These are project Kit settings, not per-object physics components."));
    const selected = new Map((state.data.workbench.composition?.content.nodes ?? []).filter(n => n.kind === "kit").map(n => [n.registryId, n]));
    for (const [label, prefix] of [["Physics", "n:physics"], ["Input", "n:interaction:input"], ["Interaction", "n:interaction"], ["Presentation", "n:presentation"], ["Sequence", "n:authoring:sequence"]]) {
      const kits = state.data.workbench.catalog.kits.filter(k => selected.has(k.id) && (k.domainPath === prefix || k.domainPath.startsWith(prefix + ":")));
      el.append(h("details", {}, h("summary", {}, `${label} (${kits.length})`), ...kits.map(k => action(k.id, async () => {
        const raw = prompt(`Core configuration: ${k.id}`, JSON.stringify(selected.get(k.id).config, null, 2)); if (raw === null) return;
        const config = JSON.parse(raw); await run("Configure Kit", () => host.execute("composition-configure", { nodeId: selected.get(k.id).id, config }), { preview: false });
      }, { disabled: !editable() })), action("Browse Kits", () => tab("kits"))));
    }
    el.append(h("div", { class: "section-title" }, "ACTIONS"), action("Duplicate", () => run("Duplicate", async () => { state.selected = await commands.duplicateNode(node.id); }), { disabled: !editable() }),
      action("Delete", () => run("Delete", async () => { await commands.deleteNode(node.id); state.selected = null; }), { disabled: !editable() }));
  }
  function renderBottom() {
    $("#bottom-tabs").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
    const el = empty($("#bottom-content")), wb = state.data.workbench;
    if (state.tab === "assets") {
      for (const doc of state.data.documents) el.append(action(`${doc.kind} · ${doc.id}`, () => doc.kind === "assembly" ? run("Select assembly", () => host.execute("select-assembly", { id: doc.id }), { preserveCamera: false }) : run("Inspect asset", async () => { const d = await host.execute("read", { id: doc.id }); alert(JSON.stringify(d, null, 2).slice(0, 12000)); }, { preview: false }), { class: "asset-row" }));
    } else if (state.tab === "domains" || state.tab === "kits") {
      const search = h("input", { type: "search", placeholder: "Filter catalog", value: state.search, "aria-label": "Filter catalog" });
      search.addEventListener("change", () => { state.search = search.value; renderBottom(); }); el.append(search);
      const items = state.tab === "domains" ? wb.catalog.domains : wb.catalog.kits;
      for (const item of items.filter(x => `${x.id} ${x.domainPath} ${x.responsibility ?? ""}`.toLowerCase().includes(state.search.toLowerCase()))) {
        const availability = item.environmentAvailability;
        const controls = [pill(item.selected ? "selected" : item.installed ? "installed" : "catalog"), pill(item.status)];
        if (state.tab === "kits") controls.push(action(item.selected ? "Remove" : "Add", () => run(`${item.selected ? "Remove" : "Add"} Kit`, () => host.execute(item.selected ? "composition-remove-kit" : "composition-add-kit", { kitId: item.id }), { preview: false }), { disabled: !editable() || (!item.selected && availability && availability.status !== "available"), title: availability?.reason ?? "Core validates the dependency closure." }));
        el.append(catalogRow(state.tab === "domains" ? item.domainPath : item.id, item.responsibility ?? item.ownedMeaning?.join(", ") ?? "", controls), h("details", {}, h("summary", {}, "Contracts / dependencies / proof"), h("pre", {}, JSON.stringify({ requires: item.requires, provides: item.provides, settingsSchema: item.settingsSchema, proof: item.metadata?.proof, environment: availability }, null, 2))));
      }
    } else if (state.tab === "validation") {
      el.append(report("Project", state.data.validation), report("Composition", wb.compositionValidation)); if (state.error) el.append(report("Last operation error", state.error));
    } else if (state.tab === "composition") {
      el.append(action("Plan composition", () => run("Plan", async () => { const result = await host.execute("composition-plan"); alert(JSON.stringify(result, null, 2)); }, { preview: false })));
      for (const node of wb.composition?.content.nodes ?? []) el.append(catalogRow(node.registryId, `${node.kind} · ${node.parentNodeId ?? "root"}`, [pill(node.enabled ? "enabled" : "disabled")]));
    } else if (state.tab === "runtime") {
      el.append(h("p", { class: "notice" }, "Play isolates source in a disposable Core runtime. Current movement is an Authoring-transform preview, not collision/physics execution."), report("Runtime", wb.play));
    } else if (state.tab === "build") {
      const cap = state.data.capabilities.build;
      if (cap.status !== "available") { el.append(h("div", { class: "notice" }, cap.reason)); return; }
      el.append(action("Refresh targets", () => run("Targets", () => host.execute("build-targets"), { preview: false })));
      for (const target of wb.buildTargets ?? []) el.append(catalogRow(target.id ?? target.name, target.status ?? "Inspect before building", [action("Plan", async () => {
        const project = prompt("Build source directory", state.data.status.projectRoot ?? ""); if (!project) return;
        await run("Build plan", () => host.execute("build-plan", { request: { project, targets: [target.id ?? target.name], profile: "native-preferred" } }), { preview: false });
      })]));
      if (wb.buildPlan) el.append(report("Review build plan", wb.buildPlan), action("Approve & Build", async () => {
        if (!confirm(`Approve exactly plan ${wb.buildPlan.id}?`)) return;
        const out = prompt("Build output directory"); if (!out) return;
        await run("Build", () => host.execute("build-apply", { planId: wb.buildPlan.id, approval: { planId: wb.buildPlan.id, approved: true }, options: { out } }), { preview: false });
      }, { disabled: state.busy }));
      if (wb.buildReceipt) el.append(report("Build receipt", wb.buildReceipt));
    } else {
      for (const receipt of [...wb.receipts].reverse()) el.append(catalogRow(receipt.action, `${receipt.at} · ${receipt.result?.status ?? receipt.kind}`));
      if (state.error) el.append(report("Last error", state.error));
    }
  }
  function renderStatus() {
    const el = empty($("#statusbar"));
    el.append(h("span", {}, state.message)); if (!state.data) return;
    const wb = state.data.workbench;
    el.append(pill(state.data.status.dirty ? "Unsaved" : "Saved", state.data.status.dirty ? "warn" : "ok"),
      pill(`${wb.catalogSummary.domains} domains`), pill(`${wb.catalogSummary.kits} kits`), pill(`Play: ${wb.play.state}`));
    if (state.error) el.append(pill(state.error.code, "bad"));
  }
  function render() { if (!state.data || disposed) return; renderMenus(); renderToolbar(); renderSelection(); renderBottom(); renderStatus(); }
  for (const b of $("#bottom-tabs").querySelectorAll("button")) listen(b, "click", () => tab(b.dataset.tab));
  listen(window, "keydown", e => {
    const key = e.key.toLowerCase(), command = e.ctrlKey || e.metaKey;
    if (command && key === "s") { e.preventDefault(); save(); return; }
    if (command && key === "p") { e.preventDefault(); $("#command-palette").showModal(); return; }
    if (command && key === "z" && editable()) { e.preventDefault(); run(e.shiftKey ? "Redo" : "Undo", () => commands.travel(e.shiftKey ? "redo" : "undo")); return; }
    if (playing() && !command && document.activeElement === $("#viewport") && ["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","e"," "].includes(key)) {
      e.preventDefault(); if (!state.keys.has(key)) { state.keys.add(key); sendInput().catch(showError); }
    }
  });
  listen(window, "keyup", e => { if (state.keys.delete(e.key.toLowerCase())) sendInput().catch(showError); });
  const clearInput = () => { if (state.keys.size) { state.keys.clear(); sendInput().catch(showError); } };
  listen(window, "blur", clearInput); listen(document, "visibilitychange", () => { if (document.hidden) clearInput(); });
  listen($("#command-input"), "keydown", e => {
    if (e.key !== "Enter") return; e.preventDefault(); const key = e.target.value.trim().toLowerCase();
    const map = { "create cube": () => create("box"), "create sphere": () => create("sphere"), save, play: () => play("play"), stop: () => play("stop"), "export glb": () => exportFormat("glb"), "export fbx": () => exportFormat("fbx"), "export usdz": () => exportFormat("usdz") };
    if (!map[key]) return showError(new Error("Unknown command.")); $("#command-palette").close(); e.target.value = ""; Promise.resolve(map[key]()).catch(showError);
  });
  const resize = new ResizeObserver(() => provider.resize(Math.max(1, $("#viewport").clientWidth), Math.max(1, $("#viewport").clientHeight))); resize.observe($("#viewport").parentElement);
  const timer = setInterval(async () => {
    if (disposed || state.busy || previewPending || framePending || !playing() || document.hidden) return;
    framePending = true;
    try { const frame = await host.execute("play-frame"); provider.updateTransforms(frame.nodes); state.data.workbench.play = frame.status; renderStatus(); }
    catch (error) { showError(error); } finally { framePending = false; }
  }, 50);
  async function dispose() {
    if (disposed) return; disposed = true; clearInterval(timer); resize.disconnect(); listeners.forEach(off => off());
    if (currentUrl) URL.revokeObjectURL(currentUrl); provider.dispose(); await host.dispose();
  }
  listen(window, "beforeunload", () => { dispose().catch(() => {}); });
  try { await refresh({ preserveCamera: false }); state.message = "Ready"; renderStatus(); }
  catch (error) { await dispose(); throw error; }
  const app = { state, provider, host, commands, refresh, dispose, rpc: (m, p) => host.execute(m, p), importFiles };
  if (debug) window.nexusWorkbench = app;
  return app;
}
