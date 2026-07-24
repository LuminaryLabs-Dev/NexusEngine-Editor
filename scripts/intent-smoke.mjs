import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NexusEngine from "../../NexusEngine/src/index.js";
import { EDITOR_KITS, createEditorState, recordEditorEvent } from "../src/kits/editor-kits.js";
import { DEFAULT_DSK_GAME, buildDskGameHtml, createDskGameFileName, normalizeDskGameManifest } from "../src/dsk-html-builder.js";
import { addSequenceStep, appendDomainKit, appendSceneObject, appendSceneObjectGroup, appendScenePreset, buildDomainStackHealth, buildEditorExportManifest, buildSceneObjectStats, createEditorProject, createEditorProjectFileName, deleteSceneObject, duplicateSceneObject, filterDomainStack, filterSceneObjects, listGameAuthoringTemplates, listSceneAuthoringPresets, normalizeBuildRuntimeConfig, listSequenceEventOptions, normalizePlayableProject, normalizeViewportRuntimeConfig, selectSceneObject, updateSceneObjectTransform, updateSequenceStepLink, validateSequenceLinks } from "../src/editor-domain-model.js";
import { createEditorKitInstallSurface, createEditorRegistrySnapshot, normalizeKitManifest } from "../src/editor-kit-registry.js";
import { createCompositionController } from "../src/editor-composition.js";
import { createNexusEngineEditorRuntime } from "../src/nexus-engine-editor-runtime.js";
import { validateEditorFeatureContracts } from "../src/kits/editor-feature-contracts-kit/index.js";

assert.equal(EDITOR_KITS.length, 14);
assert.ok(EDITOR_KITS.every((kit) => kit.id.startsWith("editor-") && kit.id.endsWith("-kit")));
for (const expected of [
  "n:editor",
  "n:editor:viewport",
  "n:editor:header",
  "n:editor:dock",
  "n:editor:dock:kits",
  "n:editor:dock:inspector",
  "n:editor:dock:sequence",
  "n:editor:scene-preset",
  "n:editor:game-template",
  "n:runtime:interaction",
  "n:editor:persistence",
  "n:editor:selection",
  "n:editor:feature-contracts",
  "n:editor:status"
]) {
  assert.ok(EDITOR_KITS.some((kit) => kit.domainPath === expected), `missing ${expected}`);
}

const requiredFeatureContracts = [
  "top-command-strip",
  "domain-stack-panel",
  "registry-kit-picker",
  "cli-only-kit-install",
  "webgl-viewport",
  "viewport-transform-tools",
  "scene-object-authoring",
  "configure-panel",
  "scene-presets",
  "game-template-authoring",
  "sequence-timeline",
  "project-persistence",
  "html-build-export",
  "runtime-interactions",
  "screenshot-mcp"
];
assert.equal(validateEditorFeatureContracts(requiredFeatureContracts).ok, true);

const readOnlyState = createEditorState();
readOnlyState.editorRuntime = createNexusEngineEditorRuntime({
  state: readOnlyState,
  recordEvent: (type, payload) => recordEditorEvent(readOnlyState, type, payload)
});
assert.equal(readOnlyState.editorRuntime.kitMutationMode, "read-only");
assert.equal(readOnlyState.editorRuntime.getBinding("kitInstaller").mutationMode, "read-only");
assert.throws(() => readOnlyState.editorRuntime.getBinding("domainStack").addKit("audio-feedback-domain-kit"), /CLI-only/);
assert.throws(() => readOnlyState.editorRuntime.getBinding("kitInstaller").installKit("audio-feedback-domain-kit"), /CLI-only/);
assert.throws(() => readOnlyState.editorRuntime.getBinding("gameTemplate").apply(), /CLI-only/);

