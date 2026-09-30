import * as THREE from './three.module.min.js';
import { U, GLSL_NOISE } from './materials.js';

// ---------------------------------------------------------------------------
// Cel-shaded animated fire: two camera-facing flame layers with hard colour
// bands, rising embers and a soft halo that stays visible through night fog.
// ---------------------------------------------------------------------------
let flameGeo = null;
function getFlameGeo() {
  if (flameGeo) return flameGeo;
  const pos = [], uv = [], layer = [], idx = [];
  for (let l = 0; l < 2; l++) {
    const b = l * 4;
    pos.push(-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    layer.push(l, l, l, l);
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flameGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  flameGeo.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
  flameGeo.setIndex(idx);
  flameGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.6);
  return flameGeo;
}

const FLAME_VS = `
attribute float aLayer;
uniform vec2 uSize; uniform float uIntensity;
varying vec2 vUv; varying float vLayer; varying float vDepth;
void main(){
  vUv = uv; vLayer = aLayer;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sc = length(modelMatrix[0].xyz);
  vec3 toCam = cameraPosition - center;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(0.0, 0.0, 1e-4));
  float lsz = mix(1.0, 0.6, aLayer);
  float grow = 0.3 + 0.7 * uIntensity;
  vec3 wp = center + right * position.x * uSize.x * sc * lsz * grow
                   + vec3(0.0, 1.0, 0.0) * position.y * uSize.y * sc * lsz * grow
                   + fwd * aLayer * 0.06 * sc;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FLAME_FS = `${GLSL_NOISE}
uniform float uTime, uSeed, uIntensity, uNight, uHDR;
uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
varying vec2 vUv; varying float vLayer; varying float vDepth;
void main(){
  if (uIntensity < 0.01) discard;
  float t = uTime * (1.0 + vLayer * 0.35) + uSeed * 10.0;
  float y = vUv.y;
  float n1 = vnoise(vec2(vUv.x * 3.0 + uSeed * 7.0, y * 2.2 - t * 2.4));
  float n2 = vnoise(vec2(vUv.x * 7.0 - uSeed * 3.0, y * 4.6 - t * 3.9));
  float x = (vUv.x - 0.5) * 2.0 + (n1 - 0.5) * 0.9 * y + (n2 - 0.5) * 0.35 * y;
  float w = 0.86 * pow(max(1.0 - y, 0.0), 0.75) * smoothstep(-0.05, 0.28, y);
  float f = 1.0 - abs(x) / max(w, 1e-3);
  f -= n2 * 0.6 * y * y;
  f += (1.0 - y) * 0.05;
  if (f <= 0.0) discard;
  vec3 outer = vec3(0.95, 0.20, 0.04), mid = vec3(1.0, 0.52, 0.07), core = vec3(1.0, 0.9, 0.52);
  vec3 col = vLayer > 0.5 ? (f > 0.42 ? core : mid) : (f > 0.5 ? mid : outer);
  col *= uHDR * (1.0 + 1.8 * uNight) * (0.4 + 0.6 * uIntensity);
  float fg = smoothstep(uFogNear, uFogFar, vDepth) * 0.45;
  gl_FragColor = vec4(mix(col, uFogColor, fg), 1.0);
}`;

const EMBER_VS = `
attribute float aSeed;
uniform float uTime, uIntensity, uHeight, uSpread, uSize, uPixelRatio;
varying float vA;
void main(){
  float sp = 0.6 + fract(aSeed * 13.7) * 0.7;
  float life = fract(uTime * 0.38 * sp + aSeed * 7.13);
  float sw = 0.3 + life;
  vec3 p = vec3(sin(aSeed * 91.0 + uTime * 1.3) * uSpread * sw, life * uHeight, cos(aSeed * 47.0 + uTime * 1.1) * uSpread * sw);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = length(modelMatrix[0].xyz);
  gl_PointSize = uSize * s * (1.0 - life) * uPixelRatio * 320.0 / max(-mv.z, 0.5) * step(0.01, uIntensity);
  vA = (1.0 - life) * uIntensity;
}`;
const EMBER_FS = `
uniform float uNight; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (abs(c.x) + abs(c.y) > 0.5) discard;
  vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.4), step(0.6, vA));
  gl_FragColor = vec4(col * vA * (1.5 + 3.0 * uNight), 1.0);
}`;

const HALO_VS = `
uniform float uSize; varying vec2 vUv; varying float vDepth;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float d = -mv.z;
  float grow = max(1.0, d / 70.0);
  mv.xy += position.xy * uSize * grow;
  vDepth = d;
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = `
uniform float uIntensity, uNight, uDay; uniform vec3 uColor; uniform float uFogNear, uFogFar;
varying vec2 vUv; varying float vDepth;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 2.2);
  float fg = smoothstep(uFogNear, uFogFar, vDepth);
  float k = uIntensity * (uDay + (1.0 - uDay) * uNight) * (1.0 - fg * 0.55);
  gl_FragColor = vec4(uColor * a * k, 1.0);
}`;

