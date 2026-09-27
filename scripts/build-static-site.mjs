import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const sourceParent = process.env.NEXUS_EDITOR_SOURCE_COMMIT ?? gitHead();

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
    <meta name="nexus-core-commit" content="${pkg.nexusEngineArtifact.commit}" />
    <title>NexusEngine Editor</title>
    <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />
    <link rel="stylesheet" href="./editor.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./editor.js"></script>
  </body>
</html>\n`;
const editorJs = `// Generated static Pages entry. Edit src/**, not this file.\nimport "./src/main.js";\n`;
const editorCss = `/* Generated static Pages entry. Edit src/styles.css, not this file. */\n@import url("./src/styles.css");\n`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "assets"), resolve(dist, "assets"), { recursive: true });
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "README.md"), resolve(dist, "README.md"));
await writeFile(resolve(dist, "index.html"), indexHtml);
await writeFile(resolve(dist, "editor.js"), editorJs);
await writeFile(resolve(dist, "editor.css"), editorCss);
await writeFile(resolve(dist, ".nojekyll"), "");
const fingerprint = "sha256:" + createHash("sha256").update(indexHtml).update(editorJs).update(editorCss).digest("hex");
await writeFile(resolve(dist, "deployment.json"), JSON.stringify({
  schema: "nexusengine-editor.deployment/1",
  deploymentMode: "branch-root-static",
  sourceParent,
  coreCommit: pkg.nexusEngineArtifact.commit,
  coreRegistry: pkg.nexusEngineArtifact.registryHash,
  artifactFingerprint: fingerprint,
  entry: "index.html"
}, null, 2) + "\n");
console.log(`Built static Editor at ${dist} (${fingerprint})`);
