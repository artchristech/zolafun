// Cel-shaded animated flames (camera-facing tongues with hard colour bands)
// plus rising embers. Everything is animated in the shader from a shared clock.
import * as THREE from './three.module.min.js';
import { shared } from './materials.js';

const NOISE = `
float fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1,0)), u.x), mix(fh(i + vec2(0,1)), fh(i + vec2(1,1)), u.x), u.y); }
float ff(vec2 p){ return fn(p) * 0.6 + fn(p * 2.1 + 3.7) * 0.3 + fn(p * 4.3 - 1.3) * 0.1; }
`;

const flameVS = `
attribute vec3 aOffset; attribute vec3 aInfo; // size, seed, lean
varying vec2 vUv; varying float vSeed;
#include <fog_pars_vertex>
void main(){
  vUv = uv; vSeed = aInfo.y;
  float s = length(modelMatrix[0].xyz);
  vec4 mvPosition = modelViewMatrix * vec4(aOffset, 1.0);
  mvPosition.xy += position.xy * aInfo.x * s;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const flameFS = `
uniform float uTime; uniform float uLevel; uniform float uIntensity; uniform float uFogScale;
varying vec2 vUv; varying float vSeed;
#include <fog_pars_fragment>
${NOISE}
void main(){
  if (uLevel < 0.01) discard;
  float y = vUv.y;
  float n = ff(vec2(vUv.x * 3.2 + vSeed * 7.0, y * 2.6 - uTime * 2.4 - vSeed));
  float n2 = fn(vec2(vUv.x * 6.0 - vSeed, y * 5.0 - uTime * 4.0));
  float width = 0.48 * pow(max(1.0 - y, 0.0), 0.85) * smoothstep(-0.05, 0.22, y);
  float sway = (n - 0.5) * 0.35 * y + sin(uTime * 3.0 + vSeed * 9.0) * 0.04 * y;
  float dx = abs(vUv.x - 0.5 - sway);
  float v = 1.0 - dx / max(width, 0.001);
  v -= y * 0.75 * n2 + y * 0.25;
  v *= uLevel;
  if (v < 0.06) discard;
  vec3 col = v > 0.55 ? vec3(1.0, 0.93, 0.62) : (v > 0.3 ? vec3(1.0, 0.56, 0.12) : vec3(0.88, 0.2, 0.05));
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #ifdef USE_FOG
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uFogScale);
  #endif
}`;

const emberVS = `
uniform float uTime; uniform float uLevel; uniform float uPix; uniform float uRise;
attribute vec4 aRand;
varying float vLife;
void main(){
  float s = length(modelMatrix[0].xyz);
  float life = fract(uTime * (0.32 + aRand.x * 0.35) + aRand.w);
  vec3 p = vec3((aRand.y - 0.5) * 0.7 + sin(uTime * 1.7 + aRand.w * 40.0) * 0.35 * life,
                life * uRise,
                (aRand.z - 0.5) * 0.7 + cos(uTime * 1.3 + aRand.w * 30.0) * 0.35 * life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.0 - life) * (0.6 + aRand.x) * 0.16 * s * uPix / max(-mv.z, 0.5) * step(0.01, uLevel);
  vLife = life;
}`;
const emberFS = `
uniform float uIntensity;
varying float vLife;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  vec3 col = mix(vec3(1.0, 0.8, 0.3), vec3(0.9, 0.2, 0.05), vLife);
  gl_FragColor = vec4(col * uIntensity * (1.0 - vLife * 0.6), 1.0);
}`;

export const fireShared = { uPix: { value: 600 } };

let flameGeo = null;
function getFlameGeo() {
  if (flameGeo) return flameGeo;
  // 5 tongues: one big central, four smaller around
  const tongues = [
    [0, 0, 0, 1.0, 0.1], [0.22, 0, 0.1, 0.7, 0.37], [-0.2, 0, -0.08, 0.75, 0.61], [0.05, 0, -0.22, 0.6, 0.83], [-0.08, 0, 0.2, 0.62, 0.21],
  ];
  const pos = [], uv = [], off = [], info = [], idx = [];
  tongues.forEach((t, i) => {
    const b = i * 4;
    const quad = [[-0.5, 0], [0.5, 0], [0.5, 1.6], [-0.5, 1.6]];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let k = 0; k < 4; k++) {
      pos.push(quad[k][0], quad[k][1], 0);
      uv.push(uvs[k][0], uvs[k][1]);
      off.push(t[0], t[1], t[2]);
      info.push(t[3], t[4], 0);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flameGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  flameGeo.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 3));
  flameGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
  flameGeo.setIndex(idx);
  flameGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.6);
  return flameGeo;
}

function emberGeo(n, seed) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), r = new Float32Array(n * 4);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n * 4; i++) r[i] = rnd();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(r, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4);
  return g;
}

let seedCounter = 1;
export function createFire({ scale = 1, intensity = 3.2, embers = 36, rise = 3.4, fogScale = 0.25 } = {}) {
  const group = new THREE.Group();
  const level = { value: 0 };
  const inten = { value: intensity };
  const fm = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLevel: { value: 0 }, uIntensity: { value: 0 }, uFogScale: { value: fogScale } }]),
    vertexShader: flameVS, fragmentShader: flameFS, fog: true, side: THREE.DoubleSide,
  });
  fm.uniforms.uTime = shared.uTime; fm.uniforms.uLevel = level; fm.uniforms.uIntensity = inten;
  const flame = new THREE.Mesh(getFlameGeo(), fm);
  flame.renderOrder = 2;
  group.add(flame);
  let em = null;
  if (embers > 0) {
    const emm = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uLevel: level, uPix: fireShared.uPix, uRise: { value: rise }, uIntensity: { value: intensity * 1.2 } },
      vertexShader: emberVS, fragmentShader: emberFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    em = new THREE.Points(emberGeo(embers, seedCounter++), emm);
    em.renderOrder = 5;
    group.add(em);
  }
  group.scale.setScalar(scale);
  return {
    group, flame, embers: em,
    setLevel(v) { level.value = v; },
    getLevel() { return level.value; },
    setIntensity(v) { inten.value = v; if (em) em.material.uniforms.uIntensity.value = v * 1.2; },
  };
}

// Distance-compensated glow disc so lit beacons read from across the sea at night.
const glowVS = `
uniform float uBase; uniform float uGrow;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float sz = max(uBase, -mv.z * uGrow);
  mv.xy += position.xy * sz;
  gl_Position = projectionMatrix * mv;
}`;
const glowFS = `
uniform vec3 uColor; uniform float uAmount;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.2);
  float core = smoothstep(0.25, 0.2, d);
  gl_FragColor = vec4(uColor * (a * 0.9 + core * 1.5) * uAmount, 1.0);
}`;
export function createGlow(color = 0xffa040, base = 3, grow = 0.012) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAmount: { value: 0 }, uBase: { value: base }, uGrow: { value: grow } },
    vertexShader: glowVS, fragmentShader: glowFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}
