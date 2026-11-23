// Third-person follow and lock-on camera.
//
// One rig serves every stage of play. The eye rides a boom behind a pivot at the player's standing head height.
//
//   pivot   follows the player's root with a positional lag: a sprint or a dodge carries the body toward the
//           edge it is travelling to, and a retreat brings it up to the lens (primary 12.9-13.8 s)
//   yaw     the gameplay heading; movement keys stay screen-relative
//   look    free view: keys, relative to the view the lock left behind
//           lock-on:   the lock point is held a fixed angle above the optical axis, so a standing giant tilts
//                      the view up into the canopy and a kneeling one tilts it down onto the floor
//                      (primary 21.3, 25.2 and 30.3 s)
//   boom    follows the look down and up to a shallow sink; beyond that only the view tilts, so the player
//           slides toward the bottom edge under a towering target instead of the eye diving to the ground
//           (primary 42.7-45.9 s)
//
// Nothing here reads the clock, the replay or the boss's move list.
import * as T from "game/lib/three.module.js";

const {clamp} = T.MathUtils;
const rate = (k, dt) => 1 - Math.exp(-k * dt);

export const RIG = {
  boom: 3.5,        // metres from pivot to eye
  pivot: 1.62,      // pivot above the player's root
  lift: .166,       // lock point above the optical axis (radians)
  reach: 2.4,       // a lock point is treated as no nearer than this on the floor plan
  rest: -.14,       // free-view pitch after a spawn
  low: -.62, high: .5,    // look pitch limits
  sink: .2,         // steepest upward boom: the eye stays near waist height
  floor: .4,        // eye clearance over terrain
  near: 1.3,        // shortest boom
  follow: 3.3,      // pivot follow rate, 1/s
  rise: 7,          // vertical follow rate, 1/s
  tilt: 4.4,        // lock-on pitch rate, 1/s
  aim: 9,           // lock point smoothing, 1/s
  relax: .3         // free view drifts back to rest while travelling, 1/s (primary 68.8-71.2 s)
};

const a = new T.Vector3(), d = new T.Vector3();
const arcBetween=new T.Quaternion(),identityTurn=new T.Quaternion();
const lensForward=new T.Vector3(), lensRight=new T.Vector3();
const shoulderEye=new T.Vector3(), shoulderAim=new T.Vector3(), carrier=new T.Vector3();
const runner=new T.Vector3(), relativeToEye=new T.Vector3();
const testEye=new T.Vector3(), testLine=new T.Vector3(), clothHit=new T.Vector3();
const capeRay=new T.Ray(),front=new T.Vector3(),runnerHead=new T.Vector3(),runnerHips=new T.Vector3(),bossChest=new T.Vector3();
const views=[-.92,.92,-1.45,1.45,-1.94,1.94,-2.45,2.45,0];
const angleDelta = (to, from) => Math.atan2(Math.sin(to-from), Math.cos(to-from));
const bodyLandmarks = /(?:Head|Hips|Shoulder|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase)$/;

function crossesCape(origin,subject,boss){
  const particles=boss.capeParticles,grid=boss.cape.geometry.parameters;
  if(!particles||!grid?.widthSegments)return false;
  testLine.subVectors(subject,origin);
  const lengthSq=testLine.lengthSq();
  capeRay.set(origin,testLine.normalize());
  const nx=grid.widthSegments,ny=grid.heightSegments;
  for(let row=0;row<ny;row+=5){
    for(let col=0;col<nx;col+=5){
      const next=Math.min(nx,col+5),below=Math.min(ny,row+5)*(nx+1),top=row*(nx+1);
      const p=particles[top+col].p,q=particles[top+next].p,r=particles[below+col].p,s=particles[below+next].p;
      if((capeRay.intersectTriangle(p,q,r,false,clothHit)||capeRay.intersectTriangle(q,s,r,false,clothHit))&&
        origin.distanceToSquared(clothHit)<lengthSq-.08)return true;
    }
  }
  return false;
}

export class FollowCamera {
  constructor(camera) {
    this.camera = camera; this.pivot = new T.Vector3(); this.aim = new T.Vector3(); this.direction = new T.Vector3(0, 0, -1);
    this.trackingEye = new T.Vector3(); this.trackingRotation = new T.Quaternion(); this.unlockOffset = new T.Vector3();
    this.bodyAnchor = new T.Vector3();
    this.reset();
  }
  reset() {
    this.bodyView = false;
    this.departureView=null; this.tracking=false; this.hasDisplayedView=false; this.unlockOffset.set(0,0,0);
    this.fitPair=false; this.liveRoom=0; this.bladeRoom=0;this.nearPlayerDolly=null;
    this.maneCover=null;this.maneDolly=0;this.maneCheck=0;
    this.capeAvoidance=0;this.clothCheckIn=0;this.clothBlocked=0;this.clearView=-.92;this.viewAngle=-.92;
    this.started = false; this.hasAim = false; this.shoulderOrbit = 0; this.yaw = 0; this.pitch = RIG.rest; this.length = RIG.boom;
    this.freeBase = null; this.freeInput = null;
  }
  // Next update places the eye directly (stage change, respawn, end of a cutscene).
  snap() { this.started = false; this.tracking = false; this.hasDisplayedView = false; this.unlockOffset.set(0,0,0); this.fitPair=false; this.liveRoom=0; this.bodyView=false; }
  // Continue from the displayed view, including its final shoulder and framing corrections.
  releaseLock(inputPitch) {
    this.departureView=null;
    this.camera.getWorldDirection(this.direction);
    this.pitch = Math.asin(clamp(this.direction.y, -1, 1));
    this.yaw = Math.atan2(-this.direction.x, -this.direction.z);
    this.freeBase = this.pitch;
    this.freeInput = inputPitch;
    this.shoulderOrbit = this.capeAvoidance = this.clothBlocked = this.clothCheckIn = 0;
    this.hasAim = false;
    this.plantView = null;
    return this.yaw;
  }
  // c: {base, yaw, locked, lockPoint, inputPitch, inputActive, moving, groundAt, boom?, pivot?, pitch?, follow?}
  //   base       player root on the ground (jump height included)
  //   pitch      optional fixed pitch (scripted stages before the fight)
  update(dt, c) {
    const R = RIG, rest = c.boom ?? R.boom, height = c.pivot ?? R.pivot;
    a.copy(c.base); a.y += height;
    const fresh = !this.started || a.distanceToSquared(this.pivot) > 64;
    if (fresh) { this.pivot.copy(a); this.hasAim = false; if (!this.started) { this.freeBase = null; this.pitch = c.pitch ?? R.rest; this.length = rest; } this.started = true; }
    this.shoulderOrbit += ((c.shoulderOrbit ?? 0) - this.shoulderOrbit) * rate(5, dt);
    this.yaw = c.yaw + this.shoulderOrbit;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);

    // Pivot: lagging follow, limited so the body cannot leave the picture.
    d.copy(a).sub(this.pivot);
    const k = rate(c.follow ?? R.follow, dt);
    this.pivot.x += d.x * k; this.pivot.z += d.z * k; this.pivot.y += d.y * rate(R.rise, dt);
    d.copy(a).sub(this.pivot);
    const along = d.x * fx + d.z * fz, across = -d.x * fz + d.z * fx;
    const al = clamp(along, -.4 * this.length, 2.2), ac = clamp(across, -.42 * this.length, .42 * this.length);
    if (al !== along || ac !== across) { this.pivot.x = a.x - (fx * al - fz * ac); this.pivot.z = a.z - (fz * al + fx * ac); }

    // Look pitch.
    const locked = c.pitch == null && c.locked && !!c.lockPoint;
    let goal;
    if (c.pitch != null) { goal = c.pitch; this.hasAim = false; this.freeBase = null; }
    else if (locked) {
      if (!this.hasAim) { this.aim.copy(c.lockPoint); this.hasAim = true; } else this.aim.lerp(c.lockPoint, rate(R.aim, dt));
      const dx = this.aim.x - this.pivot.x, dz = this.aim.z - this.pivot.z, dy = this.aim.y - this.pivot.y;
      const flat = Math.max(R.reach, Math.hypot(dx, dz)), span = Math.hypot(flat, dy);
      goal = Math.atan2(dy, flat) - R.lift - Math.asin(clamp(this.length * Math.sin(R.lift) / span, -1, 1));
      goal += c.lockPitchOffset ?? 0;
      this.freeBase = null;
    } else {
      this.hasAim = false;
      if (this.freeBase == null) { this.freeBase = this.pitch; this.freeInput = c.inputPitch; }
      // Travelling without touching the view eases it back toward the resting pitch.
      if (!c.inputActive && c.moving) this.freeBase += (R.rest - (this.freeBase + c.inputPitch - this.freeInput)) * rate(R.relax, dt);
      goal = this.freeBase + (c.inputPitch - this.freeInput);
    }
    goal = clamp(goal, R.low, R.high);
    this.pitch = fresh ? goal : this.pitch + (goal - this.pitch) * rate(locked ? R.tilt : 12, dt);

