// Procedural whole-body motion for the player duelist.
//
// The imported clips only supplied a short shuffle, a retimed dive and an idle-based thrust. This module
// owns the complete skeleton pose for locomotion, turning, starts and stops, jump, dodge roll and the
// Sword Lance attack chain. Every frame is built from one relaxed rest pose:
//
//   pose parameters (pelvis, spine, head, hands, blades)  ->  blended between actions
//   foot controller (world ground marks, gait placement, authored steps, terrain height, leg reach)
//   two-bone IK for both legs and both arms, blade-aligned wrists
//
// Coordinates are actor-root local: x right, y up from the ground under the actor, f forward.
// Nothing here reads the replay clock or the recording; inputs are the action states the game logic exposes.
import * as T from "game/lib/three.module.js";
import {solveBossLimb} from "game/src/boss-reconstruction.js";
import {RUNNING_THRUST} from "game/src/combat.js";

const {clamp,lerp,smoothstep:ss}=T.MathUtils;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const TAU=Math.PI*2,HIP=1.013,XA=V(1,0,0),YA=V(0,1,0),ZA=V(0,0,1);
const ease=u=>u*u*(3-2*u);
const frac=x=>x-Math.floor(x);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const FIELDS=['hip','rot','chest','head','hR','hL','eR','eL','bR','bL','kR','kL'];
const HOME={Right:[.12,0,-.08],Left:[-.11,0,.08]},HOME_YAW={Right:-.24,Left:.10};
const CHAIN_LINK={hip:[.01,-.06,.04],rot:[-.16,.06,0],chest:[-.26,.08,0],head:[.34,0],hR:[.37,1.02,-.02],bR:[.16,-.06,1],hL:[-.33,1.02,.01],bL:[-.35,-.35,-.84]};
const GRIP_SPACING=.14;

function blank(){
 return {hip:[0,-.022,0],rot:[-.07,.03,0],chest:[-.10,.03,0],head:[.14,0],
  hR:[.345,.925,.10],hL:[-.335,.93,.0],eR:[.50,-.30,-.75],eL:[-.50,-.30,-.75],
  bR:[.36,-.32,1],bL:[-.18,-.80,-.52],kR:[.16,1],kL:[-.14,1],spin:0,pivot:.95};
}
function copyPose(q){const o={spin:q.spin,pivot:q.pivot};for(const k of FIELDS)o[k]=q[k].slice();return o;}
function bladeBetween(from,to,t){
 const a=V(...from).normalize(),b=V(...to).normalize();
 const arc=new T.Quaternion().setFromUnitVectors(a,b);
 return a.applyQuaternion(new T.Quaternion().slerp(arc,t)).toArray();
}
function mixPose(a,b,w){
 const o={spin:lerp(a.spin,b.spin,w),pivot:lerp(a.pivot,b.pivot,w)};
 for(const k of FIELDS)o[k]=k==='bL'?bladeBetween(a[k],b[k],w):a[k].map((v,i)=>lerp(v,b[k][i],w));
 return o;
}
// Preserve the held tip on contact, but carry velocity through the intermediate
// wrist and torso marks on the way in and out. Slopes reverse only at a key.
function prepareAttackKeys(keys,base){
 // Keyframes for the sword hand, free hand and torso are independent.
 // A change to the wrist alone must not pull the head or elbow back to idle.
 const tracks={};
 for(const field of FIELDS){
  const track=[];
  for(let i=0;i<keys.length;i++){
   const [time,pose]=keys[i];
   if(i===0||i===keys.length-1||pose[field])track.push({time,value:pose[field]||base[field]});
  }
  for(let i=0;i<track.length;i++){
   const key=track[i],prev=track[i-1],next=track[i+1];
   key.slope=key.value.map((v,j)=>{
    if(!prev||!next)return 0;
    const a=(v-prev.value[j])/(key.time-prev.time);
    const b=(next.value[j]-v)/(next.time-key.time);
    return a*b>0?2*a*b/(a+b):0;
   });
  }
  tracks[field]=track;
 }
 return {tracks,spin:base.spin,pivot:base.pivot};
}
function sampleAttack({tracks,spin,pivot},time){
 const pose={spin,pivot};
 for(const field of FIELDS){
  const track=tracks[field];
  let i=0;while(i<track.length-2&&time>track[i+1].time)i++;
  const a=track[i],b=track[i+1],dt=b.time-a.time;
  const u=clamp((time-a.time)/dt,0,1),blend=ease(u);
  if(field==='bL'){pose[field]=bladeBetween(a.value,b.value,blend);continue;}
  const lead=u*(1-u)*(1-u)*dt,trail=-u*u*(1-u)*dt;
  pose[field]=a.value.map((v,j)=>lerp(v,b.value[j],blend)+lead*a.slope[j]+trail*b.slope[j]);
 }
 return pose;
}

// Bone poses are snapshots. Callers supply storage only after every reader of
// the previous pose has released it (notably parry recovery and crossfades).
export function copyBonePose(actor,reusable){
 const pose=reusable||Object.create(null);
 if(actor.poseBoneMap!==actor.bones){
  actor.poseBoneMap=actor.bones;
  actor.poseBoneEntries=Object.entries(actor.bones);
 }
 for(const [name,bone] of actor.poseBoneEntries){
  if(pose[name])pose[name].copy(bone.quaternion);
  else pose[name]=bone.quaternion.clone();
 }
 return pose;
}

export class PlayerMotion{
 constructor(actor){
  this.actor=actor;this.ready=false;this.phase=0;this.speed=0;this.dir=[0,1];this.vel=V();this.last=V();this.hasLast=false;
  this.mode='idle';this.modeKey='';this.from=null;this.blend=1;this.blendTime=.14;this.pose=blank();
  this.feet={Right:{w:V(),h:0,pitch:0,yaw:0,step:null,set:false,air:0},Left:{w:V(),h:0,pitch:0,yaw:0,step:null,set:false,air:0}};
  this.footBlend=1;this.plan={};this.owned=false;this.wasOwned=false;this.legacy=null;this.legacyBlend=1;this.land=9;this.turn=0;this.lastYaw=0;this.stepCooldown=0;
  this.accelLean=0;this.lastSpeed=0;this.cache={};
  this.gripWeight=0;
  this.gripSide='Right';this.rollAxis=V(1,0,0);
 }
 bone(suffix){return this.cache[suffix]??=Object.values(this.actor.bones).find(b=>b.name.endsWith(suffix));}
 init(){
  const a=this.actor;if(!a.thrustBasePose||!a.weapons?.length)return false;
  // Sole orientations measured on the relaxed pose with the actor at the origin.
  const saved=a.thrustBasePose.map(b=>({bone:b.bone,q:b.bone.quaternion.clone(),p:b.bone.position.clone()}));
  const rp=a.root.position.clone(),rq=a.root.quaternion.clone(),vp=a.visual.position.clone(),vq=a.visual.quaternion.clone();
  for(const b of a.thrustBasePose){b.bone.quaternion.copy(b.q);b.bone.position.copy(b.p);}
  a.root.position.set(0,0,0);a.root.quaternion.identity();a.visual.position.set(0,0,0);a.visual.quaternion.identity();a.root.updateMatrixWorld(true);
  this.footRest={};this.toeSpan={};this.armReach={};const along={},height={};
  for(const side of ['Right','Left']){
   const shoulder=this.bone(side+'Arm').getWorldPosition(V());
   const elbow=this.bone(side+'ForeArm').getWorldPosition(V());
   const wrist=this.bone(side+'Hand').getWorldPosition(V());
   this.armReach[side]=.96*(shoulder.distanceTo(elbow)+elbow.distanceTo(wrist));
   const foot=this.bone(side+'Foot'),toe=this.bone(side+'ToeBase');
   this.footRest[side]=foot.getWorldQuaternion(new T.Quaternion());
   const p=foot.getWorldPosition(V());height[side]=p.y;const toeOffset=toe.getWorldPosition(V()).sub(p);
   this.toeSpan[side]=Math.hypot(toeOffset.x,toeOffset.z);along[side]=toeOffset.normalize();
  }
  // The relaxed clip rests the right heel off the ground. Level it to the left sole's pitch and point both
  // feet along their own rest heading so a planted sole lies flat.
  const flat=along.Left.clone();flat.x=-flat.x;
  const yawR=Math.atan2(-along.Right.x,-along.Right.z),yawL=Math.atan2(-along.Left.x,-along.Left.z);
  const span=Math.hypot(flat.x,flat.z);
  const levelR=V(-Math.sin(yawR)*span,flat.y,-Math.cos(yawR)*span).normalize();
  this.footRest.Right.premultiply(new T.Quaternion().setFromUnitVectors(along.Right,levelR));
  // Remove the rest heading so foot yaw is authored explicitly.
  this.footRest.Right.premultiply(new T.Quaternion().setFromAxisAngle(YA,-yawR));
  this.footRest.Left.premultiply(new T.Quaternion().setFromAxisAngle(YA,-yawL));
  this.ankleHeight=Math.min(height.Right,height.Left);
  const up=this.bone('RightUpLeg').getWorldPosition(V()),kn=this.bone('RightLeg').getWorldPosition(V()),an=this.bone('RightFoot').getWorldPosition(V());
  this.legLength=up.distanceTo(kn)+kn.distanceTo(an);
  a.root.position.copy(rp);a.root.quaternion.copy(rq);a.visual.position.copy(vp);a.visual.quaternion.copy(vq);
  for(const s of saved){s.bone.quaternion.copy(s.q);s.bone.position.copy(s.p);}
  a.root.updateMatrixWorld(true);
  this.ready=true;return true;
 }

