import * as THREE from 'three';
import {applyEnvironmentSurface} from './environment-materials.js';

export function tilePropUV(geometry,x,y){
  const uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*x,uv.getY(i)*y);
  uv.needsUpdate=true;return geometry;
}

async function maps(names){
  const loader=new THREE.TextureLoader(),loaded=[];
  let stopped=false,timer;
  const loading=Promise.all(names.map(([name,color])=>loader.loadAsync(new URL(`../assets/field/${name}_1k.jpg`,import.meta.url).href).then(texture=>{
    if(stopped){texture.dispose();throw new Error('Optional prop texture arrived too late');}
    loaded.push(texture);
    texture.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=2;
    return texture;
  })));
  try{return await Promise.race([loading,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Optional prop textures timed out')),8000);
  })]);}
  catch(error){stopped=true;for(const texture of loaded)texture.dispose();throw error;}
  finally{clearTimeout(timer);}
}

// Update only existing materials: no geometry, lights, render passes or frame work.
export async function installPropDetails({cloth,sack,barrel}){
  const results=await Promise.allSettled([
    maps([['hessian_380_diff',true],['hessian_380_nor_gl',false]]).then(([map,normalMap])=>{
      for(const [target,color] of [[cloth,0x938d78],[sack,0xc0b596]]){
        target.map=map;target.normalMap=normalMap;target.normalScale.set(.42,.42);
        target.color.setHex(color);target.roughness=.97;target.needsUpdate=true;
      }
    }),
    maps([['blue_metal_plate_diff',true],['blue_metal_plate_rough',false]]).then(([map,roughnessMap])=>{
      barrel.map=map;barrel.roughnessMap=roughnessMap;barrel.color.setHex(0xa0b4b0);
      barrel.roughness=.95;barrel.metalness=.08;barrel.needsUpdate=true;
    }),
  ]);
  return {status:results.every(result=>result.status==='fulfilled')?'ready':'partial',
    cloth:results[0].status==='fulfilled',barrels:results[1].status==='fulfilled',
    errors:results.filter(result=>result.status==='rejected').map(result=>String(result.reason.message)),
    addedTriangles:0,addedDrawCalls:0,newTextures:4};
}

// Share the field's already-uploaded maps, rather than loading copies.
export function reuseFieldMaterials({wood,darkWood,bands},materials){
  for(const [target,color]of [[wood,0xa69c84],[darkWood,0x787665]]){
    target.copy(materials.wood);target.color.setHex(color);applyEnvironmentSurface(target,{kind:'wood'});target.needsUpdate=true;
  }
  bands.copy(materials.wire);bands.needsUpdate=true;
}
