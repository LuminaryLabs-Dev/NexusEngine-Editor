# Operations

## Local setup

The GitHub Pages workflow uses Node.js 22.

```bash
npm ci
npm test
```

`npm test` runs the intent smoke, creates `dist/`, and runs the Playwright editor
matrix. `dist/` is generated and ignored.

## Builds

```bash
npm run build
npm run build:game
```

The first command builds the static editor. The second creates the starter
single-file game at `dist/games/starter-game.html`.

## CLI operations

```bash
npm run cli -- status
npm run cli -- templates
npm run cli -- operations list
npm run cli -- operations describe <operation>
npm run cli -- operations validate <operation> --param key=value
npm run cli -- operations submit <operation> --param key=value
```

Validation plans an operation without normal writes. Submission performs its
declared writes. Inspect an operation before supplying parameters.

`playable-export` requires a playable-project descriptor and a new or empty
destination outside the source tree. It rejects symlinks and unsafe paths.

## MCP

```bash
npm run mcp:screenshot
npm run mcp:game
```

Read `nexus-editor://capabilities` before calling editor tools. File-writing
tools and composition Apply require `NEXUS_EDITOR_MCP_ALLOW_WRITES=1` in the
server process. The composition project defaults under `.agent/mcp-output/` and
can be redirected with `NEXUS_EDITOR_MCP_PROJECT`.

The game MCP example is isolated from normal editor output and requires
`NEXUS_GAME_MCP_ALLOW_ACTIONS=1` for state changes.

## Browser Compatibility

The browser, CLI, MCP, and tests use NexusEngine `0.0.4` commit
`58fa721db73992d77d6866b282494a559f0ec13c`. Local integration may use the
same-origin `?engine=` override, but it must resolve the exact installed package
and never a sibling checkout or symlink.

## Deployment

Only a manual workflow dispatch runs `npm test`, uploads `dist/`, and deploys
GitHub Pages at:

https://luminarylabs-dev.github.io/NexusEngine-Editor/

Source pushes do not deploy. There is no documented rollback procedure. Verify
the workflow and public page after every explicitly approved deployment.
