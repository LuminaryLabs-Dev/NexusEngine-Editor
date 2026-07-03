# Agent Memory

Status: active

## Durable Decisions

- NexusEngine Editor should be a 3D editor, not a 2D scene/card editor.
- The first view should look like a 3D engine workspace: grid, default cube, camera/axis affordances, transform gizmo.
- The viewport is the base surface and should fill the screen.
- Domain Service Kit controls should appear as compact docked translucent overlays, not free-floating panels.
- The left overlay is a compact Domain Stack for adding, reordering, and stringing domains/kits.
- The right overlay configures the selected domain, kit, object, or sequence step.
- The bottom overlay is a Sequence Timeline for adding ordered steps and linking events between kits.
- Domain Stack, Configure, and Sequence Timeline should not drag; they are docked top-left, top-right, and bottom and expand inward.
- The scene should scale beyond the default cube: multiple WebGL-rendered scene objects are part of the editor model and export manifest.
- Kit install mutations must be CLI-only: the browser may browse/search registry manifests and show dependency/child-kit details plus copyable commands, but it should not expose install buttons or allow direct registry mutation calls.
- Browser runtimes use `kitMutationMode: "read-only"`; CLI runtimes opt into `kitMutationMode: "cli"` for install operations.
- The Registry Kit dropdown is a visible Domain Stack control by default; search/category filters are secondary controls below it.
- The default registry selection should be `spatial-authoring-kits` so composite sub-domains are visible before installation.
- Composite registry selections should show a compact sub-kit preview above install actions so child kits/domains are visible before installation.
- Installed kit metadata should persist into the Domain Stack and HTML export manifest through fields such as `kitId`, `requires`, `provides`, and `children`.
- Large-game authoring needs Domain Stack scale controls: installed-kit filtering, Stack/Map modes, dependency health, and exported `domainStackHealth`.
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
- Massive-scene authoring belongs in the existing Configure overlay: compact object stats, search/filter, add-one, add-25, duplicate, and delete controls under the scene domain.
- Bulk-created scene objects should spawn as smaller grid instances so the 3D viewport stays readable as object count grows.
- Large-scene authoring uses configurable batch size plus visible-result windowing in `editor-scene-object-kit`; the UI should show hidden object counts instead of rendering every matching object row.
- Structured mass authoring is owned by `editor-scene-preset-kit`; presets use the existing Configure overlay, batch size, scene model, and export manifest instead of adding a separate hierarchy pane.
- Scene presets should stamp stable object labels, role components, Domain Service Kit assignments, and `scene3d.authoringPresets` run metadata.
- Full game composition is owned by `editor-game-template-kit`; templates use the existing registry installer, scene preset model, sequence timeline, and viewport/build budgets to make massive DSK-driven games in one action.
- `chess-board-template` is an engine-authored game template that replaces the starter scene with board-square and piece objects plus `n:game:chess` rules metadata.
- `target-clicker-template` is an engine-authored game template that replaces the starter scene with a playable target range, score/hit metadata, and exported click/reset runtime behavior.
- Game Template controls stay in the Scene Configure overlay as a compact selector plus `Make Game`, preserving the viewport-first workspace.
- CLI control follows the NexusGameKit-Link pattern: `scripts/nexus-engine-editor-cli.mjs` exposes status, interactive, and operation commands over the same editor runtime bindings.
- Screenshot validation is exposed through `scripts/nexus-engine-editor-screenshot-mcp.mjs`, a stdio MCP-style service with Playwright-backed screenshot, visual-status, click-and-screenshot, and human-view diagnostic tools.
- Save and Load are owned by `editor-project-persistence-kit`; they persist versioned project snapshots to browser storage and restore large scenes, selections, panel positions, and filters.
- New/reset is owned by `editor-project-persistence-kit`; it clears the browser snapshot and restores the starter scene for loop testing.
- Project file export/import is owned by `n:persistence` / `editor-project-persistence-kit`; the Configure overlay for Persistence should expose portable `.project.json` controls that preserve large scenes, selections, panel state, kit graphs, and sequence receipts.
- Bulk kit assignment is owned by the scene/composition bindings: selected Domain Stack kit can be assigned to the selected object or the current filtered visible object set, preserving `domainKits` and component metadata.
- Avoid generic Unity/Godot clone structure, large file trees, asset browsers, and marketing/hero page composition.

## Reference

- `references/target-3d-domain-service-kit-editor.png`
