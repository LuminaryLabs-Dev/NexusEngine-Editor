export const editorExportDomainManifest = Object.freeze({
  identity: Object.freeze({
    id: "editor-export-domain",
    domainPath: "n:editor:export",
    parentDomainPath: "n:editor",
    label: "Editor Export",
    status: "stable-candidate",
  }),
  ownership: Object.freeze({
    responsibility:
      "Own conversion of Authoring delivery packets into validated external asset artifacts.",
    owns: Object.freeze([
      "export requests",
      "export provider registry and selection",
      "export capability discovery",
      "encode-validate-publish lifecycle",
      "export receipts",
      "artifact publication",
    ]),
    forbiddenResponsibilities: Object.freeze([
      "editable source ownership",
      "mesh authoring",
      "material authoring",
      "runtime rendering",
    ]),
  }),
  dependencies: Object.freeze({
    requires: Object.freeze(["n:authoring:publishing"]),
    optional: Object.freeze([]),
  }),
  outputs: Object.freeze(["n:editor:export", "export:asset"]),
});

export default editorExportDomainManifest;
