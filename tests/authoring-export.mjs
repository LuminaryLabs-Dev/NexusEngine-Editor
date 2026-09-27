import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthoringHost } from "../src/authoring/index.js";
const host=await createAuthoringHost();let n=0;
const cmd=(id,args)=>host.command({requestId:`export-${++n}`,epoch:host.status().context.epoch,operations:[{id,args}]});
await cmd("mesh.cube",{id:"cube"});await cmd("material.set",{id:"material",content:{baseColor:[.4,.3,.2,1],roughness:.7}});await cmd("assembly.set",{id:"scene",content:{nodes:[{id:"cube-node",name:"Cube",meshId:"cube",materials:["material"]}]}});
assert.deepEqual(host.exportFormats().map(x=>x.format).sort(),["fbx","glb","usdz"]);
const root=await mkdtemp(join(tmpdir(),"editor-core-export-"));
try{for(const format of ["glb","fbx","usdz"]){const inspected=host.inspectExport({assemblyId:"scene",format});assert.equal(inspected.errors,0);const out=await host.exportArtifact({assemblyId:"scene",format,outputDirectory:root});assert.equal(out.validation.errors,0);assert.ok(out.artifact);assert.ok((await readFile(out.artifact)).length>100);}}
finally{await host.close();await rm(root,{recursive:true,force:true});}
console.log("Authoring export: Editor delegates GLB, FBX and USDZ to Core providers.");
