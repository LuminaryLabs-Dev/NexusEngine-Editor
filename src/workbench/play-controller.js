import { createEngine } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";
import { normalizeInputIntent } from "nexusengine/domains/interaction/input";
import { resolveKitFactory } from "./adapters/kit-factories.js";
import { editorError, errorRecord } from "./host-contract.js";

export function disposeAuthoringRuntime(engine) {
  engine?.n.authoringSequence?.dispose?.();
  engine?.n.authoringPublishing?.clearCache?.();
}

export function createPlayController(host, composition, { resolveFactory = resolveKitFactory } = {}) {
  let session = null, timer = null, starting = false;
  function status() {
    if (!session) return { state: starting ? "starting" : "stopped", ticks: 0, frame: 0, elapsed: 0, sourceProtected: true };
    return { state: session.state, ticks: session.ticks, frame: session.runtime.clock.frame,
      elapsed: session.runtime.clock.elapsed, sourceClock: session.sourceClock, sourceProtected: true,
      previewBehavior: "authoring-transform-motion", input: session.input, controlledNodeId: session.controlledNodeId,
      error: session.error, installedKits: session.runtime.kits.map(k => k.id) };
  }
  function tick(delta = 1 / 60) {
    if (!session) throw editorError("EDITOR_PLAY_STATE", "Play Mode is not running.");
    if (!Number.isFinite(delta) || delta <= 0 || delta > 1) throw editorError("EDITOR_PLAY_DELTA", "Tick delta must be greater than 0 and at most 1 second.");
    if (session.state !== "playing") return status();
    const priorElapsed = session.runtime.clock.elapsed;
    session.runtime.tick(delta);
    const appliedDelta = session.runtime.clock.elapsed - priorElapsed;
    const project = session.runtime.n.authoringProject;
    const assembly = project.listDocuments("assembly").some(d => d.id === session.assemblyId) ? project.getDocument(session.assemblyId) : null;
    const node = assembly?.content.nodes.find(n => n.id === session.controlledNodeId);
    if (node && (session.input.x || session.input.y)) {
      const next = structuredClone(node), t = next.transform.translation;
      t[0] += session.input.x * session.moveSpeed * appliedDelta;
      t[2] -= session.input.y * session.moveSpeed * appliedDelta;
      project.execute({ requestId: `editor-play-${session.ticks}`, epoch: project.context().epoch,
        operations: [{ id: "assembly.node", args: { id: session.assemblyId, expectedRevision: assembly.revision, node: next } }] });
    }
    session.ticks++;
    return status();
  }
  async function start(options = {}) {
    if (session) return status();
    if (starting) throw editorError("EDITOR_PLAY_BUSY", "Play is already starting.");
    if (!Number.isFinite(options.delta ?? 1 / 60) || (options.delta ?? 1 / 60) <= 0 || (options.delta ?? 1 / 60) > 1)
      throw editorError("EDITOR_PLAY_DELTA", "Tick delta must be greater than 0 and at most 1 second.");
    if (!Number.isFinite(options.moveSpeed ?? 3) || (options.moveSpeed ?? 3) < 0 || (options.moveSpeed ?? 3) > 1000)
      throw editorError("EDITOR_PLAY_SPEED", "Preview movement speed must be between 0 and 1000.");
    starting = true; let runtime = null;
    try {
      const validation = host.engine.n.authoringValidation.project();
      if (validation.errors) throw editorError("EDITOR_PLAY_VALIDATION", "Project validation failed.", { validation });
      const source = host.snapshot();
      const plan = composition.read() ? composition.plan() : { ok: true, order: [] };
      if (!plan.ok) throw editorError("EDITOR_PLAY_COMPOSITION", "Runtime composition is invalid.", { plan });
      runtime = createEngine({ kits: createAuthoringDomain({ project: { projectId: source.projectId } }) });
      runtime.n.authoringProject.loadSnapshot(structuredClone(source));
      for (const entry of plan.order) {
        if (runtime.kits.some(k => k.id === entry.registryId)) continue;
        const factory = await resolveFactory(entry);
        runtime.installKit(factory(entry.config ?? {}));
      }
      if (host.snapshot().clock !== source.clock || host.snapshot().epoch !== source.epoch) throw editorError("EDITOR_PLAY_STALE", "Source changed while Play was starting.");
      session = { runtime, state: "playing", sourceClock: source.clock, ticks: 0,
        assemblyId: options.assemblyId ?? "scene", controlledNodeId: options.controlledNodeId ?? "player-node",
        moveSpeed: Number.isFinite(options.moveSpeed) ? options.moveSpeed : 3,
        input: normalizeInputIntent(), error: null };
      if (options.autoTick !== false) timer = setInterval(() => {
        try { tick(options.delta ?? 1 / 60); }
        catch (error) { clearInterval(timer); timer = null; session.state = "failed"; session.error = errorRecord(error); }
      }, Math.max(4, Math.round((options.delta ?? 1 / 60) * 1000)));
      return status();
    } catch (error) { disposeAuthoringRuntime(runtime); throw error; }
    finally { starting = false; }
  }
  const requireSession = () => { if (!session) throw editorError("EDITOR_PLAY_STATE", "Play Mode is not running."); };
  return Object.freeze({
    start, tick, status,
    input(intent = {}) { requireSession(); session.input = normalizeInputIntent(session.state === "playing" ? intent : {}); session.runtime.n.input?.update({ intent: session.input }, "input"); return status(); },
    pause() { requireSession(); if (session.error) throw editorError("EDITOR_PLAY_FAILED", "Stop the failed runtime before pausing."); session.state = "paused"; session.input = normalizeInputIntent(); session.runtime.n.input?.update({ intent: session.input }, "input"); return status(); },
    resume() { requireSession(); if (session.error) throw editorError("EDITOR_PLAY_FAILED", "Stop the failed runtime before restarting."); session.state = "playing"; return status(); },
    stop() { if (starting) throw editorError("EDITOR_PLAY_BUSY", "Wait for Play startup to finish."); if (timer) clearInterval(timer); timer = null; disposeAuthoringRuntime(session?.runtime); session = null; return status(); },
    async preview({ format = "glb" } = {}) { requireSession(); return session.runtime.n.authoringExport.export({ assemblyId: session.assemblyId, format }); },
    frame() {
      requireSession();
      const assembly = session.runtime.n.authoringAssembly.evaluate(session.assemblyId);
      return { status: status(), nodes: assembly.nodes.map(n => ({ id: n.id, transform: n.transform })), cameras: assembly.cameras };
    },
    get runtime() { return session?.runtime ?? null; },
  });
}
