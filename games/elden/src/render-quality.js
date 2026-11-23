// Resolution changes affect draw buffers only; simulation remains at 120 Hz.
export class RenderQuality {
 constructor(maximum=1,floor=1){this.floor=floor;this.ratio=maximum;this.setMaximum(maximum);}
 setMaximum(maximum){this.maximum=maximum;this.minimum=Math.min(this.floor,maximum,maximum*this.floor);this.ratio=Math.max(this.minimum,Math.min(this.ratio,maximum));this.reset();}
 reset(){this.elapsed=0;this.count=0;this.interval=0;this.work=0;this.recovery=0;}
 sample(interval,work,highRefresh=false){
  // A single shader hitch should not decide quality. Repeated long frames
  // still have to reduce resolution on integrated GPUs. Tab resume resets
  // the estimator separately.
  if(!(interval>0)||interval>2000||!Number.isFinite(work)){this.reset();return null;}
  interval=Math.min(interval,120);work=Math.min(work,120);
  this.elapsed+=interval;this.interval+=interval;this.work+=Math.max(0,work);this.count++;
  if(this.elapsed<1200||this.count<12)return null;
  const average=this.interval/this.count,cpu=this.work/this.count;
  const slow=highRefresh ? average>20||cpu>14 : average>25||cpu>18.5;
  const spare=highRefresh ? average<14&&cpu<9 : average<20&&cpu<13;
  this.recovery=spare?this.recovery+1:0;
  const step=(slow&&average>40?.22:.1)*Math.min(1,this.maximum);
  let next=this.ratio;if(slow){next=Math.max(this.minimum,next-step);this.recovery=0;}else if(this.recovery>=4){next=Math.min(this.maximum,next+step*.5);this.recovery=0;}
  this.elapsed=this.interval=this.work=this.count=0;
  next=Math.max(this.minimum,Math.min(this.maximum,Math.round(next*100)/100));if(Math.abs(next-this.ratio)<.001)return null;this.ratio=next;return next;
 }
}

// A same-size blur can fetch two adjacent Gaussian taps in one bilinear sample.
// Smaller horizontal mip passes read a larger texture, so keep their original
// spaced taps. The vertical passes and the first horizontal pass share grids.
export function optimizeBloom(pass){
 const targets=[pass.renderTargetBright,...pass.renderTargetsHorizontal,...pass.renderTargetsVertical];
 for(const target of targets)target.depthBuffer=false;
 for(const [mip,material] of pass.separableBlurMaterials.entries()){
  const weights=material.uniforms.gaussianCoefficients.value;
  if(weights.length%2)continue;
  const pairs=new Float32Array(weights.length);
  for(let i=0;i<weights.length;i+=2){
   const first=i===0?weights[i]*.5:weights[i],second=weights[i+1];
   pairs[i]=i+second/(first+second);
   pairs[i+1]=first+second;
  }
  material.uniforms.gaussianPairs={value:pairs};
  material.fragmentShader=`
    varying vec2 vUv;
    uniform sampler2D colorTexture;
    uniform vec2 direction, invSize;
    uniform vec2 gaussianPairs[KERNEL_RADIUS / 2];
    uniform float gaussianCoefficients[KERNEL_RADIUS];
    void main(){
      vec2 stepUV=direction*invSize;
      vec3 sum=vec3(0.);
      if(${mip===0?'true':'direction.y > 0.5'}){
        for(int i=0;i<KERNEL_RADIUS/2;i++){
          vec2 pair=gaussianPairs[i];
          vec2 delta=stepUV*pair.x;
          sum+=(texture2D(colorTexture,vUv+delta).rgb+texture2D(colorTexture,vUv-delta).rgb)*pair.y;
        }
      }else{
        sum=texture2D(colorTexture,vUv).rgb*gaussianCoefficients[0];
        for(int i=1;i<KERNEL_RADIUS;i++){
          vec2 delta=stepUV*float(i);
          sum+=(texture2D(colorTexture,vUv+delta).rgb+texture2D(colorTexture,vUv-delta).rgb)*gaussianCoefficients[i];
        }
      }
      gl_FragColor=vec4(sum,1.);
    }`;
 }
 const down=pass.separableBlurMaterials[0].clone();
 down.fragmentShader=`
 varying vec2 vUv;
 uniform sampler2D colorTexture;
 uniform vec2 direction;
 void main(){
   vec2 d=direction;
   gl_FragColor=.25*(texture2D(colorTexture,vUv+d)+texture2D(colorTexture,vUv-d)
     +texture2D(colorTexture,vUv+vec2(d.x,-d.y))+texture2D(colorTexture,vUv+vec2(-d.x,d.y)));
 }`;
 const widths=[1.1,1.75,2.45,3.05,3.65];
 const full=pass.render,dispose=pass.dispose;
 pass.render=function(renderer,write,read,dt,mask){
   if(!this.fastLive||mask||this.renderToScreen||!this.outputBloomTexture)return full.call(this,renderer,write,read,dt,mask);
   const auto=renderer.autoClear;renderer.autoClear=false;
   try{
     this.highPassUniforms.tDiffuse.value=read.texture;
     this.highPassUniforms.luminosityThreshold.value=this.threshold;
     this._fsQuad.material=this.materialHighPassFilter;
     renderer.setRenderTarget(this.renderTargetBright);this._fsQuad.render(renderer);
     let previous=this.renderTargetBright;
     for(let i=0;i<this.nMips;i++){
       const target=this.renderTargetsVertical[i],radius=widths[i]*this.glowScale;
       down.uniforms.direction.value.set(radius/target.width,radius/target.height);
       down.uniforms.colorTexture.value=previous.texture;
       this._fsQuad.material=down;renderer.setRenderTarget(target);this._fsQuad.render(renderer);
       previous=target;
     }
     const uniforms=this.compositeMaterial.uniforms;
     uniforms.bloomStrength.value=this.strength;uniforms.bloomRadius.value=this.radius;
     uniforms.bloomTintColors.value=this.bloomTintColors;
     this._fsQuad.material=this.compositeMaterial;renderer.setRenderTarget(this.renderTargetsHorizontal[0]);this._fsQuad.render(renderer);
   }finally{renderer.autoClear=auto;}
 };
 pass.glowScale=1;
 pass.dispose=function(){down.dispose();dispose.call(this);};
 return pass;
}


