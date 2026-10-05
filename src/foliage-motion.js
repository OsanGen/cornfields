import * as THREE from 'three';
import {PRESENTATION} from './presentation-config.js';

/** Travelling wind uses the existing +X rain direction. A second, delayed leaf
 * frequency rides the stalk bend; roots remain fixed and reduced effects stop it.
 */
export function createFoliageMotion({playerPush=true}={}) {
  const uniforms={cornTime:{value:0},cornMotion:{value:1},cornPlayer:{value:new THREE.Vector2()},cornPlayerPush:{value:playerPush?1:0}};
  return {
    material(source){
      const material=source.clone();
      if(source.userData.cornArt)material.defines={...material.defines,CORN_ART:1};
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='uniform float cornTime; uniform float cornMotion; uniform vec2 cornPlayer; uniform float cornPlayerPush;\n#ifdef CORN_ART\nattribute float cornFlex;\n#endif\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          mat4 cornTransform = modelMatrix * instanceMatrix;
          vec4 cornWorld = cornTransform * vec4(position, 1.0);
          vec3 cornRoot = (cornTransform * vec4(0.,0.,0.,1.)).xyz;
          float cornTip = clamp(position.y / 3.0, 0.0, 1.0);
          vec2 cornAway = cornWorld.xz - cornPlayer;
          float cornBend = max(0.0, 1.0 - length(cornAway) / 1.1);
          float cornWave = cornTime*.72-cornRoot.x*.24-cornRoot.z*.09;
          float cornGust = .55+.45*sin(cornWave);
          vec2 cornDrift = vec2(.28+cornGust, .18*sin(cornWave*.71)) * ${PRESENTATION.field.wind};
          #ifdef CORN_ART
            // Tip response lags the stalk and relaxes between coherent gusts.
            cornDrift+=vec2(sin(cornWave-1.2+position.y*1.4),cos(cornWave*1.3-position.y))*.016*cornFlex;
            transformed.y+=sin(cornWave*1.8-1.3)*.012*cornFlex*cornMotion;
          #endif
          vec2 cornOffset = (cornDrift + cornAway / max(length(cornAway), .1) * cornBend * .18 * cornPlayerPush) * cornTip * cornTip * cornMotion;
          vec3 cornWorldOffset = vec3(cornOffset.x, 0.0, cornOffset.y);
          // Include rotated/scaled parents as well as each planted instance.
          // Live-field parents have no rotation/scale, preserving their response.
          transformed += inverse(mat3(cornTransform)) * cornWorldOffset;
        `);
      };
      material.customProgramCacheKey=()=> 'corn-motion-v4-'+(source.userData.cornArt||'fallback');
      return material;
    },
    update(time,player,reduced){uniforms.cornTime.value=time;uniforms.cornMotion.value=reduced?0:1;uniforms.cornPlayer.value.set(player?.x??0,player?.z??0);},
  };
}
