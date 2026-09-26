import { inspectStaticAssetPacket } from "../static-profile.js";
import { encodeAuthoringUSDZ } from "./encode.js";
import { readStoredZipEntries } from "./zip.js";

export function createUSDZExportProvider() {
  return {
    id: "usdz-export-provider",
    format: "usdz",
    extension: ".usdz",
    mimeType: "model/vnd.usdz+zip",
    profile: "usdz-static-pbr/1",
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
      return inspectStaticAssetPacket(packet, { format: "usdz" });
    },
    encode(packet, options = {}) {
      return encodeAuthoringUSDZ(packet, options);
    },
    async validate(bytes) {
      const issues = [];
      let entries = [];
      try {
        entries = readStoredZipEntries(bytes);
      } catch (error) {
        issues.push({ code: "USDZ_ZIP_INVALID", message: error.message });
      }
      const scene = entries.find((entry) => entry.name === "scene.usda");
      if (!scene) issues.push({ code: "USDZ_SCENE_MISSING", message: "scene.usda is missing." });
      if (scene && scene.dataOffset % 64 !== 0)
        issues.push({ code: "USDZ_ALIGNMENT", message: "scene.usda is not aligned to a 64-byte boundary." });
      const text = scene?.bytes.toString("utf8") ?? "";
      if (scene && !text.startsWith("#usda 1.0"))
        issues.push({ code: "USDZ_USDA_HEADER", message: "scene.usda has an invalid USDA header." });
      if (scene && !/\bdef Mesh\b/.test(text))
        issues.push({ code: "USDZ_MESH_MISSING", message: "scene.usda contains no Mesh prim." });
      return {
        validator: "Nexus USDZ structural validator",
        version: "1",
        errors: issues.length,
        warnings: 0,
        issues,
        entries: entries.map((entry) => ({
          name: entry.name,
          byteLength: entry.bytes.length,
          dataOffset: entry.dataOffset,
        })),
      };
    },
  };
}
