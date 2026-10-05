import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyEnvironmentSurface,varyWoodUV} from './environment-materials.js';

export function createWoodPanelGeometry(){
  const pieces=[];
  for(let board=0;board<4;board++){
    const height=2.644-[0,.014,.025,.009][board],width=.25-.004;
    const shape=new THREE.Shape();shape.moveTo(-width/2+.003,0);shape.lineTo(width/2-.003,0);shape.lineTo(width/2,.003);shape.lineTo(width/2,height-.006);shape.lineTo(width/2-.006,height);shape.lineTo(-width/2+.004,height-.003);shape.lineTo(-width/2,height-.008);shape.lineTo(-width/2,.004);shape.closePath();
    const piece=new THREE.ExtrudeGeometry(shape,{depth:.072,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.002,bevelThickness:.003,curveSegments:1});
    piece.translate((board-1.5)*.25,-1.322,-.036);
    const uv=piece.attributes.uv,pos=piece.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)*.54+board*.167,pos.getY(i)*.5+.37);
    pieces.push(piece);
  }
  const geometry=mergeGeometries(pieces);for(const piece of pieces)piece.dispose();geometry.name='Four weathered bevelled timber boards';return geometry;
}

/** Only visible spatial batches draw; physics still uses the unchanged grid. */
export function createWoodPanels(parent,material,{spatial=false}={}){
  applyEnvironmentSurface(material,{kind:'wood'});varyWoodUV(material);
  const geometry=createWoodPanelGeometry(),railGeometry=new THREE.BoxGeometry(1,.10,.13),postGeometry=new THREE.BoxGeometry(.13,2.73,.16),batches=new Map();
  const dummy=new THREE.Object3D(),tint=new THREE.Color();
  return {
    rebuild(world){
      const groups=new Map();let count=0;
      for(let z=0;z<world.height;z++)for(let x=0;x<world.width;x++){
        if(!world.walk[z*world.width+x])continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=x+dx,nz=z+dz;
          if(nx>=0&&nx<world.width&&nz>=0&&nz<world.height&&world.walk[nz*world.width+nx])continue;
          const px=(x+.5+dx*.5)*world.size,pz=(z+.5+dz*.5)*world.size,key=spatial?`${Math.floor(px/16)}:${Math.floor(pz/16)}`:'all';
          if(!groups.has(key))groups.set(key,[]);
          groups.get(key).push({x:px,z:pz,yaw:dx?Math.PI/2:0,brace:(x+z)%3===0,tint:.76+((x*17+z*31+(dx?3:0))%7)*.035});count++;
        }
      }
      for(const [key,batch] of batches)if(!groups.has(key)){for(const mesh of batch){mesh.removeFromParent();mesh.dispose();}batches.delete(key);}
      for(const [key,walls] of groups){
        let batch=batches.get(key);
        if(!batch||batch[0].instanceMatrix.count<walls.length){
          for(const mesh of batch||[]){mesh.removeFromParent();mesh.dispose();}
          batch=[new THREE.InstancedMesh(geometry,material,walls.length),new THREE.InstancedMesh(railGeometry,material,walls.length*3),new THREE.InstancedMesh(postGeometry,material,walls.length)];
          batches.set(key,batch);parent.add(...batch);
        }
        const [panels,rails,posts]=batch;panels.count=posts.count=walls.length;let railCount=0;
        walls.forEach((wall,i)=>{
          dummy.position.set(wall.x,1.325,wall.z);dummy.rotation.set(0,wall.yaw,0);dummy.scale.set(world.size,1,1);dummy.updateMatrix();panels.setMatrixAt(i,dummy.matrix);
          panels.setColorAt(i,tint.setScalar(wall.tint));
          for(let j=0;j<2;j++){dummy.position.y=j?1.95:.55;dummy.updateMatrix();rails.setMatrixAt(railCount++,dummy.matrix);}
          if(wall.brace){dummy.position.y=1.25;dummy.rotation.z=Math.atan2(1.4,world.size);dummy.scale.x=Math.hypot(world.size,1.4);dummy.updateMatrix();rails.setMatrixAt(railCount++,dummy.matrix);}
          dummy.position.set(wall.x-Math.cos(wall.yaw)*world.size*.5,1.365,wall.z+Math.sin(wall.yaw)*world.size*.5);dummy.rotation.set(0,wall.yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);posts.setColorAt(i,tint.setScalar(wall.tint*.82));
        });
        rails.count=railCount;posts.instanceColor.needsUpdate=true;
        for(const mesh of batch){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}panels.instanceColor.needsUpdate=true;
      }
      return {count,batches:batches.size};
    },
  };
}
