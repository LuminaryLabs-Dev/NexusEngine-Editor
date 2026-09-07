import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAuthoringHost,
  createFileProjectStore,
  routeAuthoringCommand,
} from "../src/authoring/index.js";
const directory = await mkdtemp(join(tmpdir(), "nexus-authoring-host-"));
try {
  let store = await createFileProjectStore(directory),
    host = await createAuthoringHost({ store, projectId: "proof" });
  assert.equal(host.runtimeIdentity.runtime, "nexusengine");
  assert.equal(host.status().kitIds.length, 19);
  const cube = {
    requestId: "cube",
    epoch: host.status().context.epoch,
    operations: [{ id: "mesh.cube", args: { id: "cube" } }],
  };
  const created = await host.command(cube);
  assert.equal(created.status, "completed");
  assert.equal(
    host.engine.n.authoringProject.getDocument("cube"),
    host.read("cube"),
  );
  const revision = host.read("cube").revision,
    move = {
      requestId: "move",
      epoch: host.status().context.epoch,
      operations: [
        {
          id: "mesh.transform",
          args: {
            id: "cube",
            expectedRevision: revision,
            translation: [1, 0, 0],
          },
        },
      ],
    };
  const preview = host.preview(move);
  assert.equal(host.read("cube").revision, revision);
  await host.accept(preview);
  await assert.rejects(() => host.accept(preview), {
    code: "AUTHORING_STALE_PREVIEW",
  });
  const moved = host.read("cube").hash;
  await host.undo({ requestId: "undo", epoch: cube.epoch });
  await host.redo({ requestId: "redo", epoch: cube.epoch });
  assert.equal(host.read("cube").hash, moved);
  const duplicate = await host.command(cube);
  assert.deepEqual(duplicate, created);
  await assert.rejects(() => createAuthoringHost({ store: awaitStore() }));
  function awaitStore() {
    return {
      acquire: async () => {
        const conflict = await createFileProjectStore(directory);
        await conflict.acquire();
      },
      load: async () => null,
    };
  }
  // Closing without a checkpoint still preserves acknowledged edits in the journal.
  await host.close();
  host = await createAuthoringHost({
    store: await createFileProjectStore(directory),
  });
  assert.equal(host.read("cube").hash, moved);
  assert.ok(host.read("cube").revision > revision);
  assert.deepEqual(await host.command(cube), created);
  await host.command({
    requestId: "sequence-source",
    epoch: host.status().context.epoch,
    operations: [
      {
        id: "sequence.set",
        args: {
          id: "sequence",
          content: {
            during: [
              {
                id: "make",
                operations: [{ id: "mesh.cube", args: { id: "sequenced" } }],
              },
            ],
          },
        },
      },
    ],
  });
  const run = host.startSequence("sequence", { runId: "durable-run" });
  assert.throws(() => run.acknowledge("make", { status: "completed" }), {
    code: "AUTHORING_SEQUENCE_RECEIPT",
  });
  const stepReceipt = await host.advanceSequence(run, "make");
  assert.equal(run.status().state, "finished");
  assert.deepEqual(host.engine.world.drainJournal(), []);
  assert.ok(host.status().resourceChanges > 0);
  await host.close();
  host = await createAuthoringHost({
    store: await createFileProjectStore(directory),
  });
  assert.equal(host.read("sequenced").kind, "mesh");
  assert.deepEqual(
    host.engine.n.authoringProject.getReceipt(stepReceipt.requestId),
    stepReceipt,
  );
  const response = await routeAuthoringCommand(host, {
    id: "failure",
    method: "execute",
    params: {
      requestId: "bad",
      epoch: host.status().context.epoch,
      operations: [{ id: "missing", args: {} }],
    },
  });
  assert.equal(response.id, "failure");
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "AUTHORING_OPERATION_MISSING");
  await host.save();
  const baseline = await readFile(join(directory, "project.json"), "utf8"),
    snapshot = host.snapshot(),
    generation = host.status().generation;
  await host.close();
  store = await createFileProjectStore(directory, {
    fault: (stage) => {
      if (stage === "before-manifest") throw Error("Injected write failure");
    },
  });
  await assert.rejects(
    () => store.save(snapshot, { expectedGeneration: generation }),
    /Injected/,
  );
  assert.equal(
    await readFile(join(directory, "project.json"), "utf8"),
    baseline,
  );
  assert.equal((await store.load()).snapshot.documents.cube.hash, moved);
  const stale = await createFileProjectStore(directory);
  await assert.rejects(
    () => stale.save(snapshot, { expectedGeneration: generation - 1 }),
    { code: "AUTHORING_STORAGE_CONFLICT" },
  );
  const current = JSON.parse(baseline),
    checkpointPath = join(
      directory,
      "checkpoints",
      current.checkpoint.hash.slice(7) + ".json",
    );
  await writeFile(checkpointPath, "corrupt");
  await assert.rejects(() => stale.load(), {
    code: "AUTHORING_STORAGE_CORRUPT",
  });
  console.log(
    "Authoring host: real Engine ownership, edit/preview/history, durable journal recovery, retry preservation, writer conflicts and atomic checkpoint publication passed.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
