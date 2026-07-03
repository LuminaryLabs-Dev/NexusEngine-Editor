# Goal Packet 021: Runtime Interaction Kit

Status: complete

## Intent

Extract the exported Target Clicker hit/score/reset behavior into a reusable runtime interaction kit shape so multiple small games can share the same object-click, receipt, score, reset, and snapshot behavior.

## User Need

The editor should not grow one-off exported runtime code for every playable game template. A user should be able to stamp a game template, build HTML, and get playable interactions from kit-owned scene metadata.

## Domain

- Domain path: `n:runtime:interaction`
- Owning editor kit: `editor-runtime-interaction-kit`
- Composed with:
  - `editor-game-template-kit`
  - `editor-html-build-kit`
  - `editor-sequence-timeline-kit`
  - `n:input`
  - `n:selection`
  - target game domains such as `n:game:target-clicker`

## Current Source Evidence

- `src/editor-domain-model.js` stamps `targetClickerTarget` components directly into Target Clicker objects.
- `src/editor-domain-model.js` stores game-specific state under `scene3d.targetClicker`.
- `src/dsk-html-builder.js` has Target Clicker-specific runtime functions:
  - `targetEntries()`
  - `recordTargetHit()`
  - `handleTargetPointer()`
  - `resetTargets()`
  - `renderTargetStatus()`
- `window.__NEXUS_DSK_GAME__` exposes target-specific APIs instead of a generic interaction API.

## Proposed Schema

Scene-level state:

```json
{
  "runtimeInteraction": {
    "domainPath": "n:runtime:interaction",
    "score": 0,
    "hitObjectIds": [],
    "roundStatus": "ready",
    "targetObjectCount": 12,
    "events": ["interaction.hit", "score.changed", "round.complete"],
    "outputs": ["interaction:state", "score:value", "round:complete"]
  }
}
```

Object-level component:

```json
{
  "runtimeClickable": {
    "domainPath": "n:runtime:interaction",
    "sourceDomainPath": "n:input",
    "targetDomainPath": "n:game:target-clicker",
    "event": "interaction.hit",
    "completeEvent": "round.complete",
    "output": "score:value",
    "completeOutput": "round:complete",
    "points": 15,
    "stateKey": "hitObjectIds",
    "singleUse": true
  }
}
```

## Acceptance Criteria

- Add `editor-runtime-interaction-kit` to the editor runtime kit graph.
- Add a generic `runtimeClickable` object component shape.
- Add `scene3d.runtimeInteraction` state to game export manifests when a template uses runtime interactions.
- Keep Target Clicker playable after migration.
- Keep `targetClicker` metadata only as compatibility or template-specific summary data, not as the only runtime interaction path.
- Generated HTML exposes generic APIs:
  - `interactionState`
  - `recordInteractionHit(object)`
  - `resetInteractions()`
  - `handleRuntimePointer(event)`
- Generated HTML may keep `recordTargetHit()` and `resetTargets()` as compatibility aliases while tests migrate.
- Sequence receipts emitted by generic interactions include source event, target domain, output, object id, score, and status.
- Reset clears generic interaction state without rebuilding the scene.
- Snapshot/export preserves interaction state.
- A second small game template, such as Gem Collector, uses the same generic runtime interaction path.

## Validation

- Intent smoke:
  - Target Clicker manifest contains `scene3d.runtimeInteraction`.
  - Target objects contain `runtimeClickable`.
  - Generated HTML contains `recordInteractionHit`, `resetInteractions`, and `interactionState`.
  - Target Clicker compatibility APIs still exist.
- CLI:
  - `npm run cli:target-clicker` still creates playable HTML/project output.
  - A new CLI operation or generic `game-template` call can export the second interaction game.
- Playwright:
  - Build Target Clicker through the UI.
  - Save it.
  - Use `New` to delete/reset it.
  - Rebuild it through the UI.
  - Open generated HTML.
  - Click an interaction object and verify score/receipt state.
  - Repeat for the second game template using the same exported runtime functions.
- MCP:
  - `editor_human_view_diagnostic` captures the editor state after the UI build.
  - `editor_click_screenshot` captures the exported game after one interaction.

## Non-Goals

- Do not build a physics engine for picking.
- Do not introduce external rendering dependencies.
- Do not move renderer, DOM, Canvas, or browser event wiring into reusable NexusRealtime core logic.
- Do not start Loop 4 until the implemented CLI-only/runtime-interaction workflow is reviewed and accepted.

## Implementation Notes

- Reuse `editor-game-template-kit` for authoring and `editor-html-build-kit` for exported runtime wiring.
- Compose generic interaction metadata with game-specific domains rather than replacing game domains.
- Treat `n:runtime:interaction` as editor/export runtime behavior first; promote only after it works across at least two game templates.
- Keep changes idempotent: rebuilding, saving/loading, resetting, and reapplying templates must not duplicate interaction state.

## Handoff Docs

- `.agent/runtime-interaction-implementation-handoff.md`
- `.agent/runtime-interaction-validation-matrix.md`

## Implementation Result

- `runtimeInteraction` lives under `scene3d` for the current editor/export runtime pass.
- `editor-runtime-interaction-kit` is part of the editor runtime kit graph.
- Target Clicker and Gem Collector both stamp `runtimeClickable` objects and `scene3d.runtimeInteraction`.
- Generated HTML exposes `interactionState`, `recordInteractionHit`, `resetInteractions`, and `handleRuntimePointer`.
- Target Clicker compatibility aliases remain for one transition pass.
- Browser kit-mutating game templates are CLI-only; CLI runtime applies templates with `kitMutationMode: "cli"`.
- Screenshot MCP includes `editor_cli_game_screenshot` for CLI-generated game proof.
