import * as T from "game/lib/three.module.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";

// Selected source 14.5-18.5 s: one irregular dark core, a bright violet
// electrical shell, and a trail behind the moving stone. Visual dimensions
// are reconstruction estimates; the projectile/hit simulation is unchanged.
// Source 134.94 and 136.54 s (encounter 139.0 / 140.6), native frames: dark stones broken along flat grey
// faces with sharp ridges between them, an uneven outline and loose splinters beside them. A displaced ball
// reads as a rounded lobed clump, so the lump is cut by random planes: a face lying on one cut is pale grey,
// the crust left between cuts stays dark.
const rand=(seed,n)=>{const x=Math.sin(seed*91.7+n*127.1+13.3)*43758.5453;return x-Math.floor(x);};
function fracture(seed){
 const planes=[],count=8+Math.floor(rand(seed,1)*4);
 for(let k=0;k<count;k++){
  const y=rand(seed,k*3+2)*2-1,angle=rand(seed,k*3+3)*Math.PI*2,r=Math.sqrt(1-y*y);
  planes.push({n:new T.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r),d:.56+rand(seed,k*3+4)*.36,tone:.52+rand(seed,k*5+7)*.34});
 }
 // Moves a unit direction onto the broken surface and returns the plane that cut it (null on the crust).
 return v=>{
  const n=Math.sin(v.x*3.1+seed)*Math.sin(v.y*3.7-seed*.7)*Math.sin(v.z*3.3+seed*1.3);
  const grit=Math.sin(v.x*23+seed)*Math.sin(v.y*19-seed)*Math.cos(v.z*27+seed);
  v.multiplyScalar(1+n*.24+grit*.04);
  let cut=null,deepest=0;
  for(let pass=0;pass<2;pass++)for(const p of planes){
   const over=v.dot(p.n)-p.d;
   if(over>0){v.addScaledVector(p.n,-over);if(over>deepest){deepest=over;cut=p;}}
  }
  // Broken relief on the cut itself, so a face is not a polished facet.
  const grain=Math.sin(v.x*41+seed*3)*Math.sin(v.y*37-seed)*Math.sin(v.z*43+seed*2);
  const bedding=v.x*11+v.y*6-v.z*9+1.35*Math.sin(v.z*5+seed)+seed;
  const ledge=Math.pow(.5+.5*Math.cos(bedding),5);
  v.multiplyScalar(1+.037*grain+(cut ? .11 : .065)*(ledge-.4));
  return cut;
 };
}
function stone(radius,seed,detail=4,stretch=[1.08,.87,1.12]){
 const geometry=new T.IcosahedronGeometry(1,detail),a=geometry.attributes.position,colors=new Float32Array(a.count*3);
 const surface=fracture(seed),v=new T.Vector3(),cuts=[];
 for(let i=0;i<a.count;i++){
  v.fromBufferAttribute(a,i);cuts.push(surface(v));
  a.setXYZ(i,v.x*radius*stretch[0],v.y*radius*stretch[1],v.z*radius*stretch[2]);
 }
 // Sample the fracture at each vertex. A single shared edge therefore carries
 // the same crust on both triangles, including along the pale broken faces.
 for(let i=0;i<a.count;i++){
  const x=a.getX(i)/radius,y=a.getY(i)/radius,z=a.getZ(i)/radius;
  const strata=Math.sin(16*x+11*y-8*z+2.8*Math.sin(4*z+seed));
  const seam=Math.max(0,1-Math.abs(strata)*3);
  const flake=Math.pow(Math.max(0,strata),5);
  const shelf=Math.max(0,Math.sin(9*x+12*y+1.9*Math.sin(z*8+seed)));
  const tone=cuts[i]?cuts[i].tone*(.20+.28*flake+.12*shelf)-.078*seam:.035+.062*flake+.035*shelf;
  colors[i*3]=tone;colors[i*3+1]=tone*.98;colors[i*3+2]=tone*1.03;
 }
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}

