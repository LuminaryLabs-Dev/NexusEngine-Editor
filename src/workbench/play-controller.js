import { createEngine } from "nexusengine";
import { createAuthoringDomain } from "nexusengine/domains/authoring";

const copy = (value) => structuredClone(value);
const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });

async function factoryFor(entry) {
  const specifier = `nexusengine/${entry.source.subpath.replace(/^\.\//, "")}`;
  const module = await import(specifier);
  const factory = module[entry.source.exportName];
  if (typeof factory !== "function") throw fail("EDITOR_KIT_FACTORY", `Missing ${entry.source.exportName} from ${specifier}.`);
  return factory;
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
      if ((runtime.kits ?? []).some((kit) => kit.id === entry.registryId)) continue;
      const factory = await factoryFor(entry);
      runtime.installKit(factory(entry.config ?? {}));
    }
    session = { runtime, state: "playing", sourceClock: source.clock, startedAt: Date.now(), ticks: 0 };
    if (options.autoTick !== false) timer = setInterval(() => { try { tick(options.delta ?? 1 / 60); } catch {} }, Math.max(4, Math.round((options.delta ?? 1 / 60) * 1000)));
    return status();
  }
  function status() {
    if (!session) return { state: "stopped", ticks: 0, frame: 0, elapsed: 0, sourceProtected: true };
    return { state: session.state, ticks: session.ticks, frame: session.runtime.clock.frame, elapsed: session.runtime.clock.elapsed, sourceClock: session.sourceClock, sourceProtected: true, installedKits: session.runtime.kits.map((kit) => kit.id) };
  }
  function tick(delta = 1 / 60) {
    if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running.");
    if (session.state === "paused") return status();
    session.runtime.tick(delta); session.ticks += 1; return status();
  }
  function pause() { if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running."); session.state = "paused"; return status(); }
  function resume() { if (!session) throw fail("EDITOR_PLAY_STATE", "Play Mode is not running."); session.state = "playing"; return status(); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } if (!session) return status(); session = null; return status(); }
  return Object.freeze({ start, tick, pause, resume, stop, status, get runtime() { return session?.runtime ?? null; } });
}
