// Light-speed passes of the hovering consort.
//
// Primary clip 68.40-71.33 s (encounter 72.46-75.39 s). While Radahn hangs a few metres above the floor with both
// blades spread, the footage shows, one after another and two to six at a time:
//   * a perfectly straight, hair-thin white-gold line crossing the whole view at body height or just above the
//     floor. It is drawn in about a tenth of a second, stays for roughly a second and thins away;
//   * a broad, soft gold-orange smear along the newest line (the passing figure, blurred beyond recognition) that
//     is gone within half a second;
//   * a few four-point glints and motes left hanging along the path.
// No body, cloth or hair of a second Radahn can be made out in any frame of that interval, so none is built here.
// Every trace is a world-space object; nothing follows the camera or reads the clock of the replay.
import * as T from "game/lib/three.module.js";

const LINE_VERTEX = `
uniform float radius, pixels, sweep, taper;
attribute vec3 lineDir;
attribute float lineSide, lineAlong;
varying float vSide, vAlong, vReach;
void main(){
  vec4 world = modelMatrix * vec4(position, 1.);
  vec3 toEye = cameraPosition - world.xyz;
  float range = length(toEye);
  vec3 axis = normalize(mat3(modelMatrix) * lineDir);
  vec3 across = cross(axis, toEye / max(range, 1e-4));
  float grazing = length(across);
  across /= max(grazing, 1e-4);
  // Never thinner than a fixed number of screen pixels (1080-line reference), so the far end stays a line.
  float pixel = range * 2. / (projectionMatrix[1][1] * 1080.);
  float halfWidth = max(radius, pixels * pixel * .5) * mix(1., .35, taper * smoothstep(.35, 1., abs(lineAlong)));
  world.xyz += across * lineSide * halfWidth;
  vSide = lineSide; vAlong = lineAlong; vReach = (lineAlong * .5 + .5);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const LINE_FRAGMENT = `
