import assert from "node:assert/strict";
import { Matrix4, Quaternion, Vector3 } from "three";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createAuthoringHost } from "../src/authoring/host.js";
import { startAuthoringPreview } from "../src/authoring/preview/localhost-server.js";
import {
  encodeAuthoringGLB,
  validateAuthoringGLB,
} from "../src/authoring/index.js";
import { buildOrganic } from "../examples/authoring/organic/recipe.js";
const host = await createAuthoringHost();
let server, browser;
try {
  await buildOrganic(host);
  const scene = host.read("scene"),
    parent = {
      translation: [0.3, 0.2, -0.4],
      rotation: [0, 0, Math.sin(0.15), Math.cos(0.15)],
      scale: [1.2, 0.9, 1.1],
    },
    local = {
      translation: [0.2, 0.1, -0.1],
      rotation: [0, Math.sin(0.1), 0, Math.cos(0.1)],
      scale: [1, 1, 1],
    };
  await host.command({
    requestId: "nonidentity-hierarchy",
    epoch: host.status().context.epoch,
    operations: [
      {
        id: "assembly.set",
        args: {
          id: "scene",
          expectedRevision: scene.revision,
          content: {
            ...scene.content,
            nodes: [
              {
                id: "articulated-parent",
                name: "Transformed parent",
                transform: parent,
              },
              ...scene.content.nodes.map((n) =>
                n.id === "organism"
                  ? { ...n, parent: "articulated-parent", transform: local }
                  : n,
              ),
            ],
          },
        },
      },
    ],
  });
  const matrix = (t) =>
      new Matrix4().compose(
        new Vector3(...t.translation),
        new Quaternion(...t.rotation),
        new Vector3(...t.scale),
      ),
    worldMatrix = matrix(parent).multiply(matrix(local));
  const packet = host.prepare({ assemblyId: "scene" }),
    artifact = encodeAuthoringGLB(packet);
  await validateAuthoringGLB(artifact.bytes);
  server = await startAuthoringPreview({
    host,
    artifact: artifact.bytes,
    ui: false,
    view: {
      width: 800,
      height: 800,
      camera: { position: [4, 2.5, 6], target: [0, 1.4, 0], yfov: 0.65 },
    },
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
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  const sample = async (clip, time) =>
    page.evaluate(
      ({ clip, time }) => {
        const provider = window.nexusAuthoringPreview.provider;
        provider.sample(clip, time);
        const meshes = [];
        provider.objects.traverse((o) => {
          if (o.isSkinnedMesh) {
            o.skeleton.update();
            const points = [];
            for (let i = 0; i < o.geometry.attributes.position.count; i++) {
              const p = o.position.clone();
              o.getVertexPosition(i, p);
              p.applyMatrix4(o.matrixWorld);
              points.push(p.toArray());
            }
            meshes.push({
              points,
              joints: o.skeleton.bones.length,
              weights: o.morphTargetInfluences,
            });
          }
        });
        return meshes;
      },
      { clip, time },
    );
  const rest = await sample(1, 0),
    posed = await sample(1, 1);
  assert.equal(rest[0].joints, 4);
  const expected = host.engine.n.authoringSkin.evaluate(
      "skin",
      host.engine.n.authoringAnimation.sample("motion", "deep-bend", 1).pose,
    ),
    byId = new Map(expected.vertices.map((v) => [v.id, v.position])),
    mesh = packet.meshes.find((m) => m.id === "body");
  let maximumError = 0,
    maximumMovement = 0;
  for (let i = 0; i < mesh.sourceVertices.length; i++) {
    const target = new Vector3(...byId.get(mesh.sourceVertices[i]))
        .applyMatrix4(worldMatrix)
        .toArray(),
      actual = posed[0].points[i];
    maximumError = Math.max(
      maximumError,
      Math.hypot(...actual.map((n, k) => n - target[k])),
    );
    maximumMovement = Math.max(
      maximumMovement,
      Math.hypot(...actual.map((n, k) => n - rest[0].points[i][k])),
    );
  }
  assert.ok(
    maximumError < 1e-5,
    `Independent skin deformation differs by ${maximumError}.`,
  );
  assert.ok(maximumMovement > 1);
  if (process.env.AUTHORING_EVIDENCE_DIRECTORY) {
    await mkdir(process.env.AUTHORING_EVIDENCE_DIRECTORY, { recursive: true });
    await page.screenshot({
      path: join(process.env.AUTHORING_EVIDENCE_DIRECTORY, "organic-bend.png"),
    });
    await sample(0, 1);
    await page.screenshot({
      path: join(process.env.AUTHORING_EVIDENCE_DIRECTORY, "organic-sway.png"),
    });
    await sample(0, 0);
    await page.screenshot({
      path: join(process.env.AUTHORING_EVIDENCE_DIRECTORY, "organic-rest.png"),
    });
  }
  const morphed = await sample(0, 1);
  assert.ok(morphed[0].weights[0] > 0.99);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      test: "Independent Three GLB skin/morph deformation",
      maximumError,
      maximumMovement,
      joints: 4,
      clips: 3,
      sourceVertices: expected.vertices.length,
    }),
  );
} finally {
  await browser?.close();
  await server?.close();
  await host.close();
}
