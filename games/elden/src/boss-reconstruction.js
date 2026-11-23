import {fitConsortVisor} from "game/src/consort-visage.js";
import * as T from "game/lib/three.module.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";
import {MOVES,RIPOSTE_SEQUENCE,ROCK_RETURN,ROCK_SEQUENCE,rockBladePlant,RUSH_SEQUENCE,METEOR_SEQUENCE,GRAB_SEQUENCE,STOMP_GRAB_SEQUENCE,lightContacts,meleeLocomotion,parryReel,PARRY_REEL,CRITICAL_RETREAT} from "game/src/combat.js";

const V=(x,y,z)=>new T.Vector3(x,y,z);
const Y=V(0,1,0),X=V(1,0,0),Z=V(0,0,1);
const smooth=T.MathUtils.smoothstep,lerp=T.MathUtils.lerp;
// A live rig and each ghost have separate joint dictionaries. Cache only
// resolved joints so a lookup during loading can still succeed later.
const jointLookups=new WeakMap();
export function findRigBone(bones,suffix){
 let lookup=jointLookups.get(bones);
 if(!lookup){lookup=new Map();jointLookups.set(bones,lookup);}
 const cached=lookup.get(suffix);
 if(cached&&bones[cached.name]===cached)return cached;
 const joint=Object.values(bones).find(b=>b.name.endsWith(suffix));
 if(joint)lookup.set(suffix,joint);
 return joint;
}
const bladeFrame=v=>{
 const direction=V(...v.slice(3,6)).normalize(),across=Y.clone().addScaledVector(direction,-direction.y);
 if(across.lengthSq()<1e-8)across.copy(X);across.normalize();
 const normal=V().crossVectors(across,direction).normalize();across.crossVectors(direction,normal).normalize();
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,direction,normal)).normalize();
};
const limbChains=new WeakMap();
// The IK solve only needs the lowest world-space Y of the boot. Sample every
// fitted vertex, but compose each distinct bone transform once per pose.
const soleSamplers=new WeakMap();
function soleHeight(probes){
 let sample=soleSamplers.get(probes);
 if(!sample){
  const transforms=[],vertices=[],meshes=new Map();
  for(const {mesh,index} of probes){
   if(mesh.geometry.morphAttributes.position?.length||!mesh.isSkinnedMesh){
    vertices.push({mesh,index});continue;
   }
   let skin=meshes.get(mesh);
   if(!skin){skin={mesh,world:new T.Matrix4(),bones:new Map()};meshes.set(mesh,skin);}
   const attrs=mesh.geometry.attributes,influences=[];
   const bind=V().fromBufferAttribute(attrs.position,index).applyMatrix4(mesh.bindMatrix);
   for(let k=0;k<4;k++){
    const weight=attrs.skinWeight.getComponent(index,k);if(!weight)continue;
    const id=attrs.skinIndex.getComponent(index,k);
    let transform=skin.bones.get(id);
    if(!transform){
     transform={skin,id,matrix:new T.Matrix4()};skin.bones.set(id,transform);transforms.push(transform);
    }
    influences.push({m:transform.matrix.elements,weight});
   }
   vertices.push({bind,influences,skin});
  }
  sample={transforms,vertices,meshes,scratch:V()};soleSamplers.set(probes,sample);
 }
 for(const skin of sample.meshes.values())skin.world.multiplyMatrices(skin.mesh.matrixWorld,skin.mesh.bindMatrixInverse);
 for(const {skin,id,matrix} of sample.transforms){
  const sk=skin.mesh.skeleton;
  matrix.multiplyMatrices(sk.bones[id].matrixWorld,sk.boneInverses[id]);
  matrix.premultiply(skin.world);
 }
 let low=Infinity;
 for(const v of sample.vertices){
  if(!v.bind){low=Math.min(low,v.mesh.getVertexPosition(v.index,sample.scratch).applyMatrix4(v.mesh.matrixWorld).y);continue;}
  const {x,y,z}=v.bind,offset=v.skin.world.elements[13];
  let height=offset;
  for(const {m,weight} of v.influences)height+=weight*(m[1]*x+m[5]*y+m[9]*z+m[13]-offset);
  low=Math.min(low,height);
 }
 return low;
}
export function solveBossLimb(actor,side,segments,target,pole,weight=1){
 let chains=limbChains.get(actor.bones);
 if(!chains){chains=new Map();limbChains.set(actor.bones,chains);}
 const key=side+segments.join('/');let chain=chains.get(key);
 if(!chain){
  const bones=Object.values(actor.bones);chain=segments.map(suffix=>bones.find(b=>b.name.endsWith(side+suffix)));
  if(chain.some(b=>!b))return;chains.set(key,chain);
 }
 const [upper,lower,end]=chain;upper.parent.updateWorldMatrix(true,false);
 // Solve in the limb parent's metric. The widened model has non-uniform
 // scale; decomposed world quaternions cannot represent that sheared frame.
 const frame=upper.parent.matrixWorld.clone(),inverse=frame.clone().invert();
 const start=upper.getWorldPosition(V()).applyMatrix4(inverse),middle=lower.getWorldPosition(V()).applyMatrix4(inverse),tip=end.getWorldPosition(V()).applyMatrix4(inverse);
 const goal=target.clone().applyMatrix4(inverse),bend=pole.clone().applyMatrix4(inverse).sub(start),direction=goal.sub(start);
 const a=start.distanceTo(middle),b=middle.distanceTo(tip),distance=T.MathUtils.clamp(direction.length(),Math.abs(a-b)+1e-5,a+b-1e-5);
 direction.normalize();bend.addScaledVector(direction,-bend.dot(direction));
 if(bend.lengthSq()<1e-10){bend.copy(middle).sub(start).addScaledVector(direction,-middle.clone().sub(start).dot(direction));}
 if(bend.lengthSq()<1e-10)bend.crossVectors(direction,Math.abs(direction.y)<.9?Y:X);
 bend.normalize();const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 const elbow=start.clone().addScaledVector(direction,along).addScaledVector(bend,height).applyMatrix4(frame);
 const wrist=start.clone().addScaledVector(direction,distance).applyMatrix4(frame);
 const orient=(joint,child,point)=>{
  joint.parent.updateWorldMatrix(true,false);const local=joint.parent.matrixWorld.clone().invert();
  const origin=joint.position,from=child.getWorldPosition(V()).applyMatrix4(local).sub(origin).normalize(),to=point.clone().applyMatrix4(local).sub(origin).normalize();
  const q=new T.Quaternion().setFromUnitVectors(from,to).multiply(joint.quaternion).normalize();
  actor.combatAdjustments.push({bone:joint,rotation:joint.quaternion.clone()});joint.quaternion.slerp(q,weight);
 };
 orient(upper,lower,elbow);orient(lower,end,wrist);upper.updateWorldMatrix(true,true);
}
const hand=(x,y,z,dx,dy,dz)=>[x,y,z,dx,dy,dz];
const R=hand(1.35,2.14,-.42,.93,.34,-.12),L=hand(-1.32,2.20,-.40,-.91,.39,-.10);
// Actor-local key poses. Foot coordinates are independent of the pelvis, so a
// turn or a crouch does not rotate the feet through the ground. Yaw is distributed
// between pelvis/chest, with blade paths authored independently from contact time.
const pose=(r=R,l=L,yaw=0,lean=.07,hip=2.42,z=0,feet=[.48,-.12,0,-.48,.16,0],roll=0)=>({r,l,body:[yaw,lean,roll,hip,z],feet});
const ready=pose(R,L,.06,.12,2.35,-.02,[.52,-.20,0,-.50,.22,0]);
const splitGuard=pose(hand(1.54,1.98,-.43,.94,.12,-.26),hand(-1.51,1.85,-.40,-.96,-.17,-.21),
 -.16,.25,2.20,-.08,[.62,-.30,0,-.58,.32,0]);
const turningGuard=pose(hand(1.28,2.11,-.44,.97,.13,-.18),hand(-1.10,2.15,-.57,.08,.73,-.68),
 .01,.18,2.26,-.02,[.54,-.12,0,-.52,.12,0],-.01);
const rightDraw=pose(hand(-.24,3.52,.10,-.91,.35,.20),hand(-1.18,2.70,-.34,-.8,.6,-.1),.52,.12,2.33,.12,[.51,.24,0,-.53,-.37,0]);
const rightAcross=pose(hand(.35,2.82,-1.18,.10,.12,-1),hand(-1.06,3.12,-.14,-.3,.95,.10),-.12,.20,2.31,-.10,[.51,-.31,.10,-.53,.10,0]);
const rightEnd=pose(hand(1.40,2.16,-.24,.95,-.15,.28),hand(-.80,3.30,-.26,-.23,.96,.12),-.64,.28,2.25,-.13,[.51,-.48,0,-.53,.27,0],-.06);
const leftDraw=pose(hand(1.15,2.88,-.34,.65,.76,-.05),hand(.24,3.51,.1,.91,.35,.20),-.55,.12,2.31,.06,[.53,-.29,0,-.51,.20,0]);
const leftAcross=pose(hand(.94,3.20,-.16,.25,.96,.1),hand(-.32,2.82,-1.18,-.1,.12,-1),.12,.24,2.29,-.10,[.53,.07,0,-.51,-.31,.1]);
const leftEnd=pose(hand(.74,3.27,-.16,.21,.97,.08),hand(-1.40,2.15,-.25,-.95,-.15,.28),.63,.30,2.25,-.13,[.53,.27,0,-.51,-.49,0],.06);
const overhead=pose(hand(.84,4.20,.10,.10,.5,.85),hand(-1.12,2.85,-.28,-.75,.65,.05),.72,-.12,2.52,.03,[.52,.25,0,-.52,-.31,0]);
const downPassing=pose(hand(.45,3.12,-1.08,.12,.40,-.91),hand(-1.04,3.10,-.16,-.4,.90,.1),-.05,.24,2.30,-.20,[.51,-.47,.08,-.52,.24,0]);
const downEnd=pose(hand(.43,1.34,-1.16,.13,-.45,-.88),hand(-.85,2.84,-.32,-.5,.85,.08),-.62,.64,1.98,-.27,[.51,-.67,0,-.52,.43,0],-.10);
const bothHigh=pose(hand(.80,4.10,.06,.12,.38,.92),hand(-.80,4.10,.06,-.12,.38,.92),0,-.12,2.44,.05,[.55,.0,0,-.55,.14,0]);
const bothPassing=pose(hand(.55,3.05,-1.02,.18,.33,-.93),hand(-.55,3.05,-1.02,-.18,.33,-.93),0,.34,2.13,-.18,[.62,-.28,.05,-.62,.27,.05]);
const bothLow=pose(hand(.57,1.13,-1.02,.3,-.54,-.88),hand(-.57,1.13,-1.02,-.3,-.54,-.88),0,.82,1.52,-.25,[.65,-.58,0,-.65,.28,0]);
const crossed=pose(hand(-.32,2.92,-.86,-.58,.76,-.28),hand(.32,2.92,-.86,.58,.76,-.28),0,.34,2.20,-.15,[.55,-.37,0,-.55,.24,0]);
const open=pose(hand(1.43,1.82,-.45,.96,-.17,-.20),hand(-1.43,1.82,-.45,-.96,-.17,-.20),0,.47,2.01,-.2,[.68,-.42,0,-.68,.21,0]);
const low=pose(hand(.66,1.12,-.6,.24,-.4,-.88),hand(-.66,1.12,-.6,-.24,-.4,-.88),0,.67,1.83,-.17,[.61,-.49,0,-.61,.30,0]);
// Primary 46.48–47.02: the cutting edge passes in front of the waist
// as he straightens after the final landing, then opens back to guard.
const longRecovery=[
 [0,low],
 [.16,pose(hand(.91,2.02,-.78,-.85,-.16,-.50),hand(-.97,2.10,-.53,-.88,.07,-.46),
   .32,.31,2.09,-.09,[.63,-.43,0,-.60,.32,0])],
 [.36,pose(hand(1.31,2.14,-.68,-.36,-.12,-.93),hand(-1.30,2.18,-.48,-.95,.15,-.27),
   .17,.17,2.25,-.05,[.58,-.31,0,-.56,.28,0])],
 [.54,ready]
];
const rising=pose(hand(.63,3.1,-.9,.18,.46,-.87),hand(-.63,3.1,-.9,-.18,.46,-.87),0,.15,2.27,-.15,[.58,-.43,0,-.58,.33,0]);
const raised=pose(hand(.69,4.13,-.1,.17,.97,.20),hand(-.69,4.13,-.1,-.17,.97,.20),0,-.18,2.54,-.05,[.56,-.29,0,-.56,.31,0]);
const thrustDraw=pose(hand(1.06,2.80,.39,.05,.03,-1),L,.57,.12,2.35,.12,[.51,.27,0,-.51,-.37,0]);
const thrust=pose(hand(.54,2.4,-1.35,.03,-.04,-1),hand(-1.03,2.9,-.3,-.6,.8,0),-.52,.34,2.23,-.18,[.51,-.62,0,-.51,.37,0]);

