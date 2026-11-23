import {SparkRenderer} from "game/lib/spark-2.4.0/spark.module.js";
import {Box3, DataTexture, Frustum, Matrix4, RGBAIntegerFormat, UnsignedIntType, Vector3} from "game/lib/three.module.js";

// The arena's only splat generator changes colour between phases. Its packed
// centres and radii stay fixed, so camera-distance keys need no GPU readback.
function depthWorker() {
  let centers;
  self.onmessage = ({data}) => {
    if (data.packed) {
      const half = new Float32Array(65536);
      for (let i = 0; i < half.length; i++) {
        const sign = i & 32768 ? -1 : 1, exponent = (i >> 10) & 31, fraction = i & 1023;
        if (exponent === 31) half[i] = fraction ? NaN : sign * Infinity;
        else if (exponent) half[i] = sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
        else half[i] = sign * fraction * 2 ** -24;
      }
      const words = data.packed, count = words.length / 4;
      centers = new Float32Array(3 * count);
      for (let i = 0; i < count; i++) {
        const j = i * 4, dest = i * 3;
        centers[dest] = (words[j+3] & 0xffffff) ? half[words[j+1] & 65535] : Infinity;
        centers[dest+1] = half[words[j+1] >>> 16];
        centers[dest+2] = half[words[j+2] & 65535];
      }
      return;
    }
    const values = new Float32Array(data.buffer);
    const f = Math.fround, ex = f(data.eye[0]), ey = f(data.eye[1]), ez = f(data.eye[2]);
    for (let i = 0, j = 0; i < values.length; i++, j += 3) {
      const x = f(centers[j] - ex), y = f(centers[j+1] - ey), z = f(centers[j+2] - ez);
      values[i] = Math.sqrt(f(f(f(x*x) + f(y*y)) + f(z*z)));
    }
    self.postMessage(values.buffer, [values.buffer]);
  };
}

// Compact Spark's sorted indices off the drawing thread. Until a conservative
// result covers the current camera, Spark's complete order remains drawable.
function visibilityWorker() {
  let boxes, cells, shown, order, count;
  self.onmessage = ({data}) => {
    if (data.boxes) {
      boxes=data.boxes; cells=data.cells; shown=new Uint8Array(boxes.length/6);
      return;
    }
    if (data.order) { order=data.order; count=data.count; }
    const planes=data.planes;
    for(let i=0,j=0;i<shown.length;i++,j+=6){
      let visible=1;
      for(let k=0;k<24;k+=4){
        const x=planes[k],y=planes[k+1],z=planes[k+2];
        if(x*boxes[j+(x>=0?3:0)]+y*boxes[j+(y>=0?4:1)]+z*boxes[j+(z>=0?5:2)]+planes[k+3]<0){visible=0;break;}
      }
      shown[i]=visible;
    }
    const buffer=data.buffer, indices=new Uint32Array(buffer);
    let length=0;
    for(let i=0;i<count;i++)if(shown[cells[order[i]]])indices[length++]=order[i];
    self.postMessage({buffer,length},[buffer]);
  };
}

const identity = new Matrix4();
export class StaticArenaSplats extends SparkRenderer {
  constructor(options, arena, data) {
    super({...options,minSortIntervalMs:1000/30});
    this.arena = arena;
    this.eye = new Vector3();
    this.lastKeyEye = new Vector3(Infinity, Infinity, Infinity);
    this.sortTravel=.035;
    this.cellOf = new Uint32Array(data.count);
    this.cells = [];
    const lookup = new Map(), lo = new Vector3(), hi = new Vector3();
    for (let i=0;i<data.count;i++) {
      const j=i*3, x=data.means[j], y=data.means[j+1], z=data.means[j+2];
      const key=[Math.floor(x/9),Math.floor(y/9),Math.floor(z/9)].join(',');
      let cell=lookup.get(key);
      if(cell===undefined){cell=this.cells.length;lookup.set(key,cell);this.cells.push(new Box3());}
      this.cellOf[i]=cell;
      // Bound the full anisotropic ellipsoid in every orientation, including
      // half-float packing error and a screen-space antialiasing fringe.
      const r=8*Math.max(data.sigmas[j],data.sigmas[j+1],data.sigmas[j+2])+.8;
      this.cells[cell].expandByPoint(lo.set(x-r,y-r,z-r)).expandByPoint(hi.set(x+r,y+r,z+r));
    }
    this.orderVersion=0;
    this.cullBusy=false;
    this.cullDisabled=false;
    const bounds=new Box3();
    for(const cell of this.cells)bounds.union(cell);
    this.cellBounds=bounds;
    this.arenaRadius=Math.max(bounds.min.length(),bounds.max.length(),Math.hypot(Math.max(-bounds.min.x,bounds.max.x),Math.max(-bounds.min.y,bounds.max.y),Math.max(-bounds.min.z,bounds.max.z)));
    this.cellClip=new Matrix4();this.cellFrustum=new Frustum();
  }

