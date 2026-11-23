// Simulated travelling cloak for the player duelist.
//
// The previous cape was a flat card rigidly parented to the chest: it tilted like a board whenever the torso
// leaned. This is a ring-and-column cloth pinned at the collar and shoulders. Its particles live in world space,
// so the hem lags behind starts, streams back in a sprint, swings out on a thrust and drapes over the legs.
import * as T from "game/lib/three.module.js";
import {updateClothNormals} from "game/src/cloth-normals.js";

const ROWS=13,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const {clamp,lerp}=T.MathUtils;

export function createPlayerCloak(actor,sourceMaterial){
 // Live play uses a lighter constraint lattice. Keep all rows and body contacts.
 const COLS=actor.liveCloth?32:56;
 const count=COLS*ROWS,rest=new Float32Array(count*3),pos=new Float32Array(count*3),prev=new Float32Array(count*3);
 const colLen=new Float32Array(count),ringLen=new Float32Array(count);
 const rowMinimum=new Float32Array(ROWS),rowMaximum=new Float32Array(ROWS);
 const sinAngle=new Float64Array(count),cosAngle=new Float64Array(count);
 const foldOffset=new Float64Array(count),hemDrop=new Float64Array(count);
 const waves=new Float64Array(count),gusts=new Float64Array(count),sails=new Float64Array(count);
 const waveSin=new Float64Array(count),waveCos=new Float64Array(count);
 const gustASin=new Float64Array(COLS),gustACos=new Float64Array(COLS);
 const gustBSin=new Float64Array(count),gustBCos=new Float64Array(count);
 const cutIndex=new Uint16Array(count),cutBlend=new Float64Array(count);
 const pinned=new Float64Array(2*COLS*3);
 const index=(k,j)=>(k*COLS+j)*3;
 // Primary 13.37s (encounter 17.40s) shows the side of the body under the trailing cloak.
 // Keep the collar close, then cut the two front edges back toward the arms.
 const angleAt=(k,j)=>{
  const drop=k/(ROWS-1),halfSpan=Math.PI-lerp(.16,1.23,Math.sqrt(drop));
  return (2*j/(COLS-1)-1)*halfSpan;
 };
 // Rest shape in actor-root coordinates on the relaxed skeleton: collar, shoulder line, then a bell that is
 // longer behind than in front. Angle 0 is the middle of the back.
 for(let k=0;k<ROWS;k++)for(let j=0;j<COLS;j++){
  const a=angleAt(k,j),back=(Math.cos(a)+1)*.5,i=index(k,j);
  const particle=k*COLS+j,fall=k/(ROWS-1),edge=(k-(ROWS-4))/3;
  sinAngle[particle]=Math.sin(a);cosAngle[particle]=Math.cos(a);
  const wave=2.2*sinAngle[particle]-(k-1)/(ROWS-2)*2.5,across=j*55/(COLS-1);
  waveSin[particle]=Math.sin(wave);waveCos[particle]=Math.cos(wave);
  gustASin[j]=Math.sin(across*.21);gustACos[j]=Math.cos(across*.21);
  gustBSin[particle]=Math.sin(k*.5+across*.4);gustBCos[particle]=Math.cos(k*.5+across*.4);
  const cut=lerp(.31,.12,k/(ROWS-1))*(COLS-1),sample=cut+j*(1-2*cut/(COLS-1));
  cutIndex[particle]=Math.floor(sample);cutBlend[particle]=sample-cutIndex[particle];
  // The loose panels diverge below the shoulder, then bunch together at the hem.
  const panelAngle=a+.10*Math.sin(3*a+.6)+.21*fall*Math.sin(2*a-.8);
  const panel=Math.sin(6*panelAngle+.85*fall)+.45*Math.sin(3*panelAngle-.4);
  foldOffset[particle]=(.036*fall+.030*fall*fall)*panel;
  hemDrop[particle]=(.23*Math.cos(5*a+.4)+.17*Math.sin(3*a))*edge*edge;
  let y,rx,rz;
  if(k===0){y=1.515;rx=.115;rz=.105;}
  else{
   const s=(k-1)/(ROWS-2),hem=lerp(.82,.31,back)+.12*Math.sin(a*3+.4)+.035*Math.sin(7*a);
   y=lerp(1.445,hem,Math.pow(s,.95));rx=lerp(.24,.525,Math.pow(s,.72));rz=lerp(.155,.485,Math.pow(s,.72));
   // Heavy hanging pleats (primary 17-18 s, 29-33 s): the cloth is fuller than the bell it hangs on.
   const pleat=1+(.115*Math.sin(7*panelAngle+1.3)+.078*Math.sin(11*panelAngle+.4)+.025*Math.sin(19*panelAngle-.9))*Math.pow(s,.7);rx*=pleat;rz*=pleat;
  }
  rest[i]=Math.sin(a)*rx;rest[i+1]=y;rest[i+2]=.035+Math.cos(a)*rz*(Math.cos(a)<0?.82:1);
 }
 for(let k=0;k<ROWS;k++)for(let j=0;j<COLS;j++){
  const i=index(k,j),n=index(k,Math.min(j+1,COLS-1));
  ringLen[k*COLS+j]=Math.hypot(rest[i]-rest[n],rest[i+1]-rest[n+1],rest[i+2]-rest[n+2]);
  if(k>0){const u=index(k-1,j);colLen[k*COLS+j]=Math.hypot(rest[i]-rest[u],rest[i+1]-rest[u+1],rest[i+2]-rest[u+2]);}
 }
 const geometry=new T.BufferGeometry(),uv=new Float32Array(count*2),vertices=new Float32Array(count*3),indices=[];
 for(let k=0;k<ROWS;k++)for(let j=0;j<COLS;j++){
  const o=(k*COLS+j)*2;uv[o]=j/(COLS-1);uv[o+1]=1-k/(ROWS-1)*.985;
 }
 for(let k=0;k<ROWS-1;k++)for(let j=0;j<COLS-1;j++){
  const a=k*COLS+j,b=a+1,c=a+COLS,d=c+1;indices.push(a,c,b,b,c,d);
 }
 geometry.setAttribute('position',new T.BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setIndex(indices);
 // Ash wool stained toward the hem, with a narrow tarnished braid. The
 // warp yarn follows the pleats, including where the lower panels twist.
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pixels=c.createImageData(w,h);
 const noise=i=>{const n=Math.sin(i*127.1+1.7)*43758.5453;return n-Math.floor(n);};
 const grain=new Float32Array(128*128);
 for(let i=0;i<grain.length;i++)grain[i]=noise(1900+i);
 const wool=(x,y)=>{
  const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
  const x0=ix&127,x1=(ix+1)&127,r0=(iy&127)*128,r1=((iy+1)&127)*128;
  return lerp(lerp(grain[r0+x0],grain[r0+x1],u),lerp(grain[r1+x0],grain[r1+x1],u),v);
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const v=y/(h-1),a=x/w*2*Math.PI;
  const lane=a+.048*Math.sin(a*3+v*5)+.085*v*Math.sin(a*3-v*4);
  const ridge=Math.cos(8*lane+.7)+.42*Math.cos(15*lane+.6);
  const dust=(.5+.5*Math.sin(3*lane+1.3))*(.5+.5*Math.cos(5*v+lane));
  const rag=Math.pow(v,2)*(.4+.6*dust);
  const weave=2.5*Math.sin(x*2.1+v*8)+2*Math.cos(2*y+x*.05)+4*noise(x+w*y);
  const streak=.5+.5*Math.cos(lane*38+2.7*Math.sin(8*lane)+1.3*Math.sin(17*lane+v*5));
  const fleck=.5+.5*Math.sin(x*.047+2.2*Math.sin(y*.092+x*.11))*Math.cos(y*.035+lane*11);
  const stain=dust*(.25+.75*v)*streak*fleck;
  // Broad washed-out fold edges remain legible behind the beast mask, even at play resolution.
  const wornFold=Math.max(0,ridge-.14)*(.35+.65*v);
  const patch=wool(x/24+1.8*Math.sin(3*lane+v*4),y/54);
  const nap=wool(x/6+patch*2,y/13+patch);
  const ash=clamp((.56-patch)*2.8,0,1)*clamp((.83-nap)*1.9,0,1);
  const fiber=wool(x/2.7+patch*2.4,y/6.5);
  const light=142+17*ridge+11*dust+9*wornFold-29*rag-37*stain-17*(1-v)**5+weave
   +16*(nap-.5)+12*(fiber-.5)-42*ash*(.17+.83*v);
  const i=4*(x+w*y);
  pixels.data[i]=light+6+8*rag+8*stain+4*wornFold;pixels.data[i+1]=light+5+2*wornFold;pixels.data[i+2]=light+7-4*rag-7*stain;pixels.data[i+3]=255;
 }
 c.putImageData(pixels,0,0);
 // The back panel in primary 17 s and 111.5 s has worn, mottled areas between
 // the long pleats. Bake the wear at garment scale so it survives mipmapping.
 for(let patch=0;patch<115;patch++){
  const x=w*noise(531+patch),y=h*(.12+.91*noise(753+patch));
  const width=3+17*noise(921+patch),length=9+48*noise(1105+patch);
  const dark=patch%4!==0;
  const pigment=dark?'60,48,37':'197,183,155';
  c.fillStyle='rgba('+pigment+','+(dark?.135:.12)+')';
  const lean=(noise(1267+patch)-.5)*13;
  for(let strand=0;strand<6;strand++){
   const seed=patch*6+strand+1500;
   const start=x+(noise(seed)-.5)*width,tip=y+length*(.5+.5*noise(seed+113));
   const breadth=width*(.12+.25*noise(seed+257));
   c.beginPath();c.moveTo(start,y-length);
   c.bezierCurveTo(start-breadth,y-length*.18,start+lean-breadth,y+length*.32,start+lean,tip);
   c.bezierCurveTo(start+lean+breadth,y+length*.16,start+breadth,y-length*.37,start,y-length);
   c.fill();
  }
 }
 for(const [y,color,width] of [[.875,'rgba(74,66,55,.40)',3],[.886,'rgba(194,176,140,.65)',2],[.90,'rgba(91,80,65,.48)',5],[.914,'rgba(185,167,137,.50)',1.8]]){
  c.lineWidth=width;c.strokeStyle=color;c.beginPath();
  for(let x=0;x<=w;x+=2){const a=x/w*Math.PI*2,yy=y*h+2.5*Math.sin(5*a)+4*Math.cos(2*a);if(x)c.lineTo(x,yy);else c.moveTo(x,yy);}
  c.stroke();
 }
 c.globalCompositeOperation='destination-out';
 c.fillStyle='#000';
 // A few longer splits interrupt the braid and separate loose tails at full-body distance.
 for(const [u,depth,lean] of [[.085,.10,-.012],[.23,.25,.018],[.41,.14,-.008],[.58,.09,.009],[.685,.28,-.022],[.86,.12,.008]]){
  const x=w*u,tip=h*(1-depth);
  c.beginPath();c.moveTo(x-6,h);c.lineTo(x-5,h-19);
  c.lineTo(x+lean*w-1,tip+9);c.lineTo(x+lean*w,tip);
  c.lineTo(x+lean*w+2,tip+15);c.lineTo(x+4,h-13);c.lineTo(x+12,h);c.fill();
 }
 for(let j=0;j<165;j++){
  const x=w*noise(j),depth=6+12*noise(330+j)+(j%19===0?46*noise(17+j):0),wide=1.4+2.7*noise(j+4);
  c.beginPath();c.moveTo(x-wide,h);c.lineTo(x+Math.sin(j)*4,h-depth);c.lineTo(x+wide,h);c.fill();
 }
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=T.RepeatWrapping;map.anisotropy=8;
 const material=new T.MeshStandardMaterial({map,roughness:.96,metalness:0,side:T.DoubleSide,alphaTest:.42});
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n if(!gl_FrontFacing)diffuseColor.rgb*=vec3(.53,.50,.47);');
 };
 material.customProgramCacheKey=()=> 'duelist-ash-wool-v1';
 const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='duelist-cloak';
 actor.scene.add(mesh);
 const bone=suffix=>Object.values(actor.bones).find(b=>b.name.endsWith(suffix));
 const chest=bone('Spine2'),hips=bone('Hips');
 // Colliders: a tapered skirt volume keeps the cloak outside the wearer's own tunic; limbs push through it.
 const capsules=[['Spine2','Neck',.17,.17],['LeftUpLeg','LeftLeg',.125,.11],['RightUpLeg','RightLeg',.125,.11],['LeftLeg','LeftFoot',.095,.08],['RightLeg','RightFoot',.095,.08],
  ['LeftArm','LeftForeArm',.08,.07],['RightArm','RightForeArm',.08,.07],['LeftForeArm','LeftHand',.065,.06],['RightForeArm','RightHand',.065,.06]].map(([a,b,ra,rb])=>({a:bone(a),b:bone(b),ra,rb,pa:V(),pb:V()}));
 const skirt={ra:.245,rb:.385,pa:V(),pb:V()};capsules.unshift(skirt);
 // The front opening sits behind the wearer’s arms in the source. A wrist
 // anchor alone misses both the knuckles and the two projecting quillons.
 // These shapes are in the same pivot coordinates as the equipped meshes.
 const handContacts=['Left','Right'].map(side=>({
  a:bone(side+'Hand'),b:bone(side+'HandMiddle1'),pa:V(),pb:V(),ra:.082,rb:.071
 }));
 const armContacts=capsules.slice(-4),weaponContacts=new WeakMap();
 const surface=new Float32Array(count*3),carryOffset=new Float32Array(count*3);
 let carryBlend=0;
 function contactShape(weapon){
  const parts=[];
  const edge=(ax,ay,bx,by,r)=>parts.push({a:V(ax,ay,0),b:V(bx,by,0),pa:V(),pb:V(),ra:r,rb:r});
  const length=weapon.length;
  if(weapon.side==='Right'){
   edge(0,-.115*length,0,.14,.052);
   edge(0,.14,0,.885*length,.061);
   for(const sign of [-1,1]){
    edge(sign*.015,.122,sign*.15,.067,.036);
    edge(sign*.15,.067,sign*.275,-.074,.034);
   }
  }else{
   const scale=length/.61;
   edge(0,-.11*scale,0,.505*scale,.050);
   edge(.045*scale,-.09*scale,.154*scale,.075*scale,.073);
   edge(-.075*scale,.105*scale,.13*scale,.105*scale,.045);
  }
  return parts;
 }
 // A sloping tangent around the rear of a capsule also guides neighbouring
 // vertices. Simply pushing the vertices inside its radius leaves triangles
 // stretched through the wrist between them.
 function clearSurface(c,r,backX,backZ){
  const ay=c.pa.y,dy=c.pb.y-ay,dx=c.pb.x-c.pa.x,dz=c.pb.z-c.pa.z;
  const lateral=dx*backZ-dz*backX,depth=dx*backX+dz*backZ;
  const ax=c.pa.x*backZ-c.pa.z*backX,az=c.pa.x*backX+c.pa.z*backZ;
  const slope=1.25,height=r*Math.sqrt(1+slope*slope),maxRise=Math.max(0,depth)+height;
  const projected=lateral*lateral+dy*dy,curvature=slope*slope*projected-depth*depth;
  const inv=curvature>1e-8?1/projected:0,bias=inv?depth*inv/Math.sqrt(curvature):0;
  const x0=Math.min(0,lateral),x1=Math.max(0,lateral),y0=Math.min(0,dy),y1=Math.max(0,dy);
  for(let i=0;i<vertices.length;i+=3){
   const x=vertices[i],z=vertices[i+2],back=x*backX+z*backZ-az,margin=(maxRise-back)/slope;
   if(margin<=0)continue;
   const y=vertices[i+1]-ay;
   if(y<y0-margin||y>y1+margin)continue;
   const cross=x*backZ-z*backX-ax;
   if(cross<x0-margin||cross>x1+margin)continue;
   const t=inv?clamp((cross*lateral+y*dy)*inv+bias*Math.abs(cross*dy-y*lateral),0,1):(depth>0?1:0);
   const u=cross-t*lateral,v=y-t*dy,lift=t*depth+height-back,d2=u*u+v*v;
   if(lift>0&&lift*lift>slope*slope*d2){
    const push=lift-slope*Math.sqrt(d2);
    vertices[i]+=push*backX;vertices[i+2]+=push*backZ;
   }
  }
 }
 let chestRestInverse=null,started=false,previousStep=0;
 const collar=V(),tmp=V(),lastRoot=V();
 const pin=new T.Matrix4(),velocity=V(),targetRest=new Float32Array(count*3);
 let stream=0;
 function measureRest(){
  // Chest frame of the relaxed skeleton with the actor at the origin.
  const saved=actor.thrustBasePose.map(b=>({bone:b.bone,q:b.bone.quaternion.clone(),p:b.bone.position.clone()}));
  const rp=actor.root.position.clone(),rq=actor.root.quaternion.clone(),vp=actor.visual.position.clone(),vq=actor.visual.quaternion.clone();
  for(const b of actor.thrustBasePose){b.bone.quaternion.copy(b.q);b.bone.position.copy(b.p);}
  actor.root.position.set(0,0,0);actor.root.quaternion.identity();actor.visual.position.set(0,0,0);actor.visual.quaternion.identity();actor.root.updateMatrixWorld(true);
  chestRestInverse=chest.matrixWorld.clone().invert();
  actor.root.position.copy(rp);actor.root.quaternion.copy(rq);actor.visual.position.copy(vp);actor.visual.quaternion.copy(vq);
  for(const s of saved){s.bone.quaternion.copy(s.q);s.bone.position.copy(s.p);}
  actor.root.updateMatrixWorld(true);
 }
 function place(){
  for(let i=0;i<count;i++){tmp.set(rest[i*3],rest[i*3+1],rest[i*3+2]).applyMatrix4(pin);pos[i*3]=prev[i*3]=tmp.x;pos[i*3+1]=prev[i*3+1]=tmp.y;pos[i*3+2]=prev[i*3+2]=tmp.z;}
 }
 function update(dt,state,time){
  if(!actor.thrustBasePose)return;
  if(!chestRestInverse)measureRest();
  mesh.visible=actor.root.visible&&!(state.dissolve>.55);
  if(!mesh.visible){started=false;return;}
  chest.updateWorldMatrix(true,false);
  pin.multiplyMatrices(chest.matrixWorld,chestRestInverse);
  const root=actor.root.position,dx=root.x-lastRoot.x,dy=root.y-lastRoot.y,dz=root.z-lastRoot.z;
  const jumped=root.distanceToSquared(lastRoot)>1.6**2||dt>.25;
  if(started&&!jumped&&dt<=0)return;
  if(!started||jumped){velocity.set(0,0,0);stream=0;previousStep=0;carryBlend=0;}
  else if(dt>0){const blend=1-Math.exp(-dt*12);velocity.x=lerp(velocity.x,dx/dt,blend);velocity.z=lerp(velocity.z,dz/dt,blend);}
  // Transport the solved folds with their wearer; inertia and the streaming
  // target supply secondary motion without sweeping the leg colliders through
  // stationary particles at the start of each frame.
  if(started&&!jumped)for(let i=0;i<pos.length;i+=3){
   pos[i]+=.90*dx;prev[i]+=.90*dx;
   pos[i+1]+=.90*dy;prev[i+1]+=.90*dy;
   pos[i+2]+=.90*dz;prev[i+2]+=.90*dz;
  }
  lastRoot.copy(root);
  if(!started||jumped){place();started=true;}
  for(const c of capsules){if(c===skirt)continue;c.pa.setFromMatrixPosition(c.a.matrixWorld);c.pb.setFromMatrixPosition(c.b.matrixWorld);}
  skirt.pa.setFromMatrixPosition(chest.matrixWorld);tmp.setFromMatrixPosition(hips.matrixWorld);
  skirt.pb.copy(tmp).sub(skirt.pa).normalize().multiplyScalar(.47).add(tmp);
  // The endpoints stay fixed throughout this frame's cloth solver passes.
  for(const c of capsules){
   const r=Math.max(c.ra,c.rb);
   c.dx=c.pb.x-c.pa.x;c.dy=c.pb.y-c.pa.y;c.dz=c.pb.z-c.pa.z;
   c.lengthSq=c.dx*c.dx+c.dy*c.dy+c.dz*c.dz||1e-6;
   c.minX=Math.min(c.pa.x,c.pb.x)-r;c.maxX=Math.max(c.pa.x,c.pb.x)+r;
   c.minY=Math.min(c.pa.y,c.pb.y)-r;c.maxY=Math.max(c.pa.y,c.pb.y)+r;
   c.minZ=Math.min(c.pa.z,c.pb.z)-r;c.maxZ=Math.max(c.pa.z,c.pb.z)+r;
  }
  const yaw=state.yaw||0,cy=Math.cos(yaw),sy=Math.sin(yaw);
  const groundAt=state.clothGroundAt||state.groundAt,base=(state.groundOffset||0)+(groundAt?0:root.y);
  const radius=1.6,minX=root.x-radius,maxX=root.x+radius,minZ=root.z-radius,maxZ=root.z+radius;
  const floorCeiling=(groundAt?.maximum?.(root.x,root.z,radius)??Infinity)+.02;
  const simDt=clamp(dt,0,1/20),steps=Math.max(1,actor.liveCloth?Math.round(simDt*60):Math.round(simDt*120)),h=simDt/steps;
  // Pinned collar and shoulder rows follow the chest exactly.
  for(let i=0;i<pinned.length;i+=3){
   tmp.set(rest[i],rest[i+1],rest[i+2]).applyMatrix4(pin);tmp.toArray(pinned,i);
  }
  collar.set(0,rest[index(1,0)+1],.035).applyMatrix4(pin);
  const tuck=state.roll>0?Math.sin(Math.PI*clamp(state.roll,0,1)):0;
  const flight=state.jumpFlight;
  const billow=flight?Math.sin(Math.PI*clamp((flight.elapsed-flight.windup)/(flight.duration-flight.windup),0,1)):0;
  const speed=Math.hypot(velocity.x,velocity.z);
  const windX=speed>.01?-velocity.x/speed:0,windZ=speed>.01?-velocity.z/speed:0;
  const targetStream=state.motion==='run'?T.MathUtils.smoothstep(speed,2.4,5.1):0;
  stream+= (targetStream-stream)*(1-Math.exp(-dt*(targetStream>stream?6:4)));
  // The shoulder rows stay pinned. On a sustained sprint the lower back
  // panel streams along the actual path of travel, including locked strafes.
  const sw=Math.sin(time*4.8),cw=Math.cos(time*4.8);
  const slowSin=Math.sin(time*1.3),slowCos=Math.cos(time*1.3),fastSin=Math.sin(time*3.7),fastCos=Math.cos(time*3.7);
  for(let k=2;k<ROWS;k++)for(let j=0;j<COLS;j++){
    const n=k*COLS+j,i=3*n,depth=(k-1)/(ROWS-2);
    waves[n]=sw*waveCos[n]+cw*waveSin[n];
    gusts[n]=(slowSin*gustACos[j]+slowCos*gustASin[j])*.35+(fastSin*gustBCos[n]+fastCos*gustBSin[n])*.12;
    sails[n]=(billow+(state.sideStep||0)*.64)*depth*depth*(.55+.45*sinAngle[n]);
    const rx=rest[i],ry=rest[i+1]-rest[index(1,0)+1],rz=rest[i+2]-.035;
    const bank=(billow+(state.sideStep||0)*.78)*depth*(.63+.20*sinAngle[n]);
    if(bank===0&&stream===0){
      targetRest[i]=collar.x+rx*cy+rz*sy;
      targetRest[i+1]=collar.y+ry;
      targetRest[i+2]=collar.z-rx*sy+rz*cy;
      continue;
    }
    const across=rx*Math.cos(bank)-ry*Math.sin(bank);
    const vertical=rx*Math.sin(bank)+ry*Math.cos(bank);
    let x=across*cy+rz*sy,z=-across*sy+rz*cy;
    const angle=.93*stream*depth*(.66+.34*cosAngle[n]),ca=Math.cos(angle),sa=Math.sin(angle);
    const along=x*windX+z*windZ,offset=along*(ca-1)-vertical*sa;
    targetRest[i]=collar.x+x+windX*offset;
    targetRest[i+1]=collar.y+vertical*ca+along*sa;
    targetRest[i+2]=collar.z+z+windZ*offset;
  }
  // Dampen the motion that remains after transporting the folds.
  const verticalDrag=Math.exp(-h*15);
  const memory=1-Math.exp(-h*h*(435+3000*tuck));
  for(let s=0;s<steps;s++){
   const f=1/(steps-s);
   const rescale=previousStep>0?h/previousStep:0;
   previousStep=h;
   for(let i=0;i<pinned.length;i++){pos[i]=lerp(pos[i],pinned[i],f);prev[i]=pos[i];}
   if(h>0)for(let k=2;k<ROWS;k++){
    const depth=(k-1)/(ROWS-2),keep=Math.exp(-h*(20-6*depth));
    for(let j=0;j<COLS;j++){
     const n=k*COLS+j,i=3*n;
     // The previous displacement represents previousStep seconds. Convert it
     // to this step before integrating at an irregular display cadence.
     let vx=(pos[i]-prev[i])*rescale*keep;
     let vy=(pos[i+1]-prev[i+1])*rescale*verticalDrag;
     let vz=(pos[i+2]-prev[i+2])*rescale*keep;
     // Relative airflow comes from the wearer's travel. A colliding vertex
     // cannot kick itself harder on every contact.
     vy+=(-9.2+Math.min(5.6,speed)*depth*(.65+.55*waves[n]))*h*h;
     const gust=gusts[n];
     vx+=gust*.55*depth*h*h;vz+=gust*.3*depth*h*h;
     const sail=sails[n];
     vx+=(cy*14+sy*9)*sail*h*h;
     vz+=(-sy*14+cy*9)*sail*h*h;
     vy+=21*sail*h*h;
     prev[i]=pos[i];prev[i+1]=pos[i+1];prev[i+2]=pos[i+2];
     pos[i]+=vx;pos[i+1]+=vy;pos[i+2]+=vz;
    }
   }
   // Two projections are enough during ordinary grounded travel. Rolls,
   // jumps and weapon actions retain the extra contact projection.
   const passes=actor.liveCloth&&['idle','walk','run'].includes(state.motion)&&!tuck&&!billow?2:3;
   for(let pass=0;pass<passes;pass++){
    // Columns keep their length from the pinned shoulder row downward.
    for(let k=2;k<ROWS;k++)for(let j=0;j<COLS;j++){
     const i=index(k,j),u=index(k-1,j),L=colLen[k*COLS+j];
     const dx=pos[i]-pos[u],dy=pos[i+1]-pos[u+1],dz=pos[i+2]-pos[u+2],d2=dx*dx+dy*dy+dz*dz;
     if(d2>L*L||d2<(L*.82)**2){const sc=(d2>L*L?L:L*.82)/(Math.sqrt(d2)||1e-6);pos[i]=pos[u]+dx*sc;pos[i+1]=pos[u+1]+dy*sc;pos[i+2]=pos[u+2]+dz*sc;}
    }
    // Crosswise links end at each free front edge.
    for(let k=2;k<ROWS;k++)for(let j=0;j<COLS-1;j++){
     const i=index(k,j),n=index(k,j+1),L=ringLen[k*COLS+j];
     const dx=pos[n]-pos[i],dy=pos[n+1]-pos[i+1],dz=pos[n+2]-pos[i+2],d2=dx*dx+dy*dy+dz*dz;
     if(d2>L*L||d2<L*L*.25){const want=d2>L*L?L:L*.5,d=Math.sqrt(d2)||1e-6,m=(d-want)/d*.5;pos[i]+=dx*m;pos[i+1]+=dy*m;pos[i+2]+=dz*m;pos[n]-=dx*m;pos[n+1]-=dy*m;pos[n+2]-=dz*m;}
    }
    // Body, limbs and ground.
    // Particles are independent during contact projection. Process one body
    // segment at a time so its bounds and axis stay constant in the inner loop.
    // A capsule can only affect rows overlapping its vertical bounds.
    // The bounds grow after each contact so later capsules see every moved vertex.
    for(let row=2;row<ROWS;row++){
     const start=row*COLS*3,end=start+COLS*3;
     let low=pos[start+1],high=low;
     for(let i=start+4;i<end;i+=3){
      const y=pos[i];if(y<low)low=y;if(y>high)high=y;
     }
     rowMinimum[row]=low;rowMaximum[row]=high;
    }
    for(const c of capsules){
     const {minX,maxX,minY,maxY,minZ,maxZ}=c;
     const ax=c.pa.x,ay=c.pa.y,az=c.pa.z,bx=c.dx,by=c.dy,bz=c.dz;
     const lengthSq=c.lengthSq,deltaRadius=c.rb-c.ra;
     for(let row=2;row<ROWS;row++){
      if(rowMaximum[row]<minY||rowMinimum[row]>maxY)continue;
      const start=row*COLS*3,end=start+COLS*3;
      for(let i=start;i<end;i+=3){
      const y=pos[i+1];if(y<minY||y>maxY)continue;
      const x=pos[i];if(x<minX||x>maxX)continue;
      const z=pos[i+2];if(z<minZ||z>maxZ)continue;
      const t=clamp(((x-ax)*bx+(y-ay)*by+(z-az)*bz)/lengthSq,0,1);
      const qx=x-(ax+bx*t),qy=y-(ay+by*t),qz=z-(az+bz*t),d2=qx*qx+qy*qy+qz*qz,r=c.ra+deltaRadius*t;
      if(d2<r*r&&d2>1e-10){
        const m=r/Math.sqrt(d2);pos[i]=ax+bx*t+qx*m;pos[i+1]=ay+by*t+qy*m;pos[i+2]=az+bz*t+qz*m;
        const height=pos[i+1];
        if(height<rowMinimum[row])rowMinimum[row]=height;
        if(height>rowMaximum[row])rowMaximum[row]=height;
       }
     }
     }
    }
    for(let i=pinned.length;i<pos.length;i+=3){
     if(pos[i+1]>=floorCeiling&&pos[i]>=minX&&pos[i]<=maxX&&pos[i+2]>=minZ&&pos[i+2]<=maxZ)continue;
     const floor=(groundAt?groundAt(pos[i],pos[i+2]):base)+.02;
     if(pos[i+1]<floor){pos[i+1]=floor;prev[i]=lerp(prev[i],pos[i],.5);prev[i+2]=lerp(prev[i+2],pos[i+2],.5);}
    }
   }
   // Weak memory of the hanging bell under the collar keeps the silhouette open and upright.
   for(let k=2;k<ROWS;k++)for(let j=0;j<COLS;j++){
    const i=index(k,j),tx=targetRest[i],ty=targetRest[i+1],tz=targetRest[i+2];
    pos[i]+=(tx-pos[i])*memory;pos[i+2]+=(tz-pos[i+2])*memory;pos[i+1]+=(ty-pos[i+1])*memory*(.35+.65*tuck);
   }
  }
  // Carry the broad folds down through the heavier trim. These surface
  // offsets follow the solved ring, including when the wearer rolls.
  for(let k=0;k<ROWS;k++)for(let j=0;j<COLS;j++){
   const n=k*COLS+j,i=3*n,o=i;
   const middle=index(k,Math.floor(COLS/2)),side=index(k,j<COLS/2?COLS-1:0),out=foldOffset[n];
   vertices[o]=pos[i]+(pos[i]-pos[side])*out;
   vertices[o+1]=pos[i+1]+(pos[i+1]-pos[side+1])*out;
   vertices[o+2]=pos[i+2]+(pos[i+2]-(pos[side+2]+pos[middle+2])*.5)*out;
   if(k>ROWS-4){
    const up=index(k-1,j),drop=hemDrop[n];
    for(let axis=0;axis<3;axis++)vertices[o+axis]+=(pos[i+axis]-pos[up+axis])*drop;
   }
  }
  if(state.motion==='walk'||state.motion==='run'){
    // Unwrap the forward corners of the collar around the back of the
    // shoulders. The lower rows retain the broad hanging side panels.
    surface.set(vertices);
    for(let k=0;k<ROWS;k++){
     const cut=lerp(.31,.12,k/(ROWS-1))*(COLS-1);
     for(let j=0;j<COLS;j++){
      const n=k*COLS+j,left=cutIndex[n],u=cutBlend[n];
      const a=index(k,left),b=index(k,Math.min(left+1,COLS-1)),v=index(k,j);
      for(let axis=0;axis<3;axis++)vertices[v+axis]=lerp(surface[a+axis],surface[b+axis],u);
     }
    }
   // Include the shoulder row and actual held weapons after adding the folds.
   for(const c of armContacts)clearSurface(c,Math.max(c.ra,c.rb)+.034,sy,cy);
   for(const c of handContacts)if(c.a&&c.b){
    c.a.getWorldPosition(c.pa);c.b.getWorldPosition(c.pb);
    clearSurface(c,c.ra+.02,sy,cy);
   }
   for(const weapon of actor.weapons||[]){
    if(!weapon.pivot?.visible||weapon.slot!==0)continue;
    let shapes=weaponContacts.get(weapon);
    if(!shapes){shapes=contactShape(weapon);weaponContacts.set(weapon,shapes);}
    weapon.pivot.updateWorldMatrix(true,false);
    for(const c of shapes){
     c.pa.copy(c.a).applyMatrix4(weapon.pivot.matrixWorld);
     c.pb.copy(c.b).applyMatrix4(weapon.pivot.matrixWorld);
     clearSurface(c,c.ra,sy,cy);
    }
   }
   carryBlend=Math.min(1,carryBlend+dt*10);
   for(let i=0;i<vertices.length;i++){
    carryOffset[i]=vertices[i]-surface[i];
    vertices[i]=surface[i]+carryOffset[i]*carryBlend;
   }
  }else if(carryBlend>0){
   // Release the carry shape continuously when changing to an attack or idle.
   carryBlend=Math.max(0,carryBlend-dt*10);
   for(let i=0;i<vertices.length;i++)vertices[i]+=carryOffset[i]*carryBlend;
  }
  geometry.attributes.position.needsUpdate=true;updateClothNormals(geometry);
 }
 return {mesh,update,reset(){started=false;}};
}
