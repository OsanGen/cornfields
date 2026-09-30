import * as THREE from 'three';
import {CELL,WIDTH,HEIGHT,centerOf} from './maze.js';
import {installFieldVisuals} from './field-visuals.js';
import {installNightSky} from './night-sky.js';
import {installZombie} from './zombie.js';
import {installPropDetails,reuseFieldMaterials,tilePropUV} from './prop-details.js';
import {actorPosition} from './hiding.js';
import {GAME_CONFIG} from './game-config.js';
import {interactionLocked} from './grapple.js';
import {createWeatherView} from './weather-view.js';
import {installHands} from './hands.js';
import {strugglePose,nightmareState} from './horror-presentation.js';
import {createCornView} from './corn-view.js';
import {createSurvivalView} from './corn-survival-view.js';

function seeded(seed=719){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const material=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
const up=new THREE.Vector3(0,1,0);
export function createScene(canvas,maze,{touch=false,weather=null}={}){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1:1.5));renderer.setSize(innerWidth,innerHeight,false);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x111d19);scene.fog=new THREE.FogExp2(0x111d19,.096);
  const baseBackground=scene.background.clone(),redBackground=new THREE.Color(0x631d18);
  const stormBackground=new THREE.Color(0x52666b);
  const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.065,90);camera.rotation.order='YXZ';scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xabb9aa,0x4c4329,1.35));
  const moon=new THREE.DirectionalLight(0xadc1b1,1.4);moon.position.set(-30,50,10);scene.add(moon);
  const random=seeded(), dummy=new THREE.Object3D();
  const groundCanvas=document.createElement('canvas');groundCanvas.width=128;groundCanvas.height=128;
  const ctx=groundCanvas.getContext('2d');ctx.fillStyle='#474635';ctx.fillRect(0,0,128,128);
  for(let i=0;i<3300;i++){const b=35+Math.floor(random()*45);ctx.fillStyle=`rgba(${b+12},${b+9},${b},.4)`;ctx.fillRect(random()*128,random()*128,1+random()*3,1+random()*2);}
  const groundTex=new THREE.CanvasTexture(groundCanvas);groundTex.wrapS=groundTex.wrapT=THREE.RepeatWrapping;groundTex.repeat.set(55,58);groundTex.colorSpace=THREE.SRGBColorSpace;
  const floorHeight=maze.cornWorld.height*maze.cornWorld.size;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH*CELL,floorHeight),new THREE.MeshStandardMaterial({map:groundTex,roughness:weather?.state.enabled ? .58 : 1}));floor.rotation.x=-Math.PI/2;floor.position.set(WIDTH*CELL/2,0,floorHeight/2);scene.add(floor);
  const wallCells=[];
  for(let z=0;z<HEIGHT;z++)for(let x=0;x<WIDTH;x++)if(maze.grid[z][x]&&!maze.hideAnchors?.some(a=>x===a.corridorCell.x+a.cornSide.x&&z===a.corridorCell.z+a.cornSide.z))wallCells.push({x,z});
  const walls=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material(0x394630),wallCells.length);
  const stalks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.034,1,4),material(0x92915b),wallCells.length*7);
  const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.quadraticCurveTo(.22,.23,.07,.6);leafShape.quadraticCurveTo(-.19,.25,0,0);
  const leafGeo=new THREE.ShapeGeometry(leafShape,2);const leafMat=new THREE.MeshStandardMaterial({color:0x68734a,side:THREE.DoubleSide,roughness:1});
  const leaves=new THREE.InstancedMesh(leafGeo,leafMat,wallCells.length*21);
  const ears=new THREE.InstancedMesh(new THREE.ConeGeometry(.058,.3,4),material(0xb3ad73),wallCells.length*7);
  let si=0,li=0;
  wallCells.forEach((c,i)=>{
    const p=centerOf(c.x,c.z),height=2.65+random()*.28;
    const bay=maze.landingZoneCells?.has(`${c.x},${c.z}`);
    dummy.position.set(p.x,height/2,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(bay?0:CELL,height,CELL);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);walls.setColorAt(i,new THREE.Color().setHSL(.18+random()*.05,.20,.17+random()*.07));
    for(let j=0;j<7;j++){
      const x=p.x+(random()-.5)*CELL,z=p.z+(random()-.5)*CELL,h=2.9+random()*.6;
      dummy.position.set(x,h/2,z);dummy.rotation.set((random()-.5)*.08,0,(random()-.5)*.08);dummy.scale.set(1,h,1);dummy.updateMatrix();stalks.setMatrixAt(si,dummy.matrix);
      dummy.position.set(x,h+.06,z);dummy.scale.set(1,1,1);dummy.updateMatrix();ears.setMatrixAt(si++,dummy.matrix);
      for(let k=0;k<3;k++){
        dummy.position.set(x,2.2+k*.3,z);dummy.rotation.set(-.7+random()*.35,random()*Math.PI*2,(random()-.5)*1.1);dummy.scale.set(1.5,1.6,1);dummy.updateMatrix();leaves.setMatrixAt(li++,dummy.matrix);
      }
    }
  });scene.add(walls,stalks,leaves,ears);if(maze.cornWorld)walls.visible=false;
  // Loose straw along the ground, one instanced draw call.
  const straw=new THREE.InstancedMesh(new THREE.BoxGeometry(.022,.012,.23),material(0x79734e),1700);
  for(let i=0;i<1700;i++){dummy.position.set(random()*WIDTH*CELL,.015,random()*HEIGHT*CELL);dummy.rotation.set(0,random()*Math.PI,0);dummy.scale.set(1,1,1);dummy.updateMatrix();straw.setMatrixAt(i,dummy.matrix);}scene.add(straw);
  const wood=material(0x62614a),darkWood=material(0x363d2e),metal=material(0x343d36),pale=material(0x9d9d70);
  const cloth=material(0x3d4030),barrelPaint=material(0x55716c),barrelBands=metal.clone();
  function box(w,h,d,mat,x,y,z,parent=scene){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
  function textSign(text,w,h){
    const c=document.createElement('canvas');c.width=1024;c.height=256;const cx=c.getContext('2d');
    cx.fillStyle='#242f25';cx.fillRect(0,0,1024,256);cx.strokeStyle='#899475';cx.lineWidth=3;cx.strokeRect(15,15,994,226);
    cx.font='76px Georgia';cx.fillStyle='#d5d4ac';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(text,512,136);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:tex,roughness:1,emissive:0x323523,emissiveIntensity:.22}));
  }
  const doorPos=centerOf(maze.door.x,maze.door.z);
  const door=new THREE.Group();door.position.set(doorPos.x-CELL/2,0,doorPos.z);scene.add(door);
  box(CELL,2.75,.14,wood,CELL/2,1.375,0,door);
  for(let i=1;i<7;i++)box(.025,2.71,.015,darkWood,i*CELL/7,1.375,.079,door);
  box(CELL,.13,.07,darkWood,CELL/2,.48,.10,door);box(CELL,.13,.07,darkWood,CELL/2,2.3,.10,door);box(.07,.23,.12,metal,CELL-.22,1.17,.14,door);
  const entranceObjects=[box(.2,3.3,.24,darkWood,doorPos.x-CELL/2-.1,1.65,doorPos.z),box(.2,3.3,.24,darkWood,doorPos.x+CELL/2+.1,1.65,doorPos.z)];
  const sign=textSign('C O R N F I E L D',3.5,.78);sign.position.set(doorPos.x,3.12,doorPos.z+.17);scene.add(sign);
  entranceObjects.push(sign);
  // A modest pool of light at the threshold.
  const doorLight=new THREE.PointLight(0xf1c087,28,11,1.6);doorLight.position.set(doorPos.x,3.1,doorPos.z+1.1);scene.add(doorLight);
  box(.15,.22,.15,new THREE.MeshStandardMaterial({color:0xffd29a,emissive:0xffb55f,emissiveIntensity:2}),doorPos.x,3.3,doorPos.z+.7);
  function scarecrow(x,z,scale=1,broken=false){
    const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(scale);scene.add(group);
    box(.13,2.6,.13,darkWood,0,1.3,0,group);const arm=box(1.65,.12,.14,wood,0,2,0,group);if(broken)arm.rotation.z=-.28;
    const cloak=new THREE.Mesh(tilePropUV(new THREE.ConeGeometry(.39,1.2,5,1,true),8,4),cloth);cloak.position.y=1.7;group.add(cloak);
    const head=new THREE.Mesh(tilePropUV(new THREE.SphereGeometry(.23,7,5),5,2),pale);head.position.y=2.55;group.add(head);
    const hat=new THREE.Mesh(tilePropUV(new THREE.ConeGeometry(.44,.20,6),4,1),cloth);hat.position.y=2.79;group.add(hat);
    box(.065,.08,.035,metal,-.08,2.59,.21,group);box(.065,.08,.035,metal,.08,2.59,.21,group);
    return group;
  }
  for(const l of maze.landmarks){
    if(l.id==='red'){
      box(.10,2.5,.10,wood,l.x-.75,1.25,l.z);
      box(.26,.36,.26,new THREE.MeshStandardMaterial({color:0xaf5132,emissive:0xb83415,emissiveIntensity:1.8}),l.x-.75,2.35,l.z);
      const glow=new THREE.PointLight(0xff5728,20,8,1.8);glow.position.set(l.x-.65,2.3,l.z);scene.add(glow);
    }else if(l.id==='cross'){scarecrow(l.x,l.z-.63,.85,true);}
    else for(let i=0;i<3;i++){
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.25,.28,.8,9),barrelPaint);barrel.position.set(l.x+.64,.4,l.z+(i-1)*.6);scene.add(barrel);
      for(const y of [.15,.65]){const band=new THREE.Mesh(new THREE.TorusGeometry(.269,.018,3,9),barrelBands);band.rotation.x=Math.PI/2;band.position.set(barrel.position.x,y,barrel.position.z);scene.add(band);}
    }
  }
  // A readable child silhouette confirms the objective without another asset.
  const daughter=new THREE.Group();daughter.position.set(maze.center.x,0,maze.center.z);scene.add(daughter);
  const coat=material(0xac6650),dress=material(0xc8c7a6),hair=material(0x29221a),face=material(0xcaa888);
  box(.34,.55,.22,coat,0,.78,0,daughter);box(.37,.25,.23,dress,0,.41,0,daughter);
  for(const side of [-1,1]){box(.10,.28,.13,darkWood,side*.10,.15,0,daughter);box(.085,.46,.10,coat,side*.225,.78,.01,daughter);}
  const childHead=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),face);childHead.position.set(0,1.18,0);daughter.add(childHead);
  const childHair=new THREE.Mesh(new THREE.SphereGeometry(.171,12,8,0,Math.PI*2,0,Math.PI*.65),hair);childHair.position.set(0,1.21,0);daughter.add(childHair);
  const centerGlow=new THREE.PointLight(0xdcca8c,24,14,1.8);centerGlow.position.set(maze.center.x,4,maze.center.z);scene.add(centerGlow);
  const rewardRings=maze.checkpoints.map(cp=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.035,4,24),new THREE.MeshBasicMaterial({color:0xb6be87}));ring.rotation.x=Math.PI/2;ring.position.set(cp.x,.025,cp.z);scene.add(ring);return {ring,id:cp.id};});
  for(const a of maze.hideAnchors){
    const mark=textSign('CORN / E',.67,.18);mark.position.set(a.x+a.cornSide.x*.97,1.45,a.z+a.cornSide.z*.97);mark.rotation.y=a.entryYaw+Math.PI;scene.add(mark);
    for(const side of [-1,1])box(.07,1.1,.07,wood,a.x+a.cornSide.x*1.04+a.cornSide.z*side*.46,.55,a.z+a.cornSide.z*1.04-a.cornSide.x*side*.46);
  }
  const enemy=new THREE.Group();scene.add(enemy);
  const skin=new THREE.MeshStandardMaterial({color:0x1b231d,roughness:1});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,1.05,3,6),skin);body.position.y=1.3;enemy.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.205,7,5),material(0x969879));head.scale.y=1.3;head.position.y=2.21;enemy.add(head);
  const limbs=[];for(const side of [-1,1]){
    const arm=box(.11,1.15,.12,skin,side*.4,1.18,0,enemy);arm.rotation.z=side*.12;limbs.push(arm);
    limbs.push(box(.13,.85,.15,skin,side*.16,.43,0,enemy));
    box(.049,.025,.035,new THREE.MeshStandardMaterial({color:0xe6cc8b,emissive:0xb39b4a,emissiveIntensity:1.3}),side*.078,2.25,.18,enemy);
  }
  const flashlight=new THREE.SpotLight(0xe9edce,38,15,.53,.75,1.65);flashlight.position.set(.16,-.14,-.12);camera.add(flashlight);const beamTarget=new THREE.Object3D();beamTarget.position.set(0,0,-8);camera.add(beamTarget);flashlight.target=beamTarget;
  camera.layers.enable(1);
  const handLight=new THREE.HemisphereLight(0xb4bdad,0x514234,1.6);handLight.layers.set(1);camera.add(handLight);
  const gun=new THREE.Group();camera.add(gun);
  const gunMetal=new THREE.MeshStandardMaterial({color:0x49524d,roughness:.42,metalness:.65});
  box(.075,.13,.075,darkWood,.20,-.22,-.29,gun);box(.087,.072,.30,gunMetal,.20,-.14,-.38,gun);
  box(.025,.016,.025,metal,.20,-.095,-.50,gun);
  const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.06,5,3),new THREE.MeshBasicMaterial({color:0xffd89b}));muzzle.position.set(.20,-.14,-.55);gun.add(muzzle);muzzle.visible=false;
  let shotFlash=0,gunRecoil=0,lastRenderTime=0;
  const knife=new THREE.Group();camera.add(knife);knife.visible=false;
  const handMaterial=material(0x9b7861,.9);
  const placeholderHand=box(.085,.095,.13,handMaterial,0,-.025,.08,knife);
  box(.065,.065,.20,darkWood,0,0,.025,knife);
  box(.12,.025,.025,gunMetal,0,0,-.08,knife);
  const blade=new THREE.Mesh(new THREE.ConeGeometry(.027,.29,4),gunMetal);
  blade.rotation.x=-Math.PI/2;blade.scale.x=.48;blade.position.z=-.225;knife.add(blade);
  const forearm=box(.085,.09,.34,handMaterial,.02,-.055,.29,knife);forearm.rotation.x=-.12;
  const bracingHand=box(.09,.085,.14,handMaterial,-.065,-.055,.08,knife);
  const hands=installHands({gun,knife,placeholders:[placeholderHand,forearm,bracingHand]});
  for(const group of [gun,knife])group.traverse(object=>{if(object.isMesh)object.layers.set(1);});
  const knifeStart=new THREE.Vector3(.16,-.15,-.46),eyeTarget=new THREE.Vector3(),knifeEnd=new THREE.Vector3(),knifeDirection=new THREE.Vector3(),knifeForward=new THREE.Vector3(0,0,-1);
  // One reusable local foliage pocket. All anchors share its geometry/materials.
  const pocket=new THREE.Group();scene.add(pocket);pocket.visible=false;
  const pocketStalks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.015,.03,2.8,4),material(0x828651),100);
  const pocketLeaves=new THREE.InstancedMesh(leafGeo,leafMat,300);
  for(let i=0;i<100;i++){
    const angle=random()*Math.PI*2,r=1.25+random()*2;
    const x=Math.sin(angle)*r,z=Math.cos(angle)*r;
    dummy.position.set(x,1.4,z);dummy.rotation.set(0,angle,0);dummy.scale.set(1,1,1);dummy.updateMatrix();pocketStalks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<3;j++){dummy.position.set(x,.9+j*.52,z);dummy.rotation.set(-.5,angle+j*1.7,.3);dummy.scale.set(2.2,2.3,1);dummy.updateMatrix();pocketLeaves.setMatrixAt(i*3+j,dummy.matrix);}
  }
  pocket.add(pocketStalks,pocketLeaves);
  // Sparse particles in the beam, all in one geometry and draw call.
  const dustData=new Float32Array(900);for(let i=0;i<900;i+=3){dustData[i]=(random()-.5)*22;dustData[i+1]=random()*5;dustData[i+2]=(random()-.5)*22;}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustData,3));const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xadb89a,size:.023,transparent:true,opacity:.24,depthWrite:false}));scene.add(dust);
  // Legacy remains available for identical-camera comparisons and immediate rollback.
  const parameters=new URLSearchParams(location.search);
  const requested=parameters.get('visuals')||'field';
  // The old sample URL now gets the complete fence-lined field as well.
  const mode=requested==='legacy'?'legacy':'field';
  const detailsEnabled=mode!=='legacy'&&parameters.get('details')!=='off';
  const skyEnabled=mode!=='legacy'&&parameters.get('sky')!=='off';
  const visuals={mode,status:mode==='legacy'?'legacy':'loading',error:null,stats:null,
    sky:{status:skyEnabled?'loading':'off',error:null,stats:null}};
  visuals.hands=hands.stats;
  const weatherView=weather?createWeatherView(scene,weather):null;
  const cornView=createCornView(scene,maze);visuals.corn=cornView.stats;
  const survivalView=createSurvivalView(scene,maze);
  visuals.survival=survivalView.stats;
  if(maze.survivalLayout){const d=maze.cornWorld.doors[maze.survivalLayout.outer],label=textSign('C O R N F I E L D',2.3,.5);label.position.set(d.x,2.7,d.z-.1);label.rotation.y=Math.PI;scene.add(label);}
  visuals.weather=weatherView?.stats||{enabled:false};
  let fieldVisuals=null;
  const fieldReady=mode==='legacy'?Promise.resolve():installFieldVisuals({scene,maze,camera,floor,door,entranceObjects,
    legacy:{cells:wallCells,walls,stalks,leaves,ears,straw},mode,details:detailsEnabled,wet:weather?.state.enabled}).then(result=>{
      fieldVisuals=result;visuals.status='ready';visuals.stats=result.stats;
      cornView.setMaterials(result.materials);
      survivalView.setCorn(result.introCorn);
      if(detailsEnabled)reuseFieldMaterials({wood,darkWood,bands:barrelBands},result.materials);
    }).catch(error=>{visuals.status='fallback';visuals.error=error.message;console.warn('Field visuals unavailable; using original scene.',error.message);});
  let nightSky=null;
  const skyReady=skyEnabled?installNightSky({scene,camera}).then(result=>{
    nightSky=result;visuals.sky.status='ready';visuals.sky.stats=result.stats;
  }).catch(error=>{
    visuals.sky.status='fallback';visuals.sky.error=error.message;
    console.warn('Night sky unavailable; using original background.',error.message);
  }):Promise.resolve();
  let zombie=null;
  visuals.zombie={status:'loading',error:null};
  const zombieReady=installZombie(enemy).then(result=>{
    zombie=result;visuals.zombie.status='ready';
  }).catch(error=>{visuals.zombie.status='fallback';visuals.zombie.error=error.message;console.warn('Zombie unavailable; using original enemy.',error.message);});
  visuals.details={status:detailsEnabled?'loading':'off'};
  const detailsReady=detailsEnabled?installPropDetails({cloth,sack:pale,barrel:barrelPaint}).then(result=>{
    visuals.details=result;
  }):Promise.resolve();
  // Zombie is optional and can install later; its own deadline prevents a late commit.
  const ready=Promise.all([fieldReady,skyReady,detailsReady,hands.ready]);
  function resize(){const width=canvas.clientWidth||innerWidth,height=canvas.clientHeight||innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  addEventListener('resize',resize);
  function render(g,time,reduced=false){
    const renderDt=Math.max(0,Math.min(.05,time-lastRenderTime));lastRenderTime=time;
    shotFlash=Math.max(0,shotFlash-renderDt);gunRecoil=Math.max(0,gunRecoil-renderDt);
    const playerAt=actorPosition(g,'player'),enemyAt=actorPosition(g,'enemy');
    const q=g.interaction,locked=interactionLocked(g),inCorn=g.player.hidden||g.player.cornZoneId;
    scene.fog.density=inCorn?.30:g.cornSurvival&&!g.cornSurvival.complete&&g.player.z>84?.22:.096;pocket.visible=false;
    if(pocket.visible){const anchor=maze.landingZones.find(a=>a.id===g.player.cornZoneId);pocket.position.set(anchor?.pocket.x??playerAt.x,0,anchor?.pocket.z??playerAt.z);}
    gun.visible=g.mode==='playing'&&!locked;muzzle.visible=shotFlash>0;
    gun.position.set(-.035,.02,-.20+(reduced?0:gunRecoil*.32));
    if(g.mode==='menu'){
      camera.position.set(maze.spawn.x+1.9,1.66,maze.spawn.z+1.7);
      const entrance=maze.survivalLayout?maze.cornWorld.doors[maze.survivalLayout.outer]:doorPos;
      camera.lookAt(entrance.x-.25,1.7,entrance.z);flashlight.intensity=15;
    }else{
      const bob=reduced||!g.player.moving?0:Math.sin(g.steps*7)*.021;
      camera.position.set(playerAt.x,GAME_CONFIG.player.eyeHeight+bob,playerAt.z);camera.rotation.set(g.player.pitch,g.player.yaw,0,'YXZ');
      if(locked){
        const t=Math.max(0,time-q.phaseStartedAt);
        const lowered=q.phase==='tackle'?Math.min(1,t/GAME_CONFIG.grapple.tackleSeconds):1;
        camera.position.y=q.phase==='throw'?.48+(GAME_CONFIG.player.eyeHeight-.48)*Math.min(1,t/GAME_CONFIG.grapple.throwSeconds):GAME_CONFIG.player.eyeHeight-(GAME_CONFIG.player.eyeHeight-.48)*lowered;
        camera.rotation.x=q.phase==='throw'?-.04:.15;
        camera.rotation.z=reduced?0:q.phase==='tackle'?Math.sin(lowered*Math.PI)*.035:0;
      }
      flashlight.intensity=g.player.flashlightOn?38:0;
    }
    door.rotation.y=-g.doorAmount*1.68;
    enemy.visible=g.enemy.visible;enemy.position.set(enemyAt.x,reduced?0:Math.sin(time*3)*.025,enemyAt.z);enemy.rotation.y=(g.enemy.yaw||0)+Math.PI;
    if(!zombie){enemy.rotation.z=g.enemy.state==='staggered'?-1.15:g.enemy.state==='flashlight_recoil'?.3:0;}
    if(!reduced)limbs.forEach((l,i)=>l.rotation.x=Math.sin(g.enemy.step*4+i*Math.PI)*.12);
    zombie?.update(g,time);
    knife.visible=locked&&['tackle','qte','stab'].includes(q.phase);
    if(knife.visible){
      const worldEye=zombie?.getEyeWorld?.('left',eyeTarget);
      if(!worldEye)eyeTarget.set(enemyAt.x,.93,enemyAt.z);
      // Keep the actual animated face in view from the lowered struggle camera.
      const rise=eyeTarget.y-camera.position.y;
      const run=Math.hypot(eyeTarget.x-camera.position.x,eyeTarget.z-camera.position.z);
      camera.rotation.x=Math.atan2(rise,Math.max(.1,run))-.09;
      camera.updateMatrixWorld(true);
      camera.worldToLocal(eyeTarget);
      const pose=strugglePose(q,time,reduced),progress=pose.progress;
      knifeDirection.copy(eyeTarget).sub(knifeStart).normalize();
      knifeEnd.copy(eyeTarget).addScaledVector(knifeDirection,-.37);
      knife.position.copy(knifeStart).lerp(knifeEnd,progress);
      knife.position.x+=pose.tremorX;knife.position.y+=pose.tremorY;
      knife.quaternion.setFromUnitVectors(knifeForward,knifeDirection);
      knife.rotateZ(pose.roll);
      bracingHand.position.x=-.065-.025*progress;
    }
    const nightmare=parameters.get('horror')==='off'?{amount:0,rain:0,sky:g.skyRedUntil>g.elapsed?1:0}:nightmareState(g,reduced),red=nightmare.sky;
    const flash=reduced||g.interaction||red>0?0:weather?.state.lightning||0;
    scene.background.copy(baseBackground).lerp(redBackground,red);
    scene.background.lerp(stormBackground,flash*.40);
    scene.fog.color.copy(baseBackground).lerp(stormBackground,flash*.16);
    moon.intensity=1.4+flash*2.2;
    for(const {ring,id}of rewardRings)ring.visible=!g.progress.activatedCheckpoints.includes(id);
    dust.position.set(camera.position.x,0,camera.position.z);dust.rotation.y=reduced?0:Math.sin(time*.018)*.1;
    dust.visible=!weather?.state.enabled;
    hands.update(g);cornView.update(g);survivalView.update(g);fieldVisuals?.update(g);nightSky?.update(red,flash);weatherView?.update(camera,g,nightmare);renderer.render(scene,camera);
  }
  return {renderer,scene,camera,render,resize,ready,visuals,
    introCorn:()=>fieldVisuals?.introCorn||null,
    creatureDiagnostics:()=>zombie?.diagnostics(),
    event(event){if(event.type==='shot'){shotFlash=GAME_CONFIG.gun.muzzleFlashSeconds;gunRecoil=.16;}},reset(){shotFlash=0;gunRecoil=0;lastRenderTime=0;}};
}