uniform vec3 tint; uniform float power, sweep, soft, focus, shimmer, clock;
varying float vSide, vAlong, vReach;
float wakeHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wakeNoise(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(wakeHash(cell),wakeHash(cell+vec2(1.,0.)),f.x),
    mix(wakeHash(cell+vec2(0.,1.)),wakeHash(cell+vec2(1.,1.)),f.x),f.y);
}
void main(){
  float across = soft > .5 ? exp(-vSide * vSide * 3.2) * (1. - vSide * vSide) : 1. - smoothstep(.55, 1., abs(vSide));
  // The head travels from one end to the other; nothing exists ahead of it.
  float drawn = 1. - smoothstep(sweep - .02, sweep + .004, vReach);
  float ends = smoothstep(0., .06, vReach) * (1. - smoothstep(.94, 1., vReach));
  // The smear is densest where the pass crosses its target and thins toward both ends.
  float head = min(1.,sweep)*2.-1.;
  float moving = exp(-pow((vAlong-head)*3.8,2.));
  float residue = exp(-vAlong*vAlong*8.)*.38;
  float middle = mix(1., max(moving,residue), focus);
  // Nonperiodic, stretched soft eddies: no parallel luminous ridges.
  vec2 flow=vec2(vAlong*18.-clock*3.5,vSide*2.8);
  #ifdef TRACE_NOISE
  float broad=wakeNoise(flow);
  float detail=wakeNoise(flow*2.13+vec2(clock*.7,-clock*.4));
  float grain=1.-shimmer*(.12+.20*detail);
  float wake=mix(1.,.50+.35*broad+.15*detail,shimmer);
  #else
  float grain=1.,wake=1.;
  #endif
  float a = across * drawn * ends * middle * grain * wake * power;
  if (a < .002) discard;
  gl_FragColor = vec4(tint * a, a);
}`;

let starMap = null;
function starTexture() {
  if (starMap) return starMap;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const core = x.createRadialGradient(32, 32, 0, 32, 32, 11);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(.35, 'rgba(255,244,214,.55)'); core.addColorStop(1, 'rgba(255,230,170,0)');
  x.fillStyle = core; x.fillRect(0, 0, 64, 64);
  // Four thin arms.
  for (const [w, h] of [[62, 2.2], [2.2, 62]]) {
    const g = w > h ? x.createLinearGradient(1, 0, 63, 0) : x.createLinearGradient(0, 1, 0, 63);
    g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(.5, 'rgba(255,252,240,.95)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g; x.fillRect(32 - w / 2, 32 - h / 2, w, h);
  }
  starMap = new T.CanvasTexture(c);
  return starMap;
}

function lineMaterial(settings) {
  return new T.ShaderMaterial({
    uniforms: {
      radius: {value: settings.radius}, pixels: {value: settings.pixels}, taper: {value: settings.taper ?? 0},
      tint: {value: new T.Color().setRGB(...settings.tint)}, power: {value: 0}, sweep: {value: 0},
      soft: {value: settings.soft ? 1 : 0}, focus: {value: settings.focus ?? 0}, shimmer: {value: settings.shimmer ?? 0}, clock: {value: 0}
    },
    defines:settings.shimmer?{TRACE_NOISE:1}:{}, forceSinglePass:true,
    vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT,
    transparent: true, depthWrite: false, blending: T.CustomBlending, blendEquation: T.AddEquation,
    blendSrc: T.OneFactor, blendDst: T.OneFactor, side: T.DoubleSide, fog: false
  });
}

// All four coaxial sheets use additive colour. On the live renderer evaluate
// their four profiles across one camera-facing strip, with one depth test.
function liveRibbon(geometry,bandWidth){
  const uniforms={
    widths:{value:new T.Vector4(.014,.028,.14,bandWidth)},pixels:{value:new T.Vector2(1.65,3.2)},
    power:{value:new T.Vector4()},sweep:{value:0},clock:{value:0}
  };
  const varying='varying vec4 widthsAtVertex;varying float offsetAcross,vAlong,vReach;';
  const vertexShader=`
    uniform vec4 widths,power;uniform vec2 pixels;
    attribute vec3 lineDir;attribute float lineSide,lineAlong;
    ${varying}
    void main(){
      vec4 world=modelMatrix*vec4(position,1.);vec3 eye=cameraPosition-world.xyz;
      float d=length(eye);vec3 across=cross(normalize(mat3(modelMatrix)*lineDir),eye/max(d,.0001));
      across/=max(length(across),.0001);
      float unit=d/(projectionMatrix[1][1]*1080.);
      float taper=smoothstep(.35,1.,abs(lineAlong));
      widthsAtVertex=vec4(max(widths.xy,pixels*unit)*(1.-vec2(.65,.39)*taper),widths.zw);
      vec4 size=widthsAtVertex*step(vec4(.000001),power);
      offsetAcross=lineSide*max(max(size.x,size.y),max(size.z,size.w));
      world.xyz+=across*offsetAcross;vAlong=lineAlong;vReach=.5+.5*lineAlong;
      gl_Position=projectionMatrix*viewMatrix*world;
    }`;
  const hash=LINE_FRAGMENT.slice(LINE_FRAGMENT.indexOf('float wakeHash'),LINE_FRAGMENT.indexOf('void main()'));
  const fragmentShader=`
    uniform vec4 power;uniform float sweep,clock;
    ${varying}
    ${hash}
    void main(){
      float extent=(1.-smoothstep(sweep-.02,sweep+.004,vReach))*smoothstep(0.,.06,vReach)*(1.-smoothstep(.94,1.,vReach));
      if(extent<=0.)discard;
      vec4 side=abs(offsetAcross)/widthsAtVertex;
      vec4 profile=exp(-side*side*3.2)*max(vec4(0.),1.-side*side);
      profile.x=1.-smoothstep(.55,1.,side.x);
      float head=min(1.,sweep)*2.-1.;
      float middle=max(exp(-pow((vAlong-head)*3.8,2.)),exp(-vAlong*vAlong*8.)*.38);
      vec4 a=extent*profile*power*mix(vec4(1.),vec4(middle),vec4(0.,0.,.55,.72));
      if(a.w>=.002){
        vec2 flow=vec2(vAlong*18.-clock*3.5,offsetAcross/widthsAtVertex.w*2.8);
        float broad=wakeNoise(flow),detail=wakeNoise(flow*2.13+vec2(clock*.7,-clock*.4));
        a.w*=(.88-.2*detail)*(.50+.35*broad+.15*detail);
      }
      a*=step(vec4(.002),a);
      gl_FragColor=vec4(vec3(1.85,1.78,1.52)*a.x+vec3(1.25,.86,.34)*a.y+vec3(.95,.58,.19)*a.z+vec3(1.15,.64,.17)*a.w,dot(a,vec4(1.)));
    }`;
  const material=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,
    depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.CustomBlending,
    blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneFactor});
  const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=2;
  return mesh;
}

// center: point the pass goes through; direction: unit travel direction; seed: any integer (variety only).
// options.length: metres drawn either side of the centre.
export function createLightTrace(center, direction, seed = 0, cloud = null, options = {}) {
  const half = options.length ?? 46, SEG = 44;
  const group = new T.Group(); group.name = 'light-speed-trace'; group.position.copy(center);
  const dir = direction.clone().normalize();
  const positions = [], dirs = [], sides = [], alongs = [], indices = [];
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG * 2 - 1;
    for (const s of [-1, 1]) {
      positions.push(dir.x * u * half, dir.y * u * half, dir.z * u * half);
      dirs.push(dir.x, dir.y, dir.z); sides.push(s); alongs.push(u);
    }
    if (i < SEG) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('lineDir', new T.Float32BufferAttribute(dirs, 3));
  geometry.setAttribute('lineSide', new T.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('lineAlong', new T.Float32BufferAttribute(alongs, 1));
  geometry.setIndex(indices);
  geometry.boundingSphere = new T.Sphere(new T.Vector3(), half + 2);
  const rnd = n => { const v = Math.sin((seed * 12.9898 + n * 78.233) * 1.37) * 43758.5453; return v - Math.floor(v); };
  const bandWidth = .41 + .22 * rnd(1);
  const core = new T.Mesh(geometry, lineMaterial({radius: .014, pixels: 1.65, tint: [1.85, 1.78, 1.52], taper: 1}));
  const halo = new T.Mesh(geometry, lineMaterial({radius: .028, pixels: 3.2, tint: [1.25, .86, .34], soft: true, taper: .6}));
  // A soft gold sheath stays around the thread for as long as it is visible.
  const sheath = new T.Mesh(geometry, lineMaterial({radius: .14, pixels: 0, tint: [.95, .58, .19], soft: true, focus: .55}));
  const band = new T.Mesh(geometry, lineMaterial({radius: bandWidth, pixels: 0, tint: [1.15, .64, .17], soft: true, focus: .72, shimmer: 1}));
  const combined=options.live?liveRibbon(geometry,bandWidth):null;
  if(combined)group.add(combined);
  else for (const mesh of [band, sheath, halo, core]) { mesh.frustumCulled = false; mesh.userData.opacityScale = 1; group.add(mesh); }
  core.renderOrder = 3; halo.renderOrder = 2; band.renderOrder = 1;

  // Glints and motes left along the middle third of the path.
  const GLINTS = 21, MOTES = 128;
  const gp = new Float32Array(GLINTS * 3), gc = new Float32Array(GLINTS * 3), gPhase = [];
  for (let i = 0; i < GLINTS; i++) {
    const u = (rnd(10 + i) * 2 - 1) * .34 * half * (.25 + .75 * rnd(30 + i));
    gp[i * 3] = dir.x * u + (rnd(50 + i) - .5) * .5; gp[i * 3 + 1] = dir.y * u + (rnd(70 + i) - .5) * .45; gp[i * 3 + 2] = dir.z * u + (rnd(90 + i) - .5) * .5;
    gPhase.push(rnd(110 + i) * 6.283);
  }
  const glintGeometry = new T.BufferGeometry();
  glintGeometry.setAttribute('position', new T.BufferAttribute(gp, 3)); glintGeometry.setAttribute('color', new T.BufferAttribute(gc, 3));
  glintGeometry.boundingSphere = new T.Sphere(new T.Vector3(), half);
  const glints = new T.Points(glintGeometry, new T.PointsMaterial({map: starTexture(), size: .23, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false}));
  glints.frustumCulled = false; glints.userData.opacityScale = 1; group.add(glints);
  const mp = new Float32Array(MOTES * 3), mb = new Float32Array(MOTES * 3), mc = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    const u = (rnd(200 + i) * 2 - 1) * .42 * half * (.15 + .85 * rnd(240 + i));
    mb[i * 3] = dir.x * u + (rnd(280 + i) - .5) * 1.3; mb[i * 3 + 1] = dir.y * u + (rnd(320 + i) - .5) * 1.1; mb[i * 3 + 2] = dir.z * u + (rnd(360 + i) - .5) * 1.3;
  }
  mp.set(mb);
  const moteGeometry = new T.BufferGeometry();
  moteGeometry.setAttribute('position', new T.BufferAttribute(mp, 3)); moteGeometry.setAttribute('color', new T.BufferAttribute(mc, 3));
  moteGeometry.boundingSphere = new T.Sphere(new T.Vector3(), half);
  const motes = new T.Points(moteGeometry, new T.PointsMaterial({map: cloud, color: 0xffe2a0, size: .065, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false}));
  motes.frustumCulled = false; motes.userData.opacityScale = 1; group.add(motes);


  // Ground-level scatter follows the terrain below this pass. Sample once at birth;
  // the light and lifted grains stay on that part of the arena as the player runs.
  let floorWake = null, grains = null;
  if (options.heightAt) {
    const tangent = new T.Vector2(dir.x, dir.z).normalize();
    const lateral = new T.Vector2(-tangent.y, tangent.x);
    const groundPoint = (along, side) => {
      const x = tangent.x * along + lateral.x * side;
      const z = tangent.y * along + lateral.y * side;
      return [x, options.heightAt(center.x+x,center.z+z)-center.y+.08, z];
    };
    const xyz=[], tex=[], faces=[];
    for (let row=0; row<=48; row++) {
      const u=row/48, reach=(u-.5)*36;
      const width=(.73+1.34*Math.sin(Math.PI*u))*(.84+.19*Math.sin(u*20+seed));
      for(let col=0;col<=4;col++) {
        const side=col*.5-1;
        xyz.push(...groundPoint(reach,side*width)); tex.push(u,side);
        if(row<48&&col<4){const n=row*5+col;faces.push(n,n+5,n+1,n+1,n+5,n+6);}
      }
    }
    const ground=new T.BufferGeometry();
    ground.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    ground.setAttribute('uv',new T.Float32BufferAttribute(tex,2)); ground.setIndex(faces);
    const age={value:0};
    floorWake=new T.Mesh(ground,new T.ShaderMaterial({
      uniforms:{age,seed:{value:seed}},transparent:true,side:T.DoubleSide,
      depthWrite:false,blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-1,
      vertexShader:`varying vec2 q;void main(){q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float age,seed;varying vec2 q;
        void main(){float local=age-.12*q.x;
          float side=1.-smoothstep(.08,1.,abs(q.y));
          float grainLight=.60+.18*sin(q.x*43.+seed+q.y*2.8)+.12*sin(q.x*121.+q.y*5.);
          float pulse=smoothstep(0.,.04,local)*(1.-smoothstep(.31,1.14,local));
          float ends=smoothstep(0.,.24,q.x)*(1.-smoothstep(.76,1.,q.x));
          gl_FragColor=vec4(vec3(1.54,.81,.185),side*side*grainLight*ends*pulse*.36);}`
    }));
    group.add(floorWake);
    const origin=[], params=[];
    for(let i=0;i<132;i++){
      const lane=(rnd(1600+i)-.5)*26;
      const side=(rnd(1800+i)-.5)*(1.1+3.0*rnd(2000+i));
      origin.push(...groundPoint(lane,side));params.push(rnd(2200+i),rnd(2400+i),(lane/26+.5));
    }
    const field=new T.BufferGeometry();
    field.setAttribute('position',new T.Float32BufferAttribute(origin,3));
    field.setAttribute('grain',new T.Float32BufferAttribute(params,3));
    grains=new T.Points(field,new T.ShaderMaterial({
      uniforms:{age,drift:{value:lateral}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      vertexShader:`uniform float age;uniform vec2 drift;attribute vec3 grain;varying float life,hot;
        void main(){float t=max(0.,age-grain.z*.14-grain.x*.08);hot=grain.y;
          vec3 p=position;p.xz+=drift*(grain.x-.5)*(.25+t)*t;
          p.y+=.08+.29*grain.x+(.62+1.58*grain.y)*t-.53*t*t;
          vec4 eye=modelViewMatrix*vec4(p,1.);
          gl_PointSize=clamp((.037+.081*grain.x)*990./max(-eye.z,1.),1.7,9.);
          gl_Position=projectionMatrix*eye;
          life=smoothstep(0.,.07,t)*(1.-smoothstep(.38+grain.y*.31,1.18+grain.y*.30,t))
            *(.46+.54*pow(.5+.5*sin(grain.x*91.+t*12.),2.));}`,
      fragmentShader:`varying float life,hot;void main(){vec2 q=gl_PointCoord*2.-1.;
          float dotGlow=exp(-dot(q,q)*4.4)*(1.-smoothstep(.70,1.,length(q)));
          float crossGlow=pow(max(0.,1.-abs(q.x)),14.)*pow(max(0.,1.-abs(q.y)),3.)+pow(max(0.,1.-abs(q.y)),14.)*pow(max(0.,1.-abs(q.x)),3.);
          gl_FragColor=vec4(mix(vec3(1.46,.69,.16),vec3(3.25,2.46,1.31),hot),life*(dotGlow+.42*step(.86,hot)*crossGlow));}`
    }));grains.frustumCulled=false;group.add(grains);
  }

  const s = T.MathUtils.smoothstep, travel = options.travel ?? .11, stay = options.stay ?? 1.50;
  // These particles depend only on their fixed seed and the age of this pass.
  // Keeping their birth positions on the GPU avoids streaming three buffers
  // every frame when several light-speed passes overlap.
  const traceClock={value:0};
  if(options.live){
    glintGeometry.setAttribute('glintPhase',new T.Float32BufferAttribute(gPhase,1));
    for(const points of [glints,motes]){
      const glint=points===glints, material=points.material;
      material.customProgramCacheKey=()=>glint?'trace-glint-gpu':'trace-mote-gpu';
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{traceTime:traceClock,traceStay:{value:stay},traceTravel:{value:travel}});
        shader.vertexShader='uniform float traceTime,traceStay,traceTravel;\n'+(glint?'attribute float glintPhase;\n':'')+shader.vertexShader;
        const glow=glint?`
          float age=t-.04-.5*(i/${GLINTS}.)*traceTravel*6.;
          float star=pow(.5+.5*sin(age*(9.+mod(i,4.)*2.3)+glintPhase),5.);
          vColor.rgb=vec3(1.,.93,.72)*smoothstep(0.,.05,age)*(1.-smoothstep(.35,traceStay+.35,age))*(.12+.88*star);`:`
          float age=t-.03-mod(i,7.)*.012;
          float star=pow(.5+.5*sin(t*6.3+i*2.4),3.);
          vColor.rgb=vec3(1.,.86,.58)*smoothstep(0.,.06,age)*(1.-smoothstep(.45,traceStay+.45,age))*(.35+.65*star);`;
        shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',
          '#include <color_vertex>\nfloat t=traceTime,i=float(gl_VertexID);\n'+glow);
        if(!glint)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          transformed+=vec3(sin(t*1.3+i)*.05*t,.10*t+sin(t*2.1+i*1.7)*.03,cos(t*1.1+i*2.3)*.05*t);`);
      };
    }
  }
  group.userData.life = stay + .45;
  // Returns the light this trace sheds on its surroundings (0..1).
  group.userData.updateTrace = t => {
    if(floorWake)floorWake.material.uniforms.age.value=t;
    const sweep = Math.min(1.05, t / travel);
    const hot = s(t, 0, .03) * (1 - .62 * s(t, .10, .34));           // white-hot on arrival, then a steady thread
    const thread = 1 - s(t, stay * .55, stay + .40);
    for (const mesh of [core, halo, sheath, band]) mesh.material.uniforms.sweep.value = sweep;
    core.material.uniforms.power.value = hot * thread;
    core.material.uniforms.radius.value = .014 * (1 - .55 * s(t, .3, stay));
    core.material.uniforms.pixels.value = 1.78 - .30 * s(t, .35, stay + .3);
    halo.material.uniforms.power.value = .42 * hot * (1 - s(t, .22, stay * .8));
    sheath.material.uniforms.power.value = .31 * s(t, 0, .06) * (1 - s(t, stay * .35, stay + .25));
    band.material.uniforms.power.value =  .76 * s(t, 0, .05) * (1 - s(t, .12, .62));
    for(const layer of [core,halo,sheath,band])layer.visible=layer.material.uniforms.power.value>0;
    band.material.uniforms.clock.value = t;
    band.material.uniforms.radius.value = bandWidth * (1 + 1.30 * s(t, .05, .5));
    if(combined){
      const u=combined.material.uniforms,coreU=core.material.uniforms,bandU=band.material.uniforms;
      u.widths.value.x=coreU.radius.value;u.widths.value.w=bandU.radius.value;
      u.pixels.value.x=coreU.pixels.value;u.sweep.value=sweep;u.clock.value=t;
      u.power.value.set(coreU.power.value,halo.material.uniforms.power.value,sheath.material.uniforms.power.value,bandU.power.value);
      combined.visible=core.visible||halo.visible||sheath.visible||band.visible;
    }
    glints.material.size=.31+.075*Math.sin(t*13.+seed);
    if(options.live)traceClock.value=t;
    else{
      for (let i = 0; i < GLINTS; i++) {
        const born = .04 + .5 * (i / GLINTS) * travel * 6, age = t - born;
        const twinkle = Math.pow(.5 + .5 * Math.sin(age * (9 + i % 4 * 2.3) + gPhase[i]), 5);
        const v = age < 0 ? 0 : s(age, 0, .05) * (1 - s(age, .35, stay + .35)) * (.12 + .88 * twinkle);
        gc[i * 3] = v; gc[i * 3 + 1] = v * .93; gc[i * 3 + 2] = v * .72;
      }
      glintGeometry.attributes.color.needsUpdate = true;
      for (let i = 0; i < MOTES; i++) {
        const k = i * 3, age = t - .03 - (i % 7) * .012;
        mp[k] = mb[k] + Math.sin(t * 1.3 + i) * .05 * t; mp[k + 1] = mb[k + 1] + .10 * t + Math.sin(t * 2.1 + i * 1.7) * .03; mp[k + 2] = mb[k + 2] + Math.cos(t * 1.1 + i * 2.3) * .05 * t;
        const v = age < 0 ? 0 : s(age, 0, .06) * (1 - s(age, .45, stay + .45)) * (.35 + .65 * Math.pow(.5 + .5 * Math.sin(t * 6.3 + i * 2.4), 3));
        mc[k] = v; mc[k + 1] = v * .86; mc[k + 2] = v * .58;
      }
      moteGeometry.attributes.position.needsUpdate = true; moteGeometry.attributes.color.needsUpdate = true;
    }
    return s(t, 0, .04) * (1 - s(t, .12, .7));
  };
  group.userData.updateTrace(0);
  return group;
}