const state = createEditorState();
state.editorRuntime = createNexusEngineEditorRuntime({
  state,
  kitMutationMode: "cli",
  recordEvent: (type, payload) => recordEditorEvent(state, type, payload)
});
assert.equal(state.editorRuntime.kitMutationMode, "cli");
assert.deepEqual(state.editorRuntime.installOrder, [
  "editor-composition-kit",
  "editor-feature-contracts-kit",
  "editor-kit-registry-kit",
  "editor-kit-installer-kit",
  "editor-domain-stack-kit",
  "editor-scene-object-kit",
  "editor-scene-preset-kit",
  "editor-selection-kit",
  "editor-sequence-timeline-kit",
  "editor-game-template-kit",
  "editor-runtime-interaction-kit",
  "editor-project-persistence-kit",
  "editor-html-build-kit"
]);
assert.equal(state.editorRuntime.source, "fallback:compatible-nexusengine");
assert.equal(typeof state.editorRuntime.getBinding("composition").assignDomainKit, "function");
assert.equal(state.editorRuntime.getBinding("featureContracts").validate(requiredFeatureContracts).ok, true);
assert.equal(typeof state.editorRuntime.getBinding("kitRegistry").search, "function");
assert.equal(typeof state.editorRuntime.getBinding("kitInstaller").installKit, "function");
assert.equal(typeof state.editorRuntime.getBinding("domainStack").getHealth, "function");
assert.equal(typeof state.editorRuntime.getBinding("projectPersistence").saveLocal, "function");
assert.equal(typeof state.editorRuntime.getBinding("projectPersistence").exportFile, "function");
assert.equal(typeof state.editorRuntime.getBinding("projectPersistence").importFile, "function");
assert.equal(typeof state.editorRuntime.getBinding("projectPersistence").resetProject, "function");
assert.equal(typeof state.editorRuntime.getBinding("sequenceTimeline").runStep, "function");
assert.equal(typeof state.editorRuntime.getBinding("scenePreset").apply, "function");
assert.equal(typeof state.editorRuntime.getBinding("gameTemplate").apply, "function");
assert.equal(typeof state.editorRuntime.getBinding("runtimeInteraction").getStats, "function");
assert.equal(typeof state.editorRuntime.getBinding("viewportTools").setTool, "function");
assert.equal(typeof state.editorRuntime.getBinding("viewportTools").nudge, "function");
const resetState = createEditorState();
resetState.editorRuntime = createNexusEngineEditorRuntime({
  state: resetState,
  kitMutationMode: "cli",
  recordEvent: (type, payload) => recordEditorEvent(resetState, type, payload)
});
resetState.mode = "playing";
resetState.editorRuntime.getBinding("sceneObject").addCubeGroup(8);
assert.equal(resetState.project.scene3d.objects.length, 9);
resetState.editorRuntime.getBinding("projectPersistence").resetProject();
assert.equal(resetState.mode, "stopped");
assert.equal(resetState.projectPersistence.status, "reset");
assert.equal(resetState.project.scene3d.objects.length, 1);
recordEditorEvent(state, "editor.smoke", { domainPath: "n:editor:status" });
assert.ok(state.events.some((event) => event.type === "editor.feature-contracts.validated"));
assert.ok(state.events.some((event) => event.type === "editor.smoke"));
assert.equal(state.kitRegistry.get("n:editor:viewport").role, "full-3d-scene-viewport");
assert.equal(state.selectedDomainPath, "n:physics");
assert.equal(state.project.scene3d.objects[0].label, "Default Cube");
assert.ok(state.project.domainStack.some((domain) => domain.domainPath === "n:render:three"));
assert.equal(state.project.sequenceSteps.length, 3);
assert.equal(state.project.version, "0.3.0");
assert.equal(state.project.composition.schema, "nexusengine.composition-tree/1");
assert.equal(state.project.compositionRegistryOverlay.schema, "nexusengine.core-composition.registry/2");
assert.equal(state.project.compositionRegistryOverlay.sources[0].trusted, false);
assert.ok(state.project.scene3d.objects[0].kitNodeIds.length > 0, "legacy object paths migrate to kit-node ids");

const playableProject = createEditorProject({
  title: "Playable Fixture",
  domainPath: "n:game:playable-fixture",
  playable: {
    schema: "nexusengine.playable-project/1",
    id: "playable-fixture",
    title: "Playable Fixture",
    entry: "./index.html",
    runtime: "nexusengine-webgl2",
    contractHash: "fixture-contract"
  }
});
assert.equal(playableProject.playable.entry, "./index.html");
assert.equal(buildEditorExportManifest(playableProject).playable.contractHash, "fixture-contract");
assert.throws(() => normalizePlayableProject({ schema: "nexusengine.playable-project/1", id: "escape", title: "Escape", entry: "../outside.html" }), /cannot escape/);
assert.throws(() => normalizePlayableProject({ schema: "nexusengine.playable-project/1", id: "remote", title: "Remote", entry: "https://example.com/game" }), /relative or same-workspace/);

const compositionProject = createEditorState().project;
const composition = createCompositionController({
  project: compositionProject,
  NexusEngine,
  registryImports: [createEditorRegistrySnapshot()],
  globalObject: globalThis
});
assert.equal(composition.supported, true);
assert.equal(composition.getValidation().ok, true);
const acceptedBeforeInvalid = JSON.stringify(composition.getAccepted());
composition.select("kit-node-domain-physics");
assert.equal(composition.remove().ok, false, "referenced legacy kit cannot be removed");
composition.update({ config: { substeps: "invalid" } });
const invalidApply = composition.apply();
assert.equal(invalidApply.ok, false, "invalid draft cannot replace accepted composition");
assert.equal(JSON.stringify(composition.getAccepted()), acceptedBeforeInvalid, "failed Apply is atomic");
composition.resetDraft();
composition.select(compositionProject.composition.rootNodeId);
const coreDataDomain = composition.listAddOptions("domain").find((entry) => entry.domainPath === "n:core-data");
assert.ok(coreDataDomain);
assert.equal(composition.add("domain", coreDataDomain.id).ok, true);
const coreDataKit = composition.listAddOptions("kit").find((entry) => entry.id === "n-core-data-kit");
assert.ok(coreDataKit);
assert.equal(composition.add("kit", coreDataKit.id).ok, true);
assert.equal(composition.apply().ok, true);
const previewReceipt = await composition.runOnce(composition.getSelectedNode().id);
assert.equal(previewReceipt.ok, true, previewReceipt.error);
assert.equal(previewReceipt.disposed, true);
assert.deepEqual(previewReceipt.installOrder, ["n-core-data-kit"]);
assert.equal(composition.getReceipts().length, 1);
assert.equal(buildEditorExportManifest(compositionProject).composition.schema, "nexusengine.composition-tree/1");

