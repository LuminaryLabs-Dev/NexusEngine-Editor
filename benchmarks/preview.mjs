import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import {
  createAuthoringHost,
  encodeAuthoringGLB,
} from "../src/authoring/index.js";
import { startAuthoringPreview } from "../src/authoring/preview/localhost-server.js";
const results = [],
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
try {
  for (const profile of ["mesh-10000", "mesh-100000", "image-4096"]) {
    const host = await createAuthoringHost();
    let server;
    try {
      let index = 0;
      const command = (id, args) =>
        host.command({
          requestId: `preview-${index++}`,
          epoch: host.status().context.epoch,
          operations: [{ id, args }],
        });
      if (profile.startsWith("mesh"))
        await command("mesh.primitive", {
          id: "mesh",
          parameters: {
            type: "grid",
            size: 10,
            widthSegments: profile === "mesh-10000" ? 99 : 499,
            depthSegments: profile === "mesh-10000" ? 99 : 199,
          },
        });
      else {
        await command("mesh.cube", { id: "mesh" });
        await command("uv.unwrap", {
          id: "mesh",
          expectedRevision: host.read("mesh").revision,
          parameters: { resolution: 64, padding: 2 },
        });
        await command("paint.set", {
          id: "image",
          content: {
            width: 4096,
            height: 4096,
            colorSpace: "srgb",
            layers: [
              {
                id: "base",
                opacity: 1,
                blend: "normal",
                color: [0.8, 0.2, 0.1, 1],
                tiles: {},
              },
            ],
          },
        });
        await command("material.set", {
          id: "material",
          content: { textures: { baseColor: { imageId: "image" } } },
        });
      }
      await command("assembly.set", {
        id: "scene",
        content: {
          nodes: [
            {
              id: "object",
              name: profile,
              meshId: "mesh",
              materials: profile === "image-4096" ? ["material"] : [],
            },
          ],
        },
      });
      const artifact = encodeAuthoringGLB(
        host.prepare({ assemblyId: "scene" }),
      ).bytes;
      server = await startAuthoringPreview({
        host,
        artifact,
        ui: false,
        view: {
          width: 800,
          height: 600,
          camera: { position: [8, 8, 10], target: [0, 0, 0], yfov: 0.7 },
        },
      });
      const repetitions = [];
      for (let i = 0; i < 3; i++) {
        const page = await browser.newPage({
            viewport: { width: 800, height: 600 },
          }),
          start = performance.now();
        await page.goto(server.url);
        await page.waitForFunction(
          () =>
            window.nexusAuthoringPreview?.ready ||
            window.nexusAuthoringPreview?.error,
        );
        const loadMs = performance.now() - start,
          result = await page.evaluate(async () => {
            const p = window.nexusAuthoringPreview;
            if (p.error) throw Error(p.error);
            const before = performance.now();
            await p.provider.load(
              "/preview.glb?update=1",
              (await (await fetch("/state")).json()).view,
            );
            return {
              updateMs: performance.now() - before,
              statistics: p.provider.inspect(),
            };
          });
        repetitions.push({ loadMs, ...result });
        await page.close();
      }
      results.push({ profile, bytes: artifact.length, repetitions });
      console.error(`${profile} preview measured`);
    } finally {
      await server?.close();
      await host.close();
    }
  }
  await writeFile(
    process.argv[2] ??
      "/tmp/nexus-authoring-candidates/preview-performance.json",
    JSON.stringify(
      {
        browser: await browser.version(),
        renderer: "Three/WebGL SwiftShader",
        conditions:
          "Three fresh pages; repeated update uses the same artifact, OS/browser filesystem caches may be warm; shared development machine.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
