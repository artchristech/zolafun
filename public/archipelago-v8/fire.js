// Cel-shaded animated fire (camera-facing flame cards with banded noise) and
// rising embers. Also a pooled smoke-puff system for visible resets.
import * as THREE from './three.module.min.js';
import { U, GLSL_NOISE } from './materials.js';

const flameVert = `
attribute vec2 aCorner;
attribute float aLayer;
uniform float uSize;
uniform float uLevel;
uniform float uTime;
varying vec2 vUv;
varying float vLayer;
varying float vDepth;
void main(){
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  float tl = length(toCam);
  toCam = tl > 1e-4 ? toCam / tl : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  float flick = 1.0 + 0.08 * sin(uTime * 9.0 + aLayer * 3.0) + 0.05 * sin(uTime * 15.7);
  float lw = mix(1.0, 0.62, aLayer);
  float w = uSize * uLevel * lw;
  vec3 p = c + right * aCorner.x * w * 0.5 + vec3(0.0, 1.0, 0.0) * aCorner.y * w * 1.55 * flick + toCam * aLayer * 0.04 * uSize;
  vUv = vec2(aCorner.x * 0.5 + 0.5, aCorner.y);
  vLayer = aLayer;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const flameFrag = `
uniform float uTime;
uniform float uSeed;
uniform float uFireHDR;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vLayer;
varying float vDepth;
${GLSL_NOISE}
void main(){
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float t = uTime * (1.7 + vLayer * 0.6);
  float n = fbm(vec2(x * 1.7 + uSeed * 7.0 + vLayer * 3.1, y * 2.4 - t * 2.3));
  float width = max(0.04, (1.0 - y) * (0.95 - 0.2 * y));
  float shape = (1.0 - smoothstep(0.55, 1.0, abs(x) / width)) * (1.0 - smoothstep(0.75, 1.0, y));
  float v = shape * (1.15 - y * 0.55) + (n - 0.5) * (0.6 + y * 0.9);
  v += vLayer * 0.18;
  if (v < 0.3) discard;
  vec3 col = v > 0.78 ? vec3(1.0, 0.93, 0.62) : (v > 0.52 ? vec3(1.0, 0.58, 0.14) : vec3(0.92, 0.22, 0.06));
  col *= uFireHDR;
  float f = smoothstep(uFogNear, uFogFar, vDepth) * 0.4;
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}`;

const emberVert = `
attribute vec3 aRnd;
uniform float uTime;
uniform float uLevel;
uniform float uSize;
uniform float uPointScale;
varying float vLife;
void main(){
  float life = fract(uTime * (0.22 + aRnd.x * 0.3) + aRnd.y);
  float h = uSize * (1.2 + aRnd.z * 2.4);
  vec3 p = vec3((aRnd.z - 0.5) * uSize * 0.7, life * h + uSize * 0.3, (fract(aRnd.x * 7.31) - 0.5) * uSize * 0.7);
  p.x += sin(uTime * 1.3 + aRnd.y * 20.0) * 0.35 * life * uSize;
  p.z += cos(uTime * 1.1 + aRnd.z * 13.0) * 0.35 * life * uSize;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vLife = life;
  gl_PointSize = uLevel > 0.05 ? 0.06 * uSize * uPointScale * (1.0 - life * 0.7) / max(1.0, -mv.z) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const emberFrag = `
uniform float uFireHDR;
varying float vLife;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  vec3 c = mix(vec3(1.0, 0.75, 0.3), vec3(1.0, 0.3, 0.05), vLife);
  gl_FragColor = vec4(c * uFireHDR * (1.0 - vLife), 1.0);
}`;

let flameGeo = null, emberGeo = null;
const flameMat = new THREE.ShaderMaterial({
  vertexShader: flameVert, fragmentShader: flameFrag,
  uniforms: {
    uTime: U.uTime, uFireHDR: U.uFireHDR, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    uSize: { value: 1 }, uLevel: { value: 1 }, uSeed: { value: 0 },
  },
});
const emberMat = new THREE.ShaderMaterial({
  vertexShader: emberVert, fragmentShader: emberFrag,
  uniforms: { uTime: U.uTime, uFireHDR: U.uFireHDR, uPointScale: U.uPointScale, uSize: { value: 1 }, uLevel: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

function getFlameGeo() {
  if (flameGeo) return flameGeo;
  const c = [], l = [], idx = [];
  for (let layer = 0; layer < 2; layer++) {
    const b = layer * 4;
    c.push(-1, 0, 1, 0, 1, 1, -1, 1);
    l.push(layer, layer, layer, layer);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(24).fill(0), 3));
  flameGeo.setAttribute('aCorner', new THREE.Float32BufferAttribute(c, 2));
  flameGeo.setAttribute('aLayer', new THREE.Float32BufferAttribute(l, 1));
  flameGeo.setIndex(idx);
  flameGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);
  return flameGeo;
}
function getEmberGeo() {
  if (emberGeo) return emberGeo;
  const n = 40, p = new Float32Array(n * 3), r = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) r[i] = Math.random();
  emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  emberGeo.setAttribute('aRnd', new THREE.BufferAttribute(r, 3));
  emberGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 8);
  return emberGeo;
}

