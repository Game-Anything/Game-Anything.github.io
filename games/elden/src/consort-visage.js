import * as T from "game/lib/three.module.js";

// The rig faces +X in its bind frame. Cast each piece of chased metal onto
// the same GLB surface that will animate underneath it.
export function fitConsortVisor(skin,ultra=false){
  const geometry=skin.geometry,{position,skinWeight,skinIndex}=geometry.attributes;
  const indices=geometry.index.array;
  const headIndex=skin.skeleton.bones.findIndex(b=>/Head$/.test(b.name));
  if(headIndex<0)return;
  const surface=[];
  for(let i=0;i<indices.length;i+=3){
    const ids=[indices[i],indices[i+1],indices[i+2]];
    const points=ids.map(k=>new T.Vector3().fromBufferAttribute(position,k));
    if(points.every(p=>p.y<1.55)||points.every(p=>p.y>1.75)||points.every(p=>p.x<.075))continue;
    if(!ids.some(k=>[0,1,2,3].some(j=>skinIndex.getComponent(k,j)===headIndex&&skinWeight.getComponent(k,j)>.25)))continue;
    surface.push({points,ids});
  }
  const texcoord=new T.Vector2(),tex=geometry.attributes.uv;
  function depth(y,z){
    let x=-Infinity;
    texcoord.set(0,0);
    for(const {points:[a,b,c],ids} of surface){
      const by=b.y-a.y,bz=b.z-a.z,cy=c.y-a.y,cz=c.z-a.z,det=by*cz-cy*bz;
      if(Math.abs(det)<1e-9)continue;
      const u=((y-a.y)*cz-(z-a.z)*cy)/det,v=(by*(z-a.z)-bz*(y-a.y))/det;
      if(u<-.0001||v<-.0001||u+v>1.0001)continue;
      const hit=a.x+u*(b.x-a.x)+v*(c.x-a.x);
      if(hit<=x)continue;
      x=hit;
      const [ia,ib,ic]=ids,w=1-u-v;
      texcoord.set(w*tex.getX(ia)+u*tex.getX(ib)+v*tex.getX(ic),
        w*tex.getY(ia)+u*tex.getY(ib)+v*tex.getY(ic));
    }
    return Number.isFinite(x)?x:.143;
  }
  const p=[],colors=[],uv=[],index=[];
  function panel(rows,cols,pointAt){
    if(ultra){rows=Math.ceil(rows*1.4);cols=Math.ceil(cols*1.4);}
    const base=p.length/3;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      const [y,z,rise,color]=pointAt(i/cols,j/rows);
      p.push(depth(y,z)+rise,y,z);colors.push(color.r,color.g,color.b);uv.push(texcoord.x,texcoord.y);
      if(i<cols&&j<rows){const k=base+j*(cols+1)+i;index.push(k,k+cols+1,k+1,k+1,k+cols+1,k+cols+2);}
    }
  }
  const bronze=new T.Color(0xaa8150),gold=new T.Color(0xf3ce8d),polish=new T.Color(0xffebba),shadow=new T.Color(0x76513b),color=new T.Color();
  // At 64 and 69 seconds the raised forehead ridges fan out from the
  // inner brows and pinch together again against the crown of the helmet.
  panel(40,112,(u,t)=>{
    const s=2*u-1,abs=Math.abs(s),width=.048+.016*Math.sin(Math.PI*t)-.009*t;
    const z=s*width,y=1.666+.012*abs+t*(.059-.018*abs**2);
    const swept=s*(4.8-.78*Math.sin(t*Math.PI))+.14*Math.sin(2*Math.PI*t)*s;
    const flute=.5+.5*Math.cos(swept*Math.PI*2),rim=Math.max(0,1-10*Math.abs(t-.975));
    const taper=Math.sin(Math.PI*Math.min(.999,Math.max(.001,t)))**.58;
    const ridge=(.0008+.0072*Math.pow(flute,2.05))*taper+.0028*rim;
    const wear=.5+.5*Math.sin(z*1201+1.9*Math.sin(y*342+z*139));
    color.copy(bronze).lerp(gold,.21+.68*flute).lerp(polish,.20*rim);
    color.multiplyScalar(.90+.10*wear);
    return [y,z,.0012+ridge,color];
  });
  // Almond-shaped eye recess with a projecting upper lip. The steep lower
  // return catches a thin highlight when seen from below in combat.
  for(const sign of [-1,1]){
    panel(6,24,(u,v)=>{
      const bow=Math.sin(Math.PI*u),z=sign*(.010+.048*u),line=1.654+.010*u;
      const y=line+(v-.5)*(.010*bow+.00025);
      color.setHex(v>.78?0x725942:0x3f3129);
      return [y,z,.0016+.0014*(1-bow),color];
    });
    panel(7,27,(u,v)=>{
      const bow=Math.sin(Math.PI*u),z=sign*(.008+.054*u),line=1.654+.011*u;
      const y=line+.0014+.0038*bow+v*(.0011+.0091*bow);
      color.copy(shadow).lerp(gold,.16+.70*Math.sin(Math.PI*v)**.65);
      return [y,z,.002+bow*(.005+.010*Math.sin(Math.PI*v)),color];
    });
    panel(9,32,(u,v)=>{
      const arch=Math.sin(Math.PI*u),z=sign*(.013+.048*u);
      const y=1.647+.007*u-.005*arch+(v-.5)*(.0014+.009*arch);
      color.copy(shadow).lerp(bronze,.23+.64*v);
      return [y,z,.002+.0055*arch*Math.sin(Math.PI*v),color];
    });
    // The two chased cheek flanges converge on the pointed nasal guard.
    // Cast both lips onto the flared cheeks so the recess survives a turn.
    panel(12,32,(u,v)=>{
      const bow=Math.sin(Math.PI*u),band=.002+.008*bow;
      const z=sign*(.003+.037*u),y=1.608+.037*u+.004*bow+(v-.5)*band;
      const lip=Math.sin(Math.PI*v)*bow;
      color.copy(shadow).lerp(gold,.18+.64*lip);
      return [y,z,.0013+.0055*lip+.0007*bow*Math.cos(Math.PI*4*v),color];
    });
  }
  panel(27,18,(u,t)=>{
    const s=u*2-1,span=.0003+.011*Math.sin(Math.PI*t)**.65;
    const spine=(1-Math.abs(s))**1.5,point=Math.sin(Math.PI*t*.87);
    color.copy(gold).lerp(polish,.20+.58*spine);
    return [1.598+.054*t,s*span,.0017+point*(.0008+.0068*spine),color];
  });
  // The opening between the cheek guards exposes a broad nose, the lips
  // and the square of the chin. These surfaces carry skin, including in
  // the low red key of the kneeling portrait.
  const metalCount=index.length;
  const flesh=new T.Color(0x82554b),recess=new T.Color(0x432b2b),skinLight=new T.Color(0xaf7b65);
  panel(34,46,(u,v)=>{
    const s=2*u-1,abs=Math.abs(s),y=1.574+.066*v;
    const z=s*(.020+.014*Math.sin(Math.PI*v)**.65);
    const nose=Math.exp(-((v-.79)**2)/.023-(s*s)/.060);
    const ala=Math.exp(-((v-.70)**2)/.006-((abs-.32)**2)/.022);
    const chin=Math.exp(-((v-.21)**2)/.019-(s*s)/.41);
    const lipLine=.42-.039*s*s+.015*Math.cos(s*7);
    const slit=Math.exp(-((v-lipLine)**2)/.00028)*Math.exp(-(s*s)/.37);
    const lip=Math.exp(-((v-lipLine+.061)**2)/.0017-(s*s)/.34);
    const cheek=Math.exp(-((v-.66)**2)/.053-((abs-.79)**2)/.055);
    const crease=Math.exp(-((abs-(.39+.9*(.66-v)))**2)/.009-((v-.54)**2)/.026);
    const nostril=Math.exp(-((abs-.28)**2)/.012-((v-.67)**2)/.00096);
    color.copy(flesh).lerp(skinLight,.21*chin+.20*cheek+.32*nose).lerp(recess,Math.min(.89,.71*slit+.75*nostril+.23*crease));
    return [y,z,.0013+.0098*nose+.0042*ala+.0037*chin+.0031*lip+.0027*cheek,color];
  });
  // Merge the forehead and ocular pieces. Use the same head bone and
  // neutral local-to-bone transform as the original weighted skin.
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('visorHeight',new T.Float32BufferAttribute(p.filter((_,i)=>i%3===1),1));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(index);g.computeVertexNormals();
  const head=skin.skeleton.bones[headIndex];
  const toHead=head.matrixWorld.clone().invert().multiply(skin.matrixWorld);
  g.applyMatrix4(toHead);g.computeBoundingSphere();
  const focus=new T.Object3D();focus.name='radahn-portrait-focus';
  const redPortrait={value:0};focus.userData.redPortrait=redPortrait;
  focus.position.set(depth(1.665,0)+.003,1.665,0).applyMatrix4(toHead);head.add(focus);
  // The raised brow is polished gilt. Reusing the body albedo multiplied its
  // painted eye-socket shadows into the raised metal a second time.
  const metal=new T.MeshStandardMaterial({color:0xe5d9bf,vertexColors:true,map:skin.material.map,
    metalness:.69,roughness:.39,side:T.DoubleSide,envMapIntensity:1.53});
  if(metal.map)metal.onBeforeCompile=shader=>{
    shader.uniforms.redPortrait=redPortrait;
    shader.vertexShader='attribute float visorHeight;varying float crownHeight;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n crownHeight=visorHeight;');
    shader.fragmentShader='uniform float redPortrait;varying float crownHeight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 baseGilt=diffuseColor.rgb;
      #include <map_fragment>
      float etching=dot(diffuseColor.rgb/max(baseGilt,vec3(.001)),vec3(.2126,.7152,.0722));
      diffuseColor.rgb=baseGilt*mix(.36,1.04,smoothstep(.018,.46,etching));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float bronzeY=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 skyNormal=inverseTransformDirection(normal,viewMatrix);
      float skyExposure=smoothstep(-.65,.48,skyNormal.y);
      float cheekBounce=smoothstep(-.3,.78,dot(skyNormal,normalize(vec3(.71,.24,-.65))));
      outgoingLight+=sqrt(max(diffuseColor.rgb,vec3(0.)))*vec3(.16,.108,.068)*cheekBounce*(1.-smoothstep(.17,.54,bronzeY));
      outgoingLight+=sqrt(max(diffuseColor.rgb,vec3(0.)))*vec3(.122,.110,.089)*(.78+.60*skyExposure)*(1.-smoothstep(.14,.63,bronzeY));
      float crest=smoothstep(1.687,1.718,crownHeight);
      vec3 reflectedRed=vec3(.102,.009,.004)*(.52+.48*(1.-skyExposure));
      vec3 oldGold=mix(vec3(.27,.22,.16),vec3(.71,.60,.41),crest);
      outgoingLight=mix(outgoingLight,outgoingLight*oldGold+reflectedRed*(1.-.76*crest),redPortrait);
      #include <opaque_fragment>`);
  };
  const complexion=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.77,metalness:.025});
  complexion.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 skinN=inverseTransformDirection(normal,viewMatrix);
      outgoingLight+=diffuseColor.rgb*(.15+.23*max(0.,skinN.y));
      #include <opaque_fragment>`);
  };
  g.addGroup(0,metalCount,0);g.addGroup(metalCount,index.length-metalCount,1);
  const visor=new T.Mesh(g,[metal,complexion]);visor.name='consort-chased-visor';visor.castShadow=visor.receiveShadow=true;head.add(visor);
}
