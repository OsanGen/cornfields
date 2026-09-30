import * as THREE from 'three';
import {SURVIVAL_VIEW_BOUNDS as B} from './corn-layout.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CELL,WIDTH,HEIGHT,centerOf} from './maze.js';

const ROOT=new URL('../assets/field/',import.meta.url).href;
const CHUNK=CELL*6, NEAR=10, FAR=27;
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
function seeded(seed=9182){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function texture(loader,name,color=false){
  return loader.loadAsync(ROOT+name).then(t=>{t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;});
}
function bound(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Visual asset load timed out')),ms);})]).finally(()=>clearTimeout(timer));}

// Pure placement: art lives inside existing wall cells, never in the walkable grid.
export function fieldLayout(maze){
  const random=seeded(),plants=[],fences=[],litter=[];
  if(maze.cornWorld){
    const w=maze.cornWorld;
    const plant=(x,z)=>plants.push({x,z,yaw:random()*Math.PI*2,scale:.96+random()*.18,variant:Math.floor(random()*3)});
    for(let z=0;z<w.height;z++)for(let x=0;x<w.width;x++){
      if(maze.survivalLayout&&x>=B.x&&x<B.x+B.width&&z>=B.z&&z<B.z+B.height)continue;
      if(maze.survivalLayout&&z>=HEIGHT*3&&(x<28||x>62||z>138))continue;
      const id=z*w.width+x;if(w.walk[id])continue;
      const cx=(x+.5)*w.size,cz=(z+.5)*w.size;
      for(let i=0;i<3;i++)plant(cx+(random()-.5)*w.size*.7,cz+(random()-.5)*w.size*.7);
    }
    for(const {a,b}of w.segments)for(let i=0;i<4;i++)plant(a.x+(b.x-a.x)*(i+.5)/4,a.z+(b.z-a.z)*(i+.5)/4);
    for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++)if(!maze.grid[z][x])for(const [dx,dz]of directions){
      const nx=x+dx,nz=z+dz;if(maze.grid[nz]?.[nx]!==1||!(nx===0||nz===0||nx===WIDTH-1||nz===HEIGHT-1))continue;
      const p=centerOf(x,z);fences.push({x:p.x+dx*CELL/2,z:p.z+dz*CELL/2,yaw:Math.atan2(dx,dz),variant:1});
    }
    return {plants,fences,litter};
  }
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++){
    if(!maze.grid[z][x])continue;
    const p=centerOf(x,z);
    let edges=0;
    for(const [dx,dz]of directions){
      if(maze.grid[z+dz]?.[x+dx]!==0)continue;
      edges++;
      const hideOpening=maze.hideAnchors?.some(a=>a.corridorCell.x===x+dx&&a.corridorCell.z===z+dz&&a.cornSide.x===-dx&&a.cornSide.z===-dz);
      const landingOpening=maze.landingZones?.some(a=>a.corridorCell.x===x+dx&&a.corridorCell.z===z+dz&&a.cornSide.x===-dx&&a.cornSide.z===-dz);
      if(!hideOpening){
        const panel={x:p.x+dx*(CELL/2-.09),z:p.z+dz*(CELL/2-.09),yaw:Math.atan2(dx,dz),variant:(x*7+z*3)%3};
        if(landingOpening){
          const width=CELL/2-.78,offset=.78+width/2;
          for(const side of [-1,1])fences.push({...panel,x:panel.x+Math.cos(panel.yaw)*offset*side,z:panel.z-Math.sin(panel.yaw)*offset*side,scale:width/CELL});
        }else fences.push(panel);
      }
      for(let row=0;row<2;row++)for(let i=0;i<5;i++){
        const along=(i-2)*.43+(random()-.5)*.10;
        const inset=.50+row*.47+random()*.10;
        plants.push({x:p.x+dx*(CELL/2-inset)+dz*along,z:p.z+dz*(CELL/2-inset)+dx*along,
          yaw:random()*Math.PI*2,scale:1.04+random()*.17,variant:Math.floor(random()*3)});
      }
      for(let i=0;i<3;i++)litter.push({x:p.x+dx*(CELL/2+.08+random()*.28)+dz*(random()-.5)*CELL,
        z:p.z+dz*(CELL/2+.08+random()*.28)+dx*(random()-.5)*CELL,yaw:random()*Math.PI*2,variant:i%2});
    }
    if(!edges)plants.push({x:p.x+(random()-.5),z:p.z+(random()-.5),yaw:random()*6.28,scale:1+random()*.12,variant:Math.floor(random()*3)});
  }
  return {plants,fences,litter};
}

