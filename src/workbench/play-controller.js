import { createEngine } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";
import { normalizeInputIntent } from "nexusengine/domains/interaction/input";

const copy = (value) => structuredClone(value);
const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });

async function factoryFor(entry) {
  const specifier = `nexusengine/${entry.source.subpath.replace(/^\.\//, "")}`;
  const module = await import(specifier);
  const factory = module[entry.source.exportName];
  if (typeof factory !== "function") throw fail("EDITOR_KIT_FACTORY", `Missing ${entry.source.exportName} from ${specifier}.`);
  return factory;
}

function transformFor(node) {
  return node.transform ?? { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

export function createPlayController(host, composition) {
  let session = null, timer = null;

  async function start(options = {}) {
    if (session) return status();
    const validation = host.engine.n.authoringValidation.project();
    if (validation.errors) throw fail("EDITOR_PLAY_VALIDATION", "Project validation failed before Play Mode.", { validation });
    const source = host.snapshot(), plan = composition.read() ? composition.plan() : { ok: true, order: [] };
    if (!plan.ok) throw fail("EDITOR_PLAY_COMPOSITION", "Game composition is invalid.", { plan });
    const runtime = createEngine({ kits: createAuthoringDomain({ project: { projectId: source.projectId } }) });
    runtime.n.authoringProject.loadSnapshot(copy(source));
    for (const entry of plan.order ?? []) {
      if (runtime.kits.some((kit) => kit.id === entry.registryId)) continue;
      const factory = await factoryFor(entry);
      runtime.installKit(factory(entry.config ?? {}));
    }
    session = {
      runtime,
      state: "playing",
      sourceClock: source.clock,
      startedAt: Date.now(),
      ticks: 0,
      assemblyId: options.assemblyId ?? "scene",
      controlledNodeId: options.controlledNodeId ?? "player-node",
      moveSpeed: Number.isFinite(options.moveSpeed) ? options.moveSpeed : 3,
      input: normalizeInputIntent(),
    };
    publishInput();
    if (options.autoTick !== false) timer = setInterval(() => { try { tick(options.delta ?? 1 / 60); } catch {} }, Math.max(4, Math.round((options.delta ?? 1 / 60) * 1000)));
    return status();
  }

  function publishInput() {
    if (!session?.runtime.n.input) return;
    session.runtime.n.input.update({ intent: session.input }, "input");
  }

  function input(intent = {}) {
    if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running.");
    session.input = normalizeInputIntent(intent);
    publishInput();
    return status();
  }

  function moveControlledNode(delta) {
    if (!session || (!session.input.x && !session.input.y)) return;
    const project = session.runtime.n.authoringProject;
    let assembly;
    try { assembly = project.getDocument(session.assemblyId); } catch { return; }
    const node = assembly.content.nodes.find((entry) => entry.id === session.controlledNodeId);
    if (!node) return;
    const t = transformFor(node), next = copy(node);
    next.transform = {
      ...t,
      translation: [
        t.translation[0] + session.input.x * session.moveSpeed * delta,
        t.translation[1],
        t.translation[2] - session.input.y * session.moveSpeed * delta,
      ],
    };
    project.execute({
      requestId: `editor-play-${session.ticks}-${session.controlledNodeId}`,
      epoch: project.context().epoch,
      operations: [{ id: "assembly.node", args: { id: session.assemblyId, expectedRevision: assembly.revision, node: next } }],
    });
  }

  function status() {
    if (!session) return { state: "stopped", ticks: 0, frame: 0, elapsed: 0, sourceProtected: true, input: normalizeInputIntent() };
    return {
      state: session.state,
      ticks: session.ticks,
      frame: session.runtime.clock.frame,
      elapsed: session.runtime.clock.elapsed,
      sourceClock: session.sourceClock,
      sourceProtected: true,
      input: session.input,
      controlledNodeId: session.controlledNodeId,
      installedKits: session.runtime.kits.map((kit) => kit.id),
    };
  }

  function tick(delta = 1 / 60) {
    if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running.");
    if (session.state === "paused") return status();
    moveControlledNode(delta);
    session.runtime.tick(delta);
    session.ticks += 1;
    return status();
  }

  async function preview({ format = "glb" } = {}) {
    if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running.");
    return session.runtime.n.authoringExport.export({
      requestId: `editor-runtime-preview-${session.ticks}-${format}`,
      assemblyId: session.assemblyId,
      format,
    });
  }

  function pause() { if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running."); session.state = "paused"; return status(); }
  function resume() { if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running."); session.state = "playing"; return status(); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } if (!session) return status(); session = null; return status(); }

  return Object.freeze({ start, input, tick, preview, pause, resume, stop, status, get runtime() { return session?.runtime ?? null; } });
}
