import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
export const sha256 = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const stable = value => JSON.stringify(value, null, 2) + "\n";
export async function fileRecord(root, path) { const bytes = await readFile(resolve(root, path)); return { path: path.replaceAll(sep, "/"), bytes: bytes.length, hash: sha256(bytes) }; }
export async function walk(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Generated deployment cannot contain symlinks.");
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await walk(root, path)); else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
export function generatedPath(path) {
  if (typeof path !== "string" || path.split("/").some(part => !part || part === "." || part === "..")) return false;
  return ["index.html", "editor.js", "editor.css", ".nojekyll", "deployment.json"].includes(path)
    || /^editor-assets\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path);
}
export async function verifyArtifact(root, { strict = false } = {}) {
  root = resolve(root);
  if ((await lstat(root)).isSymbolicLink()) throw new Error("Artifact root must not be a symlink.");
  if ((await lstat(resolve(root, "deployment.json"))).isSymbolicLink()) throw new Error("Artifact manifest must not be a symlink.");
  const deployment = JSON.parse(await readFile(resolve(root, "deployment.json"), "utf8"));
  if (deployment.schema !== "nexusengine-editor.deployment/3" || !Array.isArray(deployment.files)) throw new Error("Expected a bundled deployment/3 artifact.");
  const paths = new Set();
  for (const file of deployment.files) {
    if (!generatedPath(file.path) || file.path === "deployment.json" || paths.has(file.path) || file.path.split('/').includes('..')) throw new Error("Invalid generated-file manifest.");
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^sha256:[0-9a-f]{64}$/.test(file.hash ?? "")) throw new Error("Invalid generated-file identity.");
    let current = root;
    for (const part of file.path.split("/")) {
      current = resolve(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Artifact symlink: ${file.path}.`);
    }
    paths.add(file.path); const actual = await fileRecord(root, file.path);
    if (actual.hash !== file.hash || actual.bytes !== file.bytes) throw new Error(`Artifact changed: ${file.path}.`);
  }
  for (const required of ["index.html", "editor.js", "editor.css", ".nojekyll"]) if (!paths.has(required)) throw new Error(`Missing deployment file ${required}.`);
  if (sha256(stable(deployment.files)) !== deployment.artifactFingerprint) throw new Error("Artifact fingerprint does not match all generated files.");
  if (strict) {
    const present = await walk(root);
    for (const path of present) if (path !== "deployment.json" && !paths.has(path)) throw new Error(`Unmanifested deployment file: ${path}.`);
  }
  return deployment;
}
export function assertBrowserInputs(paths) {
  const legacyOrServer = /(?:^|\/)(?:src\/(?:main\.js|editor-domain-model\.js|dsk-html-builder\.js)|workbench\/(?:build-controller\.js|adapters\/local(?:-session)?\.js))$/;
  const buildMetadata = /(?:^|\/)(?:domain\.manifest|subdomain\.manifest|kit\.manifest|manifest-input|kit-manifests|subdomain-manifests)\.js$/;
  for (const path of paths) {
    // Core catalog metadata is required; executable Node Build services are not.
    const coreBuild = path.match(/(?:^|\/)core-domains\/build\/(.+)$/)?.[1];
    if (legacyOrServer.test(path) || (coreBuild && !buildMetadata.test(coreBuild)))
      throw new Error(`Server/legacy implementation entered the public bundle: ${path}`);
  }
}
export function coreLocation() { return resolve(dirname(fileURLToPath(import.meta.resolve("nexusengine"))), ".."); }

/** These TWO platform providers have no browser implementation. Do not alias arbitrary Node imports. */
export function browserBoundaryPlugin(coreRoot, { resolverPath, resolverSource } = {}) {
  const filesystem = resolve(coreRoot, "src/core-domains/authoring/persistence/providers/filesystem/index.js");
  const output = resolve(coreRoot, "src/core-domains/authoring/publishing/export/publishing/artifact-output.js");
  return {
    name: "explicit-browser-host-boundaries",
    setup(build) {
      build.onLoad({ filter: /\.js$/ }, async args => {
        if (args.path === filesystem) return { loader: "js", contents: `
          const unavailable = () => { throw Object.assign(new Error("Filesystem storage requires a local host."), {code:"AUTHORING_STORAGE_UNAVAILABLE"}); };
          export function createFilesystemAuthoringStorageProvider() { return { id:"authoring-filesystem-storage/1", version:"1", format:"filesystem", profile:"filesystem-atomic-cas/1", capabilities:{persistent:false,atomic:false,available:false}, read:unavailable, write:unavailable }; }
        ` };
        if (args.path === output) return { loader: "js", contents: `export async function publishArtifact(){throw Object.assign(new Error("Filesystem publication requires a local host. Use browser artifact bytes instead."),{code:"AUTHORING_STORAGE_UNAVAILABLE"});}` };
        if (resolverPath && args.path === resolverPath) return { loader: "js", contents: resolverSource, resolveDir: dirname(resolverPath) };
        return null;
      });
    },
  };
}
export async function createBrowserFactorySource({ esbuild, root, coreRoot, registry }) {
  const manifest = JSON.parse(await readFile(resolve(coreRoot, "package.json"), "utf8"));
  const loaders = [], availability = {}, probeInputs = new Set();
  for (const kit of registry.kits) {
    const s = kit.source;
    if (s?.registryId !== "nexusengine-core" || !s.installable || !s.environments?.includes("browser") || !/^\.\/domains\/[a-z0-9/-]+$/.test(s.subpath ?? "") || !/^[A-Za-z_$][\w$]*$/.test(s.exportName ?? "")) {
      availability[kit.id] = { status: "requires-local-host", reason: "Core does not declare an installable browser factory for this Kit." }; continue;
    }
    const target = manifest.exports[s.subpath];
    if (typeof target !== "string" || !target.startsWith("./")) throw new Error(`Unsupported Core export record ${s.subpath}.`);
    const specifier = `nexusengine/${s.subpath.slice(2)}`;
    try {
      const result = await esbuild.build({ stdin: { contents: `export { ${s.exportName} as factory } from ${JSON.stringify(specifier)};`, resolveDir: root },
        bundle: true, write: false, metafile: true, platform: "browser", format: "esm", target: "es2022", logLevel: "silent",
        plugins: [browserBoundaryPlugin(coreRoot)] });
      if (result.warnings.length) throw new Error(result.warnings.map(w => w.text).join("; "));
      if (Object.values(result.metafile.outputs).some(o => o.imports.some(i => i.external))) throw new Error("Factory has an unresolved external import.");
      assertBrowserInputs(Object.keys(result.metafile.inputs));
      Object.keys(result.metafile.inputs).forEach(p => probeInputs.add(p));
      loaders.push(`${JSON.stringify(kit.id)}: async () => (await import(${JSON.stringify(specifier)}))[${JSON.stringify(s.exportName)}]`);
      availability[kit.id] = { status: "available", reason: "Core browser factory linked at build time; runtime validation still applies.", subpath: s.subpath, exportName: s.exportName };
    } catch (error) {
      availability[kit.id] = { status: "unsupported", reason: "Factory could not be linked for this browser build.", diagnostics: (error.errors?.map(e => e.text) ?? [error.message]).slice(0, 4) };
    }
  }
  const source = `const metadata=${JSON.stringify(availability)}; const factories={${loaders.join(',\n')}};
    export function kitAvailability(id){return metadata[id]??{status:"unsupported",reason:"Factory was not included in the browser build."};}
    export async function resolveKitFactory(entry){const m=metadata[entry.registryId];if(!m||m.status!=="available"||entry.source.registryId!=="nexusengine-core"||entry.source.subpath!==m.subpath||entry.source.exportName!==m.exportName)throw Object.assign(new Error("Kit factory is not trusted or browser-linked."),{code:"EDITOR_KIT_UNAVAILABLE"});return factories[entry.registryId]();}`;
  return { source, availability, probeInputs: [...probeInputs] };
}

/** Check paths before deleting staging; callers may not use source/test/dependency directories. */
export async function prepareStagingPath(root, out = 'dist') {
  const { lstat } = await import('node:fs/promises');
  root = resolve(root);
  const destination = resolve(root, out), rel = relative(root, destination).replaceAll(sep, '/');
  if (rel !== 'dist' && !/^\.build\/[A-Za-z0-9_-]+$/.test(rel)) throw new Error('Build staging must be dist or a named .build child, never source.');
  let current = root;
  for (const part of ['', ...rel.split('/')]) {
    if (part) current = resolve(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Build staging cannot traverse symlinks or non-directories.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return destination;
}

export async function verifyBrowserEvidence(root, deployment, evidence) {
  const deploymentHash = sha256(await readFile(resolve(root, 'deployment.json')));
  if (evidence?.status !== 'passed' || evidence.artifactFingerprint !== deployment.artifactFingerprint
    || evidence.deploymentHash !== deploymentHash || evidence.sourceFingerprint !== deployment.sourceFingerprint
    || evidence.coreCommit !== deployment.coreCommit || !Array.isArray(evidence.checks) || evidence.checks.length === 0
    || evidence.checks.some(c => c.status !== 'passed') || (evidence.errors?.length ?? 0) !== 0) {
    throw new Error('Browser proof must bind the exact deployment, source, Core identity, and passing checks.');
  }
}
