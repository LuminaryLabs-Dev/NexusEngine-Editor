# NexusEngine Editor Memory

Purpose:

- Host a static NexusEngine web editor that keeps the 3D scene viewport primary while exposing DSK domain stacking, kit configuration, sequence timelines, and HTML game export.

Architecture shape:

- `index.html` loads the app directly as browser ES modules.
- `src/editor-domain-model.js` owns the editable 3D scene, domain stack, kit config, and sequence timeline model.
- `src/viewport-webgl.js` owns the dependency-free WebGL viewport renderer for grid, axes, default cube, and play-mode animation.
- `src/kits/editor-kits.js` owns editor kit descriptors and lightweight state.
- `src/kits/editor-feature-contracts-kit/index.js` owns the required editor feature contract map, including owning local kit, reused ProtoKit/Core source, required tokens, and provided tokens.
- `src/dsk-html-builder.js` owns the shared browser/Node builder for single-file DSK-driven game HTML.
- `scripts/build-static-site.mjs` creates the GitHub Pages artifact in `dist/`.
- `.github/workflows/deploy-editor.yml` runs tests and deploys `dist/` from `main` using GitHub Pages Actions.

Conventions:

- Keep the editor static-first and dependency-light.
- Use the native WebGL viewport as the engine/editor surface before falling back to CSS visuals.
- The first view should read as a 3D engine editor: grid, default cube, transform gizmo, camera/light markers, and no landing-page/hero copy.
- Domain Stack, Configure, and Sequence Timeline are docked overlays anchored top-left, top-right, and bottom; they expand inward and must not restore old free-floating positions.
- Left panel is the Domain Stack for adding/reordering/stringing kits; right panel configures the selected kit/object; bottom panel sequences and links kit events.
- Kit install is CLI-only: the editor exposes NexusEngine/ProtoKits-style kit manifests through search, category filtering, a dropdown selector, and copyable CLI commands, but browser install buttons do not mutate the kit graph.
- The browser editor loads NexusEngine `0.0.3` from `https://cdn.jsdelivr.net/gh/LuminaryLabs-Dev/NexusEngine@0.0.3/src/index.js` when available, and falls back to the local compatible composer only to keep the static editor usable when remote import fails.
- Every required editor capability should be represented in `editor-feature-contracts-kit` and exported through `featureContracts` plus `featureContractValidation` in generated game manifests.
- Browser runtimes use `kitMutationMode: "read-only"` and reject direct registry install calls; CLI contexts explicitly opt into `kitMutationMode: "cli"` for `install-kit` operations.
- Game templates that install kits are also CLI-only in browser runtimes; the browser may show the selected template and command, but only the CLI may apply kit-mutating templates.
- The Domain Stack shows the Registry Kit dropdown by default; search/category filters are secondary controls below the selector.
- The default registry selection is the Spatial Authoring Bundle so users immediately see sub-kits/domains before installing.
- Composite kit selections show a compact sub-kit preview before installation so child domains/kits are visible in the first picker view.
- Registry-installed kits preserve `kitId`, `requires`, `provides`, and `children` metadata in the project model and HTML export manifest.
- Domain Stack is the large-game kit graph control surface: keep installed-kit filtering, Stack/Map modes, dependency health, and `domainStackHealth` export metadata aligned.
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
- Primary overlay panels are docked, not draggable; project snapshots intentionally do not restore positions for Domain Stack, Configure, or Sequence Timeline.
- The scene model supports multiple WebGL-rendered cube objects with selectable transforms, and the single-file HTML export preserves those objects.
- The Configure overlay owns scene outliner scale controls: object stats, flexible search, add-one, add-25 compact grid batch, duplicate, and delete.
- Bulk-added objects should be smaller grid instances so larger scenes stay readable in the viewport.
- Large scene lists use configurable batch size and visible-result windowing; show match/hidden counts rather than rendering every object row.
- Structured mass authoring is owned by `editor-scene-preset-kit`, which applies scene presets through the Configure overlay and preserves preset runs in `scene3d.authoringPresets`.
- Scene presets should stamp stable labels, role components, and Domain Service Kit assignments so large games are authored as intentional fields instead of anonymous cube batches.
- Full game composition is owned by `editor-game-template-kit`; Game Templates install registry kits, stamp large preset-backed scenes, wire sequence links, tune viewport/build budgets, and preserve runs in `scene3d.gameTemplates`.
- `chess-board-template` is the default focused game template; it replaces the starter scene with 64 board-square objects, 32 piece objects, `n:game:chess` components, and linked chess move/build sequence steps.
- `target-clicker-template` is a small playable game template; it creates 12 target objects, `n:game:target-clicker` score/hit metadata, linked target sequence steps, and exported click/reset runtime behavior.
- Exported click/score/reset behavior is owned generically by `n:runtime:interaction` / `editor-runtime-interaction-kit`; playable templates should stamp `runtimeClickable` components and `scene3d.runtimeInteraction` state instead of adding one-off HTML runtime code.
- `gem-collector-template` is the second small playable interaction template; it proves the generic runtime interaction path with collectible gems and the same exported `recordInteractionHit` / `resetInteractions` APIs.
- Game Template UI belongs in the existing Scene Configure overlay as a compact selector plus `Make Game`, not a separate landing page or file browser.
- CLI control is owned by `scripts/nexus-engine-editor-cli.mjs`; it follows the NexusGameKit-Link pattern with `status`, `interactive`, and operation commands such as `chess-game`, while reusing the same editor runtime bindings as the browser app.
- CLI convenience commands include `target-clicker-game` for repeatable target-clicker project and HTML export proof.
- Screenshot automation is owned by `scripts/nexus-engine-editor-screenshot-mcp.mjs`; it is a stdio MCP-style service exposing Playwright-backed screenshot, visual-status, click-and-screenshot, and human-view diagnostic tools, with captures written to `.agent/screenshots/`.
- The screenshot MCP service can run approved CLI game/template operations through `editor_cli_game_screenshot`, open the generated single-file game, and capture screenshot-backed status so kit-mutating authoring is validated through the CLI path.
- Selected Domain Stack kits can be assigned to the selected scene object or current filtered visible object set; assigned objects persist `domainKits` and component metadata into exports.
- Project Save/Load is implemented by `editor-project-persistence-kit` with versioned snapshots stored under `nexusengine-editor:project-snapshot`.
- Project reset/new-game is owned by `editor-project-persistence-kit`; the top `New` command clears the browser snapshot and restores the default starter project.
- Project reset/new-game must also stop play mode so the command-strip status shows `New` instead of stale `Running`.
- Project file portability is owned by `n:persistence` / `editor-project-persistence-kit`; selecting the Persistence domain exposes `.project.json` export/import controls that preserve large scenes, selections, panel state, kit graphs, and sequence receipts.
- Treat generated game exports as single HTML files with embedded DSK manifests.
- Keep advanced controls behind compact panels or foldouts; the first screen should stay focused on viewport, play/stop, build, export, domain stack, configure, and sequence.
- Do not commit `dist/` or `node_modules/`.
- Keep Playwright reports, traces, videos, and diagnostics out of the repo.
