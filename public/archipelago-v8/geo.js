// Geometry helpers: a merge builder for static scenery (one draw call per
// island) and a handful of primitive generators.
import * as THREE from './three.module.min.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _n3 = new THREE.Matrix3();
const _c = new THREE.Color();

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

// Matrix that places a unit-Y primitive between two points.
export function between(ax, ay, az, bx, by, bz, sx = 1, sz = sx) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(sx, len, sz));
}

function ni(geo) {
  if (!geo.userData.ni) geo.userData.ni = geo.index ? geo.toNonIndexed() : geo;
  return geo.userData.ni;
}

let jseed = 1;
export class GeoBuilder {
  constructor(withFol = false) { this.p = []; this.n = []; this.c = []; this.f = withFol ? [] : null; }
  // color: hex / Color / function(worldPos, normal) -> Color
  add(geo, m, color, opt = {}) {
    const g = ni(geo);
    const pos = g.attributes.position, nor = g.attributes.normal;
    _n3.getNormalMatrix(m);
    const fn = typeof color === 'function' ? color : null;
    const base = fn ? null : (color instanceof THREE.Color ? color : new THREE.Color(color));
    const jit = opt.jitter || 0;
    const fol = opt.fol || 0;
    let jr = 1;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const px = _v.x, py = _v.y, pz = _v.z;
      this.p.push(px, py, pz);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_n3).normalize();
      this.n.push(_v.x, _v.y, _v.z);
      if (jit && i % 3 === 0) { jseed = (jseed * 16807) % 2147483647; jr = 1 + ((jseed / 2147483647) - 0.5) * jit; }
      if (fn) { const cc = fn(px, py, pz, _v); this.c.push(cc.r * jr, cc.g * jr, cc.b * jr); }
      else this.c.push(base.r * jr, base.g * jr, base.b * jr);
      if (this.f) this.f.push(fol);
    }
    return this;
  }
  get count() { return this.p.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.f) g.setAttribute('aFol', new THREE.Float32BufferAttribute(this.f, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const cache = new Map();
function cached(key, make) { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; }

export const G = {
  box: (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, s = 8, open = false) => cached(`c${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open)),
  cone: (r, h, s = 8) => cached(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  sph: (r, ws = 8, hs = 6) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  torus: (R, r, rs = 5, ts = 14, arc = Math.PI * 2) => cached(`t${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  blob: (r, detail = 0) => cached(`o${r},${detail}`, () => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i).normalize(); n.setXYZ(i, _v.x, _v.y, _v.z); }
    return g;
  }),
  // triangular prism (gable roof): width along x, height up, depth along z
  prism: (w, h, d) => cached(`p${w},${h},${d}`, () => {
    const x = w / 2, z = d / 2;
    const v = [
      // two gable ends
      -x, 0, z, -x, 0, -z, -x, h, 0,
      x, 0, -z, x, 0, z, x, h, 0,
      // slopes
      -x, 0, z, -x, h, 0, x, h, 0, -x, 0, z, x, h, 0, x, 0, z,
      -x, 0, -z, x, 0, -z, x, h, 0, -x, 0, -z, x, h, 0, -x, h, 0,
      // bottom
      -x, 0, -z, -x, 0, z, x, 0, z, -x, 0, -z, x, 0, z, x, 0, -z,
    ];
    // the list above is wound clockwise; flip every triangle so faces point outward
    for (let i = 0; i < v.length; i += 9) for (let k = 0; k < 3; k++) { const t = v[i + 3 + k]; v[i + 3 + k] = v[i + 6 + k]; v[i + 6 + k] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }),
};

// Flip a geometry inside out (for the inner surface of shells).
export function flipped(geo) {
  const g = ni(geo).clone();
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; const u = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = u; }
  }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  g.userData.ni = g;
  return g;
}

// Lofted boat hull along x (bow at -x). Returns indexed geometry with normals.
export function hullGeo(len, beam, depth, sections = 14) {
  const prof = [[1, 1], [0.97, 0.62], [0.78, 0.28], [0.42, 0.07], [0, 0]];
  const pos = [], idx = [];
  const rows = [];
  for (let i = 0; i <= sections; i++) {
    const u = i / sections;
    const x = -len / 2 + u * len;
    let wf = Math.pow(Math.sin(Math.min(1, u / 0.42) * Math.PI / 2), 0.85);
    if (u > 0.82) wf *= 1 - (u - 0.82) / 0.18 * 0.22;
    const lift = u < 0.3 ? Math.pow(1 - u / 0.3, 2) * depth * 0.28 : 0;
    const row = [];
    for (const s of [1, -1]) {
      const side = [];
      for (const [pw, ph] of prof) {
        side.push(pos.length / 3);
        pos.push(x, lift + ph * (depth - lift * 0.4) + (1 - ph) * lift * 0.9, s * pw * wf * beam / 2);
      }
      row.push(side);
    }
    rows.push(row);
  }
  for (let i = 0; i < sections; i++) {
    for (let si = 0; si < 2; si++) {
      const A = rows[i][si], B = rows[i + 1][si];
      for (let j = 0; j < prof.length - 1; j++) {
        const a = A[j], b = B[j], c = A[j + 1], d = B[j + 1];
        if (si === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
  }
  // stern transom
  const last = rows[sections];
  for (let j = 0; j < prof.length - 1; j++) {
    const a = last[0][j], b = last[0][j + 1], c = last[1][j], d = last[1][j + 1];
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function color(hex) { return new THREE.Color(hex); }
export function mix(a, b, t) { return _c.copy(a).lerp(b, t).clone(); }
