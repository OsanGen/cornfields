import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

// Original, time-sampled effect. Text stays in the DOM, outside this shader.
const composite = {
  uniforms: {tDiffuse: {value: null}, clock: {value: 0}, warp: {value: 0}, accent: {value: 0},
    tunnel: {value: 0}, reduced: {value: 0}, pixels: {value: new THREE.Vector2(960, 540)}},
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float clock, warp, accent, tunnel, reduced;
    uniform vec2 pixels;
    varying vec2 vUv;
    float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec2 uv=vUv;
      vec2 folded=abs(uv-.5)*2.;
      uv=mix(uv,folded,tunnel*.68);
      float quiet=1.-smoothstep(.10,.43,abs(vUv.x-.5));
      uv.x+=sin(uv.y*15.+clock*.6)*warp*(1.-quiet*.75);
      uv.x+=accent*.018*sin(uv.y*35.+clock*3.);
      uv=clamp(uv,vec2(.002),vec2(.998));
      vec2 fringe=vec2((.55+accent*2.5)*(1.-reduced)/pixels.x,0.);
      vec3 c=texture2D(tDiffuse,uv).rgb;
      c.r=texture2D(tDiffuse,clamp(uv+fringe,vec2(.002),vec2(.998))).r;
      c.b=texture2D(tDiffuse,clamp(uv-fringe,vec2(.002),vec2(.998))).b;
      float vignette=1.-smoothstep(.22,.75,length(vUv-.5));
      c*=.48+.52*vignette;
      c+=vec3((noise(floor(vUv*pixels))-.5)*.004);
      gl_FragColor=vec4(max(c,vec3(0.)),1.);
    }`,
};

function silhouette() {
  const points = [];
  const quad = (a, b, c, d) => points.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([-.018,0,0],[.018,0,0],[.014,3.1,0],[-.014,3.1,0]);
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, y = .55 + i * .34;
    quad([0,y,0],[side*.4,y+.37,.04],[side*.9,y+.18,0],[side*.22,y+.16,-.03]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals(); return geometry;
}

/** Borrows the renderer and field resources. Owns only its staging/effect objects. */
export function createIntroVisuals(renderer, {getCorn = () => null, enhanced = true, touch = false} = {}) {
  let scene, camera, eyes, eyeMaterial, composer, effect, passes = [], layers = [];
  let geometries = [], materials = [], instances = [], size = '', dead = false;
  const stats = {mode: 'uninitialized', corn: 'procedural', draws: 0, postprocessDraws: 0, frames: 0, live: false, error: null};
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4(), clearColor = new THREE.Color();
  function cleanup() {
    for (const pass of passes) pass.dispose?.();
    composer?.dispose();
    for (const mesh of instances) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    passes = []; layers = []; instances = []; geometries = []; materials = [];
    scene = camera = eyes = eyeMaterial = composer = effect = null;
    stats.live = false; stats.draws = 0; stats.postprocessDraws = 0; size = '';
  }
  function start() {
    if (dead) return;
    cleanup();
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x020503);
    scene.fog = new THREE.Fog(0x020503, 3, 19);
    camera = new THREE.PerspectiveCamera(53, 1, .1, 35);
    scene.add(new THREE.HemisphereLight(0x9cae9c, 0x050805, 1.7));
    const rim = new THREE.DirectionalLight(0xadc7bc, 1.3); rim.position.set(-3,4,-7); scene.add(rim);
    const corn = getCorn();
    stats.corn = corn?.length ? 'shared' : 'procedural';
    let fallback;
    if (!corn?.length) {
      const geometry = silhouette(), material = new THREE.MeshStandardMaterial({color: 0x344b31, side: THREE.DoubleSide, roughness: 1});
      geometries.push(geometry); materials.push(material); fallback = {geometry, material};
    }
    const dummy = new THREE.Object3D();
    for (let layer = 0; layer < 3; layer++) {
      const group = new THREE.Group(); scene.add(group); layers.push(group);
      const source = corn?.[layer % corn.length] || fallback;
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, 32); instances.push(mesh);
      for (let i = 0; i < 32; i++) {
        const side = i % 2 ? 1 : -1, n = Math.floor(i / 2);
        dummy.position.set(side * (1.3 + n % 4 * .7), -.2, -layer*3 - Math.floor(n/4)*.58);
        dummy.rotation.set(0, Math.sin(i*12.91+layer)*.6, Math.sin(i*8.3)*.07);
        dummy.scale.setScalar(.85 + .18 * Math.sin(i*3.4+layer)); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.computeBoundingSphere(); group.add(mesh);
    }
    const eyeGeometry = new THREE.SphereGeometry(1, 12, 8); geometries.push(eyeGeometry);
    eyeMaterial = new THREE.MeshBasicMaterial({color: 0xe5efea, transparent: true, fog: false}); materials.push(eyeMaterial);
    eyes = new THREE.Group();
    for (const x of [-.12,.12]) { const eye = new THREE.Mesh(eyeGeometry,eyeMaterial); eye.scale.set(.064,.034,.036); eye.position.x=x; eyes.add(eye); }
    scene.add(eyes);
    stats.mode = 'fallback'; stats.error = null; stats.live = true;
    if (enhanced) try {
      composer = new EffectComposer(renderer);
      effect = new ShaderPass(composite);
      passes = [new RenderPass(scene,camera), effect, new OutputPass()];
      for (const pass of passes) composer.addPass(pass);
      stats.mode = 'enhanced';
    } catch (error) { stats.error = error.message; for (const pass of passes) pass.dispose?.(); composer?.dispose(); composer=null; passes=[]; }
  }
  function render(frame) {
    if (dead) return;
    if (!scene) start();
    const canvas = renderer.domElement, width = Math.max(1,canvas.clientWidth), height = Math.max(1,canvas.clientHeight);
    const key = `${width}:${height}`;
    if (size !== key) {
      camera.aspect = width / height; camera.updateProjectionMatrix();
      composer?.setPixelRatio(Math.min(renderer.getPixelRatio(), touch ? 1 : 1.5) * .75);
      composer?.setSize(width,height); size = key;
      effect?.uniforms.pixels.value.set(width*Math.min(renderer.getPixelRatio(),touch?1:1.5)*.75,height*Math.min(renderer.getPixelRatio(),touch?1:1.5)*.75);
    }
    const motion = frame.reduced || frame.ready ? 0 : 1, time = frame.time;
    camera.position.set(Math.sin(time*.12)*.1*motion,1.65,5.2-time*.025*motion); camera.lookAt(0,1.55,-3);
    for (let i=0;i<layers.length;i++) layers[i].position.x=Math.sin(time*.15+i)*.055*motion;
    eyes.visible=frame.eyes>0; eyes.position.set(frame.shot==='watching_eyes'?.6+frame.retreat*1.8:.05,1.9,-1.8);
    eyeMaterial.opacity=Math.min(1,frame.eyes); eyeMaterial.color.setRGB(1,1-frame.red*.97,1-frame.red*.94);
    if (effect) { const u=effect.uniforms; u.clock.value=time; u.warp.value=frame.breathing; u.accent.value=frame.accent; u.tunnel.value=frame.tunnel; u.reduced.value=frame.reduced?1:0; }
    // Composer changes viewport/targets. Restore borrowed renderer state even on failure.
    const target=renderer.getRenderTarget(), auto=renderer.autoClear, infoAuto=renderer.info.autoReset;
    renderer.getViewport(viewport); renderer.getScissor(scissor); const scissorTest=renderer.getScissorTest();
    renderer.getClearColor(clearColor); const alpha=renderer.getClearAlpha();
    renderer.info.autoReset=false; renderer.info.reset();
    try {
      if (composer) { composer.render(0); stats.postprocessDraws=2; }
      else { renderer.setRenderTarget(null); renderer.render(scene,camera); stats.postprocessDraws=0; }
      stats.draws=renderer.info.render.calls; stats.frames++;
    } catch (error) {
      stats.error=error.message; stats.mode='fallback';
      for (const pass of passes) pass.dispose?.(); composer?.dispose(); composer=null; effect=null; passes=[];
    } finally {
      renderer.setRenderTarget(target); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.setClearColor(clearColor,alpha); renderer.autoClear=auto; renderer.info.autoReset=infoAuto;
    }
  }
  return {start, render, release:cleanup, diagnostics:()=>({...stats}), dispose(){cleanup();dead=true;}};
}
