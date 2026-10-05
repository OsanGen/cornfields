import * as THREE from 'three';

export const PROLOGUE_RAIN_LIMITS=Object.freeze({desktop:320,touch:180,reducedDesktop:90,reducedTouch:54,maxDrawCalls:2});
const WIDTH=24,HEIGHT=9,mod=(value,period)=>((value%period)+period)%period;

/** Project the actual glass into car-local X/up. The overlay retains every source
 * vertex/index and is parented to that glass, so free look cannot slide the rain.
 * Only this owned clone gains UVs; imported geometry and its ownership stay intact. */
export function createWindshieldRainGeometry(windshield,car){
  if(!windshield?.isMesh||!windshield.geometry?.attributes.position||!car)return null;
  car.updateWorldMatrix(true,true);
  const transform=new THREE.Matrix4().copy(car.matrixWorld).invert().multiply(windshield.matrixWorld);
  const geometry=windshield.geometry.clone(),positions=geometry.attributes.position;
  const uv=new Float32Array(positions.count*2),point=new THREE.Vector3();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(transform);
    uv[i*2]=point.x;uv[i*2+1]=point.y;
    minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
  }
  const width=maxX-minX,height=maxY-minY;
  if(!(width>.01&&height>.01)){geometry.dispose();return null;}
  for(let i=0;i<positions.count;i++){uv[i*2]=Math.max(0,Math.min(1,(uv[i*2]-minX)/width));uv[i*2+1]=Math.max(0,Math.min(1,(uv[i*2+1]-minY)/height));}
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.userData.prologueRainMapping={space:'car-local X/up',width,height,source:windshield.name};
  return geometry;
}

