// Five Lights — cel-shaded animated flames with rising embers. Colours exceed 1.0
// so the bloom pass makes them glow at night.
import * as THREE from './three.module.min.js';

export const fireTime = { value: 0 };

const flameVS = /* glsl */`
  uniform float uTime, uSeed, uIntensity;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    // cylindrical billboard: keep upright, face the camera
    vec3 c = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
    vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
    vec3 right = vec3(toCam.z, 0.0, -toCam.x);
    float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
    float sway = sin(uTime * 3.1 + uSeed) * 0.12 * uv.y * uv.y;
    vec3 wp = c + right * (position.x + sway) * sx + vec3(0.0, position.y * sy * (0.75 + 0.25 * uIntensity), 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const flameFS = /* glsl */`
  uniform float uTime, uSeed, uIntensity, uHot;
  varying vec2 vUv;
  float n2(vec2 p){ return sin(p.x*1.7+sin(p.y*2.3))*0.5 + sin(p.y*3.1 - p.x*1.3)*0.5; }
  void main(){
    vec2 p = vUv; p.x = (p.x - 0.5) * 2.0;
    float t = uTime * 2.4 + uSeed;
    float flick = n2(vec2(p.x * 3.0, p.y * 4.0 - t * 2.0)) * 0.22 + n2(vec2(p.x * 6.0 + 2.0, p.y * 7.0 - t * 3.3)) * 0.12;
    // teardrop profile, licked upward by noise
    float w = pow(1.0 - p.y, 0.7) * sqrt(max(p.y, 0.0)) * 1.9;
    float heat = 1.0 - abs(p.x) / max(w, 0.001) + flick - p.y * 0.55;
    heat *= uIntensity;
    // tongues breaking off near the top
    heat -= step(0.62, p.y) * (0.25 + 0.25 * sin(t * 3.0 + p.x * 9.0));
    if (heat < 0.05) discard;
    vec3 col = vec3(0.95, 0.18, 0.05) * 1.6;
    if (heat > 0.35) col = vec3(1.0, 0.45, 0.08) * 2.4;
    if (heat > 0.62) col = vec3(1.0, 0.82, 0.3) * 3.4;
    if (heat > 0.85) col = vec3(1.0, 0.97, 0.82) * 4.5;
    gl_FragColor = vec4(col * uHot, 1.0);
  }`;
const emberVS = /* glsl */`
  uniform float uTime, uIntensity, uRise, uSize;
  attribute float aSeed;
  varying float vLife;
  void main(){
    float sp = 0.35 + fract(aSeed * 7.13) * 0.5;
    float life = fract(uTime * sp * 0.55 + aSeed);
    vLife = life;
    float ang = aSeed * 40.0 + uTime * (1.0 + aSeed);
    float rad = 0.15 + life * 0.6 * fract(aSeed * 3.7);
    vec3 p = vec3(cos(ang) * rad, life * uRise, sin(ang) * rad);
    vec4 mv = modelViewMatrix * vec4(p * vec3(uSize, 1.0, uSize), 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 - life) * 70.0 * uSize * uIntensity / max(-mv.z, 1.0);
  }`;
const emberFS = /* glsl */`
  varying float vLife;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    if (max(abs(c.x), abs(c.y)) > 0.35) discard;
    vec3 col = mix(vec3(1.0, 0.85, 0.35) * 4.0, vec3(1.0, 0.25, 0.05) * 2.0, vLife);
    gl_FragColor = vec4(col, 1.0);
  }`;

let flameGeo = null, emberGeo = null;

export class Fire {
  // size: flame height in metres
  constructor(size = 1, opts = {}) {
    if (!flameGeo) {
      flameGeo = new THREE.PlaneGeometry(1, 1, 1, 6);
      flameGeo.translate(0, 0.5, 0);
      emberGeo = new THREE.BufferGeometry();
      const N = 36, pos = new Float32Array(N * 3), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) seed[i] = Math.random();
      emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      emberGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 6);
    }
    this.group = new THREE.Group();
    this.intensity = 0;
    this.target = opts.lit ? 1 : 0;
    const seed = Math.random() * 100;
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: fireTime, uSeed: { value: seed }, uIntensity: { value: 0 }, uHot: { value: opts.hot ?? 1 } },
      vertexShader: flameVS, fragmentShader: flameFS, side: THREE.DoubleSide,
    });
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.flame.scale.set(size * 0.62, size, size);
    this.flame.frustumCulled = false;
    this.group.add(this.flame);
    if (opts.embers !== false) {
      this.emberMat = new THREE.ShaderMaterial({
        uniforms: { uTime: fireTime, uIntensity: { value: 0 }, uRise: { value: size * 3.2 }, uSize: { value: size } },
        vertexShader: emberVS, fragmentShader: emberFS,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      });
      this.embers = new THREE.Points(emberGeo, this.emberMat);
      this.embers.frustumCulled = false;
      this.group.add(this.embers);
    }
    this.apply();
  }
  set lit(v) { this.target = v ? 1 : 0; }
  get lit() { return this.target > 0; }
  snap() { this.intensity = this.target; this.apply(); }
  apply() {
    const v = this.intensity;
    this.flameMat.uniforms.uIntensity.value = v;
    if (this.emberMat) this.emberMat.uniforms.uIntensity.value = v;
    this.group.visible = v > 0.01;
  }
  update(dt, rate = 1.5) {
    if (this.intensity !== this.target) {
      const d = this.target - this.intensity;
      this.intensity += Math.sign(d) * Math.min(Math.abs(d), dt * rate);
      this.apply();
    }
  }
}
