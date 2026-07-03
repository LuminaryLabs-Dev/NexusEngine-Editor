# Game Loop Progress

Documentation phase: started after Loop 3. Goal Packet 021 has now been implemented; browser kit-mutating actions remain CLI-only and MCP screenshot proof is available through the CLI path.

Documentation status:
- Runtime interaction blocker packet: `.agent/goal-packets/021-runtime-interaction-kit.md` complete
- Active goal audit: `.agent/completion-audit.md`
- Implementation handoff: `.agent/runtime-interaction-implementation-handoff.md` implemented
- Validation matrix: `.agent/runtime-interaction-validation-matrix.md` passed

## Loop 1 - Nexus Chess

Status: documented

Simple game idea:
- Nexus Chess: a 3D chess board with 64 squares, 32 pieces, chess rules metadata, move sequencing, and HTML export.

Kits needed:
- `n:scene`
- `n:render:three`
- `n:input`
- `n:selection`
- `n:transform`
- `n:game:chess`
- `n:audio-feedback`
- `n:build:web`
- `n:persistence`

CLI/MCP capability assessment:
- CLI can apply game templates, install kits, export project JSON, and export HTML.
- MCP screenshot service can capture the editor and return panel bounds plus manifest status.
- UI still needs proof that a user can apply the game template, save, load, build, and export without direct code edits.

Sequential change requests:
- CR-001: Dock primary panels so the UI does not block scene/object controls.
- CR-002: Make kit install CLI-only while keeping the UI registry inspectable.
- CR-003: Add screenshot MCP status/capture for human-view validation.
- CR-004: Validate Nexus Chess through the UI save/build loop.

Current biggest blocker:
- Fixed in CR-005: the editor now has a `New` command that resets the current game to the starter scene and clears the saved browser snapshot.

UI loop proof:
- PASS: Applied `chess-board-template` from the Scene Configure panel.
- PASS: Saved Nexus Chess through the top command strip.
- PASS: Used `New` to delete/reset the current game.
- PASS: Re-applied `chess-board-template` from the UI after reset.
- PASS: Built HTML from the UI.
- PASS: Screenshot captured at `.agent/screenshots/loop1-chess-reset-ui.png`.

Next biggest blocker:
- The UI can build a template game, but there is not yet an in-editor game-specific chess move interaction layer; exported chess is represented as engine scene/rules data plus sequence receipts.

## Loop 2 - Nexus Target Clicker

Status: documented

Simple game idea:
- Nexus Target Clicker: a small 3D target range where the exported game lets the player click targets, score points, and reset the round.

Kits needed:
- `n:scene`
- `n:render:three`
- `n:input`
- `n:selection`
- `n:transform`
- `n:game:target-clicker`
- `n:audio-feedback`
- `n:build:web`
- `n:persistence`

CLI/MCP capability assessment:
- Existing CLI can apply any game template; CR-006 adds a direct `target-clicker-game` operation for repeatable proof.
- Existing MCP screenshot service is enough for visual status and screenshots.
- Export runtime needed a target-click interaction hook, score state, and reset action.

Sequential change requests:
- CR-006: Add `target-clicker-template` under `editor-game-template-kit`.
- CR-007: Add exported target-clicker hit/score/reset runtime behavior.
- CR-008: Add CLI `target-clicker-game` operation.

Current biggest blocker:
- Fixed in CR-009: UI loop proof now covers applying, saving, resetting, rebuilding, and playing one hit in the exported Target Clicker game.

UI loop proof:
- PASS: Applied `target-clicker-template` from the Scene Configure panel.
- PASS: Saved Nexus Target Clicker through the top command strip.
- PASS: Used `New` to delete/reset the current game.
- PASS: Re-applied `target-clicker-template` from the UI after reset.
- PASS: Built HTML from the UI.
- PASS: Clicked one target in the exported HTML and observed score `15`.
- PASS: Screenshots captured at `.agent/screenshots/loop2-target-clicker-ui.png` and `.agent/screenshots/loop2-target-clicker-exported-hit.png`.

Next biggest blocker:
- The exported target-clicker is now playable, but game-specific runtime behavior lives in the HTML builder instead of a reusable runtime game interaction kit.

## Loop 3 - Editor Control Surface Hardening

Status: documented

Simple infrastructure goal:
- Make manual kit installation CLI-only at the runtime boundary, and expose screenshot-based MCP diagnostics for the editor/game loop.

