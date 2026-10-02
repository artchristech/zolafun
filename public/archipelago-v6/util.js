// Five Lights — shared helpers: math, noise, geometry merging, toon materials.
import * as THREE from './three.module.min.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export function dampAngle(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm(x, y, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

// distance from point to segment in xz; returns {d, t}
export function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1e-6;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return { d: Math.sqrt(dx * dx + dz * dz), t };
}
export function polyDist(px, pz, pts) {
  let best = { d: 1e9, i: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(px, pz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
    if (r.d < best.d) best = { d: r.d, i, t: r.t };
  }
  return best;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Merge non-indexed geometries carrying position/normal/color.
export function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

const _c = new THREE.Color();
export function prepGeo(geo, color, matrix, flat = true) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (flat || !g.attributes.normal) g.computeVertexNormals();
  const cnt = g.attributes.position.count;
  const c = new Float32Array(cnt * 3);
  _c.set(color);
  for (let i = 0; i < cnt; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Accumulates coloured primitives, then merges them into one mesh (one draw call).
export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, matrix, flat = true) { this.parts.push(prepGeo(geo, color, matrix, flat)); return this; }
  box(w, h, d, color, x, y, z, ry = 0, rx = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, mat(x, y, z, rx, ry, rz));
  }
  cyl(rt, rb, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0, open = false) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), color, mat(x, y, z, rx, ry, rz));
  }
  rock(r, color, x, y, z, seed = 1, sy = 0.7) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position, R = rng(seed * 7919 + 13);
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + R() * 0.45;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k);
    }
    return this.add(g, color, mat(x, y, z, 0, R() * 6.28, 0));
  }
  build(material, cast = true, receive = true) {
    if (!this.parts.length) return null;
    const m = new THREE.Mesh(mergeGeos(this.parts), material);
    m.castShadow = cast; m.receiveShadow = receive;
    m.matrixAutoUpdate = false; m.updateMatrix();
    this.parts.length = 0;
    return m;
  }
}

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}
export function toon(color = 0xffffff, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
}
export function vtoon(opts = {}) {
  return new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient(), ...opts });
}