// Shared seamless stone grain, independent of DOM/canvas and of game RNG.
// Broad planes alone read as a low-poly crystal in the normal camera view.
let surfaceTexture;
function stoneSurface(){
 if(surfaceTexture)return surfaceTexture;
 const size=256,data=new Uint8Array(size*size*4);
 const hash=(x,y,n)=>{const v=Math.sin((x%n)*127.1+(y%n)*311.7)*43758.5453;return v-Math.floor(v);};
 const noise=(u,v,n)=>{
  const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iy,n),hash(ix+1,iy,n),sx),T.MathUtils.lerp(hash(ix,iy+1,n),hash(ix+1,iy+1,n),sx),sy);
 };
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const broad=noise(u,v,8),grain=noise(u,v,48),fine=noise(u,v,128);
  const cleft=Math.max(0,1-Math.abs(noise(u,v,22)-.5)*15);
  const seam=Math.abs(Math.sin(50.265482*u+31.415927*v+7*noise(u,v,6)+1.4*grain));
  const slip=Math.max(0,1-seam*5)*(grain-.32);
  const value=T.MathUtils.clamp(58+broad*89+grain*98+fine*43-cleft*94+slip*79,24,255),p=(y*size+x)*4;
  data[p]=data[p+1]=data[p+2]=value;data[p+3]=255;
 }
 surfaceTexture=new T.DataTexture(data,size,size);surfaceTexture.wrapS=surfaceTexture.wrapT=T.RepeatWrapping;
 surfaceTexture.magFilter=T.LinearFilter;surfaceTexture.minFilter=T.LinearMipmapLinearFilter;surfaceTexture.generateMipmaps=true;
 surfaceTexture.needsUpdate=true;return surfaceTexture;
}

