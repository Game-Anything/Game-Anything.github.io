import {batchLiveTiles,batchLooseSlabs} from "game/src/static-instances.js";
import {canLeaveForDodge,queueRecovery,thrustTravel} from "game/src/action-recovery.js";
import {attachLiveControls,controlLabel} from "game/src/live-controls.js";
import {alignReferenceShot,referencePlayerBounds} from "game/src/reference-shot.js";
import {onTerrace} from "game/src/arena-layout.js";
import {bossClearance,constrainCombatArena,constrainEntrance,crossingNormal} from "game/src/arena-contact.js";
import {addBackgroundSplats} from "game/src/background-splats.js";
import {partitionArenaSurfaces} from "game/src/arena-surface-sections.js";
import {createPhaseTransition,PHASE_CINEMATIC_DURATION,CINEMATIC_BOSS_POSITION,CONSORT_WIDE_CUT,phaseBlocking} from "game/src/phase-transition.js";
import * as T from "game/lib/three.module.js";
import {MOVES,CONTACT_DAMAGE,BLOODFLAME,CRIMSON_FLASK_HEAL,LIGHT_CONTACTS,lightContacts,BOSS_SWINGS,SPRINT_HOLD,SPRINT_DRAIN_PER_SECOND,faces,entersSecondPhase,meteorEligible,grabResult,GRAB_COOLDOWN,GRAB_SEQUENCE,STOMP_GRAB_SEQUENCE,ROCK_RETURN,ROCK_SEQUENCE,RUSH_SEQUENCE,METEOR_SEQUENCE,RIPOSTE_SEQUENCE,RUNNING_THRUST,meteorAirTarget,ROCK_FORMATION,ROCK_COUNT,meleeLocomotion,holyFootprints,parryReel,staggerBow,CRITICAL_RETREAT} from "game/src/combat.js";
import {makeWorld} from "game/src/world.js";
import {Actor,Effects} from "game/src/actors.js";
import {HUD,equipmentInfo,handleLiveEquipmentInput} from "game/src/hud.js";
import {GLTFLoader} from "game/lib/addons/loaders/GLTFLoader.js";
import {EffectComposer} from "game/lib/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "game/lib/addons/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "game/lib/addons/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "game/lib/addons/postprocessing/OutputPass.js";
import {ShaderPass} from "game/lib/addons/postprocessing/ShaderPass.js";
import {FXAAShader} from "game/lib/addons/shaders/FXAAShader.js";
import {createCompanionMane} from "game/src/mane.js";
import {createGravityRock,updateGravityRock,createGravityHeave} from "game/src/gravity-rock.js";
import {createBladeScrape} from "game/src/gravity-scrape.js";
import {createGravityVortex,updateGravityVortex} from "game/src/gravity-vortex.js";
import {dressGravityRock,updateRockDress,createScrapeDust,prepareRockBursts,spawnRockBurst,tickVolleyFx} from "game/src/gravity-volley.js";
import {EncounterAudio} from "game/src/audio.js";
import {createPlayerAura,createSealFlare} from "game/src/player-aura.js";
import {createHolyGathering,createRetreatWake,createRetreatMantle} from "game/src/holy-gathering.js";
import {RenderQuality,optimizeBloom,skipInactivePointLights,sortLiveMaterials,shareRigPalettes,cacheSceneTransforms} from "game/src/render-quality.js";
import {prepareCompanion} from "game/src/companion.js";
import {preparePortraitDetail} from "game/src/companion-fit.js";
import {InputTimeline} from "game/src/input-timeline.js";
import {installAtmosphere,gradeOutput} from "game/src/atmosphere.js";
import {FollowCamera} from "game/src/follow-camera.js";
import {lightPass} from "game/src/consort-lightspeed.js";
skipInactivePointLights(T.ShaderChunk);
installAtmosphere();
const checkpoint=new URLSearchParams(location.search).get('checkpoint')||'radahn-start';
const beats=window.__gameBeats=window.__gameBeats||[];const beat=(kind,text)=>beats.push({kind,text});beats.push({kind:'checkpoint',id:checkpoint});
const scene=new T.Scene();scene.matrixAutoUpdate=false;scene.fog=new T.FogExp2(0x92917a,.012);
const launchOptions=new URLSearchParams(location.search);
if(!launchOptions.has('quality'))launchOptions.set('quality',launchOptions.get('replay')==='reference'?'ultra':'play');
const ultra=launchOptions.get('quality')!=='auto';
const nativeQuality=launchOptions.get('quality')==='native';
let fixedResolution=nativeQuality||launchOptions.get('quality')==='ultra'||launchOptions.get('replay')==='reference';
function fixedPixelRatio(){
  if(!nativeQuality)return ultraPixelRatio();
  return Math.min(devicePixelRatio||1,3840/Math.max(innerWidth,innerHeight),2160/Math.min(innerWidth,innerHeight));
}
function ultraPixelRatio(){
  return Math.min(3840 / Math.max(innerWidth,innerHeight), 2160 / Math.min(innerWidth,innerHeight));
}
function playPixelRatio(){
  // Live rendering targets the display itself, within the 1080p replay budget.
  // Supersampling here increases every full-screen pass before the adaptive
  // controller has collected its first timing window.
  return Math.min(devicePixelRatio||1,1920/Math.max(innerWidth,innerHeight),1080/Math.min(innerWidth,innerHeight));
}
let shadowDeadline=0,shadowStage=null,liveRenderMs=16.7,updateTileBudget=null;
const renderQuality=new RenderQuality(fixedResolution?fixedPixelRatio():playPixelRatio(),.62);
if(!fixedResolution)renderQuality.ratio=Math.min(renderQuality.maximum,devicePixelRatio||1);
const renderer=new T.WebGLRenderer({canvas:document.querySelector('#game'),antialias:false,powerPreference:'high-performance'});renderer.setPixelRatio(renderQuality.ratio);renderer.setSize(innerWidth,innerHeight);renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
const contactTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(0,0,0,.5)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new T.CanvasTexture(c);})();const contacts=[1.5,3.3].map(s=>{const o=new T.Mesh(new T.PlaneGeometry(s,s),new T.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false}));o.rotation.x=-Math.PI/2;scene.add(o);return o;});
const fillDay=new T.Color(0xdedbd4),fillDusk=new T.Color(0xd4d6dc);
function updateContactShadow(shadow,height,radius){
  const distance=Math.max(0,height)/radius;
  const spread=1+.45*Math.min(distance,3);
  shadow.scale.set(spread,spread,1);
  shadow.material.opacity=1/(1+distance*(1.7+distance));
}
const fill=new T.DirectionalLight(fillDay,1.2);scene.add(fill);scene.add(fill.target);
const armorBounce=new T.SpotLight(0xfff0d8,0,10,.83,.78,2);
scene.add(armorBounce,armorBounce.target);
const lightCapacity=count=>Math.max(8,4*Math.ceil(count/4));
// Keep effects with different visibility states in the same compiled shader
// variant. Zero-intensity lights contribute no light and cast no shadows.
const lightPadding=Array.from({length:8},()=>{
  const light=new T.PointLight(0,0);light.visible=false;scene.add(light);return light;
});
// The encounter's real lights are loaded or pooled during material warmup.
const encounterPointLights=new Set();
const mutedDrawLights=[], activeDrawLights=[], lightProbePosition=new T.Vector3();
function padSceneLights(){
  let count=0;
  const compact=loaded&&!fixedResolution&&!recordedControls;
  activeDrawLights.length=0;
  for(const light of encounterPointLights){
    if(!light.layers.test(camera.layers))continue;
    let object=light;
    while(object&&object!==scene&&object.visible)object=object.parent;
    if(object!==scene||!scene.visible)continue;
    if(!compact){count++;continue;}
    if(light.intensity>0)activeDrawLights.push(light);
    else {mutedDrawLights.push(light);light.visible=false;}
  }
  if(compact){
    // Keep the live shader layout constant as spell and weapon lights turn on.
    // Rank only when more than four local sources are actually emitting.
    if(activeDrawLights.length>4){
      for(const light of activeDrawLights){
        light.getWorldPosition(lightProbePosition);
        const distance=Math.min(lightProbePosition.distanceToSquared(p.pos),
          lightProbePosition.distanceToSquared(b.pos),lightProbePosition.distanceToSquared(camera.position));
        light.userData.encounterPower=light.intensity*(.2126*light.color.r+.7152*light.color.g+.0722*light.color.b)/(1+distance);
      }
      activeDrawLights.sort((a,b)=>b.userData.encounterPower-a.userData.encounterPower);
      for(let i=4;i<activeDrawLights.length;i++){const light=activeDrawLights[i];mutedDrawLights.push(light);light.visible=false;}
    }
    count=Math.min(4,activeDrawLights.length);
  }
  const needed=(compact?4:lightCapacity(count))-count;
  for(let i=0;i<lightPadding.length;i++)lightPadding[i].visible=i<needed;
}
const camera=new T.PerspectiveCamera(52,innerWidth/innerHeight,.08,500);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=optimizeBloom(new UnrealBloomPass(new T.Vector2(innerWidth,innerHeight),.14,.34,1.23));composer.addPass(bloom);const gradePass=gradeOutput(new OutputPass(),bloom);gradePass.uniforms.aspect.value=innerWidth/innerHeight;composer.addPass(gradePass);const antialias=new ShaderPass({...FXAAShader,fragmentShader:FXAAShader.fragmentShader.replace('float _SubpixelBlending = 1.0;', 'float _SubpixelBlending = 0.35;')});antialias.uniforms.resolution.value.set(1/(innerWidth*renderer.getPixelRatio()),1/(innerHeight*renderer.getPixelRatio()));composer.addPass(antialias);
const world=makeWorld(scene,renderer,{ultra,fullShadows:fixedResolution}),hud=new HUD(),fx=new Effects(scene);
const backgroundSplats=addBackgroundSplats(scene,renderer,undefined,ultra,launchOptions.get('replay')!=='reference');
// Opaque masonry and trunk sections keep identical visible triangles at every live quality.
if (!fixedResolution || (launchOptions.get('replay')!=='reference' && launchOptions.get('controls')!=='recording')) partitionArenaSurfaces(scene,renderer,()=>fixedResolution);
const playerAura=createPlayerAura(fx.cloudTexture);scene.add(playerAura);playerAura.visible=false;
const sealFlare=createSealFlare(fx.cloudTexture);scene.add(sealFlare);sealFlare.visible=false;
const gravityVortex=createGravityVortex();scene.add(gravityVortex);
const player=new Actor(scene,'ivory_duelist',1.95,ultra),boss=new Actor(scene,'gilded_warlord',4.4,ultra);
player.liveCloth = !fixedResolution && launchOptions.get('controls') !== 'recording';
player.masterTextures=['ultra','play','native'].includes(launchOptions.get('quality'));
const flameGeometry=new T.BufferGeometry();flameGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(96*3),3));const flameAura=new T.Points(flameGeometry,new T.PointsMaterial({color:0xff2412,size:.27,map:fx.cloudTexture,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false}));scene.add(flameAura);const flameWisps=Array.from({length:4},()=>{const o=new T.Sprite(new T.SpriteMaterial({map:fx.cloudTexture,color:0xff1b08,transparent:true,opacity:.7,blending:T.AdditiveBlending,depthWrite:false}));scene.add(o);return o;});
const grabGlows=['Left','Right'].map((side,i)=>{const o=createHolyGathering(fx.cloudTexture,i*2.4,true);scene.add(o);return {side,o};});
const retreatMantle=createRetreatMantle();scene.add(retreatMantle);
const retreatGather=createHolyGathering(fx.cloudTexture,.7),retreatWake=createRetreatWake();
scene.add(retreatGather,retreatWake);
const state={time:0,stage:'mist',stageTime:0,phase:1,hp:680,maxHp:680,fp:100,stamina:100,bossHp:46000,bossMax:46000,marked:false,life:1,deaths:0,flasks:7,weapon:0,item:0,skill:'Parry',menu:false,menuPage:false,menuDepth:0,menuSelection:0,equipSlot:0,talismans:['Two Fingers Heirloom',"Marika's Soreseal"],locked:false,bossVisible:false,prompt:'Loading arena and characters...',fade:0,banner:'',reward:false,rewardAcknowledged:false,runes:1440000,pendingRunes:0,runeRewardValue:0,runeRewardAt:null,victory:false,help:false,bleed:0,bloodflame:0,lastDamage:0,damageTime:0};
const p={pos:new T.Vector3(0,0,2.0),yaw:0,action:'idle',elapsed:0,duration:0,attackDone:false,attackCount:0,rollDir:new T.Vector3(),invuln:0,hitCooldown:0,buffer:null,flight:null,pendingWeapon:null,velocity:new T.Vector3(),recoil:new T.Vector3()};
const gateSpawn=new T.Vector3(0,world.arena.landing,world.arena.stairTop-.5);
const b={pos:gateSpawn.clone(),yaw:Math.PI,action:'wait',lastAttack:null,elapsed:0,duration:2,move:0,meteorFollowup:0,hitIndex:0,parries:0,stagger:0,frost:0,frostProcs:0,frostUntil:0,lastMeteor:-Infinity,lastGrab:-Infinity,lastNova:-Infinity,lightPasses:0,grabMissAt:-Infinity,grabMissChained:false,target:new T.Vector3(),from:new T.Vector3()};
Object.assign(state,{grip:null,leftEquipped:true,physick:1,arenaMap:false,pouchHeld:false});
const initialState={...state};const hazards=[],projectiles=[];const deathHistory=[];const keys=new Set();let cameraSnap=false;const PHASE_CINEMATIC_LEAD=1.9;let cameraYaw=0,cameraPitch=.1,eDown=-1,last=performance.now(),lastRender=last,renderNext=last,renderedFrames=0,lastRenderedAt=0,loaded=false;
const cameraFocus=new T.Vector3(0,1.43,0),framingCamera=new T.PerspectiveCamera(52,innerWidth/innerHeight,.08,500);
const framingPoint=new T.Vector3(),crownWorldBounds=new T.Box3(),lockPoint=new T.Vector3(),shotAim=new T.Vector3(),bladeMid=new T.Vector3(),viewRig=new FollowCamera(camera);
const inputTimeline=new InputTimeline(last);
const liveAxes={x:0,z:0,lookX:0,lookY:0};
const dodgeTapHeading=new T.Vector3();
let lastDodgeDirectionRelease=-Infinity;
let lastManualLook=-Infinity;
const downList=new Set(['Layout','Map','TwoHandRight','TwoHandLeft','PouchHeld','PouchUp','PouchDown','PouchLeft','PouchRight','MenuTabPrev','MenuTabNext','MenuPageUp','MenuPageDown','MenuDetail','MenuRemove','Graphics','Walk','Interact','TwoHand','MenuBack','KeyW','KeyA','KeyS','KeyD','KeyI','KeyJ','KeyK','KeyL','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyQ','KeyR','KeyZ','KeyX','KeyC','KeyV','KeyF','KeyG','Enter','Backspace','KeyH','KeyM']);
const lerpAngle=(a,b,f)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;
const distance=()=>Math.hypot(p.pos.x-b.pos.x,p.pos.z-b.pos.z);
const facing=(from,to)=>Math.atan2(from.x-to.x,from.z-to.z);
function clearFlight(reason){const active=!!p.flight;p.flight=null;p.pos.y=0;if(active)combatEvent('flight-cleared',reason);}
function transition(stage){
 if(stage==='combat'&&!fixedResolution&&!recordedControls){
   const entryRatio=Math.max(renderQuality.minimum,(state.phase===2?.76:.90)*Math.min(devicePixelRatio||1,renderQuality.maximum));
   if(renderQuality.ratio>entryRatio){renderQuality.ratio=entryRatio;drawingResizePending=true;}
 }
 if(!recordedControls){p.buffer=null;p.parryFollowUntil=-Infinity;p.rollLinkUntil=-Infinity;eDown=-1;state.arenaMap=false;}
 if(['phase','dying','dead'].includes(stage)){
   const finishStrike=stage==='dying'&&(['light','heavy'].includes(p.action)&&p.attackDone||p.action==='critical');
   b.grabMissAt=-Infinity;b.postCritical=false;p.pendingWeapon=null;p.riposte=null;clearFlight(stage);
   hazards.length=0;projectiles.length=0;state.grabbed=false;p.buffer=null;b.pos.y=0;
   if(stage!=='dying')fx.clear();
   // A lethal hit still has a withdrawal. Finish the current animation once
   // while the hit spark and ash continue, then accept normal movement.
   if(!finishStrike){p.action='idle';p.elapsed=0;}
 }
 state.stage=stage;state.stageTime=0;state.fade=0;
}
function defeat(reason){if(state.stage==='dead'||state.stage==='loading')return;playSound('death');state.hp=0;state.deaths++;combatEvent('defeat',reason);deathHistory.push({time:state.time,life:state.life,reason});transition('dead');state.menu=false;state.locked=false;state.banner='';state.prompt='';state.flameUntil=0;state.deathDust=false;eDown=-1;beat('prompt','YOU DIED');}
function respawn(){
 const time=state.time,life=state.life+1,deaths=state.deaths;Object.assign(state,initialState,{time,life,deaths,stage:'return',stageTime:0,locationTitle:4,flameUntil:0,grabbed:false,escape:0,phaseSkipAt:null,entrySkip:false,entrySkipAt:null,pendingLock:false,crouched:false,twoHanded:false,spell:0});
 p.riposte=null;p.guardCounterUntil=-Infinity;p.guardCounter=false;p.runningThrust=false;p.rollingThrust=false;p.rollLinkUntil=-Infinity;p.lightChain=0;p.lightContinued=false;p.lastLightStarted=-Infinity;p.lastLightDuration=0;p.pos.set(0,world.entranceHeight(19),19);p.yaw=0;p.velocity.set(0,0,0);p.recoil.set(0,0,0);cameraFocus.copy(p.pos).add(new T.Vector3(0,1.45,0));Object.assign(p,{action:'idle',elapsed:0,duration:0,attackDone:false,attackCount:0,invuln:0,hitCooldown:0,buffer:null,flight:null,pendingWeapon:null,staminaDelay:0,sprintExhausted:false});
 b.pos.copy(gateSpawn);b.yaw=Math.PI;Object.assign(b,{action:'wait',lastAttack:null,postCritical:false,openingImpactAt:-Infinity,elapsed:0,duration:.8,move:0,meteorFollowup:0,hitIndex:0,parries:0,stagger:0,critical:false,frost:0,frostProcs:0,frostUntil:0,lastMeteor:-Infinity,lastGrab:-Infinity,lastNova:-Infinity,lightPasses:0,grabMissAt:-Infinity,grabMissChained:false,speed:0});
 b.target.set(0,0,0);b.from.copy(b.pos);keys.clear();eDown=-1;hazards.length=0;projectiles.length=0;fx.clear();cameraYaw=0;cameraPitch=.1;viewRig.reset();world.mist.visible=true;camera.position.set(0,p.pos.y+2.3,23);combatEvent('respawn','new-life');beat('objective','Enir-Ilim');
}
const encounterAudio=new EncounterAudio();
function playSound(type,strength=1){encounterAudio.play(type,strength);}
function prepareAudio(){try{encounterAudio.prepare();}catch{}}
function unlockAudio(){encounterAudio.unlock();}
const combatEvents=[];function combatEvent(kind,reason,details={}){combatEvents.push({time:state.time,kind,reason,hp:state.hp,bossHp:state.bossHp,action:p.action,bossAction:b.action,distance:distance(),playerYaw:p.yaw,bossYaw:b.yaw,bossHeight:b.pos.y,playerHeight:p.pos.y,airborne:!!p.flight,...details});if(combatEvents.length>1200)combatEvents.shift();}
function airborne(){return !!p.flight&&p.pos.y>.25;}
function action(name,duration,cost=0){if(!['mist','return','combat','victory'].includes(state.stage))return false;if(name==='jump'&&p.flight)return false;
if(!recordedControls && p.action==='jump' && p.flight?.windup && p.flight.elapsed<p.flight.windup && (name==='light'||name==='heavy')){
  if(state.stamina>=cost)p.buffer={name,onTakeoff:true,until:state.time+p.flight.windup-p.flight.elapsed+.10};
  return false;
}
const airAttack=p.action==='jump'&&p.flight&&['light','heavy'].includes(name);if(!airAttack&&p.action!=='idle'&&p.action!=='walk'&&p.action!=='run'){if(!recordedControls){if(['light','heavy','parry','jump','drink','cast'].includes(name))queueRecovery(p,name,state.time);}
else if(['light','heavy'].includes(name))p.buffer={name,until:state.time+Math.min(.75,Math.max(0,p.duration-p.elapsed)+.12)};else if(name==='parry'&&p.duration&&p.elapsed/p.duration>.5)p.buffer={name,until:state.time+.28};return false;}if(state.stamina<cost)return false;if(name==='jump'){
  // The live jump keeps the 550 ms flight arc and leaves a short planted recovery.
  const windup=recordedControls ? .30 : .16;
  const flightDuration=recordedControls ? .85 : .71;
  if(!recordedControls)duration=.80;
  p.flight={elapsed:0,duration:flightDuration,windup,velocity:moveVector().multiplyScalar(p.action==='run'?5.6:3.15)};
}
if(!recordedControls&&(name==='light'||name==='heavy')){p.chargeSeconds=0;p.useDagger=state.grip==='left';p.guardCounter=name==='heavy'&&state.time<=(p.guardCounterUntil??-Infinity);p.guardCounterUntil=-Infinity;}
p.airStrike=!!airAttack;p.runningThrust=name==='light'&&p.action==='run'&&!p.flight;if(p.runningThrust)duration=RUNNING_THRUST.duration;
// A light attack buffered during a dodge starts as the player unfolds
// from the roll. Only the very next accepted action can inherit that pose.
p.rollingThrust=name==='light'&&!p.flight&&state.time<=(p.rollLinkUntil??-Infinity);
p.rollLinkUntil=name==='roll'?state.time+duration+.16:-Infinity;
// Cosmetic chain selection follows accepted actions, never the replay clock.
if(name==='light'){p.lightContinued=!p.runningThrust&&state.time-(p.lastLightStarted??-Infinity)<=(p.lastLightDuration||0)+.03;p.lightChain=!p.runningThrust&&state.time-(p.lastLightStarted??-Infinity)<(p.lastLightDuration||0)+.18?(p.lightChain||0)%2+1:1;p.lastLightStarted=state.time;p.lastLightDuration=duration;}else{p.lastLightStarted=-Infinity;}
p.counterThrust=name==='light'&&state.time<=(p.parryFollowUntil??-Infinity);
p.parryFollowUntil=-Infinity;
if(recordedControls&&name==='parry')p.parryFollowUntil=state.time+.98;
state.stamina-=cost;p.staminaDelay=cost?.45:0;p.action=name;p.elapsed=0;p.duration=duration;p.attackDone=false;if(name==='drink')playSound('drink');if(name==='light'||name==='heavy'){
 p.attackCount++;p.thrustSoundPlayed=false;p.thrustCommitted=false;
 const aim=moveVector();
 const heading=state.locked?facing(p.pos,b.pos):aim.lengthSq()?Math.atan2(-aim.x,-aim.z):p.yaw;
 if(!recordedControls&&name==='light')p.thrustHeading=heading;
 else p.yaw=heading;
 p.strikeApproach=p.runningThrust ? Math.max(0,-p.velocity.x*Math.sin(heading)-p.velocity.z*Math.cos(heading)) : 0;
}return true;}
function turnThrust(current,target,maxTurn){
 const difference=Math.atan2(Math.sin(target-current),Math.cos(target-current));
 return current+T.MathUtils.clamp(difference,-maxTurn,maxTurn);
}
function moveVector(){
 const x=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const z=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));
 const v=new T.Vector3(x||z?x:liveAxes.x,0,x||z?z:liveAxes.z);
 if(v.lengthSq()>1)v.normalize();
 return v.applyAxisAngle(verticalAxis,cameraYaw);
}
const verticalAxis=new T.Vector3(0,1,0);
function dodge(direction){
 if(state.stage!=='combat'&&state.stage!=='victory'&&(recordedControls||!['mist','return'].includes(state.stage)))return;
 const chosen=direction?direction.clone():moveVector();
 const backstep=!recordedControls&&!chosen.lengthSq();
 if(!chosen.lengthSq())chosen.set(Math.sin(p.yaw),0,Math.cos(p.yaw));
 else if(!recordedControls)chosen.normalize();
 if(!['idle','walk','run'].includes(p.action)){
   combatEvent('dodge-busy','action-recovery',{elapsed:p.elapsed,duration:p.duration});
   if(!recordedControls){if((!p.flight||p.flight.windup)&&!state.grabbed)queueRecovery(p,'roll',state.time,backstep?new T.Vector3():chosen);}
   else if(p.duration&&p.elapsed/p.duration>.5&&!p.flight&&!state.grabbed)p.buffer={name:'roll',direction:backstep?new T.Vector3():chosen,until:state.time+.36};
   return;
 }
 if(backstep){
   if(action('backstep',.44,12)){p.rollDir.copy(chosen);combatEvent('dodge','backstep');playSound('dodge');}
   return;
 }
 if(action('roll',.68,17)){p.rollSide=0;p.rollDir.copy(chosen);
   const travelYaw=Math.atan2(-chosen.x,-chosen.z);
   p.rollFacing=state.locked?lerpAngle(p.yaw,travelYaw,.24):travelYaw;
   p.invuln=.58;combatEvent('dodge','tap');playSound('dodge');}
}
function castFlame(){
 if(state.weapon===1&&(recordedControls||p.pendingWeapon!==0)&&state.fp>=20&&action('cast',2.85,15))state.fp-=20;
}
function refreshSkill(){
 state.skill=state.leftEquipped&&state.grip!=='right'?'Parry':state.weapon===1?'No Skill':'Unspecified skill';
}
function selectGrip(hand){
 if(hand==='left'&&!state.leftEquipped)return;
 state.grip=state.grip===hand?null:hand;
 state.twoHanded=!!state.grip;
 refreshSkill();
}
function useFlask(item){
 if((item===0?state.flasks:state.physick)<=0)return;
 if(action('drink',1.4,0))p.drinkItem=item;
 else if(p.buffer?.name==='drink')p.buffer.item=item;
}
function consumeBuffered(next){
 if(state.time>next.until)return;
 if(next.name==='roll'){dodge(next.direction);return;}
 if(!recordedControls&&next.name==='drink'){useFlask(next.item??state.item);return;}
 if(next.name==='drink'&&state.flasks<=0)return;
 if(next.name==='cast'){castFlame();return;}
 if(!recordedControls&&next.name==='light'&&state.weapon!==0&&state.grip!=='left')return;
 if(!recordedControls&&next.name==='parry'&&state.skill!=='Parry')return;
 const timing={light:[.72,11],heavy:[1.2,24],parry:[.73,12],jump:[.85,12],drink:[1.4,0]}[next.name];
 if(timing)action(next.name,...timing);
}

