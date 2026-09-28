import { createCommandQueue } from "./command-queue.js";
import { createEngine, NEXUS_ENGINE_VERSION, CORE_REGISTRY_SHA256 } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";
import { createEditorWorkbench } from "./controller.js";
import { disposeAuthoringRuntime } from "./play-controller.js";
import { capabilitiesFor, editorError, HOST_SCHEMA, assertSourceCommandAllowed } from "./host-contract.js";
import { CORE_IDENTITY } from "./core-identity.js";
export const BROWSER_CORE_COMMIT = CORE_IDENTITY.commit;
export const BROWSER_CORE_REGISTRY = CORE_IDENTITY.registryHash;
const view = { width: 1280, height: 800, background: [.035, .045, .065], exposure: 1, camera: null,
  lights: [{ id: "key", kind: "directional", color: [1, .91, .8], intensity: 4, position: [4, 6, 5], castsShadow: true },
    { id: "ambient", kind: "ambient", color: [1, 1, 1], intensity: .65, castsShadow: false }] };
const contextKey = c => JSON.stringify([c.projectId, c.epoch, c.clock]);


export async function createBrowserWorkbenchHost({ projectId = "browser-project", projectKey,
  assemblyId = "scene", storage = "indexeddb", restore = true, preferences = undefined,
  runtimeFactory = options => createEngine({ kits: createAuthoringDomain(options) }) } = {}) {
  if (!['indexeddb', 'memory'].includes(storage)) throw editorError("EDITOR_STORAGE", "Browser host supports only Core IndexedDB and memory storage.");
  if (`sha256:${CORE_REGISTRY_SHA256}` !== CORE_IDENTITY.registryHash) throw editorError("EDITOR_CORE_IDENTITY", "Installed Core registry differs from the pinned package identity.");
  if (preferences === undefined) { try { preferences = globalThis.localStorage; } catch { preferences = null; } }
  const prefGet = key => { try { return preferences?.getItem(key); } catch { return null; } };
  const prefSet = (key, value) => { try { preferences?.setItem(key, value); } catch { /* Preferences are optional; project persistence is not. */ } };
  let key = projectKey ?? prefGet("nexusengine-editor:last-project") ?? "default";
  let activeAssembly = assemblyId, generation = 0, savedContext = null, closed = false, runtime;
  const requestId = () => crypto.randomUUID();
  function makeRuntime(id) {
    const engine = runtimeFactory({ project: { projectId: id } }), project = engine.n.authoringProject;
    const adapter = { engine, requestId, list: kind => project.listDocuments(kind), read: id => project.getDocument(id),
      snapshot: options => project.getSnapshot(options), status: () => ({ context: project.context() }),
      command: async request => project.execute(request), commitImport: async plan => engine.n.authoringImport.commit(plan) };
    return { engine, project, workbench: createEditorWorkbench(adapter, { build: false }) };
  }
  runtime = makeRuntime(projectId);
  function assertOpen() { if (closed) throw editorError("EDITOR_HOST_CLOSED", "Editor host is disposed."); }
  function status() {
    return { state: closed ? "closed" : "ready", generation,
      dirty: contextKey(runtime.project.context()) !== savedContext,
      projectKey: key, context: runtime.project.context(), kitIds: runtime.engine.kits.map(k => k.id),
      runtime: { runtime: "nexusengine-browser", version: NEXUS_ENGINE_VERSION, coreCommit: CORE_IDENTITY.commit } };
  }
  function chooseAssembly(id = activeAssembly) {
    const assemblies = runtime.project.listDocuments("assembly");
    activeAssembly = assemblies.some(a => a.id === id) ? id : (assemblies[0]?.id ?? "scene");
  }
  function state() {
    assertOpen(); chooseAssembly();
    const hasAssembly = runtime.project.listDocuments("assembly").some(d => d.id === activeAssembly);
    return { schema: HOST_SCHEMA, status: status(), documents: runtime.project.listDocuments(),
      assemblyId: activeAssembly, assembly: hasAssembly ? runtime.project.getDocument(activeAssembly) : null,
      view: structuredClone(view), validation: runtime.engine.n.authoringValidation.project(),
      importFormats: runtime.engine.n.authoringImport.formats(), exportFormats: runtime.engine.n.authoringExport.formats(),
      capabilities: capabilitiesFor("browser", { persistent: storage === "indexeddb", storage }), workbench: runtime.workbench.state() };
  }
  async function loadKey(nextKey) {
    if (typeof nextKey !== "string" || !nextKey.trim()) throw editorError("EDITOR_PROJECT_KEY", "A project key is required.");
    // Read through Core, discover project identity, and load into a candidate runtime before swapping.
    const target = { storage, path: nextKey };
    const bundle = await runtime.engine.n.authoringStorageRegistry.get(storage).read(target);
    const candidate = makeRuntime(bundle.projectId);
    try {
      const receipt = await candidate.engine.n.authoringPersistence.load({ source: target });
      runtime.workbench.play.stop(); disposeAuthoringRuntime(runtime.engine);
      runtime = candidate; key = nextKey; generation = receipt.generation;
      savedContext = contextKey(runtime.project.context()); chooseAssembly(prefGet(`nexusengine-editor:assembly:${key}`) ?? assemblyId);
      prefSet("nexusengine-editor:last-project", key); return receipt;
    } catch (error) { disposeAuthoringRuntime(candidate.engine); throw error; }
  }
  async function dispatch(method, p = {}) {
    assertOpen();
    assertSourceCommandAllowed(method, runtime.workbench.play.status().state);
    const engine = runtime.engine, project = runtime.project;
    switch (method) {
      case "status": return status();
      case "state": return state();
      case "list": return project.listDocuments(p.kind);
      case "read": return project.getDocument(p.id);
      case "create": return engine.n.authoringCreate.create(p);
      case "execute": return project.execute(p);
      case "undo": return project.undo(p);
      case "redo": return project.redo(p);
      case "save": {
        const receipt = await engine.n.authoringPersistence.save({ requestId: requestId(), target: { storage, path: key }, expectedGeneration: generation });
        generation = receipt.generation; savedContext = contextKey(receipt.source);
        prefSet("nexusengine-editor:last-project", key); prefSet(`nexusengine-editor:assembly:${key}`, activeAssembly); return receipt;
      }
      case "load": return loadKey(key);
      case "new-project": {
        if (typeof p.key !== "string" || !p.key.trim()) throw editorError("EDITOR_PROJECT_KEY", "A project key is required.");
        try {
          await engine.n.authoringStorageRegistry.get(storage).read({ storage, path: p.key });
          throw editorError("EDITOR_PROJECT_EXISTS", "This project key is already saved. Open it or choose a new key.");
        } catch (error) { if (error.code !== "AUTHORING_STORAGE_MISSING") throw error; }
        const candidate = makeRuntime(projectId);
        try { await candidate.workbench.composition.ensure(); }
        catch (error) { disposeAuthoringRuntime(candidate.engine); throw error; }
        runtime.workbench.play.stop(); disposeAuthoringRuntime(engine);
        runtime = candidate; key = p.key; generation = 0; savedContext = null; activeAssembly = "scene";
        return state();
      }
      case "open-project": return loadKey(p.key);
      case "select-assembly": {
        const doc = project.getDocument(p.id); if (doc.kind !== "assembly") throw editorError("EDITOR_ASSEMBLY", "Select an assembly document.");
        activeAssembly = doc.id; return state();
      }
      case "validate-project": return engine.n.authoringValidation.project();
      case "validate-document": return engine.n.authoringValidation.document(p.id);
      case "validate-export": return engine.n.authoringValidation.format({ ...p, assemblyId: p.assemblyId ?? activeAssembly });
      case "export-formats": return engine.n.authoringExport.formats();
      case "import-formats": return engine.n.authoringImport.formats();
      case "inspect-export": return engine.n.authoringExport.inspect({ ...p, assemblyId: p.assemblyId ?? activeAssembly });
      case "export": return engine.n.authoringExport.export({ requestId: p.requestId ?? requestId(), assemblyId: p.assemblyId ?? activeAssembly, format: p.format ?? "glb", providerId: p.providerId });
      case "workbench-import-inspect":
      case "import-inspect": return engine.n.authoringImport.inspect({ ...p, requestId: p.requestId ?? requestId(), prefix: p.prefix ?? "import", resources: p.resources ?? {} });
      case "workbench-import-commit":
      case "import-commit": {
        const receipt = engine.n.authoringImport.commit(p.plan); chooseAssembly(receipt.assemblyId); return receipt;
      }
      case "import": {
        const receipt = await engine.n.authoringImport.import({ ...p, requestId: p.requestId ?? requestId(), prefix: p.prefix ?? "import", resources: p.resources ?? {} });
        chooseAssembly(receipt.assemblyId); return receipt;
      }
      case "play": return runtime.workbench.play.start({ ...p, assemblyId: p.assemblyId ?? activeAssembly });
      case "build-targets": return [];
      default: return runtime.workbench.execute(method, p);
    }
  }
  const queue = createCommandQueue(dispatch);
  const execute = queue.execute;
  async function preview({ play = false } = {}) {
    if (queue.closing) throw editorError("EDITOR_HOST_CLOSED", "Editor host is closing.");
    await queue.idle(); assertOpen();
    return play ? runtime.workbench.play.preview() : runtime.engine.n.authoringExport.export({ assemblyId: activeAssembly, format: "glb" });
  }
  try {
  await runtime.workbench.composition.ensure();
  if (restore && prefGet("nexusengine-editor:last-project") === key) {
    try { await loadKey(key); } catch (error) { if (error.code !== "AUTHORING_STORAGE_MISSING") throw error; }
  }
  } catch (error) { disposeAuthoringRuntime(runtime.engine); closed = true; throw error; }
  return Object.freeze({ state, execute, preview, save: () => execute("save"), load: () => execute("load"),
    newProject: key => execute("new-project", { key }), openProject: key => execute("open-project", { key }),
    dispose() { return queue.close(() => { if (closed) return; runtime.workbench.play.stop(); disposeAuthoringRuntime(runtime.engine); closed = true; }); },
    get engine() { return runtime.engine; }, get project() { return runtime.project; }, get workbench() { return runtime.workbench; } });
}
