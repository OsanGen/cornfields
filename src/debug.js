/** Stable verification hooks, using the same runtime as real input. */
export function installDebugHooks(app, window, maze, parameters) {
  window.render_game_to_text = () => JSON.stringify(app.snapshot());
  window.advanceTime = milliseconds => app.advance(milliseconds);
  if (parameters.has('test')) {
    window.__test = {
      diagnostics: app.diagnostics,
      intro:app.introSnapshot,
      state: () => app.snapshot(true),
      maze: () => maze.grid,
      anchors: () => structuredClone(maze.hideAnchors),
      route: app.route,
      survival:app.survivalLayout,
      corridors:app.corridorLayout,
      puddles: app.weatherSurfaces,
      doors:()=>structuredClone(maze.cornDoors),
      fixture:app.fixture,
      step: app.step,
      render:app.preview,
      animation:app.animationTrial,
    };
    if(parameters.has('lab'))installLab(app,window);
  }
}

function installLab(app,window){
  const document=window.document,panel=document.createElement('aside');
  panel.id='development-lab';panel.style.cssText='position:fixed;z-index:30;bottom:8px;left:8px;max-width:90vw;background:#101b16ed;color:#dfebce;padding:10px;font:12px monospace';
  const select=document.createElement('select');select.setAttribute('aria-label','Development scene');
  for(const name of ['viewmodel','corridor','gate','field','animation','encounter']){const option=document.createElement('option');option.value=option.textContent=name;select.append(option);}
  const clips=document.createElement('select');clips.setAttribute('aria-label','Animation trial');
  for(const name of ['Gameplay poses','Original breathing idle','Zombie Lurch','Pixelhouse Fury','Pixelhouse Collapse']){const option=document.createElement('option');option.textContent=option.value=name;clips.append(option);}
  const button=document.createElement('button');button.textContent='Load scene';
  let animate=false,start=0;
  button.onclick=()=>{app.animationTrial(null);app.fixture(select.value);animate=['animation','viewmodel'].includes(select.value);start=performance.now();};
  clips.onchange=()=>{app.animationTrial(clips.value==='Gameplay poses'?null:clips.value);start=performance.now();};
  const label=document.createElement('span');label.textContent=' LOCAL LAB · Begin/skip intro first · ';
  const status=document.createElement('pre');status.style.margin='8px 0 0';
  panel.append(label,select,button,clips,status);document.body.append(panel);
  let last=0;
  function frame(time){
    if(animate&&!document.hidden)app.preview((time-start)/1000);
    if(time-last>500){const d=app.diagnostics();status.textContent=JSON.stringify({state:d.enemy?.state,quality:d.quality?.tier,drawCalls:d.drawCalls,triangles:d.triangles,clip:d.creature?.animation?.clip,playerModel:d.visuals?.hands?.status});last=time;}
    if(panel.isConnected)window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}
