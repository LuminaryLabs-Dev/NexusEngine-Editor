# Runtime Interaction Validation Matrix

Status: passed

## Purpose

Define the proof matrix for completing Goal Packet 021 and unblocking the active loop goal.

## Required Proof Surfaces

| Surface | Command/Action | Required Evidence |
| --- | --- | --- |
| Intent smoke | `npm run smoke:intent` | Generic interaction manifest, object components, HTML APIs, and compatibility aliases are asserted. |
| Build | `npm run build` | Static editor and starter game still build. |
| CLI Target Clicker | `npm run cli:target-clicker` | HTML/project output exists and includes generic interaction runtime state. |
| CLI second game | `npm run cli -- operations submit game-template --param template=gem-collector-template --param html=dist/games/nexus-gem-collector.html --param project=dist/games/nexus-gem-collector.project.json` | Second interaction game exports without browser use. |
| Browser CLI-only boundary | Playwright against editor | UI shows CLI command, kit-mutating template button is disabled, and direct runtime calls throw `CLI-only`. |
| Exported Target Clicker | Playwright `setContent` or served HTML | `window.__NEXUS_DSK_GAME__.recordInteractionHit` exists and one hit appends a receipt. |
| Exported second game | Playwright `setContent` or served HTML | Same generic APIs work without target-specific aliases. |
| MCP editor proof | `editor_human_view_diagnostic` | `ok: true` after UI build; screenshot saved under `.agent/screenshots/`. |
| MCP exported proof | `editor_cli_game_screenshot` | CLI generates a game, exported HTML opens, post-click screenshot is saved, and visible score/receipt state is captured. |

## Required Assertions

Manifest assertions:
- `scene3d.runtimeInteraction.domainPath === "n:runtime:interaction"`
- `scene3d.runtimeInteraction.targetObjectCount > 0`
- At least one scene object has `components.runtimeClickable`
- Runtime-clickable objects include `n:runtime:interaction` in `domainKits`
- Sequence graph remains valid

Generated HTML assertions:
- Contains `interactionState`
- Contains `recordInteractionHit`
- Contains `resetInteractions`
- Contains `handleRuntimePointer`
- Still contains `runSequence`
- Target Clicker compatibility aliases exist for one transition pass:
  - `recordTargetHit`
  - `resetTargets`

Runtime assertions:
- First click increases score.
- First click adds one receipt.
- Re-clicking a `singleUse` object does not double-score.
- Reset clears score and hit object ids.
- `runSequence()` still renders sequence receipts.

UI assertions:
- No browser registry install button appears.
- `kitMutationMode` remains `read-only` in browser runtime.
- Save/Load status still appears in the command strip.
- Kit-mutating game templates cannot be applied directly from the browser.
- Scene panel shows the CLI `game-template` command for the selected template.

## Screenshot Artifacts

Retained screenshots:
- `.agent/screenshots/runtime-interaction-target-clicker-ui.png`
- `.agent/screenshots/mcp-cli-gem-collector-click.png`

## Completion Gate

Goal Packet 021 moved to `complete` after:
- `npm run smoke:intent`
- `npm run build`
- `npm run smoke:playwright`
- `npm test`
- `node scripts/nexus-engine-editor-cli.mjs operations submit gem-collector-game --param html=dist/games/nexus-gem-collector.html --param project=dist/games/nexus-gem-collector.project.json --json`
- MCP `tools/list`
- MCP `editor_cli_game_screenshot` with a Gem Collector click screenshot at `.agent/screenshots/mcp-cli-gem-collector-click.png`
