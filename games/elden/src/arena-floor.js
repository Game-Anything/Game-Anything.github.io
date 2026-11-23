import * as T from "game/lib/three.module.js";
// Arena floor.  The footage shows three kinds of ground:
//  * open sand in the fighting area: smooth, matte, warm grey-brown, softly lit;
//  * dark irregular rock and layered slab debris breaking through the sand;
//  * pale drifts of ash-covered, cloth-draped remains heaped around the rim.
// This module bakes tileable reliefs for the debris and the remains, builds the
// displaced floor that carries them, and scatters real slabs for silhouette.
// Everything is generated procedurally; nothing here reads the reference video.
function lcg(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function lattice(seed){
  const r=lcg(seed),table=new Float32Array(4096);for(let i=0;i<4096;i++)table[i]=r();
  const at=(x,y)=>table[((x&63)*64+(y&63))&4095];
  return(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y);let fx=x-xi,fy=y-yi;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    const a=at(xi,yi),b=at(xi+1,yi),c=at(xi,yi+1),d=at(xi+1,yi+1);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;};
}
export const RELIEF_TILE=16,RELIEF_HEIGHT=.52,RELIEF_SLOPE=8,DETAIL_TILE=3.2,DETAIL_SLOPE=6,RUBBLE_TILE=9,RUBBLE_HEIGHT=.24,RUBBLE_SLOPE=8;
// The floor, loose stone and Tripo remains see the same sky opening.
export function createAshLight(){
  return {ashSightEye:{value:new T.Vector3()},ashSightFoot:{value:new T.Vector3()},ashSightWeight:{value:0},ashFields:{value:null},ashFieldsReady:{value:false},ashSun:{value:new T.Vector3(.21,.38,-.9).normalize()},ashFill:{value:1},ashPhase:{value:0},ashVisibility:{value:null},ashMicro:{value:null},ashCloud:{value:null},ashCloudTime:{value:0}};
}
const wrap=(v,N)=>((v%N)+N)%N;
function blurWrap(source,N,radius){
  const tmp=new Float32Array(N*N),out=new Float32Array(N*N),n=radius*2+1;
  for(let y=0;y<N;y++){let sum=0;const row=y*N;for(let k=-radius;k<=radius;k++)sum+=source[row+wrap(k,N)];
    for(let x=0;x<N;x++){tmp[row+x]=sum/n;sum+=source[row+wrap(x+radius+1,N)]-source[row+wrap(x-radius,N)];}}
  for(let x=0;x<N;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=tmp[wrap(k,N)*N+x];
    for(let y=0;y<N;y++){out[y*N+x]=sum/n;sum+=tmp[wrap(y+radius+1,N)*N+x]-tmp[wrap(y-radius,N)*N+x];}}
  return out;
}
function soften(h,N){
  const out=new Float32Array(N*N);
  for(let y=0;y<N;y++){const up=wrap(y-1,N)*N,mid=y*N,down=wrap(y+1,N)*N;
    for(let x=0;x<N;x++){const l=wrap(x-1,N),r=wrap(x+1,N);
      out[mid+x]=(h[mid+x]*4+(h[mid+l]+h[mid+r]+h[up+x]+h[down+x])*2+h[up+l]+h[up+r]+h[down+l]+h[down+r])/16;}}
  return out;
}
// Soft Gaussian dot, max-blended: successive dots along a streamline make one fold.
function dot(buffer,N,x,y,sigma,amp){
  const R=Math.ceil(sigma*2.4),x0=Math.floor(x)-R,y0=Math.floor(y)-R,k=-.5/(sigma*sigma);
  for(let j=y0;j<=y0+2*R+1;j++){const row=wrap(j,N)*N,dy=j+.5-y;
    for(let i=x0;i<=x0+2*R+1;i++){const dx=i+.5-x,v=amp*Math.exp((dx*dx+dy*dy)*k),q=row+wrap(i,N);if(v>buffer[q])buffer[q]=v;}}
}
function trace(buffer,N,field,x,y,steps,sigma,amp){
  let px=1,py=0;
  for(let j=0;j<steps;j++){
    const taper=Math.pow(Math.sin(Math.PI*(j+.5)/steps),.55);
    dot(buffer,N,x,y,sigma*(.72+.28*taper),amp*taper);
    const a=field(x,y);let dx=Math.cos(a),dy=Math.sin(a);
    if(j&&dx*px+dy*py<0){dx=-dx;dy=-dy;}
    x+=dx;y+=dy;px=dx;py=dy;
  }
}
// RG = slope, B = height, A = cavity (0.5 neutral, higher = more enclosed).
function pack(h,N,px,slopeRange,heightRange,creaseNear,creaseWide,nearRadius,wideRadius){
  const near=blurWrap(h,N,Math.max(1,Math.round(nearRadius/px))),wide=blurWrap(h,N,Math.max(2,Math.round(wideRadius/px)));
  const data=new Uint8Array(N*N*4),byte=v=>Math.max(0,Math.min(255,Math.round(v*255)));
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,l=y*N+wrap(x-1,N),r=y*N+wrap(x+1,N),u=wrap(y-1,N)*N+x,d=wrap(y+1,N)*N+x;
    data[i*4]=byte((h[r]-h[l])/(2*px)/slopeRange+.5);data[i*4+1]=byte((h[d]-h[u])/(2*px)/slopeRange+.5);
    data[i*4+2]=byte(h[i]/heightRange);data[i*4+3]=byte(.5+(near[i]-h[i])*creaseNear+(wide[i]-h[i])*creaseWide);
  }
  return reliefTexture(data,N);
}
function reliefTexture(data,N){
  const texture=new T.DataTexture(data,N,N,T.RGBAFormat);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;texture.colorSpace=T.NoColorSpace;texture.needsUpdate=true;
  return texture;
}
function periodicAngle(rnd,count,span){
  const waves=Array.from({length:count},()=>({kx:Math.round((rnd()-.5)*span),ky:Math.round((rnd()-.5)*span),p:rnd()*6.283,a:.4+rnd()*.6}));
  const base=rnd()*6.283;let norm=0;for(const w of waves)norm+=w.a;
  return(u,v,gain)=>{let s=0;for(const w of waves)s+=w.a*Math.sin(w.kx*u+w.ky*v+w.p);return base+gain*s/norm;};
}
// Cloth-draped remains: swells, bundled forms, a few exposed figures, long folds.
function bakeRemains(N,D){
  const px=RELIEF_TILE/N,rnd=lcg(90417);let h=new Float32Array(N*N);
  const stamp=(ax,ay,bx,by,ra,rb,base,rise,soft)=>{
    const r=Math.max(ra,rb),x0=Math.floor((Math.min(ax,bx)-r)/px),x1=Math.ceil((Math.max(ax,bx)+r)/px);
    const y0=Math.floor((Math.min(ay,by)-r)/px),y1=Math.ceil((Math.max(ay,by)+r)/px);
    const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy||1e-9;
    for(let y=y0;y<=y1;y++){
      const row=wrap(y,N)*N,py=(y+.5)*px;
      for(let x=x0;x<=x1;x++){
        const qx=(x+.5)*px;let t=((qx-ax)*dx+(py-ay)*dy)/l2;t=t<0?0:t>1?1:t;
        const cx=ax+dx*t,cy=ay+dy*t,d2=(qx-cx)*(qx-cx)+(py-cy)*(py-cy),rr=ra+(rb-ra)*t;
        if(d2>=rr*rr)continue;
        const v=base+(rise<0?rr:rise)*Math.pow(1-d2/(rr*rr),soft),i=row+wrap(x,N);
        if(v>h[i])h[i]=v;
      }
    }
  };
  const limb=(x,y,angle,length,ra,rb,base)=>{const ex=x+Math.cos(angle)*length,ey=y+Math.sin(angle)*length;stamp(x,y,ex,ey,ra,rb,base,-1,.62);return[ex,ey];};
  for(let i=0;i<150;i++){
    const x=rnd()*RELIEF_TILE,y=rnd()*RELIEF_TILE,a=rnd()*6.283,l=.6+rnd()*2.0,r=.42+rnd()*.62;
    stamp(x,y,x+Math.cos(a)*l,y+Math.sin(a)*l,r,r*(.6+.5*rnd()),0,.08+.17*rnd(),1.5);
  }
  for(let i=0;i<420;i++){
    const x=rnd()*RELIEF_TILE,y=rnd()*RELIEF_TILE,a=rnd()*6.283,l=.2+rnd()*.9,r=.20+rnd()*.26;
    stamp(x,y,x+Math.cos(a)*l,y+Math.sin(a)*l,r*1.2,r*1.2*(.55+.5*rnd()),.02+.07*rnd(),r*(.55+.45*rnd()),1.25);
  }
  for(let i=0;i<170;i++){
    const x=rnd()*RELIEF_TILE,y=rnd()*RELIEF_TILE,a=rnd()*6.283,s=1.0+rnd()*.38,sunk=.03+rnd()*.15;
    const curl=(rnd()-.5)*1.1,cx=x+Math.cos(a)*.26*s,cy=y+Math.sin(a)*.26*s;
    stamp(x,y,cx,cy,.150*s,.175*s,sunk,-1,.6);
    const [sx,sy]=limb(cx,cy,a+curl*.5,.25*s,.175*s,.165*s,sunk);
    const [nx,ny]=limb(sx,sy,a+curl,.10*s,.07*s,.06*s,sunk+.02);
    limb(nx,ny,a+curl*1.3+(rnd()-.5)*.8,.11*s,.105*s,.095*s,sunk+.015+.02*rnd());
    for(const side of [-1,1]){
      const shoulderX=sx-Math.sin(a+curl*.5)*side*.19*s,shoulderY=sy+Math.cos(a+curl*.5)*side*.19*s;
      const reach=a+curl*.5+side*(.5+rnd()*2.0),bend=side*(rnd()*1.9-.3),armSunk=sunk-.02+rnd()*.07;
      const [ex,ey]=limb(shoulderX,shoulderY,reach,(.27+.05*rnd())*s,.058*s,.050*s,armSunk);
      const [wx,wy]=limb(ex,ey,reach+bend,(.25+.05*rnd())*s,.048*s,.038*s,armSunk-.01+rnd()*.03);
      limb(wx,wy,reach+bend+(rnd()-.5),.07*s,.042*s,.03*s,armSunk);
      const hipX=x-Math.sin(a)*side*.095*s,hipY=y+Math.cos(a)*side*.095*s;
      const stride=a+Math.PI+side*(.12+rnd()*.75)+(rnd()-.5)*.5,knee=(rnd()-.35)*1.9*(rnd()<.5?1:-1),legSunk=sunk-.03+rnd()*.07;
      const [kx,ky]=limb(hipX,hipY,stride,(.40+.05*rnd())*s,.088*s,.068*s,legSunk);
      const [fx,fy]=limb(kx,ky,stride+knee,(.39+.05*rnd())*s,.062*s,.044*s,legSunk-.015+rnd()*.03);
      limb(fx,fy,stride+knee+(rnd()-.5)*1.2,.16*s,.05*s,.036*s,legSunk);
    }
  }
  for(let i=0;i<120;i++){
    const x=rnd()*RELIEF_TILE,y=rnd()*RELIEF_TILE,a=rnd()*6.283,l=.18+rnd()*.5,r=.028+rnd()*.035;
    limb(x,y,a,l,r*1.2,r,.03+rnd()*.10);
  }
  // Powder settles between everything: a slowly varying level buries the low parts.
  const level=periodicAngle(rnd,9,10);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const fill=.060+.050*Math.sin(level((x+.5)/N*6.283185,(y+.5)/N*6.283185,3.1));
    const i=y*N+x,d=h[i]-fill,k=.04;
    h[i]=d>k?h[i]:d<-k?fill:fill+(d+k)*(d+k)/(4*k);
  }
  // Drapery: long folds follow the contours of the swells and bunch in the hollows.
  const smooth=blurWrap(h,N,Math.round(.11/px)),drift=periodicAngle(rnd,7,8),fold=new Float32Array(N*N);
  const flow=(x,y)=>{
    const xi=wrap(Math.floor(x),N),yi=wrap(Math.floor(y),N);
    const gx=(smooth[yi*N+wrap(xi+2,N)]-smooth[yi*N+wrap(xi-2,N)])/(4*px),gy=(smooth[wrap(yi+2,N)*N+xi]-smooth[wrap(yi-2,N)*N+xi])/(4*px);
    const slope=Math.hypot(gx,gy),w=Math.min(1,slope/.30)*.58,a=drift(x/N*6.283185,y/N*6.283185,2.6);
    return Math.atan2(gx/(slope+1e-6)*w+Math.sin(a)*(1-w),-gy/(slope+1e-6)*w+Math.cos(a)*(1-w));
  };
  for(let i=0;i<3000;i++){
    const sigma=(.022+rnd()*.026)/px,amp=.008+rnd()*.022,steps=Math.round((.6+rnd()*rnd()*3.4)/px);
    trace(fold,N,flow,rnd()*N,rnd()*N,steps,sigma,amp);
  }
  for(let i=0;i<h.length;i++)h[i]+=fold[i];
  h=soften(h,N);
  const relief=pack(h,N,px,RELIEF_SLOPE,RELIEF_HEIGHT,7.0,1.5,.05,.22);
  // Fine wrinkle layer: closely spaced, nearly parallel creases a few centimetres apart.
  const dpx=DETAIL_TILE/D,fine=new Float32Array(D*D),grain=periodicAngle(rnd,6,6);
  const fineFlow=(x,y)=>grain(x/D*6.283185,y/D*6.283185,1.9);
  for(let i=0;i<1700;i++){
    const sigma=(.0045+rnd()*.0085)/dpx,amp=(.0035+rnd()*.0125)*(rnd()<.3?1.6:1),steps=Math.round((.3+rnd()*1.8)/dpx);
    trace(fine,D,fineFlow,rnd()*D,rnd()*D,steps,sigma,amp);
  }
  const detail=pack(soften(fine,D),D,dpx,DETAIL_SLOPE,.03,26,9,.012,.05);
  return {relief,detail};
}
// Layered debris: irregular flat slabs lying across each other, long shards and crumbs.
function bakeRubble(N){
  const px=RUBBLE_TILE/N,rnd=lcg(51733);let h=new Float32Array(N*N);
  const slab=(cx,cy,length,width,angle,base,tiltX,tiltY,bevel)=>{
    const n=6+Math.floor(rnd()*4),start=rnd()*6.283,ca=Math.cos(angle),sa=Math.sin(angle),verts=[];
    for(let k=0;k<n;k++){
      const a=start+(k+(rnd()-.5)*.55)/n*6.283,lx=Math.cos(a)*length*.5*(.78+.22*rnd()),ly=Math.sin(a)*width*.5*(.78+.22*rnd());
      verts.push([cx+lx*ca-ly*sa,cy+lx*sa+ly*ca]);
    }
    const edges=verts.map((v,k)=>{const w=verts[(k+1)%n],ex=w[0]-v[0],ey=w[1]-v[1],len=Math.hypot(ex,ey)||1e-6;return[v[0],v[1],-ey/len,ex/len];});
    const r=Math.max(length,width)*.5+.02,x0=Math.floor((cx-r)/px),x1=Math.ceil((cx+r)/px),y0=Math.floor((cy-r)/px),y1=Math.ceil((cy+r)/px);
    for(let y=y0;y<=y1;y++){
      const row=wrap(y,N)*N,qy=(y+.5)*px;
      for(let x=x0;x<=x1;x++){
        const qx=(x+.5)*px;let d=1e9;
        for(const e of edges){const s=(qx-e[0])*e[2]+(qy-e[1])*e[3];if(s<d)d=s;if(d<=0)break;}
        if(d<=0)continue;
        const shoulder=1-Math.exp(-d/(bevel*1.8));
        const split=.75+.25*Math.abs(Math.sin((qx-cx)*17+(qy-cy)*11+.42*Math.sin(qy*8)));
        const v=Math.max(0,base+tiltX*(qx-cx)+tiltY*(qy-cy))*shoulder*split,i=row+wrap(x,N);
        if(v>h[i])h[i]=v;
      }
    }
  };
  const any=()=>rnd()*RUBBLE_TILE,tilt=amount=>(rnd()-.5)*2*amount;
  for(let i=0;i<11;i++)slab(any(),any(),.73+rnd()*.76,.3+rnd()*.38,rnd()*6.283,.045+rnd()*.06,tilt(.09),tilt(.09),.05);
  for(let i=0;i<16;i++)slab(any(),any(),1.2+rnd()*1.0,.09+rnd()*.08,rnd()*6.283,.06+rnd()*.07,tilt(.05),tilt(.05),.022);
  for(let i=0;i<104;i++)slab(any(),any(),.23+rnd()*.49,.12+rnd()*.23,rnd()*6.283,.04+rnd()*.10,tilt(.20),tilt(.20),.036);
  for(let i=0;i<300;i++)slab(any(),any(),.12+rnd()*.28,.08+rnd()*.12,rnd()*6.283,.03+rnd()*.10,tilt(.35),tilt(.35),.018);
  for(let i=0;i<5200;i++){
    const x=any(),y=any(),r=.012+rnd()*rnd()*.075,rise=r*(.55+.5*rnd()),x0=Math.floor((x-r)/px),x1=Math.ceil((x+r)/px),y0=Math.floor((y-r)/px),y1=Math.ceil((y+r)/px);
    for(let j=y0;j<=y1;j++)for(let k=x0;k<=x1;k++){
      const dx=(k+.5)*px-x,dy=(j+.5)*px-y,d2=(dx*dx+dy*dy)/(r*r);if(d2>=1)continue;
      const q=wrap(j,N)*N+wrap(k,N),v=h[q]*.35+rise*Math.sqrt(1-d2);if(v>h[q])h[q]=v;
    }
  }
  h=soften(h,N);
  return pack(h,N,px,RUBBLE_SLOPE,RUBBLE_HEIGHT,9,3,.03,.13);
}
export function bakeGroundRelief(size=1024,detailSize=512){
  return {...bakeRemains(size,detailSize),rubble:bakeRubble(size)};
}
// Start loading the authored relief while the rest of the arena is being built.
// DataTexture preserves the fourth (cavity) channel without alpha processing.
export function loadGroundRelief(){
  const maps={relief:reliefTexture(null,1024),detail:reliefTexture(null,512),rubble:reliefTexture(null,1024)};
  const ready=fetch(new URL('../assets/terrain/ground-relief.bin',"https://radahn-offline.invalid/src/arena-floor.js"))
    .then(async response=>{
      if(!response.ok)throw Error('Ground relief unavailable');
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==4*(1024**2*2+512**2))throw Error('Incomplete ground relief');
      let offset=0;
      for(const map of Object.values(maps)){
        const next=offset+4*map.image.width*map.image.height;
        map.image.data=bytes.subarray(offset,next);map.needsUpdate=true;offset=next;
      }
    }).catch(()=>{
      const baked=bakeGroundRelief();
      for(const name of Object.keys(maps)){
        maps[name].image=baked[name].image;maps[name].needsUpdate=true;
      }
    });
  return {...maps,ready};
}
// A shallow diagonal channel runs between the raised beds on the west terrace.
// Keep its powder in the same world-space location when the camera turns.
// The near lip runs diagonally from the entrance towards the gate. Its coarse
// strata and the softer scoured bed use the same axis in geometry and light.
export function entryLipX(z){return -1.45+.19*z+.73*Math.sin(.31*z+.35)+.26*Math.sin(.81*z);}
export function entryReach(z){return T.MathUtils.smoothstep(z,-31,-23)*(1-T.MathUtils.smoothstep(z,-.4,3.1));}
export function entryBed(x,z){
 const d=x-entryLipX(z);
 return entryReach(z)*(1-T.MathUtils.smoothstep(Math.abs(d+1.75),.72,2.12));
}
export function westAshChannel(x,z){
  const along=(x+16)*.72+(z+9)*.69;
  const across=(z+9)*.72-(x+16)*.69-.85*Math.sin(along*.25);
  return (1-T.MathUtils.smoothstep(Math.abs(along),6,13))*
    (1-T.MathUtils.smoothstep(Math.abs(across),1.5,4.0));
}
const shaderNoise=`float ashHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float ashNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(ashHash(i),ashHash(i+vec2(1,0)),f.x),mix(ashHash(i+vec2(0,1)),ashHash(i+vec2(1,1)),f.x),f.y);}
float ashFbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=ashNoise(p)*a;p=p*2.03+3.1;a*=.5;}return v;}
// The palace sightline crosses a sunlit shelf behind the darker entry-side ash.
// Keep the footprint fixed as the player runs through it.
float terraceSun(vec2 p){
  vec2 axis=normalize(vec2(.86,.51));
  vec2 offset=p-vec2(1.9,5.1);
  float across=(dot(offset,axis)+2.7*(ashNoise(p*.16)-.5))/6.8;
  float along=dot(offset,vec2(-axis.y,axis.x))/26.;
  return exp(-across*across-along*along);
}
vec2 entryRelief(vec2 p){
  float dx=p.x-(-1.45+.19*p.y+.73*sin(.31*p.y+.35)+.26*sin(.81*p.y));
  float reach=smoothstep(-31.,-23.,p.y)*(1.-smoothstep(-.4,3.1,p.y));
  float bed=1.-smoothstep(.72,2.12,abs(dx+1.75));
  float rim=exp(-dx*dx*1.06);
  return vec2(bed,rim)*reach;
}
float colonnadeShade(vec2 p){
  vec2 q=p-vec2(24.,-16.);
  vec2 uv=vec2(q.x+.40*q.y,q.y-.40*q.x)/vec2(16.,31.);
  return exp(-dot(uv,uv))*(.77+.23*ashNoise(p*.16));
}`;
const tones=`vec3 sandTone=mix(vec3(.226,.209,.187),vec3(.396,.361,.317),smoothstep(.30,.72,ashBroad*.6+ashPatch*.4))*(.97+.06*ashGrain);
      vec3 paleTone=mix(vec3(.276,.257,.230),vec3(.521,.485,.430),smoothstep(.30,.72,ashPatch*.6+ashBroad*.4))*(.95+.10*ashGrain);`;
