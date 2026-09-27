# Authoring in NexusEngine Editor

This host starts the pinned, real NexusEngine package and installs the complete canonical `n:authoring` composition (39 kits at the pinned Core commit). The [Engine Authoring guide](https://github.com/LuminaryLabs-Dev/NexusEngine/blob/main/AUTHORING.md)
describes the portable source schemas, commands and algorithm limits.

## Start a project

```sh
npm ci
npm run authoring -- create --project /absolute/path/to/project
npm run authoring -- open --project /absolute/path/to/project
```

Open the printed localhost URL. The Core-native workbench provides File/Project/Domain/Kit/Build navigation, Play/Pause/Stop, Validate/Save/Export, a scene Outliner, Three.js viewport, Inspector, and Assets, Domains, Kits, Validation, Composition, Runtime, Build and Console panels. Create/import/edit actions call Core Authoring APIs; the viewport remains a presentation provider rather than source authority.

Every source change goes through the same Project transaction API used by scripts.
The JSON panel accepts an array of operations from `host.tools()`. Ctrl+Enter runs,
Escape cancels and Ctrl+A replaces the input. Ctrl+S saves; Ctrl+Z/Ctrl+Y travel
history; G/R/S choose the transform gizmo. Specialized UV, weight-paint and timeline
workspaces are future clients of the existing domain operations.

The legacy static Editor and its `0.4.0` project format remain available through
`npm run build`. An Authoring project uses a separate explicit source format;
opening a legacy project does not silently convert it.

## CLI and agent transport

```sh
npm run authoring -- stdio --project /absolute/path/to/project
npm run authoring -- run --project /absolute/path/to/project --file /absolute/path/to/operations.json
npm run authoring -- export --project /absolute/path/to/project --assembly scene --format glb --output /absolute/path/to/output
npm run authoring -- export --project /absolute/path/to/project --assembly scene --format usdz --output /absolute/path/to/output
npm run authoring -- export --project /absolute/path/to/project --assembly scene --format fbx --output /absolute/path/to/output
```

Stdio accepts one JSON request per line and returns one response with the matching
ID. Methods are `status`, `tools`, `list`, `read`, `execute`, `preview`, `accept`,
`create`, `undo`, `redo`, `save`, `load`, `prepare`, `import-formats`, `import`, `import-commit`, `export-formats`, `inspect-export`, `validate-project`, `validate-document`, `validate-export`, `export` and `close`. Errors contain a stable code, message
and details. Example execute frame (replace the epoch with current status):

```json
{"id":"request-1","method":"execute","params":{"requestId":"make-box","epoch":1,"operations":[{"id":"mesh.cube","args":{"id":"box"}}]}}
```

`execute` requires a stable request ID and current epoch. Edits require the
revision read before the transaction. Retry an uncertain response with the exact
same request; do not invent a second request ID. The default external request
budget is 32 MiB and the serialized host queue holds at most 64 actions.

## Embed the host

```js
import {
  createAuthoringHost, createFileProjectStore,
} from '@luminarylabs/nexusengine-editor/authoring';

const host = await createAuthoringHost({
  store: await createFileProjectStore('/absolute/path/to/project'),
});
try {
  console.log(host.tools());
  console.log(host.exportFormats());
  await host.exportArtifact({
    assemblyId: 'scene',
    format: 'usdz',
    outputDirectory: '/absolute/path/to/output',
  });
} finally {
  await host.close({ save: true });
}
```

A host without a store is an in-memory embedding; Save requires a store. The
Authoring host owns consumption of its Engine resource journal between commands,
retaining a compact change count. It does not run simulation ticks to edit source.
For custom Engine event/scheduler ownership, use `createAuthoringRuntime()` and
supply your own host. Source snapshots are independent of the resource journal.

Sequences are real finite Runtime executions. Start with
`host.startSequence(documentId, { runId })`, inspect active step IDs and call
`await host.advanceSequence(run, stepId)`. Each committed request is durably
recorded before acknowledgement. Automatic planning, branching and retry policy
remain the caller's responsibility.

## Persistence and recovery

Persistence is owned by NexusEngine Core. The Editor filesystem adapter selects a directory and passes the Core target `{ storage: "filesystem", path }` to `authoringPersistence`. The project manifest is `authoring-project.json` with schema `nexusengine.authoring-package/1`; integrity, content addressing, generation checks and restore semantics are Core behavior.

`host.snapshot()` still exposes portable Authoring source for inspection. Save/Load never use a second Editor project package format. Browser persistence validation targets Core's IndexedDB provider rather than an Editor-owned IndexedDB implementation.

## Jobs and export

Workers execute modifier evaluation, procedural image baking and Core GLB encoding.
Defaults: two active workers, 16 queued jobs, 60 seconds per job, 512 MiB V8 old
heap per worker and 192 MiB input/result transfer. V8 limits are not an OS sandbox
or an RSS guarantee. Cancellation terminates the worker; project close awaits
termination. Derived results commit only if every captured source revision and
hash still matches. Large derived images use a checkpoint instead of an oversized
journal record. The largest supported bake is 4096×4096 RGBA8.

Publishing and export are owned by NexusEngine Core. The Editor calls `authoringPublishing` for evaluated delivery packets and `authoringExport` for capability inspection, encoding, validation, publication and receipts. GLB, FBX and USDZ are the canonical Core providers at the pinned Engine commit; the Editor contains no canonical format codec.

Import is likewise Core-owned through `authoringImport` (GLB, binary FBX, USDA/USDZ and OBJ in the current Core profiles), and project validation comes from `authoringValidation`.

Source documents remain the editable authority; exported triangles are delivery
data. Additional formats can register providers without changing Authoring.

## Recipes, tests and measurements

```sh
node examples/authoring/donut/build.mjs /tmp/my-donut
node examples/authoring/build-proof-assets.mjs /tmp/my-proof-assets
node examples/authoring/render-artifact.mjs /absolute/path/to/scene.glb /tmp/renders
npm run test:authoring
npm test
npm run benchmark:authoring -- /tmp/authoring-performance.json
```

The donut uses domain-created geometry, fitted icing, brush drips, UVs, baked color
and normal textures, and seeded surface-scattered sprinkles. Mechanical and
organic fixtures exercise convex bevels, shared parts, rigs, weights, clips and
shape keys. Renders inspect exported bytes, not independently recreated geometry.

The integrated proof groups cover Core persistence recovery, the Core workbench, multi-format export, causal
texture renders, UI edits/project switching, CLI, worker recovery, browser storage,
independent skeletal/morph deformation and 1/10/100-job batch recovery. Workbench proof additionally covers real Core Domain/Kit registry discovery, project composition and Play Mode source isolation. The
benchmark runs three fresh processes each for 10k/100k vertices and 1K/2K/4K images;
filesystem caches may remain warm. Source limits are 100k vertices/200k faces and
4096-pixel image sides; 1M meshes and 8K images reject explicitly. Performance
measurements do not establish suitability for hundreds of thousands of scenes.

See [validation scope](docs/AUTHORING-VALIDATION.md) and [measured performance](docs/AUTHORING-PERFORMANCE.md) for evidence and practical limits.


See also [WORKBENCH.md](./WORKBENCH.md) for Domain/Kit composition, Play Mode, Build, and GUI ownership boundaries.
