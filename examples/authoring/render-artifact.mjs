import { resolve, join } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createAuthoringHost } from "../../src/authoring/host.js";
import { startAuthoringPreview } from "../../src/authoring/preview/localhost-server.js";
import { donutViews } from "./donut/recipe.js";
const file = resolve(process.argv[2]),
  output = resolve(process.argv[3] ?? "/tmp/nexus-authoring-renders"),
  artifact = await readFile(file),
  host = await createAuthoringHost(),
  results = [];
await mkdir(output, { recursive: true });
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
  for (const [name, view] of Object.entries({
    ...donutViews,
    "exported-artifact": donutViews.overall,
  })) {
    const server = await startAuthoringPreview({
      host,
      artifact,
      ui: false,
      view,
    });
    try {
      const page = await browser.newPage({
          viewport: { width: view.width, height: view.height },
        }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(server.url);
      await page.waitForFunction(
        () =>
          window.nexusAuthoringPreview?.ready ||
          window.nexusAuthoringPreview?.error,
      );
      const failure = await page.evaluate(
        () => window.nexusAuthoringPreview.error,
      );
      if (failure || errors.length) throw Error(failure ?? errors.join("\n"));
      const statistics = await page.evaluate(() =>
          window.nexusAuthoringPreview.provider.inspect(),
        ),
        image = await page.screenshot({ path: join(output, `${name}.png`) });
      results.push({
        name,
        view,
        statistics,
        imageHash: createHash("sha256").update(image).digest("hex"),
      });
      await page.close();
    } finally {
      await server.close();
    }
  }
  await writeFile(
    join(output, "render-evidence.json"),
    JSON.stringify(
      {
        artifact: file,
        artifactHash: createHash("sha256").update(artifact).digest("hex"),
        browser: await browser.version(),
        provider: "Three GLTFLoader and WebGLRenderer",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      output,
      views: results.length,
      meshes: results[0].statistics.meshes.length,
    }),
  );
} finally {
  await browser?.close();
  await host.close();
}
