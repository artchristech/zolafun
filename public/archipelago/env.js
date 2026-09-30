// Sky, sea, terrain and the golden-hour-to-night palette.
import * as THREE from "./three.module.min.js";
import { BOUNDS, SEAFLOOR, terrainH, seabedH, fbm, smoothstep } from "./world.js";

// ---------------------------------------------------------------------------
// Toon helpers

export const gradientMap = (() => {
  const t = new THREE.DataTexture(
    new Uint8Array([90, 90, 90, 255, 165, 165, 165, 255, 225, 225, 225, 255, 255, 255, 255, 255]),
    4,
    1,
    THREE.RGBAFormat
  );
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

// Inverted-hull outlines. Normals are welded so hard-edged boxes stay closed.
const outlineGeos = new WeakMap();
function weldedNormals(geo) {
  if (outlineGeos.has(geo)) return outlineGeos.get(geo);
  const g = geo.clone();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const acc = new Map();
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = acc.get(k) || [0, 0, 0];
    a[0] += nor.getX(i);
    a[1] += nor.getY(i);
    a[2] += nor.getZ(i);
    acc.set(k, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  outlineGeos.set(geo, g);
  return g;
}

export const outlineUniforms = { uColor: { value: new THREE.Color(0x3a2a35) } };
const outlineMats = new Map();
function outlineMat(width) {
  if (outlineMats.has(width)) return outlineMats.get(width);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uWidth: { value: width } }]),
    vertexShader: /* glsl */ `
      uniform float uWidth;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position + normal * uWidth;
        vec4 mvPosition = vec4(p, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  m.uniforms.uColor = outlineUniforms.uColor;
  outlineMats.set(width, m);
  return m;
}

export function outline(mesh, width = 0.07) {
  const o = new THREE.Mesh(weldedNormals(mesh.geometry), outlineMat(width));
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

// Soft round glow used for flames, stars and sparks.
export const glowTexture = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,240,200,0.85)");
  grd.addColorStop(0.45, "rgba(255,180,90,0.25)");
  grd.addColorStop(1, "rgba(255,150,60,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

export function glowSprite(color, size) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    })
  );
  s.scale.setScalar(size);
  s.renderOrder = 2; // after the sea, which writes depth
  return s;
}

// ---------------------------------------------------------------------------
// Palette keyed by the fraction of the 20-minute day that has passed.

const KEYS = [
  { t: 0.0, el: 13, top: 0x6fa6dc, hor: 0xffd9a0, sun: 0xffd59a, sunI: 2.4, hs: 0xffe7c4, hg: 0x7c86b0, hI: 1.25, fog: 0xf7cf98, deep: 0x1f73a8, shal: 0x42d3c6, ol: 0x3d2b33, night: 0 },
  { t: 0.42, el: 4, top: 0x5b7fc6, hor: 0xffaa66, sun: 0xffa860, sunI: 2.1, hs: 0xffc9a0, hg: 0x646aa0, hI: 1.1, fog: 0xf3a46f, deep: 0x1d5d95, shal: 0x38b9bb, ol: 0x3a2433, night: 0.05 },
  { t: 0.64, el: -1.5, top: 0x3a4a92, hor: 0xf2877a, sun: 0xff8a66, sunI: 0.9, hs: 0xc497b8, hg: 0x40467e, hI: 0.95, fog: 0xc07c8c, deep: 0x1b417c, shal: 0x2f8ba2, ol: 0x2c1f3a, night: 0.3 },
  { t: 0.82, el: -6, top: 0x18245e, hor: 0x4c5ea4, sun: 0x8ea3e0, sunI: 0.45, hs: 0x5a6cb0, hg: 0x1e2656, hI: 0.75, fog: 0x34447f, deep: 0x122b5b, shal: 0x205f88, ol: 0x141a3a, night: 0.75 },
  { t: 1.0, el: -12, top: 0x060b25, hor: 0x1b2b5e, sun: 0x7288d2, sunI: 0.32, hs: 0x34427e, hg: 0x10173a, hI: 0.6, fog: 0x1b2758, deep: 0x0b1a3d, shal: 0x16406b, ol: 0x0b0f24, night: 1 },
];
const COLOR_KEYS = ["top", "hor", "sun", "hs", "hg", "fog", "deep", "shal", "ol"];
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = new THREE.Color(k[c]);

export const SUN_AZ = THREE.MathUtils.degToRad(196);
export const STAR_AZ = THREE.MathUtils.degToRad(-60);
export const STAR_EL = THREE.MathUtils.degToRad(13);
const MOON_AZ = THREE.MathUtils.degToRad(35);

export function dirFrom(az, el) {
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

export function samplePalette(f, out) {
  f = Math.min(1, Math.max(0, f));
  let i = 0;
  while (i < KEYS.length - 2 && f > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const u = smoothstep(0, 1, (f - a.t) / (b.t - a.t));
  for (const c of COLOR_KEYS) (out[c] ||= new THREE.Color()).copy(a[c]).lerp(b[c], u);
  for (const n of ["el", "sunI", "hI", "night"]) out[n] = a[n] + (b[n] - a[n]) * u;
  const el = THREE.MathUtils.degToRad(out.el);
  out.sunDir = dirFrom(SUN_AZ + f * 0.12, el);
  out.moonDir = dirFrom(MOON_AZ, THREE.MathUtils.degToRad(8 + 40 * smoothstep(0.55, 1, f)));
  out.day = smoothstep(-6, 3, out.el);
  return out;
}

// ---------------------------------------------------------------------------
// Sky dome

export function makeSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3() },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uSun, uSunDir, uMoonDir;
      uniform float uNight, uTime;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col = mix(uHor, uTop, pow(smoothstep(-0.02, 0.62, e), 0.75));
        // warm band hugging the horizon under the sun
        vec2 hz = normalize(d.xz + 1e-5);
        float toward = max(dot(hz, normalize(uSunDir.xz)), 0.0);
        float band = (1.0 - smoothstep(0.0, 0.32, abs(e - 0.02))) * pow(toward, 3.0);
        col += uSun * band * 0.45 * (1.0 - uNight * 0.7);
        // sun: cel disc and two halos
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 90.0) * 0.55 + pow(s, 12.0) * 0.18) * (1.0 - uNight);
        col = mix(col, vec3(1.0, 0.97, 0.86), smoothstep(0.99935, 0.9995, s) * (1.0 - uNight));
        // moon
        float m = dot(d, normalize(uMoonDir));
        col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.99955, 0.9997, m) * uNight);
        col += vec3(0.35, 0.45, 0.8) * pow(max(m, 0.0), 40.0) * 0.25 * uNight;
        // stars
        if (uNight > 0.02 && e > 0.0) {
          vec3 p = d * 170.0;
          vec3 c = floor(p);
          float h = hash(c);
          if (h > 0.985) {
            float r = length(fract(p) - 0.5);
            float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 60.0);
            col += vec3(0.9, 0.93, 1.0) * smoothstep(0.22, 0.0, r) * tw * uNight * smoothstep(0.0, 0.15, e) * 1.2;
          }
        }
        // below the horizon the sky hands over to the fog color
        col = mix(col, uHor, smoothstep(0.0, -0.08, e));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// Flat, rounded Wind Waker-ish clouds on the horizon.
export function makeClouds(random) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  const puffs = [
    [60, 84, 34], [100, 70, 42], [148, 66, 46], [190, 80, 34], [128, 92, 36], [80, 96, 22], [210, 96, 20],
  ];
  for (const [x, y, r] of puffs) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.clearRect(0, 100, 256, 28);
  const tex = new THREE.CanvasTexture(c);
  const group = new THREE.Group();
  const mats = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 });
    mats.push(m);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), m);
    const az = random() * Math.PI * 2;
    const el = THREE.MathUtils.degToRad(2 + random() * 11);
    const R = 820;
    mesh.position.set(Math.cos(az) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(az) * Math.cos(el) * R);
    mesh.lookAt(0, mesh.position.y, 0);
    const w = 160 + random() * 220;
    mesh.scale.set(w, w * (0.6 + random() * 0.3), 1);
    mesh.userData.az = az;
    mesh.renderOrder = -9;
    group.add(mesh);
  }
  return { group, mats };
}

// ---------------------------------------------------------------------------
// Terrain mesh

export function makeTerrain() {
  const seg = 220;
  const geo = new THREE.PlaneGeometry(BOUNDS.size, BOUNDS.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cx = BOUNDS.min + BOUNDS.size / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cx;
    pos.setXYZ(i, x, terrainH(x, z), z);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xf2dca2), wet = new THREE.Color(0xc9b686), deepSand = new THREE.Color(0x8fae9c);
  const grass = new THREE.Color(0x86c85a), grass2 = new THREE.Color(0x5ea64c), rock = new THREE.Color(0xa99a8a), rock2 = new THREE.Color(0x8d8196);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = nor.getY(i);
    const n = fbm(x * 0.09, z * 0.09);
    if (y < 1.2) {
      c.copy(deepSand).lerp(wet, smoothstep(SEAFLOOR, -1, y)).lerp(sand, smoothstep(-1, 1.2, y));
    } else if (y < 2.9 + n * 1.2) {
      c.copy(sand);
    } else {
      c.copy(grass).lerp(grass2, smoothstep(0.35, 0.75, n));
      c.lerp(grass2, smoothstep(8, 20, y) * 0.6);
    }
    const steep = smoothstep(0.82, 0.62, ny);
    if (y > 2 && steep > 0) c.lerp(n > 0.5 ? rock : rock2, steep);
    if (y > 23) c.lerp(rock, 0.55);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Sea

export function makeSea() {
  const N = 512;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = BOUNDS.min + ((i + 0.5) / N) * BOUNDS.size;
      const z = BOUNDS.min + ((j + 0.5) / N) * BOUNDS.size;
      const h = seabedH(x, z);
      const v = Math.round(Math.min(1, Math.max(0, (h + 10) / 16)) * 255);
      const k = (j * N + i) * 4;
      data[k] = v;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const uniforms = {
    uHeight: { value: tex },
    uBounds: { value: new THREE.Vector2(BOUNDS.min, BOUNDS.size) },
    uTide: { value: 2 },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color(0xfffaf0) },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 100 },
    uFogFar: { value: 500 },
    uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += sin(w.x * 0.21 + uTime * 0.9) * 0.05 + sin(w.z * 0.17 - uTime * 0.7) * 0.05;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uHeight;
      uniform vec2 uBounds;
      uniform float uTide, uTime, uFogNear, uFogFar, uNight;
      uniform vec3 uDeep, uShallow, uFoam, uSun, uSunDir, uFogColor;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 uv = (vWorld.xz - uBounds.x) / uBounds.y;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float bed = mix(-10.0, texture2D(uHeight, uv).r * 16.0 - 10.0, inside);
        float depth = uTide - bed;
        float n = vnoise(vWorld.xz * 0.35 + uTime * 0.25);
        float n2 = vnoise(vWorld.xz * 0.06 - uTime * 0.03);

        vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 4.5, depth));
        // Wind Waker squiggles: contour lines of drifting noise on open water
        float cn = vnoise(vWorld.xz * 0.045 + vec2(uTime * 0.02, -uTime * 0.013)) + n2 * 0.5;
        float lines = smoothstep(0.455, 0.475, abs(fract(cn * 4.0) - 0.5));
        lines *= smoothstep(2.5, 6.0, depth) * smoothstep(0.55, 0.7, vnoise(vWorld.xz * 0.025 + 3.0));
        lines *= 1.0 - smoothstep(60.0, 220.0, length(vWorld.xz - cameraPosition.xz));
        col = mix(col, mix(uShallow, uFoam, 0.6), lines * 0.75);
        // lapping foam: a hard shore band plus a pulsing ring further out
        float shore = step(depth, 0.28 + 0.22 * sin(uTime * 1.3 + n2 * 9.0) + n * 0.18);
        float ring = step(abs(depth - (0.95 + 0.25 * sin(uTime * 0.8 + n2 * 6.0))), 0.07 + n * 0.05);
        float foam = max(shore, ring * 0.85) * step(-0.6, depth);
        // sun glitter
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 nrm = normalize(vec3((n - 0.5) * 0.35, 1.0, (vnoise(vWorld.zx * 0.4 - uTime * 0.3) - 0.5) * 0.35));
        float spec = pow(max(dot(reflect(-uSunDir, nrm), v), 0.0), 60.0);
        float glint = step(0.5, spec) * (1.0 - uNight) * smoothstep(-0.05, 0.05, uSunDir.y);
        col = mix(col, uSun * 1.1 + 0.2, glint * 0.8);
        col = mix(col, uFoam, foam);
        float alpha = mix(0.42, 1.0, smoothstep(0.0, 3.2, depth));
        alpha = max(alpha, foam);
        float dist = length(vWorld - cameraPosition);
        float fog = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uFogColor, fog);
        alpha = mix(alpha, 1.0, fog);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(2400, 2400, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
