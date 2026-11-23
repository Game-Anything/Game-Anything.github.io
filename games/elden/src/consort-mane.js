// Promised Consort red mane (primary 36.5-38.6 s front, 41.6-42.4 s side and back): a tall, wild crest of deep red
// hair standing a head-height above the horned helm, sweeping back and falling in heavy locks over the collar to the
// shoulder blades. Built as tapering strand cards rooted on the scalp. Free ends hang upright whatever the head does,
// drift in the air and lag behind turns; low sun passes through the thin tips.
import * as T from "game/lib/three.module.js";

function strandMap(){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=512;
 const c=canvas.getContext('2d'),rnd=i=>{const n=Math.sin(i*12.9898+1.7)*43758.5453;return n-Math.floor(n);};
 for(let i=0;i<32;i++){
  const x=6+rnd(i)*116,end=250+rnd(i+40)*262,g=c.createLinearGradient(0,0,0,end);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.62,'rgba(255,255,255,.95)');g.addColorStop(1,'rgba(255,255,255,0)');
  c.strokeStyle=g;c.lineWidth=.85+rnd(i+80)*1.75;c.lineCap='round';c.beginPath();
  for(let y=0;y<=end;y+=8){const u=y/end,xx=x+Math.sin(u*5.5+i*1.3)*5*u+(64-x)*.35*u*u;y?c.lineTo(xx,y):c.moveTo(xx,y);}
  c.stroke();
 }
 // A separate wrap for the sculpted core has hundreds of lengthwise hairs
 // and breaks up toward each tip. The cards sample the adjacent feathered tile.
 const atlas=document.createElement('canvas');atlas.width=384;atlas.height=512;
 const ctx=atlas.getContext('2d'),image=ctx.createImageData(256,512);
 for(let y=0;y<512;y++)for(let x=0;x<256;x++){
  const t=y/511,warp=x+2.1*Math.sin(y*.019+Math.sin(x*.075))+.6*Math.sin(y*.041+x*.09);
  const fiber=.5+.5*Math.sin(warp*1.94+.8*Math.sin(warp*.24));
  const split=.5+.5*Math.sin(warp*.37+Math.sin(warp*.14));
  const value=128+87*fiber+36*split,k=4*(256*y+x);
  image.data[k]=value;image.data[k+1]=value-6;image.data[k+2]=value-10;
  const gap=.12+.56*T.MathUtils.smoothstep(t,.19,.86);
  const coverage=T.MathUtils.smoothstep(split+.10*fiber,gap-.025,gap+.055);
  image.data[k+3]=255*coverage*(1-.75*T.MathUtils.smoothstep(t,.64,.97));
 }
 ctx.putImageData(image,0,0);ctx.drawImage(canvas,256,0);
 const map=new T.CanvasTexture(atlas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;return map;
}

