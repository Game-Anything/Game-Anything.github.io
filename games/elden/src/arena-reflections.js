import * as T from "game/lib/three.module.js";
import {loadStormLayer,skyPixel,decodeCloud} from "game/src/arena-sky.js";

// The native ThreeRT bake stores scene-linear RGBE panoramas at the centre
// of the fighting terrace. Filter before blending so roughness stays physical.
export function loadArenaReflections(renderer, scene, {ultra=false}={}) {
  let blend = 0, last = -1, apply;
  const leafProbes = scene.userData.leafIrradiance = [];
  async function readPhase(phase) {
    const suffix = ultra ? '-ultra.rgbe' : '.rgbe';
    const response = await fetch('assets/arena-irradiance/phase-' + phase + suffix);
    if (!response.ok) throw Error('Cannot load arena radiance, phase ' + phase);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const weather=(await loadStormLayer(phase)).image.data;
    const width = ultra ? 1024 : 512, height = width / 2;
    if (bytes.length !== width * height * 4) throw Error('Incomplete arena radiance');
    const rgb = new Uint16Array(bytes.length);
    // The clouds light the terrace from two broad openings. Add their
    // upper-sky radiance before roughness filtering, retaining the baked
    // dark hemisphere below the horizon and the baked RGBE sun.
    const elevation=new Float32Array(height),latitudeCos=new Float32Array(height);
    const dirX=new Float32Array(width),dirZ=new Float32Array(width);
    const skyColumn=new Int32Array(width),skyRow=new Int32Array(height);
    for(let y=0;y<height;y++){
      const lat=(.5-(y+.5)/height)*Math.PI;
      elevation[y]=Math.sin(lat);latitudeCos[y]=Math.cos(lat);
      skyRow[y]=skyPixel(-Math.PI,lat);
    }
    for(let x=0;x<width;x++){
      const lon=((x+.5)/width-.5)*Math.PI*2;
      dirX[x]=Math.cos(lon);dirZ[x]=Math.sin(lon);
      skyColumn[x]=skyPixel(Math.atan2(dirX[x],-dirZ[x]),-.16);
    }
    // Project the same HDR sky onto three two-sided leaf planes. Each column
    // contains RGB diffuse irradiance for a leaf normal along one world axis.
    const irradiance = new Float64Array(9);
    const solidAngle = 2 * Math.PI * Math.PI / (width * height);
    for (let i=0; i<rgb.length; i+=4) {
      const gain = 2 ** (bytes[i+3]-128) / 255;
      const px=i/4,x=px%width,y=Math.floor(px/width);
      const dx=dirX[x]*latitudeCos[y],dy=elevation[y],dz=dirZ[x]*latitudeCos[y];
      const horizon=T.MathUtils.smoothstep(dy,.08,.38);
      const sky=skyRow[y]+skyColumn[x];
      // Dim texels include terrain and stone in the traced probe. Preserve
      // their occlusion while introducing the new cloud aperture above them.
      const exposure=horizon*T.MathUtils.smoothstep(bytes[i+1]*gain,.065,.55);
      const red=bytes[i]*gain*(1.-.55*exposure)+decodeCloud[weather[sky]]*exposure*1.8;
      const green=bytes[i+1]*gain*(1.-.55*exposure)+decodeCloud[weather[sky+1]]*exposure*1.8;
      const blue=bytes[i+2]*gain*(1.-.55*exposure)+decodeCloud[weather[sky+2]]*exposure*1.8;
      rgb[i]=T.DataUtils.toHalfFloat(red);
      rgb[i+1]=T.DataUtils.toHalfFloat(green);
      rgb[i+2]=T.DataUtils.toHalfFloat(blue);
      for (let axis=0;axis<3;axis++) {
        const cosine=Math.abs(axis===0?dx:axis===1?dy:dz);
        const weight=cosine*latitudeCos[y]*solidAngle/(2*Math.PI);
        irradiance[axis*3]+=red*weight;
        irradiance[axis*3+1]+=green*weight;
        irradiance[axis*3+2]+=blue*weight;
      }
      rgb[i+3] = 0x3c00;
    }
    leafProbes[phase-1]=new T.Matrix3().fromArray(irradiance);
    const map = new T.DataTexture(rgb,width,height,T.RGBAFormat,T.HalfFloatType);
    map.mapping=T.EquirectangularReflectionMapping;map.colorSpace=T.LinearSRGBColorSpace;
    map.flipY=true;map.minFilter=map.magFilter=T.LinearFilter;map.needsUpdate=true;
    return map;
  }
  const ready=Promise.all([readPhase(1),readPhase(2)]).then(maps=>{
    const filter=new T.PMREMGenerator(renderer);
    const phases=maps.map(map=>filter.fromEquirectangular(map));
    phases.forEach((target,i)=>{target.texture.name="ThreeRT phase "+(i+1);});
    maps.forEach(map=>map.dispose());filter.dispose();
    const mixed=phases[0].clone();
    mixed.texture.name='ThreeRT arena radiance';mixed.texture.mapping=T.CubeUVReflectionMapping;
    const material=new T.ShaderMaterial({
      uniforms:{a:{value:phases[0].texture},b:{value:phases[1].texture},phase:{value:0}},
      vertexShader:'varying vec2 at;void main(){at=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'varying vec2 at;uniform sampler2D a,b;uniform float phase;void main(){gl_FragColor=mix(texture2D(a,at),texture2D(b,at),phase);}',
      depthTest:false,depthWrite:false,toneMapped:false
    });
    const quad=new T.Mesh(new T.PlaneGeometry(2,2),material),screen=new T.Scene(),camera=new T.Camera();
    quad.frustumCulled=false;screen.add(quad);
    apply=()=>{
      if(blend===last)return;
      last=blend;
      if(blend===0||blend===1){scene.environment=phases[blend].texture;return;}
      const previous=renderer.getRenderTarget();
      material.uniforms.phase.value=blend;
      renderer.setRenderTarget(mixed);renderer.render(screen,camera);renderer.setRenderTarget(previous);
      scene.environment=mixed.texture;
    };
    apply();
  });
  return {ready,setPhase(value){blend=value;apply?.();}};
}