const clone=p=>({r:[...p.r],l:[...p.l],body:[...p.body],feet:[...p.feet],turn:p.turn||0,hipPitch:p.hipPitch||0});
// In the close phase-two sequence he presents the sole to the player while
// balancing on the left leg. The fast extension ends at the combat contact.
function rightHeel(p,t,contact,height){
 const s=t-contact;
 const lift=smooth(s,-.69,-.30)*(1-smooth(s,-.14,0));
 const reach=smooth(s,-.64,-.30)*(1-smooth(s,.10,.52));
 p.feet[0]=lerp(p.feet[0],.60,reach);
 p.feet[1]=lerp(p.feet[1],-.87-.35*lift,reach);
 p.feet[2]=lerp(p.feet[2],height*lift,reach);
 p.rightToeUp=1.22*lift;
 p.shift=(p.shift||0)-.22*lift;
 p.body[3]+=.11*lift-.18*smooth(s,-.13,0)*(1-smooth(s,.09,.43));
 p.body[1]-=.15*lift;
 p.body[2]+=.10*lift;
}
function track(action){
 const m=MOVES[action];if(!m)return null;
 const keys=[[0,ready]];
 const hands={r:[[0,...R]],l:[[0,...L]]};
 const add=(t,p)=>keys.push([Math.max(0,t),p]);
 // Timed sequence geometry is sourced from primary 23.95-26.65, 27.4-33.5,
 // 43.5-50.5, 79-84.5, 85-89, and 99-107 seconds. Contact parameters are shared
 // with combat; no timeline or scoring timestamp controls an animation.
 let last=0;
 for(const c of m.contacts){
  if(c.area){
   if(c.style==='stomp'){
    const lift=clone(ready);lift.body=[-.16,-.04,0,2.48,.1];lift.feet=[.5,.08,0,-.5,-.38,.8];
    lift.r=[.90,3.30,-.18,.2,.96,0];lift.l=[-.97,3.24,-.25,-.25,.96,0];
    const plant=clone(lift);plant.body=[.12,.22,0,2.15,-.08];plant.feet=[.5,.18,0,-.5,-.5,0];
    add(c.t-.55,lift);add(c.t-.12,lift);add(c.t,plant);last=c.t;
    // Hands have their own tracks. Carry the raised guard into those tracks,
    // otherwise the leg stomps while both swords stay in the idle pose.
    for(const side of ['r','l'])hands[side].push([c.t-.55,...lift[side]],[c.t-.12,...lift[side]],[c.t,...plant[side]],[c.t+.48,...plant[side]]);
   }else if(c.style==='quake'){
    const hold=clone(keys.at(-1)[1]);add(c.t+.10,hold);last=c.t+.10;
    for(const side of ['r','l'])hands[side].push([c.t+.10,...hold[side]]);
   }continue;
  }
  let wind,pass,end;
  if(c.style==='down'){[wind,pass,end]=c.hand?[overhead,downPassing,downEnd]:[bothHigh,bothPassing,bothLow];}
  else if(c.style==='up'){[wind,pass,end]=[low,rising,raised];}
  else if(c.style==='cross'){[wind,pass,end]=[crossed,crossed,open];}
  else if(c.style==='thrust'){[wind,pass,end]=[thrustDraw,thrust,thrust];}
  else [wind,pass,end]=c.hand===-1?[leftDraw,leftAcross,leftEnd]:[rightDraw,rightAcross,rightEnd];
  if(action==='risingSlash'&&c===m.contacts[0]){
   // Both edges open out before the shoulders turn and carry them overhead.
   // The forward cut crosses the player's shoulder on the first contact.
   const spread=pose(hand(1.40,2.86,-.22,.71,.69,-.12),hand(-1.38,2.91,-.25,-.69,.72,-.05),
     .06,.04,2.44,0,[.57,-.21,0,-.56,.22,0]);
   const gather=pose(hand(1.03,3.94,-.10,.17,.95,.20),hand(-.80,3.85,.17,-.31,.93,.20),
     .39,-.11,2.53,.07,[.57,-.04,0,-.58,.36,0]);
   add(.27,spread);add(.57,gather);
   for(const side of ['r','l'])hands[side].push([.27,...spread[side]],[.57,...gather[side]]);
   wind=pose(hand(.44,4.24,.03,-.27,.97,.01),hand(-.79,3.98,.31,.03,.96,.27),
     .79,-.14,2.53,.09,[.56,.09,0,-.60,.43,0]);
   pass=pose(hand(.95,3.12,-1.11,.58,.55,-.61),hand(-.68,3.20,-.92,.32,.42,-.85),
     -.14,.22,2.28,-.17,[.64,-.43,0,-.55,.30,.05]);
   end=pose(hand(1.20,2.48,-.88,.79,.45,-.40),hand(-.12,2.53,-1.06,.55,-.32,-.77),
     -.78,.46,2.14,-.23,[.68,-.56,0,-.58,.35,0],-.07);
  }
  if(action==='cross'&&c===m.contacts[0]){
   // The first cut is drawn horizontally over the crown (primary 24.75-25.0),
   // with the other blade held low and wide. It is not a chest-level crossing.
   wind=pose(hand(1.38,2.48,-.12,.96,.13,.15),hand(.38,4.18,.08,.97,.08,.25),-.28,.06,2.47,.04,[.54,-.28,0,-.53,.20,0]);
  }
  if(action==='holySweepDown'&&c===m.contacts[0]){
   // Primary 77.8–78.6: the right pommel points down beside the
   // chest while the left fist holds its upright blade near the belt.
   end=clone(end);end.r=[1.11,3.08,-.61,.12,.98,-.12];end.l=[-1.06,2.34,-.54,-.34,.91,-.21];end.body=[-.05,.15,0,2.40,-.07];
  }
  if(c.hand&&(c.style==='sweep'||c.style==='down')){
   const sign=c.hand,key=sign===1?'r':'l',guard=sign===1?'l':'r';
   wind=clone(wind);pass=clone(pass);end=clone(end);
   const lateral=c.style==='sweep';
   wind.body[0]+=sign*(lateral?.26:.14);wind.body[1]-=.09;
   wind[key][2]+=.19;wind[guard][0]-=sign*.12;wind[guard][1]+=.24;
   pass.body[0]-=sign*.15;pass.body[1]+=.16;pass.body[3]-=.13;
   pass[key][2]-=.28;pass.feet[sign===1?1:4]-=.22;
   end.body[0]-=sign*(lateral?.35:.18);end.body[2]+=sign*.14;
   end[key][0]-=sign*(lateral?.23:.10);end[key][1]-=lateral?.20:.31;
   end[guard][2]+=.31;end.feet[sign===1?4:1]+=.29;
  }
  for(const [side,sign]of [['r',1],['l',-1]]){
   const tr=hands[side],prev=tr.at(-1),start=Math.max(prev[0]+.025,c.t-.95),drawAt=Math.max(start+.13,c.t-.48);
   if(c.hand&&c.hand!==sign){
    // The other blade guards above the shoulder while the cutting arm moves.
    // Preserve an ongoing cut; only add guard keys after its own follow-through.
    if(prev[0]<c.t-.22)tr.push([Math.max(prev[0]+.06,c.t-.48),...wind[side]],[c.t+.07,...end[side]]);
    continue;
   }
   if(start<c.t-.37)tr.push([start,...prev.slice(1)]);
   tr.push([Math.min(c.t-.18,drawAt),...wind[side]],[c.t-.17,...wind[side]],[c.t-.065,...pass[side]],[c.t+.07,...end[side]]);
   if(c.hand===sign&&c.style==='sweep'){
    // The heavy edge travels past the hit before the elbow settles. Continue
    // in the cut direction while the other hand prepares its next strike.
    const settle=end[side].slice();settle[0]+=sign*.13;settle[1]-=.09;settle[2]+=.13;
    const axis=V(...settle.slice(3)).applyAxisAngle(Y,-sign*.115).normalize();
    tr.push([c.t+.19,...settle.slice(0,3),...axis.toArray()]);
   }
  }
  const available=c.t-last;
  const draw=action==='risingSlash'&&c===m.contacts[0]?c.t-.63:Math.max(last+.035,c.t-Math.min(1.12,available*.70));
  const release=Math.max(draw+.04,c.t-Math.min(.26,available*.36));
  add(draw,wind);add(release,wind);
  add(c.t-.065,pass);add(c.t+.07,end);
  last=c.t+.07;
 }
 if(action==='promised'){
  const hold=clone(rightEnd);hold.r=[.78,3.58,-.45,.10,.99,.03];hold.body=[-.22,.13,0,2.37,-.04];
  add(1.53,hold);add(2.10,hold);
  // The blade held above the shoulder must also be present in the independent
  // hand track; body-only keys were being overwritten by the sampled hands.
  hands.r.push([1.53,...hold.r],[2.10,...hold.r]);
 }
 const delayedQuake=m.contacts.some(c=>c.style==='quake');
 if(m.duration-last>.4){const finalPose=keys.reduce((a,b)=>a[0]>b[0]?a:b)[1];add(last+(delayedQuake?.04:.24),finalPose);add(m.duration,ready);}
 keys.sort((a,b)=>a[0]-b[0]);
 for(const k of keys)k[1]=clone(k[1]);
 // Carry sword-face orientation along its path; rebuilding a perpendicular
 // basis each frame causes 180-degree roll flips at vertical/horizontal poles.
 for(const side of ['r','l']){let direction=null,rotation=null;
  for(const [,p]of keys){const d=V(...p[side].slice(3)).normalize();
   const q=bladeFrame(p[side]);
   p[side+'Q']=q.clone();rotation=q;direction=d;
  }
 }
 for(const side of ['r','l']){
  const tr=hands[side];tr.sort((a,b)=>a[0]-b[0]);const last=tr.at(-1);tr.push([Math.min(m.duration,last[0]+(delayedQuake?.04:.28)),...last.slice(1)],[m.duration,...ready[side]]);tr.sort((a,b)=>a[0]-b[0]);
  let previousDirection=null,previousRotation=null;
  for(const k of tr){const d=V(...k.slice(4,7)).normalize(),q=bladeFrame(k.slice(1));k.q=q;previousRotation=q;previousDirection=d;}
 }
 const sampleHand=(tr,t)=>{
  let i=0;while(i<tr.length-2&&t>tr[i+1][0])i++;
  const a=tr[i],b=tr[i+1],u=T.MathUtils.clamp((t-a[0])/Math.max(.001,b[0]-a[0]),0,1);
  const value=k=>{
   const prev=tr[Math.max(0,i-1)],next=tr[Math.min(tr.length-1,i+2)],dt=b[0]-a[0],slope=(b[k]-a[k])/Math.max(.001,dt);
   const tangent=(x,y)=>x*y<=0?0:Math.sign(slope)*Math.min(Math.abs((x+y)/2),Math.abs(slope)*2);
   const left=i===0?0:tangent((a[k]-prev[k])/Math.max(.001,a[0]-prev[0]),slope),right=i+2>=tr.length?0:tangent(slope,(next[k]-b[k])/Math.max(.001,next[0]-b[0]));
   return (2*u*u*u-3*u*u+1)*a[k]+(u*u*u-2*u*u+u)*dt*left+(-2*u*u*u+3*u*u)*b[k]+(u*u*u-u*u)*dt*right;
  };
  const q=a.q.clone().slerp(b.q,u),direction=Y.clone().applyQuaternion(q);return {values:[value(1),value(2),value(3),...direction.toArray()],q};
 };
 const output=[];
 for(let i=0;i<=Math.ceil(m.duration*60);i++){
  const t=Math.min(m.duration,i/60),p=sample(keys,t);
  for(const side of ['r','l']){const s=sampleHand(hands[side],t);p[side]=s.values;p[side+'Q']=s.q;}
  output.push([t,p]);
 }output.linear=true;return output;
}
const tracks=new Map();
function sample(keys,t){
 let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
 const [ta,a]=keys[i],[tb,b]=keys[i+1],u=T.MathUtils.clamp((t-ta)/Math.max(.001,tb-ta),0,1),s=keys.linear?u:u*u*(3-2*u);
 const p={};for(const k of ['r','l','body','feet'])p[k]=a[k].map((v,j)=>lerp(v,b[k][j],s));
 if(!keys.linear){
  // Keep torso momentum through a passing cut. Identical anticipation/hold
  // keys still have zero tangents, instead of stopping at every strike key.
  const prev=keys[Math.max(0,i-1)],next=keys[Math.min(keys.length-1,i+2)],span=tb-ta;
  p.body=a.body.map((v,j)=>{
   const slope=(b.body[j]-v)/Math.max(.001,span),left=(v-prev[1].body[j])/Math.max(.001,ta-prev[0]),right=(next[1].body[j]-b.body[j])/Math.max(.001,next[0]-tb);
   const tangent=x=>x*slope<=0?0:Math.sign(slope)*Math.min(Math.abs((x+slope)*.5),Math.abs(slope)*2);
   return (2*u*u*u-3*u*u+1)*v+(u*u*u-2*u*u+u)*span*tangent(left)+(-2*u*u*u+3*u*u)*b.body[j]+(u*u*u-u*u)*span*tangent(right);
  });
 }
 for(const k of ['r','l'])p[k+'Q']=(a[k+'Q']||bladeFrame(a[k])).clone().slerp(b[k+'Q']||bladeFrame(b[k]),s);
 return p;
}
// Broken stance (primary 33.6-37.9 s; zoomed frames at clip 29.75, 30.35, 31.25 and 32.60 s). A wide lunge: the
// left boot planted ahead with an upright shin, the right leg trailing, the back level so the helm hangs about
// two metres ahead of the hips and above the head of the attacker. The right blade is laid out across the floor
// ahead and to his right; the left lies across the front of the stance.
const BOW_FEET=[.74,1.02,0,-.66,-.78,0];
function bowedStance(depth=0){
 const p=pose(hand(1.04,1.02-.10*depth,-1.34,.44,-.26,-.86),hand(-.54,.86-.08*depth,-1.18,.97,-.20,-.12),.10,.66+.10*depth,1.64-.10*depth,.36,BOW_FEET,-.05);
 p.hipPitch=.95+.06*depth;return p;
}
function criticalPose(state){
 const t=state.postCritical!=null?4.7+state.postCritical:state.bossAction==='critical'?state.bossElapsed:-1;
 const bowed=bowedStance(0);
 if(t<0)return bowed;
 const entry=RIPOSTE_SEQUENCE.entry,release=RIPOSTE_SEQUENCE.release;
 // The thrust jolts the chest up off the blade; he sags on to it while it is held (36.2-37.9 s).
 const stabbed=bowedStance(-.9);stabbed.body[0]=-.06;stabbed.r[1]+=.22;stabbed.l[1]+=.16;
 const sag=bowedStance(.7),held=bowedStance(.9);held.body[0]=.16;
 const brace=bowedStance(.2);brace.body[0]=.02;
 // 38.0-38.5 s: the blade is torn out sideways. Chest and both arms are thrown up, the body twists away,
 // and he stumbles back before gathering a low guard with the blades crossing in front (38.9-39.6 s).
 const wrench=bowedStance(-.5);wrench.body[0]=-.34;wrench.body[2]=-.16;wrench.r=[1.30,1.70,-1.02,.62,.20,-.76];wrench.l=[-.72,1.40,-.92,.82,.10,-.56];
 const recoil=pose(hand(1.58,3.36,.16,.60,.76,.26),hand(-1.48,2.62,.40,-.80,.34,.50),-.56,-.34,2.34,.24,[.70,.60,0,-.64,-.30,0],-.20);
 const stumble=pose(hand(1.42,2.02,-.38,.88,-.06,-.47),hand(-1.18,1.88,-.20,-.66,-.18,-.73),-.30,.30,2.04,.10,[.68,.42,0,-.62,-.36,0],-.08);
 const guard=pose(hand(.92,1.62,-.98,-.34,-.10,-.93),hand(-.90,1.78,-.92,.36,-.08,-.93),-.08,.52,1.84,-.06,[.66,.37,0,-.60,-.44,0],-.03);
 const unmounted=state.phase===1;
 if(unmounted){
  // After the blade comes out, the trailing knee stays folded and both tips pass low across the player.
  recoil.r=[1.38,2.05,-.66,.62,.15,-.78];recoil.l=[-.82,1.52,-.92,.86,.06,-.49];
  recoil.body=[-.58,.65,-.17,1.65,.12];
  stumble.r=[1.28,1.35,-.97,.43,-.15,-.89];stumble.l=[-.71,1.24,-.85,.96,-.09,-.27];
  stumble.body=[-.38,.69,-.13,1.58,.16];
  guard.r=[1.26,1.44,-.74,.49,-.10,-.87];guard.l=[-.76,1.51,-.84,.92,.04,-.39];
  guard.body=[-.26,.61,-.12,1.68,.11];
 }
 let rise=[[5.18,guard],[5.4,ready]];
 if(unmounted){
  // At clip 36.10 both blades still lie across his right knee. The right
  // arm opens first; the left point passes toward the camera at 36.45.
  const across=pose(hand(1.16,1.75,-.77,.94,-.16,-.31),hand(-.62,1.93,-.92,.93,.06,-.36),
   -.22,.43,1.87,.08,[.62,.20,0,-.56,-.34,0],-.07);
  const opening=pose(hand(1.28,1.98,-.53,.98,.05,-.18),hand(-.94,2.02,-.80,.30,.10,-.95),
   -.11,.27,2.09,.02,[.58,.06,0,-.53,-.17,0],-.04);
  rise=[[4.53,guard],[5.07,across],[5.28,opening],[5.40,turningGuard],[5.57,ready]];
 }
 // Leave one hand planted as the sword comes free. The other arm rises
 // over the leading knee before both weapons return to the low guard.
 for(const beat of [stabbed,sag,held,brace]){
  beat.body[0]+=.20;
  beat.body[2]+=.13;
  beat.l=[-1.19,.53,-.95,-.95,.05,.31];
  beat.r=[1.31,.89,-.83,.74,-.26,-.62];
 }
 recoil.r=[1.33,2.60,-.50,.65,.65,-.39];
 recoil.l=[-1.22,1.04,-.67,-.83,-.19,.52];
 recoil.body[2]-=.24;
 const p=sample([[0,bowed],[entry-.12,bowed],[entry+.07,stabbed],[entry+.48,sag],[release-.42,held],[release-.16,brace],[release+.03,wrench],[release+.30,recoil],[release+.70,stumble],[release+1.18,guard],...rise],t);
 // The jolt of each wound lifts the pelvis with the chest; the tilt is gone once he is thrown upright.
 const jolt=smooth(t,entry-.10,entry+.07)*(1-smooth(t,entry+.10,entry+.50));
 p.hipPitch=(bowed.hipPitch-.16*jolt+.05*smooth(t,entry+.3,release-.4))*(1-smooth(t,release-.02,release+.28));
 p.turn=.62*smooth(t,release+.02,release+.34)*(1-smooth(t,release+.62,release+1.20));
 if(unmounted){
  const braceWeight=smooth(t,release-.08,release+.26)*(1-smooth(t,4.46,5.4));
  p.hipPitch+=.54*braceWeight;p.turn+=.25*braceWeight;
  // Pull the hands back outside the shoulders before returning to a low guard.
  const clear=smooth(t,release-.10,release+.23)*(1-smooth(t,release+.97,release+1.73));
  if(clear>0){
   const shapes={r:[1.49,2.42,.30,.37,.79,.49],l:[-1.42,1.52,.26,-.78,.13,.61]};
   for(const k of ['r','l']){
    const target=shapes[k],original=(p[k+'Q']||bladeFrame(p[k])).clone();
    p[k+'Q']=original.slerp(bladeFrame(target),clear);
    for(let i=0;i<3;i++)p[k][i]=lerp(p[k][i],target[i],clear);
   }
  }
 }
 if(t>=release&&t<=release+1.10){
  // Two strides carry the feet back with the root; each boot is planted before the body passes it.
  const back=CRITICAL_RETREAT*smooth(t,release+.03,release+.75),right=smooth(t,release+.06,release+.42),left=smooth(t,release+.36,release+.82);
  p.feet=[lerp(.74,.66,right),lerp(1.02,1.02+CRITICAL_RETREAT*.75,right)-back,Math.sin(right*Math.PI)*.34,lerp(-.66,-.60,left),lerp(-.78,-.78+CRITICAL_RETREAT*1.13,left)-back,Math.sin(left*Math.PI)*.26];
 }
 return p;
}
// Leg cycle of the reel after a guard-breaking parry: each boot stays where it stands while the root is carried
// back, then is snatched after the body. Returns the six foot values of a pose.
function reelFeet(t,from){
 const travel=parryReel,T0=PARRY_REEL.time;
 const cycle=(z0,steps)=>{
  let z=z0,at=0;
  for(const [a,b,land] of steps){
   if(t<=a)break;
   z-=travel(a)-travel(at);at=a;
   if(t<b){const u=(t-a)/(b-a),s=u*u*(3-2*u);return [z+(land-z)*s,Math.sin(Math.PI*u)*.36];}
   z=land;at=b;
  }
  return [z-(travel(Math.max(t,at))-travel(at)),0];
 };
 const u=smooth(t,0,T0),final=BOW_FEET;
 // right: back at once, then a second gathering step; left: dragged, then set down ahead of the hips.
 const right=cycle(from[1],[[.04,.22,.92],[.38,.585,final[1]+.01]]),left=cycle(from[4],[[.20,.40,final[4]+(travel(T0)-travel(.40))]]);
 return [lerp(from[0],final[0],u),right[0],right[1],lerp(from[3],final[3],u),left[0],left[1]];
}

// Mounted first crossing. The far blade clears the helm while the near
// blade traverses the front of the player, before the guard is deflected.
function mountedCross(t){
 const gather=pose(hand(1.02,2.23,-.44,.71,.23,-.67),hand(-.84,2.04,-.86,.92,.02,-.39),
   .34,.30,2.16,-.09,[.65,-.25,0,-.57,.26,0]);
 const openGuard=pose(hand(1.57,2.86,-.33,.73,.65,-.20),hand(-1.53,2.96,-.32,-.72,.67,-.18),
   -.14,-.22,2.39,.09,[.60,-.29,0,-.59,.35,0]);
 const spread=pose(hand(1.65,3.01,-.21,.65,.75,.09),hand(-1.62,2.94,-.29,-.68,.72,-.13),
   -.20,-.28,2.40,.12,[.64,-.28,0,-.58,.39,0],-.07);
 const nearCut=pose(hand(.64,3.94,-.49,-.31,.93,-.19),hand(-1.09,2.32,-1.02,-.92,.04,-.39),
   -.40,.20,2.28,-.12,[.61,-.46,0,-.66,.30,0],-.09);
 const overHelm=pose(hand(.39,3.88,-.34,-.45,.84,-.29),hand(-1.14,2.78,-.86,-.70,.62,-.35),
   -.59,.50,1.95,-.15,[.64,-.55,0,-.62,.34,0],-.13);
 const follow=pose(hand(.68,3.93,-.24,-.36,.91,.19),hand(-1.53,2.12,-.68,-.93,-.08,-.35),
   -.78,.33,2.18,-.22,[.67,-.59,0,-.57,.43,0],-.08);
 return sample([[0,gather],[.29,openGuard],[.66,spread],[.83,spread],[1.04,nearCut],[1.23,overHelm],[1.49,follow]],t);
}
function deflectionPose(state){
 const hit=state.deflection;
 if(!hit||state.bossAction!=='recover')return null;
 if(!tracks.has(hit.action))tracks.set(hit.action,track(hit.action));
 const source=tracks.get(hit.action);
 const mounted=state.phase===2&&hit.action==='cross'&&hit.hand===-1&&hit.elapsed<=1.53;
 const contact=mounted?mountedCross(hit.elapsed):source?sample(source,hit.elapsed):clone(ready);
 if(mounted&&!state.critical){
   const spread=pose(hand(1.48,2.94,-.39,.98,.12,-.13),hand(-1.53,2.14,-.61,-.96,-.07,-.26),
     -.20,.21,2.20,-.09,[.67,-.31,0,-.59,.39,0],-.07);
   if(state.crossFromRiposte)return sample([[0,contact],[.17,spread],[.53,splitGuard],[1.18,splitGuard]],state.bossElapsed||0);
   return sample([[0,contact],[.26,contact],[.61,spread],[.96,spread],[1.18,ready]],state.bossElapsed||0);
 }
 // The struck blade recoils while the other hand keeps its guard. The source
 // does not raise both wrists above the shoulders after every deflection.
 const side=hit.hand===-1?'l':'r',other=side==='r'?'l':'r',sign=side==='r'?1:-1;
 const guard=clone(ready);guard.body=[-.27*sign,-.12,-.05*sign,2.40,.10];
 guard[side]=[sign*1.28,3.04,-.12,sign*.65,.74,.14];
 guard[other]=[...ready[other]];guard[other][1]+=.10;
 const settle=clone(ready);settle.body=[-.12*sign,.19,.025*sign,2.29,-.06];
 settle[side]=[sign*1.23,2.54,-.32,sign*.72,.67,-.12];
 const t=state.bossElapsed||0;
 // The paired rising cut is levered open at both wrists. The source's
 // 41.8–42.8 response goes from an arched chest to a forward brace over
 // one knee. Keep that response through the recovery step after stun ends.
 if(hit.hand===0&&!state.critical){
   const thrown=pose(hand(1.02,4.04,-.28,.24,.94,-.24),hand(-1.08,2.14,-.55,-.94,-.10,-.34),
     -.68,-.16,2.35,.10,[.55,.19,.08,-.63,.34,0],-.30);
   const brace=pose(hand(1.44,2.11,-.65,.92,.22,-.30),hand(-1.55,1.71,-.31,-.96,-.15,.07),
     -.72,.64,1.89,-.23,[.71,-.48,0,-.56,.57,0],.21);
   const recover=clone(brace);recover.body[1]=.48;recover.body[3]=2.01;recover.r[1]+=.13;
   const p=sample([[0,contact],[.17,thrown],[.30,thrown],[.60,brace],[.96,recover],[1.18,ready]],t);
   p.turn=-.64*smooth(t,.07,.48)*(1-smooth(t,.81,1.18));
   return p;
 }
 if(state.critical){
  // Primary 33.0-34.1 (clip 28.95-30.05): the broken guard throws both blades up and wide and arches the chest
  // (0-0.15 s); he is carried back upright with the arms still high (0.15-0.5 s), then pitches forward over the
  // planted left boot while the right blade swings down across the floor (0.55-0.9 s) and stays bowed.
  const thrown=pose(hand(1.70,3.74,.30,.50,.80,.34),hand(-1.76,3.22,.26,-.84,.46,.28),-.10,-.40,2.50,.20,contact.feet,-.05);
  const carried=pose(hand(1.64,3.58,.50,.62,.70,.36),hand(-1.72,3.06,.48,-.88,.36,.30),.04,-.46,2.42,.30,contact.feet,.04);
  const caught=pose(hand(1.56,2.92,.16,.78,.36,-.50),hand(-1.60,2.50,.20,-.86,.06,-.50),.10,-.06,2.24,.36,contact.feet,.02);
  const folding=pose(hand(1.26,1.74,-.96,.58,-.06,-.81),hand(-.86,1.42,-.94,.72,-.14,-.68),.12,.84,2.00,.36,contact.feet,-.03);
  const bowed=bowedStance(0),deep=bowedStance(1),settled=bowedStance(.35);
  const longBreak=state.phase===1&&hit.action==='long';
  let keys=[[0,contact],[.12,thrown],[.34,carried],[.54,caught],[.72,folding],[.92,deep],[1.30,bowed],[2.10,settled],[3.2,bowed]];
  if(longBreak){
    // At 29.27 the camera looks along the nearer curved edge. The far blade
    // is still upright. The shoulders reverse before the second wrist drops.
    const open=pose(hand(1.78,3.59,.04,.36,.80,.61),hand(-1.72,3.47,-.25,-.44,.81,-.38),
      -.43,-.51,2.42,.22,contact.feet,-.13);
    const crest=pose(hand(1.78,3.51,.17,.12,.76,.64),hand(-1.75,3.50,-.18,-.15,.98,-.06),
      -.52,-.50,2.43,.31,contact.feet,-.22);
    const trailing=pose(hand(1.41,3.36,-.20,.49,.81,.32),hand(-1.54,2.66,-.73,-.89,.24,-.38),
      -.30,.39,2.03,.12,contact.feet,-.28);
    keys=[[0,contact],[.13,thrown],[.32,open],[.60,crest],[.83,trailing],
      [1.05,folding],[1.19,deep],[1.47,bowed],[2.10,settled],[3.2,bowed]];
  }
  const p=sample(keys,t);
  const tuck=longBreak?smooth(t,.76,1.18):smooth(t,.56,.92);
  p.hipPitch=bowed.hipPitch*(tuck+.07*tuck*(1-smooth(t,1.18,1.45)));
  if(t<PARRY_REEL.time+.02)p.feet=reelFeet(t,contact.feet);else p.feet=[...BOW_FEET];
  // Laboured breathing while he is open.
  const breath=smooth(t,1.2,1.8)*Math.sin((t-1.2)*2.6);p.body[1]+=.035*breath;p.body[3]+=.03*breath;
  return p;
 }
 const p=sample([[0,contact],[.15,guard],[.29,guard],[.64,settle],[1.10,ready],[1.18,ready]],t);
 p.turn=-sign*.37*smooth(t,.02,.25)*(1-smooth(t,.49,1.10));
 p.feet[sign>0?1:4]+=.26*smooth(t,0,.27)*(1-smooth(t,.56,1.1));return p;
}

