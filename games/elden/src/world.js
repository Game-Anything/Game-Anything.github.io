import * as T from "game/lib/three.module.js";
import {ENTRANCE,entranceHeight,shoalSurface,rubbleFootprint,constrainRubble} from "game/src/arena-contact.js";
import {GLTFLoader} from "game/lib/addons/loaders/GLTFLoader.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";
import {addStaticInstances} from "game/src/static-instances.js";
import {buildWindrowBodies,appendSplitBed} from "game/src/ground-windrows.js";
import {prepareMoundLods} from "game/src/remains-lod.js";
import {makeSourceSteps,makeCrownedPalace,makeCarvedPillar,makeGateHaze} from "game/src/source-landmarks.js";
import {cupolaShell,crownScreen,leafFrieze} from "game/src/tower-carving.js";
import {loadGroundRelief,westAshChannel,entryLipX,entryReach,entryBed,ashSurfaceMaterial,createAshFloor,createDebris,createAshLight} from "game/src/arena-floor.js";
import {ARENA,ringPoint,gateMound,rimDip,stairLane,onTerrace} from "game/src/arena-layout.js";
import {buildGate,buildRail,buildColumn,buildRubble} from "game/src/arena-architecture.js";
import {buildGreatTree} from "game/src/great-tree.js";
import {makeSky} from "game/src/arena-sky.js";
import {loadArenaReflections} from "game/src/arena-reflections.js";
import {PHASE_ONE_DENSITY,PHASE_TWO_DENSITY} from "game/src/atmosphere.js";
export function makeWorld(scene,renderer=null,{ultra=true,fullShadows=ultra}={}){
 let seed=87231;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 function terrain(x,z){
   const base=(Math.sin(x*.19)*Math.cos(z*.21)*.24+Math.sin(z*.6+x*.3)*.08)*Math.min(1,Math.abs(x)*.2)-.1;
   const approach=T.MathUtils.smoothstep(z,-47,-26)*(1-T.MathUtils.smoothstep(z,0,5));
   const path=x-2.55*Math.sin(z*.095),distance=Math.abs(path);
   const side=path<0?-1:1;
   let windingBank=0;
   if(approach){
     const offset=4.9+side*1.4*Math.sin(z*.24+side);
     const bank=Math.exp(-((distance-offset)**2)*.13);
     windingBank=approach*bank*(.54+.31*Math.sin(z*.54+side*1.2)+.19*Math.cos(z*.91+path*.43));
   }
   // Ripples of heaped ash continue outside the entry channel. Their crowns
   // are broad enough to receive light and carry the draped bodies with them.
   const inland=T.MathUtils.smoothstep(z,-74,-56)*(1-T.MathUtils.smoothstep(z,6,14));
   const outsidePath=T.MathUtils.smoothstep(distance,2.5,7.5);
   let drift=0;
   if(inland&&outsidePath){
     const windrow=Math.sin(z*.106+x*.19+1.46*Math.sin(x*.083-z*.048));
     drift=Math.max(0,windrow-.12)**2*(.49+.23*Math.sin(x*.38+z*.27));
   }
   // The outer piles run down towards the arena floor on either side of the
   // steps. Their feet are visible through the low, broken dust.
   // Gate hill, stair lane and the lower ash along the tree-side wall: see arena-layout.js.
   const dx=x-entryLipX(z),reach=entryReach(z);
   const crest=Math.exp(-dx*dx*1.02),spur=Math.exp(-((dx-1.25)**2)*.54);
   const face=crest*(.51+.16*Math.sin(z*.89)+.085*Math.sin(z*2.1+dx*2.7))+.14*spur;
   return reach*face-.34*entryBed(x,z)+base+windingBank+inland*outsidePath*drift*(1-stairLane(x,z))+gateMound(x,z)+rimDip(x,z);
 }
 // The ash lies a little under the stair treads; characters stand on the treads.
 const stairRecess=(x,z)=>.38*stairLane(x,z);
 const floorTerrain=(x,z)=>terrain(x,z)-stairRecess(x,z);
 // Beyond the boundary wall the ground falls away: only the terrace and the gate hill keep their floor.
 function trimFloor(geometry){
   const p=geometry.attributes.position,index=geometry.index.array,inside=new Uint8Array(p.count),keep=[];
   for(let i=0;i<p.count;i++)inside[i]=onTerrace(p.getX(i),p.getZ(i))?1:0;
   const mask=new Uint8Array(index.length/3);
   for(let i=0;i<index.length;i+=3)if(inside[index[i]]||inside[index[i+1]]||inside[index[i+2]]){
     keep.push(index[i],index[i+1],index[i+2]);mask[i/3]=1;
   }
   geometry.userData.terraceTriangles=mask;
   geometry.setIndex(keep);
 }
 const stone=new T.MeshStandardMaterial({color:0xa6a49a,roughness:.96});const dark=new T.MeshStandardMaterial({color:0x55564c,roughness:1});
 const bark=new T.MeshStandardMaterial({color:0x282820,roughness:1});
 const preparation=new T.Group();preparation.name="mist-preparation-room";scene.add(preparation);let preparationBuilding=false;
 function mesh(g,m,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.receiveShadow=true;o.userData.preparationOnly=preparationBuilding;(preparationBuilding?preparation:scene).add(o);return o;}
 const noise=`float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);} float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);} float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=noise(p)*a;p=p*2.04+3.1;a*=.5;}return v;}`;
 // Sky dome: see arena-sky.js.
 const skyMat=makeSky();
 const sky=mesh(new T.SphereGeometry(210,32,16),skyMat);sky.renderOrder=1000;
 // Phase-specific indirect light traced against the actual static arena.
 const reflections=renderer?loadArenaReflections(renderer,scene,{ultra}):null;

 const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='#b7b1a3';ctx.fillRect(0,0,1024,1024);
 for(let i=0;i<80000;i++){const v=100+rnd()*90;ctx.fillStyle=`rgba(${v},${v-4},${v-14},${rnd()*.3})`;ctx.fillRect(rnd()*1024,rnd()*1024,1+rnd()*5,1+rnd()*3);}
 for(let i=0;i<250;i++){let x=rnd()*1024,y=rnd()*1024;ctx.beginPath();ctx.moveTo(x,y);for(let k=0;k<8;k++){x+=rnd()*30-15;y+=rnd()*30-15;ctx.lineTo(x,y);}ctx.strokeStyle='#726e6028';ctx.lineWidth=1;ctx.stroke();}
 for(let i=0;i<2200;i++){const x=rnd()*1024,y=rnd()*1024,s=10+rnd()*50;const g=ctx.createRadialGradient(x,y,0,x,y,s);g.addColorStop(0,i%2?'#efece328':'#423f3928');g.addColorStop(1,'#88847700');ctx.fillStyle=g;ctx.fillRect(x-s,y-s,s*2,s*2);}const tex=new T.CanvasTexture(canvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(22,22);tex.colorSpace=T.SRGBColorSpace;const surfaceSampling=Math.min(ultra?16:4,renderer?.capabilities.getMaxAnisotropy()||1);tex.anisotropy=surfaceSampling;bark.map=tex;bark.bumpMap=tex;bark.bumpScale=.35;stone.map=tex;dark.map=tex;stone.bumpMap=tex;stone.bumpScale=.32;dark.bumpMap=tex;dark.bumpScale=.2;
 // One continuous ash-and-remains surface.  The baked relief supplies limbs,
 // creased cloth and powder; the displaced grid gives the piles real profile.
 const ashFlashCenter={value:new T.Vector3()},ashFlashPower={value:0},ashLight=createAshLight();
 ashLight.ashCloud=skyMat.uniforms.cloudField;
 ashLight.ashCloudTime=skyMat.uniforms.time;
 const ashFieldsReady=fetch(new URL('../assets/terrain/ash-fields.bin',"https://radahn-offline.invalid/src/world.js"))
   .then(async response=>{
     if(!response.ok)return;
     const data=new Uint8Array(await response.arrayBuffer());
     if(data.length!==1536*1536*4)return;
     const texture=new T.DataTexture(data,1536,1536,T.RGBAFormat);
     texture.minFilter=texture.magFilter=T.LinearFilter;
     texture.needsUpdate=true;
     ashLight.ashFields.value=texture;
     ashLight.ashFieldsReady.value=true;
   }).catch(()=>{ /* Use the analytic field when the atlas is unavailable. */ });
 const sunReady=renderer?new T.TextureLoader().loadAsync('assets/arena-irradiance/sun-visibility.png').then(map=>{
   map.flipY=false;map.colorSpace=T.NoColorSpace;map.minFilter=map.magFilter=T.LinearFilter;
   map.generateMipmaps=false;map.needsUpdate=true;ashLight.ashVisibility.value=map;
 }):null;
 const sand=new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
 const remainsRelief=loadGroundRelief();
 const ashGrainReady=new T.TextureLoader().loadAsync(new URL('../assets/terrain/ash-grain.png',"https://radahn-offline.invalid/src/world.js").href).then(map=>{
   map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.NoColorSpace;
   map.anisotropy=Math.min(16,renderer?.capabilities.getMaxAnisotropy()||1);ashLight.ashMicro.value=map;
 });
 const floorGeo=new T.PlaneGeometry(180,180,112,112);floorGeo.rotateX(-Math.PI/2);const p=floorGeo.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);const h=(Math.sin(x*.19)*Math.cos(z*.21)*.24+Math.sin(z*.6+x*.3)*.08)*Math.min(1,Math.abs(x)*.2);p.setY(i,z>2&&Math.abs(x)<8?-.16*(z-2)-.2:h-.1);}floorGeo.computeVertexNormals();const preparationFloor=mesh(floorGeo,sand);preparationFloor.name='preparation-slope';preparationFloor.visible=false;
 const ashFloor=createAshFloor(floorTerrain);trimFloor(ashFloor.geometry);const groundAt=(x,z)=>ashFloor.heightAt(x,z)+stairRecess(x,z);const floor=mesh(ashFloor.geometry,sand);floor.name='ash-remains-floor';
 const dummy=new T.Object3D();function instances(geo,mat,count,fn){const ins=new T.InstancedMesh(geo,mat,count);ins.receiveShadow=true;for(let i=0;i<count;i++){dummy.position.set(0,0,0);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);fn(dummy,i);if(!onTerrace(dummy.position.x,dummy.position.z,-1.4))dummy.scale.setScalar(0);dummy.updateMatrix();ins.setMatrixAt(i,dummy.matrix);ins.setColorAt(i,new T.Color().setHSL(.12+rnd()*.03,.035+rnd()*.035,.65+rnd()*.25));}scene.add(ins);return ins;}
 // Broken limestone collects on the leeward side of the scoured lane.
 const shoals=[[-22,-10,1.1],[-18,-9,1.4],[-12,-7,1.6],[-6,-5,1.2],[3,-19,1.1],[9,-25,1.6],[15,-12,1.25],[-9,-32,1.15],[13,1,.9],[-29,-22,1.25],[-3,-42,1.4],[25,-33,1.3],
   [28.1,-17.3,1.26],[30.7,-15.7,1.52],[34.4,-13.1,1.17],[25.2,-20.2,1.39],
   [34.9,-19.6,1.12],[38.1,-16.9,1.34],[28.5,-24.1,1.02],[24.5,-14.6,.89]];
 const entryShoals=shoals.length;
 shoals.push([-13.7,-11.4,1.15],[-11.2,-15.1,1.08],[-7.3,-16.4,.92],[-15.4,-18.7,1.31],
   [-4.9,-13.8,.86],[-9.5,-21.3,1.26],[-16.6,-24.7,.93],[-2.8,-22.6,.94]);
 const sculptedShoals=shoals.length;
 for(let i=0;i<16;i++){
   const z=.2-i*1.45;shoals.push([entryLipX(z)+.88*Math.cos(i*2.31),z,.76+.22*Math.sin(i)]);
 }
 const chips=[],pigment=[],tint=new T.Color();
 function triangle(a,b,c,shade){
   tint.setHex(0xc7c4b7).multiplyScalar(shade);
   for(const v of [a,b,c]){chips.push(...v);pigment.push(tint.r,tint.g,tint.b);}
 }
 for(const [group,[cx,cz,span]] of shoals.entries()){
   for(let i=0;i<(group>=entryShoals?51:25);i++){
     const k=i<13?group*13+i+1:407+group*25+i,rand=n=>{const wave=Math.sin(k*19.17+n*61.38)*9283.37;return wave-Math.floor(wave);};
     const spread=i===0?0:Math.sqrt(rand(0)),angle=rand(1)*Math.PI*2;
     const x=cx+Math.cos(angle)*span*2.8*spread,z=cz+Math.sin(angle)*span*1.42*spread;
     if(entryBed(x,z)>.57&&i%5!==0)continue;
     const long=span*(i<13?.10+.30*rand(2):.055+.13*rand(2)),wide=long*(.42+.36*rand(3)),h=long*(.12+.16*rand(4)),yaw=rand(5)*Math.PI;
     if(i===0&&group<entryShoals){
       const powder=westAshChannel(x,z);
       appendSplitBed(x,z,span*(.87-.59*powder),yaw,k,ashFloor.surfaceHeightAt,triangle);
       continue;
     }
     const rim=[],skirt=[],ridge=[],n=5+Math.floor(rand(6)*3),lean=rand(7)*Math.PI*2;
     for(let j=0;j<n;j++){
       const a=2*Math.PI*(j+.39*rand(8+j))/n,fracture=.64+.44*rand(46+j),dx=long*fracture*Math.cos(a),dz=wide*fracture*Math.sin(a);
       const wx=x+dx*Math.cos(yaw)-dz*Math.sin(yaw),wz=z+dx*Math.sin(yaw)+dz*Math.cos(yaw);
       const bed=groundAt(wx,wz);
       skirt.push([wx,bed-.16,wz]);rim.push([wx,bed+h*(.21+.13*rand(21+j)),wz]);
       ridge.push([x+.72*(wx-x),groundAt(x+.72*(wx-x),z+.72*(wz-z))+h*(.68+.34*Math.cos(a-lean)),z+.72*(wz-z)]);
     }
     const peak=[x,groundAt(x,z)+h*1.04,z];
     for(let j=0;j<n;j++){
       const l=(j+1)%n,tone=.84+.18*rand(34+j);
       triangle(skirt[j],rim[j],skirt[l],.54*tone);triangle(skirt[l],rim[j],rim[l],.58*tone);
       triangle(rim[j],ridge[j],rim[l],.78*tone);triangle(rim[l],ridge[j],ridge[l],.86*tone);triangle(ridge[j],peak,ridge[l],tone);
     }
   }
 }
 const clasts=new T.BufferGeometry();clasts.setAttribute('position',new T.Float32BufferAttribute(chips,3));
 clasts.setAttribute('color',new T.Float32BufferAttribute(pigment,3));clasts.computeVertexNormals();
 const fracturedStone=new T.MeshStandardMaterial({vertexColors:true,roughness:.97,metalness:0});
 ashSurfaceMaterial(fracturedStone,{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,mode:'limestone',key:'drift-fragment'});
 const shoal=mesh(clasts,fracturedStone);
 shoal.name='buried-limestone-shoals';shoal.castShadow=true;shoal.receiveShadow=true;
 // Separate sculpted remains lie on top of the relief floor; they share its powder tones.
 const legacyRemains=(...parts)=>instances(...parts);
 // The flat cloth cards hid the relief floor under a smooth sheet; they stay generated (hidden) so later random draws are unchanged.
 const hiddenRemains=(...parts)=>{const hidden=instances(...parts);hidden.visible=false;return hidden;};
 instances(new T.IcosahedronGeometry(1,0),ashSurfaceMaterial(new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,flatShading:true}),{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,mode:'debris',key:'ash-pebble'}),2200,o=>{const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*66;o.position.set(Math.sin(a)*r,ashFloor.heightAt(Math.sin(a)*r,Math.cos(a)*r-18)+.012,Math.cos(a)*r-18);if(o.position.z>1.5&&Math.abs(o.position.x)<7)o.position.x=(o.position.x<0?-1:1)*(8+Math.abs(o.position.x));const s=.018+rnd()*.075;o.scale.set(s*(1+rnd()),s*.62,s);o.rotation.set(rnd()*3,rnd()*6,rnd());});
 // Pale, intertwined sculptural remains spread over the ash field.
 const remainsFieldSeed=seed,bodies=[];
 for(let i=0;i<360;i++){
   const theta=rnd()*Math.PI*2,r=Math.sqrt(rnd())*45;
   const cx=Math.sin(theta)*r,cz=Math.cos(theta)*r-20,across=rnd()*Math.PI*2;
   if(cz>1.5&&Math.abs(cx)<7)continue;
   const cover=ashFloor.coverAt(cx,cz);
   if(cover<.16&&rnd()<.79)continue;
   const members=3+Math.floor(rnd()*4);
   for(let j=0;j<members;j++){
     const along=(j-(members-1)/2)*(.48+.44*rnd()),side=(rnd()-.5)*1.45;
     const x=cx+along*Math.sin(across)+side*Math.cos(across);
     const z=cz+along*Math.cos(across)-side*Math.sin(across);
     bodies.push({x,z,a:across+(rnd()-.5)*2.6,s:.91+.56*rnd(),bed:ashFloor.heightAt(x,z)-.065-.067*rnd()});
   }
 }
 const clothGeo=new T.PlaneGeometry(.8,1.8,4,10);clothGeo.rotateX(-Math.PI/2);const clothPos=clothGeo.attributes.position;for(let i=0;i<clothPos.count;i++){const x=clothPos.getX(i),z=clothPos.getZ(i);clothPos.setY(i,.12+Math.sin(z*10+x*7)*.07+Math.cos(x*8)*.12);clothPos.setX(i,x*(.48+.52*Math.sin(Math.PI*(z+.9)/1.8)) +Math.sin(z*18)*.06);}clothGeo.computeVertexNormals();const clothMat=new T.MeshStandardMaterial({color:0xd4d2ca,map:tex,bumpMap:tex,bumpScale:.018,roughness:1,side:T.DoubleSide});hiddenRemains(clothGeo,clothMat,bodies.length*2,(o,i)=>{const b=bodies[Math.floor(i/2)];o.position.set(b.x+(i%3-1)*.3,terrain(b.x,b.z)+.015,b.z);o.rotation.y=b.a+i*.18;o.scale.set(b.s*(.7+i%2*.3),.8,b.s);});
 // Soft contact darkening anchors the remains without another full shadow pass.
 const contactCanvas=document.createElement('canvas');contactCanvas.width=64;contactCanvas.height=128;
 const contactContext=contactCanvas.getContext('2d');contactContext.scale(1,2);
 const contactGradient=contactContext.createRadialGradient(32,32,2,32,32,32);
 contactGradient.addColorStop(0,'rgba(26,24,20,.48)');contactGradient.addColorStop(.5,'rgba(26,24,20,.21)');contactGradient.addColorStop(1,'rgba(26,24,20,0)');
 contactContext.fillStyle=contactGradient;contactContext.fillRect(0,0,64,64);
 const remainsShadowMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(contactCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const savedSeed=seed;
 const shadowBodies=bodies.filter(b=>westAshChannel(b.x,b.z)<.39);
 const remainsShadows=legacyRemains(new T.PlaneGeometry(1.30,2.4).rotateX(-Math.PI/2),remainsShadowMaterial,shadowBodies.length,(o,i)=>{const b=shadowBodies[i];o.position.set(b.x,b.bed+.15,b.z);o.rotation.y=b.a;o.scale.set(b.s,1,b.s);});
 seed=savedSeed;remainsShadows.receiveShadow=false;
 // Primary 20/35/120 s: irregular pale articulated remains, not straight rods.
 // Retain all existing centers, terrain samples and downstream scenery RNG.
 const bodySeed=seed;
 // A partly buried figure has one continuous mantle from hip to nape. Its
 // edges descend into the powder, even on the side of a bank.
 const torsoGeo=new T.PlaneGeometry(1.04,1.66,18,30);torsoGeo.rotateX(-Math.PI/2);
 const torsoP=torsoGeo.attributes.position;
 for(let i=0;i<torsoP.count;i++){
   const x=torsoP.getX(i),z=torsoP.getZ(i),bend=.10*Math.sin(3.6*z+.5);
   const u=x-bend,ridge=(dx,dz,wx,wz)=>Math.exp(-(((u-dx)/wx)**2+((z-dz)/wz)**2));
   const shoulder=.28*ridge(-.05,.22,.215,.31),flank=.22*ridge(.052,-.23,.20,.36);
   const nape=.16*ridge(-.09,.46,.135,.20);
   const envelope=Math.max(0,1-(x/.52)**2)*Math.max(0,1-(z/.83)**2);
   const folds=.045*Math.cos(22*u+3*Math.sin(z*5)+z*4)*envelope;
   torsoP.setXYZ(i,x,-.09+shoulder+flank+nape+folds,z);
 }
 torsoGeo.computeVertexNormals();
 const upAxis=new T.Vector3(0,1,0);
 const buriedLimb=new T.LatheGeometry([[.012,-.54],[.065,-.46],[.087,-.28],[.076,-.07],[.064,.16],[.053,.38],[.031,.50],[.008,.54]].map(v=>new T.Vector2(...v)),12);
 const windrowStone=new T.MeshStandardMaterial({color:0xede8da,roughness:.98,vertexColors:true});
 ashSurfaceMaterial(windrowStone,{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,mode:'exposed-remains',key:'articulated-windrows'});
 // The broad scoured swath on the western side exposes powder between heaps.
 // Use the floor material's lane axis for the independent raised remains too.
 const inPowderLane=(x,z)=>{
   const centre=-15.7+.13*(x+20)+1.25*Math.sin(x*.19);
   return entryBed(x,z)>.23||(x>-36&&x<-10&&Math.abs(z-centre)<2.65+.69*Math.sin(x*.43))||westAshChannel(x,z)>.39;
 };
 // The eroded lip preserves articulated masses in overlapping layers. Bury
 // the hips along the slope while shoulders, knees and long folds break its edge.
 const scatteredBodies=bodies.length;
 for(let j=0;j<48;j++){
   const z=.05-j*.52;
   const side=.24*Math.sin(j*2.19)+.18*Math.cos(j*3.7);
   const x=entryLipX(z)+side;
   bodies.push({x,z,a:.58+.72*Math.sin(j*.67),s:1.22+.40*Math.sin(j*1.83),lip:true});
 }
 buildWindrowBodies(scene,bodies.filter(b=>onTerrace(b.x,b.z,-1.4)&&!inPowderLane(b.x,b.z)),ashFloor.surfaceHeightAt,windrowStone,fullShadows);
 const ivorySkin=new T.MeshStandardMaterial({color:0xf2eee0,roughness:.98});
 ashSurfaceMaterial(ivorySkin,{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,mode:'exposed-remains',key:'chalk-folds'});
 // A floor fold can pass between the camera and the player on low upward shots.
 // Feather only that near-camera portion of the relief; distant folds keep their depth.
 const shadeIvory=ivorySkin.onBeforeCompile.bind(ivorySkin);
 const ivoryProgram=ivorySkin.customProgramCacheKey();
 ivorySkin.onBeforeCompile=shader=>{
   shadeIvory(shader);
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
     float foldVisibility=smoothstep(1.22,1.86,length(vViewPosition));
     if(foldVisibility<1.){
       float threshold=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
       if(foldVisibility<=threshold)discard;
     }`);
 };
 ivorySkin.customProgramCacheKey=()=>ivoryProgram+'-lens-clearance';
 const folds=[],limbs=[],pose=new T.Object3D();
 for(const [i,[cx,cz,span]] of shoals.slice(0,sculptedShoals).entries())for(let j=0;j<4;j++){
   const ang=i*1.89+j*2.16,side=j%2===0?1:-1;
   const x=cx+(j-1.4)*span*.83,z=cz+side*(.50+.32*Math.sin(ang))*span,s=span*(.86+.20*Math.cos(ang));
   if(westAshChannel(x,z)>.45||entryReach(z)*Math.exp(-((x-entryLipX(z))**2)/22)>.20)continue;
   const h=groundAt(x,z),sa=Math.sin(ang),ca=Math.cos(ang);
   pose.position.set(x,h+.12*s,z);pose.rotation.set(.14*side,ang,.18*Math.sin(ang));pose.scale.set(s*1.1,s*1.65,s);
   pose.updateMatrix();folds.push(pose.matrix.clone());
   for(let leg=0;leg<2;leg++){
     const direction=ang+side*(leg?.63:1.10),span1=s*(leg?.68:.48),span2=s*(leg?.61:.48);
     const ox=x+sa*(leg?-.32:.25)*s+ca*.18*side*s,oz=z+ca*(leg?-.32:.25)*s-sa*.18*side*s;
     const start=new T.Vector3(ox,groundAt(ox,oz)+.18*s,oz);
     const kx=ox+Math.sin(direction)*span1,kz=oz+Math.cos(direction)*span1;
     const knee=new T.Vector3(kx,groundAt(kx,kz)+(.29+.15*Math.sin(ang+leg))*s,kz);
     const ex=kx+Math.sin(direction+side*.97)*span2,ez=kz+Math.cos(direction+side*.97)*span2;
     const end=new T.Vector3(ex,groundAt(ex,ez)+.025*s,ez);
     for(const [a,b] of [[start,knee],[knee,end]]){
       const axis=b.clone().sub(a);pose.position.copy(a).lerp(b,.5);
       pose.quaternion.setFromUnitVectors(upAxis,axis.clone().normalize());pose.scale.set(s*1.36,axis.length(),s*1.15);
       pose.updateMatrix();limbs.push(pose.matrix.clone());
     }
   }
 }
 for(const [geo,matrices] of [[torsoGeo,folds],[buriedLimb,limbs]]){
   addStaticInstances(scene,geo,ivorySkin,matrices,'ash-covered-articulated-remains',true,26);
 }
 seed=bodySeed;for(let i=0;i<scatteredBodies*6*3;i++)rnd();
 // Reference-guided folds and remains; shared meshes keep the field inexpensive to draw.
 // The original Tripo mound has a flat support underneath the sculpt. Set the
 // surviving relief into windrows at floor height, with exposed pavement between them.
 const ready=Promise.all([new GLTFLoader().loadAsync('assets/tripo/pale_remains_mound/model.web.glb'),prepareMoundLods(fullShadows)]).then(([{scene:model},moundLods])=>{
   model.updateMatrixWorld(true);
   const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
   const assetScale=2.65/Math.max(size.x,size.z),placements=[],exposedPlacements=[],placement=new T.Object3D();
   let scatterSeed=93317;
   const random=()=>{scatterSeed=(Math.imul(scatterSeed,1664525)+1013904223)>>>0;return scatterSeed/4294967296;};
   for(let i=0;i<520;i++){
     const angle=random()*Math.PI*2,radius=Math.sqrt(random())*46;
     const x=Math.sin(angle)*radius,z=Math.cos(angle)*radius-20;
     const orientation=random(),width=.68+.88*random(),height=.30+.32*random();
     if(!onTerrace(x,z,-2.2)||(z>1&&Math.abs(x)<10))continue;
     const cover=ashFloor.coverAt(x,z);
     const ridge=Math.sin(x*.31+z*.19+1.7*Math.sin(z*.14));
     if((cover<.20 && ridge<.54)||inPowderLane(x,z))continue;
     placement.position.set(x,ashFloor.heightAt(x,z)-.15-height*.10,z);
     placement.rotation.y=1.02+.47*Math.sin(z*.083-x*.055)+(orientation-.5)*1.7;
     placement.scale.set(width*(1.00+.43*orientation),height*(.57+.15*cover),width*(.46+.26*orientation));
     placement.updateMatrix();placements.push(placement.matrix.clone());
   }
   // Fractured plaster collects around the windrow, with the body-like
   // folds of the scanned heap breaking through the debris on its upper edge.
   for(const [i,[cx,cz,span]] of shoals.slice(0,sculptedShoals).entries()){
     for(let j=0;j<3;j++){
       const x=cx+span*(j-1)*1.05,z=cz+span*(.13+.22*Math.sin(i*1.7+j));
       if(westAshChannel(x,z)>.45||entryReach(z)*Math.exp(-((x-entryLipX(z))**2)/46)>.16)continue;
       placement.position.set(x,ashFloor.heightAt(x,z)-.10,z);
       placement.rotation.y=.28+i*1.87+j*.83;
       placement.scale.set(span*(.79+.16*j),.34+.11*Math.sin(i*2.4+j),span*(.61+.12*Math.cos(i+j)));
       placement.updateMatrix();exposedPlacements.push(placement.matrix.clone());
     }
   }
   model.traverse(part=>{
     if(!part.isMesh)return;
     const geo=part.geometry.clone().applyMatrix4(part.matrixWorld);
     geo.translate(-center.x,-box.min.y,-center.z);geo.scale(assetScale,assetScale,assetScale);
     const vertices=geo.attributes.position,indices=geo.index?.array,faces=[];
     for(let i=0;i<(indices?.length??vertices.count);i+=3){
       const a=indices?indices[i]:i,b=indices?indices[i+1]:i+1,c=indices?indices[i+2]:i+2;
       if(Math.max(vertices.getY(a),vertices.getY(b),vertices.getY(c))>size.y*assetScale*.12)faces.push(a,b,c);
     }
     geo.setIndex(faces);
     for(let j=0;j<vertices.count;j++){
       const dx=2*vertices.getX(j)/(size.x*assetScale),dz=2*vertices.getZ(j)/(size.z*assetScale);
       const edge=T.MathUtils.smoothstep(Math.hypot(dx,dz),.60,1.);
       vertices.setY(j,vertices.getY(j)*(1-.78*edge)-.37*edge);
     }
     geo.computeVertexNormals();geo.computeBoundingSphere();
     const levels=moundLods(geo);
     const mat=new T.MeshStandardMaterial({map:part.material.map,normalMap:part.material.normalMap,normalScale:part.material.normalScale.clone().multiplyScalar(.72),color:0xe1ded5,roughness:1});
     ashSurfaceMaterial(mat,{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,key:'ash-mound'});
     addStaticInstances(scene,geo,mat,placements,'tripo-ash-remains-windrows',true,14,null,levels);
     const chalk=new T.MeshStandardMaterial({map:part.material.map,normalMap:part.material.normalMap,normalScale:mat.normalScale,roughness:.98});
     ashSurfaceMaterial(chalk,{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,mode:'exposed-remains',key:'sky-lit-remains'});
     addStaticInstances(scene,geo,chalk,exposedPlacements,'pale-remains-on-drift-crown',true,14,null,levels);
   });
 });

 seed=remainsFieldSeed;for(let i=0;i<7840;i++)rnd();
 ashSurfaceMaterial(sand,{relief:remainsRelief.relief,detail:remainsRelief.detail,rubble:remainsRelief.rubble,light:ashLight,flashCenter:ashFlashCenter,flashPower:ashFlashPower,floor:true,key:'ash'});
 ashSurfaceMaterial(clothMat,{flashCenter:ashFlashCenter,flashPower:ashFlashPower,light:ashLight,key:'ash-cloth'});
 const slabDebris=createDebris({count:1265,allow:(x,z)=>onTerrace(x,z,-1.6),heightAt:ashFloor.heightAt,rockAt:ashFloor.rockAt,light:ashLight,flashCenter:ashFlashCenter,flashPower:ashFlashPower});scene.add(slabDebris);

 const shaftStone=stone.clone();shaftStone.color.setHex(0x786b54);
 shaftStone.map=null;shaftStone.bumpMap=null;
 const pierStone=stone.clone(),pierShade=dark.clone(),palaceStone=stone.clone(),palaceShade=dark.clone();
 pierStone.color.setHex(0x897b62);pierShade.color.setHex(0x6b5e49);
 palaceStone.color.setHex(0x9d8e75);palaceShade.color.setHex(0x615544);
 const masonryPalette=new Map([[stone,'rail'],[dark,'recess'],[shaftStone,'shaft'],
   [pierStone,'pier'],[pierShade,'pierRecess'],[palaceStone,'palace'],[palaceShade,'palaceRecess']]);
 function column(x,z,h=24,r=1.1){
   // Carve the shaft itself. Earlier groove cylinders sat inside the wider
   // core, so the source's deep vertical channels were mostly invisible.
   const shaft=new T.CylinderGeometry(r*1.1,r*1.25,h,120,1),a=shaft.attributes.position;
   for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i),length=Math.hypot(x,z);if(length<.001)continue;const angle=Math.atan2(x,z),groove=1-.065*(.5+.5*Math.cos(angle*20));a.setX(i,x*groove);a.setZ(i,z*groove);}
   shaft.computeVertexNormals();mesh(shaft,shaftStone,x,h/2,z);
   mesh(new T.CylinderGeometry(r*1.65,r*1.65,.6,16),stone,x,h,z);mesh(new T.BoxGeometry(r*3.7,.45,r*3.7),stone,x,h+.5,z);mesh(new T.CylinderGeometry(r*1.7,r*1.8,.6,16),stone,x,.3,z);
 }
 // Primary same-fight clear frame 20 s: broad octagonal palace pavilions,
 // tall recessed arched windows, layered cornices and shallow ribbed roofs.
 // Unseen sides repeat the observed facade; dimensions remain reconstruction
 // estimates. Existing world positions and heights are retained in every view.
 const roofTile=new T.MeshStandardMaterial({color:0x84594a,roughness:.94});
 roofTile.onBeforeCompile=shader=>{
  shader.uniforms.roofPhase=skyMat.uniforms.phase;
  shader.vertexShader='varying vec2 roofUV;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nroofUV=uv;');
  shader.fragmentShader='uniform float roofPhase;varying vec2 roofUV;\n'+noise+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float row=floor(roofUV.y*24.);
    vec2 tile=vec2(roofUV.x*72.+mod(row,2.)*.5,roofUV.y*24.);
    float seam=min(min(fract(tile.x),1.-fract(tile.x)),min(fract(tile.y),1.-fract(tile.y)));
    float oxide=noise(tile*.22)*.6+hash(floor(tile))*.4;
    float filterWidth=min(.28,max(fwidth(tile.x),fwidth(tile.y)));
    float lap=smoothstep(.02,.095+filterWidth,seam);
    float tileRain=noise(vec2(roofUV.x*72.,roofUV.y*3.6));
    vec3 fired=mix(vec3(.54,.43,.38),vec3(.96,.81,.72),oxide);
    fired=mix(fired,vec3(.69,.62,.55),smoothstep(.46,.84,tileRain)*.34);
    diffuseColor.rgb*=fired*mix(.58,1.,lap);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',`float tileValue=dot(gl_FragColor.rgb,vec3(.26,.60,.14));
    gl_FragColor.rgb=mix(gl_FragColor.rgb,tileValue*vec3(1.12,1.029,1.095),.74-.23*roofPhase)
      +vec3(.037,.029,.012)*(1.-roofPhase);
    float roofLight=smoothstep(.13,.51,tileValue);
    gl_FragColor.rgb*=mix(vec3(.91,.91,.80),vec3(1.09,1.08,.89),roofLight)*(1.-.25*roofPhase);
    #include <premultiplied_alpha_fragment>`);
 };
 roofTile.customProgramCacheKey=()=>'octagonal-cupola-tiles';
 const windowShade=new T.MeshStandardMaterial({color:0x292824,roughness:1});
 const towerAshlar=new T.MeshStandardMaterial({color:0x97836a,roughness:.96});
 masonryPalette.set(roofTile,'roof');masonryPalette.set(windowShade,'window');masonryPalette.set(towerAshlar,'ashlar');
 function palaceTower(x,z,h,rotation){
  const r=h*(x>0?.267:.257),turn=Math.PI/8,faceRadius=r*Math.cos(Math.PI/8);
  function placed(g,m,y){const o=mesh(g,m,x,y,z);o.rotation.y=rotation+turn;return o;}
  placed(new T.CylinderGeometry(r*.99,r*1.045,h*.23,8),towerAshlar,h*.115);
  const cavity=placed(new T.CylinderGeometry(r*.59,r*.63,h*.50,8),windowShade,h*.48);
  cavity.name='tower-unlit-window-interior';
  for(const [y,scale,height] of [[.025,1.12,.025],[.08,1.07,.016],[.19,1.055,.015],[.23,1.10,.022],[.255,1.07,.012],[.70,1.045,.015],[.73,1.065,.018],[.76,1.085,.015]])
   {
    placed(new T.CylinderGeometry(r*scale,r*scale,h*height,8),towerAshlar,h*y);
    if(y===.23||y===.73||y===.76)
      placed(new T.CylinderGeometry(r*(scale-.012),r*(scale-.067),h*.012,8),palaceShade,h*(y-height*.5-.005));
   }
  for(let side=0;side<8;side++){
   const a=rotation+side*Math.PI/4,normal=new T.Vector3(Math.sin(a),0,Math.cos(a)),tangent=new T.Vector3(Math.cos(a),0,-Math.sin(a));
   const base=new T.Vector3(x,0,z).addScaledVector(normal,faceRadius+.012);
   const leafBand=mesh(leafFrieze(2*r*Math.sin(Math.PI/8),h*.023,9),towerAshlar,
     base.x+normal.x*r*.051,h*.665,base.z+normal.z*r*.051);
   leafBand.rotation.y=a;
   // A narrow round-headed opening sits inside a much broader blind arch.
   const width=r*.245,bottom=h*.265,shoulder=h*.548;
   const shape=new T.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,shoulder-bottom);
   shape.absarc(0,shoulder-bottom,width/2,0,Math.PI,false);shape.closePath();
   const faceWidth=r*Math.sin(Math.PI/8),wallFoot=h*.23,depth=r*.235;
   const wall=new T.Shape();
   wall.moveTo(-faceWidth,wallFoot);wall.lineTo(faceWidth,wallFoot);
   wall.lineTo(faceWidth,h*.735);wall.lineTo(-faceWidth,h*.735);wall.closePath();
   const opening=new T.Path();
   for(const [i,p] of shape.getPoints(14).reverse().entries()){
    if(i===0)opening.moveTo(p.x,p.y+bottom);else opening.lineTo(p.x,p.y+bottom);
   }
   wall.holes.push(opening);
   const cut=mesh(new T.ExtrudeGeometry(wall,{depth,bevelEnabled:true,bevelThickness:.045,bevelSize:.045,bevelSegments:1}),
    towerAshlar,base.x-normal.x*depth,0,base.z-normal.z*depth);
   cut.rotation.y=a;
   function archivolt(radius,spring,bead,projection){
    const points=[new T.Vector3(-radius,bottom,0)];
    for(let j=0;j<=24;j++){
     const angle=Math.PI-j*Math.PI/24;
     points.push(new T.Vector3(radius*Math.cos(angle),spring+radius*Math.sin(angle),0));
    }
    points.push(new T.Vector3(radius,bottom,0));
    const arch=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),64,bead,6,false),towerAshlar,
     base.x+normal.x*projection,0,base.z+normal.z*projection);
    arch.rotation.y=a;
   }
   archivolt(width*.53,shoulder,h*.005,r*.046);
   archivolt(r*.265,h*.535,h*.009,r*.082);
   archivolt(r*.30,h*.535,h*.006,r*.065);
   for(const hand of [-1,1]){
    const jamb=base.clone().addScaledVector(tangent,hand*r*.255).addScaledVector(normal,r*.043);
    const plinth=mesh(new T.BoxGeometry(r*.123,h*.026,r*.112),towerAshlar,jamb.x,bottom+h*.013,jamb.z);
    plinth.rotation.y=a;
    const impost=mesh(new T.BoxGeometry(r*.145,h*.018,r*.144),towerAshlar,jamb.x,shoulder,jamb.z);
    impost.rotation.y=a;
   }
   // Separate voussoirs create a broken grazing highlight around each arch.
   // The dark setback remains open behind the raised faces.
   for(let voussoir=0;voussoir<13;voussoir++){
     const a0=voussoir*Math.PI/13+.022,a1=(voussoir+1)*Math.PI/13-.022;
     const ring=r*.294,depth=r*(.029+.007*Math.cos(voussoir*2.41));
     const block=new T.Shape();
     block.absarc(0,0,ring*1.07,a0,a1,false);
     block.absarc(0,0,ring,a1,a0,true);block.closePath();
     const relief=mesh(new T.ExtrudeGeometry(block,{depth,bevelEnabled:false,curveSegments:3}),towerAshlar,
       base.x+normal.x*.13,h*.535,base.z+normal.z*.13);
     relief.rotation.y=a;
   }
   // The edges of the drum are bonded with alternate long and short quoins.
   // Their shallow chamfers catch light between the deeper recessed bays.
   for(const sign of [-1,1]){
    for(let row=0;row<8;row++){
     const reach=r*(row%2?.093:.126),py=h*(.283+.051*row);
     const q=base.clone().addScaledVector(tangent,sign*(faceWidth-reach*.50)).addScaledVector(normal,.045);
     const stoneEnd=mesh(new T.BoxGeometry(reach,h*.048,.22),towerAshlar,q.x,py,q.z);
     stoneEnd.rotation.y=a;
    }
   }
   // Broad corner pilasters join the storey sill to the cornice above the arches.
   const cornerAngle=a+Math.PI/8,cornerRadius=r*.98;
   const px=x+Math.sin(cornerAngle)*cornerRadius,pz=z+Math.cos(cornerAngle)*cornerRadius;
   const pier=mesh(new T.BoxGeometry(r*.18,h*.46,r*.13),towerAshlar,px,h*.475,pz);pier.rotation.y=cornerAngle;
   for(const y of [.265,.684,.711]){
    const cap=mesh(new T.BoxGeometry(r*.23,h*.018,r*.19),towerAshlar,px,h*y,pz);cap.rotation.y=cornerAngle;
   }
   const sill=mesh(new T.BoxGeometry(width*1.4,h*.015,h*.03),towerAshlar,base.x+normal.x*.06,bottom,base.z+normal.z*.06);sill.rotation.y=a;
   // Panel mouldings stand proud of the tapered lower drum.
   const lowerFace=base.clone().addScaledVector(normal,r*.035);
   for(const sign of [-1,1]){
    const jamb=lowerFace.clone().addScaledVector(tangent,sign*r*.29);
    const trim=mesh(new T.BoxGeometry(.16,h*.11,.16),towerAshlar,jamb.x,h*.145,jamb.z);
    trim.rotation.y=a;
    const ledge=mesh(new T.BoxGeometry(r*.60,.14,.18),towerAshlar,lowerFace.x,h*(.145+sign*.055),lowerFace.z);
    ledge.rotation.y=a;
   }
  }
  // A stone cornice separates the weight-bearing drum from the low cap.
  // Modillions sit under the outer lip, leaving each opening in shadow.
  for(let side=0;side<8;side++){
   const a=rotation+side*Math.PI/4,nx=Math.sin(a),nz=Math.cos(a);
   for(let j=-2;j<=2;j++){
    const tangent=j*r*.125,rad=faceRadius+r*.038;
    const px=x+nx*rad+nz*tangent,pz=z+nz*rad-nx*tangent;
    const corbel=mesh(new T.BoxGeometry(r*.065,h*.032,r*.106),towerAshlar,px,h*.709,pz);
    corbel.rotation.y=a;
   }
  }
   placed(new T.CylinderGeometry(r*1.085,r*1.053,h*.017,8),palaceShade,h*.742);
   placed(new T.CylinderGeometry(r*1.092,r*1.074,h*.010,8),towerAshlar,h*.755);
   const roofRise=h*.186;
   const roof=cupolaShell(r*1.09,roofRise);
  placed(roof,roofTile,h*.765);
  // Low crests at the corners of the octagon break the spring line of the dome.
  // The roof tiles are visible through the two deep slots when seen from below.
  for(let i=0;i<8;i++){
   const a=rotation+turn+i*Math.PI/4,nx=Math.sin(a),nz=Math.cos(a);
   const setback=r*1.018, py=h*.756;
   const crest=crownScreen(r*.235,h*.049,2,r*.052);
   const facing=mesh(crest,towerAshlar,x+nx*setback,py,z+nz*setback);
   facing.rotation.y=a;
   const cap=mesh(new T.BoxGeometry(r*.259,h*.011,r*.099),towerAshlar,
     x+nx*(setback+r*.025),py+h*.050,z+nz*(setback+r*.025));
   cap.rotation.y=a;
  }
  for(let side=0;side<16;side++){
   const a=rotation+turn+side*Math.PI/8,points=[];
   for(let j=0;j<=12;j++){
    const t=j/12*Math.PI/2,c=Math.cos(t);
    const hip=(side%2?1-Math.cos(Math.PI/8):0)*c*c;
    const span=c*r*1.09*(1-hip)+.025*c;
    points.push(new T.Vector3(x+Math.sin(a)*span,h*.765+Math.sin(t)*roofRise,z+Math.cos(a)*span));
   }
   mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,h*(side%2?.0038:.0062),8,false),towerAshlar);
  }
  // The roof edge has four low, round-headed bays backed by the dome.
  // Primary 16.5 and 49.5 s and the auxiliary entrance view show the ribs inside these bays.
  for(let side=0;side<4;side++){
   const a=rotation+side*Math.PI/2,nx=Math.sin(a),nz=Math.cos(a),radius=r*.27;
   const spring=h*.785,foot=h*.754,edgeRadius=r*1.01;
   const profile=new T.Shape();profile.moveTo(-radius,foot);profile.lineTo(radius,foot);
   profile.lineTo(radius,spring);profile.absarc(0,spring,radius,0,Math.PI,false);profile.closePath();
   const inset=mesh(new T.ExtrudeGeometry(profile,{depth:r*.055,bevelEnabled:false,curveSegments:16}),roofTile,
    x+nx*edgeRadius,0,z+nz*edgeRadius);inset.rotation.y=a;
   const rim=new T.TorusGeometry(radius,h*.008,6,24,Math.PI);
   const arch=mesh(rim,towerAshlar,x+nx*(edgeRadius+r*.067),spring,z+nz*(edgeRadius+r*.067));arch.rotation.y=a;
   for(let j=-2;j<=2;j++){
    const offset=radius*j*.34,top=spring+Math.sqrt(radius*radius-offset*offset);
    const px=x+nx*(edgeRadius+r*.063)+nz*offset,pz=z+nz*(edgeRadius+r*.063)-nx*offset;
    const rib=mesh(new T.BoxGeometry(r*.037,top-foot,r*.04),towerAshlar,px,(top+foot)/2,pz);rib.rotation.y=a;
   }
  }
  const crownY=h*.765+roofRise;
  placed(new T.CylinderGeometry(r*.21,r*.24,h*.028,8),towerAshlar,crownY+h*.003);
  placed(new T.CylinderGeometry(h*.018,h*.026,h*.078,8),towerAshlar,crownY+h*.048);
  placed(new T.CylinderGeometry(h*.039,h*.041,h*.015,8),towerAshlar,crownY+h*.069);
  const finialProfile=[[.019,0],[.024,.007],[.019,.013],[.013,.019],[.017,.026],[.012,.035],[.004,.046],[0,.051]];
  const finial=new T.LatheGeometry(finialProfile.map(([radius,y])=>new T.Vector2(h*radius,h*y)),12);
  placed(finial,towerAshlar,crownY+h*.075);
 }
 const towerReady=Promise.resolve();
 // Primary 6.4-7.8 and 60 s: broad eroded twin piers and a narrow cleft,
 // with pale fused relief and a sloping accumulation around their feet.
 // Geometry is permanent; no reference image or review timestamp drives it.
 const gateStone=stone.clone();gateStone.color.setHex(0x827b72);gateStone.bumpScale=.16;
 gateStone.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 gatePosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 reliefPoint=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nreliefPoint=instanceMatrix*reliefPoint;\n#endif\ngatePosition=(modelMatrix*reliefPoint).xyz;');
   shader.fragmentShader='varying vec3 gatePosition;\n'+noise+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float worn=fbm(vec2(gatePosition.x*.95+gatePosition.z*.31,gatePosition.y*.43));
   float fissure=smoothstep(.24,.64,fbm(gatePosition.xy*vec2(2.8,.75)+gatePosition.z*.21));
   // Broken ribs of grey stone run obliquely through the fused figures.
   // Work in metres so these cleavage planes remain legible from the stairs.
   vec2 strataUV=vec2(gatePosition.x+.33*gatePosition.z,gatePosition.y);
   float rift=abs(sin(strataUV.x*2.9+strataUV.y*.52+3.8*noise(strataUV*vec2(.43,.19))));
   float bandBreak=smoothstep(.29,.64,noise(strataUV*vec2(.57,.26)+4.8));
   float aperture=max(.032,fwidth(rift));
   float crack=(1.-smoothstep(.045,.16+aperture,rift))*bandBreak;
   float ridge=smoothstep(.15,.35+aperture,rift)*(1.-smoothstep(.38,.68,rift))*bandBreak;
   float dustLip=ridge*(.35+.65*noise(strataUV*3.9));
   float reliefLight=clamp(.5+.5*dot(normalize(cross(dFdx(gatePosition),dFdy(gatePosition))),normalize(vec3(-.52,.68,.45))),0.,1.);
   diffuseColor.rgb*=mix(.48,1.46,worn)*mix(.58,1.19,fissure)*mix(.76,1.23,reliefLight);
   diffuseColor.rgb*=mix(vec3(1.),vec3(.47,.44,.405),crack)*(1.+.34*dustLip);
   // Primary 4.0 s: the heaped slopes at the foot of the piers are the same weathered grey-olive mass as the piers;
   // only their toe is powdered pale where it sinks into the ash.
   float gateUpward=abs(normalize(cross(dFdx(gatePosition),dFdy(gatePosition))).y);
   float gateSlope=smoothstep(.30,.85,gateUpward)*smoothstep(1.2,7.5,gatePosition.y)*(1.-smoothstep(24.,34.,gatePosition.y));
   diffuseColor.rgb*=mix(vec3(1.),vec3(.50,.50,.44)*mix(.80,1.15,worn),gateSlope);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float crustHeight=.16*ridge-.24*crack+.027*noise(strataUV*4.6);
   vec3 stoneGx=dFdx(vViewPosition),stoneGy=dFdy(vViewPosition);
   vec3 stoneU=cross(stoneGy,normal),stoneV=cross(normal,stoneGx);
   float jacobian=dot(stoneGx,stoneU);
   normal=normalize(normal*max(abs(jacobian),1e-8)+sign(jacobian)*(dFdx(crustHeight)*stoneU+dFdy(crustHeight)*stoneV));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   float chipped=fbm(gatePosition.xy*vec2(.56,.28)+gatePosition.z*.17);
   float rim=1.-smoothstep(2.4,7.8,abs(gatePosition.x));
   vec3 rockNormal=normalize(cross(dFdx(gatePosition),dFdy(gatePosition)));
   float skyFacing=max(dot(rockNormal,normalize(vec3(-.31,.67,.61))),0.);
   float ledge=smoothstep(.39,.67,chipped+.23*(fissure-.50));
   // A front face sees the sky over the terrace. A deep cleft sees mainly
   // warm ground bounce. Keep them separate at the meteor camera distance.
   outgoingLight=mix(outgoingLight,vec3(1.09,1.0,.86)*dot(outgoingLight,vec3(.27,.59,.14)),.48);
   outgoingLight+=vec3(.030,.024,.018)*(.36+chipped)*(1.+rim*1.5);
   outgoingLight+=vec3(.105,.086,.054)*skyFacing*(.18+.90*ledge)*smoothstep(.12,.74,reliefLight);
   #include <opaque_fragment>`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb','fogFactor*=.60;gl_FragColor.rgb'));
 };
 gateStone.customProgramCacheKey=()=> 'gate-weathered-relief-sky';
 for(const masonryMaterial of [...masonryPalette.keys(),gateStone]){
  masonryMaterial.defines={...masonryMaterial.defines,TERRACE_MASONRY:1};
 }
 makeSourceSteps(scene);
 const gateHaze=makeGateHaze(scene);
 const ambient=new T.HemisphereLight(0xe3e5e2,0x30352f,2.1);scene.add(ambient);const sun=new T.DirectionalLight(0xf4ebd4,2.6);sun.position.set(54,57,-94);sun.castShadow=true;
 let stabilizeShadow=false;
 const shadowRight=new T.Vector3(),shadowUp=new T.Vector3(),shadowShift=new T.Vector3();
 function setShadowQuality(full,constrained=false){
   stabilizeShadow=!full;
   const shadow=sun.shadow;
   const adaptive=ultra?2048:1536;
   const requested=full?4096:constrained?1024:adaptive;
   const size=Math.min(requested,renderer?.capabilities.maxTextureSize??4096);
   if(shadow.mapSize.x===size&&shadow.mapSize.y===size)return;
   shadow.mapSize.set(size,size);
   // Three allocates its depth target on the first draw after map becomes null.
   if(shadow.map){
     shadow.map.depthTexture?.dispose();
     shadow.map.depthTexture=null;
     shadow.map.dispose();
     shadow.map=null;
   }
   shadow.needsUpdate=true;
 }
 setShadowQuality(fullShadows);
 sun.shadow.camera.near=1;sun.shadow.camera.far=190;sun.shadow.bias=-.00015;sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;sun.shadow.normalBias=.025;sun.shadow.camera.updateProjectionMatrix();scene.add(sun);scene.add(sun.target);
 preparationBuilding=true;
 for(let j=0;j<ENTRANCE.count;j++){
   const y=-j*ENTRANCE.stepDown,z=ENTRANCE.firstZ+j;
   mesh(new T.BoxGeometry(ENTRANCE.width,.22,ENTRANCE.depth),stone,0,y-.11,z);
   for(const side of [-1,1])mesh(new T.BoxGeometry(ENTRANCE.railWidth,1.1,ENTRANCE.depth),stone,side*ENTRANCE.railX,.35+y,z);
 }
 const mistMat=new T.ShaderMaterial({uniforms:{time:{value:0},fade:{value:1}},side:T.FrontSide,transparent:true,depthWrite:false,vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 v;uniform float time;uniform float fade;${noise}void main(){float n=fbm(vec2(v.x*12.+sin(v.y*8.+time*.3),v.y*9.-time*.35));float detail=fbm(vec2(v.x*39.,v.y*31.-time*.25)+n*4.);float f=pow(clamp(n*.7+detail*.55,0.,1.),4.8)*2.0;vec3 col=mix(vec3(.006,.006,.003),vec3(.38,.29,.065),f)*(.55+detail*.65);gl_FragColor=vec4(col,fade);}`});const mist=mesh(new T.PlaneGeometry(14,14),mistMat,0,6,1);for(const side of [-1,1])column(side*7,1,16,1.2);preparationBuilding=false;
 // Weathered masonry with recessed courses, stains and fine fractures.
 const masonry=document.createElement('canvas');masonry.width=masonry.height=512;const mx=masonry.getContext('2d');mx.fillStyle='#aaa699';mx.fillRect(0,0,512,512);for(let row=0;row<12;row++)for(let col=-1;col<5;col++){const x=col*128+(row%2)*64,y=row*43;const v=165+rnd()*43;mx.fillStyle=`rgb(${v},${v-2},${v-10})`;mx.fillRect(x+2,y+2,124,39);for(let k=0;k<180;k++){const q=65+rnd()*110;mx.fillStyle=`rgba(${q},${q},${q-8},.25)`;mx.fillRect(x+rnd()*126,y+rnd()*41,1+rnd()*3,1+rnd()*3);}mx.strokeStyle='#35372c66';mx.beginPath();mx.moveTo(x+20,y+2);mx.lineTo(x+30,y+18);mx.lineTo(x+25,y+25);mx.stroke();}const masonryTex=new T.CanvasTexture(masonry);masonryTex.wrapS=masonryTex.wrapT=T.RepeatWrapping;masonryTex.repeat.set(3,8);masonryTex.anisotropy=surfaceSampling;masonryTex.colorSpace=T.SRGBColorSpace;stone.map=masonryTex;stone.bumpMap=masonryTex;stone.bumpScale=.21;dark.map=masonryTex;dark.bumpMap=masonryTex;
 // Dark joints and weathered faces remain legible above the low mist.
 towerAshlar.map=masonryTex;towerAshlar.bumpMap=masonryTex;towerAshlar.bumpScale=.095;
 // Colossal fluted columns outside the rail on the side away from the tree (primary 9.0, 24.5, 49.5, 125.3,
 // 146.9 s; auxiliary 236 s shows torn tops): [bearing from the centre, height, radius, torn metres].
 // Match lateral landmarks in the unobscured upper half of the 125 s shot.
 // Each entry is bearing, distance from terrace centre, height, radius,
 // missing top and optional clearance under the suspended member.
 const colonnade=[
   // The left shaft stands behind the cupola in the high-angle view. Its
   // parallax places it outside the south gallery view at 29.7 s.
   [162.11,300.1,286,6.2,0], [171.2,95,109,1.92,0,20],
   [210.8,92,114,2.12,13], [224.4,102,119,2.37,0]
 ];
 const darkInner=ringPoint(colonnade[1][0],colonnade[1][1]);
 const darkOuter=ringPoint(colonnade[2][0],colonnade[2][1]);
 const coveredShafts={value:new T.Vector4(...darkInner,...darkOuter)};
 for(const material of [stone,dark,shaftStone,pierStone,pierShade,palaceStone,palaceShade,windowShade,towerAshlar]){
  material.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 facadePoint;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 facadeLocal=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nfacadeLocal=instanceMatrix*facadeLocal;\n#endif\nfacadePoint=(modelMatrix*facadeLocal).xyz;');
   shader.uniforms.facadeSun=ashLight.ashSun;
   shader.uniforms.coveredShafts=coveredShafts;
   const pier=material===pierStone||material===pierShade, palace=material===palaceStone||material===palaceShade;
   shader.uniforms.masonryPhase=skyMat.uniforms.phase;
   // These finish selectors never change on a material. Let the GPU compiler
   // discard the other finishes' lighting and weathering calculations.
   const selectors={
     carvedPier:pier,cutStoneFace:material===pierStone?1:material===pierShade?.43:material===towerAshlar?.58:0,
     palaceBlock:palace,facadeCavity:material===windowShade,towerFace:material===towerAshlar,flutedShaft:material===shaftStone
   };
   const constants=Object.entries(selectors).map(([key,value])=>'const float '+key+'='+Number(value).toFixed(2)+';').join('\n');
   shader.fragmentShader=constants+'\nuniform vec3 facadeSun;uniform vec4 coveredShafts;uniform float masonryPhase;varying vec3 facadePoint;\n'+noise+'\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     vec3 geometricNormal=normalize(cross(dFdx(facadePoint),dFdy(facadePoint)));
    vec2 alongWall=abs(geometricNormal.z)>.76?vec2(1.,0.):(abs(geometricNormal.x)>.76?vec2(0.,1.):
      normalize(vec2(abs(geometricNormal.z),-sign(geometricNormal.x*geometricNormal.z)*abs(geometricNormal.x))+.00001));
    vec2 stoneUV=abs(geometricNormal.y)>.82?facadePoint.xz:vec2(dot(facadePoint.xz,alongWall),facadePoint.y);
    float pits=noise(stoneUV*2.35)*.58+noise(stoneUV*.58)*.42;
    float rain=noise(stoneUV*vec2(.83,.074));
    diffuseColor.rgb*=mix(.63,1.14,pits)*(1.-.22*smoothstep(.48,.84,rain));
    float blockY=stoneUV.y/.76+.035*noise(stoneUV*1.53);
    float row=floor(blockY),bed=min(fract(blockY),1.-fract(blockY))*.76;
    float width=1.44+.62*hash(vec2(row,8.)),jamb=stoneUV.x/width+hash(vec2(row,19.));
    float endJoint=min(fract(jamb),1.-fract(jamb))*width;
    float chipped=noise(stoneUV*9.8);
    float footprint=max(.009,.55*length(fwidth(stoneUV)));
    float edgeDist=min(bed,endJoint),edgeWidth=.014+.024*chipped;
    float recess=(1.-smoothstep(edgeWidth,edgeWidth+footprint,edgeDist))*.59;
    float blockTone=hash(vec2(floor(jamb),row));
    float axialStreak=noise(facadePoint.xz*1.74+noise(vec2(facadePoint.y*.042,1.7))*.54);
    blockTone=mix(blockTone,.36+.26*axialStreak,flutedShaft);
    recess*=1.-flutedShaft;
    float runoff=mix(noise(stoneUV*vec2(.82,.089)+3.*blockTone),axialStreak,flutedShaft);
    diffuseColor.rgb*=mix(.91,1.10,blockTone)*(1.-recess)*(1.-.105*runoff);
    float eroded=smoothstep(.018,.083,edgeDist)*(1.-smoothstep(.08,.17,edgeDist));
    float dust=noise(stoneUV*.21+vec2(3.,17.));
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.025,.976,.90),.38+.32*dust);`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    float stoneHeight=noise(stoneUV*3.2)*.037+noise(stoneUV*13.4)*.007
      -.039*recess+.016*eroded*chipped;
    stoneHeight=mix(stoneHeight,.014*axialStreak,flutedShaft);
    vec3 stoneDx=dFdx(vViewPosition),stoneDy=dFdy(vViewPosition);
    vec3 stoneR1=cross(stoneDy,normal),stoneR2=cross(normal,stoneDx);
    float stoneDet=dot(stoneDx,stoneR1);
    normal=normalize(abs(stoneDet)*normal-sign(stoneDet)*(dFdx(stoneHeight)*stoneR1+dFdy(stoneHeight)*stoneR2));`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float palaceAspect=smoothstep(13.,58.,facadePoint.z);
     float diffuseStone=dot(outgoingLight,vec3(.26,.57,.17));
     outgoingLight=mix(outgoingLight,vec3(1.04,1.01,.92)*(diffuseStone*1.04+.014),palaceAspect*.84);
     vec3 faceNormal=inverseTransformDirection(normal,viewMatrix);
     float openSky=smoothstep(4.,19.,facadePoint.y);
     float rakingLight=smoothstep(-.38,.82,dot(faceNormal,normalize(vec3(facadeSun.x,.38,facadeSun.z))));
     outgoingLight*=mix(1.,mix(.73,1.24,rakingLight),openSky);
     outgoingLight+=diffuseColor.rgb*vec3(.36,.31,.23)*openSky*rakingLight*(1.-facadeCavity);
     outgoingLight*=mix(1.,.46,facadeCavity);
     vec3 inward=normalize(vec3(-facadePoint.x,0.,-8.-facadePoint.z));
     vec3 crossLight=normalize(vec3(inward.x+inward.z,.61,inward.z-inward.x));
     float wallPlane=smoothstep(-.52,.79,dot(faceNormal,crossLight));
     float edgeLight=smoothstep(-.44,.76,dot(faceNormal,crossLight));
     outgoingLight*=mix(vec3(1.),vec3(1.04,.94,.84)*mix(.76,1.12,edgeLight),carvedPier);
     outgoingLight+=vec3(.076,.059,.038)*(.37+.85*edgeLight)*palaceBlock*openSky*(1.-.73*masonryPhase);
     float underside=1.-smoothstep(-.86,-.14,faceNormal.y);
     float floorBounce=.26+.74*wallPlane;
     // Sky reflected off the ash reaches the plane of each blind arcade. Leave
     // the soffits and niche backs in shade while catching the outer arrises.
     float arcadeFill=(.38+.62*wallPlane)*(.94+.06*dust)*(1.-.74*underside);
     outgoingLight+=vec3(.050,.047,.035)*cutStoneFace*arcadeFill;
     outgoingLight+=vec3(.056,.051,.038)*floorBounce*towerFace*openSky*(.78+.34*dust);
     outgoingLight*=1.-underside*(.38+.18*palaceBlock)*(1.-.50*masonryPhase);
     outgoingLight+=diffuseColor.rgb*vec3(.15,.127,.089)*max(faceNormal.y,0.)*openSky;
     #include <opaque_fragment>`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb','float distantArcade=smoothstep(38.,104.,length(cameraPosition-facadePoint));fogFactor=min(.90,fogFactor*mix(1.12,.38,smoothstep(0.,20.,vFogWorld.y))+distantArcade*(.046+.17*(1.-smoothstep(5.,36.,facadePoint.y))));float crownHeight=smoothstep(4.,18.,facadePoint.y);fogFactor*=1.-(.54*towerFace+.48*carvedPier+.21*palaceBlock)*crownHeight;gl_FragColor.rgb'));
   shader.fragmentShader=shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',
    `float dryStone=smoothstep(1.2,10.,facadePoint.y);
     float stoneY=dot(gl_FragColor.rgb,vec3(.24,.63,.13));
     vec3 mineral=mix(gl_FragColor.rgb,stoneY*vec3(1.067,.997,.916),.52);
     mineral*=mix(vec3(1.06,1.015,.985),vec3(.98,.98,.95),carvedPier);
     gl_FragColor.rgb=mix(gl_FragColor.rgb,mineral,dryStone*(1.-.22*masonryPhase));
     float dayFace=dryStone*(1.-masonryPhase);
     // The elevated drum and arcade catch ochre sky light. Smoke stays
     // along their footings, so the recessed windows retain their outline.
     float galleryStone=max(palaceBlock,towerFace);
     gl_FragColor.rgb*=vec3(1.)+dayFace*galleryStone*vec3(.076,.121,-.080);
     gl_FragColor.rgb*=vec3(1.)+dayFace*(carvedPier*vec3(.37,.37,.14)
       +towerFace*vec3(.060,.042,-.034)+palaceBlock*vec3(.047,.034,-.030));
     // Compensate the bright veiling layer on high ashlar. Lower courses
     // stay immersed in the bank, while the window storey retains its relief.
     float exposedDrum=smoothstep(6.,14.,facadePoint.y);
     gl_FragColor.rgb*=1.-towerFace*exposedDrum*.30;
     // The overcast dims distant masonry before the fog mix. At the pier,
     // light returning from the terrace still models the upright faces.
     gl_FragColor.rgb+=carvedPier*masonryPhase*dryStone*
       (.42+.58*wallPlane)*(1.-.71*underside)*vec3(.0206,.0189,.0132);
     // Mineral colour belongs to the masonry above the dust bank, including
     // the rail and gallery. Accumulated lime picks out ledges and jambs.
     float exposure=smoothstep(1.2,8.,facadePoint.y);
     float value=dot(gl_FragColor.rgb,vec3(.235,.64,.125));
     float lime=(.48+.52*wallPlane)*(.62+.38*dust)*(1.-underside);
     float rainwash=smoothstep(.44,.77,rain*.48+runoff*.52);
     vec3 limestone=vec3(1.11,1.00,.819)*(value*(.90+.13*lime-.16*rainwash)+.008*lime);
     vec3 twilight=vec3(1.08,1.047,.77)*(value*(.53+.17*lime)+.008*lime);
     gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(limestone,twilight,masonryPhase),exposure*.83);
     gl_FragColor.rgb*=1.-exposure*(.22*facadeCavity+.115*underside+.04*rainwash);
     float footVeil=(1.-smoothstep(1.,9.,facadePoint.y))*smoothstep(36.,80.,distance(facadePoint,cameraPosition));
     vec3 dustBounce=mix(vec3(.51,.47,.32),vec3(.20,.185,.126),masonryPhase);
     gl_FragColor.rgb=mix(gl_FragColor.rgb,dustBounce,footVeil*(.27+.15*dust));
     float aboveDust=mix(.48,1.,exposure);
     float patina=.67+.15*runoff+.10*(1.-lime);
     float dressed=dot(gl_FragColor.rgb,vec3(.26,.60,.14));
     vec3 aged=dressed*mix(vec3(1.105,.973,.825),vec3(1.12,.994,.872),lime)
       *mix(.84,.97,lime);
     gl_FragColor.rgb=mix(gl_FragColor.rgb,aged,aboveDust*patina*(1.-.43*masonryPhase));
     float weatherLight=aboveDust*(.44+.56*lime)*(1.-facadeCavity)*(1.-.76*masonryPhase);
     gl_FragColor.rgb*=mix(vec3(1.),vec3(.984,.976,.916),aboveDust*(1.-masonryPhase)*(1.-towerFace));
     gl_FragColor.rgb+=weatherLight*(vec3(.057,.045,.006)+towerFace*vec3(.030,.030,.028));
     // A lit cupola retains its rim in the ochre daylight. The arcade below
     // it and the colonnade in the reverse view have much deeper shadow.
     float sunPlane=rakingLight*(1.-.56*underside)*(1.-.65*facadeCavity);
     float faceLight=smoothstep(.08,.91,.65*sunPlane+.35*wallPlane);
     float dayReturn=mix(.64,.96,faceLight);
     dayReturn=mix(dayReturn,mix(.52,.79,faceLight),palaceBlock);
     dayReturn=mix(dayReturn,mix(.81,1.24,faceLight),towerFace);
     float duskReturn=mix(.44,.71,faceLight)*mix(1.,.82,carvedPier);
     float dryWeight=.57+.43*smoothstep(1.3,8.5,facadePoint.y);
     gl_FragColor.rgb*=mix(vec3(1.),mix(vec3(.992,1.013,.954)*dayReturn,
       vec3(.997,1.009,.958)*duskReturn,masonryPhase),dryWeight);
     // Sunlit drum faces lose their chalky lift before the patinated roof.
     // Shade on the reverse arcade and phase-two silhouette stay independent.
     float drumValue=dot(gl_FragColor.rgb,vec3(.23,.62,.15));
     float chalk=towerFace*(1.-masonryPhase)*smoothstep(.44,.53,drumValue);
     gl_FragColor.rgb*=mix(vec3(1.),vec3(.80,.76,.70),chalk*.97);
     float westDrum=towerFace*(1.-masonryPhase)*(1.-smoothstep(-58.,-32.,facadePoint.x));
     gl_FragColor.rgb*=mix(vec3(1.),vec3(.56,.50,.43),westDrum);
     // Above the dust the high flutes show a muted olive-brown face, even on
     // the sky side. Preserve the recesses when compressing the brightest stone.
     float exposedCourse=smoothstep(.12,.48,dot(gl_FragColor.rgb,vec3(.24,.63,.13)));
     float paleFace=exposedCourse*(.44+.56*dryStone)*(1.-.75*facadeCavity);
     vec3 dressedFace=mix(vec3(.983,.962,.932),vec3(.86,.81,.74),max(flutedShaft,carvedPier*.76));
     gl_FragColor.rgb*=mix(vec3(1.),dressedFace,paleFace*(1.-.70*masonryPhase));
     // 12 / 17.35 s: the remote galleries pick up ochre sky and dust. On the
     // near cupola the recessed side falls away from its brighter cornice.
     float galleryRange=smoothstep(48.,98.,distance(cameraPosition,facadePoint));
     float daylightCourse=1.-masonryPhase;
     float arcadeLift=palaceBlock*galleryRange*(1.-.80*underside)*(.50+.50*faceLight);
     gl_FragColor.rgb+=vec3(.063,.061,.045)*arcadeLift*daylightCourse;
     float shadedDrum=towerFace*(1.-smoothstep(.32,.79,rakingLight))*(1.-.71*underside);
     gl_FragColor.rgb*=1.-shadedDrum*.22*daylightCourse;
     gl_FragColor.rgb+=vec3(.035,.039,.029)*carvedPier*wallPlane*(.35+.65*faceLight)*daylightCourse;
     vec3 toViewer=normalize(cameraPosition-facadePoint);
     vec3 sidelight=normalize(vec3(.88,.18,-.45));
     float sunlightOnFacet=dot(faceNormal,sidelight);
     float slotShadow=(1.-smoothstep(-.44,.44,sunlightOnFacet));
     float silhouette=1.-smoothstep(.08,.69,max(0.,dot(faceNormal,toViewer)));
     float cutFlute=flutedShaft*openSky*daylightCourse;
     gl_FragColor.rgb*=1.-cutFlute*clamp(.56*slotShadow+.23*silhouette,0.,.68);
     // In each west arcade pair the outer shaft is under the upper gallery.
     // The dark shaft at 26 and 29 s still catches a narrow light on its flutes.
     float coveredBay=1.-smoothstep(3.2,6.5,min(distance(facadePoint.xz,coveredShafts.xy),distance(facadePoint.xz,coveredShafts.zw)));
     float narrowRim=silhouette*smoothstep(.04,.67,sunlightOnFacet);
     gl_FragColor.rgb*=1.-cutFlute*coveredBay*(.58-.41*narrowRim);
     float lightDrum=towerFace*(1.-underside)*smoothstep(.08,.60,sunlightOnFacet);
     gl_FragColor.rgb+=vec3(.050,.047,.027)*lightDrum*daylightCourse;
     gl_FragColor.rgb*=1.-towerFace*(1.-underside)*.09*slotShadow*daylightCourse;
     #include <premultiplied_alpha_fragment>`);
  };material.customProgramCacheKey=()=> 'reference-arena-masonry-'+masonryPalette.get(material);
 }
 // ---- Landmarks beyond the rail.  Bearings were read from the recording's compass (see arena-layout.js);
 // every structure rises from the lower terraces, so only its upper storeys show above the wall.
 const underpin=(x,z,r,sides=8)=>{const o=mesh(new T.CylinderGeometry(r,r*1.04,46,sides),stone,x,-23,z);o.rotation.y=Math.PI/8;return o;};
 // The eastern cupola and carved pier share the tree-side skyline in the first gravity volley.
 // Their compass bearings use the same terrace centre as the colonnade.
 // Domed octagonal towers stand apart: east of the entrance side and south-east (primary 12.5, 17.3, 24.5, 49.5 s).
 // Primary 16.6 s: the whole dome and finial of the tower stand inside the picture above the rail, about twice as
 // tall as wide; the earlier 32 m towers were cropped by the frame in the matching view.
 for(const [x,z,h] of [[...ringPoint(80,105),38],[...ringPoint(153,113),37]]){palaceTower(x,z,h,Math.atan2(ARENA.cx-x,ARENA.cz-z));underpin(x,z,h*.30);}
 // A smaller arcaded cupola sits beyond the west colonnade. The shaft
 // scales in front of its roof when the parry camera turns along the rail.
 // The gallery has a detached cupola at either end. The two shoulders of
 // the Divine Gate, visible on the return at 137 s, have no cupolas.
 {
  const h=37,[x,z]=ringPoint(254.5,146);
  palaceTower(x,z,h,Math.atan2(ARENA.cx-x,ARENA.cz-z));underpin(x,z,h*.30);
 }
 // Tiered carved piers: one beside the tree, one in the middle of the colonnade (primary 12.5, 125.3 s).
 for(const [x,z,height] of [[...ringPoint(44.5,81),149],[...ringPoint(188.9,92),127]]){
   const southern=x<0;
   const pier=makeCarvedPillar(scene,pierStone,pierShade,x,z,height,southern);
   if(southern) pier.scale.set(1.02,.98,1.02);
   else pier.scale.setScalar(.79);
   pier.position.y=-3;underpin(x,z,southern?7.4:5.9);
 }
 // Crowned palace behind the entrance side (primary 12.5, 29.7, 49.5 s): two crowned octagons, a bridge and spires.
 const [galleryX,galleryZ]=ringPoint(113,120);
 const palacePlace={x:galleryX,y:0,z:galleryZ,rotation:Math.atan2(-galleryX,ARENA.cz-galleryZ),scale:[1.16,1.30,1.0]};
 makeCrownedPalace(scene,palaceStone,palaceShade,false,palacePlace);
 const [westX,westZ]=ringPoint(236,162);
 makeCrownedPalace(scene,palaceStone,palaceShade,false,{x:westX,y:-12,z:westZ,
   rotation:Math.atan2(ARENA.cx-westX,ARENA.cz-westZ),scale:[.94,.81,.85]});
 {const under=mesh(new T.BoxGeometry(74,46,20),stone,palacePlace.x,-23,palacePlace.z);under.rotation.y=palacePlace.rotation;}
 // ---- Rebuilt terrace: gate hill and piers, boundary rail, colonnade, rubble and the great tree.
 const gate=buildGate({scene,gateStone,ground:groundAt,phase:skyMat.uniforms.phase,adaptive:!fullShadows});
 buildRail({scene,stone,dark});
 for(const [i,[theta,distance,height,radius,broken,hangingFoot=0]] of colonnade.entries()){
   const [x,z]=ringPoint(theta,distance);
   buildColumn({scene,stone,shaftStone,fractureStone:dark,x,z,height,radius,broken,hangingFoot,capital:!hangingFoot,seed:i*7.3+1});
 }
 const rubble=[];
 buildRubble({scene,stone,shaftStone,ground:groundAt,register:g=>rubble.push(rubbleFootprint(g))});
 buildGreatTree(scene,{time:skyMat.uniforms.time,phase:skyMat.uniforms.phase,hazeColor:skyMat.uniforms.hazeColor});

 // Light entering through the distant gap forms tapered bands in the ash
 // haze. Their feet stay on the far rim when the camera turns after the fight.
 const rayUniforms={phase:skyMat.uniforms.phase,time:skyMat.uniforms.time,cloudField:skyMat.uniforms.cloudField};
 // Integrate dust along the camera ray through a tapered, world-space
 // volume. The near boundary participates in the normal scene depth test.
 const shafts=new T.ShaderMaterial({uniforms:rayUniforms,transparent:true,depthWrite:false,side:T.FrontSide,
   vertexShader:`uniform float phase;attribute float daylightRay,colonnadeRay;varying float isDaylight,isColonnade;varying vec3 volumePoint,localRay,worldHit;varying float rayScale;
     void main(){
       isDaylight=daylightRay;isColonnade=colonnadeRay;
       if(mix(phase,1.-phase,isDaylight)<.002){gl_Position=vec4(2.,2.,2.,1.);return;}
       mat4 world=modelMatrix*instanceMatrix;
       vec4 point=world*vec4(position,1.);
       vec3 eye=(inverse(world)*vec4(cameraPosition,1.)).xyz;
       vec3 ray=position-eye;rayScale=length(point.xyz-cameraPosition)/max(.001,length(ray));
       localRay=ray;volumePoint=position;worldHit=point.xyz;
       gl_Position=projectionMatrix*viewMatrix*point;
     }`,
   fragmentShader:'varying float isDaylight,isColonnade;varying vec3 volumePoint,localRay,worldHit;varying float rayScale;uniform float time,phase;uniform sampler2D cloudField;'+noise+`void main(){
     float phaseWeight=mix(phase,1.-phase,isDaylight);
     if(phaseWeight<.002)discard;
     vec3 ray=normalize(localRay);
     // Cylinder tapers from 1 at its base to .55 at the cloud break.
     float r0=.775-.45*volumePoint.y,kr=-.45*ray.y;
     float A=dot(ray.xz,ray.xz)-kr*kr;
     float B=dot(ray.xz,volumePoint.xz)-kr*r0;
     float C=dot(volumePoint.xz,volumePoint.xz)-r0*r0;
     float disc=max(0.,B*B-A*C);
     float wall=abs(A)>.0001?(-B+sqrt(disc))/A:10.;
     float lid=abs(ray.y)>.0001?((ray.y>0.?.5:-.5)-volumePoint.y)/ray.y:100.;
     float walk=min(lid,wall>.001?wall:lid);
     float scatter=0.;
     vec3 viewRay=normalize(worldHit-cameraPosition);
     for(int i=0;i<7;i++){
       vec3 p=volumePoint+ray*walk*(float(i)+.5)/7.;
       float y=p.y+.5,r=mix(1.,.55,y);
       vec3 at=worldHit+viewRay*walk*rayScale*(float(i)+.5)/7.;
       // Project the gap in the cloud onto the ground. Strong changes in
       // density along Y made the shaft look like a stack of horizontal rungs.
       vec2 fieldUV=.5+at.xz/310.+vec2(time*.00006,0.);
       vec4 air=texture2D(cloudField,fieldUV);
       float border=length(p.xz+vec2(air.b-.50,air.g-.50)*.16)/r;
       float edge=1.-smoothstep(.04,.98,border);
       float dust=noise(p.xz*3.3+vec2(y*1.4,time*.013));
       float fibers=noise(p.xz*8.6+vec2(dust,y*.73));
       float cloud=smoothstep(.01,.15,y)*(1.-smoothstep(.80,1.,y));
       float opening=1.-mix(air.r,air.g,phase);
       float lanes=.40+.60*smoothstep(.21,.79,dust+.32*(fibers-.5));
       scatter+=edge*cloud*(.49+.92*opening)*lanes;
     }
     float thickness=scatter*clamp(walk*rayScale,0.,65.)/7.;
     float gate=(1.-smoothstep(-83.,-56.,worldHit.z))*smoothstep(.02,.67,-viewRay.z);
     float sunlight=max(0.,dot(viewRay,normalize(vec3(.861,.454,.231))));
     float mintOpening=smoothstep(.92,.986,dot(viewRay,normalize(vec3(.18,.38,-.91))));
     float farSide=1.-.87*smoothstep(.46,.87,viewRay.z);
     float duskAlpha=mix((.25+.43*gate)*(1.-.61*mintOpening)*farSide,.36,isColonnade);
     float alpha=phaseWeight*mix(duskAlpha,.145+.21*sunlight*sunlight,isDaylight)
       *(1.-exp(-thickness*mix(.044,.039,isDaylight)));
     vec3 dusk=mix(vec3(.77,.57,.25),vec3(2.05,1.61,.76),gate);
     dusk=mix(dusk,vec3(1.62,1.25,.61),isColonnade);
     gl_FragColor=vec4(mix(dusk,vec3(1.95,1.74,1.16),isDaylight),alpha);
   }`});
 // Primary 133.8Ã¢â‚¬â€œ136.1 s: either side of the gate, the bases spread
 // outward and the tops lean inward. The mint opening stays visible between them.
 const columns=[[-26,-90,10.8,36,92],[-57,-89,8.3,16,89],[-21,-106,5.0,4,97],[48,-101,15.7,-14,111],
   [60,-93,6.5,-17,88],[89,-74,10.6,-21,83],[-71,-41,8.0,-6,100],[-77,-9,12.4,19,127]];
 columns.push([-37,-105,3.2,27,100],[-6,-108,6.0,11,107],[70,-99,4.5,-18,95]);
 // Source 110Ã¢â‚¬â€œ113 s. Warm slanting bands behind the dark uprights; their
 // lower ends stay outside the terrace when the player circles the boss.
 const colonnadeStart=columns.length;
 for(const [bearing,width,height] of [[168,5.6,89],[180,3.9,97],[202,7.3,108]]){
   const [x,z]=ringPoint(bearing,106);
   columns.push([x,z,width,12,height,-29]);
 }
 const dayStart=columns.length;
 // The day shafts rake through the crown toward the far terrace. The
 // gate fans in the nighttime shot have their own bearings and cross-section.
 columns.push([49,29,8.8,64,52],[60,9,4.6,55,47],[60,-12,7.3,67,56],
   [85,-24,3.5,49,53],[28,56,7.6,62,47],[8,61,4.2,59,49],[-34,-69,5.8,43,61]);
 const volume=new T.CylinderGeometry(.55,1,1,28,1,false);
 volume.setAttribute('daylightRay',new T.InstancedBufferAttribute(Float32Array.from(columns,(_,i)=>Number(i>=dayStart)),1));
 volume.setAttribute('colonnadeRay',new T.InstancedBufferAttribute(Float32Array.from(columns,(_,i)=>Number(i>=colonnadeStart&&i<dayStart)),1));
 const lightColumns=new T.InstancedMesh(volume,shafts,columns.length);
 const up=new T.Vector3(0,1,0);
 for(const [i,[x,z,width,dx,height,dz]] of columns.entries()){
   const low=new T.Vector3(x,-1,z),high=new T.Vector3(x+dx,height,z+(dz??(i>=dayStart?17:-8)));
   const axis=high.clone().sub(low),obj=new T.Object3D();
   obj.position.copy(low).lerp(high,.5);obj.quaternion.setFromUnitVectors(up,axis.clone().normalize());
   obj.scale.set(width,axis.length(),width);obj.updateMatrix();lightColumns.setMatrixAt(i,obj.matrix);
 }
 lightColumns.name='distant-ash-light-shafts';lightColumns.computeBoundingSphere();scene.add(lightColumns);
 const dustGeo=new T.BufferGeometry(),dustPositions=[];for(let i=0;i<420;i++)dustPositions.push((rnd()-.5)*130,.25+rnd()*.65,(rnd()-.5)*130-20);dustGeo.setAttribute('position',new T.Float32BufferAttribute(dustPositions,3));const dustMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'uniform float time;varying float alpha;void main(){vec3 p=position;p.x+=sin(time*.09+position.z)*2.;p.y+=sin(time*.3+position.x)*.15;vec4 mv=modelViewMatrix*vec4(p,1.);if(mv.z>=-9.){alpha=0.;gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}gl_Position=projectionMatrix*mv;gl_PointSize=min(360.,6400./max(1.,-mv.z));float densityBand=.5+.5*sin(position.x*.12+position.z*.18);alpha=(.009+.020*densityBand)*smoothstep(9.,30.,-mv.z);}',fragmentShader:'varying float alpha;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>=1.)discard;float a=1.-sqrt(r);gl_FragColor=vec4(.79,.74,.60,alpha*a*a);}'});scene.add(new T.Points(dustGeo,dustMat));
 scene.updateMatrixWorld(true);
 const masonryBatches=new Map(),oldMasonry=[];
 scene.traverse(object=>{
   if(!object.isMesh||object.isInstancedMesh||object.userData.preparationOnly||!masonryPalette.has(object.material))return;
   if(!masonryBatches.has(object.material))masonryBatches.set(object.material,[]);
   const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
   if(!fullShadows&&!geometry.index){
     const count=geometry.attributes.position.count;
     const indices=count<=65535?new Uint16Array(count):new Uint32Array(count);
     for(let i=0;i<count;i++)indices[i]=i;
     geometry.setIndex(new T.BufferAttribute(indices,1));
   }
   masonryBatches.get(object.material).push(geometry);
   oldMasonry.push(object);
 });
 for(const object of oldMasonry)object.removeFromParent();
 for(const [material,geometries] of masonryBatches){
   // Keep the source vertex cache on indexed carvings in interactive play.
   const parts=fullShadows?geometries.map(g=>g.index?g.toNonIndexed():g):geometries;
   const merged=mergeGeometries(parts);
   if(merged){
     const mesh=new T.Mesh(merged,material);
     mesh.receiveShadow=true;mesh.name='arena-masonry';mesh.userData.stoneFinish=masonryPalette.get(material);
     scene.add(mesh);
   }
 }

 let phaseBlend=0,phaseClock=null;
 const PHASE_EASE_IN=3.2,PHASE_EASE_OUT=1.2,SUN_ONE=new T.Color(0xffe9c2),SUN_TWO=new T.Color(0xffdf96),sunFrom=new T.Vector3(),sunTo=new T.Vector3();
 const HAZE_ONE=new T.Color().setRGB(.325,.313,.246),HAZE_TWO=new T.Color().setRGB(.093,.090,.067);

 const skylightDay=new T.Color(0xe0e6e2),skylightDusk=new T.Color(0xc1cbc8);
 const bounceDay=new T.Color(0x746950),bounceDusk=new T.Color(0x5a4a39);
 const sight={eye:{value:new T.Vector3()},focus:{value:new T.Vector3()},enabled:{value:0}};
 for(const material of [stone,dark,pierStone,pierShade,palaceStone,palaceShade]){const finishStone=material.onBeforeCompile;material.customProgramCacheKey=()=>'weathered-stone-with-occlusion-aa-'+masonryPalette.get(material);material.onBeforeCompile=shader=>{finishStone.call(material,shader);Object.assign(shader.uniforms,{sightEye:sight.eye,sightFocus:sight.focus,sightEnabled:sight.enabled});shader.vertexShader='varying vec3 sightWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nsightWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader='varying vec3 sightWorld;uniform vec3 sightEye;uniform vec3 sightFocus;uniform float sightEnabled;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
 if(sightEnabled>.5){vec3 sightRay=sightFocus-sightEye;float sightLength=length(sightRay);vec3 sightDir=sightRay/max(.01,sightLength);float sightAlong=dot(sightWorld-sightEye,sightDir);float sightSide=length(sightWorld-sightEye-sightDir*sightAlong);if(sightAlong>0.&&sightAlong<sightLength-.25&&sightSide<1.25)discard;}`);};material.needsUpdate=true;}
 const clothGroundHeight=(x,z)=>ashFloor.surfaceHeightAt(x,z)+stairRecess(x,z);
 clothGroundHeight.maximum=(x,z,radius)=>ashFloor.maxSurfaceHeight(x,z,radius)+stairRecess(Math.max(0,Math.abs(x)-radius),z-radius);
 const walkGround=shoalSurface(clasts.attributes.position.array,clothGroundHeight);
 // Feet, effects and the camera often query the same actor position in a frame.
 // Keep the exact analytic answer, including on ridges and at the stair lip.
 const recentGround=Array.from({length:4},()=>({x:NaN,z:NaN,y:0}));
 let nextGround=0;
 function encounterHeight(x,z){
   for(const sample of recentGround)if(x===sample.x&&z===sample.z)return sample.y;
   const sample=recentGround[nextGround];nextGround=(nextGround+1)%recentGround.length;
   sample.x=x;sample.z=z;sample.y=groundAt(x,z);return sample.y;
 }
 return {walkGround,constrainWalk(pos){constrainRubble(pos,rubble);},gateZ:ARENA.gateZ,arena:ARENA,illuminateAsh(pos,power){ashFlashCenter.value.copy(pos);ashFlashPower.value=power;},groundHeight:encounterHeight,clothGroundHeight,entranceHeight,cameraOcclusion(eye,player,enabled,feet=0){ashLight.ashSightEye.value.copy(eye);ashLight.ashSightFoot.value.copy(player);ashLight.ashSightFoot.value.y+=encounterHeight(player.x,player.z)+.39;ashLight.ashSightWeight.value=enabled?feet:0;sight.eye.value.copy(eye);sight.focus.value.copy(player).add(new T.Vector3(0,1.1,0));sight.enabled.value=enabled?1:0;},mist,ready:Promise.all([ready,gate.userData.detailReady,remainsRelief.ready,ashFieldsReady,towerReady,reflections?.ready,sunReady,ashGrainReady,skyMat.userData.ready]),get phaseBlend(){return phaseBlend;},
  setShadowQuality,
  // Review stills: jump straight to the settled light of a phase.
  settlePhase(phase,player){phaseBlend=phase===2?1:0;applyPhase(player);},
  tick(t,phase,player,stage='combat'){const outside=['mist','entry','return'].includes(stage);preparation.visible=outside;preparationFloor.visible=outside;floor.visible=!outside;dustMat.uniforms.time.value=t;gateHaze.time.value=t;skyMat.uniforms.time.value=t;mistMat.uniforms.time.value=t;
   // The light does not switch between the phases: it eases over, starting with the transition scene.
   const step=phaseClock===null?0:Math.min(.1,Math.max(0,t-phaseClock));phaseClock=t;
   const goal=phase===2?1:0;
   phaseBlend=goal>phaseBlend?Math.min(goal,phaseBlend+step/PHASE_EASE_IN):Math.max(goal,phaseBlend-step/PHASE_EASE_OUT);
   applyPhase(player);}};
 // Sky, haze and lights of the two phases.  Haze colours are scene-linear, solved through the display chain from the
 // recording: phase one 182,175,142 (pale ash haze, primary 12.5 / 17.5 s), phase two 92,86,62 (primary 104 / 135 s).
 function applyPhase(player){
  const k=phaseBlend*phaseBlend*(3-2*phaseBlend),mix=T.MathUtils.lerp;
  gateHaze.phaseTwo.value=k;skyMat.uniforms.phase.value=k;
  // Phase two (primary 135.9 s): the gold light from the opening rakes the pale ash, so the key is a little stronger.
  sun.color.copy(SUN_ONE).lerp(SUN_TWO,k);sun.intensity=mix(2.92,3.76,k);
  ambient.color.copy(skylightDay).lerp(skylightDusk,k);
  ambient.groundColor.copy(bounceDay).lerp(bounceDusk,k);
  ambient.intensity=mix(.55,.34,k);scene.environmentIntensity=mix(.93,1.05,k);
  reflections?.setPhase(k);
  sun.target.position.set(player.x,0,player.z);
  sunFrom.copy(ARENA.sunDirection).multiplyScalar(110).add(sun.target.position);
  sunTo.copy(ARENA.gateLightDirection).multiplyScalar(110).add(sun.target.position);
  sun.position.copy(sunFrom).lerp(sunTo,k);
  const lightDirection=ashLight.ashSun.value.copy(sun.position).sub(sun.target.position).normalize();
  if(stabilizeShadow){
    // Lock the moving orthographic footprint to whole shadow texels.
    // Translate both endpoints equally to preserve the phase lighting direction.
    const camera=sun.shadow.camera,center=sun.target.position;
    shadowRight.crossVectors(camera.up,lightDirection).normalize();
    shadowUp.crossVectors(lightDirection,shadowRight);
    const dx=(camera.right-camera.left)/sun.shadow.mapSize.x;
    const dy=(camera.top-camera.bottom)/sun.shadow.mapSize.y;
    const x=center.dot(shadowRight),y=center.dot(shadowUp);
    shadowShift.copy(shadowRight).multiplyScalar(Math.round(x/dx)*dx-x)
      .addScaledVector(shadowUp,Math.round(y/dy)*dy-y);
    center.add(shadowShift);
    sun.position.add(shadowShift);
  }
  ashLight.ashFill.value=mix(1.16,1.02,k);ashLight.ashPhase.value=k;
  scene.fog.density=mix(PHASE_ONE_DENSITY,PHASE_TWO_DENSITY,k);scene.fog.color.copy(HAZE_ONE).lerp(HAZE_TWO,k);
  skyMat.uniforms.hazeDensity.value=scene.fog.density;skyMat.uniforms.hazeColor.value.copy(scene.fog.color);
 }
}
