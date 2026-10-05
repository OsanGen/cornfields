// Shared original liquid treatment. Uniforms do not own simulation or resources.
const treatments=new WeakMap();
export function attachLiquidMaterial(material){
  if(treatments.has(material))return treatments.get(material);
  const uniforms={handover:{value:0},incoming:{value:0},lift:{value:0},amount:{value:0},time:{value:0},red:{value:0},scale:{value:1},detail:{value:material.userData?.liquidDetail||0}};
  const before=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile=shader=>{
    before?.(shader);
    Object.assign(shader.uniforms,{prologueLiquid:uniforms.amount,prologueLiquidTime:uniforms.time,liquidRed:uniforms.red,liquidScale:uniforms.scale,liquidDetail:uniforms.detail,liquidHandover:uniforms.handover,liquidIncoming:uniforms.incoming,liquidLift:uniforms.lift});
    shader.vertexShader='uniform float prologueLiquid,prologueLiquidTime,liquidScale,liquidLift;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      if(prologueLiquid>.001){
      transformed.y+=max(0.,position.y)*liquidLift*.18;
      transformed.x*=1.-liquidLift*.12;
      float liquidPhase=position.y*3.2+position.z*1.7+prologueLiquidTime*1.6;
      transformed.x+=sin(liquidPhase)*.17*prologueLiquid*liquidScale;
      transformed.z+=sin(position.x*2.1+prologueLiquidTime*1.3)*.13*prologueLiquid*liquidScale;
      transformed.y+=sin(position.x*2.8+position.z*1.4+prologueLiquidTime)*.12*prologueLiquid*liquidScale;}`);
    shader.fragmentShader='uniform float prologueLiquid,prologueLiquidTime,liquidRed,liquidDetail,liquidHandover,liquidIncoming;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float liquidDither=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
      if(liquidIncoming>.5){if(liquidDither>=liquidHandover)discard;}else if(liquidDither<liquidHandover)discard;
      if(prologueLiquid>.001){
      vec3 liquidColor=mix(vec3(.23,.36,.35),vec3(.62,.025,.065),liquidRed);
      vec3 detailedLiquid=diffuseColor.rgb*mix(vec3(.44,.78,.76),vec3(1.12,.16,.22),liquidRed);
      diffuseColor.rgb=mix(diffuseColor.rgb,mix(liquidColor+diffuseColor.rgb*.35,detailedLiquid,liquidDetail),prologueLiquid*.62);}`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nif(prologueLiquid>.001)roughnessFactor=mix(roughnessFactor,.16,prologueLiquid);');
  };
  const baseKey=key?key():'';
  material.customProgramCacheKey=()=>baseKey+'|cornfield-liquid-v4';
  material.userData.prologueLiquid=uniforms;
  treatments.set(material,uniforms);material.needsUpdate=true;return uniforms;
}
