import { DEFAULT_EDITOR_PROJECT, buildEditorExportManifest, clone, createEditorProject } from "./editor-domain-model.js";

const DOMAIN_PATH_PATTERN = /^n(?::[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

export const DEFAULT_DSK_GAME = Object.freeze(buildEditorExportManifest(createEditorProject(DEFAULT_EDITOR_PROJECT)));

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
    kitId: asText(kit?.kitId, kit?.id ?? kit?.domainPath ?? "kit"),
    domainPath: normalizeDomainPath(kit?.domainPath, "n:kit:unknown"),
    label: asText(kit?.label, kit?.domainPath ?? "Kit"),
    requires: Array.isArray(kit?.requires) ? kit.requires.map(String) : [],
    provides: Array.isArray(kit?.provides) ? kit.provides.map(String) : [],
    children: Array.isArray(kit?.children) ? kit.children.map(String) : []
  };
}

function normalizeDomain(domain, index) {
  return {
    id: asText(domain?.id, `domain-${index + 1}`),
    kitId: asText(domain?.kitId, domain?.id ?? `domain-${index + 1}`),
    domain: asText(domain?.domain, domain?.domainPath ?? `domain-${index + 1}`),
    domainPath: normalizeDomainPath(domain?.domainPath, `n:domain:${index + 1}`),
    label: asText(domain?.label, domain?.domainPath ?? `Domain ${index + 1}`),
    subtitle: asText(domain?.subtitle, "Domain Service Kit"),
    status: asText(domain?.status, "ready"),
    type: asText(domain?.type, "atomic-domain-service-kit"),
    category: asText(domain?.category, "General"),
    parentDomain: domain?.parentDomain ? String(domain.parentDomain) : null,
    requires: Array.isArray(domain?.requires) ? domain.requires.map(String) : [],
    provides: Array.isArray(domain?.provides) ? domain.provides.map(String) : [],
    children: Array.isArray(domain?.children) ? domain.children.map(String) : [],
    path: domain?.path ? String(domain.path) : null
  };
}

function normalizeSceneObject(object, index) {
  return {
    id: asText(object?.id, `object-${index + 1}`),
    label: asText(object?.label, object?.id ?? `Object ${index + 1}`),
    type: asText(object?.type, "mesh:cube"),
    selected: Boolean(object?.selected),
    transform: {
      position: {
        x: asFiniteNumber(object?.transform?.position?.x, 0),
        y: asFiniteNumber(object?.transform?.position?.y, 1),
        z: asFiniteNumber(object?.transform?.position?.z, 0)
      },
      rotation: {
        x: asFiniteNumber(object?.transform?.rotation?.x, 0),
        y: asFiniteNumber(object?.transform?.rotation?.y, 0),
        z: asFiniteNumber(object?.transform?.rotation?.z, 0)
      },
      scale: {
        x: Math.max(0.01, asFiniteNumber(object?.transform?.scale?.x, 1)),
        y: Math.max(0.01, asFiniteNumber(object?.transform?.scale?.y, 1)),
        z: Math.max(0.01, asFiniteNumber(object?.transform?.scale?.z, 1))
      }
    },
    material: {
      color: normalizeColor(object?.material?.color, "#d1d5db"),
      roughness: asFiniteNumber(object?.material?.roughness, 0.58),
      metallic: asFiniteNumber(object?.material?.metallic, 0.06)
    },
    domainKits: Array.isArray(object?.domainKits) ? object.domainKits.map((domainPath) => normalizeDomainPath(domainPath, "n:scene")) : ["n:scene"],
    components: clone(object?.components ?? {})
  };
}

