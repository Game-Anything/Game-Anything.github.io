import * as T from "game/lib/three.module.js";
import {consortBladeOutline} from "game/src/consort-arms.js";
import {RUSH_SEQUENCE,ROCK_SEQUENCE} from "game/src/combat.js";

export function weaponGravity(state){
 const t=state.bossElapsed||0,s=T.MathUtils.smoothstep;
 if(state.stagger||state.critical||Number.isFinite(state.deathElapsed))return 0;
 const age=state.openingImpactAge??Infinity;
 if(age>=0&&age<1.67)return Math.max(.08,.86*(1-s(age,1.15,1.67)));
 if(state.bossAction==='rocks')return s(t,state.phase===1?1.04:.045,state.phase===1?1.32:.47)*(1-s(t+(state.phase===2?ROCK_SEQUENCE.phaseTwoLead:0),6.15,6.65));
 if(state.bossAction==='leap'&&state.openingRush)return s(t,.17,.68)*(1-s(t,RUSH_SEQUENCE.openingContact+.78,RUSH_SEQUENCE.openingDuration));
 if(state.bossAction==='leap')return s(t,.20,.65)*(1-s(t,RUSH_SEQUENCE.contact,RUSH_SEQUENCE.contact+.22));
 if(state.bossAction==='pull')return s(t,.16,.60)*(1-s(t,3.25,3.7));
 return 0;
}

