import {fitBeastMask,fitConsortLames} from "game/src/character-relief.js";
import {weaponGravity,createBladeGravity} from "game/src/weapon-gravity.js";
const warlordScale=1.25;
import {findRigBone,reconstructBossPose,reshapeWarlordBody,fitConsortArmour,probeWarlordSoles,reshapeWarlordCrown,fitGreatbladeGrip,closeGreatbladeHands,reshapeGreatblade,prepareCurvedBlade,solveBossLimb} from "game/src/boss-reconstruction.js";
import * as T from "game/lib/three.module.js";
import {updateClothNormals,clothSpringGrid,prepareCapeWaves} from "game/src/cloth-normals.js";
import {holyBladeEdge,mountGreatbladeQuillons,createHolySwordWake} from "game/src/holy-weapon.js";
import {BOSS_SWINGS,MOVES,LIGHT_CONTACTS,lightContacts,ROCK_RETURN,ROCK_SEQUENCE,rockBladePlant,RUSH_SEQUENCE,METEOR_SEQUENCE,RIPOSTE_SEQUENCE,RUNNING_THRUST} from "game/src/combat.js";
import {GLTFLoader} from "game/lib/addons/loaders/GLTFLoader.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";
import {clone as cloneSkeleton} from "game/lib/addons/utils/SkeletonUtils.js";
import {createHolyBarrage} from "game/src/holy-barrage.js";
import {createLightTrace} from "game/src/consort-lightspeed.js";
import {createColumnParticles} from "game/src/holy-column-particles.js";
import {createMeteorEjecta} from "game/src/meteor-ejecta.js";
import {createRockImpact} from "game/src/gravity-rock.js";
import {createRiposteSpray} from "game/src/riposte-spray.js";
import {createFractureLightning,createGravitySlab,moveGravityShard} from "game/src/gravity-eruption.js";
import {createConsortCape,capeHang} from "game/src/consort-cape.js";
import {createConsortGreatblade,plantConsortBlade} from "game/src/consort-arms.js";
import {createConsortMane} from "game/src/consort-mane.js";
import {PlayerMotion,copyBonePose} from "game/src/player-motion.js";
import {HorizontalSkinSurface} from "game/src/horizontal-skin-surface.js";
import {playerManeGeometry} from "game/src/player-mane.js";
import {createPlayerCloak} from "game/src/player-cloak.js";
const loader=new GLTFLoader();
// Promised Consort body: image-derived, fully armoured rig (assets/tripo/consort_warlord) with its own helm, horns and plates.
const CONSORT_BODY=true,BOSS_ASSET=CONSORT_BODY?'consort_warlord':'gilded_warlord';
function sourceWarlordFinish(material){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=shader=>{
  previous?.call(material,shader);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float armourRG=diffuseColor.r/max(.01,diffuseColor.g);
   float armourGB=diffuseColor.g/max(.01,diffuseColor.b);
   float armourMask=smoothstep(1.02,1.16,armourRG)*(1.-smoothstep(1.40,1.75,armourRG))*smoothstep(1.10,1.48,armourGB);
   float armourLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
   float recess=1.-smoothstep(.22,.55,armourLuma);
   // Antique gilt: warm gold on the raised work, deep bronze in the recesses.
   vec3 warShade=vec3(pow(max(armourLuma,.00001),1.10))*vec3(.74,.66,.50);
   vec3 warGilt=vec3(pow(max(armourLuma,.00001),.84))*vec3(1.04,.90,.62);
   diffuseColor.rgb=mix(diffuseColor.rgb,mix(warShade,warGilt,smoothstep(.22,.62,armourLuma)),armourMask*(.78+.14*recess));
  `);
 };
 material.customProgramCacheKey=()=>key+'|warlord-antique-gilt-a';material.needsUpdate=true;
}


async function seatConsortCrest(model){
 const reply=await fetch(new URL('../assets/tripo/consort_warlord/crest-coverage.bin',"https://radahn-offline.invalid/src/actors.js"));
 if(!reply.ok)throw Error('Missing fitted crest coverage');
 const weights=new Uint8Array(await reply.arrayBuffer());
 const skin=model.getObjectByProperty('isSkinnedMesh',true),geometry=skin.geometry,p=geometry.attributes.position;
 if(weights.length!==p.count)throw Error('Crest coverage does not fit the consort mesh');
 for(let i=0;i<p.count;i++){
  const w=weights[i]/255;if(!w)continue;
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  p.setXYZ(i,x-w*(.016+.12*x),y-w*.57*Math.max(0,y-1.65),z*(1-.24*w));
 }
 p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
}
function consortArmourFinish(material){
 // The chest stays in shadow under the gorget. Engraved ridges catch the gate light.
 material.metalness=.77;material.roughness=.65;material.envMapIntensity=1.07;
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=shader=>{
  previous?.call(material,shader);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float giltLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
   float giltWarm=smoothstep(.99,1.20,diffuseColor.r/max(.008,diffuseColor.b))*(1.-smoothstep(1.70,2.45,diffuseColor.r/max(.008,diffuseColor.g)));
   // Raised work brightens towards pale gold, recesses keep a brown patina.
   // Antique bronze-gold (7.7 s, 36.5 s): orange-gold on raised work, near-black brown in the chased recesses.
   float bossRaised=smoothstep(.070,.44,giltLuma);
   // Gold leaf catches the grazing key over a dark honey-bronze recess.
   vec3 bronze=mix(vec3(.064,.056,.040),vec3(.405,.295,.175),bossRaised);
   vec3 gilt=mix(bronze,vec3(.80,.625,.38),smoothstep(.67,.98,bossRaised))*(.60+.72*giltLuma);
   float redLacquer=smoothstep(1.55,2.50,diffuseColor.r/max(.008,diffuseColor.g));
   vec3 base=mix(diffuseColor.rgb,mix(diffuseColor.rgb,vec3(giltLuma),.48)*.72,redLacquer);
   diffuseColor.rgb=mix(base*vec3(.94,.93,.93),gilt,.76*giltWarm);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   // Raised gilt picks out a narrow reflection. Dark inlaid plates remain rough.
   roughnessFactor=clamp(mix(roughnessFactor,.67-.35*smoothstep(.48,.96,bossRaised),.78*giltWarm),.28,.89);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
   metalnessFactor=mix(metalnessFactor,.65+.23*bossRaised,giltWarm*.84);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   float plateY=dot(outgoingLight,vec3(.2126,.7152,.0722));
   float broadFace=smoothstep(-.35,.65,inverseTransformDirection(normal,viewMatrix).y);
   vec3 sightLine=inverseTransformDirection(-normalize(vViewPosition),viewMatrix);
   float backlit=smoothstep(.35,.84,dot(sightLine,normalize(vec3(.34,.36,-.94))));
   float ashBounce=(.052+.094*broadFace)*mix(1.,.64,backlit)*sqrt(max(.001,giltLuma));
   vec3 plateNormal=inverseTransformDirection(normal,viewMatrix);
   vec3 reflected=reflect(sightLine,plateNormal);
   float skyStrip=smoothstep(.16,.54,reflected.y)*(1.-smoothstep(.70,.96,reflected.y));
   outgoingLight+=vec3(.28,.19,.081)*skyStrip*giltWarm*(.22+.78*bossRaised);
   outgoingLight+=vec3(1.04,.96,.80)*ashBounce*(1.-smoothstep(.18,.85,plateY))*giltWarm;
   #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=> 'consort-gilt-sky-reflection';material.needsUpdate=true;
}
function bladeIgnition(state,side){
 const t=state.bossElapsed||0,action=state.bossAction,s=T.MathUtils.smoothstep;
 const band=(start,peak,off,end)=>s(t,start,peak)*(1-s(t,off,end));
 if(action==='bloodflame')return band(.5,.98,2.95,3.65);
 if(state.phase!==2||state.stagger||state.critical)return 0;
 if(action==='grab'||action==='stompGrab'){
   const offset=action==='grab'?0:1.35;
   return band(offset+.58,offset+.86,offset+2.08,offset+2.64);
 }
 if(action==='ring')return side===1?band(.19,.78,2.65,3.25):.78*band(.38,.98,2.48,3.15);
 // Primary clip 68.2-68.7: both blades stay dark steel while he hangs; only a faint edge light remains.
 if(action==='nova')return .20*band(.29,1.14,6.24,7.3);
 if(action==='meteor')return band(.28,1.10,2.40,3.2);
 if(['lightspeed','dash','sideDash'].includes(action)){
   const last=lightContacts(action,state.rockFollowup).at(-1);
   const power=.84*band(.08,.34,last,last+.45);
   if(action==='lightspeed'&&state.rockFollowup){
     // The sword light trails the four copies. At the physical strike the
     // steel enters the ash before the field of holy pillars flares.
     const inAsh=s(t,ROCK_RETURN.arrive-.05,ROCK_RETURN.land)*(1-s(t,2.46,2.78));
     return power*(1-.92*inAsh);
   }
   return power;
 }
 if(action==='cross'&&t<1.38)return 0;
 if(action==='promised'){
   // The foot plants on bare steel. Light gathers on the raised blades in
   // the 96.8 s overhead tell and stays on them between the following cuts.
   const lag=side===1?0:.045;
   const lit=s(t,2.24+lag,2.66+lag);
   const overhead=band(2.29,2.72,3.58,4.06);
   const follow=band(4.77,4.98,5.55,6.13);
   return lit*(.59+.56*Math.max(overhead,follow,s(t,6.36,7.28)));
 }
 if(Number.isFinite(state.holyRecover))return 1.15*(1-s(state.holyRecover,.17,.55));
 let result=0;
 for(const contact of MOVES[action]?.contacts||[]){
   if(contact.area||(contact.hand&&contact.hand!==side))continue;
   result=Math.max(result,band(contact.t-.44,contact.t-.09,contact.t+.09,contact.t+.33));
 }
 return result;
}
function createHeadFurMotion(mesh){
 const geometry=mesh.geometry,a=geometry.attributes.position,weights=[],phases=[];
 const red=mesh.name==='warlord-red-mane';
 const guide=geometry.attributes.peltGuide;
 for(let i=0;i<a.count;i++){const y=a.getY(i),along=geometry.attributes.uv.getY(i),w=guide?along*along:red?along:T.MathUtils.clamp((.23-y)/.6,0,1);weights.push(w);const lock=Math.floor(i/42/12);phases.push(guide?guide.getX(i):red?lock*1.71:y*8+i*.02,guide?guide.getY(i):red?lock*.91:y*7);}
 geometry.setAttribute('headFurWeight',new T.Float32BufferAttribute(weights,1));geometry.setAttribute('headFurPhase',new T.Float32BufferAttribute(phases,2));
 geometry.deleteAttribute('peltGuide');
 geometry.computeBoundingSphere();geometry.boundingSphere.radius+=red ? .25 : guide ? .17 : .03;
 const uniforms={headFurTime:{value:0},headFurScale:{value:red?2.45:1},headFurTurn:{value:0}};
 if(guide)uniforms.peltTrail={value:new T.Vector3()};
 if(red)uniforms.maneRestBasis={value:new T.Matrix3()};
 const deform=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader=(red?'uniform mat3 maneRestBasis;\n':guide?'uniform vec3 peltTrail;\n':'')+'uniform float headFurTime;uniform float headFurScale;uniform float headFurTurn;attribute float headFurWeight;attribute vec2 headFurPhase;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   transformed.x+=(sin(headFurTime*2.8+headFurPhase.x)*.018*headFurScale+headFurTurn)*headFurWeight;
   transformed.z+=cos(headFurTime*2.1+headFurPhase.y)*headFurWeight*.024*headFurScale;`);
  if(guide)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed+=peltTrail*headFurWeight;');
  if(red){
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    // The crown rotates with the head; the long red locks settle behind the shoulders.
    vec3 scalp=vec3(0.,.09,.07);
    float freeEnd=smoothstep(.04,.94,headFurWeight);
    vec3 lock=transformed-scalp;
    transformed+=.83*freeEnd*((maneRestBasis*lock)-lock);
    transformed+=maneRestBasis*vec3(position.x*.28,-.23,0.)*freeEnd;
   `);
  }
 };
 mesh.material.onBeforeCompile=deform;mesh.material.customProgramCacheKey=()=> red?'red-mane-rest-aq':guide?'player-pelt-motion-2':'head-fur-motion-v1';
 mesh.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:mesh.material.map,alphaTest:mesh.material.alphaTest,side:mesh.material.side});
 mesh.customDepthMaterial.onBeforeCompile=deform;mesh.customDepthMaterial.customProgramCacheKey=()=> red?'red-mane-rest-depth-aq':guide?'player-pelt-depth-2':'head-fur-motion-depth-v1';
 return uniforms;
}

// Silhouettes measured from the primary equipment menu and 25.43 s grip view.
// Dimensions are reconstruction estimates; this changes visible meshes only.
function sourceDagger(length){
 const group=new T.Group(),steel=new T.MeshStandardMaterial({color:0x8c8c83,metalness:.84,roughness:.43});
 const dark=new T.MeshStandardMaterial({color:0x3d3b34,metalness:.25,roughness:.78});
 const add=(g,m,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;group.add(o);return o;};
 const profile=[[.045,.030,.014],[.11,.026,.014],[.33,.016,.009],[.46,.001,.001]],v=[],idx=[];
 for(const [y,w,d] of profile)v.push(-w,y,0,0,y,d,w,y,0,0,y,-d);
 for(let j=0;j<profile.length-1;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4;idx.push(a,b,a+4,b,b+4,a+4);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();add(geo,steel);
 add(new T.CylinderGeometry(.022,.025,.14,10),dark,0,-.045);add(new T.SphereGeometry(.032,10,6),steel,0,-.14);
 const tube=(pts,r=.008)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p))),30,r,6,false),steel);
 // Curved enclosing knuckle guard with the visible diagonal open ribs.
 tube([[0,-.15,0],[.085,-.13,0],[.15,-.06,0],[.16,.015,0],[.12,.07,0],[.045,.085,0],[-.065,.06,0]],.011);
 for(let i=0;i<6;i++){const f=i/5; tube([[.01,-.12+f*.17,.008],[.06+f*.045,-.10+f*.17,.025],[.12+Math.sin(f*Math.PI)*.035,-.08+f*.14,0]],.0045);}
 tube([[-.075,.06,0],[-.05,.035,0],[0,.035,0],[.075,.06,0]],.009);
 for(let i=0;i<9;i++)add(new T.TorusGeometry(.024,.0025,4,10),steel,0,-.108+i*.014).rotation.x=Math.PI/2;
 // The blade and guard are rigid. Bake their local transforms once so the rings
 // and ribs share one steel draw call on every frame and shadow pass.
 for(const material of [steel,dark]){
   const pieces=group.children.filter(mesh=>mesh.material===material);
   const geometry=pieces.map(mesh=>{
     mesh.updateMatrix();
     mesh.geometry.applyMatrix4(mesh.matrix);
     mesh.geometry.deleteAttribute('uv');
     return mesh.geometry;
   });
   const joined=mergeGeometries(geometry);
   group.remove(...pieces);
   for(const original of geometry)original.dispose();
   add(joined,material);
 }
 group.scale.setScalar(length/.61);group.position.y=.045*length/.61;return group;
}
function sourceSwordGuard(){
 const group=new T.Group(),steel=new T.MeshStandardMaterial({color:0x68675e,metalness:.86,roughness:.42});
 for(const sign of [-1,1]){
  const shape=new T.Shape();const outline=[[.015,.14],[.095,.135],[.18,.08],[.25,-.015],[.28,-.075],[.235,-.045],[.145,.045],[.065,.105],[.015,.105]];outline.forEach(([x,y],i)=>i?shape.lineTo(sign*x,y):shape.moveTo(sign*x,y));shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:1,steps:1});geometry.translate(0,0,-.0125);const mesh=new T.Mesh(geometry,steel);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
 }
 return group;
}

// Each loaded rig has a fixed bone map. Pose builders repeatedly resolve the
// same suffixes while turning, including on chained IK and weapon updates.
const rigMatches=new WeakMap();
function matchRig(bones,pattern){
  let matches=rigMatches.get(bones);
  if(!matches){matches=new Map();rigMatches.set(bones,matches);}
  const key=pattern.toString();
  if(!matches.has(key))matches.set(key,Object.entries(bones).find(([name])=>pattern.test(name))?.[1]);
  return matches.get(key);
}

export class Actor{
 constructor(scene,name,height,ultra=false){this.ultra=ultra;this.scene=scene;this.name=name;this.height=height;this.presentationScale=name==='gilded_warlord'?warlordScale:1;this.root=new T.Group();this.visual=new T.Group();this.root.add(this.visual);scene.add(this.root);this.actions={};this.bones={};this.poseJoints=[];this.ready=false;this.weapons=[];this.clasps=[];this.loaded=0;}
 impactPoint(toward){
  this.root.updateWorldMatrix(true,true);
  const point=this.capeMount?.chest?.getWorldPosition(new T.Vector3())||this.root.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,this.height*.65,0));
  point.y-=.45;
  const direction=toward.clone().sub(this.root.getWorldPosition(new T.Vector3())).setY(0);
  if(direction.lengthSq()<1e-6)return point;
  direction.normalize();this.impactRay??=new T.Raycaster();
  this.impactRay.set(point.clone().addScaledVector(direction,this.height),direction.clone().negate());
  this.impactRay.near=0;this.impactRay.far=this.height*2;
  // Query the posed torso surface, not an assumed radius inside the armor.
  // The small offset keeps translucent smoke immediately outside that surface.
  // One ray may visit the same skinned vertex through many indexed
  // triangles. Cache its double-precision result only within this query;
  // restore the method before another pose/frame can access the model.
  this.impactVertexCache??=new WeakMap();this.impactBoneCache??=new WeakMap();this.impactSurfaces??=new WeakMap();
  const restore=[],posedSkeletons=new Set();let hit;
  try{
   this.model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    if(this.impactRay.ray.direction.y===0 && HorizontalSkinSurface.supports(mesh)){
     let surface=this.impactSurfaces.get(mesh);
     if(!surface){surface=new HorizontalSkinSurface(mesh);this.impactSurfaces.set(mesh,surface);}
     restore.push({mesh,raycast:mesh.raycast,ownRaycast:Object.hasOwn(mesh,'raycast')});
     mesh.raycast=function(raycaster,hits){
      const point=surface.intersect(raycaster);
      if(point)hits.push({object:this,point,distance:point.distanceTo(raycaster.ray.origin)});
     };
     return;
    }
    const count=mesh.geometry.attributes.position.count;
    let cache=this.impactVertexCache.get(mesh);
    if(!cache||cache.ready.length!==count){cache={ready:new Uint8Array(count),positions:new Float64Array(count*3)};this.impactVertexCache.set(mesh,cache);}
    cache.ready.fill(0);
    const original=mesh.getVertexPosition,own=Object.hasOwn(mesh,'getVertexPosition');restore.push({mesh,original,own});
    mesh.getVertexPosition=function(index,target){
     const offset=index*3;
     if(cache.ready[index])return target.fromArray(cache.positions,offset);
     original.call(this,index,target);target.toArray(cache.positions,offset);cache.ready[index]=1;return target;
    };
    // Bone matrices are identical for every vertex in this synchronous query.
    // Keep doubles here: the renderer's Float32 palette changes surface hits.
    if(mesh.applyBoneTransform===T.SkinnedMesh.prototype.applyBoneTransform){
     const skeleton=mesh.skeleton;
     let palette=this.impactBoneCache.get(skeleton);
     if(!palette||palette.length!==skeleton.bones.length){palette=skeleton.bones.map(()=>new T.Matrix4());this.impactBoneCache.set(skeleton,palette);}
     if(!posedSkeletons.has(skeleton)){
      for(let i=0;i<palette.length;i++)palette[i].multiplyMatrices(skeleton.bones[i].matrixWorld,skeleton.boneInverses[i]);
      posedSkeletons.add(skeleton);
     }
     const entry=restore.at(-1);entry.boneTransform=mesh.applyBoneTransform;entry.ownBoneTransform=Object.hasOwn(mesh,'applyBoneTransform');
     const skinIndex=new T.Vector4(),skinWeight=new T.Vector4(),base=new T.Vector4(),vertex=new T.Vector4();
     mesh.applyBoneTransform=function(index,target){
      skinIndex.fromBufferAttribute(this.geometry.attributes.skinIndex,index);skinWeight.fromBufferAttribute(this.geometry.attributes.skinWeight,index);
      if(target.isVector4){base.copy(target);target.set(0,0,0,0);}else{base.set(target.x,target.y,target.z,1);target.set(0,0,0);}
      base.applyMatrix4(this.bindMatrix);
      for(let i=0;i<4;i++){const weight=skinWeight.getComponent(i);if(weight!==0)target.addScaledVector(vertex.copy(base).applyMatrix4(palette[skinIndex.getComponent(i)]),weight);}
      if(target.isVector4)target.w=base.w;
      return target.applyMatrix4(this.bindMatrixInverse);
     };
    }
    mesh.computeBoundingSphere();
   });
   hit=this.impactRay.intersectObject(this.model,true)[0];
  }finally{
   for(const {mesh,original,own,boneTransform,ownBoneTransform,raycast,ownRaycast} of restore){
    if(raycast){
     if(ownRaycast)mesh.raycast=raycast;else delete mesh.raycast;
     continue;
    }
    if(own)mesh.getVertexPosition=original;else delete mesh.getVertexPosition;
    if(boneTransform){if(ownBoneTransform)mesh.applyBoneTransform=boneTransform;else delete mesh.applyBoneTransform;}
   }
  }
  if(hit)return hit.point.clone().addScaledVector(direction,.14);
  return point.addScaledVector(direction,.95);
 }
 async load(){this.consortBody=CONSORT_BODY&&this.name==='gilded_warlord';const gltf=await loader.loadAsync(this.name==='gilded_warlord'?`assets/tripo/${BOSS_ASSET}/${this.consortBody?'rig.vigil.glb':'rig.glb'}`:`assets/tripo/${this.name}/${this.masterTextures?'rig.master.glb':'rig.detail.glb'}`);this.model=gltf.scene;this.visual.add(this.model);this.model.rotation.y=Math.PI/2;this.model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(this.model),size=box.getSize(new T.Vector3());const scale=this.height/size.y*(this.consortBody?1.065:1);this.model.scale.set(scale*(this.consortBody?1.10:this.name==='gilded_warlord'?1.30:.97),scale,scale*(this.consortBody?1.05:this.name==='gilded_warlord'?1.22:1.04));this.model.position.y=-box.min.y*scale;this.model.traverse(o=>{if(o.isBone)this.bones[o.name]=o;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(this.name==='gilded_warlord'&&!this.consortBody){o.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat redCloth=smoothstep(1.4,2.0,diffuseColor.r/max(.01,diffuseColor.g))*(1.0-smoothstep(1.25,1.8,diffuseColor.g/max(.01,diffuseColor.b)));diffuseColor.rgb*=mix(vec3(1.),vec3(.62,.68,.7),redCloth);');};}}});this.poseJoints=Object.entries(this.bones);this.root.updateMatrixWorld(true);
 if(this.name==='gilded_warlord'&&!this.consortBody)this.model.traverse(o=>{if(o.isMesh)sourceWarlordFinish(o.material);});
 if(this.consortBody)await seatConsortCrest(this.model);
 if(this.consortBody)this.model.traverse(o=>{if(o.isMesh)consortArmourFinish(o.material);});
 // The body asset includes broad sculpted hair under the separate fitted helmet.
 // Remove covered scalp locks in the neutral head frame, retaining the face and
 // the skinning attributes. This runs before asynchronous animation loading.
 if(this.name==='gilded_warlord'&&!this.consortBody){
  const head=Object.values(this.bones).find(b=>/Head$/.test(b.name));
  if(head){const origin=head.getWorldPosition(new T.Vector3()),point=new T.Vector3();
   this.model.traverse(o=>{if(!o.isSkinnedMesh)return;const source=o.geometry,a=source.attributes,remove=[];
    for(let i=0;i<a.position.count;i++){let headWeight=0;for(let k=0;k<4;k++)if(o.skeleton.bones[a.skinIndex.getComponent(i,k)]===head)headWeight+=a.skinWeight.getComponent(i,k);
     o.getVertexPosition(i,point).applyMatrix4(o.matrixWorld).sub(origin);
     remove[i]=headWeight>.35&&(point.y>.11||Math.abs(point.x)>.255||point.z>.08);
    }
    const indices=source.index?Array.from(source.index.array):Array.from({length:a.position.count},(_,i)=>i),keep=[];
    for(let i=0;i<indices.length;i+=3)if(!remove[indices[i]]&&!remove[indices[i+1]]&&!remove[indices[i+2]])keep.push(indices[i],indices[i+1],indices[i+2]);
    if(keep.length&&keep.length<indices.length){o.geometry=source.clone();o.geometry.setIndex(keep);}
   });
  }
 }
 // The original body already contains a beast mask and scalp locks. The
 // separately fitted source-derived head covers that duplicate geometry.
 if(this.name==='ivory_duelist'){
  const head=Object.values(this.bones).find(b=>/Head$/.test(b.name));
  if(head)this.model.traverse(o=>{
   if(!o.isSkinnedMesh)return;const source=o.geometry,a=source.attributes,remove=[];
   for(let i=0;i<a.position.count;i++){
    let weight=0;for(let k=0;k<4;k++)if(o.skeleton.bones[a.skinIndex.getComponent(i,k)]===head)weight+=a.skinWeight.getComponent(i,k);
    remove[i]=weight>.25;
   }
   const indices=source.index?Array.from(source.index.array):Array.from({length:a.position.count},(_,i)=>i),keep=[];
   for(let i=0;i<indices.length;i+=3)if(!remove[indices[i]]&&!remove[indices[i+1]]&&!remove[indices[i+2]])keep.push(indices[i],indices[i+1],indices[i+2]);
   if(keep.length&&keep.length<indices.length){o.geometry=source.clone();o.geometry.setIndex(keep);}
  });
 }
 // The source has one trailing cape. The body asset's embedded back cloth
 // intersects the fitted simulated cape during turns; remove only its red
 // back-facing triangles in the neutral rig, retaining front/side garments.
 if(this.name==='gilded_warlord'&&!this.consortBody)this.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.material.map?.image)return;
  const map=mesh.material.map,image=map.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,geometry=mesh.geometry,a=geometry.attributes,point=new T.Vector3(),remove=new Uint8Array(a.position.count);
  for(let i=0;i<a.position.count;i++){
   mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
   if(point.y<.5||point.y>3.85||point.z<.24||Math.abs(point.x)>1.5)continue;
   const u=T.MathUtils.clamp(a.uv.getX(i),0,1),v=T.MathUtils.clamp(map.flipY?1-a.uv.getY(i):a.uv.getY(i),0,1);
   const pixel=(Math.min(canvas.height-1,Math.floor(v*canvas.height))*canvas.width+Math.min(canvas.width-1,Math.floor(u*canvas.width)))*4;
   const r=pixels[pixel],g=pixels[pixel+1],b=pixels[pixel+2];remove[i]=r>35&&r>g*1.6&&r>b*1.08?1:0;
  }
  const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:a.position.count},(_,i)=>i),keep=[];
  for(let k=0;k<indices.length;k+=3)if(!(remove[indices[k]]&&remove[indices[k+1]]&&remove[indices[k+2]]))keep.push(indices[k],indices[k+1],indices[k+2]);
  mesh.geometry=geometry.clone();mesh.geometry.setIndex(keep);
  mesh.userData.removedEmbeddedCapeTriangles=(indices.length-keep.length)/3;
 });
 if(this.consortBody){fitConsortArmour(this);fitConsortLames(this);probeWarlordSoles(this);}else reshapeWarlordBody(this);
 const floorBox=new T.Box3().setFromObject(this.model,true);let ankle=Infinity;for(const [name,bone] of this.poseJoints)if(/Foot$/.test(name))ankle=Math.min(ankle,bone.getWorldPosition(new T.Vector3()).y);this.footClearance=Number.isFinite(ankle)?Math.max(.01,ankle-floorBox.min.y):.08;
 // Store the neutral rig frame now. Rendering may turn/animate the actor
 // while separate headgear and weapon requests are still in flight.
 const rootInverse=this.root.getWorldQuaternion(new T.Quaternion()).invert();this.restBoneInverses={};
 for(const [name,bone] of this.poseJoints)this.restBoneInverses[name]=rootInverse.clone().multiply(bone.getWorldQuaternion(new T.Quaternion())).normalize().invert();
 this.mixer=new T.AnimationMixer(this.model);const boss=this.name==='gilded_warlord';const cloth=new T.PlaneGeometry(boss?3.0:1.5,boss?2.85:1.08,24,28);const cp=cloth.attributes.position;for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),v=1-(y/(boss?2.85:1.08)+.5),u=x/(boss?3.0:1.5)*2;cp.setX(i,boss?x*(.62+v*.38):Math.sin(u*1.5)*(.38+v*.26)*(1+Math.sin(u*21)*.07));cp.setZ(i,boss?.05+v*.4+Math.cos(u*2)*.18+Math.sin(u*13+v*3+.7*Math.sin(u*5))*(.035+.135*v)+Math.sin(u*27-v*4)*.043*v:Math.cos(u*1.5)*(.22+v*.12)*(1+Math.sin(u*21)*.13)+Math.sin(u*22)*.035*v);cp.setY(i,y-(boss?0:.13*Math.pow(Math.abs(u),1.7)*(1-v))+Math.sin(u*9)*.035*v+(boss?Math.pow(v,8)*(.09+Math.sin(u*17)*.08+Math.sin(u*39)*.04):0));}
 cloth.computeVertexNormals();const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const cx=canvas.getContext('2d');cx.scale(2,2);cx.fillStyle=boss?'#641b26':'#a99e86';cx.fillRect(0,0,256,256);for(let i=0;i<5000;i++){const a=Math.sin(i*23.3)*.5+.5,b=Math.sin(i*47.1)*.5+.5;cx.fillStyle=i%2?'#302f2722':'#eee2c922';cx.fillRect(a*256,b*256,1,3);}cx.strokeStyle=boss?'#544435':'#968260';cx.lineWidth=3;for(const x of [15,30,225,240]){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,256);cx.stroke();}for(let y=0;y<256;y+=18){cx.beginPath();cx.ellipse(25,y,6,9,0,0,6.283);cx.stroke();cx.beginPath();cx.ellipse(231,y,6,9,0,0,6.283);cx.stroke();}if(!boss){cx.strokeStyle='#998563';cx.lineWidth=2;for(const y of [239,247]){cx.beginPath();cx.moveTo(0,y);cx.lineTo(256,y);cx.stroke();}cx.fillStyle='#4f4a4122';for(let i=0;i<65;i++){const x=(i*61)%256,y=175+(i*29%81);cx.beginPath();cx.ellipse(x,y,2+i%5,3+i%4,0,0,6.283);cx.fill();}}if(boss){
  // Primary 47-50: worn muted crimson with narrow faded edging. Remove the
  // earlier repeated large circles and diagonal pattern from the extra cloth.
  cx.clearRect(0,0,256,256);cx.fillStyle='#635052';cx.fillRect(0,0,256,256);
  for(let i=0;i<115;i++){
    const x=(i*137%263)-4,y=(i*179%269)-5,r=4+i%19;
    const dye=cx.createRadialGradient(x,y,0,x,y,r);
    dye.addColorStop(0,i%3?'rgba(87,29,41,.46)':'rgba(58,55,49,.40)');
    dye.addColorStop(1,'rgba(74,39,47,0)');cx.fillStyle=dye;cx.fillRect(x-r,y-r,2*r,2*r);
  }
  for(let i=0;i<9;i++){
   const x=i*31+Math.sin(i*3)*9-2,g=cx.createLinearGradient(x-8,0,x+12,0);
   g.addColorStop(0,'rgba(20,12,13,0)');g.addColorStop(.5,'rgba(20,12,13,.12)');g.addColorStop(1,'rgba(190,133,123,.12)');
   cx.fillStyle=g;cx.fillRect(x-8,0,20,256);
  }
  for(let i=0;i<7000;i++){const a=Math.sin(i*12.9898)*43758.5453,b=Math.sin(i*78.233)*21458.31,x=(a-Math.floor(a))*256,y=(b-Math.floor(b))*256;cx.fillStyle=i%3?'rgba(26,19,18,.08)':'rgba(185,153,126,.13)';cx.fillRect(x,y,1,1+i%3);}
  // Worn broad folds cross the back diagonally while the hem swings;
  // the fine weave stays in the fabric coordinates as the cape deforms.
  for(let row=0;row<213;row++){
    const y=row*1.21;
    cx.strokeStyle=row%6?'rgba(46,24,30,.035)':'rgba(155,128,116,.07)';
    cx.lineWidth=row%6?.52:.91;
    cx.beginPath();cx.moveTo(0,y);
    cx.bezierCurveTo(62,y-19,148,y+26,256,y-6);cx.stroke();
  }
  cx.strokeStyle='rgba(147,126,91,.35)';cx.lineWidth=.8;
  for(const x of [12,17,239,244]){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,256);cx.stroke();}
  const wear=cx.createLinearGradient(0,175,0,256);wear.addColorStop(0,'rgba(46,35,27,0)');wear.addColorStop(1,'rgba(46,35,27,.32)');cx.fillStyle=wear;cx.fillRect(0,175,256,81);
  cx.globalCompositeOperation='destination-out';for(let i=0;i<19;i++){const x=(i*47)%256,w=2+i%5,h=5+(i*13%22);cx.beginPath();cx.moveTo(x-w,256);cx.lineTo(x+1,256-h);cx.lineTo(x+w,256);cx.fill();}cx.globalCompositeOperation='source-over';}
 if(!boss){
  // Primary cloak: pale woven fields, long shaded folds, darkened hem and
  // restrained gold stitching. This texture is procedural, not footage.
  for(let i=0;i<9;i++){
   const x=16+i*28,g=cx.createLinearGradient(x-8,0,x+12,0);
   g.addColorStop(0,'rgba(46,38,25,0)');g.addColorStop(.50,'rgba(46,38,25,.24)');g.addColorStop(1,'rgba(255,239,199,.08)');
   cx.fillStyle=g;cx.fillRect(x-8,12,20,225);
  }
  const hem=cx.createLinearGradient(0,155,0,256);hem.addColorStop(0,'rgba(61,49,30,0)');hem.addColorStop(1,'rgba(61,49,30,.45)');cx.fillStyle=hem;cx.fillRect(0,155,256,101);
  for(let i=0;i<60;i++){
    const x=i*4.37,y=213+(i*17%34),end=251-(i*7%15);
    cx.save();cx.globalCompositeOperation='destination-out';cx.beginPath();cx.moveTo(x-2,256);
    cx.lineTo(x+.9,y);cx.lineTo(x+1.4,end);cx.lineTo(x+4.5,256);cx.fill();cx.restore();
  }
  cx.strokeStyle='#b5a078';cx.lineWidth=.7;
  for(const side of [1,-1])for(let i=0;i<11;i++){
   const x=side===1?38:218,y=28+i*18;cx.beginPath();cx.moveTo(x,y-7);cx.bezierCurveTo(x+side*8,y-4,x+side*8,y+4,x,y+7);cx.bezierCurveTo(x-side*5,y+2,x-side*5,y-2,x,y-7);cx.stroke();
  }
 }
 if(!boss){
   const shade=cx.createLinearGradient(0,0,35,245);
   shade.addColorStop(0,'rgba(39,32,29,.52)');shade.addColorStop(.43,'rgba(54,46,39,.22)');shade.addColorStop(1,'rgba(47,39,35,.36)');
   cx.fillStyle=shade;cx.fillRect(0,0,256,256);
   for(let i=0;i<33;i++){
     const x=i*8+Math.sin(i*4.2)*3;cx.beginPath();cx.moveTo(x,12+i%4*11);
     cx.bezierCurveTo(x+7,74,x-9,139,x+Math.sin(i*2.3)*17,255);
     cx.lineWidth=1.5+i%4;cx.strokeStyle=i%4?'rgba(51,43,38,.21)':'rgba(219,199,161,.20)';cx.stroke();
   }
 }
 const clothMap=new T.CanvasTexture(canvas);clothMap.colorSpace=T.SRGBColorSpace;this.cape=new T.Mesh(cloth,new T.MeshStandardMaterial({map:clothMap,roughness:1,alphaTest:.35,side:T.DoubleSide}));if(boss){
  // Light through the thin cloth keeps the shaded side crimson during the
  // gravity rush; the steel can still take the stronger violet reflections.
  this.cape.material.onBeforeCompile=shader=>{
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
     'outgoingLight += diffuseColor.rgb * vec3(.16,.064,.043) * (gl_FrontFacing ? .68 : 1.);\n#include <opaque_fragment>');
  };
    this.cape.material.customProgramCacheKey=()=> 'worn-crimson-cape-as';
 }this.cape.position.set(0,boss?2.25:1.0,boss?.14:.12);this.visual.add(this.cape);this.cape.castShadow=true;this.cape.receiveShadow=true;this.cape.visible=true;this.capeBase=Float32Array.from(cp.array);
 if(boss){const consort=createConsortCape();this.cape.geometry=consort.geometry;this.cape.material=consort.material;this.cape.position.set(0,consort.centerY,consort.offsetZ);this.capeBase=Float32Array.from(consort.geometry.attributes.position.array);this.capeHeight=consort.height;this.setCapeSight=consort.setSight;this.cape.name='consort-cape';}
 {
   this.root.updateMatrixWorld(true);const chest=matchRig(this.bones,/Spine2$/);
   if(chest){this.chestBindInverse=chest.matrixWorld.clone().invert();this.capeMount={chest,local:chest.matrixWorld.clone().invert().multiply(this.cape.matrixWorld)};this.scene.attach(this.cape);}
 }
 this.installPlayerCloth();this.ready=true;return this;}
 installPlayerCloth(){
   if(this.name!=='ivory_duelist')return;
   this.root.updateMatrixWorld(true);
   const inverse=this.root.matrixWorld.clone().invert(),point=new T.Vector3();
   this.playerCloth={motion:{value:new T.Vector3()},time:{value:0},jump:{value:0},stats:{vertices:0,moving:0,maxWeight:0}};
   this.model.traverse(mesh=>{
     if(!mesh.isSkinnedMesh)return;
     const geometry=mesh.geometry,a=geometry.attributes,weights=[],rest=[];
     for(let i=0;i<a.position.count;i++){
       mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
       let garment=0;
       for(let k=0;k<4;k++){
         const bone=mesh.skeleton.bones[a.skinIndex.getComponent(i,k)];
         if(/(?:Hips|Spine[0-9]?)$/.test(bone.name))garment+=a.skinWeight.getComponent(i,k);
       }
       const hem=1-T.MathUtils.smoothstep(point.y,.58,1.45);
       const outside=T.MathUtils.smoothstep(Math.hypot(point.x,point.z),.23,.38);
       const back=T.MathUtils.smoothstep(point.z,-.22,.06);
       const weight=hem*hem*outside*back*T.MathUtils.smoothstep(garment,.20,.65);
       weights.push(weight);rest.push(point.x,point.y,point.z);
       this.playerCloth.stats.vertices++;if(weight>.01)this.playerCloth.stats.moving++;
       this.playerCloth.stats.maxWeight=Math.max(this.playerCloth.stats.maxWeight,weight);
     }
     geometry.setAttribute('playerClothWeight',new T.Float32BufferAttribute(weights,1));
     geometry.setAttribute('playerClothRest',new T.Float32BufferAttribute(rest,3));
     const basis=new T.Matrix3().setFromMatrix4(mesh.matrixWorld.clone().invert().multiply(this.root.matrixWorld));
     const uniforms={playerClothMotion:this.playerCloth.motion,playerClothTime:this.playerCloth.time,playerClothJump:this.playerCloth.jump,playerClothBasis:{value:basis}};
     const deform=shader=>{
       Object.assign(shader.uniforms,uniforms);
       shader.vertexShader='attribute float playerClothWeight;attribute vec3 playerClothRest;uniform vec3 playerClothMotion;uniform float playerClothTime,playerClothJump;uniform mat3 playerClothBasis;\n'+shader.vertexShader;
       shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>
         float flare=playerClothMotion.z;
         float rear=smoothstep(-.1,.3,playerClothRest.z);
         float fold=sin(playerClothRest.x*17.+playerClothRest.y*6.-playerClothTime*5.);
         vec3 offset=vec3(
           sign(playerClothRest.x)*flare*.19+playerClothJump*.57-playerClothMotion.y*.08,
           flare*.35+playerClothJump*(.25+.29*playerClothRest.x)+.15*rear*(.66+.34*sin(playerClothRest.x*17.0)),
           rear*(playerClothMotion.x*.20+flare*.25)+fold*.016*playerClothMotion.x);
         transformed+=playerClothBasis*(offset*playerClothWeight);
       `);
     };
     for(const material of (Array.isArray(mesh.material)?mesh.material:[mesh.material])){
       const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
       material.onBeforeCompile=shader=>{previous?.call(material,shader);deform(shader);};
       material.customProgramCacheKey=()=>key+'|source-garment-v1';material.needsUpdate=true;
     }
     const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
     mesh.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:material.map,alphaTest:material.alphaTest,side:material.side});
     mesh.customDepthMaterial.onBeforeCompile=deform;
     mesh.customDepthMaterial.customProgramCacheKey=()=> 'source-garment-depth-v1';
     geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.7;
   });
 }
 playerClothDrive(state){
   // Same primary footage: 23.55-24.30 thrust hems sweep after the shoulder;
   // 41.75-42.375 parry opens the cloak; 120.85-121.35 withdrawal swings it back.
   // Action-local envelopes only. No recording-time or input-sequence branches.
   let keys,t;
   if(state.critical){t=state.critical*RIPOSTE_SEQUENCE.duration;keys=[[0,0,0],[.25,-.5,.06],[.60,1.15,.45],[1.10,.15,.12],[2.38,0,0],[2.60,-.8,.22],[2.79,-1.5,.58],[3,0,.12]];}
   else if(state.motion==='slash'&&state.strike==='light'){
     const running=!!state.runningThrust,d=running?RUNNING_THRUST.duration:.72;t=(state.progress||0)*d;
     keys=running?[[0,0,0],[.22,-.5,.10],[.48,1.5,.60],[.70,.8,.45],[d,0,0]]
       :[[0,0,0],[.10,-.5,.08],[.26,1.5,.58],[.42,.8,.45],[d,0,0]];
   }else if(state.motion==='slash'&&state.strike==='heavy'){
     t=(state.progress||0)*1.2;keys=[[0,0,0],[.27,-.78,.16],[.55,1.72,.76],[.83,.94,.50],[1.20,0,0]];
   }else if(Number.isFinite(state.castTime)){
     t=state.castTime;keys=[[0,0,0],[.72,-.34,.06],[1.62,-.62,.12],[2.19,.84,.34],[2.56,.41,.18],[2.85,0,0]];
   }else if(state.parry&&Number.isFinite(state.parryTime)){t=state.parryTime;keys=[[0,0,0],[.14,-.7,.12],[.39,1.6,.65],[.56,.65,.30],[.73,0,0]];}
   if(!keys)return new T.Vector2();
   const v=this.playerPoseKey(keys,t);return new T.Vector2(v[1],v[2]);
 }
 updatePlayerCloth(dt,state,t){
   if(!this.playerCloth)return;
   const speed=Math.min(1,(this.clothSpeed||0)/5.6),turn=T.MathUtils.clamp(this.clothTurn||0,-2,2),flight=state.jumpFlight;
   const airborne=flight?.windup?Math.sin(Math.PI*T.MathUtils.clamp((flight.elapsed-flight.windup)/(flight.duration-flight.windup),0,1)):0;
   // Primary 127.9-128.3: the lower back and side hem lift after takeoff;
   // the shoulder region remains fixed. Locomotion follows actual velocity.
   const flare=Math.max(airborne,speed*.38,this.attackCloth?.y||0);
   this.playerCloth.motion.value.lerp(new T.Vector3(speed,turn+(this.attackCloth?.x||0),flare),1-Math.exp(-dt*13));
   this.playerCloth.jump.value=airborne;
   this.playerCloth.time.value=t;
 }
 async headgear(asset,height,offset=0){const g=await loader.loadAsync(`assets/tripo/${asset}/${asset==='beast_head_faithful'&&this.masterTextures?'model.master.glb':['beast_head_faithful','warlord_headgear'].includes(asset)?'model.detail.glb':'model.web.glb'}`);const shell=new T.Group();const m=g.scene;m.rotation.y=Math.PI/2;m.updateMatrixWorld(true);const box=new T.Box3().setFromObject(m),size=box.getSize(new T.Vector3());const scale=height/size.y;m.scale.setScalar(scale);m.position.set(-(box.min.x+box.max.x)*.5*scale,-(box.min.y+box.max.y)*.5*scale,-(box.min.z+box.max.z)*.5*scale);m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(o.isMesh&&asset==='beast_head_faithful'){o.material.roughness=.86;o.material.metalness=0;o.material.metalnessMap=null;o.material.normalScale.setScalar(1.12);o.material.color.set(0xffffff);o.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat furLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(furLuma)*vec3(1.04,.86,.77),.67)*.83;');};}});shell.add(m);if(asset==='warlord_headgear')m.traverse(o=>{if(o.isMesh)sourceWarlordFinish(o.material);});if(asset==='beast_head_faithful'){
 shell.updateMatrixWorld(true);m.traverse(o=>{if(!o.isMesh)return;const inv=o.matrixWorld.clone().invert(),p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld),back=T.MathUtils.smoothstep(v.z,-.17,.01),lower=1-T.MathUtils.smoothstep(v.y,-.10,.20),weight=back*lower;
   v.y+=Math.max(0,.12-v.y)*.25*weight;const radius=Math.hypot(v.x,v.z),limit=.30+.035*Math.sin((v.y+.12)*7);if(radius>limit){const s=T.MathUtils.lerp(1,limit/radius,weight*.75);v.x*=s;v.z*=s;}v.applyMatrix4(inv);p.setXYZ(i,v.x,v.y,v.z);
  }p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingSphere();});
 fitBeastMask(m);
 const geometry=playerManeGeometry(m);
 const furCanvas=document.createElement('canvas');furCanvas.width=64;furCanvas.height=256;const furContext=furCanvas.getContext('2d');
 const underfur=furContext.createLinearGradient(0,0,64,0);
 for(const [at,alpha] of [[0,0],[.22,.1],[.36,.64],[.53,.80],[.70,.46],[.9,.05],[1,0]])underfur.addColorStop(at,'rgba(255,255,255,'+alpha+')');
 furContext.fillStyle=underfur;furContext.fillRect(0,0,64,256);
 for(let i=0;i<14;i++){const x=3+i*4.4;furContext.strokeStyle='rgba(255,255,255,.85)';furContext.lineWidth=.85+i%3*.25;furContext.beginPath();for(let y=0;y<=256;y+=4){const xx=x+Math.sin(y*.035+i*2)*.45;y?furContext.lineTo(xx,y):furContext.moveTo(xx,y);}furContext.stroke();}
 const furMap=new T.CanvasTexture(furCanvas);furMap.colorSpace=T.SRGBColorSpace;
 const fur=new T.Mesh(geometry,new T.MeshStandardMaterial({map:furMap,color:0xc8c4c1,alphaTest:.16,vertexColors:true,roughness:1,emissive:0x362d30,emissiveIntensity:.12,side:T.DoubleSide}));fur.castShadow=true;fur.receiveShadow=true;shell.add(fur);this.fur={geometry,base:geometry.attributes.position.array.slice(),uniforms:createHeadFurMotion(fur)};

}
if(asset==='warlord_headgear'){
 this.redMane=createHeadFurMotion(reshapeWarlordCrown(m,shell));
 // Preserve the supplied helmet crown and cheek guards over the fitted scalp.
 const vertices=[],colors=[],indices=[];
 for(let i=0;i<240;i++){
   const u=(i*37%137)/137,a=(u-.5)*Math.PI*1.35,r=.27+(i%7)*.016,length=.32+(i*19%71)/71*.38,base=vertices.length/3;
   const color=new T.Color(i%4===0?0x7f2b25:i%3===0?0x5f1b21:0x3d121a);
   for(let j=0;j<=9;j++){const f=j/9,spread=r+Math.sin(f*Math.PI*.85)*.20,curl=Math.sin(i+f*7)*.025*f;
     const x=Math.sin(a)*spread+curl,y=-.12+(i%5)*.025-f*length,z=.08+Math.cos(a)*spread+.13*f,w=(.006+(i%4)*.0024)*Math.pow(Math.max(.02,1-f),.7);
     for(const side of [-1,1]){vertices.push(x+Math.cos(a)*w*side,y,z-Math.sin(a)*w*side);colors.push(color.r,color.g,color.b);}
     if(j<9){const n=base+j*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
   }
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 const uv=[];for(let i=0;i<240;i++)for(let j=0;j<=9;j++)uv.push(0,j/9,1,j/9);
 geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 const strandCanvas=document.createElement('canvas');strandCanvas.width=32;strandCanvas.height=128;
 const strandContext=strandCanvas.getContext('2d');
 for(let i=0;i<9;i++){const x=2+i*3.5;const gradient=strandContext.createLinearGradient(0,0,0,128);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.68,'#ffffffcc');gradient.addColorStop(1,'#ffffff00');strandContext.strokeStyle=gradient;strandContext.lineWidth=1.1;strandContext.beginPath();strandContext.moveTo(x,0);strandContext.bezierCurveTo(x+Math.sin(i)*2,40,x-2,90,16+(x-16)*.25,128);strandContext.stroke();}
 const strandMap=new T.CanvasTexture(strandCanvas);
 const mane=new T.Mesh(geo,new T.MeshStandardMaterial({map:strandMap,alphaTest:.12,vertexColors:true,roughness:1,side:T.DoubleSide}));mane.castShadow=true;mane.receiveShadow=true;shell.add(mane);this.fur={geometry:geo,base:Float32Array.from(vertices),uniforms:createHeadFurMotion(mane)};
}
this.scene.add(shell);this.root.updateMatrixWorld(true);const head=matchRig(this.bones,/Head$/i);const bindInverse=head?this.restBoneInverses[head.name].clone():new T.Quaternion();const localBounds=new T.Box3().setFromObject(shell,true),vertices=[],point=new T.Vector3();shell.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;const ids=o.geometry.index?new Set(o.geometry.index.array):Array.from({length:a.count},(_,i)=>i);for(const i of ids){point.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);vertices.push(point.x,point.y,point.z);}});this.helmet={shell,offset,bindInverse,localBounds,localVertices:new Float32Array(vertices)};
 // The consort body carries its own sculpted helm and horns; the fitted shell is kept only as the head frame.
 if(asset==='warlord_headgear'&&this.consortBody){shell.traverse(o=>{if(o.isMesh)o.visible=false;});
  // Tall red crest and back locks rooted on the sculpted helm (consort-mane.js); driven by the same head-frame uniforms.
  const mane=createConsortMane(()=>!this.liveCape);shell.add(mane.mesh);this.redMane=mane.uniforms;this.consortMane=mane.mesh;}}
 async clips(names){
   const clips={};
   await Promise.all(names.map(async name=>{try{const g=await loader.loadAsync(`assets/tripo/${this.name==='gilded_warlord'?BOSS_ASSET:this.name}/anim-${name}.glb`);if(g.animations[0])clips[name]=g.animations[0].clone();}catch(e){console.warn('Animation unavailable',this.name,name);}}));
   // The run asset has a static Hips X of 0.9202, while idle/walk use
   // 0.0035. Keep all animations on the same horizontal rig origin.
   const hip=clips.idle?.tracks.find(track=>/Hips\.position$/i.test(track.name));
   if(hip)for(const clip of Object.values(clips))for(const track of clip.tracks){
     if(!/Hips\.position$/i.test(track.name))continue;
     for(let i=0;i<track.values.length;i+=3){track.values[i]=hip.values[0];track.values[i+2]=hip.values[2];}
   }
   for(const [name,clip] of Object.entries(clips))this.actions[name]=this.mixer.clipAction(clip);
   if(clips.idle){
     // Weapons are authored in the relaxed grip, not the rig's T-pose.
     // Sample it synchronously so asynchronous attachment completion cannot
     // change the grip or include the current actor turn in its bind frame.
     const saved=Object.values(this.bones).map(bone=>({bone,q:bone.quaternion.clone(),p:bone.position.clone(),s:bone.scale.clone()}));
     const poseMixer=new T.AnimationMixer(this.model);poseMixer.clipAction(clips.idle).play();poseMixer.update(0);this.root.updateMatrixWorld(true);
     const rootInverse=this.root.getWorldQuaternion(new T.Quaternion()).invert();this.idleHandInverses={};
     this.thrustBasePose=Object.values(this.bones).map(bone=>({bone,q:bone.quaternion.clone(),p:bone.position.clone()}));
     for(const side of ['Left','Right']){const hand=this.hand(side);if(hand)this.idleHandInverses[hand.name]=rootInverse.clone().multiply(hand.getWorldQuaternion(new T.Quaternion())).normalize().invert();}
     poseMixer.stopAllAction();poseMixer.uncacheRoot(this.model);for(const savedBone of saved){savedBone.bone.quaternion.copy(savedBone.q);savedBone.bone.position.copy(savedBone.p);savedBone.bone.scale.copy(savedBone.s);}this.root.updateMatrixWorld(true);
   }
   {
     // The 6.583 s source has one main strike around 2.028 s and long idle
     // tails. Sample just its preparation, strike and recovery, aligning the
     // actual hand-speed peak with the gameplay contact (light .26/heavy .55).
     const retime=(sourceClip,name,anchors)=>{
       const duration=anchors.at(-1)[0],count=Math.ceil(duration*60),tracks=[];
       const sampleTimes=[...new Set([...Array(count+1)].map((_,i)=>duration*i/count).concat(anchors.map(a=>a[0])))].sort((a,b)=>a-b);
       for(const source of sourceClip.tracks){
         const track=source.clone(),width=source.getValueSize(),sample=source.createInterpolant(new Float32Array(width)),times=[],values=[];
         for(const time of sampleTimes){
           let k=0;while(k<anchors.length-2&&time>anchors[k+1][0])k++;
           const a=anchors[k],b=anchors[k+1],f=(time-a[0])/(b[0]-a[0]);
           times.push(time);values.push(...sample.evaluate(T.MathUtils.lerp(a[1],b[1],f)));
         }
         track.times=new Float32Array(times);track.values=new Float32Array(values);tracks.push(track);
       }
       const clip=new T.AnimationClip(name,duration,tracks);this.actions[name]=this.mixer.clipAction(clip);
     };
     if(this.name==='ivory_duelist'&&clips.idle)retime(clips.idle,'light-strike',[[0,.1],[.72,.82]]);
     else if(clips.slash)retime(clips.slash,'light-strike',[[0,1.24],[.18,1.74],[.26,2.028],[.39,2.30],[.51,3.02],[.72,3.70]]);
     if(this.name==='ivory_duelist'&&clips.idle)retime(clips.idle,'critical-strike',[[0,.1],[3,3.1]]);
     else if(clips.slash)retime(clips.slash,'critical-strike',[[0,1.24],[.18,1.74],[.26,2.028],[.39,2.30],[.51,3.02],[.72,3.70]]);
     if(clips.slash)retime(clips.slash,'heavy-strike',[[0,.98],[.36,1.74],[.55,2.028],[.76,2.32],[.96,3.02],[1.2,3.70]]);
     // The source dive spends its first second preparing. Use its actual
     // tuck/turn/get-up poses, with recovery inside the existing .68 s dodge.
     if(clips.dive)retime(clips.dive,'combat-roll',[[0,.65],[.06,.98],[.16,1.30],[.34,1.70],[.47,2.05],[.59,2.35],[.68,2.60]]);
   }
   this.play('idle');
 }

 play(name,speed=1){
   const a=this.actions[name]||this.actions.idle;if(!a)return;
   if(this.current!==a){
     const gait=['walk','run'].includes(name)&&['walk','run'].includes(this.currentName);
     const phase=gait&&this.current?((this.current.time/this.current.getClip().duration)%1+1)%1:0;
     const blend=gait?.2:name==='combat-roll'?.065:['light-strike','heavy-strike','critical-strike'].includes(name)?.09:.14;
     a.reset().setEffectiveWeight(1).fadeIn(blend).play();
     if(gait)a.time=phase*a.getClip().duration;
     if(this.current)this.current.fadeOut(blend);
     this.current=a;this.currentName=name;
   }
   a.timeScale=speed;
 }
 ghost(pos,yaw){
   // Reuse complete posed rigs and their materials. Snapshot transforms and
   // skeletons remain independent; source geometry is shared and never disposed.
   this.ghostPool??=[];let group=this.ghostPool.pop();
   if(!group){
     group=new T.Group();group.ghostPairs=[];group.ghostRoots=[];
     const material=group.ghostMaterial=new T.MeshBasicMaterial({color:0xffe8af,transparent:true,opacity:.13,depthWrite:false,blending:T.AdditiveBlending});
     const surfaces=new Map();group.ghostMaterials=[material];
     const ghostSurface=mesh=>{
       const source=mesh.material,animated=!!(mesh.geometry.attributes.maneWeight||mesh.geometry.attributes.headFurWeight);
       if(Array.isArray(source))return source.map(m=>ghostSurface({material:m,geometry:mesh.geometry}));
       const cloth=source===this.cape?.material;
       const solid=cloth||!animated&&!source.alphaMap&&!(source.alphaTest>0);
       if(!surfaces.has(source)){
         const surface=material.clone();
         if(source.color)surface.color.copy(source.color);
         if(animated)surface.color.setHex(0xffedc0);
         surface.vertexColors=!!source.vertexColors&&!!mesh.geometry.attributes.color;
         surface.map=solid?source.map:source.alphaTest>0?source.map:null;surface.userData.ghostSolid=solid;surface.blending=solid||mesh.geometry.attributes.maneWeight?T.NormalBlending:T.AdditiveBlending;surface.forceSinglePass=true;surface.alphaMap=source.alphaMap;surface.side=source.side;
         // Keep the hair texture's alpha while the whole afterimage fades. A
         // fixed alpha-test threshold would erase it as opacity approaches zero.
         surface.onBeforeCompile=shader=>{if(animated)source.onBeforeCompile(shader);if(solid){
           shader.vertexShader='varying vec3 ghostEyePoint;\n'+shader.vertexShader;
           shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nghostEyePoint=mvPosition.xyz;');
           shader.fragmentShader='varying vec3 ghostEyePoint;\n'+shader.fragmentShader;
           shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat ghostLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));vec3 face=normalize(cross(dFdx(ghostEyePoint),dFdy(ghostEyePoint)));float relief=.38+.59*max(dot(face,normalize(vec3(-.45,.72,.48))),0.);float grazing=pow(1.-abs(dot(face,normalize(-ghostEyePoint))),2.);vec3 steel=diffuseColor.rgb*vec3(.80,.69,.53)*(.35+.62*relief);vec3 lit=vec3(1.0,.89,.58)*(.22+.64*sqrt(max(0.,ghostLuma)))*relief;diffuseColor.rgb=mix(steel,lit,.46)+vec3(.44,.32,.15)*grazing;');}else shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP\nvec4 fiber=texture2D(map,vMapUv);diffuseColor.a *= fiber.a;diffuseColor.rgb *= mix(vec3(.65,.59,.46),fiber.rgb,.55);\n#endif`);};surface.customProgramCacheKey=()=> 'ghost-surface-material-as|'+(solid?'rgb|':'alpha|')+(animated?source.customProgramCacheKey():'static');
         surfaces.set(source,surface);group.ghostMaterials.push(surface);
       }
       return surfaces.get(source);
     };
     const fullModel=[],returnSurfaces=new Map(),strokePhase={value:0},strokePresence={value:1};
     function returnSurface(mesh,source,capeMaterial){
       if(Array.isArray(source))return source.map(m=>returnSurface(mesh,m,capeMaterial));
       if(returnSurfaces.has(source))return returnSurfaces.get(source);
       const lit=source.clone(),mane=!!mesh.geometry.attributes.maneWeight,cloth=source===capeMaterial;
       lit.userData.returnOpacity=source.opacity;
       lit.userData.returnSurface=true;
       lit.transparent=source.transparent;lit.depthWrite=source.depthWrite;lit.forceSinglePass=true;
       lit.onBeforeCompile=(shader,renderer)=>{
         source.onBeforeCompile(shader,renderer);
         shader.uniforms.strokePresence=strokePresence;
         shader.fragmentShader='uniform float strokePresence;\n'+shader.fragmentShader;
         shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
           '#include <clipping_planes_fragment>\nfloat strokeGrain=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);if(strokeGrain>=strokePresence)discard;');
         if(mane||cloth){
           shader.uniforms.strokePhase=strokePhase;
           shader.vertexShader='uniform float strokePhase;\n'+shader.vertexShader;
           const free=mane?'smoothstep(.035,.70,maneWeight)':'smoothstep(.06,.94,1.-uv.y)';
           shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
             'float fallWeight='+free+'; transformed.z+=fallWeight*(1.20+1.72*sin(3.14159*strokePhase)); transformed.x+=fallWeight*(.49-1.10*strokePhase); transformed.y+=fallWeight*(.28+.75*sin(3.14159*strokePhase));\n#include <project_vertex>');
         }
         if(shader.fragmentShader.includes('#include <normal_fragment_begin>')){
           const glow=mane?'vec3(.12,.085,.035)*(.55+.45*rim)':cloth?'vec3(.014,.006,.002)':'vec3(.018,.013,.005)';
           shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
             'float rim=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),3.5); outgoingLight+=vec3(.36,.27,.13)*rim+'+glow+';\n#include <opaque_fragment>');
         }
       };
       lit.customProgramCacheKey=()=> 'stone-return-surface-ax|'+source.customProgramCacheKey()+'|'+(mane?'hair':cloth?'cloth':'body');
       returnSurfaces.set(source,lit);return lit;
     }
     const sources=[this.visual,this.helmet?.shell,this.capeMount?this.cape:null,...this.weapons.map(w=>w.pivot),...(this.extraVisuals||[])].filter(o=>o&&(o.visible||this.name==='gilded_warlord'));
     const liveSpellMeshes=new Set();
     for(const weapon of this.weapons)for(const effect of [weapon.gravityCharge,weapon.holyEdge]){
       effect?.traverse(o=>liveSpellMeshes.add(o));
     }
     for(const source of sources){
       const copy=cloneSkeleton(source),originals=[],copies=[];source.traverse(o=>originals.push(o));copy.traverse(o=>copies.push(o));
       originals.forEach((o,i)=>{
         if(liveSpellMeshes.has(o))copies[i].removeFromParent();
         else group.ghostPairs.push({source:o,copy:copies[i]});
       });
       const lights=[];copy.traverse(o=>{
         if(o.isLight)lights.push(o);
         if(!o.isMesh)return;
         o.userData.sharedGhostGeometry=true;
         const sourceMaterial=o.material,echo=ghostSurface(o);
         const physical=returnSurface(o,sourceMaterial,this.cape?.material);
         const isMane=!!o.geometry.attributes.maneWeight;
         const echoWeight=isMane ? .50 : (echo.userData?.ghostSolid ? 3.2 : 1);
         fullModel.push({o,echo,physical,echoWeight,bodyWeight:1});
         o.material=echo;o.userData.opacityScale=echoWeight;
         o.castShadow=false;o.receiveShadow=false;
       });
       for(const light of lights)light.removeFromParent();
       group.ghostRoots.push({source,copy});group.add(copy);
     }
