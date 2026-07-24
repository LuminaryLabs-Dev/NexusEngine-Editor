#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { buildDskGameHtml } from "../src/dsk-html-builder.js";
import {
  buildEditorExportManifest,
  buildSceneObjectStats,
  createEditorProjectFileName,
  listGameAuthoringTemplates,
  validateSequenceLinks
} from "../src/editor-domain-model.js";
import { createEditorState, recordEditorEvent } from "../src/kits/editor-kits.js";
import { createNexusEngineEditorRuntime } from "../src/nexus-engine-editor-runtime.js";

const OPERATIONS = Object.freeze({
  "playable-export": {
    summary: "Export the exact playable project as a self-contained local folder; authoring evidence and project-only files are excluded.",
    params: {
      input_project: "Required source .project.json path.",
      output_dir: "Required new or empty output directory for the playable game."
    },
    async run(context, params, options) {
      if (!context.inputProjectPath) throw new Error("playable-export requires --param input_project=<project-file>.");
      const plan = await planPlayableExport(context.state, context.inputProjectPath, params.output_dir);
      const outputs = options.write ? { playable: await writePlayableExport(plan) } : { playable: summarizePlayableExport(plan) };
      return createReport(context.state, {
        operation: "playable-export",
        validation: context.state.editorRuntime.getBinding("sequenceTimeline").validate(),
        outputs
      });
    }
  },
  "install-kit": {
    summary: "Install a Domain Service Kit from the registry into a project file; this is the only kit-add mutation path.",
    params: {
      kit: "Registry kit id to install.",
      include_children: "Optional true/false; install child kits for bundles.",
      input_project: "Optional source .project.json path.",
      project: "Optional output .project.json path.",
      html: "Optional output HTML path after installing."
    },
    async run(context, params, options) {
      const kitId = params.kit || params.kit_id;
      if (!kitId) throw new Error("install-kit requires --param kit=<registry-kit-id>.");
      const installed = context.state.editorRuntime.getBinding("domainStack").addKit(kitId, {
        includeChildren: params.include_children === "true"
      });
      const validation = context.state.editorRuntime.getBinding("sequenceTimeline").validate();
      const outputs = options.write ? await writeRequestedOutputs(context.state, params) : {};
      return createReport(context.state, {
        operation: "install-kit",
        installed: Array.isArray(installed) ? installed.map((kit) => ({ kitId: kit.kitId, domainPath: kit.domainPath })) : { kitId: installed.kitId, domainPath: installed.domainPath },
        validation,
        outputs
      });
    }
  },
  "chess-game": {
    summary: "Create a Nexus Chess project, validate its kit sequence, and optionally write HTML/project files.",
    params: {
      html: "Optional output HTML path.",
      project: "Optional output .project.json path.",
      run_sequence: "Optional true/false; run sequence receipts before export."
    },
    async run(context, params, options) {
      const result = applyTemplate(context.state, "chess-board-template");
      if (params.run_sequence === "true") context.state.editorRuntime.getBinding("sequenceTimeline").runAll();
      const validation = context.state.editorRuntime.getBinding("sequenceTimeline").validate();
      const outputs = options.write ? await writeRequestedOutputs(context.state, params) : {};
      return createReport(context.state, {
        operation: "chess-game",
        templateId: result.template.id,
        objectsAdded: result.objects.length,
        sequenceStepIds: result.sequenceStepIds,
        validation,
        outputs
      });
    }
  },
  "target-clicker-game": {
    summary: "Create a Nexus Target Clicker project, validate its kit sequence, and optionally write HTML/project files.",
    params: {
      html: "Optional output HTML path.",
      project: "Optional output .project.json path.",
      run_sequence: "Optional true/false; run sequence receipts before export."
    },
    async run(context, params, options) {
      const result = applyTemplate(context.state, "target-clicker-template");
      if (params.run_sequence === "true") context.state.editorRuntime.getBinding("sequenceTimeline").runAll();
      const validation = context.state.editorRuntime.getBinding("sequenceTimeline").validate();
      const outputs = options.write ? await writeRequestedOutputs(context.state, params) : {};
      return createReport(context.state, {
        operation: "target-clicker-game",
        templateId: result.template.id,
        objectsAdded: result.objects.length,
        sequenceStepIds: result.sequenceStepIds,
        validation,
        outputs
      });
    }
  },
  "gem-collector-game": {
    summary: "Create a Nexus Gem Collector project, validate its generic interaction sequence, and optionally write HTML/project files.",
    params: {
      html: "Optional output HTML path.",
      project: "Optional output .project.json path.",
      run_sequence: "Optional true/false; run sequence receipts before export."
    },
    async run(context, params, options) {
      const result = applyTemplate(context.state, "gem-collector-template");
      if (params.run_sequence === "true") context.state.editorRuntime.getBinding("sequenceTimeline").runAll();
      const validation = context.state.editorRuntime.getBinding("sequenceTimeline").validate();
      const outputs = options.write ? await writeRequestedOutputs(context.state, params) : {};
      return createReport(context.state, {
        operation: "gem-collector-game",
        templateId: result.template.id,
        objectsAdded: result.objects.length,
        sequenceStepIds: result.sequenceStepIds,
        validation,
        outputs
      });
    }
  },
  "game-template": {
    summary: "Apply any editor game template by id, then optionally write HTML/project files.",
    params: {
      template: "Template id from templates list.",
      count: "Optional object count for preset-backed templates.",
      html: "Optional output HTML path.",
      project: "Optional output .project.json path."
    },
    async run(context, params, options) {
      const templateId = params.template || "chess-board-template";
      const result = applyTemplate(context.state, templateId, params.count);
      const validation = context.state.editorRuntime.getBinding("sequenceTimeline").validate();
      const outputs = options.write ? await writeRequestedOutputs(context.state, params) : {};
      return createReport(context.state, {
        operation: "game-template",
        templateId: result.template.id,
        objectsAdded: result.objects.length,
        sequenceStepIds: result.sequenceStepIds,
        validation,
        outputs
      });
    }
  },
  "literal-json": {
    summary: "Run a JSON command list through the same editor runtime bindings used by the browser app.",
    params: {
      json: "Inline JSON with a commands array.",
      json_file: "Path to JSON with a commands array.",
      html: "Optional default output HTML path.",
      project: "Optional default output .project.json path."
    },
    async run(context, params, options) {
      const payload = await readLiteralPayload(params);
      const receipts = [];
      for (const command of payload.commands ?? []) receipts.push(await runLiteralCommand(context.state, command, options));
      const outputs = options.write ? await writeRequestedOutputs(context.state, params) : {};
      return createReport(context.state, {
        operation: "literal-json",
        commandCount: payload.commands?.length ?? 0,
        receipts,
        validation: context.state.editorRuntime.getBinding("sequenceTimeline").validate(),
        outputs
      });
    }
  }
});

