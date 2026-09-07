# Changelog

This initial record documents the current repository snapshot without inferring
historical release dates or npm publication.

## Unreleased

- Viewport-first static editor with responsive docked workspaces.
- Project format `0.4.0` and Composition registry v3-backed trees.
- Atomic Apply, trusted disposable previews, Play, and retained receipts.
- Scene authoring, presets, templates, sequence playback, and project persistence.
- Single-file game builds and standalone playable-project exports.
- CLI operations for status, validation, templates, kit installation, and games.
- Opt-in editor/composition MCP tooling and an isolated example game MCP runtime.
- Browser read-only kit mutation and explicit MCP write/action gates.
- Editor-owned file-backed Headless host exported separately from Engine Core.
- Exact NexusEngine `16aee598c06efcb7b511e4827ee3f7e23ce3549b` dependency and browser pin.
- Manual-only GitHub Pages deployment through `workflow_dispatch`.

## Compatibility

- Browser, CLI, MCP, and tests use the same exact NexusEngine `0.0.4` commit.
- Legacy flat project data is retained through derived compatibility projections.

No GitHub release tags or formal release chronology are currently published.

## Authoring integration

- Added the required real Engine Authoring host, source transactions, journal/checkpoint recovery and default local CLI.
- Added Canvas controls and an independent Three viewport, worker jobs, GLB/PNG delivery with Khronos validation, reproducible donut/mechanical/organic recipes and bounded batch recovery.
- Added strict nine-stage development evidence adapters, integrated browser and command tests, and representative workload benchmarks.
- Documented supported profiles in `AUTHORING.md`; legacy project format and static Editor remain available.
