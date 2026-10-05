import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const PROLOGUE_RADIO=Object.freeze({
  position:Object.freeze([-.020,.027,-.088]),
  body:Object.freeze([.065,.145,.040]),
  maxTriangles:2000,maxDraws:3,maxBytes:1048576,
});

function resources(root){
  const found=new Set();
  root?.traverse(object=>{
    if(object.geometry)found.add(object.geometry);
    for(const material of [object.material].flat().filter(Boolean)){
      found.add(material);for(const value of Object.values(material))if(value?.isTexture)found.add(value);
    }
  });return found;
}
function disposeTree(root){for(const resource of resources(root))resource.dispose();root?.removeFromParent();}

/** Small emergency silhouette only. The authored GLB replaces this when ready. */
function fallback(){
  const root=new THREE.Group();root.name='Dispatch radio fallback';
  const housing=new THREE.MeshStandardMaterial({color:0x20292d,roughness:.75}),rubber=new THREE.MeshStandardMaterial({color:0x0b1011,roughness:.93}),screen=new THREE.MeshStandardMaterial({color:0x71816a,emissive:0x254531,emissiveIntensity:.12,roughness:.4});
  const add=(geometry,material,position)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(position);root.add(mesh);};
  add(new THREE.BoxGeometry(...PROLOGUE_RADIO.body),housing,[0,0,0]);
  const antenna=new THREE.CylinderGeometry(.0032,.0048,.134,10).translate(.021,.147,0),knob=new THREE.CylinderGeometry(.006,.007,.015,10).translate(-.017,.080,0);
  add(mergeGeometries([antenna,knob]),rubber,[0,0,0]);antenna.dispose();knob.dispose();
  add(new THREE.BoxGeometry(.042,.022,.001),screen,[0,.041,.0205]);
  return root;
}

export function validateRadioAsset(scene){
  if(!scene?.isObject3D||!scene.getObjectByName('DispatchRadio'))throw new Error('Dispatch radio missing authored root');
  let triangles=0,draws=0;const mats=new Set();
  scene.traverse(object=>{
    if(!object.isMesh)return;
    const position=object.geometry?.getAttribute('position');if(!position)throw new Error('Dispatch radio missing positions');
    for(const key of ['position','normal','uv']){
      const attribute=object.geometry.getAttribute(key);
      if(!attribute||attribute.count!==position.count||![...attribute.array].every(Number.isFinite))throw new Error('Dispatch radio has invalid '+key);
    }
    const index=object.geometry.index,count=index?.count||position.count;
    if(count%3||index&&[...index.array].some(i=>!Number.isInteger(i)||i<0||i>=position.count))throw new Error('Dispatch radio has invalid indices');
    triangles+=count/3;
    const materials=[object.material].flat().filter(Boolean);materials.forEach(m=>mats.add(m));draws+=object.geometry.groups.length||1;
  });
  scene.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  if(triangles<1||triangles>PROLOGUE_RADIO.maxTriangles||draws>PROLOGUE_RADIO.maxDraws||mats.size<1||mats.size>3)throw new Error('Dispatch radio geometry budget exceeded');
  if(!size.toArray().every(Number.isFinite)||size.x<.055||size.x>.085||size.y<.20||size.y>.32||size.z<.03||size.z>.06)throw new Error('Dispatch radio has unexpected metre-scale bounds');
  return {triangles,draws,materials:mats.size,bounds:size.toArray()};
}

/** Optional local art with owned resources, bounded wait and late-load cleanup.
 * Each equipment rebuild owns one instance. No cached shared GPU objects means
 * releasing, restarting or disposing an in-flight instance cannot poison the next.
 */
export function createPrologueRadio({loader=new GLTFLoader(),deadlineMs=8000,prepareMaterial=()=>{}}={}){
  const root=new THREE.Group();root.name='Handheld dispatch radio';
  const stats={status:'loading',error:null,triangles:0,draws:0};
  let active=fallback(),disposed=false,expired=false,timer,cancel;
  root.add(active);
  function prepare(scene){
    const seen=new Set();scene.traverse(o=>{
      o.layers.set(0);if(!o.isMesh)return;o.frustumCulled=false;
      for(const material of [o.material].flat().filter(Boolean))if(!seen.has(material)){seen.add(material);material.fog=false;prepareMaterial(material);}
    });
  }
  prepare(active);
  const loading=Promise.resolve().then(()=>loader.loadAsync(new URL('../assets/intro/dispatch-radio.glb',import.meta.url).href)).then(asset=>{
    if(disposed||expired){disposeTree(asset?.scene);return null;}
    try{
      const inventory=validateRadioAsset(asset?.scene);prepare(asset.scene);
      disposeTree(active);active=asset.scene;root.add(active);Object.assign(stats,inventory,{status:'ready',error:null});return active;
    }catch(error){disposeTree(asset?.scene);throw error;}
  });
  const ready=Promise.race([loading,new Promise((_,reject)=>{cancel=reject;timer=setTimeout(()=>{expired=true;reject(new Error('Dispatch radio asset deadline'));},deadlineMs);})]).catch(error=>{
    expired=true;if(!disposed){stats.status='fallback';stats.error=error.message;}return null;
  }).finally(()=>clearTimeout(timer));
  return {root,ready,stats,dispose(){
    if(disposed)return;disposed=expired=true;clearTimeout(timer);stats.status='disposed';cancel(new Error('Dispatch radio disposed'));disposeTree(active);active=null;root.removeFromParent();
  }};
}
