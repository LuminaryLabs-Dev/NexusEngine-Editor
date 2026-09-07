import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAuthoringHost,
  encodeAuthoringGLB,
  publishAuthoringGLB,
  validateAuthoringGLB,
} from "../src/authoring/index.js";
const host = await createAuthoringHost();
let index = 0;
const command = (id, args) =>
    host.command({
      requestId: `export-${index++}`,
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
    width: 4,
    height: 4,
    colorSpace: "srgb",
    layers: [
      {
        id: "base",
        opacity: 1,
        blend: "normal",
        color: [0.8, 0.25, 0.1, 1],
        tiles: {},
      },
    ],
  },
});
for (const role of ["metallicRoughness", "normal", "occlusion", "emissive"])
  await command("paint.set", {
    id: role,
    content: {
      width: 4,
      height: 4,
      colorSpace: role === "emissive" ? "srgb" : "linear",
      layers: [
        {
          id: "base",
          opacity: 1,
          blend: "normal",
          color: role === "normal" ? [0.5, 0.5, 1, 1] : [0.8, 0.5, 0.1, 1],
          tiles: {},
        },
      ],
    },
  });
await command("material.set", {
  id: "material",
  content: {
    baseColor: [1, 1, 1, 1],
    roughness: 0.6,
    emissive: [0.2, 0.2, 0.2],
    textures: {
      baseColor: { imageId: "image" },
      ...Object.fromEntries(
        ["metallicRoughness", "normal", "occlusion", "emissive"].map((role) => [
          role,
          { imageId: role },
        ]),
      ),
    },
  },
});
await command("rig.set", {
  id: "rig",
  content: {
    bones: [
      { id: "root", name: "Root", parent: null, rest: {}, length: 1 },
      {
        id: "tip",
        name: "Tip",
        parent: "root",
        rest: { translation: [0, 1, 0] },
        length: 1,
      },
    ],
  },
});
await command("skin.bind", { id: "skin", meshId: "cube", rigId: "rig" });
await command("animation.shape", {
  id: "shape",
  meshId: "cube",
  keys: [{ id: "shape", weight: 0, deltas: { v0: [0, 0.2, 0] } }],
});
await command("animation.set", {
  id: "animation",
  content: {
    rigId: "rig",
    shapeId: "shape",
    clips: [
      {
        id: "bend",
        name: "Bend",
        duration: 1,
        tracks: [
          {
            id: "rotation",
            target: "tip",
            property: "rotation",
            interpolation: "LINEAR",
            keys: [
              { time: 0, value: [0, 0, 0, 1] },
              { time: 1, value: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
            ],
          },
          {
            id: "morph",
            target: "shape",
            property: "weight",
            interpolation: "LINEAR",
            keys: [
              { time: 0, value: [0] },
              { time: 1, value: [1] },
            ],
          },
        ],
      },
    ],
  },
});
await command("assembly.set", {
  id: "assembly",
  content: {
    nodes: [
      {
        id: "object",
        name: "Rigged cube",
        meshId: "cube",
        materials: ["material"],
        rigId: "rig",
        skinId: "skin",
        shapeId: "shape",
        animationIds: ["animation"],
      },
    ],
  },
});
const packet = host.prepare({ assemblyId: "assembly" }),
  result = encodeAuthoringGLB(packet),
  validation = await validateAuthoringGLB(result.bytes);
assert.equal(validation.issues.numErrors, 0);
assert.equal(result.json.skins.length, 1);
assert.equal(result.json.animations[0].channels.length, 2);
assert.equal(result.json.meshes[0].primitives.length, 1);
assert.equal(result.json.images.length, 5);
assert.equal(result.textures.length, 5);
assert.equal(result.bytes.readUInt32LE(8), result.bytes.length);
assert.equal(
  result.json.accessors[result.json.meshes[0].primitives[0].attributes.POSITION]
    .count,
  36,
);
const primitive = result.json.meshes[0].primitives[0];
assert.ok(primitive.targets[0].NORMAL !== undefined);
const binaryOffset = 20 + result.bytes.readUInt32LE(12) + 8;
for (const image of result.json.images) {
  const view = result.json.bufferViews[image.bufferView],
    embedded = result.bytes.subarray(
      binaryOffset + (view.byteOffset ?? 0),
      binaryOffset + (view.byteOffset ?? 0) + view.byteLength,
    );
  assert.ok(result.textures.some((t) => t.bytes.equals(embedded)));
}
const directory = await mkdtemp(join(tmpdir(), "authoring-export-"));
try {
  const published = await publishAuthoringGLB(packet, directory, {
    commitGuard: (action) => host.finalize(packet, action),
  });
  assert.deepEqual(await readFile(published.glb), result.bytes);
  assert.equal(
    (await publishAuthoringGLB(packet, directory)).directory,
    published.directory,
  );
  assert.equal(
    (await readdir(directory)).filter((n) => n.startsWith("pending-")).length,
    0,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    () => publishAuthoringGLB(packet, directory, { signal: cancelled.signal }),
    { code: "AUTHORING_EXPORT_CANCELLED" },
  );
  await edit("mesh.transform", { id: "cube", translation: [1, 0, 0] });
  await assert.rejects(
    () =>
      publishAuthoringGLB(packet, directory, {
        commitGuard: (action) => host.finalize(packet, action),
      }),
    { code: "AUTHORING_STALE_EXPORT" },
  );
  assert.equal(
    (await readdir(directory)).filter((n) => n.startsWith("pending-")).length,
    0,
  );
  console.log(
    JSON.stringify({
      test: "Authoring GLB",
      errors: validation.issues.numErrors,
      warnings: validation.issues.numWarnings,
      messages: validation.issues.messages.map((m) => m.code),
      bytes: result.bytes.length,
      hash: result.hash,
    }),
  );
} finally {
  await host.close();
  await rm(directory, { recursive: true, force: true });
}
