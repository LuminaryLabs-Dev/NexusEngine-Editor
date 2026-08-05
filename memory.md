# NexusEngine Editor Memory

Purpose:

- Host a static NexusEngine web editor that keeps the 3D scene viewport primary while exposing DSK domain stacking, kit configuration, sequence timelines, and HTML game export.

Architecture shape:

- `index.html` loads the app directly as browser ES modules.
- `src/editor-domain-model.js` owns the editable 3D scene, compatibility projections, kit config, and sequence timeline model.
- `src/editor-composition.js` owns project-format `0.4.0` migration, the staged registry-reference tree, atomic Apply, reference protection, trusted factory resolution, disposable Run Once previews, and disposable Play instances.
- `src/editor-composition-mcp.js` adapts Core Composition MCP plans to the existing Editor controller, resolves only trusted Engine factories, fingerprints executable Kits, and persists exactly-once apply receipts in the project.
- `src/headless/index.js` owns the Node-only file-backed nine-stage Headless Editor host. It is exported as `@luminarylabs/nexusengine-editor/headless`; Engine Core does not own this host implementation.
- `src/viewport-webgl.js` owns the dependency-free WebGL viewport renderer for grid, axes, default cube, and play-mode animation.
- `src/kits/editor-kits.js` owns editor kit descriptors and lightweight state.
- `src/kits/editor-feature-contracts-kit/index.js` owns the required editor feature contract map, including owning local Kit, current Engine/Kits source, required tokens, and provided tokens.
- `src/dsk-html-builder.js` owns the shared browser/Node builder for single-file DSK-driven game HTML.
- `scripts/build-static-site.mjs` creates the GitHub Pages artifact in `dist/`.
- `.github/workflows/deploy-editor.yml` runs tests and deploys `dist/` from `main` using GitHub Pages Actions.

Conventions:

