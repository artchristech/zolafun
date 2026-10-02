// Cel-shaded animated flames with rising embers.
import * as THREE from './three.module.min.js';
import { NOISE_GLSL } from './util.js';

const flameGeo = new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);

const FLAME_VS = `
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 center = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
  vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  r = normalize(vec3(r.x, 0.0, r.z) + 1e-5);
  float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
  vec3 wp = center + r * position.x * sx + vec3(0.0,1.0,0.0) * position.y * sy;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FLAME_FS = `
uniform float uTime, uLit, uSeed, uGain;
varying vec2 vUv;
${NOISE_GLSL}
void main(){
  vec2 uv = vUv;
  float t = uTime + uSeed;
  float n = fbm2(vec2(uv.x * 3.0 + uSeed, uv.y * 2.4 - t * 2.3));
  float n2 = vn(vec2(uv.x * 7.0 - uSeed, uv.y * 5.0 - t * 3.7));
  float x = (uv.x - 0.5) * 2.0;
  float w = (1.0 - uv.y) * 0.95 + 0.04;
  float body = 1.0 - abs(x + (n - 0.5) * 0.9 * uv.y) / w;
  body -= uv.y * (1.25 - uLit * 0.6);
  body += (n2 - 0.5) * 0.45;
  body *= smoothstep(0.0, 0.1, uv.y);
  body *= uLit;
  if (body < 0.1) discard;
  vec3 col = body > 0.62 ? vec3(1.0, 0.96, 0.78) : body > 0.36 ? vec3(1.0, 0.7, 0.16) : vec3(0.92, 0.28, 0.05);
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

const EMBER_VS = `
attribute float aSeed;
uniform float uTime, uLit, uSize, uH, uPx;
varying float vA;
void main(){
  float s = aSeed;
  float life = fract(uTime * (0.3 + 0.3 * fract(s * 7.31)) + s);
  vec3 p = vec3((fract(s * 13.1) - 0.5) * 0.7, life * uH, (fract(s * 17.7) - 0.5) * 0.7);
  p.x += sin(life * 6.0 + s * 20.0) * 0.35 * life;
  p.z += cos(life * 5.0 + s * 11.0) * 0.35 * life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (1.0 - life) * uLit;
  gl_PointSize = uSize * (1.0 - life * 0.6) * uPx / max(-mv.z, 0.5) * step(0.01, uLit);
  gl_Position = projectionMatrix * mv;
}`;
const EMBER_FS = `
uniform float uGain;
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (abs(c.x) + abs(c.y) > 0.5 || vA < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * uGain * vA, 1.0);
}`;

export const fireUniforms = { uTime: { value: 0 }, uPx: { value: 500 } };
export const fires = [];

export class Fire {
  constructor(scale = 1, { embers = 28, gain = 6, seed = Math.random() * 10 } = {}) {
    this.group = new THREE.Group();
    this.lit = 0;
    this.target = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: fireUniforms.uTime, uLit: { value: 0 }, uSeed: { value: seed }, uGain: { value: gain } },
      vertexShader: FLAME_VS, fragmentShader: FLAME_FS, fog: false,
    });
    this.flame = new THREE.Mesh(flameGeo, this.mat);
    this.flame.scale.set(1.3 * scale, 2.2 * scale, 1);
    this.flame.frustumCulled = false;
    this.group.add(this.flame);
    const g = new THREE.BufferGeometry();
    const n = embers;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2 * scale, 0), 4 * scale);
    this.emat = new THREE.ShaderMaterial({
      uniforms: { uTime: fireUniforms.uTime, uPx: fireUniforms.uPx, uLit: { value: 0 }, uSize: { value: 0.16 * scale }, uH: { value: 4.5 * scale }, uGain: { value: gain * 0.8 } },
      vertexShader: EMBER_VS, fragmentShader: EMBER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.embers = new THREE.Points(g, this.emat);
    this.group.add(this.embers);
    this.flame.visible = this.embers.visible = false;
    fires.push(this);
  }
  set(v, instant = false) { this.target = v; if (instant) this.lit = v; }
  update(dt) {
    this.lit += (this.target - this.lit) * Math.min(1, dt * 2.5);
    if (Math.abs(this.lit - this.target) < 0.002) this.lit = this.target;
    this.mat.uniforms.uLit.value = this.lit;
    this.emat.uniforms.uLit.value = this.lit;
    this.flame.visible = this.embers.visible = this.lit > 0.01;
  }
}
