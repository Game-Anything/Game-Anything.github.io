// Promised Consort paired greatblades, rebuilt from the primary recording (36.10 s flat view, 36.55 s grip view,
// 39-41 s spread stance): a very broad single-edged sabre of blued black steel. The back is straight for the first
// half, then sweeps up to a clipped point; the cutting edge bellies out to its widest near three quarters of the
// length and rises steeply to the tip. A raised spine band, a shallow fuller and fine gilt sunburst engraving cover
// the half nearest the hilt. The hilt is a chunky cluster of gilt beast heads and leaf curls, a dark wrapped grip
// with rings and a heavy gilt pommel.
// Pivot convention (shared with the grip, trail and holy-edge code): +Y runs from the guard (0) to the tip
// (0.81 x length), the back of the blade faces +X, the flats face +-Z.
import * as T from "game/lib/three.module.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";

const s=T.MathUtils.smoothstep;
export const CONSORT_BLADE_LENGTH=4.3; // nominal; blade span is 0.81 of this (about 3.5 m)
const PALM=.36; // palm centre below the blade shoulder

// Outline in units of the blade span. Returns [back x, width] at fraction f along the blade.
export function consortBladeOutline(f){
 const back=.052+.028*f*f+.157*Math.pow(Math.max(0,(f-.40)/.60),2);
 const g=T.MathUtils.clamp((f-.72)/.28,0,1);
 const width=T.MathUtils.lerp(.128,.167,s(f,0,.70))*(1-Math.pow(g,2.1));
 return [back,width];
}

