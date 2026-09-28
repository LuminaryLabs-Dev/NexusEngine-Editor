import http from "node:http";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { createAuthoringHost } from "../host.js";
import { createFileProjectStore } from "../storage/file-project.js";
import { createAuthoringView } from "./view.js";
import { createEditorBuildController } from "../../workbench/build-controller.js";
import { createLocalWorkbenchSession } from "../../workbench/adapters/local-session.js";
import { workbenchHtml } from "../../workbench/shell.js";
import { encodeWire, decodeWire } from "../../workbench/adapters/binary-wire.js";
import { editorError, errorRecord } from "../../workbench/host-contract.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function startAuthoringPreview({ host, assemblyId = "scene", port = 0, outputDirectory, view = {}, artifact = null, ui = true } = {}) {
  const readOnly = Boolean(artifact) || ui === false;
  let ownsHost = false, closing = false, url = null, tail = Promise.resolve();
  const buildService = createEditorBuildController();
  const session = createLocalWorkbenchSession(host, { assemblyId, outputDirectory, view: createAuthoringView(view), buildService,
    async switchProject(method, directory, previous, params = {}) {
      if (typeof directory !== "string" || !directory.trim()) throw editorError("EDITOR_PROJECT_DIRECTORY", "A project directory is required.");
      if (previous.status().dirty && params.discard !== true) throw editorError("EDITOR_UNSAVED_PROJECT", "Save or explicitly discard the current project first.");
      const store = await createFileProjectStore(directory), exists = await store.manifest();
      if (method === "new-project" && exists) throw editorError("EDITOR_PROJECT_EXISTS", "The directory already contains a Core project.");
      if (method === "open-project" && !exists) throw editorError("EDITOR_PROJECT_MISSING", "The directory has no Core project.");
      const next = await createAuthoringHost({ store });
      try { await previous.close({ save: false }); } catch (error) { await next.close(); throw error; }
      ownsHost = true; return next;
    } });
  const bundle = await build({ entryPoints: [join(root, readOnly ? "authoring/preview/viewer.js" : "workbench/client.js")],
    outfile: join(root, "../.test-results/local/client.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", write: false, logLevel: "silent" });
  const script = bundle.outputFiles.find(f => f.path.endsWith(".js"))?.contents;
  const css = bundle.outputFiles.find(f => f.path.endsWith(".css"))?.contents ?? new Uint8Array();
  if (!script) throw new Error("Local workbench bundle has no JavaScript entry.");
  const html = readOnly ? '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#080b10"><canvas id="viewport" style="width:100vw;height:100vh"></canvas><script type="module" src="./client.js"></script></body></html>'
    : workbenchHtml({ script: "./client.js", stylesheet: "./client.css", favicon: "./favicon.svg" });
  const clients = new Set();
  const json = (response, value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(encodeWire(value))); };
  async function receive(request) {
    let bytes = 0; const chunks = [];
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 96 * 1024 * 1024) throw editorError("AUTHORING_TRANSPORT_BUDGET", "Request is too large."); chunks.push(chunk); }
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof message.id !== "string" || !message.id || typeof message.method !== "string" || !message.method) throw editorError("AUTHORING_TRANSPORT_INPUT", "A request id and method are required.");
    message.params = decodeWire(message.params ?? {}); return message;
  }
  async function preview(play = false) {
    if (artifact) { const bytes = new Uint8Array(artifact); const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`; return { bytes, hash, packetHash: hash }; }
    const result = await session.execute(play ? "runtime-preview" : "preview-artifact");
    return { ...result, packetHash: result.receipt?.sourcePacket ?? result.hash };
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (closing) return json(response, { ok: false, error: { message: "Host is closing." } }, 503);
      if (request.headers.host !== new URL(url).host || (request.headers.origin && request.headers.origin !== url)) return json(response, { ok: false, error: { message: "Origin/Host differs from this loopback host." } }, 403);
      const path = new URL(request.url, url).pathname;
      if (request.method === "GET") {
        if (path === "/") { response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" }); response.end(html); return; }
        if (path === "/client.js" || path === "/client.css") { response.writeHead(200, { "Content-Type": path.endsWith("css") ? "text/css" : "text/javascript", "Cache-Control": "no-store" }); response.end(path.endsWith("css") ? css : script); return; }
        if (path === "/favicon.svg") { response.writeHead(200, { "Content-Type": "image/svg+xml" }); response.end(await readFile(join(root, "../assets/favicon.svg"))); return; }
        if (path === "/state") return json(response, session.state());
        if (path === "/preview.glb" || path === "/runtime.glb") {
          const result = await preview(path === "/runtime.glb"); response.writeHead(200, { "Content-Type": "model/gltf-binary", "Cache-Control": "no-store", "X-Artifact-Hash": result.hash, "X-Authoring-Source": result.packetHash }); response.end(result.bytes); return;
        }
      }
      if (request.method === "POST" && path === "/api") {
        if (readOnly) throw editorError("AUTHORING_READ_ONLY", "This viewer does not accept commands.");
        const message = await receive(request);
        // All commands share one ordered session. There is no duplicate endpoint implementation.
        const job = tail.then(() => session.execute(message.method, message.params)); tail = job.catch(() => {});
        return json(response, { id: message.id, ok: true, result: await job });
      }
      json(response, { ok: false, error: { message: "Route not found." } }, 404);
    } catch (error) { json(response, { ok: false, error: errorRecord(error) }, 400); }
  });
  server.on("connection", socket => { clients.add(socket); socket.on("close", () => clients.delete(socket)); });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", done); });
  url = `http://127.0.0.1:${server.address().port}`;
  return { url, server, get host() { return session.host; }, get workbench() { return session.workbench; }, getArtifact: preview,
    async close() { closing = true; await tail; await session.dispose(); for (const socket of clients) socket.destroy(); await new Promise(done => server.close(done)); if (ownsHost) await session.host.close({ save: true }); } };
}