export function createBladeGravity(length,hand='Right'){
 const group=new T.Group();group.name='blade-gravity-filaments';
 const seed=hand==='Left'?47:9,span=length*.81;
 const rnd=n=>{const h=Math.sin((n+seed)*127.1)*43758.5453;return h-Math.floor(h);};
 const pos=[],tangents=[],ribbons=[],indices=[];
 function strip(points,lane,width,fork){
  const first=pos.length/3;
  for(let i=0;i<points.length;i++){
   const f=i/(points.length-1),tangent=points[Math.min(i+1,points.length-1)].clone()
     .sub(points[Math.max(0,i-1)]).normalize();
   const taper=fork?1-.88*f:.22+.78*Math.pow(Math.sin(Math.PI*f),.47);
   for(const side of [-1,1]){
    pos.push(...points[i].toArray());tangents.push(...tangent.toArray());ribbons.push(side,width*taper,lane,f);
   }
   if(i+1<points.length){const n=first+i*2;indices.push(n,n+1,n+2,n+2,n+1,n+3);}
  }
 }
 // Primary 8.68 and 130.31 s: multiple short forks straddle the cutting
 // edge and blade flats, separating into wisps around the charged tip.
 for(let lane=0;lane<24;lane++){
  const key=lane*79,front=lane%2?1:-1,edge=lane%4===3?.48:lane%3===0?.06:.89;
  const start=lane===0?.01:rnd(key)*.72,end=Math.min(.999,start+.19+.46*rnd(key+1));
  const reach=.048+.21*rnd(key+2),phase=rnd(key+3)*6.28;
  const points=[];
  for(let i=0;i<=24;i++){
   const t=i/24,f=T.MathUtils.lerp(start,end,t),[back,width]=consortBladeOutline(f);
   const bend=Math.sin(Math.PI*t),wobble=.039*Math.sin(t*12+phase)+.095*(rnd(key+7+i)-.5)*bend;
   points.push(new T.Vector3((back-edge*width)*span+(edge>.5?-1:1)*reach*bend+wobble,
     f*span,front*(.047+.085*bend+.031*Math.sin(t*13+phase)+.024*rnd(key+35+i))));
  }
  strip(points,lane,(lane%5===0?.044:.022)+.019*rnd(key+5),false);
  // Diffuse violet scattering follows a few of the same discharges. The
  // translucent veil sits behind its white core, broken up along the steel.
  if(lane%3===0 || lane%4===3){
   const vapor=points.map((point,i)=>{
    const f=i/(points.length-1),wisp=Math.sin(Math.PI*f);
    return point.clone().add(new T.Vector3((edge>.5?-1:1)*wisp*(.13+.19*rnd(key+6)),
      wisp*(.09+.12*Math.sin(phase+f*7)),front*wisp*(.16+.12*Math.sin(f*5+phase))));
   });
   strip(vapor,lane+64,.19+.19*rnd(key+6),false);
  }
  for(let fork=0;fork<3;fork++){
   const root=points[3+fork*6+Math.floor(rnd(key+60+fork)*4)],out=[root];
   const advance=(fork===1?-.7:1)*(.13+.33*rnd(key+62+fork)),lift=.14+.28*rnd(key+65+fork);
   for(let i=1;i<=9;i++){
    const f=i/9;
    const kink=(rnd(key+100+fork*17+i)-.5)*.066*Math.sin(f*Math.PI);
    out.push(root.clone().add(new T.Vector3((edge>.5?-1:1)*(lift*f+kink),
     advance*f+kink*.51,front*(.14*f+.036*Math.sin(15*f+phase)))));
   }
   strip(out,lane,.013,true);
   const joint=out[4],twig=[joint];
   for(let j=1;j<=4;j++)twig.push(joint.clone().add(new T.Vector3((edge>.5?-1:1)*j*.018,
    -advance*j*.12+(rnd(key+154+j)-.5)*.037,front*j*.025)));
   strip(twig,lane,.008,true);
  }
 }
 // Isolated leaders jump away from the metal and reconnect to its edge.
 // Each pair of hands has different anchors; both still move with the blades.
 for(let i=0;i<5;i++){
  const lane=26+i,k=513+i*47,a=.07+.105*i,b=Math.min(.99,a+.31+.18*rnd(k));
  const face=i%2?1:-1,points=[];
  for(let j=0;j<=12;j++){
   const t=j/12,f=T.MathUtils.lerp(a,b,t),[back,width]=consortBladeOutline(f);
   const jump=Math.sin(t*Math.PI);
   const cross=jump*(.12+.30*rnd(k+1)+.17*(rnd(k+2+j)-.5));
   points.push(new T.Vector3((back-.88*width)*span-cross,
     f*span+.11*jump*(rnd(k+18+j)-.5),face*(.06+jump*(.30+.17*rnd(k+32+j)))));
  }
  strip(points,lane,.047+.013*rnd(k+4),false);
  for(const n of [3,7,9]){
   const fork=[points[n]],reach=.24+.18*rnd(k+n);
   for(let j=1;j<=4;j++){
    const t=j/4;
    fork.push(points[n].clone().add(new T.Vector3(-reach*t,
      span*.085*t+.12*(rnd(k+n*4+j)-.5)*t,face*.16*t)));
   }
   strip(fork,lane,.021,true);
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 geometry.setAttribute('arcTangent',new T.Float32BufferAttribute(tangents,3));
 geometry.setAttribute('ribbon',new T.Float32BufferAttribute(ribbons,4));geometry.setIndex(indices);
 const material=new T.ShaderMaterial({uniforms:{clock:{value:0},power:{value:0},handSeed:{value:seed},screenHeight:{value:720}},
  transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,
  vertexShader:`attribute vec3 arcTangent;attribute vec4 ribbon;uniform float clock,handSeed,power,screenHeight;
  varying float across,gain,veil,along;
  void main(){
   veil=step(63.5,ribbon.z);along=ribbon.w;float strand=ribbon.z-64.*veil,stepTime=clock*(11.+mod(strand,4.))+.31*strand;
   float epoch=floor(stepTime),u=smoothstep(.65,1.,fract(stepTime));
   vec3 key=position*vec3(31.,17.,29.)+strand+handSeed;
   vec3 p=position+.025*mix(sin(key.yzx+epoch*2.7),sin(key.yzx+(epoch+1.)*2.7),u);
   p+=veil*.085*sin(clock*4.1+key.yzx*.15)*sin(ribbon.w*3.14159);
   vec3 eye=(modelViewMatrix*vec4(p,1.)).xyz;
   // Smoke lifts in world space even when the wrist rolls the blade over.
   float plume=veil*sin(ribbon.w*3.14159)*smoothstep(.24,.84,power);
   eye+=(viewMatrix*vec4(0.,1.,0.,0.)).xyz*plume*(.25+.45*fract(strand*.619)+.12*sin(clock*5.+strand));
   vec3 tangent=(modelViewMatrix*vec4(arcTangent,0.)).xyz;
   vec3 side=cross(tangent,normalize(-eye));
   float pix=2.*abs(eye.z)/(projectionMatrix[1][1]*screenHeight);
   float lineWidth=max(ribbon.y*mix(.94,1.27,veil),pix*.95*smoothstep(.009,.032,ribbon.y));
   eye+=side/max(length(side),.00001)*ribbon.x*lineWidth;
   across=ribbon.x;float beat=.5+.5*sin(clock*(13.+mod(strand,3.))+strand*3.1+handSeed-4.*ribbon.w);
   // Before the charge blooms only a handful of short sparks trace the steel.
   float ignition=fract(strand*.618+handSeed*.373);
   float reach=smoothstep(.09,.52,power);
   float ribbonMask=1.-smoothstep(.045+.42*reach,.10+.60*reach,abs(ribbon.w-(.35+.29*ignition)));
   float strike=fract(sin(floor(clock*7.5+strand*.31)*29.21+strand*19.61+handSeed)*4121.53);
   float front=fract(clock*(2.6+mod(strand,3.)*.4)+ignition);
   float leader=smoothstep(-.10,.035,front-ribbon.w)*(1.-smoothstep(.08,.6,front-ribbon.w));
   gain=(.14+.60*smoothstep(.12,.88,beat)+.76*leader)*mix(.15,1.,smoothstep(.16,.54,strike))
     *mix(ribbonMask*step(ignition,.08+.70*reach),1.,reach);
   // A full charge still leaves interrupted black steel between the white
   // return strokes. Keep the families of small violet twigs on both sides.
   float gap=.5+.5*cos(ribbon.w*11.+clock*4.1+strand*1.73);
   gain*=mix(.20,1.,smoothstep(.32,.74,gap+.24*leader));
   // End-on ribbons overlap around the grip; keep their luminous core resolved.
   float projectedLength=length(normalize((modelViewMatrix*vec4(0.,1.,0.,0.)).xyz).xy);
   gain*=mix(.48,1.,smoothstep(.12,.65,projectedLength));
   if(strand>25.5){
     float fire=fract(clock*(2.6+.24*mod(strand,3.))+ignition);
     float pulse=exp(-abs(fire-.21)*13.)+.53*exp(-abs(fire-.47)*19.);
     gain=(.10+1.87*pulse)*smoothstep(.23,.82,power)*(.40+.60*smoothstep(.20,.77,gap));
   }
   gl_Position=projectionMatrix*vec4(eye,1.);
  }`,
  fragmentShader:`uniform float power,clock,opening;varying float across,gain,veil,along;
   void main(){float x=abs(across),core=exp(-26.*x*x),haze=exp(-3.9*x*x);
    vec3 rgb=mix(vec3(.39,.10,.73),vec3(2.49,1.99,2.65),core);
    float curl=across+.30*sin(along*17.-clock*3.1+1.5*sin(along*11.+clock*2.4));
    float smoke=exp(-4.3*curl*curl)*(.45+.55*pow(.5+.5*sin(along*20.-clock*5.+2.3*sin(along*13.+across*3.)),2.));
    float alpha=mix(.25*haze+1.69*core,.23*smoke,veil);
    float spark=mix(sqrt(power),power,smoothstep(.12,.48,power));
    gl_FragColor=vec4(mix(rgb,vec3(1.26,.88,1.70),veil),spark*mix(gain,.45+.62*gain,veil)*alpha*(1.-.68*opening*veil)*mix(1.,smoothstep(.14,.65,power),veil));}`});
 const filaments=new T.Mesh(geometry,material);filaments.frustumCulled=false;group.add(filaments);
 const shadowChannel=new T.ShaderMaterial({uniforms:material.uniforms,
   vertexShader:material.vertexShader.replace('ribbon.x*lineWidth','(ribbon.x*2.3+.68)*lineWidth'),
   transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
   fragmentShader:`uniform float power;varying float across,gain,veil,along;
    void main(){
      float envelope=(1.-smoothstep(.19,1.,abs(across)))*smoothstep(.13,.72,gain);
      float opacity=power*envelope*mix(.93,.33,veil);
      gl_FragColor=vec4(.013,.008,.021,opacity);
    }`});
 material.uniforms.opening={value:0};
 const shadow=new T.Mesh(geometry,shadowChannel);
 shadow.frustumCulled=false;shadow.renderOrder=1;filaments.renderOrder=2;group.add(shadow);
 const viewport=new T.Vector2();
 filaments.onBeforeRender=renderer=>{material.uniforms.screenHeight.value=renderer.getDrawingBufferSize(viewport).y;};
 group.userData.update=(time,charge,visible,opening=false)=>{
  material.uniforms.opening.value=Number(opening);
  group.visible=visible&&charge>0;material.uniforms.clock.value=time;material.uniforms.power.value=charge;
 };
 return group;
}
