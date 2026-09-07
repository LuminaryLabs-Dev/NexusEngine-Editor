import {
  open,
  readFile,
  writeFile,
  rename,
  mkdir,
  realpath,
  lstat,
  unlink,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PROJECT_FORMAT,
  digest,
  encodeJSON,
  requireHash,
  encodeProjectSnapshot,
  decodeProjectSnapshot,
} from "./project-package.js";
const fail = (code, message) => Object.assign(new Error(message), { code });
const exists = async (path) => {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
export async function createFileProjectStore(
  directory,
  { fault = () => {} } = {},
) {
  await mkdir(resolve(directory), { recursive: true });
  const root = await realpath(resolve(directory));
  let sessionRelease = null,
    journalState = null;
  async function safe(path) {
    const full = resolve(root, path);
    if (full !== root && !full.startsWith(root + sep))
      throw fail("AUTHORING_STORAGE_PATH", "Path escapes project.");
    const parts = path.split("/");
    let current = root;
    for (const part of parts) {
      current = join(current, part);
      const stat = await exists(current);
      if (stat?.isSymbolicLink())
        throw fail(
          "AUTHORING_STORAGE_PATH",
          "Project data paths cannot be symlinks.",
        );
    }
    return full;
  }
  async function read(path) {
    return readFile(await safe(path));
  }
  async function syncDirectory(path) {
    const file = await open(path, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async function durable(path, bytes, { exclusive = false } = {}) {
    const full = await safe(path),
      parent = full.slice(0, full.lastIndexOf(sep));
    await mkdir(parent, { recursive: true });
    await safe(path);
    const file = await open(full, exclusive ? "wx" : "w", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await syncDirectory(parent);
    if (parent !== root) await syncDirectory(root);
  }
  async function immutable(path, bytes) {
    const full = await safe(path);
    if (await exists(full)) {
      const current = await read(path);
      if (!current.equals(bytes))
        throw fail(
          "AUTHORING_STORAGE_CORRUPT",
          "Existing content-addressed file differs.",
        );
      return;
    }
    await durable(path, bytes, { exclusive: true });
  }
  async function lock(name) {
    const path = await safe(name),
      token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await durable(name, encodeJSON({ pid: process.pid, token }), {
          exclusive: true,
        });
        return async () => {
          const record = JSON.parse(await read(name));
          if (record.token !== token)
            throw fail("AUTHORING_STORAGE_LOCK", "Lock ownership changed.");
          await unlink(path);
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const record = JSON.parse(await read(name));
        if (!Number.isSafeInteger(record.pid) || record.pid < 1)
          throw fail("AUTHORING_STORAGE_LOCK", "Malformed project lock.");
        let alive = true;
        try {
          process.kill(record.pid, 0);
        } catch (error) {
          if (error.code === "ESRCH") alive = false;
          else throw error;
        }
        if (alive || attempt)
          throw fail(
            "AUTHORING_STORAGE_CONFLICT",
            "Another writer holds this project.",
          );
        await unlink(path);
      }
    }
    throw fail("AUTHORING_STORAGE_CONFLICT", "Cannot acquire project lock.");
  }
  async function manifest() {
    const path = await safe("project.json");
    if (!(await exists(path))) return null;
    let value;
    try {
      value = JSON.parse(await read("project.json"));
    } catch {
      throw fail(
        "AUTHORING_STORAGE_CORRUPT",
        "Project manifest is unreadable.",
      );
    }
    if (
      value.schema !== PROJECT_FORMAT ||
      typeof value.projectId !== "string" ||
      !Number.isSafeInteger(value.generation) ||
      value.generation < 1 ||
      !value.checkpoint ||
      !Array.isArray(value.documents)
    )
      throw fail(
        "AUTHORING_STORAGE_SCHEMA",
        "Unsupported or malformed project manifest.",
      );
    requireHash(value.checkpoint.hash);
    return value;
  }
  return {
    root,
    async acquire() {
      if (sessionRelease)
        throw fail(
          "AUTHORING_STORAGE_LOCK",
          "Writer session already acquired.",
        );
      sessionRelease = await lock("project-session.lock");
    },
    async release() {
      if (sessionRelease) {
        const release = sessionRelease;
        sessionRelease = null;
        await release();
      }
    },
    manifest,
    async load() {
      const m = await manifest();
      if (!m) return null;
      const checkpointBytes = await read(
        `checkpoints/${requireHash(m.checkpoint.hash)}.json`,
      );
      if (digest(checkpointBytes) !== m.checkpoint.hash)
        throw fail("AUTHORING_STORAGE_CORRUPT", "Checkpoint hash differs.");
      const checkpoint = JSON.parse(checkpointBytes);
      if (checkpoint.projectId !== m.projectId)
        throw fail("AUTHORING_STORAGE_SCHEMA", "Project identity differs.");
      const index = Object.fromEntries(m.documents.map((d) => [d.id, d.hash]));
      if (
        Object.keys(index).length !== m.documents.length ||
        Object.keys(checkpoint.documents).length !== m.documents.length ||
        Object.entries(checkpoint.documents).some(
          ([id, d]) => index[id] !== d.hash,
        )
      )
        throw fail(
          "AUTHORING_STORAGE_CORRUPT",
          "Document index differs from checkpoint.",
        );
      const snapshot = await decodeProjectSnapshot(
        checkpoint,
        (hash) => read(`documents/${requireHash(hash)}.json`),
        (hash) => read(`blobs/${requireHash(hash)}`),
      );
      return { manifest: m, snapshot };
    },
    async save(snapshot, { expectedGeneration = 0, requiredKits = [] } = {}) {
      const release = await lock("project-write.lock");
      try {
        const prior = await manifest();
        if ((prior?.generation ?? 0) !== expectedGeneration)
          throw fail(
            "AUTHORING_STORAGE_CONFLICT",
            "Saved project changed since it was opened.",
          );
        if (prior && prior.projectId !== snapshot.projectId)
          throw fail(
            "AUTHORING_STORAGE_SCHEMA",
            "Cannot replace another project identity.",
          );
        const encoded = encodeProjectSnapshot(snapshot);
        for (const [hash, bytes] of encoded.blobs)
          await immutable(`blobs/${requireHash(hash)}`, bytes);
        await fault("after-blobs");
        for (const d of encoded.allDocuments.values())
          await immutable(`documents/${requireHash(d.hash)}.json`, d.bytes);
        await fault("after-documents");
        const bytes = encodeJSON(encoded.checkpoint),
          hash = digest(bytes);
        await immutable(`checkpoints/${requireHash(hash)}.json`, bytes);
        await fault("after-checkpoint");
        const next = {
          schema: PROJECT_FORMAT,
          projectId: snapshot.projectId,
          generation: expectedGeneration + 1,
          requiredKits,
          coordinates: { upAxis: "Y", handedness: "right" },
          checkpoint: { hash },
          documents: [...encoded.documents].map(([id, d]) => ({
            id,
            kind: d.kind,
            hash: d.hash,
            contentHash: d.contentHash,
          })),
          previousCheckpoint: prior?.checkpoint ?? null,
        };
        const temporary = `project-${randomUUID()}.json`;
        await durable(temporary, encodeJSON(next), { exclusive: true });
        try {
          await fault("before-manifest");
          await rename(await safe(temporary), await safe("project.json"));
          const directory = await open(root, "r");
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        } catch (error) {
          await unlink(await safe(temporary)).catch(() => {});
          throw error;
        }
        return next;
      } finally {
        await release();
      }
    },
    async appendJournal(record) {
      if (!journalState) await this.readJournal();
      const full = await safe("journal.jsonl"),
        stat = await exists(full),
        body = {
          schema: "nexusengine.authoring-journal-record/1",
          sequence: journalState.sequence + 1,
          previousHash: journalState.hash,
          record,
        },
        entry = { ...body, hash: digest(encodeJSON(body)) },
        bytes = Buffer.concat([encodeJSON(entry), Buffer.from("\n")]);
      if ((stat?.size ?? 0) + bytes.length > 64 * 1024 * 1024)
        throw fail(
          "AUTHORING_JOURNAL_BUDGET",
          "Journal would exceed 64 MiB; save the applied source checkpoint.",
        );
      const file = await open(full, "a", 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await syncDirectory(root);
      journalState = { sequence: entry.sequence, hash: entry.hash };
    },
    async readJournal() {
      const full = await safe("journal.jsonl");
      if (!(await exists(full))) {
        journalState = { sequence: 0, hash: null };
        return [];
      }
      const bytes = await read("journal.jsonl");
      if (bytes.length > 64 * 1024 * 1024)
        throw fail(
          "AUTHORING_JOURNAL_BUDGET",
          "Journal exceeds 64 MiB; save a checkpoint.",
        );
      const text = bytes.toString("utf8");
      if (text && !text.endsWith("\n"))
        throw fail(
          "AUTHORING_STORAGE_CORRUPT",
          "Journal ends in an incomplete record.",
        );
      let sequence = 0,
        previousHash = null;
      const records = text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          let value;
          try {
            value = JSON.parse(line);
          } catch {
            throw fail("AUTHORING_STORAGE_CORRUPT", "Journal JSON is corrupt.");
          }
          const { hash, ...body } = value;
          if (
            value.schema !== "nexusengine.authoring-journal-record/1" ||
            value.sequence !== sequence + 1 ||
            value.previousHash !== previousHash ||
            digest(encodeJSON(body)) !== hash
          )
            throw fail(
              "AUTHORING_STORAGE_CORRUPT",
              "Journal order or content hash differs.",
            );
          sequence = value.sequence;
          previousHash = hash;
          return value.record;
        });
      journalState = { sequence, hash: previousHash };
      return records;
    },
    async clearJournal() {
      const name = `journal-${randomUUID()}.jsonl`;
      await durable(name, Buffer.alloc(0), { exclusive: true });
      await rename(await safe(name), await safe("journal.jsonl"));
      await syncDirectory(root);
      journalState = { sequence: 0, hash: null };
    },
  };
}
