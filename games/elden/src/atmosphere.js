import * as T from "game/lib/three.module.js";
import {ARENA} from "game/src/arena-layout.js";
// Aerial perspective for the whole arena.  The stock exponential fog treats
// every direction and height alike; the footage shows a luminous ash haze that
// is densest near the floor, thins above the parapets and glows toward the
// bright part of the sky.  The chunks below replace the stock fog for every
// built-in material.  They reuse scene.fog's colour and density uniforms, so
// existing per-material tweaks (which scale `fogFactor`) keep working.
// Phase one: the haze glows toward the low sun behind the great tree and, faintly,
// into the cleft of the gate.  Phase two: the sun is gone; the haze takes the
// green-gold light of the opening beside the gate (primary 135 s) and stays dark
// elsewhere (primary 104, 125 s).  The chunks have no phase uniform of their own:
// world.js eases the fog density from PHASE_ONE_DENSITY to PHASE_TWO_DENSITY and
// the shader reads the phase back from it.
export const SUN_DIRECTION=ARENA.sunDirection.clone().normalize();
export const OPENING_DIRECTION=new T.Vector3(.3091,.3000,-.9025).normalize();
export const PHASE_ONE_DENSITY=.0052,PHASE_TWO_DENSITY=.0046;
const glsl=v=>`vec3(${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)})`;
// Scale heights (m) of the broad haze and of the low dust layer.
const HAZE_HEIGHT=17.0,DUST_HEIGHT=1.9;
export function installAtmosphere(){
  // Combat keeps spare point-light slots to avoid compiling a new program on
  // impact. They carry exactly zero radiance. Skip their attenuation and BRDF
  // uniformly across the draw, including on the full-detail character models.
  const lightChunk = T.ShaderChunk.lights_fragment_begin;
  const pointStart = lightChunk.indexOf('getPointLightInfo( pointLight,');
  const pointEnd = lightChunk.indexOf('\n\t}', pointStart);
  if (pointStart >= 0 && pointEnd > pointStart) {
    T.ShaderChunk.lights_fragment_begin = lightChunk.slice(0, pointStart)
      + 'if (pointLight.color != vec3(0.0)) {\n\t\t' + lightChunk.slice(pointStart, pointEnd)
      + '\n\t\t}' + lightChunk.slice(pointEnd);
  }
  T.ShaderChunk.fog_pars_vertex=`#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif`;
  T.ShaderChunk.fog_vertex=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = transpose( mat3( viewMatrix ) ) * mvPosition.xyz + cameraPosition;
#endif`;
  T.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	float atmosphereLayer( float eyeHeight, float rise, float scaleHeight ) {
		float t = rise / scaleHeight;
		float slab = abs( t ) > 0.001 ? ( 1.0 - exp( - t ) ) / t : 1.0 - 0.5 * t;
		return exp( - max( eyeHeight, - 4.0 ) / scaleHeight ) * slab;
	}
#endif`;
  T.ShaderChunk.fog_fragment=`#ifdef USE_FOG
	vec3 atmosphereRay = vFogWorld - cameraPosition;
	float atmosphereRange = length( atmosphereRay );
	vec3 atmosphereView = atmosphereRay / max( atmosphereRange, 0.0001 );
	vec3 atmosphereGlow = vec3( 0.0 );
	#ifdef FOG_EXP2
		float atmosphereHaze = atmosphereLayer( cameraPosition.y, atmosphereRay.y, ${HAZE_HEIGHT.toFixed(1)} );
		float atmosphereDust = atmosphereLayer( cameraPosition.y, atmosphereRay.y, ${DUST_HEIGHT.toFixed(1)} ) * smoothstep( 16.0, 60.0, atmosphereRange );
		float atmosphereDepth = fogDensity * atmosphereRange * ( 0.43 * atmosphereHaze + 1.68 * atmosphereDust );
		float atmospherePhase = clamp( ( ${PHASE_ONE_DENSITY.toFixed(5)} - fogDensity ) / ${(PHASE_ONE_DENSITY-PHASE_TWO_DENSITY).toFixed(5)}, 0.0, 1.0 );
		float atmosphereSun = max( dot( atmosphereView, ${glsl(SUN_DIRECTION)} ), 0.0 );
		float atmosphereOpen = max( dot( atmosphereView, ${glsl(OPENING_DIRECTION)} ), 0.0 );
		float atmosphereGate = max( dot( atmosphereView, vec3( 0.0, 0.16759, - 0.98586 ) ), 0.0 );
		// Looking into the light the haze is brighter and denser.
		float atmosphereBack = mix( atmosphereSun, atmosphereOpen, atmospherePhase );
		atmosphereDepth *= 1.0 + 1.3 * pow( atmosphereBack, 5.0 );
		// Fine ash hangs low before the southern galleries. Accumulate the
		// veil through that volume so nearby dark chips retain their contrast.
		vec2 dustMid=mix(cameraPosition.xz,vFogWorld.xz,.68)-vec2(-3.,6.);
		float southShelf=exp(-dot(dustMid/vec2(30.,24.),dustMid/vec2(30.,24.)));
		float ashPath=smoothstep(15.,40.,atmosphereRange)*(1.-smoothstep(.7,4.2,vFogWorld.y));
		atmosphereDepth+=(1.-atmospherePhase)*southShelf*ashPath*.41;
		atmosphereDepth*=1.-.25*smoothstep(2.,11.,vFogWorld.y)*smoothstep(30.,74.,atmosphereRange);
		float fogFactor = 1.0 - exp( - atmosphereDepth );
		// Glare: light scattered in the air between the camera and anything seen against that light.
		float atmosphereVeil = mix( 0.24, 0.14, atmospherePhase ) * pow( atmosphereBack, 2.5 ) * smoothstep( 4.5, 17.0, atmosphereRange );
		fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - atmosphereVeil );
		float innerTerrace=1.-smoothstep(18.,42.,length(vFogWorld.xz-vec2(0.,-8.)));
		fogFactor*=1.-(1.-atmospherePhase)*innerTerrace*.48;
		atmosphereGlow = mix(
			vec3( 1.0, 0.90, 0.60 ) * ( 0.22 * pow( atmosphereSun, 3.0 ) + 0.50 * pow( atmosphereSun, 24.0 ) ) + vec3( 1.0, 0.88, 0.56 ) * 0.25 * pow( atmosphereGate, 8.0 ),
			vec3( 0.80, 1.0, 0.62 ) * ( 1.3 * pow( atmosphereOpen, 4.0 ) + 1.2 * pow( atmosphereOpen, 30.0 ) ) + vec3( 0.55, 0.62, 0.50 ) * 0.30 * pow( atmosphereSun, 6.0 ),
			atmospherePhase );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 atmosphereColor = fogColor * ( 1.0 + atmosphereGlow );
	atmosphereColor *= mix( 0.86, 1.0, smoothstep( - 0.25, 0.12, atmosphereView.y ) );
	#ifdef FOG_EXP2
		// Phase two: under the dark overcast the light of the opening does not carry beyond the terrace wall
		// (primary 104, 125.3, 145.6 s: colonnade, piers and towers stand dark).  The stair lane to the gate, where
		// the fight can go, keeps its light.
		float atmosphereLane = ( 1.0 - smoothstep( 9.0, 16.0, abs( vFogWorld.x ) ) ) * ( 1.0 - smoothstep( - 50.0, - 40.0, vFogWorld.z ) );
		gl_FragColor.xyz *= 1.0 - 0.68 * atmospherePhase * ( 1.0 - atmosphereLane ) * smoothstep( 47.0, 62.0, length( vFogWorld.xz - vec2( ${ARENA.cx.toFixed(1)}, ${ARENA.cz.toFixed(1)} ) ) );
		#ifdef TERRACE_MASONRY
			// Low ash obscures the rail plinth and the first storey. Its top
			// undulates along the wall and reaches higher on distant towers.
			float bankRadius = length( vFogWorld.xz - vec2( ${ARENA.cx.toFixed(1)}, ${ARENA.cz.toFixed(1)} ) );
			float bankCrest = mix( 4.6, 9.0, smoothstep( 50.0, 72.0, bankRadius ) )
				+ 0.8 * sin( dot( vFogWorld.xz, vec2( 0.080, 0.055 ) ) );
			float bank = smoothstep( 38.0, 50.0, bankRadius ) * smoothstep( 12.0, 48.0, atmosphereRange )
				* ( 1.0 - smoothstep( -1.0, bankCrest, vFogWorld.y ) );
			float palaceMist=smoothstep(12.,42.,vFogWorld.z)*atmospherePhase;
            float openArcade=smoothstep(1.7,2.6,vFogWorld.y)*(1.-smoothstep(4.2,7.,vFogWorld.y));
            float bankOpacity=bank*mix(.59,.53+.20*palaceMist,atmospherePhase)*(1.-.38*openArcade);
            atmosphereColor=mix(atmosphereColor,vec3(.48,.455,.34),palaceMist*.62);
            float terraceSide = smoothstep( -0.20, 0.68, dot( atmosphereView.xz, vec2( 0.54, 0.84 ) ) );
            float mistTop = smoothstep( 1.0, 8.0, vFogWorld.y );
            atmosphereColor *= mix( vec3( 1.0 ), vec3( 1.025, 0.995, 0.90 ),
                terraceSide * mistTop * ( 1.0 - atmospherePhase ) );
			fogFactor = mix( fogFactor, 1.0, bankOpacity );
            // The arched parapet stands above the ground-hugging ash layer.
            float railBand=1.-smoothstep(1.1,2.3,abs(bankRadius-51.3));
            float clearStone=(1.-atmospherePhase)*railBand*smoothstep(.55,2.3,vFogWorld.y);
            fogFactor *= 1.-.50*clearStone;
            gl_FragColor.xyz *= 1.-.31*clearStone;
			atmosphereColor += fogColor * bankOpacity * vec3( 0.66, 0.64, 0.60 );
		#endif
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, atmosphereColor, fogFactor );
#endif`;
}
// Display-referred finishing pass: the footage is soft, slightly lifted in the
// blacks and olive-gold in the mid tones, with a mild vignette.
const gradeUniforms={phase:{value:0},flash:{value:0},nearGlare:{value:0},aspect:{value:16/9}};
const gradeColor=`uniform float phase,flash,nearGlare,aspect;
    vec4 gradeDisplay(vec4 texel,vec2 uv){
      vec3 c=texel.rgb;
      float l=dot(c,vec3(.2126,.7152,.0722));
      // Gentle shoulder and toe: bright haze keeps its tint, shadows stay open.
      float toe=1.-smoothstep(.05,.38,l);
      vec3 lifted=c+toe*mix(vec3(.006,.006,.005),vec3(.004,.005,.005),phase);
      c=mix(lifted,vec3(1.)-(vec3(1.)-lifted)*(vec3(1.)-lifted*.10),.5);
      // Olive-gold balance in the mid tones; neutral highlights.
      float mid=smoothstep(.04,.42,l)*(1.-smoothstep(.62,.98,l));
      c*=mix(vec3(1.),mix(vec3(1.002,1.005,.998),vec3(1.008,1.005,.987),phase),mid);
      // Open reflected light in neutral shadow, preserve the hue of actual
      // gold and gravity discharges where the channels separate.
      float chroma=max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b);
      float bounce=mid*(1.-smoothstep(.09,.28,chroma));
      c+=vec3(-.004,.001,.008)*bounce;
      float s=dot(c,vec3(.2126,.7152,.0722));
      c=mix(vec3(s),c,mix(.93,.97,phase));
      vec2 q=(uv-.5)*vec2(aspect/1.7778,1.);
      float vignette=smoothstep(.36,.92,length(q));
      c*=1.-mix(.20,.30,phase)*vignette*(1.-flash);
      // Arena-wide burst of holy light: the air itself glows, palest at the centre of the picture.
      float scatter=.085+.57*smoothstep(.14,.70,l);
      // Dense backlit dust during the paired landing. Its silhouettes still
      // read through the light while the brighter floor, banks and shafts merge.
      scatter=mix(scatter,.15+.72*smoothstep(.13,.59,l),.85*smoothstep(.59,.94,flash));
      scatter=mix(scatter,.87+.11*smoothstep(.12,.65,l),nearGlare);
      c=mix(c,vec3(1.,.965,.86),flash*scatter*(1.-.30*vignette));
      return vec4(clamp(c,0.,1.),texel.a);
    }`;
export const GradeShader={
  name:'ArenaGradeShader',
  uniforms:{tDiffuse:{value:null},...gradeUniforms},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;
    ${gradeColor}
    void main(){gl_FragColor=gradeDisplay(texture2D(tDiffuse,vUv),vUv);}`
};

// Apply the display-space grade immediately after Three's tone mapping and
// color conversion. FXAA still samples the graded image in the following pass.
export function gradeOutput(pass,bloom=null){
  if(bloom){
    bloom.outputBloomTexture=true;
    pass.uniforms.sceneBloom={value:bloom.renderTargetsHorizontal[0].texture};
    pass.material.fragmentShader=pass.material.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D sceneBloom;')
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );',
               'gl_FragColor = texture2D( tDiffuse, vUv ) + texture2D( sceneBloom, vUv );');
  }
  Object.assign(pass.uniforms,T.UniformsUtils.clone(gradeUniforms));
  pass.material.fragmentShader=`#define main convertForDisplay
    ${pass.material.fragmentShader}
    #undef main
    ${gradeColor}
    void main(){convertForDisplay();gl_FragColor=gradeDisplay(gl_FragColor,vUv);}`;
  return pass;
}
