import {sampleRoomTransition,createLiquidVeil} from './prologue-liquid-transition.js';
import {sampleHallucination,createPrologueHallucination} from './prologue-hallucination.js';
import {samplePrologueWake} from './prologue-performance.js';
import {applyEnvironmentSurface} from './environment-materials.js';
import {createCabinWheel,createEntertainmentRadio,steeringAngle} from './prologue-cabin.js';
import {WEST_APPROACH,approachStageTransform} from './prologue-layout.js';
import {cornClearsParkedCruiser,PARKED_CRUISER_CLEARANCE} from './prologue-clearance.js';
import {createFoliageMotion} from './foliage-motion.js';
import {performanceFor,samplePrologueExit,EXIT_SECONDS} from './prologue-performance.js';
import * as THREE from 'three';
import {createPrologueActor, PROLOGUE_CAST_PROVENANCE} from './prologue-actors.js';
import {samplePrologueMotion} from './prologue-motion.js';
import {createBloodRoom} from './blood-room.js';
import {createPrologueAssets,prepareCruiser} from './prologue-assets.js';
import {createTexturedPrologueActor} from './prologue-model-actor.js';
import {samplePrologueDriving} from './prologue-driving.js';
import {createPrologueRain} from './prologue-rain.js';
import {sampleRoadsideConfrontation,BANG_WINDOW_TARGET} from './prologue-confrontation.js';
import {attachLiquidMaterial as attachPrologueLiquid} from './liquid-material.js';
export {attachPrologueLiquid};
export {prologueBlocking,prologueWorldTransition} from './prologue-motion.js';

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Readable event envelopes, with no repeated flashes or gameplay side effects. */
export function prologueVisionState(frame={}){
  const chapter=frame.chapter,duration={undead:5.2,redroom:12.4,liquid:5,rupture:12}[chapter]||1;
  const t=Math.max(0,Number.isFinite(frame.chapterTime)?frame.chapterTime:clamp(frame.chapterProgress)*duration);
  const reduced=!!frame.reduced,rupture=chapter==='rupture',liquid=chapter==='liquid';
  const hallucination=sampleHallucination(frame),transfer=sampleRoomTransition(frame);
  const envelope=liquid?smooth(t)*smooth(5-t):rupture?smooth(t/2)*(1-smooth((t-8.5)/.5)):hallucination.bridge;
  const reveal=(at,width=.75)=>t<at?0:Math.max(0,1-(t-at)/width);
  return {
    room:transfer.room,corpse:false,hallucination,roomCover:transfer.cover,liquid:envelope*(reduced?.30:1),
    red:rupture?smooth((t-1)/2):0,
    mist:rupture?(t<9?.16*smooth((t-1)/2):.16+.84*smooth((t-9)/2.2)):0,
    lightning:reduced?0:chapter==='undead'?reveal(0,1.2)*.7:rupture?Math.max(reveal(3.1),reveal(6.1))*.75:0,
    // Keep the nearest escort's head and breakup inside a normal level gaze.
    limp:rupture&&t>=1,limpWeight:rupture?smooth((t-1)/.7):0,rise:rupture?(t<6?.8*smooth((t-3)/3):.8+.6*smooth((t-6)/3)):0,
    dissolve:rupture?smooth((t-6)/3):0,binary:rupture&&t>=8.5&&t<9,
    escortsVisible:!frame.returning&&(!rupture||t<9),time:t,
  };
}

/** Free look never returns to an authored target after the player stops moving. */
export function applyPrologueCamera(camera,motion,player={}){
  camera.position.fromArray(motion.blocking.camera);
  camera.rotation.set(Number(player.pitch)||0,Number.isFinite(player.yaw)?player.yaw:(motion.listener?.yaw||0),0,'YXZ');
}

/** Temporary presentation borrowing is transactional, including renderer errors. */
export function withPrologueWorld(world, {camera, stage, actors=[], fog, background, red=0}, draw) {
  const scene=world.scene, previousFog=scene.fog, previousBackground=scene.background;
  const originalCameraVisibility=world.camera?.visible;
  const moved=[stage,...actors].map(object=>({object,parent:object.parent,index:object.parent?.children.indexOf(object)??-1}));
  const photograph=scene.getObjectByName('Photographic night sky');
  const skyColor=photograph?.material?.color, previousSkyColor=skyColor?.clone();
  try {
    scene.fog=fog;scene.background=background;
    if(world.camera)world.camera.visible=false;
    if(skyColor)skyColor.lerp(new THREE.Color(0xff3020),red);
    stage.add(...actors);scene.add(stage);stage.visible=true;
    camera.updateWorldMatrix(true,false);return draw(scene,camera);
  } finally {
    for(const {object,parent}of moved)object.removeFromParent();
    // Restore membership and order, not just the parent reference.
    for(const {object,parent,index}of moved)if(parent){parent.add(object);const current=parent.children.indexOf(object);parent.children.splice(current,1);parent.children.splice(index,0,object);}
    stage.visible=false;scene.fog=previousFog;scene.background=previousBackground;
    if(world.camera)world.camera.visible=originalCameraVisibility;
    if(skyColor)skyColor.copy(previousSkyColor);
  }
}

