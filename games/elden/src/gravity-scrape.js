import * as T from "game/lib/three.module.js";

// One ribbon per sword. Its center is sampled where the fitted blade really
// meets the uneven ash. The gouge stays put when the caster leaves the floor.
export function createBladeScrape(groundHeight,side){
  const mesh=new T.Group(),samples=[],limit=36,clock={value:0};
  mesh.name='gravity-scrape-'+side;mesh.visible=false;
  const strip=new T.BufferGeometry(),vertices=new T.Float32BufferAttribute(limit*2*3,3);
  const born=new T.Float32BufferAttribute(limit*2,1),across=[],indices=[];
  vertices.setUsage(T.DynamicDrawUsage);born.setUsage(T.DynamicDrawUsage);
  for(let i=0;i<limit;i++){
    across.push(-1,1);const n=i*2;
    if(i+1<limit)indices.push(n,n+1,n+2,n+2,n+1,n+3);
  }
  strip.setAttribute('position',vertices);strip.setAttribute('born',born);
  strip.setAttribute('across',new T.Float32BufferAttribute(across,1));strip.setIndex(indices);strip.setDrawRange(0,0);
  const material=new T.ShaderMaterial({uniforms:{clock},side:T.DoubleSide,forceSinglePass:true,depthWrite:false,transparent:true,
    vertexShader:`uniform float clock;attribute float born,across;varying float elapsed,edge;void main(){
      elapsed=max(0.,clock-born);edge=across;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,fragmentShader:`varying float elapsed,edge;void main(){
      float bank=abs(edge),life=1.-smoothstep(.72,1.60,elapsed);
      float arc=exp(-elapsed*6.7)*pow(max(0.,1.-abs(bank-.68)*3.3),2.);
      gl_FragColor=vec4(mix(vec3(.067,.046,.058),vec3(1.84,.76,2.61),arc),life*(1.-smoothstep(.75,1.,bank))*.84);
    }`});
  const groove=new T.Mesh(strip,material);groove.frustumCulled=false;mesh.add(groove);
  const chipGeometry=new T.BufferGeometry(),chipPosition=new T.Float32BufferAttribute(limit*4*3,3);
  const chipTime=new T.Float32BufferAttribute(limit*4,1),seeds=[];
  for(let i=0;i<limit*4;i++)seeds.push(i*2.39996+(side==='Right'?0:.83));
  chipPosition.setUsage(T.DynamicDrawUsage);chipTime.setUsage(T.DynamicDrawUsage);
  chipGeometry.setAttribute('position',chipPosition);chipGeometry.setAttribute('born',chipTime);
  chipGeometry.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));chipGeometry.setDrawRange(0,0);
  const chips=new T.Points(chipGeometry,new T.ShaderMaterial({uniforms:{clock},transparent:true,depthWrite:false,
    vertexShader:`uniform float clock;attribute float born,seed;varying float fade,heat;void main(){
      float t=max(0.,clock-born);heat=step(.58,fract(seed*.37));
      vec3 p=position+vec3(cos(seed)*(1.1+heat),2.1+fract(seed*3.)*2.6,sin(seed)*(1.1+heat))*t;
      p.y=max(position.y,p.y-7.4*t*t);vec4 v=modelViewMatrix*vec4(p,1.);
      fade=1.-smoothstep(.12,.55,t);gl_Position=projectionMatrix*v;
      gl_PointSize=clamp((heat>.5?12.:20.)/max(.4,-v.z),.9,5.);
    }`,fragmentShader:`varying float fade,heat;void main(){
      float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(mix(vec3(.24,.19,.17),vec3(1.77,.79,2.52),heat),fade*(1.-smoothstep(.50,1.,r)));
    }`}));
  chips.frustumCulled=false;mesh.add(chips);
  mesh.userData.lastContact=null;
  mesh.userData.update=(time,tip,drag)=>{
    clock.value=time;
    while(samples.length&&time-samples[0].t>1.60)samples.shift();
    if(drag&&tip){
      const y=groundHeight(tip.x,tip.z),last=samples.at(-1);
      if(Math.abs(tip.y-y)<.28&&(!last||time-last.t>.09||(last.p.x-tip.x)**2+(last.p.z-tip.z)**2>.014)){
        if(last&&(time-last.t>.38||last.p.distanceToSquared(tip)>4.5))samples.length=0;
        const sample={p:new T.Vector3(tip.x,y+.035,tip.z),t:time};
        samples.push(sample);if(samples.length>limit)samples.shift();mesh.userData.lastContact=sample;
      }
    }
    mesh.visible=samples.length>0;if(!mesh.visible)return;
    for(let i=0;i<samples.length;i++){
      const s=samples[i],before=samples[Math.max(0,i-1)].p,after=samples[Math.min(samples.length-1,i+1)].p;
      const dx=after.x-before.x,dz=after.z-before.z,n=Math.hypot(dx,dz)||1,width=.095+.032*Math.sin(s.t*19.);
      for(const [edge,sign] of [[0,-1],[1,1]]){
        const x=s.p.x+sign*dz/n*width,z=s.p.z-sign*dx/n*width;
        vertices.setXYZ(i*2+edge,x,groundHeight(x,z)+.045,z);born.setX(i*2+edge,s.t);
      }
      for(let j=0;j<4;j++){chipPosition.setXYZ(i*4+j,s.p.x,s.p.y,s.p.z);chipTime.setX(i*4+j,s.t);}
    }
    vertices.needsUpdate=born.needsUpdate=chipPosition.needsUpdate=chipTime.needsUpdate=true;
    strip.setDrawRange(0,Math.max(0,samples.length-1)*6);chipGeometry.setDrawRange(0,samples.length*4);
  };
  return mesh;
}
