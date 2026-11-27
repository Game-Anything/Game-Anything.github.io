import * as T from "game/lib/three.module.js";
import {sculptCompanionLocks} from "game/src/companion-locks.js";
import {createCompanionHairMotion,hairMotionDeclarations,hairContactShader} from "game/src/companion-hair-motion.js";
import {mergeGeometries} from "game/lib/addons/utils/BufferGeometryUtils.js";

// The companion's hair stays attached to the torso. Motion is evaluated in
// the vertex shader so a close camera does not require rebuilding its geometry.
export function createCompanionMane(ultra=false,fullDetail=ultra) {
  const group = new T.Group();
  const uniforms = {
    portraitFrame:{value:new T.Matrix4()},portraitInverse:{value:new T.Matrix4()},portraitRestInverse:{value:new T.Matrix4()},
    maneTime: {value: 0},
    spellLight: {value: 0},
    castLift: {value: 0},
    passingCut: {value:0},
    combatLight: {value:0},
    onFoot: {value:0},portraitDrape:{value:0},
    veilFlow: {value: new T.Vector3()},
    maneWind: {value: new T.Vector2()},
    maneWindMid: {value: new T.Vector2()},
    maneWindLate: {value: new T.Vector2()},
    maneUp: {value: new T.Vector3(0, 1, 0)},
    maneFloor: {value: 0},
    maneBurst: {value: 0},
  };
  const {lining,cards,fibers} = sculptCompanionLocks(true);
  const levels=[];
  const dynamics=createCompanionHairMotion(lining,cards,fibers,!fullDetail);
  Object.assign(uniforms,dynamics.uniforms);

  const canvas = document.createElement('canvas');
  const density=ultra?2:1;
  canvas.width = 128*density; canvas.height = 1024*density;
  const ctx = canvas.getContext('2d');
  ctx.scale(density,density);
  const veil = ctx.createLinearGradient(0, 0, 128, 0);
  veil.addColorStop(0, 'rgba(255,248,222,0)');
  // Fine separate filaments instead of a filled ribbon (primary 98-101 s: a pale, wispy, luminous cloud).
  veil.addColorStop(.20, 'rgba(246,239,216,.16)');
  veil.addColorStop(.50, 'rgba(250,243,222,.34)');
  veil.addColorStop(.80, 'rgba(246,239,216,.11)');
  veil.addColorStop(1, 'rgba(255,248,222,0)');
  ctx.fillStyle = veil; ctx.fillRect(0, 0, 128, 1024);
  // Overlapping filaments shade the interior of a lock. The thin bright
  // edges below follow the same curves so the hair has grain under cast light.
  for(let i=1;i<40;i++){
    const rootX=2+i*3.06,tip=784+(i*89%239);
    const strength=.18+.21*(.5+.5*Math.sin(i*2.19));
    const shade=ctx.createLinearGradient(0,0,0,tip);
    shade.addColorStop(0,'rgba(103,81,49,0)');
    shade.addColorStop(.20,'rgba(107,83,46,'+strength+')');
    shade.addColorStop(.76,'rgba(128,104,62,'+strength+')');
    shade.addColorStop(1,'rgba(114,94,61,0)');
    ctx.strokeStyle=shade;ctx.lineWidth=1.05+(i%4)*.28;
    ctx.beginPath();
    for(let y=0;y<=tip;y+=8){
      const x=rootX+.85*Math.sin(y*.010+i*.49)+.43*Math.sin(y*.028+i*1.21);
      if(y)ctx.lineTo(x,y);else ctx.moveTo(x,y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 48*density; i++) {
    const x = 2 + i * 2.6/density, edge = Math.sin(Math.PI * (i + .5) / (48*density));
    ctx.strokeStyle = `rgba(252,249,236,${(.36 + i % 5 * .13) * edge})`;
    ctx.lineWidth = (1.0 + i % 3 * .5)/density;
    ctx.beginPath();
    const end = 780 + (i * 71 % 245);
    for (let y = 0; y <= end; y += 4) {
      const offset = Math.sin(y * .012 + i * 1.7) * .75;
      if (y) ctx.lineTo(x + offset, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  // Card v=0 is the scalp. The image starts at the root and its individual
  // filaments terminate at different heights toward the bottom of the canvas.
  texture.flipY = false;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  const cardMaterial = new T.MeshStandardMaterial({
    map: texture, vertexColors: true, side: T.DoubleSide, forceSinglePass: true,
    alphaTest: .045, transparent: true, opacity: .86, depthWrite: false,
    roughness: .78, emissive: 0xffefd3, emissiveIntensity: .055,
  });
  cardMaterial.color.setRGB(1.04,.98,.84);
  const fiberMaterial = new T.MeshStandardMaterial({
    vertexColors: true, roughness: .80, emissive: 0xffdfa2, emissiveIntensity: .065,
  });
  // Broad inner locks give the cascading hair its volume. Separate, finer
  // outer fibers can then carry the silhouette during a retreat or plunge.
  // Continuous pigment, occlusion and staggered filament ends within each
  // solid lock. This map wraps around the ellipse, including its hidden side.
  const coreCanvas=document.createElement('canvas');
  coreCanvas.width=256*density;coreCanvas.height=512*density;
  const coreCtx=coreCanvas.getContext('2d'), pixels=coreCtx.createImageData(coreCanvas.width,coreCanvas.height);
  for(let row=0;row<coreCanvas.height;row++)for(let col=0;col<coreCanvas.width;col++){
    const x=col/density,y=row/density,along=row/(coreCanvas.height-1);
    const grain=x+2.2*Math.sin(y*.014+x*.036)+1.1*Math.sin(y*.021-x*.038);
    const ridge=.5+.5*Math.sin(grain*2.26+1.4*Math.sin(grain*.39));
    const recess=.5+.5*Math.sin(grain*.33+Math.sin(grain*.19));
    const fiber=ultra?7*Math.sin(grain*4.8+.8*ridge):0;
    const base=144+54*ridge+33*recess+fiber, lane=Math.floor(grain/2);
    const end=.75+.25*(.5+.5*Math.cos(lane*2.39));
    const k=(coreCanvas.width*row+col)*4;
    const ridgeTint=.5+.5*ridge;
    pixels.data[k]=base*(.91+.05*ridgeTint)+6;
    pixels.data[k+1]=base*(.79+.12*ridgeTint);
    pixels.data[k+2]=base*(.61+.19*ridgeTint);
    // Several long channels go all the way through the core. More of each
    // group divides into individual fibers towards its fraying end.
    const split=.5+.5*Math.sin(grain*.74+.87*Math.sin(grain*.17));
    // Carry a connected body of fibers below the elbows. Dividing the
    // bundle from its root makes the averaged alpha mip disappear at distance.
    const cut=.045+.30*T.MathUtils.smoothstep(along,.46,.95);
    const coverage=T.MathUtils.smoothstep(split,cut,cut+.13);
    pixels.data[k+3]=255*coverage*(1-T.MathUtils.smoothstep(along,end-.14,end));
  }
  coreCtx.putImageData(pixels,0,0);
  const coreMap=new T.CanvasTexture(coreCanvas);
  coreMap.colorSpace=T.SRGBColorSpace;coreMap.flipY=false;coreMap.anisotropy=8;
  const liningMaterial = new T.MeshStandardMaterial({
    map:coreMap, alphaTest:.47, vertexColors:true, side:T.DoubleSide, roughness:.84, emissive:0xf3ddac, emissiveIntensity:.045
  });
  for (const [parts, material] of [[lining,liningMaterial],[cards, cardMaterial], [fibers, fiberMaterial]]) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = hairMotionDeclarations+`uniform float maneTime; uniform float castLift; uniform float passingCut; uniform vec3 veilFlow; uniform vec2 maneWind; uniform vec2 maneWindMid; uniform vec2 maneWindLate; uniform vec3 maneUp; uniform float maneFloor; uniform float maneBurst;
        uniform mat4 portraitFrame,portraitInverse,portraitRestInverse;
        uniform float combatLight,onFoot,portraitDrape;attribute vec3 maneRoot; attribute float maneWeight; attribute float manePhase; attribute float maneDrop; attribute float maneDensity; varying float strandDensity; varying float strandAlong; varying float strandFamily;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        strandDensity=maneDensity;strandAlong=maneWeight;strandFamily=.5+.5*sin(manePhase*1.73);
        float w = pow(maneWeight, 1.5);
        vec2 flutter = vec2(sin(maneTime * 2.05 + manePhase + maneWeight * 5.0),
          cos(maneTime * 1.63 + manePhase * .7 + maneWeight * 4.0));
        // Every lock answers with its own gain; its middle and tip follow through later than its root.
        float lockGain = .70 + .62 * fract(sin(manePhase * 12.9898) * 43758.5453);
        vec2 carried = mix(mix(maneWind, maneWindMid, smoothstep(.05, .55, maneWeight)), maneWindLate, smoothstep(.50, 1., maneWeight));
        vec2 sway = w * (carried * lockGain * .21 + flutter * vec2(.071, .056));
        // Short curls have reduced wind weight but still span a whole guide.
        transformed+=guideOffset(uv.y);
        float crown=smoothstep(4.38,4.92,position.y);
        transformed.y+=combatLight*crown*(.014+.018*strandFamily);
        float fan=combatLight*smoothstep(.08,.65,maneWeight);
        transformed.x+=fan*carried.x*(.40+.78*lockGain)*(1.-.34*maneBurst);
        transformed.y+=fan*abs(carried.x)*(.24+.35*lockGain);
        transformed.xz += sway;
        // Curl the free ends independently; no synchronized straight fringe.
        float tipWave=smoothstep(.32,1.,maneWeight);
        transformed.x+=tipWave*.065*sin(maneWeight*17.+manePhase+ .8*sin(maneTime*1.2+manePhase));
        transformed.z+=tipWave*.055*cos(maneWeight*13.+manePhase*.8+ .7*sin(maneTime*1.4+manePhase));
        // A lock that swings out lifts instead of stretching.
        transformed.y += min(maneDrop * .45, dot(sway, sway) / max(.8, 2. * maneDrop));
        transformed.xz+=passingCut*w*maneWind*vec2(1.4,.75);
        transformed.y+=passingCut*w*length(maneWind)*(.18+.29*sin(manePhase+3.*maneWeight));
        transformed += (-maneUp - vec3(0.0, -1.0, 0.0)) * maneDrop * w * .65;
        // The shoulder roots stay fixed. The outer lengths lift and trail
        // behind the bearer when a falling strike ends.
        float sail = max(0.0,castLift) * .45 * smoothstep(0.02, .80, maneWeight);
        float flank = sin(manePhase * 1.37 + maneWeight * 2.1);
        float crossing = smoothstep(.12, .84, sin(manePhase * .69));
        transformed.x += sail * ((position.x-maneRoot.x)*.45 + flank*.16);
        float curl=sin(maneWeight*8.4+manePhase*.63+sin(maneWeight*4.6));
        transformed.x+=sail*curl*(.22+.55*crossing);
        transformed.z += sail * (.54 + maneWeight * 1.18 + flank * .27 + curl*.14);
        transformed.y += sail * (.44 + .42 * sin(maneWeight * 3.2 + manePhase) - crossing * (.52 + .64 * maneWeight));
        // During the plunge the loose hair streams behind the head, then
        // spreads to the sides at impact. The tied roots keep their shape.
        float freeLength=smoothstep(.06,.86,maneWeight);
        float ribbonWave=sin(manePhase*.42+maneWeight*11.0+.65*sin(maneWeight*4.5));
        // In a spinning cut the locks are thrown out by different amounts and separate, instead of moving as one mat.
        float thrown=(.30+.66*fract(sin(manePhase*7.31)*9631.7))*(.82+.18*ribbonWave);
        float swingWeight=mix((.32+.51*crossing+.17*ribbonWave)*freeLength,
          thrown*smoothstep(.06,.90,maneWeight),passingCut);
        transformed+=veilFlow*swingWeight*.55;
        transformed.y+=length(veilFlow)*.20*freeLength*ribbonWave;
        float landing=max(0.0,-castLift)*smoothstep(.08,.91,maneWeight);
        transformed.x += landing*(position.x*.68+.24*flank);
        transformed.z += landing*(.51+1.24*maneWeight);
        transformed.y += landing*(.24+.64*maneWeight);
        // Primary 121.5-122.3 and 127.4-128.9: when the light breaks out of the
        // floor under the bowed body the whole mane is blown open into a wide
        // radial fan around the shoulders, every lock streaming outward and up.
        float burstWeight=maneBurst*smoothstep(.03,.52,maneWeight);
        if(burstWeight>0.0){
          vec2 azimuth=position.xz-vec2(0.0,.36);
          vec2 radial=azimuth/max(.05,length(azimuth));
          float reach=maneDrop*(.64+.13*sin(manePhase*2.3));
          float ripple=sin(maneTime*7.5+manePhase*1.3+maneWeight*9.0);
          vec3 fan=vec3(radial.x*(.34+.76*reach),4.70+reach*(.36+.22*sin(manePhase*.83))+.10*ripple*maneWeight,.36+radial.y*(.28+.87*reach));
          fan.xz+=vec2(-radial.y,radial.x)*ripple*.17*maneWeight;
          fan+=maneUp*reach*.34;
          transformed=mix(transformed,fan,burstWeight*.53);
        }
        // Limit the free lock to its arc length after inertia and casting forces.
        vec3 root=maneRoot;
        vec3 extent=transformed-root;
        float reachLimit=max(.45,maneDrop*1.08+.45);
        float lateralLimit=reachLimit*mix(1.,.64,clamp(burstWeight,0.,1.));
        extent.xz*=min(1.,lateralLimit/max(.001,length(extent.xz)));
        transformed=root+extent;
        if(length(extent)>reachLimit)transformed=root+normalize(extent)*reachLimit;
        ${hairContactShader}
        // Route the separate shoulder locks behind the cheek as they swing
        // through the crown. The sculpted temple curls already frame the eyes.
        float atScalp=crown*(1.-smoothstep(.035,.40,uv.y));
        vec3 posedRoot=(portraitFrame*portraitRestInverse*vec4(transformed,1.)).xyz;
        transformed=mix(transformed,posedRoot,atScalp);
        vec3 atFace=(portraitInverse*vec4(transformed,1.)).xyz;
        float nearCheek=(1.-smoothstep(.15,.34,abs(atFace.x)))
          *smoothstep(-.37,-.22,atFace.y)*(1.-smoothstep(.10,.22,atFace.y));
        float onCloth=(1.-smoothstep(.32,.72,abs(atFace.x)))*smoothstep(-.99,-.69,atFace.y)
          *(1.-smoothstep(-.30,-.12,atFace.y));
        float behind=max(0.,.16-atFace.z)*nearCheek+max(0.,.35-atFace.z)*onCloth;
        transformed+=(portraitFrame*vec4(.12*onCloth*sign(atFace.x),0.,behind,0.)).xyz;
        // On the landing the train of free hair follows behind the stride.
        float fall=portraitDrape*smoothstep(.15,.79,maneWeight);
        transformed.x=mix(transformed.x,maneRoot.x+.78*(transformed.x-maneRoot.x),fall);
        transformed.y-=fall*(.38+.21*strandFamily);
        transformed.z+=fall*.43;
        float train=onFoot*smoothstep(.16,.89,maneWeight);
        transformed.z+=train*(1.16+.25*sin(manePhase));
        transformed.y+=train*(1.25+.35*sin(manePhase*.71));
        vec3 maneWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        transformed += maneUp * max(0.0, maneFloor - maneWorld.y)*smoothstep(.015,.12,maneWeight);
      `);
      shader.fragmentShader='uniform float combatLight; uniform float passingCut; uniform float spellLight; varying float strandDensity; varying float strandAlong; varying float strandFamily;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float lockShade=mix(.62,1.07,smoothstep(.10,.88,strandFamily));
        float rootShade=mix(.66,.99,smoothstep(.04,.44,strandAlong));
        float curlShade=.96+.04*sin(strandAlong*22.5+strandFamily*14.);
        diffuseColor.rgb*=lockShade*rootShade*curlShade;diffuseColor.a*=strandDensity;
        ${material===cardMaterial?'diffuseColor.a*=1.-.42*smoothstep(.62,1.,strandAlong);':''}
      `);
      // Recover the strand tangent from the deformed sheet, so the highlight
      // turns with the shoulder, wind and spell rather than lighting every tip.
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', `
        #ifdef STANDARD
        float shoulderScatter=0.;
        float crestGlint=0.;
        vec3 eyeDir = normalize(vViewPosition);
        float rimView = 1.0 - abs(dot(normal, eyeDir));
        outgoingLight *= mix(vec3(1.0), mix(vec3(.78,.74,.68),vec3(.98,.97,.94),rimView*rimView),.40+.60*passingCut);
        #if NUM_DIR_LIGHTS > 0
          vec3 dx = dFdx(vViewPosition), dy = dFdy(vViewPosition);
          vec3 acrossHair = dy*dFdx(strandAlong) - dx*dFdy(strandAlong);
          vec3 tangent = cross(normal, acrossHair);
          float tangentLength = dot(tangent,tangent);
          if(tangentLength > 1e-16) {
            tangent *= inversesqrt(tangentLength);
            vec3 halfDir = normalize(directionalLights[0].direction + eyeDir);
            float lean = dot(tangent, halfDir);
            float sheen = pow(max(0., 1. - lean * lean), 18.);
            float transmission = max(0.,dot(-normal,directionalLights[0].direction));
            vec3 keyColor=directionalLights[0].color;
            float forwardScatter=smoothstep(-.35,.86,dot(-eyeDir,directionalLights[0].direction));
            float flyaway=smoothstep(.38,1.,strandAlong);
            float thin=clamp(.18+.47*rimView+.29*flyaway+.14*strandFamily,0.,1.);
            shoulderScatter=(.34+.66*forwardScatter)*(.35+.65*rimView)*(.45+.55*strandFamily);
            float lobe=pow(max(0.,1.-((lean+.145)*(lean+.145))),32.);
            float crest=clamp(.55*strandFamily+.45*dot(normal,directionalLights[0].direction),0.,1.);
            crestGlint=pow(max(0.,1.-(lean+.12)*(lean+.12)),44.)*smoothstep(.28,.79,crest);
            vec3 silk=mix(vec3(.64,.477,.29),vec3(1.,.95,.82),thin*thin);
            outgoingLight+=keyColor*silk*(.10+.46*forwardScatter)*thin*(.09+.55*lobe);
            outgoingLight+=keyColor*vec3(.13,.112,.086)*forwardScatter*(.26+.74*flyaway)*thin;
            float edgeScatter=forwardScatter*mix(.16,1.,rimView*rimView)*(.38+.62*strandFamily);
            outgoingLight += keyColor*diffuseColor.rgb*edgeScatter*vec3(.38,.39,.40);
            // Low-density fibers at grazing angles scatter the light behind the lock.
            // The broad inner lock keeps its own shaded honey tone.
            float backFiber=forwardScatter*(.16+.84*rimView)*(.21+.79*flyaway);
            float brokenHighlight=.18+.82*smoothstep(.24,.76,strandFamily+.17*sin(strandAlong*18.));
            outgoingLight+=keyColor*vec3(.65,.59,.46)*backFiber*brokenHighlight*(.28+.72*lobe);
            outgoingLight += (.25 + .27*strandFamily)*sheen*reflectedLight.directDiffuse;
            outgoingLight += diffuseColor.rgb*keyColor*transmission*(.08+.21*strandAlong)*vec3(.98,1.,1.04);
          }
        #endif
        // Overlapping locks shelter the inner mass from the bright arena sky.
        // Inset cards lose more light than the edge fibers and spell-lit tips.
        float edgeFiber=smoothstep(.22,.92,rimView)*(.40+.60*strandFamily);
        float looseTip=smoothstep(.48,.94,strandAlong)*(.24+.76*strandFamily);
        float exposedLock=max(edgeFiber,looseTip);
        float coverage=${material===liningMaterial?'1.0':material===cardMaterial?'.84':'.38'};
        float occlusion=combatLight*coverage*(1.-exposedLock)*(.96-.22*clamp(spellLight,0.,1.));
          outgoingLight*=mix(vec3(1.),vec3(.52,.53,.52),occlusion);
        // Let the rider's hair recede into the dusty light behind the forward shoulder.
        float fiberY=dot(outgoingLight,vec3(.2126,.7152,.0722));
        float warmGlint=exposedLock*smoothstep(.55,1.65,fiberY);
        outgoingLight=mix(outgoingLight,mix(vec3(fiberY)*vec3(1.18,1.015,.67),outgoingLight*vec3(1.04,1.,.86),.65)*
          mix(.87,.98,warmGlint),combatLight);
        // Multiple scattering between adjacent locks fills the shaded body of the mantle.
          outgoingLight+=combatLight*coverage*(.65+.35*strandFamily)*vec3(.051,.038,.020);
        outgoingLight*=mix(vec3(1.),vec3(.91,.90,.84),combatLight*coverage);
        outgoingLight+=vec3(.055,.043,.026)*(1.-strandAlong)*(.55+.45*coverage);
        // Thin outer fibers scatter skylight over the pauldrons even when the helmet shades the inner locks.
        float overShoulder=1.-smoothstep(.18,.61,strandAlong);
        outgoingLight+=combatLight*overShoulder*shoulderScatter*(1.-.85*coverage)*vec3(.67,.53,.28);
        // The recessed flax locks are visibly darker than the white sleeve.
        // Reserve the brightest values for backlit flyaways and spell passes.
        float fiberLight=dot(outgoingLight,vec3(.2126,.7152,.0722));
        float interior=coverage*(1.-.73*exposedLock);
        float lockAbsorption=mix(.52,.66,combatLight)*(1.-clamp(spellLight,0.,1.)*.36);
        float tone=fiberLight/(1.+fiberLight*lockAbsorption*(.46+.68*interior));
        // At 76–89 s the deep, honey-brown groups and pale glints coexist even
        // on the same shoulder. A uniform tint erased both the incident light
        // and the dyed-in grain of the individual locks.
        vec3 pigment=mix(vec3(1.25,.96,.59),vec3(1.13,1.005,.77),exposedLock);
        vec3 lockColor=mix(outgoingLight/max(.001,fiberLight),pigment,.43);
        outgoingLight=tone*lockColor*mix(.98,.62,interior);
        float exposedRidge=crestGlint*(.28+.72*exposedLock);
        outgoingLight+=vec3(.44,.41,.34)*exposedRidge*(.12+.55*combatLight+1.18*clamp(spellLight,0.,1.));
        float movingSilk=pow(.5+.5*cos(18.*strandAlong+5.*strandFamily+3.*rimView),4.);
        outgoingLight+=vec3(.58,.47,.30)*clamp(spellLight,0.,1.)*(.28+.72*exposedLock)*(.22+.78*movingSilk);
        float scatterFill=(.019+.11*exposedLock+.06*shoulderScatter)*(.60+.40*strandFamily);
        outgoingLight+=vec3(1.05,.87,.52)*scatterFill*(.65+.35*combatLight);
        vec3 sightLine=inverseTransformDirection(-normalize(vViewPosition),viewMatrix);
        float backlitBank=smoothstep(.36,.86,dot(sightLine,normalize(vec3(.34,.36,-.94))));
        float lockDepth=backlitBank*combatLight*(.53+.47*interior)*(1.-.85*clamp(spellLight,0.,1.));
        outgoingLight*=mix(vec3(1.05,1.04,.97),vec3(.77,.74,.68),lockDepth);
        #if NUM_DIR_LIGHTS > 0
          // Light passing through the outer veil can exceed the bloom threshold.
          // Keep that response out of the pigment compression of the solid locks.
          float veilRim=smoothstep(.35,.94,rimView)*(.32+.68*exposedLock);
          float veilTransmission=veilRim*shoulderScatter*(1.-.72*coverage);
          outgoingLight+=directionalLights[0].color*vec3(1.,.84,.56)
            *veilTransmission*combatLight*(.72+.50*clamp(spellLight,0.,1.));
        #endif
        #endif
        #include <opaque_fragment>`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n float scatter=smoothstep(.025,.32,vColor.r);totalEmissiveRadiance *= .18 + .82 * vColor.rgb; totalEmissiveRadiance += vec3(.026,.024,.020)*scatter*(.50+.50*strandFamily) + min(spellLight,1.)*vec3(.16,.14,.095)*vColor.rgb*vColor.rgb;');
    };
    material.customProgramCacheKey = () => 'companion-mane-guide-dynamics';
    const geometry = mergeGeometries(parts);
    const cuts=[[],[],[]];
    let offset=0;
    for(const part of parts){
      const {rows,sides,short}=part.userData.strandGrid;
      // Every distance tier keeps every lock, including its root, tip, card
      // width, material and guide. Only interior rings collapse with distance.
      const lengths=parts===lining?(short?[14,8,5]:[26,13,7]):(short?[21,10,6]:[35,17,9]);
      const widths=parts===lining?[7,5,3]:[10,6,4];
      for(let t=0;t<cuts.length;t++){
        const along=Math.min(rows,lengths[t]),around=Math.min(sides,widths[t]),out=cuts[t];
        for(let row=0;row<along;row++){
          const first=offset+Math.round(row*rows/along)*(sides+1);
          const next=offset+Math.round((row+1)*rows/along)*(sides+1);
          for(let col=0;col<around;col++){
            const lo=Math.round(col*sides/around),hi=Math.round((col+1)*sides/around);
            out.push(first+lo,first+hi,next+lo,first+hi,next+hi,next+lo);
          }
        }
      }
      offset+=part.attributes.position.count;
    }
    const live=cuts.map(indices=>new T.Uint32BufferAttribute(indices,1));
    levels.push({geometry,full:geometry.index,live});
    if(!fullDetail)geometry.setIndex(live[0]);
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 4;
    const mesh = new T.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = parts===lining?'companion-hair-undercoat':parts===cards?'companion-hair-strands':'companion-hair-fibers';
    group.add(mesh);
    for (const part of parts) part.dispose();
  }
  let tier=0;
  function selectGeometry(){
    for(const level of levels){
      const index=fullDetail?level.full:level.live[tier];
      if(level.geometry.index!==index)level.geometry.setIndex(index);
    }
  }
  group.userData.setFullDetail=enabled=>{fullDetail=enabled;selectGeometry();};
  group.userData.setProjectedHeight=pixels=>{
    if(fullDetail)return;
    const close=tier===0?360:400, middle=tier===2?150:130;
    const next=pixels>=close?0:pixels>=middle?1:2;
    if(next!==tier){tier=next;selectGeometry();}
  };
  const light = new T.PointLight(0xffdc88, .8, 10);
  light.position.set(0, 3, 0); group.add(light);

  let previousYaw;
  const midVelocity=new T.Vector2(),lateVelocity=new T.Vector2(),springStep=new T.Vector2();
  const spring=(value,velocity,target,stiffness,damping,dt)=>{
    springStep.copy(target).sub(value).multiplyScalar(stiffness).addScaledVector(velocity,-damping);
    velocity.addScaledVector(springStep,dt);value.addScaledVector(velocity,dt);
  };
  const previousAnchor=new T.Vector3(),anchor=new T.Vector3(),drag=new T.Vector3();
  let anchored=false;
  const inverseWorld = new T.Matrix4(), inverseLinear = new T.Matrix3();
  group.userData.update = (dt, time, yaw, speed, height, floorHeight = 0, spellLight = 0, castLift = 0, veil = null, passingCut = false, burst = 0, weapons = [], boss = null) => {
    uniforms.maneTime.value = time;
    uniforms.spellLight.value=spellLight;
    uniforms.castLift.value=castLift;
    // The fan opens in a few frames and settles back more slowly.
    uniforms.maneBurst.value=dt>0?T.MathUtils.damp(uniforms.maneBurst.value,burst,burst>uniforms.maneBurst.value?13:4.2,dt):burst;
    uniforms.passingCut.value=T.MathUtils.damp(uniforms.passingCut.value,passingCut?1:0,9,dt);
    group.updateWorldMatrix(true, false);
    dynamics.update(group.matrixWorld,dt,time,group.visible,weapons,boss,fullDetail?120:60);
    inverseLinear.setFromMatrix4(inverseWorld.copy(group.matrixWorld).invert());
    uniforms.maneUp.value.set(0, 1, 0).applyMatrix3(inverseLinear);
    uniforms.veilFlow.value.set(0,0,0);
    if(veil)uniforms.veilFlow.value.copy(veil).applyMatrix3(inverseLinear);
    uniforms.maneFloor.value = Number.isFinite(floorHeight) ? floorHeight : 0;
    anchor.setFromMatrixPosition(group.matrixWorld);
    const m=group.matrixWorld.elements;
    const shoulderYaw=Math.hypot(m[8],m[10])>.12?Math.atan2(m[8],m[10]):yaw;
    if(!group.visible||!anchored||dt<=0||dt>.20||anchor.distanceToSquared(previousAnchor)>12.25){
      previousAnchor.copy(anchor);anchored=group.visible;previousYaw=shoulderYaw;uniforms.maneWind.value.set(0,0);
      uniforms.maneWindMid.value.set(0,0);uniforms.maneWindLate.value.set(0,0);midVelocity.set(0,0);lateVelocity.set(0,0);
      return;
    }
    if (dt <= 0) return;
    const turn = previousYaw === undefined ? 0 :
      Math.atan2(Math.sin(shoulderYaw - previousYaw), Math.cos(shoulderYaw - previousYaw)) / dt;
    previousYaw = shoulderYaw;
    drag.copy(previousAnchor).sub(anchor).multiplyScalar(1/Math.max(.008,dt));
    drag.applyMatrix3(inverseLinear).clampLength(0,13);previousAnchor.copy(anchor);
    const wind = new T.Vector2(T.MathUtils.clamp(-turn*.24+drag.x*.095,-1.3,1.3),
      T.MathUtils.clamp(drag.z*.080+Math.min(.16,height*.025),-.92,.92));
    uniforms.maneWind.value.lerp(wind, 1 - Math.exp(-dt * 5));
    // Middle and tips: damped springs chasing the root's sway, so they arrive late, overshoot a little and settle.
    const h=Math.min(dt,1/30);
    for(let left=dt;left>1e-5;left-=h){
      spring(uniforms.maneWindMid.value,midVelocity,uniforms.maneWind.value,84,10.5,Math.min(h,left));
      spring(uniforms.maneWindLate.value,lateVelocity,uniforms.maneWindMid.value,40,5.4,Math.min(h,left));
    }
    uniforms.maneWindMid.value.clampLength(0,1.25);uniforms.maneWindLate.value.clampLength(0,1.5);
  };
  group.userData.combatLight=uniforms.combatLight;
  group.userData.walkingHair=uniforms.onFoot;group.userData.portraitDrape=uniforms.portraitDrape;
  group.userData.setPortraitFrame=(matrix,bind=false)=>{
    if(bind)uniforms.portraitRestInverse.value.copy(matrix).invert();
    uniforms.portraitFrame.value.copy(matrix);uniforms.portraitInverse.value.copy(matrix).invert();
  };
  return group;
}
