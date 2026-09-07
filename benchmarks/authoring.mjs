import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir, cpus, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { createAuthoringHost } from "../src/authoring/host.js";
import { createFileProjectStore } from "../src/authoring/storage/file-project.js";
import { bakeAuthoringTexture } from "../src/authoring/jobs/evaluate.js";
import { encodeAuthoringGLB } from "../src/authoring/export/glb.js";
const [mode, sizeText] = process.argv.slice(2);
if (mode === "mesh" || mode === "image") {
  const size = Number(sizeText),
    directory = await mkdtemp(join(tmpdir(), "authoring-performance-")),
    host = await createAuthoringHost({
      store: await createFileProjectStore(directory),
    }),
    timings = {},
    memory = [];
  let next = 0;
  const measure = async (name, fn) => {
      const before = performance.now(),
        result = await fn();
      timings[name] = performance.now() - before;
      console.error(`${mode} ${size}: ${name} ${Math.round(timings[name])} ms`);
      memory.push(process.memoryUsage().rss);
      return result;
    },
    command = (id, args) =>
      host.command({
        requestId: `bench-${next++}`,
        epoch: host.status().context.epoch,
        operations: [{ id, args }],
      }),
    edit = (id, args) =>
      command(id, { ...args, expectedRevision: host.read(args.id).revision });
  try {
    if (mode === "mesh") {
      await measure("create", () =>
        command("mesh.primitive", {
          id: "mesh",
          parameters: {
            type: "grid",
            size: 10,
            widthSegments: size === 10000 ? 99 : 499,
            depthSegments: size === 10000 ? 99 : 199,
          },
        }),
      );
      await measure("selection", () =>
        command("editing.select", {
          id: "selection",
          meshId: "mesh",
          mode: "vertex",
          ids: ["v0", "v1", "v2", "v3"],
        }),
      );
      await measure("transform", () =>
        edit("mesh.transform", {
          id: "mesh",
          selection: { mode: "vertex", ids: ["v0", "v1", "v2", "v3"] },
          translation: [0, 0.03, 0],
        }),
      );
      await measure("undo", () =>
        host.undo({ requestId: "undo", epoch: host.status().context.epoch }),
      );
      await measure("redo", () =>
        host.redo({ requestId: "redo", epoch: host.status().context.epoch }),
      );
      await command("modifier.set", {
        id: "modifier",
        content: {
          meshId: "mesh",
          stack: [
            {
              id: "smooth",
              type: "smooth",
              parameters: { iterations: 1, factor: 0.1 },
            },
          ],
        },
      });
      await measure("modifier", () =>
        host.engine.n.authoringModifier.evaluate("modifier"),
      );
      await measure("sculpt", () =>
        edit("sculpt.stroke", {
          id: "mesh",
          parameters: {
            mode: "grab",
            offset: [0, 0.01, 0],
            stroke: {
              radius: 0.1,
              strength: 0.1,
              samples: [{ position: [0, 0, 0] }],
            },
          },
        }),
      );
    } else {
      await command("mesh.cube", { id: "mesh" });
      await edit("uv.unwrap", {
        id: "mesh",
        parameters: { resolution: 64, padding: 2 },
      });
      await command("paint.set", {
        id: "image",
        content: {
          width: size,
          height: size,
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
                seed: 3,
                scale: 32,
                a: [0.1, 0.2, 0.3, 1],
                b: [0.5, 0.7, 0.3, 1],
              },
            ],
            output: "noise",
          },
          textures: { baseColor: { imageId: "image" } },
        },
      });
      await measure("bakeWorker", () =>
        bakeAuthoringTexture(host, host.jobs, "image", "material", "base"),
      );
      await measure("paintTile", () =>
        edit("paint.stroke", {
          id: "image",
          parameters: {
            layerId: "base",
            color: [0.8, 0.1, 0.2, 1],
            stroke: {
              radius: 8,
              strength: 0.5,
              samples: [{ position: [10, 10, 0] }],
            },
          },
        }),
      );
    }
    await command("assembly.set", {
      id: "scene",
      content: {
        nodes: [
          {
            id: "object",
            name: "Benchmark",
            meshId: "mesh",
            materials: mode === "image" ? ["material"] : [],
          },
        ],
      },
    });
    const snapshot = host.snapshot({ immutable: true }),
      historyBytes = Buffer.byteLength(JSON.stringify(snapshot.undo));
    await measure("save", () => host.save());
    await measure("load", () =>
      host.engine.n.authoringProject.validateSnapshot
        ? host.engine.n.authoringProject.validateSnapshot(snapshot)
        : createFileProjectStore(directory).then((s) => s.load()),
    );
    const packet = await measure("prepare", () =>
        host.prepare({ assemblyId: "scene" }),
      ),
      encoded = await measure("export", () => encodeAuthoringGLB(packet));
    console.log(
      JSON.stringify({
        mode,
        size,
        timings,
        sourceBytes: Buffer.byteLength(JSON.stringify(snapshot.documents)),
        historyBytes,
        outputBytes: encoded.bytes.length,
        worker: host.jobs.statistics(),
        peakRSS: Math.max(process.resourceUsage().maxRSS * 1024, ...memory),
        node: process.version,
      }),
    );
  } finally {
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
} else {
  const output = resolve(
      process.argv[2] ??
        "/tmp/nexus-authoring-candidates/performance-evidence.json",
    ),
    results = [];
  for (const [type, size] of [
    ["mesh", 10000],
    ["mesh", 100000],
    ["image", 1024],
    ["image", 2048],
    ["image", 4096],
  ])
    for (let repetition = 0; repetition < 3; repetition++) {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [new URL(import.meta.url).pathname, type, String(size)],
            { stdio: ["ignore", "pipe", "pipe"] },
          ),
          chunks = [];
        let stderr = "";
        child.stdout.on("data", (c) => chunks.push(c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) reject(Error(`${type} ${size}: ${stderr}`));
          else resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        });
      });
      results.push({ ...result, repetition });
      console.error(`${type} ${size} repetition ${repetition + 1} completed`);
      await mkdir(resolve(output, ".."), { recursive: true });
      await writeFile(
        output,
        JSON.stringify(
          {
            environment: {
              cpu: cpus()[0]?.model,
              logicalCPUs: cpus().length,
              reportedMemoryBytes: totalmem(),
              node: process.version,
              platform: process.platform,
              arch: process.arch,
            },
            conditions:
              "Three fresh Node processes per workload; OS filesystem caches may remain warm.",
            results,
            unsupported: { meshVertices: 1000000, imageResolution: 8192 },
          },
          null,
          2,
        ) + "\n",
      );
    }
  console.log(JSON.stringify({ output, workloads: results.length }));
}
