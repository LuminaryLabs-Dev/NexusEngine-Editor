# Manifest Driven Sequence Events

Status: active

## Objective

Make the Sequence Timeline link real installed kit events and outputs instead of toggling placeholder targets.

## Target Experience

- The selected sequence step exposes compact dropdowns for source kit, source event, target kit, and target output.
- Source event choices come from the selected installed kit config/manifest.
- Target output choices come from the selected installed kit config/manifest.
- `Link Event` records the selected event/output link on the sequence step.
- `Validate` checks source domains, events, target domains, and target outputs.
- Exported manifests preserve `event`, `targetDomainPath`, `targetOutput`, and `sequenceGraph` validation data.

## Acceptance Proof

- Intent smoke verifies sequence option discovery, link updates, validation, and HTML export preservation.
- Playwright smoke selects `n:audio-feedback` -> `audioFeedback.cued` -> `n:build:web` -> `export:html`.
- Live diagnostic installs the `spatial-authoring-kits` bundle, links `n:selection` / `selection.changed` to `n:build:web` / `export:html`, and validates a clean `sequenceGraph`.
