// Branch-root Pages entry. Source is already validated by the repair suite.
import { presentBootError } from "./src/workbench/ui/dom.js";
let host;
try {
  const [{ startWorkbench }, { createBrowserWorkbenchHost }] = await Promise.all([
    import("./src/workbench/app.js"),
    import("./src/workbench/browser-host.js")
  ]);
  host = await createBrowserWorkbenchHost();
  await startWorkbench(host, { debug: true });
} catch (error) {
  try { await host?.dispose?.(); } catch (cleanupError) { console.error(cleanupError); }
  presentBootError(error);
}