function inputDown(code){if(!downList.has(code)||keys.has(code)||(!loaded&&code!=='KeyH'))return;keys.add(code);
 if(!recordedControls){
   if(code==='Layout'){if(state.help){state.currentLayout=!state.currentLayout;try{localStorage.setItem('radahn-pc-layout',state.currentLayout?'current':'classic');}catch{}}return;}
   if(code==='PouchHeld'){state.pouchHeld=!state.menu&&!state.help&&!state.arenaMap;return;}
   if(code==='Map'&&!state.help&&!state.menu){
     if(state.arenaMap||['mist','return','victory'].includes(state.stage)){state.arenaMap=!state.arenaMap;state.mapPlayer={x:p.pos.x,z:p.pos.z};p.buffer=null;eDown=-1;}
     return;
   }
   if(state.arenaMap){if(code==='Enter'||code==='MenuBack')state.arenaMap=false;return;}
 }
 if(code==='Graphics'&&!recordedControls){
   fixedResolution=!fixedResolution;
   goldenHair?.userData.setFullDetail(fixedResolution);
   boss.liveCape=!fixedResolution;
   player.liveCloth=!fixedResolution;
   world.setShadowQuality(fixedResolution);
   renderQuality.setMaximum(fixedResolution?fixedPixelRatio():playPixelRatio());
   renderQuality.ratio=fixedResolution?renderQuality.maximum:Math.min(devicePixelRatio||1,renderQuality.maximum);
   state.graphicsMode=fixedResolution?(nativeQuality?'Native':'Ultra'):'Adaptive';drawingResizePending=true;return;
 }if(code==='KeyH'){state.help=!state.help;if(!recordedControls){p.buffer=null;eDown=-1;}return;}if(code==='KeyM'){state.muted=encounterAudio.toggle();return;}if(!recordedControls&&code==='Enter'&&state.help){state.help=false;return;}
 if(state.grabbed)return;
 if(['dead','loading'].includes(state.stage))return;
 if(state.stage==='dying'&&['KeyI','KeyJ','KeyK','KeyL'].includes(code))b.defeatViewReleased=true;
 if(code==='Enter'&&state.help){state.help=false;return;}
 if(!recordedControls&&state.help){keys.delete(code);return;}
 if(!recordedControls&&state.menu&&handleLiveEquipmentInput(state,code))return;
 if(code==='MenuBack'){if(state.menuDepth>0){state.menuDepth--;state.menuPage=state.menuDepth===2;}else state.menu=false;return;}
 if(code==='Enter'){if(state.stage==='phase'){state.phaseSkipAt??=state.stageTime+1.3;return;}if(state.stage==='entry'&&(state.stageTime>3||!recordedControls)){
   state.entrySkipAt??=recordedControls?state.stageTime+2.2:state.stageTime+.3;
   return;
 }state.menu=!state.menu;if(!recordedControls){p.buffer=null;eDown=-1;state.menuSelection=0;}state.menuPage=false;state.menuDepth=0;return;}
 if(code==='Backspace'){state.menu=false;state.help=false;return;}
 if(state.menu){if(code==='Space'){if(state.menuDepth<2){state.menuDepth++;state.menuPage=state.menuDepth===2;if(state.menuPage)state.menuSelection=0;}else{const item=equipmentInfo(state);if(item?.effect)state.talismans[state.equipSlot]=item.name;}}if(code==='KeyE'){if(state.menuPage)state.menuPage=false;else state.menu=false;}if(code==='ArrowDown')state.menuSelection=(state.menuSelection+5)%25;if(code==='ArrowUp')state.menuSelection=(state.menuSelection+20)%25;if(code==='ArrowLeft')state.menuSelection=(state.menuSelection+24)%25;if(code==='ArrowRight')state.menuSelection=(state.menuSelection+1)%25;if(code==='KeyX'&&state.menuDepth===2)state.equipSlot=(state.equipSlot+1)%2;return;}
 if(!recordedControls){
   if(code==='TwoHandLeft'||code==='TwoHandRight'){selectGrip(code==='TwoHandLeft'?'left':'right');return;}
   if(code.startsWith('Pouch')){
     if(code==='PouchUp')useFlask(0);
     if(code==='PouchDown')useFlask(1);
     return;
   }
   if(code==='ArrowLeft'){state.leftEquipped=!state.leftEquipped;if(!state.leftEquipped&&state.grip==='left'){state.grip=null;state.twoHanded=false;}refreshSkill();return;}
   if(code==='ArrowUp')return; // One attuned incantation.
   if(code==='ArrowDown')p.itemCycleStart=state.time;
   if(code==='KeyC'){if(state.skill==='Parry')action('parry',.73,12);return;}
   if(code==='KeyQ'){useFlask(state.item);return;}
 }
 if(code==='TwoHand'){state.twoHanded=!state.twoHanded;return;}
 if(code==='KeyR'||code==='Interact'){if(['mist','return'].includes(state.stage)&&p.pos.distanceTo(new T.Vector3(0,0,2))<3){transition('entry');state.prompt='';beat('interaction','Traverse the mist');}else if(state.reward){if(!state.rewardAcknowledged){state.rewardAcknowledged=true;beat('interaction','Remembrance of a God and a Lord');}}else if(code==='KeyR')state.twoHanded=!state.twoHanded;}
 if(code==='KeyG'){
   if(state.stage==='combat'&&state.bossVisible&&!bossHidden()){
     if(state.locked)releaseCameraLock();
     else {state.locked=true;cameraPitch=.1;}
   }else if(state.stage==='entry')state.pendingLock=true;
   else if(!recordedControls){cameraYaw=p.yaw;cameraPitch=.1;}
 }
 if(code==='ArrowRight'){if(p.action==='cast')p.pendingWeapon=1-(p.pendingWeapon??state.weapon);else {state.weapon=1-state.weapon;if(!recordedControls)refreshSkill();}}if(code==='ArrowLeft')state.skill=state.skill==='Parry'?'Golden Parry':'Parry';if(code==='ArrowDown')state.item=1-state.item;if(code==='ArrowUp')state.spell=(state.spell||0)+1;
 if(code==='KeyF')state.crouched=!state.crouched;
 if(code==='KeyE'){
   eDown=state.time;p.sprintExhausted=false;
   if(!recordedControls){dodgeTapHeading.set(0,0,0);lastDodgeDirectionRelease=-Infinity;}
 }
 if(code==='KeyX'){if(state.weapon===1&&(recordedControls||state.grip!=='left'))castFlame();else action('light',.72,11);}if(code==='KeyV')action('heavy',1.2,24);if(code==='KeyC')action('parry',.73,12);if(code==='Space')action('jump',.85,12);
 if(code==='KeyQ'&&state.flasks>0)action('drink',1.4,0);
}
function rememberDodgeHeading(releasing=false){
 if(recordedControls||eDown<0)return;
 if(releasing&&lastDodgeDirectionRelease===state.time)return;
 const direction=moveVector();
 if(direction.lengthSq()){
   dodgeTapHeading.copy(direction);
   if(releasing)lastDodgeDirectionRelease=state.time;
 }
}
function inputUp(code){
 if(code==='PouchHeld')state.pouchHeld=false;
 if(code==='ArrowDown')p.itemCycleStart=null;
 // A stick can spring to centre in the same sample as B comes up. Preserve
 // the last direction during this tap, including keyboard releases between ticks.
 if(code==='KeyW'||code==='KeyA'||code==='KeyS'||code==='KeyD')rememberDodgeHeading(true);
 keys.delete(code);
 if(code!=='KeyE'||eDown<0)return;
 p.lastEHold=state.time-eDown;
 const tap=p.lastEHold<SPRINT_HOLD;
 combatEvent('dodge-release',tap?'tap':'sprint',{heldSeconds:p.lastEHold});
 if(tap&&!state.menu){
   if(recordedControls)dodge();
   else{
     rememberDodgeHeading();
     dodge(dodgeTapHeading);
   }
 }
 eDown=-1;p.sprintExhausted=false;
}
let referenceShots=[],referenceSeconds=null;
let referenceBossHead;
const comparisonMode=new URLSearchParams(location.search).get('replay')==='reference';
function queueInput(type,e){
 if(comparisonMode||!downList.has(e.code))return;
 e.preventDefault();if(type==='down'&&e.repeat)return;
 if(type==='down')unlockAudio();
 if(!loaded){if(e.code==='KeyH')(type==='down'?inputDown:inputUp)(e.code);return;}
 inputTimeline.enqueue(type,e.code,e.timeStamp,performance.now(),performance.timeOrigin);
}
const recordedControls=comparisonMode||new URLSearchParams(location.search).get('controls')==='recording';
fx.liveUpdates=!recordedControls;
boss.liveCape=!recordedControls&&!fixedResolution;
state.inputDevice=recordedControls?'recording':'keyboard';
if(!recordedControls){try{state.currentLayout=localStorage.getItem('radahn-pc-layout')==='current';}catch{state.currentLayout=false;}}
state.graphicsMode=fixedResolution?(nativeQuality?'Native':'Ultra'):'Adaptive';
function mistPrompt(){
 if(recordedControls)return 'R: Traverse the mist';
 return controlLabel(state.inputDevice,'E: Traverse the mist   |   H: Controls','Y: Traverse the mist   |   View: Map','Triangle: Traverse the mist   |   Touchpad: Map');
}
function turnView(dx,dy){
 if(state.locked||state.menu||state.help||state.arenaMap||state.stage==='phase'||state.stage==='entry')return;
 cameraYaw-=dx;
 cameraPitch=T.MathUtils.clamp(cameraPitch-dy,-.65,.9);
 lastManualLook=state.time;
 if(state.stage==='dying')b.defeatViewReleased=true;
}
function releaseCameraLock(){
 if(!state.locked)return;
 state.locked=false;
 if(!recordedControls)cameraYaw=viewRig.releaseLock(cameraPitch);
}
function applyInput(event){
 const {type,code}=event;
 if(type==='slot'){if(state.menu&&(recordedControls||!state.menuPage||code<4))state.menuSelection=code;return;}
 if(type==='look'){turnView(code[0]*.0024,code[1]*.0020);return;}
 if(type==='axes'){
   if(!code[0]&&!code[1]&&(liveAxes.x||liveAxes.z))rememberDodgeHeading(true);
   else if(code[0]!==liveAxes.x||code[1]!==liveAxes.z)lastDodgeDirectionRelease=-Infinity;
   [liveAxes.x,liveAxes.z,liveAxes.lookX,liveAxes.lookY]=code;return;
 }
 if(type==='cancel'){keys.delete(code);if(code==='PouchHeld')state.pouchHeld=false;if(code==='KeyE'){eDown=-1;p.sprintExhausted=false;}return;}
 if(type==='clear'){
   keys.clear();eDown=-1;p.sprintExhausted=false;state.pouchHeld=false;if(!recordedControls)p.buffer=null;
   liveAxes.x=liveAxes.z=liveAxes.lookX=liveAxes.lookY=0;
   return;
 }
 if(type==='down'&&(code==='KeyW'||code==='KeyA'||code==='KeyS'||code==='KeyD'))lastDodgeDirectionRelease=-Infinity;
 (type==='down'?inputDown:inputUp)(code);
}
let pollControls=null;
if(!recordedControls){
 pollControls=attachLiveControls(renderer.domElement,state,(type,code,stamp)=>{
   if(loaded)inputTimeline.enqueue(type,code,stamp,performance.now(),performance.timeOrigin);
 },unlockAudio);
 document.addEventListener('visibilitychange',()=>{
   const now=performance.now();
   applyInput({type:'clear'});
   inputTimeline.reset(now);
   lastRender=now;renderNext=0;liveSampleStart=0;liveDrawHz=null;
   renderQuality.reset();
 });
}else if(!comparisonMode){
 addEventListener('keydown',e=>queueInput('down',e));
 addEventListener('keyup',e=>queueInput('up',e));
 addEventListener('blur',()=>inputTimeline.enqueue('clear',null,performance.now(),performance.now()));
}
beat('prompt','Traverse the mist');
function bossImpactPosition(){
 // The selected 29.75-30.75 s and 98.75-100.75 s clouds spread in front
 // of the chest/abdomen. A fixed point on the actor axis hides them inside
 // the mesh and stays at the wrong height when the boss crouches.
 if(boss.impactPoint)return boss.impactPoint(p.pos);
 const point=b.pos.clone().add(new T.Vector3(0,2.65,0));
 const chest=boss.capeMount?.chest;
 if(chest){chest.getWorldPosition(point);point.y-=.45;}
 const outward=p.pos.clone().sub(b.pos);outward.y=0;
 if(outward.lengthSq()>1e-6)point.addScaledVector(outward.normalize(),.65);
 return point;
}
function bossDamagePacket(base,buildup,impact){
 // Retain the existing estimated totals. This stage corrects contact timing;
 // it does not claim to recover the source build's complete damage formula.
 let weapon=base,status=0;
 if(state.time<b.frostUntil)weapon=Math.round(weapon*1.2);
 else{
  b.frost+=buildup;const threshold=[734,1024,1481][Math.min(2,b.frostProcs)];
  if(b.frost>=threshold){status=Math.round(state.bossMax*.07+30);b.frost=0;b.frostProcs++;b.frostUntil=state.time+30;fx.burst(impact,'ice',64);combatEvent('frost','buildup');}
 }
 const boost=state.flameUntil>state.time?1.15:1,total=Math.round((weapon+status)*boost);
 weapon=Math.round(weapon*boost);return {weapon,status:total-weapon,total};
}
function applyBossDamage(damage,impact,kind='sword'){
 if(state.stage!=='combat')return;
 state.bossHp=Math.max(0,state.bossHp-damage);
 // Primary 10.75/11.75 and all three ripostes retain the previous damage text
 // while successive contacts land. The readout resets after a quiet interval.
 state.lastDamage=state.lastDamage&&state.time-state.damageTime<2.1?state.lastDamage+damage:damage;
 state.damageTime=state.time;fx.burst(impact,'ice',12);playSound('hit');
 if(kind!=='sword'){
  const release=kind==='riposte-release';
  fx.burst(impact,'blood',release?48:22);
  fx.riposteSpray(impact,p.yaw,release,world.groundHeight);
 }
 if(state.bossHp<=0){
   b.defeatAshPulse=-1;b.defeatViewReleased=['KeyI','KeyJ','KeyK','KeyL'].some(key=>keys.has(key));
   b.defeatViewAxis=p.pos.clone().sub(b.pos).setY(0);
   if(b.defeatViewAxis.lengthSq()<.01)b.defeatViewAxis.set(Math.sin(cameraYaw),0,Math.cos(cameraYaw));
   b.defeatViewAxis.normalize();
   transition('dying');fx.burst(b.pos.clone().add(new T.Vector3(0,2,0)),'gold',70);state.locked=false;beat('interaction','Radahn, Consort of Miquella defeated');
 }
 else if(state.phase===1&&b.phasePending==null&&b.phaseFade==null&&entersSecondPhase(state.bossHp,state.bossMax)){b.phasePending=state.time;combatEvent('phase-pending','threshold');}
}
// Primary 50.7-53.5 s: after the blow that opens the second phase the consort
// still finishes the exchange he is in (a parried cut, his recoil and one more
// thrust), and only then does the picture fade to black for the cutscene.
// Further sword hits in that interval register without changing his health.
const PHASE_PENDING_LIMIT=2.6,PHASE_FADE_OUT=.45,PHASE_REVEAL=.44;
function closePhaseExchange(settled){
 if(b.phaseFade!=null||state.stage!=='combat')return;
 b.phasePending=null;b.phaseFade=state.time;p.invuln=Math.max(p.invuln,PHASE_FADE_OUT+.2);
 if(settled){b.action='wait';b.elapsed=0;b.duration=99;}
 combatEvent('phase-fade',settled?'exchange-finished':'limit');
}
function enterPhaseCinematic(){b.phaseFade=null;b.phasePending=null;transition('phase');state.menu=false;state.locked=false;beat('interaction','Second phase');}
function advanceRiposte(){
 const attack=p.riposte;
 if(!attack||p.action!=='critical'||b.action!=='critical'||state.stage!=='combat')return;
 const contacts=[RIPOSTE_SEQUENCE.entry,RIPOSTE_SEQUENCE.release];
 while(p.riposte===attack&&attack.next<contacts.length&&p.elapsed>=contacts[attack.next]){
  const impact=bossImpactPosition(),index=attack.next++;
  if(index===0){
   const chest=boss.capeMount?.chest;
   if(chest)attack.pin=chest.worldToLocal(impact.clone());
   const packet=bossDamagePacket(2150,125,impact);
   const entryWeapon=Math.round(packet.weapon*RIPOSTE_SEQUENCE.entryShare);
   attack.amounts=[entryWeapon+packet.status,packet.weapon-entryWeapon];
  }
  const damage=attack.amounts[index],reason=index===0?'entry':'release',bossHpBefore=state.bossHp,contactElapsed=p.elapsed;
  applyBossDamage(damage,impact,'riposte-'+reason);
  combatEvent('critical-hit',reason,{damage,bossHpBefore,bossHpAfter:state.bossHp,contactElapsed});
 }
}
// A broken stance bows the head and chest toward the attacker; a blade meets that body, not the planted feet.
function strikeDistance(){
 const bow=b.action==='critical'?staggerBow(9):b.stagger>0&&b.critical&&b.action==='recover'?staggerBow(b.elapsed):0;
 return bow?Math.min(distance(),Math.hypot(p.pos.x-b.pos.x+Math.sin(b.yaw)*bow,p.pos.z-b.pos.z+Math.cos(b.yaw)*bow)):distance();
}
function strikeMissReason(extension){
 // At maximum extension the sweeping blade has a small contact margin. Once
 // the wrist stops moving a grazing target must touch the narrower held point.
 const reach=(!recordedControls&&p.useDagger?2.60:3.70)-.10*T.MathUtils.smoothstep(extension,.12,.95);
 if(strikeDistance()>reach)return 'reach';
 if(bossHidden())return 'light-step';
 if(b.pos.y>p.pos.y+1.8||b.action==='meteor'&&b.elapsed>=METEOR_SEQUENCE.takeoff&&b.elapsed<METEOR_SEQUENCE.contact||b.action==='dash'&&b.elapsed>1&&b.elapsed<2)return 'height';
 if(!faces(p.pos,p.yaw,b.pos,p.action==='heavy'?1.22:1.05,.75))return 'facing';
 return null;
}
function damageBoss(){
 if(b.phasePending!=null||b.phaseFade!=null){combatEvent('player-hit','phase-pending');fx.burst(bossImpactPosition(),'ice',12);playSound('hit');return;}
 if(b.stagger>0&&b.critical&&state.time>=b.criticalReadyAt&&p.action==='light'&&strikeDistance()<2.6&&faces(b.pos,b.yaw,p.pos,.9)){
  releaseCameraLock();b.critical=false;b.stagger=0;b.action='critical';b.elapsed=0;b.duration=4.7;b.criticalOrigin=b.pos.clone();b.criticalYaw=b.yaw;
  p.action='critical';p.elapsed=0;p.duration=RIPOSTE_SEQUENCE.duration;p.invuln=p.duration;p.riposte={next:0,amounts:null};
  combatEvent('critical','third-parry');return;
 }
 const heavy=p.action==='heavy';
 const charge=!recordedControls&&heavy?(p.chargeSeconds||0)/.65:0;
 const scale=(!recordedControls && p.useDagger ? .58 : 1)*(p.guardCounter?1.3:1)*(1+.35*charge);
 combatEvent('player-hit',!recordedControls&&p.useDagger?'dagger':'sword');const impact=bossImpactPosition(),packet=bossDamagePacket(Math.round((heavy?1380:1033)*scale),Math.round((heavy?180:125)*scale),impact);
 applyBossDamage(packet.total,impact);
}
function damagePlayer(amount,range,parryable=true,options={}){
 const origin=options.origin||b.pos,dist=Math.hypot(p.pos.x-origin.x,p.pos.z-origin.z);
 if(state.stage!=='combat'||state.grabbed||dist>range)return false;
 if(parryable&&!faces(b.pos,b.yaw,p.pos,options.arc||1.25,.32)){combatEvent('boss-miss','arc');return false;}
 if(p.invuln>0&&!options.airCatch)return false;const defending=faces(p.pos,p.yaw,origin,1.05);
 // Parry remains ahead of damage-repeat cooldown, including the second contact.
 if(parryable&&defending&&p.action==='parry'&&p.elapsed>.06&&p.elapsed<.51){combatEvent('parry','front-window');if(!recordedControls)p.parryFollowUntil=state.time+.98;b.deflection={action:b.action,elapsed:b.elapsed,hand:MOVES[b.action]?.contacts[b.hitIndex-1]?.hand||0};const closing=b.phasePending!=null||b.phaseFade!=null;if(!closing)b.parries++;b.action='recover';b.elapsed=0;b.duration=1.18;b.critical=!closing&&b.parries%3===0;b.criticalReadyAt=state.time+1.25;b.stagger=b.critical?3.2:1.0;b.reelFrom=b.critical?b.pos.clone():null;b.reelYaw=b.yaw;fx.burst(p.pos.clone().add(new T.Vector3(0,1.4,0)),'gold',25);playSound('parry');return false;}
 if(p.hitCooldown>0)return false;
 let guarded=false;
 if(keys.has('KeyZ')&&['idle','walk','run'].includes(p.action)&&defending){
   if(state.stamina>18||(!recordedControls&&state.stamina===18)){guarded=true;combatEvent('guard','front');state.stamina-=18;p.staminaDelay=.4;amount*=.12;fx.burst(p.pos.clone().add(new T.Vector3(0,1.3,0)),'gold',8);}
   else {state.stamina=0;p.staminaDelay=.8;combatEvent('guard-break','stamina');}
 }
 p.rollLinkUntil=-Infinity;p.parryFollowUntil=-Infinity;p.buffer=null;
 if(!p.flight&&!options.launch){p.recoil.copy(p.pos).sub(origin);p.recoil.y=0;p.recoil.normalize().multiplyScalar(guarded?.35:1.5);p.hitYaw=Math.atan2(origin.x-p.pos.x,origin.z-p.pos.z)-p.yaw;p.action=guarded?'guard-recoil':'hurt';p.elapsed=0;p.duration=guarded?.18:.38;p.attackDone=true;p.buffer=null;p.velocity.set(0,0,0);}
 const hpBefore=state.hp;state.hp=Math.max(0,state.hp-amount);combatEvent('player-hurt',options.reason||'sword',{hpBefore,hpAfter:state.hp,damage:hpBefore-state.hp,blocked:guarded,damageType:options.damageType||'physical'});if(options.reason==='flame'){state.bloodflame=BLOODFLAME.duration;combatEvent('bloodflame','delayed-buildup');}p.hitCooldown=.75;
 if(guarded){
   if(!recordedControls)p.guardCounterUntil=state.time+.8;
   playSound('guard');
 }else{
   playSound('hurt');
   fx.burst(p.pos.clone().add(new T.Vector3(0,1,0)),'blood',12);playSound('hit');
 }
 if(options.launch&&state.hp>0){p.flight={elapsed:0,duration:1.05,velocity:new T.Vector3(-Math.sin(b.yaw)*2,0,-Math.cos(b.yaw)*2),height:1.5};p.action='jump';p.elapsed=0;p.duration=1.05;}
 if(state.hp<=0)defeat(options.reason||'damage');return true;
}
const patterns=['leap','rocks','double','cross','sweepDown','long','uppercut','long','risingSlash','cross','bloodflame','pull','double','slam','swing','somersault'];
const phaseTwoPatterns=['grab','ring','nova','double','holySweepDown','stompSweep','cross','promised','cross','stompGrab','cross','sideDash','ring','dash','lightspeed','uppercut','bloodflame','somersault','swing','pull'];
function bossHidden(){return b.action==='sideDash'&&((b.elapsed>.5&&b.elapsed<1.1)||(b.elapsed>2.2&&b.elapsed<4.8))||b.action==='meteor'&&b.elapsed>=METEOR_SEQUENCE.risen&&b.elapsed<METEOR_SEQUENCE.return;}
function beginBoss(){
 if(b.phasePending!=null){closePhaseExchange(true);return;}
 if(b.phaseFade!=null)return;
 const pattern=state.phase===2?phaseTwoPatterns:patterns;
 let move=pattern[b.move++%pattern.length];const d=distance();
 if(b.lastAttack==='rocks'&&d>8)move=state.phase===2?'lightspeed':'leap';
 else if(state.phase===1&&d>18&&b.move>4)move=b.move%2?'leap':'rocks';
 if(state.phase===2){
   // The selected post-departure sequence is rocks, airborne phantoms, then
   // nearby sword combat. Selection follows completed moves, not clip time.
   if(b.meteorFollowup===1){move='rocks';b.meteorFollowup=2;}
   else if(b.meteorFollowup===2&&b.lastAttack==='rocks'){move='lightspeed';b.meteorFollowup=3;}
   else if(b.meteorFollowup===3&&b.lastAttack==='lightspeed'){move='double';b.meteorFollowup=0;}
   if(move==='grab'||move==='stompGrab'){
     if(state.time-b.lastGrab<GRAB_COOLDOWN)move='cross';
     else b.lastGrab=state.time;
   }
   if(move==='nova'){b.lastNova=state.time;b.lightPasses=0;}
   if(meteorEligible(state.phase,state.bossHp,state.bossMax,state.time,b.lastMeteor)){move='meteor';b.meteorFollowup=1;b.lastMeteor=state.time;combatEvent('meteor-start','hp-and-cooldown');}
 }
 b.crossFromPromised=move==='cross'&&b.lastAttack==='promised';
 b.crossFromRiposte=state.phase===2&&move==='cross'&&b.postCritical;
 b.rushToCross=move==='cross'&&b.lastAttack==='leap'&&state.phase===1;b.deflection=null;b.rushCommitted=false;b.rockLaunchYaw=null;b.furrowPoint=null;b.rockDeparture=null;b.flightStart=null;b.previousPhantom=null;b.crossLow=move==='cross'&&b.lastAttack==='risingSlash';b.action=move;b.lastAttack=move;b.postCritical=false;b.retreatFrom=null;b.chainReturn=null;b.comboLeap=null;b.promisedLandingYaw=null;b.grabPrepared=false;b.meteorCharge=false;b.meteorTargetCommitted=false;b.meteorCancelled=false;b.flameTarget=null;b.ringReleased=false;b.ringAfterglow=false;b.barrageReleased=false;b.elapsed=0;b.hitIndex=0;b.target.copy(p.pos);b.target.y=0;b.from.copy(b.pos);if(!(move==='leap'&&b.move===1))b.from.y=0;b.yaw=facing(b.pos,p.pos);
 b.plungeSparks=null;b.plungeStrike=null;
 b.duration=MOVES[move]?.duration||{leap:b.move===1?RUSH_SEQUENCE.openingDuration:RUSH_SEQUENCE.duration,rocks:ROCK_SEQUENCE.duration,nova:7.3,meteor:METEOR_SEQUENCE.duration,grab:GRAB_SEQUENCE.duration,pull:4.7,lightspeed:2.5,dash:3.4,sideDash:4.9}[move];
 if(move==='lightspeed'&&b.meteorFollowup===3)b.duration=lightContacts(move,true).at(-1)+1.8;
 if(move==='rocks'&&b.meteorFollowup===2)b.duration=ROCK_SEQUENCE.followupDuration;
 if(move==='rocks'){projectiles.length=0;for(let i=0;i<ROCK_COUNT;i++)projectiles.push({i,pos:b.pos.clone(),from:new T.Vector3(),target:new T.Vector3(),age:0,flight:(state.phase===1?1.11:.82+ROCK_SEQUENCE.phaseTwoLead)+i*.025,launched:false,done:false});}
 combatEvent('boss-start',move);
}
function holyShaft(pos,delay,width,from=null,pairedLanding=false,visualDuration=1.22,visualOptions={}){
 pos.y=world.groundHeight(pos.x,pos.z);
 fx.pillar(pos,delay,width*(pairedLanding?.74:1),from ? .45 : visualDuration,from,pairedLanding,visualOptions);
 hazards.push({pos,radius:.63*width,delay:delay+.095,life:.4,damage:65,reason:'holy'});
}
// Secondary shafts extend the same grounded skill field; they add light residue, not new damage volumes.
function secondaryHolyShaft(pos,delay,width,gain=.48,duration=1.35,hold=.25){
 if(!onTerrace(pos.x,pos.z))return;
 pos.y=world.groundHeight(pos.x,pos.z);
 fx.pillar(pos,delay,width,duration,null,false,{gain,hold});
}
function outerHolyField(origin,yaw,rings,delay=0,timing={}){
 rings.forEach(([radius,count,width,gain],row)=>{
  for(let i=0;i<count;i++){
   const a=yaw+i*Math.PI*2/count+row*.51;
   const r=radius*(1+.065*Math.sin(i*2.71+row));
   const pos=origin.clone().add(new T.Vector3(Math.sin(a)*r,0,Math.cos(a)*r));
   secondaryHolyShaft(pos,delay+row*(timing.rowGap??.105)+(i%5)*(timing.slotGap??.023)+Math.floor(i/5)*(timing.batchGap??0),width,gain,(timing.duration??1.35)+(i%3)*.08,timing.hold??.25);
  }
 });
}
function addHoly(origin,yaw,style,hand=0,impact=true){
 const footprints=holyFootprints(style,hand);
 if(!footprints.length)return;
 playSound('holy',.2);
 if(style==='quake'&&impact)fx.holyImpact(origin.clone().setY(world.groundHeight(origin.x,origin.z)),7);
 const pairedLanding=b.action==='promised'&&style==='quake';
 if(pairedLanding)fx.landingThreads(origin,yaw);
 // Primary clip102.5 and140ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ142: the landing's light rain has several depth layers behind the fighter.
 if(style==='quake')outerHolyField(origin,yaw,[[6,11,.86,.77],[11,14,.76,.70],[17,18,.63,.60],[25,24,.50,.50]],.18,{rowGap:.11,slotGap:.04,duration:1.46,hold:.36});
 for(const point of footprints){
  const {x,z,width}=point;
  // The first shafts are already up as the paired swords settle.
  const delay=pairedLanding?Math.max(.012,point.delay-.15):point.delay;
  const pos=new T.Vector3(origin.x+Math.cos(yaw)*x+Math.sin(yaw)*z,0,origin.z-Math.sin(yaw)*x+Math.cos(yaw)*z);
  holyShaft(pos,delay,width,b.action==='ring'?origin:null,pairedLanding);
  if(b.action==='promised'&&style!=='quake'){
    const side=hand||1;
    const flank=pos.clone();
    flank.x+=side*Math.cos(yaw)*1.45;flank.z-=side*Math.sin(yaw)*1.45;
    secondaryHolyShaft(flank,delay+.13,.59,.64,1.05,.18);
  }
 }
}
function illusionFoot(target,yaw){
 // Place the feet behind the spot marked for the blades, so a stationary
 // target lies in front of the blade instead of behind the collision volume.
 return new T.Vector3(target.x+Math.sin(yaw)*1.15,target.y,target.z+Math.cos(yaw)*1.15);
}
function illusionVolume(pos,yaw,side=false,body=false){
 // Reconstructed sword volume ahead of the torso. The retained swords are
 // 3.3 m long; exact original hitboxes have not been recovered.
 return {pos:pos.clone().add(new T.Vector3(-Math.sin(yaw)*.65,0,-Math.cos(yaw)*.65)),yaw,arc:side?1.45:1.15,radius:body?2.65:side?.9:1.65};
}
function suspendedHeight(age){
 // The first lift is slow. During the light passes the caster rises above the runner.
 const lift=T.MathUtils.smootherstep(age,.65,1.58)+6.65*T.MathUtils.smootherstep(age,1.48,2.65);
 return lift*(1-T.MathUtils.smootherstep(age,6.78,7.83));
}
// Primary clip 68.40-71.15: the moments a new hair-thin trace appears, in seconds after the skill starts.
const NOVA_PASS_TIMES=[1.86,2.06,2.24,2.56,2.68,3.01,3.31,3.46,3.58,3.81,3.91,4.08,4.21,4.41,4.61];
function bossStep(dt){
 b.frost=Math.max(0,b.frost-dt*5);b.stagger=Math.max(0,b.stagger-dt);b.elapsed+=dt;
 if(b.stagger>0){
  // A guard-breaking parry carries him back several strides before he folds (primary 33.0-33.6 s).
  if(b.critical&&b.reelFrom&&b.action==='recover'){
    const recoilTime=state.phase===1&&b.lastAttack==='long'?.60*T.MathUtils.smootherstep(b.elapsed,.16,1.04):b.elapsed;
    b.pos.copy(b.reelFrom).add(new T.Vector3(Math.sin(b.reelYaw),0,Math.cos(b.reelYaw)).multiplyScalar(parryReel(recoilTime)));
  }
  return;
 }
 const d=distance(),yaw=facing(b.pos,p.pos),t=b.elapsed;
 if(b.action==='critical'){const retreat=CRITICAL_RETREAT*T.MathUtils.smoothstep(t,RIPOSTE_SEQUENCE.release+.03,RIPOSTE_SEQUENCE.release+.75);if(b.criticalOrigin)b.pos.copy(b.criticalOrigin).add(new T.Vector3(Math.sin(b.criticalYaw),0,Math.cos(b.criticalYaw)).multiplyScalar(retreat));if(t>3.35)b.yaw=lerpAngle(b.yaw,yaw,Math.min(1,dt*3.6));if(t>=b.duration){b.action='recover';b.elapsed=0;b.duration=.7;b.postCritical=true;}return;}
 if(b.action==='approach'){b.yaw=lerpAngle(b.yaw,yaw,Math.min(1,dt*4));const v=p.pos.clone().sub(b.pos);v.y=0;b.pos.addScaledVector(v.normalize(),Math.min(Math.max(0,d-3),dt*5.6));if(d<3.5||t>4.5)beginBoss();return;}
 if(b.action==='wait'||b.action==='recover'){
   if(b.action==='recover'&&b.lastAttack==='nova'){b.pos.y=suspendedHeight(7.3+t);if(d>1.4)b.yaw=lerpAngle(b.yaw,yaw,1-Math.exp(-dt*5));}
   if(b.action==='recover'&&state.phase===2&&b.lastAttack==='promised'&&b.hitIndex===MOVES.promised.contacts.length&&d>.65)b.yaw=lerpAngle(b.yaw,yaw,1-Math.exp(-dt*6));
   if(b.action==='recover'&&b.postCritical)b.yaw=lerpAngle(b.yaw,yaw,Math.min(1,dt*3.6));
   // Critical/parry recovery is planted. No perpetual auto-turn toward the player.
   if(b.action==='wait'&&b.move>0){b.yaw=lerpAngle(b.yaw,yaw,Math.min(1,dt*4));if(d>3){const v=p.pos.clone().sub(b.pos);v.y=0;b.pos.addScaledVector(v.normalize(),Math.min(d-3,dt*3.8));}}
   if(t>=b.duration){if(['rocks','ring','sideDash'].includes(b.lastAttack)&&d>5)beginBoss();else if(b.move>=2&&d>5&&d<22){b.action='approach';b.elapsed=0;}else beginBoss();}return;
 }
 if(t<.75)b.yaw=lerpAngle(b.yaw,yaw,Math.min(1,dt*4));
 const catalog=MOVES[b.action];
 if(catalog){
   const preparationGap=state.phase===2&&b.action==='cross'?2.4:3.2;
   if(t<.48&&d>preparationGap){const v=p.pos.clone().sub(b.pos);v.y=0;b.pos.addScaledVector(v.normalize(),Math.min(d-preparationGap,dt*3.8));}
    // Each sword contact has an approach, planted release and recovery. Tracking
    // stops before release; circling the boss can actually evade the blade.
    const pending=catalog.contacts[b.hitIndex];
    // The final paired slam is an actual leap, not a planted sword pose.
    if(pending?.jump){
      const lead=pending.t-t,liftWindow=b.action==='promised'?1.3:.9;
      // The paired leap follows its target during preparation, then commits
      // with the same .45s cutoff as its horizontal landing position.
      if(state.phase===2&&b.action==='promised'&&lead<liftWindow&&lead>.45&&d>.65){b.promisedLandingYaw??=b.yaw;b.yaw=lerpAngle(b.yaw,yaw,1-Math.exp(-dt*7));}
      if(lead<.9){
        if(!b.comboLeap)b.comboLeap={from:b.pos.clone().setY(0),target:b.pos.clone().setY(0),contact:pending.t};
        if(lead>.45){
          const direction=p.pos.clone().sub(b.comboLeap.from).setY(0);
          const gap=direction.length();direction.normalize();
          if(b.action==='promised'){
            // Land past the rolling player's outside shoulder. The sideways
            // clearance carries the pair around the player on the final dive.
            const across=new T.Vector3(direction.z,0,-direction.x);
            b.comboLeap.target.copy(p.pos).setY(0).addScaledVector(direction,1.84).addScaledVector(across,2.62);
            b.comboLeap.plantYaw=facing(b.comboLeap.target,p.pos);
          }else b.comboLeap.target.copy(b.comboLeap.from).addScaledVector(direction,Math.max(0,gap-1.6));
        }
        const f=T.MathUtils.smoothstep(.9-lead,0,.9);
        b.pos.lerpVectors(b.comboLeap.from,b.comboLeap.target,f);
        if(lead<=.45&&b.comboLeap.plantYaw!=null)b.yaw=lerpAngle(b.yaw,b.comboLeap.plantYaw,1-Math.exp(-dt*8.5));
      }
      // Lift precedes the forward dive; retain the existing target commit and
      // horizontal approach so the higher jump does not rotate later combat.
      if(lead<liftWindow){const lift=T.MathUtils.smoothstep(liftWindow-lead,0,liftWindow);b.pos.y=Math.sin(Math.PI*lift)*(b.action==='promised'?4.15:1.7);}
    }else if(b.comboLeap&&t>=b.comboLeap.contact)b.pos.y=0;
    if(b.action==='promised'&&state.phase===2){
      for(const [i,beat] of [5.55,5.89,6.05,6.19].entries()){
        if(t-dt<beat&&t>=beat){
          const a=b.yaw+(i%2?-.96:1.18),r=.72+.29*i;
          const grit=b.pos.clone();grit.x+=Math.sin(a)*r;grit.z+=Math.cos(a)*r;
          grit.y=world.groundHeight(grit.x,grit.z)+.12;
          fx.burst(grit,'gold',7+3*i);
          if(i===2)fx.arenaFlash(grit,.06,.28,.16);
        }
      }
    }
    if(state.phase===2&&b.action==='promised'&&t>7.62&&d>.65)b.yaw=lerpAngle(b.yaw,yaw,1-Math.exp(-dt*6));
    const previousStep=meleeLocomotion(b.action,Math.max(0,t-dt)),currentStep=meleeLocomotion(b.action,t);
    const stride=new T.Vector3(currentStep.root[0]-previousStep.root[0],0,currentStep.root[1]-previousStep.root[1]);
    stride.applyAxisAngle(new T.Vector3(0,1,0),b.yaw);b.pos.add(stride);
    if(pending&&!pending.area&&b.action!=='somersault'&&!pending.jump){
      const lead=pending.t-t;
      if(lead>.25&&lead<.65)b.yaw=lerpAngle(b.yaw,yaw,1-Math.exp(-dt*2.8));

    }
   if(b.action==='somersault'){const f=T.MathUtils.clamp((t-.55)/1.2,0,1);b.pos.lerpVectors(b.from,b.target,f);b.pos.y=Math.sin(f*Math.PI)*3.3;}
   if(b.action==='stompSweep'&&t>=1.8&&t<3.65){
    if(!b.retreatFrom){b.retreatFrom=b.pos.clone();b.chainReturn=b.pos.clone();b.retreatTarget=b.pos.clone().add(new T.Vector3(Math.sin(b.yaw)*2.2,0,Math.cos(b.yaw)*2.2));}
    if(t<2.85)b.pos.lerpVectors(b.retreatFrom,b.retreatTarget,T.MathUtils.smoothstep(t,1.8,2.85));
    else if(t<3.15)b.pos.copy(b.retreatTarget);
    else {const f=T.MathUtils.smoothstep(t,3.15,3.65);b.pos.lerpVectors(b.retreatTarget,b.chainReturn,f);b.pos.y=Math.sin(f*Math.PI)*.3;}
   }else if(b.action==='stompSweep'&&b.chainReturn&&t>=3.65){b.pos.y=0;b.chainReturn=null;}
   const c=catalog.contacts[b.hitIndex];
   if(c&&t>=c.t){b.hitIndex++;playSound(c.area?'stone':'slash',c.area?.65:.85);const attack=b.action;
     const heelStrike=attack==='promised'&&c.style==='stomp';
     const heel=heelStrike?new T.Vector3(.60,0,-.87).multiplyScalar(boss.presentationScale).applyAxisAngle(new T.Vector3(0,1,0),b.yaw).add(b.pos):null;
     if(heel)heel.y=world.groundHeight(heel.x,heel.z);
     if(c.area&&!heelStrike&&c.style!=='flame')fx.arc(b.pos,b.yaw,false);const low=c.style==='stomp'||c.style==='quake';
     if(d>=(c.minRange||0)&&!(low&&airborne()))damagePlayer(c.damage??CONTACT_DAMAGE[c.style],c.style==='flame'?2.5:heelStrike?3.45:c.area?4.6:c.style==='thrust'?4.4:3.65,!c.area,{origin:c.style==='flame'?b.flameTarget:heel,arc:c.style==='thrust'?.45:1.3,launch:c.launch,airCatch:c.airCatch&&airborne(),reason:c.style,damageType:c.style==='flame'?'fire':'physical'});
     // A parry changes action and installs its own recovery. The old contact
     // time must never fall through and overwrite that new state's duration.
     if(b.action!==attack||state.stage!=='combat')return;
     if(attack==='bloodflame'&&c.style==='sweep'){b.flameTarget=b.pos.clone().add(new T.Vector3(-Math.sin(b.yaw)*2.1,0,-Math.cos(b.yaw)*2.1));fx.bloodflameRift(b.flameTarget,b.yaw);}
     const goldenAftershock=state.phase===2&&attack==='promised'&&c.style==='quake';
     if(state.phase===2&&attack==='promised'&&c.jump){
       const strike=b.pos.clone().setY(world.groundHeight(b.pos.x,b.pos.z));
       fx.holyImpact(strike,6.5,true);
       fx.arenaFlash(strike,.30,.41,.84);
       // The ground starts emitting before the delayed damage ring reaches it.
       outerHolyField(strike,b.yaw,[[4.6,8,1.20,.82],[9.3,12,1.04,.72],[15.8,13,.66,.48]],.045,
         {rowGap:.069,slotGap:.021,duration:.95,hold:.24});
     }
     if(heelStrike){
       fx.debris(heel,3.45);
       combatEvent('stomp-impact','right-heel');
     }else if(c.area&&!goldenAftershock){if(c.style==='flame')fx.bloodflameBlast(b.flameTarget||b.pos,b.yaw);else fx.debris(b.pos,2);if(c.style==='stomp'||c.style==='quake')fx.groundSpikes(b.pos.clone().setY(world.groundHeight(b.pos.x,b.pos.z)),b.yaw,c.style==='stomp'?4.6:5.4,false,attack==='long'&&c.style==='quake');if(c.style==='quake'){fx.debris(b.pos,4);groundFracture(b.pos,7,1.18);}}
     // Only contacts that were not cancelled by parry can create new light.
     if(state.phase===2&&!heelStrike&&b.action===attack&&state.stage==='combat'){combatEvent('holy-followup',attack);if(c.style==='cross')fx.crossRays(b.pos,b.yaw);// The ground pattern is committed before the paired leap turns; body
       // alignment must not rotate an already planned damaging column field.
       const holyYaw=attack==='promised'&&(c.jump||c.style==='quake')?(b.promisedLandingYaw??b.yaw):b.yaw;addHoly(b.pos,holyYaw,c.style,c.hand,!goldenAftershock);}
   }
 }
 if(b.action==='leap'){
   const rush=RUSH_SEQUENCE,grounded=state.phase===1&&b.move>1,opening=state.phase===1&&b.move===1,windup=opening?rush.openingWindup:grounded?1.7:rush.windup,contact=opening?rush.openingContact:rush.contact,openingHeight=opening?b.from.y:0;
   if(t<windup){b.target.copy(p.pos);b.target.y=0;b.pos.y=grounded?0:openingHeight;}
   else if(t<contact){if(!b.rushCommitted){const pass=b.move===1?3.4:1.06;b.target.add(new T.Vector3(Math.cos(b.yaw)*pass,0,-Math.sin(b.yaw)*pass));b.rushCommitted=true;}const f=(t-windup)/(contact-windup),travel=opening?1-Math.pow(1-f,1.76):grounded?1-Math.pow(1-f,3):f;b.pos.lerpVectors(b.from,b.target,travel);b.pos.y=openingHeight*(1-travel)+Math.sin(f*Math.PI)*(opening?1.40:3.5);}
   if(t>=contact&&b.hitIndex===0){b.hitIndex++;if(opening)b.openingImpactAt=state.time;playSound('stone');b.pos.copy(b.target);fx.burst(b.pos.clone().add(new T.Vector3(0,.5,0)),'purple',75);fx.lightning(b.pos);fx.debris(b.pos,6);groundFracture(b.pos,8,opening?1.48:1.36);fx.groundSpikes(b.pos.clone().setY(world.groundHeight(b.pos.x,b.pos.z)),b.yaw,5.6,true,false,opening);fx.arc(b.pos,b.yaw,true);damagePlayer(235,5,false,{reason:'gravity-rush'});}
 }
 if(b.action==='rocks'){
   const r=ROCK_SEQUENCE;
   // Selected phase-one source: the ground rip continues before the body rises
   // across the player after the turn. Landing direction follows the launch frame.
   if(state.phase===1){
     b.rockLaunchYaw??=b.yaw;
     const slide=T.MathUtils.clamp((t-r.dragStart)/(r.liftOff-r.dragStart),0,1);
     const air=T.MathUtils.clamp((t-r.liftOff)/(r.hover-r.liftOff),0,1);
     const dragLength=1.76;
     const pull=dragLength*slide*slide*(2-slide);
     // Carry the ground speed across toe-off, then accelerate out of the furrow.
     const carry=dragLength*(r.hover-r.liftOff)/(r.liftOff-r.dragStart)*air*(1-air)**2;
     const drive=1-(1-air)**1.85;
     const arc=drive*drive*(3-2*drive);
     // The hips arc around the planted boot as he turns his back. Once the
     // blades bite in front of him he travels backwards along the furrow.
     const turn=Math.PI*T.MathUtils.smoothstep(t,.98,1.78);
     const pivotForward=.22*(1-Math.cos(turn))-.48*Math.sin(turn);
     const pivotSide=.48*(1-Math.cos(turn))+.22*Math.sin(turn);
     const forward=pivotForward+pull+carry+(24-.44-dragLength)*arc;
     const side=pivotSide-1.12*(pull+carry)+(2-.96+1.12*dragLength)*arc+3.4*Math.sin(Math.PI*arc);
     b.pos.copy(b.from);
     b.pos.x+=-Math.sin(b.rockLaunchYaw)*forward+Math.cos(b.rockLaunchYaw)*side;
     b.pos.z+=-Math.cos(b.rockLaunchYaw)*forward-Math.sin(b.rockLaunchYaw)*side;
     b.pos.y=5.55*(1-(1-air)**2)*(1-T.MathUtils.smoothstep(t,6.61,r.duration));
     if(t>r.liftOff+.20)b.yaw=lerpAngle(b.yaw,facing(b.pos,p.pos),1-Math.exp(-dt*3.2));
   }else if(b.meteorFollowup===2){
     // After the starfall the caster bounds back with the suspended stones.
     // Vault across the near shoulder before settling in the open return lane.
     if(!b.rockDeparture){
       const away=b.from.clone().sub(p.pos).setY(0).normalize();
       const gateward=new T.Vector3(-b.from.x,0,(world.gateZ??-83)-b.from.z).normalize();
       const flank=new T.Vector3(-gateward.z,0,gateward.x);
       if(flank.dot(away)>0)flank.negate();
       b.rockDeparture=gateward.addScaledVector(flank,.62).normalize();
     }
     const drift=.028*T.MathUtils.smootherstep(t,1.37,r.rise)
       +.972*T.MathUtils.smootherstep(t,r.rise-.01,r.risen-.03);
     b.pos.copy(b.from).addScaledVector(b.rockDeparture,drift*19.5);
     b.pos.y=5*Math.sin(T.MathUtils.smoothstep(t,r.rise-.04,r.risen-.09)*Math.PI*.5);
     if(t>r.risen)b.yaw=lerpAngle(b.yaw,facing(b.pos,p.pos),1-Math.exp(-dt*3.2));
   }else if(t<r.rise)b.pos.y=0;else if(t<r.risen){b.pos.copy(b.from);b.pos.y=Math.sin((t-r.rise)/(r.risen-r.rise)*Math.PI*.5)*5;}else if(t<r.retreatEnd){const f=(t-r.risen)/(r.retreatEnd-r.risen);b.pos.copy(b.from).add(new T.Vector3(Math.sin(b.yaw)*f*3.5,5,Math.cos(b.yaw)*f*3.5));}else b.pos.y=b.meteorFollowup===2?5:Math.max(0,5-Math.max(0,t-r.descend)*5);
   if(t>=r.strike&&b.hitIndex===0){b.hitIndex++;fx.lightning(b.pos);fx.debris(b.pos,3);if(!airborne())damagePlayer(185,3.5,false,{reason:'gravity-ground-rip'});}
   for(const rock of projectiles){
     if(!rock.launched){const a=rock.i/ROCK_COUNT*Math.PI*2;
       const formation=ROCK_FORMATION[rock.i],rise=state.phase===1?T.MathUtils.smoothstep(t,r.liftOff-.20,r.liftOff+.58):T.MathUtils.smoothstep(t,r.rise-.17,r.rise+.49);
       let opening=1,ringYaw=b.yaw;
       if(state.phase===1){
         // Stones bunch at toe-off, then fan out towards the rolling player
         // while the caster's own shoulders are still coming around.
         opening=.67+.33*T.MathUtils.smoothstep(t,r.liftOff+.12,r.hover+.13);
         const fan=T.MathUtils.smoothstep(t,r.liftOff+.02,r.liftOff+.43)*(1-T.MathUtils.smoothstep(t,r.hover+.12,r.hover+.66));
         ringYaw=lerpAngle(b.yaw,facing(b.pos,p.pos),fan);
       }
       if(state.phase===2&&b.meteorFollowup===2)opening=.64+.36*T.MathUtils.smoothstep(t,r.rise+.12,r.risen+.15);
       rock.pos.copy(b.pos).add(new T.Vector3(formation[0]*opening,(formation[1]-2)*rise*opening+2*rise-1.2*(1-rise),formation[2]).applyAxisAngle(new T.Vector3(0,1,0),ringYaw));
       if(t>=r.throw+(state.phase===1?.40:-r.phaseTwoLead)+rock.i*r.gap*5/(ROCK_COUNT-1)){rock.launched=true;rock.from.copy(rock.pos);rock.target.copy(p.pos);rock.target.y=.7;rock.target.x+=Math.sin(a)*.5;rock.target.z+=Math.cos(a)*.5;combatEvent('rock-launch',String(rock.i));}}
   }
 }
 if(b.action==='pull'){
   if(t>1&&t<1.9&&d<15&&p.invuln<=0){const v=b.pos.clone().sub(p.pos);v.y=0;p.pos.addScaledVector(v.normalize(),dt*6);}
   if(t>1&&b.hitIndex===0){b.hitIndex++;fx.lightning(b.pos);fx.burst(b.pos,'purple',70);}
   if(t>2.45&&b.hitIndex===1){b.hitIndex++;fx.debris(b.pos,7);groundFracture(b.pos,8,1.32);fx.lightning(b.pos);fx.groundSpikes(b.pos,b.yaw,6,true);if(!airborne())damagePlayer(240,6,false,{reason:'gravity-spikes'});if(state.phase===2)addHoly(b.pos,b.yaw,'stomp');}
 }
 if(b.action==='grab'||b.action==='stompGrab'){
   const chained=b.action==='stompGrab',g=chained?STOMP_GRAB_SEQUENCE:GRAB_SEQUENCE;
   if(chained&&t>=1.8&&!b.grabPrepared){b.grabPrepared=true;b.from.copy(b.pos);b.target.copy(p.pos);b.target.y=0;b.yaw=facing(b.pos,p.pos);}
   const lift=chained?g.takeoff:g.takeoff+.21;
   if(t>lift&&t<g.land){const f=(t-lift)/(g.land-lift);b.pos.lerpVectors(b.from,b.target,.8*(chained?f:1-Math.pow(1-f,1.40)));b.pos.y=Math.sin(f*Math.PI)*(chained?2.2:3.15);}else if(t>=g.land)b.pos.y=0;
   if(t>=g.contact&&b.hitIndex===(chained?1:0)){b.hitIndex++;b.pos.y=0;const contact=distance()<2.7&&faces(b.pos,b.yaw,p.pos,.65,.3)&&p.invuln<=0&&!airborne();
     if(contact){clearFlight('grab');state.grabbed=true;p.action='grabbed';p.buffer=null;p.elapsed=0;combatEvent('grab-contact',state.marked?'marked':'unmarked');fx.burst(p.pos.clone().add(new T.Vector3(0,1.4,0)),'gold',25);}else{b.duration=g.missDuration;b.grabMissAt=state.time;b.grabMissChained=chained;combatEvent('grab-miss','distance-facing-or-evasion');}}
   // The missed embrace carries into one planted recovery step (primary 64.4-65.2).
   // Integrate that movement from this miss's age, independently of render cadence.
   if(!chained&&!state.grabbed&&state.time-b.grabMissAt<1.25){
    const age=state.time-b.grabMissAt;
    const stride=2.2*(T.MathUtils.smoothstep(age,.28,1.08)-T.MathUtils.smoothstep(age-dt,.28,1.08));
    b.pos.add(new T.Vector3(-Math.sin(b.yaw),0,-Math.cos(b.yaw)).multiplyScalar(stride));
   }
   if(state.grabbed){p.pos.set(b.pos.x-Math.sin(b.yaw)*1.35,Math.sin(Math.min(1,(t-g.contact)/1.2)*Math.PI*.5)*1.1,b.pos.z-Math.cos(b.yaw)*1.35);if(t>=g.release){const result=grabResult(state.marked,true);state.grabbed=false;p.pos.y=0;p.action='idle';p.invuln=.8;if(result==='death')defeat('second-grab');else{state.marked=true;combatEvent('grab-mark','no-hp-damage');}}}
 }
 if(b.action==='ring'){
   if(t>=1.1&&!b.ringReleased){b.ringReleased=true;fx.ring(b.pos);hazards.push({pos:b.pos.clone(),wave:true,age:0,startRadius:3.4,delay:0,life:2,damage:180,reason:'light-ring'});}
   if(t>=1.70&&t-dt<1.70){
     const origin=b.from.clone().setY(world.groundHeight(b.from.x,b.from.z)+2.0);
     fx.arenaFlash(origin,.44,.29,.97,true);
   }
   if(t>=1.83&&t-dt<1.83)fx.holyImpact(b.from.clone().setY(world.groundHeight(b.from.x,b.from.z)),8.8);
   if(t>=2.80&&!b.ringAfterglow){
     b.ringAfterglow=true;
     const pos=b.from.clone().setY(world.groundHeight(b.from.x,b.from.z));
     fx.pillar(pos,0,2.15);
     for(const side of [-1,1]){
       const edge=pos.clone().add(new T.Vector3(Math.cos(b.yaw)*side*.75,0,-Math.sin(b.yaw)*side*.75));
       fx.pillar(edge,.055,.48);
     }
   }
   if(t>1.4){
     // A short slip to the left precedes the long oblique retreat. The
     // lock-on follows the moving body from W to N as in the 67ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ72 s view.
     b.retreatFrom??=b.pos.clone();
     const f=Math.min(1,(t-1.4)/1.3);
     const travel=T.MathUtils.smoothstep(f,.69,.97),turn=b.yaw-1.38;
     const sidestep=.86*Math.sin(Math.PI*T.MathUtils.smoothstep(f,0,.57));
     b.pos.copy(b.retreatFrom).add(new T.Vector3(
       Math.sin(turn)*24.8*travel+Math.cos(b.yaw)*sidestep,
       f<1?Math.sin(f*Math.PI)*2:0,
       Math.cos(turn)*24.8*travel-Math.sin(b.yaw)*sidestep));
   }
   if(t>=2.54&&t-dt<2.54){
     const release=b.from.clone().lerp(b.pos,.44);release.y=world.groundHeight(release.x,release.z);
     fx.holyImpact(release,6.1);fx.burst(release.clone().add(new T.Vector3(0,.95,0)),'gold',43);
   }
   if(t>=2.67&&t-dt<2.67){
     const foot=b.pos.clone().setY(world.groundHeight(b.pos.x,b.pos.z));
     fx.holyImpact(foot,4.5);fx.burst(foot.clone().add(new T.Vector3(0,.65,0)),'gold',32);
   }
 }
 if(b.action==='sideDash'){
   if(t>=2.2&&!b.barrageReleased){b.barrageReleased=true;fx.lightBarrage(b.target,b.yaw,b.duration-2.2+.15);}
   if(t<.8){const f=t/.8;b.pos.copy(b.from).add(new T.Vector3(Math.cos(b.yaw)*6*f+Math.sin(b.yaw)*3*f,Math.sin(f*Math.PI)*.8,-Math.sin(b.yaw)*6*f+Math.cos(b.yaw)*3*f));}
   else if(t<4.8)b.pos.y=0;
   if(bossHidden()&&state.locked){releaseCameraLock();combatEvent('lock-lost','light-side-step');}
   const times=LIGHT_CONTACTS.sideDash;
   if(b.hitIndex<times.length&&t>=times[b.hitIndex]){
     const last=b.hitIndex===3;b.hitIndex++;const pos=illusionFoot(b.target,b.yaw);
     fx.afterimage(pos,b.yaw,boss,'side',null,b.hitIndex-1);
     if(last){b.pos.copy(pos);if(!dash)groundFracture(pos,10,1.42);fx.burst(pos,'gold',45);damagePlayer(225,3.2,false,{reason:'light-side-body'});addHoly(pos,b.yaw,'cross');}
     else{hazards.push({...illusionVolume(pos,b.yaw,true),delay:.3,life:.16,damage:60,reason:'side-afterimage'});b.target.copy(p.pos);b.target.y=0;}
   }
 }
 if(b.action==='nova'){
   // The airborne caster keeps his chest toward the approaching player, including the descent.
   if(d>1.4)b.yaw=lerpAngle(b.yaw,yaw,1-Math.exp(-dt*5));
   // Primary 72.5-78: both blades open while Radahn rises and hangs above
   // the approaching player. The light field remains at the marked ground.
   b.pos.y=suspendedHeight(t);
   if(t>=.48&&b.hitIndex===0){
    // Commit once, ahead of a running target. At the first flash the
    // runner can cross the edge of the mark instead of leaving it behind the eye.
    b.hitIndex++;b.target.copy(p.pos).addScaledVector(p.velocity,1.38);
    b.target.x+=p.velocity.z*.36;b.target.z-=p.velocity.x*.36;
    b.target.y=world.groundHeight(b.target.x,b.target.z);
    fx.nova(b.target,.86);
   }
   if(t>=1.14&&b.hitIndex===1){
    b.hitIndex++;fx.pillar(b.target,0,1.70,.27);fx.holyImpact(b.target,3.6);
   }
   // Light-speed passes: each crosses the runner's path where he is about to be. Thin traces only; see consort-lightspeed.js.
   while(b.hitIndex>=2&&b.lightPasses<NOVA_PASS_TIMES.length&&t>=NOVA_PASS_TIMES[b.lightPasses]){
    const index=b.lightPasses++;
    const heading=p.velocity.lengthSq()>.25?p.velocity.clone().setY(0).normalize():new T.Vector3(-Math.sin(p.yaw),0,-Math.cos(p.yaw));
    const runner=p.pos.clone().setY(world.groundHeight(p.pos.x,p.pos.z));
    const pass=lightPass(index,runner,heading,b.pos);
    fx.lightTrace(pass.center,pass.direction,index+1,recordedControls?world.groundHeight:world.clothGroundHeight);playSound('slash',.2);
   }
   if(t>=4.86&&b.hitIndex===2){
    b.hitIndex++;fx.greatColumn(b.target,10);fx.holyImpact(b.target,14);
    // Primary clip 71.40-71.85: for about half a second the whole floor around the runner is white-gold.
    // The warm reflected pulse briefly follows the strike before fading off the rubble.
    fx.arenaFlash(b.target,.15,.32,.51);
    hazards.push({pos:b.target.clone(),radius:10,delay:0,life:1,damage:270,reason:'nova'});
    // 75.6 s central flash, then isolated descending shafts still visible
    // at 77.1-78.0 s. Keep their actual damage and width in world space.
    for(let i=0;i<36;i+=6){
     const angle=i*2.39996,r=(.26+.74*Math.sqrt(i/35))*14;
     const pos=b.target.clone().add(new T.Vector3(Math.sin(angle)*r,0,Math.cos(angle)*r));
     const delay=.09+i/35*1.86+(i%3)*.045,width=i%5===0?2.75:1.25;
     holyShaft(pos,delay,width,null,false,1.65,{hold:.55});
    }
    // Restore every omitted inner-footprint shaft as visible light, keeping the existing six damage volumes.
    for(let i=0;i<36;i++){
     if(i%6===0)continue;
     const angle=i*2.39996,r=(.26+.74*Math.sqrt(i/35))*14;
     secondaryHolyShaft(b.target.clone().add(new T.Vector3(Math.sin(angle)*r,0,Math.cos(angle)*r)),.09+i/35*1.86+(i%3)*.045,i%5===0?1.12:.78,i%5===0?.76:.62,1.65,.50);
    }
    // The source's scattered far needles cover much more than the immediate target circle.
    outerHolyField(b.target,b.yaw,[[22,21,.61,.54],[32,26,.52,.47],[38,19,.40,.34]],.30,{rowGap:.50,slotGap:.12,batchGap:.34,duration:1.55,hold:.45});
    // In the upward 77ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ78 s view isolated shafts remain on both sides of
    // the caster. Keep an open pocket underneath him when the player closes.
    const axis=b.pos.clone().sub(b.target).setY(0);
    if(axis.lengthSq()<.01)axis.set(Math.sin(b.yaw),0,Math.cos(b.yaw));
    axis.normalize();const side=new T.Vector3(axis.z,0,-axis.x);
    for(const i of [0,3,5,6]){
      const flank=i%2?1:-1,row=Math.floor(i/2);
      const pos=b.pos.clone().addScaledVector(axis,(row-1)*2.8)
        .addScaledVector(side,flank*(3.4+(row%2)*1.5));
      holyShaft(pos,.82+row*.37+(flank>0?.12:0),row===2?1.75:1.12,null,false,1.65,{hold:.55});
    }
    for(const i of [1,2,4,7]){
      const flank=i%2?1:-1,row=Math.floor(i/2);
      const pos=b.pos.clone().addScaledVector(axis,(row-1)*2.8).addScaledVector(side,flank*(3.4+(row%2)*1.5));
      secondaryHolyShaft(pos,.82+row*.37+(flank>0?.12:0),.85,.65,1.65,.50);
    }
    
   }
 }
 if(b.action==='lightspeed'&&b.meteorFollowup===3){
   const times=lightContacts('lightspeed',true),phantoms=times.length-1;
   // The fourth pale cut clears as the red-caped fighter drops into it.
   // His landing slash and the following ground burst have separate contacts.
   if(t<ROCK_RETURN.depart)b.pos.y=5;
   else if(b.hitIndex<=phantoms){
     b.flightStart??=b.pos.clone();
     if(t<ROCK_RETURN.arrive){b.target.copy(p.pos);b.target.y=0;}
     const approach=T.MathUtils.smoothstep(t,ROCK_RETURN.depart,ROCK_RETURN.arrive);
     b.pos.lerpVectors(b.flightStart,illusionFoot(b.target,b.yaw),approach);
     b.pos.y=5-3.45*approach-1.55*T.MathUtils.smoothstep(t,ROCK_RETURN.arrive,ROCK_RETURN.land);
   }
   const phantomLead=ROCK_RETURN.lead;
   if(b.hitIndex<phantoms&&t>=times[b.hitIndex]-phantomLead){
     const i=b.hitIndex++,end=illusionFoot(b.target,b.yaw);
     const towardCaster=b.from.clone().sub(end).setY(0);
     const range=towardCaster.length();
     const setback=Math.min(range*.72,[10.6,9.3,8.2,6.0][i]);
     const target=end.addScaledVector(towardCaster.normalize(),setback);
     target.y=world.groundHeight(target.x,target.z);
     const start=target.clone().addScaledVector(towardCaster,2.0);
     start.y+=3.4+.3*(i%2);
     fx.afterimage(target,b.yaw,boss,'down',start,i);
     hazards.push({...illusionVolume(target,b.yaw,false),fracture:i,contactPoint:target.clone(),delay:phantomLead,life:.19,damage:60,reason:'afterimage'});
     b.target.copy(p.pos);b.target.y=0;
   }
   if(b.hitIndex===phantoms&&t>=ROCK_RETURN.land){
     b.hitIndex++;b.pos.copy(illusionFoot(b.target,b.yaw));b.pos.y=0;
     const foot=b.pos.clone().setY(world.groundHeight(b.pos.x,b.pos.z));
     const sword=illusionVolume(b.pos,b.yaw,false,true);
     const strike=sword.pos.clone().add(new T.Vector3(Math.cos(b.yaw)*1.22,0,-Math.sin(b.yaw)*1.22));
     strike.y=world.groundHeight(strike.x,strike.z);
     groundFracture(foot,9,1.38);b.plungeStrike=strike;fx.impactDust(strike,2.2,b.yaw,true);
     if(faces(sword.pos,sword.yaw,p.pos,sword.arc,.3))damagePlayer(225,sword.radius,false,{origin:sword.pos,reason:'light-body'});
   }
   if(b.plungeStrike&&t>=ROCK_RETURN.plant){
     const strike=b.plungeStrike;b.plungeStrike=null;b.plungeSparks=strike;
     groundFracture(strike,10,1.61);fx.debris(strike,4.4);fx.impactDust(strike,5.8,b.yaw,true);
     fx.holyImpact(strike,3.45,true,.16);fx.pillar(strike,.16,.86,.78);
   }
   if(b.plungeSparks&&t>=ROCK_RETURN.plant+.19){fx.burst(b.plungeSparks,'gold',38);b.plungeSparks=null;}
   if(b.hitIndex===times.length&&t>=times.at(-1)){
     b.hitIndex++;groundFracture(b.pos,11,1.45);addHoly(b.pos,b.yaw,'quake',0,false);fx.debris(b.pos,5);
   }
 }else if(b.action==='lightspeed'||b.action==='dash'){
   const dash=b.action==='dash',times=lightContacts(b.action,b.meteorFollowup===3),land=times.at(-1);
   if(!dash){b.pos.y=b.meteorFollowup!==3&&t<.45?5*T.MathUtils.smoothstep(t,0,.45):t<land-.2?5:Math.max(0,5*(land-t)/.2);if(b.hitIndex===times.length-1&&t<land-.2){b.target.copy(p.pos);b.target.y=0;}}
   if(b.hitIndex<times.length&&t>=times[b.hitIndex]){
     const last=b.hitIndex===times.length-1;b.hitIndex++;const pos=illusionFoot(b.target,b.yaw);
     if(last){b.pos.copy(pos);if(!dash)groundFracture(pos,10,1.42);fx.burst(pos,'gold',55);const sword=illusionVolume(pos,b.yaw,dash,true);if(faces(sword.pos,sword.yaw,p.pos,sword.arc,.3))damagePlayer(225,sword.radius,false,{origin:sword.pos,reason:'light-body'});addHoly(pos,b.yaw,dash?'cross':'quake');}
     else{fx.afterimage(pos,b.yaw,boss,dash?'side':'down',null,b.hitIndex-1);hazards.push({...illusionVolume(pos,b.yaw,dash),fracture:dash?null:b.hitIndex-1,contactPoint:pos.clone(),delay:dash?.30:.13,life:.2,damage:60,reason:'afterimage'});b.target.copy(p.pos);b.target.y=0;}
   }
 }
 if(b.action==='meteor'){
   const m=METEOR_SEQUENCE;
   // Keep tracking the visible rising target; release only when it actually disappears.
   if(t>=m.risen&&t<m.return&&state.locked){releaseCameraLock();combatEvent('lock-lost','meteor-departure');}
   if(t>=m.tracking&&t<=m.targetLock&&!b.meteorCancelled&&meteorAirTarget(p.pos.y)){b.meteorCancelled=true;combatEvent('meteor-cancel','airborne-target');}
   if(t>=m.targetLock&&!b.meteorTargetCommitted){
     b.meteorTargetCommitted=true;b.target.copy(p.pos);b.target.y=0;
     if(b.meteorCancelled){
       // Land on the approaching side of the airborne target. An exact
       // overlap pushed the player to an arbitrary side during their thrust.
       const approach=b.from.clone().sub(b.target).setY(0);
       if(approach.lengthSq()<.001)approach.set(Math.sin(b.yaw),0,Math.cos(b.yaw));
       b.target.addScaledVector(approach.normalize(),.54);
     }else combatEvent('meteor-target','grounded-target');
   }
   const landed=m.contact+(b.meteorCancelled?.31:0);
   if(t<m.takeoff)b.pos.y=0;
   else if(t<m.risen){
     // The flash first opens around the still-visible crouched body; only
     // then does the caster shoot out of view.
     b.pos.y=.09*T.MathUtils.smoothstep(t,m.takeoff+.24,m.takeoff+.35)+27.91*T.MathUtils.smoothstep(t,m.takeoff+.35,m.risen);
   }else if(t<m.return)b.pos.y=28;
   else if(t<landed){
     const f=T.MathUtils.clamp((t-m.return)/(landed-m.return),0,1);
     b.pos.lerpVectors(b.from,b.target,T.MathUtils.smootherstep(f,0,.76));
     b.pos.y=28*Math.pow(1-f,b.meteorCancelled?2.85:1.74);
   }
   if(t>=m.plant&&!b.meteorCharge){b.meteorCharge=true;playSound('holy');fx.crossRays(b.pos,b.yaw);fx.burst(b.pos.clone().add(new T.Vector3(0,.3,0)),'gold',44);fx.pillar(b.pos,.15);combatEvent('meteor-charge','planted-departure');}
   const flareAt=m.takeoff+.3733;
   if(t>=flareAt&&t-dt<flareAt){
     const foot=b.from.clone().setY(world.groundHeight(b.from.x,b.from.z));
     fx.arenaFlash(foot,.10,.136,.70);fx.holyImpact(foot,6.5,true);fx.meteorEjecta(foot);groundFracture(foot,9,1.58);
     fx.pillar(foot,0,2.10,1.14,null,false,{hold:.49,coreGain:2.35});
     for(const [side,forward,delay,width] of [[-.51,.43,.025,.23],[.65,-.34,.06,.18],[-1.7,.9,.09,.33],[1.4,-1.1,.13,.28],[-.65,-2.3,.18,.19],[2.53,.79,.19,.14],[-2.65,-.38,.23,.12],[.28,-1.58,.26,.11]]){
       const offset=new T.Vector3(side,0,forward).applyAxisAngle(new T.Vector3(0,1,0),b.yaw);
       secondaryHolyShaft(foot.clone().add(offset),delay,width,.54,.58,.10);
     }
   }
   if(t>=landed&&b.hitIndex===0){
     b.hitIndex++;b.pos.copy(b.target);
     if(b.meteorCancelled){playSound('holy',.35);fx.burst(b.pos,'gold',20);}
     else{playSound('stone');fx.holyImpact(b.pos,16);for(let i=0;i<40;i++){const a=i*2.4,r=Math.sqrt(i/40)*16;fx.pillar(b.pos.clone().add(new T.Vector3(Math.sin(a)*r,0,Math.cos(a)*r)),i%4*.07);}fx.burst(b.pos,'gold',90);fx.debris(b.pos,9);hazards.push({pos:b.pos.clone(),radius:10,delay:0,life:.9,damage:440,reason:'meteor'});}
   }
 }
 if(t>=b.duration&&state.stage==='combat'){if(b.action==='rocks'&&b.meteorFollowup===2){beginBoss();return;}const recovery=b.action==='sideDash'?.3:b.action==='lightspeed'&&b.meteorFollowup!==3?.15:.55;b.action='recover';b.elapsed=0;b.duration=recovery;if(b.lastAttack!=='nova')b.pos.y=0;}
}
function groundFracture(pos,index,spread){
 const floor=pos.clone().setY(world.groundHeight(pos.x,pos.z));
 fx.rockImpact(floor,index,spread);
}
function effectsStep(dt){
 for(const rock of projectiles){if(!rock.launched||rock.done)continue;rock.age+=dt;const f=Math.min(1,rock.age/rock.flight);rock.pos.lerpVectors(rock.from,rock.target,f);rock.pos.y+=Math.sin(f*Math.PI)*1.2;if(f>=1){rock.done=true;playSound('stone',.4);fx.burst(rock.target,'purple',30);fx.debris(rock.target,2);fx.rockImpact(rock.target.clone().setY(world.groundHeight(rock.target.x,rock.target.z)),rock.i,1.24);spawnRockBurst(scene,rock.target.clone().setY(world.groundHeight(rock.target.x,rock.target.z)),rock.i,fx.cloudTexture);if(!airborne())damagePlayer(160,1.9,false,{origin:rock.target,reason:'gravity-rock'});combatEvent('rock-impact',String(rock.i));}}
 for(let i=hazards.length-1;i>=0;i--){const h=hazards[i];if(!h)continue;h.delay-=dt;if(h.delay>0)continue;if(h.fracture!=null){groundFracture(h.contactPoint,h.fracture+4,.56+.06*h.fracture);h.fracture=null;}h.life-=dt;if(h.wave){h.age+=dt;const gap=Math.abs(Math.hypot(p.pos.x-h.pos.x,p.pos.z-h.pos.z)-(h.startRadius+h.age*22));if(!h.hit&&gap<.65&&!airborne())h.hit=damagePlayer(h.damage,100,false,{origin:h.pos,reason:h.reason});}else if(!h.hit&&!(airborne()&&h.reason==='holy')&&(h.arc===undefined||faces(h.pos,h.yaw,p.pos,h.arc,.3)))h.hit=damagePlayer(h.damage,h.radius,false,{origin:h.pos,reason:h.reason});if(h.life<=0)hazards.splice(i,1);}
}
const contactNormal=new T.Vector3(),contactUp=new T.Vector3(0,1,0);
function resolveBossContact(dt,oldX,oldZ,wasSolid){
 if(state.grabbed||b.pos.y>=p.pos.y+1||bossHidden())return;
 const braced=state.phase===1&&b.action==='rocks'&&b.elapsed>=1.5&&b.elapsed<=ROCK_SEQUENCE.liftOff;
 const radius=braced?1.32:bossClearance;
 const dx=p.pos.x-b.pos.x,dz=p.pos.z-b.pos.z;
 const outward=contactNormal;
 const crossing=wasSolid&&b.action!=='dash'&&b.action!=='lightspeed'&&crossingNormal(oldX,oldZ,dx,dz,radius,outward);
 if(!crossing){
   if(dx*dx+dz*dz>=radius*radius)return;
   outward.set(dx,0,dz);
   if(outward.lengthSq()<.000001)outward.set(oldX,0,oldZ);
   if(outward.lengthSq()<.000001)outward.set(-Math.sin(b.yaw),0,-Math.cos(b.yaw));
   outward.normalize();
 }
 const strike=MOVES[b.action]?.contacts[b.hitIndex];
 if(state.phase===1&&p.action==='roll'&&(braced||strike?.hand&&!strike.jump)&&p.rollDir.dot(outward)<-.10){
   // A roll into a stepping swordsman's flank follows its contour. Preserve
   // the chosen side for this roll while the joystick-relative view turns.
   const tangent=p.rollDir.x*outward.z-p.rollDir.z*outward.x;
   if(!p.rollSide)p.rollSide=Math.abs(tangent)>.65?Math.sign(tangent):braced?-1:-Math.sign(strike.hand);
   const rollSpeed=6.7*Math.sin(Math.PI*Math.min(1,p.elapsed/p.duration));
   const missing=Math.max(0,1-p.rollSide*tangent);
   outward.applyAxisAngle(contactUp,p.rollSide*rollSpeed*dt*missing/radius);
 }
 p.pos.x=b.pos.x+outward.x*radius;p.pos.z=b.pos.z+outward.z*radius;
}
const previousPlayerStep=new T.Vector3(),previousBossStep=new T.Vector3();
const currentPlayerStep=new T.Vector3(),currentBossStep=new T.Vector3();
let previousWalkStage=null,previousPlayerYaw=0;
function drawWalkingFrame(dt,now){
  if(recordedControls||previousWalkStage!==state.stage||state.stage!=='combat'||p.flight||
     state.grabbed||cameraSnap||!['walk','run','idle'].includes(p.action)||
     p.pos.distanceToSquared(previousPlayerStep)>.16){render(dt);return;}
  // Combat retains its 120 Hz clock. Present the most recent pair of completed
  // walking poses at the fractional display time, including the follow camera.
  const blend=T.MathUtils.clamp((now-inputTimeline.cursor)/inputTimeline.stepMs,0,1);
  currentPlayerStep.copy(p.pos);currentBossStep.copy(b.pos);
  const yaw=p.yaw;
  p.pos.lerpVectors(previousPlayerStep,currentPlayerStep,blend);
  if(b.pos.distanceToSquared(previousBossStep)<.36)b.pos.lerpVectors(previousBossStep,currentBossStep,blend);
  const turn=Math.atan2(Math.sin(yaw-previousPlayerYaw),Math.cos(yaw-previousPlayerYaw));
  if(Math.abs(turn)<.65)p.yaw=previousPlayerYaw+blend*turn;
  try{render(dt);}finally{p.pos.copy(currentPlayerStep);b.pos.copy(currentBossStep);p.yaw=yaw;}
}
function step(dt,present=true){if(!loaded||(!recordedControls&&(state.help||state.arenaMap)))return;
 if(!recordedControls&&present){previousPlayerStep.copy(p.pos);previousBossStep.copy(b.pos);previousPlayerYaw=p.yaw;previousWalkStage=state.stage;}
 fx.tick(dt,present);state.time+=dt;state.stageTime+=dt;p.invuln=Math.max(0,p.invuln-dt);p.hitCooldown=Math.max(0,p.hitCooldown-dt);p.staminaDelay=Math.max(0,(p.staminaDelay||0)-dt);if(!p.staminaDelay&&p.action!=='run')state.stamina=Math.min(100,state.stamina+dt*(keys.has('KeyZ')?18:(p.action==='idle'||p.action==='walk'?32:8)));state.fade=0;
 if(!recordedControls&&keys.has('ArrowDown')&&!state.menu&&p.itemCycleStart!=null&&state.time-p.itemCycleStart>.55){state.item=0;p.itemCycleStart=null;}
 if(liveAxes.lookX||liveAxes.lookY)turnView(liveAxes.lookX*2.6*dt,liveAxes.lookY*1.85*dt);
 if(!state.locked)cameraYaw+=((keys.has('KeyJ')?1:0)-(keys.has('KeyL')?1:0))*dt*1.65;if(!state.locked)cameraPitch=T.MathUtils.clamp(cameraPitch+((keys.has('KeyI')?1:0)-(keys.has('KeyK')?1:0))*dt*2.2,-.65,.9);
 if(state.stage==='entry'){if(state.stageTime<3.45&&!state.menu){if(state.stageTime<2.6)p.pos.z=Math.max(-1,p.pos.z-dt*.8);p.yaw=lerpAngle(p.yaw,state.stageTime>2.6?Math.PI:0,1-Math.exp(-dt*10));}if(state.stageTime>3.45)state.fade=.22*T.MathUtils.smoothstep(state.stageTime,3.45,3.92);if(state.stageTime>=Math.min(6.15,state.entrySkipAt??Infinity)){state.entrySkipAt=null;transition('combat');state.bossVisible=true;state.locked=!!state.pendingLock;state.pendingLock=false;state.menu=false;world.mist.visible=false;p.pos.set(0,0,-2);p.yaw=0;p.action='idle';b.pos.copy(gateSpawn);b.action='wait';b.elapsed=0;b.duration=.8;beat('objective','Promised Consort Radahn');}}
 if(state.stage==='phase'){state.fade=0;if(state.stageTime>(state.phaseSkipAt??PHASE_CINEMATIC_DURATION+PHASE_CINEMATIC_LEAD)){state.phaseSkipAt=null;state.phase=2;transition('combat');state.revealFrom=state.time;cameraSnap=true;p.pos.set(world.arena.cx,0,world.arena.cz+3);b.pos.copy(p.pos).add(new T.Vector3(0,0,-9.4));b.yaw=facing(b.pos,p.pos);b.action='wait';b.elapsed=0;b.duration=2.1;b.move=0;b.meteorFollowup=0;b.lastAttack=null;b.parries=0;b.stagger=0;b.critical=false;b.criticalReadyAt=0;b.pos.y=0;p.action='idle';cameraYaw=0;beat('objective','Radahn, Consort of Miquella');}}
 if(state.stage==='dying'){
   b.pos.y=0;
   const pulse=Math.floor((state.stageTime-.86)/.23);
   if(pulse>=0&&pulse<18&&pulse!==(b.defeatAshPulse??-1)){
     b.defeatAshPulse=pulse;
     fx.defeatAsh(b.pos.clone().setY(world.groundHeight(b.pos.x,b.pos.z)),b.yaw,pulse);
   }
   if(state.stageTime>9.1){transition('victory');state.victory=true;state.pendingRunes=500000;state.bossVisible=false;state.locked=false;state.lockScreen=null;state.banner='GOD SLAIN';state.reward=true;state.rewardAcknowledged=false;beat('prompt','GOD SLAIN');beat('prompt','Remembrance of a God and a Lord');}}
 if(state.stage==='victory'&&state.stageTime>2.6)state.banner='';
 if(state.stage==='victory'&&state.stageTime>=3.4&&state.pendingRunes){state.runeRewardValue=state.pendingRunes;state.runes+=state.pendingRunes;state.pendingRunes=0;state.runeRewardAt=state.time;}
 if(state.stage==='victory'&&state.stageTime>7.5)state.reward=false;
 if(state.stage==='dead'){b.speed=0;b.elapsed+=dt;if(b.elapsed>=b.duration){b.action='wait';b.elapsed=0;b.duration=99;}if(state.stageTime>2.65&&!state.deathDust){state.deathDust=true;fx.deathAsh(p.pos);}state.banner=state.stageTime>1.8&&state.stageTime<6.4?'YOU DIED':'';state.fade=T.MathUtils.clamp((state.stageTime-6.2)/1.8,0,1);if(state.stageTime>=8)transition('loading');}
 if(state.stage==='loading'){state.fade=1;if(state.stageTime>=3.5)respawn();}
 if(state.stage==='combat'){
   if(b.phasePending!=null&&state.time-b.phasePending>=PHASE_PENDING_LIMIT)closePhaseExchange(false);
   if(b.phaseFade!=null){
     const age=state.time-b.phaseFade;state.fade=Math.max(state.fade,T.MathUtils.smoothstep(age,0,PHASE_FADE_OUT-.04));
     if(age>=PHASE_FADE_OUT)enterPhaseCinematic();
   }
   // Primary 55.55-56.0: the second phase opens from black behind the player.
   if(state.revealFrom!=null){
     const age=state.time-state.revealFrom;
     if(age<PHASE_REVEAL)state.fade=Math.max(state.fade,1-T.MathUtils.smoothstep(age,.03,PHASE_REVEAL));else state.revealFrom=null;
   }
 }else if(state.stage!=='phase'){b.phasePending=null;b.phaseFade=null;state.revealFrom=null;}
 state.locationTitle=Math.max(0,(state.locationTitle||0)-dt);
 const oldBodyX=p.pos.x-b.pos.x,oldBodyZ=p.pos.z-b.pos.z;
 const wasSolid=b.pos.y<p.pos.y+1&&!bossHidden();
 const canMove=!state.menu&&!state.grabbed&&['mist','return','combat','victory','dying'].includes(state.stage);
 if(canMove){const mv=moveVector();if(p.flight){const f=p.flight;f.elapsed+=dt;const desired=mv.clone().multiplyScalar(3.15);f.velocity.lerp(desired,Math.min(1,dt*2.5));p.pos.addScaledVector(f.velocity,dt);p.pos.y=Math.sin(T.MathUtils.clamp((f.elapsed-(f.windup||0))/(f.duration-(f.windup||0)),0,1)*Math.PI)*(f.height||.95);if(!recordedControls && p.action==='jump' && p.buffer?.onTakeoff && f.elapsed>=f.windup){
  const next=p.buffer;p.buffer=null;consumeBuffered(next);
}
if(f.elapsed>=f.duration){p.flight=null;p.pos.y=0;}}const free=['idle','walk','run'].includes(p.action);if(free&&p.pendingWeapon!=null){state.weapon=p.pendingWeapon;p.pendingWeapon=null;if(!recordedControls)refreshSkill();}if(free&&!p.flight){if(mv.lengthSq()){const sprint=keys.has('KeyE')&&eDown>=0&&state.time-eDown>=SPRINT_HOLD&&state.stamina>4&&!p.sprintExhausted;const speed=state.crouched||keys.has('Walk')?1.25:sprint?5.6:3.15;p.velocity.lerp(mv.clone().multiplyScalar(speed),1-Math.exp(-dt*24));p.pos.addScaledVector(p.velocity,dt);p.action=sprint?'run':'walk';if(sprint){state.stamina=Math.max(0,state.stamina-dt*SPRINT_DRAIN_PER_SECOND);p.staminaDelay=.5;if(state.stamina<=4)p.sprintExhausted=true;}if(!state.locked)p.yaw=lerpAngle(p.yaw,Math.atan2(-mv.x,-mv.z),Math.min(1,dt*12));}else{p.velocity.multiplyScalar(Math.exp(-dt*28));p.pos.addScaledVector(p.velocity,dt);p.action='idle';}}
 if(!free){
   const winding=!recordedControls&&p.action==='heavy'&&!p.guardCounter&&!p.airStrike&&keys.has('KeyV');
   const hold=winding?Math.min(Math.max(0,p.elapsed+dt-.25),dt,Math.max(0,.65-(p.chargeSeconds||0))):0;
   if(hold>0)p.chargeSeconds=(p.chargeSeconds||0)+hold;
   p.elapsed+=dt-hold;p.velocity.multiplyScalar(Math.exp(-dt*24));
 if(!recordedControls&&p.action==='light'&&!p.thrustCommitted){
   const contact=p.runningThrust?RUNNING_THRUST.contact:.26;
   const remaining=Math.max(0,contact-(p.elapsed-dt));
   const heading=state.locked?facing(p.pos,b.pos):p.thrustHeading;
   p.yaw=turnThrust(p.yaw,heading,9*Math.min(dt,remaining));
 }
 if(['hurt','guard-recoil'].includes(p.action))p.pos.addScaledVector(p.recoil,dt*Math.max(0,1-p.elapsed/p.duration));if((p.action==='light'||p.action==='heavy')&&!p.flight){
   if(recordedControls){
     if(p.elapsed<.3&&distance()>1.9)p.pos.add(new T.Vector3(-Math.sin(p.yaw),0,-Math.cos(p.yaw)).multiplyScalar(dt*1.6));
   }else if(!p.airStrike){
     const contact=p.action==='heavy'?.55:p.runningThrust?RUNNING_THRUST.contact:.26;
     const windup=p.action==='heavy'?.36:p.runningThrust?contact-.26:.09;
     let travel=thrustTravel(p.elapsed,contact,windup,p.strikeApproach)-thrustTravel(p.elapsed-dt,contact,windup,p.strikeApproach);
     if(travel>0){
       if(state.stage==='combat'&&faces(p.pos,p.yaw,b.pos,.9))travel=Math.min(travel,Math.max(0,distance()-1.9));
       p.pos.x-=Math.sin(p.yaw)*travel;p.pos.z-=Math.cos(p.yaw)*travel;
     }
   }
 }if(p.action==='backstep')p.pos.addScaledVector(p.rollDir,dt*6.2*Math.sin(Math.PI*p.elapsed/p.duration));if(p.action==='roll')p.pos.addScaledVector(p.rollDir,dt*6.7*Math.sin(Math.PI*p.elapsed/p.duration));
 if((p.action==='light'||p.action==='heavy')&&!p.attackDone){
   const contact=p.action==='heavy'?.55:p.runningThrust?RUNNING_THRUST.contact:.26;
   if(!p.thrustSoundPlayed&&p.elapsed>=contact-.10){
     p.thrustSoundPlayed=true;
     playSound('thrust',p.action==='heavy'?1:.72);
   }
   if(p.elapsed>=contact){
     p.thrustCommitted=true;
     const activeTime=(p.action==='heavy'||p.runningThrust)&&!p.airStrike ? .12 : .08;
     const miss=state.stage==='combat'?strikeMissReason((p.elapsed-contact)/activeTime):'outside-combat';
     if(!miss){p.attackDone=true;damageBoss();}
     else if(p.elapsed>=contact+activeTime){
       p.attackDone=true;
       if(miss!=='outside-combat')combatEvent('player-miss',miss);
     }
   }
 }
 if(p.action==='cast'&&!p.attackDone&&p.elapsed>=2.15){p.attackDone=true;state.flameUntil=state.time+30;combatEvent('cast','flame-buff');fx.burst(p.pos.clone().add(new T.Vector3(0,1,0)),'flame',35);}if(p.action==='drink'&&!p.attackDone&&p.elapsed>.9&&(recordedControls||p.drinkItem!==1?state.flasks:state.physick)>0){p.attackDone=true;const physick=!recordedControls&&p.drinkItem===1;if(physick)state.physick--;else state.flasks--;const hpBefore=state.hp;state.hp=Math.min(state.maxHp,state.hp+(physick?state.maxHp*.5:CRIMSON_FLASK_HEAL));combatEvent('heal',physick?'physick-crimson-crystal-tear':'crimson-flask-plus12',{hpBefore,hpAfter:state.hp,restored:state.hp-hpBefore,flasks:state.flasks});fx.burst(p.pos.clone().add(new T.Vector3(0,1,0)),'gold',15);}if(p.action==='critical')advanceRiposte();if(p.elapsed>=p.duration||(recordedControls?(p.action==='roll'&&p.buffer?.name==='roll'&&p.elapsed>=.58):canLeaveForDodge(p,state.stamina,state.time))){p.riposte=null;p.action='idle';if(p.buffer){const next=p.buffer;p.buffer=null;consumeBuffered(next);}}}
 }
 if(state.stage==='combat'){
   constrainCombatArena(p.pos);
   if(state.bloodflame>0){state.bloodflame=Math.max(0,state.bloodflame-dt);state.bleed+=dt*BLOODFLAME.buildup/BLOODFLAME.duration;}else state.bleed=Math.max(0,state.bleed-dt*BLOODFLAME.decay);
   if(state.bleed>=BLOODFLAME.threshold){const hpBefore=state.hp;state.bleed=0;state.bloodflame=0;state.hp=Math.max(0,state.hp-state.maxHp*BLOODFLAME.procFraction);fx.burst(p.pos.clone().add(new T.Vector3(0,1,0)),'blood',32);combatEvent('bleed','bloodflame',{hpBefore,hpAfter:state.hp,damage:hpBefore-state.hp});if(state.hp<=0){defeat('bloodflame-bleed');return;}}
   const before=b.pos.clone();bossStep(dt);
   if(state.phase===2||b.move>1||b.move===1&&b.elapsed>=RUSH_SEQUENCE.openingContact)constrainCombatArena(b.pos,bossClearance);
   effectsStep(dt);b.speed=Math.hypot(b.pos.x-before.x,b.pos.z-before.z)/dt;
   if(state.locked){
     const crossing=state.phase===1&&b.action==='rocks'&&b.elapsed>1.6&&b.elapsed<ROCK_SEQUENCE.hover+.35;
     const bearing=facing(p.pos,b.pos);
     if(recordedControls)cameraYaw=lerpAngle(cameraYaw,bearing,Math.min(1,dt*(crossing?32:3.5)));
     else cameraYaw=viewRig.liveLockYaw(cameraYaw,bearing,dt,crossing);
     const contact=p.runningThrust?RUNNING_THRUST.contact:.26;
     if(recordedControls||p.action!=='light'||p.elapsed>contact+.12)p.yaw=lerpAngle(p.yaw,bearing,Math.min(1,dt*12));
   }resolveBossContact(dt,oldBodyX,oldBodyZ,wasSolid);}
 // The body remains solid through its visible defeat animation. Source
 // 148.6-150 s: held forward input cannot walk through the dying boss before
 // the player turns away. Collision ends with the existing dissolve state.
 if(state.stage==='dying'&&state.stageTime<4.72)resolveBossContact(dt,oldBodyX,oldBodyZ,wasSolid);
 if(canMove&&(state.stage==='mist'||state.stage==='return')){
   constrainEntrance(p.pos);
   p.pos.y=world.entranceHeight(p.pos.z)+(p.flight?p.pos.y:0);
 }else if(state.stage==='combat'||state.stage==='dying'||state.stage==='victory'){
   constrainCombatArena(p.pos);
   if(!recordedControls)world.constrainWalk(p.pos);
 }
 state.prompt=['mist','return'].includes(state.stage)&&p.pos.distanceTo(new T.Vector3(0,0,2))<3?mistPrompt():'';
}
function render(dt){let nearMask=0;renderedFrames++;lastRenderedAt=performance.now();const bossDissolved=state.stage==='dying'&&state.stageTime>=4.95;renderer.info.reset();if(['walk','run'].includes(p.action)&&!p.flight){const travel=p.pos.distanceTo(stepPosition);if(travel<2)stepDistance+=travel;const stride=p.action==='run'?1.65:1.18;if(stepDistance>stride){stepDistance%=stride;playSound('step',p.action==='run'?1:.6);}}else stepDistance=0;stepPosition.copy(p.pos);flameAura.visible=(state.flameUntil>state.time||p.action==='cast'&&p.elapsed>.5)&&!['dead','loading'].includes(state.stage);const freshBuff=T.MathUtils.clamp(((state.flameUntil||0)-state.time-27)/3,0,1),buffGlow=p.action==='cast'?Math.sin(Math.PI*p.elapsed/p.duration):freshBuff;flameAura.material.opacity=.07+.5*buffGlow;flameAura.material.size=.07+.13*buffGlow;if(flameAura.visible){flameAura.position.copy(p.pos);const a=flameGeometry.attributes.position;for(let i=0;i<a.count;i++){const y=(i/96*1.9+state.time*.65)%1.9,angle=i*2.39996+state.time*2+y*2,r=.38+.17*Math.sin(i*3);a.setXYZ(i,Math.sin(angle)*r,y,Math.cos(angle)*r);}a.needsUpdate=true;}for(let i=0;i<flameWisps.length;i++){const o=flameWisps[i];o.visible=flameAura.visible;if(!o.visible)continue;o.material.opacity=.06+.4*buffGlow;const angle=state.time*2+i*2.4;o.position.copy(p.pos).add(new T.Vector3(Math.sin(angle)*.37,1+Math.sin(angle*1.4)*.2,Math.cos(angle)*.37));o.scale.set(.6,1.7,1);if(i===3&&player.hand('Right')){player.hand('Right').getWorldPosition(o.position);o.scale.set(.65,.9,1);}}renderer.toneMappingExposure=['mist','return','entry'].includes(state.stage)?.94:.96;state.victoryFlash=state.victory?T.MathUtils.smoothstep(state.stageTime,2.28,5.22)*(1-T.MathUtils.smoothstep(state.stageTime,11.12,12.56)):0;contacts[0].visible=loaded&&state.stage!=='loading'&&(state.stage!=='dead'||state.stageTime<4.2);contacts[0].position.set(p.pos.x,(['mist','return','entry'].includes(state.stage)?world.entranceHeight(p.pos.z):world.groundHeight(p.pos.x,p.pos.z))+.015,p.pos.z);contacts[1].position.set(b.pos.x,world.groundHeight(b.pos.x,b.pos.z)+.015,b.pos.z);contacts[1].visible=state.bossVisible&&!bossHidden()&&!bossDissolved;if(state.victoryFlash>0){
  fx.impactLight.position.copy(p.pos);fx.impactLight.position.y=world.groundHeight(p.pos.x,p.pos.z)+.68;
  fx.impactLight.intensity=210*state.victoryFlash;
 }
 const entrance=state.stage==='mist'||state.stage==='return'||state.stage==='entry';
 const playerLift=entrance?p.pos.y-(contacts[0].position.y-.015):p.pos.y;
 const bossLift=state.stage==='phase'?0:b.pos.z< -60?b.pos.y-(contacts[1].position.y-.015):b.pos.y;
 updateContactShadow(contacts[0],playerLift,.75);
 updateContactShadow(contacts[1],bossLift,1.65);
 // Primary clip 68.8-71.3: while the light-speed passes cross, the floor around the runner is lit warm gold.
 const passGlow=state.stage==='combat'&&b.action==='nova'?.15*T.MathUtils.smoothstep(b.elapsed,1.75,2.45)*(1-T.MathUtils.smoothstep(b.elapsed,4.80,5.05)):0,ashPower=Math.max(fx.ashFlash||0,.58*state.victoryFlash);
 world.illuminateAsh(passGlow>ashPower?p.pos:fx.impactLight.position,Math.max(ashPower,passGlow));
 const novaWash=b.action==='nova' ? .76 : 1;gradePass.uniforms.flash.value=(fx.wash||0)*novaWash;
if(player.flashResponse){
  player.flashResponse.flashSource.value.copy(fx.impactLight.position);
  player.flashResponse.flashPower.value=T.MathUtils.smoothstep(fx.ashFlash||0,.04,.38);
}
// The gateway light arrives while the cinematic is still in the phase-one combat state.
const cinematicBlock=phaseBlocking(state.stageTime-PHASE_CINEMATIC_LEAD);
const cinematicMark=cinematicBlock.position;
const cinematicGold=state.stage==='phase'&&state.stageTime>=PHASE_CINEMATIC_LEAD+30;
world.tick(state.time,cinematicGold?2:state.phase,state.stage==='phase'?cinematicMark:p.pos,state.stage);
world.mist.material.uniforms.fade.value=state.stage==='entry'?1-T.MathUtils.smoothstep(state.stageTime,.8,1.7):1;let pm=state.stage==='entry'?(state.stageTime<2.6?'walk':'idle'):['walk','run'].includes(p.action)?p.action:p.action==='light'||p.action==='heavy'||p.action==='critical'?'slash':p.action==='roll'?'dive':p.action==='jump'?'jump':state.stage==='dead'?'fall':'idle';const bp=b.stagger>0||b.action==='critical'?'idle':state.stage==='dying'?'fall':['wait','recover','approach'].includes(b.action)&&b.speed>.1?(b.speed>4.2?'run':'walk'):!!MOVES[b.action]?'idle':b.action==='leap'?'idle':state.stage==='dying'?'fall':'idle';
 if(p.action==='backstep')pm='jump';
 if(!recordedControls&&p.action==='jump'&&!p.flight)pm='idle';
 const landingFromHover=state.stage==='combat'&&b.action==='recover'&&b.lastAttack==='nova';
 const landingFromRush=state.stage==='combat'&&state.phase===1&&b.action==='recover'&&b.lastAttack==='leap'&&b.move>1;
 // Lock-on follows the target, but the runner plants their feet in the
 // direction of travel. The attack yaw remains the one used by combat.
 const sprintingAcross = state.locked && (p.action==='run' || (p.flight && keys.has('KeyE')));
 const travel = p.flight ? p.flight.velocity : p.velocity;
 const followupLunge=state.stage==='combat'&&state.phase===1&&b.action==='leap'&&b.move>1&&p.action==='run';
 const sideStep=followupLunge?T.MathUtils.smoothstep(b.elapsed,.025,.22):0;
 let playerViewYaw = p.yaw;
 if(!recordedControls&&p.action==='light'){
   // A locked sprint or roll can end facing across the attack line.
   playerViewYaw=turnThrust(player.root.rotation.y,p.yaw,14*dt);
 }else if(sprintingAcross && travel.lengthSq()>.36){
   const travelYaw=Math.atan2(-travel.x,-travel.z);
   playerViewYaw=lerpAngle(player.root.rotation.y,travelYaw+1.12*sideStep,1-Math.exp(-dt*14));
 }else if(p.action==='roll'){
   const rollHeading=Math.atan2(-p.rollDir.x,-p.rollDir.z);
   playerViewYaw=lerpAngle(player.root.rotation.y,p.rollFacing??rollHeading,1-Math.exp(-dt*26));
 }else if(p.action==='walk'||p.action==='idle'){
   playerViewYaw=lerpAngle(player.root.rotation.y,p.yaw,1-Math.exp(-dt*15));
 }
 // Grounded runners drop the inside shoulder as a gravity volley or airborne lunge passes.
 const evasiveRun=state.stage==='combat'&&p.action==='run'&&(b.action==='leap'||b.action==='rocks'||b.action==='recover'&&b.lastAttack==='rocks');
 const onEntrance=state.stage==='mist'||state.stage==='return';
 const playerGround=onEntrance?(x,z)=>world.entranceHeight(z):recordedControls?world.groundHeight:world.walkGround;
 let riposteContact=null;
 if(p.action==='critical'&&boss.capeMount?.chest){
   const chest=boss.capeMount.chest;
   if(p.riposte?.pin)riposteContact=chest.localToWorld(new T.Vector3().copy(p.riposte.pin));
   else{
     riposteContact=chest.getWorldPosition(new T.Vector3());
     riposteContact.y-=.44;
     riposteContact.addScaledVector(new T.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw)),.52);
   }
 }
 player.tick(dt,{riposteContact,pos:p.pos,rollAxisYaw:p.action==='roll'?Math.atan2(-p.rollDir.x,-p.rollDir.z)-playerViewYaw:0,liveLocomotion:!recordedControls||p.action==='run'||p.action==='walk',evasiveRun,sideStep,twoHanded:!recordedControls&&!!state.twoHanded,twoHandedSide:recordedControls?null:state.grip==='left'?'Left':state.grip==='right'?'Right':null,leftEquipped:recordedControls||state.leftEquipped,groundAt:playerGround,walkSurface:!recordedControls,clothGroundAt:onEntrance?playerGround:world.clothGroundHeight,aim:state.locked&&state.stage==='combat'?Math.atan2(Math.sin(facing(p.pos,b.pos)-playerViewYaw),Math.cos(facing(p.pos,b.pos)-playerViewYaw)):0,groundOffset:(['mist','return'].includes(state.stage)?0:(onEntrance?world.groundHeight:playerGround)(p.pos.x,p.pos.z))+(p.action==='backstep'?.15*Math.sin(Math.PI*p.elapsed/p.duration):0),yaw:playerViewYaw,motion:pm,strike:p.action,airStrike:p.airStrike,runningThrust:p.action==='light'&&!!p.runningThrust,rollingThrust:p.action==='light'&&!!p.rollingThrust,lightChain:p.lightChain||1,lightContinued:!!p.lightContinued,counterThrust:!!p.counterThrust,chainQueued:p.buffer?.name==='light'&&p.buffer.until>=state.time,speed:state.stage==='entry'?.40:p.action==='walk'?(state.locked&&moveVector().dot(new T.Vector3(-Math.sin(p.yaw),0,-Math.cos(p.yaw)))<-.35?-1.55:1.55)*T.MathUtils.clamp(p.velocity.length()/3.15,.25,1.1):p.action==='run'?1.3*T.MathUtils.clamp(p.velocity.length()/5.6,.4,1.1):1,strafe:state.locked && !sprintingAcross?Math.atan2(-moveVector().x,-moveVector().z)-playerViewYaw:0,visible:loaded&&!['loading','phase'].includes(state.stage),dissolve:state.stage==='dead'?T.MathUtils.smoothstep(state.stageTime,2.6,4.2):0,fallProgress:state.stage==='dead'?Math.min(1,state.stageTime/2):0,hitYaw:p.hitYaw||0,recoil:['hurt','guard-recoil'].includes(p.action)?Math.pow(Math.sin(Math.PI*Math.min(1,p.elapsed/p.duration)),.5)*(p.action==='guard-recoil'?.4:1):0,weapon:state.weapon,progress:['light','heavy','critical','roll','backstep','jump'].includes(p.action)&&p.duration?p.elapsed/p.duration:undefined,duration:state.stage==='dead'?2:['light','heavy','critical','roll','backstep','jump'].includes(p.action)?p.duration:undefined,actionId:p.attackCount,roll:p.action==='roll'?p.elapsed/p.duration:0,jump:0,jumpFlight:p.flight?.windup?{elapsed:p.flight.elapsed,duration:p.flight.duration,windup:p.flight.windup}:null,crouched:!!state.crouched&&['idle','walk'].includes(p.action),drink:p.action==='drink'?Math.max(.001,p.elapsed/p.duration):0,critical:p.action==='critical'?Math.max(.001,p.elapsed/p.duration):0,attack:['light','heavy','critical'].includes(p.action)?p.elapsed/p.duration:0,cast:p.action==='cast'?p.elapsed/p.duration:0,castTime:p.action==='cast'?p.elapsed:null,flame:state.flameUntil>state.time,parry:p.action==='parry',parryTime:p.action==='parry'?p.elapsed:null,guard:keys.has('KeyZ')&&['idle','walk'].includes(p.action)},state.time);
 // On a parried knee the pelvis settles toward the attacker while the planted leg carries the weight.
 const kneelTurn=b.action==='critical'?.92:b.action==='recover'&&b.critical?T.MathUtils.smoothstep(b.elapsed,.10,.72)*.92:b.postCritical?.92*(1-T.MathUtils.smoothstep(b.elapsed,0,.58)):0;
 const facingCorrection=T.MathUtils.clamp(Math.atan2(Math.sin(facing(b.pos,p.pos)-b.yaw),Math.cos(facing(b.pos,p.pos)-b.yaw)),-.78,.78);
 const longTail=state.phase===1&&(b.action==='long'&&b.elapsed>7.32||b.action==='recover'&&b.lastAttack==='long'&&b.hitIndex===MOVES.long.contacts.length);
 const tailWeight=longTail?(b.action==='long'?T.MathUtils.smoothstep(b.elapsed,7.32,7.60):1):0;
 const tailAngle=Math.atan2(Math.sin(facing(b.pos,p.pos)-b.yaw),Math.cos(facing(b.pos,p.pos)-b.yaw));
 const castBase=state.phase===1&&b.action==='rocks'?(b.rockLaunchYaw??b.yaw):b.yaw;
 const fightYaw=castBase+kneelTurn*facingCorrection+tailWeight*T.MathUtils.clamp(tailAngle,-1.35,1.35);
 const openingImpactAge=state.phase===1&&state.stage==='combat'?state.time-(b.openingImpactAt??-Infinity):Infinity;
 const rushFollow=T.MathUtils.smootherstep(openingImpactAge,.26,.66)*(1-T.MathUtils.smootherstep(openingImpactAge,1.27,1.72));
 const posedYaw=state.stage==='dying'?lerpAngle(fightYaw,facing(b.pos,p.pos),T.MathUtils.smootherstep(state.stageTime,.14,1.65)):fightYaw-1.00*rushFollow;
 let bossPosePos=b.pos;
 if(b.action==='critical'){
   const w=T.MathUtils.smootherstep(b.elapsed,0,.40)*(1-T.MathUtils.smootherstep(b.elapsed,2.64,3.56));
   const d=distance(),reach=!recordedControls&&p.useDagger?1.93:2.48;
   if(w>0&&d<reach){
     const away=new T.Vector3().subVectors(b.pos,p.pos).setY(0);
     if(away.lengthSq()<.001)away.set(Math.sin(b.criticalYaw),0,Math.cos(b.criticalYaw));
     bossPosePos=b.pos.clone().addScaledVector(away.normalize(),w*(reach-d));
   }
 }
 boss.tick(dt,{targetYaw:b.action==='rocks'?facing(b.pos,p.pos):undefined,groundAt:world.groundHeight,pos:state.stage==='phase'?cinematicMark:bossPosePos,groundOffset:state.stage==='phase'?world.groundHeight(cinematicMark.x,cinematicMark.z):b.pos.z<-60?0:world.groundHeight(b.pos.x,b.pos.z),yaw:state.stage==='phase'?cinematicBlock.yaw:posedYaw,motion:state.stage==='phase'||state.stage==='dying'?'idle':bp,bossAction:state.stage==='dying'?'defeated':state.stage==='phase'?'cinematic':landingFromHover?'nova':landingFromRush?'leap':b.action,bossElapsed:landingFromHover?7.3+b.elapsed:landingFromRush?3.5+b.elapsed:b.elapsed,phaseTime:state.stage==='phase'?state.stageTime:null,holyRecover:state.phase===2&&b.action==='recover'&&!b.stagger&&!b.critical&&b.lastAttack==='promised'&&b.hitIndex===MOVES.promised.contacts.length?b.elapsed:null,crossFromPromised:b.crossFromPromised,crossFromRiposte:b.crossFromRiposte,longTail,crossLow:!!b.crossLow,rushToCross:!!b.rushToCross,phase:state.phase,grabRecovery:state.stage==='combat'&&!state.grabbed&&!b.stagger&&!b.critical&&state.time-b.grabMissAt<2.2&&['grab','stompGrab','recover','approach','cross','ring'].includes(b.action)?{elapsed:state.time-b.grabMissAt,chained:b.grabMissChained}:null,postCritical:state.stage==='combat'&&b.action==='recover'&&b.postCritical?b.elapsed:null,ringRecovery:state.stage==='combat'&&!b.stagger&&!b.critical&&b.action==='recover'&&b.lastAttack==='ring'?b.elapsed:null,openingImpactAge,openingRush:state.phase===1&&b.move===1,groundedRush:state.phase===1&&b.move>1,meteorCancelled:!!b.meteorCancelled,rockFollowup:b.action==='lightspeed'&&b.meteorFollowup===3,deathElapsed:state.stage==='dying'?state.stageTime:null,dissolve:state.stage==='dying'?.035*T.MathUtils.smoothstep(state.stageTime,2.6,4.30)+.965*T.MathUtils.smoothstep(state.stageTime,4.35,4.80):0,fallProgress:state.stage==='dying'?Math.min(1,state.stageTime/1.7):0,speed:b.speed>4.2?1.3:1.25,deflection:b.action==='recover'&&!b.postCritical?b.deflection:null,stagger:b.stagger,critical:b.critical,grab:b.action==='grab'||b.action==='stompGrab'&&b.elapsed>1.8,progress:undefined,duration:1.7,actionId:b.move*10+b.hitIndex,dormant:(!state.bossVisible&&['mist','return','entry'].includes(state.stage))||state.stage==='victory',visible:state.bossVisible&&state.stage!=='victory'&&!bossHidden()&&!bossDissolved,attack:!!MOVES[b.action]?b.elapsed/b.duration:0},state.time);

 fx.followCold(bossImpactPosition);
 playerAura.visible=player.root.visible&&state.stage==='combat'&&(state.life===1||state.flameUntil>state.time);
 if(playerAura.visible)playerAura.userData.update(p.pos,world.groundHeight(p.pos.x,p.pos.z),p.yaw,state.time,p.action==='roll'?1:0,player.cape);
 sealFlare.userData.update(player,p.pos,p.action==='cast'?p.elapsed:null);
 updateGravityVortex(gravityVortex,b.pos,b.yaw,b.elapsed,state.phase===1&&b.move>1,state.stage==='combat'&&b.action==='leap',state.phase===1&&b.move===1);
 const openingFlight=state.stage==='combat'&&state.phase===1&&b.move===1&&b.action==='leap';
 if(openingFlight&&gravityVortex.visible){
   boss.lockBone??=Object.values(boss.bones).find(bone=>bone.name.endsWith('Spine2'));
   boss.lockBone?.getWorldPosition(gravityVortex.position);
 }
 const hovering=state.stage==='combat'&&b.action==='nova';
 const hoverView=hovering||landingFromHover;
 const radiance=hovering?T.MathUtils.smoothstep(b.elapsed,.45,1.6)*(1-T.MathUtils.smoothstep(b.elapsed,6.05,7.3)):0;
 hoverAura.visible=radiance>.001;if(hoverAura.visible){hoverAura.position.copy(b.pos);hoverAura.position.y+=3.14;hoverAura.scale.set(6.6,6.8,1);hoverAura.material.opacity=.10*radiance;}
 const departureGlow=state.stage==='combat'&&b.action==='meteor'?
   T.MathUtils.smoothstep(b.elapsed,METEOR_SEQUENCE.plant-.07,METEOR_SEQUENCE.plant+.32)*
   (1-T.MathUtils.smoothstep(b.elapsed,METEOR_SEQUENCE.takeoff+.41,METEOR_SEQUENCE.takeoff+.58)):0;
 const gravityActive=state.stage==='combat'&&['leap','pull','rocks'].includes(b.action);gravityAura.visible=gravityActive;gravityLight.color.setHex(hovering||departureGlow?0xffdeb2:0xa279ff);gravityLight.intensity=gravityActive?4.2:19*radiance+departureGlow*123;
 if(departureGlow>0){gravityLight.position.copy(b.from);gravityLight.position.x+=Math.sin(b.yaw)*1.58;gravityLight.position.z+=Math.cos(b.yaw)*1.58;gravityLight.position.y+=.92;}
 if(hovering){gravityLight.position.copy(hoverAura.position);gravityLight.position.add(new T.Vector3(-Math.sin(b.yaw)*1.95,.75,-Math.cos(b.yaw)*1.95));}if(gravityActive){gravityAura.position.copy(b.pos).add(new T.Vector3(0,1.8,0));gravityAura.scale.setScalar(b.action==='leap'?7:4.5);gravityAura.material.opacity=((gravityVortex.visible?.16:.30)+Math.sin(state.time*19)*.05)*(b.action==='rocks'?.28:1);gravityLight.position.copy(gravityAura.position);}
 charm.visible=state.marked&&!['dead','loading','return'].includes(state.stage);charm.position.copy(p.pos).add(new T.Vector3(0,2.5,0));charm.rotation.y=state.time*.4;
 const chainedGrab=b.action==='stompGrab',grabTime=chainedGrab?STOMP_GRAB_SEQUENCE:GRAB_SEQUENCE;
 const palmLight=state.stage==='combat'&&(chainedGrab||b.action==='grab')?
    T.MathUtils.smoothstep(b.elapsed,chainedGrab?1.8:.28,chainedGrab?2.45:.95)*
    (1-T.MathUtils.smoothstep(b.elapsed,state.grabbed?grabTime.release:grabTime.contact,state.grabbed?grabTime.release+.35:grabTime.contact+.48)):0;
 for(const {side,o} of grabGlows){
   const hand=boss.hand(side);if(hand&&palmLight>0)hand.getWorldPosition(o.position);
   o.userData.show(state.time,hand?palmLight:0,1.19);
 }
 const retreatActive=state.stage==='combat'&&b.action==='ring';
 const plungeActive=state.stage==='combat'&&b.action==='lightspeed'&&b.meteorFollowup===3;
 const rockCoil=state.stage==='combat'&&state.phase===2&&b.action==='rocks'?
   T.MathUtils.smoothstep(b.elapsed,1.05,1.80)*(1-T.MathUtils.smoothstep(b.elapsed,2.23,2.91)):0;
 const castLift=rockCoil>0?2.1*rockCoil:retreatActive?T.MathUtils.smoothstep(b.elapsed,.67,1.76)*(1-T.MathUtils.smoothstep(b.elapsed,2.38,2.95)):
   plungeActive?-.90*T.MathUtils.smoothstep(b.elapsed,1.72,2.19)*(1-T.MathUtils.smoothstep(b.elapsed,2.55,3.18)):0;
 const mantlePower=retreatActive?T.MathUtils.smoothstep(b.elapsed,.54,1.43)*(1-T.MathUtils.smoothstep(b.elapsed,2.52,2.81)):0;
 retreatMantle.userData.show(boss,b.elapsed,mantlePower);
 const retreatPower=retreatActive?T.MathUtils.smoothstep(b.elapsed,.74,1.44)*(1-T.MathUtils.smoothstep(b.elapsed,1.98,2.8)):0;
 if(retreatPower>0||departureGlow>0){
   if(departureGlow>0)retreatGather.position.copy(gravityLight.position);
   else {retreatGather.position.copy(b.pos);retreatGather.position.y+=2.55;}
 }
 retreatGather.userData.show(state.time,Math.max(retreatPower,departureGlow*.72),departureGlow?3.5:3.1);
 retreatWake.userData.update(retreatActive&&b.elapsed>1.40&&b.elapsed<2.72,state.time,b.pos,b.yaw);
 let veil=null;
 if(retreatActive){
   const flow=T.MathUtils.smoothstep(b.elapsed,1.64,2.17)*(1-T.MathUtils.smoothstep(b.elapsed,2.35,2.68));
   if(flow>0){
     veil=p.pos.clone().sub(b.pos).setY(0).normalize().multiplyScalar(flow*2.8);
     veil.y=-1.82*flow;
   }
 }
 if(state.stage==='combat'&&b.action==='promised'){
   const release=T.MathUtils.smoothstep(b.elapsed,3.58,4.07)*(1-T.MathUtils.smoothstep(b.elapsed,4.91,5.30));
   if(release>0){
     const forward=b.pos.clone().sub(p.pos).setY(0).normalize();
     veil=new T.Vector3(-forward.z,0,forward.x).multiplyScalar(2.7*release);
     veil.addScaledVector(forward,1.9*release);veil.y=.45*release;
   }
 }
 if(plungeActive){
   const surge=T.MathUtils.smoothstep(b.elapsed,1.86,2.22)*(1-T.MathUtils.smoothstep(b.elapsed,2.80,3.32));
   if(surge>0){
     const fore=p.pos.clone().sub(b.pos).setY(0).normalize();
     const flank=new T.Vector3(-fore.z,0,fore.x);
     veil=fore.multiplyScalar(3.6*surge).addScaledVector(flank,.85*surge);veil.y=-1.42*surge;
   }
 }
 // The long outer locks continue past the shoulder as the paired cut opens.
 if(state.stage==='combat'&&state.phase===2&&(b.action==='promised'||b.action==='recover'&&b.lastAttack==='promised')){
   const throwWeight=b.action==='promised'?T.MathUtils.smoothstep(b.elapsed,7.20,7.70):1-T.MathUtils.smoothstep(b.elapsed,.28,.82);
   if(throwWeight>0){
     const fore=p.pos.clone().sub(b.pos).setY(0).normalize();
     veil=new T.Vector3(-fore.z,-.20,fore.x).multiplyScalar(6.0*throwWeight);
     veil.addScaledVector(fore,1.75*throwWeight);
   }
 }
 // Meteor: the mane is blown open into a fan while he bows over the planted blades, and again on the landing bow.
 const meteorActive=state.stage==='combat'&&b.action==='meteor',meteorLanded=METEOR_SEQUENCE.contact+(b.meteorCancelled?.31:0);
 const meteorPlantFan=meteorActive?T.MathUtils.smoothstep(b.elapsed,METEOR_SEQUENCE.plant+.02,METEOR_SEQUENCE.plant+.22)*(1-T.MathUtils.smoothstep(b.elapsed,METEOR_SEQUENCE.takeoff+.46,METEOR_SEQUENCE.takeoff+.62)):0;
 const meteorLandFan=meteorActive&&b.hitIndex>0?T.MathUtils.smoothstep(b.elapsed,meteorLanded+.02,meteorLanded+.20)*(1-T.MathUtils.smoothstep(b.elapsed,8.66,9.26)):0;
 const maneBurst=Math.max(.85*meteorPlantFan,.94*meteorLandFan);
 const castingGlow=b.action==='nova'?T.MathUtils.smoothstep(b.elapsed,.42,1.47)*(1-T.MathUtils.smoothstep(b.elapsed,5.25,6.18)):b.action==='ring'?.84*T.MathUtils.smoothstep(b.elapsed,.22,1.04)*(1-T.MathUtils.smoothstep(b.elapsed,2.18,2.95)):b.action==='lightspeed'?.68*Math.exp(-3*Math.abs(b.elapsed-ROCK_RETURN.land)):0;
 const maneGlow=Math.max(castingGlow,retreatActive?T.MathUtils.smoothstep(b.elapsed,.29,.99)*(1-T.MathUtils.smoothstep(b.elapsed,2.35,2.86)):0,1.7*departureGlow,.95*meteorLandFan);
 if(goldenHair){
  goldenHair.userData.combatLight.value=state.stage==='combat'&&state.phase===2?1:0;
  goldenHair.visible=state.phase===2&&state.bossVisible&&!bossHidden()&&!bossDissolved;
  if(goldenHair.visible&&!fixedResolution){
    const distance=Math.max(1,camera.position.distanceTo(b.pos));
    goldenHair.userData.setProjectedHeight(4*renderer.domElement.height*camera.projectionMatrix.elements[5]/(2*distance));
  }
  const mounted=state.stage==='phase'?T.MathUtils.smootherstep(state.stageTime-PHASE_CINEMATIC_LEAD,72,74):Number(state.phase===2);
  if(boss.redMane?.riderSeated)boss.redMane.riderSeated.value=mounted;
  if(boss.chestBindInverse){
   goldenHair.matrixAutoUpdate=false;
   // The seated crown rises above the red crest. Keep it behind the helm as the torso turns.
   const inPortrait=state.stage==='phase';
   // Tip the torso from the nape: the chest comes against the upper back
   // while the pelvis and the hanging robe settle behind the pauldrons.
   const lean=(inPortrait?-.08:-.235)*mounted,cs=Math.cos(lean),sn=Math.sin(lean);
   riderSeatShift.makeRotationX(lean).setPosition((inPortrait?.75:.64)*mounted,
    (inPortrait?.68:.43)*mounted+4.24*(1-cs)+.34*sn,
    (inPortrait?-.09:.28)*mounted+.34*(1-cs)-4.24*sn);
   goldenHair.matrix.copy(boss.capeMount.chest.matrixWorld).multiply(boss.chestBindInverse).multiply(riderSeatShift);
   goldenHair.matrixWorldNeedsUpdate=true;
  }else{
   boss.visual.getWorldPosition(goldenHair.position);
   goldenHair.quaternion.copy(boss.visual.getWorldQuaternion(new T.Quaternion())).normalize();
  }
  if(state.stage!=='phase')goldenHair.userData.update(dt,state.time,b.yaw+boss.visual.rotation.y,b.speed||0,b.pos.y,world.groundHeight(b.pos.x,b.pos.z)+.03,maneGlow,castLift,veil,state.stage==='combat'&&b.action==='promised',maneBurst,boss.weapons,boss);
  goldenHair.userData.rider?.userData.updateGrip(boss,dt);
  if(goldenHair.visible&&goldenHair.userData.rider)goldenHair.userData.setPortraitFrame(goldenHair.userData.rider.userData.portraitFrame);
 }
  // ---- camera -------------------------------------------------------------------------------------------
  // Keep the HUD lock on the chest. During a ground rip, the follow rig also frames the working blades.
  const intro=['mist','entry'].includes(state.stage),returning=state.stage==='return',outside=['mist','return'].includes(state.stage);
  const rigBase=p.pos.clone();if(!outside)rigBase.y+=world.groundHeight(p.pos.x,p.pos.z);
  // In free view a jump rises across the pillars. The eye stays with the
  // terrace while the player's boots and flying cloak clear the horizon.
  const freeJump=!state.locked&&p.flight?.windup;
  if(freeJump)rigBase.y-=p.pos.y*.96;
  const lockBone=boss.lockBone??=Object.values(boss.bones).find(bone=>bone.name.endsWith('Spine2'));
  const lockable=state.locked&&state.stage==='combat';
  const trackBoss=state.stage==='combat'&&(state.locked||recordedControls);
  if(lockable){if(lockBone&&boss.root.visible)lockBone.getWorldPosition(lockPoint);else lockPoint.set(b.pos.x,b.pos.y+world.groundHeight(b.pos.x,b.pos.z)+3.4,b.pos.z);}
  shotAim.copy(lockPoint);
  let castBoom,castPivot,castPitchOffset=0;
  if(!state.locked&&state.stage==='combat'&&b.action==='meteor'){
    const lookUp=T.MathUtils.smoothstep(viewRig.pitch,.04,.35);
    castBoom=3.5+.68*lookUp;
    castPivot=1.62-.27*lookUp;
  }
  if(lockable&&b.action==='rocks'){
    const rake=T.MathUtils.smoothstep(b.elapsed,.82,1.94)*(1-T.MathUtils.smoothstep(b.pos.y,.12,2.7))*(1-T.MathUtils.smoothstep(b.elapsed,2.85,3.32));
    const lift=T.MathUtils.smoothstep(b.pos.y,.4,4.6);
    const nearCast=(1-T.MathUtils.smoothstep(Math.hypot(b.pos.x-p.pos.x,b.pos.z-p.pos.z),3.6,8.5))
      *T.MathUtils.smoothstep(b.elapsed,.06,.37)*(1-lift);
    if(rake>0){
      bladeMid.set(0,0,0);
      let count=0;
      for(const weapon of boss.weapons){
        const tip=weapon.bladeSections?.at(-1);
        if(!tip)continue;
        scrapeTip.copy(tip.center);weapon.pivot.localToWorld(scrapeTip);bladeMid.add(scrapeTip);count++;
      }
      if(count){
        bladeMid.multiplyScalar(1/count);
        bladeMid.y=world.groundHeight(bladeMid.x,bladeMid.z)+.28;
        const contactAim=T.MathUtils.smoothstep(b.elapsed,state.phase===1?1.89:1.13,state.phase===1?2.32:1.64);
        shotAim.lerp(bladeMid,(.56-.22*nearCast)*rake*contactAim);
      }
    }
    castPivot=1.62+(.82-.19*nearCast)*rake+.38*lift+.39*nearCast;
    castBoom=3.5+1.03*rake+1.0*lift+2.50*nearCast;
    // As the cluster rises, the view follows its upper arc above the chest lock.
    const upright=T.MathUtils.smoothstep(b.elapsed,.52,.94)*(1-T.MathUtils.smoothstep(b.elapsed,state.phase===1?1.99:1.06,state.phase===1?2.35:1.52));
    castPitchOffset=.18*upright*nearCast+.08*lift+.024*lift*T.MathUtils.smoothstep(Math.hypot(b.pos.x-p.pos.x,b.pos.z-p.pos.z),17,27);
    if(state.phase===1){
      const close=T.MathUtils.smoothstep(b.elapsed,.60,1.17)*(1-T.MathUtils.smoothstep(b.elapsed,2.86,3.21));
      const plunge=T.MathUtils.smoothstep(b.elapsed,1.95,2.29);
      castBoom=T.MathUtils.lerp(castBoom,3.84+3.85*plunge,close);
      castPivot=T.MathUtils.lerp(castPivot,1.88+1.94*plunge,close);
      shotAim.y=T.MathUtils.lerp(shotAim.y,b.pos.y+world.groundHeight(b.pos.x,b.pos.z)+2.70-2.02*plunge,close*.84);
      castPitchOffset-=.24*plunge*close;
    }
  }
  // Keep both weapons readable at clinch distance. Crossed, raised hands need
  // the other shoulder from a low, open guard. Ease the orbit in the view rig
  // so animation poses never change the heading used by movement or combat.
  let shoulderOrbit=0;
  if(lockable&&boss.root.visible&&p.action!=='critical'){
    const range=Math.hypot(b.pos.x-p.pos.x,b.pos.z-p.pos.z);
    const near=1-T.MathUtils.smoothstep(range,2.1,5.5);
    if(near>0&&boss.weapons.length===2){
      let handHeight=0;
      for(const weapon of boss.weapons)handHeight+=weapon.pivot.getWorldPosition(bladeMid).y*.5;
      const raised=T.MathUtils.smoothstep(handHeight-lockPoint.y,-.5,.9);
      shoulderOrbit=near*(.30-.90*raised);
      if(b.action==='rocks'&&state.phase===1){
        const contact=T.MathUtils.smoothstep(b.elapsed,1.94,2.27)*(1-T.MathUtils.smoothstep(b.elapsed,2.75,3.15));
        shoulderOrbit-=near*contact*.62;
      }
      if(b.action!=='rocks'){
        castBoom=3.5+near*(.68-1.0*raised);
        const towering=T.MathUtils.smoothstep(lockPoint.y-rigBase.y,2.3,3.4);
        castPivot=1.62-near*towering*(.42+.28*raised);
        castPitchOffset-=near*towering*(.105+.065*raised);
        // The taller mounted pair needs more room at clinch distance. Lift
        // the boom pivot enough for the terrain solver to keep its full reach.
        if(state.phase===2&&goldenHair?.visible&&!state.grabbed){
          const headroom=near*T.MathUtils.smoothstep(lockPoint.y-rigBase.y,1.35,2.55);
          castBoom+=1.35*headroom;
          castPivot+=.93*headroom;
          castPitchOffset+=.17*headroom;
          shotAim.y+=.55*headroom;
        }
      }
    }
    // When a distant target touches down, look across the player's shoulder
    // from a higher, longer boom. The same response follows any retreat.
    const distant=T.MathUtils.smoothstep(range,9,21);
    const groundView=distant*(1-T.MathUtils.smoothstep(b.pos.y,.15,3.5));
    castBoom=(castBoom??3.5)+.9*groundView;
    castPivot=(castPivot??1.62)+.32*groundView;
    shoulderOrbit-=.055*distant;
  }
  if(lockable&&(b.action==='promised'||b.action==='recover'&&b.lastAttack==='promised')){
    // Keep the grounded player in the frame while the airborne body crosses overhead.
    const leap=b.action==='promised'?T.MathUtils.smoothstep(b.elapsed,6.04,6.42)*(1-T.MathUtils.smoothstep(b.elapsed,7.08,7.48)):0;
    shotAim.y-=2.2*leap;
    shoulderOrbit-=.22*leap;
    const settle=b.action==='promised'?T.MathUtils.smoothstep(b.elapsed,7.25,7.81):1-T.MathUtils.smoothstep(b.elapsed,.27,.60);
    castPivot=T.MathUtils.lerp(castPivot??1.62,1.54,settle);
    castBoom=T.MathUtils.lerp(castBoom??3.5,3.48,settle);
    shotAim.y=T.MathUtils.lerp(shotAim.y,b.pos.y+world.groundHeight(b.pos.x,b.pos.z)+2.35,.64*settle);
    shoulderOrbit-=.10*settle;
  }
  // During a mounted riposte the rider bends over the player's shoulders.
  // A normal dagger-close boom then lands inside the hanging hair.
  const mountedRiposte=trackBoss&&state.phase===2&&p.action==='critical';
  if(mountedRiposte){
    castBoom=6.0;
    castPivot=1.84;
    shoulderOrbit=-.27;
    const riderBrow=goldenHair?.getObjectByName('miquella-portrait-focus');
    if(lockable&&riderBrow)shotAim.lerp(riderBrow.getWorldPosition(bladeMid),.38);
  }
  const groundRiposte=trackBoss&&state.phase===1&&
    (b.action==='critical'||b.action==='recover'&&(b.postCritical||b.critical&&b.stagger>0));
  let ripostePitch,staggeredDuel=0;
  if(trackBoss&&b.action==='meteor'&&!keys.has('KeyI')&&!keys.has('KeyK')&&state.time-lastManualLook>.2){
    const land=METEOR_SEQUENCE.contact+(b.meteorCancelled?.31:0);
    const fall=T.MathUtils.smoothstep(b.elapsed,land-.42,land+.20)*(1-T.MathUtils.smoothstep(b.elapsed,land+.82,land+1.38));
    if(fall>0){
      castPivot=T.MathUtils.lerp(castPivot??1.62,3.55,fall);
      castBoom=T.MathUtils.lerp(castBoom??3.5,4.65,fall);
      if(lockable)shotAim.y=T.MathUtils.lerp(shotAim.y,world.groundHeight(b.pos.x,b.pos.z)+1.52,fall);
      else ripostePitch=T.MathUtils.lerp(viewRig.pitch,-.39,fall);
    }
  }
  if(groundRiposte){
    const framing=b.postCritical?1-T.MathUtils.smoothstep(b.elapsed,.06,.70):
      b.action==='critical'?1:T.MathUtils.smoothstep(b.elapsed,.12,.62);
    if(lockable||referenceSeconds!==null||p.action==='critical')staggeredDuel=framing;
    castBoom=T.MathUtils.lerp(castBoom??3.5,4.95,framing);
    castPivot=T.MathUtils.lerp(castPivot??1.62,2.12,framing);
    shoulderOrbit=T.MathUtils.lerp(shoulderOrbit,-.20,framing);
    if(lockable)shotAim.y=T.MathUtils.lerp(shotAim.y,rigBase.y+1.38,.64*framing);
    else if(!keys.has('KeyI')&&!keys.has('KeyK')&&state.time-lastManualLook>.2)ripostePitch=T.MathUtils.lerp(viewRig.pitch,-.19,framing);
  }
  // After the overhead cut the tracking point drops towards the braced
  // torso. A chest-high lock kept the camera under the cape during rolls.
  if(lockable&&state.phase===1&&b.action==='recover'&&b.lastAttack==='risingSlash'){
    const plant=1.-T.MathUtils.smoothstep(b.elapsed,.31,.56);
    castPivot=T.MathUtils.lerp(castPivot??1.62,3.72,plant);
    castBoom=T.MathUtils.lerp(castBoom??3.5,4.75,plant);
    shotAim.y=T.MathUtils.lerp(shotAim.y,world.groundHeight(b.pos.x,b.pos.z)+1.38,plant);
    shoulderOrbit*=1.-.72*plant;
  }
  if(cameraSnap){viewRig.snap();cameraSnap=false;}
  viewRig.update(dt,{base:rigBase,yaw:cameraYaw,shoulderOrbit,locked:lockable,lockPoint:lockable?shotAim:null,lockPitchOffset:castPitchOffset,inputPitch:cameraPitch,inputActive:keys.has('KeyI')||keys.has('KeyK')||state.time-lastManualLook<.2,moving:['walk','run'].includes(p.action),
    groundAt:outside?(x,z)=>world.entranceHeight(z):world.groundHeight,boom:intro?2.7:returning?4.4:p.action==='critical'&&!mountedRiposte&&!groundRiposte?2.75:castBoom,pivot:intro?1.43:castPivot,pitch:intro?-.27:returning?-.26:ripostePitch});
  if(camera.fov!==52){camera.fov=52;camera.updateProjectionMatrix();}
  viewRig.aimCamera();
  if(trackBoss&&state.phase===1&&b.move<=1){
    const approach=T.MathUtils.smootherstep(distance(),18,30);
    viewRig.frameGateApproach(rigBase,b.pos,approach,world.groundHeight);
  }
  if(lockable&&state.phase===1&&b.action==='rocks'){
    const off=ROCK_SEQUENCE.liftOff;
    const follow=T.MathUtils.smootherstep(b.elapsed,1.40,2.05)*
      (1-T.MathUtils.smootherstep(b.elapsed,off+1.08,off+1.92));
    const plunge=T.MathUtils.smoothstep(b.elapsed,2.01,2.28);
    if(follow>0)viewRig.frameRockDeparture(follow,plunge,rigBase,b.pos,lockPoint,world.groundHeight);
  }
  if(referenceSeconds!==null&&state.stage==='combat'){
    framingPoint.set(b.pos.x,world.groundHeight(b.pos.x,b.pos.z),b.pos.z);
    if(!bossHidden())framingPoint.y+=b.pos.y;
    alignReferenceShot(camera,referenceSeconds,referenceShots,framingPoint,world.groundHeight,p.pos,
      b.action==='rocks'&&state.phase===2&&b.meteorFollowup===2);
  }
  cameraFocus.copy(viewRig.pivot);
  // At the close overhead wind-up the cape can fill the entire view as
  // the orbit crosses the boss. Recover the player's outside shoulder.
  if(trackBoss&&state.phase===1&&b.action==='long'&&!b.critical&&!b.stagger){
    const near=1-T.MathUtils.smoothstep(distance(),2.7,6.5);
    const raised=T.MathUtils.smoothstep(b.elapsed,2.65,3.35)*(1-T.MathUtils.smoothstep(b.elapsed,4.9,5.7));
    viewRig.frameGroundDuel(near*raised,rigBase,b.pos,world.groundHeight);
  }
  if(state.stage==='dying'&&(referenceSeconds!==null||!b.defeatViewReleased)){
    const w=T.MathUtils.smootherstep(state.stageTime,0,.85)*(1-T.MathUtils.smootherstep(state.stageTime,4.6,5.9));
    viewRig.frameGroundDuel(w,rigBase,b.pos,world.groundHeight);
  }
  let plantedBladeView=0;
  if(state.stage==='combat'&&b.action==='rocks'&&(state.locked||referenceSeconds!==null)){
    const mounted=state.phase===2;
    // Follow the actual lift: both blades stay down a little beyond toe-off.
    // Keep a time limit so the planted view cannot return when he lands.
    const release=mounted?T.MathUtils.smootherstep(b.elapsed,1.97,2.31):
      Math.max(T.MathUtils.smootherstep(b.pos.y,.85,4.15),
        T.MathUtils.smootherstep(b.elapsed,ROCK_SEQUENCE.liftOff+.28,ROCK_SEQUENCE.liftOff+.64));
    const plant=T.MathUtils.smootherstep(b.elapsed,mounted?.98:1.95,mounted?1.38:2.24)*(1-release);
    // The planted shot already looks down on the working blades. Switching
    // shoulders to avoid a sweeping cape here can drive the eye into the torso.
    plantedBladeView=plant;
    if(mounted)viewRig.framePlantedBlades(plant,rigBase,boss,world.groundHeight,state.phase,b.elapsed,b.rockLaunchYaw);
  }
  if(trackBoss&&state.phase===2&&b.action==='promised'){
    viewRig.frameAirborneDuel(T.MathUtils.smootherstep(b.pos.y,.55,4.45),rigBase,b.pos,world.groundHeight);
  }
  let runnerView=0,holyCloseReveal=0;
  if(trackBoss&&hoverView){
    const age=hovering?b.elapsed:7.3+b.elapsed;
    runnerView=T.MathUtils.smootherstep(age,1.42,2.16)*(1-T.MathUtils.smootherstep(age,7.30,7.80));
    const reveal=T.MathUtils.smootherstep(age,5.18,5.49);
    holyCloseReveal=runnerView*reveal*(1-T.MathUtils.smoothstep(distance(),3.2,7.5));
    viewRig.frameHolyRise(runnerView,reveal,rigBase,b.pos,world.groundHeight);
  }
  let sweepView=0;
  if(trackBoss&&b.action==='rocks'&&(state.phase===1||b.meteorFollowup===2)){
    const release=state.phase===1?ROCK_SEQUENCE.liftOff:ROCK_SEQUENCE.rise+.12;
    const age=b.elapsed-release;
    const airborneView=state.phase===1?T.MathUtils.smootherstep(b.pos.y,.85,4.15):
      T.MathUtils.smootherstep(age,-.08,.11);
    const prelaunch=state.phase===1?T.MathUtils.smootherstep(age,-.94,-.49)*(1-T.MathUtils.smootherstep(age,-.10,.30)):0;
    sweepView=Math.max(.72*prelaunch,airborneView)*(1-T.MathUtils.smootherstep(age,.63,1.10));
    viewRig.frameGravitySweep(sweepView,age,rigBase,b.pos,world.groundHeight,prelaunch);
  }
  // Keep the descending meteor above the player's shoulder until impact.
  // Pulling back to fit the falling body makes the player shrink on the return.
  const meteorReturnView=trackBoss&&b.action==='meteor'
    ? T.MathUtils.smootherstep(b.elapsed,METEOR_SEQUENCE.return-.52,METEOR_SEQUENCE.return-.09)*
      (1-T.MathUtils.smootherstep(b.elapsed,METEOR_SEQUENCE.contact+.42,METEOR_SEQUENCE.contact+1.06)) : 0;
  if(meteorReturnView>0){
    const catchHead=T.MathUtils.smoothstep(b.elapsed,METEOR_SEQUENCE.return-.05,METEOR_SEQUENCE.return+.19)*
      (1-T.MathUtils.smoothstep(b.elapsed,METEOR_SEQUENCE.contact+.46,METEOR_SEQUENCE.contact+.83));
    viewRig.frameMeteorReturn(meteorReturnView,rigBase,world.groundHeight,catchHead);
  }
  const watchDefeat=state.stage==='dying'&&!bossDissolved&&(referenceSeconds!==null||!b.defeatViewReleased);
  if((trackBoss||watchDefeat)&&player.root.visible){
    const trackBlades=(lockable||referenceSeconds!==null)&&state.phase===2&&b.action==='promised';
    const attackTell=trackBlades?T.MathUtils.smootherstep(b.elapsed,.12,.56)*
      (1-T.MathUtils.smootherstep(b.elapsed,3.45,4.22))+
      T.MathUtils.smootherstep(b.elapsed,4.46,4.87)*(1-T.MathUtils.smootherstep(b.elapsed,5.30,5.89)):0;
    viewRig.fitCombatants(dt,player,boss,world.groundHeight,boss.root.visible&&meteorReturnView<.12&&runnerView<.10&&sweepView<.16,state.phase===2,plantedBladeView,attackTell);
  }
  if(holyCloseReveal>0)viewRig.frameHolyRise(holyCloseReveal,1,rigBase,b.pos,world.groundHeight);
  if(staggeredDuel>0)viewRig.frameStaggeredDuel(staggeredDuel,rigBase,b.pos,world.groundHeight);
  if(trackBoss&&state.phase===1&&b.action==='rocks'){
    const launchAge=b.elapsed-ROCK_SEQUENCE.liftOff;
    if(launchAge>=-.24&&launchAge<1.95)viewRig.followRockLaunch(launchAge,rigBase,b.pos,world.groundHeight,projectiles);
    else viewRig.departureView=null;
  }else viewRig.departureView=null;
  let openingCast=0;
  if(trackBoss&&state.phase===1&&b.action==='rocks'){
    const launchAge=b.elapsed-ROCK_SEQUENCE.liftOff;
    openingCast=T.MathUtils.smootherstep(b.elapsed,.12,.70)*(1-T.MathUtils.smootherstep(launchAge,.63,1.12));
    viewRig.frameOpeningCast(openingCast,b.elapsed,launchAge,rigBase,boss,b.rockLaunchYaw??b.yaw,world.groundHeight);
  }
  const liveTracking=referenceSeconds===null&&!recordedControls;
  if(liveTracking)viewRig.keepLaunchVisible(openingCast,boss,false);
  viewRig.settleTracking(dt,trackBoss,world.groundHeight,liveTracking);
  if(!liveTracking)viewRig.keepLaunchVisible(openingCast,boss);
  if(referenceSeconds!==null&&state.stage==='combat'){
    framingPoint.set(b.pos.x,world.groundHeight(b.pos.x,b.pos.z)+b.pos.y,b.pos.z);
    referenceBossHead??=Object.values(boss.bones).find(bone=>bone.name.endsWith('Head'));
    alignReferenceShot(camera,referenceSeconds,referenceShots,framingPoint,world.groundHeight,p.pos,false,true,referenceBossHead);
  }
  if(freeJump)rigBase.y+=p.pos.y*.96;
  const groundedPair=trackBoss&&boss.root.visible
    ? (1-T.MathUtils.smoothstep(distance(),6,10))*(1-T.MathUtils.smoothstep(b.pos.y,.45,2.4)):0;
  viewRig.framePlayer(dt,player,rigBase,outside?(x,z)=>world.entranceHeight(z):world.groundHeight,
    liveTracking?cameraYaw:null,liveTracking&&!state.locked,groundedPair);
  if(trackBoss&&state.phase===1&&b.action==='rocks'&&(state.locked||referenceSeconds!==null)){
    const airborne=T.MathUtils.smootherstep(b.pos.y,2.,5.)*(1-T.MathUtils.smootherstep(b.elapsed,5.65,6.40));
    viewRig.frameDistantVolley(airborne*T.MathUtils.smootherstep(distance(),15.,25.),rigBase,boss,world.groundHeight,b.elapsed);
  }
  if(watchDefeat){
    const weight=T.MathUtils.smootherstep(state.stageTime,.03,.72)*(1-T.MathUtils.smootherstep(state.stageTime,4.12,4.95));
    const age=state.stageTime;
    // Manual orbit recovered from the recording's compass during the dissolve.
    const bearing=referenceSeconds===null?null:54-22*T.MathUtils.smoothstep(age,.35,1.75)
      -21*T.MathUtils.smoothstep(age,1.75,2.75)-11*T.MathUtils.smoothstep(age,2.75,3.75);
    viewRig.frameFarewell(weight,age,rigBase,viewRig.frameBones?.[5]?.bone,viewRig.frameBones?.[6]?.bone,b.defeatViewAxis,world.groundHeight,bearing);
  }
  if(referenceSeconds!==null&&state.stage==='combat'){
    alignReferenceShot(camera,referenceSeconds,referenceShots,framingPoint,world.groundHeight,p.pos,false,true,referenceBossHead,true);
  }
  const followingFight=trackBoss&&(state.locked||referenceSeconds!==null);
  if(followingFight&&state.phase===2&&b.action==='rocks'&&b.meteorFollowup===2){
    const hold=T.MathUtils.smootherstep(b.elapsed,2.94,4.02)*(1-T.MathUtils.smootherstep(b.elapsed,6.52,7.23));
    viewRig.frameGateVolley(hold,rigBase,b.pos,world.gateZ,world.groundHeight);
  }
  if(followingFight&&b.action==='ring'&&state.phase===2){
    const retreatView=T.MathUtils.smootherstep(b.elapsed,1.46,1.96)*(1-T.MathUtils.smootherstep(b.elapsed,2.84,3.25));
    viewRig.frameGroundDuel(retreatView,rigBase,b.pos,world.groundHeight);
  }
  if(followingFight&&maneBurst>.01&&b.pos.y<.8){
    const room=maneBurst*(1-T.MathUtils.smoothstep(distance(),5.,10.));
    camera.getWorldDirection(framingPoint);camera.position.addScaledVector(framingPoint,-1.9*room);
    camera.position.y=Math.max(camera.position.y,world.groundHeight(camera.position.x,camera.position.z)+.4);
    camera.updateMatrixWorld(true);
  }
  if((followingFight||watchDefeat)&&boss.root.visible&&!outside){
    viewRig.clearNearBlade(dt,boss,world.groundHeight);
  }else viewRig.bladeRoom=0;
  if(followingFight&&state.phase===2&&b.action==='cross'){
    const held=T.MathUtils.smootherstep(b.elapsed,.02,.33)*(1-T.MathUtils.smootherstep(b.elapsed,1.26,1.56));
    viewRig.frameHighGuard(held,world.groundHeight);
  }
  const longWindup=state.phase===1&&b.action==='long'&&b.elapsed<3.1;
  const staggerView=state.phase===1&&b.action==='recover'&&b.lastAttack==='long'&&b.critical;
  const riposteView=state.phase===1&&(b.action==='critical'||b.postCritical&&b.action==='recover');
  if(followingFight&&(longWindup||staggerView||riposteView)){
    const smooth=T.MathUtils.smootherstep;
    let pitch,boom,weight;
    if(longWindup){
      pitch=.32+.12*smooth(b.elapsed,.15,.80)-.09*smooth(b.elapsed,1.25,1.90)+.15*smooth(b.elapsed,1.98,2.67);
      weight=smooth(b.elapsed,0,.63);
      boom=3.32+.56*smooth(b.elapsed,.84,1.52)*(1-smooth(b.elapsed,1.98,2.65));
    }else if(staggerView){
      const fall=smooth(b.elapsed,.39,1.36);
      pitch=T.MathUtils.lerp(.425,-.28,fall);
      boom=T.MathUtils.lerp(3.32,4.62,fall);weight=1;
    }else{
      const release=b.postCritical?1:smooth(b.elapsed,3.,4.7);
      pitch=-.28+.11*release;boom=4.62+.22*release;
      weight=b.postCritical?1-smooth(b.elapsed,0,.85):1;
    }
    viewRig.frameHeelAndRiposte(weight,rigBase,b.pos,world.groundHeight,pitch,boom,dt,b.yaw,longWindup);
  }else {viewRig.contactBearing=null;viewRig.contactOrbit=0;}
  if(openingFlight&&trackBoss&&gravityVortex.visible){
    const rush=RUSH_SEQUENCE,follow=T.MathUtils.smootherstep(b.elapsed,rush.openingWindup-.16,rush.openingWindup+.23)
      *(1-T.MathUtils.smootherstep(b.elapsed,rush.openingContact-.10,rush.openingContact+.12));
    viewRig.frameOpeningRush(gravityVortex.position,follow);
  }
  if(referenceSeconds!==null&&state.stage==='victory'&&referenceSeconds>158){
    viewRig.frameGallery(T.MathUtils.smootherstep(referenceSeconds,158,162.3),rigBase,world.groundHeight);
  }
  if(state.stage==='combat'&&!state.grabbed&&player.root.visible){
    const nearDuel=(1-T.MathUtils.smootherstep(distance(),4.,10.))*
      (1-T.MathUtils.smootherstep(b.pos.y,.65,2.4));
    const approaching=state.phase===1&&b.move<=1?T.MathUtils.smootherstep(distance(),14,26):0;
    const rush=openingFlight?T.MathUtils.smootherstep(b.elapsed,.75,1.80)*
      (1-T.MathUtils.smootherstep(b.elapsed,RUSH_SEQUENCE.openingContact-.36,RUSH_SEQUENCE.openingContact+.02)):0;
    const protectImpact=openingFlight?1-T.MathUtils.smootherstep(b.elapsed,RUSH_SEQUENCE.openingContact-.28,RUSH_SEQUENCE.openingContact):1;
    const groundWeight=Math.max(nearDuel*protectImpact,approaching,rush);
    const distanceGoal=T.MathUtils.lerp(4.44,3.26,nearDuel*protectImpact);
    viewRig.followPlayerDistance(dt,rigBase,distanceGoal,groundWeight,world.groundHeight,nearDuel*protectImpact,approaching);
  }else viewRig.nearPlayerDolly=null;
  if(player.root.visible&&!state.grabbed){
    if(referenceSeconds!==null){
      const framing=referencePlayerBounds(referenceSeconds);
      if(framing)viewRig.composePlayer(framing,world.groundHeight);
    }else if(state.stage==='combat')viewRig.composePlayer(null,world.groundHeight);
  }
  if(state.stage==='combat'&&referenceSeconds!==null){
    const s=referenceSeconds,smooth=T.MathUtils.smootherstep;
    const treePass=smooth(s,15.76,16.67)*(1-smooth(s,17.82,18.53));
    viewRig.centerPlayer(treePass,rigBase);
    const raisedBlades=smooth(s,28.88,29.19)*(1-smooth(s,29.55,29.89));
    const parry=smooth(s,34.74,35.12)*(1-smooth(s,36.65,37.26));
    const rising=smooth(s,46.85,47.53)*(1-smooth(s,48.34,48.90));
    const kneeling=smooth(s,113.30,114.03)*(1-smooth(s,119.37,119.88));
    viewRig.frameDuelPortrait(Math.max(.77*raisedBlades,parry,kneeling),rigBase,world.groundHeight,false);
    viewRig.frameRisingArms(rising,rigBase,b.pos,world.groundHeight);
  }
  if(rushFollow>0)viewRig.frameExecution(.48*rushFollow,rigBase,facing(p.pos,b.pos),world.groundHeight,0,false);
  if(state.stage==='combat'&&b.action==='meteor'&&b.elapsed<METEOR_SEQUENCE.plant+.32){
    const raised=T.MathUtils.smootherstep(b.elapsed,.24,.85)*(1-T.MathUtils.smootherstep(b.elapsed,METEOR_SEQUENCE.plant-.26,METEOR_SEQUENCE.plant+.32));
    viewRig.frameDuelPortrait(raised,rigBase,world.groundHeight,false);
  }
  if(state.stage==='combat'&&b.action==='critical'){
    const ease=T.MathUtils.smootherstep, age=b.elapsed;
    const weight=ease(age,0,.37)*(1-ease(age,3.65,4.68));
    viewRig.frameExecution(weight,rigBase,b.criticalYaw+Math.PI,world.groundHeight,ease(age,2.33,3.32));
  }
  if(state.stage==='combat'&&b.action==='meteor'){
    const m=METEOR_SEQUENCE,land=m.contact+(b.meteorCancelled?.31:0);
    const w=T.MathUtils.smootherstep(b.elapsed,m.return-.48,m.return-.05)
      *(1-T.MathUtils.smootherstep(b.elapsed,land+.55,land+1.09));
    const arriving=T.MathUtils.smootherstep(b.elapsed,m.return-.08,m.return+.15)*(1-T.MathUtils.smoothstep(b.elapsed,land+.25,land+.65));
    viewRig.frameDescent(w,rigBase,b.pos,world.groundHeight,arriving);
  }
  if(state.stage==='combat'&&b.action==='nova'){
    const turn=referenceSeconds===null?b.elapsed-5.46:referenceSeconds-72;
    const face=T.MathUtils.smootherstep(turn,-.64,.09)*(1-T.MathUtils.smootherstep(turn,.91,1.40));
    viewRig.frameSuspendedCast(face,rigBase,b.pos,world.groundHeight);
    if(face>0){
      nearMask=.42*face;
      fx.impactLight.position.copy(camera.position);fx.impactLight.position.y+=.57;
      fx.impactLight.color.setHex(0xffdf9a);fx.impactLight.intensity=Math.max(fx.impactLight.intensity,32*face);
    }
  }
  // When a close pass puts the eye inside the mantle, recover behind the
  // duelist. Keep the recorded shoulder line through the two blade passes.
  if(state.stage==='combat'&&(state.locked||referenceSeconds!==null)){
    const smooth=T.MathUtils.smootherstep;
    let outsideMantle=0;
    if(referenceSeconds!==null){
      const t=referenceSeconds;
      outsideMantle=Math.max(smooth(t,41.82,42.44)*(1-smooth(t,44.02,44.66)),
        smooth(t,49.30,49.76)*(1-smooth(t,50.60,51.06)),
        smooth(t,106.17,106.81)*(1-smooth(t,110.18,110.90)));
    }else if(b.action==='long'||b.action==='cross'||b.action==='risingSlash'||b.action==='stompGrab'||b.action==='recover'){
      const near=Math.hypot(camera.position.x-b.pos.x,camera.position.z-b.pos.z);
      outsideMantle=(1-smooth(near,1.45,3.12))*(1-smooth(distance(),4.20,6.0));
    }
    if(state.phase===2&&b.action==='lightspeed'&&b.meteorFollowup===3){
      const bodyClear=smooth(b.elapsed,ROCK_RETURN.arrive-.15,ROCK_RETURN.land+.04)*(1-smooth(b.elapsed,ROCK_RETURN.plant+.30,ROCK_RETURN.plant+1.05));
      outsideMantle=Math.max(outsideMantle,.86*bodyClear);
    }
    if(outsideMantle>0)viewRig.frameGroundDuel(outsideMantle,rigBase,b.pos,world.groundHeight);
  }
  if(followingFight&&state.phase===1&&b.action==='rocks'){
    const rakeView=T.MathUtils.smootherstep(b.elapsed,1.95,2.41)*
      (1-T.MathUtils.smootherstep(b.elapsed,ROCK_SEQUENCE.liftOff-.02,ROCK_SEQUENCE.liftOff+.30));
    viewRig.frameRakeFromAbove(rakeView,rigBase,b.pos,b.rockLaunchYaw??b.yaw,world.groundHeight);
  }
  const rakeAge=b.elapsed+(state.phase===2?.66:0);
  // Preserve the measured skyline through the fast pans. Combat framing
  // can otherwise swing the gallery behind the camera or crop the high crown.
  if(referenceSeconds!==null&&state.stage==='combat'){
    const s=referenceSeconds,smooth=T.MathUtils.smootherstep;
    const gallery=smooth(s,28.50,29.12)*(1-smooth(s,30.48,31.15));
    const canopy=smooth(s,47.44,47.90)*(1-smooth(s,49.67,50.22));
    const colonnade=smooth(s,124.08,124.60)*(1-smooth(s,125.78,126.38));
    if(gallery>0||canopy>0||colonnade>0){
      framingPoint.set(b.pos.x,world.groundHeight(b.pos.x,b.pos.z)+b.pos.y,b.pos.z);
      alignReferenceShot(camera,s,referenceShots,framingPoint,world.groundHeight,p.pos,false,
        gallery>0,referenceBossHead,gallery>0,gallery*.73||canopy||colonnade*.58,colonnade>0);
    }
  }
  if(followingFight&&state.phase===1){
    const reel=b.action==='recover'&&b.critical&&b.stagger>0;
    let weight=reel?T.MathUtils.smootherstep(b.elapsed,.12,.43):0;
    if(referenceSeconds!=null){
      const age=referenceSeconds,ease=T.MathUtils.smootherstep;
      weight=Math.max(weight,ease(age,28.31,28.84)*(1-ease(age,30.45,30.98)));
    }
    if(weight>0)viewRig.frameGroundDuel(weight,rigBase,b.pos,world.groundHeight);
  }
  if(followingFight&&state.phase===2){
    const ease=T.MathUtils.smootherstep,seconds=referenceSeconds;
    if((b.action==='promised'||b.action==='lightspeed')&&b.pos.y<1.8){
      const nearClip=seconds==null?0:Math.max(
        ease(seconds,98.21,98.70)*(1-ease(seconds,99.80,100.52)),
        ease(seconds,140.65,141.37)*(1-ease(seconds,142.72,143.47)));
      viewRig.clearCompanion(dt,rigBase,b.pos,b.yaw,boss,world.groundHeight,nearClip);
    }else{viewRig.maneCover=null;viewRig.maneDolly=0;}
    if(b.action==='meteor'){
      const flight=p.flight,evasive=flight&& !state.locked?ease(flight.elapsed,.02,.13)*(1-ease(flight.elapsed,flight.duration-.14,flight.duration+.01)):0;
      const shot=seconds==null?0:ease(seconds,124.32,124.82)*(1-ease(seconds,125.74,126.25));
      if(shot||evasive){
        framingPoint.set(p.pos.x,world.groundHeight(p.pos.x,p.pos.z),p.pos.z);
        viewRig.frameRunnerFlight(Math.max(shot,evasive),framingPoint,p.pos.y,world.groundHeight);
      }
    }
  }
  const starfallDrag=b.action==='meteor'&&b.elapsed>METEOR_SEQUENCE.plant+.05&&b.elapsed<METEOR_SEQUENCE.takeoff+.34;
  const rakeEnd=state.phase===1?ROCK_SEQUENCE.liftOff+.07:2.86;
  const rakingFloor=state.stage==='combat'&&b.pos.y<.64&&(starfallDrag||(b.action==='rocks'&&rakeAge>1.72&&rakeAge<rakeEnd));
  for(const {side,trace} of bladeScrapes){
    const weapon=boss.weapons.find(held=>held.side===side);
    if(rakingFloor&&weapon){scrapeTip.copy(weapon.rakeContact||weapon.bladeSections.at(-1).center);weapon.pivot.localToWorld(scrapeTip);}
    trace.userData.update(state.time,scrapeTip,rakingFloor&&!!weapon);
    // The paired strike pushes a short violet sheet of grit out from the planted blades.
    if(rakingFloor&&state.phase===1&&dt>0&&b.elapsed>2.18&&b.elapsed<2.73&&weapon){
      const wrist=weapon.pivot.getWorldPosition(dustPoint);
      const front=p.pos.clone().sub(b.pos).setY(0).normalize();
      wrist.lerp(scrapeTip,.62);wrist.y=world.groundHeight(wrist.x,wrist.z)+.09;
      dustDrift.copy(front).multiplyScalar(1.9);dustDrift.y=4.1;
      const grain=1.-T.MathUtils.smoothstep(b.elapsed,2.51,2.74);
      scrapeDust.userData.chips(wrist,dustDrift,9,state.time,.48*grain);
      scrapeDust.userData.puff(wrist,dustDrift,state.time,.56*grain);
    }
    // White dust is thrown where each dragged blade meets the ash.
    if(rakingFloor&&weapon&&dt>0){
      const floor=world.groundHeight(scrapeTip.x,scrapeTip.z);
      if(scrapeTip.y-floor<.9){
        dustPoint.set(scrapeTip.x,floor+.1,scrapeTip.z);dustDrift.set(-Math.sin(b.yaw)*1.4,1.1,-Math.cos(b.yaw)*1.4);
        scrapeDust.userData.puff(dustPoint,dustDrift,state.time);scrapeDust.userData.puff(dustPoint,dustDrift,state.time);
      }
    }
  }
  // The retreat drags a pale wall of dust and dark chips along the torn floor.
  const tearing=state.stage==='combat'&&b.action==='rocks'&&dt>0&&rakeAge>1.95&&rakeAge<3.77,dragging=rakeAge<3.05&&b.pos.y<2.6;
  if(tearing){
    const speed=dustBoss.distanceTo(b.pos)/dt;
    dustDrift.copy(b.pos).sub(dustBoss).setY(0);if(dustDrift.lengthSq()>1e-6)dustDrift.normalize();
    dustPoint.set(b.pos.x,world.groundHeight(b.pos.x,b.pos.z)+.12,b.pos.z);
    const carry=Math.min(9,speed*.45);dustDrift.multiplyScalar(carry);dustDrift.y=1.3;
    if(dragging){scrapeDust.userData.puff(dustPoint,dustDrift,state.time);scrapeDust.userData.puff(dustPoint,dustDrift,state.time);}
    if(rakeAge>2.25){
      const returnVault=state.phase===2&&b.meteorFollowup===2;
      const burst=T.MathUtils.smoothstep(rakeAge,2.85,3.05)*(1-T.MathUtils.smoothstep(rakeAge,returnVault?3.02:3.24,returnVault?3.28:3.70));
      const origin=bladeScrapes[0].trace.userData.lastContact;
      if(origin&&state.time-origin.t<1.6)dustPoint.lerp(origin.p,burst*.77);
      dustDrift.y+=burst*5.5;
      scrapeDust.userData.chips(dustPoint,dustDrift,b.pos.y>.5?(returnVault?19:65):22,state.time,burst);
      if(burst>.04)scrapeDust.userData.puff(dustPoint,dustDrift,state.time,burst,returnVault);
    }
  }
  dustBoss.copy(b.pos);
  framingPoint.copy(player.root.position);framingPoint.y+=world.groundHeight(p.pos.x,p.pos.z)+(p.action==='roll'?.48:1.02);
  scrapeDust.userData.update(state.time,framingPoint);tickVolleyFx(dt,camera);
  gravityHeave.visible=false;
  const heaveAge=rakeAge+(state.phase===2?.22:0);
  if(gravityActive&&b.action==='rocks'&&heaveAge>1.44&&heaveAge<3.81){
    const blade=boss.weapons.find(w=>w.side==='Right');
    if(blade){
      const cut=bladeScrapes[0].trace.userData.lastContact;
      if(cut&&state.time-cut.t<1.48)heaveOrigin.copy(cut.p);
      else{heaveOrigin.copy(b.from);heaveOrigin.y=world.groundHeight(b.from.x,b.from.z)+.07;}
      if(state.phase===1){
        // The eruption runs out of the torn ground. The wrists continue
        // around the caster after this section of the furrow is cut.
        if(!b.furrowPoint&&cut&&state.time-cut.t<.10&&rakeAge>=2.46&&rakeAge<2.64)b.furrowPoint=cut.p.clone();
        if(b.furrowPoint)heaveOrigin.lerp(b.furrowPoint,T.MathUtils.smoothstep(rakeAge,2.77,2.98));
      }
      heaveTip.copy(blade.holyEdge.userData.tip);blade.pivot.localToWorld(heaveTip);
      const power=gravityHeave.userData.update(heaveAge,heaveOrigin,heaveTip,projectiles,state.phase===1||b.meteorFollowup===2);
      gravityLight.position.lerpVectors(heaveOrigin,heaveTip,.48);
      gravityLight.intensity+=power*(state.phase===2?41:65);
      if(state.phase===1){
        const plunge=T.MathUtils.smoothstep(b.elapsed,2.13,2.35)*(1-T.MathUtils.smoothstep(b.elapsed,2.76,3.08));
        gravityLight.position.lerp(heaveOrigin,.70*plunge);
        gravityLight.intensity+=66*plunge;
      }
    }
  }
  for(let i=0;i<gravityRocks.length;i++){
   const rock=projectiles[i],visual=gravityRocks[i];
   const liftAt=(state.phase===1?ROCK_SEQUENCE.liftOff-.39:ROCK_SEQUENCE.rise-.27)+(i%4)*.033;
   const formation=T.MathUtils.smoothstep(b.elapsed,liftAt,liftAt+.34);
   visual.visible=state.stage==='combat'&&!!rock&&!rock.done&&(rock.launched||b.action==='rocks'&&formation>0);
   if(visual.visible){updateGravityRock(visual,rock,state.time,camera,b.action==='rocks'?b.pos:null,b.elapsed,formation);updateRockDress(visual,rock,state.time,b.action==='rocks'?b.elapsed:99,formation,state.phase===1?ROCK_SEQUENCE.liftOff:ROCK_SEQUENCE.rise+.12,state.phase===1);}
  }
  if(state.locked){const v=(lockable?lockPoint.clone():b.pos.clone().add(new T.Vector3(0,2.5,0))).project(camera);state.lockScreen={x:(v.x*.5+.5)*1280,y:(-.5*v.y+.5)*720};}
  fill.color.copy(fillDay).lerp(fillDusk,world.phaseBlend);
  fill.intensity=state.phase===2?.68:.40;fill.position.copy(b.pos).add(new T.Vector3(-12,7,9));fill.target.position.copy(b.pos).add(new T.Vector3(0,2.25,0));const cinematic=state.stage==='phase';
  // Pale rubble reflects the gate light into the underside of the cuirass in close combat.
  armorBounce.intensity=0;
  if(state.stage==='combat'){
    const dx=p.pos.x-b.pos.x,dz=p.pos.z-b.pos.z;
    const distance=Math.hypot(dx,dz);
    const near=1-T.MathUtils.smoothstep(distance,5,12);
    const grounded=1-T.MathUtils.smoothstep(b.pos.y,.65,3.3);
    armorBounce.intensity=(state.phase===2?42:12)*near*grounded;
    if(armorBounce.intensity>.04){
      const reflectedFrom=state.phase===2?world.arena.gateLightDirection:world.arena.sunDirection;
      const ground=world.groundHeight(b.pos.x,b.pos.z);
      const warmReturn=state.phase===2?1.15:0;
      armorBounce.position.set(b.pos.x+3.8*reflectedFrom.x+warmReturn*dx/Math.max(1,distance),
        ground+b.pos.y+.85,b.pos.z+3.8*reflectedFrom.z+warmReturn*dz/Math.max(1,distance));
      armorBounce.target.position.set(b.pos.x,ground+b.pos.y+2.72,b.pos.z);
    }else armorBounce.intensity=0;
  }
  let cinematicFade=0;
  if(cinematic){contacts[0].visible=false;contacts[1].visible=true;contacts[1].position.copy(cinematicMark);contacts[1].position.y=world.groundHeight(cinematicMark.x,cinematicMark.z)+.015;cinematicFade=phaseTransition.render(Math.max(0,state.stageTime-PHASE_CINEMATIC_LEAD),boss,goldenHair,camera);
   if(goldenHair){
    const matrix=goldenHair.matrix.elements;
    goldenHair.userData.update(dt,state.time,Math.atan2(matrix[8],matrix[10]),0,0,world.groundHeight(matrix[12],matrix[14])+.03,maneGlow,0,null,false,0,boss.weapons,boss);
   }
   // The cutscene opens from black, and a skip closes to black at once (primary 53.6-55.5).
   if(state.stageTime<PHASE_CINEMATIC_LEAD)cinematicFade=1;
   if(state.phaseSkipAt!=null)cinematicFade=Math.max(cinematicFade,T.MathUtils.smoothstep(state.stageTime,state.phaseSkipAt-1.3,state.phaseSkipAt-1.05));
   fill.position.set(cinematicMark.x-4.2,cinematicMark.y+6.6,cinematicMark.z+5.8);
   fill.target.position.set(cinematicMark.x,cinematicMark.y+2.8,cinematicMark.z);
   const portraitTime=state.stageTime-PHASE_CINEMATIC_LEAD;
   if(portraitTime>=63&&portraitTime<CONSORT_WIDE_CUT){
    fill.position.x-=1.3;fill.position.y+=1.35;
    fill.color.setHex(0xffdeb0);fill.intensity=.69;fill.target.position.y=cinematicMark.y+4.2;
   }else if(portraitTime>=CONSORT_WIDE_CUT){
    // The wide shot has a low reflected light on the gilt cuirass and
    // bracers below the bright gate. Keep the mantle in the upper shadow.
    fill.position.set(cinematicMark.x-3.2,cinematicMark.y+5.3,cinematicMark.z+7.4);
    fill.target.position.set(cinematicMark.x,cinematicMark.y+2.5,cinematicMark.z);
    fill.color.setHex(0xffeed2);fill.intensity=2.85;
   }
  }
  else phaseTransition.stop();
  boss.setCapeSight?.(player,camera,state.stage==='combat',p.action==='light'||p.action==='heavy');
  const lowSight=state.stage==='combat'?(1-T.MathUtils.smoothstep(camera.position.y-world.clothGroundHeight(camera.position.x,camera.position.z),.70,1.55))*
    (1-T.MathUtils.smoothstep(distance(),4.,10.)):0;
  const clearFeet=b.action==='critical'?T.MathUtils.smoothstep(b.elapsed,0,.25):
    b.postCritical?1-T.MathUtils.smoothstep(b.elapsed,.15,.70):0;
  world.cameraOcclusion(camera.position,p.pos,!intro&&!cinematic,Math.max(clearFeet,lowSight));fx.setView(camera.position,p.pos.clone().add(new T.Vector3(0,p.action==='roll'?.65:1.10,0)));backgroundSplats.setPhase(world.phaseBlend);
  gradePass.uniforms.phase.value=world.phaseBlend;
  if(!intro&&!cinematic){
    camera.getWorldDirection(framingPoint);
    const k=world.phaseBlend;
    const intoLight=T.MathUtils.lerp(Math.max(0,framingPoint.dot(world.arena.sunDirection)),Math.max(0,framingPoint.dot(world.arena.gateLightDirection)),k);
    renderer.toneMappingExposure=.985-.078*intoLight**3;
  }
  gradePass.uniforms.nearGlare.value=0;
  if(fx.flashPulse?.nearCamera){
    // A nearby retreat flare fills the eye only while the camera faces it.
    camera.updateMatrixWorld();
    const origin=fx.flashPulse.pos,screen=framingPoint.copy(origin).project(camera);
    const visible=screen.z>=-1&&screen.z<=1 ? 1-T.MathUtils.smoothstep(Math.hypot(screen.x,screen.y),.75,1.75) : 0;
    const gain=visible*(1-T.MathUtils.smoothstep(camera.position.distanceTo(origin),9,22));
    gradePass.uniforms.flash.value*=gain;
    gradePass.uniforms.nearGlare.value=gain;
  }
  // The color pass and input stay on the display clock. Between two native
  // shadow samples the small contact shadows still follow both feet and rolls.
  // Fixed-resolution captures keep a fresh shadow for each captured frame.
  if(!recordedControls){
    renderer.shadowMap.autoUpdate=false;
    const now=performance.now();
    if(!shadowDeadline||now+.4>=shadowDeadline||shadowStage!==state.stage){
      renderer.shadowMap.needsUpdate=true;
      // When the scene already spends more than a refresh on the CPU, give
      // input and colour frames a turn between full dynamic shadow passes.
      const spellGlare=constrainedShadows&&state.phase===2&&(b.action==='ring'||b.action==='nova');
      const period=spellGlare?T.MathUtils.clamp(liveRenderMs*2.8,70,110):
        Math.max(1000/(constrainedShadows?30:60),Math.min(60,liveRenderMs*1.9));
      shadowDeadline=!shadowDeadline||shadowStage!==state.stage?now+period:
        shadowDeadline+(1+Math.floor((now+.4-shadowDeadline)/period))*period;
      shadowStage=state.stage;
    }
  }else renderer.shadowMap.autoUpdate=true;
  padSceneLights();
  const novaPower=fx.impactLight.intensity;
  if(nearMask>0)fx.impactLight.intensity=Math.min(novaPower,44*nearMask);
  try{composer.render();}finally{fx.impactLight.intensity=novaPower;for(const light of mutedDrawLights)light.visible=true;mutedDrawLights.length=0;}
  if(!recordedControls&&dt>0)liveRenderMs+=.08*(T.MathUtils.clamp(dt*1000,5,55)-liveRenderMs);
  state.compassYaw=Math.atan2(camera.getWorldDirection(framingPoint).x,-framingPoint.z);const entryReveal=referenceSeconds!==null
    ? 1-T.MathUtils.smoothstep(referenceSeconds,1.87,2.54)
    : (state.stage==='combat'&&state.phase===1 ? .86*(1-T.MathUtils.smoothstep(state.stageTime,0,.47)) : 0);
  if(cinematic){
    hud.liveSignature=null;hud.updateBars(state);
    const c=hud.ctx;c.clearRect(0,0,1280,720);
    if(cinematicFade>0){c.fillStyle=`rgba(0,0,0,${cinematicFade})`;c.fillRect(0,0,1280,720);}
    if(state.stageTime>=PHASE_CINEMATIC_LEAD&&state.phaseSkipAt==null)hud.text(recordedControls?'Enter: Skip':controlLabel(state.inputDevice,'Esc: Skip','Menu: Skip','Options: Skip'),1218,693,13,'#d5d2bd','right');
  }else hud.draw(entryReveal>state.fade?{...state,fade:entryReveal}:state);
  if(referenceSeconds!==null&&state.stage==='victory')hud.replayEnding(referenceSeconds,renderer.domElement);

}
const gravityHeave=createGravityHeave(),heaveOrigin=new T.Vector3(),heaveTip=new T.Vector3();
const bladeScrapes=['Right','Left'].map(side=>{
  const trace=createBladeScrape(world.groundHeight,side);scene.add(trace);return {side,trace};
});
const scrapeTip=new T.Vector3();
scene.add(gravityHeave);
const gravityRocks=Array.from({length:ROCK_COUNT},(_,i)=>{const rock=createGravityRock(fx.cloudTexture,i);dressGravityRock(rock,fx.cloudTexture,i);scene.add(rock);return rock;});
 const scrapeDust=createScrapeDust(fx.cloudTexture);scene.add(scrapeDust);
 const dustPoint=new T.Vector3(),dustDrift=new T.Vector3(),dustBoss=new T.Vector3();
