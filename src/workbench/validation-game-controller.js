const fail = (code, message, details = {}) => Object.assign(new Error(message), { code, details });
const transform = (translation = [0, 0, 0], scale = [1, 1, 1]) => ({ translation, rotation: [0, 0, 0, 1], scale });

export function createValidationGameController(host, composition) {
  async function command(operations) {
    return host.command({ requestId: host.requestId(), epoch: host.status().context.epoch, operations });
  }

  async function create() {
    if (host.list().some((d) => d.id === "scene")) throw fail("EDITOR_GAME_EXISTS", "Scene already exists; use a new project for the validation game.");
    await command([
      { id: "mesh.cube", args: { id: "player" } },
      { id: "mesh.cube", args: { id: "ground" } },
      { id: "mesh.cube", args: { id: "goal" } },
      { id: "material.set", args: { id: "player-material", content: { baseColor: [0.2, 0.55, 1, 1], metallic: 0.05, roughness: 0.55 } } },
      { id: "material.set", args: { id: "ground-material", content: { baseColor: [0.14, 0.18, 0.22, 1], metallic: 0, roughness: 0.95 } } },
      { id: "material.set", args: { id: "goal-material", content: { baseColor: [1, 0.68, 0.12, 1], emissive: [0.15, 0.08, 0], metallic: 0, roughness: 0.45 } } },
      { id: "sequence.set", args: { id: "game-sequence", content: { during: [{ id: "begin", operations: [{ id: "material.set", args: { id: "play-state", content: { baseColor: [0.2, 0.9, 0.35, 1], roughness: 0.5 } } }] }] } } },
      { id: "assembly.set", args: { id: "scene", content: {
        nodes: [
          { id: "ground-node", name: "Ground", meshId: "ground", materials: ["ground-material"], transform: transform([0, -1.2, 0], [8, 0.2, 8]) },
          { id: "player-node", name: "Player", meshId: "player", materials: ["player-material"], transform: transform([0, 0, 0], [0.65, 0.65, 0.65]) },
          { id: "goal-node", name: "Goal", meshId: "goal", materials: ["goal-material"], transform: transform([3, 0, 0], [0.55, 0.55, 0.55]) },
          { id: "camera-node", name: "Game Camera", transform: { translation: [0, 4.5, 8], rotation: [-0.23, 0, 0, 0.973], scale: [1, 1, 1] } },
          { id: "light-node", name: "Key Light", transform: transform([4, 7, 4]) }
        ],
        cameras: [{ id: "main-camera", nodeId: "camera-node", yfov: 0.7, near: 0.1, far: 100 }],
        lights: [{ id: "key-light", nodeId: "light-node", type: "directional", color: [1, 0.95, 0.86], intensity: 2.2 }]
      } } }
    ]);
    await composition.ensure();
    for (const kitId of ["input-contract-kit", "body-state-kit", "box-shape-kit"]) await composition.addKit(kitId);
    return status();
  }

  function status() {
    const docs = new Map(host.list().map((d) => [d.id, d])), scene = docs.get("scene"), compositionDoc = composition.read();
    return Object.freeze({
      ready: Boolean(scene && docs.get("player") && docs.get("ground") && docs.get("goal")),
      assemblyId: scene?.id ?? null,
      controlledNodeId: "player-node",
      sequenceId: docs.has("game-sequence") ? "game-sequence" : null,
      selectedKits: (compositionDoc?.content.nodes ?? []).filter((n) => n.kind === "kit" && n.enabled !== false).map((n) => n.registryId),
    });
  }

  return Object.freeze({ create, status });
}
