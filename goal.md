# Goal

Build NexusEngine Editor into a usable browser-based 3D game editor that matches the `.agent` reference image.

Criteria:

- First view is a 3D engine editor, not a hero page: full viewport grid, default cube, camera/light markers, transform gizmo, and top command strip.
- Save and Load persist/restore the project snapshot for large scenes and kit graphs.
- New resets the current browser project back to the starter scene so loop testing can delete a game and start again.
- Selecting `n:persistence` exposes project `.json` export/import controls for portable editor snapshots.
- Left docked panel manages the Domain Stack and supports a visible registry-backed kit dropdown plus reordering, while kit install mutations happen through CLI only.
- Registry-backed kit selections show dependency/sub-kit context before install.
- Left floating panel supports large kit graphs through installed-kit search, Stack/Map modes, and dependency health.
- Right docked panel configures the selected domain service kit.
- Right docked panel can also configure selected scene objects and their transforms.
- Viewport toolbar tools can select, move, rotate, and scale the selected scene object through runtime-backed controls.
- Right docked panel supports larger scenes with object stats, object search, add-25 grid batches, duplicate, and delete.
- Right docked panel supports massive scene batches with visible-result limits and hidden-object counts.
- Right docked panel supports structured scene presets for stamping large object fields with roles, components, and kit assignments.
- Right docked panel supports Game Templates that install kits, stamp massive scenes, wire sequence steps, and tune build/viewport budgets in one action.
- Right docked panel can assign the selected Domain Stack kit to one object or filtered visible objects.
- Bottom docked panel manages a Sequence Timeline where steps can be added and linked to kit events.
- Selecting a Sequence Timeline step opens a right-panel Configure inspector for its label, source event, target output, run action, and validation.
- Sequence links are selectable as source kit/event -> target kit/output and export with `sequenceGraph` validation metadata.
- Sequence playback runs selected steps or the full sequence, records receipts, and persists them through Save/Load.
- Built HTML exposes `runSequence()` and `sequenceReceipts` so exported games can prove kit-driven sequence flow.
- Built HTML includes visible sequence playback controls and receipt output in the generated game page.
- Built HTML uses a scalable canvas runtime with render stats/culling while preserving the full embedded manifest.
- Build profile controls let the user configure exported renderer, draw budget, and culling from the `n:build:web` kit.
- Viewport profile controls let the user configure editor WebGL draw budget and culling from the `n:render:three` kit.
- The web editor can build a DSK-driven 3D scene/game as a single HTML file in-browser.
- The terminal CLI can apply the Chess Board template, validate sequence links, and export `.html` plus `.project.json` using the same runtime model as the browser editor.
- The terminal CLI can apply the Target Clicker template, validate sequence links, and export a clickable target game as `.html` plus `.project.json`.
- A screenshot-based MCP-style service can capture and summarize the running editor for agent/human-view validation.
- `npm run build` creates a static deploy artifact in `dist/`.
- GitHub Actions deploys the editor to GitHub Pages from `main`.
- Existing smoke checks and Playwright human-view checks pass locally before push.