- Keep the editor static-first and dependency-light.
- Use the native WebGL viewport as the engine/editor surface before falling back to CSS visuals.
- The first view should read as a 3D engine editor: grid, default cube, transform gizmo, camera/light markers, and no landing-page/hero copy.
- The Editor shell is a tiered, non-overlay workspace. Wide windows show Game Structure, the primary 3D viewport, Inspector, and a collapsed Behaviors region; compact and narrow windows keep the viewport visible while one tab-selected context occupies a bounded grid region. Persistent work surfaces never float or overlap.
- The left panel is a registry-reference hierarchy of domains, subdomains, and leaf kits. The right panel configures the selected composition node, object, or sequence step; the bottom panel sequences and links kit events.
- NexusEngine owns registry truth, complete-tree validation, and dependency planning. The Editor owns draft state, staged settings, atomic Apply, selection-aware disposable previews, and visual receipts.
- Browser users may safely add already-registered domain/kit references. Installing code or registry packages remains CLI-only and imported JSON never grants executable trust.
- The browser editor targets NexusEngine commit `16aee598c06efcb7b511e4827ee3f7e23ce3549b`, loads the root and Composition semantic module separately, and resolves executable factories only through canonical package exports. A failed immutable import does not grant a project registry executable trust.
- Every required editor capability should be represented in `editor-feature-contracts-kit` and exported through `featureContracts` plus `featureContractValidation` in generated game manifests.
- Browser runtimes use `kitMutationMode: "read-only"` and reject code/registry installation; CLI contexts explicitly opt into `kitMutationMode: "cli"` for `install-kit` operations.
- Game templates that install kits are also CLI-only in browser runtimes; the browser may show the selected template and command, but only the CLI may apply kit-mutating templates.
- Project format `0.4.0` stores accepted `composition` plus a registry v3 metadata-only project overlay. `domainStack`, `kitConfigs`, object `domainKits`, and `domainStackHealth` are derived authoring/export views.
- Legacy flat projects migrate through a project-root domain; unknown kits survive as hashed, untrusted project-local registry records. Scene assignments add stable kit-node IDs while legacy domain paths continue to export.
- Dirty or invalid drafts disable Run Once, Play, and Build. Apply validates the entire draft and replaces the accepted tree only on success; referenced nodes and nonempty domains cannot be removed silently.
- Run Once and Play resolve only trusted exports from the installed/Core NexusEngine module. Imported manifest-only kits report preview unavailable. A preview command runs only when the trusted descriptor marks a simple command name `editorSafe`; async commands have bounded timeouts, otherwise Run Once performs one fixed `1/60` tick. Every preview uses and disposes a fresh Engine and retains at most 20 JSON-safe receipts.
- Sequence Timeline links are driven by installed kit manifests/configs: source kit, event, target kit, and output dropdowns persist into `sequenceSteps` and `sequenceGraph`.
- Sequence playback is owned by `editor-sequence-timeline-kit`; Step, Sequence, and top Play execution retain receipts proving ordered kit event delivery.
- Selecting a Sequence Timeline step switches Configure into a sequence-step inspector owned by `editor-sequence-timeline-kit`, where label, source kit, event, target kit, output, run, and validation controls reuse the same manifest-driven link model.
- Exported game HTML exposes `runSequence()` and `sequenceReceipts` to prove the same kit-driven sequence flow outside the editor.
- Exported game HTML should also expose a visible `Run Sequence` control, receipt count, and recent receipt list so sequence proof is inspectable without opening the console.
- Scalable exported game runtime is owned by `editor-html-build-kit`; generated single-file HTML should use a canvas viewport, render stats, culling, and the embedded manifest instead of one DOM cube per object.
- Build profile controls are owned by `n:build:web` / `editor-html-build-kit`; renderer, max drawn object budget, and culling mode should flow from kit config to export `runtime`.
- Editor viewport scale is owned by `n:render:three` / `editor-viewport-kit`; Configure exposes viewport max drawn object and culling controls, and the WebGL adapter must report drawn/culled stats without buffering every object in massive scenes.
- Viewport toolbar behavior is owned by `editor-selection-kit`; Select/Move/Rotate/Scale/Pan update `editorState.viewportTool`, and Move/Rotate/Scale mutate the selected object's transform through the runtime `viewportTools` binding.
- Viewport tool state and selected-object transforms must survive project snapshots and remain present in generated HTML manifests.
- Game Structure, Inspector, and Behaviors scroll inside their own grid regions. Keyboard-accessible splitters persist clamped region sizes; project and add actions expand inline and reflow the workspace instead of opening popovers.
- Play is a world-focus state: the viewport takes the workspace while only Stop and runtime status remain in the hero bar; stopping restores the authored layout.
- A project may carry a `nexusengine.playable-project/1` descriptor. When opened from a same-workspace `?project=` URL, Play hosts that exact local generated game in the primary viewport and Stop disposes it; project Save/Load and CLI status preserve the descriptor. Remote URLs and traversal entries are rejected rather than executed.
- A generated project may carry `nexusengine.game-authoring-map/1` records and authored overview, player, and detail views. The viewport camera reads and writes `scene3d.camera`, supports orbit/pan/zoom, and persists through project Save/Load. Generated spatial maps render their real objects and suppress the legacy screen-space cube, camera, light, and transform proxies.
- The scene model supports multiple WebGL-rendered cube objects with selectable transforms, and the single-file HTML export preserves those objects.
- The Inspector owns scene outliner scale controls: object stats, flexible search, add-one, add-25 compact grid batch, duplicate, and delete.
- Bulk-added objects should be smaller grid instances so larger scenes stay readable in the viewport.
- Large scene lists use configurable batch size and visible-result windowing; show match/hidden counts rather than rendering every object row.
- Structured mass authoring is owned by `editor-scene-preset-kit`, which applies scene presets through the Inspector and preserves preset runs in `scene3d.authoringPresets`.
- Scene presets should stamp stable labels, role components, and Domain Service Kit assignments so large games are authored as intentional fields instead of anonymous cube batches.
- Full game composition is owned by `editor-game-template-kit`; Game Templates install registry kits, stamp large preset-backed scenes, wire sequence links, tune viewport/build budgets, and preserve runs in `scene3d.gameTemplates`.
- `chess-board-template` is the default focused game template; it replaces the starter scene with 64 board-square objects, 32 piece objects, `n:game:chess` components, and linked chess move/build sequence steps.
- `target-clicker-template` is a small playable game template; it creates 12 target objects, `n:game:target-clicker` score/hit metadata, linked target sequence steps, and exported click/reset runtime behavior.
- Exported click/score/reset behavior is owned generically by `n:runtime:interaction` / `editor-runtime-interaction-kit`; playable templates should stamp `runtimeClickable` components and `scene3d.runtimeInteraction` state instead of adding one-off HTML runtime code.
- `gem-collector-template` is the second small playable interaction template; it proves the generic runtime interaction path with collectible gems and the same exported `recordInteractionHit` / `resetInteractions` APIs.
- Game Template UI belongs in the existing Scene Inspector as a compact selector plus `Make Game`, not a separate landing page or file browser.
- CLI control is owned by `scripts/nexus-engine-editor-cli.mjs`; it follows the NexusGameKit-Link pattern with `status`, `interactive`, and operation commands such as `chess-game`, while reusing the same editor runtime bindings as the browser app.
- CLI convenience commands include `target-clicker-game` for repeatable target-clicker project and HTML export proof.
- Playable projects export through the CLI/MCP `playable-export` path as an exact local game folder, not through the generic manifest diagnostics builder. The exporter requires a new or empty destination outside the source tree, rejects symlinks, excludes authoring-only evidence/project files, and fingerprints the project, contract, and copied runtime.
- Screenshot and Composition automation are owned by `scripts/nexus-engine-editor-screenshot-mcp.mjs`; it installs the optional MCP and Composition Kits and uses `src/adapters/node-mcp-sdk-adapter.js` for the official SDK stdio transport. It exposes seven Editor tools plus the twelve Composition tools; file-writing tools and `composition_apply` fail closed unless `NEXUS_EDITOR_MCP_ALLOW_WRITES=1`.
- The Engine dependency is pinned to commit `16aee598c06efcb7b511e4827ee3f7e23ce3549b`; `package.json` also records registry and packed-artifact hashes. Validation uses the exact installed tarball, never a sibling source import or symlink.
- GitHub Pages deployment is manual-only through `workflow_dispatch`; source pushes run no publishing path.
- `composition_apply` validates and stages the full accepted tree through the existing Editor controller. Stable plan IDs, executable fingerprints, and exactly-once receipts persist in `project.compositionApplyState`; replay after process restart returns the original receipt and conflicting Kit contents fail before mutation.
- MCP `editor_project_status` delegates to the authoritative CLI, and `editor_playable_export` delegates to the same exact-game export before launching the standalone result for title-state proof. CLI and MCP therefore normalize the same accepted project rather than maintaining parallel project models.
- Editors and games receive no MCP surface by default. A runtime must explicitly install Core MCP, register its own provider, and connect a transport; the example game exposes only status, bounded stepping, state, and one prompt, with actions gated by `NEXUS_GAME_MCP_ALLOW_ACTIONS=1`.
- Selected kit nodes can be assigned to the selected scene object or current filtered visible object set; assignments persist kit-node IDs and continue exporting legacy `domainKits` plus component metadata.
- Project Save/Load is implemented by `editor-project-persistence-kit` with versioned snapshots stored under `nexusengine-editor:project-snapshot`.
- Project reset/new-game is owned by `editor-project-persistence-kit`; the top `New` command clears the browser snapshot and restores the default starter project.
- Project reset/new-game must also stop play mode so the command-strip status shows `New` instead of stale `Running`.
- Project file portability is owned by `n:persistence` / `editor-project-persistence-kit`; `.project.json` export/import preserves the accepted composition, local registry overlay, large scenes, selections, panel state, and sequence/preview receipts.
- Treat manifest-only template exports as single HTML files with embedded DSK manifests; projects with a `nexusengine.playable-project/1` descriptor export their exact runtime folder instead of a registry or diagnostics page.
- Keep advanced controls behind the File menu, inspector foldouts, or collapsed Timeline. The first screen exposes only Add, Apply, Run Once, Play/Stop, status, the hierarchy, viewport, and selected-node settings.
- Do not commit `dist/` or `node_modules/`.
- Keep Playwright reports, traces, videos, and diagnostics out of the repo.