function normalizeScene3d(input = {}) {
  const source = { ...clone(DEFAULT_DSK_GAME.scene3d), ...(input ?? {}) };
  return {
    title: asText(source.title, DEFAULT_DSK_GAME.scene3d.title),
    units: asText(source.units, "meters"),
    camera: {
      ...clone(DEFAULT_DSK_GAME.scene3d.camera),
      ...(source.camera ?? {})
    },
    light: {
      ...clone(DEFAULT_DSK_GAME.scene3d.light),
      ...(source.light ?? {})
    },
    authoringPresets: Array.isArray(source.authoringPresets) ? clone(source.authoringPresets) : [],
    gameTemplates: Array.isArray(source.gameTemplates) ? clone(source.gameTemplates) : [],
    chess: source.chess ? clone(source.chess) : undefined,
    targetClicker: source.targetClicker ? clone(source.targetClicker) : undefined,
    gemCollector: source.gemCollector ? clone(source.gemCollector) : undefined,
    runtimeInteraction: source.runtimeInteraction ? clone(source.runtimeInteraction) : undefined,
    objects: (Array.isArray(source.objects) && source.objects.length ? source.objects : DEFAULT_DSK_GAME.scene3d.objects).map(normalizeSceneObject)
  };
}

function normalizeRuntime(input = {}) {
  const renderer = asText(input.renderer, "canvas-3d");
  return {
    renderer: renderer === "dom-cubes" ? "dom-cubes" : "canvas-3d",
    maxDrawnObjects: Math.max(25, Math.min(2000, Math.floor(asFiniteNumber(input.maxDrawnObjects, 600)))),
    culling: asText(input.culling, "distance-window")
  };
}

function normalizeStep(step, index) {
  return {
    id: asText(step?.id, `step-${String(index + 1).padStart(2, "0")}`),
    order: Math.max(1, asFiniteNumber(step?.order, index + 1)),
    domainPath: normalizeDomainPath(step?.domainPath, "n:scene"),
    label: asText(step?.label, `step.${index + 1}`),
    event: asText(step?.event, step?.label ?? "on:tick"),
    targetDomainPath: normalizeDomainPath(step?.targetDomainPath, step?.domainPath ?? "n:scene"),
    targetOutput: asText(step?.targetOutput, step?.target ?? "out:value"),
    target: asText(step?.target, "sequence.next")
  };
}

