import assert from "node:assert/strict";
import { EDITOR_KITS, createEditorState, recordEditorEvent } from "../src/kits/editor-kits.js";
import { DEFAULT_DSK_GAME, buildDskGameHtml, createDskGameFileName, normalizeDskGameManifest } from "../src/dsk-html-builder.js";

assert.equal(EDITOR_KITS.length, 9);
for (const expected of [
  "n:editor",
  "n:editor:viewport",
  "n:editor:header",
  "n:editor:dock",
  "n:editor:dock:kits",
  "n:editor:dock:inspector",
  "n:editor:dock:proof",
  "n:editor:selection",
  "n:editor:status"
]) {
  assert.ok(EDITOR_KITS.some((kit) => kit.domainPath === expected), `missing ${expected}`);
}
const state = createEditorState();
recordEditorEvent(state, "editor.smoke", { domainPath: "n:editor:status" });
assert.equal(state.events.length, 1);
assert.equal(state.kitRegistry.get("n:editor:viewport").role, "full-game-viewport");
const manifest = normalizeDskGameManifest(DEFAULT_DSK_GAME);
assert.equal(manifest.domainPath, "n:game:starter");
assert.equal(createDskGameFileName(manifest), "n-game-starter.html");
assert.match(buildDskGameHtml(manifest), /window.__NEXUS_DSK_GAME__/);
console.log("editor intent smoke passed");
