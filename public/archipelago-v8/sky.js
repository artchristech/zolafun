// Sky dome, sun/moon light, hemisphere light, fog and the 20-minute sunset.
import * as THREE from './three.module.min.js';
import { U, GLSL_NOISE } from './materials.js';
import { clamp, lerp, smooth, DEG } from './util.js';
import { OBS } from './layout.js';

export const DAY_LENGTH = 20 * 60;

const K = [0, 0.45, 0.72, 1.0];
const C = (h) => new THREE.Color(h);
const PAL = {
  sun: [C(0xffcf8a), C(0xff9248), C(0x9a5a7a), C(0x5a74b8)],
  sunI: [2.9, 2.4, 0.55, 0.32],
  hemiSky: [C(0xa8c8e8), C(0xf0aa80), C(0x5a5a96), C(0x1b2a55)],
  hemiGround: [C(0xc8a070), C(0xa0604a), C(0x2e2848), C(0x0a1020)],
  hemiI: [1.35, 1.15, 0.6, 0.32],
  top: [C(0x4a7fc4), C(0x3f5c9c), C(0x202c5c), C(0x060b1e)],
  hor: [C(0xffd9a0), C(0xff9a5c), C(0x7a4f78), C(0x15213f)],
  fogNear: [180, 140, 50, 12],
  fogFar: [900, 700, 240, 92],
  shallow: [C(0x52c7c0), C(0x4fb0b0), C(0x2d6a7e), C(0x10304a)],
  deep: [C(0x1d6fa8), C(0x245e98), C(0x1a3a6a), C(0x081a36)],
  fire: [1.7, 2.0, 3.2, 4.2],
  bloom: [0.35, 0.5, 0.9, 1.15],
  thresh: [2.2, 1.9, 1.15, 0.95],
};
function samp(arr, p) {
  for (let i = 0; i < K.length - 1; i++) {
    if (p <= K[i + 1]) {
      const t = (p - K[i]) / (K[i + 1] - K[i]);
      const a = arr[i], b = arr[i + 1];
      return a.isColor ? a.clone().lerp(b, t) : lerp(a, b, t);
    }
  }
  const l = arr[arr.length - 1];
  return l.isColor ? l.clone() : l;
}

