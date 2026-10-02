// Five Lights — simple 2.5D colliders (circles, oriented boxes) in a spatial hash.
// Used both to stop the player and to pull the camera in front of obstacles.
const CELL = 8;
const grid = new Map();
const key = (i, j) => i * 73856093 ^ j * 19349663;

function insert(c, minx, minz, maxx, maxz) {
  for (let i = Math.floor(minx / CELL); i <= Math.floor(maxx / CELL); i++)
    for (let j = Math.floor(minz / CELL); j <= Math.floor(maxz / CELL); j++) {
      const k = key(i, j);
      let a = grid.get(k);
      if (!a) grid.set(k, a = []);
      a.push(c);
    }
}

// y0..y1: vertical extent (world). solid: blocks walking. cam: blocks the camera.
export function addCircle(x, z, r, y0, y1, solid = true, cam = true) {
  const c = { t: 0, x, z, r, y0, y1, solid, cam, on: true };
  insert(c, x - r, z - r, x + r, z + r);
  return c;
}
export function addBox(x, z, hx, hz, rot, y0, y1, solid = true, cam = true) {
  const c = { t: 1, x, z, hx, hz, rot, cs: Math.cos(rot), sn: Math.sin(rot), y0, y1, solid, cam, on: true };
  const r = Math.hypot(hx, hz);
  insert(c, x - r, z - r, x + r, z + r);
  return c;
}

let stamp = 0;
function near(x, z, cb) {
  stamp++;
  const i0 = Math.floor((x - 2) / CELL), i1 = Math.floor((x + 2) / CELL);
  const j0 = Math.floor((z - 2) / CELL), j1 = Math.floor((z + 2) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = grid.get(key(i, j));
    if (!a) continue;
    for (const c of a) { if (c._s === stamp || !c.on) continue; c._s = stamp; cb(c); }
  }
}

// push a walking body of radius r at height y out of solid colliders
export function pushOut(p, r, y) {
  near(p.x, p.z, (c) => {
    if (!c.solid || y + 1.6 < c.y0 || y + 0.3 > c.y1) return;
    if (c.t === 0) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z;
      let lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
      const ox = c.hx + r - Math.abs(lx), oz = c.hz + r - Math.abs(lz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) lx += Math.sign(lx || 1) * ox; else lz += Math.sign(lz || 1) * oz;
        p.x = c.x + lx * c.cs + lz * c.sn;
        p.z = c.z - lx * c.sn + lz * c.cs;
      }
    }
  });
}

// is a camera-sized point inside any camera blocker?
export function camBlocked(x, y, z, pad = 0.25) {
  let hit = false;
  near(x, z, (c) => {
    if (hit || !c.cam || y < c.y0 - pad || y > c.y1 + pad) return;
    if (c.t === 0) { if (Math.hypot(x - c.x, z - c.z) < c.r + pad) hit = true; }
    else {
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
      if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad) hit = true;
    }
  });
  return hit;
}