const hoverAura=new T.Sprite(new T.SpriteMaterial({map:fx.cloudTexture,color:0xffe7ae,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));scene.add(hoverAura);
const gravityAura=new T.Sprite(new T.SpriteMaterial({map:fx.cloudTexture,color:0x9a5cff,transparent:true,opacity:.5,blending:T.AdditiveBlending,depthWrite:false}));scene.add(gravityAura);const gravityLight=new T.PointLight(0xa279ff,0,14);scene.add(gravityLight);
const charm=new T.Group();scene.add(charm);const charmMat=new T.MeshBasicMaterial({color:0xffdf83,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false});for(const y of [0,.14]){const ring=new T.Mesh(new T.TorusGeometry(.22,.014,5,32),charmMat);ring.position.y=y;charm.add(ring);}const charmCore=new T.Sprite(new T.SpriteMaterial({map:fx.cloudTexture,color:0xffdc8c,transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false}));charmCore.scale.set(.7,.7,1);charm.add(charmCore);
const phaseTransition=createPhaseTransition(scene,fx.cloudTexture,world.groundHeight);
let goldenHair;
const riderSeatShift=new T.Matrix4();
let stepDistance=0,stepPosition=new T.Vector3();
function makeHair(){
 goldenHair=createCompanionMane(ultra,fixedResolution);scene.add(goldenHair);
}

makeHair();
const companionLoader=new GLTFLoader();
const companionReady=Promise.all([
 companionLoader.loadAsync('assets/tripo/golden_companion/model.vigil.glb'),
 companionLoader.loadAsync('assets/tripo/miquella_seated_portrait/'+(player.masterTextures?'portrait-flax-master-face.glb':'portrait-flax-play.glb')),
 Promise.all(['collar-color.png','collar-orm.png'].map(name=>new T.TextureLoader()
   .loadAsync('assets/tripo/miquella_seated_portrait/'+name))),
 new T.TextureLoader().loadAsync('assets/tripo/miquella_seated_portrait/complexion.png')
]).then(async ([body,head,collarMaps,complexion])=>{
 const rider=prepareCompanion(body.scene,head.scene,collarMaps,complexion);
 if(!recordedControls&&!fixedResolution)await preparePortraitDetail(rider,()=>fixedResolution);
 goldenHair.add(rider);goldenHair.userData.rider=rider;
 goldenHair.userData.setPortraitFrame(rider.userData.portraitFrame,true);
});
async function warmCombatMaterials(){
  const finishRockWarmup=prepareRockBursts(scene,ROCK_COUNT,fx.cloudTexture);
  fx.prepareWarmup(boss,!recordedControls,world.clothGroundHeight);
  player.prepareWeaponEffects();
  boss.prepareWeaponEffects();
  // Compile/upload the initially hidden boss and effects while the loading gate
  // is still closed. The first combat frame must not compile their materials.
  const previous=renderer.getRenderTarget(),toScreen=composer.renderToScreen,visibility=[];
  const home=camera.position.clone(),orientation=camera.quaternion.clone();
  const warmLive=!recordedControls,shadowAuto=renderer.shadowMap.autoUpdate;
  scene.traverse(o=>{visibility.push([o,o.visible,o.frustumCulled]);o.visible=true;o.frustumCulled=false;});
  try{
    // Exercise the actual arena view and HDR/bloom attachments during loading.
    // The loading canvas is offscreen throughout these first-use compilations.
    composer.renderToScreen=false;
    // A small offscreen draw populates the same shader variants and textures.
    // The camera and the directional light stay fixed for all light counts.
    if(warmLive){
      bloom.fastLive=!fixedResolution;
      composer.setPixelRatio(Math.min(renderQuality.ratio,320/Math.max(innerWidth,innerHeight)));
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    }
    camera.position.set(-4,2.6,4);camera.lookAt(-2,3,-50);camera.updateMatrixWorld(true);
    // Prepare the same point-light capacities used during actual gameplay.
    // Keep effect meshes visible while varying light slots independently.
    const points=visibility.map(([object])=>object).filter(object=>object.isPointLight&&!lightPadding.includes(object));
    for(const light of points)encounterPointLights.add(light);
    // Newly attached effects may contain cloned lights. Track those small
    // subtrees on attachment, rather than rescan the entire arena per frame.
    scene.addEventListener('childadded',({child})=>child.traverse(object=>{
      if(object.isPointLight&&!lightPadding.includes(object))encounterPointLights.add(object);
    }));
    scene.addEventListener('childremoved',({child})=>child.traverse(object=>{
      if(object.isPointLight)encounterPointLights.delete(object);
    }));
    const lights=[...points,...lightPadding];
    const maximum=lightCapacity(points.length);
    const loadingText=document.querySelector('#loading small');
    // The interactive layout has exactly four slots throughout the encounter.
    // Each larger layout duplicates the entire material set in driver memory.
    // Fixed-quality launches precompile their own complete lighting layouts.
    const layouts=warmLive&&!fixedResolution?[4]:Array.from({length:(maximum-8)/4+1},(_,i)=>8+i*4);
    for(const count of layouts){
      loadingText.textContent=`Preparing lighting and combat effects (${count} lights)ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`;
      for(let i=0;i<lights.length;i++)lights[i].visible=i<count;
      renderer.setRenderTarget(composer.readBuffer);
      await renderer.compileAsync(scene,camera);
      composer.render(0);
    }
  }
  finally{
    if(warmLive){
      bloom.fastLive=!fixedResolution;
      composer.setPixelRatio(renderQuality.ratio);
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=true;
    }
    composer.renderToScreen=toScreen;renderer.setRenderTarget(previous);
    camera.position.copy(home);camera.quaternion.copy(orientation);camera.updateMatrixWorld(true);
    for(const [o,visible,culled] of visibility){o.visible=visible;o.frustumCulled=culled;}
    fx.finishWarmup();
    finishRockWarmup();
  }
}
async function loadEncounter() {
  const status = document.querySelector('#loading small');
  status.textContent = 'Loading the arena and characters...';
  await Promise.all([world.ready, backgroundSplats.ready, hud.ready, player.load(), boss.load(), companionReady]);

  status.textContent = 'Preparing combat animations...';
  const playerClips = ['idle', 'walk', 'run', 'slash', 'dive', 'jump', 'fall'];
  const bossClips = ['idle', 'walk', 'run', 'slash', 'jump', 'hurt', 'fall'];
  await Promise.all([player.clips(playerClips), boss.clips(bossClips)]);
  for (const name of playerClips) {
    if (!player.actions[name]) throw new Error('Required player animation missing: ' + name);
  }
  for (const name of ['idle', 'walk', 'run', 'fall']) {
    if (!boss.actions[name]) throw new Error('Required boss animation missing: ' + name);
  }

  status.textContent = 'Fitting weapons and armor...';
  await Promise.all([
    player.headgear('beast_head_faithful', .95, .04),
    boss.headgear('warlord_headgear', 1.05, .16),
    player.weapon('heavy_thrust_video', 'Right', 1.95),
    player.weapon('parrying_dagger', 'Left', .65),
    player.weapon('parrying_dagger', 'Right', .8, 1),
    boss.weapon('war_greatblade', 'Right', 4.3),
    boss.weapon('war_greatblade', 'Left', 4.3)
  ]);
  const maximum = renderer.capabilities.getMaxAnisotropy();
  const sampling = ultra ? maximum : Math.min(8, maximum);
  player.improveTextureSampling(sampling);
  boss.improveTextureSampling(sampling, [goldenHair]);
  player.prepareDissolve();
  boss.prepareDissolve([goldenHair]);
  prepareAudio();
  if(!fixedResolution && !recordedControls){
    batchLooseSlabs(scene.getObjectByName('slab-debris'),renderer);
    updateTileBudget=batchLiveTiles(scene,()=>fixedResolution);
  }
  status.textContent = 'Preparing lighting and combat effects...';
  await warmCombatMaterials();
  if(!fixedResolution&&!recordedControls){shareRigPalettes(scene);sortLiveMaterials(renderer);cacheSceneTransforms(scene,T.Object3D.prototype);}
  keys.clear();
  eDown = -1;
  loaded = true;
  state.prompt = mistPrompt();
  render(0);
  last = lastRender = performance.now();
  inputTimeline.reset(last);
  renderNext = 0;
  document.querySelector('#game').hidden = false;
  document.querySelector('#loading').remove();
}
loadEncounter().catch(error => {
  state.prompt = 'Unable to load the scene. Refresh to retry.';
  document.querySelector('#loading small').textContent = state.prompt;
  console.error('Encounter load failed:', error);
});
let drawingResizePending=false;
let constrainedShadows=false;
const drawingSize=new T.Vector2();
let terrainLevels=null,terrainBudget=false;
function setLiveDetail(constrained){
 if(!loaded||recordedControls||terrainBudget===constrained)return;
 if(!terrainLevels){
   terrainLevels=[];
   scene.traverse(o=>{
     if(!o.isLOD||!o.levels[0]?.object.isInstancedMesh)return;
     const radius=o.levels[0].object.boundingSphere?.radius;
     if(radius==null)return;
     for(const level of o.levels.slice(1))
       terrainLevels.push({level,radius,distance:level.distance});
   });
 }
 for(const {level,radius,distance} of terrainLevels)
   level.distance=constrained?radius+(distance-radius)*.55:distance;
 updateTileBudget?.(constrained);
 backgroundSplats.spark.setFrameBudget?.(constrained);
 terrainBudget=constrained;
}
function resizeDrawing(){
 const ratio=renderQuality.ratio;
 const nativeTarget=Math.min(1,renderQuality.maximum);
 if(fixedResolution||ratio>=nativeTarget)constrainedShadows=false;
 else if(ratio<=.8*nativeTarget)constrainedShadows=true;
 world.setShadowQuality(fixedResolution,constrainedShadows);
 setLiveDetail(constrainedShadows);
 renderer.getSize(drawingSize);
 if(renderer.getPixelRatio()!==ratio){
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
 }
 if(drawingSize.x!==innerWidth||drawingSize.y!==innerHeight){
  renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);
 }
 // The glow is band-limited. Under load filter it on a smaller grid while
 // retaining the view's full geometry buffer and the authored blur span.
 const glowScale=constrainedShadows && !recordedControls ? .55 : 1;
 bloom.fastLive=!recordedControls&&!fixedResolution;
 bloom.glowScale=glowScale;
 const glowWidth=Math.round(innerWidth*ratio*glowScale);
 const glowHeight=Math.round(innerHeight*ratio*glowScale);
 if(bloom.renderTargetBright.width!==Math.round(glowWidth/2)||
    bloom.renderTargetBright.height!==Math.round(glowHeight/2)){
   bloom.setSize(glowWidth,glowHeight);
   for(const material of bloom.separableBlurMaterials)material.uniforms.invSize.value.multiplyScalar(glowScale);
 }
 antialias.uniforms.resolution.value.set(1/(innerWidth*ratio),1/(innerHeight*ratio));
 gradePass.uniforms.aspect.value=innerWidth/innerHeight;
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();if(fixedResolution){renderQuality.setMaximum(fixedPixelRatio());renderQuality.ratio=renderQuality.maximum;}
else renderQuality.setMaximum(playPixelRatio());drawingResizePending=true;});camera.position.set(0,2.15,4.8);
// Read-only diagnostics used by isolated verification; no state mutation or autoplay hook.
window.gameStatus=(options={})=>({thrustVariant:p.action==='light'?(p.runningThrust?'running':p.rollingThrust?'rolling':'standing'):null,grip:state.grip,currentLayout:!!state.currentLayout,pouchHeld:state.pouchHeld,arenaMap:state.arenaMap,physick:state.physick,leftEquipped:state.leftEquipped,chargeSeconds:p.chargeSeconds||0,guardCounter:!!p.guardCounter,bleed:state.bleed,bloodflame:state.bloodflame,marked:state.marked,grabbed:!!state.grabbed,life:state.life,deaths:state.deaths,deathHistory:deathHistory.map(e=>({...e})),meteorCooldown:Math.max(0,180-(state.time-b.lastMeteor)),grabCooldown:Math.max(0,GRAB_COOLDOWN-(state.time-b.lastGrab)),bossMax:state.bossMax,frost:b.frost,frostProcs:b.frostProcs,frostRemaining:Math.max(0,b.frostUntil-state.time),hazards:hazards.length,projectiles:projectiles.filter(r=>!r.done).length,held:[...keys],buffered:!!p.buffer,queuedAction:p.buffer?.name||null,lightChain:p.lightChain||0,counterThrust:!!p.counterThrust,combatEvents:combatEvents.map(e=>({...e})),yaw:p.yaw,bossYaw:b.yaw,bossHeight:b.pos.y,bossSpeed:b.speed||0,bossMotion:boss.lastMotion,gaitTurn:player.gaitTurn||0,gaitBones:player.gaitAdjustments?.length||0,cameraForward:camera.getWorldDirection(new T.Vector3()).toArray(),parries:b.parries,stagger:b.stagger,attackCount:p.attackCount,sprintExhausted:!!p.sprintExhausted,lastEHold:p.lastEHold??null,cameraPitch,playerHeight:p.pos.y,airborne:!!p.flight,flightElapsed:p.flight?.elapsed||0,actionElapsed:p.elapsed,playerHelmet:player.helmet?.shell.quaternion.toArray(),stage:state.stage,stageTime:state.stageTime,phase:state.phase,fp:state.fp,flameRemaining:Math.max(0,(state.flameUntil||0)-state.time),hp:state.hp,bossHp:state.bossHp,stamina:state.stamina,flasks:state.flasks,menu:state.menu,locked:state.locked,player:[p.pos.x,p.pos.z],boss:[b.pos.x,b.pos.z],action:p.action,bossAction:b.action,bossElapsed:b.elapsed,bossTarget:b.target.toArray(),meteorCancelled:!!b.meteorCancelled,hazardDetails:hazards.map(h=>({reason:h.reason,pos:h.pos.toArray(),radius:h.radius,yaw:h.yaw,arc:h.arc,delay:h.delay,life:h.life,hit:!!h.hit})),weapon:state.weapon,item:state.item,skill:state.skill,crouched:state.crouched||false,menuSelection:state.menuSelection,inputDevice:state.inputDevice,twoHanded:!!state.twoHanded,help:!!state.help,time:state.time,loaded,muted:!!encounterAudio.muted,reward:state.reward,rewardAcknowledged:!!state.rewardAcknowledged,audioState:encounterAudio.context?.state||'unavailable',victory:state.victory,bossBounds:new T.Box3().setFromObject(boss.root,!!options.preciseBounds).getSize(new T.Vector3()).toArray(),camera:camera.position.toArray(),renderStats:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries}});
let portraitChapterPending=checkpoint==='phase-portrait';
function advance(now){
 if(!loaded){inputTimeline.reset(now);return;}
 if(portraitChapterPending){
   portraitChapterPending=false;
   state.bossVisible=true;state.bossHp=state.bossMax*.59;state.prompt='';
   p.pos.set(0,0,-8); b.pos.copy(CINEMATIC_BOSS_POSITION);
   enterPhaseCinematic();
   state.stageTime=PHASE_CINEMATIC_LEAD+61;
   world.settlePhase(2,b.pos);
 }
 inputTimeline.advance(now,step,applyInput,!recordedControls);
}
// Present at the screen refresh rate. A fixed cap is optional for live play.
// Recorded inputs retain the original film cadence and simulation clock.
const requestedHz=Number(launchOptions.get('fps'));
const livePresentationHz=[30,60,90,120,144,165,240].includes(requestedHz)?requestedHz:null;
let liveSampleStart=0,liveIntervals=0,liveDrawHz=null;
function frame(now){
 if(!recordedControls&&document.hidden){requestAnimationFrame(frame);return;}
 const current=performance.now();if(loaded)pollControls?.(current);advance(current);
 const capHz=recordedControls?60:livePresentationHz;
 if(loaded&&(!capHz||!renderNext||now+.5>=renderNext)){
  const dt=Math.min(5,Math.max(0,(current-lastRender)/1000));lastRender=current;
  if(capHz){
    const period=1000/capHz;
    if(!renderNext)renderNext=now;
    renderNext+=(Math.floor((now+.5-renderNext)/period)+1)*period;
  }
  if(!recordedControls&&(!liveSampleStart||!dt||dt>.5)){
    liveSampleStart=now;liveIntervals=0;liveDrawHz=null;
  }else if(!recordedControls){
    liveIntervals++;
    if(now-liveSampleStart>=1000){
      liveDrawHz=1000*liveIntervals/(now-liveSampleStart);
      liveSampleStart=now;liveIntervals=0;
    }
  }
  // Resizing clears the WebGL canvas. Apply it immediately before drawing;
  // doing it after render exposed a blank world for one presented frame.
  if(drawingResizePending){resizeDrawing();drawingResizePending=false;}
  const drawingStarted=performance.now();drawWalkingFrame(dt,current);
  if(!fixedResolution && renderQuality.sample(dt*1000,performance.now()-drawingStarted,!recordedControls&&(!capHz||capHz>60))!==null)drawingResizePending=true;
 }
 requestAnimationFrame(frame);
}if(comparisonMode){
 Promise.all([import("game/src/reference-playback.js"),fetch(new URL('../data/shot-landmarks.json',"https://radahn-offline.invalid/src/game.js")).then(r=>{if(!r.ok)throw Error('Shot landmarks unavailable');return r.json();}),fetch(new URL('../data/input.jsonl',"https://radahn-offline.invalid/src/game.js")).then(r=>{if(!r.ok)throw Error('Input recording unavailable');return r.text();})]).then(([module,shots,text])=>{
   referenceShots=shots;
   let replay;
   window.referenceFrame=seconds=>{
     if(!loaded)return 'loading';
     if(!replay){
       renderQuality.ratio=fixedPixelRatio();resizeDrawing();
       replay=module.referencePlayback({inputs:text.trim().split(/\r?\n/).map(JSON.parse),timeline:inputTimeline,advance,render:(dt,seconds)=>{referenceSeconds=seconds;render(dt);},composer,
         updateMatrices(){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);}});
     }
     return replay.show(seconds);
   };
 }).catch(e=>{window.referenceError=String(e)});
}else requestAnimationFrame(frame);
























