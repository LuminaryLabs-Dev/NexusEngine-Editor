# Goal

Build NexusEngine Editor as a registry-driven Domain/Kit Composer over NexusEngine `0.0.4` composition-tree APIs.

## Acceptance

- Project format `0.3.0` stores an accepted registry-reference composition tree and project-local overlay.
- Legacy flat projects migrate without losing unknown kits, settings, object assignments, templates, CLI behavior, or HTML export compatibility.
- The left Composition hierarchy supports contextual Domain/Kit add, selection, schema settings, reference-safe removal, and staged atomic Apply.
- Dirty or invalid drafts disable Run Once, Play, and Build.
- Run Once scopes to the selected kit, domain subtree, or root; resolves trusted Engine exports only; uses a fresh Engine; records a JSON-safe receipt; and disposes the runtime.
- Play uses a separate disposable instance and stops before Apply.
- The 3D viewport remains the primary first-screen surface; advanced registry details stay folded.
- The complete Editor remains inside the window at wide, compact, and narrow sizes; persistent work regions never overlay and all capabilities remain reachable through bounded grid regions.
- Clean installed NexusEngine `0.0.4` integration passes intent, MCP restart, and Playwright human-view checks without changing the production `0.0.3` CDN pin.
- MCP can discover Domains and Kits, produce a stable plan, require human approval for Apply, persist exactly one receipt, and replay that receipt after restart without mutation.

## Boundaries

- NexusEngine owns registry truth, hierarchy validation, and dependency ordering.
- The Editor does not author kit source or execute imported URLs/arbitrary methods.
- Code and registry package installation remains CLI-only; adding an existing registry reference is safe browser editing.
- No push, tag, deploy, or CDN compatibility cutover without explicit approval.
