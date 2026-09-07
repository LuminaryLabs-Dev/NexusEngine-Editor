import { sha256Integrity } from "nexusengine/foundation";
const failure = (code, message) => Object.assign(new Error(message), { code });
export async function createBrowserProjectStore({
  databaseName = "nexus-authoring",
  projectId = "project",
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB)
    throw failure("AUTHORING_STORAGE_UNAVAILABLE", "IndexedDB is unavailable.");
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects");
      request.result.createObjectStore("checkpoints");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = (mode, action) =>
    new Promise((resolve, reject) => {
      const tx = database.transaction(["projects", "checkpoints"], mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          tx.error ??
            failure(
              "AUTHORING_STORAGE_CONFLICT",
              "Project transaction was aborted.",
            ),
        );
      tx.onerror = () => {};
      try {
        action(
          tx,
          (value) => (result = value),
          (error) => {
            result = null;
            tx.abort();
            reject(error);
          },
        );
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  return {
    async load() {
      return transaction("readonly", (tx, set, reject) => {
        const read = tx.objectStore("projects").get(projectId);
        read.onsuccess = () => {
          const manifest = read.result;
          if (!manifest) {
            set(null);
            return;
          }
          if (manifest.schema !== "nexusengine.authoring-browser-project/1") {
            reject(
              failure(
                "AUTHORING_STORAGE_SCHEMA",
                "Unsupported browser project format.",
              ),
            );
            return;
          }
          const snapshot = tx
            .objectStore("checkpoints")
            .get(manifest.checkpoint.hash);
          snapshot.onsuccess = () => {
            if (
              !snapshot.result ||
              sha256Integrity(JSON.stringify(snapshot.result)) !==
                manifest.checkpoint.hash
            ) {
              reject(
                failure(
                  "AUTHORING_STORAGE_CORRUPT",
                  "Browser checkpoint is missing or corrupt.",
                ),
              );
              return;
            }
            set({ manifest, snapshot: snapshot.result });
          };
        };
      });
    },
    async save(snapshot, { expectedGeneration = 0, requiredKits = [] } = {}) {
      if (snapshot.projectId !== projectId)
        throw failure("AUTHORING_STORAGE_SCHEMA", "Project identity differs.");
      const copy = structuredClone(snapshot),
        hash = sha256Integrity(JSON.stringify(copy));
      return transaction("readwrite", (tx, set, reject) => {
        const store = tx.objectStore("projects"),
          read = store.get(projectId);
        read.onsuccess = () => {
          if ((read.result?.generation ?? 0) !== expectedGeneration) {
            reject(
              failure(
                "AUTHORING_STORAGE_CONFLICT",
                "Another browser writer saved this project.",
              ),
            );
            return;
          }
          const manifest = {
            schema: "nexusengine.authoring-browser-project/1",
            projectId,
            generation: expectedGeneration + 1,
            requiredKits,
            checkpoint: { hash },
          };
          tx.objectStore("checkpoints").put(copy, hash);
          store.put(manifest, projectId);
          set(manifest);
        };
      });
    },
    close() {
      database.close();
    },
  };
}
