// Five Lights — animated cel-shaded fire with rising embers and a soft glow.
import * as THREE from './three.module.min.js';
import { shared, GLSL_NOISE } from './util.js';

const flameVS = `
  uniform vec2 uSize; varying vec2 vUv;
  void main(){
    vUv = uv;
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // cylindrical-ish billboard: width in view space, height along view-space up of world Y
    vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 rightV = normalize(cross(upV, vec3(0.0, 0.0, 1.0)));
    c.xyz += rightV * position.x * uSize.x + upV * (position.y + 0.5) * uSize.y;
    gl_Position = projectionMatrix * c;
  }`;
const flameFS = `
  uniform float uTime, uSeed, uGain, uLevel; uniform vec3 uC1, uC2, uC3; varying vec2 vUv;
  ${GLSL_NOISE}
  void main(){
    if (uLevel < 0.01) discard;
    vec2 p = vUv; float y = p.y / max(uLevel, 0.05);
    if (y > 1.0) discard;
    float n = fbm(vec2(p.x * 3.0 + uSeed, y * 2.4 - uTime * 2.3));
    float n2 = vnoise(vec2(p.x * 7.0 - uSeed, y * 6.0 - uTime * 4.1));
    float w = 0.46 * pow(1.0 - y, 0.9) * smoothstep(-0.05, 0.22, y);
    float dx = abs(p.x - 0.5 + (n - 0.5) * 0.32 * y);
    float shape = w - dx + (n2 - 0.5) * 0.22 * y - y * 0.04;
    // tongues breaking off the top
    if (y > 0.55) shape -= step(n2, 0.45) * 0.08 * (y - 0.55) * 6.0;
    if (shape < 0.0) discard;
    float s = shape / max(w, 0.001);
    vec3 col = uC3;
    if (s > 0.28) col = uC2;
    if (s > 0.6 && y < 0.62) col = uC1;
    gl_FragColor = vec4(col * uGain, 1.0);
  }`;

const emberVS = `
  attribute vec3 aSeed; uniform float uTime, uH, uSpread, uSize, uLevel; varying float vA;
  void main(){
    float sp = 0.35 + aSeed.x * 0.4;
    float life = fract(uTime * sp + aSeed.y * 7.31);
    vec3 p = vec3((aSeed.z - 0.5) * uSpread * (0.4 + life), life * uH, (fract(aSeed.y * 13.7) - 0.5) * uSpread * (0.4 + life));
    p.x += sin(uTime * 2.1 + aSeed.y * 30.0) * 0.35 * life * uSpread;
    p.z += cos(uTime * 1.7 + aSeed.z * 20.0) * 0.35 * life * uSpread;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = (1.0 - life) * smoothstep(0.0, 0.08, life) * step(0.01, uLevel);
    gl_PointSize = uSize * (1.0 - life * 0.5) * (420.0 / max(-mv.z, 0.5));
    gl_Position = projectionMatrix * mv;
  }`;
const emberFS = `
  uniform float uGain; varying float vA;
  void main(){ vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * uGain * vA, 1.0); }`;

const glowVS = `
  uniform float uR; varying vec2 vUv;
  void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy * uR; gl_Position = projectionMatrix * c; }`;
const glowFS = `
  uniform float uGain, uLevel; uniform vec3 uCol; varying vec2 vUv;
  void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(uCol * a * uGain * uLevel, 1.0); }`;

const quad = new THREE.PlaneGeometry(1, 1);

export class Fire {
  // size: flame height in metres
  constructor(size = 2, { embers = 36, glow = 1, seed = Math.random() * 10 } = {}) {
    this.group = new THREE.Group();
    this.size = size;
    this.level = { value: 0 }; // 0 out → 1 full
    this.gain = { value: 2 };
    this.mats = [];
    const mkFlame = (w, h, s, c1, c2, c3) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uSeed: { value: s }, uGain: this.gain, uLevel: this.level, uSize: { value: new THREE.Vector2(w, h) }, uC1: { value: c1 }, uC2: { value: c2 }, uC3: { value: c3 } },
        vertexShader: flameVS, fragmentShader: flameFS,
      });
      const mesh = new THREE.Mesh(quad, m);
      mesh.frustumCulled = false;
      this.mats.push(m);
      return mesh;
    };
    const c1 = new THREE.Color(1.0, 0.93, 0.62), c2 = new THREE.Color(1.0, 0.5, 0.08), c3 = new THREE.Color(0.85, 0.16, 0.03);
    this.outer = mkFlame(size * 0.9, size, seed, c1, c2, c3);
    this.inner = mkFlame(size * 0.55, size * 0.62, seed + 3.3, new THREE.Color(1, 1, 0.85), c1, c2);
    this.inner.position.y = 0.01; this.inner.renderOrder = 1;
    this.group.add(this.outer, this.inner);
    // embers
    const n = embers;
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seeds[i] = Math.random();
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    eg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.emberMat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uH: { value: size * 3.2 }, uSpread: { value: size * 0.45 }, uSize: { value: 0.09 * Math.sqrt(size) }, uGain: this.gain, uLevel: this.level },
      vertexShader: emberVS, fragmentShader: emberFS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.embers = new THREE.Points(eg, this.emberMat);
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
    // glow halo (unfogged so lit beacons read through the night fog)
    this.glowGain = { value: 0.6 * glow };
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: size * 3.2 }, uGain: this.glowGain, uLevel: this.level, uCol: { value: new THREE.Color(1.0, 0.5, 0.18) } },
      vertexShader: glowVS, fragmentShader: glowFS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.glow = new THREE.Mesh(quad, this.glowMat);
    this.glow.position.y = size * 0.45;
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 2;
    this.group.add(this.glow);
    this.target = 0;
  }
  setLit(on, instant = false) { this.target = on ? 1 : 0; if (instant) this.level.value = this.target; }
  update(dt, night) {
    const l = this.level;
    l.value += Math.max(-dt * 1.5, Math.min(dt * 0.8, this.target - l.value));
    this.gain.value = 1.6 + night * 3.2;
    this.glowGain.value = (0.25 + night * 1.1);
    this.group.visible = l.value > 0.001 || this.forceVisible;
  }
}
