#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { createNexusRealtimeEditorRuntime } from "../src/nexus-realtime-editor-runtime.js";

const OPERATIONS = Object.freeze({
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
  node scripts/nexus-engine-editor-cli.mjs operations submit chess-game --param html=dist/games/nexus-chess.html --param project=dist/games/nexus-chess.project.json
  node scripts/nexus-engine-editor-cli.mjs interactive`);
}

async function createContext(flags = {}) {
  const state = createEditorState();
  state.editorRuntime = createNexusRealtimeEditorRuntime({
    state,
    kitMutationMode: "cli",
    recordEvent: (type, payload) => recordEditorEvent(state, type, payload)
  });
  const inputProject = flags.input_project || flags.project;
  if (inputProject) {
    const projectPath = resolve(String(inputProject));
    const serialized = await readFile(projectPath, "utf8");
    state.editorRuntime.getBinding("projectPersistence").importFile(serialized, projectPath);
  }
  return { state };
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
