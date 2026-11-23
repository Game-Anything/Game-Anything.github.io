import * as T from "game/lib/three.module.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";
import {ARENA} from "game/src/arena-layout.js";
import {crownScreen,hangingCrocket,leafFrieze} from "game/src/tower-carving.js";

// Low, broken drifts sit on the approach and cover the feet of the piers.
// Each bank has a fixed position; the top breaks around the stair opening.
export function makeGateHaze(scene) {
  const geometry=new T.PlaneGeometry(1,1);
  const bankCount=56;
  const material=new T.ShaderMaterial({
    uniforms:{time:{value:0},phaseTwo:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`
      varying vec2 bankUV;varying vec3 worldPoint;
      void main(){
        bankUV=uv;
        vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
        worldPoint=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader:`uniform float time;uniform float phaseTwo;varying vec2 bankUV;varying vec3 worldPoint;
      float hash(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      void main(){
        vec2 p=vec2(worldPoint.x+.58*worldPoint.z,worldPoint.y)*vec2(.19,.64);
        float n=noise(p+vec2(time*.035,0.))*.56+noise(p*2.6-time*.019)*.28+noise(p*5.4+time*.014)*.16;
        float height=bankUV.y+.69*(n-.5);
        float body=smoothstep(.0,.17,bankUV.y)*(1.-smoothstep(.18,.91,height));
        float edge=smoothstep(0.,.23,bankUV.x)*smoothstep(0.,.23,1.-bankUV.x);
        float patchNoise=noise(worldPoint.xz*.087+vec2(time*.009,0.));
        float distanceToEye=length(cameraPosition-worldPoint);
        float opacity=edge*body*(.23+.81*n)*smoothstep(.23,.74,patchNoise)*smoothstep(8.,24.,distanceToEye);
        vec3 dust=mix(vec3(.30,.28,.215),vec3(.20,.185,.136),phaseTwo);
        dust+=vec3(.09,.075,.046)*n*smoothstep(-63.,-18.,worldPoint.z);
        vec3 sight=normalize(worldPoint-cameraPosition);
        vec3 sun=normalize(vec3(-worldPoint.x,13.,-86.-worldPoint.z));
        float forward=pow(max(0.,dot(sight,sun)),3.0);
        float skim=mix(.81,1.21,smoothstep(-.17,.08,sight.y));
        vec3 silver=mix(vec3(.62,.603,.48),vec3(.43,.38,.25),phaseTwo);
        dust=mix(dust,silver,(.15+.50*forward)*skim);
        // Backlit ash collects in the far hollows around the arena. A thin
        // neutral band separates the first-phase figures from the colonnade.
        float outside=smoothstep(19.,38.,length(worldPoint.xz-vec2(0.,-20.)));
        float distant=smoothstep(12.,30.,distanceToEye);
        float bank=outside*distant*(1.-phaseTwo)*smoothstep(.15,.73,patchNoise);
        dust=mix(dust,vec3(.57,.52,.44),bank*.42);
        opacity+=bank*edge*body*(.045+.065*n);
        float openGallery=smoothstep(23.,40.,length(worldPoint.xz-vec2(0.,-8.)));
        opacity*=1.-openGallery*mix(.90*smoothstep(.65,2.25,worldPoint.y),.48*smoothstep(1.3,4.1,worldPoint.y),phaseTwo);
        // Leave a broken view of the actual steps between the two piers.
        float stairLane=(1.-smoothstep(3.,16.,abs(worldPoint.x)))*smoothstep(28.,58.,-worldPoint.z);
        float gateApproach=smoothstep(27.,58.,-worldPoint.z)*(1.-smoothstep(28.,55.,abs(worldPoint.x)));
        opacity*=1.-.61*gateApproach*(.56+.44*patchNoise);
        opacity*=1.-.72*stairLane*(.48+.52*patchNoise);
        // Let the steps and low arcade read through gaps in the moving ash.
        // Two scales keep the boundary from becoming a horizontal stripe.
        float hollows=noise(worldPoint.xz*.067+vec2(4.1,-1.7))*.68
                     +noise(worldPoint.xz*.19+time*.008)*.32;
        opacity*=mix(.19,1.08,smoothstep(.34,.64,hollows));
        float intoGate=pow(max(0.,-sight.z),12.)*(1.-phaseTwo);
        opacity*=1.-.50*intoGate;
        float apron=gateApproach*(1.-smoothstep(.12,.60,bankUV.y))*patchNoise;
        opacity+=.13*apron*edge*(1.-phaseTwo);
        float lifted=smoothstep(.65,3.8,worldPoint.y);
        opacity*=mix(.55,.86,phaseTwo)*(1.-lifted*mix(.61,.43,phaseTwo));
        float palace=smoothstep(12.,36.,worldPoint.z)*phaseTwo;
        opacity+=palace*edge*body*(.13+.28*n)*smoothstep(.13,.76,patchNoise+.20*n)*smoothstep(10.,28.,distanceToEye);
        dust=mix(dust,vec3(.52,.49,.37),palace*.84);
        dust*=1.-.21*intoGate;
        dust*=.92+.12*n;
        dust+=vec3(.052,.047,.017)*(1.-lifted)*(1.-phaseTwo);
        gl_FragColor=vec4(dust*(.90+.31*n),min(1.,opacity));
      }`,
  });
  const banks=new T.InstancedMesh(geometry,material,bankCount),dummy=new T.Object3D();
  for(let i=0;i<bankCount;i++){
    const row=Math.floor(i/6),col=i%6;
    const x=(col-2.5)*13+(row%2)*5;
    dummy.position.set(x,1.0+(i%3)*.31,-29-row*17+Math.sin(i*2.4)*5);
    dummy.rotation.y=Math.sin(i*1.73)*.43;
    const opening=1-.38*(1-T.MathUtils.smoothstep(Math.abs(x),1.0,11.0));
    dummy.scale.set(19+(i%4)*5,opening*(3.1+(i%5)*.67),1);
    if(i>=23){
      const a=(i-23)*2.399963,r=43+(i%5)*4;
      dummy.position.set(Math.sin(a)*r,1.55+(i%4)*.42,-18+Math.cos(a)*r);
      dummy.rotation.y=a+.26*Math.sin(i);
      dummy.scale.set(15+(i%6)*3,3.4+(i%4)*1.24,1);
      if(dummy.position.z>12){dummy.scale.x*=1.28;dummy.scale.y*=1.52;dummy.position.y+=.98;}
    }else if(row===3){
      dummy.position.set((col-2)*12+.7,1.0,-12-Math.cos(col*2.7)*6);
      dummy.scale.set(13+col%3*5,2.0+col%2*.8,1);
    }
    dummy.updateMatrix();banks.setMatrixAt(i,dummy.matrix);
  }
  banks.name='gateway-ground-mist';banks.computeBoundingSphere();scene.add(banks);
  return material.uniforms;
}

// Primary 6.4, 21.5, 22 and 52: the lower tree is a massive, hollowed
// fork; the pale upper region is broken by branches, never a set of panels.
export function makeSourceTree(scene){
 const root=new T.Group();root.name='source-great-tree';scene.add(root);
 root.rotation.y=Math.PI/4;root.position.set(59.3,0,89.7);
 let seed=311947;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const pieces=[],palePieces=[],flecks=[];
 function limb(points,radius,endRadius,detail=24,pale=false,flatten=1){
  const curve=new T.CatmullRomCurve3(points.map(p=>Array.isArray(p)?new T.Vector3(...p):p));
  const rings=Math.max(detail,radius>.35?points.length*6:6),sides=radius>7?40:radius>2?20:radius>.35?9:4;
  const frames=curve.computeFrenetFrames(rings,false),positions=[],uv=[],grain=[],thickness=[],indices=[];
  const phase=random()*6.28;
  for(let j=0;j<=rings;j++){
   const t=j/rings,c=curve.getPointAt(t),n=frames.normals[j],b=frames.binormals[j];
   const width=T.MathUtils.lerp(radius,endRadius,Math.pow(t,.81));
   for(let k=0;k<=sides;k++){
    const a=k/sides*Math.PI*2,warp=a+.16*Math.sin(t*9+phase);
    const folds=.20*Math.sin(warp*5+phase)+.11*Math.sin(warp*9-t*11)+.045*Math.sin(warp*19+t*24);
    const knots=.12*Math.sin(t*37+warp*3)+.04*Math.sin(t*93-warp*11);
    const erosion=radius>2?.06*Math.sin(t*177+a*17)*Math.sin(a*9+t*21):0;
    const w=width*(1+folds+knots+erosion),p=c.clone().addScaledVector(n,Math.cos(a)*w).addScaledVector(b,Math.sin(a)*w*flatten);
    positions.push(p.x,p.y,p.z);uv.push(k/sides,t);grain.push(k/sides,t);thickness.push(width);
    if(j<rings&&k<sides){const q=j*(sides+1)+k;indices.push(q,q+1,q+sides+1,q+1,q+sides+2,q+sides+1);}
   }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('treeGrain',new T.Float32BufferAttribute(grain,2));g.setAttribute('treeThickness',new T.Float32BufferAttribute(thickness,1));g.setIndex(indices);g.computeVertexNormals();(pale?palePieces:pieces).push(g);return curve;
 }
 const trunk=[[111,-12,-43],[114,10,-48],[108,27,-50],[102,42,-47],[103,62,-56],[115,86,-70],[111,112,-80],[96,143,-91]];
 limb(trunk,13.2,1.25,112,false,.77);
 limb([[124,-10,-59],[121,12,-55],[110,29,-48],[99,43,-40],[86,63,-31],[68,85,-22],[52,110,-28]],8.4,.90,92,false,.82);
 // Buttresses and ribs share the forks; deep valleys remain between them.
 for(let i=0;i<11;i++){
  const a=i*2.399,reach=22+random()*19;
  limb([[112+Math.cos(a)*reach,-7,-48+Math.sin(a)*reach],[114+Math.cos(a)*15,5,-48+Math.sin(a)*12],[109+Math.cos(a)*9,24,-49+Math.sin(a)*8],[104+Math.cos(a)*5,41,-47+Math.sin(a)*5]],2.1+random()*2.5,.3,28,false,.7);
 }
 const arms=[
  [[110,27,-48],[93,28,-34],[76,32,-25],[61,45,-20],[46,69,-17],[29,86,-23]],
  [[109,34,-48],[95,34,-66],[80,38,-85],[66,48,-103],[57,71,-112],[38,88,-123]],
  [[102,43,-49],[97,58,-71],[92,76,-94],[77,98,-117]],
  [[102,52,-46],[97,66,-19],[86,86,7],[62,109,31]],
  [[107,69,-60],[124,83,-84],[139,103,-105],[153,128,-118]],
  [[91,62,-32],[76,79,-11],[58,97,17],[26,124,41]],
  [[114,88,-71],[100,105,-87],[80,124,-106],[55,146,-115]],
  [[70,85,-23],[61,110,-8],[42,135,10],[16,155,23]],
  [[111,111,-79],[106,130,-58],[89,149,-44],[62,170,-36]],
  [[106,35,-48],[88,35,-49],[67,39,-46],[49,48,-39],[29,67,-36],[7,89,-32]],
  [[108,31,-53],[101,37,-65],[105,46,-80],[114,66,-99],[123,84,-110]],
  [[111,9,-48],[91,8,-31],[61,14,-13],[51,34,-20],[37,53,-26],[10,75,-35],[-27,84,-42]],
  [[119,12,-56],[133,29,-83],[124,45,-84],[109,58,-81],[89,75,-75],[65,95,-68]],
  [[119,30,-81],[114,34,-93],[118,42,-104],[126,50,-120],[133,59,-134],[133,75,-140]],
  [[106,53,-77],[109,60,-83],[122,70,-96],[128,80,-108],[136,91,-124]],

 ];
 const outerTwigs=[];
 function split(points,radius,depth){
  const curve=limb(points,radius,Math.max(.015,radius*.045),depth>=3?32:depth===2?14:7,false,.83);
  if(!depth){if(curve.getPoint(1).y>34)outerTwigs.push(curve);return;}
  for(let j=0;j<3;j++){
   const t=.30+j*.26+random()*.06,start=curve.getPoint(t),forward=curve.getTangent(t),sign=j%2?1:-1;
   const length=(depth===4?23:depth===3?22:depth===2?13:6.5)*(.7+random()*.6);
   const end=start.clone().addScaledVector(forward,length*.63).add(new T.Vector3((random()-.65)*length*.45,(random()-.08)*length*.77,sign*length*(.3+random()*.45)));
   const kink=new T.Vector3((random()-.5)*length*.34,(random()-.3)*length*.3,sign*length*.15);
   split([start,start.clone().lerp(end,.38).add(kink),start.clone().lerp(end,.69).addScaledVector(kink,-.4),end],radius*(.40+random()*.11),depth-1);
  }
 }
 arms.forEach((points,i)=>split(points,(i<2?7.3-i*.7:i>=13?3.25:i>=11?7.1:i>=9?4.85:4.4-(i-2)*.34)*.81,i>=13?3:4));
 // Periodic noise atlas: hardware interpolation replaces dozens of sine
 // hashes per pixel. Geometry and full-resolution rendering are unchanged.
 const noiseSide=256,noiseValues=new Uint8Array(noiseSide*noiseSide),noisePixels=new Uint8Array(noiseSide*noiseSide*4);let ns=723114;
 for(let i=0;i<noiseValues.length;i++){ns=(Math.imul(ns,1664525)+1013904223)>>>0;noiseValues[i]=ns>>>24;}
 for(let y=0;y<noiseSide;y++)for(let x=0;x<noiseSide;x++){const i=(y*noiseSide+x)*4;noisePixels[i]=noiseValues[y*noiseSide+x];noisePixels[i+1]=noiseValues[((y+17)%noiseSide)*noiseSide+(x+37)%noiseSide];noisePixels[i+2]=noisePixels[i];noisePixels[i+3]=255;}
 const treeNoiseTexture=new T.DataTexture(noisePixels,noiseSide,noiseSide,T.RGBAFormat);treeNoiseTexture.wrapS=treeNoiseTexture.wrapT=T.RepeatWrapping;treeNoiseTexture.minFilter=treeNoiseTexture.magFilter=T.LinearFilter;treeNoiseTexture.generateMipmaps=false;treeNoiseTexture.needsUpdate=true;
 const noise=`uniform sampler2D treeNoiseMap;
 float tn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=(i.xy+vec2(37.,17.)*i.z+f.xy+.5)/256.;vec2 rg=texture2D(treeNoiseMap,uv).rg;return mix(rg.r,rg.g,f.z);}`;
 const bark=new T.MeshStandardMaterial({color:0x24271e,roughness:1,envMapIntensity:.16});
 bark.onBeforeCompile=s=>{
  s.uniforms.treeNoiseMap={value:treeNoiseTexture};
  s.vertexShader='attribute vec2 treeGrain;attribute float treeThickness;varying vec2 barkUV;varying float barkWidth;varying vec3 treeLocal;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbarkUV=treeGrain;barkWidth=treeThickness;treeLocal=position;');
  s.fragmentShader='varying vec2 barkUV;varying float barkWidth;varying vec3 treeLocal;\n'+noise+'\n'+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float warp=tn(treeLocal*.14);float ridges=tn(vec3(barkUV.x*64.+warp*5.,barkUV.y*18.,1.));
   float flakes=tn(treeLocal*2.4)*.55+tn(treeLocal*7.7)*.30+tn(treeLocal*19.)*.15;
   diffuseColor.rgb*=mix(.22,1.4,smoothstep(.16,.78,ridges))*mix(.5,1.48,flakes);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.18,.13),smoothstep(.64,.84,tn(treeLocal*.8))*.3);
   float mantle=smoothstep(16.,41.,treeLocal.y)*smoothstep(.33,.70,flakes*.47+ridges*.53);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.070,.078,.061),mantle*(.10+.20*tn(treeLocal*1.6)));
  `);
  s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   float track=abs(fract(barkUV.x*3.+tn(vec3(barkUV.y*31.,2.,1.))*.51+sin(barkUV.y*19.)*.17)-.5);
   float fringe=(1.-smoothstep(.014,.054,track))*smoothstep(.34,.62,tn(treeLocal*.74));
   float split=(1.-smoothstep(.008,.024,track))*smoothstep(.32,.67,tn(treeLocal*.9));
   split*=smoothstep(5.5,10.,barkWidth)*(1.-smoothstep(37.,71.,treeLocal.y));
   totalEmissiveRadiance+=vec3(1.55,.66,.065)*split+vec3(.32,.105,.012)*fringe*smoothstep(5.5,10.,barkWidth)*(1.-smoothstep(37.,71.,treeLocal.y));
  `);
  s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float roughHeight=tn(treeLocal*2.4)*.045+tn(treeLocal*9.)*.008;
   vec3 dx=dFdx(vViewPosition),dy=dFdy(vViewPosition),r1=cross(dy,normal),r2=cross(normal,dx);
   float determinant=dot(dx,r1);normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(roughHeight)*r1+dFdy(roughHeight)*r2));
  `);
  s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb','fogFactor*=.42;gl_FragColor.rgb'));
 };bark.customProgramCacheKey=()=> 'source-tree-az-fork';
 const join=(gs,mat)=>{const g=mergeGeometries(gs.map(g=>g.index?g.toNonIndexed():g));const m=new T.Mesh(g,mat);root.add(m);gs.forEach(g=>g.dispose());return m;};
 const tree=join(pieces,bark);tree.receiveShadow=true;
 // At 49.5–52 s pale sprays pick out the forks against the backlight.
 // Keep holes between the forks; the silver detail follows each curved limb.
 const sprays=[],tones=[],faces=[];
 function spray(base,axis,scale){
   const az=random()*Math.PI*2,side=new T.Vector3(Math.cos(az),.07,Math.sin(az));
   const up=new T.Vector3(0,1,0),spine=axis.clone().multiplyScalar(.58).addScaledVector(side,.73).normalize();
   const across=new T.Vector3().crossVectors(spine,up).normalize();
   for(let j=0;j<6;j++){
     const f=(j+.5)/6,along=base.clone().addScaledVector(spine,scale*(f-.17));
     for(const sign of [-1,1]){
       const tip=along.clone().addScaledVector(across,sign*scale*(.34+.19*Math.sin(f*2.8)));
       tip.addScaledVector(spine,scale*(.10+.08*random()));tip.y-=scale*(.06+.17*f);
       const mid=along.clone().lerp(tip,.51);mid.y+=scale*(.04+.055*random());
       const w=scale*(.021+.032*random()),n=sprays.length/3,tone=.50+random()*.39;
       for(const v of [along,mid.clone().addScaledVector(spine,-w),tip,mid.clone().addScaledVector(spine,w)]){
         sprays.push(v.x,v.y,v.z);tones.push(tone*.91,tone*.95,tone*.83);
       }
       faces.push(n,n+1,n+2,n,n+2,n+3);
     }
   }
 }
 for(const twig of outerTwigs){
   for(let j=0;j<3;j++){
     const t=.11+.76*random(),pos=twig.getPoint(t);
     if(pos.y>29)spray(pos,twig.getTangent(t),1.6+3.2*random());
   }
 }
 for(const guide of arms){
   const curve=new T.CatmullRomCurve3(guide.map(p=>new T.Vector3(...p)));
   const count=guide===arms[11]||guide===arms[12]?145:55;
   for(let k=0;k<count;k++){
     const t=.12+.81*random(),axis=curve.getTangentAt(t),point=curve.getPointAt(t);
     const side=new T.Vector3().crossVectors(axis,new T.Vector3(0,1,0)).normalize();
     point.addScaledVector(side,(random()-.5)*3.5);point.y+=1.0+1.20*random();
     spray(point,axis,1.9+3.5*random());
   }
 }
 // Fine branching clumps scatter the backlight. Each patch grows from a
 // physical bough and has a pitched surface, so it keeps depth as the player turns.
 const fibers=document.createElement('canvas');fibers.width=fibers.height=256;
 const pen=fibers.getContext('2d');pen.lineCap='round';
 function fork(x,y,angle,length,depth){
   const endX=x+Math.cos(angle)*length,endY=y+Math.sin(angle)*length;
   const tone=167+Math.floor(random()*76);
   pen.strokeStyle='rgba('+tone+','+Math.min(255,tone+4)+','+tone+','+(.36+random()*.48)+')';
   pen.lineWidth=depth*.57+.7;pen.beginPath();pen.moveTo(x,y);
   pen.quadraticCurveTo((x+endX)*.5+(random()-.5)*length*.25,(y+endY)*.5,endX,endY);pen.stroke();
   if(depth===0){
     for(let k=0;k<6;k++){
       const r=1.3+random()*4.3;
       pen.beginPath();pen.ellipse(endX+(random()-.5)*11,endY+(random()-.5)*9,r,r*.44,angle+random(),0,Math.PI*2);
       pen.fillStyle='rgba(237,240,223,.44)';pen.fill();
     }
     return;
   }
   fork(endX,endY,angle-.21-random()*.48,length*(.57+.21*random()),depth-1);
   fork(endX,endY,angle+.17+random()*.49,length*(.56+.22*random()),depth-1);
 }
 for(let i=0;i<9;i++)fork(124+(random()-.5)*68,247-random()*20,-Math.PI/2+(random()-.5)*1.20,32+random()*30,4);
 const fiberTexture=new T.CanvasTexture(fibers);fiberTexture.colorSpace=T.SRGBColorSpace;fiberTexture.anisotropy=4;
 const fiberMaterial=new T.MeshBasicMaterial({map:fiberTexture,color:new T.Color(.98,1.02,.94),transparent:true,opacity:.84,side:T.DoubleSide,depthWrite:false,forceSinglePass:true});
 const fans=[],fanUV=[],fanIndices=[];
 for(const [index,guide] of arms.entries()){
   const curve=new T.CatmullRomCurve3(guide.map(p=>new T.Vector3(...p)));
   const count=index>=11?135:44;
   for(let i=0;i<count;i++){
     const f=.46+.50*random(),base=curve.getPointAt(f);
     if(base.y<39)continue;
     const dir=curve.getTangentAt(f),a=random()*Math.PI*2;
     const side=new T.Vector3(Math.cos(a),0,Math.sin(a)),rise=dir.multiplyScalar(.39).add(new T.Vector3(0,.89,0)).normalize();
     const width=2.4+random()*4.2,height=5.5+random()*8.5,lead=1.1+random()*3;
     base.addScaledVector(side,(random()-.5)*3.7);
     const n=fans.length/3;
     for(let row=0;row<=2;row++)for(const e of [-1,0,1]){
       const t=row/2;
       const v=base.clone().addScaledVector(rise,t*height).addScaledVector(side,e*width*(.50+.50*t));
       v.x+=side.z*lead*t*t;v.z-=side.x*lead*t*t;
       if(!e){v.x+=side.z*t*1.4;v.z-=side.x*t*1.4;}
       fans.push(v.x,v.y,v.z);fanUV.push((e+1)/2,t);
     }
     for(let row=0;row<2;row++)for(let col=0;col<2;col++){
       const k=n+row*3+col;fanIndices.push(k,k+3,k+1,k+1,k+3,k+4);
     }
   }
 }
 const skin=new T.BufferGeometry();
 skin.setAttribute('position',new T.Float32BufferAttribute(fans,3));skin.setAttribute('uv',new T.Float32BufferAttribute(fanUV,2));skin.setIndex(fanIndices);
 const fineCover=new T.Mesh(skin,fiberMaterial);fineCover.name='backlit-fork-fibers';root.add(fineCover);
 const sprayGeometry=new T.BufferGeometry();
 sprayGeometry.setAttribute('position',new T.Float32BufferAttribute(sprays,3));
 sprayGeometry.setAttribute('color',new T.Float32BufferAttribute(tones,3));
 sprayGeometry.setIndex(faces);sprayGeometry.computeVertexNormals();
 const silver=new T.MeshStandardMaterial({vertexColors:true,color:0xb8bfaf,roughness:.93,emissive:0x929b88,emissiveIntensity:.24,side:T.DoubleSide});
 const cover=new T.Mesh(sprayGeometry,silver);cover.name='silver-fork-sprays';root.add(cover);

 // Silvery growth occupies the whole thickness of each upper fork. The
 // coarser layer scatters light through the gaps between the twig sprays.
 const clumps=[];
 for(const [index,points] of arms.entries()){
   const curve=new T.CatmullRomCurve3(points.map(point=>new T.Vector3(...point)));
   const count=index>=9?19:11;
   for(let j=0;j<count;j++){
     const f=.48+.49*(j+.3*random())/count;
     const center=curve.getPointAt(f);
     if(center.y<23)continue;
     const tangent=curve.getTangentAt(f);
     const lateral=new T.Vector3(tangent.z,0,-tangent.x).normalize();
     center.addScaledVector(lateral,(random()-.5)*12);
     center.y+=3+random()*6;
     const scale=2.8+random()*2.6;
     const lobe=new T.Object3D();
     lobe.position.copy(center);lobe.rotation.y=Math.atan2(tangent.x,tangent.z);
     lobe.scale.set(scale*(.82+.42*random()),scale*(.53+.26*random()),scale*(1.6+.75*random()));
     lobe.updateMatrix();clumps.push(lobe.matrix);
   }
 }
 // At the canopy edge the pale growth fans out from branch tips, leaving
 // the trunk and the openings between separate boughs visible underneath.
 for(let i=0;i<outerTwigs.length;i+=3){
   const twig=outerTwigs[i],fraction=.55+.31*(.5+.5*Math.sin(i*1.83));
   const axis=twig.getTangent(fraction),center=twig.getPoint(fraction);
   if(center.y<30)continue;
   const size=2.6+2.0*(.5+.5*Math.sin(i*2.37)),tuft=new T.Object3D();
   tuft.position.copy(center).addScaledVector(axis,size*.22);
   tuft.position.y+=size*.30;
   tuft.rotation.set(.18*Math.sin(i),Math.atan2(axis.x,axis.z),.17*Math.cos(i));
   tuft.scale.set(size*.88,size*.60,size*1.44);
   tuft.updateMatrix();clumps.push(tuft.matrix);
 }
 const scattered=new T.ShaderMaterial({uniforms:{treeNoiseMap:{value:treeNoiseTexture}},
   transparent:true,depthWrite:false,side:T.FrontSide,
   vertexShader:`varying vec3 growthPoint,growthWorld,growthNormal;
     void main(){vec4 p=instanceMatrix*vec4(position,1.);
       growthPoint=p.xyz;vec4 w=modelMatrix*p;growthWorld=w.xyz;
       vec3 squared=vec3(dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz),
         dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz),dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz));
       growthNormal=mat3(modelMatrix)*mat3(instanceMatrix)*(normal/squared);
       gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:'varying vec3 growthPoint,growthWorld,growthNormal;'+noise+`void main(){
     vec3 p=growthPoint,view=normalize(cameraPosition-growthWorld);
     float thickness=abs(dot(normalize(growthNormal),view));
     float broad=tn(p*.13)*.58+tn(p*.37)*.28+tn(p*.95)*.14;
     float threads=tn(p*vec3(.46,.19,.51)+vec3(broad*2.));
     float lace=tn(p*vec3(1.1,.50,1.26)+vec3(threads*1.7));
     float coverage=smoothstep(.25,.64,broad*.76+lace*.24)*smoothstep(.06,.50,thickness);
     float alpha=coverage*(.08+.18*threads)*mix(.58,1.,smoothstep(.22,.68,lace));
     float inner=smoothstep(70.,110.,p.x)*smoothstep(42.,77.,-p.z);
     float rim=1.-thickness;
     vec3 tone=mix(vec3(.17,.19,.16),vec3(.79,.81,.72),smoothstep(.22,.83,.35*threads+.25*broad+.16*lace+.24*rim));
     tone=mix(tone,vec3(.22,.26,.22),inner*coverage*(.38+.36*thickness));
     tone*=1.-.16*coverage*thickness;
     gl_FragColor=vec4(tone,alpha*(1.+.24*inner));
   }`});
 const silverMass=new T.InstancedMesh(new T.SphereGeometry(1,24,16),scattered,clumps.length);
 for(let i=0;i<clumps.length;i++)silverMass.setMatrixAt(i,clumps[i]);
 silverMass.computeBoundingSphere();silverMass.name='backlit-crown-clusters';root.add(silverMass);

 // The pale region is interrupted by the dark upper branches. Irregular
 // radial veils fill some gaps; none has a rectangular outer boundary.
 const veil=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,uniforms:{treeNoiseMap:{value:treeNoiseTexture}},
  vertexShader:'varying vec2 v;varying vec3 p;void main(){v=uv;p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec2 v;varying vec3 p;'+noise+`void main(){
   float edge=1.-smoothstep(.58,.99,v.y);float n=tn(p*.10),m=tn(p*.37);
   float fiber=tn(vec3(p.x*.22+p.y*.05,p.y*.14,p.z*.22));
   float openings=tn(p*.69+vec3(2.3,0.,1.7));
   float alpha=edge*smoothstep(.32,.73,n*.65+m*.35)*(.10+.18*fiber)*mix(.48,1.,smoothstep(.26,.66,openings));
   gl_FragColor=vec4(mix(vec3(.59,.64,.58),vec3(.85,.89,.83),n*.5+fiber*.5),alpha);
  }`});
 const forkVeils=[[25,61,-31],[97,72,-79],[76,84,-72]];
 for(let k=0;k<8+forkVeils.length;k++){
  const lower=k>=8;
  const center=lower?new T.Vector3(...forkVeils[k-8]):new T.Vector3(92-k*4,75+k*9,-56+(k%3-1)*25);
  const positions=[],uv=[],indices=[],rings=9,sides=38;
  const theta=-.75+(k%3)*.3,tangent=new T.Vector3(Math.cos(theta),0,-Math.sin(theta));
  for(let j=0;j<=rings;j++)for(let i=0;i<=sides;i++){
   const a=i/sides*Math.PI*2,r=j/rings,outline=1+.15*Math.sin(a*5+k)+.08*Math.cos(a*11-k);
   const x=Math.cos(a)*(lower?19:32)*r*outline,y=Math.sin(a)*(lower?21:48)*r*outline;
   const p=center.clone().addScaledVector(tangent,x).add(new T.Vector3(Math.sin(y*.05+k)*3,y,Math.sin(a*3+k)*r*4));
   positions.push(p.x,p.y,p.z);uv.push(i/sides,r);
   if(j<rings&&i<sides){const q=j*(sides+1)+i;indices.push(q,q+1,q+sides+1,q+1,q+sides+2,q+sides+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);root.add(new T.Mesh(g,veil));
 }
 // In the upward close view the pale cover hangs through the upper fork.
 // Attach these frayed edges to actual boughs so a side view has thickness.
 const drapePos=[],drapeUV=[],drapeColors=[],drapeIndices=[];
 for(let branch=0;branch<arms.length;branch++){
  const curve=new T.CatmullRomCurve3(arms[branch].map(p=>new T.Vector3(...p)));
  for(let cluster=0;cluster<10;cluster++){
   const anchor=curve.getPointAt(.43+.50*random());
   if(anchor.y<35)continue;
   const theta=random()*2*Math.PI,side=new T.Vector3(Math.cos(theta),0,Math.sin(theta));
   const length=5+random()*17,drift=2+random()*5,phase=random()*6.28;
   for(let strand=0;strand<7;strand++){
    const tip=length*(.65+.50*random()),spread=(strand-3)*.92;
    const first=drapePos.length/3,w=.36+.95*random(),tint=.65+random()*.32;
    for(let j=0;j<=12;j++){
     const f=j/12,ease=Math.sin(f*Math.PI),curveSide=spread+f*drift+ease*Math.sin(phase+f*6)*2.1;
     const width=w*(.52+.48*ease)*Math.pow(1-.995*f,.72);
     for(const edge of [-1,1]){
      const across=curveSide+edge*width;
      drapePos.push(anchor.x+side.x*across-side.z*ease*2.2,anchor.y-tip*f,
        anchor.z+side.z*across+side.x*ease*2.2);
      drapeUV.push((edge+1)/2,f);drapeColors.push(tint*.90,tint*.94,tint);
     }
     if(j<12){const n=first+j*2;drapeIndices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
   }
  }
 }
 const fringeGeometry=new T.BufferGeometry();
 fringeGeometry.setAttribute('position',new T.Float32BufferAttribute(drapePos,3));
 fringeGeometry.setAttribute('uv',new T.Float32BufferAttribute(drapeUV,2));
 fringeGeometry.setAttribute('color',new T.Float32BufferAttribute(drapeColors,3));
 fringeGeometry.setIndex(drapeIndices);fringeGeometry.computeVertexNormals();
 const fiberCanvas=document.createElement('canvas');fiberCanvas.width=64;fiberCanvas.height=256;
 const fiberContext=fiberCanvas.getContext('2d');
 for(let i=0;i<38;i++){
  const start=2+random()*60,end=120+random()*136;
  fiberContext.strokeStyle='rgba(255,255,255,'+(.18+.4*random())+')';
  fiberContext.lineWidth=.6+random()*2.1;fiberContext.beginPath();
  fiberContext.moveTo(start,0);fiberContext.bezierCurveTo(start+6,40,start-5,112,32+(start-32)*.54,end);fiberContext.stroke();
 }
 const fringeMaterial=new T.MeshStandardMaterial({map:new T.CanvasTexture(fiberCanvas),vertexColors:true,
  color:0xd9d9cd,roughness:1,transparent:true,opacity:.67,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
 const fringe=new T.Mesh(fringeGeometry,fringeMaterial);fringe.name='pale-bough-fringe';root.add(fringe);
 // Lace the tips of the dark forks with small ash-pale sprays. Unlike
 // the distant haze these have depth when viewed across the trunk.
 const leaves=[],leafColors=[],leafIndex=[];
 for(let i=0;i<outerTwigs.length;i+=3){
   const curve=outerTwigs[i],twist=i*2.39996;
   for(let j=0;j<7;j++){
     const at=.27+j*.107,base=curve.getPoint(at),axis=curve.getTangent(at);
     const a=twist+j*2.4,side=new T.Vector3(Math.cos(a),.2,Math.sin(a)),length=1.4+.79*(1+Math.sin(i+j*4.1));
     const tip=base.clone().addScaledVector(side,length).addScaledVector(axis,.62);tip.y-=.46+j*.07;
     const mid=base.clone().lerp(tip,.5),cross=new T.Vector3(-side.z,0,side.x).multiplyScalar(.20+.19*Math.sin(j*2.6)**2);
     mid.y+=.23;const n=leaves.length/3,light=.50+.23*(.5+.5*Math.sin(i*.76+j));
     for(const [v,tint] of [[base,.57],[mid.clone().add(cross),1.1],[mid.clone().sub(cross),.81],[tip,1.22]]){
       leaves.push(v.x,v.y,v.z);leafColors.push(light*tint*.93,light*tint*.97,light*tint*.86);
     }
     leafIndex.push(n,n+1,n+2,n+1,n+3,n+2);
   }
 }
 const leafGeo=new T.BufferGeometry();leafGeo.setAttribute('position',new T.Float32BufferAttribute(leaves,3));
 leafGeo.setAttribute('color',new T.Float32BufferAttribute(leafColors,3));leafGeo.setIndex(leafIndex);leafGeo.computeVertexNormals();
 const crown=new T.Mesh(leafGeo,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:1,emissive:0x343727,emissiveIntensity:.15}));
 crown.name='pale-terminal-sprays';root.add(crown);
 // Small ragged silhouettes under the broad lower bough, visible at 21.5.
 for(let i=0;i<260;i++){
  const a=random()*6.28,t=random(),x=80+random()*35,y=16+random()*20,z=-49+Math.sin(a)*14;
  const g=new T.PlaneGeometry(.13+random()*.3,.3+random()*.65);g.rotateY(a);g.rotateZ(random());g.translate(x,y,z);flecks.push(g);
 }
 const fm=new T.MeshBasicMaterial({color:0x393b2c,side:T.DoubleSide});const fg=mergeGeometries(flecks);root.add(new T.Mesh(fg,fm));flecks.forEach(g=>g.dispose());
 root.userData.landmark={source:'primary 6.4 / 21.5 / 22 / 52',base:[118,-12,-30],geometryEstimated:true};
 return root;
}

export function makeSourceSteps(scene){
 // Primary 6.4: a narrow high end, broad buried lower treads, irregular slab
 // joints. The footage does not establish a separate middle landing.
 const pieces=[],stone=new T.MeshStandardMaterial({color:0x716956,roughness:.9});
 const prints=[new T.Vector3(1000,0,1000),new T.Vector3(1000,0,1000)];
 const STEPS=18,rise=ARENA.landing/STEPS,tread=(ARENA.stairFoot-ARENA.stairTop)/STEPS;
 stone.onBeforeCompile=s=>{
  s.uniforms.contactA={value:prints[0]};s.uniforms.contactB={value:prints[1]};
  s.vertexShader='varying vec3 stairPoint;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstairPoint=(modelMatrix*vec4(position,1.)).xyz;');
  s.fragmentShader=`#define STAIR_RISE ${rise.toFixed(4)}
uniform vec3 contactA,contactB;varying vec3 stairPoint;float sh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}float sn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(sh(i),sh(i+vec3(1,0,0)),f.x),mix(sh(i+vec3(0,1,0)),sh(i+vec3(1,1,0)),f.x),f.y),mix(mix(sh(i+vec3(0,0,1)),sh(i+vec3(1,0,1)),f.x),mix(sh(i+vec3(0,1,1)),sh(i+1.),f.x),f.y),f.z);}`+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float weather=sn(stairPoint*.9)*.55+sn(stairPoint*4.8)*.3+sn(stairPoint*25.)*.15;
   float rim=abs(fract(stairPoint.y/STAIR_RISE)-.09);float joint=(1.-smoothstep(.018,.075,rim))*.4;
   vec3 stairN=normalize(cross(dFdx(stairPoint),dFdy(stairPoint)));
     float top=abs(stairN.y);
     float seam=sn(stairPoint*vec3(2.1,.7,.6))*sn(stairPoint*4.8);
     diffuseColor.rgb*=mix(.47,1.34,weather)*mix(.58,1.,top)*(1.-joint*.55)*(1.-.32*smoothstep(.4,.7,seam));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.27,.20),smoothstep(.58,.78,sn(stairPoint*.45))*.30);
   float drift=(1.-smoothstep(.35,4.8,stairPoint.y))*smoothstep(.3,.74,weather+.13*sn(stairPoint*.37));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.28,.257,.204),drift*(.19+.23*top));
   // Dry chipped stone flakes catch the light along short, irregular bedding planes.
   float nearDetail=1.-smoothstep(7.,23.,distance(stairPoint,cameraPosition));
   vec2 grainPoint=stairPoint.xz;
   grainPoint.x+=.26*sn(stairPoint*2.4)+.08*sn(stairPoint*11.);
   float slab=sn(vec3(grainPoint*vec2(5.8,1.65),.38));
   float grit=sn(vec3(grainPoint*vec2(57.,18.),2.1));
   float fissure=(1.-smoothstep(.014,.075,abs(slab-.47)))*smoothstep(.32,.63,grit);
   float flake=smoothstep(.40,.72,slab*.69+grit*.31);
   diffuseColor.rgb*=mix(1.,(.54+.75*flake+.21*grit)*(1.-.72*fissure),nearDetail*top);
  `);
  s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',`
    vec2 da=(stairPoint.xz-contactA.xz)*vec2(6.3,3.5);
    vec2 db=(stairPoint.xz-contactB.xz)*vec2(6.3,3.5);
    float contact=max(exp(-dot(da,da))*exp(-6.*abs(contactA.y-stairPoint.y)),
                      exp(-dot(db,db))*exp(-6.*abs(contactB.y-stairPoint.y)));
    outgoingLight*=1.-.66*contact;
    #include <opaque_fragment>`);
  s.fragmentShader=s.fragmentShader.replace('}#define STANDARD','}\n#define STANDARD');
 };stone.customProgramCacheKey=()=> 'source-weathered-stairs-y';
 let seed=761;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<STEPS;i++){
  // Primary 4.0 s: broad worn treads narrow to the landing between the gate piers.
  const y=rise*(i+1),width=12.9+3.8*Math.pow(1-i/STEPS,1.65),z=ARENA.stairFoot-(i+.5)*tread,segments=i<7?7:6;
  const boundaries=[-width/2];
    for(let j=1;j<segments;j++)boundaries.push((j/segments-.5)*width+(random()-.5)*width/segments*.67);
    boundaries.push(width/2);
    for(let j=0;j<segments;j++){
     const w=boundaries[j+1]-boundaries[j],g=new T.BoxGeometry(w-.025,y+.12,tread+.07,8,2,4),p=g.attributes.position;
   for(let k=0;k<p.count;k++){
    const x=p.getX(k)+(boundaries[j]+boundaries[j+1])/2,zz=p.getZ(k)+z;
    const edge=(p.getZ(k)>.45?1:0),outer=Math.abs(x)/(width/2);
      const chip=Math.max(0,1-Math.abs(x-(boundaries[j]+w*.23))/.48);
      const wear=(.022+.090*Math.sin(x*3.7+i*3)**2+.13*outer*outer+.17*chip)*edge;
      const subsidence=(.03+.10*outer)*Math.sin(j*3.7+i*2.3);
    p.setXYZ(k,x,p.getY(k)+y/2-.08+subsidence-(p.getY(k)>0?wear:0),zz+.065*Math.sin(x*2.6+i*4)+.032*Math.cos(x*8+i)-edge*chip*.24);
   }
   g.computeVertexNormals();pieces.push(g);
  }
  // Short broken noses remain parts of the slab, not regular white stripes.
  for(let j=0;j<4;j++){
   const x=(random()-.5)*width,g=new T.DodecahedronGeometry(.10+random()*.14,0);g.scale(1.6,.35,.9);g.translate(x,y-.02,z+.46);pieces.push(g);
  }
 }
 const landing=new T.BoxGeometry(13.4,ARENA.landing+.4,15,12,1,10);landing.translate(0,ARENA.landing/2-.19,ARENA.stairTop-7.45);pieces.push(landing);
 const geometry=mergeGeometries(pieces.map(g=>g.index?g.toNonIndexed():g));const mesh=new T.Mesh(geometry,stone);mesh.name='source-worn-gateway-stairs';mesh.userData.soleContacts=prints;mesh.receiveShadow=true;scene.add(mesh);pieces.forEach(g=>g.dispose());return mesh;
}