export function createGravityRock(texture,index){
 const group=new T.Group();group.name='gravity-rock';
 const radius=.98+index%2*.12,shapeSeed=index*1.37+.5;
 // No two stones share an outline: slabs, wedges and blocks.
 const stretch=[.90+rand(index,31)*.57,.65+rand(index,32)*.46,.84+rand(index,33)*.49];
 const parts=[stone(radius,shapeSeed,9,stretch)];
 const place=(chip,n,distance)=>{
  chip.rotateX(rand(index,n)*6.283);chip.rotateY(rand(index,n+1)*6.283);
  const y=rand(index,n+2)*2-1,angle=rand(index,n+3)*6.283,r=Math.sqrt(1-y*y);
  chip.translate(Math.cos(angle)*r*distance*stretch[0],y*distance*stretch[1],Math.sin(angle)*r*distance*stretch[2]);parts.push(chip);
 };
 // Lumps grown into the body break the silhouette; loose splinters travel beside it.
 for(let j=0;j<3;j++)place(stone(.32+rand(index,40+j)*.22,index*7+j+3.1,2,[1.22,.78,1]),50+j*4,radius*.78);
 // Parallel broken plates form a projecting lip on one flank. Smaller
 // secondary plates follow the same bedding instead of radial symmetry.
 const beddingAngle=rand(index,139)*Math.PI*2;
 for(let j=0;j<3;j++){
  const plate=stone(radius*(.61-.075*j),shapeSeed+27+j,3,[1.12,.28,.75]);
  plate.rotateZ(-.32);plate.rotateY(beddingAngle);
  const distance=radius*(.50+.075*j);
  plate.translate(distance*Math.cos(beddingAngle),radius*(.25-.21*j),-distance*Math.sin(beddingAngle));
  parts.push(plate);
 }
 for(let j=0;j<9;j++)place(stone(.055+rand(index,70+j)*.12,index*11+j+.7,1,[1.5,.62,.9]),90+j*4,radius*(1.42+rand(index,80+j)*.95));
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
 const surface=stoneSurface();
 const core=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,map:surface,bumpMap:surface,bumpScale:.115,roughnessMap:surface,roughness:.86,flatShading:true,
  emissive:0x160d20,emissiveIntensity:.12}));group.add(core);
 // Short irregular branching discharges cling to the actual uneven surface.
 // The previous six pole-to-pole paths looked like regular zigzag bands.
 const segments=[],arcIds=[],widths=[];
 const hash=n=>rand(index+2.9,n),shape=fracture(shapeSeed);
 const surfacePoint=(direction,height)=>{
  const v=direction.clone();shape(v);
  const scale=radius*(1+height);
  return v.set(v.x*scale*stretch[0],v.y*scale*stretch[1],v.z*scale*stretch[2]);
 };
 const add=(start,end,id,width)=>{segments.push([start,end]);arcIds.push(id);widths.push(width);};
 // In the close pass at 136.54 s, a few bright edges carry hairline forks.
 // Each sprig shares its root, with a separate taper and diminishing excursions.
 const runners=36;
 for(let id=0;id<runners;id++){
  const key=id*101,azimuth=id*2.399963+index*1.7+.38*(hash(key)-.5);
  const y=1-2*(id+.25+.5*hash(key+1))/runners,r=Math.sqrt(1-y*y);
  const start=new T.Vector3(Math.cos(azimuth)*r,y,Math.sin(azimuth)*r);
  const east=new T.Vector3(-Math.sin(azimuth),0,Math.cos(azimuth));
  const north=new T.Vector3().crossVectors(start,east);
  const bearing=hash(key+2)*Math.PI*2;
  const along=east.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(north,Math.sin(bearing));
  const side=new T.Vector3().crossVectors(start,along);
  const trunk=id%6===0;
  const span=trunk?1.32+.59*hash(key+3):.30+.88*hash(key+3);
  const arch=trunk?.30+.39*hash(key+4):.045+.10*hash(key+4);
  const steps=18+Math.floor(8*hash(key+5)),joints=[];
  let bend=0;
  for(let j=0;j<=steps;j++){
   const f=j/steps;
   bend=bend*.66+(hash(key+9+j)-.5)*(trunk?.22:.09);
   const dir=start.clone().addScaledVector(along,f*span)
     .addScaledVector(side,.058*Math.sin(f*8+bearing)+bend).normalize();
   const height=.040+arch*Math.sin(Math.PI*f);
   const point=surfacePoint(dir,height);
   if(j)add(joints[j-1].point,point,id+f*.89,(.66+.38*hash(key+37+j))*(1-.57*f));
   joints.push({dir,height,point});
  }
  for(let k=0;k<3;k++){
   const joint=joints[Math.floor((.12+.22*k+.16*hash(key+58+k))*steps)];
   let prev=joint.point;
   const sense=k%2?-1:1,reach=.13+.30*hash(key+61+k);
   for(let j=1;j<=6;j++){
    const f=j/6;
    const dir=joint.dir.clone().addScaledVector(along,reach*f*.71)
      .addScaledVector(side,sense*(reach*f+(hash(key+65+8*k+j)-.5)*.036)).normalize();
    const point=surfacePoint(dir,.027+(joint.height-.027)*(1-f));
    add(prev,point,id+(.12+.22*k+f*.24)*.89,.54*(1-.69*f));
    if(j===3){
     const spur=dir.clone().addScaledVector(along,-.09).addScaledVector(side,sense*.085).normalize();
     const tip=surfacePoint(spur,joint.height*.48+.04);
     add(point,tip,id+(.22+.22*k)*.89,.30);
    }
    prev=point;
   }
  }
 }
 // Project each branch as a tapered ribbon. A subpixel strand keeps a
 // fractional pixel of coverage at suspension distance; only the return
 // stroke develops a white core when the rock passes close to the camera.
 const starts=[],ends=[],strokes=[],strokeFaces=[];
 for(let j=0;j<segments.length;j++){
   const [a,b]=segments[j],n=starts.length/3;
   for(const [along,side] of [[0,-1],[0,1],[1,-1],[1,1]]){
     starts.push(a.x,a.y,a.z);ends.push(b.x,b.y,b.z);
     strokes.push(along,side,arcIds[j],widths[j]);
   }
   strokeFaces.push(n,n+1,n+2,n+2,n+1,n+3);
 }
 const filament=new T.BufferGeometry();
 filament.setIndex(strokeFaces);
 filament.setAttribute('position',new T.Float32BufferAttribute(starts,3));
 filament.setAttribute('tip',new T.Float32BufferAttribute(ends,3));
 filament.setAttribute('stroke',new T.Float32BufferAttribute(strokes,4));
 const lightningTime={value:0},lightningEnergy={value:1};
 const lineMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
   blending:T.AdditiveBlending,uniforms:{clock:lightningTime,energy:lightningEnergy,
     rockSeed:{value:shapeSeed},heightPx:{value:720},strength:{value:1}},
   vertexShader:`attribute vec3 tip;attribute vec4 stroke;uniform float heightPx,clock,rockSeed;
    varying float across,alongPath,pathId,coverage;
    void main(){
     pathId=floor(stroke.z);alongPath=fract(stroke.z);across=stroke.y;
     vec3 p=(modelViewMatrix*vec4(position,1.)).xyz;
     vec3 q=(modelViewMatrix*vec4(tip,1.)).xyz;
     vec3 eye=mix(p,q,stroke.x),side=cross(q-p,normalize(-eye));
     float pixel=2.*abs(eye.z)/(projectionMatrix[1][1]*heightPx);
     float thickness=.043*stroke.w*length(modelMatrix[0].xyz);
     float width=max(pixel*.98,thickness);
     coverage=clamp(thickness/max(.0001,pixel),.27,1.);
     eye+=side/max(.0001,length(side))*width*across;
     gl_Position=projectionMatrix*vec4(eye,1.);
    }`,
   fragmentShader:`varying float across,alongPath,pathId,coverage;uniform float clock,energy,rockSeed,strength;
    void main(){
     float epoch=clock*(3.1+.26*mod(pathId,4.))+pathId*.39+rockSeed;
     float u=fract(epoch),seed=fract(sin(floor(epoch)+pathId*8.74+rockSeed)*3017.1);
     float run=exp(-abs(alongPath-clamp(u*3.,0.,1.))*5.8);
     float flash=exp(-abs(u-.37)*15.)+.42*exp(-abs(u-.56)*24.);
     float power=(.026+run*.41+flash*1.95)*smoothstep(.29,.75,seed)*energy*strength;
     float x=abs(across),core=exp(-14.*x*x),a=exp(-3.7*x*x);
     float ember=step(.79,fract(sin(floor(epoch)*11.73+pathId*3.17+rockSeed)*1986.3));
     float hot=ember*smoothstep(.07,.61,flash+run*.34);
     vec3 halo=mix(vec3(.76,.20,1.42),vec3(2.60,.065,.12),hot);
     vec3 light=mix(halo,mix(vec3(2.9,2.24,3.09),vec3(3.36,.53,.39),hot),core);
     gl_FragColor=vec4(light,clamp(coverage*power*(.52*a+.93*core),0.,1.));
    }`});
 const arcs=[new T.Mesh(filament,lineMaterial)],pixelSize=new T.Vector2();
 arcs[0].userData.baseOpacity=1;arcs[0].frustumCulled=false;
 arcs[0].onBeforeRender=renderer=>{
   lineMaterial.uniforms.heightPx.value=renderer.getDrawingBufferSize(pixelSize).y;
   lineMaterial.uniforms.strength.value=lineMaterial.opacity;
 };
 group.add(arcs[0]);group.userData.lightningTime=lightningTime;group.userData.lightningEnergy=lightningEnergy;

 const aura=new T.Sprite(new T.SpriteMaterial({map:texture,color:0xa15fff,transparent:true,opacity:.48,depthWrite:false,blending:T.AdditiveBlending}));
 aura.scale.setScalar(3.4);group.add(aura);group.userData.aura=aura;
 const vertices=[],coords=[],ids=[],faces=[];
 for(let fork=0;fork<2;fork++)for(let j=0;j<=18;j++){
   const n=vertices.length/3;
   for(const side of [-1,1]){vertices.push(0,0,0);coords.push(j/18,side);ids.push(fork);}
   if(j<18)faces.push(n,n+1,n+2,n+2,n+1,n+3);
 }
 const tetherGeo=new T.BufferGeometry();
 tetherGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));tetherGeo.setAttribute('uv',new T.Float32BufferAttribute(coords,2));tetherGeo.setAttribute('fork',new T.Float32BufferAttribute(ids,1));tetherGeo.setIndex(faces);
 const tetherMat=new T.ShaderMaterial({uniforms:{anchor:{value:new T.Vector3()},age:{value:0},seed:{value:index},strength:{value:0}},
   transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,
   vertexShader:`uniform vec3 anchor;uniform float age,seed;attribute float fork;varying vec2 q;
   void main(){q=uv;float f=uv.x,stepID=floor(age*17.);vec3 p=mix(normalize(anchor)*.65,anchor,f);
     // Uneven kinks of unequal length, not an even sine zigzag.
     float cell=floor(f*13.),piece=fract(f*13.),key=seed*7.3+fork*3.1+stepID*5.3;
     vec3 h0=fract(sin(vec3(cell*12.9+key)+vec3(0.,37.,71.))*43758.5453)-.5;
     vec3 h1=fract(sin(vec3((cell+1.)*12.9+key)+vec3(0.,37.,71.))*43758.5453)-.5;
     p+=sin(f*3.14159)*mix(h0,h1,piece*piece*(3.-2.*piece))*(1.0+.9*fork);
     vec3 v=(modelViewMatrix*vec4(p,1.)).xyz;
     vec3 axis=normalize((modelViewMatrix*vec4(anchor,0.)).xyz+vec3(.00001));
     vec3 side=cross(axis,normalize(-v));v+=side/max(length(side),.0001)*uv.y*.026;gl_Position=projectionMatrix*vec4(v,1.);}`,
   fragmentShader:`uniform float strength;varying vec2 q;void main(){float core=1.-abs(q.y);gl_FragColor=vec4(mix(vec3(.8,.28,2.3),vec3(2.25,1.6,2.9),pow(core,4.)),core*strength);}`});
 const tether=new T.Mesh(tetherGeo,tetherMat);tether.frustumCulled=false;tether.visible=false;group.add(tether);group.userData.tether=tether;
 const tail=new T.Sprite(new T.SpriteMaterial({map:texture,color:0x9b60d7,transparent:true,opacity:.55,depthWrite:false,blending:T.AdditiveBlending}));
 tail.visible=false;group.add(tail);group.userData.tail=tail;group.userData.arcs=arcs;
 return group;
}

