import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCornGeometry} from '../src/corn-art.js';
import {createPrologueVisuals} from '../src/prologue-visuals.js';
import {cornInstanceEnvelope,parkedCruiserClearanceBox} from '../src/prologue-clearance.js';

// Geometry contract only: this adapter never claims GPU rendering or visual QA.
function renderer(onRender){
  const rect=new THREE.Vector4(0,0,1280,720),color=new THREE.Color();
  return {domElement:{clientWidth:1280,clientHeight:720},autoClear:true,
    info:{autoReset:true,render:{calls:0},reset(){}},getRenderTarget:()=>null,
    setRenderTarget(){},getScissorTest:()=>false,setScissorTest(){},
    getViewport:p=>p.copy(rect),getScissor:p=>p.copy(rect),setViewport(){},setScissor(){},
    getClearColor:p=>p.copy(color),getClearAlpha:()=>1,setClearColor(){},
    render(scene,camera){scene.updateMatrixWorld(true);onRender(scene,camera);}};
}

for(const touch of [false,true])test(`integrated refined corn clears parked cruiser and western path (${touch?'touch':'desktop'})`,()=>{
  const material=new THREE.MeshStandardMaterial();
  const parts=[0,1,2].map(variant=>({geometry:createCornGeometry(variant),material}));
  let scene;const view=createPrologueVisuals(renderer(s=>scene=s),{getCorn:()=>parts,touch});
  try{
    view.render({chapter:'walk',chapterProgress:.5,time:3});
    const location=scene.getObjectByName('Cruiser interior, passenger on right').parent;
    const inverse=location.matrixWorld.clone().invert(),guard=parkedCruiserClearanceBox();
    let count=0,west=0;
    scene.traverse(mesh=>{
      if(!mesh.isInstancedMesh||!/corn/i.test(mesh.name))return;
      for(let i=0;i<mesh.count;i++){
        const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
        const bounds=cornInstanceEnvelope(mesh.geometry,matrix,inverse.clone().multiply(mesh.matrixWorld));
        assert(!bounds.intersectsBox(guard),`${mesh.name} ${i}: refined leaves intrude into car/door clearance`);
        if(mesh.parent.name==='Westward cornfield approach and threshold'){
          assert(bounds.max.x<-7,'refined west field must remain across the road');west++;
        }
        count++;
      }
    });
    assert(count>(touch?500:850),'bounded clearance must retain the field/roadside population');
    assert(west>(touch?380:630),'west field population retained');
  }finally{view.dispose();for(const part of parts)part.geometry.dispose();material.dispose();}
});
