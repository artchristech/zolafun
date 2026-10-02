// Collision volumes (circles, oriented boxes) in a spatial hash, plus walkable platforms (decks, piers, ramps).
import { groundAt, matAt } from './terrain.js';

const CELL = 8;
const grid = new Map();
const key = (ix, iz) => ix * 73856093 ^ iz * 19349663;

export const colliders = [];
export const platforms = [];

function insert(c, minX, minZ, maxX, maxZ) {
  for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++)
    for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      const k = key(ix, iz);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(c);
    }
}

// circle: blocks between y0..y1. cam=false keeps the camera from colliding (e.g. thin posts).
export function addCircle(x, z, r, y0, y1, opts = {}) {
  const c = { type: 0, x, z, r, y0, y1, cam: opts.cam !== false, id: colliders.length };
  colliders.push(c);
  insert(c, x - r, z - r, x + r, z + r);
  return c;
}

export function addBox(x, z, hx, hz, angle, y0, y1, opts = {}) {
  const c = { type: 1, x, z, hx, hz, c: Math.cos(angle), s: Math.sin(angle), y0, y1, cam: opts.cam !== false, id: colliders.length };
  colliders.push(c);
  const R = Math.hypot(hx, hz);
  insert(c, x - R, z - R, x + R, z + R);
  return c;
}

// Platform: oriented rectangle whose height ramps from h0 (at -hx) to h1 (at +hx).
export function addPlatform(x, z, hx, hz, angle, h0, h1 = h0, surface = 'wood') {
  const p = { x, z, hx, hz, c: Math.cos(angle), s: Math.sin(angle), h0, h1, surface };
  platforms.push(p);
  return p;
}

function platformHeight(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  const lx = dx * p.c + dz * p.s, lz = -dx * p.s + dz * p.c;
  if (Math.abs(lx) > p.hx || Math.abs(lz) > p.hz) return null;
  return p.h0 + (p.h1 - p.h0) * ((lx + p.hx) / (2 * p.hx));
}

// Walkable height at (x,z) for something currently at height curY: highest surface reachable by a step.
export function walkHeight(x, z, curY) {
  let h = groundAt(x, z);
  let surface = null;
  for (let i = 0; i < platforms.length; i++) {
    const ph = platformHeight(platforms[i], x, z);
    if (ph !== null && ph > h && ph <= curY + 0.45) { h = ph; surface = platforms[i].surface; }
  }
  return { h, surface };
}

export function surfaceAt(x, z, y) {
  for (let i = 0; i < platforms.length; i++) {
    const ph = platformHeight(platforms[i], x, z);
    if (ph !== null && Math.abs(ph - y) < 0.2) return platforms[i].surface;
  }
  const m = matAt(x, z);
  if (m === 1 || m === 3 || m === 4) return 'stone';
  if (m === 2) return 'sand';
  return y < 2.0 ? 'sand' : 'grass';
}

const _near = [];
export function nearby(x, z, r) {
  _near.length = 0;
  const seen = nearby._seen || (nearby._seen = new Set());
  seen.clear();
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++)
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      const a = grid.get(key(ix, iz));
      if (!a) continue;
      for (const c of a) if (!seen.has(c.id)) { seen.add(c.id); _near.push(c); }
    }
  return _near;
}

// Push a circle (player) out of colliders. Returns adjusted [x,z].
export function resolveCircle(x, z, r, y, h) {
  const list = nearby(x, z, r + 6);
  for (let iter = 0; iter < 2; iter++) {
    for (const c of list) {
      if (y + h < c.y0 || y + 0.25 > c.y1) continue;
      if (c.type === 0) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-5) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; }
      } else {
        const dx = x - c.x, dz = z - c.z;
        let lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ex = lx - qx, ez = lz - qz;
        const d = Math.hypot(ex, ez);
        if (d < r) {
          if (d > 1e-5) { lx = qx + (ex / d) * r; lz = qz + (ez / d) * r; }
          else {
            // centre inside the box: push along the shallowest axis
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) lx = Math.sign(lx || 1) * (c.hx + r);
            else lz = Math.sign(lz || 1) * (c.hz + r);
          }
          x = c.x + lx * c.c - lz * c.s;
          z = c.z + lx * c.s + lz * c.c;
        }
      }
    }
  }
  return [x, z];
}

// Is a point (camera sample) inside any camera-blocking volume?
export function pointBlocked(x, y, z, pad = 0.25) {
  const list = nearby(x, z, pad + 6);
  for (const c of list) {
    if (!c.cam || y < c.y0 - pad || y > c.y1 + pad) continue;
    if (c.type === 0) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    } else {
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
      if (Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad) return true;
    }
  }
  return false;
}
