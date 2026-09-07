import {
  mkdir,
  readFile,
  writeFile,
  rename,
  realpath,
  unlink,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
// The caller supplies a trusted recipe function; manifests never deserialize code.
export async function runAuthoringBatch({
  directory,
  jobs,
  run,
  concurrency = 2,
  algorithm,
  signal,
  onProgress = () => {},
}) {
  if (
    !Array.isArray(jobs) ||
    !jobs.length ||
    jobs.length > 10000 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 8 ||
    typeof algorithm !== "string" ||
    !algorithm ||
    typeof run !== "function"
  )
    throw Error("Invalid authoring batch configuration.");
  if (
    new Set(jobs.map((j) => j.id)).size !== jobs.length ||
    jobs.some((j) => typeof j.id !== "string" || !j.id)
  )
    throw Error("Batch IDs must be unique nonempty strings.");
  await mkdir(resolve(directory), { recursive: true });
  const root = await realpath(resolve(directory)),
    manifestFile = join(root, "batch.json"),
    lockFile = join(root, "batch.lock");
  await writeFile(lockFile, JSON.stringify({ pid: process.pid }), {
    flag: "wx",
  });
  try {
    let prior = null;
    try {
      prior = JSON.parse(await readFile(manifestFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const key = hash({ algorithm, jobs });
    if (
      prior &&
      (prior.schema !== "nexusengine.authoring-batch/1" || prior.key !== key)
    )
      throw Object.assign(
        new Error("Resume manifest belongs to another batch definition."),
        { code: "AUTHORING_BATCH_CONFLICT" },
      );
    const state = prior ?? {
      schema: "nexusengine.authoring-batch/1",
      key,
      algorithm,
      jobs: {},
    };
    state.jobs = Object.assign(Object.create(null), state.jobs);
    let cursor = 0,
      tail = Promise.resolve(),
      cacheHits = 0,
      peakRSS = process.memoryUsage().rss;
    const save = () => {
      const copy = JSON.stringify(state, null, 2) + "\n";
      const result = tail.then(async () => {
        const temp = join(root, `batch-${randomUUID()}.json`);
        await writeFile(temp, copy, { flag: "wx" });
        await rename(temp, manifestFile);
      });
      tail = result;
      return result;
    };
    const processJob = async (job) => {
      const id = hash(job),
        previous = Object.hasOwn(state.jobs, job.id)
          ? state.jobs[job.id]
          : null;
      if (previous?.status === "completed") {
        const actual = await readFile(previous.output.glb)
          .then(
            (bytes) =>
              "sha256:" + createHash("sha256").update(bytes).digest("hex"),
          )
          .catch(() => null);
        if (actual === previous.output.outputHash) {
          cacheHits++;
          return;
        }
      }
      const attempt = (previous?.attempts ?? 0) + 1,
        outputDirectory = join(root, `job-${id}`, `attempt-${attempt}`);
      if (signal?.aborted) {
        Object.defineProperty(state.jobs, job.id, {
          value: { status: "cancelled", attempts: attempt, seed: job.seed },
          enumerable: true,
          writable: true,
          configurable: true,
        });
        await save();
        return;
      }
      state.jobs[job.id] = {
        status: "running",
        attempts: attempt,
        seed: job.seed,
      };
      await save();
      const started = performance.now();
      try {
        const output = await run(job, { directory: outputDirectory, signal });
        if (signal?.aborted)
          throw Object.assign(new Error("Batch cancelled."), {
            code: "AUTHORING_JOB_CANCELLED",
          });
        state.jobs[job.id] = {
          status: "completed",
          attempts: attempt,
          seed: job.seed,
          elapsedMs: performance.now() - started,
          output,
        };
      } catch (error) {
        state.jobs[job.id] = {
          status:
            signal?.aborted || error.code === "AUTHORING_JOB_CANCELLED"
              ? "cancelled"
              : "failed",
          attempts: attempt,
          seed: job.seed,
          elapsedMs: performance.now() - started,
          error: {
            code: error.code ?? "AUTHORING_BATCH_JOB_FAILED",
            message: error.message,
          },
        };
      }
      peakRSS = Math.max(peakRSS, process.memoryUsage().rss);
      await save();
      onProgress({ id: job.id, ...state.jobs[job.id] });
    };
    const started = performance.now();
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          await processJob(job);
        }
      }),
    );
    await tail;
    const counts = { completed: 0, failed: 0, cancelled: 0 };
    for (const result of Object.values(state.jobs))
      if (Object.hasOwn(counts, result.status)) counts[result.status]++;
    return {
      key,
      algorithm,
      ...counts,
      cacheHits,
      elapsedMs: performance.now() - started,
      peakRSS,
      jobs: state.jobs,
      manifest: manifestFile,
    };
  } finally {
    await unlink(lockFile);
  }
}
