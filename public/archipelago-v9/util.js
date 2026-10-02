// Shared helpers: noise, geometry merging, materials.
import * as THREE from './three.module.min.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Deterministic PRNG so the world is identical on every load.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

// --- geometry ---------------------------------------------------------------
const _c = new THREE.Color();
// Bake a primitive into a coloured, transformed, non-indexed piece.
export function piece(geo, color, matrix, extra) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (extra) for (const k in extra) {
    const { size, value } = extra[k];
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) arr[i * size + j] = Array.isArray(value) ? value[j] : value;
    g.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return g;
}

// Merge non-indexed pieces that share attribute layout.
export function merge(pieces) {
  const names = Object.keys(pieces[0].attributes);
  for (const p of pieces) if (Object.keys(p.attributes).length !== names.length) throw new Error('merge: attribute mismatch');
  let total = 0;
  for (const p of pieces) total += p.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = pieces[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const p of pieces) {
      const a = p.attributes[name];
      if (!a) throw new Error('merge: missing ' + name);
      arr.set(a.array.subarray(0, a.count * size), off);
      off += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz));
  return m;
}

// A list of pieces with a convenience adder.
export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, m, extra) { this.parts.push(piece(geo, color, m, extra)); return this; }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(G.box, color, mat4(x, y, z, rx, ry, rz, w, h, d));
  }
  cyl(r, h, color, x, y, z, rx = 0, ry = 0, rz = 0, seg) {
    return this.add(seg ? G['cyl' + seg] : G.cyl, color, mat4(x, y, z, rx, ry, rz, r, h, r));
  }
  build() { return this.parts.length ? merge(this.parts) : null; }
}

// unit primitives
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16, 1),
  cyl24: new THREE.CylinderGeometry(1, 1, 1, 24, 1),
  cone: new THREE.ConeGeometry(1, 1, 8, 1),
  sphere: new THREE.IcosahedronGeometry(1, 1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dodeca: new THREE.DodecahedronGeometry(1, 0),
};

// --- materials --------------------------------------------------------------
let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}
export function toon(opts = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...opts });
}

// 4x4 Bayer dither used for screen-door fading of foliage.
export const DITHER_GLSL = `
float bayer4(vec2 p){
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}`;

export const NOISE_GLSL = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm2(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5;} return s; }`;
