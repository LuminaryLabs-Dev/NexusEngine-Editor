export function createEditorExportReceipt({
  provider,
  encoded,
  validation,
  directory,
  artifact,
  files,
}) {
  return Object.freeze({
    schema: "nexusengine.editor-export-receipt/1",
    provider: provider.id,
    format: provider.format,
    profile: provider.profile,
    mimeType: provider.mimeType,
    sourcePacket: encoded.provenance?.sourcePacket ?? null,
    outputHash: encoded.hash,
    byteLength: encoded.bytes.length,
    validation,
    provenance: encoded.provenance ?? null,
    files: Object.freeze([...files]),
    directory,
    artifact,
  });
}
