# NexusEngine Editor Workbench

The workbench is the human GUI over NexusEngine Core. It does not own canonical Authoring, persistence, validation, import/export, Domain/Kit composition, runtime or Build semantics.

## Start

```bash
npm run authoring -- create --project /path/to/project
npm run authoring -- open --project /path/to/project
```

The Authoring host is pinned to NexusEngine commit `784e514722febf8fb09ca55a058b2736e93679bd`.

## Workbench surfaces

```text
File / Project / Domains / Kits / Build / Window
        |
        +-- toolbar: Play, Pause, Stop, Validate, Save, Build, Export
        +-- Outliner
        +-- Three.js viewport
        +-- Inspector
        +-- Assets
        +-- Domains
        +-- Kits
        +-- Validation
        +-- Composition
        +-- Runtime
        +-- Build
        `-- Console / receipts
```

Domain and Kit panels are generated from the Core registry returned by `authoringDomainComposition.discover()`. Project-selected Kits are stored in a real `domain-composition` Authoring document and are validated by Core before commit.

## Authoring ownership

The host delegates to:

- `authoringCreate` for generic creation.
- `authoringImport` for GLB, FBX, USD/USDZ and OBJ inspection/commit.
- typed Project/Authoring operations for scene edits.
- `authoringValidation` for project/document/format checks.
- `authoringPersistence` for Core project packages and save/load.
- `authoringExport` for GLB, FBX and USDZ.
- `authoringPublishing` for evaluated preview packets.
- `authoringDomainComposition` for Domain/Kit discovery and project composition.
- `n:build` through a lazy Editor Build controller when Build is requested.

The Editor's filesystem store is a location adapter only. The persisted project format is Core's `nexusengine.authoring-package/1` at `authoring-project.json`.

## Play Mode

Play Mode:

1. validates the Authoring project;
2. snapshots source;
3. creates a fresh Engine with canonical Authoring;
4. loads a clone of the source snapshot;
5. resolves the selected composition plan;
6. installs selected Core Kit factories in dependency order;
7. runs ticks in the separate runtime.

Stopping Play Mode destroys that runtime. Runtime state is never copied back into Authoring implicitly.

## Build

The Build controller imports `nexusengine/domains/build` lazily. Opening normal Authoring, browsing Kits, saving, playing, importing or exporting does not initialize Build toolchains.

Build UI exposes target discovery and planning first. Applying a build uses Core approval and receipt semantics; the Editor does not maintain a second builder.

## Retired ownership

The active workbench no longer depends on:

- `n:editor:export`
- Editor GLB/FBX/USDZ codecs
- Editor-owned Authoring project package encoding
- Editor-owned IndexedDB persistence semantics

Read-only viewport rendering remains an Editor/provider responsibility.

## Validation

```bash
npm run test:workbench
npm run test:authoring
npm test
```

Core workbench regression covers registry discovery, project composition add/remove, composition validation/planning and Play Mode source isolation. Authoring regression covers Core persistence, Core import/export and the browser workbench. Browser-specific tests still require a Chromium environment that permits localhost.
