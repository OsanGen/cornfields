import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCornGeometry,createCornSurfaceAtlas,refineCornKit,CORN_ART_VERSION} from '../src/corn-art.js';
import {applyEnvironmentSurface,varyWoodUV} from '../src/environment-materials.js';
import {createFoliageMotion} from '../src/foliage-motion.js';
import {createWoodPanelGeometry} from '../src/wood-panels.js';
import {grassGeometry} from '../src/ground-details.js';
import {attachLiquidMaterial} from '../src/liquid-material.js';
import {createBloodRoom} from '../src/blood-room.js';

const shader=()=>({uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader});

test('original corn family retains six names, rooted metre-scale bounds and modest LOD budgets',()=>{
  for(let variant=0;variant<3;variant++)for(const far of [false,true]){
    const g=createCornGeometry(variant,{far}),b=g.boundingBox;
    assert.equal(g.name,`corn_${far?'far':'near'}_${variant}`);assert.equal(g.userData.artVersion,CORN_ART_VERSION);
    assert(Math.abs(b.min.y)<1e-6);assert(b.max.y>3&&b.max.y<3.55);assert(b.max.x-b.min.x<2.1);assert(b.max.z-b.min.z<2.1);
    assert.equal(g.index.count/3,far?160:1530);assert.equal(g.attributes.cornFlex.count,g.attributes.position.count);
    for(const name of ['position','normal','uv','cornFlex'])assert([...g.attributes[name].array].every(Number.isFinite));
    assert([...g.attributes.uv.array].every(x=>x>=0&&x<=1));
    for(let i=0;i<g.attributes.position.count;i++)if(g.attributes.position.getY(i)<.001)assert.equal(g.attributes.cornFlex.getX(i),0);
  }
});

test('corn geometry and atlas authoring are deterministic and contain no transparent cutout cards',()=>{
  assert.deepEqual(createCornGeometry(1).attributes.position.array,createCornGeometry(1).attributes.position.array);
  const a=createCornSurfaceAtlas(64),b=createCornSurfaceAtlas(64);
  assert.equal(a.bytes,64*64*4*3);assert.deepEqual(a.map.image.data,b.map.image.data);
  for(const key of ['map','normalMap','roughnessMap']){
    assert.equal(a[key].minFilter,THREE.LinearMipmapLinearFilter);assert.equal(a[key].generateMipmaps,true);
    assert(a[key].image.data.every((n,i)=>i%4!==3||n===255));
  }
  assert.equal(a.map.colorSpace,THREE.SRGBColorSpace);assert.equal(a.normalMap.colorSpace,THREE.NoColorSpace);
  assert(new Set(a.roughnessMap.image.data).size>20);assert.throws(()=>createCornSurfaceAtlas(7));
});

test('kit refinement shares one PBR material/atlas and preserves original LOD node names',()=>{
  const material=new THREE.MeshStandardMaterial(),kit={};
  for(const lod of ['near','far'])for(let i=0;i<3;i++)kit[`corn_${lod}_${i}`]=new THREE.Mesh(new THREE.BoxGeometry(),material);
  const report=refineCornKit(kit);assert.equal(report.additionalDrawCalls,0);assert.equal(report.atlasBytes,12*1024*1024);
  assert.equal(new Set(Object.values(kit).map(mesh=>mesh.material)).size,1);assert.equal(material.userData.cornArt,CORN_ART_VERSION);
  assert.equal(material.side,THREE.DoubleSide);assert.equal(material.alphaTest,0);assert.equal(material.transparent,false);
  for(const key of ['map','normalMap','roughnessMap'])material[key].dispose();
});

test('wind has shared clocks, world-space coherent roots and reduced-effects zero motion',()=>{
  const motion=createFoliageMotion(),source=new THREE.MeshStandardMaterial();source.userData.cornArt=CORN_ART_VERSION;
  const a=motion.material(source),b=motion.material(source),sa=shader(),sb=shader();a.onBeforeCompile(sa);b.onBeforeCompile(sb);
  assert.equal(sa.uniforms.cornTime,sb.uniforms.cornTime);assert.equal(a.defines.CORN_ART,1);
  motion.update(2,{x:3,z:4},false);assert.equal(sa.uniforms.cornTime.value,2);assert.deepEqual(sa.uniforms.cornPlayer.value.toArray(),[3,4]);
  motion.update(5,{x:3,z:4},true);assert.equal(sa.uniforms.cornMotion.value,0);
  assert.match(sa.vertexShader,/cornTip \* cornTip \* cornMotion/);assert.match(sa.vertexShader,/cornRoot\.x/);assert.match(sa.vertexShader,/cornFlex/);
  const fallback=motion.material(new THREE.MeshStandardMaterial());assert.equal(fallback.defines?.CORN_ART,undefined);
});

