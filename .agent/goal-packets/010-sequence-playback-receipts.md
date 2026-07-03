# Sequence Playback Receipts

Status: active

## Objective

Make Sequence Timeline steps execute against installed kit manifests and leave proof that kits were driven in order.

## Target Experience

- User can run the selected sequence step from the bottom overlay.
- User can run the full ordered sequence from the bottom overlay or top Play control.
- Playback status shows idle, running, complete, or blocked.
- Each step execution creates a compact receipt with source kit, event, target kit, target output, status, and timestamp.
- Save and Load restore playback status and retained receipts.
- Build HTML exports a static runtime with `runSequence()` and `sequenceReceipts` for the playable game file.

## Acceptance Proof

- Intent smoke runs a single linked step, then the full sequence, and confirms delivered receipts persist through Save/Load.
- Playwright smoke runs Step and Sequence from the UI, confirms complete playback, saves/loads receipts, and verifies exported runtime receipts.
- Live Playwright diagnostic runs the local editor and exported game through Chromium, captures screenshots outside the repo, and confirms no Playwright artifacts are stored in the repo.
