# Sequence Step Inspector

Status: active

## Objective

Make the right Configure panel edit selected Sequence Timeline steps directly, not only the selected Domain Service Kit.

## Target Experience

- Clicking a sequence step switches Configure into a compact sequence-step inspector.
- The inspector edits the step label without losing it when the source kit changes.
- The inspector exposes source kit, source event, target kit, and target output dropdowns from installed kit manifests.
- The inspector can link, run, and validate the selected step without requiring the user to use only the bottom panel.
- Edited step labels and links persist into project snapshots and exported manifests.

## Ownership

- Domain: `n:editor:sequence-timeline`
- Owning kit: `editor-sequence-timeline-kit`
- Model surface: `updateSequenceStepLink()`
- UI surface: Configure overlay when `configureSubject` is `sequence-step`

## Acceptance Proof

- Intent smoke updates a step label and verifies the manifest-driven link remains valid.
- Playwright smoke adds a sequence step, edits it from the Configure panel, validates the sequence, and confirms the exported manifest preserves the label and link.
- Live Playwright diagnostic verifies the right-panel inspector on `http://127.0.0.1:4174/` with screenshots outside the repo.
