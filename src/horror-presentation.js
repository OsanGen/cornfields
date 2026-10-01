const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};

/** Derived visual state. Never advances health, outcomes, AI, or world time. */
export function strugglePose(q,time,reduced=false){
  const age=Math.max(0,time-(q?.phaseStartedAt||0));
  const active=q&&['tackle','qte','stab'].includes(q.phase);
  let progress=clamp((q?.presses||0)/(q?.targetPresses||1))*.82;
  let contact=false,recoil=0,impact=0;
  if(q?.phase==='stab'){
    const t=clamp(age/Math.max(.001,q.until-q.phaseStartedAt));
    progress=t<.48?.82+.18*ease(t/.48):1;
    contact=t>=.48&&t<.65;recoil=t>.65?ease((t-.65)/.35):0;
    impact=t>=.48&&t<.74?Math.sin((t-.48)/.26*Math.PI):0;
    progress-=recoil*.40;
  }
  const strength=active&&q.phase==='qte'?(reduced?.14:1)*(1-progress*.7):0;
  return {active:!!active,progress,contact,recoil,impact:reduced?0:impact,
    tremorX:strength*(Math.sin(time*47)*.0016+Math.sin(time*13)*.001),
    tremorY:strength*Math.sin(time*39+.7)*.0018,
    roll:strength*Math.sin(time*31)*.018};
}

export function nightmareState(game,reduced=false){
  const q=game.interaction,time=game.elapsed;
  const phase=q?.phase,age=Math.max(0,time-(q?.phaseStartedAt||0));
  let amount=phase==='tackle'?ease(age/.25):['qte','stab'].includes(phase)?1:phase==='throw'?1-ease(age/.22):0;
  if(!['playing','paused'].includes(game.mode))amount=0;
  const recovery=game.skyRedUntil>time?clamp(Math.min((time-game.skyRedStartedAt)/.2,(game.skyRedUntil-time)/.2)):0;
  return {amount,sky:Math.max(amount,recovery),rain:amount>0&&!reduced?96:0,
    fragments:game.mode==='playing'&&phase==='qte',recovery,owner:amount>0?q.id:null};
}

export function normalizeAlias(value){
  const clean=String(value||'').normalize('NFC').replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu,'').trim();
  const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(clean)].map(p=>p.segment):Array.from(clean);
  return parts.slice(0,24).join('')||'STRANGER';
}

const fragments=['DIE','ERR // DIE','> DIE','DIE_ DIE_'];
const taunts=['I CAN SEE YOU','WHY ARE YOU STILL HERE?','YOU SHOULD NOT BE HERE'];
/** Stateless active-time schedule, no callbacks or event backlog. Alias stays in UI. */
export function corruptionFrame(game,{reduced=false,touch=false}={}){
  const n=nightmareState(game,reduced),q=game.interaction;
  const result={fragments:[],taunt:null};
  if(n.fragments){
    const age=game.elapsed-q.readyAt,burst=Math.floor(age/.85),within=age% .85;
    if(within<.65){
      const count=reduced?1:touch?2:4;
      for(let i=0;i<count;i++)result.fragments.push({text:fragments[(burst+i)%4],slot:(burst*3+i*2)%8});
    }
  }else if(game.mode==='playing'&&game.player.cornZoneId&&!q&&!n.recovery&&!game.threat.activeMessage&&game.elapsed-game.player.cornEnteredAt>3){
    const age=game.elapsed-game.player.cornEnteredAt;
    if(age%12>3&&age%12<5)result.taunt=taunts[Math.floor(game.elapsed/12)%taunts.length];
  }
  return result;
}
