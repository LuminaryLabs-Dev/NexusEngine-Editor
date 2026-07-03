# Runtime Interaction Implementation Handoff

Status: implemented

## Purpose

Give the next implementation pass a file-level checklist for Goal Packet 021 without reopening broad discovery.

## Work Classification

- Type: scoped domain
- Domain: `n:runtime:interaction`
- Owning kit: `editor-runtime-interaction-kit`
- Reuse/compose decision: reuse `editor-game-template-kit`, `editor-html-build-kit`, `editor-sequence-timeline-kit`, existing scene object components, and existing screenshot MCP. Add one editor runtime kit only to expose the generic interaction domain.

## Source Anchors

| File | Current Role | Needed Change |
| --- | --- | --- |
| `src/editor-domain-model.js` | Owns game templates, target scene stamping, export model | Add `runtimeClickable` component stamping and `scene3d.runtimeInteraction` state; add second small interaction template. |
| `src/dsk-html-builder.js` | Owns generated single-file HTML runtime | Replace target-only click runtime with generic interaction runtime; keep target aliases during migration. |
| `src/nexus-realtime-editor-runtime.js` | Composes editor runtime kits | Add `editor-runtime-interaction-kit` binding/metadata if runtime interaction needs editor-side APIs. |
| `src/kits/editor-kits.js` | Lists editor kit descriptors and state defaults | Add visible/editor descriptor if the kit should appear in editor kit registry/counts. |
| `scripts/nexus-engine-editor-cli.mjs` | Exposes CLI operation surface | Add optional convenience operation for the second interaction game if generic `game-template` is not enough. |
| `scripts/intent-smoke.mjs` | Headless proof | Add manifest/export assertions for generic interaction state and compatibility aliases. |
| `tests/playwright-editor-smoke.mjs` | Human-view/browser proof | Add UI build/save/new/rebuild/exported-click proof for Target Clicker and the second interaction game. |
| `scripts/nexus-engine-editor-screenshot-mcp.mjs` | Screenshot and diagnostic proof | Added `editor_cli_game_screenshot` so the MCP service can run approved CLI game/template operations and screenshot the generated HTML. |

## Implementation Sequence

1. Add a generic interaction schema helper in `src/editor-domain-model.js`.
   - Create a helper such as `createRuntimeClickableComponent(config)`.
   - Keep it plain JSON so project snapshots and generated HTML preserve it.
   - Include `domainPath`, `event`, `targetDomainPath`, `output`, `points`, `singleUse`, and `stateKey`.

2. Update Target Clicker scene stamping.
   - Keep `targetClickerTarget` for compatibility.
   - Add `runtimeClickable` to each target object.
   - Add `n:runtime:interaction` to relevant object `domainKits`.
   - Add `scene3d.runtimeInteraction` with score, hit ids, round status, target count, event names, and output names.

3. Add `n:runtime:interaction` domain metadata.
   - Domain manifest should provide `interaction:state`, `interaction:hit-test`, `score:value`, and `round:complete`.
   - Events should include `interaction.hit`, `score.changed`, and `round.complete`.
   - Target Clicker sequence should point input to `n:runtime:interaction` first, then game/audio/build domains as needed.

4. Add the second proof game template.
   - Suggested id: `gem-collector-template`.
   - Suggested domain: `n:game:gem-collector`.
   - Scene: floor, exit pad, 10-16 collectible gems.
   - Each collectible uses the same `runtimeClickable` schema.
   - The template proves that interaction runtime is not Target Clicker-specific.

5. Refactor generated HTML interaction runtime.
   - Add `interactionState` from `manifest.scene3d.runtimeInteraction`.
   - Add `interactiveEntries()` that reads `object.components.runtimeClickable`.
   - Add `recordInteractionHit(object)`.
   - Add `handleRuntimePointer(event)`.
   - Add `resetInteractions()`.
   - Update draw logic to show hit/collected state for any runtime-clickable object.
   - Keep `recordTargetHit()` as an alias to `recordInteractionHit()` while existing tests migrate.
   - Keep `resetTargets()` as an alias to `resetInteractions()` for compatibility.

6. Reconcile public/runtime API.
   - `window.__NEXUS_DSK_GAME__` should expose:
     - `interactionState`
     - `recordInteractionHit`
     - `resetInteractions`
     - `handleRuntimePointer`
     - existing `sequenceReceipts`
     - compatibility aliases for target clicker

7. Reconcile tests.
   - Update intent smoke first.
   - Then update Playwright smoke.
   - Then run CLI exports.
   - Then run MCP screenshot/click diagnostics.

8. Update `.agent` docs.
   - Mark Goal Packet 021 as complete only after UI, CLI, MCP, and exported-game proof pass.
   - Update `game-loop-progress.md`, `game-loop-retrospective.md`, and `completion-audit.md`.

## Idempotency Requirements

- Reapplying Target Clicker after `New` must create one fresh `scene3d.runtimeInteraction` object, not merge stale hits.
- Save/Load must preserve interaction metadata but not force stale exported-game hit state into a newly reset project.
- Exported `resetInteractions()` must clear score and hit ids without rebuilding or reloading the page.
- Sequence receipts from runtime interactions must append without corrupting `runSequence()` receipts.

## Expected Code Smells To Avoid

- Do not branch exported runtime by template id.
- Do not add another target-only function for the second game.
- Do not put DOM/canvas code into reusable domain helpers.
- Do not replace `targetClickerTarget` abruptly; preserve one compatibility pass.
- Do not use CSS as the engine behavior layer; runtime state should come from manifest/components and JS logic.

## Implementation Proof

- Target Clicker still works.
- Gem Collector or equivalent second game works.
- Both use `runtimeClickable` and `scene3d.runtimeInteraction`.
- Both exported games expose `recordInteractionHit()` and `resetInteractions()`.
- Browser UI blocks kit-mutating game templates and shows the CLI command instead.
- CLI applies kit-mutating game templates with `kitMutationMode: "cli"`.
- MCP can run a CLI game operation and capture a post-click exported-game screenshot.
- Validation passed:
  - `npm run smoke:intent`
  - `npm run build`
  - `npm run smoke:playwright`
  - `npm test`
  - MCP `editor_cli_game_screenshot` for Gem Collector.
