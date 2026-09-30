import * as THREE from 'three';
import {puddleRadius, weatherRandom} from './weather.js';

function puddleGeometry() {
  const vertices = [0, 0, 0], uv = [.5, .5], indices = [], segments = 64;
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2, r = puddleRadius(a);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    vertices.push(x, 0, z); uv.push(x * .5 + .5, z * .5 + .5);
    indices.push(0, (i + 1) % segments + 1, i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function waterNormal() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (y * size + x) * 4;
    data[at] = 128 + Math.sin((x * 2 + y) / size * Math.PI * 2) * 24;
    data[at + 1] = 128 + Math.cos((y * 3 - x) / size * Math.PI * 2) * 24;
    data[at + 2] = 250; data[at + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(2, 2); texture.needsUpdate = true;
  return texture;
}

function waterEdge() {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const edge = puddleRadius(Math.atan2(v, u)) - Math.hypot(u, v);
    const alpha = Math.max(0, Math.min(1, edge / .09));
    const at = (y * size + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = Math.round(alpha * 255); data[at + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

/** Four bounded batches: puddle surfaces, rainfall, ripple rings and droplets. */
function nightmareRain(scene){
  const random=weatherRandom(941),seeds=Array.from({length:96},()=>({x:random()*12-6,z:random()*12-6,phase:random()*8,speed:4+random()*3}));
  const positions=new Float32Array(96*6),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xa91d18,transparent:true,opacity:.65,depthWrite:false}));
  mesh.name='Bounded nightmare blood rain';mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
  return {update(camera,game,nightmare){
    mesh.visible=!!nightmare?.rain;
    if(!mesh.visible)return;
    mesh.material.opacity=.65*nightmare.amount;
    for(let i=0;i<96;i++){
      const s=seeds[i],at=i*6,y=((s.phase-game.elapsed*s.speed)%8+8)%8+1.6;
      positions.set([camera.position.x+s.x,y,camera.position.z+s.z,camera.position.x+s.x-.02,y+.2,camera.position.z+s.z],at);
    }
    geometry.attributes.position.needsUpdate=true;
  }};
}

export function createWeatherView(scene, weather) {
  const state = weather.state;
  const nightmare=nightmareRain(scene);
  if (!state.enabled) return {update:(camera,game,effects)=>nightmare.update(camera,game,effects), stats: {enabled: false}};
  const group = new THREE.Group(); group.name = 'Rain and shallow puddles'; scene.add(group);
  const dummy = new THREE.Object3D();
  const normal = waterNormal();
  const water = new THREE.MeshStandardMaterial({color: 0x24241e, roughness: .25,
    metalness: 0, normalMap: normal, normalScale: new THREE.Vector2(.13, .13),
    transparent: true, opacity: .62, alphaMap: waterEdge(), depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
  const puddles = new THREE.InstancedMesh(puddleGeometry(), water, state.puddles.length);
  puddles.name = 'Instanced wet ground'; puddles.renderOrder = 1;
  for (const p of state.puddles) {
    dummy.position.set(p.x, .008, p.z); dummy.rotation.set(0, p.angle, 0);
    dummy.scale.set(p.rx, 1, p.rz); dummy.updateMatrix(); puddles.setMatrixAt(p.id, dummy.matrix);
  }
  puddles.computeBoundingSphere(); group.add(puddles);

  const random = weatherRandom(82), rainSeeds = [];
  const rainPositions = new Float32Array(state.limits.rain * 6);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  for (let i = 0; i < state.limits.rain; i++) rainSeeds.push({x: random() * 22 - 11,
    z: random() * 22 - 11, phase: random() * 9, speed: 8 + random() * 4, length: .12 + random() * .20});
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({
    color: 0xa3b8b5, transparent: true, opacity: .36, depthWrite: false, fog: true}));
  rain.name = 'Recycled local rain'; rain.frustumCulled = false; rain.renderOrder = 3; group.add(rain);

  // Per-instance opacity and footprint clipping keep rings inside their puddle.
  const ringGeometry = new THREE.PlaneGeometry(2, 2);
  ringGeometry.rotateX(-Math.PI / 2);
  const alphas = new Float32Array(state.limits.ripples);
  const footprints = new Float32Array(state.limits.ripples * 4);
  const rotations = new Float32Array(state.limits.ripples * 2);
  ringGeometry.setAttribute('effectAlpha', new THREE.InstancedBufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  ringGeometry.setAttribute('footprint', new THREE.InstancedBufferAttribute(footprints, 4).setUsage(THREE.DynamicDrawUsage));
  ringGeometry.setAttribute('puddleRotation', new THREE.InstancedBufferAttribute(rotations, 2).setUsage(THREE.DynamicDrawUsage));
  const ringMaterial = new THREE.ShaderMaterial({transparent: true, depthWrite: false,
    uniforms: {fogDensity: {value: .096}},
    vertexShader: `attribute float effectAlpha;
      attribute vec4 footprint; attribute vec2 puddleRotation;
      varying vec2 vUv; varying vec2 vWorld; varying vec4 vPuddle;
      varying vec2 vRotation; varying float vAlpha; varying float vDepth;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vUv = uv; vWorld = world.xz; vPuddle = footprint; vRotation = puddleRotation;
        vAlpha = effectAlpha; vDepth = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float fogDensity;
      varying vec2 vUv; varying vec2 vWorld; varying vec4 vPuddle;
      varying vec2 vRotation; varying float vAlpha; varying float vDepth;
      void main() {
        vec2 d = vWorld - vPuddle.xy;
        vec2 p = vec2(vRotation.x*d.x-vRotation.y*d.y, vRotation.y*d.x+vRotation.x*d.y) / vPuddle.zw;
        float a = atan(p.y,p.x);
        if (length(p) > .86 + .08*sin(a*3.0) + .055*cos(a*5.0)) discard;
        float r = length(vUv*2.0-1.0);
        float ring = smoothstep(.82,.89,r) * (1.0-smoothstep(.94,1.0,r));
        float alpha = ring * vAlpha * exp(-fogDensity*fogDensity*vDepth*vDepth);
        if(alpha < .003) discard;
        gl_FragColor = vec4(.43,.55,.51,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, state.limits.ripples);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.name = 'Pooled ripple rings'; rings.frustumCulled = false; rings.renderOrder = 2; rings.count = 0; group.add(rings);

  const dropPositions = new Float32Array(state.limits.drops * 3), dropAlphas = new Float32Array(state.limits.drops);
  const dropGeometry = new THREE.BufferGeometry();
  dropGeometry.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3).setUsage(THREE.DynamicDrawUsage));
  dropGeometry.setAttribute('effectAlpha', new THREE.BufferAttribute(dropAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  const dropMaterial = new THREE.ShaderMaterial({transparent: true, depthWrite: false,
    uniforms: {fogDensity: {value: .096}, pixelScale: {value: 300}},
    vertexShader: `attribute float effectAlpha; uniform float pixelScale;
      varying float vAlpha; varying float vDepth;
      void main() { vec4 mv = modelViewMatrix * vec4(position,1.0);
        vAlpha = effectAlpha; vDepth = -mv.z;
        gl_PointSize = clamp(pixelScale*.018/max(.2,-mv.z),1.0,4.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float fogDensity; varying float vAlpha; varying float vDepth;
      void main() { float r=length(gl_PointCoord*2.0-1.0);
        if(r>1.0) discard;
        gl_FragColor=vec4(.49,.61,.57,vAlpha*(1.0-r*r)*exp(-fogDensity*fogDensity*vDepth*vDepth));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const droplets = new THREE.Points(dropGeometry, dropMaterial);
  droplets.name = 'Pooled splash droplets'; droplets.frustumCulled = false; droplets.renderOrder = 3; group.add(droplets);

  const stats = {enabled: true, puddles: state.puddles.length, maxDrawCalls: 4,
    rain: state.limits.rain, activeRipples: 0, activeDrops: 0};
  function update(camera, game, effects) {
    nightmare.update(camera,game,effects);
    const time = state.time, active = game.mode === 'playing' || game.mode === 'paused';
    normal.offset.set(time * .012, -time * .009);
    rain.visible = active&&!effects?.amount; rings.visible = active; droplets.visible = active && !state.reduced;
    const rainCount = state.reduced ? Math.min(100, state.limits.rain) : state.limits.rain;
    rainGeometry.setDrawRange(0, rainCount * 2);
    for (let i = 0; i < rainCount; i++) {
      const s = rainSeeds[i], y = ((s.phase - time * s.speed) % 9 + 9) % 9 + .06;
      const x = camera.position.x + ((s.x + time * .65 + 1100) % 22 - 11);
      const z = camera.position.z + s.z, at = i * 6;
      rainPositions[at] = x; rainPositions[at + 1] = y; rainPositions[at + 2] = z;
      rainPositions[at + 3] = x - s.length * .07; rainPositions[at + 4] = y + s.length; rainPositions[at + 5] = z;
    }
    rainGeometry.attributes.position.needsUpdate = true;
    rain.material.opacity = game.interaction ? .16 : .36;
    let count = 0;
    for (const r of state.ripples) {
      const age = time - r.born;
      if (!(age >= 0 && age < r.life)) continue;
      const progress = age / r.life, radius = .025 + progress * r.size, p = r.puddle;
      dummy.position.set(r.x, .014, r.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(radius, 1, radius);
      dummy.updateMatrix(); rings.setMatrixAt(count, dummy.matrix);
      alphas[count] = (1 - progress) * r.strength * .55;
      footprints.set([p.x, p.z, p.rx, p.rz], count * 4); rotations.set([p.cos, p.sin], count * 2); count++;
    }
    rings.count = count; rings.instanceMatrix.needsUpdate = true;
    for (const name of ['effectAlpha', 'footprint', 'puddleRotation']) ringGeometry.attributes[name].needsUpdate = true;
    stats.activeRipples = count; count = 0;
    for (const d of state.drops) {
      const age = time - d.born, y = .018 + d.vy * age - 4.9 * age * age;
      if (!(age >= 0 && age < .5 && y > .008)) continue;
      dropPositions.set([d.x + d.vx * age, y, d.z + d.vz * age], count * 3);
      dropAlphas[count++] = .65 * (1 - age / .5);
    }
    dropGeometry.setDrawRange(0, count);
    dropGeometry.attributes.position.needsUpdate = dropGeometry.attributes.effectAlpha.needsUpdate = true;
    ringMaterial.uniforms.fogDensity.value = dropMaterial.uniforms.fogDensity.value = scene.fog.density;
    dropMaterial.uniforms.pixelScale.value = camera.projectionMatrix.elements[5] * 300;
    stats.activeDrops = count;
  }
  return {update, stats};
}
