import { createEngine } from "nexusengine";
import { NEXUS_ENGINE_VERSION } from "nexusengine/release";
import {
  createAuthoringDomain,
  authoringDomainManifest,
} from "nexusengine/domains/authoring";
export function createAuthoringRuntime({
  projectId = "project",
  maxHistory = 128,
  maxReceipts = 10000,
} = {}) {
  const kits = createAuthoringDomain({
      project: { projectId, maxHistory, maxReceipts },
    }),
    engine = createEngine({ kits });
  const owners = new Map(engine.n.apis().map((api) => [api.apiName, api]));
  for (const manifest of authoringDomainManifest.publicKits) {
    const owner = owners.get(manifest.apiName);
    if (!owner || owner.ownerKitId !== manifest.id)
      throw Object.assign(
        new Error(`Authoring API owner mismatch: ${manifest.apiName}.`),
        { code: "AUTHORING_RUNTIME_INCOMPATIBLE" },
      );
  }
  const project = engine.n.authoringProject;
  for (const method of [
    "execute",
    "preview",
    "undo",
    "redo",
    "recover",
    "getSnapshot",
    "loadSnapshot",
    "tools",
  ])
    if (typeof project?.[method] !== "function")
      throw Object.assign(
        new Error(`Installed Engine lacks Authoring Project.${method}.`),
        { code: "AUTHORING_RUNTIME_INCOMPATIBLE" },
      );
  return {
    engine,
    project,
    kits: kits.map((k) => k.id),
    identity: Object.freeze({
      runtime: "nexusengine",
      version: NEXUS_ENGINE_VERSION,
      authoringSchema: engine.n.authoring.getContract().schema,
    }),
    dispose() {
      engine.n.authoringSequence.dispose();
      engine.n.authoringPublishing.clearCache();
    },
  };
}