// Primary 16.5 / 21.5: layered carved pier, distinct from the plain fluted
// columns elsewhere in the arena. Recesses and mouldings are real geometry.
export function makeCarvedPillar(scene,stone,dark,x,z,height,worn=false){
 const root=new T.Group();root.name='source-carved-pier';root.position.set(x,0,z);scene.add(root);
 const parts=new Map(),put=(g,m,x,y,z,ry=0)=>{const a=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),ry),new T.Vector3(1,1,1));g.applyMatrix4(a);if(!parts.has(m))parts.set(m,[]);parts.get(m).push(g);};
 const radius=5.1,face=radius*Math.cos(Math.PI/8),shaft=height-7;
 put(new T.CylinderGeometry(radius*.91,radius*.93,shaft,8),dark,0,shaft/2+7,0,Math.PI/8);
 for(const [y,r,h] of [[1,7.4,2],[2.4,6.9,.7],[3.1,6.3,.6],[4.7,5.9,2.6],[6.4,6.35,.7],[7.2,5.8,.5]])put(new T.CylinderGeometry(r,r*1.035,h,8),stone,0,y,0,Math.PI/8);
 // Below the turning moulding, broad stone panels carry small upright and inverted finials.
 // From the first volley the east pier shows two distinct string courses,
 // one below the forked pendants and one just above them. The short third
 // register meets the existing climbing band at the original height.
 const tiers=worn?[[8,21],[32,21]]:[[7.8,15.0],[25.4,15.0],[43.0,10.9]];
 for(const [bottom,tall] of tiers){
  for(const [dy,rt,rb,h] of [[0,5.7,5.8,.50],[.8,5.4,5.6,.5],[tall,5.9,5.23,.85],[tall+.68,6.26,5.94,.51],[tall+1.2,6.26,6.26,.53],[tall+1.85,5.76,5.98,.78]])put(new T.CylinderGeometry(rt,rb,h,8),stone,0,bottom+dy,0,Math.PI/8);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,n=new T.Vector3(Math.sin(a),0,Math.cos(a)),u=new T.Vector3(Math.cos(a),0,-Math.sin(a));
   const center=n.clone().multiplyScalar(face+.05),w=1.16,archRise=2.5,base=bottom+1.5,top=base+tall-3.6;
   for(const sign of [-1,1]){
     const edge=center.clone().addScaledVector(u,sign*2.07).addScaledVector(n,.21);
     put(new T.CylinderGeometry(.26,.32,tall-1.8,10),stone,edge.x,bottom+tall*.5,edge.z,a);
     for(let k=0;k<3;k++){
       const at=bottom+1.2+k*(tall-3)*.5;
       put(new T.BoxGeometry(.67,.34,.54),stone,edge.x,at,edge.z,a);
     }
   }
   const shoulder=top-base-archRise,apex=top-base+.25,halfFace=radius*Math.sin(Math.PI/8);
   const plate=new T.Shape();
   plate.moveTo(-halfFace,-1.3);plate.lineTo(halfFace,-1.3);plate.lineTo(halfFace,tall-1.3);plate.lineTo(-halfFace,tall-1.3);plate.closePath();
   const opening=new T.Path();opening.moveTo(-w,0);opening.lineTo(-w,shoulder);
   opening.quadraticCurveTo(-w,apex-.98,0,apex);opening.quadraticCurveTo(w,apex-.98,w,shoulder);
   opening.lineTo(w,0);opening.closePath();plate.holes.push(opening);
   const cut=new T.ExtrudeGeometry(plate,{depth:.48,bevelEnabled:false,curveSegments:8});
   put(cut,stone,center.x-n.x*.48,base,center.z-n.z*.48,a);
   for(const edge of [-1,1]){
    const q=center.clone().addScaledVector(u,edge*1.72).addScaledVector(n,.17);
    put(new T.CylinderGeometry(.25,.27,tall-4.4,10),stone,q.x,base+(tall-4.4)/2,q.z);
    for(const y of [base+.15,top-2.5])put(new T.CylinderGeometry(.34,.36,.35,10),stone,q.x,y,q.z);
   }
   for(const sign of [-1,1]){
    const rib=new T.QuadraticBezierCurve3(new T.Vector3(sign*1.72,shoulder,0),new T.Vector3(sign*1.72,apex-.85,0),new T.Vector3(0,apex+.27,0));
    put(new T.TubeGeometry(rib,12,.235,8,false),stone,center.x+n.x*.22,base,center.z+n.z*.22,a);
   }
   // A recessed lancet reads in silhouette. Above its shoulders the spandrel
   // carries paired tapered leaves, with chipped lower lobes on the south pier.
   for(const sign of [-1,1]){
     const lost=worn&&(i+(bottom>20?3:0)+(sign>0?1:0))%4===0;
     const leaf=new T.Shape();
     leaf.moveTo(0,0);leaf.quadraticCurveTo(sign*.13,.64,sign*.72,1.18);
     leaf.quadraticCurveTo(sign*.43,.28,0,0);
     const relief=new T.ExtrudeGeometry(leaf,{depth:.20,bevelEnabled:false,curveSegments:7});
     const q=center.clone().addScaledVector(u,sign*.43).addScaledVector(n,.23);
     put(relief,stone,q.x,top+.08,q.z,a);
     if(!lost){
       const drop=new T.ConeGeometry(.26,1.20,6);drop.rotateZ(Math.PI);
       put(drop,stone,q.x,top-.47,q.z,a);
     }
   }
   // Raised stems and curling ribs inside the blind niche (primary 12.5 s).
   const back=center.clone().addScaledVector(n,-.20);
   const stemHeight=Math.min(5.2,tall*.24);
   put(new T.CylinderGeometry(.11,.39,stemHeight,8),stone,back.x,base+stemHeight/2,back.z,a);
   put(new T.BoxGeometry(1.02,.25,.43),stone,back.x,base+stemHeight*.66,back.z,a);
   for(const sign of [-1,1]){
    const foot=new T.QuadraticBezierCurve3(new T.Vector3(sign*.08,stemHeight*.74,0),new T.Vector3(sign*.15,stemHeight*.24,.07),new T.Vector3(sign*.91,.12,.10));
    put(new T.TubeGeometry(foot,9,.20,6,false),stone,back.x,base,back.z,a);
    const shoulderY=bottom+tall-1.1;
    const pendant=new T.CatmullRomCurve3([new T.Vector3(sign*1.48,.60,0),new T.Vector3(sign*1.14,-.84,.24),new T.Vector3(sign*.64,-1.48,.35),new T.Vector3(sign*.24,-3.68,.21)]);
    put(new T.TubeGeometry(pendant,12,.19,6,false),stone,center.x+n.x*.34,shoulderY,center.z+n.z*.34,a);
    const leaf=new T.SphereGeometry(.45,8,7);leaf.scale(.64,1.90,.48);leaf.rotateZ(-sign*.45);
    const q=center.clone().addScaledVector(u,sign*.94).addScaledVector(n,.58);
    put(leaf,stone,q.x,shoulderY-.55,q.z,a);
   }
   // The horizontal frieze is cut into a row of blind round arches. Put
   // the dark back slab behind the pierced face, and run a raised archivolt
   // around the opening. It remains legible when seen obliquely at 24 s.
   const band=n.clone().multiplyScalar(6.26*Math.cos(Math.PI/8)+.05);
   const bandY=bottom+tall-.41,span=2.37,archW=1.30,archH=1.13;
   put(new T.BoxGeometry(2*span,1.98,.16),dark,band.x,bandY+.99,band.z,a);
   const frieze=new T.Shape();
   frieze.moveTo(-span,0);frieze.lineTo(-archW,0);
   frieze.absellipse(0,0,archW,archH,Math.PI,0,true);
   frieze.lineTo(span,0);frieze.lineTo(span,2.11);
   frieze.lineTo(-span,2.11);frieze.closePath();
   const fret=new T.ExtrudeGeometry(frieze,{depth:.41,bevelEnabled:true,bevelSize:.05,bevelThickness:.07,bevelSegments:1,curveSegments:7});
   put(fret,stone,band.x+n.x*.10,bandY,band.z+n.z*.10,a);
   const arc=[];
   for(let k=0;k<=12;k++){const t=k*Math.PI/12;arc.push(new T.Vector3(1.43*Math.cos(t),1.29*Math.sin(t),0));}
   put(new T.TubeGeometry(new T.CatmullRomCurve3(arc),14,.17,6,false),stone,band.x+n.x*.54,bandY+.04,band.z+n.z*.54,a);
   // Two continuous chiselled ridges fan out from the inverted boss.
   // Their triangular section has different normals on its two sides,
   // carrying the edge through haze even where texture contrast is low.
   const ridge=(path,halfWidth)=>{
     const vertices=[],faces=[],uvs=[];
     const points=new T.CatmullRomCurve3(path).getPoints(12);
     for(let j=0;j<points.length;j++){
       const here=points[j],tangent=points[Math.min(j+1,12)].clone().sub(points[Math.max(0,j-1)]);
       const perp=new T.Vector2(-tangent.y,tangent.x).normalize(),f=j/12;
       const width=halfWidth*(.06+.94*Math.sin(Math.PI*f)**.57);
       for(const side of [-1,0,1]){
         vertices.push(here.x+side*width*perp.x,here.y+side*width*perp.y,here.z+(side===0?width*1.15:0));
         uvs.push((side+1)*.5,f);
       }
       if(j){const b=j*3;faces.push(b-3,b,b-2,b-2,b,b+1,b-2,b+1,b-1,b-1,b+1,b+2);}
     }
     const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(faces);
     const facets=g.toNonIndexed();facets.computeVertexNormals();g.dispose();return facets;
   };
   for(const sign of [-1,1]){
     const path=[new T.Vector3(sign*1.70,-.08,.03),new T.Vector3(sign*1.37,-1.28,.13),
       new T.Vector3(sign*.65,-2.31,.33),new T.Vector3(sign*.41,-3.35,.36),new T.Vector3(sign*.50,-4.69,.18)];
     put(ridge(path,.33),stone,center.x+n.x*.43,bottom+tall-.31,center.z+n.z*.43,a);
   }
  }
 }

 // On the two colossal piers, double pendants curl below the corner of each
 // principal ledge (47.94 s and 125.3 s), breaking the silhouette on a turn.
 for(const [bottom,tall] of tiers){
  for(let i=0;i<8;i++){
   const a=(i+.5)*Math.PI/4, nx=Math.sin(a),nz=Math.cos(a);
   const y=bottom+tall+.23;
   for(const hand of [-1,1]){
    const wornTip=worn&&(i+(hand>0?1:0))%3===0;
    const curl=hangingCrocket(-hand,wornTip?2.0:3.55,.90,wornTip?.65:.94);
    put(curl,stone,nx*5.16+nz*hand*.78,y,nz*5.16-nx*hand*.78,a);
   }
   const springer=new T.CylinderGeometry(.52,.31,.85,6);
   put(springer,stone,nx*5.52,y-.30,nz*5.52,a);
  }
 }
 // In the upper register, square recessed panels sit behind a rising stepped band
 // (primary 47.94 and 125.3 s). The band follows the octagonal faces around the pier.
 const upperBase=56,upperHeight=height-upperBase,turns=Math.max(2,Math.round(upperHeight/16));
 const course=upperHeight/turns;
 for(let floor=0;floor<turns;floor++){
  const y=upperBase+floor*course;
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,n=new T.Vector3(Math.sin(a),0,Math.cos(a)),u=new T.Vector3(n.z,0,-n.x);
   const center=n.clone().multiplyScalar(face-.03);
   const panel=new T.Shape();const width=radius*Math.sin(Math.PI/8);
   panel.moveTo(-width,0);panel.lineTo(width,0);panel.lineTo(width,course);panel.lineTo(-width,course);panel.closePath();
   const slot=new T.Path(),sw=.76,top=course-2.8;slot.moveTo(-sw,1.3);slot.lineTo(-sw,top);
   slot.absarc(0,top,sw,Math.PI,0,true);slot.lineTo(sw,1.3);slot.closePath();panel.holes.push(slot);
   put(new T.ExtrudeGeometry(panel,{depth:.34,bevelEnabled:false,curveSegments:6}),stone,center.x-n.x*.34,y,center.z-n.z*.34,a);
   for(const sign of [-1,1]){
    const edge=center.clone().addScaledVector(u,sign*1.55).addScaledVector(n,.12);
    put(new T.BoxGeometry(.36,course,.42),stone,edge.x,y+course/2,edge.z,a);
    const cap=center.clone().addScaledVector(u,sign*1.55).addScaledVector(n,.20);
    put(new T.BoxGeometry(.65,.46,.58),stone,cap.x,y+course-2.42,cap.z,a);
   }
  }
 }
 const profile=[[5.06,0],[5.74,.07],[5.79,.30],[6.19,.42],[6.30,.66],[6.30,.88],[5.85,1.02],[5.90,1.27],[6.18,1.36],[6.46,1.59],[6.46,1.96],[5.06,2.03]];
 const pos=[],index=[],steps=turns*8;
 for(let i=0;i<=steps;i++){
  const az=(i/8)*Math.PI*2+Math.PI/8;
  const y=upperBase+(upperHeight-2.03)*i/steps;
  for(const [r,h] of profile)pos.push(Math.sin(az)*r,y+h,Math.cos(az)*r);
  if(i===0)continue;
  for(let k=0;k<profile.length-1;k++){
   const b=i*profile.length+k,a=b-profile.length;
   index.push(a,b,b+1,a,b+1,a+1);
  }
 }
 const ledge=new T.BufferGeometry();ledge.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 ledge.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:pos.length/3},(_,i)=>[i%profile.length/(profile.length-1),Math.floor(i/profile.length)/8]).flat(),2));
 ledge.setIndex(index);const courses=ledge.toNonIndexed();courses.computeVertexNormals();ledge.dispose();put(courses,stone,0,0,0);
 for(const [material,geometries] of parts){const g=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g)),m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;root.add(m);geometries.forEach(g=>g.dispose());}
 return root;
}

