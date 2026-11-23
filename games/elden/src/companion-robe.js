import * as T from "game/lib/three.module.js";

// The broad white sleeve and the folded cloth between the two gold borders
// are visible in the turning close-up even when the hair falls behind them.
export function ivoryLinen(){
  const m=new T.MeshPhysicalMaterial({color:0xf2eee4,side:T.DoubleSide,roughness:.89,
    sheen:.39,sheenColor:0xe5e5de,sheenRoughness:.83});
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 weavePosition;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      weavePosition=position;`);
    s.fragmentShader='varying vec3 weavePosition;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
      float clothLight=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 clothNormal=inverseTransformDirection(normal,viewMatrix);
      float clothSky=.48+.52*max(clothNormal.y,0.);
      float crease=.5+.5*cos(dot(weavePosition,vec3(26.,17.,8.))+1.1*sin(weavePosition.y*9.));
      float thread=sin(weavePosition.y*470.)*sin(weavePosition.x*410.);
      float shaped=clothLight/(1.+.26*clothLight)*(.73+.23*crease+.015*thread);
      outgoingLight=mix(outgoingLight*.44,shaped*vec3(1.077,1.012,.915),.91)
        +vec3(.095,.095,.088)*clothSky;
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
      const ripple=Math.sin(4*a+7*t+.85*Math.sin(a-3*t))+.34*Math.sin(8*a+10*t);
      const fold=.015*ripple*Math.sin(Math.PI*t);
      const rx=.046+.096*shoulder-.049*waist;
      const rz=.040+.045*shoulder-.020*waist;
      const h=.854-.302*t-.068*front*Math.sin(Math.PI*t)+.017*sn*Math.sin(Math.PI*t);
      const center=surface(0,h,-.030),right=surface(.008,h,-.030).sub(center).normalize();
      const back=surface(0,h,-.022).sub(center).normalize();
      const p=center.addScaledVector(right,3*(rx+fold)*sn).addScaledVector(back,-3*(rz+fold)*cs);
      const atNeck=1-T.MathUtils.smootherstep(t,.015,.72);
      p.addScaledVector(collarShift,atNeck);
      pos.push(p.x,p.y,p.z);uv.push(i/around,1-t);
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
  cloth.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float linenWeight=1.-smoothstep(.025,.19,metalnessFactor);
      float wovenLuma=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 ivory=vec3(1.06,1.01,.93)*(wovenLuma/(1.+.26*wovenLuma))+.063;
      outgoingLight=mix(outgoingLight,ivory,linenWeight*.84);
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
    const radius=.138+.018*t+.035*dome+folds*(.34+.66*t);
    const gather=open?1.-.51*t*t:1.;
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
  c.fillStyle='#b69a66';c.fillRect(0,212,1024,2);c.fillRect(0,239,1024,2);
  c.lineWidth=2;
  for(let x=0;x<1024;x+=32){
    c.beginPath();c.moveTo(x,226);c.bezierCurveTo(x+6,207,x+24,210,x+32,226);
    c.bezierCurveTo(x+25,244,x+6,243,x,226);c.strokeStyle='#b69b6a';c.stroke();
    c.beginPath();c.moveTo(x+6,226);c.quadraticCurveTo(x+16,216,x+26,226);
    c.quadraticCurveTo(x+16,236,x+6,226);c.strokeStyle='#c7ad79';c.stroke();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=T.RepeatWrapping;
  return map;
}

// The long robe has a standing hem for the arrival and a gathered hem that
// falls behind the cuirass once the rider floats onto Radahn's back.
export function fitLowerRobe(carrier,surface) {
  const n=112,rows=23,indices=[],uv=[],standing=[],seated=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++){
    const t=j/rows,a=i/n*2*Math.PI,pleat=Math.sin(15*a+1.4*t)+.44*Math.sin(26*a-2.3*t);
    const w=.101+.057*t,depth=.065+.044*t,fold=t*(.009+.008*t)*pleat;
    const y=.59-.566*t+.006*t*t*Math.cos(7*a);
    const p=surface((w+fold)*Math.sin(a),y,.004+(depth+fold)*Math.cos(a));
    const fullness=T.MathUtils.smootherstep(t,.36,1);
    standing.push(p.x*(1+.32*fullness),p.y+.185*fullness,p.z+(depth+fold)*Math.cos(a)*.95*fullness);
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
  const cloth=ivoryLinen();cloth.map=embroidery();
  const skirt=new T.Mesh(geometry,cloth);skirt.name='miquella-long-embroidered-robe';
  skirt.castShadow=skirt.receiveShadow=true;carrier.add(skirt);
  const skin=new T.MeshPhysicalMaterial({color:0xcda58c,roughness:.76,sheen:.14,sheenColor:0xf5d4bd});
  const feet=[];
  for(const side of [-1,1]){
    const foot=new T.Group(),at=surface(side*.042,.023,.00);
    foot.name='miquella-arrival-foot';foot.position.copy(at);foot.userData.rest=at;carrier.add(foot);
    // Heel, instep and ball form one continuous section, tapering into the toes.
    const contour=[[.106,.045,.038,.065],[.078,.073,.054,.073],[.039,.083,.079,.090],
      [-.012,.079,.070,.085],[-.079,.085,.041,.058],[-.143,.098,.032,.047],[-.191,.085,.025,.041],[-.207,.064,.018,.036]];
    const verts=[],faces=[],sides=24;
    for(let j=0;j<contour.length;j++)for(let k=0;k<=sides;k++){
      const [z,r,h,cy]=contour[j],a=2*Math.PI*k/sides;
      verts.push(r*Math.cos(a)+side*.012*j/7,cy+h*Math.sin(a)-.094,z);
      if(j+1<contour.length&&k<sides){const q=j*(sides+1)+k;faces.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}
    }
    const g=new T.BufferGeometry();g.setIndex(faces);g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.computeVertexNormals();
    const sole=new T.Mesh(g,skin);sole.castShadow=sole.receiveShadow=true;foot.add(sole);
    for(let i=0;i<5;i++){
      const toe=new T.Mesh(new T.SphereGeometry(1,12,8),skin);
      toe.scale.set(.026-i*.0022,.023-i*.002,.048-i*.0048);
      toe.position.set(side*(-.060+i*.035),-.059,-.197+.010*i);toe.castShadow=true;foot.add(toe);
    }
    const legRows=12,legSides=18,skinFaces=[];
    const shinGeometry=new T.BufferGeometry();
    const skinVertices=new T.BufferAttribute(new Float32Array((legRows+1)*(legSides+1)*3),3);
    for(let j=0;j<legRows;j++)for(let k=0;k<legSides;k++){
      const v=j*(legSides+1)+k;skinFaces.push(v,v+legSides+1,v+1,v+1,v+legSides+1,v+legSides+2);
    }
    shinGeometry.setAttribute('position',skinVertices);shinGeometry.setIndex(skinFaces);
    const shin=new T.Mesh(shinGeometry,skin);shin.castShadow=true;shin.frustumCulled=false;carrier.add(shin);
    const knee=surface(side*.034,.23,0),ankle=new T.Vector3();
    foot.userData.fitAnkle=()=>{
      shin.visible=foot.visible;if(!shin.visible)return;
      ankle.set(0,-.014,.041).applyQuaternion(foot.quaternion).add(foot.position);
      for(let j=0;j<=legRows;j++){
        const t=j/legRows,curve=T.MathUtils.smootherstep(t,0,.95);
        const x=T.MathUtils.lerp(ankle.x,knee.x,curve);
        const y=T.MathUtils.lerp(ankle.y,knee.y,t);
        const z=T.MathUtils.lerp(ankle.z,knee.z,curve);
        const radius=.055+.016*Math.exp(-Math.pow((t-.10)/.12,2))+.024*Math.sin(Math.PI*t)**2;
        for(let k=0;k<=legSides;k++){
          const a=k*2*Math.PI/legSides;
          skinVertices.setXYZ(j*(legSides+1)+k,x+radius*Math.cos(a),y,z+radius*1.09*Math.sin(a));
        }
      }
      skinVertices.needsUpdate=true;shinGeometry.computeVertexNormals();
    };
    feet.push(foot);
  }
  return time=>{
    const mount=Number.isFinite(time)?T.MathUtils.smootherstep(time,53.0,57.55):1;
    skirt.morphTargetInfluences[0]=mount;
    feet.forEach((foot,i)=>{
      foot.visible=mount<.86;
      if(!foot.visible){foot.userData.fitAnkle();return;}
      const step=(time-45)*2.7+i*Math.PI+.40, rest=foot.userData.rest;
      foot.position.set(rest.x,rest.y+Math.max(0,Math.sin(step))*.078+mount*.35,
        rest.z+.43*Math.cos(step)+.63*mount);
      foot.rotation.x=-.33*Math.max(0.,Math.sin(step));
      foot.userData.fitAnkle();
    });
  };
}
