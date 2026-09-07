export function authoringRecipe(host, prefix) {
  let index = 0;
  const command = (id, args) =>
      host.command({
        requestId: `${prefix}:${index++}`,
        epoch: host.status().context.epoch,
        operations: [{ id, args }],
      }),
    edit = (id, args) =>
      command(id, { ...args, expectedRevision: host.read(args.id).revision });
  return {
    command,
    edit,
    read: (id) => host.read(id).content,
    async modifier(meshId, stack) {
      const id = `${meshId}-modifiers`;
      if (host.list().some((d) => d.id === id))
        await edit("modifier.set", { id, content: { meshId, stack } });
      else await command("modifier.set", { id, content: { meshId, stack } });
      await edit("modifier.apply", {
        id,
        meshRevision: host.read(meshId).revision,
      });
    },
    async material(
      id,
      {
        color = [1, 1, 1, 1],
        roughness = 0.45,
        metallic = 0,
        texture = null,
      } = {},
    ) {
      if (texture) {
        await command("paint.set", {
          id: `${id}-color`,
          content: {
            width: texture.resolution ?? 512,
            height: texture.resolution ?? 512,
            colorSpace: "srgb",
            layers: [
              {
                id: "base",
                opacity: 1,
                blend: "normal",
                color: [0, 0, 0, 1],
                tiles: {},
              },
            ],
          },
        });
        await command("material.set", {
          id,
          content: {
            baseColor: color,
            roughness,
            metallic,
            graph: {
              nodes: [
                {
                  id: "pattern",
                  type: "noise",
                  scale: texture.scale ?? 45,
                  seed: texture.seed ?? 1,
                  a: texture.a,
                  b: texture.b,
                },
              ],
              output: "pattern",
            },
            textures: { baseColor: { imageId: `${id}-color` } },
          },
        });
        await edit("paint.bake", {
          id: `${id}-color`,
          materialId: id,
          layerId: "base",
        });
      } else
        await command("material.set", {
          id,
          content: { baseColor: color, roughness, metallic },
        });
    },
    async workspace() {
      await command("workspace.set", {
        id: "workspace",
        content: {
          open: [{ id: "scene", kind: "assembly" }],
          active: "scene",
          mode: "object",
          views: [],
          tool: null,
        },
      });
    },
  };
}
export const axisQuaternion = (axis, angle) => [
  ...axis.map((n) => n * Math.sin(angle / 2)),
  Math.cos(angle / 2),
];