const back=new T.Vector3(),center=new T.Vector3(),trailCenter=new T.Vector3(),projectedA=new T.Vector3(),projectedB=new T.Vector3(),viewDirection=new T.Vector3(),scale=new T.Vector3();
export function orientGravityTrail(group,projectile,camera){
 const tail=group.userData.tail;if(!tail)return;
 tail.visible=!!projectile.launched&&!projectile.done;
 if(!tail.visible)return;
 back.copy(projectile.from).sub(projectile.target);
 // The simulation adds sin(f*pi)*1.2 to the path; use its current tangent.
 const f=T.MathUtils.clamp(projectile.age/Math.max(.001,projectile.flight),0,1);
 back.y-=Math.PI*1.2*Math.cos(f*Math.PI);
 if(back.lengthSq()<1e-8){tail.visible=false;return;}back.normalize();
 group.updateWorldMatrix(true,false);group.getWorldPosition(center);group.getWorldScale(scale);
 trailCenter.copy(center).addScaledVector(back,1.9);
 tail.position.copy(trailCenter);group.worldToLocal(tail.position);
 projectedA.copy(trailCenter).project(camera);projectedB.copy(trailCenter).add(back).project(camera);
 const dx=(projectedB.x-projectedA.x)*camera.aspect,dy=projectedB.y-projectedA.y;
 viewDirection.copy(back).transformDirection(camera.matrixWorldInverse);
 const projectedLength=Math.hypot(viewDirection.x,viewDirection.y);
 if(!Number.isFinite(dx+dy)||projectedLength<.02){tail.visible=false;return;}
 tail.material.rotation=Math.atan2(dy,dx)-Math.PI/2;
 tail.scale.set(1.25/scale.x,5.6*projectedLength/scale.y,1);
}

