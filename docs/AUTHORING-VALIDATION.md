# Authoring validation scope

The actual Editor tests import the installed Engine package. The Core catalog
contains 19 Authoring kits, 17 source kinds and 74 discoverable operations.
Six Core tests cover foundations, public installation/lifecycle, geometry,
surfaces/deformation, integration and advanced modeling.

`npm run test:authoring` runs nine real host/browser/worker/batch proof groups.
The articulated fixture compares independent Three GLTFLoader skinning to Core
LBS under a nonidentity parent hierarchy and mesh transform; maximum vertex
error was 2.69e-7 source units. Morph weights and three animation clips load.
Khronos emits the retained non-root-skinned-node warning; actual hierarchy and
deformation are independently verified. Five PBR image roles are embedded and
byte-compared with the standalone texture output, including duplicate-image
file deduplication.

The final donut has 4,096 dough vertices, 17,408 icing vertices, 180 seeded
sprinkle instances, an authored camera/light and four 512px color/normal maps.
Its 9,524,452-byte GLB validates with zero errors and zero warnings. Five fixed
views inspect those exact bytes. Earlier review found patchy face UVs, an angular
icing edge and excessively strong dough normals; toroidal UVs, an additional
subdivision pass and lower normal strength corrected those concrete defects.
This is a stylized asset, not a claim of photorealistic food rendering.

The mechanical fixture shows a convex-beveled housing, shared fasteners,
materials and nested source structure. The organic fixture shows a curved
mesh, four bones, normalized weights, three clips and a relative shape.
Structural and deformation tests support those claims; numerical validity
does not certify every possible pose or global mesh self-intersection.

Batch proof is separate: one, ten and one hundred small torus variants, with
five injected failures, resume and 95 cache hits. Distinct output hashes and
bounds establish measured parameter diversity. Domain validation and Khronos
checks detect invalid source/delivery; no general scene collision solver or
arbitrary-mesh global self-intersection guarantee is claimed.

See [measured profiles](AUTHORING-PERFORMANCE.md) for three-repetition latency,
memory and actual browser load/update data. Text evidence with artifact and
image hashes is retained in `.agent/runs/2026-09-06-authoring-completion/`.
Rendered files and local projects stay outside this repository and can be
regenerated with the documented recipes.
