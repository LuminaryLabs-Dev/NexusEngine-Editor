# Agent Instructions

## Read first

1. `docs/WORKBENCH-CONSOLIDATION.md`
2. `README.md`
3. `memory.md`
4. `goal.md`
5. `.agent/start-here.md` and `.agent/goal.md`

## Active workbench

- Use one GUI in `src/workbench/app.js`, shared styles and shared shell.
- Browser and local entry points select adapters. Do not create another parallel client.
- `host-contract.js` defines the transport boundary; `scene-commands.js` maps GUI actions to Core operations.
- Core Authoring Project owns canonical documents, revisions, transactions and history.
- Core owns import/export, validation and persistence semantics. The Editor presents results and supplies environment adapters.
- The Core registry owns domain/kit identity, schemas and dependency validation. Imported manifests do not grant executable trust.
- Editing source while Play runs is guarded. Runtime state belongs to a disposable clone.
- Existing preview movement is not proof of a physics solver. Capability labels must describe implemented behavior.
- Keep source-controlled browser build dependencies pinned and bundled; no hand-maintained runtime import map.
- Build in the sandbox/local checkout, test the EXACT generated artifact, then promote it without rebuilding.
- Deploy generated root files on Editor `main` only. No custom Actions build/deploy workflow.
- Never push a failed, incomplete or unverified release while claiming success.

## Legacy compatibility

`src/main.js`, the old model/registry/runtime, DSK builder, CLI and headless compatibility code still have consumers. They are not the public workbench. Preserve their project-format and trust contracts until a separately tested migration removes those consumers. Do not equate absence from the public bundle with safe deletion from the repository.

## Validation

Run all existing tests plus `npm run test:consolidation`. `npm run build` produces the staged browser bundle. `npm run test:static-browser` must execute the real browser workflow before `npm run publish:root` can promote it. Preserve reports of blockers and failed checks; do not replace them with source-string or fake-browser assertions.

Do not commit `dist/`, `node_modules/`, `.test-results/`, Playwright diagnostics, screenshots, traces, videos or local project data. Only the validated generated root deployment belongs alongside source. Update durable documentation when ownership or workflow changes; do not rewrite historical evidence as a success claim.
