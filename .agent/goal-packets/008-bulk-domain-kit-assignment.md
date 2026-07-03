# Bulk Domain Kit Assignment

Status: active

## Objective

Make installed Domain Service Kits usable against scene content at scale, not just visible in the stack.

## Target Experience

- User selects a domain kit from the Domain Stack.
- Configure panel can assign that selected kit to the selected scene object.
- Configure panel can assign that selected kit to every currently filtered visible scene object.
- Object filters can match object id, label, type, assigned kit, or component.
- Assigned objects persist `domainKits` and component metadata in the project manifest and HTML export.

## Acceptance Proof

- Intent smoke assigns `n:physics` to the filtered `cube-2` object set and confirms `cube-20` has `n:physics`.
- Playwright smoke filters the scene object list, selects `n:physics`, assigns visible objects, and confirms the manifest.
- Live Playwright diagnostic verifies the registry dropdown/sub-kit preview, installs a composite bundle, bulk assigns `n:physics`, builds HTML, and captures desktop/mobile screenshots outside the repo.
