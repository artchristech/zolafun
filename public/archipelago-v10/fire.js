// Cel-shaded animated flames with rising embers and a fog-piercing glow.
import * as THREE from './three.module.min.js';

const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
`;

const flameVS = /* glsl */ `
uniform float uScale;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 c = (modelMatrix*vec4(0.,0.,0.,1.)).xyz;
  vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 wp = c + right*position.x*uScale + vec3(0.,1.,0.)*position.y*uScale;
  gl_Position = projectionMatrix*viewMatrix*vec4(wp,1.);
}`;
const flameFS = /* glsl */ `
uniform float uTime, uSeed, uAmp, uBright;
varying vec2 vUv;
${NOISE}
void main(){
  float x = (vUv.x-0.5)*2.0;
  float y = vUv.y;
  float t = uTime*2.4 + uSeed*13.0;
  float wob = (n2(vec2(y*3.0 - t*1.3, uSeed))-0.5)*0.55*y;
  x += wob;
  float tongues = n2(vec2(x*3.2 + uSeed, y*3.5 - t*2.2));
  float width = (1.0 - pow(y, 1.25)) * smoothstep(0.0, 0.16, y) * 0.92;
  float v = 1.0 - abs(x)/max(width, 0.001);
  v += (tongues-0.5)*0.9*y;
  v -= (1.0-uAmp)*1.1;
  v -= y*0.22;
  if (v < 0.0) discard;
  vec3 cOut = vec3(0.95,0.22,0.06);
  vec3 cMid = vec3(1.0,0.55,0.08);
  vec3 cCore = vec3(1.0,0.93,0.55);
  vec3 col = v > 0.62 ? cCore : (v > 0.3 ? cMid : cOut);
  gl_FragColor = vec4(col*uBright, 1.0);
}`;

const emberVS = /* glsl */ `
uniform float uTime, uAmp, uScale, uPx, uSeed;
attribute float aSeed;
varying float vLife;
void main(){
  float sp = 0.32 + fract(aSeed*7.13)*0.35;
  float life = fract(uTime*sp + aSeed + uSeed);
  vLife = life;
  float a = aSeed*31.0 + uTime*1.1;
  vec3 p = vec3(sin(a + life*3.0)*(0.15+life*0.45), 0.4 + life*2.8, cos(a*1.3 + life*2.0)*(0.15+life*0.45))*uScale;
  vec4 mv = modelViewMatrix*vec4(p,1.0);
  gl_PointSize = uPx * uScale * 0.06 * (1.0-life) * step(0.02, uAmp) / max(-mv.z, 0.5);
  gl_Position = projectionMatrix*mv;
}`;
const emberFS = /* glsl */ `
uniform float uBright;
varying float vLife;
void main(){
  vec2 c = gl_PointCoord-0.5;
  if (dot(c,c) > 0.25) discard;
  vec3 col = mix(vec3(1.0,0.8,0.3), vec3(1.0,0.25,0.05), vLife);
  gl_FragColor = vec4(col*uBright, 1.0);
}`;

const glowVS = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix*vec4(0.,0.,0.,1.);
  mv.xy += position.xy*uSize;
  gl_Position = projectionMatrix*mv;
}`;
const glowFS = /* glsl */ `
uniform float uI;
uniform vec3 uColor;
varying vec2 vUv;
void main(){
  float d = length(vUv-0.5)*2.0;
  float a = pow(max(1.0-d,0.0), 2.2);
  gl_FragColor = vec4(uColor*a*uI, 1.0);
}`;

