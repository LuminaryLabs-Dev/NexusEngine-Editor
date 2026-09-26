import {
  assertDeliveryPacket,
  inspection,
  unsupportedIssue,
  warningIssue,
} from "../contracts/provider.js";

export function inspectStaticAssetPacket(
  packet,
  { format, textures = false, cameras = false, lights = false } = {},
) {
  assertDeliveryPacket(packet);
  const issues = [];
  if (packet.rigs?.length || packet.skins?.length)
    issues.push(
      unsupportedIssue(
        `${format.toUpperCase()}_SKIN_UNSUPPORTED`,
        `${format.toUpperCase()} static profile does not preserve rigs or skinning.`,
      ),
    );
  if (packet.animations?.length)
    issues.push(
      unsupportedIssue(
        `${format.toUpperCase()}_ANIMATION_UNSUPPORTED`,
        `${format.toUpperCase()} static profile does not preserve animation.`,
      ),
    );
  if (packet.shapes?.length)
    issues.push(
      unsupportedIssue(
        `${format.toUpperCase()}_MORPH_UNSUPPORTED`,
        `${format.toUpperCase()} static profile does not preserve morph targets.`,
      ),
    );
  if (!textures && packet.materials?.some((m) => Object.keys(m.pbr?.textures ?? {}).length))
    issues.push(
      unsupportedIssue(
        `${format.toUpperCase()}_TEXTURE_UNSUPPORTED`,
        `${format.toUpperCase()} static profile currently requires scalar PBR materials without texture bindings.`,
      ),
    );
  if (!cameras && packet.assembly?.cameras?.length)
    issues.push(
      unsupportedIssue(
        `${format.toUpperCase()}_CAMERA_UNSUPPORTED`,
        `${format.toUpperCase()} static profile does not preserve cameras.`,
      ),
    );
  if (!lights && packet.assembly?.lights?.length)
    issues.push(
      unsupportedIssue(
        `${format.toUpperCase()}_LIGHT_UNSUPPORTED`,
        `${format.toUpperCase()} static profile does not preserve lights.`,
      ),
    );
  const nodeById = new Map((packet.assembly?.nodes ?? []).map((node) => [node.id, node]));
  for (const node of packet.assembly?.nodes ?? []) {
    if (node.included && node.parent && !nodeById.get(node.parent)?.included)
      issues.push(
        unsupportedIssue(
          `${format.toUpperCase()}_HIERARCHY_UNSUPPORTED`,
          `${format.toUpperCase()} export cannot include a child whose parent is excluded.`,
          { nodeId: node.id, parentId: node.parent },
        ),
      );
    if (!node.included || !node.meshId) continue;
    if ((node.materials?.length ?? 0) > 1)
      issues.push(
        unsupportedIssue(
          `${format.toUpperCase()}_MULTI_MATERIAL_UNSUPPORTED`,
          `${format.toUpperCase()} static profile currently supports one material per mesh instance.`,
          { nodeId: node.id, materials: node.materials },
        ),
      );
  }
  for (const material of packet.materials ?? []) {
    if ((material.pbr?.metallic ?? 0) > 0 && format === "fbx")
      issues.push(
        warningIssue(
          "FBX_PBR_APPROXIMATION",
          "FBX ASCII profile approximates metallic-roughness through classic material properties.",
          { materialId: material.id },
        ),
      );
  }
  return inspection(issues);
}

export function includedMeshNodes(packet) {
  return packet.assembly.nodes.filter((node) => node.included && node.meshId);
}

export function meshFor(packet, node) {
  const mesh = packet.meshes.find((entry) => entry.id === node.meshId);
  if (!mesh) {
    const error = new Error(`Missing evaluated mesh ${node.meshId}.`);
    error.code = "EDITOR_EXPORT_PACKET";
    throw error;
  }
  return mesh;
}

export function materialFor(packet, node) {
  const id = node.materials?.[0];
  return id ? packet.materials.find((entry) => entry.id === id) ?? null : null;
}