  setFrameBudget(constrained){
    this.minSortIntervalMs=constrained?1000/12:1000/30;
    this.sortTravel=constrained?.18:.035;
  }

  retainArenaOrder(order,count){
    this.fullOrder=order;this.orderLength=count;this.orderVersion++;
  }

  startVisibilityWorker() {
    const boxes=new Float64Array(this.cells.length*6);
    this.cells.forEach((box,i)=>{box.min.toArray(boxes,6*i);box.max.toArray(boxes,6*i+3);});
    const url=URL.createObjectURL(new Blob(['(',visibilityWorker.toString(),')()'],{type:'text/javascript'}));
    try { this.cullWorker=new Worker(url); } finally { URL.revokeObjectURL(url); }
    this.cullWorker.postMessage({boxes,cells:this.cellOf},[boxes.buffer]);
    this.cullWorker.onerror=this.cullWorker.onmessageerror=()=>{
      this.cullDisabled=true;this.cullWorker?.terminate();this.cullWorker=null;
    };
    this.cullWorker.onmessage=({data})=>{
      this.cullBusy=false;
      if(this.isDisposed)return;
      const next=new Uint32Array(data.buffer),rows=next.length/16384;
      if(!this.visibleTexture){
        this.visibleTexture=new DataTexture(next,4096,rows,RGBAIntegerFormat,UnsignedIntType);
        this.visibleTexture.internalFormat='RGBA32UI';
      }else{
        this.spareOrder=this.visibleTexture.image.data.buffer;
        this.visibleTexture.image.data=next;
      }
      this.visibleTexture.clearUpdateRanges();
      const end=Math.ceil(data.length/4)*4;
      for(let start=0;start<end;start+=16384)this.visibleTexture.addUpdateRange(start,Math.min(16384,end-start));
      if(end)this.visibleTexture.needsUpdate=true;
      this.visibleCount=data.length;
      this.coverage=this.pendingCoverage;
    };
  }

  onBeforeRender(renderer,scene,camera){
    super.onBeforeRender(renderer,scene,camera);
    const mapping=this.display.mapping;
    if(this.cullDisabled||!this.fullOrder||this.activeSplats!==this.orderLength||!camera.isPerspectiveCamera||
       !this.arena.matrixWorld.equals(identity)||mapping.length!==1||mapping[0].node!==this.arena||
       mapping[0].base!==0||this.display.numSplats!==this.cellOf.length)return;
    camera.getWorldPosition(this.eye);
    const view=this.coverage,projection=camera.projectionMatrix;
    this.cellClip.multiplyMatrices(projection,camera.matrixWorldInverse);
    this.cellFrustum.setFromProjectionMatrix(this.cellClip,camera.coordinateSystem,camera.reversedDepth);
    // Compare the actual half-spaces. During zoom or camera shake, projections
    // differ every frame even while the padded visibility set fully covers the
    // current view. Bound the plane difference over the entire static arena.
    let spare=-Infinity;
    if(view?.count===this.orderLength){
      spare=Infinity;
      const {min,max}=this.cellBounds;
      for(let i=0;i<6;i++){
        const plane=this.cellFrustum.planes[i],j=4*i,old=view.planes;
        const dx=old[j]-plane.normal.x,dy=old[j+1]-plane.normal.y,dz=old[j+2]-plane.normal.z;
        const allowance=old[j+3]-plane.constant+dx*(dx<0?max.x:min.x)+dy*(dy<0?max.y:min.y)+dz*(dz<0?max.z:min.z);
        spare=Math.min(spare,allowance);
      }
    }
    if(!this.cullBusy&&(!view||view.version!==this.orderVersion||spare<.62*view.margin)){
      try{
        if(!this.cullWorker)this.startVisibilityWorker();
        const margin=1.21+2*(this.arenaRadius+this.eye.length()+1.21)*Math.sin(.04);
        const planes=[];
        for(const p of this.cellFrustum.planes)planes.push(p.normal.x,p.normal.y,p.normal.z,p.constant+margin);
        this.pendingCoverage={planes,margin,version:this.orderVersion,count:this.orderLength};
        const buffer=this.spareOrder??new ArrayBuffer(Math.ceil(this.cellOf.length/16384)*65536);
        this.spareOrder=null;
        this.cullWorker.postMessage({planes,buffer,count:this.orderLength,order:this.sentOrder===this.orderVersion?undefined:this.fullOrder},[buffer]);
        this.sentOrder=this.orderVersion;this.cullBusy=true;
      }catch{this.cullDisabled=true;this.cullWorker?.terminate();return;}
    }
    if(spare>=0){
      this.geometry.instanceCount=this.visibleCount;
      this.uniforms.ordering.value=this.visibleTexture;
    }
  }

