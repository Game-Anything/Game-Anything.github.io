import * as T from "game/lib/three.module.js";
import {mergeGeometries,mergeVertices} from "game/lib/addons/utils/BufferGeometryUtils.js";
import {addStaticInstances,addTileLevels} from "game/src/static-instances.js";
import {MeshoptSimplifier} from "game/lib/addons/libs/meshopt_simplifier.module.js";
import {leafFrieze} from "game/src/tower-carving.js";
import {ARENA,ringPoint,polar,vnoise,lcg} from "game/src/arena-layout.js";
// Architecture of the round terrace, rebuilt from the recordings:
//   gate    two ragged slabs of fused figures on a broad heaped hill, a narrow cleft, a wide worn stair
//   rail    plinth with a blind arcade, pierced balustrade, posts carrying robed statues
//   columns colossal fluted shafts on octagonal pedestals standing outside the rail
//   rubble  fallen drums and blocks along the foot of the wall
const smooth=T.MathUtils.smoothstep,clamp=T.MathUtils.clamp;
const UP=new T.Vector3(0,1,0);
const flat=g=>g.index?g.toNonIndexed():g;
const join=list=>{const g=mergeGeometries(list.map(flat));list.forEach(x=>x.dispose());return g;};
function hash3(x,y,z){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,987643213);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function vnoise3(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf),mix=(a,b,t)=>a+(b-a)*t;
  return mix(mix(mix(hash3(xi,yi,zi),hash3(xi+1,yi,zi),u),mix(hash3(xi,yi+1,zi),hash3(xi+1,yi+1,zi),u),v),
             mix(mix(hash3(xi,yi,zi+1),hash3(xi+1,yi,zi+1),u),mix(hash3(xi,yi+1,zi+1),hash3(xi+1,yi+1,zi+1),u),v),w);
}
function fbm3(x,y,z,octaves=3){let a=.5,s=0,n=0;for(let i=0;i<octaves;i++){s+=a*vnoise3(x,y,z);n+=a;x=x*2.03+17.1;y=y*2.03+9.7;z=z*2.03+3.3;a*=.5;}return s/n;}

