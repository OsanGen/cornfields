import * as THREE from 'three';
import {SURVIVAL_VIEW_BOUNDS as B} from './corn-layout.js';

// Fixed instance capacity; a topology revision only updates matrices/counts.
export function createSurvivalView(scene,maze){
  if(!maze.survivalLayout)return {update(){},setCorn(){},stats:{enabled:false}};
  const group=new THREE.Group();group.name='Streamed corn sections';scene.add(group);
  const capacity=B.width*B.height,cell=maze.cornWorld.size,dummy=new THREE.Object3D();
  const backing=new THREE.InstancedMesh(new THREE.BoxGeometry(cell,2.7,cell),
    new THREE.MeshStandardMaterial({color:0x152017,roughness:1}),capacity);
  backing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(backing);
  const fallback=new THREE.ConeGeometry(.23,2.8,5).translate(0,1.4,0);
  const material=new THREE.MeshStandardMaterial({color:0x485038,roughness:1});
  const plants=Array.from({length:3},()=>{
    const mesh=new THREE.InstancedMesh(fallback,material,capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh;
  });
  let previous='',force=true;
  const stats={enabled:true,capacityPerBatch:capacity,batches:4,plants:0,solids:0,updates:0};
  return {
    stats,
    setCorn(models){models?.forEach((source,i)=>{plants[i].geometry=source.geometry;plants[i].material=source.material;});force=true;},
    update(game){
      const w=game.maze.cornWorld,revision=`${game.runId}:${w.revision||0}`;
      if(!force&&previous===revision)return;previous=revision;force=false;
      let boxes=0;const counts=[0,0,0];
      for(let z=B.z;z<B.z+B.height;z++)for(let x=B.x;x<B.x+B.width;x++){
        const id=z*w.width+x,solid=!w.walk[id],cover=!!w.corn[id];
        if(!solid&&!cover)continue;
        if(solid){dummy.position.set((x+.5)*cell,1.35,(z+.5)*cell);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();backing.setMatrixAt(boxes++,dummy.matrix);}
        for(let i=0;i<3;i++){
          dummy.position.set((x+.22+i*.25)*cell,0,(z+.24+((x+i)%3)*.24)*cell);
          dummy.rotation.set(0,(x*13+z*7+i)*.67,0);dummy.scale.setScalar(cover?.8:1.04);dummy.updateMatrix();
          plants[i].setMatrixAt(counts[i]++,dummy.matrix);
        }
      }
      backing.count=boxes;backing.instanceMatrix.needsUpdate=true;backing.computeBoundingSphere();
      plants.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();});
      Object.assign(stats,{plants:counts.reduce((sum,n)=>sum+n,0),solids:boxes,updates:stats.updates+1});
    },
  };
}
