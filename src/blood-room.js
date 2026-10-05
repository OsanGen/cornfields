import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyEnvironmentSurface} from './environment-materials.js';

export const PROJECTOR_LENS=Object.freeze([-.88,.98,.02]);
export const PROJECTOR_WALL_TARGET=Object.freeze([0,1.76,-4.765]);
/** Absolute story-time sample, without independent timers or accumulated drift. */
export function sampleProjectorMechanism(time=0){
 const t=Math.max(0,Number(time)||0);
 return {feed:t*1.65+.055*Math.sin(t*.8),takeup:t*1.93+.045*Math.sin(t*.73),film:t*.12,shutter:.992+.008*Math.sin(t*1.5)};
}

// Shared with the earlier vision. Original anonymous procedural projection is
// also the offline/media-failure fallback; it has no identity or stock license.
export function createBloodRoom({rain=false,touch=false}={}){
  const group=new THREE.Group();group.name='Blood room';
  const box=(parent,material,w,h,d,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;};
  const red=new THREE.MeshStandardMaterial({color:0x810c10,side:THREE.BackSide,emissive:0x300103,emissiveIntensity:.42});
  applyEnvironmentSurface(red,{kind:'paint'});
  box(group,red,6.4,3.3,9.6,0,1.65);
  const light=new THREE.PointLight(0xff2130,4.2,14,1.5);light.position.set(0,2.9,0);group.add(light);
  const projector=new THREE.Group();projector.position.set(-.88,.98,.30);projector.name='Single film projector';group.add(projector);
  const housing=new THREE.MeshStandardMaterial({color:0x242527,roughness:.57,metalness:.3});
  box(projector,housing,.47,.22,.37);box(projector,housing,.34,.07,.29,0,-.14);
  // Ground the same projector; legs fill the former floating gap without
  // adding a new prop or changing its authored centre/footprint.
  const feet=[];for(const x of [-.14,.14])for(const z of [-.10,.10])feet.push(new THREE.BoxGeometry(.035,.77,.035).translate(x,-.59,z));
  const standGeometry=mergeGeometries(feet);for(const g of feet)g.dispose();
  const stand=new THREE.Mesh(standGeometry,housing);stand.name='Projector support feet';projector.add(stand);
  let reelNodes=[];const filmClock={value:0};let mechanismTime=0;
  for(const z of [-.11,.11]){
    const reel=new THREE.Mesh(new THREE.TorusGeometry(.145,.025,6,24),housing);reel.name='Visible projector film reel';reel.rotation.y=Math.PI/2;reel.position.set(-.24,.25,z);projector.add(reel);reelNodes.push({node:reel,rest:reel.quaternion.clone()});
    for(let i=0;i<5;i++){const spoke=box(reel,housing,.018,.24,.016);spoke.rotation.z=i*Math.PI/5;}
  }
  box(projector,housing,.58,.045,.48,0,-.17,0);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(.06,.065,.11,12),housing);lens.position.set(0,0,-.22);lens.rotation.x=Math.PI/2;projector.add(lens);
  const glass=new THREE.Mesh(new THREE.CircleGeometry(.049,12),new THREE.MeshBasicMaterial({color:0xffdac7}));glass.position.set(0,0,-.28);glass.rotation.y=Math.PI;projector.add(glass);
  const projectorLight=new THREE.SpotLight(0xffb9a8,6,10,.27,.26,1);projectorLight.position.fromArray(PROJECTOR_LENS);projectorLight.target.position.fromArray(PROJECTOR_WALL_TARGET);group.add(projectorLight,projectorLight.target);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(2.45,2.70),new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{clock:{value:0},motion:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float clock,motion;
      float ellipse(vec2 p,vec2 r){return length(p/r);}
      void main(){
        vec2 p=(vUv-.5)*2.;p.x+=sin(p.y*7.+clock*1.7)*.016*motion;
        float head=1.-smoothstep(.91,1.,ellipse(p-vec2(0.,.03),vec2(.72,.96)));
        float left=1.-smoothstep(.7,1.,ellipse(p-vec2(-.27,.25),vec2(.18,.10)));
        float right=1.-smoothstep(.7,1.,ellipse(p-vec2(.27,.28),vec2(.18,.10)));
        float mouth=1.-smoothstep(.84,1.,ellipse(p-vec2(.01,-.36),vec2(.23,.30+.045*sin(clock*3.)*motion)));
        float brow=exp(-pow((abs(p.x)-.26)/.19,4.))*exp(-pow((p.y-.43-abs(p.x)*.16)/.027,2.));
        float tear=exp(-pow((abs(p.x)-.26)/.023,2.))*smoothstep(-.25,.05,p.y)*(1.-smoothstep(.13,.23,p.y));
        float edge=pow(max(0.,1.-ellipse(p,vec2(.75,1.))),.3);
        float nose=exp(-pow(p.x/.075,2.))*exp(-pow((p.y+.015)/.32,2.));
        float cheeks=exp(-pow((abs(p.x)-.4)/.19,2.))*exp(-pow((p.y+.12)/.22,2.));
        float nostrils=exp(-pow((abs(p.x)-.09)/.044,2.))*exp(-pow((p.y+.16)/.038,2.));
        float lips=exp(-pow((ellipse(p-vec2(.01,-.36),vec2(.25,.32))-1.)/.075,2.));
        float grain=fract(sin(dot(floor(vUv*vec2(720.,810.)),vec2(12.9898,78.233)))*43758.5453)-.5;
        float shade=clamp(.38+edge*.53+nose*.19+cheeks*.085-nostrils*.3-lips*.13+grain*.035-max(left,right)*.81-mouth*.95-brow*.48-tear*.44,0.,1.);
        vec3 color=mix(vec3(.20,.013,.028),vec3(1.,.66,.57),shade)*(.98+.02*sin(vUv.y*810.));
        gl_FragColor=vec4(color,head*.95);
      }` }));face.position.set(0,1.76,-4.765);face.name='Original anonymous distressed face projection';group.add(face);
  const hazeMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{clock:{value:0},amount:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float clock,amount;void main(){float sides=pow(max(0.,sin(vUv.x*3.14159265)),2.);float reach=pow(1.-vUv.y,1.8);float dust=.83+.17*sin(vUv.y*49.-clock*.24);gl_FragColor=vec4(.76,.32,.22,sides*reach*dust*.035*amount);}`});
  const opticalPath=new THREE.Vector3().fromArray(PROJECTOR_WALL_TARGET).sub(new THREE.Vector3().fromArray(PROJECTOR_LENS)),beamLength=opticalPath.length();
  const hazeGeometry=new THREE.ConeGeometry(.82,beamLength,12,1,true).translate(0,-beamLength/2,0),haze=new THREE.Mesh(hazeGeometry,hazeMaterial);
  haze.position.fromArray(PROJECTOR_LENS);haze.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),opticalPath.normalize());haze.name='Bounded projector haze';group.add(haze);
  let drops=null;
  const count=touch?48:96,positions=new Float32Array(count*6);
  if(rain){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    drops=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xee3340,transparent:true,opacity:.65}));drops.frustumCulled=false;group.add(drops);
  }
  const stats={source:'procedural fallback',active:false,time:0,film:0,reels:2};
  function setProjector(gltf){
    for(const child of projector.children)child.visible=false;
    const model=gltf.scene;model.name='Original compact operating projector';projector.add(model);
    reelNodes=[];
    model.traverse(o=>{if(/^(Feed|Takeup)[_ ]reel$/.test(o.name))reelNodes.push({node:o,rest:o.quaternion.clone()});});
    // The authored static film faces use only the atlas's upper-right tile.
    // Scrolling stays within that tile, so metal, vents and lens never crawl.
    const material=model.getObjectByName('Projector_housing_and_threaded_film')?.material;
    if(material){material.onBeforeCompile=shader=>{
      shader.uniforms.projectorFilmClock=filmClock;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float projectorFilmClock;')
        .replace('#include <map_fragment>',`#ifdef USE_MAP
          vec2 filmUv=vMapUv;
          if(filmUv.x>.75 && filmUv.y<.25)filmUv.y=mod(filmUv.y+projectorFilmClock*.12,.25);
          vec4 sampledDiffuseColor=texture2D(map,filmUv);diffuseColor*=sampledDiffuseColor;
        #endif`);
    };material.customProgramCacheKey=()=> 'cornfields-original-projector-film-v2';material.needsUpdate=true;}
    stats.source='projector.glb';stats.reels=reelNodes.length;
    poseMechanism(mechanismTime);if(!stats.active)projectorLight.intensity=0;
  }
  function poseMechanism(time){
    const state=sampleProjectorMechanism(time);filmClock.value=time;
    for(const [i,{node,rest}] of reelNodes.entries())node.quaternion.copy(rest).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),i?state.takeup:state.feed));
    stats.time=time;stats.film=state.film;projectorLight.intensity=6*state.shutter;
  }
  return {group,face,projectorLight,setProjector,stats,update(time,reduced=false,active=true){
    stats.active=!!active;face.visible=haze.visible=!!active;if(!active){projectorLight.intensity=0;return;}
    mechanismTime=Math.max(0,Number(time)||0);poseMechanism(mechanismTime);if(reduced)projectorLight.intensity=6;
    hazeMaterial.uniforms.clock.value=reduced?0:time;hazeMaterial.uniforms.amount.value=reduced?.35:1;
    face.material.uniforms.clock.value=time;face.material.uniforms.motion.value=reduced?.22:1;
    if(!drops)return;
    for(let i=0;i<count;i++){
      const active=!reduced||i<24,x=Math.sin(i*12.37)*2.95,z=Math.sin(i*7.91)*4.4,y=3.25-((time*(1.9+(i%5)*.17)+i*.173)%3.25),n=i*6;
      positions.set([x,y,z,x,active?Math.max(0,y-.15):y,z],n);
    }
    drops.geometry.attributes.position.needsUpdate=true;
  }};
}
