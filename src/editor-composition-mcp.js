const clone = (value) => value === undefined ? undefined : structuredClone(value);

function slug(value) {
  return String(value ?? "node")
    .replace(/^n:/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "node";
}

function uniqueNodeId(tree, prefix) {
  const ids = new Set(tree.nodes.map((node) => node.id));
  let id = prefix;
  let sequence = 1;
  while (ids.has(id)) id = `${prefix}-${++sequence}`;
  return id;
}

function registryMaps(registry) {
  return {
    domainsById: new Map(registry.domains.map((record) => [record.id, record])),
    domainsByPath: new Map(registry.domains.map((record) => [record.domainPath, record])),
    kitsById: new Map(registry.kits.map((record) => [record.id, record]))
  };
}

export function stageEditorCompositionPlan(options = {}) {
  const { NexusEngine, registry, accepted, plan } = options;
  if (typeof NexusEngine?.normalizeCompositionTree !== "function") {
    throw new TypeError("Editor composition staging requires NexusEngine.normalizeCompositionTree.");
  }
  if (!registry || !accepted || !plan?.ok) {
    throw new TypeError("Editor composition staging requires an accepted tree, registry, and valid plan.");
  }
  const tree = clone(NexusEngine.normalizeCompositionTree(accepted));
  const maps = registryMaps(registry);
  const domainNodesByPath = new Map();
  const kitNodesByRegistryId = new Map();

  for (const node of tree.nodes) {
    if (node.kind === "domain") {
      const record = maps.domainsById.get(node.registryId);
      if (record) domainNodesByPath.set(record.domainPath, node);
    } else if (node.kind === "kit") {
      kitNodesByRegistryId.set(node.registryId, node);
    }
  }

  function ensureDomain(domainPath) {
    const existing = domainNodesByPath.get(domainPath);
    if (existing) return existing;
    const record = maps.domainsByPath.get(domainPath);
    if (!record) throw new Error(`Editor registry has no Domain record for ${domainPath}.`);
    const parentNode = record.parentDomainPath
      ? ensureDomain(record.parentDomainPath)
      : tree.nodes.find((node) => node.id === tree.rootNodeId);
    if (!parentNode) throw new Error(`Editor composition has no parent for Domain ${record.id}.`);
    const node = {
      id: uniqueNodeId(tree, `domain-${slug(record.id)}`),
      kind: "domain",
      registryId: record.id,
      parentNodeId: parentNode.id,
      order: tree.nodes.filter((entry) => entry.parentNodeId === parentNode.id).length,
      enabled: true,
      labelOverride: null,
      config: {}
    };
    tree.nodes.push(node);
    domainNodesByPath.set(domainPath, node);
    return node;
  }

  for (const entry of plan.order) {
    const registryId = typeof entry === "string" ? entry : entry.registryId;
    const config = typeof entry === "string" ? {} : entry.config ?? {};
    const kit = maps.kitsById.get(registryId);
    if (!kit) throw new Error(`Editor registry has no Kit record for ${registryId}.`);
    const existing = kitNodesByRegistryId.get(kit.id);
    if (existing) {
      existing.enabled = true;
      existing.config = { ...clone(kit.defaults ?? {}), ...clone(config) };
      continue;
    }
    const parentNode = ensureDomain(kit.domainPath);
    const node = {
      id: uniqueNodeId(tree, `kit-${slug(kit.id)}`),
      kind: "kit",
      registryId: kit.id,
      parentNodeId: parentNode.id,
      order: tree.nodes.filter((candidate) => candidate.parentNodeId === parentNode.id).length,
      enabled: true,
      labelOverride: null,
      config: { ...clone(kit.defaults ?? {}), ...clone(config) }
    };
    tree.nodes.push(node);
    kitNodesByRegistryId.set(kit.id, node);
  }
  return NexusEngine.normalizeCompositionTree(tree);
}

function executableFingerprint(NexusEngine, kit, factory) {
  return NexusEngine.hashRegistryValue({
    engineVersion: NexusEngine.NEXUS_ENGINE_VERSION,
    kitId: kit.kitId,
    source: kit.source,
    implementation: Function.prototype.toString.call(factory)
  });
}

export function createEditorCompositionHost(options = {}) {
  const { NexusEngine, controller } = options;
  if (!controller?.supported || typeof controller.applyTree !== "function") {
    throw new TypeError("Editor composition host requires a supported Editor composition controller.");
  }
  return Object.freeze({
    async preflight({ request, plan, kits }) {
      try {
        const resolvedKits = [];
        for (const kit of kits) {
          const factory = await NexusEngine.resolveRegistryFactory?.(kit.source);
          if (typeof factory !== "function") {
            throw new Error(`Editor has no trusted executable factory for ${kit.kitId}.`);
          }
          resolvedKits.push({
            kitId: kit.kitId,
            executableFingerprint: executableFingerprint(NexusEngine, kit, factory)
          });
        }
        const tree = request.tree
          ? NexusEngine.normalizeCompositionTree(request.tree)
          : stageEditorCompositionPlan({
              NexusEngine,
              registry: controller.registry,
              accepted: controller.getAccepted(),
              plan
            });
        const validation = NexusEngine.validateCompositionTree(tree, controller.registry);
        if (!validation.ok) {
          return {
            ok: false,
            error: validation.errors?.[0]?.message ?? "Editor rejected the staged composition tree."
          };
        }
        return {
          ok: true,
          resolvedKits,
          staged: { tree, validation }
        };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    async captureSnapshot() {
      return { composition: controller.getAccepted() };
    },
    async restoreSnapshot(snapshot) {
      const result = controller.restoreTree(snapshot.composition);
      if (!result.ok) throw new Error("Editor composition rollback failed.");
      return result;
    },
    async apply({ prepared, staged }) {
      const result = controller.applyTree(staged.tree);
      if (!result.ok) {
        return {
          ok: false,
          error: result.report?.errors?.[0]?.message ?? "Editor failed to accept the prepared composition."
        };
      }
      return {
        ok: true,
        receipt: {
          projectRevision: result.composition.revision,
          registryHash: result.composition.registryHash,
          acceptedNodeCount: result.composition.nodes.length,
          planId: prepared.planId
        }
      };
    }
  });
}

export function createEditorCompositionMcpBridge(options = {}) {
  const {
    NexusEngine,
    controller,
    composition,
    mcp,
    project,
    persistProject
  } = options;
  if (!project) throw new TypeError("Editor composition MCP bridge requires a project.");
  const host = createEditorCompositionHost({ NexusEngine, controller });
  const applyController = NexusEngine.createCompositionApplyController({
    composition,
    host,
    initialSnapshot: project.compositionApplyState?.schema === NexusEngine.COMPOSITION_APPLY_STATE_SCHEMA
      ? project.compositionApplyState
      : undefined,
    async persist(snapshot) {
      project.compositionApplyState = clone(snapshot);
      await persistProject?.(project);
    }
  });
  const provider = NexusEngine.createCompositionMcpProvider({
    id: "nexusengine-editor-composition",
    composition,
    controller: applyController
  });
  if (mcp) mcp.registerProvider(provider);
  return Object.freeze({
    host,
    controller: applyController,
    provider,
    getSnapshot: () => applyController.getSnapshot(),
    close() {
      return mcp?.removeProvider?.(provider.id) ?? false;
    }
  });
}
