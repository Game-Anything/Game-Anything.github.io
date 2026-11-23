import * as T from "game/lib/three.module.js";
// Shared plan of the arena.  Bearings are compass degrees as shown by the
// recording's HUD: the divine gate bears 297 deg from the arena centre, which
// is the game's -Z axis.  Measured from the primary recording (headings read
// from the compass at 2.9, 9.0, 12.5, 17.3, 22.2, 24.5, 29.7, 49.5, 125.3,
// 135 and 143 s) and cross-checked against the auxiliary film.
export const ARENA={
  cx:0,cz:-8,          // centre of the round terrace
  radius:51,           // inner face of the boundary wall
  gateZ:-83,           // nominal gate line used by gameplay
  landing:14.1,        // height of the threshold shared by the steps and walked surface
  stairFoot:-62.7,stairTop:-81.3,lane:6.3,
  toe:40,crest:78,     // gate hill: distance of toe and crest from the centre
  hillFrom:-40,hillTo:70,   // sector of the gate hill, degrees either side of the gate axis
  sunDirection:new T.Vector3(.861,.454,.231).normalize(),   // low sun behind the great tree
  gateLightDirection:new T.Vector3(.34,.36,-.94).normalize(),
  // Primary 12.5, 16.5 and 47.9 s place the trunk to the left of the carved pier.
  tree:[148,32]     // foot of the great tree on the lower terrace
};
const smooth=T.MathUtils.smoothstep,clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
// Unit floor direction of a compass bearing.
export function bearing(degrees){const yaw=(degrees+63)*Math.PI/180;return [Math.sin(yaw),-Math.cos(yaw)];}
// Point at `r` metres from the arena centre on a compass bearing.
export function ringPoint(degrees,r){const [x,z]=bearing(degrees);return [ARENA.cx+x*r,ARENA.cz+z*r];}
// Polar position about the centre: rho in metres, phi in degrees from the gate axis (+ toward the tree side).
export function polar(x,z){const dx=x-ARENA.cx,dz=z-ARENA.cz;return {rho:Math.hypot(dx,dz),phi:Math.atan2(dx,-dz)*180/Math.PI};}
export function hash2(x,y){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
export function vnoise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return lerp(lerp(hash2(xi,yi),hash2(xi+1,yi),u),lerp(hash2(xi,yi+1),hash2(xi+1,yi+1),u),v);
}
export function fbm(x,y,octaves=4){let a=.5,s=0,n=0;for(let i=0;i<octaves;i++){s+=a*vnoise(x,y);n+=a;x=x*2.03+17.1;y=y*2.03+9.7;a*=.5;}return s/n;}
export function lcg(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+0x3C6EF35F)>>>0;return s/4294967296;};}
// Crest height of the gate hill.  The shoulder toward the colonnade ends early;
// the shoulder toward the tree stays high and runs on (primary 2.9 s, 9.0 s).
function crestHeight(phi){
  // The left bank has a second shoulder below the broken pier. The right
  // bank crests closer to the pier and then drops away into a low saddle.
  if(phi<0){
    const a=-phi;
    return 23.4*(1-smooth(a,12,43))+5.1*Math.exp(-((a-30)**2)/48);
  }
  return (25.7-9.3*smooth(phi,12,29)-4.1*smooth(phi,31,47)
    +1.25*Math.exp(-((phi-32)**2)/23))*(1-smooth(phi,24,56));
}
export function stairHeight(z){return ARENA.landing*clamp((ARENA.stairFoot-z)/(ARENA.stairFoot-ARENA.stairTop),0,1);}
// 1 on the stair lane, 0 on the banks.
export function stairLane(x,z){return (1-smooth(Math.abs(x),ARENA.lane,ARENA.lane+3.4))*smooth(-z,-ARENA.stairFoot-.5,-ARENA.stairFoot+2.5);}
// Height of the heaped gate hill, with the stair lane and landing cut through it.
export function gateMound(x,z){
  const dx=x-ARENA.cx,dz=z-ARENA.cz;
  if(dx*dx+dz*dz<=ARENA.toe*ARENA.toe)return 0;
  const {rho,phi}=polar(x,z),crest=crestHeight(phi);
  let hill=0;
  if(crest>0&&rho>ARENA.toe){
    const t=clamp((rho-ARENA.toe)/(ARENA.crest-ARENA.toe),0,1);
    // The ridgeline beside the split gate is a continuous debris fan. Keep the
    // large shoulders broad and give the heaps a metre-scale relief of their own.
    const shoulder=crest*Math.pow(t,1.44);
    const apron=2.6*(fbm(x*.074,z*.074,2)-.5)+1.05*(vnoise(x*.27,z*.27)-.5)
      +.88*(vnoise(x*.58+13,z*.36)-.5);
    hill=shoulder*(.93+.13*vnoise(x*.057+7,z*.057)) + apron*smooth(t,.05,.62);
    // The near cheek of the right heap protrudes beside the stair, whereas the
    // left spur joins its shoulder farther out. Both descend into the apron.
    const approach=smooth(-z,54,80)*(1-smooth(-z,89,103));
    const along=clamp((-z-54)/32,0,1),left=x<0;
    const spine=(left?26.3:18.7)-(left?6.7:4.6)*along+1.55*Math.sin(along*3.7+(left?1.3:0));
    const wedge=(Math.abs(x)-spine)/(left?7.1:5.8);
    const seam=(Math.abs(x)-spine-(left?9.5:10.9))/4.8;
    hill+=approach*((left?4.3:6.6)*Math.exp(-wedge*wedge)+2.2*Math.exp(-seam*seam));
    const apronDistance=Math.abs(x)-(left?15.5:13.8)-(.49+Number(left)*.13)*(z+71);
    const shelf=apronDistance+2.3*Math.sin(z*.23+(left?1.1:3.4));
    const lobes=3.9*Math.exp(-(shelf*shelf)/15)+2.7*Math.exp(-((shelf-9.8)**2)/11)
      -1.9*Math.exp(-((shelf-4.7)**2)/7);
    hill+=approach*smooth(Math.abs(x),6.9,11.0)*lobes*(.67+.63*vnoise(x*.16,z*.14));
    const ribs=fbm(x*.20+z*.11,z*.13-x*.06,3);
    const notch=vnoise(x*.39,z*.32);
    hill+=smooth(t,.12,.82)*(2.9*(ribs-.47)+1.3*(notch-.50));
  }
  // Debris lies at its angle of repose on either side of the exposed steps.
  // Keep the walked treads flat and ease the banks outward to the piers.
  const bankWidth=(x<0?9.8:7.6)+1.5*vnoise(z*.095,2.3);
  const lane=1-smooth(Math.abs(x),ARENA.lane,ARENA.lane+bankWidth);
  return lerp(hill,stairHeight(z),lane*smooth(rho,ARENA.toe,ARENA.toe+6));
}
// The ash lies lower against the wall on the tree side, exposing the blind arcade (primary 143 s).
export function rimDip(x,z){
  const dx=x-ARENA.cx,dz=z-ARENA.cz,inner=ARENA.radius-15;
  if(dx*dx+dz*dz<=inner*inner)return -0;
  const {rho,phi}=polar(x,z),side=Math.exp(-(((phi-112)/34)**2));
  return -1.7*side*smooth(rho,ARENA.radius-15,ARENA.radius-3);
}
// Floor triangles are kept on the terrace and on the gate hill; beyond the wall the ground falls away.
export function onTerrace(x,z,margin=.9){
  const {rho,phi}=polar(x,z);
  return rho<ARENA.radius+margin||(phi>ARENA.hillFrom-7&&phi<ARENA.hillTo+7&&rho<104);
}
