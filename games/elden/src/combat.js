// Shared contacts drive simulation and sword poses. Timings approximate the
// selected pre-patch recording; they are not numerical timings from the wiki.
// Selected recording 45.5–46.0 s: the planted overhead leaves ~14% HP.
// 585/680 reproduces this visible loss for this build, not a universal raw stat.
// Applied to the matching overhead in the two variants of the six-hit chain.
// Blade-local positions. Main 102-107 s: the slim traces after a cut precede
// the bright pillars around the two-blade landing. Hidden rows and distances
// are reconstructed; use one footprint for the light and its playable volume.
export function holyFootprints(style,hand=0){
 const points=[],put=(x,z,delay,width)=>points.push({x,z,delay,width});
 const side=hand<0?-1:1;
 if(style==='sweep'||style==='spin'){
  const n=style==='spin'?9:6,arc=style==='spin'?3.55:2.2;
  for(let i=0;i<n;i++){const f=i/(n-1),a=side*arc*(f-.5),r=3.1+.55*Math.sin(f*Math.PI);
   put(Math.sin(a)*r,-Math.cos(a)*r,.28+i*.045,.70+(i%3)*.13);}
 }else if(['down','thrust','up'].includes(style)){
  for(let i=0;i<7;i++)put(side*(style==='thrust'?.06:.38)*Math.sin(i*.82),-1.6-i*.96,.26+i*.045,(i%3===1?1.13:.77));
 }else if(style==='cross'){
  for(let i=0;i<5;i++)for(const arm of [-1,1]){
   if(i===2&&arm===1)continue;
   put(arm*(i-2)*1.08,-1.3-i*.86,.28+i*.042,.92);}
 }else if(style==='stomp'||style==='quake'){
  const rows=style==='quake'?[2.05,4.35,7.2]:[2.7,4.9];
  rows.forEach((r,k)=>{const n=style==='quake'?6+k*2:5+k*2;
   for(let i=0;i<n;i++){const a=i*2*Math.PI/n+k*.48,rr=r*(1+.06*Math.sin(i*2.7));
    put(Math.sin(a)*rr,-Math.cos(a)*rr,.17+k*.115+(i%3)*.016,k===0?1.55:1.05+(i%4)*.1);}
  }); 
 }
 return points;
}
export const CONTACT_DAMAGE={sweep:185,down:230,cross:185,spin:185,thrust:185,up:185,stomp:210,quake:210,flame:210};
// Bloodflame buildup/duration are development estimates; the wiki confirms the
// delayed fire and bleed rule but supplies no numerical damage for this build.
export const BLOODFLAME={duration:2,buildup:110,threshold:100,decay:5,procFraction:.15};
// Selected HUD identifies a +12 Crimson Flask. wiki.gg lists 810 HP restored;
// capped by max HP, applied only after the ordinary drinking animation.
export const CRIMSON_FLASK_HEAL=810;
// Selected source 110-114 s: a stomp precedes the glowing-hand leap.
// This continuation has a longer tell than the phase-two opening grab.
export const STOMP_GRAB_SEQUENCE={takeoff:2.7,land:3.45,contact:3.5,release:6.1,duration:6.9,missDuration:3.8};
export const MOVES = {
 double:{duration:3.5,contacts:[{t:1.25,hand:1,style:'down'},{t:1.92,hand:-1,style:'sweep'}]},
 cross:{duration:3.4,contacts:[{t:1.43,hand:-1,style:'sweep'},{t:1.75,hand:1,style:'sweep'},{t:2.38,hand:0,style:'cross'}]},
 slam:{duration:3.5,contacts:[{t:1.65,hand:0,style:'down'}]},
 // Dense selected frames: downstroke at 28.625–28.875 s; the following
 // parried overhead releases at 32.875–33.0 s. Shared poses use these contacts.
 sweepDown:{duration:6.8,contacts:[{t:.8,hand:1,style:'sweep'},{t:2.0,hand:1,style:'down',damage:585},{t:2.95,hand:-1,style:'sweep'},{t:3.33,hand:1,style:'sweep'},{t:4.5,hand:0,style:'down'},{t:5.2,hand:0,style:'quake',area:true}]},
 // Selected phase-two 81.5-83.5 s: the raised sword pauses before descent.
 // Keep this timing variant separate; the phase-one overhead is unchanged.
 holySweepDown:{duration:7,contacts:[{t:.8,hand:1,style:'sweep'},{t:2.45,hand:1,style:'down',damage:585},{t:3.15,hand:-1,style:'sweep'},{t:3.53,hand:1,style:'sweep'},{t:4.7,hand:0,style:'down'},{t:5.4,hand:0,style:'quake',area:true}]},
 // Selected 85-89 s: stomp, retreat with raised blades, then forward cut.
 // The retreat is preparation, not an extra damaging sweep. Later uncancelled
 // followups remain estimates because the selected player parries the cut.
 stompSweep:{duration:6.7,contacts:[{t:1.1,hand:0,style:'stomp',area:true},{t:3.65,hand:1,style:'down',damage:585},{t:4.4,hand:-1,style:'sweep'},{t:5,hand:0,style:'down'},{t:5.7,hand:0,style:'quake',area:true}]},
 stompGrab:{duration:STOMP_GRAB_SEQUENCE.duration,contacts:[{t:1.05,hand:0,style:'stomp',area:true}]},
 // The separate stomp preparation is longer than the turning sword chain.
 long:{duration:7.6,contacts:[{t:1.1,hand:0,style:'stomp',area:true},{t:2.95,hand:1,style:'down',damage:585},{t:3.95,hand:-1,style:'sweep'},{t:5,hand:1,style:'sweep'},{t:6.35,hand:0,style:'down',jump:true},{t:6.55,hand:0,style:'quake',area:true}]},
 swing:{duration:5.65,contacts:[{t:1.05,hand:1,style:'sweep'},{t:1.62,hand:-1,style:'sweep'},{t:2.28,hand:1,style:'spin'},{t:2.62,hand:-1,style:'sweep'},{t:3.65,hand:0,style:'cross'},{t:4.4,hand:-1,style:'thrust'}]},
 uppercut:{duration:4.2,contacts:[{t:1.15,hand:0,style:'up',launch:true},{t:2.8,hand:0,style:'down',airCatch:true}]},
 // The source's later two-sword rise/downstroke has a longer initial tell.
 risingSlash:{duration:3.1,contacts:[{t:1.65,hand:0,style:'up',launch:true},{t:2.95,hand:0,style:'down',airCatch:true}]},
 somersault:{duration:3.8,contacts:[{t:1.75,hand:0,style:'down'}]},
 // Ye Tarnished 89:38–89:40: thrust, horizontal cut, lingering rift, blast.
 bloodflame:{duration:3.9,contacts:[{t:1.15,hand:1,style:'thrust'},{t:1.95,hand:-1,style:'sweep'},{t:2.95,hand:0,style:'flame',area:true}]},
 ring:{duration:4.4,contacts:[{t:1.1,hand:0,style:'cross',minRange:2.5}]},
 // Clear source 95.4: physical heel strike. The blades light during the
 // following overhead hold, before the first turning cut at 97.7–98.1.
 promised:{duration:8.25,contacts:[{t:.89,hand:0,style:'stomp',area:true},{t:3.30,hand:-1,style:'sweep'},{t:3.9,hand:1,style:'sweep'},{t:5.15,hand:1,style:'down'},{t:5.95,hand:-1,style:'sweep'},{t:7.3,hand:0,style:'down',jump:true},{t:7.6,hand:0,style:'quake',area:true}]}
};
// Shared light-strike contacts also animate the real rig and its phantoms.
export const LIGHT_CONTACTS={sideDash:[2.6,3.1,3.6,4.8],lightspeed:[.5,.7,.9,2.1],rockFollowup:[.30,.67,1.07,1.42,2.9],dash:[.85,1.12,1.4,1.8]};
export const BOSS_SWINGS=Object.fromEntries(Object.entries(MOVES).map(([name,m])=>[name,m.contacts.map(c=>c.t)]));
export const PHASE_THRESHOLD=.65, METEOR_THRESHOLD=.25, METEOR_COOLDOWN=180, GRAB_COOLDOWN=24;
export function entersSecondPhase(hp,max){return hp>0&&hp<=max*PHASE_THRESHOLD;}
export function meteorEligible(phase,hp,max,time,last=-Infinity){return phase===2&&hp>0&&hp<=max*METEOR_THRESHOLD&&time-last>=METEOR_COOLDOWN;}
export function grabResult(marked,contact,escaped=false){return !contact||escaped?'miss':marked?'death':'mark';}
export const SPRINT_HOLD=.32;
export function faces(source,yaw,target,halfAngle,radius=0){const dx=target.x-source.x,dz=target.z-source.z,d=Math.hypot(dx,dz);if(d<.001)return true;const allowance=Math.asin(Math.min(1,radius/d));return (-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/d>=Math.cos(Math.min(Math.PI,halfAngle+allowance));}

// Estimated from selected source frames 12-20 s: ground rip, rise, retreat,
// suspended volley, then landing. These are reference estimates, not wiki timings.
// phaseTwoSweep: pose and blade-trail clock of the airborne sword circle in phase two. The source disc of blade
// light is already open at encounter 138.68 and widest near 138.81 (cast start 133.74), about 0.19 s before the
// first cast's sweep shifted by phaseTwoLead. It moves no stone, contact or root position: those keep phaseTwoLead.
export const ROCK_SEQUENCE={strike:2.05,rise:2.05,risen:2.75,retreatEnd:3.65,dragStart:2.16,liftOff:2.97,hover:3.85,throw:6,phaseTwoLead:.6,phaseTwoSweep:.79,gap:.075,descend:6.1,duration:7.75,followupDuration:7.5};

// Shared by the skeletal wrist solve and the final fit of the curved tip.
export function rockBladePlant(t,side,height,phase=1){
 const smooth=(x,a,b)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
 const lag=side==='Left'?.045:0;
 if(phase===2)return smooth(t,1.26+lag,1.43+lag)*(1-smooth(t,2.01+lag,2.14+lag))*(1-smooth(height,.10,.80));
 // The lead edge peels out first. The rear tip still traces the furrow as
 // the hips rise, then releases as its hand runs out of reach.
 const release=ROCK_SEQUENCE.liftOff+(side==='Left'?.085:-.035);
 return smooth(t,2.00+lag,2.12+lag)*(1-smooth(t,release,release+(side==='Left'?.16:.13)))
   *(1-smooth(height,side==='Left'?.20:.11,side==='Left'?.98:.78));
}

// Source-guided opening recovery; all other rushes share the same release.
export const RUSH_SEQUENCE={windup:2.3,contact:2.75,duration:3.5,openingWindup:2.02,openingContact:2.99,openingDuration:4.1};

// The selected clip shows a planted tell, high leap and catch only on landing.
export const GRAB_SEQUENCE={takeoff:1.35,land:2.15,contact:2.2,release:4.8,duration:5.6,missDuration:3.25};

// Selected 123.5–131.5 s: planted sword charge, upward departure,
// disappearance, then the meteor return. These timings are source estimates.
export const METEOR_SEQUENCE={plant:1.65,takeoff:2.25,risen:3.05,tracking:3.45,targetLock:4.25,return:6.8,contact:7.15,duration:9.4};

// Selected HUD at 138.1/139.1/140.1 s: 198/180/162 green pixels
// from a 222-pixel full bar. Normalized to this 100-point stamina scale.
export const SPRINT_DRAIN_PER_SECOND=8.1;

// Selected August 2024 source uses the pre-1.14 airborne-target interruption.
// Community footage confirms the behaviour, not its original implementation.
// The tracking window and height threshold are reconstruction estimates.
export function meteorAirTarget(height){return height>.35;}

// Selected 76–78 s: the body remains airborne after the phantom strikes.
// The post-rock variant has four phantoms (selected 141–145 s / wiki moveset).
// Timings below remain reference-guided reconstruction estimates.
export const ROCK_RETURN={lead:.21,depart:1.50,arrive:1.68,land:1.83,plant:2.18,lastFade:.17,strokeLife:[.36,.39,.345,.38]};
export function lightContacts(action,rockFollowup=false){return action==='lightspeed'&&rockFollowup?LIGHT_CONTACTS.rockFollowup:LIGHT_CONTACTS[action];}

// Primary ripostes 35.75/37.75, 91.25/93.25, 119/121 s: two contacts.
// Relative to the existing critical animation entry; raw damage totals remain estimates.
export const RIPOSTE_SEQUENCE={entry:.60,release:2.60,duration:3,entryShare:.2525};

// Primary 33.0-33.6 s (third parry): the broken guard carries him back several strides, upright with both
// blades thrown up, before he folds forward. Root travel and the leg cycle of the reel share this curve.
export const PARRY_REEL={distance:3.3,time:.60};
export function parryReel(t){const u=Math.max(0,Math.min(1,t/PARRY_REEL.time));return PARRY_REEL.distance*(1-Math.pow(1-u,1.8));}
// The bowed head and chest of a broken stance reach this far toward the attacker (metres ahead of the root).
export function staggerBow(t){const u=Math.max(0,Math.min(1,(t-.56)/.36));return 1.9*u*u*(3-2*u);}
// Primary 38.0-38.9 s: the freed blade throws him up and back before he gathers a low crossed guard.
export const CRITICAL_RETREAT=1.15;

// Primary running R1 after 39.64/95.05/122.87 s inputs: longer draw than standing R1.
// Contact is bounded by the 40.00/40.25 s frames, rather than a hidden game-data claim.
export const RUNNING_THRUST={contact:.48,duration:1.05};

// Eight individually visible stones in primary 16.0/16.5 and 140 seconds.
// Clockwise, intentionally uneven placement measured from the suspended ring.
export const ROCK_FORMATION = [
 [-4.80,8.15,-.28], [-7.20,3.70,-.15], [-4.70,-.95,.16], [-.12,-2.20,.05],
 [4.90,.45,.14], [7.05,4.05,-.12], [4.30,6.70,-.25], [.28,9.75,-.36]
];
export const ROCK_COUNT=ROCK_FORMATION.length;

// Primary contact sequences include a leading step and a trailing catch-up.
// These distances are reconstructed world-space estimates, not engine data.
// The same motion drives collision roots and planted-foot compensation.
export function meleeLocomotion(action,t){
 const move=MOVES[action],root=[0,0],feet=[[.52,-.20,0],[-.52,.22,0]];
 if(!move||action==='somersault'||action==='ring')return {root,feet};
 const smooth=(a,b)=>{const f=Math.max(0,Math.min(1,(t-a)/(b-a)));return f*f*(3-2*f);};
 let previous=0;
 for(const c of move.contacts){
  if(c.area||c.jump){previous=c.t;continue;}
  if(action==='stompSweep'&&c.t===3.65){previous=c.t;continue;}
  const span=Math.min(.70,Math.max(.20,(c.t-previous)*.75));
  const lead=c.hand===-1?1:0,sign=lead? -1:1;
  const stride=c.style==='thrust'?.82:c.style==='down'?.54:c.style==='up'?.36:c.style==='cross'?.32:.44;
  const side=c.style==='cross'||!c.hand?0:sign*(c.style==='down'?.13:.22);
  const progress=smooth(c.t-span*.80,c.t+.08);
  root[0]+=side*progress;root[1]-=stride*progress;
  for(let i=0;i<2;i++){
   const phase=i===lead?smooth(c.t-span,c.t+.025):smooth(c.t-.06,c.t+.44);
   feet[i][0]+=side*phase;feet[i][1]-=stride*phase;
   feet[i][2]=Math.max(feet[i][2],Math.sin(Math.PI*phase)*(i===lead?.23:.17));
  }
  previous=c.t;
 }
 for(const foot of feet){foot[0]-=root[0];foot[1]-=root[1];}
 return {root,feet};
}
