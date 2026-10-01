import * as THREE from 'three';

/** A new shot always gets a visible first frame, even after a slow frame. */
export function createShotPulse(seconds=.09){
  let remaining=0,pending=false;
  return {trigger(){remaining=seconds;pending=true;},reset(){remaining=0;pending=false;},
    sample(dt,enabled=true){
      if(!enabled){remaining=0;pending=false;return 0;}
      if(pending)pending=false;else remaining=Math.max(0,remaining-Math.max(0,dt));
      return remaining/seconds;
    }};
}

export function createMuzzleBurst(gun,seconds=.09){
  const root=new THREE.Group();root.name='Muzzle burst';gun.add(root);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,245,1)');gradient.addColorStop(.13,'rgba(255,245,192,1)');
  gradient.addColorStop(.32,'rgba(255,179,57,.75)');gradient.addColorStop(1,'rgba(255,75,10,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false});
  const flash=new THREE.Sprite(material);flash.layers.set(1);flash.visible=false;root.add(flash);
  // Keep the light in the playing scene at zero intensity between shots. Hiding
  // it would compile a new light-count shader on the first trigger pull.
  const light=new THREE.PointLight(0xffb85a,0,7,2);light.castShadow=false;root.add(light);
  // The nearby hand needs far less energy than the world surfaces.
  const handLight=new THREE.PointLight(0xffc277,0,2,2);handLight.layers.set(1);root.add(handLight);
  const pulse=createShotPulse(seconds),stats={active:false,strength:0,lightIntensity:0};
  return {root,stats,trigger:pulse.trigger,reset(){pulse.reset();flash.visible=false;light.intensity=handLight.intensity=0;Object.assign(stats,{active:false,strength:0,lightIntensity:0});},
    update(dt,enabled,reduced=false){
      const strength=pulse.sample(dt,enabled),level=reduced?.3:1;
      flash.visible=strength>0;flash.scale.setScalar((.20+.13*strength)*level);
      material.opacity=Math.sqrt(strength)*level;light.intensity=32*strength*level;handLight.intensity=.75*strength*level;
      Object.assign(stats,{active:flash.visible,strength,lightIntensity:light.intensity});
    }};
}
