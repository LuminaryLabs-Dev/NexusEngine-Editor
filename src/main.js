import { createEditorState, recordEditorEvent } from "./kits/editor-kits.js";
import { DEFAULT_DSK_GAME, buildDskGameHtml, createDskGameFileName } from "./dsk-html-builder.js";

const state = createEditorState();
state.project = structuredClone(DEFAULT_DSK_GAME);
const root = document.querySelector("#app");

function setDock(name, next) {
  state.docks[name] = next;
  render();
}

function toggleDock(name) {
  const current = state.docks[name];
  setDock(name, current === "open" ? "hidden" : "open");
}

function setMode(mode) {
  state.mode = mode;
  recordEditorEvent(state, `editor.${mode}`, { domainPath: "n:editor:status", mode });
  render();
}

function buildHtml() {
  const html = buildDskGameHtml(state.project);
  state.build = {
    status: "ready",
    html,
    fileName: createDskGameFileName(state.project),
    bytes: new TextEncoder().encode(html).length
  };
  recordEditorEvent(state, "editor.build.html.ready", {
    domainPath: "n:editor:status",
    fileName: state.build.fileName,
    bytes: state.build.bytes
  });
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
    domainPath: "n:editor:status",
    fileName: state.build.fileName
  });
}

function select(domainPath) {
  state.selectedDomainPath = domainPath;
  state.docks.inspector = "open";
  recordEditorEvent(state, "editor.selection.changed", { domainPath });
  render();
}

function renderKitList() {
  return state.kitRegistry.list().map((kit) => `<button class="kit-card" data-select="${kit.domainPath}"><strong>${kit.label}</strong><span>${kit.domainPath}</span></button>`).join("");
}

function renderProofEvents() {
  const events = state.events.slice(-12).reverse();
  if (events.length === 0) return `<p class="muted">No events yet.</p>`;
  return events.map((event) => `<div class="event"><strong>${event.type}</strong><span>${event.domainPath}</span></div>`).join("");
}

function renderProjectEntities() {
  return state.project.scene.entities.map((entity) => `<button class="entity-chip" data-entity="${entity.id}" style="--chip:${entity.color}">${entity.label}</button>`).join("");
}

function render() {
  const selected = state.kitRegistry.get(state.selectedDomainPath) ?? { label: "Game Viewport", domainPath: state.selectedDomainPath, role: "selected" };
  root.innerHTML = `
    <header class="header" data-domain-path="n:editor:header">
      <strong>NexusEngine Editor</strong>
      <span class="project">${state.project.title}</span>
      <button id="play">Play</button>
      <button id="stop">Stop</button>
      <button id="save">Save</button>
      <button id="build">Build HTML</button>
      <button id="download" ${state.build.status === "ready" ? "" : "disabled"}>Download</button>
      <span class="status ${state.mode}">${state.mode}</span>
    </header>
    <main class="viewport" data-domain-path="n:editor:viewport">
      <button class="dock-tab left" id="toggle-kits">Kits</button>
      <button class="dock-tab right" id="toggle-inspector">Inspector</button>
      <button class="dock-tab bottom" id="toggle-proof">Proof</button>
      <section class="game-surface" id="game-surface">
        <h1>Full Game Viewport</h1>
        <p>${state.project.domainPath}</p>
        <div class="entity-row">${renderProjectEntities()}</div>
        <div class="build-output" data-build-status="${state.build.status}">
          <strong>${state.build.status === "ready" ? state.build.fileName : "No HTML build yet"}</strong>
          <span>${state.build.status === "ready" ? `${state.build.bytes} bytes` : "Build creates a single static game file."}</span>
        </div>
        <details class="advanced">
          <summary>Project manifest</summary>
          <pre>${JSON.stringify(state.project, null, 2)}</pre>
        </details>
        <button class="viewport-action" id="select-viewport">Select Viewport</button>
      </section>
      <aside class="dock dock-left ${state.docks.kits}" data-domain-path="n:editor:dock:kits">
        <h2>Kits</h2>
        ${renderKitList()}
      </aside>
      <aside class="dock dock-right ${state.docks.inspector}" data-domain-path="n:editor:dock:inspector">
        <h2>Inspector</h2>
        <dl><dt>Selected</dt><dd>${selected.label}</dd><dt>Domain Path</dt><dd>${selected.domainPath}</dd><dt>Role</dt><dd>${selected.role}</dd></dl>
      </aside>
      <aside class="dock dock-bottom ${state.docks.proof}" data-domain-path="n:editor:dock:proof">
        <h2>Proof</h2>
        ${renderProofEvents()}
      </aside>
    </main>
  `;
  root.querySelector("#play").addEventListener("click", () => setMode("playing"));
  root.querySelector("#stop").addEventListener("click", () => setMode("stopped"));
  root.querySelector("#save").addEventListener("click", () => recordEditorEvent(state, "editor.project.saved", { domainPath: "n:editor:status" }) && render());
  root.querySelector("#build").addEventListener("click", () => buildHtml());
  root.querySelector("#download").addEventListener("click", () => downloadHtml());
  root.querySelector("#toggle-kits").addEventListener("click", () => toggleDock("kits"));
  root.querySelector("#toggle-inspector").addEventListener("click", () => toggleDock("inspector"));
  root.querySelector("#toggle-proof").addEventListener("click", () => toggleDock("proof"));
  root.querySelector("#select-viewport").addEventListener("click", () => select("n:editor:viewport"));
  for (const button of root.querySelectorAll("[data-select]")) {
    button.addEventListener("click", () => select(button.dataset.select));
  }
  for (const button of root.querySelectorAll("[data-entity]")) {
    button.addEventListener("click", () => select(`n:editor:selection:${button.dataset.entity}`));
  }
}

render();
window.__NEXUS_EDITOR_STATE__ = state;
