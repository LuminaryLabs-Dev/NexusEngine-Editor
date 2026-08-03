# Contributing

NexusEngine Editor is a static, browser-native 3D editor. Changes must preserve
its viewport-first, non-overlay workspace and registry/composition boundaries.

## Setup

The deployment workflow uses Node.js 22.

```bash
npm ci
npm test
```

## Guidelines

- Follow the existing native ES module style and surrounding formatting.
- Keep browser dependencies limited and the static build deployable to GitHub Pages.
- Preserve project format `0.4.0`, Composition registry v3, and legacy compatibility projections.
- Keep NexusEngine registry/planning truth separate from Editor draft/UI state.
- Treat imported manifest records as untrusted executable content.
- Keep browser kit mutation read-only and code installation CLI-only.
- Preserve atomic Apply and block execution from invalid or dirty drafts.
- Keep primary controls visible and advanced controls in existing menus/foldouts.
- Verify wide, compact, and narrow layouts for UI changes.

## Validation

Use the smallest relevant existing check, then run the full suite before review:

```bash
npm run smoke:intent
npm run build
npm run smoke:playwright
npm test
```

`dist/`, browser artifacts, screenshots, traces, diagnostics, and MCP output are
generated local data and must remain untracked.

Describe project-format, export, security, and compatibility effects in the
review request. The browser and Node Engine pins move together only through an
explicit release-integration change with exact artifact proof.
