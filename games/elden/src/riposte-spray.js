import * as T from "game/lib/three.module.js";

// At withdrawal the main recording shows a low fan leaving the contact
// sideways, breaking into droplets as it falls. Model it in the sword frame.
export function createRiposteSpray(contact, yaw, release, groundAt) {
  const count = release ? 72 : 21;
  const length = release ? 0.81 : 0.34;
  const life = release ? 2.45 : length;
  const position = new Float32Array(count * 12 * 3);
  const colors = new Float32Array(position.length);
  const geometry = new T.BufferGeometry();
  const vertices = new T.BufferAttribute(position, 3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position', vertices);
  const color = new T.Color();
  const drops = [];
  const palette = [0x812127, 0x9f292e, 0x571317, 0xa43135, 0x691b1c];
  const noise = n => { const v=Math.sin((n+13)*127.1)*43758.5453; return v-Math.floor(v); };
  for (let i = 0; i < count; i++) {
    const spread = noise(i + 9) - 0.5;
    const speed = (release ? 5.6 : 1.4) + (release ? 7.8 : 3.6) * noise(i);
    drops.push({
      x: -speed * (0.62 + 0.28 * noise(i + 4)),
      y: (release ? 0.60 : 0.72) + spread * (release ? 3.8 : 2.4),
      z: (release ? 1.9 : 0.7) + (noise(i+53)-.5) * (release ? 5.5 : 3.7),
      delay: noise(i + 13) * (release ? .040 : .068),
      tail: 0.018 + noise(i + 21) * (release ? .10 : .074),
      width: 0.011 + noise(i + 16) * (release ? .022 : .027)
    });
    color.setHex(palette[i % palette.length]);
    if(release)color.multiplyScalar(.62+.25*noise(i+81));
    for (let v = i * 12; v < (i + 1) * 12; v++) {
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  const spray = new T.Mesh(geometry, new T.MeshBasicMaterial({
    vertexColors: true, side: T.DoubleSide, transparent: true, depthWrite: false
  }));
  spray.name = release ? 'riposte-withdrawal' : 'riposte-entry';
  spray.frustumCulled = false;
  spray.rotation.y = yaw;
  spray.position.copy(contact);
  // Give each withdrawal streak a ground contact on the real ash surface.
  // The splashes outlast the flying droplets and remain where they hit.
  let stainMaterial;
  if(release && groundAt){
    const points=[],landingTimes=[],colors=[],indices=[];
    const sine=Math.sin(yaw),cosine=Math.cos(yaw);
    const ground=(x,z)=>groundAt(contact.x+cosine*x+sine*z,contact.z-sine*x+cosine*z)-contact.y;
    for(let i=0;i<drops.length;i++){
      const d=drops[i];let y=ground(0,0),at=0,x=0,z=0;
      for(let k=0;k<3;k++){
        at=(d.y+Math.sqrt(Math.max(0,d.y*d.y-20*y)))/10;
        x=d.x*at;z=d.z*at;y=ground(x,z);
      }
      d.groundTime=at;
      const angle=Math.atan2(d.z,d.x),side=4+i%4,base=points.length/3;
      const long=.055+d.width*2.8,wide=.030+d.width*1.3;
      color.setHex(palette[i%palette.length]);
      for(let n=-1;n<side;n++){
        const a=n<0?0:2*Math.PI*n/side,r=n<0?0:.62+.52*noise(11*i+n);
        const u=long*r*Math.cos(a),v=wide*r*Math.sin(a);
        const px=x+u*Math.cos(angle)-v*Math.sin(angle),pz=z+u*Math.sin(angle)+v*Math.cos(angle);
        points.push(px,ground(px,pz)+.026,pz);colors.push(color.r,color.g,color.b);landingTimes.push(d.delay+at);
        if(n>=0)indices.push(base,base+1+n,base+1+(n+1)%side);
      }
    }
    const marks=new T.BufferGeometry();
    marks.setAttribute('position',new T.Float32BufferAttribute(points,3));
    marks.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    marks.setAttribute('landAt',new T.Float32BufferAttribute(landingTimes,1));marks.setIndex(indices);
    stainMaterial=new T.ShaderMaterial({
      uniforms:{age:{value:0}},vertexColors:true,side:T.DoubleSide,transparent:true,depthWrite:false,
      vertexShader:`attribute float landAt;varying float landed;varying vec3 ink;uniform float age;
        void main(){ink=color;landed=smoothstep(landAt,landAt+.045,age);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying float landed;varying vec3 ink;uniform float age;
        void main(){gl_FragColor=vec4(ink,.76*landed*(1.-smoothstep(1.65,2.45,age)));}`
    });
    const stains=new T.Mesh(marks,stainMaterial);stains.name='riposte-ground-spatter';spray.add(stains);
  }
  spray.userData.updateSpray = elapsed => {
    if(stainMaterial)stainMaterial.uniforms.age.value=elapsed;
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      const t = Math.min(d.groundTime??length,Math.max(0, elapsed - d.delay));
      const tail = Math.max(0, t - d.tail);
      const headY = d.y * t - 5.0 * t * t;
      const tailY = d.y * tail - 5.0 * tail * tail;
      const w = (elapsed-d.delay>(d.groundTime??length)?0:d.width) * T.MathUtils.smoothstep(t, 0, 0.04)
        * (1 - T.MathUtils.smoothstep(t, 0.30, length));
      // Two intersecting ribbons expose the streak in profile and from above.
      for (let plane = 0; plane < 2; plane++) {
        const wy = plane === 0 ? w : 0;
        const wz = plane === 1 ? w : 0;
        const base = i * 12 + plane * 6;
        vertices.setXYZ(base,     d.x * tail, tailY - wy, d.z * tail - wz);
        vertices.setXYZ(base + 1, d.x * tail, tailY + wy, d.z * tail + wz);
        vertices.setXYZ(base + 2, d.x * t,    headY,      d.z * t);
        vertices.setXYZ(base + 3, d.x * tail, tailY - wy, d.z * tail - wz);
        vertices.setXYZ(base + 4, d.x * t,    headY,      d.z * t);
        vertices.setXYZ(base + 5, d.x * t,    headY - wy * 0.3, d.z * t - wz * 0.3);
      }
    }
    vertices.needsUpdate = true;
  };
  spray.userData.updateSpray(0);
  return {o: spray, life, max: life, kind: 'riposte-spray'};
}
