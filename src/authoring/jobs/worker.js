import { parentPort, workerData } from "node:worker_threads";
import { serialize } from "node:v8";
import { createAuthoringRuntime } from "../runtime-composition.js";
import { encodeAuthoringGLB } from "../export/glb.js";
import { authoringErrorRecord } from "../command-router.js";
let runtime;
const progress = (stage) => parentPort.postMessage({ type: "progress", stage });
try {
  const { kind, payload, maxResultBytes } = workerData;
  progress("started");
  let result;
  if (kind === "encode-glb") {
    progress("encoding");
    result = encodeAuthoringGLB(payload.packet);
  } else {
    runtime = createAuthoringRuntime({ projectId: payload.snapshot.projectId });
    runtime.project.recover(payload.snapshot, []);
    progress("source-restored");
    if (kind === "modifier") {
      progress("evaluating");
      result = runtime.engine.n.authoringModifier.evaluate(payload.id);
    } else if (kind === "texture-bake") {
      progress("baking");
      const image = runtime.project.getDocument(payload.id),
        material = runtime.project.getDocument(payload.materialId);
      result = runtime.engine.n.authoringPaint.bakeImage(
        image.content,
        material.content,
        payload.layerId,
        { maxPixels: 16777216 },
      );
    } else
      throw Object.assign(new Error("Unknown background evaluation."), {
        code: "AUTHORING_JOB_KIND",
      });
  }
  const bytes = serialize(result).byteLength;
  if (bytes > maxResultBytes)
    throw Object.assign(
      new Error("Background result exceeds transfer budget."),
      { code: "AUTHORING_JOB_RESULT_BUDGET" },
    );
  progress("completed");
  parentPort.postMessage({ type: "result", result, transferBytes: bytes });
} catch (error) {
  parentPort.postMessage({ type: "error", error: authoringErrorRecord(error) });
} finally {
  runtime?.dispose();
}
