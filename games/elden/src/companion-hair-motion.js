import * as T from "game/lib/three.module.js";
import {seatRiderCrown} from "game/src/companion-fit.js";

const stations=5;
const identity=g=>['manePhase','maneRoot'].map(k=>Array.from(g.attributes[k].array.slice(0,g.attributes[k].itemSize)).join(',')).join(':');

// The undercoat, four surface ribbons and loose fibers of one lock use the
// same simulated centerline. The authored cross-section stays intact.
// Both the live worker and the fixed-quality renderer use the same springs.
function makeGuideSolver(guides,stations,T){
  const error=new T.Vector3(),at=new T.Vector3(),parentAt=new T.Vector3(),edge=new T.Vector3();
  return function solve(matrix,dt,stepsPerSecond,reset,localLinear,data){
    const steps=Math.max(1,Math.ceil(dt*stepsPerSecond-1e-6)),h=dt/steps,scale=matrix.getMaxScaleOnAxis();
    for(const {nodes} of guides){
      for(const n of nodes)n.target.copy(n.rest).applyMatrix4(matrix);
      if(nodes[0].target.distanceToSquared(nodes[0].old)>12.25)reset=true;
      if(reset){
        for(const n of nodes){n.position.copy(n.target);n.velocity.set(0,0,0);}
      }else{
        for(let j=1;j<stations;j++)nodes[j].drag=Math.exp(-nodes[j].damping*h);
        for(let k=1;k<=steps;k++){
          const f=k/steps;
          nodes[0].position.lerpVectors(nodes[0].old,nodes[0].target,f);
          for(let j=1;j<stations;j++){
            const n=nodes[j],parent=nodes[j-1];
            at.lerpVectors(n.old,n.target,f);parentAt.lerpVectors(parent.old,parent.target,f);
            error.copy(at).sub(n.position).addScaledVector(parent.position,.46).addScaledVector(parentAt,-.46);
            n.velocity.addScaledVector(error,n.spring*h).multiplyScalar(n.drag);
            n.position.addScaledVector(n.velocity,h);
            edge.copy(n.position).sub(parent.position);
            const limit=at.distanceTo(parentAt)*1.08+.012;
            if(edge.lengthSq()>limit*limit){
              edge.normalize();n.position.copy(parent.position).addScaledVector(edge,limit);
              const outward=n.velocity.dot(edge)-parent.velocity.dot(edge);
              if(outward>0)n.velocity.addScaledVector(edge,-outward);
            }
            // A lock can trail its steeply accelerating shoulder without
            // flipping its entire authored drape across the rider's face.
            const travel=scale*n.travel;
            edge.copy(n.position).sub(at);
            if(edge.lengthSq()>travel*travel){
              edge.normalize();n.position.copy(at).addScaledVector(edge,travel);
              const outward=n.velocity.dot(edge);
              if(outward>0)n.velocity.addScaledVector(edge,-outward);
            }
          }
        }
      }
      for(const n of nodes)n.old.copy(n.target);
    }
    for(let i=0;i<guides.length;i++)for(let j=0;j<stations;j++){
      const n=guides[i].nodes[j];
      error.copy(n.position).sub(n.target).applyMatrix3(localLinear);
      error.toArray(data,(i*stations+j)*4);
    }
  };
}

function guideWorker(){
  let solve,matrix,linear,previous;
  self.onmessage=({data:job})=>{
    if(job.guides){
      const guides=job.guides.map(rows=>({nodes:rows.map(([x,y,z,spring,damping,travel])=>({
        rest:new T.Vector3(x,y,z),spring,damping,travel,old:new T.Vector3(),position:new T.Vector3(),
        target:new T.Vector3(),velocity:new T.Vector3()
      }))}));
      solve=makeGuideSolver(guides,job.stations,T);
      matrix=new T.Matrix4();linear=new T.Matrix3();
      self.postMessage({ready:true});return;
    }
    matrix.fromArray(job.matrix);linear.fromArray(job.inverse);
    const dt=previous===undefined?0:job.time-previous;
    previous=job.time;
    solve(matrix,Math.min(.2,Math.max(0,dt)),60,job.reset||dt<=0||dt>.2,linear,job.output);
    self.postMessage({output:job.output,sequence:job.sequence},[job.output.buffer]);
  };
}

