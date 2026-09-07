# Authoring in NexusEngine Editor

This host starts the pinned, real NexusEngine package and installs all 19
`n:authoring` kits. The [Engine Authoring guide](https://github.com/LuminaryLabs-Dev/NexusEngine/blob/main/AUTHORING.md)
describes the portable source schemas, commands and algorithm limits.

## Start a project

```sh
npm ci
npm run authoring -- create --project /absolute/path/to/project
npm run authoring -- open --project /absolute/path/to/project
```

Open the printed localhost URL. The canvas toolbar creates box, sphere and torus
meshes. The outliner selects assembly instances; the viewport provides orbit,
selection and transform gizmos. The inspector exposes material assignment, a box
face edit, animation playback and operation JSON. Use Save, Undo, Redo and Export.
New/Open project controls save the current project before switching directories.
The initial client is intended for desktop widths of 1024 pixels and larger.

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
npm run authoring -- export --project /absolute/path/to/project --assembly scene --output /absolute/path/to/output
```

Stdio accepts one JSON request per line and returns one response with the matching
ID. Methods are `status`, `tools`, `list`, `read`, `execute`, `preview`, `accept`,
`undo`, `redo`, `save`, `prepare` and `close`. Errors contain a stable code, message
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
  createAuthoringHost, createFileProjectStore, publishAuthoringGLB,
} from '@luminarylabs/nexusengine-editor/authoring';

const host = await createAuthoringHost({
  store: await createFileProjectStore('/absolute/path/to/project'),
});
try {
  console.log(host.tools());
  const packet = host.prepare({ assemblyId: 'scene' });
  await publishAuthoringGLB(packet, '/absolute/path/to/output', {
    jobs: host.jobs,
    commitGuard: action => host.finalize(packet, action),
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

A project directory contains `project.json`, `documents/`, `blobs/`,
`checkpoints/` and `journal.jsonl`. Immutable document versions are content
addressed across current source and history. Images use deduplicated raw tile
blobs. The current manifest is replaced only after files and directories have
been synced. An exclusive local writer session and generation compare prevent
competing saves. A stale process lock is recoverable only after its PID is absent.

Acknowledged small edits have ordered, hash-chained journal records. Reopen
validates and replays them, then writes a fresh checkpoint. Corruption or an
incomplete journal record is reported; the host does not guess missing edits.
An applied edit whose journal write failed remains in memory with an explicit
persistence error; Save must succeed before further edits or normal close.

`host.snapshot()` returns a mutable portable copy. `host.snapshot({immutable:true})`
returns a read-only snapshot sharing validated immutable versions for efficient
serialization. Core's default history retains 128 edits and 10,000 receipts.
Receipt-capacity exhaustion is explicit; saving alone does not clear receipts.
Keep projects bounded and archive completed work before creating a fresh project.

The separate `./authoring/storage/browser` export supplies IndexedDB atomic
checkpoints with generation checks. It requires explicit saves and does not
provide the Node filesystem journal or writer lease. Neither profile supplies
multi-user merging, distributed locks or cross-device asset hosting.

## Jobs and export

Workers execute modifier evaluation, procedural image baking and GLB encoding.
Defaults: two active workers, 16 queued jobs, 60 seconds per job, 512 MiB V8 old
heap per worker and 192 MiB input/result transfer. V8 limits are not an OS sandbox
or an RSS guarantee. Cancellation terminates the worker; project close awaits
termination. Derived results commit only if every captured source revision and
hash still matches. Large derived images use a checkpoint instead of an oversized
journal record. The largest supported bake is 4096×4096 RGBA8.

Publishing emits an immutable directory containing `scene.glb`, standalone PNGs,
`provenance.json` and `validation.json`. Source hashes/revisions are checked again
before atomic publication. Identical texture bytes share a standalone file.
All five metallic-roughness PBR texture roles, hierarchy, skin joints/weights,
animation clips, morph position/normal deltas, cameras and punctual lights use
actual glTF binary data. Khronos validation runs before publication. Warnings
remain in the report. Independent Three GLTFLoader rendering verifies the bytes.

The format contract follows the [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).
FBX and arbitrary Blender shader nodes are unsupported. Source documents remain
the editable authority; exported triangles are delivery data.

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

The nine integrated proof groups cover host recovery, GLB publication, causal
texture renders, UI edits/project switching, CLI, worker recovery, browser storage,
independent skeletal/morph deformation and 1/10/100-job batch recovery. The
benchmark runs three fresh processes each for 10k/100k vertices and 1K/2K/4K images;
filesystem caches may remain warm. Source limits are 100k vertices/200k faces and
4096-pixel image sides; 1M meshes and 8K images reject explicitly. Performance
measurements do not establish suitability for hundreds of thousands of scenes.

See [validation scope](docs/AUTHORING-VALIDATION.md) and [measured performance](docs/AUTHORING-PERFORMANCE.md) for evidence and practical limits.
