const clone = (value) => value === undefined ? undefined : structuredClone(value);

export function getWorkbenchCatalog(engine, compositionId = "project-composition") {
  const registry = engine.n.authoringDomainComposition.discover();
  const installedKitIds = new Set((engine.kits ?? []).map((kit) => kit.id));
  const installedPaths = new Set((engine.n.paths?.() ?? []).map((entry) => entry.path));
  const installedApis = new Set((engine.n.apis?.() ?? []).map((entry) => entry.name));
  let composition = null;
  try { composition = engine.n.authoringProject.getDocument(compositionId); } catch {}
  const selected = new Set((composition?.content.nodes ?? []).filter((node) => node.enabled !== false && node.kind === "kit").map((node) => node.registryId));
  return Object.freeze({
    schema: "nexusengine.editor-workbench-catalog/1",
    registryHash: registry.contentHash,
    domains: Object.freeze(registry.domains.map((domain) => Object.freeze({
      ...clone(domain),
      installed: installedPaths.has(domain.domainPath),
      selected: (composition?.content.nodes ?? []).some((node) => node.kind === "domain" && node.registryId === domain.id && node.enabled !== false),
    }))),
    kits: Object.freeze(registry.kits.map((kit) => Object.freeze({
      ...clone(kit),
      installed: installedKitIds.has(kit.id),
      selected: selected.has(kit.id),
      apiAvailable: kit.apiName ? installedApis.has(kit.apiName) : false,
    }))),
    recipes: Object.freeze(clone(registry.recipes)),
  });
}

export function catalogSummary(catalog) {
  return Object.freeze({
    domains: catalog.domains.length,
    kits: catalog.kits.length,
    installedDomains: catalog.domains.filter((entry) => entry.installed).length,
    installedKits: catalog.kits.filter((entry) => entry.installed).length,
    selectedKits: catalog.kits.filter((entry) => entry.selected).length,
  });
}
