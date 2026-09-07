import { createHash } from "node:crypto";
export const PROJECT_FORMAT = "nexusengine.authoring-workspace/1";
export const digest = (data) =>
  `sha256:${createHash("sha256").update(data).digest("hex")}`;
export const encodeJSON = (value) => Buffer.from(JSON.stringify(value));
export function requireHash(value) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw Object.assign(new Error("Invalid content hash."), {
      code: "AUTHORING_STORAGE_HASH",
    });
  return value.slice(7);
}
export function encodeProjectSnapshot(snapshot) {
  const blobs = new Map(),
    documents = new Map(),
    allDocuments = new Map(),
    seen = new WeakMap();
  function document(value) {
    if (seen.has(value)) return seen.get(value);
    let content = value.content;
    if (value.kind === "image") {
      content = {
        ...content,
        layers: content.layers.map((layer) => ({
          ...layer,
          tiles: Object.fromEntries(
            Object.entries(layer.tiles).map(([key, data]) => {
              const bytes = Buffer.from(data, "hex"),
                hash = digest(bytes);
              blobs.set(hash, bytes);
              return [key, { blob: hash }];
            }),
          ),
        })),
      };
    }
    const bytes = encodeJSON({ ...value, content }),
      hash = digest(bytes),
      entry = { hash, bytes, kind: value.kind, contentHash: value.hash };
    allDocuments.set(hash, entry);
    seen.set(value, entry);
    return entry;
  }
  const history = (entries) =>
    entries.map((entry) => ({
      ...entry,
      deltas: entry.deltas.map((delta) => ({
        ...delta,
        before: delta.before ? { document: document(delta.before).hash } : null,
        after: delta.after ? { document: document(delta.after).hash } : null,
      })),
    }));
  for (const [id, doc] of Object.entries(snapshot.documents))
    documents.set(id, document(doc));
  const checkpoint = {
    ...snapshot,
    documents: Object.fromEntries(
      [...documents].map(([id, d]) => [id, { hash: d.hash }]),
    ),
    undo: history(snapshot.undo),
    redo: history(snapshot.redo),
  };
  return { blobs, documents, allDocuments, checkpoint };
}
export async function decodeProjectSnapshot(
  checkpoint,
  readDocument,
  readBlob,
) {
  const cache = new Map();
  async function decodeDocument(value) {
    if (value.kind !== "image") return value;
    const content = { ...value.content, layers: [] };
    for (const layer of value.content.layers) {
      const tiles = {};
      for (const [key, ref] of Object.entries(layer.tiles)) {
        if (
          !ref ||
          typeof ref !== "object" ||
          Object.keys(ref).length !== 1 ||
          !ref.blob
        )
          throw Object.assign(new Error("Invalid image chunk reference."), {
            code: "AUTHORING_STORAGE_SCHEMA",
          });
        const bytes = await readBlob(ref.blob);
        if (digest(bytes) !== ref.blob)
          throw Object.assign(new Error("Image chunk hash differs."), {
            code: "AUTHORING_STORAGE_CORRUPT",
          });
        Object.defineProperty(tiles, key, {
          value: bytes.toString("hex"),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      content.layers.push({ ...layer, tiles });
    }
    return { ...value, content };
  }
  async function document(hash) {
    requireHash(hash);
    if (cache.has(hash)) return cache.get(hash);
    const bytes = await readDocument(hash);
    if (digest(bytes) !== hash)
      throw Object.assign(new Error("Document hash differs."), {
        code: "AUTHORING_STORAGE_CORRUPT",
      });
    const value = await decodeDocument(JSON.parse(bytes.toString("utf8")));
    cache.set(hash, value);
    return value;
  }
  const history = async (entries) => {
    const result = [];
    for (const entry of entries) {
      const deltas = [];
      for (const delta of entry.deltas) {
        const decode = (ref) =>
          ref === null
            ? null
            : ref.document
              ? document(ref.document)
              : decodeDocument(ref);
        deltas.push({
          ...delta,
          before: await decode(delta.before),
          after: await decode(delta.after),
        });
      }
      result.push({ ...entry, deltas });
    }
    return result;
  };
  const snapshot = { ...checkpoint, documents: {} };
  for (const [id, ref] of Object.entries(checkpoint.documents))
    Object.defineProperty(snapshot.documents, id, {
      value: await document(ref.hash),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  snapshot.undo = await history(checkpoint.undo);
  snapshot.redo = await history(checkpoint.redo);
  return snapshot;
}
