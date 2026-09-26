import { createHash } from "node:crypto";
import { createStoredZip } from "./zip.js";
import { includedMeshNodes, materialFor, meshFor } from "../static-profile.js";

const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const number = (value) => {
  if (!Number.isFinite(value)) throw new Error("USDZ export received a non-finite number.");
  return Number(value.toFixed(9)).toString();
};
const tuple = (values) => `(${values.map(number).join(", ")})`;
const identifier = (value) => {
  const next = String(value).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(next) ? next : `_${next}`;
};

export function encodeAuthoringUSDZ(packet, { inspection } = {}) {
  const nodes = includedMeshNodes(packet),
    names = uniqueNames(packet.assembly.nodes.map((node) => node.id)),
    materialNames = uniqueNames((packet.materials ?? []).map((material) => material.id), "Material"),
    children = new Map();
  for (const node of packet.assembly.nodes) {
    const key = node.parent ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  const lines = [
    "#usda 1.0",
    "(",
    '    defaultPrim = "Root"',
    `    metersPerUnit = ${number(packet.assembly.units?.metersPerUnit ?? 1)}`,
    '    upAxis = "Y"',
    ")",
    "",
    'def Xform "Root"',
    "{",
  ];
  const writeNode = (node, depth) => {
    if (!node.included) return;
    const pad = "    ".repeat(depth),
      name = names.get(node.id),
      transform = node.transform;
    lines.push(`${pad}def Xform "${name}"`, `${pad}{`);
    if (node.name && node.name !== node.id)
      lines.push(`${pad}    string customData:nexusDisplayName = ${JSON.stringify(node.name)}`);
    lines.push(
      `${pad}    double3 xformOp:translate = ${tuple(transform.translation)}`,
      `${pad}    quatf xformOp:orient = (${number(transform.rotation[3])}, (${transform.rotation.slice(0, 3).map(number).join(", ")}))`,
      `${pad}    float3 xformOp:scale = ${tuple(transform.scale)}`,
      `${pad}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]`,
    );
    if (node.meshId) writeMesh(node, depth + 1, lines, packet, materialNames);
    for (const child of children.get(node.id) ?? []) writeNode(child, depth + 1);
    lines.push(`${pad}}`);
  };
  for (const node of children.get(null) ?? []) writeNode(node, 1);
  if (packet.materials?.length) {
    lines.push('    def Scope "Materials"', "    {");
    for (const material of packet.materials) writeMaterial(material, materialNames.get(material.id), lines);
    lines.push("    }");
  }
  lines.push("}", "");
  const usda = Buffer.from(lines.join("\n")),
    bytes = createStoredZip([{ name: "scene.usda", bytes: usda }]),
    hash = digest(bytes);
  return {
    bytes,
    hash,
    fileName: "scene.usdz",
    auxiliaryFiles: [],
    provenance: {
      schema: "nexusengine.editor-export/1",
      format: "usdz",
      adapter: "native-usda-usdz-static/1",
      profile: "usdz-static-pbr/1",
      sourcePacket: packet.hash,
      source: packet.source,
      outputHash: hash,
      byteLength: bytes.length,
      warnings: [
        ...(packet.warnings ?? []),
        ...(inspection?.issues ?? []).filter((issue) => issue.severity === "warning"),
      ],
    },
  };
}

function writeMesh(node, depth, lines, packet, materialNames) {
  const pad = "    ".repeat(depth),
    mesh = meshFor(packet, node),
    counts = Array(mesh.indices.length / 3).fill(3),
    points = chunks(mesh.positions, 3).map(tuple).join(", "),
    normals = chunks(mesh.normals, 3).map(tuple).join(", "),
    uvs = chunks(mesh.uvs ?? [], 2).map(tuple).join(", "),
    material = materialFor(packet, node);
  lines.push(
    `${pad}def Mesh "Geometry" (`,
    `${pad}    prepend apiSchemas = ["MaterialBindingAPI"]`,
    `${pad})`,
    `${pad}{`,
  );
  lines.push(
    `${pad}    int[] faceVertexCounts = [${counts.join(", ")}]`,
    `${pad}    int[] faceVertexIndices = [${mesh.indices.join(", ")}]`,
    `${pad}    point3f[] points = [${points}]`,
    `${pad}    normal3f[] normals = [${normals}] (`,
    `${pad}        interpolation = "vertex"`,
    `${pad}    )`,
    `${pad}    uniform token subdivisionScheme = "none"`,
  );
  if (uvs)
    lines.push(
      `${pad}    texCoord2f[] primvars:st = [${uvs}] (`,
      `${pad}        interpolation = "vertex"`,
      `${pad}    )`,
    );
  if (material)
    lines.push(`${pad}    rel material:binding = </Root/Materials/${materialNames.get(material.id)}>`);
  lines.push(`${pad}}`);
}

function writeMaterial(material, name, lines) {
  const p = material.pbr,
    pad = "        ";
  lines.push(`${pad}def Material "${name}"`, `${pad}{`);
  lines.push(
    `${pad}    token outputs:surface.connect = </Root/Materials/${name}/PreviewSurface.outputs:surface>`,
    `${pad}    def Shader "PreviewSurface"`,
    `${pad}    {`,
    `${pad}        uniform token info:id = "UsdPreviewSurface"`,
    `${pad}        color3f inputs:diffuseColor = ${tuple(p.baseColor.slice(0, 3))}`,
    `${pad}        float inputs:metallic = ${number(p.metallic)}`,
    `${pad}        float inputs:roughness = ${number(p.roughness)}`,
    `${pad}        float inputs:opacity = ${number(p.baseColor[3])}`,
    `${pad}        color3f inputs:emissiveColor = ${tuple(p.emissive)}`,
    `${pad}        token outputs:surface`,
    `${pad}    }`,
    `${pad}}`,
  );
}

function chunks(values, width) {
  const result = [];
  for (let i = 0; i < values.length; i += width) result.push(values.slice(i, i + width));
  return result;
}

function uniqueNames(ids, prefix = "Node") {
  const used = new Set(),
    result = new Map();
  for (const id of ids) {
    const base = identifier(id || prefix);
    let value = base,
      index = 2;
    while (used.has(value)) value = `${base}_${index++}`;
    used.add(value);
    result.set(id, value);
  }
  return result;
}