function steelMap(){
 const W=512,H=2048,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const c=canvas.getContext('2d'),rnd=i=>{const n=Math.sin(i*12.9898+4.1)*43758.5453;return n-Math.floor(n);};
 const Y=v=>(1-v)*H;
 // At 36.1–36.55 s the broad face shows a blue-grey grind between the
 // dark fuller and the worn edge, even when the blade tilts away from the sun.
 c.fillStyle='#8b959e';c.fillRect(0,0,W,H);
 // Long grind marks following the blade.
 for(let i=0;i<900;i++){
  const x=rnd(i)*W,y=rnd(i+1000)*H,l=60+rnd(i+2000)*520;
  c.strokeStyle=i%3?`rgba(8,10,14,${.10+rnd(i+7)*.16})`:`rgba(150,164,180,${.05+rnd(i+9)*.09})`;c.lineWidth=.6+rnd(i+11)*1.6;
  c.beginPath();c.moveTo(x,y);c.lineTo(x+(rnd(i+13)-.5)*10,y+l);c.stroke();
 }
 // Blotchy bluing and soot.
 for(let i=0;i<340;i++){
  const x=rnd(i+300)*W,y=rnd(i+700)*H,r=20+rnd(i+1100)*110,g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,i%4===0?'rgba(86,102,124,.16)':i%4===1?'rgba(4,5,8,.30)':'rgba(40,44,58,.20)');g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);
 }
 // Raised back band: darker, with a bright worn ridge where it steps down to the flat.
 let g=c.createLinearGradient(0,0,W*.30,0);g.addColorStop(0,'rgba(96,106,120,.55)');g.addColorStop(.12,'rgba(6,8,12,.50)');g.addColorStop(.86,'rgba(6,8,12,.42)');g.addColorStop(.93,'rgba(168,182,198,.75)');g.addColorStop(1,'rgba(4,5,8,.55)');
 c.fillStyle=g;c.fillRect(0,0,W*.30,H);
 // Shallow fuller.
 g=c.createLinearGradient(W*.31,0,W*.47,0);g.addColorStop(0,'rgba(0,0,0,.42)');g.addColorStop(.5,'rgba(0,0,0,.10)');g.addColorStop(1,'rgba(120,132,150,.20)');
 c.fillStyle=g;c.fillRect(W*.31,0,W*.16,H);
 // The burnished plane beside the fuller shows a broad grey band in the
 // 36.1 s flat view. Keep the narrow recessed channel dark beside it.
 g=c.createLinearGradient(W*.45,0,W*.80,0);
 g.addColorStop(0,'rgba(167,176,185,0)');g.addColorStop(.20,'rgba(167,176,185,.20)');g.addColorStop(1,'rgba(167,176,185,.07)');
 c.fillStyle=g;c.fillRect(W*.45,0,W*.35,H);
 // Ground bevel and bright worn edge with nicks.
 g=c.createLinearGradient(W*.80,0,W,0);g.addColorStop(0,'rgba(120,134,150,0)');g.addColorStop(.12,'rgba(150,164,180,.34)');g.addColorStop(.8,'rgba(176,188,202,.50)');g.addColorStop(1,'rgba(226,232,238,.95)');
 c.fillStyle=g;c.fillRect(W*.80,0,W*.20,H);
 for(let i=0;i<150;i++){const y=rnd(i+40)*H,d=4+rnd(i+80)*16;c.fillStyle='rgba(10,12,16,.75)';c.beginPath();c.moveTo(W,y-d*.6);c.lineTo(W-d,y);c.lineTo(W,y+d*.6);c.fill();}
 // Gilt engraving on the half nearest the hilt: a stem with three rosettes and long radiating feather strokes.
 const gilt=(a)=>`rgba(212,168,88,${a})`;
 c.lineCap='round';
 c.strokeStyle=gilt(.70);c.lineWidth=3;c.beginPath();c.moveTo(W*.60,Y(.015));c.bezierCurveTo(W*.56,Y(.2),W*.60,Y(.36),W*.56,Y(.56));c.stroke();
 c.strokeStyle=gilt(.45);c.lineWidth=1.5;for(const u of [.335,.475,.785]){c.beginPath();c.moveTo(W*u,Y(.012));c.lineTo(W*u,Y(u>.7?.50:.60));c.stroke();}
 for(const [v,size] of [[.11,1],[.265,.9],[.42,.78]]){
  const cx=W*.585,cy=Y(v);
  for(let k=0;k<46;k++){
   const up=k%2?1:-1,spread=(rnd(k+v*90)-.5),len=(.045+.085*rnd(k+v*31))*H*size;
   c.strokeStyle=gilt(.30+.45*rnd(k+v*17));c.lineWidth=.8+rnd(k+3)*1.4;
   c.beginPath();c.moveTo(cx+spread*12,cy);c.quadraticCurveTo(cx+spread*W*.16,cy-up*len*.55,cx+spread*W*.42*size,cy-up*len);c.stroke();
  }
  for(let k=0;k<10;k++){const a=k/10*6.283;c.fillStyle=gilt(.9);c.beginPath();c.ellipse(cx+Math.cos(a)*15*size,cy+Math.sin(a)*15*size,10*size,4.5*size,a,0,6.283);c.fill();}
  c.fillStyle='rgba(236,204,128,.95)';c.beginPath();c.arc(cx,cy,7*size,0,6.283);c.fill();
  c.strokeStyle=gilt(.8);c.lineWidth=2;c.beginPath();c.arc(cx,cy,27*size,0,6.283);c.stroke();
 }
 // Soot towards the tip, pale wear at the shoulder.
 g=c.createLinearGradient(0,Y(1),0,Y(.55));g.addColorStop(0,'rgba(0,0,0,.34)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,W,Y(.55));
 for(let i=0;i<5200;i++){c.fillStyle=i%2?'rgba(0,0,0,.20)':'rgba(190,200,214,.12)';c.fillRect(rnd(i+5000)*W,rnd(i+9000)*H,1+rnd(i)*1.5,1+rnd(i+1)*2.5);}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;return map;
}

