# 3D Domain Service Kit Editor

Status: active

## Objective

Convert NexusEngine Editor into a usable 3D scene-first editor for composing Domain Service Kits and sequencing kit-driven events.

## Target Experience

- Blender-like 3D scene with default cube and grid.
- Compact draggable overlays instead of fixed sidebars.
- Domain Stack for adding and reordering domains/kits.
- Configure panel for selected kit/domain/step.
- Sequence Timeline for event links and ordered steps.
- Build/export path remains single-file HTML.

## Suggested Implementation Slices

1. Replace hero surface with 3D viewport shell.
2. Add default cube, grid, orbit camera, transform gizmo visual state.
3. Add compact draggable Domain Stack overlay.
4. Add selected Configure overlay.
5. Add Sequence Timeline overlay with event-link model.
6. Connect domain selection, kit config, and timeline step selection.
7. Update builder/export to include 3D scene and sequence metadata.
8. Add Playwright proof for first view, panel interactions, sequencing, and export.

## Acceptance Proof

- Playwright screenshot confirms the first view matches the reference shape.
- User can add/reorder a kit in the Domain Stack.
- User can add a sequence step and link one kit event to another.
- Exported HTML opens and shows the 3D scene.

