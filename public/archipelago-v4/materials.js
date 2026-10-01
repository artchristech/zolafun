// Shared materials: cel (toon) ramp, swaying foliage with matching shadow
// depth material, and the dithered canopy fade.
import * as THREE from './three.module.min.js';

export const shared = {
  uTime: { value: 0 },
  uFadeA: { value: new THREE.Vector3() }, // camera
  uFadeB: { value: new THREE.Vector3() }, // player head
  uWind: { value: 1 },
};

let _ramp = null;
export function toonRamp() {
  if (_ramp) return _ramp;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  _ramp = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
  _ramp.generateMipmaps = false;
  _ramp.needsUpdate = true;
  return _ramp;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts.params });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  if (opts.emissiveIntensity !== undefined) m.emissiveIntensity = opts.emissiveIntensity;
  if (opts.side) m.side = opts.side;
  if (opts.vertexColors) m.vertexColors = true;
  if (opts.flat) m.flatShading = true;
  if (!opts.unique) cache.set(key, m);
  return m;
}

// GLSL used by both the visible material and its shadow depth material so
// moving foliage casts moving shadows.
const SWAY_PARS = `
uniform float uTime; uniform float uSwayAmp; uniform float uSwayBase; uniform float uWind;
`;
const SWAY_CODE = `
#ifdef USE_INSTANCING
  vec4 swW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#else
  vec4 swW = modelMatrix * vec4(transformed, 1.0);
#endif
  float swH = max(0.0, transformed.y - uSwayBase);
  float swP = uTime * 1.35 + swW.x * 0.13 + swW.z * 0.11;
  float sw = (sin(swP) * 0.6 + sin(swP * 2.3 + swW.z * 0.4) * 0.25) * uWind;
  transformed.x += sw * swH * uSwayAmp;
  transformed.z += cos(uTime * 1.07 + swW.z * 0.17 + swW.x * 0.05) * swH * uSwayAmp * 0.55 * uWind;
`;

function addSway(shader, amp, base) {
  shader.uniforms.uTime = shared.uTime;
  shader.uniforms.uWind = shared.uWind;
  shader.uniforms.uSwayAmp = { value: amp };
  shader.uniforms.uSwayBase = { value: base };
  shader.vertexShader = SWAY_PARS + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY_CODE);
}

// canopy: sway + dithered fade when it sits between camera and player
export function canopyMaterial(name, amp, base, canopyY, radius) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), vertexColors: true });
  m.onBeforeCompile = (shader) => {
    addSway(shader, amp, base);
    shader.uniforms.uFadeA = shared.uFadeA;
    shader.uniforms.uFadeB = shared.uFadeB;
    shader.uniforms.uCanopyY = { value: canopyY };
    shader.uniforms.uCanopyR = { value: radius };
    shader.vertexShader = 'uniform vec3 uFadeA; uniform vec3 uFadeB; uniform float uCanopyY; uniform float uCanopyR; varying float vFade;\n' +
      shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  mat4 fadeM = modelMatrix * instanceMatrix;
#else
  mat4 fadeM = modelMatrix;
#endif
  vec3 cC = (fadeM * vec4(0.0, uCanopyY, 0.0, 1.0)).xyz;
  float cS = length(fadeM[0].xyz);
  vec3 ab = uFadeB - uFadeA;
  float ft = clamp(dot(cC - uFadeA, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  float fd = length(uFadeA + ab * ft - cC);
  vFade = (1.0 - smoothstep(uCanopyR * cS * 0.8, uCanopyR * cS * 1.5, fd)) * step(0.02, ft) * (1.0 - step(0.985, ft));
`);
    shader.fragmentShader = 'varying float vFade;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (vFade * 0.92 > ign) discard;
`);
  };
  m.customProgramCacheKey = () => 'canopy-' + name;
  return m;
}

export function swayMaterial(name, amp, base, params = {}) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), vertexColors: true, ...params });
  m.onBeforeCompile = (shader) => addSway(shader, amp, base);
  m.customProgramCacheKey = () => 'sway-' + name;
  return m;
}

export function swayDepthMaterial(name, amp, base) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => addSway(shader, amp, base);
  m.customProgramCacheKey = () => 'swaydepth-' + name;
  return m;
}

// simple additive glow material (sprites, beams)
export function glowMaterial(color, intensity = 1, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: opts.fog === true, side: opts.side || THREE.FrontSide, opacity: opts.opacity ?? 1,
  });
}

// merge non-indexed geometries with position/normal/color(/uv dropped)
export function mergeGeoms(list) {
  let n = 0;
  const parts = list.map((g) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
// paint a geometry with one colour (adds a color attribute)
export function paint(g, hex, jitter = 0, seed = 1) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    const j = 1 + ((s / 2147483647) - 0.5) * jitter;
    arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
// transform helper returning the same geometry
export function xf(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
}
