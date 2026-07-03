# Editor Viewport Culling

Status: active

## Objective

Make the live editor viewport scale for massive scenes instead of buffering and drawing every scene object.

## Target Experience

- Selecting `n:render:three` opens Configure controls for editor viewport renderer, max drawn object budget, and culling mode.
- The 3D viewport shows compact drawn/culled stats while the scene remains the main surface.
- Distance-window culling preserves the selected object and renders a bounded visible object set.
- The editor can author hundreds or thousands of objects without requiring every object to be buffered into the WebGL viewport.
- Viewport profile settings persist through project snapshots and project file export/import.

## Ownership

- Domain: `n:render:three`
- Owning kit: `editor-viewport-kit`
- Adapter surface: `src/viewport-webgl.js`
- Config surface: `project.kitConfigs["n:render:three"]`

## Acceptance Proof

- Intent smoke verifies `normalizeViewportRuntimeConfig()` and viewport budget config.
- Playwright smoke creates a 397-object scene, sets the editor viewport budget to 90, and verifies 90 drawn / 307 culled in `window.__NEXUS_VIEWPORT_RENDERER__.stats`.
- Live Playwright diagnostic creates a 1001-object scene, sets the editor viewport budget, captures the viewport stats screenshot outside the repo, and confirms no Playwright artifacts are stored in the repo.