function bladeGeometry(span){
 const N=64,lines=[[0,.030],[.07,.046],[.24,.046],[.30,.034],[.39,.021],[.48,.030],[.79,.024],[.86,.016],[1,.0012]];
 const strips=[];
 const station=i=>{const t=i/N,f=1-Math.pow(1-t,1.45),[back,width]=consortBladeOutline(f);return {f,back:back*span,width:Math.max(.0008,width)*span,thin:1-.62*f};};
 const grid=(a,b,za,zb,flip)=>{
  // One longitudinal strip between two section lines: smooth along the blade, crisp across the ridges.
  const pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){const st=station(i);
   pos.push(st.back-a[0]*st.width,st.f*span,za*a[1]*st.thin, st.back-b[0]*st.width,st.f*span,zb*b[1]*st.thin);
   uv.push(a[0],st.f,b[0],st.f);
   if(i<N){const k=i*2;flip?idx.push(k,k+2,k+1,k+1,k+2,k+3):idx.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
 };
 for(let k=0;k<lines.length-1;k++){strips.push(grid(lines[k],lines[k+1],1,1,true));strips.push(grid(lines[k],lines[k+1],-1,-1,false));}
 strips.push(grid(lines[0],lines[0],-1,1,true)); // flat back
 const merged=mergeGeometries(strips);for(const g of strips)g.dispose();
 // Sample the actual edge, spine and raised ridge for the planted sword.
 // The belly can reach the ash before the upswept point.
 const support=[];
 for(let i=0;i<=N;i+=4){
  const st=station(i);
  for(const [fraction,thickness] of [lines[0],lines[1],lines[4],lines.at(-1)]){
   for(const side of [-1,1])support.push(new T.Vector3(st.back-fraction*st.width,st.f*span,side*thickness*st.thin));
  }
 }
 merged.userData.groundSamples=support;
 merged.computeBoundingBox();merged.computeBoundingSphere();return merged;
}

function tint(geometry,r,g,b){
 const p=geometry.attributes.position,n=geometry.attributes.normal,colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const grain=.5+.5*Math.sin(71*x+34*y+17*z+2.4*Math.sin(9*x-33*z));
  const weather=.5+.5*Math.sin(19*x-24*y+22*z);
  const recess=.46+.44*grain+.13*weather;
  const high=.14*Math.pow(Math.abs(n.getY(i)),3);
  colors[i*3]=r*(recess+high);colors[i*3+1]=g*(recess+high)*(.9+.1*weather);
  colors[i*3+2]=b*(recess+high)*(.8+.2*grain);
 }
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));return geometry;
}
function placed(geometry,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){const m=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(sx,sy,sz));geometry.applyMatrix4(m);geometry.deleteAttribute('uv');return geometry;}

