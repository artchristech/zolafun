// Sky dome (gradient, sun, cel clouds, stars, evening star, moon) and the
// golden-hour -> night palette that drives every light in the scene.
import * as THREE from './three.module.min.js';
import { OBS } from './layout.js';
import { clamp, lerp, smoothstep, D2R } from './util.js';

const skyVS = `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;
const skyFS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunDisc; uniform float uStars; uniform vec3 uStarDir; uniform float uStarBright;
uniform vec3 uMoonDir; uniform float uMoon; uniform float uTime; uniform vec3 uCloudLit; uniform vec3 uCloudShade;
varying vec3 vDir;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), u.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ return n2(p)*0.55 + n2(p*2.03+1.7)*0.28 + n2(p*4.1-3.1)*0.17; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, h), 0.65));
  col = mix(col, uHorizon * 0.75, smoothstep(0.0, -0.25, h));
  float sd = dot(d, uSunDir);
  col += uSunColor * (pow(max(sd, 0.0), 48.0) * 0.9 + pow(max(sd, 0.0), 5.0) * 0.22);
  col = mix(col, uSunColor * 5.0, smoothstep(0.99935, 0.99945, sd) * uSunDisc);
  // stars
  if (uStars > 0.001 && h > 0.0) {
    vec3 p = d * 160.0; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
    float r = h3(id);
    float tw = 0.6 + 0.4 * sin(uTime * (2.0 + r * 5.0) + r * 40.0);
    float st = step(0.965, r) * smoothstep(0.16, 0.0, length(f)) * tw;
    col += vec3(0.85, 0.9, 1.0) * st * uStars * 1.4 * smoothstep(0.0, 0.15, h);
  }
  // moon
  float md = dot(d, uMoonDir);
  col = mix(col, vec3(0.92, 0.95, 1.0) * 1.6, smoothstep(0.9991, 0.9993, md) * uMoon);
  col += vec3(0.4, 0.5, 0.8) * pow(max(md, 0.0), 300.0) * 0.4 * uMoon;
  // cel clouds near the horizon
  if (h > -0.02) {
    vec2 cuv = d.xz / (h + 0.12);
    float n = fbm(cuv * 0.9 + vec2(uTime * 0.004, 0.0));
    float band = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.22, 0.5, h));
    float c = smoothstep(0.56, 0.58, n) * band;
    float lit = smoothstep(0.6, 0.72, n + dot(normalize(d.xz + 0.0001), normalize(uSunDir.xz + 0.0001)) * 0.08);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    col = mix(col, cc, c * 0.92);
  }
  // the evening star: a four-pointed glint the telescope must find
  float es = dot(d, uStarDir);
  vec3 sx = normalize(cross(uStarDir, vec3(0.0, 1.0, 0.0)));
  vec3 sy = cross(sx, uStarDir);
  vec3 rel = d - uStarDir * es;
  float ax = abs(dot(rel, sx)), ay = abs(dot(rel, sy));
  float rays = (smoothstep(0.0009, 0.0, ay) * smoothstep(0.012, 0.0, ax) + smoothstep(0.0009, 0.0, ax) * smoothstep(0.012, 0.0, ay));
  float core = smoothstep(0.99996, 0.99999, es);
  col += vec3(1.0, 0.95, 0.85) * (core * 6.0 + rays * 2.5 + pow(max(es, 0.0), 6000.0) * 2.0) * uStarBright * step(0.0, es);
  gl_FragColor = vec4(col, 1.0);
}`;

export function starDirection() {
  const a = OBS.starAz, e = OBS.starEl;
  return new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize();
}

export function createSky() {
  const u = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uSunColor: { value: new THREE.Color() },
    uSunDisc: { value: 1 }, uStars: { value: 0 }, uStarDir: { value: starDirection() }, uStarBright: { value: 0.6 },
    uMoonDir: { value: new THREE.Vector3(0.6, 0.45, 0.65).normalize() }, uMoon: { value: 0 }, uTime: { value: 0 },
    uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, u };
}

