import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { runVerifiedHeadlessAttempt } from "./strict.js";

const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const inside = (root, target) =>
  target === root || target.startsWith(`${root}${sep}`);

async function inspectSources(root, paths) {
  const sourceFiles = {};
  for (const path of paths) {
    if (typeof path !== "string" || isAbsolute(path))
      throw new TypeError("Source paths must be relative.");
    const target = resolve(root, path);
    if (!inside(root, target) || !inside(root, await realpath(target)))
      throw new Error(`Source escapes repository: ${path}.`);
    if (!(await lstat(target)).isFile())
      throw new Error(`Source is not a regular file: ${path}.`);
    sourceFiles[relative(root, target).split(sep).join("/")] = digest(
      await readFile(target),
    );
  }
  return {
    ok: true,
    sourceFiles,
    sourceHash: digest(JSON.stringify(sourceFiles)),
  };
}

/** Runs trusted argument arrays. No shell interpolation; this is not a sandbox. */
export function executeDevelopmentCommand(command, cwd) {
  return new Promise((resolveResult, reject) => {
    const {
      executable,
      args = [],
      timeoutMs = 60000,
      maxOutputBytes = 1024 * 1024,
    } = command;
    if (
      typeof executable !== "string" ||
      !executable ||
      !Array.isArray(args) ||
      args.some((x) => typeof x !== "string") ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isSafeInteger(maxOutputBytes) ||
      maxOutputBytes < 1
    ) {
      reject(new TypeError("Invalid development command."));
      return;
    }
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = Buffer.alloc(0),
      exceeded = false,
      timedOut = false;
    const capture = (chunk) => {
      const available = Math.max(0, maxOutputBytes - output.length);
      output = Buffer.concat([output, chunk.subarray(0, available)]);
      if (chunk.length > available) {
        exceeded = true;
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolveResult({
        ok: code === 0 && !exceeded && !timedOut,
        executable,
        args,
        code,
        signal,
        timedOut,
        exceeded,
        output: output.toString("utf8"),
      });
    });
  });
}

/** Verification adapter: source edits stay in the agent's explicit patch phase. */
export async function runDevelopmentAttempt({
  repository,
  directory,
  id,
  goal,
  sourceFiles,
  commands,
  expectedSourceHash,
}) {
  const root = await realpath(repository);
  if (
    !Array.isArray(sourceFiles) ||
    !sourceFiles.length ||
    new Set(sourceFiles).size !== sourceFiles.length
  )
    throw new TypeError("Declare unique source files.");
  if (
    !Array.isArray(commands) ||
    !commands.length ||
    new Set(commands.map((x) => x.id)).size !== commands.length ||
    commands.some((x) => typeof x.id !== "string" || !/^[a-z0-9-]+$/.test(x.id))
  )
    throw new TypeError("Declare uniquely named commands.");
  let before,
    results = [];
  return runVerifiedHeadlessAttempt({
    directory,
    id,
    goal,
    requiredChecks: commands.map((x) => x.id),
    adapter: {
      id: "repository-verification-adapter",
      async read() {
        before = await inspectSources(root, sourceFiles);
        return before;
      },
      async capture({ phase }) {
        return { ...(await inspectSources(root, sourceFiles)), phase };
      },
      async plan() {
        return {
          ok: true,
          commands: commands.map((x) => ({
            action: "development.execute",
            ...x,
          })),
        };
      },
      async validate() {
        const current = await inspectSources(root, sourceFiles);
        const ok =
          current.sourceHash === before.sourceHash &&
          (!expectedSourceHash || expectedSourceHash === current.sourceHash);
        return {
          ok,
          issues: ok ? [] : [{ severity: "error", code: "stale-source" }],
        };
      },
      async submit({ workspace }) {
        const current = await inspectSources(root, sourceFiles);
        if (current.sourceHash !== before.sourceHash)
          throw new Error("Source changed after validation.");
        for (const command of commands) {
          const result = await executeDevelopmentCommand(command, root);
          const evidence = `commands/${command.id}.json`;
          await workspace.writeJson(evidence, result);
          results.push({ id: command.id, ok: result.ok, evidence: [evidence] });
          if (!result.ok) break;
        }
        return { ok: true, submitted: true, runId: id };
      },
      async observe() {
        return { ok: true, runId: id, status: "completed", results };
      },
      async verify() {
        const after = await inspectSources(root, sourceFiles);
        return { ok: true, runId: id, checks: results, readAfter: after };
      },
      async observedDifferences({ readAfter }) {
        const changed = before.sourceHash !== readAfter.sourceHash;
        return {
          ok: true,
          structured: changed
            ? [{ before: before.sourceHash, after: readAfter.sourceHash }]
            : [],
          visual: [],
          regressions: changed
            ? ["Verification commands modified declared source files."]
            : [],
          unverifiedClaims: [],
        };
      },
    },
  });
}
