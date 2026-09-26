const fail = (code, message, details = {}) =>
  Object.assign(new Error(message), { code, details });

const FORMAT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value, name) {
  if (typeof value !== "string" || !value.trim())
    throw fail("EDITOR_EXPORT_PROVIDER", `${name} must be a non-empty string.`);
  return value.trim();
}

export function normalizeEditorExportProvider(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail("EDITOR_EXPORT_PROVIDER", "Export provider must be an object.");
  const id = text(input.id, "Provider id"),
    format = text(input.format, "Provider format").toLowerCase(),
    extension = text(input.extension, "Provider extension"),
    mimeType = text(input.mimeType, "Provider MIME type"),
    profile = text(input.profile, "Provider profile");
  if (!FORMAT_PATTERN.test(format))
    throw fail("EDITOR_EXPORT_PROVIDER", `Invalid export format ${format}.`);
  if (!/^\.[a-z0-9]+$/i.test(extension))
    throw fail("EDITOR_EXPORT_PROVIDER", `Invalid export extension ${extension}.`);
  for (const method of ["inspect", "encode", "validate"])
    if (typeof input[method] !== "function")
      throw fail("EDITOR_EXPORT_PROVIDER", `${id} requires ${method}().`);
  const capabilities = Object.freeze({ ...(input.capabilities ?? {}) });
  return Object.freeze({
    ...input,
    id,
    format,
    extension: extension.toLowerCase(),
    mimeType,
    profile,
    capabilities,
  });
}

export function assertDeliveryPacket(packet) {
  if (packet?.schema !== "nexusengine.authoring-delivery/1")
    throw fail(
      "EDITOR_EXPORT_PACKET",
      "Expected a Nexus Authoring delivery packet.",
    );
  if (!packet.hash || !Array.isArray(packet.meshes) || !packet.assembly)
    throw fail("EDITOR_EXPORT_PACKET", "Authoring delivery packet is incomplete.");
  return packet;
}

export function unsupportedIssue(code, message, details = {}) {
  return Object.freeze({ severity: "error", code, message, details });
}

export function warningIssue(code, message, details = {}) {
  return Object.freeze({ severity: "warning", code, message, details });
}

export function inspection(issues = []) {
  const normalized = issues.map((entry) => Object.freeze({ ...entry }));
  return Object.freeze({
    supported: !normalized.some((entry) => entry.severity === "error"),
    issues: Object.freeze(normalized),
  });
}

export function requireSupportedInspection(result, provider) {
  if (!result?.supported) {
    const issues = result?.issues ?? [];
    throw fail(
      "EDITOR_EXPORT_UNSUPPORTED_PACKET",
      `${provider.format.toUpperCase()} export cannot preserve this Authoring packet.`,
      { provider: provider.id, format: provider.format, issues },
    );
  }
  return result;
}
