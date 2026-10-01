import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationClip} from 'three';
import {stripRootTravel} from '../src/asset-safety.js';

// Inputs are texture-free exports of the original walk/fury/dead FBX sources.
// Blender command and provenance are documented in docs/UPGRADE.md.
const input=process.argv[2];
if(!input)throw new Error('Usage: node scripts/build-zombie-clips.mjs <export-directory>');
globalThis.ProgressEvent ||= class {constructor(type,data){Object.assign(this,{type},data);}};
async function load(file){
  const bytes=await readFile(file),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
  delete json.images;delete json.textures;delete json.materials;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');
  return new GLTFLoader().parseAsync(JSON.stringify(json),'');
}
const base=await load('assets/field/zombie.glb');
const bones=new Set();base.scene.traverse(node=>{if(node.isBone)bones.add(node.name);});
const clips=[],sources=[];
for(const [file,name] of [['fury','Pixelhouse Fury'],['dead','Pixelhouse Collapse']]){
  const source=await load(`${input}/${file}.glb`),clip=source.animations[0];
  const sourceBones=new Set();source.scene.traverse(node=>{if(node.isBone)sourceBones.add(node.name);});
  if([...bones].some(name=>!sourceBones.has(name)))throw new Error('Incompatible skeleton');
  for(const name of bones){
    if(base.scene.getObjectByName(name).parent.name!==source.scene.getObjectByName(name).parent.name)throw new Error('Incompatible bone hierarchy: '+name);
  }
  clip.name=name;
  clip.tracks=clip.tracks.filter(track=>{
    const target=track.name.slice(0,track.name.lastIndexOf('.'));
    return (bones.has(target)||target==='Bip01')&&!track.name.endsWith('.scale');
  });
  stripRootTravel(clip,['Bip01']);clip.optimize();
  if(!clip.validate())throw new Error('Invalid clip '+name);
  const json=AnimationClip.toJSON(clip);delete json.uuid;
  for(const track of json.tracks)for(const key of ['times','values'])track[key]=track[key].map(n=>Number(n.toFixed(6)));
  clips.push(json);
  sources.push({file:`art/reference/zombie-source/${file}.FBX`,sha256:createHash('sha256').update(await readFile(`art/reference/zombie-source/${file}.FBX`)).digest('hex'),clip:name,duration:clip.duration});
}
const result={schema:1,author:'Pixelhouse',license:'CC-BY-3.0',source:'https://opengameart.org/content/zombie',exporter:'Blender 5.2.1 glTF export, 30 FPS, sampled, in-place horizontal root',sources,clips};
await writeFile('assets/field/zombie-clips.json',JSON.stringify(result));
console.log(JSON.stringify({clips:sources,bytes:JSON.stringify(result).length}));
