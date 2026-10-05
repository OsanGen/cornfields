import {cabinRadioEnvelope} from './prologue-clearance.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createTexturedPrologueActor} from './prologue-model-actor.js';
import {ease as prologueEase} from './prologue-performance.js';
import {applyHandGrip,HAND_GRIP_CONTACT} from './hand-grip.js';
import {createPrologueRadio,PROLOGUE_RADIO} from './prologue-radio.js';
import * as THREE from 'three';
import {CELL,WIDTH,HEIGHT,centerOf,lineOfSight} from './maze.js';
import {installFieldVisuals} from './field-visuals.js';
import {installNightSky} from './night-sky.js';
import {installZombie} from './zombie.js';
import {installPropDetails,reuseFieldMaterials,tilePropUV} from './prop-details.js';
import {actorPosition} from './hiding.js';
import {GAME_CONFIG} from './game-config.js';
import {interactionLocked} from './grapple.js';
import {createWeatherView} from './weather-view.js';
import {installHands,createStoryForearmFit} from './hands.js';
import {strugglePose,nightmareState} from './horror-presentation.js';
import {createCornView} from './corn-view.js';
import {createSurvivalView} from './corn-survival-view.js';
import {createCorridorFieldView} from './corridor-view.js';
import {createRenderQuality} from './render-quality.js';
import {viewmodelPose,flashlightPose,createActorHeading,renderFirstPersonLayers,samplePrologueBodyReach} from './viewmodel-pose.js';
import {createMuzzleBurst} from './shot-effects.js';
import {createGroundDetails} from './ground-details.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {attachPrologueLiquid,prologueVisionState} from './prologue-visuals.js';
import {attachLiquidMaterial} from './liquid-material.js';
import {checkpointVisionState} from './checkpoint-vision.js';
import {createScarecrowView} from './scarecrow-view.js';

function seeded(seed=719){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const material=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
const up=new THREE.Vector3(0,1,0);

/** Clothed, headless first-person rig derived from the cleared existing cast.
 * Its three mesh primitives share the cabin depth buffer; no inside-head mask.
 */
export function createPrologueBody({loader=new GLTFLoader(),deadlineMs=8000,onMaterial=()=>{}}={}){
  const root=new THREE.Group();root.name='Mike body anchor';
  const stats={status:'loading',error:null,triangles:0,draws:0,mode:null};
  let actor=null,asset=null,disposed=false,expired=false,timer,cancel;
  const disposeAsset=gltf=>{const owned=new Set();gltf?.scene?.traverse(o=>{if(o.geometry)owned.add(o.geometry);if(o.isSkinnedMesh)owned.add(o.skeleton);for(const m of [o.material].flat().filter(Boolean)){owned.add(m);for(const t of Object.values(m))if(t?.isTexture)owned.add(t);}});for(const r of owned)r.dispose();};
  const loading=Promise.resolve().then(()=>loader.loadAsync(new URL('../assets/intro/mike-body.glb',import.meta.url).href)).then(gltf=>{
    if(disposed||expired){disposeAsset(gltf);return null;}
    let triangles=0,draws=0;gltf.scene.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws+=o.geometry.groups.length||1;});
    if(triangles>6000||draws>3||draws<1||!gltf.animations.some(a=>a.name==='Seated')){disposeAsset(gltf);throw new Error('Mike body asset does not meet the approved rig/budget contract');}
    asset=gltf;actor=createTexturedPrologueActor({name:'Mike',police:true,gltf,sourceHeight:3.374371126294136,uniformDetails:false,onMaterial});
    actor.root.name='Mike fitted undershirt, skin and preserved lower body';root.add(actor.root);Object.assign(stats,{status:'ready',triangles,draws,error:null});return actor;
  });
  const ready=Promise.race([loading,new Promise((_,reject)=>{cancel=reject;timer=setTimeout(()=>{expired=true;reject(new Error('Mike body asset deadline'));},deadlineMs);})]).catch(e=>{expired=true;if(!disposed)Object.assign(stats,{status:'failed',error:e.message});return null;}).finally(()=>clearTimeout(timer));
  const arms={},lengths={};
  function updateWorld(){root.updateMatrixWorld(true);root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});}
  return {root,stats,ready,connectArm(side,wrist){
    if(!actor)return null;updateWorld();
    const upper=root.getObjectByName('armup'+side),lower=root.getObjectByName('armlo'+side),hand=root.getObjectByName('hand'+side);
    if(!upper||!lower||!hand)return null;
    const a=upper.getWorldPosition(new THREE.Vector3()),b=lower.getWorldPosition(new THREE.Vector3()),c=hand.getWorldPosition(new THREE.Vector3());
    const [lengthA,lengthB]=lengths[side]||[a.distanceTo(b),b.distanceTo(c)];
    const direction=wrist.clone().sub(a),requested=direction.length(),reach=THREE.MathUtils.clamp(requested,Math.abs(lengthA-lengthB)+.0001,lengthA+lengthB-.0001);direction.normalize();
    const destination=a.clone().addScaledVector(direction,reach),pole=root.localToWorld(new THREE.Vector3(side==='R'?-.43:.43,1.05,.26)).sub(a);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(lengthA*lengthA-lengthB*lengthB+reach*reach)/(2*reach),elbow=a.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,lengthA*lengthA-along*along)));
    const rotate=(bone,from,to)=>{const q=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);};
    const handFromLower=lower.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hand.getWorldQuaternion(new THREE.Quaternion()));
    const lowerAxis=c.clone().sub(b).applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion()).invert());
    rotate(upper,b.clone().sub(a),elbow.clone().sub(a));
    // The source has non-uniform animated joint scales. Correct the child pivot
    // after the rotation, preserving the measured physical bone length exactly.
    lower.position.copy(lower.parent.worldToLocal(elbow.clone()));lower.updateWorldMatrix(false,true);
    rotate(lower,lowerAxis.applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion())),destination.clone().sub(elbow));
    hand.position.copy(hand.parent.worldToLocal(destination));
    const rotation=lower.getWorldQuaternion(new THREE.Quaternion()).multiply(handFromLower);
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));updateWorld();
    const contact=hand.getWorldPosition(new THREE.Vector3()),error=contact.distanceTo(wrist);
    arms[side]={error,wrist:contact.toArray(),target:wrist.toArray()};stats.armContacts={...arms};
    return {elbow:lower.getWorldPosition(new THREE.Vector3()),wrist:contact,error};
  },pose(frame={}){
    if(!actor)return;const exiting=frame.chapter==='exit'&&frame.exitPose&&!frame.exitPose.finished;
    const seated=frame.motion?.blocking?.inCar??['car','dispatch','emergence','bang','cabin'].includes(frame.chapter);
    const mode=exiting?'exit':seated?'seated':frame.player?.moving?'walk':'standing';
    const motion=frame.motion?.actors?.mike,phase=motion?.phase??(frame.player?.distance||0)/.35*Math.PI;
    actor.pose({mode,time:frame.elapsed??frame.time??0,phase,gait:mode==='walk'?1:0,reduced:frame.reduced,exitPose:frame.exitPose,support:motion?.support});
    updateWorld();for(const side of ['R','L']){const at=n=>root.getObjectByName(n+side).getWorldPosition(new THREE.Vector3());lengths[side]=[at('armup').distanceTo(at('armlo')),at('armlo').distanceTo(at('hand'))];}
    const lean=samplePrologueBodyReach(frame.chapter==='car'?frame.radioHandReach:0);
    if(lean.weight){
      updateWorld();const waist=root.getObjectByName('waist'),pivot=waist.getWorldPosition(new THREE.Vector3()),before=waist.getWorldQuaternion(new THREE.Quaternion());
      const hands=['R','L'].map(side=>{const hand=root.getObjectByName('hand'+side);return {hand,position:hand.getWorldPosition(new THREE.Vector3()),rotation:hand.getWorldQuaternion(new THREE.Quaternion())};});
      waist.rotateX(lean.waistTilt);waist.updateWorldMatrix(false,true);
      const delta=waist.getWorldQuaternion(new THREE.Quaternion()).multiply(before.invert());
      for(const {hand,position,rotation}of hands){hand.position.copy(hand.parent.worldToLocal(position.sub(pivot).applyQuaternion(delta).add(pivot)));hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(delta.clone().multiply(rotation)));}
    }
    updateWorld();stats.mode=mode;stats.pose=actor.diagnostics();
  },dispose(){if(disposed)return;disposed=expired=true;clearTimeout(timer);cancel(new Error('Mike body disposed'));actor?.dispose();disposeAsset(asset);actor=null;asset=null;root.clear();root.removeFromParent();stats.status='disposed';}};
}

