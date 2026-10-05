import * as THREE from 'three';

// Measured shipped cruiser: x [-1.363,1.363], z [-1.617,2.740].
// Include both fully opened doors, hand/foot transfer, leaf motion and margin.
export const PARKED_CRUISER_CLEARANCE=Object.freeze({min:Object.freeze([-2.80,-.3,-2.25]),max:Object.freeze([2.80,3.8,3.20]),sway:.38});
const carBox=new THREE.Box3(new THREE.Vector3().fromArray(PARKED_CRUISER_CLEARANCE.min),new THREE.Vector3().fromArray(PARKED_CRUISER_CLEARANCE.max));
export function cornInstanceEnvelope(geometry,matrix,parentMatrix=new THREE.Matrix4()){
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  return geometry.boundingBox.clone().applyMatrix4(parentMatrix.clone().multiply(matrix)).expandByVector(new THREE.Vector3(PARKED_CRUISER_CLEARANCE.sway,0,PARKED_CRUISER_CLEARANCE.sway));
}
export function cornClearsParkedCruiser(geometry,matrix,parentMatrix){return !cornInstanceEnvelope(geometry,matrix,parentMatrix).intersectsBox(carBox);}
export function parkedCruiserClearanceBox(){return carBox.clone();}
