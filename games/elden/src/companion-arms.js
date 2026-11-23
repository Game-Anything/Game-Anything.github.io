import * as T from "game/lib/three.module.js";
import {sleeveOnArm} from "game/src/companion-robe.js";

const V=(x,y,z)=>new T.Vector3(x,y,z);
const smooth=T.MathUtils.smootherstep;
const elbow=.59,wrist=1.14;

// In bind space the palm faces +Z and the fingers extend along +Y. Skin the
// whole forearm, palm, and five individual digits in one draw.
function armGeometry(side,spirit){
  const pos=[],gripDelta=[],col=[],indices=[],joints=[],weights=[],skinProfile=[];
  function ringPath(rings,sides,bone,skin){
    const start=pos.length/3;
    for(let row=0;row<rings.length;row++){
      const [x,y,z,rx,rz,closeX=0,closeY=0,closeZ=0]=rings[row];
      for(let k=0;k<sides;k++){
        const a=k*2*Math.PI/sides;
        const girth=spirit?.83:.92;
        pos.push(side*(x+rx*girth*Math.cos(a)),y,z+rz*girth*Math.sin(a));
        skinProfile.push(Math.sqrt(rx*rz),Math.cos(a),Math.sin(a));
        gripDelta.push(side*closeX,closeY,closeZ);
        const b=bone??(y<elbow?0:1);
        let j=b,next=b,mix=0;
        if(bone===null){
          const joint=y<wrist-.1?elbow:wrist;
          j=joint===elbow?0:1;next=j+1;mix=smooth(y,joint-.07,joint+.07);
        }
        joints.push(j,next,0,0);weights.push(1-mix,mix,0,0);
        const tint=skin(y,a);col.push(tint.r,tint.g,tint.b);
        if(row+1<rings.length){
          const n=start+row*sides+k,m=start+row*sides+(k+1)%sides;
          if(side>0)indices.push(n,n+sides,m,m,n+sides,m+sides);
          else indices.push(n,m,n+sides,m,m+sides,n+sides);
        }
      }
    }
  }
  const flesh=new T.Color(spirit?0xd8cbb5:0xe0c3a7),silk=new T.Color(0xece2ca);
  const radii=[[0,.035,.036],[.04,.106,.095],[.12,.131,.119],[.23,.121,.110],[.37,.096,.091],
    [.51,.072,.069],[.545,.069,.068],[.568,.067,.068],[.59,.068,.070],[.615,.073,.072],
    [.638,.079,.076],[.66,.082,.078],[.76,.088,.077],[.91,.069,.061],
    [1.05,.044,.049],[1.14,.042,.044],[1.18,.057,.042],[1.24,.071,.041],
    [1.31,.074,.034],[1.36,.062,.028],[1.38,.015,.012]];
  ringPath(radii.map(([y,x,z])=>[0,y,0,x,z]),28,null,(y,a)=>{
    const inner=smooth(y,.58,.79)*(1.-smooth(y,1.05,1.18))*(.5+.5*Math.sin(a));
    return flesh.clone().multiplyScalar(1.-(spirit?.16:.07)*inner);
  });
  if(!spirit){
    const sleeve=[];
    for(let j=0;j<=10;j++){const t=j/10,y=.01+t*.45;sleeve.push([0,y,0,.095+.055*Math.sin(t*Math.PI*.8)+.015*t,.10+.051*Math.sin(t*Math.PI*.85)]);}
    ringPath(sleeve,20,null,(y,a)=>silk.clone().multiplyScalar(.84+.12*Math.cos(a*9+y*5)));
  }
  // Knuckles meet the palm below its tapered edge; decreasing phalanx radii
  // and a progressive bend give each digit a distinct curled fingertip.
  const fingers=[[-.053,.169,-.022],[-.016,.199,-.005],[.023,.184,.008],[.056,.144,.020]];
  for(const [x,len,spread] of fingers){
    const rings=[];
    for(let j=0;j<=8;j++){
      const t=j/8,knuckle=Math.exp(-((t-.4)**2)/.012)+.65*Math.exp(-((t-.72)**2)/.009);
      const r=(.0175-.0065*t+.0025*knuckle)*(j===8?.12:1);
      const restCurve=spirit?.83:.84, grasp=spirit?(side>0?1.82:1.32)+spread*7.1:1.19+spread*6.;
      const openY=len*Math.sin(t*restCurve)/restCurve,openZ=len*(1.-Math.cos(t*restCurve))/restCurve;
      const gripY=len*Math.sin(t*grasp)/grasp,gripZ=len*(1.-Math.cos(t*grasp))/grasp;
      rings.push([x+spread*t*.68,1.323+openY,.008+openZ,r*.92,r*.79,-spread*t*.23,gripY-openY,gripZ-openZ]);
    }
    ringPath(rings,12,2,(y,a)=>flesh.clone().multiplyScalar(.85+.13*(.5+.5*Math.cos(a))+.025*Math.cos((y-1.32)*83)));
  }
  ringPath([[.047,1.195,0,.03,.025],[.076,1.212,.012,.024,.021],[.091,1.24,.028,.020,.017],
    [.098,1.269,.047,.016,.014,-.012,-.001,.006],[.093,1.293,.059,.013,.011,-.024,-.005,.012],[.087,1.305,.063,.003,.003,-.034,-.008,.018]],8,2,()=>flesh);
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));
  g.setAttribute('skinProfile',new T.Float32BufferAttribute(skinProfile,3));
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  g.morphTargetsRelative=true;g.morphAttributes.position=[new T.Float32BufferAttribute(gripDelta,3)];
  g.setIndex(indices);g.computeVertexNormals();return g;
}

