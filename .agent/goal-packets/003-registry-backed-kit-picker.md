# Registry Backed Kit Picker

Status: active

## Objective

Replace blind `+ Kit` insertion with a NexusEngine ProtoKits-style registry and installer flow.

## Target Experience

- Domain Stack shows a compact registry picker by default.
- Picker prioritizes the kit dropdown, then supports search and domain/category filters.
- Selected kits show provides, requires, compatible providers, and child/sub-kits.
- Install Kit adds the selected registry manifest to the Domain Stack.
- Install Bundle adds the selected composite kit and its child kits.
- Exported HTML manifests preserve installed `kitId`, requires, provides, and child kit metadata.

## Acceptance Proof

- Playwright opens the picker, selects `audio-feedback-domain-kit`, installs it, and sees `n:audio-feedback`.
- Diagnostic Playwright opens `spatial-authoring-kits`, confirms child kits, installs the bundle, and sees child manifests in export data.
