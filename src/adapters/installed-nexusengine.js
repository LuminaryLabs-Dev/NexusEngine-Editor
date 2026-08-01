import * as Runtime from "nexusengine";
import * as Composition from "nexusengine/domains/composition";

async function resolveRegistryFactory(source = {}) {
  if (source.registryId !== "nexusengine-core" || source.package !== "nexusengine") return null;
  if (source.installable !== true || !source.subpath || !source.exportName) return null;
  const specifier = source.subpath === "."
    ? "nexusengine"
    : `nexusengine/${source.subpath.replace(/^\.\//, "")}`;
  const module = await import(specifier);
  return typeof module[source.exportName] === "function" ? module[source.exportName] : null;
}

export const NexusEngine = Object.freeze({
  ...Runtime,
  ...Composition,
  resolveRegistryFactory
});

export default NexusEngine;
