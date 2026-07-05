# Goal Packet 022: NexusEngine Feature Contracts

Status: implemented

## Intent

Make every required editor feature traceable to a Domain Service Kit contract instead of leaving ownership implicit in UI code.

## Domain

- Primary domain: `n:editor:feature-contracts`
- Owning kit: `editor-feature-contracts-kit`
- Runtime binding: `featureContracts`

## Reuse / Compose / Create

- Reuse NexusEngine `0.0.3` through the jsDelivr CDN for runtime composition when available.
- Reuse discovered ProtoKit source paths for adjacent registry, scene recipe, renderer, input, selection, and sequence concepts.
- Create a local editor kit only for the host-editor feature ownership map because the searched kits do not contain a complete NexusEngine Editor UI contract graph.

## Acceptance Proof

- Runtime install order includes `editor-feature-contracts-kit` before registry/install/editor feature kits.
- `featureContracts.validate()` passes for the required first-screen editor capability list.
- `buildEditorExportManifest()` and normalized generated game manifests preserve `featureContracts` and `featureContractValidation`.
- Intent and Playwright smoke tests assert the feature-contract map is present and valid.
