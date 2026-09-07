# Measured Authoring profiles

Node v24.19.0 on AMD EPYC 9V74 80-Core Processor. Three fresh processes per case; OS caches may be warm. Shared development environment, not dedicated benchmark hardware. Milliseconds below are median / observed maximum of three samples; maximum is not a statistically established p95. Source and history sizes are serialized logical bytes, not resident-memory claims.

| Workload | Median / maximum milliseconds | Peak process RSS MiB |
| --- | --- | --- |
| mesh 10000 | create: 603 / 644; selection: 9 / 12; transform: 276 / 284; undo: 104 / 116; redo: 100 / 114; modifier: 239 / 262; sculpt: 718 / 798; save: 141 / 176; load: 85 / 90; prepare: 992 / 1007; export: 104 / 117 | 404 |
| mesh 100000 | create: 7009 / 7231; selection: 38 / 45; transform: 3384 / 3480; undo: 1243 / 1354; redo: 1223 / 1518; modifier: 3315 / 3469; sculpt: 7446 / 7581; save: 831 / 867; load: 839 / 872; prepare: 12619 / 13506; export: 967 / 1054 | 1712 |
| image 1024 | bakeWorker: 3890 / 4115; paintTile: 364 / 390; save: 236 / 242; load: 103 / 108; prepare: 1680 / 1688; export: 230 / 240 | 435 |
| image 2048 | bakeWorker: 13303 / 13344; paintTile: 1549 / 1622; save: 403 / 474; load: 463 / 514; prepare: 6740 / 6923; export: 832 / 880 | 693 |
| image 4096 | bakeWorker: 52527 / 53273; paintTile: 6211 / 6260; save: 1515 / 1712; load: 1898 / 2029; prepare: 28274 / 28440; export: 3253 / 3382 | 1874 |

The 100k mesh and 4K image profiles complete but are not realtime interaction targets. Use smaller editing assets or explicit background evaluation for expensive work. The source contract rejects 1M-vertex requests and 8K images; those are not advertised as supported.

Preview uses real Chromium 140 / Three / SwiftShader and an 800×600 viewport. Each case measures three fresh-page loads and a repeated same-artifact update. Causal texture changes are independently tested by `tests/authoring-render.mjs`.

| Preview | Load median / max ms | Update median / max ms |
| --- | --- | --- |
| mesh-10000 | 191 / 194 | 36 / 43 |
| mesh-100000 | 271 / 285 | 173 / 194 |
| image-4096 | 314 / 332 | 200 / 232 |

4K bake transferred about 135 MB of result data. Node V8 heap limits are not process-tree RSS caps. A cancelled 2K bake terminated in approximately 3–21 ms in the recorded tests without committing its result.

Batch evidence uses distinct small torus jobs, not the high-detail donut. 100 jobs produce 100 distinct output hashes and bounds; five deterministic injected failures recover on resume with 95 cache hits. No hundreds-of-thousands scale claim is made.
