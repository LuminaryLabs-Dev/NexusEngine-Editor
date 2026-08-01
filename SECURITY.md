# Security Policy

## Reporting

GitHub private vulnerability reporting is not currently enabled, and this
repository does not publish a private security contact. Do not disclose
credentials, personal data, browser state, or full exploit details in a public
issue. Contact a maintainer through an established private channel first.

A sanitized report should identify the affected commit/path, reproduction
conditions, expected and observed behavior, impact, and a safe mitigation when
known.

## Implemented boundaries

- Browser kit and registry-package installation is CLI-only.
- Imported project registry records remain untrusted.
- Preview and Play resolve only trusted executable factories.
- Invalid composition drafts cannot replace accepted state.
- Playable paths reject traversal and remote schemes; exports reject symlinks.
- Editor MCP writes require `NEXUS_EDITOR_MCP_ALLOW_WRITES=1`.
- Example game MCP actions require `NEXUS_GAME_MCP_ALLOW_ACTIONS=1`.

The screenshot MCP utility launches Chromium with web security disabled for
local trusted automation. Do not use it for untrusted URLs or with sensitive
browser state.

No supported-version matrix, maintenance lifetime, response-time commitment,
or coordinated-disclosure timeline is currently published.
