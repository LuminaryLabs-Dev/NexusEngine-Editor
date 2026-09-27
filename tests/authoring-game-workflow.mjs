import assert from "node:assert/strict";
import { createEngine } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";
import { createCompositionController } from "../src/workbench/composition-controller.js";
import { createValidationGameController } from "../src/workbench/validation-game-controller.js";
import { createPlayController } from "../src/workbench/play-controller.js";
import { createEditorBuildController } from "../src/workbench/build-controller.js";

const engine = createEngine({ kits: createAuthoringDomain({ project: { projectId: "proof-game" } }) }),
  project = engine.n.authoringProject,
  host = {
    engine,
    read: (id) => project.getDocument(id),
    list: (kind) => project.listDocuments(kind),
    command: (request) => project.execute(request),
    requestId: () => crypto.randomUUID(),
    status: () => ({ context: project.context() }),
    snapshot: (options) => project.getSnapshot(options),
  };

const composition = createCompositionController(host),
  game = createValidationGameController(host, composition),
  gameState = await game.create();

assert.equal(gameState.ready, true);
assert.ok(gameState.selectedKits.includes("input-contract-kit"));
assert.ok(gameState.selectedKits.includes("body-state-kit"));
assert.ok(gameState.selectedKits.includes("box-shape-kit"));
assert.equal(composition.validate().ok, true);

const source = project.getSnapshot(),
  play = createPlayController(host, composition);
await play.start({ autoTick: false, controlledNodeId: "player-node" });
play.input({ x: 1, y: 1 });
play.tick(0.5);
const moved = play.runtime.n.authoringProject.getDocument("scene").content.nodes.find((node) => node.id === "player-node");
assert.deepEqual(moved.transform.translation, [1.5, 0, -1.5]);
assert.deepEqual(project.getSnapshot(), source, "Play Mode must not mutate Authoring source.");
const glb = await play.preview();
assert.equal(glb.validation.errors, 0);
assert.ok(glb.bytes.byteLength > 0);
play.pause();
assert.equal(play.status().state, "paused");
play.resume();
play.stop();
assert.equal(play.status().state, "stopped");

const calls = [],
  fakeBuild = {
    listTargets: () => [{ id: "web-static" }],
    inspect: (projectPath) => ({ project: projectPath }),
    plan: (request) => ({ id: "plan", request }),
    apply: (id, approval, options) => {
      calls.push({ id, approval, options });
      return { status: "succeeded", planId: id, targets: [{ id: "web-static", status: "succeeded" }] };
    },
    getReceipt: (id) => ({ id }),
    snapshot: () => ({}),
    reset: () => ({}),
  },
  build = createEditorBuildController({ factory: () => fakeBuild });

assert.equal((await build.listTargets())[0].id, "web-static");
const plan = await build.plan({ project: "/tmp/game", targets: ["web-static"], profile: "production" }),
  receipt = await build.apply(plan.id, { planId: plan.id, approved: true }, { out: "/tmp/dist" });
assert.equal(receipt.status, "succeeded");
assert.equal(calls[0].approval.approved, true);

console.log("Editor game workflow: Core composition, no-code proof scene, input-driven isolated Play Mode, runtime GLB and Build approval/apply routing passed.");
