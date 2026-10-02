import {pathTo} from './maze.js';
import {
  createGame, startGame, pauseGame, resumeGame,
  updateGame, gameSnapshot, blocksFor,
} from './game.js';
import {createStepper} from './runtime-loop.js';
import {createInput} from './input.js';
import {createTouchInput} from './touch-input.js';
import {normalizeAlias} from './horror-presentation.js';
import {createUI} from './ui.js';
import {createIntro, INTRO_ENABLED} from './intro.js';
import {setReturnOpen} from './corn-layout.js';
import {enterOpenField} from './corridor-run.js';
import {createOpening} from './opening.js';
import {PROLOGUE_END_LINE} from './prologue-script.js';

/**
 * Owns one game session and its browser lifecycle.
 * Scene/audio are supplied by the entrypoint; tests use small adapters.
 * Importing this module has no browser or WebGL side effects.
 */
export function createGameApp({
  maze, view, audio, weather = null, document, window,
  debug = false,
  reducedMotion = false,
  touch = false,
  horror = true,
  introEnabled = INTRO_ENABLED,
  introView = null,
  prologueEnabled = false,
  prologueView = null,
  prologueAudio = null,
  ready = null,
  now = () => performance.now(),
  requestFrame = callback => window.requestAnimationFrame(callback),
  cancelFrame = id => window.cancelAnimationFrame(id),
}) {
  const canvas = document.getElementById('scene');
  const ui = createUI(document, {debug, reducedMotion, touch, horror});
  const listeners = [];
  let game = createGame(maze);
  let previousMode = game.mode;
  let last = now();
  let frameId = null;
  let disposed = false;
  let manual = false;
  let pointerError = null;
  let audioTicks = 0;
  let entryAttempt = 0;
  let alias='STRANGER';
  let coreReady = !ready, coreError = null, introAudioAttempt = 0, introEntering = false, pendingCapture = null;
  let creditsOpen = false;
  prologueEnabled=prologueEnabled&&introEnabled;
  let openingStage=null,endingAt=null;
  const intro = prologueEnabled?createOpening({onCue:id=>prologueAudio?.cue(id),onIntroCue:id=>audio.introCue?.(id)}):createIntro({enabled:introEnabled, onCue:id=>audio.introCue?.(id)});
  if(prologueEnabled){ui.node('player-alias').value='MIKE';document.body.classList.toggle('story-player',true);}
  if (ready) Promise.resolve(ready).then(()=>{if(!disposed){coreReady=true;present();}},error=>{
    if(!disposed){coreError=error.message;ui.showError('The field could not load. Reload to retry.');present();}
  });

  const input = (touch ? createTouchInput : createInput)({
    document,
    canvas,
    isPlaying: () => intro.active?prologueEnabled&&intro.stage==='prologue'&&intro.phase==='playing':game.mode === 'playing',
    isQte:()=>game.interaction?.phase==='qte',
    inputTime:stamp=>manual?game.elapsed:game.elapsed+clock.pendingSeconds+Math.max(0,Math.min(.25,((Number.isFinite(stamp)&&stamp<1e12?stamp:now())-last)/1000)),
    onPause: pause,
    onEscape() { if(prologueEnabled&&intro.active)pause();else if (['playing','paused'].includes(intro.phase)) skipIntro(); else pause(); },
    isPresentation: () => intro.active&&!(prologueEnabled&&intro.stage==='prologue'&&intro.phase==='playing'),
    onMute() {
      game.caption = audio.toggleMute() ? 'Sound muted.' : 'Sound on.';
      game.captionTime = 2;
    },
  });
  const clock = createStepper((dt, controls) => {
    const previousPhase=game.interaction?.phase;
    updateGame(game, dt, controls);
    if(previousPhase!==game.interaction?.phase){input.clearEdges();game.pendingStabs.length=0;}
    const events = game.events.splice(0);
    const weatherEvents = weather?.update(game, dt, {events, reduced: reducedMotion, muted: audio.muted}) || [];
    for (const event of events) {
      audio.event(event, game);
      view.event?.(event);
    }
    audio.weatherState?.(game, weather?.state);
    for (const event of weatherEvents) audio.weatherEvent?.(event, game);
    audio.update(game, dt, {footsteps: !weather});
    audioTicks++;
    // Present the newly enabled action before consuming any more catch-up time.
    return previousPhase!=='qte'&&game.interaction?.phase==='qte';
  });

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  function syncMode() {
    if (previousMode === game.mode) return;
    // Releasing capture can synchronously dispatch another lifecycle event.
    previousMode = game.mode;
    input.clear();
    clock.reset();
    if (game.mode !== 'playing' && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    if (game.mode === 'paused') audio.pause();
    ui.focusMode(game.mode);
  }

  function present(time = game.elapsed) {
    syncMode();
    ui.render(game);
    ui.renderIntro(intro, {enabled:introEnabled, portrait:touch&&window.innerHeight>window.innerWidth, coreReady, coreError, entering:introEntering, pointerError, creditsOpen, muted:audio.muted, volume:audio.volume});
    if(prologueEnabled)ui.renderOpening(intro,{touch,portrait:touch&&window.innerHeight>window.innerWidth,coreReady,coreError,entering:introEntering,pointerError});
    const endingTime=endingAt===null?Infinity:game.elapsed-endingAt;
    const ending=endingTime<PROLOGUE_END_LINE.end&&game.mode==='playing'&&!intro.active;
    ui.renderEnding?.(ending?PROLOGUE_END_LINE.text:'');
    if(ending)prologueAudio?.sync({gameplay:true,time:endingTime,line:PROLOGUE_END_LINE,chapter:'gameplay'});
    else if(endingAt!==null&&endingTime>=PROLOGUE_END_LINE.end){endingAt=null;prologueAudio?.release();}
    if (intro.active) {
      try {
        if(prologueEnabled&&intro.phase!=='preflight'){
          if(openingStage!==intro.stage){
            openingStage=intro.stage;
            if(openingStage==='credits'){prologueAudio?.pause();prologueAudio?.prepareLine(PROLOGUE_END_LINE);introView?.start();if(intro.phase==='playing')audio.startIntro?.();}
            else{audio.stopIntro?.();introView?.release();if(openingStage==='prologue')prologueView?.start();}
          }
          const shot=intro.frame(reducedMotion);
          if(intro.stage==='credits')introView?.render(shot);
          else prologueView?.render(shot);
          if(intro.stage==='prologue'&&intro.phase==='playing')prologueAudio?.sync(shot);
        }else if(prologueEnabled)view.render(game,0,reducedMotion);
        else introView?.render(intro.frame(reducedMotion));
      }
      catch { introView?.release(); introView=null; }
    } else view.render(game, time, reducedMotion);
  }

  function cancelIntroEntry() {
    if (!introEntering) return;
    entryAttempt++; introEntering=false;
    pendingCapture?.reject(new Error('Entry interrupted. Click Enter the Field to retry.'));
    pendingCapture=null;
  }

  function introAudio(quiet=false) {
    const attempt=++introAudioAttempt;
    Promise.resolve(audio.prepare?.()).then(()=>{
      if(disposed||document.hidden||intro.phase==='paused'){audio.pause();return;}
      if(attempt!==introAudioAttempt) return;
      if((intro.phase==='playing'||intro.phase==='ready')&&!document.hidden)audio.startIntro?.({quiet});
      else audio.pause();
    }).catch(()=>{/* Silent intro is a valid fallback. */});
  }

  function beginIntro(replay=false) {
    if(prologueEnabled){void beginOpening({replay});return;}
    if(!introEnabled)return;
    if(disposed||(!replay&&intro.phase!=='preflight')||(replay&&game.mode==='playing'))return;
    if(!intro.begin({replay}))return;
    creditsOpen=false;input.clear();clock.reset();last=now();manual=false;
    ui.chooseIntroFont();
    try{introView?.start();}catch{introView?.release();introView=null;}
    introAudio();present();ui.node('intro-skip').focus();
  }

  function finishReplay() {
    introAudioAttempt++;audio.stopIntro?.();audio.pause();intro.finish();introView?.release();input.clear();clock.reset();last=now();
    if(prologueEnabled){prologueAudio?.release();prologueView?.release();openingStage=null;if(document.pointerLockElement===canvas)document.exitPointerLock();}
    present();ui.focusMode(game.mode);
    if(game.mode==='menu')ui.node('start-btn').focus();
  }

  function readyIntro() {
    introAudioAttempt++;audio.stopIntro?.();input.clearEdges();clock.reset();
    if(intro.replaying){finishReplay();return;}
    if(prologueEnabled){finishOpening();return;}
    if(!document.hidden)audio.startIntro?.({quiet:true});
    present();ui.node('intro-enter').focus();
  }

  function skipIntro() {
    if(prologueEnabled){
      if(intro.phase==='preflight'){void beginOpening({skip:true});return;}
      if(!intro.active||disposed)return;
      if(intro.phase==='paused'&&!touch){void beginOpening({skip:true});return;}
      prologueAudio?.pause();audio.stopIntro?.();intro.skip();input.clear();readyIntro();return;
    }
    if(!intro.active||intro.phase==='ready'||disposed)return;
    intro.skip();readyIntro();
  }

  function tickIntro(dt,controls) {
    const phase=intro.phase;
    if(prologueEnabled){
      let remaining=dt,first=true;
      while(remaining>1e-8&&intro.phase==='playing'){
        const step=Math.min(.05,remaining),value=controls?{...controls}:input.read(intro.player);
        if(!first&&controls)Object.assign(value,{interact:false,flashlight:false,fire:false});
        intro.tick(step,value);remaining-=step;first=false;
      }
    }else intro.tick(dt);
    if(phase==='playing'&&intro.phase==='ready')readyIntro();
  }

  function finishOpening(){
    if(disposed||!coreReady||coreError||document.hidden||(touch&&window.innerHeight>window.innerWidth)||(!touch&&document.pointerLockElement!==canvas)){
      pointerError='Opening paused. Continue when you are ready.';prologueAudio?.pause();audio.pause();present();return;
    }
    const skipped=intro.snapshot().skipped,light=intro.player.flashlightOn;
    if(skipped)prologueAudio?.release();else prologueAudio?.pause();
    prologueView?.release();introView?.release();audio.stopIntro?.();intro.finish();openingStage=null;
    if(skipped){input.quarantine?.();input.clear();}else{input.quarantineActions?.();input.clearEdges();}
    clock.reset();last=now();
    alias='MIKE';ui.setAlias(alias);startGame(game);previousMode=game.mode;game.player.flashlightOn=light;
    endingAt=skipped?null:game.elapsed;audio.startGameplay?.();present();
  }

  async function beginOpening({replay=false,skip=false}={}){
    if(disposed||introEntering||!coreReady||coreError||(touch&&window.innerHeight>window.innerWidth))return;
    if(replay&&game.mode==='playing')return;
    if(!replay&&!['preflight','paused','ready'].includes(intro.phase))return;
    const attempt=++entryAttempt;introEntering=true;pointerError=null;let timer,accepted=false;
    try{
      const capture=touch?Promise.resolve():new Promise((resolve,reject)=>{
        pendingCapture={resolve,reject};
        if(document.pointerLockElement===canvas){resolve();return;}
        const result=canvas.requestPointerLock();
        if(result?.then)result.then(resolve,reject);else if(document.pointerLockElement===canvas)resolve();
        timer=setTimeout(()=>reject(new Error('Mouse capture unavailable. Press Continue to retry.')),4000);
      });
      const sound=Promise.resolve(audio.prepare?.()).catch(()=>false);
      sound.then(()=>{
        if(disposed||document.hidden||intro.phase==='paused'||(!intro.active&&game.mode!=='playing'))audio.pause();
        else if(attempt!==entryAttempt)return;
        else if(!accepted&&!introEntering)audio.pause();
        else if(accepted&&!intro.active&&game.mode==='playing')audio.startGameplay?.();
        else if(accepted&&intro.stage==='credits')audio.startIntro?.();
        if(!disposed&&accepted)present();
      });
      await capture;
      if(disposed||attempt!==entryAttempt)return;
      if(document.hidden||(!touch&&document.pointerLockElement!==canvas))throw new Error('Opening interrupted. Press Continue to retry.');
      accepted=true;
      if(intro.phase==='ready'){finishOpening();return;}
      if(intro.phase==='paused')intro.resume();else{intro.begin({replay});openingStage=null;}
      if(skip)intro.skip();
      ui.chooseIntroFont();input.clear();clock.reset();last=now();manual=false;
      if(intro.phase==='ready')readyIntro();
    }catch(error){if(!disposed&&attempt===entryAttempt){pointerError=error.message;prologueAudio?.pause();audio.pause();}}
    finally{clearTimeout(timer);if(attempt===entryAttempt){pendingCapture=null;introEntering=false;}if(!disposed)present();}
  }

  async function enterIntro() {
    if(prologueEnabled){await beginOpening();return;}
    if(disposed||intro.phase!=='ready'||!coreReady||coreError||introEntering)return;
    if(touch&&window.innerHeight>window.innerWidth)return;
    const attempt=++entryAttempt;introEntering=true;pointerError=null;
    input.clear();clock.reset();
    let timer;
    try {
      // Capture is requested synchronously in the button event, before any await.
      const capture=touch?Promise.resolve():new Promise((resolve,reject)=>{
        pendingCapture={resolve,reject};
        const result=canvas.requestPointerLock();
        if(result?.then)result.then(resolve,reject);
        else if(document.pointerLockElement===canvas)resolve();
        timer=setTimeout(()=>reject(new Error('Mouse capture timed out. Click Enter the Field to retry.')),4000);
      });
      introAudioAttempt++;audio.stopIntro?.();
      const sound=Promise.resolve(audio.prepare?.()).catch(()=>{});
      sound.then(()=>{if(disposed||document.hidden||intro.phase==='paused'||(!intro.active&&game.mode!=='playing'))audio.pause();});
      await capture;
      if(disposed||attempt!==entryAttempt)return;
      if(!touch&&document.pointerLockElement!==canvas)throw new Error('Mouse capture denied. Click Enter the Field to retry.');
      if(document.hidden)throw new Error('Return to the field and try again.');
      alias=normalizeAlias(ui.node('player-alias').value);ui.node('player-alias').value=alias;ui.setAlias(alias);
      intro.finish();introView?.release();input.quarantine?.();input.clear();clock.reset();last=now();manual=false;
      startGame(game);
      document.body.classList.toggle('intro-handoff',true);
      sound.then(()=>{if(!disposed&&attempt===entryAttempt&&!intro.active&&game.mode==='playing')audio.startGameplay?.();});
    } catch(error) {
      if(!disposed&&attempt===entryAttempt){pointerError=error.message;audio.pause();}
    } finally {
      clearTimeout(timer);
      if(attempt===entryAttempt){pendingCapture=null;introEntering=false;}
      if(!disposed)present();
    }
  }

  function pause() {
    view.quality?.reset();
    if(intro.active){
      cancelIntroEntry();introAudioAttempt++;intro.pause();prologueAudio?.pause();audio.pause();input.clear();clock.reset();
      if(prologueEnabled&&document.pointerLockElement===canvas)document.exitPointerLock();present();return;
    }
    input.clear();
    prologueAudio?.pause();
    pauseGame(game);
    clock.reset();
    present();
  }

  async function enter(reset = false) {
    if (disposed) return;
    if(prologueEnabled&&intro.active){
      if(!reset){await beginOpening();return;}
      intro.finish();prologueAudio?.pause();prologueView?.release();introView?.release();openingStage=null;
    }
    if(intro.active){if(intro.phase==='preflight')beginIntro();else if(intro.phase==='ready')await enterIntro();return;}
    if(!coreReady||coreError)return;
    if (touch && window.innerHeight > window.innerWidth) return;
    const attempt = ++entryAttempt;
    if(game.mode==='menu'){
      alias=normalizeAlias(ui.node('player-alias').value);
      ui.node('player-alias').value=alias;ui.setAlias(alias);
    }
    if (reset) {
      endingAt=null;prologueAudio?.release();
      game = createGame(maze);
      audio.reset();
      weather?.reset();
      view.reset?.();
      ui.reset();
      manual = false;
    }
    if (game.mode === 'menu') startGame(game);
    else resumeGame(game);
    input.clear();
    clock.reset();
    last = now();
    pointerError = null;
    const failed = error => {
      if (disposed || attempt !== entryAttempt) return;
      pointerError = error?.message || 'Mouse capture was denied. Click Continue to retry.';
      pause();
    };
    // Request capture inside the click, before awaiting audio unlock.
    try {
      if (!touch) {
        const lock = canvas.requestPointerLock();
        if (lock?.catch) lock.catch(failed);
      }
    } catch (error) {
      failed(error);
    }
    try {
      await audio.unlock();
    } catch {
      if (!disposed && attempt === entryAttempt) {
        game.caption = 'Sound could not start. You can continue muted.';
        game.captionTime = 4;
      }
    }
    if (disposed || game.mode !== 'playing') audio.pause();
    if (!disposed && attempt === entryAttempt) present();
  }

  function frame(time) {
    if (disposed) return;
    const dt = (time - last) / 1000;
    last = time;
    view.quality?.sample(dt,!manual&&!document.hidden&&!intro.active&&game.mode==='playing'&&!game.interaction&&coreReady);
    if (!manual) {
      if(intro.active)tickIntro(prologueEnabled?Math.max(0,Math.min(.1,dt)):dt);
      else clock.frame(dt, step => input.read(game.player,game.elapsed+step));
    }
    // Explicit test stepping renders once per step. Repainting identical manual
    // frames can starve software-rendered browser captures without advancing play.
    if(!manual)present(game.elapsed + (game.mode === 'menu' ? time / 1000 : 0));
    frameId = requestFrame(frame);
  }

  listen(ui.node('start-btn'), 'click', () => void enter());
  ui.node('graphics-quality').value=view.quality?.snapshot().mode||'auto';
  listen(ui.node('graphics-quality'),'change',event=>{view.quality?.set(event.target.value);present();});
  listen(ui.node('preflight-skip'),'click',skipIntro);
  listen(ui.node('intro-skip'),'click',skipIntro);
  listen(ui.node('intro-enter'),'click',()=>void enterIntro());
  listen(ui.node('intro-continue'),'click',()=>{
    if(prologueEnabled){void beginOpening();return;}
    if(intro.phase!=='paused')return;
    intro.resume();last=now();manual=false;introAudio();present();ui.node('intro-skip').focus();
  });
  for(const id of ['replay-intro','credits-replay'])listen(ui.node(id),'click',()=>beginIntro(true));
  if(prologueEnabled){
    listen(ui.node('story-skip'),'click',()=>{intro.skipStory();prologueAudio?.pause();present();});
    listen(ui.node('opening-pause'),'click',pause);
    listen(document,'keydown',event=>{
      if(!intro.active||event.repeat||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
      if(event.code==='KeyK'){event.preventDefault();skipIntro();}
      if(event.code==='KeyJ'){event.preventDefault();intro.skipStory();prologueAudio?.pause();present();}
    });
  }
  for(const id of ['credits-btn','pause-credits'])listen(ui.node(id),'click',()=>{creditsOpen=true;present();ui.node('credits-close').focus();});
  listen(ui.node('credits-close'),'click',()=>{creditsOpen=false;present();ui.focusMode(game.mode);if(game.mode==='menu')ui.node('credits-btn').focus();});
  listen(ui.node('intro-mute'),'click',()=>{
    if(prologueEnabled){audio.toggleMute();if(audio.muted)prologueAudio?.pause();else if(intro.phase==='playing')void Promise.resolve(audio.prepare?.()).then(()=>{if(disposed||document.hidden||intro.phase!=='playing')audio.pause();else if(intro.stage==='credits')audio.startIntro?.();});present();return;}
    audio.toggleMute();if(!audio.muted&&['playing','ready'].includes(intro.phase))introAudio(intro.phase==='ready');present();
  });
  listen(ui.node('intro-volume'),'input',event=>{audio.setVolume(Number(event.target.value)/100);ui.node('volume').value=event.target.value;});
  listen(ui.node('intro-motion'),'change',event=>{
    reducedMotion=event.target.checked;ui.node('motion').checked=reducedMotion;ui.setReducedMotion(reducedMotion);present();
  });
  listen(ui.node('resume-btn'), 'click', () => void enter());
  listen(ui.node('retry-btn'), 'click', () => void enter(true));
  listen(ui.node('restart-btn'), 'click', () => void enter(true));
  listen(ui.node('player-alias'),'keydown',event=>{if(event.key==='Enter'){event.preventDefault();void enter();}});
  listen(ui.node('title-btn'),'click',()=>{
    endingAt=null;prologueAudio?.release();
    pause();game=createGame(maze);weather?.reset();audio.reset();view.reset?.();ui.reset();input.clear();clock.reset();
    ui.node('player-alias').value=alias;present();ui.node('player-alias').focus();
  });
  listen(ui.node('volume'), 'input', event => audio.setVolume(Number(event.target.value) / 100));
  listen(ui.node('motion'), 'change', event => {
    reducedMotion = event.target.checked;
    ui.node('intro-motion').checked=reducedMotion;
    ui.setReducedMotion(reducedMotion);
  });
  ui.node('fullscreen-btn').hidden = typeof ui.node('game').requestFullscreen !== 'function';
  listen(ui.node('fullscreen-btn'), 'click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await ui.node('game').requestFullscreen?.();
    } catch { /* Fullscreen is optional, including on mobile browsers. */ }
  });
  listen(document, 'pointerlockchange', () => {
    if (touch) return;
    if(intro.active){
      if(prologueEnabled){
        if(document.pointerLockElement===canvas)pendingCapture?.resolve();
        else if(introEntering)pendingCapture?.reject(new Error('Mouse capture was lost. Press Continue to retry.'));
        else if(intro.phase==='playing')pause();
        return;
      }
      if(document.pointerLockElement===canvas){if(introEntering)pendingCapture?.resolve();else document.exitPointerLock();}
      else if(introEntering)pendingCapture?.reject(new Error('Mouse capture was lost. Click Enter the Field to retry.'));
      return;
    }
    if (document.pointerLockElement !== canvas && game.mode === 'playing') pause();
  });
  listen(document, 'pointerlockerror', () => {
    if (touch) return;
    // A delayed error from an older request must not cancel a newer capture.
    if (document.pointerLockElement === canvas) return;
    if(intro.active){pendingCapture?.reject(new Error('Mouse capture denied. Click Enter the Field to retry.'));return;}
    pointerError ||= 'Mouse capture denied';
    pause();
  });
  listen(window, 'blur', pause);
  function pauseForLifecycle(){
    if(disposed)return;
    pause();audio.pause();input.clear();clock.reset();last=now();
  }
  listen(window,'pagehide',pauseForLifecycle);
  listen(window,'pageshow',event=>{if(event.persisted)pauseForLifecycle();});
  if(audio.onInterruption)listeners.push(audio.onInterruption(pauseForLifecycle));
  if (touch) {
    const viewportChanged = () => {
      input.clear();
      const portrait = window.innerHeight > window.innerWidth;
      ui.node('rotate').hidden = !portrait||intro.active;
      if (portrait) pause();
      else present();
    };
    listen(window, 'resize', viewportChanged);
    listen(window, 'orientationchange', pause);
    viewportChanged();
  }
  listen(document, 'visibilitychange', () => {
    if (document.hidden) pause();
  });
  listen(canvas, 'webglcontextlost', event => {
    event.preventDefault();
    pause();
    ui.showError('Graphics were interrupted. Reload to restart the field.');
  });

  ui.node('loading').textContent = 'FIND SADIE YATES · 2 ROUNDS · NO SAVES';
  ui.node('start-btn').disabled = !intro.active&&!coreReady;
  present();

  return {
    enter,
    pause,
    introSnapshot:()=>({...intro.snapshot(),coreReady,entering:introEntering,visuals:introView?.diagnostics?.(),prologueVisuals:prologueView?.diagnostics?.(),prologueAudio:prologueAudio?.diagnostics?.()}),
    restart: () => enter(true),
    startLoop() {
      if (frameId === null && !disposed) frameId = requestFrame(frame);
    },
    snapshot: (diagnostic=false) => ({...gameSnapshot(game,{diagnostic}), ...(weather ? {weather: weather.snapshot()} : {}),...(prologueEnabled&&intro.active?{opening:{...intro.snapshot(),subtitle:intro.frame(reducedMotion).spoken||'',speaker:intro.frame(reducedMotion).speaker||''}}:{})}),
    weatherSurfaces: () => weather ? weather.state.puddles.map(p => ({...p})) : [],
    preview(time){manual=true;view.render(game,time,reducedMotion);},
    animationTrial(name){view.animationTrial?.(name);},
    fixture(name){
      const viewmodel=name==='viewmodel';if(viewmodel)name='corridor';
      if(['field','animation'].includes(name)&&maze.corridorLayout){
        game=createGame(maze);game.mode='playing';game.entered=true;game.corridorRun.started=true;game.grace=100;
        const door=maze.cornDoors.find(d=>d.fieldEntrance),at=maze.corridorLayout.sections[1].anchor;
        Object.assign(game.player,at,{yaw:0,flashlightOn:true});
        Object.assign(game.enemy,{x:at.x,z:at.z-3,state:'observe',stateStartedAt:0,timer:100,visible:true,yaw:Math.PI});
        if(name==='field'){game.cornDoors[door.index].amount=1;Object.assign(game.player,{x:door.x,z:door.z+1});enterOpenField(game,door);Object.assign(game.player,{x:8,z:8});}
        input.clear();clock.reset();manual=true;present();return;
      }
      if(game.corridorRun){
        if(name==='eligible'){Object.assign(game.corridorRun,{elapsed:180,distance:120});return;}
        if(['gate','encounter','corridor'].includes(name)){
          if(game.fieldTrip.active){game=createGame(maze);view.animationTrial?.(null);}
          const d=game.maze.cornDoors.find(d=>d.fieldEntrance);
          game.mode='playing';game.entered=true;game.corridorRun.started=true;
          const at=name==='gate'?{x:d.x,z:d.z+1.3}:game.maze.corridorLayout.sections[1].anchor;
          Object.assign(game.player,at,{yaw:0,pitch:0,flashlightOn:false,zone:'corridor'});
          game.chapter='THE WOODEN ROWS';game.objective='FIND SADIE YATES';
          Object.assign(game.enemy,{x:at.x,z:at.z-(name==='encounter'?.7:10),state:name==='encounter'?'chase':'observe',timer:100,visible:true,active:true,zone:'corridor',target:{...at},yaw:Math.PI});
          if(viewmodel){for(const enemy of game.enemies){enemy.active=false;enemy.visible=false;}game.threat.activeMessage=null;game.threat.activeMessageTime=0;game.caption='';}
          game.grace=name==='encounter'?0:100;input.clear();clock.reset();manual=true;present();return;
        }
      }
      if(name==='eligible'&&game.cornSurvival?.state==='active_survival'){
        Object.assign(game.cornSurvival,{elapsed:180,distance:120,movementQualified:true});return;
      }
      if(!['gate','encounter'].includes(name))throw new Error('Unknown local fixture');
      if(name==='encounter'&&game.cornSurvival){
        const layout=game.maze.survivalLayout;
        Object.assign(game.cornSurvival,{state:'active_survival',startedAt:game.elapsed,previous:{...layout.sections[4].anchor}});
        setReturnOpen(game.maze,false);
        for(const index of [layout.outer,layout.inner])Object.assign(game.cornDoors[index],{amount:0,target:0,locked:true});
        game.mode='playing';game.entered=true;game.grace=0;
        Object.assign(game.player,layout.sections[4].anchor,{yaw:0,pitch:0,flashlightOn:false});
        Object.assign(game.enemy,{x:game.player.x,z:game.player.z-.7,state:'chase',target:{x:game.player.x,z:game.player.z},visible:true,yaw:Math.PI});
        input.clear();clock.reset();manual=true;present();return;
      }
      const d=maze.hideAnchors[0];game.doorOpen=true;game.doorAmount=1;game.entered=true;game.mode='playing';
      Object.assign(game.player,{x:d.x-d.normal.x*.7,z:d.z-d.normal.z*.7,yaw:d.entryYaw,pitch:0,flashlightOn:false});
      Object.assign(game.enemy,{x:game.player.x-d.normal.x*(name==='encounter'?.7:10),z:game.player.z-d.normal.z*(name==='encounter'?.7:10),state:'chase',target:{x:game.player.x,z:game.player.z},visible:true,yaw:d.entryYaw+Math.PI});
      if(name==='gate')Object.assign(game.enemy,{state:'disengage',target:null,timer:100});
      game.grace=name==='gate'?100:0;input.clear();clock.reset();manual=true;present();
    },
    route: (target=game.maze.center) => pathTo(game.maze, game.player, target, blocksFor(game)),
    survivalLayout:()=>structuredClone(game.maze.survivalLayout),
    corridorLayout:()=>structuredClone(game.maze.corridorLayout),
    diagnostics: () => ({
      ...gameSnapshot(game,{diagnostic:true}),
      audioState: audio.ctx?.state || 'uninitialized',
      audioSamples:Object.keys(audio.samples||{}),
      weaponAudio:{...audio.weaponStats,voices:audio.weaponVoices?.size||0},
      footstepAudio:audio.footsteps?.diagnostics(),
      weatherAudioSamples:Object.keys(audio.weatherSamples||{}),
      weather:weather?.snapshot(),
      audioSources:audio.transients?.size||0,
      creature:view.creatureDiagnostics?.(),
      audioTicks,
      muted: audio.muted,
      reducedMotion,
      intro:{...intro.snapshot(),coreReady,visuals:introView?.diagnostics?.()},
      controlMode: touch ? 'touch' : 'mouse',
      pointerLocked: document.pointerLockElement === canvas,
      pointerError,
      documentFocused: document.hasFocus(),
      visibility: document.visibilityState,
      droppedSeconds: clock.droppedSeconds,
      drawCalls: view.renderer.info.render.calls,
      triangles: view.renderer.info.render.triangles,
      visuals: view.visuals,
      quality:view.quality?.snapshot(),
    }),
    advance(milliseconds) {
      manual = true;
      if(intro.active)tickIntro(milliseconds/1000);
      else clock.advance(milliseconds / 1000, step => input.read(game.player,game.elapsed+step));
      present();
    },
    step(seconds, controls = {}, renderFrame = true) {
      manual = true;
      if(intro.active){tickIntro(seconds,controls);if(renderFrame)present();return gameSnapshot(game);}
      let first = true;
      clock.advance(seconds, () => {
        const value = {...controls};
        if (!first) Object.assign(value, {
          fire: false, flashlight: false, interact: false, lookDelta: 0,stab:false,stabTimes:[],
        });
        first = false;
        return value;
      });
      if(renderFrame)present();
      return gameSnapshot(game);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      introAudioAttempt++;cancelIntroEntry();intro.dispose();introView?.dispose();audio.stopIntro?.();
      prologueView?.dispose();prologueAudio?.dispose();
      entryAttempt++;
      if (frameId !== null) cancelFrame(frameId);
      input.dispose();
      view.dispose?.();
      for (const remove of listeners) remove();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      audio.pause();
      audio.footsteps?.dispose();
    },
  };
}
