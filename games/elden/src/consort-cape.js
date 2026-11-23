// Promised Consort cape: rest shape, weave and shading.
// Measured against the primary recording (7.7 s, 29.3 s, 36.5-37.8 s, 43.7 s, 46.1 s): the cloak is gathered into a
// thick collar across both shoulders, falls past the calves and spreads to roughly twice the shoulder width at a torn hem.
// The lit face is a worn crimson, the shaded face nearly black-maroon, and low sun passes through the thin cloth.
import * as T from "game/lib/three.module.js";

export const CONSORT_CAPE={width:5.6,height:3.72,top:3.74,back:.20,columns:44,rows:40};

function weave(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
 const c=canvas.getContext('2d');c.fillStyle='#80292f';c.fillRect(0,0,1024,1024);
 const rnd=i=>{const n=Math.sin(i*12.9898)*43758.5453;return n-Math.floor(n);};
 // Long dye variations following the fall of the cloth.
 for(let i=0;i<70;i++){
  const x=rnd(i)*1024,w=18+rnd(i+90)*70,g=c.createLinearGradient(x-w,0,x+w,0);
  const dark=i%3===0;
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,dark?'rgba(34,7,14,.34)':'rgba(120,57,56,.20)');g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(x-w,0,2*w,1024);
 }
 // Blotchy wear and faded patches.
 for(let i=0;i<260;i++){
  const x=rnd(i+300)*1024,y=rnd(i+700)*1024,r=14+rnd(i+1100)*74,g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,i%4===0?'rgba(150,72,66,.20)':i%4===1?'rgba(28,6,12,.30)':'rgba(96,20,32,.22)');g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);
 }
 // Fine warp and weft.
 for(let i=0;i<1024;i+=2){c.fillStyle=i%4?'rgba(18,4,8,.10)':'rgba(190,96,84,.07)';c.fillRect(i,0,1,1024);}
 for(let i=0;i<1024;i+=3){c.fillStyle=i%2?'rgba(18,4,8,.08)':'rgba(170,80,74,.05)';c.fillRect(0,i,1024,1);}
 // Faded gold border bands near each side edge and above the hem.
 c.strokeStyle='rgba(170,128,70,.55)';c.lineWidth=5;
 for(const x of [26,44,980,998]){c.beginPath();c.moveTo(x,0);c.lineTo(x,1024);c.stroke();}
 c.lineWidth=4;for(const y of [930,946]){c.beginPath();c.moveTo(0,y);c.lineTo(1024,y);c.stroke();}
 c.strokeStyle='rgba(170,128,70,.36)';c.lineWidth=2;
 for(let y=10;y<1024;y+=44)for(const x of [35,989]){c.beginPath();c.ellipse(x,y,7,15,0,0,6.283);c.stroke();}
 // Grime climbing from the hem.
 const grime=c.createLinearGradient(0,640,0,1024);grime.addColorStop(0,'rgba(30,20,16,0)');grime.addColorStop(1,'rgba(30,20,16,.55)');
 c.fillStyle=grime;c.fillRect(0,640,1024,384);
 // Torn hem: long ragged notches cut out of the alpha.
 c.globalCompositeOperation='destination-out';
 for(let i=0;i<64;i++){
  const x=rnd(i+40)*1024,w=5+rnd(i+80)*22,h=26+rnd(i+120)*120;
  c.beginPath();c.moveTo(x-w,1024);c.lineTo(x-w*.2,1024-h);c.lineTo(x+w*.3,1024-h*.6);c.lineTo(x+w,1024);c.fill();
 }
 for(let i=0;i<10;i++){const x=rnd(i+900)*1024,y=700+rnd(i+950)*250;c.beginPath();c.ellipse(x,y,3+rnd(i)*7,9+rnd(i+5)*22,rnd(i+9),0,6.283);c.fill();}
 c.globalCompositeOperation='source-over';
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;return map;
}