function parseArgs(argv) {
  const args = [];
  const flags = {};
  const params = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--param") {
      const [key, ...rest] = String(argv[++index] ?? "").split("=");
      params[key] = rest.join("=");
    } else if (item.startsWith("--param=")) {
      const [key, ...rest] = item.slice("--param=".length).split("=");
      params[key] = rest.join("=");
    } else if (item.startsWith("--")) {
      const key = item.slice(2).replaceAll("-", "_");
      const next = argv[index + 1];
      flags[key] = next && !next.startsWith("--") ? argv[++index] : true;
    } else {
      args.push(item);
    }
  }
  return { args, flags, params };
}

function printUsage() {
  console.log(`Usage:
  node scripts/nexus-engine-editor-cli.mjs status [--project file] [--json]
  node scripts/nexus-engine-editor-cli.mjs templates
  node scripts/nexus-engine-editor-cli.mjs interactive [--project file]
  node scripts/nexus-engine-editor-cli.mjs operations list
  node scripts/nexus-engine-editor-cli.mjs operations describe <name>
  node scripts/nexus-engine-editor-cli.mjs operations validate <name> --param key=value
  node scripts/nexus-engine-editor-cli.mjs operations submit <name> --param key=value

Examples:
  node scripts/nexus-engine-editor-cli.mjs operations submit playable-export --param input_project=game.project.json --param output_dir=dist/games/game
  node scripts/nexus-engine-editor-cli.mjs operations submit chess-game --param html=dist/games/nexus-chess.html --param project=dist/games/nexus-chess.project.json
  node scripts/nexus-engine-editor-cli.mjs interactive`);
}

