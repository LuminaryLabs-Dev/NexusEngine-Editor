import { inspectStaticAssetPacket } from "../static-profile.js";
import { encodeAuthoringFBX } from "./encode.js";

export function createFBXExportProvider() {
  return {
    id: "fbx-export-provider",
    format: "fbx",
    extension: ".fbx",
    mimeType: "application/octet-stream",
    profile: "fbx-ascii-7.4-static/1",
    capabilities: {
      mesh: true,
      hierarchy: true,
      materials: true,
      textures: false,
      rigs: false,
      skin: false,
      animation: false,
      morphs: false,
      cameras: false,
      lights: false,
    },
    inspect(packet) {
      return inspectStaticAssetPacket(packet, { format: "fbx" });
    },
    encode(packet, options = {}) {
      return encodeAuthoringFBX(packet, options);
    },
    async validate(bytes) {
      const text = Buffer.from(bytes).toString("utf8"),
        issues = [];
      if (!text.startsWith("; FBX 7.4.0 project file"))
        issues.push({ code: "FBX_HEADER", message: "FBX 7.4 ASCII header is missing." });
      if (!/FBXVersion:\s*7400/.test(text))
        issues.push({ code: "FBX_VERSION", message: "FBX version is not 7400." });
      const geometries = [...text.matchAll(/\bGeometry:\s*(\d+),\s*"Geometry::/g)];
      const models = [...text.matchAll(/\bModel:\s*(\d+),\s*"Model::[^"]+",\s*"Mesh"/g)];
      if (!geometries.length)
        issues.push({ code: "FBX_GEOMETRY_MISSING", message: "FBX contains no mesh Geometry objects." });
      if (geometries.length !== models.length)
        issues.push({ code: "FBX_MODEL_COUNT", message: "Geometry and Model counts differ." });
      for (const match of text.matchAll(/PolygonVertexIndex:\s*\*(\d+)\s*\{\s*a:\s*([^}]*)\}/gms)) {
        const declared = Number(match[1]),
          values = match[2].split(",").map((value) => Number(value.trim())).filter(Number.isFinite),
          terminators = values.filter((value) => value < 0).length;
        if (declared !== values.length || values.length % 3 || terminators !== values.length / 3)
          issues.push({ code: "FBX_TOPOLOGY", message: "PolygonVertexIndex data is malformed." });
      }
      return {
        validator: "Nexus FBX ASCII structural validator",
        version: "1",
        errors: issues.length,
        warnings: 0,
        issues,
        geometryCount: geometries.length,
        modelCount: models.length,
      };
    },
  };
}
