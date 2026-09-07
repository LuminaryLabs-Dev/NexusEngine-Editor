import { authoringRecipe, axisQuaternion } from "../helpers.js";
export const donutRecipeProfile = {
  id: "donut/1",
  seed: 37,
  majorRadius: 1.55,
  minorRadius: 0.58,
  segments: 64,
  rings: 16,
  sprinkles: 180,
  textureResolution: 512,
};
export async function buildDonut(host, options = {}) {
  const p = { ...donutRecipeProfile, ...options },
    r = authoringRecipe(host, `donut-${p.seed}`),
    { command, edit, read } = r;
  await command("sequence.set", {
    id: "donut-foundation",
    content: {
      during: [
        {
          id: "create-dough",
          operations: [
            {
              id: "mesh.primitive",
              args: {
                id: "dough",
                parameters: {
                  type: "torus",
                  radius: p.majorRadius,
                  minorRadius: p.minorRadius,
                  segments: p.segments,
                  rings: p.rings,
                },
              },
            },
          ],
        },
      ],
    },
  });
  const foundation = host.startSequence("donut-foundation", {
    runId: `donut-foundation-${p.seed}`,
  });
  await host.advanceSequence(foundation, "create-dough");
  const registry = host.engine.n.authoringDomainComposition.discover(),
    spatial = registry.domains.find((d) => d.domainPath === "n:spatial");
  await command("domain-composition.set", {
    id: "recipe-composition",
    content: {
      id: "donut-tools",
      rootNodeId: "spatial",
      nodes: [
        { id: "spatial", kind: "domain", registryId: spatial.id },
        {
          id: "vectors",
          kind: "kit",
          registryId: "spatial-vector-math-kit",
          parentNodeId: "spatial",
        },
      ],
    },
  });
  if (!host.engine.n.authoringDomainComposition.plan("recipe-composition").ok)
    throw Error("Recipe composition did not validate.");
  for (const [position, offset, radius] of [
    [[1.55, 0.4, 0.2], [0.08, 0.035, 0.02], 0.85],
    [[-1.3, 0.2, 1], [0.025, -0.05, 0.035], 0.8],
    [[0.1, -0.3, -1.7], [0, 0.04, -0.055], 0.75],
  ])
    await edit("sculpt.stroke", {
      id: "dough",
      parameters: {
        mode: "grab",
        offset,
        stroke: { radius, strength: 0.7, samples: [{ position }] },
      },
    });
  const source = read("dough"),
    positions = new Map(source.vertices.map((v) => [v.id, v.position])),
    upper = source.faces
      .filter(
        (f) =>
          f.vertices.reduce((sum, id) => sum + positions.get(id)[1], 0) /
            f.vertices.length >
          -0.06,
      )
      .map((f) => f.id);
  await edit("mesh.topology", {
    id: "dough",
    outputId: "icing",
    parameters: { operation: "extract", faces: upper },
  });
  await r.modifier("dough", [
    { id: "soft-dough", type: "subdivision", parameters: { levels: 1 } },
  ]);
  await r.modifier("icing", [
    {
      id: "fit-to-dough",
      type: "shrinkwrap",
      parameters: { targetId: "dough", offset: 0.065 },
    },
  ]);
  // Deliberately uneven boundary drips are editable brush strokes on the extracted shell.
  for (let i = 0; i < 9; i++) {
    const angle = (i * Math.PI * 2) / 9 + 0.12 * Math.sin(p.seed + i),
      radius = p.majorRadius + p.minorRadius * 0.98,
      position = [radius * Math.cos(angle), 0.03, radius * Math.sin(angle)],
      depth = 0.13 + 0.11 * (0.5 + 0.5 * Math.sin(p.seed * 0.4 + i * 2.1));
    await edit("sculpt.stroke", {
      id: "icing",
      parameters: {
        mode: "grab",
        offset: [0.05 * Math.cos(angle), -depth, 0.05 * Math.sin(angle)],
        stroke: {
          radius: 0.26 + 0.045 * (i % 3),
          strength: 1,
          samples: [{ position }],
        },
      },
    });
  }
  await r.modifier("icing", [
    { id: "rounded-icing", type: "subdivision", parameters: { levels: 1 } },
    {
      id: "icing-thickness",
      type: "solidify",
      parameters: { thickness: 0.055 },
    },
    {
      id: "rounded-icing-edge",
      type: "subdivision",
      parameters: { levels: 1 },
    },
  ]);
  for (const id of ["dough", "icing"])
    await edit("uv.project", {
      id,
      parameters: { method: "toroidal", majorRadius: p.majorRadius },
    });
  await r.material("baked-dough", {
    roughness: 0.76,
    texture: {
      resolution: p.textureResolution,
      scale: 55,
      seed: p.seed,
      a: [0.36, 0.125, 0.026, 1],
      b: [0.51, 0.215, 0.056, 1],
    },
  });
  await r.material("strawberry-icing", {
    roughness: 0.26,
    texture: {
      resolution: p.textureResolution,
      scale: 24,
      seed: p.seed + 1,
      a: [0.73, 0.115, 0.22, 1],
      b: [0.78, 0.145, 0.255, 1],
    },
  });
  for (const [materialId, strength] of [
    ["baked-dough", 0.006],
    ["strawberry-icing", 0.004],
  ]) {
    const id = `${materialId}-normal`;
    await command("paint.set", {
      id,
      content: {
        width: 512,
        height: 512,
        colorSpace: "linear",
        layers: [
          {
            id: "normal",
            opacity: 1,
            blend: "normal",
            color: [0.5, 0.5, 1, 1],
            tiles: {},
          },
        ],
      },
    });
    await edit("paint.bake-normal", {
      id,
      materialId,
      layerId: "normal",
      strength,
    });
    const material = read(materialId);
    await edit("material.set", {
      id: materialId,
      content: {
        ...material,
        textures: { ...material.textures, normal: { imageId: id } },
      },
    });
  }
  const colors = [
    [1, 0.79, 0.2, 1],
    [0.18, 0.68, 0.71, 1],
    [0.88, 0.1, 0.23, 1],
    [0.96, 0.91, 0.76, 1],
    [0.23, 0.07, 0.035, 1],
    [0.48, 0.21, 0.64, 1],
  ];
  for (let i = 0; i < colors.length; i++)
    await r.material(`sugar-${i}`, { color: colors[i], roughness: 0.4 });
  await command("mesh.primitive", {
    id: "sprinkle",
    parameters: { type: "cylinder", radius: 0.022, height: 0.15, segments: 8 },
  });
  await edit("mesh.transform", {
    id: "sprinkle",
    rotation: axisQuaternion([0, 0, 1], Math.PI / 2),
    translation: [0, 0.023, 0],
  });
  const icing = read("icing");
  await edit("mesh.attribute", {
    id: "icing",
    attribute: {
      id: "density",
      domain: "vertex",
      arity: 1,
      values: Object.fromEntries(
        icing.vertices.map((v) => [v.id, [v.position[1] > 0.17 ? 1 : 0]]),
      ),
    },
  });
  await command("mesh.primitive", {
    id: "plate",
    parameters: { type: "cylinder", radius: 2.7, height: 0.13, segments: 64 },
  });
  await command("mesh.primitive", {
    id: "plate-rim",
    parameters: {
      type: "torus",
      radius: 2.56,
      minorRadius: 0.08,
      segments: 64,
      rings: 8,
    },
  });
  await r.material("ceramic", {
    color: [0.74, 0.86, 0.83, 1],
    roughness: 0.22,
  });
  await command("mesh.primitive", {
    id: "counter",
    parameters: { type: "box", size: 1 },
  });
  await edit("mesh.transform", { id: "counter", scale: [11, 0.25, 10] });
  await r.material("counter-stone", {
    color: [0.16, 0.22, 0.24, 1],
    roughness: 0.74,
  });
  const nodes = [
    { id: "pastry", name: "Strawberry donut" },
    {
      id: "dough-object",
      name: "Baked dough",
      parent: "pastry",
      meshId: "dough",
      materials: ["baked-dough"],
    },
    {
      id: "icing-object",
      name: "Strawberry icing",
      parent: "pastry",
      meshId: "icing",
      materials: ["strawberry-icing"],
    },
    {
      id: "plate-object",
      name: "Ceramic plate",
      meshId: "plate",
      materials: ["ceramic"],
      transform: { translation: [0, -0.65, 0] },
    },
    {
      id: "rim-object",
      name: "Plate rim",
      meshId: "plate-rim",
      materials: ["ceramic"],
      transform: { translation: [0, -0.57, 0] },
    },
    {
      id: "counter-object",
      name: "Countertop",
      meshId: "counter",
      materials: ["counter-stone"],
      transform: { translation: [0, -0.85, 0] },
    },
    ...colors.map((_, i) => ({
      id: `sprinkle-prototype-${i}`,
      name: `Sugar ${i}`,
      meshId: "sprinkle",
      materials: [`sugar-${i}`],
      visible: false,
      export: false,
    })),
  ];
  await command("assembly.set", {
    id: "scene",
    content: {
      nodes,
      variants: [
        {
          id: "complete",
          visibleNodes: nodes
            .filter((n) => n.visible !== false)
            .map((n) => n.id),
        },
      ],
    },
  });
  for (let i = 0; i < colors.length; i++)
    await edit("assembly.scatter", {
      id: "scene",
      parameters: {
        surfaceNodeId: "icing-object",
        prototypeNodeId: `sprinkle-prototype-${i}`,
        count:
          Math.floor(p.sprinkles / colors.length) +
          (i < p.sprinkles % colors.length ? 1 : 0),
        seed: p.seed + i * 371,
        minDistance: 0.12,
        normalYMin: 0.35,
        offset: 0.014,
        scaleRange: [0.8, 1.25],
        prefix: `sugar-${i}`,
        densityAttribute: "density",
        spacingGroup: "sprinkles",
      },
    });
  // Color groups share both a density mask and a common minimum-spacing collection.
  const currentScene = read("scene");
  const cameraPosition = [5.8, 4.5, 7],
    yaw = Math.atan2(5.8, 7),
    pitch = -Math.atan2(4.55, Math.hypot(5.8, 7)),
    sx = Math.sin(pitch / 2),
    cx = Math.cos(pitch / 2),
    sy = Math.sin(yaw / 2),
    cy = Math.cos(yaw / 2);
  await edit("assembly.set", {
    id: "scene",
    content: {
      ...currentScene,
      nodes: [
        ...currentScene.nodes,
        {
          id: "camera-main",
          name: "Asset camera",
          transform: {
            translation: cameraPosition,
            rotation: [cy * sx, sy * cx, -sy * sx, cy * cx],
          },
        },
        {
          id: "light-key",
          name: "Key light",
          transform: { translation: [3, 5, 4] },
        },
      ],
      cameras: [
        { id: "main", nodeId: "camera-main", yfov: 0.65, near: 0.05, far: 100 },
      ],
      lights: [
        {
          id: "key",
          nodeId: "light-key",
          type: "point",
          color: [1, 0.88, 0.74],
          intensity: 20,
          range: 30,
        },
      ],
    },
  });
  const finished = read("scene");
  await edit("assembly.set", {
    id: "scene",
    content: {
      ...finished,
      variants: [
        {
          id: "complete",
          visibleNodes: finished.nodes
            .filter((n) => n.visible !== false)
            .map((n) => n.id),
        },
      ],
    },
  });
  await r.workspace();
  return {
    profile: p,
    assemblyId: "scene",
    sourceDocuments: host.list().length,
    meshCounts: Object.fromEntries(
      host.list("mesh").map((d) => [
        d.id,
        {
          vertices: read(d.id).vertices.length,
          faces: read(d.id).faces.length,
        },
      ]),
    ),
  };
}
export const donutViews = {
  overall: {
    width: 1000,
    height: 800,
    camera: { position: [5.8, 4.5, 7], target: [0, -0.05, 0], yfov: 0.65 },
  },
  silhouette: {
    width: 1000,
    height: 650,
    camera: { position: [6, 0.6, 7], target: [0, -0.12, 0], yfov: 0.55 },
  },
  icing: {
    width: 1000,
    height: 800,
    camera: { position: [3.2, 1.6, 4.2], target: [0.25, 0.2, 0.6], yfov: 0.55 },
  },
  material: {
    width: 1000,
    height: 800,
    camera: {
      position: [-3.8, 3.4, 4.8],
      target: [-0.3, 0.15, 0.35],
      yfov: 0.58,
    },
  },
};
