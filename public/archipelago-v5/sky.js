// Five Lights — sky dome and the 20-minute sunset.
import * as THREE from './three.module.min.js';
import { shared, srgb, lerp, smoothstep, GLSL_NOISE } from './util.js';

export const DAY_LENGTH = 20 * 60; // seconds from golden hour to night

// keyframes over t in [0,1]
const K = [
  { t: 0.0, el: 13, sun: [1.0, 0.84, 0.62], si: 2.9, top: [0.36, 0.55, 0.82], hor: [1.0, 0.8, 0.56], hi: 1.15, hs: [0.95, 0.85, 0.75], hg: [0.45, 0.36, 0.26], fn: 140, ff: 950 },
  { t: 0.35, el: 6, sun: [1.0, 0.68, 0.4], si: 2.5, top: [0.34, 0.44, 0.74], hor: [1.0, 0.64, 0.42], hi: 1.0, hs: [0.95, 0.75, 0.68], hg: [0.42, 0.3, 0.24], fn: 120, ff: 820 },
  { t: 0.55, el: 0.6, sun: [1.0, 0.46, 0.26], si: 1.4, top: [0.27, 0.3, 0.58], hor: [0.98, 0.48, 0.36], hi: 0.8, hs: [0.75, 0.6, 0.7], hg: [0.3, 0.22, 0.24], fn: 90, ff: 600 },
  { t: 0.68, el: -4, sun: [0.85, 0.42, 0.44], si: 0.25, top: [0.12, 0.15, 0.36], hor: [0.5, 0.34, 0.46], hi: 0.55, hs: [0.45, 0.48, 0.72], hg: [0.16, 0.14, 0.22], fn: 45, ff: 300 },
  { t: 0.82, el: -9, sun: [0.3, 0.32, 0.55], si: 0.0, top: [0.04, 0.065, 0.17], hor: [0.12, 0.16, 0.32], hi: 0.34, hs: [0.3, 0.38, 0.7], hg: [0.06, 0.07, 0.12], fn: 18, ff: 150 },
  { t: 1.0, el: -14, sun: [0.2, 0.25, 0.45], si: 0.0, top: [0.016, 0.026, 0.075], hor: [0.04, 0.06, 0.13], hi: 0.22, hs: [0.25, 0.32, 0.62], hg: [0.03, 0.035, 0.07], fn: 8, ff: 88 },
];
const SUN_AZ = Math.atan2(-0.6, -0.8);
export const STAR = (() => {
  // the evening star the observatory telescope is meant to find (azimuth notch 5 of 12, 30° up)
  const az = (5 / 12) * Math.PI * 2, el = (30 * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
})();

export class Sky {
  constructor(scene) {
    this.env = {
      sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), sunInt: 0,
      skyTop: new THREE.Color(), skyHor: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiInt: 0,
      fogColor: new THREE.Color(), fogNear: 100, fogFar: 800, night: 0,
    };
    const geo = new THREE.SphereGeometry(1800, 32, 16);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uTop: shared.uSkyTop, uHor: shared.uSkyHorizon, uNight: shared.uNight, uTime: shared.uTime, uStar: { value: STAR } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uSunDir, uSunColor, uTop, uHor, uStar; uniform float uNight, uTime; varying vec3 vDir;
        ${GLSL_NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          float t = pow(clamp(y, 0.0, 1.0), 0.45);
          vec3 col = mix(uHor, uTop, t);
          // glow around the sun, low band of warm haze
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          float sunUp = smoothstep(-0.25, 0.05, uSunDir.y);
          col += uSunColor * (pow(sd, 6.0) * 0.55 + pow(sd, 48.0) * 0.8) * sunUp;
          col = mix(col, uHor * 0.85, smoothstep(0.02, -0.12, y));
          // cel sun disc
          float disc = step(0.9993, sd);
          col = mix(col, vec3(1.6, 1.25, 0.9) * 2.4, disc * smoothstep(-0.06, 0.02, uSunDir.y + 0.02));
          // banded stylised clouds
          vec2 cp = d.xz / max(y + 0.12, 0.05) * 1.4 + vec2(uTime * 0.004, 0.0);
          float c = fbm(cp);
          float band = smoothstep(0.02, 0.18, y) * smoothstep(0.65, 0.25, y);
          float cl = step(0.6, c) * band;
          vec3 cloudLit = mix(uHor * 1.15, uSunColor * 1.4 + uHor * 0.4, pow(sd, 3.0) * sunUp);
          col = mix(col, mix(cloudLit, uTop * 0.7, uNight), cl * 0.85);
          // stars
          vec3 sp = d * 220.0;
          float st = step(0.9965, h21(floor(sp.xz + sp.y * 3.7))) * smoothstep(0.05, 0.3, y);
          col += vec3(0.9, 0.95, 1.0) * st * uNight * 1.5;
          // evening star, visible from golden hour on
          float es = smoothstep(0.99994, 0.99999, dot(d, normalize(uStar)));
          float esHalo = pow(max(dot(d, normalize(uStar)), 0.0), 3000.0);
          col += vec3(1.0, 0.95, 0.85) * (es * 6.0 + esHalo * 1.2) * (0.55 + uNight * 1.4);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);
    this._a = new THREE.Color(); this._b = new THREE.Color();
  }

  // t: 0 golden hour → 1 night
  update(t, camPos) {
    t = Math.min(Math.max(t, 0), 1);
    let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
    const A = K[i], B = K[i + 1];
    const f = smoothstep(A.t, B.t, t);
    const e = this.env;
    const el = (lerp(A.el, B.el, f) * Math.PI) / 180;
    e.sunDir.set(Math.cos(SUN_AZ) * Math.cos(el), Math.sin(el), Math.sin(SUN_AZ) * Math.cos(el));
    const mix = (c, a, b) => c.copy(srgb(...a)).lerp(srgb(...b), f);
    mix(e.sunColor, A.sun, B.sun);
    mix(e.skyTop, A.top, B.top);
    mix(e.skyHor, A.hor, B.hor);
    mix(e.hemiSky, A.hs, B.hs);
    mix(e.hemiGround, A.hg, B.hg);
    e.sunInt = lerp(A.si, B.si, f);
    e.hemiInt = lerp(A.hi, B.hi, f);
    e.fogNear = lerp(A.fn, B.fn, f);
    e.fogFar = lerp(A.ff, B.ff, f);
    e.night = smoothstep(0.55, 0.9, t);
    e.fogColor.copy(e.skyHor).lerp(e.skyTop, 0.25 + e.night * 0.35);
    shared.uSunDir.value.copy(e.sunDir);
    shared.uSunColor.value.copy(e.sunColor);
    shared.uSkyTop.value.copy(e.skyTop);
    shared.uSkyHorizon.value.copy(e.skyHor);
    shared.uNight.value = e.night;
    shared.uFogColor.value.copy(e.fogColor);
    shared.uFogNear.value = e.fogNear;
    shared.uFogFar.value = e.fogFar;
    if (camPos) this.mesh.position.copy(camPos);
    return e;
  }
}
