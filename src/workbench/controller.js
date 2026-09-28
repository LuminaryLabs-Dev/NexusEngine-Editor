import { getWorkbenchCatalog, catalogSummary } from "./catalog.js";
import { createCompositionController } from "./composition-controller.js";
import { createPlayController } from "./play-controller.js";
import { createValidationGameController } from "./validation-game-controller.js";
import { editorError, assertSourceCommandAllowed } from "./host-contract.js";
/** Shared orchestration only. Node-only Build is explicitly injected by the local host. */
export function createEditorWorkbench(host, options = {}) {
  const composition = createCompositionController(host, options.composition);
  const play = createPlayController(host, composition, options.play);
  const game = createValidationGameController(host, composition);
  const build = options.buildService ?? null;
  const log = [];
  let buildTargets = [], buildPlan = null, buildReceipt = null;
  function state() {
    const catalog = getWorkbenchCatalog(host.engine, composition.compositionId);
    return { schema: "nexusengine.editor-workbench-state/2", status: host.status(), catalog,
      catalogSummary: catalogSummary(catalog), composition: composition.read(),
      compositionValidation: composition.read() ? composition.validate() : null,
      validationGame: game.status(), play: play.status(), buildTargets, buildPlan, buildReceipt,
      documents: host.list(), receipts: log.slice(-100) };
  }
  function requireBuild() { if (!build) throw editorError("EDITOR_BUILD_REQUIRES_LOCAL_HOST", "Core Build requires a local host."); return build; }
  async function execute(method, p = {}) {
    assertSourceCommandAllowed(method, play.status().state);
    let result;
    switch (method) {
      case "workbench-state": return state();
      case "play-status": return play.status();
      case "play-frame": return play.frame();
      case "create-validation-game": result = await game.create(); break;
      case "composition-ensure": result = await composition.ensure(); break;
      case "composition-add-kit": result = await composition.addKit(p.kitId, p.config); break;
      case "composition-remove-kit": result = await composition.removeKit(p.kitId); break;
      case "composition-configure": result = await composition.configureNode(p.nodeId, p.config); break;
      case "composition-enable": result = await composition.setEnabled(p.nodeId, p.enabled); break;
      case "composition-plan": return composition.plan();
      case "validate-project": return host.engine.n.authoringValidation.project();
      case "validate-document": return host.engine.n.authoringValidation.document(p.id);
      case "validate-export": return host.engine.n.authoringValidation.format({ assemblyId: p.assemblyId ?? "scene", format: p.format ?? "glb" });
      case "import-formats": return host.engine.n.authoringImport.formats();
      case "import-inspect": return host.engine.n.authoringImport.inspect(p);
      case "import-commit": result = await host.commitImport(p.plan); break;
      case "play": result = await play.start(p); break;
      case "play-input": return play.input(p.intent ?? p);
      case "pause": result = play.pause(); break;
      case "resume": result = play.resume(); break;
      case "play-tick": return play.tick(p.delta);
      case "stop": result = play.stop(); break;
      case "runtime-preview": return play.preview(p);
      case "build-targets": buildTargets = await requireBuild().listTargets(); return buildTargets;
      case "build-inspect": return requireBuild().inspect(p.project);
      case "build-plan": buildPlan = await requireBuild().plan(p.request); result = buildPlan; break;
      case "build-apply": buildReceipt = await requireBuild().apply(p.planId, p.approval, p.options); result = buildReceipt; break;
      default: throw editorError("EDITOR_WORKBENCH_METHOD", `Unknown workbench method ${method}.`);
    }
    // No byte arrays, snapshots, per-frame input, or recursively nested state in the UI log.
    log.push({ at: new Date().toISOString(), action: method, kind: method.split("-")[0],
      result: { schema: result?.schema ?? null, status: result?.status ?? result?.state ?? "completed" } });
    if (log.length > 100) log.shift();
    return result;
  }
  return Object.freeze({ state, execute, composition, play, game, build, receipts: () => log.slice() });
}
