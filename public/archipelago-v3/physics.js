import { groundH } from './terrain.js';

// Circle colliders (spatial hash), walkable platforms (boardwalks), camera blockers.
export class Physics {
  constructor() {
    this.cell = 8;
    this.grid = new Map();
    this.platforms = [];
    this.camCircles = [];
  }
  _key(ix, iz) { return (ix + 1000) * 4096 + (iz + 1000); }

  addCircle(x, z, r, y0 = -50, y1 = 200, cam = false) {
    const c = { x, z, r, y0, y1, on: true };
    const s = this.cell;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const k = this._key(ix, iz);
        let l = this.grid.get(k);
        if (!l) { l = []; this.grid.set(k, l); }
        l.push(c);
      }
    }
    if (cam) this.camCircles.push(c);
    return c;
  }

  // Oriented rectangle platform: centre, yaw of the long axis, half extents, top height.
  addPlatform(cx, cz, yaw, hl, hw, top) {
    const p = { cx, cz, ux: Math.cos(yaw), uz: Math.sin(yaw), hl, hw, top };
    this.platforms.push(p);
    return p;
  }

  platformAt(x, z, y) {
    let best = null;
    for (const p of this.platforms) {
      const dx = x - p.cx, dz = z - p.cz;
      const a = dx * p.ux + dz * p.uz, b = -dx * p.uz + dz * p.ux;
      if (Math.abs(a) <= p.hl && Math.abs(b) <= p.hw && p.top <= y + 0.6) {
        if (!best || p.top > best.top) best = p;
      }
    }
    return best;
  }

  // ground height under (x,z) for something currently at height y
  groundAt(x, z, y = 1e6) {
    const h = groundH(x, z);
    const p = this.platformAt(x, z, y);
    if (p && p.top > h) return { h: p.top, wood: true };
    return { h, wood: false };
  }

  pushOut(x, z, y, r) {
    const s = this.cell;
    for (let iter = 0; iter < 2; iter++) {
      let moved = false;
      const cand = [];
      for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
        for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
          const l = this.grid.get(this._key(ix, iz));
          if (l) for (const c of l) cand.push(c);
        }
      }
      for (const c of cand) {
        if (!c.on || y < c.y0 - 0.2 || y > c.y1) continue;
        const dx = x - c.x, dz = z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz), m = c.r + r;
        if (d < m) {
          if (d < 1e-4) { x += m; continue; }
          x = c.x + dx / d * m; z = c.z + dz / d * m; moved = true;
        }
      }
      if (!moved) break;
    }
    return [x, z];
  }

  // Is a camera sample point inside something solid?
  camBlocked(x, y, z) {
    const g = this.groundAt(x, z, y);
    if (y < g.h + 0.35) return true;
    for (const c of this.camCircles) {
      if (!c.on || y < c.y0 || y > c.y1 + 0.3) continue;
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + 0.3) * (c.r + 0.3)) return true;
    }
    return false;
  }
}