// The graphics thread still attaches each lock to the current rider transform.
// Only the secondary spring offsets arrive asynchronously. Keep one solve in
// flight and always submit the newest pose when the worker becomes available.
function liveGuideSolver(guides,output,texture){
  let worker,ready=false,busy=false,sequence=0,needsReset=true,spare;
  try{
    // A double-clicked file has an opaque origin. A classic Blob worker can
    // run locally without resolving a module import from that origin.
    const math='const T={Vector3:'+T.Vector3.toString()+',Matrix3:'+T.Matrix3.toString()+',Matrix4:'+T.Matrix4.toString()+'};';
    const url=URL.createObjectURL(new Blob([math,'\n',makeGuideSolver.toString(),'\n(',guideWorker.toString(),')();'],{type:'text/javascript'}));
    try{worker=new Worker(url,{name:'radahn-hair-springs'});}finally{URL.revokeObjectURL(url);}
    const failed=e=>{console.warn('Hair dynamics fallback',e?.message||'worker unavailable');worker?.terminate();worker=null;ready=false;};
    worker.onerror=worker.onmessageerror=failed;
    worker.onmessage=({data})=>{
      if(data.ready){ready=true;return;}
      busy=false;spare=data.output;
      if(data.sequence===sequence){output.set(spare);texture.needsUpdate=true;}
    };
    worker.postMessage({stations,guides:guides.map(g=>g.nodes.map(n=>[n.rest.x,n.rest.y,n.rest.z,n.spring||0,n.damping||0,n.travel||0]))});
  }catch{worker?.terminate();worker=null;}
  return {
    reset(){sequence++;needsReset=true;},
    submit(matrix,linear,time,reset){
      if(!ready)return false;
      if(reset){sequence++;needsReset=true;output.fill(0);texture.needsUpdate=true;}
      if(!busy){
        spare??=new Float32Array(output.length);
        try{worker.postMessage({matrix:matrix.elements,inverse:linear.elements,time,reset:needsReset,sequence,output:spare},[spare.buffer]);}
        catch{worker.terminate();worker=null;ready=false;return false;}
        needsReset=false;spare=null;busy=true;
      }
      return true;
    }
  };
}

