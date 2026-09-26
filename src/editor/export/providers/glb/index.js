import validator from "gltf-validator";
import { encodeAuthoringGLB } from "../../../../authoring/export/glb.js";
import { inspection } from "../../contracts/provider.js";

export function createGLBExportProvider() {
  return {
    id: "glb-export-provider",
    format: "glb",
    extension: ".glb",
    mimeType: "model/gltf-binary",
    profile: "glb-2.0/1",
    capabilities: {
      mesh: true,
      hierarchy: true,
      materials: true,
      textures: true,
      rigs: true,
      skin: true,
      animation: true,
      morphs: true,
      cameras: true,
      lights: true,
    },
    inspect() {
      return inspection();
    },
    async encode(packet, { jobs = null, signal, onProgress = () => {} } = {}) {
      const result = jobs
        ? (await jobs.run("encode-glb", { packet }, { signal, onProgress })).result
        : encodeAuthoringGLB(packet);
      return {
        bytes: result.bytes,
        hash: result.hash,
        fileName: "scene.glb",
        auxiliaryFiles: result.textures.map((texture) => ({
          path: `textures/${texture.name}`,
          bytes: texture.bytes,
          hash: texture.hash,
        })),
        provenance: result.provenance,
        metadata: { json: result.json },
      };
    },
    async validate(bytes) {
      const report = await validateAuthoringGLBBytes(bytes);
      return {
        validator: "Khronos glTF Validator",
        version: validator.version(),
        errors: report.issues.numErrors,
        warnings: report.issues.numWarnings,
        report,
      };
    },
  };
}

export async function validateAuthoringGLBBytes(bytes) {
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: "scene.glb",
    maxIssues: 1000,
  });
  return report;
}