const f1=v=>v.toFixed(1),f2=v=>v.toFixed(2);
function shadeAshShadow(fragment){
  const sun='getDirectionalLightInfo( directionalLight, directLight );';
  return fragment.replace(sun,sun+`
    #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
      float ashShadowFill=1., ashShadowRadius=directionalLightShadows[ i ].shadowRadius;
      if(ashPhase>0. && receiveShadow){
        vec4 projectedShadow=vDirectionalShadowCoord[ i ];
        vec3 coord=projectedShadow.xyz/projectedShadow.w;
        // The orthographic sun spans 189 m in depth. A blocker still present
        // one metre toward the sun casts a detached shadow on the powder.
        #ifdef USE_REVERSED_DEPTH_BUFFER
          coord.z+=.0053;
        #else
          coord.z-=.0053;
        #endif
        float detached=1.-texture(directionalShadowMap[ i ],coord);
        ashShadowFill-=ashPhase*.52*detached;
        // Use a world-sized penumbra as the shadow map changes resolution.
        float texelsPerMeter=directionalLightShadows[ i ].shadowMapSize.x/36.;
        ashShadowRadius+=ashPhase*texelsPerMeter*(.012+.048*detached);
      }
    #endif`).replace(
    /directionalLightShadow\.shadowIntensity, directionalLightShadow\.shadowBias, directionalLightShadow\.shadowRadius,/,
    `directionalLightShadow.shadowIntensity
      #if defined( SHADOWMAP_TYPE_PCF )
        *ashShadowFill, directionalLightShadow.shadowBias, ashShadowRadius,
      #else
        , directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius,
      #endif
    `);
}
// The floor uses baked relief and zone blending. Loose pebbles and broken slabs
// share a rock base, with powder retained on the broad upper faces of slabs.
// The raised remains, floor and stone share the haze lighting and arena flash.
export function ashSurfaceMaterial(material,{relief=null,detail=null,rubble=null,flashCenter,flashPower,light=createAshLight(),floor=false,mode=null,key='ash'}={}){
  const kind=mode||(floor?'floor':'remains'),isFloor=kind==='floor';
  const uniforms={ashRelief:{value:relief},ashDetail:{value:detail},ashRubble:{value:rubble},ashFlashCenter:flashCenter,ashFlashPower:flashPower,...light};
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    previous?.(shader);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=(isFloor?'attribute float ashCover,ashRock,ashChannel;varying float vAshCover,vAshRock,vAshChannel;\n':'')+'varying vec3 ashWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 ashPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      ashPosition=instanceMatrix*ashPosition;
      #endif
      ashWorld=(modelMatrix*ashPosition).xyz;${isFloor?'vAshCover=ashCover;vAshRock=ashRock;vAshChannel=ashChannel;':''}`);
    shader.fragmentShader=(isFloor?'uniform sampler2D ashRelief,ashDetail,ashRubble;varying float vAshCover,vAshRock,vAshChannel;\n':'')+'varying vec3 ashWorld;uniform vec3 ashFlashCenter;uniform float ashFlashPower;uniform vec3 ashSun;uniform float ashFill;uniform float ashPhase,ashCloudTime;uniform sampler2D ashVisibility,ashCloud;\n'+shaderNoise+'\n'+shader.fragmentShader;
    if(!isFloor){
      shader.fragmentShader='uniform vec3 ashSightEye,ashSightFoot;uniform float ashSightWeight;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        if(ashSightWeight>0.){
          vec3 ray=ashSightFoot-ashSightEye;
          float along=dot(ashWorld-ashSightEye,ray)/max(.001,dot(ray,ray));
          if(along>0. && along<.96){
            float radius=mix(.27,.74,along);
            float side=distance(ashWorld,ashSightEye+along*ray);
            if(side<radius*ashSightWeight)discard;
          }
        }`);
    }
    shader.fragmentShader='uniform sampler2D ashFields,ashMicro;uniform bool ashFieldsReady;\n'+shader.fragmentShader;
    const floorColor=`
      vec4 reliefA=texture2D(ashRelief,ashWorld.xz/${f1(RELIEF_TILE)});
      vec4 reliefB=texture2D(ashRelief,mat2(.8,.6,-.6,.8)*ashWorld.xz/11.3+vec2(.37,.11));
      float ashRegion=smoothstep(.40,.60,fields.b);
      vec2 reliefSlope=mix((reliefA.rg-.5)*${f1(RELIEF_SLOPE)},mat2(.8,-.6,.6,.8)*((reliefB.rg-.5)*${f1(RELIEF_SLOPE)}),ashRegion);
      float reliefHeight=mix(reliefA.b,reliefB.b*.706,ashRegion);
      vec4 fineA=texture2D(ashDetail,ashWorld.xz/${f1(DETAIL_TILE)});
      vec4 fineB=texture2D(ashDetail,mat2(.6,.8,-.8,.6)*ashWorld.xz/2.7+vec2(.21,.63));
      float fineRegion=smoothstep(.38,.62,fields.a);
      vec2 fineSlope=mix((fineA.rg-.5)*${f1(DETAIL_SLOPE)},mat2(.6,-.8,.8,.6)*((fineB.rg-.5)*${f1(DETAIL_SLOPE)}),fineRegion);
      // Raised forms outlast the powder where the heaps thin out into open sand.
      // Half-buried folds also cross the central fighting ground in broken
      // windrows. Their sharp ridges still catch light in the shallow ash.
      float windrow=sin(ashWorld.x*.31+ashWorld.z*.19+1.7*sin(ashWorld.z*.14)+1.2*ashNoise(ashWorld.xz*.31));
      float trough=smoothstep(.08,.91,windrow)*smoothstep(.17,.69,ashNoise(ashWorld.xz*.105+vec2(16.,27.)));
      float westernReach=(1.-smoothstep(-13.,1.,ashWorld.x))*smoothstep(-43.,-28.,ashWorld.x);
      float laneAxis=-15.7+.13*(ashWorld.x+20.)+1.25*sin(ashWorld.x*.19);
      float powderLane=westernReach*(1.-smoothstep(1.8,5.7,abs(ashWorld.z-laneAxis)+1.3*(ashNoise(ashWorld.xz*.32)-.5)));
      powderLane=max(powderLane,vAshChannel);
      float windrowCover=max(vAshCover,.09+.52*trough)*(1.-.86*powderLane);
      float remains=smoothstep(0.,.54,windrowCover*1.5-(1.-reliefHeight)*.49);
      // Debris: slabs stand clear of the sand in rocky ground and only their crowns show elsewhere.
      vec4 rubble=texture2D(ashRubble,ashWorld.xz/${f1(RUBBLE_TILE)});
      float clump=smoothstep(.60,.80,ashNoise(ashWorld.xz*.43+vec2(41.,7.)))*.5;
      float rockPresence=max(vAshRock,clump)*(1.-remains)*(.71+.26*ashNoise(ashWorld.xz*.44));
      rockPresence*=1.-.79*powderLane;
      float buried=mix(1.02,.03,rockPresence);
      float rock=smoothstep(buried,buried+.07,rubble.b);
      vec2 rubbleSlope=(rubble.rg-.5)*${f1(RUBBLE_SLOPE)}*rock;
      float rubbleCavity=(rubble.a-.5)*max(rock,smoothstep(.70,1.,rockPresence));
      ashSlope=(reliefSlope*.96+fineSlope*.41)*remains+rubbleSlope*.97;
      ashCrease=.5+((mix(reliefA.a,reliefB.a,ashRegion)-.5)+(mix(fineA.a,fineB.a,fineRegion)-.5)*.34)*remains+rubbleCavity;
      // Low sun: every form throws a short soft shadow across the surface.
      vec2 sunAcross=normalize(ashSun.xz);float sunRise=ashSun.y/max(length(ashSun.xz),.001);
      for(int tap=0;tap<2;tap++){
        float reach=tap==0?.09:.26;vec2 at=ashWorld.xz+sunAcross*reach;
        float there=mix(texture2D(ashRelief,at/${f1(RELIEF_TILE)}).b,texture2D(ashRelief,mat2(.8,.6,-.6,.8)*at/11.3+vec2(.37,.11)).b*.706,ashRegion);
        ashBumpShadow=max(ashBumpShadow,remains*smoothstep(0.,.045,(there-reliefHeight)*${f2(RELIEF_HEIGHT)}-sunRise*reach));
        reach=tap==0?.05:.15;at=ashWorld.xz+sunAcross*reach;
        float stone=max(texture2D(ashRubble,at/${f1(RUBBLE_TILE)}).b-buried,0.)-max(rubble.b-buried,0.);
        ashBumpShadow=max(ashBumpShadow,step(.02,rockPresence)*smoothstep(0.,.03,stone*${f2(RUBBLE_HEIGHT)}-sunRise*reach));
      }
      ${tones}
      vec3 rockTone=mix(vec3(.095,.097,.101),vec3(.177,.178,.179),ashNoise(ashWorld.xz*1.9+vec2(5.,23.)))*(.90+.20*ashGrain);
      // Most of the debris wears the same dust as the sand; a few stones stay dark.
      float darkStone=smoothstep(.50,.68,ashNoise(ashWorld.xz*.9+vec2(31.,8.)));
      float dusting=mix(.86,.30,darkStone)*(1.-.5*smoothstep(.2,.7,length(rubbleSlope)));
      rockTone=mix(rockTone,sandTone*(.64+.50*rubble.b),dusting);
      // Pale fragments of the remains are mixed through the debris.
      float paleBits=smoothstep(.60,.72,ashNoise(ashWorld.xz*1.6+vec2(4.,51.)))*smoothstep(.3,.6,rubble.b);
      rockTone=mix(rockTone,paleTone*.78,paleBits);
      // In the second phase the raised, nearly level plates retain pale powder.
      // Keep the broken lips and the buried rubble in the colour of the soil.
      float exposedTop=smoothstep(.13,.36,rubble.b-buried)*(1.-smoothstep(.22,.85,length(rubbleSlope)));
      float chalkPatch=smoothstep(.39,.66,ashNoise(ashWorld.xz*.74+vec2(13.,39.)));
      vec3 stoneAsh=vec3(.225,.195,.155)*(.85+.22*ashGrain);
      rockTone=mix(rockTone,stoneAsh,mix(.38,.46,ashPhase)*exposedTop*chalkPatch);
      // Crumbled ground between the slabs is darker and coarser than the open sand.
      float coarse=ashNoise(ashWorld.xz*6.3+vec2(9.,2.))*ashNoise(ashWorld.xz*17.+vec2(3.,9.));
      vec3 baseTone=mix(sandTone,sandTone*(.56+.34*coarse+.10*ashGrain),smoothstep(.15,.75,rockPresence));
      vec3 groundTone=mix(baseTone,rockTone,rock);
      float fineAsh=(1.-remains)*(1.-rock)*mix(.41,1.,powderLane)*(1.-ashPhase);
      groundTone=mix(groundTone,vec3(.34,.284,.207)*(.87+.23*ashBroad),.48*fineAsh);
      ashSlope*=1.-.51*fineAsh;
      groundTone*=1.-smoothstep(.53,.80,ashCrease)*.48;
      paleTone=mix(paleTone,paleTone*1.10,(1.-smoothstep(.28,.50,ashCrease))*.5+reliefHeight*.3);
      paleTone=mix(paleTone,vec3(.10,.092,.08),smoothstep(.64,.92,ashCrease)*.78);
      // Thin powder at the edge of a heap takes the colour of the sand under it.
      paleTone=mix(sandTone*1.3,paleTone,smoothstep(.25,.9,remains));
      vec3 powder=vec3(.292,.276,.250)*(.87+.21*ashBroad+.035*ashGrain);
      float packedLane=powderLane*(.64+.36*smoothstep(.18,.72,ashPatch));
      float chippedLip=rock*smoothstep(.21,.59,rubble.b)*smoothstep(.20,.56,length(rubbleSlope));
      groundTone=mix(groundTone,rockTone*.70,chippedLip*.56);
      float openAsh=(1.-ashPhase)*(1.-rock)*(.38+.50*packedLane)*(1.-remains);
      groundTone=mix(groundTone,powder*(1.12+.12*ashBroad),openAsh);
      ashSlope*=1.-.50*openAsh;
      diffuseColor.rgb=mix(mix(groundTone,powder,.55*packedLane),paleTone,remains);
      // Powder collects on raised folds; recessed grooves reveal compacted soil.
      float ridge=smoothstep(.43,.71,reliefHeight)*(1.-smoothstep(.49,.65,ashCrease));
      float packedAsh=smoothstep(.50,.70,ashCrease)*(.54+.46*coarse);
      diffuseColor.rgb*=1.+remains*(.19*ridge-.37*packedAsh);
      // Short lee-side streaks taper into smooth silt between the piled casts.
      // Screen derivatives attenuate the small crests before they alias in the distance.
      float windCoordinate=ashWorld.x*.66+ashWorld.z*.34;
      float ripplePhase=windCoordinate*19.+3.2*ashPatch+1.8*sin(ashWorld.z*1.47+windCoordinate*.73);
      float ribFilter=1.-smoothstep(.50,2.1,fwidth(ripplePhase));
      float bankEdge=smoothstep(.16,.48,remains)*(1.-smoothstep(.57,.86,remains));
      float ashLee=bankEdge*(1.-rock)*smoothstep(.28,.66,ashBroad);
      diffuseColor.rgb*=1.+ribFilter*ashLee*(.095*sin(ripplePhase)+.038*cos(ripplePhase*2.+.7));
      // Gate hill (primary 4.0 s): above its powdered toe the heap is the same weathered grey-olive mass as the piers,
      // not a pale bank.  Only the hill rises this far above the terrace.
      float ashHill=smoothstep(1.6,6.5,ashWorld.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.105,.102,.086)*(.70+.60*ashPatch)*(.85+.30*ashGrain),ashHill*.86);`;
    const debrisColor=`
      ${tones}
      vec3 rockTone=mix(vec3(.095,.097,.101),vec3(.177,.178,.179),ashNoise(ashWorld.xz*1.9+vec2(5.,23.)))*(.90+.20*ashGrain);
      float ashUp=normalize(cross(dFdx(ashWorld),dFdy(ashWorld))).y;
      float ashLuma=dot(diffuseColor.rgb,vec3(.30,.59,.11));
      float dusting=mix(.25,.9,smoothstep(.40,.62,ashLuma))*mix(.55,1.,smoothstep(.5,.95,abs(ashUp)));
      diffuseColor.rgb=mix(rockTone,sandTone*.68,dusting)*(.8+.4*ashLuma);
      ${kind==='slab'?`
      float cap=smoothstep(.78,.97,ashUp)*smoothstep(.45,.61,ashLuma);
      float powder=.62+.34*ashNoise(ashWorld.xz*5.2);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.246,.215,.175)*(.85+.22*ashGrain),mix(.38,.46,ashPhase)*cap*powder);`:''}`;
    const remainsColor=`
      ${tones}
      float ashShade=dot(diffuseColor.rgb,vec3(.30,.59,.11));diffuseColor.rgb=mix(sandTone*1.5,paleTone*.72,.22)*clamp(.66+.80*ashShade,.60,1.35);`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec4 fields;
      if(ashFieldsReady && max(abs(ashWorld.x),abs(ashWorld.z))<95.9){
        fields=texture2D(ashFields,ashWorld.xz/192.+.5);
      }else{
        fields.r=ashFbm(ashWorld.xz*.085);
        fields.g=ashFbm(ashWorld.xz*.31+vec2(fields.r*2.,7.));
        fields.b=ashNoise(ashWorld.xz*.052+vec2(11.,3.));
        fields.a=ashNoise(ashWorld.xz*.17+vec2(3.,29.));
      }
      float ashBroad=fields.r,ashPatch=fields.g;
      // Fold sub-pixel grains into their mean instead of flashing them on and
      // off when the camera moves. The mipmapped surface scans carry far detail.
      float groundPixel=max(length(dFdx(ashWorld.xz)),length(dFdy(ashWorld.xz)));
      float grain37=1.-smoothstep(.35,1.15,37.*groundPixel);
      float grain91=1.-smoothstep(.35,1.15,91.*groundPixel);
      float ashGrain=.5+(ashNoise(ashWorld.xz*37.)-.5)*.6*grain37+(ashNoise(ashWorld.xz*91.)-.5)*.4*grain91;
      float ashCrease=.5,ashBumpShadow=0.;vec2 ashSlope=vec2(0.);
      ${isFloor?floorColor:(kind==='debris'||kind==='slab')?debrisColor:remainsColor}
      ${isFloor?`vec2 scoured=vec2(dot(ashWorld.xz,vec2(.86,.51)),dot(ashWorld.xz,vec2(-.51,.86)));
      float driftEdge=ashNoise(scoured*vec2(.63,2.75)+2.4*ashBroad);
      float ashLip=smoothstep(.44,.61,driftEdge)*(1.-smoothstep(.61,.75,driftEdge));
      float exposedBed=(1.-fineAsh)*smoothstep(.28,.72,ashPatch)*(1.-smoothstep(.10,.36,groundPixel));
      diffuseColor.rgb*=1.+exposedBed*(.075*ashLip-.105*(1.-driftEdge));
      ashSlope+=exposedBed*.085*vec2(-.51,.86)*(ashLip-.40);`:''}
      ${kind==='limestone'?`vec2 plane=ashWorld.xz+vec2(.64,-.33)*ashWorld.y;
      float worn=ashNoise(plane*3.7+vec2(8.,5.));
      float chalk=ashNoise(plane*17.)*.60+ashNoise(plane*42.)*.40;
      float vein=abs(sin(dot(plane,vec2(8.2,3.1))+worn*8.+chalk*.75));
      float fissure=(1.-smoothstep(.02,.17,vein))*smoothstep(.42,.71,worn);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.285,.252,.202)*(.80+.30*chalk),.30+.17*worn);
      diffuseColor.rgb*=1.-.54*fissure;
      ashCrease+=.28*fissure;ashSlope+=.12*(vec2(ashNoise(plane*16.+11.),chalk)-.5);`:''}
      mat2 grainTurn=mat2(.8,.6,-.6,.8);
      vec3 grainA=texture2D(ashMicro,ashWorld.xz/4.8).rgb-.5;
      vec3 grainB=texture2D(ashMicro,grainTurn*ashWorld.xz/3.1+vec2(.42,.17)).rgb-.5;
      float grainMix=smoothstep(.23,.78,ashPatch);
      ashSlope+=mix(grainA.rg,vec2(.8*grainB.r+.6*grainB.g,-.6*grainB.r+.8*grainB.g),grainMix)*.73;
      float nativeGrain=mix(grainA.b,grainB.b,grainMix)${isFloor?'*(1.-.59*fineAsh)':''};
      diffuseColor.rgb*=1.+1.03*nativeGrain;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      float polished=smoothstep(.24,.51,ashPatch)*smoothstep(.04,.22,length(ashSlope))*smoothstep(-.10,.13,nativeGrain);
      roughnessFactor=mix(.97,${isFloor?'.78':'.65'},polished);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      {
        float fine=ashNoise(ashWorld.xz*23.)*.005*(1.-smoothstep(.35,1.15,23.*groundPixel))
          +ashNoise(ashWorld.xz*61.)*.0015*(1.-smoothstep(.35,1.15,61.*groundPixel));
        vec3 ashDx=dFdx(vViewPosition),ashDy=dFdy(vViewPosition);
        vec3 ashR1=cross(ashDy,normal),ashR2=cross(normal,ashDx);
        float ashDet=dot(ashDx,ashR1);
        vec3 grained=normalize(abs(ashDet)*normal-sign(ashDet)*(dFdx(fine)*ashR1+dFdy(fine)*ashR2));
        vec3 worldNormal=inverseTransformDirection(grained,viewMatrix);
        worldNormal=normalize(worldNormal-vec3(ashSlope.x,0.,ashSlope.y));
        normal=normalize((viewMatrix*vec4(worldNormal,0.)).xyz);
      }`);
    // Modulate the sun before Three applies shadow mapping and the surface BRDF.
    // Point lights from gravity and holy effects keep their existing gain.
    const sunSample='getDirectionalLightInfo( directionalLight, directLight );';
    const directResponse='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    const lighting=T.ShaderChunk.lights_fragment_begin;
    const sunStart=lighting.indexOf(sunSample);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',
      'vec3 ashSpecBeforeSun; vec3 ashDiffuseBeforeSun; vec3 ashDirectSun=vec3(0.);\n'+lighting.slice(0,sunStart)+lighting.slice(sunStart).replace(sunSample,sunSample+`
      #if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
      ashSpecBeforeSun=reflectedLight.directSpecular; ashDiffuseBeforeSun=reflectedLight.directDiffuse;
      {// Project the same sun shaft onto the sand, rubble and raised remains.
      vec2 sunBearing=normalize(ashSun.xz);
      vec2 footprint=ashWorld.xz-ashSun.xz*(ashWorld.y/max(.08,ashSun.y));
      vec2 shaftUV=vec2(dot(footprint,vec2(-sunBearing.y,sunBearing.x)),
                        dot(footprint,sunBearing))*vec2(.064,.019)+vec2(4.2,1.7);
      vec2 projected=.5+footprint/310.;
      vec2 columnCover=texture2D(ashCloud,projected).rg;
      float overhead=mix(columnCover.r,columnCover.g,ashPhase);
      float cloudGap=ashNoise(shaftUV)*.36+ashNoise(shaftUV*2.7+vec2(1.9,7.1))*.12+.52*(1.-overhead);
      float shaft=smoothstep(.29,.70,cloudGap);
      // Diffuse pools under the southwestern shafts seen from the colonnade
      // (113 and 147 s). World-space coordinates keep the light on the ash.
      vec2 westFoot=ashWorld.xz-vec2(-24.,-8.);
      float crossRay=(westFoot.y+.28*westFoot.x)/7.5;
      float pool=exp(-crossRay*crossRay)*smoothstep(0.,24.,-ashWorld.x)
        *(.45+.55*ashNoise(westFoot*.096));
      // The two broad gate beams illuminate long broken strips down the
      // field. Position them in world space so the camera can cross them.
      float alongGate=footprint.y+42.;
      float striation=ashNoise(footprint*.105)*.42+.58;
      float beamA=(footprint.x+4.-.29*alongGate)/5.6;
      float beamB=(footprint.x-16.-.23*alongGate)/8.1;
      float gatePool=(exp(-beamA*beamA)+.72*exp(-beamB*beamB))*striation;
      vec2 eastFoot=footprint-vec2(22.,-13.);
      float eastStripe=(eastFoot.x+.37*eastFoot.y)*.19;
      gatePool+=.77*exp(-eastStripe*eastStripe-.0022*eastFoot.y*eastFoot.y)*striation;
      shaft=mix(shaft,max(shaft*.73,max(pool,gatePool)),ashPhase);
      // The light on the pale ash is less saturated than the airborne shaft.
      float stoneLight=dot(directLight.color,vec3(.2126,.7152,.0722));
      directLight.color=mix(directLight.color,vec3(stoneLight),mix(.54,.40,ashPhase));
      // The cloud bank above the middle of the terrace shades the ash
      // between the bright lanes; its penumbra also softens the flash edge.
      vec2 basin=(footprint-vec2(-2.,-7.))/vec2(13.,25.);
      float shadowBank=exp(-dot(basin,basin))*(.60+.40*ashNoise(footprint*.13));
      float sunGain=mix(mix(.10,.84,shaft*shaft),mix(.065,1.18,shaft*shaft),ashPhase)
        *(1.-shadowBank*mix(.57,.43,ashPhase));
      // Thin golden pools on the gateward ash dissolve into neutral grey
      // between the lanes, even if the camera looks back at the colonnade.
      float gateReach=smoothstep(-8.,40.,-footprint.y);
      sunGain+=mix(.22,.40,ashPhase)*gateReach*gatePool;
      directLight.color*=mix(vec3(1.),vec3(1.055,1.008,.91),ashPhase*gateReach*gatePool);
      // Native top-down projection of static sunlight on the receiving terrace.
      vec2 probeUV=vec2(ashWorld.x,ashWorld.z+8.)/(128.*(1.-ashWorld.y/1800.))+.5;
      vec2 level=texture2D(ashVisibility,clamp(probeUV,0.,1.)).rg;
      float mapped=1.-smoothstep(.47,.50,max(abs(probeUV.x-.5),abs(probeUV.y-.5)));
      sunGain*=mix(1.,mix(.33,1.,mix(level.r,level.g,ashPhase)),mapped);
      float shelf=terraceSun(footprint);
      sunGain=mix(sunGain*(.79+.35*shelf)+1.52*shelf,
                  sunGain*(1.-.55*colonnadeShade(footprint)),ashPhase);
      directLight.color*=sunGain/.14;}
      #endif`).replace(directResponse,directResponse+`
      #if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
      // The diffuse compensation below is for powdered stone. Applying it to
      // specular as well produces a metallic gold sheen at grazing angles.
      ashDirectSun=max(reflectedLight.directDiffuse-ashDiffuseBeforeSun,vec3(0.));
      reflectedLight.directSpecular=mix(reflectedLight.directSpecular,
        ashSpecBeforeSun+(reflectedLight.directSpecular-ashSpecBeforeSun)*.44,ashPhase);
      #endif`));
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      float ashOcclusion=1.-smoothstep(.49,.81,ashCrease)*.80;
      // The sky is brightest above the sun's bearing: forms facing it are lighter, the far sides fall off.
      vec3 ashSkyBias=normalize((viewMatrix*vec4(normalize(vec3(ashSun.x,.55,ashSun.z)),0.)).xyz);
      float ashWrap=.52+.62*max(dot(normal,ashSkyBias),0.);
      // Preserve the cool skylight in deep hollows beneath warm sunlit ridges.
      vec3 hollowTint=mix(vec3(1.),vec3(.82,.87,.96),ashPhase*(1.-ashOcclusion));
      reflectedLight.indirectDiffuse*=mix(.82,.95,ashPhase)*ashFill*ashOcclusion*ashWrap*hollowTint;
      reflectedLight.indirectDiffuse*=mix(.78+.44*terraceSun(ashWorld.xz),1.-.39*colonnadeShade(ashWorld.xz),ashPhase);
      reflectedLight.indirectSpecular*=mix(.73,.66,ashPhase);
      reflectedLight.directDiffuse+=ashDirectSun*vec3(.42,.32,.19);
      reflectedLight.directDiffuse*=.20*mix(1.,ashOcclusion,.66)*(1.-.53*ashBumpShadow);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      // The arena-wide flash scatters through the ash during the great light bursts.
      vec2 ashOffset=ashWorld.xz-ashFlashCenter.xz;
      float groundScatter=exp(-dot(ashOffset,ashOffset)/700.);
      // Rough ash scatters back toward the low sun when seen across the
      // terrace. Sheltered creases and the reverse view retain their depth.
      vec3 toEye=normalize(cameraPosition-ashWorld);
      float opposition=smoothstep(.12,.79,dot(toEye,ashSun));
      float grazing=1.-smoothstep(.12,.62,abs(toEye.y));
      float dustReturn=ashPhase*opposition*grazing*ashOcclusion*(1.-.65*ashBumpShadow);
      outgoingLight+=ashDirectSun*vec3(.046,.038,.024)*dustReturn;
      float ashValue=dot(outgoingLight,vec3(.2126,.7152,.0722));
      outgoingLight=mix(outgoingLight,vec3(ashValue)*mix(vec3(1.075,.996,.929),vec3(1.105,1.,.845),ashPhase),.31);
      outgoingLight+=diffuseColor.rgb*vec3(.057,.052,.045)*ashOcclusion*(1.-.64*ashBumpShadow);
      float sheltered=1.-smoothstep(.26,.62,dot(outgoingLight,vec3(.2126,.7152,.0722)));
      outgoingLight*=mix(vec3(.89,.90,.96),vec3(.69,.73,.75),sheltered*(.69+.31*ashPhase));
      ${isFloor?`float daylightAsh=(1.-ashPhase)*(1.-remains)*(.55+.45*packedLane);
      outgoingLight=mix(outgoingLight,outgoingLight*vec3(.88,.86,.79)+vec3(.071,.049,.016),daylightAsh);`:''}
      outgoingLight+=diffuseColor.rgb*vec3(5.1,4.25,2.83)*groundScatter*ashFlashPower*(.35+.65*ashOcclusion);
      ${kind==='exposed-remains'?`// The ash crust is bright on open, sky-facing planes and thin in its undercuts.
      vec3 crustNormal=inverseTransformDirection(normal,viewMatrix);
      float upFace=smoothstep(-.14,.74,crustNormal.y);
      float shoulder=.45+.55*smoothstep(-.5,.72,dot(crustNormal,ashSun));
      float abraded=smoothstep(.15,.77,ashShade);
      float dustCap=smoothstep(.20,.82,crustNormal.y)*(.60+.40*ashPatch);
      outgoingLight=mix(outgoingLight,outgoingLight*vec3(1.25,1.27,1.28)+vec3(.032,.032,.029),dustCap*.73);
      float fleck=.79+.24*ashGrain+.13*ashNoise(ashWorld.xz*4.7+ashWorld.y);
      float exposure=(.19+.81*upFace)*shoulder*(.59+.41*abraded);
      float vein=abs(sin(dot(ashWorld.xz,vec2(6.1,-4.8))+4.3*ashPatch+.83*ashNoise(ashWorld.xz*19.)));
      float fissure=(1.-smoothstep(.024,.17,vein))*smoothstep(.46,.73,ashPatch);
      outgoingLight*=.87-.27*fissure;
      outgoingLight+=ashDirectSun*vec3(.42,.354,.252)*exposure*fleck*(1.-.70*fissure)*ashOcclusion;`:''}
      // Daylight catches settled ash on broad upward-facing surfaces. The
      // covered ridges stay lighter than the recessed folds within each heap.
      vec3 dayNormal=inverseTransformDirection(normal,viewMatrix);
      float dayPowder=(1.-ashPhase)*smoothstep(.12,.79,dayNormal.y)
        *sqrt(ashOcclusion)*(1.-.56*ashBumpShadow)*(1.-smoothstep(1.5,6.,ashWorld.y));
      float dayLight=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 dayChalk=vec3(dayLight)*vec3(1.028,1.009,.973);
      float sunPatch=smoothstep(.21,.82,terraceSun(ashWorld.xz));
      float skyFill=(.73+.27*sunPatch)*(1.-.42*ashCrease);
      ${isFloor?`skyFill*=1.-.51*max(rock,remains*(.48+.52*ashCrease));`:''}
      vec3 powdered=dayChalk*mix(1.27,1.49,sunPatch)+vec3(.124,.097,.066)*skyFill;
      outgoingLight=mix(outgoingLight,powdered,dayPowder*${isFloor?'.98':'.64'});
      outgoingLight*=1.-(1.-ashPhase)*(1.-sunPatch)*.11*ashCrease;
      vec2 entry=entryRelief(ashWorld.xz)*(1.-ashPhase);
      vec3 facet=inverseTransformDirection(normal,viewMatrix);
      float facing=smoothstep(-.40,.81,dot(facet,normalize(vec3(.78,.36,-.31))));
      float grit=ashNoise(ashWorld.xz*6.8)+.35*ashNoise(ashWorld.xz*19.);
      float lee=(1.-facing)*entry.y+.72*entry.x;
      float gateApron=smoothstep(-61.,-37.,ashWorld.z)*(1.-smoothstep(2.,10.,ashWorld.z))*
        (1.-smoothstep(9.,22.,abs(ashWorld.x+2.)))*(1.-ashPhase);
      outgoingLight*=mix(1.,.77+.20*facing,gateApron);
      outgoingLight*=1.-.61*min(1.,lee);
      float localGlint=smoothstep(.38,.88,grit)*smoothstep(.05,.75,facing);
      outgoingLight+=entry.y*localGlint*vec3(.15,.135,.108);
      outgoingLight+=vec3(.101,.087,.058)*entry.y*facing*(.48+.78*grit);
      #include <opaque_fragment>`);
    shader.fragmentShader=shadeAshShadow(shader.fragmentShader);
  };
  material.customProgramCacheKey=()=>key+'-'+kind+'-v13';
  material.needsUpdate=true;
  return material;
}
// Displaced floor.  `terrain` gives the playable macro shape; heaped remains
// add a pillowed swell so the piles have a real profile against the mist.
export function createAshFloor(terrain,{size=180,step=.4}={}){
  const cells=Math.round(size/step),geometry=new T.PlaneGeometry(size,size,cells,cells);geometry.rotateX(-Math.PI/2);
  const p=geometry.attributes.position,cover=new Float32Array(p.count),rocky=new Float32Array(p.count),n1=lattice(5519),n2=lattice(977),n3=lattice(31873);
  const smooth=T.MathUtils.smoothstep,clamp=T.MathUtils.clamp;
  const channel=new Float32Array(p.count);
  const laneAt=(x,z)=>(1-smooth(Math.abs(x-2.55*Math.sin(z*.095)),1.3,4.2))*smooth(z,-52,-40)*(1-smooth(z,2,7));
  // Remains: absent from the open fighting ground, patchy across the middle distance, continuous at the rim.
  const coverAt=(x,z)=>{
    const broad=n1(x*.055+40,z*.055+40)*.62+n2(x*.13+9,z*.13+17)*.38;
    const bank=Math.sin(x*.31+z*.19+1.7*Math.sin(z*.14)+1.2*n3(x*.31,z*.31));
    const lane=laneAt(x,z);
    const inner=smooth(bank,-.30,.75)*smooth(broad,.20,.65)*(.75-.28*lane);
    const seam=Math.abs(Math.sin(.26*z-.16*x+2.6*n2(x*.088+7,z*.088+9)));
    const crossing=(1-smooth(seam,.10,.45))*smooth(broad,.27,.54)*.57;
    return (1-.81*entryBed(x,z))*Math.max(inner,crossing,clamp(smooth(broad*.60+.60*smooth(Math.hypot(x,z+20),21,42)-.42*lane,.50,.74),0,1));
  };
  // Rock and slab debris: irregular patches several metres across.
  const rockAt=(x,z,cover=coverAt(x,z))=>{
    const patch=n2(x*.105+70,z*.105+13)*.66+n3(x*.29+5,z*.29+31)*.34;
    const buried=smooth(cover,.23,.78);
    return smooth(patch,.39,.70)*(1-.54*laneAt(x,z))*(1-.74*buried);
  };
  const swell=(x,z,c)=>{
    const a=Math.abs(2*n3(x*.50+3,z*.50+8)-1),b=Math.abs(2*n2(x*1.35+21,z*1.35+5)-1);
    const drift=n2(x*.22+23,z*.33+6);
    const fold=Math.sin(x*1.25+z*.69+3.2*n3(x*.23,z*.31));
    const lip=Math.exp(-10*fold*fold);
    const hollow=.06*(1-smooth(b,.12,.55));
    return c*(.08+.20*drift+.17*Math.pow(a,.85)+.068*b+.13*lip-hollow)+(1-c)*(.032*drift+.018*b);
  };
  const heightAt=(x,z)=>terrain(x,z)+swell(x,z,coverAt(x,z))*(1-.82*westAshChannel(x,z));
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),c=coverAt(x,z);cover[i]=c;rocky[i]=rockAt(x,z,c);
    channel[i]=westAshChannel(x,z);
    p.setY(i,terrain(x,z)+swell(x,z,c)*(1-.82*channel[i]));
  }
  geometry.setAttribute('ashChannel',new T.BufferAttribute(channel,1));
  geometry.setAttribute('ashCover',new T.BufferAttribute(cover,1));geometry.setAttribute('ashRock',new T.BufferAttribute(rocky,1));geometry.computeVertexNormals();
  // Cloth contacts the rendered triangle, including where a narrow ridge falls
  // between two terrain samples. Keep the analytic sampler for simulation.
  const cellScale=cells/size,rowWidth=cells+1;
  function surfaceHeightAt(x,z) {
    const gx=(x+size*.5)*cellScale,gz=(z+size*.5)*cellScale;
    if(gx<0||gz<0||gx>cells||gz>cells)return heightAt(x,z);
    const col=Math.min(Math.floor(gx),cells-1),row=Math.min(Math.floor(gz),cells-1);
    const u=gx-col,v=gz-row,lower=u+v<=1;
    const mask=geometry.userData.terraceTriangles;
    if(mask&&!mask[2*(row*cells+col)+(lower?0:1)])return heightAt(x,z);
    const i=row*rowWidth+col,heights=p.array;
    const b=heights[(i+rowWidth)*3+1],d=heights[(i+1)*3+1];
    if(lower)return (1-u-v)*heights[i*3+1]+u*d+v*b;
    return (u+v-1)*heights[(i+rowWidth+1)*3+1]+(1-u)*b+(1-v)*d;
  }
  function maxSurfaceHeight(x,z,radius) {
    const x0=Math.floor((x-radius+size*.5)*cellScale),z0=Math.floor((z-radius+size*.5)*cellScale);
    const x1=Math.floor((x+radius+size*.5)*cellScale),z1=Math.floor((z+radius+size*.5)*cellScale);
    if(x0<0||z0<0||x1>=cells||z1>=cells)return Infinity;
    let maximum=-Infinity;
    const mask=geometry.userData.terraceTriangles;
    for(let row=z0;row<=z1;row++)for(let col=x0;col<=x1;col++){
      const triangle=2*(row*cells+col);
      if(mask&&(!mask[triangle]||!mask[triangle+1]))return Infinity;
    }
    // Barycentric interpolation stays within the heights of the three vertices.
    for(let row=z0;row<=z1+1;row++)for(let col=x0;col<=x1+1;col++){
      maximum=Math.max(maximum,p.array[3*(row*rowWidth+col)+1]);
    }
    return maximum+1e-8;
  }
  return {geometry,coverAt,rockAt,heightAt,surfaceHeightAt,maxSurfaceHeight};
}
// One irregular slab: a bevelled polygonal plate with flat facets (no underside).
function slabGeometry(rnd,split){
  const n=7+Math.floor(rnd()*5),start=rnd()*6.283,rim=[],shoulder=[],top=[];
  const cx=(rnd()-.5)*.32,cz=(rnd()-.5)*.24,slope=.1+.45*rnd();
  for(let k=0;k<n;k++){
    const a=start+(k+(rnd()-.5)*.57)/n*6.283,r=.5*(.64+.36*rnd()),inset=.73+.21*rnd();
    const x=Math.cos(a)*r,z=Math.sin(a)*r,h=.49+x*slope-.23*rnd();
    rim.push([x,-1.3,z]);shoulder.push([x*(.94+.05*rnd()),h-.26-.32*rnd(),z*.98]);
    top.push([x*inset+cx*(1-inset),h,z*inset+cz*(1-inset)]);
  }
  const crown=.52+.16*rnd(),positions=[],colors=[];
  const outline=top.map((p,i)=>[p,shoulder[i],rim[i]]);
  const seam=p=>p[0][0]+.47*p[0][2]-.09*cx;
  function fragment(side){
    if(!side)return outline;
    const ring=[];
    for(let i=0;i<n;i++){
      const a=outline[i],b=outline[(i+1)%n],da=side*seam(a)-.017,db=side*seam(b)-.017;
      if(da>=0)ring.push(a);
      if((da>=0)!==(db>=0)){
        const t=da/(da-db);
        // The break goes through the full thickness, cutting the exposed lip
        // and the buried back together. Neither front spans the open crack.
        const x=a[0][0]+(b[0][0]-a[0][0])*t,z=a[0][2]+(b[0][2]-a[0][2])*t;
        ring.push(a.map((p,layer)=>[x,p[1]+(b[layer][1]-p[1])*t,z]));
      }
    }
    return ring;
  }
  function face(a,b,c,shade){
    positions.push(...a,...b,...c);
    for(let i=0;i<3;i++)colors.push(shade,shade,shade);
  }
  for(const side of split?[-1,1]:[0]){
    const ring=fragment(side);
    if(ring.length<3)continue;
    const x=ring.reduce((s,p)=>s+p[0][0],0)/ring.length,z=ring.reduce((s,p)=>s+p[0][2],0)/ring.length;
    const centre=[x,crown+x*slope+(side<0?-.12:0),z];
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      const breakFace=side!==0&&Math.abs(side*seam(a)-.017)<1e-6&&Math.abs(side*seam(b)-.017)<1e-6;
      face(centre,b[0],a[0],1);
      face(a[0],b[0],b[1],breakFace?.49:.78);face(a[0],b[1],a[1],breakFace?.49:.78);
      face(a[1],b[1],b[2],.39);face(a[1],b[2],a[2],.39);
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  return geometry;
}
// Loose slabs and shards lying half-buried in the rocky ground.
export function createDebris({heightAt,rockAt,flashCenter,flashPower,light,count=2400,allow=null}){
  const rnd=lcg(7741),group=new T.Group(),dummy=new T.Object3D(),shapes=11,per=Math.ceil(count/shapes);group.name='slab-debris';
  const material=ashSurfaceMaterial(new T.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0,vertexColors:true}),{flashCenter,flashPower,light,mode:'slab',key:'ash-debris'});
  for(let s=0;s<shapes;s++){
    const mesh=new T.InstancedMesh(slabGeometry(rnd,s%2===0),material,per);let placed=0,guard=0;
    while(placed<per&&guard++<per*60){
      const a=rnd()*6.283,r=Math.sqrt(rnd())*62,x=Math.sin(a)*r,z=Math.cos(a)*r-20;
      if(z>1.5&&Math.abs(x)<7.5)continue;
      if(allow&&!allow(x,z))continue;
      const presence=rockAt(x,z);if(rnd()>presence*.92+.012)continue;
      const long=rnd()<.085,length=long?.44+rnd()*.86:.09+rnd()*rnd()*.96,width=long?.12+rnd()*.14:length*(.40+.44*rnd()),thick=.016+rnd()*.045+length*.034;
      const embedded=.29+.62*rnd()+.24*(1-presence);
      dummy.position.set(x,heightAt(x,z)+thick*(.5-embedded),z);
      dummy.rotation.set((rnd()-.5)*.20,rnd()*6.283,(rnd()-.5)*.20,'YXZ');
      dummy.scale.set(length,thick,width);dummy.updateMatrix();mesh.setMatrixAt(placed,dummy.matrix);
      mesh.setColorAt(placed,new T.Color().setScalar(.34+rnd()*.34));placed++;
    }
    mesh.count=placed;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);
  }
  return group;
}
