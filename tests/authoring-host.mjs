import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthoringHost, createFileProjectStore } from "../src/authoring/index.js";
const root=await mkdtemp(join(tmpdir(),"nexus-editor-core-host-"));
const semantic=s=>({projectId:s.projectId,documents:Object.fromEntries(Object.entries(s.documents).map(([id,d])=>[id,{kind:d.kind,hash:d.hash,content:d.content}])),receipts:s.receipts,undo:s.undo,redo:s.redo});
try{
 let host=await createAuthoringHost({store:await createFileProjectStore(root),projectId:"proof"});
 assert.equal(host.runtimeIdentity.canonicalAuthoring,true);
 assert.equal(host.status().kitIds.includes("editor-export-service-kit"),false);
 const exec=(id,args)=>host.command({requestId:host.requestId(),epoch:host.status().context.epoch,operations:[{id,args}]});
 await exec("mesh.cube",{id:"cube"});await exec("assembly.set",{id:"scene",content:{nodes:[{id:"cube-node",name:"Cube",meshId:"cube"}]}});
 assert.equal(host.validateProject().errors,0);await host.save();
 const manifest=JSON.parse(await readFile(join(root,"authoring-project.json"),"utf8"));assert.equal(manifest.schema,"nexusengine.authoring-package/1");
 const before=semantic(host.snapshot());await host.close();host=await createAuthoringHost({store:await createFileProjectStore(root)});
 const after=semantic(host.snapshot());for(const [id,d] of Object.entries(before.documents)){assert.deepEqual(after.documents[id].content,d.content);assert.equal(after.documents[id].hash,d.hash);}
 assert.deepEqual(after.receipts,before.receipts);assert.equal(after.undo.length,before.undo.length);await host.close();
 console.log("Authoring host: Core persistence, fresh-runtime restore and canonical ownership passed.");
}finally{await rm(root,{recursive:true,force:true});}
