import * as T from "game/lib/three.module.js";

// Primary 126.5–127.6. Dirt and sparks lift from the takeoff point, linger
// for a moment after the body has disappeared, then fall back to the arena.
export function createMeteorEjecta(origin,texture) {
  const group=new T.Group();group.position.copy(origin);group.name='meteor-takeoff-ejecta';
  const count=76,stoneGeometry=new T.IcosahedronGeometry(1,1);
  const p=stoneGeometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    p.setXYZ(i,x*(1+.23*Math.sin(y*8+z*4))+.14*y,y*(.52+.21*Math.cos(x*7)),z*(.71+.18*Math.sin(x*6)));
  }
  stoneGeometry.computeVertexNormals();
  const stones=new T.InstancedMesh(stoneGeometry,new T.MeshStandardMaterial({color:0x534a3e,roughness:.98}),count);
  stones.instanceMatrix.setUsage(T.DynamicDrawUsage);stones.frustumCulled=false;group.add(stones);
  const fragments=[];
  for(let i=0;i<count;i++){
    const az=i*2.39996,r=.22+(i*43%53)/53*2.45,spread=1.7+(i*29%53)/53*7.5;
    fragments.push({x:Math.sin(az)*r,z:Math.cos(az)*r,dx:Math.sin(az+.21)*spread,dz:Math.cos(az+.21)*spread,
      speed:7.5+(i*37%53)/53*12.0,spin:1.4+(i%6)*.75,size:i%17===0?.34+(i%3)*.13:.042+(i*11%19)/19*.19,
      delay:(i%7)*.019});
    stones.setColorAt(i,new T.Color().setScalar(.32+(i%7)*.10));
  }
  const n=2260,positions=new Float32Array(n*3),launch=new Float32Array(n*4);
  for(let i=0;i<n;i++){
    const a=i*2.399963,core=i%5<4,r=core?.10+1.33*((i*71)%1531)/1531:1.15+4.25*((i*43)%1523)/1523;
    positions.set([Math.sin(a)*r,0,Math.cos(a)*r],3*i);
    const lateral=core?.12+.83*((i*67)%1511)/1511:.7+3.45*((i*53)%1499)/1499;
    launch.set([Math.sin(a+.16)*lateral,core?11+(i*89%1511)/1511*17:5+(i*73%1511)/1511*16,
      Math.cos(a+.16)*lateral,(i*97%1531)/1531],4*i);
  }
  const sparksGeometry=new T.BufferGeometry();
  sparksGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
  sparksGeometry.setAttribute('launch',new T.BufferAttribute(launch,4));
  const sparksMaterial=new T.ShaderMaterial({
    transparent:true,blending:T.AdditiveBlending,depthWrite:false,
    uniforms:{age:{value:0},pixelScale:{value:540}},
    vertexShader:`attribute vec4 launch;uniform float age,pixelScale;varying float glow,tint;
      void main(){
        float t=max(0.,age-.24*launch.w),slow=1./(1.+.7*t);
        vec3 p=position+vec3(launch.x*t*slow,t*(launch.y-14.6*t),launch.z*t*slow);
        float phase=smoothstep(0.,.055,t)*(1.-smoothstep(.70,1.66,t))*smoothstep(0.,.35,p.y);
        tint=fract(launch.w*43.2);
        glow=phase*(.45+.55*pow(.5+.5*sin(launch.w*83.+13.*t),2.));
        vec4 v=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*v;
        gl_PointSize=clamp(pixelScale*projectionMatrix[1][1]*(.019+.061*pow(tint,3.))/max(.45,-v.z),1.,19.);
      }`,
    fragmentShader:`varying float glow,tint;void main(){
      vec2 q=gl_PointCoord*2.-1.;q.x*=1.+.65*tint;float d=dot(q,q);
      float alpha=(1.-smoothstep(.09,1.,d))*glow;
      if(alpha<.012)discard;
      gl_FragColor=vec4(mix(vec3(1.58,.82,.18),vec3(2.65,2.41,1.86),tint),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const sparks=new T.Points(sparksGeometry,sparksMaterial);
  sparks.frustumCulled=false;
  sparks.onBeforeRender=renderer=>{sparksMaterial.uniforms.pixelScale.value=renderer.domElement.height*.5;};
  group.add(sparks);
  const dustMaterial=new T.ShaderMaterial({
    uniforms:{cloudTime:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`uniform float cloudTime;varying vec2 q;varying float seed;varying float depth;
      void main(){
        q=uv;vec4 center=instanceMatrix[3];seed=center.x*2.17+center.z*.63;
        vec4 eye=modelViewMatrix*vec4(center.xyz,1.);
        float spread=length(instanceMatrix[0].xyz)*(.46+min(cloudTime,.70)*1.15);
        eye.xy+=position.xy*spread;eye.y+=cloudTime*(2.+1.5*fract(seed));
        depth=-eye.z;gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`uniform float cloudTime;varying vec2 q;varying float seed;varying float depth;
      float hash(vec2 p){vec3 v=fract(vec3(p.xyx)*.1031);v+=dot(v,v.yzx+33.33);return fract((v.x+v.y)*v.z);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){
        vec2 local=q*2.-1.;vec2 p=q*4.+seed+vec2(0.,-cloudTime*.67);
        float n=noise(p)*.64+noise(p*2.51)*.25+noise(p*6.17)*.11;
        float soft=1.-smoothstep(.18,1.,length(local)+.48*(.52-n));
        float age=smoothstep(0.,.13,cloudTime)*(1.-smoothstep(.78,1.78,cloudTime));
        float flash=1.-smoothstep(.025,.19,cloudTime);
        vec3 soil=mix(vec3(.042,.031,.023),vec3(.21,.15,.09),n);
        vec3 lit=mix(soil,vec3(1.55,1.20,.65),flash*(.79+.21*n));
        gl_FragColor=vec4(lit,age*soft*(.15+.32*n)*smoothstep(.35,1.6,depth));
      }`,
  });
  const clouds=new T.InstancedMesh(new T.PlaneGeometry(1,1),dustMaterial,22);
  const transform=new T.Object3D();
  for(let i=0;i<clouds.count;i++){
    const a=i*2.39996,r=.6+(i*13%23)/23*3.8;
    transform.position.set(Math.sin(a)*r,.35+(i%8)*.57,Math.cos(a)*r);
    transform.scale.setScalar(3.6+(i%5)*.62);transform.updateMatrix();clouds.setMatrixAt(i,transform.matrix);
  }
  clouds.frustumCulled=false;group.add(clouds);
  group.userData.updateEjecta=t=>{
    dustMaterial.uniforms.cloudTime.value=t;
    for(let i=0;i<count;i++){
      const f=fragments[i],age=Math.max(0,t-f.delay);
      const height=age*(f.speed-13*age);
      transform.position.set(f.x+age*f.dx,Math.max(-.4,height),f.z+age*f.dz);
      transform.rotation.set(i*.92+age*f.spin,i*.31+age*(f.spin+.34),i*1.73-age*f.spin);
      const size=t>=f.delay&&height>=0?f.size:0;
      transform.scale.set(size*(.7+(i%4)*.18),size,size*1.35);
      transform.updateMatrix();stones.setMatrixAt(i,transform.matrix);
    }
    stones.instanceMatrix.needsUpdate=true;
    sparksMaterial.uniforms.age.value=t;
  };
  group.userData.updateEjecta(0);
  return {o:group,kind:'meteor-ejecta',life:1.9,max:1.9};
}