export class Fire {
  // opts: size [w,h], hdr, embers count, halo size, emberHeight
  constructor(opts = {}) {
    const size = opts.size || [1, 1.6];
    this.group = new THREE.Group();
    this.intensity = opts.lit ? 1 : 0;
    this.target = this.intensity;
    this.uni = {
      uTime: U.uTime, uNight: U.uNight, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uIntensity: { value: this.intensity },
      uSeed: { value: Math.random() },
      uHDR: { value: opts.hdr || 1.6 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, fog: false, side: THREE.DoubleSide });
    this.flame = new THREE.Mesh(getFlameGeo(), mat);
    this.flame.frustumCulled = false;
    this.group.add(this.flame);

    const n = opts.embers ?? 18;
    if (n > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      const seeds = new Float32Array(n);
      for (let i = 0; i < n; i++) seeds[i] = Math.random();
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4);
      this.eUni = {
        uTime: U.uTime, uNight: U.uNight, uPixelRatio: U.uPixelRatio, uIntensity: this.uni.uIntensity,
        uHeight: { value: (opts.emberHeight || 3) }, uSpread: { value: size[0] * 0.5 }, uSize: { value: opts.emberSize || 0.07 },
      };
      const em = new THREE.ShaderMaterial({ uniforms: this.eUni, vertexShader: EMBER_VS, fragmentShader: EMBER_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      this.embers = new THREE.Points(g, em);
      this.embers.position.y = size[1] * 0.3;
      this.group.add(this.embers);
    }

    if (opts.halo) {
      this.hUni = {
        uIntensity: this.uni.uIntensity, uNight: U.uNight, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
        uSize: { value: opts.halo }, uColor: { value: new THREE.Color(opts.haloColor || 0xff8a30) }, uDay: { value: opts.haloDay ?? 0.12 },
      };
      const hm = new THREE.ShaderMaterial({ uniforms: this.hUni, vertexShader: HALO_VS, fragmentShader: HALO_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
      this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hm);
      this.halo.position.y = size[1] * 0.45;
      this.halo.frustumCulled = false;
      this.halo.renderOrder = 5;
      this.group.add(this.halo);
    }
    this.flicker = 1;
  }
  light(instant = false) { this.target = 1; if (instant) this.intensity = 1; }
  snuff(instant = false) { this.target = 0; if (instant) this.intensity = 0; }
  get lit() { return this.target > 0.5; }
  update(dt, t) {
    const k = this.target > this.intensity ? 1.6 : 3.5;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * k);
    if (Math.abs(this.target - this.intensity) < 0.002) this.intensity = this.target;
    this.uni.uIntensity.value = this.intensity;
    this.group.visible = this.intensity > 0.004 || this.target > 0;
    this.flicker = 0.85 + 0.1 * Math.sin(t * 17.0 + this.uni.uSeed.value * 40) + 0.05 * Math.sin(t * 31.0);
  }
}

// ---------------------------------------------------------------------------
// Wordless hint: a slow swirl of sparkles around the next thing to touch.
// ---------------------------------------------------------------------------
export class Sparkles {
  constructor() {
    const n = 40;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    this.uni = { uTime: U.uTime, uPixelRatio: U.uPixelRatio, uAlpha: { value: 0 }, uRadius: { value: 1.2 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: `attribute float aSeed; uniform float uTime, uPixelRatio, uAlpha, uRadius; varying float vA;
        void main(){
          float a = aSeed * 6.2831 + uTime * (0.4 + aSeed * 0.5);
          float life = fract(uTime * 0.3 + aSeed * 5.3);
          vec3 p = vec3(cos(a) * uRadius, (life - 0.3) * 2.2, sin(a) * uRadius);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.5 + 0.5 * sin(uTime * 9.0 + aSeed * 50.0);
          gl_PointSize = (0.06 + 0.06 * tw) * uPixelRatio * 320.0 / max(-mv.z, 0.5);
          vA = uAlpha * sin(life * 3.1416) * (0.4 + 0.6 * tw);
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = abs(c.x) + abs(c.y);
          if (d > 0.5) discard; float core = step(d, 0.18);
          gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.5), vec3(1.0), core) * vA * 2.5, 1.0); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.alpha = 0;
  }
  update(dt, pos, active, radius = 1.2) {
    this.alpha += ((active ? 1 : 0) - this.alpha) * Math.min(1, dt * 1.5);
    this.uni.uAlpha.value = this.alpha;
    this.uni.uRadius.value = radius;
    if (pos) this.points.position.copy(pos);
    this.points.visible = this.alpha > 0.01;
  }
}
