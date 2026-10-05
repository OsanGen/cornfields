import * as THREE from 'three';
export const ROADSIDE_DOG=Object.freeze({position:[4.25,0,3.95],yaw:.80,pole:[3.02,.70,3.75],tetherLength:2.15});
// One fixed presentation phase owns recorded sound and jaw movement. RMS samples are
// measured from the approved unchanged PCM file; this is not listening QA.
export const ROADSIDE_DOG_SOUND=Object.freeze({cycleSeconds:9.4,durationSeconds:89902/44100,byteCap:256*1024,envelopeStep:.02});
const BARK_ENVELOPE=Object.freeze([0.728,0.933,0.685,0.465,0.586,0.286,0.421,0.311,0.456,0.406,0.082,0.214,0.131,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.934,0.996,0.711,0.505,0.311,0.347,0.214,0.509,0.535,0.344,0.263,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.327,0.594,0.707,0.323,0.255,0.265,0.121,0.212,0.288,0.175,0.218,0.224,0.193,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.513,0.733,1.0,0.734,0.591,0.483,0.366,0.178,0.098,0.371,0.579,0.652,0.512,0.263,0.335,0.211,0.026,0.213]);
/** No timers or gameplay actors. The body/paws remain planted throughout. */
export function roadsideDogPose(frame={}){
 const t=Math.max(0,Number(frame.elapsed??frame.motion?.time??frame.time)||0),active=!frame.gameplay&&['emergence','bang','cabin','exit','flashlight','walk','history','disappearance'].includes(frame.chapter),phase=t%ROADSIDE_DOG_SOUND.cycleSeconds,cycle=Math.floor(t/ROADSIDE_DOG_SOUND.cycleSeconds),soundWindow=active&&phase<ROADSIDE_DOG_SOUND.durationSeconds;
 const cursor=phase/ROADSIDE_DOG_SOUND.envelopeStep,index=Math.floor(cursor),mix=cursor-index,bark=soundWindow?(BARK_ENVELOPE[index]||0)*(1-mix)+(BARK_ENVELOPE[index+1]||0)*mix:0;
 return {active,bark,phase,cycle,soundWindow,head:frame.reduced?0:Math.sin(t*.53)*.025+bark*.055,jaw:-bark*.22,tail:frame.reduced?0:Math.sin(t*1.3)*.08};
}
export function createRoadsideDog(parent,{heightAt=()=>0}={}){
 const root=new THREE.Group();root.name='Tethered roadside dog';root.position.fromArray(ROADSIDE_DOG.position);root.position.y=heightAt(root.position.x,root.position.z);root.rotation.y=ROADSIDE_DOG.yaw;parent.add(root);
 const ropeMaterial=new THREE.MeshStandardMaterial({color:0x8e7956,roughness:.94}),ropeGeometry=new THREE.BufferGeometry();const rope=new THREE.Mesh(ropeGeometry,ropeMaterial);rope.name='Visible collar tether to lightpole';parent.add(rope);
 let asset=null,head=null,jaw=null,tail=null,collar=null,disposed=false,tetherBuilt=false;
 const stats={status:'loading',visible:false,barkMotion:0,pawsPlanted:true,tetherLength:0,audio:'owned by prologue audio bus; listening unverified'};
 return {root,stats,accept(gltf){if(disposed)return;asset=gltf.scene;root.add(asset);head=asset.getObjectByName('DogHead');jaw=asset.getObjectByName('DogJaw');tail=asset.getObjectByName('DogTail');collar=asset.getObjectByName('DogCollarTether');if(!head||!jaw||!tail||!collar){root.remove(asset);asset=null;stats.status='failed';return;}stats.status='ready';},
 update(frame,visible=true){if(disposed)return;const p=roadsideDogPose(frame);root.visible=rope.visible=visible&&!!asset;stats.visible=root.visible;if(!asset)return;head.rotation.x=p.head;jaw.rotation.x=p.jaw;tail.rotation.y=p.tail;stats.barkMotion=p.bark;root.updateMatrixWorld(true);
 if(!tetherBuilt){const start=parent.worldToLocal(collar.getWorldPosition(new THREE.Vector3())),end=new THREE.Vector3(...ROADSIDE_DOG.pole),points=[];for(let i=0;i<17;i++){const t=i/16,q=start.clone().lerp(end,t);q.y-=Math.sin(Math.PI*t)*.20;points.push(q);}const curve=new THREE.CatmullRomCurve3(points);stats.tetherLength=curve.getLength();rope.geometry.dispose();rope.geometry=new THREE.TubeGeometry(curve,16,.008,5,false);rope.geometry.computeBoundingSphere();tetherBuilt=true;}},
 dispose(){if(disposed)return;disposed=true;root.removeFromParent();rope.removeFromParent();rope.geometry.dispose();ropeMaterial.dispose();stats.status='disposed';stats.visible=false;}
 };
}
