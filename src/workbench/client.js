import "./browser.css";
import { presentBootError } from "./ui/dom.js";
let host;
try {
  const [{ startWorkbench }, { createLocalWorkbenchAdapter }] = await Promise.all([import("./app.js"), import("./adapters/local.js")]);
  host = await createLocalWorkbenchAdapter();
  await startWorkbench(host, { debug: true });
} catch (error) {
  try { await host?.dispose(); } catch (cleanupError) { console.error(cleanupError); }
  presentBootError(error);
}
