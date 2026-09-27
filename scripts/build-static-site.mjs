import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_DSK_GAME, buildDskGameHtml } from "../src/dsk-html-builder.js";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const sourceParent = process.env.NEXUS_EDITOR_SOURCE_COMMIT ?? gitHead();
const coreCommit = pkg.nexusEngineArtifact.commit;
const coreRegistry = pkg.nexusEngineArtifact.registryHash;
const coreBase = `https://cdn.jsdelivr.net/gh/LuminaryLabs-Dev/NexusEngine@${coreCommit}/`;

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "working-tree";
  }
}

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="nexus-editor-source" content="${sourceParent}" />
    <meta name="nexus-core-commit" content="${coreCommit}" />
    <title>NexusEngine Editor</title>
    <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />
    <link rel="stylesheet" href="./editor.css" />
    <script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "nexusengine": "${coreBase}src/index.js",
    "nexusengine/foundation": "${coreBase}src/foundation/index.js",
    "nexusengine/domains/authoring": "${coreBase}src/core-domains/authoring/index.js",
    "nexusengine/domains/interaction/input": "${coreBase}src/core-domains/interaction/input/kits/input-kit/index.js",
    "nexusengine/domains/composition": "${coreBase}src/core-domains/composition/index.js",
    "nexusengine/domains/runtime/sequence": "${coreBase}src/core-domains/runtime/sequence/kits/sequence-kit/index.js",
    "nexusengine/domains/spatial/quaternion-math": "${coreBase}src/core-domains/spatial/kits/quaternion-math-kit.js",
    "nexusengine/domains/object": "${coreBase}src/core-domains/object/index.js",
    "nexusengine/domains/asset/registry": "${coreBase}src/core-domains/asset/kits/asset-kit/index.js",
    "nexusengine/domains/presentation/graphics": "${coreBase}src/core-domains/presentation/graphics/kits/graphics-kit/index.js",
    "nexusengine/domains/build": "${coreBase}src/core-domains/build/index.js"
  }
}
    </script>
  </head>
  <body>
    <div class="app">
      <div id="menus" class="row"></div>
      <div id="toolbar" class="row"></div>
      <div class="main">
        <section class="panel"><div class="panel-title">OUTLINER</div><div id="outliner-list" class="scroll"></div></section>
        <main class="viewport-wrap"><canvas id="viewport" aria-label="NexusEngine scene viewport"></canvas><div class="viewport-label">SCENE / GAME VIEW</div></main>
        <section class="panel right"><div class="panel-title">INSPECTOR</div><div id="inspector-body" class="inspector"></div></section>
        <section class="bottom">
          <div id="bottom-tabs" class="tabs">
            <button data-tab="assets" class="active">Assets</button><button data-tab="domains">Domains</button><button data-tab="kits">Kits</button>
            <button data-tab="validation">Validation</button><button data-tab="composition">Composition</button><button data-tab="runtime">Runtime</button>
            <button data-tab="build">Build</button><button data-tab="console">Console</button>
          </div>
          <div id="bottom-content"></div>
        </section>
      </div>
      <div id="statusbar" class="status"></div>
    </div>
    <script type="module" src="./editor.js"></script>
  </body>
</html>
`;
const editorJs = `// Generated static Pages entry. Edit src/workbench/**, not this file.\nimport "./src/workbench/browser-client.js";\n`;
const editorCss = `/* Generated static Pages entry. Edit src/workbench/browser.css, not this file. */\n@import url("./src/workbench/browser.css");\n`;

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "games"), { recursive: true });
await cp(resolve(root, "assets"), resolve(dist, "assets"), { recursive: true });
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "README.md"), resolve(dist, "README.md"));
await writeFile(resolve(dist, "index.html"), indexHtml);
await writeFile(resolve(dist, "editor.js"), editorJs);
await writeFile(resolve(dist, "editor.css"), editorCss);
await writeFile(resolve(dist, ".nojekyll"), "");
await writeFile(resolve(dist, "games", "starter-game.html"), buildDskGameHtml(DEFAULT_DSK_GAME));

const fingerprint = "sha256:" + createHash("sha256").update(indexHtml).update(editorJs).update(editorCss).digest("hex");
await writeFile(resolve(dist, "deployment.json"), JSON.stringify({
  schema: "nexusengine-editor.deployment/2",
  deploymentMode: "branch-root-static-browser-workbench",
  sourceParent,
  coreCommit,
  coreRegistry,
  artifactFingerprint: fingerprint,
  entry: "index.html"
}, null, 2) + "\n");

console.log(`Built browser-native static Editor at ${dist} (${fingerprint})`);
