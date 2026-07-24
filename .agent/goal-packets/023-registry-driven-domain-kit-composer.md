# Goal Packet 023: Registry-Driven Domain/Kit Composer

Status: implemented and locally validated; release approval pending

## Goal

Replace the flat authoring surface with a staged registry-reference hierarchy backed by NexusEngine's canonical Core Composition registry and planner.

## Delivered

- Project format `0.3.0` migration and project-local legacy registry overlay
- accepted composition plus derived flat compatibility projections
- contextual Domain/Kit hierarchy, inspector, settings, reference-safe remove, and atomic Apply
- selection-aware trusted Run Once with fresh-engine disposal and bounded receipts
- separate Play/Stop lifecycle and dirty/invalid Build gates
- sibling NexusEngine query override for localhost proof without changing the CDN pin
- extended intent and Playwright smokes, including visual captures and console/page-error checks

## Validation

- `npm test` passes against the sibling NexusEngine
  `feature/core-composition-registry-v2` contract.
- Intent, static build, and Playwright editor smokes pass.
- The production NexusEngine CDN pin remains unchanged.

## Release gate

Do not tag, push, deploy, or change the production NexusEngine `0.0.3` pin until the Engine `0.0.4` compatibility release is explicitly approved.