export function bossChainTurn(action,t,phase=1,targetYawOffset=0){
 if(action==='risingSlash'){
  const coil=.88*smooth(t,.42,1.14);
  const cut=2.56*smooth(t,1.22,1.86);
  const follow=.58*smooth(t,1.78,2.07);
  return {angle:(coil-cut-follow)*(1-smooth(t,2.10,2.90)),lift:[0,0]};
 }
 if(action==='rocks'){
  // Keep the back visible through the first-phase rake. Turn back toward
  // the opponent in the air, after the hips have followed the swords.
  const second=phase===2;
  const lift=second?ROCK_SEQUENCE.rise-.08:ROCK_SEQUENCE.liftOff;
  const cast=t+(second?ROCK_SEQUENCE.phaseTwoSweep:0);
  const sweep=smooth(t,second?.17:.98,second?.73:1.57);
  const plant=smooth(t,second?.73:1.57,second?1.15:1.97);
  const push=smooth(t,second?1.38:2.12,lift);
  const launchProfile=smooth(t,2.02,lift-.06)*(1-smooth(t,lift+.08,lift+.48));
  const ground=second?-1.35*sweep-1.13*plant+1.54*push:
   -2.88*smooth(t,.99,1.72)-.12*smooth(t,1.48,2.09)+1.64*push+.94*launchProfile;
  const airborne=-.70+.78*smooth(cast,5.55,6.16)-.08*smooth(cast,6.46,7.12);
  const hoverYaw=targetYawOffset+airborne;
  // Finish facing back towards the player after leaving the furrow.
  const delta=Math.atan2(Math.sin(hoverYaw-ground),Math.cos(hoverYaw-ground));
  const reorient=smooth(t,lift+.03,lift+.82);
  return {angle:ground+reorient*delta,
    lift:[.11*Math.sin(sweep*Math.PI),0]};
 }
 if(['sweepDown','holySweepDown','double'].includes(action)){
  const c=MOVES[action].contacts,down=c.find(c=>c.style==='down');
  const pivot=-.70*smooth(t,c[0].t-.55,c[0].t-.18)*(1-smooth(t,c[0].t+.07,c[0].t+.43));
  // The mounted overhead retains a three-quarter chest view as the fist
  // rises. A full quarter-turn here presents Miquella's back to the camera.
  const drawAngle=action==='holySweepDown'?.52:1.68;
  const draw=down?drawAngle*smooth(t,down.t-.85,down.t-.38)*(1-smooth(t,down.t-.16,down.t+.10)):0;
  return {angle:pivot+draw,lift:[Math.sin(Math.PI*smooth(t,c[0].t-.65,c[0].t-.12))*.15,down?Math.sin(Math.PI*smooth(t,down.t-.72,down.t-.18))*.18:0]};
 }
 if(action==='cross'){
  const keys=[[0,0],[.88,-.45],[1.27,-.48],[1.52,.40],[1.85,-.44],[2.18,0],[2.48,.12],[3.4,0]];
  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  return {angle:lerp(keys[i][1],keys[i+1][1],smooth(t,keys[i][0],keys[i+1][0])),lift:[0,0]};
 }
 if(action==='long'){
  // Primary 46-50.5: torso passes through the back view during the two cuts,
  // then unwinds out of the paired jump. This was lost in the new rig path.
  const keys=[[0,0],[2.2,0],[2.95,0],[3.35,.8],[3.72,1.25],[3.95,1.8],[4.25,2.55],[4.50,2.6],[4.75,1.2],[5,.1],[5.35,1.2],[5.72,2.05],
    [5.98,2.08],[6.25,3.40],[6.56,4.66],[6.76,5.76],[7.02,7.37],[7.34,7.53],[7.6,Math.PI*2]];
  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  return {angle:lerp(keys[i][1],keys[i+1][1],smooth(t,keys[i][0],keys[i+1][0])),lift:[0,0]};
 }
 if(action!=='promised')return {angle:0,lift:[0,0]};
 // Primary 101.8-104.5: successive passing cuts turn the whole body through
 // the back view. Contact times remain those of the shared move catalog.
 const keys=[[0,0],[2.34,0],[2.71,-.13],[3.15,-.65],[3.66,-3.13],[4.07,-6.12],
   [4.24,-5.60],[4.54,-3.18],[4.96,-.54],[5.44,-1.22],[5.96,-2.04],[6.44,-1.08],
   [6.69,-1.52],[6.93,-1.65],[7.14,-.99],[7.37,-.43],[7.70,-.23],[8.25,0]];
 let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
 const angle=lerp(keys[i][1],keys[i+1][1],smooth(t,keys[i][0],keys[i+1][0]));
 const lift=[0,0];
 for(const [start,end,lead] of [[2.74,4.08,0],[4.08,4.99,1],[5.22,6.04,0]]){
   const u=T.MathUtils.clamp((t-start)/(end-start),0,1);
   lift[lead]+=Math.sin(Math.PI*T.MathUtils.clamp(u/.56,0,1))*.23;
   lift[1-lead]+=Math.sin(Math.PI*T.MathUtils.clamp((u-.49)/.51,0,1))*.19;
 }
 return {angle,lift};
}

