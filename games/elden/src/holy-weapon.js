import * as T from "game/lib/three.module.js";
import {consortBladeOutline} from "game/src/consort-arms.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";

// Measure the fitted blade in its grip's frame. Both sword meshes share the
// spell, but the fire must sit on the actual steel even if their fitting changes.
function bladeSections(weapon){
  const count=20,boxes=Array.from({length:count},()=>new T.Box3());
  const {model,pivot,length}=weapon,span=length*.81,point=new T.Vector3();
  pivot.updateWorldMatrix(true,true);const inverse=pivot.matrixWorld.clone().invert();
  model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name==='consort-blade-gilt'||mesh.name==='consort-blade-grip')return;
    const transform=inverse.clone().multiply(mesh.matrixWorld),pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      point.fromBufferAttribute(pos,i).applyMatrix4(transform);
      if(point.y<0||point.y>span+.04)continue;
      boxes[Math.min(count-1,Math.floor(point.y/span*count))].expandByPoint(point);
    }
  });
  return boxes.map((b,i)=>{
    if(b.isEmpty())b=boxes.reduce((best,next,j)=>!next.isEmpty()&&Math.abs(i-j)<best.distance?{box:next,distance:Math.abs(i-j)}:best,{box:b,distance:Infinity}).box;
    const center=b.isEmpty()?new T.Vector3():b.getCenter(new T.Vector3());
    center.y=(i+.5)*span/count;
    const size=b.isEmpty()?new T.Vector3(.11,0,.08):b.getSize(new T.Vector3());
    return {center,size};
  });
}

