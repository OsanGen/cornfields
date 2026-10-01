import * as THREE from 'three';
import {PRESENTATION} from './presentation-config.js';

/** Bounded vertex motion, shared uniforms; no per-stalk frame allocations. */
export function createFoliageMotion() {
  const uniforms={cornTime:{value:0},cornMotion:{value:1},cornPlayer:{value:new THREE.Vector2()}};
  return {
    material(source){
      const material=source.clone();
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='uniform float cornTime; uniform float cornMotion; uniform vec2 cornPlayer;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          vec4 cornWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float cornTip = clamp(position.y / 3.0, 0.0, 1.0);
          vec2 cornAway = cornWorld.xz - cornPlayer;
          float cornBend = max(0.0, 1.0 - length(cornAway) / 1.1);
          vec2 cornDrift = vec2(sin(cornTime * 1.1 + cornWorld.x * .4 + cornWorld.z * .3), cos(cornTime * .8 + cornWorld.z * .3)) * ${PRESENTATION.field.wind};
          vec2 cornOffset = (cornDrift + cornAway / max(length(cornAway), .1) * cornBend * .18) * cornTip * cornTip * cornMotion;
          vec3 cornWorldOffset = vec3(cornOffset.x, 0.0, cornOffset.y);
          transformed.x += dot(cornWorldOffset, instanceMatrix[0].xyz) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz);
          transformed.z += dot(cornWorldOffset, instanceMatrix[2].xyz) / dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz);
        `);
      };
      material.customProgramCacheKey=()=> 'corn-motion-v1';
      return material;
    },
    update(time,player,reduced){uniforms.cornTime.value=time;uniforms.cornMotion.value=reduced?0:1;uniforms.cornPlayer.value.set(player.x,player.z);},
  };
}
