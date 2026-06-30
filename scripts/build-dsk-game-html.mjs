import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildDskGameHtml } from "../src/dsk-html-builder.js";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/build-dsk-game-html.mjs <manifest.json> <output.html>");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const output = resolve(outputPath);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, buildDskGameHtml(manifest));
console.log(`Built ${output}`);
