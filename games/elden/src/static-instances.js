import * as T from "game/lib/three.module.js";

// Draw static opaque props in local groups so an off-screen part of the
// arena can be culled. All instances keep their original world transforms.
export function addStaticInstances(parent, geometry, material, matrices, name, castShadow, cellSize, colors = null, levels = []) {
  const cells = new Map();
  for (let i = 0; i < matrices.length; i++) {
    const e = matrices[i].elements;
    const key = [12, 13, 14].map(i => Math.round(e[i] / cellSize)).join(',');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  const color = new T.Color();
  for (const group of cells.values()) {
    const mesh = new T.InstancedMesh(geometry, material, group.length);
    group.forEach((source, index) => {
      mesh.setMatrixAt(index, matrices[source]);
      if (colors) mesh.setColorAt(index, color.fromBufferAttribute(colors, source));
    });
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    addTileLevels(parent, mesh, levels);
  }
}

// Distances are measured to the nearest point of the tile's bounding sphere.
// Every level shares the original instance transforms and colors.
export function addTileLevels(parent, mesh, levels) {
  if (!levels.length) {
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
    return;
  }
  const tile = new T.LOD();
  tile.position.copy(mesh.boundingSphere.center);
  mesh.position.copy(tile.position).negate();
  tile.addLevel(mesh, 0);
  for (const {geometry, distance} of levels) {
    const reduced = new T.InstancedMesh(geometry, mesh.material, 0);
    reduced.count = mesh.count;
    reduced.instanceMatrix = mesh.instanceMatrix;
    reduced.instanceColor = mesh.instanceColor;
    reduced.name = mesh.name;
    reduced.castShadow = mesh.castShadow;
    reduced.receiveShadow = mesh.receiveShadow;
    reduced.boundingSphere = mesh.boundingSphere;
    reduced.position.copy(mesh.position);
    reduced.visible = false;
    tile.addLevel(reduced, mesh.boundingSphere.radius + distance, .04);
  }
  // Only level visibility changes during play. Parent motion still propagates
  // through matrixWorld; the tile and every level retain fixed local transforms.
  tile.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = false; });
  parent.add(tile);
}

