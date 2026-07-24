import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const editorRoot = resolve(process.cwd());
const githubRoot = resolve(editorRoot, "..");
const executablePath = existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined;
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const playableFixture = {
  version: "0.3.0",
  savedAt: "2026-07-22T00:00:00.000Z",
  project: {
    title: "Playable Fixture",
    domainPath: "n:game:playable-fixture",
    playable: {
      schema: "nexusengine.playable-project/1",
      id: "playable-fixture",
      title: "Playable Fixture",
      entry: "./playable-fixture.html",
      runtime: "nexusengine-webgl2",
      contractHash: "fixture-contract"
    },
    scene3d: {
      camera: { id: "camera-main", label: "Authoring Camera", position: { x: 8, y: 7, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 48 },
      objects: [{
        id: "fixture-floor",
        label: "Fixture Floor",
        type: "mesh:cube",
        selected: true,
        transform: { position: { x: 0, y: -0.15, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 6, y: 0.2, z: 6 } },
        material: { color: "#555555", roughness: 0.8, metallic: 0.1 },
        components: { authoringSource: { role: "floor", sourceId: "fixture-floor", size: [9.6, 0.32, 9.6] } }
      }],
      authoringViews: [
        { id: "world-overview", label: "World Overview", kind: "overview", position: { x: 8, y: 7, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 48 },
        { id: "player-spawn", label: "Spawn Player", kind: "player", position: { x: 0, y: 1.72, z: 4 }, target: { x: 0, y: 1.72, z: -4 }, fov: 75 }
      ],
      activeAuthoringViewId: "world-overview",
      generatedGame: { seedId: "playable-fixture", authoringMapSchema: "nexusengine.game-authoring-map/1", playableEntry: "./playable-fixture.html" }
    }
  }
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/playable-fixture.project.json") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(playableFixture));
      return;
    }
    if (pathname === "/playable-fixture.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end("<!doctype html><title>Playable Fixture Runtime</title><main>PLAYABLE FIXTURE READY</main><script>window.__NEXUS_GAME_PROOF__={version:1,snapshot(){return {lifecycle:'title'}},command(){return {ok:true}}}</script>");
      return;
    }
    let filePath = resolve(githubRoot, `.${pathname}`);
    if (!filePath.startsWith(githubRoot)) throw new Error("Path escapes test root.");
    if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": `${mime[extname(filePath)] ?? "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
  }
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const url = `http://127.0.0.1:${address.port}/NexusEngine-Editor/index.html?engine=/NexusEngine/src/index.js`;

const browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
const consoleErrors = [];
const pageErrors = [];

async function readWorkspaceLayout(page) {
  return page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        x: rect.x,
        y: rect.y,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        area: rect.width * rect.height,
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
      };
    };
    const regions = [read(".viewport-pane"), read(".composer-panel"), read(".configure-panel"), read(".sequence-panel")].filter((entry) => entry?.visible);
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const overlaps = [];
    for (let index = 0; index < regions.length; index += 1) {
      for (let next = index + 1; next < regions.length; next += 1) overlaps.push({ pair: `${regions[index].selector}:${regions[next].selector}`, area: overlap(regions[index], regions[next]) });
    }
    return {
      width: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      app: read("#app"),
      header: read(".command-strip"),
      projectActions: read(".project-actions-strip"),
      workspace: read(".editor-workspace"),
      viewport: read(".viewport-pane"),
      stage: read(".scene-stage"),
      regions,
      overlaps,
      contextTabs: read(".workspace-context-tabs"),
      activeContext: document.querySelector(".editor-workspace")?.dataset.activeContext,
      forbiddenOverlayCount: document.querySelectorAll(".overlay-panel, .project-menu-popover, .composition-add-popover").length
    };
  });
}

