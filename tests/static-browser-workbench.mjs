import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, extname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { verifyArtifact, stable, sha256 } from "../scripts/static-build-support.mjs";

// This is an EXECUTING release gate. It never writes "passed" from source-string checks.
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), staged = resolve(root, "dist");
const evidence = resolve(root, ".test-results"), reportPath = join(evidence, "static-browser.json");
await mkdir(evidence, { recursive: true });
const report = { status: "failed", artifactFingerprint: null, browser: null, checks: [], errors: [], warnings: [], network: [] };
let server, browser, localPreview, localHost, projectFolder;
const check = (name, details = {}) => report.checks.push({ name, status: "passed", ...details });
const sourceValue = snapshot => ({ projectId: snapshot.projectId,
  documents: Object.fromEntries(Object.entries(snapshot.documents).map(([id, { revision, ...d }]) => [id, d])),
  undo: snapshot.undo, redo: snapshot.redo, receipts: snapshot.receipts });
async function snapshot(page) { return page.evaluate(() => window.nexusWorkbench.host.project.getSnapshot()); }
async function ready(page) {
  await page.waitForFunction(() => window.nexusWorkbench && !window.nexusWorkbench.state.busy, { }, { timeout: 60000 });
  const error = await page.evaluate(() => window.nexusWorkbench.state.error);
  if (error) throw new Error(`GUI operation failed: ${JSON.stringify(error)}`);
}
async function pauseAction(page, label) { await page.getByRole("button", { name: label, exact: true }).click(); await ready(page); }
async function fixtureBytes() {
  // Independent producer: a Three-authored GLB, not the matching Nexus encoder.
  const THREE = await import("three"); const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  const previous = globalThis.FileReader;
  if (!previous) globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }, error => this.onerror?.(error)); }
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onloadend?.(); }, error => this.onerror?.(error)); }
  };
  try {
    const scene = new THREE.Scene(), box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .8 }));
    box.name = "Foreign box"; scene.add(box);
    return new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }));
  } finally { if (!previous) delete globalThis.FileReader; }
}
async function importThroughGui(page, bytes, name = "foreign.glb") {
  const pending = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "Import", exact: true }).click();
  await (await pending).setFiles({ name, mimeType: "model/gltf-binary", buffer: Buffer.from(bytes) }); await ready(page);
  await page.waitForFunction(() => !window.nexusWorkbench.state.busy && window.nexusWorkbench.state.data.assemblyId.startsWith("import-"), {}, { timeout: 60000 });
  await ready(page);
}
async function exportThroughGui(page, format, prefix) {
  const pending = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: format.toUpperCase(), exact: true }).click();
  const download = await pending; const failure = await download.failure(); assert.equal(failure, null);
  const path = join(evidence, `${prefix}-${format}-${download.suggestedFilename()}`); await download.saveAs(path); await ready(page);
  const bytes = new Uint8Array(await readFile(path)); assert.ok(bytes.length > 0);
  // These fixtures have no external textures. Resource ZIP transport is unit-tested separately.
  const { createEngine } = await import("nexusengine"), { createAuthoringDomain } = await import("nexusengine/domains/authoring");
  const engine = createEngine({ kits: createAuthoringDomain() });
  try {
    const result = await engine.n.authoringImport.inspect({ requestId: crypto.randomUUID(), prefix: "verified", format, bytes });
    assert.equal(result.validation.errors, 0); check(`${prefix}: actual ${format.toUpperCase()} download natively parsed`, { byteLength: bytes.length, hash: sha256(bytes), proof: "Core native parser, not Blender/Unity/OpenUSD" });
  } finally { engine.n.authoringSequence.dispose(); engine.n.authoringPublishing.clearCache(); }
}
try {
  // Invalidate an earlier success before any launch or package import can fail.
  await writeFile(reportPath, stable(report));
  const deployment = await verifyArtifact(staged, { strict: true }); report.artifactFingerprint = deployment.artifactFingerprint;
  report.deploymentHash = sha256(await readFile(join(staged, 'deployment.json')));
  report.sourceFingerprint = deployment.sourceFingerprint; report.coreCommit = deployment.coreCommit;
  const allowedFiles = new Set([...deployment.files.map(f => f.path), "deployment.json"]);
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost"), prefix = "/NexusEngine-Editor/";
      if (!url.pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
      const path = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
      if (!allowedFiles.has(path)) { response.writeHead(404).end(); return; }
      const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" }[extname(path)] ?? "application/octet-stream";
      response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }); response.end(await readFile(resolve(staged, path)));
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const origin = `http://127.0.0.1:${server.address().port}`, url = `${origin}/NexusEngine-Editor/`;
  const allowedOrigins = new Set([origin]);
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.route("**/*", route => {
    const target = new URL(route.request().url());
    if (["blob:", "data:"].includes(target.protocol) || allowedOrigins.has(target.origin)) return route.continue();
    report.errors.push(`Unexpected external request: ${target.href}`); return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); else if (message.type() === "warning") report.warnings.push(message.text()); });
  page.on("response", response => { report.network.push({ url: response.url(), status: response.status() }); if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  let projectKey = `proof-${crypto.randomUUID()}`;
  page.on("dialog", dialog => dialog.accept(dialog.type() === "prompt" ? projectKey : undefined));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await ready(page);
  assert.equal(await page.locator("#statusbar[data-boot-error]").count(), 0);
  const counts = await page.evaluate(() => window.nexusWorkbench.state.data.workbench.catalogSummary);
  assert.ok(counts.domains > 0 && counts.kits > 0); check("Static bundle boots with real Core registry", counts);
  await pauseAction(page, "New"); await page.getByTestId("create-box").click(); await ready(page);
  assert.equal(await page.locator("#outliner-list [data-node-id]").count(), 1);
  await page.locator("#outliner-list [data-node-id]").first().click();
  await page.getByRole("spinbutton", { name: "translation X", exact: true }).fill("2"); await page.keyboard.press("Tab"); await ready(page);
  const beforeImport = await snapshot(page); assert.ok(Object.values(beforeImport.documents).some(d => d.kind === "assembly" && d.content.nodes[0].transform.translation[0] === 2));
  check("Create and edit through GUI");
  await importThroughGui(page, await fixtureBytes()); check("Independent Three GLB imports through GUI");
  await page.locator("#outliner-list [data-node-id]").first().click();
  await page.getByRole("spinbutton", { name: "translation X", exact: true }).fill("1.5"); await page.keyboard.press("Tab"); await ready(page);
  await pauseAction(page, "Save"); const saved = sourceValue(await snapshot(page));
  await page.reload({ waitUntil: "networkidle" }); await ready(page);
  assert.deepEqual(sourceValue(await snapshot(page)), saved); assert.equal(await page.evaluate(() => window.nexusWorkbench.state.data.status.dirty), false);
  check("Actual IndexedDB save, browser reload, restore, history and content");
  await page.screenshot({ path: join(evidence, "static-authoring.png") });
  const beforePlay = await snapshot(page); await page.getByTestId("play").click(); await ready(page);
  await page.getByTestId("stop").click(); await ready(page); assert.deepEqual(await snapshot(page), beforePlay); check("Play/Stop preserves original source");
  for (const format of ["glb", "fbx", "usdz"]) await exportThroughGui(page, format, "static");

  projectKey = `game-${crypto.randomUUID()}`; await pauseAction(page, "New"); await pauseAction(page, "Proof Game");
  const gameBefore = await snapshot(page); await page.getByTestId("play").click(); await ready(page);
  assert.equal(await page.evaluate(() => window.nexusWorkbench.provider.inspect().viewMode), "game");
  await page.locator("#viewport").focus(); await page.keyboard.down("d");
  await page.waitForFunction(async () => (await window.nexusWorkbench.rpc("play-frame")).nodes.some(n => n.id === "player-node" && n.transform.translation[0] > .1), {}, { timeout: 30000 });
  await page.keyboard.up("d"); await page.getByTestId("pause").click(); await ready(page);
  const ticks = await page.evaluate(() => window.nexusWorkbench.state.data.workbench.play.ticks); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(async () => (await window.nexusWorkbench.rpc("play-frame")).status.ticks), ticks);
  assert.ok(await page.evaluate(() => window.nexusWorkbench.provider.inspect().renderer.triangles > 0));
  await page.screenshot({ path: join(evidence, "static-game.png") });
  await page.getByTestId("pause").click(); await ready(page); await page.getByTestId("stop").click(); await ready(page);
  assert.deepEqual(await snapshot(page), gameBefore); check("Actual Three.js Game View renders; keyboard moves clone; pause/resume/stop isolate source", { behavior: "preview transform motion, not physics solver" });

  // Execute the SAME compiled GUI against the real local-host adapter, not a duplicate UI.
  const { createAuthoringHost } = await import("../src/authoring/host.js");
  const { startAuthoringPreview } = await import("../src/authoring/preview/localhost-server.js");
  projectFolder = await mkdtemp(join(tmpdir(), "nexus-editor-gui-"));
  localHost = await createAuthoringHost({ projectDirectory: projectFolder });
  localPreview = await startAuthoringPreview({ host: localHost, outputDirectory: join(projectFolder, "exports") });
  allowedOrigins.add(new URL(localPreview.url).origin); projectKey = projectFolder;
  await page.goto(localPreview.url, { waitUntil: "networkidle", timeout: 60000 }); await ready(page);
  await page.getByTestId("create-box").click(); await ready(page); await pauseAction(page, "Save");
  const localBefore = sourceValue(localPreview.host.snapshot()); await pauseAction(page, "Open");
  assert.deepEqual(sourceValue(localPreview.host.snapshot()), localBefore);
  await importThroughGui(page, await fixtureBytes()); await pauseAction(page, "Save");
  const protectedLocal = localPreview.host.snapshot(); await page.getByTestId("play").click(); await ready(page);
  await page.getByTestId("stop").click(); await ready(page); assert.deepEqual(localPreview.host.snapshot(), protectedLocal);
  for (const format of ["glb", "fbx", "usdz"]) await exportThroughGui(page, format, "local");
  await page.screenshot({ path: join(evidence, "local-authoring.png") }); check("Same GUI works through actual local server, filesystem reopen, import, Play/Stop and exports");
  assert.deepEqual(report.errors, []);
  await verifyArtifact(staged, { strict: true });
  assert.equal(sha256(await readFile(join(staged, 'deployment.json'))), report.deploymentHash, 'Deployment metadata changed while testing.');
  report.status = "passed";
} catch (error) {
  report.errors.push(error.stack ?? error.message); process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch {}
  try { await localPreview?.close(); await localHost?.close(); } catch (error) { report.errors.push(error.message); report.status = "failed"; process.exitCode = 1; }
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  if (projectFolder) await rm(projectFolder, { recursive: true, force: true });
  await writeFile(reportPath, stable(report)); console.log(stable(report));
}