function legacySceneToScene3d(scene) {
  if (!scene?.entities?.length) return undefined;
  return {
    title: asText(scene.title, "Starter Scene"),
    objects: scene.entities.map((entity, index) => ({
      id: asText(entity.id, `entity-${index + 1}`),
      label: asText(entity.label, entity.id ?? `Entity ${index + 1}`),
      type: "mesh:cube",
      selected: index === 0,
      transform: {
        position: { x: index * 1.5 - 1.5, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      material: {
        color: normalizeColor(entity.color, "#d1d5db")
      }
    }))
  };
}

export function normalizeDskGameManifest(input = {}) {
  const source = { ...clone(DEFAULT_DSK_GAME), ...(input ?? {}) };
  const viewport = { ...DEFAULT_DSK_GAME.viewport, ...(input.viewport ?? {}) };
  const domainStack = Array.isArray(source.domainStack) && source.domainStack.length
    ? source.domainStack
    : (Array.isArray(source.kits) ? source.kits.map((kit, index) => ({
      id: `domain-${index + 1}`,
      domainPath: kit.domainPath,
      label: kit.label,
      subtitle: "Domain Service Kit",
      status: "ready"
    })) : DEFAULT_DSK_GAME.domainStack);
  const scene3dInput = source.scene3d ?? legacySceneToScene3d(source.scene) ?? DEFAULT_DSK_GAME.scene3d;
  return {
    title: asText(source.title, DEFAULT_DSK_GAME.title),
    domainPath: normalizeDomainPath(source.domainPath),
    version: asText(source.version, DEFAULT_DSK_GAME.version),
    viewport: {
      mode: "3d",
      width: Math.max(320, asFiniteNumber(viewport.width, DEFAULT_DSK_GAME.viewport.width)),
      height: Math.max(240, asFiniteNumber(viewport.height, DEFAULT_DSK_GAME.viewport.height)),
      background: normalizeColor(viewport.background, DEFAULT_DSK_GAME.viewport.background),
      gridSize: Math.max(8, asFiniteNumber(viewport.gridSize, DEFAULT_DSK_GAME.viewport.gridSize))
    },
    scene3d: normalizeScene3d(scene3dInput),
    domainStack: domainStack.map(normalizeDomain),
    domainStackHealth: clone(source.domainStackHealth ?? {}),
    kits: (Array.isArray(source.kits) && source.kits.length ? source.kits : domainStack).map(normalizeKit),
    kitConfigs: clone(source.kitConfigs ?? DEFAULT_DSK_GAME.kitConfigs),
    featureContracts: clone(source.featureContracts ?? DEFAULT_DSK_GAME.featureContracts ?? []),
    featureContractValidation: clone(source.featureContractValidation ?? DEFAULT_DSK_GAME.featureContractValidation ?? {}),
    runtime: normalizeRuntime(source.runtime ?? {}),
    sequenceSteps: (Array.isArray(source.sequenceSteps) && source.sequenceSteps.length ? source.sequenceSteps : DEFAULT_DSK_GAME.sequenceSteps).map(normalizeStep),
    sequenceGraph: clone(source.sequenceGraph ?? {})
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
  const selectedObject = manifest.scene3d.objects.find((object) => object.selected) ?? manifest.scene3d.objects[0];
  const visibleObjectRows = manifest.scene3d.objects.slice(0, 40);
  const objectRows = visibleObjectRows.map((object) => `<li><strong>${escapeHtml(object.label)}</strong><span>${escapeHtml(object.type)} @ ${object.transform.position.x}, ${object.transform.position.y}, ${object.transform.position.z} · ${(object.domainKits ?? []).map(escapeHtml).join(", ")}</span></li>`).join("");
  const objectListNote = manifest.scene3d.objects.length > visibleObjectRows.length
    ? `<li><strong>${manifest.scene3d.objects.length - visibleObjectRows.length} more objects</strong><span>Runtime keeps the full manifest and culls the visible draw set.</span></li>`
    : "";
  const presetRows = (manifest.scene3d.authoringPresets ?? []).map((preset) => `<li><strong>${escapeHtml(preset.label ?? preset.presetId)}</strong><span>${escapeHtml(preset.presetId)} · ${Number(preset.count) || 0} objects</span></li>`).join("");
  const templateRows = (manifest.scene3d.gameTemplates ?? []).map((template) => `<li><strong>${escapeHtml(template.label ?? template.templateId)}</strong><span>${escapeHtml(template.templateId)} · ${Number(template.count) || 0} objects · ${(template.sequenceLabels ?? []).map(escapeHtml).join(", ")}</span></li>`).join("");
  const targetClicker = manifest.scene3d.targetClicker ?? null;
  const runtimeInteraction = manifest.scene3d.runtimeInteraction ?? null;
  const interactionObjects = runtimeInteraction ? manifest.scene3d.objects
    .filter((object) => object.components?.runtimeClickable || object.components?.targetClickerTarget) : [];
  const targetRows = interactionObjects.length ? interactionObjects
    .map((object) => {
      const config = object.components?.runtimeClickable ?? object.components?.targetClickerTarget ?? {};
      return `<li data-target-row="${escapeHtml(object.id)}" data-interaction-row="${escapeHtml(object.id)}"><strong>${escapeHtml(object.label)}</strong><span>${Number(config.points) || 0} points · ready</span></li>`;
    })
    .join("") : "";
  const domainRows = manifest.domainStack.map((domain) => `<li><code>${escapeHtml(domain.domainPath)}</code><span>${escapeHtml(domain.kitId)} · ${escapeHtml(domain.subtitle)}</span></li>`).join("");
  const sequenceRows = manifest.sequenceSteps.map((step) => `<li><strong>${String(step.order).padStart(2, "0")} ${escapeHtml(step.label)}</strong><span>${escapeHtml(step.domainPath)} ${escapeHtml(step.event)} → ${escapeHtml(step.targetDomainPath)} / ${escapeHtml(step.targetOutput)}</span></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: Inter, system-ui, sans-serif; color: #f8fafc; background: #030712; overflow: hidden; }
    body { display: grid; grid-template-rows: auto 1fr; }
    header { min-height: 54px; display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.12); background: rgba(8, 13, 20, .96); }
    header strong { font-size: 16px; }
    header code { margin-left: auto; color: #86efac; }
    main { position: relative; min-height: calc(100vh - 54px); overflow: hidden; background: radial-gradient(circle at 50% 36%, rgba(59,130,246,.13), transparent 28%), ${manifest.viewport.background}; }
    .runtime-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .runtime-hud { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap; max-width: min(760px, calc(100vw - 360px)); }
    .runtime-hud span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; padding: 0 9px; background: rgba(10,17,25,.68); color: #dbeafe; font-size: 12px; }
    .gizmo { position: absolute; left: 50%; top: 45%; width: 180px; height: 180px; transform: translate(-44%, -58%); pointer-events: none; }
    .gizmo span { position: absolute; display: block; height: 3px; border-radius: 99px; transform-origin: left center; }
    .gizmo .y { left: 78px; top: 82px; width: 92px; background: #4ade80; transform: rotate(-90deg); }
    .gizmo .x { left: 82px; top: 88px; width: 90px; background: #ef4444; transform: rotate(14deg); }
    .gizmo .z { left: 72px; top: 88px; width: 84px; background: #3b82f6; transform: rotate(152deg); }
    aside { position: absolute; width: min(340px, 86vw); top: 70px; right: 24px; max-height: calc(100% - 92px); overflow: auto; padding: 14px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: rgba(10,17,25,.76); backdrop-filter: blur(16px); box-shadow: 0 16px 52px rgba(0,0,0,.32); }
    h1, h2 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 15px; }
    h2 { font-size: 13px; margin: 12px 0 8px; color: #cbd5e1; }
    ul { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
    li { display: grid; gap: 2px; padding: 9px; border: 1px solid rgba(255,255,255,.1); border-radius: 6px; background: rgba(255,255,255,.045); }
    li span { color: #cbd5e1; font-size: 12px; }
    .runtime-action-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; margin: 0 0 8px; }
    .runtime-action-row button { min-height: 32px; border: 1px solid rgba(96,165,250,.44); border-radius: 6px; padding: 0 12px; background: rgba(37,99,235,.22); color: #eff6ff; font: inherit; font-weight: 700; cursor: pointer; }
    .runtime-action-row span { color: #9fb6cf; font-size: 12px; }
    #runtime-receipts li { grid-template-columns: 36px 1fr; align-items: center; }
    #runtime-receipts code { color: #86efac; }
    @media (max-width: 760px) { aside { left: 10px; right: 10px; top: auto; bottom: 10px; width: auto; max-height: 42vh; } .runtime-hud { left: 10px; right: 10px; bottom: calc(42vh + 20px); max-width: none; } }
  </style>
</head>
<body>
  <header>
    <strong>${escapeHtml(manifest.title)}</strong>
    <span>${escapeHtml(manifest.scene3d.title)}</span>
    <code>${escapeHtml(manifest.domainPath)}</code>
  </header>
  <main>
    <canvas id="runtime-canvas" class="runtime-canvas" data-renderer="${escapeHtml(manifest.runtime.renderer)}" aria-label="Canvas 3D runtime viewport"></canvas>
    <div class="gizmo" aria-label="Selected object: ${escapeHtml(selectedObject?.label ?? "none")}"><span class="y"></span><span class="x"></span><span class="z"></span></div>
    <div class="runtime-hud" aria-live="polite">
      <span id="runtime-renderer">renderer ${escapeHtml(manifest.runtime.renderer)}</span>
      <span id="runtime-object-count">${manifest.scene3d.objects.length} scene objects</span>
      <span id="runtime-render-stats">waiting for frame</span>
    </div>
    <aside>
      <h1>Domain Service Kit Runtime</h1>
      <h2>Runtime</h2>
      <ul><li><strong>${escapeHtml(manifest.runtime.renderer)}</strong><span>${manifest.scene3d.objects.length} manifest objects · max draw ${manifest.runtime.maxDrawnObjects}</span></li></ul>
      ${presetRows ? `<h2>Authoring Presets</h2><ul>${presetRows}</ul>` : ""}
      ${templateRows ? `<h2>Game Templates</h2><ul>${templateRows}</ul>` : ""}
      ${targetRows ? `<h2>Runtime Interactions</h2><div class="runtime-action-row"><button type="button" id="runtime-reset-interactions">Reset</button><span id="runtime-target-status">0 score</span></div><ul id="runtime-target-list">${targetRows}</ul>` : ""}
      <h2>Sequence Playback</h2>
      <div class="runtime-action-row">
        <button type="button" id="runtime-run-sequence">Run Sequence</button>
        <span id="runtime-sequence-status">0 receipts</span>
      </div>
      <ul id="runtime-receipts"></ul>
      <h2>Scene Objects</h2>
      <ul>${objectRows}${objectListNote}</ul>
      <h2>Domain Stack</h2>
      <ul>${domainRows}</ul>
      <h2>Sequence Timeline</h2>
      <ul>${sequenceRows}</ul>
    </aside>
  </main>
  <script type="application/json" id="dsk-manifest">${scriptSafeJson(manifest)}</script>
  <script>
    const manifest = JSON.parse(document.querySelector("#dsk-manifest").textContent);
    const sequenceReceipts = [];
    const targetClicker = manifest.scene3d.targetClicker || null;
    const runtimeInteraction = manifest.scene3d.runtimeInteraction || (targetClicker ? {
      domainPath: "n:runtime:interaction",
      targetObjectCount: targetClicker.targetObjectCount,
      targetObjectIds: targetClicker.targetObjectIds || [],
      score: Number(targetClicker.score || 0),
      hitObjectIds: targetClicker.hitObjectIds || [],
      roundStatus: targetClicker.roundStatus || "ready"
    } : null);
    const interactionState = {
      score: Number(runtimeInteraction?.score || targetClicker?.score || 0),
      hitObjectIds: new Set(runtimeInteraction?.hitObjectIds || targetClicker?.hitObjectIds || []),
      lastHit: ""
    };
    const targetState = interactionState;
    const canvas = document.querySelector("#runtime-canvas");
    const ctx = canvas.getContext("2d", { alpha: true });
    const renderStats = {
      renderer: manifest.runtime.renderer,
      culling: manifest.runtime.culling,
      totalObjects: manifest.scene3d.objects.length,
      renderedObjects: 0,
      culledObjects: 0,
      maxDrawnObjects: manifest.runtime.maxDrawnObjects
    };
    function resizeCanvas() {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    function projectObject(object, width, height) {
      const position = object.transform.position || { x: 0, y: 1, z: 0 };
      return {
        x: width / 2 + (position.x * 48) - (position.z * 26),
        y: height * .52 - (position.y * 36) + (position.z * 15),
        z: position.z || 0
      };
    }
    function runtimeClickableFor(object) {
      if (object.components?.runtimeClickable) return object.components.runtimeClickable;
      if (object.components?.targetClickerTarget) {
        return {
          domainPath: "n:runtime:interaction",
          targetDomainPath: "n:game:target-clicker",
          event: "interaction.hit",
          completeEvent: "round.complete",
          output: "score:value",
          completeOutput: "round:complete",
          points: Number(object.components.targetClickerTarget.points || targetClicker?.scorePerTarget || 10),
          singleUse: true,
          kind: "target"
        };
      }
      return null;
    }
    function drawCube(projected, object) {
      const scale = object.transform.scale || { x: 1, y: 1, z: 1 };
      const size = Math.max(8, Math.min(88, 44 * Math.max(scale.x || 1, scale.y || 1)));
      const x = projected.x;
      const y = projected.y;
      const interaction = runtimeClickableFor(object);
      const isTarget = Boolean(interaction);
      const isHit = interactionState.hitObjectIds.has(object.id);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.beginPath();
      ctx.ellipse(x + size * .2, y + size * .65, size * .78, size * .24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isHit ? "#334155" : object.material.color || "#d1d5db";
      ctx.strokeStyle = object.selected ? "#f8fafc" : "rgba(226,232,240,.62)";
      ctx.lineWidth = object.selected ? 2 : 1;
      ctx.beginPath();
      ctx.rect(x - size / 2, y - size / 2, size, size);
      ctx.fill();
      ctx.stroke();
      if (isTarget) {
        ctx.fillStyle = isHit ? "#94a3b8" : "#f8fafc";
        ctx.font = "700 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(isHit ? "HIT" : String(interaction.points || 0), x, y + 4);
      }
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.beginPath();
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x - size / 2 + size * .24, y - size * .72);
      ctx.lineTo(x + size / 2 + size * .24, y - size * .72);
      ctx.lineTo(x + size / 2, y - size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(15,23,42,.35)";
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y - size / 2);
      ctx.lineTo(x + size / 2 + size * .24, y - size * .72);
      ctx.lineTo(x + size / 2 + size * .24, y + size * .28);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    function drawRuntimeFrame() {
      resizeCanvas();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = manifest.viewport.background || "#0b1420";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(148,163,184,.18)";
      ctx.lineWidth = 1;
      for (let i = -28; i <= 28; i += 1) {
        ctx.beginPath();
        ctx.moveTo(width / 2 - 760 + i * 28, height * .63 + 260);
        ctx.lineTo(width / 2 + 760 + i * 28, height * .25);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(width / 2 - 760 + i * 28, height * .25);
        ctx.lineTo(width / 2 + 760 + i * 28, height * .63 + 260);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(239,68,68,.75)";
      ctx.beginPath();
      ctx.moveTo(0, height * .82);
      ctx.lineTo(width, height * .38);
      ctx.stroke();
      ctx.strokeStyle = "rgba(132,204,22,.72)";
      ctx.beginPath();
      ctx.moveTo(0, height * .48);
      ctx.lineTo(width, height * .7);
      ctx.stroke();

      const drawLimit = manifest.runtime.culling === "none" ? manifest.scene3d.objects.length : manifest.runtime.maxDrawnObjects;
      const projected = manifest.scene3d.objects
        .map((object) => ({ object, projected: projectObject(object, width, height) }))
        .filter((entry) => entry.projected.x > -120 && entry.projected.x < width + 120 && entry.projected.y > -140 && entry.projected.y < height + 140)
        .sort((a, b) => b.projected.z - a.projected.z)
        .slice(0, drawLimit);
      for (const entry of projected) drawCube(entry.projected, entry.object);
      renderStats.renderedObjects = projected.length;
      renderStats.culledObjects = Math.max(0, manifest.scene3d.objects.length - projected.length);
      document.querySelector("#runtime-render-stats").textContent = renderStats.renderedObjects + " drawn · " + renderStats.culledObjects + " culled";
      return renderStats;
    }
    function interactiveEntries() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      return manifest.scene3d.objects
        .filter((object) => runtimeClickableFor(object))
        .map((object) => {
          const projected = projectObject(object, width, height);
          const scale = object.transform.scale || { x: 1, y: 1, z: 1 };
          const radius = Math.max(20, Math.min(60, 44 * Math.max(scale.x || 1, scale.y || 1) * .78));
          return { object, projected, radius, interaction: runtimeClickableFor(object) };
        });
    }
    const targetEntries = interactiveEntries;
    function recordInteractionHit(object) {
      const interaction = runtimeClickableFor(object);
      if (!runtimeInteraction || !object || !interaction) return null;
      if (interaction.singleUse !== false && interactionState.hitObjectIds.has(object.id)) return null;
      const points = Number(interaction.points || targetClicker?.scorePerTarget || 10);
      interactionState.hitObjectIds.add(object.id);
      interactionState.score += points;
      interactionState.lastHit = object.id;
      runtimeInteraction.score = interactionState.score;
      runtimeInteraction.hitObjectIds = Array.from(interactionState.hitObjectIds);
      const targetCount = Number(runtimeInteraction.targetObjectCount || runtimeInteraction.targetObjectIds?.length || interactiveEntries().length || 0);
      runtimeInteraction.roundStatus = targetCount > 0 && interactionState.hitObjectIds.size >= targetCount ? "complete" : "running";
      if (targetClicker) {
        targetClicker.score = interactionState.score;
        targetClicker.hitObjectIds = Array.from(interactionState.hitObjectIds);
        targetClicker.roundStatus = runtimeInteraction.roundStatus;
      }
      const event = runtimeInteraction.roundStatus === "complete" ? (interaction.completeEvent || "round.complete") : (interaction.event || "interaction.hit");
      const targetOutput = runtimeInteraction.roundStatus === "complete" ? (interaction.completeOutput || "round:complete") : (interaction.output || "score:value");
      const receipt = {
        stepId: "runtime-interaction-hit",
        order: sequenceReceipts.length + 1,
        domainPath: "n:runtime:interaction",
        event,
        targetDomainPath: interaction.targetDomainPath || runtimeInteraction.domainPath || "n:runtime:interaction",
        targetOutput,
        objectId: object.id,
        points,
        score: interactionState.score,
        status: "delivered"
      };
      sequenceReceipts.push(receipt);
      renderSequenceReceipts();
      renderInteractionStatus();
      drawRuntimeFrame();
      return receipt;
    }
    const recordTargetHit = recordInteractionHit;
    function handleRuntimePointer(event) {
      if (!runtimeInteraction) return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const candidate = interactiveEntries()
        .filter((entry) => entry.interaction.singleUse === false || !interactionState.hitObjectIds.has(entry.object.id))
        .map((entry) => ({
          ...entry,
          distance: Math.hypot(entry.projected.x - point.x, entry.projected.y - point.y)
        }))
        .filter((entry) => entry.distance <= entry.radius)
        .sort((a, b) => a.distance - b.distance)[0];
      if (candidate) recordInteractionHit(candidate.object);
    }
    const handleTargetPointer = handleRuntimePointer;
    function resetInteractions() {
      if (!runtimeInteraction) return;
      interactionState.score = 0;
      interactionState.lastHit = "";
      interactionState.hitObjectIds = new Set();
      runtimeInteraction.score = 0;
      runtimeInteraction.hitObjectIds = [];
      runtimeInteraction.roundStatus = "ready";
      if (targetClicker) {
        targetClicker.score = 0;
        targetClicker.hitObjectIds = [];
        targetClicker.roundStatus = "ready";
      }
      renderInteractionStatus();
      drawRuntimeFrame();
    }
    const resetTargets = resetInteractions;
    function renderInteractionStatus() {
      if (!runtimeInteraction) return;
      const status = document.querySelector("#runtime-target-status");
      const targetCount = Number(runtimeInteraction.targetObjectCount || runtimeInteraction.targetObjectIds?.length || interactiveEntries().length || 0);
      if (status) status.textContent = interactionState.score + " score · " + interactionState.hitObjectIds.size + "/" + targetCount + " hit";
      for (const object of manifest.scene3d.objects.filter((item) => runtimeClickableFor(item))) {
        const row = document.querySelector('[data-target-row="' + object.id + '"] span');
        const interaction = runtimeClickableFor(object);
        if (row) row.textContent = (Number(interaction?.points) || 0) + " points · " + (interactionState.hitObjectIds.has(object.id) ? "hit" : "ready");
      }
    }
    const renderTargetStatus = renderInteractionStatus;
    function runSequence() {
      sequenceReceipts.length = 0;
      for (const step of manifest.sequenceSteps) {
        sequenceReceipts.push({
          stepId: step.id,
          order: step.order,
          domainPath: step.domainPath,
          event: step.event,
          targetDomainPath: step.targetDomainPath,
          targetOutput: step.targetOutput,
          status: "delivered"
        });
      }
      renderSequenceReceipts();
      return sequenceReceipts.slice();
    }
    function renderSequenceReceipts() {
      const status = document.querySelector("#runtime-sequence-status");
      const list = document.querySelector("#runtime-receipts");
      if (!status || !list) return;
      status.textContent = sequenceReceipts.length + " receipts";
      list.replaceChildren(...sequenceReceipts.slice(-6).map((receipt) => {
        const row = document.createElement("li");
        const order = document.createElement("code");
        const summary = document.createElement("span");
        order.textContent = String(receipt.order).padStart(2, "0");
        summary.textContent = receipt.event + " → " + receipt.targetDomainPath + " / " + receipt.targetOutput;
        row.append(order, summary);
        return row;
      }));
    }
    window.__NEXUS_DSK_GAME__ = { manifest, scene: manifest.scene3d, sequence: manifest.sequenceSteps, sequenceReceipts, renderStats, interactionState, targetState, drawRuntimeFrame, runSequence, recordInteractionHit, resetInteractions, handleRuntimePointer, recordTargetHit, resetTargets };
    window.addEventListener("resize", drawRuntimeFrame);
    document.querySelector("#runtime-run-sequence")?.addEventListener("click", runSequence);
    document.querySelector("#runtime-reset-interactions")?.addEventListener("click", resetInteractions);
    document.querySelector("#runtime-reset-targets")?.addEventListener("click", resetTargets);
    canvas.addEventListener("click", handleRuntimePointer);
    drawRuntimeFrame();
    renderInteractionStatus();
    runSequence();
  </script>
</body>
</html>
`;
}
