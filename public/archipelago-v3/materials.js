import * as THREE from './three.module.min.js';

// Shared uniforms that every custom shader references (same objects, so one write updates all).
export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uFogColor: { value: new THREE.Color(0.9, 0.7, 0.5) },
  uFogNear: { value: 100 },
  uFogFar: { value: 600 },
  uPixelRatio: { value: 1 },
};

let grad = null;
export function gradientMap() {
  if (!grad) {
    const d = new Uint8Array([62, 140, 215, 255]);
    grad = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
    grad.minFilter = THREE.NearestFilter;
    grad.magFilter = THREE.NearestFilter;
    grad.generateMipmaps = false;
    grad.needsUpdate = true;
  }
  return grad;
}

const cache = new Map();
// Cached cel material. opts may include emissive, vertexColors, side, etc.
export function toon(color, opts = {}) {
  const key = String(color) + JSON.stringify(opts);
  let m = cache.get(key);
  if (!m) {
    m = makeToon(color, opts);
    cache.set(key, m);
  }
  return m;
}

// MeshToonMaterial rejects flatShading in its constructor, but the renderer still honours
// the property (FLAT_SHADED derivative normals), so set it afterwards.
function makeToon(color, opts) {
  const { flatShading, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...rest });
  if (flatShading) m.flatShading = true;
  return m;
}

// Unique (non-cached) cel material, for things whose emissive animates.
export function toonUnique(color, opts = {}) {
  return makeToon(color, opts);
}

// Wind sway for foliage. Uses local y as the sway weight; instance position de-syncs phases.
export function addWind(mat, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ipos = vec3(0.0);
      #endif
      float swy = max(transformed.y, 0.0);
      float sph = uTime * 1.6 + ipos.x * 0.13 + ipos.z * 0.09;
      transformed.x += sin(sph) * ${amount.toFixed(4)} * swy * swy;
      transformed.z += cos(sph * 0.83) * ${(amount * 0.6).toFixed(4)} * swy * swy;`
    );
  };
  mat.customProgramCacheKey = () => 'wind' + amount;
  return mat;
}

export const GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }
`;

// Additive glowing material for beams, columns, sky links. Reveal runs along uv.x.
export function beamMaterial(color, strength = 3.0, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uReveal: { value: 1 },
      uTime: U.uTime,
      uNight: U.uNight,
      uAlong: { value: opts.along ? 1 : 0 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength, uReveal, uTime, uNight, uAlong; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float along = uAlong > 0.5 ? vUv.x : vUv.y;
        if (along > uReveal) discard;
        float rim = abs(dot(normalize(vN), vV));
        float core = pow(rim, 1.5);
        float pulse = 0.85 + 0.15 * sin(along * 40.0 - uTime * 6.0);
        float tip = smoothstep(uReveal, uReveal - 0.04, along);
        vec3 c = uColor * uStrength * core * pulse * (0.35 + 0.65 * uNight) * tip;
        gl_FragColor = vec4(c, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}
