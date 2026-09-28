import { kitAvailability } from "./adapters/kit-factories.js";
const clone = value => value === undefined ? undefined : structuredClone(value);
export function getWorkbenchCatalog(engine, compositionId = "project-composition") {
  const registry = engine.n.authoringDomainComposition.discover();
  const installed = new Set(engine.kits.map(k => k.id));
  const paths = new Set((engine.n.paths?.() ?? []).map(x => x.path));
  const apis = new Set((engine.n.apis?.() ?? []).map(x => x.apiName));
  const document = engine.n.authoringProject.listDocuments("domain-composition").some(d => d.id === compositionId)
    ? engine.n.authoringProject.getDocument(compositionId) : null;
  const nodes = document?.content.nodes ?? [];
  const selected = new Set(nodes.filter(n => n.kind === "kit" && n.enabled !== false).map(n => n.registryId));
  return {
    schema: "nexusengine.editor-workbench-catalog/1", registryHash: registry.contentHash,
    domains: registry.domains.map(d => ({ ...clone(d), installed: paths.has(d.domainPath), selected: nodes.some(n => n.kind === "domain" && n.registryId === d.id && n.enabled !== false) })),
    kits: registry.kits.map(k => ({ ...clone(k), installed: installed.has(k.id), selected: selected.has(k.id), apiAvailable: apis.has(k.apiName), environmentAvailability: kitAvailability(k.id) })),
    recipes: clone(registry.recipes),
  };
}
export function catalogSummary(catalog) {
  return { domains: catalog.domains.length, kits: catalog.kits.length,
    installedDomains: catalog.domains.filter(d => d.installed).length,
    installedKits: catalog.kits.filter(k => k.installed).length,
    selectedKits: catalog.kits.filter(k => k.selected).length };
}