 // ---- frames ---------------------------------------------------------------------------------------------
 W(x,y,f){return this.actor.root.localToWorld(V(x,y+this.g,-f));}
 localOf(side){const f=this.feet[side],l=this.actor.root.worldToLocal(f.w.clone());return [l.x,f.h,-l.z];}
 // A point authored on the upright rest body, carried by the pose's pelvis offset, lean and tumble.
 // part 1 = shoulders/arms (pelvis and spine rotation), 0 = pelvis only.
 torso(q,p,part=1){
  const pitch=q.rot[1]+q.chest[1]*.75*part,yaw=q.rot[0]+q.chest[0]*.7*part,roll=q.rot[2]+q.chest[2]*.7*part;
  const v=V(p[0],p[1]-HIP,-p[2]);
  v.applyAxisAngle(ZA,-roll).applyAxisAngle(XA,-pitch).applyAxisAngle(YA,yaw);
  if(q.spin){v.y+=HIP-q.pivot;v.applyAxisAngle(this.rollAxis,-q.spin);v.y-=HIP-q.pivot;}
  return [v.x+q.hip[0],v.y+HIP+q.hip[1],-v.z+q.hip[2]];
 }
 dirTorso(q,d){
  const pitch=q.rot[1]+q.chest[1]*.75,yaw=q.rot[0]+q.chest[0]*.7;
  const v=V(d[0],d[1],-d[2]).applyAxisAngle(XA,-pitch).applyAxisAngle(YA,yaw);
  if(q.spin)v.applyAxisAngle(this.rollAxis,-q.spin);
  return [v.x,v.y,-v.z];
 }

