import { cp, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await import("./build-static-site.mjs");
const dist = resolve(root, "dist");
for (const name of ["index.html", "editor.js", "editor.css", ".nojekyll", "deployment.json"]) {
  await cp(resolve(dist, name), resolve(root, name));
}
const deployment = JSON.parse(await readFile(resolve(root, "deployment.json"), "utf8"));
console.log(`Promoted static Editor to repository root (${deployment.artifactFingerprint})`);