export function makeCrownedPalace(scene,stone,dark,flank=false,place=null){
 const root=new T.Group();root.name=flank?'source-flanking-palace':'source-crowned-palace';
 if(place){root.position.set(place.x,place.y||0,place.z);root.rotation.y=place.rotation;root.scale.set(...(place.scale||[1,1,1]));}
 else if(flank){root.position.set(49,0,91);root.rotation.y=-2.36;}
 else{root.position.set(-90.6,0,49.8);root.rotation.y=2.43;root.scale.set(1.29,.88,1.04);}
 scene.add(root);
 const groups=new Map();
 const part=(geometry,material,x,y,z,rotation=0)=>{
  const o=new T.Mesh(geometry,material);o.position.set(x,y,z);o.rotation.y=rotation;root.add(o);return o;
 };
 // The pavilion skyline in the volley has bulbous stone balusters and cut finials.
 const turnProfile=points=>new T.LatheGeometry(points.map(p=>new T.Vector2(...p)),12);
 const baluster=turnProfile([[.22,0],[.23,.10],[.11,.22],[.17,.36],[.28,.54],[.26,.71],[.13,.95],[.10,1.12],[.20,1.25],[.22,1.32]]);
 const spire=turnProfile([[.50,0],[.53,.16],[.38,.30],[.28,.50],[.27,.88],[.40,1.10],[.38,1.35],
  [.25,1.53],[.17,1.69],[.20,1.80],[.15,1.94],[.09,2.19],[.025,2.43],[0,2.49]]);
 const crownTower=(cx)=>{
  const first=root.children.length;
  const radius=9.6,height=24;
  // The upper arcade is pierced across each octagonal face. A narrower
  // inner drum places its back wall in shade and exposes the soffits obliquely.
  part(new T.CylinderGeometry(radius,radius*1.025,8.45,8),stone,cx,4.225,0,Math.PI/8);
  part(new T.CylinderGeometry(radius,radius,2.75,8),stone,cx,16.975,0,Math.PI/8);
  part(new T.CylinderGeometry(radius*.84,radius*.85,7.6,8),dark,cx,12.06,0,Math.PI/8);
  part(new T.CylinderGeometry(radius*.78,radius*.78,4,8),dark,cx,20,0,Math.PI/8);
  part(new T.CylinderGeometry(radius,radius,3.15,8),stone,cx,height-1.575,0,Math.PI/8);
  part(new T.CylinderGeometry(radius*1.04,radius*1.10,1.2,8),stone,cx,.6,0,Math.PI/8);
  for(const y of [.5,2.0,5.2,6.2,16.6,18.2,20.85,21.25,22.6,24.0]){
   part(new T.CylinderGeometry(radius*1.08,radius*1.10,y===24?.65:.35,8),stone,cx,y,0,Math.PI/8);
  }
  for(let side=0;side<8;side++){
   const a=side*Math.PI/4,normal=new T.Vector3(Math.sin(a),0,Math.cos(a)),tangent=new T.Vector3(Math.cos(a),0,-Math.sin(a));
   const center=new T.Vector3(cx,0,0).addScaledVector(normal,radius*Math.cos(Math.PI/8)+.02);
   const upper=center.clone().addScaledVector(normal,.18);
   const width=radius*Math.sin(Math.PI/8),gallery=new T.Shape();
   gallery.moveTo(-width,0);gallery.lineTo(width,0);gallery.lineTo(width,3);gallery.lineTo(-width,3);gallery.closePath();
   for(let bay=-2;bay<=2;bay++){
     const bx=bay*1.24,r=.49,hole=new T.Path();
     hole.moveTo(bx-r,.05);hole.lineTo(bx-r,1.99);hole.absarc(bx,1.99,r,Math.PI,0,true);
     hole.lineTo(bx+r,.05);hole.closePath();gallery.holes.push(hole);
   }
   part(new T.ExtrudeGeometry(gallery,{depth:.65,curveSegments:8,bevelEnabled:false}),stone,center.x-normal.x*.65,18.05,center.z-normal.z*.65,a);
   for(let bay=-2;bay<=2;bay++){
     const face=upper.clone().addScaledVector(tangent,bay*1.24);

     // Keystone at the gallery crown, with a shadowed underside as the camera moves.
     const key=part(new T.CylinderGeometry(.22,.15,.46,4),stone,face.x+normal.x*.20,20.62,face.z+normal.z*.20,a+Math.PI/4);
     key.scale.z=.77;
     part(new T.TorusGeometry(.49,.11,5,12,Math.PI),stone,face.x+normal.x*.11,20.10,face.z+normal.z*.11,a);
     part(new T.CylinderGeometry(.11,.16,2.47,7),stone,face.x+tangent.x*.54,19.08,face.z+tangent.z*.54);
   }
   // The lower storey is cut out of the masonry. The reveals and inner
   // drum stay visible from the side, and each light bay has a dark soffit.
   const recessedWall=new T.Shape();
   recessedWall.moveTo(-width,8.32);recessedWall.lineTo(width,8.32);
   recessedWall.lineTo(width,15.82);recessedWall.lineTo(-width,15.82);recessedWall.closePath();
   for(const offset of [-1.88,0,1.88]){
     const hole=new T.Path(),r=.63;
     hole.moveTo(offset-r,9.05);hole.lineTo(offset-r,12.72);
     hole.quadraticCurveTo(offset-r,13.55,offset,14.10);
     hole.quadraticCurveTo(offset+r,13.55,offset+r,12.72);hole.lineTo(offset+r,9.05);hole.closePath();
     recessedWall.holes.push(hole);
     for(const sign of [-1,1]){
       const jamb=center.clone().addScaledVector(tangent,offset+sign*.78);
       part(new T.CylinderGeometry(.13,.17,4.05,8),stone,jamb.x,11.12,jamb.z);
       part(new T.BoxGeometry(.40,.25,.42),stone,jamb.x,12.98,jamb.z,a);
     }
   }
   const depth=.91;
   part(new T.ExtrudeGeometry(recessedWall,{depth,bevelEnabled:true,bevelThickness:.055,
     bevelSize:.05,bevelSegments:1,curveSegments:10}),stone,center.x-normal.x*depth,0,center.z-normal.z*depth,a);
   // Alternating recessed bays and projecting imposts are visible at 39.9 s.
   for(const h of [8.75,15.6,16.35]){
     part(new T.BoxGeometry(6.65,.18,.43),stone,center.x+normal.x*.21,h,center.z+normal.z*.21,a);
   }
   for(const off of [-2.65,2.65]){
     const pier=center.clone().addScaledVector(tangent,off).addScaledVector(normal,.23);
     part(new T.BoxGeometry(.47,7.55,.54),stone,pier.x,11.7,pier.z,a);
     part(new T.BoxGeometry(.72,.32,.72),stone,pier.x,15.6,pier.z,a);
   }
   // A single round hood spans the three windows in each recessed bay.
   const relief=part(new T.TorusGeometry(2.62,.22,6,20,Math.PI),stone,center.x+normal.x*.18,12.86,center.z+normal.z*.18,a);
   relief.scale.y=.91;
   for(const sign of [-1,1]){
    const jamb=center.clone().addScaledVector(tangent,sign*2.62).addScaledVector(normal,.22);
    part(new T.BoxGeometry(.46,.30,.66),stone,jamb.x,12.86,jamb.z,a);
   }
   // Primary 29.7 s and the reverse entrance view: the two towers carry
   // a thick pierced crown and a coping that meets around all eight corners.
   const outer=radius*Math.cos(Math.PI/8)+.52;
   const panelWidth=2*outer*Math.tan(Math.PI/8);
   const pt=new T.Vector3(cx,0,0).addScaledVector(normal,outer);
   part(leafFrieze(panelWidth,.63,11),stone,pt.x+normal.x*.06,23.28,pt.z+normal.z*.06,a);
   part(crownScreen(panelWidth,1.87,6,.50),stone,pt.x-normal.x*.50,24.13,pt.z-normal.z*.50,a);
   part(new T.BoxGeometry(panelWidth,.28,.74),stone,pt.x-normal.x*.24,26.06,pt.z-normal.z*.24,a);
   const corner=a+Math.PI/8;
   const px=cx+Math.sin(corner)*10.4,pz=Math.cos(corner)*10.4;
   part(new T.BoxGeometry(1.24,3.10,1.30),stone,px,24.79,pz,corner);
   part(new T.CylinderGeometry(.34,.58,3.4,8),stone,px,26.35,pz);
   for(const y of [25.5,26.9,27.85])part(new T.CylinderGeometry(.49,.37,.42,8),stone,px,y,pz);
   part(spire.clone(),stone,px,27.80,pz);
   for(const sign of [-1,1]){
    const fin=new T.Shape();fin.moveTo(-.39,0);fin.quadraticCurveTo(-.18,.52,-.23,.91);
    fin.quadraticCurveTo(.12,.68,.19,.34);fin.lineTo(.36,.10);fin.lineTo(.30,-.06);fin.closePath();
    const f=part(new T.ExtrudeGeometry(fin,{depth:.16,bevelEnabled:false,curveSegments:5}),stone,
      px+sign*.36*tangent.x,26.88,pz+sign*.36*tangent.z,a);
    f.scale.x=sign;
   }
  }
  if(!flank){
   const width=place?1.18:1.13,depth=place?1.06:1.13;
   for(const part of root.children.slice(first)){
    part.position.x=cx+(part.position.x-cx)*width;part.position.z*=depth;
    // Scale the completed bay in palace coordinates, including rotated arches.
    part.updateMatrix();part.matrix.premultiply(new T.Matrix4().makeScale(width,1,depth));
    part.matrix.setPosition(part.position);part.matrixAutoUpdate=false;
   }
  }
 };
 crownTower(-18.5);crownTower(18.5);
 // A recessed entrance below the bridge, with two wall piers. Leave the
 // central void open instead of covering it with a solid box facade.
 for(const side of [-1,1])part(new T.BoxGeometry(6.0,18.2,7),stone,side*9.5,9.1,0);
 part(new T.BoxGeometry(26,4.2,5.5),stone,0,19.3,0);
 // The bridge's upper frieze stands in front of its structural wall. Its
 // repeating blind arches have real reveals (reverse fight view, 180 s).
 const frieze=new T.Shape();
 frieze.moveTo(-12.2,0);frieze.lineTo(12.2,0);frieze.lineTo(12.2,2.88);frieze.lineTo(-12.2,2.88);frieze.closePath();
 for(let bay=-5;bay<=5;bay++){
  const x=bay*2.18,r=.73,p=new T.Path();
  p.moveTo(x-r,.18);p.lineTo(x-r,1.62);p.absarc(x,1.62,r,Math.PI,0,true);p.lineTo(x+r,.18);p.closePath();
  frieze.holes.push(p);
 }
 part(new T.ExtrudeGeometry(frieze,{depth:.46,bevelEnabled:false,curveSegments:8}),stone,0,18.23,3.16);
 // The recessed cross-gallery between the two projecting towers reads as
 // a horizontal shadow, with narrow openings beneath a continuous cornice.
 if(!flank){
  part(new T.BoxGeometry(20,17.2,1.5),dark,0,8.6,-4.45);
  const galleryFace=new T.Shape();
  galleryFace.moveTo(-10,0);galleryFace.lineTo(10,0);
  galleryFace.lineTo(10,17.15);galleryFace.lineTo(-10,17.15);galleryFace.closePath();
  for(const x of [-6.8,-3.4,0,3.4,6.8]){
   const aperture=new T.Path(),r=1.12;
   aperture.moveTo(x-r,4.0);aperture.lineTo(x-r,10.85);
   aperture.absarc(x,10.85,r,Math.PI,0,true);aperture.lineTo(x+r,4.0);
   aperture.closePath();galleryFace.holes.push(aperture);
  }
  part(new T.ExtrudeGeometry(galleryFace,{depth:.95,curveSegments:8,bevelEnabled:false}),dark,0,0,.3);
  for(const h of [3.8,12.56,16.34])part(new T.BoxGeometry(19.8,.34,1.9),stone,0,h,.54);
 }
 for(const side of [-1,1]){
  for(const y of [.6,3])part(new T.BoxGeometry(6.45,.35,8),stone,side*9.5,y,0);
  for(const depth of [-2.9,2.9])part(new T.BoxGeometry(.42,16.9,.72),stone,side*6.68,8.45,depth);
 }
 for(const y of [16.9,18,21.5,22.1])part(new T.BoxGeometry(28,.35,8),stone,0,y,0);
 for(let i=-12;i<=12;i++)part(baluster.clone(),stone,i,22.2,4);
 part(new T.BoxGeometry(28,.26,.8),stone,0,23.5,4);
 for(let i=-5;i<=5;i++){
  part(new T.BoxGeometry(.25,2.55,.38),stone,i*2.18+.96,19.51,3.71);
  part(new T.TorusGeometry(.78,.13,5,14,Math.PI),stone,i*2.18,19.85,3.70);
 }
 root.updateMatrixWorld(true);
 root.traverse(o=>{if(o.isMesh){if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrix));}});
 root.clear();
 for(const [material,pieces] of groups){const g=mergeGeometries(pieces.map(g=>g.index?g.toNonIndexed():g)),o=new T.Mesh(g,material);o.castShadow=true;o.receiveShadow=true;root.add(o);pieces.forEach(g=>g.dispose());}
 baluster.dispose();spire.dispose();return root;
}
