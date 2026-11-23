import * as T from "game/lib/three.module.js";

const nativeEye=new T.Vector3(),nativeDir=new T.Vector3(),target=new T.Vector3(),eye=new T.Vector3(),direction=new T.Vector3();
const relative=new T.Vector3(),endRelative=new T.Vector3();
const crown=new T.Vector3();
const chase=new T.Vector3(),across=new T.Vector3();
const arc=new T.Quaternion(),identity=new T.Quaternion();
const ease=T.MathUtils.smootherstep;

// Recorded compass bearings and horizon crossings constrain the replay camera.
// Orbit the subject as well as turning the lens so the actor stays in frame.
export function alignReferenceShot(camera,seconds,shots,subject,groundAt,player,gateRockCast=false,finalPass=false,bossHead=null,afterPlayer=false,strength=1,aimOnly=false){
  let shot,weight=0;
  for(let i=0;i<shots.length;i++){
    const current=shots[i],first=current[0][0],last=current.at(-1)[0];
    const blend=current[0][5]??.36;
    const lead=i?Math.min(blend,(first-shots[i-1].at(-1)[0])*.5):blend;
    const tail=i+1<shots.length?Math.min(blend,(shots[i+1][0][0]-last)*.5):blend;
    if(seconds<first-lead)return;
    if(seconds>last+tail)continue;
    shot=current;
    weight=strength*ease(seconds,first-lead,first)*(1-ease(seconds,last,last+tail));
    break;
  }
  if(!shot || (shot[0].length>4)!==finalPass || (shot[0].length>5)!==afterPlayer)return;
  let index=shot.findIndex(s=>s[0]>=seconds);
  if(index<0)index=shot.length-1;
  const a=shot[Math.max(0,index-1)],b=shot[index];
  const u=T.MathUtils.clamp((seconds-a[0])/Math.max(.0001,b[0]-a[0]),0,1);
  const delta=b[1]-a[1],yaw=a[1]+u*Math.atan2(Math.sin(delta),Math.cos(delta));
  const pitch=T.MathUtils.lerp(a[2],b[2],u);
  direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  nativeEye.copy(camera.position);camera.getWorldDirection(nativeDir);
  if(aimOnly){
    arc.setFromUnitVectors(nativeDir,direction).slerp(identity,1-weight);
    camera.lookAt(nativeDir.applyQuaternion(arc).add(camera.position));
    camera.updateMatrixWorld(true);
    return;
  }
  if(finalPass&&player){
    // Sampled shoulder distance sets the near fighter's scale. When the
    // dodge crosses the lens, the reference pans across Radahn's torso.
    chase.set(Math.sin(yaw),0,-Math.cos(yaw));
    across.set(-chase.z,0,chase.x);
    relative.subVectors(subject,player);
    const side=relative.dot(across),along=relative.dot(chase);
    const halfHeight=Math.tan(T.MathUtils.degToRad(camera.fov*.5)),halfWidth=halfHeight*camera.aspect;
    const crossing=ease(Math.abs(side),2.0,4.9);
    // A crouching Radahn's mantle flares beyond his root during recovery.
    // Keep the lens outside that moving envelope on the southern gallery shot.
    const bossShare=afterPlayer?.43:.48+.49*crossing;
    const range=Math.max(T.MathUtils.lerp(a[4],b[4],u),afterPlayer?7.65-along:0,
      (1-crossing)*(Math.abs(side)*bossShare+.38)/(halfWidth*.83),
      (Math.abs(side)*(1-bossShare)+.68)/(halfWidth*.83)-along);
    eye.copy(player).addScaledVector(chase,-range).addScaledVector(across,bossShare*side);
    const ground=groundAt(player.x,player.z);
    const focus=subject.y+T.MathUtils.lerp(a[3],b[3],u);
    const shoulderHeight=ground+player.y+1.65-range*Math.tan(pitch);
    eye.y=T.MathUtils.lerp(shoulderHeight,focus-(range+along)*Math.tan(pitch),.48);
    if(bossHead){
      const grounded=1-ease(subject.y-groundAt(subject.x,subject.z),.30,1.7);
      bossHead.getWorldPosition(crown);crown.y+=.44;
      const depth=relative.subVectors(crown,eye).dot(chase);
      const topSlope=Math.tan(pitch+Math.atan(halfHeight*.88));
      const overflow=Math.max(0,crown.y-eye.y-depth*topSlope)*grounded*(1-crossing);
      const back=Math.min(1.1,.65*overflow);
      eye.addScaledVector(chase,-back);
      eye.y+=Math.min(1.55,Math.max(0,overflow-back*topSlope));
    }
    eye.y=Math.max(eye.y,groundAt(eye.x,eye.z)+.48);
    camera.position.lerp(eye,weight);
    arc.setFromUnitVectors(nativeDir,direction).slerp(identity,1-weight);
    camera.lookAt(nativeDir.applyQuaternion(arc).add(camera.position));
    camera.updateMatrixWorld(true);
    return;
  }
  if(shot===shots[0]&&player){
    // Radahn starts high on the gate. The recorded bearing is the view
    // from the runner's shoulder throughout the opening gravity charge.
    chase.copy(direction).setY(0).normalize();
    across.set(-chase.z,0,chase.x);
    eye.copy(player).addScaledVector(chase,-4.65).addScaledVector(across,.16);
    eye.y+=groundAt(player.x,player.z)+1.40;
    eye.y=Math.max(eye.y,groundAt(eye.x,eye.z)+.45);
    camera.position.lerp(eye,weight);
    nativeDir.lerp(direction,weight).normalize();
    camera.lookAt(nativeDir.add(camera.position));camera.updateMatrixWorld(true);
    return;
  }
  target.copy(subject);target.y+=T.MathUtils.lerp(a[3],b[3],u);
  const distance=Math.max(3.7,nativeEye.distanceTo(target));
  eye.copy(target).addScaledVector(direction,-distance);
  eye.y=Math.max(eye.y,groundAt(eye.x,eye.z)+.42);
  if(player){
    chase.subVectors(subject,player).setY(0);
    const low=1-ease(subject.y-groundAt(subject.x,subject.z),.35,1.25);
    const longShot=low*ease(chase.length(),12,18);
    if(longShot>0){
      // With a distant grounded subject, orbiting its chest leaves the
      // runner outside the shot. Carry the eye behind the near shoulder.
      chase.normalize();across.set(-chase.z,0,chase.x);
      endRelative.copy(player).addScaledVector(chase,-3.25).addScaledVector(across,.76);
      endRelative.y=groundAt(endRelative.x,endRelative.z)+2.18;
      eye.lerp(endRelative,longShot);
      chase.subVectors(subject,eye).setY(0).normalize();
      chase.y=-.108;chase.normalize();
      direction.lerp(chase,longShot).normalize();
    }
  }
  if(player&&gateRockCast){
    // During the airborne rock cast the near shoulder stays at screen right.
    // Angle past it to retain the split gate and the sky between the piers.
    across.set(-direction.z,0,direction.x).normalize();
    chase.copy(direction).setY(0).normalize();
    endRelative.copy(player).addScaledVector(across,-2.36).addScaledVector(chase,-4.85);
    endRelative.y=groundAt(endRelative.x,endRelative.z)+1.72;
    eye.lerp(endRelative,ease(subject.y-groundAt(subject.x,subject.z),2.5,4.5));
  }
  relative.subVectors(nativeEye,target);endRelative.subVectors(eye,target);
  const radius=T.MathUtils.lerp(relative.length(),endRelative.length(),weight);
  relative.normalize();endRelative.normalize();
  arc.setFromUnitVectors(relative,endRelative).slerp(identity,1-weight);
  camera.position.copy(target).addScaledVector(relative.applyQuaternion(arc),radius);
  camera.position.y=Math.max(camera.position.y,groundAt(camera.position.x,camera.position.z)+.42);
  arc.setFromUnitVectors(nativeDir,direction);
  nativeDir.applyQuaternion(arc.slerp(identity,1-weight));
  camera.lookAt(nativeDir.add(camera.position));camera.updateMatrixWorld(true);
}
// Upper edge of the player's hair and lower edge of the boots, in percent
// of the source picture. Values beyond 100 preserve intentional close shots.
// A dash leaves a cut, occlusion, or full-screen effect to its own camera.
const playerBounds = [
  '- - - 46:93 43:92 47:97 - 55:101 54:113 50:112',
  '64:116 58:113 48:108 58:110 57:109 57:108 57:92 46:89 42:94 -',
  '52:112 46:120 39:124 49:103 44:111 51:116 46:101 - 46:125 44:120',
  '45:97 46:86 40:85 37:96 50:89 38:99 47:94 54:112 63:119 49:109',
  '47:111 52:114 36:114 42:106 51:109 48:118 49:111 50:108 36:119 -',
  '50:109 49:111 51:105 52:111 - - 44:91 48:99 48:104 48:109',
  '52:113 52:111 55:120 58:116 49:110 49:109 49:112 45:96 41:83 29:69',
  '28:69 35:79 - 37:127 46:124 47:109 48:109 52:108 - 48:113',
  '46:118 49:110 - 53:110 51:97 54:111 48:98 48:97 33:103 -',
  '54:112 49:99 45:99 47:100 47:113 49:99 49:112 54:118 - 49:118',
  '60:115 67:126 - 51:105 47:100 49:100 51:103 50:109 41:99 52:118',
  '- 50:114 50:115 56:105 44:92 45:91 40:104 47:86 57:111 49:90',
  '50:101 46:122 - 52:113 32:77 37:90 43:99 49:112 51:109 47:113',
  '46:111 48:91 56:120 49:112 34:98 54:124 53:126 72:132 48:110 48:96',
  '- - 51:113 52:113 53:112 51:107 47:95 44:79 36:79 31:76',
  '35:80 29:76 30:90 30:90 30:91 - - - - -',
  '- - - 31:89 30:90 - - - - -',
].join(' ').split(' ').map(pair=>pair==='-'?null:pair.split(':').map(n=>Number(n)/100));
const keepBossFace=[[20.4,26.9],[29.1,29.8],[34.7,37.7],[39.5,40.8],[43.4,44.8],
  [46.4,48.5],[51,53.7],[74.8,77.8],[83.5,92.7],[103,106.5],[112.6,120.2],[127.7,131.3],[138.6,139.8]];
export function referencePlayerBounds(time){
  const i=Math.floor(time),u=time-i,a=playerBounds[i],b=playerBounds[i+1];
  if(!a&&!b)return null;
  const start=a||b,end=b||a,t=u*u*(3-2*u);
  let face=0;
  for(const [enter,leave] of keepBossFace)if(time>=enter&&time<=leave)
    face=Math.min(1,(time-enter)*4,(leave-time)*4);
  return {top:start[0]+(end[0]-start[0])*t,bottom:start[1]+(end[1]-start[1])*t,
    weight:a&&b?1:a?1-t:t,face};
}
