export const ENTRANCE = {
  firstZ: 2, count: 24, stepDown: .16, width: 10, depth: 1.05,
  railX: 5.2, railWidth: .55
};
const playerRadius = .36;
export const bossClearance = 1.7;

// The low limestone shoals can be stepped on. Index their actual top triangles
// once so contact follows the same ridges and chipped edges as the picture.
export function shoalSurface(positions, floor) {
  const rows = new Map();
  const cell = .75;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(i, i + 9);
    const dx = bx - ax, dz = bz - az, ex = cx - ax, ez = cz - az;
    const det = dx * ez - dz * ex;
    if (Math.abs(det) < 1e-8) continue;
    const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx);
    const minZ=Math.min(az,bz,cz),maxZ=Math.max(az,bz,cz);
    const tri = {ax, ay, az, dx, dz, ex, ez, by: by - ay, cy: cy - ay, det,minX,maxX,minZ,maxZ,top:Math.max(ay,by,cy)};
    for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++) {
      if (!rows.has(z)) rows.set(z, new Map());
      const row = rows.get(z);
      for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x++) {
        if (!row.has(x)) row.set(x, []);
        row.get(x).push(tri);
      }
    }
  }
  let lastX=NaN,lastZ=NaN,candidates;
  return (x, z) => {
    let y = floor(x, z);
    const ix=Math.floor(x / cell),iz=Math.floor(z / cell);
    if(ix!==lastX||iz!==lastZ){
      candidates=rows.get(iz)?.get(ix);lastX=ix;lastZ=iz;
    }
    if (candidates) for (const t of candidates) {
      if(y>t.top||x<t.minX||x>t.maxX||z<t.minZ||z>t.maxZ)continue;
      const u = ((x - t.ax) * t.ez - (z - t.az) * t.ex) / t.det;
      const v = ((z - t.az) * t.dx - (x - t.ax) * t.dz) / t.det;
      if (u >= 0 && v >= 0 && u + v <= 1) y = Math.max(y, t.ay + u * t.by + v * t.cy);
    }
    return y;
  };
}

// Use the horizontal outline of each transformed block or drum, including its
// rotation. The undercut beneath the stone is too low for the player to enter.
export function rubbleFootprint(geometry) {
  const pos = geometry.attributes.position;
  const points = Array.from({length: pos.count}, (_, i) => [pos.getX(i), pos.getZ(i)]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  function half(sequence) {
    const chain = [];
    for (const p of sequence) {
      while (chain.length > 1) {
        const a = chain[chain.length - 2], b = chain[chain.length - 1];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0) break;
        chain.pop();
      }
      chain.push(p);
    }
    return chain.slice(0, -1);
  }
  const vertices = half(points).concat(half(points.reverse()));
  geometry.computeBoundingBox();
  return {vertices, bounds: geometry.boundingBox};
}

export function constrainRubble(pos, obstacles) {
  for (const {vertices, bounds} of obstacles) {
    if (pos.x < bounds.min.x - playerRadius || pos.x > bounds.max.x + playerRadius ||
        pos.z < bounds.min.z - playerRadius || pos.z > bounds.max.z + playerRadius) continue;
    let inside = true, nearest = Infinity, px, pz, nx, nz;
    for (let i = 0; i < vertices.length; i++) {
      const [ax, az] = vertices[i], [bx, bz] = vertices[(i + 1) % vertices.length];
      const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
      const ox = pos.x - ax, oz = pos.z - az;
      if (dx * oz - dz * ox < 0) inside = false;
      const u = Math.max(0, Math.min(1, (ox * dx + oz * dz) / length2));
      const x = ax + dx * u, z = az + dz * u;
      const distance2 = (pos.x - x) ** 2 + (pos.z - z) ** 2;
      if (distance2 < nearest) {
        nearest = distance2; px = x; pz = z;
        const length = Math.sqrt(length2);
        nx = dz / length; nz = -dx / length;
      }
    }
    if (!inside && nearest >= playerRadius * playerRadius) continue;
    if (!inside && nearest > 1e-12) {
      const distance = Math.sqrt(nearest);
      nx = (pos.x - px) / distance; nz = (pos.z - pz) / distance;
    }
    pos.x = px + nx * playerRadius;
    pos.z = pz + nz * playerRadius;
  }
}

export function entranceHeight(z) {
  const step = Math.ceil(z - ENTRANCE.firstZ - ENTRANCE.depth / 2);
  return -Math.min(ENTRANCE.count - 1, Math.max(0, step)) * ENTRANCE.stepDown;
}

export function constrainEntrance(pos) {
  const side = ENTRANCE.railX - ENTRANCE.railWidth / 2 - playerRadius;
  const end = ENTRANCE.firstZ + ENTRANCE.count - 1 + ENTRANCE.depth / 2 - playerRadius;
  pos.x = Math.max(-side, Math.min(side, pos.x));
  pos.z = Math.max(ENTRANCE.firstZ, Math.min(end, pos.z));
}

// The playable area is the existing combat disc intersected with its north
// and south limits. Leave room for a grounded boss to push a player along the edge.
export function constrainCombatArena(pos, inset = 0) {
  const radius = Math.hypot(pos.x, pos.z + 20);
  const limit = 42 - inset;
  if (radius > limit) {
    const scale = limit / radius;
    pos.x *= scale;
    pos.z = (pos.z + 20) * scale - 20;
  }
  pos.z = Math.max(-43 + inset, Math.min(21 - inset, pos.z));
}

// Return the first contact normal only when a long step would pass through
// the body's far side. Ordinary close rolls keep the existing flank tracking.
export function crossingNormal(fromX, fromZ, toX, toZ, radius, normal) {
  const dx = toX - fromX, dz = toZ - fromZ;
  const travel2 = dx * dx + dz * dz;
  if (fromX * toX + fromZ * toZ > 0) return false;
  const start = fromX * fromX + fromZ * fromZ - radius * radius;
  const towards = -(fromX * dx + fromZ * dz);
  if (towards <= 0) return false;
  // The collision radius can expand as a grounded move ends. A character
  // already inside it should leave on the side they entered from.
  if (start < -1e-6) {
    if (fromX * fromX + fromZ * fromZ < 1e-8) return false;
    normal.set(fromX, 0, fromZ).normalize();
    return true;
  }
  if (travel2 < radius * radius) return false;
  const discriminant = towards * towards - travel2 * start;
  if (discriminant <= 0) return false;
  const time = (towards - Math.sqrt(discriminant)) / travel2;
  if (time < -1e-6 || time > 1) return false;
  normal.set(fromX + dx * time, 0, fromZ + dz * time).normalize();
  return true;
}
