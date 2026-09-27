import { mkdir, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

const fail = (code, message) => Object.assign(new Error(message), { code });

/** Thin filesystem location adapter. Core Authoring owns package encoding, integrity, generations and IO semantics. */
export async function createFileProjectStore(directory) {
  if (typeof directory !== "string" || !directory.trim()) throw fail("AUTHORING_STORAGE_PATH", "Project directory is required.");
  await mkdir(resolve(directory), { recursive: true });
  const root = await realpath(resolve(directory));
  return Object.freeze({
    root,
    target: Object.freeze({ storage: "filesystem", path: root }),
    async manifest() {
      try {
        const value = JSON.parse(await readFile(resolve(root, "authoring-project.json"), "utf8"));
        if (value?.schema !== "nexusengine.authoring-package/1" || typeof value.projectId !== "string" || !Number.isSafeInteger(value.generation) || value.generation < 1)
          throw fail("AUTHORING_STORAGE_SCHEMA", "Unsupported or malformed Core Authoring project manifest.");
        return value;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
  });
}
