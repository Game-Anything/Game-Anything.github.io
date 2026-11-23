import * as T from "game/lib/three.module.js";

// A sky at infinity has two observable coordinates. Integrate its fitted
// tangent-plane Gaussians once. The camera and the metal reflection probe
// subsequently sample the same world-locked radiance in constant time.
export const width=2048,height=640,low=-.16,span=Math.PI/2-low;
const toRadiance=new T.Matrix3().set(.59719,.35458,.04823,.076,.90834,.01566,.0284,.13383,.83777).invert();
const fromDisplay=new T.Matrix3().set(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602).invert();
const linear=Float32Array.from({length:256},(_,i)=>i/255<=.04045?i/(255*12.92):((i/255+.055)/1.055)**2.4);
function inverseFit(y){
  y=T.MathUtils.clamp(y,0,.994);
  const a=1-.983729*y,b=.0245786-.432951*y,c=-.000090537-.238081*y;
  return (-b+Math.sqrt(b*b-4*a*c))/(2*a);
}
function sourceRadiance(bytes,i){
  const v=new T.Vector3(linear[bytes[i]],linear[bytes[i+1]],linear[bytes[i+2]]).applyMatrix3(fromDisplay);
  return v.set(inverseFit(v.x),inverseFit(v.y),inverseFit(v.z)).applyMatrix3(toRadiance).multiplyScalar(.6/.96);
}
const expTable=Float32Array.from({length:1025},(_,i)=>Math.exp(-4.5*i/1024));
function readLayer(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if(bytes.length<16||view.getUint32(0)!==0x534b4731)throw Error('Invalid directional sky');
  const count=view.getUint32(4,true);
  if(16+12*count!==bytes.length)throw Error('Incomplete directional sky');
  return {bytes,view};
}
export function integrateSky(buffer,daylight=false,cloudBanks=null){
  const original=readLayer(buffer);
  const n=width*height,blend=new Float32Array(3*n),acc=new Float32Array(4*n);
  const base=sourceRadiance(original.bytes,8),latSpan=span*180/Math.PI;
  for(let i=0;i<n;i++){blend[3*i]=base.x;blend[3*i+1]=base.y;blend[3*i+2]=base.z;}
  function composite({bytes,view},level,massForCoverage,cap){
    acc.fill(0);
    for(let i=16;i<bytes.length;i+=12){
      if(bytes[i+11]!==level)continue;
      const x=view.getUint16(i,true)/65535*width-.5;
      const degrees=view.getUint16(i+2,true)/65535*99.2-9.2;
      const y=(degrees-low*180/Math.PI)/latSpan*height-.5;
      const units=level===4?16:4;
      const sx=bytes[i+4]*width/(360*units),sy=bytes[i+5]*height/(units*latSpan);
      const rho=view.getInt8(i+6)/110,inv=1/(1-rho*rho),amplitude=bytes[i+7]/255;
      const relief=level===3&&bytes!==original.bytes;
      const light=relief?null:sourceRadiance(bytes,i+8);
      const x0=Math.ceil(x-3*sx),x1=Math.floor(x+3*sx);
      for(let row=Math.max(0,Math.ceil(y-3*sy));row<=Math.min(height-1,Math.floor(y+3*sy));row++){
        const dy=(row-y)/sy;
        for(let col=x0;col<=x1;col++){
          const dx=(col-x)/sx,q=(dx*dx+dy*dy-2*rho*dx*dy)*inv;
          if(q>=9)continue;
          const w=expTable[Math.min(1024,Math.floor(q*1024/9))]*amplitude;
          const j=4*(row*width+((col+width)%width));
          if(relief)acc[j]+=w*(bytes[i+8]-128)/31;
          else{acc[j]+=w*light.x;acc[j+1]+=w*light.y;acc[j+2]+=w*light.z;}
          acc[j+3]+=w;
        }
      }
    }
    for(let i=0;i<n;i++){
      const mass=acc[4*i+3];if(!mass)continue;
      const alpha=Math.min(cap,mass/massForCoverage);
      if(level===3&&bytes!==original.bytes){
        const exposure=Math.exp(alpha*(daylight?.205:.145)*acc[4*i]/mass);
        for(let c=0;c<3;c++)blend[3*i+c]*=exposure;
        continue;
      }
      for(let c=0;c<3;c++)blend[i*3+c]+=alpha*(acc[4*i+c]/mass-blend[i*3+c]);
    }
  }
  for(let level=0;level<4;level++)composite(original,level,level===2?1.25:.8,1);
  // The clipped highlights behind the day tree still carry light above
  // display white. Recover the peak along the sun bearing for the sky and IBL.
  if(daylight){
    const bearing=105*Math.PI/180,elevation=27*Math.PI/180;
    const cosBearing=Float32Array.from({length:width},(_,x)=>Math.cos(2*Math.PI*((x+.5)/width-.5)-bearing));
    const gapBearing=Float32Array.from({length:width},(_,x)=>Math.cos(2*Math.PI*((x+.5)/width-.5)-76*Math.PI/180));
    for(let y=0;y<height;y++){
      const lat=low+(y+.5)*span/height,a=Math.cos(lat)*Math.cos(elevation),b=Math.sin(lat)*Math.sin(elevation);
      for(let x=0;x<width;x++){
        const dot=Math.max(0,a*cosBearing[x]+b);
        const canopy=Math.max(0,a*gapBearing[x]+b);
        if(dot<.80&&canopy<.86)continue;
        const j=3*(y*width+x),luma=.2126*blend[j]+.7152*blend[j+1]+.0722*blend[j+2];
        const hole=T.MathUtils.smoothstep(luma,.18,.79);
        const glow=(Math.pow(dot,27)*.19+Math.pow(dot,83)*.88)*(.12+.88*hole)
          +.28*Math.pow(canopy,43)*(.12+.88*hole);
        blend[j]+=glow;blend[j+1]+=glow*.988;blend[j+2]+=glow*.90;
      }
    }
  }else{
    // The gate aperture has a jade centre and a paler shoulder at 77.25 s.
    // Fit in world angles so both the sky and reflections use the same patch.
    const jade=sourceRadiance([101,197,119],0);
    const edge=sourceRadiance([145,199,144],0);
    const shade=sourceRadiance([101,166,99],0);
    const lowerLip=sourceRadiance([185,185,110],0);
    const upperBank=sourceRadiance([129,155,96],0);
    const ray=sourceRadiance([198,231,190],0);
    for(let y=0;y<height;y++){
      const altitude=(low+(y+.5)*span/height)*180/Math.PI;
      if(altitude<9||altitude>41)continue;
      for(let x=0;x<width;x++){
        const az=((x+.5)/width-.5)*360;
        const rise=altitude-24.6-.13*(az-7);
        const d=((az-7.5)/18)**2+(rise/10.5)**2;
        if(d>=1.82)continue;
        const weight=1-T.MathUtils.smoothstep(d,.17,1.82),j=3*(y*width+x);
        // Upper cloud fringe catches more light. A darker tongue crosses
        // the lower opening at a different angle from the bright fringe.
        const fringe=Math.exp(-(((az-2.6)/5.2)**2+((altitude-27.8-.12*(az-3))/2.30)**2));
        const tongue=Math.exp(-(((az-5.0)/4.9)**2+((altitude-24.65+.21*(az-5))/1.20)**2));
        const rim=Math.max(.58*fringe,T.MathUtils.smoothstep(d,.40,1.26)*.69);
        const cloud=T.MathUtils.clamp(.89+.27*blend[j+1],.91,1.26);
        const lower=1-T.MathUtils.smoothstep(rise,-7.7,-1.2);
        const upper=T.MathUtils.smoothstep(rise,3.2,10.3);
        const shaft=Math.exp(-(((az+4.2-.17*rise)/3.2)**2+((rise-1.)/7.0)**2));
        for(const [channel,k] of [[0,'x'],[1,'y'],[2,'z']]){
          let light=T.MathUtils.lerp(jade[k],edge[k],rim);
          light=T.MathUtils.lerp(light,shade[k],.72*tongue);
          light=T.MathUtils.lerp(light,lowerLip[k],lower*.92);
          light=T.MathUtils.lerp(light,upperBank[k],upper*.81);
          light=T.MathUtils.lerp(light,ray[k],.68*shaft);
          blend[j+channel]=T.MathUtils.lerp(blend[j+channel],cloud*light,weight);
        }
      }
    }
  }
  // Restore measured cloud faces after reconstructing the sun and gate light.
  // An unobserved bearing has zero weight and retains the broad sky fit.
  if(cloudBanks){
    const banks=readLayer(cloudBanks);
    composite(banks,3,1.,1.);
    composite(banks,0,2.6,.68);
    composite(banks,1,3.7,.91);
    composite(banks,2,1.5,.98);
    composite(banks,4,3.6,1.);
  }
  const pixels=new Uint8Array(n*4);
  for(let i=0;i<n;i++){
    for(let c=0;c<3;c++)pixels[4*i+c]=Math.min(255,Math.round(42.5*Math.log2(1+12*Math.max(0,blend[i*3+c]))));
    pixels[i*4+3]=255;
  }
  return pixels;
}
