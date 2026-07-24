# Agent Memory

Status: active

## Durable Decisions

- NexusEngine Editor should be a 3D editor, not a 2D scene/card editor.
- The first view should look like a 3D engine workspace: grid, default cube, camera/axis affordances, transform gizmo.
- The viewport is the base surface and should fill the screen.
- Domain Service Kit controls belong to a tiered, non-overlay grid. Wide windows show Game Structure, viewport, Inspector, and Behaviors; compact and narrow windows preserve the viewport plus one tab-selected bounded context.
- Game Structure contains the registry hierarchy; Inspector configures the selected domain, kit, object, or sequence step; Behaviors owns ordered steps and kit-event links.
- Project and Add surfaces expand inline and reflow the grid. Keyboard-accessible splitters persist clamped sizes; no persistent work surface floats, drags, or overlaps.
- Play temporarily gives the complete workspace to the viewport while keeping Stop and runtime status visible; stopping restores the previous authored layout.
- Generated projects may include a `nexusengine.playable-project/1` same-workspace entry. Browser Play runs that exact game in the viewport, Stop removes it, and project persistence plus CLI inspection preserve its contract hash and entry; remote and escaping entries are invalid.
- Generated projects may include a `nexusengine.game-authoring-map/1` scene with authored overview, player, and detail views. The WebGL camera consumes and updates project camera state through orbit/pan/zoom so Save/Load round-trips the chosen composition; legacy screen-space geometry proxies stay hidden for these real maps.
- The scene should scale beyond the default cube: multiple WebGL-rendered scene objects are part of the editor model and export manifest.
- NexusEngine owns registry truth, hierarchy validation, and dependency planning; the Editor owns draft editing, atomic Apply, and disposable previews.
- Browser users may add existing registry references, but code/registry package installation remains CLI-only and imported JSON never authorizes executable code.
- Browser runtimes use `kitMutationMode: "read-only"`; CLI runtimes opt into `kitMutationMode: "cli"` for install operations.
- Project format `0.3.0` stores an accepted composition tree and project-local registry overlay. Flat `domainStack`, `kitConfigs`, and object `domainKits` remain derived compatibility projections.
- Dirty or invalid drafts disable preview, Play, and Build. Failed Apply never changes the accepted tree.
- Run Once is selection-aware and uses a fresh NexusEngine instance. Only trusted factories already exported by the loaded Engine may execute; optional simple preview commands require `editorSafe` and bounded async timeouts, otherwise one fixed tick runs. Imported manifest-only kits remain preview-unavailable.
- Sequence Timeline links are manifest-driven: source kit, source event, target kit, and target output come from installed kit configs/manifests and export as `sequenceGraph`.
- Sequence playback is owned by `editor-sequence-timeline-kit`; run step/run sequence actions create retained receipts that prove ordered kit event delivery.
- Selecting a Sequence Timeline step should switch Configure into a sequence-step inspector owned by `editor-sequence-timeline-kit`, reusing the same source/event/target/output dropdowns as the bottom timeline while preserving custom step labels.
- Exported HTML should expose `runSequence()` and `sequenceReceipts` so the playable static game can prove the same sequence flow outside the editor.
- Exported HTML should render visible sequence playback controls and receipts so generated games prove kit delivery from the page itself.
- Scalable exported game runtime is owned by `editor-html-build-kit`; single-file HTML should use a canvas runtime, embedded manifest, render stats, and object culling instead of one DOM node per scene object.
- Build profile controls belong to the selected `n:build:web` domain in Configure; renderer, max drawn object budget, and culling mode must flow through kit config into export `runtime`.
- Editor viewport scale belongs to `n:render:three` / `editor-viewport-kit`; Configure should expose viewport draw budget/culling controls, and WebGL should preserve the selected object while reporting drawn/culled stats.
- Viewport toolbar behavior belongs to `editor-selection-kit`; Select/Move/Rotate/Scale/Pan persist in `editorState.viewportTool`, and Move/Rotate/Scale mutate the selected scene object's transform through `viewportTools`.
- Viewport tool state and transform edits should persist through project snapshots and generated HTML manifests.
- Massive-scene authoring belongs in the Inspector: compact object stats, search/filter, add-one, add-25, duplicate, and delete controls under the scene domain.
- Bulk-created scene objects should spawn as smaller grid instances so the 3D viewport stays readable as object count grows.
- Large-scene authoring uses configurable batch size plus visible-result windowing in `editor-scene-object-kit`; the UI should show hidden object counts instead of rendering every matching object row.
- Structured mass authoring is owned by `editor-scene-preset-kit`; presets use the existing Inspector, batch size, scene model, and export manifest instead of adding a separate hierarchy pane.
- Scene presets should stamp stable object labels, role components, Domain Service Kit assignments, and `scene3d.authoringPresets` run metadata.
- Full game composition is owned by `editor-game-template-kit`; templates use the existing registry installer, scene preset model, sequence timeline, and viewport/build budgets to make massive DSK-driven games in one action.
- `chess-board-template` is an engine-authored game template that replaces the starter scene with board-square and piece objects plus `n:game:chess` rules metadata.
- `target-clicker-template` is an engine-authored game template that replaces the starter scene with a playable target range, score/hit metadata, and exported click/reset runtime behavior.
- Game Template controls stay in the Scene Inspector as a compact selector plus `Make Game`, preserving the viewport-first workspace.
- CLI control follows the NexusGameKit-Link pattern: `scripts/nexus-engine-editor-cli.mjs` exposes status, interactive, and operation commands over the same editor runtime bindings.
- Exact generated-game export is a CLI/MCP folder operation: `playable-export` copies the accepted local runtime into a new or empty destination outside its source tree, omits authoring-only evidence/project files, rejects symlinks, and records content fingerprints. It never substitutes the generic DSK diagnostics page for a declared playable project.
- Screenshot validation is exposed through `scripts/nexus-engine-editor-screenshot-mcp.mjs`, a stdio MCP-style service with Playwright-backed screenshot, visual-status, click-and-screenshot, and human-view diagnostic tools.
- MCP project status and playable export delegate to the same CLI model and exporter, then use Playwright only for standalone Human View proof.
- Save and Load are owned by `editor-project-persistence-kit`; they persist versioned project snapshots to browser storage and restore large scenes, selections, panel positions, and filters.
- New/reset is owned by `editor-project-persistence-kit`; it clears the browser snapshot and restores the starter scene for loop testing.
- Project file export/import is owned by `n:persistence` / `editor-project-persistence-kit`; the Persistence Inspector exposes portable `.project.json` controls that preserve large scenes, selections, workspace state, kit graphs, and sequence receipts.
- Bulk kit assignment is owned by the scene/composition bindings: selected kit-node IDs are primary while legacy `domainKits` and component metadata continue to export.
- Avoid generic Unity/Godot clone structure, large file trees, asset browsers, and marketing/hero page composition.

## Reference

- `references/target-3d-domain-service-kit-editor.png`
