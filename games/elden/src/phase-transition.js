import * as T from "game/lib/three.module.js";
import {createCinematicWitness} from "game/src/companion-robe.js";

// Primary and supplied gameplay skip after the kneeling shot. Full shot order
// additionally checked against LogHalley V-oKiTKPCv8, 0-84s. Approximate staging;
// this renders the live scene and models, never the reference movie.
export const PHASE_CINEMATIC_DURATION=84;
export const CONSORT_WIDE_CUT=72+35/60;
export const CINEMATIC_BOSS_POSITION=new T.Vector3(0,0,-35);
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
 const fit=(dx*(delta.dot(right)-bx*separation)+dy*(delta.dot(up)-by*separation))/(dx*dx+dy*dy);
 // The red crest fills the near plane of the 65–70 s two-shot, screening
 // the rider's lower chest. Keep Radahn's brow on its original screen mark.
 const distance=T.MathUtils.clamp(.83*fit,1.45,5.0);
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
 let landingHeight,edgeHeight;
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
 // Fine embers and billowing red aura wrap around the bowed knight.
 const eddies=Array.from({length:9},(_,i)=>{
  const plume=new T.Sprite(new T.SpriteMaterial({map:cloud,color:i%3?0xac2810:0xff4820,
   transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  group.add(plume);return plume;
 });
 const grit=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),
  new T.MeshStandardMaterial({color:0x4d3930,roughness:.93}),84);
 grit.frustumCulled=false;group.add(grit);
 const fragment=new T.Object3D();
 // A short bank of illuminated mist behind the stair crest, viewed edge-on
 // along the terrace. It stays behind the walking feet and dims at the stone.
 const seamLight=new T.Sprite(new T.SpriteMaterial({map:cloud,color:0xfff3c4,transparent:true,
  opacity:1,depthWrite:false,blending:T.AdditiveBlending}));
 seamLight.position.set(.35,27,-94);seamLight.scale.set(11,34,1);
 seamLight.material.color.setHex(0xffeab9).multiplyScalar(1.42);group.add(seamLight);
 const threshold=new T.Mesh(new T.PlaneGeometry(31,30),new T.ShaderMaterial({
  transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
  vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 p;void main(){
   float h=p.y,spread=mix(.42,.058,smoothstep(.20,.90,h));
   float crossGate=(p.x-.5+.009*sin(h*17.))/spread;
   float bank=exp(-3.5*crossGate*crossGate)*(1.-smoothstep(.47,1.,h));
   float drift=.91+.06*sin(p.x*39.+h*18.)+.03*sin(h*47.-p.x*22.);
   vec3 gold=mix(vec3(.89,.64,.28),vec3(1.,.96,.79),bank);
   gl_FragColor=vec4(gold*2.3,bank*drift*smoothstep(0.,.19,h));
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`
 }));
 threshold.position.set(.2,18.5,-77.6);group.add(threshold);
 const thresholdDust=new T.Sprite(new T.SpriteMaterial({map:cloud,color:0xffe3a5,transparent:true,
  opacity:.61,depthWrite:false,blending:T.AdditiveBlending}));
 thresholdDust.position.set(.55,groundAt(.55,-74)+1.1,-74);thresholdDust.scale.set(18,7,1);group.add(thresholdDust);
 // The close gate view includes the fractured right bank rising across the
 // stair foot. Keep its contours attached to the actual underlying terrain.
 const bankShape=new T.PlaneGeometry(29,25,96,82);bankShape.rotateX(-Math.PI/2);
 const ridgePoints=bankShape.attributes.position;
 for(let i=0;i<ridgePoints.count;i++){
  const x=ridgePoints.getX(i)+16.6,z=ridgePoints.getZ(i)-73;
  const edge=Math.sin(Math.PI*bankShape.attributes.uv.getX(i))*Math.sin(Math.PI*bankShape.attributes.uv.getY(i));
  const cross=(x-9.1-.24*(z+72))/5.7,along=(z+74)/10;
  const bed=.48*Math.sin(x*.97+z*.39)+.32*Math.sin(z*1.8-x*.72)+.18*Math.sin(x*3.3+z*2.4);
  ridgePoints.setXYZ(i,x,groundAt(x,z)-.38+edge*(.84+15*Math.exp(-cross*cross-along*along)+bed),z);
 }
 bankShape.computeVertexNormals();
 const rightBank=new T.Mesh(bankShape,scene.getObjectByName('gate-hill-skin')?.material||
  new T.MeshStandardMaterial({color:0x514a3b,roughness:.97}));
 rightBank.receiveShadow=true;group.add(rightBank);
 const landingLight=new T.Mesh(new T.PlaneGeometry(13,7),new T.ShaderMaterial({
  uniforms:{landingRadiance:{value:1}},
  transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
  vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 p;uniform float landingRadiance;void main(){
   float band=smoothstep(.04,.63,p.y)*(1.-smoothstep(.76,1.,p.y));
   float x=(p.x-.53-.11*p.y)*2.2;float beam=exp(-x*x);
   float shafts=.66+.34*pow(.5+.5*sin(41.*p.x+7.*p.y),2.);
   gl_FragColor=vec4(vec3(2.55,2.34,1.65)*(.76+.24*shafts)*landingRadiance,band*(.44+.56*beam)*.86);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`
 }));
 landingLight.rotation.y=Math.PI/2;group.add(landingLight);
 const chipGeometry=new T.SphereGeometry(1,108,54);
 const chipPoints=chipGeometry.attributes.position;
 for(let i=0;i<chipPoints.count;i++){
  const x=chipPoints.getX(i),y=chipPoints.getY(i),z=chipPoints.getZ(i);
  const strata=Math.sin(21*z+11*x-5*y+.7*Math.sin(8*x+3*z));
  const edge=1+.095*Math.sin(5*x-3*y+7*z)+.035*strata+.012*Math.sin(31*z+19*x-17*y);
  chipPoints.setXYZ(i,x*edge,.184*y*edge-.46*z+.025*strata+.029*Math.sin(4*x-5*z),z*edge);
 }
 chipGeometry.computeVertexNormals();
 const scarp=new T.MeshStandardMaterial({color:0x514f42,roughness:.97});
 scarp.onBeforeCompile=s=>{
  s.vertexShader='varying vec3 rock;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrock=position;');
  s.fragmentShader=`varying vec3 rock;
   float chipSeed(vec2 p){vec3 a=fract(p.xyx*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
   float layer(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(chipSeed(i),chipSeed(i+vec2(1,0)),f.x),mix(chipSeed(i+vec2(0,1)),chipSeed(i+1.),f.x),f.y);}
   `+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 st=rock.xz+rock.y*vec2(.51,.38);
   float bed=layer(st*10.)+.48*layer(st*27.)+.23*layer(st*86.);
   diffuseColor.rgb*=.19+.81*bed+.40*layer(st*260.);`);
 };
 const stairChip=new T.Mesh(chipGeometry,scarp);
  stairChip.scale.set(.40,.71,.73);stairChip.rotation.y=.15;stairChip.receiveShadow=true;
 group.add(stairChip);
 // First incoming frames of the eleven shots in the 60 Hz reference.
 const cuts=[0,251,758,1163,1582,1875,2281,2778,3043,3549,4355,5040].map(f=>f/60);
 const witness=createCinematicWitness(T);group.add(witness);
 const V=(x,y,z)=>new T.Vector3(x,y,z);
 const camPos=V(0,0,0),focus=V(0,0,0),head=V(0,0,0),chest=V(0,0,0),grip=V(0,0,0);
 const feetFocus=V(0,0,0),riderCamera=V(0,0,0),riderFocus=V(0,0,0);
 const qA=new T.Quaternion(),qB=new T.Quaternion();
 let neck,sternum,sword;
 const gateSeat=new T.Matrix4().makeTranslation(.31,-.27,.21);
 let posedRider,walkingHair;
 const contacts=stairMesh?.userData.soleContacts;
 function clearContacts(){contacts?.forEach(p=>p.set(1000,0,1000));}
 return {stop(){
  if(!group.visible)return;
  clearContacts();
  if(neck?.userData.redPortrait)neck.userData.redPortrait.value=0;
  if(walkingHair)walkingHair.value=0;
  if(posedRider){posedRider.userData.setShotPose(null);posedRider=null;}
  group.visible=false;glow.intensity=0;setRevealScatter(null,false);
 },render(time,boss,companion,camera){
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
  let shot=0;while(shot<10&&time+1e-7>=cuts[shot+1])shot++;
  const u=T.MathUtils.smoothstep(time,cuts[shot],cuts[shot+1]);
  if(shot===9&&companion){
   companion.matrix.elements[13]+=2.00*(1-T.MathUtils.smootherstep(time,cuts[9],64.45));
   companion.matrixWorldNeedsUpdate=true;companion.updateWorldMatrix(true,true);
  }
  const mark=phaseBlocking(time).position;
  neck??=boss.root.getObjectByName('radahn-portrait-focus')||Object.values(boss.bones).find(b=>b.name.endsWith('Head'))||boss.root;
  sternum??=boss.lockBone||Object.values(boss.bones).find(b=>b.name.endsWith('Spine2'))||boss.root;
  sword??=boss.weapons.find(w=>w.side==='Right')?.pivot||boss.hand('Right')||boss.root;
  neck.getWorldPosition(head);sternum.getWorldPosition(chest);sword.getWorldPosition(grip);
  if(neck.userData.redPortrait)neck.userData.redPortrait.value=shot===3?1:0;
  const floor=groundAt(mark.x,mark.z);
  witness.visible=shot===8;
  const reveal=time>=CONSORT_WIDE_CUT;
  revealSky.visible=reveal;setRevealScatter(companion,reveal);
  if(reveal)gateDust.material.uniforms.dustTime.value=time;
  // The far glow shines through the actual cleft and is occluded by the piers.
  flare.position.set(reveal?6:0,reveal?69:21,reveal?-104:-82);
  flare.scale.set(reveal?61:10,reveal?58:19,1);
  flare.material.color.setHex(0xfff4c0).multiplyScalar(reveal?1.62:1);
  motes.position.set(chest.x,chest.y-2.2,chest.z);
  const red=T.MathUtils.smoothstep(time,12.6,18.8)*(1-T.MathUtils.smoothstep(time,28.2,31.25));
  const gold=T.MathUtils.smoothstep(time,28,38);
  glow.color.set(red>.2?0xff3920:0xffe6a6);glow.intensity=red*6+gold*4;flare.material.opacity=gold*.95;aura.material.opacity=red*.42;
  glow.position.copy(chest);glow.position.z+=1.35;glow.intensity+=12*red;
  if(shot===3){
   // During the head lift the visor stays in shadow against the red vapour.
   glow.position.copy(head).add(V(-1.3,.16,1.25));glow.color.setHex(0xff382a);glow.intensity=6.4;
  }
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
  eddies.forEach((plume,i)=>{
   plume.visible=red>.001;
   if(!plume.visible)return;
   const a=i*2.40+time*.38,h=(i/9+time*.17)%1;
   plume.position.set(chest.x+Math.cos(a)*1.08,chest.y-1.35+h*2.62,chest.z+.31+Math.sin(a)*.67);
   plume.scale.set(1.6+.5*h,2.7-h*.5,1);plume.material.rotation=a*.32;
   plume.material.opacity=red*(.17+.12*Math.sin(h*Math.PI));
  });
  grit.visible=shot===2||shot===3||shot===4;
  if(grit.visible){
   for(let i=0;i<grit.count;i++){
    const a=i*2.4,r=.9+(i%17)*.29,w=(i*.371+time*(.13+(i%4)*.013))%1;
    fragment.position.set(mark.x+Math.cos(a)*r,floor+w*(1.1+.23*(i%11))*red,mark.z+Math.sin(a)*r);
    const size=.025+(i%6)*.017;fragment.scale.set(size*1.4,size*.65,size*.86);
    fragment.rotation.set(a+w*3,i+w*1.4,w*4);fragment.updateMatrix();grit.setMatrixAt(i,fragment.matrix);
   }grit.instanceMatrix.needsUpdate=true;
  }
  seamLight.visible=shot===0||shot===4||shot===5||shot===8;
  threshold.visible=seamLight.visible;
  thresholdDust.visible=shot===5;rightBank.visible=shot===5;
  threshold.position.set(.2,shot===5?33:18.5,shot===5?-92:-77.6);
  threshold.scale.set(shot===5?.92:1,shot===5?1.62:1,1);
  seamLight.material.opacity=shot===5?.72:1;
  if(shot===5){
   landingHeight??=treadBelow(0,-83.24);
   thresholdDust.position.set(.55,landingHeight+2.65,-77.8);
   thresholdDust.scale.set(24,8.3,1);thresholdDust.material.opacity=.64;
  }
  landingLight.visible=shot===6;
  stairChip.visible=landingLight.visible;
  if(landingLight.visible){
   if(walkingHair)walkingHair.value=1+.92*(1-T.MathUtils.smoothstep(time,41.8,45.8));
   landingLight.material.uniforms.landingRadiance.value=1.7-.64*T.MathUtils.smootherstep(time,39.6,42.3);
   landingHeight??=treadBelow(0,-83.24);edgeHeight??=treadBelow(1.02,-83.35);
   landingLight.position.set(-1.85,landingHeight+1.14,-83.24);
   stairChip.position.set(1.02,edgeHeight+.075,-83.35);
  }
  material.color.set(red>.2?0xff4a28:0xffe7ad);material.opacity=Math.max(red,gold*.7);
  const a=geometry.attributes.position;
  for(let i=0;i<count;i++){const u=(i/count+time*.13)%1,theta=i*2.39996+time*.7,r=.8+Math.sin(i*7.13)*.35+u*.8;a.setXYZ(i,Math.sin(theta)*r,.2+u*5,Math.cos(theta)*r);}
  a.needsUpdate=true;
  if(companion){
   companion.visible=time>=cuts[6]&&shot!==8;
   if(companion.visible&&time<57.55){
    const landing=-82.72+.46*(T.MathUtils.clamp(time,38,46.3)-43.5);
    const z=T.MathUtils.lerp(landing,mark.z,T.MathUtils.smoothstep(time,46.3,56.5));
    const pos=new T.Vector3(0,groundAt(0,z)-1.66,z);
    const feet=companion.userData.rider?.children.filter(o=>o.name==='miquella-arrival-foot');
    if(feet?.length){
      let support=-Infinity;
      for(const foot of feet){
       if(!foot.userData.planted)continue;
       for(const pad of foot.userData.contactPoints()){
        support=Math.max(support,treadBelow(-pad.x,z-pad.z)-pad.y);
       }
      }
      if(Number.isFinite(support))pos.y=support;
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
      const [heel,ball,toe]=foot.userData.contactPoints();
      const pad=ball.y<toe.y?ball:toe;
      const toToe=T.MathUtils.smoothstep(heel.y-pad.y,-.018,.055);
      contacts[i].copy(heel).lerp(pad,.24+.72*toToe);
      foot.parent.localToWorld(contacts[i]);
    });
   }
  }
  // The kneeling actor stands on the raised terrace. Base close-ups on the
  // visor and planted weapon after IK so changes in terrain or pose follow.
  let lens=40;
  function portrait(anchor,dx,dy,dz,tx,ty,tz,fov){
   focus.copy(anchor).add(V(tx,ty,tz));camPos.copy(anchor).add(V(dx,dy,dz));lens=fov;
  }
  switch(shot){
   case 0:
    portrait(head,.15,-1.38,5.65-.12*u,-.045,.49,0,43);break;
   case 1:
    portrait(head,1.65,1.05,1.19-.12*u,.00,.22,-.32,38);break;
   case 2:
    focus.copy(chest).lerp(grip,.53);focus.y=floor+1.23;
    camPos.copy(focus).add(V(-.54,-.24,3.12-.16*u));lens=39;break;
   case 3:
    portrait(head,.065,-.42,1.89-.07*u,0,.18-.29*u,0,28.5);break;
   case 4:
    camPos.set(20+1.8*u,0,mark.z+19.2);camPos.y=groundAt(camPos.x,camPos.z)+1.25;
    focus.set(-1.2-.6*u,floor+6.5,mark.z-3.3-7*u);lens=55;
    break;
   case 5:
    camPos.set(1.7,8.0,1.8-2.7*u);focus.set(.3,42.6+1.4*u,-88);lens=37.1;break;
   case 6:{
    // A fixed camera looks across the steps. The first frames show only
    // the illuminated treads; the feet enter and leave the composition.
    const z=-83.24-.19*T.MathUtils.smootherstep(time,43.05,45.25);
    feetFocus.set(0,landingHeight+.25,z);
    const foot=companion?.getObjectByName('miquella-arrival-foot');
    if(foot){foot.getWorldPosition(sole);feetFocus.x=sole.x*.16;}
    focus.copy(feetFocus);camPos.copy(focus).add(V(1.62,.30,.41));lens=38;
    glow.position.copy(feetFocus).add(V(-1.9,2,-1.7));
    glow.color.setHex(0xffe6c9);glow.intensity=21;
    flare.position.copy(feetFocus).add(V(-4.5,1.5,-1.2));flare.scale.set(8,5,1);flare.material.opacity=.48-.15*u;
    break;
   }
   case 7:
    portrait(head,.17,.08,2.5-.24*u,0,-.15,.04,34);break;
   case 8:{
    // A reverse from behind the jar bearer, pulling back to reveal both blades.
    // Keep the observer on the terrace as Radahn stands behind him.
    // Above the jar rim the pullback reveals the plume first, then the shoulders.
    const distance=1.65+.62*u,eyeOffset=-.23;
    const z=mark.z+4.55,rim=.22+.24*u;
    // Frame the cylindrical wall at a grazing angle. The rim hides the
    // face while the crest first appears above the narrow neck of the jar.
    const reverseHeight=head.y-rim-(rim-eyeOffset)*(z-head.z)/distance;
    witness.scale.setScalar(1.98);
    witness.position.set(mark.x,reverseHeight,z);witness.rotation.y=.045;
    focus.copy(witness.position);focus.y+=-.20+.18*u;
    camPos.set(mark.x,reverseHeight+eyeOffset,z+distance);
    glow.position.copy(witness.position).add(V(-.67,.68,1.05));
    glow.color.setHex(0xf4e6cf);glow.intensity=.92+.52*u;
    lens=29+2*u;
    flare.position.copy(head).add(V(.6,1.5,-2.9));flare.scale.set(5.5,5,1);flare.material.opacity=.3+.54*u;
    break;
   }
   case 9:break;
   case 10:
    camPos.set(-22.08-.07*u,1-.02*u,-29.48+.18*u);focus.set(-19.78,4.12,-35);lens=49;break;
  }
  camera.fov=lens;camera.updateProjectionMatrix();
  if(shot!==9){
   camera.position.copy(camPos);camera.lookAt(focus);
   if(shot===6)camera.rotateZ(.115);
   camera.updateMatrixWorld(true);
  }
  if(shot===9&&companion){
   riderPortraitFocus??=companion.getObjectByName('miquella-portrait-focus');
   radahnPortraitFocus??=boss.root.getObjectByName('radahn-portrait-focus');
   if(riderPortraitFocus&&radahnPortraitFocus){
    riderPortraitFocus.getWorldPosition(riderPosition);
    radahnPortraitFocus.getWorldPosition(visorPosition);
    const descend=T.MathUtils.smootherstep(time,cuts[9],64.45);
    frameConsortPortrait(camera,visorPosition,riderPosition,T.MathUtils.smoothstep(time,63,CONSORT_WIDE_CUT),time);
    if(descend<1){
     // Start high on the outstretched arms. Descend to the two faces in
     // a single take, with no lens or pose discontinuity at 63 seconds.
     riderFocus.copy(riderPosition).add(V(-.21,-.41,0));
     riderCamera.copy(riderFocus).add(V(.19,-.22,2.92));
     camPos.copy(camera.position);qB.copy(camera.quaternion);
     camera.position.copy(riderCamera);camera.lookAt(riderFocus);qA.copy(camera.quaternion);
     camera.position.lerp(camPos,descend);camera.quaternion.slerpQuaternions(qA,qB,descend);
     camera.updateMatrixWorld(true);
    }
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
    glow.color.setHex(0xffe1b4);glow.intensity=34;
    if(descend<1){
     glow.position.lerp(offset.copy(riderPosition).add(V(-2.25,1.52,1.20)),1-descend);
     glow.intensity-=12*(1-descend);
    }
    camera.getWorldDirection(behindRider);
    flare.position.copy(riderPosition).addScaledVector(behindRider,2.1);
    flare.position.x+=1.52;flare.position.y+=.50;
    flare.position.x+=.35;
    flare.scale.set(8.7,7.4,1);flare.material.opacity=.15+.19*(1-descend);
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
    aura.material.opacity=.32;
   }
   }else if(shot===9&&companion&&time<65){
   camera.getWorldDirection(behindRider);
   aura.position.copy(riderPosition).addScaledVector(behindRider,-.46);
   aura.position.y+=.08;aura.scale.set(4.8,3.7,1);aura.material.color.setHex(0xffe9b3);
   aura.material.opacity=.068*(1-T.MathUtils.smoothstep(time,62.2,65));
  }else{
   aura.position.copy(chest);aura.position.z+=.36;aura.scale.set(4.5,5,1);aura.material.color.setHex(0xff3216);
  }
  return Math.max(1-T.MathUtils.smoothstep(time,0,1),T.MathUtils.smoothstep(time,81.5,84.15));
 }};
}
