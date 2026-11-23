import * as T from "game/lib/three.module.js";

// Paired, tapered leaves folded over the fillet below a projecting cornice.
// A raised midrib and undercut edge give the frieze depth under a raking sun.
export function leafFrieze(width,height,count){
  const positions=[],uv=[],index=[];
  const cell=width/count;
  for(let i=0;i<count;i++)for(const side of [-1,1]){
    const first=positions.length/3;
    for(let row=0;row<=8;row++){
      const t=row/8,leaf=Math.sin(Math.PI*t)**.78;
      const x=(i+.5)*cell-width/2+side*cell*(.025+.43*t*t);
      const y=height*(.06+.80*t+.11*Math.sin(1.6*Math.PI*t));
      for(let col=0;col<5;col++){
        const f=(col-2)/2;
        positions.push(x+f*cell*(.007+.105*leaf),y-side*f*height*.095*leaf,
          height*(.055+leaf*(.26-.15*Math.abs(f))+.06*t));
        uv.push((i+t)/count,(f+1)/2);
        if(row&&col){const p=first+row*5+col;index.push(p-6,p-5,p,p-6,p,p-1);}
      }
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

// The crown of the round-fronted pavilions is a pierced stone parapet.
// Its narrow necks and swollen shoulders can be seen against the sky at 29.7 s.
export function crownScreen(width, height, count, depth) {
  const profile = new T.Shape();
  profile.moveTo(-width / 2, 0);
  profile.lineTo(width / 2, 0);
  profile.lineTo(width / 2, height);
  profile.lineTo(-width / 2, height);
  profile.closePath();
  const span = width / count;
  for (let i = 0; i < count; i++) {
    const x = (i + .5) * span - width / 2;
    const r = span * .405;
    const hole = new T.Path();
    hole.moveTo(x - r * .80, height * .09);
    hole.lineTo(x - r * .88, height * .39);
    hole.quadraticCurveTo(x - r * 1.03, height * .57, x - r * .50, height * .69);
    hole.quadraticCurveTo(x - r * .28, height * .70, x - r * .36, height * .59);
    hole.quadraticCurveTo(x - r * .30, height * .77, x, height * .86);
    hole.quadraticCurveTo(x + r * .30, height * .77, x + r * .36, height * .59);
    hole.quadraticCurveTo(x + r * .28, height * .70, x + r * .50, height * .69);
    hole.quadraticCurveTo(x + r * 1.03, height * .57, x + r * .88, height * .39);
    hole.lineTo(x + r * .80, height * .09);
    hole.closePath();
    profile.holes.push(hole);
  }
  return new T.ExtrudeGeometry(profile, {depth, curveSegments:4, bevelEnabled:false});
}

// Cross-section of the nested stonework at the high entrance seen from the arena.
export function pointedPath(path, x, spring, rise, sign = 1) {
  path.quadraticCurveTo(-sign * x, spring + rise * .53, 0, spring + rise);
  path.quadraticCurveTo(sign * x, spring + rise * .53, sign * x, spring);
}

export function portalOrder(radius, spring, rise, width, depth) {
  const outline = new T.Shape();
  outline.moveTo(-radius, .04);
  outline.lineTo(-radius, spring);
  pointedPath(outline, radius, spring, rise);
  outline.lineTo(radius, .04);
  outline.lineTo(radius + width, .04);
  outline.lineTo(radius + width, spring);
  pointedPath(outline, radius + width, spring, rise + width * 1.20, -1);
  outline.lineTo(-radius - width, .04);
  outline.closePath();
  return new T.ExtrudeGeometry(outline, {depth, curveSegments:10, bevelEnabled:true,
    bevelSegments:1, bevelSize:width * .13, bevelThickness:depth * .18});
}

export function passageVault() {
  const positions=[],uv=[],index=[];
  for(const [row,x,rad,spring,rise,z] of [[0,0,4.14,7.15,7.59,-1.49],[1,1.05,2.36,6.0,4.90,-12.26]]){
    const arch=new T.Path();
    arch.moveTo(-rad,spring);
    pointedPath(arch,rad,spring,rise);
    for(const [i,p] of arch.getSpacedPoints(24).entries()){
      positions.push(x+p.x,p.y,z);uv.push(i/24,row);
      if(row && i){
        const front=i-1,back=i+24;
        index.push(front,back,front+1,front+1,back,back+1);
      }
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(index);g.computeVertexNormals();return g;
}

// The boss-side piers have forked, pendant leaves under the projecting ledge.
// These ones curl out from the corners, where a straight front relief disappears.
export function hangingCrocket(hand, length, breadth, relief) {
  const sections = [[0,.18,.0,.04],[.17,.32,.13,.44],[.36,.30,.42,.91],
    [.56,.19,.71,1.0],[.77,.13,.89,.73],[1,.018,1,.25]];
  const positions = [], uvs = [];
  const ring = ([fraction, width, spread, depth]) => {
    const cx=hand*spread*breadth, cy=-fraction*length, cz=depth*relief;
    return [[cx-width*breadth,cy,cz*.55],[cx,cy,cz+.09],[cx+width*breadth,cy,cz*.55],[cx,cy,cz*.24]];
  };
  let previous=ring(sections[0]);
  for(let j=1;j<sections.length;j++){
    const current=ring(sections[j]);
    for(let k=0;k<4;k++){
      const next=(k+1)%4;
      for(const [point,across,along] of [[previous[k],0,j-1],[current[k],0,j],[current[next],1,j],
        [previous[k],0,j-1],[current[next],1,j],[previous[next],1,j-1]]){
        positions.push(...point);uvs.push(across,along/(sections.length-1));
      }
    }
    previous=current;
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  g.computeVertexNormals();
  return g;
}

// A ribbed stone dome springs from an octagon. Each tile bay rounds out between
// the meridional ribs, leaving an angular eave and a continuous rounded crown.
export function cupolaShell(radius, height) {
  const g = new T.SphereGeometry(1, 64, 16, 0, Math.PI*2, 0, Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const az=Math.atan2(x,z), radial=Math.hypot(x,z);
    const d=az-Math.round(az/(Math.PI/4))*(Math.PI/4);
    const eave=Math.cos(Math.PI/8)/Math.cos(Math.PI/8-Math.abs(d));
    const flute=(1-Math.cos(az*16))*.5;
    const bulge=(1-(1-eave)*radial*radial)*(1-.023*flute*radial*(.5+.5*y));
    p.setXYZ(i,x*radius*bulge,y*height,z*radius*bulge);
  }
  g.computeVertexNormals();
  return g;
}
