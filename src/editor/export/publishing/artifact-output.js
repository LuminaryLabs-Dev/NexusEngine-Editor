import { mkdir, open, readFile, rename, rm, realpath } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createEditorExportReceipt } from "../contracts/receipt.js";

const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fail = (code, message, details = {}) =>
  Object.assign(new Error(message), { code, details });

function abort(signal) {
  if (signal?.aborted)
    throw fail("EDITOR_EXPORT_CANCELLED", "Export cancelled.");
}

function safeRelative(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw fail("EDITOR_EXPORT_PATH", `Unsafe artifact path ${path}.`);
  return path;
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeExclusive(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function publishEditorExportArtifact(
  provider,
  encoded,
  validation,
  outputDirectory,
  { signal, commitGuard = (action) => action(), onProgress = () => {} } = {},
) {
  abort(signal);
  const rootInput = resolve(outputDirectory);
  await mkdir(rootInput, { recursive: true });
  const root = await realpath(rootInput),
    destination = join(root, `asset-${encoded.hash.slice(7)}`),
    staging = join(root, `pending-${randomUUID()}`),
    mainPath = safeRelative(encoded.fileName),
    auxiliary = (encoded.auxiliaryFiles ?? []).map((entry) => ({
      ...entry,
      path: safeRelative(entry.path),
      hash: entry.hash ?? digest(entry.bytes),
    }));
  if (!Buffer.isBuffer(encoded.bytes))
    throw fail("EDITOR_EXPORT_BYTES", "Provider encode() must return Buffer bytes.");
  if (encoded.hash !== digest(encoded.bytes))
    throw fail("EDITOR_EXPORT_HASH", "Provider output hash does not match bytes.");
  await mkdir(staging);
  let committed = false;
  const payloadFiles = [
    { path: mainPath, bytes: encoded.bytes, hash: encoded.hash },
    ...auxiliary,
  ];
  try {
    for (const file of payloadFiles) {
      abort(signal);
      await writeExclusive(join(staging, ...file.path.split("/")), file.bytes);
    }
    const validationRecord = validation ?? {
        validator: "none",
        version: null,
        errors: 0,
        warnings: 0,
      },
      receiptPreview = {
        schema: "nexusengine.editor-export-receipt/1",
        provider: provider.id,
        format: provider.format,
        profile: provider.profile,
        mimeType: provider.mimeType,
        sourcePacket: encoded.provenance?.sourcePacket ?? null,
        outputHash: encoded.hash,
        byteLength: encoded.bytes.length,
        validation: validationRecord,
        provenance: encoded.provenance ?? null,
        files: [
          ...payloadFiles.map((file) => file.path),
          "provenance.json",
          "validation.json",
        ],
      };
    await writeExclusive(
      join(staging, "provenance.json"),
      Buffer.from(JSON.stringify(receiptPreview, null, 2) + "\n"),
    );
    await writeExclusive(
      join(staging, "validation.json"),
      Buffer.from(JSON.stringify(validationRecord, null, 2) + "\n"),
    );
    const directories = new Set([staging]);
    for (const file of payloadFiles) {
      let current = dirname(join(staging, ...file.path.split("/")));
      while (current.startsWith(staging) && current !== staging) {
        directories.add(current);
        current = dirname(current);
      }
    }
    for (const directory of [...directories].sort((a, b) => b.length - a.length))
      await syncDirectory(directory);
    abort(signal);
    onProgress({ stage: "publish", progress: 0.9, format: provider.format });
    await commitGuard(async () => {
      abort(signal);
      try {
        await rename(staging, destination);
        committed = true;
        await syncDirectory(root);
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
        for (const file of payloadFiles) {
          const prior = await readFile(join(destination, ...file.path.split("/")));
          if (digest(prior) !== file.hash)
            throw fail(
              "EDITOR_EXPORT_CONFLICT",
              `Existing ${file.path} differs from content identity.`,
            );
        }
      }
    });
    onProgress({ stage: "completed", progress: 1, format: provider.format });
    const artifact = join(destination, ...mainPath.split("/"));
    return createEditorExportReceipt({
      provider,
      encoded,
      validation: validationRecord,
      directory: destination,
      artifact,
      files: receiptPreview.files,
    });
  } finally {
    if (!committed) await rm(staging, { recursive: true, force: true });
  }
}