// ---------------------------------------------------------------- gate piers
// Each pier is a tall slab about 21 m wide and 15 m deep.  Its surface is made
// of vertical cords and bulges; the top is torn and slanted.  `inner` is +1
// when the cleft lies on the pier's +x side.
// A lower apron fans outward while the two inner walls remain almost plumb.
// The torn crown of each mound rises on the OUTSIDE of the cleft. Following
// the local roof across the cap preserves that wedge from oblique viewpoints.
function pierSurface(s){
  return (a,yn,out=new T.Vector3())=>{
    const ca=Math.cos(a),sa=Math.sin(a),y=clamp(yn,0,s.height),k=y/s.height;
    const cap=1-smooth(yn,s.height,s.height+9);
    const sx=Math.sign(sa)*Math.pow(Math.abs(sa),.70)*cap;
    const sz=Math.sign(ca)*Math.pow(Math.abs(ca),.76)*cap;
    const across=.5+.5*s.inner*sx,foot=1-smooth(y,9,34);
    const outer=20.25+10.2*foot+1.85*Math.sin(Math.PI*k);
    const inner=2.61+.84*(1-smooth(y,14,36))+.53*smooth(y,20,33)+.63*smooth(y,42,68)
      +.38*Math.sin(y*.185+s.seed)+.21*Math.sin(y*.38+s.seed*.75);
    const depth=7.25+4.9*foot+1.30*Math.sin(Math.PI*k);
    const chord=ya=>fbm3(ca*1.8+s.seed,sa*1.8,ya*.082);
    // Discontinuous laminae and longer vertical masses under the fused bodies.
    const warp=1.55*Math.sin(y*.072+s.seed+ca*2)+.66*Math.sin(y*.159+sa*3);
    const flute=Math.pow(.5+.5*Math.cos(12*a+warp+s.seed),3.3);
    const split=Math.pow(.5+.5*Math.cos(23*a+1.7*warp),4.2);
    const bias=2.4*ca+3.2*sa+1.5*Math.sin(3*a+s.seed);
    const fault=Math.abs(Math.sin(.119*y+bias+s.seed*.8));
    const cut=(1-smooth(fault,.04,.22))*smooth(chord(y+10),.33,.59);
    const fold=(chord(y)-.5)*4.25+1.20*flute+.44*split-.40-1.55*cut;
    const seam=(fbm3(ca*8,sa*8+s.seed,y*.43)-.5)*1.24;
    const atCleft=smooth(s.inner*sa,.38,.93);
    const displacement=(fold+seam)*cap*(1-.72*atCleft);
    const x=-s.inner*(outer+(inner-outer)*across)+sa*displacement+
      cap*(.36*Math.sin(y*.11+s.seed)+.18*Math.sin(y*.24));
    const z=s.cz+sz*depth+ca*displacement+cap*.82*Math.sin(y*.055+s.seed*2);
    const stone=fbm3(x*.28,z*.26,s.seed);
    const broadBreak=3.1*Math.exp(-((across-.42)**2)/.0048)+1.65*Math.exp(-((across-.71)**2)/.0026);
    const outerTip=.85*(1-smooth(across,.04,.20))+1.54*vnoise(7.2*across+s.seed,sz*3.7);
    const crestLoss=s.slant*Math.pow(across,1.14)+broadBreak+outerTip+2.5*Math.abs(sz)+5.1*(1-stone);
    const surfaceY=y-smooth(y,35,s.height)*crestLoss;
    const clear=2.21+.52*smooth(surfaceY,20,33)+.28*Math.sin(surfaceY*.23+s.seed);
    return out.set(-s.inner*Math.max(clear,-s.inner*x),surfaceY,z);
  };
}
function pierGeometry(surface,height,NA=128,NY=118){
  const count=(NA+1)*(NY+1),pos=new Float32Array(count*3),uv=new Float32Array(count*2),index=[],v=new T.Vector3();
  for(let j=0;j<=NY;j++)for(let i=0;i<=NA;i++){
    const a=-Math.PI+i/NA*Math.PI*2,yn=j/NY*(height+9),q=j*(NA+1)+i;
    surface(a,yn,v);pos[q*3]=v.x;pos[q*3+1]=v.y;pos[q*3+2]=v.z;uv[q*2]=i/NA*10;uv[q*2+1]=yn/7;
    if(j<NY&&i<NA)index.push(q,q+1,q+NA+1,q+1,q+NA+2,q+NA+1);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
  return g;
}
// On the independent cinematic's near face the bodies cling to exposed,
// broken ribs. Some stretch from the talus to the rim; others run crosswise
// over the face, with the broken ledges visible through the soft atmosphere.
function gateRibs(surface,spec){
  const pos=[],uv=[],indices=[],normal=new T.Vector3(),side=new T.Vector3();
  const stepsAcross=7;
  function strip(sample,width,height){
    const centres=[],radials=[],steps=32;
    for(let i=0;i<=steps;i++){
      const [angle,y]=sample(i/steps);
      centres.push(surface(angle,y));radials.push(new T.Vector3(Math.sin(angle),0,Math.cos(angle)));
    }
    const start=pos.length/3;
    for(let i=0;i<=steps;i++){
      const t=i/steps,envelope=.13+.87*Math.pow(Math.sin(t*Math.PI),.45);
      const centre=centres[i],tangent=centres[Math.min(i+1,steps)].clone().sub(centres[Math.max(0,i-1)]).normalize();
      normal.copy(radials[i]).addScaledVector(tangent,-radials[i].dot(tangent)).normalize();
      side.crossVectors(normal,tangent);
      const weather=.82+.40*vnoise(centre.x*.58,centre.y*.52+spec.seed);
      for(let j=0;j<=stepsAcross;j++){
        const a=(j/stepsAcross-.5)*Math.PI,vertex=centre.clone();
        vertex.addScaledVector(side,Math.sin(a)*width*envelope*weather);
        vertex.addScaledVector(normal,(Math.pow(Math.cos(a),.58)*height*envelope-.16)*weather);
        pos.push(vertex.x,vertex.y,vertex.z);uv.push(t*5,j/stepsAcross);
        if(i<steps&&j<stepsAcross){
          const k=start+i*(stepsAcross+1)+j;
          indices.push(k,k+stepsAcross+1,k+1,k+1,k+stepsAcross+1,k+stepsAcross+2);
        }
      }
    }
  }
  // Overlapping fragments leave exposed flats between the broken beds.
  for(let k=0;k<25;k++){
    const seed=spec.seed+k*3.61,a=(k%8-3.5)*.38+.21*Math.sin(seed);
    const y0=8+Math.floor(k/8)*14+7*vnoise(seed,22);
    const extent=7+13*vnoise(seed,3),sweep=(vnoise(seed,27)-.5)*.75;
    strip(t=>[a+sweep*t+.065*Math.sin(4*t+seed),y0+t*extent],
      .88+1.26*vnoise(seed,7),.33+.52*vnoise(seed,6));
  }
  // Broken transverse beds of material, separated by deep recesses. They are
  // short offset fragments, never complete collars around the gateway.
  for(let k=0;k<8;k++){
    const seed=k+spec.seed,row=Math.floor(k/2),half=k%2;
    const a0=(half?-0.06:-1.56)+.23*Math.sin(seed*7),arc=.65+.82*vnoise(seed*2,13);
    const y0=spec.height*(.39+row*.14)+2.0*Math.sin(seed);
    strip(t=>[a0+t*arc*.82,y0+2.7*Math.sin(t*3.7+seed)-t*(2.4+row*.83)],.65+.46*vnoise(seed,28),.31+.32*vnoise(seed,14));
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  return g;
}
// One low-polygon bent figure, about 1.9 m long, lying in its local XY plane with +Z outward.
function limbSegment(a,b,r,tip=.85){
  const g=new T.CylinderGeometry(r*tip,r,1,5,1,true);g.translate(0,.5,0);
  const d=new T.Vector3().subVectors(b,a),length=d.length();
  return g.applyMatrix4(new T.Matrix4().compose(a,new T.Quaternion().setFromUnitVectors(UP,d.normalize()),new T.Vector3(1,length,1)));
}
function figureGeometry(rnd,pose){
  const parts=[],V=(x,y,z)=>new T.Vector3(x,y,z);
  const twist=[-.28,.31,-.40][pose];
  // The silhouettes of the fused figures remain visible against the sky.
  // Give each relief a narrow neck, shoulder blades, cinched middle and hips.
  const profile=[[-.34,.11],[-.24,.237],[-.08,.174],[.16,.224],[.29,.275],[.37,.19],[.413,.074]];
  const torso=new T.LatheGeometry(profile.map(([y,r])=>new T.Vector2(r,y)),7);
  const body=torso.attributes.position;
  for(let i=0;i<body.count;i++){
    const y=body.getY(i),t=(y+.34)/.753,x=body.getX(i),z=body.getZ(i);
    body.setXYZ(i,x+twist*.43*(t*t-.30),y,z*.60+.07*Math.sin(t*Math.PI)-.065*t);
  }
  torso.computeVertexNormals();torso.rotateZ(twist);parts.push(torso);
  const headX=[.13,-.15,.22][pose],headZ=[.02,.08,.14][pose];
  const head=new T.IcosahedronGeometry(.155,0);head.scale(.79,1.20,.85);head.rotateZ(twist*.8);
  head.translate(headX,.535,headZ-.035);parts.push(head);
  for(const s of [-1,1]){
    const raised=pose===0?s===-1:pose===2?s===1:false;
    const shoulder=V(s*.24,.34,0),elbow=V(s*(.34+.14*rnd()),raised?.58:pose===1?.03:.22,.16+.10*rnd());
    const hand=elbow.clone().add(V(raised?-s*.10:pose===1?-s*.28:s*.22,raised?.34:.15-Math.abs(s*.25),.09));
    parts.push(limbSegment(shoulder,elbow,.094,.75),limbSegment(elbow,hand,.073,.53));
    const folded=pose===2||pose===1&&s===1;
    const hip=V(s*.12,-.32,0),knee=V(s*(.18+.18*rnd()),folded?-.43:-.77,folded?.44:.11);
    const foot=knee.clone().add(V(s*(rnd()-.5)*.25,folded?-.26:-.44,folded?-.36:-.10));
    parts.push(limbSegment(hip,knee,.123,.73),limbSegment(knee,foot,.091,.53));
  }
  const relief=join(parts),pos=relief.attributes.position,visible=[];
  for(let i=0;i<pos.count;i+=3){
    // The back of each relief is embedded in the opaque pier or hillside.
    if(pose===2||Math.max(pos.getZ(i),pos.getZ(i+1),pos.getZ(i+2))>-.035)visible.push(i,i+1,i+2);
  }
  relief.setIndex(visible);
  // Repeated instanced reliefs share vertices along each smooth stone face.
  const indexed=mergeVertices(relief,1e-6);
  relief.dispose();
  return indexed;
}
export function buildGate({scene,gateStone,ground,phase,adaptive=false}){
  const group=new T.Group();group.name='eroded-split-gateway';scene.add(group);
  // The original front face has broad ashen surfaces between the clusters.
  // Keep the stone normal/bump and the world's existing light response, with
  // less yellow fine-grain contrast than on the arena's brown masonry.
  const originalStone=gateStone;
  gateStone=originalStone.clone();gateStone.color.setHex(0x706d65);
  gateStone.customProgramCacheKey=()=>originalStone.customProgramCacheKey()+'-fused-ash';
  gateStone.onBeforeCompile=(shader,renderer)=>{
    originalStone.onBeforeCompile.call(originalStone,shader,renderer);
    shader.uniforms.gatePhase=phase;
    shader.fragmentShader='uniform float gatePhase;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader
      .replace('mix(.48,1.46,worn)*mix(.58,1.19,fissure)','mix(.48,1.33,worn)*mix(.57,1.16,fissure)')
      .replace('vec3(.105,.086,.054)*skyFacing','vec3(.037,.036,.034)*skyFacing')
      .replace('outgoingLight+=vec3(.030,.024,.018)','outgoingLight*=vec3(.78,.80,.83);outgoingLight+=vec3(.013,.012,.011)')
      .replace('#include <opaque_fragment>',`
        // Golden skylight reaches both piers. Keep local cuts visible without
        // throwing the whole face on the far side of the cleft into black.
        float rockY=dot(outgoingLight,vec3(.2126,.7152,.0722));
        float bedTone=.72+.40*chipped+.14*ledge-.13*crack;
        vec3 reflectedStone=vec3(1.095,.936,.745)*(.49*rockY+.063*bedTone);
        outgoingLight=mix(outgoingLight,reflectedStone,gatePhase*.92);
        #include <opaque_fragment>`);
  };
  const rnd=lcg(17339);
  const piers=[
    {cz:-88,height:71.8,seed:3.7,inner:1,slant:17.8},
    {cz:-87.4,height:75.6,seed:11.2,inner:-1,slant:22.3}
  ];
  const figures=[0,1,2].map(pose=>figureGeometry(rnd,pose)),perPier=705,onHill=550;
  const reliefs=figures.map(()=>[]),tones=figures.map(()=>[]);
  const dummy=new T.Object3D(),basis=new T.Matrix4(),p=new T.Vector3(),pa=new T.Vector3(),pb=new T.Vector3(),pc=new T.Vector3(),pd=new T.Vector3();
  const tu=new T.Vector3(),tv=new T.Vector3(),normal=new T.Vector3(),yAxis=new T.Vector3(),xAxis=new T.Vector3();
  let placed=0;
  const stamp=(point,n,along,size,sink,pose=placed%figures.length)=>{
    yAxis.copy(along).addScaledVector(n,-along.dot(n)).normalize();xAxis.crossVectors(yAxis,n).normalize();
    basis.makeBasis(xAxis,yAxis,n);dummy.quaternion.setFromRotationMatrix(basis);
    dummy.position.copy(point).addScaledVector(n,-sink*size);dummy.scale.set(size,size,size*.9);dummy.updateMatrix();
    reliefs[pose].push(dummy.matrix.clone());
    const value=.54+.44*vnoise(point.x*.8+point.z*.25,point.y*.6);
    tones[pose].push(value*1.025,value,value*.965);placed++;
  };
  for(const spec of piers){
    const surface=pierSurface(spec),mesh=new T.Mesh(pierGeometry(surface,spec.height),gateStone);
    mesh.name='gate-pier';mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);
    const ribs=new T.Mesh(gateRibs(surface,spec),gateStone);ribs.name='gate-broken-stone-beds';ribs.receiveShadow=true;group.add(ribs);
    let a0=0,y0=0,drift=0,step=0;
    for(let i=0;i<perPier;i++){
      // Groups of five form interlocked streams with an occasional crosswise
      // or overturned body. The underlying stone remains exposed between them.
      const member=i%5;
      if(!member){
        a0=(rnd()*2-1)*Math.PI*.86;const root=surface(a0,22),foot=Math.max(9,ground(root.x,root.z)-.6);
        step=1.10+rnd()*1.10;y0=foot+Math.pow(rnd(),.95)*(spec.height-foot-step*4);
        drift=(rnd()-.5)*.10;
      }
      const a=a0+member*drift+.06*(rnd()-.5),y=y0+member*step;
      surface(a,y,p);surface(a+.03,y,pa);surface(a-.03,y,pb);surface(a,y+.5,pc);surface(a,y-.5,pd);
      tu.subVectors(pa,pb);tv.subVectors(pc,pd);normal.crossVectors(tu,tv).normalize();
      if(normal.x*Math.sin(a)+normal.z*Math.cos(a)<0)normal.negate();
      const swing=rnd()<.27?rnd()*6.283:drift*10+(rnd()-.5)*1.16;
      tv.normalize().applyAxisAngle(normal,swing);
      // Most bodies read as shallow embedded relief at the distance of
      // the terrace. Leave only intermittent protruding silhouettes.
      // Bodies on the broad face recede into stone; the broken outer edge
      // catches the head and shoulders of the occasional exposed figure.
      const silhouette=Math.abs(Math.sin(a));
      const burial=.065+.13*vnoise(spec.seed+Math.sin(a)*5,y*.16)-.14*smooth(silhouette,.78,.99);
      const scale=1.46+rnd()*.96;
      const lip=smooth(spec.inner*Math.sin(a),.61,.98);
      stamp(p,normal,tv,scale,burial+.21*lip);
    }
    // Near the rim legs and raised arms break the negative space. These use
    // closed crouching figures which remain solid from the side and rear.
    for(let i=0;i<54;i++){
      const crown=i<30,sign=i%3?-spec.inner:spec.inner;
      const cluster=Math.floor(i/5);
      const crestAngle=-1.42+.51*cluster+.17*Math.sin(spec.seed+cluster);
      const a=crown?crestAngle+(rnd()-.5)*.26:sign*(1.26+.36*rnd());
      const y=crown?spec.height-(i%5===0?0:.3+rnd()*2.6):15+rnd()*(spec.height-15);surface(a,y,p);
      normal.set(Math.sin(a),0,Math.cos(a));tv.copy(UP).applyAxisAngle(normal,(rnd()-.5)*1.75);
      if(crown)p.y+=i%5===0?.67:.21;
      stamp(p,normal,tv,1.65+rnd()*(crown?1.48:.87),crown?.16:-.18,2);
    }
  }
  const pierCounts=reliefs.map(instances=>instances.length);
  // Figures heaped on the hill below the piers; they follow the ground the player walks on.
  let guard=0,count=0;
  while(count<onHill&&guard++<onHill*40){
    const phi=ARENA.hillFrom+rnd()*(ARENA.hillTo-ARENA.hillFrom),rho=ARENA.toe+2+Math.pow(rnd(),.8)*32;
    const yaw=phi*Math.PI/180,x=ARENA.cx+Math.sin(yaw)*rho,z=ARENA.cz-Math.cos(yaw)*rho;
    if(z<-89||Math.abs(x)<ARENA.lane+1.2)continue;
    const h=ground(x,z);if(h<.9)continue;
    const d=.35;normal.set(ground(x-d,z)-ground(x+d,z),2*d,ground(x,z-d)-ground(x,z+d)).normalize();
    const turn=rnd()*6.283;tv.set(Math.sin(turn),0,Math.cos(turn));
    const burial=.08+.12*vnoise(x*.31,z*.31);
    const crust=.10+.55*fbm3(x*.55,z*.55,3.1)*smooth(h,.6,4);
    stamp(p.set(x,h+crust-.06,z),normal,tv,1.25+rnd()*1.15,burial);count++;
  }
  // The independent low-angle shot shows silhouettes standing out from the
  // two long shoulders. Root a mixture of kneeling and leaning figures in
  // the ridge itself, with their legs disappearing into the mass below.
  for(const side of [-1,1]){
    for(let pile=0;pile<12;pile++){
      const bearing=side*(10+rnd()*(side<0?24:35))*Math.PI/180;
      const range=72+rnd()*9,count=2+Math.floor(rnd()*5);
      for(let i=0;i<count;i++){
        const phi=bearing+(rnd()-.5)*.052,rho=range+(rnd()-.5)*3.1;
        const x=ARENA.cx+Math.sin(phi)*rho,z=ARENA.cz-Math.cos(phi)*rho,h=ground(x,z);
        if(h<4)continue;
        normal.set(ground(x-.4,z)-ground(x+.4,z),.8,ground(x,z-.4)-ground(x,z+.4)).normalize();
        const a=rnd()*Math.PI*2;tv.set(Math.sin(a),.25,Math.cos(a));
        const size=1.63+rnd()*.95;
        stamp(p.set(x,h+size*(i===0?.51:.27),z),normal,tv,size,.10,2);
      }
    }
  }
  figures.forEach((geo,i)=>addStaticInstances(group,geo,gateStone,reliefs[i].slice(0,pierCounts[i]),'gate-fused-figures',false,65,
    new T.Float32BufferAttribute(tones[i].slice(0,pierCounts[i]*3),3)));
  // The hill wears the same dark fused mass as the piers; at its toe the skin sinks under the ash.
  {
    const from=ARENA.hillFrom-7,to=ARENA.hillTo+7,stepPhi=.88,r0=ARENA.toe-1.5,r1=104,nPhi=Math.round((to-from)/stepPhi),nRho=Math.ceil((r1-r0)/.8);
    const count=(nPhi+1)*(nRho+1),pos=new Float32Array(count*3),uv=new Float32Array(count*2),index=[];
    for(let j=0;j<=nRho;j++)for(let i=0;i<=nPhi;i++){
      const yaw=(from+i*(to-from)/nPhi)*Math.PI/180,rho=r0+j*(r1-r0)/nRho,x=ARENA.cx+Math.sin(yaw)*rho,z=ARENA.cz-Math.cos(yaw)*rho,q=j*(nPhi+1)+i;
      const h=ground(x,z),lane=1-smooth(Math.abs(x),ARENA.lane+.6,ARENA.lane+2.4);
      const heap=.10+.55*fbm3(x*.55,z*.55,3.1)*smooth(h,.6,4);
      pos[q*3]=x;pos[q*3+1]=h+heap-1.3*(1-smooth(h,.35,1.5))-2.2*lane;pos[q*3+2]=z;uv[q*2]=x/7;uv[q*2+1]=z/7;
      // The upward face covers the radial bank with fused stone. An inverted
      // strip exposes the sandy floor beneath the hill when viewed on-foot.
      if(j<nRho&&i<nPhi)index.push(q,q+1,q+nPhi+1,q+1,q+nPhi+2,q+nPhi+1);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
    // The talus has its own broken, powder-coated bedding. Mapping the
    // pier's vertical striations across the two banks stretched them down
    // the slope and left bright comb-like edges along the stairs.
    const talus=new T.MeshStandardMaterial({color:0x595950,roughness:.97,envMapIntensity:.46});
    talus.onBeforeCompile=shader=>{
      shader.uniforms.gatePhase=phase;
      shader.vertexShader='varying vec3 bankPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvec4 bankLocal=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nbankLocal=instanceMatrix*bankLocal;\n#endif\nbankPoint=(modelMatrix*bankLocal).xyz;');
      shader.fragmentShader=`varying vec3 bankPoint;uniform float gatePhase;
        float chipHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float grit(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          vec2 j=vec2(0.,1.);
          return mix(mix(mix(chipHash(i),chipHash(i+j.yxx),f.x),mix(chipHash(i+j.xyx),chipHash(i+j.yyx),f.x),f.y),
                     mix(mix(chipHash(i+j.xxy),chipHash(i+j.yxy),f.x),mix(chipHash(i+j.xyy),chipHash(i+1.),f.x),f.y),f.z);}
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float bed=grit(bankPoint*vec3(.42,.50,.39));
        float crust=grit(bankPoint*vec3(2.1,2.8,1.9)+2.*bed);
        float sand=grit(bankPoint*6.4);
        float scale=1.-smoothstep(.48,1.7,length(fwidth(bankPoint)));
        float bedLight=.61+.70*bed+scale*(.34*(crust-.5)+.12*(sand-.5));
        diffuseColor.rgb*=bedLight*mix(.77,1.14,gatePhase);
        float powder=smoothstep(.46,.79,bed*.54+crust*.46);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.24+vec3(.006,.006,.005),powder);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float relief=.24*bed+scale*(.089*crust+.013*sand);
        vec3 gx=dFdx(-vViewPosition),gy=dFdy(-vViewPosition),u=cross(gy,normal),v=cross(normal,gx);
        float jac=dot(gx,u);
        normal=normalize(max(abs(jac),1e-8)*normal-sign(jac)*(dFdx(relief)*u+dFdy(relief)*v));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        outgoingLight+=mix(vec3(.006,.006,.005),vec3(.038,.030,.021),gatePhase)*(.64+.54*bed);
        #include <opaque_fragment>`);
    };
    const skin=new T.Mesh(g,talus);skin.name='gate-hill-skin';skin.receiveShadow=true;skin.castShadow=false;group.add(skin);
    figures.forEach((geo,i)=>addStaticInstances(group,geo,talus,reliefs[i].slice(pierCounts[i]),'buried-gate-bank-relief',false,22,
      new T.Float32BufferAttribute(tones[i].slice(pierCounts[i]*3),3)));
  }
  // Fused bodies far across the terrace cover only a few pixels. Reuse the
  // UVs, stone normals, transforms and colors of the near reliefs at every LOD.
  if(adaptive && MeshoptSimplifier.supported){
    group.userData.detailReady=MeshoptSimplifier.ready.then(()=>{
      const levels=new Map();
      for(const geometry of figures){
        const position=geometry.attributes.position;
        const reduced=[];
        for(const [distance,ratio,error] of [[17,.46,.018],[35,.20,.040],[59,.08,.072]]){
          const goal=3*Math.floor(geometry.index.count*ratio/3);
          const [indices]=MeshoptSimplifier.simplify(geometry.index.array,position.array,3,goal,error,['Permissive']);
          const shape=new T.BufferGeometry();
          for(const [name,attribute] of Object.entries(geometry.attributes))shape.setAttribute(name,attribute);
          shape.setIndex(new T.BufferAttribute(indices,1));
          reduced.push({geometry:shape,distance});
        }
        levels.set(geometry,reduced);
      }
      for(const mesh of group.children.slice()){
        const distances=levels.get(mesh.geometry);
        if(mesh.isInstancedMesh&&distances)addTileLevels(group,mesh,distances);
      }
    });
  }
  group.userData.piers=piers;
  return group;
}

