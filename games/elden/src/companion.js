import * as T from "game/lib/three.module.js";
import {seatRiderCrown} from "game/src/companion-fit.js";
import {createRiderArms} from "game/src/companion-arms.js";
import {fitLowerRobe,ivoryLinen,dressShoulders} from "game/src/companion-robe.js";

// Shallow relief in portrait space. The fitted normals and the shadow caster
// use the same surface, including along the bridge and the lower lip.
function cheekRelief(y,z) {
  const center=z+.006;
  const bump=(dy,dz)=>Math.exp(-dy*dy-dz*dz);
  return .009*bump((y+.016)/.060,(Math.abs(center)-.075)/.052)
    -.007*bump((y-.074)/.016,(Math.abs(center)-.076)/.045)
    +.017*bump((y-.021)/.076,center/.024)
    +.009*bump((y+.004)/.019,center/.035)
    +.002*bump((y+.060)/.018,center/.038)
    +.004*bump((y+.119)/.046,center/.057);
}

// Sample the portrait's actual scalp so its surface locks follow the brow,
// the two braided rolls and the nape as the entire head tilts on the shoulder.
function fitCrownLocks(head) {
  const longitude=96,latitude=40,samples=head.geometry.userData.scalpDepth96x40;
  // Reduced portrait meshes carry the original scalp samples so the hand-fitted
  // braids follow the same surface at both portrait and combat distances.
  const baked=samples?.length===longitude*latitude;
  const depth=baked?samples:new Float32Array(longitude*latitude);
  const origin=new T.Vector3(.045,-.065,-.006),v=new T.Vector3();
  const positions=head.geometry.attributes.position,normals=head.geometry.attributes.normal,turn=2*Math.PI;
  const normal=new T.Vector3();
  for(let i=0;i<positions.count;i++){
    v.fromBufferAttribute(positions,i);
    if(v.x>.31 && Math.abs(v.z+.006)<.20 && Math.abs(v.y)<.23){
      const t=T.MathUtils.clamp((v.x-.31)/.084,0,1),w=t*t*(3-2*t);
      const h=cheekRelief(v.y,v.z),eps=.001;
      if(normals){
        normal.fromBufferAttribute(normals,i);
        normal.x/=1+h*6*t*(1-t)/.084;
        normal.y-=normal.x*w*(cheekRelief(v.y+eps,v.z)-cheekRelief(v.y-eps,v.z))/(2*eps);
        normal.z-=normal.x*w*(cheekRelief(v.y,v.z+eps)-cheekRelief(v.y,v.z-eps))/(2*eps);
        normal.normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);
      }
      v.x+=w*h;
    }
    const h=T.MathUtils.clamp((v.y-.085)/.255,0,1),b=T.MathUtils.clamp((v.x+.23)/.51,0,1);
    const upper=h*h*(3-2*h),back=1-b*b*(3-2*b),roll=upper*back;
    if(roll&&normals){
      const dx=-upper*6*b*(1-b)/.51,dy=back*6*h*(1-h)/.255;
      normal.fromBufferAttribute(normals,i);
      const k=(.047*normal.x-.068*normal.y)/(1+.047*dx-.068*dy);
      normal.set(normal.x-k*dx,normal.y-k*dy,normal.z).normalize();normals.setXYZ(i,normal.x,normal.y,normal.z);
    }
    v.x+=.047*roll;v.y-=.068*roll;
    positions.setXYZ(i,v.x,v.y,v.z);
    if(baked)continue;
    v.sub(origin);
    const r=v.length(),angle=Math.atan2(v.z,v.x);
    const lat=Math.acos(T.MathUtils.clamp(v.y/r,-1,1));
    if(lat>=2.36)continue;
    const col=Math.floor((angle/turn+.5)*longitude)%longitude;
    const row=Math.min(latitude-1,Math.floor(lat/2.36*latitude));
    depth[row*longitude+col]=Math.max(depth[row*longitude+col],r);
  }
  positions.needsUpdate=true;if(normals)normals.needsUpdate=true;head.geometry.computeBoundingSphere();
  function point(angle,lat,lift) {
    const x=(angle/turn+.5)*longitude-.5,y=lat/2.36*latitude-.5;
    const ix=Math.floor(x),iy=Math.floor(y);
    let radius=0,total=0;
    for(let j=-1;j<=2;j++)for(let k=-1;k<=2;k++){
      const row=T.MathUtils.clamp(iy+j,0,latitude-1);
      const col=T.MathUtils.euclideanModulo(ix+k,longitude),r=depth[row*longitude+col];
      const w=Math.max(0,1.65-Math.abs(ix+k-x))*Math.max(0,1.65-Math.abs(iy+j-y));
      if(r){radius+=r*w;total+=w;}
    }
    return new T.Vector3(Math.sin(lat)*Math.cos(angle),Math.cos(lat),Math.sin(lat)*Math.sin(angle))
      .multiplyScalar((total?radius/total:.37)+lift).add(origin);
  }
  const xyz=[],color=[],index=[];
  for(let i=0;i<112;i++){
    const a=(i+.5)*turn/112-Math.PI,side=Math.sign(a),rear=(1-Math.cos(a))*.5;
    const seed=(1+Math.sin(i*93.27))*.5,first=xyz.length/3;
    for(let j=0;j<=30;j++){
      const t=j/30,fan=Math.sin(Math.PI*t),width=(.009+.009*seed)*fan;
      const angle=a+side*.46*t+.08*fan*Math.sin(7*t+i*.38);
      const lat=.065+(.57+1.10*rear+.08*seed)*t;
      for(let k=-1;k<=1;k++){
        const p=point(angle+k*width,lat,-.011+fan*(k===0?.007:.001));
        xyz.push(p.x,p.y,p.z);
        const value=(.46+.22*seed)*(k===0?1.08:.90)*(.90+.10*t);
        color.push(value,value*.91,value*.71);
      }
      if(j<30)for(let k=0;k<2;k++){
        const b=first+j*3+k;index.push(b,b+1,b+3,b+1,b+4,b+3);
      }
    }
  }
  // The outer braids unroll behind the temple. These lengths cover the join
  // between the portrait and the moving shoulder hair in the side view.
  for(let i=0;i<64;i++){
    const family=Math.floor(i/3),phase=family*2.39996+(i%3)*.27,seed=(1+Math.sin(phase))*.5;
    const a=1.19+3.91*(i+.5)/64;
    const first=xyz.length/3;
    for(let j=0;j<=36;j++){
      const t=j/36,flow=T.MathUtils.smootherstep(t,.35,.93);
      const angle=a+.18*Math.sin(phase+t*6)*t;
      const lat=.17+1.86*t,center=point(angle,lat,.008+.019*Math.sin(t*Math.PI));
      center.x-=flow*(.064+.082*seed);
      center.y-=flow*(.087+.12*seed);
      center.z+=flow*(.12*Math.sin(a)+.047*Math.sin(phase+7*t));
      const width=(.0038+.0055*seed)*Math.pow(Math.sin(Math.PI*t),.60);
      for(let k=0;k<=6;k++){
        const twist=k*Math.PI/3;const across=width*Math.cos(twist),rise=width*.43*Math.sin(twist);
        xyz.push(center.x-Math.sin(angle)*across,center.y+rise,center.z+Math.cos(angle)*across);
        const value=(.46+.23*seed)*(.88+.12*Math.sin(twist)**2);
        color.push(value,value*.91,value*.73);
      }
      if(j<36)for(let k=0;k<6;k++){
        const b=first+j*7+k;index.push(b,b+7,b+1,b+1,b+7,b+8);
      }
    }
  }
  // Looser hairs lift in shallow arcs above the heavy rolls before rejoining
  // the mantle. Their irregular outline catches the gate behind the helmet.
  for(let i=0;i<68;i++){
    const family=Math.floor(i/4),offset=i%4,phase=family*2.39996;
    const a=1.18+3.94*family/16+.022*offset,first=xyz.length/3;
    const lift=.009+.018*(.5+.5*Math.sin(phase))+.002*offset;
    for(let j=0;j<=32;j++){
      const t=j/32,arch=Math.sin(Math.PI*t),theta=a+.21*t+.025*arch*Math.sin(t*6+phase);
      const p=point(theta,.24+1.37*t,.006+lift*arch*arch);
      p.y+=lift*.65*arch;p.z+=.037*arch*Math.sin(phase+t*5);
      const radius=(.0022+.0015*(i%3))*Math.pow(arch,.55);
      for(let k=0;k<=4;k++){
        const across=radius*Math.cos(k*Math.PI/2);
        xyz.push(p.x-Math.sin(theta)*across,p.y+radius*Math.sin(k*Math.PI/2),p.z+Math.cos(theta)*across);
        const value=.59+.14*Math.sin(phase);color.push(value,value*.85,value*.59);
      }
      if(j<32)for(let k=0;k<4;k++){
        const v=first+j*5+k;index.push(v,v+5,v+1,v+1,v+5,v+6);
      }
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
  g.setAttribute('color',new T.Float32BufferAttribute(color,3));g.setIndex(index);g.computeVertexNormals();
  const locks=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.85,metalness:.02}));
  locks.name='miquella-fitted-crown-locks';locks.receiveShadow=true;head.add(locks);
}

