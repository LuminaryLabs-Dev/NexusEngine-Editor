import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const root = resolve(process.cwd());
const execFileAsync = promisify(execFile);
const executablePath = existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-web-security", "--allow-file-access-from-files"]
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("nexusengine-editor:project-snapshot");
    } catch {}
  });
  await page.goto(pathToFileURL(resolve(root, "index.html")).href);
  await page.waitForFunction(() => Array.isArray(window.__NEXUS_EDITOR_RUNTIME__?.installOrder), null, { timeout: 10000 });
  await assert.doesNotReject(() => page.locator("text=Starter 3D Scene").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("text=Domain Stack").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("text=Configure").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("text=Sequence Timeline").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("#viewport-canvas").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator(".default-cube").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator('[data-domain="n:physics"].selected').waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("#kit-select").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator(".kit-child-preview", { hasText: "selection-domain-service-kit" }).waitFor({ timeout: 5000 }));
  await page.click('[data-viewport-tool="move"]');
  await assert.doesNotReject(() => page.locator(".viewport-transform-pad", { hasText: "move" }).waitFor({ timeout: 5000 }));
  await page.click('[data-transform-axis="x"][data-transform-direction="1"]');
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.project?.scene3d?.objects?.[0]?.transform?.position?.x === 0.25, null, { timeout: 5000 });
  await page.click('[data-viewport-tool="rotate"]');
  await page.click('[data-transform-axis="y"][data-transform-direction="1"]');
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.project?.scene3d?.objects?.[0]?.transform?.rotation?.y > 0.26, null, { timeout: 5000 });
  await page.click('[data-viewport-tool="scale"]');
  await page.click('[data-transform-axis="z"][data-transform-direction="-1"]');
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.project?.scene3d?.objects?.[0]?.transform?.scale?.z === 0.9, null, { timeout: 5000 });

  await page.click('[data-domain="n:render:three"]');
  await assert.doesNotReject(() => page.locator('[data-domain="n:render:three"].selected').waitFor({ timeout: 5000 }));
  assert.equal(await page.locator(".overlay-panel .drag-handle").count(), 0);
  const dockRects = await page.evaluate(() => {
    const viewport = document.querySelector(".editor-viewport").getBoundingClientRect();
    const domain = document.querySelector('[data-panel="domainStack"]').getBoundingClientRect();
    const configure = document.querySelector('[data-panel="configure"]').getBoundingClientRect();
    const sequence = document.querySelector('[data-panel="sequence"]').getBoundingClientRect();
    return {
      viewport: { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom },
      domain: { left: domain.left, top: domain.top },
      configure: { right: configure.right, top: configure.top },
      sequence: { bottom: sequence.bottom }
    };
  });
  assert.ok(dockRects.domain.left - dockRects.viewport.left < 80);
  assert.ok(dockRects.domain.top - dockRects.viewport.top < 120);
  assert.ok(dockRects.viewport.right - dockRects.configure.right < 130);
  assert.ok(dockRects.configure.top - dockRects.viewport.top < 140);
  assert.ok(dockRects.viewport.bottom - dockRects.sequence.bottom < 90);
  await page.click("#add-kit");
  await assert.doesNotReject(() => page.locator("#kit-select").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator(".kit-detail", { hasText: "Spatial Authoring Bundle" }).waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("text=provides").waitFor({ timeout: 5000 }));
  await page.selectOption("#kit-select", "audio-feedback-domain-kit");
  await assert.doesNotReject(() => page.locator(".kit-detail-head small", { hasText: "audio-feedback-domain-kit" }).waitFor({ timeout: 5000 }));
  assert.equal(await page.locator("#install-kit").count(), 0);
  assert.equal(await page.locator("#install-bundle").count(), 0);
  await assert.doesNotReject(() => page.locator(".kit-picker-actions code", { hasText: "operations submit install-kit" }).waitFor({ timeout: 5000 }));
  const kitMutationMode = await page.evaluate(() => window.__NEXUS_EDITOR_RUNTIME__?.kitMutationMode);
  assert.equal(kitMutationMode, "read-only");
  const browserInstallBlocked = await page.evaluate(() => {
    try {
      window.__NEXUS_EDITOR_STATE__.editorRuntime.getBinding("domainStack").addKit("audio-feedback-domain-kit");
      return false;
    } catch (error) {
      return /CLI-only/.test(error.message);
    }
  });
  assert.equal(browserInstallBlocked, true);
  await page.fill("#domain-stack-search", "physics");
  await page.locator("#domain-stack-search").dispatchEvent("change");
  await assert.doesNotReject(() => page.locator('[data-domain="n:physics"]').waitFor({ timeout: 5000 }));
  await page.fill("#domain-stack-search", "");
  await page.locator("#domain-stack-search").dispatchEvent("change");
  await page.click("#map-view");
  await assert.doesNotReject(() => page.locator('.domain-map-node[data-domain="n:physics"]').waitFor({ timeout: 5000 }));
  await page.click("#stack-view");
  await page.click("#select-cube");
  await assert.doesNotReject(() => page.locator('.configure-panel .object-section').filter({ hasText: "Scene Objects" }).first().waitFor({ timeout: 5000 }));
  await page.click("#add-object");
  await assert.doesNotReject(() => page.locator('[data-object="cube-02"]').waitFor({ timeout: 5000 }));
  await page.click("#add-object-group");
  await page.fill("#object-search", "cube-27");
  await assert.doesNotReject(() => page.locator('[data-object="cube-27"]').waitFor({ timeout: 5000 }));
  await page.click('[data-object="cube-27"]');
  await assert.doesNotReject(() => page.locator('[data-object="cube-27"].selected').waitFor({ timeout: 5000 }));
  await page.click("#duplicate-object");
  await assert.doesNotReject(() => page.locator('[data-object="cube-28"]').waitFor({ timeout: 5000 }));
  await page.click("#delete-object");
  await page.fill("#object-search", "cube-02");
  await assert.doesNotReject(() => page.locator('[data-object="cube-02"]').waitFor({ timeout: 5000 }));
  await page.click('[data-object="cube-02"]');
  await page.fill("#object-position-x", "3.5");
  await page.locator("#object-position-x").dispatchEvent("change");
  await page.fill("#object-search", "cube-2");
  await page.click('[data-domain="n:physics"]');
  await assert.doesNotReject(() => page.locator("#assign-visible-kit").waitFor({ timeout: 5000 }));
  await page.click("#assign-visible-kit");
  await page.click("#add-step");
  await assert.doesNotReject(() => page.locator('[data-step="step-04"]').waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("#config-sequence-label").waitFor({ timeout: 5000 }));
  await page.fill("#config-sequence-label", "Input Export Step");
  await page.locator("#config-sequence-label").dispatchEvent("change");
  await page.selectOption("#config-sequence-source-domain", "n:input");
  await page.waitForFunction(() => Boolean(document.querySelector('#config-sequence-event option[value="input:pointer"]')), null, { timeout: 5000 });
  await page.selectOption("#config-sequence-event", "input:pointer");
  await page.selectOption("#config-sequence-target-domain", "n:build:web");
  await page.waitForFunction(() => Boolean(document.querySelector('#config-sequence-target-output option[value="export:html"]')), null, { timeout: 5000 });
  await page.selectOption("#config-sequence-target-output", "export:html");
  await page.click("#config-link-event");
  await assert.doesNotReject(() => page.locator('[data-step="step-04"]', { hasText: "Input Export Step" }).waitFor({ timeout: 5000 }));
  await page.click("#validate-sequence");
  await assert.doesNotReject(() => page.locator("text=editor.sequence.validated").waitFor({ timeout: 5000 }));
  await page.click("#run-step");
  await assert.doesNotReject(() => page.locator(".sequence-playback", { hasText: "1 receipts" }).waitFor({ timeout: 5000 }));
  await page.click("#run-sequence");
  await assert.doesNotReject(() => page.locator(".sequence-playback", { hasText: "complete" }).waitFor({ timeout: 5000 }));
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.sequencePlayback?.receipts?.length >= 4, null, { timeout: 5000 });
  await page.click("#save");
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Saved" }).waitFor({ timeout: 5000 }));
  await page.click('[data-domain="n:scene"]');
  await page.click("#add-object");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 28, null, { timeout: 5000 });
  await assert.doesNotReject(() => page.locator("#load:not([disabled])").waitFor({ timeout: 5000 }));
  await page.click("#load");
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Loaded" }).waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator('[data-domain="n:input"]').waitFor({ timeout: 5000 }));
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.sequencePlayback?.status === "complete", null, { timeout: 5000 });
  await page.click('[data-domain="n:scene"]');
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 27, null, { timeout: 5000 });
  await page.fill("#object-search", "cube-02");
  await assert.doesNotReject(() => page.locator('[data-object="cube-02"]').waitFor({ timeout: 5000 }));
  await page.fill("#object-search", "");
  await page.fill("#object-batch-size", "250");
  await page.locator("#object-batch-size").dispatchEvent("change");
  await page.selectOption("#object-visible-limit", "25");
  await page.click("#add-object-group");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 277, null, { timeout: 7000 });
  await assert.doesNotReject(() => page.locator(".scene-scale", { hasText: "252 hidden" }).waitFor({ timeout: 5000 }));
  await page.fill("#object-search", "cube-277");
  await assert.doesNotReject(() => page.locator('[data-object="cube-277"]').waitFor({ timeout: 5000 }));
  await page.fill("#object-search", "");
  await page.fill("#object-batch-size", "120");
  await page.locator("#object-batch-size").dispatchEvent("change");
  await page.selectOption("#scene-preset-select", "physics-stress-grid-preset");
  await assert.doesNotReject(() => page.locator(".scene-preset-meta", { hasText: "Physics Stress Grid" }).waitFor({ timeout: 5000 }));
  await page.click("#apply-scene-preset");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 397, null, { timeout: 7000 });
  await assert.doesNotReject(() => page.locator(".scene-scale", { hasText: "397 objects" }).waitFor({ timeout: 5000 }));
  await page.fill("#object-search", "Physics Stress Grid 120");
  await assert.doesNotReject(() => page.locator('[data-object="cube-397"]').waitFor({ timeout: 5000 }));
  await page.fill("#object-search", "");
  await page.click("#save");
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Saved" }).waitFor({ timeout: 5000 }));
  await page.click("#add-object");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 398, null, { timeout: 5000 });
  await page.click("#load");
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Loaded" }).waitFor({ timeout: 5000 }));
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 397, null, { timeout: 7000 });
  await page.click('[data-domain="n:render:three"]');
  await assert.doesNotReject(() => page.locator("#viewport-max-drawn").waitFor({ timeout: 5000 }));
  await page.fill("#viewport-max-drawn", "90");
  await page.locator("#viewport-max-drawn").dispatchEvent("change");
  await assert.doesNotReject(() => page.locator("#viewport-stats", { hasText: "90 drawn" }).waitFor({ timeout: 5000 }));
  await page.waitForFunction(() => window.__NEXUS_VIEWPORT_RENDERER__?.stats?.drawnObjects === 90 && window.__NEXUS_VIEWPORT_RENDERER__?.stats?.culledObjects === 307, null, { timeout: 5000 });
  await page.click('[data-domain="n:build:web"]');
  await assert.doesNotReject(() => page.locator("#build-max-drawn").waitFor({ timeout: 5000 }));
  await page.fill("#build-max-drawn", "120");
  await page.locator("#build-max-drawn").dispatchEvent("change");
  await assert.doesNotReject(() => page.locator(".scene-scale", { hasText: "120 max drawn" }).waitFor({ timeout: 5000 }));
  await page.click('[data-domain="n:persistence"]');
  await assert.doesNotReject(() => page.locator("#export-project").waitFor({ timeout: 5000 }));
  const downloadPromise = page.waitForEvent("download");
  await page.click("#export-project");
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.project\.json$/);
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Exported" }).waitFor({ timeout: 5000 }));
  const projectJson = await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.projectPersistence.lastExportJson);
  assert.match(projectJson, /"scene3d"/);
  await page.click('[data-domain="n:scene"]');
  await page.click("#add-object");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 398, null, { timeout: 5000 });
  await page.click('[data-domain="n:persistence"]');
  await page.setInputFiles("#project-file-input", {
    name: "restored.project.json",
    mimeType: "application/json",
    buffer: Buffer.from(projectJson)
  });
  await assert.doesNotReject(() => page.locator(".status-pill", { hasText: "Imported" }).waitFor({ timeout: 5000 }));
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 397, null, { timeout: 7000 });
  await page.click('[data-domain="n:build:web"]');
  await assert.doesNotReject(() => page.locator("#build-max-drawn").waitFor({ timeout: 5000 }));

  await page.click("#play");
  await assert.doesNotReject(() => page.locator(".status-pill.playing").waitFor({ timeout: 5000 }));
  await page.click("#build");
  await assert.doesNotReject(() => page.locator("text=n-game-starter.html").first().waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("#download:not([disabled])").waitFor({ timeout: 5000 }));
  const builtHtml = await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.build.html);
  assert.match(builtHtml, /runtime-canvas/);
  assert.match(builtHtml, /renderStats/);
  assert.match(builtHtml, /Physics Stress Grid/);
  assert.match(builtHtml, /max draw 120/);

  const runtimeManifest = await page.locator("#project-manifest").textContent();
  const parsed = JSON.parse(runtimeManifest);
  assert.equal(parsed.viewport.mode, "3d");
  assert.equal(parsed.domainStackHealth.ok, true);
  assert.equal(parsed.scene3d.objects[0].label, "Default Cube");
  assert.equal(parsed.scene3d.objects.length, 397);
  assert.equal(parsed.scene3d.authoringPresets[0].presetId, "physics-stress-grid-preset");
  assert.equal(parsed.scene3d.authoringPresets[0].count, 120);
  assert.equal(parsed.runtime.maxDrawnObjects, 120);
  assert.equal(parsed.runtime.culling, "distance-window");
  assert.equal(parsed.scene3d.objects[1].transform.position.x, 3.5);
  assert.ok(parsed.scene3d.objects[1].domainKits.includes("n:physics"));
  assert.equal(parsed.scene3d.objects[1].components.physics.domainPath, "n:physics");
  const cube20 = parsed.scene3d.objects.find((object) => object.id === "cube-20");
  assert.ok(cube20.domainKits.includes("n:physics"));
  assert.equal(cube20.components.physics.domainPath, "n:physics");
  assert.ok(parsed.scene3d.objects.some((object) => object.id === "cube-277"));
  const cube397 = parsed.scene3d.objects.find((object) => object.id === "cube-397");
  assert.ok(cube397.domainKits.includes("n:physics"));
  assert.equal(cube397.components.scenePreset.presetId, "physics-stress-grid-preset");
  assert.ok(parsed.sequenceSteps.length >= 4);
  const linkedStep = parsed.sequenceSteps.find((step) => step.id === "step-04");
  assert.equal(linkedStep.label, "Input Export Step");
  assert.equal(linkedStep.domainPath, "n:input");
  assert.equal(linkedStep.event, "input:pointer");
  assert.equal(linkedStep.targetDomainPath, "n:build:web");
  assert.equal(linkedStep.targetOutput, "export:html");
  assert.equal(parsed.sequenceGraph.ok, true);
  const playback = await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.sequencePlayback);
  assert.equal(playback.status, "complete");
  assert.ok(playback.receipts.some((receipt) => receipt.event === "input:pointer"));
  const renderer = await page.evaluate(() => window.__NEXUS_VIEWPORT_RENDERER__?.type);
  assert.equal(renderer, "webgl");
  const viewportStats = await page.evaluate(() => window.__NEXUS_VIEWPORT_RENDERER__?.stats);
  assert.equal(viewportStats.drawnObjects, 90);
  assert.equal(viewportStats.culledObjects, 307);
  assert.equal(viewportStats.maxDrawnObjects, 90);
  const runtime = await page.evaluate(() => window.__NEXUS_EDITOR_RUNTIME__);
  assert.ok(runtime.source === "fallback:compatible-nexusrealtime" || runtime.source.includes("NexusRealtime"));
  assert.deepEqual(runtime.installOrder, [
    "editor-composition-kit",
    "editor-kit-registry-kit",
    "editor-kit-installer-kit",
    "editor-domain-stack-kit",
    "editor-scene-object-kit",
    "editor-scene-preset-kit",
    "editor-selection-kit",
    "editor-sequence-timeline-kit",
    "editor-game-template-kit",
    "editor-runtime-interaction-kit",
    "editor-project-persistence-kit",
    "editor-html-build-kit"
  ]);
  const canvasSize = await page.locator("#viewport-canvas").evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  assert.ok(canvasSize.width > 0);
  assert.ok(canvasSize.height > 0);

  await page.click('[data-domain="n:scene"]');
  await assert.doesNotReject(() => page.locator("#game-template-select").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator(".game-template-meta", { hasText: "Chess Board" }).waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator("#apply-game-template:disabled").waitFor({ timeout: 5000 }));
  await assert.doesNotReject(() => page.locator(".game-template-meta code", { hasText: "operations submit game-template" }).waitFor({ timeout: 5000 }));
  const browserTemplateBlocked = await page.evaluate(() => {
    try {
      window.__NEXUS_EDITOR_STATE__.editorRuntime.getBinding("gameTemplate").apply();
      return false;
    } catch (error) {
      return /CLI-only/.test(error.message);
    }
  });
  assert.equal(browserTemplateBlocked, true);

  await page.click("#new-project");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 1, null, { timeout: 5000 });
  await page.click('[data-domain="n:scene"]');
  await page.fill("#object-batch-size", "16");
  await page.locator("#object-batch-size").dispatchEvent("change");
  await page.selectOption("#scene-preset-select", "platform-run-preset");
  await assert.doesNotReject(() => page.locator(".scene-preset-meta", { hasText: "Platform Run" }).waitFor({ timeout: 5000 }));
  await page.click("#apply-scene-preset");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 17, null, { timeout: 7000 });
  await assert.doesNotReject(() => page.locator(".scene-scale", { hasText: "17 objects" }).waitFor({ timeout: 5000 }));
  await page.click("#save");
  await page.waitForFunction(() => window.__NEXUS_EDITOR_STATE__?.projectPersistence?.status === "saved", null, { timeout: 5000 });
  await page.click("#build");
  const platformHtml = await page.evaluate(() => window.__NEXUS_EDITOR_STATE__.build.html);
  assert.match(platformHtml, /Platform Run/);
  const platformManifest = JSON.parse(await page.locator("#project-manifest").textContent());
  assert.equal(platformManifest.scene3d.objects.length, 17);
  assert.equal(platformManifest.scene3d.authoringPresets.at(-1).presetId, "platform-run-preset");
  assert.equal(platformManifest.scene3d.authoringPresets.at(-1).count, 16);
  assert.ok(platformManifest.scene3d.objects.some((object) => object.components.platformRun?.role === "checkpoint"));
  const generatedPlatformGame = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await generatedPlatformGame.setContent(platformHtml, { waitUntil: "load" });
  await assert.doesNotReject(() => generatedPlatformGame.locator("text=Platform Run 001").waitFor({ timeout: 5000 }));
  await generatedPlatformGame.close();
  await page.click("#new-project");
  await page.waitForFunction(() => JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length === 1, null, { timeout: 5000 });
  const resetStatus = await page.evaluate(() => ({
    status: window.__NEXUS_EDITOR_STATE__?.projectPersistence?.status,
    text: document.querySelector(".status-pill")?.textContent ?? "",
    objectCount: JSON.parse(document.querySelector("#project-manifest").textContent).scene3d.objects.length
  }));
  assert.equal(resetStatus.status, "reset", JSON.stringify(resetStatus));
  assert.match(resetStatus.text, /New/, JSON.stringify(resetStatus));

  const cliResult = await execFileAsync(process.execPath, [
    "scripts/nexus-engine-editor-cli.mjs",
    "operations",
    "submit",
    "gem-collector-game",
    "--param",
    "html=dist/games/playwright-gem-collector.html",
    "--param",
    "project=dist/games/playwright-gem-collector.project.json",
    "--json"
  ], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  const cliReport = JSON.parse(cliResult.stdout);
  assert.equal(cliReport.ok, true);
  assert.equal(cliReport.kitMutationMode, "cli");
  assert.equal(cliReport.domainPath, "n:game:gem-collector");
  const gemHtml = await readFile(resolve(root, "dist/games/playwright-gem-collector.html"), "utf8");
  assert.match(gemHtml, /Nexus Gem Collector/);
  assert.match(gemHtml, /recordInteractionHit/);
  const gemSnapshot = JSON.parse(await readFile(resolve(root, "dist/games/playwright-gem-collector.project.json"), "utf8"));
  const gemManifest = gemSnapshot.project;
  assert.equal(gemManifest.domainPath, "n:game:gem-collector");
  assert.equal(gemManifest.scene3d.runtimeInteraction.domainPath, "n:runtime:interaction");
  assert.equal(gemManifest.scene3d.objects.filter((object) => object.components.runtimeClickable).length, 12);
  const generatedGemGame = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await generatedGemGame.setContent(gemHtml, { waitUntil: "load" });
  await generatedGemGame.waitForFunction(() => typeof window.__NEXUS_DSK_GAME__?.recordInteractionHit === "function", null, { timeout: 5000 });
  const gemClickResult = await generatedGemGame.evaluate(() => {
    const game = window.__NEXUS_DSK_GAME__;
    const gem = game.scene.objects.find((object) => object.components?.runtimeClickable);
    const first = game.recordInteractionHit(gem);
    const second = game.recordInteractionHit(gem);
    return {
      firstScore: first?.score,
      secondDelivered: Boolean(second),
      receiptCount: game.sequenceReceipts.length,
      score: game.interactionState.score
    };
  });
  assert.equal(gemClickResult.firstScore, 25);
  assert.equal(gemClickResult.secondDelivered, false);
  assert.ok(gemClickResult.receiptCount >= gemManifest.sequenceSteps.length + 1);
  assert.equal(gemClickResult.score, 25);
  await generatedGemGame.close();

  console.log("editor playwright smoke passed");
} finally {
  await browser.close();
}
