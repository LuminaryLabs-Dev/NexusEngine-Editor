import { createAuthoringWorkerPool } from "./jobs/pool.js";
import { randomUUID } from "node:crypto";
import { createAuthoringRuntime } from "./runtime-composition.js";
const failure = (code, message, details = {}) =>
  Object.assign(new Error(message), { code, details });
export async function createAuthoringHost({
  store = null,
  projectId = "project",
  maxQueue = 64,
  maxRequestBytes = 32 * 1024 * 1024,
} = {}) {
  let runtime = null,
    state = "opening",
    generation = 0,
    dirty = false,
    queued = 0,
    tail = Promise.resolve(),
    persistenceFailure = null;
  try {
    if (store) await store.acquire?.();
    const loaded = store ? await store.load() : null;
    runtime = createAuthoringRuntime({
      projectId: loaded?.snapshot.projectId ?? projectId,
    });
    if (loaded) {
      const journal = (await store.readJournal?.()) ?? [];
      runtime.project.recover(loaded.snapshot, journal);
      generation = loaded.manifest.generation;
      const saved = await store.save(
        runtime.project.getSnapshot({ immutable: true }),
        { expectedGeneration: generation, requiredKits: runtime.kits },
      );
      generation = saved.generation;
      await store.clearJournal?.();
    } else if (store) {
      const saved = await store.save(
        runtime.project.getSnapshot({ immutable: true }),
        { expectedGeneration: 0, requiredKits: runtime.kits },
      );
      generation = saved.generation;
    }
    state = "ready";
  } catch (error) {
    runtime?.dispose();
    await store?.release?.();
    throw error;
  }
  const assertReady = () => {
    if (!["ready", "operating"].includes(state))
      throw failure("AUTHORING_HOST_CLOSED", `Host is ${state}.`);
  };
  const enqueue = (action) => {
    assertReady();
    if (queued >= maxQueue)
      throw failure("AUTHORING_QUEUE_FULL", "Authoring queue is full.");
    queued++;
    const result = tail.then(async () => {
      if (state === "closed")
        throw failure(
          "AUTHORING_HOST_CLOSED",
          "Host closed before queued operation.",
        );
      const closing = state === "closing";
      if (!closing) state = "operating";
      try {
        return await action();
      } finally {
        consumeJournal();
        if (state === "operating") state = "ready";
      }
    });
    tail = result.catch(() => {}).finally(() => queued--);
    return result;
  };
  const checkSize = (request, limit = maxRequestBytes) => {
    const encoded = JSON.stringify(request);
    if (Buffer.byteLength(encoded) > limit)
      throw failure(
        "AUTHORING_REQUEST_BUDGET",
        "Request exceeds configured transport limit.",
      );
  };
  async function saveNow() {
    if (!store)
      throw failure(
        "AUTHORING_STORAGE_UNAVAILABLE",
        "This embedded host has no persistent store.",
      );
    const manifest = await store.save(
      runtime.project.getSnapshot({ immutable: true }),
      { expectedGeneration: generation, requiredKits: runtime.kits },
    );
    generation = manifest.generation;
    await store.clearJournal?.();
    dirty = false;
    persistenceFailure = null;
    return {
      saved: true,
      generation,
      checkpoint: manifest.checkpoint,
      context: runtime.project.context(),
    };
  }
  async function mutate(action, request, { derived = false } = {}) {
    if (persistenceFailure)
      throw failure(
        "AUTHORING_PERSISTENCE_PENDING",
        "Save the applied source before accepting more edits.",
        { cause: persistenceFailure },
      );
    checkSize(request, derived ? 192 * 1024 * 1024 : maxRequestBytes);
    const method = runtime.project[action];
    if (
      typeof method !== "function" ||
      !["execute", "undo", "redo"].includes(action)
    )
      throw failure(
        "AUTHORING_OPERATION_MISSING",
        "Unsupported project mutation.",
      );
    const receipt = method.call(runtime.project, request);
    dirty = true;
    if (store?.appendJournal) {
      try {
        if (
          derived &&
          Buffer.byteLength(JSON.stringify(request)) > 32 * 1024 * 1024
        )
          await saveNow();
        else await store.appendJournal({ action, request });
      } catch (error) {
        persistenceFailure = {
          code: error.code ?? "STORAGE_ERROR",
          message: error.message,
        };
        throw failure(
          "AUTHORING_JOURNAL_FAILED",
          "Edit applied in memory but was not durably recorded. Save or retry persistence before closing.",
          { receipt, persistenceFailure },
        );
      }
    }
    return receipt;
  }
  let resourceChanges = 0;
  const consumeJournal = () => {
    resourceChanges += runtime.engine.world.drainJournal().length;
  };
  consumeJournal();
  const jobs = createAuthoringWorkerPool();
  const api = {
    jobs,
    commitDerived(source, operations) {
      return enqueue(() => {
        for (const item of source) {
          const current = runtime.project.getDocument(item.id);
          if (current.revision !== item.revision || current.hash !== item.hash)
            throw failure(
              "AUTHORING_STALE_EVALUATION",
              "Source changed during background evaluation.",
            );
        }
        return mutate(
          "execute",
          {
            requestId: randomUUID(),
            epoch: runtime.project.context().epoch,
            operations,
          },
          { derived: true },
        );
      });
    },
    runtimeIdentity: runtime.identity,
    get engine() {
      return runtime.engine;
    },
    status() {
      return {
        state,
        generation,
        dirty,
        queued,
        persistenceFailure,
        resourceChanges,
        context: runtime.project.context(),
        runtime: runtime.identity,
        kitIds: runtime.kits,
      };
    },
    startSequence(id, options) {
      assertReady();
      return runtime.engine.n.authoringSequence.start(id, options);
    },
    advanceSequence(execution, stepId) {
      return enqueue(async () => {
        try {
          const receipt = await mutate("execute", execution.request(stepId));
          return execution.acknowledge(stepId, receipt);
        } catch (error) {
          execution.fail(stepId, error);
          throw error;
        }
      });
    },
    tools() {
      assertReady();
      return runtime.project.tools();
    },
    list(kind) {
      assertReady();
      return runtime.project.listDocuments(kind);
    },
    read(id) {
      assertReady();
      return runtime.project.getDocument(id);
    },
    snapshot(options) {
      assertReady();
      return runtime.project.getSnapshot(options);
    },
    command(request) {
      return enqueue(() => mutate("execute", request));
    },
    undo(request) {
      return enqueue(() => mutate("undo", request));
    },
    redo(request) {
      return enqueue(() => mutate("redo", request));
    },
    preview(request) {
      assertReady();
      checkSize(request);
      return runtime.project.preview(request);
    },
    accept(preview) {
      return enqueue(async () => {
        if (
          preview.epoch !== runtime.project.context().epoch ||
          preview.baseClock !== runtime.project.context().clock
        )
          throw failure("AUTHORING_STALE_PREVIEW", "Preview source changed.");
        return mutate("execute", preview.request);
      });
    },
    save() {
      return enqueue(saveNow);
    },
    finalize(packet, action) {
      return enqueue(async () => {
        for (const source of packet.source) {
          const current = runtime.project.getDocument(source.id);
          if (
            current.revision !== source.revision ||
            current.hash !== source.hash
          )
            throw failure(
              "AUTHORING_STALE_EXPORT",
              "Source changed while output was being built.",
            );
        }
        return action();
      });
    },
    prepare(profile) {
      assertReady();
      return runtime.engine.n.authoringPublishing.prepare(profile);
    },
    async close({ save = false } = {}) {
      if (state === "closed") return { closed: true };
      if (state === "closing")
        throw failure("AUTHORING_HOST_CLOSING", "Close is already running.");
      state = "closing";
      await jobs.close();
      await tail;
      try {
        if (save) await saveNow();
        else if (persistenceFailure)
          throw failure(
            "AUTHORING_PERSISTENCE_PENDING",
            "Source has an unresolved persistence failure.",
          );
        runtime.dispose();
        await store?.release?.();
        state = "closed";
        return { closed: true, saved: save };
      } catch (error) {
        state = "ready";
        throw error;
      }
    },
    requestId: () => randomUUID(),
  };
  return api;
}
