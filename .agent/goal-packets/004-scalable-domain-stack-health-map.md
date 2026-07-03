# Scalable Domain Stack Health Map

Status: active

## Objective

Make the Domain Stack usable for larger kit-composed games by adding filtering, map mode, and dependency health.

## Target Experience

- The Domain Stack shows installed kit count, provider count, and missing dependency count.
- Users can filter installed kits by domain path, kit id, provider token, or require token.
- Users can switch between compact Stack view and grouped Map view.
- Map view groups installed kits by category and shows input/output/sub-kit counts.
- Dependency health marks missing `requires` tokens when the installed stack does not provide them.
- Exported HTML manifests preserve `domainStackHealth`.

## Acceptance Proof

- Intent smoke verifies health calculation, installed-stack filtering, missing-dependency detection, and manifest health export.
- Playwright verifies installed-stack filtering and map mode through the visible editor UI.
- Live diagnostic verifies a spatial-authoring bundle reaches 13 installed kits, 27 provider tokens, and zero missing dependencies.