// The arena pads its light lists to keep shader variants stable. Skip both
// attenuation and BRDF work when a padded or out-of-range light contributes zero.
export function skipInactivePointLights(chunks) {
 const begin='pointLight = pointLights[ i ];';
 const end='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
 const source=chunks.lights_fragment_begin;
 const first=source.indexOf(begin);
 const last=source.indexOf(end,first);
 if(first<0||last<0)return;
 const body=source.slice(first+begin.length,last+end.length);
 chunks.lights_fragment_begin=source.slice(0,first)+begin+`
   if(any(notEqual(pointLight.color,vec3(0.)))) {
     vec3 toPoint=pointLight.position-geometryPosition;
     if(pointLight.distance<=0. || dot(toPoint,toPoint)<pointLight.distance*pointLight.distance) {
       ${body}
     }
   }`+source.slice(last+end.length);
}


// Opaque passes can reuse the bound shader across different materials. Retain
// explicit group/draw order, then Three's material, variant, depth and ID ties.
export function sortLiveMaterials(renderer){
 const programOf=material=>renderer.properties.get(material).currentProgram?.id??-1;
 renderer.setOpaqueSort((a,b)=>{
  const priority=a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder;
  if(priority)return priority;
  if(a.material!==b.material){
   const program=programOf(a.material)-programOf(b.material);
   if(program)return program;
   return a.material.id-b.material.id;
  }
  return a.materialVariant-b.materialVariant||a.z-b.z||a.id-b.id;
 });
}

// Separate GLTF primitives can use separate Skeleton objects which pose the
// same joint objects with identical inverse bind matrices. Share that palette
// so each colour/shadow pass streams one copy of the posed bones.
export function shareRigPalettes(scene){
 const rigs=new Map();
 scene.traverse(o=>{
  if(!o.isSkinnedMesh||!o.skeleton)return;
  const skeleton=o.skeleton;
  const key=skeleton.bones.map(b=>b?.id??-1).join(',');
  const candidates=rigs.get(key)||[];
  if(candidates.includes(skeleton))return;
  const match=candidates.find(other=>other.boneInverses.length===skeleton.boneInverses.length&&
   other.boneInverses.every((matrix,i)=>matrix.equals(skeleton.boneInverses[i])));
  if(match)o.skeleton=match;
  else{candidates.push(skeleton);rigs.set(key,candidates);}
 });
}

// Three recomposes local matrices on each scene pass, including for a stationary
// scene root. That also forces every descendant to recompute its world matrix.
// Keep Three's hierarchy propagation for moving parents and animated bones.
export function cacheSceneTransforms(scene, objectPrototype){
 const original=objectPrototype.updateMatrix;
 function updateLocal(){
  const cache=this.userDataTransformCache,p=this.position,q=this.quaternion,s=this.scale,v=cache.local;
  // A getWorldPosition call can update a parent without visiting its siblings.
  // Check the actual parent matrix before reusing this node's world transform.
  const parent=this.parent,parentCache=parent?.matrixAutoUpdate&&parent.matrixWorldAutoUpdate&&parent.updateMatrix===updateLocal?parent.userDataTransformCache:null;
  const parentChanged=parent!==cache.parent||(parentCache?parentCache.version!==cache.parentVersion:parent&&!parent.matrixWorld.equals(cache.world));
  if(parentChanged){
   cache.parent=parent;cache.parentVersion=parentCache?.version;
   if(parent&&!parentCache)cache.world.copy(parent.matrixWorld);
   cache.version++;this.matrixWorldNeedsUpdate=true;
  }
  if(this.pivot){original.call(this);v[0]=NaN;cache.version++;return;}
  if(v[0]===p.x&&v[1]===p.y&&v[2]===p.z&&v[3]===q.x&&v[4]===q.y&&v[5]===q.z&&v[6]===q.w&&v[7]===s.x&&v[8]===s.y&&v[9]===s.z)return;
  v[0]=p.x;v[1]=p.y;v[2]=p.z;v[3]=q.x;v[4]=q.y;v[5]=q.z;v[6]=q.w;v[7]=s.x;v[8]=s.y;v[9]=s.z;
  original.call(this);cache.version++;
 }
 scene.traverse(o=>{
  if(o.updateMatrix!==original||!o.matrixAutoUpdate)return;
  o.userDataTransformCache={local:new Float64Array(10).fill(NaN),parent:null,parentVersion:-1,version:0,world:o.matrixWorld.clone()};
  o.updateMatrix=updateLocal;
 });
}
