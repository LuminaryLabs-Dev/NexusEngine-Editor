# Project Persistence Snapshots

Status: active

## Objective

Make Save and Load real project persistence controls so large scenes and kit graphs survive reloads.

## Target Experience

- The command strip exposes Save and Load.
- Save writes a versioned editor project snapshot to local browser storage.
- Load restores project data, selected domain/object/sequence step, panel positions, and current filter state.
- The status pill reports Saved, Loaded, No Save, or Ready.
- Saved large scenes keep object transforms, kit assignments, domain stack data, and sequence links.

## Acceptance Proof

- Intent smoke verifies `editor-project-persistence-kit`, save snapshot creation, restore, and 27-object project preservation.
- Playwright smoke verifies Save/Load restores a saved 27-object project after adding a temporary 28th object.
- Live Playwright verifies HTTP reload persistence: Save writes localStorage, reload starts default, Load restores 27 objects and `cube-02` physics assignment.
