import * as THREE from './three.module.min.js';
import { U, GLSL_NOISE } from './materials.js';
import { clamp, smoothstep } from './noise.js';

// Golden hour -> blue hour -> night over DAY_LENGTH seconds of real time.
export const DAY_LENGTH = 1200;

const KEYS = [
  { e: 14, sun: [1.0, 0.80, 0.56], sunI: 3.3, hs: [0.62, 0.68, 0.86], hg: [0.55, 0.42, 0.30], hI: 1.45, fog: [0.96, 0.79, 0.60], near: 140, far: 760, hor: [1.0, 0.79, 0.55], zen: [0.30, 0.50, 0.86] },
  { e: 5, sun: [1.0, 0.60, 0.33], sunI: 3.0, hs: [0.56, 0.56, 0.80], hg: [0.52, 0.36, 0.28], hI: 1.3, fog: [0.97, 0.64, 0.46], near: 110, far: 620, hor: [1.0, 0.56, 0.33], zen: [0.26, 0.36, 0.72] },
  { e: 0, sun: [1.0, 0.43, 0.26], sunI: 1.9, hs: [0.52, 0.44, 0.72], hg: [0.42, 0.28, 0.30], hI: 1.05, fog: [0.80, 0.47, 0.46], near: 80, far: 430, hor: [0.96, 0.43, 0.36], zen: [0.19, 0.22, 0.52] },
  { e: -4, sun: [0.60, 0.42, 0.62], sunI: 0.0, hs: [0.30, 0.31, 0.56], hg: [0.18, 0.16, 0.26], hI: 0.8, fog: [0.30, 0.28, 0.48], near: 45, far: 260, hor: [0.42, 0.30, 0.50], zen: [0.08, 0.10, 0.28] },
  { e: -8, sun: [0.45, 0.56, 0.95], sunI: 0.35, hs: [0.17, 0.23, 0.46], hg: [0.06, 0.07, 0.12], hI: 0.55, fog: [0.10, 0.15, 0.30], near: 18, far: 150, hor: [0.12, 0.17, 0.34], zen: [0.03, 0.05, 0.15] },
  { e: -12, sun: [0.40, 0.52, 0.92], sunI: 0.4, hs: [0.12, 0.17, 0.38], hg: [0.04, 0.05, 0.09], hI: 0.42, fog: [0.05, 0.08, 0.17], near: 8, far: 95, hor: [0.06, 0.10, 0.22], zen: [0.01, 0.02, 0.07] },
];

