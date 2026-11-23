import * as T from "game/lib/three.module.js";

// Light travels along the real attack paths. A hot advancing section
// decays into an interrupted gold trace while the existing particles linger.
function dressHolyTrace(mesh,time){
 const material=mesh.material, ids=new Float32Array(mesh.count);
 for(let i=0;i<ids.length;i++)ids[i]=i;
 mesh.geometry.setAttribute('holyLane',new T.InstancedBufferAttribute(ids,1));
 material.onBeforeCompile=shader=>{
   shader.uniforms.traceAge=time;
   shader.vertexShader='attribute float holyLane;varying vec2 traceCoord;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
     '#include <begin_vertex>\ntraceCoord=vec2(uv.y,holyLane);');
   shader.fragmentShader='varying vec2 traceCoord;uniform float traceAge;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
     float f=mix(traceCoord.x,1.-traceCoord.x,mod(traceCoord.y,2.));
     float lead=(traceAge-.051*mod(traceCoord.y,5.))*(1.5+.13*mod(traceCoord.y,3.));
     float struck=smoothstep(-.04,.05,lead-f);
     float hot=exp(-8.*abs(lead-f));
     float fleck=.5+.5*sin(f*38.+traceCoord.y*2.+sin(f*12.));
     diffuseColor.a*=mix(.16,.58+.29*fleck,struck)+hot*.78;
     outgoingLight*=mix(vec3(1.,.88,.64),vec3(1.60,1.49,1.14),hot);
     #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=> 'traveling-holy-trace';
}

