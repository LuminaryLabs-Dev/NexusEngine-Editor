import { requireDependencies } from "./dependency-doctor.mjs";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { workbenchHtml } from "../src/workbench/shell.js";
import { sha256, stable, walk, fileRecord, coreLocation, browserBoundaryPlugin, createBrowserFactorySource, verifyArtifact, assertBrowserInputs, prepareStagingPath } from "./static-build-support.mjs";

export async function buildStaticSite({ root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), out = "dist" } = {}) {
  const destination = await prepareStagingPath(root, out);
  await requireDependencies({ root, mode: "build" });
  const esbuild = await import("esbuild");
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  if (esbuild.version !== pkg.dependencies.esbuild) throw new Error("Build tool version differs from package.json.");
  const coreRoot = coreLocation();
  const { CORE_REGISTRY_SHA256 } = await import("nexusengine");
  const { createEngineRegistrySnapshot } = await import("nexusengine/domains/composition");
  if (`sha256:${CORE_REGISTRY_SHA256}` !== pkg.nexusEngineArtifact.registryHash) throw new Error("Installed Core registry differs from the pinned package.");
  const sourceParent = process.env.NEXUS_EDITOR_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(sourceParent)) throw new Error("A verified source-parent commit is required.");
  const registry = createEngineRegistrySnapshot();
  const factory = await createBrowserFactorySource({ esbuild, root, coreRoot, registry });
  for (const id of ["input-contract-kit", "body-state-kit", "box-shape-kit"]) if (factory.availability[id]?.status !== "available") throw new Error(`Required proof Kit ${id} did not link: ${JSON.stringify(factory.availability[id])}`);
  await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
  const result = await esbuild.build({ absWorkingDir: root, entryPoints: { editor: "src/workbench/browser-client.js" },
    outdir: destination, bundle: true, format: "esm", platform: "browser", target: "es2022", splitting: true,
    chunkNames: "editor-assets/chunks/[name]-[hash]", assetNames: "editor-assets/[name]-[hash]", minify: true,
    sourcemap: false, legalComments: "eof", metafile: true, logLevel: "silent",
    plugins: [browserBoundaryPlugin(coreRoot, { resolverPath: resolve(root, "src/workbench/adapters/kit-factories.js"), resolverSource: factory.source })] });
  if (result.warnings.length) throw new Error(`Bundle warnings must be resolved: ${result.warnings.map(w => w.text).join("; ")}`);
  for (const output of Object.values(result.metafile.outputs)) if (output.imports.some(i => i.external)) throw new Error("Browser bundle contains external imports.");
  assertBrowserInputs(Object.keys(result.metafile.inputs));
  await mkdir(resolve(destination, "editor-assets"), { recursive: true });
  await cp(resolve(root, "assets/favicon.svg"), resolve(destination, "editor-assets/favicon.svg"));
  const thirdParty = await Promise.all([readFile(resolve(coreRoot, "LICENSE"), "utf8"), readFile(resolve(root, "node_modules/three/LICENSE"), "utf8")]);
  await writeFile(resolve(destination, "editor-assets/THIRD-PARTY-NOTICES.txt"), thirdParty.join("\n\n"));
  await writeFile(resolve(destination, "index.html"), workbenchHtml()); await writeFile(resolve(destination, ".nojekyll"), "");
  const sourcePaths = new Set([...Object.keys(result.metafile.inputs), "package.json", "scripts/build-static-site.mjs", "scripts/static-build-support.mjs", "scripts/dependency-doctor.mjs", "package-lock.json", "src/workbench/shell.js", "assets/favicon.svg", "node_modules/three/LICENSE", relative(root, resolve(coreRoot, "LICENSE"))]);
  const sources = [];
  for (const path of [...sourcePaths].sort()) {
    if (!path.includes(":")) sources.push(await fileRecord(root, path));
  }
  const generatedFactoryHash = sha256(factory.source);
  const sourceFingerprint = sha256(stable({ sources, generatedFactoryHash }));
  const files = await Promise.all((await walk(destination)).map(path => fileRecord(destination, path)));
  const deployment = { schema: "nexusengine-editor.deployment/3", deploymentMode: "sandbox-built-main-root", sourceParent,
    coreCommit: pkg.nexusEngineArtifact.commit, coreRegistry: pkg.nexusEngineArtifact.registryHash,
    compositionRegistry: registry.contentHash, bundler: { name: "esbuild", version: esbuild.version },
    sources, generatedFactoryHash, sourceFingerprint, files, artifactFingerprint: sha256(stable(files)),
    browserFactories: { included: Object.values(factory.availability).filter(x => x.status === "available").length,
      unavailable: Object.entries(factory.availability).filter(([, x]) => x.status !== "available").map(([id, x]) => ({ id, ...x })) },
    browserBoundaries: ["filesystem-storage: unavailable", "filesystem-artifact-publication: unavailable"], entry: "index.html" };
  await writeFile(resolve(destination, "deployment.json"), stable(deployment));
  await mkdir(resolve(root, ".test-results"), { recursive: true });
  await writeFile(resolve(root, ".test-results/bundle-metafile.json"), stable(result.metafile));
  await verifyArtifact(destination, { strict: true });
  console.log(`Built ${files.length} browser deployment files; artifact ${deployment.artifactFingerprint}`);
  return deployment;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildStaticSite();