const glassVertex=`varying vec2 vRainUv;
  void main(){vRainUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const glassFragment=`
  varying vec2 vRainUv;
  uniform float clock,density,amount,flow;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  // A fixed spatial cell owns an impact, then a bead and its short gravity trail.
  // Looking around never participates in these coordinates or their lifetime.
  float wetCell(vec2 p,vec2 id,float rate){
    float seed=hash(id),tick=clock*rate+seed*11.0,age=fract(tick);
    vec2 event=id+floor(tick)*vec2(3.17,7.73);
    float select=hash(event+9.1);
    if(select>density)return 0.0;
    float fall=pow(max(0.0,(age-.22)/.78),2.0)*.72;
    vec2 center=id+vec2(.22+.56*hash(event+2.7),.26+.53*hash(event+6.3));
    center+=vec2(flow*fall,-fall);
    vec2 d=p-center;
    float beadR=length(d*vec2(1.0,.84));
    float bead=(1.0-smoothstep(.042,.074,beadR))*smoothstep(.025,.11,age)*(1.0-smoothstep(.82,1.0,age));
    float rim=smoothstep(.035,.046,beadR)*(1.0-smoothstep(.061,.080,beadR));
    float impact=(1.0-smoothstep(.017,.033,abs(length(d)-age*.90)))*(1.0-smoothstep(.045,.15,age));
    float trail=(1.0-smoothstep(.009,.020,abs(d.x+flow*d.y)))*smoothstep(.02,.09,d.y)*(1.0-smoothstep(.12,.12+max(.001,fall),d.y))*smoothstep(.32,.60,age)*(1.0-smoothstep(.80,1.0,age));
    return max(impact*.48,max(bead*(.36+rim*.64),trail*.22));
  }
  float layer(vec2 p,float rate){vec2 id=floor(p);return max(wetCell(p,id,rate),wetCell(p,id+vec2(0.0,1.0),rate));}
  void main(){
    float wet=max(layer(vRainUv*vec2(29.0,12.0),.24),layer(vRainUv*vec2(41.0,17.0)+vec2(7.3,11.8),.16)*.52);
    // Keep the central road/horizon readable; no full-screen tint or refraction.
    float center=(1.0-smoothstep(.20,.42,abs(vRainUv.x-.5)))*(1.0-smoothstep(.12,.30,abs(vRainUv.y-.48)));
    float edge=smoothstep(0.0,.022,vRainUv.x)*smoothstep(0.0,.022,1.0-vRainUv.x)*smoothstep(0.0,.025,vRainUv.y)*smoothstep(0.0,.025,1.0-vRainUv.y);
    float alpha=wet*amount*mix(1.0,.38,center)*edge;
    if(alpha<.002)discard;
    gl_FragColor=vec4(.64,.75,.73,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Two owned draws at most: one fixed line pool outside the cabin, one glass mesh.
 * update() only writes preallocated buffers/scalars. No textures, lights, frame
 * allocations, network requests, wipers or gameplay state are added. */
export function createPrologueRain(location,car,{touch=false}={}){
  const count=touch?PROLOGUE_RAIN_LIMITS.touch:PROLOGUE_RAIN_LIMITS.desktop;
  const reducedCount=touch?PROLOGUE_RAIN_LIMITS.reducedTouch:PROLOGUE_RAIN_LIMITS.reducedDesktop;
  const seeds=new Float32Array(count*5),positions=new Float32Array(count*6);
  let seed=8291;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){const at=i*5;seeds[at]=random()*WIDTH;seeds[at+1]=random()*WIDTH;seeds[at+2]=random()*HEIGHT;seeds[at+3]=8+random()*4;seeds[at+4]=.12+random()*.20;}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.LineBasicMaterial({color:0xa3b8b5,transparent:true,opacity:.23,depthWrite:false,fog:true});
  const rain=new THREE.LineSegments(geometry,material);rain.name='Pooled cinematic exterior rain';rain.frustumCulled=false;rain.renderOrder=3;rain.visible=false;location.add(rain);
  const uniforms={clock:{value:0},density:{value:1},amount:{value:.38},flow:{value:0}};
  const glassMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:glassVertex,fragmentShader:glassFragment,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  let glass=null,dead=false;
  const stats={active:false,reduced:false,poolSize:count,exteriorCount:0,glassSource:null,glassVertices:0,maxDrawCalls:PROLOGUE_RAIN_LIMITS.maxDrawCalls,relativeX:0,relativeZ:0};
  function attachWindshield(windshield){
    if(dead)return false;
    const mapped=createWindshieldRainGeometry(windshield,car);if(!mapped)return false;
    if(glass){glass.removeFromParent();glass.geometry.dispose();}
    glass=new THREE.Mesh(mapped,glassMaterial);glass.name='Glass-anchored cinematic beads and runoff';glass.renderOrder=5;windshield.add(glass);
    stats.glassSource=windshield.name;stats.glassVertices=mapped.attributes.position.count;
    return true;
  }
  function update(time,anchor,drive,reduced=false,active=true,glassActive=true){
    if(dead)return;
    const clock=Number.isFinite(time)?Math.max(0,time):0;
    const yaw=Number.isFinite(drive?.yaw)?drive.yaw:0,speed=Number.isFinite(drive?.speed)?drive.speed:0;
    const sine=Math.sin(yaw),cosine=Math.cos(yaw),relativeX=.65+sine*speed,relativeZ=.18+cosine*speed;
    const activeCount=reduced?reducedCount:count;
    stats.active=!!active;stats.reduced=!!reduced;stats.exteriorCount=active?activeCount:0;stats.relativeX=relativeX;stats.relativeZ=relativeZ;
    rain.visible=!!active;geometry.setDrawRange(0,active?activeCount*2:0);material.opacity=reduced?.14:.23;
    uniforms.clock.value=clock;uniforms.density.value=reduced?.30:1;uniforms.amount.value=reduced?.22:.38;
    // World crosswind projected into the car frame; steering changes flow gently.
    uniforms.flow.value=Math.max(-.22,Math.min(.22,(.65*cosine-.18*sine)*.075));
    if(glass)glass.visible=!!active&&!!glassActive;
    if(!active)return;
    for(let i=0;i<activeCount;i++){
      const s=i*5,at=i*6,fallSpeed=seeds[s+3],length=seeds[s+4];
      const x=anchor.x+mod(seeds[s]+clock*.65-anchor.x+WIDTH*.5,WIDTH)-WIDTH*.5;
      const z=anchor.z+mod(seeds[s+1]+clock*.18-anchor.z+WIDTH*.5,WIDTH)-WIDTH*.5;
      let y=mod(seeds[s+2]-clock*fallSpeed,HEIGHT)+.06;
      const dx=x-car.position.x,dz=z-car.position.z,localX=cosine*dx-sine*dz,localZ=sine*dx+cosine*dz;
      const distance2=(x-anchor.x)**2+(y-anchor.y)**2+(z-anchor.z)**2;
      // Exclude the complete cabin/hood volume and the immediate eye region.
      // Depth-testing keeps correctly occluded rain behind opaque faces/props.
      const hidden=y<1.75&&Math.abs(localX)<1.18&&localZ>-2.7&&localZ<1.55||distance2<.70*.70;
      if(hidden)y=-2;
      positions[at]=x;positions[at+1]=y;positions[at+2]=z;
      positions[at+3]=hidden?x:x-relativeX*length/fallSpeed;positions[at+4]=hidden?y:y+length;positions[at+5]=hidden?z:z-relativeZ*length/fallSpeed;
    }
    geometry.attributes.position.needsUpdate=true;
  }
  function dispose(){
    if(dead)return;dead=true;rain.removeFromParent();geometry.dispose();material.dispose();
    if(glass){glass.removeFromParent();glass.geometry.dispose();glass=null;}glassMaterial.dispose();
    stats.active=false;stats.exteriorCount=0;stats.glassSource=null;stats.glassVertices=0;
  }
  return {rain,get glass(){return glass;},stats,attachWindshield,update,dispose};
}
