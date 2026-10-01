import * as THREE from 'three';
import {doorLeaf} from './corn-world.js';
import {PRESENTATION} from './presentation-config.js';
import {createFoliageMotion} from './foliage-motion.js';
import {createWoodPanels} from './wood-panels.js';
import {createReturnBeacon} from './return-beacon.js';

/** A moving ground patch must sample the same mud at a fixed world position. */
export function anchorGroundUV(geometry,position,width,height){
  const uv=geometry.attributes.uv,vertices=geometry.attributes.position;
  for(let i=0;i<uv.count;i++)uv.setXY(i,(vertices.getX(i)+position.x)/width,1-(position.z-vertices.getY(i))/height);
  uv.needsUpdate=true;
}

export function createCorridorFieldView(scene,maze,floor,{touch=false,createSign,spatial=false,camera}={}){
  if(!maze.corridorLayout)return {update(){},setAssets(){},stats:{enabled:false}};
  const wallsGroup=new THREE.Group(),fieldGroup=new THREE.Group();scene.add(wallsGroup,fieldGroup);
  const wood=new THREE.MeshStandardMaterial({color:0x978269,roughness:1});
  const matrix=new THREE.Object3D(),motion=createFoliageMotion(),walls=createWoodPanels(wallsGroup,wood,{spatial});
  const fieldFloor=new THREE.Mesh(new THREE.PlaneGeometry(140,140),floor.material);fieldFloor.name='World anchored field ground';fieldFloor.rotation.x=-Math.PI/2;fieldGroup.add(fieldFloor);
  const leaf=new THREE.Mesh(new THREE.BoxGeometry(1,2.25,.06).translate(.5,1.125,0),wood);fieldGroup.add(leaf);
  for(const y of [.4,1.8]){const rail=new THREE.Mesh(new THREE.BoxGeometry(.94,.085,.045),wood);rail.position.set(.5,y,.045);leaf.add(rail);}
  const hardware=new THREE.MeshStandardMaterial({color:0x4e5149,metalness:.55,roughness:.58});
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.045,.008,5,12),hardware);handle.position.set(.83,1.02,.065);leaf.add(handle);
  for(const y of [.4,1.8]){const hinge=new THREE.Mesh(new THREE.BoxGeometry(.18,.07,.03),hardware);hinge.position.set(.08,y,.075);leaf.add(hinge);}
  for(const x of [-.8,.8]){const post=new THREE.Mesh(new THREE.BoxGeometry(.12,2.65,.15),wood);post.position.set(x,1.325,0);fieldGroup.add(post);}
  const lantern=new THREE.Mesh(new THREE.BoxGeometry(.16,.25,.16),new THREE.MeshStandardMaterial({color:0xf3c56d,emissive:0xe8a44e,emissiveIntensity:3}));lantern.position.set(.95,2.2,0);fieldGroup.add(lantern);
  const light=new THREE.PointLight(0xf3c56d,10,7);light.position.copy(lantern.position);fieldGroup.add(light);
  if(createSign){const sign=createSign('CORRIDORS',1.4,.22);sign.position.set(0,2.45,.08);fieldGroup.add(sign);}
  const beacon=createReturnBeacon(scene,fieldGroup,lantern,light,{camera,touch});
  const {patchSize,plantsPerPatch:perPatch,radius}=PRESENTATION.field,capacity=9*perPatch;
  let plants=[],revision=-1,runId=null,patchKey='',nearRadius=PRESENTATION.field.nearRadius,variants=1;
  const stats={enabled:true,wallInstances:0,cornCapacity:capacity,near:0,far:0,activeZone:'corridor',extraZombieCap:3,beacon:beacon.stats};
  function setPlants(assets,farAssets=assets){
    for(const p of plants){fieldGroup.remove(p);if(p.userData.owned)p.geometry.dispose();p.material.dispose();}
    variants=assets.length;
    plants=[...assets,...farAssets].map(a=>{const mesh=new THREE.InstancedMesh(a.geometry,motion.material(a.material),capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.owned=!!a.owned;fieldGroup.add(mesh);return mesh;});patchKey='';
  }
  setPlants([{geometry:new THREE.ConeGeometry(.33,2.9,5).translate(0,1.45,0),material:new THREE.MeshStandardMaterial({color:0x586239,roughness:1}),owned:true}]);
  function refreshWalls(game){
    const result=walls.rebuild(game.corridorMaze.cornWorld);stats.wallInstances=result.count;stats.wallBatches=result.batches;
  }
  function refreshCorn(p){
    const cx=Math.floor(p.x/patchSize),cz=Math.floor(p.z/patchSize),next=`${Math.floor(p.x/2)}:${Math.floor(p.z/2)}`;if(next===patchKey)return;patchKey=next;
    const counts=plants.map(()=>0);
    for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++){
      let seed=(Math.imul(x,73856093)^Math.imul(z,19349663))>>>0;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<perPatch;i++){
        const px=(x+random())*patchSize,pz=(z+random())*patchSize,yaw=random()*Math.PI*2,scale=.9+random()*.3;
        // Keep placement stable while excluding geometry well beyond the fog.
        const distance=Math.hypot(px-p.x,pz-p.z);
        if(Math.hypot(px,pz)<1.5||distance>radius)continue;
        const variant=i%variants+(distance>nearRadius?variants:0);matrix.position.set(px,0,pz);matrix.rotation.set(0,yaw,0);matrix.scale.setScalar(scale);matrix.updateMatrix();plants[variant].setMatrixAt(counts[variant]++,matrix.matrix);
      }
    }
    plants.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();if(mesh.boundingSphere)mesh.boundingSphere.radius+=.3;});
    stats.near=counts.slice(0,variants).reduce((a,b)=>a+b,0);stats.far=counts.slice(variants).reduce((a,b)=>a+b,0);
  }
  return {stats,dispose(){beacon.dispose();},setQuality(profile){nearRadius=profile.nearRadius;patchKey='';beacon.setQuality(profile);},setAssets(assets,mats,farAssets){if(assets?.length)setPlants(assets,farAssets);fieldFloor.material=floor.material;if(mats)for(const key of ['map','normalMap','roughnessMap'])wood[key]=mats.wood[key];wood.needsUpdate=true;},
    update(game,reduced=false){
      motion.update(game.elapsed,game.player,reduced);
      const inField=game.player.zone==='field';stats.activeZone=inField?'field':'corridor';wallsGroup.visible=!inField;fieldGroup.visible=inField;
      beacon.update(game,reduced);
      if(runId!==game.runId||revision!==game.corridorMaze.cornWorld.revision){refreshWalls(game);runId=game.runId;revision=game.corridorMaze.cornWorld.revision;}
      if(!inField)return;
      refreshCorn(game.player);fieldFloor.position.set(game.player.x,-.003,game.player.z);
      anchorGroundUV(fieldFloor.geometry,fieldFloor.position,floor.geometry.parameters.width,floor.geometry.parameters.height);
      const d=game.maze.cornWorld.doors[game.maze.cornWorld.activeDoor],s=game.cornDoors[d.index],line=doorLeaf(d,s.amount*(s.swing||1));
      leaf.position.set(line.a.x,0,line.a.z);leaf.rotation.y=Math.atan2(-(line.b.z-line.a.z),line.b.x-line.a.x);leaf.scale.x=d.width;
    }};
}
