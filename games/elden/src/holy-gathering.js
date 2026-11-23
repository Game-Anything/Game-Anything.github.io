import * as T from "game/lib/three.module.js";

// The oblique withdrawal ignites around the raised shoulders before the
// body travels. Ragged layers rotate with the caster, then collapse at
// the destination; the separate wake retains the path already travelled.
export function createRetreatMantle(){
  const group=new T.Group();group.name='retreat-shoulder-radiance';
  const positions=[],coords=[],seeds=[],indices=[];
  for(let j=0;j<45;j++)for(let k=0;k<=16;k++){
    const f=k/16,seed=j*2.399963,angle=seed+f*(1.30+(j%4)*.27),r=.46+f*(1.75+(j%5)*.18);
    const rise=.13+(j%4)*.17+f*(.76+(j%5)*.22),n=positions.length/3;
    for(const side of [-1,1]){
      const w=side*(.11+.28*Math.sin(Math.PI*f))*(1-.80*f);
      positions.push(Math.cos(angle)*r,rise+w,Math.sin(angle)*r);
      coords.push(f,side);seeds.push(seed);
    }
    if(k<16)indices.push(n,n+1,n+2,n+2,n+1,n+3);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(coords,2));geo.setAttribute('phase',new T.Float32BufferAttribute(seeds,1));geo.setIndex(indices);
  const material=new T.ShaderMaterial({uniforms:{age:{value:0},power:{value:0}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:`uniform float age;attribute float phase;varying vec2 q;varying float seed;void main(){q=uv;seed=phase;
      vec3 p=position;p.x+=.22*q.x*sin(phase+age*5.+q.x*7.);p.z+=.17*q.x*cos(phase-age*4.+q.x*5.);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float age,power;varying vec2 q;varying float seed;
      void main(){float wave=.5+.5*sin(seed+q.x*15.-age*15.+sin(q.x*37.-age*4.));
        float edge=pow(max(0.,1.-abs(q.y)),1.6);float broken=.20+.80*smoothstep(.19,.78,wave);
        gl_FragColor=vec4(mix(vec3(1.8,1.29,.57),vec3(2.95,2.53,1.56),wave),edge*broken*(1.-q.x)*power);}`});
  const surface=new T.Mesh(geo,material);group.add(surface);
  const light=new T.PointLight(0xffe7b0,0,18,2);group.add(light);
  group.userData.show=(boss,age,power)=>{
    surface.visible=power>.001;light.intensity=power*174;
    if(!surface.visible)return;
    const hand=boss.hand('Right'),chest=boss.capeMount?.chest;if(!hand||!chest)return;
    chest.getWorldPosition(group.position);group.position.lerp(hand.getWorldPosition(light.position),.36);
    group.rotation.y=boss.root.rotation.y+boss.visual.rotation.y;light.position.set(0,.22,0);
    material.uniforms.age.value=age;material.uniforms.power.value=power;
  };
  return group;
}

// White knots of light gather at the palms before the embrace. The same
// strands cover a larger volume around the paired blades before the retreat.
export function createHolyGathering(texture,seed=0,atHilt=false) {
  const group=new T.Group();
  group.visible=false;
  const positions=[],colors=[],phases=[];
  for(let i=0;i<38;i++){
    const angle=i*2.39996+seed,height=(i*7%17)/17-.50;
    const reach=.35+(i*11%23)/23*.65;
    for(let j=0;j<10;j++)for(const u of [j/10,(j+1)/10]){
      const a=angle+u*(i%2?.62:-.56)+.14*Math.sin(u*8+i);
      const r=.08+u*reach;
      positions.push(Math.cos(a)*r,height*(.2+u)+.16*Math.sin(i+u*5),Math.sin(a)*r);
      phases.push(i*.71+u*.95);
      const v=(1-u)*.8+.12;colors.push(v*1.8,v*1.22,v*.58);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geo.setAttribute('phase',new T.Float32BufferAttribute(phases,1));
  const material=new T.ShaderMaterial({
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,vertexColors:true,
    uniforms:{clock:{value:0},intensity:{value:0}},
    vertexShader:`attribute float phase;uniform float clock;varying vec3 light;
      void main(){vec3 p=position;float wave=sin(clock*8.+phase);
        p.y+=.035*wave;p.xz*=.96+.04*sin(clock*4.+phase);
        light=color*(.26+.74*pow(.5+.5*wave,4.));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader:`varying vec3 light;uniform float intensity;
      void main(){gl_FragColor=vec4(light,intensity);}`,
  });
  group.add(new T.LineSegments(geo,material));
  const knot=new T.Sprite(new T.SpriteMaterial({map:texture,color:new T.Color(2.45,1.91,1.05),
    transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  knot.scale.set(atHilt?.43:.83,atHilt?.24:.88,1);group.add(knot);
  const sparkGeo=new T.BufferGeometry(),sparkPos=[],sparkColors=[],sparkCycle=[];
  for(let i=0;i<82;i++){
    const a=i*2.39996+seed,r=.16+(i*37%83)/83*.92;
    sparkPos.push(Math.cos(a)*r,(i*11%79)/79*1.25-.43,Math.sin(a)*r);
    const v=.22+(i%7)/7;sparkColors.push(v*2.0,v*1.48,v*.58);
    sparkCycle.push((i*47%83)/83,(i*19%79)/79);
  }
  sparkGeo.setAttribute('position',new T.Float32BufferAttribute(sparkPos,3));
  sparkGeo.setAttribute('color',new T.Float32BufferAttribute(sparkColors,3));
  sparkGeo.setAttribute('gatherCycle',new T.Float32BufferAttribute(sparkCycle,2));
  const flecks=new T.Points(sparkGeo,new T.PointsMaterial({map:texture,vertexColors:true,size:.059,
    transparent:true,depthWrite:false,blending:T.AdditiveBlending}));group.add(flecks);
  const sparkTime={value:0};
  flecks.material.onBeforeCompile=shader=>{
    shader.uniforms.gatherTime=sparkTime;
    shader.vertexShader='uniform float gatherTime;attribute vec2 gatherCycle;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      float flight=fract(gatherTime*(.65+.34*gatherCycle.y)+gatherCycle.x);
      float radius=1.-smoothstep(0.,1.,flight);
      float twist=flight*(.32+.76*gatherCycle.y);
      transformed.xz=mat2(cos(twist),sin(twist),-sin(twist),cos(twist))*position.xz*(.14+1.20*radius);
      transformed.y=position.y*(.18+radius)+.15*sin(flight*3.14159);
      // Fade at both ends so that each light can restart at its own radius.
      vColor.rgb*=smoothstep(0.,.18,flight)*(1.-smoothstep(.78,1.,flight))
        *(.58+1.25*flight);
    `);
  };
  flecks.material.customProgramCacheKey=()=>'holy-gathering-inward-glitter';
  group.userData.show=(time,intensity,size)=>{
    group.visible=intensity>.002;
    if(!group.visible)return;
    group.scale.set(size,atHilt?size*.70:size,size);
    material.uniforms.clock.value=time+seed;
    sparkTime.value=time+seed;
    material.uniforms.intensity.value=intensity;
    knot.material.opacity=intensity*(atHilt?.34:.86)*(1+.13*Math.sin(time*12+seed));
    flecks.material.opacity=intensity*(.55+.25*Math.sin(time*7+seed));
    flecks.rotation.y=time*.23+seed;
  };
  return group;
}

// Several curved tails follow the body's real retreat through space. Each
// strip expires independently after the actor has left its old position.
export function createRetreatWake(){
  const max=28,lanes=4,stride=max*2;
  const pos=new Float32Array(lanes*stride*3),color=new Float32Array(pos.length),index=[];
  for(let k=0;k<lanes;k++)for(let i=0;i<max-1;i++){
    const n=k*stride+i*2;index.push(n,n+1,n+2,n+1,n+3,n+2);
  }
  const geo=new T.BufferGeometry();geo.setIndex(index);
  const positions=new T.BufferAttribute(pos,3),colors=new T.BufferAttribute(color,3);
  positions.setUsage(T.DynamicDrawUsage);colors.setUsage(T.DynamicDrawUsage);
  geo.setAttribute('position',positions);geo.setAttribute('color',colors);
  const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,
    forceSinglePass:true,transparent:true,opacity:.76,blending:T.AdditiveBlending,depthWrite:false}));
  mesh.visible=false;mesh.frustumCulled=false;
  let samples=[],lastTime=-Infinity,previousActive=false;
  mesh.userData.update=(active,t,point,yaw)=>{
    if(active&&!previousActive){samples=[];lastTime=-Infinity;}
    previousActive=active;
    if(active&&t-lastTime>=.029){samples.push({x:point.x,y:point.y,z:point.z,t,yaw});lastTime=t;}
    while(samples.length>max||samples.length&&t-samples[0].t>.67)samples.shift();
    mesh.visible=samples.length>1;if(!mesh.visible)return;
    for(let k=0;k<lanes;k++)for(let i=0;i<max;i++){
      const sample=samples[Math.min(i,samples.length-1)],age=t-sample.t;
      const w=(1-T.MathUtils.smoothstep(age,.09,.67))*(.34+.66*Math.sin(i*1.76+k*.8)**2);
      const side=k%2?1:-1,r=side*(.65+(k>>1)*.45+Math.sin(sample.t*6+k)*.20);
      const x=sample.x+Math.cos(sample.yaw)*r,z=sample.z-Math.sin(sample.yaw)*r;
      const y=sample.y+1.25+(k>>1)*1.04+Math.sin(sample.t*8+k*.7)*.22;
      for(let e=0;e<2;e++){
        const n=k*stride+i*2+e;
        positions.setXYZ(n,x,y+(e-.5)*(.045+.095*w),z);
        colors.setXYZ(n,w*2.1,w*1.62,w*.68);
      }
    }
    positions.needsUpdate=true;colors.needsUpdate=true;
  };
  return mesh;
}
