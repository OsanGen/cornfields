import * as THREE from 'three';
import {defaultActorWheelMatrix,wheelGrip} from './prologue-cabin.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createPrologueActor} from './prologue-actors.js';
import {smooth,clamp as unitClamp} from './prologue-performance.js';
import {sampleSpeech} from './prologue-speech.js';
import {samplePrologueSoleGait} from './prologue-motion.js';
import {reachPrologueArm} from './prologue-confrontation.js';

export const TEXTURED_CAST_PROVENANCE = 'NPC male Steve by supersteve, CC0; fitted and animated for the Cornfields prologue';
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mod = (value, period) => ((value % period) + period) % period;

// Set a bone in world space without making it depend on the actor's scene parent.
function worldRotation(bone, rotation) {
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(rotation));
  bone.updateWorldMatrix(false, true);
}

function aimBone(bone, from, to) {
  const rotation = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  worldRotation(bone, rotation.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}

function decayMaterial(material, decay) {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.prologueDecay = decay;
    shader.vertexShader = 'varying vec3 vPrologueCastBody;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrologueCastBody=position;');
    shader.fragmentShader = 'uniform float prologueDecay; varying vec3 vPrologueCastBody;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec3 cell=floor(vPrologueCastBody*24.);
      float grain=fract(sin(dot(cell,vec3(17.13,71.7,43.9)))*43758.5453);
      if(prologueDecay>0.&&grain<prologueDecay)discard;`);
  };
  material.customProgramCacheKey = () => `${key()}:prologue-textured-decay-v1`;
}

/** Clone a preloaded cast. Geometry/textures belong to the scene's asset owner. */
export function createTexturedPrologueActor({name = 'Clarence', police = true, gltf, onMaterial} = {}) {
  if (!gltf?.scene || !gltf.animations?.some(clip => clip.name === 'Walk')) {
    const fallback = createPrologueActor({name, police});
    const materials = new Set();
    fallback.root.traverse(object => {
      for (const material of [].concat(object.material || [])) materials.add(material);
    });
    for (const material of materials) onMaterial?.(material);
    return {...fallback, dispose() {}};
  }

  const identity=gltf.asset?.extras?.cinematicCharacter||(police?'clarence':'stanley');
  const root = new THREE.Group(); root.name = `Prologue ${name}`;root.userData.actorIdentity=identity;
  const fit = new THREE.Group(); root.add(fit);
  const model = cloneSkeleton(gltf.scene); fit.add(model);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  const scale = 1.8 / Math.max(.01, height);
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;

  const materials = new Map(), skeletons = new Set(), bones = new Map(), decay = {value:0};
  model.traverse(object => {
    if (object.isBone) bones.set(object.name.replaceAll('.', ''), object);
    if (object.isSkinnedMesh) {
      skeletons.add(object.skeleton);
      // The source clip bounds differ significantly between standing and seated.
      object.frustumCulled = false;
    }
    if (!object.material) return;
    const copies = [].concat(object.material).map(source => {
      if (!materials.has(source)) {
        const material = source.clone();
        const skin = /head|cheek|ear|arms/i.test(source.name);
        // The same source atlas now has fitted ear UVs; retain its detail.
        if (/head|cheek|ear/i.test(source.name) && !source.roughnessMap) material.roughness = .67;
        if (/eye/i.test(source.name)) {material.roughness = .30; material.color.setHex(0xffffff);}
        if (/shirt|pants/i.test(source.name)) material.color.multiply(new THREE.Color(police ? 0x70829c : 0xb5a48c));
        onMaterial?.(material);
        decayMaterial(material, decay);
        materials.set(source, {material, color:material.color.clone(), skin});
      }
      return materials.get(source).material;
    });
    object.material = Array.isArray(object.material) ? copies : copies[0];
  });
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  // Neutral standing is a fitted, planted sample, not the first raised Walk pose.
  const neutralSource=clips.get('Talk')||clips.get('Walk');
  const idle=new THREE.AnimationClip('Idle',2,neutralSource.tracks.map(track=>{
    const size=track.getValueSize(),copy=track.clone();copy.times=new Float32Array([0,2]);copy.values=new Float32Array([...track.values.slice(0,size),...track.values.slice(0,size)]);return copy;
  }));clips.set('Idle',idle);
  const run=clips.get('Walk').clone();run.name='Run';clips.set('Run',run);
  const mixer = new THREE.AnimationMixer(model);const actions=new Map([...clips].map(([name,clip])=>[name,mixer.clipAction(clip).play()]));
  const feet=['L','R'].map((side,index)=>({side,index,upper:bones.get('legup'+side),lower:bones.get('leglo'+side),foot:bones.get('foot1'+side),toe:bones.get('foot2'+side),anchor:null,cycle:null}));
  let footDiagnostics=[],lastSupportTime=null,blendDiagnostics={},speechValue=0;
  const eyes=[bones.get('eyeL'),bones.get('eyeR')].filter(Boolean);
  const lids=[],lidGeometry=[];let lidsReady=false,lastBlink=null;
  let action = null, clipName = null, lastPose = 'standing', lastCorpse = false, disposed = false;
  const head = bones.get('head'), mouth = bones.get('mouth'), torso = bones.get('torso');
  const headTilt = new THREE.Quaternion(), actorRotation = new THREE.Quaternion();
  const arms = ['L', 'R'].map((side, index) => ({
    side, sign:index ? -1 : 1,
    upper:bones.get(`armup${side}`), lower:bones.get(`armlo${side}`), hand:bones.get(`hand${side}`),
    thumb:bones.get(`f1${side}004`),
    fingers:[`f1${side}`, `f2${side}`, `f1${side}002`, `f2${side}002`].map(id => bones.get(id)).filter(Boolean),
  }));
  const wristTargets = [];
  let windowContacts = [], windowTargets = [];
  // AnimationMixer skips unchanged channels. Restore its last sampled pose before
  // applying the next sample so procedural head/hand offsets never accumulate.
  const sampled = [...bones.values()].map(bone => ({bone, position:bone.position.clone(), quaternion:bone.quaternion.clone(), scale:bone.scale.clone()}));

  function sample(name,seconds,weight=1,secondary='Idle',secondaryTime=0){
    const clip=clips.get(name)||clips.get('Idle');clipName=clip.name;blendDiagnostics={};
    for(const [id,item]of actions){item.enabled=true;item.setEffectiveWeight(0);item.time=0;}
    action=actions.get(clip.name);action.time=mod(seconds,clip.duration||1);action.setEffectiveWeight(weight);blendDiagnostics[clip.name]=weight;
    if(weight<1&&secondary!==clip.name){const other=actions.get(secondary);other.time=mod(secondaryTime,clips.get(secondary).duration||1);other.setEffectiveWeight(1-weight);blendDiagnostics[secondary]=1-weight;}
    mixer.update(0);
  }

  function ensureLids(){
    if(lidsReady||!head)return;lidsReady=true;root.updateMatrixWorld(true);
    const eyeMeshes=[];model.traverse(o=>{if(o.isSkinnedMesh&&/^eye[01]$/.test(o.name))eyeMeshes.push(o);});
    const material=new THREE.MeshStandardMaterial({color:0xb69a8b,roughness:.82,side:THREE.DoubleSide,vertexColors:true});
    const lidColor=gltf.asset?.extras?.lidSkinColorLinear;if(Array.isArray(lidColor)&&lidColor.length===3&&lidColor.every(Number.isFinite))material.color.fromArray(lidColor);
    onMaterial?.(material);materials.set(material,{material,color:material.color.clone(),skin:true});decayMaterial(material,decay);
    for(const eyeMesh of eyeMeshes){
      const bounds=new THREE.Box3();for(let i=0;i<eyeMesh.geometry.attributes.position.count;i++)bounds.expandByPoint(root.worldToLocal(eyeMesh.localToWorld(eyeMesh.getVertexPosition(i,new THREE.Vector3()))));
      const center=bounds.getCenter(new THREE.Vector3()),radius=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
      for(const side of [1,-1]){
        const authored=!!gltf.asset?.extras?.cinematicCharacter,rows=authored?5:2;
        const geometry=new THREE.BufferGeometry(),positions=new Float32Array(13*rows*3),indices=[];
        for(let i=0;i<12;i++)for(let row=0;row<rows-1;row++){const a=i*rows+row;indices.push(a,a+1,a+rows,a+1,a+rows+1,a+rows);}
        geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(positions.length).fill(1),3));geometry.setIndex(indices);
        const mesh=new THREE.Mesh(geometry,material);mesh.name=side>0?'Fitted upper eyelid':'Fitted lower eyelid';head.add(mesh);lidGeometry.push(geometry);
        // Coordinate frame captured in head space, independent of later look/pose.
        const origin=head.worldToLocal(root.localToWorld(center.clone()));
        const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(v=>head.worldToLocal(root.localToWorld(center.clone().add(v))).sub(origin));
        lids.push({mesh,geometry,positions,center:origin,radius,axes,side,rows,authored,depth:radius.z,
          upperOpen:gltf.asset?.extras?.cinematicCharacter?(identity==='stanley'?.36:.42):.80,
          lowerOpen:gltf.asset?.extras?.cinematicCharacter?.45:.92});
      }
    }
  }
  function blinkLids(amount){
    if(amount===lastBlink)return;lastBlink=amount;
    for(const lid of lids){const {geometry,center,radius,axes,side,depth,rows,authored}=lid;
      for(let i=0;i<=12;i++){const u=i/6-1,arc=Math.sqrt(Math.max(0,1-u*u));for(let row=0;row<rows;row++){
        const open=(side>0?lid.upperOpen:lid.lowerOpen)*(1-unitClamp(amount));
        const outer=authored?1.08:1.05,openness=outer+(open-outer)*row/(rows-1);
        const v=side*arc*openness;
        // Follow the ellipsoid instead of closing two flat discs over the eye.
        // The upper/lower shells meet at the curved lid seam, stay seated at
        // their outer rim and preserve the source eye's independent gaze.
        const bulge=Math.sqrt(Math.max(0,1-u*u-v*v));
        const pt=center.clone().addScaledVector(axes[0],u*radius.x*1.055).addScaledVector(axes[1],v*radius.y).addScaledVector(axes[2],authored?depth*bulge+.0022:depth+.002+.001*arc);
        geometry.attributes.position.setXYZ(i*rows+row,pt.x,pt.y,pt.z);
        const crease=authored&&row===rows-1?1-(side>0?.16:.05)-.43*unitClamp(amount):1;
        geometry.attributes.color.setXYZ(i*rows+row,crease,crease,crease);
      }}geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
    }
  }

  function plantFeet({phase,walking,running,gait=1,support,mode,bang,exitPose,limpWeight=0}){
    footDiagnostics=[];
    if(limpWeight>=.99){for(const leg of feet)leg.anchor=null;return;}
    if(mode==='drive'||mode==='exit'){
      root.updateWorldMatrix(true,true);for(const leg of feet){if(!leg.upper||!leg.lower||!leg.foot)continue;leg.anchor=null;leg.release=null;let target=new THREE.Vector3(leg.index?-.13:.13,.40,.60);
        if(mode==='exit'&&exitPose?.footTargets){target.fromArray(exitPose.footTargets[leg.index]);root.parent?.localToWorld(target);root.worldToLocal(target);}
        const result=reachPrologueArm(root,leg.upper,leg.lower,leg.foot,target,new THREE.Vector3(leg.index?-.2:.2,.65,.75),true);worldRotation(leg.foot,root.getWorldQuaternion(new THREE.Quaternion()).multiply(leg.levelRotation||new THREE.Quaternion()));footDiagnostics.push({side:leg.side,planted:mode==='exit'&&(leg.index?exitPose?.time>1.42:exitPose?.time>.93),position:result,target:target.toArray(),error:new THREE.Vector3().fromArray(result).distanceTo(target),locked:false});
      }return;}
    root.updateWorldMatrix(true,true);
    const discontinuity=support&&lastSupportTime!==null&&(support.time<lastSupportTime||support.time-lastSupportTime>.5);
    if(support)lastSupportTime=support.time;
    const stride=support?.stride||(running?.85:.48),full=stride*2,stance=running?.38:.62;
    for(const leg of feet){
      if(!leg.upper||!leg.lower||!leg.foot)continue;
      const wasMoving=leg.wasMoving||false,movingNow=!!(support?.moving??walking);
      const priorAnchor=leg.anchor?.clone();
      if(discontinuity){leg.stopFrom=null;leg.startFrom=null;leg.swing=null;leg.anchor=null;leg.anchorRotation=null;leg.lastRotation=null;leg.startRotation=null;leg.stopRotation=null;}
      if(support&&movingNow&&!wasMoving){leg.startFrom=leg.lastWorld?.clone();leg.startRotation=leg.lastRotation?.clone();}
      if(support&&!movingNow&&wasMoving){leg.stopFrom=leg.lastWorld?.clone();leg.stopRotation=leg.lastRotation?.clone();leg.stopPitch=leg.lastPitch||0;}
      const sole=samplePrologueSoleGait(phase,leg.index,{running,gait}),{cycle,u,swing}=sole;let planted=sole.planted;
      const front=full*stance*.5,ankleHeight=leg.ankleHeight??.045;
      const z=planted?front-full*u: -front+2*front*smooth(swing),lift=planted?0:Math.sin(swing*Math.PI)*(running?.17:.075);
      const target=new THREE.Vector3(leg.index?-.132:.129,ankleHeight+lift*gait,(walking?z:0)*gait);
      const world=root.localToWorld(target.clone()),rootRotation=root.getWorldQuaternion(new THREE.Quaternion());
      let supportRotation=rootRotation.clone();
      if(discontinuity||!walking||leg.release?.cycle!==cycle)leg.release=null;
      if(support?.anchors?.[leg.side]&&walking&&planted&&support.grounded&&!leg.release){world.fromArray(support.anchors[leg.side]);world.y=ankleHeight;root.parent?.localToWorld(world);if(leg.cycle!==cycle||!leg.anchorRotation)leg.anchorRotation=rootRotation.clone();leg.anchor=world.clone();leg.cycle=cycle;}
      else if(support&&walking&&planted&&support.grounded&&!leg.release&&!discontinuity&&leg.anchor&&leg.cycle===cycle)world.copy(leg.anchor);
      else if(support&&walking&&planted&&support.grounded&&!leg.release){leg.anchor=world.clone();leg.anchorRotation=rootRotation.clone();leg.cycle=cycle;}
      else{leg.anchor=null;leg.cycle=null;}
      if(leg.anchor&&leg.anchorRotation)supportRotation.copy(leg.anchorRotation);
      else if(leg.anchorRotation)supportRotation.copy(leg.anchorRotation).slerp(rootRotation,smooth(swing));
      if(support&&movingNow&&!planted&&!leg.release){
        if(!leg.swing||leg.swing.cycle!==cycle){
          let origin=priorAnchor||leg.lastWorld?.clone();
          if(support.anchors?.[leg.side]){origin=new THREE.Vector3().fromArray(support.anchors[leg.side]);root.parent?.localToWorld(origin);}
          leg.swing={cycle,from:origin||world.clone()};
        }
        const landing=root.localToWorld(new THREE.Vector3(leg.index?-.132:.129,ankleHeight,front));
        world.copy(leg.swing.from).lerp(landing,smooth(swing));const up=new THREE.Vector3(0,1,0).applyQuaternion(root.parent?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion());world.addScaledVector(up,Math.sin(swing*Math.PI)*(running?.17:.075));
      }else if(planted)leg.swing=null;
      const hip=leg.upper.getWorldPosition(new THREE.Vector3()),knee=leg.lower.getWorldPosition(new THREE.Vector3()),ankle=leg.foot.getWorldPosition(new THREE.Vector3());
      const reach=hip.distanceTo(knee)+knee.distanceTo(ankle);
      // A turn must release a support foot before the target becomes unreachable.
      // Let it swing to the next plant instead of stretching the leg or lifting a
      // supposedly locked ankle. This also handles the restart after headlights.
      if(support&&walking&&planted&&!leg.release&&(hip.distanceTo(world)>reach*.988||supportRotation.angleTo(rootRotation)>.9)){
        const start=leg.lastWorld?leg.lastWorld.clone():root.localToWorld(new THREE.Vector3(leg.index?-.132:.129,ankleHeight,0));
        const startDelta=start.clone().sub(hip);if(startDelta.length()>reach*.995)start.copy(hip).addScaledVector(startDelta.normalize(),reach*.995);
        leg.release={cycle,u,from:start};
      }
      if(leg.release&&support&&walking){
        const progress=unitClamp((u-leg.release.u)/Math.max(.01,1-leg.release.u)),landing=root.localToWorld(new THREE.Vector3(leg.index?-.132:.129,ankleHeight,front));
        world.copy(leg.release.from).lerp(landing,smooth(progress));const up=new THREE.Vector3(0,1,0).applyQuaternion(root.parent?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion());world.addScaledVector(up,Math.sin(progress*Math.PI)*(running?.17:.075));
        planted=false;leg.anchor=null;supportRotation.slerp(rootRotation,smooth(progress));
      }
      if(support&&!movingNow){
        const neutral=root.localToWorld(new THREE.Vector3(leg.index?-.132:.129,ankleHeight,0)),progress=smooth(1-gait);
        world.copy(leg.stopFrom||neutral).lerp(neutral,progress);
        const up=new THREE.Vector3(0,1,0).applyQuaternion(root.parent?.getWorldQuaternion(new THREE.Quaternion())||new THREE.Quaternion());world.addScaledVector(up,Math.sin(progress*Math.PI)*.035);
        planted=progress>=.999;leg.anchor=null;leg.release=null;supportRotation.copy(leg.stopRotation||leg.anchorRotation||rootRotation).slerp(rootRotation,progress);
      }else if(support&&gait<1&&leg.startFrom){world.lerp(leg.startFrom,1-smooth(gait));if(leg.startRotation)supportRotation.copy(leg.startRotation.clone().slerp(supportRotation,smooth(gait)));planted=false;}
      // The support anchor is the flat sole frame. Roll around the measured heel
      // or toe, then lift only enough to keep every calibrated shoe point above
      // the floor. Ankle-origin locking alone lets a rotating sole skate.
      const pitch=support&&!movingNow?(leg.stopPitch||0)*(1-smooth(1-gait)):walking?sole.pitch:0;
      const roll=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch);
      const pivot=(pitch<0?leg.heelPivot:leg.toePivot)?.clone()||new THREE.Vector3();
      const adjustment=pivot.clone().sub(pivot.clone().applyQuaternion(roll));
      let soleMin=Infinity;
      for(const point of leg.soleOffsets||[])soleMin=Math.min(soleMin,point.y*Math.cos(pitch)-point.z*Math.sin(pitch)+adjustment.y);
      if(Number.isFinite(soleMin))adjustment.y+=-ankleHeight-soleMin+.004;
      world.add(adjustment.applyQuaternion(supportRotation));
      const orientation=supportRotation.clone().multiply(roll).multiply(leg.levelRotation||new THREE.Quaternion());
      if(leg.toe&&leg.toeNeutral)leg.toe.quaternion.copy(leg.toeNeutral);
      const from=leg.foot.getWorldPosition(new THREE.Vector3());world.lerp(from,limpWeight);
      const desired=root.worldToLocal(world.clone());
      const contact=reachPrologueArm(root,leg.upper,leg.lower,leg.foot,desired,new THREE.Vector3(leg.index?-.13:.13,.45,.65),true);
      // Independent ankle orientation follows the heel/sole/toe support frame.
      worldRotation(leg.foot,orientation);
      root.updateWorldMatrix(true,true);
      const actual=leg.foot.getWorldPosition(new THREE.Vector3());leg.lastWorld=actual.clone().sub(adjustment);leg.lastRotation=supportRotation.clone();leg.lastPitch=pitch;leg.wasMoving=movingNow;
      footDiagnostics.push({side:leg.side,planted:walking?planted:true,error:actual.distanceTo(world),position:contact,target:desired.toArray(),locked:!!leg.anchor&&Math.abs(pitch)<1e-7,contactLocked:!!leg.anchor,contact:sole.contact,pitch,cycle,turnRelease:!!leg.release});
    }
  }

  function holdWheel(steer,wheelMatrix,weight=1) {
    root.updateWorldMatrix(true,true);wristTargets.length=0;
    const matrix=wheelMatrix||defaultActorWheelMatrix(root,steer);
    for(const arm of arms){
      if(!arm.upper||!arm.lower||!arm.hand)continue;
      const grip=wheelGrip(arm.side,matrix),currentRotation=arm.hand.getWorldQuaternion(new THREE.Quaternion());
      const currentWrist=arm.hand.getWorldPosition(new THREE.Vector3());
      const shoulder=arm.upper.getWorldPosition(new THREE.Vector3()),elbow=arm.lower.getWorldPosition(new THREE.Vector3());
      const upperLength=shoulder.distanceTo(elbow),lowerLength=elbow.distanceTo(currentWrist);
      const pole=new THREE.Vector3(arm.sign*.36,1.10,.22),worldPole=root.localToWorld(pole.clone());
      const radial=grip.contact.clone().sub(new THREE.Vector3().setFromMatrixPosition(matrix)).normalize();
      // hand +Y runs from wrist to knuckles; +Z is the back of this actual rig's
      // hand. The old radial-inward +Y target bent both wrists about 94 degrees.
      // Solve the palm contact and elbow together, keeping the wrist in line with
      // the forearm instead of independently forcing it onto the rim's frame.
      const forward=grip.contact.clone().sub(elbow).normalize(),back=new THREE.Vector3(),across=new THREE.Vector3();
      const wrist=new THREE.Vector3(),solvedElbow=new THREE.Vector3();
      for(let iteration=0;iteration<6;iteration++){
        back.copy(radial).addScaledVector(forward,-radial.dot(forward)).normalize();
        wrist.copy(grip.contact).addScaledVector(forward,arm.side==='L'?-.063:-.050).addScaledVector(back,.018);
        const direction=wrist.clone().sub(shoulder),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(upperLength-lowerLength)+.0001,upperLength+lowerLength-.0001);direction.normalize();
        const bend=worldPole.clone().sub(shoulder);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
        const along=(upperLength*upperLength-lowerLength*lowerLength+distance*distance)/(2*distance);
        solvedElbow.copy(shoulder).addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,upperLength*upperLength-along*along)));
        forward.copy(wrist).sub(solvedElbow).normalize();
      }
      const local=root.worldToLocal(wrist.clone().lerp(currentWrist,1-weight));
      reachPrologueArm(root,arm.upper,arm.lower,arm.hand,local,pole,true);
      forward.copy(arm.hand.getWorldPosition(new THREE.Vector3())).sub(arm.lower.getWorldPosition(new THREE.Vector3())).normalize();
      back.copy(radial).addScaledVector(forward,-radial.dot(forward)).normalize();across.crossVectors(forward,back).normalize();
      const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,forward,back));
      const lowerRotation=rotation.clone().multiply(arm.wheelForearmFrameInverse);
      worldRotation(arm.lower,arm.lower.getWorldQuaternion(new THREE.Quaternion()).slerp(lowerRotation,weight));
      worldRotation(arm.hand,currentRotation.slerp(rotation,weight));
      // Set from the neutral rig instead of accumulating asymmetric clip curls.
      for(const finger of arm.fingers){const current=finger.quaternion.clone(),neutral=finger.userData.wheelNeutral;finger.quaternion.copy(neutral);finger.rotateX(arm.side==='L'?-.90:-.68);finger.quaternion.slerp(current,1-weight);}
      if(arm.thumb){const current=arm.thumb.quaternion.clone();arm.thumb.quaternion.copy(arm.thumb.userData.wheelNeutral);arm.thumb.quaternion.slerp(current,1-weight);}
      wristTargets.push(local.toArray());
    }
  }

  // Capture the planted ankle frame once from the neutral pose. Ground contact
  // must not inherit the Walk clip's rolling ankle while the sole is locked.
  sample('Idle',0);root.updateMatrixWorld(true);
  for(const leg of feet)if(leg.foot){
    leg.levelRotation=root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(leg.foot.getWorldQuaternion(new THREE.Quaternion()));
    leg.toeNeutral=leg.toe?.quaternion.clone();leg.soleOffsets=[];
    const ankle=root.worldToLocal(leg.foot.getWorldPosition(new THREE.Vector3()));
    model.traverse(mesh=>{
      if(!mesh.isSkinnedMesh||!/shoe/i.test(mesh.name))return;
      mesh.skeleton.update();const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      const jointIds=new Set(mesh.skeleton.bones.map((bone,index)=>bone===leg.foot||bone===leg.toe?index:-1));
      for(let vertex=0;vertex<ids.count;vertex++){
        let weight=0;for(let slot=0;slot<4;slot++)if(jointIds.has(ids.getComponent(vertex,slot)))weight+=weights.getComponent(vertex,slot);
        if(weight>.75)leg.soleOffsets.push(root.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(vertex,new THREE.Vector3()))).sub(ankle));
      }
    });
    const bottom=Math.min(...leg.soleOffsets.map(point=>point.y));leg.ankleHeight=Number.isFinite(bottom)?-bottom+.004:.045;
    const lowestAt=pitch=>leg.soleOffsets.reduce((best,point)=>!best||point.y*Math.cos(pitch)-point.z*Math.sin(pitch)<best.y*Math.cos(pitch)-best.z*Math.sin(pitch)?point:best,null)?.clone();
    leg.heelPivot=lowestAt(-.20);leg.toePivot=lowestAt(.30);
  }
  for(const state of sampled){state.position.copy(state.bone.position);state.quaternion.copy(state.bone.quaternion);state.scale.copy(state.bone.scale);}
  ensureLids();blinkLids(0);
  for(const arm of arms){
    for(const finger of [...arm.fingers,arm.thumb].filter(Boolean))finger.userData.wheelNeutral=finger.quaternion.clone();
    if(!arm.lower||!arm.hand)continue;
    // Calibrate the forearm's longitudinal and dorsal axes from the source rig,
    // whose hand is an independent IK child rather than a forearm child.
    const inverse=arm.lower.getWorldQuaternion(new THREE.Quaternion()).invert();
    const forward=arm.hand.getWorldPosition(new THREE.Vector3()).sub(arm.lower.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(inverse);
    const back=new THREE.Vector3(0,0,1).applyQuaternion(arm.hand.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(inverse);
    back.addScaledVector(forward,-back.dot(forward)).normalize();
    const across=new THREE.Vector3().crossVectors(forward,back).normalize();
    arm.wheelForearmFrameInverse=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,forward,back)).invert();
  }

  return {
    root,
    pose({time = 0, phase = 0, mode = 'standing', speaking = false, distress = 0, look = 0, reduced = false, corpse = false, dissolve = 0, steer = 0, wheelMatrix = null, bang = 0, bangTargets = null, performance = {}, crouch = 0, runWeight = mode==='run'?1:0, gait = null, support = null, exitPose = null, limpWeight = mode==='limp'?1:0} = {}) {
      if (disposed) return;
      for (const state of sampled) {state.bone.position.copy(state.position); state.bone.quaternion.copy(state.quaternion); state.bone.scale.copy(state.scale);}
      lastPose = mode; lastCorpse = !!corpse; decay.value = clamp(dissolve, 0, 1);
      for (const {material, color, skin} of materials.values()) {
        material.color.copy(color);
        if (corpse) material.color.multiply(new THREE.Color(skin ? 0x71816b : 0xa6aca3));
      }
      // The cast and authored escorts share local +Z as their forward direction.
      fit.position.set(0, 0, 0); fit.rotation.set(0, 0, 0);
      const walking = mode === 'walk' || mode === 'run';
      const walkWeight=gait===null?(walking?1:0):unitClamp(gait);
      if(mode==='drive'){
        sample('Seated',reduced?0:time*.12);fit.position.set(0,.19,.075);
      }else if(mode==='exit'){
        const transfer=exitPose?.transfer??1;
        sample('Idle',0,transfer,'Seated',0);fit.position.set(0,.19*(1-transfer),.075*(1-transfer));
        fit.rotation.z=-.10*Math.sin(transfer*Math.PI);
      }else if(walking||walkWeight>0){
        sample(mode==='run'?'Run':'Walk',(Number.isFinite(phase)?phase:0)/TAU*clips.get('Walk').duration,walkWeight);
        fit.position.y=(-.095+.007*Math.cos(phase*2))*walkWeight;
        fit.position.x=.008*Math.sin(phase)*walkWeight;
        fit.rotation.z=.014*Math.sin(phase)*walkWeight;
        fit.rotation.y=.021*Math.sin(phase)*walkWeight;
        if(mode==='run'){fit.rotation.x=.10;fit.position.y=-.095+Math.max(0,Math.sin(phase*2))*.02;}
      }else sample('Idle',0);

      for (const state of sampled) {state.position.copy(state.bone.position); state.quaternion.copy(state.bone.quaternion); state.scale.copy(state.bone.scale);}
      wristTargets.length=0;

      if(torso&&walkWeight>0&&mode!=='drive'&&mode!=='exit'){torso.rotation.y-=.032*Math.sin(phase)*walkWeight;torso.rotation.z-=.010*Math.sin(phase)*walkWeight;torso.rotation.x+=.014*walkWeight;}
      if(torso){torso.rotation.x+=(mode==='breathe'?-.035:0)-clamp(distress,0,1)*.018+(performance.breath||0);}
      if(mode!=='drive'&&mode!=='bang'&&mode!=='exit'&&limpWeight<.5){const arm=arms[1],emphasis=performance.emphasis||0;if(arm.upper)arm.upper.rotation.x-=.12*emphasis;if(arm.lower)arm.lower.rotation.x-=.15*emphasis;}
      if(runWeight>0&&mode!=='drive'&&mode!=='exit'){
        root.updateWorldMatrix(true,true);
        for(const [index,arm]of arms.entries())if(arm.upper&&arm.lower&&arm.hand){
          const target=new THREE.Vector3(arm.sign*.25,1.10+.04*Math.sin(phase),-.025+.22*Math.cos(phase+(index?0:Math.PI)));
          const current=root.worldToLocal(arm.hand.getWorldPosition(new THREE.Vector3()));target.lerp(current,1-unitClamp(runWeight));
          reachPrologueArm(root,arm.upper,arm.lower,arm.hand,target,new THREE.Vector3(arm.sign*.43,.94,-.23),true);
          for(const finger of arm.fingers)finger.rotation.x-=.25*unitClamp(runWeight);
        }
      }
      if (head) {
        root.updateWorldMatrix(true, true);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(actorRotation));
        headTilt.setFromAxisAngle(up, clamp(look, -.72, .72));
        worldRotation(head, headTilt.multiply(head.getWorldQuaternion(new THREE.Quaternion())));
        head.rotation.x+=(performance.nod||0)+(corpse?.16:0)+.65*limpWeight;
      }
      speechValue=speaking?sampleSpeech(performance.lineId,performance.lineOffset):0;
      if(mouth)mouth.rotation.x+=speechValue*(reduced?.045:.10);
      root.updateWorldMatrix(true,true);for(const eye of eyes){const up=new THREE.Vector3(0,1,0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));worldRotation(eye,new THREE.Quaternion().setFromAxisAngle(up,clamp(performance.eyeLook||0,-.18,.18)).multiply(eye.getWorldQuaternion(new THREE.Quaternion())));}
      ensureLids();blinkLids(corpse?0:performance.blink||0);
      if(limpWeight){fit.rotation.x+=.10*limpWeight;fit.rotation.z+=(police?.05:-.05)*limpWeight;for(const arm of arms)if(arm.hand)arm.hand.rotation.x+=.35*limpWeight;}
      fit.position.y-=.24*unitClamp(crouch);fit.rotation.x+=.065*unitClamp(crouch);
      if(mode==='bang'){if(torso)torso.rotation.x-=.035*bang;fit.position.y-=.018*bang;}
      plantFeet({phase,walking:walking||walkWeight>.001,running:mode==='run',gait:walkWeight,support,mode,bang,exitPose,limpWeight});
      windowContacts = []; windowTargets = [];
      if (mode === 'bang' && bangTargets) for (const [index, arm] of arms.entries()) {
        if (!arm.upper || !arm.lower || !arm.hand) continue;
        const contact = new THREE.Vector3().fromArray(bangTargets[index]);
        // Calibrated from the shipped hand/finger skin's forward extent (metres),
        // not the wrist origin: keep the visible surface outside the pane.
        const skinOffset=index===0?.014:.010;
        const target=contact.clone();target.z-=.20*(1-clamp(bang,0,1))+skinOffset;
        windowTargets.push(contact.toArray());
        const wrist=reachPrologueArm(root,arm.upper,arm.lower,arm.hand,target,new THREE.Vector3(arm.sign*.40,1.1,.12),true);windowContacts.push([wrist[0],wrist[1],wrist[2]+skinOffset]);
        for (const finger of arm.fingers) finger.rotation.x = 0;
      }
      // The final solve happens after breathing/torso adjustments, so no later
      // additive motion can pull the skinned hands off the wheel.
      if(mode==='drive')holdWheel(steer,wheelMatrix);
      else if(mode==='exit'&&(exitPose?.time??1)<.36)holdWheel(steer,wheelMatrix,1-smooth((exitPose?.time||0)/.36));
      // SkinnedMesh overrides updateMatrixWorld to refresh bindMatrixInverse.
      // updateWorldMatrix alone moves the control bones but leaves CPU skinning
      // and any renderer using the current matrices with the old mesh transform.
      root.updateMatrixWorld(true);
    },
    // Interactive contacts include history. Capture it with a checkpoint rather
    // than pretending that an arbitrary timestamp contains prior support events.
    capturePoseState:()=>({version:1,lastSupportTime,feet:feet.map(leg=>({side:leg.side,cycle:leg.cycle,anchor:leg.anchor?.toArray()||null,anchorRotation:leg.anchorRotation?.toArray()||null,lastRotation:leg.lastRotation?.toArray()||null,startRotation:leg.startRotation?.toArray()||null,stopRotation:leg.stopRotation?.toArray()||null,lastPitch:leg.lastPitch||0,stopPitch:leg.stopPitch||0,lastWorld:leg.lastWorld?.toArray()||null,wasMoving:!!leg.wasMoving,stopFrom:leg.stopFrom?.toArray()||null,startFrom:leg.startFrom?.toArray()||null,swing:leg.swing?{cycle:leg.swing.cycle,from:leg.swing.from.toArray()}:null,release:leg.release?{cycle:leg.release.cycle,u:leg.release.u,from:leg.release.from.toArray()}:null}))}),
    restorePoseState(state){
      if(state?.version!==1||!Array.isArray(state.feet)||state.feet.length!==2)return false;
      const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?new THREE.Vector3().fromArray(v):null;
      lastSupportTime=Number.isFinite(state.lastSupportTime)?state.lastSupportTime:null;
      const rotation=value=>Array.isArray(value)&&value.length===4?new THREE.Quaternion().fromArray(value):null;
      for(const leg of feet){const data=state.feet.find(f=>f.side===leg.side);if(!data)return false;leg.cycle=data.cycle;leg.anchor=vector(data.anchor);leg.anchorRotation=rotation(data.anchorRotation);leg.lastRotation=rotation(data.lastRotation);leg.startRotation=rotation(data.startRotation);leg.stopRotation=rotation(data.stopRotation);leg.lastPitch=data.lastPitch||0;leg.stopPitch=data.stopPitch||0;leg.lastWorld=vector(data.lastWorld);leg.wasMoving=!!data.wasMoving;leg.stopFrom=vector(data.stopFrom);leg.startFrom=vector(data.startFrom);leg.swing=data.swing&&vector(data.swing.from)?{cycle:data.swing.cycle,from:vector(data.swing.from)}:null;leg.release=data.release&&vector(data.release.from)?{cycle:data.release.cycle,u:data.release.u,from:vector(data.release.from)}:null;}
      return true;
    },
    diagnostics:() => ({name,identity,assetId:gltf.asset?.extras?.cinematicCharacter?`cast-${identity}.glb`:'cast.glb', kind:police ? 'uniformed police officer' : 'civilian father', pose:lastPose, corpse:lastCorpse, dissolve:decay.value, provenance:TEXTURED_CAST_PROVENANCE, textured:true, clip:clipName, height:1.8,blends:{...blendDiagnostics},speech:speechValue,feet:footDiagnostics,wristTargets:wristTargets.map(point => [...point]),windowTargets,windowContacts}),
    dispose() {
      if (disposed) return;
      disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model);
      for (const skeleton of skeletons) skeleton.dispose();for(const geometry of lidGeometry)geometry.dispose();
      // The parent disposes cloned materials while traversing its scene. Shared
      // geometry and texture disposal happens once, in the parent's asset owner.
    },
  };
}
