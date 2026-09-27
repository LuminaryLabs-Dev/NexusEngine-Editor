import { randomUUID } from "node:crypto";
import { createAuthoringWorkerPool } from "./jobs/pool.js";
import { createAuthoringRuntime } from "./runtime-composition.js";

const failure = (code, message, details = {}) => Object.assign(new Error(message), { code, details });

export async function createAuthoringHost({ store = null, projectDirectory = null, projectId = "project", maxQueue = 64, maxRequestBytes = 32 * 1024 * 1024 } = {}) {
  if (!store && projectDirectory) {
    const { createFileProjectStore } = await import("./storage/file-project.js");
    store = await createFileProjectStore(projectDirectory);
  }
  const manifest = await store?.manifest?.();
  const runtime = createAuthoringRuntime({ projectId: manifest?.projectId ?? projectId });
  let state = "opening", generation = manifest?.generation ?? 0, dirty = false, queued = 0, tail = Promise.resolve();
  const jobs = createAuthoringWorkerPool();
  try {
    if (manifest) await runtime.engine.n.authoringPersistence.load({ source: store.target });
    state = "ready";
  } catch (error) { runtime.dispose(); await jobs.close().catch(() => {}); throw error; }

  const assertReady = () => { if (!["ready", "operating"].includes(state)) throw failure("AUTHORING_HOST_CLOSED", `Host is ${state}.`); };
  const enqueue = (action) => {
    assertReady(); if (queued >= maxQueue) throw failure("AUTHORING_QUEUE_FULL", "Authoring queue is full."); queued++;
    const result = tail.then(async () => { if (state === "closed") throw failure("AUTHORING_HOST_CLOSED", "Host closed before queued operation."); if (state !== "closing") state = "operating"; try { return await action(); } finally { if (state === "operating") state = "ready"; } });
    tail = result.catch(() => {}).finally(() => queued--); return result;
  };
  const checkSize = (request, limit = maxRequestBytes) => { const encoded = JSON.stringify(request); if (Buffer.byteLength(encoded) > limit) throw failure("AUTHORING_REQUEST_BUDGET", "Request exceeds configured transport limit."); };

  async function saveNow() {
    if (!store?.target) throw failure("AUTHORING_STORAGE_UNAVAILABLE", "This host has no persistent Core storage target.");
    const receipt = await runtime.engine.n.authoringPersistence.save({ requestId: randomUUID(), target: store.target, expectedGeneration: generation });
    generation = receipt.generation; dirty = false;
    return { saved: true, generation, checkpoint: receipt.checkpoint, context: runtime.project.context(), receipt };
  }
  async function mutate(action, request, { derived = false } = {}) {
    checkSize(request, derived ? 192 * 1024 * 1024 : maxRequestBytes);
    const method = runtime.project[action];
    if (typeof method !== "function" || !["execute", "undo", "redo"].includes(action)) throw failure("AUTHORING_OPERATION_MISSING", "Unsupported project mutation.");
    const receipt = method.call(runtime.project, request); dirty = true; return receipt;
  }

  const api = {
    jobs,
    runtimeIdentity: runtime.identity,
    get engine() { return runtime.engine; },
    get projectRoot() { return store?.root ?? null; },
    status() { return { state, generation, dirty, queued, context: runtime.project.context(), runtime: runtime.identity, kitIds: runtime.kits, projectRoot: store?.root ?? null }; },
    requestId: () => randomUUID(),
    tools() { assertReady(); return runtime.project.tools(); },
    list(kind) { assertReady(); return runtime.project.listDocuments(kind); },
    read(id) { assertReady(); return runtime.project.getDocument(id); },
    snapshot(options) { assertReady(); return runtime.project.getSnapshot(options); },
    command(request) { return enqueue(() => mutate("execute", request)); },
    undo(request) { return enqueue(() => mutate("undo", request)); },
    redo(request) { return enqueue(() => mutate("redo", request)); },
    preview(request) { assertReady(); checkSize(request); return runtime.project.preview(request); },
    accept(preview) { return enqueue(() => { if (preview.epoch !== runtime.project.context().epoch || preview.baseClock !== runtime.project.context().clock) throw failure("AUTHORING_STALE_PREVIEW", "Preview source changed."); return mutate("execute", preview.request); }); },
    save() { return enqueue(saveNow); },
    async load() { if (!store?.target) throw failure("AUTHORING_STORAGE_UNAVAILABLE", "This host has no persistent Core storage target."); const receipt = await runtime.engine.n.authoringPersistence.load({ source: store.target }); generation = (await store.manifest()).generation; dirty = false; return receipt; },
    prepare(profile) { assertReady(); return runtime.engine.n.authoringPublishing.prepare(profile); },
    exportFormats() { assertReady(); return runtime.engine.n.authoringExport.formats(); },
    importFormats() { assertReady(); return runtime.engine.n.authoringImport.formats(); },
    inspectExport({ assemblyId = "scene", format = "glb", profile = {}, providerId } = {}) { assertReady(); return runtime.engine.n.authoringExport.inspect({ assemblyId, format, profile, providerId }); },
    exportArtifact({ assemblyId = "scene", format = "glb", outputDirectory, profile = {}, providerId, signal, onProgress = () => {} } = {}) {
      assertReady();
      return runtime.engine.n.authoringExport.export({ requestId: randomUUID(), assemblyId, format, profile, providerId, ...(outputDirectory ? { target: { storage: "filesystem", path: outputDirectory } } : {}), signal, onProgress });
    },
    inspectImport(input) { assertReady(); return runtime.engine.n.authoringImport.inspect(input); },
    create(input) { return enqueue(async () => { const result = runtime.engine.n.authoringCreate.create(input); dirty = true; return result; }); },
    importAsset(input) { return enqueue(async () => { const result = await runtime.engine.n.authoringImport.import(input); dirty = true; return result; }); },
    commitImport(plan) { return enqueue(async () => { const result = runtime.engine.n.authoringImport.commit(plan); dirty = true; return result; }); },
    validateProject() { assertReady(); return runtime.engine.n.authoringValidation.project(); },
    validateDocument(id) { assertReady(); return runtime.engine.n.authoringValidation.document(id); },
    validateExport(input) { assertReady(); return runtime.engine.n.authoringValidation.format(input); },
    startSequence(id, options) { assertReady(); return runtime.engine.n.authoringSequence.start(id, options); },
    advanceSequence(execution, stepId) { return enqueue(async () => { try { const receipt = await mutate("execute", execution.request(stepId)); return execution.acknowledge(stepId, receipt); } catch (error) { execution.fail(stepId, error); throw error; } }); },
    commitDerived(source, operations) { return enqueue(() => { for (const item of source) { const current = runtime.project.getDocument(item.id); if (current.revision !== item.revision || current.hash !== item.hash) throw failure("AUTHORING_STALE_EVALUATION", "Source changed during background evaluation."); } return mutate("execute", { requestId: randomUUID(), epoch: runtime.project.context().epoch, operations }, { derived: true }); }); },
    async close({ save = false } = {}) { if (state === "closed") return { closed: true }; if (state === "closing") throw failure("AUTHORING_HOST_CLOSING", "Close is already running."); state = "closing"; await jobs.close(); await tail; try { if (save && dirty && store?.target) await saveNow(); runtime.dispose(); state = "closed"; return { closed: true, saved: save && !dirty }; } catch (error) { state = "ready"; throw error; } },
  };
  return api;
}
