# Viewport-First 3D Editor Feedback

Status: active

## User Corrections

- The editor should look more like Blender with a 3D scene, a default cube in the middle, and a grid.
- This is a 3D engine, not a 2D editor.
- The left hierarchy should be compact and allow adding, reordering, and stringing domains/kits together.
- The bottom timeline should sequence and link events between kits.
- The timeline should allow adding sequence steps, and each step should drive a kit.
- All three panels should look like small draggable panels pulled in from off-screen, not bars or fixed sidebars attached to the viewport.

## Design Consequence

The implementation should prioritize a full-screen 3D viewport with lightweight overlay panels:

- left: Domain Stack
- right: Configure
- bottom: Sequence Timeline

## Reference

![Target 3D Domain Service Kit Editor](../references/target-3d-domain-service-kit-editor.png)