const probeRegistry = NexusEngine.normalizeRegistrySnapshot({
  ...NexusEngine.createCoreRegistrySnapshot(),
  kits: [...NexusEngine.createCoreRegistrySnapshot().kits, {
    id: "n-preview-probe-kit",
    version: "0.0.4",
    status: "stable-candidate",
    kind: "domain-service-kit",
    domain: "preview-probe",
    domainPath: "n:core-data",
    parentDomainPath: null,
    apiName: "previewProbe",
    apiVisibility: "public",
    requires: [],
    provides: ["n:preview-probe"],
    defaults: {},
    settingsSchema: { type: "object", additionalProperties: true },
    preview: { command: "runEditorPreview", args: { amount: 2 }, timeoutMs: 100, editorSafe: true },
    source: { registryId: "nexusengine-core", exportName: "createPreviewProbeKit", module: "test", trusted: true }
  }]
}, { allowTrustedSources: true });
const ProbeNexusEngine = {
  ...NexusEngine,
  createCoreRegistrySnapshot: () => probeRegistry,
  createPreviewProbeKit: () => NexusEngine.defineRuntimeKit({
    id: "n-preview-probe-kit",
    provides: ["n:preview-probe"],
    install({ engine }) {
      let count = 0;
      engine.n ??= {};
      engine.n.previewProbe = {
        runEditorPreview({ amount }) { count += amount; return { count }; },
        getSnapshot() { return { count }; }
      };
    }
  })
};
const commandProject = createEditorState().project;
const commandComposition = createCompositionController({ project: commandProject, NexusEngine: ProbeNexusEngine, registryImports: [createEditorRegistrySnapshot()], globalObject: globalThis });
commandComposition.select(commandProject.composition.rootNodeId);
assert.equal(commandComposition.add("domain", "domain-core-data").ok, true);
assert.equal(commandComposition.add("kit", "n-preview-probe-kit").ok, true);
assert.equal(commandComposition.apply().ok, true);
const commandReceipt = await commandComposition.runOnce(commandComposition.getSelectedNode().id);
assert.equal(commandReceipt.ok, true, commandReceipt.error);
assert.equal(commandReceipt.disposed, true);
assert.deepEqual(commandReceipt.previewActions, [{ kind: "command", registryId: "n-preview-probe-kit", apiName: "previewProbe", command: "runEditorPreview", result: { count: 2 } }]);
assert.equal(buildDomainStackHealth(state.project).kitCount, 7);
assert.equal(normalizeViewportRuntimeConfig(state.project).maxDrawnObjects, 700);
assert.equal(normalizeViewportRuntimeConfig(state.project).culling, "distance-window");
assert.equal(state.kitPicker.selectedKitId, "spatial-authoring-kits");
assert.equal(state.gameTemplateView.selectedTemplateId, "chess-board-template");
assert.equal(state.viewportTool.active, "select");
assert.ok(filterDomainStack(state.project, { query: "physics" }).some((domain) => domain.domainPath === "n:physics"));
assert.ok(filterDomainStack(state.project, { query: "project" }).some((domain) => domain.domainPath === "n:persistence"));
const viewportTools = state.editorRuntime.getBinding("viewportTools");
viewportTools.setTool("move");
viewportTools.nudge("x", 1);
assert.equal(state.project.scene3d.objects[0].transform.position.x, 0.25);
viewportTools.setTool("rotate");
viewportTools.nudge("y", 1);
assert.ok(Math.abs(state.project.scene3d.objects[0].transform.rotation.y - Math.PI / 12) < 0.000001);
viewportTools.setTool("scale");
viewportTools.nudge("z", -1);
assert.equal(state.project.scene3d.objects[0].transform.scale.z, 0.9);
assert.equal(state.viewportTool.active, "scale");
assert.equal(state.viewportTool.lastAction, "scale.z-");

