# Goal Packet 019: Game Template Authoring

Status: complete

## Intent

Make the editor produce a large DSK-driven game setup from one compact authoring action instead of requiring users to manually install kits, stamp objects, wire sequences, and tune build budgets one step at a time.

## User Need

The web editor should be able to make massive games, not only edit individual objects or apply raw scene presets.

## Acceptance Criteria

- Runtime installs `editor-game-template-kit`.
- `editor-game-template-kit` provides `editor:game-template` and `n:editor:game-template`.
- Scene Configure exposes a compact Game Template selector and `Make Game` action.
- Applying a template installs required registry kits and bundles through the existing kit installer.
- Applying a template stamps a large structured scene through the existing preset/object model.
- Applying a template adds manifest-driven sequence links for the installed kits.
- Applying a template updates editor viewport and HTML build budgets for large scenes.
- Project snapshots and generated HTML preserve `scene3d.gameTemplates` metadata.

## Validation

- Intent smoke applies `streaming-terrain-cargo-template`, verifies installed kits, 720 generated objects, runtime budgets, valid sequence links, and generated HTML metadata.
- Playwright smoke uses the visible `Make Game` control to create a 1,037-object `massive-defense-arena-template` project and verifies build output, game-template metadata, installed kits, and sequence validity.

## Ownership

- Owning kit: `editor-game-template-kit`
- Runtime binding: `gameTemplate`
- State path: `editorState.gameTemplateView`
- Manifest path: `scene3d.gameTemplates`
- Domain path: `n:editor:game-template`
