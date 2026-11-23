import * as T from "game/lib/three.module.js";

// Primary and supplied gameplay skip after the kneeling shot. Full shot order
// additionally checked against LogHalley V-oKiTKPCv8, 0-84s. Approximate staging;
// this renders the live scene and models, never the reference movie.
export const PHASE_CINEMATIC_DURATION=84;
export const CONSORT_WIDE_CUT=72+35/60;
export const CINEMATIC_BOSS_POSITION=new T.Vector3(0,0,-65);
// The last cut looks along the bright sky opening from the west side of the terrace.
const stairMark={position:CINEMATIC_BOSS_POSITION,yaw:Math.PI};
const revealMark={position:new T.Vector3(-19.89,0,-34.98),yaw:Math.PI-Math.atan2(20,53)};
export function phaseBlocking(time){return time>=CONSORT_WIDE_CUT?revealMark:stairMark;}
// In the two-shot (64–69 s), Radahn's brow stays below the rider's eyes.
// The anchors are on the fitted models, so this framing also follows the kneel.
export function frameConsortPortrait(camera,warlord,rider,fraction,time=68.5){
 const forward=new T.Vector3(-.075,-.085,-1).normalize();
 const right=new T.Vector3().crossVectors(forward,camera.up).normalize();
 const up=new T.Vector3().crossVectors(right,forward);
 const delta=new T.Vector3().subVectors(rider,warlord);
 const focal=Math.tan(T.MathUtils.degToRad(camera.fov/2));
 const width=focal*camera.aspect;
 const ax=-.19*width, ay=T.MathUtils.lerp(-.12,-.07,fraction)*focal;
 const bx=.39*width, by=T.MathUtils.lerp(.27,.38,fraction)*focal;
 const separation=delta.dot(forward),dx=bx-ax,dy=by-ay;
 const distance=T.MathUtils.clamp((dx*(delta.dot(right)-bx*separation)+dy*(delta.dot(up)-by*separation))/(dx*dx+dy*dy),1.7,5.6);
 camera.position.copy(warlord).addScaledVector(forward,-distance)
   .addScaledVector(right,-distance*ax).addScaledVector(up,-distance*ay);
 // The 70–72.6 s tilt follows the clasp down the cuirass and the face
 // rises toward the top border; the earlier two-shot holds both brows.
 const settle=T.MathUtils.smootherstep(time,69.75,72.55);
 camera.position.addScaledVector(right,distance*width*.055)
   .addScaledVector(up,distance*focal*T.MathUtils.lerp(.228,-.343,settle));
 camera.lookAt(new T.Vector3().copy(camera.position).add(forward));
 camera.updateMatrixWorld(true);
}
export function createPhaseTransition(scene,cloud,groundAt){
 const group=new T.Group();group.visible=false;scene.add(group);
 let riderPortraitFocus,radahnPortraitFocus;
 const stairRay=new T.Raycaster(),down=new T.Vector3(0,-1,0),sole=new T.Vector3();
 const stairMesh=scene.getObjectByName('source-worn-gateway-stairs');
 function treadBelow(x,z){
  if(!stairMesh)return groundAt(x,z);
  stairRay.set(sole.set(x,22,z),down);
  return stairRay.intersectObject(stairMesh,false)[0]?.point.y??groundAt(x,z);
 }
 const riderPosition=new T.Vector3(),visorPosition=new T.Vector3(),behindRider=new T.Vector3();
 const wristWorld=new T.Vector3(),claspScreen=new T.Vector3(),rise=new T.Vector3(),offset=new T.Vector3();
 let heldWrist;
 const flare=new T.Sprite(new T.SpriteMaterial({map:cloud,color:0xfff4c0,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));flare.position.set(0,5,-82);flare.scale.set(14,23,1);group.add(flare);
 // Keep the light count stable outside the hidden cinematic group. Toggling
 // a light parent invalidated every character shader at the combat entrance.
 const glow=new T.PointLight(0xff3920,0,23);glow.position.set(0,2.5,-65);scene.add(glow);
 const aura=new T.Sprite(new T.SpriteMaterial({map:cloud,color:0xff3216,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));aura.position.set(0,2.1,-65);aura.scale.set(4.5,5,1);group.add(aura);
 // Mint skylight around the back of the gate falls off before the outer cloud banks.
 const revealSky=new T.Group();group.add(revealSky);
 // Suspended ash catches the gate light on the terrace behind the carrier.
 // In front of the piers, the two shafts separate over the shoulder silhouette.
 const gateDust=new T.Mesh(new T.PlaneGeometry(27,25),new T.ShaderMaterial({
  transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
  uniforms:{dustTime:{value:0}},
  vertexShader:`varying vec2 localAsh;void main(){
   localAsh=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }`,
  fragmentShader:`varying vec2 localAsh;uniform float dustTime;
  void main(){
   float h=localAsh.y+7.;
   float spread=4.5-.19*h;
   float width=1.38-.038*h;
   float side=(abs(localAsh.x+.22)-spread)/width;
   float shaft=exp(-side*side);
   float foot=1.-smoothstep(1.,10.,h);
   float layer=.75+.16*sin(localAsh.y*.72-localAsh.x*.64+dustTime*.12)
                   +.09*sin(localAsh.x*2.4+localAsh.y*.36-dustTime*.19);
   float fade=(1.-smoothstep(8.,13.,abs(localAsh.x)))*(1.-smoothstep(14.,19.,h));
   float core=exp(-side*side*5.4);
   float density=(shaft*.31+core*.10+foot*.075)*fade*layer;
   gl_FragColor=vec4(vec3(.91,.71,.38),density);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`
 }));
 const dustBearing=new T.Vector3(.34,0,-.94).normalize();
 gateDust.position.copy(revealMark.position).addScaledVector(dustBearing,4.2);
 gateDust.position.y=7.;gateDust.rotation.y=Math.atan2(dustBearing.x,dustBearing.z);
 revealSky.add(gateDust);
 // The same pale textile and hair take on a diffuse transmitted glow at the gate.
 // Restore their original values on skip, replay or the first combat frame.
 const revealMaterials=new Map();
 function setRevealScatter(companion,enabled){
  if(!enabled){
   for(const [material,intensity] of revealMaterials)material.emissiveIntensity=intensity;
   revealMaterials.clear();return;
  }
  if(!companion||revealMaterials.size)return;
  companion.traverse(mesh=>{
   const hair=mesh.name.startsWith('companion-hair-');
   if(!hair&&!mesh.userData.miquellaPortrait)return;
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(!material?.emissive||revealMaterials.has(material))continue;
    revealMaterials.set(material,material.emissiveIntensity);
    material.emissiveIntensity+=hair ? .018 : .040;
   }
  });
 }
 const count=220,geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(count*3),3));
 const material=new T.PointsMaterial({color:0xff4a28,size:.055,transparent:true,opacity:.8,depthWrite:false,blending:T.AdditiveBlending});const motes=new T.Points(geometry,material);group.add(motes);
 const shots=[
  [0,5.4,[3.1,2.4,-59.7],[2.8,2.3,-60],[0,1.9,-65],46],
  [5.4,13.5,[1.3,3.1,-61.9],[.7,3.0,-62.2],[0,2.65,-65],39],
  [13.5,19.8,[2.5,1.15,-61.5],[1.8,1.05,-61.9],[.7,1.25,-65],42],
  [19.8,25.4,[0,3.35,-61.2],[0,3.45,-61.6],[0,2.8,-65],38],
  [25.4,31.4,[16,2.1,-44],[17.5,2.4,-44],[0,7,-73],52],
  [31.4,38,[4,11,-53],[3.2,13,-53],[0,17,-83],48],
  [38,46.5,[2,.7,-73],[1.4,.6,-73],[0,.8,-78],43],
  [46.5,50,[.6,3,-61.7],[.4,3,-61.8],[0,2.8,-65],38],
  [50,58,[.2,1.7,-61],[.3,1.8,-60.4],[0,3,-65],48],
  [58,63,[-2.5,4.8,-61],[-2,4.9,-61.1],[0,4.8,-65],42],
  [63,CONSORT_WIDE_CUT,[.1,4.3,-60.8],[0,4.3,-60.6],[0,4.0,-65],40],
  [CONSORT_WIDE_CUT,84,[-22.08,1,-29.48],[-22.15,.98,-29.30],[-19.78,4.12,-35],49]
 ];
 const gateSeat=new T.Matrix4().makeTranslation(.31,-.27,.21);
 let posedRider,walkingHair;
 const contacts=stairMesh?.userData.soleContacts;
 function clearContacts(){contacts?.forEach(p=>p.set(1000,0,1000));}
 return {stop(){clearContacts();if(walkingHair)walkingHair.value=0;if(posedRider){posedRider.userData.setShotPose(null);posedRider=null;}group.visible=false;glow.intensity=0;setRevealScatter(null,false);},render(time,boss,companion,camera){
  group.visible=true;
  walkingHair=companion?.userData.walkingHair;
  if(walkingHair)walkingHair.value=1.-T.MathUtils.smoothstep(time,51,58);
  clearContacts();
  if(time>=CONSORT_WIDE_CUT&&companion){
   companion.matrix.multiply(gateSeat);
   companion.matrixWorldNeedsUpdate=true;
   companion.updateWorldMatrix(true,true);
  }
  posedRider=companion?.userData.rider;
  posedRider?.userData.setShotPose(time,boss);
  const mark=phaseBlocking(time).position;
  const reveal=time>=CONSORT_WIDE_CUT;
  revealSky.visible=reveal;setRevealScatter(companion,reveal);
  if(reveal)gateDust.material.uniforms.dustTime.value=time;
  // The far glow shines through the actual cleft and is occluded by the piers.
  flare.position.set(reveal?6:0,reveal?69:5,reveal?-104:-82);
  flare.scale.set(reveal?61:14,reveal?58:23,1);
  flare.material.color.setHex(0xfff4c0).multiplyScalar(reveal?1.62:1);
  motes.position.set(mark.x,0,mark.z-CINEMATIC_BOSS_POSITION.z);
  const red=T.MathUtils.smoothstep(time,11,22)*(1-T.MathUtils.smoothstep(time,29,48));
  const gold=T.MathUtils.smoothstep(time,28,38);
  glow.color.set(red>.2?0xff3920:0xffe6a6);glow.intensity=red*6+gold*4;flare.material.opacity=gold*.95;aura.material.opacity=red*.42;
  glow.position.set(mark.x,2.5,mark.z);
  const portraitLight=T.MathUtils.smoothstep(time,57,63)*(1-T.MathUtils.smoothstep(time,CONSORT_WIDE_CUT,80));
  if(portraitLight>0){
   radahnPortraitFocus??=boss.root.getObjectByName('radahn-portrait-focus');
   if(radahnPortraitFocus){
    const source=radahnPortraitFocus.getWorldPosition(new T.Vector3()).add(new T.Vector3(2.7,2.5,2.2));
    glow.position.lerp(source,portraitLight);
    glow.intensity+=28*portraitLight;
    glow.color.lerp(new T.Color(0xfff3d9),portraitLight);
   }
  }
  if(reveal){
   glow.position.set(mark.x-2.2,mark.y+4.0,mark.z+4.5);
   glow.color.setHex(0xfff0d3);glow.intensity=104;
  }
  material.color.set(red>.2?0xff4a28:0xffe7ad);material.opacity=Math.max(red,gold*.7);
  const a=geometry.attributes.position;
  for(let i=0;i<count;i++){const u=(i/count+time*.13)%1,theta=i*2.39996+time*.7,r=.8+Math.sin(i*7.13)*.35+u*.8;a.setXYZ(i,Math.sin(theta)*r,.2+u*5,-65+Math.cos(theta)*r);}
  a.needsUpdate=true;
  if(companion){
   companion.visible=time>=39;
   if(time<57.55){
    const landing=T.MathUtils.lerp(-84.7,-81.8,T.MathUtils.smoothstep(time,39,46.5));
    const z=T.MathUtils.lerp(landing,-65,T.MathUtils.smoothstep(time,46.5,56.5));
    const pos=new T.Vector3(0,groundAt(0,z)-1.66,z);
    const feet=companion.userData.rider?.children.filter(o=>o.name==='miquella-arrival-foot');
    if(feet?.length){
      const planted=feet.reduce((a,b)=>a.position.y<b.position.y?a:b).position;
      // At this angle the rider's fitted feet lie a full tread upstage of the anchor.
      pos.y=treadBelow(-planted.x,z-planted.z)-planted.y+.102;
    }
    const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
    const scale=new T.Vector3(1,1,1);
    if(time>56.35){
      const seatedPosition=new T.Vector3(),seatedRotation=new T.Quaternion(),seatedScale=new T.Vector3();
      companion.matrix.decompose(seatedPosition,seatedRotation,seatedScale);
      const seat=T.MathUtils.smootherstep(time,56.35,57.55);
      pos.lerp(seatedPosition,seat);q.slerp(seatedRotation,seat);scale.lerp(seatedScale,seat);
    }
    companion.matrix.compose(pos,q,scale);companion.matrixWorldNeedsUpdate=true;
    if(contacts&&feet&&time>=39&&time<53)feet.forEach((foot,i)=>{
      contacts[i].set(0,-.093,-.03);foot.localToWorld(contacts[i]);
    });
   }
  }
  const shot=shots.find(s=>time>=s[0]&&time<s[1])||shots.at(-1),u=T.MathUtils.smoothstep(time,shot[0],shot[1]);
  camera.position.fromArray(shot[2]).lerp(new T.Vector3(...shot[3]),u);let focus=new T.Vector3(...shot[4]);
  // The camera and feet follow the actual stair surface. The original 45 s
  // shot looks across the toes and the embroidered hem from a low side angle.
  if(time>=39&&time<46.5&&companion){
    const feet=companion.getObjectByName('miquella-arrival-foot');
    if(feet){
      feet.getWorldPosition(focus);
      const pair=posedRider?.children.filter(part=>part.name==='miquella-arrival-foot');
      if(pair?.length===2){pair[1].getWorldPosition(sole);focus.lerp(sole,.5);}
      glow.position.copy(focus).add(new T.Vector3(-1.9,2.0,-1.7));
      glow.color.setHex(0xffecca);glow.intensity=28;
      flare.position.copy(focus).add(new T.Vector3(-4.8,1.6,-3.0));
      flare.scale.set(8,6,1);flare.material.opacity=.53;
      focus.y+=.24;camera.position.copy(focus).add(new T.Vector3(1.81,.36,.61));

    }
  }
  if(time>=5.4&&time<13.5||time>=19.8&&time<25.4||time>=46.5&&time<50){
   const head=Object.values(boss.bones).find(b=>/Head$/.test(b.name));
   if(head){focus=head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.12,0));camera.position.copy(focus).add(new T.Vector3(time<13.5?.8:.1,.10,3.35));}
  }
  camera.lookAt(focus);camera.fov=time>=39&&time<46.5?35:shot[5];camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  if(time>=63&&time<CONSORT_WIDE_CUT&&companion){
   riderPortraitFocus??=companion.getObjectByName('miquella-portrait-focus');
   radahnPortraitFocus??=boss.root.getObjectByName('radahn-portrait-focus');
   if(riderPortraitFocus&&radahnPortraitFocus){
    riderPortraitFocus.getWorldPosition(riderPosition);
    radahnPortraitFocus.getWorldPosition(visorPosition);
    frameConsortPortrait(camera,visorPosition,riderPosition,u,time);
    // As the two-shot travels down his armor, the rider straightens from
    // the bow. Keep the lower wrist on the cuirass and let the arms reach
    // from that rising torso. The filmed clasp lands at (305,595) / 1120×630.
    if(time>69.75){
     heldWrist??=posedRider?.getObjectByName('miquella-spirit-arm')?.skeleton.bones[2];
     if(heldWrist){
      heldWrist.localToWorld(wristWorld.set(0,1.14,0));
      const depth=-camera.worldToLocal(claspScreen.copy(wristWorld)).z;
      claspScreen.copy(wristWorld).project(camera);
      const halfHeight=depth*Math.tan(T.MathUtils.degToRad(camera.fov/2));
      const travel=T.MathUtils.smootherstep(time,69.75,72.08);
      const shiftX=T.MathUtils.clamp((claspScreen.x+.455)*halfHeight*camera.aspect,-.29,.29);
      const shiftY=T.MathUtils.clamp((claspScreen.y+.885)*halfHeight,0,.43);
      rise.set(shiftX,shiftY,0).applyQuaternion(camera.quaternion).multiplyScalar(travel);
      camera.position.add(rise);camera.updateMatrixWorld(true);
      // The carrier is mounted directly under the scene. Its bind transform
      // is freshly rebuilt by the boss pose before every cinematic frame.
      companion.matrix.setPosition(offset.setFromMatrixPosition(companion.matrix).add(rise));
      companion.matrixWorldNeedsUpdate=true;companion.updateWorldMatrix(true,true);
      posedRider.userData.setShotPose(time,boss);
      riderPosition.add(rise);
     }
    }
    // In the two-shot, the lit hair and shoulder frame the face. The visor
    // keeps its dark eye sockets while the raised gold catches the same key.
    glow.position.set(visorPosition.x+2.65,visorPosition.y+2.55,visorPosition.z+1.15);
    glow.color.setHex(0xffdfa6);glow.intensity=51;
    camera.getWorldDirection(behindRider);
    flare.position.copy(riderPosition).addScaledVector(behindRider,2.1);
    flare.position.x+=.47;flare.position.y+=.25;
    flare.scale.set(4.5,4.9,1);flare.material.opacity=.24;
   }
  }
  if(reveal&&companion){
   riderPortraitFocus??=companion.getObjectByName('miquella-portrait-focus');
   if(riderPortraitFocus){
    riderPortraitFocus.getWorldPosition(riderPosition);
    // Grazing light strikes the hair from the gate, leaving the front cuirass dark.
    glow.position.set(riderPosition.x+2.65,riderPosition.y+1.26,riderPosition.z-1.72);
    glow.color.setHex(0xffdc94);glow.intensity=65;
    aura.position.set(riderPosition.x+.60,riderPosition.y-.68,riderPosition.z-2.3);
    aura.scale.set(7.8,6.3,1);aura.material.color.setHex(0xffe7a9);
    aura.material.opacity=.14;
   }
  }else{
   aura.position.set(0,2.1,-65);aura.scale.set(4.5,5,1);aura.material.color.setHex(0xff3216);
  }
  return Math.max(1-T.MathUtils.smoothstep(time,0,1),T.MathUtils.smoothstep(time,82.6,84));
 }};
}
