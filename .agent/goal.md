# Active Goal

Status: release integration proven locally; remote release gates pending

## Target

Deliver the registry-driven Domain/Kit Composer described in `goal.md` and Goal Packet 023.

## Current proof

- NexusEngine Composition registry v3 and composition-tree APIs load from exact commit `58fa721db73992d77d6866b282494a559f0ec13c` without a sibling checkout or symlink.
- Project `0.4.0` migration, compatibility projections, atomic Apply, reference protection, trusted Run Once disposal, Save/Load, Build, and Play/Stop are covered by existing smokes.
- Human-view captures live under `dist/registry-composer-*.png` and are generated artifacts, not release inputs.
- The Editor now uses wide, compact, and narrow non-overlay grid tiers with bounded context switching and persisted keyboard-accessible splitters.
- Generated `.project.json` files can open through `?project=`, preserve a safe local playable descriptor, render shared-runtime authoring maps and player views, and run the exact generated game through the authoritative Play/Stop viewport path. `Ashes of the Colossus` passed browser import, 112-object authoring, camera orbit, Save/Load, gameplay movement/look, Stop, replay, and CLI-status proof.

## Remaining gate

- Push Engine and Editor default branches only after explicit approval.
- Require hosted checks on the exact Engine candidate and rerun Editor proof from the remote commit.
- Deploy GitHub Pages only through a separately approved manual dispatch.
