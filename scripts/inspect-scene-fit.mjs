import * as T from 'three';
import {load} from './load-glb-cpu.mjs';
import {prepareCruiser} from '../src/prologue-assets.js';
import {createTexturedPrologueActor} from '../src/prologue-model-actor.js';
const car=prepareCruiser((await load('assets/intro/cruiser.glb')).scene),cast=await load('assets/intro/cast.glb');
const actor=createTexturedPrologueActor({gltf:cast});actor.root.position.set(-.45,-.38,.09);actor.root.rotation.y=Math.PI;actor.pose({mode:'drive',time:8});
const fmt=v=>v.toArray().map(n=>+n.toFixed(4));
car.model.updateWorldMatrix(true,true);car.model.traverse(o=>{if(o.isMesh&&(/^InteriorSteering|^InteriorDash|^InteriorSeat/.test(o.name))){const b=new T.Box3().setFromObject(o);console.log(o.name,fmt(b.min),fmt(b.max),fmt(o.getWorldPosition(new T.Vector3())),o.material.name,o.material.color?.getHexString());}});
actor.root.updateWorldMatrix(true,true);actor.root.traverse(o=>{if(o.isBone&&/^(hand|armlo|armup|f1|f2)/.test(o.name))console.log('bone',o.name,fmt(o.getWorldPosition(new T.Vector3())),o.quaternion.toArray());});
