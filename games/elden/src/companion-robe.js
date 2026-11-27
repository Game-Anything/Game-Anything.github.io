import * as T from "game/lib/three.module.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";

// The broad white sleeve and the folded cloth between the two gold borders
// are visible in the turning close-up even when the hair falls behind them.
export function ivoryLinen(){
  const m=new T.MeshPhysicalMaterial({color:0xf2eee4,side:T.DoubleSide,roughness:.89,
    sheen:.39,sheenColor:0xe5e5de,sheenRoughness:.83});
  const gateSilk={value:0};m.userData.gateSilk=gateSilk;
  m.onBeforeCompile=s=>{
    s.uniforms.gateSilk=gateSilk;
    s.vertexShader='varying vec3 weavePosition;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      weavePosition=position;`);
    s.fragmentShader='uniform float gateSilk;varying vec3 weavePosition;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
      float clothLight=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 clothNormal=inverseTransformDirection(normal,viewMatrix);
      float clothSky=.48+.52*max(clothNormal.y,0.);
      float crease=.5+.5*cos(dot(weavePosition,vec3(26.,17.,8.))+1.1*sin(weavePosition.y*9.));
      float thread=sin(weavePosition.y*470.)*sin(weavePosition.x*410.);
      float shaped=clothLight/(1.+.26*clothLight)*(.73+.23*crease+.015*thread);
      outgoingLight=mix(outgoingLight*.44,shaped*vec3(1.077,1.012,.915),.91)
        +vec3(.095,.095,.088)*clothSky;
      float foldLight=.89+.17*crease+.12*dot(clothNormal,normalize(vec3(-.36,.67,-.64)));
      float exposed=.70+.39*shaped/(.62+shaped)+.10*clothSky;
      vec3 transmitted=vec3(1.10,1.025,.83)*exposed*foldLight;
      outgoingLight=mix(outgoingLight,transmitted,.92*gateSilk);
      #include <opaque_fragment>`);
  };
  return m;
}

export function dressShoulders(carrier,surface,collarMaps,neck,ridingNeck){
  const pos=[],seated=[],uv=[],indices=[],around=128,rows=48;
  const neckline=surface(0,.854,-.030);
  const collarShift=neck.clone().sub(neckline),ridingShift=ridingNeck.clone().sub(neck);
  for(let j=0;j<=rows;j++){
    const t=j/rows;
    for(let i=0;i<=around;i++){
      const a=i*2*Math.PI/around,cs=Math.cos(a),sn=Math.sin(a);
      const front=.5+.5*cs,shoulder=T.MathUtils.smootherstep(t,0,.34);
      const waist=T.MathUtils.smootherstep(t,.36,.91);
      const pleat=Math.sin(9*a+3.7*t+.8*Math.cos(2*a-5*t));
      const ripple=.58*Math.sin(4*a+5*t+.85*Math.sin(a-3*t))+.32*pleat+.10*Math.sin(17*a+7*t);
      const fold=.022*ripple*(.28+.72*Math.sin(Math.PI*t));
      const rx=.045+.081*shoulder-.036*waist;
      const rz=.038+.037*shoulder-.015*waist;
      const h=.854-.302*t-.032*front*Math.sin(Math.PI*t)+(.027*sn+.011*ripple)*Math.sin(Math.PI*t);
      const center=surface(0,h,-.030),right=surface(.008,h,-.030).sub(center).normalize();
      const back=surface(0,h,-.022).sub(center).normalize();
      const p=center.addScaledVector(right,3*(rx+fold)*sn).addScaledVector(back,-3*(rz+fold)*cs);
      const atNeck=1-T.MathUtils.smootherstep(t,.015,.72);
      p.addScaledVector(collarShift,atNeck);
      pos.push(p.x,p.y,p.z);uv.push(i/around,1-Math.pow(t,.50));
      p.addScaledVector(ridingShift,atNeck);seated.push(p.x,p.y,p.z);
      if(i<around&&j<rows){const k=j*(around+1)+i;indices.push(k,k+1,k+around+1,k+1,k+around+2,k+around+1);}
    }
  }
  function clothMesh(vertices,faces,material,name){
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    g.setIndex(faces);g.computeVertexNormals();
    const m=new T.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=true;carrier.add(m);return m;
  }
  const [color,orm]=collarMaps;
  color.colorSpace=T.SRGBColorSpace;
  for(const map of collarMaps){map.wrapS=T.RepeatWrapping;map.anisotropy=16;}
  const cloth=new T.MeshPhysicalMaterial({map:color,roughnessMap:orm,metalnessMap:orm,
    roughness:1,metalness:1,side:T.DoubleSide,sheen:.20,sheenRoughness:.82,sheenColor:0xe1d9c7});
  cloth.userData.portraitLinen={value:0};
  cloth.userData.descendingCollar={value:0};
  cloth.onBeforeCompile=shader=>{
    shader.uniforms.portraitLinen=cloth.userData.portraitLinen;
    shader.uniforms.descendingCollar=cloth.userData.descendingCollar;
    shader.fragmentShader='uniform float portraitLinen,descendingCollar;\n'+shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
      float neckline=pow(1.-clamp(vMapUv.y,0.,1.),2.);
      float centre=pow(abs(cos(6.2831853*vMapUv.x)),2.);
      neckline/=1.+descendingCollar*(1.08*centre-.23);
      float braid=max(1.-smoothstep(.009,.024,abs(neckline-.12)),1.-smoothstep(.007,.017,abs(neckline-.24)));
      float twist=.72+.28*sin(vMapUv.x*410.+neckline*75.);
      vec3 linen=mix(vec3(.84,.79,.66),vec3(.78,.47,.16)*twist,braid);
      diffuseColor.rgb=mix(diffuseColor.rgb,linen,portraitLinen);
      metalnessFactor=mix(metalnessFactor,.40*braid,portraitLinen);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float linenWeight=1.-smoothstep(.025,.19,metalnessFactor);
      float wovenLuma=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 ivory=vec3(1.06,1.01,.93)*(wovenLuma/(1.+.26*wovenLuma))+.063;
      outgoingLight=mix(outgoingLight,ivory,linenWeight*.84);
      // The gilt trim picks up ivory cloth and gate light under the chin.
      // Lift the shaded weave while retaining its raised thread highlights.
      vec3 threadGold=vec3(1.16,.91,.54)*(.22+.57*wovenLuma/(1.+.35*wovenLuma));
      outgoingLight=mix(outgoingLight,threadGold,(1.-linenWeight)*.76);
      vec3 worldN=inverseTransformDirection(normal,viewMatrix);
      float shoulderKey=.89+.13*dot(worldN,normalize(vec3(-.39,.74,-.54)));
      float veilLight=(.71+.40*wovenLuma/(.76+wovenLuma))*shoulderKey*(1.+.095*descendingCollar);
      vec3 portraitCloth=mix(vec3(.84,.59,.29)*(.49+.42*twist),vec3(1.10,1.025,.84),linenWeight)*veilLight;
      outgoingLight=mix(outgoingLight,portraitCloth,portraitLinen*.94);
      #include <opaque_fragment>`);
  };
  const robe=clothMesh(pos,indices,cloth,'miquella-ivory-shoulders');
  robe.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  const riding=robe.geometry.clone();
  riding.setAttribute('position',new T.Float32BufferAttribute(seated,3));riding.computeVertexNormals();
  robe.geometry.morphAttributes.position=[riding.attributes.position];
  robe.geometry.morphAttributes.normal=[riding.attributes.normal];robe.updateMorphTargets();
  return robe;
}