Kits/tooling needed:
- `editor-kit-registry-kit`
- `editor-kit-installer-kit`
- `editor-domain-stack-kit`
- `editor-project-persistence-kit`
- `editor-html-build-kit`
- `scripts/nexus-engine-editor-cli.mjs`
- `scripts/nexus-engine-editor-screenshot-mcp.mjs`

Sequential change requests:
- CR-010: Gate registry kit mutation behind `kitMutationMode`.
- CR-011: Browser runtime defaults to `read-only`; CLI runtime opts into `cli`.
- CR-012: Expand screenshot MCP service with `editor_click_screenshot` and `editor_human_view_diagnostic`.

Proof:
- PASS: `npm run smoke:intent`
- PASS: `npm run cli -- operations submit install-kit --param kit=audio-feedback-domain-kit --json`
- PASS: MCP `tools/list` returns `editor_screenshot`, `editor_visual_status`, `editor_click_screenshot`, and `editor_human_view_diagnostic`.
- PASS: MCP `editor_human_view_diagnostic` against `http://127.0.0.1:4174/?run=small-game-loop-2` reports `ok: true`.
- PASS: Screenshot captured at `.agent/screenshots/mcp-human-view-diagnostic.png`.
- PASS: `npm run build`
- PASS: `npm run smoke:playwright`

Next biggest blocker:
- The editor now has a stronger CLI/MCP control surface, but the next playable-game pass should extract reusable runtime interaction behavior from target-clicker into a kit-shaped interaction runtime.

Documentation:
- See `.agent/game-loop-retrospective.md` for requirement coverage, capability map, blocker analysis, and CR-013 through CR-017.
- See `.agent/goal-packets/021-runtime-interaction-kit.md` for the implemented CR-013 interaction-runtime extraction.
- See `.agent/runtime-interaction-validation-matrix.md` for the passed proof gate.

## Goal Packet 021 - Runtime Interaction + CLI-Only Kit Mutation

Status: implemented

What changed:
- Added `editor-runtime-interaction-kit` and generic `n:runtime:interaction` export behavior.
- Target Clicker and Gem Collector use `runtimeClickable` and `scene3d.runtimeInteraction`.
- Browser Domain Stack and game-template authoring are inspect/select/configure only for kit-mutating actions.
- Browser runtime keeps `kitMutationMode: "read-only"` and direct install/template calls throw `CLI-only`.
- CLI runtime opts into `kitMutationMode: "cli"` for `install-kit`, `game-template`, and convenience game operations.
- Screenshot MCP now includes `editor_cli_game_screenshot`, which runs the CLI operation, opens generated HTML, optionally clicks, and captures screenshot-backed status.

Proof:
- PASS: `npm run smoke:intent`
- PASS: `npm run build`
- PASS: `npm run smoke:playwright`
- PASS: `npm test`
- PASS: CLI `gem-collector-game` exported HTML/project with `kitMutationMode: "cli"`.
- PASS: MCP `tools/list` includes `editor_cli_game_screenshot`.
- PASS: MCP `editor_cli_game_screenshot` captured `.agent/screenshots/mcp-cli-gem-collector-click.png` and observed `25 score · 1/12 hit`.

## Post-021 UI-Only Loop Revalidation - Platform Run

Status: passed

Simple game idea:
- Platform Run: a small traversal lane created from the Scene Configure panel with the `platform-run-preset`.

Kits used:
- `editor-scene-preset-kit`
- `editor-project-persistence-kit`
- `editor-html-build-kit`
- `editor-selection-kit`
- Starter domains: `n:scene`, `n:input`, `n:build:web`, `n:persistence`

CLI/MCP capability assessment:
- No kit installation is required for this loop, so it stays inside UI-only authoring.
- CLI/MCP remain available for validation/export proof, but the game is built, saved, exported, deleted, and reset through visible UI actions.

Sequential change request:
- CR-018: Revalidate a small UI-only game loop after kit-mutating templates became CLI-only.
- CR-019: Fix `New` reset so it also stops stale play mode and the status pill can show `New`.

Proof:
- PASS: Playwright used visible UI controls to select `platform-run-preset`, apply 16 objects, save the project, build HTML, open the generated HTML, and click `New`.
- PASS: `New` reset returns the project to one starter object and `projectPersistence.status === "reset"`.
- PASS: Fixed stale `Running` status after reset by stopping `state.mode` in `editor-project-persistence-kit`.
- PASS: `npm run smoke:intent`
- PASS: `npm run smoke:playwright`
- PASS: `npm test`
- PASS: Screenshot captured at `.agent/screenshots/ui-only-platform-run-loop.png`.