function hiltGeometry(span){
 const gold=[],dark=[];
 const base=consortBladeOutline(0),centre=(base[0]-base[1]*.5)*span,half=base[1]*span*.5;
 const G=(g,...t)=>gold.push(tint(placed(g,...t),.44,.413,.333));
 const iron=(g,...t)=>gold.push(tint(placed(g,...t),.127,.116,.095));
 const D=(g,...t)=>dark.push(tint(placed(g,...t),.082,.069,.056));
 // Core block spanning the blade shoulder.
 iron(new T.CapsuleGeometry(.085,half*2+.055,6,14),centre,-.045,0,1,1,1.12,0,0,Math.PI/2);
 G(new T.CylinderGeometry(.10,.12,.11,14),0,-.135,0);
 // Rope moulding and paired cupped leaves wrap around the crossguard. The
 // interrupted dark gaps stay legible when the swords cross over the head.
 for(const face of [-1,1])for(const side of [-1,1]){
  for(let j=0;j<4;j++){
   const x=centre+side*(.035+(half-.03)*j/4),length=(half-.03)*.30;
   const curve=new T.CatmullRomCurve3([new T.Vector3(x,-.078,face*.086),
    new T.Vector3(x+side*length*.28,-.050,face*.112),
    new T.Vector3(x+side*length*.75,-.032,face*.113),
    new T.Vector3(x+side*length,-.012,face*.085)]);
   const tube=new T.TubeGeometry(curve,9,.015,6,false);
   G(tube,0,0,0);
  }
 }
 // Beast heads at both ends of the guard, each with a ruff, brow and muzzle.
 for(const side of [-1,1]){
  const x=centre+side*(half+.086);
  iron(new T.SphereGeometry(.120,14,10),x,-.03,0,1.00,.98,1.0);
  G(new T.SphereGeometry(.078,10,8),x+side*.112,-.052,0,1.10,.70,.80);
  // Deep-set eye and tapered cheek ridges, visible on either flat with the
  // guard crossed above the helmet (main clip 24.5 s).
  for(const face of [-1,1]){
   D(new T.SphereGeometry(.028,8,6),x+side*.06,.011,face*.111,1.26,.56,.48);
   G(new T.SphereGeometry(.047,10,6),x+side*.046,.039,face*.107,1.25,.36,.48,0,0,-side*.24);
   for(let strand=0;strand<3;strand++){
    const a=strand*.028;
    const curve=new T.CatmullRomCurve3([[x+side*(.068-a),.003-a,face*.108],[x-side*(.016+a),-.036-a,face*.126],[x-side*(.089+a),-.014-a,face*.095],[x-side*(.122+a),.038-a,face*.060]].map(v=>new T.Vector3(...v)));
    G(new T.TubeGeometry(curve,9,.010,5,false),0,0,0);
   }
  }
  G(new T.TorusGeometry(.128,.042,8,18),x-side*.07,-.03,0,1,1,1,0,Math.PI/2,0);
  for(const z of [-1,1]){G(new T.SphereGeometry(.036,8,6),x+side*.05,.045,z*.075);G(new T.ConeGeometry(.034,.12,6),x-side*.01,.11,z*.085,1,1,1,0,0,-side*.5);}
  // Leaf curls climbing from the guard on to the flats of the blade.
  for(const z of [-1,1])for(let leaf=0;leaf<3;leaf++){
   const reach=.20+.10*leaf,points=[[centre+side*(half*.2+.03*leaf),-.02,z*.085],[centre+side*(half*.55+.02*leaf),.10+.06*leaf,z*.075],[centre+side*(half*.9),.19+.09*leaf,z*.060],[centre+side*(half*.78),.27+.10*leaf,z*.052],[centre+side*(half*.56),.24+.09*leaf,z*.050]];
   const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),tube=new T.TubeGeometry(curve,14,.034-.006*leaf,6,false),p=tube.attributes.position;
   for(let ring=0;ring<=14;ring++){const centrePoint=curve.getPointAt(ring/14),taper=1-.72*Math.pow(ring/14,1.6);for(let k=0;k<=6;k++){const j=ring*7+k,v=new T.Vector3().fromBufferAttribute(p,j).sub(centrePoint).multiplyScalar(taper).add(centrePoint);p.setXYZ(j,v.x,v.y,v.z);}}
   G(tube,0,0,0);void reach;
  }
 }
 // Pointed langets on both flats.
 for(const z of [-1,1]){G(new T.ConeGeometry(.15,.52,4),centre,.25,z*.050,1,1,.16,0,Math.PI/4,0);G(new T.SphereGeometry(.06,10,8),centre,.02,z*.085,1.2,1,.7);}
 // Wrapped grip with rings.
 D(new T.CylinderGeometry(.060,.054,.60,14),0,-.47,0);
 const wrapPath=[];
 for(let i=0;i<=160;i++){
  const t=i/160,a=t*Math.PI*17,r=.061-.005*t;
  wrapPath.push(new T.Vector3(r*Math.cos(a),-.201-.552*t,r*Math.sin(a)));
 }
 D(new T.TubeGeometry(new T.CatmullRomCurve3(wrapPath),160,.009,7,false),0,0,0);
 for(const y of [-.193,-.757])G(new T.CylinderGeometry(.068,.067,.028,24),0,y,0);
 G(new T.TorusGeometry(.064,.020,6,16),0,-.185,0,1,1,1,Math.PI/2,0,0);G(new T.TorusGeometry(.060,.020,6,16),0,-.765,0,1,1,1,Math.PI/2,0,0);
 // Pommel: gilt beast head with a finial.
 iron(new T.SphereGeometry(.110,14,10),0,-.865,0,1,.92,1);
 for(let k=0;k<6;k++){const a=k/6*6.283;G(new T.SphereGeometry(.042,8,6),Math.cos(a)*.095,-.845,Math.sin(a)*.095);}
 G(new T.SphereGeometry(.05,10,8),0,-.985,0,1,1.2,1);
 const goldGeometry=mergeGeometries(gold),darkGeometry=mergeGeometries(dark);
 for(const g of [...gold,...dark])g.dispose();
 return {goldGeometry,darkGeometry};
}

