// Four small CC0 maps, downloaded once. No runtime network or dependencies.
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=new URL('../assets/field/',import.meta.url),files=[];
for(const [asset,maps,author] of [
  ['hessian_380',['diff','nor_gl'],'Rico Cilliers (processing), colormass (photography)'],
  ['blue_metal_plate',['diff','rough'],'Rob Tuytel'],
])for(const map of maps){
  const file=`${asset}_${map}_1k.jpg`,url=`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${asset}/${file}`;
  let bytes=await readFile(new URL(file,out)).catch(()=>null);
  if(!bytes){
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>2_500_000)throw new Error('Texture exceeds size budget');chunks.push(chunk);}
    bytes=Buffer.concat(chunks);
    if(bytes[0]!==0xff||bytes[1]!==0xd8)throw new Error('Expected JPEG');
    const temporary=new URL(file+'.part',out);
    try{await writeFile(temporary,bytes);await rename(temporary,new URL(file,out));}finally{await rm(temporary,{force:true});}
  }
  files.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url,
    source:`https://polyhaven.com/a/${asset}`,author,license:'CC0-1.0'});
  console.log(`${file}: ${bytes.length} bytes`);
}
await writeFile(new URL('prop-sources.json',out),JSON.stringify({licenseUrl:'https://polyhaven.com/license',files},null,2)+'\n');
