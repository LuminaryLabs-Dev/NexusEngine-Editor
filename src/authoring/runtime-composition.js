import { createEngine } from "nexusengine";
import { NEXUS_ENGINE_VERSION } from "nexusengine/release";
import { createAuthoringDomain, authoringDomainManifest } from "nexusengine/domains/authoring";

export function createAuthoringRuntime({ projectId = "project", maxHistory = 128, maxReceipts = 10000 } = {}) {
  const kits = createAuthoringDomain({ project: { projectId, maxHistory, maxReceipts } });
  const engine = createEngine({ kits });
  const owners = new Map(engine.n.apis().map((api) => [api.apiName, api]));
  for (const manifest of authoringDomainManifest.publicKits) {
    const owner = owners.get(manifest.apiName);
    if (!owner || owner.ownerKitId !== manifest.id) throw Object.assign(new Error(`Authoring API owner mismatch: ${manifest.apiName}.`), { code: "AUTHORING_RUNTIME_INCOMPATIBLE" });
  }
  const project = engine.n.authoringProject;
  for (const method of ["execute", "preview", "undo", "redo", "getSnapshot", "loadSnapshot", "tools", "validate", "withSourceGuard"])
    if (typeof project?.[method] !== "function") throw Object.assign(new Error(`Installed Engine lacks Authoring Project.${method}.`), { code: "AUTHORING_RUNTIME_INCOMPATIBLE" });
  for (const api of ["authoringCreate", "authoringImport", "authoringValidation", "authoringPersistence", "authoringExport"])
    if (!engine.n[api]) throw Object.assign(new Error(`Installed Engine lacks ${api}.`), { code: "AUTHORING_RUNTIME_INCOMPATIBLE" });
  return {
    engine, project, kits: kits.map((kit) => kit.id),
    identity: Object.freeze({
      runtime: "nexusengine", version: NEXUS_ENGINE_VERSION,
      authoringSchema: engine.n.authoring.getContract().schema,
      registryHash: engine.n.authoringDomainComposition.discover().contentHash,
      importFormats: engine.n.authoringImport.formats().map((entry) => entry.format),
      exportFormats: engine.n.authoringExport.formats().map((entry) => entry.format),
      canonicalAuthoring: true,
    }),
    dispose() { engine.n.authoringSequence.dispose(); engine.n.authoringPublishing.clearCache(); },
  };
}
