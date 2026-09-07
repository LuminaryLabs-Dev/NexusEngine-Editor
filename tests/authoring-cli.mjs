import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
const directory = await mkdtemp(join(tmpdir(), "nexus-authoring-cli-"));
const child = spawn(
  process.execPath,
  ["scripts/nexus-authoring.mjs", "stdio", "--project", directory],
  { stdio: ["pipe", "pipe", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));
const iterator = createInterface({ input: child.stdout })[
    Symbol.asyncIterator
  ](),
  responses = [];
const exchange = async (message) => {
  child.stdin.write(JSON.stringify(message) + "\n");
  const line = await iterator.next();
  assert.equal(line.done, false, stderr);
  const response = JSON.parse(line.value);
  assert.equal(response.id, message.id);
  assert.equal(response.ok, true, JSON.stringify(response));
  responses.push(response);
  return response.result;
};
const timeout = setTimeout(() => child.kill("SIGKILL"), 15000);
try {
  const status = await exchange({ id: "status", method: "status" });
  assert.equal(status.kitIds.length, 19);
  const tools = await exchange({ id: "tools", method: "tools" });
  assert.ok(JSON.stringify(tools).includes("mesh.cube"));
  await exchange({
    id: "create",
    method: "execute",
    params: {
      requestId: "cli-cube",
      epoch: status.context.epoch,
      operations: [{ id: "mesh.cube", args: { id: "cube" } }],
    },
  });
  const docs = await exchange({
    id: "list",
    method: "list",
    params: { kind: "mesh" },
  });
  assert.equal(docs[0].id, "cube");
  await exchange({ id: "save", method: "save" });
  await exchange({ id: "close", method: "close" });
  child.stdin.end();
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0, stderr);
  console.log(
    "Authoring CLI: real Engine startup, tool discovery, durable edit, readback, save and clean shutdown passed.",
  );
} finally {
  clearTimeout(timeout);
  child.kill();
  await rm(directory, { recursive: true, force: true });
}
