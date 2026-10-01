import {interactionPrompt} from './game.js';
import {GAME_CONFIG} from './game-config.js';
import {interactionLocked} from './grapple.js';
import {corruptionFrame} from './horror-presentation.js';
import {INTRO} from './intro.js';

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
    text('control-summary', 'LEFT THUMB MOVE / EDGE SPRINT · RIGHT SIDE LOOK');
    text('device-label', 'PHONE / LANDSCAPE');
    text('controls-help', 'Left stick: move; push to the edge to sprint · Drag right side: look · Buttons: fire, light, interact. Walk through a glowing HIDE HERE entrance for cover. Stay still, including your aim. Going deep attracts more creatures. Find your daughter in the corridors. Grabbed? Tap STAB repeatedly.');
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
      if (mode === 'dead' || mode === 'won') node('retry-btn').focus();
    },
    showError(message) {
      node('error').hidden = false;
      text('error-copy', message);
    },
    render(game) {
      const {mode, player} = game;
      const playing = mode === 'playing';
      const ended = mode === 'dead' || mode === 'won';
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
      // One warning owner: danger, caption, hiding instruction, then atmosphere.
      const quiet=!playing||locked||recovering,threat=!node('threat-card').hidden;
      node('caption').hidden=quiet||threat||!game.caption;
      node('hide-status').hidden=quiet||threat||!!game.caption||!player.hidden;
      const taunt=!quiet&&!threat&&!game.caption&&!player.hidden&&!prompt&&corruption.taunt;
      node('corn-taunt').hidden=!taunt;
      if(taunt)text('corn-taunt',`${alias}, ${taunt}`);
      node('danger').style.opacity = playing
        ? String(Math.min(0.7, (100 - player.health) / 170 + game.threat.intensity * 0.13))
        : '0';

      if (ended && previousResult !== mode) {
        const won = mode === 'won';
        text('result-label', won ? 'CORNFIELD / DAUGHTER FOUND' : 'THE FIELD REMEMBERS');
        text('result-title', won ? 'You found her.' : 'You were found.');
        text('result-copy', won
          ? 'She is here. The search is over.'
          : 'Shots buy time. Hide unseen. Remain completely still.');
        node('retry-btn').innerHTML = won
          ? 'ENTER AGAIN <span>↗</span>' : 'TRY AGAIN <span>↗</span>';
        text('result-time', Math.floor(game.elapsed / 60) + ':' +
          String(Math.floor(game.elapsed % 60)).padStart(2, '0') +
          ' IN THE FIELD · ' + game.metrics.shotsFired + ' SHOTS');
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
