import * as T from "game/lib/three.module.js";

// At 22.85 s the ground breaks into slabs with offset layers and pale
// fracture faces. Make these ridges part of the mesh so side light catches them.
export function createGravitySlab(opening=false) {
  const sides=10, levels=[0,.17,.39,.57,.78,.94,1],positions=[],uv=[],indices=[];
  for(let j=0;j<levels.length;j++)for(let k=0;k<sides;k++){
    const t=levels[j],a=Math.PI*2*k/sides;
    const broken=1+.19*Math.sin(k*3.1+j*1.73)+.11*Math.cos(k*2-j*.72);
    const taper=opening?1-.32*t-.64*t*t*t:1-.22*t-.53*t*t*t;
    const x=Math.cos(a)*broken*taper+.17*t+.12*Math.sin(9*t);
    const z=Math.sin(a)*broken*taper+.21*Math.sin(t*5);
    const y=t+(j?(.07*Math.sin(k*2.4+j*.64)+.03*Math.cos(k*4+j))*t:0);
    positions.push(x,y,z);uv.push(x*.49+z*.23+.5,y*1.35);
    if(j+1<levels.length){
      const n=j*sides+k,m=j*sides+(k+1)%sides;
      indices.push(n,n+sides,m,m,n+sides,m+sides);
    }
  }
  const top=(levels.length-1)*sides;
  for(let k=1;k<sides-1;k++)indices.push(top,top+k+1,top+k);
  const shape=new T.BufferGeometry();
  shape.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  shape.setAttribute('uv',new T.Float32BufferAttribute(uv,2));shape.setIndex(indices);
  const geometry=shape.toNonIndexed();shape.dispose();geometry.computeVertexNormals();
  return geometry;
}

// The gravity landing shears tilted sheets of rock out of the floor.
// Each sheet rises, rolls outward and drops while the smaller chips carry on.
export function moveGravityShard(transform, root, index, elapsed) {
  const age = Math.max(0, elapsed - (index % 6) * 0.025);
  const lift = T.MathUtils.smoothstep(age, 0, 0.20);
  const fall = T.MathUtils.smoothstep(age, 0.57 + (root.hold||0) + (index % 4) * 0.10, 1.63 + (root.hold||0) + (index % 5) * 0.12);
  const tilt = (0.27 + (index % 5) * 0.12) * lift + fall * 0.64;
  const drift = (0.16 + fall * 0.56) * lift;
  transform.position.set(root.x + Math.sin(root.turn) * drift,
    -0.09 - fall * root.height * 0.94, root.z + Math.cos(root.turn) * drift);
  transform.rotation.set(Math.cos(root.turn) * tilt, root.turn, -Math.sin(root.turn) * tilt);
  transform.scale.set(root.width * (1.12 + (index % 3) * 0.12),
    root.height * lift, root.width * (0.30 + (index % 3) * 0.09));
}

