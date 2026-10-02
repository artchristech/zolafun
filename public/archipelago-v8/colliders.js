// Spatial hash of solid shapes (for the apprentice and the camera) and of
// walkable platforms (decks, gangways, ramps, floors).
const CELL = 6;
const cells = new Map();
const pcells = new Map();
let stamp = 1;

const key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
function insert(map, o, x0, z0, x1, z1) {
  for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
    for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      const k = key(ix, iz);
      let l = map.get(k);
      if (!l) { l = []; map.set(k, l); }
      l.push(o);
    }
}
function query(map, x0, z0, x1, z1, out) {
  out.length = 0;
  stamp++;
  for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
    for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      const l = map.get(key(ix, iz));
      if (!l) continue;
      for (const o of l) if (o.s !== stamp) { o.s = stamp; out.push(o); }
    }
  return out;
}

export function addCircle(x, z, r, y0, y1) {
  const o = { t: 0, x, z, r, y0, y1, s: 0, on: true };
  insert(cells, o, x - r, z - r, x + r, z + r);
  return o;
}
export function addBox(x, z, hx, hz, rot, y0, y1) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const o = { t: 1, x, z, hx, hz, c, sn: s, y0, y1, s: 0, on: true };
  const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
  insert(cells, o, x - ex, z - ez, x + ex, z + ez);
  return o;
}
// top surface height runs from y0 at local -hx to y1 at local +hx
export function addPlatform({ x, z, hx, hz, rot = 0, y0, y1 = y0, mat = 'wood', thick = 0.3 }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const o = { x, z, hx, hz, c, sn: s, y0, y1, mat, thick, s: 0 };
  const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
  insert(pcells, o, x - ex, z - ez, x + ex, z + ez);
  return o;
}

const tmp = [];
export const PT = { top: 0, mat: 'wood' };
export function platformTop(x, z, yRef) {
  query(pcells, x, z, x, z, tmp);
  let found = false, best = -1e9;
  for (const p of tmp) {
    const dx = x - p.x, dz = z - p.z;
    const lx = p.c * dx - p.sn * dz, lz = p.sn * dx + p.c * dz;
    if (Math.abs(lx) > p.hx || Math.abs(lz) > p.hz) continue;
    const top = p.y0 + (p.y1 - p.y0) * (lx + p.hx) / (2 * p.hx);
    if (top <= yRef + 0.6 && top > best) { best = top; PT.mat = p.mat; found = true; }
  }
  PT.top = best;
  return found;
}

// Push a vertical capsule (circle of radius r spanning [y0, y1]) out of solids.
export function resolve(pos, r, y0, y1) {
  for (let it = 0; it < 3; it++) {
    query(cells, pos.x - r, pos.z - r, pos.x + r, pos.z + r, tmp);
    let moved = false;
    for (const o of tmp) {
      if (!o.on || o.y1 < y0 || o.y0 > y1) continue;
      if (o.t === 0) {
        const dx = pos.x - o.x, dz = pos.z - o.z, rr = o.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4;
          pos.x = o.x + dx / d * rr; pos.z = o.z + dz / d * rr; moved = true;
        }
      } else {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        let lx = o.c * dx - o.sn * dz, lz = o.sn * dx + o.c * dz;
        const qx = Math.max(-o.hx, Math.min(o.hx, lx)), qz = Math.max(-o.hz, Math.min(o.hz, lz));
        let ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          lx = qx + ex / d * r; lz = qz + ez / d * r;
        } else {
          const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
          if (px < pz) lx = Math.sign(lx || 1) * (o.hx + r); else lz = Math.sign(lz || 1) * (o.hz + r);
        }
        pos.x = o.x + o.c * lx + o.sn * lz; pos.z = o.z - o.sn * lx + o.c * lz;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// Is a point (inflated by m) inside anything solid? Used by the camera.
export function pointSolid(x, y, z, m) {
  query(cells, x - m, z - m, x + m, z + m, tmp);
  for (const o of tmp) {
    if (!o.on || y < o.y0 - m || y > o.y1 + m) continue;
    if (o.t === 0) {
      const dx = x - o.x, dz = z - o.z, rr = o.r + m;
      if (dx * dx + dz * dz < rr * rr) return true;
    } else {
      const dx = x - o.x, dz = z - o.z;
      const lx = o.c * dx - o.sn * dz, lz = o.sn * dx + o.c * dz;
      if (Math.abs(lx) < o.hx + m && Math.abs(lz) < o.hz + m) return true;
    }
  }
  query(pcells, x - m, z - m, x + m, z + m, tmp);
  for (const p of tmp) {
    const dx = x - p.x, dz = z - p.z;
    const lx = p.c * dx - p.sn * dz, lz = p.sn * dx + p.c * dz;
    if (Math.abs(lx) > p.hx + m || Math.abs(lz) > p.hz + m) continue;
    const top = p.y0 + (p.y1 - p.y0) * (Math.max(-p.hx, Math.min(p.hx, lx)) + p.hx) / (2 * p.hx);
    if (y < top + m && y > top - p.thick - m) return true;
  }
  return false;
}
