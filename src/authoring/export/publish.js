import { mkdir, open, readFile, rename, rm, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import validator from "gltf-validator";
import { encodeAuthoringGLB } from "./glb.js";
const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function writeFile(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
const abort = (signal) => {
  if (signal?.aborted)
    throw Object.assign(new Error("Export cancelled."), {
      code: "AUTHORING_EXPORT_CANCELLED",
    });
};
export async function validateAuthoringGLB(bytes) {
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: "scene.glb",
    maxIssues: 1000,
  });
  if (report.issues.numErrors)
    throw Object.assign(
      new Error("Independent Khronos glTF validation failed."),
      { code: "AUTHORING_GLTF_INVALID", details: report.issues },
    );
  return report;
}
export async function publishAuthoringGLB(
  packet,
  outputDirectory,
  {
    signal,
    commitGuard = (action) => action(),
    onProgress = () => {},
    jobs = null,
  } = {},
) {
  abort(signal);
  onProgress({ stage: "encode", progress: 0 });
  const encoded = jobs
    ? (await jobs.run("encode-glb", { packet }, { signal, onProgress })).result
    : encodeAuthoringGLB(packet);
  abort(signal);
  onProgress({ stage: "validate", progress: 0.5 });
  const validation = await validateAuthoringGLB(encoded.bytes);
  abort(signal);
  await mkdir(resolve(outputDirectory), { recursive: true });
  const root = await realpath(resolve(outputDirectory)),
    name = `asset-${encoded.hash.slice(7)}`,
    destination = join(root, name),
    staging = join(root, `pending-${randomUUID()}`);
  await mkdir(staging);
  let committed = false;
  const textures = [
    ...new Map(encoded.textures.map((t) => [t.name, t])).values(),
  ];
  try {
    await writeFile(join(staging, "scene.glb"), encoded.bytes, { flag: "wx" });
    await mkdir(join(staging, "textures"));
    for (const texture of textures) {
      abort(signal);
      await writeFile(join(staging, "textures", texture.name), texture.bytes, {
        flag: "wx",
      });
    }
    const receipt = {
      ...encoded.provenance,
      validation: {
        validator: "Khronos glTF Validator",
        version: validator.version(),
        errors: validation.issues.numErrors,
        warnings: validation.issues.numWarnings,
      },
      files: [
        "scene.glb",
        ...textures.map((t) => `textures/${t.name}`),
        "provenance.json",
        "validation.json",
      ],
    };
    await writeFile(
      join(staging, "provenance.json"),
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      join(staging, "validation.json"),
      JSON.stringify(validation, null, 2) + "\n",
      { flag: "wx" },
    );
    await syncDirectory(join(staging, "textures"));
    await syncDirectory(staging);
    abort(signal);
    onProgress({ stage: "publish", progress: 0.9 });
    await commitGuard(async () => {
      abort(signal);
      try {
        await rename(staging, destination);
        committed = true;
        await syncDirectory(root);
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
        const prior = await readFile(join(destination, "scene.glb"));
        if (digest(prior) !== encoded.hash)
          throw Object.assign(
            new Error("Existing artifact differs from content identity."),
            { code: "AUTHORING_EXPORT_CONFLICT" },
          );
        for (const texture of textures) {
          const prior = await readFile(
            join(destination, "textures", texture.name),
          );
          if (digest(prior) !== texture.hash)
            throw Object.assign(
              new Error("Existing texture differs from content identity."),
              { code: "AUTHORING_EXPORT_CONFLICT" },
            );
        }
      }
    });
    onProgress({ stage: "completed", progress: 1 });
    return {
      ...receipt,
      directory: destination,
      glb: join(destination, "scene.glb"),
    };
  } finally {
    if (!committed) await rm(staging, { recursive: true, force: true });
  }
}