export function mountGreatbladeQuillons(weapon){
  const sections=weapon.bladeSections=bladeSections(weapon),base=sections[1].center;
  if(weapon.model.userData.consortBlade){
    // The regular cross sections describe finite strips. The final attachment
    // for a flash, wake or camera sample belongs at the upswept steel point.
    const span=weapon.length*.81;
    sections.at(-1).center.set(consortBladeOutline(1)[0]*span,span,0);
    return;
  }
  const surfaces=[];
  // Raised, hooked goldwork around the existing guard catches light in
  // separate ridges. The recesses still show its underlying dark iron.
  for(const side of [-1,1])for(let leaf=0;leaf<3;leaf++){
    const face=(leaf-1)*.10,extent=.94-.12*leaf;
    const profile=[[.045,.018,0],[.16,.11,.035],[.29,.13,.07],[.41,.025,.11],[.35,-.095,.11],[.25,-.06,.075]];
    const curve=new T.CatmullRomCurve3(profile.map(([x,y,z])=>new T.Vector3(base.x+side*x*extent,base.y+y+leaf*.045,base.z+face+z*(1-leaf))));
    const g=new T.TubeGeometry(curve,16,.068,8,false),pos=g.attributes.position,colors=[];
    for(let ring=0;ring<=16;ring++){
      const t=ring/16,center=curve.getPointAt(t),taper=.23+.77*(1-t*t);
      for(let k=0;k<=8;k++){
        const j=ring*9+k,flute=.78+.22*Math.cos(k*Math.PI*.5+ring*.12);
        const point=new T.Vector3().fromBufferAttribute(pos,j).sub(center).multiplyScalar(taper*flute).add(center);
        pos.setXYZ(j,point.x,point.y,point.z);
        const patina=.58+.40*flute-.12*leaf+.09*Math.sin(k+ring*.61);
        colors.push(patina,.79*patina,.40*patina);
      }
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();surfaces.push(g);
  }
  const guard=new T.Mesh(mergeGeometries(surfaces),new T.MeshStandardMaterial({vertexColors:true,color:0xe3cf89,metalness:.86,roughness:.34}));
  for(const surface of surfaces)surface.dispose();
  guard.name='engraved-greatblade-quillons';guard.castShadow=guard.receiveShadow=true;weapon.pivot.add(guard);
}

// Thin moving arcs follow the outer half of the real curved blade. They keep
// the direction of the cut after the hand changes course or stops.
export function createHolySwordWake(weapon){
  const count=24,steps=3,lanes=[.50,.69,.84,.96,.89],stride=lanes.length*2;
  const samples=Array.from({length:count},()=>({time:0,life:0,power:0,axis:new T.Vector3(),edge:lanes.map(()=>new T.Vector3())}));
  let head=0,used=0;
  const rings=(count-1)*steps+1;
  const g=new T.BufferGeometry(),vertices=new T.Float32BufferAttribute(rings*stride*3,3);
  const shades=new T.Float32BufferAttribute(vertices.count*3,3),contours=new T.Float32BufferAttribute(vertices.count*4,4);
  const indices=[];
  for(let ring=0;ring<rings-1;ring++)for(let lane=0;lane<lanes.length;lane++){
    const a=ring*stride+lane*2,b=a+stride;indices.push(a,a+1,b,b,a+1,b+1);
  }
  g.setIndex(indices);
  vertices.setUsage(T.DynamicDrawUsage);shades.setUsage(T.DynamicDrawUsage);contours.setUsage(T.DynamicDrawUsage);
  g.setAttribute('position',vertices);g.setAttribute('color',shades);g.setAttribute('wakeContour',contours);g.setDrawRange(0,0);
  const m=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,forceSinglePass:true,transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending});
  const clock={value:0};
  m.onBeforeCompile=shader=>{
    shader.uniforms.wakeClock=clock;
    shader.vertexShader='attribute vec4 wakeContour;varying vec4 wakeUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwakeUV=wakeContour;');
    shader.fragmentShader='uniform float wakeClock;varying vec4 wakeUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat age=max(0.,wakeClock-wakeUV.z)*wakeUV.w;diffuseColor.a*=(1.-smoothstep(0.,1.,age))*pow(max(0.,1.-abs(wakeUV.x)),1.35)*(.70+.30*sin(wakeUV.y*78.+wakeUV.x*4.));');
  };
  m.customProgramCacheKey=()=> 'greatblade-curved-wake';
  const trail=new T.Mesh(g,m);trail.visible=false;trail.frustumCulled=false;
  const points=lanes.map(along=>{
    if(weapon.model.userData.consortBlade){
      const [back,width]=consortBladeOutline(along),span=weapon.length*.81;
      return new T.Vector3((back-width*.98)*span,along*span,0);
    }
    const s=weapon.bladeSections[Math.min(19,Math.floor(along*20))];
    return s.center.clone().add(new T.Vector3(s.size.x*.30,0,s.size.z*.10));
  });
  const measured=lanes.map(()=>new T.Vector3());
  const axis=new T.Vector3(),aTangent=new T.Vector3(),bTangent=new T.Vector3(),p=new T.Vector3();
  const at=index=>samples[(head+index)%count];
  trail.userData.update=(time,power,blood,move)=>{
    const paired=move==='promised',life=paired?.175:.33;
    let changed=false;
    clock.value=time;
    if(used&&time<at(used-1).time){used=0;changed=true;}
    while(used&&time-at(0).time>at(0).life){head=(head+1)%count;used--;changed=true;}
    if(power>.08){
      weapon.pivot.updateWorldMatrix(true,false);
      for(let k=0;k<lanes.length;k++)measured[k].copy(points[k]).applyMatrix4(weapon.pivot.matrixWorld);
      const old=used?at(used-1):null;
      const delta=old?measured[3].distanceToSquared(old.edge[3]):0;
      if(!old||time-old.time>=.015&&delta>.0025){
        // A reposition between attacks must not leave a line from the old pose.
        // Measure the allowed travel in world space to include the actor's scale.
        const span=measured[3].distanceTo(measured[0])/.46;
        if(old&&(time-old.time>.15||delta>(span*Math.min(1.65,.30+22*(time-old.time)))**2))used=0;
        if(used===count){head=(head+1)%count;used--;}
        const sample=samples[(head+used++)%count];
        sample.time=time;sample.life=life;sample.power=power;sample.axis.subVectors(measured[3],measured[0]).normalize();
        for(let k=0;k<lanes.length;k++)sample.edge[k].copy(measured[k]);
        changed=true;
      }
    }
    trail.visible=used>1;if(!trail.visible||!changed)return;
    // Fit a time-parametrized cubic through the sampled cutting edge. The
    // limited tangents keep a sudden reversal close to the actual blade path.
    for(let i=0;i<used-1;i++){
      const a=at(i),b=at(i+1),prior=at(Math.max(0,i-1)),after=at(Math.min(used-1,i+2));
      const dt=b.time-a.time;
      for(let k=0;k<lanes.length;k++){
        const start=a.edge[k],end=b.edge[k],distance=start.distanceTo(end);
        aTangent.subVectors(end,prior.edge[k]).multiplyScalar(dt/(b.time-prior.time)).clampLength(0,distance);
        bTangent.subVectors(after.edge[k],start).multiplyScalar(dt/(after.time-a.time)).clampLength(0,distance);
        for(let j=i===0?0:1;j<=steps;j++){
          const f=j/steps,f2=f*f,f3=f2*f;
          p.copy(start).multiplyScalar(2*f3-3*f2+1).addScaledVector(aTangent,f3-2*f2+f)
            .addScaledVector(end,3*f2-2*f3).addScaledVector(bTangent,f3-f2);
          axis.lerpVectors(a.axis,b.axis,f).normalize();
          const birth=a.time+dt*f,shimmer=.74+.26*Math.sin(birth*31+k*2.1);
          const width=(k===4?.23:.020+.012*(k%3))*shimmer,light=T.MathUtils.lerp(a.power,b.power,f)*shimmer*(k===4?.42:.85+k*.13);
          const lifetime=T.MathUtils.lerp(a.life,b.life,f);
          for(let side=0;side<2;side++){
            const sign=2*side-1,n=(i*steps+j)*stride+k*2+side;
            vertices.setXYZ(n,p.x+sign*width*axis.x,p.y+sign*width*axis.y,p.z+sign*width*axis.z);
            contours.setXYZW(n,sign,birth+k*.17,birth,1/lifetime);
            shades.setXYZ(n,2.8*light,(blood?.63:2.03)*light,(blood?.11:.87)*light);
          }
        }
      }
    }
    const ringsUsed=(used-1)*steps+1;
    for(const attr of [vertices,shades,contours]){
      attr.clearUpdateRanges();attr.addUpdateRange(0,ringsUsed*stride*attr.itemSize);attr.needsUpdate=true;
    }
    g.setDrawRange(0,(ringsUsed-1)*lanes.length*6);
  };
  return trail;
}

