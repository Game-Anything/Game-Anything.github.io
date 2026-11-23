import * as T from "game/lib/three.module.js";
import {seatRiderCrown} from "game/src/companion-fit.js";

// Sweep each lock around its own guide. The sectional grooves and the surface
// fibers follow that same guide, so they stay together during the spell poses.
export function sculptCompanionLocks(ultra=false) {
  const lining = [], cards = [], fibers = [];
  const random = i => T.MathUtils.euclideanModulo(Math.sin(i * 127.13 + 3.14) * 43758.5453, 1);
  const point = (x,y,z) => new T.Vector3(x,y,z);
  const grooveLight=(t,phase)=>.5+.5*Math.sin(phase*.71+5.7*t);
  function lock(points, width, phase, bearing, front = false, short = false, pigment = phase, mantle = false) {
    // The seated torso leans around Radahn's left shoulder. Follow its scalp
    // over the first span, then let the hanging lengths drape over the armor.
    if(!short){
    for(const v of points){
      const follow=T.MathUtils.smootherstep(v.y,3.15,4.57);
      v.x-=.60*follow; v.y+=.27*follow; v.z-=.18*follow;
      if(!front)v.y-=.48*(1-T.MathUtils.smootherstep(v.y,-.5,2.65));
    }
    // In chest space the Tripo crown sits at (-.61,4.92,.21). Sink each
    // root just inside its real scalp; blend out to the shoulder guides.
    const scalp=points[0];
    const offset=point(-.61+.66*(scalp.x+.60)-scalp.x,
      4.92+.35*(scalp.y-5.04)-scalp.y,.21+.40*(scalp.z-.60)-scalp.z);
    points.forEach((v,i)=>v.addScaledVector(offset,1-T.MathUtils.smootherstep(i/(points.length-1),0,.44)));
    }
    points.forEach(seatRiderCrown);
    const curve = new T.CatmullRomCurve3(points);
    const length = curve.getLength(), rows = ultra ? (short ? 42 : 68) : (short ? 27 : 46), samples = [];
    const root = curve.getPoint(0), tone = random(pigment);
    const curlPhase=phase*.71+Math.sign(bearing)*.59;
    const turns=(short?.63:.42)+(short?1.12:1.08)*random(pigment+51);
    const curledGuide=[];
    for (let j=0; j<=rows; ++j) {
      const t=j/rows,p=curve.getPointAt(t),axis=curve.getTangentAt(t);
      const side=point(Math.cos(bearing),0,-Math.sin(bearing));
      side.addScaledVector(axis,-side.dot(axis)).normalize();
      const back=new T.Vector3().crossVectors(axis,side).normalize();
      const angle=2*Math.PI*turns*t+curlPhase+.83*Math.sin(8*t+curlPhase);
      const bend=T.MathUtils.smootherstep(t,.014,short?.21:.32);
      const radius=short ? (.035+.060*tone)*bend
        : (.095+.17*tone)*bend*(.60+.55*t)*(.70+.30*Math.sin(6*t+curlPhase));
      const shoulderRoll=short?0:Math.sin(Math.PI*Math.min(1,t/(.37+.24*tone)))*(.050+.09*tone);
      const curl=mantle?.78:(short||front?1:.78);
      p.addScaledVector(side,curl*(radius+shoulderRoll)*Math.sin(angle))
       .addScaledVector(back,curl*(radius*.84+shoulderRoll)*Math.cos(angle));
      // Loose temple groups cross the long mantle in broad S-shaped folds.
      // Keep the roots in the generated crown and allow the flanks to separate.
      if(!short){
        const fall=bend*Math.sin(Math.PI*t)*Math.abs(Math.sin(bearing));
        p.addScaledVector(side,fall*(.095+.13*tone)*Math.sin(6.4*t+curlPhase))
         .addScaledVector(back,fall*.12*Math.cos(8*t+curlPhase));
      }
      // Some ends hook back up underneath the overlapping illuminated locks.
      p.y+=(radius*.67+shoulderRoll)*Math.sin(angle+.62)*bend;
      curledGuide.push(p);
    }
    for(let j=0;j<=rows;j++){
      const t=j/rows,p=curledGuide[j];
      const tangent=curledGuide[Math.min(rows,j+1)].clone().sub(curledGuide[Math.max(0,j-1)]).normalize();
      // The deeper shoulder folds drape across the cape rather than
      // presenting the narrow edge of every lock to the front of the arena.
      const sectionBearing=mantle?bearing*.35+.22*Math.sin(phase+t*5.1):bearing;
      const across=point(Math.cos(sectionBearing),0,-Math.sin(sectionBearing));
      across.addScaledVector(tangent,-across.dot(tangent)).normalize();
      across.applyAxisAngle(tangent,(mantle?.36:1)*(.46*Math.sin(t*12+phase)+.57*t*Math.sin(phase)));
      const out=new T.Vector3().crossVectors(tangent,across).normalize();
      const shoulderWidth=short?1:1+(mantle?.28:.14)*Math.sin(Math.PI*t);
      const radius=width*shoulderWidth*(.14+.86*T.MathUtils.smoothstep(t,0,.20))
        *Math.pow(Math.max(.00015,1-t),mantle?.34:.70)*(.89+.11*Math.cos(t*10+phase));
      samples.push({t,p,across,out,radius});
    }
    function sweep(target, sides, section, permeability=0) {
      const position=[], uv=[], color=[], roots=[], weight=[], drop=[], phases=[], opacity=[], indices=[];
      for(let j=0;j<=rows;j++) {
        const {t,p,across,out,radius}=samples[j];
        for(let k=0;k<=sides;k++) {
          const [x,z,ridge,looseX=0,looseZ=0] = section(k/sides,t);
          const v=p.clone().addScaledVector(across,radius*x+looseX).addScaledVector(out,radius*z+looseZ);
          position.push(v.x,v.y,v.z); uv.push(k/sides,t); roots.push(root.x,root.y,root.z);
          const value=(.53+.37*T.MathUtils.smoothstep(t,0,.31))*(.82+.18*tone)*ridge;
          // Linear reflectance. Recessed flutes stay ochre while crest fibers reflect ivory.
          const crest=grooveLight(t,phase);
          const shadow=mantle?.63+.42*crest:1;
          color.push(value*(1.02+.07*tone)*shadow,value*(.85+.14*tone)*shadow,value*(.54+.19*tone+(mantle?.13*crest:0))*shadow);
          weight.push(t*(short?.27:1)); drop.push(t*length); phases.push(phase);
          opacity.push(1.-permeability*(.26+.74*T.MathUtils.smootherstep(t,.12,.74)));
          if(j<rows && k<sides) {
            const n=j*(sides+1)+k;
            indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);
          }
        }
      }
      const g=new T.BufferGeometry();
      for(const [name,data,size] of [['position',position,3],['color',color,3],['uv',uv,2],['maneRoot',roots,3],['maneWeight',weight,1],['maneDrop',drop,1],['manePhase',phases,1],['maneDensity',opacity,1]]) {
        g.setAttribute(name,new T.Float32BufferAttribute(data,size));
      }
      g.userData.strandGrid={rows,sides,short};
      g.setIndex(indices);g.computeVertexNormals();target.push(g);
    }
    // Elliptical, fluted cross-sections catch and occlude light from every view.
    sweep(lining,ultra&&mantle?20:ultra?16:10,(u,t)=>{
      const a=u*2*Math.PI, groove=.5+.5*Math.cos((mantle?4.:3.)*a+1.1*Math.sin(t*6+phase)+.38*Math.sin(t*14+pigment));
      const tips=T.MathUtils.smootherstep(t,.34+.15*tone,.91);
      // The opaque center narrows before the surrounding filaments end. Backlight
      // can pass between the groups below the pauldrons (76.5 and 88.5 seconds).
      const core=(mantle?.73:front?.31:.61)*(.86+.14*Math.sin(t*8+phase))*(1.-tips*(mantle?.51:.36+.30*tone));
      return [core*Math.cos(a)*(.85+.15*groove),core*Math.sin(a)*(.39+.22*groove),.60+.38*groove];
    });
    for(let i=0;i<4;i++){
      const pathAngle=phase+i*2.40;
      // These filaments are ruled ribbons. Preserve a central vertex near the
      // face and on wider folds for contact deformation; the narrow side ribbons
      // get their shape from the longitudinal guide and the two silhouette edges.
      sweep(cards,front||short||mantle||width>.14?2:1,(u,t)=>{
        const a=pathAngle+.42*Math.sin(t*7+phase)+.45*t;
        const split=T.MathUtils.smootherstep(t,.14+.15*random(pathAngle),.78);
        const offset=(u-.5)*(.85+.44*t)*(1.-split*(.32+.42*random(pathAngle+2))),lift=-.29+.50*t*t;
        const free=Math.sin(t*Math.PI*.86)*T.MathUtils.smootherstep(t,.08,.44);
        const looseX=free*(.062+.15*random(pathAngle))*Math.sin(t*(10+5*tone)+pathAngle+.56*Math.sin(9*t));
        const looseZ=free*(.049+.12*random(pathAngle+1))*Math.cos(t*(8+5*tone)+pathAngle);
        return [Math.cos(a)*(1+lift)-Math.sin(a)*offset,Math.sin(a)*(.51+lift)+Math.cos(a)*offset,.89+.10*Math.cos(a),looseX,looseZ];
      },.13+.48*random(pathAngle+5));
    }
    // A wispy veil lifts off selected outer guides. Its physical width breaks
    // away from the tapering core, so backlit gaps survive at combat distance.
    if(!front && !short && tone>.28)for(let drift=0;drift<3;drift++){
      const q=phase+2.41*drift;
      sweep(cards,1,(u,t)=>{
        const free=T.MathUtils.smootherstep(t,.24,.80);
        const angle=q+.85*Math.sin(t*7.3+q*.5);
        const driftX=free*(.12+.18*random(q+8))*Math.sin(8.1*t+q);
        const driftZ=free*(.09+.12*random(q+3))*Math.cos(10.6*t+q);
        const narrow=(u-.5)*(.18+.19*free);
        return [Math.cos(angle)*(.78+.60*free)-Math.sin(angle)*narrow,
          Math.sin(angle)*(.45+.26*free)+Math.cos(angle)*narrow,1.02,driftX,driftZ];
      },.50+.30*random(q+9));
    }
    // Sparse free fibers separate from the tapered body in the last third.
    if(!front || tone>.35) sweep(fibers,3,(u,t)=>{
      const a=phase+.65*Math.sin(9*t+phase),e=2*Math.PI*u,loose=1+.72*t*t;
      const free=T.MathUtils.smootherstep(t,.16,.68);
      return [Math.cos(a)*loose+.010*Math.cos(e),Math.sin(a)*(.54+.36*t*t)+.010*Math.sin(e),1.04,
        free*.105*Math.sin(phase+t*14),free*.086*Math.cos(phase+t*12)];
    });
  }
  // The hair parts across the real seated head and curls over each shoulder.
  // Two staggered lengths form the mantle, with a lower layer visible through
  // the upper locks. The center of the face remains open.
  for(let layer=0;layer<2;layer++) {
    const count=layer?43:39;
    for(let i=0;i<count;i++){
      const id=layer*97+i;
      const lane=i-(count-1)/2, a=lane===0?0:(lane+Math.sign(lane)*.22*(random(id)-.5))*3.92/count;
      const phase=id*2.39996, lateral=Math.sin(a), rear=Math.cos(a);
      const long=layer===0, reach=long?1.68+.39*random(id+5):1.86+.51*random(id+5);
      const fall=long?4.42+.55*random(id+11):2.97+1.18*random(id+11);
      const wave=.18+.22*random(id+9);
      const flank=T.MathUtils.smoothstep(Math.abs(a),.43,1.30);
      const points=[];
      for(let j=0;j<=12;j++){
        const t=j/12, arch=Math.sin(Math.PI*Math.min(1,t/.32));
        // The upper lengths drop down the nape before spreading behind the
        // shoulder blades. The wide silhouette belongs to the lower cape.
        const shoulder=T.MathUtils.smootherstep(t,.06,.59-.19*flank);
        const radial=.19+reach*shoulder*(.82+.15*t)+.09*Math.sin(t*10+phase)*shoulder;
        const back=T.MathUtils.smoothstep(t,0,.43);
        const sweepSide=-.34*back;
        const sweep=wave*Math.sin(t*(7.5+2.7*random(id+39))+phase)*shoulder+.12*Math.sin(t*16+phase)*t*t;
        points.push(point(lateral*radial+Math.sign(lateral)*rear*sweep*.46+sweepSide,
          4.67+.12*rear+.12*(1-t)*layer+.07*arch-(fall+.34)*t-.27*back*(1-t)+.10*Math.sin(t*13+phase)*shoulder,
          .73+rear*radial*.54-Math.abs(lateral)*sweep*.43+.69*back+.31*t));
      }
      // The mantle divides at the nape, sweeps across the shoulder tops, then
      // hangs in front of the cape edge behind each arm in the combat view.
      if(flank>0){
        const side=Math.sign(lateral), amplitude=(long?.54:.42)+.18*random(id+17);
        for(const p of points){
          const edge=flank*(1-T.MathUtils.smootherstep(p.y,2.12,4.25));
          p.x+=side*edge*amplitude;
          p.z-=edge*(.44+.13*random(id+21));
        }
      }
      lock(points,(long?.136:.106)+.039*random(id+3),phase,a);
    }
  }
  // A second fall grows behind the temples, rolls over the pauldrons and
  // hangs on the camera side of the cape. Interleave narrow locks with broad
  // ones, leaving slits of background below the elbows.
  for(const side of [-1,1])for(let i=0;i<22;i++){
    const id=410+i+(side>0?29:0),f=(i+.5)/22,familyPhase=Math.floor(i/3)*1.79+(side>0?.67:0),phase=familyPhase+.21*(i%3);
    const radius=1.40+1.03*f;
    const p=[point(side*(.14+.10*f),4.72,.64),
      point(side*(.39+.13*f),4.49,.49),
      point(side*(.74+.27*f),4.12,.45+.28*f),
      point(side*(1.02+.43*f),3.69,.48+.34*f),
      point(side*(1.14+.54*f),3.05,.53+.39*f),
      point(side*radius,2.38,.55+.46*f),
      point(side*(radius+.13),1.52,.57+.52*f),
      point(side*(radius+.20),.62,.68+.52*f),
      point(side*(radius+.28),-.53+.58*random(id+11),.72+.53*f)];
    for(let j=1;j<p.length;j++){
      const t=j/(p.length-1),loose=T.MathUtils.smoothstep(t,.08,.64);
      const family=familyPhase+.14*(i%3);
      p[j].x+=side*loose*(.37*Math.sin(family+8.2*t)+.055*Math.sin(16*t+phase))-.72*T.MathUtils.smootherstep(t,.04,.56);
      p[j].y+=loose*.075*Math.cos(phase+8*t);
      p[j].z+=loose*(.21*Math.cos(family+10*t)+.046*Math.sin(phase+15*t));
    }
    lock(p,(i%3===1?.194:.084)+.045*random(id+21),phase,side*(1.32+.51*f),false,false,id,i%3===1);
  }
  // From the front the underlayer remains visible beneath both fists. Its
  // outer lengths spill over the cape edges while the sternum stays clear.
  for(let i=0;i<14;i++)for(const side of [-1,1]){
    const f=(i+.5)/14,seed=642+i+(side>0?43:0),tip=1.62+1.52*f;
    const radius=[.14,.41,.80,1.07,1.22+.42*f,1.30+.78*f,1.47+.98*f,tip,tip+.10];
    const ys=[4.69,4.49,4.12,3.67,3.04,2.38,1.56,.72,-.64+.57*random(seed)];
    const zs=[.76,.67,.59,.53,.36,.31,.28,.29,.32];
    const phase=seed*2.39996,points=radius.map((r,j)=>{
      const t=j/8,k=T.MathUtils.smootherstep(t,.06,.52);
      const shoulderFall=Math.sin(Math.PI*t)*k*(1.-.62*f);
      return point(side*(r+k*(.09*Math.sin(t*6.3+phase)+.06*Math.sin(t*11+phase)))-.51*k,
        ys[j],zs[j]+k*(.23*f+.075*Math.sin(phase+t*9))-.36*shoulderFall);
    });
    lock(points,.197+.093*random(seed+24),phase,side*(1.13+.52*f),false,false,seed,true);
  }
  // A loose overlayer parts around the two pauldrons, then falls behind the elbows.
  for(const side of [-1,1])for(let i=0;i<10;i++){
    const f=random(i+735),a=i*2.4+side*.7;
    const p=[point(side*.15,4.68,.66),point(side*.46,4.46,.47),
      point(side*(.77+.12*f),4.12+.09*f,.19),point(side*(1.14+.16*f),3.81+.10*Math.cos(a),.04),
      point(side*(1.39+.26*f),3.46+.14*Math.sin(a),.02+.10*f),
      point(side*(1.45+.38*f),3.12,.19+.16*f),point(side*(1.53+.33*f),2.69+.25*f,.32+.12*f)];
    lock(p,.029+.017*f,a+820,side*1.34,true,false,i+737);
  }
  // At the temples the short curls lift and turn back over the long nape.
  // Their crown remains parted, leaving the fitted forehead and eyes visible.
  for(let i=0;i<46;i++){
    const a=-2.48+(i+.38*random(i+21))/46*4.96,rear=Math.cos(a);
    const phase=2.39996*i,points=[];
    const reach=.20+.10*random(i+112),drop=.38+.32*random(i+31);
    for(let j=0;j<=12;j++){
      const t=j/12,arch=Math.sin(Math.PI*t);
      const r=.13+reach*Math.sin(1.82*t)+.047*arch*Math.sin(t*10+phase);
      // Sweep the temple curls away from the eyes and back toward the ears.
      const theta=a*(1-.28*t)+.14*t*Math.sin(phase+t*9);
      points.push(point(-.61+Math.sin(theta)*r,
        4.96+.05*rear+.08*arch-drop*t+.052*arch*Math.cos(phase+t*8),
        .18+Math.cos(theta)*r*.92+.08*t*t));
    }
    lock(points,.026+.019*random(i+42),phase+182,a,true,true);
  }
  // Overlapping lengths bridge the high crown and the mantle at the nape.
  for(let i=0;i<26;i++){
    const a=-1.96+(i+.5)/26*3.92,phase=i*2.39996;
    const s=Math.sin(a),c=Math.cos(a),f=random(i+67);
    const p=[point(-.61+.08*s,4.97+.04*c,.20+.05*c),
      point(-.60+.24*s,5.045+.036*f,.23+.21*c),
      point(-.57+.36*s,4.94+.050*f,.31+.29*c),
      point(-.54+.46*s,4.72+.065*f,.46+.33*c),
      point(-.50+.57*s,4.43+.08*f,.58+.36*c),
      point(-.50+.65*s,4.15+.19*f,.65+.39*c)];
    lock(p,.064+.025*f,phase+412,a,false,true,i+216,true);
  }
  for(const s of [-1,1])for(let i=0;i<7;i++){
    const f=i/6, d=f-.5, phase=i*2.4+s*11;
    const p=[point(s*(.19+.08*f),4.67,.61),point(s*(.39+.14*f),4.55,.18),
      point(s*(.66+.22*f),4.39,-.24),point(s*(.88+.25*d),4.02,-.54-.07*f),
      point(s*(.82+.28*d),3.45,-.79),point(s*(1.06+.32*d),2.95,-.75+.08*Math.sin(phase)),
      point(s*(.91+.35*d),2.44,-.80),point(s*(.97+.41*d),1.40+.68*random(i+13*s),-.58)];
    // Fine sidelocks leave the temple behind the ear and meet the back
    // curtain. The forearms remain in front of the collar.
    for(let j=1;j<p.length;j++){
      const t=j/(p.length-1),back=T.MathUtils.smootherstep(t,.015,.49);
      p[j].x+=s*(.28+.08*Math.sin(7*t+i))*back-.72*back;
      p[j].z+=back*(1.72+.16*f);
      p[j].y-=back*(.69+.29*t);
    }
    lock(p,.034+.015*random(i+25),phase,s*.42,true,false,i+25);
  }
  return {lining,cards,fibers};
}
