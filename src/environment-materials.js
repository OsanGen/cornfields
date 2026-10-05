import * as THREE from 'three';

const applied=new WeakMap();
const vertexWorld=`
  vec4 environmentPosition=vec4(transformed,1.0);
  #ifdef USE_INSTANCING
    environmentPosition=instanceMatrix*environmentPosition;
  #endif
  vEnvironmentWorld=(modelMatrix*environmentPosition).xyz;
`;
const noise=`
  float environmentHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float environmentNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(environmentHash(i),environmentHash(i+vec2(1,0)),f.x),mix(environmentHash(i+vec2(0,1)),environmentHash(i+1.),f.x),f.y);}
`;

/** World-anchored weathering with no displacement. Wrappers preserve existing
 * liquid/other shader hooks and maintain a distinct program cache identity.
 */
export function applyEnvironmentSurface(material,{kind='mud',wet=true}={}){
  if(applied.has(material))return applied.get(material);
  if(!['mud','wood','paint','earth'].includes(kind))throw new Error('Unknown environment surface '+kind);
  const uniforms={wetness:{value:wet?1:0}},before=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material),baseKey=key?key():'';
  material.onBeforeCompile=shader=>{
    before?.(shader);shader.uniforms.environmentWetness=uniforms.wetness;
    shader.vertexShader='varying vec3 vEnvironmentWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n'+vertexWorld);
    shader.fragmentShader='varying vec3 vEnvironmentWorld; uniform float environmentWetness;\n'+noise+shader.fragmentShader;
    let color='',rough='',bump='';
    if(kind==='mud'){
      // Large damp hollows, medium clods and dry mineral tops. Normal/albedo maps
      // remain the existing licensed Brown Mud, sampled at their authored scale.
      color=`float environmentPatch=environmentNoise(vEnvironmentWorld.xz*.63)*.68+environmentNoise(vEnvironmentWorld.xz*2.4)*.32;
        float environmentHollow=smoothstep(.42,.72,environmentPatch)*environmentWetness;
        float environmentGrain=environmentNoise(vEnvironmentWorld.xz*21.);
        float environmentClod=smoothstep(.42,.68,environmentNoise(vEnvironmentWorld.xz*8.));
        diffuseColor.rgb*=mix(.94+environmentGrain*.10+environmentClod*.07,.48,environmentHollow);`;
      rough=`roughnessFactor=clamp(mix(max(.84,roughnessFactor),.27,environmentHollow),.25,1.);`;
      bump='environmentClod*.005+environmentGrain*.0015';
    }else if(kind==='wood'){
      color=`float environmentVertical=environmentNoise(vEnvironmentWorld.xz*6.+vec2(vEnvironmentWorld.y*.12));
        float environmentStain=(1.-smoothstep(.10,.95+environmentVertical*.55,vEnvironmentWorld.y))*environmentWetness;
        diffuseColor.rgb*=mix(.96, .56,environmentStain)*(.94+.10*environmentVertical);`;
      rough=`roughnessFactor=clamp(mix(max(.72,roughnessFactor),.51,environmentStain),.48,1.);`;
    }else if(kind==='paint'){
      color=`vec2 environmentPlane=vec2(vEnvironmentWorld.x+vEnvironmentWorld.z,vEnvironmentWorld.y);
        float environmentPlaster=environmentNoise(environmentPlane*6.)*.6+environmentNoise(environmentPlane*27.)*.4;
        float environmentDrip=environmentNoise(vec2(environmentPlane.x*13.,environmentPlane.y*.55));
        diffuseColor.rgb*=.75+environmentPlaster*.30;
        diffuseColor.rgb*=1.-.22*smoothstep(.62,.83,environmentDrip);`;
      rough=`roughnessFactor=.80+environmentPlaster*.17;`;
      bump='environmentPlaster*.009';
    }else{
      color=`float environmentStrata=environmentNoise(vec2(vEnvironmentWorld.x+vEnvironmentWorld.z,vEnvironmentWorld.y*.28));
        float environmentBand=.5+.5*sin(vEnvironmentWorld.y*2.2+environmentStrata*7.);
        float environmentStone=environmentNoise(vEnvironmentWorld.xz*4.+vEnvironmentWorld.y);
        diffuseColor.rgb*=mix(vec3(.56,.46,.39),vec3(1.1,.9,.70),environmentBand)*(.77+environmentStone*.30);
        diffuseColor.rgb*=mix(.30,1.,smoothstep(-115.,-2.,vEnvironmentWorld.y));`;
      rough=`roughnessFactor=.89+environmentStone*.09;`;
      bump='environmentStone*.04+environmentBand*.014';
    }
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+color).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+rough);
    if(bump)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 environmentDx=dFdx(-vViewPosition),environmentDy=dFdy(-vViewPosition);
      vec3 environmentR1=cross(environmentDy,normal),environmentR2=cross(normal,environmentDx);
      float environmentDet=dot(environmentDx,environmentR1),environmentHeight=${bump};
      vec3 environmentGradient=sign(environmentDet)*(dFdx(environmentHeight)*environmentR1+dFdy(environmentHeight)*environmentR2);
      normal=normalize(abs(environmentDet)*normal-environmentGradient);
    `);
  };
  material.customProgramCacheKey=()=>baseKey+'|environment-'+kind+'-v2';material.needsUpdate=true;
  material.userData.environmentSurface=kind;applied.set(material,uniforms);return uniforms;
}

/** Per-instance UV offsets are identical for albedo, normal and roughness. */
export function varyWoodUV(material){
  if(material.userData.woodUVVariation)return;
  const before=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material),baseKey=key?key():'';
  material.onBeforeCompile=shader=>{before?.(shader);shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    #ifdef USE_INSTANCING
      float boardSeed=dot(instanceMatrix[3].xz,vec2(.754877,.569841));
      vec2 boardOffset=fract(vec2(boardSeed,boardSeed*1.618))*2.;
      #ifdef USE_MAP
        vMapUv+=boardOffset;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv+=boardOffset;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv+=boardOffset;
      #endif
    #endif
  `);};
  material.customProgramCacheKey=()=>baseKey+'|wood-uv-v1';material.userData.woodUVVariation=true;material.needsUpdate=true;
}

/** A small original pore normal map for painted plaster and rough embedded soil. */
export function createPoreNormal(size=128){
  const bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const at=(y*size+x)*4,dx=Math.cos(x*.73+y*1.27)*.10+Math.cos(x*2.1-y*.31)*.045,dy=Math.sin(y*.87-x*1.3)*.10+Math.sin(y*2.7+x*.41)*.045,n=Math.hypot(dx,dy,1);
    bytes[at]=(dx/n*.5+.5)*255;bytes[at+1]=(dy/n*.5+.5)*255;bytes[at+2]=(1/n*.5+.5)*255;bytes[at+3]=255;
  }
  const t=new THREE.DataTexture(bytes,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.repeat.set(8,6);t.needsUpdate=true;return t;
}
