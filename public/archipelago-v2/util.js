// three.js helpers shared by all modules
import * as THREE from './three.module.min.js';

let _grad = null;
export function toonGradient() {
  if (_grad) return _grad;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  _grad.minFilter = THREE.NearestFilter;
  _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const { unique, ...rest } = opts;
  const key = color + JSON.stringify(rest);
  if (!unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...rest });
  if (!unique) matCache.set(key, m);
  return m;
}

// Inverted-hull outline material (fog aware)
const outlineMats = new Map();
export function outlineMaterial(thickness = 0.03, color = 0x1a1410) {
  const key = thickness + ':' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uThick: { value: thickness }, uColor: { value: new THREE.Color(color) }, uNight: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uThick;
      void main(){
        vec3 p = position + normal * uThick;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        #endif
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uNight;
      void main(){
        gl_FragColor = vec4(uColor * (1.0 - 0.6*uNight), 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  outlineMats.set(key, m);
  return m;
}
export const allOutlineMats = () => [...outlineMats.values()];

export function addOutline(mesh, thickness = 0.03, color = 0x1a1410) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  o.castShadow = false;
  o.receiveShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

// Merge non-indexed geometries with position/normal (+ optional color)
export function mergeGeos(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const hasColor = parts.some((g) => g.attributes.color);
  const col = hasColor ? new Float32Array(n * 3) : null;
  const hasUv = parts.every((g) => g.attributes.uv);
  const uv = hasUv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (col) {
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
      else col.fill(1, o * 3, (o + c) * 3);
    }
    if (uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export function colorGeo(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function makeGlow(color, size, intensity = 1) {
  const m = new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(color).multiplyScalar(intensity),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

// shared time uniform for all animated shaders
export const globalUniforms = { uTime: { value: 0 }, uNight: { value: 0 } };

// Add gentle wind sway to a standard material (instanced foliage / grass)
export function addWind(material, strength = 0.1, heightScale = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = ip.x * 0.21 + ip.z * 0.17;
          float hgt = max(position.y, 0.0) * ${heightScale.toFixed(3)};
          float sway = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.3;
          transformed.x += sway * ${strength.toFixed(3)} * hgt * hgt;
          transformed.z += cos(uTime * 1.3 + ph) * ${(strength * 0.6).toFixed(3)} * hgt * hgt;
        }`);
  };
  material.customProgramCacheKey = () => 'wind' + strength + ':' + heightScale;
  return material;
}