export function createConsortMane(fullDetail=()=>true){
 const positions=[],colors=[],uvs=[],roots=[],weights=[],phases=[],indices=[];
 const rnd=i=>{const n=Math.sin(i*78.233+3.1)*43758.5453;return n-Math.floor(n);};
 const centre=new T.Vector3(0,.03,.05),radii=new T.Vector3(.29,.31,.31);
 const col=new T.Color();
 const detail=[[],[]];
 function recordStrand(base,rows,sides){
  for(let level=0;level<2;level++){
   const along=Math.ceil(rows/(level===0?2:4));
   const around=sides===1?1:Math.min(sides,level===0?6:3);
   const out=detail[level];
   for(let y=0;y<along;y++){
    const top=base+Math.round(y*rows/along)*(sides+1);
    const bottom=base+Math.round((y+1)*rows/along)*(sides+1);
    for(let x=0;x<around;x++){
     const a=Math.round(x*sides/around),b=Math.round((x+1)*sides/around);
     out.push(top+a,top+b,bottom+a,top+b,bottom+b,bottom+a);
    }
   }
  }
 }
 const segments=18, position=new T.Vector3(), normal=new T.Vector3(), across=new T.Vector3();
 const deep=new T.Color(0x48181b), ruby=new T.Color(0x8b3d33), copper=new T.Color(0xbb6650);
 for(let guide=0;guide<101;guide++){
  const a=(rnd(guide+16)-.5)*4.1, elevation=-.36+rnd(guide+66)*1.89;
  const root=new T.Vector3(Math.sin(a)*Math.cos(elevation),Math.sin(elevation),Math.cos(a)*Math.cos(elevation)).multiply(radii).add(centre);
  const high=T.MathUtils.smoothstep(elevation,.24,1.37), nape=1-high;
  const x=Math.sin(a), z=Math.cos(a), phase=guide*2.39996, lift=.08+high*(.23+.14*rnd(guide+2)), length=.55+.46*rnd(guide+9);
  const p=(dx,y,dz)=>new T.Vector3(root.x+x*dx,root.y+y,root.z+z*dx+dz);
  const curve=new T.CatmullRomCurve3([root,p(.08,lift*.72,.09),p(.15,lift,.25),
    p(.17+.08*rnd(guide+70),lift*.62-.16*nape,.52),p(.17,lift*.15-.46*nape,.68),
    p(.12,-length*(.28+.60*nape),.68+.14*rnd(guide+4))]);
  if(high>.65 && guide%3!==0) {
   // The crown lifts into uneven flame-shaped tips above the fluted forehead.
   const liftTip=.07+.18*rnd(guide+30);
   curve.points[3].y+=liftTip*.35;
   curve.points[4].y+=liftTip*.85;
   curve.points[5].y+=liftTip*1.38;
   const fan=.23*x+.16*Math.sin(phase*.77);
   curve.points[3].x+=fan*.28;curve.points[4].x+=fan*.74;
   curve.points[5].x+=fan+.30*Math.sin(phase);
   curve.points[5].z-=.22;
  }
  // In the frontal cut the crest swells sideways and sweeps behind the
  // crown. Keep the neck locks hanging at their original attachment.
  for(let j=1;j<curve.points.length;j++){
   const point=curve.points[j],rise=Math.max(0,point.y-root.y);
   point.y-=rise*.29*high;
   point.z+=rise*.17*high;
   point.x+=(point.x-root.x)*.17*high;
  }
  // The front hairline lies on the camera side of the carved crest (-Z).
  // Stagger the first ranks down its face, then run their ends through
  // the tall rear locks. Each lock has its own crown height and lateral curl.
  const frontRank=guide%5===0;
  if(frontRank){
   const side=2*rnd(guide+504)-1,edge=Math.abs(side),roll=rnd(guide+771);
   // Span the depth of the scalp. If every front lock starts on the
   // forehead plane, a head turn exposes a slice of sky behind the plumes.
   const layer=((guide/5)%7)/6;
   const rootY=.04+.11*(1-edge)+.055*rnd(guide+743);
   root.set(side*.28,rootY+.035*layer,-.36+.13*edge-.06*rnd(guide+318)+.38*layer);
   const lean=side*.15+.09*Math.sin(phase),peak=(.17+.21*roll)*(.84+.16*layer);
   const curl=.08+.15*rnd(guide+654),curlSide=Math.sin(phase*.72);
   const offset=(x,y,z)=>new T.Vector3(root.x+x,root.y+y,root.z+z);
   curve.points=[root,offset(lean*.13,.13,-.02+.045*layer),offset(lean*.50,peak*.55,.055+.10*layer),
    offset(lean,peak*.86,.15+.16*layer),offset(lean+curlSide*curl,peak,.26+.23*layer),
    offset(lean+curlSide*curl*1.6,peak+.035+.055*rnd(guide+333),.37+.13*roll+.28*layer)];
   curve.updateArcLengths();
  }
  // Around 36–42s the upper crest is a fan of uneven hooked clumps. Its
  // outer hairs peel away from the arc and its lower roots stay on the helm.
  // Bend the existing guides so their core, cards and individual hairs agree.
  const crestWeight=frontRank?.78:high;
  if(crestWeight>.20){
   const curl=.075+.135*rnd(guide+834),turn=phase+.60*rnd(guide+719);
   const side=frontRank?Math.sign(root.x||1):Math.sin(a);
   for(let j=1;j<curve.points.length;j++){
    const f=j/(curve.points.length-1),loose=f*f*crestWeight;
    const tip=Math.sin(1.45*Math.PI*f);
    curve.points[j].x+=loose*(side*(.072+.122*rnd(guide+945))+curl*Math.sin(turn+f*4.1));
    curve.points[j].y+=loose*(.028+.19*rnd(guide+431))+.076*crestWeight*tip;
    curve.points[j].z+=loose*curl*Math.cos(turn+f*3.7);
   }
   curve.updateArcLengths();
  }
  const frames=[];
  for(let j=0;j<=segments;j++){
   const t=j/segments,c=curve.getPointAt(t),tan=curve.getTangentAt(t);
   across.set(1,0,0).addScaledVector(tan,-tan.x).normalize().applyAxisAngle(tan,.34*Math.sin(phase+t*6));
   normal.crossVectors(tan,across).normalize();
   const rootTaper=frontRank?.32+.68*T.MathUtils.smoothstep(t,0,.17):1;
   const width=(.022+.032*rnd(guide+17))*rootTaper*(.72+.28*Math.sin(Math.PI*t))*Math.pow(Math.max(.0001,1-t),1.10);
   c.addScaledVector(across,.043*t*Math.sin(phase+t*9));
   frames.push([c,across.clone(),normal.clone(),width]);
  }
  // The high locks separate into fine filaments as they clear the
  // bronze crest. Lower neck locks keep the heavier overlapping shape.
  const strands=high>.48&&guide%3!==0?6:4;
  for(let strand=0;strand<strands;strand++){
   const solid=strand===0,sides=solid?10:1,base=positions.length/3;
   recordStrand(base,segments,sides);
   for(let j=0;j<=segments;j++){
    const t=j/segments,[c,side,out,width]=frames[j],filament=strand>=4;
    for(let k=0;k<=sides;k++){
     const cross=k/sides, angle=solid?2*Math.PI*cross:phase+strand*2.1+.55*t;
     const flute=.5+.5*Math.cos(4*angle+t*2);
     const loose=solid?.74*(1-T.MathUtils.smoothstep(t,.39,.83)):1.12+.64*t*t;
     const thread=filament?.28:1;
     const lift=filament?T.MathUtils.smoothstep(t,.45,1):0;
     const cardWidth=1.5*(1-.52*high*T.MathUtils.smoothstep(t,.30,.76));
     position.copy(c).addScaledVector(side,width*(Math.cos(angle)*loose+(solid?0:(cross-.5)*cardWidth*thread)))
       .addScaledVector(out,width*Math.sin(angle)*(.45+.09*flute)*loose);
     if(filament){
       position.addScaledVector(side,(strand===4?1:-1)*lift*(.046+.075*rnd(guide+44))*Math.sin(t*2.4));
       position.addScaledVector(out,lift*(.065+.052*Math.sin(phase+strand+t*3)));
       position.y+=lift*(.045+.23*rnd(guide+strand*3));
     }
     positions.push(position.x,position.y,position.z);
     col.copy(deep).lerp(ruby,.08+.47*t+.20*rnd(guide+71)).lerp(copper,.13*flute*t);
     col.multiplyScalar(.82+.18*flute+(filament?.23*t:0));colors.push(col.r,col.g,col.b);
     uvs.push(solid?(1+254*cross)/384:(258+124*cross)/384,1-t);roots.push(root.x,root.y,root.z);weights.push(t);phases.push(phase);
     if(j<segments&&k<sides){const n=base+j*(sides+1)+k;indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
    }
   }
  }
  // Beyond the body of each lock the silhouette is made of curved fibers.
  // Their sections taper to points and terminate independently in space.
  const fiberCount=high>.46?10:5;
  for(let f=0;f<fiberCount;f++){
   const seed=guide*29+f,angle=2*Math.PI*rnd(seed+519),turn=.8+1.2*rnd(seed+93);
   const start=.31+.18*rnd(seed+187),finish=.82+.18*rnd(seed+281);
   const radius=.0024+.0017*rnd(seed+12),offset=.22+.76*rnd(seed+63);
   const base=positions.length/3,fSteps=12,sides=4;
   recordStrand(base,fSteps,sides);
   for(let j=0;j<=fSteps;j++){
    const u=j/fSteps,t=start+(finish-start)*u,at=t*segments,k=Math.min(segments-1,Math.floor(at)),v=at-k;
    const [a,ax,ay,aw]=frames[k],[b,bx,by,bw]=frames[k+1];
    const cx=a.clone().lerp(b,v),xx=ax.clone().lerp(bx,v).normalize(),yy=ay.clone().lerp(by,v).normalize();
    const w=T.MathUtils.lerp(aw,bw,v),spread=offset*w+u*u*(.015+.058*rnd(seed+721));
    const spin=angle+turn*u+.13*Math.sin(phase+u*5);
    cx.addScaledVector(xx,spread*Math.cos(spin)).addScaledVector(yy,spread*Math.sin(spin));
    cx.y+=u*u*(.018+.115*rnd(seed+233))*(.35+.65*high);
    const rr=radius*(.90+.10*Math.sin(u*Math.PI))*(.04+.96*(1-u)**.72);
    col.copy(ruby).lerp(copper,.07+.37*rnd(seed+401)+.15*u).multiplyScalar(.73+.40*rnd(seed+69));
    for(let h=0;h<=sides;h++){
     const az=2*Math.PI*h/sides;
     position.copy(cx).addScaledVector(xx,rr*Math.cos(az)).addScaledVector(yy,rr*Math.sin(az));
     positions.push(position.x,position.y,position.z);colors.push(col.r,col.g,col.b);
     // Sample a dense proximal strip for the individual physical filaments.
     uvs.push((88+37*h/sides)/384,.994);
     roots.push(root.x,root.y,root.z);weights.push(t);phases.push(phase+.09*f);
     if(j<fSteps&&h<sides){const q=base+j*(sides+1)+h;indices.push(q,q+1,q+sides+1,q+1,q+sides+2,q+sides+1);}
    }
   }
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setAttribute('lockRoot',new T.Float32BufferAttribute(roots,3));
 geometry.setAttribute('lockWeight',new T.Float32BufferAttribute(weights,1));geometry.setAttribute('lockPhase',new T.Float32BufferAttribute(phases,1));
 geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.8;
 const uniforms={headFurTime:{value:0},headFurTurn:{value:0},riderSeated:{value:0},maneRestBasis:{value:new T.Matrix3()}};
 const material=new T.MeshStandardMaterial({map:strandMap(),alphaTest:.25,vertexColors:true,roughness:.77,metalness:0,side:T.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='uniform float headFurTime;uniform float headFurTurn;uniform float riderSeated;uniform mat3 maneRestBasis;attribute vec3 lockRoot;attribute float lockWeight;attribute float lockPhase;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   float loose=lockWeight*lockWeight;
   vec3 lock=transformed-lockRoot;
   float crest=riderSeated*smoothstep(.01,.30,lock.y);
   lock.z+=crest*lock.y*.67;
   lock.y*=1.-.34*crest;
   lock.x*=1.-.12*crest;
   // The scalp turns with the helm; free ends keep hanging in the upright frame.
   transformed=lockRoot+mix(lock,maneRestBasis*lock,min(1.,loose*1.15));
   transformed.x+=(sin(headFurTime*1.9+lockPhase)*.055+sin(headFurTime*3.7+lockPhase*2.1)*.02+headFurTurn*2.2)*loose;
   transformed.z+=(cos(headFurTime*1.5+lockPhase*1.3)*.05+abs(headFurTurn)*.9)*loose;
   transformed.y+=sin(headFurTime*2.3+lockPhase*.7)*.03*lockWeight;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   // Thin hair: light arriving from behind glows through in warm red.
   #if NUM_DIR_LIGHTS > 0
    for(int maneLight=0;maneLight<NUM_DIR_LIGHTS;maneLight++){
     float through=max(0.,dot(-normal,directionalLights[maneLight].direction));
     outgoingLight+=diffuseColor.rgb*vec3(1.25,.52,.34)*directionalLights[maneLight].color*through*.20;
    }
   #endif
   outgoingLight+=diffuseColor.rgb*vec3(.063,.020,.014);
   #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=> 'consort-red-mane-hooked-crest';
 const mesh=new T.Mesh(geometry,material);mesh.name='consort-red-mane';mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;
 const levels=[geometry.index,...detail.map(array=>new T.Uint32BufferAttribute(array,1))];
 const center=new T.Vector3(),eye=new T.Vector3();
 mesh.onBeforeRender=function(renderer,scene,camera){
  let tier=0;
  if(!fullDetail()&&camera.isPerspectiveCamera){
   const radius=geometry.boundingSphere.radius*mesh.matrixWorld.getMaxScaleOnAxis();
   center.copy(geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
   eye.setFromMatrixPosition(camera.matrixWorld);
   const pixels=radius*renderer.domElement.height*camera.projectionMatrix.elements[5]/Math.max(.05,center.distanceTo(eye)-radius);
   tier=pixels<110?2:pixels<330?1:0;
  }
  if(geometry.index!==levels[tier])geometry.setIndex(levels[tier]);
 };
 return {mesh,uniforms};
}
