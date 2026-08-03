# Repository Profile

## Observed baseline

- Repository: `LuminaryLabs-Dev/NexusEngine-Editor`
- Default branch: `main`
- Baseline commit: `6d143b3971ceebf346bef1a33cefa3edaa5f70c8`
- Visibility: public
- Package: private `@luminarylabs/nexusengine-editor@0.1.0`
- Public Pages: `https://luminarylabs-dev.github.io/NexusEngine-Editor/`
- License file: absent
- GitHub private vulnerability reporting: disabled
- Formal GitHub releases/tags: none observed on 2026-08-01

## Purpose

Provide a static, viewport-first authoring environment for registry-backed
NexusEngine Domain/Kit projects, project persistence, validation, and playable
HTML export.

## Boundaries

- NexusEngine owns registry truth, tree validation, and dependency planning.
- Editor owns staged authoring, accepted project state, previews, Play, and receipts.
- Browser code/registry installation remains read-only and CLI-only.
- MCP is opt-in and mutation fails closed without explicit authorization.
- Public browser and Node integration use the same exact NexusEngine `0.0.4` candidate commit.

## Local-worktree protection

Two pre-existing clean local feature worktrees were observed before this
documentation cycle. One contains an unpushed commit. Neither worktree is used
or modified; documentation is based only on the exact remote `main` snapshot.

## Validation baseline

On 2026-08-01, the exact remote snapshot passed `npm test`, including the intent
smoke, static build, and Playwright editor matrix. Generated `dist/` remains
ignored and is not part of documentation changes.

The private package has no npm `files` allowlist or `.npmignore`. A dry-run pack
therefore includes repository documentation, `.agent/`, and brand sources. This
is a packaging-boundary observation, not evidence that npm publication is
intended or configured.
