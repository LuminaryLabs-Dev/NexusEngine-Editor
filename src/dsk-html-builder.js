const DOMAIN_PATH_PATTERN = /^n(?::[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

export const DEFAULT_DSK_GAME = Object.freeze({
  title: "Starter DSK Game",
  domainPath: "n:game:starter",
  version: "0.1.0",
  viewport: {
    width: 960,
    height: 540,
    background: "#111827"
  },
  kits: [
    { domainPath: "n:render:three", label: "Three Renderer" },
    { domainPath: "n:physics", label: "Physics" },
    { domainPath: "n:build:web", label: "Web Build" }
  ],
  scene: {
    title: "Starter Scene",
    entities: [
      { id: "player", label: "Player", x: 120, y: 280, width: 56, height: 56, color: "#34d399" },
      { id: "platform", label: "Platform", x: 80, y: 370, width: 760, height: 34, color: "#64748b" },
      { id: "goal", label: "Goal", x: 760, y: 280, width: 56, height: 88, color: "#fbbf24" }
    ]
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDomainPath(value, fallback = DEFAULT_DSK_GAME.domainPath) {
  const next = asText(value, fallback).toLowerCase();
  return DOMAIN_PATH_PATTERN.test(next) ? next : fallback;
}

function normalizeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function normalizeKit(kit) {
  if (typeof kit === "string") return { domainPath: normalizeDomainPath(kit), label: kit };
  return {
    domainPath: normalizeDomainPath(kit?.domainPath, "n:kit:unknown"),
    label: asText(kit?.label, kit?.domainPath ?? "Kit")
  };
}

function normalizeEntity(entity, index) {
  return {
    id: asText(entity?.id, `entity-${index + 1}`),
    label: asText(entity?.label, entity?.id ?? `Entity ${index + 1}`),
    x: asFiniteNumber(entity?.x, 80 + index * 72),
    y: asFiniteNumber(entity?.y, 180),
    width: Math.max(8, asFiniteNumber(entity?.width, 48)),
    height: Math.max(8, asFiniteNumber(entity?.height, 48)),
    color: normalizeColor(entity?.color, "#38bdf8")
  };
}

export function normalizeDskGameManifest(input = {}) {
  const source = { ...clone(DEFAULT_DSK_GAME), ...(input ?? {}) };
  const viewport = { ...DEFAULT_DSK_GAME.viewport, ...(input.viewport ?? {}) };
  const scene = { ...DEFAULT_DSK_GAME.scene, ...(input.scene ?? {}) };
  return {
    title: asText(source.title, DEFAULT_DSK_GAME.title),
    domainPath: normalizeDomainPath(source.domainPath),
    version: asText(source.version, DEFAULT_DSK_GAME.version),
    viewport: {
      width: Math.max(320, asFiniteNumber(viewport.width, DEFAULT_DSK_GAME.viewport.width)),
      height: Math.max(240, asFiniteNumber(viewport.height, DEFAULT_DSK_GAME.viewport.height)),
      background: normalizeColor(viewport.background, DEFAULT_DSK_GAME.viewport.background)
    },
    kits: (Array.isArray(source.kits) && source.kits.length ? source.kits : DEFAULT_DSK_GAME.kits).map(normalizeKit),
    scene: {
      title: asText(scene.title, DEFAULT_DSK_GAME.scene.title),
      entities: (Array.isArray(scene.entities) && scene.entities.length ? scene.entities : DEFAULT_DSK_GAME.scene.entities).map(normalizeEntity)
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function scriptSafeJson(value) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
}

export function createDskGameFileName(manifest) {
  return `${normalizeDskGameManifest(manifest).domainPath.replaceAll(":", "-")}.html`;
}

export function buildDskGameHtml(input = {}) {
  const manifest = normalizeDskGameManifest(input);
  const entities = manifest.scene.entities.map((entity) => `
      <button class="entity" data-id="${escapeHtml(entity.id)}" style="left:${entity.x}px;top:${entity.y}px;width:${entity.width}px;height:${entity.height}px;background:${entity.color};">
        <span>${escapeHtml(entity.label)}</span>
      </button>`).join("");
  const kits = manifest.kits.map((kit) => `<li><code>${escapeHtml(kit.domainPath)}</code><span>${escapeHtml(kit.label)}</span></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: Inter, system-ui, sans-serif; color: #f8fafc; background: #030712; }
    body { display: grid; grid-template-rows: auto 1fr; }
    header { min-height: 56px; display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.12); background: #0f172a; }
    header strong { font-size: 16px; }
    header code { margin-left: auto; color: #93c5fd; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 280px; min-height: calc(100vh - 56px); }
    .stage-wrap { display: grid; place-items: center; padding: 20px; overflow: auto; }
    .stage { position: relative; width: min(100%, ${manifest.viewport.width}px); aspect-ratio: ${manifest.viewport.width} / ${manifest.viewport.height}; background: ${manifest.viewport.background}; border: 1px solid rgba(255,255,255,.16); overflow: hidden; }
    .entity { position: absolute; border: 1px solid rgba(255,255,255,.38); color: #0f172a; font-weight: 700; cursor: pointer; }
    .entity span { pointer-events: none; }
    aside { border-left: 1px solid rgba(255,255,255,.12); padding: 16px; background: #111827; overflow: auto; }
    h1, h2 { margin: 0 0 12px; letter-spacing: 0; }
    ul { display: grid; gap: 10px; padding: 0; margin: 0; list-style: none; }
    li { display: grid; gap: 2px; padding: 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: rgba(255,255,255,.05); }
    li span, .meta { color: #cbd5e1; font-size: 13px; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } aside { border-left: 0; border-top: 1px solid rgba(255,255,255,.12); } }
  </style>
</head>
<body>
  <header>
    <strong>${escapeHtml(manifest.title)}</strong>
    <span class="meta">${escapeHtml(manifest.scene.title)}</span>
    <code>${escapeHtml(manifest.domainPath)}</code>
  </header>
  <main>
    <section class="stage-wrap">
      <div class="stage" id="stage" aria-label="${escapeHtml(manifest.scene.title)}">${entities}
      </div>
    </section>
    <aside>
      <h2>DSK Kits</h2>
      <ul>${kits}</ul>
    </aside>
  </main>
  <script type="application/json" id="dsk-manifest">${scriptSafeJson(manifest)}</script>
  <script>
    const manifest = JSON.parse(document.querySelector("#dsk-manifest").textContent);
    const stage = document.querySelector("#stage");
    let selected = null;
    stage.addEventListener("click", (event) => {
      const entity = event.target.closest(".entity");
      if (!entity) return;
      selected?.removeAttribute("aria-current");
      selected = entity;
      selected.setAttribute("aria-current", "true");
    });
    window.__NEXUS_DSK_GAME__ = { manifest };
  </script>
</body>
</html>
`;
}