export function prepareCompanion(model,portrait,collarMaps,complexionMap) {
  model.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model);
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  const vertex = new T.Vector3();
  const carrier=new T.Group();carrier.name='seated-miquella';
  const fitted=new T.Vector3();
  const worldOffset=new T.Vector3(-center.x * 3/size.y,1.8-bounds.min.y*3/size.y,.55-center.z*3/size.y);
  const scale = 3.0 / size.y;
  const normal = new T.Vector3(), tangent = new T.Vector3(), bitangent = new T.Vector3();
  const p0 = new T.Vector3(), p1 = new T.Vector3(), p2 = new T.Vector3();
  const up = new T.Vector3(0,1,0), right = new T.Vector3(1,0,0);
  function drape(v) {
    const h=(v.y-bounds.min.y)/size.y, side=v.x-center.x;
    const arm=T.MathUtils.smoothstep(Math.abs(side)/size.x,.17,.43)
      *T.MathUtils.smoothstep(h,.56,.64)*(1-T.MathUtils.smoothstep(h,.84,.91));
    const hem=1-T.MathUtils.smoothstep(h,.08,.35);
    const lean=T.MathUtils.smootherstep(h,.41,.93);
    v.x=center.x+(side-Math.sign(side)*size.x*.035*arm)*(1-.45*hem)-.60*lean/scale;
    v.z=center.z+(v.z-center.z)*(1-.53*hem)+(.42*(1-lean)-.18*lean)/scale-size.y*.17*arm;
    v.y+=(-size.y*.11*arm-size.y*.045*hem)+.27*lean/scale;
    // Reach over the pauldron rather than hanging both hands beside the arms.
    const outer=T.MathUtils.smootherstep(Math.abs(side)/size.y,.155,.36)*arm;
    v.x+=(side<0?.58:-.45)*outer/scale;
    v.z-=.48*outer/scale;
    v.y+=(.17*arm+.20*outer)/scale;
    fitted.copy(v).multiplyScalar(scale).add(worldOffset);
    return v.copy(seatRiderCrown(fitted)).sub(worldOffset).multiplyScalar(1/scale);
  }
  // Keep the seated torso and bring its open forearms toward
  // the carrier's shoulders instead of leaving the generated display pose.
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry.clone(), positions = geometry.attributes.position;
    const matrix = mesh.matrixWorld.clone(), inverse = matrix.clone().invert(), floorLocks=[];
    const normals=geometry.attributes.normal, toWorldNormal=new T.Matrix3().getNormalMatrix(matrix);
    const toMeshNormal=new T.Matrix3().getNormalMatrix(inverse), delta=size.y*.00025;
    const diffuse=mesh.material.map,uv=geometry.attributes.uv,swatch=document.createElement('canvas');
    swatch.width=swatch.height=384;const ctx=swatch.getContext('2d',{willReadFrequently:true});
    if(diffuse?.image)ctx.drawImage(diffuse.image,0,0,384,384);
    const pixels=ctx.getImageData(0,0,384,384).data,bakedLocks=new Uint8Array(positions.count);
    for (let i=0;i<positions.count;i++) {
      vertex.fromBufferAttribute(positions,i).applyMatrix4(matrix);
      const height=(vertex.y-bounds.min.y)/size.y;
      const sx=(vertex.x-center.x)/size.y;
      if(uv&&diffuse?.image&&height>.46&&height<.868&&Math.abs(sx)>.038&&Math.abs(sx)<.142){
        const x=Math.min(383,Math.max(0,Math.floor(384*uv.getX(i))));
        const y=Math.min(383,Math.max(0,Math.floor(384*(diffuse.flipY?1-uv.getY(i):uv.getY(i)))));
        const k=(384*y+x)*4,r=pixels[k],g=pixels[k+1],b=pixels[k+2];
        // Honey-colored baked locks extend from the scalp, through the
        // shoulders and out past the hem. Cream cloth and rose skin remain.
        bakedLocks[i]=r>b*1.54&&g>b*1.22&&r<g*1.36?1:0;
      }
      const outstretchedArm=Math.abs(sx)>.113&&height>.59&&height<.83;
      floorLocks[i]=outstretchedArm||height<.545||height>.833;
      p0.copy(vertex); drape(p0);
      if(normals){
        normal.fromBufferAttribute(normals,i).applyNormalMatrix(toWorldNormal);
        tangent.crossVectors(Math.abs(normal.y)>.9?right:up,normal).normalize();
        bitangent.crossVectors(normal,tangent).normalize();
        drape(p1.copy(vertex).addScaledVector(tangent,delta)).sub(p0);
        drape(p2.copy(vertex).addScaledVector(bitangent,delta)).sub(p0);
        normal.crossVectors(p1,p2).normalize().applyNormalMatrix(toMeshNormal);
        normals.setXYZ(i,normal.x,normal.y,normal.z);
      }
      p0.applyMatrix4(inverse);positions.setXYZ(i,p0.x,p0.y,p0.z);
    }
    const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:positions.count},(_,i)=>i),keep=[];
    for(let i=0;i<indices.length;i+=3)if(!floorLocks[indices[i]]&&!floorLocks[indices[i+1]]&&!floorLocks[indices[i+2]]&&bakedLocks[indices[i]]+bakedLocks[indices[i+1]]+bakedLocks[indices[i+2]]<2)keep.push(indices[i],indices[i+1],indices[i+2]);
    geometry.setIndex(keep);
    mesh.geometry = geometry;
    mesh.castShadow = true;
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      material.emissiveMap = material.map;
      material.emissive = new T.Color(0xfff0d7);material.emissiveIntensity = .074;
      material.normalScale?.setScalar(.72);
      material.roughness = Math.max(.75, material.roughness ?? .75);
    }
  });
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, 1.8 - bounds.min.y * scale, .55 - center.z * scale);
  carrier.add(model);
  function surface(x,h,z){
    return drape(new T.Vector3(center.x+x*size.y,bounds.min.y+h*size.y,center.z+z*size.y)).multiplyScalar(scale).add(worldOffset);
  }
  const brow=new T.Object3D();brow.name='miquella-portrait-focus';brow.position.copy(surface(-.016,.915,-.098));carrier.add(brow);

  // Register the generated portrait by its eyes to the seated body's neck
  // frame. The reference head faces +X in its GLB. At rest the rider faces
  // -Z, with the whole head, diadem and temples turning together.
  const eye=surface(-.030,.908,-.097);
  const axisX=surface(-.020,.908,-.097).sub(eye).normalize();
  const axisY=surface(-.030,.918,-.097).sub(eye).normalize();
  const axisZ=new T.Vector3().crossVectors(axisX,axisY).normalize();
  axisY.crossVectors(axisZ,axisX).normalize();
  const mount=new T.Group();
  mount.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axisX,axisY,axisZ));
  mount.position.copy(eye);
  mount.rotateY(-.21);mount.rotateX(-.235);
  const portraitPose=mount.quaternion.clone();
  const seatedPose=portraitPose.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(-.24,-.53,.10,'YXZ')));
  seatedPose.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.90));
  seatedPose.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.085));
  const seatedEye=eye.clone().addScaledVector(axisX,-.08).addScaledVector(axisY,.085).addScaledVector(axisZ,-.105);
  mount.updateMatrix();carrier.userData.portraitFrame=mount.matrix;
  const head=portrait.getObjectByProperty('isMesh',true);
  head.name='Miquella_portrait';
  // Eye bridge sampled in the original 8K portrait's local mesh space.
  const rawEye=new T.Vector3(.459,.075,-.006);
  portrait.rotation.y=Math.PI/2;
  portrait.scale.setScalar(.96/head.scale.x);
  portrait.updateMatrixWorld(true);
  portrait.position.copy(head.localToWorld(rawEye)).negate();
  head.userData.miquellaPortrait=true;
  const skin=head.material;
  const portraitFill={value:0};
  skin.roughness=.83;skin.metalness=.13;
  skin.emissive=new T.Color(0xffedd1);skin.emissiveMap=skin.map;skin.emissiveIntensity=.009;
  skin.normalScale?.setScalar(.68);
  skin.onBeforeCompile=shader=>{
    shader.uniforms.portraitFill=portraitFill;
    shader.uniforms.complexionMap={value:complexionMap};
    shader.vertexShader='varying float facialSkin; varying vec2 faceYZ; varying float portraitDepth;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      faceYZ=position.yz;portraitDepth=position.x;
      vec2 feature=(position.zy-vec2(-.006,-.013))/vec2(.148,.206);
      facialSkin=(1.-smoothstep(.81,1.06,length(feature)))*smoothstep(.31,.394,position.x);`);
    shader.fragmentShader='uniform float portraitFill; uniform sampler2D complexionMap; varying float facialSkin; varying vec2 faceYZ; varying float portraitDepth;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float skinValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      vec4 sampleSkin=texture2D(complexionMap,clamp((faceYZ.yx+vec2(.16,.195))/vec2(.32,.40),0.,1.));
      vec3 skinTint=clamp(1.+2.15*(sampleSkin.rgb-.5),vec3(.78),vec3(1.21));
      float modulation=1.+.65*(sampleSkin.a-.5);
      vec3 complexion=mix(diffuseColor.rgb,skinValue*skinTint*modulation,.73);
      diffuseColor.rgb=mix(diffuseColor.rgb,complexion*vec3(.96,.91,.85),facialSkin);
      // Closed eyelids are asymmetric in the seated portrait's original mesh.
      float rightLid=step(0.,faceYZ.y);
      float along=(faceYZ.y-mix(-.084,.069,rightLid))/.049;
      float lidHeight=mix(.082,.067,rightLid)+.007*along*along;
      float lash=facialSkin*(1.-smoothstep(.53,1.,abs(along)))*
        (1.-smoothstep(.003,.012,abs(faceYZ.x-lidHeight)));
      diffuseColor.rgb*=mix(vec3(1.),vec3(.78,.71,.66),lash);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
      metalnessFactor*=1.-facialSkin;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float crownGold=(1.-facialSkin)*max(smoothstep(.095,.21,faceYZ.x),1.-smoothstep(.21,.38,portraitDepth));
      float crownLuma=dot(outgoingLight,vec3(.2126,.7152,.0722));
      vec3 paleRoot=mix(outgoingLight,crownLuma*vec3(1.17,1.045,.79),.59)
        +vec3(.108,.093,.064)*(.42+.58*max(normal.y,0.));
      outgoingLight=mix(outgoingLight,paleRoot,crownGold);
      // At the gate the pale sky wraps around the shaded cheek and the diadem.
      // Shape the fill with the face normal, so the lids and far cheek keep their relief.
      float skyWrap=.58+.32*max(0.,dot(normal,normalize(vec3(-.45,.58,.68))));
      float softSkin=dot(outgoingLight,vec3(.2126,.7152,.0722));
      // The cinematic key fills the hollow under a closed lid. Keep the
      // original crease, while the cheek reflects more rosy light from the gate.
      vec3 gateTint=mix(vec3(1.29,1.025,.83),skinTint*vec3(1.13,1.015,.95),.58);
      vec3 paleSkin=gateTint*(1.+.44*(modulation-1.))*
        (softSkin*.68+(.34+.18*skinValue)*(.73+.27*skyWrap));
      vec2 cheekUV=vec2((abs(faceYZ.y+.006)-.077)/.049,(faceYZ.x+.019)/.047);
      vec2 lipUV=vec2((faceYZ.y+.006)/.044,(faceYZ.x+.057)/.016);
      float cheek=exp(-dot(cheekUV,cheekUV)),lowerLip=exp(-dot(lipUV,lipUV));
      paleSkin*=vec3(1.+.066*cheek,1.-.022*cheek-.056*lowerLip,1.-.034*cheek-.036*lowerLip);
      paleSkin*=mix(vec3(1.),clamp(complexion/max(.035,skinValue),vec3(.65),vec3(1.42)),.28);
      vec3 cheekNormal=inverseTransformDirection(normal,viewMatrix);
      float cheekKey=smoothstep(-.34,.73,dot(cheekNormal,normalize(vec3(.74,.38,-.56))));
      vec3 cheekLight=skinTint*modulation*((.055+.115*skyWrap)+cheekKey*(.083+.078*cheek)*vec3(1.06,.92,.81));
      outgoingLight+=cheekLight*facialSkin*(1.-portraitFill);
      // Retain the directional socket, nose and mouth relief when the
      // gateway lights the face. A full replacement erased its expression.
      float shapedSkin=softSkin/(1.+.45*softSkin);
      vec3 warmSkin=gateTint*(.43+.82*shapedSkin)*(.84+.16*cheekKey);
      outgoingLight=mix(outgoingLight,mix(warmSkin,paleSkin,.40),.86*portraitFill*facialSkin);
      outgoingLight+=portraitFill*crownGold*vec3(.080,.069,.042)*skyWrap;
      #include <opaque_fragment>`);
  };
  head.castShadow=true;head.receiveShadow=true;fitCrownLocks(head);
  mount.add(portrait);carrier.add(mount);

  const cloth=ivoryLinen();
  carrier.updateMatrixWorld(true);
  const neck=mount.worldToLocal(head.localToWorld(new T.Vector3(.33,-.196,-.006)));
  const restingNeck=neck.clone().applyQuaternion(portraitPose).add(eye);
  const ridingNeck=neck.clone().applyQuaternion(seatedPose).add(seatedEye);
  const shoulders=dressShoulders(carrier,surface,collarMaps,restingNeck,ridingNeck);
  shoulders.morphTargetInfluences[0]=1;
  // Continue the actual lower edge of the shoulder garment down the front
  // while the rider descends. Its folds gather behind the cuirass on contact.
  const hem=shoulders.geometry.attributes.position,rows=18,around=128;
  const lastRing=hem.count-around-1,waist=new T.Vector3(),point=new T.Vector3();
  for(let i=0;i<around;i++)waist.add(point.fromBufferAttribute(hem,lastRing+i));
  waist.multiplyScalar(1/around);
  // The original fitted torso is folded forward to ride on the carrier.
  // Under the gate, the waist hangs below the face before swinging onto his back.
  const straighten=new T.Vector3(brow.position.x+.07-waist.x,0,brow.position.z-.14-waist.z);
  const upright=hem.clone();
  for(let i=0;i<hem.count;i++){
    const row=Math.floor(i/(around+1))/(lastRing/(around+1));
    point.fromBufferAttribute(hem,i).addScaledVector(straighten,T.MathUtils.smootherstep(row,.24,1));
    upright.setXYZ(i,point.x,point.y,point.z);
  }
  const arrivalShape=shoulders.geometry.clone();arrivalShape.setAttribute('position',upright);arrivalShape.computeVertexNormals();
  shoulders.geometry.morphAttributes.position.push(upright);
  shoulders.geometry.morphAttributes.normal.push(arrivalShape.attributes.normal);
  shoulders.updateMorphTargets();shoulders.morphTargetInfluences[0]=1;
  const pos=[],uv=[],indices=[];
  for(let j=0;j<=rows;j++){
    const t=j/rows;
    for(let i=0;i<=around;i++){
      const v=new T.Vector3().fromBufferAttribute(upright,lastRing+i);
      const a=i/around*Math.PI*2,pleat=Math.sin(a*15+t*.9);
      const gather=Math.sin(Math.PI*t),fold=Math.sin(7*a+t*3.2+.5*Math.sin(3*a));
      v.x+=(t*(.14+.045*pleat)+.043*gather*fold)*Math.sin(a)+t*t*.073;
      v.y-=1.49*t;
      v.z-=t*(.11+.14*Math.cos(a)+.047*pleat)+.038*gather*fold*Math.cos(a);
      pos.push(v.x,v.y,v.z);uv.push(i/around,1-t);
      if(j<rows&&i<around){const k=j*(around+1)+i;indices.push(k,k+1,k+around+1,k+1,k+around+2,k+around+1);}
    }
  }
  const panel=new T.BufferGeometry();
  panel.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  panel.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  panel.setIndex(indices);panel.computeVertexNormals();
  const arrivalCloth=cloth.clone();arrivalCloth.onBeforeCompile=cloth.onBeforeCompile;
  const frontDrape=new T.Mesh(panel,arrivalCloth);
  frontDrape.name='miquella-descending-robe';frontDrape.castShadow=frontDrape.receiveShadow=true;
  frontDrape.visible=false;carrier.add(frontDrape);
  const updateArms=createRiderArms(carrier,surface,cloth);
  const updateRobe=fitLowerRobe(carrier,surface);updateRobe(null);
  let shotTime=null;
  carrier.userData.setShotPose=(time,boss)=>{
    shoulders.material.userData.portraitLinen.value=Number.isFinite(time)?1:0;
    shoulders.material.userData.descendingCollar.value=Number.isFinite(time)&&time>=59.15?
      1-T.MathUtils.smootherstep(time,65.,72.):0;
    const settle=Number.isFinite(time)?T.MathUtils.smootherstep(time,60.5,69.5):1;
    mount.position.lerpVectors(eye,seatedEye,settle);
    mount.quaternion.copy(portraitPose).slerp(seatedPose,settle);mount.updateMatrix();
    carrier.parent?.userData.setPortraitFrame?.(mount.matrix);
    portraitFill.value=Number.isFinite(time)?T.MathUtils.smoothstep(time,57,59.5)*(1-T.MathUtils.smoothstep(time,72,76)):0;
    cloth.userData.gateSilk.value=Number.isFinite(time)&&time>=59.15?1-T.MathUtils.smoothstep(time,64.45,70):0;
    const drapedHair=carrier.parent?.userData.portraitDrape;
    if(drapedHair)drapedHair.value=cloth.userData.gateSilk.value;
    shoulders.morphTargetInfluences[0]=settle;
    const arrival=Number.isFinite(time)&&time>=59.15?1-T.MathUtils.smootherstep(time,61.8,64.45):0;
    shoulders.morphTargetInfluences[1]=arrival;
    frontDrape.visible=arrival>.001;
    if(frontDrape.visible){
      frontDrape.position.x=straighten.x*(arrival-1);frontDrape.position.z=straighten.z*(arrival-1);
      const anchor=hem.getY(hem.count-1);
      frontDrape.scale.y=.18+.82*arrival;frontDrape.position.y=anchor*(1-frontDrape.scale.y);
    }
    shotTime=time;updateRobe(time);
    updateArms(boss,time);
  };
  carrier.userData.updateGrip=(boss)=>{
    if(carrier.parent?.visible&&shotTime===null){mount.position.copy(seatedEye);mount.quaternion.copy(seatedPose);mount.updateMatrix();updateArms(boss);}
  };
  return carrier;
}