async function createContext(flags = {}) {
  const state = createEditorState();
  state.editorRuntime = createNexusEngineEditorRuntime({
    state,
    kitMutationMode: "cli",
    recordEvent: (type, payload) => recordEditorEvent(state, type, payload)
  });
  const inputProject = flags.input_project || flags.project;
  let inputProjectPath = null;
  if (inputProject) {
    inputProjectPath = resolve(String(inputProject));
    const serialized = await readFile(inputProjectPath, "utf8");
    state.editorRuntime.getBinding("projectPersistence").importFile(serialized, inputProjectPath);
  }
  return { state, inputProjectPath };
}

const PLAYABLE_EXPORT_EXCLUDES = new Set([
  ".agent",
  ".git",
  ".playwright-cli",
  "editor-authoring-map.json",
  "memory.md",
  "scripts"
]);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function shouldExport(relativePath, entryPath) {
  if (relativePath === entryPath) return true;
  const [rootName] = relativePath.split(sep);
  if (PLAYABLE_EXPORT_EXCLUDES.has(rootName) || rootName.startsWith(".")) return false;
  return !relativePath.endsWith(".project.json");
}

async function listPlayableFiles(root, entryPath) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      if (!shouldExport(relativePath, entryPath)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Playable exports reject symlinks: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        const bytes = await readFile(absolutePath);
        files.push({
          absolutePath,
          relativePath,
          bytes: bytes.byteLength,
          hash: createHash("sha256").update(bytes).digest("hex")
        });
      }
    }
  }
  await visit(root);
  return files;
}

async function planPlayableExport(state, inputProjectPath, outputDirectory) {
  if (!state.project.playable) throw new Error("Project does not declare a playable runtime.");
  if (!outputDirectory) throw new Error("playable-export requires --param output_dir=<directory>.");
  const sourceRoot = dirname(inputProjectPath);
  const outputRoot = resolve(String(outputDirectory));
  if (isInside(sourceRoot, outputRoot) || isInside(outputRoot, sourceRoot)) {
    throw new Error("Playable export output must be outside the source project tree.");
  }
  const entryPath = state.project.playable.entry.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  const sourceEntry = resolve(sourceRoot, entryPath);
  if (!isInside(sourceRoot, sourceEntry)) throw new Error("Playable entry escapes the source project tree.");
  const entryStats = await stat(sourceEntry);
  if (!entryStats.isFile()) throw new Error(`Playable entry is not a file: ${entryPath}`);
  const files = await listPlayableFiles(sourceRoot, entryPath);
  if (!files.some((file) => file.relativePath === entryPath)) throw new Error(`Playable entry was excluded from export: ${entryPath}`);
  const projectBytes = await readFile(inputProjectPath);
  const contentHash = createHash("sha256");
  for (const file of files) contentHash.update(`${file.relativePath}\0${file.hash}\n`);
  return {
    schema: "nexusengine.playable-export/1",
    sourceRoot,
    outputRoot,
    entry: entryPath,
    title: state.project.playable.title,
    playableId: state.project.playable.id,
    runtime: state.project.playable.runtime,
    contractHash: state.project.playable.contractHash,
    projectHash: createHash("sha256").update(projectBytes).digest("hex"),
    contentHash: contentHash.digest("hex"),
    files,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0)
  };
}

function summarizePlayableExport(plan) {
  return {
    schema: plan.schema,
    path: plan.outputRoot,
    entry: plan.entry,
    title: plan.title,
    playableId: plan.playableId,
    runtime: plan.runtime,
    contractHash: plan.contractHash,
    projectHash: plan.projectHash,
    contentHash: plan.contentHash,
    fileCount: plan.files.length,
    bytes: plan.bytes,
    written: false
  };
}

