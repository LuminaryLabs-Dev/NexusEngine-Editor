import { createAuthoringHost } from "../host.js";
import { createFileProjectStore } from "../storage/file-project.js";
import { installAuthoringPanel } from "../ui/descriptors.js";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import {
  routeAuthoringCommand,
  authoringErrorRecord,
} from "../command-router.js";
import { encodeAuthoringGLB } from "../export/glb.js";
import { publishAuthoringGLB } from "../export/publish.js";
import { createAuthoringView } from "./view.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function startAuthoringPreview({
  host,
  assemblyId = "scene",
  port = 0,
  outputDirectory,
  view = {},
  ui = true,
  artifact = null,
} = {}) {
  if (artifact && ui)
    throw Error("Artifact inspection uses the read-only viewer.");
  let panel = ui ? installAuthoringPanel(host) : null,
    ownsHost = false,
    switching = false;
  const bundle = await build({
      entryPoints: [join(root, ui ? "ui/client.js" : "preview/viewer.js")],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
      logLevel: "silent",
    }),
    script = bundle.outputFiles[0].contents;
  let cached = null,
    url = null,
    closing = false;
  const clients = new Set();
  const json = (response, value, status = 200) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(value));
  };
  async function receive(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024)
        throw Object.assign(new Error("HTTP request is too large."), {
          code: "AUTHORING_TRANSPORT_BUDGET",
        });
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  function preview() {
    if (artifact) {
      const bytes = artifact,
        hash = "sha256:" + createHash("sha256").update(bytes).digest("hex");
      return { bytes, hash, packetHash: hash };
    }
    const packet = host.prepare({ assemblyId });
    if (!cached || cached.packetHash !== packet.hash) {
      const result = encodeAuthoringGLB(packet);
      cached = {
        packetHash: packet.hash,
        hash: result.hash,
        bytes: result.bytes,
        packet,
      };
    }
    return cached;
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (closing) {
        json(
          response,
          { ok: false, error: { message: "Server is closing." } },
          503,
        );
        return;
      }
      if (request.headers.origin && request.headers.origin !== url) {
        json(
          response,
          {
            ok: false,
            error: {
              message: "Origin differs from this local authoring host.",
            },
          },
          403,
        );
        return;
      }
      const path = new URL(request.url, url ?? "http://127.0.0.1").pathname;
      if (request.method === "GET" && path === "/") {
        response.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        });
        response.end(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexus Authoring</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#11151d}canvas{display:block}#viewport{position:absolute;inset:0;width:100%;height:100%}#interface{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style></head><body><canvas id="viewport" aria-label="Authoring 3D viewport"></canvas>${ui ? '<canvas id="interface" aria-label="Authoring controls; Tab changes focus and Enter activates" tabindex="0"></canvas>' : ""}<script type="module" src="/client.js"></script></body></html>`,
        );
        return;
      }
      if (request.method === "GET" && path === "/client.js") {
        response.writeHead(200, { "Content-Type": "text/javascript" });
        response.end(script);
        return;
      }
      if (request.method === "GET" && path === "/state") {
        json(response, {
          status: host.status(),
          documents: host.list(),
          panel,
          workspace: host.list().some((d) => d.id === "workspace")
            ? host.read("workspace")
            : null,
          selection: host.list().some((d) => d.id === "editor-object-selection")
            ? host.read("editor-object-selection")
            : null,
          assemblyId,
          assembly: host.list("assembly").some((d) => d.id === assemblyId)
            ? host.read(assemblyId)
            : null,
          view: createAuthoringView(view),
        });
        return;
      }
      if (request.method === "GET" && path === "/preview.glb") {
        const content = preview();
        response.writeHead(200, {
          "Content-Type": "model/gltf-binary",
          "Cache-Control": "no-store",
          "X-Authoring-Source": content.packetHash,
          "X-Artifact-Hash": content.hash,
        });
        response.end(content.bytes);
        return;
      }
      if (request.method === "POST" && path === "/api") {
        const message = await receive(request);
        if (switching) throw Error("A project switch is already running.");
        if (["open-project", "new-project"].includes(message.method)) {
          switching = true;
          try {
            const directory = message.params?.directory;
            if (typeof directory !== "string" || !directory.trim())
              throw Error("A project directory is required.");
            const store = await createFileProjectStore(directory),
              exists = await store.manifest();
            if (message.method === "new-project" && exists)
              throw Error("The selected directory already contains a project.");
            if (message.method === "open-project" && !exists)
              throw Error(
                "The selected directory has no Authoring project.json.",
              );
            const next = await createAuthoringHost({ store });
            try {
              await host.close({ save: true });
            } catch (error) {
              await next.close();
              throw error;
            }
            host = next;
            ownsHost = true;
            panel = ui ? installAuthoringPanel(host) : null;
            cached = null;
            outputDirectory = join(store.root, "exports");
            json(response, {
              id: message.id,
              ok: true,
              result: { project: store.root, status: host.status() },
            });
            return;
          } finally {
            switching = false;
          }
        }
        if (message.method === "export") {
          if (!outputDirectory)
            throw Object.assign(
              new Error("This preview has no export directory."),
              { code: "AUTHORING_EXPORT_DESTINATION" },
            );
          const packet = host.prepare({ assemblyId }),
            result = await publishAuthoringGLB(packet, outputDirectory, {
              jobs: host.jobs,
              commitGuard: (action) => host.finalize(packet, action),
            });
          json(response, { id: message.id, ok: true, result });
          return;
        }
        json(response, await routeAuthoringCommand(host, message));
        return;
      }
      json(
        response,
        { ok: false, error: { message: "Route not found." } },
        404,
      );
    } catch (error) {
      json(response, { ok: false, error: authoringErrorRecord(error) }, 400);
    }
  });
  server.on("connection", (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    server,
    async close() {
      closing = true;
      for (const socket of clients) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      if (ownsHost) await host.close({ save: true });
    },
    get host() {
      return host;
    },
    getArtifact: preview,
  };
}
