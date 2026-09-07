#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAuthoringHost } from "../src/authoring/host.js";
import { createFileProjectStore } from "../src/authoring/storage/file-project.js";
import { serveAuthoringStdio } from "../src/authoring/transports/stdio.js";
import { startAuthoringPreview } from "../src/authoring/preview/localhost-server.js";
import { publishAuthoringGLB } from "../src/authoring/export/publish.js";
import { authoringErrorRecord } from "../src/authoring/command-router.js";
const args = process.argv.slice(2),
  command = args.shift() ?? "help",
  options = {};
function usage() {
  return `Nexus Authoring\n\n  nexus-authoring create --project PATH\n  nexus-authoring open --project PATH [--port 0] [--assembly scene]\n  nexus-authoring stdio --project PATH\n  nexus-authoring run --project PATH --file OPERATIONS.json\n  nexus-authoring export --project PATH [--assembly scene] [--output PATH]\n\nThe selected directory contains project.json, content-addressed documents and\nblobs, checkpoints and a durable command journal. The local browser uses this\nsame real Engine host. JSON-line stdio exposes tools, execute, preview, save\nand close. Run accepts an array of operations or a complete project request.\n`;
}
let host, server;
try {
  if (command === "help" || command === "--help") {
    process.stdout.write(usage());
  } else {
    if (!["create", "open", "stdio", "run", "export"].includes(command))
      throw Error(`Unknown command ${command}.`);
    while (args.length) {
      const key = args.shift();
      if (
        !["--project", "--port", "--assembly", "--file", "--output"].includes(
          key,
        ) ||
        !args.length ||
        Object.hasOwn(options, key)
      )
        throw Error(`Invalid or repeated option ${key}.`);
      options[key] = args.shift();
    }
    if (!options["--project"]) throw Error("--project PATH is required.");
    const directory = resolve(options["--project"]),
      store = await createFileProjectStore(directory);
    const existing = await store.manifest();
    if (command === "create" && existing)
      throw Error(
        "The selected directory already contains an Authoring project.",
      );
    if (["open", "run", "export"].includes(command) && !existing)
      throw Error(
        "No Authoring project exists in this directory; create it first.",
      );
    host = await createAuthoringHost({ store });
    const output = options["--output"]
        ? resolve(options["--output"])
        : join(directory, "exports"),
      assemblyId = options["--assembly"] ?? "scene";
    if (command === "create") {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          project: directory,
          status: host.status(),
        }) + "\n",
      );
      await host.close();
    }
    if (command === "run") {
      if (!options["--file"])
        throw Error("--file OPERATIONS.json is required.");
      const input = JSON.parse(
          await readFile(resolve(options["--file"]), "utf8"),
        ),
        request = Array.isArray(input)
          ? {
              requestId: randomUUID(),
              epoch: host.status().context.epoch,
              operations: input,
            }
          : input,
        receipt = await host.command(request),
        checkpoint = await host.save();
      process.stdout.write(
        JSON.stringify({ ok: true, receipt, checkpoint }) + "\n",
      );
      await host.close();
    }
    if (command === "export") {
      const packet = host.prepare({ assemblyId }),
        result = await publishAuthoringGLB(packet, output, {
          jobs: host.jobs,
          commitGuard: (action) => host.finalize(packet, action),
        });
      process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
      await host.close();
    }
    if (command === "stdio") {
      await serveAuthoringStdio(host);
      if (host.status().state !== "closed") await host.close();
    }
    if (command === "open") {
      const port = Number(options["--port"] ?? 0);
      if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw Error("--port must be an integer from 0 to 65535.");
      server = await startAuthoringPreview({
        host,
        assemblyId,
        port,
        outputDirectory: output,
      });
      process.stdout.write(
        JSON.stringify({
          ok: true,
          url: server.url,
          project: directory,
          runtime: host.runtimeIdentity,
        }) + "\n",
      );
      let closing = false;
      const close = async () => {
        if (closing) return;
        closing = true;
        try {
          await server.close();
          await host.close({ save: true });
          process.exitCode = 0;
        } catch (error) {
          process.stderr.write(
            JSON.stringify({ ok: false, error: authoringErrorRecord(error) }) +
              "\n",
          );
          process.exitCode = 1;
        }
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    }
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify({ ok: false, error: authoringErrorRecord(error) }) + "\n",
  );
  await server?.close().catch(() => {});
  if (host?.status().state !== "closed") await host?.close().catch(() => {});
  process.exitCode = 1;
}
