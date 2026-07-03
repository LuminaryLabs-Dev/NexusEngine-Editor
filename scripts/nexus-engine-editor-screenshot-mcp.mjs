#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const DEFAULT_URL = "http://127.0.0.1:4174/?run=small-game-loop-2";
const DEFAULT_SCREENSHOT_DIR = ".agent/screenshots";
const DEFAULT_MCP_OUTPUT_DIR = ".agent/mcp-output";
const execFileAsync = promisify(execFile);
const CLI_SCREENSHOT_OPERATIONS = new Set(["chess-game", "target-clicker-game", "gem-collector-game", "game-template"]);

const TOOLS = Object.freeze([
  {
    name: "editor_screenshot",
    description: "Capture a screenshot of the NexusEngine Editor or exported game URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open before capture." },
        outputPath: { type: "string", description: "Screenshot file path. Defaults under .agent/screenshots." },
        width: { type: "number", description: "Viewport width." },
        height: { type: "number", description: "Viewport height." },
        fullPage: { type: "boolean", description: "Capture full page instead of viewport." }
      }
    }
  },
  {
    name: "editor_visual_status",
    description: "Capture the editor and return panel bounds, visible text summary, and screenshot path.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open before inspection." },
        outputPath: { type: "string", description: "Screenshot file path. Defaults under .agent/screenshots." },
        width: { type: "number", description: "Viewport width." },
        height: { type: "number", description: "Viewport height." }
      }
    }
  },
  {
    name: "editor_click_screenshot",
    description: "Open the editor, click a selector or coordinate, then capture a screenshot and visual status.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open before clicking." },
        selector: { type: "string", description: "CSS selector to click." },
        x: { type: "number", description: "Viewport x coordinate when selector is omitted." },
        y: { type: "number", description: "Viewport y coordinate when selector is omitted." },
        outputPath: { type: "string", description: "Screenshot file path. Defaults under .agent/screenshots." },
        width: { type: "number", description: "Viewport width." },
        height: { type: "number", description: "Viewport height." }
      }
    }
  },
  {
    name: "editor_human_view_diagnostic",
    description: "Capture the editor and return screenshot-backed checks for docking, viewport, and CLI-only kit installation.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to open before inspection." },
        outputPath: { type: "string", description: "Screenshot file path. Defaults under .agent/screenshots." },
        width: { type: "number", description: "Viewport width." },
        height: { type: "number", description: "Viewport height." }
      }
    }
  },
  {
    name: "editor_cli_game_screenshot",
    description: "Run a CLI game/template operation, open the generated HTML, and return screenshot-backed status.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", description: "CLI operation: chess-game, target-clicker-game, gem-collector-game, or game-template." },
        template: { type: "string", description: "Template id when operation is game-template." },
        count: { type: "number", description: "Optional game-template object count." },
        htmlPath: { type: "string", description: "Generated HTML path. Defaults under .agent/mcp-output." },
        projectPath: { type: "string", description: "Generated .project.json path. Defaults under .agent/mcp-output." },
        outputPath: { type: "string", description: "Screenshot file path. Defaults under .agent/screenshots." },
        selector: { type: "string", description: "Optional selector to click before capture." },
        x: { type: "number", description: "Optional viewport x coordinate to click before capture." },
        y: { type: "number", description: "Optional viewport y coordinate to click before capture." },
        width: { type: "number", description: "Viewport width." },
        height: { type: "number", description: "Viewport height." }
      }
    }
  }
]);

function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function response(id, result) {
  writeJson({ jsonrpc: "2.0", id, result });
}

function errorResponse(id, error) {
  writeJson({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error)
    }
  });
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function screenshotPath(input = {}) {
  return resolve(input.outputPath || `${DEFAULT_SCREENSHOT_DIR}/editor-${timestampSlug()}.png`);
}

function mcpOutputPath(inputPath, fallbackName) {
  return resolve(inputPath || `${DEFAULT_MCP_OUTPUT_DIR}/${fallbackName}`);
}

