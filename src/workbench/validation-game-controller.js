import { editorError } from "./host-contract.js";
const transform = (translation = [0, 0, 0], scale = [1, 1, 1]) => ({ translation, rotation: [0, 0, 0, 1], scale });
export function createValidationGameController(host, composition) {
  return Object.freeze({
    async create() {
      if (host.list().length > (composition.read() ? 1 : 0)) throw editorError("EDITOR_GAME_EXISTS", "Create the proof scene in a new, empty project.");
      const prepared = composition.prepareKits(["input-contract-kit", "body-state-kit", "box-shape-kit"].map(kitId => ({ kitId })));
      const operations = [
        ...["player", "ground", "goal"].map(id => ({ id: "mesh.cube", args: { id } })),
        { id: "material.set", args: { id: "player-material", content: { baseColor: [0.2, 0.55, 1, 1], metallic: 0.05, roughness: 0.55 } } },
        { id: "material.set", args: { id: "ground-material", content: { baseColor: [0.14, 0.18, 0.22, 1], roughness: 0.95 } } },
        { id: "material.set", args: { id: "goal-material", content: { baseColor: [1, 0.68, 0.12, 1], emissive: [0.15, 0.08, 0], roughness: 0.45 } } },
        { id: "sequence.set", args: { id: "game-sequence", content: { during: [{ id: "begin", operations: [{ id: "material.set", args: { id: "play-state", content: { baseColor: [0.2, 0.9, 0.35, 1] } } }] }] } } },
        { id: "assembly.set", args: { id: "scene", content: {
          nodes: [
            { id: "ground-node", name: "Ground", meshId: "ground", materials: ["ground-material"], transform: transform([0, -1.2, 0], [8, .2, 8]) },
            { id: "player-node", name: "Player", meshId: "player", materials: ["player-material"], transform: transform([0, 0, 0], [.65, .65, .65]) },
            { id: "goal-node", name: "Goal", meshId: "goal", materials: ["goal-material"], transform: transform([3, 0, 0], [.55, .55, .55]) },
            { id: "camera-node", name: "Game Camera", transform: { translation: [0, 4.5, 8], rotation: [-.23, 0, 0, .973], scale: [1, 1, 1] } },
            { id: "light-node", name: "Key Light", transform: transform([4, 7, 4]) },
          ],
          cameras: [{ id: "main-camera", nodeId: "camera-node", yfov: .7, near: .1, far: 100 }],
          lights: [{ id: "key-light", nodeId: "light-node", type: "directional", color: [1, .95, .86], intensity: 2.2 }],
        } } },
        { id: "domain-composition.set", args: { id: composition.compositionId,
          ...(prepared.revision !== null ? { expectedRevision: prepared.revision } : {}), content: prepared.content } },
      ];
      await host.command({ requestId: host.requestId(), epoch: host.status().context.epoch, operations });
      return this.status();
    },
    status() {
      const ids = new Set(host.list().map(d => d.id));
      return { ready: ["scene", "player", "ground", "goal"].every(id => ids.has(id)),
        assemblyId: ids.has("scene") ? "scene" : null, controlledNodeId: "player-node",
        sequenceId: ids.has("game-sequence") ? "game-sequence" : null,
        previewBehavior: "authoring-transform-motion", physicsExecution: false,
        selectedKits: (composition.read()?.content.nodes ?? []).filter(n => n.kind === "kit" && n.enabled !== false).map(n => n.registryId) };
    },
  });
}