const copies=new Map(group.ghostPairs.map(pair=>[pair.source,pair.copy]));
     const ghostRig={root:group,name:'gilded_warlord',bones:Object.fromEntries(Object.entries(this.bones).map(([name,bone])=>[name,copies.get(bone)]).filter(([,bone])=>bone)),combatAdjustments:[]};
     const movingBones=Object.entries(ghostRig.bones).filter(([name])=>/(Arm|Hand|Leg)$/.test(name)).map(([,bone])=>({bone,base:new T.Quaternion()}));
     const grips=this.weapons.map(weapon=>({side:weapon.side,tip:weapon.bladeSections.at(-1).center,
       hand:copies.get(this.hand(weapon.side)),pivot:copies.get(weapon.pivot),offset:new T.Vector3(),rotation:new T.Quaternion(),scale:new T.Vector3()})).filter(grip=>grip.hand&&grip.pivot);
     // Keep only positions swept by the posed leading blade in world space.
     const sweepGeometry=new T.BufferGeometry(),sweepIndices=[];
     const wakeSamples=48,wakeSeconds=.30;
     for(let i=0;i<wakeSamples-1;i++){const j=i*2;sweepIndices.push(j,j+1,j+2,j+1,j+3,j+2);}
     sweepGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(wakeSamples*2*3),3).setUsage(T.DynamicDrawUsage));
     sweepGeometry.setAttribute('uv',new T.BufferAttribute(new Float32Array(wakeSamples*2*2),2).setUsage(T.DynamicDrawUsage));
     sweepGeometry.setIndex(sweepIndices);
     const sweepMaterial=new T.ShaderMaterial({
       uniforms:{age:{value:0},intensity:{value:1},duration:{value:.34},fadeTime:{value:.064}},side:T.DoubleSide,transparent:true,depthWrite:false,
       vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
       fragmentShader:`uniform float age,intensity,duration,fadeTime;varying vec2 v;
         void main(){float front=smoothstep(.015,.15,age);
           float slice=(1.-smoothstep(.58,1.,v.x))*front;
           float edge=.18+.72*pow(1.-v.y,2.);
           float fade=(1.-smoothstep(duration-fadeTime,duration,age))*smoothstep(0.,.043,age);
           float softness=smoothstep(0.,.12,v.y)*(1.-smoothstep(.66,1.,v.y));
           gl_FragColor=vec4(vec3(1.16,1.08,.81),slice*(.35+.65*edge)*softness*fade*.65*intensity);}`
     });
     const sweep=new T.Mesh(sweepGeometry,sweepMaterial);
     sweep.name='return-blade-wake';
     sweep.frustumCulled=false;group.add(sweep);
     const sweepHands=['Left','Right'].map(side=>Object.entries(ghostRig.bones).find(([name])=>name.endsWith(side+'Hand'))?.[1]);
     const secondSweep=new T.Mesh(sweepGeometry.clone(),sweepMaterial.clone());
     secondSweep.name='return-second-blade-wake';secondSweep.frustumCulled=false;
     secondSweep.material.uniforms.intensity.value=.25;group.add(secondSweep);
     const wakes=[{mesh:sweep,path:[],width:.23},{mesh:secondSweep,path:[],width:.09}];
     group.userData.phantomWake=(age,enabled)=>{
       const inverse=group.matrixWorld.clone().invert(),origin=group.getWorldPosition(new T.Vector3());
       for(const [index,wake] of wakes.entries()){
         const {mesh,path,width}=wake;mesh.visible=enabled;
         if(!enabled)continue;
         mesh.material.uniforms.age.value=age;
         const handIndex=index===0?(leading>0?1:0):(leading>0?0:1);
         const grip=grips.find(g=>g.hand===sweepHands[handIndex]);if(!grip)continue;
         const tip=grip.pivot.localToWorld(grip.tip.clone()),hilt=grip.pivot.getWorldPosition(new T.Vector3());
         path.unshift({age,tip,inset:tip.clone().lerp(hilt,width),origin:origin.clone()});
         while(path.length>wakeSamples||age-path.at(-1).age>wakeSeconds)path.pop();
         const geometry=mesh.geometry,pos=geometry.attributes.position,uv=geometry.attributes.uv;
         for(let j=0;j<path.length;j++){
           const knot=path[j],u=Math.min(1,(age-knot.age)/wakeSeconds);
           // Carry the recent sword path with the falling torso; leave a short trail through the air.
           const carry=origin.clone().sub(knot.origin).multiplyScalar(.86);
           const outer=knot.tip.clone().add(carry).applyMatrix4(inverse),inner=knot.inset.clone().add(carry).applyMatrix4(inverse);
           pos.setXYZ(j*2,outer.x,outer.y,outer.z);pos.setXYZ(j*2+1,inner.x,inner.y,inner.z);
           uv.setXY(j*2,u,0);uv.setXY(j*2+1,u,1);
         }
         pos.needsUpdate=true;uv.needsUpdate=true;geometry.setDrawRange(0,Math.max(0,path.length-1)*6);
       }
     };
     let striking=false,leading=1;
     group.userData.beginGhostStrike=(mode,index=0,gateStrike=false)=>{
       strokePhase.value=0;group.userData.strokePhase=strokePhase;
       strokePresence.value=1;group.userData.strokePresence=strokePresence;
       for(const wake of wakes){
         wake.path.length=0;wake.mesh.geometry.setDrawRange(0,0);
         wake.mesh.material.uniforms.duration.value=gateStrike?ROCK_RETURN.strokeLife[index]:.46;
         wake.mesh.material.uniforms.fadeTime.value=gateStrike&&index===3?ROCK_RETURN.lastFade:.064;
       }
       for(const part of fullModel){
         part.o.material=gateStrike?part.physical:part.echo;
         part.o.userData.opacityScale=gateStrike?part.bodyWeight:part.echoWeight;
         part.o.receiveShadow=gateStrike;
       }
       leading=gateStrike?1:index%2?-1:1;
       group.rotation.order='YXZ';group.rotation.x=0;group.rotation.z=0;
       group.userData.strokeYaw=group.rotation.y;group.userData.gateStroke=gateStrike;
       striking=mode==='down';if(!striking)return;group.updateMatrixWorld(true);
       for(const joint of movingBones)joint.base.copy(joint.bone.quaternion);
       for(const grip of grips){grip.pivot.getWorldPosition(grip.offset).applyMatrix4(grip.hand.matrixWorld.clone().invert());grip.rotation.copy(grip.hand.getWorldQuaternion(new T.Quaternion()).normalize()).invert().multiply(grip.pivot.getWorldQuaternion(new T.Quaternion()).normalize()).normalize();grip.scale.copy(grip.pivot.scale);}
     };
     group.userData.tickGhostStrike=progress=>{
       if(!striking)return;const weight=T.MathUtils.smoothstep(progress,0,.9);
       strokePhase.value=weight;
       if(group.userData.gateStroke){
         group.rotation.y=group.userData.strokeYaw+leading*(.30-.86*weight);
         group.rotation.x=-.18-.54*weight;
         group.rotation.z=leading*(.16-.35*weight);
       }
       for(const joint of movingBones)joint.bone.quaternion.copy(joint.base);
       ghostRig.combatAdjustments.length=0;group.updateMatrixWorld(true);
       for(const [side,sign] of [['Left',-1],['Right',1]]){
         const strikingHand=sign===leading;
         const stroke=strikingHand?weight:T.MathUtils.smoothstep(progress,.22,.99);
         const target=group.userData.gateStroke?
           new T.Vector3(sign*(strikingHand?1.02-.76*stroke:1.10-.46*stroke),(strikingHand?3.97:3.76)-(strikingHand?2.27:1.96)*stroke,-.30-(strikingHand?1.02:.88)*stroke):
           new T.Vector3(sign*(strikingHand?.43:1.34),strikingHand?1.83:2.96,strikingHand?-1.18:-.31);
         target.applyMatrix4(group.matrixWorld);
         const pole=new T.Vector3(sign*1.49,2.80,-.40).applyMatrix4(group.matrixWorld);
         Actor.prototype.poseHand.call(ghostRig,side,target,pole,group.userData.gateStroke?.94:weight);
         if(group.userData.gateStroke){
           const lift=strikingHand?.14+.65*(1-weight):.25+.84*(1-weight);
           const foot=new T.Vector3(sign*.57,lift,strikingHand?-.51*weight:.38+.30*weight).applyMatrix4(group.matrixWorld);
           foot.y=Math.max(foot.y,group.position.y+.13);
           const knee=new T.Vector3(sign*.71,1.20,-1.06).applyMatrix4(group.matrixWorld);
           solveBossLimb(ghostRig,side,['UpLeg','Leg','Foot'],foot,knee,.88);
         }
       }
       group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),rotation=group.getWorldQuaternion(new T.Quaternion()).normalize().invert();
       for(const grip of grips){grip.pivot.position.copy(grip.offset).applyMatrix4(grip.hand.matrixWorld).applyMatrix4(inverse);grip.pivot.quaternion.copy(rotation).multiply(grip.hand.getWorldQuaternion(new T.Quaternion()).normalize()).multiply(grip.rotation).normalize();grip.pivot.scale.copy(grip.scale);
         if(group.userData.gateStroke){
           const front=grip.hand===sweepHands[leading>0?1:0];
           const cutPhase=front?weight:T.MathUtils.smoothstep(progress,.22,.99);
           const angle=(front?-.14:-.23)+(front?2.69:2.63)*cutPhase;
           const reach=Math.sin(angle);
           const edge=new T.Vector3(leading*reach,Math.cos(angle),-.16-.18*reach).normalize();
           const cut=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),edge);
           grip.pivot.quaternion.slerp(cut,.95);
         }
       }
     };
     group.userData.releaseGhost=()=>{if(!group.ghostBusy)return;group.ghostBusy=false;group.visible=false;for(const material of group.ghostMaterials)material.opacity=0;this.ghostPool.push(group);};
   }
   group.ghostBusy=true;group.visible=true;for(const material of group.ghostMaterials)material.opacity=.13;
   for(const {source,copy} of group.ghostPairs){copy.position.copy(source.position);copy.quaternion.copy(source.quaternion);copy.scale.copy(source.scale);copy.matrixAutoUpdate=source.matrixAutoUpdate;if(!source.matrixAutoUpdate){copy.matrix.copy(source.matrix);copy.matrixWorldNeedsUpdate=true;}copy.visible=source.visible;}
   const inverse=this.root.matrixWorld.clone().invert();
   for(const {source,copy} of group.ghostRoots){source.updateMatrixWorld(true);const local=inverse.clone().multiply(source.matrixWorld);if(source.matrixAutoUpdate)local.decompose(copy.position,copy.quaternion,copy.scale);else{copy.matrix.copy(local);copy.matrixWorldNeedsUpdate=true;}copy.visible=true;}
   group.position.copy(pos);group.rotation.set(0,yaw,0);group.scale.copy(this.root.scale);return group;
 }
 poseHand(side,target,pole,weight=1){Actor.prototype.poseLimb.call(this,side,['Arm','ForeArm','Hand'],target,pole,weight);}
 poseLimb(side,segments,target,pole,weight=1){
   if(this.name==='gilded_warlord'||segments[0]==='UpLeg')return solveBossLimb(this,side,segments,target,pole,weight);
   const bone=suffix=>findRigBone(this.bones,side+suffix);
   const [upper,lower,hand]=segments.map(bone);if(!upper||!lower||!hand)return;
   // Update just the solved chain. Rebuilding both complete character rigs for
   // every ankle and wrist repeats the same matrix products many times a frame.
   hand.updateWorldMatrix(true,false);
   const shoulder=new T.Vector3().setFromMatrixPosition(upper.matrixWorld),elbow=new T.Vector3().setFromMatrixPosition(lower.matrixWorld),wrist=new T.Vector3().setFromMatrixPosition(hand.matrixWorld);
   const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),direction=target.clone().sub(shoulder);
   const distance=T.MathUtils.clamp(direction.length(),Math.abs(a-b)+.001,a+b-.001);direction.normalize();
   const bend=pole.clone().sub(shoulder);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<1e-8)return;bend.normalize();
   const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
   const desiredElbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,height);
   const orient=(joint,end,point)=>{
     const origin=joint.getWorldPosition(new T.Vector3()),from=end.getWorldPosition(new T.Vector3()).sub(origin).normalize(),to=point.clone().sub(origin).normalize();
     const world=joint.getWorldQuaternion(new T.Quaternion()),parent=joint.parent.getWorldQuaternion(new T.Quaternion()).invert();
     const rotation=parent.multiply(new T.Quaternion().setFromUnitVectors(from,to)).multiply(world).normalize();
     this.combatAdjustments.push({bone:joint,rotation:joint.quaternion.clone()});joint.quaternion.slerp(rotation,weight);
   };
   orient(upper,lower,desiredElbow);orient(lower,hand,shoulder.clone().addScaledVector(direction,distance));
 }
 heldStompBlades(state){
   const ready=state.phase===2&&state.bossAction==='wait';
   if(this.name!=='gilded_warlord'||(!ready&&state.bossAction!=='long'))return;
   const time=state.bossElapsed||0,overhead=MOVES.long.contacts.find(c=>c.style==='down').t;
   const weight=ready?1:T.MathUtils.smoothstep(time,.10,.55)*(1-T.MathUtils.smoothstep(time,overhead-.70,overhead-.15));
   if(weight<=0)return;
   // Selected AzaZ_ow source 43.5-45.5 s: the leading grip rises with the
   // stomp, lowers to shoulder height, and stays above the off hand until
   // the overhead release. These are move-relative landmarks, not replay cues.
   const stomp=MOVES.long.contacts.find(c=>c.style==='stomp').t;
   const raised=1-T.MathUtils.smoothstep(time,stomp+.05,stomp+.65);
   const drawBack=T.MathUtils.smoothstep(time,overhead-.65,overhead-.25);
   const scale=this.height/4.4,yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),state.yaw||0);
   const toWorld=(x,y,z)=>new T.Vector3(x,y,z).multiplyScalar(scale).applyQuaternion(yaw).add(this.root.position).add(new T.Vector3(0,state.groundOffset||0,0));
   for(const side of ['Right','Left']){
     const right=side==='Right',sign=right?1:-1;
     // Source 59.75-62 s: phase-two approach keeps both curved blades open
     // and raised, with waist-level grips. The locomotion clip still drives legs.
     const target=ready?toWorld(sign*1.25,2.35,-.35):right?toWorld(1.12,3.0+1.14*Math.max(raised,drawBack),-.4+.28*drawBack):toWorld(-1.18,2.35,-.5);
     const hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);if(!hand||!weapon?.handBindInverse)continue;
     const baseWorld=hand.getWorldQuaternion(new T.Quaternion()).normalize();
     this.poseHand(side,target,toWorld(sign*1.9,2.85,-.12),weight);
     // Orient the wrist and its attached blade together; the sword never
     // detaches from the grip. The right blade is nearly vertical, the left
     // blade opens outward, as visible during the held preparation.
     const direction=ready?new T.Vector3(sign*.80,.60,.04).normalize():new T.Vector3(right?.05:-.38,1,right?.06:-.04).normalize();
     const attachment=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
     // The paired ready blades share a frontal plane with mirrored curvature.
     // The phase-one held stomp retains its previous shortest wrist turn.
     const from=new T.Vector3(0,1,0).applyQuaternion(baseWorld.clone().multiply(attachment)).normalize();
     const desired=ready?yaw.clone().multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),right?Math.PI:0)).multiply(attachment.clone().invert()):new T.Quaternion().setFromUnitVectors(from,direction.applyQuaternion(yaw)).multiply(baseWorld);
     const world=baseWorld.slerp(desired,weight);
     const local=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(world).normalize();
     this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);
   }
 }
 gravityPullPose(state){
   if(this.name!=='gilded_warlord'||state.bossAction!=='pull')return;
   // Ye Tarnished 89:40.5ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ89:45.5: open charged blades, both grips above
   // the head, downward plant and a low recovery through the eruption.
   // Align the visible sword plant with the existing collision at 2.45 s.
   const time=state.bossElapsed||0,scale=this.height/4.4;
   const keys=[
    [0,1.18,2.55,-.35,.70,.70,-.12],
    [.85,1.55,2.95,-.25,.86,.55,-.12],
    [1.35,1.35,2.95,-.30,.58,.84,-.04],
    [1.95,.68,4.35,-.02,.12,.99,.02],
    [2.22,.62,4.40,.02,.08,.99,.02],
    [2.52,.73,1.68,-1.25,.10,-.90,-.45],
    [3.40,.86,1.65,-1.10,.12,-.85,-.48],
    [4.35,1.20,2.40,-.40,.62,.76,-.12],
    [4.70,1.18,2.45,-.40,.55,.84,.04]
   ];
   let index=keys.findIndex(k=>k[0]>time);if(index<0)index=keys.length-1;index=Math.max(1,index);
   const from=keys[index-1],to=keys[index],f=T.MathUtils.smoothstep(time,from[0],to[0]);
   const value=n=>T.MathUtils.lerp(from[n],to[n],f);
   const yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),state.yaw||0);
   this.root.updateMatrixWorld(true);
   const world=(x,y,z)=>new T.Vector3(x,y,z).multiplyScalar(scale).applyQuaternion(yaw).add(this.root.position).add(new T.Vector3(0,state.groundOffset||0,0));
   for(const side of ['Right','Left']){
    const sign=side==='Right'?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);if(!hand||!weapon?.handBindInverse)continue;
    const base=hand.getWorldQuaternion(new T.Quaternion()).normalize();
    this.poseHand(side,world(sign*value(1),value(2),value(3)),world(sign*1.85,2.8,.12));
    const mount=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
    const axis=new T.Vector3(0,1,0).applyQuaternion(base.clone().multiply(mount)).normalize();
    const startDirection=new T.Vector3(sign*from[4],from[5],from[6]).normalize();
    const endDirection=new T.Vector3(sign*to[4],to[5],to[6]).normalize();
    const arc=new T.Quaternion().setFromUnitVectors(startDirection,endDirection);
    const direction=startDirection.applyQuaternion(new T.Quaternion().slerp(arc,f)).applyQuaternion(yaw);
    const desired=new T.Quaternion().setFromUnitVectors(axis,direction).multiply(base);
    const local=hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(desired).normalize();
    this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);
   }
 }
 gravityRushPose(state){
   if(this.name!=='gilded_warlord'||state.bossAction!=='leap'||!(state.groundedRush||state.openingRush))return;
   const time=state.bossElapsed,raise=T.MathUtils.smoothstep(time,.15,.8)*(1-T.MathUtils.smoothstep(time,RUSH_SEQUENCE.contact-.06,RUSH_SEQUENCE.contact+.18));
   // Selected 20-21.625 s: low open grips become crossed raised blades while
   // both feet remain planted. Coordinates fit this rig to visible landmarks.
   const tuck=state.openingRush?T.MathUtils.smoothstep(time,1.84,2.18)*(1-T.MathUtils.smoothstep(time,2.92,3.21)):0;
   const scale=this.height/4.4;
   this.root.updateMatrixWorld(true);
   const toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
   const orientation=this.visual.getWorldQuaternion(new T.Quaternion()).normalize();
   for(const side of ['Right','Left']){
     const sign=side==='Right'?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);
     if(!hand||!weapon?.handBindInverse)continue;
     this.poseHand(side,toWorld(sign*T.MathUtils.lerp(1.15,.32,raise),T.MathUtils.lerp(2.05,3.8,raise)-.87*tuck,-.4-.36*tuck),toWorld(sign*(1.75-.61*tuck),2.8-.24*tuck,-.2),1);
     const direction=new T.Vector3(sign*(T.MathUtils.lerp(.85,-.25,raise)+.87*tuck),T.MathUtils.lerp(.3,1,raise)-.50*tuck,-.03-.49*tuck).normalize();
     const attachment=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
     const world=orientation.clone().multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction)).multiply(attachment.clone().invert()).normalize();
     const local=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(world).normalize();
     this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);
   }
 }
 grabAnticipation(state){
   if(this.name!=='gilded_warlord'||!['grab','stompGrab'].includes(state.bossAction))return;
   const recovery=state.grabRecovery,chained=state.bossAction==='stompGrab',elapsed=state.bossElapsed||0,raw=elapsed-(chained?1.35:0),time=Math.min(raw,2.2);
   if(time<0||raw>2.2&&!recovery||recovery?.elapsed>=.20||chained&&elapsed<1.8)return;
   // Primary same-fight 62.0ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ64.25 s: open waist-level blades, crouch,
   // then open arms during the leap. Miss recovery is posed separately.
   // The contact/flight rules stay in combat.js and game.js.
   const crouch=T.MathUtils.smoothstep(time,.35,1.10)*(1-T.MathUtils.smoothstep(time,1.25,1.48));
   const weight=T.MathUtils.smoothstep(time,0,.12)*(chained?T.MathUtils.smoothstep(elapsed,1.8,1.96):1)*(recovery?1-T.MathUtils.smoothstep(recovery.elapsed,0,.20):1),scale=this.height/4.4;
   for(const [pattern,angle] of [[/Spine$/,-.34*crouch],[/UpLeg$/,.90*crouch],[/(?<!Up)Leg$/,-1.60*crouch]])for(const [name,bone] of this.poseJoints){
     if(!pattern.test(name))continue;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
     const axis=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert());
     bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle*weight));
   }
   this.root.updateMatrixWorld(true);
   const keys=[[0,1.25,2.35,-.35,.80,.60],[.45,1.45,2.60,-.35,.94,.32],[1.10,1.62,2.03,-.65,1,.03],[1.35,1.68,2.05,-.65,1,.04],[1.70,1.65,3.30,-.55,.98,.18],[2.20,1.60,3.20,-.80,.95,.30]];
   let index=keys.findIndex(k=>k[0]>time);if(index<0)index=keys.length-1;index=Math.max(1,index);
   const a=keys[index-1],b=keys[index],u=T.MathUtils.smoothstep(time,a[0],b[0]),v=a.map((x,i)=>T.MathUtils.lerp(x,b[i],u));
   const orientation=this.visual.getWorldQuaternion(new T.Quaternion()).normalize(),toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
   for(const side of ['Right','Left']){
     const right=side==='Right',sign=right?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);if(!hand||!weapon?.handBindInverse)continue;
     const base=hand.getWorldQuaternion(new T.Quaternion()).normalize();
     this.poseHand(side,toWorld(sign*v[1],v[2],v[3]),toWorld(sign*1.95,2.85,-.15),weight);
     const direction=new T.Vector3(sign*v[4],v[5],-.04).normalize();
     const attachment=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
     const desired=orientation.clone().multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),right?Math.PI:0)).multiply(attachment.clone().invert()).normalize();
     const local=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(base.slerp(desired,weight)).normalize();
     this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);
   }
 }
 postGrabRecovery(state){
   if(this.name!=='gilded_warlord'||!state.grabRecovery)return;
   const elapsed=state.grabRecovery.elapsed,age=elapsed-(state.grabRecovery.chained?.35:0);
   const weight=T.MathUtils.smoothstep(elapsed,0,.20)*(1-T.MathUtils.smoothstep(age,1.40,1.65));
   if(weight<=0)return;
   // Selected same-fight 64.5-65.5 and 114.1-115.125 s: missed grabs
   // recover the blades across the chest, then open. The chained grab's
   // longer retrieval is relative to its real miss, never to replay time.
   const open=T.MathUtils.smoothstep(age,1.15,1.5);
   const draw=T.MathUtils.smoothstep(age,.15,.7)*(1-open),scale=this.height/4.4;
   this.root.updateMatrixWorld(true);
   const toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
   const orientation=this.visual.getWorldQuaternion(new T.Quaternion()).normalize();
   for(const side of ['Right','Left']){
     const right=side==='Right',sign=right?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);
     if(!hand||!weapon?.handBindInverse)continue;
     const base=hand.getWorldQuaternion(new T.Quaternion()).normalize();
     const height=T.MathUtils.lerp(T.MathUtils.lerp(right?3.3:2.45,2.45,open),right?2.35:2.50,draw);
     this.poseHand(side,toWorld(sign*T.MathUtils.lerp(1.14,-.28,draw),height,T.MathUtils.lerp(-.35,-.90,draw)),toWorld(sign*1.65,2.6,-.12),weight);
     const outward=right?T.MathUtils.lerp(.15,.65,open):-.65;
     const direction=new T.Vector3(T.MathUtils.lerp(outward,sign*(right?.72:.74),draw),T.MathUtils.lerp(1,right?.88:.82,draw),-.12).normalize();
     const attachment=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
     const bladeRoll=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI*(right?1-draw:draw));
     const desired=orientation.clone().multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction)).multiply(bladeRoll).multiply(attachment.clone().invert()).normalize();
     const local=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(base.slerp(desired,weight)).normalize();
     this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);
   }
 }
 updateCapeMotion(dt,state,t,matrix){
  const boss=this.name==='gilded_warlord',height=boss?(this.capeHeight||2.85):1.08;
  const rolling=!boss&&state.motion==='dive';
  const attribute=this.cape.geometry.attributes.position,inverse=matrix.clone().invert();
  const origin=new T.Vector3().setFromMatrixPosition(matrix);
  const sparse=boss && this.liveCape && this.cape.geometry.parameters?.widthSegments>=24;
  const grid=sparse?(this.capeSpringGrid??=clothSpringGrid(this.cape.geometry)):null;
  const reset=!this.capeParticles||this.usedSpringGrid!==sparse||this.capeOrigin.distanceTo(origin)>6||dt>.2;
  this.usedSpringGrid=sparse;
  const h=Math.min(1/30,Math.max(0,dt)),point=new T.Vector3(),target=new T.Vector3(),local=new T.Vector3();
  if(reset)this.capeParticles=Array.from({length:attribute.count},()=>({p:new T.Vector3(),v:new T.Vector3()}));
  const heading=(state.yaw||0)+this.visual.rotation.y;
  const yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),heading),unturn=yaw.clone().invert();
  this.capeRollBlend=T.MathUtils.lerp(this.capeRollBlend||0,rolling?1:0,1-Math.exp(-dt*24));
  const chestUp=new T.Vector3(0,1,0).transformDirection(matrix);
  // A torso that drops forward leaves the cloak in the air: it lofts over the back like a sail and sinks slowly
  // (primary 33.7-35.0 s, clip 29.75-30.8). Once bowed, the cloth lies back over the hips and trails behind.
  const bowAngle=Math.acos(T.MathUtils.clamp(chestUp.y,-1,1));
  const bowRate=reset||this.capeBow==null?0:(bowAngle-this.capeBow)/Math.max(.008,dt);this.capeBow=bowAngle;
  this.capeLoft=boss?Math.max(0,Math.min(1,(reset?0:this.capeLoft||0)-dt*.62+Math.max(0,bowRate-1.1)*dt*.9)):0;
  const loft=T.MathUtils.smoothstep(this.capeLoft,0,.6),bowed=boss?T.MathUtils.smoothstep(bowAngle,.55,1.25):0;
  // On the parried knee the mantle settles over the hips. The brief
  // lift from the stop dissipates before the riposte opens.
  const kneel=boss&&(state.bossAction==='recover'||state.stagger>0||state.bossAction==='critical')?
    bowed*T.MathUtils.smoothstep(state.bossElapsed,.09,.49):0;
  const drapeBlend=(boss?0:this.capeRollBlend)*T.MathUtils.smoothstep(.60-chestUp.y,0,1.20);
  const seam=new T.Vector3(),trail=new T.Vector3(0,0,.58).applyQuaternion(yaw);
  const hang=boss?capeHang(matrix,trail.clone().multiplyScalar(1+3.6*bowed*(1-.8*loft)),this.capeHangTurn??=new T.Quaternion()):null,hangStep=new T.Quaternion(),still=new T.Quaternion(),floor=state.pos.y+(state.groundOffset||0)+.04;
  const hangCos=hang?Math.min(1,Math.abs(hang.w)):1,hangAngle=Math.acos(hangCos);
  const hangAxisScale=hangAngle>1e-5?(hang.w<0?-1:1)/Math.sin(hangAngle):0;
  // The long chain turns the rendered hips/body in addition to the gameplay
  // root. Include that actual heading in the cloth's turning response.
  const angle=reset||this.capeHeading==null?0:Math.atan2(Math.sin(heading-this.capeHeading),Math.cos(heading-this.capeHeading));
  const spin=reset?0:T.MathUtils.clamp(angle/Math.max(.008,dt),-4.5,4.5);
  this.capeSpin=T.MathUtils.lerp(this.capeSpin||0,spin,1-Math.exp(-dt*8));this.capeHeading=heading;
  const flare=boss?new T.Vector3(-this.capeSpin*.13,Math.abs(this.capeSpin)*.105,Math.abs(this.capeSpin)*.14):new T.Vector3(-this.capeSpin*.075+(this.attackCloth?.x||0)*.19,(this.attackCloth?.y||0)*.23,Math.abs(this.capeSpin)*.065);
  flare.applyQuaternion(yaw);
  // The lower cloth carries on around the planted shoulder while the hands
  // reverse direction into the ground. The seam stays fixed to the chest.
  const rakeCarry=boss&&state.bossAction==='rocks'?
    T.MathUtils.smoothstep(state.bossElapsed,.77,1.73)*(1-T.MathUtils.smoothstep(state.bossElapsed,2.60,3.39)):0;
  const rushCarry=boss&&state.groundedRush&&state.bossAction==='leap'?
    T.MathUtils.smoothstep(state.bossElapsed,2.28,2.87)*(1-T.MathUtils.smoothstep(state.bossElapsed,3.50,4.05)):0;
  const rushHem=rushCarry?new T.Vector3(1.65,1.72,1.12).applyQuaternion(yaw):null;
  const firstRake=boss&&state.phase===1&&state.bossAction==='rocks';
  const gatheredHem=rakeCarry&&!firstRake?new T.Vector3(-1.48,2.16,.29).applyQuaternion(yaw):null;
  const seamStride=this.cape.geometry.parameters?.widthSegments+1;
  const gather=firstRake&&rakeCarry>0&&Number.isFinite(seamStride);
  const capeScale=gather?matrix.getMaxScaleOnAxis():1;
  const mountBlend=firstRake?T.MathUtils.smoothstep(state.bossElapsed,1.72,2.06)*(1-T.MathUtils.smoothstep(state.bossElapsed,2.94,3.32)):0;
  const sail=mountBlend?T.MathUtils.smoothstep(state.bossElapsed,2.05,2.46):0;
  const leftArm=this.bones?.mixamorigLeftArm,rightArm=this.bones?.mixamorigRightArm;
  const mounted=mountBlend>0&&gather&&leftArm&&rightArm;
  const left=mounted?new T.Vector3().setFromMatrixPosition(leftArm.matrixWorld):null;
  const right=mounted?new T.Vector3().setFromMatrixPosition(rightArm.matrixWorld):null;
  const near=mounted?new T.Vector3():null;
  const panel=mounted?new T.Vector3():null;
  // Lift the fold under the moving upper arm; the hem follows through its
  // existing damped particles. Work in the garment frame so turns do not
  // exchange the actor's left and right sides.
  const cutting=boss&&(state.bossAction==='cross'||state.bossAction==='sweepDown');
  const elbows=cutting?[this.bones?.mixamorigLeftForeArm,this.bones?.mixamorigRightForeArm]:[];
  const support=this.capeArmSupport??=[0,0];
  const blend=reset?1:-Math.expm1(-h*10);
  const wanted=[0,0];
  for(const elbow of elbows)if(elbow){
    local.setFromMatrixPosition(elbow.matrixWorld).applyMatrix4(inverse);
    const high=T.MathUtils.smoothstep(local.y,height*.5-1.50,height*.5-.05);
    const outward=T.MathUtils.smoothstep(Math.abs(local.x),.53,1.34);
    const side=local.x<0?0:1;
    wanted[side]=Math.max(wanted[side],high*outward);
  }
  for(let side=0;side<2;side++)support[side]+=(wanted[side]-support[side])*blend;
  const carrying=boss&&(support[0]>.005||support[1]>.005);
  if(carrying)(this.capeLinear??=new T.Matrix3()).setFromMatrix4(matrix);
  const clothUV=this.cape.geometry.attributes.uv;
  if(!this.capeRestFactors){
   const factors=new Float64Array(attribute.count*2);
   for(let i=0;i<attribute.count;i++){
    const f=T.MathUtils.clamp((height*.5-this.capeBase[i*3+1])/height,0,1);
    factors[2*i]=f;factors[2*i+1]=this.capeBase[i*3]*(1.22/(1.22+1.58*Math.pow(f,.82)));
   }
   this.capeRestFactors=factors;
  }
  const springCount=grid?grid.anchors.length:attribute.count;
  for(let spring=0;spring<springCount;spring++){
   const i=grid?grid.anchors[spring]:spring;
   const f=this.capeRestFactors[2*i],weight=f*f;
   target.fromBufferAttribute(attribute,i).applyMatrix4(matrix);
   if(carrying){
    const u=clothUV.getX(i)*2-1,v=1-clothUV.getY(i);
    const lift=support[u<0?0:1]*T.MathUtils.smoothstep(Math.abs(u),.19,.94);
    const fold=lift*T.MathUtils.smoothstep(v,.025,.28)*(1-.74*T.MathUtils.smoothstep(v,.38,1));
    if(fold>0){
     local.set(-u*.31,1.04-.35*v,.31+.17*Math.cos((Math.abs(u)-v*.30)*11));
     point.copy(local).applyMatrix3(this.capeLinear);
     target.addScaledVector(point,fold);
    }
   }
   if(hang){
    // Hang from the shoulder seam under gravity instead of pitching rigidly with the chest.
    seam.set(this.capeRestFactors[2*i+1],height*.5,.06).applyMatrix4(matrix);
    if(f>=5/6)hangStep.copy(hang);
    else if(hangAxisScale){
     const theta=hangAngle*(.25+f*.9),k=Math.sin(theta)*hangAxisScale;
     hangStep.set(hang.x*k,hang.y*k,hang.z*k,Math.cos(theta));
    }else hangStep.copy(still).slerp(hang,.25+f*.9);
    target.sub(seam).applyQuaternion(hangStep).add(seam);
    // Slow heavy sway travelling down the folds.
    target.addScaledVector(trail,weight*(.10*Math.sin(t*1.7+this.capeBase[i*3]*1.9-f*3.1)+.05*Math.sin(t*2.9+this.capeBase[i*3]*4.3)));
   }
   target.addScaledVector(flare,weight*(.82+.18*Math.sin(this.capeBase[i*3]*2.3+t*2)));
   if(loft>0){
    const belly=Math.sin(f*Math.PI*.9),ripple=.82+.18*Math.sin(this.capeBase[i*3]*1.7+t*3.1+f*2.4);
    target.y+=loft*(3.9*weight+1.7*belly)*ripple*(firstRake?.42:1)*(1-.96*kneel);
    target.addScaledVector(trail,loft*(.7*weight+.5*belly));
   }
   if(kneel>0 && f>.05){
     const fall=T.MathUtils.smoothstep(f,.05,.64)*kneel;
     const drapedHeight=Math.max(floor+.05,seam.y-(.47+1.42*f)*f);
     const excess=Math.max(0,target.y-drapedHeight);
     target.addScaledVector(trail,fall*(.85*f+.43*excess));
     target.y-=excess*fall;
   }
   if(firstRake&&rakeCarry>0){
     // A gathered fall exposes the far wrist as the caster turns his back.
     const acrossCloth=local.set(1,0,0).applyQuaternion(yaw);
     target.addScaledVector(acrossCloth,-this.capeBase[i*3]*.48*rakeCarry*f);
   }
   if(rushHem){
     const scallop=.76+.24*Math.sin(this.capeBase[i*3]*2.1+f*2.);
     target.addScaledVector(rushHem,rushCarry*weight*scallop);
   }
   if(gatheredHem){
     const fold=.63+.37*T.MathUtils.smoothstep(this.capeBase[i*3],-.95,.95);
     target.addScaledVector(gatheredHem,rakeCarry*weight*fold);
   }
   if(mounted){
     const row=Math.floor(i/seamStride)/this.cape.geometry.parameters.heightSegments;
     // Collapse the working flank tangentially along the garment's shoulder seam.
     // The heavy outer corner follows later with a broad, lower trailing curve.
     const column=(i%seamStride)/(seamStride-1);
     near.lerpVectors(left,right,.05+.90*column);
     const top=(i%seamStride)*3;
     const length=point.fromArray(this.capeBase,i*3).distanceTo(seam.fromArray(this.capeBase,top))*capeScale;
     const gatherAcross=T.MathUtils.smoothstep(row,0,.46)*sail;
     panel.copy(near).lerp(left,gatherAcross);
     const bend=T.MathUtils.smoothstep(row,.06,.80);
     const spread=1-column;
     const collarCurve=1-T.MathUtils.smoothstep(row,.14,.54);
     const across=-(1.2+.36*spread)*(.58+.42*bend);
     const rise=.15+collarCurve*4+(0.6+.75*spread)*bend;
     const z=-.56+.20*Math.sin(Math.PI*row)+.10*Math.sin(2*Math.PI*column);
     point.set(sail*across,-1+sail*(1+rise),.14+sail*z).normalize().applyQuaternion(yaw);
     panel.addScaledVector(point,length*(.78+.12*spread));
     // Keep the work-side pleat up by the shoulder until it clears the bent head.
     panel.y+=gatherAcross*(1-bend)*.38;
     target.lerp(panel,mountBlend);
   }
   // When the chest turns upside down, a rigid local-Y target points the
   // hem into the air. Let the free cloth fall and trail from its seam.
   if(drapeBlend>0){
    seam.set(this.capeBase[i*3],height*.5,this.capeBase[i*3+2]).applyMatrix4(matrix);
    seam.addScaledVector(trail,f);seam.y-=height*f*.82;
    target.lerp(seam,drapeBlend);
   }
   const particle=this.capeParticles[i];
   if(reset||f<.07){particle.p.copy(target);particle.v.set(0,0,0);}
   else{
    const spring=(boss?100:145)-(boss?65:75)*weight,drag=12-3*weight;
    point.copy(target).sub(particle.p).multiplyScalar(spring);
    // The lower cloth follows the moving chest with inertia, while the seam
    // stays attached. The small lift comes from actual travel and turning.
    point.y+=weight*(rolling?-9:Math.min(5,this.clothSpeed||0)*1.0+Math.abs(this.clothTurn||0)*1.5);
    particle.v.addScaledVector(point,h).multiplyScalar(Math.exp(-drag*h));
    particle.p.addScaledVector(particle.v,h);
    point.copy(particle.p).sub(target).clampLength(0,.12+weight*(boss?1.25:.48));particle.p.copy(target).add(point);
    local.copy(particle.p).sub(state.pos).applyQuaternion(unturn);
    if(!rolling&&local.y>(boss?.5:.38)&&local.y<(boss?3.6:1.6)&&Math.abs(local.x)<(boss?1.02:.30)&&local.z<(boss?.42:.17)){
     local.z=mounted?T.MathUtils.lerp(local.z,.42,1-mountBlend):(boss?.42:.17);particle.p.copy(local.applyQuaternion(yaw)).add(state.pos);particle.v.multiplyScalar(.75);
    }
    if(gather&&f>.1){
     // Keep each fold attached to its own shoulder column when the caster backs up.
     const top=(i%seamStride)*3;
     seam.fromArray(this.capeBase,top);
     const reach=local.fromArray(this.capeBase,i*3).distanceTo(seam)*capeScale*1.06;
     seam.applyMatrix4(matrix);
     if(mounted)seam.lerp(near,mountBlend);
     point.copy(particle.p).sub(seam);
     if(point.lengthSq()>reach*reach){
      point.normalize();particle.p.copy(seam).addScaledVector(point,reach);
      particle.v.addScaledVector(point,-Math.max(0,particle.v.dot(point)));
     }
    }
    if(rolling){const floor=state.pos.y+(state.groundOffset||0)+.025;if(particle.p.y<floor){particle.p.y=floor;particle.v.y=Math.max(0,particle.v.y);}}
    if(boss&&particle.p.y<floor){particle.p.y=floor;particle.v.y=Math.max(0,particle.v.y);particle.v.multiplyScalar(.9);}
   }
   point.copy(particle.p).applyMatrix4(inverse);
   if(grid){
    grid.offsets[3*i]=point.x-attribute.getX(i);grid.offsets[3*i+1]=point.y-attribute.getY(i);grid.offsets[3*i+2]=point.z-attribute.getZ(i);
   }
   attribute.setXYZ(i,point.x,point.y,point.z);
  }
  if(grid)grid.apply(attribute.array,matrix,inverse,floor);
  this.capeOrigin=origin;attribute.needsUpdate=true;
  updateClothNormals(this.cape.geometry);
 }
 postGrabStep(state){
  const recovery=state.grabRecovery;
  if(this.name!=='gilded_warlord'||!recovery||recovery.chained)return;
  const age=recovery.elapsed,weight=T.MathUtils.smoothstep(age,.10,.28)*(1-T.MathUtils.smoothstep(age,1.35,1.65));
  if(weight<=0)return;
  const body=2.2*T.MathUtils.smoothstep(age,.28,1.08),lead=T.MathUtils.smoothstep(age,.28,.83),follow=T.MathUtils.smoothstep(age,.78,1.32);
  const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
  for(const side of ['Right','Left']){
   const foot=findRigBone(this.bones,side+'Foot');if(!foot)continue;
   const right=side==='Right',sign=right?1:-1,rotation=foot.getWorldQuaternion(new T.Quaternion());
   const z=right?.15+body-3.1*lead+.75*T.MathUtils.smoothstep(age,1.05,1.6):-.10+body-2.2*follow;
   const lift=(right?.46*Math.sin(lead*Math.PI):.30*Math.sin(follow*Math.PI));
   this.poseLimb(side,['UpLeg','Leg','Foot'],world(sign*.42,(this.footClearance||.08)+lift,z),world(sign*.60,1.0,-1.4),weight);
   this.root.updateMatrixWorld(true);this.combatAdjustments.push({bone:foot,rotation:foot.quaternion.clone()});
   foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));
  }
 }

 sourceCrossPose(state){
  if(this.name!=='gilded_warlord'||state.bossAction!=='cross'||state.stagger||state.critical||state.grabRecovery)return;
  // Primary 23.95-26.65: open, draw the paired blades inward, left cut,
  // right cut, cross the grips and release. Coordinates fit this rig at 4.4 m.
  // Each hand is [x,y,z, blade direction x,y,z]. Final fields: torso yaw/lean/knee.
  const keys=[
   [0,[.98,2.20,-.25,.9,.35,-.3],[-.98,2.15,-.25,-.9,.35,-.3],0,.12,.24],
   [.50,[1.20,2.50,-.32,.95,.25,-.05],[-1.20,2.45,-.35,-.95,.25,-.1],0,-.04,.14],
   [.96,[1.10,2.20,-.40,1,.15,-.15],[.25,3.60,-.50,-1,.1,-.15],-.18,.14,.27],
   [1.20,[1.10,2.10,-.40,1,.1,-.15],[.35,3.45,-.60,-1,.1,-.15],-.28,.16,.28],
   [1.43,[.65,2.64,-.46,.55,.85,-.2],[-.96,1.74,-.73,-1,-.4,-.2],-.50,.35,.40],
   [1.57,[.35,3.02,-.30,.60,.90,0],[-1.03,1.62,-.62,-.85,-.4,-.2],-.35,.30,.38],
   [1.75,[1.08,1.65,-.56,1,-.35,-.2],[-.35,2.80,-.43,-.60,.9,0],.45,.38,.41],
   [1.98,[-.14,2.14,-1.0,-.6,.6,-.7],[.14,2.14,-1.0,.6,.6,-.7],.05,.30,.34],
   [2.14,[-.34,2.42,-.72,-.7,.7,0],[.34,2.42,-.72,.7,.7,0],0,.36,.40],
   [2.38,[1.30,1.72,-.54,1,-.25,-.15],[-1.30,1.72,-.54,-1,-.25,-.15],0,.40,.43],
   [2.72,[1.10,2.00,-.40,.9,-.15,-.45],[-1.10,2.00,-.40,-.9,-.15,-.45],0,.18,.28],
   [3.4,[.98,2.20,-.25,.9,.35,-.3],[-.98,2.15,-.25,-.9,.35,-.3],0,.12,.24]
  ];
  // Primary 54.8-55.6 follows the rising paired cut. Keep its distinct low
  // recovery into the next crossing cut instead of returning to the raised tell.
  if(state.crossLow){
   keys[0]=[0,[-.60,1.95,-1.1,-.25,-.55,-.80],[-.98,1.85,-1.1,-.25,-.55,-.80],-.10,.55,.52];
   keys[1]=[.50,[-.60,1.95,-1.1,-.25,-.55,-.80],[-.98,1.85,-1.1,-.25,-.55,-.80],-.10,.55,.52];
   keys[2]=[.96,[-.48,2.10,-.95,-.65,.38,-.65],[-.65,2.08,-.95,-.42,.35,-.80],-.16,.42,.40];
  }
  this.sourceBladeTrack(state,keys);
 }

 sourceBladeTrack(state,keys,hips=0,weight=1,fromIdle=false){
  const blend=weight<1?new Map(Object.values(this.bones).map(b=>[b,b.quaternion.clone()])):null;
  const basePosition=this.visual.position.clone(),baseRotation=this.visual.quaternion.clone();
  // Build the authored pose from this frame's clip, then crossfade from the
  // existing held stomp. Never accumulate the generic and authored torso turns.
  if(fromIdle){for(let n=this.combatAdjustments.length-1;n>=0;n--){const p=this.combatAdjustments[n];p.bone.quaternion.copy(p.rotation);}this.root.updateMatrixWorld(true);}
  const t=state.bossElapsed||0;let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  const a=keys[i],b=keys[i+1],u=keys.linear?T.MathUtils.clamp((t-a[0])/(b[0]-a[0]),0,1):T.MathUtils.smoothstep(t,a[0],b[0]);
  const value=k=>T.MathUtils.lerp(a[k],b[k],u),yaw=(state.yaw||0)+this.visual.rotation.y;
  const rotate=(suffix,axis,angle)=>{
   const bone=findRigBone(this.bones,suffix);if(!bone)return;
   this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
   axis.applyAxisAngle(new T.Vector3(0,1,0),yaw).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
   bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle));bone.updateWorldMatrix(true,true);
  };
  this.visual.rotation.x=0;this.visual.position.y-=Math.max(0,value(5)-.14)*.38;
  if(hips)rotate('Hips',new T.Vector3(0,1,0),value(3)*hips);
  rotate('Spine',new T.Vector3(0,1,0),value(3)*.4*(1-hips));
  rotate('Spine2',new T.Vector3(0,1,0),value(3)*.6*(1-hips));
  rotate('Spine',new T.Vector3(1,0,0),-value(4));
  for(const side of ['Right','Left']){
   rotate(side+'UpLeg',new T.Vector3(1,0,0),value(5));
   rotate(side+'Leg',new T.Vector3(1,0,0),-value(5)*1.65);
  }
  const scale=this.height/4.4,toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
  const orientation=this.visual.getWorldQuaternion(new T.Quaternion());
  for(const [side,k] of [['Right',1],['Left',2]]){
   const sign=side==='Right'?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);
   if(!hand||!weapon?.handBindInverse)continue;
   const v=a[k].map((n,j)=>T.MathUtils.lerp(n,b[k][j],u));
   this.poseHand(side,toWorld(...v.slice(0,3)),toWorld(sign*1.7,2.65,.1));this.root.updateMatrixWorld(true);
   // Build the roll at authored keys, then interpolate full orientations. A
   // per-frame projected basis flips when a moving blade crosses its pole.
   const bladeAt=key=>{
    if(key[k].length===10)return new T.Quaternion().fromArray(key[k],6);
    const up=new T.Vector3(...key[k].slice(3)).normalize();
    const forward=Math.abs(up.z)<.95?new T.Vector3(0,0,1):new T.Vector3(1,0,0);
    forward.addScaledVector(up,-forward.dot(up)).normalize();
    const across=new T.Vector3().crossVectors(up,forward).normalize();
    forward.crossVectors(across,up).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,up,forward));
   };
   const blade=orientation.clone().multiply(bladeAt(a).slerp(bladeAt(b),u));
   const mount=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
   const desired=hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(blade).multiply(mount.invert()).normalize();
   this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(desired);hand.updateWorldMatrix(true,true);
  }
  if(blend){for(const [bone,quaternion] of blend)bone.quaternion.slerpQuaternions(quaternion,bone.quaternion.clone(),weight);this.visual.position.lerpVectors(basePosition,this.visual.position.clone(),weight);this.visual.quaternion.slerpQuaternions(baseRotation,this.visual.quaternion.clone(),weight);this.root.updateMatrixWorld(true);}

 }



 phaseKneelPose(state){
  if(this.name!=='gilded_warlord'||state.phaseTime==null)return;
  const t=state.phaseTime;
  const kneel=[[1.15,3.0,-.55,0,-1,-.02],[-1.2,1.35,-.35,-.92,-.25,-.2],.08,.72,.95];
  const low=[[1.15,3.0,-.55,0,-1,-.02],[-1.2,1.35,-.35,-.92,-.25,-.2],.08,.84,.95];
  const ready=[[1.25,2.3,-.3,.9,.4,-.05],[-1.25,2.3,-.3,-.9,.4,-.05],0,.08,.18];
  // Above the gate both clipped points turn upward. The grip rolls are
  // opposite in a frontal shot even though the two weapon meshes are identical.
  const revealBlade=(x,y,z,dx,dy,dz)=>{
   const axis=new T.Vector3(dx,dy,dz).normalize(),back=new T.Vector3(0,1,0);
   back.addScaledVector(axis,-back.dot(axis)).normalize();
   const flat=new T.Vector3().crossVectors(back,axis);
   const roll=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(back,axis,flat));
   return [x,y,z,dx,dy,dz,...roll.toArray()];
  };
  const reveal=[revealBlade(1.38,2.32,-.28,.82,.58,-.21),revealBlade(-1.35,2.34,-.31,-.82,.58,-.18),0,.08,.18];
  // At the cut to the gate the screen-left tip settles lower and farther
  // out. Keep the close-up transition and the two blade profiles intact.
  const open=[revealBlade(1.52,1.86,.01,.87,.51,-.01),revealBlade(-1.49,1.85,-.02,-.84,.405,-.18),0,.08,.18];
  this.sourceBladeTrack({...state,bossElapsed:t},[[0,...kneel],[12,...kneel],[24,...low],[47,...low],[57,...ready],[71,...ready],[74,...reveal],[74.90,...reveal],[76,...open],[86,...open]],0,1,true);
  const lowered=1-T.MathUtils.smoothstep(t,47,57);
  this.visual.position.y-=.85*lowered;this.root.updateMatrixWorld(true);
  const world=(x,y,z)=>new T.Vector3(x,y+(state.groundOffset||0),z).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).add(state.pos);
  for(const side of ['Right','Left']){
   const sign=side==='Right'?1:-1,foot=world(sign*.65,this.footClearance||.15,side==='Right'?.55:-1.1),pole=world(sign*.75,side==='Right'?.45:1.6,-1.1);
   this.poseLimb(side,['UpLeg','Leg','Foot'],foot,pole,lowered);
  }
  const head=Object.values(this.bones).find(b=>/Head$/.test(b.name));
  if(head){this.combatAdjustments.push({bone:head,rotation:head.quaternion.clone()});head.rotateX(-.35*(1-T.MathUtils.smoothstep(t,47,57)));}
 }

 sourceRockRipPose(state){
  if(this.name!=='gilded_warlord'||state.bossAction!=='rocks'||state.stagger)return;
  // Main 12.5-15.25s: twist with charged blades, drive both points into ash,
  // drag low through the planted crouch, then rip upward before levitation.
  // Contact and root flight remain ROCK_SEQUENCE; these keys only pose the rig.
  const R=[1.02,2.22,-.26,.88,.42,-.20],L=[-1.02,2.22,-.26,-.88,.42,-.20];
  const keys=[
   [0,R,L,0,.10,.20],
   [.40,[1.18,2.75,-.1,.55,.78,.22],[-.70,2.55,-.6,-.72,.30,-.52],.45,.12,.25],
   [1.05,[.80,3.70,.10,.25,.85,.45],[-.55,3.45,-.15,-.15,.95,.30],.65,.10,.32],
   [1.42,[.85,2.55,-1.05,.4,-.72,-.65],[-.7,2.38,-1.10,-.4,-.72,-.65],.28,.42,.63],
   [1.65,[1.05,1.18,-.9,.4,-.34,-.85],[-1.05,1.18,-.9,-.4,-.34,-.85],.12,.64,.72],
   [2.05,[1.05,1.10,-.2,.65,-.30,-.7],[-1.05,1.10,-.2,-.65,-.30,-.7],-.12,.60,.75],
   [2.26,[1.0,1.65,-.75,.55,.15,-.82],[-1.0,1.65,-.75,-.55,.15,-.82],-.20,.40,.55],
   [2.52,[1.1,3.0,-.40,.45,.88,-.2],[-1.1,3.0,-.40,-.45,.88,-.2],-.10,.16,.32],
   [2.85,[1.40,3.30,-.20,.7,.7,-.04],[-1.40,3.30,-.20,-.7,.7,-.04],0,.04,.28],
   [4.5,[1.50,2.75,-.25,.9,.4,-.06],[-1.50,2.75,-.25,-.9,.4,-.06],0,.06,.30],
   [5.65,[1.1,3.2,-.2,.4,.9,-.1],[-1.1,3.2,-.2,-.4,.9,-.1],0,.05,.3],
   [6.15,[1.35,2.4,-.65,.82,-.1,-.5],[-1.35,2.4,-.65,-.82,-.1,-.5],0,.20,.40],
   [7.75,R,L,0,.10,.24]
  ];
  if(state.phase===2){
    // The return cast at 130 s presents a long, low charged edge across the
    // player, then the far blade rises behind the turned shoulder.
    keys[1]=[.40,[.87,2.49,-.62,.90,.26,-.35],[-.82,3.19,.05,-.24,.95,.18],.52,.14,.29];
    keys.splice(2,0,[.77,[1.07,2.42,-.60,.69,.32,-.65],[-.81,3.38,.11,-.62,.68,.37],.72,.15,.30]);
  }
  this.sourceBladeTrack(state,keys,.35,1,true);
 }

 sourceMeleePose(state){
  if(this.name!=='gilded_warlord'||state.stagger||state.critical||!['double','sweepDown','holySweepDown','stompSweep','swing','promised','slam','uppercut','risingSlash','bloodflame'].includes(state.bossAction))return;
  // Main27.4-29.5 /30.8-33.5 /99-107: the preparing sword stays raised
  // while the previous cut settles. Each chain is one continuous hand/body
  // track; do not add independent per-contact arm rotations onto the idle rig.
  // R/L grip xyz + blade direction, torso yaw/lean/knee, R/L planted foot z.
  const R=[1.02,2.22,-.26,.88,.42,-.20],L=[-1.02,2.22,-.26,-.88,.42,-.20];
  const poses={
   ready:[R,L,0,.12,.24,-.15,.12],
   rh:[[.72,4.15,.22,.08,.28,.96],[-1.02,2.5,-.42,-.48,.87,-.08],.50,-.16,.28,.08,-.28],
   rd:[[.16,1.52,-1.20,-.24,-.56,-.79],[-.88,3.02,-.27,-.28,.95,.05],-.60,.66,.59,-.64,.34],
   rw:[[-.18,3.62,.12,-.93,.25,.28],[-1.05,2.55,-.40,-.60,.80,.02],.58,.10,.33,.04,-.32],
   rs:[[1.27,1.96,-.68,.95,-.23,-.20],[-.62,3.14,-.28,-.24,.97,.05],-.62,.38,.45,-.53,.30],
   lw:[[1.03,2.65,-.32,.48,.87,.08],[.18,3.60,.12,.93,.25,.28],-.60,.12,.34,-.32,.04],
   ls:[[.65,3.18,-.18,.25,.96,.08],[-1.27,1.94,-.72,-.95,-.24,-.16],.62,.38,.46,.30,-.53],
   both:[[.72,3.98,-.08,.18,.25,.95],[-.72,3.98,-.08,-.18,.25,.95],0,-.16,.65,-.28,.10],
   slam:[[.46,1.43,-1.22,.36,-.52,-.78],[-.46,1.43,-1.22,-.36,-.52,-.78],0,.78,.84,-.46,.26],
   crossed:[[-.28,2.65,-.80,-.70,.65,-.30],[.28,2.65,-.80,.70,.65,-.30],0,.32,.44,-.34,.23],
   open:[[1.27,1.82,-.60,.97,-.20,-.15],[-1.27,1.82,-.60,-.97,-.20,-.15],0,.46,.51,-.40,.27],
   low:[[.52,1.38,-.62,.25,-.45,-.85],[-.52,1.38,-.62,-.25,-.45,-.85],0,.62,.62,-.37,.25],
   rise:[[.58,3.92,-.15,.18,.95,.25],[-.58,3.92,-.15,-.18,.95,.25],0,-.12,.35,-.48,.30],
   rt:[[.89,2.75,.44,.10,.03,-1],L,.52,.15,.37,.08,-.29],
   thrust:[[.32,2.30,-1.23,.02,-.07,-1],[-.96,2.8,-.20,-.36,.93,.08],-.48,.50,.54,-.61,.35],
   lt:[R,[-.89,2.75,.44,-.10,.03,-1],-.52,.15,.37,-.29,.08],
   lthrust:[[.96,2.8,-.20,.36,.93,.08],[-.32,2.30,-1.23,-.02,-.07,-1],.48,.50,.54,.35,-.61],
   hold:[[.70,3.35,-.56,.04,.99,.10],[-1.08,2.57,-.30,-.80,.58,.10],-.18,.18,.32,-.34,.22]
  };
  const action=state.bossAction,move=MOVES[action];this.meleeTracks??={};
  if(!this.meleeTracks[action]){
   const hands=[[[0,...R]],[[0,...L]]],body=[[0,...poses.ready.slice(2)]];
   let previousBody=0;
   for(const c of move.contacts){
    if(c.area)continue;
    let wind,cut;
    if(c.style==='down'){wind=c.hand?'rh':'both';cut=c.hand?'rd':'slam';}
    else if(c.style==='up'){wind='low';cut='rise';}
    else if(c.style==='cross'){wind='crossed';cut='open';}
    else if(c.style==='thrust'){wind=c.hand===-1?'lt':'rt';cut=c.hand===-1?'lthrust':'thrust';}
    else {wind=c.hand===-1?'lw':'rw';cut=c.hand===-1?'ls':'rs';}
    for(let side=0;side<2;side++){
     if(c.hand&&c.hand!==(side===0?1:-1))continue;
     const track=hands[side],previous=track.at(-1);
     const start=Math.max(previous[0]+.04,c.t-(c.jump?1.25:1.05));
     if(start<c.t-.36)track.push([start,...previous.slice(1)]);
     const windAt=Math.max(previous[0]+.16,c.t-.55);
     track.push([windAt,...poses[wind][side]]);
     
     const windPose=poses[wind][side],cutPose=poses[cut][side];
     const sign=side===0?1:-1;
     if(c.style==='down'){
      track.push([T.MathUtils.lerp(windAt,c.t+.025,.48),sign*.56,3.86,-.40,sign*.10,.96,-.24]);
      track.push([T.MathUtils.lerp(windAt,c.t+.025,.78),sign*.40,2.64,-1.12,sign*.14,.25,-.96]);
     }else if(c.style==='sweep'||c.style==='spin'){
      track.push([T.MathUtils.lerp(windAt,c.t+.025,.48),-sign*.16,3.05,-.78,-sign*.50,.20,-.84]);
      track.push([T.MathUtils.lerp(windAt,c.t+.025,.78),sign*.64,2.40,-1.04,sign*.34,-.08,-.94]);
     }else if(c.style==='up'){
      track.push([T.MathUtils.lerp(windAt,c.t+.025,.48),sign*.48,2.10,-1.02,sign*.14,-.24,-.96]);
      track.push([T.MathUtils.lerp(windAt,c.t+.025,.78),sign*.52,3.20,-.72,sign*.12,.55,-.82]);
     }
     track.push([c.t+.025,...cutPose]);
     // Continue through contact, then decelerate without reversing the blade.
     if((c.style==='sweep'||c.style==='spin')&&!move.contacts.some(n=>!n.area&&n.t>c.t&&n.t<c.t+.9&&(!n.hand||n.hand===sign))){
      track.push([c.t+.16,sign*1.20,1.92,.08,sign*.86,-.17,.48]);
      track.push([c.t+.28,sign*1.06,2.12,.16,sign*.74,.18,.65]);
     }
     if(action==='promised'&&c.t===1.1&&side===0)track.push([1.56,...poses.hold[0]],[2.08,...poses.hold[0]]);
    }
    body.push([Math.max(previousBody+.12,c.t-.36),...poses[wind].slice(2)],[c.t+.025,...poses[cut].slice(2)]);
    previousBody=c.t+.025;
   }
   for(let side=0;side<2;side++){
    const tr=hands[side],last=tr.at(-1);
    if(move.duration-last[0]>.55)tr.push([last[0]+.30,...last.slice(1)],[move.duration,...poses.ready[side]]);
    else tr.push([move.duration,...last.slice(1)]);
   }
   if(move.duration-previousBody>.55)body.push([previousBody+.30,...body.at(-1).slice(1)],[move.duration,...poses.ready.slice(2)]);
   else body.push([move.duration,...body.at(-1).slice(1)]);
   const blade=key=>{
    const up=new T.Vector3(...key.slice(4,7)).normalize(),forward=Math.abs(up.z)<.95?new T.Vector3(0,0,1):new T.Vector3(1,0,0);
    forward.addScaledVector(up,-forward.dot(up)).normalize();const across=new T.Vector3().crossVectors(up,forward).normalize();forward.crossVectors(across,up).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,up,forward));
   };
   for(const tr of hands){
    tr.sort((a,b)=>a[0]-b[0]);let lastUp=null,lastQ=null;
    for(const k of tr){
     const up=new T.Vector3(...k.slice(4,7)).normalize();
     const q=lastQ?new T.Quaternion().setFromUnitVectors(lastUp,up).multiply(lastQ).normalize():blade(k);
     k.push(...q.toArray());lastUp=up;lastQ=q;
    }
   }
   body.sort((a,b)=>a[0]-b[0]);
   const sampleHand=(tr,t)=>{
    let i=0;while(i<tr.length-2&&t>tr[i+1][0])i++;const a=tr[i],b=tr[i+1],u=T.MathUtils.clamp((t-a[0])/(b[0]-a[0]),0,1);
    const interpolate=k=>{
     const previous=tr[Math.max(0,i-1)],next=tr[Math.min(tr.length-1,i+2)],dt=b[0]-a[0],slope=(b[k]-a[k])/dt;
     const tangent=(x,y)=>slope===0||x*y<=0?0:Math.sign(slope)*Math.min(Math.abs((x+y)/2),Math.abs(slope)*2);
     const left=i===0?0:tangent((a[k]-previous[k])/(a[0]-previous[0]),slope);
     const right=i+2>=tr.length?0:tangent(slope,(next[k]-b[k])/(next[0]-b[0]));
     return (2*u*u*u-3*u*u+1)*a[k]+(u*u*u-2*u*u+u)*dt*left+(-2*u*u*u+3*u*u)*b[k]+(u*u*u-u*u)*dt*right;
    };
    const q=new T.Quaternion().fromArray(a,7).slerp(new T.Quaternion().fromArray(b,7),u),direction=new T.Vector3(0,1,0).applyQuaternion(q);
    return [interpolate(1),interpolate(2),interpolate(3),...direction.toArray(),...q.toArray()];
   };
   // Resample independently authored hand tracks to one reusable pose track.
   // Full quaternions preserve blade roll across vertical/horizontal poles.
   const times=[...new Set([...Array(Math.ceil(move.duration*60)+1)].map((_,i)=>Math.min(move.duration,i/60)).concat(move.contacts.filter(c=>!c.area).map(c=>c.t+.025)))].sort((a,b)=>a-b);
   const track=times.map(t=>[t,sampleHand(hands[0],t),sampleHand(hands[1],t),...this.playerPoseKey(body,t).slice(1)]);
   track.linear=true;this.meleeTracks[action]=track;
  }
  const keys=this.meleeTracks[action],t=state.bossElapsed||0;

  let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
  const a=keys[i],b=keys[i+1],u=T.MathUtils.smoothstep(t,a[0],b[0]);
  if(action==='swing'){
   const turn=this.playerPoseKey([[0,0],[1.75,0],[2.05,.7],[2.28,1.6],[2.62,2.8],[3.05,5.5],[3.38,Math.PI*2],[move.duration,Math.PI*2]],t)[1];
   this.visual.rotation.y=turn;
  }else if(action==='sweepDown'||action==='holySweepDown'){
   const down=move.contacts[1].t;
   this.visual.rotation.y=this.playerPoseKey([[0,0],[.55,-.55],[.825,-.15],[1.18,1.45],[down-.32,1.45],[down+.025,0],[move.duration,0]],t)[1];
  }
  this.sourceBladeTrack(state,keys,.42,1,true);
  // Plant the feet through the cut. The old pulse rotated both thighs and
  // let the body bob upward as soon as the hand reached its contact.
  const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
  for(const [side,k] of [['Right',6],['Left',7]]){
   const foot=findRigBone(this.bones,side+'Foot');if(!foot)continue;
   const sign=side==='Right'?1:-1,q=foot.getWorldQuaternion(new T.Quaternion());
   const footZ=T.MathUtils.lerp(a[k],b[k],u),stomp=action==='stompSweep'&&side==='Left'?T.MathUtils.smoothstep(t,.08,.64)*(1-T.MathUtils.smoothstep(t,.89,1.11)):0;
   this.poseLimb(side,['UpLeg','Leg','Foot'],world(sign*.43,(this.footClearance||.16)+stomp*.70,footZ-stomp*.25),world(sign*.62,1.1,-.90));
   this.combatAdjustments.push({bone:foot,rotation:foot.quaternion.clone()});
   foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
  }
  this.root.updateMatrixWorld(true);
 }

 sourcePromisedHold(state){
  if(this.name!=='gilded_warlord'||state.bossAction!=='promised'||state.stagger||state.critical)return;
  const t=state.bossElapsed||0;
  const weight=T.MathUtils.smoothstep(t,1.16,1.42)*(1-T.MathUtils.smoothstep(t,2.15,2.48));
  if(weight<=0)return;
  // Main 99.8-100.6 s: the right grip stays by the face after the opening
  // cut. Pose that held hand independently while the other arm winds up.
  // Blending a second complete skeleton here introduced a wrist roll jump.
  const keys=[
   [1.16,.63,3.12,-.63,.08,.99,.06],
   [1.46,.70,3.38,-.56,.04,.99,.10],
   [1.85,.72,3.34,-.56,.04,.99,.10],
   [2.14,.78,3.25,-.48,.12,.98,.10],
   [2.48,.95,2.85,-.38,.48,.87,.06]
  ];
  const v=this.playerPoseKey(keys,t),hand=this.hand('Right'),weapon=this.weapons.find(w=>w.side==='Right');
  if(!hand||!weapon?.handBindInverse)return;
  const base=hand.getWorldQuaternion(new T.Quaternion()).normalize(),toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z));
  this.poseHand('Right',toWorld(v[1],v[2],v[3]),toWorld(1.7,2.8,.05),weight);this.root.updateMatrixWorld(true);
  const direction=new T.Vector3(v[4],v[5],v[6]).normalize();
  const blade=this.visual.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction));
  const mount=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-.8));
  const desired=blade.multiply(mount.invert()).normalize();
  const local=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(base.slerp(desired,weight));
  this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);hand.updateWorldMatrix(true,true);
 }

 sourceLongPose(state){
  if(this.name!=='gilded_warlord'||state.bossAction!=='long'||state.bossElapsed<2.2||state.stagger||state.critical)return;
  // Main video 45.1-50.5: descending cut, two alternating sweeps, paired
  // overhead takeoff, landing and low recovery. Times are action-local.
  const keys=[
   [2.2,[1.12,3,-.4,.05,1,.06],[-1.18,2.35,-.5,-.38,1,-.04],.15,-.1,.2],
   [2.60,[.7,4.35,.4,.1,.3,1],[-1.1,2.35,-.5,-.4,1,-.1],.35,-.2,.2],
   [2.95,[.3,1.6,-1.2,0,-.7,-.7],[-1,3,-.3,.3,.9,.15],-.6,.65,.5],
   [3.2,[-1,1.9,-.5,-1,-.2,.05],[-1,3.45,-.3,.3,.9,.15],-.45,.4,.4],
   [3.72,[.9,2.1,.1,.9,.2,.1],[.45,3.7,-.3,-.8,.6,.1],-.4,.15,.26],
   [3.95,[.85,3.25,0,.3,.9,.1],[-1.2,2,-.75,-1,-.2,-.1],.6,.4,.4],
   [4.35,[.6,3.5,-.2,.6,.8,.1],[-1.1,2.2,.2,-1,0,.4],.5,.2,.3],
   [4.75,[-.4,3.6,.2,1,.3,.1],[-.9,2.3,.4,-.9,.2,.4],.55,.15,.3],
   [5,[1.35,1.85,-.75,1,-.2,-.15],[-.5,3.1,-.35,-.6,.8,0],-.8,.35,.4],
   [5.35,[1.1,2.2,.2,1,.1,.3],[-1.1,2.2,.2,-1,.1,.3],-.2,.25,.42],
   [5.55,[.7,3.6,.2,.2,1,.15],[-.7,3.6,.2,-.2,1,.15],0,-.1,.6],
   [5.9,[.4,4.4,.4,.2,.1,1],[-.4,4.4,.4,-.2,.1,1],0,-.25,1],
   [6.05,[.5,4,-.2,.1,1,.3],[-.5,4,-.2,-.1,1,.3],0,.25,.8],
   [6.35,[.48,1.7,-1.4,.5,-.5,-.7],[-.48,1.7,-1.4,-.5,-.5,-.7],0,.9,.9],
   [6.55,[.65,1.6,-1.25,.6,-.4,-.7],[-.65,1.6,-1.25,-.6,-.4,-.7],0,.85,.85],
   [6.9,[.9,1.8,-.6,.9,-.2,-.3],[-.9,1.8,-.6,-.9,-.2,-.3],0,.5,.65],
   [7.6,[.98,2.2,-.25,.9,.35,-.3],[-.98,2.15,-.25,-.9,.35,-.3],0,.12,.24]
  ];
  const turns=[[2.2,0],[2.95,0],[3.35,.8],[3.72,1.25],[3.95,1.8],[4.25,2.55],[4.5,2.6],[4.75,1.2],[5,.1],[5.35,1.2],[5.7,2.1],[6.05,1.8],[6.55,1.7],[7,1.4],[7.6,0]];
  let index=0;while(index<turns.length-2&&state.bossElapsed>turns[index+1][0])index++;
  const from=turns[index],to=turns[index+1];this.visual.rotation.y=T.MathUtils.lerp(from[1],to[1],T.MathUtils.smoothstep(state.bossElapsed,from[0],to[0]));
  this.sourceBladeTrack(state,keys,.30,T.MathUtils.smoothstep(state.bossElapsed,2.2,2.5),true);
 }

 pairedReadyPose(state){
   const recovery=state.postCritical;
   const riposte=state.bossAction==='critical'&&state.bossElapsed>=3.0||recovery!=null;
   const cross=false;
   if(this.name!=='gilded_warlord'||(!riposte&&!cross)){this.readyHandTurns=null;return;}
   const crossedGuard=cross&&state.phase===2;
   const mode=riposte?'riposte':crossedGuard?'crossed-guard':'cross';if(this.readyHandMode!==mode)this.readyHandTurns=null;this.readyHandMode=mode;
   const time=state.bossElapsed||0,weight=riposte?(recovery==null?T.MathUtils.smoothstep(time,3.0,3.5):1-T.MathUtils.smoothstep(recovery,.15,.7)):T.MathUtils.smoothstep(time,0,.16)*(1-T.MathUtils.smoothstep(time,.5,.95));
   if(weight<=0)return;
   // Source 39-40.5 s: paired blades held toward the right during rising.
   // Source 54.5-55.5 s: low paired blades lead into the first crossing cut.
   const scale=this.height/4.4,toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
   if(cross)for(const [pattern,angle] of [[/Spine$/,crossedGuard?-.05:-.55],[/UpLeg$/,crossedGuard?.12:.5],[/(?<!Up)Leg$/,crossedGuard?-.2:-.8]])for(const [name,bone] of this.poseJoints){
    if(!pattern.test(name))continue;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
    const axis=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert());
    bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle*weight));
   }
   this.root.updateMatrixWorld(true);const orientation=this.visual.getWorldQuaternion(new T.Quaternion()).normalize();
   for(const side of ['Right','Left']){
    const right=side==='Right',sign=right?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);
    if(!hand||!weapon?.handBindInverse)continue;
    const base=hand.quaternion.clone();
    this.poseHand(side,toWorld(riposte?(right?.85:.35):crossedGuard?(right?.42:-.42):(right?-.6:-.98),riposte?(right?2.30:2.55):crossedGuard?(right?2.52:2.47):(right?1.95:1.85),riposte?-.85:-1.2),toWorld(sign*1.8,2.75,-.25),weight);
    const clearShoulder=1-T.MathUtils.smootherstep(recovery==null?time:4.7+recovery,3.42,4.66);
    const direction=(riposte?new T.Vector3(.86-.51*clearShoulder,.05+.77*clearShoulder,-.62-.37*clearShoulder):crossedGuard?new T.Vector3(right?-.85:.82,right?.72:.68,-.36):new T.Vector3(-.25,-.55,-.80)).normalize().applyQuaternion(orientation);
    const attachment=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
    this.root.updateMatrixWorld(true);const inverse=hand.parent.matrixWorld.clone().invert(),up=direction.transformDirection(inverse),forward=new T.Vector3(0,0,1).applyQuaternion(orientation).transformDirection(inverse);
    forward.addScaledVector(up,-forward.dot(up)).normalize();const across=new T.Vector3().crossVectors(up,forward).normalize();forward.crossVectors(across,up).normalize();
    const desired=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,up,forward)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),riposte?Math.PI:0)).multiply(attachment.invert()).normalize();
    const turn=base.clone().invert().multiply(desired).normalize();this.readyHandTurns??={};const previous=this.readyHandTurns[side];
    if(previous?turn.dot(previous)<0:turn.w<0)turn.set(-turn.x,-turn.y,-turn.z,-turn.w);this.readyHandTurns[side]=turn.clone();
    const axis=new T.Vector3(turn.x,turn.y,turn.z),length=axis.length(),local=base.clone();if(length>1e-8)local.multiply(new T.Quaternion().setFromAxisAngle(axis.divideScalar(length),2*Math.atan2(length,turn.w)*weight));
    this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local.normalize());
   }
 }
 ringLandingPose(state){
   if(this.name!=='gilded_warlord'||state.phase!==2||state.stagger>0||state.critical){this.ringHandTurns=null;return;}
   const time=state.bossAction==='ring'?state.bossElapsed:state.ringRecovery==null?null:MOVES.ring.duration+state.ringRecovery;
   if(time==null||time<2.55||time>4.95){this.ringHandTurns=null;return;}
   // Same-fight 68.5-70.5 s: lateral paired blades after retreat, then a
   // planted crouch and rise. Timing is relative to this move's landing.
   const weight=T.MathUtils.smoothstep(time,2.55,2.85)*(1-T.MathUtils.smoothstep(time,4.35,4.95));
   const open=T.MathUtils.smoothstep(time,3.5,4.15);
   const crouch=T.MathUtils.smoothstep(time,3.65,4.25)*(1-T.MathUtils.smoothstep(time,4.35,4.95));
   const scale=this.height/4.4,yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),state.yaw||0);
   const spine=matchRig(this.bones,/Spine$/);
   if(spine){
     this.combatAdjustments.push({bone:spine,rotation:spine.quaternion.clone()});
     const axis=new T.Vector3(1,0,0).applyQuaternion(yaw).applyQuaternion(spine.parent.getWorldQuaternion(new T.Quaternion()).invert());
     spine.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,-.50*crouch));
   }
   this.root.updateMatrixWorld(true);
   for(const side of ['Left','Right']){
     const upper=findRigBone(this.bones,side+'UpLeg'),foot=findRigBone(this.bones,side+'Foot');
     if(!upper||!foot)continue;
     const footRotation=foot.getWorldQuaternion(new T.Quaternion()).normalize();
     const target=foot.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.82*crouch,0).multiplyScalar(scale));
     const pole=upper.getWorldPosition(new T.Vector3()).add(new T.Vector3(side==='Left'?-.1:.1,-.25,-1).multiplyScalar(scale).applyQuaternion(yaw));
     this.poseLimb(side,['UpLeg','Leg','Foot'],target,pole,weight);
     this.combatAdjustments.push({bone:foot,rotation:foot.quaternion.clone()});
     foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert().multiply(footRotation));
   }
   const toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
   const orientation=this.visual.getWorldQuaternion(new T.Quaternion()).normalize();
   for(const side of ['Right','Left']){
     const right=side==='Right',sign=right?1:-1,hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side);
     if(!hand||!weapon?.handBindInverse)continue;
     const base=hand.quaternion.clone();
     this.poseHand(side,toWorld(T.MathUtils.lerp(right?1.15:.35,sign*1.2,open),T.MathUtils.lerp(right?2.9:2.5,2.5,open),-.7),toWorld(sign*1.9,2.8,-.35),weight);
     const direction=new T.Vector3(T.MathUtils.lerp(1,sign*.95,open),T.MathUtils.lerp(.03,-.50,open),-.06).normalize();
     const attachment=weapon.handBindInverse.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.2)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.8));
     const bladeRoll=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),right?Math.PI:0);
     this.root.updateMatrixWorld(true);
     const inverse=hand.parent.matrixWorld.clone().invert();
     const bladeUp=direction.applyQuaternion(orientation).transformDirection(inverse);
     const bladeForward=new T.Vector3(0,0,1).applyQuaternion(orientation).transformDirection(inverse);
     bladeForward.addScaledVector(bladeUp,-bladeForward.dot(bladeUp)).normalize();
     const bladeRight=new T.Vector3().crossVectors(bladeUp,bladeForward).normalize();bladeForward.crossVectors(bladeRight,bladeUp).normalize();
     const desired=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(bladeRight,bladeUp,bladeForward)).multiply(bladeRoll).multiply(attachment.clone().invert()).normalize();
     // Keep the wrist turn on one continuous quaternion branch while fading
     // to idle. Shortest-path slerp flips sides when the turn crosses 180ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°.
     const turn=base.clone().invert().multiply(desired).normalize();
     this.ringHandTurns??={};const previous=this.ringHandTurns[side];
     if(previous?turn.dot(previous)<0:turn.w<0)turn.set(-turn.x,-turn.y,-turn.z,-turn.w);
     this.ringHandTurns[side]=turn.clone();
     const axis=new T.Vector3(turn.x,turn.y,turn.z),length=axis.length();
     const local=base.clone();if(length>1e-8)local.multiply(new T.Quaternion().setFromAxisAngle(axis.divideScalar(length),2*Math.atan2(length,turn.w)*weight));
     local.normalize();
     this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.copy(local);
   }
 }
 normalJump(state){
   if(this.name!=='ivory_duelist'||!state.jumpFlight||state.motion!=='jump')return;
   const {elapsed:t,duration,windup}=state.jumpFlight;
   if(!windup)return; // A hit-induced launch keeps its separate animation.
   // Same-fight source 127.5-128.4 s: planted preparation, then a tucked
   // left leg and longer right leg, followed by a short landing compression.
   // Foot displacements are rig-scale estimates of the visible silhouette.
   const crouch=.28*T.MathUtils.smoothstep(t,.03,windup*.72)*(1-T.MathUtils.smoothstep(t,windup*.78,windup+.04))
     +.16*T.MathUtils.smoothstep(t,duration-.15,duration-.05)*(1-T.MathUtils.smoothstep(t,duration-.05,duration));
   const tuck=T.MathUtils.smoothstep(t,windup,windup+.12)*(1-T.MathUtils.smoothstep(t,duration-.15,duration-.015));
   this.playerTurn('Spine1',new T.Vector3(1,0,0),-.36*crouch+.13*tuck,state);
   this.playerTurn('LeftShoulder',new T.Vector3(0,0,1),.14*tuck,state);
   const yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),state.yaw||0),scale=this.height/1.95;
   for(const side of ['Left','Right']){
     const upper=findRigBone(this.bones,side+'UpLeg');
     const foot=findRigBone(this.bones,side+'Foot');
     if(!upper||!foot)continue;
     const target=foot.getWorldPosition(new T.Vector3()).add(new T.Vector3(side==='Left'?-.13*tuck:0,crouch+(side==='Left'?.58*tuck:.025*tuck),side==='Left'?.27*tuck:0).multiplyScalar(scale).applyQuaternion(yaw));
     const pole=upper.getWorldPosition(new T.Vector3()).add(new T.Vector3(side==='Left'?-.08:.08,-.25,-.7).multiplyScalar(scale).applyQuaternion(yaw));
     this.poseLimb(side,['UpLeg','Leg','Foot'],target,pole,1);
   }
 }
 flameCastPose(state){
   if(this.name!=='ivory_duelist'||!Number.isFinite(state.castTime))return;
   const t=state.castTime,weight=T.MathUtils.smoothstep(t,.15,.5)*(1-T.MathUtils.smoothstep(t,2.55,2.85));
   if(weight<=0)return;
   // Same-fight source 68.25-70.25 s: fire at the right hip, hand drawn
   // up beside the face, a held release, then lowering before locomotion.
   // Hidden finger motion is not reconstructed from the occluded frames.
   const lift=T.MathUtils.smoothstep(t,1.32,2.06),release=T.MathUtils.smoothstep(t,2.18,2.69),scale=this.height/1.95;
   const gather=T.MathUtils.smoothstep(t,.18,.75)*(1-release);
   this.playerTurn('Spine',new T.Vector3(0,1,0),.29*gather-.47*lift*(1-release),state);
   this.playerTurn('Spine1',new T.Vector3(1,0,0),-.14*gather+.16*lift,state);
   this.root.updateMatrixWorld(true);
   const toWorld=(x,y,z)=>this.visual.localToWorld(new T.Vector3(x,y,z).multiplyScalar(scale));
   this.poseHand('Right',toWorld(.56-.28*lift+.32*release,1.0+.83*lift-.49*release,-.19-.31*lift+.14*release),toWorld(.86,1.27+.16*lift,-.22),weight);
   this.poseHand('Left',toWorld(-.37-.12*lift,1.04+.10*lift,.13+.11*lift),toWorld(-.68,1.2,.22),weight*.85);
 }
 playerGesture(dt,state){
   if(this.name!=='ivory_duelist')return;
   if(state.guard){
     this.playerTurn('Spine',new T.Vector3(0,1,0),.21,state);
     this.playerTurn('Spine1',new T.Vector3(1,0,0),-.13,state);
   }
   if(state.roll>0){
     const tuck=Math.sin(Math.PI*state.roll);
     this.playerTurn('RightShoulder',new T.Vector3(0,0,1),.23*tuck,state);
     this.playerTurn('LeftShoulder',new T.Vector3(0,0,1),-.19*tuck,state);
   }
   this.crouchWeight=T.MathUtils.lerp(this.crouchWeight||0,state.crouched?1:0,1-Math.exp(-dt*14));
   const crouch=this.crouchWeight;
   if(crouch>.001){
     for(const [pattern,angle] of [[/UpLeg$/,.62],[/(?<!Up)Leg$/,-1.15],[/Spine$/,.16]])for(const [name,bone] of this.poseJoints){
       if(!pattern.test(name))continue;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
       const axis=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
       bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle*crouch));
     }
   }
    if(!state.drink){if(this.flask)this.flask.visible=false;return;}
   const tilt=Math.sin(Math.PI*state.drink);
   this.playerTurn('Head',new T.Vector3(1,0,0),.21*tilt,state);
   this.playerTurn('Spine2',new T.Vector3(0,1,0),-.16*tilt,state);
   const head=matchRig(this.bones,/Head$/),hand=this.hand('Right');if(!head||!hand)return;
   const reach=T.MathUtils.smoothstep(state.drink,0,.28)*(1-T.MathUtils.smoothstep(state.drink,.75,1));
   const yaw=state.yaw||0,outward=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),yaw);
   const mouth=head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,-.09,-.13).applyAxisAngle(new T.Vector3(0,1,0),yaw));
   const target=mouth.clone().addScaledVector(outward,.07).add(new T.Vector3(0,-.19,-.08).applyAxisAngle(new T.Vector3(0,1,0),yaw));
   const pole=mouth.clone().addScaledVector(outward,.75).add(new T.Vector3(0,-.4,.16).applyAxisAngle(new T.Vector3(0,1,0),yaw));
   this.poseHand('Right',target,pole,reach);
   if(!this.flask){
     this.flask=new T.Group();this.scene.add(this.flask);
     const profile=[[0,-.11],[.055,-.10],[.08,-.065],[.083,.015],[.06,.07],[.027,.09],[.026,.16],[.034,.17],[0,.17]].map(([x,y])=>new T.Vector2(x,y));
     const bottle=new T.Mesh(new T.LatheGeometry(profile,16),new T.MeshStandardMaterial({color:0x8d3619,metalness:.28,roughness:.3,emissive:0x371100,emissiveIntensity:.25}));bottle.castShadow=true;this.flask.add(bottle);
     for(const [y,r] of [[-.075,.073],[.065,.062],[.15,.034]]){const band=new T.Mesh(new T.TorusGeometry(r,.009,5,16),new T.MeshStandardMaterial({color:0xbaa05a,metalness:.75,roughness:.34}));band.rotation.x=Math.PI/2;band.position.y=y;this.flask.add(band);}
   }
   this.flask.visible=this.root.visible;hand.getWorldPosition(this.flask.position);
   const up=new T.Vector3(0,1,0),towardMouth=mouth.clone().sub(this.flask.position).normalize();
   up.lerp(towardMouth,T.MathUtils.smoothstep(state.drink,.20,.40)).normalize();this.flask.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),up);
 }
 prepareDissolve(extraRoots=[]){
   this.extraVisuals=extraRoots;
   if(this.name==='ivory_duelist')this.flashResponse={flashSource:{value:new T.Vector3()},flashPower:{value:0}};
   this.dissolveUniform={value:0};const seen=new Set();
   for(const root of [this.root,this.cape,this.helmet?.shell,this.flask,...this.clasps.map(a=>a.clasp),...this.weapons.map(w=>w.pivot),...extraRoots].filter(Boolean))root.traverse(o=>{
     for(const material of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){
       if(seen.has(material))continue;seen.add(material);const old=material.onBeforeCompile,oldKey=material.customProgramCacheKey();
       const reflectFlash=this.flashResponse&&material.isMeshStandardMaterial;
       material.customProgramCacheKey=()=>oldKey+'|actor-dissolve-v1'+(reflectFlash?'|close-flash-response':'');
       material.onBeforeCompile=shader=>{old?.call(material,shader);shader.uniforms.actorDissolve=this.dissolveUniform;
         if(reflectFlash){
           Object.assign(shader.uniforms,this.flashResponse);
           shader.fragmentShader='uniform vec3 flashSource;uniform float flashPower;\n'+shader.fragmentShader;
           const evaluate='getPointLightInfo( pointLight, geometryPosition, directLight );';
           const response=T.ShaderChunk.lights_fragment_begin.replace(evaluate,evaluate+`
             if(flashPower>0.001 && distance(pointLight.position,(viewMatrix*vec4(flashSource,1.)).xyz)<.08){
               float edge=pow(1.-abs(dot(geometryNormal,geometryViewDir)),2.);
               float nearArmor=1.-smoothstep(5.,12.,length(geometryPosition));
               directLight.color*=mix(1.,mix(.12,.37,edge),nearArmor*flashPower);
             }`);
           shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',response);
         }
         shader.vertexShader='varying vec3 actorSurface;\n'+shader.vertexShader;
         shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','actorSurface=transformed;\n#include <project_vertex>');
         shader.fragmentShader='varying vec3 actorSurface;uniform float actorDissolve;\n'+shader.fragmentShader;
         shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat dust=fract(sin(dot(floor(actorSurface*190.),vec3(12.9898,78.233,37.719)))*43758.5453);if(actorDissolve>0.&&dust<actorDissolve)discard;');
       };material.needsUpdate=true;
     }
   });
 }
 finishPose(dt,state,t){
   if(this.dissolveUniform)this.dissolveUniform.value=state.dissolve||0;
   const rotate=(pattern,axis,angle)=>{const bone=matchRig(this.bones,pattern);if(!bone)return;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});axis.applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle));};
   const upright=['idle','walk','run'].includes(state.motion)&&!state.critical&&!state.stagger;
   if(upright){
     const breath=Math.sin(t*1.75)*.012;rotate(/Spine2$/,new T.Vector3(1,0,0),breath);
     const moving=['walk','run'].includes(state.motion),dyaw=this.poseYaw===undefined?0:Math.atan2(Math.sin(state.yaw-this.poseYaw),Math.cos(state.yaw-this.poseYaw));
     this.bodyTurn=T.MathUtils.lerp(this.bodyTurn||0,T.MathUtils.clamp(dyaw/Math.max(.008,dt),-3,3),1-Math.exp(-dt*8));
     if(moving){rotate(/Spine$/,new T.Vector3(1,0,0),state.motion==='run'?.13:.045);rotate(/Spine$/,new T.Vector3(0,0,1),-this.bodyTurn*.045);}
   }
   this.poseYaw=state.yaw||0;
   if(state.recoil){const hit=state.recoil,dir=state.hitYaw||0;rotate(/Spine$/,new T.Vector3(1,0,0),-.38*Math.cos(dir)*hit);rotate(/Spine2$/,new T.Vector3(0,0,1),.32*Math.sin(dir)*hit);rotate(/Head$/,new T.Vector3(1,0,0),.15*hit);for(const side of ['Left','Right'])rotate(new RegExp(side+'Arm$'),new T.Vector3(1,0,0),-.22*hit);}
   if(this.name==='gilded_warlord'){
     const reacting=state.bossAction==='recover'&&state.stagger>0;
     if(reacting&&!this.parryReacting){
       this.parryContactPose=this.lastPose;
       const previous=this.poseHistory?.at(-1)?.action,origin=t-(state.bossElapsed||0);
       const windup=(this.poseHistory||[]).filter(frame=>frame.action===previous&&frame.time<=origin-.12);
       this.parryPose=windup.at(-1)?.pose||this.lastPose;
     }
     this.parryReacting=reacting;
     if(!reacting){this.parryPose=null;this.parryContactPose=null;}
     if(this.parryPose&&!state.deflection){
       // Deflection returns the blade toward its recent windup, then settles.
       // The saved poses are independent of the live animated skeleton.
       const elapsed=state.bossElapsed||0,rebound=T.MathUtils.smoothstep(elapsed,0,.13);
       const settle=T.MathUtils.smoothstep(elapsed,.16,state.critical?1.25:.9),from=new T.Quaternion();
       for(const [name,bone] of this.poseJoints){
         const wind=this.parryPose[name];if(!wind)continue;
         const target=bone.quaternion.clone();this.combatAdjustments.push({bone,rotation:target});
         from.slerpQuaternions(this.parryContactPose?.[name]||wind,wind,rebound);
         bone.quaternion.slerpQuaternions(from,target,settle);
       }
     }
   }
   const key=this.name==='gilded_warlord'?(state.ringRecovery!=null?'ring':state.bossAction)+'|'+!!state.stagger+'|'+!!state.critical:state.motion+'|'+state.strike+'|'+!!state.drink+'|'+!!state.guard;
   if(key!==this.poseKey){this.poseFrom=this.lastPose;this.poseBlend=0;this.poseKey=key;}
   this.poseBlend=(this.poseBlend||0)+dt;const f=T.MathUtils.smoothstep(this.poseBlend,0,state.motion==='dive'?.07:.14);
   if(this.poseFrom&&f<1&&!this.authoredBossPose)for(const [name,bone] of this.poseJoints){const from=this.poseFrom[name];if(!from)continue;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});bone.quaternion.slerpQuaternions(from,bone.quaternion.clone(),f);}
   if(this.name==='gilded_warlord'){
     this.poseHistory??=[];
     let available=null;
     while(this.poseHistory.length&&this.poseHistory[0].time<t-.65){
       const expired=this.poseHistory.shift().pose;
       if(expired!==this.poseFrom&&expired!==this.parryPose&&expired!==this.parryContactPose)available=expired;
     }
     this.lastPose=copyBonePose(this,available);
     const frame={time:t,action:state.bossAction,pose:this.lastPose};
     if(this.poseHistory.at(-1)?.time===t)this.poseHistory[this.poseHistory.length-1]=frame;else this.poseHistory.push(frame);
   }else this.lastPose=copyBonePose(this,this.lastPose===this.poseFrom?null:this.lastPose);
 }
 groundFeet(state,motion){
   if(this.authoredBossPose&&motion!=='fall')return;
   if(motion==='fall'){
     this.root.updateMatrixWorld(true);const progress=state.fallProgress||0;
     if(this.fallFloorCorrection==null||progress<1){
       let low=Infinity;
       this.impactSurfaces??=new WeakMap();
       const vertex=new T.Vector3();
       this.model.traverse(mesh=>{
         if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
         if(HorizontalSkinSurface.supports(mesh)){
           let surface=this.impactSurfaces.get(mesh);
           if(!surface){surface=new HorizontalSkinSurface(mesh);this.impactSurfaces.set(mesh,surface);}
           low=Math.min(low,surface.minimumWorldY());
         }else{
           for(let i=0;i<mesh.geometry.attributes.position.count;i++){
             mesh.getVertexPosition(i,vertex).applyMatrix4(mesh.matrixWorld);
             low=Math.min(low,vertex.y);
           }
         }
       });
       const head=matchRig(this.bones,/Head$/);
       if(head&&this.helmet?.localBounds){const q=head.getWorldQuaternion(new T.Quaternion()).multiply(this.helmet.bindInverse),pos=head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,this.helmet.offset,0).applyQuaternion(q)),matrix=new T.Matrix4().compose(pos,q,new T.Vector3(1,1,1));const m=matrix.elements,v=this.helmet.localVertices;for(let i=0;i<v.length;i+=3)low=Math.min(low,m[1]*v[i]+m[5]*v[i+1]+m[9]*v[i+2]+m[13]);}
       this.fallFloorCorrection=low-state.pos.y-(state.groundOffset||0)-.03;
     }
     this.visual.position.y-=this.fallFloorCorrection*T.MathUtils.smoothstep(progress,.2,.8);this.root.updateMatrixWorld(true);return;
   }
   this.fallFloorCorrection=null;
   const softTakeoff=this.name==='gilded_warlord'&&state.bossAction==='promised';
   if(motion==='dive'||(this.name==='gilded_warlord'&&state.pos.y>.1&&!((softTakeoff||state.groundedRush&&state.bossAction==='leap')&&state.pos.y<.7)))return;
   this.root.updateMatrixWorld(true);let footY=Infinity;
   for(const [name,bone] of this.poseJoints)if(/Foot$/i.test(name))footY=Math.min(footY,bone.getWorldPosition(new T.Vector3()).y);
   if(Number.isFinite(footY)){const weight=softTakeoff||state.groundedRush&&state.bossAction==='leap'?1-T.MathUtils.smoothstep(state.pos.y,0,.7):1;this.visual.position.y-=(footY-state.pos.y-(state.jump||0)-(state.groundOffset||0)-(this.footClearance??.08))*weight;this.root.updateMatrixWorld(true);}
 }
 improveTextureSampling(maximum,attachments=[]){
  for(const object of [this.root,this.helmet?.shell,this.cape,...this.weapons.map(w=>w.pivot),...attachments])object?.traverse(mesh=>{
   for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material){
    for(const key of ['map','normalMap','roughnessMap','metalnessMap','bumpMap'])if(material[key]){
     material[key].anisotropy=maximum;material[key].needsUpdate=true;
    }
   }
  });
 }
 scalePresentation(state){
  if(this.name!=='gilded_warlord')return;
  // Scale the assembled figure about the terrain contact, including every
  // detached attachment. Pose/physics still use the established actor metric.
  const scale=this.presentationScale,origin=state.pos.clone();origin.y+=state.groundOffset||0;
  this.root.scale.setScalar(scale);this.root.position.y-=(state.groundOffset||0)*(scale-1);
  const transform=new T.Matrix4().makeTranslation(origin.x,origin.y,origin.z)
   .multiply(new T.Matrix4().makeScale(scale,scale,scale))
   .multiply(new T.Matrix4().makeTranslation(-origin.x,-origin.y,-origin.z));
  for(const object of [this.helmet?.shell,this.capeMount?this.cape:null,...this.weapons.map(w=>w.pivot),...this.clasps.map(c=>c.clasp)]){
   if(!object)continue;
   if(object.matrixAutoUpdate)object.updateMatrix();object.matrix.premultiply(transform);
   if(object.matrixAutoUpdate)object.matrix.decompose(object.position,object.quaternion,object.scale);
   object.matrixWorldNeedsUpdate=true;
  }
  this.root.updateMatrixWorld(true);
 }
 prepareWeaponEffects(){
   if(this.name==='gilded_warlord')for(const weapon of this.weapons){
     const blade=weapon.model.getObjectByName('consort-blade-steel');
     if(blade){
       const original=blade.material;
       blade.material=original.clone();
       blade.material.onBeforeCompile=original.onBeforeCompile;
       blade.material.customProgramCacheKey=original.customProgramCacheKey;
       weapon.steelFinish={surface:blade.material,base:original};
     }
     weapon.gravityCharge=createBladeGravity(weapon.length,weapon.side);
     weapon.gravityCharge.visible=false;
     weapon.holyEdge=holyBladeEdge(weapon);
     weapon.holyWake=createHolySwordWake(weapon);
     this.scene.add(weapon.holyWake);
     weapon.pivot.add(weapon.gravityCharge,weapon.holyEdge);
     weapon.guardLight=new T.PointLight(0xffdda0,0,5.2,2);
     this.scene.add(weapon.guardLight);
   }
   this.weaponTrails({phase:1,bossAction:'idle',bossElapsed:0,motion:'idle'},0);
 }
 weaponTrails(state,t){
   for(const w of this.weapons){
     const boss=this.name==='gilded_warlord',sign=w.side==='Right'?1:-1;
     const swordContact=(MOVES[state.bossAction]?.contacts||[]).some(c=>!c.area&&(!c.hand||c.hand===sign)&&state.bossElapsed>c.t-.14&&state.bossElapsed<c.t+.19);
     const rockRip=boss&&state.bossAction==='rocks';
     const rockCast=state.bossElapsed+(state.phase===2?ROCK_SEQUENCE.phaseTwoSweep:0);
     const charge=boss?weaponGravity(state):0;
     const gravity=charge>.1&&(rockRip&&(state.bossElapsed>1.35&&state.bossElapsed<2.85||rockCast>4.92&&rockCast<6.44)||state.bossAction==='leap'&&state.bossElapsed>(state.groundedRush?1.7:RUSH_SEQUENCE.windup)-.1&&state.bossElapsed<RUSH_SEQUENCE.contact+.05||state.bossAction==='pull'&&state.bossElapsed>2.1&&state.bossElapsed<2.7);
     if(boss){
      const dischargeBeat=.5+.5*Math.sin(10.4*t+sign*1.45+.7*Math.sin(t*17.1));
      const discharge=charge*(.53+.47*dischargeBeat);
      const opening=state.openingRush&&state.bossAction==='leap';
      w.gravityCharge.userData.update(t,discharge,w.pivot.visible,opening);
      if(w.steelFinish){
        const {surface,base}=w.steelFinish,k=opening?charge:0;
        surface.color.setRGB(base.color.r*(1-.52*k),base.color.g*(1-.65*k),base.color.b*(1-.40*k));
        surface.envMapIntensity=base.envMapIntensity*(1-.46*k);
        surface.emissiveIntensity=base.emissiveIntensity*(1-.64*k);
      }
      const u=bladeIgnition(state,sign);
      const charging=['grab','stompGrab','ring'].includes(state.bossAction);
      w.holyEdge.visible=w.pivot.visible&&u>.001;
      if(w.holyEdge.visible){
       const swingTime=state.bossElapsed;
       const pairedFlash=.74*T.MathUtils.smoothstep(swingTime,2.96,3.37)*(1-T.MathUtils.smoothstep(swingTime,3.92,4.22));
       const release=state.bossAction==='promised'?Math.max(pairedFlash,T.MathUtils.smoothstep(swingTime,7.53,7.87)):
         Number.isFinite(state.holyRecover)?1-T.MathUtils.smoothstep(state.holyRecover,.27,.58):0;
       w.holyEdge.userData.ignite(t,u,state.bossAction==='bloodflame',charging,release);
      }
      const pairedCut=state.bossAction==='promised'&&(
        state.bossElapsed>3.12&&state.bossElapsed<3.98||
        state.bossElapsed>4.90&&state.bossElapsed<5.66||
        state.bossElapsed>6.34&&state.bossElapsed<7.71);
      const drawWake=!charging&&state.phase===2&&(swordContact||pairedCut||['sideDash','dash','lightspeed'].includes(state.bossAction));
      w.holyWake.userData.update(t,drawWake&&w.pivot.visible?u:0,state.bossAction==='bloodflame',state.bossAction);
      const electricBounce=discharge*discharge*(.42+2.9*dischargeBeat**3);
      w.guardLight.intensity=w.pivot.visible?u*u*(charging?6.2:11)+electricBounce:0;
      if(w.guardLight.intensity>0){
        w.guardLight.position.set(0,w.length*(electricBounce>.01?.44:state.bossAction==='promised'&&state.bossElapsed<4.27?.52:.14),0);w.pivot.localToWorld(w.guardLight.position);
        w.guardLight.color.setHex(electricBounce>.01?0xaf86ff:state.bossAction==='bloodflame'?0xff682b:0xffdda0);
      }
     }
     const parrying=!boss&&state.parry&&w.side==='Left'&&state.parryTime>.12&&state.parryTime<.41;
     const striking=!boss&&w.side==='Right'&&state.motion==='slash'&&!state.critical&&(state.runningThrust?state.attack>.38&&state.attack<.53:state.attack>.26&&state.attack<.53);
     const swiftHoly=w.holyEdge?.visible&&['dash','sideDash','lightspeed'].includes(state.bossAction);
     const active=w.pivot.visible&&(boss?(swordContact||gravity||swiftHoly):parrying||striking);
     if(!w.trail){
       const geometry=new T.BufferGeometry();
       for(const name of ['position','color'])geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(16*18),3).setUsage(T.DynamicDrawUsage));
       geometry.setDrawRange(0,0);
       w.trail=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:boss?.22:.065,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));w.trail.frustumCulled=false;this.scene.add(w.trail);w.history=[];
     }
     const hot=w.holyEdge?.visible;
     const rockSweep=rockRip&&rockCast>=5.48&&rockCast<=6.44;
     const trailLife=boss?(rockSweep?.27:gravity?.18:hot?.17:.060):.065;
     w.trail.material.opacity=boss?(rockSweep?.27:gravity?.25:hot?(swordContact?.52:.19):.085):.105;
     w.history=w.history.filter(sample=>t-sample.t<trailLife);
     if(active){
       w.pivot.updateMatrixWorld(true);
       const end=w.bladeSections?.at(-1)?.center||w.holyEdge?.userData.tip;
       const tip=w.pivot.localToWorld(end?end.clone():new T.Vector3(boss?.64:0,w.length*.78,0));
       const base=w.pivot.localToWorld(new T.Vector3(0,w.length*.03,0));
       if(rockSweep)base.lerp(tip,.78);
       else if(boss&&!hot&&!gravity)base.lerp(tip,.83);
       if(w.history.length&&tip.distanceTo(w.history.at(-1).tip)>w.length*2)w.history=[];
       // The newest point moves on every frame, but high refresh rates retain the whole arc.
       if(w.history.length>1&&t-w.history.at(-2).t<.023)w.history.pop();
       w.history.push({base,tip,t});if(w.history.length>17)w.history.shift();
     }
     const positions=w.trail.geometry.attributes.position,colors=w.trail.geometry.attributes.color;
     const color=new T.Color(rockSweep?0xdcc3ff:gravity?0xc8a1ff:state.bossAction==='bloodflame'?0xff7848:boss?(state.phase===2?0xffe1a0:0xbdb8a7):0xa5c4cc);
     if(rockSweep)color.multiplyScalar(1.45);
     let vertex=0;
     for(let i=1;i<w.history.length;i++){
       const a=w.history[i-1],b=w.history[i];
       for(const [point,time,edge] of [[a.base,a.t,.12],[a.tip,a.t,1],[b.tip,b.t,1],[a.base,a.t,.12],[b.tip,b.t,1],[b.base,b.t,.12]]){
         positions.setXYZ(vertex,point.x,point.y,point.z);const fade=Math.max(0,1-(t-time)/trailLife)*edge;colors.setXYZ(vertex,color.r*fade,color.g*fade,color.b*fade);vertex++;
       }
     }
     positions.needsUpdate=true;colors.needsUpdate=true;w.trail.geometry.setDrawRange(0,vertex);w.trail.visible=this.root.visible&&vertex>0;
   }
 }

 playerCarryPose(dt,state){
   if(this.name!=='ivory_duelist')return;
   const jump=state.motion==='jump'&&state.jumpFlight?.windup>0;
   const thrust=state.motion==='slash'&&(state.strike==='light'||!!state.critical);
   const eligible=(['idle','walk','run'].includes(state.motion)||jump||thrust)&&
     !state.drink&&!state.guard&&!state.grab&&
     !state.recoil&&!Number.isFinite(state.castTime)&&(state.weapon||0)===0;
   if(!eligible){this.carryWeight=0;this.carryPace=0;this.carrySway=0;return;}
   this.carryWeight=this.carryWeight===undefined?1:T.MathUtils.lerp(this.carryWeight,1,1-Math.exp(-dt*24));
   const weight=this.carryWeight,scale=this.height/1.95;
   const hips=Object.values(this.bones).find(b=>/Hips$/.test(b.name));
   this.root.updateMatrixWorld(true);
   const hipY=hips?this.root.worldToLocal(hips.getWorldPosition(new T.Vector3())).y:1;
   const phase=this.current?this.current.time/this.current.getClip().duration*Math.PI*2:0;
   const moving=['walk','run'].includes(state.motion),running=state.motion==='run';
   const pace=running?1:moving?.36:0;
   this.carryPace=T.MathUtils.damp(this.carryPace||0,pace,moving?9:5,dt);
   this.carrySway=T.MathUtils.damp(this.carrySway||0,moving?Math.sin(phase)*(running?.12:.055):0,moving?22:6,dt);
   const sway=this.carrySway;
   if(!thrust&&!jump&&this.carryPace>.006){
     this.playerTurn('Spine2',new T.Vector3(0,1,0),sway,state);
     this.playerTurn('Spine1',new T.Vector3(1,0,0),-.155*this.carryPace,state);
     this.playerTurn('Head',new T.Vector3(0,1,0),-.5*sway,state);
   }
   const flight=state.jumpFlight;
   const airborne=jump?Math.sin(Math.PI*T.MathUtils.clamp((flight.elapsed-flight.windup)/(flight.duration-flight.windup),0,1)):0;
   const toWorld=(x,y,z)=>this.root.localToWorld(new T.Vector3(x*scale,y,z*scale));
   // Primary 6.4-7.8 / 17.0-18.4: waist-level, forward Sword Lance.
   // Primary 127.7-128.4: the grip stays beside the hip in the jump;
   // the weapon does not follow the generated clip's overhead arm raise.
   for(const side of ['Right','Left']){
     const right=side==='Right',sign=right?1:-1;
     const y=hipY+(right?.025:-.015)*scale+airborne*.08*scale;
     const z=(right?.03:-.015)+(right?sway:-sway*1.5);
     this.poseHand(side,toWorld(sign*(.40+airborne*.035),y,z),
       toWorld(sign*.66,hipY+.22*scale,.18),weight);
     const hand=this.hand(side),weapon=this.weapons.find(w=>w.side===side&&w.slot===0);
     if(!hand||!weapon?.handBindInverse)continue;
     const direction=(right?new T.Vector3(.07,-.13-airborne*.48,-1):new T.Vector3(-.12,-.48,.86)).normalize();
     direction.applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0);
     const blade=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction);
     const mount=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.5)
       .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.3));
     const target=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert()
       .multiply(blade).multiply(mount.invert()).multiply(weapon.handBindInverse.clone().invert()).normalize();
     this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});
     hand.quaternion.slerp(target,weight);hand.updateWorldMatrix(true,true);
   }
 }
 primaryCriticalPose(state){
   if(this.name!=='ivory_duelist'||!state.critical)return;
   // Primary 118.50-121.75: low draw-back, single forward thrust, hold,
   // then pull free while turning. No overhead windup or off-hand stab.
   const t=T.MathUtils.clamp(state.critical,0,1)*RIPOSTE_SEQUENCE.duration;
   const keys=[[0,.40,1.03,.03,0,0],[.27,.50,.92,.36,.46,.16],
     [RIPOSTE_SEQUENCE.entry,.33,1.25,-.79,-.44,.37],[.84,.31,1.20,-.72,-.36,.30],
     [1.54,.32,1.23,-.74,-.31,.26],[2.22,.35,1.16,-.66,-.22,.36],
     [2.39,.36,1.13,-.58,-.17,.42],[RIPOSTE_SEQUENCE.release,.46,.97,-.08,.42,.53],
     [2.80,.52,.87,.41,.71,.40],[3,.40,1.03,.03,0,0]];
   let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;const a=keys[i],b=keys[i+1],u=T.MathUtils.smoothstep(t,a[0],b[0]),v=a.map((n,k)=>T.MathUtils.lerp(n,b[k],u));
   const weight=T.MathUtils.smoothstep(t,0,.10)*(1-T.MathUtils.smoothstep(t,2.85,3));
   for(const [suffix,axis,angle] of [['Spine',new T.Vector3(0,1,0),v[4]],['Spine1',new T.Vector3(1,0,0),-v[5]]]){
    const bone=findRigBone(this.bones,suffix);if(!bone)continue;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
    axis.applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert());bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle*weight));bone.updateWorldMatrix(true,true);
   }
   const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
   const stance=T.MathUtils.smoothstep(t,.05,.28)*(1-T.MathUtils.smoothstep(t,2.83,3));
   // Primary 118.60-119.20: step in and settle. At 120.85-121.35 the
   // right leg yields and the body turns back as the lodged blade pulls free.
   const lower=this.playerPoseKey([[0,0,-.08,.06,0],[.25,.12,.02,.19,.12],
     [.60,.15,-.40,.23,0],[1.10,.045,-.34,.21,0],[2.24,.045,-.34,.21,0],[2.38,.08,-.33,.21,0],
     [2.60,.09,-.21,.10,0],[2.79,.12,.08,-.22,0],[3,0,-.08,.06,0]],t);
   const leanIn=T.MathUtils.smootherstep(t,.26,.60)*(1-T.MathUtils.smootherstep(t,2.39,2.69));
   const recoil=T.MathUtils.smootherstep(t,2.39,2.79)*(1-T.MathUtils.smootherstep(t,2.79,3));
   this.visual.position.y-=lower[1]+.09*recoil;
   this.visual.position.z+=-.27*leanIn+.37*recoil;
   this.root.updateMatrixWorld(true);
   this.playerTurn('Hips',new T.Vector3(0,1,0),v[4]*.35,state);
   this.playerStep(state,stance,lower[2],lower[3],lower[4]);
   this.poseHand('Right',world(v[1],v[2],v[3]),world(.73,1.19,.20),weight);
   this.poseHand('Left',world(-.39,.99+.13*leanIn,.10-.38*leanIn+.19*recoil),world(-.62,1.17,.23),weight);
   const release=T.MathUtils.smoothstep(t,2.38,2.79)*(1-T.MathUtils.smoothstep(t,2.79,3));
   const axis=new T.Vector3(-.11+.48*release,.16-.47*release,-1).normalize();
   const wrist=this.hand('Right');
   if(wrist&&state.riposteContact){
     const target=state.riposteContact.clone().sub(wrist.getWorldPosition(new T.Vector3()));
     if(target.lengthSq()>.01){
       target.normalize().applyAxisAngle(new T.Vector3(0,1,0),-state.yaw);
       const lodged=T.MathUtils.smootherstep(t,.19,.54)*(1-T.MathUtils.smootherstep(t,2.42,2.79));
       axis.lerp(target,lodged).normalize();
     }
   }
   this.playerBlade('Right',axis,weight,state);

 }

 playerPoseKey(keys,t){
   let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
   const a=keys[i],b=keys[i+1],u=T.MathUtils.smoothstep(t,a[0],b[0]);
   return a.map((n,k)=>T.MathUtils.lerp(n,b[k],u));
 }
 playerTurn(suffix,axis,angle,state){
   const bone=findRigBone(this.bones,suffix);if(!bone)return;
   this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
   const local=axis.clone().applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0)
     .applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert());
   bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(local,angle));bone.updateWorldMatrix(true,true);
 }
 playerBlade(side,direction,weight,state){
   const weapon=this.weapons.find(w=>w.side===side&&w.slot===0),hand=this.hand(side);
   if(!hand||!weapon?.handBindInverse)return;
   direction.normalize().applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0);
   const blade=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction),sign=side==='Right'?1:-1;
   const mount=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-2.5)
     .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-sign*.3));
   const desired=hand.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert()
     .multiply(blade).multiply(mount.invert()).multiply(weapon.handBindInverse.clone().invert()).normalize();
   this.combatAdjustments.push({bone:hand,rotation:hand.quaternion.clone()});hand.quaternion.slerp(desired,weight);
   this.root.updateMatrixWorld(true);
 }
 playerStep(state,weight,rightZ,leftZ,lift=0){
   // The rear boot stays on the ground while the leading foot advances.
   // Anchors use world space, so the collision-root lunge cannot drag both feet.
   const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
   const heavy=state.strike==='heavy';
   const thrust=state.motion==='slash'&&(state.strike==='light'||heavy||state.critical),duration=state.critical?3:heavy?1.2:state.runningThrust?RUNNING_THRUST.duration:.72;
   const age=(state.critical||state.progress||state.attack||0)*duration,contact=state.critical?.60:heavy?.55:state.runningThrust?.48:.26;
   const key=(state.critical?'critical':'thrust')+'|'+state.actionId;
   if(!thrust||key!==this.playerPlantKey||age<(this.playerPlantAge||0))this.playerFootAnchors={};
   this.playerPlantKey=key;this.playerPlantAge=age;
   for(const side of ['Right','Left']){
     const foot=findRigBone(this.bones,side+'Foot');if(!foot)continue;
     const right=side==='Right',sign=right?1:-1,q=foot.getWorldQuaternion(new T.Quaternion());
     const target=world(sign*.18,(this.footClearance||.08)+(right?lift:0),right?rightZ:leftZ);
     if(thrust){
      const hold=right?age>=contact-.025&&age<(state.critical?2.58:duration-.13):age<contact+.10;
      if(hold){const anchors=this.playerFootAnchors??={};const anchor=anchors[side]??=(right?target.clone():foot.getWorldPosition(new T.Vector3()));target.copy(anchor);}else if(this.playerFootAnchors)this.playerFootAnchors[side]=null;
     }
     this.poseLimb(side,['UpLeg','Leg','Foot'],
       target,
       world(sign*.25,.48,-.72),weight);
     this.root.updateMatrixWorld(true);this.combatAdjustments.push({bone:foot,rotation:foot.quaternion.clone()});
     foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));
   }
 }
 primaryThrustPose(state){
   if(this.name!=='ivory_duelist'||state.motion!=='slash'||state.critical)return;
   const running=!!state.runningThrust,second=state.lightChain===2,continued=!!state.lightContinued;
   const heavy=state.strike==='heavy',duration=heavy?1.2:running?RUNNING_THRUST.duration:.72,t=T.MathUtils.clamp(state.progress??state.attack??0,0,1)*duration;
   // Main 23.3-24.5 and42.4-43.1: hip draw, forward planted lunge, low
   // withdrawal. The body is authored from a neutral rig, not a retimed slash.
   // t, grip xyz, chest yaw/lean, hip yaw/drop/advance, lead/trail foot z,lift.
   const ready=[.42,1.03,.03,0,.04,0,.025,0,-.10,.10,0];
   const low=[.43,1.02,.12,.16,.12,.08,.055,.015,-.25,.22,0];
   // The selected R1 keeps the chest above the planted front knee. The
   // shoulder travels before the elbow opens; recoil returns to the hip.
   const keys=heavy?[
    [0,...ready],[.23,.51,1.08,.30,.39,.17,.21,.09,.01,.04,.31,.08],
    [.38,.47,1.11,.37,.49,.20,.27,.14,0,-.06,.41,.04],
    [.55,.09,1.12,-.82,-.49,.35,-.27,.17,.19,-.67,.46,0],
    [.65,.10,1.13,-.77,-.44,.31,-.25,.16,.18,-.65,.44,0],
    [.87,.41,1.03,-.09,-.08,.17,-.04,.08,.08,-.41,.34,0],[1.08,...low],[1.2,...ready]
   ]:running?[
    [0,...ready],[.18,.46,1.07,.23,.28,.10,.16,.05,0,.02,.24,.11],
    [.35,.43,1.09,.20,.32,.17,.18,.09,.04,-.23,.36,.04],
    [.415,.30,1.14,-.25,.08,.23,.02,.12,.10,-.49,.43,0],
    [.48,.13,1.18,-.76,-.38,.28,-.22,.13,.16,-.60,.42,0],
    [.55,.14,1.17,-.75,-.37,.27,-.20,.13,.16,-.60,.42,0],
    [.72,.29,1.04,-.21,-.10,.20,-.06,.10,.07,-.43,.33,0],
    [.88,...low],[1.05,...(state.chainQueued?low:ready)]
   ]:[
    [0,...(continued?low:ready)],
    [.10,.48,1.04,.25,.31,.08,.17,.045,0,-.03,.19,.055],
    [.17,.44,1.07,.20,.28,.15,.15,.065,.02,-.18,.27,.02],
    [.215,.31,1.12,-.23,.04,.19,.01,.085,.055,-.31,.30,0],
    [.26,.14,1.16,-.72,-.36,.23,-.20,.095,.09,-.42,.31,0],
    [.315,.15,1.15,-.70,-.35,.23,-.19,.095,.09,-.42,.31,0],
    [.44,.30,1.04,-.16,-.08,.17,-.04,.075,.04,-.35,.27,0],
    [.58,...low],[.72,...(state.chainQueued?low:ready)]
   ];
   const v=this.playerPoseKey(keys,t);
   // First poke after a roll in the recorded rush: rise from a low grip,
   // step off the rear foot and finish the thrust before standing upright.
   const rollRise=state.rollingThrust?1-T.MathUtils.smoothstep(t,.13,.48):0;
   if(rollRise>0){
     v[2]-=.25*rollRise;v[5]+=.24*rollRise;v[7]+=.23*rollRise;
     v[8]+=.09*rollRise;v[9]-=.17*rollRise;v[10]+=.11*rollRise;
   }
   if(second&&!running){const beat=Math.sin(Math.PI*t/duration);v[1]+=.09*beat;v[2]-=.12*beat;v[4]-=.21*beat;v[6]-=.10*beat;v[9]-=.12*beat;}
   if(state.counterThrust){
     const catchWeight=1-T.MathUtils.smoothstep(t,.11,.27);
     const returnCut=T.MathUtils.smoothstep(t,.10,.27)*(1-T.MathUtils.smoothstep(t,.37,.65));
     v[1]+=.17*catchWeight-.14*returnCut;v[2]-=.08*returnCut;
     v[4]+=.34*catchWeight-.39*returnCut;v[6]+=.15*catchWeight-.19*returnCut;
     v[5]+=.22*returnCut;v[7]+=.075*returnCut;v[8]+=.10*returnCut;
     v[9]-=.21*returnCut;
   }
   v[7]+=(running?.075:.055)*T.MathUtils.clamp((-v[3]+.10),0,1);
   const weight=(continued?1:T.MathUtils.smoothstep(t,0,.045))*(state.chainQueued?1:1-T.MathUtils.smoothstep(t,duration-.11,duration));
   const extensionBias=T.MathUtils.clamp(-v[3],0,1);
   this.visual.position.x+=.19*extensionBias-.07*T.MathUtils.clamp(v[3],0,1);
   this.visual.position.y-=v[7];this.visual.position.z-=v[8]+.10*extensionBias;this.root.updateMatrixWorld(true);
   this.playerTurn('Hips',new T.Vector3(0,1,0),v[6],state);
   this.playerTurn('Spine',new T.Vector3(0,1,0),(v[4]-v[6])*.55,state);
   this.playerTurn('Spine2',new T.Vector3(0,1,0),(v[4]-v[6])*.45,state);
   this.playerTurn('Spine1',new T.Vector3(1,0,0),-v[5],state);
   this.playerTurn('Spine2',new T.Vector3(0,0,1),-.23*extensionBias,state);
   this.playerTurn('Head',new T.Vector3(1,0,0),v[5]*.42,state);
   this.playerTurn('Head',new T.Vector3(0,1,0),-v[4]*.55,state);
   // Shoulder girdle protracts into the thrust; the right arm is not an
   // isolated straight lever. Off-hand follows the torso's counter-rotation.
   const drive=T.MathUtils.clamp((-v[3]+.1),0,1);
   this.playerTurn('RightShoulder',new T.Vector3(0,1,0),-.13*drive,state);
   this.playerTurn('LeftShoulder',new T.Vector3(0,1,0),.055*drive,state);
   this.playerStep(state,weight,v[9],v[10],v[11]);
   const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
   const extension=T.MathUtils.clamp((-v[3]+.10)/1,0,1);
   const counterGuard=state.counterThrust?1-T.MathUtils.smoothstep(t,.17,.55):0;
   this.poseHand('Left',world(-.35-.10*extension-.23*counterGuard,1.05-v[7]*.25+.16*counterGuard,.08+.17*extension-.12*counterGuard),world(-.62,1.16,.20),weight);
   this.poseHand('Right',world(v[1],v[2],v[3]),world(.52+.12*(1-extension),1.12,.10-.20*extension),weight);
   // The point clears the right hip on the draw, aligns with the planted
   // forearm at contact, and drops outward again when the wrist withdraws.
   const cock=T.MathUtils.smoothstep(t,0,heavy?.24:running?.21:.095)*(1-T.MathUtils.smoothstep(t,heavy?.38:running?.34:.16,heavy?.55:running?.48:.26));
   const withdraw=T.MathUtils.smoothstep(t,heavy?.67:running?.58:.34,heavy?.98:running?.84:.57);
   this.playerBlade('Right',new T.Vector3(.10*(1-extension)+.49*cock+.30*withdraw,-.11+.15*extension+.21*cock-.18*withdraw+.20*rollRise,-1),weight,state);
   this.playerBlade('Left',new T.Vector3(-.22,-.40,.88),weight,state);
 }
 primaryParryPose(state){
   if(this.name!=='ivory_duelist'||!state.parry||!Number.isFinite(state.parryTime))return;
   // Primary 41.625-42.375 / 25.10-25.80: the Main-gauche travels across the
   // front, opens to the left and lowers. The Sword Lance stays at the right hip.
   const t=T.MathUtils.clamp(state.parryTime,0,.73);
   // time, left grip xyz, torso yaw/lean, dagger xyz
   const keys=[
     [0,-.40,1.01,.02,0,0,-.12,-.48,.86],
     [.14,.10,1.22,-.31,.20,.10,-.18,.88,-.45],
     [.25,-.30,1.32,-.49,-.23,.20,-.77,.59,-.30],
     [.39,-.65,1.17,-.19,-.34,.17,-.91,.32,.15],
     [.53,-.56,1.05,.02,-.16,.09,-.40,-.18,.90],
     [.73,-.40,1.01,.02,0,0,-.12,-.48,.86]
   ];
   const v=this.playerPoseKey(keys,t),weight=T.MathUtils.smoothstep(t,0,.08)*(1-T.MathUtils.smoothstep(t,.62,.73));
   // The knee braces before the dagger reaches its widest point (24.4ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ24.9 s).
   // Recover the upper body first, then unload the planted leg.
   const plant=T.MathUtils.smoothstep(t,0,.19)*(1-T.MathUtils.smoothstep(t,.39,.70));
   this.visual.position.y-=.14*plant;this.visual.position.x-=.10*plant;this.root.updateMatrixWorld(true);
   this.playerTurn('Spine',new T.Vector3(0,1,0),v[4],state);
   this.playerTurn('Spine1',new T.Vector3(1,0,0),-v[5],state);
   this.playerTurn('LeftShoulder',new T.Vector3(0,1,0),.18*v[4],state);
   this.playerStep(state,weight,-.14,.16-.27*plant);
   const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
   this.poseHand('Left',world(v[1],v[2],v[3]),world(-.67,1.28,.12),weight);
   this.poseHand('Right',world(.43,1.00-.04*plant,.10),world(.71,1.21,.24),weight);
   let segment=0;while(segment<keys.length-2&&t>keys[segment+1][0])segment++;
   const a=keys[segment],b=keys[segment+1],u=T.MathUtils.smoothstep(t,a[0],b[0]);
   const direction=new T.Vector3(...a.slice(6,9)).normalize(),next=new T.Vector3(...b.slice(6,9)).normalize();
   direction.applyQuaternion(new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(direction,next),u));
   this.playerBlade('Left',direction,1,state);
   this.playerBlade('Right',new T.Vector3(.07,-.13,-1),1,state);
 }
 closeWeaponHands(){
  if(this.name!=='gilded_warlord'||!this.thrustBasePose)return;
  for(const pose of this.thrustBasePose){
   const match=/(Left|Right)Hand(Index|Middle|Ring|Pinky|Thumb)([123])$/.exec(pose.bone.name);
   if(!match)continue;
   const side=match[1],finger=match[2],joint=Number(match[3]);
   const sign=side==='Right'?1:-1;
   // The imported idle pose already curls the fingers. Add only the final
   // closure around the handle; another full fist fold inverts the phalanges.
   const curl=(finger==='Thumb'?[.16,.24,.18]:[.45,.55,.30])[joint-1];
   const bone=pose.bone;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
   const axis=side==='Right'?new T.Vector3(0,0,1):new T.Vector3(-1,0,0);
   bone.quaternion.copy(pose.q).multiply(new T.Quaternion().setFromAxisAngle(axis,curl));
  }
  this.root.updateMatrixWorld(true);
 }
 seatGreatbladeGrips(state){
  if(this.name!=='gilded_warlord')return;
  for(const weapon of this.weapons){
   const wrist=this.hand(weapon.side);if(!wrist)continue;
   const knuckles=['Index','Middle','Ring'].map(finger=>findRigBone(this.bones,weapon.side+'Hand'+finger+'1')).filter(Boolean);
   if(!knuckles.length)continue;
   const palm=new T.Vector3();for(const knuckle of knuckles)palm.add(knuckle.getWorldPosition(new T.Vector3()));palm.divideScalar(knuckles.length);
   const curled=['Index','Middle','Ring'].map(finger=>findRigBone(this.bones,weapon.side+'Hand'+finger+'2')).filter(Boolean);
   if(curled.length){const inside=new T.Vector3();for(const joint of curled)inside.add(joint.getWorldPosition(new T.Vector3()));inside.divideScalar(curled.length);palm.lerp(inside,.55);}
   // This GLB's guard is at y=0 and its leather grip occupies -0.42..-0.08 m.
   // Seat the grip in the palm; attaching the guard to the wrist leaves air
   // between the fingers and handle, despite a zero bone/pivot error.
   const grip=weapon.model.userData.sourceCurvedBlade?weapon.model.position.clone().negate():new T.Vector3(0,.23,0);
   weapon.rakeContact=null;
   if(state?.bossAction==='rocks'&&state.groundAt&&weapon.model.userData.consortBlade){
     const plant=rockBladePlant(state.bossElapsed,weapon.side,state.pos.y,state.phase);
     if(plant>0)plantConsortBlade(weapon,palm,grip,state,this.presentationScale,plant);
   }
   weapon.pivot.position.copy(palm).add(grip.applyQuaternion(weapon.pivot.quaternion));
  }
 }

 framingPoints(){
  // Conservative blade tips used only by the camera, never hit detection.
  const points=[];
  for(const w of this.weapons)if(w.pivot.visible){
    points.push(w.pivot.localToWorld(new T.Vector3(0,0,0)));
    points.push(w.pivot.localToWorld(new T.Vector3(this.name==='gilded_warlord'?.7:0,w.length*.84,0)));
  }
  return points;
 }
 hand(side){
   this.handBones??=new Map();
   const cached=this.handBones.get(side);
   if(cached&&this.bones[cached.name]===cached)return cached;
   const pattern=new RegExp(`${side}Hand$`,'i');
   const hand=matchRig(this.bones,pattern);
   if(hand)this.handBones.set(side,hand);
   return hand;
 }
 async weapon(asset,side,length,slot=0){
  const offhandDagger=this.name==='ivory_duelist'&&slot===0&&asset==='parrying_dagger';
  if(asset==='war_greatblade'||offhandDagger){
   const model=offhandDagger?sourceDagger(length):createConsortGreatblade(length),pivot=new T.Group();pivot.add(model);this.scene.add(pivot);this.root.updateMatrixWorld(true);
   const hand=this.hand(side),handBindInverse=hand?(this.idleHandInverses?.[hand.name]||this.restBoneInverses[hand.name]).clone():null;
   const weapon={pivot,side,model,slot,handBindInverse,length};this.weapons.push(weapon);
   if(!offhandDagger){fitGreatbladeGrip(this,weapon);mountGreatbladeQuillons(weapon);}
   return;
  }
  const full=this.ultra&&['heavy_thrust_video','parrying_dagger'].includes(asset);
  const g=await loader.loadAsync(`assets/tripo/${asset}/${full?'model.glb':'model.web.glb'}`);const model=g.scene;if(asset==='war_greatblade')prepareCurvedBlade(model);const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3());if(size.x>size.y&&size.x>size.z)model.rotation.z=Math.PI/2;else if(size.z>size.y)model.rotation.x=-Math.PI/2;if(asset==='duelist_blade')model.rotateZ(Math.PI);if(asset==='heavy_thrust_video')model.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI));model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model),s=box.getSize(new T.Vector3());const scale=length/s.y;model.scale.setScalar(scale);model.position.set(-(box.min.x+box.max.x)/2*scale,-box.min.y*scale-(asset==='heavy_thrust_video'?.115:.18)*length,-(box.min.z+box.max.z)/2*scale);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});if(asset==='war_greatblade'&&!model.userData.sourceCurvedBlade){model.updateMatrixWorld(true);model.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,inv=o.matrixWorld.clone().invert();for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld),f=Math.max(0,(v.y+.18*length)/length);v.x=v.x*1.65+Math.pow(f,3.6)*.86;v.applyMatrix4(inv);a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;o.geometry.computeVertexNormals();});}if(this.name==='ivory_duelist'&&slot===1){model.scale.multiplyScalar(.22);model.position.multiplyScalar(.22);model.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set(0xd8d0b5);}});}const pivot=new T.Group();pivot.add(model);if(asset==='heavy_thrust_video'){pivot.add(sourceSwordGuard());model.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();o.material.metalness=.78;o.material.roughness=.48;o.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat bladeLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(bladeLuma),.72)*1.35;');};});}this.scene.add(pivot);if(this.name==='ivory_duelist'&&side==='Right'&&slot===1){const glow=new T.Mesh(new T.SphereGeometry(.16,8,6),new T.MeshBasicMaterial({color:0xff4b23,transparent:true,opacity:.3,depthWrite:false,blending:T.AdditiveBlending}));pivot.add(glow);this.castGlow=glow;}this.root.updateMatrixWorld(true);const hand=this.hand(side);const handBindInverse=hand?(this.idleHandInverses?.[hand.name]||this.restBoneInverses[hand.name]).clone():null;const weapon={pivot,side,model,slot,handBindInverse,length};this.weapons.push(weapon);fitGreatbladeGrip(this,weapon);if(this.name==='gilded_warlord'){reshapeGreatblade(weapon);mountGreatbladeQuillons(weapon);}}
 tick(dt,state,t){if(!this.ready)return;
 // The first hidden tick hides each detached attachment. Subsequent lobby
 // ticks need no skeleton or cloth pose until the encounter resumes.
 if(state.dormant&&this.dormant)return;
 if(this.dormant&&!state.dormant)this.capeParticles=null;
 this.dormant=!!state.dormant;
 if(this.name==='gilded_warlord'){
  this.root.scale.setScalar(1);
  for(const o of [this.helmet?.shell,...this.weapons.map(w=>w.pivot),...this.clasps.map(c=>c.clasp)])o?.scale.setScalar(1);
 }
for(const a of [...(this.combatAdjustments||[])].reverse())a.bone.quaternion.copy(a.rotation);this.combatAdjustments=[];for(const a of [...(this.gaitAdjustments||[])].reverse())a.bone.quaternion.copy(a.rotation);this.gaitAdjustments=[];const motion=state.motion||'idle',sourceThrust=this.name==='ivory_duelist'&&motion==='slash'&&state.strike!=='heavy'&&!state.critical,clipName=sourceThrust?'idle':motion==='slash'?(state.critical?'critical-strike':state.strike==='heavy'?'heavy-strike':'light-strike'):motion==='dive'?'combat-roll':motion;this.play(this.actions[clipName]?clipName:motion,state.speed||1);if(['idle','walk','run'].includes(motion)&&this.current){this.current.setLoop(T.LoopRepeat,Infinity);this.current.clampWhenFinished=false;this.current.paused=false;}if(['slash','dive','jump','fall','hurt'].includes(motion)&&this.current){this.current.setLoop(T.LoopOnce,1);this.current.clampWhenFinished=true;if(state.actionId!==this.actionId||motion!==this.lastMotion){this.current.reset().play();this.actionId=state.actionId;}if(state.duration)this.current.timeScale=this.current.getClip().duration/state.duration;}this.lastMotion=motion;if(this.name==='gilded_warlord'&&this.thrustBasePose){for(const p of this.thrustBasePose)p.bone.position.copy(p.p);}this.mixer.update(dt);if(Number.isFinite(state.progress)&&this.current){this.current.paused=false;this.current.time=Math.max(0,Math.min(.999,state.progress))*this.current.getClip().duration;this.mixer.update(0);}if(sourceThrust&&this.thrustBasePose)for(const pose of this.thrustBasePose){pose.bone.quaternion.copy(pose.q);pose.bone.position.copy(pose.p);}if(this.name==='ivory_duelist'){this.attackCloth??=new T.Vector2();this.attackCloth.lerp(this.playerClothDrive(state),1-Math.exp(-dt*12));}if(this.cape){const a=this.cape.geometry.attributes.position,boss=this.name==='gilded_warlord',height=boss?2.85:1.08;
       const speed=Math.min(7,this.root.position.distanceTo(state.pos)/Math.max(.008,dt));this.clothSpeed=T.MathUtils.lerp(this.clothSpeed||0,speed,1-Math.exp(-dt*7));
       const turn=Math.atan2(Math.sin((state.yaw||0)-this.root.rotation.y),Math.cos((state.yaw||0)-this.root.rotation.y));this.clothTurn=T.MathUtils.lerp(this.clothTurn||0,T.MathUtils.clamp(turn/Math.max(.008,dt),-3,3),1-Math.exp(-dt*5));
       if(boss&&this.liveCape){
         this.poseCapeWaves??=prepareCapeWaves(this.capeBase,height);
         this.poseCapeWaves(a.array,t,this.clothSpeed,this.clothTurn);
       }else if(!this.cloak)for(let i=0;i<a.count;i++){const x=this.capeBase[i*3],y=this.capeBase[i*3+1],f=T.MathUtils.clamp((height*.5-y)/height,0,1),wave=Math.sin(t*3.3+x*3-y*2.2);
         a.setY(i,y);a.setX(i,x+(Math.sin(t*2.2+y*2)*.045-(this.clothTurn+(this.attackCloth?.x||0))*.09)*f*f);
         a.setZ(i,this.capeBase[i*3+2]+(wave*(.055+this.clothSpeed*.012)+this.clothSpeed*.055)*f*f);
         if(!boss){const jump=state.jumpFlight,air=jump?.windup?Math.sin(Math.PI*T.MathUtils.clamp((jump.elapsed-jump.windup)/(jump.duration-jump.windup),0,1)):0,thrust=this.attackCloth?.y||(state.motion==='slash'&&state.strike==='heavy'?Math.sin(Math.PI*(state.progress||0)):0);
          a.setY(i,y+(air*.23+this.clothSpeed*.025+thrust*.12+wave*.02)*f*f);a.setZ(i,a.getZ(i)+(air*.2+thrust*.13)*f*f);
         }
       }if(!this.cloak&&!this.capeMount){a.needsUpdate=true;this.cape.geometry.computeVertexNormals();}}this.root.position.copy(state.pos);this.root.rotation.y=state.yaw||0;this.visual.rotation.x=this.name==='gilded_warlord'?(state.postCritical!=null?-.18*(1-.2*T.MathUtils.smoothstep(state.postCritical,.25,.7)):state.bossAction==='critical'?-.18:state.stagger>0?-.1:state.bossAction==='somersault'?-Math.PI*2*T.MathUtils.clamp((state.bossElapsed-.55)/1.2,0,1):state.bossAction==='leap'&&state.groundedRush?-.5*T.MathUtils.smoothstep(state.bossElapsed,1.7,1.83)*(1-T.MathUtils.smoothstep(state.bossElapsed,RUSH_SEQUENCE.contact-.08,RUSH_SEQUENCE.contact+.15)):state.bossAction==='leap'&&state.bossElapsed>RUSH_SEQUENCE.windup?-.5:state.bossAction==='slam'?Math.sin((state.bossElapsed/3.5)*Math.PI)*.55:state.attack?Math.sin(state.attack*Math.PI)*.28:0):state.recoil?state.recoil*.24:0;this.visual.rotation.y=0;this.visual.position.set(0,(state.jump||0)+(state.groundOffset||0),0);this.root.visible=state.visible!==false;this.root.updateMatrixWorld(true);if(this.name==='ivory_duelist'&&['walk','run'].includes(motion)){let angle=Math.atan2(Math.sin(state.strafe||0),Math.cos(state.strafe||0));if(Math.cos(angle)<0)angle+=angle>0?-Math.PI:Math.PI;this.gaitTurn=T.MathUtils.lerp(this.gaitTurn||0,angle,Math.min(1,dt*14));for(const [pattern,turn] of [[/Hips$/i,this.gaitTurn],[/Spine$/i,-this.gaitTurn]]){const bone=matchRig(this.bones,pattern);if(bone){this.gaitAdjustments.push({bone,rotation:bone.quaternion.clone()});const axis=new T.Vector3(0,1,0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert());bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,turn));bone.updateWorldMatrix(true,true);}}}else this.gaitTurn=0;
 const reconstructedBoss=reconstructBossPose(this,state,dt);this.authoredBossPose=reconstructedBoss;
 if(!reconstructedBoss){
 // Pose every contact from the same catalog used by collision. Twist the torso
 // and bend knees with the hands, instead of moving two disconnected swords.
 if(this.name==='gilded_warlord'&&state.bossAction!=='cross'){
   const lights=lightContacts(state.bossAction,state.rockFollowup),contacts=MOVES[state.bossAction]?.contacts||((state.bossAction==='lightspeed'&&lights)?lights.slice(-1):lights||[]).map(t=>({t,hand:0,style:state.bossAction==='lightspeed'?'down':state.bossAction==='dash'?'thrust':'sweep'})),time=state.bossElapsed||0;
   const rotate=(pattern,axis,angle)=>{const bone=matchRig(this.bones,pattern);if(!bone)return;this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});const inv=bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert();const v=axis.clone().applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(inv);bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(v,angle));};
   let torso=0,lean=.08,knee=.09;
   for(const c of contacts){
     // The final leap winds both blades up during takeoff. The following
     // ground shock is the same landing, not a second overhead sword swing.
     if(state.bossAction==='promised'&&c.area&&c.style==='quake')continue;
     const jumping=state.bossAction==='promised'&&c.jump;
     const delta=time-c.t,windStart=jumping?-1.45:-.72;
     if(delta<windStart||delta>.78)continue;
     const wind=T.MathUtils.smoothstep(delta,windStart,jumping?-.85:-.15),swing=T.MathUtils.smoothstep(delta,jumping?-.25:-.15,jumping?.24:.16),relax=T.MathUtils.smoothstep(delta,jumping?.24:.16,.78),amp=(1-relax),pose=(wind*(1-swing)-swing*.8)*amp;
     if(c.style==='stomp'){
        // A raised knee, then a planted foot: this is not a two-sword swing.
        const lift=T.MathUtils.smoothstep(delta,-.85,-.25)*(1-T.MathUtils.smoothstep(delta,-.16,.05));
        rotate(/LeftUpLeg$/,new T.Vector3(1,0,0),-1.05*lift);
        rotate(/(?<!Up)LeftLeg$/,new T.Vector3(1,0,0),1.2*lift);
        lean+=.16*T.MathUtils.smoothstep(delta,-.16,.12)*(1-relax);
        continue;
      }
      for(const side of ['Right','Left']){const sign=side==='Right'?1:-1;if(c.hand&&c.hand!==sign)continue;
       const overhead=['down','up','quake'].includes(c.style),cross=c.style==='cross',thrust=c.style==='thrust';
       rotate(new RegExp(side+'Arm$'),new T.Vector3(1,0,0),(overhead?2.1:thrust?1.3:1.0)*pose*(c.style==='up'?-1:1));
       rotate(new RegExp(side+'Arm$'),new T.Vector3(0,0,1),sign*(cross?1.1:overhead?.35:1.1)*pose);
       rotate(new RegExp(side+'Arm$'),new T.Vector3(0,1,0),sign*(cross?-1.1:.8)*swing*amp);
       rotate(new RegExp(side+'ForeArm$'),new T.Vector3(1,0,0),.6*wind*(1-swing)*amp);
     }
     torso+=(c.hand||1)*(.5*wind-1.0*swing)*amp;lean+=(c.style==='down'?.45:.18)*swing*amp;knee+=.22*wind*amp;
     if(!c.area){const plant=Math.sin(Math.PI*T.MathUtils.clamp((delta+.32)/.62,0,1))*.22,lead=c.hand===-1?'Left':'Right';rotate(new RegExp(lead+'UpLeg$'),new T.Vector3(1,0,0),-plant);rotate(new RegExp('^.*'+lead+'Leg$'),new T.Vector3(1,0,0),plant*.65);}

   }
   if(state.bossAction==='lightspeed'){
     // The real body holds its overhead while the separate phantoms strike.
     const land=lights.at(-1),held=T.MathUtils.smoothstep(time,0,.3)*(1-T.MathUtils.smoothstep(time,land-.72,land-.15));
     for(const side of ['Left','Right']){rotate(new RegExp(side+'Arm$'),new T.Vector3(1,0,0),1.75*held);rotate(new RegExp(side+'Arm$'),new T.Vector3(0,0,1),(side==='Right'?1:-1)*.25*held);rotate(new RegExp(side+'ForeArm$'),new T.Vector3(1,0,0),.4*held);}knee+=.25*held;
   }
   if(state.bossAction==='stompSweep'){
     // The stomp and retreat keep the leading blade raised until the held
     // overhead takes over. Do not return to idle arms between those contacts.
     const overhead=MOVES.stompSweep.contacts.find(c=>c.style==='down').t;
     const held=T.MathUtils.smoothstep(time,.05,.45)*(1-T.MathUtils.smoothstep(time,overhead-.72,overhead-.15));
     rotate(/RightArm$/,new T.Vector3(1,0,0),1.6*held);
     rotate(/RightArm$/,new T.Vector3(0,0,1),.25*held);
     rotate(/RightForeArm$/,new T.Vector3(1,0,0),.32*held);
     rotate(/LeftForeArm$/,new T.Vector3(1,0,0),.18*held);
   }
   if(!(state.bossAction==='leap'&&state.groundedRush)&&['leap','rocks','nova','lightspeed','sideDash'].includes(state.bossAction)&&(!LIGHT_CONTACTS[state.bossAction]||time<LIGHT_CONTACTS[state.bossAction][0]-.72)){
     const lift=state.bossAction==='leap'?1.0:state.bossAction==='nova'?-.4:state.bossAction==='rocks'?(time<ROCK_SEQUENCE.strike?T.MathUtils.lerp(.3,2,T.MathUtils.smoothstep(time,.3,1.55)):time<ROCK_SEQUENCE.risen?-1.15:time>ROCK_SEQUENCE.throw-.35?T.MathUtils.lerp(1.5,-.6,T.MathUtils.smoothstep(time,ROCK_SEQUENCE.throw-.35,ROCK_SEQUENCE.throw+.3)):1.5):1.5;
     for(const side of ['Right','Left']){rotate(new RegExp(side+'Arm$'),new T.Vector3(1,0,0),lift);rotate(new RegExp(side+'Arm$'),new T.Vector3(0,0,1),(side==='Right'?1:-1)*.8);}knee=.35;
   }
   if(state.bossAction==='meteor'){
     const m=METEOR_SEQUENCE;
     const charge=T.MathUtils.smoothstep(time,.1,.65)*(1-T.MathUtils.smoothstep(time,m.plant,m.plant+.35));
     const plant=T.MathUtils.smoothstep(time,m.plant-.2,m.plant+.15)*(1-T.MathUtils.smoothstep(time,m.takeoff,m.risen));
     for(const side of ['Left','Right']){
       rotate(new RegExp(side+'Arm$'),new T.Vector3(1,0,0),charge*2.6-plant*.2);
       rotate(new RegExp(side+'Arm$'),new T.Vector3(0,0,1),(side==='Right'?1:-1)*(charge*.45+plant*.25));
     }
     lean+=plant*.65;knee+=plant*.5;
     if(time>m.return&&time<m.contact)this.visual.rotation.x=-.8;
   }
   if(state.bossAction==='lightspeed'&&time>lights.at(-1)){
     const land=lights.at(-1),settle=T.MathUtils.smoothstep(time,land,land+.4)*(1-T.MathUtils.smoothstep(time,land+(state.rockFollowup?.9:.2),land+(state.rockFollowup?1.8:.4)));
     lean+=settle*.55;knee+=settle*.75;
   }
   if(state.bossAction==='leap'&&state.groundedRush){
     const flight=T.MathUtils.smoothstep(time,1.7,1.83)*(1-T.MathUtils.smoothstep(time,RUSH_SEQUENCE.contact-.08,RUSH_SEQUENCE.contact));
     const low=1-T.MathUtils.smoothstep(time,.15,.8);
     const land=T.MathUtils.smoothstep(time,RUSH_SEQUENCE.contact-.03,RUSH_SEQUENCE.contact+.10)*(1-T.MathUtils.smoothstep(time,RUSH_SEQUENCE.contact+.35,RUSH_SEQUENCE.duration));
     knee=.22+.5*low+.85*flight+.55*land;lean=.10+.3*low+.5*flight+.4*land;
   }
   if(state.bossAction==='pull'){
    const plant=T.MathUtils.smoothstep(time,2.20,2.52)*(1-T.MathUtils.smoothstep(time,3.40,4.35));
    lean=.08+.46*plant;knee=.18+.40*plant;
   }
   rotate(/Spine2$/,new T.Vector3(0,1,0),torso);rotate(/Spine$/,new T.Vector3(1,0,0),-lean);
   this.heldStompBlades(state);
   for(const side of ['Right','Left']){rotate(new RegExp(side+'UpLeg$'),new T.Vector3(1,0,0),knee);rotate(new RegExp('^.*'+side+'Leg$'),new T.Vector3(1,0,0),-knee*1.6);}
   const rushWindup=state.openingRush?RUSH_SEQUENCE.openingWindup:state.groundedRush?1.7:RUSH_SEQUENCE.windup;
   const rushContact=state.openingRush?RUSH_SEQUENCE.openingContact:RUSH_SEQUENCE.contact;
   if(state.bossAction==='leap'&&time>rushWindup&&time<rushContact)this.visual.rotation.z=Math.PI*4*T.MathUtils.clamp((time-rushWindup)/(rushContact-rushWindup),0,1);
   else this.visual.rotation.z=0;
   if((state.groundedRush||state.openingRush)&&state.bossAction==='leap'){
     const pivot=new T.Vector3(0,this.height*.5,0);
     this.visual.position.add(pivot.clone().sub(pivot.applyEuler(this.visual.rotation)));
   }
   this.gravityRushPose(state);this.gravityPullPose(state);
 }
 if(this.name==='gilded_warlord'&&(state.bossAction==='critical'||state.stagger>0||state.postCritical!=null)){
  const vulnerable=state.bossAction==='critical'||state.critical||state.postCritical!=null;
  const rise=state.postCritical!=null?1-.2*T.MathUtils.smoothstep(state.postCritical,.25,.7):state.bossAction==='critical'?1-.25*T.MathUtils.smoothstep(state.bossElapsed,3.8,4.7):1;
  const settled=state.bossAction==='recover'&&state.critical?T.MathUtils.smootherstep(state.bossElapsed,.29,1.22):1;
  const bend=(vulnerable?settled:.35)*rise;
  // Rise through the torso after the hold; keep the knees planted (primary 39ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ40.5 s).
  const recoveryAge=state.postCritical!=null?4.7+state.postCritical:state.bossAction==='critical'?state.bossElapsed:0;
  const brace=state.bossAction==='critical'?Math.sin(state.bossElapsed*3.1)*.038*Math.exp(-state.bossElapsed*.54):0;
  const upperBend=bend*(1-.55*T.MathUtils.smootherstep(recoveryAge,4.12,4.95))+brace;
  // The two observed wound reactions follow the same contacts as damage.
  const pulse=at=>{const u=state.bossElapsed-at;return state.bossAction==='critical'
   ?T.MathUtils.smootherstep(u,0,.095)*(1-T.MathUtils.smootherstep(u,.095,.53)):0;};
  const entryRecoil=pulse(RIPOSTE_SEQUENCE.entry),releaseRecoil=pulse(RIPOSTE_SEQUENCE.release);
  const extract=state.bossAction==='critical'
   ?T.MathUtils.smootherstep(state.bossElapsed,RIPOSTE_SEQUENCE.release-.06,RIPOSTE_SEQUENCE.release+.27)*
    (1-T.MathUtils.smootherstep(state.bossElapsed,RIPOSTE_SEQUENCE.release+.27,4.48)):0;
  const riderBend=state.phase===2&&vulnerable?upperBend:0;
  const pose=[[/UpLeg$/i,1.22*bend+.12*riderBend],[/(?<!Up)Leg$/i,-2.1*bend-.12*riderBend],
   [/Spine$/i,-.68*upperBend-.32*riderBend-.18*releaseRecoil+.35*extract],[/Spine2$/i,-.22*upperBend-.22*riderBend-.06*entryRecoil-.16*releaseRecoil+.27*extract]];
  for(const [pattern,angle] of pose){
   for(const [name,bone] of this.poseJoints){
    if(!pattern.test(name))continue;
    this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
    const inv=bone.parent.getWorldQuaternion(new T.Quaternion()).normalize().invert();
    const axis=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(inv);
    bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle));
   }
  }
  // Primary 39-40.5: the knees open around the player during the low recovery.
  // Rotate the thigh in the actor plane, without moving either combat root.
  for(const side of ['Right','Left']){
   const bone=findRigBone(this.bones,side+'UpLeg');if(!bone)continue;
   this.combatAdjustments.push({bone,rotation:bone.quaternion.clone()});
   const axis=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
   bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,(side==='Right'?1:-1)*.65*bend));bone.updateWorldMatrix(true,true);
  }
  // Keep the planted feet at the terrain while the knees and torso fold.
  let min=Infinity;
  for(const [name,bone] of this.poseJoints)if(/Foot$/i.test(name))min=Math.min(min,bone.getWorldPosition(new T.Vector3()).y);
  if(Number.isFinite(min))this.visual.position.y-=min-state.pos.y-(state.groundOffset||0)-this.footClearance;
 }
 this.flameCastPose(state);if((state.parry&&this.name!=='ivory_duelist')||state.guard||state.grab){const grabBlend=this.name==='gilded_warlord'&&state.bossAction==='stompGrab'?T.MathUtils.smoothstep(state.bossElapsed,1.8,1.96):1;for(const side of state.grab?['Left','Right']:['Left']){const arm=findRigBone(this.bones,side+'Arm');const fore=findRigBone(this.bones,side+'ForeArm');if(arm){this.combatAdjustments.push({bone:arm,rotation:arm.quaternion.clone()});arm.rotateX(-.9*grabBlend);arm.rotateZ((side==='Left'?-.7:.7)*grabBlend);}if(fore){this.combatAdjustments.push({bone:fore,rotation:fore.quaternion.clone()});fore.rotateX(-.65*grabBlend);}}}this.pairedReadyPose(state);this.grabAnticipation(state);this.postGrabRecovery(state);this.postGrabStep(state);this.ringLandingPose(state);this.sourceCrossPose(state);this.sourceLongPose(state);this.sourceMeleePose(state);this.sourceRockRipPose(state);this.phaseKneelPose(state);this.playerGesture(dt,state);this.normalJump(state);}
 this.finishPose(dt,state,t);
 // The duelist's locomotion, dodge, jump and Sword Lance chain are posed procedurally from the rest
 // skeleton (player-motion.js). The riposte and parry overlays below still apply on its stance.
 const proceduralPlayer=this.name==='ivory_duelist'&&(this.motion??=new PlayerMotion(this)).update(dt,state,t);
 if(!proceduralPlayer){this.playerCarryPose(dt,state);this.primaryThrustPose(state);}
 this.primaryCriticalPose(state);this.primaryParryPose(state);
 if(!reconstructedBoss&&this.name==='gilded_warlord'&&state.bossAction==='critical'){
   const t=state.bossElapsed,ease=T.MathUtils.smootherstep;
   const w=ease(t,0,.32)*(1-ease(t,3.85,4.67));
   const recoil=ease(t,2.43,2.86)*(1-ease(t,2.89,3.83));
   const world=(x,y,z)=>this.root.localToWorld(new T.Vector3(x,y+(state.groundOffset||0),z));
   this.poseHand('Left',world(-1.16,.27+.31*recoil,-.86),world(-1.61,1.34,-.18),w);
   this.poseHand('Right',world(1.27,.56+1.26*recoil,-.67+.45*recoil),world(1.70,1.63,.08),w);
   this.playerBlade('Right',new T.Vector3(.48,.42+1.44*recoil,-.89),w,state);
   this.playerBlade('Left',new T.Vector3(-.78,.04,.63),w,state);
 }
 if(!proceduralPlayer)this.groundFeet(state,motion);if(this.name==='gilded_warlord'&&state.pos.y>(state.bossAction==='promised'?0:.1)&&!((state.groundedRush||state.openingRush)&&state.bossAction==='leap')){const pivot=new T.Vector3(0,this.height*.5,0);this.visual.position.add(pivot.clone().sub(pivot.applyEuler(this.visual.rotation)).multiplyScalar(state.bossAction==='promised'||state.groundedRush&&state.bossAction==='leap'?T.MathUtils.smoothstep(state.pos.y,0,.7):1));}this.root.updateMatrixWorld(true);
 if(this.capeMount&&!this.cloak){const matrix=this.capeMount.chest.matrixWorld.clone().multiply(this.capeMount.local);this.cape.matrixAutoUpdate=false;this.cape.matrix.copy(matrix);this.updateCapeMotion(dt,state,t,matrix);this.cape.matrixWorldNeedsUpdate=true;this.cape.visible=this.root.visible;}
 for(const a of this.clasps){a.clasp.position.copy(a.local).applyMatrix4(a.chest.matrixWorld);a.clasp.quaternion.copy(a.chest.getWorldQuaternion(new T.Quaternion())).multiply(a.bindInverse).normalize();a.clasp.visible=this.root.visible;}if(this.helmet){const {shell,offset,bindInverse}=this.helmet;const head=matchRig(this.bones,/Head$/i);if(head)head.getWorldPosition(shell.position);else shell.position.copy(state.pos).add(new T.Vector3(0,this.height*.9,0));if(head)shell.quaternion.copy(head.getWorldQuaternion(new T.Quaternion())).multiply(bindInverse).normalize();else shell.rotation.set(0,state.yaw||0,0);shell.position.add(new T.Vector3(0,offset,0).applyQuaternion(shell.quaternion));shell.visible=this.root.visible;if(this.fur){
   const fur=this.fur;fur.uniforms.headFurTime.value=t;
   if(fur.uniforms.peltTrail){
    if(!fur.previous){fur.previous=state.pos.clone();fur.lag=new T.Vector3();fur.delta=new T.Vector3();fur.inverse=new T.Quaternion();}
    fur.delta.subVectors(fur.previous,state.pos);fur.previous.copy(state.pos);
    if(fur.delta.lengthSq()>1||dt<=0){fur.delta.set(0,0,0);fur.lag.set(0,0,0);}
    else fur.delta.multiplyScalar(.021/dt).clampLength(0,.115);
    fur.lag.lerp(fur.delta,1-Math.exp(-dt*10));
    fur.uniforms.peltTrail.value.copy(fur.lag).applyQuaternion(fur.inverse.copy(shell.quaternion).invert());
   }
  }if(this.redMane){
   this.redMane.headFurTime.value=t;
   const yaw=state.yaw+this.visual.rotation.y;
   const rest=shell.quaternion.clone().invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw));
   this.redMane.maneRestBasis.value.setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(rest));
   const delta=this.lastManeYaw===undefined?0:Math.atan2(Math.sin(yaw-this.lastManeYaw),Math.cos(yaw-this.lastManeYaw));
   const drag=T.MathUtils.clamp(-delta/Math.max(.008,dt)*.055,-.18,.18);
   this.redMane.headFurTurn.value=T.MathUtils.lerp(this.redMane.headFurTurn.value,drag,1-Math.exp(-dt*10));this.lastManeYaw=yaw;
  }}if(this.castGlow){this.castGlow.visible=!!state.cast||!!state.flame;this.castGlow.scale.setScalar(1+Math.sin(t*13)*.15);this.castGlow.material.opacity=state.cast?.35:.18;}for(const w of this.weapons){const bone=this.hand(w.side);if(bone)bone.getWorldPosition(w.pivot.position);else w.pivot.position.copy(state.pos).add(new T.Vector3(w.side==='Left'?-.5:.5,this.height*.5,0).applyAxisAngle(new T.Vector3(0,1,0),state.yaw||0));w.pivot.visible=this.root.visible&&(this.name!=='ivory_duelist'||(w.side==='Left'?state.leftEquipped!==false&&state.twoHandedSide!=='Right'&&!(this.motion?.gripSide==='Right'&&this.motion?.gripWeight>.10):state.twoHandedSide!=='Left'&&!(this.motion?.gripSide==='Left'&&this.motion?.gripWeight>.10)&&!state.drink&&w.slot===(state.weapon||0)));const sign=w.side==='Left'?-1:1;if(bone&&w.handBindInverse){w.pivot.quaternion.copy(bone.getWorldQuaternion(new T.Quaternion())).multiply(w.handBindInverse).normalize();w.pivot.rotateX(this.name==='gilded_warlord'?-2.2:-2.5);w.pivot.rotateZ(-sign*(this.name==='gilded_warlord'?.8:.3));}else{w.pivot.rotation.set(0,state.yaw||0,0);w.pivot.rotateX(2.5);w.pivot.rotateZ(sign*.3);if(state.attack){w.pivot.rotateX(-Math.sin(state.attack*Math.PI)*2.4);w.pivot.rotateZ(sign*Math.sin(state.attack*Math.PI)*2.0);}}if(((state.parry&&this.name!=='ivory_duelist')||(state.guard&&!state.twoHanded))&&w.side==='Left'){w.pivot.rotateX(1.7);w.pivot.rotateZ(1);}}
 if(this.authoredBossPose&&this.authoredBladeFrames)for(const w of this.weapons){const q=this.authoredBladeFrames[w.side];if(q)w.pivot.quaternion.copy(q);}closeGreatbladeHands(this);this.seatGreatbladeGrips(state);
 if(this.flask?.visible)this.hand('Right')?.getWorldPosition(this.flask.position);
 this.updatePlayerCloth(dt,state,t);this.scalePresentation(state);this.weaponTrails(state,t);
 this.motion?.finish();
 if(this.name==='ivory_duelist'&&this.motion?.ready){
  // Simulated cloak replaces the chest-parented card.
  this.cloak??=createPlayerCloak(this,this.cape?.material);this.cloak.update(dt,state,t);
  if(this.cape)this.cape.visible=false;
 }
 }
}
export class Effects{
 constructor(scene){this.scene=scene;this.items=[];
  // Two stable light slots illuminate nearby materials; no per-column shadow maps.
  this.holyLights=[0,1].map(()=>{const light=new T.PointLight(0xffda96,0,17,2);scene.add(light);return light;});
  // The main flash also reaches surfaces well beyond the damage circle.
  this.impactLight=new T.PointLight(0xffe5b0,0,95,2);scene.add(this.impactLight);
  this.sight={eye:{value:new T.Vector3()},focus:{value:new T.Vector3()}};const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffffbb');g.addColorStop(.4,'#ffffff60');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,64,64);this.cloudTexture=new T.CanvasTexture(c);this.geo=new T.IcosahedronGeometry(.07,0);this.mats={gold:new T.MeshBasicMaterial({color:0xffe8a1,transparent:true}),purple:new T.MeshBasicMaterial({color:0x9b66ff,transparent:true}),flame:new T.MeshBasicMaterial({color:0xff4826,transparent:true}),blood:new T.MeshBasicMaterial({color:0x8d1824,transparent:true}),ice:new T.MeshBasicMaterial({color:0xa4e6ff,transparent:true})};}
 setView(eye,focus){this.sight.eye.value.copy(eye);this.sight.focus.value.copy(focus);}
 prepareWarmup(actor,cacheSpells=false,heightAt){
   this.cacheSpells=cacheSpells;
   // Keep the compiled material references alive after the offscreen render.
   // Creating a particle/phantom program during its first combat contact can
   // otherwise stall both animation and keyboard delivery.
   if(this.warmItems)return;
   const active=this.items;this.items=[];const origin=new T.Vector3();
   for(const kind of ['gold','purple','ice','flame','blood'])this.burst(origin,kind,1);
   this.pillar(origin);this.holyImpact(origin,6);this.greatColumn(origin,10);
   if(cacheSpells)this.warmGreatColumn=this.keepImpact(this.items.at(-1));
   this.lightning(origin);this.warmLightning=this.keepImpact(this.items.at(-1));this.arc(origin,0,true);
   this.crossRays(origin,0);this.landingThreads(origin,0);this.lightBarrage(origin,0,1);this.lightTrace(origin,new T.Vector3(1,0,0),0,cacheSpells?heightAt:undefined);this.ring(origin);
   if(cacheSpells)this.warmRing=this.keepImpact(this.items.at(-1));
   this.nova(origin,cacheSpells?1.25:1);
   if(cacheSpells)this.warmNova=this.keepImpact(this.items.at(-1));
   this.debris(origin,1);this.impactDust(origin,4);this.groundSpikes(origin,0,5.6,true);this.warmRushGround=this.keepImpact(this.items.at(-1));this.groundSpikes(origin,0,5.6,true,false,true);this.warmOpeningGround=this.keepImpact(this.items.at(-1));this.meteorEjecta(origin);for(let shard=0;shard<12;shard++)this.rockImpact(origin,shard);this.groundSpikes(origin,0);this.bloodflameRift(origin,0);
   if(actor)for(let i=0;i<4;i++)this.afterimage(origin,0,actor,'down',i===3?origin:null,i);
   this.warmItems=this.items;this.items=active;
 }
 finishWarmup(){for(const item of this.warmItems||[]){item.o.removeFromParent();if(item.kind==='ghost')item.o.userData.releaseGhost?.();}}
 iceCloudTexture(){
  if(this.iceTexture)return this.iceTexture;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const x=canvas.getContext('2d');
  // Uneven, overlapping lobes preserve the source cloud's broken soft edge.
  for(let i=0;i<28;i++){
   const angle=i*2.39996,r=Math.sqrt((i*17%29)/29)*34,cx=64+Math.sin(angle)*r,cy=64+Math.cos(angle)*r;
   const size=19+i%5*3,g=x.createRadialGradient(cx,cy,0,cx,cy,size);
   g.addColorStop(0,'rgba(255,255,255,.27)');g.addColorStop(.45,'rgba(255,255,255,.17)');g.addColorStop(1,'rgba(255,255,255,0)');
   x.fillStyle=g;x.fillRect(cx-size,cy-size,size*2,size*2);
  }
  this.iceTexture=new T.CanvasTexture(canvas);return this.iceTexture;
 }
 riposteSpray(contact,yaw,release,groundAt){
  const effect=createRiposteSpray(contact,yaw,release,groundAt);
  this.scene.add(effect.o);this.items.push(effect);
 }
 burst(pos,type='gold',n=25){
  const ice=type==='ice',keepProc=ice&&n<50&&this.items.some(p=>p.kind==='ice-cloud'&&p.strength==='proc'&&p.max-p.life<.2);
  if(ice&&!keepProc){for(let i=this.items.length-1;i>=0;i--){const p=this.items[i];if(p.kind==='ice-cloud'){this.scene.remove(p.o);p.o.material.dispose();this.items.splice(i,1);}}}
  if(ice&&!keepProc||type==='purple'||type==='flame'){
   // Primary 99.75ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ100.5 / 114.75ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ115.5 s: a thin localized frost veil and fine flecks.
   // Keep it on the contact surface; the caller supplies the posed hit point.
   for(let i=0;i<(ice?(n>=50?5:3):4);i++){
    const cloudOpacity=ice?(n>=50?.19:.085):type==='purple'?.24:.3;
    const o=new T.Sprite(new T.SpriteMaterial({map:ice?this.iceCloudTexture():this.cloudTexture,color:ice?0xc2cdd1:type==='flame'?0xff7829:0x8c66b5,transparent:true,opacity:cloudOpacity,depthWrite:false}));
    o.position.copy(pos).add(ice?new T.Vector3(Math.sin(i*2.4)*.24,Math.cos(i*3.1)*.20,Math.cos(i*2.4)*.12):new T.Vector3(Math.sin(i*2.4)*.7,i*.13,Math.cos(i*2.4)*.7));
    if(ice){const span=(n>=50?.93:.72)+(i%3)*.09;o.scale.set(span*1.26,span*.70,1);o.material.rotation=Math.sin(i*2.4)*.46;}
    else o.scale.setScalar(1.5+i*.2);this.scene.add(o);
    const life=ice?(n>=50?1.65:.77):1.5;this.items.push({o,anchorOffset:ice?o.position.clone().sub(pos):null,strength:n>=50?'proc':'hit',vel:new T.Vector3(Math.sin(i)*(ice?.10:.5),ice?.08:.25,Math.cos(i)*(ice?.08:.5)),life,max:life,opacity:cloudOpacity,kind:ice?'ice-cloud':'particle'});
   }
  }
  const count=ice?Math.max(n,24):n,positions=new Float32Array(count*3),velocities=new Float32Array(count*3);
  for(let i=0;i<count;i++){const a=i*2.39996;velocities.set(ice?[Math.sin(a)*(.25+i%4*.16),.25+i%5*.13,Math.cos(a)*(.18+i%3*.12)]:[Math.sin(a)*(1+i%4),1+i%5,Math.cos(a)*(1+i%3)],i*3);if(ice)positions.set([Math.sin(a)*.13,Math.cos(a*1.3)*.17,Math.cos(a)*.10],i*3);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));
  const mat=new T.PointsMaterial({color:this.mats[type].color,size:ice?.052:.1,map:this.cloudTexture,transparent:true,depthWrite:false,blending:type==='blood'?T.NormalBlending:T.AdditiveBlending});
  const o=new T.Points(g,mat);o.position.copy(pos);this.scene.add(o);const life=ice?.85:1.3;this.items.push({o,velocities,life,max:life,gravity:ice?1.1:6,kind:'sparks'});
 }
 followCold(position){let pos;for(const p of this.items){if(p.kind!=='ice-cloud')continue;pos??=position();const elapsed=p.max-p.life;p.o.position.copy(pos).add(p.anchorOffset).addScaledVector(p.vel,elapsed);}}
 bloodflameTexture(){
   if(this.fireTexture)return this.fireTexture;
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const x=canvas.getContext('2d');
   // Soft turbulent curls avoid the straight edges of a billboard silhouette.
   x.globalCompositeOperation='lighter';
   for(let i=0;i<8;i++)for(let j=0;j<32;j++){
     const f=j/31,base=32+(i*19%64),cx=base+Math.sin(f*8+i*2.4)*(4+f*14),cy=226-f*(160+(i%4)*13),r=(14+i%4*2)*Math.pow(1-f,.7)+1;
     const alpha=Math.sin(Math.PI*f)*.19,g=x.createRadialGradient(cx,cy,0,cx,cy,r);
     g.addColorStop(0,`rgba(255,${Math.round(190-f*115)},${Math.round(85-f*70)},${alpha})`);
     g.addColorStop(.42,`rgba(255,50,8,${alpha*.65})`);g.addColorStop(1,'rgba(210,9,2,0)');x.fillStyle=g;x.fillRect(cx-r,cy-r,r*2,r*2);
   }
   this.fireTexture=new T.CanvasTexture(canvas);this.fireTexture.colorSpace=T.SRGBColorSpace;return this.fireTexture;
 }
 bloodflameRift(pos,yaw){
   const o=new T.Group();o.position.copy(pos);o.position.y+=1.2;o.rotation.y=yaw;
   const curve=new T.CatmullRomCurve3([new T.Vector3(-2.1,.12,.22),new T.Vector3(-.8,-.08,0),new T.Vector3(.6,.02,-.06),new T.Vector3(2.1,.32,.15)]);
   for(const [width,color,opacity]of [[.007,0xffe1a6,.9],[.027,0xff2010,.3]]){const line=new T.Mesh(new T.TubeGeometry(curve,56,width,5,false),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending}));line.userData.opacityScale=opacity;o.add(line);}
   for(let i=0;i<32;i++){const f=(i+.5)/32,point=curve.getPoint(f),height=.45+(i*17%13)*.055,flame=new T.Sprite(new T.SpriteMaterial({map:this.bloodflameTexture(),color:0xffa875,transparent:true,opacity:.72,depthWrite:false,blending:T.AdditiveBlending}));flame.position.copy(point);flame.position.y+=height*.30;flame.position.z+=Math.sin(i*7)*.08;flame.scale.set(.22+(i%4)*.05,height,1);flame.userData.opacityScale=.72;flame.userData.fire={base:flame.position.y,height,phase:i*2.4};o.add(flame);}
   this.scene.add(o);this.items.push({o,life:1,max:1,opacity:1,kind:'bloodflame'});
 }
 bloodflameBlast(pos,yaw){
   for(let i=0;i<26;i++){
     const a=i*2.39996,width=.22+(i%5)*.05,height=.8+(i%7)*.15;
     const o=new T.Sprite(new T.SpriteMaterial({map:this.bloodflameTexture(),color:i%3?0xff6e35:0xffd093,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
     o.position.copy(pos).add(new T.Vector3(Math.sin(a)*(.3+i%4*.35),.45+(i%5)*.12,Math.cos(a)*(.3+i%4*.35)));o.scale.set(width,height,1);this.scene.add(o);
     const life=.5+(i%5)*.1;this.items.push({o,vel:new T.Vector3(Math.sin(a)*.8,.7+(i%3)*.2,Math.cos(a)*.8),life,max:life,opacity:.9,kind:'particle'});
   }
   this.burst(pos.clone().add(new T.Vector3(0,.9,0)),'blood',36);
 }
 defeatAsh(pos,yaw,pulse){
   // Cool ash tears free of the raised shoulders as the chest dissolves.
   for(let i=0;i<4;i++){
     const seed=pulse*4+i,theta=seed*2.399963,span=.32+(seed%7)*.16;
     const local=new T.Vector3(Math.cos(theta)*span,2.44+((seed*7)%13)*.13,-.68+Math.sin(theta)*span*.70);
     local.applyAxisAngle(new T.Vector3(0,1,0),yaw);
     const smoke=new T.Sprite(new T.SpriteMaterial({map:this.cloudTexture,color:i===3?0xd6d5ce:seed%2?0xa8bcc8:0x728590,transparent:true,depthWrite:false}));
     smoke.position.copy(pos).add(local);smoke.scale.setScalar(.85+(seed%5)*.24);
     const life=1.18+(seed%6)*.13;
     this.scene.add(smoke);this.items.push({o:smoke,vel:new T.Vector3(local.x*.65,.49+(seed%5)*.13,local.z*.45),life,max:life,opacity:.68,kind:'ash'});
   }
 }
 deathAsh(pos){
   for(let i=0;i<12;i++){const o=new T.Sprite(new T.SpriteMaterial({map:this.cloudTexture,color:0xc7c9bd,transparent:true,opacity:.3,depthWrite:false}));o.position.copy(pos).add(new T.Vector3(Math.sin(i*2.4)*.65,.12+(i%4)*.11,Math.cos(i*2.4)*.55));o.scale.setScalar(.3+(i%3)*.16);this.scene.add(o);this.items.push({o,vel:new T.Vector3(.12+Math.sin(i)*.08,.2+(i%4)*.08,Math.cos(i)*.08),life:2.4,max:2.4,opacity:.3,kind:'ash'});}
 }
 keepImpact(item){
  item.initialOpacity=new Map();
  item.o.traverse(part=>{if(part.material)item.initialOpacity.set(part.material,part.material.opacity);});
  return item;
 }
 reuseImpact(item,pos,yaw){
  if(!item||item.o.parent)return false;
  item.life=item.max;item.o.position.copy(pos);item.o.rotation.y=yaw;
  for(const [material,opacity] of item.initialOpacity)material.opacity=opacity;
  item.o.userData.updateEruption?.(0);
  this.scene.add(item.o);this.items.push(item);
  return true;
 }
 lightning(pos){
  if(this.reuseImpact(this.warmLightning,pos,0))return;
  const segments=[];for(let i=0;i<14;i++){const a=i*2.39996;for(let j=0;j<9;j++){const pair=[];for(const k of [j,j+1]){const f=k/9;pair.push(new T.Vector3(Math.sin(a)*f*4+Math.sin(k*7+i)*.22,.5+Math.cos(a)*f*3+Math.cos(k*11+i)*.2,Math.cos(a*2)*f*3+Math.sin(k*5)*.18));}segments.push(pair);}}
  // The old single-pixel lines vanished at normal gameplay resolution.
  // Keep the same branch paths, with a bright core and a translucent violet edge.
  const group=new T.Group(),transform=new T.Object3D(),up=new T.Vector3(0,1,0);group.position.copy(pos);
  for(const [width,color,opacity]of [[.012,0xf0d8ff,.95],[.055,0xa16aff,.20]]){
   const mesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,5),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending}),segments.length);
   for(let i=0;i<segments.length;i++){const [a,b]=segments[i],direction=b.clone().sub(a);transform.position.copy(a).add(b).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(up,direction.clone().normalize());transform.scale.set(width,direction.length(),width);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}
   mesh.userData.opacityScale=opacity;mesh.computeBoundingSphere();group.add(mesh);
  }
  this.scene.add(group);this.items.push({o:group,life:.7,max:.7,kind:'ray'});
 }
 crossRays(pos,yaw){for(const sign of [-1,1]){const direction=new T.Vector3(sign*.85,sign*.3,-1).normalize().applyAxisAngle(new T.Vector3(0,1,0),yaw);for(const [width,opacity] of [[.025,.95],[.075,.16]]){const o=new T.Mesh(new T.CylinderGeometry(width,width,18,5),new T.MeshBasicMaterial({color:0xfff5d7,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending}));o.position.copy(pos).addScaledVector(direction,6);o.position.y+=1.4;o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);this.scene.add(o);this.items.push({o,life:.65,max:.65,opacity,kind:'ray'});}}}

 lightBarrage(pos,yaw,duration,hovering=false){const o=createHolyBarrage(pos,yaw,this.cloudTexture,hovering);this.scene.add(o);this.items.push({o,life:duration,max:duration,kind:'barrage'});}
 // One light-speed pass (primary clip 68.40-71.33): a hair-thin line through `center` along `direction`.
 lightTrace(center,direction,seed=0,heightAt){const o=createLightTrace(center,direction,seed,this.cloudTexture,{heightAt,live:this.liveUpdates}),life=o.userData.life;this.scene.add(o);this.items.push({o,life,max:life,kind:'light-trace',flux:0});}
 meteorEjecta(pos){
   const effect=createMeteorEjecta(pos,this.cloudTexture);
   this.scene.add(effect.o);this.items.push(effect);
 }
 rockImpact(pos,index,spread=1){
   this.rockContacts??=new Map();
   const cached=this.rockContacts.get(index);
   if(this.reuseImpact(cached,pos,0)){
     cached.o.scale.set(spread,1,spread);cached.o.userData.updateRockImpact(0);return;
   }
   const effect=createRockImpact(pos,index,this.iceCloudTexture());
   effect.o.scale.set(spread,1,spread);
   if(!cached)this.rockContacts.set(index,this.keepImpact(effect));
   this.scene.add(effect.o);this.items.push(effect);
 }
 landingThreads(pos,yaw){
  const group=new T.Group();group.position.copy(pos);group.rotation.y=yaw;
  const transform=new T.Object3D(),up=new T.Vector3(0,1,0);
  const count=9;
  for(const [width,opacity,color] of [[.012,.78,0xfff9d7],[.045,.17,0xffcf78]]){
   const material=new T.MeshBasicMaterial({color,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
   const lines=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,5),material,count);
   for(let i=0;i<count;i++){
    const a=i*2.39996,r=2.6+(i%4)*.92;
    const flank=i%2?1:-1;
    transform.position.set(flank*(r+.85),.32+(i%4)*.34,Math.cos(a)*r);
    transform.quaternion.setFromUnitVectors(up,new T.Vector3(flank,.025+(i%3-1)*.047,.14*Math.sin(a)).normalize());
    transform.scale.set(width,2.2+(i*7)%5,width);
    transform.updateMatrix();lines.setMatrixAt(i,transform.matrix);
   }
   lines.computeBoundingSphere();lines.userData.opacityScale=opacity;group.add(lines);
  }
  this.scene.add(group);this.items.push({o:group,kind:'landing-rays',life:.72,max:.72,opacity:.90});
 }
 removeItem(p){
  this.scene.remove(p.o);
  if(p.initialOpacity)return;
  if(p.o.userData.releaseGhost)p.o.userData.releaseGhost();
  else p.o.traverse(o=>{if(!o.userData.sharedGhostGeometry)o.geometry?.dispose();if(o.isInstancedMesh)o.dispose();o.skeleton?.dispose();o.material?.dispose();});
 }
 clear(){for(const p of this.items){this.removeItem(p);}this.items.length=0;this.impactLight.intensity=0;this.flashPulse=null;this.wash=0;for(const light of this.holyLights)light.intensity=0;}
 // A burst that fills the arena for a moment (primary clip 71.40-71.85): the whole floor and everything on it
 // turn white-gold, hold, then decay.
 arenaFlash(pos,hold=.34,fall=.5,gain=.62,nearCamera=false){this.flashPulse={pos:pos.clone(),age:0,hold,fall,gain,nearCamera};}
 pillar(pos,delay=0,width=1,duration=1.22,from=null,pairedLanding=false,options={}){
   // Primary holy eruptions have a bright spine, broken golden spray and a
   // soft widening foot. Their onset remains tied to the existing contact.
   const group=new T.Group();group.position.copy(pos);group.scale.set(width,1,width);group.visible=false;
   if(from){
     const reach=from.clone().sub(pos);reach.y=0;
     if(reach.lengthSq()>.01){
       reach.normalize().multiplyScalar(10);reach.y=3.15;
       group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),reach.normalize());
       group.scale.y=.36;
     }
   }
   const sleeves=[];let spine;
   const pulseTime={value:0},variation=.5+.5*Math.sin(pos.x*1.19+pos.z*.71);
   const secondary=options.gain!==undefined;
   const heightFactor=from?1:secondary?.46+.55*variation:.74+.44*variation;
   for(const [width,opacity,color,height] of [[.060,1,0xfff6d6,40],[.25,.34,0xffce68,40],[.85,.075,0xffad52,38]]){
     const material=new T.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending});
     material.color.multiplyScalar(width<.85?1.24:1.62);
     // Main102-104 s: thin bright spines with soft gold fringes. The old
     // solid cylinder silhouette produced hard rectangular panels near camera.
     material.onBeforeCompile=shader=>{
       shader.uniforms.holyPulseTime=pulseTime;
       const varyings='varying vec3 pillarNormal;varying vec3 pillarView;varying float pillarHeight,pillarAz;uniform float holyPulseTime;\n';
       shader.vertexShader=varyings+shader.vertexShader;
       shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\npillarNormal=normalMatrix*normal;pillarView=-mvPosition.xyz;pillarHeight=uv.y;pillarAz=uv.x;');
       shader.fragmentShader=varyings+shader.fragmentShader;
       shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float pillarEdge=pow(abs(dot(normalize(pillarNormal),normalize(pillarView))),1.7);
         float fiber=.5+.5*sin(pillarAz*75.398+1.2*sin(pillarHeight*8.-holyPulseTime*3.));
         float dust=.5+.5*sin(pillarHeight*21.-4.*holyPulseTime+pillarAz*12.57);
         float skirt=exp(-pillarHeight*9.);
         diffuseColor.a*=pillarEdge*(.70+.30*fiber+.42*skirt*dust)*smoothstep(0.,.007,pillarHeight)*(1.-smoothstep(.83,1.,pillarHeight));
         outgoingLight*=mix(vec3(1.22,.91,.63),vec3(1.03,1.,.99),smoothstep(.0,.20,pillarHeight));
         #include <opaque_fragment>`);
     };
     material.customProgramCacheKey=()=> 'wind-cut-holy-pillar';
     const breadth=width>.1?.94+.88*variation:1;
     const shaftHeight=height*heightFactor;
     const profile=[[0,1.65],[.025,1.22],[.09,.71],[.28,.60],[.57,.73],[.84,.53],[1,.28]];
     const surface=new T.LatheGeometry(profile.map(([y,r])=>new T.Vector2(width*breadth*r,(y-.5)*shaftHeight)),20);
     const shaftPoints=surface.attributes.position;
     for(let k=0;k<shaftPoints.count;k++){
       const y=shaftPoints.getY(k),s=y/shaftHeight+.5;
       const bend=width*(.42+.75*variation)*Math.sin(Math.PI*s)*Math.sin(7*s+variation*8);
       shaftPoints.setX(k,shaftPoints.getX(k)+bend);shaftPoints.setZ(k,shaftPoints.getZ(k)+bend*.52);
     }
     surface.computeVertexNormals();
     const o=new T.Mesh(surface,material);o.position.y=shaftHeight*.5;o.userData.opacityScale=opacity;group.add(o);
     o.userData.restOpacity=opacity;
     if(width>.1)sleeves.push(o);else spine=o;
   }
   const glow=new T.Sprite(new T.SpriteMaterial({map:this.cloudTexture,color:0xffd591,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));glow.position.y=.28;glow.scale.set(3.0,1.4,1);glow.userData.opacityScale=.42;group.add(glow);
   let filaments=null;
   if(!from){
     const count=pairedLanding?4:2,unit=new T.Object3D();
     const material=new T.MeshBasicMaterial({color:0xffdf99,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending});
     filaments=new T.InstancedMesh(new T.CylinderGeometry(.009,.018,1,5),material,count);
     for(let i=0;i<count;i++){
       const a=i*2.39996+pos.x*.67-pos.z*.28,r=.16+.32*(i+1)/count,h=16+(i*11%17);
       unit.position.set(Math.cos(a)*r,h*.5,Math.sin(a)*r);unit.rotation.set((i%2?1:-1)*.009,0,.012*Math.sin(a));
       unit.scale.set(1,h,1);unit.updateMatrix();filaments.setMatrixAt(i,unit.matrix);
     }
     filaments.computeBoundingSphere();group.add(filaments);
   }
   const particles=createColumnParticles(pos.x*.37+pos.z*.71,duration,width>=2.5);
   const particleGain=secondary?options.gain*(.38+.38*variation):1;
   particles.material.uniforms.opacity.value=particleGain;
   group.add(particles);
   group.userData.updatePillar=(t,view)=>{group.visible=t>=0;if(t<0)return;
    pulseTime.value=t;
    const linger=1-.79*T.MathUtils.smoothstep(t,.16,.64);
    // Small strikes leave foot sparks. Only a few spines persist through
    // the full height of the shot after the area flash has passed.
    const envelope=secondary
      ? (1-T.MathUtils.smoothstep(t,options.hold??.25,duration*(.61+.23*variation)))*(.57+.43*variation)
      : 1-T.MathUtils.smoothstep(t,options.hold??.25,duration);
    const collapse=pairedLanding?1.-T.MathUtils.smoothstep(t,.60,1.25):1.;
    const beam=T.MathUtils.smoothstep(t,0,secondary?.045:.095)*envelope*collapse*(options.gain??1);
    // The particle tail outlives the shaft. Once its additive opacity is
    // zero the large shells, filaments and foot sprite contribute no pixels.
    if(this.cacheSpells){
      const lit=beam>0;
      spine.visible=glow.visible=lit;
      if(filaments)filaments.visible=lit;
      for(const sleeve of sleeves)sleeve.visible=lit;
    }
    group.userData.pillarFlux=beam*width;
    particles.userData.update(t);
    particles.material.uniforms.opacity.value=particleGain*(.32+.68*view);
    spine.userData.opacityScale=beam*(.17+.83*view)*(options.coreGain??1);
    if(filaments)filaments.userData.opacityScale=beam*(pairedLanding?.60:.38)*T.MathUtils.smoothstep(t,.08,.22)*(1-T.MathUtils.smoothstep(t,.53,1.08))*(.24+.76*view);
    if(pairedLanding){
      const narrow=1-.72*T.MathUtils.smoothstep(t,.20,.70);
      spine.scale.set(narrow,1,narrow);
    }
    for(const sleeve of sleeves){
      sleeve.scale.set(linger,1,linger);
      sleeve.userData.opacityScale=beam*sleeve.userData.restOpacity*(.035+.965*view);
    }
    glow.userData.opacityScale=beam*.42*linger*(.25+.75*view);
   };
   this.scene.add(group);this.items.push({o:group,life:duration+delay+1.1,max:duration+1.1,delay,width,opacity:1,kind:'pillar'});
 }
 greatColumn(pos,radius){
  if(this.warmGreatColumn?.width===radius&&this.reuseImpact(this.warmGreatColumn,pos,0))return;
  const group=new T.Group();group.name='great-holy-column';group.position.copy(pos);
  // A single area-scale core, distinct from the narrow follow-up shafts.
  for(const [fraction,power,color] of [[.34,1.7,0xfffae7],[.69,.84,0xffe59c],[1,.37,0xffcc61]]){
   const r=radius*fraction,h=84;
   const mat=new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(2),side:T.DoubleSide,forceSinglePass:true,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false});
   mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 coreN;varying vec3 coreView;varying vec2 coreUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ncoreN=normalMatrix*normal;coreView=-mvPosition.xyz;coreUV=uv;');
    shader.fragmentShader='varying vec3 coreN;varying vec3 coreView;varying vec2 coreUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float feather=pow(abs(dot(normalize(coreN),normalize(coreView))),.82);
    float folds=.76+.24*sin(coreUV.x*94.25+sin(coreUV.y*9.))*sin(coreUV.x*56.55);
    diffuseColor.a*=feather*folds*(1.-smoothstep(.85,1.,coreUV.y));
