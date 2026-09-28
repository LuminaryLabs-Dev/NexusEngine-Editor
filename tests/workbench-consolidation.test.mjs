import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngine } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";
import { createBrowserWorkbenchHost } from "../src/workbench/browser-host.js";
import { createSceneCommands } from "../src/workbench/scene-commands.js";
import { assertHost, capabilitiesFor } from "../src/workbench/host-contract.js";
import { createLocalWorkbenchAdapter } from "../src/workbench/adapters/local.js";
import { createLocalWorkbenchSession } from "../src/workbench/adapters/local-session.js";
import { encodeWire, decodeWire } from "../src/workbench/adapters/binary-wire.js";
import { artifactDownload } from "../src/workbench/ui/download.js";
import { generatedPath, fileRecord, sha256, stable, verifyArtifact, assertBrowserInputs } from "../scripts/static-build-support.mjs";
const options = () => ({ storage: "memory", restore: false, preferences: null, projectKey: crypto.randomUUID() });
const open = () => createBrowserWorkbenchHost(options());
const context = p => JSON.stringify([p.projectId, p.epoch, p.clock]);
function assertRestoredSource(actual, expected) {
  // Core load intentionally rebases live revisions and epoch; content and history remain authoritative.
  const content = s => Object.fromEntries(Object.entries(s.documents).map(([id, {revision, ...document}]) => [id, document]));
  assert.deepEqual(content(actual), content(expected));
  assert.ok(actual.epoch > expected.epoch);
  for (const [id, document] of Object.entries(actual.documents)) assert.ok(document.revision > expected.documents[id].revision);
  assert.deepEqual(actual.undo, expected.undo);
  assert.deepEqual(actual.redo, expected.redo);
  assert.deepEqual(actual.receipts, expected.receipts);
}

test("host contract rejects incomplete adapters", () => {
  assert.throws(() => assertHost({ state() {} }), /execute/);
  assert.equal(capabilitiesFor("browser").build.status, "requires-local-host");
  assert.equal(capabilitiesFor("local", { build: true }).build.status, "available");
});

test("real Core creation and scene attachment commit atomically", async () => {
  const host = await open(); try {
    const commands = createSceneCommands(host), before = host.project.getSnapshot();
    await assert.rejects(commands.createPrimitive("not-a-primitive"));
    assert.deepEqual(host.project.getSnapshot(), before);
    const id = await commands.createPrimitive("box");
    const after = host.project.getSnapshot();
    assert.equal(after.undo.length, before.undo.length + 1);
    assert.equal(host.state().assembly.content.nodes[0].id, id);
    await commands.travel("undo"); assert.equal(host.state().assembly, null);
    await commands.travel("redo"); assert.equal(host.state().assembly.content.nodes[0].id, id);
  } finally { await host.dispose(); }
});