function specialPose(state){
 const action=state.bossAction,t=state.bossElapsed||0;
 if(action==='risingSlash'&&t>=1.85){
  if(!tracks.has(action))tracks.set(action,track(action));
  const source=tracks.get(action),impact=MOVES.risingSlash.contacts[1].t;
  const lift=pose(hand(.46,4.35,.09,-.15,.98,.14),hand(-.43,4.27,.20,.06,.96,.26),
   .37,-.22,2.47,.08,[.60,-.19,0,-.55,-.12,.67],-.09);
  const apex=pose(hand(.29,4.44,.07,-.25,.94,.22),hand(-.39,4.40,.12,.21,.93,.28),
   .66,-.41,2.55,.14,[.55,-.26,0,-.53,-.34,.92],-.12);
  return sample([[1.85,sample(source,1.85)],[2.34,lift],[2.53,apex],[impact-.11,apex],
   [impact+.04,sample(source,impact+.04)],[MOVES.risingSlash.duration,sample(source,MOVES.risingSlash.duration)]],t);
 }
 if(action==='uppercut'&&state.phase===1&&t<.57){
  // The hand nearer the cloak lifts past the front of the body, showing its
  // point almost end-on before opening the pair (source 36.53–36.89 s).
  if(!tracks.has(action))tracks.set(action,track(action));
  const upright=pose(hand(1.33,2.14,-.41,.95,.26,-.16),hand(-1.20,2.22,-.48,-.20,.94,-.28),
   .04,.12,2.34,-.02,ready.feet);
  const spread=pose(hand(1.39,2.22,-.35,.85,.50,-.14),hand(-1.29,2.24,-.41,-.76,.63,-.15),
   .06,.08,2.40,.01,ready.feet);
  return sample([[0,turningGuard],[.12,upright],[.34,spread],[.57,sample(tracks.get(action),.57)]],t);
 }
 if(action==='recover'&&state.longTail)return sample(longRecovery,t);
 if(action==='cross'&&state.phase===2&&t<1.74){
  if(t<=1.49)return mountedCross(t);
  if(!tracks.has(action))tracks.set(action,track(action));
  return sample([[1.49,mountedCross(1.49)],[1.74,sample(tracks.get(action),1.74)]],t);
 }
 if(action==='ring'){
  // Primary 65.85â€“68.65: crossed guard; one blade high; a shoulder turn
  // exposes the mantle before the physical sidestep carries him away.
  const guard=pose(hand(1.38,2.02,-.35,.84,-.36,-.24),hand(-1.29,1.85,-.55,-.77,-.37,-.42),.08,.14,2.27,-.03,[.60,-.30,0,-.57,.34,0]);
  const draw=pose(hand(.45,3.12,-.60,-.53,.76,-.33),hand(-.80,2.10,-.59,-.72,-.23,-.40),.36,-.04,2.34,.02,[.60,-.30,0,-.57,.34,0],-.07);
  const raise=pose(hand(.70,3.93,-.24,-.82,.47,-.28),hand(-1.03,1.93,-.60,-.68,-.31,-.60),.69,-.18,2.40,.07,[.57,-.22,0,-.57,.37,0],-.15);
  const launch=pose(hand(1.23,3.20,-.33,.91,.31,-.17),hand(-.82,2.12,-.41,-.75,-.24,-.45),-.60,.28,1.99,-.14,[.56,.01,.28,-.60,.41,.49],.20);
  const trail=clone(launch);trail.l=[-.98,2.54,.12,-.84,.18,.35];trail.feet=[.44,.28,.43,-.54,.70,.59];
  const plant=clone(trail);plant.body=[-.30,.45,.11,1.88,-.08];plant.feet=[.59,-.46,0,-.51,.48,0];
  const p=sample([[0,guard],[.15,guard],[.41,draw],[.81,raise],[1.23,raise],[1.52,launch],[1.97,trail],[2.46,trail],[2.75,plant],[3.16,plant],[3.73,low],[4.4,ready]],t);
  p.turn=-2.05*smooth(t,.27,1.25)*(1-smooth(t,2.75,3.65));
  return p;
 }
 // During the close paired sequence the same body turns under the raised
 // swords. The off-hand stays overhead while the cutting hand crosses the
 // player, then the two swap jobs; the cape and shoulder follow that torso.
 if(action==='promised'&&t<=6.29){
  if(!tracks.has(action))tracks.set(action,track(action));
  const base=tracks.get(action);
  const upright=pose(hand(1.00,3.05,-.58,.14,.98,-.13),hand(-1.07,2.99,-.51,-.11,.98,-.16),
    .06,.16,2.34,-.02,[.59,-.22,0,-.58,.27,0]);
  const gather=pose(hand(.90,3.62,-.29,-.25,.94,.21),hand(-.92,3.58,-.34,.21,.95,.22),
    .29,-.03,2.44,.05,[.58,-.22,0,-.57,.36,0],-.05);
  const crown=pose(hand(.63,4.15,-.19,-.88,.35,-.29),hand(-.69,4.18,-.23,.78,.57,-.25),
    .43,-.18,2.54,.09,[.58,-.28,0,-.62,.35,0],-.11);
  const coil=pose(hand(.43,4.08,-.04,-.94,.16,.29),hand(-.86,4.04,-.32,.71,.66,-.24),
    .77,-.14,2.49,.07,[.56,-.23,0,-.65,.38,0],-.14);
  const crossing=pose(hand(-.22,2.98,-1.09,-.86,-.21,-.46),hand(.28,2.57,-.98,.91,.11,-.40),
    -.24,.32,2.18,-.18,[.64,-.42,0,-.60,.41,0],.09);
  const right=pose(hand(1.53,2.24,-.68,.88,-.20,-.43),hand(-.99,3.63,-.24,-.31,.89,.24),
    -.61,.30,2.15,-.12,[.62,-.46,0,-.61,.34,.16],.08);
  const high=pose(hand(1.16,4.08,-.27,.58,.75,-.31),hand(-1.19,2.27,-.32,-.83,.16,-.49),
    .54,-.17,2.45,.09,[.55,-.19,0,-.60,.39,.11],-.10);
  const heel=pose(hand(1.24,1.60,-.92,.77,-.31,-.55),hand(-.93,2.88,-.24,-.48,.67,.41),
    -.63,.57,1.79,-.19,[.68,-.40,0,-.62,.43,.22],.12);
  const brace=pose(hand(.98,2.55,-.60,.57,.63,-.49),hand(-1.29,1.24,-.54,-.87,-.29,-.40),
    .64,.63,1.73,.02,[.56,-.22,.16,-.70,-.32,0],-.18);
  const gatherJump=pose(hand(.73,3.38,-.41,.28,.92,-.14),hand(-1.31,2.13,-.26,-.86,.30,-.41),
    .32,.37,2.07,-.06,[.52,-.20,.32,-.72,-.35,0],-.07);
  const stampGuard=pose(hand(1.29,3.30,-.30,.30,.93,-.19),hand(-1.25,2.42,-.43,-.08,.99,-.10),
    .16,.01,2.40,.08,[.60,-.28,0,-.58,.32,0]);
  return sample([[0,splitGuard],[.14,splitGuard],[.54,stampGuard],[.82,stampGuard],[.91,upright],[1.63,upright],[2.03,gather],
    [2.37,crown],[2.93,crown],[3.09,coil],[3.30,crossing],[3.52,right],[3.70,right],[3.90,leftEnd],[4.28,leftEnd],[4.68,high],[4.96,high],
    [5.22,downEnd],[5.42,heel],[5.70,leftDraw],[5.95,leftAcross],[6.04,brace],[6.18,gatherJump],[6.29,sample(base,6.29)]],t);
 }
 // The primary 106-107 s landing opens into a low, wide stance with both
 // blades thrown apart. Let the following recovery return continuously to guard.
 if(state.phase===2&&(action==='promised'&&t>7.62||Number.isFinite(state.holyRecover))){
  if(!tracks.has('promised'))tracks.set('promised',track('promised'));
  const planted=sample(tracks.get('promised'),7.62);
  const spread=pose(hand(1.38,2.03,-.95,.96,-.13,-.23),hand(-1.32,2.68,-.67,-.98,.08,-.12),
    -.39,.70,1.65,-.39,[.77,-.73,0,-.60,.49,0],-.19);
  const open=pose(hand(1.32,2.14,-.86,.96,-.12,-.22),hand(-1.36,2.70,-.64,-.98,.08,-.12),
    -.28,.54,1.79,-.30,[.75,-.67,0,-.59,.46,0],-.14);
  // Turn the cutting flats parallel to the terrace while the paired cut settles.
  // This roll belongs to the wrists. Tilting only the blade axis leaves both wide flats facing the player.
  for(const frame of [open,spread]){
   frame.rQ=bladeFrame(frame.r).multiply(new T.Quaternion().setFromAxisAngle(Y,-1.35));
   frame.lQ=bladeFrame(frame.l).multiply(new T.Quaternion().setFromAxisAngle(Y,1.35));
  }
  if(Number.isFinite(state.holyRecover))return sample([[0,open],[.48,open],[.96,ready]],state.holyRecover);
  return sample([[7.62,planted],[7.85,spread],[8.09,spread],[8.25,open]],t);
 }
 if(action==='stompSweep'&&t>=1.55&&t<3.74){
  if(!tracks.has(action))tracks.set(action,track(action));
  const base=sample(tracks.get(action),t),hold=pose(hand(1.16,3.62,-.06,.43,.89,.05),hand(-1.16,3.62,-.06,-.43,.89,.05),-.12,-.08,2.40,.06,[.56,-.18,0,-.56,.18,0]);
  const f=smooth(t,1.55,1.82)*(1-smooth(t,3.16,3.45));
  for(const k of ['r','l','body','feet'])base[k]=base[k].map((v,i)=>lerp(v,hold[k][i],f));
  for(const side of ['r','l'])base[side+'Q']=bladeFrame(base[side]);
  if(t>=1.8&&t<=3.15){
   const retreat=2.2*smooth(t,1.8,2.85),right=smooth(t,1.82,2.34),left=smooth(t,2.28,2.85);
   base.feet=[.56,-.18+right*2.2-retreat,Math.sin(right*Math.PI)*.26,-.56,.18+left*2.2-retreat,Math.sin(left*Math.PI)*.24];
  }
  if(t>3.15){
   const hop=smooth(t,3.15,3.40)*(1-smooth(t,3.51,3.74));
   base.feet=[.56,-.18-.40*hop,.17*hop,-.56,.18+.38*hop,.48*hop];
   base.body[3]-=.12*hop;base.body[4]-=.10*hop;
  }
  return base;
 }
 if(Number.isFinite(state.deathElapsed)){
  // He recoils upright and opens both arms as the armor turns to ash.
  const recoil=pose(hand(1.25,2.78,-.29,.65,.74,.14),hand(-1.18,2.58,-.28,-.74,.63,.11),
    .09,-.10,2.34,.08,[.62,-.34,0,-.55,.39,0],-.05);
  const lifted=pose(hand(1.33,4.10,-.12,.32,.92,.21),hand(-1.43,3.86,.08,-.38,.90,.16),
    -.07,-.27,2.54,.16,[.64,-.40,0,-.57,.41,0],.035);
  const open=pose(hand(1.86,2.61,-.35,.97,.16,-.17),hand(-1.60,2.69,-.12,-.91,.25,-.32),
    -.17,-.16,2.47,.10,[.64,-.40,0,-.57,.41,0],.05);
  const release=pose(hand(1.97,2.51,-.18,.96,.22,-.16),hand(-1.78,2.62,.04,-.95,.19,-.24),
    -.12,-.18,2.41,.12,[.64,-.40,0,-.57,.41,0],.05);
  const across=pose(hand(.65,3.05,-.50,-.76,.48,-.34),hand(-1.14,2.40,.05,-.85,-.18,.40),
    -.41,.14,2.27,-.03,[.61,-.34,0,-.57,.44,0],-.09);
  // The final hit draws both blades across the cuirass before the elbows release.
  const crossed=pose(hand(.86,2.40,-.73,-.68,.68,-.24),hand(-.81,2.66,-1.04,.79,.52,-.34),
    -.24,.31,2.08,-.09,[.67,-.39,0,-.61,.49,0],-.12);
  const age=state.deathElapsed;
  const farewell=sample([[0,ready],[.28,ready],[.89,across],[1.25,crossed],[1.85,crossed],[2.13,lifted],[2.61,recoil],[3.27,open],[3.95,release],[5.0,release]],age);
  farewell.turn=1.51*(1-smooth(age,.78,3.34))-.16*smooth(age,3.1,4.1);
  return farewell;
 }
 const airborne=clone(bothHigh);airborne.body=[.05,.08,0,2.38,.08];airborne.feet=[.48,.22,.32,-.48,.55,.56];
 const spread=pose(hand(1.66,2.7,-.22,.98,.15,-.10),hand(-1.66,2.7,-.22,-.98,.15,-.10),0,-.05,2.44,.06,[.45,.06,.03,-.45,.19,.15]);
 if(action==='rocks'){
  const rip=pose(hand(1.04,.86,-.70,.68,-.40,-.57),hand(-.91,.96,-.10,-.72,-.38,-.56),-.25,1.02,1.36,.03,[.68,-.52,0,-.64,.66,0],-.12);
  // Primary 12.1-12.6: the right blade stands upright beside the shoulder while
  // the left hangs wide and level; the right then cuts level across the front
  // (12.6-12.8) with the left carried up beside the head as the body turns.
  const charge=pose(hand(1.36,2.72,-.14,.10,.99,.05),hand(-1.46,2.28,-.34,-.93,-.22,-.28),.18,.06,2.38,.05,[.62,-.25,0,-.60,.29,0],.04);
  const guard=clone(charge);guard.r=[1.28,2.46,-.50,.96,.12,-.25];guard.l=[-1.38,2.08,-.19,-.28,.95,-.10];
  const wind=pose(hand(1.05,3.16,-.22,.19,.97,.08),hand(-.44,2.29,-.82,.83,.04,-.55),.46,.06,2.36,.06,[.61,-.30,0,-.56,.42,.16],.09);
  if(state.phase===1)wind.l=[-.44,1.96,-.82,.90,.01,-.43];
  const overhead=pose(hand(1.12,3.47,.04,.61,.76,.19),hand(-.91,3.26,.22,-.48,.82,.29),.31,-.13,2.41,.11,[.63,-.31,0,-.57,.50,0],.12);
  const vault=pose(hand(.98,3.14,-.44,.53,.74,-.42),hand(-1.12,2.30,-.60,-.77,.29,-.56),.29,.34,2.14,.11,[.53,-.07,.41,-.62,.54,.79],-.09);
  const suspended=pose(hand(.74,3.34,-.55,.36,.17,-.92),hand(-1.08,2.50,-.38,-.84,.23,-.49),.33,.14,2.37,.08,[.48,.22,.38,-.52,.50,.66],-.10);
  // Primary encounter 17.2-17.8: the tips start below the raised hands,
  // circle above the head and across the low front, then finish sideways.
  // Explicit intermediate directions preserve that long arc; interpolating
  // only the raised and sideways guards takes the short quaternion path.
  const draw=pose(hand(-.18,3.65,-.52,-.20,-.96,-.15),hand(-1.01,3.61,-.40,-.16,-.97,-.12),.29,-.08,2.44,.08,[.52,.40,.55,-.49,.72,.90],-.06);
  const arcKeys=[
   [5.55,draw],
   [5.67,pose(hand(-.34,3.94,-.63,-.94,.29,-.17),hand(-1.09,3.88,-.51,-.91,.37,-.17),.23,-.12,2.46,.06,draw.feet,-.08)],
   [5.76,pose(hand(.18,4.02,-.59,.06,.98,-.18),hand(-.56,3.93,-.48,.14,.97,-.18),.09,-.10,2.47,.04,draw.feet,-.05)],
   [5.85,pose(hand(.84,3.43,-.78,.97,.16,-.16),hand(.08,3.34,-.70,.97,.05,-.20),-.13,.07,2.38,-.02,draw.feet,.02)],
   [5.94,pose(hand(.59,2.73,-.98,.25,-.95,-.18),hand(-.17,2.66,-.88,.14,-.97,-.19),-.30,.21,2.29,-.09,draw.feet,.08)],
   [6.05,pose(hand(-.32,2.89,-.96,-.88,-.40,-.23),hand(-1.08,2.77,-.72,-.90,-.36,-.22),-.48,.29,2.25,-.12,draw.feet,.11)],
   [6.17,pose(hand(-.70,3.10,-.84,-.94,-.29,-.17),hand(-1.47,2.97,-.56,-.94,-.31,-.15),-.51,.26,2.27,-.12,draw.feet,.10)]
  ];
  const release=arcKeys.at(-1)[1],follow=clone(release);
  follow.body=[-.34,.20,.06,2.33,-.05];follow.r[1]=2.98;follow.l[1]=2.83;
  const drag=clone(rip);drag.body=[-.30,1.18,-.13,1.27,-.16];drag.r=[1.12,.74,-.97,.66,-.41,-.63];drag.l=[-.85,.90,-.72,-.67,-.40,-.61];drag.feet=[.75,-.66,0,-.61,.86,.07];
  const shoulder=pose(hand(1.06,3.33,-.28,.48,.79,-.39),hand(-1.19,2.85,.09,-.35,.65,.70),-.22,.12,2.35,.06,[.63,-.36,0,-.57,.49,.08],-.07);
  const drive=pose(hand(1.14,1.04,-.72,.60,-.36,-.72),hand(-.90,1.24,-.52,-.76,-.23,-.60),-.38,.86,1.48,-.08,[.74,-.66,0,-.52,.67,.24],-.14);
  // Seen from behind in the first rock cast. The left fist carries its short projected blade
  // towards the far shoulder. The right cutting edge arcs over, with its tip curling down.
  const rear=pose(hand(1.31,3.15,.12,.90,.46,.17),hand(-1.63,2.28,.46,.20,.64,-.74),
    -.14,.15,2.29,-.04,[.63,-.32,0,-.61,.44,.08],-.045);
  const carry=pose(hand(1.48,3.26,.17,.91,.47,.22),hand(-1.64,2.27,.41,.25,.60,-.76),
    -.23,.23,2.22,-.07,[.65,-.37,0,-.60,.49,.10],-.07);
  for(const frame of [rear,carry]){
   frame.rQ=bladeFrame(frame.r).multiply(new T.Quaternion().setFromAxisAngle(Y,Math.PI*.93));
   frame.lQ=bladeFrame(frame.l).multiply(new T.Quaternion().setFromAxisAngle(Y,-1.76));
  }
  const raisedBack=pose(hand(1.20,3.61,-.17,.68,.71,-.15),hand(-.65,3.24,-.55,.34,.81,-.48),
    -.16,-.07,2.35,.05,[.67,-.39,0,-.55,.47,.13],-.05);
  raisedBack.rQ=bladeFrame(raisedBack.r).multiply(new T.Quaternion().setFromAxisAngle(Y,2.55));
  const pullBack=clone(drag);pullBack.r=[1.34,.77,-.40,.83,-.37,-.40];pullBack.l=[-.96,1.04,-.98,-.54,-.38,-.75];
  pullBack.body=[-.53,1.06,-.22,1.19,-.24];pullBack.feet=[.75,-.66,0,-.58,.79,.14];
  const windup=state.phase===1?[[0,ready],[.82,charge],[1.12,wind],[1.42,rear],[1.69,carry],[1.98,raisedBack],[2.19,rip],[2.42,drag],[2.80,pullBack],[2.97,drive],[3.22,vault],[3.40,suspended]]:
    [[0,ready],[.15,guard],[.35,wind],[.73,shoulder],[1.12,overhead],[1.45,rip],[1.69,drag],[1.87,pullBack],[2.02,drive],[2.29,vault],[ROCK_SEQUENCE.risen,suspended]];
  const sideGuard=pose(hand(.62,3.17,-.58,.18,-.44,-.88),hand(-1.02,2.58,-.36,-.83,.19,-.52),.41,.10,2.36,.08,suspended.feet,-.08);
  const finish=clone(release);finish.body[0]=-.47;
  const heel=clone(low);heel.body=[-.25,.49,-.11,1.92,-.16];heel.feet=[.69,-.51,0,-.61,.48,.33];
  const landing=clone(low);landing.body=[-.13,.65,-.10,1.52,-.19];landing.feet=[.70,-.49,0,-.64,.30,0];
  const lead=state.phase===2?ROCK_SEQUENCE.phaseTwoSweep:0,cast=t+lead;
  const p=sample([...windup,[3.42,suspended],[4.17,sideGuard],[Math.max(4.21,4.78-lead*.8),sideGuard],
    [5.34-lead,draw],...arcKeys.map(([time,p])=>[time-lead,p]),[6.46-lead,finish],[6.72-lead,follow],[7.03-lead*.42,heel],[7.28-lead*.42,landing],[ROCK_SEQUENCE.duration,ready]],t);
  const mounted=state.phase===2;
  if(!mounted){
   // Load over the outside boot, then carry the hips across as the flat
   // sword sweeps past the belt. The torso changes facing through this step.
   p.rockStepAcross=(.26-.72*smooth(t,1.12,1.68))*smooth(t,.82,1.12)*(1-smooth(t,1.70,2.20));
  }
  const bite=mounted?1.38:2.12, off=mounted?ROCK_SEQUENCE.rise:ROCK_SEQUENCE.liftOff;
  const stride=(t-bite)/(off-bite);
  if(stride>-.27&&stride<1.32){
   const w=smooth(stride,-.27,.04)*(1-smooth(stride,.91,1.32));
   const pull=smooth(stride,.06,.87), unwind=mounted?smooth(stride,.69,1.09):smooth(stride,.96,1.29);
   const bend=Math.sin(Math.PI*smooth(stride,-.08,1.04));
   // In the first cast he stays folded over both grips until his feet leave
   // the floor. Unfolding midway through the rake hid the travel of the blades.
   const loaded=mounted?bend:smooth(stride,-.11,.19)*(1-smooth(stride,.98,1.26));
   // Follow the low sword across the planted leg. Bending only straight
   // forward leaves the head behind the pelvis throughout the side sweep.
   if(!mounted)p.rakeLean=.58*smooth(stride,-.06,.86)*w;
   p.hipPitch=(mounted?.18+.19*bend:.24+.17*loaded)*w;
   p.body[0]=lerp(p.body[0],(mounted?.48:.61)-(mounted?1.18:1.39)*pull+.17*unwind,w);
   p.body[1]=lerp(p.body[1],(mounted?.77:.83)+.22*loaded-.42*unwind,w);
   p.body[2]=lerp(p.body[2],mounted?-.20+.37*pull:.16-.41*pull,w);
   p.body[3]=lerp(p.body[3],(mounted?1.65:1.52)-.24*loaded+.27*unwind,w);
   p.body[4]=lerp(p.body[4],-.23+.46*pull,w);
   // The hands cross toward positive local X. Transfer the pelvis from
   // the trailing leg onto the lead leg along that same path.
   p.rakeShift=(mounted?.18-.40*pull:-.20+.53*pull)*w;
   for(const [key,sign] of [['r',1],['l',-1]]){
    const lead=key==='r', u=smooth(stride,lead?-.02:.13,lead?.87:1.01);
    const sweep=lerp(lead?-.42:-.87,lead?1.02:.48,u)*(mounted?.88:1);
    const grip=hand(sign*(lead?.74:.62)+.60*u-.24,(mounted?.96:.85)+(lead?0:.15)+.28*unwind,
     -1.14+.38*u,Math.sin(sweep),-.36+.10*u,-Math.cos(sweep));
    p[key]=p[key].map((v,i)=>lerp(v,grip[i],w));
    const blade=bladeFrame(grip);
    if(!mounted)blade.multiply(new T.Quaternion().setFromAxisAngle(Y,sign*(.70-.24*u)));
    p[key+'Q'].slerp(blade,w);
   }
   const step=smooth(stride,-.17,.53), trail=smooth(stride,mounted?.50:.68,mounted?1.20:1.26);
   const feet=[.68,-.52+.49*trail,(mounted?.46:.34)*Math.sin(Math.PI*trail),-.62,.58-.92*step,(mounted?.43:.36)*Math.sin(Math.PI*step)];
   p.feet=p.feet.map((v,i)=>lerp(v,feet[i],w));
   p.rakeStance=stride>=-.12&&stride<1.08;
  }
  if(cast>arcKeys[0][0]&&cast<arcKeys.at(-1)[0]){
   // Carry wrist velocity through the arc instead of easing to a stop at
   // every quarter turn. Blade frames still follow the adjacent directions.
   let i=0;while(i<arcKeys.length-2&&cast>arcKeys[i+1][0])i++;
   const [ta,a]=arcKeys[i],[tb,b]=arcKeys[i+1],prev=arcKeys[Math.max(0,i-1)],next=arcKeys[Math.min(arcKeys.length-1,i+2)];
   const u=(cast-ta)/(tb-ta),span=tb-ta;
   for(const k of ['r','l']){
    for(let j=0;j<3;j++){
     const m0=i?(b[k][j]-prev[1][k][j])/(tb-prev[0]):0;
     const m1=i<arcKeys.length-2?(next[1][k][j]-a[k][j])/(next[0]-ta):0;
     p[k][j]=(2*u*u*u-3*u*u+1)*a[k][j]+(u*u*u-2*u*u+u)*span*m0+(-2*u*u*u+3*u*u)*b[k][j]+(u*u*u-u*u)*span*m1;
    }
    p[k+'Q']=bladeFrame(a[k]).slerp(bladeFrame(b[k]),u);
   }
  }
  // Primary 13.10-13.79 and 134.60-135.25 (native crops in evidence/overhaul/visual-refinement-20261113/
  // gravity-flight/study/src-air*.jpg): the hovering body is not a post for the arms. While the blades pass over
  // the head to his right the trunk follows them until it lies almost level, legs hanging and the cape thrown
  // the other way (13.35-13.41); it folds over the low pass (13.48-13.54) and comes upright again with both
  // blades held out to his left (13.60 onward). The turn is about the chest, which keeps its place in the air.
  // No full somersault is visible, so none is played.
  const profile=!mounted?smooth(cast,4.06,5.36)*(1-smooth(cast,6.40,6.91)):0;
  p.turn=(p.turn||0)+1.05*profile;p.body[0]+=.20*profile;p.headYaw=.19*profile;
  const lean=mounted?smooth(cast,5.70,5.84)*(1-smooth(cast,5.89,6.03)):
    smooth(cast,5.44,5.82)*(1-smooth(cast,6.24,6.72));
  const fold=smooth(cast,5.84,5.95)*(1-smooth(cast,6.00,6.16));
  const settle=smooth(cast,6.00,6.12)*(1-smooth(cast,6.26,6.80));
  if(lean>0||fold>0||settle>0){
   p.spin=-(mounted?.84:1.14)*lean+.16*settle;p.pitch=-.60*fold-.08*settle;p.pivot=3.0;
   p.body[2]-=.42*lean-.10*settle;p.body[1]+=.30*fold+.10*lean;p.body[3]-=.10*fold;
   // The legs trail under the turning trunk instead of swinging out stiff with it.
   p.feet[0]+=.62*lean;p.feet[3]+=.62*lean;p.feet[2]+=.20*lean+.12*fold;p.feet[5]+=.10*lean+.26*fold;
   p.feet[1]+=.30*fold;p.feet[4]+=.34*fold;
  }
  return p;
 }
 if(action==='long'&&t>=6.35){
  if(!tracks.has(action))tracks.set(action,track(action));
  const contact=sample(tracks.get(action),6.35);
  const open=pose(hand(.97,1.72,-.61,.57,-.68,-.46),hand(-1.66,3.03,-.32,-.92,.20,-.33),
    -.34,.32,1.87,-.08,[.64,-.42,0,-.62,.40,.05],.13);
  const behind=pose(hand(1.30,1.72,.0,.83,-.27,.48),hand(-1.05,2.15,-.47,-.83,-.23,-.49),
    .51,.40,1.76,-.05,[.62,-.36,0,-.59,.42,0],-.08);
  return sample([[6.35,contact],[6.56,open],[6.73,open],[7.00,behind],[7.31,behind],[7.6,low]],t);
 }
 if(action==='pull'){
  const p=sample([[0,ready],[.8,spread],[1.35,spread],[1.96,bothHigh],[2.2,bothHigh],[2.36,bothPassing],[2.52,bothLow],[3.4,bothLow],[4.35,ready],[4.7,ready]],t);
  const drag=smooth(t,.58,1.22)*(1-smooth(t,1.55,1.97)),plant=smooth(t,2.23,2.49)*(1-smooth(t,3.08,3.86));
  p.body[3]-=.19*drag+.24*plant;p.body[1]+=.26*plant-.12*drag;p.r[2]-=.24*drag;p.l[2]-=.24*drag;return p;
 }
 if(action==='leap'){
  const tell=clone(crossed);tell.r=[-.28,3.83,-.2,-.24,.97,.03];tell.l=[.28,3.83,-.2,.24,.97,.03];tell.body=[0,-.04,0,2.35,0];
  const launch=clone(crossed);launch.body=[0,.65,0,1.90,.08];launch.feet=airborne.feet;
  const release=state.groundedRush?1.7:RUSH_SEQUENCE.windup;
  if(!state.groundedRush){
   launch.r=hand(.56,3.80,-.54,.21,.95,-.22);
   launch.l=hand(-.91,2.10,-.48,-.72,.43,-.39);
  }
  const impact=clone(bothLow);impact.body[1]+=.19;impact.feet[1]-=.19;
  if(state.groundedRush){
   impact.body[1]+=.32;impact.body[3]-=.24;
   impact.feet=[.64,-.29,0,-.48,.41,0];
  }
  const gather=pose(hand(1.18,1.63,-.47,.48,.56,-.64),hand(-1.09,1.71,-.32,-.50,.64,-.53),
    .24,.59,1.48,-.12,[.66,-.43,0,-.62,.50,0],.06);
  const buildup=state.groundedRush?[[0,low],[.34,gather],[.98,gather],[1.46,tell]]:[[0,low],[.36,gather],[.78,tell]];
  const p=sample([...buildup,[release,tell],[release+.16,launch],[RUSH_SEQUENCE.contact-.1,launch],[RUSH_SEQUENCE.contact+.1,impact],[RUSH_SEQUENCE.contact+.38,impact],[state.groundedRush?4.05:4.1,ready]],t);
  if(t>release&&t<RUSH_SEQUENCE.contact+.48){
   const tuck=smooth(t,release,release+.14)*(1-smooth(t,RUSH_SEQUENCE.contact-.045,RUSH_SEQUENCE.contact+.15));
   const plant=smooth(t,RUSH_SEQUENCE.contact-.07,RUSH_SEQUENCE.contact+.07)*(1-smooth(t,RUSH_SEQUENCE.contact+.21,RUSH_SEQUENCE.contact+.48));
   p.pivot=2.03;p.spin=smooth(t,release,RUSH_SEQUENCE.contact)*Math.PI*4+.24*plant;
   p.pitch=-(state.groundedRush?1.02:.62)*tuck-.21*plant;p.feet[2]+=.46*tuck;p.feet[5]+=.20*tuck;p.body[3]-=.21*plant;
  }
  if(state.groundedRush){
   // The cape turns into view at touchdown. The shoulders unwind across
   // the planted outside leg before the next paired sword stance.
   p.turn=smooth(t,release+.22,RUSH_SEQUENCE.contact+.04)*(2.65-1.80*smooth(t,RUSH_SEQUENCE.contact+.54,4.05));
  }
  return p;
 }
 if(action==='meteor'){
  // Primary 119.9-122.4: wide stance with both blades out, both raised overhead,
  // then driven into the floor at either side while he drops onto one knee and
  // bows over them until the flash. Primary 127.0-129.4 (airborne-target return):
  // feet-first arrival, one sweeping cut, then a long bow on hands and knee with
  // the blades lying forward on the floor before he pushes himself upright.
  const m=METEOR_SEQUENCE;
  const stance=pose(hand(1.58,2.40,-.30,.93,.30,-.20),hand(-1.58,2.40,-.30,-.93,.30,-.20),0,.02,2.40,.02,[.66,-.20,0,-.66,.20,0]);
  const charge=pose(hand(.82,4.06,-.02,.24,.90,.36),hand(-.82,4.06,-.02,-.24,.90,.36),0,-.20,2.52,.05,[.60,-.16,0,-.60,.20,0]);
  const plant=pose(hand(1.30,1.23,-.72,.91,-.18,-.35),hand(-.90,.94,-.88,-.62,-.42,-.66),0,.78,1.20,.36,[.70,-.20,0,-.62,.96,0]);plant.hipPitch=.36;
  const brace=pose(hand(.92,.88,-.84,.79,-.20,-.58),hand(-1.11,1.19,-.47,-.85,-.25,-.45),
    -.19,1.01,1.02,.32,[.74,-.37,0,-.63,.96,.13],-.12);brace.hipPitch=.45;
  const vault=clone(plant);vault.r=[1.52,2.28,-.27,.85,-.26,-.46];vault.l=[-1.38,2.37,-.18,-.81,-.32,-.47];
  vault.body=[.18,.45,.08,1.86,.0];vault.hipPitch=0;
  const contact=m.contact+(state.meteorCancelled?.31:0);
  const falling=clone(bothHigh);falling.r=[1.10,3.86,.08,.32,.70,.64];falling.l=[-.94,3.92,.12,-.31,.71,.63];
  falling.feet=[.67,-.64,1.04,-.61,.54,.61];falling.body=[.19,.32,-.09,2.00,-.07];
  const passing=clone(falling);passing.r=[1.46,3.24,-.38,.93,.17,-.32];passing.l=[-1.38,3.30,-.32,-.91,.22,-.34];
  passing.body=[.08,.24,-.04,1.95,-.08];passing.feet=[.63,-.32,.08,-.58,.31,.06];
  const lowCut=clone(bothLow);lowCut.r=[1.14,1.32,-.53,.89,-.22,-.36];lowCut.l=[-.93,1.62,-.60,-.84,-.20,-.49];
  // The bow settles back onto the rear knee, so the lowered head stays clear of a player standing at his feet.
  const settle=clone(lowCut);settle.body=[0,.86,0,1.36,.34];settle.feet=[.68,.06,.20,-.64,.96,0];settle.hipPitch=.30;
  const bowed=pose(hand(1.02,.60,-.76,.64,-.09,-.76),hand(-.98,.64,-.70,-.68,-.08,-.73),0,.92,1.12,.95,[.70,.52,0,-.64,1.72,0]);bowed.hipPitch=.56;
  const rising=pose(hand(1.32,1.50,-.62,.82,-.22,-.52),hand(-1.27,1.58,-.58,-.84,-.20,-.50),0,.62,1.74,.42,[.68,.10,0,-.62,.96,0]);rising.hipPitch=.16;
  const lead=pose(hand(.94,3.47,-.46,-.13,.86,.42),hand(-1.32,2.61,-.30,-.92,.21,.25),
    .28,-.12,2.42,.06,[.64,-.24,0,-.61,.32,.04],.06);
  const drag=pose(hand(.92,.99,-.91,.77,-.17,-.61),hand(-1.13,1.24,-.54,-.82,-.24,-.51),
    -.29,.94,1.27,.24,[.72,-.46,0,-.60,.80,.17],-.10);drag.hipPitch=.36;
  const push=clone(brace);push.r=[1.35,1.35,-.72,.96,-.10,-.26];push.l=[-.95,1.01,-.86,-.64,-.34,-.68];
  push.body=[.06,.80,-.12,1.39,.19];push.hipPitch=.25;push.feet=[.74,-.37,0,-.59,.81,.25];
  vault.feet=[.68,-.29,.23,-.57,.65,.51];
  const keys=[[0,ready],[.28,stance],[.76,stance],[1.03,lead],[1.34,charge],[m.plant-.11,charge],
    [m.plant+.09,plant],[m.plant+.38,drag],[m.takeoff+.27,brace],[m.takeoff+.40,push],
    [m.takeoff+.55,vault],[m.risen,airborne],[m.return,airborne],[contact-.20,falling],
    [contact-.10,passing],[contact+.025,lowCut],[contact+.17,settle],[contact+.39,bowed],[8.84,bowed],[9.22,rising],[m.duration,ready]];
  const p=sample(keys,t);
  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  const u=T.MathUtils.clamp((t-keys[i][0])/Math.max(.001,keys[i+1][0]-keys[i][0]),0,1);
  const arrival=smooth(t,contact-.32,contact-.06)*(1-smooth(t,contact+.18,contact+.46));
  const launchProfile=smooth(t,m.plant+.03,m.plant+.51)*(1-smooth(t,m.takeoff+.40,m.risen));
  p.turn=.36*launchProfile+.36*arrival;p.pivot=1.62;p.spin=.04*arrival;
  p.body[0]+=.27*launchProfile+.16*arrival;p.headYaw=.24*launchProfile+.12*arrival;
  p.hipPitch=lerp(keys[i][1].hipPitch||0,keys[i+1][1].hipPitch||0,u*u*(3-2*u));
  return p;
 }
 if(action==='lightspeed'){
  if(state.rockFollowup){
    const cast=clone(airborne);cast.r=[.73,4.05,.03,.18,.60,.78];cast.body[0]=.24;
    const brace=clone(bothLow);brace.body[2]-=.22;brace.body[3]-=.17;brace.body[1]+=.18;brace.feet=[.65,-.22,0,-.51,.34,.23];
    const cleave=clone(bothPassing);cleave.r=[1.48,2.68,-.48,.90,-.17,-.40];
    cleave.l=[-.90,3.54,-.21,-.25,.82,-.50];cleave.body=[.42,.38,-.16,1.88,-.07];
    const planted=clone(brace);planted.l=[-1.22,2.47,-.22,-.84,.24,-.46];planted.body[0]=-.30;
    const pose=sample([[0,airborne],[.28,cast],[ROCK_RETURN.depart,cast],[ROCK_RETURN.arrive-.03,overhead],
      [ROCK_RETURN.land-.07,cleave],[ROCK_RETURN.land+.04,planted],[2.01,planted],[ROCK_RETURN.plant,brace],
      [2.56,brace],[2.96,bothLow],[3.40,spread],[4.58,ready]],t);
    pose.turn=.38*smooth(t,1.33,1.58)-.80*smooth(t,1.62,1.86)+.42*smooth(t,2.2,2.82);
    return pose;
  }
  const contact=lightContacts(action,state.rockFollowup).at(-1);
  return sample([[0,airborne],[.25,airborne],[contact-.30,airborne],[contact-.12,bothPassing],[contact+.06,bothLow],[contact+.7,bothLow],[contact+1.7,ready]],t);
 }
 if(action==='sideDash'||action==='dash'){
  const contacts=lightContacts(action),keys=[[0,ready]];
  for(let i=0;i<contacts.length;i++){const at=contacts[i],wind=i%2?leftDraw:rightDraw,pass=i%2?leftAcross:rightAcross,end=i%2?leftEnd:rightEnd;
   keys.push([Math.max(keys.at(-1)[0]+.01,at-.30),wind],[at-.07,pass],[at+.06,end]);
  }keys.push([contacts.at(-1)+.65,ready]);
  const p=sample(keys,t);
  for(let i=0;i<contacts.length;i++){
   const at=contacts[i],side=i%2?-1:1,wind=smooth(t,at-.30,at-.12)*(1-smooth(t,at-.12,at));
   const hit=smooth(t,at-.12,at)*(1-smooth(t,at+.04,at+.27));
   p.body[0]+=side*(.22*wind-.39*hit);p.body[1]+=.17*hit;p.body[3]-=.12*(wind+hit);
   p.feet[side>0?1:4]-=.29*hit;p.feet[side>0?5:2]+=.17*wind;
  }
  return p;
 }
 if(action==='nova'){
  const open=pose(hand(1.65,3.06,-.12,.98,.12,-.07),hand(-1.65,3.05,-.15,-.98,.13,-.07),0,-.10,2.45,.04,[.43,-.02,.11,-.43,.15,.17]);
  const hover=clone(open);hover.r[1]+=.19;hover.l[1]+=.13;hover.feet=[.38,.08,.24,-.38,.28,.43];hover.body[1]-=.09;
  const landing=clone(spread);landing.body[2]-=.22;landing.feet=[.52,.06,-.04,-.46,.08,.23];
  return sample([[0,ready],[.55,spread],[1.36,open],[2.28,hover],[6.68,hover],[7.22,open],[7.69,spread],[7.83,landing],[7.92,ready]],t);
 }
 if(action==='somersault'){
  const p=sample([[0,ready],[.38,low],[.58,airborne],[1.48,airborne],[1.68,bothPassing],[1.84,bothLow],[2.45,bothLow],[3.8,ready]],t);
  if(t>.55&&t<1.75)p.pitch=-Math.PI*2*smooth(t,.55,1.75);
  const land=smooth(t,1.63,1.82)*(1-smooth(t,2.21,2.62));p.body[3]-=.23*land;p.body[1]+=.22*land;return p;
 }
 if(action==='grab'||action==='stompGrab'){
  if(state.grabRecovery)return null;
  const g=action==='grab'?GRAB_SEQUENCE:STOMP_GRAB_SEQUENCE,offset=action==='grab'?0:1.35,local=t-offset;
  if(local<0){
   const lifted=clone(ready);lifted.r=[.95,3.15,-.18,.35,.93,0];lifted.l=[-.95,3.15,-.18,-.35,.93,0];lifted.body=[-.18,-.02,0,2.48,.08];lifted.feet=[.48,.12,0,-.5,-.35,.76];
   const planted=clone(lifted);planted.body=[.1,.24,0,2.14,-.09];planted.feet=[.5,.17,0,-.5,-.49,0];
   return sample([[0,ready],[.6,lifted],[.93,lifted],[1.05,planted],[1.35,ready]],t);
  }
  const open=pose(hand(1.47,2.29,-.33,.70,.67,-.19),hand(-1.48,2.22,-.35,-.68,.70,-.20),0,.07,2.38,-.02,[.61,-.24,0,-.60,.30,0]);
  const reach=pose(hand(1.64,2.06,-.47,.95,.16,-.22),hand(-1.57,2.00,-.52,-.96,.10,-.23),-.06,.28,2.12,-.12,[.64,-.32,0,-.59,.39,0],.03);
  const crouch=pose(hand(1.56,1.58,-.66,.96,-.15,-.25),hand(-1.49,1.49,-.59,-.95,-.16,-.25),-.13,.70,1.48,-.27,[.68,-.43,0,-.62,.48,0],.08);
  const embrace=clone(spread);embrace.r=[.65,2.75,-1.36,.8,.45,.1];embrace.l=[-.65,2.75,-1.36,-.8,.45,.1];embrace.body=[0,.35,0,2.27,-.10];
  const lift=g.takeoff-offset+(action==='grab'?.21:0);
  const jump=clone(spread);jump.body=[-.16,.27,.10,2.18,-.17];jump.feet=[.57,.19,.62,-.53,.73,.91];jump.r[2]-=.33;jump.l[2]-=.30;
  const landing=pose(hand(1.05,2.12,-1.16,.72,.25,-.63),hand(-.96,1.96,-1.22,-.69,.18,-.70),-.19,.77,1.67,-.23,[.60,-.42,0,-.59,.32,0],.09);
  return sample([[0,open],[.38,open],[.84,reach],[1.18,crouch],[lift,crouch],[lift+.18,jump],[g.land-offset-.14,jump],[g.land-offset,landing],[g.contact-offset+.20,embrace],[g.release-offset,embrace],[g.duration-offset,ready]],local);
 }
 return null;
}