export function createCompanionHairMotion(lining,cards,fibers,live=false){
  const lookup=new Map(),guides=[];
  for(const g of lining){
    const index=guides.length,vertices=g.attributes.position,uv=g.attributes.uv;
    // The tube closes with a duplicate seam vertex. Short curls and long
    // locks can have different row counts, but each radial row shares V.
    let ring=1;
    while(ring<vertices.count && uv.getY(ring)===uv.getY(0))ring++;
    const lastRow=vertices.count/ring-1;
    const stationsForLock=Array.from({length:stations},(_,station)=>{
      const row=Math.round(lastRow*station/(stations-1));
      const rest=new T.Vector3(),v=new T.Vector3();
      for(let k=0;k<ring-1;k++)rest.add(v.fromBufferAttribute(vertices,row*ring+k));
      rest.divideScalar(ring-1);
      return {rest,old:new T.Vector3(),target:new T.Vector3(),position:new T.Vector3(),velocity:new T.Vector3(),lengthFromScalp:0};
    });
    for(let j=1;j<stations;j++){
      const a=stationsForLock[j-1],b=stationsForLock[j];
      b.lengthFromScalp=a.lengthFromScalp+b.rest.distanceTo(a.rest);
    }
    const phase=g.attributes.manePhase.getX(0);
    const length=g.attributes.maneDrop.getX(vertices.count-1);
    const middle=stationsForLock[2].rest;
    const backing=T.MathUtils.smoothstep(middle.z,.83,1.67)*(1-T.MathUtils.smoothstep(Math.abs(middle.x),.48,1.27))*T.MathUtils.smoothstep(length,1.65,3.4);
    const stiffness=(.80+.28*(.5+.5*Math.sin(phase*3.47)))*(1+.92*backing)*(length<1.5?1.9:1);
    for(let j=1;j<stations;j++){
      const node=stationsForLock[j],t=j/(stations-1);
      node.spring=(198-127*t)*stiffness;
      node.damping=2*Math.sqrt(node.spring)*(.77-.19*t);
      node.travel=node.lengthFromScalp*(.31+.27*t)*(1-.56*backing);
    }
    guides.push({nodes:stationsForLock});
    lookup.set(identity(g),index);
  }
  for(const g of [...lining,...cards,...fibers]){
    const index=lookup.get(identity(g));
    if(index===undefined)throw Error('Companion hair surface has no guide');
    const a=new Float32Array(g.attributes.position.count);a.fill((index+.5)/guides.length);
    g.setAttribute('maneGuideRow',new T.BufferAttribute(a,1));
  }
  const data=new Float32Array(stations*guides.length*4);
  const texture=new T.DataTexture(data,stations,guides.length,T.RGBAFormat,T.FloatType);
  texture.minFilter=texture.magFilter=T.NearestFilter;texture.needsUpdate=true;
  const bladeBase=[new T.Vector3(),new T.Vector3()],bladeTip=[new T.Vector3(),new T.Vector3()];
  const uniforms={maneGuideOffsets:{value:texture},maneBladeBase:{value:bladeBase},maneBladeTip:{value:bladeTip},maneBladeCount:{value:0}};
  uniforms.riderFaceCenter={value:seatRiderCrown(new T.Vector3(-.61,4.61,-.035))};
  const inverse=new T.Matrix4(),localLinear=new T.Matrix3();
  const solve=makeGuideSolver(guides,stations,T),asyncSolver=live?liveGuideSolver(guides,data,texture):null;
  let asyncActive=false;
  let lastTime,wasVisible=false,shoulders;
  const shoulderA=new T.Vector3(),shoulderB=new T.Vector3();
  uniforms.carrierShoulder={value:new T.Vector3(0,3.48,-.27)};
  uniforms.carrierWidth={value:0};
  function update(matrix,dt,time,visible,weapons=[],boss,stepsPerSecond=120){
    const justShown=visible&&!wasVisible;
    wasVisible=visible;
    if(!visible){if(asyncActive){asyncSolver.reset();asyncActive=false;}lastTime=undefined;return;}
    const gap=lastTime===undefined?Infinity:time-lastTime;
    if(dt===0&&gap===0&&!justShown)return;
    let reset=justShown||dt<=0||dt>.20||gap<0||gap>.20;
    lastTime=time;
    inverse.copy(matrix).invert();localLinear.setFromMatrix4(inverse);
    uniforms.carrierWidth.value=0;
    if(boss?.bones){
      shoulders??=Object.values(boss.bones).filter(b=>/(Left|Right)Arm$/.test(b.name));
      if(shoulders.length===2){
        shoulders[0].getWorldPosition(shoulderA).applyMatrix4(inverse);
        shoulders[1].getWorldPosition(shoulderB).applyMatrix4(inverse);
        const middle=uniforms.carrierShoulder.value.copy(shoulderA).lerp(shoulderB,.5);
        if(middle.distanceTo(uniforms.riderFaceCenter.value)<3.5)
          uniforms.carrierWidth.value=Math.max(.56,Math.abs(shoulderA.x-shoulderB.x)*.5);
      }
    }
    uniforms.maneBladeCount.value=0;
    for(const weapon of weapons){
      const slot=uniforms.maneBladeCount.value;
      if(slot>=2||!weapon.pivot.visible||!weapon.bladeSections?.length)continue;
      weapon.pivot.updateWorldMatrix(true,false);
      const fit=(out,section)=>out.copy(section.center).applyMatrix4(weapon.pivot.matrixWorld).applyMatrix4(inverse);
      fit(bladeBase[slot],weapon.bladeSections[0]);fit(bladeTip[slot],weapon.bladeSections.at(-1));
      uniforms.maneBladeCount.value++;
    }
    if(asyncSolver&&stepsPerSecond===60&&asyncSolver.submit(matrix,localLinear,time,reset)){
      asyncActive=true;return;
    }
    if(asyncActive){asyncSolver.reset();reset=true;asyncActive=false;}
    solve(matrix,dt,stepsPerSecond,reset,localLinear,data);
    texture.needsUpdate=true;
  }
  return {uniforms,update};
}

