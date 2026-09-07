import { Worker } from "node:worker_threads";
import { serialize } from "node:v8";
const failure = (code, message) => Object.assign(new Error(message), { code });
export function createAuthoringWorkerPool({
  concurrency = 2,
  maxQueue = 16,
  timeoutMs = 60000,
  maxMemoryMB = 512,
  maxResultBytes = 192 * 1024 * 1024,
} = {}) {
  for (const [name, value, min, max] of [
    ["concurrency", concurrency, 1, 8],
    ["maxQueue", maxQueue, 0, 1024],
    ["timeoutMs", timeoutMs, 1, 600000],
    ["maxMemoryMB", maxMemoryMB, 32, 4096],
    ["maxResultBytes", maxResultBytes, 1024, 512 * 1024 * 1024],
  ])
    if (!Number.isInteger(value) || value < min || value > max)
      throw failure("AUTHORING_JOB_CONFIGURATION", `Invalid ${name}.`);
  const queue = [],
    active = new Set();
  let closed = false,
    next = 0,
    closing = null;
  const totals = {
    completed: 0,
    failed: 0,
    cancelled: 0,
    inputBytes: 0,
    resultBytes: 0,
  };
  function drain() {
    while (!closed && active.size < concurrency && queue.length) {
      const job = queue.shift();
      if (job.finished) continue;
      active.add(job);
      try {
        job.worker = new Worker(new URL("./worker.js", import.meta.url), {
          workerData: { kind: job.kind, payload: job.payload, maxResultBytes },
          resourceLimits: {
            maxOldGenerationSizeMb: maxMemoryMB,
            maxYoungGenerationSizeMb: 32,
          },
        });
      } catch (error) {
        finish(job, error);
        continue;
      }
      job.timer = setTimeout(
        () =>
          finish(
            job,
            failure(
              "AUTHORING_JOB_TIMEOUT",
              "Background work exceeded its time budget.",
            ),
          ),
        timeoutMs,
      );
      job.worker.on("message", (message) => {
        if (job.finished) return;
        if (message.type === "progress") {
          try {
            job.onProgress({ id: job.id, stage: message.stage });
          } catch (error) {
            finish(job, error);
          }
        } else if (message.type === "error")
          finish(
            job,
            Object.assign(new Error(message.error.message), message.error),
          );
        else if (message.type === "result") {
          totals.resultBytes += message.transferBytes;
          finish(job, null, {
            ...message,
            result: message.result,
            id: job.id,
            inputBytes: job.inputBytes,
          });
        }
      });
      job.worker.on("error", (error) => finish(job, error));
      job.worker.on("exit", (code) => {
        if (!job.finished)
          finish(
            job,
            failure(
              "AUTHORING_JOB_TERMINATED",
              `Worker exited before returning a result (${code}).`,
            ),
          );
      });
    }
  }
  function finish(job, error, result) {
    if (job.completion) return job.completion;
    job.finished = true;
    job.completion = (async () => {
      clearTimeout(job.timer);
      job.signal?.removeEventListener("abort", job.abort);
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
      if (job.worker) await job.worker.terminate();
      active.delete(job);
      if (error) {
        totals[
          error.code === "AUTHORING_JOB_CANCELLED" ? "cancelled" : "failed"
        ]++;
        job.reject(error);
      } else {
        totals.completed++;
        job.resolve(result);
      }
      drain();
    })();
    return job.completion;
  }
  return {
    run(kind, payload, { signal, onProgress = () => {} } = {}) {
      if (closed)
        return Promise.reject(
          failure("AUTHORING_JOB_CLOSED", "Worker pool is closed."),
        );
      if (signal?.aborted)
        return Promise.reject(
          failure("AUTHORING_JOB_CANCELLED", "Background work cancelled."),
        );
      if (active.size >= concurrency && queue.length >= maxQueue)
        return Promise.reject(
          failure("AUTHORING_JOB_QUEUE_FULL", "Background queue is full."),
        );
      const inputBytes = serialize(payload).byteLength;
      if (inputBytes > maxResultBytes)
        return Promise.reject(
          failure(
            "AUTHORING_JOB_INPUT_BUDGET",
            "Background input exceeds transfer budget.",
          ),
        );
      totals.inputBytes += inputBytes;
      return new Promise((resolve, reject) => {
        const job = {
          id: `job-${next++}`,
          kind,
          payload,
          signal,
          onProgress,
          resolve,
          reject,
          inputBytes,
          finished: false,
        };
        job.abort = () =>
          finish(
            job,
            failure("AUTHORING_JOB_CANCELLED", "Background work cancelled."),
          );
        signal?.addEventListener("abort", job.abort, { once: true });
        queue.push(job);
        drain();
      });
    },
    statistics() {
      return { closed, active: active.size, queued: queue.length, ...totals };
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = Promise.all(
        [...active, ...queue].map((job) =>
          finish(
            job,
            failure(
              "AUTHORING_JOB_CANCELLED",
              "Project closed during background work.",
            ),
          ),
        ),
      );
      return closing;
    },
    async terminateActive() {
      await Promise.all(
        [...active].map((job) =>
          finish(
            job,
            failure(
              "AUTHORING_JOB_TERMINATED",
              "Worker explicitly terminated.",
            ),
          ),
        ),
      );
    },
  };
}