function assertWorkspaceFits(layout, label) {
  assert.ok(layout.app.width <= layout.width + 1 && layout.app.height <= layout.height + 1, `${label}: app stays inside the window`);
  assert.ok(layout.app.height >= layout.height - 1 && layout.workspace.bottom >= layout.height - 1, `${label}: workspace fills the available window`);
  assert.ok(layout.documentWidth <= layout.width + 1 && layout.documentHeight <= layout.height + 1, `${label}: page does not escape the window`);
  assert.ok(layout.viewport.visible && layout.viewport.width >= 280 && layout.viewport.height >= 220, `${label}: viewport remains usable`);
  assert.ok(layout.stage.visible && layout.stage.width > 0 && layout.stage.height > 0, `${label}: 3D stage remains visible`);
  assert.ok(layout.regions.every((region) => !["absolute", "fixed"].includes(region.position)), `${label}: primary regions are grid-owned`);
  assert.deepEqual(layout.overlaps.filter((entry) => entry.area > 0.5), [], `${label}: visible regions never overlap`);
  assert.equal(layout.forbiddenOverlayCount, 0, `${label}: no legacy overlay surfaces remain`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.removeItem("nexusengine-editor:project-snapshot"));
  await page.goto(url, { waitUntil: "networkidle" });
  try {
    await page.waitForFunction(() => window.__NEXUS_COMPOSITION__?.supported === true, null, { timeout: 30000 });
  } catch (error) {
    console.error("editor startup diagnostics", { consoleErrors, pageErrors, body: (await page.locator("body").innerText()).slice(0, 1000) });
    throw error;
  }

  await assert.doesNotReject(() => page.getByRole("banner").getByText("Starter 3D Scene").waitFor());
  await assert.doesNotReject(() => page.locator(".composer-panel", { hasText: "Game Structure" }).waitFor());
  await assert.doesNotReject(() => page.locator(".configure-panel", { hasText: "Inspector" }).waitFor());
  await assert.doesNotReject(() => page.locator("text=Sequence Timeline").waitFor());
  await assert.doesNotReject(() => page.locator("#viewport-canvas").waitFor());
  await assert.doesNotReject(() => page.locator('[data-composition-node="game-root"].selected').waitFor());
  assert.equal(await page.locator("#timeline-toggle").getAttribute("aria-expanded"), "false", "advanced Timeline starts collapsed");
  assert.equal(await page.locator("#play").count(), 1, "Play has one authoritative control");
  assert.equal(await page.locator("#stop").count(), 1, "Stop has one authoritative control");

  const initial = await page.evaluate(() => ({
    version: window.__NEXUS_EDITOR_STATE__.project.version,
    schema: window.__NEXUS_EDITOR_STATE__.project.composition.schema,
    valid: window.__NEXUS_COMPOSITION__.validation.ok,
    source: window.__NEXUS_COMPOSITION__.source,
    nodeCount: window.__NEXUS_COMPOSITION__.tree.nodes.length
  }));
  assert.equal(initial.version, "0.3.0");
  assert.equal(initial.schema, "nexusengine.composition-tree/1");
  assert.equal(initial.valid, true);
  assert.match(initial.source, /NexusEngine\/src\/index\.js/);
  assert.ok(initial.nodeCount >= 15);

  const viewportLayout = await page.evaluate(() => {
    const stage = document.querySelector(".viewport-pane").getBoundingClientRect();
    const left = document.querySelector(".composer-panel").getBoundingClientRect();
    const right = document.querySelector(".configure-panel").getBoundingClientRect();
    const timeline = document.querySelector(".sequence-panel").getBoundingClientRect();
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      stageArea: stage.width * stage.height,
      screenArea: innerWidth * innerHeight,
      leftArea: left.width * left.height,
      rightArea: right.width * right.height,
      leftWidth: left.width,
      rightWidth: right.width,
      timelineHeight: timeline.height,
      overlaps: [overlap(stage, left), overlap(stage, right), overlap(stage, timeline), overlap(left, right), overlap(left, timeline), overlap(right, timeline)]
    };
  });
  assert.ok(viewportLayout.stageArea > viewportLayout.screenArea * 0.45, "3D viewport remains the largest workspace region");
  assert.ok(viewportLayout.stageArea > viewportLayout.leftArea && viewportLayout.stageArea > viewportLayout.rightArea);
  assert.ok(viewportLayout.leftWidth <= 290 && viewportLayout.rightWidth <= 320);
  assert.ok(viewportLayout.timelineHeight <= 44, "collapsed Timeline preserves viewport height");
  assert.deepEqual(viewportLayout.overlaps, [0, 0, 0, 0, 0, 0], "workspace docks never overlap");
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-initial.png"), fullPage: true });

  const initialResponsiveLayout = await readWorkspaceLayout(page);
  assertWorkspaceFits(initialResponsiveLayout, "1440x920");
  assert.ok(initialResponsiveLayout.viewport.area > initialResponsiveLayout.regions.filter((entry) => entry.selector !== ".viewport-pane").reduce((largest, entry) => Math.max(largest, entry.area), 0), "wide viewport remains the largest region");

  const structureWidthBefore = await page.locator(".composer-panel").evaluate((element) => element.getBoundingClientRect().width);
  await page.locator('[data-workspace-resize="structure"]').focus();
  await page.keyboard.press("ArrowRight");
  const structureWidthAfter = await page.locator(".composer-panel").evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(structureWidthAfter > structureWidthBefore, "keyboard splitter resizes Game Structure");

  await page.click("#timeline-toggle");
  const behaviorHeightBefore = await page.locator(".sequence-panel").evaluate((element) => element.getBoundingClientRect().height);
  await page.locator('[data-workspace-resize="behavior"]').focus();
  await page.keyboard.press("ArrowUp");
  const behaviorHeightAfter = await page.locator(".sequence-panel").evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(behaviorHeightAfter > behaviorHeightBefore, "keyboard splitter resizes Behaviors");
  await page.click("#timeline-toggle");

  for (const [width, height, expectedMode] of [[1024, 768, "context"], [760, 900, "context"], [617, 779, "stacked"], [390, 844, "stacked"]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(50);
    for (const [context, selector] of [["structure", ".composer-panel"], ["inspector", ".configure-panel"], ["behavior", ".sequence-panel"]]) {
      await page.click(`[data-workspace-context="${context}"]`);
      await assert.doesNotReject(() => page.locator(selector).waitFor({ state: "visible" }));
      const contextLayout = await readWorkspaceLayout(page);
      assertWorkspaceFits(contextLayout, `${width}x${height} ${context}`);
      assert.equal(contextLayout.activeContext, context);
      assert.equal(contextLayout.contextTabs.visible, true, `${expectedMode} mode keeps context navigation visible`);
      if (width === 390 && context !== "structure") {
        await page.screenshot({ path: resolve(editorRoot, "dist", `registry-composer-${width}x${height}-${context}.png`), fullPage: true });
      }
    }
    await page.click('[data-workspace-context="structure"]');
    await page.screenshot({ path: resolve(editorRoot, "dist", `registry-composer-${width}x${height}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.waitForTimeout(50);

  await page.click("#project-actions-toggle");
  const projectLayout = await readWorkspaceLayout(page);
  assert.equal(projectLayout.projectActions.visible, true, "Project actions expand as a layout row");
  assert.ok(projectLayout.projectActions.bottom <= projectLayout.workspace.top + 1, "Project actions push the workspace instead of covering it");
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-project-actions.png"), fullPage: true });
  await page.click("#project-actions-toggle");

  // Invalid draft: the legacy Physics schema requires numeric substeps.
  await page.click('[data-composition-node="kit-node-domain-physics"]');
  await assert.doesNotReject(() => page.locator(".composition-settings", { hasText: "Kit Settings" }).waitFor());
  await assert.doesNotReject(() => page.locator('[data-composition-config-field="substeps"]').waitFor());
  await page.click(".composition-raw-config summary");
  const acceptedRevision = await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.project.composition.revision);
  await page.fill("#composition-config-json", JSON.stringify({
    enabled: true,
    gravity: { x: 0, y: -9.81, z: 0 },
    collider: "AABB",
    substeps: "invalid",
    events: ["on:collide"],
    outputs: ["out:velocity"]
  }, null, 2));
  await page.locator("#composition-config-json").dispatchEvent("change");
  await page.click("#composition-apply");
  await page.waitForFunction(() => window.__NEXUS_COMPOSITION__.validation.ok === false);
  assert.equal(await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.project.composition.revision), acceptedRevision, "failed Apply leaves accepted composition unchanged");
  await assert.doesNotReject(() => page.locator(".composition-issues", { hasText: "invalid-node-config" }).waitFor());
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-invalid-apply.png"), fullPage: true });

  await page.fill("#composition-config-json", JSON.stringify({
    enabled: true,
    gravity: { x: 0, y: -9.81, z: 0 },
    collider: "AABB",
    substeps: 5,
    events: ["on:collide", "on:trigger", "on:rest"],
    outputs: ["out:velocity"]
  }, null, 2));
  await page.locator("#composition-config-json").dispatchEvent("change");
  await page.click("#composition-apply");
  await page.waitForFunction(() => window.__NEXUS_COMPOSITION__.validation.ok && window.__NEXUS_COMPOSITION__.dirty === false);

  // Add a trusted Core domain and kit through the contextual registry picker.
  await page.click('[data-composition-node="game-root"]');
  await page.click("#composition-add-toggle");
  const addRegionLayout = await page.locator(".composition-add-region").evaluate((element) => {
    const region = element.getBoundingClientRect();
    const owner = element.closest(".composer-panel").getBoundingClientRect();
    return { position: getComputedStyle(element).position, inside: region.left >= owner.left && region.right <= owner.right && region.top >= owner.top && region.bottom <= owner.bottom };
  });
  assert.equal(addRegionLayout.position, "static", "Add System expands inline");
  assert.equal(addRegionLayout.inside, true, "Add System remains inside Game Structure");
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-add-inline.png"), fullPage: true });
  await page.selectOption("#composition-add-select", "domain-core-data");
  await page.click("#composition-add-confirm");
  await assert.doesNotReject(() => page.locator('[data-composition-node^="domain-domain-core-data"].selected').waitFor());
  await assert.doesNotReject(() => page.locator(".composition-boundary", { hasText: "What this area owns" }).waitFor());
  await assert.doesNotReject(() => page.locator(".composition-settings", { hasText: "Domain Settings" }).waitFor());
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-domain-inspector.png"), fullPage: true });
  await page.click("#composition-add-toggle");
  await page.click('[data-add-kind="kit"]');
  await page.selectOption("#composition-add-select", "n-core-data-kit");
  await page.click("#composition-add-confirm");
  await assert.doesNotReject(() => page.locator('[data-composition-node^="kit-n-core-data-kit"].selected').waitFor());
  assert.equal(await page.locator("#composition-run-once").isDisabled(), true, "dirty drafts disable preview");
  assert.equal(await page.locator("#play").isDisabled(), true, "dirty drafts disable Play");
  assert.equal(await page.locator("#build").isDisabled(), true, "dirty drafts disable Build");
  await page.click("#composition-apply");
  await page.waitForFunction(() => window.__NEXUS_COMPOSITION__.dirty === false && window.__NEXUS_COMPOSITION__.validation.ok);

  await page.click("#composition-run-once");
  await page.waitForFunction(() => window.__NEXUS_COMPOSITION__.receipts.some((receipt) => receipt.registryId === undefined && receipt.verdict === "passed"), null, { timeout: 10000 });
  const passedReceipt = await page.evaluate(() => window.__NEXUS_COMPOSITION__.receipts.at(-1));
  assert.equal(passedReceipt.ok, true);
  assert.equal(passedReceipt.disposed, true);
  assert.deepEqual(passedReceipt.installOrder, ["n-core-data-kit"]);
  await assert.doesNotReject(() => page.locator(".preview-receipt.ok", { hasText: "passed" }).waitFor());
  await page.locator(".preview-receipt.ok").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-preview.png"), fullPage: true });

  await page.click("#play");
  await assert.doesNotReject(() => page.locator(".status-pill.playing", { hasText: "Running" }).waitFor());
  const playingLayout = await readWorkspaceLayout(page);
  assertWorkspaceFits(playingLayout, "playing focus");
  assert.deepEqual(playingLayout.regions.map((region) => region.selector), [".viewport-pane"], "Play shows only the relevant world region");
  assert.ok(playingLayout.viewport.area > playingLayout.width * playingLayout.height * .8, "Play maximizes the viewport");
  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-playing-focus.png"), fullPage: true });
  await page.click("#stop");
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__.mode === "stopped");

  // Node-reference safety blocks removing the Scene kit used by the default object.
  await page.click('[data-composition-node="kit-node-domain-scene"]');
  await page.click("#composition-remove");
  await assert.doesNotReject(() => page.locator(".composition-message", { hasText: "referenced" }).waitFor());
  assert.ok(await page.evaluate(() => window.__NEXUS_COMPOSITION__.tree.nodes.some((node) => node.id === "kit-node-domain-scene")));

  // Manifest-only project kits validate but never execute untrusted exports.
  await page.click("#composition-run-once");
  await page.waitForFunction(() => window.__NEXUS_COMPOSITION__.receipts.at(-1)?.verdict === "unavailable");
  assert.match(await page.locator(".composition-message").textContent(), /no trusted provider/i);

  // Save and load preserve accepted composition, while replacing later accepted edits.
  await page.click('[data-composition-node^="kit-n-core-data-kit"]');
  await page.fill("#composition-node-label", "Data Preview");
  await page.locator("#composition-node-label").dispatchEvent("change");
  await page.click("#composition-apply");
  await page.click("#project-actions-toggle");
  await page.click("#save");
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Saved" }).waitFor());
  await page.fill("#composition-node-label", "Unsaved Label");
  await page.locator("#composition-node-label").dispatchEvent("change");
  await page.click("#composition-apply");
  await page.click("#project-actions-toggle");
  await page.click("#load");
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Loaded" }).waitFor());
  const loadedLabel = await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.project.composition.nodes.find((node) => node.registryId === "n-core-data-kit")?.labelOverride);
  assert.equal(loadedLabel, "Data Preview");

  await page.click("#project-actions-toggle");
  await page.click("#build");
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__.build.status === "ready");
  const built = await page.evaluate(() => ({ html: window.__NEXUS_EDITOR_STATE__.build.html, manifest: JSON.parse(document.querySelector("#project-manifest").textContent) }));
  assert.match(built.html, /runtime-canvas/);
  assert.equal(built.manifest.version, "0.3.0");
  assert.equal(built.manifest.composition.schema, "nexusengine.composition-tree/1");
  assert.ok(built.manifest.domainStack.some((entry) => entry.kitId === "n-core-data-kit"), "legacy export projection includes accepted Core kit");

  const playablePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  playablePage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  playablePage.on("pageerror", (error) => pageErrors.push(error.message));
  await playablePage.goto(`${url}&project=/playable-fixture.project.json`, { waitUntil: "networkidle" });
  await playablePage.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.project?.playable?.id === "playable-fixture");
  assert.equal(await playablePage.locator("#play").getAttribute("title"), "Play the accepted composition");
  assert.equal(await playablePage.locator("#viewport-authoring-view option").count(), 2, "generated project exposes authored world and player views");
  assert.equal(await playablePage.locator(".default-cube, .camera-frustum, .transform-gizmo").count(), 0, "generated spatial maps do not receive legacy screen-space geometry proxies");
  await playablePage.locator("#viewport-authoring-view").selectOption("player-spawn");
  const playerCamera = await playablePage.evaluate(() => window.__NEXUS_VIEWPORT_RENDERER__.camera);
  assert.deepEqual(playerCamera.position, { x: 0, y: 1.72, z: 4 });
  assert.deepEqual(playerCamera.target, { x: 0, y: 1.72, z: -4 });
  const canvasBox = await playablePage.locator("#viewport-canvas").boundingBox();
  await playablePage.mouse.move(canvasBox.x + canvasBox.width * .5, canvasBox.y + canvasBox.height * .5);
  await playablePage.mouse.down();
  await playablePage.mouse.move(canvasBox.x + canvasBox.width * .65, canvasBox.y + canvasBox.height * .58, { steps: 6 });
  await playablePage.mouse.up();
  const orbitedCamera = await playablePage.evaluate(() => window.__NEXUS_VIEWPORT_RENDERER__.camera);
  assert.notDeepEqual(orbitedCamera.position, playerCamera.position, "dragging the authored viewport changes the persisted camera position");
  await playablePage.click("#play");
  const playableFrame = playablePage.locator("#playable-game-frame");
  await playableFrame.waitFor({ state: "visible" });
  await playableFrame.contentFrame().getByText("PLAYABLE FIXTURE READY").waitFor();
  assert.equal(await playablePage.locator(".scene-stage").getAttribute("data-content"), "playable-game");
  assert.equal(await playablePage.evaluate(() => window.__NEXUS_VIEWPORT_RENDERER__.type), "playable-project");
  await playablePage.click("#stop");
  await playablePage.waitForFunction(() => window.__NEXUS_EDITOR_STATE__.mode === "stopped");
  assert.equal(await playablePage.locator("#playable-game-frame").count(), 0, "Stop disposes the playable frame");
  await playablePage.close();

  await page.screenshot({ path: resolve(editorRoot, "dist", "registry-composer-smoke.png"), fullPage: true });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log("editor playwright smoke passed");
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
