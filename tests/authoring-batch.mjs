import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuthoringBatch } from "../src/authoring/jobs/batch.js";
import { createAuthoringHost } from "../src/authoring/host.js";
import { publishAuthoringGLB } from "../src/authoring/export/publish.js";
const directory = await mkdtemp(join(tmpdir(), "authoring-batch-")),
  reports = [];
let inject = true;
const run = async (job, { directory, signal }) => {
  if (inject && job.seed % 17 === 0)
    throw Error("Injected deterministic fixture failure.");
  const host = await createAuthoringHost({ projectId: job.id });
  try {
    await host.command({
      requestId: "build",
      epoch: host.status().context.epoch,
      operations: [
        {
          id: "mesh.primitive",
          args: {
            id: "mesh",
            parameters: {
              type: "torus",
              segments: 12,
              rings: 6,
              radius: 1 + job.seed * 0.007,
              minorRadius: 0.2 + (job.seed % 7) * 0.01,
            },
          },
        },
        {
          id: "material.set",
          args: {
            id: "material",
            content: {
              baseColor: [0.2 + (job.seed % 5) * 0.1, 0.3, 0.5, 1],
              roughness: 0.5,
            },
          },
        },
        {
          id: "assembly.set",
          args: {
            id: "scene",
            content: {
              nodes: [
                {
                  id: "object",
                  name: "Batch asset",
                  meshId: "mesh",
                  materials: ["material"],
                },
              ],
            },
          },
        },
      ],
    });
    const packet = host.prepare({ assemblyId: "scene" }),
      output = await publishAuthoringGLB(packet, directory, {
        signal,
        commitGuard: (action) => host.finalize(packet, action),
      });
    return {
      glb: output.glb,
      outputHash: output.outputHash,
      byteLength: output.byteLength,
      bounds: packet.meshes[0].bounds,
    };
  } finally {
    await host.close();
  }
};
try {
  for (const count of [1, 10, 100]) {
    inject = count === 100;
    const jobs = Array.from({ length: count }, (_, i) => ({
        id: `asset-${i + 1}`,
        seed: i + 1,
      })),
      root = join(directory, String(count)),
      first = await runAuthoringBatch({
        directory: root,
        jobs,
        run,
        concurrency: 2,
        algorithm: "parametric-torus-glb/1",
      });
    assert.equal(first.failed, count === 100 ? 5 : 0);
    assert.equal(first.completed, count - first.failed);
    const repeat = await runAuthoringBatch({
      directory: root,
      jobs,
      run,
      concurrency: 2,
      algorithm: "parametric-torus-glb/1",
    });
    assert.equal(repeat.cacheHits, first.completed);
    if (count === 100) {
      inject = false;
      const resumed = await runAuthoringBatch({
        directory: root,
        jobs,
        run,
        concurrency: 2,
        algorithm: "parametric-torus-glb/1",
      });
      assert.equal(resumed.completed, 100);
      assert.equal(resumed.failed, 0);
      assert.equal(resumed.cacheHits, 95);
      assert.equal(
        new Set(Object.values(resumed.jobs).map((j) => j.output.outputHash))
          .size,
        100,
      );
      assert.equal(
        new Set(
          Object.values(resumed.jobs).map((j) =>
            JSON.stringify(j.output.bounds),
          ),
        ).size,
        100,
      );
      reports.push({
        count,
        initial: { completed: first.completed, failed: first.failed },
        resumed: { completed: resumed.completed, cacheHits: resumed.cacheHits },
        elapsedMs: first.elapsedMs + resumed.elapsedMs,
        peakRSS: Math.max(first.peakRSS, resumed.peakRSS),
        diverseBounds: 100,
      });
    } else
      reports.push({
        count,
        completed: first.completed,
        cacheHits: repeat.cacheHits,
        elapsedMs: first.elapsedMs,
        peakRSS: first.peakRSS,
      });
  }
  if (process.env.AUTHORING_EVIDENCE_DIRECTORY) {
    await mkdir(process.env.AUTHORING_EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(
      join(process.env.AUTHORING_EVIDENCE_DIRECTORY, "batch-evidence.json"),
      JSON.stringify(reports, null, 2) + "\n",
    );
  }
  console.log(
    JSON.stringify({ test: "Authoring isolated batch generation", reports }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