function sample(e) {
  let a = KEYS[0], b = KEYS[0], t = 0;
  if (e >= KEYS[0].e) { a = b = KEYS[0]; }
  else if (e <= KEYS[KEYS.length - 1].e) { a = b = KEYS[KEYS.length - 1]; }
  else {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (e <= KEYS[i].e && e >= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; t = (KEYS[i].e - e) / (KEYS[i].e - KEYS[i + 1].e); break; }
    }
  }
  const L = (x, y) => x + (y - x) * t;
  const LA = (x, y) => [L(x[0], y[0]), L(x[1], y[1]), L(x[2], y[2])];
  return {
    sun: LA(a.sun, b.sun), sunI: L(a.sunI, b.sunI), hs: LA(a.hs, b.hs), hg: LA(a.hg, b.hg), hI: L(a.hI, b.hI),
    fog: LA(a.fog, b.fog), near: L(a.near, b.near), far: L(a.far, b.far), hor: LA(a.hor, b.hor), zen: LA(a.zen, b.zen),
  };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    // Sun sets behind the great lighthouse as seen from the first island.
    this.sunAz = new THREE.Vector3(-0.3, 0, -0.95).normalize();
    this.moonDir = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.elev = 14;
    this.night = 0;

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
      uMoonDir: { value: this.moonDir.clone() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
      uNight: U.uNight,
      uTime: U.uTime,
      uFogColor: U.uFogColor,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `${GLSL_NOISE}
        uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunCol, uFogColor; uniform float uNight, uTime; varying vec3 vDir;
        float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.6, h));
          float sd = max(dot(d, uSunDir), 0.0);
          float glow = pow(sd, 5.0);
          // gentle cel banding in the sunset glow
          glow = mix(glow, floor(glow * 6.0 + 0.5) / 6.0, 0.35);
          col += uSunCol * glow * 0.35 * (1.0 - uNight * 0.9);
          float disk = smoothstep(0.99905, 0.9994, sd);
          col += uSunCol * disk * 5.0 * smoothstep(-0.04, 0.0, h);
          // flat stylised clouds
          if (h > 0.0) {
            vec2 cp = d.xz / (h + 0.15) * 1.3 + vec2(uTime * 0.004, uTime * 0.002);
            float c = vnoise(cp) * 0.6 + vnoise(cp * 2.3 + 5.0) * 0.3 + vnoise(cp * 5.1) * 0.1;
            float cl = smoothstep(0.585, 0.6, c) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.5, 0.9, h));
            vec3 cloudLit = mix(uHorizon * 1.05 + uSunCol * 0.28, vec3(1.0, 0.93, 0.85) * 0.9, 0.25);
            vec3 cloudCol = mix(cloudLit, uZenith * 1.9 + vec3(0.02, 0.03, 0.06), uNight);
            float edge = smoothstep(0.6, 0.63, c);
            cloudCol = mix(cloudCol * 0.92 + uSunCol * glow * 0.4, cloudCol, edge);
            col = mix(col, cloudCol, cl * 0.92);
          }
          // stars
          if (uNight > 0.01 && h > 0.0) {
            vec3 sp = d * 260.0; vec3 ip = floor(sp);
            float r = hash13(ip);
            float star = step(0.9965, r) * smoothstep(0.32, 0.05, length(fract(sp) - 0.5));
            float tw = 0.7 + 0.3 * sin(uTime * 3.0 + r * 500.0);
            col += vec3(0.9, 0.95, 1.0) * star * uNight * 1.6 * tw * smoothstep(0.0, 0.25, h);
          }
          float md = dot(d, uMoonDir);
          col += vec3(0.95, 0.96, 1.0) * smoothstep(0.99935, 0.99955, md) * uNight * 2.2;
          col += vec3(0.3, 0.4, 0.7) * pow(max(md, 0.0), 60.0) * uNight * 0.3;
          col = mix(uFogColor, col, smoothstep(-0.03, 0.14, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.light = new THREE.DirectionalLight(0xffffff, 3);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const sc = this.light.shadow.camera;
    sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58; sc.near = 1; sc.far = 400;
    this.light.shadow.bias = -0.0006;
    this.light.shadow.normalBias = 0.04;
    scene.add(this.light);
    scene.add(this.light.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
  }

  // t: seconds since dusk began. focus: player position for shadow camera.
  update(t, focus, camera, clear = 0) {
    const p = clamp(t / DAY_LENGTH, 0, 1);
    const e = 14 - 26 * p;
    this.elev = e;
    const s = sample(e);
    const er = e * Math.PI / 180;
    this.sunDir.set(this.sunAz.x * Math.cos(er), Math.sin(er), this.sunAz.z * Math.cos(er)).normalize();
    this.night = smoothstep(1, -9, e);
    U.uNight.value = this.night;

    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.uniforms.uZenith.value.setRGB(s.zen[0], s.zen[1], s.zen[2]);
    this.uniforms.uHorizon.value.setRGB(s.hor[0], s.hor[1], s.hor[2]);
    this.uniforms.uSunCol.value.setRGB(s.sun[0], s.sun[1], s.sun[2]);

    const useMoon = e < -4;
    this.lightDir.copy(useMoon ? this.moonDir : this.sunDir);
    if (!useMoon && this.lightDir.y < 0.06) { this.lightDir.y = 0.06; this.lightDir.normalize(); }
    this.light.color.setRGB(s.sun[0], s.sun[1], s.sun[2]);
    this.light.intensity = s.sunI;
    this.hemi.color.setRGB(s.hs[0], s.hs[1], s.hs[2]);
    this.hemi.groundColor.setRGB(s.hg[0], s.hg[1], s.hg[2]);
    this.hemi.intensity = s.hI;

    // Fog closes in at night; the finale clears the air so the sky links are seen.
    const near = s.near + (220 - s.near) * clear, far = s.far + (900 - s.far) * clear;
    U.uFogColor.value.setRGB(s.fog[0], s.fog[1], s.fog[2]);
    U.uFogNear.value = near;
    U.uFogFar.value = far;
    const fog = this.scene.fog;
    fog.color.copy(U.uFogColor.value);
    fog.near = near; fog.far = far;

    // shadow camera follows the player, snapped to texels to avoid shimmer
    const texel = 116 / 2048;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.light.target.position.set(fx, focus.y, fz);
    this.light.position.set(fx + this.lightDir.x * 180, focus.y + this.lightDir.y * 180, fz + this.lightDir.z * 180);
    this.light.target.updateMatrixWorld();
    this.dome.position.copy(camera.position);
  }
}
