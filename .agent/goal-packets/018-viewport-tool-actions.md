# Goal Packet 018: Viewport Tool Actions

Status: complete

## Intent

Turn the viewport toolbar into real editor actions owned by a NexusEngine-style editor kit, not decorative buttons.

## User Need

The editor should feel like a production 3D editor: users can select a tool, then directly move, rotate, or scale the selected scene object from the viewport overlay.

## Acceptance Criteria

- Runtime installs `editor-selection-kit`.
- `editor-selection-kit` provides `editor:selection`, `editor:viewport-tools`, and `n:editor:selection`.
- Select, Move, Rotate, Scale, and Pan tools update persisted editor tool state.
- Move/Rotate/Scale expose compact axis controls that mutate the selected scene object's transform.
- Transform state survives editor project snapshot save/load.
- Exported HTML preserves the mutated scene object transform in the embedded manifest.
- The transform control panel does not overlap the Domain Stack, Sequence Timeline, or Configure panel in the desktop first view.

## Validation

- Intent smoke verifies runtime kit install order and viewport tool bindings.
- Playwright smoke clicks Move/Rotate/Scale and verifies the default cube transform changes.
- Live Playwright diagnostic verifies the served app can install a registry kit, mutate the default cube through viewport tools, and build HTML containing the installed kit and transform values.

## Ownership

- Owning kit: `editor-selection-kit`
- Runtime binding: `viewportTools`
- State path: `editorState.viewportTool`
- Domain path: `n:editor:selection`