// Selected source 72.75-75.25 s: lingering, crossing fine cores, soft gold
// ribbons and drifting sparks during the lateral phantom attack. These are
// world-space traces of that attack; neither the camera nor replay time drives them.
export function createHolyBarrage(origin,yaw,texture,hovering=false){
 if(hovering)return createHoverField(origin,yaw,texture);
 const pulse={value:0};
 const group=new T.Group();group.name='holy-barrage';group.position.copy(origin);group.rotation.y=yaw;
 const cylinder=new T.CylinderGeometry(1,1,1,5),dummy=new T.Object3D(),up=new T.Vector3(0,1,0);
 const layers=[
  {width:.018,opacity:.95,color:0xfffae8},
  {width:.075,opacity:.16,color:0xffdd91},
  {width:.28,opacity:.045,color:0xffce66}
 ];
 // Shared geometry is disposed once by Effects.clear()/tick().
 for(const [layer,settings] of layers.entries()){
  const geometry=layer===0?cylinder:cylinder.clone();
  const material=new T.MeshBasicMaterial({color:settings.color,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending});
  const beams=new T.InstancedMesh(geometry,material,18);beams.userData.opacityScale=settings.opacity;
  for(let i=0;i<18;i++){
   // The source has intersecting inclined paths, not a stack of level rings.
   // Keep the inclination in the attack's world frame; it must not face or
   // reorient itself toward the player's camera.
   const sign=i%2?1:-1,angle=sign*(.48+(i%3)*.10);
   const direction=new T.Vector3(Math.cos(angle),sign*(.13+(i%3)*.045),Math.sin(angle));
   // The player can run through/past the phantom's initial target. The light
   // paths cross both sides of that point, rather than ending behind them.
   dummy.position.set(Math.sin(i*2.4)*3,.38+(i%5)*.68,-12+Math.floor(i/2)*6);
   dummy.quaternion.setFromUnitVectors(up,direction.normalize());dummy.scale.set(settings.width,58,settings.width);dummy.updateMatrix();beams.setMatrixAt(i,dummy.matrix);
  }
  dressHolyTrace(beams,pulse);beams.computeBoundingSphere();group.add(beams);
 }
 const positions=new Float32Array(288*3),base=new Float32Array(288*3),colors=new Float32Array(288*3);
 for(let i=0;i<288;i++){
  base[i*3]=((i*73%293)/293-.5)*42;base[i*3+1]=.25+(i*31%277)/277*4.8;base[i*3+2]=-16+(i*109%281)/281*54;
 }
 positions.set(base);const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));
 const sparks=new T.Points(geometry,new T.PointsMaterial({color:0xffecb4,map:texture,size:.12,vertexColors:true,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
 sparks.userData.opacityScale=.8;group.add(sparks);
 group.userData.updateBarrage=elapsed=>{
  pulse.value=elapsed;
  for(let i=0;i<288;i++){
   positions[i*3]=base[i*3]+Math.sin(elapsed*.6+i)*.18;positions[i*3+1]=base[i*3+1]+Math.sin(elapsed*.8+i*2.4)*.16;
   const glow=.22+.78*Math.pow(.5+.5*Math.sin(elapsed*5+i*1.73),6);colors[i*3]=colors[i*3+1]=colors[i*3+2]=glow;
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
 };
 group.userData.updateBarrage(0);return group;
}

// Primary 71.6-76 s. The ground signal marks one location. Golden sheets
// sweep through the approaching player's path and taper to fine slanted lines.
function createHoverField(origin,yaw,texture){
 const pulse={value:0};
 const group=new T.Group();group.name='hovering-holy-field';group.position.copy(origin);group.rotation.y=yaw;
 const transform=new T.Object3D(),up=new T.Vector3(0,1,0),direction=new T.Vector3(),color=new T.Color();
 const paths=Array.from({length:12},(_,i)=>({
  z:-5+Math.floor(i/2)*4.4,angle:(i%2?1:-1)*(.26+(i%3)*.13),
  pitch:(i%2?1:-1)*(.045+(i%4)*.037),y:.22+(i%4)*.39,start:.17+i*.16+(i%3)*.04,
 }));
 // Interleave the lower fans with a second, higher crossing behind the runner.
 // Their first lengths spread from the marked area, then remain in the arena.
 for(let i=0;i<6;i++){
   const side=i%2?1:-1;
   paths.push({z:-1+Math.floor(i/2)*6.2,angle:side*(.49+.073*(i%3)),pitch:side*(.09+.031*i),
     y:.44+(i%3)*.96,start:.46+i*.29});
 }
 const layers=[[.013,.93,0xfff4d7],[.053,.32,0xffda85],[.17,.055,0xffb95c]].map(([width,opacity,hex])=>{
  const material=new T.MeshBasicMaterial({color:hex,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false});
  const mesh=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,5),material,paths.length);
  mesh.frustumCulled=false;dressHolyTrace(mesh,pulse);mesh.userData.opacityScale=opacity;group.add(mesh);return {mesh,width};
 });
 const ribbons=[];
 for(let j=0;j<7;j++){
  const verts=[],colors=[],idx=[];
  const angle=(j%2?1:-1)*(.35+j*.054),ax=Math.cos(angle),az=Math.sin(angle);
  for(let i=0;i<=40;i++){
   const f=i/40,x=(f-.5)*47,z=-3+j*4.2+.45*Math.sin(f*7+j);
   for(const e of [-1,0,1]){
    verts.push(ax*x-az*e*.09,.25+(j%3)*.52+x*(j%2?-.11:.1)+e*(.12+(j%3)*.12)+.10*Math.sin(f*12+j),z+az*x+ax*e*.09);
    const v=e===0?Math.sin(Math.PI*f)**.38:0;colors.push(v*1.15,v*.80,v*.36);
   }
   if(i){const n=i*3;for(let k=0;k<2;k++)idx.push(n-3+k,n+k,n+k+1,n-3+k,n+k+1,n-2+k);}
  }
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(verts,3));geom.setAttribute('color',new T.Float32BufferAttribute(colors,3));geom.setIndex(idx);
  const ribbon=new T.Mesh(geom,new T.MeshBasicMaterial({vertexColors:true,transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));
  group.add(ribbon);ribbons.push(ribbon);
 }
 const positions=new Float32Array(180*3),base=new Float32Array(positions.length),colors=new Float32Array(positions.length);
 for(let i=0;i<180;i++){base[i*3]=((i*73%181)/181-.5)*30;base[i*3+1]=.18+(i*31%175)/175*4.0;base[i*3+2]=-10+(i*109%179)/179*38;}
 const sparkGeo=new T.BufferGeometry();sparkGeo.setAttribute('position',new T.BufferAttribute(positions,3));sparkGeo.setAttribute('color',new T.BufferAttribute(colors,3));
 const sparks=new T.Points(sparkGeo,new T.PointsMaterial({map:texture,color:0xffdf93,vertexColors:true,size:.07,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));sparks.frustumCulled=false;sparks.userData.opacityScale=.84;group.add(sparks);
 group.userData.updateBarrage=t=>{
  pulse.value=t;
  for(let i=0;i<paths.length;i++){
   const path=paths[i],age=t-path.start,fade=T.MathUtils.smoothstep(age,0,.24)*(1-T.MathUtils.smoothstep(t,3.7,4.5));
   const travel=Math.min(1,Math.max(0,age)/1.4);
   direction.set(Math.cos(path.angle),path.pitch,Math.sin(path.angle)).normalize();
   transform.position.set(Math.sin(i*2.4)*2+(travel-.5)*1.8,path.y,path.z+(travel-.5)*1.2);
   transform.quaternion.setFromUnitVectors(up,direction);color.setScalar(fade*(.66+.34*Math.sin(t*2+i)**2));
   const beamWidth=.68+.37*Math.sin(i*2.39)**2;
   for(const {mesh,width} of layers){transform.scale.set(width*beamWidth,12+40*travel,width*beamWidth);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);mesh.setColorAt(i,color);}
  }
  for(const {mesh} of layers){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
  ribbons.forEach((r,i)=>{const age=t-i*.44;r.userData.opacityScale=.68*T.MathUtils.smoothstep(age,0,.20)*(1-T.MathUtils.smoothstep(age,.62,2.25));r.position.z=Math.max(0,age)*.76;});
  for(let i=0;i<180;i++){const k=i*3;positions[k]=base[k]+Math.sin(t*.9+i)*.14;positions[k+1]=base[k+1]+t*.09;positions[k+2]=base[k+2];const v=Math.pow(.5+.5*Math.sin(t*5.7+i*2.4),8);colors[k]=colors[k+1]=colors[k+2]=v;}
  sparkGeo.attributes.position.needsUpdate=true;sparkGeo.attributes.color.needsUpdate=true;
 };
 group.userData.updateBarrage(0);return group;
}