const direction=new T.Vector3(),width=new T.Vector3(),palm=new T.Vector3(),translation=new T.Matrix4();
function setBone(bone,start,end,normal,from,length){
  direction.copy(end).sub(start);const distance=direction.length();direction.multiplyScalar(1/Math.max(.0001,distance));
  width.crossVectors(direction,normal);if(width.lengthSq()<.0001)width.set(1,0,0);
  width.normalize();palm.crossVectors(width,direction).normalize();
  bone.matrix.makeBasis(width,direction,palm);
  bone.matrix.scale(translationScale.set(1,distance/length,1));
  bone.matrix.setPosition(start).multiply(translation.makeTranslation(0,-from,0));bone.matrixWorldNeedsUpdate=true;
}
const translationScale=new T.Vector3();

export function createRiderArms(carrier,surface,linen){
  const portraitClarity={value:0};
  const spiritMaterial=new T.MeshStandardMaterial({vertexColors:true,transparent:true,depthWrite:false,
    roughness:.69,emissive:0xf1dcb4,emissiveIntensity:.034});
  spiritMaterial.onBeforeCompile=shader=>{
    shader.uniforms.portraitClarity=portraitClarity;
    shader.vertexShader='attribute vec3 skinProfile;varying vec3 spiritSurface;varying float spiritAlong;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n spiritSurface=skinProfile;spiritAlong=position.y;');
    shader.fragmentShader='varying vec3 spiritSurface;varying float spiritAlong;uniform float portraitClarity;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      {
      vec3 eye=normalize(vViewPosition);
      float angle=abs(dot(normal,eye));
      float rim=pow(1.-angle,2.1);
      float thickness=clamp(spiritSurface.x/.094,.10,1.);
      float palm=smoothstep(1.09,1.23,spiritAlong);
      float curl=spiritSurface.y*.55+spiritSurface.z*.8;
      float folds=sin(spiritAlong*59.+curl*2.7+sin(spiritAlong*21.));
      float cuff=smoothstep(.72,.76,spiritAlong)*(1.-smoothstep(1.04,1.10,spiritAlong));
      float grain=cuff*(.5+.5*folds);
      float keyRim=0.,through=.18;
      #if NUM_DIR_LIGHTS > 0
        vec3 incident=directionalLights[0].direction;
        keyRim=.24+.76*smoothstep(-.55,.68,dot(normal,incident));
        through+=.54*max(0.,-dot(incident,eye));
      #endif
      // The centre transmits the plate engraving. A longer grazing path
      // picks up the pale edge, including the outline of each fingertip.
      float optical=.049+.083*thickness+.044*palm+.018*grain;
      diffuseColor.a=opacity*mix(1.,2.22,portraitClarity)*(1.-exp(-optical/max(.28,angle))+.078*rim);
      diffuseColor.a=clamp(diffuseColor.a,0.,.92);
      outgoingLight*=mix(vec3(.74,.79,.83),vec3(.93,.86,.68),grain*.62);
      outgoingLight*=.76;
      outgoingLight+=vec3(.135,.125,.103)*(palm+.72*grain)
        +vec3(.27,.23,.16)*rim*(.38+through+keyRim)
        +vec3(.09,.078,.054)*through*(1.-thickness);
      }
      #include <opaque_fragment>`);
  };
  const spiritDepth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
  spiritDepth.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 restSkin;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n restSkin=position;');
    shader.fragmentShader='varying vec3 restSkin;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      // Stipple in bind space so PCF integrates a partial moving shadow
      // and the pattern stays attached to the hand as it closes.
      vec3 cell=floor(restSkin*184.);
      if(fract(sin(dot(cell,vec3(21.3,37.1,59.7)))*16341.183)>.23)discard;`);
  };
  const solidMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.79,emissive:0xf0d9c4,emissiveIntensity:.10});
  const arms=[];
  for(const [side,spirit] of [[1,false],[-1,true],[1,true]]){
    const mesh=new T.SkinnedMesh(armGeometry(side,spirit),spirit?spiritMaterial:solidMaterial);
    mesh.name=spirit?'miquella-spirit-arm':'miquella-embodied-arm';mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;
    if(spirit){mesh.customDepthMaterial=spiritDepth;mesh.renderOrder=side>0?2:1;}
    const bones=[new T.Bone(),new T.Bone(),new T.Bone()];
    for(const b of bones){b.matrixAutoUpdate=false;mesh.add(b);}
    mesh.bind(new T.Skeleton(bones),new T.Matrix4());carrier.add(mesh);
    if(!spirit)sleeveOnArm(bones[0],linen,false);
    const root=surface(side*.092,spirit?.777:.797,spirit?-.012:.005);
    arms.push({side,spirit,mesh,bones,root,el:V(0,0,0),wr:V(0,0,0),tip:V(0,0,0)});
  }
  // The empty left sleeve hangs from the embodied shoulder. The spectral
  // arm passes separately round the bearer and does not carry the fabric.
  const emptySleeveMount=new T.Group();
  const seam=surface(-.125,.797,.022);
  emptySleeveMount.position.copy(seam);
  emptySleeveMount.quaternion.setFromUnitVectors(V(0,1,0),V(.08,-.98,.13).normalize());
  carrier.add(emptySleeveMount);sleeveOnArm(emptySleeveMount,linen,true);
  const normal=V(0,0,-1),inwardPalm=V(-.86,.07,-.45),downFront=V(.04,-.79,.68),underPalm=V(.08,.69,.71),reach=V(0,0,0),high=V(0,0,0);
  const shoulderAxis=V(1,0,0),collar=V(0,0,0),wristContact=V(0,0,0);
  const shoulderPos=[V(-.78,3.48,-.27),V(.78,3.48,-.27)];
  const boneWorld=new T.Matrix4(),boneEnds=[V(0,0,0),V(0,0,0)];let shoulderBones=null;
  function update(boss,time=null){
    const cinematic=Number.isFinite(time),embrace=cinematic?smooth(time,60.4,70.8):1;
    portraitClarity.value=cinematic?smooth(time,64.,71.)*(1.-smooth(time,73.,77.)):0;
    const lift=cinematic?smooth(time,73.35,77.8):0;
    if(boss?.bones){
      shoulderBones??=Object.values(boss.bones).filter(b=>/(Left|Right)Arm$/.test(b.name));
      carrier.updateWorldMatrix(true,false);boneWorld.copy(carrier.matrixWorld).invert();
      if(shoulderBones.length===2&&(!cinematic||time>=57.55)){
        for(let i=0;i<2;i++)shoulderBones[i].getWorldPosition(boneEnds[i]).applyMatrix4(boneWorld);
        const left=boneEnds[0].x<boneEnds[1].x?0:1;
        shoulderPos[0].copy(boneEnds[left]);shoulderPos[1].copy(boneEnds[1-left]);
      }
    }
    shoulderAxis.copy(shoulderPos[1]).sub(shoulderPos[0]).normalize();
    collar.copy(shoulderPos[0]).lerp(shoulderPos[1],.52);
    collar.y+=.045;collar.z-=.62;
    collar.z-=.32*portraitClarity.value;
    if(!cinematic){
      const sternum=boss?.lockBone;
      const chestY=sternum?sternum.getWorldPosition(reach).applyMatrix4(boneWorld).y:collar.y-.51;
      collar.y=T.MathUtils.lerp(chestY,collar.y,.88)+.04;
      collar.z-=.15;
    }
    // The upper palm closes around the other distal forearm. Both targets
    // follow the tilted collar so a shoulder lift cannot pull the hands apart.
    wristContact.copy(collar).addScaledVector(shoulderAxis,-.08);
    for(const {side:s,spirit,mesh,bones,root,el,wr,tip} of arms){
      const contact=shoulderPos[s>0?1:0];
      if(spirit){
        // Both transparent forearms cross the upper breastplate under the
        // pauldrons. At the arrival their wrists are lifted and open.
        el.set(root.x+s*.51,root.y+.21,root.z-.12);
        wr.set(root.x+s*.86,root.y+.32,root.z-.42);
        tip.set(wr.x+s*.15,wr.y-.15,wr.z-.11);
        el.lerp(reach.copy(contact).addScaledVector(shoulderAxis,-s*(cinematic?.045:.17)),embrace);
        el.y+=embrace*((s<0?.085:.145)+(cinematic?0:.19));
        el.z-=embrace*((s<0?.39:.40)+(cinematic?0:.11));
        if(cinematic){
          const folded=.96*portraitClarity.value;
          el.y=T.MathUtils.lerp(el.y,wristContact.y+(s<0?.035:.11),folded);
        }
        if(s<0){
          wr.lerp(wristContact,embrace);
          reach.copy(wristContact).addScaledVector(shoulderAxis,.26);reach.y-=.121;reach.z+=.048;
          tip.lerp(reach,embrace);
        }else{
          reach.copy(wristContact).addScaledVector(shoulderAxis,.19);reach.y+=.106;reach.z-=.047;
          wr.lerp(reach,embrace);
          reach.copy(wristContact).addScaledVector(shoulderAxis,-.050);reach.y+=.067;reach.z-=.070;
          tip.lerp(reach,embrace);
        }
      }else{
        el.set(root.x+.51,root.y-.05,root.z-.05);
        wr.set(root.x+.93,root.y+.01,root.z-.18);
        tip.set(wr.x+.20,wr.y+.025,wr.z-.10);
        el.lerp(reach.set(contact.x-.09,contact.y+.35,contact.z+.11),embrace);
        wr.lerp(reach.set(contact.x-.17,contact.y+.35,contact.z-.12),embrace);
        tip.lerp(reach.set(contact.x-.11,contact.y+.20,contact.z-.29),embrace);
        el.lerp(high.set(root.x+.78,root.y+.69,root.z-.43),lift);
        wr.lerp(high.set(root.x+.57,root.y+1.13,root.z-.53),lift);
        tip.lerp(high.set(root.x+.39,root.y+1.32,root.z-.57),lift);
      }
      setBone(bones[0],root,el,normal,0,elbow);
      setBone(bones[1],el,wr,normal,elbow,wrist-elbow);
      mesh.morphTargetInfluences[0]=embrace*(spirit?1:1.-.71*lift);
      setBone(bones[2],wr,tip,spirit?(s>0?downFront:underPalm):inwardPalm,wrist,.33);
    }
  }
  update(null);
  return update;
}
