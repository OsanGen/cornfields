import {samplePrologueWake} from './prologue-performance.js';
import {sampleHallucination} from './prologue-hallucination.js';
import {interactionPrompt} from './game.js';
import {GAME_CONFIG} from './game-config.js';
import {interactionLocked} from './grapple.js';
import {corruptionFrame} from './horror-presentation.js';
import {INTRO} from './intro.js';
import {survivalTime} from './survival-ending.js';
import {checkpointVisionState} from './checkpoint-vision.js';

/** Presentation only: it never advances gameplay, captures the mouse or plays audio. */
export function createUI(document, {debug = false, reducedMotion = false, touch = false, horror = true} = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, document.getElementById(id));
    return nodes.get(id);
  };
  const text = (id, value) => {
    const next = String(value);
    if (node(id).textContent !== next) node(id).textContent = next;
  };
  let readableThreat = '';
  let readableUntil = 0;
  let previousMessageAt = null;
  let previousResult = null;
  let previousSeconds=null,glitchUntil=0;
  let alias='STRANGER';
  let introFontsReady=false;
  const fontDeadline=Date.now()+2000;
  if(document.fonts?.load)Promise.all([document.fonts.load('600 16px "Barlow Condensed"'),document.fonts.load('16px "Rubik Glitch"')]).then(fonts=>{
    introFontsReady=Date.now()<=fontDeadline&&fonts.every(faces=>faces.length>0);
  }).catch(()=>{});
  node('debug').hidden = !debug;
  node('motion').checked = reducedMotion;
  node('intro-motion').checked = reducedMotion;
  document.body.classList.toggle('reduced-motion', reducedMotion);
  if (touch) {
    text('control-summary', 'LEFT THUMB MOVE · RIGHT SIDE LOOK');
    text('device-label', 'PHONE / LANDSCAPE');
    text('controls-help', 'Left stick: move · Drag right side: look · Buttons: fire, light, interact. Walk through a glowing HIDE HERE entrance for cover. Stay still, including your aim. Going deep attracts more creatures. Find Sadie Yates in the corridors. Grabbed? Tap STAB repeatedly.');
    text('light-label', 'LIGHT');
  }

  return {
    node,
    chooseIntroFont(){
      // Fix the font for this run. A late font load must not reflow a credit.
      document.body.classList.toggle('intro-fonts',introFontsReady);
    },
    renderIntro(intro,{enabled,portrait,coreReady,coreError,entering,pointerError,creditsOpen,muted,volume}){
      const phase=intro.phase, active=intro.active, preflight=phase==='preflight', ready=phase==='ready', paused=phase==='paused';
      const frame=intro.frame(reducedMotion);
      document.body.classList.toggle('intro-active',active);
      document.body.classList.toggle('intro-preflight',preflight);
      node('intro-screen').hidden=!active||preflight;
      node('intro-settings').hidden=!active;
      node('preflight-skip').hidden=!preflight;
      node('intro-content-note').hidden=!preflight;
      node('credits').hidden=!creditsOpen;
      node('credits-replay').hidden=active||!enabled;
      node('replay-intro').hidden=!enabled;
      node('intro-continue').hidden=!paused;
      node('intro-enter').hidden=!ready;
      node('intro-enter').disabled=!coreReady||!!coreError||entering||portrait;
      node('intro-skip').hidden=ready;
      node('intro-status').hidden=!paused&&!ready;
      text('intro-status',paused?'INTRO PAUSED':coreError?'The field could not load. Reload to retry.':pointerError||(!coreReady?'PREPARING THE FIELD...':portrait?'TURN YOUR PHONE TO ENTER THE FIELD':entering?'ENTERING THE FIELD...':''));
      text('intro-label',paused?'A MOMENT BETWEEN THE ROWS':frame.label);
      text('intro-name',paused?'Hold your breath.':frame.name);
      text('intro-ghost',paused?'':frame.name);
      node('intro-card').style.opacity=String(paused?1:frame.opacity);
      node('intro-card').className=`intro-card ${frame.shot==='title'&&!paused?'title-card':''}`;
      node('intro-ghost').style.opacity=String(frame.accent*.18);
      node('intro-ghost').style.transform=`translateX(${frame.accent*5}px)`;
      text('intro-mute',muted?'SOUND OFF':'SOUND ON');
      node('intro-mute').setAttribute?.('aria-pressed',String(muted));
      node('intro-volume').value=String(Math.round((volume??.55)*100));
      node('start-btn').disabled=!active&&!coreReady;
      text('start-btn',preflight?'BEGIN':'ENTER THE FIELD ↗');
      if(active){
        node('menu').hidden=!preflight;
        for(const id of ['hud','pause','result','touch-controls','rotate'])node(id).hidden=true;
        document.body.classList.toggle('playing',false);
      }
      text('credits-roles',INTRO.roles);
    },
    renderHandoff(amount=0){const veil=node('opening-reveal');if(!veil)return;veil.hidden=amount<=0;veil.style.opacity=String(Math.max(0,Math.min(1,amount)));},
    renderOpening(intro,{touch:openingTouch=touch,portrait=false,coreReady=false,coreError=null,entering=false,pointerError=''}={}){
      const frame=intro.frame(reducedMotion);
      // The original title-only flow remains owned by renderIntro.
      if(!frame.stage)return;
      const active=intro.active,phase=intro.phase,preflight=phase==='preflight',paused=phase==='paused',ready=phase==='ready';
      const playing=active&&phase==='playing',story=frame.stage==='prologue';
      const lids=node('story-eyelids'),blink=Math.max(samplePrologueWake(frame).blink,sampleHallucination(frame).blink);
      if(lids){lids.hidden=!playing||!story||blink<=0;lids.style.setProperty('--lid',String(blink));}
      document.body.classList.toggle('story-player',true);
      document.body.classList.toggle('opening-active',active);
      document.body.classList.toggle('opening-story',playing&&story);
      document.body.classList.toggle('opening-paused',active&&(paused||ready));
      node('intro-card').hidden=!active||preflight||ready||(!paused&&frame.stage!=='credits');
      node('intro-enter').hidden=true;
      node('intro-continue').hidden=!active||(!paused&&!ready);
      node('intro-continue').disabled=!coreReady||!!coreError||entering||portrait;
      text('intro-continue','CONTINUE');
      node('intro-settings').hidden=!active||(!preflight&&!paused&&!ready);
      node('preflight-skip').hidden=true;
      node('intro-content-note').hidden=true;
      node('opening-note').hidden=!active||!preflight;
      node('start-btn').disabled=!coreReady||!!coreError||entering||portrait;
      if(preflight)text('start-btn','BEGIN STORY');
      const status=coreError?'The field could not load. Reload to retry.':
        portrait?'TURN YOUR PHONE TO LANDSCAPE TO CONTINUE':
        entering?'PREPARING TO CONTINUE...':!coreReady?'PREPARING THE FIELD...':
        pointerError||(paused?'OPENING PAUSED':'');
      node('opening-status').hidden=!active||!preflight||!status;text('opening-status',status);
      node('intro-status').hidden=!active||(!paused&&!ready)||!status;text('intro-status',status);
      node('intro-skip').hidden=!active||preflight||ready;
      node('intro-skip').setAttribute?.('aria-keyshortcuts','K');
      text('intro-skip',openingTouch?'SKIP OPENING':'SKIP OPENING / K');
      node('story-skip').hidden=!active||!story||preflight||ready;
      text('story-skip',openingTouch?'SKIP STORY':'SKIP STORY / J');
      node('opening-pause').hidden=!playing;
      text('opening-pause',openingTouch?'PAUSE':'PAUSE / ESC');
      const liquidPhrase=playing&&story&&frame.chapter==='liquid'&&frame.chapterTime>=1&&frame.chapterTime<4;
      node('liquid-phrase').hidden=!liquidPhrase;
      const showCaption=playing&&story&&frame.chapter!=='liquid'&&!!frame.spoken;
      node('story-caption').hidden=!showCaption;
      text('story-speaker',showCaption?frame.speaker:'');text('story-subtitle',showCaption?frame.spoken:'');
      let tutorial='';
      if(playing&&story){
        if(frame.waitingForExit)tutorial=openingTouch?'TAP EXIT TO LEAVE THE CRUISER':'PRESS E TO EXIT';
        else if(frame.chapter==='car'&&!frame.player.looked)tutorial=openingTouch?'DRAG THE RIGHT SIDE TO LOOK AROUND':'MOVE MOUSE TO LOOK AROUND';
        else if(frame.chapter==='exit')tutorial=openingTouch?'INTERACT: USE / OPEN DOORS':'E: INTERACT / OPEN DOORS';
        else if(frame.chapter==='flashlight'&&!frame.player.flashlightOn)tutorial=openingTouch?'TAP LIGHT TO TURN ON YOUR FLASHLIGHT':'TURN ON YOUR FLASHLIGHT / F';
        else if(frame.followHeld||frame.chapter==='walk'&&frame.chapterTime<5)tutorial='FOLLOW STANLEY AND CLARENCE';
      }
      text('story-tutorial',tutorial);node('story-tutorial').hidden=!tutorial;
      node('touch-controls').hidden=active?!(playing&&story&&openingTouch):node('touch-controls').hidden;
      if(active){
        node('look-zone').hidden=false;
        node('move-stick').hidden=!frame.canMove;node('touch-fire').hidden=true;node('touch-stab').hidden=true;node('touch-pause').hidden=true;
        node('touch-interact').hidden=!frame.waitingForExit;node('touch-light').hidden=!frame.player?.flashlightOn&&!frame.canMove;
        node('touch-light').setAttribute?.('aria-pressed',String(!!frame.player?.flashlightOn));
        text('touch-interact','EXIT');
      }else{node('move-stick').hidden=false;node('touch-pause').hidden=false;}
      const chapterFringe={car:.03,dispatch:.04,emergence:.16,walk:.22,history:.35,disappearance:.45,arrival:.5,rupture:.7};
      const distortion=Number.isFinite(frame.distortion)?frame.distortion:chapterFringe[frame.chapter]||0;
      node('story-caption').style.setProperty('--story-fringe',`${reducedMotion?0:Math.max(0,Math.min(1,distortion))*.8}px`);
      text('credits-replay','REPLAY OPENING');text('replay-intro','REPLAY OPENING');text('title-btn','TITLE');
    },
    renderEnding(line){node('ending-caption').hidden=!line;text('ending-caption',line);},
    setAlias(value){alias=value;},
    setReducedMotion(value) {
      reducedMotion = value;
      document.body.classList.toggle('reduced-motion', value);
    },
    reset() {
      readableThreat = '';
      readableUntil = 0;
      previousMessageAt = null;
      previousResult = null;
      previousSeconds=null;glitchUntil=0;
    },
    focusMode(mode) {
      if (mode === 'paused') node('resume-btn').focus();
      if (mode === 'dead' || mode === 'won' || mode === 'playtest-ended') node('retry-btn').focus();
    },
    showError(message) {
      node('error').hidden = false;
      text('error-copy', message);
    },
    render(game) {
      const {mode, player} = game;
      const playing = mode === 'playing';
      const ended = mode === 'dead' || mode === 'won' || mode === 'playtest-ended';
      const locked=interactionLocked(game),qte=game.interaction?.phase==='qte';
      const recovering=game.interaction?.phase==='recovery';
      document.body.classList.toggle('grappling',locked);
      node('qte-prompt').hidden=!playing||!qte;
      text('qte-copy',touch?'TAP STAB - BREAK FREE':'SPAM SPACE - STAB');
      node('recovery-timer').hidden=!playing||!recovering;
      const seconds=recovering?Math.max(1,Math.ceil(game.interaction.recoveryDeadline-game.elapsed-1e-9)):0;
      text('recovery-number',seconds);
      if(seconds!==previousSeconds){previousSeconds=seconds;if([7,4,2].includes(seconds))glitchUntil=game.elapsed+.10;}
      node('recovery-timer').classList?.toggle('glitch',recovering&&!reducedMotion&&game.elapsed<glitchUntil);
      node('recovery-timer').classList?.toggle('urgent',seconds<=3);
      node('menu').hidden = mode !== 'menu';
      node('hud').hidden = !playing;
      node('touch-controls').hidden = !touch || !playing;
      node('pause').hidden = mode !== 'paused';
      node('result').hidden = !ended;
      document.body.classList.toggle('playing', playing);
      document.body.classList.toggle('dead', mode === 'dead');
      document.body.classList.toggle('hiding', player.hidden && playing);
      for (const id of ['chapter', 'objective', 'caption', 'landmark']) text(id, game[id]);
      text('health', Math.ceil(player.health));
      text('ammo', player.ammo);
      text('flashlight-state', player.flashlightOn ? 'ON' : 'OFF');
      node('health-meter').style.setProperty('--health', player.health + '%');
      const ending=game.survivalEnding,active=ending?.phase==='active';
      node('trial-timer').hidden=!playing||!ending||['arrival','entry','room','exit','fall'].includes(ending.phase);
      text('trial-timer',ending?`${active?'SURVIVE':'COMPLETE'} ${survivalTime(ending)}`:'');

      const prompt = interactionPrompt(game);
      node('prompt').hidden = !prompt || !playing;
      text('prompt-copy', prompt.replace(/^E - /, ''));
      if (touch) {
        node('touch-stab').hidden=!playing||!qte;
        for(const id of ['touch-fire','touch-light','look-zone'])node(id).hidden=locked;
        node('touch-interact').hidden = !prompt || !playing;
        text('touch-interact', prompt.replace(/^E - /, ''));
        node('touch-light').setAttribute?.('aria-pressed', String(player.flashlightOn));
        node('touch-fire').disabled = player.ammo <= 0;
        if(ending&&!['arrival','active'].includes(ending.phase))node('touch-fire').hidden=true;
      }
      text('hide-status', 'DO NOT MOVE. IT CAN HEAR YOU.');
      const corruption=horror?corruptionFrame(game,{reduced:reducedMotion,touch}):{fragments:[],taunt:null};
      for(let i=0;i<4;i++){
        const fragment=corruption.fragments[i],element=node(`die-${i}`);
        element.hidden=!fragment;
        if(fragment){text(`die-${i}`,fragment.text);element.className=`die-fragment slot-${fragment.slot}`;}
      }
      const message = game.threat.activeMessage;
      if (message && game.threat.lastMessageAt !== previousMessageAt) {
        readableThreat = typeof message === 'string' ? message : message.text;
        readableUntil = game.elapsed + GAME_CONFIG.feedback.reducedMotionFadeSeconds;
        previousMessageAt = game.threat.lastMessageAt;
      }
      const visibleMessage = reducedMotion
        ? (game.elapsed < readableUntil ? readableThreat : '')
        : (typeof message === 'string' ? message : message?.text || '');
      text('threat-card', visibleMessage);
      node('threat-card').hidden = !playing || !visibleMessage||locked||recovering;
      const vision=checkpointVisionState(game,reducedMotion);
      if(vision.active)node('threat-card').hidden=true;
      text('caption',vision.active?vision.caption:game.caption);
      node('caption').className=vision.active?'checkpoint-vision':'';
      node('caption').style.setProperty('--checkpoint-red',String(vision.red));
      // One warning owner: the protected checkpoint vision, danger, then caption.
      const quiet=!playing||locked||recovering,threat=!node('threat-card').hidden,caption=vision.active||!!game.caption;
      node('caption').hidden=quiet||threat||!caption;
      node('hide-status').hidden=quiet||threat||caption||!player.hidden;
      const taunt=!quiet&&!threat&&!caption&&!player.hidden&&!prompt&&corruption.taunt;
      node('corn-taunt').hidden=!taunt;
      if(taunt)text('corn-taunt',`${alias}, ${taunt}`);
      node('danger').style.opacity = playing
        ? String(Math.min(0.7, (100 - player.health) / 170 + game.threat.intensity * 0.13))
        : '0';
      if(ending&&ending.phase!=='active'){
        for(const id of ['threat-card','hide-status','corn-taunt','caption',...Array.from({length:4},(_,i)=>`die-${i}`)])node(id).hidden=true;
        node('danger').style.opacity='0';
        if(['entry','room','exit'].includes(ending.phase)){text('chapter','THE PROJECTOR');text('objective','TRIAL ACCESS');text('landmark','');}
      }

      if (ended && previousResult !== mode) {
        const won = mode === 'won';
        text('result-label', won ? 'CORNFIELD / SADIE YATES FOUND' : 'THE FIELD REMEMBERS');
        text('result-title', won ? 'You found Sadie.' : 'You were found.');
        text('result-copy', won
          ? 'Sadie Yates is safe. The search is over.'
          : 'Shots buy time. Hide unseen. Remain completely still.');
        node('retry-btn').innerHTML = won
          ? 'ENTER AGAIN <span>↗</span>' : 'TRY AGAIN <span>↗</span>';
        text('result-time', Math.floor(game.elapsed / 60) + ':' +
          String(Math.floor(game.elapsed % 60)).padStart(2, '0') +
          ' IN THE FIELD · ' + game.metrics.shotsFired + ' SHOTS');
        if(mode==='playtest-ended'){
          text('result-label','CORNFIELD / DEEPER ACCESS');text('result-title','END OF CURRENT PLAYTEST');
          text('result-copy','The passage continues below.');node('retry-btn').innerHTML='PLAY AGAIN <span>↗</span>';
        }
        previousResult = mode;
      }
      if (debug) {
        text('debug', JSON.stringify({
          state: game.enemy.state,
          target: game.enemy.target,
          reason: game.enemy.reason,
          memory: game.enemy.memory,
          tier: game.progress.escalationTier,
          hidden: player.hidden,
          metrics: game.metrics,
          perception:game.enemy.perception,
          pacing:game.threat.pacing,
          zone:player.zone,
          fieldDepth:player.zone==='field'?Math.hypot(player.x,player.z):0,
          worldRevision:game.maze.cornWorld?.revision,
        }, null, 2));
      }
    },
  };
}