 // ---- pose library ---------------------------------------------------------------------------------------
 idlePose(c){
  const q=blank(),b=Math.sin(c.time*1.7),b2=Math.sin(c.time*.83+1.1);
  q.hip[1]+=-.006+.005*b;q.chest[1]+=.012*b;q.hip[0]+=.006*b2;q.chest[0]+=.015*b2;
  q.hR[1]+=.006*b;q.hL[1]+=.007*b;
  // Settle after a jump or a hard stop.
  const land=Math.exp(-this.land*7.5)*Math.sin(Math.min(1,this.land*9)*Math.PI*.5);
  q.hip[1]-=.20*land;q.rot[1]+=.22*land;q.chest[1]+=.16*land;
  this.aim(q,c,1);
  q.hR=this.torso(q,q.hR);q.hL=this.torso(q,q.hL);
  return q;
 }
 aim(q,c,weight){
  const a=clamp(c.aim||0,-1.25,1.25)*weight;
  q.chest[0]+=a*.28;q.head[0]+=a*.55;
 }
 gait(c,q){
  const v=this.speed,jg=clamp(v/3.15,0,1),sp=clamp((v-3.3)/2.1,0,1);
  const stepLen=v<.8?lerp(.30,.52,v/.8):v<3.15?lerp(.52,.98,(v-.8)/2.35):lerp(.98,1.52,sp);
  const cycle=2*stepLen,duty=lerp(lerp(.63,.43,jg),.33,sp),travel=cycle*duty;
  const [dx,df]=this.dir,back=df<-.3?1:0,ph=this.phase;
  // Oblique foot tracks for locked strafing; in the 4.3–5.4 s reference the
  // trailing boot passes behind the planted boot rather than through it.
  const live=c.state.liveLocomotion,stance=live?-.70*dx:0;
  const out={cycle};
  for(const side of ['Right','Left']){
   const sg=side==='Right'?1:-1,u=frac(ph+(sg>0?0:.5));let along,y,pitch;
   if(u<duty){
    const s=u/duty;along=travel*(.42-s);
    const push=ss(s,.62,1)*jg;y=.085*push;pitch=-.26*jg*(1-ss(s,0,.22))*(1-back)+.80*push*(1-back*.6);
   }else{
    const w=(u-duty)/(1-duty);along=travel*(-.58+ease(w));
    const kick=(.07+.10*jg+.30*sp)*Math.exp(-Math.pow((w-.27)/.21,2))*(1-back*.7);
    y=.085*(1-ss(w,0,.25))*jg+(.045+.075*jg+.04*sp)*Math.sin(Math.PI*w)+kick;
    pitch=lerp(.80*jg+.25,-.26*jg,ss(w,.22,.86))*(1-back*.6);
    if(live){
     const toeOff=.80*jg*(1-back*.6),heelStrike=-.26*jg*(1-back);
     pitch=lerp(toeOff,heelStrike,ss(w,.16,.92));
     y-=kick*(1-ss(w,0,.13)*(1-ss(w,.85,1)));
    }
   }
   const width=live?.115+.035*Math.abs(dx)-.018*sp:.105-.035*sp-.02*jg*Math.abs(dx);
   out[side]={local:[sg*width*Math.cos(stance)+dx*along,y,df*along+sg*width*Math.sin(stance)],pitch,yaw:sg*-.10*(1-sp)+Math.atan2(-dx,Math.max(.2,df))*.55*(1-back)};
  }
  const c2=Math.cos(TAU*ph),s2=Math.sin(TAU*ph),bob=Math.cos(2*TAU*(ph-duty*.5));
  const bobAmp=lerp(-.012,.030+.026*sp,jg);
  const leanAmt=lerp(.045,.15,jg)+.33*sp;
  const heading=Math.atan2(-dx,Math.max(.25,Math.abs(df)))*(df<0?-.6:1);
  const brace=c.state.evasiveRun?ss(v,1.5,4.3):0,inside=Math.tanh(c.aim*2.8);
  q.hip=[.022*(1-.5*sp)*s2*(1-Math.abs(dx)*.6),-(.018+.04*jg+.045*sp)-bobAmp*bob,.03*jg+.05*sp];
  const swing=(.07+.09*jg+.07*sp)*c2;
  q.rot=[swing+heading*.42,leanAmt*.42*df,-.055*jg*s2+leanAmt*.5*dx];
  q.chest=[-swing*1.75-heading*.30,leanAmt*.58*df+.02*bob,.03*s2+leanAmt*.25*dx];
  q.hip[1]-=.19*brace;q.hip[0]+=.075*inside*brace;
  q.rot[1]+=.22*brace;q.rot[2]-=.17*inside*brace;
  q.chest[1]+=.24*brace;q.chest[2]-=.16*inside*brace;q.chest[0]+=.22*inside*brace;
  q.head=[swing*.8-heading*.10-.17*inside*brace,-leanAmt*.62*df-.22*brace];
  // Off hand swings against the stride; the sword arm stays on the hip line with a short counter-swing.
  const arm=(.10+.17*jg+.12*sp);
  q.hL=this.torso(q,[-.33-.03*sp,.96+.08*jg*Math.abs(c2)+.16*sp*Math.max(0,c2),.03+arm*c2+.10*sp]);
  q.eL=[-.42,-.25-.2*sp,-.8];
  q.bL=[-.20,-.62+.25*sp*c2,-.72];
  q.hR=this.torso(q,[.36+.02*sp,.945+.03*jg*Math.abs(c2)+.05*sp,.14-(.05+.05*jg+.07*sp)*c2+.05*sp]);
  q.eR=[.52,-.28,-.78];
  // In the side view at 12.95–13.68s the runner carries the sword at
  // hip height with its point just below level through the whole stride.
  q.bR=[lerp(.36,.10,sp),lerp(-.30,-.14,sp)+.04*c2*jg,1];
  if(live||brace>0){
   // In the 12.95–13.32 s side view the point stays close to level at
   // the hip while the boots pass and the off arm counter-swings.
   q.bR=[lerp(.28,.10,sp),lerp(-.17,-.09,sp)+.023*c2*jg,1];
  }
  q.kR=[.15+.2*dx,1];q.kL=[-.13+.2*dx,1];
  return out;
 }
 // Dodge: crouch, tucked forward tumble around the body centre, feet-first landing and rise.
 rollPose(c){
  const q=blank(),u=clamp(c.progress,0,1);
  const tuck=ss(u,.02,.20)*(1-ss(u,.70,.96));
  q.spin=TAU*(.5*ss(u,.055,.47)+.5*ss(u,.365,.84));
  const centre=lerp(.95,.47,tuck);
  // Load the free shoulder, carry the long thrusting blade on the outside,
  // then plant the leading boot before the trailing one opens out.
  const shoulder=ss(u,.02,.25)*(1-ss(u,.53,.84));
  const landing=ss(u,.59,.78)*(1-ss(u,.82,.99));
  q.hip=[-.073*shoulder+.035*landing,-(.95-centre)-.14*landing,.06*tuck+.055*landing];
  q.rot=[-.12*shoulder,.34*tuck+.32*ss(u,0,.12)*(1-ss(u,.12,.3)),-.24*shoulder];
  q.chest=[-.14*shoulder,1.05*tuck+.25*landing,-.18*shoulder];
  {
   // Around 50.5–51 s the duelist comes out low and closes on the boss.
   // A queued rolling thrust can take weight on bent knees here. Without
   // the input the ordinary roll still finishes standing.
   const brace=ss(u,.68,.94)*(this.rollLinkWeight||0);
   q.hip[1]=lerp(q.hip[1],-.36,brace);
   q.rot[1]=lerp(q.rot[1],.31,brace);
   q.chest[1]=lerp(q.chest[1],.35,brace);
  }
  // Unfold the upper body a fraction after the leading boot makes contact.
  // The weapon arm comes back to the hip as weight settles onto that foot.
  const catchFoot=ss(u,.66,.79)*(1-ss(u,.79,.97));
  q.chest[1]+=.10*catchFoot;q.rot[2]+=.065*catchFoot;
  q.head=[-.07*shoulder,.55*tuck-.12*catchFoot];
  q.hR=this.torso(q,[.25,lerp(.93,1.02,tuck),lerp(.10,.34,tuck)]);q.hL=this.torso(q,[-.25,lerp(.93,1.0,tuck),lerp(.0,.36,tuck)]);
  q.eR=[.6,-.5,-.3];q.eL=[-.6,-.5,-.3];
  q.bR=this.dirTorso(q,[.30+.62*shoulder,-.22+.24*shoulder,1]);q.bL=this.dirTorso(q,[-.3,-.5,-.7]);
  q.kR=[.22,1];q.kL=[-.22,1];
  // Feet: tucked under the pelvis while tumbling, reaching for the ground to land.
  const legs={};
  for(const side of ['Right','Left']){
   const sg=side==='Right'?1:-1;
   const tucked=this.torso(q,[sg*.13,HIP-.50,.20+(sg>0?.05:-.03)],0);
   const ground=[sg*.13,0,sg>0?.16:-.20];
   const k=ss(u,.03,.16)*(1-ss(u,sg>0?.57:.65,sg>0?.74:.85));
   const local=[lerp(ground[0],tucked[0],k),Math.max(0,lerp(ground[1],tucked[1],k)),lerp(ground[2],tucked[2],k)];
   // At landing the upright sole is one full turn ahead of its start.
   // Interpolating it back to zero unwinds the foot through the body.
   const soleSpin=u>=.5?lerp(TAU,q.spin,k):q.spin*k;
   legs[side]={local,pitch:.5*k,yaw:0,spin:soleSpin,air:k};
  }
  return {q,legs};
 }
 backstepPose(c){
  const q=blank(),u=clamp(c.progress,0,1);
  const dip=ss(u,0,.12)*(1-ss(u,.12,.32));
  const flight=ss(u,.12,.38)*(1-ss(u,.55,.78));
  const catchWeight=ss(u,.55,.78)*(1-ss(u,.80,1));
  q.hip[1]-=.15*dip+.13*catchWeight;
  q.hip[2]-=.08*flight;
  q.rot[1]+=.20*dip+.10*flight+.19*catchWeight;
  q.chest[1]+=.12*dip+.10*catchWeight;
  this.aim(q,c,1);
  q.hR=this.torso(q,[.345,.925+.07*flight,.10+.10*flight]);
  q.hL=this.torso(q,[-.335-.07*flight,.93+.10*flight,.09*flight]);
  const legs={};
  for(const side of ['Right','Left']){
   const rear=side==='Right',home=HOME[side];
   const lift=rear?.08:.16,land=rear?.72:.85;
   const air=ss(u,lift,lift+.13)*(1-ss(u,land-.14,land));
   if(u<=lift||u>=land){
    legs[side]={plant:true,pitch:u<=lift?.25*ss(u,0,lift):0};
   }else{
    const reach=ss(u,lift,land);
    legs[side]={local:[home[0],(rear?.09:.16)*air,home[2]+.09*(1-reach)-(rear?.11:.04)*reach],
     pitch:.34*(1-reach),yaw:HOME_YAW[side],air};
   }
  }
  return {q,legs};
 }
 jumpPose(c){
  const q=blank(),f=c.flight,e=f.elapsed,D=f.duration,w=f.windup||.0001;
  const crouch=ss(e,.01,w*.62)*(1-ss(e,w*.74,w+.05));
  const air=ss(e,w*.9,w+.13)*(1-ss(e,D-.13,D-.01));
  const reach=ss(e,D-.30,D-.06);
  const run=clamp(this.speed/5.6,0,1);
  q.hip=[0,-.26*crouch+.03*air,.05*crouch];
  q.rot=[.10*air,.34*crouch+.10*run*air-.06*air*(1-reach),0];
  q.chest=[-.20*air,.26*crouch-.14*air*(1-reach)+.12*reach*air,0];
  q.head=[.12*air,-.12*crouch];
  q.hR=this.torso(q,[.40+.05*air,.93+.08*air,.08-.12*air]);q.bR=[.30,-.42-.25*air,1];q.eR=[.55,-.2,-.8];
  q.hL=this.torso(q,[-.42-.14*air,.95+.26*air,.06+.16*air]);q.bL=[-.3,-.5,-.7];q.eL=[-.6,-.35,-.5];
  const legs={};
  for(const side of ['Right','Left']){
   const sg=side==='Right'?1:-1;
   // Lead (left) knee drives up, the right leg trails; both reach down before touchdown.
   const tuckY=sg>0?.16:.40,tuckF=sg>0?-.26:.22;
   const k=air*(1-.85*reach);
   legs[side]={local:[sg*.115,tuckY*k,tuckF*k+(sg>0?-.06:.08)*(1-k)],pitch:(sg>0?.7:.25)*k,yaw:sg*-.08,air:ss(e,w*.9,w+.05)*(1-ss(e,D-.04,D))};
  }
  return {q,legs};
 }
 // Sword Lance light attacks. Tables use absolute hand targets so the point travels on a straight line.
 attackKeys(c){
  // A late input may leave only a few milliseconds to prepare the link.
  // Start the follow-up at the pose actually reached by the previous thrust.
  const link=this.from||CHAIN_LINK,end={};
  if(c.jumpAttack){
   // Falling stab: sword lifts behind the shoulder on the rise, drives down through the landing.
   return {d:.72,contact:.26,keys:[
    [0,{}],
    [.10,{hip:[0,.02,-.02],rot:[-.25,-.10,0],chest:[-.45,-.22,0],head:[.5,-.1],hR:[.34,1.72,-.20],eR:[.7,.2,-.6],bR:[.05,.55,.80],hL:[-.30,1.30,.36],bL:[.1,.4,.9]}],
    [.26,{hip:[.02,-.10,.10],rot:[.30,.30,0],chest:[.50,.46,.05],head:[-.5,-.2],hR:[.10,.98,.82],eR:[.5,-.3,-.6],bR:[-.02,-.50,1],hL:[-.46,1.05,-.34],bL:[-.4,-.4,-.8]}],
    [.36,{hip:[.02,-.24,.12],rot:[.30,.36,0],chest:[.48,.48,.05],head:[-.5,-.2],hR:[.12,.86,.80],eR:[.5,-.3,-.6],bR:[-.02,-.46,1],hL:[-.46,1.0,-.34],bL:[-.4,-.4,-.8]}],
    [.56,{hip:[.01,-.14,.04],rot:[.05,.16,0],chest:[.05,.18,0],hR:[.36,.95,.18],bR:[.30,-.26,1]}],
    [.72,end]]};
  }
  if(c.heavy){
   // Charged lunge: long draw to the rear hip, full-length thrust, held extension.
   return {d:1.2,contact:.55,feet:{step:[.36,.54,[.15,0,.92],.10],back:[.86,1.10]},keys:[
    [0,{}],
    [.20,{hip:[.03,-.10,-.10],rot:[-.42,.08,0],chest:[-.62,.10,-.04],head:[.85,0],hR:[.43,1.10,-.30],eR:[.55,.1,-1],bR:[.02,.03,1],hL:[-.20,1.22,.40],bL:[.15,.5,.85]}],
    [.38,{hip:[.03,-.16,-.14],rot:[-.50,.10,0],chest:[-.74,.14,-.05],head:[1.0,0],hR:[.45,1.13,-.40],eR:[.55,.1,-1],bR:[.0,.02,1],hL:[-.16,1.26,.46],bL:[.15,.5,.85]}],
    [.55,{hip:[.05,-.36,.46],rot:[.46,.34,0],chest:[.74,.38,.06],head:[-.95,-.24],hR:[.02,1.07,1.20],eR:[.4,-.5,-.4],bR:[-.01,.03,1],hL:[-.50,.96,-.56],bL:[-.5,-.4,-.75]}],
    [.70,{hip:[.05,-.38,.47],rot:[.46,.35,0],chest:[.72,.39,.06],head:[-.95,-.24],hR:[.02,1.05,1.18],eR:[.4,-.5,-.4],bR:[-.01,.02,1],hL:[-.50,.94,-.56],bL:[-.5,-.4,-.75]}],
    [.92,{hip:[.03,-.20,.26],rot:[.12,.20,0],chest:[.16,.22,0],head:[-.2,-.1],hR:[.34,1.0,.34],bR:[.22,-.14,1],hL:[-.36,.98,-.12]}],
    [1.2,{}]]};
  }
  if(c.running){
   // Running thrust: the stride gathers into a deep lunge, the cloak follows the dropped hips.
   const d=RUNNING_THRUST.duration,k=RUNNING_THRUST.contact;
   return {d,contact:k,feet:{step:[k-.26,k-.03,[.16,0,.90],.12],back:[d-.33,d-.08]},keys:[
    [0,this.from||{}],
    [k-.28,{hip:[.02,-.12,.04],rot:[-.34,.20,0],chest:[-.56,.22,-.03],head:[.8,-.1],hR:[.44,1.04,-.26],eR:[.55,.1,-1],bR:[.03,.02,1],hL:[-.22,1.16,.42],bL:[.15,.45,.88]}],
    [k-.10,{hip:[.03,-.22,.16],rot:[-.20,.26,0],chest:[-.40,.26,-.03],head:[.55,-.14],hR:[.42,1.03,-.20],eR:[.55,.1,-1],bR:[.02,.03,1],hL:[-.26,1.12,.36],bL:[.15,.45,.88]}],
    [k,{hip:[.05,-.41,.44],rot:[.44,.36,0],chest:[.74,.40,.07],head:[-.95,-.26],hR:[.02,1.0,1.16],eR:[.4,-.5,-.4],bR:[-.01,.05,1],hL:[-.52,.92,-.56],bL:[-.5,-.4,-.75]}],
    [k+.12,{hip:[.05,-.44,.46],rot:[.45,.37,0],chest:[.73,.41,.07],head:[-.95,-.26],hR:[.02,.98,1.15],eR:[.4,-.5,-.4],bR:[-.01,.04,1],hL:[-.52,.90,-.56],bL:[-.5,-.4,-.75]}],
    [k+.34,{hip:[.03,-.22,.26],rot:[.12,.20,0],chest:[.16,.22,0],head:[-.2,-.1],hR:[.34,.98,.34],bR:[.22,-.16,1],hL:[-.36,.96,-.12]}],
    [d,end]]};
  }
  // Standing chain. First thrust steps the right foot through; the follow-up crosses the left foot
  // forward and stabs on a higher line with the hand turned over.
  // A late press may arrive after the ordinary roll has already stood up.
  // Carry only the crouch actually reached into the waking thrust.
  const low=c.rolling?clamp(-(this.from?.hip[1]||0)/.36,0,1):0;
  if(c.counter&&!c.rolling){
   // At 21.8 and 25.1 the dagger is still open after the parry. The sword
   // comes straight from the hip while the lead foot braces in close.
   return {d:.72,contact:.26,feet:{step:[.07,.23,[.16,0,.30],.055],back:[.51,.69]},keys:[
    [0,{hip:[-.035,-.06,.02],rot:[-.15,.09,0],chest:[-.22,.12,-.04],hL:[-.46,1.08,.03],bL:[-.63,.04,-.68],hR:[.40,1.00,-.08],bR:[.05,-.06,1]}],
    [.12,{hip:[.01,-.10,.06],rot:[-.12,.11,0],chest:[-.21,.14,-.025],head:[.25,-.08],hL:[-.44,1.12,-.08],bL:[-.54,.02,-.76],hR:[.38,1.06,-.10],bR:[.02,.035,1]}],
    [.26,{hip:[.035,-.17,.26],rot:[.31,.22,0],chest:[.49,.28,.04],head:[-.62,-.17],hL:[-.46,1.02,-.31],bL:[-.43,-.22,-.84],hR:[.045,1.18,.98],eR:[.43,-.42,-.47],bR:[-.02,.055,1]}],
    [.34,{hip:[.04,-.18,.27],rot:[.32,.23,0],chest:[.50,.27,.04],head:[-.62,-.17],hL:[-.44,1.0,-.33],bL:[-.41,-.26,-.82],hR:[.055,1.17,.97],bR:[-.02,.045,1]}],
    [.49,{hip:[.02,-.12,.14],rot:[.12,.14,0],chest:[.19,.17,0],head:[-.15,-.10],hL:[-.37,1.01,-.11],bL:[-.28,-.45,-.66],hR:[.23,1.08,.49],bR:[.08,-.04,1]}],
    [.72,end]]};
  }
  if(c.chain===2){
   return {d:.72,contact:.26,feet:{side:'Left',step:[.07,.24,[-.13,0,.44],.085],back:[.50,.70]},keys:[
    [0,c.continued?link:{}],
    [.13,{hip:[-.02,-.05,-.03],rot:[-.20,.04,0],chest:[-.52,.02,-.05],head:[.7,0],hR:[.39,1.25,-.08],eR:[.70,.12,-.7],bR:[-.02,-.06,1],hL:[-.31,1.02,.12],bL:[-.40,-.24,-.84]}],
    [.26,{hip:[-.03,-.17,.32],rot:[.26,.24,0],chest:[.60,.34,.07],head:[-.8,-.2],hR:[.03,1.34,1.04],eR:[.6,.1,-.5],bR:[-.01,-.13,1],hL:[-.44,1.0,-.40],bL:[-.5,-.4,-.75]}],
    [.34,{hip:[-.03,-.18,.33],rot:[.26,.25,0],chest:[.58,.35,.07],head:[-.8,-.2],hR:[.03,1.32,1.03],eR:[.6,.1,-.5],bR:[-.01,-.14,1],hL:[-.44,.99,-.40],bL:[-.5,-.4,-.75]}],
    [.45,{hip:[-.02,-.15,.26],rot:[.18,.17,0],chest:[.41,.24,.05],hR:[.09,1.31,.68],bR:[-.01,-.13,1]}],
    [.55,{hip:[-.03,-.15,.14],rot:[.12,.16,-.04],chest:[.18,.20,.05],hR:[.30,1.04,.30],bR:[.16,-.20,1],hL:[-.37,.96,-.10]}],
    [.72,end]]};
  }
  return {d:.72,contact:.26,feet:{step:[.07,.24,[.15,0,.52],.09],back:[.48,.68]},keys:[
   [0,c.continued||c.rolling?link:{hip:[0,-.022-.40*low,0],rot:[-.07,.03+.3*low,0],chest:[-.10,.03+.35*low,0],hR:[.345,.925-.36*low,.10+.1*low]}],
   [.11,{hip:[.02,-.07-.30*low,-.07],rot:[-.32,.05+.2*low,0],chest:[-.52,.10+.25*low,-.04],head:[.7,0],hR:[.41,1.10-.30*low,-.24],eR:[.55,.1,-1],bR:[.03,.02+.12*low,1],hL:[-.34,.98-.19*low,.07],bL:[-.47,-.20,-.79]}],
   [.18,{hip:[.025,-.10-.24*low,.02],rot:[-.09,.09+.12*low,0],chest:[-.38,.14+.12*low,-.035],head:[.48,-.06],hR:[.39,1.14-.23*low,-.12],eR:[.55,.05,-.9],bR:[.016,.025+.09*low,1],hL:[-.36,1.00-.14*low,-.03]}],
   [.26,{hip:[.04,-.21-.10*low,.32],rot:[.38,.24,0],chest:[.64,.30,.05],head:[-.85,-.18],hR:[.03,1.19-.08*low,1.02],eR:[.4,-.5,-.4],bR:[-.01,.02+.05*low,1],hL:[-.46,1.0,-.44],bL:[-.5,-.4,-.75]}],
   [.295,{hip:[.045,-.22-.07*low,.345],rot:[.39,.25,0],chest:[.64,.30,.05],hR:[.03,1.18,1.025],bR:[-.01,.017,1]}],
   [.35,{hip:[.045,-.20-.04*low,.32],rot:[.32,.23,0],chest:[.58,.27,.045],head:[-.77,-.16],hR:[.10,1.15,.89],eR:[.43,-.46,-.46],bR:[.007,.01,1],hL:[-.46,.99,-.40],bL:[-.5,-.4,-.75]}],
   [.46,{hip:[.05,-.18,.22],rot:[.21,.18,-.045],chest:[.33,.23,.07],hR:[.17,1.11,.74],bR:[.025,-.055,1]}],
   [.56,{hip:[.02,-.10,.14],rot:[.06,.10,0],chest:[.08,.14,0],head:[-.1,-.05],hR:[.30,1.04,.22],bR:[.11,-.09,1],hL:[-.34,.97,-.06]}],
   [.72,end]]};
 }
 attackPose(c){
  if(this.attackId!==c.actionKey){
   const base=blank();base.hR=this.torso(base,base.hR);base.hL=this.torso(base,base.hL);this.attackBase=base;
   this.attackData=this.attackKeys(c);
   this.attackFrames=prepareAttackKeys(this.attackData.keys,base);
   this.attackId=c.actionKey;this.linkFrames=null;this.linkWeight=0;
  }
  const A=this.attackData,progress=clamp(c.progress,0,1);
  let t=progress*A.d;
  if(c.jumpAttack&&c.heavy){
   const elapsed=progress*1.2;
   t=elapsed<=.55?elapsed/.55*A.contact:lerp(A.contact,A.d,(elapsed-.55)/.65);
  }
  let q=sampleAttack(this.attackFrames,t);
  if(!c.heavy&&!c.jumpAttack&&!c.running){
   // The wrist withdraws along the thrust line before the blade returns to
   // the outside hip. Keep the point level through that first withdrawal.
   const pull=ss(t,A.contact+.035,A.contact+.10)*(1-ss(t,A.contact+.13,A.contact+.24));
   q.bR[0]*=1-.72*pull;q.bR[1]=lerp(q.bR[1],c.chain===2?-.10:.018,.72*pull);
   q.hL[2]-=.080*pull;q.chest[0]+=.075*pull;
  }
  if(c.chainQueued&&!this.linkFrames&&(!c.heavy||c.jumpAttack)){
   const keys=A.keys.slice();keys[keys.length-1]=[A.d,CHAIN_LINK];
   this.linkFrames=prepareAttackKeys(keys,this.attackBase);
  }
  if(this.linkFrames){
   // A follow-up can be requested or replaced in the last frame of recovery.
   this.linkWeight=clamp(this.linkWeight+(c.chainQueued?c.dt:-c.dt)/.14,0,1);
   if(this.linkWeight>0)q=mixPose(q,sampleAttack(this.linkFrames,t),ease(this.linkWeight));
  }
  this.aim(q,c,.5*(1-ss(t,0,.1)));
  const legs={};
  if(c.jumpAttack){
   const f=c.flight;
   if(!f)return {q,legs:{Left:{plant:true,pitch:0},Right:{plant:true,pitch:0}}};
   const w=f.windup||0;
   const air=ss(f.elapsed,w*.9,w+.05)*(1-ss(f.elapsed,f.duration-.04,f.duration));
   const k=1-ss(f.elapsed,f.duration-.26,f.duration-.05);
   legs.Right={local:[.12,.14*k,-.22*k+.10*(1-k)],pitch:.6*k,yaw:-.08,air};
   legs.Left={local:[-.12,.34*k,.20*k-.16*(1-k)],pitch:.25*k,yaw:.08,air};
   return {q,legs};
  }
  // Feet: the stepping foot travels with the lunge, lands before contact and stays; the other foot
  // keeps its ground mark and rolls onto the toe as the hips pass over the front knee.
  const stepSide=A.feet?.side||'Right',other=stepSide==='Right'?'Left':'Right',plan=this.plan;
  if(plan.id!==c.actionKey){plan.id=c.actionKey;plan.from=null;plan.back=null;plan.trailFrom=null;plan.trailPlanted=false;plan.landed=false;plan.returned=false;plan.heldForChain=false;}
  if(A.feet){
   const [t0,t1,dest,lift]=A.feet.step,[b0,b1]=A.feet.back,sg=stepSide==='Right'?1:-1,home=HOME[stepSide];
   if(t<t0)legs[stepSide]={plant:true};
   else if(t<t1){
    plan.from??=this.localOf(stepSide);const u=(t-t0)/(t1-t0),e=ease(u);
    legs[stepSide]={local:[lerp(plan.from[0],dest[0],e),lift*Math.sin(Math.PI*u)+plan.from[1]*(1-e),lerp(plan.from[2],dest[2],e)],pitch:-.30*Math.sin(Math.PI*u),yaw:sg*-.04,exact:true};
   }else if(t<b0||c.chainQueued&&!plan.back){
    // Always plant on the authored mark, even if a frame crossed touchdown.
    legs[stepSide]=plan.landed?{plant:true,pitch:0}:{local:dest,pitch:0,yaw:sg*-.04,exact:true};
    plan.landed=true;if(t>=b0)plan.heldForChain=true;
   }
   else{
    if(!plan.back){
     plan.back=this.localOf(stepSide);plan.returnStart=plan.heldForChain?t:b0;
    }
    const u=clamp((t-plan.returnStart)/(b1-b0),0,1),e=ease(u);
    if(u<1){
     legs[stepSide]={local:[lerp(plan.back[0],home[0],e),.06*Math.sin(Math.PI*u),lerp(plan.back[2],home[2],e)],pitch:.2*Math.sin(Math.PI*u),yaw:HOME_YAW[stepSide],exact:true};
    }else{
     legs[stepSide]=plan.returned?{plant:true}:{local:home,pitch:0,yaw:HOME_YAW[stepSide],exact:true};
     plan.returned=true;
    }
   }
   const ext=ss(t,t0+.04,t1)*(1-ss(t,b0-.06,b1));
   legs[other]={plant:true,pitch:.62*ext};
   if(c.state.liveLocomotion&&c.running){
    if(t<t0){
     // Do not freeze both soles while the approach still carries the
     // player forward. Keep the distance-driven sprint cycle until the lunge.
     this.phase=frac(this.phase+c.distance/(this.gaitCycle||1.9));
     const gait=this.gait(c,blank());this.gaitCycle=gait.cycle;
     legs.Right=gait.Right;legs.Left=gait.Left;
    }else if(t>=A.contact){
     // The lead boot is planted first. At 36.4–36.6 s the trailing boot
     // lifts and follows the body instead of scraping across the floor.
     const home=HOME[other];
     plan.trailFrom??=this.localOf(other);
     const u=clamp((t-A.contact)/(b0-A.contact),0,1),e=ease(u);
     if(!plan.trailPlanted){
      legs[other]={local:[lerp(plan.trailFrom[0],home[0],e),
       plan.trailFrom[1]*(1-e)+.14*Math.sin(Math.PI*u),
       lerp(plan.trailFrom[2],home[2]+.07,e)],pitch:.62*(1-e),
       yaw:HOME_YAW[other],exact:true};
      plan.trailPlanted=u===1;
     }else legs[other]={plant:true,pitch:0};
    }
   }
   q.kR=[.20+.10*ext,1];q.kL=[-.12-.14*ext,1];
  }
  return {q,legs};
 }

