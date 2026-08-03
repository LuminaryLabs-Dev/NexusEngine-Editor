# Architecture

## Runtime shape

```text
index.html
  -> src/main.js
    -> project and composition state
    -> ordered editor runtime Kits
    -> docked workspace and WebGL viewport
    -> persistence, preview, Play, and export

CLI or MCP
  -> the same model/runtime boundaries
  -> validated project, template, export, or composition operation
```

The browser is static and dependency-light. Node tooling supplies builds, CLI
operations, MCP automation, intent checks, and Playwright validation.

## Ownership

| Component | Responsibility |
| --- | --- |
| `src/main.js` | Browser coordination, UI rendering, and workspace state. |
| `src/editor-domain-model.js` | Project schema, scenes, templates, sequences, snapshots, and export manifests. |
| `src/editor-composition.js` | Migration, registry overlay, draft/accepted trees, validation, previews, and Play. |
| `src/editor-composition-mcp.js` | Core Composition plan staging and exactly-once apply receipts. |
| `src/editor-kit-registry.js` | Kit-manifest normalization and registry snapshots. |
| `src/nexus-engine-editor-runtime.js` | Ordered editor Kits and browser/CLI bindings. |
| `src/viewport-webgl.js` | Rendering, camera interaction, culling, and render statistics. |
| `src/dsk-html-builder.js` | Browser/Node single-file game generation. |

## Project and composition model

Project format `0.4.0` stores an accepted `nexusengine.composition-tree/1` tree
and a metadata-only `nexusengine.composition-registry/3` project overlay. Legacy
`domainStack`, `kitConfigs`, and object `domainKits` are derived compatibility
projections.

Composition edits modify only the draft. Apply validates the complete tree and
replaces accepted state atomically. Referenced nodes, roots, and nonempty
domains cannot be removed silently. Run Once and Play require a clean accepted
tree, resolve trusted Engine factories, and use disposable runtimes.

## Workspace

The WebGL viewport remains the primary surface. Game Structure owns the Domain
and Kit hierarchy, Inspector owns selected configuration, and Behaviors owns
sequence links and receipts. Compact layouts switch these regions through
bounded tabs; Play focuses the viewport until Stop.

## Browser, CLI, and MCP

The browser may add known registry references but cannot install executable
code. CLI contexts explicitly enable kit installation and game/export operations.

The editor MCP server adapts the same state and CLI surfaces. Read-only discovery
is available by default; file writes and composition Apply require explicit
authorization. The example game MCP runtime is a separate opt-in proof and is
not inherited by normal exports.

## Compatibility Boundary

Browser, CLI, MCP, and integration checks use NexusEngine `0.0.4` commit
`58fa721db73992d77d6866b282494a559f0ec13c`. The browser imports that immutable
commit through jsDelivr or a same-origin exact package override. The lockfile
uses the same commit and has no sibling checkout or symlink fallback.

The file-backed nine-stage Headless host is owned and exported by Editor. Engine
Core owns only the reusable composition and MCP contracts it consumes.
