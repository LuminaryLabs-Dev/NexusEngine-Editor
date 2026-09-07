import { createPresentationKit } from "nexusengine/domains/presentation";
import { createUIKit } from "nexusengine/domains/presentation/ui";
export function installAuthoringPanel(host) {
  host.engine.installKit(createPresentationKit());
  host.engine.installKit(createUIKit());
  const descriptor = {
    schema: "nexusengine.editor.authoring-panel/1",
    title: "NEXUS  /  AUTHORING",
    subtitle: "Object and mesh tools",
    toolbar: [
      { id: "cube", label: "+ Cube" },
      { id: "torus", label: "+ Torus" },
      { id: "sphere", label: "+ Sphere" },
      { id: "undo", label: "Undo" },
      { id: "redo", label: "Redo" },
      { id: "save", label: "Save" },
      { id: "export", label: "Export GLB" },
      { id: "command", label: "Command" },
    ],
    inspector: [
      { id: "translate", label: "Move  G" },
      { id: "rotate", label: "Rotate  R" },
      { id: "scale", label: "Scale  S" },
      { id: "face-up", label: "Top face +Y" },
      { id: "material", label: "Cycle material" },
      { id: "play", label: "Play / pause" },
      { id: "frame", label: "Frame object" },
    ],
    projectActions: [
      { id: "open-project", label: "Open project" },
      { id: "new-project", label: "New project" },
    ],
    panes: [
      { id: "outliner", title: "OBJECTS" },
      { id: "inspector", title: "INSPECTOR" },
      { id: "documents", title: "DOCUMENTS" },
    ],
    footer: "Orbit: drag  ·  Zoom: wheel  ·  Ctrl+S: save  ·  Ctrl+Z: undo",
  };
  host.engine.n.ui.setDescriptor("panels", "authoring", descriptor);
  return host.engine.n.ui.getDescriptors("panels").authoring;
}
