import * as T from "game/lib/three.module.js";
import {MeshoptSimplifier} from "game/lib/addons/libs/meshopt_simplifier.module.js";

let masonryReducerReady=false;
if(MeshoptSimplifier.supported)await MeshoptSimplifier.ready.then(()=>{masonryReducerReady=true;},()=>{});

// Retain the original material, attribute buffers and carvings at close range.
// Collapse only interior edges inside a draw cell. Lock its boundary so adjacent
// cells can independently switch detail without opening a seam.
function masonryIndices(original,bins,geometry){
  const extra=[],position=geometry.attributes.position;
  const attributes=['normal','uv','color'].map(key=>geometry.getAttribute(key)).filter(Boolean);
  const weights=attributes.flatMap(a=>Array(a.itemSize).fill(a===geometry.attributes.normal?0.08:0.04));
  for(const bin of bins){
    if(bin.count<900)continue;
    const from=bin.start,local=new Uint32Array(bin.count),ids=[],lookup=new Map();
    for(let j=0;j<bin.count;j++){
      const id=original[from+j];
      let at=lookup.get(id);
      if(at===undefined){at=ids.length;lookup.set(id,at);ids.push(id);}
      local[j]=at;
    }
    const xyz=new Float32Array(ids.length*3),values=new Float32Array(ids.length*weights.length);
    let k=0;
    for(let j=0;j<ids.length;j++){
      const id=ids[j];
      xyz[3*j]=position.getX(id);xyz[3*j+1]=position.getY(id);xyz[3*j+2]=position.getZ(id);
      for(const a of attributes)for(let n=0;n<a.itemSize;n++)values[k++]=a.getComponent(id,n);
    }
    const target=3*Math.floor(bin.count*.32/3);
    const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(local,xyz,3,values,weights.length,weights,null,target,.12,['LockBorder','Permissive','ErrorAbsolute']);
    if(!indices.length||indices.length>.85*bin.count)continue;
    bin.distant={start:original.length+extra.length,count:indices.length,error:Math.max(.004,error)};
    for(const i of indices)extra.push(ids[i]);
  }
  if(!extra.length)return original;
  const result=new original.constructor(original.length+extra.length);
  result.set(original);result.set(extra,original.length);return result;
}


