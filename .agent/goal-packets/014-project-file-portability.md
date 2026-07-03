# Project File Portability

Status: active

## Objective

Make editor projects portable across browsers and machines with explicit `.project.json` export/import controls owned by the persistence domain.

## Target Experience

- `n:persistence` appears in the Domain Stack as a selectable core Domain Service Kit.
- Selecting `n:persistence` opens compact Configure controls for Save Local, Load Local, Export Project, and Import Project.
- Export Project downloads a versioned editor snapshot as `.project.json`.
- Import Project restores the same snapshot shape as local Load.
- Large scenes, selected domain/object/step, panel positions, filters, kit graphs, sequence links, and playback receipts survive the file round trip.

## Ownership

- Domain: `n:persistence`
- Owning kit: `editor-project-persistence-kit`
- Snapshot surface: `createEditorProjectSnapshot()` / `applyEditorProjectSnapshot()`

## Acceptance Proof

- Intent smoke exports a 277-object project file, mutates the scene, imports the file, and verifies the 277-object project returns.
- Playwright smoke exports a 397-object project file from the visible Persistence panel, adds a temporary object, imports the file, and verifies the 397-object project returns.
- Live Playwright diagnostic verifies the same flow on `http://127.0.0.1:4174/` with screenshots outside the repo.
