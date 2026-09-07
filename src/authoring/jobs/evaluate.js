function capture(host, ids) {
  const sources = new Map();
  const visit = (id) => {
    if (sources.has(id)) return;
    const d = host.read(id);
    sources.set(id, { id: d.id, revision: d.revision, hash: d.hash });
    d.dependencies.forEach((ref) => visit(ref.id));
  };
  ids.forEach(visit);
  return [...sources.values()];
}
export async function evaluateAuthoringModifier(
  host,
  pool,
  id,
  { signal, onProgress, apply = false } = {},
) {
  const source = capture(host, [id]),
    snapshot = host.snapshot(),
    modifier = host.read(id),
    mesh = host.read(modifier.content.meshId),
    job = await pool.run("modifier", { snapshot, id }, { signal, onProgress });
  if (signal?.aborted)
    throw Object.assign(new Error("Evaluation cancelled."), {
      code: "AUTHORING_JOB_CANCELLED",
    });
  const operations = [
    {
      id: "mesh.replace",
      args: {
        id: mesh.id,
        expectedRevision: mesh.revision,
        mesh: job.result.mesh,
      },
    },
    {
      id: "modifier.set",
      args: {
        id,
        expectedRevision: modifier.revision,
        content: { ...modifier.content, stack: [] },
      },
    },
  ];
  return {
    ...job,
    source,
    receipt: apply ? await host.commitDerived(source, operations) : null,
  };
}
export async function bakeAuthoringTexture(
  host,
  pool,
  id,
  materialId,
  layerId,
  { signal, onProgress } = {},
) {
  const source = capture(host, [id, materialId]),
    snapshot = host.snapshot(),
    image = host.read(id),
    job = await pool.run(
      "texture-bake",
      { snapshot, id, materialId, layerId },
      { signal, onProgress },
    );
  if (signal?.aborted)
    throw Object.assign(new Error("Bake cancelled."), {
      code: "AUTHORING_JOB_CANCELLED",
    });
  const receipt = await host.commitDerived(source, [
    {
      id: "paint.set",
      args: { id, expectedRevision: image.revision, content: job.result.image },
    },
  ]);
  return { ...job, source, receipt };
}