export const hairMotionDeclarations=`
uniform sampler2D maneGuideOffsets;
uniform vec3 riderFaceCenter,carrierShoulder; uniform float carrierWidth;
uniform vec3 maneBladeBase[2],maneBladeTip[2];uniform float maneBladeCount;
attribute float maneGuideRow;
vec3 guideOffset(float along){
  float t=clamp(along,0.,1.)*4.,j=floor(t);
  vec3 a=texture2D(maneGuideOffsets,vec2((j+.5)/5.,maneGuideRow)).xyz;
  vec3 b=texture2D(maneGuideOffsets,vec2((min(j+1.,4.)+.5)/5.,maneGuideRow)).xyz;
  return mix(a,b,fract(t))*smoothstep(.015,.14,along);
}
vec3 outsideFace(vec3 p,vec3 center,vec3 radius){
  vec3 delta=(p-center)/radius;
  float r=length(delta);
  return r<1.?center+radius*delta/max(.001,r):p;
}
`;

export const hairContactShader=`
float freeContact=smoothstep(.035,.21,maneWeight);
vec3 clear=outsideFace(transformed,riderFaceCenter,vec3(.38,.42,.32));
// Guide front lengths around the temples. Radial contact alone lets a lock
// slide over the nose and diagonally across the eyes in three-quarter view.
vec2 faceForward=vec2(.47,-.883), faceRight=vec2(.883,.47);
vec3 fromFace=clear-riderFaceCenter;
float cheek=dot(fromFace.xz,faceRight),forward=dot(fromFace.xz,faceForward);
float faceHeight=smoothstep(-.43,-.22,fromFace.y)*(1.-smoothstep(.22,.40,fromFace.y));
float temple=faceHeight*smoothstep(.02,.19,forward)*(1.-smoothstep(.25,.45,abs(cheek)));
float rootSide=dot(maneRoot.xz-riderFaceCenter.xz,faceRight);
float side=abs(rootSide)>.035?sign(rootSide):sign(cheek);
clear.xz+=temple*(faceRight*(side*.42-cheek)-faceForward*min(.38,max(0.,forward)));
clear=outsideFace(clear,vec3(.0,3.79,-.42),vec3(.46,.43,.34));
// Only the posterior locks bear against the mantle. Their outside lengths
// can pass its side edge, while the central curtain cannot fall through it.
float backLock=smoothstep(.48,1.18,position.z)*(1.-smoothstep(3.85,4.45,position.y));
float insideShoulder=1.-smoothstep(1.14,1.73,abs(clear.x));
float capeBack=min(position.z-.06,.70+.46*(1.-smoothstep(.90,3.78,clear.y)));
clear.z+=max(0.,capeBack-clear.z)*backLock*insideShoulder;
for(int i=0;i<2;i++){
  if(float(i)>=maneBladeCount)break;
  vec3 line=maneBladeTip[i]-maneBladeBase[i];
  float f=clamp(dot(clear-maneBladeBase[i],line)/max(.001,dot(line,line)),0.,1.);
  vec3 center=mix(maneBladeBase[i],maneBladeTip[i],f);
  vec3 delta=clear-center;float r=length(delta),radius=.21+.23*sin(f*3.14159);
  if(r<radius)clear+=delta/max(.001,r)*(radius-r);
  // At the resting guard the curtain hangs behind the fists. Continue the
  // contact past the measured blade shoulder to include the leather grip.
  // Work in the carrier's frontal plane, independent of the viewing camera.
  float armContact=1.-smoothstep(.10,.80,maneBladeBase[i].z-carrierShoulder.z);
  armContact*=1.-smoothstep(-.22,.28,maneBladeBase[i].y-carrierShoulder.y);
  float guardT=clamp(dot(clear.xy-maneBladeBase[i].xy,line.xy)/max(.01,dot(line.xy,line.xy)),-.26,.34);
  vec3 guard=maneBladeBase[i]+line*guardT;
  float guardSide=length(clear.xy-guard.xy);
  float behindGrip=(1.-smoothstep(.37,.82,guardSide))*armContact;
  clear.z+=behindGrip*clamp(guard.z+.46-clear.z,0.,1.45);
}
// At shoulder level, the forward-facing breastplate is a one-sided
// boundary. Constrain after wind, spell and blade response in carrier space.
if(carrierWidth>.0){
  float below=1.-smoothstep(.15,.86,clear.y-carrierShoulder.y);
  float xDistance=abs(clear.x-carrierShoulder.x);
  float inside=1.-smoothstep(carrierWidth+.35,carrierWidth+.95,xDistance);
  float backSurface=carrierShoulder.z+.34+.31*(1.-smoothstep(.18,carrierWidth+.48,xDistance));
  clear.z+=max(0.,backSurface-clear.z)*below*inside;
}
transformed=mix(transformed,clear,freeContact);
`;
