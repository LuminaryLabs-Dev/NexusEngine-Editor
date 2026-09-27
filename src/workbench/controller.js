import { getWorkbenchCatalog, catalogSummary } from "./catalog.js";
import { createCompositionController } from "./composition-controller.js";
import { createPlayController } from "./play-controller.js";
import { createEditorBuildController } from "./build-controller.js";
import { createValidationGameController } from "./validation-game-controller.js";

const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });

export function createEditorWorkbench(host, options = {}) {
  const composition = createCompositionController(host, options.composition);
  const play = createPlayController(host, composition);
  const game = createValidationGameController(host, composition);
  const build = options.build === false ? null : createEditorBuildController(options.build ?? {});
  const log = [];
  let lastBuildTargets = [], lastBuildPlan = null, lastBuildReceipt = null;
  const record = (kind, action, result) => { const entry = Object.freeze({ id: `${Date.now()}-${log.length}`, at: new Date().toISOString(), kind, action, result }); log.push(entry); if (log.length > 1000) log.shift(); return entry; };

  function state() {
    const catalog = getWorkbenchCatalog(host.engine, composition.compositionId);
    return Object.freeze({
      schema: "nexusengine.editor-workbench-state/2",
      status: host.status(),
      catalog,
      catalogSummary: catalogSummary(catalog),
      composition: composition.read(),
      compositionValidation: composition.read() ? composition.validate() : null,
      validationGame: game.status(),
      play: play.status(),
      buildTargets: lastBuildTargets,
      buildPlan: lastBuildPlan,
      buildReceipt: lastBuildReceipt,
      documents: host.list(),
      receipts: log.slice(-100),
    });
  }

  async function execute(method, params = {}) {
    let result;
    switch (method) {
      case "workbench-state": result = state(); break;
      case "create-validation-game": result = await game.create(); break;
      case "composition-ensure": result = await composition.ensure(); break;
      case "composition-add-kit": result = await composition.addKit(params.kitId, params.config); break;
      case "composition-remove-kit": result = await composition.removeKit(params.kitId); break;
      case "composition-configure": result = await composition.configureNode(params.nodeId, params.config); break;
      case "composition-enable": result = await composition.setEnabled(params.nodeId, params.enabled); break;
      case "composition-plan": result = composition.plan(); break;
      case "validate-project": result = host.engine.n.authoringValidation.project(); break;
      case "validate-document": result = host.engine.n.authoringValidation.document(params.id); break;
      case "validate-export": result = host.engine.n.authoringValidation.format({ assemblyId: params.assemblyId ?? "scene", format: params.format ?? "glb" }); break;
      case "import-formats": result = host.engine.n.authoringImport.formats(); break;
      case "import-inspect": result = await host.engine.n.authoringImport.inspect(params); break;
      case "import-commit": result = await host.commitImport(params.plan); break;
      case "play": result = await play.start(params); break;
      case "play-input": result = play.input(params.intent ?? params); break;
      case "pause": result = play.pause(); break;
      case "resume": result = play.resume(); break;
      case "play-tick": result = play.tick(params.delta); break;
      case "stop": result = play.stop(); break;
      case "runtime-preview": result = await play.preview(params); break;
      case "build-targets": result = build ? await build.listTargets() : []; lastBuildTargets = result; break;
      case "build-inspect": if (!build) throw fail("EDITOR_BUILD_DISABLED", "Build workbench is disabled."); result = await build.inspect(params.project); break;
      case "build-plan": if (!build) throw fail("EDITOR_BUILD_DISABLED", "Build workbench is disabled."); result = await build.plan(params.request); lastBuildPlan = result; break;
      case "build-apply": if (!build) throw fail("EDITOR_BUILD_DISABLED", "Build workbench is disabled."); result = await build.apply(params.planId, params.approval, params.options); lastBuildReceipt = result; break;
      default: throw fail("EDITOR_WORKBENCH_METHOD", `Unknown workbench method ${method}.`);
    }
    record(method.startsWith("build") ? "build" : method.startsWith("play") || ["pause","resume","stop","runtime-preview"].includes(method) ? "runtime" : method.startsWith("validate") ? "validation" : method.startsWith("import") ? "import" : "operation", method, result);
    return result;
  }

  return Object.freeze({ state, execute, composition, play, game, build, receipts: () => log.slice() });
}
