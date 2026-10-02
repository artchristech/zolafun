import * as THREE from './three.module.min.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function damp(cur, target, rate, dt) {
  return lerp(cur, target, 1 - Math.exp(-rate * dt));
}
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
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

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

export function fbm(x, z, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f, seed + i * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
// Matrix with yaw (ry) applied last: R = Ry * Rx * Rz
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
export function mul(a, b) {
  return new THREE.Matrix4().multiplyMatrices(a, b);
}

// Collects many geometries into one non-indexed geometry with vertex colours.
export class GeoBuilder {
  constructor(skinned = false) {
    this.p = [];
    this.n = [];
    this.c = [];
    this.sk = skinned ? [] : null;
  }
  add(geo, m, color, opt = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (opt.flat) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const col = new THREE.Color(color);
    const v = new THREE.Vector3();
    const tmp = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      const wx = v.x, wy = v.y, wz = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      this.n.push(v.x, v.y, v.z);
      if (opt.colorFn) {
        const cc = opt.colorFn(wx, wy, wz, col, tmp);
        this.c.push(cc.r, cc.g, cc.b);
      } else this.c.push(col.r, col.g, col.b);
      if (this.sk) this.sk.push(opt.bone || 0);
    }
    g.dispose();
    geo.dispose();
    return this;
  }
  get empty() {
    return this.p.length === 0;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.sk) {
      const n = this.sk.length;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        si[i * 4] = this.sk[i];
        sw[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const d = new Uint8Array([84, 160, 220, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  _grad = t;
  return t;
}

export function makeMaterials() {
  const g = toonGradient();
  return {
    vc: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g }),
    vcDouble: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g, side: THREE.DoubleSide }),
    toon: (color) => new THREE.MeshToonMaterial({ color, gradientMap: g }),
  };
}

// Mesh oriented between two points (unit cylinder along Y scaled to length)
const _up = new THREE.Vector3(0, 1, 0);
export function orientBetween(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, d.normalize());
  mesh.scale.set(1, len, 1);
}
