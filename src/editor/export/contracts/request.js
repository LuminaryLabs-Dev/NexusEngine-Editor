import { assertDeliveryPacket } from "./provider.js";

const fail = (code, message) => Object.assign(new Error(message), { code });

export function normalizeEditorExportRequest(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail("EDITOR_EXPORT_REQUEST", "Export request must be an object.");
  const packet = assertDeliveryPacket(input.packet),
    format = String(input.format ?? "glb").trim().toLowerCase(),
    outputDirectory = String(input.outputDirectory ?? "").trim();
  if (!format) throw fail("EDITOR_EXPORT_REQUEST", "Export format is required.");
  if (!outputDirectory)
    throw fail("EDITOR_EXPORT_REQUEST", "Export outputDirectory is required.");
  return Object.freeze({ packet, format, outputDirectory });
}
