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
export function applyEnvironmentSurface(material,{kind='mud',wet=true,terrainProfile=false}={}){
  if(applied.has(material))return applied.get(material);
  if(!['mud','wood','paint','earth'].includes(kind))throw new Error('Unknown environment surface '+kind);
  const uniforms={wetness:{value:wet?1:0},terrainFromWorld:{value:new THREE.Matrix4()}},before=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material),baseKey=key?key():'';
  material.onBeforeCompile=shader=>{
    before?.(shader);shader.uniforms.environmentWetness=uniforms.wetness;shader.uniforms.environmentTerrainFromWorld=uniforms.terrainFromWorld;
    shader.vertexShader='varying vec3 vEnvironmentWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n'+vertexWorld);
    shader.fragmentShader='varying vec3 vEnvironmentWorld; uniform float environmentWetness; uniform mat4 environmentTerrainFromWorld;\n'+noise+shader.fragmentShader;
    let color='',rough='',bump='';
    if(kind==='mud'){
      // Large damp hollows, medium clods and dry mineral tops. Normal/albedo maps
      // remain the existing licensed Brown Mud, sampled at their authored scale.
      color=`float environmentPatch=environmentNoise(vEnvironmentWorld.xz*.63)*.68+environmentNoise(vEnvironmentWorld.xz*2.4)*.32;
        float environmentHollow=smoothstep(.42,.72,environmentPatch)*environmentWetness;
        float environmentGrain=environmentNoise(vEnvironmentWorld.xz*21.);
        float environmentClod=smoothstep(.42,.68,environmentNoise(vEnvironmentWorld.xz*8.));
        diffuseColor.rgb*=mix(.94+environmentGrain*.10+environmentClod*.07,.48,environmentHollow);`;
      if(terrainProfile){
        const hollows=ROADSIDE_HOLLOWS.map(h=>`{vec2 hp=(environmentTerrainXZ-vec2(${h.x.toFixed(5)},${h.z.toFixed(5)}))/vec2(${h.rx.toFixed(5)},${h.rz.toFixed(5)});float ha=atan(hp.y,hp.x);float hr=length(hp)/(1.+.10*sin(ha*3.+${h.phase.toFixed(5)})+.045*sin(ha*7.-${h.phase.toFixed(5)}));terrainWetness=max(terrainWetness,1.-smoothstep(.38,1.13,hr));}`).join('\n');
        color=`vec2 environmentTerrainXZ=(environmentTerrainFromWorld*vec4(vEnvironmentWorld,1.)).xz;float terrainWetness=0.;${hollows}\n`+color.replace('smoothstep(.42,.72,environmentPatch)*environmentWetness','terrainWetness*environmentWetness');
      }
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
  material.customProgramCacheKey=()=>baseKey+'|environment-'+kind+'-v3'+(terrainProfile?'-shared-hollows':'');material.needsUpdate=true;
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

// One continuous local height/wetness description for corn bases, mud and water.
// It is presentation only: route geometry, player collision and gameplay stay fixed.
export const ROADSIDE_HOLLOWS=Object.freeze([
 {x:2.35,z:6.35,rx:1.12,rz:.59,depth:.058,level:-.041,phase:.4},
 {x:4.55,z:7.55,rx:.80,rz:.43,depth:.052,level:-.043,phase:1.7},
 {x:-12.6,z:-5.9,rx:1.20,rz:.68,depth:.064,level:-.046,phase:2.4},
 {x:-20.1,z:-3.1,rx:.83,rz:.49,depth:.052,level:-.046,phase:.9},
 {x:-33.4,z:-5.1,rx:1.45,rz:.56,depth:.068,level:-.044,phase:1.2},
].map(Object.freeze));
const groundSmooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
export function hollowRadius(x,z,h){
 const a=Math.atan2((z-h.z)/h.rz,(x-h.x)/h.rx),edge=1+.10*Math.sin(a*3+h.phase)+.045*Math.sin(a*7-h.phase);
 return Math.hypot((x-h.x)/h.rx,(z-h.z)/h.rz)/edge;
}
export function wetGroundHeight(x,z){
 const local=groundSmooth(Math.min(x+64,18-x,z+18,22-z)/2);
 let y=-.027+local*(.010*Math.sin(x*.73+z*.37)+.007*Math.sin(z*1.31-x*.23));
 for(const h of ROADSIDE_HOLLOWS)y-=h.depth*(1-groundSmooth(hollowRadius(x,z,h)));
 return y;
}
export function wetGroundContact(x,z){
 let wetness=0;for(const h of ROADSIDE_HOLLOWS)wetness=Math.max(wetness,1-groundSmooth((hollowRadius(x,z,h)-.38)/.75));
 return {height:wetGroundHeight(x,z),wetness};
}
export function wetGroundGeometry(){
 const positions=[],uv=[],indices=[];
 function grid(x0,x1,z0,z1,nx,nz){const offset=positions.length/3;
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;positions.push(x,wetGroundHeight(x,z),z);uv.push((x+65)/130,(420-z)/600);}
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=offset+j*(nx+1)+i,b=a+nx+1;indices.push(a,b,a+1,a+1,b,b+1);}
 }
 // Dense only along the local review route; distant landscape stays inexpensive.
 grid(-64,18,-18,22,164,80);grid(-65,-64,-180,420,1,60);grid(18,65,-180,420,5,60);grid(-64,18,-180,-18,9,17);grid(-64,18,22,420,9,40);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();g.userData.visualOnly=true;return g;
}
export function createGroundedPuddles(material){
 const group=new THREE.Group();group.name='Shallow water in shared ground depressions';const waters=[];
 for(const h of ROADSIDE_HOLLOWS){
  const positions=[h.x,h.level+.001,h.z],uv=[.5,.5],indices=[],segments=40;
  for(let i=0;i<=segments;i++){
   const a=i/segments*Math.PI*2;let lo=0,hi=1.25;
   for(let n=0;n<20;n++){const r=(lo+hi)/2,x=h.x+Math.cos(a)*h.rx*r,z=h.z+Math.sin(a)*h.rz*r;if(wetGroundHeight(x,z)<h.level)lo=r;else hi=r;}
   const r=(lo+hi)/2,x=h.x+Math.cos(a)*h.rx*r,z=h.z+Math.sin(a)*h.rz*r;positions.push(x,h.level+.001,z);uv.push(.5+Math.cos(a)*r*.5,.5+Math.sin(a)*r*.5);if(i)indices.push(0,i+1,i);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
  const water=new THREE.Mesh(g,material);water.name='Terrain-contact shallow puddle';water.userData.hollow=h;group.add(water);waters.push(water);
 }
 group.userData.waterMeshes=waters;return group;
}