async function withPage(input, callback) {
  const width = Math.max(320, Math.min(3840, Math.floor(Number(input.width) || 1440)));
  const height = Math.max(240, Math.min(2160, Math.floor(Number(input.height) || 920)));
  const executablePath = process.platform === "linux" ? "/usr/bin/chromium" : undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-web-security", "--allow-file-access-from-files"]
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(input.url || DEFAULT_URL, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");
    return await callback(page);
  } finally {
    await browser.close();
  }
}

async function captureScreenshot(input = {}) {
  const outputPath = screenshotPath(input);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await withPage(input, async (page) => {
    await page.screenshot({ path: outputPath, fullPage: Boolean(input.fullPage) });
  });
  return {
    path: outputPath,
    url: input.url || DEFAULT_URL,
    fullPage: Boolean(input.fullPage)
  };
}

async function inspectPage(page) {
  return await page.evaluate(() => {
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const manifest = (() => {
      try {
        return JSON.parse(document.querySelector("#project-manifest")?.textContent || "{}");
      } catch {
        return {};
      }
    })();
    const viewport = rectFor(".editor-viewport");
    const domainStack = rectFor('[data-panel="domainStack"]');
    const configure = rectFor('[data-panel="configure"]');
    const sequence = rectFor('[data-panel="sequence"]');
    const installButtons = Array.from(document.querySelectorAll("#install-kit, #install-bundle, [data-install-kit]"));
    const cliInstallCommand = document.querySelector(".kit-picker-actions code")?.textContent?.trim() ?? "";
    const runtime = window.__NEXUS_EDITOR_RUNTIME__ ?? {};
    const bodyText = document.body.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
    const domainDocked = Boolean(viewport && domainStack && domainStack.left - viewport.left < 100 && domainStack.top - viewport.top < 140);
    const configureDocked = Boolean(viewport && configure && viewport.right - configure.right < 160 && configure.top - viewport.top < 180);
    const sequenceDocked = Boolean(viewport && sequence && viewport.bottom - sequence.bottom < 120);
    return {
      title: document.title,
      bodyText: bodyText.slice(0, 60),
      panels: { domainStack, configure, sequence },
      commandStrip: rectFor(".command-strip"),
      viewport,
      canvas: rectFor("#viewport-canvas"),
      registry: {
        hasInstallButtons: installButtons.length > 0,
        cliInstallCommand
      },
      runtime: {
        source: runtime.source,
        kitMutationMode: runtime.kitMutationMode,
        installOrder: runtime.installOrder ?? [],
        bindings: runtime.bindings ?? []
      },
      docking: {
        domainStack: domainDocked,
        configure: configureDocked,
        sequence: sequenceDocked
      },
      manifest: {
        title: manifest.title,
        domainPath: manifest.domainPath,
        objectCount: manifest.scene3d?.objects?.length ?? 0,
        sequenceStepCount: manifest.sequenceSteps?.length ?? 0,
        runtime: manifest.runtime,
        domainStackHealth: manifest.domainStackHealth
      }
    };
  });
}

async function visualStatus(input = {}) {
  const outputPath = screenshotPath(input);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  return await withPage(input, async (page) => {
    await page.screenshot({ path: outputPath, fullPage: false });
    const status = await inspectPage(page);
    return {
      path: outputPath,
      url: input.url || DEFAULT_URL,
      ...status
    };
  });
}

async function clickScreenshot(input = {}) {
  const outputPath = screenshotPath(input);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  return await withPage(input, async (page) => {
    const clicked = input.selector
      ? { selector: input.selector }
      : { x: Math.floor(Number(input.x) || 0), y: Math.floor(Number(input.y) || 0) };
    if (input.selector) {
      await page.locator(input.selector).first().click({ timeout: 5000 });
    } else {
      await page.mouse.click(clicked.x, clicked.y);
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: outputPath, fullPage: false });
    const status = await inspectPage(page);
    return {
      path: outputPath,
      url: input.url || DEFAULT_URL,
      clicked,
      ...status
    };
  });
}

