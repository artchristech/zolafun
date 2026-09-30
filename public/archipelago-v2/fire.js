// Cel-shaded animated fire with rising embers. Everything animates on the GPU.
import * as THREE from './three.module.min.js';
import { globalUniforms, makeGlow } from './util.js';

const flameVert = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 toCam = cameraPosition - center; toCam.y = 0.0;
    toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    float sx = length(modelMatrix[0].xyz);
    float sy = length(modelMatrix[1].xyz);
    vec3 wp = center + right * position.x * sx + vec3(0.0, 1.0, 0.0) * position.y * sy;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;

const flameFrag = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uLevel;
  uniform float uBoost;
  uniform float uNight;
  uniform vec3 uTint;
  varying vec2 vUv;
  float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y);
  }
  void main(){
    if (uLevel <= 0.001) discard;
    float y = vUv.y;
    float t = uTime;
    float n1 = vnoise(vec2(vUv.x*3.0 + uSeed*7.0, y*3.0 - t*2.6));
    float n2 = vnoise(vec2(vUv.x*7.0 - uSeed*3.0, y*6.0 - t*4.1));
    float x = (vUv.x - 0.5) * 2.0;
    x += (n1 - 0.5) * 0.7 * y + sin(t*3.1 + y*5.0 + uSeed*9.0) * 0.12 * y;
    float lvl = uLevel * (0.88 + 0.12*sin(t*9.0 + uSeed*4.0) + 0.06*sin(t*23.0 + uSeed));
    float yy = y / max(lvl, 0.05);
    float w = smoothstep(0.0, 0.22, yy) * pow(max(1.0 - yy, 0.0), 0.8) * 1.05 + 0.02;
    float body = 1.0 - abs(x) / w;
    body -= n2 * 0.55 * yy;
    // detached tongues near the tip
    body += (n1 - 0.5) * 0.25 * smoothstep(0.5, 1.0, yy);
    if (body < 0.04 || yy > 1.0) discard;
    vec3 col;
    float boost = uBoost * (1.0 + uNight * 1.6);
    if (body > 0.58) col = vec3(1.0, 0.93, 0.62) * 4.2;
    else if (body > 0.32) col = vec3(1.0, 0.56, 0.12) * 3.0;
    else col = vec3(0.92, 0.22, 0.06) * 2.0;
    gl_FragColor = vec4(col * uTint * boost, 1.0);
  }`;

const emberVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uLevel, uHeight, uSpread, uSize;
  varying float vA;
  varying float vHot;
  void main(){
    float sp = 0.22 + 0.25 * fract(aSeed * 7.31);
    float life = fract(uTime * sp + aSeed);
    vec3 p = position * (0.4 + 0.6*life);
    p.y += life * uHeight;
    p.x += sin(uTime * 1.3 + aSeed * 40.0) * uSpread * life + sin(uTime*4.0 + aSeed*9.0)*0.08*life;
    p.z += cos(uTime * 1.1 + aSeed * 23.0) * uSpread * life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vA = (1.0 - life) * smoothstep(0.0, 0.08, life) * step(0.01, uLevel) * (0.35 + 0.65*uLevel);
    vHot = 1.0 - life;
    float sc = length(modelMatrix[1].xyz);
    gl_PointSize = uSize * sc * (0.5 + 0.5*(1.0-life)) * (300.0 / max(-mv.z, 0.5));
  }`;
const emberFrag = /* glsl */ `
  varying float vA;
  varying float vHot;
  uniform float uNight;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    if (abs(c.x) + abs(c.y) > 0.5) discard; // diamond: crisp cel spark
    vec3 col = mix(vec3(0.9, 0.18, 0.04), vec3(1.0, 0.75, 0.3), vHot) * (2.5 + 2.0*uNight);
    gl_FragColor = vec4(col * vA, 1.0);
  }`;

let flameGeo = null;
function getFlameGeo() {
  if (!flameGeo) {
    flameGeo = new THREE.PlaneGeometry(1, 1);
    flameGeo.translate(0, 0.5, 0);
  }
  return flameGeo;
}

export const allFires = [];

