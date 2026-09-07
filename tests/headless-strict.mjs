import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVerifiedHeadlessAttempt } from "../src/headless/strict.js";
import { runDevelopmentAttempt, executeDevelopmentCommand } from "../src/headless/development.js";

const root = await mkdtemp(join(tmpdir(), "nexus-headless-proof-"));
let count = 0;
const options = overrides => {
  const id = `attempt-${++count}`;
  const adapter = {
    async read() { return { ok: true, value: 1 }; },
    async capture() { return { ok: true, value: 1 }; },
    async plan() { return { ok: true, commands: [{ action: "test.execute" }] }; },
    async validate() { return { ok: true, issues: [] }; },
    async submit({ workspace }) { await workspace.writeJson("evidence/check.json", { measured: 2 }); return { ok: true, submitted: true, runId: id }; },
    async observe() { return { ok: true, runId: id, status: "completed" }; },
    async verify() { return { ok: true, runId: id, checks: [{ id: "measurement", ok: true, evidence: ["evidence/check.json"] }], readAfter: { value: 2 } }; },
    async observedDifferences() { return { ok: true, structured: [{ value: [1, 2] }], regressions: [], unverifiedClaims: [] }; },
    ...overrides
  };
  return { directory: join(root, id), id, goal: "Prove a measured transition", adapter, requiredChecks: ["measurement"] };
};
try {
  const good = options();
  assert.deepEqual((await runVerifiedHeadlessAttempt(good)).stages, ["read", "capture-before", "plan", "validate", "submit", "observe", "verify", "capture-after", "observed-differences"]);
  await assert.rejects(() => runVerifiedHeadlessAttempt(good), /must be empty/);
  await assert.rejects(() => runVerifiedHeadlessAttempt({ ...options(), adapter: {} }), /Required adapter method/);
  for (const override of [
    { async validate() { return { ok: true, issues: [{ severity: "error" }] }; } },
    { async plan() { return { ok: true, commands: [] }; } },
    { async submit() { return { ok: true, submitted: false, runId: "wrong" }; } },
    { async observe() { throw new Error("interrupted"); } },
    { async observedDifferences() { return { ok: true, regressions: [], unverifiedClaims: ["pixels"] }; } }
  ]) assert.equal((await runVerifiedHeadlessAttempt(options(override))).ok, false);
  for (const checks of [[], [{ id: "measurement", ok: false, evidence: ["evidence/check.json"] }], [{ id: "measurement", ok: true, evidence: ["missing.json"] }]]) {
    const config = options();
    config.adapter.verify = async () => ({ ok: true, runId: config.id, checks, readAfter: { value: 2 } });
    assert.equal((await runVerifiedHeadlessAttempt(config)).ok, false);
  }
  await writeFile(join(root, "source.txt"), "source");
  const development = (id, commands, extra = {}) => runDevelopmentAttempt({ repository: root, directory: join(root, id), id, goal: "Execute actual checks", sourceFiles: ["source.txt"], commands, ...extra });
  assert.equal((await development("process-pass", [{ id: "real-check", executable: process.execPath, args: ["-e", "process.stdout.write('measured')"] }])).ok, true);
  assert.equal((await development("process-fail", [
    { id: "failure", executable: process.execPath, args: ["-e", "process.exit(3)"] },
    { id: "must-not-run", executable: process.execPath, args: ["-e", "require('node:fs').writeFileSync('forbidden.txt','bad')"] }
  ])).ok, false);
  await assert.rejects(() => import("node:fs/promises").then(fs => fs.stat(join(root, "forbidden.txt"))), { code: "ENOENT" });
  assert.equal((await development("stale", [{ id: "check", executable: process.execPath, args: ["-e", "process.exit(0)"] }], { expectedSourceHash: "sha256:wrong" })).ok, false);
  assert.equal((await development("modified", [{ id: "mutation", executable: process.execPath, args: ["-e", "require('node:fs').writeFileSync('source.txt','changed')"] }])).ok, false);
  const timed = await executeDevelopmentCommand({ executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], timeoutMs: 30 }, root);
  assert.equal(timed.timedOut, true); assert.equal(timed.ok, false);
  const overflow = await executeDevelopmentCommand({ executable: process.execPath, args: ["-e", "process.stdout.write('a'.repeat(10000))"], maxOutputBytes: 100 }, root);
  assert.equal(overflow.exceeded, true); assert.equal(Buffer.byteLength(overflow.output), 100);
  console.log("strict headless and development proof passed: stages, identity, evidence, failures, replay, stale source, limits");
} finally { await rm(root, { recursive: true, force: true }); }
