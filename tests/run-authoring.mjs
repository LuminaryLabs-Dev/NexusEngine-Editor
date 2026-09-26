import { spawnSync } from "node:child_process";
const tests = [
  "host",
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
  `Passed ${tests.length} Authoring host, delivery, multi-format export, browser, worker and batch proofs.`,
);
