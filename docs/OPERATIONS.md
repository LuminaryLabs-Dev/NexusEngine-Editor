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

## Browser compatibility

The public browser currently loads NexusEngine `0.0.3`, which does not provide
the composition APIs used by the current Composer. Local integration uses a
same-origin `?engine=` override and the pinned `0.0.4` dependency. Do not change
the browser pin as routine maintenance.

## Deployment

Pushes to `main` and manual workflow dispatch run `npm test`, upload `dist/`, and
deploy GitHub Pages at:

https://luminarylabs-dev.github.io/NexusEngine-Editor/

There is no documented rollback procedure. Verify the workflow and public page
after every integrated documentation or application change.