/** Story-only clones retain the player's skin/gun assets without touching gameplay. */
export function createPrologueEquipment(renderer,{gun,torch,skinMaterial,getAssetVersion=()=>gun.children.length+':'+(torch?.children.length||0),radioLoader,radioDeadlineMs,bodyLoader,bodyDeadlineMs}={}){
  const overlay=new THREE.Scene(),camera=new THREE.PerspectiveCamera();overlay.add(camera);
  const fill=new THREE.HemisphereLight(0xb4bdad,0x514234,.68),key=new THREE.DirectionalLight(0xe7e9d8,1.15);
  key.position.set(-.5,.6,.25);overlay.add(fill,key);key.target.position.set(0,-.2,-.6);overlay.add(key.target);
  const materials=new Set(),geometries=new Set(),skeletons=new Set(),treatments=[],radioViews=[],storyArms=new Map();
  let pistol=null,radio=null,doorHand=null,handheld=null,body=null,version=null,disposed=false;const restingArms=[];
  const stats={active:false,kind:null,source:'existing player gun and hands; locally modeled dispatch radio',liquid:0,opacity:0,meshes:0};
  function clear(){
    for(const item of restingArms)item.root.removeFromParent();restingArms.length=0;
    body?.dispose();body=null;
    pistol?.removeFromParent();radio?.removeFromParent();doorHand?.removeFromParent();handheld?.removeFromParent();pistol=radio=doorHand=handheld=null;
    for(const resource of [...materials,...geometries,...skeletons])resource.dispose();
    for(const view of radioViews)view.dispose();radioViews.length=0;
    materials.clear();geometries.clear();skeletons.clear();treatments.length=0;storyArms.clear();
  }
  function ownMaterial(source){
    const material=source.clone();material.fog=false;materials.add(material);
    treatments.push({material,uniforms:attachPrologueLiquid(material),opacity:material.opacity,transparent:material.transparent});return material;
  }
  function addBox(parent,size,position,material){
    const geometry=new THREE.BoxGeometry(...size);geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(position);parent.add(mesh);return mesh;
  }
  function fallbackHand(parent){
    const source=skinMaterial||new THREE.MeshStandardMaterial({color:0x9b7861,roughness:.9}),material=ownMaterial(source);if(!skinMaterial)source.dispose();
    addBox(parent,[.082,.098,.12],[.20,-.23,-.31],material);
    addBox(parent,[.08,.085,.32],[.20,-.27,-.10],material);
  }
  function cloneGun(radioOnly,withRadio=true){
    const root=cloneSkeleton(gun);root.name=radioOnly?'Story hand and radio':'Story low-ready pistol';root.visible=true;
    root.getObjectByName('Muzzle burst')?.removeFromParent();
    const right=root.getObjectByName('RightArm');
    root.traverse(object=>{
      object.layers.set(0);if(object.isLight)object.intensity=0;
      if(object.isSkinnedMesh)skeletons.add(object.skeleton);
      if(!object.isMesh)return;
      object.material=Array.isArray(object.material)?object.material.map(ownMaterial):ownMaterial(object.material);
      if(radioOnly){let owner=object;while(owner&&owner!==right)owner=owner.parent;object.visible=!!owner;}
    });
    if(!right)fallbackHand(root);
    if(radioOnly){
      if(right)applyHandGrip(right,withRadio?'radio':'pistol');
      const view=withRadio?createPrologueRadio({loader:radioLoader,deadlineMs:radioDeadlineMs,prepareMaterial:material=>{
        treatments.push({material,uniforms:attachPrologueLiquid(material),opacity:material.opacity,transparent:material.transparent});
      }}):null;
      const prop=view?.root||new THREE.Group();prop.name='Handheld dispatch radio';
      if(view){radioViews.push(view);stats.radio=view.stats;}
      const grip=right?.parent?.parent;
      if(grip){prop.position.fromArray(PROLOGUE_RADIO.position);grip.add(prop);}else{prop.position.set(.20,-.16,-.31);root.add(prop);}
    }
    camera.add(root);
    if(right){const fit=createStoryForearmFit(right,{ownGeometry:g=>geometries.add(g)});storyArms.set(root,{arm:right,...fit});}
    return root;
  }
  function addRestingArm(side){
    const source=side==='R'?gun.getObjectByName('RightArm'):torch?.getObjectByName('LeftArm');if(!source)return;
    const root=new THREE.Group(),arm=cloneSkeleton(source);root.name='Mike resting '+side+' anatomical hand and forearm';root.add(arm);overlay.add(root);
    arm.traverse(o=>{o.layers.set(0);if(o.isSkinnedMesh)skeletons.add(o.skeleton);if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(ownMaterial):ownMaterial(o.material);});
    const fit=createStoryForearmFit(arm,{side,ownGeometry:g=>geometries.add(g)});restingArms.push({root,arm,side,fit});
  }
  function ensure(){
    const next=getAssetVersion();if(pistol&&version===next)return;
    clear();version=next;body=createPrologueBody({loader:bodyLoader,deadlineMs:bodyDeadlineMs,onMaterial:mat=>{mat.fog=false;treatments.push({material:mat,uniforms:attachPrologueLiquid(mat),opacity:mat.opacity,transparent:mat.transparent});}});overlay.add(body.root);stats.body=body.stats;pistol=cloneGun(false);radio=cloneGun(true);doorHand=cloneGun(true,false);doorHand.name='Story hand on passenger door';doorHand.getObjectByName('Handheld dispatch radio').visible=false;
    if(torch?.children.length){
      handheld=cloneSkeleton(torch);handheld.name='Story hand and flashlight';camera.add(handheld);
      handheld.traverse(o=>{o.layers.set(0);if(o.isSkinnedMesh)skeletons.add(o.skeleton);if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(ownMaterial):ownMaterial(o.material);});
      const left=handheld.getObjectByName('LeftArm');if(left)storyArms.set(handheld,{arm:left,side:'L',...createStoryForearmFit(left,{side:'L',ownGeometry:g=>geometries.add(g)})});
    }
    addRestingArm('R');addRestingArm('L');
    stats.meshes=0;for(const root of [pistol,radio,doorHand,handheld,...restingArms.map(a=>a.root)].filter(Boolean))root.traverse(o=>{if(o.isMesh)stats.meshes++;});
  }
  function reset(){
    for(const item of restingArms)item.root.visible=false;
    if(body)body.root.visible=false;
    if(pistol)pistol.visible=false;if(radio)radio.visible=false;if(doorHand)doorHand.visible=false;if(handheld)handheld.visible=false;
    for(const t of treatments){t.uniforms.amount.value=0;t.material.opacity=t.opacity;if(t.material.transparent!==t.transparent){t.material.transparent=t.transparent;t.material.needsUpdate=true;}}
    Object.assign(stats,{active:false,kind:null,liquid:0,opacity:0});
  }
  return {stats,reset,render(storyCamera,frame={}){
    if(disposed)return;
    const chapter=frame.chapter,radioReach=chapter==='car'&&(frame.radioHandReach||0)>.001,dispatch=chapter==='dispatch',exiting=chapter==='exit'&&frame.exitPose&&!frame.exitPose.finished;
    const outside=['flashlight','walk','undead','history','redroom','return_walk','disappearance','liquid','arrival','rupture'].includes(chapter);
    const bodyVisible=!!chapter&&!frame.returning;
    if(!dispatch&&!outside&&!exiting&&!radioReach&&!bodyVisible){reset();return;}
    ensure();const vision=prologueVisionState(frame),fade=outside?(1-vision.mist)*(1-vision.roomCover):1;
    if(fade<=.001){reset();return;}
    pistol.visible=outside;radio.visible=dispatch;doorHand.visible=!!exiting||radioReach;
    body.root.visible=bodyVisible;
    pistol.position.set(-.035-(storyCamera.aspect<1.3?.045:0),-.035,-.20);pistol.rotation.set(-.09,0,0);
    const raise=prologueEase(Number(frame.chapterTime)||0,0,.42)*(1-prologueEase(Number(frame.chapterProgress)||0,.93,1));
    radio.position.set(-.025,.045-.34*(1-raise),-.10+.08*(1-raise));radio.rotation.set(-.05+.28*(1-raise),-.10,.10);
    storyCamera.updateWorldMatrix(true,false);
    const view=storyCamera.matrixWorld.clone().invert(),cabin=new THREE.Matrix4().fromArray(frame.cabinMatrix||new THREE.Matrix4().elements),location=new THREE.Matrix4().fromArray(frame.locationMatrix||new THREE.Matrix4().elements);
    const inCar=frame.motion?.blocking?.inCar??['car','dispatch','emergence','bang','cabin'].includes(chapter),player=frame.player||{};
    const transform=(object,matrix)=>{matrix.decompose(object.position,object.quaternion,object.scale);};
    if(frame.cabinMatrix&&dispatch){
      // The radio/forearm retains a physical passenger-shoulder frame when the
      // head turns. Inherited camera parenting remains projection-only.
      radio.updateMatrix();const local=radio.matrix.clone();
      const passengerEye=new THREE.Matrix4().makeTranslation(.5,1.13,.35);
      transform(radio,view.clone().multiply(cabin).multiply(passengerEye).multiply(local));
      stats.radioAnchor='cabin-relative passenger shoulder';
      radio.updateWorldMatrix(true,true);
      stats.radioClearance=cabinRadioEnvelope(radio.getObjectByName('Handheld dispatch radio'),view.clone().multiply(cabin));
    }
    if(bodyVisible){
      const transfer=exiting?(frame.exitPose.transfer||0):inCar?0:1;
      const heading=player.yaw||0,bodyBack=.15+.08*(1-transfer);
      const x=exiting?frame.exitPose.position[0]+Math.sin(heading)*.15*transfer:inCar?.5:(player.x||0)+Math.sin(heading)*.15,z=exiting?frame.exitPose.position[2]+bodyBack:inCar?.58:(player.z||0)+Math.cos(heading)*.15;
      const y=exiting?-.38*(1-transfer):inCar?-.38:Math.max(0,(player.y||1.58)-1.58);
      const yaw=inCar&&!exiting?Math.PI:(player.yaw||0)+Math.PI;
      const lean=samplePrologueBodyReach(chapter==='car'?frame.radioHandReach:0);
      const local=new THREE.Matrix4().compose(new THREE.Vector3(x+lean.hipOffset[0],y,z+lean.hipOffset[2]),new THREE.Quaternion().setFromAxisAngle(up,yaw),new THREE.Vector3(1,1,1));
      // Ground-contact history belongs to the physical scene. Pose there before
      // converting to the camera-relative coordinates used by this depth pass.
      const physical=(inCar&&!exiting?cabin:location).clone().multiply(local);
      transform(body.root,physical);body.pose(frame);
      transform(body.root,view.clone().multiply(physical));
    }
    const actionRight=doorHand.getObjectByName('RightArm'),actionGrip=radioReach?'pistol':'flashlight';
    if(actionRight&&doorHand.userData.actionGrip!==actionGrip){applyHandGrip(actionRight,actionGrip);doorHand.userData.actionGrip=actionGrip;}
    if(exiting&&frame.exitHandTarget){
      storyCamera.updateWorldMatrix(true,false);doorHand.position.set(0,0,0);
      const doorRotation=new THREE.Quaternion().fromArray(frame.exitHandQuaternion||[0,0,0,1]);
      doorHand.quaternion.copy(storyCamera.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(doorRotation));doorHand.rotateY(-Math.PI/2);
      const desired=storyCamera.worldToLocal(new THREE.Vector3().fromArray(frame.exitHandTarget));
      const home=new THREE.Vector3(.30,-.28,-.42);desired.lerp(home,1-frame.exitPose.hand);
      doorHand.updateMatrixWorld(true);const right=doorHand.getObjectByName('RightArm');
      const contact=right?.parent?right.parent.localToWorld(new THREE.Vector3(...HAND_GRIP_CONTACT.flashlight)):new THREE.Vector3(.2,-.2,-.3);
      doorHand.position.copy(desired.sub(contact));
    }
    if(radioReach&&frame.radioHandTarget){
      storyCamera.updateWorldMatrix(true,false);doorHand.position.set(0,0,0);
      const cabinRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(cabin));
      doorHand.quaternion.copy(storyCamera.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(cabinRotation));
      doorHand.rotateZ(-.25-(frame.radioHandTurn||0)*.55);doorHand.rotateX(-.25);
      const desired=storyCamera.worldToLocal(new THREE.Vector3().fromArray(frame.radioHandTarget));
      const home=frame.cabinMatrix?new THREE.Vector3(.78,.62,.10).applyMatrix4(cabin).applyMatrix4(view):new THREE.Vector3(.33,-.38,-.24);
      desired.lerp(home,1-frame.radioHandReach);
      doorHand.updateMatrixWorld(true);const right=doorHand.getObjectByName('RightArm');
      const toward=new THREE.Vector3(0,0,-1).transformDirection(view.clone().multiply(cabin));
      const contact=right?.parent?storyArms.get(doorHand)?.supportContact(toward)||right.parent.localToWorld(new THREE.Vector3(...HAND_GRIP_CONTACT.flashlight)):new THREE.Vector3(.2,-.2,-.3);
      doorHand.position.copy(desired.sub(contact));
    }
    if(handheld){
      handheld.visible=outside&&!!frame.player?.flashlightOn;
      const pose=flashlightPose({time:frame.elapsed??frame.time,steps:frame.player?.distance||0,moving:frame.player?.moving,reduced:frame.reduced,aspect:storyCamera.aspect});
      handheld.position.fromArray(pose.position);handheld.rotation.set(...pose.rotation);
    }
    overlay.updateMatrixWorld(true);
    for(const [owner,fit]of storyArms)if(owner.visible&&bodyVisible){
      const wrist=fit.arm.parent.localToWorld(new THREE.Vector3()),contact=body.connectArm(fit.side||'R',wrist);
      if(contact)fit.fit(contact.elbow);
    }
    // Inactive story hands still belong to the complete visible body. Fit each
    // actual anatomical forearm to its own existing elbow/wrist pose, rather
    // than leaving a cropped upper arm when no radio/weapon is being held.
    body.root.updateMatrixWorld(true);
    for(const item of restingArms){
      item.root.visible=bodyVisible&&(item.side==='R'?!(pistol.visible||radio.visible||doorHand.visible):!handheld?.visible);
      if(!item.root.visible)continue;
      const hand=body.root.getObjectByName('hand'+item.side),elbow=body.root.getObjectByName('armlo'+item.side);if(!hand||!elbow){item.root.visible=false;continue;}
      const wrist=hand.getWorldPosition(new THREE.Vector3()),end=elbow.getWorldPosition(new THREE.Vector3());item.root.position.copy(wrist);item.root.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),end.clone().sub(wrist).normalize());item.root.rotateZ(item.side==='R'?.35:-.35);item.root.updateMatrixWorld(true);item.fit.fit(end);
    }
    stats.restingHands=restingArms.filter(a=>a.root.visible).map(a=>a.side);
    stats.flashlight=!!handheld?.visible;
    for(const t of treatments){t.uniforms.amount.value=vision.liquid;t.uniforms.time.value=Number(frame.time)||0;t.material.opacity=t.opacity*fade;const transparent=t.transparent||fade<.999;if(t.material.transparent!==transparent){t.material.transparent=transparent;t.material.needsUpdate=true;}}
    camera.projectionMatrix.copy(storyCamera.projectionMatrix);camera.projectionMatrixInverse.copy(storyCamera.projectionMatrixInverse);camera.near=storyCamera.near;camera.far=storyCamera.far;
    const clear=renderer.autoClear,resetInfo=renderer.info.autoReset;
    try{renderer.autoClear=false;renderer.info.autoReset=false;renderer.render(overlay,camera);Object.assign(stats,{active:true,kind:radioReach?'radio knob hand':exiting?'door hand':dispatch?'radio':outside?'gun':'body',liquid:vision.liquid,opacity:fade});}
    finally{renderer.autoClear=clear;renderer.info.autoReset=resetInfo;}
  },release(){clear();reset();stats.meshes=0;},dispose(){if(disposed)return;disposed=true;clear();reset();}};
}

