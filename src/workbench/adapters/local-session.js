import { createCommandQueue } from "../command-queue.js";
import { createEditorWorkbench } from "../controller.js";
import { capabilitiesFor, HOST_SCHEMA, editorError, assertSourceCommandAllowed } from "../host-contract.js";
/** Server-side adapter: folder UX and transport only; the supplied host owns Core calls. */
export function createLocalWorkbenchSession(initialHost, { assemblyId = "scene", view,
  outputDirectory, buildService = null, switchProject = null } = {}) {
  let host = initialHost, activeAssembly = assemblyId, exportDirectory = outputDirectory;
  let workbench = createEditorWorkbench(host, { buildService });
  function select(id = activeAssembly) {
    const docs = host.list("assembly"); activeAssembly = docs.some(d => d.id === id) ? id : docs[0]?.id ?? "scene";
  }
  function state() {
    select();
    const has = host.list("assembly").some(d => d.id === activeAssembly);
    return { schema: HOST_SCHEMA, status: host.status(), documents: host.list(), assemblyId: activeAssembly,
      assembly: has ? host.read(activeAssembly) : null, view, validation: host.validateProject(),
      exportFormats: host.exportFormats(), importFormats: host.importFormats(),
      capabilities: capabilitiesFor("local", { persistent: Boolean(host.projectRoot), build: Boolean(buildService) }), workbench: workbench.state() };
  }

  async function dispatch(method, p = {}) {
    assertSourceCommandAllowed(method, workbench.play.status().state);
    switch (method) {
      case "state": return state();
      case "status": return host.status();
      case "tools": return host.tools();
      case "list": return host.list(p.kind);
      case "read": return host.read(p.id);
      case "create": return host.create(p);
      case "execute": return host.command(p);
      case "undo": return host.undo(p);
      case "redo": return host.redo(p);
      case "save": return host.save();
      case "load": return host.load();
      case "prepare": return host.prepare(p);
      case "preview": return host.preview(p);
      case "accept": return host.accept(p);
      case "preview-artifact": return host.exportArtifact({ assemblyId: activeAssembly, format: "glb" });
      case "export": return host.exportArtifact({ ...p, assemblyId: p.assemblyId ?? activeAssembly, ...(exportDirectory ? { outputDirectory: exportDirectory } : {}) });
      case "export-formats": return host.exportFormats();
      case "import-formats": return host.importFormats();
      case "inspect-export": return host.inspectExport({ ...p, assemblyId: p.assemblyId ?? activeAssembly });
      case "workbench-import-inspect":
      case "import-inspect": return host.inspectImport({ ...p, requestId: p.requestId ?? host.requestId(), resources: p.resources ?? {} });
      case "workbench-import-commit":
      case "import-commit": { const result = await host.commitImport(p.plan); select(result.assemblyId); return result; }
      case "import": { const result = await host.importAsset(p); select(result.assemblyId); return result; }
      case "select-assembly": { const doc = host.read(p.id); if (doc.kind !== "assembly") throw editorError("EDITOR_ASSEMBLY", "Select an assembly document."); select(doc.id); return state(); }
      case "play": return workbench.play.start({ ...p, assemblyId: p.assemblyId ?? activeAssembly });
      case "new-project":
      case "open-project": {
        if (!switchProject) throw editorError("EDITOR_PROJECT_SWITCH_UNAVAILABLE", "This host cannot switch project folders.");
        const next = await switchProject(method, p.directory ?? p.key, host, p);
        workbench.play.stop(); host = next; workbench = createEditorWorkbench(host, { buildService }); activeAssembly = "scene"; exportDirectory = undefined;
        return state();
      }
      default: return workbench.execute(method, p);
    }
  }
  const queue = createCommandQueue(dispatch);
  return { state, execute: queue.execute, get host() { return host; }, get workbench() { return workbench; }, dispose() { return queue.close(() => workbench.play.stop()); } };
}
