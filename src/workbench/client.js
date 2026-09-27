import { createAuthoringThreePreview } from "../authoring/preview/three-provider.js";

const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "onclick") el.addEventListener("click", v);
    else if (k === "disabled") el.disabled = Boolean(v);
    else el.setAttribute(k, v);
  }
  for (const child of children.flat()) el.append(child?.nodeType ? child : document.createTextNode(String(child ?? "")));
  return el;
};
const button = (label, onclick, attrs = {}) => h("button", { class: "btn", onclick, ...attrs }, label);
const pill = (text, kind = "") => h("span", { class: `pill ${kind}` }, text);
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const uuid = () => crypto.randomUUID();
const state = { data: null, selected: null, tab: "assets", busy: false, error: null, message: "Opening…", mode: "Object", gameView: false };

async function rpc(method, params = {}) {
  const response = await fetch("/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: uuid(), method, params }) });
  const value = await response.json();
  if (!value.ok) throw Object.assign(new Error(value.error?.message ?? "Editor request failed."), value.error ?? {});
  return value.result;
}
const provider = createAuthoringThreePreview({ canvas: $("#viewport"), onSelect: id => { state.selected = id; render(); } });

async function refresh({ preview = true } = {}) {
  state.data = await (await fetch("/state", { cache: "no-store" })).json();
  if (preview) {
    try { await provider.load(`/preview.glb?v=${state.data.status.context.clock}`, { ...state.data.view, width: innerWidth, height: innerHeight }); }
    catch (error) { if (!/no Mesh prim|no mesh|contains no/i.test(error.message)) throw error; }
  }
  render(); return state.data;
}
async function run(label, fn, { preview = true } = {}) {
  if (state.busy) return;
  state.busy = true; state.error = null; state.message = label; renderStatus();
  try { const result = await fn(); state.message = `${label} ✓`; await refresh({ preview }); return result; }
  catch (error) { state.error = error.message; state.message = `${label} failed`; render(); throw error; }
  finally { state.busy = false; renderStatus(); }
}
async function ensureAssembly(node) {
  const assembly = state.data.assembly;
  const content = assembly?.content ?? { nodes: [], cameras: [], lights: [] };
  const nodes = [...content.nodes.filter(n => n.id !== node.id), node];
  return rpc("execute", { requestId: uuid(), epoch: state.data.status.context.epoch, operations: [{ id: "assembly.set", args: { id: state.data.assemblyId, ...(assembly ? { expectedRevision: assembly.revision } : {}), content: { ...content, nodes } } }] });
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
async function save() { return run("Save", () => rpc("save"), { preview: false }); }
async function validate() { return run("Validate", () => rpc("validate-project"), { preview: false }); }
async function play(action = "play") { return run(action, () => rpc(action, action === "play" ? { autoTick: true } : {}), { preview: false }); }
async function exportFormat(format) { return run(`Export ${format.toUpperCase()}`, () => rpc("export", { format }), { preview: false }); }
async function switchProject(method) {
  const directory = prompt(`${method === "new-project" ? "New" : "Open"} project directory`); if (!directory) return;
  return run(method, () => rpc(method, { directory }), { preview: true });
}
async function importAsset() {
  const input = h("input", { type: "file", accept: ".glb,.fbx,.usd,.usda,.usdz,.obj" });
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase(), format = ext === "usda" ? "usdz" : ext;
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
    await run(`Inspect ${file.name}`, async () => {
      const inspection = await rpc("workbench-import-inspect", { format, prefix: file.name.replace(/\.[^.]+$/, ""), base64: btoa(binary) });
      if (inspection.errors) throw new Error(`Import has ${inspection.errors} error(s).`);
      const warnings = inspection.warnings ? `\n${inspection.warnings} warning(s).` : "";
      if (!confirm(`Import ${file.name}?${warnings}`)) return;
      await rpc("workbench-import-commit", { plan: inspection.plan });
    });
  };
  input.click();
}

function renderMenus() {
  const el = clear($("#menus"));
  el.append(h("div", { class: "brand" }, h("strong", {}, "NEXUSENGINE"), h("span", {}, "EDITOR")));
  const menu = (name, actions) => button(name, () => { const action = prompt(`${name}\n${actions.join("\n")}`); const i = Number(action) - 1; if (actions[i]) dispatchMenu(actions[i]); });
  el.append(menu("File", ["New", "Open", "Save", "Import", "Export GLB", "Export FBX", "Export USDZ"]), menu("Project", ["Validate", "Composition"]), menu("Domains", ["Browse Domains"]), menu("Kits", ["Browse Kits"]), menu("Build", ["Build Targets"]), menu("Window", ["Assets", "Console"]), menu("Help", ["About"]));
}
function dispatchMenu(action) {
  ({ New: () => switchProject("new-project"), Open: () => switchProject("open-project"), Save: save, Import: importAsset, "Export GLB": () => exportFormat("glb"), "Export FBX": () => exportFormat("fbx"), "Export USDZ": () => exportFormat("usdz"), Validate: validate, Composition: () => setTab("composition"), "Browse Domains": () => setTab("domains"), "Browse Kits": () => setTab("kits"), "Build Targets": () => setTab("build"), Assets: () => setTab("assets"), Console: () => setTab("console"), About: () => alert("NexusEngine Editor — Core-native workbench") })[action]?.();
}
function renderToolbar() {
  const el = clear($("#toolbar")), p = state.data?.workbench?.play?.state ?? "stopped";
  el.append(button("▶ Play", () => play("play"), { class: "btn primary", disabled: p !== "stopped" }), button("⏸ Pause", () => play(p === "paused" ? "resume" : "pause"), { disabled: p === "stopped" }), button("■ Stop", () => play("stop"), { disabled: p === "stopped" }), h("div", { class: "divider" }), button("Validate", validate), button("Save", save), button("Build", () => setTab("build")), button("Export", () => exportFormat("glb")), h("div", { class: "divider" }), button("+ Cube", () => createPrimitive("box")), button("+ Sphere", () => createPrimitive("sphere")), button("+ Plane", () => createPrimitive("plane")), button("+ Torus", () => createPrimitive("torus")), h("span", { class: "spacer" }));
  for (const mode of ["Object", "Edit", "Sculpt", "Paint", "Rig", "Animation"]) el.append(button(mode, () => { state.mode = mode; renderToolbar(); renderInspector(); }, { class: mode === state.mode ? "btn primary" : "btn" }));
}
function renderOutliner() {
  const el = clear($("#outliner-list")), nodes = state.data?.assembly?.content?.nodes ?? [];
  if (!nodes.length) el.append(h("div", { class: "empty" }, "No scene objects."));
  for (const node of nodes) el.append(h("button", { class: `tree-row ${state.selected === node.id ? "selected" : ""}`, onclick: () => { state.selected = node.id; renderOutliner(); renderInspector(); } }, node.meshId ? "◈" : "◇", " ", node.name ?? node.id));
}
function renderInspector() {
  const el = clear($("#inspector-body")), node = state.data?.assembly?.content?.nodes?.find(n => n.id === state.selected);
  el.append(h("div", { class: "small" }, `Mode: ${state.mode}`));
  if (!node) { el.append(h("div", { class: "empty" }, "Select an object."), button("Add Domain Capability", () => setTab("kits"))); return; }
  el.append(h("h3", {}, node.name ?? node.id), h("div", { class: "muted" }, node.meshId ?? "Group"));
  const t = node.transform ?? { translation: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] };
  el.append(h("div", { class: "section-title" }, "TRANSFORM"));
  const xyz = h("div", { class: "xyz" });
  t.translation.forEach((v,i) => { const input = h("input", { type:"number", step:"0.1", value:String(v) }); input.onchange = () => updateNode(node, { ...node, transform: { ...t, translation: t.translation.map((x,j)=>j===i?Number(input.value):x) } }); xyz.append(h("label", {}, ["X","Y","Z"][i], input)); });
  el.append(xyz, h("div", { class: "section-title" }, "MATERIALS"), h("div", {}, (node.materials ?? []).join(", ") || "None"), h("div", { class: "section-title" }, "RUNTIME DOMAINS"), button("+ Add Domain Capability", () => setTab("kits")), h("div", { class: "section-title" }, "ACTIONS"), button("Duplicate", () => duplicateNode(node)), button("Delete", () => deleteNode(node)));
}
async function updateNode(old, next) {
  const assembly = state.data.assembly, content = assembly.content, nodes = content.nodes.map(n => n.id === old.id ? next : n);
  await run("Update object", () => rpc("execute", { requestId: uuid(), epoch: state.data.status.context.epoch, operations: [{ id:"assembly.set", args:{ id:state.data.assemblyId, expectedRevision:assembly.revision, content:{...content,nodes} } }] }));
}
async function duplicateNode(node) { const id=`${node.id}-copy-${Date.now().toString(36)}`; return ensureAssembly({...structuredClone(node),id,name:`${node.name??node.id} Copy`}); }
async function deleteNode(node) { const a=state.data.assembly,c={...a.content,nodes:a.content.nodes.filter(n=>n.id!==node.id)}; state.selected=null; return run("Delete object",()=>rpc("execute",{requestId:uuid(),epoch:state.data.status.context.epoch,operations:[{id:"assembly.set",args:{id:state.data.assemblyId,expectedRevision:a.revision,content:c}}]})); }
function setTab(tab) { state.tab = tab; renderBottom(); }
function renderBottom() {
  $("#bottom-tabs").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
  const el = clear($("#bottom-content")), wb = state.data?.workbench;
  if (!wb) return;
  if (state.tab === "assets") for (const d of state.data.documents) el.append(h("div", { class:"asset-row" }, `${d.kind} · ${d.id}`));
  else if (state.tab === "domains") for (const d of wb.catalog.domains) el.append(catalogRow(d.domainPath,d.responsibility,[pill(d.installed?"installed":"available",d.installed?"ok":""),pill(d.status)]));
  else if (state.tab === "kits") for (const k of wb.catalog.kits) { const action=k.selected?button("Remove",()=>run(`Remove ${k.id}`,()=>rpc("composition-remove-kit",{kitId:k.id}),{preview:false})):button("Add",()=>run(`Add ${k.id}`,()=>rpc("composition-add-kit",{kitId:k.id}),{preview:false})); el.append(catalogRow(k.id,`${k.domainPath} · ${k.responsibility}`,[pill(k.installed?"runtime":"catalog",k.installed?"ok":""),pill(k.status),action])); }
  else if (state.tab === "validation") el.append(validationCard("Project",state.data.validation),validationCard("Composition",wb.compositionValidation));
  else if (state.tab === "composition") { const nodes=wb.composition?.content?.nodes??[]; for(const n of nodes) el.append(catalogRow(n.registryId,`${n.kind} · parent ${n.parentNodeId??"root"}`,[pill(n.enabled===false?"disabled":"enabled",n.enabled===false?"warn":"ok")])); }
  else if (state.tab === "runtime") { const p=wb.play; el.append(catalogRow("PLAY MODE","Runtime is cloned from Authoring; source stays protected.",[pill(p.state,p.state==="playing"?"ok":"" )])); for(const [k,v] of Object.entries({ticks:p.ticks??0,frame:p.frame??0,elapsed:p.elapsed??0,installedKits:(p.installedKits??[]).length})) el.append(h("div",{class:"kv"},h("span",{},k),h("span",{},String(v)))); }
  else if (state.tab === "build") renderBuild(el,wb);
  else for (const r of [...(wb.receipts??[])].reverse()) el.append(h("div",{class:"console-row"},h("span",{class:"muted"},r.at?.slice(11,19)??""),h("strong",{},r.action),h("span",{},r.kind)));
}
function catalogRow(title,desc,actions=[]) { return h("div",{class:"catalog-row"},h("div",{class:"catalog-main"},h("strong",{},title),h("span",{class:"muted"},desc)),h("div",{class:"catalog-meta"},...actions)); }
function validationCard(title,value) { return h("div",{class:"validation-card"},h("h3",{},title),pill(value?.errors?`${value.errors} errors`:value?.ok===false?"invalid":"valid",value?.errors||value?.ok===false?"bad":"ok"),h("pre",{},JSON.stringify(value,null,2))); }
function renderBuild(el,wb) { el.append(h("div",{class:"build-header"},h("h3",{},"BUILD TARGETS"),button("Refresh",()=>run("Build targets",()=>rpc("build-targets"),{preview:false})))); if(!wb.buildTargets?.length) el.append(h("div",{class:"empty"},"Build providers load on demand. Click Refresh.")); for(const t of wb.buildTargets??[]) el.append(catalogRow(t.id??t.name,t.status??"available",[button("Plan",()=>planBuild(t.id??t.name))])); }
async function planBuild(target) { const project=prompt("Build project source directory",state.data.status.projectRoot??""); if(!project)return; return run(`Plan ${target}`,()=>rpc("build-plan",{request:{project,targets:[target],profile:"production"}}),{preview:false}); }
function renderStatus() { const el=clear($("#statusbar")); if(!state.data)return; const s=state.data.status,wb=state.data.workbench; el.append(h("span",{},state.message),state.error?pill(state.error,"bad"):pill(s.dirty?"Unsaved":"Saved",s.dirty?"warn":"ok"),pill(`${wb.catalogSummary.domains} domains`),pill(`${wb.catalogSummary.kits} kits`),pill(`Play: ${wb.play.state}`),h("span",{class:"spacer"}),h("span",{class:"muted"},s.runtime?.version??"")); }
function render() { if(!state.data)return; renderMenus();renderToolbar();renderOutliner();renderInspector();renderBottom();renderStatus();window.nexusWorkbench={state,provider,refresh,rpc}; }