function canvasTexture(kind) {
  if(typeof document==='undefined'){const texture=new THREE.DataTexture(new Uint8Array([92,94,77,255]),1,1);texture.needsUpdate=true;return texture;}
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind === 'wood' ? '#494737' : kind === 'road' ? '#353a3c' : '#444238'; ctx.fillRect(0, 0, 128, 128);
  let seed = 7321;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1700; i++) {
    const v = Math.floor(30 + random() * 60); ctx.fillStyle = `rgba(${v + 8},${v + 7},${v},${.1 + random() * .35})`;
    const x = random() * 128, y = random() * 128;
    ctx.fillRect(x, y, kind === 'wood' ? .4 + random() : .5 + random() * 2, kind === 'wood' ? 6 + random() * 55 : .5 + random() * 2);
  }
  if (kind === 'wood') for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(12,15,12,.50)'; ctx.fillRect(i * 16, 0, 1, 128); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(kind === 'wood' ? 1 : 10, kind === 'wood' ? 2 : 24); return texture;
}

function fallbackCorn() {
  const vertices = [];
  const quad = (a,b,c,d) => vertices.push(...a,...b,...c,...a,...c,...d);
  quad([-.02,0,0],[.02,0,0],[.014,2.8,0],[-.014,2.8,0]);
  for (let i=0;i<7;i++) { const s=i%2?1:-1,y=.40+i*.31; quad([0,y,0],[s*.38,y+.34,.04],[s*.78,y+.10,0],[s*.28,y+.13,-.035]); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geometry.computeVertexNormals(); return geometry;
}

/** Owns its staged set and cast; corn meshes and the WebGLRenderer remain borrowed. */
export function createPrologueVisuals(renderer, {getCorn = () => null, getWorld = () => null, renderEquipment=()=>{}, spawn = {x: 0, z: 0, yaw: 0}, touch = false} = {}) {
  let scene, location, camera, car, road, field, door, wheel, clarence, stanley, sky, haze, headlight, worldStage, worldFog, worldBackground,room,face,projectorLight,binary,flashlight,hemi,moon;
  let live = false, dead = false, size = '', borrowed = new Set(), ownedTextures = new Set();
  let liquidUniforms=[],foliage=null,rain=null,entertainment=null,liquidVeil=null,hallucinations=null,ribbons=null,groundMaterial=null;
  let assets=null,cruiser=null,roadMaterial=null,woodMaterial=null,roadMist=null;
  const stats = {live:false, frames:0, draws:0, chapter:null, cast:PROLOGUE_CAST_PROVENANCE, corn:'uninitialized', passenger:'Mike', driver:'Clarence', error:null};
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4(), savedClear = new THREE.Color(), cameraWorld = new THREE.Vector3();
  const skyNormal = new THREE.Color(0x24313d), skyRed = new THREE.Color(0x501512), fogNormal = new THREE.Color(0x202b2b), fogRed = new THREE.Color(0x631f18);
  function standard(color, extra={}) { return new THREE.MeshStandardMaterial({color,roughness:.85,...extra}); }
  function mesh(parent, geometry, material, x=0,y=0,z=0, ry=0) { const item=new THREE.Mesh(geometry,material); item.position.set(x,y,z);item.rotation.y=ry;parent.add(item);return item; }
  function box(parent, material, w,h,d,x=0,y=0,z=0,ry=0) { return mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z,ry); }
  function group(parent,x=0,y=0,z=0) { const item=new THREE.Group();item.position.set(x,y,z);parent.add(item);return item; }
  function disposeSet() {
    rain?.dispose();rain=null;
    hallucinations?.dispose();hallucinations=null;clarence?.dispose?.();stanley?.dispose?.();
    const geometries=new Set(), materials=new Set();
    scene?.traverse(item=>{ if(item.isInstancedMesh)item.dispose(); if(item.geometry&&!borrowed.has(item.geometry)&&!assets?.owns(item.geometry))geometries.add(item.geometry); for(const mat of Array.isArray(item.material)?item.material:item.material?[item.material]:[])if(!borrowed.has(mat)&&!assets?.owns(mat))materials.add(mat); });
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of ownedTextures)texture.dispose();
    assets?.dispose();assets=null;cruiser=null;roadMaterial=roadMist=groundMaterial=null;entertainment=liquidVeil=ribbons=null;
    scene=location=camera=car=road=field=door=wheel=clarence=stanley=sky=haze=headlight=worldStage=worldFog=worldBackground=room=face=projectorLight=binary=flashlight=hemi=moon=null;borrowed=new Set();ownedTextures=new Set();liquidUniforms=[];foliage=null;live=false;stats.live=false;size='';
  }
  function buildCar() {
    car=group(location);car.name='Cruiser interior, passenger on right';
    const vinyl=standard(0x1d2224,{roughness:.68}), rubber=standard(0x101314),trim=standard(0x4f5656,{metalness:.35,roughness:.46}),body=standard(0x939b96,{metalness:.45,roughness:.47});
    const leather=standard(0x333736,{roughness:.85}),glass=standard(0x9bb5bc,{transparent:true,opacity:.055,roughness:.14,metalness:.05,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
    box(car,vinyl,1.72,.22,1.15,0,.68,-.91);box(car,vinyl,1.6,.09,.42,0,.77,-1.20);
    box(car,rubber,1.65,.055,2.6,0,.02,.12);box(car,vinyl,.25,.38,1.05,0,.28,-.19);
    box(car,body,1.83,.065,1.52,0,1.47,.32);box(car,vinyl,1.85,.07,.095,0,1.44,-.53);
    for(const x of [-.86,.86]) {
      const pillar=box(car,vinyl,.065,.79,.07,x,1.10,-.79);pillar.rotation.x=-.40;
      box(car,vinyl,.058,.62,.095,x,1.18,.79);
      box(car,body,.09,.50,2.10,x,.27,.1);
      for(let i=0;i<7;i++)box(car,rubber,.032,.005,.06,x<0?-.67+i*.05:.26+i*.05,.802,-.99);
    }
    const windshield=mesh(car,new THREE.PlaneGeometry(1.62,.67),glass,0,1.11,-.84);windshield.name='Fallback windshield';windshield.rotation.x=-.40;
    rain=createPrologueRain(location,car,{touch});rain.attachWindshield(windshield);
    const rearview=box(car,rubber,.29,.102,.035,0,1.37,-.66);box(rearview,standard(0x4a6269,{metalness:.85,roughness:.22}),.25,.07,.007,0,0,.023);
    for(const x of [-.45,.50]) {
      box(car,leather,.58,.17,.57,x,.33,.26);const back=box(car,leather,.59,.64,.13,x,.67,.58);back.rotation.x=-.10;
      box(car,leather,.28,.17,.11,x,1.08,.62);
      for(let i=0;i<5;i++)box(car,vinyl,.002,.44,.005,x-.19+i*.095,.70,.501);
      box(car,rubber,.035,.14,.03,x+(x<0?.33:-.33),.38,.29);
    }
    // Analog instruments and muted radio light belong to the set, not the HUD.
    const glow=new THREE.MeshBasicMaterial({color:0x738f74}), redGlow=new THREE.MeshBasicMaterial({color:0xa26042});
    box(car,rubber,.47,.17,.027,-.43,.785,-.79);box(car,rubber,.27,.155,.035,.045,.735,-.735);
    for(const x of [-.55,-.31]) {mesh(car,new THREE.CircleGeometry(.065,24),glow,x,.80,-.767);mesh(car,new THREE.CircleGeometry(.057,24),vinyl,x,.80,-.763);const needle=box(car,glow,.003,.049,.003,x,.812,-.758);needle.rotation.z=-.7;}
    box(car,glow,.14,.026,.008,.045,.766,-.711);for(let i=0;i<5;i++)box(car,redGlow,.021,.008,.005,-.039+i*.042,.714,-.711);
    const fitted=createCabinWheel();car.add(fitted.assembly);wheel=fitted.steering;
    entertainment=createEntertainmentRadio();car.add(entertainment.group);
    door=group(car,.86,.45,-.52);box(door,vinyl,.065,.40,1.13,0,-.10,.54);box(door,trim,.10,.035,.33,-.055,.02,.49);box(door,rubber,.08,.035,.17,-.055,.035,.27);
    box(car,vinyl,.065,.42,1.13,-.85,.36,.02);box(car,trim,.09,.035,.33,-.78,.48,.04);
    box(car,body,1.80,.16,1.04,0,.63,-1.85);box(car,body,1.87,.24,.40,0,.42,1.40);
    const dome=new THREE.PointLight(0xe6c49d,.48,2.5,2);dome.position.set(0,1.36,.30);car.add(dome);
    headlight=new THREE.SpotLight(0xffdfa8,6,31,.47,.65,1.3);headlight.position.set(.5,.57,-2.2);headlight.target.position.set(.5,0,-20);car.add(headlight,headlight.target);
  }
  function buildLandscape() {
    const groundMap=canvasTexture('earth'), roadMap=canvasTexture('road'),woodMap=canvasTexture('wood');ownedTextures.add(groundMap);ownedTextures.add(roadMap);ownedTextures.add(woodMap);
    const earth=standard(0x77715e,{map:groundMap}),asphalt=standard(0x646a6e,{map:roadMap}),wood=standard(0x8f8b74,{map:woodMap}),post=standard(0x4f5145);
    groundMaterial=earth;earth.color.setHex(0xa6a18b);earth.normalScale.set(.62,.62);applyEnvironmentSurface(earth,{kind:'mud'});
    woodMaterial=wood;wood.normalScale.set(.35,.35);
    roadMaterial=asphalt;asphalt.color.setHex(0xb0b3b5);asphalt.normalScale.set(.38,.38);applyEnvironmentSurface(asphalt,{kind:'mud'});
    const ground=mesh(location,new THREE.PlaneGeometry(130,600,12,60),earth,0,-.027,120);ground.rotation.x=-Math.PI/2;
    road=group(location);road.position.x=-4.3;road.name='Continuous roadside';
    const roadPlane=mesh(road,new THREE.PlaneGeometry(6.7,600,2,60),asphalt,0,-.01,120);roadPlane.rotation.x=-Math.PI/2;
    const lane=standard(0x8e8762),edge=standard(0x8b9290),reflector=new THREE.MeshBasicMaterial({color:0xa5ae96});
    const markers=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.006,3.2),lane,160),dummy=new THREE.Object3D();
    for(let i=0;i<80;i++)for(let j=0;j<2;j++){dummy.position.set(j?.10:-.10,0,-176+i*7.5);dummy.scale.set(1,.8,.72+.28*(.5+.5*Math.sin(i*12.7)));dummy.updateMatrix();markers.setMatrixAt(i*2+j,dummy.matrix);}markers.computeBoundingSphere();road.add(markers);
    dummy.scale.setScalar(1);
    for(const x of [-3.1,3.1])box(road,edge,.075,.004,600,x,0,120);
    for(let i=0;i<36;i++)for(const side of [-1,1]){
      const z=-100+i*15,x=side*4.8;box(road,post,.08,1.2,.08,x,.60,z);box(road,reflector,.11,.09,.025,x,1.02,z+.05);
      if(i%3===0){box(road,post,.14,7.5,.14,side*7.1,3.75,z);box(road,post,2.2,.07,.09,side*7.1,7.0,z);}
    }
    field=group(location,0,0,WEST_APPROACH.centerZ);field.rotation.y=WEST_APPROACH.fieldYaw;field.name='Westward cornfield approach and threshold';field.updateMatrix();road.updateMatrix();
    const sources=getCorn();let parts=sources?.length?sources:null;
    if(parts) {for(const item of parts){borrowed.add(item.geometry);for(const mat of Array.isArray(item.material)?item.material:[item.material])borrowed.add(mat);}stats.corn='borrowed game corn';}
    else {parts=[{geometry:fallbackCorn(),material:standard(0x56623b,{side:THREE.DoubleSide})}];stats.corn='original procedural fallback';}
    const total=touch?420:680,count=Math.ceil(total/parts.length);
    for(let part=0;part<parts.length;part++){
      const source=parts[part],material=Array.isArray(source.material)?source.material.map(m=>foliage.material(m)):foliage.material(source.material),plants=new THREE.InstancedMesh(source.geometry,material,count);plants.name='Borrowed corn, own instance buffer';
      // Fallback source material is replaced by the owned wind clone; borrowed
      // kit geometry, textures and source materials remain untouched.
      if(!sources?.length)source.material.dispose();
      let planted=0;
      for(let i=0;i<count;i++){
        const n=i*parts.length+part,side=n%2?1:-1,row=Math.floor(n/2),z=WEST_APPROACH.entranceX-(row%48)*1.08;
        const x=side*(2.10+Math.floor(row/48)*.95+(Math.sin(n*42.4)*.5+.5)*.35);
        dummy.position.set(x,-.05,z);dummy.rotation.set(0,Math.sin(n*31.7)*Math.PI,Math.sin(n*7.3)*.018);dummy.scale.setScalar(.90+Math.sin(n*8.1)*.11);dummy.updateMatrix();
        if(cornClearsParkedCruiser(source.geometry,dummy.matrix,field.matrix))plants.setMatrixAt(planted++,dummy.matrix);
      }plants.count=planted;plants.computeBoundingSphere();plants.boundingSphere.radius+=PARKED_CRUISER_CLEARANCE.sway;field.add(plants);
      const roadsideCount=Math.ceil((touch?180:300)/parts.length),roadside=new THREE.InstancedMesh(source.geometry,material,roadsideCount);
      let roadsidePlanted=0;
      for(let i=0;i<roadsideCount;i++){
        const n=i*parts.length+part,side=n%2?1:-1,row=Math.floor(n/2);
        dummy.position.set(side*(5.4+Math.floor(row/150)*1.1),-.05,-105+(row%150)*3.5);dummy.rotation.set(0,Math.sin(n*7.31)*Math.PI,0);dummy.scale.setScalar(.9+Math.sin(n*4.17)*.1);dummy.updateMatrix();if(cornClearsParkedCruiser(source.geometry,dummy.matrix,road.matrix))roadside.setMatrixAt(roadsidePlanted++,dummy.matrix);
      }roadside.count=roadsidePlanted;roadside.name='Roadside corn with door and leaf clearance';roadside.computeBoundingSphere();roadside.boundingSphere.radius+=PARKED_CRUISER_CLEARANCE.sway;road.add(roadside);
    }
    // A restrained opening in the same wood-panel vocabulary as the live maze.
    for(const side of [-1,1]) {
      box(field,wood,.10,2.65,10,side*1.42,1.325,-56);
      for(let z=-51;z>=-61;z-=2)box(field,post,.15,2.73,.16,side*1.40,1.365,z);
      for(const y of [.55,1.95])box(field,post,.16,.10,10,side*1.37,y,-56);
    }
    const lamp=new THREE.PointLight(0xe7b976,.72,7,2);lamp.position.set(-1.3,2.0,-50.8);field.add(lamp);
    const lantern=standard(0xba9d6a,{emissive:0xc5883a,emissiveIntensity:.6});box(field,post,.19,.28,.16,-1.28,2.0,-50.7);box(field,lantern,.115,.15,.01,-1.28,2.0,-50.60);
  }
  function buildVisions(){
    const sharedRoom=createBloodRoom({touch});({group:room,face,projectorLight}=sharedRoom);
    room.name='Ten second red room';room.position.copy(location.position);room.quaternion.copy(location.quaternion);scene.add(room);room.visible=false;room.userData.roomUpdate=sharedRoom.update;
    liquidVeil=createLiquidVeil();scene.add(liquidVeil.mesh);
    hallucinations=createPrologueHallucination(location,{enabled:typeof document!=='undefined'});
    ribbons=new THREE.Group();ribbons.name='Connected upward liquid escort silhouettes';location.add(ribbons);
    for(let actor=0;actor<2;actor++){const root=new THREE.Group();root.name='Liquid silhouette '+actor;ribbons.add(root);for(let strand=0;strand<3;strand++){const x=(strand-1)*.18;const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,.15,0),new THREE.Vector3(x*.6,.70,.02),new THREE.Vector3(x*.5,1.30,-.03),new THREE.Vector3(0,1.85,0)]);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,14,strand===1?.13:.065,6,false),standard(0x601c24,{roughness:.19,metalness:.18,transparent:true,opacity:0,depthWrite:false}));mesh.userData.liquid=attachPrologueLiquid(mesh.material);root.add(mesh);}}
    // A tiny original 0/1 atlas, shared by two capped instance draws.
    const width=32,height=24,data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const digit=x<16?0:1,px=x%16,py=y,i=(y*width+x)*4;
      const zero=px>=3&&px<=12&&py>=3&&py<=20&&(px<=5||px>=10||py<=5||py>=18);
      const one=py>=3&&py<=20&&(px>=7&&px<=9||py>=18&&px>=4&&px<=12||py>=4&&py<=6&&px>=5&&px<=8);
      data[i]=255;data[i+1]=157;data[i+2]=143;data[i+3]=(digit?one:zero)?255:0;
    }
    const atlas=new THREE.DataTexture(data,width,height);atlas.magFilter=THREE.NearestFilter;atlas.needsUpdate=true;ownedTextures.add(atlas);
    binary=new THREE.Group();binary.name='Two escorts dissolving into zeros and ones';location.add(binary);binary.visible=false;
    const count=touch?24:48;
    for(let digit=0;digit<2;digit++){
      const geometry=new THREE.PlaneGeometry(.15,.23),uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+digit)/2);
      const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({map:atlas,transparent:true,alphaTest:.15,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),count);
      mesh.name=digit?'Binary ones':'Binary zeros';mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;binary.add(mesh);
    }
  }
  function updateBinary(vision,time,reduced){
    binary.visible=vision.binary;stats.binaryFragments=0;if(!vision.binary)return;
    const dummy=new THREE.Object3D(),progress=vision.dissolve;
    for(const [digit,batch]of binary.children.entries()){
      const count=batch.instanceMatrix.count;batch.count=count;
      for(let i=0;i<count;i++){
        const actor=i%2?stanley:clarence,n=Math.floor(i/2),seed=n*12.713+digit*8.137;
        const drift=(reduced?.10:.28)*progress;
        dummy.position.set(actor.root.position.x+Math.sin(seed)*(.23+drift),actor.root.position.y+.12+(n%12)/12*1.6+progress*.12,actor.root.position.z+Math.cos(seed)*(.13+drift));
        dummy.rotation.set(0,camera.rotation.y+(reduced?0:Math.sin(seed+time)*.13),0);dummy.scale.setScalar(.8+(Math.sin(seed)*.5+.5)*.45);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);
      }
      batch.material.opacity=1-smooth((vision.time-8.5)/.5);batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();stats.binaryFragments+=count;
    }
  }
  function loadSetAssets(){
    const treat=object=>object.traverse(item=>{for(const mat of [item.material].flat().filter(Boolean))if(mat.isMeshStandardMaterial)liquidUniforms.push(attachPrologueLiquid(mat));});
    assets=createPrologueAssets({
      onCar(gltf){
        const prepared=prepareCruiser(gltf.scene);
        prepared.model.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))for(const value of Object.values(m))if(value?.isTexture&&!assets?.owns(value))ownedTextures.add(value);});
        for(const child of car.children)if(!child.isLight&&child!==headlight.target&&child!==entertainment.group)child.visible=false;
        cruiser=prepared;car.add(cruiser.model);treat(cruiser.model);
        rain.attachWindshield(cruiser.model.getObjectByName('BodyWindshield'));
      },
      onCast(role,gltf){
        // Each optional role arrives independently; a missing asset retains only
        // that role's procedural fallback. Never replace the other identity.
        const police=role==='clarence';if(!police&&role!=='stanley')return;
        const name=police?'Clarence':'Stanley Yates',old=police?clarence:stanley;
        const actor=createTexturedPrologueActor({name,police,gltf,onMaterial:mat=>liquidUniforms.push(attachPrologueLiquid(mat))});
        actor.root.position.copy(old.root.position);actor.root.quaternion.copy(old.root.quaternion);actor.root.scale.copy(old.root.scale);actor.root.visible=old.root.visible;
        // Keep the hidden fallback owned by this set for deterministic teardown.
        old.root.visible=false;actor.root.add(old.root);location.add(actor.root);
        if(police)clarence=actor;else stanley=actor;
        stats.cast='Distinct Clarence and Stanley identities, adapted from CC0 NPC male Steve';
        stats.castRoles[role]=`cast-${role}.glb`;
      },
      onGround(key,map){groundMaterial[key]=map;groundMaterial.needsUpdate=true;},
      onSky(map){sky.material.uniforms.skyMap.value=map;sky.material.uniforms.hasMap.value=1;},
      onRoad(key,map){roadMaterial[key]=map;roadMaterial.needsUpdate=true;},
      onWood(key,map){woodMaterial[key]=map;if(key==='map')woodMaterial.color.setHex(0xffffff);woodMaterial.needsUpdate=true;},
      onMist(map){
        roadMist=group(location);roadMist.name='Low roadside mist';
        const material=new THREE.MeshBasicMaterial({map,transparent:true,opacity:.11,depthWrite:false,side:THREE.DoubleSide,color:0x819397});
        const geometry=new THREE.PlaneGeometry(20,3);
        for(let i=0;i<(touch?3:6);i++){const sheet=mesh(roadMist,geometry,material,0,.7,0);sheet.userData.index=i;}
      },
    });
  }
  function start() {
    if(dead)return;disposeSet();scene=new THREE.Scene();scene.background=skyNormal.clone();scene.fog=new THREE.FogExp2(fogNormal.clone(),.019);
    location=new THREE.Group();const alignment=approachStageTransform(spawn);location.rotation.y=alignment.yaw;location.position.fromArray(alignment.position);scene.add(location);
    camera=new THREE.PerspectiveCamera(65,1,.035,175);location.add(camera);
    worldStage=new THREE.Group();worldStage.name='Temporary prologue cast and lighting';worldStage.position.copy(location.position);worldStage.quaternion.copy(location.quaternion);worldStage.visible=false;scene.add(worldStage);
    const castFill=new THREE.HemisphereLight(0xb8c4cd,0x302922,.40);worldStage.add(castFill);
    worldFog=new THREE.FogExp2(fogNormal.clone(),.075);worldBackground=new THREE.Color();
    hemi=new THREE.HemisphereLight(0xa9b8c4,0x303021,1.12);scene.add(hemi);
    moon=new THREE.DirectionalLight(0xb3c9db,1.85);moon.position.set(-5,9,3);scene.add(moon);
    sky=new THREE.Mesh(new THREE.SphereGeometry(155,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{red:{value:0},liquid:{value:0},clock:{value:0},skyMap:{value:null},hasMap:{value:0}},vertexShader:'varying vec3 vWorld; void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vWorld; uniform float red,liquid,clock,hasMap;uniform sampler2D skyMap; void main(){vec3 n=normalize(vWorld);float h=smoothstep(-.1,.6,n.y+liquid*sin(n.x*18.+n.z*11.+clock*.7)*.10);vec3 dusk=mix(vec3(.16,.20,.21),vec3(.021,.035,.064),h);vec3 blood=mix(vec3(.29,.048,.024),vec3(.080,.008,.009),h);vec3 color=mix(dusk,blood,red);color=mix(color,vec3(.17,.29,.28)+color*.3,liquid*.5);vec2 skyUV=vec2(atan(n.z,n.x)/6.2831853+.625,asin(clamp(n.y,-1.,1.))/3.14159265+.5);vec3 photo=texture2D(skyMap,skyUV).rgb;float veil=.5+.5*sin(n.x*5.+sin(n.z*7.+clock*.014)+n.y*9.);color=mix(color,mix(photo*.75,color,.28+veil*.21),hasMap*(1.-red*.7));gl_FragColor=vec4(color,1.);}' }));location.add(sky);
    foliage=createFoliageMotion({playerPush:false});
    buildLandscape();buildCar();clarence=createPrologueActor({name:'Clarence',police:true});stanley=createPrologueActor({name:'Stanley Yates',police:false});location.add(clarence.root,stanley.root);
    const treated=new Set();location.traverse(item=>{for(const mat of Array.isArray(item.material)?item.material:item.material?[item.material]:[])if(mat.isMeshStandardMaterial&&!treated.has(mat)){treated.add(mat);liquidUniforms.push(attachPrologueLiquid(mat));}});
    buildVisions();
    flashlight=new THREE.SpotLight(0xffe9cc,0,25,.48,.60,1.2);flashlight.position.set(-.26,-.22,-.53);flashlight.target.position.set(.08,-.08,-8);camera.add(flashlight,flashlight.target);
    // A low-frequency camera-space veil guarantees the vanishing is concealed.
    haze=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{amount:{value:0},red:{value:0},clock:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.0,1.);}',fragmentShader:'varying vec2 vUv;uniform float amount,red,clock;void main(){float cloud=.88+.12*sin(vUv.x*9.+sin(vUv.y*8.+clock*.09))*sin(vUv.y*7.-clock*.06);vec3 c=mix(vec3(.19,.24,.23),vec3(.32,.075,.050),red);gl_FragColor=vec4(c,clamp(amount*cloud,0.,1.));}'}));haze.frustumCulled=false;haze.renderOrder=1000;scene.add(haze);
    live=true;stats.live=true;stats.error=null;stats.cast=PROLOGUE_CAST_PROVENANCE;stats.castRoles={clarence:'procedural fallback',stanley:'procedural fallback'};
    if(typeof document!=='undefined')loadSetAssets();
  }
  function render(frame = {}) {
    if(dead)return;if(!live)start();
    const world=getWorld(),locomotion=frame.motion||samplePrologueMotion(frame,{worldAvailable:!!world?.scene?.isScene}),b=locomotion.blocking,transition=locomotion,vision=prologueVisionState(frame);
    const time=locomotion.time,p=b.progress,reduced=!!frame.reduced,chapter=b.chapter;
    foliage.update(time,null,reduced);
    const width=Math.max(1,renderer.domElement.clientWidth||renderer.domElement.width),height=Math.max(1,renderer.domElement.clientHeight||renderer.domElement.height),key=`${width}:${height}`,fov=transition.world?(world.camera?.fov??70):65;
    if(size!==key||camera.fov!==fov){camera.aspect=width/height;camera.fov=fov;camera.updateProjectionMatrix();size=key;}
    const cameraParent=vision.room?room:location;if(camera.parent!==cameraParent)cameraParent.add(camera);
    applyPrologueCamera(camera,locomotion,frame.player);
    const motion=reduced?0:1;
    location.visible=!vision.room;room.visible=vision.room;
    room.userData.roomUpdate?.(Math.max(0,vision.time-1.2),reduced);liquidVeil.update(frame);
    // Directional moon shape carries the exterior; restrained ambient fill keeps
    // corn and people readable without flattening their surfaces. No extra lights.
    hemi.intensity=vision.room?0:1.12+vision.lightning*1.8;moon.intensity=vision.room?0:1.85+vision.lightning*4;
    flashlight.intensity=frame.player?.flashlightOn?18:0;
    for(const uniforms of liquidUniforms){uniforms.amount.value=vision.liquid;uniforms.time.value=time;}
    const drive=frame.driving||samplePrologueDriving(frame);
    const moving=chapter==='car'||chapter==='dispatch';
    car.position.fromArray(drive.position);car.rotation.set(drive.bodyPitch,drive.yaw,drive.bodyRoll,'YXZ');car.updateMatrix();
    if(b.inCar&&!vision.room){camera.position.applyMatrix4(car.matrix);camera.quaternion.premultiply(car.quaternion);}
    const confrontation=sampleRoadsideConfrontation(frame)||{bang:0,impact:0};
    if(b.inCar&&!reduced&&confrontation.impact){camera.position.x+=confrontation.impact*.012;camera.rotation.z+=confrontation.impact*.008;}
    sky.position.copy(camera.position);
    rain.update(time,camera.position,drive,reduced,!vision.room&&!transition.world&&!frame.returning,!frame.returning);
    road.visible=!frame.returning;
    field.visible=chapter!=='car'&&(chapter!=='dispatch'||p>.8);car.visible=!frame.returning;
    const exitPose=frame.exitPose||samplePrologueExit((frame.exitProgress??b.exit)*EXIT_SECONDS);door.rotation.y=exitPose.door*1.05;wheel.rotation.z=steeringAngle(drive.steer);headlight.intensity=moving?6:3;cruiser?.update(drive,exitPose.door);
    const wake=samplePrologueWake(frame);entertainment.update(wake);car.updateWorldMatrix(true,true);
    frame.radioHandTarget=entertainment.knob.getWorldPosition(new THREE.Vector3()).toArray();frame.radioHandReach=wake.reach;frame.radioHandTurn=wake.turn;
    const doorWorld=(cruiser?.door||door).localToWorld(new THREE.Vector3(-.055,.035,.48));
    frame.exitHandTarget=doorWorld.toArray();frame.exitHandQuaternion=(cruiser?.door||door).getWorldQuaternion(new THREE.Quaternion()).toArray();
    if(roadMist){roadMist.visible=!vision.room&&!frame.returning;for(const sheet of roadMist.children){const i=sheet.userData.index;sheet.position.set(-4.3+(reduced?0:Math.sin(time*.07+i)*1.2),.65,camera.position.z-12-i*16);}}
    const speech=String(frame.speaker||'').toLowerCase(),isClarence=speech.includes('clarence'),isStanley=speech.includes('stanley');
    const menVisible=vision.escortsVisible&&!vision.room&&(chapter==='rupture'||b.menVisible);
    clarence.root.visible=menVisible;stanley.root.visible=menVisible&&chapter!=='car'&&chapter!=='dispatch';
    const driver=locomotion.actors.clarence,father=locomotion.actors.stanley,roadside=b.inCar||chapter==='emergence';
    clarence.root.position.fromArray(driver.position);clarence.root.position.y+=vision.rise;clarence.root.rotation.set(0,driver.yaw,0,'YXZ');
    if(driver.mode==='drive'){clarence.root.position.applyMatrix4(car.matrix);clarence.root.quaternion.premultiply(car.quaternion);}
    stanley.root.position.fromArray(father.position);stanley.root.position.y+=vision.rise;stanley.root.rotation.set(0,father.yaw,0,'YXZ');
    const bangTargets=father.mode==='bang'?[1,-1].map(sign=>stanley.root.worldToLocal(location.localToWorld(new THREE.Vector3(BANG_WINDOW_TARGET[0],BANG_WINDOW_TARGET[1],BANG_WINDOW_TARGET[2]+sign*.18))).toArray()):null;
    const effect={corpse:false,dissolve:vision.dissolve};
    const driverAct=performanceFor(frame,'clarence',driver,(locomotion.listener?.position||b.camera)),fatherAct=performanceFor(frame,'stanley',father,(locomotion.listener?.position||b.camera));
    (cruiser?.steering||wheel).updateWorldMatrix(true,false);
    clarence.pose({wheelMatrix:(cruiser?.steering||wheel).matrixWorld,time,phase:driver.phase,mode:vision.limp?'limp':driver.mode,speaking:isClarence,look:driverAct.look,reduced,steer:drive.steer,performance:driverAct,gait:driver.gait,support:driver.support,exitPose:driver.exitPose,limpWeight:vision.limpWeight,...effect});
    stanley.pose({time,phase:father.phase,mode:vision.limp?'limp':father.mode,speaking:isStanley,distress:roadside?1:chapter==='disappearance'?.7:.32,look:fatherAct.look,gesture:fatherAct.emphasis*.30,bang:father.bang??confrontation.bang,bangTargets,reduced,performance:fatherAct,crouch:father.crouch||0,runWeight:father.runWeight,gait:father.gait,support:father.support,limpWeight:vision.limpWeight,...effect});
    stats.confrontation={...confrontation,windowTargets:bangTargets,cameraImpact:reduced?0:confrontation.impact};
    const hallucination=hallucinations.update(frame,[clarence,stanley]);
    for(const human of [clarence,stanley])human.root.traverse(o=>{for(const m of [o.material].flat().filter(Boolean)){const u=m.userData?.prologueLiquid;if(u){u.handover.value=hallucinations.stats.status==='ready'?hallucination.zombie:0;u.lift.value=chapter==='rupture'?vision.dissolve:0;}}});
    ribbons.visible=chapter==='rupture'&&vision.time>=5&&vision.time<9;
    for(const [i,root]of ribbons.children.entries()){const actor=i?stanley:clarence;root.position.copy(actor.root.position);root.quaternion.copy(actor.root.quaternion);for(const strand of root.children){strand.material.opacity=smooth((vision.time-5)/1.5)*(1-smooth((vision.time-8.5)/.5));strand.userData.liquid.amount.value=reduced?.25:1;strand.userData.liquid.time.value=time;strand.userData.liquid.lift.value=vision.dissolve;}}
    updateBinary(vision,time,reduced);
    const red=chapter==='rupture'?vision.red:clamp(frame.red),mist=chapter==='rupture'?vision.mist:clamp(frame.mist),cover=Math.max(mist,transition.cover||0);scene.background.copy(skyNormal).lerp(skyRed,red);scene.fog.color.copy(fogNormal).lerp(fogRed,red);scene.fog.density=vision.room?.018:.019+cover*.14;
    sky.material.uniforms.red.value=red;sky.material.uniforms.liquid.value=vision.liquid;sky.material.uniforms.clock.value=time;haze.material.uniforms.red.value=red;haze.material.uniforms.amount.value=Math.max(mist*1.34,(transition.cover||0)*1.34);haze.material.uniforms.clock.value=reduced?0:time;haze.visible=!vision.room&&cover>.001;
    const target=renderer.getRenderTarget(),auto=renderer.autoClear,infoAuto=renderer.info.autoReset,test=renderer.getScissorTest();renderer.getViewport(viewport);renderer.getScissor(scissor);renderer.getClearColor(savedClear);const alpha=renderer.getClearAlpha();
    try {
      renderer.autoClear=true;renderer.info.autoReset=false;renderer.info.reset();renderer.setRenderTarget(null);renderer.setScissorTest(false);
      if(transition.world&&world?.scene&&!vision.room){
        worldFog.color.copy(world.scene.fog?.color||fogNormal).lerp(fogRed,red);worldFog.density=(world.scene.fog?.density??.075)+cover*.14;
        const background=world.scene.background?.isColor?worldBackground.copy(world.scene.background).lerp(skyRed,red):world.scene.background;
        withPrologueWorld(world,{camera,stage:worldStage,actors:[clarence.root,stanley.root,binary,ribbons,haze],fog:worldFog,background,red},(actualScene,cinematicCamera)=>renderer.render(actualScene,cinematicCamera));
      }else renderer.render(scene,camera);
      renderEquipment(camera,frame);
      stats.frames++;stats.draws=renderer.info.render.calls;stats.chapter=chapter;stats.environment=vision.room?'red room':transition.world?'live maze':'staged approach';stats.transitionCover=transition.cover||0;camera.getWorldPosition(cameraWorld);stats.camera={x:cameraWorld.x,y:cameraWorld.y,z:cameraWorld.z,yaw:camera.rotation.y,pitch:camera.rotation.x};stats.menVisible=menVisible;stats.vision={...vision};stats.hallucination={...hallucinations.stats,...hallucination};stats.ribbons=ribbons.visible?ribbons.children.length*3:0;stats.roomContents=vision.room?['projector','original detailed anonymous face projection']:[];stats.liquidMaterials=vision.liquid?liquidUniforms.length:0;stats.flashlight=flashlight.intensity>0;
    } catch(error){stats.error=error.message;throw error;}
    finally {renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test);renderer.setClearColor(savedClear,alpha);renderer.autoClear=auto;renderer.info.autoReset=infoAuto;}
  }
  return {start,render,release:disposeSet,dispose(){disposeSet();dead=true;},diagnostics:()=>({...stats,castRoles:stats.castRoles?{...stats.castRoles}:null,rain:rain?{...rain.stats}:null,assets:assets?{...assets.stats}:null,camera:stats.camera?{...stats.camera}:null,actors:live?[clarence.diagnostics(),stanley.diagnostics()]:[]})};
}
