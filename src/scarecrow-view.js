import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {applyEnvironmentSurface} from './environment-materials.js';
import {optionalAsset} from './asset-safety.js';

function disposeSource(root){
  const resources=new Set();
  root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){resources.add(m);for(const t of Object.values(m))if(t?.isTexture)resources.add(t);}});
  for(const resource of resources)resource.dispose();
}

// Share geometry and textures, while each checkpoint owns its emissive state.
export function prepareScarecrow(source){
  const root=source.clone(true),materials=new Map();
  root.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=false;
    if(!o.geometry.attributes.uv){
      const positions=o.geometry.attributes.position,normals=o.geometry.attributes.normal,uv=new Float32Array(positions.count*2);
      for(let i=0;i<positions.count;i++){
        const nx=Math.abs(normals?.getX(i)||0),ny=Math.abs(normals?.getY(i)||0),nz=Math.abs(normals?.getZ(i)||0);
        uv[i*2]=(nx>nz?positions.getZ(i):positions.getX(i))*1.8;
        uv[i*2+1]=(ny>Math.max(nx,nz)?positions.getZ(i):positions.getY(i))*1.8;
      }
      o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    }
    o.material=[o.material].flat().map(m=>{if(!materials.has(m)){const clone=m.clone();if(m.name==='timber')applyEnvironmentSurface(clone,{kind:'wood'});if(['warning','straw'].includes(m.name))clone.userData.liquidDetail=1;materials.set(m,clone);}return materials.get(m);});
    if(o.material.length===1)o.material=o.material[0];
  });
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<.01)throw Error('Invalid scarecrow dimensions');
  const scale=2.55/size.y;root.scale.multiplyScalar(scale);
  bounds.setFromObject(root);const center=bounds.getCenter(new THREE.Vector3());
  root.position.add(new THREE.Vector3(-center.x,-bounds.min.y,-center.z));
  return {root,materials:[...materials.values()]};
}

export function createScarecrowView(scene,anchors,{touch=false,cloth,loader=new GLTFLoader()}={}){
  const geometry=new THREE.PlaneGeometry(2.15,3.05),records=[];
  const point=new THREE.PointLight(0xaa64ff,0,5,2);scene.add(point);
  const stats={status:'loading',count:anchors.length,active:0,spent:0,source:'CC0 Scarecrow On Post',error:null};
  let disposed=false;
  for(const {group,checkpoint,fallback} of anchors){
    const uniforms={clock:{value:0},spent:{value:0},detail:{value:touch?2:4},strength:{value:1}};
    const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform float clock,spent,strength;uniform int detail;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        float fractal(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){if(i>=detail)break;n+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.1+7.3;a*=.5;}return n;}
        void main(){vec2 p=(vUv-.5)*vec2(1.05,1.5);float r=length(p),flow=fractal(p*5.+vec2(clock*.12,-clock*.09));
          float edge=exp(-abs(r-.40-.022*sin(flow*14.-clock)) * 28.);
          float mist=exp(-r*r*6.)*flow*.38;float ripple=.55+.45*sin(flow*19.-clock*1.3+r*22.);
          vec3 color=mix(vec3(.08,.8,.67),vec3(.75,.03,.95),flow);
          color=mix(color,vec3(.85,.015,.065),spent*.8);
          float a=(edge*(.55+.35*ripple)+mist)*strength;
          if(a<.012)discard;gl_FragColor=vec4(color,a);}`});
    const halo=new THREE.Mesh(geometry,material);halo.position.set(0,1.65,-.08);group.add(halo);
    records.push({group,checkpoint,fallback,halo,uniforms,model:null,materials:[]});
  }
  const ready=optionalAsset(loader.loadAsync(new URL('../assets/field/scarecrow.glb',import.meta.url).href),8000,gltf=>disposeSource(gltf.scene)).then(gltf=>{
    if(disposed){disposeSource(gltf.scene);return;}
    for(const record of records){
      const prepared=prepareScarecrow(gltf.scene);Object.assign(record,{model:prepared.root,materials:prepared.materials});
      record.group.add(record.model);record.fallback.visible=false;
    }
    // Clones own material objects. Their geometry and maps remain shared.
    const sourceMaterials=new Set();gltf.scene.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))sourceMaterials.add(m);});
    for(const material of sourceMaterials)material.dispose();stats.status='ready';
  }).catch(error=>{if(!disposed){stats.status='fallback';stats.error=String(error.message);}});
  function update(game,time,reduced=false,camera){
    if(disposed)return;const field=game.player.zone==='field';stats.active=stats.spent=0;
    let nearest=null,nearestDistance=10;
    for(const record of records){
      const spent=game.progress.activatedCheckpoints.includes(record.checkpoint.id);
      const ready=!spent&&record.checkpoint.index===game.progress.checkpointIndex;
      record.group.userData.readiness=spent?'spent':ready?'ready':'locked';
      const distance=Math.hypot(game.player.x-record.checkpoint.x,game.player.z-record.checkpoint.z);
      record.uniforms.clock.value=reduced?0:time;record.uniforms.spent.value=spent?1:0;
      record.uniforms.strength.value=spent?.12:ready?.72+(reduced?0:Math.sin(time*1.4)*.08):.08;
      record.halo.visible=!field&&distance<16;
      if(camera){record.halo.quaternion.copy(camera.quaternion);record.halo.rotation.x=0;record.halo.rotation.z=0;}
      if(spent)stats.spent++;else stats.active++;
      for(const material of record.materials){
        if(['warning','straw'].includes(material.name)&&cloth?.map&&material.map!==cloth.map){
          material.map=cloth.map;material.normalMap=cloth.normalMap;material.normalScale?.set(.50,.50);
          material.color.setHex(material.name==='warning'?0x766b56:0x9c917b);material.roughness=.96;material.needsUpdate=true;
        }
        material.emissive?.setHex(spent?0x43050d:0x361141);material.emissiveIntensity=spent?.04:ready?.18:.025;
      }
      if(!field&&ready&&distance<nearestDistance){nearest=record;nearestDistance=distance;}
    }
    point.intensity=nearest?2.4:0;
    if(nearest)point.position.set(nearest.checkpoint.x,1.8,nearest.checkpoint.z);
  }
  return {stats,ready,records,update,dispose(){disposed=true;}};
}
