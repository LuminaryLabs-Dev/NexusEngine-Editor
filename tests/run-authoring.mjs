import { spawnSync } from "node:child_process";
const tests = [
  "host",
  "workbench",
  "game-workflow",
  "export",
  "formats",
  "render",
  "ui",
  "cli",
  "jobs",
  "browser-storage",
  "articulated-render",
  "batch",
];
for (const name of tests) {
  const result = spawnSync(process.execPath, [`tests/authoring-${name}.mjs`], {
    stdio: "inherit",
    timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  `Passed ${tests.length} Authoring host, Core workbench/game loop, delivery, multi-format export, browser, worker and batch proofs.`,
);
