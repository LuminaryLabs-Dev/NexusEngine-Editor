# Three-Loop Game Editor Retrospective

Status: active

## Purpose

Document the first three NexusEngine Editor build/test loops after the editor became usable enough to create, save, delete, rebuild, and inspect small DSK-driven games from the UI and CLI/MCP surfaces.

## Scope

- Repo: `NexusEngine-Editor`
- Runtime model: NexusEngine-style composed editor kits
- UI surface: viewport-first browser editor
- Documentation phase: started after three build/test loops

## Loop Summary

| Loop | Idea | Owning Domain | Owning Kit/Surface | Result |
| --- | --- | --- | --- | --- |
| 1 | Nexus Chess | `n:game:chess` | `editor-game-template-kit` | UI can apply, save, reset, rebuild, and export a chess scene/rules template. |
| 2 | Nexus Target Clicker | `n:game:target-clicker` | `editor-game-template-kit` + `editor-html-build-kit` | Exported game is playable: target clicks update score and receipts. |
| 3 | Editor Control Surface Hardening | `n:registry`, `n:registry:install`, `n:editor:status` | `editor-kit-registry-kit`, `editor-kit-installer-kit`, screenshot MCP | Browser kit installs are read-only; CLI installs are enabled; screenshot diagnostics are MCP-callable. |

## Current Proof

- Loop 1 UI proof:
  - `.agent/screenshots/loop1-chess-reset-ui.png`
  - Game template: `chess-board-template`
  - Export proves board/piece scene data and sequence receipts.
- Loop 2 UI/export proof:
  - `.agent/screenshots/loop2-target-clicker-ui.png`
  - `.agent/screenshots/loop2-target-clicker-exported-hit.png`
  - Exported hit raised score to `15`.
- Loop 3 CLI/MCP proof:
  - `.agent/screenshots/mcp-human-view-diagnostic.png`
  - MCP `editor_human_view_diagnostic` reported `ok: true`.
  - Browser runtime exposes `kitMutationMode: "read-only"`.
  - CLI runtime reports `kitMutationMode: "cli"` and can install `audio-feedback-domain-kit`.

## Requirement Coverage

| Requirement | Evidence | Status |
| --- | --- | --- |
| Choose a simple game idea each loop | Chess, Target Clicker, control-surface hardening recorded in `game-loop-progress.md` | Covered for first three loops |
| Identify kits needed | Each loop lists domain/service kits | Covered |
| Assess CLI/MCP capability | Each loop includes CLI/MCP capability assessment or proof | Covered |
| Add CLI/MCP capabilities as needed | CLI game ops and screenshot MCP tools exist | Covered |
| Tooling should be sequential change requests | CR-001 through CR-012 are recorded | Covered |
| Build the game and track progress in `.agent` | Loop progress and screenshots are retained | Covered |
| Delete game and start again | `New` reset was added and used in loops 1 and 2 | Covered |
| After 3 turns stop building and start documenting | This file, `goal-packets/021-runtime-interaction-kit.md`, and `completion-audit.md` document the phase | Covered for current documentation pass |

## CLI/MCP Capability Map

CLI:
- `npm run cli -- status`
- `npm run cli -- templates`
- `npm run cli -- operations list`
- `npm run cli -- operations submit install-kit --param kit=<registry-kit-id>`
- `npm run cli:chess`
- `npm run cli:target-clicker`

MCP:
- `editor_screenshot`
- `editor_visual_status`
- `editor_click_screenshot`
- `editor_human_view_diagnostic`
- `editor_cli_game_screenshot`

Browser install boundary:
- Browser registry picker can search, select, preview dependencies/sub-kits, and show CLI commands.
- Browser registry picker must not expose install buttons.
- Direct browser runtime install calls must throw CLI-only errors.
- Browser game-template controls must not apply kit-mutating templates directly; they show the CLI command and the runtime rejects direct calls.

## Runtime Interaction Follow-Up

Goal Packet 021 fixed the prior interaction blocker by adding a generic runtime interaction path:
- Domain: `n:runtime:interaction`
- Kit name: `editor-runtime-interaction-kit`
- State: clicked/collected object ids, score, round status, receipts
- Inputs: pointer hit on scene object with `runtimeClickable`
- Events: `interaction.hit`, `score.changed`, `round.complete`
- Outputs: score value, receipt list, object-state changes
- Reset: `resetInteractions()`
- Proof: Target Clicker and Gem Collector both use the same runtime interaction path

Current proof includes `npm test` and MCP `editor_cli_game_screenshot`, which generated Gem Collector through the CLI and captured a post-click screenshot showing score/receipt state.

## Next Sequential Change Requests

- CR-013: Complete - define generic `runtimeClickable` / interaction component schema in the editor domain model.
- CR-014: Complete - move exported target-click handling into reusable interaction runtime APIs in the HTML builder.
- CR-015: Complete - update `target-clicker-template` to consume the generic runtime interaction schema.
- CR-016: Complete - add `gem-collector-template` as the second interaction-runtime game.
- CR-017: Complete - validate browser CLI-only boundary, CLI game export, exported click behavior, and MCP screenshot diagnostics.

Planning packet:
- `.agent/goal-packets/021-runtime-interaction-kit.md`

Completion audit:
- `.agent/completion-audit.md`

Implementation handoff:
- `.agent/runtime-interaction-implementation-handoff.md`
- `.agent/runtime-interaction-validation-matrix.md`

## Promotion Decision

Safe to keep:
- Viewport-first editor shell
- Docked overlay layout
- CLI-only kit installation boundary
- Screenshot MCP diagnostic service
- Game Template authoring pattern

Experimental:
- Runtime interaction state schema promotion beyond editor/export runtime
- Multi-hit cooldowns and richer interaction policies