export class Fire {
  constructor(parent, pos, size = 1, embers = true) {
    this.size = size;
    this.level = 0; this.target = 0;
    this.mat = flameMat.clone();
    this.mat.uniforms.uTime = U.uTime; this.mat.uniforms.uFireHDR = U.uFireHDR; this.mat.uniforms.uFogColor = U.uFogColor;
    this.mat.uniforms.uFogNear = U.uFogNear; this.mat.uniforms.uFogFar = U.uFogFar;
    this.mat.uniforms.uSize.value = size; this.mat.uniforms.uSeed.value = Math.random() * 10;
    this.mesh = new THREE.Mesh(getFlameGeo(), this.mat);
    this.mesh.position.copy(pos);
    this.mesh.frustumCulled = true;
    parent.add(this.mesh);
    if (embers) {
      this.emat = emberMat.clone();
      this.emat.uniforms.uTime = U.uTime; this.emat.uniforms.uFireHDR = U.uFireHDR; this.emat.uniforms.uPointScale = U.uPointScale;
      this.emat.uniforms.uSize.value = size;
      this.embers = new THREE.Points(getEmberGeo(), this.emat);
      this.embers.position.copy(pos);
      parent.add(this.embers);
    }
    this.set(0, true);
  }
  set(level, instant = false) { this.target = level; if (instant) { this.level = level; this.apply(); } }
  apply() {
    const on = this.level > 0.02;
    this.mesh.visible = on;
    this.mat.uniforms.uLevel.value = this.level;
    if (this.embers) { this.embers.visible = on; this.emat.uniforms.uLevel.value = this.level; }
  }
  update(dt) {
    if (this.level !== this.target) {
      const k = Math.min(1, dt * 2.5);
      this.level += (this.target - this.level) * k;
      if (Math.abs(this.level - this.target) < 0.01) this.level = this.target;
      this.apply();
    }
  }
  forceVisible(v) { this.mesh.visible = v || this.level > 0.02; if (this.embers) this.embers.visible = this.mesh.visible; if (v) { this.mat.uniforms.uLevel.value = 1; } else this.apply(); }
}

// ---------------------------------------------------------------- puffs
const PUFFS = 160;
export class Puffs {
  constructor(scene) {
    this.p = new Float32Array(PUFFS * 3);
    this.a = new Float32Array(PUFFS);
    this.v = new Float32Array(PUFFS * 3);
    this.life = new Float32Array(PUFFS);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.a, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uPointScale: U.uPointScale, uNight: U.uNight },
      vertexShader: `attribute float aLife; uniform float uPointScale; varying float vL;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vL = aLife; gl_PointSize = aLife > 0.0 ? (0.5 + (1.0 - aLife) * 1.4) * uPointScale / max(1.0, -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uNight; varying float vL; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard; float a = vL * (r < 0.12 ? 0.75 : 0.5); gl_FragColor = vec4(mix(vec3(0.82,0.8,0.76), vec3(0.32,0.36,0.46), uNight), a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  burst(x, y, z, n = 8, spread = 0.5) {
    for (let i = 0; i < n; i++) {
      const k = this.next; this.next = (this.next + 1) % PUFFS;
      this.p[k * 3] = x + (Math.random() - 0.5) * spread; this.p[k * 3 + 1] = y + Math.random() * spread * 0.5; this.p[k * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.v[k * 3] = (Math.random() - 0.5) * 0.8; this.v[k * 3 + 1] = 0.8 + Math.random() * 0.9; this.v[k * 3 + 2] = (Math.random() - 0.5) * 0.8;
      this.life[k] = 1;
    }
  }
  update(dt) {
    for (let k = 0; k < PUFFS; k++) {
      if (this.life[k] <= 0) { this.a[k] = 0; continue; }
      this.life[k] -= dt * 0.55;
      this.p[k * 3] += this.v[k * 3] * dt; this.p[k * 3 + 1] += this.v[k * 3 + 1] * dt; this.p[k * 3 + 2] += this.v[k * 3 + 2] * dt;
      this.a[k] = Math.max(0, this.life[k]);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }
}
