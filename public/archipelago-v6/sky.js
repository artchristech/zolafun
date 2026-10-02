// Five Lights — golden hour to night: sky dome, sun/moon light, fog, palettes.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smoothstep } from './util.js';

const KEYS = [
  // t, skyTop, horizon, sunCol, sunI, hemiSky, hemiGround, hemiI, fog, fogNear, fogFar, deep, shallow
  { t: 0.0, top: [0.32, 0.48, 0.74], hor: [1.0, 0.72, 0.42], sun: [1.0, 0.78, 0.5], sunI: 3.0, hs: [0.85, 0.72, 0.62], hg: [0.42, 0.3, 0.22], hI: 1.05, fog: [0.98, 0.76, 0.55], near: 90, far: 700, deep: [0.07, 0.3, 0.45], shal: [0.25, 0.72, 0.68] },
  { t: 0.5, top: [0.27, 0.32, 0.58], hor: [1.0, 0.5, 0.28], sun: [1.0, 0.55, 0.28], sunI: 2.4, hs: [0.8, 0.55, 0.55], hg: [0.35, 0.22, 0.2], hI: 0.9, fog: [0.92, 0.55, 0.42], near: 70, far: 520, deep: [0.08, 0.2, 0.38], shal: [0.3, 0.55, 0.6] },
  { t: 0.75, top: [0.1, 0.12, 0.3], hor: [0.55, 0.3, 0.42], sun: [0.95, 0.35, 0.3], sunI: 0.8, hs: [0.35, 0.33, 0.55], hg: [0.15, 0.12, 0.18], hI: 0.6, fog: [0.32, 0.27, 0.42], near: 35, far: 260, deep: [0.04, 0.08, 0.2], shal: [0.12, 0.25, 0.38] },
  { t: 0.88, top: [0.03, 0.05, 0.14], hor: [0.12, 0.13, 0.28], sun: [0.45, 0.55, 0.9], sunI: 0.3, hs: [0.18, 0.24, 0.45], hg: [0.05, 0.06, 0.1], hI: 0.42, fog: [0.08, 0.1, 0.2], near: 14, far: 110, deep: [0.02, 0.04, 0.1], shal: [0.05, 0.12, 0.22] },
  { t: 1.0, top: [0.01, 0.02, 0.06], hor: [0.05, 0.07, 0.17], sun: [0.4, 0.5, 0.85], sunI: 0.22, hs: [0.12, 0.17, 0.34], hg: [0.03, 0.04, 0.07], hI: 0.32, fog: [0.035, 0.05, 0.11], near: 8, far: 70, deep: [0.01, 0.025, 0.07], shal: [0.03, 0.08, 0.16] },
];

function sample(t) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  const k = clamp((t - a.t) / (b.t - a.t || 1), 0, 1);
  const out = {};
  for (const key of Object.keys(a)) {
    if (key === 't') continue;
    out[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lerp(a[key], b[key], k);
  }
  return out;
}

export class Sky {
  constructor(scene, starDir) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 320;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xffffff, 80, 600);
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir }, uSunCol: { value: new THREE.Color() },
      uNight: { value: 0 }, uStar: { value: starDir.clone().normalize() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHor, uSunDir, uSunCol, uStar; uniform float uNight;
        varying vec3 vDir;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          float k = pow(clamp(y, 0.0, 1.0), 0.45);
          vec3 col = mix(uHor, uTop, k);
          col = mix(col, uHor * 0.6, clamp(-y * 4.0, 0.0, 1.0));
          // banded sun halo and hard disc
          float sd = dot(d, normalize(uSunDir));
          float halo = smoothstep(0.80, 1.0, sd);
          col += uSunCol * (floor(halo * 4.0) / 4.0) * 0.35 * (1.0 - uNight);
          col += uSunCol * step(0.9985, sd) * 4.0 * (1.0 - uNight * 0.9);
          // painted cloud streaks near the horizon
          float cl = sin(d.x * 9.0 + sin(d.z * 7.0) * 2.0) * sin(d.z * 5.0 + d.x * 3.0);
          float band = step(0.55, cl) * smoothstep(0.02, 0.1, y) * (1.0 - smoothstep(0.18, 0.3, y));
          col = mix(col, mix(uHor * 1.15, uTop * 1.6, 0.3), band * 0.45);
          // stars
          vec3 c = floor(d * 160.0);
          float s = step(0.996, h3(c)) * smoothstep(0.0, 0.25, y);
          col += vec3(0.9, 0.95, 1.0) * s * uNight * 1.4;
          // the guiding star the observatory was built to watch
          float gs = dot(d, uStar);
          col += vec3(1.0, 0.75, 0.55) * (step(0.99993, gs) * 3.0 + smoothstep(0.9990, 1.0, gs) * 0.6) * (0.35 + uNight);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);
    this.night = 0;
    this.state = sample(0);
  }

  update(t, focus, camera, water) {
    const s = this.state = sample(t);
    // sun sinks in the west-north-west; moon takes over after it sets
    const el = lerp(0.3, -0.16, smoothstep(0, 0.9, t));
    const az = lerp(-2.25, -2.45, t);
    const sunV = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const moonV = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
    const mk = smoothstep(0.8, 0.9, t);
    this.sunDir.copy(sunV);
    const lightDir = sunV.clone();
    lightDir.y = Math.max(lightDir.y, 0.12);
    lightDir.lerp(moonV, mk).normalize();
    this.night = smoothstep(0.65, 0.95, t);
    this.sun.color.setRGB(...s.sun);
    this.sun.intensity = s.sunI;
    // shadows follow the focus, snapped to texels to stop shimmering
    const texel = 96 / 4096;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 150, focus.y + lightDir.y * 150, fz + lightDir.z * 150);
    this.sun.target.updateMatrixWorld();
    this.hemi.color.setRGB(...s.hs);
    this.hemi.groundColor.setRGB(...s.hg);
    this.hemi.intensity = s.hI;
    this.scene.fog.color.setRGB(...s.fog);
    this.scene.fog.near = s.near;
    this.scene.fog.far = s.far;
    const u = this.uniforms;
    u.uTop.value.setRGB(...s.top);
    u.uHor.value.setRGB(...s.hor);
    u.uSunCol.value.setRGB(...s.sun);
    u.uNight.value = this.night;
    this.dome.position.copy(camera.position);
    if (water) {
      const w = water.material.uniforms;
      w.uSunDir.value.copy(sunV);
      w.uSunCol.value.setRGB(...s.sun).multiplyScalar(1 - this.night * 0.8);
      w.uSky.value.setRGB(...s.hor);
      w.uDeep.value.setRGB(...s.deep);
      w.uShallow.value.setRGB(...s.shal);
      w.uFoam.value.setRGB(1, 0.95, 0.85).multiplyScalar(lerp(1, 0.25, this.night));
    }
  }
}
