// Shared materials and shader patches (sway, occluder fade).
import * as THREE from './three.module.min.js';

export const U = {
  uTime: { value: 0 },
  uFadeA: { value: new THREE.Vector3() },
  uFadeB: { value: new THREE.Vector3(0, -1000, 0) },
  uFireHDR: { value: 2 },
  uFogColor: { value: new THREE.Color() },
  uFogNear: { value: 100 },
  uFogFar: { value: 800 },
  uNight: { value: 0 },
  uWater: { value: 2.6 },
  uPointScale: { value: 500 },
};

let grad = null;
export function gradientMap() {
  if (grad) return grad;
  const v = [80, 80, 80, 205, 255, 255];
  const d = new Uint8Array(v.length * 4);
  v.forEach((x, i) => { d[i * 4] = x; d[i * 4 + 1] = x; d[i * 4 + 2] = x; d[i * 4 + 3] = 255; });
  grad = new THREE.DataTexture(d, v.length, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

export function toon(opts = {}) {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), ...opts });
}

// Emissive-looking unlit material whose color can exceed 1 for bloom.
export function glow(color, scale = 1, fog = false) {
  const c = new THREE.Color(color).multiplyScalar(scale);
  return new THREE.MeshBasicMaterial({ color: c, fog });
}

const swayVert = (swayBase, amp) => `#include <begin_vertex>
  vec3 iO = vec3(0.0);
  #ifdef USE_INSTANCING
  iO = instanceMatrix[3].xyz;
  #endif
  iO = (modelMatrix * vec4(iO, 1.0)).xyz;
  float swH = max(position.y - ${swayBase.toFixed(2)}, 0.0) * aFol;
  float swP = uTime * 1.35 + iO.x * 0.37 + iO.z * 0.23;
  transformed.x += sin(swP) * ${(0.03 * amp).toFixed(4)} * swH + sin(uTime * 3.1 + position.y * 2.0 + iO.z) * ${(0.012 * amp).toFixed(4)} * swH;
  transformed.z += sin(swP * 0.77 + 1.3) * ${(0.025 * amp).toFixed(4)} * swH;
  #ifdef USE_INSTANCING
  vFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
  vFW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  vFol = aFol;`;

const fadeFrag = `#include <clipping_planes_fragment>
  if (vFol > 0.5) {
    vec3 fab = uFadeB - uFadeA;
    float fl2 = max(dot(fab, fab), 1e-3);
    float ft = clamp(dot(vFW - uFadeA, fab) / fl2, 0.0, 1.0);
    float fd = length(vFW - (uFadeA + fab * ft));
    float fk = (1.0 - smoothstep(1.4, 3.2, fd)) * smoothstep(0.0, 0.06, ft);
    fk = max(fk, 1.0 - smoothstep(1.2, 2.6, length(vFW - uFadeB)));
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (fk * 0.92 > ign) discard;
  }`;

// Foliage material: sway in the wind, dither away when between camera and player.
export function foliageMaterial(key, swayBase = 1.0, amp = 1.0, fade = true) {
  const m = toon();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uFadeA = U.uFadeA;
    sh.uniforms.uFadeB = U.uFadeB;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aFol;\nvarying vec3 vFW;\nvarying float vFol;')
      .replace('#include <begin_vertex>', swayVert(swayBase, amp));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFadeA;\nuniform vec3 uFadeB;\nvarying vec3 vFW;\nvarying float vFol;')
      .replace('#include <clipping_planes_fragment>', fade ? fadeFrag : '#include <clipping_planes_fragment>');
  };
  m.customProgramCacheKey = () => `fol-${key}`;
  return m;
}

// Matching depth material so shadows move with the foliage.
export function foliageDepth(key, swayBase = 1.0, amp = 1.0) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aFol;\nvarying vec3 vFW;\nvarying float vFol;')
      .replace('#include <begin_vertex>', swayVert(swayBase, amp));
  };
  m.customProgramCacheKey = () => `fold-${key}`;
  return m;
}

export const GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;
