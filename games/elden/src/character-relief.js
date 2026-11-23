import * as T from "game/lib/three.module.js";

const {smoothstep,clamp}=T.MathUtils;

// The two swept horn crests rise above the wet mane at 12.40s. Preserve the
// scanned horn bases and eye sockets, then lift and spread only their free ends.
export function fitBeastMask(model){
 const point=new T.Vector3(),inverse=new T.Matrix4();
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry,p=geometry.attributes.position;
  const shades=new Float32Array(3*p.count);
  inverse.copy(mesh.matrixWorld).invert();
  for(let i=0;i<p.count;i++){
   point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
   const side=Math.abs(point.x),above=smoothstep(point.y,.20,.42);
   const crown=above*smoothstep(side,.045,.13)*(1-smoothstep(point.z,.05,.30));
   const tooth=smoothstep(-point.z,.24,.39)*(1-smoothstep(point.y,-.18,-.05));
   // The beast's nose juts forward under the brow even in silhouette.
   // Leave the sockets, neck opening and base of each horn on their scan.
   const muzzle=smoothstep(-point.z,.14,.39)*(1-smoothstep(side,.14,.26))*
     smoothstep(point.y,-.24,-.13)*(1-smoothstep(point.y,.08,.18));
   const ridge=.5+.5*Math.cos(point.y*164+side*68+point.z*37);
   point.x+=Math.sign(point.x)*(.035*crown+.008*tooth);
   point.y+=.055*crown-.018*tooth-.014*muzzle;
   point.z+=.027*crown-.021*tooth-.103*muzzle;
   const polish=crown*(.07+.27*ridge)+tooth*.11;
   shades.set([1+polish,1+polish*.90,1+polish*.72],i*3);
   point.applyMatrix4(inverse);p.setXYZ(i,point.x,point.y,point.z);
  }
  geometry.setAttribute('color',new T.BufferAttribute(shades,3));
  mesh.material.vertexColors=true;
  p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 });
}

// The original at 36.5–38.5s shows a dark steel breast inside a much brighter
// gorget and three overlapping shoulder lames. Raise those existing skinned
// surfaces in bind space so the rims follow both shoulder and upper-arm turns.
export function fitConsortLames(actor){
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const g=mesh.geometry,{position:p,skinIndex,skinWeight,color}=g.attributes;
  if(!color)return;
  // Keep the authored lighting normals across UV cuts and on all untouched
  // plates; only add the normal change introduced by the raised rims.
  const normals=g.attributes.normal,authored=normals.array.slice();
  g.computeVertexNormals();
  const starting=normals.array.slice(),direction=new T.Vector3();
  const roles=mesh.skeleton.bones.map(b=>/Shoulder$|(Left|Right)Arm$/.test(b.name)?1:/Spine[12]$/.test(b.name)?2:0);
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),side=Math.abs(z);
   let arm=0,ribs=0;
   for(let k=0;k<4;k++){
    const role=roles[skinIndex.getComponent(i,k)],w=skinWeight.getComponent(i,k);
    if(role===1)arm+=w;else if(role===2)ribs+=w;
   }
   const shoulder=arm*smoothstep(side,.15,.22)*(1-smoothstep(side,.40,.49))*smoothstep(y,1.35,1.41);
   const arc=y+.29*(side-.18)+1.30*(x+.016)**2;
   const band=level=>1-smoothstep(Math.abs(arc-level),.003,.014);
   const lip=Math.max(band(1.443),band(1.491),band(1.542));
   const seam=Math.max(band(1.426),band(1.474),band(1.525));
   const chest=ribs*smoothstep(x,.087,.18)*(1-smoothstep(side,.108,.178))*
    smoothstep(y,1.175,1.236)*(1-smoothstep(y,1.413,1.487));
   const ridge=1-smoothstep(Math.abs(side-.080)-.16*Math.abs(y-1.30),.005,.046);
   const relief=shoulder*(.019*lip-.006*seam);
   p.setXYZ(i,x+relief*clamp((x+.020)*5,-.65,.8)+.009*chest*ridge,
    y+relief*.77,z+Math.sign(z)*relief*.76);
   const rim=1+shoulder*(.16*lip-.22*seam);
   color.setXYZ(i,color.getX(i)*rim*(1-.36*chest),color.getY(i)*rim*(1-.22*chest),color.getZ(i)*rim*(1-.055*chest));
  }
  p.needsUpdate=true;color.needsUpdate=true;
  g.computeVertexNormals();
  for(let i=0;i<normals.count;i++){
   const j=3*i;
   direction.set(authored[j]+normals.getX(i)-starting[j],
    authored[j+1]+normals.getY(i)-starting[j+1],authored[j+2]+normals.getZ(i)-starting[j+2]).normalize();
   normals.setXYZ(i,direction.x,direction.y,direction.z);
  }
  normals.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
 });
}

