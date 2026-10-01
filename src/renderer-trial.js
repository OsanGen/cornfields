// Isolated experiment entrypoint. main.js never imports this module.
import * as THREE from 'three';
import {WebGPURenderer,MeshStandardNodeMaterial} from 'three/webgpu';
import {positionLocal,uniform,vec3,sin} from 'three/tsl';
import {WebGLNodesHandler} from 'three/addons/tsl/WebGLNodesHandler.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

// Pinned Three r186 adapter omits fogDensity from the classic renderer bridge.
// Keep this compatibility shim in the experiment, never patch installed vendor code.
class FogCompatibleHandler extends WebGLNodesHandler{
  updateShaderParameters(builder,parameters){
    super.updateShaderParameters(builder,parameters);
    parameters.uniforms.fogDensity??={value:0};
  }
}

const parameters=new URLSearchParams(location.search),kind=parameters.get('backend')||'classic';
const canvas=document.querySelector('canvas'),status=document.querySelector('output');
const report={requested:kind,three:THREE.REVISION,status:'initializing',frames:0};window.__rendererTrial=report;
let renderer;
try{
  if(kind==='webgpu'){
    renderer=new WebGPURenderer({canvas,antialias:true,forceWebGL:parameters.has('forcewebgl')});
    await renderer.init();report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl2-fallback';
  }else{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true});report.backend='webgl2';
    if(kind==='bridge')renderer.setNodesHandler(new FogCompatibleHandler());
  }
  renderer.setSize(640,360);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x14221a);scene.fog=new THREE.FogExp2(0x14221a,.075);
  const camera=new THREE.PerspectiveCamera(55,640/360,.1,50);camera.position.set(0,1.7,4);camera.lookAt(0,1,0);
  scene.add(new THREE.HemisphereLight(0xd4e3c0,0x332216,3));
  const time=uniform(0),materials=[];
  const material=(color,roughness)=>{const m=kind==='classic'?new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide}):new MeshStandardNodeMaterial({color,roughness,side:THREE.DoubleSide});materials.push(m);return m;};
  const leaf=material(0x6b7d35,.9);
  if(kind!=='classic')leaf.positionNode=positionLocal.add(vec3(sin(time.add(positionLocal.y)).mul(positionLocal.y.max(0).pow(2)).mul(.03),0,0));
  const blade=new THREE.Mesh(new THREE.PlaneGeometry(.65,2.8,1,8).translate(0,1.4,0),leaf);scene.add(blade);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),material(0x514335,.35));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const marker=new THREE.Mesh(new THREE.BoxGeometry(.5,2,.2),material(0x8f7659,1));marker.position.set(-1,1,-2);scene.add(marker);
  const loadStarted=performance.now(),compressed=parameters.has('meshopt');
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const path=compressed?'../assets/meshopt/':'../assets/field/';
  const [arms,pistol]=await Promise.all(['player-arms.glb','service-pistol.glb'].map(name=>loader.loadAsync(new URL(path+name,import.meta.url).href)));
  const grip=new THREE.Group();grip.position.set(.55,1.1,2.4);scene.add(grip);
  const right=arms.scene.getObjectByName('RightArm');grip.add(right);pistol.scene.position.set(-.032,.01,-.12);grip.add(pistol.scene);
  let skinned=0;
  grip.traverse(object=>{
    if(!object.isMesh)return;if(object.isSkinnedMesh)skinned++;
    if(kind==='bridge')object.material=new MeshStandardNodeMaterial().copy(object.material);
    materials.push(object.material);object.frustumCulled=false;
  });
  report.assets={compression:compressed?'meshopt':'none',loadMs:performance.now()-loadStarted,skinnedMeshes:skinned,pistolSlide:!!pistol.scene.getObjectByName('PistolSlide')};
  const render=()=>{renderer.render(scene,camera);report.frames++;};
  report.step=value=>{time.value=value;render();};
  report.fog=value=>{scene.fog.density=value;if(kind==='bridge')for(const material of materials)material.dispose();render();};
  report.resize=()=>{renderer.setSize(480,270);camera.aspect=480/270;camera.updateProjectionMatrix();render();};
  report.dispose=()=>{report.status='disposed';for(const mesh of [blade,ground,marker])mesh.geometry.dispose();grip.traverse(object=>object.geometry?.dispose());for(const material of materials)material.dispose();renderer.dispose();};
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(report.status!=='disposed')report.status='context lost; reload required';});
  render();report.status='ready';status.textContent=`${kind}: ${report.backend} · Three ${THREE.REVISION} · isolated material trial`;
}catch(error){renderer?.dispose();report.status='failed';report.error=error.message;report.stack=error.stack;status.textContent=error.message;}
