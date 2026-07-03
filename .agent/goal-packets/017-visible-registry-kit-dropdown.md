# Visible Registry Kit Dropdown

Status: active

## Objective

Correct the Domain Stack Add Kit flow so users immediately see a NexusRealtime/ProtoKits-style registry dropdown with sub-domains before installing a kit.

## Scope

- Domain Stack shows a visible `Registry Kit` dropdown by default.
- Search and category filtering stay available but are secondary to the selector.
- Default registry selection is `spatial-authoring-kits`.
- Composite selections show child domain paths and kit ids before install.
- `Install Bundle` uses the existing kit installer and preserves child kit metadata in the project/export manifest.

## Acceptance Proof

- Intent smoke proves `spatial-authoring-kits` is the default picker selection and its bundle plan includes child kits.
- Playwright smoke sees `#kit-select` on first load and sees `selection-domain-service-kit` in the sub-domain preview.
- Live Playwright diagnostic installs the spatial bundle, builds HTML, and verifies the exported HTML includes `selection-domain-service-kit`.
