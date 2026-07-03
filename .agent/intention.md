# Intention

Status: active

## Purpose

The user wants NexusEngine Editor to become a usable browser-based 3D game-engine editor, not a hero-style demo shell.

## Product Direction

- Blender-like 3D viewport with a default cube and grid as the first screen.
- Domain Service Kits are the primary authoring model.
- Users add, reorder, and string domains/kits together from a compact left Domain Stack.
- Users configure the selected domain, kit, or sequence step from a compact right panel.
- Users sequence and link events between kits through a bottom Sequence Timeline.
- The top command strip stays minimal: scene name, play/stop, save, build HTML, export, readiness.

## Current Constraint

Implementation is active for the 3D viewport-first editor goal. Keep changes coherent, validate with Playwright, and do not store Playwright reports/traces/videos inside the repo.