export class Sky {
  constructor(scene) {
    this.sunDir = new THREE.Vector3();
    const ea = OBS.azCorrect * 45 * DEG, ee = OBS.elAngles[OBS.elCorrect] * DEG;
    this.starDir = new THREE.Vector3(Math.cos(ee) * Math.cos(ea), Math.sin(ee), Math.cos(ee) * Math.sin(ea));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
        uSunDir: { value: this.sunDir }, uStarDir: { value: this.starDir }, uNight: U.uNight, uTime: U.uTime, uSunUp: { value: 1 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
uniform vec3 uTop, uHor, uSunCol, uSunDir, uStarDir; uniform float uNight, uTime, uSunUp;
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.5));
  if (y < 0.0) col = uHor * mix(1.0, 0.75, clamp(-y * 5.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 48.0) * 0.7 + pow(sd, 6.0) * 0.25) * uSunUp;
  col = mix(col, uSunCol * 3.5, step(0.99935, sd) * uSunUp);
  // cel clouds near the horizon
  vec2 cp = d.xz / (max(y, 0.02) + 0.25);
  float c = fbm(cp * 1.1 + vec2(uTime * 0.006, uTime * 0.002));
  float band = smoothstep(0.0, 0.07, y) * (1.0 - smoothstep(0.22, 0.42, y));
  float cm = step(0.56, c * (0.55 + band * 0.7));
  float lit = step(0.6, fbm(cp * 1.1 + vec2(uTime * 0.006 + 0.06, uTime * 0.002 + 0.04)) + dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4)) * 0.15);
  vec3 cc = mix(mix(uTop, uHor, 0.55) * 0.95, uHor * 1.25 + uSunCol * 0.35 * uSunUp, lit);
  col = mix(col, cc, cm * band * 0.92);
  // stars
  vec3 sp = floor(d * 260.0);
  float hs = fract(sin(dot(sp, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float star = step(0.9975, hs) * smoothstep(0.04, 0.25, y);
  col += vec3(star) * uNight * (0.6 + 0.6 * sin(uTime * 2.0 + hs * 50.0));
  // the evening star the telescope must find
  float es = dot(d, uStarDir);
  col += vec3(1.0, 0.95, 0.85) * (step(0.99993, es) * 4.0 + pow(max(es, 0.0), 3000.0) * 2.0) * clamp(uNight * 1.4 + 0.3, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const S = 70;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 420 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    this.shadowSpan = S * 2;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xffffff, 100, 800);
    this.scene = scene;
    this.state = {};
    this.lastDir = new THREE.Vector3(0, -1, 0);
  }

  // p: 0 golden hour .. 1 night
  update(p, focus) {
    p = clamp(p, 0, 1);
    const elev = lerp(13, -9, p) * DEG;
    const az = 196 * DEG + p * 14 * DEG;
    const sunDir = new THREE.Vector3(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
    this.sunDir.copy(sunDir);
    const night = smooth(0.55, 0.95, p);
    U.uNight.value = night;
    // light direction: the sun, blending to a high moon once it sets
    const moon = new THREE.Vector3(0.45, 0.75, -0.48).normalize();
    const ld = sunDir.clone();
    ld.y = Math.max(ld.y, 0.12);
    ld.normalize().lerp(moon, smooth(0.5, 0.85, p)).normalize();
    // only move the light in small steps so shadows do not crawl
    if (ld.angleTo(this.lastDir) > 0.004) this.lastDir.copy(ld);
    const sunCol = samp(PAL.sun, p);
    this.sun.color.copy(sunCol);
    this.sun.intensity = samp(PAL.sunI, p);
    this.hemi.color.copy(samp(PAL.hemiSky, p));
    this.hemi.groundColor.copy(samp(PAL.hemiGround, p));
    this.hemi.intensity = samp(PAL.hemiI, p);
    const hor = samp(PAL.hor, p), top = samp(PAL.top, p);
    this.mat.uniforms.uTop.value.copy(top);
    this.mat.uniforms.uHor.value.copy(hor);
    this.mat.uniforms.uSunCol.value.copy(sunCol).multiplyScalar(1 - night * 0.7);
    this.mat.uniforms.uSunUp.value = smooth(-0.12, 0.02, Math.sin(elev));
    const fogC = hor.clone().lerp(top, 0.25);
    this.scene.fog.color.copy(fogC);
    this.scene.fog.near = samp(PAL.fogNear, p);
    this.scene.fog.far = samp(PAL.fogFar, p);
    U.uFogColor.value.copy(fogC);
    U.uFogNear.value = this.scene.fog.near;
    U.uFogFar.value = this.scene.fog.far;
    U.uFireHDR.value = samp(PAL.fire, p);
    this.state = {
      shallow: samp(PAL.shallow, p), deep: samp(PAL.deep, p), sky: hor.clone().lerp(top, 0.4), sunCol, night,
      bloom: samp(PAL.bloom, p), thresh: samp(PAL.thresh, p),
    };
    this.placeShadow(focus);
    return this.state;
  }

  // Keep the shadow camera on the player but snapped to whole shadow texels.
  placeShadow(focus) {
    const dir = this.lastDir;
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const up2 = new THREE.Vector3().crossVectors(dir, right).normalize();
    const texel = this.shadowSpan / this.sun.shadow.mapSize.x;
    const u = Math.round(focus.dot(right) / texel) * texel;
    const v = Math.round(focus.dot(up2) / texel) * texel;
    const w = focus.dot(dir);
    const c = right.multiplyScalar(u).add(up2.multiplyScalar(v)).add(dir.clone().multiplyScalar(w));
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(dir, 200);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }
}
