import * as T from "game/lib/three.module.js";

// Presentation for the gravity volley (primary clip 9.7-15.6 s / 129.9-137.5 s):
// white dust torn up by the dragged blades, dark chips thrown along the retreat,
// dark stones with a violet corona and smoke, and the violet-white burst, forks,
// chunks and pale dust of every landing. No hit volume or timing lives here.
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const smooth=T.MathUtils.smoothstep;

export function dressGravityRock(group,texture,index){
  const core=group.children[0];
  if(core?.material?.isMeshStandardMaterial){
    // The suspended stones stay dark against the bright sky at 25-30 m.
    // Grey where a broken face catches the light (source 134.94 s), not an even violet-black.
    core.material.fog=false;core.material.color.setRGB(.77,.72,.77);
    core.material.emissive.setHex(0x171319);core.material.emissiveIntensity=.24;core.material.needsUpdate=true;
  }
  const uniforms={time:{value:0},power:{value:1},size:{value:2.4},seed:{value:index*1.7+.3}};
  const halo=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`uniform float size;varying vec2 q;
      void main(){q=position.xy;vec4 eye=modelViewMatrix*vec4(0.,0.,0.,1.);eye.xy+=position.xy*size;gl_Position=projectionMatrix*eye;}`,
    fragmentShader:`uniform float time,power,seed;varying vec2 q;
      float hash(vec2 p){
        vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
        h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);
      }
      float noise(vec2 p){
        vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(cell),hash(cell+vec2(1.,0.)),f.x),
                   mix(hash(cell+vec2(0.,1.)),hash(cell+vec2(1.)),f.x),f.y);
      }
      void main(){
        float r=length(q);vec2 n=q/max(r,.001);
        // Two scales of advected noise break each plume into a bright curled lip and a diffuse wake.
        vec2 drift=vec2(seed+time*.29,-seed-time*.44);
        float body=noise(n*2.6+drift);
        float grit=noise(q*16.+drift*2.+body*2.);
        float reach=.29+.16*body+.08*grit;
        float offset=r-reach;
        float breaks=smoothstep(.38,.77,body+.34*(grit-.5));
        float lip=exp(-abs(offset+.048*(grit-.5))*42.);
        float smoke=exp(-abs(offset-.04)*13.)*(.22+.78*grit);
        float energy=breaks*(lip*.38+smoke*.42)*smoothstep(.25,.37,r)*(1.-smoothstep(.62,.87,r));
        vec3 c=mix(vec3(.65,.22,.98),vec3(1.15,.70,1.42),lip*breaks);
        gl_FragColor=vec4(c,energy*power);}`}));
  halo.frustumCulled=false;halo.renderOrder=3;group.add(halo);
  const smoke=new T.Sprite(new T.SpriteMaterial({map:texture,color:0x15101b,transparent:true,opacity:0,depthWrite:false}));
  smoke.position.set(.4*Math.sin(index*2.1),-.25,.4*Math.cos(index*2.1));smoke.renderOrder=1;group.add(smoke);
  // The stones tear individual streaks on takeoff. Sample the actual preceding
  // positions so both casts leave the tail on the trailing side of their arc.
  const wakeUniforms={
    tip:{value:new T.Vector3()},tail:{value:new T.Vector3()},
    power:{value:0},time:{value:0},seed:{value:index*2.39996},firstLift:{value:0}
  };
  const wake=new T.Mesh(new T.PlaneGeometry(1,1,24,1),new T.ShaderMaterial({
    uniforms:wakeUniforms,side:T.DoubleSide,forceSinglePass:true,transparent:true,
    depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`uniform vec3 tip,tail;uniform float time,seed,firstLift;varying vec2 q;
      void main(){float u=uv.x;q=vec2(u,uv.y*2.-1.);
        vec3 axis=tip-tail;float span=max(.001,length(axis));
        vec3 p=mix(tail,tip,u);
        vec3 side=cross(axis/span,normalize(cameraPosition-p));side/=max(.001,length(side));
        float grain=sin(u*27.+seed+floor(time*24.)*.82)+.43*sin(u*63.+seed*2.);
        float halfWidth=mix(.11+.49*u,.13+.84*smoothstep(0.,.64,u),firstLift);
        p+=side*(grain*.075*sin(u*3.14159)+q.y*halfWidth);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`varying vec2 q;uniform float time,power,seed,firstLift;
      void main(){float y=abs(q.y);
        float kink=.19*sin(q.x*24.+seed+floor(time*27.)*.58)+.075*sin(q.x*51.+seed);
        float core=exp(-pow((q.y-kink)*5.2,2.));
        float fork=exp(-pow((q.y+kink-.39*sin(q.x*3.14159))*9.,2.));
        float joint=core+.58*fork;
        float fray=.59+.41*sin(q.x*31.+seed+floor(time*26.)*1.13);
        float fade=smoothstep(0.,.25,q.x)*(1.-smoothstep(.91,1.,q.x));
        vec3 color=mix(vec3(.90,.14,1.62),vec3(2.95,2.03,3.05),clamp(joint,0.,1.));
        float opacity=(1.-y*y)*(.32+1.16*joint)*(.65+.35*fray);
        if(firstLift>.5){
          float body=exp(-pow((q.y-kink)*2.15,2.));
          float grain=.5+.5*sin(q.x*41.+q.y*9.+seed+time*32.);
          float split=exp(-pow((q.y+.42-kink*.55)*8.,2.));
          float hot=clamp(core+.52*fork+.23*split,0.,1.);
          color=mix(vec3(.70,.14,1.04),vec3(1.84,1.28,1.86),hot);
          opacity=(.51*body+hot)*(.71+.29*grain)*(1.-y*y);
        }
        gl_FragColor=vec4(color,power*fade*opacity);}`
  }));
  wake.frustumCulled=false;wake.visible=false;wake.renderOrder=4;group.add(wake);
  const history=Array.from({length:64},()=>new T.Vector3());
  group.userData.dress={halo,smoke,uniforms,core,baseEmission:core.material.emissive.clone().multiplyScalar(core.material.emissiveIntensity),wake,wakeUniforms,history,sampleTimes:new Float64Array(history.length),head:0,count:0,lastTime:-1};
}

export function updateRockDress(group,projectile,time,castAge,formation,liftAge,firstPhase=false){
  const d=group.userData.dress;if(!d)return;
  if(time-d.lastTime>(firstPhase?.26:.15)||time<d.lastTime){d.head=0;d.count=0;}
  if(time!==d.lastTime){
    d.history[d.head].copy(projectile.pos);d.sampleTimes[d.head]=time;d.head=(d.head+1)%d.history.length;
    d.count=Math.min(d.history.length,d.count+1);d.lastTime=time;
  }
  const age=castAge-liftAge;
  const strength=projectile.launched?0:firstPhase?smooth(age,-.03,.055)*(1-smooth(age,.29,.55)):smooth(age,-.04,.09)*(1-smooth(age,.39,.66));
  d.wake.visible=strength>.001&&d.count>1;
  if(d.wake.visible){
    const u=d.wakeUniforms;
    const count=firstPhase?d.count:Math.min(12,d.count);
    const length=d.history.length,oldest=(d.head-count+length)%length;
    u.tip.value.copy(projectile.pos);u.tail.value.copy(d.history[oldest]);
    if(firstPhase){
      // At 10.57â€“10.85 s, a separate plume streams back from each rising stone.
      // Follow its actual displacement over the same interval at any render cadence.
      const targetTime=time-.22;
      for(let offset=1;offset<count;offset++){
        const newer=(d.head-offset+length)%length,older=(newer-1+length)%length;
        if(d.sampleTimes[older]>targetTime)continue;
        const f=(targetTime-d.sampleTimes[older])/(d.sampleTimes[newer]-d.sampleTimes[older]);
        u.tail.value.lerpVectors(d.history[older],d.history[newer],f);break;
      }
    }
    const span=u.tail.value.distanceTo(u.tip.value);
    u.firstLift.value=firstPhase?1:0;
    u.power.value=strength*(firstPhase?smooth(span,.10,1.25):smooth(span,.18,2.5));
    u.time.value=time;
  }
  const f=projectile.launched?T.MathUtils.clamp(projectile.age/Math.max(.001,projectile.flight),0,1):0;
  // The source stones swell as they close: about 3 m across beside the player.
  const scale=projectile.launched?1.12+.62*smooth(f,0,.8):Math.max(.001,formation);
  group.scale.setScalar(scale);
  d.uniforms.time.value=time;
  d.uniforms.size.value=2.35*scale*(1+.045*Math.sin(time*9+projectile.i*1.3));
  const eruption=formation*(1.-smooth(castAge,3.25,4.5));
  // The opening cast silhouettes against bright cloud. Pale mineral faces
  // and violet light reflected from the shell remain visible within the rim.
  const suspension=firstPhase&&!projectile.launched?formation:0;
  const reflected=suspension*(.84+.16*Math.sin(time*4.8+projectile.i*2.4));
  d.core.material.emissive.setRGB(d.baseEmission.r+.070*reflected,d.baseEmission.g+.042*reflected,d.baseEmission.b+.10*reflected);
  d.core.material.emissiveIntensity=1;
  const approach=projectile.launched?smooth(f,.05,.77):0;
  const accent=1.+.18*Math.sin(projectile.i*2.399+time*3.6);
  group.userData.lightningEnergy.value=accent*(.81+1.24*eruption+1.42*approach);
  d.uniforms.power.value=accent*(projectile.launched?.49+.72*approach:.22+.58*eruption+.42*suspension);
  if(group.userData.aura)group.userData.aura.material.opacity*=.40;
  const haze=projectile.launched?.40*(1-smooth(f,.70,1)):formation*(1-.62*smooth(castAge,3.25,4.9));
  d.smoke.visible=haze>.01;
  if(d.smoke.visible){d.smoke.material.opacity=(firstPhase?.53:.85)*haze;d.smoke.material.rotation=.26*Math.sin(time*1.4+projectile.i);d.smoke.scale.setScalar((3.8+2.8*smooth(castAge,2.3,4.6))/scale);}
}

export function createScrapeDust(texture){
  const group=new T.Group();group.name='gravity-scrape-dust';
  const N=180,clock={value:0};
  const quad=new T.PlaneGeometry(1,1),geometry=new T.InstancedBufferGeometry();
  geometry.index=quad.index;geometry.setAttribute('position',quad.attributes.position);geometry.setAttribute('uv',quad.attributes.uv);
  const origin=new T.InstancedBufferAttribute(new Float32Array(N*3),3),motion=new T.InstancedBufferAttribute(new Float32Array(N*3),3);
  const born=new T.InstancedBufferAttribute(new Float32Array(N*2).fill(-99),2);
  for(const a of [origin,motion,born])a.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('origin',origin);geometry.setAttribute('motion',motion);geometry.setAttribute('born',born);geometry.instanceCount=N;
  const playerFocus={value:new T.Vector3()};
  const material=new T.ShaderMaterial({uniforms:{clock,playerFocus,map:{value:texture}},transparent:true,depthWrite:false,
    vertexShader:`uniform float clock;uniform vec3 playerFocus;attribute vec3 origin,motion;attribute vec2 born;varying vec2 q;varying float age,kind;varying vec3 eyePoint;varying vec3 eyeFocus;
      void main(){q=uv;age=clock-born.x;kind=born.y;float live=step(0.,age)*step(age,2.6);
        vec3 p=origin+motion*(1.-exp(-age*2.4))/2.4+vec3(0.,.30*age+.18,0.);
        vec4 eye=modelViewMatrix*vec4(p,1.);
        float size=(.52+1.87*(1.-exp(-age*1.7)))*(.72+.56*fract(kind*7.31))*(1.+.74*step(1.,kind))*live;
        eye.xy+=position.xy*size;eyePoint=eye.xyz;eyeFocus=(viewMatrix*vec4(playerFocus,1.)).xyz;gl_Position=projectionMatrix*eye;}`,
    fragmentShader:`uniform sampler2D map;varying vec2 q;varying float age,kind;varying vec3 eyePoint;varying vec3 eyeFocus;
      float h(vec2 p){return fract(sin(dot(p,vec2(57.37,19.73)))*31621.13);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 uv=q*vec2(4.5,5.6)+vec2(kind*47.,-age*.82);
        float grain=.51*n(uv)+.31*n(uv*2.1)+.18*n(uv*5.6);
        float a=texture2D(map,q).a*smoothstep(.24,.63,grain)*(1.-smoothstep(.36,.56,length(q-.5)));
        float fade=smoothstep(0.,.07,age)*(1.-smoothstep(.36,1.02,age));
        vec3 dust=mix(vec3(.31,.277,.252),vec3(.55,.50,.53),fract(kind*3.7));
        vec3 c=mix(dust,vec3(.88,.56,1.13),.70*exp(-age*5.5));
        c=mix(c,mix(vec3(1.5,.65,1.83),vec3(.075,.054,.081),smoothstep(.04,.38,age)),step(1.,kind));
        float cooled=step(2.,kind);
        c=mix(c,mix(vec3(.52,.43,.38),vec3(.095,.082,.073),smoothstep(.03,.30,age)),cooled);
        float relativeDepth=eyePoint.z/min(-.02,eyeFocus.z);
        float offset=length(eyePoint.xy/max(.06,relativeDepth)-eyeFocus.xy);
        float inFront=(1.-smoothstep(.88,1.08,relativeDepth))*(1.-smoothstep(.50,1.22,offset));
        gl_FragColor=vec4(c,a*fade*mix(.48,.77,step(1.,kind))*(1.-.52*cooled)*(1.-.92*inFront));}`});
  const puffs=new T.Mesh(geometry,material);puffs.frustumCulled=false;puffs.renderOrder=2;group.add(puffs);
  const M=1850,chipGeometry=new T.BufferGeometry();
  const chipOrigin=new T.BufferAttribute(new Float32Array(M*3),3),chipMotion=new T.BufferAttribute(new Float32Array(M*3),3),chipBorn=new T.BufferAttribute(new Float32Array(M*2).fill(-99),2);
  for(const a of [chipOrigin,chipMotion,chipBorn])a.setUsage(T.DynamicDrawUsage);
  chipGeometry.setAttribute('position',chipOrigin);chipGeometry.setAttribute('motion',chipMotion);chipGeometry.setAttribute('born',chipBorn);
  const chips=new T.Points(chipGeometry,new T.ShaderMaterial({uniforms:{clock},transparent:true,depthWrite:false,
    vertexShader:`uniform float clock;attribute vec3 motion;attribute vec2 born;varying float fade;
      void main(){float t=clock-born.x;float live=step(0.,t)*step(t,2.9);
        vec3 p=position+motion*t+vec3(0.,-4.6*t*t,0.);p.y=max(p.y,position.y-min(15.,.05+14.*clamp((position.y-1.)/9.,0.,1.)));
        vec4 eye=modelViewMatrix*vec4(p,1.);fade=live*(1.-smoothstep(.65,1.65,t));
        gl_Position=projectionMatrix*eye;gl_PointSize=live*clamp((25.+77.*pow(fract(born.y*5.3),2.))/max(.5,-eye.z),1.2,13.);}`,
    fragmentShader:`varying float fade;void main(){vec2 d=gl_PointCoord-.5;float r=max(abs(d.x)*1.25,abs(d.y)+.35*d.x);
      if(r>.42)discard;gl_FragColor=vec4(.067,.057,.043,.94*fade);}`}));
  chips.frustumCulled=false;chips.renderOrder=2;group.add(chips);
  let next=0,nextChip=0,serial=0,lastPuff=-Infinity,lastChip=-Infinity;
  group.userData.update=(time,focus)=>{
    clock.value=time;playerFocus.value.copy(focus);
    puffs.visible=time<=lastPuff+2.6;chips.visible=time<=lastChip+2.9;
  };
  group.userData.puff=(point,velocity,time,burst=0,spent=false)=>{
    lastPuff=time;puffs.visible=true;
    const i=next;next=(next+1)%N;serial++;
    origin.setXYZ(i,point.x+(hash(serial*3.1)-.5)*.9,point.y,point.z+(hash(serial*5.7)-.5)*.9);
    motion.setXYZ(i,velocity.x+(hash(serial*1.3)-.5)*3.4,velocity.y+hash(serial*2.9)*1.6,velocity.z+(hash(serial*4.1)-.5)*3.4);
    born.setXY(i,time,hash(serial*9.7)+(spent?2:burst>.15?1:0));origin.needsUpdate=motion.needsUpdate=born.needsUpdate=true;
  };
  group.userData.chips=(point,velocity,count,time,burst=0)=>{
    lastChip=time;chips.visible=true;
    for(let k=0;k<count;k++){
      const i=nextChip;nextChip=(nextChip+1)%M;serial++;
      chipOrigin.setXYZ(i,point.x+(hash(serial*3.3)-.5)*2.6,point.y+.1,point.z+(hash(serial*6.1)-.5)*2.6);
      const lift=2.2+hash(serial*2.3)*9.6+burst*4,spread=2.4+burst*6;
      chipMotion.setXYZ(i,velocity.x*(.35+hash(serial*1.9)*.9)+(hash(serial*4.7)-.5)*spread,lift,velocity.z*(.35+hash(serial*8.3)*.9)+(hash(serial*7.9)-.5)*spread);
      chipBorn.setXY(i,time,hash(serial*5.1));
    }
    chipOrigin.needsUpdate=chipMotion.needsUpdate=chipBorn.needsUpdate=true;
  };
  return group;
}

const bursts=[],eye=new T.Vector3(),tmpA=new T.Vector3(),tmpB=new T.Vector3(),side=new T.Vector3(),transform=new T.Object3D();
function groundLeader(out,parent,f,seed,stepId) {
  const a=seed*.9+parent*2.39996,reach=1.25+2.2*hash(seed*3+parent);
  const noise=(hash(parent*31+Math.round(f*7)*7+stepId*5)-.5)*Math.sin(f*Math.PI);
  const offset=.44*Math.sin(5*f+parent)*f+.31*noise;
  return out.set(Math.sin(a)*reach*f+Math.cos(a)*offset,
    .22+(.30+.72*hash(parent*3+seed))*Math.sin(f*Math.PI)+.22*noise,
    Math.cos(a)*reach*f-Math.sin(a)*offset);
}
function createRockBurst(index,texture){
  const group=new T.Group();group.name='gravity-rock-burst';
  const flash=new T.Sprite(new T.SpriteMaterial({map:texture,color:0xd6b4ff,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false}));
  flash.position.y=.8;group.add(flash);
  const core=new T.Sprite(new T.SpriteMaterial({map:texture,color:0xffffff,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false}));
  core.position.y=.6;group.add(core);
  const dust=[];
  for(let i=0;i<11;i++){
    const s=new T.Sprite(new T.SpriteMaterial({map:texture,color:i%3?0x8e8a86:0x7d7684,transparent:true,opacity:0,depthWrite:false}));
    const a=index*1.3+i*2.39996,speed=2.2+hash(index*13+i)*3.4;
    s.userData={dir:new T.Vector3(Math.sin(a),0,Math.cos(a)),speed,rise:.5+hash(index*7+i*3)*1.1,size:1.5+hash(index*5+i)*1.6};
    group.add(s);dust.push(s);
  }
  const forks=7,segments=7,ribbon=new T.BufferGeometry();
  const vertices=new T.BufferAttribute(new Float32Array(forks*segments*4*3),3),edge=[],indices=[];
  vertices.setUsage(T.DynamicDrawUsage);
  for(let k=0;k<forks*segments;k++){const n=k*4;edge.push(-1,1,-1,1);indices.push(n,n+1,n+2,n+2,n+1,n+3);}
  ribbon.setAttribute('position',vertices);ribbon.setAttribute('edge',new T.Float32BufferAttribute(edge,1));ribbon.setIndex(indices);
  const power={value:1};
  const lightning=new T.Mesh(ribbon,new T.ShaderMaterial({uniforms:{power},transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
    vertexShader:`attribute float edge;varying float e;void main(){e=edge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float power;varying float e;void main(){float c=1.-abs(e);gl_FragColor=vec4(mix(vec3(.62,.24,1.5),vec3(2.4,2.0,2.9),pow(c,3.)),c*power);}`}));
  lightning.frustumCulled=false;group.add(lightning);
  const count=32,fragment=new T.IcosahedronGeometry(1,1),vertices3=fragment.attributes.position,tones=[];
  for(let j=0;j<vertices3.count;j++){
    const x=vertices3.getX(j),y=vertices3.getY(j),z=vertices3.getZ(j);
    const bedding=Math.sin(9.2*x+6.7*y-4.8*z+index),crust=Math.cos(5.1*z+2.7*y+index*.3);
    const edge=.80+.16*bedding+.14*crust;
    vertices3.setXYZ(j,(x+.15*y)*edge,y*(.61+.23*crust)*edge,z*edge);
    const tint=.25+.33*Math.max(0,bedding)+.13*crust;tones.push(tint*.90,tint*.80,tint*.94);
  }
  fragment.setAttribute('color',new T.Float32BufferAttribute(tones,3));fragment.computeVertexNormals();
  const chunks=new T.InstancedMesh(fragment,new T.MeshStandardMaterial({vertexColors:true,roughness:.94,flatShading:true}),count);
  chunks.instanceMatrix.setUsage(T.DynamicDrawUsage);chunks.frustumCulled=false;group.add(chunks);
  return {group,flash,core,dust,lightning,vertices,power,chunks,count,forks,segments,index,age:0};
}

const impactPools=new WeakMap();
// Keep each numbered stone's authored fragments and uploaded buffers between volleys.
export function prepareRockBursts(scene,count,texture){
  const slots=Array.from({length:count},(_,index)=>createRockBurst(index,texture));
  impactPools.set(scene,{texture,slots});
  for(const slot of slots)scene.add(slot.group);
  return ()=>{for(const slot of slots)slot.group.removeFromParent();};
}
export function spawnRockBurst(scene,point,index,texture){
  const pool=impactPools.get(scene),slot=pool?.texture===texture?pool.slots[index]:null;
  const burst=slot&&!slot.group.parent?slot:createRockBurst(index,texture);
  burst.age=0;burst.group.position.copy(point);scene.add(burst.group);bursts.push(burst);
}
function releaseBurst(burst){
  const pooled=impactPools.get(burst.group.parent)?.slots[burst.index]===burst;
  burst.group.removeFromParent();
  if(!pooled)burst.group.traverse(o=>{if(!o.isSprite)o.geometry?.dispose?.();if(o.isInstancedMesh)o.dispose();o.material?.dispose?.();});
}

function updateBurst(b,camera){
  const t=b.age;
  b.flash.material.opacity=.50*Math.max(0,1-t/.30);b.flash.scale.setScalar(2.6+t*9);
  b.core.material.opacity=.50*Math.max(0,1-t/.12);b.core.scale.setScalar(1.4+t*5);
  for(const s of b.dust){
    const u=s.userData,travel=u.speed*(1-Math.exp(-t*2.2))/2.2;
    s.position.set(u.dir.x*travel,.35+u.rise*t*.55,u.dir.z*travel);
    s.scale.setScalar(u.size*(1+2.1*(1-Math.exp(-t*1.6))));
    const cameraDistance=eye.copy(b.group.position).add(s.position).distanceTo(camera.position);
    s.material.opacity=.32*smooth(t,0,.09)*(1-smooth(t,.33,.99))*smooth(cameraDistance,.45,5.3);
  }
  const strength=smooth(t,0,.026)*(1-smooth(t,.12,.34));
  b.lightning.visible=strength>.01;b.power.value=strength;
  if(b.lightning.visible){
    eye.copy(camera.position);b.group.worldToLocal(eye);
    const stepId=Math.floor(t*22);let n=0;
    for(let k=0;k<b.forks;k++){
      const child=k>=3,parent=child?(k-3)%3:k;
      const start=child?(k===6?4:2)/b.segments:0;
      const a=b.index*.9+parent*2.39996+(k%2?1:-1)*(.92+.45*hash(k+b.index));
      groundLeader(tmpA,parent,start,b.index,stepId);
      for(let j=1;j<=b.segments;j++){
        const f=j/b.segments;
        groundLeader(tmpB,parent,child?start:f,b.index,stepId);
        if(child){
          const lateral=(hash(k*21+j*7+stepId)-.5)*.26*Math.sin(Math.PI*f);
          const run=f*(.62+.88*hash(k+b.index));
          tmpB.x+=Math.sin(a)*run+Math.cos(a)*lateral;
          tmpB.y+=.33*Math.sin(f*Math.PI)-.16*f;
          tmpB.z+=Math.cos(a)*run-Math.sin(a)*lateral;
        }
        side.copy(tmpB).sub(tmpA).cross(transform.position.copy(eye).sub(tmpA)).normalize().multiplyScalar((child?.021:.044)*(1-.72*f));
        b.vertices.setXYZ(n++,tmpA.x-side.x,tmpA.y-side.y,tmpA.z-side.z);b.vertices.setXYZ(n++,tmpA.x+side.x,tmpA.y+side.y,tmpA.z+side.z);
        b.vertices.setXYZ(n++,tmpB.x-side.x,tmpB.y-side.y,tmpB.z-side.z);b.vertices.setXYZ(n++,tmpB.x+side.x,tmpB.y+side.y,tmpB.z+side.z);
        tmpA.copy(tmpB);
      }
    }
    b.vertices.needsUpdate=true;
  }
  for(let i=0;i<b.count;i++){
    const a=b.index*2.1+i*2.39996,out=2.4+hash(b.index*11+i)*5.2,up=3.6+hash(b.index*5+i*3)*6.2,size=.09+hash(b.index*3+i*7)*.22;
    const y=.4+up*t-7.2*t*t;
    transform.position.set(Math.sin(a)*out*t,Math.max(.05,y),Math.cos(a)*out*t);
    transform.rotation.set(a+t*(3+i%5),t*5+i,i*.3-t*4);
    const cameraRange=eye.copy(b.group.position).add(transform.position).distanceTo(camera.position);
    const shrink=size*(i%9===0?.97:.62)*(1-smooth(t,.43,.93))*(y<.05?.49:1)*Math.min(1,cameraRange*.22);
    transform.scale.set(shrink*.85,shrink*.45,shrink*1.12);transform.updateMatrix();b.chunks.setMatrixAt(i,transform.matrix);
  }
  transform.position.set(0,0,0);transform.rotation.set(0,0,0);transform.scale.set(1,1,1);
  b.chunks.instanceMatrix.needsUpdate=true;
}

export function tickVolleyFx(dt,camera){
  for(let i=bursts.length-1;i>=0;i--){
    const b=bursts[i];b.age+=dt;
    if(b.age>1.75){
      releaseBurst(b);
      bursts.splice(i,1);continue;
    }
    updateBurst(b,camera);
  }
}
export function clearVolleyFx(){for(const b of bursts)releaseBurst(b);bursts.length=0;}
