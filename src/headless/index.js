import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

export const HEADLESS_EDITOR_STAGE_ORDER = Object.freeze([
  "read",
  "capture-before",
  "plan",
  "validate",
  "submit",
  "observe",
  "verify",
  "capture-after",
  "observed-differences"
]);

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function normalizeWorkspacePath(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("Headless workspace paths must be non-empty strings.");
  const parts = [];
  for (const part of value.trim().replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new TypeError(`Headless workspace paths cannot traverse upward: ${value}`);
    parts.push(part);
  }
  if (!parts.length || value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    throw new TypeError(`Headless workspace paths must be virtual relative paths: ${value}`);
  }
  return parts.join("/");
}

function isTextPath(path) {
  return new Set([".json", ".md", ".markdown", ".txt", ".log", ".html", ".svg", ".js", ".mjs", ".css"])
    .has(extname(path).toLowerCase());
}

async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

export function createFileHeadlessRunWorkspace(options = {}) {
  const root = resolve(typeof options === "string" ? options : options.root ?? ".headless-editor");
  const absolute = (path) => {
    const normalized = normalizeWorkspacePath(path);
    const target = resolve(root, normalized);
    if (target !== root && !target.startsWith(`${root}${sep}`)) throw new TypeError(`Headless workspace path escaped its root: ${path}`);
    return { normalized, target };
  };

  return Object.freeze({
    kind: "file",
    root,
    async write(path, value) {
      const { target } = absolute(path);
      await mkdir(dirname(target), { recursive: true });
      const bytes = typeof value === "string" || value instanceof Uint8Array || Buffer.isBuffer(value)
        ? value
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
            : (() => { throw new TypeError("Headless workspace writes require text or bytes."); })();
      await writeFile(target, bytes);
      return path;
    },
    async writeText(path, value) { return this.write(path, String(value)); },
    async writeBytes(path, value) { return this.write(path, value); },
    async writeJson(path, value) { return this.writeText(path, `${JSON.stringify(value, null, 2)}\n`); },
    async read(path) { return new Uint8Array(await readFile(absolute(path).target)); },
    async readText(path) { return readFile(absolute(path).target, "utf8"); },
    async readJson(path) { return JSON.parse(await this.readText(path)); },
    async exists(path) {
      try { await stat(absolute(path).target); return true; }
      catch (error) { if (error?.code === "ENOENT") return false; throw error; }
    },
    async list(prefix = "") {
      const files = await walkFiles(root).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error));
      if (!prefix) return files;
      const normalized = normalizeWorkspacePath(prefix);
      return files.filter((path) => path === normalized || path.startsWith(`${normalized}/`));
    },
    async snapshot() {
      const files = {};
      for (const path of await this.list()) {
        const bytes = await this.read(path);
        files[path] = isTextPath(path)
          ? { encoding: "utf8", content: Buffer.from(bytes).toString("utf8") }
          : { encoding: "base64", content: Buffer.from(bytes).toString("base64") };
      }
      return { version: "nexusengine-editor.headless-workspace/1", files };
    }
  });
}

async function writeEmbeddedFiles(workspace, files = {}) {
  const writes = [];
  for (const [path, value] of Object.entries(files ?? {})) {
    if (typeof value === "string" || value instanceof Uint8Array || value instanceof ArrayBuffer) await workspace.write(path, value);
    else if (isObject(value) && typeof value.content === "string") await workspace.writeText(path, value.content);
    else if (isObject(value) && value.bytes) await workspace.writeBytes(path, value.bytes);
    else await workspace.writeJson(path, value);
    writes.push(path);
  }
  return writes;
}

async function readJson(workspace, path, fallback = null) {
  return await workspace.exists(path) ? workspace.readJson(path) : fallback;
}

async function readText(workspace, path, fallback = "") {
  return await workspace.exists(path) ? workspace.readText(path) : fallback;
}

function validateCommands(commands) {
  if (!Array.isArray(commands)) return [{ severity: "error", code: "commands-not-array", message: "plan/commands.json must be an array." }];
  return commands.flatMap((command, index) => {
    if (!isObject(command)) return [{ severity: "error", code: "command-not-object", index, message: "Commands must be objects." }];
    if (typeof command.action !== "string" || !command.action.trim()) return [{ severity: "error", code: "missing-action", index, message: "Command requires a dotted action name." }];
    return [];
  });
}

function shallowDifferences(before = {}, after = {}) {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .sort()
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .map((key) => ({ key, before: before?.[key], after: after?.[key] }));
}

