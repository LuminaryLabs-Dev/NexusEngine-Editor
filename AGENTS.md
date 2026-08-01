# Agent Instructions

## Read first

1. `README.md`
2. `memory.md`
3. `goal.md`
4. `.agent/start-here.md`
5. `.agent/goal.md`

## Architecture boundaries

- Keep the native WebGL viewport primary and persistent workspaces docked.
- NexusEngine owns registry truth, hierarchy validation, and dependency planning.
- The Editor owns draft state, atomic Apply, previews, persistence, and receipts.
- Browser kit mutation is read-only; code and registry installation are CLI-only.
- Imported manifests never grant executable trust.
- Invalid or dirty drafts must not Run Once, Play, or Build.
- Preserve project format `0.3.0` and compatibility projections.

## Source ownership

- `src/main.js` coordinates browser UI and state.
- `src/editor-domain-model.js` owns project, scene, sequence, template, and export data.
- `src/editor-composition.js` owns migration, staging, validation, Apply, preview, and Play.
- `src/editor-composition-mcp.js` adapts Core Composition plans and receipts.
- `src/nexus-engine-editor-runtime.js` composes editor runtime kits.
- `src/viewport-webgl.js` owns rendering and viewport interaction.
- `src/dsk-html-builder.js` owns single-file game output.

## Validation

```bash
npm run smoke:intent
npm run build
npm run smoke:playwright
npm test
```

Do not commit `dist/`, `node_modules/`, Playwright output, diagnostics, MCP
output, screenshots, traces, videos, or local project data.

Update `memory.md` only for durable architecture or workflow decisions. Update
goal files only when their acceptance criteria or evidence changes.