export function updateGravityRock(group,projectile,time,camera,caster,castAge,formation){
 group.position.copy(projectile.pos);group.rotation.set(time+projectile.i,time*.7+projectile.i,0);
 group.scale.setScalar(projectile.launched?1.1:formation);
 group.userData.lightningTime.value=time;
 const discharge=Math.pow(.5+.5*Math.sin(time*15+projectile.i*2.3),4);
 group.userData.aura.scale.setScalar((projectile.launched?2.9:3.4)+discharge*.57);
 group.userData.aura.material.opacity=.46+discharge*.43;
 const tether=group.userData.tether;
 const lift=T.MathUtils.smoothstep(castAge,1.98,2.30)*(1-T.MathUtils.smoothstep(castAge,3.05,3.75));
 const release=T.MathUtils.smoothstep(castAge,5.08,5.40)*(1-T.MathUtils.smoothstep(castAge,5.70,6.10));
 tether.visible=!!caster&&!projectile.launched&&(lift+release)*discharge>.065;
 if(tether.visible){
   const u=tether.material.uniforms;u.anchor.value.copy(caster);u.anchor.value.y+=2.1;group.worldToLocal(u.anchor.value);
   const separation=u.anchor.value.length();
   u.age.value=time;u.strength.value=(lift+release)*(.24+.62*discharge)*(1-T.MathUtils.smoothstep(separation,3.2,6.5));
   tether.visible=u.strength.value>.025;
 }
 for(const arc of group.userData.arcs)arc.material.opacity=arc.userData.baseOpacity*(.86+.59*discharge);
 orientGravityTrail(group,projectile,camera);
}