export function reconstructBossPose(actor,state,dt=1/60){
 if(actor.name!=='gilded_warlord'||!actor.thrustBasePose)return false;
 const critical=state.bossAction==='critical'||state.postCritical!=null||(state.stagger>0&&state.critical);
 const authored=['double','cross','sweepDown','holySweepDown','stompSweep','long','swing','promised','slam','uppercut','risingSlash','bloodflame','ring'].includes(state.bossAction)&&!state.stagger&&!state.grabRecovery;
 const special=Number.isFinite(state.deathElapsed)||!state.stagger&&!state.critical?specialPose(state):null;
 const age=state.openingImpactAge??Infinity;
 const catchStep=smooth(age,.27,.62)*(1-smooth(age,1.28,1.70));
 const deflection=deflectionPose(state);
 const standing=state.motion==='idle'&&['idle','wait','approach','recover'].includes(state.bossAction)&&!state.stagger&&!state.grabRecovery&&!state.ringRecovery;
 if(!critical&&!authored&&!standing&&!special&&!deflection&&!catchStep)return false;
 let p;
 if(Number.isFinite(state.deathElapsed))p=special;
 else if(deflection)p=deflection;
 else if(critical)p=criticalPose(state);
 else if(special)p=special;
 else if(standing||catchStep&&!authored)p=clone(ready);
 else{if(!tracks.has(state.bossAction))tracks.set(state.bossAction,track(state.bossAction));p=sample(tracks.get(state.bossAction),state.bossElapsed||0);}
 if(state.phase===1&&state.bossAction==='recover'&&state.critical&&state.stagger>0){
  const age=state.bossElapsed;
  const bareFace=smooth(age,.22,.52)*(1-smooth(age,.90,1.41));
  if(bareFace>0){
   const flat=(p.rQ||bladeFrame(p.r)).clone();
   p.rQ=flat.multiply(new T.Quaternion().setFromAxisAngle(Y,1.08*bareFace));
  }
 }
 if(catchStep){
  const trailing=pose(hand(1.33,1.78,-.97,.84,-.05,-.55),hand(-1.12,1.45,.16,-.92,.21,.26),
    -.46,.75,1.62,.25,[.69,-.48,0,-.58,.78,.09],-.17);
  for(const field of ['body','r','l','feet'])
    p[field]=p[field].map((v,i)=>T.MathUtils.lerp(v,trailing[field][i],catchStep));
 }
 // The mounted riposte at 88–90 s folds at the knees. Reusing the
 // unmounted waist-and-spine bow rotates both faces almost into the ground.
 if(state.phase===2&&critical&&p.hipPitch>0){
  const bowed=smooth(p.hipPitch,.06,.78);
  p.hipPitch*=1-.36*bowed;
  p.body[1]*=1-.24*bowed;
  p.body[3]-=.13*bowed;
  p.body[4]+=.12*bowed;
 }
 if(state.phase===2&&!critical&&!deflection&&!special&&(standing||authored)){
  const upright=1-smooth(p.body[1],.24,.55);
  p.body[1]+=.12*upright;p.body[3]-=.10*upright;p.body[4]-=.055*upright;
 }

 // A planted knee receives the moving blade. Each cut uses the combat
 // contact of its own hand, including returns and interrupted combos.
 if(authored&&!special){
  const t=state.bossElapsed||0;
  for(const c of MOVES[state.bossAction].contacts){
   if(c.area)continue;
   const load=smooth(t,c.t-.31,c.t-.12)*(1-smooth(t,c.t-.12,c.t));
   const follow=smooth(t,c.t-.10,c.t+.015)*(1-smooth(t,c.t+.07,c.t+.34));
   const side=c.hand||0;
   p.body[0]+=side*(.13*load-.22*follow);p.body[1]+=.12*follow-.06*load;
   p.body[3]-=.10*follow+.05*load;p.body[2]-=side*.075*follow;
  }
 }

 // The contact catalog's jump already moves the gameplay root. Fold the
 // knees during that actual airborne interval, then extend before touchdown.
 const jump=authored?MOVES[state.bossAction]?.contacts.find(c=>c.jump):null;
 if(jump){
  const t=state.bossElapsed||0,span=state.bossAction==='promised'?1.3:.9;
  const tuck=smooth(t,jump.t-span,jump.t-span+.22)*(1-smooth(t,jump.t-.23,jump.t+.015));
  const landing=smooth(t,jump.t-.04,jump.t+.04)*(1-smooth(t,jump.t+.08,jump.t+.18));
  const tucked=[.57,-.32,.62,-.55,.56,1.05];
  for(let i=0;i<6;i++)p.feet[i]=lerp(p.feet[i],tucked[i],tuck);
  p.body[3]-=.13*tuck+.10*landing;p.body[1]+=.10*tuck;
 }
 // Shift weight onto the planted side before lifting the opposite boot.
 p.shift=authored&&!special&&!['long','promised'].includes(state.bossAction)&&state.pos.y<.1?T.MathUtils.clamp((p.feet[5]-p.feet[2])*.35,-.13,.13):0;
 const turn=!state.stagger&&!state.critical?bossChainTurn(state.bossAction,state.bossElapsed||0,state.phase,(state.targetYaw??state.yaw??0)-(state.yaw??0)):{angle:0,lift:[0,0]};
 p.turn=(p.turn||0)+turn.angle;
 if(state.rushToCross&&state.bossAction==='cross'){
   const carry=1-smooth(state.bossElapsed,.12,.92);
   p.turn+=.85*carry;p.body[0]+=.25*carry;p.body[1]+=.24*carry;
   p.body[3]-=.16*carry;p.r[1]-=.22*carry;p.l[2]-=.28*carry;
 }
 p.feet[2]=Math.max(p.feet[2],turn.lift[0]);p.feet[5]=Math.max(p.feet[5],turn.lift[1]);
 if(authored&&MOVES[state.bossAction]&&!special&&state.pos.y<.10){
  const locomotion=meleeLocomotion(state.bossAction,state.bossElapsed||0);
  const contact=Math.max(0,...MOVES[state.bossAction].contacts.filter(c=>c.area).map(c=>1-smooth(Math.abs((state.bossElapsed||0)-c.t),.10,.36)));
  if(contact<1){
   for(let side=0;side<2;side++){
    const [x,z,lift]=locomotion.feet[side],point=V(x,0,z).applyAxisAngle(Y,-p.turn);
    p.feet[side*3]=lerp(point.x,p.feet[side*3],contact);p.feet[side*3+1]=lerp(point.z,p.feet[side*3+1],contact);p.feet[side*3+2]=lerp(Math.max(lift,turn.lift[side]),p.feet[side*3+2],contact);
   }
  }
 }

 // The stance is resolved before the pelvis shifts: using the earlier hand
 // keys here ignored the actual leading step in most alternating chains.
 if(authored&&!special&&state.pos.y<.1&&!['long','promised'].includes(state.bossAction)){
  p.shift=T.MathUtils.clamp((p.feet[5]-p.feet[2])*.46,-.15,.15);
 }

 if(p.rakeShift!==undefined)p.shift=p.rakeShift;
 if(p.rockStepAcross){
  p.shift+=Math.cos(p.turn)*p.rockStepAcross;
  p.body[4]+=Math.sin(p.turn)*p.rockStepAcross;
 }
 if(!state.stagger&&!critical){
  const t=state.bossElapsed||0;
  if(state.bossAction==='promised')rightHeel(p,t,MOVES.promised.contacts[0].t,1.59);
  if(state.bossAction==='cross'&&state.crossFromRiposte)rightHeel(p,t,MOVES.cross.contacts[0].t-.12,.98);
  if(state.bossAction==='stompGrab'&&t<1.57){
   // The repeated stomp into the grab uses the same right boot (clear 106.9).
   p.feet[5]=0;
   rightHeel(p,t,MOVES.stompGrab.contacts[0].t,1.46);
  }
 }
 const rakeStance=!!p.rakeStance&&state.pos.y<.10;
 if(!rakeStance||state.bossElapsed<(actor.lastRakeTime||0))actor.rakeAnchors={};
 actor.lastRakeTime=state.bossElapsed;
 const footKey=state.bossAction+'|'+Math.floor((state.actionId||0)/10);
 const passingCuts=authored&&state.bossAction==='promised'&&state.bossElapsed>=2.74&&state.bossElapsed<=6.04&&state.pos.y<.10;
 if(!passingCuts||actor.plantedFootKey!==footKey||state.bossElapsed<actor.plantedFootTime)actor.pivotFoot=null;
 const plantFeet=authored&&!special&&state.pos.y<.10;
 if(!plantFeet||actor.plantedFootKey!==footKey||(state.bossElapsed||0)<(actor.plantedFootTime||0))actor.plantedFeet={};
 actor.plantedFootKey=footKey;actor.plantedFootTime=state.bossElapsed||0;
 const poseKey=state.bossAction+'|'+!!state.stagger+'|'+!!state.critical+'|'+(state.postCritical!=null)+'|'+Number.isFinite(state.deathElapsed);
 if(actor.authoredPoseKey!==poseKey){actor.authoredPoseFrom=actor.authoredPoseLast;actor.authoredPoseAge=0;actor.authoredPoseKey=poseKey;}
 actor.authoredPoseAge=(actor.authoredPoseAge||0)+dt;
 const afterLanding=state.crossFromPromised&&state.bossAction==='cross'&&!state.stagger&&!state.critical;
 const transitionEnd=afterLanding?.82:.13;
 if(actor.authoredPoseFrom&&actor.authoredPoseAge<transitionEnd){
  const f=smooth(actor.authoredPoseAge,afterLanding?.36:0,transitionEnd),from=actor.authoredPoseFrom;
  p.turn=(from.turn||0)+Math.atan2(Math.sin(p.turn-(from.turn||0)),Math.cos(p.turn-(from.turn||0)))*f;
  for(const k of ['body','feet','r','l'])p[k]=p[k].map((v,i)=>lerp(from[k][i],v,f));
  p.hipPitch=lerp(from.hipPitch||0,p.hipPitch||0,f);
  for(const k of ['r','l'])if(from[k+'Q']&&p[k+'Q'])p[k+'Q']=from[k+'Q'].clone().slerp(p[k+'Q'],f);
 }
 actor.authoredPoseLast=clone(p);for(const k of ['r','l'])if(p[k+'Q'])actor.authoredPoseLast[k+'Q']=p[k+'Q'].clone();
 // Reset the entire body, including pelvis translation. The prior implementation
 // layered knee bends and IK on top of animated bends and could not plant feet.
 for(const b of actor.thrustBasePose){b.bone.quaternion.copy(b.q);b.bone.position.copy(b.p);}
 actor.visual.rotation.set(0,0,0);actor.visual.position.set(0,state.groundOffset||0,0);actor.root.updateMatrixWorld(true);
 const world=v=>actor.root.localToWorld(V(...v).add(V(0,state.groundOffset||0,0)));
 const bone=s=>findRigBone(actor.bones,s);
 const hip=bone('Hips');hip.position.copy(hip.parent.worldToLocal(world([p.shift||0,p.body[3],p.body[4]])));
 const rotate=(suffix,axis,angle)=>{const b=bone(suffix);if(!b)return;
  actor.combatAdjustments.push({bone:b,rotation:b.quaternion.clone()});
  // This solve only reads the joint's parent. Defer updating all descendants
  // until the torso is posed, before the feet use their world transforms.
  b.parent.updateWorldMatrix(true,false);
  const a=axis.clone().applyAxisAngle(Y,state.yaw||0).transformDirection(b.parent.matrixWorld.clone().invert());
  b.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(a,angle));
 };
 rotate('Hips',Y,p.body[0]*.40);rotate('Spine',Y,p.body[0]*.30);rotate('Spine2',Y,p.body[0]*.30);
 // A deep bow folds at the pelvis as well as along the spine; the legs are solved afterwards.
 const bendAxis=p.rakeLean?V(Math.cos(p.rakeLean),0,Math.sin(p.rakeLean)):X;
 if(p.hipPitch)rotate('Hips',bendAxis,-p.hipPitch);
 rotate('Spine',bendAxis,-p.body[1]*.60);rotate('Spine1',bendAxis,-p.body[1]*.40);rotate('Spine2',Z,p.body[2]);
 rotate('Head',X,p.body[1]*.20);
 if(p.headYaw)rotate('Head',Y,p.headYaw);
 // Primary 24.5-26.25 / 43.5-49: eyes remain on the opponent while the
 // shoulders wind across the body. The clavicles lift before elbow extension.
 if(authored&&!special){
  rotate('Head',Y,-p.body[0]*.58);
  for(const [side,key,sign]of [['Right','r',1],['Left','l',-1]]){
   const grip=p[key],lift=smooth(grip[1],2.55,4.12),across=T.MathUtils.clamp(-sign*grip[0],-.5,.65);
   rotate(side+'Shoulder',Z,sign*(lift*.17+across*.08));
   rotate(side+'Shoulder',Y,-sign*(lift*.07+across*.12));
  }
 }
 hip.updateMatrixWorld(true);
 for(const [side,offset]of [['Right',0],['Left',3]]){
  const sign=side==='Right'?1:-1,foot=bone(side+'Foot'),up=Y.clone().transformDirection(foot.matrixWorld),forward=Z.clone().transformDirection(foot.matrixWorld);
  if(side==='Right'&&p.rightToeUp){
   const sideAxis=X.clone().applyAxisAngle(Y,state.yaw||0);
   up.applyAxisAngle(sideAxis,p.rightToeUp);forward.applyAxisAngle(sideAxis,p.rightToeUp);
  }
  const f=p.feet.slice(offset,offset+3);
  if(passingCuts){
   // The raised boot travels around the support boot as the shoulders pass through the cut.
   const other=offset===0?1:0;
   const support=smooth(turn.lift[other],.018,.13)*(1-smooth(f[2],.012,.075));
   if(support>0&&f[2]<p.feet[other*3+2]){
    const heading=(state.yaw||0)+p.turn,scale=actor.presentationScale;
    const offset=V(f[0],0,f[1]);
    if(actor.pivotFoot?.side!==side)actor.pivotFoot={side,point:offset.clone().multiplyScalar(scale).applyAxisAngle(Y,heading).add(state.pos)};
    const correction=actor.pivotFoot.point.clone().sub(state.pos).applyAxisAngle(Y,-heading).divideScalar(scale);
    correction.y=0;correction.sub(offset).clampLength(0,.42);
    offset.addScaledVector(correction,support);f[0]=offset.x;f[1]=offset.z;
   }else if(actor.pivotFoot?.side===side){actor.pivotFoot=null;}
  }
  if(rakeStance){
   actor.rakeAnchors??={};
   const turn=(state.yaw||0)+(p.turn||0);
   const offset=V(f[0],0,f[1]);
   const scale=actor.presentationScale;
   const anchor=actor.rakeAnchors[side];
   if(f[2]<.012&&!anchor)actor.rakeAnchors[side]=offset.clone().multiplyScalar(scale).applyAxisAngle(Y,turn).add(state.pos);
   if(actor.rakeAnchors[side]){
    const fixed=actor.rakeAnchors[side].clone().sub(state.pos).applyAxisAngle(Y,-turn).divideScalar(scale);
    offset.lerp(fixed,1-smooth(f[2],.012,.17));f[0]=offset.x;f[1]=offset.z;
    if(f[2]>=.17)delete actor.rakeAnchors[side];
   }
  }
  if(plantFeet){
   if(f[2]>.012)actor.plantedFeet[side]=null;
   else{
    const planted=actor.plantedFeet[side]??=V(f[0],0,f[1]).applyAxisAngle(Y,p.turn||0).multiplyScalar(1.12).applyAxisAngle(Y,state.yaw||0).add(state.pos);
    const local=planted.clone().sub(state.pos).applyAxisAngle(Y,-(state.yaw||0)).multiplyScalar(1/1.12).applyAxisAngle(Y,-(p.turn||0));
    f[0]=local.x;f[1]=local.z;
   }
  }
  const target=world([f[0],actor.footClearance+f[2],f[1]]),pole=world([sign*.70,1.1,-1.4]);
  const orient=()=>{const inverse=foot.parent.matrixWorld.clone().invert(),localUp=up.clone().transformDirection(inverse),localForward=forward.clone().transformDirection(inverse);localForward.addScaledVector(localUp,-localForward.dot(localUp)).normalize();const across=V().crossVectors(localUp,localForward).normalize();localForward.crossVectors(across,localUp).normalize();foot.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(across,localUp,localForward)).normalize();foot.updateWorldMatrix(false,true);};
  for(let pass=0;pass<2;pass++){
   actor.poseLimb(side,['UpLeg','Leg','Foot'],target,pole);orient();
    if(!pass&&actor.soleProbes?.[side]?.length)target.y+=state.pos.y+(state.groundOffset||0)+f[2]+.018-soleHeight(actor.soleProbes[side]);
  }
 }
 actor.authoredBladeFrames={};
 for(const [side,k]of [['Right','r'],['Left','l']]){
  const v=p[k],sign=side==='Right'?1:-1,h=actor.hand(side),w=actor.weapons.find(w=>w.side===side);if(!h||!w)continue;
  const raised=smooth(v[1],2.8,4.15),armAcross=smooth(-sign*v[0],-.2,.7);
  const elbow=[sign*lerp(1.76,1.30,raised*.7+armAcross*.3),Math.max(1.3,v[1]-.48),lerp(.16,.42,raised)-armAcross*.24];
  actor.poseHand(side,world(v.slice(0,3)),world(elbow));actor.root.updateMatrixWorld(true);
  const q=p[k+'Q']||bladeFrame(v);
  actor.authoredBladeFrames[side]=actor.root.getWorldQuaternion(new T.Quaternion()).normalize().multiply(q);
  // Both blades lie on the floor of a broken stance until the riposte is torn free.
  const restingSword=state.bossAction==='critical'||state.critical&&state.stagger>0&&state.bossAction==='recover';
  const starfall=state.bossAction==='meteor';
  if((state.bossAction==='rocks'||starfall||restingSword)&&w.bladeSections&&state.groundAt){
    const lag=side==='Right'?0:.095,t=state.bossElapsed||0;
    const plant=starfall?smooth(t,METEOR_SEQUENCE.plant-.02+lag,METEOR_SEQUENCE.plant+.17+lag)*(1-smooth(t,METEOR_SEQUENCE.takeoff+.24+lag,METEOR_SEQUENCE.takeoff+.41+lag)):
      restingSword?(state.bossAction==='critical'?1-smooth(t,RIPOSTE_SEQUENCE.release-.04,RIPOSTE_SEQUENCE.release+.22):
        state.phase===1&&state.deflection?.action==='long'?smooth(t,.91+(side==='Right'?.12:0),1.13+(side==='Right'?.09:0)):smooth(t,.70+lag,.94+lag)):
      rockBladePlant(t,side,state.pos.y,state.phase);
    if(plant>0){
      const frame=actor.authoredBladeFrames[side],offset=w.bladeSections.at(-1).center.clone().applyQuaternion(frame);
      const wrist=h.getWorldPosition(V());
      const along=offset.clone().setY(0);
      if(along.lengthSq()>.001){
        if(state.bossAction==='rocks'&&Number.isFinite(state.targetYaw)){
          const mounted=state.phase===2,start=mounted?1.38:2.12,end=mounted?ROCK_SEQUENCE.rise:ROCK_SEQUENCE.liftOff;
          const u=smooth(t,start+lag,end+lag);
          const weight=smooth(t,start-.09+lag,start+.13+lag)*(1-smooth(t,end+.02,end+.27));
          // The tip crosses the player's bearing while both grips and the
          // supporting knee rotate. Work before the final whole-body yaw.
          const az=state.targetYaw-(p.turn||0)+lerp(.92,-.82,u)+(side==='Right'?-.11:.13);
          const want=V(-Math.sin(az),0,-Math.cos(az));
          const signed=Math.atan2(along.z*want.x-along.x*want.z,along.dot(want));
          along.applyAxisAngle(Y,signed*.84*weight);
        }
        const strike=wrist.clone().add(along).sub(state.pos).applyAxisAngle(Y,p.turn||0).add(state.pos);
        const reach=offset.length(),height=T.MathUtils.clamp(state.groundAt(strike.x,strike.z)+.19-wrist.y,-reach+.01,reach-.01);
        along.setLength(Math.sqrt(Math.max(0,reach*reach-height*height))).y=height;
        const correction=new T.Quaternion().setFromUnitVectors(offset.normalize(),along.normalize());
        frame.premultiply(new T.Quaternion().slerp(correction,plant));
      }
    }
  }
  const mount=w.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(X,-2.2)).multiply(new T.Quaternion().setFromAxisAngle(Z,-sign*.8));
  // A round grip permits the palm to roll around the blade axis. Fixing the
  // palm to the blade face forced a full wrist twist and folded the skinning.
  const gripUp=Y.clone().applyQuaternion(actor.authoredBladeFrames[side]);
  const forearm=bone(side+'ForeArm'),gripForward=h.getWorldPosition(V()).sub(forearm.getWorldPosition(V())).normalize();
  gripForward.addScaledVector(gripUp,-gripForward.dot(gripUp));
  if(gripForward.lengthSq()<.015)gripForward.copy(Z).applyQuaternion(actor.authoredBladeFrames[side]);
  gripForward.normalize();
  actor.authoredGripDirections??={};const previousGrip=actor.authoredGripDirections[side];
  if(previousGrip){
   const carried=previousGrip.forward.clone().applyQuaternion(new T.Quaternion().setFromUnitVectors(previousGrip.up,gripUp));
   carried.addScaledVector(gripUp,-carried.dot(gripUp)).normalize();
   const turn=Math.atan2(V().crossVectors(carried,gripForward).dot(gripUp),carried.dot(gripForward));
   gripForward.copy(carried.applyAxisAngle(gripUp,T.MathUtils.clamp(turn,-dt*12,dt*12)));
  }
  actor.authoredGripDirections[side]={up:gripUp.clone(),forward:gripForward.clone()};
  const gripAcross=V().crossVectors(gripUp,gripForward).normalize();gripForward.crossVectors(gripAcross,gripUp).normalize();
  const desired=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(gripAcross,gripUp,gripForward)).multiply(mount.invert()).normalize();
  // The asset has a non-uniform model scale. Transforming the desired axes
  // through its parent matrix avoids decomposing a sheared world rotation.
  const inverse=h.parent.matrixWorld.clone().invert(),up=Y.clone().applyQuaternion(desired).transformDirection(inverse),forward=Z.clone().applyQuaternion(desired).transformDirection(inverse);
  forward.addScaledVector(up,-forward.dot(up)).normalize();const across=V().crossVectors(up,forward).normalize();forward.crossVectors(across,up).normalize();
  h.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(across,up,forward)).normalize();
 }
 actor.root.updateMatrixWorld(true);
 if(p.spin||p.pitch||p.turn){actor.visual.rotation.set(p.pitch||0,p.turn||0,p.spin||0);if(state.groundedRush&&state.bossAction==='leap'||p.pivot){const pivot=V(0,p.pivot||2.2,0);actor.visual.position.add(pivot.clone().sub(pivot.applyEuler(actor.visual.rotation)));}}
 if(p.spin||p.pitch||p.turn){const rootRotation=actor.root.getWorldQuaternion(new T.Quaternion()).normalize(),turn=rootRotation.clone().multiply(actor.visual.quaternion).multiply(rootRotation.clone().invert());for(const q of Object.values(actor.authoredBladeFrames))q.premultiply(turn);}
 return true;
}

