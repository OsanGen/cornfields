import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** One optional original posed asset shared by the normal gun and escape grip. */
export function installHands({gun,knife,placeholders}){
  const stats={status:'loading',error:null,wear:0,meshes:0};
  const materials=[],baseColors=[],groups=[];
  let expired=false,timer,previousTime=0,runId=null;
  const wearUniform={value:0};
  const limitCloseLight=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      reflectedLight.directDiffuse=min(reflectedLight.directDiffuse,diffuseColor.rgb*.65);
      reflectedLight.directSpecular=min(reflectedLight.directSpecular,vec3(.025));`);
  };
  for(const group of [gun,knife])group.traverse(object=>{
    if(!object.isMesh||!object.material.isMeshStandardMaterial)return;
    object.material=object.material.clone();object.material.onBeforeCompile=limitCloseLight;materials.push(object.material);
  });
  const ready=Promise.race([
    new GLTFLoader().loadAsync(new URL('../assets/field/hands.glb',import.meta.url).href),
    new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Hand asset deadline'));},8000);}),
  ]).then(gltf=>{
    if(expired)return;
    const right=gltf.scene.getObjectByName('hand_right'),left=gltf.scene.getObjectByName('hand_left');
    if(!right?.isMesh||!left?.isMesh)throw new Error('Hand asset missing required meshes');
    const material=right.material.clone();material.roughness=.89;
    material.bumpMap=material.map;material.bumpScale=.0012;
    material.onBeforeCompile=shader=>{
      limitCloseLight(shader);
      shader.uniforms.handWear=wearUniform;
      shader.fragmentShader='uniform float handWear;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        float creases=pow(1.0-abs(sin(vMapUv.y*25.1327+sin(vMapUv.x*11.0)*.25)),7.0);
        float stains=smoothstep(.15,.8,sin(vMapUv.x*31.0+sin(vMapUv.y*22.0))*cos(vMapUv.y*45.0-vMapUv.x*12.0));
        diffuseColor.rgb*=mix(vec3(1.0),vec3(.34,.29,.20),handWear*(.55*creases+.32*stains));`);
    };
    materials.push(material);baseColors.push(material.color.clone());
    const add=(source,parent,position,rotation)=>{
      const object=source.clone();object.material=material;object.position.set(...position);object.rotation.set(...rotation);
      object.layers.set(1);parent.add(object);groups.push(object);stats.meshes++;return object;
    };
    add(right,gun,[.242,-.22,-.275],[0,0,Math.PI/2]);
    add(right,knife,[.025,-.035,.025],[0,Math.PI/2,.3]);
    add(left,knife,[-.055,-.035,.11],[.15,-Math.PI/2,-.55]);
    placeholders.forEach(p=>p.visible=false);
    stats.status='ready';
  }).catch(error=>{stats.status='fallback';stats.error=error.message;}).finally(()=>clearTimeout(timer));
  return {ready,stats,update(game){
    const target=Math.min(2,game.progress.checkpointIndex)/2;
    if(runId!==game.runId){runId=game.runId;wearUniform.value=0;previousTime=game.elapsed;}
    const dt=Math.max(0,game.elapsed-previousTime);previousTime=game.elapsed;
    wearUniform.value+=(target-wearUniform.value)*(1-Math.exp(-dt*1.5));stats.wear=wearUniform.value;
  },dispose(){expired=true;clearTimeout(timer);for(const m of materials)m.dispose();for(const g of groups)g.removeFromParent();}};
}
