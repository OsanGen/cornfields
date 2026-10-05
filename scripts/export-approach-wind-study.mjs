/** CPU-only deformation study. Does not execute GLSL or capture the game renderer. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createCornGeometry,createCornSurfaceAtlas,CORN_ART_VERSION} from '../src/corn-art.js';
import {createPrologueVisuals} from '../src/prologue-visuals.js';
import {sampleWind,rendererStub,cornBatches} from '../tests/helpers/foliage-motion-cpu.mjs';
const out=new URL('../verification/approach-wind/',import.meta.url);await mkdir(out,{recursive:true});
const material=new T.MeshStandardMaterial();material.userData.cornArt=CORN_ART_VERSION;
const parts=[0,1,2].map(i=>({geometry:createCornGeometry(i),material}));let scene;
const view=createPrologueVisuals(rendererStub(s=>{scene=s;}),{getCorn:()=>parts,spawn:{x:0,z:0,yaw:Math.PI}});view.render({chapter:'walk',chapterProgress:.5,time:4});
const batches=cornBatches(scene),field=batches.find(b=>b.parent.name==='Westward cornfield approach and threshold'),instance=new T.Matrix4();field.getMatrixAt(0,instance);
const matrix=field.matrixWorld.clone().multiply(instance),root=new T.Vector3().setFromMatrixPosition(matrix),g=field.geometry,times=[0,2,4,6,8,10,12,14],frames=[];
let maxDisplacement=0,maxRootDisplacement=0;
for(const time of times){
  const positions=[],base=[];
  for(let i=0;i<g.attributes.position.count;i++){
    const p=new T.Vector3().fromBufferAttribute(g.attributes.position,i),sample=sampleWind(p,g.attributes.cornFlex.getX(i),matrix,{time});
    positions.push(...sample.world.clone().sub(root).toArray());base.push(...p.clone().applyMatrix4(matrix).sub(root).toArray());
    maxDisplacement=Math.max(maxDisplacement,sample.offset.length());if(p.y<1e-8)maxRootDisplacement=Math.max(maxRootDisplacement,sample.offset.length());
  }
  frames.push({time,positions,base});
}
const sha=async name=>createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex');
const payload={evidence:'Independent CPU shader-equation reference and actual runtime geometry; no GPU/browser or playtest evidence',createdUtc:new Date().toISOString(),sourceHashes:{'src/prologue-visuals.js':await sha('src/prologue-visuals.js'),'src/foliage-motion.js':await sha('src/foliage-motion.js'),'tests/helpers/foliage-motion-cpu.mjs':await sha('tests/helpers/foliage-motion-cpu.mjs')},geometry:g.name,actualWorldMatrix:matrix.toArray(),frames,indices:[...g.index.array],uv:[...g.attributes.uv.array],metrics:{times,maxDisplacement,maxRootDisplacement,totalInstances:batches.reduce((n,b)=>n+b.count,0),additionalDrawCalls:0,additionalTextures:0}};
await writeFile(new URL('geometry-motion-study.json',out),JSON.stringify(payload));
const atlas=createCornSurfaceAtlas();for(const key of ['map','normalMap','roughnessMap']){await writeFile(new URL(key+'.rgba',out),atlas[key].image.data);atlas[key].dispose();}
view.dispose();for(const p of parts)p.geometry.dispose();material.dispose();console.log(JSON.stringify({sourceHashes:payload.sourceHashes,metrics:payload.metrics},null,2));
