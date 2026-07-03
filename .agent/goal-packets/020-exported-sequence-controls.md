# Goal Packet 020: Exported Sequence Controls

Status: complete

## Intent

Make the generated single-file game prove its kit-driven sequence flow visibly, not only through a hidden JavaScript API.

## User Need

When the editor builds a DSK-driven game, the exported HTML should let a user run the kit sequence and inspect delivery receipts from the game file itself.

## Acceptance Criteria

- Generated HTML keeps exposing `window.__NEXUS_DSK_GAME__.runSequence()`.
- Generated HTML includes a visible `Run Sequence` control.
- Generated HTML shows a sequence receipt count.
- Generated HTML renders recent sequence receipts with source event and target kit/output.
- Receipt rendering uses DOM text nodes rather than raw manifest string HTML.
- The generated runtime still reports large-scene render stats and culling.

## Validation

- Intent smoke verifies generated HTML contains the sequence playback surface.
- Playwright smoke builds a massive template game, opens the generated HTML, clicks `Run Sequence`, and verifies receipt count plus `audioFeedback.cued` receipt text.

## Ownership

- Owning kit: `editor-html-build-kit`
- Builder surface: `src/dsk-html-builder.js`
- Runtime API: `window.__NEXUS_DSK_GAME__.runSequence()`
