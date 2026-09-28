import { cp, mkdir, readFile, rm, lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyArtifact, generatedPath, fileRecord, sha256, stable, verifyBrowserEvidence } from "./static-build-support.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), dist = resolve(root, "dist");
const deployment = await verifyArtifact(dist, { strict: true });
const validation = JSON.parse(await readFile(resolve(root, ".test-results/static-browser.json"), "utf8"));
await verifyBrowserEvidence(dist, deployment, validation);
for (const source of deployment.sources) {
  const actual = await fileRecord(root, source.path);
  if (actual.hash !== source.hash) throw new Error(`Source changed since the validated build: ${source.path}. Rebuild and revalidate.`);
}
if (sha256(stable({ sources: deployment.sources, generatedFactoryHash: deployment.generatedFactoryHash })) !== deployment.sourceFingerprint) throw new Error("Source fingerprint is inconsistent.");
const names = [...deployment.files.map(f => f.path), "deployment.json"];
let old = [];
try { const prior = JSON.parse(await readFile(resolve(root, "deployment.json"), "utf8")); old = (prior.files ?? []).map(f => f.path); } catch (error) { if (error.code !== "ENOENT") throw error; }
for (const path of [...names, ...old]) if (!generatedPath(path) || path.split('/').includes('..')) throw new Error(`Refusing to promote or remove a non-generated path: ${path}`);
async function rejectLinks(path) {
  let current = root;
  for (const part of path.split("/")) {
    current = resolve(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing generated output through a symlink: ${path}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
for (const path of [...names, ...old, ".test-results/publish-backup"]) await rejectLinks(path);
const backup = resolve(root, ".test-results/publish-backup"), prior = new Set();
await rm(backup, { recursive: true, force: true });
for (const path of new Set([...names, ...old])) {
  try { await mkdir(dirname(resolve(backup, path)), { recursive: true }); await cp(resolve(root, path), resolve(backup, path)); prior.add(path); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
try {
  // The new manifest is copied last. No rebuild occurs after validation.
  for (const path of names) { await mkdir(dirname(resolve(root, path)), { recursive: true }); await cp(resolve(dist, path), resolve(root, path)); }
  for (const path of old) if (!names.includes(path)) await rm(resolve(root, path), { force: true });
  await verifyArtifact(root);
} catch (error) {
  for (const path of new Set([...names, ...old])) {
    if (prior.has(path)) await cp(resolve(backup, path), resolve(root, path)); else await rm(resolve(root, path), { force: true });
  }
  throw error;
}
console.log(`Promoted the tested ${deployment.artifactFingerprint}. Source files were not replaced by generated copies.`);