test("shared edit, duplicate, delete and history commands use real Core operations", async () => {
  const host = await open(); try {
    const commands = createSceneCommands(host), id = await commands.createPrimitive("box");
    await commands.updateNode(id, { name: "Edited cube", transform: { translation: [2, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
    const copy = await commands.duplicateNode(id);
    assert.equal(host.state().assembly.content.nodes.length, 2);
    await commands.deleteNode(copy); assert.equal(host.state().assembly.content.nodes.length, 1);
    await commands.travel("undo"); assert.equal(host.state().assembly.content.nodes.length, 2);
    assert.equal(host.state().assembly.content.nodes.find(n => n.id === id).name, "Edited cube");
  } finally { await host.dispose(); }
});

test("memory save reports clean state and fresh-runtime load preserves source documents", async () => {
  const opts = options(), first = await createBrowserWorkbenchHost(opts);
  await createSceneCommands(first).createPrimitive("box"); await first.save();
  assert.equal(first.state().status.dirty, false);
  const expected = first.project.getSnapshot(); await first.dispose();
  const second = await createBrowserWorkbenchHost(opts);
  try { await second.load(); assertRestoredSource(second.project.getSnapshot(), expected);
    assert.equal(second.state().status.dirty, false); assert.deepEqual(second.project.getSnapshot().undo, expected.undo); }
  finally { await second.dispose(); }
});

test("failed open leaves current project and project key intact", async () => {
  const host = await open(); try {
    await createSceneCommands(host).createPrimitive("box"); const before = host.project.getSnapshot(), key = host.state().status.projectKey;
    await assert.rejects(host.openProject(crypto.randomUUID()), { code: "AUTHORING_STORAGE_MISSING" });
    assert.deepEqual(host.project.getSnapshot(), before); assert.equal(host.state().status.projectKey, key);
  } finally { await host.dispose(); }
});

test("two writers cannot silently overwrite a saved generation", async () => {
  const opts = options(), first = await createBrowserWorkbenchHost(opts); await first.save();
  const second = await createBrowserWorkbenchHost(opts); await second.load();
  try {
    await createSceneCommands(first).createPrimitive("box"); await first.save();
    await createSceneCommands(second).createPrimitive("sphere");
    await assert.rejects(second.save(), { code: "AUTHORING_STORAGE_CONFLICT" }); assert.equal(second.state().status.dirty, true);
  } finally { await first.dispose(); await second.dispose(); }
});

test("exact Project request retries remain idempotent through the browser adapter", async () => {
  const host = await open(); try {
    const request = { requestId: crypto.randomUUID(), epoch: host.project.context().epoch, operations: [{ id: "mesh.cube", args: { id: "once" } }] };
    await host.execute("execute", request); const before = host.project.getSnapshot();
    await host.execute("execute", request); assert.deepEqual(host.project.getSnapshot(), before);
  } finally { await host.dispose(); }
});

test("GLB, FBX, USDZ export and native reimport use Core, not Editor codecs", async () => {
  const source = await open(); await createSceneCommands(source).createPrimitive("box");
  try {
    for (const format of ["glb", "fbx", "usdz"]) {
      const artifact = await source.execute("export", { format }); assert.ok(artifact.bytes.byteLength > 0); assert.equal(artifact.validation.errors, 0);
      const target = await open();
      try {
        const inspected = await target.execute("import-inspect", { format, bytes: artifact.bytes, resources: artifact.resources, prefix: "imported" });
        assert.equal(inspected.validation.errors, 0);
        const receipt = await target.execute("import-commit", { plan: inspected.plan });
        assert.equal(target.state().assemblyId, receipt.assemblyId);
        assert.ok(target.state().assembly.content.nodes.some(n => n.meshId));
        assert.equal(target.state().validation.errors, 0);
      } finally { await target.dispose(); }
    }
  } finally { await source.dispose(); }
});

test("bad import bytes and stale import plans do not mutate current source", async () => {
  const source = await open(), target = await open();
  try {
    const before = target.project.getSnapshot();
    await assert.rejects(target.execute("import-inspect", { format: "glb", prefix: "bad", bytes: new Uint8Array([1, 2]) }));
    assert.deepEqual(target.project.getSnapshot(), before);
    await createSceneCommands(source).createPrimitive("box"); const artifact = await source.execute("export", { format: "glb" });
    const inspection = await target.execute("import-inspect", { format: "glb", prefix: "stale", bytes: artifact.bytes });
    await createSceneCommands(target).createPrimitive("sphere"); const modified = target.project.getSnapshot();
    await assert.rejects(target.execute("import-commit", { plan: inspection.plan }), { code: "AUTHORING_STALE_SOURCE" });
    assert.deepEqual(target.project.getSnapshot(), modified);
  } finally { await source.dispose(); await target.dispose(); }
});

test("Play moves only the clone; pause stops ticks and source mutation is guarded", async () => {
  const host = await open(); try {
    const commands = createSceneCommands(host), id = await commands.createPrimitive("box"), before = host.project.getSnapshot();
    await host.execute("play", { autoTick: false, controlledNodeId: id }); await host.execute("play-input", { x: 1 }); await host.execute("play-tick", { delta: 1 / 60 });
    const frame = await host.execute("play-frame"); assert.ok(frame.nodes[0].transform.translation[0] > 0);
    await assert.rejects(commands.updateNode(id, { name: "forbidden" }), { code: "EDITOR_SOURCE_PROTECTED" });
    await host.execute("pause"); const paused = await host.execute("play-frame"); await host.execute("play-tick", { delta: 1 / 60 });
    assert.deepEqual(await host.execute("play-frame"), paused);
    await host.execute("resume"); await host.execute("stop"); assert.deepEqual(host.project.getSnapshot(), before);
  } finally { await host.dispose(); }
});

test("invalid Play delta cannot corrupt runtime state", async () => {
  const host = await open(); try { await host.execute("play", { autoTick: false });
    await assert.rejects(host.execute("play-tick", { delta: NaN }), { code: "EDITOR_PLAY_DELTA" });
    assert.equal(host.workbench.play.status().ticks, 0); await host.execute("stop"); }
  finally { await host.dispose(); }
});

test("dependency composition uses Core validation and blocks removing a required Kit", async () => {
  const host = await open(); try {
    await host.execute("composition-add-kit", { kitId: "body-state-kit" });
    assert.equal((await host.execute("composition-plan")).ok, true);
    const before = host.project.getSnapshot();
    await assert.rejects(host.execute("composition-remove-kit", { kitId: "physics-domain-contract-kit" }), { code: "EDITOR_COMPOSITION_INVALID" });
    assert.deepEqual(host.project.getSnapshot(), before);
    await host.execute("play", { autoTick: false }); assert.ok(host.workbench.play.runtime.n.physicsBodyState); await host.execute("stop");
  } finally { await host.dispose(); }
});

test("proof recipe commits scene and complete composition in one transaction", async () => {
  const host = await open(); try {
    const before = host.project.getSnapshot(); const result = await host.execute("create-validation-game");
    assert.equal(result.ready, true); assert.equal(result.physicsExecution, false);
    assert.equal(host.project.getSnapshot().undo.length, before.undo.length + 1);
    await host.execute("play", { autoTick: false }); const artifact = await host.preview({ play: true }); assert.equal(artifact.validation.errors, 0); await host.execute("stop");
    const snapshot = host.project.getSnapshot(); await assert.rejects(host.execute("create-validation-game")); assert.deepEqual(host.project.getSnapshot(), snapshot);
  } finally { await host.dispose(); }
});

test("binary transport preserves byte arrays and rejects malformed envelopes", () => {
  const original = { bytes: Uint8Array.from({ length: 10000 }, (_, i) => i % 256), resources: { "textures/a.png": new Uint8Array([0, 255]) } };
  assert.deepEqual(decodeWire(JSON.parse(JSON.stringify(encodeWire(original)))), original);
  assert.throws(() => decodeWire({ $editorBytes: "base64/1", data: "AA==", length: 2 }), /length/);
  assert.throws(() => decodeWire({ $editorBytes: "base64/1", data: "?", length: 1 }));
});

test("download transport packages relative resources without flattening filenames", async () => {
  const output = artifactDownload({ format: "fbx", fileName: "scene.fbx", bytes: new Uint8Array([1, 2, 3]), resources: { "textures/stone.png": new Uint8Array([4, 5]), "other/stone.png": new Uint8Array([6, 7]) } });
  assert.equal(output.name, "scene.zip"); assert.equal(new DataView(output.bytes.buffer).getUint32(0, true), 0x04034b50);
  await mkdir(".test-results", { recursive: true }); await writeFile(".test-results/export-resources.zip", output.bytes);
  assert.throws(() => artifactDownload({ fileName: "scene.fbx", bytes: new Uint8Array(), resources: { "../bad": new Uint8Array() } }));
});

async function nodeCoreHost(root, projectId = "local-test") {
  const engine = createEngine({ kits: createAuthoringDomain({ project: { projectId } }) }), project = engine.n.authoringProject;
  let generation = 0, saved = null;
  const target = { storage: "filesystem", path: root };
  return { engine, projectRoot: root, requestId: () => crypto.randomUUID(), list: k => project.listDocuments(k), read: id => project.getDocument(id), snapshot: () => project.getSnapshot(),
    status: () => ({ context: project.context(), generation, projectRoot: root, dirty: context(project.context()) !== saved }),
    command: async r => project.execute(r), create: async r => engine.n.authoringCreate.create(r), undo: async r => project.undo(r), redo: async r => project.redo(r),
    inspectImport: r => engine.n.authoringImport.inspect(r), commitImport: async p => engine.n.authoringImport.commit(p), importAsset: r => engine.n.authoringImport.import(r),
    exportArtifact: p => engine.n.authoringExport.export({ assemblyId: p.assemblyId, format: p.format, requestId: crypto.randomUUID() }), inspectExport: p => engine.n.authoringExport.inspect(p),
    exportFormats: () => engine.n.authoringExport.formats(), importFormats: () => engine.n.authoringImport.formats(), validateProject: () => engine.n.authoringValidation.project(),
    async save() { const r = await engine.n.authoringPersistence.save({ requestId: crypto.randomUUID(), target, expectedGeneration: generation }); generation = r.generation; saved = context(r.source); return r; },
    async load() { const r = await engine.n.authoringPersistence.load({ source: target }); generation = r.generation; saved = context(project.context()); return r; },
  };
}

test("real local HTTP adapter and Core filesystem session complete the same command workflow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-local-adapter-"));
  const host = await nodeCoreHost(directory), session = createLocalWorkbenchSession(host, { view: {} });
  const server = http.createServer(async (request, response) => {
    try {
      let result;
      if (request.method === "GET") result = session.state();
      else { const chunks = []; for await (const chunk of request) chunks.push(chunk); const q = JSON.parse(Buffer.concat(chunks)); result = await session.execute(q.method, decodeWire(q.params)); }
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(encodeWire({ ok: true, result })));
    } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const adapter = createLocalWorkbenchAdapter({ baseUrl: `http://127.0.0.1:${server.address().port}/` });
  try {
    const commands = createSceneCommands(adapter); const id = await commands.createPrimitive("box");
    await commands.updateNode(id, { name: "Through HTTP" }); await adapter.execute("save");
    const before = host.snapshot(); const restored = await nodeCoreHost(directory); await restored.load(); assertRestoredSource(restored.snapshot(), before);
    const preview = await adapter.preview(); assert.ok(preview.bytes instanceof Uint8Array); assert.equal(preview.validation.errors, 0);
    await adapter.execute("play", { autoTick: false, controlledNodeId: id }); await adapter.execute("play-input", { x: 1 }); await adapter.execute("play-tick", { delta: 1 / 60 }); await adapter.execute("stop");
    assert.deepEqual(host.snapshot(), before);
    for (const format of ["glb", "fbx", "usdz"]) assert.equal((await adapter.execute("export", { format })).validation.errors, 0);
  } finally { await adapter.dispose(); server.closeAllConnections(); await new Promise(done => server.close(done)); await rm(directory, { recursive: true, force: true }); }
});

test("generated-path guard cannot claim source code or parent directories", () => {
  for (const path of ["src/main.js", "package.json", "../index.html", "editor-assets/../src/main.js"]) assert.equal(generatedPath(path), false, path);
  for (const path of ["index.html", "editor.js", "editor-assets/chunks/a-ABC123.js"]) assert.equal(generatedPath(path), true, path);
});

test("artifact manifest validates every file and detects changed bundle bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-artifact-"));
  try {
    for (const path of ["index.html", "editor.js", "editor.css", ".nojekyll"]) await writeFile(join(dir, path), path);
    const files = await Promise.all([".nojekyll", "editor.css", "editor.js", "index.html"].map(p => fileRecord(dir, p)));
    await writeFile(join(dir, "deployment.json"), stable({ schema: "nexusengine-editor.deployment/3", files, artifactFingerprint: sha256(stable(files)) }));
    await verifyArtifact(dir); await writeFile(join(dir, "editor.js"), "changed"); await assert.rejects(verifyArtifact(dir), /changed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("browser graph retains Core catalog metadata but rejects executable Build and legacy GUI", () => {
  assertBrowserInputs(["node_modules/nexusengine/src/core-domains/build/domain.manifest.js", "node_modules/nexusengine/src/core-domains/build/manifest-input.js", "node_modules/nexusengine/src/core-domains/build/source/kits/project-source-kit/kit.manifest.js"]);
  for (const path of ["src/main.js", "src/dsk-html-builder.js", "src/workbench/build-controller.js", "node_modules/nexusengine/src/core-domains/build/index.js", "node_modules/nexusengine/src/core-domains/build/compile/services.js"])
    assert.throws(() => assertBrowserInputs([path]), /Server\/legacy/);
});
