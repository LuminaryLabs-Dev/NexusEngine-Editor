# Workflow

Status: active

## Purpose

Coordinate NexusEngine Editor work through `.agent` while implementing the viewport-first 3D editor.

## Operating Rules

- Read this `.agent` workspace before planning or editing.
- Implementation is active under the current goal.
- Preserve the viewport-first design: the 3D scene owns the screen.
- Treat panels as compact draggable overlays pulled in from screen edges, not full sidebars.
- Validate user-visible changes with Playwright and screenshots.
- Keep generated `dist/`, `node_modules/`, Playwright reports, traces, videos, and diagnostics out of commits.

## Validation Expectations

- Local: `npm test`
- Static build: `npm run build`
- Browser proof: Playwright verifies the live 3D editor first screen, panel interactions, sequence timeline, and build/export path.
- Public proof: GitHub Pages check remains separate from local checks.
