import * as T from "game/lib/three.module.js";

// Frost anchors cast horizontally from outside the armor toward the chest.
// Triangles wholly above or below that plane cannot intersect the ray.
export class HorizontalSkinSurface {
  static supports(mesh) {
    return mesh.isSkinnedMesh && mesh.geometry.index && mesh.material && !Array.isArray(mesh.material) &&
      !mesh.geometry.morphAttributes.position?.length && mesh.raycast === T.SkinnedMesh.prototype.raycast &&
      mesh.getVertexPosition === T.SkinnedMesh.prototype.getVertexPosition &&
      mesh.applyBoneTransform === T.SkinnedMesh.prototype.applyBoneTransform;
  }

  constructor(mesh) {
    this.mesh = mesh;
    this.matrix = new T.Matrix4();
    this.boneMatrix = new T.Matrix4();
    this.ray = new T.Ray();
    this.hit = new T.Vector3();
    this.nearest = new T.Vector3();
    this.a = new T.Vector3();
    this.b = new T.Vector3();
    this.c = new T.Vector3();
  }

  prepare(position, skinIndex, skinWeight) {
    const mesh = this.mesh, count = position.count;
    this.bind = mesh.bindMatrix.clone();
    this.position = position;
    this.skinIndex = skinIndex;
    this.skinWeight = skinWeight;
    this.positionVersion = position.version;
    this.indexVersion = skinIndex.version;
    this.weightVersion = skinWeight.version;

    this.offsets = new Uint32Array(count + 1);
    this.boneOffsets = new Uint32Array(count * 4);
    this.weighted = new Float64Array(count * 16);
    this.planes = new Float64Array(mesh.skeleton.bones.length * 4);
    this.sides = new Int8Array(count);
    this.posed = new Float64Array(count * 3);
    this.posedReady = new Uint8Array(count);

    const point = new T.Vector3();
    let influence = 0;
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
      this.offsets[i] = influence;
      for (let k = 0; k < 4; k++) {
        const weight = skinWeight.getComponent(i, k);
        if (!weight) continue;
        this.boneOffsets[influence] = 4 * skinIndex.getComponent(i, k);
        const j = 4 * influence++;
        this.weighted[j] = point.x * weight;
        this.weighted[j + 1] = point.y * weight;
        this.weighted[j + 2] = point.z * weight;
        this.weighted[j + 3] = weight;
      }
    }
    this.offsets[count] = influence;
  }

  ensureBinding() {
    const geometry = this.mesh.geometry;
    const { position, skinIndex, skinWeight } = geometry.attributes;
    if (this.position !== position || this.positionVersion !== position.version ||
        this.skinIndex !== skinIndex || this.indexVersion !== skinIndex.version ||
        this.skinWeight !== skinWeight || this.weightVersion !== skinWeight.version ||
        !this.bind.equals(this.mesh.bindMatrix)) {
      this.prepare(position, skinIndex, skinWeight);
    }
  }

  minimumWorldY() {
    this.ensureBinding();
    return this.classifyVertices(0, false);
  }

  classifyVertices(height, classify = true) {
    const mesh = this.mesh, { bones, boneInverses } = mesh.skeleton;
    const world = this.matrix.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).elements;
    const planes = this.planes;
    // Each vertex height is the weighted sum of its bones' posed Y rows,
    // plus the final world translation. The bind data stays fixed across poses.
    for (let i = 0; i < bones.length; i++) {
      const bone = this.boneMatrix.multiplyMatrices(bones[i].matrixWorld, boneInverses[i]).elements;
      for (let j = 0; j < 4; j++) {
        planes[4*i+j] = world[1]*bone[4*j] + world[5]*bone[4*j+1] + world[9]*bone[4*j+2];
      }
    }
    const offsets = this.offsets, weights = this.weighted;
    let minimum = Infinity;
    for (let i = 0; i < this.sides.length; i++) {
      let delta = world[13] - height;
      for (let j = offsets[i]; j < offsets[i + 1]; j++) {
        const bone = this.boneOffsets[j], vertex = 4*j;
        delta += planes[bone]*weights[vertex] + planes[bone+1]*weights[vertex+1] +
          planes[bone+2]*weights[vertex+2] + planes[bone+3]*weights[vertex+3];
      }
      // Retain nearly coplanar triangles for the full-precision intersection.
      if (classify) this.sides[i] = delta > .00001 ? 1 : delta < -.00001 ? -1 : 0;
      else minimum = Math.min(minimum, delta);
    }
    return minimum;
  }

  posedVertex(index, out) {
    if (this.posedReady[index]) return out.fromArray(this.posed, 3 * index);
    this.mesh.getVertexPosition(index, out);
    out.toArray(this.posed, 3 * index);
    this.posedReady[index] = 1;
    return out;
  }

  intersect(raycaster) {
    const mesh = this.mesh, geometry = mesh.geometry;
    this.ensureBinding();
    this.ray.copy(raycaster.ray).applyMatrix4(this.matrix.copy(mesh.matrixWorld).invert());
    if (mesh.boundingBox && !this.ray.intersectsBox(mesh.boundingBox)) return null;
    this.classifyVertices(raycaster.ray.origin.y);
    this.posedReady.fill(0);

    const indices = geometry.index, sides = this.sides, side = mesh.material.side;
    const limit = Math.min(indices.count, geometry.drawRange.start + geometry.drawRange.count);
    let nearest = Infinity;
    for (let i = Math.max(0, geometry.drawRange.start); i < limit; i += 3) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      if (sides[a] && sides[a] === sides[b] && sides[a] === sides[c]) continue;
      this.posedVertex(a, this.a);
      this.posedVertex(b, this.b);
      this.posedVertex(c, this.c);
      const hit = side === T.BackSide
        ? this.ray.intersectTriangle(this.c, this.b, this.a, true, this.hit)
        : this.ray.intersectTriangle(this.a, this.b, this.c, side === T.FrontSide, this.hit);
      if (!hit) continue;
      hit.applyMatrix4(mesh.matrixWorld);
      const distance = hit.distanceTo(raycaster.ray.origin);
      if (distance < raycaster.near || distance > raycaster.far || distance >= nearest) continue;
      nearest = distance;
      this.nearest.copy(hit);
    }
    return nearest < Infinity ? this.nearest : null;
  }
}
