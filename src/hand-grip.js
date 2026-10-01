import * as THREE from 'three';

// Wrist coordinates in the shipped rig, in metres. The knife handle runs along
// this frame's Y axis; the viewmodel pivot aligns that axis with the blade.
export const HAND_GRIP_CONTACT=Object.freeze({
  pistol:Object.freeze([-.032,-.009,-.104]),
  knife:Object.freeze([-.029,-.008,-.107]),
});

const profiles={
  pistol:{
    // The index reaches the actual trigger, instead of curling behind it.
    index:[0,25,80],middle:[52,137,185],ring:[55,143,192],pinky:[57,142,195],
    thumb:[[-.020,.031,-.071],[-.051,.032,-.101],[-.057,.030,-.128]],
  },
  knife:{
    index:[60,120,200],middle:[55,130,202],ring:[40,130,190],pinky:[10,65,110],
    thumb:[[-.020,.034,-.070],[-.051,.030,-.102],[-.057,.014,-.127]],
  },
};
const restPoses=new WeakMap();
const fittedForearms=new WeakSet();

/** Route only the knife forearm back toward the body, past the camera edge. */
export function fitKnifeForearm(arm){
  if(fittedForearms.has(arm))return;fittedForearms.add(arm);
  // SkinnedMesh updates its attached bind inverse in updateMatrixWorld(), not
  // Object3D.updateWorldMatrix(). Match the renderer before classifying vertices.
  arm.updateWorldMatrix(true,false);arm.updateMatrixWorld(true);
  const frameInverse=arm.parent?arm.parent.matrixWorld.clone().invert():new THREE.Matrix4();
  arm.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    mesh.skeleton.update();
    const source=mesh.geometry,position=source.attributes.position,indices=source.attributes.skinIndex,weights=source.attributes.skinWeight;
    const geometry=source.clone(),output=geometry.attributes.position,changed=new Set();
    const blend=new THREE.Matrix4(),toWrist=new THREE.Matrix4(),p=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      blend.elements.fill(0);
      for(let j=0;j<4;j++){
        const weight=weights.getComponent(i,j),offset=indices.getComponent(i,j)*16;
        for(let k=0;k<16;k++)blend.elements[k]+=mesh.skeleton.boneMatrices[offset+k]*weight;
      }
      toWrist.copy(frameInverse).multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(blend).multiply(mesh.bindMatrix);
      p.fromBufferAttribute(position,i).applyMatrix4(toWrist);
      if(p.z<=.05)continue;
      // The imported extension points away during the raised knife pose. Bend
      // smoothly behind the wrist; preserve every finger and wrist vertex.
      const along=p.z-.05;p.y+=.35*along*along/(along+.12);
      p.applyMatrix4(toWrist.invert());output.setXYZ(i,p.x,p.y,p.z);changed.add(i);
    }
    if(!changed.size){geometry.dispose();return;}
    // Preserve the source's complete vertex layout and tangent frame. A small
    // bend needs no material/shader change and must not affect hand rendering.
    output.needsUpdate=true;mesh.geometry=geometry;
  });
}

/** Fit only joint rotations. Skin weights, bone lengths and the source rig stay intact. */
export function applyHandGrip(arm,kind='pistol',side='R'){
  const profile=profiles[kind];if(!profile)throw new Error('Unknown hand grip: '+kind);
  const names=[...['index','middle','ring','pinky'].flatMap(f=>[1,2,3].map(n=>`f_${f}0${n}${side}`)),...[1,2,3].map(n=>`thumb0${n}${side}`)];
  const bones=names.map(name=>arm.getObjectByName(name));
  if(bones.some(bone=>!bone?.isBone))return null;
  let rest=restPoses.get(arm);
  if(!rest){rest=bones.map(bone=>bone.quaternion.clone());restPoses.set(arm,rest);}
  bones.forEach((bone,i)=>bone.quaternion.copy(rest[i]));
  arm.updateWorldMatrix(true,true);
  const frame=arm.parent?.matrixWorld||new THREE.Matrix4(),frameRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(frame));
  const mirror=side==='L'?-1:1;
  const origin=new THREE.Vector3(),tip=new THREE.Vector3(),desired=new THREE.Vector3(),rotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),delta=new THREE.Quaternion();
  function aim(bone,direction){
    const child=bone.children.find(child=>child.isBone);if(!child)return;
    bone.getWorldPosition(origin);child.getWorldPosition(tip);tip.sub(origin).normalize();
    desired.copy(direction).applyQuaternion(frameRotation).normalize();
    delta.setFromUnitVectors(tip,desired);bone.getWorldQuaternion(rotation);bone.parent.getWorldQuaternion(parentRotation);
    bone.quaternion.copy(parentRotation.invert().multiply(delta).multiply(rotation));
    bone.updateWorldMatrix(false,true);
  }
  for(const finger of ['index','middle','ring','pinky']){
    const lift=kind==='pistol'?({index:.03,middle:0,ring:.04,pinky:.15}[finger]):0;
    profile[finger].forEach((degrees,i)=>{
      const angle=THREE.MathUtils.degToRad(degrees);
      aim(arm.getObjectByName(`f_${finger}0${i+1}${side}`),new THREE.Vector3(-Math.sin(angle)*mirror,lift,-Math.cos(angle)));
    });
  }
  const inverseFrame=frame.clone().invert();
  profile.thumb.forEach((point,i)=>{
    const bone=arm.getObjectByName(`thumb0${i+1}${side}`);
    bone.getWorldPosition(origin).applyMatrix4(inverseFrame);
    aim(bone,new THREE.Vector3(point[0]*mirror,point[1],point[2]).sub(origin));
  });
  return {kind,side,contact:HAND_GRIP_CONTACT[kind].map((v,i)=>i===0?v*mirror:v)};
}