export function reshapeWarlordBody(actor){
 if(actor.name!=='gilded_warlord')return;
 actor.root.updateMatrixWorld(true);
 const shoulders=['Right','Left'].map(side=>findRigBone(actor.bones,side+'Arm').getWorldPosition(V()));
 const elbows=['Right','Left'].map(side=>findRigBone(actor.bones,side+'ForeArm').getWorldPosition(V()));
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const geometry=mesh.geometry.clone(),p=geometry.attributes.position,world=mesh.matrixWorld,inv=world.clone().invert(),steel=[],armCoords=[],gloves=[],faces=[],chest=[];
  for(let i=0;i<p.count;i++){
   const v=V().fromBufferAttribute(p,i).applyMatrix4(world),shoulder=smooth(v.y,2.55,3.25)*(1-smooth(v.y,3.75,4.12));
   const side=shoulders[0].distanceToSquared(v)<shoulders[1].distanceToSquared(v)?0:1,center=shoulders[side],offset=v.clone().sub(center),axis=elbows[side].clone().sub(center),along=offset.dot(axis)/axis.lengthSq();
   let armInfluence=0,handInfluence=0,headInfluence=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[geometry.attributes.skinIndex.getComponent(i,k)].name,weight=geometry.attributes.skinWeight.getComponent(i,k);if(/(?:Right|Left)Arm$/.test(name))armInfluence+=weight;if(/Hand/.test(name))handInfluence+=weight;if(/Head$/.test(name))headInfluence+=weight;}
   const sleeve=smooth(along,-.12,.10)*(1-smooth(along,.95,1.10))*armInfluence;steel.push(sleeve);
   const radial=offset.clone().addScaledVector(axis,-along),angle=Math.atan2(radial.z,radial.y);
   armCoords.push(along,angle);gloves.push(handInfluence);faces.push(headInfluence);
   const chestWeight=(1-smooth(Math.abs(v.x),.48,.78))*smooth(v.y,2.55,2.9)*(1-smooth(v.y,3.65,3.85))*(1-smooth(v.z,-.35,-.14));chest.push(chestWeight);
   if(v.z<-.36)v.z=lerp(v.z,-.40,chestWeight*.68);
   const band=1-Math.pow(.5+.5*Math.cos(along*Math.PI*10),5);
   v.addScaledVector(radial,band*.09*sleeve);
   const cap=(1-smooth(offset.length(),.30,.68))*smooth(offset.y,-.18,.08);
   v.addScaledVector(offset,cap*.36);v.y+=cap*.07;
   v.x*=1+shoulder*.13;v.z*=1+shoulder*.08;
   v.applyMatrix4(inv);p.setXYZ(i,v.x,v.y,v.z);
  }
  geometry.setAttribute('bossSteelWeight',new T.Float32BufferAttribute(steel,1));
  geometry.setAttribute('bossArmCoord',new T.Float32BufferAttribute(armCoords,2));geometry.setAttribute('bossGloveWeight',new T.Float32BufferAttribute(gloves,1));geometry.setAttribute('bossFaceWeight',new T.Float32BufferAttribute(faces,1));
  geometry.setAttribute('bossChestWeight',new T.Float32BufferAttribute(chest,1));
  // The auto-rigged hand surface folds into long spikes at the knuckles. Keep
  // its wrist seam and replace only hand-dominant triangles with articulated
  // gauntlet surfaces attached to the original hand and finger joints below.
  const originalIndices=geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,i)=>i),kept=[];
  for(let i=0;i<originalIndices.length;i+=3)if(!originalIndices.slice(i,i+3).some(index=>gloves[index]>.55))kept.push(...originalIndices.slice(i,i+3));
  geometry.setIndex(kept);
  p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();mesh.geometry=geometry;
  const previous=mesh.material.onBeforeCompile,cache=mesh.material.customProgramCacheKey();
  mesh.material.onBeforeCompile=shader=>{
   previous?.call(mesh.material,shader);
   shader.vertexShader='attribute float bossSteelWeight;attribute vec2 bossArmCoord;attribute float bossGloveWeight;attribute float bossFaceWeight;attribute float bossChestWeight;varying float vBossSteel;varying vec2 vBossArmCoord;varying float vBossGlove;varying float vBossFace;varying float vBossChest;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBossSteel=bossSteelWeight;vBossArmCoord=bossArmCoord;vBossGlove=bossGloveWeight;vBossFace=bossFaceWeight;vBossChest=bossChestWeight;');
   shader.fragmentShader='varying float vBossSteel;varying vec2 vBossArmCoord;varying float vBossGlove;varying float vBossFace;varying float vBossChest;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float skinRG=diffuseColor.r/max(.01,diffuseColor.g),skinGB=diffuseColor.g/max(.01,diffuseColor.b);
    float steelLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    float bareSkin=smoothstep(1.09,1.27,skinRG)*smoothstep(1.12,1.48,skinGB);
    float plateLine=pow(.5+.5*cos(vBossArmCoord.x*31.4159),12.0);
    float scalePattern=pow(.5+.5*cos(vBossArmCoord.y*15.0+sin(vBossArmCoord.x*63.0)*1.8),8.0);
    vec3 coveredSteel=vec3(pow(max(steelLuma,.00001),.88))*mix(vec3(.62,.59,.49),vec3(1.18,1.01,.68),plateLine*.72+scalePattern*.16);
    diffuseColor.rgb=mix(diffuseColor.rgb,coveredSteel,vBossSteel*mix(.55,1.,bareSkin));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(steelLuma)*vec3(.77,.66,.52),vBossGlove*.68);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(steelLuma)*vec3(1.08,.96,.76),vBossChest*.58);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(steelLuma)*vec3(.88,.81,.70),vBossFace*.64);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.78,vBossGlove);roughnessFactor=mix(roughnessFactor,.82,vBossFace);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.32,vBossGlove);metalnessFactor=mix(metalnessFactor,.05,vBossFace);');
  };mesh.material.customProgramCacheKey=()=>cache+'|warlord-relief-y';
 });
 // Raised, tapered pauldrons follow the shoulder joints. They retain their
 // solid silhouette while the upper arm bends underneath the overlapping rim.
 const bronze=new T.MeshStandardMaterial({color:0x89764e,roughness:.63,metalness:.48});
 const iron=new T.MeshStandardMaterial({color:0x514d42,roughness:.72,metalness:.40,side:T.DoubleSide});
 const leather=new T.MeshStandardMaterial({color:0x292820,roughness:.93,metalness:.08});
 for(const side of ['Right','Left']){
  const hand=actor.hand(side),fingerBone=(finger,joint)=>findRigBone(actor.bones,side+'Hand'+finger+joint);
  const index=fingerBone('Index',1).position,pinky=fingerBone('Pinky',1).position,middle=fingerBone('Middle',1).position;
  const palmAcross=index.clone().sub(pinky).normalize(),palmForward=middle.clone().normalize(),palmNormal=V().crossVectors(palmAcross,palmForward).normalize();palmAcross.crossVectors(palmForward,palmNormal).normalize();
  const palmRotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(palmAcross,palmForward,palmNormal));
  const palm=new T.Mesh(new T.SphereGeometry(1,16,12),leather);palm.scale.set(.054,.071,.027);palm.position.copy(palmForward).multiplyScalar(.060);palm.quaternion.copy(palmRotation);palm.castShadow=palm.receiveShadow=true;palm.name='gauntlet-palm-'+side;hand.add(palm);
  const back=new T.Mesh(new T.SphereGeometry(1,16,10),bronze);back.scale.set(.052,.062,.016);back.position.copy(palm.position).addScaledVector(palmNormal,.018);back.quaternion.copy(palmRotation);back.castShadow=back.receiveShadow=true;hand.add(back);
  for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let joint=1;joint<=3;joint++){
   const bone=fingerBone(finger,joint),next=fingerBone(finger,joint+1);if(!bone||!next)continue;
   const length=next.position.length(),radius=(finger==='Thumb'?.012:finger==='Pinky'?.0088:.0105)*(joint===1?1.1:1);
   const segment=new T.Mesh(new T.CapsuleGeometry(radius,Math.max(.002,length-radius*1.6),4,10),joint===1?bronze:iron);segment.quaternion.setFromUnitVectors(Y,next.position.clone().normalize());segment.position.copy(next.position).multiplyScalar(.5);segment.castShadow=segment.receiveShadow=true;segment.name='gauntlet-'+side+'-'+finger+'-'+joint;bone.add(segment);
   const knuckle=new T.Mesh(new T.SphereGeometry(radius*1.12,10,8),bronze);knuckle.scale.set(1,.7,1);knuckle.castShadow=true;bone.add(knuckle);
  }
  const arm=findRigBone(actor.bones,side+'Arm'),mount=arm.parent,center=arm.getWorldPosition(V()),sign=Math.sign(center.x)||1,inverse=mount.matrixWorld.clone().invert();
  for(let i=0;i<7;i++){
   // Cinematic 7 s: overlapping fluted leaves lie along the lion pauldron;
   // they are broad at the root and sweep back, not three upright horns.
   const z=-.20+i*.073,curve=new T.CatmullRomCurve3([center.clone().add(V(sign*.05,.13,z)),center.clone().add(V(sign*.24,.19,z+.025)),center.clone().add(V(sign*(.48-i*.012),.29,z+.10)),center.clone().add(V(sign*(.64-i*.025),.34-i*.018,z+.19))]);
   const geo=new T.TubeGeometry(curve,20,1,8,false),positions=geo.attributes.position;
   for(let n=0;n<positions.count;n++){const t=Math.floor(n/9)/20,at=curve.getPointAt(t),width=(.056+.024*Math.sin(t*Math.PI))*Math.pow(1-t,.7),v=V().fromBufferAttribute(positions,n).sub(at).multiplyScalar(width);v.y*=.24;v.add(at).applyMatrix4(inverse);positions.setXYZ(n,v.x,v.y,v.z);}
   geo.computeVertexNormals();const leaf=new T.Mesh(geo,bronze);leaf.name='pauldron-fluted-leaf-'+side+'-'+i;leaf.castShadow=leaf.receiveShadow=true;mount.add(leaf);
   const rib=new T.TubeGeometry(curve,20,.0065,5,false);rib.applyMatrix4(inverse);mount.add(new T.Mesh(rib,bronze));
  }
  // Five overlapping lames bridge the shoulder cap and elbow. Their scalloped
  // rims and chased ribs are geometry, so the relief survives grazing light.
  const elbow=findRigBone(actor.bones,side+'ForeArm').getWorldPosition(V()),axis=elbow.clone().sub(center),along=axis.clone().normalize();
  const front=Z.clone().addScaledVector(along,-Z.dot(along)).normalize(),around=V().crossVectors(along,front).normalize(),armInverse=arm.matrixWorld.clone().invert();
  const surface=(u,a,lift=0)=>center.clone().addScaledVector(axis,u).addScaledVector(front,Math.cos(a)*(lerp(.325,.24,u)+lift)).addScaledVector(around,Math.sin(a)*(lerp(.345,.26,u)+lift));
  for(let layer=0;layer<5;layer++){
   const u0=.18+layer*.135,vertices=[],indices=[];
   for(let row=0;row<=4;row++)for(let column=0;column<=40;column++){
    const a=column/40*Math.PI*2,f=row/4,u=u0+f*(.18+.018*Math.cos(a*6));
    const v=surface(u,a,(1-f)*.022+Math.sin(f*Math.PI)*.013).applyMatrix4(armInverse);vertices.push(...v.toArray());
    if(row<4&&column<40){const n=row*41+column;indices.push(n,n+41,n+1,n+1,n+41,n+42);}
   }
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
   const plate=new T.Mesh(geometry,iron);plate.name='upper-arm-lame-'+side+'-'+layer;plate.castShadow=plate.receiveShadow=true;arm.add(plate);
   const rimPoints=[];for(let j=0;j<=64;j++){const a=j/64*Math.PI*2;rimPoints.push(surface(u0+.18+.018*Math.cos(a*6),a,.008));}
   const rimGeometry=new T.TubeGeometry(new T.CatmullRomCurve3(rimPoints),64,.009,5,false);rimGeometry.applyMatrix4(armInverse);const rim=new T.Mesh(rimGeometry,bronze);arm.add(rim);
  }
 }
 // Keep the reduced chest projection. The former rigid chevrons pulled away
 // from the weighted torso during turns and are not part of the reference.
 // Batch all rigid armor pieces into one skinned draw. Each vertex retains
 // its owning joint, so fingers and overlapping plates still articulate.
 actor.root.updateMatrixWorld(true);
 const pieces=[];actor.model.traverse(mesh=>{if(mesh.isMesh&&[bronze,iron,leather].includes(mesh.material))pieces.push(mesh);});
 const joints=[...new Set(pieces.map(mesh=>mesh.parent))],modelInverse=actor.model.matrixWorld.clone().invert();
 const vertices=[],normals=[],colors=[],skinIndices=[],skinWeights=[],indices=[];
 for(const piece of pieces){
  const geometry=piece.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,matrix=modelInverse.clone().multiply(piece.matrixWorld),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),offset=vertices.length/3,joint=joints.indexOf(piece.parent),color=piece.material.color;
  for(let i=0;i<p.count;i++){
   vertices.push(...V().fromBufferAttribute(p,i).applyMatrix4(matrix).toArray());normals.push(...V().fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize().toArray());
   colors.push(color.r,color.g,color.b);skinIndices.push(joint,0,0,0);skinWeights.push(1,0,0,0);
  }
  const source=geometry.index?geometry.index.array:Array.from({length:p.count},(_,i)=>i);for(const i of source)indices.push(offset+i);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));geometry.setIndex(indices);
 const armor=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.80,metalness:.40,side:T.DoubleSide}));armor.name='articulated-warlord-armor';armor.castShadow=armor.receiveShadow=true;armor.frustumCulled=false;actor.model.add(armor);actor.root.updateMatrixWorld(true);armor.bind(new T.Skeleton(joints));
 for(const piece of pieces){piece.removeFromParent();piece.geometry.dispose();}bronze.dispose();iron.dispose();leather.dispose();
 // Sole probes come from the rendered boot surface, not its ankle joint.
 // The right/left auto-rig has different sole offsets, so one ankle height
 // made one boot penetrate the floor while the other appeared planted.
 actor.soleProbes={};
 for(const side of ['Right','Left']){
  const samples=[];actor.model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const a=mesh.geometry.attributes,ids=mesh.geometry.index?new Set(mesh.geometry.index.array):Array.from({length:a.position.count},(_,i)=>i);for(const index of ids){let weight=0;for(let k=0;k<4;k++)if(new RegExp(side+'(?:Foot|ToeBase)').test(mesh.skeleton.bones[a.skinIndex.getComponent(index,k)].name))weight+=a.skinWeight.getComponent(index,k);if(weight>.4)samples.push({mesh,index,y:mesh.getVertexPosition(index,V()).applyMatrix4(mesh.matrixWorld).y});}});
  samples.sort((a,b)=>a.y-b.y);actor.soleProbes[side]=samples.filter(s=>s.y<=samples[0].y+.11);
 }
}

