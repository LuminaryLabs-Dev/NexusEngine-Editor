# Large Scene Windowing

Status: active

## Objective

Make the scene object editor usable for hundreds of objects without turning the viewport-first editor into a fixed hierarchy browser.

## Target Experience

- Configure panel keeps scene-object authoring inside the compact right overlay.
- Users can choose a batch size before adding a grid of cube objects.
- Users can choose how many matching objects the outliner renders at once.
- Scene stats show total objects, kit links, component links, match count, visible count, and hidden count.
- Object search can still jump to a specific object outside the current visible window.
- Save, Load, Build HTML, and manifest export preserve large scene object counts.
- Mobile layout keeps object search, batch, and visible-limit controls readable.

## Acceptance Proof

- Intent smoke creates a 277-object scene, verifies a 25-row object window, saves/loads the project, and confirms export preservation.
- Playwright smoke creates a 277-object scene through the UI, verifies hidden-count text, saves/loads the large scene, and builds HTML.
- Live Playwright diagnostic creates a 501-object scene, assigns `n:physics` to filtered `cube-500`, restores it through Save/Load, builds a 574 KB static HTML file, and captures desktop/mobile screenshots outside the repo.
