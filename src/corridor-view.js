import * as THREE from 'three';
import {doorLeaf} from './corn-world.js';

export function createCorridorFieldView(scene,maze,floorMaterial,{touch=false}={}){
  if(!maze.corridorLayout)return {update(){},setAssets(){},stats:{enabled:false}};
  const wallsGroup=new THREE.Group(),fieldGroup=new THREE.Group();scene.add(wallsGroup,fieldGroup);
  const wood=new THREE.MeshStandardMaterial({color:0x978269,roughness:1});
  const matrix=new THREE.Object3D(),w=maze.cornWorld;
  const panels=new THREE.InstancedMesh(new THREE.BoxGeometry(1,2.65,.08),wood,6000);panels.frustumCulled=false;wallsGroup.add(panels);
  const rails=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.10,.13),wood,12000);rails.frustumCulled=false;wallsGroup.add(rails);
  const fieldFloor=new THREE.Mesh(new THREE.PlaneGeometry(140,140),floorMaterial);fieldFloor.rotation.x=-Math.PI/2;fieldGroup.add(fieldFloor);
  const leaf=new THREE.Mesh(new THREE.BoxGeometry(1,2.25,.06).translate(.5,1.125,0),wood);fieldGroup.add(leaf);
  for(const x of [-.8,.8]){const post=new THREE.Mesh(new THREE.BoxGeometry(.12,2.65,.15),wood);post.position.set(x,1.325,0);fieldGroup.add(post);}
  const lantern=new THREE.Mesh(new THREE.BoxGeometry(.16,.25,.16),new THREE.MeshStandardMaterial({color:0xf3c56d,emissive:0xe8a44e,emissiveIntensity:3}));lantern.position.set(.95,2.2,0);fieldGroup.add(lantern);
  const light=new THREE.PointLight(0xf3c56d,10,7);light.position.copy(lantern.position);fieldGroup.add(light);
  const patchSize=12,grid=5,perPatch=touch?95:145,capacity=grid*grid*perPatch;
  let plants=[],materials=null,revision=-1,runId=null,patchKey='';
  const stats={enabled:true,wallInstances:0,cornCapacity:capacity,activeZone:'corridor',extraZombieCap:3};
  function setPlants(assets){
    for(const p of plants){fieldGroup.remove(p);if(p.userData.owned){p.geometry.dispose();p.material.dispose();}}
    plants=assets.map(a=>{const mesh=new THREE.InstancedMesh(a.geometry,a.material,capacity);mesh.frustumCulled=false;mesh.userData.owned=!!a.owned;fieldGroup.add(mesh);return mesh;});patchKey='';
  }
  setPlants([{geometry:new THREE.ConeGeometry(.33,2.9,5).translate(0,1.45,0),material:new THREE.MeshStandardMaterial({color:0x586239,roughness:1}),owned:true}]);
  function refreshWalls(game){
    const world=game.corridorMaze.cornWorld;let count=0;
    for(let z=0;z<world.height;z++)for(let x=0;x<world.width;x++){
      if(!world.walk[z*world.width+x])continue;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        if(world.walk[(z+dz)*world.width+x+dx])continue;
        matrix.position.set((x+.5+dx*.5)*world.size,1.325,(z+.5+dz*.5)*world.size);matrix.rotation.set(0,dx?Math.PI/2:0,0);matrix.scale.set(world.size,1,1);matrix.updateMatrix();panels.setMatrixAt(count,matrix.matrix);
        for(let j=0;j<2;j++){matrix.position.y=j?1.95:.55;matrix.updateMatrix();rails.setMatrixAt(count*2+j,matrix.matrix);}count++;
      }
    }
    panels.count=count;rails.count=count*2;panels.instanceMatrix.needsUpdate=true;rails.instanceMatrix.needsUpdate=true;stats.wallInstances=count;
  }
  function refreshCorn(p){
    const cx=Math.floor(p.x/patchSize),cz=Math.floor(p.z/patchSize),next=`${cx}:${cz}`;if(next===patchKey)return;patchKey=next;
    const counts=plants.map(()=>0);
    for(let z=cz-2;z<=cz+2;z++)for(let x=cx-2;x<=cx+2;x++){
      let seed=(Math.imul(x,73856093)^Math.imul(z,19349663))>>>0;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<perPatch;i++){
        const px=(x+random())*patchSize,pz=(z+random())*patchSize;if(Math.hypot(px,pz)<1.5)continue;
        const variant=i%plants.length;matrix.position.set(px,0,pz);matrix.rotation.set(0,random()*Math.PI*2,0);matrix.scale.setScalar(.9+random()*.3);matrix.updateMatrix();plants[variant].setMatrixAt(counts[variant]++,matrix.matrix);
      }
    }
    plants.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;});
  }
  return {stats,setAssets(assets,mats){if(assets?.length)setPlants(assets);materials=mats;if(mats)for(const key of ['map','normalMap','roughnessMap'])wood[key]=mats.wood[key];wood.needsUpdate=true;},
    update(game){
      const inField=game.player.zone==='field';stats.activeZone=inField?'field':'corridor';wallsGroup.visible=!inField;fieldGroup.visible=inField;
      if(runId!==game.runId||revision!==game.corridorMaze.cornWorld.revision){refreshWalls(game);runId=game.runId;revision=game.corridorMaze.cornWorld.revision;}
      if(!inField)return;
      refreshCorn(game.player);fieldFloor.position.set(game.player.x,-.003,game.player.z);
      const d=game.maze.cornWorld.doors[game.maze.cornWorld.activeDoor],s=game.cornDoors[d.index],line=doorLeaf(d,s.amount*(s.swing||1));
      leaf.position.set(line.a.x,0,line.a.z);leaf.rotation.y=Math.atan2(-(line.b.z-line.a.z),line.b.x-line.a.x);leaf.scale.x=d.width;
    }};
}
