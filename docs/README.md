# Documentation

NexusEngine Editor composes registered Domains and Kits through a viewport-first
browser workspace, then validates, previews, persists, or exports the accepted
project.

## Guides

- [Architecture](./ARCHITECTURE.md) - component ownership and runtime boundaries.
- [Operations](./OPERATIONS.md) - local build, CLI, MCP, and deployment behavior.
- [Visual identity](./VISUAL-IDENTITY.md) - approved repository assets and meaning.
- [Repository overview](../README.md) - quick start and public status.
- [Contributing](../CONTRIBUTING.md) - change and validation expectations.
- [Security](../SECURITY.md) - trust and mutation boundaries.

## Core flow

```text
registered Domains and Kits
  -> staged composition draft
    -> complete-tree validation
      -> accepted project
        -> preview, play, persistence, or export
```

Historical implementation evidence and active goals live under `.agent/`.
Current source and runtime checks remain authoritative.
