// Shared helpers: math, noise, seeded random, vertex-coloured geometry builder, toon material.
import * as THREE from './three.module.min.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

export function fbm(x, z, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

// distance from point to segment in xz, returns {d, t}
export function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz || 1e-9;
  let t = ((px - ax) * abx + (pz - az) * abz) / l2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t, cz = az + abz * t;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

// Collects many small geometries into one non-indexed, vertex-coloured BufferGeometry.
export class GeoBuilder {
  constructor(opts = {}) {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.extra = opts.extra ? [] : null; // one float per vertex (bone index, sway weight...)
    this.rng = opts.rng || mulberry32(opts.seed || 7);
  }
  get count() { return this.pos.length / 3; }
  add(geo, matrix, color, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal;
    _nm.getNormalMatrix(matrix);
    _c.set(color);
    const top = opts.top !== undefined ? new THREE.Color(opts.top) : null;
    const jitter = opts.jitter || 0;
    const flat = !!opts.flat || !n;
    const e = opts.extra || 0;
    for (let i = 0; i < p.count; i += 3) {
      const j = jitter ? (this.rng() - 0.5) * jitter : 0;
      if (flat) {
        _a.fromBufferAttribute(p, i).applyMatrix4(matrix);
        _b.fromBufferAttribute(p, i + 1).applyMatrix4(matrix);
        _d.fromBufferAttribute(p, i + 2).applyMatrix4(matrix);
        _d.sub(_a);
        _n.subVectors(_b, _a).cross(_d).normalize();
      }
      for (let k = 0; k < 3; k++) {
        _v.fromBufferAttribute(p, i + k).applyMatrix4(matrix);
        this.pos.push(_v.x, _v.y, _v.z);
        if (!flat) _n.fromBufferAttribute(n, i + k).applyMatrix3(_nm).normalize();
        this.nrm.push(_n.x, _n.y, _n.z);
        _c2.copy(top && _n.y > 0.6 ? top : _c);
        this.col.push(
          clamp(_c2.r * (1 + j), 0, 4),
          clamp(_c2.g * (1 + j), 0, 4),
          clamp(_c2.b * (1 + j), 0, 4)
        );
        if (this.extra) this.extra.push(typeof e === 'function' ? e(_v) : e);
      }
    }
    if (g !== geo) g.dispose();
    return this;
  }
  box(w, h, d, m, color, opts) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.add(g, m, color, opts);
    g.dispose();
    return this;
  }
  cyl(rt, rb, h, seg, m, color, opts) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!(opts && opts.open));
    this.add(g, m, color, opts);
    g.dispose();
    return this;
  }
  ico(r, detail, m, color, opts) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    this.add(g, m, color, Object.assign({ flat: true }, opts));
    g.dispose();
    return this;
  }
  build(extraName = 'aExtra') {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.extra) g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

let gradTex = null;
export function toonGradient() {
  if (!gradTex) {
    const d = new Uint8Array([70, 150, 255]);
    gradTex = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
    gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
    gradTex.generateMipmaps = false;
    gradTex.needsUpdate = true;
  }
  return gradTex;
}

export function toonMat(opts = {}) {
  return new THREE.MeshToonMaterial(Object.assign({ vertexColors: true, gradientMap: toonGradient() }, opts));
}

// Shared material for static scenery, so all islands share one program.
let sharedToon = null;
export function sceneryMat() {
  if (!sharedToon) sharedToon = toonMat();
  return sharedToon;
}

export function makeStaticMesh(builder, opts = {}) {
  const mesh = new THREE.Mesh(builder.build(), opts.material || sceneryMat());
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

// Five-pointed star shape for carved symbols.
export function starGeometry(r = 0.5, depth = 0.15) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

// The seven fishing-village emblems: geometry factories, each roughly unit sized.
export const EMBLEM_COLORS = ['#e04a3a', '#f08a24', '#f2cf3a', '#5cb84a', '#2fb5a8', '#3a6fd8', '#9a4fd0'];
export function emblemGeometry(i) {
  switch (i) {
    case 0: return new THREE.IcosahedronGeometry(0.42, 1); // ball
    case 1: return new THREE.ConeGeometry(0.46, 0.8, 3); // pyramid
    case 2: return new THREE.BoxGeometry(0.62, 0.62, 0.62); // cube
    case 3: return new THREE.OctahedronGeometry(0.5); // diamond
    case 4: return new THREE.TorusGeometry(0.36, 0.12, 6, 12); // ring
    case 5: return starGeometry(0.52, 0.22); // star
    default: return crossGeometry(); // cross
  }
}
function crossGeometry() {
  const b = new GeoBuilder();
  b.box(0.85, 0.22, 0.22, mat(0, 0, 0), '#fff');
  b.box(0.22, 0.85, 0.22, mat(0, 0, 0), '#fff');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  return g;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
