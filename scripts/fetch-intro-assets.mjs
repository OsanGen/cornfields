// Offline preparation only. Runtime assets are local and separately allowlisted.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../art/reference/intro-gameplay/',import.meta.url),files=[];
async function fetchFile(url,path){
  if(!['raw.githubusercontent.com','opengameart.org','api.polyhaven.com','dl.polyhaven.org'].includes(new URL(url).hostname))throw Error('Unexpected asset host');
  const destination=new URL(path,root);let bytes=await readFile(destination).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  if(!bytes){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${r.status} ${url}`);bytes=new Uint8Array(await r.arrayBuffer());}
  if(bytes.length>20000000)throw Error('Asset exceeds preparation budget');
  await mkdir(new URL('./',destination),{recursive:true});await writeFile(destination,bytes);
  files.push({path,url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return bytes;
}
await fetchFile('https://opengameart.org/sites/default/files/steve_npc1.zip','steve.zip');
await fetchFile('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb','car.glb');
await fetchFile('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/README.md','car-license.md');
const torch=JSON.parse(new TextDecoder().decode(await fetchFile('https://api.polyhaven.com/files/small_plastic_torch','torch-files.json'))).gltf['1k'].gltf;
await fetchFile(torch.url,'torch/torch.gltf');
for(const [path,file]of Object.entries(torch.include||{}))await fetchFile(file.url,'torch/'+path);
const asphalt=JSON.parse(new TextDecoder().decode(await fetchFile('https://api.polyhaven.com/files/asphalt_03','asphalt-files.json')));
for(const [kind,key]of [['diff','Diffuse'],['nor_gl','nor_gl'],['rough','Rough']])await fetchFile(asphalt[key]['1k'].jpg.url,`asphalt_${kind}.jpg`);
await writeFile(new URL('download-manifest.json',root),JSON.stringify({capturedAt:new Date().toISOString(),files},null,2));
console.log(JSON.stringify(files.map(({path,bytes})=>({path,bytes}))));
