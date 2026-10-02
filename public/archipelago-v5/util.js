// Five Lights — shared helpers: math, noise, colours, toon material.
import * as THREE from './three.module.min.js';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise (deterministic)
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
export function fbm2(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// distance from point to segment in XZ; returns {d, t}
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-6;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return { d: Math.sqrt(qx * qx + qz * qz), t };
}

// sRGB-authored colour → THREE.Color in the linear working space
export function srgb(r, g, b) { return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); }
export function hex(h) { return new THREE.Color(h); }

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const data = new Uint8Array([70, 135, 200, 255]);
  _grad = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  _grad.minFilter = THREE.NearestFilter;
  _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}
const _matCache = new Map();
export function toon(color, opts = {}) {
  const key = (typeof color === 'number' ? color : color.getHex()) + JSON.stringify(opts);
  if (!opts.unique && _matCache.has(key)) return _matCache.get(key);
  const o = { ...opts }; delete o.unique;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...o });
  if (!opts.unique) _matCache.set(key, m);
  return m;
}

// Uniforms shared by custom shaders
export const shared = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uFogColor: { value: new THREE.Color() },
  uFogNear: { value: 100 },
  uFogFar: { value: 800 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSkyTop: { value: new THREE.Color() },
  uSkyHorizon: { value: new THREE.Color() },
};

// 4x4 Bayer dither (GLSL) used for screen-door fades
export const GLSL_BAYER = `
float bayer4(vec2 p){
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}`;

export const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s/0.9375; }
`;

// batch many small parts into one InstancedMesh (local to parent). items: {x,y,z,rx,ry,rz,sx,sy,sz}
export function inst(parent, geo, mat, items, { cast = false, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
    p.set(it.x || 0, it.y || 0, it.z || 0);
    s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
  });
  im.castShadow = cast; im.receiveShadow = receive;
  im.computeBoundingSphere();
  parent.add(im);
  return im;
}