 // ---- per-frame --------------------------------------------------------------------------------------------
 owns(state){
  if(!['idle','walk','run','dive','jump','slash'].includes(state.motion))return false;
  if(state.drink||(state.guard&&!state.twoHanded)||state.recoil||state.crouched||Number.isFinite(state.castTime)||((state.weapon||0)!==0&&state.twoHandedSide!=='Left')||state.dissolve>0)return false;
  return true;
 }
 update(dt,state,time){
  if(!this.ready&&!this.init())return false;
  const a=this.actor;this.wasOwned=this.owned;this.owned=this.owns(state);
  // Travel measured from the actor root: stride phase advances with real ground distance.
  const pos=a.root.position,yaw=state.yaw||0;
  if(!this.hasLast){this.last.copy(pos);this.hasLast=true;this.lastYaw=yaw;}
  const moved=V(pos.x-this.last.x,0,pos.z-this.last.z),dist=moved.length();this.last.copy(pos);
  const teleport=dist>1.6;
  if(teleport)this.vel.set(0,0,0);
  else if(dt>1e-5)this.vel.lerp(moved.clone().multiplyScalar(1/dt),1-Math.exp(-dt*16));
  this.speed=Math.min(8,this.vel.length());
  if(dt>1e-5){
   this.turn=lerp(this.turn,clamp(wrap(yaw-this.lastYaw)/dt,-9,9),1-Math.exp(-dt*10));
   this.accelLean=lerp(this.accelLean,clamp((this.speed-this.lastSpeed)/dt*.011,-.15,.17),1-Math.exp(-dt*7));
  }
  this.lastYaw=yaw;this.lastSpeed=this.speed;
  if(state.twoHandedSide&&this.gripSide!==state.twoHandedSide){this.gripSide=state.twoHandedSide;this.gripWeight=0;}
  if(!this.owned||state.parry||state.critical)this.gripWeight=0;
  else this.gripWeight=clamp(this.gripWeight+(state.twoHanded?dt:-dt)/.18,0,1);
  if(this.speed>.25){
   const lx=this.vel.x*Math.cos(yaw)-this.vel.z*Math.sin(yaw),lz=this.vel.x*Math.sin(yaw)+this.vel.z*Math.cos(yaw);
   const n=Math.hypot(lx,lz)||1,k=1-Math.exp(-dt*12);
   this.dir=[lerp(this.dir[0],lx/n,k),lerp(this.dir[1],-lz/n,k)];const dn=Math.hypot(this.dir[0],this.dir[1])||1;this.dir[0]/=dn;this.dir[1]/=dn;
  }
  this.land+=dt;this.stepCooldown=Math.max(0,this.stepCooldown-dt);
  if(!this.owned){if(teleport)this.feet.Right.set=false;return false;}
  this.g=state.groundOffset||0;this.groundAt=state.groundAt||null;
  if(teleport||!this.feet.Right.set)this.resetFeet();

  // Action selection.
  const m=state.motion,attack=m==='slash'&&!state.critical&&(state.strike==='light'||state.strike==='heavy');
  const flight=state.jumpFlight;
  const mode=attack?'attack':m==='dive'?'roll':m==='jump'?(state.strike==='backstep'?'backstep':flight?'jump':'launch'):(m==='walk'||m==='run')?'move':'idle';
  const key=mode==='attack'?'attack|'+state.actionId+'|'+state.strike:mode;
  const c={time,dt,state,distance:teleport?0:dist,aim:state.aim||0,progress:state.progress||0,flight,
   heavy:state.strike==='heavy',running:!!state.runningThrust,rolling:!!state.rollingThrust,chain:state.lightChain||1,continued:!!state.lightContinued,
   chainQueued:!!state.chainQueued,counter:!!state.counterThrust,jumpAttack:attack&&(state.airStrike??!!flight),actionKey:key};
  if(mode==='roll'&&this.modeKey==='roll'&&c.progress<this.lastProgress-.2)this.modeKey='';   // chained dodge restarts
  if(key!==this.modeKey){
   const prev=this.mode;
   if(mode==='roll')this.rollLinkWeight=0;
   if(mode==='attack')this.attackId=null;
   this.from=copyPose(this.pose);this.blend=0;
   if(prev==='roll')this.from.spin=wrap(this.from.spin);
   // Let the sword hand and lead shoulder pick up the input in the first
   // displayed frames. The thrust contact, dodge travel and recovery still
   // follow the action track independently of the monitor's refresh rate.
   const strikeBlend=c.heavy?.07:prev==='attack'?.042:.045;
   this.blendTime=mode==='attack'?strikeBlend:mode==='roll'?.042:mode==='backstep'?.06:mode==='jump'?.08:mode==='move'?.16:prev==='attack'?.16:prev==='roll'?.12:prev==='jump'?.10:.18;
   if((prev==='jump'||prev==='launch'||(prev==='attack'&&this.wasJumpAttack))&&mode!=='jump')this.land=0;
   if(prev==='move'&&mode==='idle'&&this.speed>3.6)this.land=.06;
   this.footBlend=0;this.mode=mode;this.modeKey=key;
  }
  this.wasJumpAttack=c.jumpAttack;this.lastProgress=c.progress;
  this.blend=Math.min(1,this.blend+dt/Math.max(.001,this.blendTime));
  this.footBlend=Math.min(1,this.footBlend+dt/.12);

  // Target pose and foot commands of the active action.
  let q,legs;
  if(mode==='move'){
   this.phase=frac(this.phase+dist/(this.gaitCycle||1.9));
   q=blank();const g=this.gait(c,q);this.gaitCycle=g.cycle;
   this.aim(q,c,.8);
   legs={Right:g.Right,Left:g.Left};
  }else if(mode==='attack')({q,legs}=this.attackPose(c));
  else if(mode==='roll'){
   const axisYaw=state.rollAxisYaw||0;
   this.rollAxis.set(Math.cos(axisYaw),0,-Math.sin(axisYaw));
   this.rollLinkWeight=clamp(this.rollLinkWeight+(c.chainQueued?dt:-dt)/.10,0,1);
   ({q,legs}=this.rollPose(c));
  }
  else if(mode==='backstep')({q,legs}=this.backstepPose(c));
  else if(mode==='jump')({q,legs}=this.jumpPose(c));
  else if(mode==='launch'){
   q=blank();q.rot[1]=-.35;q.chest[1]=-.25;q.hip[1]=.05;q.hR=this.torso(q,[.5,1.2,.1]);q.hL=this.torso(q,[-.5,1.25,.1]);
   legs={Right:{local:[.14,.2,.25],pitch:.3,yaw:0,air:1},Left:{local:[-.14,.3,.3],pitch:.3,yaw:0,air:1}};
  }else{
   q=this.idlePose(c);
   const still=!!state.parry||!!state.critical;
   legs={Right:{plant:true,home:HOME.Right,homeYaw:HOME_YAW.Right,tol:still?9:.20},Left:{plant:true,home:HOME.Left,homeYaw:HOME_YAW.Left,tol:still?9:.20}};
  }
  // Lean into turns and against changes of speed.
  if(state.twoHanded&&state.guard){
   q.hR=this.torso(q,[.25,1.24,.40]);
   q.bR=[-.52,.83,.24];
  }
  const turnLean=clamp(this.turn*.035,-.16,.16)*(mode==='move'?1:.3);
  q.rot[2]-=turnLean;q.chest[2]-=turnLean*.6;
  if(mode==='move'||mode==='idle'){q.rot[1]+=this.accelLean*.55;q.chest[1]+=this.accelLean*.45;}
  const w=ease(this.blend);
  this.pose=this.from&&w<1?mixPose(this.from,q,w):q;
  this.apply(this.pose,legs,dt,state);
  return true;
 }
 resetFeet(){
  const a=this.actor;a.root.updateMatrixWorld(true);
  for(const side of ['Right','Left']){
   const f=this.feet[side];
   f.w.copy(a.root.localToWorld(V(HOME[side][0],0,-HOME[side][2])));f.h=0;f.pitch=0;f.yaw=(a.root.rotation.y||0)+HOME_YAW[side];f.step=null;f.set=true;f.air=0;
  }
  this.plan={};
 }
 ground(x,z){return this.groundAt?this.groundAt(x,z):this.g;}

