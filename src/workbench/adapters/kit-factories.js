import { editorError } from "../host-contract.js";
/** Node resolver. The browser build substitutes a statically linked, trusted catalog. */
export async function resolveKitFactory(entry) {
  const source = entry?.source;
  if (source?.registryId !== "nexusengine-core" || source.installable !== true ||
      !/^\.\/domains\/[a-z0-9/-]+$/.test(source.subpath ?? "") ||
      !/^[A-Za-z_$][\w$]*$/.test(source.exportName ?? "")) {
    throw editorError("EDITOR_KIT_UNTRUSTED", "Only installed Core registry factories may execute.");
  }
  const module = await import(`nexusengine/${source.subpath.slice(2)}`);
  const factory = module[source.exportName];
  if (typeof factory !== "function") throw editorError("EDITOR_KIT_FACTORY", `Missing Core factory ${source.exportName}.`);
  return factory;
}
export function kitAvailability() { return null; }
