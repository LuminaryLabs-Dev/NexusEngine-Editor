import { authoringRecipe, axisQuaternion } from "../helpers.js";
export async function buildOrganic(host, { seed = 19 } = {}) {
  const r = authoringRecipe(host, `organic-${seed}`),
    { command, edit, read } = r;
  await command("curve.set", {
    id: "spine-curve",
    content: {
      type: "bezier",
      closed: false,
      points: [
        { id: "base", position: [0, 0, 0], out: [0.05, 0.7, 0] },
        { id: "tip", position: [0.1, 3, 0], in: [-0.18, 2.2, 0.12] },
      ],
      resolution: 24,
      tolerance: 0.0005,
    },
  });
  await command("curve.sweep", {
    id: "spine-curve",
    outputId: "body",
    parameters: { radius: 0.27, sides: 20, caps: true },
  });
  await edit("mesh.topology", {
    id: "body",
    parameters: { operation: "triangulate" },
  });
  await edit("sculpt.stroke", {
    id: "body",
    parameters: {
      mode: "inflate",
      stroke: {
        radius: 0.75,
        strength: 0.2,
        samples: [{ position: [0.05, 2.6, 0] }],
      },
    },
  });
  await edit("sculpt.stroke", {
    id: "body",
    parameters: {
      mode: "smooth",
      stroke: {
        radius: 1,
        strength: 0.35,
        samples: [{ position: [0, 2.5, 0] }],
      },
    },
  });
  await r.material("jade-skin", {
    roughness: 0.4,
    texture: {
      resolution: 512,
      seed,
      scale: 22,
      a: [0.018, 0.16, 0.105, 1],
      b: [0.14, 0.39, 0.22, 1],
    },
  });
  await r.material("stand-material", {
    color: [0.075, 0.12, 0.15, 1],
    roughness: 0.32,
    metallic: 0.6,
  });
  await command("mesh.primitive", {
    id: "stand",
    parameters: { type: "cylinder", radius: 0.75, height: 0.16, segments: 48 },
  });
  const bones = Array.from({ length: 4 }, (_, i) => ({
    id: `joint-${i}`,
    name: `Joint ${i}`,
    parent: i ? `joint-${i - 1}` : null,
    rest: { translation: [0, i ? 0.75 : 0, 0] },
    length: 0.75,
  }));
  await command("rig.set", { id: "rig", content: { bones, constraints: [] } });
  await command("skin.bind", {
    id: "skin",
    meshId: "body",
    rigId: "rig",
    parameters: { power: 3, smoothing: 3, maxInfluences: 4 },
  });
  await edit("skin.smooth", {
    id: "skin",
    parameters: { iterations: 2, factor: 0.35 },
  });
  const mesh = read("body"),
    deltas = Object.fromEntries(
      mesh.vertices.map((v) => [
        v.id,
        [
          v.position[0] * 0.14 * Math.max(0, v.position[1] / 3),
          0,
          v.position[2] * 0.14 * Math.max(0, v.position[1] / 3),
        ],
      ]),
    );
  await command("animation.shape", {
    id: "breathing",
    meshId: "body",
    keys: [{ id: "breathe", weight: 0, deltas }],
  });
  const rotation = (id, angle, axis = [0, 0, 1]) => ({
      id: `${id}-rotation`,
      target: id,
      property: "rotation",
      interpolation: "LINEAR",
      keys: [
        { time: 0, value: [0, 0, 0, 1] },
        { time: 1, value: axisQuaternion(axis, angle) },
        { time: 2, value: [0, 0, 0, 1] },
      ],
    }),
    clips = [
      {
        id: "sway",
        name: "Gentle sway",
        duration: 2,
        tracks: [
          rotation("joint-1", 0.3),
          rotation("joint-2", -0.22),
          {
            id: "breath",
            target: "breathe",
            property: "weight",
            interpolation: "LINEAR",
            keys: [
              { time: 0, value: [0] },
              { time: 1, value: [1] },
              { time: 2, value: [0] },
            ],
          },
        ],
      },
      {
        id: "deep-bend",
        name: "Ninety degree articulation",
        duration: 2,
        tracks: [rotation("joint-1", Math.PI / 2)],
      },
      {
        id: "twist",
        name: "Twist and recover",
        duration: 2,
        tracks: [rotation("joint-2", 1, [0, 1, 0])],
      },
    ];
  await command("animation.set", {
    id: "motion",
    content: {
      rigId: "rig",
      shapeId: "breathing",
      clips,
      poses: [
        {
          id: "rest",
          bones: Object.fromEntries(
            read("rig").bones.map((b) => [b.id, b.rest]),
          ),
        },
      ],
      arrangements: [
        { clipId: "sway", start: 0, in: 0, out: 2, speed: 1 },
        { clipId: "deep-bend", start: 2, in: 0, out: 2, speed: 1 },
      ],
    },
  });
  await command("assembly.set", {
    id: "scene",
    content: {
      nodes: [
        {
          id: "organism",
          name: "Jade tendril",
          meshId: "body",
          materials: ["jade-skin"],
          rigId: "rig",
          skinId: "skin",
          shapeId: "breathing",
          animationIds: ["motion"],
        },
        {
          id: "stand-object",
          name: "Display stand",
          meshId: "stand",
          materials: ["stand-material"],
          transform: { translation: [0, -0.09, 0] },
        },
      ],
    },
  });
  await r.workspace();
  return {
    recipe: "organic/1",
    seed,
    assemblyId: "scene",
    vertices: mesh.vertices.length,
    joints: bones.length,
    clips: clips.length,
    shapeKeys: 1,
  };
}
