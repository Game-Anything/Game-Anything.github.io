import {MeshoptSimplifier} from "game/lib/addons/libs/meshopt_simplifier.module.js";
import * as T from "game/lib/three.module.js";

// Lower the brow toward the carrier's temple and turn it toward his face.
// Coordinates are in the shared chest bind frame used by the rider and locks.
export function seatRiderCrown(v) {
  const weight=T.MathUtils.smootherstep(v.y,3.90,4.78);
  // Give the upper face and scalp the same fitted proportions. Fade below
  // the collar so the shoulder contacts retain the carrier's bind pose.
  const portraitScale=1+.10*T.MathUtils.smootherstep(v.y,4.20,4.68);
  v.x=-.61+(v.x+.61)*portraitScale;
  v.y=4.35+(v.y-4.35)*portraitScale;
  v.z=.18+(v.z-.18)*portraitScale;
  const dy=v.y-4.47,dx=v.x+.54,dz=v.z-.30;
  const roll=.13*weight,pitch=-.16*weight,yaw=-.33*weight;
  const xr=dx*Math.cos(roll)-dy*Math.sin(roll);
  const yr=dx*Math.sin(roll)+dy*Math.cos(roll);
  const zr=yr*Math.sin(pitch)+dz*Math.cos(pitch);
  v.x=-.54+xr*Math.cos(yaw)+zr*Math.sin(yaw)-.22*weight;
  v.y=4.47+yr*Math.cos(pitch)-dz*Math.sin(pitch)-.15*weight;
  v.z=.30-xr*Math.sin(yaw)+zr*Math.cos(yaw)-.09*weight;
  return v;
}

// The scanned portrait is a rigid textured surface. Choose an index buffer
// from its measured geometric error in the camera or shadow map that draws it.
export async function preparePortraitDetail(rider,fullDetail){
  if(!MeshoptSimplifier.supported)return;
  await MeshoptSimplifier.ready;
  const cameraAt=new T.Vector3(),center=new T.Vector3(),renderSize=new T.Vector2();
  rider.traverse(mesh=>{
    const g=mesh.geometry,full=g?.index,p=g?.getAttribute('position');
    if(!mesh.isMesh||mesh.isSkinnedMesh||!full||full.count<75000||g.groups.length||
        Object.keys(g.morphAttributes).length||!p||p.itemSize!==3)return;
    const xyz=new Float32Array(p.count*3);
    const normal=g.getAttribute('normal'),uv=g.getAttribute('uv');
    if(!normal||!uv)return;
    const detail=new Float32Array(p.count*5);
    for(let i=0;i<p.count;i++){
      xyz.set([p.getX(i),p.getY(i),p.getZ(i)],3*i);
      detail.set([normal.getX(i),normal.getY(i),normal.getZ(i),uv.getX(i),uv.getY(i)],5*i);
    }
    const unit=MeshoptSimplifier.getScale(xyz,3);
    const levels=[[full,0]];
    for(const [portion,tolerance] of [[.22,.003],[.055,.012]]){
      const target=3*Math.floor(full.count*portion/3);
      const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(full.array,xyz,3,detail,5,[.15,.15,.15,.08,.08],
          null,target,tolerance,['Permissive','LockBorder']);
      if(indices.length<levels.at(-1)[0].count*.9)levels.push([new T.BufferAttribute(indices,1),unit*error]);
    }
    if(levels.length===1)return;
    if(!g.boundingSphere)g.computeBoundingSphere();
    function select(camera,pixels){
      let selected=full;
      if(!fullDetail()){
        const scale=mesh.matrixWorld.getMaxScaleOnAxis();
        center.copy(g.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
        cameraAt.setFromMatrixPosition(camera.matrixWorld);
        const distance=camera.isPerspectiveCamera?Math.max(.01,center.distanceTo(cameraAt)-g.boundingSphere.radius*scale):1;
        const focal=.5*pixels*camera.projectionMatrix.elements[5]*scale;
        for(let i=1;i<levels.length;i++)if(levels[i][1]*focal<.65*distance)selected=levels[i][0];
      }
      if(g.index!==selected)g.setIndex(selected);
    }
    const before=mesh.onBeforeRender,shadow=mesh.onBeforeShadow;
    mesh.onBeforeRender=function(renderer,scene,camera,...rest){
      before.call(this,renderer,scene,camera,...rest);select(camera,renderer.getDrawingBufferSize(renderSize).y);
    };
    mesh.onBeforeShadow=function(renderer,object,camera,shadowCamera,...rest){
      shadow.call(this,renderer,object,camera,shadowCamera,...rest);
      select(shadowCamera,renderer.getRenderTarget()?.height??1024);
    };
  });
}
