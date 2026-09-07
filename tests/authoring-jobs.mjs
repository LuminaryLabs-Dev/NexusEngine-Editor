import assert from "node:assert/strict";
import { createAuthoringHost } from "../src/authoring/host.js";
import { createAuthoringWorkerPool } from "../src/authoring/jobs/pool.js";
import {
  evaluateAuthoringModifier,
  bakeAuthoringTexture,
} from "../src/authoring/jobs/evaluate.js";
const host = await createAuthoringHost();
let next = 0;
const command = (id, args) =>
  host.command({
    requestId: `worker-${next++}`,
    epoch: host.status().context.epoch,
    operations: [{ id, args }],
  });
try {
  await assert.rejects(() =>
    command("mesh.primitive", {
      id: "oversize",
      parameters: { type: "grid", widthSegments: 999, depthSegments: 999 },
    }),
  );
  await assert.rejects(() =>
    command("paint.set", {
      id: "oversize-image",
      content: { width: 8192, height: 8192, layers: [] },
    }),
  );
  assert.equal(host.list().length, 0);
  await command("mesh.cube", { id: "cube" });
  await command("modifier.set", {
    id: "stack",
    content: {
      meshId: "cube",
      stack: [{ id: "smooth", type: "subdivision", parameters: { levels: 2 } }],
    },
  });
  let started;
  const ready = new Promise((resolve) => (started = resolve)),
    pending = evaluateAuthoringModifier(host, host.jobs, "stack", {
      apply: true,
      onProgress: (progress) => {
        if (progress.stage === "started") started();
      },
    });
  await ready;
  await command("mesh.transform", {
    id: "cube",
    expectedRevision: host.read("cube").revision,
    translation: [0, 1, 0],
  });
  await assert.rejects(pending, { code: "AUTHORING_STALE_EVALUATION" });
  assert.equal(host.read("cube").content.vertices.length, 8);
  const applied = await evaluateAuthoringModifier(host, host.jobs, "stack", {
    apply: true,
  });
  assert.ok(applied.receipt);
  assert.ok(host.read("cube").content.vertices.length > 8);
  assert.equal(host.read("stack").content.stack.length, 0);
  await command("paint.set", {
    id: "image",
    content: {
      width: 2048,
      height: 2048,
      colorSpace: "srgb",
      layers: [
        {
          id: "base",
          opacity: 1,
          blend: "normal",
          color: [0, 0, 0, 1],
          tiles: {},
        },
      ],
    },
  });
  await command("material.set", {
    id: "material",
    content: {
      graph: {
        nodes: [
          {
            id: "noise",
            type: "noise",
            scale: 32,
            seed: 2,
            a: [0.1, 0.2, 0.3, 1],
            b: [0.8, 0.5, 0.2, 1],
          },
        ],
        output: "noise",
      },
    },
  });
  const before = host.read("image"),
    controller = new AbortController();
  let cancelStarted;
  const cancellationReady = new Promise((resolve) => (cancelStarted = resolve)),
    bake = bakeAuthoringTexture(host, host.jobs, "image", "material", "base", {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.stage === "baking") cancelStarted();
      },
    });
  await cancellationReady;
  const time = performance.now();
  controller.abort();
  await assert.rejects(bake, { code: "AUTHORING_JOB_CANCELLED" });
  assert.deepEqual(host.read("image"), before);
  const cancellationMs = performance.now() - time;
  assert.ok(cancellationMs < 3000);
  const limited = createAuthoringWorkerPool({ concurrency: 1, maxQueue: 0 });
  const one = limited.run("texture-bake", {
    snapshot: host.snapshot(),
    id: "image",
    materialId: "material",
    layerId: "base",
  });
  await assert.rejects(
    limited.run("modifier", { snapshot: host.snapshot(), id: "stack" }),
    { code: "AUTHORING_JOB_QUEUE_FULL" },
  );
  await limited.terminateActive();
  await assert.rejects(one, { code: "AUTHORING_JOB_TERMINATED" });
  const restart = await limited.run("modifier", {
    snapshot: host.snapshot(),
    id: "stack",
  });
  assert.ok(restart.result.mesh.vertices.length);
  await limited.close();
  const closingJob = host.jobs.run("texture-bake", {
      snapshot: host.snapshot(),
      id: "image",
      materialId: "material",
      layerId: "base",
    }),
    closed = host.close();
  await assert.rejects(closingJob, { code: "AUTHORING_JOB_CANCELLED" });
  await closed;
  assert.equal(host.jobs.statistics().active, 0);
  console.log(
    JSON.stringify({
      test: "Authoring background jobs",
      staleResultRejected: true,
      cancellationMs,
      restartedAfterTermination: true,
      statistics: host.jobs.statistics(),
    }),
  );
} finally {
  if (host.status().state !== "closed") await host.close();
}