    // Boom: behind the pivot along the look, sinking no further than waist height; drawn in over rising terrain.
    const boomPitch = Math.min(this.pitch, R.sink), sp = Math.sin(boomPitch), cp = Math.cos(boomPitch), cam = this.camera, ground = c.groundAt;
    let L = rest;
    for (let pass = 0; pass < 3 && ground; pass++) {
      const x = this.pivot.x - fx * cp * L, z = this.pivot.z - fz * cp * L, y = this.pivot.y - sp * L, need = ground(x, z) + R.floor;
      if (y >= need || L <= R.near) break;
      L = Math.max(R.near, L * clamp((this.pivot.y - need) / Math.max(1e-3, this.pivot.y - y), .4, .95));
    }
    this.length = fresh ? L : this.length + (L - this.length) * rate(L < this.length ? 12 : 3.2, dt);
    L = this.length;
    cam.position.set(this.pivot.x - fx * cp * L, this.pivot.y - sp * L, this.pivot.z - fz * cp * L);
    // A sideways boom accompanies the shoulder orbit so the giant stays
    // readable against the player when both blades rise together.
    cam.position.x -= fz * this.shoulderOrbit * .46;
    cam.position.z += fx * this.shoulderOrbit * .46;
    if (ground) cam.position.y = Math.max(cam.position.y, ground(cam.position.x, cam.position.z) + R.floor);
    this.direction.set(fx * Math.cos(this.pitch), Math.sin(this.pitch), fz * Math.cos(this.pitch));
    return this;
  }
  // Orient the camera after any positional shake has been applied.
  aimCamera() {
    const cam = this.camera;
    a.copy(cam.position).add(this.direction); cam.lookAt(a); cam.updateMatrixWorld(true);
  }

  frameOpeningRush(chest, weight) {
    if(weight<=0)return;
    const cam=this.camera;
    a.copy(chest);
    a.y-=Math.hypot(chest.x-cam.position.x,chest.z-cam.position.z)*Math.tan(cam.fov*Math.PI/360)*.18;
    lensForward.subVectors(a,cam.position).normalize();
    cam.getWorldDirection(d).lerp(lensForward,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  // Keep the player at the measured angular size. Move the eye towards the
  // player's torso along its own sightline, retaining the lock-on direction.
  followPlayerDistance(dt,base,targetDistance,weight,groundAt,duel,approach){
    const cam=this.camera;
    runner.copy(base);runner.y+=1.02;
    relativeToEye.subVectors(cam.position,runner);
    const distance=relativeToEye.length();
    if(distance<.01)return;
    const head=this.frameBones?.[5]?.bone,playerHead=this.frameBones?.[0]?.bone;
    const halfTan=Math.tan(T.MathUtils.degToRad(cam.fov*.5));
    let oldHeadY=.77;
    if(head){
      head.getWorldPosition(bossChest).project(cam);
      oldHeadY=clamp(bossChest.y,.60,.91);
    }
    const wanted=Math.max(0,distance-targetDistance)*weight;
    const previous=this.nearPlayerDolly??wanted;
    this.nearPlayerDolly=previous+(wanted-previous)*rate(wanted>previous?10:7,Math.min(dt,.08));
    const advance=Math.min(this.nearPlayerDolly,Math.max(0,distance-2.05));
    cam.position.addScaledVector(relativeToEye,-advance/distance);
    cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+RIG.floor);
    cam.updateMatrixWorld(true);
    let correction=0;
    if(head&&duel>0){
      head.getWorldPosition(bossChest).project(cam);
      correction=duel*clamp(Math.atan(bossChest.y*halfTan)-Math.atan(oldHeadY*halfTan),0,.46);
    }
    if(playerHead&&approach>0){
      playerHead.getWorldPosition(runnerHead).project(cam);
      correction+=approach*clamp(Math.atan(runnerHead.y*halfTan)-Math.atan(.02*halfTan),-.13,.13);
    }
    cam.getWorldDirection(lensForward);
    const pitch=Math.asin(clamp(lensForward.y,-1,1))+correction;
    lensForward.setY(0).normalize().multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
    cam.lookAt(a.copy(cam.position).add(lensForward));cam.updateMatrixWorld(true);
  }
  composePlayer(bounds,groundAt) {
    const bones=this.frameBones,cam=this.camera;
    if(!bones?.[0].bone||!bones[1].bone||!bones[2].bone)return;
    const tan=Math.tan(T.MathUtils.degToRad(cam.fov*.5));
    const head=runnerHead,foot=runnerHips;
    bones[0].bone.getWorldPosition(head);head.y+=.48;
    head.applyMatrix4(cam.matrixWorldInverse);
    let low=Infinity;
    for(let i=1;i<=4;i++){
      if(!bones[i].bone)continue;
      bones[i].bone.getWorldPosition(testEye);testEye.y+=bones[i].pad;
      testEye.applyMatrix4(cam.matrixWorldInverse);
      const y=testEye.y/Math.max(.01,-testEye.z);
      if(y<low){low=y;foot.copy(testEye);}
    }
    if(-head.z<.35||-foot.z<.35)return;
    const observedTop=(1-head.y/(-head.z*tan))*.5,observedBottom=(1-low/tan)*.5;
    if(!bounds){
      if(observedBottom<1.07&&observedTop>.035)return;
      bounds={top:clamp(observedTop,.075,.49),bottom:Math.min(.978,observedBottom),weight:1,face:0};
    }
    const top=(1-2*bounds.top)*tan,bottom=(1-2*bounds.bottom)*tan;
    if(top-bottom<.17)return;
    const w=bounds.weight;
    let back=clamp((head.y-foot.y+top*head.z-bottom*foot.z)/(top-bottom),-1.45,4.9);
    if(bounds.face&&bones[5].bone){
      bones[5].bone.getWorldPosition(bossChest);bossChest.y+=.85;bossChest.applyMatrix4(cam.matrixWorldInverse);
      const ceiling=.80*tan;
      const needed=(bossChest.y-foot.y+ceiling*bossChest.z-bottom*foot.z)/(ceiling-bottom);
      if(bossChest.z<0)back+=bounds.face*Math.max(0,clamp(needed,-1.45,7.)-back);
    }
    const lift=clamp(foot.y-bottom*(-foot.z+back),-2.1,2.2);
    const up=lensRight.setFromMatrixColumn(cam.matrixWorld,1);
    cam.getWorldDirection(lensForward);
    cam.position.addScaledVector(lensForward,-back*w).addScaledVector(up,lift*w);
    const floor=groundAt(cam.position.x,cam.position.z)+RIG.floor;
    if(cam.position.y<floor){
      const rise=floor-cam.position.y;
      cam.position.y=floor;
      const depth=Math.max(1.5,-foot.z+back*w);
      const pitch=Math.asin(clamp(lensForward.y,-1,1))-Math.atan2(rise,depth);
      lensForward.setY(0).normalize().multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
      cam.lookAt(a.copy(cam.position).add(lensForward));
    }
    cam.updateMatrixWorld(true);
  }
  frameDuelPortrait(weight,base,groundAt,lowAngle){
    const cam=this.camera,bossHead=this.frameBones?.[5]?.bone;
    if(weight<=0||!bossHead)return;
    bossHead.getWorldPosition(bossChest);bossChest.y+=.52;
    cam.getWorldDirection(lensForward);lensForward.setY(0).normalize();
    shoulderEye.copy(base).addScaledVector(lensForward,-(lowAngle?3.65:5.35));
    if(lowAngle){lensRight.set(-lensForward.z,0,lensForward.x);shoulderEye.addScaledVector(lensRight,-.74);}
    shoulderEye.y=Math.max(base.y+(lowAngle?.94:2.05),groundAt(shoulderEye.x,shoulderEye.z)+.55);
    const bearing=shoulderAim.subVectors(bossChest,shoulderEye);
    let horizontal=Math.max(.1,Math.hypot(bearing.x,bearing.z));
    const tan=Math.tan(T.MathUtils.degToRad(cam.fov*.5));
    const top=lowAngle?.15:.125,bottom=lowAngle?1.14:.94;
    // Find enough room along the terrace for the two rays before pitching
    // up. Pitching below the floor to keep a boot visible cuts off the crown.
    for(let i=0;i<7;i++){
      horizontal=Math.max(.1,Math.hypot(bossChest.x-shoulderEye.x,bossChest.z-shoulderEye.z));
      const high=Math.atan2(bossChest.y-shoulderEye.y,horizontal);
      const low=Math.atan2(base.y-shoulderEye.y,Math.hypot(base.x-shoulderEye.x,base.z-shoulderEye.z));
      if(high-low<=Math.atan((1-2*top)*tan)-Math.atan((1-2*bottom)*tan)||i===6)break;
      shoulderEye.addScaledVector(lensForward,-.48);
      shoulderEye.y=Math.max(shoulderEye.y,groundAt(shoulderEye.x,shoulderEye.z)+.55);
    }
    const pitch=Math.atan2(bossChest.y-shoulderEye.y,horizontal)-Math.atan((1-2*top)*tan);
    shoulderAim.lerpVectors(base,bossChest,.79).sub(shoulderEye).setY(0).normalize();
    shoulderAim.multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
    cam.position.lerp(shoulderEye,weight);
    cam.getWorldDirection(d).lerp(shoulderAim,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }
  centerPlayer(weight,base){
    if(weight<=0)return;
    const cam=this.camera;
    runnerHead.copy(base);runnerHead.y+=1.13;runnerHead.project(cam);
    cam.getWorldDirection(lensForward);
    lensRight.setFromMatrixColumn(cam.matrixWorld,0);
    const target=-.035,tan=Math.tan(T.MathUtils.degToRad(cam.fov)*.5)*cam.aspect;
    lensForward.addScaledVector(lensRight,weight*T.MathUtils.clamp(runnerHead.x-target,-.28,.28)*tan).normalize();
    cam.lookAt(a.copy(cam.position).add(lensForward));cam.updateMatrixWorld(true);
  }
  frameExecution(weight,base,yaw,groundAt,release,sideView=true){
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.set(-Math.sin(yaw),0,-Math.cos(yaw));
    lensRight.set(-lensForward.z,0,lensForward.x);
    // Keep the weapon hand outside the overlap of the two silhouettes.
    shoulderEye.copy(base).addScaledVector(lensForward, (sideView?-2.92:-3.85)-.35*release)
      .addScaledVector(lensRight,(sideView?3.66:2.45)+.22*release);
    shoulderEye.y=Math.max(base.y+2.28,groundAt(shoulderEye.x,shoulderEye.z)+1.05);
    shoulderAim.copy(base).addScaledVector(lensForward,.75+.24*release);
    shoulderAim.y+=1.38+.12*release;
    cam.getWorldDirection(d);
    cam.position.lerp(shoulderEye,weight);
    d.lerp(shoulderAim.sub(shoulderEye).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }
  frameRisingArms(weight,base,boss,groundAt){
    if(weight<=0||!this.frameBones?.[0]?.bone)return;
    const cam=this.camera;
    lensForward.subVectors(boss,base).setY(0);
    if(lensForward.lengthSq()<.001)return;
    lensForward.normalize();lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(base).addScaledVector(lensForward,-3.12).addScaledVector(lensRight,.12);
    shoulderEye.y=Math.max(base.y+.92,groundAt(shoulderEye.x,shoulderEye.z)+.52);
    this.frameBones[0].bone.getWorldPosition(runnerHead);
    shoulderAim.subVectors(runnerHead,shoulderEye);
    const pitch=Math.atan2(shoulderAim.y,Math.hypot(shoulderAim.x,shoulderAim.z))-
      Math.atan(.19*Math.tan(T.MathUtils.degToRad(cam.fov)*.5));
    shoulderAim.setY(0).normalize().multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
    cam.getWorldDirection(d);cam.position.lerp(shoulderEye,weight);
    d.lerp(shoulderAim,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }
  frameDescent(weight,base,boss,groundAt,arriving){
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(base).addScaledVector(lensForward,-4.65).addScaledVector(lensRight,1.44);
    shoulderEye.y=Math.max(base.y+1.85,groundAt(shoulderEye.x,shoulderEye.z)+.72);
    shoulderAim.copy(base).addScaledVector(lensForward,1.05);
    shoulderAim.y+=1.37+1.23*T.MathUtils.smoothstep(boss.y,0,5.6)+1.30*arriving;
    cam.getWorldDirection(d);cam.position.lerp(shoulderEye,weight);
    d.lerp(shoulderAim.sub(shoulderEye).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }
  frameSuspendedCast(weight,base,boss,groundAt){
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.subVectors(boss,base).setY(0);
    const distance=lensForward.length();
    if(distance<.08)lensForward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    else lensForward.multiplyScalar(1/distance);
    lensRight.set(-lensForward.z,0,lensForward.x);
    const boom=3.45+.85*(1-T.MathUtils.smoothstep(distance,1,6));
    shoulderEye.copy(base).addScaledVector(lensForward,-boom).addScaledVector(lensRight,.34);
    shoulderEye.y=Math.max(base.y+1.16,groundAt(shoulderEye.x,shoulderEye.z)+.42);
    const runnerAngle=Math.atan2(base.y+1.47-shoulderEye.y,boom);
    const raisedAngle=Math.atan2(groundAt(boss.x,boss.z)+boss.y+1.70-shoulderEye.y,boom+distance);
    // Centre the angle between the runner's upper back and the lifted body.
    const pitch=T.MathUtils.lerp(runnerAngle,raisedAngle,.47);
    shoulderAim.copy(lensForward).multiplyScalar(Math.cos(pitch));shoulderAim.y=Math.sin(pitch);
    cam.getWorldDirection(d);
    arcBetween.setFromUnitVectors(d,shoulderAim);
    d.applyQuaternion(identityTurn.identity().slerp(arcBetween,weight));
    cam.position.lerp(shoulderEye,weight);
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }
  frameGateApproach(base, gate, weight, groundAt) {
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.subVectors(gate,base).setY(0).normalize();
    lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(base).addScaledVector(lensForward,-4.45).addScaledVector(lensRight,.16);
    shoulderEye.y=Math.max(base.y+1.40,groundAt(shoulderEye.x,shoulderEye.z)+.45);
    cam.position.lerp(shoulderEye,weight);
    lensForward.y=.10;
    cam.getWorldDirection(d).lerp(lensForward.normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  fitCombatants(dt, player, boss, groundAt, showBoss, mounted, fixedShot=0, attackTell=0) {
    if(!player.ready)return;
    const cam=this.camera;
    if(!this.frameBones){
      const byName=(actor,suffix)=>Object.values(actor.bones).find(b=>b.name.endsWith(suffix));
      const targets=[
        [player,'Head',.20], [player,'LeftFoot',-.11], [player,'RightFoot',-.11],
        [player,'LeftToeBase',-.07], [player,'RightToeBase',-.07],
        [boss,'Head',.32], [boss,'Spine2',0],
        [player,'Head',-.16]
      ];
      this.frameBones=targets.map(([actor,name,pad])=>({bone:byName(actor,name),actor,pad,point:new T.Vector3()}));
    }
    player.root.getWorldPosition(runner);
    boss.root.getWorldPosition(carrier);
    const separation=Math.hypot(runner.x-carrier.x,runner.z-carrier.z);
    let closeDuel=showBoss?(1-fixedShot)*(1-T.MathUtils.smoothstep(separation,3.8,8))
      *(1-T.MathUtils.smoothstep(Math.abs(carrier.y-runner.y),.65,2.35)):0;
    if(closeDuel>0&&this.frameBones[0].bone&&this.frameBones[1].bone&&this.frameBones[5].bone){
      this.frameBones[0].bone.getWorldPosition(runnerHead).project(cam);
      this.frameBones[1].bone.getWorldPosition(runnerHips).project(cam);
      this.frameBones[5].bone.getWorldPosition(bossChest).project(cam);
      const occupied=Math.abs(runnerHead.y-runnerHips.y)*.5;
      closeDuel*=(1-T.MathUtils.smoothstep(occupied,.32,.49))*(1-T.MathUtils.smoothstep(bossChest.y,.84,1.36));
    }
    const ray=d.subVectors(runner,cam.position).setY(0);
    const rayLength=ray.length();
    if(rayLength>.001)ray.divideScalar(rayLength);
    const toBoss=a.subVectors(carrier,cam.position).setY(0);
    const along=toBoss.dot(ray);
    const clearance=Math.hypot(toBoss.x-along*ray.x,toBoss.z-along*ray.z);
    const eyeHeight=cam.position.y+(runner.y+.98-cam.position.y)*clamp(along/Math.max(.01,rayLength),0,1);
    const overlap=T.MathUtils.smoothstep(eyeHeight-carrier.y,-1.0,.15)*(1-T.MathUtils.smoothstep(eyeHeight-carrier.y,4.5,6.4));
    const cape=mounted?3.0:2.3;
    const blocked=showBoss?(1-T.MathUtils.smoothstep(clearance,cape*.4,cape))*
      T.MathUtils.smoothstep(along,-1.2,.55)*(1-T.MathUtils.smoothstep(along-rayLength,-.6,1.35))*overlap:0;
    this.clothCheckIn-=dt;
    if(!showBoss||separation>8||!boss.cape?.visible){this.clothBlocked=0;this.clothCheckIn=0;}
    else if(this.clothCheckIn<=0){
      this.clothCheckIn=.065;
      this.frameBones[0].bone.getWorldPosition(runnerHead);
      runnerHips.lerpVectors(runner,runnerHead,.53);
      this.frameBones[6].bone.getWorldPosition(bossChest);
      if(crossesCape(cam.position,runnerHead,boss)||crossesCape(cam.position,runnerHips,boss)||crossesCape(cam.position,bossChest,boss)){
        this.clothBlocked=1;
        lensForward.subVectors(carrier,runner).setY(0).normalize();
        lensRight.set(-lensForward.z,0,lensForward.x);
        front.set(0,0,-1).transformDirection(boss.visual.matrixWorld).setY(0).normalize();
        let lowest=Infinity;
        for(const angle of views){
          testEye.copy(runner).addScaledVector(lensForward,-5.35*Math.cos(angle)).addScaledVector(lensRight,5.35*Math.sin(angle));
          testEye.y=Math.max(runner.y+2.35,groundAt(testEye.x,testEye.z)+.50);
          const towardEye=a.subVectors(testEye,carrier).setY(0).normalize();
          let cost=.34*(1-front.dot(towardEye))+.08*Math.abs(angle)+.10*Math.abs(angle-this.clearView);
          if(crossesCape(testEye,runnerHead,boss))cost+=5;
          if(crossesCape(testEye,runnerHips,boss))cost+=5;
          if(crossesCape(testEye,bossChest,boss))cost+=2;
          const toPlayer=d.subVectors(runner,testEye).setY(0),len=toPlayer.length();
          toPlayer.divideScalar(Math.max(.01,len));
          a.subVectors(carrier,testEye).setY(0);
          const along=a.dot(toPlayer);
          if(along>0&&along<len+.30&&a.addScaledVector(toPlayer,-along).lengthSq()<1.4)cost+=4;
          if(cost<lowest){lowest=cost;this.nextClearView=angle;}
        }
        this.clearView=this.nextClearView;
      }else{
        // A loose corner can uncover the subject for one probe, then cover it again.
        this.clothBlocked=Math.max(0,this.clothBlocked-.32);
      }
    }
    const obstruction=Math.max(blocked,this.clothBlocked);
    this.capeAvoidance+=(obstruction-this.capeAvoidance)*rate(obstruction>this.capeAvoidance?10:4,dt);
    const avoidance=this.capeAvoidance*(1-fixedShot);
    if(avoidance>.001 && separation>.08){
      lensForward.subVectors(carrier,runner).setY(0).normalize();
      lensRight.set(-lensForward.z,0,lensForward.x);
      const turn=Math.atan2(Math.sin(this.clearView-this.viewAngle),Math.cos(this.clearView-this.viewAngle));
      this.viewAngle+=clamp(turn*rate(5,dt),-2.8*dt,2.8*dt);
      shoulderEye.copy(runner).addScaledVector(lensForward,-5.35*Math.cos(this.viewAngle)).addScaledVector(lensRight,5.35*Math.sin(this.viewAngle));
      shoulderEye.y=Math.max(runner.y+2.42,groundAt(shoulderEye.x,shoulderEye.z)+.5);
      shoulderAim.lerpVectors(runner,carrier,.62);shoulderAim.y+=1.75;
      cam.position.lerp(shoulderEye,avoidance);
      cam.getWorldDirection(d).lerp(shoulderAim.sub(cam.position).normalize(),avoidance).normalize();
      cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
    }
    // At melee distance the source keeps the player's upper body large. A tall crown
    // or near foot can cross the image edge while both fighters' centres stay visible.
    if(closeDuel>.001){
      const towardRunner=a.subVectors(runner,cam.position).setY(0),span=towardRunner.length();
      if(span>3.55){
        cam.position.addScaledVector(towardRunner,closeDuel*Math.min(1.10,span-3.55)/span);
        cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+.44);
      }
    }
    cam.getWorldDirection(lensForward);
    const originalPitch=Math.asin(clamp(lensForward.y,-1,1));
    lensForward.setY(0).normalize();
    lensRight.set(-lensForward.z,0,lensForward.x);
    const tanY=Math.tan(T.MathUtils.degToRad(cam.fov*.5)),tanX=tanY*cam.aspect;
    let x0=-Infinity,x1=Infinity;
    for(const item of this.frameBones){
      item.active=!!item.bone&&(item.actor!==boss||(showBoss&&separation<=24&&carrier.y-runner.y<=13));
      if(!item.active)continue;
      item.bone.getWorldPosition(item.point);
      const crown=item.actor===boss&&item.pad>0
        ? (mounted?1.00:.66)*(1-closeDuel*.85)*(1-T.MathUtils.smoothstep(separation,15,24)) : 0;
      item.point.y+=item.pad+crown;
      relativeToEye.subVectors(item.point,cam.position);
      const x=relativeToEye.dot(lensRight),z=relativeToEye.dot(lensForward);
      item.depth=z;
      x0=Math.max(x0,x-z*tanX*.88);x1=Math.min(x1,x+z*tanX*.88);
    }
    // Fit the lower third of each raised blade, well inside the image edge.
    // The tips can exit above frame, as they do in the overhead wind-up.
    if(attackTell>0 && boss.weapons.length===2){
      this.tellPoints??=[new T.Vector3(),new T.Vector3()];
      for(let i=0;i<2;i++){
        const w=boss.weapons[i],point=this.tellPoints[i];
        point.copy(w.bladeSections[6].center).applyMatrix4(w.pivot.matrixWorld);
        relativeToEye.subVectors(point,cam.position);
        const x=relativeToEye.dot(lensRight),z=relativeToEye.dot(lensForward);
        x0+=Math.max(0,x-z*tanX*.83-x0)*attackTell;
        x1-=Math.max(0,x1-(x+z*tanX*.83))*attackTell;
      }
    }
    if(!Number.isFinite(x0))return;
    const upper=Math.atan(.89*tanY),lower=Math.atan(.933*tanY);
    const crownAngle=Math.atan((.89+.32*closeDuel)*tanY),footAngle=Math.atan((.933+.18*closeDuel)*tanY);
    let back=Math.max(0,(x0-x1)/(1.76*tanX)),lo,hi;
    for(let iteration=0;iteration<12;iteration++){
      const dx=clamp(0,x0-back*tanX*.88,x1+back*tanX*.88);
      shoulderEye.copy(cam.position).addScaledVector(lensForward,-back).addScaledVector(lensRight,dx);
      shoulderEye.y=Math.max(shoulderEye.y,groundAt(shoulderEye.x,shoulderEye.z)+.44);
      lo=-Math.PI;hi=Math.PI;
      for(const item of this.frameBones){
        if(!item.active)continue;
        const angle=Math.atan2(item.point.y-shoulderEye.y,Math.max(.02,item.depth+back));
        lo=Math.max(lo,angle-(item.actor===boss&&item.pad>0?crownAngle:upper));
        hi=Math.min(hi,angle+(item.actor===player&&item.pad<0?footAngle:lower));
      }
      if(attackTell>0 && this.tellPoints){
        for(const point of this.tellPoints){
          relativeToEye.subVectors(point,shoulderEye);
          const angle=Math.atan2(relativeToEye.y,Math.max(.02,relativeToEye.dot(lensForward)));
          lo+=Math.max(0,angle-Math.atan(.73*tanY)-lo)*attackTell;
        }
      }
      if(lo<=hi||iteration===11)break;
      back+=Math.max(.04,Math.min(1.6,(lo-hi)*Math.max(2,rayLength+back)));
    }
    cam.position.copy(shoulderEye);
    const pitch=clamp(originalPitch,lo,hi);
    lensForward.multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
    cam.lookAt(a.copy(cam.position).add(lensForward));
    cam.updateMatrixWorld(true);
    this.fitPair=!fixedShot && this.frameBones[0].active && this.frameBones[1].active && this.frameBones[5].active;
  }

  liveLockYaw(current,target,dt,crossing) {
    const error=Math.atan2(Math.sin(target-current),Math.cos(target-current));
    // At point-blank range the boss can cross the player in a single physics tick.
    const maxStep=3.5*dt;
    return current+clamp(error*rate(crossing?9:3.5,dt),-maxStep,maxStep);
  }

  // Compose the displayed view around the player after the boss and replay shots have supplied their targets.
  framePlayer(dt, player, base, groundAt, controlYaw, freeLook, opponentWeight=0) {
    if (!player.ready || !player.root.visible) { this.bodyView=false; return; }
    const cam=this.camera, anchor=this.bodyAnchor;
    const first=!this.bodyView, t=Math.min(dt,.05);
    if (first) anchor.copy(base);
    // Keep a little weight in a dodge without making the player wait for a stationary camera to catch up.
    // A grab can correct the simulation root by over a metre in one tick.
    // Slew the anchor through that correction, just as it follows a running player.
    relativeToEye.subVectors(base,anchor).setY(0).multiplyScalar(rate(18,t)).clampLength(0,10*t);
    anchor.add(relativeToEye);
    anchor.y+=clamp((base.y-anchor.y)*rate(10,t),-7*t,7*t);

    cam.getWorldDirection(lensForward);
    const lensYaw=Math.atan2(-lensForward.x,-lensForward.z);
    const heading=controlYaw ?? lensYaw;
    relativeToEye.subVectors(cam.position,anchor);
    const candidateRadius=Math.hypot(relativeToEye.x,relativeToEye.z);
    const candidateYaw=Math.atan2(relativeToEye.x,relativeToEye.z);
    const orbit=heading+clamp(angleDelta(candidateYaw,heading),-.40,.40);
    const tanY=Math.tan(T.MathUtils.degToRad(cam.fov/2)), tanX=tanY*cam.aspect;
    const radius=clamp(candidateRadius,Math.max(3.85,1.36/tanX),Math.max(7.2,1.8/tanX));
    const height=clamp(relativeToEye.y,.95,3.8);
    const pan=clamp(angleDelta(lensYaw,candidateYaw),-Math.atan(.42*tanX),Math.atan(.42*tanX));
    const bodyPitch=Math.atan2(1.04-relativeToEye.y,Math.max(.1,candidateRadius));
    const tilt=clamp(Math.asin(clamp(lensForward.y,-1,1))-bodyPitch,-.095,.19);
    if (first) {
      this.bodyOrbit=orbit; this.bodyTurn=0; this.bodyRadius=radius; this.bodyEyeHeight=height;
      this.bodyPan=pan; this.bodyTilt=tilt; this.bodyRoom=0; this.opponentRoom=0; this.bodyView=true;
    } else {
      const error=angleDelta(orbit,this.bodyOrbit);
      const limit=freeLook?5.5:2.7, acceleration=freeLook?32:12;
      const brakingLimit=Math.min(limit,Math.sqrt(2*acceleration*Math.abs(error)));
      const speed=clamp(error*(freeLook?17:8),-brakingLimit,brakingLimit);
      this.bodyTurn+=clamp(speed-this.bodyTurn,-acceleration*t,acceleration*t);
      const turn=this.bodyTurn*t;
      if (turn*error>0 && Math.abs(turn)>=Math.abs(error)) {
        this.bodyOrbit+=error; this.bodyTurn=0;
      } else this.bodyOrbit+=turn;
      this.bodyRadius+=clamp((radius-this.bodyRadius)*rate(5,t),-3*t,3*t);
      this.bodyEyeHeight+=clamp((height-this.bodyEyeHeight)*rate(6,t),-3.5*t,3.5*t);
      this.bodyPan+=clamp((pan-this.bodyPan)*rate(7,t),-.85*t,.85*t);
      this.bodyTilt+=clamp((tilt-this.bodyTilt)*rate(7,t),-.70*t,.70*t);
    }
    cam.position.set(anchor.x+Math.sin(this.bodyOrbit)*this.bodyRadius,anchor.y+this.bodyEyeHeight,
      anchor.z+Math.cos(this.bodyOrbit)*this.bodyRadius);
    cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+RIG.floor);
    const pitch=Math.atan2(anchor.y+1.04-cam.position.y,this.bodyRadius)+this.bodyTilt;
    const yaw=this.bodyOrbit+this.bodyPan;
    lensForward.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    cam.lookAt(a.copy(cam.position).add(lensForward)); cam.updateMatrixWorld(true);

    // Reserve space for armour beyond the animated bones. Ease out before a wrist, helmet or boot hits the edge.
    this.bodyBones ??= Object.values(player.bones).filter(bone=>bodyLandmarks.test(bone.name));
    let soft=0,hard=0;
    for (const bone of this.bodyBones) {
      relativeToEye.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
      const pad=bone.name.endsWith('Head')?.34:.19;
      const extent=Math.max((Math.abs(relativeToEye.x)+pad)/tanX,(Math.abs(relativeToEye.y)+pad)/tanY);
      soft=Math.max(soft,extent/.75+relativeToEye.z+pad);
      hard=Math.max(hard,extent/.90+relativeToEye.z+pad);
    }
    this.bodyRoom=Math.max(hard,this.bodyRoom+(soft-this.bodyRoom)*rate(soft>this.bodyRoom?9:3,t));
    // At clinch distance leave space above a grounded opponent's helmet. A takeoff keeps the runner's framing.
    const head=this.frameBones?.[5]?.bone;
    let opponentRoom=0;
    if (opponentWeight>0 && head) {
      relativeToEye.setFromMatrixPosition(head.matrixWorld);
      relativeToEye.y+=.40;
      relativeToEye.applyMatrix4(cam.matrixWorldInverse);
      if (relativeToEye.z< -1 && Math.abs(relativeToEye.x)<-relativeToEye.z*tanX) {
        opponentRoom=opponentWeight*clamp(relativeToEye.y/(.88*tanY)+relativeToEye.z,0,2.65);
      }
    }
    this.opponentRoom+=clamp((opponentRoom-this.opponentRoom)*rate(6,t),-2*t,3*t);
    const room=Math.max(this.bodyRoom,this.opponentRoom);
    if (room>1e-4) {
      cam.position.addScaledVector(lensForward,-room);
      cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+RIG.floor);
      cam.updateMatrixWorld(true);
    }
  }

  settleTracking(dt, active, groundAt, live=false) {
    const cam=this.camera;
    const elapsed=live && dt>.15 ? .05 : dt;
    const pair=live && active && this.fitPair;
    if(live && active){
      // A later move-specific shoulder shot can use up the headroom provided by
      // fitCombatants. Keep the attack and the near player's body in view without
      // changing the bearing the player uses for movement.
      let room=0;
      if(this.fitPair){
        const points=this.frameBones,halfHeight=Math.tan(T.MathUtils.degToRad(cam.fov*.5));
        runnerHips.lerpVectors(points[1].point,points[0].point,.33);
        for(let i=0;i<2;i++){
          relativeToEye.copy(i===0?runnerHips:points[5].point).applyMatrix4(cam.matrixWorldInverse);
          if(relativeToEye.z>=-.5)continue;
          const width=Math.abs(relativeToEye.x)/(.82*halfHeight*cam.aspect);
          const height=Math.abs(relativeToEye.y)/(.78*halfHeight);
          room=Math.max(room,Math.max(width,height)+relativeToEye.z);
        }
      }
      room=Math.min(room,2.75);
      this.liveRoom+=(room-this.liveRoom)*rate(room>this.liveRoom?12:3.5,elapsed);
      if(this.liveRoom>.001){
        cam.position.addScaledVector(cam.getWorldDirection(d),-this.liveRoom);
        cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+RIG.floor);
        cam.updateMatrixWorld(true);
      }
    }else this.liveRoom=0;
    this.fitPair=false;
    if(live&&!active){
      if(this.tracking)this.unlockOffset.copy(this.trackingEye).sub(cam.position);
      if(this.unlockOffset.lengthSq()>1e-8){
        this.unlockOffset.multiplyScalar(Math.exp(-12*elapsed));
        cam.position.add(this.unlockOffset);
        cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+RIG.floor);
        cam.updateMatrixWorld(true);
      }
    }else this.unlockOffset.set(0,0,0);
    if(!active || (live ? !this.hasDisplayedView : !this.tracking || dt>.25)){
      this.trackingEye.copy(cam.position);this.trackingRotation.copy(cam.quaternion);
      this.tracking=active;this.hasDisplayedView=true;
      return;
    }
    // Fit constraints use animated bones, weapon tips and a moving cloth mesh.
    // Filter their combined output once, after all framing passes. Free look
    // and the phase cut keep direct control of the camera.
    this.tracking=true;
    const alpha=rate(13,elapsed);
    const distance=this.trackingEye.distanceTo(cam.position);
    const eyeAlpha=live&&distance>0?Math.min(alpha,14*elapsed/distance):alpha;
    if(pair && distance>.1){
      // Follow an arc around the near fighter when a leap changes shoulders.
      // A linear blend between opposite booms cuts through the fighter while
      // its independently blended heading can point away from both bodies.
      const pivot=this.frameBones[0].point;
      const from=a.subVectors(this.trackingEye,pivot),to=d.subVectors(cam.position,pivot);
      const r=Math.hypot(from.x,from.z),end=Math.hypot(to.x,to.z);
      const heading=Math.atan2(from.x,from.z);
      const delta=Math.atan2(from.z*to.x-from.x*to.z,from.x*to.x+from.z*to.z);
      const travel=Math.hypot((r+end)*.5*delta,end-r,to.y-from.y);
      const blend=Math.min(alpha,14*elapsed/Math.max(.001,travel));
      const turn=heading+delta*blend,radius=T.MathUtils.lerp(r,end,blend);
      this.trackingEye.set(pivot.x+radius*Math.sin(turn),T.MathUtils.lerp(this.trackingEye.y,cam.position.y,blend),pivot.z+radius*Math.cos(turn));
      // Preserve the horizontal composition of the desired shot from the
      // actual displayed eye. Moving round the arc must also turn the lens.
      const bossAim=this.frameBones[6].active?this.frameBones[6]:this.frameBones[5];
      shoulderAim.lerpVectors(pivot,bossAim.point,.48);
      from.subVectors(shoulderAim,cam.position);
      to.subVectors(shoulderAim,this.trackingEye);
      const shift=Math.atan2(from.z*to.x-from.x*to.z,from.x*to.x+from.z*to.z);
      cam.rotateOnWorldAxis(cam.up,shift);
    }else this.trackingEye.lerp(cam.position,eyeAlpha);
    this.trackingEye.y=Math.max(this.trackingEye.y,groundAt(this.trackingEye.x,this.trackingEye.z)+RIG.floor);
    const angle=live?this.trackingRotation.angleTo(cam.quaternion):0;
    const turnAlpha=angle>0?Math.min(alpha,4.2*elapsed/angle):alpha;
    this.trackingRotation.slerp(cam.quaternion,turnAlpha);
    cam.position.copy(this.trackingEye);cam.quaternion.copy(this.trackingRotation);
    cam.updateMatrixWorld(true);
  }

  frameOpeningCast(weight,age,launchAge,player,boss,launchYaw,groundAt){
    if(weight<=0)return;
    const cam=this.camera;
    boss.root.getWorldPosition(carrier);
    const crouch=T.MathUtils.smootherstep(age,1.70,2.32);
    const rise=T.MathUtils.smootherstep(launchAge,0,.65);
    // Hold the incoming side from the first blade raise. As the boss passes
    // the runner, orbit the outside of the furrow; never cross through it.
    front.set(-Math.sin(launchYaw),0,-Math.cos(launchYaw))
      .applyAxisAngle(cam.up,-.75-1.75*rise);
    shoulderEye.lerpVectors(player,carrier,.38*(1-rise));
    shoulderEye.addScaledVector(front,7.85-1.0*crouch-1.7*rise);
    shoulderEye.y=groundAt(shoulderEye.x,shoulderEye.z)+3.6+2.25*crouch-3.68*rise;
    const spine=this.frameBones?.[6]?.bone;
    if(spine)spine.getWorldPosition(bossChest);
    else bossChest.copy(carrier).addScaledVector(cam.up,2.5);
    runnerHead.copy(player);runnerHead.y+=1.0;
    // Aim with the move. The near-ground sweep leads across frame, then the
    // fast lifting torso gets progressively more headroom during the pull-up.
    shoulderAim.lerpVectors(runnerHead,bossChest,.81+.12*rise);
    shoulderAim.y+=.36*(1-crouch)+.28*rise;
    cam.position.lerp(shoulderEye,weight);
    cam.getWorldDirection(d).lerp(shoulderAim.sub(cam.position).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  keepLaunchVisible(weight,boss,syncTracking=true){
    if(weight<=0)return;
    const cam=this.camera,spine=this.frameBones?.[6]?.bone;
    if(spine)spine.getWorldPosition(bossChest);
    else{boss.root.getWorldPosition(bossChest);bossChest.y+=2.5;}
    const projected=runnerHead.copy(bossChest).project(cam);
    const horizontal=Math.abs(projected.x),vertical=Math.abs(projected.y);
    const correction=Math.max(T.MathUtils.smootherstep(horizontal,.38,.82),
      T.MathUtils.smootherstep(vertical,.48,.84))*weight;
    if(!correction)return;
    cam.getWorldDirection(d).lerp(bossChest.sub(cam.position).normalize(),correction).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
    if(syncTracking)this.trackingRotation.copy(cam.quaternion);
  }

  frameRakeFromAbove(weight,player,boss,yaw,groundAt){
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.subVectors(boss,player).setY(0);
    if(lensForward.lengthSq()<.12)lensForward.set(-Math.sin(yaw),0,-Math.cos(yaw));
    lensForward.normalize();lensRight.crossVectors(lensForward,cam.up).normalize();
    shoulderEye.copy(player).addScaledVector(lensForward,-4.55).addScaledVector(lensRight,1.18);
    shoulderEye.y=Math.max(player.y+7.25,groundAt(shoulderEye.x,shoulderEye.z)+.65);
    shoulderAim.lerpVectors(player,boss,.62);shoulderAim.y+=1.38;
    cam.position.lerp(shoulderEye,weight);cam.getWorldDirection(d);
    d.lerp(shoulderAim.sub(cam.position).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameDistantVolley(weight,player,boss,groundAt,castAge){
    if(weight<=0 || !this.frameBones?.[6]?.bone)return;
    const cam=this.camera;
    this.frameBones[6].bone.getWorldPosition(bossChest);
    lensForward.subVectors(boss.root.position,player).setY(0).normalize();
    lensRight.crossVectors(lensForward,cam.up).normalize();
    shoulderEye.copy(player).addScaledVector(lensForward,-4.18).addScaledVector(lensRight,1.32-3.04*T.MathUtils.smootherstep(castAge,4.32,5.29));
    shoulderEye.y=Math.max(player.y+1.36,groundAt(shoulderEye.x,shoulderEye.z)+.48);
    cam.position.lerp(shoulderEye,weight);
    bossChest.y-=1.04;
    cam.getWorldDirection(d).lerp(bossChest.sub(cam.position).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  framePlantedBlades(weight,player,boss,groundAt,phase,age,launchYaw){
    const cam=this.camera;
    if(weight<=0){this.plantView=null;return;}
    boss.root.getWorldPosition(carrier);
    if(!this.plantView||this.plantView.phase!==phase||age<this.plantView.age){
      const back=cam.position.clone().sub(carrier).setY(0);
      if(phase===1&&Number.isFinite(launchYaw)){
        // Stay on the incoming shoulder during the ground sweep. Crossing to
        // the outgoing side here reverses the sweep in screen space.
        back.set(-Math.sin(launchYaw),0,-Math.cos(launchYaw));
        back.applyAxisAngle(cam.up,-.32);
      }
      if(phase===2){
        // View the long mane from the sword side, across the runner's shoulder.
        back.subVectors(player,carrier).setY(0).applyAxisAngle(cam.up,-1.48);
      }
      if(back.lengthSq()<.01)back.set(0,0,1);
      this.plantView={phase,back:back.normalize(),origin:carrier.clone(),age};
    }
    const shot=this.plantView;shot.age=age;
    shoulderAim.copy(shot.origin).lerp(carrier,.62).lerp(player,phase===1?.43:.22);
    if(phase===2){
      const blades=boss.weapons;
      if(blades.every(w=>w.bladeSections?.length)){
        const center=new T.Vector3();
        for(const w of blades)center.add(w.pivot.localToWorld(a.copy(w.bladeSections.at(-1).center)));
        shoulderAim.lerp(center.multiplyScalar(.5),.25);
      }
    }
    shoulderEye.copy(shoulderAim).addScaledVector(shot.back,phase===2?10.8:5.2);
    shoulderEye.y=groundAt(shoulderEye.x,shoulderEye.z)+(phase===2?6.95:5.45);
    shoulderAim.y=groundAt(shoulderAim.x,shoulderAim.z)+1.54;
    cam.position.lerp(shoulderEye,weight);
    cam.getWorldDirection(d).lerp(shoulderAim.sub(cam.position).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameAirborneDuel(weight,player,root,groundAt) {
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.subVectors(root,player).setY(0);
    if(lensForward.lengthSq()<.16)return;
    lensForward.normalize();lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(player).addScaledVector(lensForward,-2.85).addScaledVector(lensRight,.46);
    shoulderEye.y=groundAt(shoulderEye.x,shoulderEye.z)+.55;
    cam.position.lerp(shoulderEye,weight);
    shoulderAim.lerpVectors(player,root,.46);
    shoulderAim.y=T.MathUtils.lerp(player.y+.86,groundAt(root.x,root.z)+root.y+2.10,.41);
    cam.getWorldDirection(d).lerp(shoulderAim.sub(cam.position).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameHolyRise(weight,reveal,player,root,groundAt){
    if(weight<=0)return;
    const cam=this.camera,forward=lensForward.subVectors(root,player).setY(0);
    if(forward.lengthSq()<.01)forward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    forward.normalize();lensRight.set(-forward.z,0,forward.x);
    const closeReveal=reveal*(1-T.MathUtils.smoothstep(Math.hypot(root.x-player.x,root.z-player.z),3.2,7.5));
    shoulderEye.copy(player).addScaledVector(forward,-T.MathUtils.lerp(3.05,2.05-.83*closeReveal,reveal))
      .addScaledVector(lensRight,T.MathUtils.lerp(-.36,.18,reveal));
    shoulderEye.y=Math.max(player.y+T.MathUtils.lerp(3.30,.72-.18*closeReveal,reveal),groundAt(shoulderEye.x,shoulderEye.z)+.42);
    cam.position.lerp(shoulderEye,weight);
    shoulderAim.copy(player).addScaledVector(forward,5.5);
    shoulderAim.y=player.y-.20;
    a.copy(root);a.y=groundAt(root.x,root.z)+root.y+.70;
    shoulderAim.lerp(a,reveal*(.69+.22*closeReveal)).sub(cam.position).normalize();
    if(closeReveal>0){
      const head=this.frameBones?.[0]?.bone;
      if(head)head.getWorldPosition(runnerHead);else{runnerHead.copy(player);runnerHead.y+=1.65;}
      runnerHead.sub(cam.position);
      const maskPitch=Math.atan2(runnerHead.y,Math.hypot(runnerHead.x,runnerHead.z));
      const ceiling=maskPitch+Math.atan(.32*Math.tan(T.MathUtils.degToRad(cam.fov*.5)));
      const rawPitch=Math.asin(clamp(shoulderAim.y,-1,1));
      const pitch=T.MathUtils.lerp(rawPitch,Math.min(rawPitch,ceiling),closeReveal);
      shoulderAim.setY(0).normalize().multiplyScalar(Math.cos(pitch));shoulderAim.y=Math.sin(pitch);
    }
    cam.getWorldDirection(d).lerp(shoulderAim,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameGravitySweep(weight,age,player,root,groundAt,prelaunch=0){
    if(weight<=0)return;
    const cam=this.camera,forward=lensForward.subVectors(root,player).setY(0);
    if(forward.lengthSq()<.02)return;
    forward.normalize();lensRight.set(-forward.z,0,forward.x);
    const lead=.07+.33*T.MathUtils.smoothstep(age,-.03,.15)*(1-T.MathUtils.smoothstep(age,.38,.86));
    forward.addScaledVector(lensRight,-lead).normalize();
    lensRight.set(-forward.z,0,forward.x);
    const pullback=1-T.MathUtils.smoothstep(age,.34,.86);
    shoulderEye.copy(player).addScaledVector(forward,-3.55-.95*pullback).addScaledVector(lensRight,.12);
    shoulderEye.y=Math.max(player.y+1.34+1.6*prelaunch,groundAt(shoulderEye.x,shoulderEye.z)+.45);
    cam.position.lerp(shoulderEye,weight);
    const range=Math.max(1,Math.hypot(root.x-cam.position.x,root.z-cam.position.z));
    d.copy(forward);d.y=(root.y+groundAt(root.x,root.z)+1.06-cam.position.y)/range;d.normalize();
    cam.getWorldDirection(a).lerp(d,weight).normalize();cam.lookAt(shoulderAim.copy(cam.position).add(a));cam.updateMatrixWorld(true);
  }

  followRockLaunch(age, player, boss, groundAt, stones) {
    const cam=this.camera;
    // The caster and runner cross sides on takeoff. The two valid shoulder
    // solutions can be metres apart while their screen targets stay close.
    if(!this.departureView || age<this.departureView.age || age<-.10){
      this.departureView={age,eye:cam.position.clone(),rotation:cam.quaternion.clone()};
      return;
    }
    const previous=this.departureView;
    const dt=age-previous.age;
    const settle=T.MathUtils.smootherstep(age,1.12,1.95);
    const offset=a.subVectors(previous.eye,player),desired=d.subVectors(cam.position,player);
    const radius=Math.hypot(offset.x,offset.z),nextRadius=Math.max(3.5,Math.hypot(desired.x,desired.z));
    const yaw=Math.atan2(offset.x,offset.z),targetYaw=Math.atan2(desired.x,desired.z);
    const delta=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));
    const turn=yaw+clamp(delta*rate(8,dt),-2.6*dt,2.6*dt);
    const boom=radius+clamp((nextRadius-radius)*rate(8,dt),-12*dt,12*dt);
    previous.eye.x=player.x+Math.sin(turn)*boom;
    previous.eye.z=player.z+Math.cos(turn)*boom;
    previous.eye.y+=clamp((cam.position.y-previous.eye.y)*rate(8,dt),-8*dt,8*dt);
    previous.eye.lerp(cam.position,settle);
    previous.eye.y=Math.max(previous.eye.y,groundAt(previous.eye.x,previous.eye.z)+RIG.floor);
    const cameraLag=cam.position.distanceTo(previous.eye);
    cam.position.copy(previous.eye);
    if(cameraLag>.01){
      // While the boom catches up, look from the displayed eye toward both
      // actors. Copying the other shoulder's rotation points behind them.
      shoulderAim.copy(player);shoulderAim.y+=1.00;
      runnerHead.subVectors(shoulderAim,cam.position).normalize();
      bossChest.set(boss.x,groundAt(boss.x,boss.z)+boss.y+2.10,boss.z).sub(cam.position).normalize();
      const runnerYaw=Math.atan2(runnerHead.x,runnerHead.z),bossYaw=Math.atan2(bossChest.x,bossChest.z);
      const towardBoss=Math.atan2(Math.sin(bossYaw-runnerYaw),Math.cos(bossYaw-runnerYaw));
      const aimYaw=runnerYaw+clamp(towardBoss*.50,-.40,.40);
      const runnerPitch=Math.asin(clamp(runnerHead.y,-1,1));
      const aimPitch=runnerPitch+clamp((Math.asin(clamp(bossChest.y,-1,1))-runnerPitch)*.52,-.08,.23);
      shoulderAim.set(Math.sin(aimYaw)*Math.cos(aimPitch),Math.sin(aimPitch),Math.cos(aimYaw)*Math.cos(aimPitch));
      cam.getWorldDirection(d);
      d.lerp(shoulderAim,T.MathUtils.smoothstep(cameraLag,.08,1.60)).normalize();
      cam.lookAt(a.copy(cam.position).add(d));
    }
    // At departure the formation crosses the old view axis. Track its centre from
    // behind the near shoulder until the regular lock can see the whole formation.
    const castView=T.MathUtils.smootherstep(age,-.12,.16)*(1-T.MathUtils.smootherstep(age,.78,1.55));
    if(castView>0 && stones?.length){
      lensForward.subVectors(boss,player).setY(0).normalize();
      lensRight.set(-lensForward.z,0,lensForward.x);
      shoulderEye.copy(player).addScaledVector(lensForward,-3.65).addScaledVector(lensRight,.62);
      shoulderEye.y=Math.max(player.y+1.60,groundAt(shoulderEye.x,shoulderEye.z)+.45);
      cam.position.lerp(shoulderEye,castView);
      bossChest.set(0,0,0);for(const rock of stones)bossChest.add(rock.pos);
      bossChest.multiplyScalar(1/stones.length);bossChest.y=Math.max(bossChest.y,groundAt(boss.x,boss.z)+.65);
      bossChest.sub(cam.position).normalize();
      runnerHead.copy(player);runnerHead.y+=1.25;runnerHead.sub(cam.position).normalize();
      shoulderAim.copy(runnerHead).lerp(bossChest,.74).normalize();
      cam.getWorldDirection(d).lerp(shoulderAim,castView).normalize();
      cam.lookAt(a.copy(cam.position).add(d));
    }
    previous.rotation.rotateTowards(cam.quaternion,(2.9+5.8*castView)*dt)
      .slerp(cam.quaternion,rate(15,dt)*castView).slerp(cam.quaternion,settle);
    cam.quaternion.copy(previous.rotation);
    cam.updateMatrixWorld(true);
    previous.age=age;
  }

  frameHighGuard(weight,groundAt){
    const crown=this.frameBones?.[5]?.bone,cam=this.camera;
    if(!crown||weight<=0)return;
    crown.getWorldPosition(bossChest);bossChest.y+=.49;
    cam.getWorldDirection(lensForward);
    shoulderAim.copy(bossChest).sub(cam.position);
    const depth=shoulderAim.dot(lensForward);
    if(depth<.2||depth>12)return;
    const edge=testEye.copy(bossChest).project(cam).y;
    const overshoot=clamp(edge-.74,0,1.7);
    if(overshoot<=0)return;
    const move=Math.min(2.5,overshoot*depth*.60)*weight;
    shoulderEye.copy(lensForward).setY(0).normalize();
    cam.position.addScaledVector(shoulderEye,-move);
    cam.position.y=Math.max(groundAt(cam.position.x,cam.position.z)+.48,cam.position.y+.20*move);
    bossChest.sub(cam.position);
    const crownPitch=Math.atan2(bossChest.y,Math.hypot(bossChest.x,bossChest.z));
    const pitch=Math.asin(clamp(lensForward.y,-1,1));
    const margin=Math.atan(.75*Math.tan(T.MathUtils.degToRad(cam.fov*.5)));
    const aimPitch=pitch+weight*clamp(crownPitch-margin-pitch,0,.34);
    shoulderEye.multiplyScalar(Math.cos(aimPitch)).y=Math.sin(aimPitch);
    cam.lookAt(a.copy(cam.position).add(shoulderEye));cam.updateMatrixWorld(true);
  }

  frameGateVolley(weight,player,boss,gateZ,groundAt){
    lensForward.subVectors(boss,player).setY(0).normalize();
    const gateDirection=testLine.set(-player.x,0,gateZ-player.z).normalize();
    const facingGate=T.MathUtils.smoothstep(lensForward.dot(gateDirection),.70,.94);
    weight*=facingGate;
    if(weight<=0)return;
    lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(player).addScaledVector(lensForward,-4.18).addScaledVector(lensRight,-.93);
    shoulderEye.y=Math.max(player.y+1.27,groundAt(shoulderEye.x,shoulderEye.z)+.48);
    this.camera.position.lerp(shoulderEye,weight);
    shoulderAim.subVectors(boss,shoulderEye).setY(0).normalize().lerp(gateDirection,.47);
    shoulderAim.y=.213;shoulderAim.normalize();
    this.camera.getWorldDirection(d).lerp(shoulderAim,weight).normalize();
    this.camera.lookAt(a.copy(this.camera.position).add(d));this.camera.updateMatrixWorld(true);
  }

  frameMeteorReturn(weight,player,groundAt,headroom=0) {
    const cam=this.camera;
    const forward=lensForward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    lensRight.set(-forward.z,0,forward.x);
    shoulderEye.copy(player).addScaledVector(forward,-3.65).addScaledVector(lensRight,.28);
    shoulderEye.y=Math.max(player.y+1.49,groundAt(shoulderEye.x,shoulderEye.z)+.50);
    cam.position.lerp(shoulderEye,weight);
    shoulderAim.copy(player).addScaledVector(forward,7.4);
    shoulderAim.y=player.y+1.89+1.75*headroom;
    cam.getWorldDirection(d).lerp(shoulderAim.sub(cam.position).normalize(),weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameHeelAndRiposte(weight,player,root,groundAt,pitch,boom,dt,bossYaw,windup){
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.subVectors(root,player).setY(0);
    if(lensForward.lengthSq()<.01)return;
    lensForward.normalize();
    if(windup){
      const attackAxis=testLine.set(Math.sin(bossYaw),0,Math.cos(bossYaw));
      const sideStep=1-T.MathUtils.smoothstep(lensForward.dot(attackAxis),.52,.94);
      lensForward.lerp(attackAxis,.85*sideStep).normalize();
    }
    // Follow the line joining the two fighters. The blade can cross this
    // line during the fall, but must not drag the eye around the cape.
    if(!this.contactBearing)this.contactBearing=lensForward.clone();
    this.contactBearing.lerp(lensForward,rate(10,dt)).normalize();
    lensForward.copy(this.contactBearing);
    lensRight.set(-lensForward.z,0,lensForward.x);
    const standing=T.MathUtils.smootherstep(pitch,-.18,.38);
    // Swing around the planted weapon shoulder while the player deflects
    // the blow, then settle behind the player as the opponent kneels.
    this.contactOrbit=T.MathUtils.lerp(this.contactOrbit||0,windup?0:standing,rate(10,dt));
    if(this.contactOrbit>.0001){
      const angle=-.31*this.contactOrbit,s=Math.sin(angle),c=Math.cos(angle);
      const fx=lensForward.x,fz=lensForward.z;
      lensForward.set(c*fx-s*fz,0,s*fx+c*fz);
      lensRight.set(-lensForward.z,0,lensForward.x);
    }
    shoulderEye.copy(player).addScaledVector(lensForward,-boom).addScaledVector(lensRight,-.88*standing-.16);
    const eyeFloor=groundAt(shoulderEye.x,shoulderEye.z);
    shoulderEye.y=Math.max(eyeFloor+.34,player.y+1.30+.65*standing-boom*Math.tan(pitch-.045));
    cam.position.lerp(shoulderEye,weight);
    shoulderAim.copy(lensForward).addScaledVector(lensRight,.085*standing+.036);
    if(this.contactOrbit>.0001){
      testLine.subVectors(root,shoulderEye).setY(0).normalize();
      shoulderAim.lerp(testLine,.76*this.contactOrbit);
    }
    if(windup){
      testLine.subVectors(root,shoulderEye).setY(0).normalize();
      shoulderAim.lerp(testLine,.57);
    }
    shoulderAim.y=Math.tan(pitch);shoulderAim.normalize();
    cam.getWorldDirection(d).lerp(shoulderAim,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameStaggeredDuel(weight,player,root,groundAt){
    if(weight<=0)return;
    const cam=this.camera;
    lensForward.subVectors(root,player).setY(0);
    if(lensForward.lengthSq()<.04)return;
    lensForward.normalize();lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(player).addScaledVector(lensForward,-3.35).addScaledVector(lensRight,.26);
    shoulderEye.y=Math.max(player.y+1.94,groundAt(shoulderEye.x,shoulderEye.z)+.46);
    cam.position.lerp(shoulderEye,weight);
    shoulderAim.copy(lensForward).addScaledVector(lensRight,-.045);shoulderAim.y=-.145;shoulderAim.normalize();
    cam.getWorldDirection(d).lerp(shoulderAim,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameGroundDuel(weight,player,root,groundAt){
    if(weight<=0)return;
    const cam=this.camera;
    const heading=d.subVectors(root,player).setY(0);
    if(heading.lengthSq()<.025)return;
    heading.normalize();
    const eye=a.copy(player).addScaledVector(heading,-4.85);
    eye.x-=heading.z*.50;eye.z+=heading.x*.50;
    eye.y=Math.max(player.y+1.90,groundAt(eye.x,eye.z)+.50);
    cam.position.lerp(eye,weight);
    const target=a.lerpVectors(player,root,.76);target.y=groundAt(root.x,root.z)+2.52;
    target.sub(cam.position).normalize();
    cam.getWorldDirection(d).lerp(target,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  clearCompanion(dt,player,root,yaw,boss,groundAt,minimum){
    const cam=this.camera;
    this.maneCheck=(this.maneCheck||0)-dt;
    if(this.maneCheck<=0 || this.maneCover==null){
      this.maneCheck=.085;
      runnerHead.copy(player);runnerHead.y+=1.36;
      const line=testLine.subVectors(runnerHead,cam.position);
      const length=Math.max(.001,line.lengthSq());
      const ground=groundAt(root.x,root.z)+root.y;
      let cover=0;
      for(const setback of [.25,1.48,2.26]){
        bossChest.set(root.x+Math.sin(yaw)*setback,ground+2.42,root.z+Math.cos(yaw)*setback);
        const along=clamp(relativeToEye.subVectors(bossChest,cam.position).dot(line)/length,0,.92);
        testEye.copy(cam.position).addScaledVector(line,along).sub(bossChest);
        const gap=Math.hypot(testEye.x,testEye.y*.56,testEye.z);
        cover=Math.max(cover,1-T.MathUtils.smoothstep(gap,.72,1.84));
      }
      if(cover<.96 && cam.position.distanceToSquared(root)<70 && boss.capeParticles&&boss.cape
          &&crossesCape(cam.position,runnerHead,boss))cover=1;
      this.maneCover=cover;
    }
    this.maneDolly=T.MathUtils.lerp(this.maneDolly||0,this.maneCover,rate(this.maneCover>(this.maneDolly||0)?16:6,dt));
    this.frameGroundDuel(Math.max(minimum,this.maneDolly),player,root,groundAt);
  }
  frameRunnerFlight(weight,ground,altitude,groundAt){
    if(weight<=0)return;
    const cam=this.camera;
    cam.getWorldDirection(lensForward).setY(0);
    if(lensForward.lengthSq()<.015)lensForward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    else lensForward.normalize();
    lensRight.set(-lensForward.z,0,lensForward.x);
    shoulderEye.copy(ground).addScaledVector(lensForward,-4.32).addScaledVector(lensRight,.24);
    shoulderEye.y=Math.max(ground.y+1.20,groundAt(shoulderEye.x,shoulderEye.z)+.46);
    shoulderAim.copy(ground);shoulderAim.y+=1.12+.65*altitude;
    shoulderAim.sub(shoulderEye).normalize();
    cam.getWorldDirection(d);arcBetween.setFromUnitVectors(d,shoulderAim);
    d.applyQuaternion(identityTurn.identity().slerp(arcBetween,weight));
    cam.position.lerp(shoulderEye,weight);cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }
  clearNearBlade(dt,boss,groundAt){
    const cam=this.camera;
    let room=0;
    const chest=this.frameBones?.[6]?.bone;
    if(chest&&boss){
      chest.getWorldPosition(bossChest).applyMatrix4(cam.matrixWorldInverse);
      for(const weapon of boss.weapons){
        if(!weapon.bladeSections)continue;
        weapon.pivot.updateWorldMatrix(true,false);
        const scale=weapon.pivot.matrixWorld.getMaxScaleOnAxis();
        for(let i=1;i<weapon.bladeSections.length;i+=2){
          const {center,size}=weapon.bladeSections[i];
          testEye.copy(center).applyMatrix4(weapon.pivot.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
          const depth=-testEye.z, radius=.5*scale*Math.max(size.x,size.z);
          if(depth<-.1||depth>4.2||depth+.30>=-bossChest.z)continue;
          const central=Math.hypot(testEye.x,testEye.y*.9)-radius;
          const overlap=1-T.MathUtils.smoothstep(central,.12,.32*Math.max(1,depth)+.22);
          room=Math.max(room,overlap*(1-T.MathUtils.smoothstep(depth,1.65,4.2)));
        }
      }
    }
    this.bladeRoom+=(room-this.bladeRoom)*rate(room>this.bladeRoom?17:6,dt);
    if(this.bladeRoom<.005)return;
    cam.getWorldDirection(d);
    cam.position.addScaledVector(d,-1.42*this.bladeRoom);
    cam.position.y=Math.max(cam.position.y,groundAt(cam.position.x,cam.position.z)+RIG.floor);
    cam.updateMatrixWorld(true);
  }

  frameFarewell(weight, age, player, head, chest, contactAxis, groundAt, bearing){
    if(weight<=0 || !head || !chest || !contactAxis)return;
    const cam=this.camera;
    head.getWorldPosition(runnerHead);
    chest.getWorldPosition(bossChest);
    // Keep the shoulder the player was on at contact as they move around
    // the dissolving body. The hanging near sword opens across this view.
    relativeToEye.copy(contactAxis);
    if(bearing!==null){
      const yaw=T.MathUtils.degToRad(bearing+63);
      relativeToEye.set(-Math.sin(yaw),0,Math.cos(yaw));
    }
    const open=T.MathUtils.smootherstep(age,1.8,3.45);
    shoulderAim.lerpVectors(player,bossChest,.67);
    const offset=d.subVectors(player,bossChest).dot(relativeToEye);
    const distance=Math.max(7.7,4.2+Math.max(0,offset)*.67);
    shoulderEye.copy(shoulderAim).addScaledVector(relativeToEye,distance);
    shoulderEye.y=Math.max(player.y+1.88,groundAt(shoulderEye.x,shoulderEye.z)+RIG.floor);
    cam.position.lerp(shoulderEye,weight);
    lensForward.subVectors(runnerHead,cam.position);
    const horizontal=Math.max(.15,Math.hypot(lensForward.x,lensForward.z));
    const upperFrame=.17+.05*open;
    const pitch=Math.atan2(lensForward.y,horizontal)-Math.atan((1-2*upperFrame)*Math.tan(T.MathUtils.degToRad(cam.fov*.5)));
    lensForward.setY(0).normalize().applyAxisAngle(cam.up,-.036*open);
    lensForward.multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
    cam.getWorldDirection(d).lerp(lensForward,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameGallery(weight,player,groundAt){
    const cam=this.camera,yaw=T.MathUtils.degToRad(180+63);
    lensForward.set(Math.sin(yaw),0,-Math.cos(yaw));
    shoulderEye.copy(player).addScaledVector(lensForward,-3.48);
    shoulderEye.y=Math.max(player.y+2.05,groundAt(shoulderEye.x,shoulderEye.z)+RIG.floor);
    cam.position.lerp(shoulderEye,weight);
    lensForward.y=-.30;lensForward.normalize();
    cam.getWorldDirection(d).lerp(lensForward,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(d));cam.updateMatrixWorld(true);
  }

  frameRockDeparture(weight,plunge,player,root,chest,groundAt){
    const cam=this.camera;
    const forward=d.subVectors(root,player).setY(0);
    const range=forward.length();
    if(range<.01)return;
    forward.divideScalar(range);
    // The roll carries the eye around the planted swords. Stay behind the
    // player as the two paths cross, then pitch up along the departing boss.
    const distant=T.MathUtils.smoothstep(range,3.3,13);
    const rising=T.MathUtils.smoothstep(root.y,.12,2.4);
    const departure=rising*(1-T.MathUtils.smoothstep(range,17,29));
    forward.applyAxisAngle(cam.up,.095*plunge*(1-distant)+.13*departure);
    const eye=a.copy(player).addScaledVector(forward,-(3.55+.75*distant));
    const shoulder=.46*(1-distant)*plunge;
    eye.x-=forward.z*shoulder;eye.z+=forward.x*shoulder;
    eye.y+=T.MathUtils.lerp(1.65+2.92*plunge*(1-distant),1.12+.53*distant,rising);
    eye.y=Math.max(eye.y,groundAt(eye.x,eye.z)+.65);
    cam.position.lerp(eye,weight);
    const focus=a.copy(player).addScaledVector(forward,range);
    const floor=groundAt(root.x,root.z);
    focus.y=T.MathUtils.lerp(floor+2.44-1.69*plunge,chest.y-.40,Math.max(distant,rising));
    const targetDirection=focus.sub(cam.position).normalize();
    const flat=Math.hypot(player.x-cam.position.x,player.z-cam.position.z);
    const playerPitch=Math.atan2(player.y+.78-cam.position.y,flat);
    // Leave room for the tucked body at the bottom even when the lock
    // point and the newly risen stones climb rapidly in the same frame.
    const pitchLimit=playerPitch+Math.atan(.58*Math.tan(T.MathUtils.degToRad(cam.fov*.5)));
    const pitch=Math.min(Math.asin(targetDirection.y),pitchLimit);
    targetDirection.setY(0).normalize().multiplyScalar(Math.cos(pitch)).y=Math.sin(pitch);
    const nativeDirection=cam.getWorldDirection(d);
    nativeDirection.lerp(targetDirection,weight).normalize();
    cam.lookAt(a.copy(cam.position).add(nativeDirection));
    cam.updateMatrixWorld(true);
  }
}