export function createConsortCape(){
 const {width,height,columns,rows,top,back}=CONSORT_CAPE;
 const geometry=new T.PlaneGeometry(width,height,columns,rows),p=geometry.attributes.position;
 const s=T.MathUtils.smoothstep;
 for(let i=0;i<p.count;i++){
  const x0=p.getX(i),y0=p.getY(i),v=T.MathUtils.clamp(1-(y0/height+.5),0,1),u=T.MathUtils.clamp(x0/width*2,-1,1); // v 0 seam -> 1 hem, u -1..1
  // Gathered at the shoulders (about 2.5 m across the pauldrons), spreading to the full width at the hem.
  const half=1.22+1.58*Math.pow(v,.82);
  // Heavy pleats: a few broad folds that deepen and fan out down the cloth, plus narrower secondary folds.
  const pleat=Math.sin(u*7.4+Math.sin(u*2.6)*1.3)*(.05+.26*v)+Math.sin(u*17.3+v*2.1)*(.012+.07*v)+Math.sin(u*31.+v*5.)*.022*v;
  // The collar wraps forward over both shoulders; the body of the cloak bellies out behind the back.
  const wrap=Math.pow(Math.abs(u),2.4)*(1-s(v,0,.34));
  const belly=Math.cos(u*Math.PI*.5)*(.30*Math.sin(Math.min(1,v*1.25)*Math.PI*.5)+.34*v);
  const flank=s(Math.abs(u),.36,1)*s(v,.035,.47);
  const rib=Math.sin(11.2*u-3.8*v+1.8*Math.sin(2.4*u+1.7*v));
  const tuck=flank*(.10+.085*rib+.035*Math.sin(v*13+u*4));
  const x=u*(half-tuck)*(1-.10*wrap);
  const z=.06+.44*v+belly+pleat-.95*wrap-.16*Math.pow(Math.abs(u),3.)*v+flank*(.18*rib-.16);
  // Shoulders sit lower than the nape; the hem hangs longest behind the heels and is uneven.
  const y=y0-.30*Math.pow(Math.abs(u),1.7)*(1-s(v,0,.5))+.10*Math.sin(u*5.2)*v*v-.16*(1-Math.abs(u))*v*v+Math.sin(u*23.)*.035*v*v;
  p.setXYZ(i,x,y+tuck*(.4+.45*v),z);
 }
 geometry.computeVertexNormals();
 const material=new T.MeshStandardMaterial({map:weave(),roughness:.94,metalness:0,alphaTest:.4,side:T.DoubleSide});
 const joints=['Head','Spine2','Hips','LeftFoot','RightFoot','LeftHand','RightHand'];
 const radii=[.49,.40,.43,.17,.17,.16,.16,.10];
 const outline=radii.map(()=>new T.Vector4());
 const farSightDepth={value:0},point=new T.Vector3();
 function projectJoint(index,camera){
  point.applyMatrix4(camera.matrixWorldInverse);
  const depth=Math.max(.05,-point.z);
  outline[index].set(point.x/depth,point.y/depth,depth,radii[index]);
  farSightDepth.value=Math.max(farSightDepth.value,depth+.02);
 }
 function setSight(player,camera,enabled,striking){
  farSightDepth.value=0;
  if(!enabled||!player.root.visible||!player.motion?.ready)return;
  camera.updateMatrixWorld();
  for(let i=0;i<joints.length;i++){
   const bone=player.motion.bone(joints[i]);
   point.setFromMatrixPosition(bone.matrixWorld);
   projectJoint(i,camera);
  }
  const grip=striking&&player.weapons.find(w=>w.side==='Right'&&w.pivot.visible);
  if(grip){
   point.set(0,grip.length*.84,0);grip.pivot.localToWorld(point);projectJoint(7,camera);
  }else outline[7].copy(outline[6]);
 }
 material.onBeforeCompile=shader=>{
  shader.uniforms.capeSightDepth=farSightDepth;shader.uniforms.capeJoints={value:outline};
  shader.fragmentShader=`uniform float capeSightDepth;
   uniform vec4 capeJoints[8];
   float capeCover(vec2 ray,float clothDepth,vec4 a,vec4 b){
    vec2 axis=b.xy-a.xy;
    float t=clamp(dot(ray-a.xy,axis)/max(.000001,dot(axis,axis)),0.,1.);
    float depth=1./mix(1./a.z,1./b.z,t);
    float width=mix(a.w/a.z,b.w/b.z,t)*depth;
    float dist=length(ray-mix(a.xy,b.xy,t))*depth;
    return (1.-smoothstep(width*.82,width+.10,dist))*smoothstep(.015,.19,depth-clothDepth);
   }
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
   if(vViewPosition.z<capeSightDepth){
    vec2 ray=-vViewPosition.xy/vViewPosition.z;
    float depth=vViewPosition.z;
    float cover=max(capeCover(ray,depth,capeJoints[0],capeJoints[1]),capeCover(ray,depth,capeJoints[1],capeJoints[2]));
    cover=max(cover,max(capeCover(ray,depth,capeJoints[2],capeJoints[3]),capeCover(ray,depth,capeJoints[2],capeJoints[4])));
    cover=max(cover,max(capeCover(ray,depth,capeJoints[1],capeJoints[5]),capeCover(ray,depth,capeJoints[1],capeJoints[6])));
    cover=max(cover,capeCover(ray,depth,capeJoints[6],capeJoints[7]));
    // The fixed screen-space threshold keeps the feather still between frames.
    float threshold=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
    if(cover>threshold)discard;
   }`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   // Outer face: worn crimson. Lining (towards the armour): deeper wine with less of the faded border.
   // (36.5-38.6 s: the outer face is near-black maroon in shade, the lining dusky crimson; 7.7 s and 24.5 s: sunlit folds are saturated red.)
   float wool=dot(diffuseColor.rgb,vec3(.24,.61,.15));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(wool),.08)*(gl_FrontFacing?vec3(.82,.65,.61):vec3(.72,.65,.61));`)
  .replace('#include <opaque_fragment>',`
   // Thin cloth: light arriving on the far face passes through, tinted by the dye.
   #if NUM_DIR_LIGHTS > 0
    for(int capeLight=0;capeLight<NUM_DIR_LIGHTS;capeLight++){
     float through=max(0.,dot(-normal,directionalLights[capeLight].direction));
     outgoingLight+=diffuseColor.rgb*vec3(.86,.64,.58)*directionalLights[capeLight].color*through*.30;
    }
   #endif
   // Shaded cloth falls to a dark wine instead of holding the sky fill.
   outgoingLight-=reflectedLight.indirectDiffuse*.55;
   outgoingLight+=diffuseColor.rgb*vec3(.035,.010,.012);
   #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=> 'consort-cape-crimson-weave-sight';
 return {geometry,material,setSight,height,centerY:top-height*.5,offsetZ:back};
}

// Swings the chest-rigid rest pose of the cloak towards a gravity drape, so that the hem keeps hanging
// from the seam when the torso pitches or rolls. Returns a quaternion to apply about each seam point.
const down=new T.Vector3(),want=new T.Vector3();
export function capeHang(matrix,trail,out){
 down.set(0,-1,0).transformDirection(matrix);
 want.set(0,-1,0).addScaledVector(trail,.22).normalize();
 return out.setFromUnitVectors(down,want);
}
