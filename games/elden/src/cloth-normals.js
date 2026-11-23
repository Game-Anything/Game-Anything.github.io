// Dynamic capes use indexed Float32 positions and normals. Accumulate the
// same area-weighted face normals, in index order, as BufferGeometry.
export function updateClothNormals(geometry){
  const index=geometry.index.array;
  const positions=geometry.attributes.position.array;
  const attribute=geometry.attributes.normal;
  if(!attribute){geometry.computeVertexNormals();return;}
  const normals=attribute.array;
  normals.fill(0);
  for(let i=0;i<index.length;i+=3){
    const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
    const cbx=positions[c]-positions[b],cby=positions[c+1]-positions[b+1],cbz=positions[c+2]-positions[b+2];
    const abx=positions[a]-positions[b],aby=positions[a+1]-positions[b+1],abz=positions[a+2]-positions[b+2];
    const nx=cby*abz-cbz*aby,ny=cbz*abx-cbx*abz,nz=cbx*aby-cby*abx;
    normals[a]+=nx;normals[a+1]+=ny;normals[a+2]+=nz;
    normals[b]+=nx;normals[b+1]+=ny;normals[b+2]+=nz;
    normals[c]+=nx;normals[c+1]+=ny;normals[c+2]+=nz;
  }
  for(let i=0;i<normals.length;i+=3){
    const x=normals[i],y=normals[i+1],z=normals[i+2];
    const inverse=1/(Math.sqrt(x*x+y*y+z*z)||1);
    normals[i]=x*inverse;normals[i+1]=y*inverse;normals[i+2]=z*inverse;
  }
  attribute.needsUpdate=true;
}

// The two travelling waves use fixed spatial phases. Evaluate their time
// component once per pose and keep all original positions, folds and UVs.
export function prepareCapeWaves(rest,height){
  const wave=new Float64Array(rest.length/3*5);
  for(let i=0,j=0;i<rest.length;i+=3,j+=5){
    const x=rest[i],y=rest[i+1],u=Math.max(0,Math.min(1,(height*.5-y)/height));
    wave[j]=u*u;wave[j+1]=Math.sin(x*3-y*2.2);wave[j+2]=Math.cos(x*3-y*2.2);
    wave[j+3]=Math.sin(y*2);wave[j+4]=Math.cos(y*2);
  }
  return (positions,time,speed,turn)=>{
    const sinA=Math.sin(time*3.3),cosA=Math.cos(time*3.3),sinB=Math.sin(time*2.2),cosB=Math.cos(time*2.2);
    const wind=.055+speed*.012,drift=speed*.055;
    for(let i=0,j=0;i<rest.length;i+=3,j+=5){
      const f=wave[j];
      positions[i]=rest[i]+((sinB*wave[j+4]+cosB*wave[j+3])*.045-turn*.09)*f;
      positions[i+1]=rest[i+1];
      positions[i+2]=rest[i+2]+((sinA*wave[j+2]+cosA*wave[j+1])*wind+drift)*f;
    }
  };
}
// The live cape's springs sample a regular grid. Interpolate their displacement
// over the original, finer rest surface so the pleats, texture and torn hem stay.
export function clothSpringGrid(geometry) {
  const {widthSegments:w,heightSegments:h}=geometry.parameters;
  const stride=w+1, count=stride*(h+1), anchors=[], fill=[];
  const corners=new Uint32Array(count*4),uv=new Float32Array(count*2);
  for(let y=0;y<=h;y++)for(let x=0;x<=w;x++){
    const i=y*stride+x;
    if((x%2===0||x===w)&&(y%2===0||y===h)){anchors.push(i);continue;}
    const x0=x-x%2, y0=y-y%2, x1=Math.min(w,x0+2),y1=Math.min(h,y0+2);
    corners.set([y0*stride+x0,y0*stride+x1,y1*stride+x0,y1*stride+x1],i*4);
    uv[i*2]=x1===x0?0:(x-x0)/(x1-x0);uv[i*2+1]=y1===y0?0:(y-y0)/(y1-y0);
    fill.push(i);
  }
  const offsets=new Float32Array(count*3);
  return {anchors,offsets,apply(position,matrix,inverse,floor){
    const world=matrix.elements,local=inverse.elements;
    for(const i of fill){
      const a=3*corners[4*i],b=3*corners[4*i+1],c=3*corners[4*i+2],d=3*corners[4*i+3];
      const u=uv[2*i],v=uv[2*i+1],index=3*i;
      for(let k=0;k<3;k++){
        const top=offsets[a+k]+u*(offsets[b+k]-offsets[a+k]);
        const bottom=offsets[c+k]+u*(offsets[d+k]-offsets[c+k]);
        position[index+k]+=top+v*(bottom-top);
      }
      const y=world[1]*position[index]+world[5]*position[index+1]+world[9]*position[index+2]+world[13];
      if(y<floor){
        const dy=floor-y;position[index]+=dy*local[4];position[index+1]+=dy*local[5];position[index+2]+=dy*local[6];
      }
    }
  }};
}
