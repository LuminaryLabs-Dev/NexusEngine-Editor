# NexusEngine Editor

Static viewport-first 3D web editor for Nexus Engine DSK projects.

The 3D scene viewport is primary. The editor starts with a grid, default cube, camera marker, transform gizmo, and three compact docked overlay panels:

- Domain Stack - docked top-left; select, filter, map, reorder, and inspect Domain Service Kits from a visible registry dropdown with dependency and sub-kit previews.
- Configure - edit the selected kit, scene object, or sequence step settings, tune `n:render:three` viewport draw budgets, export/import project files from `n:persistence`, assign kits to one or filtered objects, search objects, apply structured scene presets, make massive game templates, add configurable cube grids, window large object lists, duplicate/delete objects, and tune transforms.
- Sequence Timeline - docked bottom; add steps, link source kit events to target kit outputs from installed kit manifests, and run kit-driven sequences with retained receipts.

The command strip can play the sequence, create a new starter project, save and load a versioned project snapshot in browser storage, and build a single-file HTML game export with configurable canvas runtime budgets, render stats, game-template metadata, visible sequence playback controls, and `runSequence()` receipts. Selecting `n:persistence` in the Domain Stack exposes portable `.project.json` export/import controls for moving large scenes and kit graphs between sessions or browsers.

The editor loads NexusEngine `0.0.3` from jsDelivr by default:

```txt
https://cdn.jsdelivr.net/gh/LuminaryLabs-Dev/NexusEngine@0.0.3/src/index.js
```

If the CDN module is unavailable, the editor uses a local compatible composer so the static editor still runs. Required editor features are mapped through `editor-feature-contracts-kit`, which records the owning local editor kit, reused ProtoKit/Core source, required tokens, and provided tokens for each feature in exported manifests.

The same model/runtime can be driven from the terminal through the NexusGameKit-Link-style CLI:

```bash
npm run cli -- status
npm run cli -- templates
npm run cli -- interactive
npm run cli -- operations list
npm run cli -- operations submit install-kit --param kit=audio-feedback-domain-kit --param project=dist/games/kit-project.project.json
npm run cli -- operations validate chess-game
npm run cli:chess
npm run cli:target-clicker
npm run cli:gem-collector
npm run mcp:screenshot
```

`npm run cli:chess` creates a DSK-driven chess project and single-file game export at `dist/games/nexus-chess.html` plus `dist/games/nexus-chess.project.json`. The chess template is engine data: 64 square objects, 32 piece objects, a `n:game:chess` rules kit, and kit-linked sequence steps.

`npm run cli:target-clicker` creates a small playable target-clicker export at `dist/games/nexus-target-clicker.html` plus `dist/games/nexus-target-clicker.project.json`. The export includes target hit handling, score state, reset controls, and sequence receipts.

`npm run cli:gem-collector` creates a second playable interaction export at `dist/games/nexus-gem-collector.html` plus `dist/games/nexus-gem-collector.project.json`. Gem Collector and Target Clicker both use `n:runtime:interaction` with `runtimeClickable` object components and generic exported interaction APIs.

Kit installation is intentionally CLI-only. The browser Domain Stack shows the registry and the exact `install-kit` command to run, but does not mutate the kit graph from an install button. Browser runtimes expose `kitMutationMode: "read-only"` and reject direct registry install calls; the CLI opts into `kitMutationMode: "cli"`. Game templates that install kits are also CLI-only in the browser; the Scene panel shows the exact `game-template` command instead of applying the template directly.

`npm run mcp:screenshot` starts a stdio JSON-RPC MCP-style screenshot service. Captures are written under `.agent/screenshots/`.

Screenshot MCP tools:

- `editor_screenshot` - capture any editor or exported game URL.
- `editor_visual_status` - capture and return visible text, panel bounds, runtime snapshot, registry state, and manifest status.
- `editor_click_screenshot` - open a URL, click a selector or coordinate, then capture status plus screenshot.
- `editor_human_view_diagnostic` - screenshot-backed checks for viewport visibility, docked panels, CLI-only kit install, and loaded manifest.
- `editor_cli_game_screenshot` - run a CLI game/template operation, open the generated HTML, optionally click it, and return screenshot-backed status.

Core commands:

```bash
npm ci
npm test
npm run build
npm run build:game
npm run cli:chess
npm run cli:target-clicker
npm run cli:gem-collector
```

Outputs:

- `dist/index.html` - static editor for GitHub Pages.
- `dist/games/starter-game.html` - single-file DSK-driven 3D scene HTML export.

Deployment:

- `.github/workflows/deploy-editor.yml` builds and deploys `dist/` to GitHub Pages on pushes to `main`.
