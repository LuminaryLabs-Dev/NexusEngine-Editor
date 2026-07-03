# Scalable HTML Runtime

Status: active

## Objective

Make exported single-file games scale beyond small DOM previews by giving built HTML a canvas runtime with render stats and culling proof.

## Target Experience

- Build HTML still creates one static playable file.
- The exported game opens to a 3D-style canvas viewport, not a DOM cube pile.
- Runtime HUD reports renderer, manifest object count, drawn object count, and culled object count.
- The full manifest remains embedded so massive scenes keep every object, kit assignment, preset run, and sequence step.
- Sequence receipts still run in the exported game.

## Ownership

- Domain: `n:build:web`
- Owning kit: `editor-html-build-kit`
- Builder surface: `src/dsk-html-builder.js`

## Acceptance Proof

- Intent smoke verifies `canvas-3d` runtime normalization, `runtime-canvas`, `renderStats`, and `drawRuntimeFrame` in generated HTML.
- Playwright smoke builds a 397-object scene from the editor and verifies the generated HTML contains the scalable runtime surface.
- Live Playwright diagnostic opens an exported 397-object HTML game, validates `window.__NEXUS_DSK_GAME__.renderStats`, captures a screenshot outside the repo, and confirms repo-local Playwright artifacts are absent.
