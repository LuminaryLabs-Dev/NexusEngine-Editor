export function createEditorBuildController({ stateRoot, artifactRoot, config = {}, factory = null } = {}) {
  let buildPromise = null;
  const get = async () => {
    if (!buildPromise) {
      buildPromise = factory
        ? Promise.resolve().then(() => factory({ stateRoot, artifactRoot, config }))
        : import("nexusengine/domains/build").then(({ createBuildDomain }) => createBuildDomain({ ...config, ...(stateRoot ? { stateRoot } : {}), ...(artifactRoot ? { artifactRoot } : {}) }));
    }
    return buildPromise;
  };
  return Object.freeze({
    async listTargets() { return (await get()).listTargets(); },
    async inspect(project) { return (await get()).inspect(project); },
    async plan(request) { return (await get()).plan(request); },
    async apply(planId, approval, options) { return (await get()).apply(planId, approval, options); },
    async receipt(planId) { return (await get()).getReceipt(planId); },
    async snapshot() { return (await get()).snapshot(); },
    async reset() { return (await get()).reset(); },
  });
}