export class FireSystem {
  constructor() {
    this.shared = { uTime: { value: 0 }, uPx: { value: 800 }, uBright: { value: 1.6 } };
    this.list = [];
    this.flameGeo = new THREE.PlaneGeometry(1, 1.6).translate(0, 0.8, 0);
    this.flameGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.2);
    const N = 26;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = i / N + Math.random() * 0.03;
    this.emberGeo = new THREE.BufferGeometry();
    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.emberGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 3);
    this.glowGeo = new THREE.PlaneGeometry(1, 1);
    this.glowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this.flameMat = new THREE.ShaderMaterial({
      vertexShader: flameVS, fragmentShader: flameFS,
      uniforms: { uTime: this.shared.uTime, uSeed: { value: 0 }, uAmp: { value: 0 }, uScale: { value: 1 }, uBright: this.shared.uBright },
    });
    this.emberMat = new THREE.ShaderMaterial({
      vertexShader: emberVS, fragmentShader: emberFS,
      uniforms: { uTime: this.shared.uTime, uAmp: { value: 0 }, uScale: { value: 1 }, uPx: this.shared.uPx, uSeed: { value: 0 }, uBright: this.shared.uBright },
    });
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVS, fragmentShader: glowFS,
      uniforms: { uSize: { value: 1 }, uI: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.55, 0.2) } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.night = 0;
  }
  create(opts = {}) {
    const f = new Fire(this, opts);
    this.list.push(f);
    return f;
  }
  setPixelScale(heightPx, fovDeg) {
    this.shared.uPx.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  update(dt, time, night) {
    this.shared.uTime.value = time;
    this.night = night;
    this.shared.uBright.value = 1.5 + night * 1.6;
    for (const f of this.list) f.update(dt);
  }
}

export class Fire {
  constructor(sys, { scale = 1, glow = 0, embers = true, seed = Math.random() * 10, glowColor = null } = {}) {
    this.sys = sys;
    this.scale = scale;
    this.glowSize = glow;
    this.amp = 0;
    this.target = 0;
    this.group = new THREE.Group();
    const fm = sys.flameMat.clone();
    fm.uniforms.uTime = sys.shared.uTime;
    fm.uniforms.uBright = sys.shared.uBright;
    fm.uniforms.uSeed.value = seed;
    fm.uniforms.uScale.value = scale;
    this.fm = fm;
    this.flame = new THREE.Mesh(sys.flameGeo, fm);
    this.flame.scale.setScalar(scale);
    this.group.add(this.flame);
    if (embers) {
      const em = sys.emberMat.clone();
      em.uniforms.uTime = sys.shared.uTime;
      em.uniforms.uPx = sys.shared.uPx;
      em.uniforms.uBright = sys.shared.uBright;
      em.uniforms.uScale.value = scale;
      em.uniforms.uSeed.value = seed;
      this.em = em;
      this.embers = new THREE.Points(sys.emberGeo, em);
      this.embers.scale.setScalar(scale);
      this.group.add(this.embers);
    }
    if (glow > 0) {
      const gm = sys.glowMat.clone();
      gm.uniforms.uSize.value = glow;
      if (glowColor) gm.uniforms.uColor.value.copy(glowColor);
      this.gm = gm;
      this.glow = new THREE.Mesh(sys.glowGeo, gm);
      this.glow.position.y = 0.7 * scale;
      this.glow.scale.setScalar(glow);
      this.glow.renderOrder = 5;
      this.group.add(this.glow);
    }
    this.group.visible = false;
  }
  ignite(instant = false) {
    this.target = 1;
    if (instant) this.amp = 1;
  }
  douse(instant = false) {
    this.target = 0;
    if (instant) this.amp = 0;
  }
  get lit() {
    return this.target > 0.5;
  }
  update(dt) {
    const k = this.target > this.amp ? 2.2 : 1.6;
    this.amp += Math.sign(this.target - this.amp) * Math.min(Math.abs(this.target - this.amp), dt * k);
    const a = this.amp;
    this.group.visible = a > 0.01;
    if (!this.group.visible) return;
    this.fm.uniforms.uAmp.value = a;
    if (this.em) this.em.uniforms.uAmp.value = a;
    if (this.gm) this.gm.uniforms.uI.value = a * (0.35 + this.sys.night * 1.1) * (0.92 + Math.sin(this.sys.shared.uTime.value * 9.0 + this.scale) * 0.08);
  }
}

// Glowing beam between two points (unit cylinder stretched)
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
export function makeBeamMaterial(color = new THREE.Color(3.0, 2.0, 0.9), opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
export function beamMesh(a, b, radius, mat) {
  const m = new THREE.Mesh(beamGeo, mat);
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.scale.set(radius, len, radius);
  m.renderOrder = 4;
  return m;
}