// The two blades tear an oblique path out of the floor before the separate
// rocks are suspended. Both ends live in world space as the caster leaves.
export function createGravityHeave(){
 const positions=[],uv=[],lanes=[],indices=[];
 for(let lane=0;lane<68;lane++)for(let j=0;j<=32;j++){
  const n=positions.length/3;
  for(const side of [-1,1]){positions.push(0,0,0);uv.push(j/32,side);lanes.push(lane);}
  if(j<32)indices.push(n,n+1,n+2,n+2,n+1,n+3);
 }
 const geometry=new T.BufferGeometry();geometry.setIndex(indices);
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 geometry.setAttribute('lane',new T.Float32BufferAttribute(lanes,1));
 const age={value:0},power={value:0},departure={value:0},reach={value:new T.Vector3()};
 const stoneEnds={value:Array.from({length:10},()=>new T.Vector3())};
 const material=new T.ShaderMaterial({uniforms:{age,power,departure,reach,stoneEnds},side:T.DoubleSide,forceSinglePass:true,depthWrite:false,transparent:true,blending:T.AdditiveBlending,
  vertexShader:`uniform float age,departure;uniform vec3 reach,stoneEnds[10];attribute float lane;
   varying vec2 q;varying float filament,eyeDistance,phase;
   void main(){q=uv;float f=q.x,parent=lane<32.?lane:12.+mod(lane-32.,20.);
    phase=parent*2.399963;filament=step(12.,lane);
    float branch=step(32.,lane);
    vec3 endPoint=mix(reach,stoneEnds[int(mod(parent,10.))],smoothstep(2.69,2.96,age));
    // Discharges tear through the soil locally as the rocks leave it.
    float reachLimit=3.4+1.65*fract(parent*.41)+departure*(17.+4.*fract(parent*.53));
    endPoint*=min(1.,reachLimit/max(.001,length(endPoint)));
    float u=mix(f,.14+.42*fract(lane*.431)+f*(.18+.20*fract(lane*.37)),branch);
    float a=phase+u*(1.4+.37*mod(parent,5.))-age*2.1;
    float pulse=floor(age*(13.+mod(parent,3.)));
    float cell=floor(u*13.),piece=fract(u*13.);
    float j0=fract(sin(phase*31.+cell*29.+pulse*6.7)*4381.97)-.5;
    float j1=fract(sin(phase*31.+(cell+1.)*29.+pulse*6.7)*4381.97)-.5;
    float jag=mix(j0,j1,piece)*sin(u*3.14159)*(.67+min(length(reach)*.12,1.42));
    float footprint=(1.-u)*(.48+mod(parent*7.,13.)*.19);
    vec3 p=mix(vec3(cos(phase)*footprint,.10,sin(phase)*footprint),endPoint,u);
    float spread=sin(u*3.14159)*(1.10+.45*sin(phase))*(1.-.55*departure);
    float fork=branch*f*(.65+.72*fract(lane*.19))*(mod(lane,2.)*2.-1.);
    p+=vec3(cos(a)*(spread+jag+fork),spread*.28+jag*.63,sin(a)*(spread-jag-fork));
    vec3 v=(modelViewMatrix*vec4(p,1.)).xyz;
    vec3 tangent=(modelViewMatrix*vec4(endPoint+vec3(.01,.55,.01),0.)).xyz;
    vec3 side=cross(tangent,normalize(-v));
    float flash=smoothstep(2.93,3.04,age)*(1.-smoothstep(3.22,3.50,age));
    v+=side/max(length(side),.001)*q.y*mix((.19+.07*sin(phase))*(1.+.38*flash),.032+.013*cos(phase),filament);
    eyeDistance=-v.z;gl_Position=projectionMatrix*vec4(v,1.);}`,
  fragmentShader:`uniform float age,power;varying vec2 q;varying float filament,eyeDistance,phase;
   void main(){float center=max(0.,1.-abs(q.y));float broken=.5+.5*sin(q.x*31.-age*12.+phase+1.3*sin(q.x*52.+phase));
    float ends=smoothstep(0.,.065,q.x)*(1.-smoothstep(.79,1.,q.x));
    float leader=fract(age*4.+phase*.11);
    float hot=exp(-abs(leader-q.x)*9.);
    float glow=pow(center,mix(1.7,3.,filament))*mix(.20+.55*broken,.39+.63*broken+hot,filament);
    float flash=smoothstep(2.93,3.04,age)*(1.-smoothstep(3.22,3.50,age));
    float scatter=(1.-filament)*flash*pow(center,2.)*(.40+.60*broken);
    vec3 color=mix(mix(vec3(.81,.24,1.74),vec3(1.65,.35,.87),.5+.5*sin(phase)),vec3(2.30,1.53,2.55),max(filament*pow(center,3.),.28*scatter));
    glow+=scatter*.35;
    gl_FragColor=vec4(color,glow*ends*power*smoothstep(1.8,6.,eyeDistance));}`});
 const mesh=new T.Mesh(geometry,material);mesh.name='ground-to-blade-gravity';mesh.visible=false;mesh.frustumCulled=false;
 mesh.userData.update=(elapsed,start,blade,rocks,firstCast=false)=>{
  age.value=elapsed;
  departure.value=firstCast?T.MathUtils.smoothstep(elapsed,2.92,3.08):0;
  const charge=T.MathUtils.smoothstep(elapsed,1.44,1.91)*(1-T.MathUtils.smoothstep(elapsed,2.28,2.63));
  const heave=T.MathUtils.smoothstep(elapsed,2.54,2.91)*(1-T.MathUtils.smoothstep(elapsed,firstCast?3.20:3.07,firstCast?3.65:3.41));
  const streak=firstCast?T.MathUtils.smoothstep(elapsed,2.93,3.04)*(1-T.MathUtils.smoothstep(elapsed,3.17,3.51)):0;
  power.value=.16*charge+.61*heave+.26*streak;mesh.visible=power.value>.006;
  if(mesh.visible){
    mesh.position.copy(start);reach.value.copy(blade).sub(start);
    for(let i=0;i<stoneEnds.value.length;i++)stoneEnds.value[i].copy(rocks?.[i%rocks.length]?.pos??blade).sub(start);
  }
  return power.value;
 };
 return mesh;
}

