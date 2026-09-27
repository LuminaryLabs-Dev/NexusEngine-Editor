import { createEngine, NEXUS_ENGINE_VERSION } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";
import { createEditorWorkbench } from "./index.js";

export const BROWSER_CORE_COMMIT = "784e514722febf8fb09ca55a058b2736e93679bd";
export const BROWSER_CORE_REGISTRY = "sha256:3b520f699299e0f8bc4fdab8a4b2297c823d94b22dbee30ee250d873e39cd30e";

const copy = (value) => structuredClone(value);
const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });
const requestId = () => crypto.randomUUID();
const defaultView = Object.freeze({
  schema: "nexusengine.authoring-view/1",
  width: 1280,
  height: 800,
  background: [0.035, 0.045, 0.065],
  exposure: 1,
  camera: null,
  lights: [
    { id: "key", kind: "directional", color: [1, 0.91, 0.8], intensity: 4, position: [4, 6, 5], castsShadow: true },
    { id: "fill", kind: "directional", color: [0.65, 0.78, 1], intensity: 1.5, position: [-4, 2, 1], castsShadow: false },
    { id: "ambient", kind: "ambient", color: [1, 1, 1], intensity: 0.65, castsShadow: false }
  ]
});

export async function createBrowserWorkbenchHost({
  projectId = "browser-project",
  projectKey = localStorage.getItem("nexusengine-editor:last-project") || "default",
  assemblyId = "scene",
} = {}) {
  let generation = 0;
  let dirty = false;
  let runtime = null;
  let workbench = null;
  let host = null;
  let key = String(projectKey || "default");

  function makeRuntime() {
    workbench?.play?.stop?.();
    const engine = createEngine({ kits: createAuthoringDomain({ project: { projectId } }) });
    const project = engine.n.authoringProject;
    const adapter = {
      engine,
      requestId,
      read: (id) => project.getDocument(id),
      list: (kind) => project.listDocuments(kind),
      snapshot: (options) => project.getSnapshot(options),
      status: () => ({ state: "ready", generation, dirty, projectKey: key, context: project.context(), kitIds: engine.kits.map((kit) => kit.id) }),
      command: async (input) => { const receipt = project.execute(input); dirty = true; return receipt; },
      commitImport: async (plan) => { const receipt = engine.n.authoringImport.commit(plan); dirty = true; return receipt; },
    };
    runtime = { engine, project, adapter };
    workbench = createEditorWorkbench(adapter, { build: false });
    host = adapter;
    return runtime;
  }

  makeRuntime();

  async function ensureComposition() {
    const existed = runtime.project.listDocuments("domain-composition").some((document) => document.id === "project-composition");
    try {
      await workbench.execute("composition-ensure");
      if (!existed) dirty = true;
    } catch (error) {
      if (error?.code !== "AUTHORING_REQUEST_CONFLICT") throw error;
    }
  }

  async function save() {
    const receipt = await runtime.engine.n.authoringPersistence.save({
      requestId: requestId(),
      target: { storage: "indexeddb", path: key },
      expectedGeneration: generation,
    });
    generation = receipt.generation;
    dirty = false;
    localStorage.setItem("nexusengine-editor:last-project", key);
    return receipt;
  }

  async function load() {
    const receipt = await runtime.engine.n.authoringPersistence.load({
      source: { storage: "indexeddb", path: key },
    });
    generation = receipt.generation;
    dirty = false;
    localStorage.setItem("nexusengine-editor:last-project", key);
    return receipt;
  }

  async function newProject(nextKey = `project-${Date.now()}`) {
    key = String(nextKey || `project-${Date.now()}`);
    generation = 0;
    dirty = false;
    makeRuntime();
    await ensureComposition();
    localStorage.setItem("nexusengine-editor:last-project", key);
    return state();
  }

  async function openProject(nextKey) {
    if (!nextKey) throw fail("EDITOR_PROJECT_KEY", "A browser project key is required.");
    key = String(nextKey);
    generation = 0;
    dirty = false;
    makeRuntime();
    await load();
    await ensureComposition();
    return state();
  }

  async function exportArtifact({ format = "glb", assemblyId: requestedAssembly = assemblyId } = {}) {
    return runtime.engine.n.authoringExport.export({
      requestId: requestId(),
      assemblyId: requestedAssembly,
      format,
    });
  }

  async function preview({ play = false } = {}) {
    if (play) return workbench.play.preview({ format: "glb" });
    return exportArtifact({ format: "glb" });
  }

  function state() {
    const documents = runtime.project.listDocuments();
    let assembly = null;
    try { assembly = runtime.project.getDocument(assemblyId); } catch {}
    const validation = runtime.engine.n.authoringValidation.project();
    return Object.freeze({
      schema: "nexusengine.editor-browser-state/1",
      status: {
        state: "ready",
        generation,
        dirty,
        projectKey: key,
        context: runtime.project.context(),
        runtime: { runtime: "nexusengine-browser", version: NEXUS_ENGINE_VERSION, coreCommit: BROWSER_CORE_COMMIT },
        kitIds: runtime.engine.kits.map((kit) => kit.id),
      },
      documents,
      assemblyId,
      assembly,
      view: copy(defaultView),
      validation,
      exportFormats: runtime.engine.n.authoringExport.formats(),
      importFormats: runtime.engine.n.authoringImport.formats(),
      browserCapabilities: {
        persistence: "indexeddb",
        import: true,
        export: true,
        play: true,
        build: "requires-local-host",
        buildTargets: ["web-static", "web-live", "pcvr", "android-xr", "openxr"],
      },
      workbench: workbench.state(),
    });
  }

  async function execute(method, params = {}) {
    switch (method) {
      case "status": return state().status;
      case "state": return state();
      case "list": return runtime.project.listDocuments(params.kind);
      case "read": return runtime.project.getDocument(params.id);
      case "create": {
        const result = runtime.engine.n.authoringCreate.create(params);
        dirty = true;
        return result;
      }
      case "execute": {
        const result = runtime.project.execute(params);
        dirty = true;
        return result;
      }
      case "undo": { const result = runtime.project.undo(params); dirty = true; return result; }
      case "redo": { const result = runtime.project.redo(params); dirty = true; return result; }
      case "save": return save();
      case "load": return load();
      case "new-project": return newProject(params.key);
      case "open-project": return openProject(params.key);
      case "validate-project": return runtime.engine.n.authoringValidation.project();
      case "validate-document": return runtime.engine.n.authoringValidation.document(params.id);
      case "validate-export": return runtime.engine.n.authoringValidation.format(params);
      case "import-formats": return runtime.engine.n.authoringImport.formats();
      case "workbench-import-inspect":
      case "import-inspect":
        return runtime.engine.n.authoringImport.inspect({
          requestId: params.requestId ?? requestId(),
          format: params.format,
          prefix: params.prefix ?? "import",
          bytes: params.bytes,
          resources: params.resources ?? {},
          providerId: params.providerId,
        });
      case "workbench-import-commit":
      case "import-commit": {
        const result = runtime.engine.n.authoringImport.commit(params.plan);
        dirty = true;
        return result;
      }
      case "import": {
        const result = await runtime.engine.n.authoringImport.import({
          requestId: params.requestId ?? requestId(),
          format: params.format,
          prefix: params.prefix ?? "import",
          bytes: params.bytes,
          resources: params.resources ?? {},
          providerId: params.providerId,
        });
        dirty = true;
        return result;
      }
      case "export-formats": return runtime.engine.n.authoringExport.formats();
      case "inspect-export": return runtime.engine.n.authoringExport.inspect(params);
      case "export": return exportArtifact(params);
      case "build-targets":
        return state().browserCapabilities.buildTargets.map((id) => ({ id, status: "requires-local-host", browser: false }));
      case "build-plan":
      case "build-apply":
        throw fail("EDITOR_BUILD_REQUIRES_LOCAL_HOST", "Core Build execution uses local toolchains/process access. Export or open this project in the local Editor host to build.");
      default: {
        const result = await workbench.execute(method, params);
        if (["composition-ensure","composition-add-kit","composition-remove-kit","composition-configure","composition-enable","create-validation-game"].includes(method)) dirty = true;
        return result;
      }
    }
  }

  await ensureComposition();

  return Object.freeze({
    state,
    execute,
    preview,
    save,
    load,
    newProject,
    openProject,
    get engine() { return runtime.engine; },
    get project() { return runtime.project; },
    get workbench() { return workbench; },
  });
}
