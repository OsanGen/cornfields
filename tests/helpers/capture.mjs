import {writeFile} from 'node:fs/promises';

/** Synchronize explicit game stepping with GPU completion before host capture. */
export async function captureGame(page,options){
  const completion=await page.evaluate(async()=>{
    const canvas=document.querySelector('#scene'),gl=canvas?.getContext('webgl2');
    if(!gl||gl.isContextLost())throw new Error('Capture requires a live WebGL2 context');
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),start=performance.now();
    if(!fence)throw new Error('Could not create capture fence');
    gl.flush();
    try{
      while(true){
        const result=gl.clientWaitSync(fence,0,0);
        if(result===gl.ALREADY_SIGNALED||result===gl.CONDITION_SATISFIED)break;
        if(result===gl.WAIT_FAILED||gl.isContextLost())throw new Error('Capture GPU fence failed');
        if(performance.now()-start>20000)throw new Error('Capture GPU work did not complete within 20 seconds');
        await new Promise(resolve=>setTimeout(resolve,16));
      }
    }finally{gl.deleteSync(fence);}
    const gpuWaitMs=Math.round(performance.now()-start);
    await new Promise((resolve,reject)=>{
      let frame;
      const timer=setTimeout(()=>{cancelAnimationFrame(frame);reject(new Error('Capture compositor did not advance within 2 seconds'));},2000);
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{clearTimeout(timer);resolve();});});
    });
    return {gpuWaitMs,fonts:document.fonts.status,width:canvas.width,height:canvas.height};
  });
  console.log('Capture GPU complete',JSON.stringify(completion));
  try{return await page.screenshot({timeout:30000,...options});}
  catch(error){
    // Preserve a diagnostic from the alternate capture path, but keep the gate failed.
    let session,timer;
    try{
      session=await page.context().newCDPSession(page);
      const capture=await Promise.race([
        session.send('Page.captureScreenshot',{format:'png',fromSurface:false}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Alternate capture timed out after 10 seconds')),10000);}),
      ]);
      await writeFile(options.path.replace(/\.png$/, '-capture-diagnostic.png'),Buffer.from(capture.data,'base64'));
    }catch(diagnosticError){console.log('Alternate capture failed:',diagnosticError.message);}
    finally{clearTimeout(timer);if(session)await session.detach().catch(()=>{});}
    throw error;
  }
}
