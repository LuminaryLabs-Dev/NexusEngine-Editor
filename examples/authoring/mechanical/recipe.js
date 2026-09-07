import { authoringRecipe, axisQuaternion } from "../helpers.js";
export async function buildMechanical(host, { seed = 11 } = {}) {
  const r = authoringRecipe(host, `mechanical-${seed}`),
    { command, edit } = r;
  await command("mesh.cube", { id: "housing", size: 2 });
  await edit("mesh.transform", { id: "housing", scale: [1.4, 0.8, 0.7] });
  await edit("mesh.topology", {
    id: "housing",
    parameters: { operation: "bevel", width: 0.1 },
  });
  await edit("uv.unwrap", {
    id: "housing",
    parameters: { resolution: 512, padding: 4 },
  });
  await r.material("blue-enamel", {
    roughness: 0.26,
    metallic: 0.35,
    texture: {
      resolution: 256,
      seed,
      scale: 60,
      a: [0.025, 0.12, 0.22, 1],
      b: [0.045, 0.19, 0.31, 1],
    },
  });
  await r.material("machined-metal", {
    color: [0.53, 0.58, 0.62, 1],
    roughness: 0.25,
    metallic: 0.92,
  });
  await r.material("rubber", {
    color: [0.025, 0.03, 0.035, 1],
    roughness: 0.87,
  });
  await r.material("amber", { color: [1, 0.3, 0.025, 1], roughness: 0.18 });
  await command("mesh.primitive", {
    id: "knob",
    parameters: { type: "cylinder", radius: 0.37, height: 0.28, segments: 32 },
  });
  await edit("mesh.transform", {
    id: "knob",
    rotation: axisQuaternion([1, 0, 0], Math.PI / 2),
  });
  await command("mesh.primitive", {
    id: "screw",
    parameters: { type: "cylinder", radius: 0.075, height: 0.05, segments: 8 },
  });
  await edit("mesh.transform", {
    id: "screw",
    rotation: axisQuaternion([1, 0, 0], Math.PI / 2),
  });
  await command("mesh.cube", { id: "foot", size: 1 });
  await edit("mesh.transform", { id: "foot", scale: [0.42, 0.24, 0.8] });
  await command("mesh.primitive", {
    id: "lamp",
    parameters: { type: "sphere", radius: 0.12, segments: 16, rings: 8 },
  });
  const nodes = [
    {
      id: "instrument",
      name: "Field instrument",
      transform: {
        translation: [0, 0.25, 0],
        rotation: axisQuaternion([0, 1, 0], 0.12),
      },
    },
    {
      id: "case",
      name: "Bevelled enamel case",
      parent: "instrument",
      meshId: "housing",
      materials: ["blue-enamel"],
    },
    {
      id: "dial",
      name: "Machined control dial",
      parent: "instrument",
      meshId: "knob",
      materials: ["machined-metal"],
      transform: { translation: [-0.4, 0, 0.79] },
    },
    {
      id: "indicator",
      name: "Amber indicator",
      parent: "instrument",
      meshId: "lamp",
      materials: ["amber"],
      transform: { translation: [0.7, 0.2, 0.71] },
    },
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((y) => ({
        id: `screw-${x}-${y}`,
        name: "Captive fastener",
        parent: "instrument",
        meshId: "screw",
        materials: ["machined-metal"],
        transform: { translation: [x * 1.12, y * 0.55, 0.71] },
      })),
    ),
    ...[-1, 1].map((x) => ({
      id: `foot-${x}`,
      name: "Rubber foot",
      parent: "instrument",
      meshId: "foot",
      materials: ["rubber"],
      transform: { translation: [x * 0.85, -0.87, 0] },
    })),
  ];
  await command("assembly.set", {
    id: "scene",
    content: {
      nodes,
      variants: [
        { id: "assembled", visibleNodes: nodes.map((n) => n.id) },
        { id: "housing-only", visibleNodes: ["instrument", "case"] },
      ],
    },
  });
  await r.workspace();
  return {
    recipe: "mechanical/1",
    seed,
    assemblyId: "scene",
    sourceDocuments: host.list().length,
  };
}
