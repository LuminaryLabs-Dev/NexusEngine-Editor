import "./browser.css";
import { presentBootError } from "./ui/dom.js";
let host;
try {
  const [{ startWorkbench }, { createBrowserWorkbenchHost }] = await Promise.all([import("./app.js"), import("./browser-host.js")]);
  host = await createBrowserWorkbenchHost();
  await startWorkbench(host, { debug: true });
} catch (error) {
  try { await host?.dispose(); } catch (cleanupError) { console.error(cleanupError); }
  presentBootError(error);
}