let shared;
export function plantConsortBlade(weapon,palm,grip,state,scale,weight){
 const samples=shared.blade.userData.groundSamples;
 const origin=state.pos,groundY=origin.y+(state.groundOffset||0);
 const q=weapon.pivot.quaternion.clone(),v=new T.Vector3(),aim=new T.Vector3();
 const gap=(arm)=>groundY+(palm.y+arm.y-groundY)*scale-state.groundAt(
  origin.x+(palm.x+arm.x-origin.x)*scale,origin.z+(palm.z+arm.z-origin.z)*scale);
 let contact=samples[0],seated=false;
 for(let pass=0;pass<3;pass++){
  let lowest=Infinity;
  for(const sample of samples){
   const clearance=gap(v.copy(sample).add(grip).applyQuaternion(q));
   if(clearance<lowest){lowest=clearance;contact=sample;}
  }
  if(Math.abs(lowest-.012)<.004){seated=true;break;}
  // Intersect this point's swing about the palm with the local terrain.
  // Re-evaluate the edge after tilting: its supporting point may move.
  const arm=contact.clone().add(grip).applyQuaternion(q),radius=arm.length();
  const axis=arm.clone().setY(0).normalize();if(axis.lengthSq()<.5)break;
  let lo=-radius+.0001,hi=radius-.0001;
  for(let i=0;i<14;i++){
   const y=(lo+hi)*.5;
   aim.copy(axis).multiplyScalar(Math.sqrt(radius*radius-y*y));aim.y=y;
   if(gap(aim)>.012)hi=y;else lo=y;
  }
  aim.copy(axis).multiplyScalar(Math.sqrt(radius*radius-lo*lo));aim.y=lo;
  q.premultiply(new T.Quaternion().setFromUnitVectors(arm.normalize(),aim.normalize()));
 }
 weapon.pivot.quaternion.slerp(q,weight);
 if(seated&&weight===1){weapon.rakeContact=contact;return;}
 // Choose the point on the partially tilted sword as it lands and lifts.
 let lowest=Infinity;
 for(const sample of samples){
  const clearance=gap(v.copy(sample).add(grip).applyQuaternion(weapon.pivot.quaternion));
  if(clearance<lowest){lowest=clearance;contact=sample;}
 }
 weapon.rakeContact=contact;
}
export function createConsortGreatblade(length=CONSORT_BLADE_LENGTH){
 const span=length*.81;
 shared??={blade:bladeGeometry(span),hilt:hiltGeometry(span),
  steel:new T.MeshStandardMaterial({map:steelMap(),color:0xf0f1f2,metalness:.68,roughness:.49,envMapIntensity:1.17,side:T.DoubleSide}),
  gilt:new T.MeshStandardMaterial({vertexColors:true,color:0x99978e,metalness:.79,roughness:.66,envMapIntensity:.54}),
  wrap:new T.MeshStandardMaterial({vertexColors:true,color:0xbab2ab,metalness:.06,roughness:.91})};
 // The narrow black fuller remains dark in shade; the worn steel face
 // receives a small, cool ambient return with the same patina and scratches.
 shared.steel.emissiveMap=shared.steel.map;
 shared.steel.emissive.setHex(0x5c6877);shared.steel.emissiveIntensity=.28;
 const model=new T.Group(),inner=new T.Group();
 const blade=new T.Mesh(shared.blade,shared.steel);blade.name='consort-blade-steel';
 const guard=new T.Mesh(shared.hilt.goldGeometry,shared.gilt);guard.name='consort-blade-gilt';
 const grip=new T.Mesh(shared.hilt.darkGeometry,shared.wrap);grip.name='consort-blade-grip';
 for(const mesh of [blade,guard,grip]){mesh.castShadow=mesh.receiveShadow=true;inner.add(mesh);}
 // The model origin is the palm seat; the blade shoulder stays at the pivot origin.
 inner.position.y=PALM;model.add(inner);model.position.y=-PALM;
 model.userData.sourceCurvedBlade=true;model.userData.consortBlade=true;model.name='consort-greatblade';
 return model;
}
