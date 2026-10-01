import * as THREE from 'three';
import {doorLeaf} from './corn-world.js';

/** Repeated gates and physical corn partitions: geometry comes from collision data. */
export function createCornView(scene,maze){
  const w=maze.cornWorld,group=new THREE.Group();group.name='Physical corn boundary';scene.add(group);
  const wood=new THREE.MeshStandardMaterial({color:0x777260,roughness:1});
  const metal=new THREE.MeshStandardMaterial({color:0x323934,roughness:.8,metalness:.25});
  const foliage=new THREE.MeshStandardMaterial({color:0x293527,roughness:1});
  const dummy=new THREE.Object3D(),doors=w.doors,solidDoors=doors.filter(d=>!d.permanentOpen);
  const leaf=new THREE.InstancedMesh(new THREE.BoxGeometry(1,2.25,.06).translate(.5,1.125,0),wood,solidDoors.length);
  const rails=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.09,.085).translate(.5,0,0),wood,solidDoors.length*2);
  const handles=new THREE.InstancedMesh(new THREE.BoxGeometry(.04,.16,.115),metal,solidDoors.length);
  for(const mesh of [leaf,rails,handles]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);}
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,2.5,.10),wood,doors.length*2);
  doors.forEach((d,i)=>{for(let s=0;s<2;s++){
    const p=s?doorLeaf(d,0).b:d.hinge;dummy.position.set(p.x,1.25,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i*2+s,dummy.matrix);
  }});posts.computeBoundingSphere();group.add(posts);
  const partitions=new THREE.InstancedMesh(new THREE.BoxGeometry(1,2.8,.05),foliage,w.segments.length);
  w.segments.forEach(({a,b},i)=>{
    dummy.position.set((a.x+b.x)/2,1.4,(a.z+b.z)/2);dummy.rotation.set(0,Math.atan2(-(b.z-a.z),b.x-a.x),0);
    dummy.scale.set(Math.hypot(b.x-a.x,b.z-a.z),1,1);dummy.updateMatrix();partitions.setMatrixAt(i,dummy.matrix);
  });partitions.computeBoundingSphere();group.add(partitions);
  const previous=new Float32Array(solidDoors.length).fill(-10);
  function update(game){
    let changed=false;
    solidDoors.forEach((d,i)=>{
      const s=game?.cornDoors[d.index],amount=(s?.amount||0)*(s?.swing||1);
      if(Math.abs(previous[i]-amount)<.00001)return;previous[i]=amount;changed=true;
      const {a,b}=doorLeaf(d,amount),angle=Math.atan2(-(b.z-a.z),b.x-a.x);
      dummy.position.set(a.x,0,a.z);dummy.rotation.set(0,angle,0);dummy.scale.set(d.width,1,1);dummy.updateMatrix();leaf.setMatrixAt(i,dummy.matrix);
      for(let j=0;j<2;j++){dummy.position.y=j?.48:1.82;dummy.updateMatrix();rails.setMatrixAt(i*2+j,dummy.matrix);}
      dummy.position.set(a.x+(b.x-a.x)*.84,1.1,a.z+(b.z-a.z)*.84);dummy.scale.set(1,1,1);dummy.updateMatrix();handles.setMatrixAt(i,dummy.matrix);
    });
    if(changed)for(const mesh of [leaf,rails,handles])mesh.instanceMatrix.needsUpdate=true;
  }
  update();
  return {update,setVisible(value){group.visible=value;},setMaterials(materials){for(const key of ['map','normalMap','roughnessMap'])wood[key]=materials.wood[key];wood.needsUpdate=true;},stats:{doors:doors.length,structuralExclusions:w.exclusions.length,cornNodes:w.corn.reduce((a,b)=>a+b,0)}};
}
