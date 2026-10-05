import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';
import {prepareCruiser} from '../src/prologue-assets.js';
async function fixture(file='cast.glb') {
  const bytes = await readFile(new URL('../assets/intro/'+file, import.meta.url));
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key];
  }
  delete json.images; delete json.textures; delete json.samplers;
  const source = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(source.length / 4) * 4, 32);
  source.copy(padded);
  const binary = bytes.subarray(20 + length), output = Buffer.alloc(20 + padded.length + binary.length);
  bytes.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12); output.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(output, 20); binary.copy(output, 20 + padded.length);
  return new GLTFLoader().parseAsync(output.buffer, '');
}


const cast=await fixture(),car=await fixture('cruiser.glb'),vehicle=prepareCruiser(car.scene),actor=createTexturedPrologueActor({gltf:cast,police:false});const stage=new THREE.Group();stage.add(vehicle.model,actor.root);actor.root.position.set(1.42,0,.3);actor.root.rotation.y=-Math.PI/2;
const joints=new Map();actor.root.traverse(o=>{if(o.isBone)joints.set(o.name,o)});const eye=new THREE.Vector3(.5,1.13,.35),report=[];
for(const crouch of [0,.6,1]){
 actor.pose({mode:'bang',crouch,bang:1,bangTargets:[[.18,1.08,.395],[-.18,1.08,.395]]});stage.updateMatrixWorld(true);
 const aim=joints.get('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-.08,.07,0)),direction=aim.clone().sub(eye),distance=direction.length();
 const ray=new THREE.Raycaster(eye,direction.normalize(),0,distance);const hits=ray.intersectObject(vehicle.model,true).filter(h=>h.object.visible&&(h.object.material?.opacity===undefined||h.object.material.opacity>.2)).map(h=>({name:h.object.name,distance:h.distance,point:h.point.toArray()}));
 report.push({crouch,eye:eye.toArray(),aim:aim.toArray(),hits});
}
console.log(JSON.stringify(report,null,2));actor.dispose();
