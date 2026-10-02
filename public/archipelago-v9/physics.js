// Ground queries, solid colliders and walkable platforms.
import { terrainH, causewayAt, trailW, peakW, TIDE, BOUNDS } from './terrain.js';

const circles = [];   // {x,z,r,y0,y1}
const boxes = [];     // {x,z,hx,hz,c,s,y0,y1}
const plats = [];     // {x,z,hx,hz,c,s,h,surf}
const CELL = 8;
const grid = new Map();
const key = (i, j) => i * 100003 + j;

function insert(obj, x, z, r) {
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = key(i, j);
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(obj);
  }
}

export function addCircle(x, z, r, y0 = -10, y1 = 100, cam = true) {
  const o = { t: 0, x, z, r, y0, y1, cam };
  circles.push(o); insert(o, x, z, r);
  return o;
}
export function addBox(x, z, hx, hz, rot, y0 = -10, y1 = 100, cam = true) {
  const o = { t: 1, x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot), y0, y1, cam };
  boxes.push(o); insert(o, x, z, Math.hypot(hx, hz));
  return o;
}
export function addPlatform(x, z, hx, hz, rot, h, surf = 'wood') {
  plats.push({ x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot), h, surf });
}

function nearby(x, z) {
  return grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
}

const WADE = 0.25;
// Ground at (x,z): height, surface and whether it can be stood on at this tide.
export function groundAt(x, z, water, out = {}) {
  let h = terrainH(x, z);
  let surf = 'grass';
  const tw = trailW(x, z);
  if (tw > 0.4 || peakW(x, z) > 0.5) surf = 'stone';
  else if (h < TIDE[0] + 1.0) surf = 'sand';
  let onPlat = false;
  const c = causewayAt(x, z);
  if (c > h) { h = c; surf = 'stone'; }
  const onCause = c >= h - 0.01;
  for (const p of plats) {
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
    if (Math.abs(lx) <= p.hx && Math.abs(lz) <= p.hz && p.h > h - 0.4) {
      if (p.h > h || !onPlat) { h = Math.max(h, p.h); surf = p.surf; onPlat = true; }
    }
  }
  let slope = 0;
  if (!onPlat && !onCause) {
    const e = 0.35;
    slope = Math.hypot(terrainH(x + e, z) - terrainH(x - e, z), terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  }
  out.h = h; out.surf = surf; out.slope = slope;
  out.walk = (onPlat || h >= water - WADE) && x > BOUNDS.x0 + 5 && x < BOUNDS.x1 - 5 && z > BOUNDS.z0 + 5 && z < BOUNDS.z1 - 5;
  return out;
}

// Push a circle of radius r at height y out of solid colliders.
export function resolveSolids(p, r, y) {
  for (let it = 0; it < 2; it++) {
    const list = nearby(p.x, p.z);
    for (const o of list) {
      if (y + 1.6 < o.y0 || y > o.y1) continue;
      if (o.t === 0) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
        if (d < m && d > 1e-5) { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; }
      } else {
        const dx = p.x - o.x, dz = p.z - o.z;
        let lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        const ex = o.hx + r, ez = o.hz + r;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
          if (px < pz) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
          p.x = o.x + lx * o.c + lz * o.s;
          p.z = o.z - lx * o.s + lz * o.c;
        }
      }
    }
  }
}

// Distance along a ray (from a to b) before it enters something solid.
// Checks terrain by marching, plus colliders analytically.
export function rayClear(ax, ay, az, bx, by, bz, pad = 0.3) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return L;
  let tHit = 1;
  // terrain march
  const steps = Math.ceil(L / 0.35);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
    let g = terrainH(x, z);
    const c = causewayAt(x, z);
    if (c > g) g = c;
    if (y < g + pad || inPlatform(x, y, z, pad)) { tHit = Math.max(0, (i - 1) / steps); break; }
  }
  // colliders (sample cells along the ray)
  const seen = new Set();
  const n = Math.ceil((L * tHit) / CELL) + 1;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(1, i / n) * tHit;
    for (const o of nearby(ax + dx * t, az + dz * t)) {
      if (seen.has(o) || !o.cam) continue;
      seen.add(o);
      const th = o.t === 0 ? rayCircle(ax, az, dx, dz, o, pad) : rayBox(ax, az, dx, dz, o, pad);
      if (th < tHit) {
        const y = ay + dy * th;
        if (y >= o.y0 - pad && y <= o.y1 + pad) tHit = th;
      }
    }
  }
  return L * tHit;
}

function inPlatform(x, y, z, pad) {
  for (const p of plats) {
    if (y > p.h + pad || y < p.h - 0.5) continue;
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
    if (Math.abs(lx) <= p.hx && Math.abs(lz) <= p.hz) return true;
  }
  return false;
}

function rayCircle(ax, az, dx, dz, o, pad) {
  const fx = ax - o.x, fz = az - o.z, r = o.r + pad;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  if (c < 0) return 1; // starting inside: ignore
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-8) return 1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : 1;
}
function rayBox(ax, az, dx, dz, o, pad) {
  const fx = ax - o.x, fz = az - o.z;
  const lx = fx * o.c - fz * o.s, lz = fx * o.s + fz * o.c;
  const ldx = dx * o.c - dz * o.s, ldz = dx * o.s + dz * o.c;
  const ex = o.hx + pad, ez = o.hz + pad;
  if (Math.abs(lx) < ex && Math.abs(lz) < ez) return 1;
  let t0 = 0, t1 = 1;
  for (const [p, d, e] of [[lx, ldx, ex], [lz, ldz, ez]]) {
    if (Math.abs(d) < 1e-8) { if (Math.abs(p) > e) return 1; continue; }
    let ta = (-e - p) / d, tb = (e - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return 1;
  }
  return t0;
}