// Static, opaque terrain uses identical source geometry in many separate tiles.
// Cull tiles and choose detail independently, then draw each visible prototype
// once. Source transforms and colours are copied only when membership changes.
export function batchLiveTiles(scene,fullDetail) {
  const nativeLevels=[],families=new Map(), frustum=new T.Frustum(), clip=new T.Matrix4();
  const shadowLights=[];scene.traverse(o=>{if(o.isLight&&o.castShadow)shadowLights.push(o);});
  const sun=shadowLights.length===1&&shadowLights[0].isDirectionalLight?shadowLights[0]:null;
  const eye=new T.Vector3(), identity=new T.Matrix4(), local=new T.Matrix4();
  // The sculpted torso/limb patches are single-level cell meshes as well.
  // Give them the same batched colour and shadow paths as the multi-level props.
  const single=[];
  scene.traverse(o=>{if(o.name==='ash-covered-articulated-remains'&&o.isInstancedMesh&&!o.parent.isLOD)single.push(o);});
  for(const mesh of single){
    const parent=mesh.parent,tile=new T.LOD();
    tile.matrixAutoUpdate=false;parent.remove(mesh);tile.addLevel(mesh,0);parent.add(tile);
  }
  scene.updateMatrixWorld(true);
  scene.traverse(tile=>{
    if(!tile.isLOD || !tile.levels.length)return;
    const meshes=tile.levels.map(level=>level.object), base=meshes[0];
    if(base.isInstancedMesh && base.castShadow && meshes.length>1){
      nativeLevels.push({radius:base.boundingSphere?.radius||0,levels:tile.levels.slice(1).map(level=>({level,original:level.distance}))});
      const far=meshes[Math.min(2,meshes.length-1)].geometry;
      for(const mesh of meshes){
        const geometry=mesh.geometry,normal=geometry.index;
        if(!normal||!far.index||geometry.attributes.position!==far.attributes.position||
           normal.count<=far.index.count||geometry.groups.length)continue;
        const before=mesh.onBeforeShadow,after=mesh.onAfterShadow;
        mesh.onBeforeShadow=function(...args){
          before.apply(this,args);
          if(!fullDetail())geometry.setIndex(far.index);
        };
        mesh.onAfterShadow=function(...args){geometry.setIndex(normal);after.apply(this,args);};
      }
    }
    if(!base.isInstancedMesh || base.material.transparent ||
       !base.boundingSphere || !base.count || !tile.parent)return;
    for(const mesh of meshes){
      if(!mesh.isInstancedMesh || mesh.material!==base.material || mesh.castShadow!==base.castShadow ||
         mesh.instanceMatrix!==base.instanceMatrix ||
         !local.multiplyMatrices(tile.matrix,mesh.matrix).equals(identity))return;
    }
    const key=[tile.parent.id,base.material.id,base.name,base.layers.mask,
      base.receiveShadow,base.castShadow,!!base.instanceColor,...meshes.map(m=>m.geometry.id)].join('/');
    let family=families.get(key);
    if(!family)families.set(key,family={parent:tile.parent,meshes,tiles:[],total:0});
    const sphere=base.boundingSphere.clone().applyMatrix4(base.matrixWorld);
    family.tiles.push({tile,base,sphere});
    family.total+=base.count;
  });
  const groups=[];
  for(const family of families.values()){
    if(family.tiles.length<2)continue;
    const {meshes,total,parent,tiles}=family;
    const cells=family.cells=[];
    for(const {tile,base,sphere} of tiles){
      if(tile.levels.length===1){
        cells.push({tile,base,tileSphere:sphere,bounds:sphere,selected:-2,inView:false,count:base.count,
          matrix:base.instanceMatrix.array.subarray(0,base.count*16),
          color:base.instanceColor?.array.subarray(0,base.count*3)});
        continue;
      }
      const g=base.geometry;
      if(!g.boundingSphere)g.computeBoundingSphere();
      for(let i=0;i<base.count;i++){
        base.getMatrixAt(i,local);
        local.premultiply(base.matrixWorld);
        const bounds=g.boundingSphere.clone().applyMatrix4(local);
        cells.push({tile,base,tileSphere:sphere,bounds,selected:-2,inView:false,count:1,
          matrix:base.instanceMatrix.array.subarray(i*16,i*16+16),
          color:base.instanceColor?.array.subarray(i*3,i*3+3)});
      }
    }
    family.draws=meshes.map(source=>{
      const mesh=new T.InstancedMesh(source.geometry,source.material,total);
      mesh.name=source.name;mesh.receiveShadow=source.receiveShadow;mesh.castShadow=source.castShadow;
      const beforeShadow=source.onBeforeShadow,afterShadow=source.onAfterShadow;
      mesh.userData.colorCount=0;mesh.userData.shadowCount=0;
      mesh.onBeforeShadow=function(...args){
        this.count=this.userData.shadowCount;
        beforeShadow.apply(this,args);
      };
      mesh.onAfterShadow=function(...args){
        afterShadow.apply(this,args);
        this.count=this.userData.colorCount;
      };
      mesh.layers.mask=source.layers.mask;mesh.renderOrder=source.renderOrder;
      mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.count=0;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      if(source.instanceColor)mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(total*3),3).setUsage(T.DynamicDrawUsage);
      parent.add(mesh);return mesh;
    });
    for(const {tile} of tiles)parent.remove(tile);
    groups.push(family);
  }
  let constrained=false;
  const previous=scene.onBeforeRender;
  scene.onBeforeRender=function(renderer,world,camera,target){
    previous.call(this,renderer,world,camera,target);
    clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(clip,camera.coordinateSystem,camera.reversedDepth);
    eye.setFromMatrixPosition(camera.matrixWorld);
    if(sun)sun.shadow.updateMatrices(sun);
    const lightFrustum=sun?.shadow.getFrustum(),fixed=fullDetail();
    for(const {cells,draws} of groups){
      let changed=false;
      for(const entry of cells){
        const {bounds,tileSphere,tile,base}=entry;
        const sphere=fixed?tileSphere:bounds;
        let selected=-1;
        // An off-screen rock may still cast into the camera. Keep every
        // instance covered by either the view or the directional shadow map.
        const inView=frustum.intersectsSphere(sphere);
        if(entry.inView!==inView){entry.inView=inView;changed=true;}
        if(inView||(base.castShadow&&(!lightFrustum||lightFrustum.intersectsSphere(sphere)))){
          selected=0;
          const d2=eye.distanceToSquared(sphere.center);
          for(let i=1;i<tile.levels.length;i++){
            const level=tile.levels[i];
            const original=level.distance-base.boundingSphere.radius;
            let limit=sphere.radius+original*(constrained && !base.castShadow ? .55 : 1);
            if(entry.selected>=i)limit*=1-level.hysteresis;
            limit*=camera.zoom;
            if(d2<limit*limit)break;
            selected=i;
          }
        }
        if(entry.selected!==selected){entry.selected=selected;changed=true;}
      }
      if(!changed){
        for(const mesh of draws)mesh.visible=mesh.userData.shadowCount>0;
        continue;
      }
      for(const mesh of draws)mesh.count=0;
      // The eye uses a prefix of the buffer. Off-screen casters follow it
      // and are submitted only while rendering the light's depth pass.
      for(const visiblePass of [true,false]){
        for(const {matrix,color,selected,inView,count} of cells){
          if(selected<0||inView!==visiblePass)continue;
          const mesh=draws[selected],at=mesh.count;mesh.count+=count;
          mesh.instanceMatrix.array.set(matrix,at*16);
          if(color)mesh.instanceColor.array.set(color,at*3);
        }
        if(visiblePass)for(const mesh of draws)mesh.userData.colorCount=mesh.count;
      }
      for(const mesh of draws){
        mesh.userData.shadowCount=mesh.count;
        mesh.visible=mesh.count>0;
        if(!mesh.visible)continue;
        for(const attr of [mesh.instanceMatrix,mesh.instanceColor]){
          if(!attr)continue;
          attr.clearUpdateRanges();attr.addUpdateRange(0,mesh.count*attr.itemSize);attr.needsUpdate=true;
        }
        mesh.count=mesh.userData.colorCount;
      }
    }
  };
  return value=>{
    constrained=value;
    for(const {radius,levels} of nativeLevels)for(const {level,original} of levels){
      level.distance=constrained?radius+.62*(original-radius):original;
    }
  };
}

