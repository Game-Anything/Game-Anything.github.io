import * as T from "game/lib/three.module.js";
import {ARENA,lcg,vnoise} from "game/src/arena-layout.js";
// The great bare tree behind the wall on the sun side of the terrace.
// Primary 17.3 s: a trunk some 17 m across leaning toward the gate, split by
// glowing seams.  Primary 22.2 s / auxiliary 5290 s: from the fork heavy
// boughs reach over the wall and their bare twigs net the whole sky above
// that side of the terrace, with the low sun inside the fork.
// Primary 21.6 - 22.5 s, 47.9 s and (phase two) 143.3 - 145.6 s: between the
// boughs of the upper crown hang pale mottled masses.  They are neutral white
// to cool grey against the golden sky (189,190,176 / 138,141,124 beside sky at
// 205,181,115), whitest where the sun stands behind them, grey-green and still
// paler than the sky in phase two (102,108,92), and the dark twigs cross in
// front of them.  Their fine structure is unresolved at this distance. Small folded sprays
// on the outer wood catch light while leaving air between neighbouring limbs.
const lerp=T.MathUtils.lerp;
// Thinnest wood kept: finer twigs fall below a pixel at the crown's distance and vanish.
const TWIG_RADIUS=.075,TIP_RADIUS=.048;
export function buildGreatTree(scene,shared={}){
  const root=new T.Group();root.name='source-great-tree';scene.add(root);
  const rnd=lcg(311947),[bx,bz]=ARENA.tree;
  // Separate generators for the added sprigs and pale masses leave the established limbs untouched.
  const rndSprig=lcg(90417),rndPale=lcg(551873);
  const P=[],N=[],U=[],E=[],I=[],radii=[],wound=[];
  const trunkSides=64,shaftFaces=[];
  const t=new T.Vector3(),nrm=new T.Vector3(),bin=new T.Vector3();
  // Swept tube with parallel-transported rings.  `ember` weights the glowing seams.
  function tube(pts,radiusAt,sides,ember0=0,ember1=0,splitTrunk=false){
    const n=pts.length,base=P.length/3,ring=sides+1;let length=0;
    t.subVectors(pts[1],pts[0]).normalize();nrm.set(1,0,0);if(Math.abs(t.x)>.9)nrm.set(0,0,1);
    for(let i=0;i<n;i++){
      t.subVectors(pts[Math.min(i+1,n-1)],pts[Math.max(i-1,0)]).normalize();
      nrm.addScaledVector(t,-nrm.dot(t)).normalize();bin.crossVectors(t,nrm);
      if(i>0)length+=pts[i].distanceTo(pts[i-1]);
      const f=i/(n-1),r=radiusAt(f);
      for(let k=0;k<=sides;k++){
        const a=k/sides*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
        const dx=nrm.x*c+bin.x*s,dy=nrm.y*c+bin.y*s,dz=nrm.z*c+bin.z*s;
        // Carry the trunk flutes along the limb's grain and light their real side walls.
        const twist=a+.10*Math.sin(length*.073+base)+.014*length;
        let rr=r,nx=dx,ny=dy,nz=dz;
        if(sides>=8){
          const lobe=twist*3+base,flute=twist*7-.036*length,split=twist*2+.046*length;
          const shape=1+.145*Math.sin(lobe)+.083*Math.sin(flute)+.055*Math.sin(split);
          const slope=(.435*Math.cos(lobe)+.581*Math.cos(flute)+.11*Math.cos(split))/shape;
          const inv=1/Math.hypot(1,slope);
          rr*=shape;nx=(dx-slope*(-nrm.x*s+bin.x*c))*inv;
          ny=(dy-slope*(-nrm.y*s+bin.y*c))*inv;nz=(dz-slope*(-nrm.z*s+bin.z*c))*inv;
        }
        let exposed=0;
        if(base===0||splitTrunk){
          // A long oblique heartwood split opens towards the terrace. Its
          // two rolled bark lips are part of the shaft's actual cross-section.
          const y=pts[i].y,bearing=Math.atan2(dz,dx);
          const centre=(splitTrunk?-1.96:-2.81)+.46*vnoise(y*.038,2.3)+.11*Math.sin(y*.14);
          const delta=Math.atan2(Math.sin(bearing-centre),Math.cos(bearing-centre));
          const envelope=T.MathUtils.smoothstep(y,-10,8)*(1-T.MathUtils.smoothstep(y,63,88));
          const width=.13+.14*vnoise(y*.074,4.7);
          exposed=Math.exp(-((delta/width)**2))*envelope;
          const forkAngle=.18+.025*Math.sin(y*.24)+.012*(32-y);
          const filament=Math.exp(-(((delta-forkAngle)/(.073+.026*vnoise(y*.12,5.)))**2));
          const taper=T.MathUtils.smoothstep(y,-13,4)*(1-T.MathUtils.smoothstep(y,30,46));
          exposed=Math.max(exposed,.79*filament*taper);
          const lips=Math.exp(-(((Math.abs(delta)-width*1.55)/.12)**2));
          rr+=Math.min(1,r*.15)*(envelope*(1.23*lips-3.65*exposed)+.88*(vnoise(6*c+4,6*s+length*.063)-.5));
        }
        P.push(pts[i].x+dx*rr,pts[i].y+dy*rr,pts[i].z+dz*rr);N.push(nx,ny,nz);U.push(k/sides,length/6);E.push(lerp(ember0,ember1,f));radii.push(rr);wound.push(Math.round(exposed*255));
      }
    }
    const firstFace=I.length;
    for(let i=0;i<n-1;i++)for(let k=0;k<sides;k++){const q=base+i*ring+k;I.push(q,q+1,q+ring,q+1,q+ring+1,q+ring);}
    if(base===0||splitTrunk||pts[0].y<10&&sides>=10)shaftFaces.push([firstFace,I.length]);
  }
  const sidesFor=r=>r>4?22:r>1.5?14:r>.6?9:r>.2?6:r>.09?4:3;
  const MAX=5,tips=[],innerSprays=[],junctions=[];
  const WANDER=[.15,.24,.32,.40,.48,.56],STEPS=[10,8,6,5,4,4],KIDS=[5,4,4,4,3,0];
  // Wavy side twig on the outer wood (primary 22.0 s: the fine net between the visible branches).
  const side=new T.Vector3();
  function sprig(pts,length,radius,steps){
    const x=.15+.8*rndSprig(),i0=Math.min(Math.floor(x*(pts.length-1)),pts.length-2);
    const p=pts[i0].clone().lerp(pts[i0+1],x*(pts.length-1)-i0),d=pts[i0+1].clone().sub(pts[i0]).normalize();
    side.set(rndSprig()-.5,rndSprig()-.35,rndSprig()-.5).cross(d);
    if(side.lengthSq()<1e-4)side.set(0,1,0);
    d.multiplyScalar(.55).addScaledVector(side.normalize(),.85).normalize();
    const path=[p.clone()];
    for(let i=0;i<steps;i++){
      d.x+=(rndSprig()-.5)*.62;d.y+=(rndSprig()-.5)*.5+.07;d.z+=(rndSprig()-.5)*.62;d.normalize();
      p.addScaledVector(d,length/steps);path.push(p.clone());
    }
    tube(path,f=>lerp(radius,TIP_RADIUS,f),3,0,0);
  }
  function branch(start,dir,length,radius,level){
    const steps=STEPS[level],pts=[start.clone()],d=dir.clone(),p=start.clone(),w=WANDER[level];
    const turn=.10*Math.sin(start.z*.13+start.y*.083),bank=new T.Vector3(-dir.z,0,dir.x);
    for(let i=0;i<steps;i++){
      // Old limbs meander; the outer wood turns up toward the light.
      d.addScaledVector(bank,turn*Math.cos(i/steps*3.5));
      d.x+=(rnd()-.5)*w;d.y+=(rnd()-.5)*w*.8+(level===0?.02:.07);d.z+=(rnd()-.5)*w;d.normalize();
      p.addScaledVector(d,length/steps);pts.push(p.clone());
    }
    const path=level<=2?new T.CatmullRomCurve3(pts).getPoints(steps*3):pts;
    const end=level<MAX-1?Math.max(TIP_RADIUS,radius*.28):TIP_RADIUS,at=f=>lerp(radius,end,Math.pow(f,.85));
    tube(path,at,sidesFor(radius),level===0?.8:0,0);
    if(level===MAX-1)for(let k=0;k<2;k++)sprig(pts,length*(.30+.35*rndSprig()),TWIG_RADIUS,3);
    if(level===MAX-1&&Math.sin(p.x*.18+p.z*.13+2.2*Math.cos(p.y*.18))>.37){
      innerSprays.push({point:p.clone(),direction:d.clone(),stem:pts});
    }
    if(level>=MAX){sprig(pts,length*(.52+.67*rndSprig()),TIP_RADIUS*1.25,3);tips.push({point:p.clone(),direction:d.clone(),stem:pts});return;}
    const kids=KIDS[level];
    for(let j=0;j<kids;j++){
      const f=.20+.76*(j+rnd()*.85)/kids,x=f*(pts.length-1),i0=Math.min(Math.floor(x),pts.length-2);
      const origin=pts[i0].clone().lerp(pts[i0+1],x-i0);
      const forward=pts[i0+1].clone().sub(pts[Math.max(i0-1,0)]).normalize();
      const side=new T.Vector3(rnd()-.5,rnd()-.30,rnd()-.5).cross(forward);
      if(side.lengthSq()<1e-4)side.set(0,1,0).cross(forward);side.normalize();
      const spread=.50+rnd()*.60;
      const out=forward.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side,Math.sin(spread)).normalize();
      // Uneven wood: some forks are nearly as heavy as their parent, others are whips, and here and there a
      // shoot is missing, which leaves gaps in the net (primary 47.9 s, auxiliary 5292 s).
      const weight=rnd(),reach=rnd();
      if(level>=2&&rnd()<.20)continue;
      const childRadius=Math.max(TWIG_RADIUS,at(f)*(.32+weight*weight*.50));
      if(level<=1&&childRadius>.51)junctions.push({origin,forward,out,parentRadius:at(f),childRadius});
      branch(origin,out,length*(.38+reach*.44),childRadius,level+1);
    }
    // The limb's own leader carries on as a thinner branch.
    if(level<MAX-1)branch(p.clone(),d.clone(),length*.42,end,Math.min(MAX,level+2));
  }
  // Short hanging sprays fringe the lower limbs in the 22.2 s view and
  // in the reverse view at Ye 5292 s. Use a separate sequence so the
  // silhouette of the weight-bearing boughs and registered fork stays fixed.
  function addPendantSprays(){
    const random=lcg(411743);
    for(const tip of tips){
      const {point,direction,stem}=tip;
      if(point.y>96 || direction.y>.46 || random()>.14)continue;
      const path=[stem[1].clone()],dir=direction.clone();
      const length=2.2+3.6*random(),drift=random()-.5;
      for(let j=0;j<5;j++){
        dir.y-=.32+j*.035;dir.x+=drift*.12;dir.normalize();
        path.push(path[j].clone().addScaledVector(dir,length/5));
      }
      tube(path,t=>lerp(.105,.034,t),4);
      const side=new T.Vector3(-dir.z,-.48,dir.x).normalize();
      const twig=[path[2],path[2].clone().addScaledVector(side,.65),path[2].clone().addScaledVector(side,1.15).addScaledVector(dir,.78)];
      tube(twig,t=>lerp(.068,.026,t),3);
    }
  }
  // Trunk: leaning toward the gate side, rising from the terraces below the wall.
  const V=(x,y,z)=>{
    const shaft=T.MathUtils.smoothstep(y,-8,44);
    const crotch=T.MathUtils.smoothstep(y,5,44)*(1-T.MathUtils.smoothstep(y,65,109));
    // The bole rakes toward the carved pier above the terrace. Carry the
    // crown with it so the same opening stays visible as the camera turns.
    return new T.Vector3(bx+x,y+12.8*shaft+10.4*crotch,bz+z+12*T.MathUtils.smoothstep(y,-6,34));
  };
  const trunk=new T.CatmullRomCurve3([V(.8,-42,1),V(0,-12,0),V(-1.1,6,.7),V(-2.2,20,-4.4),V(-2.6,41,-10.8),V(-4.3,59,-14.5),V(-5.0,69,-17.5)]).getPoints(72);
  tube(trunk,f=>lerp(14.9,6.25,Math.pow(f,.65))*(1+.095*Math.sin(f*17))*(1-.87*T.MathUtils.smoothstep(f,.86,1)),trunkSides,1,.48);
  const tangentA=new T.Vector3(),tangentB=new T.Vector3(),vertex=new T.Vector3();
  for(let row=0;row<trunk.length;row++)for(let col=0;col<=trunkSides;col++){
    const offset=(r,c)=>3*(r*(trunkSides+1)+(c+trunkSides)%trunkSides);
    tangentA.fromArray(P,offset(row,col+1)).sub(vertex.fromArray(P,offset(row,col-1)));
    tangentB.fromArray(P,offset(Math.min(row+1,trunk.length-1),col)).sub(vertex.fromArray(P,offset(Math.max(0,row-1),col)));
    const normal=tangentA.cross(tangentB).normalize(),index=3*(row*(trunkSides+1)+col);
    if(normal.dot(vertex.fromArray(N,index))<0)normal.negate();
    normal.toArray(N,index);
  }
  // Flared ribs follow the weight-bearing fork down into the bark.
  for(const [angle,begin,end,width] of [[.9,.25,.85,2.3],[2.6,.32,.91,2.1],[4.4,.18,.83,2.8],[5.35,.37,.94,1.65]]){
    const fold=[];
    for(let i=0;i<=25;i++){
      const t=i/25,f=lerp(begin,end,t),at=f*(trunk.length-1),j=Math.floor(at);
      const p=trunk[j].clone().lerp(trunk[j+1],at-j);
      const radius=lerp(13.5,6.25,Math.pow(f,.6))*(1+.12*Math.sin(f*17));
      const crest=Math.sin(t*Math.PI),a=angle+.37*Math.sin(t*5+angle)-.18*t;
      p.x+=Math.cos(a)*radius*(.56+.40*crest);p.z+=Math.sin(a)*radius*(.56+.40*crest);
      fold.push(p);
    }
    tube(fold,t=>width*(.09+.91*Math.pow(Math.sin(t*Math.PI),.68)),11,.54,.28);
  }
  // Buttress roots around the foot.
  for(let i=0;i<9;i++){
    const a=i*2.399+.4,reach=13+rnd()*8,cx=Math.cos(a),cz=Math.sin(a);
    const pts=new T.CatmullRomCurve3([V(cx*reach,-30-rnd()*8,cz*reach),V(cx*9.5,-9,cz*9.5),V(cx*7.2-.5,9,cz*7.2-2),V(cx*4.8-1.2,23+rnd()*6,cz*4.8-6)]).getPoints(14);
    tube(pts,f=>lerp(4.05,1.59,f)*(.85+.3*rnd()),10,.9,.6);
  }
  const fork=V(-4.3,59,-14.5);
  const limbs=[
    // direction, length, radius, start offset below the fork
    // Primary 4.0 s and 132.9 - 136.9 s: no wood crosses the sky beside the gate, so the gate-side boughs stop
    // well short of it.  Primary 47.9 s / auxiliary 5292 s: the boughs at the fork are heavy and dark.
    [[-.24,.34,-.89],27,4.65,-2],     // stop above the wall before the opening beside the gate
    [[-.10,.97,.18],58,4.05,7],       // crown
    [[.72,.56,-.38],54,2.92,6]       // away from the terrace

  ];
  for(const [dir,length,radius,lift] of limbs){
    const d=new T.Vector3(...dir).normalize(),origin=fork.clone().add(new T.Vector3(-.3*lift*.3,lift,-.33*lift*.3)).addScaledVector(d,2.2);
    branch(origin,d,length,radius,0);
  }
  // The outer stem crosses in front of the upright and bears the long
  // lateral crown. The opening between them stays visible when circling.
  const windingStem=new T.CatmullRomCurve3([
    V(6,-38,12),V(3,-17,9),V(-2,-2,6),V(-4.5,12,1),
    V(-6.5,23,-5.4),V(-7.8,34,-10.5),V(-9.4,45,-16.4),V(-13.6,54,-25.8),
    V(-25,65,-27),V(-31,77,-23),V(-30,89,-31),V(-36,98,-38)
  ]).getPoints(88);
  tube(windingStem,f=>.09+12.4*(1-f)**.84+.63*Math.sin(Math.PI*f)**3,48,.79,.03,true);
  // The wall masks the roots in the 17 s shot. Above it a broad shoulder
  // sweeps out under the crown to the left of the carved pier.
  const trunkShoulder=new T.CatmullRomCurve3([
    V(-1,-6,2),V(-2,8,-2),V(-4,17,-6),V(-5,26,-11),
    V(-6.8,33,-15.1),V(-9.7,40,-18.3),V(-13.1,49,-21.7),V(-15.1,55,-25.5)
  ]).getPoints(36);
  tube(trunkShoulder,f=>.35+6.1*Math.sin(Math.PI*f)**.56,23,.14,.04);
  // Carry the original upright through the crotch. Its old crown leaders
  // started above the taper and left a wedge of sky at the joint.
  const upperStem=new T.CatmullRomCurve3([
    trunk[51],V(-3.1,48,-11.2),V(-2.6,56,-11.9),V(-.8,63,-11.3),
    V(.9,70,-8.8),V(-1.3,78,-9.1),V(-5.8,89,-15.2),
    V(-9.2,99,-13),V(-15,106,-16.9),V(-17,116,-20)
  ]).getPoints(58);
  tube(upperStem,f=>.055+6.35*(1-f)**1.13,34,.39,.01);
  const upperFork=new T.CatmullRomCurve3([
    upperStem[19],V(-3.4,68,-13.2),V(-5.5,75,-19),V(-10.7,81,-23.8),
    V(-17.5,88,-27.5),V(-20.2,96,-34),V(-26,101,-39)
  ]).getPoints(32);
  tube(upperFork,f=>.055+3.54*(1-f)**1.09,21);
  for(const [path,j,dir,len,r] of [[upperStem,30,[.31,.54,.79],33,2.2],
    [upperStem,43,[-.48,.77,.46],28,1.38],[upperFork,16,[.13,.82,-.47],24,1.32],
    [upperFork,23,[-.48,.32,-.70],20,.93]]){
    branch(path[j],new T.Vector3(...dir).normalize(),len,r,2);
  }
  // The old fork spreads horizontally for several trunk widths, losing
  // weight at each division before the last tips turn into the light.
  const crownArch=new T.CatmullRomCurve3([
    windingStem[49],V(-12.8,56,-18),V(-14,68,0),V(-18,77,20),
    V(-26,84,39),V(-32,87,57),V(-39,88,75),V(-45,91,96),
    V(-50,95,112),V(-56,104,127),V(-57,115,137)
  ]).getPoints(72);
  tube(crownArch,f=>.08+6.08*(1-f)**1.12,26,.22,.0);
  const reverseArch=new T.CatmullRomCurve3([
    windingStem[53],V(-19,58,-25),V(-27,57,-36),V(-33,53,-51),
    V(-41,55,-64),V(-48,59,-72),V(-54,70,-75),V(-52,82,-84)
  ]).getPoints(44);
  tube(reverseArch,f=>.07+4.1*(1-f)**1.03,22,.17,0);
  for(const [path,j,dx,dy,dz,length,radius] of [
    [windingStem,50,.06,.75,-.65,34,2.8],[windingStem,62,-.49,.66,.55,41,2.5],
    [windingStem,73,.17,.91,.31,27,1.82],[reverseArch,19,-.62,.34,-.55,31,2.5],
    [reverseArch,34,.11,.81,-.6,28,1.42],[crownArch,20,-.38,.81,.43,46,3.46],
    [crownArch,27,-.39,-.20,.90,34,2.88],[crownArch,36,.51,.68,.49,43,2.48],
    [crownArch,47,-.56,.59,.57,39,1.98],[crownArch,55,.15,-.49,.84,28,1.43],
    [crownArch,63,-.35,.80,.40,22,.88],[crownArch,68,.46,.43,.78,16,.53]
  ])branch(path[j],new T.Vector3(dx,dy,dz).normalize(),length,radius,1);
  // Primary 47.94 s and Ye 5289.3-5294 s show sky through the wood just
  // beside the amber crotch. A recurved leader splits off below the fork
  // then joins its upper spine; the gap remains transparent from either side.
  const split=new T.CatmullRomCurve3([
    V(-3.0,42,-11),V(-4.2,44.5,-14),V(-6.3,46.5,-20.2),
    V(-7.3,50.8,-26.),V(-6.0,55.5,-30.8),V(-6.9,62.7,-32.0),
    V(-9.1,67.2,-34.5),V(-10.2,73.7,-34.9)
  ]).getPoints(40);
  tube(split,f=>lerp(3.18,.46,f)+.86*Math.exp(-Math.pow((f-.24)/.19,2)),18,.08,.05);
  // The outer wall of the cavity carries an ascending limb. Its knots and
  // leaders rise into the crown rather than ending at the rim of the hole.
  const hollowLeader=new T.CatmullRomCurve3([
    V(-7.05,50.3,-25.6),V(-7.3,53.4,-28.7),V(-8.4,56.6,-31.2),
    V(-11.1,63.1,-33.6),V(-12.7,71.4,-34.5),V(-14.4,77.0,-38.3),
    V(-12.8,83.6,-41.1),V(-12.3,87.4,-41.8)
  ]).getPoints(34);
  tube(hollowLeader,f=>lerp(1.91,.10,Math.pow(f,.73)),14,.04,0);
  const hollowTwig=new T.CatmullRomCurve3([
    V(-10.5,61.6,-33.1),V(-9.2,65.3,-38.7),
    V(-6.7,68.4,-41.2),V(-7.2,71.1,-45.),V(-6.9,74.7,-46.1)
  ]).getPoints(15);
  tube(hollowTwig,f=>lerp(1.8,TIP_RADIUS,f),9);
  // In the northeast close view the light is framed by old horizontal
  // wood below the main fork. Keep the ends on the tree side of the arena.
  const lowerBough=new T.CatmullRomCurve3([
    split[12],V(-8.2,51,-26),V(-10.4,50,-35),V(-13,47.5,-45),
    V(-15.1,45.2,-55),V(-17.2,46.5,-66),V(-19.4,49.1,-75),V(-20.3,54.3,-80)
  ]).getPoints(35);
  tube(lowerBough,f=>lerp(4.65,.095,Math.pow(f,.89)),14,.20,0);
  const lowFork=new T.CatmullRomCurve3([
    lowerBough[13],V(-12.7,46,-40),V(-15,42,-47),
    V(-16.7,39.8,-51),V(-18.1,40.7,-55),V(-20.4,42,-58),V(-21.1,44,-61)
  ]).getPoints(24);
  tube(lowFork,f=>lerp(1.21,.075,Math.pow(f,.72)),10,.06,0);
  for(const [path,j,dir,len,r] of [[lowerBough,21,[-.4,.67,-.56],16,1.38],
    [lowerBough,29,[-.19,.48,.57],13,.87],[lowFork,15,[-.46,.61,-.32],11,.90]]){
    branch(path[j],new T.Vector3(...dir).normalize(),len,r,2);
  }
  for(const [limb,index,x,y,z,length,radius] of [
    [lowerBough,15,-.25,-.65,-.72,8,.68],[lowerBough,25,.41,.42,-.61,11,.61],
    [lowerBough,31,-.18,.57,-.70,8,.39],[lowFork,13,.23,-.48,-.83,7,.47],
    [lowFork,21,-.72,.36,-.42,6,.31]
  ])branch(limb[index],new T.Vector3(x,y,z).normalize(),length,radius,3);
  // The lateral fork crosses below the canopy opening. Its upper branches
  // curve back across the source of the light before splitting into twigs.
  const westFork=new T.CatmullRomCurve3([lowerBough[17],V(-14.7,49,-51),
    V(-17,49.8,-59),V(-20,51,-68),V(-23,53,-80),V(-25,59,-88)]).getPoints(32);
  tube(westFork,f=>lerp(1.68,.10,Math.pow(f,.63)),12);
  for(const [j,x,y,z,len,r] of [[5,-.37,.86,-.44,20,1.54],[12,-.44,.78,-.18,18,1.19],
    [17,.12,.42,-.91,16,.85],[22,-.41,-.14,-.83,13,.75],[27,-.2,.59,-.76,10,.39]]){
    branch(westFork[j],new T.Vector3(x,y,z).normalize(),len,r,2);
  }
  // Two upper forks are visible through the opening above the near bough.
  // The solid wood carries across the frame while finer shoots fade in the sky.
  const outerSweep=new T.CatmullRomCurve3([westFork[16],V(-22,47,-66),V(-29,55,-58),
    V(-28,62,-62),V(-30,72,-68),V(-27,79,-79),V(-26,85,-83),V(-24,88,-91)]).getPoints(38);
  tube(outerSweep,f=>lerp(2.25,.10,Math.pow(f,.75)),12);
  const openFork=new T.CatmullRomCurve3([outerSweep[11],V(-31,60,-52),V(-32,72,-49),
    V(-30,82,-53),V(-31,92,-42),V(-33,100,-44)]).getPoints(27);
  tube(openFork,f=>lerp(1.55,.09,Math.pow(f,.80)),10);
  for(const [limb,j,x,y,z,len,r] of [[outerSweep,7,-.05,.10,-.99,24,1.25],
    [outerSweep,15,-.12,.54,-.83,19,.90],[outerSweep,23,-.25,.88,.18,20,1.02],
    [outerSweep,32,-.11,.96,-.26,12,.50],[openFork,11,-.28,.86,.41,18,.75],
    [openFork,17,-.07,.84,-.53,20,1.02],[openFork,23,-.35,.62,.69,17,.68]]){
    branch(limb[j],new T.Vector3(x,y,z).normalize(),len,r,3);
  }
  // A second layer of long lateral boughs crosses the backlit canopy.
  for(const [joint,end,side] of [[westFork[19],[-38,58,-82],-1],
    [outerSweep[17],[-46,72,-53],1],[lowerBough[24],[-31,43,-69],-1]]){
    const tip=V(...end),delta=tip.clone().sub(joint);
    const bough=new T.CatmullRomCurve3([joint,joint.clone().addScaledVector(delta,.32).add(new T.Vector3(0,3,0)),
      tip.clone().addScaledVector(delta,-.21).add(new T.Vector3(1.8,2.9,side*3)),tip]).getPoints(24);
    tube(bough,f=>lerp(1.13,.12,f),10);
    for(let j=5;j<24;j+=3){
      const dir=new T.Vector3(-.49,-.18+.36*Math.cos(j*1.4),side*(j%2?.73:-.58)).normalize();
      branch(bough[j],dir,11+.26*j,.48,3);
    }
  }
  // A splintered end on the lower fork breaks its outline against the low cloud.
  for(const [limb,at,reach,side] of [[lowerBough,13,7.2,-1],[westFork,16,5.3,1],[split,21,4.1,-1]]){
    const joint=limb[at],baseRadius=.60+reach*.085;
    const end=joint.clone().add(new T.Vector3(-reach*.48,reach*.72,side*reach*.41));
    const elbow=joint.clone().lerp(end,.53).add(new T.Vector3(-.8,-.92,.33));
    const stem=new T.CatmullRomCurve3([joint,elbow,end]).getPoints(12);
    tube(stem,f=>lerp(baseRadius,.38,f),10);
    for(let j=0;j<3;j++){
      const tip=end.clone().add(new T.Vector3(-.40-.24*j,.60+.45*j,side*(.19-.29*j)));
      tube([stem[10],end,tip],f=>lerp(.33,.026,f),6);
    }
  }
  // In the reverse view a high main limb crosses back behind the carved
  // pier. The open interval beneath it keeps the trunk and arcade separate.
  const eastLeader=new T.CatmullRomCurve3([
    upperStem[12],V(-4.8,69.3,-5),V(-7.8,68.1,7),V(-9.6,59.5,23),
    V(-12.7,61.3,36),V(-14.6,67.4,48),V(-15.8,77.6,58),V(-17.2,84.1,64)
  ]).getPoints(37);
  tube(eastLeader,f=>lerp(3.45,.12,Math.pow(f,.86)),16,.13,0);
  for(const [j,x,y,z,length,radius] of [
    [7,-.51,.62,.39,24,1.6],[12,.38,.29,.82,30,1.4],
    [16,-.63,.35,.64,25,1.35],[22,-.43,.71,.43,19,1.1],
    [26,.20,-.29,.88,13,.65],[31,-.12,.82,.48,12,.54]
  ])branch(eastLeader[j],new T.Vector3(x,y,z).normalize(),length,radius,2);
  // The low fork reaches across the backlit view at 22 and 48 seconds.
  // Its branches grow from two different heights, leaving a tall skylight
  // between the trunk and the sweeping near limb.
  const shoulder=new T.CatmullRomCurve3([
    crownArch[10],V(-16,69,2),V(-15,69,9),V(-14,61,15),V(-20,66,30),
    V(-26,69,48),V(-31,74,68),V(-34,83,89),V(-39,91,103)
  ]).getPoints(42);
  tube(shoulder,f=>.18+3.42*(1-f)**1.25,19,.23,0);
  const shoulderFork=new T.CatmullRomCurve3([
    shoulder[16],V(-13,70,19),V(-15,73,21),V(-16,78,31),
    V(-20,85,40),V(-23,93,45),V(-22,101,48)
  ]).getPoints(26);
  tube(shoulderFork,f=>.09+1.69*(1-f)**1.04,14,.08,0);
  for(const [limb,j,x,y,z,length,radius] of [
    [shoulder,14,-.42,.53,.76,18,1.2],[shoulder,24,-.25,.18,.95,28,1.55],
    [shoulder,29,.18,.69,.70,20,1.2],[shoulder,35,-.46,.72,.53,16,.79],
    [shoulderFork,13,-.48,.76,.38,17,.89],[shoulderFork,20,.19,.76,.63,13,.65],
    [shoulder,19,.47,.68,.56,21,1.29],[shoulder,27,-.69,.44,.58,24,1.46],
    [shoulder,31,.58,.33,.74,18,.96],[shoulder,36,.12,-.22,.97,14,.62],
    [shoulder,39,-.46,.39,.80,14,.55],[shoulderFork,16,.65,.42,.63,18,.88]
  ])branch(limb[j],new T.Vector3(x,y,z).normalize(),length,radius,2);
  // The upper crown carries long second-order boughs. On the reverse view
  // they project across the pier, with open sky between the separate tiers.
  // Offsets are in tree space so every heel starts inside its parent wood.
  const highBoughs=[
    [crownArch,30,3.05,[-7,5,14],[-16,7,32],[-25,13,50],[-30,26,61]],
    [crownArch,45,2.55,[4,2,14],[9,7,26],[6,13,45],[2,22,54]],
    [upperFork,15,2.18,[-7,5,-10],[-19,11,-20],[-27,15,-32],[-29,28,-41]],
    [windingStem,68,2.38,[-7,1,-13],[-16,4,-26],[-26,13,-38],[-24,22,-50]],
    [shoulder,21,2.45,[2,5,12],[8,8,23],[6,15,42],[1,24,49]],
    [eastLeader,19,2.16,[7,1,12],[11,3,25],[17,10,38],[14,20,47]],
    [reverseArch,23,2.36,[-8,1,-10],[-18,4,-23],[-23,11,-38],[-21,22,-44]]
  ];
  for(const [parent,j,r,...offsets] of highBoughs){
    const heel=parent[j];
    const points=[heel,...offsets.map(p=>heel.clone().add(new T.Vector3(...p)))];
    const stem=new T.CatmullRomCurve3(points).getPoints(28);
    tube(stem,f=>.08+r*(1-f)**.88,14,.06,0);
    const side=Math.sign(offsets[1][2]);
    for(const [row,span,lift,cross,width] of [[8,32,11,-13,.64],[14,26,19,12,.50],[20,20,9,-9,.36]]){
      const foot=stem[row],sway=span*side;
      const ends=[[cross*.32,1.7,sway*.28],[cross*.70,lift*.42,sway*.66],[cross,lift,sway]];
      const forked=new T.CatmullRomCurve3([foot,...ends.map(d=>foot.clone().add(new T.Vector3(...d)))]).getPoints(15);
      tube(forked,f=>.047+r*width*(1-f)**.94,9);
      for(const k of [5,10,14]){
        const direction=forked[k+1].clone().sub(forked[k-1]).normalize();
        direction.x+=k===10?.63:-.52;direction.y+=k===5?-.22:.31;
        branch(forked[k],direction.normalize(),11+.18*span,.32+r*width*(1-k/16)*.39,3);
      }
    }
  }
  // In the upward view, small sprays hang from the underside of the old
  // lateral limbs. Follow their tangent first, then droop under their weight.
  const pendant=lcg(70291);
  for(const limb of [lowerBough,westFork,lowFork,eastLeader,shoulder,shoulderFork]){
    for(let j=6;j<limb.length-2;j+=2){
      const foot=limb[j],side=pendant()<.5?-1:1;
      const length=3.5+pendant()*5.2;
      const tangent=limb[j+1].clone().sub(limb[j-1]).normalize();
      const edge=new T.Vector3(tangent.z,0,-tangent.x).multiplyScalar(side);
      const stem=[foot.clone()];
      for(let k=1;k<=5;k++){
        const f=k/5;
        stem.push(foot.clone().addScaledVector(tangent,length*f*.73)
          .addScaledVector(edge,length*(.43*f+.09*Math.sin(4*f+j)*f))
          .addScaledVector(new T.Vector3(0,1,0),length*(.08*f-.82*f*f)));
      }
      tube(stem,f=>lerp(.23,.029,f),5);
      for(let k=2;k<5;k++){
        const twig=stem[k].clone().addScaledVector(edge,(k%2?1:-1)*(.42+.50*pendant()))
          .addScaledVector(tangent,.48+pendant());
        twig.y-=.40+.48*pendant();
        const tip=twig.clone().addScaledVector(tangent,.44);tip.y-=.70+pendant();
        tube([stem[k],twig,tip],f=>lerp(.084,.019,f),3);
      }
    }
  }
  addPendantSprays();
  // Growth ridges turn out of the parent bark and up the two shoulders of a
  // substantial fork. Append these after the original wood so its seeded
  // undulations, including the registered opening near the sun, stay fixed.
  for(const {origin,forward,out,parentRadius,childRadius} of junctions){
    const across=new T.Vector3().crossVectors(forward,out).normalize();
    const outward=new T.Vector3().crossVectors(across,forward).normalize();
    for(const sign of [-1,1]){
      const radius=childRadius*(sign<0?.32:.23);
      const lower=origin.clone().addScaledVector(forward,-2.4*parentRadius)
        .addScaledVector(outward,parentRadius*.72).addScaledVector(across,sign*parentRadius*.44);
      const heel=origin.clone().addScaledVector(forward,-.46*parentRadius)
        .addScaledVector(outward,parentRadius*.74).addScaledVector(across,sign*childRadius*.65);
      const shoulder=origin.clone().addScaledVector(out,1.26*parentRadius)
        .addScaledVector(across,sign*childRadius*.88);
      const end=origin.clone().addScaledVector(out,2.3*parentRadius)
        .addScaledVector(across,sign*childRadius*.65);
      const ridge=new T.CatmullRomCurve3([lower,heel,shoulder,end]).getPoints(9);
      tube(ridge,f=>radius*(.035+.965*Math.sin(Math.PI*f)**.75),7);
    }
  }

  // Cambium plates ride the existing flutes rather than floating along an
  // ideal cylinder. Their paper-thin ends turn into raised, weathered lips
  // on the visible section between the retaining wall and the fork.
  const barkRandom=lcg(51103),samplePosition=new T.Vector3(),sampleNormal=new T.Vector3();
  const cornerPosition=new T.Vector3(),cornerNormal=new T.Vector3(),slopeDirection=new T.Vector3();
  function trunkSample(height,turn){
    const axial=height*(trunk.length-1),row=Math.floor(axial),along=axial-row;
    const radial=(turn-Math.floor(turn))*trunkSides,col=Math.floor(radial),around=radial-col;
    samplePosition.set(0,0,0);sampleNormal.set(0,0,0);
    for(let dr=0;dr<=1;dr++)for(let dc=0;dc<=1;dc++){
      const index=(row+dr)*(trunkSides+1)+col+dc,weight=(dr?along:1-along)*(dc?around:1-around);
      samplePosition.addScaledVector(cornerPosition.fromArray(P,index*3),weight);
      sampleNormal.addScaledVector(cornerNormal.fromArray(N,index*3),weight);
    }
    sampleNormal.normalize();
    return U[(row*(trunkSides+1))*2+1]*(1-along)+U[((row+1)*(trunkSides+1))*2+1]*along;
  }
  for(let flake=0;flake<86;flake++){
    const bottom=.29+.44*barkRandom(),length=(.09+.13*barkRandom())*(1-.30*bottom);
    const angle=flake*.381966+.10*barkRandom(),width=.006+.014*barkRandom();
    const lean=(barkRandom()-.5)*.082,height=.19+.49*barkRandom(),start=P.length/3;
    const twist=6.28*barkRandom();
    for(let row=0;row<=12;row++){
      const f=row/12,span=.16+.84*(Math.sin(f*Math.PI)**.63);
      const at=bottom+length*f,center=angle+lean*f+.006*Math.sin(6*f+twist);
      for(let col=0;col<=4;col++){
        const c=col*.5-1,a=center+width*span*c,v=trunkSample(at,a);
        const profile=Math.max(0,1-Math.abs(c+.12))**.78;
        const rise=height*profile*Math.sin(f*Math.PI)**.74-.046;
        samplePosition.addScaledVector(sampleNormal,rise);
        slopeDirection.set(-sampleNormal.z,0,sampleNormal.x).normalize();
        sampleNormal.addScaledVector(slopeDirection,Math.sign(c+.12)*height*.38*span).normalize();
        P.push(samplePosition.x,samplePosition.y,samplePosition.z);
        N.push(sampleNormal.x,sampleNormal.y,sampleNormal.z);U.push(a-Math.floor(a),v);
        radii.push(lerp(10.6,5,at**.6));E.push(lerp(1,.48,at));wound.push(0);
        if(row&&col){const q=start+row*5+col;I.push(q-6,q-5,q-1,q-5,q,q-1);}
      }
    }
  }

  // The stationary wood in Ye 5292–5293 and the 47.9 s reverse shot
  // stays thick on both sides of the opening. The lower crescent that
  // sweeps across Ye's parapet is Radahn's moving blade.
  const twinStem=new T.CatmullRomCurve3([
    V(-2.2,18,-5),V(-3.5,25.8,-9),V(-6.4,32.0,-16.2),
    V(-9.8,37.2,-26.0),V(-12.7,42.8,-35.8),V(-14.6,49.3,-43.1),
    V(-15.8,56.6,-48.2),V(-17.3,66.5,-51.7),V(-19.8,77.1,-53.7),
    V(-24.7,87.4,-54.2),V(-30.4,95.2,-58.4)
  ]).getPoints(65);
  // The first rings are buried in the parent. Keep the new leader broad
  // until it has passed the existing crown, then taper into the shoots.
  const twinRadius=f=>lerp(10.25,5.6,T.MathUtils.smoothstep(f,.03,.67))
    *lerp(1,.07,T.MathUtils.smoothstep(f,.60,1));
  const firstTwinVertex=P.length/3,twinSides=42;
  tube(twinStem,twinRadius,twinSides,.17,.01);
  const barkSeed=lcg(529213),ringPoint=(row,col)=>new T.Vector3().fromArray(P,3*(firstTwinVertex+row*(twinSides+1)+col));
  // Bark ridges fan continuously out of the bole into the outer leader.
  // Bury both ends and expose each ridge only where it passes its neighbour.
  for(const [start,end,turn,girth] of [[1,25,8,1.34],[2,29,12,1.6],[0,27,18,1.15],[4,34,34,.93]]){
    const grain=[];
    for(let j=start;j<=end;j++){
      const u=(j-start)/(end-start),col=turn+2.25*Math.sin(2.5*u)-3.8*u;
      const k=Math.floor(col),p=ringPoint(j,k).lerp(ringPoint(j,k+1),col-k);
      const normal=p.clone().sub(twinStem[j]).normalize();
      p.addScaledVector(normal,-girth*(1.25-.80*Math.sin(Math.PI*u)));
      grain.push(p);
    }
    tube(grain,f=>.035+girth*Math.sin(Math.PI*f)**.66,12,.04,0);
  }
  // Short, broken sprays fringe the silhouette under the opening. Root
  // them on the fluted bark surface so they stay attached in reverse view.
  for(let i=0;i<94;i++){
    const row=10+Math.floor(barkSeed()*36),col=Math.floor(barkSeed()*twinSides);
    const at=ringPoint(row,col),normal=at.clone().sub(twinStem[row]).normalize();
    if(normal.y>.38)continue;
    const elbow=at.clone().addScaledVector(normal,.48+.86*barkSeed());
    const end=elbow.clone().addScaledVector(normal,.42+.67*barkSeed());
    end.y-=.56+2.3*barkSeed();
    tube([at,elbow,end],f=>lerp(.14,.035,f),4);
    if(i%3===0)tube([elbow,elbow.clone().lerp(end,.68).add(new T.Vector3(.38,-.17,.27))],f=>lerp(.085,.022,f),3);
  }
  for(const [joint,direction,length,radius] of [
    [25,[-.49,.48,-.68],21,2.6],[37,[.33,.82,-.46],29,3.1],
    [46,[-.49,.70,.57],25,2.55],[56,[-.25,.63,-.72],20,1.5]
  ])branch(twinStem[joint],new T.Vector3(...direction).normalize(),length,radius,2);
  // Lean the complete tree about its foot on the lower terrace. The primary
  // 16.5 s view exposes its gold seam left of the foreground pier; from the
  // reverse side the pier masks the opposite part of the fork.
  const tilt=new T.Matrix4().makeTranslation(bx*1.46,-3.5,bz*1.41-10.5)
    .multiply(new T.Matrix4().makeScale(1.03,1.39,1.12))
    .multiply(new T.Matrix4().makeRotationY(-.16))
    .multiply(new T.Matrix4().makeRotationX(-10*Math.PI/180))
    .multiply(new T.Matrix4().makeTranslation(-bx,0,-bz));
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(P,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(N,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(U,2));geometry.setAttribute('ember',new T.Float32BufferAttribute(E,1));
  geometry.setAttribute('branchRadius',new T.Float32BufferAttribute(radii,1));
  geometry.setAttribute('heartwood',new T.Uint8BufferAttribute(wound,1,true));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(I),1));geometry.applyMatrix4(tilt);geometry.computeBoundingSphere();geometry.computeBoundingBox();
  const bark=new T.MeshStandardMaterial({color:0x42382e,roughness:.99,metalness:0,envMapIntensity:.12});
  bark.onBeforeCompile=shader=>{
    shader.uniforms.treePhase=shared.phase||{value:0};
    shader.vertexShader='attribute float ember,branchRadius,heartwood;varying float vHeartwood,vEmber,vRadius;varying vec2 vBark;varying vec3 vTreeWorld;varying vec3 vTreeBarkNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvHeartwood=heartwood;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRadius=branchRadius;vEmber=ember;vBark=uv;vTreeBarkNormal=mat3(modelMatrix)*normal;vTreeWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=`uniform float treePhase;varying float vHeartwood,vEmber,vRadius;varying vec2 vBark;varying vec3 vTreeWorld;varying vec3 vTreeBarkNormal;
      float treeHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float treeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(treeHash(i),treeHash(i+vec2(1,0)),f.x),mix(treeHash(i+vec2(0,1)),treeHash(i+vec2(1,1)),f.x),f.y);}
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float barkRidge=treeNoise(vec2(vBark.x*46.+treeNoise(vBark*vec2(3.,1.4))*4.,vBark.y*2.1));
      float barkPatch=treeNoise(vBark*vec2(7.,.9)+3.7);
      float ridgeSide=treeNoise(vec2(vBark.x*25.+3.*barkPatch,vBark.y*1.6));
      float furrow=1.-smoothstep(.018,.11,abs(ridgeSide-.51));
      float grainAngle=6.283185*vBark.x;
      vec2 grainSpace=vec2(grainAngle*max(1.,vRadius),vBark.y*6.);
      float drift=treeNoise(grainSpace*vec2(.22,.079));
      float longFiber=treeNoise(vec2(grainSpace.x*2.5+1.32*drift,grainSpace.y*.39));
      float fissure=1.-smoothstep(.016,.15,abs(longFiber-.47));
      float scar=smoothstep(.36,.77,treeNoise(grainSpace*vec2(.71,.16)));
      diffuseColor.rgb*=1.-(.35*furrow+.39*scar*fissure)*smoothstep(.32,3.,vRadius);
      diffuseColor.rgb*=mix(.45,1.5,smoothstep(.2,.8,barkRidge))*mix(.7,1.25,barkPatch);
      float plate=ridgeSide+.21*(barkPatch-.5);
      float splitLip=smoothstep(.51,.66,plate)*(1.-smoothstep(.67,.84,plate))*smoothstep(.25,.74,barkPatch);
      diffuseColor.rgb+=vec3(.038,.027,.017)*splitLip*smoothstep(.7,3.8,vRadius);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float barkHeight=(.16*longFiber-.13*fissure*scar+.029*barkRidge+.24*splitLip)*smoothstep(.42,3.2,vRadius);
      vec3 bx=dFdx(-vViewPosition),by=dFdy(-vViewPosition);
      vec3 b1=cross(by,normal),b2=cross(normal,bx);
      float detB=dot(bx,b1);
      normal=normalize(abs(detB)*normal-sign(detB)*(dFdx(barkHeight)*b1+dFdy(barkHeight)*b2));`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      // Glowing seams run up the trunk and the feet of the great boughs.
      float seamWarp=treeNoise(vec2(vBark.y*1.3,2.))*.55+.16*sin(vBark.y*2.1);
      float seamTrack=abs(fract(vBark.x*3.+seamWarp)-.5);
      // Primary 12.4 / 16.6 s: the trunk is dark; the seams are short broken ember-orange cracks, not bright bands.
      float seamGate=smoothstep(.50,.74,treeNoise(vec2(vBark.x*5.,vBark.y*.42+9.)))*vEmber*smoothstep(-2.,7.,vTreeWorld.y)*(1.-smoothstep(62.,112.,vTreeWorld.y));
      seamGate*=smoothstep(.30,.62,treeNoise(vec2(vBark.x*9.+4.,vBark.y*1.7)));
      // Fractured amber at the exposed side of the trunk, true brown wood between seams.
      // The glowing face looks back over the terrace. The reverse wall of
      // the split is dark even when its silhouette is rimmed by pale sky.
      float front=dot(normalize(vTreeBarkNormal),vec3(-.92,.06,.38));
      seamGate*=mix(.035,1.,smoothstep(-.20,.53,front));
      float fracture=treeNoise(vec2(vBark.x*17.,vBark.y*4.2));
      float chip=treeNoise(vec2(vBark.x*81.+fracture*2.,vBark.y*5.8));
      float broken=smoothstep(.26,.68,chip);
      float core=(1.-smoothstep(.007,.017+.010*fracture,seamTrack))*seamGate*smoothstep(.39,.72,fracture)*smoothstep(.39,.69,chip);
      float flake=(1.-smoothstep(.035,.16,seamTrack))*seamGate;
      float hotChip=smoothstep(.50,.76,chip+.20*(fracture-.5));
      totalEmissiveRadiance+=vec3(3.2,1.44,.18)*core*(.17+.83*broken)
        +vec3(.79,.34,.041)*flake*hotChip
        +vec3(.18,.061,.009)*flake*smoothstep(.26,.74,fracture);
      float breakInSeam=treeNoise(vec2(vBark.y*.78,2.9))+ .20*(barkPatch-.5);
      float sap=smoothstep(.20,.76,vHeartwood)*(.18+.82*smoothstep(.29,.69,breakInSeam))*(.31+.69*smoothstep(.24,.73,longFiber+.24*(chip-.5)));
      totalEmissiveRadiance+=vec3(1.56,.57,.075)*sap*(.28+.72*broken)*(1.-.49*treePhase);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float sapwood=smoothstep(.20,.75,vHeartwood);
      float largeBough=smoothstep(.8,4.2,vRadius);
      float shade=1.-smoothstep(-.35,.66,dot(normalize(vTreeBarkNormal),normalize(vec3(.73,.44,.25))));
      outgoingLight*=1.-largeBough*(.17+.34*shade)*(1.-.82*sapwood);
      #include <opaque_fragment>`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',T.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb = mix',`
// The fork breaks the strong sun-side haze above the low dust layer.
#ifdef FOG_EXP2
  float exposedWood=smoothstep(4.,20.,vTreeWorld.y);
  vec3 sight=normalize(vTreeWorld-cameraPosition);
  float intoSun=max(0.,dot(sight,normalize(vec3(.861,.454,.231))));
  float crown=smoothstep(15.,50.,vTreeWorld.y)*(1.-.72*vEmber);
  float rear=smoothstep(-16.,22.,vTreeWorld.x-${bx.toFixed(1)}+.21*(vTreeWorld.z-${bz.toFixed(1)}));
  float fine=1.-smoothstep(.12,2.9,vRadius);
  float farWood=smoothstep(76.,156.,distance(vTreeWorld,cameraPosition));
  float throughFork=max(0.,dot(sight,normalize(vec3(.865,.454,-.213))));
  float aperture=max(pow(intoSun,6.),.96*pow(throughFork,10.))*(.70+.30*treeNoise(vTreeWorld.xz*.046));
  float veil=crown*aperture*(1.-treePhase)*mix(.28,.86,smoothstep(33.,74.,vTreeWorld.y));
  float solid=smoothstep(1.1,5.6,vRadius);
  fogFactor*=mix(.71,mix(.43,.16,solid),exposedWood*(1.-treePhase));
  float upperSide=smoothstep(-.48,.70,dot(normalize(vTreeBarkNormal),normalize(vec3(.36,.91,.20))));
  float gaps=treeNoise(vTreeWorld.xz*.067+vec2(.12*vTreeWorld.y,.07*vTreeWorld.y));
  float twigAir=smoothstep(.21,.82,gaps)*(.36+.64*rear);
  float scatter=veil*(1.-.59*solid)*(.05+.23*fine+.16*rear+.10*farWood+.16*twigAir)
    *mix(.19+.27*upperSide,.77+.23*upperSide,fine);
  vec3 sunAir=vec3(.95,.88,.65)+vec3(.45,.44,.39)*pow(intoSun,34.);
  gl_FragColor.rgb=mix(gl_FragColor.rgb,sunAir,clamp(scatter,0.,.87)*(1.-.53*solid));
  // Diffuse silver skylight grazes the upper folds at dusk. Leave the thick
  // foreground contours dark so the pale canopy reads through the fork.
  float rim=1.-abs(dot(normalize(vTreeBarkNormal),sight));
  float silverEdge=treePhase*crown*upperSide*smoothstep(.42,.87,rim)*(.32+.68*twigAir);
  gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.59,.60,.54),silverEdge*(.16+.36*fine));
#else
  fogFactor*=.52;
#endif
gl_FragColor.rgb = mix`));
  };
  bark.customProgramCacheKey=()=>'great-tree-bark-side-light';
  const mesh=new T.Mesh(geometry,bark);mesh.name='great-tree-wood';mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);

  // Find the exposed surface of the two overlapping shafts from the terrace.
  // A cut painted on the inner shaft alone disappears behind the winding stem.
  const amberPosition=[],amberColor=[],amberIndex=[];
  const shell=new T.BufferGeometry(),shellPoints=[];
  for(const [start,end] of shaftFaces)for(let i=start;i<end;i++){
    const k=3*I[i];shellPoints.push(P[k],P[k+1],P[k+2]);
  }
  shell.setAttribute('position',new T.Float32BufferAttribute(shellPoints,3));
  const testWood=new T.Mesh(shell,new T.MeshBasicMaterial({side:T.DoubleSide}));
  const front=new T.Vector3(-1,0,-.23),across=new T.Vector3(.23,0,-1).normalize();
  front.normalize();
  const ray=new T.Raycaster(),origin=new T.Vector3(),centre=new T.Vector3(),intoWood=front.clone().negate();
  for(let track=0;track<3;track++){
    let previous=null;
    for(let row=0;row<=128;row++){
      const u=row/128,t=track===0?u:track===1?.36+.39*u:.64+.24*u;
      const y=7+66*t;
      const i=windingStem.findIndex(p=>p.y>=y);
      if(i<1)continue;
      const a=windingStem[i-1],b=windingStem[i];
      centre.lerpVectors(a,b,(y-a.y)/(b.y-a.y));
      const splinter=vnoise(y*1.67,4.21)-.5;
      const grain=.41*Math.sin(12*t)+.19*Math.sin(37*t)+.14*Math.sin(81*t)+.63*splinter;
      const lateral=lerp(-2.65,1.75,t)+grain+(track===1?-2.8:track===2?2.3:0)*u;
      const width=(track===0?.63:.24)*(.60+.40*Math.sin(u*Math.PI)**.55)*(.46+.89*vnoise(y*.63,12.1));
      const first=amberColor.length/3;
      for(const side of [-1,-.43,0,.43,1]){
        origin.copy(centre).addScaledVector(across,lateral+side*width).addScaledVector(front,42);
        ray.set(origin,intoWood);
        const hit=ray.intersectObject(testWood,false)[0];
        if(!hit)break;
        hit.point.addScaledVector(front,.12);
        amberPosition.push(hit.point.x,hit.point.y,hit.point.z);
        const energy=(track?.68:1)*(.10+.90*vnoise(y*.58+side*.41,13.2))
          *(.20+.80*T.MathUtils.smoothstep(vnoise(y*.17,8.5),.22,.67));
        const heat=(1-Math.abs(side))**.8*energy;
        amberColor.push(.19+2.85*heat,.065+.99*heat,.013+.12*heat);
      }
      if(amberColor.length/3!==first+5){
        amberColor.length=amberPosition.length=first*3;previous=null;continue;
      }
      if(previous!==null)for(let c=0;c<4;c++)amberIndex.push(previous+c,first+c,first+c+1,previous+c,first+c+1,previous+c+1);
      previous=first;
    }
  }
  shell.dispose();testWood.material.dispose();
  const amber=new T.BufferGeometry();
  amber.setAttribute('position',new T.Float32BufferAttribute(amberPosition,3));
  amber.setAttribute('color',new T.Float32BufferAttribute(amberColor,3));amber.setIndex(amberIndex);
  amber.applyMatrix4(tilt);
  const cutFace=new T.Mesh(amber,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,fog:false}));
  cutFace.material.onBeforeCompile=shader=>{
    shader.uniforms.amberPhase=shared.phase||{value:0};
    shader.fragmentShader='uniform float amberPhase;\n'+shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),vec3(.23,.20,.15),amberPhase);');
  };
  cutFace.name='exposed-amber-in-trunk';root.add(cutFace);

  // Leaf litter below the backlit boughs stays clustered around the tips.
  // Most flakes cling to fine sprays. Only the scattered outliers drift.
  const flakePosition=[],flakeColor=[],flakeMotion=[],flakeRandom=lcg(72821);
  for(const limb of [lowerBough,westFork,crownArch,shoulder]){
    for(let j=8;j<limb.length-3;j+=4){
      const toe=limb[j],spread=.5+2.4*flakeRandom();
      for(let k=0;k<16;k++){
        const f=flakeRandom(),size=.09+.22*flakeRandom();
        const x=toe.x+(flakeRandom()-.5)*spread*4,y=toe.y-2.3-f*6.0,z=toe.z+(flakeRandom()-.5)*spread*3;
        const lit=flakeRandom(),phase=flakeRandom()*6.28,free=k%11===0?1.:.045;
        for(const [cx,cy,cz] of [[-1,0,0],[.64,1,.4],[.72,-.83,-.3]]){
          flakePosition.push(x+cx*size,y+cy*size,z+cz*size);
          flakeColor.push(.075+lit*.095,.063+lit*.089,.045+lit*.069);flakeMotion.push(phase,free);
        }
      }
    }
  }
  const flakes=new T.BufferGeometry();flakes.setAttribute('position',new T.Float32BufferAttribute(flakePosition,3));
  flakes.setAttribute('color',new T.Float32BufferAttribute(flakeColor,3));
  flakes.setAttribute('flutter',new T.Float32BufferAttribute(flakeMotion,2));flakes.applyMatrix4(tilt);
  const litter=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
  litter.onBeforeCompile=shader=>{
    shader.uniforms.treeTime=shared.time||{value:0};
    shader.vertexShader='uniform float treeTime;attribute vec2 flutter;\n'+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.x+=(.51*sin(treeTime*.72+flutter.x)+.21*sin(treeTime*1.18+flutter.x))*flutter.y;transformed.y+=.58*cos(treeTime*.62+flutter.x)*flutter.y;');
  };
  const shed=new T.Mesh(flakes,litter);shed.name='litter-under-tree-canopy';root.add(shed);

  // Slender blades alternate along terminal wood. A spray shares a growth
  // plane with its twig, so bright patches follow the bough instead of a rosette.
  const positions=[],tones=[],indices=[],leafVertices=[],hazeVertices=[],hazeUV=[],hazeKeys=[];
  const point=new T.Vector3(),axis=new T.Vector3(),wing=new T.Vector3(),normal=new T.Vector3();
  const addVertex=(origin,forward,across,fold,tone)=>{
    point.copy(origin).addScaledVector(axis,forward).addScaledVector(wing,across).addScaledVector(normal,fold);
    positions.push(point.x,point.y,point.z);tones.push(tone);
  };
  let sprays=0;
  for(const {point:tip,direction,stem} of tips.concat(innerSprays)){
    const reach=tip.distanceTo(fork);
    const edgeShift=5*Math.sin(tip.x*.12)+4*Math.cos(tip.z*.15+tip.y*.11);
    const outerReach=T.MathUtils.smoothstep(tip.z-bz,56,112);
    if(tip.y<47+edgeShift||reach>98+edgeShift+47*outerReach)continue;
    // Keep each pale spray attached to the same twig when the tree moves.
    const localX=tip.x-bx,localZ=tip.z-bz;
    const patch=Math.sin(localX*.25+localZ*.14+29.74)*.48+Math.cos(tip.y*.31-localX*.12-11.52)*.32+Math.sin(localZ*.35+14.35)*.2;
    if(patch<-.25||rndPale()>.54+.65*patch)continue;
    const size=(.93+rndPale()*.88)*(1-.23*T.MathUtils.smoothstep(reach,60,105));
    const count=7+Math.floor(rndPale()*9),spin=rndPale()*Math.PI*2;
    const cross=new T.Vector3().crossVectors(direction,Math.abs(direction.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize();
    const up=new T.Vector3().crossVectors(direction,cross);
    const base=new T.Vector3(),tangent=new T.Vector3(),patchTone=rndPale();
    // Translucent groups follow the back of the actual sprays. Dark wood in
    // front writes depth before this layer. Normal play and replay share it.
    if(sprays%19===0&&patch>.17){
      const width=size*(13.2+patchTone*10.8),height=width*(.46+.25*patchTone);
      const radial=new T.Vector3(tip.x,0,tip.z).normalize();
      const sideways=new T.Vector3(radial.z,0,-radial.x);
      for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){
        const point=tip.clone().addScaledVector(radial,15.+12.*patchTone).addScaledVector(sideways,u*width+v*height*.24);
        hazeVertices.push(point.x,point.y+v*height,point.z);
        hazeUV.push(u,v);hazeKeys.push(patchTone);
      }
    }
    for(let j=0;j<count;j++){
      const f=(j+.15+.6*rndPale())/count;
      const t=(.08+.90*f)*(stem.length-1),k=Math.floor(t);
      base.lerpVectors(stem[k],stem[k+1],t-k);
      tangent.subVectors(stem[k+1],stem[k]).normalize();
      const angle=spin+(j%2)*Math.PI+(rndPale()-.5)*.47;
      wing.copy(cross).multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle));
      axis.copy(tangent).addScaledVector(wing,.38+.42*rndPale()).normalize();
      normal.crossVectors(axis,wing).normalize();wing.crossVectors(normal,axis).normalize();
      const length=size*(.56+.93*rndPale())*(1.-.28*f),w=length*(.145+.12*rndPale());
      const exposure=.68*T.MathUtils.smoothstep(patch,-.15,.9)+.32*T.MathUtils.smoothstep(direction.y,-.46,.61);
      const tone=.45*patchTone+.22*rndPale()+.33*exposure,i=tones.length;
      // A backlit spray reads as broken silver on one side and translucent
      // grey on the other. Preserve holes through the crown; replace a pair
      // of broad facets with a bent rachis and three separate folded leaves.
      const pattern=(j+sprays)%5;
      if(pattern===4)continue;
      if(pattern===0){
        const sag=(.11+.16*(1-exposure))*length;
        axis.y-=.27+.17*(1-exposure);axis.normalize();
        normal.crossVectors(axis,wing).normalize();wing.crossVectors(normal,axis).normalize();
        const sprigVertex=(along,across,fold,shade)=>{
          addVertex(base,length*along,across,fold,shade);
          positions[positions.length-2]-=sag*along*along;
        };
        sprigVertex(0,-.10*w,0,tone*.57);sprigVertex(0,.10*w,0,tone*.69);
        sprigVertex(.98,0,0,tone*.86);indices.push(i,i+1,i+2);
        for(let leaf=0;leaf<3;leaf++){
          const sign=leaf%2===0?1:-1,start=.14+.22*leaf;
          const width=w*(1.16-.16*leaf),k=tones.length;
          sprigVertex(start,0,0,tone*.62);
          sprigVertex(start+.14,sign*width,.12*w,tone*.93);
          sprigVertex(start+.24,sign*.44*width,-.10*w,tone*.72);
          sprigVertex(start+.36,sign*width*1.33,-.39*w,tone*.85);
          indices.push(k,k+1,k+2,k+1,k+3,k+2);
          leafVertices.push(k,k+1,k+2,k+3,k+1);
        }
        continue;
      }
      addVertex(base,0,0,0,tone*.65);
      addVertex(base,length*.46,-w,-w*.20,tone*.84);
      addVertex(base,length*.46,0,w*.35,tone);
      addVertex(base,length*.56,w*.84,-w*.23,tone*.91);
      addVertex(base,length,0,-w*.27,tone*.78);
      indices.push(i,i+1,i+2,i,i+2,i+3,i+1,i+4,i+2,i+2,i+4,i+3);
      leafVertices.push(i,i+1,i+3,i+4,i+2);
    }
    sprays++;
  }
  const foliage=new T.BufferGeometry();
  foliage.userData.leafVertices=new Uint32Array(leafVertices);
  foliage.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  foliage.setAttribute('tone',new T.Float32BufferAttribute(tones,1));
  foliage.setIndex(indices);foliage.computeVertexNormals();foliage.applyMatrix4(tilt);foliage.computeBoundingSphere();
  const paleMaterial=new T.ShaderMaterial({
    side:T.DoubleSide,uniforms:{phase:shared.phase||{value:0},sun:{value:ARENA.sunDirection},hazeColor:shared.hazeColor||{value:new T.Color(.30,.29,.21)}},
    vertexShader:`attribute float tone;varying float vTone;varying vec3 vNormal,vWorld;
      void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;vTone=tone;vNormal=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`uniform float phase;uniform vec3 sun,hazeColor;varying float vTone;varying vec3 vNormal,vWorld;
      void main(){vec3 view=normalize(vWorld-cameraPosition),n=normalize(vNormal);
        float lit=abs(dot(n,sun)),back=pow(max(dot(view,sun),0.),8.);
        float tone=clamp(.08+vTone*.40+lit*.25+back*.16,0.,1.);
        vec3 day=mix(vec3(.24,.245,.23),vec3(1.03,1.04,.96),tone);
        float depth=smoothstep(-22.,18.,vWorld.x-${bx.toFixed(1)}+.18*(vWorld.z-${bz.toFixed(1)}));
        float leafSun=smoothstep(.18,.89,vTone*.77+.23*lit);
        day*=.50+.40*leafSun;
        day+=vec3(.93,.86,.69)*back*(.18+.69*leafSun)*(.43+.54*depth);
        float spray=smoothstep(.34,.75,vTone*.83+lit*.17);
        vec3 dusk=mix(vec3(.14,.16,.145),vec3(.99,1.01,.94),tone)+vec3(.29,.31,.285)*spray;
        // Stable white-grey sprays behind the dark boughs, visible even in
        // the gap between holy attacks. Use leaf orientation and depth.
        float silver=smoothstep(.24,.78,vTone*.66+lit*.24+depth*.10);
        dusk=mix(dusk,vec3(.33,.35,.30)+vec3(.22,.24,.21)*silver,.62+.27*silver);
        float upper=smoothstep(54.,110.,vWorld.y);
        dusk+=vec3(.14,.155,.16)*upper*(.32+.68*silver);
        float haze=(1.-exp(-distance(vWorld,cameraPosition)*.0042))*.42;
        gl_FragColor=vec4(mix(mix(day,dusk,phase),hazeColor,haze),1.);}`});
  const pale=new T.Mesh(foliage,paleMaterial);pale.name='pale-crown-masses';root.add(pale);
  const mistGeometry=new T.BufferGeometry();
  mistGeometry.setAttribute('position',new T.Float32BufferAttribute(hazeVertices,3));
  mistGeometry.setAttribute('uv',new T.Float32BufferAttribute(hazeUV,2));
  mistGeometry.setAttribute('patchKey',new T.Float32BufferAttribute(hazeKeys,1));
  mistGeometry.applyMatrix4(tilt);mistGeometry.computeBoundingSphere();
  const mistMaterial=new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,uniforms:{phase:shared.phase||{value:0}},
    vertexShader:`attribute float patchKey;varying vec2 local;varying float key;
      void main(){local=uv;key=patchKey;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float phase;varying vec2 local;varying float key;
      void main(){
        vec2 shape=local;shape.y+=.12*sin(3.7*shape.x+key*11.)+.065*sin(7.*shape.x-key*8.);
        float q=dot(shape,shape);
        float lace=.5+.5*sin(local.x*10.+key*9.+2.*sin(local.y*7.));
        float opacity=phase*exp(-3.4*q)*(1.-smoothstep(.49,1.,q))*(.14+.12*lace)*(.74+.26*key);
        if(opacity<.008)discard;
        gl_FragColor=vec4(mix(vec3(.41,.435,.395),vec3(.67,.69,.64),key),opacity);
      }`});
  const silverSprays=new T.Mesh(mistGeometry,mistMaterial);
  silverSprays.name='dusk-silver-foliage';silverSprays.renderOrder=-1;root.add(silverSprays);
  root.userData={fork:fork.applyMatrix4(tilt).toArray(),triangles:I.length/3,tips:tips.length,paleMasses:sprays,crownTriangles:indices.length/3};
  return root;
}
