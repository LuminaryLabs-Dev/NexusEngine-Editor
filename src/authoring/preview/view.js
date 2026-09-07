import { createLightingDescriptor } from "nexusengine/domains/presentation/graphics";
export function createAuthoringView(options = {}) {
  return {
    schema: "nexusengine.authoring-view/1",
    width: options.width ?? 1024,
    height: options.height ?? 768,
    background: options.background ?? [0.035, 0.045, 0.065],
    camera: options.camera ?? null,
    exposure: options.exposure ?? 1,
    lights: options.lights ?? [
      createLightingDescriptor({
        id: "key",
        kind: "directional",
        color: [1, 0.91, 0.8],
        intensity: 4,
        position: [4, 6, 5],
        castsShadow: true,
      }),
      createLightingDescriptor({
        id: "fill",
        kind: "directional",
        color: [0.65, 0.78, 1],
        intensity: 1.5,
        position: [-4, 2, 1],
      }),
      createLightingDescriptor({
        id: "ambient",
        kind: "ambient",
        color: [1, 1, 1],
        intensity: 0.65,
      }),
    ],
  };
}
