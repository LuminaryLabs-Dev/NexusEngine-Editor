const manifest = Object.freeze({
  id: "editor-export-service-kit",
  version: "0.1.0",
  status: "stable-candidate",
  kind: "domain-service-kit",
  responsibility:
    "Select trusted asset export providers and own the encode, validate, publish, and receipt workflow.",
  atomic: true,
  productNeutral: true,
  determinism: "deterministic",
  domainPath: "n:editor:export",
  parentDomainPath: "n:editor",
  apiName: "editorExport",
  requires: Object.freeze(["n:authoring:publishing"]),
  provides: Object.freeze(["n:editor:export", "export:asset"]),
  environments: Object.freeze(["node"]),
  source: Object.freeze({
    module:
      "./src/editor/export/kits/editor-export-service-kit/index.js",
    exportName: "createEditorExportServiceKit",
    publicSubpath: "./editor/export",
  }),
});

export default manifest;
