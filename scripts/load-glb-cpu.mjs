import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function load(path){
 const bytes=await readFile(path), length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
 for(const material of json.materials||[]){for(const key of ['baseColorTexture','metallicRoughnessTexture'])delete material.pbrMetallicRoughness?.[key];for(const key of ['normalTexture','occlusionTexture','emissiveTexture'])delete material[key];}
 delete json.images;delete json.textures;delete json.samplers;
 const source=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(source.length/4)*4,32);source.copy(padded);
 const binary=bytes.subarray(20+length),output=Buffer.alloc(20+padded.length+binary.length);bytes.copy(output,0,0,12);output.writeUInt32LE(output.length,8);output.writeUInt32LE(padded.length,12);output.writeUInt32LE(0x4e4f534a,16);padded.copy(output,20);binary.copy(output,20+padded.length);
 return new GLTFLoader().parseAsync(output.buffer,'');
}
