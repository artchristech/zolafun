// Simple circle / oriented-box colliders in a spatial hash, used by player and camera.
export class Colliders {
  constructor() {
    this.cell = 6;
    this.map = new Map();
    this.stamp = 1;
    this.all = [];
  }
  _key(ix, iz) {
    return (ix + 1000) * 4096 + (iz + 1000);
  }
  _insert(o, minx, minz, maxx, maxz) {
    const c = this.cell;
    for (let ix = Math.floor(minx / c); ix <= Math.floor(maxx / c); ix++) {
      for (let iz = Math.floor(minz / c); iz <= Math.floor(maxz / c); iz++) {
        const k = this._key(ix, iz);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(o);
      }
    }
    this.all.push(o);
  }
  circle(x, z, r, y0 = -50, y1 = 200) {
    const o = { t: 0, x, z, r, y0, y1, s: 0, on: true };
    this._insert(o, x - r, z - r, x + r, z + r);
    return o;
  }
  // box rotated by yaw (same convention as Object3D.rotation.y)
  box(x, z, hx, hz, yaw, y0 = -50, y1 = 200) {
    const o = { t: 1, x, z, hx, hz, c: Math.cos(yaw), sn: Math.sin(yaw), y0, y1, s: 0, on: true };
    const R = Math.hypot(hx, hz);
    this._insert(o, x - R, z - R, x + R, z + R);
    return o;
  }
  query(minx, minz, maxx, maxz, out) {
    out.length = 0;
    const st = ++this.stamp;
    const c = this.cell;
    for (let ix = Math.floor(minx / c); ix <= Math.floor(maxx / c); ix++) {
      for (let iz = Math.floor(minz / c); iz <= Math.floor(maxz / c); iz++) {
        const a = this.map.get(this._key(ix, iz));
        if (!a) continue;
        for (const o of a) {
          if (o.s === st || !o.on) continue;
          o.s = st;
          out.push(o);
        }
      }
    }
    return out;
  }
  // push a vertical capsule (radius rad, from y to y+height) out of colliders
  resolve(p, rad, height) {
    const list = this.query(p.x - rad - 1, p.z - rad - 1, p.x + rad + 1, p.z + rad + 1, this._tmp || (this._tmp = []));
    for (let iter = 0; iter < 2; iter++) {
      for (const o of list) {
        if (p.y + height < o.y0 || p.y > o.y1) continue;
        if (o.t === 0) {
          const dx = p.x - o.x, dz = p.z - o.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          const m = o.r + rad;
          if (d < m) {
            if (d < 1e-4) {
              p.x += m;
            } else {
              p.x += (dx / d) * (m - d);
              p.z += (dz / d) * (m - d);
            }
          }
        } else {
          const dx = p.x - o.x, dz = p.z - o.z;
          const lx = dx * o.c - dz * o.sn, lz = dx * o.sn + dz * o.c;
          const cx = Math.max(-o.hx, Math.min(o.hx, lx)), cz = Math.max(-o.hz, Math.min(o.hz, lz));
          let ox = lx - cx, oz = lz - cz;
          const d = Math.sqrt(ox * ox + oz * oz);
          let nlx = lx, nlz = lz;
          if (d > 1e-5) {
            if (d < rad) {
              nlx = cx + (ox / d) * rad;
              nlz = cz + (oz / d) * rad;
            } else continue;
          } else {
            // inside: push out along the shallowest axis
            const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
            if (px < pz) nlx = Math.sign(lx || 1) * (o.hx + rad);
            else nlz = Math.sign(lz || 1) * (o.hz + rad);
          }
          // back to world
          p.x = o.x + nlx * o.c + nlz * o.sn;
          p.z = o.z - nlx * o.sn + nlz * o.c;
        }
      }
    }
    return p;
  }
  // first hit distance along a ray (direction normalised), or maxT
  ray(ox, oy, oz, dx, dy, dz, maxT, pad = 0.25) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const list = this.query(Math.min(ox, ex) - 2, Math.min(oz, ez) - 2, Math.max(ox, ex) + 2, Math.max(oz, ez) + 2, this._tmp2 || (this._tmp2 = []));
    let best = maxT;
    const h2 = dx * dx + dz * dz;
    for (const o of list) {
      if (o.t === 0) {
        const r = o.r + pad;
        const fx = ox - o.x, fz = oz - o.z;
        const c = fx * fx + fz * fz - r * r;
        if (c < 0) continue; // starting inside: ignore
        if (h2 < 1e-8) continue;
        const b = fx * dx + fz * dz;
        const disc = b * b - h2 * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / h2;
        if (t < 0 || t >= best) continue;
        const y = oy + dy * t;
        if (y < o.y0 - pad || y > o.y1 + pad) continue;
        best = t;
      } else {
        const fx = ox - o.x, fz = oz - o.z;
        const lx = fx * o.c - fz * o.sn, lz = fx * o.sn + fz * o.c;
        const ldx = dx * o.c - dz * o.sn, ldz = dx * o.sn + dz * o.c;
        const hx = o.hx + pad, hz = o.hz + pad;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) continue;
        let t0 = -1e9, t1 = 1e9;
        if (Math.abs(ldx) < 1e-8) {
          if (Math.abs(lx) > hx) continue;
        } else {
          let a = (-hx - lx) / ldx, b = (hx - lx) / ldx;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
        }
        if (Math.abs(ldz) < 1e-8) {
          if (Math.abs(lz) > hz) continue;
        } else {
          let a = (-hz - lz) / ldz, b = (hz - lz) / ldz;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
        }
        if (t0 > t1 || t1 < 0) continue;
        const t = Math.max(t0, 0);
        if (t >= best) continue;
        // vertical overlap anywhere inside the slab span
        const ya = oy + dy * t, yb = oy + dy * Math.min(t1, best);
        if (Math.max(ya, yb) < o.y0 - pad || Math.min(ya, yb) > o.y1 + pad) continue;
        best = t;
      }
    }
    return best;
  }
}
