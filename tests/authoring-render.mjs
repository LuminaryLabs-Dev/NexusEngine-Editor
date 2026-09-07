import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createAuthoringHost } from "../src/authoring/host.js";
import { startAuthoringPreview } from "../src/authoring/preview/localhost-server.js";
const host = await createAuthoringHost();
let next = 0;
const command = (id, args) =>
    host.command({
      requestId: `render-${next++}`,
      epoch: host.status().context.epoch,
      operations: [{ id, args }],
    }),
  edit = (id, args) =>
    command(id, { expectedRevision: host.read(args.id).revision, ...args });
await command("mesh.cube", { id: "cube" });
await edit("uv.unwrap", {
  id: "cube",
  parameters: { resolution: 64, padding: 2 },
});
await command("paint.set", {
  id: "image",
  content: {
    width: 32,
    height: 32,
    colorSpace: "srgb",
    layers: [
      {
        id: "base",
        opacity: 1,
        blend: "normal",
        color: [1, 0.15, 0.03, 1],
        tiles: {},
      },
    ],
  },
});
await command("material.set", {
  id: "material",
  content: { roughness: 0.4, textures: { baseColor: { imageId: "image" } } },
});
await command("assembly.set", {
  id: "scene",
  content: {
    nodes: [
      {
        id: "cube-object",
        name: "Cube",
        meshId: "cube",
        materials: ["material"],
      },
    ],
  },
});
const server = await startAuthoringPreview({
  host,
  ui: false,
  view: {
    width: 640,
    height: 480,
    camera: { position: [4, 3, 5], target: [0, 0, 0], yfov: Math.PI / 4 },
  },
});
let browser;
try {
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
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(
    () =>
      window.nexusAuthoringPreview?.ready ||
      window.nexusAuthoringPreview?.error,
  );
  assert.equal(
    await page.evaluate(() => window.nexusAuthoringPreview.error),
    null,
  );
  assert.deepEqual(errors, []);
  const stats = await page.evaluate(() =>
    window.nexusAuthoringPreview.provider.inspect(),
  );
  assert.equal(stats.meshes[0].vertices, 36);
  assert.equal(stats.meshes[0].materials[0].baseTexture, true);
  const first = await page.screenshot(),
    pixels = PNG.sync.read(first).data;
  let colored = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i] > pixels[i + 1] * 1.3 && pixels[i] > pixels[i + 2] * 1.3)
      colored++;
  assert.ok(
    colored > 10000,
    `Expected a visibly textured cube, found ${colored} colored pixels.`,
  );
  const sourceBefore = host.snapshot();
  await page.evaluate(() => window.nexusAuthoringPreview.provider.render());
  assert.deepEqual(host.snapshot(), sourceBefore);
  await edit("paint.fill", {
    id: "image",
    layerId: "base",
    color: [0.03, 0.2, 1, 1],
  });
  await page.evaluate(async () => {
    const state = await (await fetch("/state")).json();
    await window.nexusAuthoringPreview.provider.load("/preview.glb?second", {
      ...state.view,
      width: 640,
      height: 480,
    });
  });
  const second = await page.screenshot();
  assert.notEqual(
    createHash("sha256").update(first).digest("hex"),
    createHash("sha256").update(second).digest("hex"),
  );
  if (process.env.AUTHORING_EVIDENCE_DIRECTORY) {
    await mkdir(process.env.AUTHORING_EVIDENCE_DIRECTORY, { recursive: true });
    await page.screenshot({
      path: join(
        process.env.AUTHORING_EVIDENCE_DIRECTORY,
        "authoring-cube.png",
      ),
    });
  }
  await page.evaluate(() => window.nexusAuthoringPreview.provider.dispose());
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      test: "Authoring actual GLB rendering",
      browser: await browser.version(),
      coloredPixels: colored,
      meshes: stats.meshes.length,
      renderer: stats.renderer,
      causalTextureChange: true,
    }),
  );
} finally {
  await browser?.close();
  await server.close();
  await host.close();
}
