// Sky dome, sun/moon, fog and the 20 minute golden-hour-to-night cycle.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smoothstep } from './math.js';

export const DAY_LENGTH = 20 * 60; // seconds of real time from golden hour to night

// keyframes over normalised time
const KEYS = [
  { t: 0.0, elev: 13, sun: 0xffd9a8, sunI: 3.2, top: 0x5f9fd8, hor: 0xffd7a0, amb: 0xbfd6f0, gnd: 0xb59a74, ambI: 1.15, fog: 0xf2d2a8, near: 80, far: 700, exp: 1.0 },
  { t: 0.35, elev: 6, sun: 0xffb46a, sunI: 3.0, top: 0x5585c8, hor: 0xffb878, amb: 0xb4c6e6, gnd: 0xa88a66, ambI: 1.05, fog: 0xf0b884, near: 70, far: 620, exp: 1.0 },
  { t: 0.55, elev: 0.5, sun: 0xff7a44, sunI: 2.2, top: 0x3a5c9c, hor: 0xff8e62, amb: 0x9aa4d0, gnd: 0x886a5a, ambI: 0.85, fog: 0xd9906e, near: 50, far: 480, exp: 1.05 },
  { t: 0.66, elev: -4, sun: 0xd06a78, sunI: 0.9, top: 0x28386e, hor: 0xb86a78, amb: 0x7a7cb4, gnd: 0x4a4050, ambI: 0.6, fog: 0x7a5a7a, near: 30, far: 330, exp: 1.1 },
  { t: 0.78, elev: -9, sun: 0x6070b8, sunI: 0.45, top: 0x141e48, hor: 0x3c4a84, amb: 0x4a5a98, gnd: 0x1c2030, ambI: 0.35, fog: 0x2a3462, near: 14, far: 190, exp: 1.2 },
  { t: 0.9, elev: -13, sun: 0x5868a8, sunI: 0.32, top: 0x070c26, hor: 0x18224c, amb: 0x34467e, gnd: 0x10121c, ambI: 0.22, fog: 0x121a3a, near: 8, far: 125, exp: 1.25 },
  { t: 1.0, elev: -15, sun: 0x5060a0, sunI: 0.28, top: 0x050920, hor: 0x121a3e, amb: 0x2c3c70, gnd: 0x0c0e18, ambI: 0.2, fog: 0x0e1532, near: 6, far: 110, exp: 1.25 },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function sample(t) {
  t = clamp(t, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = smoothstep(a.t, b.t, t);
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 't') continue;
    if (['sun', 'top', 'hor', 'amb', 'gnd', 'fog'].includes(k)) {
      _ca.setHex(a[k]); _cb.setHex(b[k]);
      out[k] = _ca.clone().lerp(_cb, f);
    } else out[k] = lerp(a[k], b[k], f);
  }
  return out;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.sunAz = (-128 * Math.PI) / 180; // sets over open sea to the south-west
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3(0.45, 0.7, 0.55).normalize();
    this.lightDir = new THREE.Vector3();
    this.night = 0;
    this.flash = 0;

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3() }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: { value: 0 }, uMoonDir: { value: this.moonDir },
      uGround: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uTop, uHor, uSun, uMoonDir, uGround; uniform float uNight, uTime;
        varying vec3 vDir;
        float h21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
          if (h < 0.0) col = mix(uHor, uGround, clamp(-h * 3.0, 0.0, 1.0));
          float sd = dot(d, uSunDir);
          // banded (cel) sun glow
          float g = pow(max(sd, 0.0), 12.0);
          float gb = floor(g * 4.0 + 0.5) / 4.0;
          col += uSun * (gb * 0.35 + pow(max(sd,0.0), 3.0) * 0.18) * (1.0 - uNight);
          // sun disk with hard edge
          float disk = smoothstep(0.9985, 0.9988, sd);
          col = mix(col, uSun * 6.0 + vec3(1.2, 1.0, 0.7), disk * (1.0 - uNight) * step(-0.03, h));
          // stylised clouds: flat banded strips near the horizon
          vec2 cp = d.xz / (h + 0.12);
          float cn = vn(cp * 1.6 + vec2(uTime * 0.01, 0.0)) * 0.6 + vn(cp * 3.7 - vec2(uTime*0.02, 0.0)) * 0.4;
          float band = smoothstep(0.02, 0.1, h) * smoothstep(0.42, 0.16, h);
          float cloud = step(0.62, cn) * band;
          vec3 cloudLit = mix(uHor * 1.25 + uSun * 0.35, uTop * 1.4 + vec3(0.02,0.02,0.05), uNight);
          vec3 cloudShade = mix(mix(uTop, uHor, 0.5) * 0.9, uTop*0.8, uNight);
          float rim = step(0.7, cn);
          col = mix(col, mix(cloudShade, cloudLit, rim), cloud * 0.9);
          // stars
          if (uNight > 0.01 && h > 0.0) {
            vec3 sd3 = d * 180.0;
            vec2 cell = floor(sd3.xz / (sd3.y + 60.0) * 60.0);
            float r = h21(cell);
            float tw = 0.6 + 0.4 * sin(uTime * 3.0 + r * 60.0);
            float star = step(0.985, r) * tw * smoothstep(0.05, 0.3, h) * (1.0 - cloud);
            col += vec3(0.9, 0.95, 1.2) * star * uNight * 1.6;
            // moon
            float md = dot(d, uMoonDir);
            col += vec3(0.9, 0.95, 1.1) * smoothstep(0.9993, 0.9995, md) * uNight * 2.0;
            col += vec3(0.25, 0.3, 0.5) * pow(max(md, 0.0), 40.0) * uNight * 0.6;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const s = this.sun.shadow.camera;
    s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 1; s.far = 500;
    s.updateProjectionMatrix();
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6f0, 0xb59a74, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xf2d2a8, 80, 700);
    this.cur = sample(0);
  }
  // t: 0..1 normalised time of evening
  update(t, focus, camera, time) {
    const k = sample(t);
    this.cur = k;
    const elev = (k.elev * Math.PI) / 180;
    this.sunDir.set(Math.cos(elev) * Math.cos(this.sunAz), Math.sin(elev), Math.cos(elev) * Math.sin(this.sunAz));
    this.night = smoothstep(0.6, 0.86, t);
    // light direction: sun while it is up, then the moon
    const sunUp = smoothstep(-0.02, 0.06, this.sunDir.y);
    const ld = this.sunDir.clone();
    ld.y = Math.max(ld.y, 0.08);
    this.lightDir.copy(ld.normalize()).lerp(this.moonDir, 1 - sunUp).normalize();
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI * (1 + this.flash * 0.6);
    this.hemi.color.copy(k.amb);
    this.hemi.groundColor.copy(k.gnd);
    this.hemi.intensity = k.ambI + this.flash * 0.4;
    this.scene.fog.color.copy(k.fog);
    this.scene.fog.near = k.near;
    this.scene.fog.far = k.far;
    // snap the shadow camera to texel grid around the focus point to keep shadows crisp and stable
    const span = 140 / 4096;
    const fx = Math.round(focus.x / span) * span, fz = Math.round(focus.z / span) * span;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.lightDir.x * 200, focus.y + this.lightDir.y * 200, fz + this.lightDir.z * 200);
    this.sun.target.updateMatrixWorld();
    const u = this.uniforms;
    u.uSunDir.value.copy(this.sunDir);
    u.uTop.value.copy(k.top);
    u.uHor.value.copy(k.hor);
    u.uGround.value.copy(k.fog);
    u.uSun.value.copy(k.sun);
    u.uNight.value = this.night;
    u.uTime.value = time;
    this.dome.position.copy(camera.position);
    this.exposure = k.exp;
  }
}