const kitSurface = createEditorKitInstallSurface();
assert.equal(normalizeKitManifest({ id: "sample-kit" }).domain, "sample");
assert.ok(kitSurface.registry.search("audio").some((kit) => kit.id === "audio-feedback-domain-kit"));
const installPlan = kitSurface.installer.createInstallPlan("composition-planning-domain-kit");
assert.deepEqual(installPlan.installOrder, ["capability-graph-domain-kit", "composition-planning-domain-kit"]);
const spatialBundlePlan = state.editorRuntime.getBinding("domainStack").createInstallPlan("spatial-authoring-kits", { includeChildren: true });
assert.ok(spatialBundlePlan.children.some((kit) => kit.id === "selection-domain-service-kit"));
assert.ok(spatialBundlePlan.installOrder.includes("transform-domain-service-kit"));
const addedKit = state.editorRuntime.getBinding("domainStack").addKit("audio-feedback-domain-kit");
assert.equal(addedKit.domainPath, "n:audio-feedback");
assert.equal(addedKit.kitId, "audio-feedback-domain-kit");
const stackHealth = state.editorRuntime.getBinding("domainStack").getHealth();
assert.equal(stackHealth.ok, true);
state.editorRuntime.getBinding("domainStack").setStackQuery("audio");
assert.equal(state.editorRuntime.getBinding("domainStack").getVisibleRows()[0].kitId, "audio-feedback-domain-kit");
const addedStep = addSequenceStep(state.project, addedKit.domainPath);
assert.equal(addedStep.domainPath, "n:audio-feedback");
assert.equal(addedStep.event, "audioFeedback.cued");
assert.ok(listSequenceEventOptions(state.project).some((domain) => domain.domainPath === "n:audio-feedback" && domain.events.includes("audioFeedback.cued")));
updateSequenceStepLink(state.project, addedStep.id, {
  label: "Cue Export Step",
  domainPath: "n:audio-feedback",
  event: "audioFeedback.cued",
  targetDomainPath: "n:build:web",
  targetOutput: "export:html"
});
assert.equal(addedStep.label, "Cue Export Step");
const sequenceGraph = validateSequenceLinks(state.project);
assert.equal(sequenceGraph.ok, true);
const stepReceipt = state.editorRuntime.getBinding("sequenceTimeline").runStep("step-01");
assert.equal(stepReceipt.status, "delivered");
assert.equal(stepReceipt.stepId, "step-01");
assert.equal(stepReceipt.targetDomainPath, "n:camera");
assert.equal(state.editorRuntime.getBinding("sequenceTimeline").getPlayback().runCount, 1);
const sequenceReceipts = state.editorRuntime.getBinding("sequenceTimeline").runAll();
assert.ok(sequenceReceipts.length >= state.project.sequenceSteps.length);
assert.equal(state.editorRuntime.getBinding("sequenceTimeline").getPlayback().status, "complete");
const fallbackKit = appendDomainKit(state.project);
assert.equal(fallbackKit.domainPath, "n:composition-planning");
const addedObject = appendSceneObject(state.project);
assert.equal(addedObject.type, "mesh:cube");
selectSceneObject(state.project, addedObject.id);
updateSceneObjectTransform(state.project, addedObject.id, "position.x", 3.5);
state.editorRuntime.getBinding("composition").assignDomainKit(addedObject.id, "n:physics");
state.editorRuntime.getBinding("composition").assignComponent(addedObject.id, "physics", { domainPath: "n:physics", enabled: true });
const objectGroup = appendSceneObjectGroup(state.project, 25);
assert.equal(objectGroup.length, 25);
assert.equal(buildSceneObjectStats(state.project).objectCount, 27);
assert.ok(filterSceneObjects(state.project, { query: objectGroup.at(-1).id }).some((object) => object.id === objectGroup.at(-1).id));
const duplicatedObject = duplicateSceneObject(state.project, objectGroup.at(-1).id);
assert.equal(duplicatedObject.selected, true);
assert.equal(buildSceneObjectStats(state.project).objectCount, 28);
deleteSceneObject(state.project, duplicatedObject.id);
assert.equal(buildSceneObjectStats(state.project).objectCount, 27);
state.editorRuntime.getBinding("sceneObject").setQuery("cube-2");
state.selectedDomainPath = "n:physics";
const bulkAssignedObjects = state.editorRuntime.getBinding("sceneObject").assignSelectedDomainToVisible();
assert.ok(bulkAssignedObjects.length >= 8);
assert.ok(state.project.scene3d.objects.find((object) => object.id === "cube-20").domainKits.includes("n:physics"));
assert.equal(state.project.scene3d.objects.find((object) => object.id === "cube-20").components.physics.domainPath, "n:physics");
state.editorRuntime.getBinding("sceneObject").setQuery("physics");
assert.ok(state.editorRuntime.getBinding("sceneObject").getVisibleObjects().some((object) => object.id === addedObject.id));
state.editorRuntime.getBinding("sceneObject").setQuery("");
assert.equal(state.project.scene3d.objects.length, 27);
assert.equal(state.project.scene3d.objects[1].transform.position.x, 3.5);
assert.ok(state.project.scene3d.objects[1].domainKits.includes("n:physics"));
assert.equal(state.project.scene3d.objects[1].components.physics.domainPath, "n:physics");

assert.ok(listSceneAuthoringPresets().some((preset) => preset.id === "physics-stress-grid-preset"));
const presetState = createEditorState();
presetState.editorRuntime = createNexusEngineEditorRuntime({
  state: presetState,
  recordEvent: (type, payload) => recordEditorEvent(presetState, type, payload)
});
presetState.editorRuntime.getBinding("sceneObject").setBatchSize(120);
presetState.editorRuntime.getBinding("scenePreset").setPreset("physics-stress-grid-preset");
const presetObjects = presetState.editorRuntime.getBinding("scenePreset").apply();
assert.equal(presetObjects.length, 120);
assert.equal(buildSceneObjectStats(presetState.project).objectCount, 121);
assert.equal(presetState.project.scene3d.authoringPresets[0].presetId, "physics-stress-grid-preset");
assert.ok(presetObjects.every((object) => object.domainKits.includes("n:physics")));
assert.ok(filterSceneObjects(presetState.project, { query: "physicsStress" }).length > 0);
const directPresetObjects = appendScenePreset(presetState.project, "arena-blockout-preset", { count: 12 });
assert.equal(directPresetObjects.length, 12);
assert.equal(presetState.project.scene3d.authoringPresets.length, 2);
const presetManifest = normalizeDskGameManifest(buildEditorExportManifest(presetState.project));
assert.equal(presetManifest.scene3d.authoringPresets.length, 2);
assert.equal(presetManifest.scene3d.objects.length, 133);
assert.equal(presetManifest.runtime.renderer, "canvas-3d");
assert.equal(presetManifest.runtime.maxDrawnObjects, 600);
presetState.project.kitConfigs["n:build:web"].maxDrawnObjects = 125;
presetState.project.kitConfigs["n:build:web"].culling = "none";
const buildProfileManifest = normalizeDskGameManifest(buildEditorExportManifest(presetState.project));
assert.equal(buildProfileManifest.runtime.maxDrawnObjects, 125);
assert.equal(buildProfileManifest.runtime.culling, "none");