// The ash is a sampled height field. Distant tiles can re-use a subset of the
// exact same positions and material. Keep the original boundary on every tile,
// and measure its height error before choosing a level in screen pixels.
function tileAshFloor(source,renderer,updates,fullDetail){
  const geometry=source.geometry, {widthSegments:w,heightSegments:h}=geometry.parameters||{};
  const mask=geometry.userData.terraceTriangles, position=geometry.attributes.position;
  if(!mask||mask.length!==2*w*h||position.count!==(w+1)*(h+1))return false;
  const all=[],tiles=[],vertex=(x,y)=>y*(w+1)+x,vector=new T.Vector3();
  const fineCell=(x,y)=>{
    const a=vertex(x,y),b=a+w+1,i=2*(y*w+x);
    if(mask[i])all.push(a,b,a+1);
    if(mask[i+1])all.push(b,b+1,a+1);
  };
  for(let top=0;top<h;top+=16)for(let left=0;left<w;left+=16){
    const right=Math.min(w,left+16),bottom=Math.min(h,top+16);
    const box=new T.Box3(),levels=[];
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)
      box.expandByPoint(vector.fromBufferAttribute(position,vertex(x,y)));
    for(const stride of [1,2,4]){
      const start=all.length;
      let error=0;
      const columns=Math.ceil((right-left)/stride),rows=Math.ceil((bottom-top)/stride);
      const solidBlocks=new Uint8Array(rows*columns);
      if(stride>1)for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const x=left+col*stride,y=top+row*stride;
        let solid=x+stride<=right&&y+stride<=bottom;
        for(let yy=y;solid&&yy<y+stride;yy++)for(let xx=x;xx<x+stride;xx++){
          const i=2*(yy*w+xx);
          if(!mask[i]||!mask[i+1]){solid=false;break;}
        }
        solidBlocks[row*columns+col]=Number(solid);
      }
      for(let y=top;y<bottom;y+=stride)for(let x=left;x<right;x+=stride){
        const endX=Math.min(x+stride,right),endY=Math.min(y+stride,bottom);
        const k=((y-top)/stride)*columns+(x-left)/stride;
        const solid=solidBlocks[k];
        if(!solid){
          for(let yy=y;yy<endY;yy++)for(let xx=x;xx<endX;xx++)fineCell(xx,yy);
          continue;
        }
        const a=vertex(x,y),b=vertex(x,endY),c=vertex(endX,endY),d=vertex(endX,y);
        const ah=position.getY(a),bh=position.getY(b),ch=position.getY(c),dh=position.getY(d);
        for(let yy=y;yy<=endY;yy++)for(let xx=x;xx<=endX;xx++){
          const u=(xx-x)/stride,v=(yy-y)/stride;
          const height=u+v<=1?ah+(dh-ah)*u+(bh-ah)*v:ch+(bh-ch)*(1-u)+(dh-ch)*(1-v);
          error=Math.max(error,Math.abs(height-position.getY(vertex(xx,yy))));
        }
        // Match both the neighbouring tile and any unsimplified block at
        // a cutout. Every shared edge then uses identical height samples.
        const west=x===left||!solidBlocks[k-1],east=endX===right||!solidBlocks[k+1];
        const north=y===top||!solidBlocks[k-columns],south=endY===bottom||!solidBlocks[k+columns];
        if(!west&&!east&&!north&&!south){all.push(a,b,d,b,c,d);continue;}
        const edge=[a],center=vertex(x+stride/2,y+stride/2);
        if(west)for(let yy=y+1;yy<endY;yy++)edge.push(vertex(x,yy));
        edge.push(b);if(south)for(let xx=x+1;xx<endX;xx++)edge.push(vertex(xx,endY));
        edge.push(c);if(east)for(let yy=endY-1;yy>y;yy--)edge.push(vertex(endX,yy));
        edge.push(d);if(north)for(let xx=endX-1;xx>x;xx--)edge.push(vertex(xx,y));
        for(let k=0;k<edge.length;k++)all.push(center,edge[k],edge[(k+1)%edge.length]);
      }
      levels.push({start,count:all.length-start,error});
      if(!levels[0].count)break;
    }
    if(levels[0].count)tiles.push({box,levels});
  }
  const geo=new T.BufferGeometry();
  for(const [name,attr] of Object.entries(geometry.attributes))geo.setAttribute(name,attr);
  geo.setIndex(new T.Uint32BufferAttribute(all,1));
  const draw=new T.Mesh(geo,source.material);
  draw.name=source.name+'-section';draw.layers.mask=source.layers.mask;draw.receiveShadow=source.receiveShadow;
  draw.matrixAutoUpdate=false;draw.frustumCulled=false;
  const ranges=geo.userData.staticIndexRanges={starts:new Int32Array(tiles.length),counts:new Int32Array(tiles.length),length:0};
  const eye=new T.Vector3(),inverse=new T.Matrix4(),clip=new T.Matrix4(),frustum=new T.Frustum();
  updates.push(camera=>{
    clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(source.matrixWorld);
    frustum.setFromProjectionMatrix(clip,camera.coordinateSystem,camera.reversedDepth);
    eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse.copy(source.matrixWorld).invert());
    const focal=.5*renderer.domElement.height*camera.projectionMatrix.elements[5],full=fullDetail();
    let n=0;
    for(const {box,levels} of tiles){
      if(!frustum.intersectsBox(box))continue;
      let level=levels[0];
      if(!full){
        const distance=box.distanceToPoint(eye);
        if(distance>6&&levels[1].error*focal<1.25*distance)level=levels[1];
        if(distance>20&&levels[2].error*focal<1.25*distance)level=levels[2];
      }
      ranges.starts[n]=level.start*4;ranges.counts[n++]=level.count;
    }
    ranges.length=n;draw.visible=n>0;
  });
  source.add(draw);source.layers.disableAll();return true;
}

