import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createAuthoringHost } from "../../src/authoring/host.js";
import { createFileProjectStore } from "../../src/authoring/storage/file-project.js";
import { publishAuthoringGLB } from "../../src/authoring/export/publish.js";
import { buildMechanical } from "./mechanical/recipe.js";
import { buildOrganic } from "./organic/recipe.js";
const root = resolve(process.argv[2] ?? "/tmp/nexus-authoring-proof-assets");
for (const [name, recipe] of Object.entries({
  mechanical: buildMechanical,
  organic: buildOrganic,
})) {
  const directory = join(root, name),
    host = await createAuthoringHost({
      store: await createFileProjectStore(directory),
    });
  try {
    const start = performance.now(),
      result = await recipe(host);
    await host.save();
    const packet = host.prepare({ assemblyId: "scene" }),
      published = await publishAuthoringGLB(
        packet,
        join(directory, "exports"),
        {
          jobs: host.jobs,
          commitGuard: (action) => host.finalize(packet, action),
        },
      );
    await writeFile(
      join(directory, "recipe-evidence.json"),
      JSON.stringify(
        { ...result, published, elapsedMs: performance.now() - start },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        name,
        ...result,
        glb: published.glb,
        validation: published.validation,
        elapsedMs: performance.now() - start,
      }),
    );
  } finally {
    await host.close();
  }
}