// Arcing discharges travel along the crests and fork onto nearby debris.
// A shared pair of buffers covers every branch, including the brightest core.
export function createFractureLightning(roots) {
  const group = new T.Group();
  group.name = 'gravity-fracture-lightning';
  const segments = [];
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    const radialX = Math.sin(root.turn), radialZ = Math.cos(root.turn);
    const tangentX = radialZ, tangentZ = -radialX;
    const count = 8 + i % 4;
    for (let j = 0; j < count; j++) {
      const branch = (k, fork) => {
        const fraction = k / count;
        const side = Math.sin(k * 3.3 + i) * 0.108 + fork;
        const radial = fraction * (0.40 + (i % 5) * 0.11);
        return new T.Vector3(root.x + radialX * radial + tangentX * side,
          0.07 + root.height * fraction * (0.86 + (i % 3) * 0.09),
          root.z + radialZ * radial + tangentZ * side);
      };
      segments.push([branch(j, 0), branch(j + 1, 0), i]);
      if (j === 4) segments.push([branch(j, 0), branch(j + 1, 0.22), i]);
    }
    // The contact sends a second fork over the exposed floor, from the
    // base of each slab toward the centre of the original impact.
    if(i%3===0){
      let previous=new T.Vector3(root.x,.14,root.z);
      for(let k=1;k<=6;k++){
        const f=k/6,jitter=Math.sin(i*2.17+k*3.7)*.17;
        const next=new T.Vector3(root.x*(1-f*.79)+tangentX*jitter,
          .08+Math.sin(f*Math.PI)*.23,root.z*(1-f*.79)+tangentZ*jitter);
        segments.push([previous,next,i]);previous=next;
      }
    }
  }
  const vertices = [], branchIds = [];
  for (const [a, b, id] of segments) {
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    branchIds.push(id, id);
  }
  // Single-pixel hot cores stay sharp while nearby fragments reflect the flash.
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('branchId', new T.Float32BufferAttribute(branchIds, 1));
  const clock = {value: 0};
  const material = new T.LineBasicMaterial({
    color: new T.Color(2.5, 1.73, 3.5), transparent: true,
    depthWrite: false, blending: T.AdditiveBlending
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.fractureAge = clock;
    shader.vertexShader = 'attribute float branchId; varying float voltage; uniform float fractureAge;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float age = max(0., fractureAge - mod(branchId, 6.) * .025);
      float lift = smoothstep(0., .20, age);
      float settle = smoothstep(.57 + mod(branchId,4.) * .10, 1.63 + mod(branchId,5.) * .12, age);
      transformed.y *= lift * (1. - settle);
      voltage = (.27 + .73 * pow(.5 + .5 * sin(floor(age * 23.) * 2.8 + branchId * 3.7), 2.))
        * lift * (1. - smoothstep(.55, 1.45, age));
    `);
    shader.fragmentShader = 'varying float voltage;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= voltage;');
  };
  group.add(new T.LineSegments(geometry, material));
  // A camera-facing strip in world units gives each fork a violet fringe
  // and a white-hot centre even when a close slab fills half the camera.
  const starts=[],ends=[],corners=[],ids=[],triangles=[];
  for(const [a,b,id] of segments){
    const base=ids.length;
    for(const [end,side] of [[0,-1],[0,1],[1,-1],[1,1]]){
      starts.push(a.x,a.y,a.z);ends.push(b.x,b.y,b.z);corners.push(end,side);ids.push(id);
    }
    triangles.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  const glowGeometry=new T.BufferGeometry();
  for(const [name,data,size] of [['position',starts,3],['otherEnd',ends,3],['corner',corners,2],['branchId',ids,1]]){
    glowGeometry.setAttribute(name,new T.Float32BufferAttribute(data,size));
  }
  glowGeometry.setIndex(triangles);
  const glowMaterial=new T.ShaderMaterial({
    uniforms:{fractureAge:clock},transparent:true,side:T.DoubleSide,forceSinglePass:true,
    depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`attribute vec3 otherEnd;attribute vec2 corner;attribute float branchId;
      uniform float fractureAge;varying float edge;varying float voltage;
      void main(){
        float age=max(0.,fractureAge-mod(branchId,6.)*.025);
        float lift=smoothstep(0.,.20,age),settle=smoothstep(.57+mod(branchId,4.)*.10,1.63+mod(branchId,5.)*.12,age);
        vec3 a=position,b=otherEnd;a.y*=lift*(1.-settle);b.y*=lift*(1.-settle);
        vec3 av=(modelViewMatrix*vec4(a,1.)).xyz,bv=(modelViewMatrix*vec4(b,1.)).xyz;
        vec3 point=mix(av,bv,corner.x);
        vec3 crossRay=cross(bv-av,normalize(-point));float len=length(crossRay);
        point+=crossRay/max(.00001,len)*corner.y*.052;
        edge=corner.y;
        voltage=(.12+.88*pow(.5+.5*sin(floor(age*24.)*2.8+branchId*3.7),2.))*lift*(1.-smoothstep(.65,1.55,age));
        gl_Position=projectionMatrix*vec4(point,1.);
      }`,
    fragmentShader:`varying float edge;varying float voltage;
      void main(){float band=1.-abs(edge);gl_FragColor=vec4(mix(vec3(.71,.26,1.85),vec3(2.6,2.25,3.0),pow(band,6.)),band*band*voltage);}`
  });
  const glow=new T.Mesh(glowGeometry,glowMaterial);glow.frustumCulled=false;group.add(glow);
  group.userData.setAge = t => { clock.value = t; };
  return group;
}
