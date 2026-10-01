import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original articulated playtest cast. No imported character or motion capture.
// Clothing contours and facial details are authored here; this is not MakeHuman.
export const PROLOGUE_CAST_PROVENANCE = 'Original articulated meshes and animation authored for the Cornfields prologue playtest';

function material(color, roughness = .86) { return new THREE.MeshStandardMaterial({color, roughness}); }
function shape(profile, sx = 1, sz = 1) {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  geometry.scale(sx, 1, sz); return geometry;
}
function ellipsoid(x, y, z) { return new THREE.SphereGeometry(1, 16, 12).scale(x, y, z); }
function piece(parent, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat); mesh.position.fromArray(position); mesh.rotation.set(...rotation); parent.add(mesh); return mesh;
}
function group(parent, x, y, z) { const item = new THREE.Group(); item.position.set(x, y, z); parent.add(item); return item; }

// Combine the unmoving details of each joint into one draw per material.
function compact(parent) {
  for (const child of [...parent.children]) if (child.isGroup) compact(child);
  const sets = new Map();
  for (const child of parent.children) if (child.isMesh) {
    if (!sets.has(child.material)) sets.set(child.material, []);
    sets.get(child.material).push(child);
  }
  for (const [mat, meshes] of sets) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
    piece(parent, merged, mat);
  }
}

