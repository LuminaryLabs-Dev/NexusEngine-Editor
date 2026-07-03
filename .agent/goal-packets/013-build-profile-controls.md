# Build Profile Controls

Status: active

## Objective

Make massive-game export settings configurable from the editor instead of hardcoded inside the HTML builder.

## Target Experience

- Selecting `n:build:web` in the Domain Stack opens build/runtime controls in Configure.
- User can choose renderer, max drawn object budget, and culling mode.
- The runtime budget is stored in the `n:build:web` kit config.
- Build HTML embeds the selected budget in the exported manifest.
- Exported games use that budget for render stats and culling.

## Ownership

- Domain: `n:build:web`
- Owning kit: `editor-html-build-kit`
- UI surface: Configure overlay for selected `n:build:web`
- Manifest surface: `runtime` in `buildEditorExportManifest()`

## Acceptance Proof

- Intent smoke verifies build-profile runtime config flows from project kit config to normalized game manifest and generated HTML.
- Playwright smoke selects `n:build:web`, changes max drawn objects, builds HTML, and verifies the exported manifest/runtime string uses the selected budget.
- Live Playwright diagnostic builds a 1001-object game with a custom draw budget, opens the generated HTML, and verifies draw/cull stats outside the repo.