// Fit the existing consort_warlord skin in its 1.80 m bind coordinates.
// +X faces the camera, Z crosses the shoulders. The primary 24.5 s frame
// shows horns sweeping outward from the cheeks and broad overlapping spaulders.
export function fitConsortArmour(actor){
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const geometry=mesh.geometry, {position,skinIndex,skinWeight}=geometry.attributes;
  const shades=new Float32Array(position.count*3),gilt=new Float32Array(position.count);
  const roles=mesh.skeleton.bones.map(b=>/Head$/.test(b.name)?1:/Shoulder$|Arm$/.test(b.name)&&!/ForeArm$/.test(b.name)?2:0);
  for(let i=0;i<position.count;i++){
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i),across=Math.abs(z);
   let head=0,arm=0;
   for(let k=0;k<4;k++){
    const role=roles[skinIndex.getComponent(i,k)],weight=skinWeight.getComponent(i,k);
    if(role===1)head+=weight;
    if(role===2)arm+=weight;
   }
   const horn=head*smooth(across,.086,.163)*smooth(x,.005,.095)*smooth(y,1.54,1.59)*(1-smooth(y,1.705,1.74));
   const plate=arm*smooth(across,.12,.19)*(1-smooth(across,.29,.39))*smooth(y,1.36,1.49);
   const cheek=head*smooth(across,.068,.112)*smooth(x,.052,.13)*smooth(y,1.53,1.565)*(1-smooth(y,1.66,1.69));
   const score=.5+.5*Math.cos((y-.17*across-.11*x)*955+1.1*Math.sin(across*34));
   const inset=.17*cheek*(1-score)**2;
   // The exposed lower face is russet beneath the cheek guards.
   const jaw=head*(1-smooth(across,.023,.048))*smooth(x,.13,.18)*smooth(y,1.547,1.56)*(1-smooth(y,1.59,1.61));
   // Long striations follow the upward bend of the horn. Recessed shoulder
   // tiers deepen towards the arm, leaving the carved lion brows in the light.
   const grain=.5+.5*Math.cos((y-.23*across-.55*across*across)*384+Math.sin(across*29)*.35);
   const hornShade=horn*(.07+.22*grain**2);
   const plateShade=plate*.21*(1-smooth(y,1.47,1.55));
   const relief=1-hornShade-plateShade;
   gilt[i]=Math.max(horn*(.44+.50*grain),plate*(.48+.36*smooth(y,1.42,1.54)),cheek*.45);
   shades.set([relief*(1-.76*inset-.12*jaw),relief*(1-inset-.40*jaw),relief*(1-1.23*inset-.50*jaw)],i*3);
   position.setXYZ(i,x+.022*horn+.013*plate+.0023*cheek*score,y-.013*horn+.014*plate,z+Math.sign(z)*(.047*horn+.016*plate));
  }
  geometry.setAttribute('color',new T.Float32BufferAttribute(shades,3));
  mesh.material.vertexColors=true;mesh.material.needsUpdate=true;
  position.needsUpdate=true;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  fitConsortVisor(mesh,actor.ultra);
  geometry.setAttribute('consortGilt',new T.Float32BufferAttribute(gilt,1));
  const base=mesh.material,previous=base.onBeforeCompile,cache=base.customProgramCacheKey();
  base.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);
   shader.vertexShader='attribute float consortGilt;varying float giltWear;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngiltWear=consortGilt;');
   shader.fragmentShader='varying float giltWear;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float giltValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    diffuseColor.rgb+=giltWear*(.073+.19*sqrt(max(0.,giltValue)))*vec3(1.,.78,.44);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.76,giltWear);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.355,giltWear);');
  };
  base.customProgramCacheKey=()=>cache+'|consort-worn-gilt';base.needsUpdate=true;
 });
}