// ---------------------------------------------------------------- boundary rail
function box(w,h,d,x,y,z){const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);return g;}
function railPanel(W,weather=0){
  const stone=[],dark=[];
  // The dark back wall sits behind an actual arched opening. Oblique views
  // expose the jamb and soffit progressively as the player walks the rail.
  dark.push(box(W,4.1,.34,0,-.15,-.5));
  for(const [y,h,d] of [[1.12,.16,1.09],[1.36,.10,1.24],[1.58,.19,1.12],[1.89,.35,1.32]])
    stone.push(box(W,h,d,0,y,0));
  const shape=new T.Shape();shape.moveTo(-W/2,0);shape.lineTo(W/2,0);shape.lineTo(W/2,1.32);shape.lineTo(-W/2,1.32);shape.closePath();
  // Round hoods sit on turned balusters; at 164 s the lower scroll band
  // stays in shadow under the projecting sill even as the openings catch sky.
  const openings=10,pitch=(W-.68)/openings;
  const scrollBand=leafFrieze(W-.12,.43,Math.max(5,Math.round(W/.59)));
  scrollBand.translate(0,1.43,.67);stone.push(scrollBand);
  stone.push(box(W,.085,1.49,0,1.39,0),box(W,.11,1.51,0,1.89,0));
  for(let i=0;i<openings;i++){
    const cx=(i-(openings-1)/2)*pitch,w=pitch*.80,h=1.12,hole=new T.Path();
    hole.moveTo(cx-w/2,.14);hole.lineTo(cx+w/2,.14);hole.lineTo(cx+w/2,.14+h-w/2);hole.absarc(cx,.14+h-w/2,w/2,0,Math.PI,false);hole.lineTo(cx-w/2,.14);
    shape.holes.push(hole);
    const crown=2.24+h-w/2;
    for(const face of [-.26,.26]){
      const lip=new T.TorusGeometry(w/2+.025,.036,5,12,Math.PI);
      lip.translate(cx,crown,face);stone.push(lip);
      const outer=new T.TorusGeometry(w/2+.10,.030,5,12,Math.PI);
      outer.translate(cx,crown,face);stone.push(outer);
    }
    if(i<openings-1){
      const post=new T.LatheGeometry([
        [.151,0],[.16,.07],[.099,.15],[.087,.32],[.13,.43],[.153,.52],[.14,.59],[.085,.70],[.080,.85],[.145,.92],[.16,.98]
      ].map(([r,y])=>new T.Vector2(r,y)),8);
      post.translate(cx+pitch/2,2.22,.25);stone.push(post);
      stone.push(box(.32,.092,.33,cx+pitch/2,3.20,.25));
    }
  }
  const pierced=new T.ExtrudeGeometry(shape,{depth:.46,bevelEnabled:false,curveSegments:12});pierced.translate(0,2.10,-.23);stone.push(pierced);
  // Separate capstones leave chipped ends and a recessed bed between courses.
  for(let i=0;i<7;i++){
    const bay=W/7,x=(i-3)*bay,chip=hash3(i,weather,73);
    const depth=.74+.08*chip,drop=weather&&i===2+weather?.20:0;
    const cap=box(bay-.027-.028*chip,.24-.10*drop,depth,0,0,0);
    const verts=cap.attributes.position;
    for(let v=0;v<verts.count;v++)if(verts.getX(v)>0&&verts.getY(v)>0&&verts.getZ(v)>0){
      verts.setXYZ(v,verts.getX(v)-.025-.12*chip,verts.getY(v)-.027-.069*chip,verts.getZ(v)-.02-.11*chip);
    }
    cap.computeVertexNormals();cap.rotateZ(drop*.38);cap.translate(x,3.54-drop,.035*chip);stone.push(cap);
  }
  // Blind arcade on the plinth; the ash covers most of it except on the tree side.
  const bays=4,bay=W/bays;
  for(let i=0;i<bays;i++){
    const cx=(i-(bays-1)/2)*bay,r=bay*.36,spring=.78-r,bottom=-2.2,facade=new T.Shape();
    facade.moveTo(-bay/2,bottom);facade.lineTo(-r,bottom);facade.lineTo(-r,spring);
    facade.absarc(0,spring,r,Math.PI,0,true);facade.lineTo(r,bottom);
    facade.lineTo(bay/2,bottom);facade.lineTo(bay/2,1.91);facade.lineTo(-bay/2,1.91);facade.closePath();
    const masonry=new T.ExtrudeGeometry(facade,{depth:.76,bevelEnabled:false,curveSegments:8});
    masonry.translate(cx,0,-.30);stone.push(masonry);
    // Individual voussoirs stand forward of the blind arches under the rail.
    for(let j=0;j<7;j++){
      const a=(j+.5)*Math.PI/7,rad=r+.17;
      const block=box(.17,rad*.36,.19,cx+Math.cos(a)*rad,spring+Math.sin(a)*rad,.47);
      block.translate(-(cx+Math.cos(a)*rad),-(spring+Math.sin(a)*rad),-.47);
      block.rotateZ(a);block.translate(cx+Math.cos(a)*rad,spring+Math.sin(a)*rad,.47);
      stone.push(block);
    }
    const ring=new T.TorusGeometry(r+.06,.085,5,16,Math.PI);ring.translate(cx,spring,.49);stone.push(ring);
    for(const side of [-1,1])stone.push(box(.16,spring-bottom,.16,cx+side*(r+.065),(bottom+spring)/2,.49));
  }
  return {stone:join(stone),dark:join(dark)};
}
function statueGeometry(variant){
  const lean=variant%2?.06:-.04;
  const profile=[[.44,0],[.42,.22],[.34,.95],[.37,1.28],[.41,1.46],[.31,1.60],[.15,1.70],[.185,1.82],[.175,1.98],[.07,2.10],[0,2.12]].map(q=>new T.Vector2(q[0],q[1]));
  const body=new T.LatheGeometry(profile,24);body.scale(1,1,.72);
  const p=body.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);const x=p.getX(i),z=p.getZ(i),a=Math.atan2(x,z/.72);
    const folds=1+.13*Math.cos(8*a+2.2*y)*(1-smooth(y,1.08,1.68));
    p.setX(i,x*folds+lean*y*y*.2);p.setZ(i,z*folds+.05*Math.max(0,y-1.5));}
  body.computeVertexNormals();
  const pieces=[body,box(.95,.22,.82,0,-.11,0)];
  for(const sign of [-1,1]){
    const shoulder=new T.Vector3(sign*.31,1.47,0),elbow=new T.Vector3(sign*.36,1.10,.14);
    const hand=new T.Vector3(sign*.09,variant?1.18:1.30,.29);
    pieces.push(limbSegment(shoulder,elbow,.14),limbSegment(elbow,hand,.105));
  }
  return join(pieces);
}
export function buildRail({scene,stone,dark,from=8,to=256,segments=28}){
  const group=new T.Group();group.name='terrace-rail';scene.add(group);
  const R=ARENA.radius+.45,nodes=[];
  for(let k=0;k<=segments;k++)nodes.push(ringPoint(from+(to-from)*k/segments,R));
  const width=Math.hypot(nodes[1][0]-nodes[0][0],nodes[1][1]-nodes[0][1]),panels=[0,1,2,3].map(wear=>railPanel(width,wear));
  const stones=[],darks=[],m=new T.Matrix4(),q=new T.Quaternion(),one=new T.Vector3(1,1,1);
  const statues=[statueGeometry(0),statueGeometry(1)];
  for(let k=0;k<segments;k++){
    const a=nodes[k],b=nodes[k+1],mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
    const yaw=Math.atan2(ARENA.cx-mx,ARENA.cz-mz);
    m.compose(new T.Vector3(mx,0,mz),q.setFromAxisAngle(UP,yaw),one);
    const panel=panels[(k*7+Math.floor(k/5))%panels.length];
    stones.push(panel.stone.clone().applyMatrix4(m));darks.push(panel.dark.clone().applyMatrix4(m));
  }
  for(let k=0;k<=segments;k++){
    const [x,z]=nodes[k],yaw=Math.atan2(ARENA.cx-x,ARENA.cz-z);
    m.compose(new T.Vector3(x,0,z),q.setFromAxisAngle(UP,yaw),one);
    const post=join([box(1.25,6.2,1.25,0,.9,0),box(1.46,.30,1.46,0,1.95,0),box(1.6,.28,1.6,0,4.12,0),box(1.36,.2,1.36,0,3.62,0)]);
    stones.push(post.applyMatrix4(m));
    const statue=statues[k%2].clone();statue.rotateY((k*2.399)%0.5-.25);statue.translate(0,4.48,0);stones.push(statue.applyMatrix4(m));
  }
  for(const panel of panels){panel.stone.dispose();panel.dark.dispose();}statues.forEach(g=>g.dispose());
  for(const [list,material,name] of [[stones,stone,'rail-stone'],[darks,dark,'rail-recess']]){
    const geometry=join(list),positions=geometry.attributes.position;
    // Elongate the open baluster tier between its sill and lintel. Everything
    // above it moves up together, keeping capstone thickness and statue scale.
    for(let i=0;i<positions.count;i++){
      const y=positions.getY(i);
      positions.setY(i,y+.28*T.MathUtils.clamp(y-2.10,0,1.32));
    }
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------- colossal columns
export function buildColumn({scene,stone,shaftStone,fractureStone=shaftStone,x,z,height=80,radius=1.65,broken=0,seed=1,capital=true,hangingFoot=0}){
  const base=[],oct=(r,h,y)=>{const g=new T.CylinderGeometry(r,r,h,8);g.rotateY(Math.PI/8);g.translate(x,y+h/2,z);return g;};
  const round=(rt,rb,h,y,sides=28)=>{const g=new T.CylinderGeometry(rt,rb,h,sides);g.translate(x,y+h/2,z);return g;};
  // The pedestal stays below the top of the rail: from the terrace the shaft seems to rise straight out of the wall.
  if(!hangingFoot){
    base.push(oct(radius*1.62,41.4,-40));
    for(const [y,r,h] of [[-3.2,1.74,.5],[.5,1.74,.45],[1.0,1.86,.5],[1.5,1.72,.4]])base.push(oct(radius*r,h,y));
    base.push(round(radius*1.30,radius*1.42,.7,1.9),round(radius*1.14,radius*1.28,.5,2.6));
  }
  const y0=hangingFoot||3.1,h=height-y0;
  const shaft=new T.CylinderGeometry(radius*.86,radius,h,144,48,!!broken),p=shaft.attributes.position;
  for(let i=0;i<p.count;i++){
    const px=p.getX(i),pz=p.getZ(i),py=p.getY(i),a=Math.atan2(px,pz),t=(py+h/2)/h;
    // Broad concave flutes terminate in narrow rounded fillets. Wear varies along the shaft.
    const wave=.5+.5*Math.cos(a*16),wear=vnoise(seed+Math.cos(a)*3.8,py*.11+Math.sin(a)*3.8);
    const groove=1-(.113+.022*wear)*Math.pow(wave,.65);
    const alongTop=Math.max(0,(t-.65)/.35);
    const split=broken*(.14+.73*vnoise(seed+Math.cos(a)*2.2,Math.sin(a)*2.2)+.13*wave);
    // Compress successive rings into the irregular top; the cut cannot fold back over the next ring.
    const torn=split*alongTop;
    const tip=hangingFoot?1-smooth(py+h/2,0,6):0;
    // Worn joints separate courses. Partial fluting survives at a break;
    // the upper face recedes further on its weather-exposed quadrant.
    const course=(py+h*.5)/(radius*6.7)+.018*Math.sin(a*3+seed);
    const joint=1-smooth(Math.abs(course-Math.round(course)),.003,.026);
    const exposed=.5+.5*Math.cos(a-seed*.57);
    const bite=broken?alongTop*alongTop*exposed*(.032+.11*wear):0;
    const entasis=1+.018*Math.sin(Math.PI*t)*(1-t);
    const profile=(groove-.006*joint-bite)*entasis*(1-tip*(.16+.20*wear));
    p.setXYZ(i,px*profile,py-torn+tip*(.55-.55*wear),pz*profile);
  }
  if(broken){
    // The first ring follows the actual fluted rim. Splintered facets descend
    // into a darker chipped core, also visible from above the broken shaft.
    const faces=[],uv=[],n=shaft.parameters.radialSegments;
    const rim=i=>new T.Vector3().fromBufferAttribute(p,i);
    for(let i=0;i<n;i++){
      const a=rim(i),b=rim(i+1),inset=(v,j)=>{
        const a=j/n*Math.PI*2,wear=vnoise(seed+Math.sin(a)*4,Math.cos(a)*4);
        return new T.Vector3(v.x*(.55+.15*wear),v.y-.35-wear*.65,v.z*(.55+.15*wear));
      };
      const c=inset(a,i),d=inset(b,i+1),center=new T.Vector3(0,h/2-broken*.60,0);
      for(const v of [a,b,c,b,d,c,c,d,center]){faces.push(v.x+x,v.y+y0+h/2,v.z+z);uv.push(v.x/radius,v.z/radius);}
    }
    const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(faces,3));
    cap.setAttribute('uv',new T.Float32BufferAttribute(uv,2));cap.computeVertexNormals();
    const cut=new T.Mesh(cap,fractureStone);cut.receiveShadow=true;scene.add(cut);
  }
  shaft.computeVertexNormals();shaft.translate(x,y0+h/2,z);
  if(hangingFoot){
    // The suspended column has a crushed, asymmetric foot rather than a second plinth
    // (primary 124.5-125.3 s and the reverse auxiliary view). Keep the open gap to the rail.
    const rings=[[2.4,.83,0,0],[.4,.80,.05,.03],[-.8,.75,.12,.03],[-2.3,.65,.26,-.06],
     [-2.75,.56,.37,-.16],[-3.8,.43,.50,-.29],[-4.45,.28,.47,-.34]];
    const pos=[],uv=[],indices=[],sides=18;
    for(let j=0;j<rings.length;j++){
     const [level,width,ox,oz]=rings[j];
     for(let i=0;i<sides;i++){
      const a=i/sides*Math.PI*2;
      const chip=vnoise(seed+Math.cos(a)*5+j*.47,Math.sin(a)*5-j*.53);
      const r=radius*width*(.69+.36*chip);
      pos.push(x+ox+r*Math.sin(a),hangingFoot+level+(j>0?(chip-.5)*(j===rings.length-1?2.9:1.6):0),z+oz+r*Math.cos(a));
      uv.push(i/sides,j/(rings.length-1));
      if(j<rings.length-1){const a=j*sides+i,b=j*sides+(i+1)%sides;indices.push(a,b+sides,b,a,a+sides,b+sides);}
     }
    }
    for(let i=1;i<sides-1;i++)indices.push((rings.length-1)*sides,(rings.length-1)*sides+i+1,(rings.length-1)*sides+i);
    const core=new T.BufferGeometry();core.setAttribute('position',new T.Float32BufferAttribute(pos,3));core.setAttribute('uv',new T.Float32BufferAttribute(uv,2));core.setIndex(indices);
    const facets=core.toNonIndexed();facets.computeVertexNormals();core.dispose();
    const foot=new T.Mesh(facets,fractureStone);foot.receiveShadow=true;scene.add(foot);
    // Chipped outer faces retain several flutes above the darker interior.
    // Each face breaks off at its own height and has a broad embedded root.
    const plates=[];
    for(const [angle,span,length,bend] of [[.30,.82,2.3,-.18],[1.90,.98,3.3,.14],[3.96,.71,1.6,.19],[5.10,.64,4.1,-.11]]){
     const vertices=[],uv=[],faces=[],rows=[[2.7,.98,1],[.7,.86,1],[-length*.28,.78,.88],[-length*.64,.64,.55],[-length,.49,.25]];
     for(let j=0;j<rows.length;j++){
      const [level,reach,width]=rows[j],t=j/(rows.length-1);
      for(let k=0;k<=6;k++){
       const q=k/6,a=angle+span*width*(q-.5)+bend*t;
       const flute=1-.115*Math.pow(.5+.5*Math.cos(16*a),.65);
       const r=radius*reach*flute;
       const cleft=(j===0?0:.9)*Math.sin(3*a+2.1)*t+.24*Math.sin(a*11)*t;
       vertices.push(x+Math.sin(a)*r+.21*t,hangingFoot+level+cleft,z+Math.cos(a)*r-.18*t);
       uv.push(q,t);
       if(j>0&&k>0){const b=j*7+k;faces.push(b-8,b-1,b,b-8,b,b-7);}
      }
     }
     const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
     g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(faces);g.computeVertexNormals();plates.push(g);
    }
    const rind=new T.Mesh(join(plates),shaftStone);rind.receiveShadow=true;scene.add(rind);
  }
  if(!broken&&capital){
    base.push(round(radius*1.24,radius*.88,1.5,height),round(radius*1.30,radius*1.30,.5,height+1.5));
    base.push(box(radius*2.9,.9,radius*2.9,x,height+2.45,z));
  }
  if(base.length){const pedestal=new T.Mesh(join(base),stone);pedestal.receiveShadow=true;scene.add(pedestal);}
  const column=new T.Mesh(shaft,shaftStone);
  column.receiveShadow=true;scene.add(column);
  return {x,z,radius,height};
}

// ---------------------------------------------------------------- rubble at the foot of the wall
export function buildRubble({scene,stone,shaftStone,ground,register}){
  const rnd=lcg(90211),drums=[],blocks=[],m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler();
  let guard=0,count=0;
  while(count<46&&guard++<4000){
    const theta=8+rnd()*248,rho=ARENA.radius-10.5+rnd()*9,[x,z]=ringPoint(theta,rho),y=ground(x,z);
    if(z>-4&&Math.abs(x)<9)continue;
    // The east gallery is open behind the kneeling boss. Fallen column
    // drums accumulate beside the gate and the far colonnade, outside this view.
    if(theta<69 && count<15)continue;
    if(count<15){
      const r=1.5+rnd()*.8,length=1.6+rnd()*4.2,g=new T.CylinderGeometry(r,r,length,96,3),p=g.attributes.position;
      for(let i=0;i<p.count;i++){const a=Math.atan2(p.getX(i),p.getZ(i)),groove=Math.hypot(p.getX(i),p.getZ(i))>r*.5?1-.092*Math.pow(.5+.5*Math.cos(a*20),.60):1;p.setX(i,p.getX(i)*groove);p.setZ(i,p.getZ(i)*groove);}
      g.computeVertexNormals();
      e.set(Math.PI/2+(rnd()-.5)*.5,rnd()*6.283,(rnd()-.5)*.4,'YXZ');
      m.compose(new T.Vector3(x,y+r*(.05+.35*rnd()),z),q.setFromEuler(e),new T.Vector3(1,1,1));g.applyMatrix4(m);register?.(g);drums.push(g);
    }else{
      const exposed=theta<69?.43:1;
      const w=(.9+rnd()*2.4)*exposed,h=(.6+rnd()*1.3)*exposed,d=(.8+rnd()*1.8)*exposed,g=new T.BoxGeometry(w,h,d,2,1,2),p=g.attributes.position;
      for(let i=0;i<p.count;i++){
        const lx=p.getX(i),ly=p.getY(i),lz=p.getZ(i),chip=vnoise(x+lx*2.1+ly*.4,z+lz*2.1-ly*.7);
        p.setXYZ(i,lx*(.85+.22*chip),ly*(.80+.28*chip),lz*(.85+.22*chip));
      };
      g.computeVertexNormals();
      e.set((rnd()-.5)*.7,rnd()*6.283,(rnd()-.5)*.7,'YXZ');
      m.compose(new T.Vector3(x,y+h*(.02+.3*rnd()),z),q.setFromEuler(e),new T.Vector3(1,1,1));g.applyMatrix4(m);register?.(g);blocks.push(g);
    }
    count++;
  }
  const a=new T.Mesh(join(drums),shaftStone),b=new T.Mesh(join(blocks),stone);a.name='fallen-drums';b.name='fallen-blocks';
  a.receiveShadow=b.receiveShadow=true;a.castShadow=b.castShadow=true;scene.add(a,b);
}
export {polar};
