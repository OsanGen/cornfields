// Optional art never owns startup or a late second presentation commit.
export async function optionalAsset(promise,ms,disposeLate=()=>{}){
  let expired=false,timer;
  const loading=promise.then(value=>{if(expired){disposeLate(value);throw new Error('Optional asset arrived too late');}return value;});
  try{return await Promise.race([loading,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Optional asset load timed out'));},ms);})]);}
  finally{clearTimeout(timer);}
}
export function stripRootTravel(clip,rootNames){
  for(const track of clip.tracks)if(rootNames.some(name=>track.name===`${name}.position`)){
    for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}
  }
}
