# Scene Outliner Bulk Authoring

Status: active

## Objective

Make scene authoring scale beyond single-object editing by adding compact object search and bulk object operations inside the Configure overlay.

## Target Experience

- Scene selection shows object count, kit link count, and component count.
- Users can filter scene objects by id, label, object type, assigned kit, or component.
- Users can add one cube or a compact 25-object grid batch.
- Users can duplicate or delete the selected scene object without leaving the viewport.
- Bulk-added objects stay visually compact so large scenes do not overwhelm the first view.
- Build/export preserves the larger scene object list and selected object transforms.

## Acceptance Proof

- Intent smoke verifies scene stats, flexible object filtering, 25-object bulk add, duplicate, delete, and export preservation.
- Playwright smoke adds 27 objects, filters to `cube-27`, duplicates/deletes, edits `cube-02`, assigns `n:physics`, and confirms the manifest.
- Live diagnostic verifies the same workflow on `http://127.0.0.1:4174/` with desktop and mobile screenshots retained outside the repo.
