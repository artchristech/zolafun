// Five Lights — simple XZ colliders (circles + oriented boxes) with a spatial hash.
// Used to keep the apprentice out of solids and to pull the camera in front of them.
const CS = 8;
const grid = new Map();
const all = [];
export const allColliders = all;
const key = (i, j) => i * 73856093 ^ j * 19349663;

function insert(c, x0, z0, x1, z1) {
  for (let j = Math.floor(z0 / CS); j <= Math.floor(z1 / CS); j++)
    for (let i = Math.floor(x0 / CS); i <= Math.floor(x1 / CS); i++) {
      const k = key(i, j);
      let l = grid.get(k); if (!l) { l = []; grid.set(k, l); }
      l.push(c);
    }
}
// circle: vertical cylinder from y0 to y1. cam=false → ignored by camera
export function addCircle(x, z, r, y0 = -50, y1 = 200, opts = {}) {
  const c = { t: 0, x, z, r, y0, y1, cam: opts.cam !== false, walk: opts.walk !== false };
  all.push(c); insert(c, x - r, z - r, x + r, z + r);
  return c;
}
// box centred at x,z with half extents hw (along local x) and hd (local z), rotation ang around Y
export function addBox(x, z, hw, hd, ang, y0 = -50, y1 = 200, opts = {}) {
  const c = { t: 1, x, z, hw, hd, cs: Math.cos(ang), sn: Math.sin(ang), y0, y1, cam: opts.cam !== false, walk: opts.walk !== false };
  const r = Math.hypot(hw, hd);
  all.push(c); insert(c, x - r, z - r, x + r, z + r);
  return c;
}
export function removeCollider(c) { c.dead = true; }

let stamp = 0;
function gather(x0, z0, x1, z1, out) {
  stamp++;
  out.length = 0;
  for (let j = Math.floor(z0 / CS); j <= Math.floor(z1 / CS); j++)
    for (let i = Math.floor(x0 / CS); i <= Math.floor(x1 / CS); i++) {
      const l = grid.get(key(i, j)); if (!l) continue;
      for (const c of l) if (c._s !== stamp && !c.dead) { c._s = stamp; out.push(c); }
    }
  return out;
}
const tmpList = [];

// push a point (radius rad, vertical span y..y+ht) out of solids. returns {x,z}
export function resolve(x, z, rad, y, ht) {
  gather(x - rad - 1, z - rad - 1, x + rad + 1, z + rad + 1, tmpList);
  for (let iter = 0; iter < 2; iter++) {
    for (const c of tmpList) {
      if (!c.walk || y + ht < c.y0 || y > c.y1) continue;
      if (c.t === 0) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
        if (d < m && d > 1e-5) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
      } else {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cs + dz * c.sn, lz = -dx * c.sn + dz * c.cs;
        const ex = c.hw + rad, ez = c.hd + rad;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
          let nx = lx, nz = lz;
          if (px < pz) nx = Math.sign(lx || 1) * ex; else nz = Math.sign(lz || 1) * ez;
          x = c.x + nx * c.cs - nz * c.sn; z = c.z + nx * c.sn + nz * c.cs;
        }
      }
    }
  }
  return { x, z };
}

// first hit distance along a 3D ray (origin o, unit dir d) against solids, up to maxT
export function rayHit(o, d, maxT, pad = 0.35) {
  const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
  gather(Math.min(o.x, ex) - 2, Math.min(o.z, ez) - 2, Math.max(o.x, ex) + 2, Math.max(o.z, ez) + 2, tmpList);
  let best = maxT;
  const hl = Math.hypot(d.x, d.z);
  if (hl < 1e-5) return best;
  for (const c of tmpList) {
    if (!c.cam) continue;
    let t = Infinity;
    if (c.t === 0) {
      const r = c.r + pad;
      const fx = o.x - c.x, fz = o.z - c.z;
      const a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), cc = fx * fx + fz * fz - r * r;
      if (cc < 0) continue; // origin inside: ignore
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      t = (-b - Math.sqrt(disc)) / (2 * a);
    } else {
      const fx = o.x - c.x, fz = o.z - c.z;
      const lox = fx * c.cs + fz * c.sn, loz = -fx * c.sn + fz * c.cs;
      const ldx = d.x * c.cs + d.z * c.sn, ldz = -d.x * c.sn + d.z * c.cs;
      const hx = c.hw + pad, hz = c.hd + pad;
      if (Math.abs(lox) < hx && Math.abs(loz) < hz) continue;
      let t0 = -Infinity, t1 = Infinity;
      for (const [p, q, h] of [[lox, ldx, hx], [loz, ldz, hz]]) {
        if (Math.abs(q) < 1e-6) { if (Math.abs(p) > h) { t0 = Infinity; break; } }
        else { let a = (-h - p) / q, b = (h - p) / q; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
      }
      if (t0 <= t1 && t0 > 0) t = t0;
    }
    if (t > 0 && t < best) {
      const y = o.y + d.y * t;
      if (y > c.y0 - pad && y < c.y1 + pad) best = t;
    }
  }
  return best;
}
