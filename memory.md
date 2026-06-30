# NexusEngine Editor Memory

Purpose:

- Host a static NexusEngine web editor that keeps the game viewport primary while exposing DSK kit inspection, proof events, and HTML game export.

Architecture shape:

- `index.html` loads the app directly as browser ES modules.
- `src/kits/editor-kits.js` owns editor kit descriptors and lightweight state.
- `src/dsk-html-builder.js` owns the shared browser/Node builder for single-file DSK-driven game HTML.
- `scripts/build-static-site.mjs` creates the GitHub Pages artifact in `dist/`.
- `.github/workflows/deploy-editor.yml` runs tests and deploys `dist/` from `main` using GitHub Pages Actions.

Conventions:

- Keep the editor static-first and dependency-light.
- Treat generated game exports as single HTML files with embedded DSK manifests.
- Keep advanced controls behind docks or details; the first screen should stay focused on viewport, play/stop, build, and download.
- Do not commit `dist/` or `node_modules/`.
