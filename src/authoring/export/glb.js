import { Matrix4 } from "three";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
const fail = (code, message) => Object.assign(new Error(message), { code });
const hash = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const linear = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const srgb = (x) =>
  x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
function pngBytes(raster, colorSpace) {
  if (raster.format !== "rgba8" || raster.tileSize !== 64)
    throw fail("AUTHORING_EXPORT_IMAGE", "Unsupported raster packet.");
  const data = Buffer.alloc(raster.width * raster.height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(raster.background, i);
  for (const [key, hex] of Object.entries(raster.tiles)) {
    const [tx, ty] = key.split(":").map(Number),
      tile = Buffer.from(hex, "hex");
    for (let y = 0; y < 64 && ty * 64 + y < raster.height; y++) {
      const width = Math.min(64, raster.width - tx * 64);
      tile.copy(
        data,
        ((ty * 64 + y) * raster.width + tx * 64) * 4,
        y * 64 * 4,
        (y * 64 + width) * 4,
      );
    }
  }
  if (raster.colorSpace !== colorSpace)
    for (let i = 0; i < data.length; i++)
      if (i % 4 !== 3)
        data[i] = Math.round(
          Math.max(
            0,
            Math.min(1, (colorSpace === "srgb" ? srgb : linear)(data[i] / 255)),
          ) * 255,
        );
  return PNG.sync.write(
    { width: raster.width, height: raster.height, data },
    { colorType: 6, inputColorType: 6, bitDepth: 8 },
  );
}
const wrap = { REPEAT: 10497, CLAMP_TO_EDGE: 33071, MIRRORED_REPEAT: 33648 },
  filter = { LINEAR: 9729, NEAREST: 9728 };
export function encodeAuthoringGLB(packet) {
  if (packet?.schema !== "nexusengine.authoring-delivery/1")
    throw fail(
      "AUTHORING_EXPORT_PACKET",
      "Expected an evaluated Authoring delivery packet.",
    );
  const gltf = {
      asset: {
        version: "2.0",
        generator: "NexusEngine Authoring GLB adapter/1",
        extras: { sourcePacket: packet.hash },
      },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        {
          name: "Authoring units",
          scale: [
            packet.assembly.units.metersPerUnit,
            packet.assembly.units.metersPerUnit,
            packet.assembly.units.metersPerUnit,
          ],
          children: [],
        },
      ],
      meshes: [],
      materials: [],
      accessors: [],
      bufferViews: [],
      buffers: [{ byteLength: 0 }],
      images: [],
      textures: [],
      samplers: [],
      skins: [],
      animations: [],
      cameras: [],
    },
    chunks = [],
    textures = [],
    materialIndex = new Map(),
    textureIndex = new Map(),
    samplerIndex = new Map(),
    imageIndex = new Map(),
    meshCache = new Map(),
    geometryCache = new Map();
  let byteLength = 0;
  function view(bytes, target) {
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const index = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: bytes.length,
      ...(target ? { target } : {}),
    });
    chunks.push(bytes);
    byteLength += bytes.length;
    return index;
  }
  function accessor(
    values,
    type,
    componentType = 5126,
    { target, minmax = false } = {},
  ) {
    const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 },
      width = widths[type];
    if (
      !width ||
      !values.length ||
      values.length % width ||
      values.some((n) => !Number.isFinite(n))
    )
      throw fail("AUTHORING_EXPORT_ACCESSOR", "Malformed accessor data.");
    const bytes = Buffer.alloc(
      values.length * (componentType === 5123 ? 2 : 4),
    );
    values.forEach((n, i) => {
      if (componentType === 5126) {
        if (Math.abs(n) > 3.402823466e38)
          throw fail("AUTHORING_EXPORT_RANGE", "Value exceeds float32 range.");
        bytes.writeFloatLE(n, i * 4);
      } else {
        if (
          !Number.isSafeInteger(n) ||
          n < 0 ||
          n > (componentType === 5123 ? 65535 : 4294967295)
        )
          throw fail("AUTHORING_EXPORT_RANGE", "Index exceeds unsigned range.");
        componentType === 5123
          ? bytes.writeUInt16LE(n, i * 2)
          : bytes.writeUInt32LE(n, i * 4);
      }
    });
    const id = gltf.accessors.length,
      entry = {
        bufferView: view(bytes, target),
        componentType,
        count: values.length / width,
        type,
      };
    if (minmax) {
      entry.min = Array.from({ length: width }, (_, i) => {
        let n = Infinity;
        for (let j = i; j < values.length; j += width)
          n = Math.min(n, Math.fround(values[j]));
        return n;
      });
      entry.max = Array.from({ length: width }, (_, i) => {
        let n = -Infinity;
        for (let j = i; j < values.length; j += width)
          n = Math.max(n, Math.fround(values[j]));
        return n;
      });
    }
    gltf.accessors.push(entry);
    return id;
  }
  function texture(binding, slot) {
    const colorSpace = ["baseColor", "emissive"].includes(slot)
        ? "srgb"
        : "linear",
      image = packet.images.find((i) => i.id === binding.imageId);
    if (!image) throw fail("AUTHORING_EXPORT_IMAGE", "Texture source missing.");
    const imageKey = `${image.id}:${colorSpace}`;
    if (!imageIndex.has(imageKey)) {
      const bytes = pngBytes(image.raster, colorSpace),
        integrity = hash(bytes),
        index = gltf.images.length;
      gltf.images.push({
        bufferView: view(bytes),
        mimeType: "image/png",
        name: imageKey,
      });
      imageIndex.set(imageKey, index);
      textures.push({
        name: `texture-${integrity.slice(7)}.png`,
        hash: integrity,
        sourceId: image.id,
        sourceHash: image.sourceHash,
        colorSpace,
        width: image.raster.width,
        height: image.raster.height,
        bytes,
      });
    }
    const sampler = {
        wrapS: wrap[binding.wrapS],
        wrapT: wrap[binding.wrapT],
        magFilter: filter[binding.magFilter],
        minFilter: filter[binding.minFilter],
      },
      samplerKey = JSON.stringify(sampler);
    if (!samplerIndex.has(samplerKey)) {
      samplerIndex.set(samplerKey, gltf.samplers.length);
      gltf.samplers.push(sampler);
    }
    const key = `${imageKey}:${samplerKey}`;
    if (!textureIndex.has(key)) {
      textureIndex.set(key, gltf.textures.length);
      gltf.textures.push({
        source: imageIndex.get(imageKey),
        sampler: samplerIndex.get(samplerKey),
      });
    }
    return { index: textureIndex.get(key), texCoord: binding.uvSet };
  }
  for (const m of packet.materials) {
    const p = m.pbr,
      material = {
        name: m.id,
        pbrMetallicRoughness: {
          baseColorFactor: p.baseColor,
          metallicFactor: p.metallic,
          roughnessFactor: p.roughness,
        },
        emissiveFactor: p.emissive,
        alphaMode: p.alphaMode,
        doubleSided: p.doubleSided,
        extras: { sourceHash: m.sourceHash },
      };
    if (p.alphaMode === "MASK") material.alphaCutoff = p.alphaCutoff;
    for (const [slot, b] of Object.entries(p.textures)) {
      const info = texture(b, slot);
      if (slot === "baseColor")
        material.pbrMetallicRoughness.baseColorTexture = info;
      else if (slot === "metallicRoughness")
        material.pbrMetallicRoughness.metallicRoughnessTexture = info;
      else if (slot === "normal")
        material.normalTexture = { ...info, scale: p.normalScale };
      else if (slot === "occlusion")
        material.occlusionTexture = { ...info, strength: p.occlusionStrength };
      else if (slot === "emissive") material.emissiveTexture = info;
    }
    materialIndex.set(m.id, gltf.materials.length);
    gltf.materials.push(material);
  }
  const nodeIndex = new Map(),
    meshNodes = new Map(),
    boneInstances = new Map(),
    included = packet.assembly.nodes.filter((n) => n.included);
  for (const node of included) {
    nodeIndex.set(node.id, gltf.nodes.length);
    gltf.nodes.push({
      name: node.name,
      translation: node.transform.translation,
      rotation: node.transform.rotation,
      scale: node.transform.scale,
      children: [],
      extras: { sourceNodeId: node.id },
    });
  }
  for (const node of included) {
    const index = nodeIndex.get(node.id),
      parent = node.parent === null ? 0 : nodeIndex.get(node.parent);
    if (parent === undefined)
      throw fail(
        "AUTHORING_EXPORT_HIERARCHY",
        "Included node has an excluded parent.",
      );
    gltf.nodes[parent].children.push(index);
  }
  function geometry(mesh, skin, shape) {
    const key = JSON.stringify([mesh.id, skin?.id ?? null, shape?.id ?? null]);
    if (geometryCache.has(key)) return geometryCache.get(key);
    const attributes = {
      POSITION: accessor(mesh.positions, "VEC3", 5126, {
        target: 34962,
        minmax: true,
      }),
      NORMAL: accessor(mesh.normals, "VEC3", 5126, { target: 34962 }),
      TEXCOORD_0: accessor(mesh.uvs, "VEC2", 5126, { target: 34962 }),
      TANGENT: accessor(mesh.tangents, "VEC4", 5126, { target: 34962 }),
      COLOR_0: accessor(mesh.colors, "VEC4", 5126, { target: 34962 }),
    };
    if (skin) {
      const rig = packet.rigs.find((r) => r.id === skin.rigId),
        joints = [],
        weights = [];
      for (const id of mesh.sourceVertices) {
        const row = skin.weights[id];
        if (!row || row.length > 4)
          throw fail(
            "AUTHORING_EXPORT_SKIN",
            "Skin row does not meet the four-influence delivery profile.",
          );
        for (let i = 0; i < 4; i++) {
          const influence = row[i];
          joints.push(
            influence
              ? rig.bones.findIndex((b) => b.id === influence.boneId)
              : 0,
          );
          weights.push(influence?.weight ?? 0);
        }
      }
      attributes.JOINTS_0 = accessor(joints, "VEC4", 5123, { target: 34962 });
      attributes.WEIGHTS_0 = accessor(weights, "VEC4", 5126, { target: 34962 });
    }
    const targets = shape?.keys.map((k) => ({
      POSITION: accessor(
        mesh.sourceVertices.flatMap((id) => k.deltas[id] ?? [0, 0, 0]),
        "VEC3",
        5126,
        { target: 34962, minmax: true },
      ),
      ...(k.normalDeltas
        ? { NORMAL: accessor(k.normalDeltas, "VEC3", 5126, { target: 34962 }) }
        : {}),
    }));
    const result = { attributes, targets };
    geometryCache.set(key, result);
    return result;
  }
  for (const node of included) {
    if (!node.meshId) continue;
    const mesh = packet.meshes.find((m) => m.id === node.meshId),
      skin = node.skinId
        ? packet.skins.find((s) => s.id === node.skinId)
        : null,
      shape = node.shapeId
        ? packet.shapes.find((s) => s.id === node.shapeId)
        : null,
      meshKey = JSON.stringify([
        node.meshId,
        node.materials,
        node.skinId,
        node.shapeId,
      ]);
    if (!meshCache.has(meshKey)) {
      const { attributes, targets } = geometry(mesh, skin, shape),
        slots = new Map();
      for (const group of mesh.groups) {
        if (!slots.has(group.material)) slots.set(group.material, []);
        slots
          .get(group.material)
          .push(...mesh.indices.slice(group.start, group.start + group.count));
      }
      const primitives = [...slots].map(([slot, indices]) => {
        const material = node.materials[slot];
        if (material !== undefined && !materialIndex.has(material))
          throw fail(
            "AUTHORING_EXPORT_MATERIAL",
            "Material assignment missing.",
          );
        return {
          attributes,
          indices: accessor(indices, "SCALAR", 5125, { target: 34963 }),
          mode: 4,
          ...(material !== undefined
            ? { material: materialIndex.get(material) }
            : {}),
          ...(targets ? { targets } : {}),
        };
      });
      meshCache.set(meshKey, gltf.meshes.length);
      gltf.meshes.push({
        name: node.meshId,
        primitives,
        ...(shape
          ? {
              weights: shape.keys.map((k) => k.weight),
              extras: { targetNames: shape.keys.map((k) => k.id) },
            }
          : {}),
      });
    }
    const meshNodeIndex = gltf.nodes.length;
    meshNodes.set(node.id, meshNodeIndex);
    gltf.nodes.push({
      name: `${node.name} geometry`,
      mesh: meshCache.get(meshKey),
      extras: { sourceNodeId: node.id },
    });
    gltf.nodes[nodeIndex.get(node.id)].children.push(meshNodeIndex);
    if (skin) {
      const rig = packet.rigs.find((r) => r.id === skin.rigId);
      if (!rig) throw fail("AUTHORING_EXPORT_RIG", "Rig source missing.");
      const jointMap = new Map(),
        skeletonRoot = gltf.nodes.length;
      gltf.nodes.push({
        name: `${node.name} skeleton`,
        children: [],
        matrix: invertMatrix(skin.meshBindMatrix),
      });
      gltf.nodes[nodeIndex.get(node.id)].children.push(skeletonRoot);
      for (const bone of rig.bones) {
        jointMap.set(bone.id, gltf.nodes.length);
        gltf.nodes.push({
          name: `${node.id}:${bone.name}`,
          translation: bone.rest.translation,
          rotation: bone.rest.rotation,
          scale: bone.rest.scale,
          children: [],
        });
      }
      for (const bone of rig.bones)
        gltf.nodes[
          bone.parent === null ? skeletonRoot : jointMap.get(bone.parent)
        ].children.push(jointMap.get(bone.id));
      const skinIndex = gltf.skins.length;
      gltf.skins.push({
        name: skin.id,
        joints: rig.bones.map((b) => jointMap.get(b.id)),
        inverseBindMatrices: accessor(
          rig.bones.flatMap((b) => skin.inverseBindMatrices[b.id]),
          "MAT4",
        ),
      });
      gltf.nodes[meshNodeIndex].skin = skinIndex;
      boneInstances.set(node.id, jointMap);
    }
  }
  for (const node of included)
    for (const animationId of node.animationIds) {
      const document = packet.animations.find((a) => a.id === animationId);
      for (const clip of document.clips) {
        const channels = [],
          samplers = [];
        const add = (track, target, path, values, type) => {
          const input = accessor(
              track.keys.map((k) => k.time),
              "SCALAR",
              5126,
              { minmax: true },
            ),
            output = accessor(values, type),
            sampler = samplers.length;
          samplers.push({ input, output, interpolation: track.interpolation });
          channels.push({ sampler, target: { node: target, path } });
        };
        for (const track of clip.tracks.filter(
          (t) => t.property !== "weight",
        )) {
          const target = boneInstances.get(node.id)?.get(track.target);
          if (target === undefined)
            throw fail(
              "AUTHORING_EXPORT_ANIMATION",
              "Animation target has no exported joint.",
            );
          add(
            track,
            target,
            track.property,
            track.keys.flatMap((k) =>
              track.interpolation === "CUBICSPLINE"
                ? [...k.inTangent, ...k.value, ...k.outTangent]
                : k.value,
            ),
            track.property === "rotation" ? "VEC4" : "VEC3",
          );
        }
        const morphTracks = clip.tracks.filter((t) => t.property === "weight");
        if (morphTracks.length) {
          const shape = packet.shapes.find((s) => s.id === node.shapeId);
          if (!shape)
            throw fail(
              "AUTHORING_EXPORT_ANIMATION",
              "Morph animation has no shape source.",
            );
          const first = morphTracks[0];
          if (
            morphTracks.some(
              (t) =>
                t.interpolation !== first.interpolation ||
                JSON.stringify(t.keys.map((k) => k.time)) !==
                  JSON.stringify(first.keys.map((k) => k.time)),
            )
          )
            throw fail(
              "AUTHORING_EXPORT_MORPH_SAMPLING",
              "Morph tracks must share key times and interpolation; bake onto a common timeline first.",
            );
          const values = [];
          for (let i = 0; i < first.keys.length; i++)
            for (const field of first.interpolation === "CUBICSPLINE"
              ? ["inTangent", "value", "outTangent"]
              : ["value"])
              for (const key of shape.keys) {
                const t = morphTracks.find((t) => t.target === key.id);
                values.push(
                  t ? t.keys[i][field][0] : field === "value" ? key.weight : 0,
                );
              }
          add(first, meshNodes.get(node.id), "weights", values, "SCALAR");
        }
        if (channels.length)
          gltf.animations.push({
            name: `${node.name} / ${clip.name}`,
            channels,
            samplers,
          });
      }
    }
  for (const camera of packet.assembly.cameras) {
    const index = nodeIndex.get(camera.nodeId);
    if (index === undefined) continue;
    gltf.nodes[index].camera = gltf.cameras.length;
    gltf.cameras.push({
      name: camera.id,
      type: "perspective",
      perspective: { yfov: camera.yfov, znear: camera.near, zfar: camera.far },
    });
  }
  if (packet.assembly.lights.length) {
    gltf.extensionsUsed = ["KHR_lights_punctual"];
    gltf.extensions = { KHR_lights_punctual: { lights: [] } };
    for (const light of packet.assembly.lights) {
      const index = nodeIndex.get(light.nodeId);
      if (index === undefined) continue;
      const lights = gltf.extensions.KHR_lights_punctual.lights;
      gltf.nodes[index].extensions = {
        KHR_lights_punctual: { light: lights.length },
      };
      lights.push({
        name: light.id,
        type: light.type,
        color: light.color,
        intensity: light.intensity,
        ...(light.range ? { range: light.range } : {}),
        ...(light.type === "spot"
          ? { spot: { innerConeAngle: 0, outerConeAngle: Math.PI / 4 } }
          : {}),
      });
    }
  }
  if (!gltf.meshes.length)
    throw fail("AUTHORING_EXPORT_EMPTY", "No included mesh can be exported.");
  for (const node of gltf.nodes)
    if (node.children?.length === 0) delete node.children;
  for (const key of [
    "images",
    "textures",
    "samplers",
    "skins",
    "animations",
    "cameras",
    "materials",
  ])
    if (!gltf[key].length) delete gltf[key];
  gltf.buffers[0].byteLength = byteLength;
  const binary = Buffer.concat(chunks),
    json = Buffer.from(JSON.stringify(gltf)),
    jsonPadding = (4 - (json.length % 4)) % 4,
    binPadding = (4 - (binary.length % 4)) % 4,
    total = 12 + 8 + json.length + jsonPadding + 8 + binary.length + binPadding,
    bytes = Buffer.alloc(total);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(total, 8);
  bytes.writeUInt32LE(json.length + jsonPadding, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.fill(0x20, 20 + json.length, 20 + json.length + jsonPadding);
  const binaryOffset = 20 + json.length + jsonPadding;
  bytes.writeUInt32LE(binary.length + binPadding, binaryOffset);
  bytes.writeUInt32LE(0x004e4942, binaryOffset + 4);
  binary.copy(bytes, binaryOffset + 8);
  return {
    bytes,
    hash: hash(bytes),
    json: gltf,
    textures,
    provenance: {
      schema: "nexusengine.authoring-export/1",
      format: "glb",
      adapter: "native-glb-png/1",
      sourcePacket: packet.hash,
      source: packet.source,
      outputHash: hash(bytes),
      byteLength: bytes.length,
      textures: textures.map(({ bytes, ...entry }) => entry),
      warnings: packet.warnings,
    },
  };
}
function invertMatrix(input) {
  const matrix = new Matrix4().fromArray(input);
  if (Math.abs(matrix.determinant()) < 1e-15)
    throw fail("AUTHORING_EXPORT_SKIN", "Singular mesh bind matrix.");
  return matrix.invert().toArray();
}
