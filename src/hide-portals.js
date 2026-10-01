import * as THREE from 'three';

function mistFallback(){
  const data=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*Math.max(0,1-Math.hypot(x-15.5,y-15.5)/16)**2);}
  const texture=new THREE.DataTexture(data,32,32);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
function neonLabel(){
  if(typeof document==='undefined')return mistFallback();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const draw=()=>{
    ctx.clearRect(0,0,512,128);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 68px "Barlow Condensed", sans-serif';
    ctx.shadowColor='#ff2ecb';ctx.shadowBlur=19;ctx.fillStyle='#ed8fe7';ctx.fillText('HIDE HERE',256,65);
    ctx.shadowColor='#1bf8ff';ctx.shadowBlur=6;ctx.fillStyle='#edffff';ctx.fillText('HIDE HERE',256,65);texture.needsUpdate=true;
  };draw();return texture;
}

/** One cheap transparent border, shared by the nearest entrances and return. */
export function createHidePortals(corridorGroup,fieldGroup,maze,{touch=false,loader=typeof document==='undefined'?null:new THREE.TextureLoader()}={}){
  const doors=maze.cornDoors.filter(d=>d.permanentOpen),width=doors[0]?.width||1.5;
  const uniforms={time:{value:0},detail:{value:touch?2:4},halfWidth:{value:width/2+.04}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      varying vec2 vUv; uniform float time,halfWidth; uniform int detail;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fractal(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){if(i>=detail)break;v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.1+7.3;a*=.5;}return v;}
      void main(){
        vec2 p=(vUv-.5)*vec2(halfWidth*2.+1.2,3.4);
        vec2 q=abs(p)-vec2(halfWidth,1.22);
        float edge=length(max(q,0.))+min(max(q.x,q.y),0.);
        float angle=atan(p.y,p.x),radius=length(p);
        vec2 folded=vec2(abs(sin(angle*3.+time*.10))*radius,radius);
        float warp=fractal(folded*3.+vec2(time*.16,-time*.12));
        float flow=fractal(p*5.+warp*3.+vec2(-time*.19,time*.28));
        float ripple=.5+.5*sin(edge*65.+flow*15.-time*1.7);
        float halo=exp(-abs(edge)*8.)*(.22+.48*ripple);
        float core=exp(-abs(edge+.022*sin(flow*13.+time*.45))*58.);
        vec3 color=mix(vec3(.95,.025,.55),vec3(.025,.8,1.),smoothstep(.22,.76,warp));
        color=mix(color,vec3(.8,1.,1.),core*.6);
        float alpha=clamp(halo+core*.75,0.,1.);
        if(alpha<.015)discard;
        gl_FragColor=vec4(color,alpha);
      }`});
  const geometry=new THREE.PlaneGeometry(width+1.28,3.4),labelGeometry=new THREE.PlaneGeometry(1.65,.413);
  const labelMaterial=new THREE.MeshBasicMaterial({map:neonLabel(),transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,fog:true});
  const fallback=mistFallback(),mistMaterials=[0xff36c8,0x20eaf5].map(color=>new THREE.SpriteMaterial({map:fallback,color,transparent:true,opacity:.14,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  const portals=doors.map(d=>{
    const group=new THREE.Group();group.name='Hide entrance '+d.id;group.position.set(d.x,0,d.z+.065);corridorGroup.add(group);
    const border=new THREE.Mesh(geometry,material);border.position.y=1.25;group.add(border);
    const label=new THREE.Mesh(labelGeometry,labelMaterial);label.name='HIDE HERE';label.position.set(0,2.83,.025);group.add(label);
    const mist=mistMaterials.map((m,i)=>{const s=new THREE.Sprite(m);s.position.set((i?1:-1)*(width/2+.06),.65+i*.6,.10);s.scale.set(1.1,2,1);group.add(s);return s;});
    return {group,mist,door:d};
  });
  const back=new THREE.Mesh(geometry,material);back.name='Liquid return border';back.position.set(0,1.25,.065);fieldGroup.add(back);
  let disposed=false,settled=false,limit=touch?1:2;
  const stats={visible:0,maxVisible:limit,draws:0,texture:loader?'loading':'fallback',reduced:false,time:0};
  const timer=loader?setTimeout(()=>{settled=true;stats.texture='fallback';},8000):null;
  loader?.load(new URL('../assets/field/beacon-mist.png',import.meta.url).href,texture=>{
    if(disposed||settled){texture.dispose();return;}settled=true;clearTimeout(timer);texture.colorSpace=THREE.SRGBColorSpace;
    for(const m of mistMaterials){m.map=texture;m.needsUpdate=true;}fallback.dispose();stats.texture='ready';
  },undefined,()=>{if(!disposed){settled=true;clearTimeout(timer);stats.texture='fallback';}});
  return {stats,setQuality(profile){limit=profile.rain<=.5?1:touch?1:2;uniforms.detail.value=profile.rain<=.5?2:4;stats.maxVisible=limit;},
    update(game,reduced=false){
      uniforms.time.value=reduced?0:game.elapsed;stats.time=uniforms.time.value;stats.reduced=reduced;
      const inField=game.player.zone==='field';back.visible=inField;
      const near=portals.map(p=>({p,d:Math.hypot(p.door.x-game.player.x,p.door.z-game.player.z)})).sort((a,b)=>a.d-b.d);
      let shown=0;
      for(const {p,d} of near){
        p.group.visible=!inField&&d<18&&shown<limit;if(!p.group.visible)continue;shown++;
        for(const [i,s]of p.mist.entries()){s.visible=d<9&&uniforms.detail.value>2;s.position.y=.65+i*.6+Math.sin(uniforms.time.value*.3+i)*.09;}
      }
      stats.visible=shown;stats.draws=inField?1:shown*2+portals.reduce((n,p)=>n+(p.group.visible?p.mist.filter(s=>s.visible).length:0),0);
    },
    dispose(){disposed=true;clearTimeout(timer);},
  };
}