function createLifecycleStages() {
  return new Map([
    ["read", async (context) => {
      const packet = await context.adapter.read?.(context) ?? { ok: true, scene: null, hierarchy: null, assets: [], runtime: null };
      await context.workspace.writeJson("read/packet.json", packet);
      for (const key of ["scene", "hierarchy", "assets", "runtime"]) {
        if (packet[key] !== undefined) await context.workspace.writeJson(`read/${key}.json`, packet[key]);
      }
      await writeEmbeddedFiles(context.workspace, packet.files);
      return { ok: packet.ok !== false };
    }],
    ["capture-before", async (context) => {
      const packet = await context.adapter.capture?.({ phase: "before", workspace: context.workspace, context }, context) ?? { ok: true, phase: "before", captures: [] };
      await context.workspace.writeJson("capture-before/manifest.json", packet);
      await writeEmbeddedFiles(context.workspace, packet.files);
      return { ok: packet.ok !== false };
    }],
    ["plan", async (context) => {
      const goal = await readText(context.workspace, "goal.md", context.goal);
      const readPacket = await readJson(context.workspace, "read/packet.json");
      const captureBefore = await readJson(context.workspace, "capture-before/manifest.json");
      const proposed = await context.adapter.plan?.({ goal, readPacket, captureBefore, workspace: context.workspace, context }, context) ?? {};
      const plan = {
        id: proposed.id ?? `${context.sessionId}-plan`,
        ok: proposed.ok !== false,
        goal,
        commands: Array.isArray(proposed.commands) ? proposed.commands : [],
        notes: proposed.notes ?? []
      };
      await context.workspace.writeJson("plan/plan.json", plan);
      await context.workspace.writeJson("plan/commands.json", plan.commands);
      await context.workspace.writeText("plan/plan.md", `# Headless Editor Plan\n\nGoal: ${goal || "none"}\n\n${plan.commands.map((command) => `- ${command.action}`).join("\n") || "- none"}\n`);
      return { ok: plan.ok, planId: plan.id, commandCount: plan.commands.length };
    }],
    ["validate", async (context) => {
      const plan = await readJson(context.workspace, "plan/plan.json");
      const commands = await readJson(context.workspace, "plan/commands.json", []);
      const localIssues = validateCommands(commands);
      const adapter = await context.adapter.validate?.({ plan, commands, issues: localIssues, workspace: context.workspace, context }, context) ?? {};
      const issues = [...localIssues, ...(adapter.issues ?? [])];
      const validation = { ok: adapter.ok ?? issues.every((entry) => entry.severity !== "error"), planId: plan?.id ?? null, issueCount: issues.length, issues, adapter };
      await context.workspace.writeJson("validate/validation.json", validation);
      await context.workspace.writeJson("validate/issues.json", issues);
      return { ok: validation.ok, issueCount: issues.length };
    }],
    ["submit", async (context) => {
      const plan = await readJson(context.workspace, "plan/plan.json");
      const validation = await readJson(context.workspace, "validate/validation.json", { ok: false });
      const result = validation.ok
        ? await context.adapter.submit?.({ plan, validation, workspace: context.workspace, context }, context) ?? { ok: true, submitted: false, runId: null }
        : { ok: false, skipped: true, reason: "validation-failed", runId: null };
      await context.workspace.writeJson("submit/submit.json", result);
      await context.workspace.writeJson("submit/submitted-commands.json", validation.ok ? plan?.commands ?? [] : []);
      return { ok: result.ok !== false, submitted: result.submitted === true, runId: result.runId ?? null };
    }],
    ["observe", async (context) => {
      const submit = await readJson(context.workspace, "submit/submit.json");
      const result = await context.adapter.observe?.({ submit, workspace: context.workspace, context }, context) ?? { ok: true, status: "not-submitted", runId: null };
      await context.workspace.writeJson("observe/results.json", result);
      await context.workspace.writeJson("observe/status.json", { ok: result.ok !== false, status: result.status ?? "unknown", runId: result.runId ?? null });
      if (result.logs) await context.workspace.writeText("observe/logs.txt", Array.isArray(result.logs) ? result.logs.join("\n") : String(result.logs));
      return { ok: result.ok !== false, status: result.status ?? "unknown", runId: result.runId ?? null };
    }],
    ["verify", async (context) => {
      const submit = await readJson(context.workspace, "submit/submit.json");
      const observation = await readJson(context.workspace, "observe/results.json");
      const result = await context.adapter.verify?.({ submit, observation, workspace: context.workspace, context }, context) ?? { ok: true, checks: [], readAfter: null };
      await context.workspace.writeJson("verify/verification.json", result);
      if (result.readAfter !== undefined) await context.workspace.writeJson("verify/read-after.json", result.readAfter);
      return { ok: result.ok !== false, checkCount: result.checks?.length ?? 0 };
    }],
    ["capture-after", async (context) => {
      const packet = await context.adapter.capture?.({ phase: "after", workspace: context.workspace, context }, context) ?? { ok: true, phase: "after", captures: [] };
      await context.workspace.writeJson("capture-after/manifest.json", packet);
      await writeEmbeddedFiles(context.workspace, packet.files);
      return { ok: packet.ok !== false };
    }],
    ["observed-differences", async (context) => {
      const readBefore = await readJson(context.workspace, "read/packet.json", {});
      const readAfter = await readJson(context.workspace, "verify/read-after.json", {});
      const captureBefore = await readJson(context.workspace, "capture-before/manifest.json", {});
      const captureAfter = await readJson(context.workspace, "capture-after/manifest.json", {});
      const plan = await readJson(context.workspace, "plan/plan.json", {});
      const result = await context.adapter.observedDifferences?.({ readBefore, readAfter, captureBefore, captureAfter, plan, workspace: context.workspace, context }, context) ?? {
        ok: true,
        structured: shallowDifferences(readBefore, readAfter),
        visual: shallowDifferences(captureBefore, captureAfter),
        regressions: [],
        unverifiedClaims: []
      };
      await context.workspace.writeJson("observed-differences/difference.json", result);
      await context.workspace.writeText("observed-differences/summary.md", `# Observed Differences\n\nStructured changes: ${result.structured?.length ?? 0}\nVisual changes: ${result.visual?.length ?? 0}\nRegressions: ${result.regressions?.length ?? 0}\n`);
      return { ok: result.ok !== false, structuredChanges: result.structured?.length ?? 0, visualChanges: result.visual?.length ?? 0 };
    }]
  ]);
}

