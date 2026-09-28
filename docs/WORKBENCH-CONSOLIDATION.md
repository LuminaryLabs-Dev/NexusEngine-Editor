# Shared Workbench Consolidation

## Architecture

The current workbench uses one GUI, one command layer, and one host contract. Browser and local-host entry points only select an adapter and start that GUI.

```text
browser-client.js ─┐
                  ├─ app.js + browser.css + shell.js
client.js ─────────┘       │
                         scene-commands.js
                               │
                         host-contract.js
                          /           \
               browser-host.js    adapters/local.js
                      │                 │ HTTP + binary-wire
                      │            adapters/local-session.js
                      │                 │
                      └──── NexusEngine Core Authoring ─────┘
```

Project remains the only editable source/history authority. No Editor asset codec or competing persistence format is introduced. The local adapter keeps folder/process access separate from the public browser graph. Build execution is injected by the local host rather than imported by the shared controller.

## What is consolidated

`app.js` owns menus, toolbar, Outliner, Inspector, Assets, Domains, Kits, Composition, Validation, Runtime, Build, Console, command palette, keyboard input and download UX. It consumes only the host contract. `scene-commands.js` translates UI intentions into existing Core operations. Primitive creation and scene attachment are one Core transaction, not two partially successful writes.

Both adapters preserve the same command names and binary artifact structure. `binary-wire.js` handles explicit bounded byte envelopes over HTTP. A download with companion resources is packaged into a ZIP retaining relative resource paths; it is transport packaging, not a GLB/FBX/USD codec.

The browser adapter uses Core IndexedDB storage, reads a saved package through Core to determine its Project identity, and loads into a candidate runtime before replacing the active project. Failed Open does not discard current source. Core intentionally rebases live document revisions and epoch on load; content hashes and retained history remain authoritative.

Play is still the existing isolated Authoring-transform preview, not a new physics implementation. Runtime transforms update the Three.js view incrementally. Full GLB export/reload is not performed on every input frame. Stop discards the clone, and editing operations are guarded during Play.

## Build and deployment

`build-static-site.mjs` uses the pinned esbuild version to link browser code, Three.js and the pinned Core package. It does not copy `src/`, call `dsk-html-builder.js`, or maintain an import map.

The build resolves trusted Core factory exports at build time. Only factories declaring browser support and successfully linking for the browser are included in the generated resolver. Unavailable factories remain visible in the Core catalog with an explicit availability reason. Catalog metadata about Core Build is retained; executable Node Build services are excluded.

Two explicit platform boundaries are unavailable in the public build: filesystem project storage and filesystem artifact publication. Their browser descriptors reject use. No arbitrary Node-module shim or silent success fallback is installed. Core source files are not modified.

```text
npm ci
npm run doctor
npm run test:consolidation
npm run build
npm run test:static-browser
npm run publish:root
```

`publish:root` DOES NOT rebuild. It requires a successful real-browser report bound to the exact staged artifact fingerprint, checks every source and generated file hash, and promotes only the generated-file allowlist. A source or bundle change invalidates the proof. Generated files are `index.html`, `editor.js`, `editor.css`, `.nojekyll`, `deployment.json` and `editor-assets/**`.

GitHub Pages remains `main /(root)`. No custom Actions workflow is added.

## Legacy consumers retained

The legacy DSK implementation is not safe to delete wholesale. At the audited base revision:

- `scripts/build-dsk-game-html.mjs` imports `dsk-html-builder.js`.
- `scripts/nexus-engine-editor-cli.mjs` imports the same builder.
- `scripts/intent-smoke.mjs` and `src/nexus-engine-editor-runtime.js` still consume legacy model/builder functionality.
- `dsk-html-builder.js` imports `editor-domain-model.js`.

Those consumers and their source remain untouched. They are disconnected from the new public deployment, not falsely classified as dead. Legacy tests remain required; deleting them or their consumers requires a separate verified migration.

## Validation contract

`workbench-consolidation.test.mjs` executes the real pinned Core for transactions, history, storage generations, native format round trips, Play isolation and both adapters. Its HTTP test uses a real Core-backed test host and filesystem, not a stub export provider. It is not a substitute for the full existing Authoring host/worker suite.

`static-browser-workbench.mjs` is an executing Playwright gate against the exact generated site at `/NexusEngine-Editor/`. It checks startup, real registry, GUI creation/editing, independent Three-authored GLB import, IndexedDB reload, source isolation, actual downloadable exports, rendered Game View/input, and the same GUI against the real local server. Unexpected external network requests, errors or failed artifact checks prevent a passing report. The test does not modify browser policies or use fake persistence.

A source-string check, native paired codec round trip or HTTP 200 is not proof that the GUI boots. Independent FBX/OpenUSD/Unity application compatibility is not claimed by the native parse checks.

## Status of the supplied candidate

This source change was prepared against Editor `267222f71dd6adc662fe1045a71d08119eedb142` and Core `784e514722febf8fb09ca55a058b2736e93679bd`.

The supplied evidence records the checks actually run. The complete build and real-browser release gate remain **unproved** in the current sandbox: esbuild cannot be installed through the unavailable package network, and Chromium blocks localhost by administrator policy. No replacement root deployment and no remote commit should be claimed from this candidate. Apply it to a full checkout, run all original and new tests, rebuild, prove the exact artifact, then promote and commit on Editor main only.

## Repair safeguards

Both command adapters use a bounded queue that copies each submitted payload immediately. Shutdown rejects new commands and drains accepted commands before cleanup. Shared source guards block editing, accepted-preview commits, project replacement and composition changes while Play is active. Pause clears the installed Input intent; paused input cannot leak into Resume. Failed startup cleans up its runtime and GUI resources.

The binary HTTP envelope rejects cycles, oversized combined byte payloads, excessive nesting, spoofed envelope fields and noncanonical base64 before allocating decoded bytes. These are transport checks, not new asset codecs.

`npm run doctor` checks the real committed lockfile, the declared Core pin, installed locked versions, required Three addons, native esbuild execution and Core toolchain dependencies. It does not replace missing packages or relax versions. `npm ci` must run in a complete checkout with network/cache access; Node API tests against a verified Core source copy are not installation proof.

Build staging is restricted to `dist` or a named `.build` child. Source/dependency directories and symlink paths are rejected before destructive cleanup. Exact artifact verification rejects unmanifested staged files. Browser evidence must bind the complete deployment manifest, source fingerprint, Core identity and passing checks; changing metadata or skipping tests cannot authorize publication.

The repair suite is `tests/workbench-repair.test.mjs`; it supplements the existing consolidation tests, rather than replacing the full repository or real-browser tests. Physics collision execution and goal completion are not implemented by these repairs.
