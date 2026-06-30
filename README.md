# NexusEngine Editor

Static full-viewport web editor shell for Nexus Engine / NexusRealtime DSK projects.

The game viewport is primary. The editor exposes one header and three pull-off docks: Kits, Inspector, and Proof.

Core commands:

```bash
npm ci
npm test
npm run build
npm run build:game
```

Outputs:

- `dist/index.html` - static editor for GitHub Pages.
- `dist/games/starter-game.html` - single-file DSK-driven game HTML export.

Deployment:

- `.github/workflows/deploy-editor.yml` builds and deploys `dist/` to GitHub Pages on pushes to `main`.
