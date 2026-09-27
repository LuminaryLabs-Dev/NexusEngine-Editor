import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [index, entry, client, host, runtime] = await Promise.all([
  read("index.html"),
  read("editor.js"),
  read("src/workbench/browser-client.js"),
  read("src/workbench/browser-host.js"),
  read("src/nexus-engine-editor-runtime.js"),
]);

assert.match(index, /src\/workbench\/browser-client\.js|editor\.js/);
assert.match(index, /784e514722febf8fb09ca55a058b2736e93679bd/);
assert.match(index, /type="importmap"/);
assert.match(index, /"nexusengine\/foundation"\s*:/);
assert.match(index, /"nexusengine\/domains\/runtime\/sequence"\s*:/);
assert.match(entry, /browser-client\.js/);
assert.doesNotMatch(entry, /src\/main\.js/);
assert.doesNotMatch(client, /fetch\(["']\/api|fetch\(["']\/state|\/preview\.glb|\/runtime\.glb/);
assert.doesNotMatch(host, /node:/);
assert.match(host, /storage:\s*["']indexeddb["']/);
assert.match(host, /authoringExport/);
assert.match(host, /authoringImport/);
assert.match(host, /requires-local-host/);
assert.match(runtime, /784e514722febf8fb09ca55a058b2736e93679bd/);
assert.doesNotMatch([index, entry, client, host, runtime].join("\n"), /a74e8689d1a71c0b42236c009f0f4c46e9b89387/);

console.log("Static browser workbench: pinned Core, complete Authoring bare-import map, direct browser host, IndexedDB, in-memory preview/export and no legacy HTTP/Editor entry passed.");
