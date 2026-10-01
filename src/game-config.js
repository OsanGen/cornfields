export const GAME_CONFIG = {
  cornSurvival:{seconds:180,distance:120},
  grapple:{targetPresses:8,inputReadyGrace:.2,fullHealthSeconds:3,tackleSeconds:.3,
    stabSeconds:.2,throwSeconds:.5,recoverySeconds:10,redSkySeconds:3,retackleGrace:1},
  player: {
    moveSpeed: 3.8,
    maxHealth: 100,
    startAmmo: 2,
    checkpointAmmo: 2,
    maxAmmo: 6,
    shotCooldown: .45,
    eyeHeight: 1.58,
  },
  gun: {
    maxRange: 18,
    hitRadius: .42,
    targetHeight: 1.25,
    targetHalfHeight: .7,
    muzzleFlashSeconds: .09,
  },
  zombie: {
    attackRange: .82,
    stalkSpeed: 2.15,
    investigateSpeed: 2.65,
    chaseSpeedByTier: [3.6, 3.85, 4.05],
    rageSpeedByTier: [4.1, 4.25, 4.4],
    cornRushSpeedByTier: [4.3, 4.6, 4.9],
    staggerSecondsByTier: [3, 2.5, 2],
    flashlightRecoilSeconds: .65,
    flashlightConfirmSeconds: .22,
    flashlightRange: 13,
    flashlightCone: .3,
    rageEscapeDistance: 14,
    rageEscapeHoldSeconds: 2,
    visionDistance: 15,
    visionHalfAngle: 1.05,
    chaseHalfAngle: 2.3,
    lostSightSeconds: 1.4,
    memorySeconds: 16,
    repathSeconds: .55,
    decisionSeconds: .25,
    maxCandidates: 24,
  },
  hiding: {
    mouseMovementThresholdPixels: 1,
    entryRadius: 1.6,
    pocketDepth: 1.65,
    exitHearingRadius: 9,
  },
  progress: {
    checkpointGraceSeconds: 1.5,
    checkpointRadius: 2.1,
    daughterRadius: 1.5,
  },
  feedback: {
    messageMinimumGapSeconds: 4.5,
    normalFlashSeconds: .2,
    reducedMotionFadeSeconds: .6,
  },
  hearing: {
    footstepRadius: 9,
    footstepInterval: .48,
    doorRadius: 20,
    gunshotRadius: 60,
    rustleRadius: 12,
    flashlightRadius: 3,
  },
};

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Presentation events are drained by the runtime after each authoritative tick. */
export function emitEvent(game, type, text = '', position = null, extra = {}) {
  game.events.push({ type, text, position,...extra,runId:game.runId,id:++game.eventId,at:game.elapsed });
  if (game.events.length > 128) game.events.splice(0, game.events.length - 128);
  if (text) {
    game.caption = text;
    game.captionTime = 4.6;
  }
}

/**
 * @typedef {object} Evidence
 * @property {number} id Monotonically increasing within one run.
 * @property {string} type Sensor category; leave is not proof of current hiding.
 * @property {{x:number,z:number}} position Position when the event happened.
 * @property {number} at Simulation time, never wall-clock time.
 * @property {number} radius Maximum hearing distance.
 * @property {number} priority Higher value wins simultaneous sound arbitration.
 * @property {string} [anchorId] Known anchor associated with entry, rustle, shot or exit.
 */

/** Queue one factual sensor event. The AI consumes the queue once per tick. */
export function addEvidence(game, type, position, radius, priority, extra = {}) {
  game.evidence.push({
    id: ++game.evidenceId,
    type,
    position: { x: position.x, z: position.z },
    at: game.elapsed,
    radius,
    priority,
    ...(game.player.zone?{zone:game.player.zone}:{}),
    ...extra,
  });
  if (game.evidence.length > 32) game.evidence.shift();
}
