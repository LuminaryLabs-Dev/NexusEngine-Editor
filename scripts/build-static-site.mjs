import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_DSK_GAME, buildDskGameHtml } from "../src/dsk-html-builder.js";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "games"), { recursive: true });
await cp(resolve(root, "index.html"), resolve(dist, "index.html"));
await cp(resolve(root, "assets"), resolve(dist, "assets"), { recursive: true });
await cp(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "README.md"), resolve(dist, "README.md"));
await writeFile(resolve(dist, ".nojekyll"), "");
await writeFile(resolve(dist, "games", "starter-game.html"), buildDskGameHtml(DEFAULT_DSK_GAME));

console.log(`Built static editor at ${dist}`);
