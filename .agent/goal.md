# Goal

Status: active

## Goal

Build NexusEngine Editor into a usable browser-based 3D game-engine editor that matches the saved 3D Domain Service Kit editor reference.

## Success Criteria

- First screen is a full-screen 3D viewport with a grid and default cube.
- Viewport includes clear 3D engine affordances: transform gizmo, axis widget, camera/grid cues.
- Top command strip supports scene identity, play, stop, save, build HTML, export, and readiness.
- Save and Load persist and restore versioned project snapshots for large scenes and kit graphs.
- New resets the current browser project to the starter scene so a game loop can be deleted and restarted from the UI.
- Selecting `n:persistence` exposes portable project `.json` export/import controls for moving large editor snapshots between sessions or browsers.
- Left Domain Stack is compact and docked top-left, and supports adding, reordering, and stringing domains/kits.
- Domain Stack shows a registry-backed dropdown that shows selectable kits, dependencies, sub-kits/domains, and CLI install commands, while browser install buttons are absent.
- Domain Stack supports large kit graphs through installed-kit filtering, map mode, and dependency health.
- Right Configure panel is compact and docked top-right, and edits the selected domain, kit, object, or sequence step.
- Selecting a Sequence Timeline step opens a Configure inspector for editing its label, source event, target output, run action, and validation.
- Bottom Sequence Timeline is compact and docked bottom, and supports adding sequence steps and linking kit events.
- Sequence Timeline links use installed kit manifests/configs for source kit, event, target kit, and output dropdowns.
- Scene authoring supports adding/selecting multiple 3D objects and editing object transforms.
- Viewport toolbar tools support runtime-backed select, move, rotate, and scale actions for the selected scene object.
- Scene authoring supports object search, compact scene stats, bulk grid creation, duplicate, and delete for larger scenes.
- Scene authoring supports configurable large grid batches and visible-result windowing for hundreds of objects.
- Scene authoring supports structured presets that stamp many objects with roles, components, and kit assignments.
- Scene authoring supports Game Templates that install registry kits, stamp massive scenes, wire sequence links, and tune build/viewport budgets.
- Chess authoring is available as a Game Template that builds board squares, pieces, rules metadata, and move/export sequence links as editor scene data.
- Target Clicker authoring is available as a Game Template that builds targets, score metadata, hit/reset runtime behavior, and export sequence links as editor scene data.
- Selected Domain Service Kits can be assigned to one object or the current filtered visible object set.
- Sequence steps can drive kits in order with playback receipts in the editor.
- Exported HTML exposes a sequence runner and receipts for the playable static game.
- Exported HTML exposes visible sequence playback controls and receipt output inside the generated game page.
- Exported HTML uses a scalable canvas runtime with render stats and culling proof for large scenes.
- Build profile controls configure exported renderer, max drawn object budget, and culling mode from `n:build:web`.
- Viewport profile controls configure editor WebGL draw budget and culling mode from `n:render:three`.
- Build/export still produces a playable static HTML game.
- CLI operation commands can validate and export the chess game without opening the browser.
- Screenshot-based MCP tools can capture and inspect the editor visually for validation.
- UI is validated with Playwright screenshots on desktop and mobile.

## Non-Goals

- Do not build a generic landing page.
- Do not build a 2D-only platformer editor.
- Do not make fixed opaque sidebars.
- Do not store Playwright reports, traces, videos, or diagnostics in the repo.

## Reference Image

![Target 3D Domain Service Kit Editor](references/target-3d-domain-service-kit-editor.png)