// These arena surfaces are opaque, stationary triangle meshes. Retain the source
// for deterministic splat sampling and put its renderable index ranges beneath it.
export function partitionArenaSurfaces(scene, renderer, fullDetail=()=>true) {
  const sources = [], updates = [];
  const multiDraw = renderer.extensions.has('WEBGL_multi_draw');
  scene.traverse(object => {
    if (object.name === 'ash-remains-floor' || object.name === 'arena-masonry' || object.name === 'great-tree-wood' || object.name === 'pale-crown-masses') sources.push(object);
  });
  for (const source of sources) {
    const geometry = source.geometry, material = source.material;
    if (!source.isMesh || source.isInstancedMesh || source.isSkinnedMesh || source.castShadow || !source.layers.mask ||
        Array.isArray(material) || material.transparent || !material.depthWrite || geometry.groups.length ||
        geometry.drawRange.start !== 0 || Number.isFinite(geometry.drawRange.count) ||
        Object.keys(geometry.morphAttributes).length) continue;
    const positions = geometry.attributes.position, index = geometry.index;
    if(multiDraw&&source.name==='ash-remains-floor'&&tileAshFloor(source,renderer,updates,fullDetail))continue;
    const vertexCount = index ? index.count : positions.count;
    if (vertexCount < 9000 || vertexCount % 3) continue;
    source.updateWorldMatrix(true, false);
    const cellSize = source.name === 'ash-remains-floor' ? 8 : 24;
    const bins = new Map(), binOf = new Uint32Array(vertexCount / 3);
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), center = new T.Vector3();
    for (let offset = 0; offset < vertexCount; offset += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(offset) : offset);
      b.fromBufferAttribute(positions, index ? index.getX(offset + 1) : offset + 1);
      c.fromBufferAttribute(positions, index ? index.getX(offset + 2) : offset + 2);
      center.copy(a).add(b).add(c).multiplyScalar(1/3).applyMatrix4(source.matrixWorld);
      const x = Math.floor(center.x / cellSize), y = Math.floor(center.y / cellSize), z = Math.floor(center.z / cellSize);
      const key = x + ',' + y + ',' + z;
      let bin = bins.get(key);
      if (!bin) {
        bin = {id:bins.size, angle:Math.atan2(z+.5,x+.5), y, box:new T.Box3(), count:0};
        bins.set(key, bin);
      }
      bin.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      bin.count += 3;
      binOf[offset/3] = bin.id;
    }
    if (bins.size < 2) continue;
    const byId = Array.from(bins.values());
    const ordered = byId.slice().sort((left,right) => left.angle-right.angle || left.y-right.y);
    let offset = 0;
    for (const bin of ordered) {
      bin.start = offset;
      bin.cursor = offset;
      offset += bin.count;
    }
    const reordered = positions.count <= 65535 ? new Uint16Array(vertexCount) : new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 3) {
      const bin = byId[binOf[i/3]], dest = bin.cursor;
      reordered[dest] = index ? index.getX(i) : i;
      reordered[dest+1] = index ? index.getX(i+1) : i+1;
      reordered[dest+2] = index ? index.getX(i+2) : i+2;
      bin.cursor += 3;
    }
    const useMasonryLod=multiDraw&&masonryReducerReady&&!fullDetail()&&['arena-masonry','great-tree-wood','pale-crown-masses'].includes(source.name);
    const indices=useMasonryLod?masonryIndices(reordered,ordered,geometry):reordered;
    const sharedIndex = new T.BufferAttribute(indices, 1);
    if (multiDraw) {
      // All cells share a material, transform and vertex buffers. Cull each
      // against the current eye, then submit the surviving index spans together.
      const part = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) part.setAttribute(name, attribute);
      part.setIndex(sharedIndex);
      const draw = new T.Mesh(part, material);
      draw.name = source.name + '-section';
      draw.layers.mask = source.layers.mask;
      draw.renderOrder = source.renderOrder;
      draw.receiveShadow = source.receiveShadow;
      draw.matrixAutoUpdate = false;
      draw.frustumCulled = false;
      const ranges = draw.geometry.userData.staticIndexRanges = {
        starts:new Int32Array(ordered.length), counts:new Int32Array(ordered.length), length:0
      };
      const clip = new T.Matrix4(), frustum = new T.Frustum();
      const stride = reordered.BYTES_PER_ELEMENT;
      const eye=new T.Vector3(),inverse=new T.Matrix4();
      updates.push(camera => {
        clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(source.matrixWorld);
        frustum.setFromProjectionMatrix(clip,camera.coordinateSystem,camera.reversedDepth);
        const distant=useMasonryLod&&!fullDetail();
        if(distant)eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse.copy(source.matrixWorld).invert());
        const focal=.5*renderer.domElement.height*camera.projectionMatrix.elements[5];
        let size = 0, end = -1;
        for (const bin of ordered) {
          if (!frustum.intersectsBox(bin.box)) continue;
          let range=bin;
          if(distant&&bin.distant){
            const distance=bin.box.distanceToPoint(eye);
            if(distance>10&&bin.distant.error*focal<distance*1.2)range=bin.distant;
          }
          if (range.start === end) ranges.counts[size-1] += range.count;
          else {
            ranges.starts[size] = range.start * stride;
            ranges.counts[size++] = range.count;
          }
          end = range.start + range.count;
        }
        ranges.length = size;
        draw.visible = size > 0;
      });
      source.add(draw);
      source.layers.disableAll();
      continue;
    }
    // Each section submits at most one contiguous draw. Invisible cells between
    // two visible cells may also be submitted; outside cells can safely be skipped.
    const sectionCount = Math.min(8, Math.ceil(vertexCount / 150000), ordered.length);
    const groups = Array.from({length:sectionCount}, () => []);
    for (const bin of ordered) {
      const section = Math.min(sectionCount-1, Math.floor((bin.start+bin.count*.5)*sectionCount/vertexCount));
      groups[section].push(bin);
    }
    const draws = [];
    for (const section of groups) {
      if (!section.length) continue;
      const part = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) part.setAttribute(name, attribute);
      part.setIndex(sharedIndex);
      part.boundingBox = new T.Box3();
      for (const bin of section) part.boundingBox.union(bin.box);
      part.boundingSphere = part.boundingBox.getBoundingSphere(new T.Sphere());
      const last = section[section.length-1];
      part.setDrawRange(section[0].start, last.start+last.count-section[0].start);
      const draw = new T.Mesh(part, material);
      draw.name = source.name + '-section';
      draw.layers.mask = source.layers.mask;
      draw.renderOrder = source.renderOrder;
      draw.castShadow = source.castShadow;
      draw.receiveShadow = source.receiveShadow;
      draw.matrixAutoUpdate = false;
      draws.push({draw, part, section});
      source.add(draw);
    }
    const clip = new T.Matrix4(), frustum = new T.Frustum();
    updates.push(camera => {
      clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(source.matrixWorld);
      frustum.setFromProjectionMatrix(clip,camera.coordinateSystem,camera.reversedDepth);
      for (const {draw, part, section} of draws) {
        let first=0, end=section.length;
        if (!frustum.intersectsBox(part.boundingBox)) end=0;
        while (first<end && !frustum.intersectsBox(section[first].box)) first++;
        while (end>first && !frustum.intersectsBox(section[end-1].box)) end--;
        draw.visible = first < end;
        if (draw.visible) {
          const head=section[first], tail=section[end-1];
          part.setDrawRange(head.start,tail.start+tail.count-head.start);
        }
      }
    });
    source.layers.disableAll();
  }
  if (!updates.length) return;
  // Three calls this hook after updating world matrices and before it builds the
  // render list. Wholly invisible sections never reach material setup or draw.
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function(renderer, world, camera, target) {
    previous.call(this,renderer,world,camera,target);
    for (const update of updates) update(camera);
  };
}