export class Fire {
  // opts: {height, width, embers, emberHeight, light, lightIntensity, lightDistance, glow, glowSize}
  constructor(opts = {}) {
    this.opts = opts;
    this.group = new THREE.Group();
    this.level = 0;
    this.target = 0;
    const h = opts.height || 1, w = opts.width || h * 0.6;
    this.flames = [];
    const layers = opts.layers || [
      { x: 0, z: 0, s: 1.0, seed: Math.random() * 10 },
      { x: -0.22, z: 0.1, s: 0.72, seed: Math.random() * 10 },
      { x: 0.24, z: -0.08, s: 0.66, seed: Math.random() * 10 },
    ];
    for (const L of layers) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: globalUniforms.uTime, uNight: globalUniforms.uNight,
          uSeed: { value: L.seed }, uLevel: { value: 0 }, uBoost: { value: opts.boost || 1 },
          uTint: { value: new THREE.Color(opts.tint || 0xffffff) },
        },
        vertexShader: flameVert, fragmentShader: flameFrag, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(getFlameGeo(), mat);
      m.scale.set(w * L.s, h * L.s, 1);
      m.position.set(L.x * w, 0, L.z * w);
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.group.add(m);
      this.flames.push(m);
    }
    const ne = opts.embers ?? 30;
    if (ne > 0) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(ne * 3), seed = new Float32Array(ne);
      for (let i = 0; i < ne; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * w * 0.35;
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * h * 0.3; pos[i * 3 + 2] = Math.sin(a) * r;
        seed[i] = Math.random();
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      this.emberMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: globalUniforms.uTime, uNight: globalUniforms.uNight, uLevel: { value: 0 },
          uHeight: { value: opts.emberHeight || h * 3 }, uSpread: { value: w * 0.8 }, uSize: { value: opts.emberSize || 0.06 },
        },
        vertexShader: emberVert, fragmentShader: emberFrag,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      });
      this.embers = new THREE.Points(g, this.emberMat);
      this.embers.frustumCulled = false;
      this.group.add(this.embers);
    }
    if (opts.light) {
      this.light = new THREE.PointLight(opts.lightColor || 0xffa04a, 0, opts.lightDistance || 30, opts.lightDecay ?? 1.4);
      this.light.position.y = h * 0.5;
      this.group.add(this.light);
      this.lightBase = opts.lightIntensity || 20;
    }
    if (opts.glow) {
      this.glow = makeGlow(0xff9a40, opts.glowSize || h * 5, 1);
      this.glow.position.y = h * 0.45;
      this.glow.renderOrder = 3;
      this.group.add(this.glow);
      this.glowBase = opts.glowIntensity || 0.6;
    }
    allFires.push(this);
  }
  set(level, instant = false) {
    this.target = level;
    if (instant) this.level = level;
  }
  update(dt, night) {
    this.level += (this.target - this.level) * Math.min(1, dt * 1.5);
    if (Math.abs(this.target - this.level) < 0.002) this.level = this.target;
    for (const f of this.flames) f.material.uniforms.uLevel.value = this.level;
    if (this.emberMat) this.emberMat.uniforms.uLevel.value = this.level;
    const flick = 0.85 + 0.15 * Math.sin(performance.now() * 0.013 + this.flames[0].material.uniforms.uSeed.value) + 0.05 * Math.sin(performance.now() * 0.041);
    if (this.light) this.light.intensity = this.lightBase * this.level * flick * (0.6 + night * 1.2);
    if (this.glow) {
      this.glow.visible = this.level > 0.02;
      this.glow.material.color.setRGB(1.0, 0.6, 0.25).multiplyScalar(this.glowBase * this.level * (0.25 + night * 1.2) * flick);
    }
  }
  dispose() {
    const i = allFires.indexOf(this);
    if (i >= 0) allFires.splice(i, 1);
  }
}

// Soft smoke column (used for primed beacons that are ready to be lit)
const smokeVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uLevel, uHeight;
  varying float vA;
  void main(){
    float life = fract(uTime * (0.12 + 0.05*fract(aSeed*5.1)) + aSeed);
    vec3 p = position;
    p.y += life * uHeight;
    p.x += sin(uTime*0.5 + aSeed*30.0) * life * 1.2 + life*life*1.5;
    p.z += cos(uTime*0.4 + aSeed*17.0) * life * 1.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vA = smoothstep(0.0, 0.15, life) * (1.0 - life) * uLevel;
    gl_PointSize = (0.6 + life * 2.2) * (300.0 / max(-mv.z, 0.5));
  }`;
const smokeFrag = /* glsl */ `
  varying float vA;
  uniform vec3 uColor;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = step(d, 0.42) * 0.5 + 0.2;
    gl_FragColor = vec4(uColor, a * vA);
  }`;
export class Smoke {
  constructor(count = 24, height = 7) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.5; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      seed[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime, uLevel: { value: 0 }, uHeight: { value: height }, uColor: { value: new THREE.Color(0x8a8078) } },
      vertexShader: smokeVert, fragmentShader: smokeFrag, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.level = 0; this.target = 0;
  }
  update(dt, night) {
    this.level += (this.target - this.level) * Math.min(1, dt * 1.2);
    this.mat.uniforms.uLevel.value = this.level;
    this.mat.uniforms.uColor.value.setRGB(0.55 - night * 0.35, 0.5 - night * 0.3, 0.48 - night * 0.25);
    this.points.visible = this.level > 0.01;
  }
}
