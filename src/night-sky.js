import * as THREE from 'three';

// Optional background only. It never changes the scene's lights or environment.
export async function installNightSky({scene,camera}){
  let expired=false,timeout;
  const loading=new THREE.TextureLoader().loadAsync(new URL('../assets/field/night-sky.jpg',import.meta.url).href).then(texture=>{
    if(expired){texture.dispose();throw new Error('Night sky arrived after its load deadline');}
    return texture;
  });
  let texture;
  try{
    texture=await Promise.race([loading,new Promise((_,reject)=>{
      timeout=setTimeout(()=>{expired=true;reject(new Error('Night sky load timed out'));},8000);
    })]);
  }finally{clearTimeout(timeout);}
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
  const geometry=new THREE.SphereGeometry(70,32,16);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,fog:false,depthWrite:false,depthTest:false});
  const sky=new THREE.Mesh(geometry,material);
  sky.name='Photographic night sky';sky.renderOrder=-1000;sky.frustumCulled=false;
  // Place the photographed moon in the existing moonlight's western quadrant.
  sky.rotation.y=-Math.PI/4;
  scene.add(sky);
  const update=()=>sky.position.copy(camera.position);
  update();
  return {update,stats:{source:'Solitude Night',width:texture.image.width,height:texture.image.height,
    drawCalls:1,triangles:geometry.index.count/3,animated:false,environmentLighting:false}};
}
