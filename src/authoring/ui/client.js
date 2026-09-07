import { createAuthoringThreePreview } from "../preview/three-provider.js";
const viewport = document.querySelector("#viewport"),
  canvas = document.querySelector("#interface"),
  ctx = canvas.getContext("2d");
let state = null,
  selected = null,
  busy = false,
  message = "Opening project…",
  failure = false,
  layout = [],
  focus = 0,
  playing = false,
  modal = null,
  providerReady = false;
const provider = createAuthoringThreePreview({
  canvas: viewport,
  onSelect: (id) => perform(() => select(id)),
  onTransform: (transform) => perform(() => changeTransform(transform)),
});
const uuid = () => crypto.randomUUID();
async function rpc(method, params = {}) {
  const result = await (
    await fetch("/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: uuid(), method, params }),
    })
  ).json();
  if (!result.ok)
    throw Object.assign(new Error(result.error.message), result.error);
  return result.result;
}
const request = (operations) =>
  rpc("execute", {
    requestId: uuid(),
    epoch: state.status.context.epoch,
    operations,
  });
function revision(id) {
  return state.documents.find((d) => d.id === id)?.revision;
}
function selectionOperation(id) {
  return {
    id: "editing.object-select",
    args: {
      id: "editor-object-selection",
      ...(revision("editor-object-selection")
        ? { expectedRevision: revision("editor-object-selection") }
        : {}),
      assemblyId: state.assemblyId,
      ids: id ? [id] : [],
    },
  };
}
function workspaceOperation() {
  const existing = state.workspace,
    content = existing?.content ?? {
      open: [],
      active: null,
      mode: "object",
      views: [],
      tool: null,
    };
  const open = [
    ...content.open.filter((r) => r.id !== "editor-object-selection"),
    { id: "editor-object-selection", kind: "object-selection" },
  ];
  return {
    id: "workspace.set",
    args: {
      id: "workspace",
      ...(existing ? { expectedRevision: existing.revision } : {}),
      content: {
        ...content,
        open,
        active: "editor-object-selection",
        mode: "object",
      },
    },
  };
}
async function refresh({ preserveCamera = true } = {}) {
  state = await (await fetch("/state")).json();
  selected = state.selection?.content.ids[0] ?? null;
  const hasMesh = state.assembly?.content.nodes.some(
    (n) => n.meshId && n.visible,
  );
  if (hasMesh) {
    const size = dimensions();
    await provider.load(
      `/preview.glb?clock=${state.status.context.clock}`,
      { ...state.view, width: size.width, height: size.height },
      { preserveCamera: providerReady && preserveCamera },
    );
    providerReady = true;
    provider.select(selected);
    if (playing) provider.play();
  } else {
    provider.clear();
    providerReady = false;
  }
  draw();
}
async function perform(action, { reload = true } = {}) {
  if (busy) return;
  busy = true;
  failure = false;
  draw();
  try {
    const result = await action();
    message = result?.message ?? "Ready";
    if (reload) await refresh();
  } catch (error) {
    message = `${error.code ?? "Error"}: ${error.message}`;
    failure = true;
    try {
      await refresh();
    } catch {}
  } finally {
    busy = false;
    draw();
  }
}
async function select(id) {
  await request([selectionOperation(id), workspaceOperation()]);
  selected = id;
  provider.select(id);
  return { message: `Selected ${id}` };
}
async function addPrimitive(type) {
  const id = `${type}-${uuid().slice(0, 8)}`,
    nodeId = `object-${id}`,
    operations = [
      {
        id: "mesh.primitive",
        args: { id, parameters: { type, segments: 32, rings: 16 } },
      },
    ];
  const node = {
    id: nodeId,
    name: type[0].toUpperCase() + type.slice(1),
    meshId: id,
    materials: state.documents
      .filter((d) => d.kind === "material")
      .slice(0, 1)
      .map((d) => d.id),
  };
  if (state.assembly)
    operations.push({
      id: "assembly.node",
      args: {
        id: state.assemblyId,
        expectedRevision: state.assembly.revision,
        node,
      },
    });
  else
    operations.push({
      id: "assembly.set",
      args: { id: state.assemblyId, content: { nodes: [node] } },
    });
  operations.push(selectionOperation(nodeId), workspaceOperation());
  await request(operations);
  return { message: `Created ${type}` };
}
async function changeTransform(transform) {
  const node = state.assembly?.content.nodes.find((n) => n.id === transform.id);
  if (!node) throw Error("Selected object is unavailable.");
  await request([
    {
      id: "assembly.node",
      args: {
        id: state.assemblyId,
        expectedRevision: state.assembly.revision,
        node: {
          ...node,
          transform: {
            translation: transform.translation,
            rotation: transform.rotation,
            scale: transform.scale,
          },
        },
      },
    },
  ]);
  return { message: "Transform applied" };
}
async function dispatch(id) {
  if (["open-project", "new-project"].includes(id)) {
    modal = {
      kind: id,
      text: JSON.stringify({ directory: "/path/to/project" }, null, 2),
      cursor: 0,
    };
    modal.cursor = modal.text.length;
    return {
      message:
        "Enter a project directory; the current project is saved before switching.",
    };
  }
  if (["cube", "torus", "sphere"].includes(id))
    return addPrimitive(id === "cube" ? "box" : id);
  if (id === "save") {
    const result = await rpc("save");
    return { message: `Saved checkpoint ${result.generation}` };
  }
  if (id === "undo" || id === "redo") {
    await rpc(id, { requestId: uuid(), epoch: state.status.context.epoch });
    return { message: id === "undo" ? "Undone" : "Redone" };
  }
  if (id === "export") {
    const result = await rpc("export");
    return {
      message: `Exported ${result.byteLength.toLocaleString()} bytes · ${result.validation.errors} validation errors`,
    };
  }
  if (["translate", "rotate", "scale"].includes(id)) {
    provider.setMode(id);
    return { message: `${id} tool` };
  }
  if (id === "frame") {
    provider.frame();
    return { message: "View framed" };
  }
  if (id === "play") {
    if (playing) {
      provider.stop();
      playing = false;
    } else {
      provider.play();
      playing = true;
    }
    return {
      message: playing ? "Playing authored animation" : "Playback paused",
    };
  }
  if (id === "command") {
    modal = {
      text: JSON.stringify(
        [
          {
            id: "mesh.transform",
            args: {
              id:
                state.assembly?.content.nodes.find((n) => n.id === selected)
                  ?.meshId ?? "mesh",
              expectedRevision: revision(
                state.assembly?.content.nodes.find((n) => n.id === selected)
                  ?.meshId,
              ),
              translation: [0, 0.25, 0],
            },
          },
        ],
        null,
        2,
      ),
      cursor: 0,
    };
    modal.cursor = modal.text.length;
    return {
      message: "Edit operation JSON; Ctrl+Enter runs it, Escape cancels",
    };
  }
  const node = state.assembly?.content.nodes.find((n) => n.id === selected);
  if (!node?.meshId) throw Error("Select a mesh object first.");
  if (id === "face-up") {
    await request([
      {
        id: "editing.select",
        args: {
          id: "editor-face-selection",
          ...(revision("editor-face-selection")
            ? { expectedRevision: revision("editor-face-selection") }
            : {}),
          meshId: node.meshId,
          mode: "face",
          ids: ["f4"],
        },
      },
      {
        id: "mesh.transform",
        args: {
          id: node.meshId,
          expectedRevision: revision(node.meshId),
          selection: { mode: "face", ids: ["f4"] },
          translation: [0, 0.25, 0],
        },
      },
    ]);
    return { message: "Moved face f4 by +0.25 on Y (box profile)" };
  }
  if (id === "material") {
    let materials = state.documents.filter((d) => d.kind === "material");
    if (!materials.length) {
      await request([
        {
          id: "material.set",
          args: {
            id: "editor-material",
            content: { baseColor: [0.18, 0.5, 0.8, 1], roughness: 0.35 },
          },
        },
      ]);
      await refresh();
      materials = state.documents.filter((d) => d.kind === "material");
    }
    const index = materials.findIndex((m) => m.id === node.materials[0]),
      material = materials[(index + 1) % materials.length];
    await request([
      {
        id: "assembly.node",
        args: {
          id: state.assemblyId,
          expectedRevision: state.assembly.revision,
          node: { ...node, materials: [material.id] },
        },
      },
    ]);
    return { message: `Assigned ${material.id}` };
  }
  throw Error("Action unavailable.");
}
function dimensions() {
  const left = 220,
    right = 260,
    top = 62,
    bottom = 36;
  viewport.style.left = `${left}px`;
  viewport.style.top = `${top}px`;
  viewport.style.width = `${Math.max(160, innerWidth - left - right)}px`;
  viewport.style.height = `${Math.max(160, innerHeight - top - bottom)}px`;
  viewport.style.right = "auto";
  viewport.style.bottom = "auto";
  return {
    width: Math.max(160, innerWidth - left - right),
    height: Math.max(160, innerHeight - top - bottom),
    left,
    right,
    top,
    bottom,
  };
}
function label(text, x, y, color = "#c7cfdd", size = 12) {
  ctx.fillStyle = color;
  ctx.font = `${size}px system-ui,sans-serif`;
  ctx.fillText(String(text), x, y);
}
function button(id, text, x, y, w = 82, h = 30) {
  const disabled = busy;
  ctx.fillStyle = disabled ? "#232b38" : "#303b50";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  label(text, x + 10, y + 20, disabled ? "#6d7789" : "#e4eaf4", 12);
  const item = { id, x, y, w, h };
  layout.push(item);
  if (layout.length - 1 === focus) {
    ctx.strokeStyle = "#769dff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  return item;
}
function wrap(text, x, y, width, lineHeight = 17, maxLines = 8) {
  const words = String(text).split(" ");
  let line = "",
    row = 0;
  for (const word of words) {
    const next = `${line}${line ? " " : ""}${word}`;
    if (ctx.measureText(next).width > width && line) {
      label(line, x, y + row * lineHeight, failure ? "#ffada2" : "#b8c3d6");
      if (++row >= maxLines) return;
      line = word;
    } else line = next;
  }
  label(line, x, y + row * lineHeight, failure ? "#ffada2" : "#b8c3d6");
}
function draw() {
  const size = dimensions(),
    ratio = devicePixelRatio;
  canvas.width = Math.floor(innerWidth * ratio);
  canvas.height = Math.floor(innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  layout = [];
  ctx.fillStyle = "#151b25";
  ctx.fillRect(0, 0, innerWidth, size.top);
  ctx.fillRect(0, size.top, size.left, innerHeight - size.top);
  ctx.fillRect(
    innerWidth - size.right,
    size.top,
    size.right,
    innerHeight - size.top,
  );
  ctx.fillRect(0, innerHeight - size.bottom, innerWidth, size.bottom);
  label(state?.panel.title ?? "NEXUS / AUTHORING", 16, 22, "#f0f4ff", 14);
  label(
    busy
      ? "Working…"
      : state?.status.dirty
        ? "Unsaved checkpoint · journal protected"
        : "Saved",
    16,
    43,
    busy ? "#f4c779" : "#8ea3c2",
    11,
  );
  let x = 232;
  for (const action of state?.panel.toolbar ?? []) {
    const w = action.id === "export" ? 94 : action.id === "command" ? 90 : 76;
    button(action.id, action.label, x, 17, w);
    x += w + 6;
  }
  label("OBJECTS", 16, 90, "#7d92b0", 11);
  let y = 114;
  for (const node of (state?.assembly?.content.nodes ?? []).slice(0, 20)) {
    if (node.id === selected) {
      ctx.fillStyle = "#294467";
      ctx.fillRect(8, y - 16, 204, 26);
    }
    label(`${node.meshId ? "◈" : "◇"}  ${node.name}`, 16, y, "#d9e3f1", 12);
    layout.push({ id: `select:${node.id}`, x: 8, y: y - 18, w: 204, h: 27 });
    y += 29;
  }
  label("DOCUMENTS", 16, Math.max(y + 24, 310), "#7d92b0", 11);
  let dy = Math.max(y + 45, 332);
  for (const doc of (state?.documents ?? []).slice(0, 12)) {
    label(`${doc.kind}  ·  ${doc.id.slice(0, 17)}`, 16, dy, "#8799b4", 10);
    dy += 19;
  }
  for (const [action, index] of (state?.panel.projectActions ?? []).map(
    (a, i) => [a, i],
  ))
    button(action.id, action.label, 10 + index * 104, innerHeight - 79, 98);
  const rx = innerWidth - size.right + 18;
  label("INSPECTOR", rx, 90, "#7d92b0", 11);
  const node = state?.assembly?.content.nodes.find((n) => n.id === selected);
  label(node?.name ?? "Select an object", rx, 119, "#eef4ff", 16);
  label(node?.meshId ?? "Create a primitive to begin", rx, 140, "#93a6c3", 11);
  y = 162;
  for (const action of state?.panel.inspector ?? []) {
    button(action.id, action.label, rx, y, size.right - 36);
    y += 39;
  }
  if (node) {
    label("Local position", rx, y + 12, "#859ab9", 11);
    label(
      node.transform.translation.map((n) => n.toFixed(3)).join("   "),
      rx,
      y + 34,
      "#d9e4f5",
    );
  }
  wrap(
    message,
    rx,
    Math.min(y + 70, innerHeight - 120),
    size.right - 38,
    17,
    5,
  );
  label(state?.panel.footer ?? "", 16, innerHeight - 13, "#8ea2bf", 11);
  if (!providerReady) {
    ctx.fillStyle = "#101620";
    ctx.fillRect(size.left, size.top, size.width, size.height);
    label(
      "Create an object to start authoring",
      size.left + 32,
      size.top + 60,
      "#b4c7e3",
      20,
    );
  }
  if (modal) {
    ctx.fillStyle = "#090e16ef";
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    const mx = 80,
      my = 60,
      mw = innerWidth - 160;
    ctx.fillStyle = "#1a2434";
    ctx.fillRect(mx, my, mw, innerHeight - 120);
    label("DOMAIN OPERATIONS · JSON", mx + 20, my + 30, "#b5ceff", 15);
    ctx.font = "13px monospace";
    const lines = modal.text.split("\n");
    ctx.fillStyle = "#d6e1f4";
    lines
      .slice(0, Math.floor((innerHeight - 240) / 19))
      .forEach((line, i) =>
        ctx.fillText(
          line.slice(0, Math.floor((mw - 40) / 8)),
          mx + 20,
          my + 64 + i * 19,
        ),
      );
    button("apply-command", "Run operations", mx + 20, innerHeight - 112, 135);
    button("cancel-command", "Cancel", mx + 169, innerHeight - 112, 85);
    label(
      "Type to edit · Ctrl+Enter runs · Escape cancels",
      mx + 275,
      innerHeight - 92,
      "#95aac9",
      11,
    );
  }
  window.nexusAuthoringClient = {
    ready: Boolean(state),
    busy,
    state,
    layout,
    selected,
    provider,
    error: failure ? message : null,
    refresh,
    run: (operations) => perform(() => request(operations)),
  };
}
async function activate(id) {
  if (id === "cancel-command") {
    modal = null;
    draw();
    return;
  }
  if (id === "apply-command") {
    const { text, kind } = modal;
    modal = null;
    return perform(async () => {
      if (kind) {
        await rpc(kind, JSON.parse(text));
        providerReady = false;
        playing = false;
        return { message: "Project opened" };
      }
      await request(JSON.parse(text));
      return { message: "Operations committed" };
    });
  }
  if (id.startsWith("select:")) return perform(() => select(id.slice(7)));
  return perform(() => dispatch(id), {
    reload: ![
      "translate",
      "rotate",
      "scale",
      "frame",
      "play",
      "command",
      "open-project",
      "new-project",
    ].includes(id),
  });
}
window.addEventListener(
  "pointerdown",
  (event) => {
    const item = [...layout]
      .reverse()
      .find(
        (b) =>
          event.clientX >= b.x &&
          event.clientX <= b.x + b.w &&
          event.clientY >= b.y &&
          event.clientY <= b.y + b.h,
      );
    if (item) {
      event.preventDefault();
      event.stopImmediatePropagation();
      focus = layout.indexOf(item);
      activate(item.id);
    }
  },
  true,
);
window.addEventListener("keydown", (event) => {
  if (modal) {
    event.preventDefault();
    if (event.key === "Escape") {
      modal = null;
      draw();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      activate("apply-command");
      return;
    }
    if (
      modal.allSelected &&
      (event.key === "Backspace" ||
        event.key === "Delete" ||
        (Array.from(event.key).length === 1 &&
          !event.ctrlKey &&
          !event.metaKey))
    ) {
      modal.text = "";
      modal.cursor = 0;
      modal.allSelected = false;
    }
    if (event.key === "Backspace" && modal.cursor > 0) {
      modal.text =
        modal.text.slice(0, modal.cursor - 1) + modal.text.slice(modal.cursor);
      modal.cursor--;
    } else if (event.key === "Delete")
      modal.text =
        modal.text.slice(0, modal.cursor) + modal.text.slice(modal.cursor + 1);
    else if (event.key === "ArrowLeft")
      modal.cursor = Math.max(0, modal.cursor - 1);
    else if (event.key === "ArrowRight")
      modal.cursor = Math.min(modal.text.length, modal.cursor + 1);
    else if (event.key === "Enter") {
      modal.text =
        modal.text.slice(0, modal.cursor) +
        "\n" +
        modal.text.slice(modal.cursor);
      modal.cursor++;
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "a"
    ) {
      modal.allSelected = true;
      modal.cursor = modal.text.length;
    } else if (
      Array.from(event.key).length === 1 &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      modal.text =
        modal.text.slice(0, modal.cursor) +
        event.key +
        modal.text.slice(modal.cursor);
      modal.cursor += event.key.length;
    }
    draw();
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    focus = (focus + (event.shiftKey ? -1 : 1) + layout.length) % layout.length;
    draw();
    return;
  }
  if (event.key === "Enter" && layout[focus]) {
    event.preventDefault();
    activate(layout[focus].id);
    return;
  }
  const command = event.ctrlKey || event.metaKey;
  if (command && ["s", "z", "y"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    activate(
      event.key.toLowerCase() === "s"
        ? "save"
        : event.key.toLowerCase() === "y" || event.shiftKey
          ? "redo"
          : "undo",
    );
  } else if (["g", "r", "s"].includes(event.key.toLowerCase()))
    activate(
      { g: "translate", r: "rotate", s: "scale" }[event.key.toLowerCase()],
    );
});
window.addEventListener("paste", (event) => {
  if (modal) {
    event.preventDefault();
    const text = event.clipboardData.getData("text");
    if (modal.allSelected) {
      modal.text = "";
      modal.cursor = 0;
      modal.allSelected = false;
    }
    modal.text =
      modal.text.slice(0, modal.cursor) + text + modal.text.slice(modal.cursor);
    modal.cursor += text.length;
    draw();
  }
});
window.addEventListener("resize", () => {
  draw();
  const size = dimensions();
  provider.resize(size.width, size.height);
});
window.addEventListener("beforeunload", () => provider.dispose());
try {
  await refresh({ preserveCamera: false });
  message = "Ready";
  draw();
} catch (error) {
  message = error.message;
  failure = true;
  draw();
}
