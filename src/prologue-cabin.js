import * as THREE from 'three';

// The rendered rim, column, grip targets and fallback use this single cabin fit.
// Metres in the parked cruiser's coordinates. The wheel is above the lowered
// dashboard, rather than intersecting the dashboard's textured upper shell.
export const CABIN_FIT=Object.freeze({
  wheelCenter:Object.freeze([-.45,.905,-.435]),wheelTilt:-.35,rimRadius:.190,rimTube:.021,
  driverSeat:Object.freeze([-.45,-.38,.09]),driverYaw:Math.PI,
});
export const steeringAngle=steer=>Math.max(-1.2,Math.min(1.2,(Number(steer)||0)*12));
export function steeringMatrix(steer=0){
  return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(CABIN_FIT.wheelCenter),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(CABIN_FIT.wheelTilt,0,steeringAngle(steer))),new THREE.Vector3(1,1,1));
}
export function defaultActorWheelMatrix(root,steer=0){
  root.updateWorldMatrix(true,false);
  const seat=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(CABIN_FIT.driverSeat),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),CABIN_FIT.driverYaw),new THREE.Vector3(1,1,1));
  return root.matrixWorld.clone().multiply(seat.invert()).multiply(steeringMatrix(steer));
}
export function createCabinWheel(){
  const assembly=new THREE.Group();assembly.name='Fitted steering assembly';
  assembly.position.fromArray(CABIN_FIT.wheelCenter);assembly.rotation.x=CABIN_FIT.wheelTilt;
  const steering=new THREE.Group();steering.name='Driver steering wheel';assembly.add(steering);
  const leather=new THREE.MeshStandardMaterial({name:'Readable steering leather',color:0x58636a,roughness:.76,metalness:.04});
  const metal=new THREE.MeshStandardMaterial({name:'Brushed steering spokes',color:0x9da6a5,roughness:.43,metalness:.58});
  const hubMaterial=new THREE.MeshStandardMaterial({name:'Wheel hub charcoal',color:0x323e43,roughness:.8});
  const rim=new THREE.Mesh(new THREE.TorusGeometry(CABIN_FIT.rimRadius,CABIN_FIT.rimTube,12,64),leather);rim.name='Fitted wheel leather rim';steering.add(rim);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.057,.063,.05,24),hubMaterial);hub.name='Fitted wheel padded hub';hub.rotation.x=Math.PI/2;steering.add(hub);
  for(const angle of [Math.PI/2,-Math.PI/2,Math.PI]){
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(.022,.158,.021),metal);spoke.name='Fitted wheel metal spoke';spoke.position.set(Math.sin(angle)*.113,Math.cos(angle)*.113,-.008);spoke.rotation.z=-angle;steering.add(spoke);
  }
  const column=new THREE.Mesh(new THREE.CylinderGeometry(.027,.034,.15,14),hubMaterial);column.name='Fitted steering column';column.rotation.x=Math.PI/2;column.position.z=-.091;assembly.add(column);
  // A small physical top seam adds an orientation cue without lighting the wheel.
  const seam=new THREE.Mesh(new THREE.BoxGeometry(.014,.018,.045),metal);seam.name='Wheel top stitching';seam.position.y=CABIN_FIT.rimRadius;steering.add(seam);
  return {assembly,steering,rim};
}

export function wheelGrip(side,wheelMatrix){
  const sign=side==='L'?-1:1;
  const radial=new THREE.Vector3(sign*.91,.4146,0).normalize(),inward=radial.clone().negate();
  const normal=new THREE.Vector3(0,0,1);
  // The hand +Y axis follows the palm toward the fingers. The visible palm is
  // about 50 mm ahead of the wrist, so it settles on the actual torus surface.
  const wrist=radial.clone().multiplyScalar(CABIN_FIT.rimRadius+(side==='L'?.056:.043)).addScaledVector(normal,side==='L'?.017:.012);
  const across=new THREE.Vector3().crossVectors(inward,normal).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,inward,normal));
  const worldRotation=new THREE.Quaternion().setFromRotationMatrix(wheelMatrix).multiply(rotation);
  return {wrist:wrist.applyMatrix4(wheelMatrix),rotation:worldRotation,contact:radial.multiplyScalar(CABIN_FIT.rimRadius).applyMatrix4(wheelMatrix)};
}

/** The entertainment receiver is distinct from the later handheld dispatch set. */
export function createEntertainmentRadio(){
 const group=new THREE.Group();group.name='Dashboard entertainment radio';group.position.set(.08,.83,-.705);
 const shell=new THREE.MeshStandardMaterial({color:0x171c1b,roughness:.61,metalness:.2}),trim=new THREE.MeshStandardMaterial({color:0x82908b,roughness:.36,metalness:.6});
 const body=new THREE.Mesh(new THREE.BoxGeometry(.35,.12,.075),shell);group.add(body);
 const display=new THREE.Mesh(new THREE.PlaneGeometry(.19,.038),new THREE.MeshBasicMaterial({color:0x718768,toneMapped:false}));display.name='Entertainment radio display';display.position.set(-.032,.016,.039);group.add(display);
 const knob=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.025,20),trim);knob.name='Entertainment radio off knob';knob.rotation.x=Math.PI/2;knob.position.set(.125,0,.053);group.add(knob);
 const notch=new THREE.Mesh(new THREE.BoxGeometry(.003,.014,.003),shell);notch.position.set(0,.025,-.013);knob.add(notch);
 for(let i=0;i<5;i++){const button=new THREE.Mesh(new THREE.BoxGeometry(.019,.008,.005),trim);button.position.set(-.115+i*.040,-.029,.04);group.add(button);}
 return {group,knob,display,update(wake){display.material.color.setHex(wake.radioOn?0x718768:0x0b1511);knob.rotation.y=-wake.turn*.55;}};
}
