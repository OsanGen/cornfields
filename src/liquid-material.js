// Shared original liquid treatment. Uniforms do not own simulation or resources.
const treatments=new WeakMap();
export function attachLiquidMaterial(material){
  if(treatments.has(material))return treatments.get(material);
  const uniforms={amount:{value:0},time:{value:0},red:{value:0},scale:{value:1}};
  const before=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile=shader=>{
    before?.(shader);
    Object.assign(shader.uniforms,{prologueLiquid:uniforms.amount,prologueLiquidTime:uniforms.time,liquidRed:uniforms.red,liquidScale:uniforms.scale});
    shader.vertexShader='uniform float prologueLiquid,prologueLiquidTime,liquidScale;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      if(prologueLiquid>.001){
      float liquidPhase=position.y*3.2+position.z*1.7+prologueLiquidTime*1.6;
      transformed.x+=sin(liquidPhase)*.17*prologueLiquid*liquidScale;
      transformed.z+=sin(position.x*2.1+prologueLiquidTime*1.3)*.13*prologueLiquid*liquidScale;
      transformed.y+=sin(position.x*2.8+position.z*1.4+prologueLiquidTime)*.12*prologueLiquid*liquidScale;}`);
    shader.fragmentShader='uniform float prologueLiquid,prologueLiquidTime,liquidRed;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(prologueLiquid>.001){
      vec3 liquidColor=mix(vec3(.23,.36,.35),vec3(.62,.025,.065),liquidRed);
      diffuseColor.rgb=mix(diffuseColor.rgb,liquidColor+diffuseColor.rgb*.35,prologueLiquid*.62);}`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nif(prologueLiquid>.001)roughnessFactor=mix(roughnessFactor,.16,prologueLiquid);');
  };
  const baseKey=key?key():'';
  material.customProgramCacheKey=()=>baseKey+'|cornfield-liquid-v2';
  material.userData.prologueLiquid=uniforms;
  treatments.set(material,uniforms);material.needsUpdate=true;return uniforms;
}