export function createScene(canvas,maze,{touch=false,weather=null}={}){
  let disposed=false;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1:1.5));renderer.setSize(innerWidth,innerHeight,false);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x111d19);scene.fog=new THREE.FogExp2(0x111d19,.096);
  const baseBackground=scene.background.clone(),redBackground=new THREE.Color(0x631d18);
  const stormBackground=new THREE.Color(0x52666b);
  const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.065,90);camera.rotation.order='YXZ';scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xabb9aa,0x4c4329,1.35));
  const moon=new THREE.DirectionalLight(0xadc1b1,1.4);moon.position.set(-30,50,10);scene.add(moon);
  const random=seeded(), dummy=new THREE.Object3D();
  const groundCanvas=document.createElement('canvas');groundCanvas.width=128;groundCanvas.height=128;
  const ctx=groundCanvas.getContext('2d');ctx.fillStyle='#474635';ctx.fillRect(0,0,128,128);
  for(let i=0;i<3300;i++){const b=35+Math.floor(random()*45);ctx.fillStyle=`rgba(${b+12},${b+9},${b},.4)`;ctx.fillRect(random()*128,random()*128,1+random()*3,1+random()*2);}
  const groundTex=new THREE.CanvasTexture(groundCanvas);groundTex.wrapS=groundTex.wrapT=THREE.RepeatWrapping;groundTex.repeat.set(55,58);groundTex.colorSpace=THREE.SRGBColorSpace;
  const floorHeight=maze.cornWorld.height*maze.cornWorld.size;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH*CELL,floorHeight),new THREE.MeshStandardMaterial({map:groundTex,roughness:weather?.state.enabled ? .58 : 1}));floor.rotation.x=-Math.PI/2;floor.position.set(WIDTH*CELL/2,0,floorHeight/2);scene.add(floor);
  const wallCells=[];
  if(!maze.corridorLayout)for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++)if(maze.grid[z][x]&&!maze.hideAnchors?.some(a=>x===a.corridorCell.x+a.cornSide.x&&z===a.corridorCell.z+a.cornSide.z))wallCells.push({x,z});
  const walls=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material(0x394630),wallCells.length);
  const stalks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.034,1,4),material(0x92915b),wallCells.length*7);
  const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.22,.23,.07,.6);leafShape.quadraticCurveTo(-.19,.25,0,0);
  const leafGeo=new THREE.ShapeGeometry(leafShape,2);const leafMat=new THREE.MeshStandardMaterial({color:0x68734a,side:THREE.DoubleSide,roughness:1});
  const leaves=new THREE.InstancedMesh(leafGeo,leafMat,wallCells.length*21);
  const ears=new THREE.InstancedMesh(new THREE.ConeGeometry(.058,.3,4),material(0xb3ad73),wallCells.length*7);
  let si=0,li=0;
  wallCells.forEach((c,i)=>{
    const p=centerOf(c.x,c.z),height=2.65+random()*.28;
    const bay=maze.landingZoneCells?.has(`${c.x},${c.z}`);
    dummy.position.set(p.x,height/2,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(bay?0:CELL,height,CELL);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);walls.setColorAt(i,new THREE.Color().setHSL(.18+random()*.05,.20,.17+random()*.07));
    for(let j=0;j<7;j++){
      const x=p.x+(random()-.5)*CELL,z=p.z+(random()-.5)*CELL,h=2.9+random()*.6;
      dummy.position.set(x,h/2,z);dummy.rotation.set((random()-.5)*.08,0,(random()-.5)*.08);dummy.scale.set(1,h,1);dummy.updateMatrix();stalks.setMatrixAt(si,dummy.matrix);
      dummy.position.set(x,h+.06,z);dummy.scale.set(1,1,1);dummy.updateMatrix();ears.setMatrixAt(si++,dummy.matrix);
      for(let k=0;k<3;k++){
        dummy.position.set(x,2.2+k*.3,z);dummy.rotation.set(-.7+random()*.35,random()*Math.PI*2,(random()-.5)*1.1);dummy.scale.set(1.5,1.6,1);dummy.updateMatrix();leaves.setMatrixAt(li++,dummy.matrix);
      }
    }
  });scene.add(walls,stalks,leaves,ears);if(maze.cornWorld)walls.visible=false;
  // Loose straw along the ground, one instanced draw call.
  const strawCount=maze.corridorLayout?0:1700;
  const straw=new THREE.InstancedMesh(new THREE.BoxGeometry(.022,.012,.23),material(0x79734e),strawCount);
  for(let i=0;i<strawCount;i++){dummy.position.set(random()*WIDTH*CELL,.015,random()*HEIGHT*CELL);dummy.rotation.set(0,random()*Math.PI,0);dummy.scale.set(1,1,1);dummy.updateMatrix();straw.setMatrixAt(i,dummy.matrix);}scene.add(straw);
  const wood=material(0x62614a),darkWood=material(0x363d2e),metal=material(0x343d36),pale=material(0x9d9d70);
  const cloth=material(0x3d4030),barrelPaint=material(0x55716c),barrelBands=metal.clone();
  function box(w,h,d,mat,x,y,z,parent=scene){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  function textSign(text,w,h){
    const c=document.createElement('canvas');c.width=1024;c.height=256;const cx=c.getContext('2d');
    cx.fillStyle='#242f25';cx.fillRect(0,0,1024,256);cx.strokeStyle='#899475';cx.lineWidth=3;cx.strokeRect(15,15,994,226);
    cx.font='76px Georgia';cx.fillStyle='#d5d4ac';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(text,512,136);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:tex,roughness:1,emissive:0x323523,emissiveIntensity:.22}));
  }
  const doorPos=centerOf(maze.door.x,maze.door.z);
  const door=new THREE.Group();door.position.set(doorPos.x-CELL/2,0,doorPos.z);scene.add(door);
  box(CELL,2.75,.14,wood,CELL/2,1.375,0,door);
  for(let i=1;i<7;i++)box(.025,2.71,.015,darkWood,i*CELL/7,1.375,.079,door);
  box(CELL,.13,.07,darkWood,CELL/2,.48,.10,door);box(CELL,.13,.07,darkWood,CELL/2,2.3,.10,door);box(.07,.23,.12,metal,CELL-.22,1.17,.14,door);
  const entranceObjects=[box(.2,3.3,.24,darkWood,doorPos.x-CELL/2-.1,1.65,doorPos.z),box(.2,3.3,.24,darkWood,doorPos.x+CELL/2+.1,1.65,doorPos.z)];
  const sign=textSign('C O R N F I E L D',3.5,.78);sign.position.set(doorPos.x,3.12,doorPos.z+.17);scene.add(sign);
  entranceObjects.push(sign);
  // A modest pool of light at the threshold.
  const doorLight=new THREE.PointLight(0xf1c087,28,11,1.6);doorLight.position.set(doorPos.x,3.1,doorPos.z+1.1);scene.add(doorLight);
  box(.15,.22,.15,new THREE.MeshStandardMaterial({color:0xffd29a,emissive:0xffb55f,emissiveIntensity:2}),doorPos.x,3.3,doorPos.z+.7);
  const scarecrowAnchors=[];
  function scarecrow(x,z,scale=1,broken=false){
    const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(scale);scene.add(group);
    box(.13,2.6,.13,darkWood,0,1.3,0,group);const arm=box(1.65,.12,.14,wood,0,2,0,group);if(broken)arm.rotation.z=-.28;
    const cloak=new THREE.Mesh(tilePropUV(new THREE.ConeGeometry(.39,1.2,5,1,true),8,4),cloth);cloak.position.y=1.7;group.add(cloak);
    const head=new THREE.Mesh(tilePropUV(new THREE.SphereGeometry(.23,7,5),5,2),pale);head.position.y=2.55;group.add(head);
    const hat=new THREE.Mesh(tilePropUV(new THREE.ConeGeometry(.44,.20,6),4,1),cloth);hat.position.y=2.79;group.add(hat);
    box(.065,.08,.035,metal,-.08,2.59,.21,group);box(.065,.08,.035,metal,.08,2.59,.21,group);
    return group;
  }
  for(const l of maze.landmarks){
    if(l.id==='red'){
      box(.10,2.5,.10,wood,l.x-.75,1.25,l.z);
      box(.26,.36,.26,new THREE.MeshStandardMaterial({color:0xaf5132,emissive:0xb83415,emissiveIntensity:1.8}),l.x-.75,2.35,l.z);
      const glow=new THREE.PointLight(0xff5728,20,8,1.8);glow.position.set(l.x-.65,2.3,l.z);scene.add(glow);
    }else if(maze.checkpoints.some(cp=>cp.id===l.id)){
      const group=new THREE.Group();group.position.set(l.x,0,l.z-.63);scene.add(group);
      const fallback=scarecrow(0,0,1,l.id==='cross');fallback.removeFromParent();group.add(fallback);
      scarecrowAnchors.push({group,fallback,checkpoint:maze.checkpoints.find(cp=>cp.id===l.id)});
    }
    else for(let i=0;i<3;i++){
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.25,.28,.8,9),barrelPaint);barrel.position.set(l.x+.64,.4,l.z+(i-1)*.6);scene.add(barrel);
      for(const y of [.15,.65]){const band=new THREE.Mesh(new THREE.TorusGeometry(.269,.018,3,9),barrelBands);band.rotation.x=Math.PI/2;band.position.set(barrel.position.x,y,barrel.position.z);scene.add(band);}
    }
  }
  // A readable child silhouette confirms the objective without another asset.
  const daughter=new THREE.Group();daughter.position.set(maze.center.x,0,maze.center.z);scene.add(daughter);
  const coat=material(0xac6650),dress=material(0xc8c7a6),hair=material(0x29221a),face=material(0xcaa888);
  box(.34,.55,.22,coat,0,.78,0,daughter);box(.37,.25,.23,dress,0,.41,0,daughter);
  for(const side of [-1,1]){box(.10,.28,.13,darkWood,side*.10,.15,0,daughter);box(.085,.46,.10,coat,side*.225,.78,.01,daughter);}
  const childHead=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),face);childHead.position.set(0,1.18,0);daughter.add(childHead);
  const childHair=new THREE.Mesh(new THREE.SphereGeometry(.171,12,8,0,Math.PI*2,0,Math.PI*.65),hair);childHair.position.set(0,1.21,0);daughter.add(childHair);
  const centerGlow=new THREE.PointLight(0xdcca8c,24,14,1.8);centerGlow.position.set(maze.center.x,4,maze.center.z);scene.add(centerGlow);
  const rewardRings=maze.checkpoints.map(cp=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.035,4,24),new THREE.MeshBasicMaterial({color:0xb6be87}));ring.rotation.x=Math.PI/2;ring.position.set(cp.x,.025,cp.z);scene.add(ring);return {ring,id:cp.id};});
  for(const a of maze.hideAnchors){
    if(a.permanentOpen)continue;
    const mark=textSign('CORN / E',.67,.18);
    if(maze.corridorLayout)mark.position.set(a.x,2.43,a.z+.08);
    else mark.position.set(a.x+a.cornSide.x*.97,1.45,a.z+a.cornSide.z*.97);
    mark.rotation.y=a.entryYaw+Math.PI;scene.add(mark);
    for(const side of [-1,1])box(.07,1.1,.07,wood,a.x+a.cornSide.x*1.04+a.cornSide.z*side*.46,.55,a.z+a.cornSide.z*1.04-a.cornSide.x*side*.46);
  }
  const enemy=new THREE.Group();scene.add(enemy);
  const skin=new THREE.MeshStandardMaterial({color:0x1b231d,roughness:1});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,1.05,3,6),skin);body.position.y=1.3;enemy.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.205,7,5),material(0x969879));head.scale.y=1.3;head.position.y=2.21;enemy.add(head);
  const limbs=[];for(const side of [-1,1]){
    const arm=box(.11,1.15,.12,skin,side*.4,1.18,0,enemy);arm.rotation.z=side*.12;limbs.push(arm);
    limbs.push(box(.13,.85,.15,skin,side*.16,.43,0,enemy));
    box(.049,.025,.035,new THREE.MeshStandardMaterial({color:0xe6cc8b,emissive:0xb39b4a,emissiveIntensity:1.3}),side*.078,2.25,.18,enemy);
  }
  const flashlight=new THREE.SpotLight(0xe9edce,38,15,.53,.75,1.65);flashlight.position.set(-.26,-.22,-.53);camera.add(flashlight);const beamTarget=new THREE.Object3D();beamTarget.position.set(0,0,-8);camera.add(beamTarget);flashlight.target=beamTarget;
  camera.layers.enable(1);
  const handLight=new THREE.HemisphereLight(0xb4bdad,0x514234,.8);handLight.layers.set(1);camera.add(handLight);
  const handKey=new THREE.DirectionalLight(0xe7e9d8,1.5),handTarget=new THREE.Object3D();handKey.layers.set(1);handKey.position.set(-.5,.6,.25);handTarget.position.set(0,-.2,-.6);handKey.target=handTarget;camera.add(handKey,handTarget);
  const gun=new THREE.Group();camera.add(gun);
  const gunMetal=new THREE.MeshStandardMaterial({color:0x49524d,roughness:.42,metalness:.65});
  box(.075,.13,.075,darkWood,.20,-.22,-.29,gun);box(.087,.072,.30,gunMetal,.20,-.14,-.38,gun);
  box(.025,.016,.025,metal,.20,-.095,-.50,gun);
  const shotEffect=createMuzzleBurst(gun,GAME_CONFIG.gun.muzzleFlashSeconds),muzzle=shotEffect.root;
  muzzle.position.set(.20,-.14,-.55);
  let gunRecoil=0,lastRenderTime=0;
  const knife=new THREE.Group();camera.add(knife);knife.visible=false;
  const handMaterial=material(0x9b7861,.9);
  const placeholderHand=box(.085,.095,.13,handMaterial,0,-.025,.08,knife);
  const handle=new THREE.Mesh(new THREE.CapsuleGeometry(.019,.12,4,8),material(0x242825,.85));handle.rotation.x=Math.PI/2;handle.position.z=.015;knife.add(handle);
  const bladeMetal=new THREE.MeshStandardMaterial({color:0x939995,roughness:.3,metalness:.9});
  box(.075,.015,.02,bladeMetal,0,0,-.08,knife);
  const bladeProfile=new THREE.Shape();bladeProfile.moveTo(-.016,0);bladeProfile.lineTo(-.018,.20);bladeProfile.lineTo(0,.29);bladeProfile.lineTo(.014,.23);bladeProfile.lineTo(.018,0);bladeProfile.closePath();
  const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(bladeProfile,{depth:.003,bevelEnabled:true,bevelSize:.0015,bevelThickness:.001,bevelSegments:1,steps:1}),bladeMetal);
  blade.rotation.x=-Math.PI/2;blade.position.z=-.08;knife.add(blade);
  const forearm=box(.085,.09,.34,handMaterial,.02,-.055,.29,knife);forearm.rotation.x=-.12;
  const bracingHand=box(.09,.085,.14,handMaterial,-.065,-.055,.08,knife);
  const torch=new THREE.Group();torch.name='Left hand flashlight';camera.add(torch);torch.visible=false;
  const hands=installHands({gun,knife,torch,placeholders:[placeholderHand,forearm,bracingHand],weaponPlaceholders:gun.children.filter(o=>o!==muzzle),muzzle,renderer});
  const prologueEquipment=createPrologueEquipment(renderer,{gun,torch,skinMaterial:handMaterial,getAssetVersion:()=>`${hands.stats.status}:${hands.stats.meshes}:${hands.stats.flashlightStatus}`});
  const headings=Array.from({length:4},()=>createActorHeading());
  for(const group of [gun,knife,torch])group.traverse(object=>{if(object.isMesh)object.layers.set(1);});
  const knifeStart=new THREE.Vector3(.16,-.15,-.46),eyeTarget=new THREE.Vector3(),knifeEnd=new THREE.Vector3(),knifeTip=new THREE.Vector3(),knifeDirection=new THREE.Vector3(),knifeForward=new THREE.Vector3(0,0,-1);
  // One reusable local foliage pocket. All anchors share its geometry/materials.
  const pocket=new THREE.Group();scene.add(pocket);pocket.visible=false;
  const pocketStalks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.015,.03,2.8,4),material(0x828651),100);
  const pocketLeaves=new THREE.InstancedMesh(leafGeo,leafMat,300);
  for(let i=0;i<100;i++){
    const angle=random()*Math.PI*2,r=1.25+random()*2;
    const x=Math.sin(angle)*r,z=Math.cos(angle)*r;
    dummy.position.set(x,1.4,z);dummy.rotation.set(0,angle,0);dummy.scale.set(1,1,1);dummy.updateMatrix();pocketStalks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<3;j++){dummy.position.set(x,.9+j*.52,z);dummy.rotation.set(-.5,angle+j*1.7,.3);dummy.scale.set(2.2,2.3,1);dummy.updateMatrix();pocketLeaves.setMatrixAt(i*3+j,dummy.matrix);}
  }
  pocket.add(pocketStalks,pocketLeaves);
  // Sparse particles in the beam, all in one geometry and draw call.
  const dustData=new Float32Array(900);for(let i=0;i<900;i+=3){dustData[i]=(random()-.5)*22;dustData[i+1]=random()*5;dustData[i+2]=(random()-.5)*22;}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustData,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xadb89a,size:.023,transparent:true,opacity:.24,depthWrite:false}));scene.add(dust);
  // Legacy remains available for identical-camera comparisons and immediate rollback.
  const parameters=new URLSearchParams(location.search);
  const requested=parameters.get('visuals')||'field';
  // The old sample URL now gets the complete fence-lined field as well.
  const mode=requested==='legacy'?'legacy':'field';
  const detailsEnabled=mode!=='legacy'&&parameters.get('details')!=='off';
  const skyEnabled=mode!=='legacy'&&parameters.get('sky')!=='off';
  const visuals={mode,status:mode==='legacy'?'legacy':'loading',error:null,stats:null,
    sky:{status:skyEnabled?'loading':'off',error:null,stats:null}};
  visuals.hands=hands.stats;
  visuals.prologueEquipment=prologueEquipment.stats;
  visuals.shot=shotEffect.stats;
  visuals.knife={active:false,contact:false,contactGap:null};
  const worldObjects=scene.children.filter(o=>o!==camera&&o!==enemy&&o!==dust&&!o.isHemisphereLight&&!o.isDirectionalLight);
  const originalVisible=new Map(worldObjects.map(o=>[o,o.visible]));
  const extraGroups=maze.corridorLayout?Array.from({length:3},()=>{const group=enemy.clone();scene.add(group);return group;}):[];
  const corridorView=createCorridorFieldView(scene,maze,floor,{touch,camera,createSign:textSign,spatial:parameters.has('test')&&parameters.get('wallbatches')==='on'});visuals.corridors=corridorView.stats;
  const scarecrows=createScarecrowView(scene,scarecrowAnchors,{touch,cloth});visuals.scarecrows=scarecrows.stats;
  const liquidMaterials=new Set(),liquidTreatments=[];
  function registerLiquid(){
    if(disposed)return;
    for(const root of scene.children){
      if(root===camera||root===enemy||extraGroups.includes(root))continue;
      root.traverse(object=>{for(const m of [object.material].flat().filter(Boolean))if(m.isMeshStandardMaterial&&!liquidMaterials.has(m)){
        liquidMaterials.add(m);const uniforms=attachLiquidMaterial(m);uniforms.scale.value=.45;liquidTreatments.push(uniforms);
      }});
    }
  }
  registerLiquid();scarecrows.ready.then(registerLiquid);
  const groundDetails=createGroundDetails(scene,{touch});visuals.ground=groundDetails.stats;
  const weatherView=weather?createWeatherView(scene,weather):null;
  const cornView=createCornView(scene,maze);visuals.corn=cornView.stats;
  const survivalView=createSurvivalView(scene,maze);
  visuals.survival=survivalView.stats;
  if(maze.survivalLayout){const d=maze.cornWorld.doors[maze.survivalLayout.outer],label=textSign('C O R N F I E L D',2.3,.5);label.position.set(d.x,2.7,d.z-.1);label.rotation.y=Math.PI;scene.add(label);}
  visuals.weather=weatherView?.stats||{enabled:false};
  let fieldVisuals=null;
  const fieldReady=mode==='legacy'?Promise.resolve():installFieldVisuals({scene,maze,camera,floor,door,entranceObjects,
    legacy:{cells:wallCells,walls,stalks,leaves,ears,straw},mode,details:detailsEnabled,wet:weather?.state.enabled}).then(result=>{
      fieldVisuals=result;visuals.status='ready';visuals.stats=result.stats;
      cornView.setMaterials(result.materials);
      survivalView.setCorn(result.introCorn);
      corridorView.setAssets(result.introCorn,result.materials,result.farCorn);
      if(detailsEnabled)reuseFieldMaterials({wood,darkWood,bands:barrelBands},result.materials);
      registerLiquid();
    }).catch(error=>{visuals.status='fallback';visuals.error=error.message;console.warn('Field visuals unavailable; using original scene.',error.message);});
  let nightSky=null;
  const skyReady=skyEnabled?installNightSky({scene,camera}).then(result=>{
    nightSky=result;visuals.sky.status='ready';visuals.sky.stats=result.stats;weatherView?.setSky?.(result.texture);
  }).catch(error=>{
    visuals.sky.status='fallback';visuals.sky.error=error.message;
    console.warn('Night sky unavailable; using original background.',error.message);
  }):Promise.resolve();
  let zombie=null;
  visuals.zombie={status:'loading',error:null};
  const zombieReady=installZombie(enemy,extraGroups).then(result=>{
    zombie=result;visuals.zombie.status='ready';
  }).catch(error=>{visuals.zombie.status='fallback';visuals.zombie.error=error.message;console.warn('Zombie unavailable; using original enemy.',error.message);});
  visuals.details={status:detailsEnabled?'loading':'off'};
  const detailsReady=detailsEnabled?installPropDetails({cloth,sack:pale,barrel:barrelPaint}).then(result=>{
    visuals.details=result;
  }):Promise.resolve();
  // Zombie is optional and can install later; its own deadline prevents a late commit.
  const ready=Promise.all([fieldReady,skyReady,detailsReady,hands.ready]);
  function resize(){if(disposed)return;const width=canvas.clientWidth||innerWidth,height=canvas.clientHeight||innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const quality=createRenderQuality({mode:parameters.get('quality'),onChange(profile){
    renderer.setPixelRatio(Math.min(devicePixelRatio,profile.pixelRatio));
    corridorView.setQuality?.(profile);groundDetails.setQuality(profile);weatherView?.setQuality?.(profile);resize();
  }});
  addEventListener('resize',resize);
  function render(g,time,reduced=false){
    if(disposed)return;
    const checkpoint=checkpointVisionState(g,reduced);visuals.checkpointVision=checkpoint;
    for(const uniforms of liquidTreatments){uniforms.amount.value=checkpoint.amount;uniforms.time.value=g.elapsed;uniforms.red.value=checkpoint.red;}
    prologueEquipment.release();
    const renderDt=Math.max(0,Math.min(.05,time-lastRenderTime));lastRenderTime=time;
    gunRecoil=Math.max(0,gunRecoil-renderDt);
    const playerAt=actorPosition(g,'player'),enemyAt=actorPosition(g,'enemy');
    const q=g.interaction,locked=interactionLocked(g),inCorn=g.player.hidden||g.player.cornZoneId;
    scene.fog.density=inCorn?.30:g.cornSurvival&&!g.cornSurvival.complete&&g.player.z>84?.22:.096;pocket.visible=false;
    if(g.corridorRun)scene.fog.density=g.player.zone==='field'?.29:.075;
    if(pocket.visible){const anchor=maze.landingZones.find(a=>a.id===g.player.cornZoneId);pocket.position.set(anchor?.pocket.x??playerAt.x,0,anchor?.pocket.z??playerAt.z);}
    gun.visible=g.mode==='playing'&&!locked;shotEffect.update(renderDt,gun.visible,reduced);
    const nearWall=g.mode==='playing'&&!locked&&!lineOfSight(g.maze,playerAt,{x:playerAt.x-Math.sin(g.player.yaw)*.75,z:playerAt.z-Math.cos(g.player.yaw)*.75},g.blocks||[]);
    const gunPose=viewmodelPose({time,steps:g.steps,moving:g.player.moving,recoil:gunRecoil,reduced,nearWall,aspect:camera.aspect});
    gun.position.set(...gunPose.position);gun.rotation.set(...gunPose.rotation);
    torch.visible=gun.visible&&!!g.player.flashlightOn;
    const torchPose=flashlightPose({time,steps:g.steps,moving:g.player.moving,reduced,nearWall,aspect:camera.aspect});
    torch.position.fromArray(torchPose.position);torch.rotation.set(...torchPose.rotation);
    if(g.mode==='menu'){
      camera.position.set(maze.spawn.x+1.9,1.66,maze.spawn.z+1.7);
      const entrance=maze.corridorLayout?maze.cornDoors[maze.corridorLayout.entrance]:maze.survivalLayout?maze.cornWorld.doors[maze.survivalLayout.outer]:doorPos;
      camera.lookAt(entrance.x-.25,1.7,entrance.z);flashlight.intensity=15;
    }else{
      const bob=reduced||!g.player.moving?0:Math.sin(g.steps*7)*.021;
      camera.position.set(playerAt.x,GAME_CONFIG.player.eyeHeight+bob,playerAt.z);camera.rotation.set(g.player.pitch,g.player.yaw,0,'YXZ');
      if(locked){
        const t=Math.max(0,time-q.phaseStartedAt);
        const lowered=q.phase==='tackle'?Math.min(1,t/GAME_CONFIG.grapple.tackleSeconds):1;
        camera.position.y=q.phase==='throw'?.48+(GAME_CONFIG.player.eyeHeight-.48)*Math.min(1,t/GAME_CONFIG.grapple.throwSeconds):GAME_CONFIG.player.eyeHeight-(GAME_CONFIG.player.eyeHeight-.48)*lowered;
        camera.rotation.x=q.phase==='throw'?-.04:.15;
        camera.rotation.z=reduced?0:q.phase==='tackle'?Math.sin(lowered*Math.PI)*.035:0;
      }
      flashlight.intensity=g.player.flashlightOn?38:0;
    }
    door.rotation.y=-g.doorAmount*1.68;
    enemy.visible=g.enemy.visible&&(!g.enemies||(g.enemy.active&&g.enemy.zone===g.player.zone));enemy.position.set(enemyAt.x,reduced?0:Math.sin(time*3)*.025,enemyAt.z);enemy.rotation.y=headings[0].sample(g.enemy,g.runId,renderDt,{immediate:locked||reduced});
    if(!zombie){enemy.rotation.z=g.enemy.state==='staggered'?-1.15:g.enemy.state==='flashlight_recoil'?.3:0;}
    if(!reduced)limbs.forEach((l,i)=>l.rotation.x=Math.sin(g.enemy.step*4+i*Math.PI)*.12);
    zombie?.update(g,time,{reduced});
    if(g.enemies){
      const others=g.enemies.filter(e=>e!==g.enemy&&e.active&&e.zone===g.player.zone);
      extraGroups.forEach((group,i)=>{const e=others[i];group.visible=!!e;if(!e)return;
        group.position.set(e.x,0,e.z);group.rotation.set(0,headings[i+1].sample(e,g.runId,renderDt,{immediate:reduced}),0);
        zombie?.copies?.[i]?.update({...g,enemy:e,interaction:null},time,{reduced,suppressed:!!g.interaction});
      });
    }
    knife.visible=locked&&['tackle','qte','stab'].includes(q.phase);
    Object.assign(visuals.knife,{active:knife.visible,contact:false,contactGap:null});
    if(knife.visible){
      const pose=strugglePose(q,time,reduced),progress=pose.progress;
      const worldEye=zombie?.getEyeWorld?.('left',eyeTarget);
      if(!worldEye)eyeTarget.set(enemyAt.x,.93,enemyAt.z);
      // Keep the actual animated face in view from the lowered struggle camera.
      const rise=eyeTarget.y-camera.position.y;
      const run=Math.hypot(eyeTarget.x-camera.position.x,eyeTarget.z-camera.position.z);
      camera.rotation.x=Math.atan2(rise,Math.max(.1,run))-.09;
      camera.translateZ(.018*pose.impact);
      camera.updateMatrixWorld(true);
      camera.worldToLocal(eyeTarget);
      knifeDirection.copy(eyeTarget).sub(knifeStart).normalize();
      knifeEnd.copy(eyeTarget).addScaledVector(knifeDirection,-.37);
      knife.position.copy(knifeStart).lerp(knifeEnd,progress);
      knife.position.x+=pose.tremorX;knife.position.y+=pose.tremorY;
      knife.quaternion.setFromUnitVectors(knifeForward,knifeDirection);
      knife.rotateZ(pose.roll+.035*pose.impact);
      knife.updateMatrix();knifeTip.set(0,0,-.37).applyMatrix4(knife.matrix);
      Object.assign(visuals.knife,{contact:pose.contact,contactGap:knifeTip.distanceTo(eyeTarget)});
      bracingHand.position.x=-.065-.025*progress;
    }
    const nightmare=parameters.get('horror')==='off'?{amount:0,rain:0,sky:g.skyRedUntil>g.elapsed?1:0}:nightmareState(g,reduced),red=nightmare.sky;
    const flash=reduced||g.interaction||red>0?0:weather?.state.lightning||0;
    scene.background.copy(baseBackground).lerp(redBackground,Math.max(red,checkpoint.red*.72));
    scene.background.lerp(stormBackground,flash*.40);
    scene.fog.color.copy(baseBackground).lerp(redBackground,checkpoint.red*.8).lerp(stormBackground,flash*.16);
    scene.fog.density+=checkpoint.mist;
    moon.intensity=1.4+flash*2.2;
    for(const {ring,id}of rewardRings)ring.visible=!g.progress.activatedCheckpoints.includes(id);
    dust.position.set(camera.position.x,0,camera.position.z);dust.rotation.y=reduced?0:Math.sin(time*.018)*.1;
    dust.visible=!weather?.state.enabled;
    scarecrows.update(g,g.elapsed,reduced,camera);
    hands.update(g,{recoil:gunRecoil,reduced});cornView.update(g);survivalView.update(g);fieldVisuals?.update(g);nightSky?.update(Math.max(red,checkpoint.red*.72),flash);weatherView?.update(camera,g,nightmare);
    if(g.corridorRun){
      const field=g.player.zone==='field';
      for(const o of worldObjects)o.visible=!field&&originalVisible.get(o);
      for(const o of [walls,stalks,leaves,ears,straw,door,...entranceObjects,pocket])o.visible=false;
      for(const {ring,id}of rewardRings)ring.visible=!field&&!g.progress.activatedCheckpoints.includes(id);
      // The old corn islands are hidden behind the new opaque wooden panels.
      // Borrow their assets/materials without drawing that redundant vegetation.
      cornView.setVisible(!field);fieldVisuals?.setVisible(false);corridorView.update(g,reduced);groundDetails.update(g);
    }
    if(g.survivalEnding?.phase==='transform'){
      scene.fog.color.set(0x310206);scene.fog.density=.075+Math.min(1,g.survivalEnding.time/3)*.85;
    }
    renderFirstPersonLayers(renderer,scene,camera,gun.visible||knife.visible||torch.visible);
  }
  return {renderer,scene,camera,render,resize,ready,visuals,quality,renderPrologueEquipment:(storyCamera,frame)=>prologueEquipment.render(storyCamera,frame),
    dispose(){
      if(disposed)return;disposed=true;removeEventListener('resize',resize);prologueEquipment.dispose();hands.dispose();corridorView.dispose?.();scarecrows.dispose();
      const resources=new Set();scene.traverse(object=>{
        if(object.geometry)resources.add(object.geometry);if(object.isSkinnedMesh)resources.add(object.skeleton);
        for(const material of [object.material].flat().filter(Boolean)){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}
      });for(const resource of resources)resource.dispose();renderer.dispose();
    },
    introCorn:()=>fieldVisuals?.introCorn||null,
    creatureDiagnostics:()=>zombie?.diagnostics(),
    animationTrial:name=>zombie?.trial(name),
    event(event){if(event.type==='shot'){shotEffect.trigger();gunRecoil=.16;}},reset(){shotEffect.reset();gunRecoil=0;lastRenderTime=0;}};
}
