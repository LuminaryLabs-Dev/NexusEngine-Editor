import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createAuthoringHost } from "../src/authoring/index.js";

const host = await createAuthoringHost();
let request = 0;
const command = (id, args) =>
  host.command({
    requestId: `formats-${request++}`,
    epoch: host.status().context.epoch,
    operations: [{ id, args }],
  });

await command("mesh.cube", { id: "rock" });
await command("material.set", {
  id: "rock-material",
  content: {
    baseColor: [0.38, 0.34, 0.29, 1],
    metallic: 0.03,
    roughness: 0.82,
  },
});
await command("assembly.set", {
  id: "scene",
  content: {
    nodes: [
      {
        id: "rock-node",
        name: "Rock",
        meshId: "rock",
        materials: ["rock-material"],
      },
    ],
  },
});

assert.deepEqual(
  host.exportFormats().map((entry) => entry.format),
  ["fbx", "glb", "usdz"],
);

const output = await mkdtemp(join(tmpdir(), "authoring-formats-"));
try {
  for (const format of ["glb", "usdz", "fbx"]) {
    const result = await host.exportArtifact({
      assemblyId: "scene",
      format,
      outputDirectory: output,
    });
    assert.equal(result.format, format);
    assert.equal(result.validation.errors, 0);
    assert.equal(extname(result.artifact), `.${format}`);
    assert.ok((await readFile(result.artifact)).length > 0);
  }
  console.log(
    JSON.stringify({
      test: "Authoring export providers",
      formats: host.exportFormats().map((entry) => entry.format),
    }),
  );
} finally {
  await host.close();
  await rm(output, { recursive: true, force: true });
}
