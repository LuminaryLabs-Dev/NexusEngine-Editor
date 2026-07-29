# NexusEngine Editor

Static viewport-first 3D web editor for Nexus Engine DSK projects.

The 3D scene viewport is primary. The editor uses a tiered, non-overlay workspace: all persistent surfaces own grid regions, resize within the window, and switch through bounded context tabs when space is limited.

- Game Structure - left region on wide windows and the Structure context on compact windows; add registered domains/subdomains/kits and stage atomic changes.
- Inspector - right region on wide windows and the Inspector context on compact windows; edit the selected domain, kit, object, or sequence step.
- Behaviors & Automation - collapsed bottom region on wide windows and the Behaviors context on compact windows; link and run manifest-driven sequences with retained receipts.

Project format `0.3.0` stores an accepted `nexusengine.composition-tree/1` plus a project-local registry overlay. Flat `domainStack`, `kitConfigs`, and object `domainKits` are derived compatibility projections, so existing templates, CLI commands, snapshots, and single-file HTML exports continue to work.

Composer behavior:

- `+ Add` filters Domain/Kit choices to valid children of the selected node.
- Apply validates the complete draft through NexusEngine and leaves the accepted tree unchanged on failure.
- Dirty or invalid drafts disable Run Once, Play, and Build.
- Run Once scopes to the selected kit, domain subtree, or root, resolves trusted factories from the already-loaded Engine module, uses a fresh Engine instance, records a receipt, and disposes it.
- Imported manifest-only kits never execute URLs or arbitrary methods; they report `Preview unavailable: no trusted provider`.
- Referenced nodes and nonempty domains cannot be removed silently.

The editor loads NexusEngine `0.0.3` from jsDelivr by default:

```txt
https://cdn.jsdelivr.net/gh/LuminaryLabs-Dev/NexusEngine@0.0.3/src/index.js
```

The `0.0.3` CDN build does not expose composition-tree APIs, so the deployed editor reports that composition support is unavailable instead of duplicating the Engine planner. Local integration tests may inject the sibling checkout from the same localhost origin:

```txt
http://127.0.0.1:<port>/NexusEngine-Editor/index.html?engine=/NexusEngine/src/index.js
```

Required editor features remain mapped through `editor-feature-contracts-kit`, which records the owning local editor kit, reused ProtoKit/Core source, required tokens, and provided tokens for each feature in exported manifests.

The same model/runtime can be driven from the terminal through the NexusGameKit-Link-style CLI:

```bash
npm run cli -- status
npm run cli -- templates
npm run cli -- interactive
npm run cli -- operations list
npm run cli -- operations submit playable-export --param input_project=/path/game.project.json --param output_dir=dist/games/my-game
npm run cli -- operations submit install-kit --param kit=audio-feedback-domain-kit --param project=dist/games/kit-project.project.json
npm run cli -- operations validate chess-game
npm run cli:chess
npm run cli:target-clicker
npm run cli:gem-collector
npm run mcp:screenshot
npm run mcp:game
```

`npm run cli:chess` creates a DSK-driven chess project and single-file game export at `dist/games/nexus-chess.html` plus `dist/games/nexus-chess.project.json`. The chess template is engine data: 64 square objects, 32 piece objects, a `n:game:chess` rules kit, and kit-linked sequence steps.

`npm run cli:target-clicker` creates a small playable target-clicker export at `dist/games/nexus-target-clicker.html` plus `dist/games/nexus-target-clicker.project.json`. The export includes target hit handling, score state, reset controls, and sequence receipts.

`npm run cli:gem-collector` creates a second playable interaction export at `dist/games/nexus-gem-collector.html` plus `dist/games/nexus-gem-collector.project.json`. Gem Collector and Target Clicker both use `n:runtime:interaction` with `runtimeClickable` object components and generic exported interaction APIs.

Code and registry-package installation is intentionally CLI-only. Browser runtimes expose `kitMutationMode: "read-only"`; adding an already-registered reference to the composition draft is safe browser project editing. Game templates that install code remain CLI-only in the browser.

`playable-export` is the exact-game export path for projects carrying `nexusengine.playable-project/1`. It copies the local runtime into a new or empty standalone folder, rejects symlinks and source/output nesting, omits authoring evidence and project-only files, and writes `nexus-playable-export.json` with project, contract, and content fingerprints. Manifest-only templates continue using the single-file DSK HTML builder.

`npm run mcp:screenshot` starts a standards-compliant stdio MCP server through
the optional NexusEngine Core MCP domain. The Node CLI/MCP dependency is pinned
to the exact NexusEngine `0.0.4` commit in `package-lock.json`; the browser CDN
remains on the static `0.0.3` fallback described above. Captures are written
under `.agent/screenshots/`. File-writing tools and `composition_apply` fail
closed unless `NEXUS_EDITOR_MCP_ALLOW_WRITES=1` is present in the server
process.

Editor MCP tools:

- `editor_project_status` - load a project through the authoritative CLI and return the accepted normalized state.
- `editor_playable_export` - run the authoritative exact-game export, launch it from a disposable local server, and return title-state screenshot proof.
- `editor_screenshot` - capture any editor or exported game URL.
- `editor_visual_status` - capture and return visible text, panel bounds, runtime snapshot, registry state, and manifest status.
- `editor_click_screenshot` - open a URL, click a selector or coordinate, then capture status plus screenshot.
- `editor_human_view_diagnostic` - screenshot-backed checks for viewport visibility, docked panels, CLI-only kit install, and loaded manifest.
- `editor_cli_game_screenshot` - run a CLI game/template operation, open the generated HTML, optionally click it, and return screenshot-backed status.
- `domains_list`, `domain_get`, `kits_list`, and `kit_explain` - inspect the trusted Engine/Editor registry without mutation.
- `composition_plan` - produce a stable, dependency-ordered composition plan.
- `composition_apply` - after explicit approval, validate and atomically replace the accepted Editor composition.

Composition MCP state defaults to
`.agent/mcp-output/editor-composition.project.json`; set
`NEXUS_EDITOR_MCP_PROJECT=/path/to/project.json` to select another project.
Apply receipts and Kit fingerprints are stored in the project. Repeating the
same plan, including after restarting the MCP process, returns the original
receipt without reinstalling. A changed executable behind an existing Kit ID
fails before project mutation. Receipts are readable at
`nexus-composition://receipts`.

`npm run mcp:game` is a separate opted-in game runtime proof. It installs the
Core MCP registry Kit and exposes only `game_status`, `game_step`,
`nexus-game://state`, and
the `play_example_game` prompt. `game_step` requires
`NEXUS_GAME_MCP_ALLOW_ACTIONS=1`. Existing Editor exports and games do not
install Core MCP and therefore receive no MCP runtime surface.

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