 apply(q,legs,dt,state){
  const a=this.actor,root=a.root,visual=a.visual,yaw=state.yaw||0;
  for(const b of a.thrustBasePose){b.bone.quaternion.copy(b.q);b.bone.position.copy(b.p);}
  // Whole-body frame: pelvis offset plus the tumble about the body centre.
  const s=q.spin,h=q.pivot;
  // Rotate the whole body about the line perpendicular to the actual
  // dodge direction. A locked side roll retains the facing of the chest.
  const axis=this.rollAxis,swing=h*Math.sin(s);
  visual.quaternion.setFromAxisAngle(axis,-s);
  visual.position.set(q.hip[0]-axis.z*swing,this.g+q.hip[1]+h-h*Math.cos(s),-q.hip[2]+axis.x*swing);
  const vq=visual.getWorldQuaternion(new T.Quaternion());
  // A joint's parent stays fixed through that joint's three turns. Refresh
  // its ancestry once here; the next joint reads the updated parent chain.
  const inverseParent=new T.Quaternion(),turnRotation=new T.Quaternion(),turnAxis=V();
  const turn=(bone,y,x,z)=>{
   if(!bone||Math.max(Math.abs(y),Math.abs(x),Math.abs(z))<1e-5)return;
   bone.parent.getWorldQuaternion(inverseParent).invert();
   const applyAxis=(axis,angle)=>{
    if(Math.abs(angle)<1e-5)return;
    turnAxis.copy(axis).applyQuaternion(vq).applyQuaternion(inverseParent).normalize();
    bone.quaternion.premultiply(turnRotation.setFromAxisAngle(turnAxis,angle));
   };
   applyAxis(YA,y);applyAxis(XA,x);applyAxis(ZA,z);
  };
  turn(this.bone('Hips'),q.rot[0],-q.rot[1],-q.rot[2]);
  for(const [name,share] of [['Spine',.30],['Spine1',.34],['Spine2',.36]]){
   turn(this.bone(name),q.chest[0]*share,-q.chest[1]*share,-q.chest[2]*share);
  }
  for(const [name,share] of [['Neck',.4],['Head',.6]]){
   turn(this.bone(name),q.head[0]*share,-q.head[1]*share,0);
  }
  // Feet.
  const k=ease(this.footBlend);
  for(const side of ['Right','Left']){
   const f=this.feet[side],cmd=legs[side]||{plant:true},other=this.feet[side==='Right'?'Left':'Right'];
   const upper=this.bone(side+'UpLeg'),foot=this.bone(side+'Foot');
   if(cmd.plant){
    // Hold the ground mark; re-step when the body has turned or drifted away from it.
    if(cmd.home&&!f.step){
     const ideal=this.W(cmd.home[0],0,cmd.home[2]);
     const err=Math.hypot(ideal.x-f.w.x,ideal.z-f.w.z),yerr=Math.abs(wrap(yaw+cmd.homeYaw-f.yaw));
     if((err>cmd.tol||yerr>.75||f.h>.02)&&!other.step&&this.stepCooldown<=0)f.step={from:f.w.clone(),fromYaw:f.yaw,fromH:f.h,t:0,dur:clamp(.16+err*.22,.16,.30)};
    }
    if(f.step&&cmd.home){
     const st=f.step;st.t+=dt;const u=clamp(st.t/st.dur,0,1),e=ease(u),ideal=this.W(cmd.home[0],0,cmd.home[2]);
     f.w.x=lerp(st.from.x,ideal.x,e);f.w.z=lerp(st.from.z,ideal.z,e);
     f.h=st.fromH*(1-e)+(.05+.05*Math.min(1,st.dur/.3))*Math.sin(Math.PI*u);f.yaw=st.fromYaw+wrap(yaw+cmd.homeYaw-st.fromYaw)*e;f.pitch=.18*Math.sin(Math.PI*u);
     if(u>=1){f.step=null;f.h=0;f.pitch=0;this.stepCooldown=.05;}
    }else{
     f.step=null;f.h=Math.max(0,f.h-dt*2.2);
     f.pitch=lerp(f.pitch,cmd.pitch||0,1-Math.exp(-dt*(cmd.pitch!=null?22:14)));
    }
    f.air=Math.max(0,f.air-dt*8);
   }else{
    f.step=null;
    const w=this.W(cmd.local[0],0,cmd.local[2]),kk=cmd.exact?1:k;
    f.w.x=lerp(f.w.x,w.x,kk);f.w.z=lerp(f.w.z,w.z,kk);f.h=lerp(f.h,cmd.local[1],kk);
    f.pitch=lerp(f.pitch,cmd.pitch||0,kk);f.yaw=f.yaw+wrap(yaw+(cmd.yaw||0)-f.yaw)*kk;f.air=lerp(f.air,cmd.air||0,kk);
   }
   // Ankle target: terrain under a grounded foot, the actor's own base height while airborne.
   let support=this.ground(f.w.x,f.w.z);
   if(state.walkSurface&&f.air<1&&['idle','move','roll','attack'].includes(this.mode)){
     const forwardX=-Math.sin(f.yaw),forwardZ=-Math.cos(f.yaw),toe=this.toeSpan[side],heel=toe*.42;
     support=Math.max(support,
       this.ground(f.w.x+forwardX*toe,f.w.z+forwardZ*toe)+toe*Math.sin(f.pitch),
       this.ground(f.w.x-forwardX*heel,f.w.z-forwardZ*heel)-heel*Math.sin(f.pitch));
    }
    const groundY=lerp(support,root.position.y+this.g,clamp(f.air,0,1));
   const target=V(f.w.x,groundY+this.ankleHeight+f.h+.075*Math.max(0,Math.sin(f.pitch)),f.w.z);
   // A planted foot beyond the leg's reach drags toward the hip instead of leaving the ground.
   const joint=upper.getWorldPosition(V()),dy=joint.y-target.y,reach=this.legLength*.985;
   const hmax=Math.sqrt(Math.max(.0004,reach*reach-dy*dy)),hx=target.x-joint.x,hz=target.z-joint.z,hd=Math.hypot(hx,hz);
   if(hd>hmax&&cmd.plant){
    const sc=hmax/hd;target.x=joint.x+hx*sc;target.z=joint.z+hz*sc;
    const drag=1-Math.exp(-dt*18);f.w.x=lerp(f.w.x,target.x,drag);f.w.z=lerp(f.w.z,target.z,drag);
   }
   const kp=side==='Right'?q.kR:q.kL;
   const pole=joint.clone().add(V(kp[0],.12,-kp[1]).applyQuaternion(vq));
   solveBossLimb(a,side,['UpLeg','Leg','Foot'],target,pole,1);
   // Sole orientation: world heading of the foot mark, heel/toe pitch, tumble while tucked.
   const fq=new T.Quaternion().setFromAxisAngle(YA,f.yaw);
   if(cmd.spin)fq.multiply(new T.Quaternion().setFromAxisAngle(this.rollAxis,-cmd.spin));
   fq.multiply(new T.Quaternion().setFromAxisAngle(XA,-f.pitch)).multiply(this.footRest[side]);
   foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(fq));
  }

