# Scene Authoring Presets

Status: active

## Objective

Make large-scene creation intentional by adding structured authoring presets instead of only raw cube batches.

## Target Experience

- Configure panel keeps presets inside the compact scene authoring overlay.
- Users choose a scene preset from a dropdown and apply it with the existing batch size.
- Presets stamp many scene objects with stable labels, roles, components, and Domain Service Kit assignments.
- Physics presets assign `n:physics` and physics components during creation.
- Save, Load, Build HTML, and export preserve preset runs and generated object metadata.

## Acceptance Proof

- Intent smoke applies `physics-stress-grid-preset`, verifies generated object count, kit assignments, preset components, and export manifest preservation.
- Playwright smoke applies the preset through the visible Configure panel, verifies a 397-object scene, saves/loads it, and confirms exported manifest metadata.
- Live Playwright diagnostic captures desktop/mobile proof outside the repo and verifies no Playwright artifacts are stored in the repo.