export function createHeadlessEditorHarness(config = {}) {
  const workspace = config.workspace?.kind === "file"
    ? createFileHeadlessRunWorkspace(config.workspace)
    : createFileHeadlessRunWorkspace(config.workspace ?? {});
  const adapter = config.adapter ?? {};
  const stageOrder = Object.freeze([...(config.stageOrder ?? HEADLESS_EDITOR_STAGE_ORDER)]);
  const stages = createLifecycleStages();
  const sessionId = config.sessionId ?? `headless-editor-${Date.now()}`;
  const goal = String(config.goal ?? "");

  async function initializeRun() {
    if (!await workspace.exists("run.json")) {
      await workspace.writeJson("run.json", { id: sessionId, goal, workspaceKind: workspace.kind, adapterId: adapter.id ?? "anonymous-adapter", stageOrder, currentStage: null, stageResults: [] });
      if (goal) await workspace.writeText("goal.md", goal);
    }
    return workspace.readJson("run.json");
  }

  async function updateRun(patch) {
    const next = { ...await initializeRun(), ...clone(patch) };
    await workspace.writeJson("run.json", next);
    return next;
  }

  const harness = Object.freeze({
    id: sessionId,
    workspace,
    adapter,
    stageOrder,
    async run(options = {}) {
      await initializeRun();
      const stageResults = [];
      for (const stage of options.stageOrder ?? stageOrder) {
        const execute = stages.get(stage);
        if (!execute) continue;
        await updateRun({ currentStage: stage, stageResults });
        const startedAt = new Date().toISOString();
        try {
          const result = await execute({ harness, workspace, adapter, stage, goal, sessionId });
          const stageResult = { stage, ok: result?.ok !== false, startedAt, completedAt: new Date().toISOString(), result: clone(result ?? {}) };
          stageResults.push(stageResult);
          await workspace.writeJson(`stage-results/${stage}.json`, stageResult);
          if (!stageResult.ok && options.stopOnFailure !== false) break;
        } catch (error) {
          const stageResult = { stage, ok: false, startedAt, completedAt: new Date().toISOString(), error: { name: error.name, message: error.message } };
          stageResults.push(stageResult);
          await workspace.writeJson(`stage-results/${stage}.json`, stageResult);
          await updateRun({ currentStage: stage, stageResults, lastError: stageResult.error });
          if (options.stopOnFailure !== false) throw error;
        }
      }
      const run = await updateRun({ currentStage: "complete", completedAt: new Date().toISOString(), stageResults });
      await workspace.writeText("report.md", `# Headless Editor Run Report\n\nRun: ${sessionId}\nGoal: ${goal || "none"}\n\n${stageResults.map((entry) => `- ${entry.stage}: ${entry.ok ? "ok" : "failed"}`).join("\n")}\n`);
      return { ok: stageResults.every((entry) => entry.ok), run, stageResults, workspace, snapshot: await workspace.snapshot() };
    },
    snapshot: () => workspace.snapshot()
  });
  return harness;
}

export function createHeadlessEditorHost() {
  return Object.freeze({
    stageOrder: HEADLESS_EDITOR_STAGE_ORDER,
    createHarness: createHeadlessEditorHarness,
    createFileWorkspace: createFileHeadlessRunWorkspace
  });
}

export default createHeadlessEditorHost;