  // Arms and blades.
  const right=XA.clone().applyAxisAngle(YA,yaw);
  let rearGrip,directionAtGrip;
  const leftLead=this.gripSide==='Left'&&this.gripWeight>0;
  const supportSide=leftLead?'Right':'Left';
  const gripSpacing=leftLead?.06*(a.weapons.find(w=>w.side==='Left')?.length||.61)/.61:GRIP_SPACING;
  for(const side of leftLead?['Left','Right']:['Right','Left']){
   const isRight=side==='Right',hp=isRight?q.hR:q.hL,ep=isRight?q.eR:q.eL,bd=isRight?q.bR:q.bL;
   const leading=side!==supportSide,sign=leftLead?-1:1;
   const shoulder=this.bone(side+'Arm').getWorldPosition(V());
   const pole=shoulder.clone().add(V(ep[0],ep[1],-ep[2]).applyQuaternion(vq));
   const target=this.W(hp[0],hp[1],hp[2]),d=V(bd[0],bd[1],-bd[2]).normalize().applyAxisAngle(YA,yaw);
   if(leading&&this.gripWeight){
    if(leftLead){
     target.lerp(this.W(-q.hR[0],q.hR[1],q.hR[2]),this.gripWeight);
     d.lerp(V(-q.bR[0],q.bR[1],-q.bR[2]).normalize().applyAxisAngle(YA,yaw),this.gripWeight).normalize();
    }
    // Bring the hilt across the belt for the optional two-hand carry. The
    // thrust still follows its authored line as it extends away from the belt.
    const carry=this.mode==='idle'||this.mode==='move'?1:this.mode==='attack'?1-ss(state.progress||0,0,.24)+ss(state.progress||0,.75,1):0;
    const w=this.gripWeight*carry;
    target.lerp(this.W(sign*(q.hR[0]-.21),q.hR[1]+.13,q.hR[2]+.14),w);
    const pitch=lerp(.38,-.12,ss(this.speed,3.3,5.4));
    if(!state.guard)d.lerp(V(sign*.20,pitch,-1).normalize().applyAxisAngle(YA,yaw),w).normalize();
    // Keep the same thrust timing and point direction, but constrain the
    // handle to the intersecting reach of both shoulders while it is gripped.
    const support=this.bone(supportSide+'Arm').getWorldPosition(V()).addScaledVector(d,gripSpacing);
    const shared=target.clone().sub(support).clampLength(0,this.armReach[supportSide]).add(support);
    shared.sub(shoulder).clampLength(0,this.armReach[side]).add(shoulder);
    target.lerp(shared,this.gripWeight);
   }else if(rearGrip){
    target.lerp(rearGrip,this.gripWeight);
    d.lerp(directionAtGrip,this.gripWeight).normalize();
   }
   solveBossLimb(a,side,['Arm','ForeArm','Hand'],target,pole,1);
   const hand=this.bone(side+'Hand'),weapon=a.weapons.find(w=>w.side===side&&w.slot===0);
   if(hand&&weapon?.handBindInverse){
    if(this.mode==='roll'&&(!rearGrip||!this.gripWeight)){
     const wrist=hand.getWorldPosition(this.rollWrist??=V());
     // Recheck after pitching up: the end of a long blade can now reach a
     // higher patch of ground. Use the solved wrist, including shoulder IK.
     for(let pass=0;pass<2;pass++){
      let minSlope=d.y;
      for(const fraction of [.33,.67,1]){
       const span=weapon.length*fraction;
       const ground=this.ground(wrist.x+d.x*span,wrist.z+d.z*span);
       minSlope=Math.max(minSlope,(ground+.12-wrist.y)/span);
      }
      if(minSlope<=d.y+.0001)break;
      const y=clamp(minSlope,-.99,.97),xz=Math.hypot(d.x,d.z);
      if(xz<.001){d.set(right.x,0,right.z);continue;}
      const scale=Math.sqrt(1-y*y)/xz;
      d.set(d.x*scale,y,d.z*scale);
     }
    }
    // Stable blade frame: the guard stays across the actor's right axis, so the wrist never flips
    // through the shortest-arc twist when the point passes vertical.
    const ref=Math.abs(d.dot(right))>.95?YA:right;
    const across=ref.clone().addScaledVector(d,-ref.dot(d)).normalize(),normal=V().crossVectors(across,d).normalize();
    const blade=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,d,normal));
    const sign=isRight?1:-1;
    const mount=new T.Quaternion().setFromAxisAngle(XA,-2.5).multiply(new T.Quaternion().setFromAxisAngle(ZA,-sign*.3));
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(blade).multiply(mount.clone().invert()).multiply(weapon.handBindInverse.clone().invert()).normalize());
    if(leading&&this.gripWeight){
     // The right hand's attachment is the front grip. Measure the rear grip
     // from the actual solved wrist so the hands follow one rigid handle.
     const mounted=hand.getWorldQuaternion(new T.Quaternion()).multiply(weapon.handBindInverse).normalize();
     mounted.multiply(mount);
     directionAtGrip=YA.clone().applyQuaternion(mounted);
     rearGrip=hand.getWorldPosition(V()).addScaledVector(directionAtGrip,-gripSpacing);
    }
   }
  }
  root.updateMatrixWorld(true);
  // Returning from an overlay state (flask, hit reaction, cast): ease the skeleton across.
  if(!this.wasOwned&&this.legacy)this.legacyBlend=0;
  if(this.legacyBlend<1&&this.legacy){
   this.legacyBlend=Math.min(1,this.legacyBlend+dt/.18);const e=ease(this.legacyBlend);
   for(const [name,bone] of Object.entries(a.bones)){const from=this.legacy[name];if(from)bone.quaternion.copy(from.clone().slerp(bone.quaternion,e));}
   root.updateMatrixWorld(true);
  }
  if(q.spin>0&&q.spin<TAU){
   const tuck=Math.sin(q.spin*.5)**2;
   let clearance=0;
   const point=this.rollContactPoint??=V();
   for(const [name,radius] of [['Head',.30],['LeftArm',.13],['RightArm',.13],['Spine2',.19]]){
    this.bone(name).getWorldPosition(point);
    clearance=Math.max(clearance,this.ground(point.x,point.z)+radius*tuck-point.y);
   }
   if(clearance>0){visual.position.y+=clearance;root.updateMatrixWorld(true);}
  }
 }
 // Called at the end of every actor tick with the final skeleton.
 finish(){
  const a=this.actor;
  if(!this.ready)return;
  if(!this.owned)this.legacy=copyBonePose(a,this.legacy);
  else if(this.legacyBlend>=1){this.legacy=null;a.lastPose=copyBonePose(a,a.lastPose===a.poseFrom?null:a.lastPose);}
 }
}