// On impact the pale electrical flash shows through a short, dark plume.
// Anchored to each actual projectile landing, including off-camera misses.
export function createRockImpact(point,index,texture){
 const group=new T.Group();group.position.copy(point);group.name='gravity-rock-impact';
 const t={value:0},n=13,transform=new T.Object3D(),seed=index*2.39996;
 const cloudMaterial=new T.ShaderMaterial({
   uniforms:{age:t,smoke:{value:texture}},transparent:true,depthWrite:false,
   vertexShader:`uniform float age;varying vec2 q;varying float offset;varying float distanceToEye;
     void main(){q=uv;vec3 center=instanceMatrix[3].xyz;offset=fract(center.x*7.1+center.z*4.3);
       center.xz*=1.+age*(1.45+offset);center.y+=age*(.7+offset*1.7);
       vec4 eye=modelViewMatrix*vec4(center,1.);
       eye.xy+=position.xy*(1.25+offset*1.18)*(.57+smoothstep(0.,.25,age));
       distanceToEye=-eye.z;gl_Position=projectionMatrix*eye;
     }`,
   fragmentShader:`uniform sampler2D smoke;uniform float age;varying vec2 q;varying float offset;varying float distanceToEye;
     void main(){float a=texture2D(smoke,q).a;
       float pulse=(1.-smoothstep(.06,.32,age))*(.4+.6*offset);
       vec3 base=mix(vec3(.024,.013,.032),vec3(.105,.067,.13),offset);
       vec3 lit=mix(base,vec3(.55,.29,.75),pulse);
       float life=smoothstep(0.,.04,age)*(1.-smoothstep(.36,.92,age));
       gl_FragColor=vec4(lit,a*life*.90*smoothstep(.28,1.25,distanceToEye));}`,
 });
 const clouds=new T.InstancedMesh(new T.PlaneGeometry(1,1),cloudMaterial,n);
 for(let i=0;i<n;i++){
   const a=seed+i*2.39996,r=(i%5)*.23;
   transform.position.set(Math.sin(a)*r,.07+(i%4)*.26,Math.cos(a)*r);
   transform.updateMatrix();clouds.setMatrixAt(i,transform.matrix);
 }
 clouds.frustumCulled=false;group.add(clouds);
 // One static instance per fragment; launch speed, spin, and landing time
 // are evaluated from the contact clock in the vertex shader.
 const count=196,shape=new T.IcosahedronGeometry(1,1),surface=shape.attributes.position;
 for(let i=0;i<surface.count;i++){
   const x=surface.getX(i),y=surface.getY(i),z=surface.getZ(i);
   const fault=.85+.15*Math.sin(3.9*x+1.2*z)*Math.cos(5.7*y-2.1*x);
   surface.setXYZ(i,(x+.19*y)*fault,(y*.65+.11*z)*fault,z*.79*fault);
 }
 shape.computeVertexNormals();
 const flight=new Float32Array(count*4),spin=new Float32Array(count*4);
 const stone=new T.MeshStandardMaterial({roughness:.99,color:0xb0ada5});
 stone.onBeforeCompile=shader=>{
   shader.uniforms.fractureTime=t;
   shader.fragmentShader='varying vec3 chipSurface;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',"#include <color_fragment>\nfloat bedding=sin(chipSurface.y*29.+sin(chipSurface.x*13.+chipSurface.z*6.));diffuseColor.rgb*=.88+.105*bedding+.075*cos(dot(chipSurface,vec3(28.,41.,35.)));");
   shader.vertexShader='varying vec3 chipSurface; uniform float fractureTime; attribute vec4 fragmentFlight,fragmentSpin;\n'+shader.vertexShader;
   const rotation='float angle=fragmentSpin.y+fractureTime*fragmentSpin.z;float c=cos(angle),s=sin(angle);mat2 turn=mat2(c,s,-s,c);';
   shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n'+rotation+'objectNormal.xy=turn*objectNormal.xy;');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
     float u=max(0.,fractureTime-fragmentSpin.x);
     float hit=fragmentFlight.y/11.5;
     float air=min(hit,u);
     vec3 travel=vec3(fragmentFlight.x*air,fragmentFlight.y*air-11.5*air*air,fragmentFlight.z*air);
     float rest=max(0.,u-hit);
     travel.xz+=fragmentFlight.xz*.085*(1.-exp(-rest*8.));
     float size=fragmentFlight.w*step(fragmentSpin.x,fractureTime)*(1.-smoothstep(1.0,1.38,fractureTime));
     chipSurface=position;
     float eyeDepth=-(modelViewMatrix*instanceMatrix*vec4(travel,1.)).z;size*=smoothstep(.28,1.75,eyeDepth);
     transformed.xy=turn*transformed.xy;transformed=transformed*size+travel+vec3(0.,size*.39,0.);`);
 };
 stone.customProgramCacheKey=()=>'ballistic-gravity-chips';
 const shards=new T.InstancedMesh(shape,stone,count),pigment=new T.Color();
 for(let i=0;i<count;i++){
   const a=seed+i*2.39996,rad=(i%9)*.07;
   const speed=2.5+((i*29+index*7)%97)/97*11.7;
   const lift=3.4+((i*37+index*3)%89)/89*9.4;
   const size=i%29===0?.36+.075*(i%3):i%5===0?.16+(i%4)*.047:.038+.018*(i%7);
   flight.set([Math.sin(a)*speed,lift,Math.cos(a)*speed,size],i*4);
   spin.set([(i%7)*.012,a,2.4+(i%8)*.92,0],i*4);
   transform.rotation.set(0,a*.37,0);transform.position.set(Math.sin(a)*rad,.02,Math.cos(a)*rad);
   transform.scale.set(1,.76+(i%5)*.085,.64+(i%4)*.12);transform.updateMatrix();shards.setMatrixAt(i,transform.matrix);
   const k=.26+(i%9)*.074;pigment.setRGB(k*(i%4===0?.73:.91),k*.88,k*(i%4===0?.93:.84));shards.setColorAt(i,pigment);
 }
 shape.setAttribute('fragmentFlight',new T.InstancedBufferAttribute(flight,4));
 shape.setAttribute('fragmentSpin',new T.InstancedBufferAttribute(spin,4));
 shards.boundingSphere=new T.Sphere(new T.Vector3(0,2,0),20);group.add(shards);
 group.userData.updateRockImpact=age=>{t.value=age;};
 return {o:group,kind:'rock-impact',life:1.4,max:1.4};
}