for(const tab of $("#bottom-tabs").querySelectorAll("button")) tab.addEventListener("click",()=>setTab(tab.dataset.tab));
window.addEventListener("keydown",e=>{const command=e.ctrlKey||e.metaKey;if(command&&e.key.toLowerCase()==="s"){e.preventDefault();save();}if(command&&e.key.toLowerCase()==="p"){e.preventDefault();$("#command-palette").classList.toggle("open");$("#command-input").focus();}});
$("#command-input")?.addEventListener("keydown",e=>{if(e.key!=="Enter")return;const v=e.currentTarget.value.trim().toLowerCase(),commands={"create cube":()=>createPrimitive("box"),"create sphere":()=>createPrimitive("sphere"),validate,play:()=>play("play"),stop:()=>play("stop"),"export glb":()=>exportFormat("glb"),"export fbx":()=>exportFormat("fbx"),"export usdz":()=>exportFormat("usdz")};commands[v]?.();$("#command-palette").classList.remove("open");e.currentTarget.value="";});
window.addEventListener("resize",()=>provider.resize(innerWidth,innerHeight));window.addEventListener("beforeunload",()=>provider.dispose());
try { await rpc("composition-ensure"); await refresh(); state.message="Ready"; render(); } catch(error) { state.error=error.message; state.message="Editor failed to open"; console.error(error); renderStatus(); }
