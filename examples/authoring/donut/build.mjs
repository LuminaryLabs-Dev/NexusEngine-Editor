import { resolve, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createAuthoringHost } from "../../../src/authoring/host.js";
import { createFileProjectStore } from "../../../src/authoring/storage/file-project.js";
import { publishAuthoringGLB } from "../../../src/authoring/export/publish.js";
import { buildDonut, donutViews } from "./recipe.js";
const directory = resolve(process.argv[2] ?? "/tmp/nexus-authoring-donut"),
  host = await createAuthoringHost({
    store: await createFileProjectStore(directory),
  }),
  start = performance.now();
try {
  const result = await buildDonut(host);
  await host.save();
  const exported = await host.exportArtifact({ assemblyId: "scene", format: "glb", outputDirectory: join(directory, "exports") }),
    published = { glb: exported.artifact, outputHash: exported.hash, byteLength: exported.bytes.length, validation: exported.validation, receipt: exported.receipt };
  await writeFile(
    join(directory, "recipe-evidence.json"),
    JSON.stringify(
      {
        ...result,
        published,
        views: donutViews,
        elapsedMs: performance.now() - start,
        memory: process.memoryUsage(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      directory,
      ...result,
      published,
      elapsedMs: performance.now() - start,
    }),
  );
} finally {
  await host.close();
}