// Deterministic geometry of one pass through a moving target.
//   index      ordinal of the pass within the skill
//   target     ground position of the runner
//   heading    unit travel direction of the runner (or facing when standing)
//   source     ground position below the hovering caster
// Returns {center, direction}. Lines cross the runner's path at varied angles, a little ahead of or beside the
// body, between knee and head height, some of them climbing toward the caster's side.
const PASSES = [
  // [angle from the heading (rad), lead along the heading (m), offset across (m), height (m), climb (rad)]
  [1.02, .6, .35, .42, -.035], [-.72, 2.4, -.9, 1.25, .07], [1.31, 1.1, 1.3, .70, -.02], [-1.12, 3.4, .5, 1.05, .05],
  [.58, 4.6, -1.6, 1.55, .10], [-1.38, .9, -.4, .55, -.03], [.86, 5.6, 1.9, 1.35, .085], [-.50, 6.8, -2.2, 1.7, .12],
  [1.22, 2.0, .8, .62, .02], [-.95, 7.6, 1.2, 1.15, .06], [.40, 8.4, -1.1, 1.9, .14], [-1.27, 3.0, -1.4, .50, -.025],
  [1.46, 1.4, .2, .95, .0], [-.64, 5.0, 2.4, 1.45, .09], [1.08, .4, -.7, .80, .03]
];
export const LIGHT_PASS_COUNT = PASSES.length;
export function lightPass(index, target, heading, source) {
  const [angle, lead, offset, height, climb] = PASSES[index % PASSES.length];
  const across = new T.Vector3(heading.z, 0, -heading.x);
  const center = target.clone().addScaledVector(heading, lead).addScaledVector(across, offset);
  center.y = target.y + height;
  const direction = heading.clone().applyAxisAngle(new T.Vector3(0, 1, 0), angle);
  // Travel away from the caster's side, so the bright head leaves him and the rising end points back at him.
  const fromCaster = center.clone().sub(source).setY(0);
  if (fromCaster.dot(direction) < 0) direction.negate();
  direction.y = -Math.sin(climb); direction.normalize();
  return {center, direction};
}
