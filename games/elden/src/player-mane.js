import * as T from "game/lib/three.module.js";

// Measure the fitted Tripo head in shell space. A percentile within each
// patch picks up the scalp under protruding horns instead of their tips.
export function playerManeGeometry(head) {
  const sectors = 48, rows = 8, bottom = -.16, top = .30;
  const bins = Array.from({length: sectors * rows}, () => []);
  const tau = Math.PI * 2, point = new T.Vector3();
  const sector = a => Math.floor((a / tau + 1) * sectors) % sectors;
  const row = y => T.MathUtils.clamp(Math.floor((y - bottom) / (top - bottom) * rows), 0, rows - 1);
  head.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      if (point.y < bottom || point.y > top) continue;
      const a = Math.atan2(point.x, point.z);
      bins[row(point.y) * sectors + sector(a)].push(Math.hypot(point.x, point.z));
    }
  });
  const radii = bins.map(distances => {
    distances.sort((a,b) => a-b);
    return distances[Math.floor(distances.length * .72)];
  });
  const radiusAt = (a,y) => {
    const j = sector(a), base = row(y)*sectors;
    const mid = radii[base+j], before = radii[base+(j+sectors-1)%sectors], after = radii[base+(j+1)%sectors];
    return ((mid ?? before ?? .30)*2 + (before ?? mid ?? .30) + (after ?? mid ?? .30))*.25;
  };

  const positions=[], colors=[], uvs=[], indices=[], guidePhases=[];
  // In the rear view at 12.4s, heavy locks overlap and separate near the hem;
  // the short side layers leave the turned-up horns visible at 13.37s.
  const palette=[0x373633,0x514e48,0x605c54,0x787265,0x57554e,0x45403c].map(hex=>new T.Color(hex));
  const rand=i=>T.MathUtils.euclideanModulo(Math.sin(i*127.1+71.3)*43758.5453,1);
  for(let lock=0;lock<330;lock++){
    const a=lock*2.399963%tau,side=Math.abs(Math.sin(a)),back=Math.cos(a);
    if(back<-.44 && side<.77)continue;
    const layer=rand(lock+44),rootY=.31-.43*layer;
    const rootRadius=radiusAt(a,rootY),endRadius=Math.max(rootRadius,radiusAt(a,-.13));
    const longLock=T.MathUtils.smoothstep(layer,.53,.93);
    const tipY=-.12-.075*side-.11*layer-.135*rand(lock+3)-.14*longLock-.042*back*longLock+.065*Math.cos(3*a);
    const swing=(rand(lock+101)-.5)*.49+back*.13,phase=rand(lock+21)*tau;
    const breadth=.013+.023*rand(lock+62),tone=palette[lock%palette.length];
    for(let strand=0;strand<3;strand++){
      const core=strand===0,sides=core?5:1,start=positions.length/3,around=sides+1;
      for(let j=0;j<=10;j++){
        const f=j/10,arch=Math.sin(Math.PI*f),loose=f*f;
        const y=T.MathUtils.lerp(rootY,tipY+(core?0:.035*Math.sin(phase+strand)),f);
        const r=T.MathUtils.lerp(rootRadius-.016,endRadius+.024+.059*side,f)+(.04+.033*side)*arch
          +.052*f*Math.sin(phase+7*f)+.011*strand*f;
        const offset=core?0:(strand===1?-.70:.70);
        const angle=a+swing*f+.135*f*Math.sin(phase+f*8.2)+offset*breadth/r+.043*loose*Math.sin(strand+f*9);
        const sine=Math.sin(angle),cosine=Math.cos(angle);
        const width=breadth*(core?1.16:.44)*(.83+.37*arch)*Math.pow(1.006-f,.69);
        for(let k=0;k<=sides;k++){
          const theta=tau*k/sides+.30*Math.sin(phase+f*5);
          const across=core?Math.cos(theta):2*k-1;
          const depth=core?.55*width*Math.sin(theta):.008*(1-f);
          positions.push((r+depth)*sine+cosine*width*across,y,(r+depth)*cosine-sine*width*across);
          const light=(.63+.36*f+.13*arch)*(core?.92+.16*Math.sin(theta):1.16);
          colors.push(tone.r*light,tone.g*light,tone.b*light);
          uvs.push(core?.48+.20*across:(k===0?0:1),f);
          guidePhases.push(phase+swing,swing*3+phase*.67);
        }
        if(j<10)for(let k=0;k<sides;k++){
          const i=start+j*around+k;indices.push(i,i+around,i+1,i+1,i+around,i+around+1);
        }
      }
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('peltGuide',new T.Float32BufferAttribute(guidePhases,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
