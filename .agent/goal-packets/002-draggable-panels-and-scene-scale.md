# Draggable Panels And Scene Scale

Status: active

## Objective

Make the reference-image panels function like production editor overlays and make the scene model scale past the single default cube.

## Target Experience

- Users can drag the Domain Stack, Configure, and Sequence Timeline overlays.
- Users can select the scene domain and add more cube objects.
- Users can select scene objects and edit transforms from the Configure panel.
- WebGL renders all scene objects from the model.
- Build/export preserves all scene objects in the single-file HTML output.

## Acceptance Proof

- Playwright moves at least one overlay panel and confirms the position changed.
- Playwright adds a cube, edits its transform, and confirms the project manifest changed.
- HTML build/export contains multiple scene objects.
- Desktop/mobile screenshots show the viewport and overlays still fit.
