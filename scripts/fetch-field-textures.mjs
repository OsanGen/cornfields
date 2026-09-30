// Small CC0 source maps. No API key, add-on, or runtime network dependency.
import {mkdir,writeFile,rename,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=new URL('../assets/field/',import.meta.url);
await mkdir(out,{recursive:true});
const files=[];
for(const asset of ['brown_mud','wood_planks_dirt','wood_planks','rusty_metal_02'])for(const map of ['diff','nor_gl','rough']){
  const name=`${asset}_${map}_1k.jpg`;
  const url=`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${asset}/${name}`;
  let bytes=await readFile(new URL(name,out)).catch(()=>null);
  if(!bytes){
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>2_500_000)throw new Error(`${name}: exceeds download limit`);chunks.push(chunk);}
  bytes=Buffer.concat(chunks);
  if(bytes[0]!==0xff||bytes[1]!==0xd8)throw new Error(`${name}: expected JPEG`);
  const temporary=new URL(`${name}.part`,out);
  try{await writeFile(temporary,bytes);await rename(temporary,new URL(name,out));}finally{await rm(temporary,{force:true});}
  }
  files.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url,source:`https://polyhaven.com/a/${asset}`,author:asset==='wood_planks'?'Amal Kumar':'Rob Tuytel',license:'CC0-1.0'});
  console.log(`${name}: ${bytes.length} bytes`);
}
await writeFile(new URL('sources.json',out),JSON.stringify({licenseUrl:'https://polyhaven.com/license',files},null,2)+'\n');
