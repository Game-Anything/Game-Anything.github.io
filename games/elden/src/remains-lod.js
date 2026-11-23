import * as T from "game/lib/three.module.js";
import {addTileLevels} from "game/src/static-instances.js";
import {MeshoptSimplifier} from "game/lib/addons/libs/meshopt_simplifier.module.js";

// The mantle and limb surfaces are regular grids. Reusing their original vertices
// preserves UVs and smooth normals and keeps neighboring LODs on the same surface.
function gridLod(source, columns, rows, strideX, strideY) {
  const indices = [];
  const width = columns + 1;
  for (let row = 0; row < rows; row += strideY) {
    const nextRow = Math.min(rows, row + strideY);
    for (let col = 0; col < columns; col += strideX) {
      const nextCol = Math.min(columns, col + strideX);
      const a = row * width + col, b = nextRow * width + col;
      const c = nextRow * width + nextCol, d = row * width + nextCol;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(indices);
  return geometry;
}

export function partitionRemains(scene, field, name, fixedDetail) {
  const geometry = field.geometry;
  const {widthSegments, heightSegments, points, segments} = geometry.parameters;
  const shapes = [];
  if (!fixedDetail) {
    if (points) {
      shapes.push(gridLod(geometry, points.length - 1, segments, 1, 2));
      shapes.push(gridLod(geometry, points.length - 1, segments, 2, 3));
    } else {
      shapes.push(gridLod(geometry, widthSegments, heightSegments, 2, 2));
      shapes.push(gridLod(geometry, widthSegments, heightSegments, 3, 3));
    }
  }
  const levels = shapes.map((geometry, i) => ({geometry, distance: i ? 29 : 13}));
  const cells = new Map(), matrix = new T.Matrix4();
  for (let i = 0; i < field.count; i++) {
    field.getMatrixAt(i, matrix);
    const e = matrix.elements;
    if (e[0] === 0 && e[1] === 0 && e[2] === 0) continue;
    const key = Math.floor(e[12] / 14) + ',' + Math.floor(e[14] / 14);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  const color = new T.Color();
  for (const members of cells.values()) {
    const near = new T.InstancedMesh(geometry, field.material, members.length);
    members.forEach((source, index) => {
      field.getMatrixAt(source, matrix);
      near.setMatrixAt(index, matrix);
      field.getColorAt(source, color);
      near.setColorAt(index, color);
    });
    near.computeBoundingSphere();
    near.name = name;
    near.castShadow = field.castShadow;
    near.receiveShadow = field.receiveShadow;
    addTileLevels(scene, near, levels);
  }
  field.removeFromParent();
  field.dispose();
}

export async function prepareMoundLods(fixedDetail) {
  if (fixedDetail || !MeshoptSimplifier.supported) return () => [];
  await MeshoptSimplifier.ready;
  return source => {
    const {position, normal, uv} = source.attributes;
    const weights = [.04, .04, .04, .12, .12];
    const attributes = new Float32Array(position.count * weights.length);
    for (let i = 0; i < position.count; i++) {
      attributes.set([normal.getX(i), normal.getY(i), normal.getZ(i), uv.getX(i), uv.getY(i)], i * weights.length);
    }
    return [[.43, .008, 10], [.18, .019, 21], [.075, .038, 37]].map(([ratio, error, distance]) => {
      const target = Math.floor(source.index.count * ratio / 3) * 3;
      const [indices] = MeshoptSimplifier.simplifyWithAttributes(source.index.array, position.array, 3,
        attributes, weights.length, weights, null, target, error, ratio<.1 ? ['Permissive'] : ['LockBorder']);
      const geometry = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(new T.BufferAttribute(indices, 1));
      return {geometry, distance};
    });
  };
}
