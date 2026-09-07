import assert from "node:assert/strict";
import http from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
const source = `import {createBrowserProjectStore} from './src/authoring/storage/browser-project.js';
import {createEngine} from 'nexusengine';import {createAuthoringDomain} from 'nexusengine/domains/authoring';
try{const engine=createEngine({kits:createAuthoringDomain({project:{projectId:'browser-project'}})}),project=engine.n.authoringProject,store=await createBrowserProjectStore({databaseName:'authoring-storage-test',projectId:'browser-project'}),other=await createBrowserProjectStore({databaseName:'authoring-storage-test',projectId:'browser-project'});project.execute({requestId:'cube',epoch:project.context().epoch,operations:[{id:'mesh.cube',args:{id:'cube'}}]});const source=project.getSnapshot(),first=await store.save(source),loaded=await other.load();if(JSON.stringify(loaded.snapshot)!==JSON.stringify(source))throw Error('Browser source roundtrip differs.');let conflict=false;try{await other.save(source,{expectedGeneration:0});}catch(e){conflict=e.code==='AUTHORING_STORAGE_CONFLICT';}if(!conflict)throw Error('Competing browser generation was accepted.');await store.save(source,{expectedGeneration:first.generation});store.close();other.close();window.result={ok:true,generation:2,documents:Object.keys(source.documents).length};}catch(error){window.result={ok:false,message:error.message,stack:error.stack};}`;
const bundle = await build({
    stdin: {
      contents: source,
      resolveDir: process.cwd(),
      sourcefile: "browser-storage-test.js",
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    logLevel: "silent",
  }),
  script = bundle.outputFiles[0].text,
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><script type="module">' + script + "</script>");
  });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.NEXUS_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.result);
  const result = await page.evaluate(() => window.result);
  assert.equal(result.ok, true, JSON.stringify(result));
  console.log(
    "Authoring browser storage: actual IndexedDB source roundtrip, competing-writer rejection and connection cleanup passed.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