// palette keyframes over the 20-minute dusk (t = 0..1)
const K = [
  { t: 0.0, el: 13, sun: [1.0, 0.8, 0.52], si: 2.7, zen: [0.32, 0.52, 0.86], hor: [1.0, 0.76, 0.48], hemiS: [0.62, 0.7, 0.9], hemiG: [0.55, 0.4, 0.28], hi: 0.95, fog: 0.0022, fogc: [0.98, 0.78, 0.58], cl: [1.0, 0.86, 0.66], cs: [0.78, 0.6, 0.62], deep: [0.03, 0.28, 0.42], shal: [0.16, 0.66, 0.68] },
  { t: 0.45, el: 4, sun: [1.0, 0.56, 0.28], si: 1.9, zen: [0.24, 0.32, 0.62], hor: [1.0, 0.5, 0.28], hemiS: [0.55, 0.52, 0.72], hemiG: [0.5, 0.32, 0.25], hi: 0.8, fog: 0.0035, fogc: [0.95, 0.56, 0.38], cl: [1.0, 0.6, 0.36], cs: [0.55, 0.38, 0.5], deep: [0.04, 0.2, 0.36], shal: [0.2, 0.5, 0.56] },
  { t: 0.7, el: -2, sun: [0.95, 0.35, 0.3], si: 0.35, zen: [0.07, 0.1, 0.27], hor: [0.5, 0.26, 0.34], hemiS: [0.25, 0.3, 0.5], hemiG: [0.16, 0.12, 0.16], hi: 0.55, fog: 0.007, fogc: [0.26, 0.2, 0.32], cl: [0.5, 0.3, 0.4], cs: [0.16, 0.14, 0.26], deep: [0.02, 0.07, 0.17], shal: [0.08, 0.2, 0.3] },
  { t: 1.0, el: -9, sun: [0.4, 0.5, 0.9], si: 0.0, zen: [0.008, 0.016, 0.06], hor: [0.035, 0.06, 0.15], hemiS: [0.1, 0.16, 0.34], hemiG: [0.03, 0.04, 0.08], hi: 0.42, fog: 0.016, fogc: [0.03, 0.05, 0.11], cl: [0.08, 0.1, 0.2], cs: [0.03, 0.04, 0.09], deep: [0.008, 0.025, 0.06], shal: [0.03, 0.09, 0.15] },
];
function seg(t) {
  for (let i = 0; i < K.length - 1; i++) if (t <= K[i + 1].t) return [K[i], K[i + 1], (t - K[i].t) / (K[i + 1].t - K[i].t)];
  return [K[K.length - 1], K[K.length - 1], 0];
}
const lc = (a, b, f, out) => out.setRGB(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f), THREE.SRGBColorSpace);

export const SUN_AZ = 172 * D2R; // just south of west
export function palette(t, out) {
  t = clamp(t, 0, 1);
  const [a, b, f0] = seg(t);
  const f = smoothstep(0, 1, f0);
  out.el = lerp(a.el, b.el, f) * D2R;
  out.sunI = lerp(a.si, b.si, f);
  lc(a.sun, b.sun, f, out.sun); lc(a.zen, b.zen, f, out.zen); lc(a.hor, b.hor, f, out.hor);
  lc(a.hemiS, b.hemiS, f, out.hemiS); lc(a.hemiG, b.hemiG, f, out.hemiG);
  out.hemiI = lerp(a.hi, b.hi, f);
  out.fog = lerp(a.fog, b.fog, f);
  lc(a.fogc, b.fogc, f, out.fogc); lc(a.cl, b.cl, f, out.cl); lc(a.cs, b.cs, f, out.cs);
  lc(a.deep, b.deep, f, out.deep); lc(a.shal, b.shal, f, out.shal);
  out.night = smoothstep(0.5, 0.95, t);
  out.moon = smoothstep(0.62, 0.85, t);
  out.stars = smoothstep(0.55, 0.9, t);
  out.starBright = lerp(0.55, 1.6, smoothstep(0.0, 0.8, t));
  out.sunDir.set(Math.cos(SUN_AZ) * Math.cos(out.el), Math.sin(out.el), Math.sin(SUN_AZ) * Math.cos(out.el)).normalize();
  return out;
}
export function makePalette() {
  return { el: 0, sunI: 0, sun: new THREE.Color(), zen: new THREE.Color(), hor: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(),
    hemiI: 0, fog: 0, fogc: new THREE.Color(), cl: new THREE.Color(), cs: new THREE.Color(), deep: new THREE.Color(), shal: new THREE.Color(),
    night: 0, moon: 0, stars: 0, starBright: 0, sunDir: new THREE.Vector3() };
}
