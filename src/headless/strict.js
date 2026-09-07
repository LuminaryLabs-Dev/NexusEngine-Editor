import { mkdir, open, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createHeadlessEditorHarness,
  HEADLESS_EDITOR_STAGE_ORDER,
} from "./index.js";

const methods = [
  "read",
  "capture",
  "plan",
  "validate",
  "submit",
  "observe",
  "verify",
  "observedDifferences",
];
const requireTrue = (value, label) => {
  if (value !== true) throw new Error(`${label} did not explicitly pass.`);
};

/** Finite evidence collection for trusted adapters; not a persistent controller. */
export async function runVerifiedHeadlessAttempt({
  directory,
  id,
  goal,
  adapter,
  requiredChecks,
}) {
  if (typeof directory !== "string" || !directory.trim())
    throw new TypeError("directory is required.");
  if (typeof id !== "string" || !id.trim())
    throw new TypeError("id is required.");
  if (typeof goal !== "string" || !goal.trim())
    throw new TypeError("goal is required.");
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function")
      throw new TypeError(`Required adapter method: ${method}.`);
  }
  if (
    !Array.isArray(requiredChecks) ||
    !requiredChecks.length ||
    requiredChecks.some((name) => typeof name !== "string" || !name.trim()) ||
    new Set(requiredChecks).size !== requiredChecks.length
  ) {
    throw new TypeError(
      "requiredChecks must contain unique, nonempty check names.",
    );
  }
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length)
    throw new Error("Attempt directory must be empty; use a new attempt ID.");
  // The exclusive claim remains after failure or completion, preventing accidental reuse.
  const claim = await open(resolve(root, "attempt.claim"), "wx");
  try {
    await claim.writeFile(id);
  } finally {
    await claim.close();
  }
  const wrapped = { id: adapter.id ?? "strict-adapter" };
  for (const method of methods)
    wrapped[method] = async (...args) => {
      const result = await adapter[method](...args);
      requireTrue(result?.ok, method);
      if (
        method === "plan" &&
        (!Array.isArray(result.commands) || !result.commands.length)
      ) {
        throw new Error(
          "A verified attempt requires declared execution commands.",
        );
      }
      if (
        method === "validate" &&
        (!Array.isArray(result.issues) ||
          result.issues.some((x) => x.severity === "error"))
      ) {
        throw new Error("Validation requires explicit issues without errors.");
      }
      if (
        ["submit", "observe", "verify"].includes(method) &&
        result.runId !== id
      ) {
        throw new Error(`${method} receipt must identify this attempt.`);
      }
      if (method === "submit") requireTrue(result.submitted, "submission");
      if (method === "observe" && result.status !== "completed")
        throw new Error("Execution did not complete.");
      if (method === "verify") {
        if (
          !Array.isArray(result.checks) ||
          new Set(result.checks.map((x) => x.id)).size !== result.checks.length
        ) {
          throw new Error("Verification requires uniquely identified checks.");
        }
        for (const check of result.checks) {
          requireTrue(check.ok, `check ${check.id}`);
          if (!Array.isArray(check.evidence) || !check.evidence.length)
            throw new Error(`Missing evidence for ${check.id}.`);
          for (const path of check.evidence) {
            if (!(await args[0].workspace.exists(path)))
              throw new Error(`Missing evidence file: ${path}.`);
          }
        }
        for (const name of requiredChecks) {
          if (!result.checks.some((check) => check.id === name))
            throw new Error(`Missing required check: ${name}.`);
        }
        if (!result.readAfter || typeof result.readAfter !== "object")
          throw new Error("Missing read-after evidence.");
      }
      if (method === "observedDifferences") {
        for (const field of ["regressions", "unverifiedClaims"]) {
          if (!Array.isArray(result[field]) || result[field].length)
            throw new Error(`Unresolved ${field}.`);
        }
      }
      return result;
    };
  const harness = createHeadlessEditorHarness({
    workspace: { root },
    sessionId: id,
    goal,
    adapter: wrapped,
  });
  await harness.workspace.writeJson("required-checks.json", requiredChecks);
  let outcome;
  try {
    const result = await harness.run();
    const stages = result.stageResults.map((x) => x.stage);
    const ok =
      result.ok &&
      JSON.stringify(stages) === JSON.stringify(HEADLESS_EDITOR_STAGE_ORDER);
    outcome = { ok, id, stages, status: ok ? "verified" : "failed" };
  } catch (error) {
    const run = await harness.workspace.readJson("run.json");
    outcome = {
      ok: false,
      id,
      status: "failed",
      stages: run.stageResults.map((x) => x.stage),
      error: { name: error.name, message: error.message },
    };
  }
  await harness.workspace.writeJson("attempt-result.json", outcome);
  return outcome;
}
