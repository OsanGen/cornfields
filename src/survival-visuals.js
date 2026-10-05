import * as THREE from 'three';
import {createBloodRoom} from './blood-room.js';
import {applyEnvironmentSurface} from './environment-materials.js';
import {GAME_CONFIG} from './game-config.js';

export function createSurvivalVisuals(view,{touch=false}={}){
  const {renderer}=view;let scene=null,camera=null,room=null,pit=null,veil=null,embers=null,dead=false;
  const borrowed=new Set(),stats={active:false,phase:null,projection:'original procedural face',rain:0,pitPlants:0};
  function release(){
    if(!scene)return;
    const resources=new Set();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!borrowed.has(o.geometry))resources.add(o.geometry);for(const m of [].concat(o.material||[]))if(!borrowed.has(m))resources.add(m);});
    for(const r of resources)r.dispose();borrowed.clear();scene=camera=room=pit=veil=embers=null;stats.active=false;
  }
  function ensureRoom(){
    if(room)return;release();scene=new THREE.Scene();scene.background=new THREE.Color(0x220003);scene.fog=new THREE.FogExp2(0x380305,.025);
    room=createBloodRoom({rain:true,touch});scene.add(room.group);camera=new THREE.PerspectiveCamera(70,1,.065,150);scene.add(camera);
    const flashlight=new THREE.SpotLight(0xffd9c1,3,12,.5,.65,1.2);flashlight.position.set(.1,-.1,-.1);flashlight.target.position.set(0,0,-9);camera.add(flashlight,flashlight.target);room.flashlight=flashlight;
    addVeil();
  }
  function addVeil(){
    veil=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0x510007,transparent:true,opacity:0,depthTest:false,depthWrite:false}));veil.position.z=-.08;veil.scale.set(.15,.15,1);veil.renderOrder=1000;camera.add(veil);
  }
  function ensurePit(game){
    if(pit)return;release();scene=new THREE.Scene();scene.background=new THREE.Color(0x0e0306);scene.fog=new THREE.FogExp2(0x2b0508,.035);
    camera=new THREE.PerspectiveCamera(70,1,.065,200);scene.add(camera);pit=new THREE.Group();pit.position.set(game.survivalEnding.center.x,0,game.survivalEnding.center.z);scene.add(pit);
    const earth=new THREE.MeshStandardMaterial({color:0x695040,roughness:1,side:THREE.DoubleSide});applyEnvironmentSurface(earth,{kind:'earth'});
    const ground=new THREE.Mesh(new THREE.RingGeometry(10,24,64),earth);ground.rotation.x=-Math.PI/2;pit.add(ground);
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(10,10,160,64,1,true),new THREE.MeshStandardMaterial({side:THREE.BackSide,color:0x594034,roughness:1}));shaft.position.y=-80;applyEnvironmentSurface(shaft.material,{kind:'earth'});shaft.name='Layered earthen shaft';pit.add(shaft);
    const depth=new THREE.Mesh(new THREE.CircleGeometry(9.99,64),new THREE.MeshBasicMaterial({color:0x260207}));depth.position.y=-130;depth.rotation.x=-Math.PI/2;pit.add(depth);
    for(let i=0;i<8;i++){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(9.94,.055,3,64),new THREE.MeshBasicMaterial({color:i%2?0x7b130d:0xc83a11,transparent:true,opacity:.25}));ring.rotation.x=Math.PI/2;ring.position.y=-5-i*i*1.6;pit.add(ring);
    }
    const red=new THREE.PointLight(0xff3215,65,60,1.2);red.position.y=-5;pit.add(red);scene.add(new THREE.HemisphereLight(0xa66361,0x28150d,3));
    const parts=view.introCorn?.()||[],fallback=parts.length?null:{geometry:new THREE.ConeGeometry(.33,2.9,5).translate(0,1.45,0),material:new THREE.MeshStandardMaterial({color:0x4a4930})};
    const dummy=new THREE.Object3D(),count=touch?180:300;
    for(const part of parts.length?parts:[fallback]){
      if(!fallback){borrowed.add(part.geometry);borrowed.add(part.material);}
      const plants=new THREE.InstancedMesh(part.geometry,part.material,count);
      for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,radius=22.2+(i%3)*.55;dummy.position.set(Math.sin(angle)*radius,0,Math.cos(angle)*radius);dummy.rotation.set(0,i*2.399,0);dummy.scale.setScalar(.95+(i%7)*.045);dummy.updateMatrix();plants.setMatrixAt(i,dummy.matrix);}plants.computeBoundingSphere();pit.add(plants);
    }
    stats.pitPlants=count;const countEmbers=touch?32:64,data=new Float32Array(countEmbers*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data,3));
    embers=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xff732c,size:.10,transparent:true,opacity:.65,depthWrite:false}));embers.frustumCulled=false;pit.add(embers);addVeil();
  }
  function render(game,reduced=false){
    if(dead)return;const s=game.survivalEnding,phase=s.phase,inRoom=['entry','room','exit'].includes(phase);
    if(phase==='transform'&&s.time<3){view.render(game,game.elapsed,reduced);return;}
    if(inRoom)ensureRoom();else ensurePit(game);
    const p=inRoom?s.roomPlayer:game.player;
    camera.aspect=Math.max(1,renderer.domElement.clientWidth)/Math.max(1,renderer.domElement.clientHeight);camera.updateProjectionMatrix();
    camera.position.set(p.x,GAME_CONFIG.player.eyeHeight+(reduced||!game.player.moving?0:Math.sin(game.steps*7)*.021),p.z);camera.rotation.set(p.pitch,p.yaw,0,'YXZ');
    if(inRoom){room.update(s.time,reduced);room.flashlight.intensity=game.player.flashlightOn?3:0;stats.rain=reduced?24:touch?48:96;}
    else {
      const data=embers.geometry.attributes.position.array;
      for(let i=0;i<data.length/3;i++){const angle=i*2.399;data[i*3]=Math.sin(angle)*(2+i%8);data[i*3+1]=-35+((s.time*(reduced?.35:1.1)+i*1.73)%35);data[i*3+2]=Math.cos(angle)*(2+i%8);}embers.geometry.attributes.position.needsUpdate=true;embers.visible=true;
      if(phase==='fall'){
        const f=Math.min(1,s.time/.6);camera.position.x=game.player.x+(s.center.x-game.player.x)*f;camera.position.z=game.player.z+(s.center.z-game.player.z)*f;
        camera.position.y=GAME_CONFIG.player.eyeHeight-3*s.time-5*s.time*s.time;
      }
    }
    veil.material.color.set(inRoom?0x510007:phase==='transform'?0x310206:0x000000);veil.material.opacity=phase==='entry'?Math.max(0,1-s.time/2):phase==='exit'?Math.min(1,s.time/1.5):phase==='transform'?Math.max(0,1-(s.time-3)):phase==='fall'?Math.min(1,Math.max(0,(s.time-2)/1.2)):0;
    renderer.render(scene,camera);
    if(phase!=='fall')view.renderPrologueEquipment?.(camera,{chapter:'redroom',time:game.elapsed,player:game.player,reduced});
    stats.active=true;stats.phase=phase;
  }
  return {render,release,dispose(){release();dead=true;},diagnostics:()=>({...stats})};
}