  updateInternal(options) {
    // The actor and effects hierarchies contain no Spark generators or edits.
    // Radial keys are independent of view direction. Turning in place leaves
    // both the stored centres and their order valid at the same eye position.
    options.camera.getWorldPosition(this.eye);
    if (options.autoUpdate && this.sortRadial && !this.depthUnavailable &&
        this.depthWorker && this.depthSource === this.arena.packedSplats?.packedArray &&
        this.depthCount === this.arena.numSplats && this.arena.matrixWorld.equals(identity)) {
      // Colour and shape depend on the generator version, never on the eye.
      // Spark still checks that version on every update. A translation only
      // needs a new radial order. Keep the accumulation's own origin intact.
      if (this.eye.distanceToSquared(this.lastKeyEye) > this.sortTravel**2) this.sortDirty = true;
      this.sortedCenter.copy(this.eye);
      options.camera.getWorldDirection(this.sortedDir);
    }
    return super.updateInternal({...options, scene:this.arena});
  }

  async readbackDepth(options) {
    const {current, numSplats, readback} = options, arena = this.arena;
    const packed = arena.packedSplats?.packedArray;
    if (this.depthUnavailable || !numSplats || !packed || this.sortRadial === false ||
        current.mapping.length !== 1 || current.mapping[0].node !== arena ||
        current.mapping[0].base !== 0 || numSplats !== arena.numSplats ||
        !arena.matrixWorld.equals(identity)) return super.readbackDepth(options);
    try {
      if (!this.depthWorker) {
        const script = new Blob(['(', depthWorker.toString(), ')()'], {type:'text/javascript'});
        const url = URL.createObjectURL(script);
        try { this.depthWorker = new Worker(url); }
        finally { URL.revokeObjectURL(url); }
      }
      if (this.depthSource !== packed || this.depthCount !== numSplats) {
        const words = packed.slice(0, numSplats * 4);
        this.depthWorker.postMessage({packed:words}, [words.buffer]);
        this.depthSource = packed;
        this.depthCount = numSplats;
        this.depthBuffer = new ArrayBuffer(numSplats * 4);
      }
      // Spark serializes sort requests. Keep a separate transferable key buffer
      // because its native sorting worker takes ownership of the readback array.
      this.lastKeyEye.copy(this.eye);
      this.depthBuffer = await new Promise((resolve, reject) => {
        this.depthReject = reject;
        this.depthWorker.onmessage = event => resolve(event.data);
        this.depthWorker.onerror = this.depthWorker.onmessageerror = reject;
        this.depthWorker.postMessage({buffer:this.depthBuffer, eye:this.lastKeyEye.toArray()}, [this.depthBuffer]);
      });
      readback.set(new Uint32Array(this.depthBuffer));
      return readback;
    } catch {
      this.depthUnavailable = true;
      this.sortedCenter.set(Infinity, Infinity, Infinity);
      this.depthWorker?.terminate();
      this.depthWorker = null;
      if (!this.isDisposed) return super.readbackDepth(options);
    } finally {
      this.depthReject = null;
    }
  }

  dispose() {
    this.cullWorker?.terminate();
    this.visibleTexture?.dispose();
    super.dispose();
    this.depthReject?.(new Error('Arena disposed'));
    this.depthWorker?.terminate();
  }
}
