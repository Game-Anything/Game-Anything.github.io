import * as T from "game/lib/three.module.js";

// Primary clip 73.5–74.9 and 122.6–123.4: glitter occupies the height of
// the shaft and keeps falling after its solid core has disappeared.
// Reuses the full-height distribution studied in consort-meteor.js, without
// importing that draft's action, flash or camera presentation.
export function createColumnParticles(seed, duration, broad=false) {
  const count=broad?864:246, height=broad?46:34;
  const positions=[],seeds=[],viewport=new T.Vector4();
  const rnd=n=>{const v=Math.sin(seed*7.13+n*127.1)*43758.5453;return v-Math.floor(v);};
  for(let i=0;i<count;i++){
    const a=rnd(i*7+1)*Math.PI*2,r=Math.sqrt(rnd(i*7+2))*(i%4===0?2.20:.77);
    positions.push(Math.sin(a)*r,.3+Math.pow(rnd(i*7+3),1.65)*height,Math.cos(a)*r);
    seeds.push(rnd(i*7+4),rnd(i*7+5),rnd(i*7+6));
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('particleSeed',new T.Float32BufferAttribute(seeds,3));
  const material=new T.ShaderMaterial({
    uniforms:{halfHeight:{value:540},age:{value:-1},duration:{value:duration},opacity:{value:1}},
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`
      uniform float age,duration,halfHeight;attribute vec3 particleSeed;
      varying float life,kind,phase,depth;
      void main(){
        float t=max(0.,age),born=particleSeed.x*.24;
        kind=particleSeed.z;phase=particleSeed.y*6.283;
        vec3 p=position;
        float wave=pow(max(0.,1.-position.y/11.),2.)*(.36+.64*particleSeed.x);
        float release=(1.-exp(-5.*t))*wave;
        p.x+=cos(phase)*release*1.7+sin(t*1.4+phase)*t*.21;
        p.z+=sin(phase)*release*1.7+cos(t*1.1+phase)*t*.21;
        // A short release from the core, then a slow rain; no per-frame respawn.
        p.y+=.6*(1.-exp(-t*7.))-(.9+particleSeed.y*2.8)*t;
        float finish=duration*.70+.24+particleSeed.y*.43;
        life=smoothstep(born,born+.11,age)*(1.-smoothstep(finish-.65,finish,age));
        life*=smoothstep(-.1,.3,p.y)*(.45+.55*pow(.5+.5*sin(t*12.+phase),3.));
        vec4 mv=modelViewMatrix*vec4(p,1.);depth=-mv.z;
        float size=mix(.065,.145,particleSeed.x)*(kind>.88?1.6:1.);
        gl_PointSize=clamp(size*projectionMatrix[1][1]*halfHeight/max(1.,depth),1.,(kind>.88?9.5:5.8)*halfHeight/540.);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform float opacity;varying float life,kind,phase,depth;
      void main(){
        vec2 p=gl_PointCoord*2.-1.;
        float dotGlow=exp(-dot(p,p)*5.)*(1.-smoothstep(.65,1.,length(p)));
        float flake=exp(-p.x*p.x*48.-p.y*p.y*2.8)*(1.-smoothstep(.7,1.,abs(p.y)));
        float star=pow(max(0.,1.-abs(p.x)),16.)*pow(max(0.,1.-abs(p.y)),2.)
          +pow(max(0.,1.-abs(p.y)),16.)*pow(max(0.,1.-abs(p.x)),2.);
        float shape=kind>.88?dotGlow*.5+star*.7:kind>.60?flake:dotGlow;
        float alpha=shape*life*opacity*(1.-smoothstep(55.,110.,depth));
        if(alpha<.006)discard;
        gl_FragColor=vec4(mix(vec3(1.,.61,.20),vec3(1.7,1.35,.72),kind),alpha);
      }`
  });
  const points=new T.Points(geometry,material);points.name='holy-column-falling-glitter';
  points.onBeforeRender=renderer=>{material.uniforms.halfHeight.value=renderer.getCurrentViewport(viewport).w*.5;};
  points.frustumCulled=false;points.userData.opacityScale=1;
  points.userData.update=t=>{material.uniforms.age.value=t;};
  return points;
}
