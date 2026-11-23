import * as T from "game/lib/three.module.js";
import {addStaticInstances} from "game/src/static-instances.js";

// Shoulder, turned pelvis and crooked limbs are closed casts. Sparse openings
// between the elbow and ribcage remain see-through on oblique viewing angles.
function makeCast(pose,level){
 const pos=[],col=[],idx=[],contacts=[],hand=pose===1?-1:1,curve=[.04,.20,-.16][pose],rise=[.07,-.04,.12][pose];
 const torsoSides=[14,9,6,4][level],tangent=new T.Vector3(),across=new T.Vector3(),over=new T.Vector3();
 function strip(points,sides,folds=0){
  if(level===3){
   points=points.filter((_,i)=>i===0||i===points.length-1||i%2===0);
   sides=Math.min(sides,4);
  }
  const start=pos.length/3;
  for(let i=0;i<points.length;i++){
   const [x,y,z,rx,ry]=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
   tangent.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
   across.set(tangent.z,0,-tangent.x);if(across.lengthSq()<1e-5)across.set(1,0,0);
   across.normalize();over.crossVectors(tangent,across).normalize();
   for(let j=0;j<sides;j++){
    const ang=j*Math.PI*2/sides,c=Math.cos(ang),s=Math.sin(ang);
    const crease=folds*(.67*Math.sin(3*ang+6*z+curve)+.33*Math.sin(5*ang-8*z+2*y));
    const u=rx*c*(1+crease),v=ry*s*(1+crease);
    pos.push(x+across.x*u+over.x*v,y+across.y*u+over.y*v,z+across.z*u+over.z*v);
    const shade=.67+.30*Math.max(0,s)+.57*crease;col.push(shade,shade*.986,shade*.956);
    if(i){const k=start+i*sides+j,n=start+i*sides+(j+1)%sides;idx.push(k-sides,n-sides,k,n-sides,n,k);}
   }
  }
  for(let j=1;j<sides-1;j++){const end=start+(points.length-1)*sides;idx.push(start,start+j+1,start+j,end,end+j,end+j+1);}
 }
 strip([[-.08,-.07,-.69,.03,.04],[-.09,.10,-.55,.21,.12],[-.12,.17,-.38,.29,.21],
  [-.15+curve,.18,-.16,.24,.22],[-.13+curve,.21,.05,.25,.25],[-.06,.24+rise,.25,.35,.26],
  [.02,.26+rise,.37,.31,.22],[.10,.21+rise,.49,.12,.11]],torsoSides,.18);
 strip([[.08,.19+rise,.41,.09,.09],[.12,.25+rise,.50,.115,.105],[.19,.27+rise,.60,.157,.159],
  [.23,.24+rise,.69,.135,.13],[.24,.15+rise,.79,.028,.035]],level===0?11:7,.11);
 if(level<2)for(const s of [-1,1])strip([[-.08+s*.19,0,-.58,.012,.014],[-.12+s*.20,.18,-.38,.043,.058],
  [-.13+curve+s*.14,.36,-.13,.05,.045],[-.07+s*.12,.44+rise,.13,.042,.035],[.01+s*.17,.40+rise,.34,.014,.017]],level?5:7);
 for(const s of [-1,1]){
  const raised=s===hand,elbow=s*(raised?.52:.40),ez=raised?.22+curve:.49;
  const wx=raised?s*(.42+curve):s*.58,wz=raised?.63:.30,kx=s*(raised?.42:.23),ky=raised?.37+rise:.19,kz=raised?-.58:-.77;
  strip([[s*.22,.27+rise,.29,.125,.12],[s*.37,.25+rise,.28,.113,.12],[elbow,raised?.43+rise:.14,ez,.083,.088],
   [T.MathUtils.lerp(elbow,wx,.43),raised?.28:.11,T.MathUtils.lerp(ez,wz,.43),.076,.086],
   [wx,.055,wz,.048,.046],[wx+s*.03,.031,wz+.10,.068,.034],[wx+s*.025,-.035,wz+.19,.019,.018]],[8,6,5,3][level],.10);
  const hx=kx+s*(raised?.19:.055),hz=raised?-.21:-1.04;
  strip([[s*.12,.15,-.37,.145,.145],[s*.19,.18,-.49,.134,.146],[kx,ky,kz,.106,.111],
   [T.MathUtils.lerp(kx,hx,.42),ky*.64,T.MathUtils.lerp(kz,hz,.42),.104,.10],[hx,.045,hz,.061,.060],
   [hx+s*.06,-.04,hz-.13,.036,.037]],[9,7,5,4][level],.08);
  contacts.push([wx+s*.025,wz+.19],[hx+s*.06,hz-.13]);
  if(raised&&!level)for(let j=0;j<3;j++){const x=wx+s*(j-1)*.032;strip([[x,.04,wz+.07,.023,.025],
   [x+s*.03,.061,wz+.12,.020,.019],[x+s*(.043+.01*j),.004,wz+.18+.011*j,.009,.009]],5);}
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 geo.setAttribute('color',new T.Float32BufferAttribute(col,3));geo.setIndex(idx);geo.computeVertexNormals();geo.computeBoundingSphere();geo.userData.contacts=contacts;return geo;
}
export function buildWindrowBodies(scene,bodies,surface,material,castShadow){
 const groups=[[],[],[]],colors=[[],[],[]],up=new T.Vector3(0,1,0),tiles=groups.map((_,i)=>makeCast(i,0));
 const o=new T.Object3D(),n=new T.Vector3(),tilt=new T.Quaternion(),sample=new T.Vector3();
 for(let i=0;i<bodies.length;i++){
  const b=bodies[i],p=i%3,s=b.s,d=.40;
  n.set(surface(b.x-d,b.z)-surface(b.x+d,b.z),2*d,surface(b.x,b.z-d)-surface(b.x,b.z+d)).normalize();
  tilt.setFromUnitVectors(up,n);o.quaternion.setFromAxisAngle(up,b.a).premultiply(tilt);
  // On the approach these are interlocked, half-buried casts. Only a bent
  // knee, shoulder and the upper folds protrude above the continuous ash.
  const exposure=.5+.5*Math.sin(b.x*.42+b.z*.27+.65*Math.sin(b.z*.34));
  const fine=.5+.5*Math.cos(b.x*.61-b.z*.47+i*1.27);
  const height=b.lip?s*(.41+.18*fine):s*(.29+.24*exposure)*(.70+.30*fine);
  o.position.set(b.x,surface(b.x,b.z)-s*(.061+.052*(1-exposure)),b.z);
  o.scale.set(s*(.52+.28*fine),height,s*(.62+.25*fine));
  o.updateMatrix();let sink=0;
  for(const [x,z] of tiles[p].userData.contacts){sample.set(x,-.035,z).applyMatrix4(o.matrix);sink=Math.max(sink,sample.y-surface(sample.x,sample.z)+.012);}
  o.position.y-=b.lip?Math.min(sink,.21*s):sink;o.updateMatrix();groups[p].push(o.matrix.clone());
  const tone=.79+.18*(.5+.5*Math.sin(i*6.33+b.x*.77));colors[p].push(tone,tone*.988,tone*.964);
 }
 groups.forEach((matrices,i)=>{const lod=[{distance:22,geometry:makeCast(i,1)},{distance:44,geometry:makeCast(i,2)}];
  if(!castShadow)lod.push({distance:34,geometry:makeCast(i,3)});
  if(!castShadow){lod[0].distance=11;lod[1].distance=22;}
  addStaticInstances(scene,tiles[i],material,matrices,'articulated-ash-windrow',castShadow,22,new T.Float32BufferAttribute(colors[i],3),lod);
 });
}

/** Two torn edges cut across a buried slab, sharing the shape of the fracture. */
export function appendSplitBed(x,z,scale,yaw,seed,surface,triangle){
 const c=Math.cos(yaw),s=Math.sin(yaw),gap=.045+.024*Math.abs(Math.sin(seed));
 const wx=(u,v)=>x+scale*(c*u-s*v),wz=(u,v)=>z+scale*(s*u+c*v);
 const seam=[[-.12,-.38],[.07,-.20],[-.09,-.035],[.13,.18],[.015,.36]];
 for(const side of [-1,1]){
  const edge=seam.map(([u,v])=>[u+gap*side,v]);
  const outline=side<0?[[-.67,-.26],[-.36,-.43],...edge,[-.54,.40],[-.83,.12],[-.81,-.06]]:
   [...edge.slice().reverse(),[.54,-.43],[.88,-.23],[.75,.08],[.57,.33]];
  const center=outline.reduce(([u,v],p)=>[u+p[0]/outline.length,v+p[1]/outline.length],[0,0]);
  const rings=[[],[],[],[]],n=outline.length;
  for(const [i,[u,v]] of outline.entries()){
   const chipped=.80+.18*Math.sin(i*2.19+seed),ux=center[0]+(u-center[0])*.95,uz=center[1]+(v-center[1])*.95;
   const hx=wx(ux,uz),hz=wz(ux,uz),ex=wx(u,v),ez=wz(u,v);
   const ledge=scale*(.088+.057*(1-Math.min(1,Math.abs(u)))+.055*(side===-1?1:0));
   const base=surface(ex,ez),top=surface(hx,hz)+ledge*chipped;
   rings[0].push([ex,base-.16,ez]);rings[1].push([ex,base+ledge*.42,ez]);
   rings[2].push([wx(u*.991,v*.991),base+ledge*.64,wz(u*.991,v*.991)]);
   rings[3].push([hx,top,hz]);
  }
  const mx=wx(...center),mz=wz(...center),peak=[mx,surface(mx,mz)+scale*(side===-1?.207:.155),mz];
  for(let i=0;i<n;i++){const j=(i+1)%n,tone=.85+.11*Math.cos(i*.9+seed);
   for(let l=0;l<3;l++){const low=rings[l],high=rings[l+1],t=[.45,.63,.79][l]*tone;
    triangle(low[i],high[i],low[j],t);triangle(low[j],high[i],high[j],t);}
   triangle(rings[3][i],peak,rings[3][j],tone);
  }
 }
}

