import * as T from "game/lib/three.module.js";

const shade=new T.Color(0x969991);
const silver=new T.Color(0xeeeede);
const sunlit=new T.Color(0xfffbef);

export function getBackgroundSplats(treeOrScene,ultra=true){
  const crown=treeOrScene.getObjectByName('pale-crown-masses');
  const means=[],quaternions=[],sigmas=[],colors=[],opacities=[];
  if(crown){
    crown.updateWorldMatrix(true,false);
    const {position,tone}=crown.geometry.attributes;
    const root=new T.Vector3(),tip=new T.Vector3(),left=new T.Vector3(),right=new T.Vector3();
    const along=new T.Vector3(),across=new T.Vector3(),normal=new T.Vector3(),mean=new T.Vector3(),rib=new T.Vector3();
    const rotation=new T.Matrix4(),q=new T.Quaternion(),color=new T.Color();
    const sample=(v,i)=>v.fromBufferAttribute(position,i).applyMatrix4(crown.matrixWorld);
    // Single blades and compound sprays share the same leaf landmarks.
    // The three stem vertices of a compound spray carry no leaf splat.
    const leaves=crown.geometry.userData.leafVertices;
    for(let i=0;i+4<(leaves?.length??position.count);i+=5){
      const value=tone.getX(leaves?leaves[i+4]:i+2),blade=i/5;
      if(value<.29||blade%9===0)continue;
      sample(root,leaves?leaves[i]:i);sample(left,leaves?leaves[i+1]:i+1);
      sample(right,leaves?leaves[i+2]:i+3);sample(tip,leaves?leaves[i+3]:i+4);
      along.subVectors(tip,root);
      const length=along.length();
      if(length<1e-5)continue;
      along.divideScalar(length);
      across.subVectors(right,left);across.addScaledVector(along,-across.dot(along));
      const width=across.length();
      if(width<1e-5)continue;
      across.divideScalar(width);normal.crossVectors(along,across);
      q.setFromRotationMatrix(rotation.makeBasis(along,across,normal));
      // Pick an interior point of one of this blade's indexed triangles.
      // On a compound leaflet the distal face uses both edges and the tip;
      // on a single blade it uses the central rib, one edge and the tip.
      const compound=leaves&&leaves[i+4]===leaves[i+1];
      if(compound)mean.lerpVectors(left,right,.53);
      else{
        sample(rib,leaves?leaves[i+4]:i+2);
        mean.lerpVectors(rib,blade%2?left:right,.19);
      }
      mean.lerp(tip,.18+.13*value);
      means.push(mean.x,mean.y,mean.z);
      quaternions.push(q.x,q.y,q.z,q.w);
      // Fine backlit leaf margins blend in the pale upper sprays. Base the
      // envelope on the blade thickness so the settled layer tracks the mesh.
      const edge=T.MathUtils.smoothstep(value,.46,.90);
      sigmas.push(length*(.22+.07*value),width*(.16+.14*edge),width*(.07+.05*edge));
      color.copy(shade).lerp(silver,value).lerp(sunlit,Math.max(0,value-.75)*1.5);
      colors.push(color.r,color.g,color.b);
      opacities.push(.055+.22*value-.035*edge);
    }
  }
  const layers={leaves:opacities.length};
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
  const normal=new T.Vector3(),tangent=new T.Vector3(),cross=new T.Vector3(),point=new T.Vector3();
  const matrix=new T.Matrix4(),rotation=new T.Quaternion(),colour=new T.Color();
  const up=new T.Vector3(0,1,0),east=new T.Vector3(1,0,0);
  let seed=75219;
  const random=()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
  // Draw from the triangles actually left after the floor and masonry have been
  // trimmed and merged. Area weighting avoids pinning most splats to tiny bevels.
  function coverSurface(mesh,count,layer,shadow,lit,radius,opacity){
    mesh.updateWorldMatrix(true,false);
    const geom=mesh.geometry,positions=geom.attributes.position,index=geom.index;
    const triangles=(index?index.count:positions.count)/3;
    const cumulative=new Float64Array(triangles);
    const readTriangle=i=>{
      const j=i*3;
      a.fromBufferAttribute(positions,index?index.getX(j):j);
      b.fromBufferAttribute(positions,index?index.getX(j+1):j+1);
      c.fromBufferAttribute(positions,index?index.getX(j+2):j+2);
      ab.subVectors(b,a);ac.subVectors(c,a);normal.crossVectors(ab,ac);
    };
    let area=0;
    for(let i=0;i<triangles;i++){
      readTriangle(i);area+=normal.length();cumulative[i]=area;
    }
    if(!area)return;
    const low=new T.Color(shadow),high=new T.Color(lit);
    const normalMatrix=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const start=opacities.length;
    for(let j=0;j<count;j++){
      const target=random()*area;let lo=0,hi=triangles-1;
      while(lo<hi){const mid=(hi+lo)>>>1;if(cumulative[mid]<=target)lo=mid+1;else hi=mid;}
      readTriangle(lo);
      const s=Math.sqrt(random()),t=random();
      point.copy(a).addScaledVector(ab,s*(1-t)).addScaledVector(ac,s*t).applyMatrix4(mesh.matrixWorld);
      normal.applyNormalMatrix(normalMatrix);
      const stoneLayer=layer==='masonry'||layer==='stoneChips';
      const size=radius*(.40+.80*random());
      point.addScaledVector(normal,.012+.024*size);
      tangent.crossVectors(Math.abs(normal.y)>.9?east:up,normal).normalize();
      const vertical=layer==='wood'||layer==='gateSeams';
      const rainGrain=stoneLayer && Math.abs(normal.y)<.4 && j%6===0;
      tangent.applyAxisAngle(normal,(rainGrain?Math.PI*.5:0)+(random()-.5)*(vertical?.32:stoneLayer?.62:1.35));
      cross.crossVectors(normal,tangent);
      rotation.setFromRotationMatrix(matrix.makeBasis(tangent,cross,normal));
      const relief=.43+.20*Math.sin(point.x*.46+point.z*.33+Math.sin(point.y*.41))+.26*random();
      const ledge=T.MathUtils.smoothstep(normal.y,.18,.78);
      const grain=layer==='gateChips'?relief*.66+.28*ledge:layer==='gateTalus'?relief*.83+.16*ledge:relief;
      const bedding=.5+.5*Math.sin(point.y*.91+.43*Math.sin(point.x*.62+point.z*.37));
      const weathered=.19+.51*relief+.17*ledge+.10*bedding-(rainGrain?.055:0);
      colour.copy(low).lerp(high,stoneLayer?weathered:grain);
      means.push(point.x,point.y,point.z);quaternions.push(rotation.x,rotation.y,rotation.z,rotation.w);
      const width=.30+.28*random();
      sigmas.push(size*(vertical?.27:stoneLayer?1.22:1.),size*(vertical?1.:stoneLayer?width*.59:width),size*.053);
      colors.push(colour.r,colour.g,colour.b);opacities.push(opacity*(.65+.35*random()));
    }
    layers[layer]=(layers[layer]||0)+opacities.length-start;
  }
  const floor=treeOrScene.getObjectByName('ash-remains-floor');
  if(floor)coverSurface(floor,30000,'ash',0x544f46,0xc4c1b3,.32,.30);
  const stone=[];
  treeOrScene.traverse(o=>{if(o.name==='arena-masonry'&&o.isMesh)stone.push(o);});
  // Sample each finish independently so large blank walls cannot consume the
  // carvings' budget. At Ultra the second pass resolves narrow chips and fillets.
  const finishes={
    rail:[27000,0x5c5142,0xa28f74],recess:[7800,0x36352a,0x726952],
    shaft:[23500,0x534838,0x928169],pier:[34000,0x3c392a,0x897c5d],
    pierRecess:[10000,0x302f23,0x696147],palace:[32000,0x675844,0xa99576],
    palaceRecess:[10000,0x46432f,0x83765c],ashlar:[16000,0x6b5b46,0xa39175],
    roof:[8500,0x4b4438,0x8d7968],window:[2400,0x312c25,0x4e463a]
  };
  for(const wall of stone){
    const kind=wall.userData.stoneFinish||'rail',[budget,lo,hi]=finishes[kind];
    coverSurface(wall,ultra?budget:Math.ceil(19000/stone.length),'masonry',lo,hi,ultra?.34:.52,.20);
    if(ultra)coverSurface(wall,Math.floor(budget*.57),'stoneChips',lo,hi,.13,.21);
  }
  const trunk=treeOrScene.getObjectByName('great-tree-wood');
  if(trunk)coverSurface(trunk,ultra?19600:7200,'wood',0x332d27,0x746858,.36,.28);
  // The gate slopes and the tall fused piers have different grain.
  // Vertical seams on the piers cut across the wider layers of pale ash below.
  treeOrScene.traverse(mesh=>{
    if(mesh.name==='gate-pier'){
      coverSurface(mesh,ultra?20600:7800,'gateSeams',0x403b2e,0x665f4a,.52,.28);
      coverSurface(mesh,ultra?17900:4900,'gateChips',0x645e4b,0x9e957a,.17,.27);
    }else if(mesh.name==='gate-hill-skin'){
      coverSurface(mesh,ultra?14500:7000,'gateTalus',0x4d483e,0x9a9281,.55,.40);
    }
  });
  return {count:opacities.length,layers,means:new Float32Array(means),quaternions:new Float32Array(quaternions),
    sigmas:new Float32Array(sigmas),colors:new Float32Array(colors),opacities:new Float32Array(opacities)};
}