async function writePlayableExport(plan) {
  try {
    const existing = await lstat(plan.outputRoot);
    if (!existing.isDirectory()) throw new Error("Playable export output exists and is not a directory.");
    if ((await readdir(plan.outputRoot)).length) throw new Error("Playable export output directory must be empty.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(plan.outputRoot, { recursive: true });
  for (const file of plan.files) {
    const outputFile = resolve(plan.outputRoot, file.relativePath);
    if (!isInside(plan.outputRoot, outputFile)) throw new Error(`Export file escapes output root: ${file.relativePath}`);
    await mkdir(dirname(outputFile), { recursive: true });
    await copyFile(file.absolutePath, outputFile);
  }
  const receipt = { ...summarizePlayableExport(plan), written: true };
  await writeFile(resolve(plan.outputRoot, "nexus-playable-export.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function applyTemplate(state, templateId, count) {
  const binding = state.editorRuntime.getBinding("gameTemplate");
  binding.setTemplate(templateId);
  return binding.apply(count === undefined ? undefined : Number(count));
}

async function writeRequestedOutputs(state, params) {
  const outputs = {};
  if (params.html) outputs.html = await writeHtml(state, params.html);
  if (params.project) outputs.project = await writeProject(state, params.project);
  return outputs;
}

async function writeHtml(state, outputPath) {
  const manifest = buildEditorExportManifest(state.project);
  const outputFile = resolve(outputPath);
  const html = buildDskGameHtml(manifest);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, html);
  return { path: outputFile, bytes: Buffer.byteLength(html), fileName: outputFile.split("/").at(-1) };
}

async function writeProject(state, outputPath) {
  const outputFile = resolve(outputPath || createEditorProjectFileName(state.project));
  const exported = state.editorRuntime.getBinding("projectPersistence").exportFile();
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, exported.json);
  return { path: outputFile, bytes: exported.bytes, fileName: exported.fileName };
}

function createReport(state, extra = {}) {
  const stats = buildSceneObjectStats(state.project);
  const sequenceGraph = validateSequenceLinks(state.project);
  return {
    ok: sequenceGraph.ok,
    title: state.project.title,
    domainPath: state.project.domainPath,
    playable: state.project.playable ?? null,
    objectCount: stats.objectCount,
    kitCount: state.project.domainStack.length,
    kitMutationMode: state.editorRuntime.kitMutationMode,
    sequenceStepCount: state.project.sequenceSteps.length,
    sequenceGraph,
    recentEvents: state.events.slice(-5),
    ...extra
  };
}

async function readLiteralPayload(params) {
  if (params.json_file) return JSON.parse(await readFile(resolve(params.json_file), "utf8"));
  if (params.json) return JSON.parse(params.json);
  throw new Error("literal-json requires json or json_file.");
}

async function runLiteralCommand(state, command = {}, options = {}) {
  const action = String(command.action ?? "").trim();
  if (action === "apply_template") {
    const result = applyTemplate(state, command.templateId ?? command.template ?? "chess-board-template", command.count);
    return { action, templateId: result.template.id, objectCount: result.objects.length };
  }
  if (action === "install_kit") {
    const kit = state.editorRuntime.getBinding("domainStack").addKit(command.kitId, { includeChildren: Boolean(command.includeChildren) });
    return { action, domainPath: kit.domainPath, kitId: kit.kitId };
  }
  if (action === "add_cube") {
    const object = state.editorRuntime.getBinding("sceneObject").addCube();
    return { action, objectId: object.id };
  }
  if (action === "add_cube_group") {
    const objects = state.editorRuntime.getBinding("sceneObject").addCubeGroup(Number(command.count) || undefined);
    return { action, objectCount: objects.length };
  }
  if (action === "run_sequence") {
    const receipts = state.editorRuntime.getBinding("sequenceTimeline").runAll();
    return { action, receiptCount: receipts.length };
  }
  if (action === "validate_sequence") {
    const validation = state.editorRuntime.getBinding("sequenceTimeline").validate();
    return { action, ok: validation.ok };
  }
  if (action === "build_html") {
    if (!options.write && !command.output) return { action, skipped: "validate-mode" };
    return { action, output: await writeHtml(state, command.output) };
  }
  if (action === "export_project") {
    if (!options.write && !command.output) return { action, skipped: "validate-mode" };
    return { action, output: await writeProject(state, command.output) };
  }
  throw new Error(`Unknown literal command action: ${action || "(empty)"}`);
}

function printHumanReport(report) {
  console.log(`${report.ok ? "OK" : "WARN"} ${report.title} (${report.domainPath})`);
  console.log(`${report.objectCount} objects · ${report.kitCount} kits · ${report.sequenceStepCount} sequence steps`);
  if (report.outputs?.html) console.log(`html ${report.outputs.html.path} (${report.outputs.html.bytes} bytes)`);
  if (report.outputs?.project) console.log(`project ${report.outputs.project.path} (${report.outputs.project.bytes} bytes)`);
  if (!report.sequenceGraph?.ok) {
    console.log(`invalid sequence links: ${report.sequenceGraph.invalidLinks.map((link) => link.id).join(", ")}`);
  }
}

function printTemplates() {
  for (const template of listGameAuthoringTemplates()) {
    console.log(`${template.id}\t${template.label}\t${template.defaultCount ?? 0} objects`);
  }
}

async function runInteractive(flags) {
  const context = await createContext(flags);
  const rl = readline.createInterface({ input, output, prompt: "nexus-editor> " });
  console.log("NexusEngine Editor CLI. Type help for commands.");
  rl.prompt();
  for await (const line of rl) {
    const [command, ...rest] = line.trim().split(/\s+/).filter(Boolean);
    try {
      if (!command) {
        rl.prompt();
        continue;
      }
      if (["exit", "quit"].includes(command)) break;
      if (command === "help") {
        console.log("status | templates | chess | apply <templateId> [count] | install <kitId> [--children] | validate | run | build <html> | export <project> | events | exit");
      } else if (command === "status") {
        printHumanReport(createReport(context.state));
      } else if (command === "templates") {
        printTemplates();
      } else if (command === "chess") {
        printHumanReport(await OPERATIONS["chess-game"].run(context, {}, { write: false }));
      } else if (command === "apply") {
        const result = applyTemplate(context.state, rest[0] || "chess-board-template", rest[1]);
        console.log(`applied ${result.template.id}: ${result.objects.length} objects`);
      } else if (command === "install") {
        const kitId = rest[0];
        const includeChildren = rest.includes("--children");
        if (!kitId) {
          console.log("usage: install <kitId> [--children]");
        } else {
          const installed = context.state.editorRuntime.getBinding("domainStack").addKit(kitId, { includeChildren });
          console.log(JSON.stringify(Array.isArray(installed) ? installed.map((kit) => ({ kitId: kit.kitId, domainPath: kit.domainPath })) : { kitId: installed.kitId, domainPath: installed.domainPath }, null, 2));
        }
      } else if (command === "validate") {
        printHumanReport(createReport(context.state, { validation: context.state.editorRuntime.getBinding("sequenceTimeline").validate() }));
      } else if (command === "run") {
        const receipts = context.state.editorRuntime.getBinding("sequenceTimeline").runAll();
        console.log(`ran ${receipts.length} sequence receipts`);
      } else if (command === "build") {
        console.log(JSON.stringify(await writeHtml(context.state, rest[0] || "dist/games/nexus-cli-game.html"), null, 2));
      } else if (command === "export") {
        console.log(JSON.stringify(await writeProject(context.state, rest[0] || "dist/games/nexus-cli-game.project.json"), null, 2));
      } else if (command === "events") {
        console.log(JSON.stringify(context.state.events.slice(-10), null, 2));
      } else {
        console.log(`unknown command: ${command}`);
      }
    } catch (error) {
      console.error(`ERR ${error.message}`);
    }
    rl.prompt();
  }
  rl.close();
}

async function main() {
  const { args, flags, params } = parseArgs(process.argv.slice(2));
  const command = args[0];
  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }
  if (command === "templates") {
    printTemplates();
    return;
  }
  if (command === "status") {
    const context = await createContext(flags);
    const report = createReport(context.state);
    flags.json ? console.log(JSON.stringify(report, null, 2)) : printHumanReport(report);
    return;
  }
  if (command === "interactive") {
    await runInteractive(flags);
    return;
  }
  if (command === "operations") {
    const subcommand = args[1];
    const operationName = args[2];
    if (subcommand === "list") {
      for (const [name, operation] of Object.entries(OPERATIONS)) console.log(`${name}\t${operation.summary}`);
      return;
    }
    const operation = OPERATIONS[operationName];
    if (!operation) throw new Error(`Unknown operation: ${operationName ?? "(missing)"}`);
    if (subcommand === "describe") {
      console.log(`${operationName}\n${operation.summary}`);
      for (const [key, value] of Object.entries(operation.params)) console.log(`  ${key}: ${value}`);
      return;
    }
    if (subcommand === "validate" || subcommand === "submit") {
      const context = await createContext({ ...flags, input_project: params.input_project });
      const report = await operation.run(context, params, { write: subcommand === "submit" });
      flags.json ? console.log(JSON.stringify(report, null, 2)) : printHumanReport(report);
      return;
    }
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`ERR ${error.message}`);
  process.exit(1);
});
