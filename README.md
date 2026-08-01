# NexusEngine Editor

![NexusEngine Editor social card](./docs/assets/brand/social-card.png)

NexusEngine Editor is a static, viewport-first 3D web editor for composing
Domain Service Kit (DSK) projects and exporting browser-playable HTML.

[Open the public editor](https://luminarylabs-dev.github.io/NexusEngine-Editor/)

## What it provides

- A native WebGL viewport kept primary across desktop and compact layouts.
- Docked Game Structure, Inspector, and Behaviors workspaces with no persistent overlays.
- Registry-backed Domain and Kit composition with staged, atomic Apply.
- Project format `0.3.0` with portable snapshots and legacy compatibility projections.
- Scene objects, transforms, camera controls, presets, templates, sequences, and receipts.
- Single-file DSK HTML builds and standalone playable-project exports.
- CLI operations for inspection, validation, templates, kit installation, and export.
- Opt-in MCP servers for editor diagnostics/composition and an example game runtime.

## Compatibility status

The browser currently loads NexusEngine `0.0.3` from jsDelivr. That build does
not expose the composition-tree APIs required by the current registry Composer,
so the public editor reports composition support as unavailable rather than
duplicating Engine planning behavior.

Node CLI, MCP, and integration checks use the exact NexusEngine `0.0.4` commit
pinned in `package-lock.json`. Local browser integration can inject a compatible
same-origin Engine module through the documented `?engine=` override.

## Quick start

The deployment workflow uses Node.js 22.

```bash
npm ci
npm test
npm run build
```

The static site is written to `dist/`. Build the starter single-file game with:

```bash
npm run build:game
```

This creates `dist/games/starter-game.html`.

## Editor workflow

```text
select registered Domains and Kits
  -> stage composition changes
    -> validate the complete draft
      -> Apply atomically
        -> preview, play, save, or export
```

Dirty or invalid drafts disable Run Once, Play, and Build. Browser users can
add already-registered references, but code and registry-package installation
remain CLI-only. Imported manifest-only kits do not receive executable trust.

## CLI

```bash
npm run cli -- status
npm run cli -- templates
npm run cli -- operations list
npm run cli -- operations describe playable-export
npm run cli:chess
npm run cli:target-clicker
npm run cli:gem-collector
```

`playable-export` handles projects carrying a
`nexusengine.playable-project/1` descriptor. It writes a standalone folder,
rejects unsafe paths and symlinks, and records export fingerprints. Manifest-only
templates continue to use the single-file DSK HTML builder.

## MCP boundaries

```bash
npm run mcp:screenshot
npm run mcp:game
```

The editor MCP server exposes status, screenshot-backed diagnostics, registry
discovery, composition planning, and approved composition application. File
writes and `composition_apply` fail closed unless the server process has
`NEXUS_EDITOR_MCP_ALLOW_WRITES=1`.

The separate example game MCP runtime is not installed into normal exports. Its
state-changing tool requires `NEXUS_GAME_MCP_ALLOW_ACTIONS=1`.

## Architecture map

- `src/editor-domain-model.js` - project, scene, sequence, template, and export data.
- `src/editor-composition.js` - migration, staged edits, validation, preview, and Play.
- `src/editor-composition-mcp.js` - Core Composition MCP bridge and persisted receipts.
- `src/nexus-engine-editor-runtime.js` - ordered editor runtime kits and bindings.
- `src/editor-kit-registry.js` - kit manifests and registry snapshots.
- `src/viewport-webgl.js` - dependency-free WebGL viewport.
- `src/dsk-html-builder.js` - browser/Node single-file game builder.
- `scripts/nexus-engine-editor-cli.mjs` - project and export operations.

## Documentation

- [Documentation map](./docs/README.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Operations](./docs/OPERATIONS.md)
- [Visual identity](./docs/VISUAL-IDENTITY.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

## Validation and deployment

```bash
npm test
```

The test command runs the intent smoke, static build, and Playwright editor
matrix. Pushes to `main` run the same checks and deploy `dist/` to GitHub Pages.

## License

No license file is currently present. Public repository visibility does not by
itself grant permission to copy, modify, or redistribute the code.
