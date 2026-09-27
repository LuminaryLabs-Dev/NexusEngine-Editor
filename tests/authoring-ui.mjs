import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createAuthoringHost, createFileProjectStore } from "../src/authoring/index.js";
import { startAuthoringPreview } from "../src/authoring/preview/localhost-server.js";
const root=await mkdtemp(join(tmpdir(),"nexus-workbench-ui-"));const host=await createAuthoringHost({store:await createFileProjectStore(root)});let browser,server;
try{
 server=await startAuthoringPreview({host,outputDirectory:join(root,"exports")});
 browser=await chromium.launch({headless:true,executablePath:process.env.NEXUS_CHROMIUM_EXECUTABLE??"/usr/bin/chromium",args:["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(server.url);
 await page.waitForFunction(()=>window.nexusWorkbench?.state?.data||window.nexusWorkbench?.state?.error);
 assert.equal(await page.evaluate(()=>window.nexusWorkbench?.state?.error??null),null);
 const tabs=await page.locator("#bottom-tabs button").allTextContents();assert.ok(tabs.includes("Domains"));assert.ok(tabs.includes("Kits"));assert.ok(tabs.includes("Build"));
 await page.getByRole("button",{name:"+ Cube"}).click();await page.waitForFunction(()=>window.nexusWorkbench.state.data.documents.some(d=>d.kind==="mesh"));
 await page.getByRole("button",{name:"Validate"}).click();await page.waitForFunction(()=>!window.nexusWorkbench.state.busy);
 await page.getByRole("button",{name:"▶ Play"}).click();await page.waitForFunction(()=>window.nexusWorkbench.state.data.workbench.play.state==="playing");
 await page.getByRole("button",{name:"■ Stop"}).click();await page.waitForFunction(()=>window.nexusWorkbench.state.data.workbench.play.state==="stopped");
 await page.getByRole("button",{name:"Save"}).first().click();await page.waitForFunction(()=>!window.nexusWorkbench.state.data.status.dirty);
 await page.getByRole("button",{name:"Export"}).click();await page.waitForFunction(()=>!window.nexusWorkbench.state.busy);
 assert.deepEqual(errors,[]);console.log("Nexus workbench UI: catalog panels, create, validate, Play isolation, save and Core export passed.");
}finally{await browser?.close();await server?.close();await host.close();await rm(root,{recursive:true,force:true});}