// Thin polygonal strands and crossed barbs stay crisp under the flashlight.
// This avoids the large transparent strips of the evaluated 128px wire asset.
export function barbedWireGeometry(){
  const positions=[],uvs=[];
  const tube=(a,b,r=.006)=>{
    a=new THREE.Vector3(...a);b=new THREE.Vector3(...b);
    const axis=b.clone().sub(a).normalize(),side=new THREE.Vector3(0,1,0).cross(axis).normalize();
    const up=axis.clone().cross(side).normalize(),rings=[];
    for(const p of [a,b])for(let j=0;j<3;j++)rings.push(p.clone().addScaledVector(side,Math.cos(j*Math.PI*2/3)*r).addScaledVector(up,Math.sin(j*Math.PI*2/3)*r));
    for(let j=0;j<3;j++)for(const i of [j,(j+1)%3,j+3,(j+1)%3,(j+1)%3+3,j+3]){const p=rings[i];positions.push(p.x,p.y,p.z);uvs.push(p.x*.9,p.y*.7);}
  };
  for(const height of [2.65,2.87]){
    for(let i=0;i<8;i++){
      const a=-CELL/2+i*CELL/8,b=a+CELL/8;
      tube([a,height-.055*Math.sin(i*Math.PI/8),0],[b,height-.055*Math.sin((i+1)*Math.PI/8),0]);
    }
    for(let i=0;i<7;i++){
      const x=-CELL/2+.17+i*.335,y=height-.055*Math.sin((x/CELL+.5)*Math.PI);
      tube([x-.035,y-.044,-.022],[x+.035,y+.044,.022],.004);
      tube([x-.035,y+.044,-.022],[x+.035,y-.044,.022],.004);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();return geometry;
}

function signTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=192;
  const ctx=c.getContext('2d'),random=seeded(86);
  ctx.font='bold 94px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ccc7a6';
  ctx.fillText('C O R N F I E L D',512,102);
  ctx.globalCompositeOperation='destination-out';
  for(let i=0;i<1400;i++){ctx.fillStyle=`rgba(0,0,0,${.10+random()*.48})`;ctx.fillRect(random()*1024,random()*192,1+random()*3,1+random()*7);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export async function installFieldVisuals({scene,maze,camera,floor,door,entranceObjects,legacy,mode,details=false,wet=false}){
  const loader=new THREE.TextureLoader();
  const [gltf,mudColor,mudNormal,mudRough,woodColor,woodNormal,woodRough,fenceColor,fenceNormal,fenceRough,rustColor]=await bound(Promise.all([
    new GLTFLoader().loadAsync(ROOT+'cornfield-kit.glb'),
    texture(loader,'brown_mud_diff_1k.jpg',true),texture(loader,'brown_mud_nor_gl_1k.jpg'),texture(loader,'brown_mud_rough_1k.jpg'),
    texture(loader,'wood_planks_dirt_diff_1k.jpg',true),texture(loader,'wood_planks_dirt_nor_gl_1k.jpg'),texture(loader,'wood_planks_dirt_rough_1k.jpg'),
    texture(loader,'wood_planks_diff_1k.jpg',true),texture(loader,'wood_planks_nor_gl_1k.jpg'),texture(loader,'wood_planks_rough_1k.jpg'),texture(loader,'rusty_metal_02_diff_1k.jpg',true),
  ]),15000);
  const kit={};gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o=>{if(o.isMesh){const mesh=o.clone();mesh.geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);kit[o.name]=mesh;}});
  for(const name of ['corn_near_0','corn_near_1','corn_near_2','corn_far_0','corn_far_1','corn_far_2','litter_0','litter_1','entrance_door','entrance_frame','entrance_hardware'])if(!kit[name])throw new Error(`Missing visual asset ${name}`);
  const layout=fieldLayout(maze),group=new THREE.Group();group.name='Blender corn and timber fences';
  const chunks=new Map(),dummy=new THREE.Object3D(),tint=new THREE.Color();
  const chunkAt=(x,z)=>{
    const cx=Math.floor(x/CHUNK),cz=Math.floor(z/CHUNK),key=`${cx},${cz}`;
    if(!chunks.has(key))chunks.set(key,{x:(cx+.5)*CHUNK,z:(cz+.5)*CHUNK,plants:[],fences:[],litter:[],objects:[]});
    return chunks.get(key);
  };
  for(const p of layout.plants)chunkAt(p.x,p.z).plants.push(p);
  for(const p of layout.fences)chunkAt(p.x,p.z).fences.push(p);
  for(const p of layout.litter)chunkAt(p.x,p.z).litter.push(p);
  const random=seeded(361);
  const fenceMaterial=new THREE.MeshStandardMaterial({map:fenceColor,normalMap:fenceNormal,normalScale:new THREE.Vector2(.8,.8),roughnessMap:fenceRough,color:0xada899,roughness:1});
  const wireMaterial=new THREE.MeshStandardMaterial({map:rustColor,color:0x898c83,roughness:.83,metalness:.35});
  // Reuse the authored Blender boards/rails as a modular fence panel.
  const panelGeometry=kit.entrance_door.geometry.clone().translate(-CELL/2,0,0).scale(1,.89,1);
  const postGeometry=new THREE.BoxGeometry(.13,2.98,.13).translate(-CELL/2+.065,1.49,0);
  const wireGeometry=barbedWireGeometry();
  for(const chunk of chunks.values()){
    chunk.batches=[];
    for(let variant=0;variant<3;variant++){
      const plants=chunk.plants.filter(p=>p.variant===variant);
      if(!plants.length)continue;
      const batches=[];
      for(const lod of ['near','far']){
        const source=kit[`corn_${lod}_${variant}`];
        const mesh=new THREE.InstancedMesh(source.geometry,source.material,plants.length);
        mesh.name=`corn ${lod}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;
        // A fixed conservative sphere covers every LOD assignment and leaf tip.
        mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(chunk.x,1.7,chunk.z),CHUNK*.72+2.8);
        group.add(mesh);chunk.objects.push(mesh);batches.push(mesh);
      }
      chunk.batches.push({plants,near:batches[0],far:batches[1]});
    }
    if(chunk.fences.length){
      for(const [name,geometry,material]of [['Wooden fence',panelGeometry,fenceMaterial],['Fence posts',postGeometry,fenceMaterial],['Barbed wire',wireGeometry,wireMaterial]]){
        const mesh=new THREE.InstancedMesh(geometry,material,chunk.fences.length);mesh.name=name;
        chunk.fences.forEach((p,i)=>{
          dummy.position.set(p.x,0,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.scale||1,name==='Wooden fence'?1-p.variant*.012:1,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
          tint.setScalar(.84+p.variant*.065);mesh.setColorAt(i,tint);
        });mesh.computeBoundingSphere();group.add(mesh);chunk.objects.push(mesh);
      }
    }
    for(let variant=0;variant<2;variant++){
      const points=chunk.litter.filter(p=>p.variant===variant);if(!points.length)continue;
      const source=kit[`litter_${variant}`],mesh=new THREE.InstancedMesh(source.geometry,source.material,points.length);
      points.forEach((p,i)=>{dummy.position.set(p.x,.005,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(.7+random()*.6);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.computeBoundingSphere();group.add(mesh);chunk.objects.push(mesh);
    }
  }
  for(const map of [mudColor,mudNormal,mudRough])map.repeat.set(WIDTH*CELL/1.3,(maze.cornWorld.height*maze.cornWorld.size)/1.3);
  const ground=new THREE.MeshStandardMaterial({map:mudColor,normalMap:mudNormal,
    normalScale:new THREE.Vector2(wet ? .8 : .6,wet ? .8 : .6),roughnessMap:mudRough,
    roughness:wet ? .58 : 1,color:wet?0x928476:0xaaa38c});
  const wood=new THREE.MeshStandardMaterial({map:woodColor,normalMap:woodNormal,normalScale:new THREE.Vector2(.55,.55),roughnessMap:woodRough,roughness:1,color:0xaba38d});
  kit.entrance_door.material=wood;kit.entrance_frame.material=wood;
  if(details)kit.entrance_hardware.material=wireMaterial;
  const dp=centerOf(maze.door.x,maze.door.z);
  kit.entrance_frame.position.set(dp.x-CELL/2,0,dp.z);group.add(kit.entrance_frame);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.34,.51),new THREE.MeshStandardMaterial({map:signTexture(),alphaTest:.45,side:THREE.FrontSide,roughness:1}));
  sign.position.set(dp.x,3.26,dp.z+.080);group.add(sign);
  // Commit atomically only after every required resource and object is available.
  floor.material=ground;
  for(const child of door.children)child.visible=false;
  door.add(kit.entrance_door,kit.entrance_hardware);
  for(const o of entranceObjects)o.visible=false;
  for(const mesh of [legacy.walls,legacy.stalks,legacy.ears,legacy.leaves,legacy.straw])mesh.visible=false;
  scene.add(group);
  let previousX=Infinity,previousZ=Infinity;
  const stats={plants:layout.plants.length,fencePanels:layout.fences.length,greenBackingBoxes:0,chunks:chunks.size,near:0,far:0,visibleChunks:0};
  function update(){
    const {x,z}=camera.position;
    if(Math.hypot(x-previousX,z-previousZ)<1.2)return;
    previousX=x;previousZ=z;stats.near=0;stats.far=0;stats.visibleChunks=0;
    for(const chunk of chunks.values()){
      const distance=Math.hypot(x-chunk.x,z-chunk.z),visible=distance<FAR+CHUNK*.71;
      for(const obj of chunk.objects)obj.visible=visible;
      if(!visible)continue;stats.visibleChunks++;
      for(const batch of chunk.batches){
        let ni=0,fi=0;
        for(const p of batch.plants){
          const dist=Math.hypot(x-p.x,z-p.z);if(dist>FAR)continue;
          const mesh=dist<NEAR?batch.near:batch.far,index=dist<NEAR?ni++:fi++;
          dummy.position.set(p.x,0,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
          tint.setRGB(.86+p.variant*.035,.88+p.variant*.026,.78+p.variant*.045);mesh.setColorAt(index,tint);
        }
        batch.near.count=ni;batch.far.count=fi;stats.near+=ni;stats.far+=fi;
        for(const mesh of [batch.near,batch.far]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
      }
    }
  }
  update();return {update,stats,materials:{wood,wire:wireMaterial},introCorn:[0,1,2].map(i=>({geometry:kit[`corn_near_${i}`].geometry,material:kit[`corn_near_${i}`].material}))};
}