test('surface shaders compose with liquid, retain world anchoring, and distinguish shader programs',()=>{
  const keys=[];
  for(const kind of ['mud','wood','paint','earth']){
    const m=new THREE.MeshStandardMaterial();let called=0;m.onBeforeCompile=()=>called++;
    const uniforms=applyEnvironmentSurface(m,{kind,wet:false});assert.equal(applyEnvironmentSurface(m,{kind}),uniforms);
    attachLiquidMaterial(m);const s=shader();m.onBeforeCompile(s);
    assert.equal(called,1);assert.equal(s.uniforms.environmentWetness.value,0);assert(s.uniforms.prologueLiquid);
    assert.match(s.vertexShader,/vEnvironmentWorld=\(modelMatrix\*environmentPosition\)\.xyz/);
    assert.match(s.fragmentShader,/liquidColor/);assert.match(s.fragmentShader,/environmentNoise/);
    assert.equal((s.vertexShader.match(/varying vec3 vEnvironmentWorld/g)||[]).length,1);
    keys.push(m.customProgramCacheKey());
  }
  assert.equal(new Set(keys).size,4);
});

test('wood UV variation offsets matching albedo, normal and roughness sampling once',()=>{
  const m=new THREE.MeshStandardMaterial();applyEnvironmentSurface(m,{kind:'wood'});varyWoodUV(m);varyWoodUV(m);attachLiquidMaterial(m);
  const s=shader();m.onBeforeCompile(s);
  assert.match(s.vertexShader,/vMapUv\+=boardOffset/);assert.match(s.vertexShader,/vNormalMapUv\+=boardOffset/);assert.match(s.vertexShader,/vRoughnessMapUv\+=boardOffset/);
  assert.equal((s.vertexShader.match(/float boardSeed/g)||[]).length,1);
});

test('bevelled individual boards remain inside the original panel envelope',()=>{
  const g=createWoodPanelGeometry();g.computeBoundingBox();const b=g.boundingBox;
  assert(b.min.x>=-.50001&&b.max.x<=.50001);assert(b.min.y>=-1.32501&&b.max.y<=1.32501);assert(b.min.z>=-.04001&&b.max.z<=.04001);
  assert(g.attributes.position.count>36);assert([...g.attributes.normal.array].every(Number.isFinite));
});

test('fallen husks add shape within the existing grass batch without large obstacles',()=>{
  const g=grassGeometry();g.computeBoundingBox();assert.equal(g.attributes.position.count,11*3+3*6*2*6);
  assert(g.boundingBox.max.y<=.31);assert(g.boundingBox.min.y>=0);assert.equal(g.attributes.color.count,g.attributes.position.count);
});

test('red room keeps exact bounds, one projector and face, with grounded feet and bounded haze',()=>{
  const room=createBloodRoom(),walls=room.group.children[0];assert.deepEqual([walls.geometry.parameters.width,walls.geometry.parameters.height,walls.geometry.parameters.depth],[6.4,3.3,9.6]);
  const projector=room.group.getObjectByName('Single film projector'),feet=room.group.getObjectByName('Projector support feet');assert(projector);assert(feet);
  room.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(feet);assert(bounds.min.y>=0&&bounds.min.y<.03);
  assert.equal(room.group.children.filter(o=>o.name==='Single film projector').length,1);assert(room.group.getObjectByName('Original anonymous distressed face projection'));
  const haze=room.group.getObjectByName('Bounded projector haze');room.update(3,true);assert.equal(haze.material.uniforms.clock.value,0);assert.equal(haze.material.uniforms.amount.value,.35);
  assert.equal(haze.material.depthWrite,false);assert.equal(haze.material.depthTest,true);
});

test('checkpoint detail option retains cloth variation while default vision treatment stays unchanged',()=>{
  const ordinary=new THREE.MeshStandardMaterial(),cloth=new THREE.MeshStandardMaterial();cloth.userData.liquidDetail=1;
  const a=attachLiquidMaterial(ordinary),b=attachLiquidMaterial(cloth);assert.equal(a.detail.value,0);assert.equal(b.detail.value,1);
  const s=shader();cloth.onBeforeCompile(s);assert.equal(s.uniforms.liquidDetail,b.detail);assert.match(s.fragmentShader,/detailedLiquid/);
});
