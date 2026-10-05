import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

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
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.054,.063,.052,24),hubMaterial);hub.name='Fitted wheel padded hub';hub.rotation.x=Math.PI/2;steering.add(hub);
  for(const angle of [Math.PI/2,-Math.PI/2,Math.PI]){
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(.028,.143,.025),metal);spoke.name='Fitted wheel metal spoke';spoke.position.set(Math.sin(angle)*.113,Math.cos(angle)*.113,-.008);spoke.rotation.z=-angle;steering.add(spoke);
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

/** Original fitted receiver: recessed display, raised presets and tactile knob.
 * The footprint and knob center retain the approved cabin contact anchors. */
export function createEntertainmentRadio(){
 const group=new THREE.Group();group.name='Dashboard entertainment radio';group.position.set(.08,.83,-.705);
 const bodyParts=[];
 const piece=(w,h,d,x=0,y=0,z=0)=>{const g=new THREE.BoxGeometry(w,h,d).translate(x,y,z);bodyParts.push(g);};
 // Open fascia surrounds the genuinely recessed glass; no panel over its face.
 piece(.35,.12,.046,0,0,-.0145);piece(.35,.012,.04,0,.054,.022);piece(.35,.012,.04,0,-.054,.022);
 piece(.015,.096,.04,-.1675,0,.022);piece(.015,.096,.04,.1675,0,.022);
 piece(.077,.084,.039,.1245,0,.0205);piece(.014,.084,.039,.078,0,.0205);
 for(let i=0;i<5;i++)piece(.027,.012,.008,-.115+i*.038,-.031,.039);
 for(const y of [-.046,.047])piece(.300,.002,.003,0,y,.043);
 const shell=new THREE.MeshStandardMaterial({name:'Original molded dashboard receiver fascia',color:0x29332f,roughness:.68,metalness:.24});
 const body=new THREE.Mesh(mergeGeometries(bodyParts),shell);body.name='Fitted recessed radio fascia and preset buttons';for(const g of bodyParts)g.dispose();group.add(body);
 let map=null;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#718768';ctx.fillRect(0,0,512,128);ctx.fillStyle='#1a2b1c';ctx.font='18px sans-serif';ctx.fillText?.('FM   88      92      96      100      104      108',10,29);
  for(let i=0;i<41;i++)ctx.fillRect(16+i*12,45,2,i%5===0?25:13);ctx.fillRect(207,38,4,46);ctx.font='15px sans-serif';ctx.fillText?.('TUNE       •       AM / FM',70,111);
  map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 }
 const display=new THREE.Mesh(new THREE.PlaneGeometry(.225,.057),new THREE.MeshBasicMaterial({map,color:0x718768,toneMapped:false}));display.name='Entertainment radio recessed scale';display.position.set(-.039,.014,.034);group.add(display);
 // Rotate around the cylinder's real local Y axis. Contact is on its front cap.
 const knobParts=[];
 const addKnob=(g,color)=>{const c=new THREE.Color(color);g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>c.toArray()).flat(),3));knobParts.push(g);};
 addKnob(new THREE.CylinderGeometry(.024,.025,.025,24),0x8c9992);
 addKnob(new THREE.TorusGeometry(.022,.0025,5,24).rotateX(Math.PI/2).translate(0,.013,0),0x596660);
 addKnob(new THREE.BoxGeometry(.003,.002,.012).translate(0,.015,.011),0x18221e);
 const knob=new THREE.Mesh(mergeGeometries(knobParts),new THREE.MeshStandardMaterial({name:'Tactile receiver knob with index',vertexColors:true,roughness:.47,metalness:.45}));for(const g of knobParts)g.dispose();knob.name='Entertainment radio off knob';knob.rotation.x=Math.PI/2;knob.position.set(.125,0,.053);group.add(knob);
 const contact=new THREE.Object3D();contact.name='Dashboard knob front cap contact';contact.position.set(0,.016,0);knob.add(contact);
 return {group,knob,contact,display,update(wake){display.material.color.setHex(wake.radioOn?(map?0xffffff:0x718768):0x0b1511);knob.rotation.y=-wake.turn*.55;}};
}