export function sleeveOnArm(bone,cloth,open){
  const rows=30,sides=72,pos=[],idx=[],uv=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=sides;i++){
    const t=j/rows,a=i*2*Math.PI/sides;
    const folds=.023*Math.cos(5*a+1.65*t)+.012*Math.sin(9*a-2*t);
    const dome=Math.sin(Math.PI*t)**.8;
    const radius=.119+.030*t+.025*dome+folds*(.46+.72*t);
    const gather=open?1.-.56*t*t:1.-.14*t*t;
    const lip=(open?.039:.054)*Math.cos(a-.55)*t*t;
    pos.push((radius+.012*t)*Math.cos(a)*gather,(open?.41:.48)*t-.065+lip,
      radius*(open?.76:.94)*Math.sin(a)*gather+.032*t*t);
    uv.push(i/sides,t);
    if(j<rows&&i<sides){const k=j*(sides+1)+i;idx.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
  }
  if(open){
    const rim=rows*(sides+1),inner=pos.length/3;
    for(let i=0;i<=sides;i++){
      const q=3*(rim+i);
      pos.push(.68*pos[q],pos[q+1]-.047,.68*pos[q+2]);uv.push(i/sides,.92);
      if(i<sides)idx.push(rim+i,rim+i+1,inner+i,inner+i,rim+i+1,inner+i+1);
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  const sleeve=new T.Mesh(g,cloth);sleeve.name=open?'miquella-hanging-left-sleeve':'miquella-gathered-sleeve';
  sleeve.castShadow=sleeve.receiveShadow=true;bone.add(sleeve);
}

function embroidery() {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const c=canvas.getContext('2d');
  c.fillStyle='#ede5d4';c.fillRect(0,0,1024,256);
  for(let y=0;y<256;y+=3){c.fillStyle=y%2?'#c5ae7b13':'#ffffff33';c.fillRect(0,y,1024,1);}
  c.fillStyle='#ae833d';c.fillRect(0,239,1024,14);
  c.fillStyle='#e4ca84';c.fillRect(0,240,1024,2);c.fillRect(0,250,1024,2);
  c.lineWidth=1.7;
  for(let x=0;x<1024;x+=12){
    c.beginPath();c.moveTo(x,249);c.bezierCurveTo(x+4,249,x+6,242,x+12,242);
    c.strokeStyle='#f3daa2';c.stroke();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=T.RepeatWrapping;
  return map;
}

// The long robe has a standing hem for the arrival and a gathered hem that
// falls behind the cuirass once the rider floats onto Radahn's back.
export function fitLowerRobe(carrier,surface) {
  const n=112,rows=23,indices=[],uv=[],standing=[],seated=[];
  const hemShapes=Array.from({length:4},()=>[]);
  for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++){
    const t=j/rows,a=i/n*2*Math.PI,pleat=Math.sin(15*a+1.4*t)+.44*Math.sin(26*a-2.3*t);
    const w=.101+.057*t,depth=.065+.044*t,fold=t*(.009+.008*t)*pleat;
    const y=.59-.566*t+.006*t*t*Math.cos(7*a);
    const p=surface((w+fold)*Math.sin(a),y,.004+(depth+fold)*Math.cos(a));
    const fullness=T.MathUtils.smootherstep(t,.36,1);
    standing.push(p.x*(1+.40*fullness),p.y+.135*fullness,p.z+(depth+fold)*Math.cos(a)*1.42*fullness);
    const end=standing.length;
    for(let sideIndex=0;sideIndex<2;sideIndex++)for(let direction=0;direction<2;direction++){
      const side=sideIndex*2-1,sign=direction*2-1;
      const flank=.48+.52*T.MathUtils.smoothstep(side*Math.sin(a),-.48,.85);
      const drape=flank*T.MathUtils.smoothstep(sign*Math.cos(a),-.55,.90)*fullness;
      hemShapes[sideIndex*2+direction].push(standing[end-3]+side*.022*drape,
        standing[end-2]+.033*drape,standing[end-1]+sign*.43*drape);
    }
    const gather=T.MathUtils.smootherstep(t,0,.79);
    // The seated rider gathers the skirt against the lumbar armour. Draw the
    // whole hem inward so the back face cannot flap through the moving mane.
    const tuck=T.MathUtils.smootherstep(t,.30,.88);
    seated.push((p.x*(1-.10*gather)+.08*gather*Math.sin(a))*(1-.36*tuck),
      p.y+.40*gather+.42*tuck,p.z+gather*(.42+.17*t+.085*Math.cos(a*3+1.7*t))-1.10*tuck);
    uv.push(i/n,1-t);
    if(i<n&&j<rows){const k=j*(n+1)+i;indices.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);}
  }
  const geometry=new T.BufferGeometry();
  geometry.setIndex(indices);geometry.setAttribute('position',new T.Float32BufferAttribute(standing,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mounted=geometry.clone();mounted.setAttribute('position',new T.Float32BufferAttribute(seated,3));mounted.computeVertexNormals();
  geometry.morphAttributes.position=[mounted.attributes.position];geometry.morphAttributes.normal=[mounted.attributes.normal];
  for(const shape of hemShapes){
    const g=new T.BufferGeometry();g.setIndex(indices);g.setAttribute('position',new T.Float32BufferAttribute(shape,3));g.computeVertexNormals();
    geometry.morphAttributes.position.push(g.attributes.position);geometry.morphAttributes.normal.push(g.attributes.normal);
  }
  const cloth=ivoryLinen();cloth.map=embroidery();
  const weaveShader=cloth.onBeforeCompile;
  cloth.onBeforeCompile=s=>{
    weaveShader(s);
    s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
      float hemHeight=1.-vMapUv.y;
      float gildedHem=smoothstep(.922,.929,hemHeight)*(1.-smoothstep(.963,.971,hemHeight));
      float stitch=.82+.18*cos(vMapUv.x*703.+hemHeight*188.);
      outgoingLight=mix(outgoingLight,vec3(1.04,.73,.34)*(.43+.54*shaped/(.55+shaped))*stitch,gildedHem*.93);
      float lining=smoothstep(.973,.984,hemHeight);
      outgoingLight=mix(outgoingLight,vec3(1.03,.98,.85)*(.60+.28*shaped/(.62+shaped)),lining*.90);
      #include <opaque_fragment>`);
  };
  const skirt=new T.Mesh(geometry,cloth);skirt.name='miquella-long-embroidered-robe';
  skirt.castShadow=skirt.receiveShadow=true;carrier.add(skirt);
  const skin=new T.MeshPhysicalMaterial({color:0xe1c9b0,emissive:0xd5ac90,emissiveIntensity:.035,roughness:.76,sheen:.11,sheenColor:0xffddc5});
  skin.onBeforeCompile=s=>{
    s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 footN=inverseTransformDirection(normal,viewMatrix);
      float instepLight=smoothstep(-.66,.83,dot(footN,normalize(vec3(-.19,.82,-.54))));
      float skinY=dot(outgoingLight,vec3(.21,.72,.07));
      vec3 subsurface=mix(vec3(.37,.253,.176),vec3(1.15,1.01,.82),instepLight);
      outgoingLight=mix(outgoingLight/(1.+.48*skinY),subsurface*(.63+.37*skinY/(.34+skinY)),.77);
      #include <opaque_fragment>`);
  };
  const nail=new T.MeshPhysicalMaterial({color:0xe4bfae,roughness:.46});
  const feet=[];
  for(const side of [-1,1]){
    const foot=new T.Group(),at=surface(side*.042,.023,.00);
    foot.name='miquella-arrival-foot';foot.position.copy(at);foot.userData.rest=at;carrier.add(foot);
    // Turn the ring plane gradually from the vertical shin down the instep.
    // At the ankle this profile shares its entire boundary with the lower leg.
    // Each station gives its centre (y,z), half-width, dorsal depth and plantar depth.
    const sections=[
      [.096,.037,.043,.043,.043],[.077,.036,.044,.044,.045],
      [.056,.036,.042,.045,.048],[.031,.035,.045,.047,.063],
      [.008,.024,.049,.051,.072],[-.012,.002,.051,.051,.070],
      [-.023,-.030,.048,.050,.050],[-.030,-.061,.053,.043,.035],
      [-.038,-.093,.069,.033,.039],[-.047,-.128,.078,.030,.035],
      [-.052,-.158,.080,.024,.031],[-.058,-.181,.071,.018,.024],
      [-.061,-.198,.049,.011,.015],[-.062,-.203,.003,.002,.002]];
    // Interpolate the heel and instep as one smooth surface. A hard join
    // between the two stations beneath the ankle produced a pointed heel.
    const contour=[];
    for(let j=0;j<sections.length-1;j++)for(let n=0;n<4;n++){
      const t=n/4;
      contour.push(sections[j].map((b,k)=>{
        const a=sections[Math.max(0,j-1)][k],c=sections[j+1][k],d=sections[Math.min(sections.length-1,j+2)][k];
        return b+.5*t*((c-a)+t*((2*a-5*b+4*c-d)+t*(3*b-3*c+d-a)));
      }));
    }
    contour.push(sections.at(-1));
    const verts=[],faces=[],sides=36,pads=[[],[]];
    for(let j=0;j<contour.length;j++)for(let k=0;k<sides;k++){
      const [y,z,width,top,bottom]=contour[j],a=2*Math.PI*k/sides;
      const prev=contour[Math.max(0,j-1)],nextRow=contour[Math.min(contour.length-1,j+1)];
      const dy=nextRow[0]-prev[0],dz=j===0?0:nextRow[1]-prev[1],len=Math.hypot(dy,dz);
      const across=Math.cos(a),vertical=Math.sin(a);
      const arch=.031*Math.exp(-((z+.058)**2)/.0024)*Math.max(0,-side*across);
      const radial=vertical*(vertical>0?top:bottom-arch);
      const x=width*across-side*.010*Math.exp(-((z+.13)**2)/.004);
      const heel=Math.max(0,-vertical)**2*Math.exp(-((z-.008)**2)/.0019);
      const underside=y-radial*dz/len,pz=z+radial*dy/len+.010*heel;
      const padFloor=-.078+.006*T.MathUtils.smoothstep(pz,.020,.092);
      const py=underside+Math.max(0,padFloor-underside)*.86;
      verts.push(x,py,pz);
      if(j%2===0&&j>4&&(k===25||k===27||k===29))pads[Number(pz<-.07)].push(new T.Vector3(x,py,pz));
      if(j+1<contour.length){
        const p=j*sides+k,next=j*sides+(k+1)%sides;
        faces.push(p,p+sides,next,next,p+sides,next+sides);
      }
    }
    const soleGeometry=new T.BufferGeometry();
    soleGeometry.setIndex(faces);soleGeometry.setAttribute('position',new T.Float32BufferAttribute(verts,3));
    soleGeometry.computeVertexNormals();
    const instep=new T.Mesh(soleGeometry,skin);instep.castShadow=instep.receiveShadow=true;foot.add(instep);
    const skinParts=[],nails=[];
    const toes=new T.Group();toes.position.set(0,-.073,-.167);foot.add(toes);
    // Each toe grows out of the ball with a broad root and a flatter distal pad.
    for(let i=0;i<5;i++){
      const x=side*[-.064,-.031,-.001,.025,.049][i],width=[.020,.016,.015,.013,.012][i];
      const length=[.077,.075,.064,.052,.042][i],rootZ=-.167+.003*i;
      const profile=[0,.16,.35,.56,.72,.91,1],radii=[.76,1,.85,.76,.85,.70,.07],toeVerts=[],toeFaces=[];
      for(let row=0;row<profile.length;row++)for(let k=0;k<20;k++){
        const a=k*Math.PI/10,t=profile[row],r=width*radii[row];
        toeVerts.push(x+Math.cos(a)*r+side*(i-1.7)*.002*t,-.064+.003*Math.sin(Math.PI*t)-.004*t+Math.sin(a)*r*.69,rootZ-length*t);
        if(row+1<profile.length){const p=row*20+k,b=row*20+(k+1)%20;toeFaces.push(p,p+20,b,b,p+20,b+20);}
      }
      const toe=new T.BufferGeometry();toe.setAttribute('position',new T.Float32BufferAttribute(toeVerts,3));
      toe.setIndex(toeFaces);toe.computeVertexNormals();skinParts.push(toe.toNonIndexed());toe.dispose();
      const plate=new T.SphereGeometry(1,16,8);
      plate.scale(width*.46,.0013,length*.105);plate.translate(x+side*(i-1.7)*.0015,-.066+width*.59,rootZ-.77*length);
      nails.push(plate);
    }
    for(const [parts,material] of [[skinParts,skin],[nails,nail]]){
      const merged=mergeGeometries(parts);merged.translate(0,-toes.position.y,-toes.position.z);
      const mesh=new T.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;toes.add(mesh);
      parts.forEach(part=>part.dispose());
    }
    const legRows=16,legSides=sides,skinFaces=[];
    const shinGeometry=new T.BufferGeometry();
    const skinVertices=new T.BufferAttribute(new Float32Array((legRows+1)*(legSides+1)*3),3);
    for(let j=0;j<legRows;j++)for(let k=0;k<legSides;k++){
      const v=j*(legSides+1)+k;skinFaces.push(v,v+legSides+1,v+1,v+1,v+legSides+1,v+legSides+2);
    }
    shinGeometry.setAttribute('position',skinVertices);shinGeometry.setIndex(skinFaces);
    const shin=new T.Mesh(shinGeometry,skin);shin.castShadow=true;shin.frustumCulled=false;carrier.add(shin);
    foot.userData.toes=toes;
    const toePad=new T.Vector3(-side*.061,-.078,-.227).sub(toes.position);
    const contactPoints=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
    const padPoint=new T.Vector3();
    foot.userData.contactPoints=()=>{
      pads.forEach((samples,index)=>{
        const low=contactPoints[index];low.y=Infinity;
        for(const sample of samples){
          padPoint.copy(sample).applyQuaternion(foot.quaternion);
          if(padPoint.y<low.y)low.copy(padPoint);
        }
        low.add(foot.position);
      });
      contactPoints[2].copy(toePad).applyQuaternion(toes.quaternion).add(toes.position).applyQuaternion(foot.quaternion).add(foot.position);
      return contactPoints;
    };
    const knee=surface(side*.034,.23,0),ankle=new T.Vector3(),rim=new T.Vector3();
    foot.userData.fitAnkle=()=>{
      shin.visible=foot.visible;if(!shin.visible)return;
      ankle.set(0,.096,.037).applyQuaternion(foot.quaternion).add(foot.position);
      for(let j=0;j<=legRows;j++){
        const t=j/legRows,curve=T.MathUtils.smootherstep(t,0,.95);
        const x=T.MathUtils.lerp(ankle.x,knee.x,curve);
        const y=T.MathUtils.lerp(ankle.y,knee.y,t);
        const z=T.MathUtils.lerp(ankle.z,knee.z+(foot.position.z-at.z)*.46,curve);
        const radius=.043+.009*T.MathUtils.smoothstep(t,0,.2)+.029*Math.sin(Math.PI*t)**2;
        for(let k=0;k<=legSides;k++){
          const a=k*2*Math.PI/legSides;
          const ankleBone=.009*T.MathUtils.smoothstep(t,0,.12)*Math.exp(-((t-(side*Math.cos(a)>0?.15:.21))**2)/.003);
          rim.set((radius+ankleBone)*Math.cos(a),0,radius*(1+.12*t)*Math.sin(a));
          const angle=foot.rotation.x*(1-T.MathUtils.smootherstep(t,0,.44));
          skinVertices.setXYZ(j*(legSides+1)+k,x+rim.x,y-rim.z*Math.sin(angle),z+rim.z*Math.cos(angle));
        }
      }
      skinVertices.needsUpdate=true;shinGeometry.computeVertexNormals();
    };
    feet.push(foot);
  }
  return time=>{
    const mount=Number.isFinite(time)?T.MathUtils.smootherstep(time,53.0,57.55):1;
    skirt.morphTargetInfluences[0]=mount;
    cloth.emissive.setHex(0xe8d7af);cloth.emissiveIntensity=.27*(1-mount);
    feet.forEach((foot,i)=>{
      foot.visible=mount<.86;
      skirt.morphTargetInfluences[1+i*2]=skirt.morphTargetInfluences[2+i*2]=0;
      if(!foot.visible){foot.userData.fitAnkle();return;}
      const period=2.65,stance=.60;
      const phase=T.MathUtils.euclideanModulo((time-43.39)/period+i*.5,1);
      foot.userData.planted=phase<stance;
      const span=.46*period*stance,rest=foot.userData.rest;
      const swing=T.MathUtils.clamp((phase-stance)/(1-stance),0,1);
      const arc=Math.sin(Math.PI*swing);
      // In stance the foot offsets the carrier's movement along the tread;
      // during swing the heel lifts, passes the support foot and lands toes forward.
      const travel=phase<stance?span*(phase/stance-.5):
        span*(.5-T.MathUtils.smootherstep(swing,0,1))+.46*period*(1-stance)*Math.sin(2*Math.PI*swing)/(2*Math.PI);
      foot.position.set(rest.x,rest.y+arc*arc*.135+mount*.35,rest.z+travel+.63*mount);
      const stanceTime=phase/stance;
      foot.rotation.x=phase<stance?
        .16*(1-T.MathUtils.smoothstep(stanceTime,0,.23))-.78*T.MathUtils.smootherstep(stanceTime,.49,1):
        -.78+.94*T.MathUtils.smootherstep(swing,.14,.90)-.05*arc;
      // Extend at the metatarsals as the heel peels off the tread. The pads
      // remain horizontal until toe-off, and relax during the passing step.
      foot.userData.toes.rotation.x=Math.max(0,-foot.rotation.x)*(1-T.MathUtils.smootherstep(swing,0,.43));
      const pivotZ=foot.rotation.x<0?-.167:.082,pivotY=-.078,angle=foot.rotation.x;
      const contactWeight=1-arc*arc;
      foot.position.y+=contactWeight*(pivotY*(1-Math.cos(angle))+pivotZ*Math.sin(angle));
      foot.position.z+=contactWeight*(pivotZ*(1-Math.cos(angle))-pivotY*Math.sin(angle));
      const extension=foot.position.z-rest.z-.63*mount;
      skirt.morphTargetInfluences[1+i*2+Number(extension>0)]=Math.min(1,Math.abs(extension)/.38)*(1-mount);
      foot.userData.fitAnkle();
    });
  };
}

// Foreground Tarnished in the low shot through the gate. Origin is the centre
// of the inverted jar, with the back of the armour facing local +Z.
export function createCinematicWitness(T){
  const witness=new T.Group();
  witness.name='cinematic-jar-helmed-tarnished';
  function mesh(name,geometry,material,parent=witness){
    const part=new T.Mesh(geometry,material);
    part.name=name;
    part.castShadow=true;
    part.receiveShadow=true;
    parent.add(part);
    return part;
  }
  function lathe(name,profile,material,parent=witness){
    const geometry=new T.LatheGeometry(profile.map(([y,r])=>new T.Vector2(r,y)),80);
    return mesh(name,geometry,material,parent);
  }
  const clayProfile=[
    [-.172,.176],[-.201,.183],[-.211,.191],[-.208,.209],[-.203,.218],[-.193,.219],
    [-.188,.214],[-.180,.220],[-.171,.218],[-.166,.210],[-.159,.212],
    [-.151,.218],[-.113,.236],[-.078,.250],[-.067,.253],[-.062,.258],
    [-.054,.258],[-.047,.255],[-.040,.260],[-.034,.261],[-.027,.257],
    [-.011,.257],[.020,.252],[.051,.241],[.088,.220],[.124,.194],
    [.165,.166],[.214,.144],[.249,.133],[.266,.133],[.272,.120],[.272,.001]
  ];
  // The incised curls follow the curvature of the clay all the way around.
  // Their depth also modulates the weathered slip, so they read in grazing light.
  const width=768,height=256;
  const relief=new Uint8Array(width*height).fill(154);
  function groove(u,v,radius,depth){
    const x=u*width,y=v*height;
    for(let j=Math.max(0,Math.floor(y-radius));j<=Math.min(height-1,Math.ceil(y+radius));j++){
      for(let i=Math.floor(x-radius);i<=Math.ceil(x+radius);i++){
        const distance=Math.hypot(i-x,j-y)/radius;
        if(distance>=1)continue;
        const index=j*width+(i%width+width)%width;
        relief[index]=Math.min(relief[index],154-depth*(1-distance*distance));
      }
    }
  }
  const panels=18;
  for(let panel=0;panel<panels;panel++){
    for(let turn=0;turn<3;turn++){
      const mirrored=turn===1?-1:1;
      const centre=turn===0?.23:turn===1?.75:.49;
      const centreY=turn===0?.23:turn===1?.275:.185;
      const size=turn===2?.56:1;
      for(let k=0;k<=140;k++){
        const t=k/140,angle=-1.44+t*10.85,envelope=(1-t*.94)*size;
        const x=centre+mirrored*(.43*envelope*Math.cos(angle)+.13*(1-t));
        const y=centreY+.090*envelope*Math.sin(angle);
        groove((panel+x)/panels,y,1.10,67);
      }
    }
  }
  for(let x=0;x<width;x++){
    const u=x/width;
    for(const baseline of [.122,.357]){
      const sine=Math.sin(2*Math.PI*u*panels*2);
      groove(u,baseline+sine*.009,1.1,64);
      groove(u,baseline-sine*.009,1.1,64);
    }
  }
  const colorBytes=new Uint8Array(width*height*4);
  let seed=47392;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,u=x/width*2*Math.PI,v=y/height;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const grain=seed/4294967296-.5;
    const patina=Math.sin(7*u+v*16+Math.sin(3*u-v*19))*.045
                +Math.sin(17*u-v*34)*Math.cos(5*u+v*11)*.035;
    const value=.68+patina+grain*.14+(relief[i]-154)/395;
    const pigment=v>.13&&v<.38?.93:1;
    colorBytes.set([138*value*pigment,128*value*pigment,111*value*pigment,255],i*4);
    relief[i]=Math.min(255,Math.max(0,relief[i]+grain*34));
  }
  const clayColor=new T.DataTexture(colorBytes,width,height,T.RGBAFormat);
  const clayBump=new T.DataTexture(relief,width,height,T.RedFormat);
  for(const map of [clayColor,clayBump]){
    map.wrapS=T.RepeatWrapping;
    map.magFilter=T.LinearFilter;
    map.minFilter=T.LinearMipmapLinearFilter;
    map.generateMipmaps=true;
    map.needsUpdate=true;
  }
  clayColor.colorSpace=T.SRGBColorSpace;
  const clay=new T.MeshStandardMaterial({map:clayColor,bumpMap:clayBump,bumpScale:.0046,emissive:0xd6c3a1,emissiveMap:clayColor,emissiveIntensity:.082,
    roughness:.90,metalness:.07});
  const jar=lathe('inverted-engraved-jar',clayProfile,clay);
  const positions=jar.geometry.attributes.position,uv=jar.geometry.attributes.uv;
  for(let i=0;i<positions.count;i++){
    const y=positions.getY(i),x=positions.getX(i),z=positions.getZ(i),angle=Math.atan2(x,z);
    const wear=.0032*Math.sin(5*angle+y*9)+.0021*Math.sin(11*angle-y*18);
    positions.setXYZ(i,x*(1+wear),y,z*(1+wear));
    uv.setY(i,(y+.211)/.483);
  }
  jar.geometry.computeVertexNormals();
  const handleClay=new T.MeshStandardMaterial({color:0x493c2d,roughness:.88,metalness:.07});
  const quilt=document.createElement('canvas');quilt.width=256;quilt.height=128;
  const weave=quilt.getContext('2d');weave.fillStyle='#392e2b';weave.fillRect(0,0,256,128);
  for(let i=-128;i<384;i+=8)for(const slope of [-1,1]){
    weave.beginPath();weave.moveTo(i,0);weave.lineTo(i+slope*128,128);
    weave.strokeStyle='#272221';weave.lineWidth=1.3;weave.stroke();
    weave.strokeStyle='#645545';weave.lineWidth=.65;weave.setLineDash([1,2]);weave.stroke();weave.setLineDash([]);
  }
  const quilting=new T.CanvasTexture(quilt);quilting.colorSpace=T.SRGBColorSpace;
  quilting.wrapS=quilting.wrapT=T.RepeatWrapping;quilting.repeat.set(3,2);
  const cloth=new T.MeshStandardMaterial({map:quilting,emissiveMap:quilting,emissive:0xe8cab6,emissiveIntensity:.38,roughness:.97,side:T.DoubleSide});
  const leather=new T.MeshStandardMaterial({color:0x282421,roughness:.83});
  const iron=new T.MeshStandardMaterial({color:0x594b37,metalness:.64,roughness:.7});
  const brass=new T.MeshStandardMaterial({color:0x8d7450,metalness:.68,roughness:.64});
  const chasedMap=clayBump.clone();
  chasedMap.repeat.set(1,.22);chasedMap.offset.y=.14;chasedMap.needsUpdate=true;
  const plate=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,metalness:.46,roughness:.56,bumpMap:chasedMap,bumpScale:.0017});
  plate.onBeforeCompile=s=>{
    s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
      outgoingLight+=diffuseColor.rgb*(.20+.23*max(0.,normal.y));
      #include <opaque_fragment>`);
  };
  const orb=new T.SphereGeometry(1,20,14);
  function oval(name,material,x,y,z,sx,sy,sz){
    const part=mesh(name,orb,material);
    part.position.set(x,y,z);part.scale.set(sx,sy,sz);
    return part;
  }
  const torso=lathe('witness-armoured-doublet',[
    [-.70,.12],[-.64,.151],[-.52,.145],[-.42,.163],[-.32,.187],[-.26,.176],[-.22,.086]
  ],cloth);
  torso.scale.z=.72;
  const collar=lathe('witness-neck-wrap',[[-.334,.150],[-.297,.171],[-.263,.181],[-.232,.191],[-.210,.201],[-.184,.184],[-.170,.001]],cloth);
  collar.scale.z=.97;
  const plateShadow=new T.Color(0x574d3d),plateGold=new T.Color(0xab936c),engraving=new T.Color();
  for(const side of [-1,1]){
    const handlePath=new T.CatmullRomCurve3([
      [.234,-.077],[.270,-.065],[.294,-.064],[.307,-.076],
      [.306,-.089],[.292,-.110],[.267,-.134],[.219,-.150]
    ].map(([x,y])=>new T.Vector3(side*x,y,.013)));
    mesh('thrown-clay-loop-handle',new T.TubeGeometry(handlePath,28,.009,10,false),handleClay);
    // Two overlapping lames hang over each shoulder. Model the scalloped
    // edges, rolled rims and repoussé veins in the same curved sheet.
    for(let layer=0;layer<2;layer++){
      const pos=[],col=[],uv=[],faces=[];
      for(let j=0;j<=25;j++)for(let i=0;i<=52;i++){
        const u=i/52,v=layer?.71+.29*j/25:j/25,t=2*u-1,bow=Math.sqrt(Math.max(.014,1-t*t));
        const leaf=Math.atan2(v-.50,t*.75);
        const ribs=Math.hypot(1.4*t,v-.50);
        const rib=(.5+.5*Math.cos(53*ribs-4*leaf+2*Math.sin(19*t+7*v)))**5;
        const rim=Math.exp(-((v-.93)**2)/.0013);
        const span=(.075+.001*layer)*(.80+.20*Math.sin(Math.PI*v));
        const x=side*(.096+t*span+.017*v);
        const y=-.210-.013*layer-.021*t-v*(.075+.043*bow+.004*Math.cos(27*t))+.022*v*Math.max(0,-t);
        const z=.147+.047*bow+.017*(1-v)+.0008*rib+.0027*rim-.003*layer;
        pos.push(x,y,z);uv.push(u,v);
        engraving.copy(plateShadow).lerp(plateGold,.09+.25*rib+.30*rim);
        col.push(engraving.r,engraving.g,engraving.b);
        if(i<52&&j<25){const k=j*53+i;faces.push(k,k+53,k+1,k+1,k+53,k+54);}
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      g.setIndex(faces);g.computeVertexNormals();mesh('witness-chased-shoulder-lame',g,plate);
    }
    const seam=new T.CatmullRomCurve3([
      [side*.055,-.31,.115],[side*.063,-.35,.124],[side*.028,-.38,.133],
      [side*.018,-.412,.132],[side*.048,-.423,.128],[side*.046,-.401,.136]
    ].map(([x,y,z])=>new T.Vector3(x,y,z)));
    mesh('witness-back-embroidery',new T.TubeGeometry(seam,28,.0035,6,false),brass);
    const arm=oval('witness-leather-sleeve',leather,side*.194,-.438,.015,.065,.172,.067);
    arm.rotation.z=side*.09;
    oval('witness-bracer',iron,side*.207,-.595,.023,.059,.110,.060);
    oval('witness-glove',leather,side*.212,-.707,.026,.046,.075,.046);
    oval('witness-cuisses',leather,side*.080,-.816,0,.087,.197,.089);
    oval('witness-greaves',iron,side*.089,-1.08,.010,.058,.160,.060);
    oval('witness-boots',leather,side*.090,-1.230,-.025,.065,.055,.107);
  }
  // All pieces of the witness are rigid. Batch them by surface so the
  // close reverse shot does not draw each rivet and curl independently.
  const byMaterial=new Map(),originals=new Set();
  for(const part of witness.children.slice()){
    part.updateMatrix();const geometry=part.geometry.clone().applyMatrix4(part.matrix);
    if(!byMaterial.has(part.material))byMaterial.set(part.material,[]);
    byMaterial.get(part.material).push(geometry);
    originals.add(part.geometry);witness.remove(part);
  }
  for(const [material,parts] of byMaterial){
    const merged=mergeGeometries(parts);
    const panel=new T.Mesh(merged,material);
    panel.castShadow=true;panel.receiveShadow=true;witness.add(panel);
    parts.forEach(part=>part.dispose());
  }
  originals.forEach(geometry=>geometry.dispose());
  return witness;
}
