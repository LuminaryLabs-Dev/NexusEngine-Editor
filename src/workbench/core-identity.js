import manifest from "../../package.json" with { type: "json" };
export const CORE_IDENTITY = Object.freeze({ ...manifest.nexusEngineArtifact });
