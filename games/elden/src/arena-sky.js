import * as T from "game/lib/three.module.js";
import {width,height,low,span} from "game/src/sky-splats.js";

const layers=new Map();
export const decodeCloud=Float32Array.from({length:256},(_,i)=>(2**(i*6/255)-1)/12);

// The dome and both reflection probes share the same scene-linear radiance.
// Large banks and their angular color correction are prefiltered at build time.
export function loadStormLayer(phase){
  if(!layers.has(phase)){
    layers.set(phase,(async()=>{
      const url=new URL(`../assets/sky/cloud-radiance-${phase}.bin`,"https://radahn-offline.invalid/src/arena-sky.js");
      const response=await fetch(url);
      if(!response.ok)throw Error('Could not load '+url.pathname);
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==width*height*4)throw Error('Incomplete radiance dome, phase '+phase);
      const texture=new T.DataTexture(bytes,width,height,T.RGBAFormat);
      texture.wrapS=T.RepeatWrapping;
      texture.minFilter=T.LinearMipMapLinearFilter;texture.magFilter=T.LinearFilter;
      texture.generateMipmaps=true;texture.needsUpdate=true;
      return texture;
    })());
  }
  return layers.get(phase);
}

export function skyPixel(azimuth,elevation){
  const u=azimuth/(2*Math.PI)+.5;
  const x=Math.floor((u-Math.floor(u))*width);
  const y=T.MathUtils.clamp(Math.floor((elevation-low)/span*height),0,height-1);
  return 4*(x+y*width);
}

export function makeSky(){
  const uniforms={time:{value:0},phase:{value:0},hazeDensity:{value:.0052},
    hazeColor:{value:new T.Color(0xbdb79e)},cloudField:{value:null},day:{value:null},dusk:{value:null}};
  const material=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,fog:false,uniforms,
    vertexShader:`varying vec3 direction;
      void main(){
        direction=position;
        gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
        gl_Position.z=gl_Position.w;
      }`,
    fragmentShader:`varying vec3 direction;
      uniform sampler2D day,dusk,cloudField;
      uniform float phase,time,hazeDensity;uniform vec3 hazeColor;
      vec4 weather(sampler2D source,vec2 uv){
        vec4 s=texture2D(source,uv);
        return vec4((exp2(s.rgb*6.)-1.)/12.,s.a);
      }
      void main(){
        vec3 d=normalize(direction);
        float az=atan(d.x,-d.z),lat=asin(clamp(d.y,-1.,1.));
        vec2 uv=vec2(az*.159154943+.5,(lat+.16)/1.730796327);
        vec4 sky;
        if(phase<=0.)sky=weather(day,uv);
        else if(phase>=1.)sky=weather(dusk,uv);
        else sky=mix(weather(day,uv),weather(dusk,uv),phase);

        // The cloud density and its illumination are already integrated in
        // the radiance field used for both the dome and the reflections.
        vec3 radiance=sky.rgb;
        if(phase>0. && d.z<-.08){
          float distanceToGate=(-91.-cameraPosition.z)/d.z;
          vec3 portal=cameraPosition+d*max(0.,distanceToGate);
          float cleft=exp(-pow(abs(portal.x)/6.3,2.))*
            smoothstep(4.,17.,portal.y)*(1.-smoothstep(48.,77.,portal.y));
          float mint=smoothstep(.025,.28,sky.g-sky.r)*smoothstep(.10,.56,sky.g);
          float openSky=smoothstep(.73,.97,dot(d,normalize(vec3(.18,.39,-.90))));
          radiance+=phase*(cleft*vec3(.22,.55,.26)*(.63+.37*mint)
            +openSky*mint*sky.rgb*vec3(.37,.32,.27));
        }
        float ground=1.-smoothstep(-.15,-.015,lat);
        radiance=mix(radiance,hazeColor,ground*clamp(hazeDensity*125.,.32,.82));
        gl_FragColor=vec4(radiance,1.);
      }`
  });
  const cover=new T.TextureLoader().loadAsync(new URL('../assets/sky/storm-cover.png',"https://radahn-offline.invalid/src/arena-sky.js").href)
    .then(map=>{map.flipY=false;map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.NoColorSpace;uniforms.cloudField.value=map;});
  material.userData.ready=Promise.all([loadStormLayer(1),loadStormLayer(2),cover]).then(([a,b])=>{
    uniforms.day.value=a;uniforms.dusk.value=b;
  });
  return material;
}
