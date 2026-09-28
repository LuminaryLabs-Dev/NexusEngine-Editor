import { editorError } from "./host-contract.js";
import { kitAvailability } from "./adapters/kit-factories.js";
const clone = x => structuredClone(x);
const domainId = path => `domain:${path}`;
const kitNodeId = id => `kit:${id}`;

export function createCompositionController(host, { compositionId = "project-composition", rootDomainPath = "n:runtime" } = {}) {
  const service = host.engine.n.authoringDomainComposition;
  const registry = () => service.discover();
  const read = () => host.list("domain-composition").some(d => d.id === compositionId) ? host.read(compositionId) : null;
  function fresh() {
    const r = registry();
    const root = r.domains.find(d => d.domainPath === rootDomainPath) ?? r.domains.find(d => d.parentDomainPath === null);
    if (!root) throw editorError("EDITOR_COMPOSITION_ROOT", "No composition root is available.");
    return { schema: "nexusengine.composition-tree/1", id: compositionId, revision: 1,
      registryHash: r.contentHash, rootNodeId: domainId(root.domainPath),
      nodes: [{ id: domainId(root.domainPath), kind: "domain", registryId: root.id,
        parentNodeId: null, order: 0, enabled: true, labelOverride: "Game Composition", config: {} }] };
  }
  async function commit(content, reason) {
    const doc = read();
    const validation = service.validate(content);
    if (!validation.ok) throw editorError("EDITOR_COMPOSITION_INVALID", `Composition rejected: ${reason}.`, { validation });
    const receipt = await host.command({ requestId: host.requestId(), epoch: host.status().context.epoch,
      operations: [{ id: "domain-composition.set", args: { id: compositionId,
        ...(doc ? { expectedRevision: doc.revision } : {}), content } }] });
    return { receipt, document: read(), validation };
  }
  function addDomain(nodes, path, r, root) {
    const exists = new Set(nodes.map(n => n.id));
    const byPath = new Map(r.domains.map(d => [d.domainPath, d]));
    const chain = [], visiting = new Set();
    let current = byPath.get(path);
    if (!current) throw editorError("EDITOR_DOMAIN_UNKNOWN", `Unknown domain ${path}.`);
    while (current && !exists.has(domainId(current.domainPath))) {
      if (visiting.has(current.domainPath)) throw editorError("EDITOR_DOMAIN_CYCLE", "Registry ancestry is cyclic.");
      visiting.add(current.domainPath); chain.push(current);
      current = current.parentDomainPath ? byPath.get(current.parentDomainPath) : null;
    }
    for (const domain of chain.reverse()) {
      const parent = domain.parentDomainPath ? domainId(domain.parentDomainPath) : root;
      if (!exists.has(parent)) throw editorError("EDITOR_DOMAIN_PARENT", `Missing registry parent ${parent}.`);
      nodes.push({ id: domainId(domain.domainPath), kind: "domain", registryId: domain.id,
        parentNodeId: parent, order: nodes.length, enabled: true, labelOverride: null, config: {} });
      exists.add(domainId(domain.domainPath));
    }
  }
  function appendKit(content, kit, r, config = {}) {
    addDomain(content.nodes, kit.domainPath, r, content.rootNodeId);
    content.nodes.push({ id: kitNodeId(kit.id), kind: "kit", registryId: kit.id,
      parentNodeId: domainId(kit.domainPath), order: content.nodes.length, enabled: true, labelOverride: null, config: clone(config) });
  }
  function withKits(content, specifications) {
    const r = registry(), byId = new Map(r.kits.map(k => [k.id, k]));
    const active = () => new Set(content.nodes.filter(n => n.kind === "kit" && n.enabled !== false).map(n => n.registryId));
    const visiting = new Set();
    function include(id, config = {}) {
      if (active().has(id)) return;
      const kit = byId.get(id);
      if (!kit) throw editorError("EDITOR_KIT_UNKNOWN", `Unknown Core kit ${id}.`);
      const availability = kitAvailability(id);
      if (availability && availability.status !== "available") throw editorError("EDITOR_KIT_UNAVAILABLE", availability.reason, { id, availability });
      if (visiting.has(id)) throw editorError("EDITOR_KIT_DEPENDENCY_CYCLE", `Dependency cycle at ${id}.`);
      if (content.nodes.some(n => n.id === kitNodeId(id))) throw editorError("EDITOR_KIT_DISABLED", `Enable existing ${id} before adding it.`);
      visiting.add(id);
      for (const token of kit.requires ?? []) {
        if ([...active()].some(k => byId.get(k)?.provides.includes(token))) continue;
        const choices = r.kits.filter(k => k.provides.includes(token) && !["blocked", "unsupported", "retired"].includes(k.status));
        if (choices.length !== 1) throw editorError(choices.length ? "EDITOR_KIT_DEPENDENCY_AMBIGUOUS" : "EDITOR_KIT_DEPENDENCY_MISSING",
          `Choose a provider for ${token}; no provider was guessed.`, { kitId: id, token, candidates: choices.map(k => k.id) });
        include(choices[0].id);
      }
      for (const child of kit.composes ?? []) include(child);
      appendKit(content, kit, r, config); visiting.delete(id);
    }
    for (const item of specifications) include(item.kitId, item.config ?? {});
    content.registryHash = r.contentHash;
    return content;
  }
  return Object.freeze({
    compositionId, read, registry,
    async ensure() { return read() ?? (await commit(fresh(), "create composition")).document; },
    async addKit(kitId, config = {}) {
      const current = read();
      if (current?.content.nodes.some(n => n.id === kitNodeId(kitId) && n.enabled !== false)) return { document: current, noOp: true, validation: service.validate(current.content) };
      const content = withKits(clone(current?.content ?? fresh()), [{ kitId, config }]);
      if (current) content.revision++;
      return commit(content, `add ${kitId}`);
    },
    // Used by the proof-scene recipe to stage the WHOLE composition before its source transaction.
    prepareKits(specifications) {
      const current = read(), content = withKits(clone(current?.content ?? fresh()), specifications);
      if (current) content.revision++;
      const validation = service.validate(content);
      if (!validation.ok) throw editorError("EDITOR_COMPOSITION_INVALID", "Kit preparation failed.", { validation });
      return { content, revision: current?.revision ?? null };
    },
    async removeKit(kitId) {
      const doc = read();
      if (!doc || !doc.content.nodes.some(n => n.id === kitNodeId(kitId))) return { noOp: true, document: doc };
      const content = clone(doc.content);
      content.nodes = content.nodes.filter(n => n.id !== kitNodeId(kitId));
      let changed = true;
      while (changed) {
        const parents = new Set(content.nodes.map(n => n.parentNodeId));
        const before = content.nodes.length;
        content.nodes = content.nodes.filter(n => n.kind !== "domain" || n.id === content.rootNodeId || parents.has(n.id));
        changed = content.nodes.length !== before;
      }
      content.revision++; content.registryHash = registry().contentHash;
      return commit(content, `remove ${kitId}`); // Core rejects stranded dependencies.
    },
    async configureNode(nodeId, config) {
      const doc = read(); if (!doc) throw editorError("EDITOR_COMPOSITION_MISSING", "Create a composition first.");
      const content = clone(doc.content), node = content.nodes.find(n => n.id === nodeId);
      if (!node) throw editorError("EDITOR_COMPOSITION_NODE", `Unknown node ${nodeId}.`);
      node.config = clone(config); content.revision++;
      return commit(content, `configure ${nodeId}`);
    },
    async setEnabled(nodeId, enabled) {
      const doc = read(); if (!doc) throw editorError("EDITOR_COMPOSITION_MISSING", "Create a composition first.");
      const content = clone(doc.content), node = content.nodes.find(n => n.id === nodeId);
      if (!node) throw editorError("EDITOR_COMPOSITION_NODE", `Unknown node ${nodeId}.`);
      node.enabled = Boolean(enabled); content.revision++;
      return commit(content, `enable ${nodeId}`);
    },
    validate: () => service.validate(read()?.content),
    plan: () => service.plan(compositionId),
  });
}