// Sole probes come from the rendered boot surface of whichever body mesh is loaded.
export function probeWarlordSoles(actor){
 actor.root.updateMatrixWorld(true);actor.soleProbes={};
 for(const side of ['Right','Left']){
  const samples=[];actor.model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const a=mesh.geometry.attributes,ids=mesh.geometry.index?new Set(mesh.geometry.index.array):Array.from({length:a.position.count},(_,i)=>i);for(const index of ids){let weight=0;for(let k=0;k<4;k++)if(new RegExp(side+'(?:Foot|ToeBase)').test(mesh.skeleton.bones[a.skinIndex.getComponent(index,k)].name))weight+=a.skinWeight.getComponent(index,k);if(weight>.4)samples.push({mesh,index,y:mesh.getVertexPosition(index,V()).applyMatrix4(mesh.matrixWorld).y});}});
  samples.sort((a,b)=>a.y-b.y);actor.soleProbes[side]=samples.filter(s=>s.y<=samples[0].y+.11);
 }
}
export function reshapeWarlordCrown(model,shell){
 // Preserve the textured metal shell and cheek plates; replace its thin crest
 // with overlapping locks matching the primary 38-40s and transition side view.
 shell.updateMatrixWorld(true);
 const metal=new T.MeshStandardMaterial({color:0x88724c,metalness:.63,roughness:.68}),pieces=[];
 const metalCanvas=document.createElement('canvas');metalCanvas.width=metalCanvas.height=256;
 const metalContext=metalCanvas.getContext('2d'),metalPixels=metalContext.createImageData(256,256);
 const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
 const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;return lerp(lerp(hash(ix,iy),hash(ix+1,iy),u),lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);};
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4,value=128+(noise(x*.055,y*.055)-.5)*80+(noise(x*.23,y*.23)-.5)*40+(hash(x,y)-.5)*15;metalPixels.data[i]=metalPixels.data[i+1]=metalPixels.data[i+2]=value;metalPixels.data[i+3]=255;}
 metalContext.putImageData(metalPixels,0,0);metal.bumpMap=new T.CanvasTexture(metalCanvas);metal.bumpScale=.018;
 metal.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 vPlatePosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPlatePosition=position;');
  shader.fragmentShader='varying vec3 vPlatePosition;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec3 plate=vPlatePosition;float patina=.5+.5*sin(plate.x*17.+sin(plate.y*21.)*2.3+cos(plate.z*18.))*sin(plate.y*23.+plate.x*8.);
   float grain=fract(sin(dot(floor(plate.xy*1700.),vec2(12.9898,78.233)))*43758.5453);
   diffuseColor.rgb*=.75+patina*.35+grain*.08;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.50,.74,patina);');
 };metal.customProgramCacheKey=()=> 'chased-lion-visor-t';
 // The close cinematic reference has a lion visor around recessed eye slots,
 // leaving the mouth/chin visible. It is not an exposed face below a circlet.
 for(const sign of [-1,1]){
  const plate=new T.Shape();plate.moveTo(sign*.008,-.065);plate.bezierCurveTo(sign*.08,-.075,sign*.16,-.015,sign*.25,.015);plate.lineTo(sign*.265,-.20);plate.quadraticCurveTo(sign*.24,-.29,sign*.17,-.35);plate.lineTo(sign*.115,-.31);plate.lineTo(sign*.065,-.265);plate.lineTo(sign*.012,-.24);plate.closePath();
  const eye=new T.Path();eye.moveTo(sign*.055,-.177);eye.quadraticCurveTo(sign*.11,-.150,sign*.197,-.157);eye.lineTo(sign*.175,-.207);eye.quadraticCurveTo(sign*.12,-.227,sign*.060,-.216);eye.closePath();plate.holes.push(eye);
  const geometry=new T.ExtrudeGeometry(plate,{depth:.024,bevelEnabled:true,bevelSize:.009,bevelThickness:.008,bevelSegments:3,curveSegments:12,steps:1});
  const a=geometry.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i);a.setZ(i,a.getZ(i)-.420+Math.pow(x/.265,2)*.075-.018*Math.sin((y+.35)*8));}geometry.computeVertexNormals();pieces.push(geometry);
  for(const [points,radius]of [
   [[V(sign*.02,-.132,-.450),V(sign*.08,-.12,-.448),V(sign*.15,-.132,-.435),V(sign*.22,-.10,-.392)],.022],
   [[V(sign*.035,-.235,-.461),V(sign*.085,-.247,-.461),V(sign*.14,-.238,-.435),V(sign*.19,-.269,-.407)],.015],
   [[V(sign*.07,-.27,-.455),V(sign*.10,-.30,-.448),V(sign*.15,-.28,-.438),V(sign*.135,-.255,-.442)],.012]
  ])pieces.push(new T.TubeGeometry(new T.CatmullRomCurve3(points),20,radius,7,false));
 }
 const nosePositions=[],noseIndices=[];
 for(let row=0;row<=16;row++)for(let col=0;col<=16;col++){
  const f=row/16,u=col/8-1,width=.064*(1-Math.pow(f,2.3))+.003,y=-.115-f*.25;
  nosePositions.push(u*width,y,-.445-.07*Math.sin(f*Math.PI*.85)-.024*(1-u*u)*Math.sin(f*Math.PI));
  if(row<16&&col<16){const n=row*17+col;noseIndices.push(n,n+1,n+17,n+1,n+18,n+17);}
 }
 const noseGeometry=new T.BufferGeometry();noseGeometry.setAttribute('position',new T.Float32BufferAttribute(nosePositions,3));noseGeometry.setIndex(noseIndices);noseGeometry.computeVertexNormals();pieces.push(noseGeometry);
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;const g=mesh.geometry.clone(),p=g.attributes.position,world=mesh.matrixWorld,inv=world.clone().invert(),discard=[];
  let pixels=null,tw=0,th=0;const map=mesh.material.map;
  if(map?.image&&g.attributes.uv){const c=document.createElement('canvas');tw=c.width=map.image.width;th=c.height=map.image.height;const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(map.image,0,0);pixels=context.getImageData(0,0,tw,th).data;}
  for(let i=0;i<p.count;i++){
   const v=V().fromBufferAttribute(p,i).applyMatrix4(world);let redHair=false;
   if(pixels&&v.y>-.08){const uv=g.attributes.uv,u=T.MathUtils.clamp(uv.getX(i),0,.999999),vv=T.MathUtils.clamp(map.flipY?1-uv.getY(i):uv.getY(i),0,.999999),k=(Math.floor(vv*th)*tw+Math.floor(u*tw))*4;redHair=pixels[k]>35&&pixels[k]>pixels[k+1]*1.52&&pixels[k]>pixels[k+2]*1.25;}
   // Remove the generated squared-off crest below the old height cut as well.
   // The swept, articulated mane supplies its entire replacement silhouette.
   discard[i]=v.y>.26||redHair;
   v.x*=1.18;v.y*=.84;v.applyMatrix4(inv);p.setXYZ(i,v.x,v.y,v.z);
  }
  const ids=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i),keep=[];
  for(let i=0;i<ids.length;i+=3)if(!discard[ids[i]]&&!discard[ids[i+1]]&&!discard[ids[i+2]])keep.push(ids[i],ids[i+1],ids[i+2]);
  g.setIndex(keep);g.computeVertexNormals();mesh.geometry=g;
 });
 // The brow ornament is a layered wing sweeping back around the temple.
 // Broad flattened leaves replace the round, laterally projecting horns.
 for(const sign of [-1,1])for(let feather=0;feather<7;feather++){
  const curve=new T.CatmullRomCurve3([V(sign*.20,-.17+feather*.014,-.19+feather*.015),V(sign*.37,-.18+feather*.018,-.19+feather*.015),V(sign*(.50+feather*.012),-.13+feather*.023,-.14+feather*.016),V(sign*(.59+feather*.009),-.03+feather*.027,-.09+feather*.017)]);
  const geo=new T.TubeGeometry(curve,24,1,8,false),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
   const f=Math.floor(i/9)/24,center=curve.getPointAt(f),v=V().fromBufferAttribute(p,i).sub(center),width=(.014+.023*Math.sin(Math.PI*f))*Math.pow(1-f,.55);
   v.multiplyScalar(width);v.z*=.26;v.add(center);p.setXYZ(i,v.x,v.y,v.z);
  }
  geo.computeVertexNormals();pieces.push(geo);
 }
 // A raised fluted forehead and wide, nearly horizontal wings distinguish
 // the reference helmet from the generated open-faced horned circlet.
 const browPositions=[],browIndices=[];
 for(let row=0;row<=12;row++)for(let col=0;col<=24;col++){
  const u=col/12-1,v=row/12,x=u*(.24+.022*Math.sin(v*Math.PI)),y=-.12+v*(.32+.045*Math.cos(u*Math.PI)),z=-.32+.13*u*u-.055*Math.sin(v*Math.PI);
  browPositions.push(x,y,z);if(row<12&&col<24){const n=row*25+col;browIndices.push(n,n+25,n+1,n+1,n+25,n+26);}
 }
 const brow=new T.BufferGeometry();brow.setAttribute('position',new T.Float32BufferAttribute(browPositions,3));brow.setIndex(browIndices);brow.computeVertexNormals();pieces.push(brow);
 for(let i=-6;i<=6;i++){
  const u=i/6,curve=new T.CatmullRomCurve3([V(u*.06,-.11,-.339+u*u*.04),V(u*.13,-.02,-.375+u*u*.04),V(u*.22,.11,-.366+u*u*.10),V(u*.24,.20+.045*Math.cos(u*Math.PI),-.323+u*u*.13)]);
  for(const point of curve.points)point.z-=.026;
  const rib=new T.TubeGeometry(curve,24,1,6,false),p=rib.attributes.position;
  for(let n=0;n<p.count;n++){const t=Math.floor(n/7)/24,center=curve.getPointAt(t),v=V().fromBufferAttribute(p,n).sub(center).multiplyScalar((.008+.013*Math.sin(t*Math.PI))*(1-t*.45)).add(center);p.setXYZ(n,...v.toArray());}rib.computeVertexNormals();pieces.push(rib);
  if(i&&i%2===0)for(const direction of [-1,1])pieces.push(new T.TubeGeometry(new T.CatmullRomCurve3([curve.getPoint(.28),curve.getPoint(.48).add(V(direction*.023,0,-.003)),curve.getPoint(.68)]),14,.0045,5,false));
 }
 for(const sign of [-1,1]){
  const cheek=new T.Shape();cheek.moveTo(sign*.25,-.13);cheek.lineTo(sign*.24,-.32);cheek.lineTo(sign*.13,-.43);cheek.lineTo(sign*.10,-.29);cheek.lineTo(sign*.16,-.18);cheek.closePath();
  pieces.push(new T.ExtrudeGeometry(cheek,{depth:.024,bevelEnabled:true,bevelSize:.009,bevelThickness:.008,bevelSegments:2,steps:1}).translate(0,0,-.285));
 }
 const detailGeometry=mergeGeometries(pieces.map(geometry=>{const g=geometry.index?geometry.toNonIndexed():geometry;for(const name of Object.keys(g.attributes))if(!['position','normal'].includes(name))g.deleteAttribute(name);return g;}));
 const plateUV=[],platePoints=detailGeometry.attributes.position;for(let i=0;i<platePoints.count;i++)plateUV.push((platePoints.getX(i)+.75)/1.5,(platePoints.getY(i)+.5)/.95);detailGeometry.setAttribute('uv',new T.Float32BufferAttribute(plateUV,2));
 const details=new T.Mesh(detailGeometry,metal);details.name='fluted-winged-helmet';details.castShadow=details.receiveShadow=true;shell.add(details);
 const vertices=[],colors=[],uv=[],indices=[];
 // Locks leave a rounded scalp in small clumps. High center locks curl up
 // and back, while the lower temple locks fall between the shoulders.
 const guides=56,strands=12,segments=13;
 for(let i=0;i<guides;i++){
  const az=i*2.39996,side=Math.sin(az),depth=Math.cos(az);
  const mid=1-Math.abs(side)*.68,variation=.5+.5*Math.sin(i*5.43);
  const hanging=i%5===0,reach=.59+.43*variation;
  const lift=hanging?.12+.09*variation:(.35+.43*mid)*(.75+.40*variation);
  const curl=Math.sin(i*1.67)*.17;
  for(let j=0;j<strands;j++){
   const phase=az+j*.43,offset=(j/(strands-1)-.5)*.12;
   const fiber=.5+.5*Math.sin(i*7.13+j*2.57),tipLength=.82+.30*fiber;
   const x0=side*(.19+.085*variation)+offset*Math.cos(az);
   const y0=.01+.11*mid+.028*Math.sin(phase*2.3);
   const z0=.015+depth*.12-offset*Math.sin(az);
   const shade=(.74+.22*variation)*(.83+.17*Math.sin(j*2.7));
   const col=new T.Color(j%5===0?0x9c3d30:i%5===0?0x652024:0x802b29).multiplyScalar(shade);
   const base=vertices.length/3;
   for(let q=0;q<=segments;q++){
    const f=q/segments,wave=Math.sin(Math.PI*f);
    const swing=(.20+.19*variation)*f+curl*Math.sin(f*6+i*.37)*f+.073*Math.sin(phase+f*4)*f;
    const xx=x0+side*swing+.055*Math.sin(phase+f*7)*wave;
    const yy=y0+lift*(.86+.18*fiber)*Math.sin(Math.PI*f*(.74+.16*variation))
      -(hanging?.66:.23+.14*(1-mid))*f*f+.065*Math.sin(phase*.6+f*9)*wave;
    const zz=z0+reach*f*(.60+.58*f)*tipLength+depth*swing*.34+.078*Math.sin(phase+f*6)*wave;
    const width=(j%4===0?.006:.012+.006*(j%3)/2)*Math.pow(1-f*.99,.74)*(.76+.24*wave);
    const turn=az*.64+curl+f*(.77+.3*Math.sin(i));
    for(const edge of [-1,0,1]){
     const convex=(1-edge*edge)*width*.55,tone=.66+.34*Math.sin(f*Math.PI*.68);
     vertices.push(xx+edge*width*Math.cos(turn)+convex*Math.sin(turn),yy+edge*width*.22*Math.sin(f*6+phase),
       zz-edge*width*Math.sin(turn)+convex*Math.cos(turn));colors.push(col.r*tone,col.g*tone,col.b*tone);uv.push((edge+1)/2,f);
    }
    if(q<segments){const k=base+q*3;indices.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
   }
  }
 }
 // Three interwoven strands form each short side braid. Bake them into the
 // same hair draw; six new objects would add unnecessary per-frame overhead.
 for(const sign of [-1,1])for(let strand=0;strand<3;strand++){
  const points=[];for(let i=0;i<=48;i++){const f=i/48,angle=f*Math.PI*12+strand*Math.PI*2/3,r=.026*(1-f*.42);points.push(V(sign*(.33+.05*Math.sin(f*Math.PI))+Math.cos(angle)*r,-.12-f*.87,-.24-.30*f+Math.sin(angle)*r));}
  const braid=new T.TubeGeometry(new T.CatmullRomCurve3(points),72,.017,6,false),a=braid.attributes.position,offset=vertices.length/3,col=new T.Color(strand===1?0x8b2d1b:0x612014);
  for(let i=0;i<a.count;i++){vertices.push(a.getX(i),a.getY(i),a.getZ(i));colors.push(col.r,col.g,col.b);uv.push(.5,.05);}
  for(const index of braid.index.array)indices.push(offset+index);braid.dispose();
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;const ctx=canvas.getContext('2d');
 const field=ctx.createLinearGradient(0,0,64,0);
 for(const [f,alpha] of [[0,0],[.23,.16],[.48,.27],[.76,.17],[1,0]])field.addColorStop(f,'rgba(235,227,217,'+alpha+')');
 ctx.fillStyle=field;ctx.fillRect(0,0,64,256);
 for(let strand=0;strand<19;strand++){
  const x=1.8+strand*3.33,end=197+(strand*37)%60;
  const line=ctx.createLinearGradient(0,0,0,end);line.addColorStop(0,'rgba(169,162,153,.82)');
  line.addColorStop(.44,'rgba(248,235,215,.97)');line.addColorStop(.82,'rgba(232,218,201,.67)');line.addColorStop(1,'rgba(232,218,201,0)');
  ctx.strokeStyle=line;ctx.lineWidth=.85+(strand%4)*.33;ctx.beginPath();
  for(let y=0;y<=end;y+=5){const u=y/end,xx=x+Math.sin(u*6.5+strand*.45)*1.7+u*u*(32-x)*.26;
   if(y===0)ctx.moveTo(xx,y);else ctx.lineTo(xx,y);}
  ctx.stroke();
 }
 const map=new T.CanvasTexture(canvas);
 const mane=new T.Mesh(g,new T.MeshStandardMaterial({map,alphaTest:.18,vertexColors:true,roughness:1,side:T.DoubleSide}));mane.name='warlord-red-mane';mane.castShadow=mane.receiveShadow=true;shell.add(mane);return mane;
}

export function fitGreatbladeGrip(actor,weapon){
 if(actor.name!=='gilded_warlord')return;
 const saved=Object.values(actor.bones).map(b=>[b,b.quaternion.clone(),b.position.clone()]);
 for(const p of actor.thrustBasePose){p.bone.quaternion.copy(p.q);p.bone.position.copy(p.p);}
 actor.root.updateMatrixWorld(true);
 const side=weapon.side,sign=side==='Right'?1:-1,hand=actor.hand(side);
 const bone=s=>findRigBone(actor.bones,side+'Hand'+s);
 const index=hand.worldToLocal(bone('Index1').getWorldPosition(V())),pinky=hand.worldToLocal(bone('Pinky1').getWorldPosition(V())),middle=hand.worldToLocal(bone('Middle1').getWorldPosition(V())),wrist=V();
 const up=index.sub(pinky).normalize(),forward=middle.sub(wrist).normalize();forward.addScaledVector(up,-forward.dot(up)).normalize();
 const across=V().crossVectors(up,forward).normalize();forward.crossVectors(across,up).normalize();
 const blade=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,up,forward));
 const fixed=new T.Quaternion().setFromAxisAngle(X,-2.2).multiply(new T.Quaternion().setFromAxisAngle(Z,-sign*.8));
 weapon.handBindInverse.copy(blade.multiply(fixed.invert())).normalize();
 for(const [b,q,p]of saved){b.quaternion.copy(q);b.position.copy(p);}actor.root.updateMatrixWorld(true);
}

export function closeGreatbladeHands(actor){
 if(actor.name!=='gilded_warlord'||!actor.thrustBasePose)return;
 actor.closeWeaponHands();
}

export function reshapeGreatblade(weapon){
 if(weapon.model.userData.sourceCurvedBlade)return;
 const root=weapon.pivot;root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();
 weapon.model.traverse(mesh=>{
  if(!mesh.isMesh)return;const g=mesh.geometry.clone(),p=g.attributes.position,toLocal=inverse.clone().multiply(mesh.matrixWorld),fromLocal=toLocal.clone().invert();
  for(let i=0;i<p.count;i++){
   const v=V().fromBufferAttribute(p,i).applyMatrix4(toLocal);
   if(v.y>.10){const f=T.MathUtils.clamp((v.y+.18*weapon.length)/weapon.length,0,1),center=Math.pow(f,3.6)*.86;
    v.x=Math.pow(f,2.6)*.60+(v.x-center)*(1+.58*smooth(v.y,.12,.55));
   }v.applyMatrix4(fromLocal);p.setXYZ(i,v.x,v.y,v.z);
  }g.computeVertexNormals();g.computeBoundingSphere();mesh.geometry=g;
  mesh.material=mesh.material.clone();const previous=mesh.material.onBeforeCompile;
  mesh.material.onBeforeCompile=shader=>{previous?.call(mesh.material,shader);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float gold=smoothstep(1.08,1.35,diffuseColor.r/max(.01,diffuseColor.b));
   diffuseColor.rgb*=mix(vec3(.44,.49,.52),vec3(.78,.72,.60),gold);`);};
  mesh.material.customProgramCacheKey=()=> 'source-greatblade-charcoal-gilt';mesh.material.roughness=.5;mesh.material.metalness=.78;
 });
}

export function prepareCurvedBlade(model){
 model.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(model),height=box.max.y-box.min.y;
 // Reuse the generated curved blade's engraved surface. Its original crescent
 // bends back toward the grip; unwrap that centerline into the reference's
 // much longer, gently swept blade while retaining UVs, guard and pommel.
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry.clone(),p=geometry.attributes.position,toWorld=mesh.matrixWorld.clone(),inverse=toWorld.clone().invert();
  const stations=Array.from({length:32},()=>[Infinity,-Infinity]);
  const stationFor=new Int8Array(p.count);stationFor.fill(-1);
  const faceX=new Float32Array(p.count),edgeWear=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){
   const v=V().fromBufferAttribute(p,i).applyMatrix4(toWorld).divideScalar(height),y=v.y,z=v.z;
   const angle=Math.atan2(y-.07,-(z-.04)),radius=Math.hypot(y-.07,z-.04),f=T.MathUtils.clamp((angle+1.10)/3.72,0,1);
   const handleY=((y+.255)*.70-(z+.135)*.714)*.62;
   const handleX=((y+.255)*.714+(z+.135)*.70)*.72;
   const blend=smooth(y,-.21,-.08);
   const bladeX=.23*Math.pow(f,2.4)+(radius-.355)*1.15;
   if(blend>.96 && f>.14){
     const k=Math.min(31,Math.floor(f*32));stationFor[i]=k;faceX[i]=bladeX;
     stations[k][0]=Math.min(stations[k][0],bladeX);stations[k][1]=Math.max(stations[k][1],bladeX);
   }
   v.set(lerp(handleX,bladeX,blend),lerp(handleY,f,blend),v.x*.35).applyMatrix4(inverse);
   p.setXYZ(i,v.x,v.y,v.z);
  }
  for(let i=0;i<p.count;i++){
    const k=stationFor[i];if(k<0)continue;
    const [lo,hi]=stations[k],span=hi-lo;
    if(span>.008){const across=(faceX[i]-lo)/span;edgeWear[i]=smooth(across,.82,.98);}
  }
  geometry.setAttribute('bladeWear',new T.Float32BufferAttribute(edgeWear,1));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
  mesh.material=mesh.material.clone();mesh.material.metalness=.36;mesh.material.roughness=.88;
  mesh.material.roughnessMap=null;mesh.material.metalnessMap=null;
  if(mesh.material.normalScale)mesh.material.normalScale.setScalar(.28);
  const previous=mesh.material.onBeforeCompile;
  mesh.material.onBeforeCompile=shader=>{
   previous?.call(mesh.material,shader);
   shader.vertexShader='attribute float bladeWear;varying float edgeWearV;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nedgeWearV=bladeWear;');
   shader.fragmentShader='varying float edgeWearV;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>' ,`#include <map_fragment>
    float engravedGold=smoothstep(1.13,1.48,diffuseColor.r/max(.01,diffuseColor.b));
    vec3 steel=vec3(.028,.033,.037)+diffuseColor.rgb*vec3(.67,.72,.74);
    vec3 bronze=diffuseColor.rgb*vec3(.72,.66,.54);
    diffuseColor.rgb=mix(steel,bronze,engravedGold);
    diffuseColor.rgb+=vec3(.105,.112,.115)*edgeWearV;`);
  };mesh.material.customProgramCacheKey=()=> 'worn-curved-blade-aq';
 });
 model.userData.sourceCurvedBlade=true;
}
