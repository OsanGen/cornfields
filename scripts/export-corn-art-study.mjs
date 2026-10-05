import {mkdir,writeFile} from 'node:fs/promises';
import {createCornGeometry,createCornSurfaceAtlas,CORN_ART_VERSION} from '../src/corn-art.js';
const root=new URL('../output/environment-art/',import.meta.url);await mkdir(root,{recursive:true});
const meshes=[];
for(let variant=0;variant<3;variant++){
  const geometry=createCornGeometry(variant);meshes.push({name:geometry.name,positions:[...geometry.attributes.position.array],normals:[...geometry.attributes.normal.array],uv:[...geometry.attributes.uv.array],indices:[...geometry.index.array]});
}
await writeFile(new URL('corn-meshes.json',root),JSON.stringify({version:CORN_ART_VERSION,meshes}));
const atlas=createCornSurfaceAtlas();
for(const key of ['map','normalMap','roughnessMap'])await writeFile(new URL(key+'.rgba',root),atlas[key].image.data);
console.log('Exported actual runtime geometry and 1024px PBR atlas, without changing game assets.');
