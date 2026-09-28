import { assertHost, editorError } from "./host-contract.js";
/** GUI editing policy shared by both host transports; Core validates every mutation. */
export function createSceneCommands(adapter, { requestId = () => crypto.randomUUID() } = {}) {
  const host = assertHost(adapter);
  const submit = (state, operations) => host.execute("execute", {
    requestId: requestId(), epoch: state.status.context.epoch, operations,
  });
  function assertEditable(state) {
    if (state.workbench?.play?.state !== "stopped") throw editorError("EDITOR_SOURCE_PROTECTED", "Stop Play before editing source.");
  }
  return Object.freeze({
    async createPrimitive(type) {
      const state = await host.state(); assertEditable(state);
      const id = `${type}-${requestId()}`;
      const node = { id: `${id}-node`, name: type[0].toUpperCase() + type.slice(1), meshId: id };
      const assembly = state.assembly;
      // Creation and scene attachment share ONE Project transaction. No orphan mesh on failure.
      await submit(state, [
        { id: "mesh.primitive", args: { id, parameters: { type } } },
        { id: "assembly.set", args: { id: state.assemblyId, ...(assembly ? { expectedRevision: assembly.revision } : {}),
          content: { ...(assembly?.content ?? { nodes: [] }), nodes: [...(assembly?.content.nodes ?? []), node] } } },
      ]);
      return node.id;
    },
    async updateNode(nodeId, patch) {
      const state = await host.state(); assertEditable(state);
      const assembly = state.assembly;
      const node = assembly?.content.nodes.find(n => n.id === nodeId);
      if (!node) throw editorError("EDITOR_NODE_MISSING", `No scene node ${nodeId}.`);
      return submit(state, [{ id: "assembly.node", args: { id: state.assemblyId,
        expectedRevision: assembly.revision, node: { ...node, ...structuredClone(patch), id: node.id } } }]);
    },
    async duplicateNode(nodeId) {
      const state = await host.state(); assertEditable(state);
      const assembly = state.assembly;
      if (!assembly) throw editorError("EDITOR_SCENE_MISSING", "No assembly is selected.");
      const newId = `${nodeId}-copy-${requestId()}`;
      await submit(state, [{ id: "assembly.duplicate", args: { id: state.assemblyId,
        expectedRevision: assembly.revision, nodeId, newId } }]);
      return newId;
    },
    async deleteNode(nodeId) {
      const state = await host.state(); assertEditable(state);
      const assembly = state.assembly;
      if (!assembly?.content.nodes.some(n => n.id === nodeId)) throw editorError("EDITOR_NODE_MISSING", `No scene node ${nodeId}.`);
      if (assembly.content.nodes.some(n => n.parent === nodeId)) throw editorError("EDITOR_NODE_HAS_CHILDREN", "Reparent or remove child nodes first.");
      const content = { ...assembly.content, nodes: assembly.content.nodes.filter(n => n.id !== nodeId),
        cameras: assembly.content.cameras.filter(c => c.nodeId !== nodeId),
        lights: assembly.content.lights.filter(l => l.nodeId !== nodeId) };
      return submit(state, [{ id: "assembly.set", args: { id: state.assemblyId, expectedRevision: assembly.revision, content } }]);
    },
    async travel(direction) {
      if (!["undo", "redo"].includes(direction)) throw new TypeError("Invalid history direction.");
      const state = await host.state(); assertEditable(state);
      return host.execute(direction, { requestId: requestId(), epoch: state.status.context.epoch });
    },
  });
}
