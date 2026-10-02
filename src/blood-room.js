import * as THREE from 'three';

// Shared with the earlier vision. Original anonymous procedural projection is
// also the offline/media-failure fallback; it has no identity or stock license.
export function createBloodRoom({rain=false,touch=false}={}){
  const group=new THREE.Group();group.name='Blood room';
  const box=(parent,material,w,h,d,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;};
  const red=new THREE.MeshStandardMaterial({color:0x810c10,side:THREE.BackSide,emissive:0x300103,emissiveIntensity:.42});
  box(group,red,6.4,3.3,9.6,0,1.65);
  const light=new THREE.PointLight(0xff2130,4.2,14,1.5);light.position.set(0,2.9,0);group.add(light);
  const projector=new THREE.Group();projector.position.set(0,.48,1.7);projector.name='Single film projector';group.add(projector);
  const housing=new THREE.MeshStandardMaterial({color:0x242527,roughness:.57,metalness:.3});
  box(projector,housing,.47,.22,.37);box(projector,housing,.34,.07,.29,0,-.14);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(.06,.065,.11,12),housing);lens.position.set(0,0,-.22);lens.rotation.x=Math.PI/2;projector.add(lens);
  const glass=new THREE.Mesh(new THREE.CircleGeometry(.049,12),new THREE.MeshBasicMaterial({color:0xffdac7}));glass.position.set(0,0,-.28);glass.rotation.y=Math.PI;projector.add(glass);
  const projectorLight=new THREE.SpotLight(0xffb9a8,6,10,.27,.26,1);projectorLight.position.set(0,.5,1.4);projectorLight.target.position.set(0,1.7,-4.8);group.add(projectorLight,projectorLight.target);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(2.45,2.70),new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{clock:{value:0},motion:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float clock,motion;
      float ellipse(vec2 p,vec2 r){return length(p/r);}
      void main(){
        vec2 p=(vUv-.5)*2.;p.x+=sin(p.y*7.+clock*1.7)*.016*motion;
        float head=1.-smoothstep(.91,1.,ellipse(p-vec2(0.,.03),vec2(.72,.96)));
        float left=1.-smoothstep(.7,1.,ellipse(p-vec2(-.27,.25),vec2(.18,.10)));
        float right=1.-smoothstep(.7,1.,ellipse(p-vec2(.27,.28),vec2(.18,.10)));
        float mouth=1.-smoothstep(.84,1.,ellipse(p-vec2(.01,-.36),vec2(.23,.30+.045*sin(clock*3.)*motion)));
        float brow=exp(-pow((abs(p.x)-.26)/.19,4.))*exp(-pow((p.y-.43-abs(p.x)*.16)/.027,2.));
        float tear=exp(-pow((abs(p.x)-.26)/.023,2.))*smoothstep(-.25,.05,p.y)*(1.-smoothstep(.13,.23,p.y));
        float edge=pow(max(0.,1.-ellipse(p,vec2(.75,1.))),.3);
        float shade=clamp(.38+edge*.53-max(left,right)*.81-mouth*.95-brow*.48-tear*.44,0.,1.);
        vec3 color=mix(vec3(.20,.013,.028),vec3(1.,.66,.57),shade)*(.91+.09*sin(vUv.y*420.));
        gl_FragColor=vec4(color,head*.95);
      }` }));face.position.set(0,1.76,-4.765);face.name='Original anonymous distressed face projection';group.add(face);
  let drops=null;
  const count=touch?48:96,positions=new Float32Array(count*6);
  if(rain){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    drops=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xee3340,transparent:true,opacity:.65}));drops.frustumCulled=false;group.add(drops);
  }
  return {group,face,projectorLight,update(time,reduced=false){
    face.material.uniforms.clock.value=time;face.material.uniforms.motion.value=reduced?.22:1;
    if(!drops)return;
    for(let i=0;i<count;i++){
      const active=!reduced||i<24,x=Math.sin(i*12.37)*2.95,z=Math.sin(i*7.91)*4.4,y=3.25-((time*(1.9+(i%5)*.17)+i*.173)%3.25),n=i*6;
      positions.set([x,y,z,x,active?Math.max(0,y-.15):y,z],n);
    }
    drops.geometry.attributes.position.needsUpdate=true;
  }};
}
