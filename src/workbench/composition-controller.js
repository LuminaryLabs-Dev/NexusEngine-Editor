const copy = (value) => structuredClone(value);
const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });

function registryMaps(registry) {
  return {
    domainsById: new Map(registry.domains.map((record) => [record.id, record])),
    domainsByPath: new Map(registry.domains.map((record) => [record.domainPath, record])),
    kitsById: new Map(registry.kits.map((record) => [record.id, record])),
    providersByToken: new Map([...new Set(registry.kits.flatMap((record) => record.provides ?? []))].map((token) => [token, registry.kits.filter((record) => (record.provides ?? []).includes(token))])),
  };
}
function nodeIdForDomain(path) { return `domain:${path}`; }
function nodeIdForKit(id) { return `kit:${id}`; }
function pruneDomains(nodes, rootNodeId) {
  let next = [...nodes], changed = true;
  while (changed) {
    changed = false;
    const parentIds = new Set(next.map((node) => node.parentNodeId).filter(Boolean));
    const removable = new Set(next.filter((node) => node.kind === "domain" && node.id !== rootNodeId && !parentIds.has(node.id)).map((node) => node.id));
    if (removable.size) { next = next.filter((node) => !removable.has(node.id)); changed = true; }
  }
  return next;
}

export function createCompositionController(host, { compositionId = "project-composition", rootDomainPath = "n:runtime" } = {}) {
  const engine = host.engine, service = engine.n.authoringDomainComposition, registry = () => service.discover();
  function read() { try { return host.read(compositionId); } catch { return null; } }

  async function commit(content, reason) {
    const existing = read(), validation = service.validate(content);
    if (!validation.ok) throw fail("EDITOR_COMPOSITION_INVALID", `Composition change rejected: ${reason}.`, { validation });
    const receipt = await host.command({ requestId: host.requestId(), epoch: host.status().context.epoch, operations: [{ id: "domain-composition.set", args: { id: compositionId, ...(existing ? { expectedRevision: existing.revision } : {}), content } }] });
    return { receipt, document: read(), validation };
  }

  async function ensure() {
    const existing = read(); if (existing) return existing;
    const current = registry(), root = current.domains.find((domain) => domain.domainPath === rootDomainPath) ?? current.domains.find((domain) => domain.parentDomainPath === null);
    if (!root) throw fail("EDITOR_COMPOSITION_ROOT", "Core registry has no top-level domain for composition root.");
    const content = { schema: "nexusengine.composition-tree/1", id: compositionId, revision: 1, registryHash: current.contentHash, rootNodeId: nodeIdForDomain(root.domainPath), nodes: [{ id: nodeIdForDomain(root.domainPath), kind: "domain", registryId: root.id, parentNodeId: null, order: 0, enabled: true, labelOverride: "Game Composition", config: {} }] };
    await commit(content, "create composition"); return read();
  }

  function addDomainChain(nodes, domainPath, maps, rootNodeId) {
    const byId = new Map(nodes.map((node) => [node.id, node])), chain = [];
    let record = maps.domainsByPath.get(domainPath);
    if (!record) throw fail("EDITOR_DOMAIN_UNKNOWN", `Unknown Core domain ${domainPath}.`);
    while (record && nodeIdForDomain(record.domainPath) !== rootNodeId) { chain.push(record); record = record.parentDomainPath ? maps.domainsByPath.get(record.parentDomainPath) : null; }
    chain.reverse();
    for (const domain of chain) {
      const id = nodeIdForDomain(domain.domainPath); if (byId.has(id)) continue;
      const parent = domain.parentDomainPath ? nodeIdForDomain(domain.parentDomainPath) : rootNodeId, parentId = byId.has(parent) ? parent : rootNodeId;
      const node = { id, kind: "domain", registryId: domain.id, parentNodeId: parentId, order: nodes.length, enabled: true, labelOverride: null, config: {} };
      nodes.push(node); byId.set(id, node);
    }
  }

  function addKitNode(content, kit, maps, config = {}) {
    const id = nodeIdForKit(kit.id); if (content.nodes.some((node) => node.id === id)) return;
    addDomainChain(content.nodes, kit.domainPath, maps, content.rootNodeId);
    content.nodes.push({ id, kind: "kit", registryId: kit.id, parentNodeId: nodeIdForDomain(kit.domainPath), order: content.nodes.length, enabled: true, labelOverride: null, config: copy(config) });
  }

  function resolveDependencies(content, kit, maps, resolving = new Set()) {
    if (resolving.has(kit.id)) throw fail("EDITOR_KIT_DEPENDENCY_CYCLE", `Dependency cycle while adding ${kit.id}.`);
    resolving.add(kit.id);
    const selected = () => new Set(content.nodes.filter((n) => n.kind === "kit" && n.enabled !== false).map((n) => n.registryId));
    for (const token of kit.requires ?? []) {
      const ids = selected();
      if ([...ids].some((id) => (maps.kitsById.get(id)?.provides ?? []).includes(token))) continue;
      const candidates = (maps.providersByToken.get(token) ?? []).filter((candidate) => !ids.has(candidate.id));
      if (candidates.length !== 1) throw fail(candidates.length ? "EDITOR_KIT_DEPENDENCY_AMBIGUOUS" : "EDITOR_KIT_DEPENDENCY_MISSING", `Cannot automatically resolve ${token} for ${kit.id}.`, { token, kitId: kit.id, candidates: candidates.map((c) => c.id) });
      resolveDependencies(content, candidates[0], maps, resolving);
      addKitNode(content, candidates[0], maps, {});
    }
    resolving.delete(kit.id);
  }

  async function addKit(kitId, config = {}) {
    const doc = await ensure(), current = registry(), maps = registryMaps(current), kit = maps.kitsById.get(kitId);
    if (!kit) throw fail("EDITOR_KIT_UNKNOWN", `Unknown Core kit ${kitId}.`);
    const content = copy(doc.content);
    if (content.nodes.some((n) => n.id === nodeIdForKit(kitId))) return { document: doc, validation: service.validate(content), noOp: true };
    resolveDependencies(content, kit, maps);
    addKitNode(content, kit, maps, config);
    content.revision += 1; content.registryHash = current.contentHash;
    return commit(content, `add kit ${kitId}`);
  }

  async function removeKit(kitId) {
    const doc = await ensure(), content = copy(doc.content), id = nodeIdForKit(kitId);
    if (!content.nodes.some((n) => n.id === id)) return { document: doc, validation: service.validate(content), noOp: true };
    const registrySnapshot = registry(), maps = registryMaps(registrySnapshot), remaining = new Set(content.nodes.filter((n) => n.kind === "kit" && n.id !== id && n.enabled !== false).map((n) => n.registryId)), removed = maps.kitsById.get(kitId);
    const blocked = [...remaining].filter((otherId) => {
      const other = maps.kitsById.get(otherId);
      return (other?.requires ?? []).some((token) => (removed?.provides ?? []).includes(token) && ![...remaining].some((candidateId) => (maps.kitsById.get(candidateId)?.provides ?? []).includes(token)));
    });
    if (blocked.length) throw fail("EDITOR_KIT_REQUIRED", `${kitId} is required by selected kits.`, { kitId, dependents: blocked });
    content.nodes = pruneDomains(content.nodes.filter((node) => node.id !== id), content.rootNodeId);
    content.revision += 1; content.registryHash = registrySnapshot.contentHash;
    return commit(content, `remove kit ${kitId}`);
  }

  async function configureNode(nodeId, config) {
    const doc = await ensure(), content = copy(doc.content), node = content.nodes.find((entry) => entry.id === nodeId);
    if (!node) throw fail("EDITOR_COMPOSITION_NODE", `Unknown composition node ${nodeId}.`);
    node.config = copy(config ?? {}); content.revision += 1; content.registryHash = registry().contentHash;
    return commit(content, `configure ${nodeId}`);
  }

  async function setEnabled(nodeId, enabled) {
    const doc = await ensure(), content = copy(doc.content), node = content.nodes.find((entry) => entry.id === nodeId);
    if (!node) throw fail("EDITOR_COMPOSITION_NODE", `Unknown composition node ${nodeId}.`);
    node.enabled = Boolean(enabled); content.revision += 1; content.registryHash = registry().contentHash;
    return commit(content, `${enabled ? "enable" : "disable"} ${nodeId}`);
  }

  return Object.freeze({ compositionId, ensure, read, addKit, removeKit, configureNode, setEnabled, validate: () => service.validate(read()?.content), plan: () => service.plan(compositionId), registry });
}
