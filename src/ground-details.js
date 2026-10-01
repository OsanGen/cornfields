import * as THREE from 'three';

const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

/** Stable decoration only. Stones are small enough to step over; no new collision. */
export function groundDetailLayout(game,{low=false,radius=12}={}){
  const points=[],p=game.player,field=p.zone==='field',world=game.maze.cornWorld;
  const cx=Math.floor(p.x/3),cz=Math.floor(p.z/3);
  for(let z=cz-4;z<=cz+4;z++)for(let x=cx-4;x<=cx+4;x++){
    const random=seeded((Math.imul(x,73856093)^Math.imul(z,19349663))>>>0);
    for(let kind=0;kind<2;kind++){
      const px=(x+random())*3,pz=(z+random())*3,d=Math.hypot(px-p.x,pz-p.z),keep=random(),yaw=random()*Math.PI*2,scale=.65+random()*.65;
      if(d>radius||keep>(low?.38:.72)||game.maze.cornDoors.some(door=>Math.hypot(door.x-px,door.z-pz)<1.7))continue;
      if(field){if(Math.hypot(px,pz)<2)continue;}
      else{
        const ix=Math.floor(px/world.size),iz=Math.floor(pz/world.size);
        if(ix<0||iz<0||ix>=world.width||iz>=world.height||!world.walk[iz*world.width+ix])continue;
        // Keep the center of each wooden route mostly bare and readable.
        const edge=Math.min(px/world.size-ix,1-(px/world.size-ix),pz/world.size-iz,1-(pz/world.size-iz));
        if(edge>.26&&keep>.14)continue;
      }
      points.push({kind,x:px,z:pz,yaw,scale});
    }
  }
  return points;
}

function grassGeometry(){
  const vertices=[],colors=[],random=seeded(493);
  for(let i=0;i<11;i++){
    const a=random()*Math.PI*2,r=random()*.18,x=Math.cos(a)*r,z=Math.sin(a)*r,h=.11+random()*.19,w=.007+random()*.008;
    const bend=.035+random()*.035,sx=Math.cos(a)*w,sz=Math.sin(a)*w;
    vertices.push(x-sx,0,z-sz,x+sx,0,z+sz,x+Math.sin(a)*bend,h,z+Math.cos(a)*bend);
    const c=new THREE.Color().setHSL(.19+random()*.035,.23,.15+random()*.10);
    for(let j=0;j<3;j++){const k=j===2?1.18:.8;colors.push(c.r*k,c.g*k,c.b*k);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}

export function createGroundDetails(scene,{touch=false}={}){
  const group=new THREE.Group();group.name='Sparse grass and stones';scene.add(group);
  const grass=new THREE.InstancedMesh(grassGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),162);
  const stoneGeometry=new THREE.IcosahedronGeometry(.12,1),position=stoneGeometry.attributes.position;
  for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getY(i),z=position.getZ(i),n=1+.16*Math.sin(x*52+z*37+y*23);position.setXYZ(i,x*n,y*.48*n+.043,z*n);}
  // Retain smooth stone normals across the non-indexed triangle seams.
  const normals=stoneGeometry.attributes.normal,normal=new THREE.Vector3();
  for(let i=0;i<normals.count;i++){normal.fromBufferAttribute(normals,i);normal.y/=.48;normal.normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);}
  const rocks=new THREE.InstancedMesh(stoneGeometry,new THREE.MeshStandardMaterial({color:0x626052,roughness:.88}),162);
  grass.name='Ground grass';rocks.name='Ground stones';group.add(grass,rocks);
  const dummy=new THREE.Object3D(),color=new THREE.Color();let key='',low=touch;
  const stats={grass:0,rocks:0,draws:2};
  return {stats,setQuality(profile){low=profile.rain<=.5;key='';},update(game){
    group.visible=!!game.corridorRun;if(!group.visible)return;
    const next=`${game.player.zone}:${Math.floor(game.player.x/3)}:${Math.floor(game.player.z/3)}:${game.maze.cornWorld.revision}`;
    if(next===key)return;key=next;const counts=[0,0];
    for(const p of groundDetailLayout(game,{low})){const mesh=p.kind?rocks:grass,index=counts[p.kind]++;dummy.position.set(p.x,.002,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);if(p.kind){color.setHSL(.12,.08,.32+(p.scale-.65)*.1);mesh.setColorAt(index,color);}}
    for(const [i,mesh]of [grass,rocks].entries()){mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
    stats.grass=counts[0];stats.rocks=counts[1];
  }};
}
