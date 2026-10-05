import * as THREE from 'three';

/** Keep the sky marker on the actual door bearing inside the camera range. */
export function returnBeaconPose(player,door,far=90){
  const dx=door.x-player.x,dz=door.z-player.z,distance=Math.hypot(dx,dz);
  const range=Math.min(distance,Math.max(4,far*.45)),scale=distance>0?range/distance:1;
  return {x:player.x+dx*scale,z:player.z+dz*scale,distance,range,
    width:Math.max(3.4,range*.12),height:Math.max(34,range*1.8),yaw:Math.atan2(-dx,-dz)};
}

function alphaTexture(width,height,alpha){
  const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=255;
    data[i+3]=Math.round(255*alpha(x/(width-1),y/(height-1)));
  }
  const texture=new THREE.DataTexture(data,width,height);
  texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
function gradient(stops,value){
  for(let i=1;i<stops.length;i++)if(value<=stops[i][0]){
    const [a,alpha]=stops[i-1],[b,beta]=stops[i];return alpha+(beta-alpha)*(value-a)/(b-a);
  }
  return stops.at(-1)[1];
}

export function createReturnBeacon(scene,fieldGroup,lantern,light,{camera,touch=false,loader=typeof document==='undefined'?null:new THREE.TextureLoader()}={}){
  const sky=new THREE.Group();sky.name='Red return sky beacon';sky.visible=false;scene.add(sky);
  const beamStops=[[0,0],[.25,.16],[.44,1],[.56,1],[.75,.16],[1,0]],fadeStops=[[0,0],[.24,.65],[.9,1],[1,0]];
  const beamTexture=alphaTexture(64,256,(x,y)=>gradient(beamStops,x)*gradient(fadeStops,1-y)*(Math.abs(x-.5)<.07?1:.88+.12*Math.sin(y*31+x*17)*Math.sin(y*13-x*19)));
  const geometry=new THREE.PlaneGeometry(1,1).translate(0,.5,0);
  const beamMaterial=new THREE.MeshBasicMaterial({map:beamTexture,color:0xff180b,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false,fog:false,side:THREE.DoubleSide});
  const shaft=new THREE.Mesh(geometry,beamMaterial);shaft.renderOrder=3;sky.add(shaft);
  const glow=new THREE.Mesh(geometry,beamMaterial.clone());glow.material.opacity=.23;glow.renderOrder=2;sky.add(glow);
  // Small generated fallback remains available if the optional CC0 texture fails.
  const fallback=alphaTexture(64,64,(x,y)=>Math.max(0,1-Math.hypot(x-.5,y-.5)*2));
  const mist=Array.from({length:touch?4:6},(_,i)=>{
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:fallback,color:0xff1710,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));
    sprite.name='Return mist '+i;fieldGroup.add(sprite);return sprite;
  });
  let disposed=false,settled=false,mistCount=mist.length;
  const stats={active:false,texture:loader?'loading':'fallback',doorId:null,distance:0,range:0,mistCount};
  const timer=loader?setTimeout(()=>{settled=true;stats.texture='fallback';},8000):null;
  loader?.load(new URL('../assets/field/beacon-mist.png',import.meta.url).href,texture=>{
    if(disposed||settled){texture.dispose();return;}settled=true;clearTimeout(timer);
    texture.colorSpace=THREE.SRGBColorSpace;
    for(const sprite of mist){sprite.material.map=texture;sprite.material.needsUpdate=true;}
    fallback.dispose();stats.texture='ready';
  },undefined,()=>{if(!disposed){settled=true;clearTimeout(timer);stats.texture='fallback';}});
  lantern.material.color.set(0xff2214);lantern.material.emissive.set(0xff1208);lantern.material.emissiveIntensity=5;
  light.color.set(0xff170a);light.distance=12;light.intensity=32;light.castShadow=false;
  return {stats,setQuality(profile){mistCount=profile.rain<=.5?3:mist.length;},
    update(game,reduced=false){
      const active=game.player.zone==='field'&&game.fieldTrip?.active;sky.visible=active;stats.active=active;
      if(!active){stats.doorId=null;return;}
      const door=game.maze.cornWorld.doors[game.maze.cornWorld.activeDoor];
      const p=returnBeaconPose(game.player,door,camera?.far||90),time=reduced?0:game.elapsed;
      stats.doorId=game.fieldTrip.doorId;stats.distance=p.distance;stats.range=p.range;stats.mistCount=mistCount;
      sky.position.set(p.x,3.1,p.z);sky.rotation.y=p.yaw;
      const pulse=reduced?1:.9+.07*Math.sin(time*.85)+.03*Math.sin(time*1.73);
      shaft.scale.set(p.width,p.height,1);glow.scale.set(p.width*4.2,p.height*.95,1);
      beamMaterial.opacity=.85*pulse;glow.material.opacity=.22*pulse;light.intensity=32*pulse;
      lantern.material.emissiveIntensity=5*pulse;
      for(let i=0;i<mist.length;i++){
        const sprite=mist[i],angle=i*2.399+time*.045,radius=1.15+(i%2)*.6;
        sprite.visible=i<mistCount;sprite.position.set(door.x+Math.cos(angle)*radius,.6+(i%3)*.42+Math.sin(time*.3+i)*.12,door.z+Math.sin(angle)*radius);
        sprite.scale.setScalar(2.4+(i%3)*.5);sprite.material.rotation=i+time*.035;sprite.material.opacity=.13*pulse;
      }
    },
    dispose(){disposed=true;clearTimeout(timer);},
  };
}