#include <opaque_fragment>`);
   };mat.customProgramCacheKey=()=> 'great-holy-column-z';
   const mesh=new T.Mesh(new T.CylinderGeometry(r*.92,r,h,40,1,true),mat);mesh.position.y=h*.5;mesh.userData.opacityScale=power;group.add(mesh);
  }
  this.scene.add(group);this.items.push({o:group,kind:'holy-core',life:1.1,max:1.1,width:radius});
 }
 holyImpact(pos,radius,bladeLanding=false,groundDelay=0){
  // Primary 105.9-106.4: the landing lights the ground between the spires for
  // a short flash; the subsequent airborne needles outlast the ground flare.
  const o=new T.Group();o.position.copy(pos);
  const glow=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:this.cloudTexture,color:new T.Color(2.6,1.85,.76),transparent:true,opacity:0,side:T.DoubleSide,blending:T.AdditiveBlending,depthWrite:false}));
  glow.rotation.x=-Math.PI/2;glow.position.y=.18;glow.userData.opacityScale=1;o.add(glow);
  const plume=new T.Sprite(new T.SpriteMaterial({map:this.cloudTexture,color:new T.Color(2.8,2.36,1.49),transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));
  plume.position.y=1.4;plume.userData.opacityScale=.87;o.add(plume);
  o.userData.updateFlash=t=>{const u=T.MathUtils.smoothstep(t,0,.23);
   glow.scale.setScalar(radius*(.33+.89*u));plume.scale.set(radius*(.6+1.45*u),bladeLanding ? .42+.45*u : 2.2+2.7*u,1);
   if(bladeLanding)plume.position.y=.32;
   return (1-T.MathUtils.smoothstep(t,.13,.52))*T.MathUtils.smoothstep(t,radius>10?.035:0,radius>10?.15:.055);
  };
  const broad=radius>10;
  const sparks=new T.BufferGeometry(),vertices=[],colors=[];
  for(let i=0;i<(broad?370:210);i++){
    const a=i*2.39996,r=(.12+.88*Math.sqrt((i*71%373)/373))*radius*(broad?2.0:1.2);
    vertices.push(Math.sin(a)*r,.12+Math.pow((i*47%181)/181,2)*(broad?7:4),Math.cos(a)*r);
    const shade=.45+.55*(i%5)/4;colors.push(shade,shade*.78,shade*.39);
  }
  sparks.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  sparks.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const motes=new T.Points(sparks,new T.PointsMaterial({map:this.cloudTexture,vertexColors:true,size:broad?.20:.13,blending:T.AdditiveBlending,transparent:true,depthWrite:false}));
  o.add(motes);
  const initialFlash=o.userData.updateFlash;
  o.userData.updateFlash=t=>{
    const burst=initialFlash(Math.max(0,t-groundDelay));
    const tail=(1-T.MathUtils.smoothstep(t,.23,broad?1.48:.97))*T.MathUtils.smoothstep(t,0,.035);
    glow.userData.opacityScale=burst;plume.userData.opacityScale=(bladeLanding?.54:.87)*burst;
    motes.userData.opacityScale=tail;
    motes.position.y=t*(broad?.72:1.14);motes.scale.set(1+t*.13,1+t*.21,1+t*.13);
    return 1;
  };
  this.scene.add(o);this.items.push({o,kind:'holy-impact',life:(broad?1.48:.97)+groundDelay,max:(broad?1.48:.97)+groundDelay,radius,groundDelay});
 }
 nova(pos,duration){
   if(this.warmNova?.max===duration&&this.reuseImpact(this.warmNova,pos,0)){
     this.warmNova.o.userData.updateMarker(0);return;
   }
   const o=new T.Group();o.position.copy(pos);o.name='holy-ground-marker';
   const rings=[];
   for(let i=0;i<6;i++){
     const radius=.84+i*.35,span=i<2?Math.PI*2:Math.PI*(1.25+(i%3)*.19);
     const arc=new T.Mesh(new T.RingGeometry(radius,radius+(i===0?.075:.032),72,1,i*1.84,span),
       new T.MeshBasicMaterial({color:new T.Color(2.3,1.71,.71),transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));
     arc.rotation.x=-Math.PI/2;arc.position.y=.17+i*.012;o.add(arc);rings.push(arc);
   }
   o.userData.updateMarker=t=>{
     rings.forEach((arc,i)=>{
       const age=Math.max(0,t-i*.05),u=T.MathUtils.smoothstep(age,0,.56);
       const r=.62+u*(1.18+i*.028)+age*.21;
       arc.scale.set(r,r,1);arc.rotation.z=i*.47+age*(i%2?-.73:.82);
       arc.userData.opacityScale=T.MathUtils.smoothstep(age,0,.12)*(1-T.MathUtils.smoothstep(t,.66,duration))*(i===0?1.2:.82);
     });
   };
   o.userData.updateMarker(0);this.scene.add(o);this.items.push({o,life:duration,max:duration,kind:'nova'});
 }
 ring(pos){
   if(this.reuseImpact(this.warmRing,pos,0)){
     this.warmRing.o.position.y+=1.1;this.warmRing.o.scale.set(1,1,1);return;
   }
   const o=new T.Group();o.position.copy(pos);o.position.y+=1.1;
   for(const [width,opacity] of [[.018,.9],[.07,.16]]){const band=new T.Mesh(new T.TorusGeometry(1,width,5,96),new T.MeshBasicMaterial({color:0xffefbc,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending}));band.userData.opacityScale=opacity/.9;band.rotation.x=-Math.PI/2;o.add(band);}
   this.scene.add(o);this.items.push({o,life:2,max:2,opacity:.7,kind:'ring'});
 }
 afterimage(pos,yaw,actor,mode='down',origin=null,index=0){
   const o=actor.ghost(pos,yaw),target=pos.clone(),from=origin?origin.clone():target.clone();
   if(!origin){if(mode==='side')from.add(new T.Vector3(Math.sin(yaw)*3.6,0,Math.cos(yaw)*3.6));else from.y+=3.6;}
   const gateStrike=mode==='down'&&!!origin;
   o.position.copy(from);this.scene.add(o);o.userData.beginGhostStrike?.(mode,index,gateStrike);
   o.userData.phantomWake?.(0,gateStrike);
   const life=gateStrike?ROCK_RETURN.strokeLife[index]:.46;
   const fadeTime=gateStrike&&index===3?ROCK_RETURN.lastFade:.055;
   this.items.push({o,from,target,gateStrike,fadeTime,travel:gateStrike?.115:mode==='side'?.3:.13,life,max:life,opacity:origin ? .40 : .32,kind:'ghost'});
   if(mode==='side')this.crossRays(pos,yaw);
 }

 impactDust(pos,radius,yaw=0,plunge=false){
   const positions=[],velocities=[],seeds=[];
   const count=plunge?88:36;
   for(let i=0;i<count;i++){
     const forward=plunge&&i%3!==0;
     const a=forward?yaw+Math.PI+(i%2?1:-1)*(.35+(i*7%23)/23*.88):yaw+i*2.399963;
     const r=.11+(i*7%31)/31*radius*(plunge?.46:.22);
     const lift=plunge?(i%7)*.115:0;
     positions.push(Math.sin(a)*r,.04+(i%4)*.035+lift,Math.cos(a)*r);
     const speed=radius*(.35+(i*11%29)/29*.89);
     velocities.push(Math.sin(a)*speed,(forward?2.9:.8)+(i%7)*(forward?.52:.31),Math.cos(a)*speed);seeds.push(i*.79);
   }
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
   g.setAttribute('velocity',new T.Float32BufferAttribute(velocities,3));g.setAttribute('phase',new T.Float32BufferAttribute(seeds,1));
   const m=new T.ShaderMaterial({uniforms:{age:{value:0},shape:{value:this.cloudTexture},extent:{value:radius},plunge:{value:plunge?1:0}},transparent:true,depthWrite:false,
    vertexShader:`uniform float age,extent,plunge;attribute vec3 velocity;attribute float phase;varying float fade,shade;
      void main(){float t=max(0.,age-mix(.023,.009,plunge)*mod(phase,4.));vec3 p=position+velocity*t/(1.+t*mix(1.5,1.08,plunge));p.y=max(.04,p.y-.63*t*t);
        vec4 v=modelViewMatrix*vec4(p,1.);shade=fract(phase*2.3);fade=smoothstep(0.,mix(.085,.018,plunge),t)*(1.-smoothstep(.33,.99+.23*plunge,t));
        gl_Position=projectionMatrix*v;gl_PointSize=clamp((145.+extent*(26.+19.*plunge))*(.8+t*.75)/max(.1,-v.z),2.,83.+25.*plunge);}`,
    fragmentShader:`uniform sampler2D shape;varying float fade,shade;void main(){vec4 puff=texture2D(shape,gl_PointCoord);gl_FragColor=vec4(mix(vec3(.20,.17,.121),vec3(.68,.58,.37),shade),puff.a*fade*.65);}`});
   const o=new T.Points(g,m);o.position.copy(pos);o.frustumCulled=false;this.scene.add(o);
   const life=plunge?1.26:1.03;this.items.push({o,life,max:life,kind:'ground-dust'});
 }

 groundSpikes(pos,yaw=0,radius=4.6,gravity=false,lowBreak=false,opening=false){
  if(gravity&&!lowBreak&&radius===5.6&&this.reuseImpact(opening?this.warmOpeningGround:this.warmRushGround,pos,yaw))return;
   // Selected stomp at 44-46 s: tall dark shards remain during the sword tell,
   // with smaller fragments suspended above them. This is a contact effect.
   const group=new T.Group();group.position.copy(pos);group.rotation.y=yaw;
   if(!this.eruptionTexture){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);
     for(let y=0;y<128;y++)for(let x=0;x<128;x++){const n=Math.sin(x*12.9898+y*78.233)*43758.5453,grain=n-Math.floor(n),cell=Math.sin(Math.floor(x/11)*37.17+Math.floor(y/13)*61.7)*17171.31,coarse=cell-Math.floor(cell),fracture=Math.abs(Math.sin(x*.071+y*.119+Math.sin(x*.035)*1.8)),v=100+grain*65+coarse*35-(fracture<.08?45:0),i=(y*128+x)*4;pixels.data[i]=v;pixels.data[i+1]=v*.96;pixels.data[i+2]=v*.91;pixels.data[i+3]=255;}
     ctx.putImageData(pixels,0,0);this.eruptionTexture=new T.CanvasTexture(canvas);this.eruptionTexture.colorSpace=T.SRGBColorSpace;this.eruptionTexture.wrapS=this.eruptionTexture.wrapT=T.RepeatWrapping;
   }
   // Fractured broad planes, not radial pointed cones (primary 10.25 / 44.5 s).
   let geometry;
   if(gravity)geometry=createGravitySlab(opening);
   else{
     // A sheared limestone flake has a broad broken bed and an oblique lip.
     // Its uneven shoulders also break up the much smaller airborne chips.
     const edge=[[-1,-.28],[-.76,-.82],[.21,-.94],[.96,-.37],[.74,.52],[-.18,.91],[-.88,.63]];
     const verts=[],uv=[],faces=[];
     for(let ring=0;ring<3;ring++)for(let i=0;i<edge.length;i++){
       const [x,z]=edge[i],jag=Math.sin(i*4.82),scale=ring===0?.70:ring===1?1:.58+.15*jag;
       const y=ring===0?-.18:ring===1?.25+.14*jag:.74-.31*x+.16*jag;
       verts.push(x*scale+.20*ring,y,z*scale-.09*ring);uv.push(x*.7+.25*y,z*.7+y*.24);
       const next=(i+1)%edge.length,base=ring*edge.length;
       if(ring<2)faces.push(base+i,base+i+7,base+next,base+next,base+i+7,base+next+7);
       if(ring===2&&i>0&&i<6)faces.push(base,base+i+1,base+i);
       if(ring===0&&i>0&&i<6)faces.push(0,i,i+1);
     }
     const indexed=new T.BufferGeometry();
     indexed.setAttribute('position',new T.Float32BufferAttribute(verts,3));indexed.setAttribute('uv',new T.Float32BufferAttribute(uv,2));indexed.setIndex(faces);
     geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
   }
   const slabCount=opening?83:21,chipCount=opening?574:36;
   const shards=new T.InstancedMesh(geometry,new T.MeshStandardMaterial({map:this.eruptionTexture,color:opening?0x4f4c56:gravity?0x797676:0x898176,emissive:gravity?0x34263b:0x28251e,emissiveIntensity:gravity?.19:.14,roughness:.97,flatShading:true,side:T.DoubleSide,transparent:true}),slabCount);
   // A chip has a flat bedding plane and a freshly chipped, skew upper lip.
   // Orient the broken face independently of the broad slabs left in the ash.
   const chipPoints=[[-.92,-.23,-.43],[.48,-.19,-.62],[.94,-.15,.29],[-.40,-.21,.66],
     [-.65,.14,-.20],[.24,.38,-.40],[.70,.12,.19],[-.28,.20,.52]];
   const chipFaces=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
   const chipGeometry=new T.BufferGeometry();
   chipGeometry.setAttribute('position',new T.Float32BufferAttribute(chipFaces.flatMap(i=>chipPoints[i]),3));
   chipGeometry.setAttribute('uv',new T.Float32BufferAttribute(chipFaces.flatMap(i=>[chipPoints[i][0]*.5+.5,chipPoints[i][2]*.5+.5]),2));
   chipGeometry.computeVertexNormals();
   const fragments=new T.InstancedMesh(chipGeometry,new T.MeshStandardMaterial({map:this.eruptionTexture,color:opening?0x696570:gravity?0x80786f:0x96958c,roughness:.95,flatShading:true,transparent:true}),chipCount);
   if(opening){
     shards.material.onBeforeCompile=shader=>{
       shader.vertexShader='varying vec3 slabLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>',
         '#include <begin_vertex>\nslabLocal=position;');
       shader.fragmentShader='varying vec3 slabLocal;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
         float bedding=sin(slabLocal.y*27.+2.6*sin(slabLocal.x*3.7+slabLocal.z*4.1));
         float vein=smoothstep(.76,.98,bedding)*smoothstep(-.55,.61,sin(2.4*slabLocal.x+9.*slabLocal.y));
         float raked=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);
         float fractureFace=smoothstep(-.24,.84,dot(normal,normalize(vec3(.46,.68,.56))));
         vec3 p=slabLocal*vec3(15.,26.,19.);
         float stoneNoise=texture2D(map,p.xy*.21+p.zy*.14).r;
         float speck=texture2D(map,p.zy*1.37+p.xy*.31).r;
         float catching=smoothstep(.19,.53,stoneNoise+.27*speck)*fractureFace;
         outgoingLight*=.46+.42*stoneNoise;
         outgoingLight+=vec3(.093,.088,.086)*catching*(.20+.80*speck)
           +vec3(.052,.043,.058)*vein*(.35+.65*raked)+vec3(.030,.026,.037)*raked;
         #include <opaque_fragment>`);
     };
   }
   if(!gravity)shards.material.color.setHex(0x96958f);
   // Eruption fragments between the eye and the player must not turn the
   // foreground into an opaque wall. Preserve the actual effect everywhere else.
   for(const material of opening?[]:[shards.material,fragments.material]){
    material.onBeforeCompile=shader=>{
     Object.assign(shader.uniforms,{effectEye:this.sight.eye,effectFocus:this.sight.focus});
     shader.vertexShader='varying vec3 effectWorld;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 effectPoint=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      effectPoint=instanceMatrix*effectPoint;
      #endif
      effectWorld=(modelMatrix*effectPoint).xyz;`);
     shader.fragmentShader='varying vec3 effectWorld;uniform vec3 effectEye;uniform vec3 effectFocus;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      vec3 ray=effectFocus-effectEye;float len=length(ray);vec3 dir=ray/max(.01,len);float along=dot(effectWorld-effectEye,dir);
      float across=length(effectWorld-effectEye-dir*along);
      if(along>0.&&along<len-.18&&across<.65)discard;`);
    };material.customProgramCacheKey=()=> 'eruption-player-visibility-w';
   }
   shards.frustumCulled=false;fragments.frustumCulled=false;group.add(shards,fragments);
   const transform=new T.Object3D(),stones=[],roots=[];
   for(let i=0;i<slabCount;i++){
     const angle=i*2.399963,r=1.65+(i*7%13)/13*(radius-1.65),width=.30+(i*3%7)*.06,height=(.75+(i*5%11)*.20)*(gravity?1.15:1)*(Math.cos(angle)<-.55&&Math.abs(Math.sin(angle))<.45?.45:1);
     roots.push({x:Math.sin(angle)*r,z:Math.cos(angle)*r,width:lowBreak?width*1.37:width,height:lowBreak?height*.24:height,leanX:Math.cos(angle)*.16,leanZ:-Math.sin(angle)*.16,turn:angle});
     if(opening){
       const root=roots[i],fan=(i%7)*.79-2.38;
       const spread=fan+.28*Math.sin(i*2.79);
       const distance=i<59?1.04+(i*17%53)/52*8.9:10.1+(i*19%31)/30*9.7;
       root.x=Math.sin(spread)*distance;
       root.z=Math.cos(spread)*distance+.5;
       root.turn=spread+.63*Math.sin(i*1.76);
       const leader=i%8===0||i%15===3;
       root.width=leader?.53+.38*Math.abs(Math.sin(i*2.3)):.20+.36*((i*7)%13)/12;
       root.height=leader?2.8+1.71*Math.abs(Math.cos(i*1.9)):.61+1.86*((i*11)%23)/22;
       if(i===0){
         // A broad sheet shears off the outer lip, between the impact and the player.
         root.x=-4.28;root.z=-3.73;root.turn=.79;root.width=.74;root.height=3.22;
       }else if(i===3||i===8||i===16||i===24){
         const [x,z,h,w,heading]=i===3?[-6.0,-2.3,5.8,.38,-.73]:i===8?[-3.1,-2.1,6.2,.42,-.41]:
           i===16?[-1.6,-4.8,6.9,.44,.52]:[1.7,-5.3,5.6,.32,.70];
         Object.assign(root,{x,z,height:h,width:w,turn:heading,hold:.57});
       }else if(i>=59){
         root.height*=.58+.35*Math.abs(Math.cos(i*2.71));root.width*=.74;
       }
       const mineral=.58+.42*((i*17)%29)/28;
       const shade=i===0?.30:mineral;
       shards.setColorAt(i,new T.Color(shade*.95,shade*.94,shade));
     }
     if(!gravity){
       const s=roots[i],cluster=Math.floor(i/7),bearing=[-1.26,-.35,1.13][cluster]+.24*Math.sin(i*4.7);
       const reach=.56+(i%7)*radius*.139+.21*Math.cos(i*1.8);
       s.x=Math.sin(bearing)*reach;s.z=Math.cos(bearing)*reach;
       s.height*=.26+.43*Math.pow(Math.max(0,1-Math.abs(i%7-2)/4),2);
       s.width*=1.12+.6*Math.abs(Math.sin(i*3.4));s.turn+=bearing;
       s.leanX+=.42*Math.cos(bearing);s.leanZ-=.55*Math.sin(bearing);
       s.delay=reach*.040;
       const shade=.68+.32*((i*11)%19)/18;shards.setColorAt(i,new T.Color(shade,shade*.992,shade*.96));
     }
   }
   const fractures=gravity?createFractureLightning(roots):null;
   if(fractures)group.add(fractures);
   for(let i=0;i<chipCount;i++){const angle=i*2.399963,r=1.5+(i*11%31)/31*radius*(opening?1.91:1);const distance=opening&&i>=438?9.8+(i*23%41)/40*10.4:r;stones.push({x:Math.sin(angle)*distance,z:Math.cos(angle)*distance,height:.7+(i*7%17)*.17,size:.07+(i%5)*.035,phase:i*1.7});}
   if(opening)for(let i=0;i<chipCount;i++){
     const stoneTone=.39+.57*((i*31)%73)/72;
     fragments.setColorAt(i,new T.Color(stoneTone,stoneTone*(i%5===0?.86:.95),stoneTone*(i%7===0?1.08:.98)));
   }
   // Opening debris shares one clock. Ballistics, tumble and the second bounce
   // are evaluated per instance without rebuilding hundreds of matrices on the CPU.
   const chipClock={value:0};
   if(opening){
     const launch=[],proportions=[];
     for(let i=0;i<stones.length;i++){
       const s=stones[i],size=s.size*(i%27===0?2.58:i%8===0?1.58:.51+((i*13)%17)/27);
       launch.push(s.x,s.z,3.6+s.height*1.62,s.phase);
       proportions.push(size*(.94+(i%5)*.27),size*(.71+(i%7)*.12),size*(.61+(i%4)*.15),i%6);
     }
     chipGeometry.setAttribute('chipLaunch',new T.InstancedBufferAttribute(new Float32Array(launch),4));
     chipGeometry.setAttribute('chipSize',new T.InstancedBufferAttribute(new Float32Array(proportions),4));
     fragments.material.onBeforeCompile=shader=>{
       shader.uniforms.chipClock=chipClock;
       shader.vertexShader='uniform float chipClock;attribute vec4 chipLaunch,chipSize;\n'+shader.vertexShader;
       shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
         float t=max(0.,chipClock-.026*chipSize.w),speed=chipLaunch.z,hit=2.*speed/14.6;
         float after=max(0.,t-hit),height=t<hit?t*(speed-7.3*t):max(0.,after*(speed*.22-7.3*after));
         float travel=.22+.70*min(t,hit)+.15*min(after,.34),spin=min(t,hit)+min(after,.24)*.45;
         vec3 angles=chipLaunch.w*vec3(1.,.7,.31)+spin*vec3(2.1+mod(float(gl_InstanceID),5.),-2.3,3.8);
         vec3 c=cos(angles),s=sin(angles);
         mat3 rot=mat3(c.y*c.z,c.x*s.z+s.x*c.z*s.y,s.x*s.z-c.x*c.z*s.y,
           -c.y*s.z,c.x*c.z-s.x*s.z*s.y,s.x*c.z+c.x*s.z*s.y,s.y,-s.x*c.y,c.x*c.y);
         float fade=clamp((after-.18)/.42,0.,1.);
         fade=1.-fade*fade*fade*(fade*(fade*6.-15.)+10.);
         vec3 transformed=rot*(position*chipSize.xyz*fade)+vec3(chipLaunch.x*travel,height+.02,chipLaunch.y*travel);`);
     };
   }
   const points=new T.BufferGeometry(),dustPositions=new Float32Array(24*3);
   const dust=new T.Points(points,new T.PointsMaterial({map:this.cloudTexture,color:0xb4ada0,size:1.6,transparent:true,opacity:.26,depthWrite:false}));
   points.setAttribute('position',new T.BufferAttribute(dustPositions,3));dust.frustumCulled=false;dust.userData.opacityScale=.26;group.add(dust);
   group.userData.updateEruption=elapsed=>{
     const rise=T.MathUtils.smoothstep(elapsed,0,.18),sink=1-T.MathUtils.smoothstep(elapsed,lowBreak?.29:1.5,lowBreak?.92:2.6);
     chipClock.value=elapsed;
     const shardAge=opening?elapsed*1.33+Math.max(0,elapsed-.29)*2.12:elapsed;
     fractures?.userData.setAge(shardAge);
     // At this age the tallest retained spear is entirely below the floor.
     shards.visible=!opening||shardAge<2.86;
     fragments.visible=!opening||elapsed<2.02;
     if(shards.visible)for(let i=0;i<roots.length;i++){
      const s=roots[i];
      if(gravity)moveGravityShard(transform,s,i,shardAge);
      else{
        const age=Math.max(0,elapsed-s.delay),lift=T.MathUtils.smootherstep(age,0,.16);
        const settle=T.MathUtils.smootherstep(age,lowBreak?.18:.68,lowBreak?.69:1.58);
        const drift=lift*(1+.11*age);
        transform.position.set(s.x*drift,-.09-settle*(s.height+.17),s.z*drift);
        transform.rotation.set(s.leanX*(lift+.31*settle),s.turn,s.leanZ*lift);
        transform.scale.set(s.width*lift,s.height*lift,s.width*(.38+i%4*.12)*lift);
      }
      transform.updateMatrix();shards.setMatrixAt(i,transform.matrix);
     }
     if(!opening)for(let i=0;i<stones.length;i++){
       const s=stones[i],lift=T.MathUtils.smoothstep(elapsed,0,lowBreak?.16:.35);
       const fall=T.MathUtils.smoothstep(elapsed,lowBreak?.19:1.1,lowBreak?.69:2.6);
       const height=s.height*(lowBreak?.25:1)*lift*(1-fall);
       const size=s.size*(lowBreak?.45*(1-fall):1);
       transform.position.set(s.x*(1+elapsed*.03),height+Math.sin(elapsed*2+s.phase)*.035,s.z*(1+elapsed*.03));
       transform.rotation.set(s.phase+elapsed*.5,elapsed*.6,s.phase*.7);
       transform.scale.set(size*.75,size*(1.5+i%3*.5),size*.48);
       if(!gravity||opening){
         const t=Math.max(0,elapsed-.026*(i%6)),speed=3.6+s.height*1.62;
         const hit=2*speed/14.6,after=Math.max(0,t-hit);
         const lift=t<hit?t*(speed-7.3*t):Math.max(0,after*(speed*.22-7.3*after));
         const travel=.22+.70*Math.min(t,hit)+.15*Math.min(after,.34);
         transform.position.set(s.x*travel,lift+.02,s.z*travel);
         const spin=Math.min(t,hit)+Math.min(after,.24)*.45;
         transform.rotation.set(s.phase+spin*(2.1+i%5),s.phase*.7-spin*2.3,s.phase*.31+spin*3.8);
         const chip=s.size*(opening?(i%27===0?2.58:i%8===0?1.58:.51+((i*13)%17)/27):1)*(1-T.MathUtils.smootherstep(after,.18,.60));
         transform.scale.set(chip*(opening?.94+(i%5)*.27:1.5+i%3*.31),chip*(opening?.71+(i%7)*.12:.76),chip*(.61+(i%4)*.15));
       }
       transform.updateMatrix();fragments.setMatrixAt(i,transform.matrix);
     }
     for(let i=0;i<24;i++){const a=i*2.399963,r=(.6+i%5*.6)*(1+elapsed*.4);dustPositions[i*3]=Math.sin(a)*r;dustPositions[i*3+1]=.15+(i%4)*.12+elapsed*.17;dustPositions[i*3+2]=Math.cos(a)*r;}
     if(shards.visible)shards.instanceMatrix.needsUpdate=true;if(!opening)fragments.instanceMatrix.needsUpdate=true;points.attributes.position.needsUpdate=true;
   };
   group.userData.updateEruption(0);this.scene.add(group);this.items.push({o:group,life:2.7,max:2.7,kind:'ground-spikes'});
 }
 debris(pos,radius=4){
  if(radius>=3&&pos.y<.85)this.impactDust(pos,radius);
  const n=28,vertices=new Float32Array(n*3),velocities=new Float32Array(n*3),angles=new Float32Array(n);
  for(let i=0;i<n;i++){
   const a=i*2.39996;angles[i]=a+Math.sin(pos.x+pos.z);
   velocities.set([Math.sin(a)*radius,2+i%5,Math.cos(a)*radius],i*3);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.BufferAttribute(vertices,3));
  geo.setAttribute('chipAngle',new T.BufferAttribute(angles,1));
  const mat=new T.PointsMaterial({color:0x5c5348,size:.16,transparent:true,depthWrite:false});
  // Small camera-facing chips retain an angular stone outline even when a
  // near impact magnifies them. Point squares are conspicuous in this shot.
  mat.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float chipAngle; varying float chipTurn;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nchipTurn=chipAngle;');
   shader.fragmentShader='varying float chipTurn;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>',`#include <map_particle_fragment>
    vec2 point=gl_PointCoord-.5;
    vec2 chip=mat2(cos(chipTurn),-sin(chipTurn),sin(chipTurn),cos(chipTurn))*point;
    chip.y*=1.35;
    float edge=max(max(abs(chip.x)*.86,abs(chip.y)+.22*chip.x),abs(chip.x+.48*chip.y)*.92);
    if(edge>.395)discard;
    diffuseColor.a*=1.-smoothstep(.31,.395,edge);
    diffuseColor.rgb*=.60+.58*smoothstep(-.07,.04,chip.x-.38*chip.y);`);
  };
  const o=new T.Points(geo,mat);o.position.copy(pos);this.scene.add(o);
  this.items.push({o,velocities,life:1.8,max:1.8,kind:'sparks'});
 }
 arc(pos,yaw,purple=false){
   const geometry=new T.TorusGeometry(2.7,purple?.035:.027,4,40,Math.PI*1.4);
   geometry.rotateX(-Math.PI/2);
   const material=new T.MeshBasicMaterial({color:purple==='flame'?0xff683c:purple?0xb392ff:0xcab797,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
   const o=new T.Mesh(geometry,material);o.position.copy(pos);o.position.y+=purple?.68:.14;o.rotation.y=yaw;
   this.scene.add(o);this.items.push({o,life:.28,max:.28,opacity:purple?.8:.37,kind:'arc'});
 }
 pillarViewOpacity(p){
  const pos=p.o.position,eye=this.sight.eye.value,focus=this.sight.focus.value;
  const dx=focus.x-eye.x,dz=focus.z-eye.z,len=Math.hypot(dx,dz)||1;
  const x=pos.x-eye.x,z=pos.z-eye.z,along=(x*dx+z*dz)/len,across=Math.abs(x*dz-z*dx)/len;
  const near=T.MathUtils.smoothstep(Math.hypot(x,z),.58,2.5);
  // At the close lock-on distance a world-scale shaft may fill the lens.
  // Keep its hit and reflected light while easing the luminous veil over the player.
  const beforePlayer=1-T.MathUtils.smoothstep(along,len-.1,len+.8);
  const covering=(1-T.MathUtils.smoothstep(across,.22,1.05*p.width))*beforePlayer;
  return (.06+.94*near)*(1-.88*covering);
 }
 updateHolyLights(dt){
  let flash=null,power=0;
  for(const p of this.items){
   if(p.kind!=='holy-impact')continue;
   const age=p.max-p.life-(p.groundDelay||0),broad=p.radius>10;
   if(age<0)continue;
   const attack=broad?T.MathUtils.smoothstep(age,.045,.165):T.MathUtils.smoothstep(age,0,.022);
   const intensity=attack*(Math.exp(-age*(broad?4.7:9))+.09*Math.exp(-age*2.7))*(broad?24400:1.45*p.radius**3);
   if(intensity>power){power=intensity;flash=p;}
  }
  if(flash){
    this.impactLight.position.copy(flash.o.position);
    this.impactLight.position.y+=flash.radius*(flash.groundDelay?.17:.76);
  }
  this.impactLight.intensity=power;
  this.ashFlash=flash?.radius>10?Math.min(1,power/19500):0;
  this.wash=0;
  if(this.flashPulse){
   const f=this.flashPulse;f.age+=dt;
   const level=T.MathUtils.smoothstep(f.age,0,.045)*(1-T.MathUtils.smoothstep(f.age,f.hold,f.hold+f.fall));
   if(f.age>=f.hold+f.fall)this.flashPulse=null;
   else{this.impactLight.position.copy(f.pos);this.impactLight.position.y+=9;this.impactLight.intensity=Math.max(power,level*5400);this.ashFlash=Math.max(this.ashFlash,level);this.wash=level*f.gain;}
  }
  // A broad flare acts as one source. Pick a second source only when spatially
  // separated, and fade the light at its old location before moving it again.
  let first=null;
  for(const light of this.holyLights){
   let selected=null,best=0;
   for(const p of this.items){if((p.kind!=='pillar'&&p.kind!=='holy-core'&&p.kind!=='light-trace')||!(p.flux>0))continue;
    if(light===this.holyLights[1]&&first&&p.o.position.distanceToSquared(first.o.position)<12)continue;
    const weight=p.flux/(2+this.sight.focus.value.distanceToSquared(p.o.position));
    if(weight>best){selected=p;best=weight;}
   }
   if(light===this.holyLights[0])first=selected;
   const candidate=selected?.o.position;
   if(candidate){const moved=Math.hypot(candidate.x-light.position.x,candidate.z-light.position.z)>4;
    if(!moved||light.intensity<2){light.position.copy(candidate);light.position.y+=1.7;}
    else selected=null;
   }
   const target=selected?Math.min(44,21*selected.flux):0;
   light.intensity=T.MathUtils.lerp(light.intensity,target,1-Math.exp(-dt*(target>light.intensity?32:22)));
   if(light.intensity<.015)light.intensity=0;
  }
 }
 tick(dt,present=true){for(let i=this.items.length-1;i>=0;i--){const p=this.items[i];p.life-=dt;if(p.life<=0){this.removeItem(p);this.items.splice(i,1);continue;}const elapsed=p.max-p.life;if(present&&p.kind==='ground-spikes')p.o.userData.updateEruption(elapsed);if(present&&p.kind==='ground-dust')p.o.material.uniforms.age.value=elapsed;if(p.kind==='ghost'){if(elapsed>=p.travel&&elapsed-dt<p.travel)this.impactDust(p.target,2.6,p.o.rotation.y);p.o.position.lerpVectors(p.from,p.target,Math.min(1,elapsed/p.travel));if(elapsed<=p.travel+dt||p.gateStrike)p.o.userData.tickGhostStrike?.(Math.min(1,elapsed/(p.gateStrike?.23:p.travel)));p.o.userData.phantomWake?.(elapsed,p.gateStrike);}if(p.kind==='sparks'){const a=p.o.geometry.attributes.position;for(let j=0;j<a.count;j++){p.velocities[j*3+1]-=dt*(p.gravity??6);a.setXYZ(j,a.getX(j)+p.velocities[j*3]*dt,a.getY(j)+p.velocities[j*3+1]*dt,a.getZ(j)+p.velocities[j*3+2]*dt);}a.needsUpdate=true;}else if(p.vel)p.o.position.addScaledVector(p.vel,dt);
   if(present&&p.kind==='riposte-spray')p.o.userData.updateSpray(elapsed);
   if(present&&p.kind==='meteor-ejecta')p.o.userData.updateEjecta(elapsed);
   if(present&&p.kind==='rock-impact')p.o.userData.updateRockImpact(elapsed);
   const f=Math.max(0,p.life/p.max);let opacity=(p.opacity??1)*f;if(p.kind==='ghost'&&p.gateStrike)opacity=T.MathUtils.smoothstep(elapsed,0,.034)*(1-T.MathUtils.smoothstep(elapsed,p.max-p.fadeTime,p.max));if(p.kind==='landing-rays')opacity=.90*(1-T.MathUtils.smoothstep(elapsed,.15,.70));if(present&&p.kind==='ground-spikes')opacity=1-T.MathUtils.smoothstep(elapsed,2.0,2.7);if(p.kind==='pillar'){if(present)p.o.userData.updatePillar?.(elapsed,this.pillarViewOpacity(p));opacity=elapsed<0?0:1;p.flux=p.o.userData.pillarFlux||0;}if(p.kind==='holy-core'){opacity=T.MathUtils.smoothstep(elapsed,0,.055)*(1-T.MathUtils.smoothstep(elapsed,.14,1.06));p.flux=opacity*3.1;}
   if(present&&p.kind==='holy-impact')opacity=p.o.userData.updateFlash(elapsed);if(present&&p.kind==='barrage'){p.o.userData.updateBarrage(elapsed);opacity=T.MathUtils.smoothstep(elapsed,0,.14)*T.MathUtils.smoothstep(p.life,0,.45);}if(present&&p.kind==='nova'){p.o.userData.updateMarker(elapsed);opacity=1;}if(p.kind==='light-trace'){if(present)p.flux=.4*p.o.userData.updateTrace(elapsed);opacity=1;}if(p.kind==='ring'){const size=3.4+elapsed*22;p.o.scale.set(size,1,size);opacity*=.8;}if(p.kind==='bloodflame'){opacity=.65+(1-f)*.35;p.o.traverse(o=>{const fire=o.userData.fire;if(fire){const pulse=Math.sin(elapsed*24+fire.phase);o.position.y=fire.base+pulse*.05;o.scale.y=fire.height*(1+pulse*.16);}});}if(p.kind==='ice-cloud'){opacity=(p.opacity??1)*T.MathUtils.smoothstep(elapsed,0,.12)*(1-T.MathUtils.smoothstep(elapsed,1.3,p.max));p.o.scale.multiplyScalar(1+dt*.04);}if(p.kind==='ash')p.o.scale.multiplyScalar(1+dt*.3);if(p.kind==='arc')p.o.scale.multiplyScalar(1+dt*1.4);if(p.kind==='ghost'&&p.gateStrike)p.o.userData.strokePresence.value=opacity;if(!this.liveUpdates||p.kind==='ghost'){
     if(present)p.o.traverse(o=>{if(o.material)for(const m of [o.material].flat())m.opacity=m.userData.returnSurface?m.userData.returnOpacity:opacity*(o.userData.opacityScale??1)*(m.userData.returnOpacity??1);});
   }else if(present && (p.lastPaintOpacity!==opacity || !p.opacityBindings)){
     if(!p.opacityBindings){
       p.opacityBindings=[];
       p.o.traverse(o=>{if(o.material)for(const material of [o.material].flat())p.opacityBindings.push([material,o.userData.opacityScale??1]);});
     }
     for(const [material,scale] of p.opacityBindings)material.opacity=material.userData.returnSurface?material.userData.returnOpacity:opacity*scale*(material.userData.returnOpacity??1);
     p.lastPaintOpacity=opacity;
   }}this.updateHolyLights(dt);}
}