// Read-only timing for distinguishing browser callbacks from presented game frames.
window.gameArtStatus=()=>{
 const maps=[];
 for(const [label,root] of [['player',player.model],['helmet',player.helmet?.shell],['boss',boss.model]]){
  root?.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.visible)return;
   for(const material of [mesh.material].flat()){
    const sizes=['map','normalMap','roughnessMap'].map(slot=>material[slot]?.image?.width??0);
    if(sizes[0]&&!maps.some(row=>row.asset===label&&row.sizes.every((v,i)=>v===sizes[i])))maps.push({asset:label,sizes});
   }
  });
 }
 const shadows=[];scene.traverse(o=>{if(o.isLight&&o.castShadow)shadows.push(o.shadow.mapSize.toArray());});
 return {maps,shadows,masterTextures:player.masterTextures,gaussians:backgroundSplats.count,layers:backgroundSplats.layers,splatVisible:backgroundSplats.spark.visible&&backgroundSplats.splats.visible};
};
window.gameRenderTiming=()=>({
 stage:state.stage,phase:state.phase,bossAction:b.action,playerAction:p.action,
 frames:renderedFrames,at:lastRenderedAt,limitHz:recordedControls?60:livePresentationHz,
 presentation:comparisonMode?'reference':recordedControls?'timed-controls':livePresentationHz?'paced':'display-refresh',
 liveDrawHz:recordedControls?null:liveDrawHz,
 quality:fixedResolution?(nativeQuality?'native':'ultra'):'auto',pixelRatio:renderQuality.ratio,
 width:renderer.domElement.width,height:renderer.domElement.height
});
