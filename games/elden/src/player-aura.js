import * as T from "game/lib/three.module.js";

// The seal flares at the palm first. Its release curls up around the
// caster's shoulders at 69.5–69.8 and dies out while the hand lowers.
export function createSealFlare(texture){
  const group=new T.Group(),fire=new T.Group();group.add(fire);
  const pos=[],uv=[],indices=[];
  for(let strand=0;strand<9;strand++)for(let j=0;j<=24;j++){
    const f=j/24,a=strand*2.39996+f*(1.6+(strand%3)*.43),r=.51+.09*(strand%4)+f*.19;
    for(const edge of [-1,1]){
      const w=(.11+.035*Math.cos(strand*2.1))*Math.sin(Math.PI*f)*edge;
      pos.push(Math.sin(a)*r,.37+f*(1.19+.21*(strand%3))+w,Math.cos(a)*r);
      uv.push(f,edge);
    }
    const n=(strand*25+j)*2;if(j<24)indices.push(n,n+1,n+2,n+2,n+1,n+3);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,
    uniforms:{age:{value:0},power:{value:0}},
    vertexShader:`uniform float age;varying vec2 q;void main(){q=uv;vec3 p=position;p.x+=.044*sin(age*19.+p.y*12.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float age,power;varying vec2 q;void main(){float flicker=.75+.25*sin(age*21.-q.x*18.);float core=pow(1.-abs(q.y),2.);gl_FragColor=vec4(mix(vec3(1.95,.13,.015),vec3(2.8,1.28,.24),core),power*flicker*core*sin(q.x*3.14159));}`});
  fire.add(new T.Mesh(geo,mat));const glow=new T.Sprite(new T.SpriteMaterial({map:texture,color:new T.Color(2.25,.38,.065),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  group.add(glow);const light=new T.PointLight(0xff7135,0,6,2);group.add(light);
  group.userData.update=(actor,position,t)=>{
    group.visible=actor.root.visible&&t!=null;
    light.intensity=0;if(!group.visible)return;
    const palm=actor.hand('Right');if(!palm){group.visible=false;return;}
    group.position.copy(position);palm.getWorldPosition(glow.position).sub(position);light.position.copy(glow.position);
    const build=T.MathUtils.smoothstep(t,.14,.8)*(1-T.MathUtils.smoothstep(t,2.40,2.83));
    const release=T.MathUtils.smoothstep(t,1.82,2.20)*(1-T.MathUtils.smoothstep(t,2.27,2.69));
    glow.scale.setScalar(.41+build*.39+release*.42);glow.material.opacity=build*(.68+.18*Math.sin(t*29));
    fire.rotation.y=t*1.9;fire.scale.setScalar(.71+.41*T.MathUtils.smoothstep(t,1.84,2.48));
    mat.uniforms.age.value=t;mat.uniforms.power.value=release*1.48;light.intensity=build*5+release*18;
  };
  return group;
}

// Several narrow red and amber traces are present on the player at entry,
// including before the later hand cast. Their gameplay source is uncertain.
export function createPlayerAura(texture) {
  const group=new T.Group();
  group.name='player-status-streaks';
  const positions=[],coordinates=[],seeds=[],tints=[],indices=[];
  for(let i=0;i<26;i++){
    const angle=i*2.399963,radial=.37+(i%5)*.055;
    const center=new T.Vector3(Math.sin(angle)*radial,0,Math.cos(angle)*radial);
    const tangent=new T.Vector3(Math.cos(angle),0,-Math.sin(angle));
    const height=.31+((i*13)%19)/19*.53;
    const width=.012+((i*7)%11)/11*.025;
    const bottom=.40+((i*7)%13)/13*.69;
    for(const [u,v] of [[-1,0],[1,0],[-1,1],[1,1]]){
      const p=center.clone().addScaledVector(tangent,width*u);
      positions.push(p.x,bottom+height*v,p.z);
      coordinates.push(u,v);seeds.push(i*.741);
      tints.push(i%4===0?1:0);
    }
    const base=i*4;indices.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(coordinates,2));
  geometry.setAttribute('phase',new T.Float32BufferAttribute(seeds,1));
  geometry.setAttribute('amber',new T.Float32BufferAttribute(tints,1));geometry.setIndex(indices);
  const material=new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
    blending:T.AdditiveBlending,uniforms:{time:{value:0},strength:{value:1}},
    vertexShader:`uniform float time;attribute float phase;attribute float amber;
      varying vec2 q;varying float pulse;varying float tint;
      void main(){
        q=uv;tint=amber;
        float age=fract(time*(.68+.13*sin(phase))+phase);
        pulse=pow(sin(3.14159*age),2.);
        vec3 p=position;p.y+=(age-.5)*.28;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader:`uniform float strength;varying vec2 q;varying float pulse;varying float tint;
      void main(){
        float taper=pow(max(0.,sin(3.14159*q.y)),1.2);
        float alpha=pow(max(0.,1.-abs(q.x)),2.)*taper*pulse;
        vec3 color=mix(vec3(2.7,.19,.085),vec3(2.75,1.45,.38),tint);
        gl_FragColor=vec4(color,alpha*strength);
      }`,
  });
  const streaks=new T.Mesh(geometry,material);streaks.frustumCulled=false;group.add(streaks);
  // The long traces at entry follow the outer cloth. Sample its deformed
  // surface so they remain on the back during a step, thrust or roll.
  const clothGeo=new T.BufferGeometry(),clothCount=8,rows=6,clothUV=[],clothPhase=[],clothAmber=[],clothIndex=[];
  const clothPositions=new T.BufferAttribute(new Float32Array(clothCount*rows*2*3),3);
  clothPositions.setUsage(T.DynamicDrawUsage);
  for(let i=0;i<clothCount;i++)for(let row=0;row<rows;row++){
    for(const side of [-1,1]){clothUV.push(side,row/(rows-1));clothPhase.push(i*.89);clothAmber.push(i%4===0?1:0);}
    if(row+1<rows){const n=(i*rows+row)*2;clothIndex.push(n,n+1,n+2,n+2,n+1,n+3);}
  }
  clothGeo.setAttribute('position',clothPositions);clothGeo.setAttribute('uv',new T.Float32BufferAttribute(clothUV,2));
  clothGeo.setAttribute('phase',new T.Float32BufferAttribute(clothPhase,1));clothGeo.setAttribute('amber',new T.Float32BufferAttribute(clothAmber,1));clothGeo.setIndex(clothIndex);
  const clothMaterial=material.clone();
  clothMaterial.vertexShader=material.vertexShader.replace('p.y+=(age-.5)*.28;','');
  const clothGlow=new T.Mesh(clothGeo,clothMaterial);clothGlow.frustumCulled=false;group.add(clothGlow);
  const anchor=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3();
  const pool=new T.Mesh(new T.PlaneGeometry(2.4,2.4).rotateX(-Math.PI/2),
    new T.MeshBasicMaterial({color:0xf6a15e,map:texture,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
  group.add(pool);
  group.userData.update=(position,ground,yaw,time,roll,cape)=>{
    group.position.set(position.x,ground,position.z);
    streaks.rotation.y=yaw;streaks.position.y=position.y-ground;
    streaks.scale.y=1-.42*roll;
    material.uniforms.time.value=time;material.uniforms.strength.value= .49-.16*roll;
    clothGlow.visible=!!cape?.visible;
    if(clothGlow.visible){
      cape.updateWorldMatrix(true,false);normalMatrix.getNormalMatrix(cape.matrixWorld);
      const {widthSegments:w,heightSegments:h}=cape.geometry.parameters;
      const {position:cloth,normal:normals}=cape.geometry.attributes;
      for(let i=0;i<clothCount;i++)for(let j=0;j<rows;j++){
        const f=j/(rows-1),mid=(.15+i/(clothCount-1)*.7)*w;
        const y=Math.round(h*(.18+(i%3)*.075+f*(.44+(i%2)*.1)));
        const left=Math.floor(mid),blend=mid-left,offset=y*(w+1)+left;
        for(let edge=0;edge<2;edge++){
          const at=T.MathUtils.clamp(blend+(edge-.5)*(.27+(i%3)*.075),0,1);
          anchor.set(cloth.getX(offset)*(1-at)+cloth.getX(offset+1)*at,cloth.getY(offset)*(1-at)+cloth.getY(offset+1)*at,cloth.getZ(offset)*(1-at)+cloth.getZ(offset+1)*at);
          normal.fromBufferAttribute(normals,offset).applyMatrix3(normalMatrix).normalize();
          anchor.applyMatrix4(cape.matrixWorld).addScaledVector(normal,.023).sub(group.position);
          clothPositions.setXYZ((i*rows+j)*2+edge,anchor.x,anchor.y,anchor.z);
        }
      }
      clothPositions.needsUpdate=true;clothMaterial.uniforms.time.value=time;clothMaterial.uniforms.strength.value=.47;
    }
    pool.position.y=.043;pool.material.opacity=(.20+.055*Math.sin(time*4.1))*Math.max(0,1-Math.max(0,position.y)/2);
  };
  return group;
}
