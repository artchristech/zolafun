// Time of day over 20 minutes: sky dome, sun/moon light with player-following shadows, fog, grading.
import * as THREE from './three.module.min.js';
import { clamp, smoothstep } from './util.js';
import { starDir } from './layout.js';

const K = (k, o) => Object.assign({ k }, o);
const C = (h) => new THREE.Color(h);
// keyframes over the 20-minute evening
const KEYS = [
  K(0.0, { elev: 15, zen: C('#4f86c6'), hor: C('#f8cf8f'), sun: C('#ffc98a'), sunI: 2.7, hemiS: C('#9fb6d6'), hemiG: C('#7a6448'), hemiI: 1.05, fog: C('#efc596'), fogD: 0.0015, exp: 1.0, bloom: 0.22, sat: 1.12 }),
  K(0.4, { elev: 5, zen: C('#3d5f9e'), hor: C('#f99a5e'), sun: C('#ff9a55'), sunI: 2.3, hemiS: C('#8f9ac8'), hemiG: C('#6e4a3a'), hemiI: 0.95, fog: C('#e9946a'), fogD: 0.0021, exp: 1.02, bloom: 0.3, sat: 1.16 }),
  K(0.58, { elev: -1.5, zen: C('#2a3a78'), hor: C('#d06d6a'), sun: C('#ff6a40'), sunI: 0.7, hemiS: C('#6a6fae'), hemiG: C('#3e3048'), hemiI: 0.7, fog: C('#7a5e86'), fogD: 0.0042, exp: 1.06, bloom: 0.55, sat: 1.1 }),
  K(0.78, { elev: -7, zen: C('#101b45'), hor: C('#2e3f78'), sun: C('#7f8fd8'), sunI: 0.35, hemiS: C('#38508e'), hemiG: C('#141a30'), hemiI: 0.42, fog: C('#1b2a55'), fogD: 0.0085, exp: 1.12, bloom: 0.85, sat: 1.0 }),
  K(1.0, { elev: -12, zen: C('#040917'), hor: C('#0e1d45'), sun: C('#7b92e0'), sunI: 0.26, hemiS: C('#22356a'), hemiG: C('#0a0e1c'), hemiI: 0.3, fog: C('#0a1531'), fogD: 0.0135, exp: 1.18, bloom: 1.05, sat: 0.95 }),
];

function sample(k) {
  k = clamp(k, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && k > KEYS[i + 1].k) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(a.k, b.k, k);
  const out = {};
  for (const key in a) {
    if (key === 'k') continue;
    const va = a[key], vb = b[key];
    out[key] = va.isColor ? va.clone().lerp(vb, t) : va + (vb - va) * t;
  }
  return out;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.sunAz = (195 * Math.PI) / 180;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3(0.35, 0.82, 0.45).normalize();
    this.lightDir = new THREE.Vector3();
    this.night = 0;
    this.state = sample(0);

    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir }, uSunCol: { value: new THREE.Color() }, uNight: { value: 0 },
      uStarDir: { value: new THREE.Vector3(...starDir()) }, uTime: { value: 0 }, uMoonDir: { value: this.moonDir }, uFog: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uStarDir, uMoonDir, uFog; uniform float uNight, uTime; varying vec3 vDir;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
          col = mix(col, uFog, (1.0 - smoothstep(-0.02, 0.14, h)) * 0.85);
          float sd = dot(d, uSunDir);
          col += uSunCol * (pow(max(sd, 0.0), 8.0) * 0.35 + pow(max(sd, 0.0), 90.0) * 0.6);
          col += uSunCol * smoothstep(0.9988, 0.9992, sd) * 6.0;
          // stylised clouds (Wind Waker-ish flat bands)
          vec2 cp = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.004, 0.0);
          float c = vn(cp) * 0.6 + vn(cp * 2.3) * 0.4;
          float cm = step(0.62, c) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.55, 0.8, h));
          vec3 cc = mix(uHorizon * 1.25 + uSunCol * 0.15, uZenith * 1.6, uNight);
          col = mix(col, cc, cm * 0.75);
          // stars
          vec3 q = d * 220.0; vec3 cell = floor(q);
          float st = h31(cell);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
          float star = step(0.9975, st) * smoothstep(0.55, 0.0, length(fract(q) - 0.5)) * tw;
          col += vec3(0.9, 0.95, 1.2) * star * uNight * smoothstep(-0.02, 0.15, h) * (1.0 - cm) * 2.5;
          // the evening star: visible from the start, brightest at night
          float es = dot(d, uStarDir);
          col += vec3(1.3, 1.2, 1.0) * (smoothstep(0.99985, 0.99995, es) * (3.0 + 6.0 * uNight) + pow(max(es, 0.0), 2000.0) * (0.4 + 1.6 * uNight));
          // moon
          float md = dot(d, uMoonDir);
          col += vec3(0.8, 0.85, 1.0) * smoothstep(0.9993, 0.9995, md) * 1.6 * uNight + vec3(0.2, 0.25, 0.45) * pow(max(md, 0.0), 30.0) * 0.4 * uNight;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.castShadow = true;
    const sc = this.light.shadow.camera;
    this.shadowHalf = 42;
    sc.left = -this.shadowHalf; sc.right = this.shadowHalf; sc.top = this.shadowHalf; sc.bottom = -this.shadowHalf;
    sc.near = 1; sc.far = 400;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.035;
    scene.add(this.light);
    scene.add(this.light.target);
    scene.fog = new THREE.FogExp2(0xffffff, 0.002);
    this.texel = (this.shadowHalf * 2) / 2048;
  }

  update(k, focus, camera, time) {
    const s = (this.state = sample(k));
    const el = (s.elev * Math.PI) / 180;
    this.sunDir.set(Math.cos(el) * Math.cos(this.sunAz), Math.sin(el), Math.cos(el) * Math.sin(this.sunAz));
    this.night = smoothstep(0.5, 0.92, k);
    // light direction slides from sun to moon through dusk; keep it above the horizon for shadows
    this.lightDir.copy(this.sunDir).lerp(this.moonDir, smoothstep(0.45, 0.8, k));
    if (this.lightDir.y < 0.12) this.lightDir.y = 0.12;
    this.lightDir.normalize();
    this.light.color.copy(s.sun);
    this.light.intensity = s.sunI;
    this.hemi.color.copy(s.hemiS);
    this.hemi.groundColor.copy(s.hemiG);
    this.hemi.intensity = s.hemiI;
    this.scene.fog.color.copy(s.fog);
    this.scene.fog.density = s.fogD;
    const u = this.uniforms;
    u.uZenith.value.copy(s.zen);
    u.uHorizon.value.copy(s.hor);
    u.uFog.value.copy(s.fog);
    u.uSunCol.value.copy(s.sun).multiplyScalar(smoothstep(-6, 2, s.elev) * 1.4);
    u.uNight.value = this.night;
    u.uTime.value = time;
    this.dome.position.copy(camera.position);
    // shadow box follows the focus, snapped to texels to avoid shimmering
    const L = this.light;
    const t = this.texel;
    const fx = Math.round(focus.x / t) * t, fy = Math.round(focus.y / t) * t, fz = Math.round(focus.z / t) * t;
    L.target.position.set(fx, fy, fz);
    L.position.set(fx + this.lightDir.x * 150, fy + this.lightDir.y * 150, fz + this.lightDir.z * 150);
    L.target.updateMatrixWorld();
  }

  setShadowHalf(h) {
    const sc = this.light.shadow.camera;
    sc.left = -h; sc.right = h; sc.top = h; sc.bottom = -h;
    sc.updateProjectionMatrix();
  }
}
