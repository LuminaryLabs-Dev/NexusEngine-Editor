# Goal

Ship the initial NexusEngine Editor package to `LuminaryLabs-Dev/NexusEngine-Editor` on `main`.

Criteria:

- The downloaded editor package is present in the repo without committed dependencies.
- The web editor can build a DSK-driven game as a single HTML file in-browser.
- `npm run build` creates a static deploy artifact in `dist/`.
- GitHub Actions deploys the editor to GitHub Pages from `main`.
- Existing smoke checks pass locally before push.