export function createPrologueActor({name = 'Clarence', police = true} = {}) {
  const root = new THREE.Group(); root.name = `Prologue ${name}`;
  const skin = material(police ? 0xb78a72 : 0xb78870, .74);
  const shade = material(police ? 0x916755 : 0x92654e, .88);
  const cloth = material(police ? 0x202e39 : 0x625544);
  const clothEdge = material(police ? 0x17212b : 0x423e36);
  const pants = material(police ? 0x182129 : 0x394442);
  const boots = material(0x151617, .66), hair = material(police ? 0x28211f : 0x706962);
  const eyeWhite = material(0xc3bbae, .46), iris = material(0x3d4540, .42);
  const mouthMat = material(0x49372f), brass = material(0xb59b58, .42);
  const shirt = material(police ? 0x19212a : 0x9b9989);
  const hip = group(root, 0, .91, 0);
  piece(hip, shape([[.12,-.08],[.19,-.045],[.185,.08],[.15,.11]], 1.06, .66), pants);
  const body = group(hip, 0, .08, 0);
  piece(body, shape([[.145,0],[.169,.075],[.185,.24],[.21,.34],[.195,.40],[.095,.465]], 1.08, .63), cloth);
  piece(body, shape([[.166,-.022],[.17,.015],[.168,.036]], 1.07, .66), boots);
  piece(body, new THREE.BoxGeometry(.045,.042,.015), brass, [0,.005,.119]);
  // Shirt opening, collar, pockets, seams and shoulders give the torso clothing structure.
  piece(body, new THREE.BoxGeometry(.065,.25,.012), shirt, [0,.30,.13]);
  for (const sign of [-1,1]) {
    piece(body, new THREE.BoxGeometry(.069,.079,.022), clothEdge, [sign*.049,.399,.133], [0,0,sign*.32]);
    piece(body, new THREE.BoxGeometry(.086,.074,.015), clothEdge, [sign*.105,.27,.128]);
    piece(body, new THREE.BoxGeometry(.09,.019,.020), cloth, [sign*.105,.313,.134]);
    piece(body, ellipsoid(.085,.042,.091), cloth, [sign*.183,.373,-.002]);
    if(police) piece(body, new THREE.BoxGeometry(.075,.013,.066), clothEdge, [sign*.173,.415,-.005]);
  }
  for(let i=0;i<4;i++) piece(body, ellipsoid(.004,.004,.003), brass, [0,.11+i*.06,.145]);
  if(police) {
    piece(body, new THREE.CylinderGeometry(.028,.024,.009,6), brass, [-.102,.346,.146], [Math.PI/2,0,0]);
    piece(body, new THREE.BoxGeometry(.071,.014,.009), brass, [.10,.343,.14]);
    piece(body, new THREE.BoxGeometry(.057,.112,.047), boots, [-.15,.10,.10], [0,0,-.09]);
    piece(body, new THREE.CylinderGeometry(.012,.012,.09,7), boots, [-.15,.193,.10]);
    piece(body, new THREE.BoxGeometry(.066,.13,.055), boots, [.175,-.024,0]);
  } else {
    // Open work jacket over a faded undershirt; vertical seams and worn cuffs.
    for(const sign of [-1,1]) piece(body,new THREE.BoxGeometry(.009,.31,.008),clothEdge,[sign*.045,.20,.142],[0,0,sign*.025]);
  }
  piece(body, shape([[.049,0],[.047,.09],[.053,.13]],1,.93),skin,[0,.428,-.008]);
  const head = group(body,0,.60,0);
  // A continuous jaw/skull contour avoids stacked spherical cheeks and chin.
  piece(head,shape([[.031,-.115],[.051,-.097],[.068,-.066],[.081,-.027],[.086,.029],[.084,.074],[.064,.109],[.026,.131],[0,.134]],1,1.04),skin,[0,0,-.006]);
  for(const sign of [-1,1]) {
    piece(head,ellipsoid(.013,.028,.014),skin,[sign*.081,-.010,-.002]);
    piece(head,ellipsoid(.005,.017,.004),shade,[sign*.090,-.009,.006]);
    piece(head,ellipsoid(.027,.010,.007),shade,[sign*.031,.027,.077]);
    piece(head,ellipsoid(.020,.007,.005),eyeWhite,[sign*.030,.026,.080]);
    piece(head,ellipsoid(.006,.006,.003),iris,[sign*.030,.026,.085]);
    piece(head,ellipsoid(.003,.004,.002),boots,[sign*.030,.026,.088]);
    piece(head,ellipsoid(.024,.003,.004),hair,[sign*.031,.044,.082],[0,0,sign*(police?-.035:.11)]);
    if(!police) piece(head,ellipsoid(.022,.007,.006),shade,[sign*.037,.009,.084],[0,0,sign*.1]);
  }
  piece(head,ellipsoid(.009,.029,.014),skin,[0,.004,.087],[-.13,0,0]);
  piece(head,ellipsoid(.014,.010,.013),skin,[0,-.021,.094]);
  for(const sign of [-1,1])piece(head,ellipsoid(.004,.002,.003),shade,[sign*.009,-.027,.099]);
  const jaw = group(head,0,-.063,.059);
  piece(jaw,ellipsoid(.021,.004,.004),shade);
  piece(jaw,ellipsoid(.018,.0015,.003),mouthMat,[0,-.001,.003]);
  // Hair follows the skull rather than making a detached helmet silhouette.
  piece(head,shape([[.087,.024],[.087,.050],[.086,.075],[.066,.112],[.028,.134],[0,.138]],1.045,1.08),hair,[0,0,-.006]);
  for(const sign of [-1,1])piece(head,ellipsoid(.015,.040,.059),hair,[sign*.072,.043,-.022]);
  if(!police) {
    piece(head,ellipsoid(.039,.008,.010),hair,[0,-.043,.086]);
    piece(head,ellipsoid(.050,.026,.014),hair,[0,-.089,.066]);
  }

  const arms=[],legs=[];
  for(const sign of [-1,1]) {
    const shoulder=group(body,sign*.217,.353,0);
    piece(shoulder,shape([[.041,-.315],[.058,-.27],[.068,-.13],[.068,-.045],[.051,.005]],1,.95),cloth);
    const elbow=group(shoulder,0,-.31,0);
    piece(elbow,shape([[.036,-.285],[.041,-.265],[.047,-.18],[.056,-.025],[.044,.025]],1,.95),cloth);
    piece(elbow,shape([[.041,-.291],[.042,-.269]],1,1),clothEdge);
    const hand=group(elbow,0,-.306,0);
    piece(hand,ellipsoid(.036,.057,.023),skin,[0,-.038,.004]);
    for(let finger=0;finger<4;finger++){
      const x=(finger-1.5)*.015, length=[.058,.069,.064,.047][finger];
      piece(hand,ellipsoid(.009,length*.5,.010),skin,[x,-.079-length*.28,.010],[-.16,0,0]);
      piece(hand,ellipsoid(.007,.014,.010),shade,[x,-.079-length*.55,.015],[-.4,0,0]);
    }
    piece(hand,ellipsoid(.013,.034,.014),skin,[sign*.034,-.026,.020],[.2,0,-sign*.48]);
    arms.push({shoulder,elbow,hand,sign});
    const thigh=group(hip,sign*.102,-.045,0);
    piece(thigh,shape([[.055,-.415],[.067,-.31],[.086,-.13],[.085,0],[.07,.045]],1,1),pants);
    const knee=group(thigh,0,-.42,0);
    piece(knee,shape([[.043,-.365],[.047,-.31],[.058,-.15],[.06,.012]],1,1.06),pants);
    piece(knee,ellipsoid(.059,.058,.126),boots,[0,-.377,.044]);
    piece(knee,new THREE.BoxGeometry(.112,.026,.235),boots,[0,-.423,.046]);
    legs.push({thigh,knee,sign});
  }
  compact(root);
  let lastPose='standing';
  return {
    root,
    pose({time=0,phase=0,mode='standing',speaking=false,distress=0,look=0,gesture=0,reduced=false}={}) {
      lastPose=mode;
      const motion=reduced?.35:1,walking=mode==='walk'||mode==='run',running=mode==='run';
      const cycle=Number.isFinite(phase)?phase:0,stride=walking?(running?.50:.24):0;
      hip.position.y=.91+(walking?Math.abs(Math.sin(cycle))*(running?.033:.009):Math.sin(time*(2+distress*2))*.006*(1+distress));
      body.rotation.set(-distress*.035,0,walking?Math.sin(cycle)*.022:0);
      head.rotation.set(Math.sin(time*1.1)*.013*motion-distress*.03,Math.max(-.72,Math.min(.72,look)),Math.sin(time*.71)*.014*motion);
      jaw.scale.y=speaking?1+Math.max(0,Math.sin(time*17))*1.3:1;
      for(const {thigh,knee,sign} of legs){
        const phase=cycle+(sign>0?Math.PI:0);
        thigh.rotation.set(Math.sin(phase)*stride,0,0);
        knee.rotation.set(Math.max(0,-Math.sin(phase))*(running?.75:.33),0,0);
      }
      for(const {shoulder,elbow,hand,sign} of arms){
        const phase=cycle+(sign>0?0:Math.PI);
        shoulder.rotation.set(Math.sin(phase)*stride*.72-distress*.12,0,sign*(.045+distress*.04));
        elbow.rotation.set(-.11-(running?.65:0)-distress*.15,0,0);hand.rotation.set(.04,0,sign*.05);
      }
      if(mode==='drive'){
        hip.position.y=.91;body.rotation.x=-.035;
        for(const {thigh,knee}of legs){thigh.rotation.x=-1.34;knee.rotation.x=1.48;}
        for(const {shoulder,elbow,hand,sign}of arms){shoulder.rotation.set(-.88,sign*.10,-sign*.10);elbow.rotation.x=-.55;hand.rotation.x=-.40;}
      }else if(gesture>0){
        const arm=arms[1];arm.shoulder.rotation.x=-.45*gesture;arm.shoulder.rotation.z=-.2*gesture;arm.elbow.rotation.x=-.9*gesture;
        arm.hand.rotation.z=-.2*gesture;
      }
      if(mode==='point'){
        arms[0].shoulder.rotation.set(-1.0,-.18,.28);arms[0].elbow.rotation.x=-.26;
      }
      if(mode==='breathe'){
        body.rotation.x=-.09-distress*.055;head.rotation.x=-.10;
        for(const arm of arms){arm.shoulder.rotation.x=-.25;arm.elbow.rotation.x=-.46;}
      }
    },
    diagnostics:()=>({name,kind:police?'uniformed police officer':'civilian father',pose:lastPose,provenance:PROLOGUE_CAST_PROVENANCE}),
  };
}
