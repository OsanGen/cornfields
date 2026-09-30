import {interactionPrompt} from './game.js';
import {GAME_CONFIG} from './game-config.js';
import {interactionLocked} from './grapple.js';

/** Presentation only: it never advances gameplay, captures the mouse or plays audio. */
export function createUI(document, {debug = false, reducedMotion = false, touch = false} = {}) {
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
  node('debug').hidden = !debug;
  node('motion').checked = reducedMotion;
  document.body.classList.toggle('reduced-motion', reducedMotion);
  if (touch) {
    text('control-summary', 'LEFT THUMB MOVE · RIGHT SIDE LOOK');
    text('device-label', 'PHONE / LANDSCAPE');
    text('controls-help', 'Left stick: move · Drag right side: look · Buttons: fire, light, interact. Grabbed? Repeatedly tap STAB before your health runs out. Hidden? Stay completely still, including your aim.');
    text('light-label', 'LIGHT');
  }

  return {
    node,
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
      node('hide-status').hidden = !player.hidden||locked;
      node('caption').hidden=locked||recovering;
      text('hide-status', 'DO NOT MOVE. IT CAN HEAR YOU.');

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
        }, null, 2));
      }
    },
  };
}