export function holyBladeEdge(weapon){
  const group=new T.Group(),sections=weapon.bladeSections;
  group.name='greatblade-sanctified-fire';group.visible=false;
  group.userData.tip=sections.at(-1).center.clone();
  const clock={value:0},strength={value:0},gripCast={value:0},crimson={value:0};
  const vertices=[],uv=[],seeds=[],along=[],indices=[];
  for(let i=0;i<86;i++){
    const f=i<24?.035+.24*((i*13)%23)/23:.10+.85*((i*31)%61)/61;
    const s=sections[Math.min(sections.length-1,Math.floor(f*sections.length))];
    const x=s.center.x+Math.sin(i*2.4)*s.size.x*.36,z=s.center.z+Math.cos(i*2.4)*s.size.z*.47;
    const n=vertices.length/3;
    for(const [u,v] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      vertices.push(x,s.center.y,z);uv.push(u,v);seeds.push(i*.819);along.push(f);
    }
    indices.push(n,n+1,n+2,n+2,n+1,n+3);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('phase',new T.Float32BufferAttribute(seeds,1));g.setAttribute('along',new T.Float32BufferAttribute(along,1));g.setIndex(indices);
  const uniforms={clock,strength,gripCast,crimson};
  if(weapon.model.userData.consortBlade){
    const span=weapon.length*.81,positions=[],coords=[],tri=[];
    // Follow the steel's actual bevel, fuller and spine on each face. A single
    // overlay carries the two bright rims around a darker, reflective middle.
    const profile=[[1.025,.0012],[1,.0012],[.86,.016],[.79,.024],[.48,.030],[.39,.021],[.30,.034],[.24,.046],[.07,.046],[0,.030]];
    for(const face of [-1,1]){
      const start=positions.length/3;
      for(let i=0;i<=64;i++){
        const f=1-Math.pow(1-i/64,1.45),[back,width]=consortBladeOutline(f);
        for(const [inset,depth] of profile){
          positions.push(back*span-inset*Math.max(.0008,width)*span,f*span,face*(depth*(1-.62*f)+.002));
          coords.push(f,1-inset);
        }
        if(i<64)for(let j=0;j<profile.length-1;j++){
          const a=start+i*profile.length+j,b=a+profile.length;tri.push(a,b,a+1,a+1,b,b+1);
        }
      }
    }
    const bevel=new T.BufferGeometry();bevel.setIndex(tri);
    bevel.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    bevel.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
    const enamel=new T.ShaderMaterial({uniforms,transparent:true,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,blending:T.AdditiveBlending,
      vertexShader:`varying vec2 edgeUv;void main(){edgeUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float clock,strength,crimson;varying vec2 edgeUv;
        void main(){
          float crossBlade=edgeUv.y,travel=clock*7.-edgeUv.x*22.;
          float whiteEdge=1.-smoothstep(.018,.16,max(0.,crossBlade));
          float spine=.58*smoothstep(.79,.99,crossBlade);
          float filament=sin(travel+sin(17.*edgeUv.x+travel*.41))*.5+.5;
          float warmBand=.29*(1.-smoothstep(.10,.66,crossBlade))+.055*filament;
          float trim=max(whiteEdge,spine)*(.85+.15*filament);
          vec3 light=mix(vec3(2.3,1.12,.28),vec3(3.8,3.46,2.36),trim);
          light=mix(light,vec3(2.7,.52,.12),crimson);
          gl_FragColor=vec4(light,strength*min(1.,trim+warmBand)*smoothstep(0.,.025,edgeUv.x));
        }`});
    const edge=new T.Mesh(bevel,enamel);edge.name='consecrated-cutting-edge';group.add(edge);
  }
  const fire=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,
    vertexShader:`uniform float clock,gripCast;attribute float phase,along;varying vec2 q;varying float seed,life,feed;
      void main(){
        q=uv;seed=phase;life=fract(clock*(.96+.25*sin(phase))+phase);
        feed=mix(.84+.16*sin(phase),1.-.80*smoothstep(.27,.97,along),gripCast);
        vec4 p=modelViewMatrix*vec4(position,1.);
        vec3 rise=(viewMatrix*vec4(0.,1.,0.,0.)).xyz;
        vec3 crosswind=(modelViewMatrix*vec4(cos(phase),.5,sin(phase),0.)).xyz;
        p.xyz+=life*(rise*(.09+.40*life)+crosswind*.21);
        float width=(.15+.19*feed+.16*life)*(.83+.21*sin(phase*4.));
        vec2 bladeAxis=(modelViewMatrix*vec4(0.,1.,0.,0.)).xy;
        bladeAxis/=max(.001,length(bladeAxis));
        vec2 crossBlade=vec2(-bladeAxis.y,bladeAxis.x);
        p.xy+=width*(bladeAxis*uv.x*(1.02+.48*life)+crossBlade*uv.y*(.49+.29*life));
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`uniform float strength,clock,crimson;varying vec2 q;varying float seed,life,feed;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.545);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1)),f.x),f.y);}
      void main(){
        vec2 v=q*2.1+vec2(seed,-clock*1.8);
        float n=.54*noise(v)+.30*noise(v*2.4+seed)+.16*noise(v*5.9);
        float r=length(q+vec2(.20*sin(q.y*3.+seed+clock*2.),0.));
        float density=smoothstep(.28,.70,n-.18*r)*(1.-smoothstep(.56,1.07,r));
        float curl=1.-smoothstep(.018,.10,abs(n-.57-.07*sin(q.y*5.+seed)));
        float edge=curl*smoothstep(.02,.31,r);
        vec3 tint=mix(vec3(1.19,.83,.29),vec3(2.27,1.96,1.13),edge);
        tint=mix(tint,vec3(2.24,.19+.56*edge,.045),crimson);
        gl_FragColor=vec4(tint,strength*feed*density*sin(3.14159*life)*(.12+.70*edge));
      }`});
  const plume=new T.Mesh(g,fire);plume.frustumCulled=false;group.add(plume);
  const threads=[],threadUv=[],threadPhases=[],triangles=[];
  for(let strand=0;strand<8;strand++)for(let k=0;k<=20;k++){
    const t=k/20,phase=strand*2.39996,along=.02+t*(.23+strand%7*.069);
    const section=sections[Math.min(19,Math.floor(along*20))];
    const angle=phase+t*(4.2+.28*(strand%5)),radius=.014+.047*Math.sin(Math.PI*t);
    const x=section.center.x+Math.cos(angle)*(section.size.x*.38+radius);
    const z=section.center.z+Math.sin(angle)*(section.size.z*.45+radius);
    const n=threads.length/3;
    for(const side of [-1,1]){
      threads.push(x,along*weapon.length*.81,z);threadUv.push(t,side);threadPhases.push(phase);
    }
    if(k<20)triangles.push(n,n+1,n+2,n+2,n+1,n+3);
  }
  const threadGeo=new T.BufferGeometry();threadGeo.setIndex(triangles);
  threadGeo.setAttribute('position',new T.Float32BufferAttribute(threads,3));threadGeo.setAttribute('uv',new T.Float32BufferAttribute(threadUv,2));threadGeo.setAttribute('phase',new T.Float32BufferAttribute(threadPhases,1));
  const threadMat=new T.ShaderMaterial({uniforms,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,transparent:true,blending:T.AdditiveBlending,
    vertexShader:`uniform float clock;attribute float phase;varying vec2 q;varying float pulse;
      void main(){q=uv;float wave=sin(clock*8.+phase+q.x*9.);pulse=.48+.52*wave;
        vec3 p=position;p.x+=wave*q.x*.055;p.z+=cos(clock*6.+phase+q.x*13.)*q.x*.072;
        vec4 v=modelViewMatrix*vec4(p,1.);vec2 axis=(modelViewMatrix*vec4(0.,1.,0.,0.)).xy;
        v.xy+=vec2(-axis.y,axis.x)/max(.001,length(axis))*q.y*(.008+.016*pulse);
        gl_Position=projectionMatrix*v;}`,
    fragmentShader:`uniform float strength,crimson;varying vec2 q;varying float pulse;
      void main(){float a=(1.-abs(q.y))*smoothstep(.05,.75,pulse)*(1.-smoothstep(.70,1.,q.x));
        gl_FragColor=vec4(mix(vec3(2.6,1.90,.73),vec3(2.8,.54,.09),crimson),a*strength*.33);}`});
  const curls=new T.Mesh(threadGeo,threadMat);curls.frustumCulled=false;group.add(curls);
  const spots=[],ph=[],fractions=[];
  for(let i=0;i<230;i++){
    const f=Math.pow((i*71%229)/229,1.55),s=sections[Math.min(19,Math.floor(f*20))];
    spots.push(s.center.x+Math.cos(i)*s.size.x*.44,s.center.y,s.center.z+Math.sin(i)*s.size.z*.44);
    ph.push(i*.913);fractions.push(f);
  }
  const grains=new T.BufferGeometry();grains.setAttribute('position',new T.Float32BufferAttribute(spots,3));grains.setAttribute('phase',new T.Float32BufferAttribute(ph,1));grains.setAttribute('along',new T.Float32BufferAttribute(fractions,1));
  const sparks=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`attribute float phase,along;uniform float clock,gripCast;varying float amplitude;
      void main(){float f=fract(phase+clock*(.82+.37*sin(phase)));vec3 p=position;
        p+=vec3(cos(phase)*.83,.45+.46*sin(phase*3.),sin(phase)*.79)*f;
        vec4 v=modelViewMatrix*vec4(p,1.);v.xyz+=(viewMatrix*vec4(0.,1.,0.,0.)).xyz*f*f*.65;
        amplitude=sin(f*3.14159)*mix(1.,1.-.88*smoothstep(.30,.97,along),gripCast);
        gl_Position=projectionMatrix*v;gl_PointSize=clamp((10.+20.*fract(phase*7.))/max(.1,-v.z),.9,3.8);
      }`,fragmentShader:`uniform float strength,crimson;varying float amplitude;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(mix(vec3(2.8,2.3,1.38),vec3(2.7,.64,.15),crimson),strength*amplitude*max(0.,1.-r*r));}`});
  const points=new T.Points(grains,sparks);points.frustumCulled=false;group.add(points);
  // The finishing paired cut expels a fan of light along each blade. Build it in the
  // weapon frame so the fan turns and foreshortens with its hilt, including during recovery.
  const fanVerts=[],fanUv=[],fanSeed=[],fanIndex=[],span=weapon.length*.81;
  const fanPower={value:0};
  for(let strand=0;strand<44;strand++){
    const seed=strand*2.39996,root=.04+.48*((strand*13)%43)/43;
    const end=.73+.57*((strand*23)%43)/43;
    for(let j=0;j<=24;j++){
      const t=j/24,along=root+(end-root)*t,f=Math.min(along,.99);
      const [back,width]=consortBladeOutline(f);
      const lane=Math.sin(seed)*.060+Math.cos(seed)*.21*t*t;
      for(const side of [-1,1]){
        fanVerts.push((back-width*.73)*span+lane,along*span,
          .045*Math.sin(seed*1.83)+t*t*.24*Math.sin(seed*1.21));
        fanUv.push(t,side);fanSeed.push(seed);
      }
      if(j<24){const k=fanSeed.length-2;fanIndex.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
  }
  const fanGeo=new T.BufferGeometry();fanGeo.setIndex(fanIndex);
  fanGeo.setAttribute('position',new T.Float32BufferAttribute(fanVerts,3));
  fanGeo.setAttribute('uv',new T.Float32BufferAttribute(fanUv,2));
  fanGeo.setAttribute('seed',new T.Float32BufferAttribute(fanSeed,1));
  const fanMat=new T.ShaderMaterial({uniforms:{clock,fanPower},transparent:true,depthWrite:false,
    blending:T.AdditiveBlending,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:`attribute float seed;uniform float clock;varying vec2 q;varying float pulse;
      void main(){
        q=uv;float age=fract(clock*(.76+.20*sin(seed))+seed);
        float w=sin(3.14159*q.x),s=sin(seed*19.1);
        vec3 local=position;
        local.y+=.59*age*q.x;
        vec4 v=modelViewMatrix*vec4(local,1.);
        vec2 axis=(modelViewMatrix*vec4(0.,1.,0.,0.)).xy;
        vec2 normal=vec2(-axis.y,axis.x)/max(.001,length(axis));
        v.xyz+=(viewMatrix*vec4(0.,1.,0.,0.)).xyz*q.x*(.08+.72*age+.41*s);
        v.xy+=normal*(w*.102*sin(q.x*9.+seed+age*6.28)+q.y*(.011+.062*(.5+.5*s))*w);
        pulse=.32+.68*sin(age*3.14159);
        gl_Position=projectionMatrix*v;}`,
    fragmentShader:`uniform float fanPower;varying vec2 q;varying float pulse;
      void main(){float flank=1.-abs(q.y);float opacity=fanPower*pulse*flank*
        smoothstep(.0,.13,q.x)*(1.-smoothstep(.71,1.,q.x));
        float lobe=.60+.40*sin(q.x*18.-pulse*4.+q.y*1.8);
        gl_FragColor=vec4(mix(vec3(2.4,1.38,.36),vec3(4.3,3.68,2.11),flank*flank),opacity*lobe);}`});
  const fan=new T.Mesh(fanGeo,fanMat);fan.name='paired-cut-gold-discharge';fan.visible=false;group.add(fan);
  const offset=weapon.side==='Right'?.18:.67;
  group.userData.ignite=(time,power,blood,charging,release=0)=>{
    fanPower.value=release*power*1.22;fan.visible=fanPower.value>.008;
    clock.value=time+offset;
    strength.value=power*(charging?.72+.18*Math.sin(time*7.2+offset*8.)+.09*Math.sin(time*12.3+offset*5.):1);
    crimson.value=Number(blood);gripCast.value=Number(charging);
  };
  return group;
}