assert.ok(listGameAuthoringTemplates().some((template) => template.id === "chess-board-template"));
assert.ok(listGameAuthoringTemplates().some((template) => template.id === "target-clicker-template"));
assert.ok(listGameAuthoringTemplates().some((template) => template.id === "gem-collector-template"));
assert.ok(listGameAuthoringTemplates().some((template) => template.id === "streaming-terrain-cargo-template"));
const chessState = createEditorState();
chessState.editorRuntime = createNexusEngineEditorRuntime({
  state: chessState,
  kitMutationMode: "cli",
  recordEvent: (type, payload) => recordEditorEvent(chessState, type, payload)
});
const chessResult = chessState.editorRuntime.getBinding("gameTemplate").apply();
assert.equal(chessResult.objects.length, 96);
assert.equal(chessResult.sequenceStepIds.length, 4);
assert.equal(chessState.project.title, "Nexus Chess");
assert.equal(chessState.project.domainPath, "n:game:chess");
assert.equal(chessState.project.scene3d.objects.length, 96);
assert.equal(chessState.project.scene3d.chess.boardObjectCount, 64);
assert.equal(chessState.project.scene3d.chess.pieceObjectCount, 32);
assert.equal(chessState.project.scene3d.gameTemplates[0].templateId, "chess-board-template");
assert.equal(chessState.gameTemplateView.lastAppliedTemplateId, "chess-board-template");
assert.equal(chessState.gameTemplateView.lastObjectCount, 96);
assert.ok(chessState.project.domainStack.some((domain) => domain.domainPath === "n:game:chess"));
assert.ok(chessState.project.scene3d.objects.some((object) => object.label === "White King e1"));
assert.ok(chessState.project.scene3d.objects.some((object) => object.components.chessSquare?.square === "a1"));
assert.ok(chessState.project.scene3d.objects.some((object) => object.components.chessPiece?.side === "black" && object.components.chessPiece.piece === "queen"));
assert.deepEqual(normalizeBuildRuntimeConfig(chessState.project), {
  renderer: "canvas-3d",
  maxDrawnObjects: 128,
  culling: "none"
});
assert.deepEqual(normalizeViewportRuntimeConfig(chessState.project), {
  renderer: "webgl",
  maxDrawnObjects: 128,
  culling: "none"
});
assert.equal(validateSequenceLinks(chessState.project).ok, true);
const chessManifest = normalizeDskGameManifest(buildEditorExportManifest(chessState.project));
assert.equal(chessManifest.scene3d.objects.length, 96);
assert.equal(chessManifest.scene3d.chess.initialFen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
assert.equal(chessManifest.scene3d.gameTemplates[0].templateId, "chess-board-template");
assert.match(buildDskGameHtml(chessManifest), /Nexus Chess/);
assert.match(buildDskGameHtml(chessManifest), /White King e1/);
const targetState = createEditorState();
targetState.editorRuntime = createNexusEngineEditorRuntime({
  state: targetState,
  kitMutationMode: "cli",
  recordEvent: (type, payload) => recordEditorEvent(targetState, type, payload)
});
targetState.editorRuntime.getBinding("gameTemplate").setTemplate("target-clicker-template");
const targetResult = targetState.editorRuntime.getBinding("gameTemplate").apply();
assert.equal(targetResult.objects.length, 14);
assert.equal(targetResult.sequenceStepIds.length, 4);
assert.equal(targetState.project.title, "Nexus Target Clicker");
assert.equal(targetState.project.domainPath, "n:game:target-clicker");
assert.equal(targetState.project.scene3d.targetClicker.targetObjectCount, 12);
assert.equal(targetState.project.scene3d.objects.filter((object) => object.components.targetClickerTarget).length, 12);
assert.equal(targetState.project.scene3d.runtimeInteraction.domainPath, "n:runtime:interaction");
assert.equal(targetState.project.scene3d.runtimeInteraction.targetObjectCount, 12);
assert.equal(targetState.project.scene3d.objects.filter((object) => object.components.runtimeClickable).length, 12);
assert.ok(targetState.project.scene3d.objects.filter((object) => object.components.runtimeClickable).every((object) => object.domainKits.includes("n:runtime:interaction")));
assert.equal(targetState.editorRuntime.getBinding("runtimeInteraction").getStats().clickableObjectCount, 12);
assert.equal(targetState.project.scene3d.gameTemplates[0].templateId, "target-clicker-template");
assert.ok(targetState.project.domainStack.some((domain) => domain.domainPath === "n:game:target-clicker"));
assert.ok(targetState.project.domainStack.some((domain) => domain.domainPath === "n:runtime:interaction"));
assert.deepEqual(normalizeBuildRuntimeConfig(targetState.project), {
  renderer: "canvas-3d",
  maxDrawnObjects: 96,
  culling: "none"
});
assert.deepEqual(normalizeViewportRuntimeConfig(targetState.project), {
  renderer: "webgl",
  maxDrawnObjects: 96,
  culling: "none"
});
assert.equal(validateSequenceLinks(targetState.project).ok, true);
const targetManifest = normalizeDskGameManifest(buildEditorExportManifest(targetState.project));
assert.equal(targetManifest.scene3d.targetClicker.targetObjectCount, 12);
assert.equal(targetManifest.scene3d.runtimeInteraction.domainPath, "n:runtime:interaction");
const targetHtml = buildDskGameHtml(targetManifest);
assert.match(targetHtml, /Nexus Target Clicker/);
assert.match(targetHtml, /Target Clicker/);
assert.match(targetHtml, /interactionState/);
assert.match(targetHtml, /recordInteractionHit/);
assert.match(targetHtml, /resetInteractions/);
assert.match(targetHtml, /handleRuntimePointer/);
assert.match(targetHtml, /recordTargetHit/);

const gemState = createEditorState();
gemState.editorRuntime = createNexusEngineEditorRuntime({
  state: gemState,
  kitMutationMode: "cli",
  recordEvent: (type, payload) => recordEditorEvent(gemState, type, payload)
});
gemState.editorRuntime.getBinding("gameTemplate").setTemplate("gem-collector-template");
const gemResult = gemState.editorRuntime.getBinding("gameTemplate").apply();
assert.equal(gemResult.objects.length, 14);
assert.equal(gemResult.sequenceStepIds.length, 4);
assert.equal(gemState.project.title, "Nexus Gem Collector");
assert.equal(gemState.project.domainPath, "n:game:gem-collector");
assert.equal(gemState.project.scene3d.runtimeInteraction.domainPath, "n:runtime:interaction");
assert.equal(gemState.project.scene3d.runtimeInteraction.targetObjectCount, 12);
assert.equal(gemState.project.scene3d.objects.filter((object) => object.components.runtimeClickable).length, 12);
assert.equal(gemState.project.scene3d.objects.filter((object) => object.components.gemCollectible).length, 12);
assert.ok(gemState.project.domainStack.some((domain) => domain.domainPath === "n:game:gem-collector"));
assert.ok(gemState.project.domainStack.some((domain) => domain.domainPath === "n:runtime:interaction"));
assert.equal(validateSequenceLinks(gemState.project).ok, true);
const gemManifest = normalizeDskGameManifest(buildEditorExportManifest(gemState.project));
assert.equal(gemManifest.scene3d.runtimeInteraction.targetObjectCount, 12);
const gemHtml = buildDskGameHtml(gemManifest);
assert.match(gemHtml, /Nexus Gem Collector/);
assert.match(gemHtml, /Runtime Interactions/);
assert.match(gemHtml, /recordInteractionHit/);
assert.match(gemHtml, /resetInteractions/);
const templateState = createEditorState();
templateState.editorRuntime = createNexusEngineEditorRuntime({
  state: templateState,
  kitMutationMode: "cli",
  recordEvent: (type, payload) => recordEditorEvent(templateState, type, payload)
});
templateState.editorRuntime.getBinding("gameTemplate").setTemplate("streaming-terrain-cargo-template");
const templateResult = templateState.editorRuntime.getBinding("gameTemplate").apply();
assert.equal(templateResult.objects.length, 720);
assert.equal(templateResult.sequenceStepIds.length, 4);
assert.equal(templateState.project.title, "Streaming Terrain Cargo");
assert.equal(templateState.project.domainPath, "n:game:streaming-terrain-cargo");
assert.equal(templateState.project.scene3d.gameTemplates[0].templateId, "streaming-terrain-cargo-template");
assert.equal(templateState.gameTemplateView.lastAppliedTemplateId, "streaming-terrain-cargo-template");
assert.equal(templateState.gameTemplateView.lastObjectCount, 720);
assert.ok(templateState.project.domainStack.some((domain) => domain.kitId === "vegetation-placement-domain-kit"));
assert.ok(templateState.project.domainStack.some((domain) => domain.kitId === "generic-route-cargo-extraction-kit"));
assert.ok(templateState.project.scene3d.objects.some((object) => object.components.gameTemplate?.templateId === "streaming-terrain-cargo-template"));
assert.ok(templateState.project.scene3d.objects.at(-1).domainKits.includes("n:route-cargo-extraction"));
assert.deepEqual(normalizeBuildRuntimeConfig(templateState.project), {
  renderer: "canvas-3d",
  maxDrawnObjects: 220,
  culling: "distance-window"
});
assert.deepEqual(normalizeViewportRuntimeConfig(templateState.project), {
  renderer: "webgl",
  maxDrawnObjects: 180,
  culling: "distance-window"
});
assert.equal(validateSequenceLinks(templateState.project).ok, true);
const templateManifest = normalizeDskGameManifest(buildEditorExportManifest(templateState.project));
assert.equal(templateManifest.scene3d.objects.length, 721);
assert.equal(templateManifest.scene3d.gameTemplates[0].templateId, "streaming-terrain-cargo-template");
assert.equal(templateManifest.runtime.maxDrawnObjects, 220);
assert.match(buildDskGameHtml(templateManifest), /Game Templates/);
assert.match(buildDskGameHtml(templateManifest), /Streaming Terrain Cargo/);

state.editorRuntime.getBinding("sceneObject").setBatchSize(250);
const massiveBatch = state.editorRuntime.getBinding("sceneObject").addCubeGroup();
assert.equal(massiveBatch.length, 250);
assert.equal(buildSceneObjectStats(state.project).objectCount, 277);
state.project.kitConfigs["n:render:three"].viewportMaxDrawnObjects = 125;
state.project.kitConfigs["n:render:three"].viewportCulling = "distance-window";
assert.deepEqual(normalizeViewportRuntimeConfig(state.project), {
  renderer: "webgl",
  maxDrawnObjects: 125,
  culling: "distance-window"
});
state.editorRuntime.getBinding("sceneObject").setVisibleLimit(25);
const sceneWindow = state.editorRuntime.getBinding("sceneObject").getWindow();
assert.equal(sceneWindow.objects.length, 25);
assert.equal(sceneWindow.totalMatched, 277);
assert.equal(sceneWindow.hiddenCount, 252);
state.editorRuntime.getBinding("sceneObject").setQuery("cube-277");
assert.equal(state.editorRuntime.getBinding("sceneObject").getWindow().objects[0].id, "cube-277");
state.editorRuntime.getBinding("sceneObject").setQuery("");
Object.assign(state.workspaceUi, {
  activeContext: "inspector",
  structureWidth: 312,
  inspectorWidth: 388,
  contextWidth: 344,
  behaviorHeight: 286,
  compactContextHeight: 318
});
const savedSnapshot = state.editorRuntime.getBinding("projectPersistence").saveLocal();
assert.equal(savedSnapshot.project.scene3d.objects.length, 277);
assert.equal(savedSnapshot.sequencePlayback.status, "complete");
assert.ok(savedSnapshot.sequencePlayback.receipts.length >= state.project.sequenceSteps.length);
assert.deepEqual(savedSnapshot.workspaceUi, {
  timelineExpanded: false,
  inspectorOpen: true,
  projectActionsOpen: false,
  activeContext: "inspector",
  structureWidth: 312,
  inspectorWidth: 388,
  contextWidth: 344,
  behaviorHeight: 286,
  compactContextHeight: 318
});
state.project.scene3d.objects = state.project.scene3d.objects.slice(0, 1);
Object.assign(state.workspaceUi, { activeContext: "structure", structureWidth: 220, inspectorWidth: 280 });
assert.equal(state.project.scene3d.objects.length, 1);
const loadedSnapshot = state.editorRuntime.getBinding("projectPersistence").loadLocal();
assert.equal(loadedSnapshot.project.scene3d.objects.length, 277);
assert.equal(state.project.scene3d.objects.length, 277);
assert.equal(state.projectPersistence.status, "loaded");
assert.equal(state.workspaceUi.activeContext, "inspector");
assert.equal(state.workspaceUi.structureWidth, 312);
assert.equal(state.workspaceUi.inspectorWidth, 388);
const exportedProject = state.editorRuntime.getBinding("projectPersistence").exportFile();
assert.equal(exportedProject.fileName, createEditorProjectFileName(exportedProject.snapshot));
assert.match(exportedProject.fileName, /\.project\.json$/);
assert.match(exportedProject.json, /"scene3d"/);
assert.equal(exportedProject.snapshot.project.scene3d.objects.length, 277);
assert.equal(state.projectPersistence.status, "exported");
assert.equal(state.projectPersistence.lastExportFileName, exportedProject.fileName);
state.project.scene3d.objects = state.project.scene3d.objects.slice(0, 1);
const importedProject = state.editorRuntime.getBinding("projectPersistence").importFile(exportedProject.json, exportedProject.fileName);
assert.equal(importedProject.project.scene3d.objects.length, 277);
assert.equal(state.project.scene3d.objects.length, 277);
assert.equal(state.projectPersistence.status, "imported");
assert.equal(state.projectPersistence.lastImportFileName, exportedProject.fileName);

const manifest = normalizeDskGameManifest(buildEditorExportManifest(state.project));
assert.equal(manifest.domainPath, "n:game:starter");
assert.equal(manifest.viewport.mode, "3d");
assert.equal(manifest.domainStackHealth.ok, false);
assert.ok(manifest.domainStackHealth.missingCount > 0);
assert.equal(manifest.featureContractValidation.ok, true);
assert.equal(manifest.featureContracts.length, requiredFeatureContracts.length);
assert.ok(manifest.featureContracts.some((contract) => contract.featureId === "webgl-viewport" && contract.owningKitId === "editor-viewport-kit"));
assert.equal(manifest.sequenceGraph.ok, true);
assert.equal(manifest.scene3d.objects[0].type, "mesh:cube");
assert.equal(manifest.scene3d.objects.length, 277);
assert.deepEqual(manifest.scene3d.authoringPresets ?? [], []);
assert.ok(manifest.scene3d.objects[1].domainKits.includes("n:physics"));
assert.ok(manifest.scene3d.objects.some((object) => object.id === "cube-277"));
assert.equal(createDskGameFileName(manifest), "n-game-starter.html");
const html = buildDskGameHtml(manifest);
assert.match(html, /window.__NEXUS_DSK_GAME__/);
assert.match(html, /Domain Service Kit Runtime/);
assert.match(html, /runtime-canvas/);
assert.match(html, /renderStats/);
assert.match(html, /drawRuntimeFrame/);
assert.match(html, /Sequence Timeline/);
assert.match(html, /Scene Objects/);
assert.match(html, /Cube 2/);
assert.match(html, /n:physics/);
assert.match(html, /audioFeedback\.cued/);
assert.match(html, /export:html/);
assert.match(html, /audio-feedback-domain-kit/);
assert.match(html, /runSequence/);
assert.match(html, /sequenceReceipts/);
assert.match(html, /runtime-run-sequence/);
assert.match(html, /runtime-receipts/);
assert.match(html, /Sequence Playback/);
assert.match(html, /featureContracts/);
assert.match(html, /editor-viewport-kit/);
assert.match(buildDskGameHtml(presetManifest), /Physics Stress Grid/);
assert.match(buildDskGameHtml(presetManifest), /Authoring Presets/);
assert.match(buildDskGameHtml(presetManifest), /max draw 600/);
assert.match(buildDskGameHtml(buildProfileManifest), /max draw 125/);
assert.match(buildDskGameHtml(buildProfileManifest), /culling: manifest.runtime.culling/);
assert.match(buildDskGameHtml(DEFAULT_DSK_GAME), /Default Cube/);

const playableExportRoot = mkdtempSync(join(tmpdir(), "nexus-editor-playable-export-"));
try {
  const playableSource = join(playableExportRoot, "source");
  const playableOutput = join(playableExportRoot, "output");
  mkdirSync(join(playableSource, "assets"), { recursive: true });
  mkdirSync(join(playableSource, ".agent"), { recursive: true });
  writeFileSync(join(playableSource, "index.html"), "<!doctype html><title>Playable Fixture</title><canvas data-nexus-primary-3d></canvas>");
  writeFileSync(join(playableSource, "assets", "runtime.mjs"), "export const ready = true;\n");
  writeFileSync(join(playableSource, ".agent", "private-proof.json"), "{}\n");
  writeFileSync(join(playableSource, "memory.md"), "authoring only\n");
  const playableProjectPath = join(playableSource, "playable-fixture.project.json");
  writeFileSync(playableProjectPath, `${JSON.stringify({ version: "0.3.0", savedAt: "2026-07-22T00:00:00.000Z", project: playableProject }, null, 2)}\n`);
  const exportReport = JSON.parse(execFileSync(process.execPath, [
    "scripts/nexus-engine-editor-cli.mjs",
    "operations", "submit", "playable-export",
    "--param", `input_project=${playableProjectPath}`,
    "--param", `output_dir=${playableOutput}`,
    "--json"
  ], { cwd: process.cwd(), encoding: "utf8" }));
  assert.equal(exportReport.outputs.playable.written, true);
  assert.equal(exportReport.outputs.playable.entry, "index.html");
  assert.equal(exportReport.outputs.playable.fileCount, 2);
  assert.equal(existsSync(join(playableOutput, "index.html")), true);
  assert.equal(readFileSync(join(playableOutput, "assets", "runtime.mjs"), "utf8"), "export const ready = true;\n");
  assert.equal(existsSync(join(playableOutput, "playable-fixture.project.json")), false);
  assert.equal(existsSync(join(playableOutput, ".agent")), false);
  const cliStatus = JSON.parse(execFileSync(process.execPath, [
    "scripts/nexus-engine-editor-cli.mjs", "status", "--project", playableProjectPath, "--json"
  ], { cwd: process.cwd(), encoding: "utf8" }));
  const mcpLines = execFileSync(process.execPath, ["scripts/nexus-engine-editor-screenshot-mcp.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "editor_project_status", arguments: { projectPath: playableProjectPath } } })}\n`
  }).trim().split("\n");
  const mcpResponse = JSON.parse(mcpLines.at(-1));
  const mcpStatus = JSON.parse(mcpResponse.result.content[0].text);
  assert.deepEqual(
    { title: mcpStatus.title, domainPath: mcpStatus.domainPath, playable: mcpStatus.playable, objectCount: mcpStatus.objectCount, kitCount: mcpStatus.kitCount, sequenceGraph: mcpStatus.sequenceGraph },
    { title: cliStatus.title, domainPath: cliStatus.domainPath, playable: cliStatus.playable, objectCount: cliStatus.objectCount, kitCount: cliStatus.kitCount, sequenceGraph: cliStatus.sequenceGraph },
    "MCP and CLI expose the same accepted project state"
  );
} finally {
  rmSync(playableExportRoot, { recursive: true, force: true });
}

console.log("editor intent smoke passed");