// Loose slabs never move after the arena is built. Bake each original vertex
// and its instance colour once. One indexed submission can then draw just
// the groups seen by the eye or by the sun, including off-camera shadows.
export function batchLooseSlabs(group,renderer){
  if(!group||!renderer.extensions.has('WEBGL_multi_draw'))return;
  const sources=group.children.slice(),material=sources[0]?.material;
  if(!material||!sources.every(mesh=>mesh.isInstancedMesh&&mesh.material===material&&
    !mesh.geometry.index&&mesh.geometry.attributes.color&&mesh.geometry.attributes.normal))return;
  const bins=new Map(),matrix=new T.Matrix4(),normalMatrix=new T.Matrix3();
  const point=new T.Vector3(),normal=new T.Vector3(),color=new T.Color();
  let count=0;
  for(const mesh of sources){
    mesh.updateMatrix();
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrix);
      const m=matrix.elements,key=Math.floor(m[12]/9)+','+Math.floor(m[14]/9);
      if(!bins.has(key))bins.set(key,{list:[],bounds:new T.Box3()});
      bins.get(key).list.push({mesh,i});count+=mesh.geometry.attributes.position.count;
    }
  }
  const pos=new Float32Array(count*3),norm=new Float32Array(count*3),rgb=new Float32Array(count*3);
  const Index=count>65535?Uint32Array:Uint16Array,indices=new Index(count);
  const sections=[];let at=0;
  for(const {list,bounds} of bins.values()){
    const start=at;
    for(const {mesh,i} of list){
      const attrs=mesh.geometry.attributes;mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrix);
      normalMatrix.getNormalMatrix(matrix);color.setRGB(1,1,1);if(mesh.instanceColor)mesh.getColorAt(i,color);
      for(let v=0;v<attrs.position.count;v++,at++){
        point.fromBufferAttribute(attrs.position,v).applyMatrix4(matrix);point.toArray(pos,at*3);bounds.expandByPoint(point);
        normal.fromBufferAttribute(attrs.normal,v).applyNormalMatrix(normalMatrix).toArray(norm,at*3);
        rgb[at*3]=attrs.color.getX(v)*color.r;rgb[at*3+1]=attrs.color.getY(v)*color.g;rgb[at*3+2]=attrs.color.getZ(v)*color.b;
        indices[at]=at;
      }
    }
    sections.push({start,count:at-start,bounds});
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('normal',new T.BufferAttribute(norm,3));
  geo.setAttribute('color',new T.BufferAttribute(rgb,3));geo.setIndex(new T.BufferAttribute(indices,1));
  const draw=new T.Mesh(geo,material);draw.name='loose-slab-sections';
  draw.castShadow=true;draw.receiveShadow=true;draw.frustumCulled=false;draw.matrixAutoUpdate=false;
  const ranges=geo.userData.staticIndexRanges={starts:new Int32Array(sections.length),counts:new Int32Array(sections.length),length:0};
  const clip=new T.Matrix4(),frustum=new T.Frustum();
  function select(camera){
    clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(draw.matrixWorld);
    frustum.setFromProjectionMatrix(clip,camera.coordinateSystem,camera.reversedDepth);
    let size=0,end=-1;
    for(const part of sections){
      if(!frustum.intersectsBox(part.bounds))continue;
      if(part.start===end)ranges.counts[size-1]+=part.count;
      else{ranges.starts[size]=part.start*Index.BYTES_PER_ELEMENT;ranges.counts[size++]=part.count;}
      end=part.start+part.count;
    }
    ranges.length=size;
  }
  draw.onBeforeRender=(_renderer,_scene,camera)=>select(camera);
  draw.onBeforeShadow=(_renderer,_object,_camera,shadowCamera)=>select(shadowCamera);
  for(const mesh of sources)group.remove(mesh);
  group.add(draw);
}