async function humanViewDiagnostic(input = {}) {
  const status = await visualStatus(input);
  const checks = [
    {
      id: "viewport-canvas-visible",
      ok: Boolean(status.viewport && status.canvas && status.canvas.width > 0 && status.canvas.height > 0),
      detail: status.canvas ? `${status.canvas.width}x${status.canvas.height}` : "missing canvas"
    },
    {
      id: "primary-panels-docked",
      ok: Boolean(status.docking.domainStack && status.docking.configure && status.docking.sequence),
      detail: JSON.stringify(status.docking)
    },
    {
      id: "kit-install-cli-only",
      ok: Boolean(!status.registry.hasInstallButtons && status.registry.cliInstallCommand.includes("operations submit install-kit") && status.runtime.kitMutationMode === "read-only"),
      detail: status.registry.cliInstallCommand || "missing CLI command"
    },
    {
      id: "manifest-loaded",
      ok: Boolean(status.manifest.domainPath && status.manifest.objectCount >= 1),
      detail: `${status.manifest.domainPath || "missing"} · ${status.manifest.objectCount} objects`
    }
  ];
  return {
    ...status,
    ok: checks.every((check) => check.ok),
    checks
  };
}

async function cliGameScreenshot(input = {}) {
  const operation = String(input.operation || "gem-collector-game");
  if (!CLI_SCREENSHOT_OPERATIONS.has(operation)) {
    throw new Error(`Unsupported CLI screenshot operation: ${operation}`);
  }

  const slug = `${operation}-${timestampSlug()}`;
  const htmlPath = mcpOutputPath(input.htmlPath, `${slug}.html`);
  const projectPath = mcpOutputPath(input.projectPath, `${slug}.project.json`);
  await mkdir(resolve(htmlPath, ".."), { recursive: true });
  await mkdir(resolve(projectPath, ".."), { recursive: true });

  const args = [
    "scripts/nexus-engine-editor-cli.mjs",
    "operations",
    "submit",
    operation,
    "--param",
    `html=${htmlPath}`,
    "--param",
    `project=${projectPath}`,
    "--json"
  ];
  if (operation === "game-template" && input.template) args.push("--param", `template=${input.template}`);
  if (input.count !== undefined) args.push("--param", `count=${Math.floor(Number(input.count))}`);

  const { stdout, stderr } = await execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024
  });
  const report = JSON.parse(stdout);
  const url = pathToFileURL(htmlPath).href;
  const captureInput = { ...input, url };
  const hasClick = Boolean(input.selector || input.x !== undefined || input.y !== undefined);
  const status = hasClick ? await clickScreenshot(captureInput) : await visualStatus(captureInput);

  return {
    ...status,
    cli: {
      operation,
      ok: report.ok,
      title: report.title,
      domainPath: report.domainPath,
      objectCount: report.objectCount,
      kitCount: report.kitCount,
      sequenceStepCount: report.sequenceStepCount,
      kitMutationMode: report.kitMutationMode,
      stderr: stderr.trim()
    },
    outputs: {
      html: htmlPath,
      project: projectPath
    }
  };
}

async function callTool(name, input = {}) {
  if (name === "editor_screenshot") {
    const result = await captureScreenshot(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  if (name === "editor_visual_status") {
    const result = await visualStatus(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  if (name === "editor_click_screenshot") {
    const result = await clickScreenshot(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  if (name === "editor_human_view_diagnostic") {
    const result = await humanViewDiagnostic(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  if (name === "editor_cli_game_screenshot") {
    const result = await cliGameScreenshot(input);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  if (message.method === "initialize") {
    response(message.id, {
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "nexusengine-editor-screenshot-mcp",
        version: "0.1.0"
      },
      capabilities: {
        tools: {}
      }
    });
    return;
  }
  if (message.method === "tools/list") {
    response(message.id, { tools: TOOLS });
    return;
  }
  if (message.method === "tools/call") {
    const result = await callTool(message.params?.name, message.params?.arguments ?? {});
    response(message.id, result);
    return;
  }
  if (message.id !== undefined) response(message.id, {});
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    await handle(JSON.parse(line));
  } catch (error) {
    try {
      const parsed = JSON.parse(line);
      errorResponse(parsed.id, error);
    } catch {
      errorResponse(null, error);
    }
  }
}
