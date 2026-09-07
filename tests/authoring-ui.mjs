import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createAuthoringHost } from "../src/authoring/host.js";
import { createFileProjectStore } from "../src/authoring/storage/file-project.js";
import { startAuthoringPreview } from "../src/authoring/preview/localhost-server.js";
const directory = await mkdtemp(join(tmpdir(), "nexus-authoring-ui-"));
const host = await createAuthoringHost({
  store: await createFileProjectStore(directory),
});
let browser, server;
try {
  server = await startAuthoringPreview({
    host,
    outputDirectory: join(directory, "exports"),
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.NEXUS_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.url);
  await page.waitForFunction(
    () =>
      window.nexusAuthoringClient?.ready || window.nexusAuthoringClient?.error,
  );
  assert.equal(
    await page.evaluate(() => window.nexusAuthoringClient.error),
    null,
  );
  const click = async (id) => {
    const target = await page.evaluate(
      (id) => window.nexusAuthoringClient.layout.find((b) => b.id === id),
      id,
    );
    assert.ok(target, id);
    await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
  };
  await click("cube");
  await page.waitForFunction(
    () =>
      window.nexusAuthoringClient.state.documents.some(
        (d) => d.kind === "mesh",
      ) || window.nexusAuthoringClient.error,
  );
  assert.equal(
    await page.evaluate(() => window.nexusAuthoringClient.error),
    null,
  );
  await page.waitForFunction(
    () => window.nexusAuthoringClient.provider.inspect().meshes.length === 1,
  );
  const mesh = host.list("mesh")[0],
    before = host.read(mesh.id).content;
  await click("face-up");
  await page.waitForFunction(
    () =>
      window.nexusAuthoringClient.state.documents.some(
        (d) => d.id === "editor-face-selection",
      ) || window.nexusAuthoringClient.error,
  );
  assert.equal(
    await page.evaluate(() => window.nexusAuthoringClient.error),
    null,
  );
  assert.notDeepEqual(host.read(mesh.id).content, before);
  await page.waitForTimeout(100);
  await click("undo");
  await page.waitForFunction(
    () =>
      !window.nexusAuthoringClient.state.documents.some(
        (d) => d.id === "editor-face-selection",
      ),
  );
  assert.deepEqual(host.read(mesh.id).content, before);
  await page.waitForTimeout(100);
  await click("redo");
  await page.waitForFunction(() =>
    window.nexusAuthoringClient.state.documents.some(
      (d) => d.id === "editor-face-selection",
    ),
  );
  const after = host.read(mesh.id).content;
  assert.notDeepEqual(after, before);
  await page.waitForTimeout(100);
  await click("material");
  await page.waitForFunction(() =>
    window.nexusAuthoringClient.state.documents.some(
      (d) => d.kind === "material",
    ),
  );
  await page.waitForTimeout(200);
  await click("save");
  await page.waitForFunction(
    () => !window.nexusAuthoringClient.state.status.dirty,
  );
  assert.equal(host.status().dirty, false);
  await click("export");
  await page.waitForFunction(
    () =>
      window.nexusAuthoringClient.error ||
      (document.querySelector("#interface") &&
        window.nexusAuthoringClient.state.status.state === "ready"),
  );
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(() => window.nexusAuthoringClient.error),
    null,
  );
  if (process.env.AUTHORING_EVIDENCE_DIRECTORY) {
    await mkdir(process.env.AUTHORING_EVIDENCE_DIRECTORY, { recursive: true });
    await page.screenshot({
      path: join(
        process.env.AUTHORING_EVIDENCE_DIRECTORY,
        "authoring-editor.png",
      ),
    });
  }
  await page.waitForFunction(() => !window.nexusAuthoringClient.busy);
  const nextDirectory = join(directory, "second-project");
  async function projectAction(id, path) {
    await click(id);
    await page.waitForFunction(() => !window.nexusAuthoringClient.busy);
    await page.keyboard.press("Control+a");
    await page.keyboard.type(JSON.stringify({ directory: path }));
    await page.keyboard.press("Control+Enter");
    await page.waitForFunction(() => !window.nexusAuthoringClient.busy);
    assert.equal(
      await page.evaluate(() => window.nexusAuthoringClient.error),
      null,
    );
  }
  await projectAction("new-project", nextDirectory);
  assert.equal(server.host.list("mesh").length, 0);
  await click("torus");
  await page.waitForFunction(() => !window.nexusAuthoringClient.busy);
  assert.equal(server.host.list("mesh").length, 1);
  await projectAction("open-project", directory);
  assert.deepEqual(server.host.read(mesh.id).content, after);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(() => !window.nexusAuthoringClient.busy);
  assert.equal(
    await page.evaluate(
      () => window.nexusAuthoringClient.provider.inspect().meshes.length,
    ),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Authoring Canvas client: create, instance selection, face edit, undo/redo, material, save, and GLB export passed.",
  );
} finally {
  await browser?.close();
  await server?.close();
  await host.close();
  await rm(directory, { recursive: true, force: true });
}
