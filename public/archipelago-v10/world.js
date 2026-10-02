// Terrain, water, sky, causeways, rocks and the golden-hour-to-night environment.
import * as THREE from './three.module.min.js';
import { Hn, Hc, RES, N, naturalH, naturalSurf, groundH } from './ground.js';
import { EXTENT, ISLANDS, CAUSEWAYS, SEABED, SURF, TIDE, TRAIL, pol } from './layout.js';
import { fbm, mulberry32, mat, smoothstep, clamp, lerp } from './util.js';

// ---------------------------------------------------------------- terrain
const C = (h) => new THREE.Color(h);
const COL = {
  sand: C('#e9cf95'), wet: C('#b39a6c'), bed: C('#6f8070'),
  grass: C('#86b94c'), grass2: C('#5f9a39'), rock: C('#9a8f84'), rock2: C('#7d756d'),
  dirt: C('#c9a26a'), stone: C('#b9ae9c'),
};

export function buildTerrain(scene, material) {
  const TILE = 40, STEP = 1.25, n = Math.round(TILE / STEP);
  const tiles = [];
  const tmp = new THREE.Color();
  for (let tx = -5; tx < 5; tx++) {
    for (let tz = -5; tz < 5; tz++) {
      const x0 = tx * TILE, z0 = tz * TILE;
      let any = false;
      for (let a = 0; a <= n && !any; a += 2) for (let b = 0; b <= n; b += 2) if (naturalH(x0 + a * STEP, z0 + b * STEP) > -0.8) { any = true; break; }
      if (!any) continue;
      const vc = (n + 1) * (n + 1);
      const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
      const hs = new Float32Array(vc);
      for (let b = 0; b <= n; b++) {
        for (let a = 0; a <= n; a++) {
          const i = b * (n + 1) + a;
          const x = x0 + a * STEP, z = z0 + b * STEP;
          const h = naturalH(x, z);
          hs[i] = h;
          pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
          const e = STEP;
          const gx = (naturalH(x + e, z) - naturalH(x - e, z)) / (2 * e);
          const gz = (naturalH(x, z + e) - naturalH(x, z - e)) / (2 * e);
          const l = Math.sqrt(gx * gx + 1 + gz * gz);
          nor[i * 3] = -gx / l; nor[i * 3 + 1] = 1 / l; nor[i * 3 + 2] = -gz / l;
          const s = naturalSurf(x, z);
          const slope = Math.sqrt(gx * gx + gz * gz);
          const nz = fbm(x * 0.08, z * 0.08, 2, 5) * 0.5 + 0.5;
          if (s === SURF.DIRT) tmp.copy(COL.dirt).lerp(COL.sand, nz * 0.3);
          else if (s === SURF.STONE) tmp.copy(slope > 0.95 ? COL.rock : COL.stone).lerp(COL.rock2, nz * 0.5);
          else if (s === SURF.GRASS) {
            tmp.copy(COL.grass).lerp(COL.grass2, nz);
            if (h < 3.6) tmp.lerp(COL.sand, smoothstep(3.6, 3.0, h));
          } else {
            tmp.copy(COL.sand);
            if (h < 2.4) tmp.lerp(COL.wet, smoothstep(2.4, 0.5, h) * 0.8);
            if (h < -0.5) tmp.lerp(COL.bed, smoothstep(-0.5, -3, h));
          }
          col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        }
      }
      const idx = [];
      for (let b = 0; b < n; b++) {
        for (let a = 0; a < n; a++) {
          const i0 = b * (n + 1) + a, i1 = i0 + 1, i2 = i0 + n + 1, i3 = i2 + 1;
          if (Math.max(hs[i0], hs[i1], hs[i2], hs[i3]) < -0.9) continue;
          idx.push(i0, i2, i1, i1, i2, i3);
        }
      }
      if (!idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      scene.add(m);
      tiles.push(m);
    }
  }
  return tiles;
}

// ---------------------------------------------------------------- water
export function bakeHeightTexture() {
  const S = 512;
  const data = new Uint8Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = -EXTENT + ((i + 0.5) / S) * EXTENT * 2;
      const z = -EXTENT + ((j + 0.5) / S) * EXTENT * 2;
      const fx = (x + EXTENT) / RES, fz = (z + EXTENT) / RES;
      const ix = Math.min(N - 2, Math.floor(fx)), iz = Math.min(N - 2, Math.floor(fz));
      const tx = fx - ix, tz = fz - iz, k = iz * N + ix;
      const h = (Hc[k] * (1 - tx) + Hc[k + 1] * tx) * (1 - tz) + (Hc[k + N] * (1 - tx) + Hc[k + N + 1] * tx) * tz;
      data[j * S + i] = Math.round(clamp((h + 8) / 20, 0, 1) * 255);
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RedFormat);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const waterVS = /* glsl */ `
uniform float uTime;
varying vec3 vW;
void main(){
  vec4 w = modelMatrix*vec4(position,1.0);
  w.y += (sin(w.x*0.16+uTime*0.9)+sin(w.z*0.13-uTime*0.7))*0.035;
  vW = w.xyz;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const waterFS = /* glsl */ `
uniform sampler2D uHeight;
uniform float uWater, uTime, uFogDen, uNight;
uniform vec3 uShallow, uDeep, uFoam, uSky, uSunDir, uSunCol, uFogCol;
uniform vec3 uLP[5];
uniform vec3 uLC[5];
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
void main(){
  vec2 uv = (vW.xz + ${EXTENT.toFixed(1)}) / ${(EXTENT * 2).toFixed(1)};
  float bed = -8.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) bed = texture2D(uHeight, uv).r*20.0 - 8.0;
  float depth = uWater - bed;
  float dk = smoothstep(0.0, 4.5, depth);
  dk = floor(dk*4.0+0.5)/4.0;
  vec3 col = mix(uShallow, uDeep, dk);
  vec2 q = vW.xz*0.35 + vec2(uTime*0.15, uTime*0.11);
  float ripple = n2(q) + n2(q*2.3 - uTime*0.2)*0.5;
  vec3 nrm = normalize(vec3((ripple-0.75)*0.18, 1.0, (n2(q.yx*1.7)-0.5)*0.18));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(V, nrm), 0.0), 3.0);
  col = mix(col, uSky, clamp(fres*0.8, 0.0, 0.7));
  vec3 R = reflect(-V, nrm);
  float s = pow(max(dot(R, uSunDir), 0.0), 120.0);
  col += uSunCol * step(0.35, s) * 0.9 * (1.0-uNight);
  for (int i=0;i<5;i++){
    vec3 L = uLP[i] - vW;
    float d = length(L);
    float g = pow(max(dot(R, L/d), 0.0), 60.0);
    col += uLC[i] * (step(0.3, g)*0.8 + g*0.4) * (8.0/(4.0+d*0.08));
  }
  float edge = step(depth, 0.18 + 0.07*sin(uTime*1.6 + vW.x*0.35 + vW.z*0.25));
  float band = step(0.82, fract(depth*0.85 - uTime*0.22 + n2(vW.xz*0.2)*0.4)) * step(depth, 2.4);
  float caps = step(0.83, n2(vW.xz*0.12 + uTime*0.05)*n2(vW.xz*0.31 - uTime*0.07)*1.9) * smoothstep(3.0, 8.0, depth);
  float foam = clamp(edge + band*0.85 + caps*0.6, 0.0, 1.0);
  col = mix(col, uFoam, foam);
  float fd = length(vW - cameraPosition);
  float ff = 1.0 - exp(-uFogDen*uFogDen*fd*fd);
  col = mix(col, uFogCol, ff);
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildWater(scene, heightTex) {
  const lp = [], lc = [];
  for (let i = 0; i < 5; i++) {
    lp.push(new THREE.Vector3(0, -100, 0));
    lc.push(new THREE.Color(0, 0, 0));
  }
  const mat = new THREE.ShaderMaterial({
    vertexShader: waterVS,
    fragmentShader: waterFS,
    uniforms: {
      uHeight: { value: heightTex }, uWater: { value: TIDE[0] }, uTime: { value: 0 }, uFogDen: { value: 0.002 }, uNight: { value: 0 },
      uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
      uFogCol: { value: new THREE.Color() }, uLP: { value: lp }, uLC: { value: lc },
    },
  });
  const g = new THREE.PlaneGeometry(1400, 1400, 70, 70).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------- sky
const skyVS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0);
  gl_Position = p.xyww;
}`;
const skyFS = /* glsl */ `
uniform vec3 uZen, uHor, uSunDir, uSunCol, uCloud, uCloudLit;
uniform float uNight, uTime;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHor, uZen, pow(smoothstep(-0.02, 0.65, y), 0.75));
  float sd = dot(d, uSunDir);
  col += uSunCol * pow(max(sd, 0.0), 6.0) * 0.45 * (1.0-uNight);
  col += uSunCol * pow(max(sd, 0.0), 60.0) * 0.6 * (1.0-uNight);
  float disc = step(0.9992, sd) * step(-0.03, uSunDir.y + 0.02);
  col = mix(col, uSunCol*2.6, disc*(1.0-uNight*0.6));
  // toon clouds
  if (y > 0.0) {
    vec2 cp = d.xz/(y+0.18)*1.6 + vec2(uTime*0.004, 0.0);
    float c = n2(cp*1.1)*0.6 + n2(cp*2.7)*0.3 + n2(cp*6.0)*0.1;
    float m = step(0.58, c) * smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.45, 0.8, y));
    float lit = step(0.66, c + dot(normalize(d.xz+0.0001), normalize(uSunDir.xz+0.0001))*0.08);
    vec3 cc = mix(uCloud, uCloudLit, lit);
    col = mix(col, cc, m*0.92);
    // stars
    vec2 sp = floor(d.xz/(y+0.3)*180.0);
    float st = step(0.9965, h21(sp)) * smoothstep(0.05, 0.3, y) * (1.0-m);
    col += vec3(st) * uNight * (0.6 + 0.4*sin(uTime*2.0 + sp.x));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVS, fragmentShader: skyFS,
    uniforms: {
      uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() },
      uNight: { value: 0 }, uTime: { value: 0 },
    },
    side: THREE.BackSide, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------- causeways
export function buildCauseways(builder, colliders) {
  const rng = mulberry32(77);
  const stone = new THREE.Color('#a59c8c'), dark = new THREE.Color('#6f6a5f'), algae = new THREE.Color('#4f6b4a');
  for (let k = 0; k < CAUSEWAYS.length; k++) {
    const c = CAUSEWAYS[k];
    const yaw = Math.atan2(c.ux, c.uz);
    const submergedTo = TIDE[k];
    const bodyColor = (x, y, z, base, out) => {
      out.copy(base);
      if (y < submergedTo + 0.1) out.lerp(algae, 0.55);
      if (y < TIDE[0] + 0.1 && y > submergedTo + 0.1) out.lerp(dark, 0.3);
      return out;
    };
    const STEP = 1.6;
    const n = Math.ceil((c.len + 4) / STEP);
    for (let i = 0; i < n; i++) {
      const along = -2 + i * STEP + STEP / 2;
      const x = c.x0 + c.ux * along, z = c.z0 + c.uz * along;
      const nat = naturalH(x, z);
      if (nat > c.top + 0.4) continue;
      const bottom = Math.max(SEABED - 0.5, Math.min(nat - 0.3, c.top - 1));
      const hgt = c.top - 0.25 - bottom;
      builder.add(new THREE.BoxGeometry(c.hw * 2 + 0.6, hgt, STEP * 0.98), mat(x, bottom + hgt / 2, z, 0, yaw, 0), dark, { colorFn: bodyColor });
      // paving: two slabs across
      for (let s = -1; s <= 1; s += 2) {
        const off = s * c.hw * 0.5;
        const px = x + c.uz * off, pz = z - c.ux * off;
        const jit = (rng() - 0.5) * 0.04;
        const tint = stone.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.08);
        builder.add(new THREE.BoxGeometry(c.hw - 0.08, 0.3, STEP - 0.1), mat(px, c.top - 0.15 + jit, pz, (rng() - 0.5) * 0.02, yaw + (rng() - 0.5) * 0.03, 0), tint, { colorFn: bodyColor });
      }
      // occasional broken posts along the edge
      if (rng() < 0.18) {
        const s = rng() < 0.5 ? -1 : 1;
        const off = s * (c.hw + 0.15);
        const px = x + c.uz * off, pz = z - c.ux * off;
        const ph = 0.6 + rng() * 1.2;
        builder.add(new THREE.CylinderGeometry(0.25, 0.32, ph + (c.top - bottom), 6), mat(px, (c.top + ph + bottom) / 2, pz, 0, rng() * 3, 0), stone, { flat: true, colorFn: bodyColor });
        colliders.circle(px, pz, 0.32, bottom, c.top + ph);
      }
    }
  }
}

// ---------------------------------------------------------------- rocks
export function buildRocks(batchFor, colliders) {
  const rng = mulberry32(4242);
  const cols = ['#8f877c', '#a39a8c', '#7c766e'];
  for (const isl of ISLANDS) {
    const count = isl.id === 2 ? 30 : 22;
    for (let i = 0; i < count; i++) {
      const a = rng() * 360, r = isl.R * (0.72 + rng() * 0.45);
      const p = pol(a, r, isl.x, isl.z);
      const h = naturalH(p.x, p.z);
      if (h < -1.5 || groundH(p.x, p.z) > h + 0.1) continue;
      const s = 0.5 + rng() * rng() * 2.2;
      const g = new THREE.DodecahedronGeometry(1, 0);
      batchFor(isl.id).add(g, mat(p.x, h - s * 0.25, p.z, rng() * 3, rng() * 6, rng() * 3, s * 1.2, s * 0.8, s), cols[i % 3], { flat: true });
      if (s > 0.7) colliders.circle(p.x, p.z, s * 0.95, h - s, h + s * 0.6);
    }
  }
  // sea stacks off the empty fifth bearing
  for (let i = 0; i < 6; i++) {
    const p = pol(288 + (rng() - 0.5) * 20, 115 + rng() * 25);
    const s = 2 + rng() * 3;
    const g = new THREE.DodecahedronGeometry(1, 0);
    batchFor(5).add(g, mat(p.x, -4 + s * 0.8, p.z, rng(), rng() * 6, rng(), s, s * (1.4 + rng()), s), cols[i % 3], { flat: true });
  }
}

// ---------------------------------------------------------------- trail markers
// edge stones along the downhill side of the switchback and cairns at every hairpin
export function buildTrailMarkers(builder, colliders) {
  const rng = mulberry32(606);
  const P = ISLANDS[3];
  let acc = 0;
  for (let i = 1; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i - 1], b = TRAIL[i], c = TRAIL[i + 1];
    const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz) || 1;
    acc += Math.hypot(b.x - a.x, b.z - a.z);
    if (b.r < 14) continue;
    // outward (downhill) side
    const ox = b.x - P.x, oz = b.z - P.z, ol = Math.hypot(ox, oz) || 1;
    let nx = -dz / l, nz = dx / l;
    if (nx * ox + nz * oz < 0) { nx = -nx; nz = -nz; }
    if (acc > 2.6) {
      acc = 0;
      const x = b.x + nx * 2.2, z = b.z + nz * 2.2;
      const s = 0.22 + rng() * 0.2;
      builder.add(new THREE.DodecahedronGeometry(1, 0), mat(x, Math.max(groundH(x, z), b.h - 0.2) + s * 0.4, z, rng(), rng() * 6, rng(), s * 1.3, s, s), '#a39a8c', { flat: true });
    }
    const turn = (b.a - a.a) * (c.a - b.a) < 0 && Math.abs(b.a - a.a) > 0.01;
    if (turn) {
      // outside of the bend, away from the centre of the hairpin
      let cx = 0, cz = 0, cn = 0;
      for (let j = Math.max(0, i - 5); j <= Math.min(TRAIL.length - 1, i + 5); j++) { cx += TRAIL[j].x; cz += TRAIL[j].z; cn++; }
      cx /= cn; cz /= cn;
      const wx = b.x - cx, wz = b.z - cz, wl = Math.hypot(wx, wz) || 1;
      const x = b.x + (wx / wl) * 2.9, z = b.z + (wz / wl) * 2.9;
      const g = Math.max(groundH(x, z), b.h - 0.3);
      for (let k = 0; k < 4; k++) {
        const s = 0.5 - k * 0.1;
        builder.add(new THREE.DodecahedronGeometry(1, 0), mat(x + (rng() - 0.5) * 0.1, g + 0.25 + k * 0.55, z, rng(), rng() * 6, rng(), s * 1.2, s * 0.8, s * 1.1), k === 3 ? '#e8b440' : '#b3a893', { flat: true });
      }
      colliders.circle(x, z, 0.55, g - 1, g + 2.5);
    }
  }
}

// ---------------------------------------------------------------- environment
const KEYS = [
  { p: 0.0, zen: '#5b8fd0', hor: '#ffc58c', sun: '#ffd49a', li: 2.7, hs: '#ffe0b8', hg: '#7d6c86', hi: 1.05, sh: '#63d2c2', dp: '#1f6e9c', fo: '#fff6e6', fog: 0.0021, cl: '#f6d8c0', cll: '#fff3dc', el: 15, bloom: 0.35 },
  { p: 0.45, zen: '#5a6db0', hor: '#ff9c5e', sun: '#ffa45e', li: 2.2, hs: '#ffc9a0', hg: '#6c5a88', hi: 0.9, sh: '#5ab9b6', dp: '#1d5a8a', fo: '#ffe8d4', fog: 0.003, cl: '#e89a8a', cll: '#ffd2a0', el: 6, bloom: 0.45 },
  { p: 0.68, zen: '#2b3470', hor: '#c45f78', sun: '#ff7a52', li: 1.0, hs: '#a684b4', hg: '#41416c', hi: 0.6, sh: '#3a7a98', dp: '#17386a', fo: '#d8c8e0', fog: 0.0055, cl: '#7a5a8a', cll: '#e88a7a', el: 0.5, bloom: 0.7 },
  { p: 0.8, zen: '#121c4a', hor: '#344274', sun: '#9aa8ff', li: 0.0, hs: '#56609a', hg: '#1e2240', hi: 0.36, sh: '#25507a', dp: '#0c2450', fo: '#9aa6c8', fog: 0.009, cl: '#2a3360', cll: '#3c4a7a', el: -2, bloom: 0.95 },
  { p: 1.0, zen: '#040919', hor: '#13204a', sun: '#8ea4ff', li: 0.32, hs: '#3a4a8c', hg: '#0a0f22', hi: 0.24, sh: '#1a3a5c', dp: '#061428', fo: '#7f8db0', fog: 0.0125, cl: '#141c3a', cll: '#1e2a50', el: -9, bloom: 1.15 },
];
for (const k of KEYS) for (const f of ['zen', 'hor', 'sun', 'hs', 'hg', 'sh', 'dp', 'fo', 'cl', 'cll']) k[f] = new THREE.Color(k[f]);

export class Env {
  constructor(scene, sky, water) {
    this.scene = scene;
    this.sky = sky;
    this.water = water;
    this.fog = new THREE.FogExp2(0xffc58c, 0.002);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const SH = 45;
    this.SH = SH;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -SH; cam.right = SH; cam.top = SH; cam.bottom = -SH; cam.near = 1; cam.far = 420;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.dir = new THREE.Vector3(0, 1, 0);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.bloom = 0.35;
    this.tmp = {};
    this._q = -1;
  }
  sample(p) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) if (p >= KEYS[i].p && p <= KEYS[i + 1].p) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const t = b.p > a.p ? (p - a.p) / (b.p - a.p) : 0;
    const o = this.tmp;
    for (const f of ['zen', 'hor', 'sun', 'hs', 'hg', 'sh', 'dp', 'fo', 'cl', 'cll']) (o[f] || (o[f] = new THREE.Color())).copy(a[f]).lerp(b[f], t);
    for (const f of ['li', 'hi', 'fog', 'el', 'bloom']) o[f] = lerp(a[f], b[f], t);
    return o;
  }
  update(phase, center, time, waterLevel) {
    const o = this.sample(phase);
    this.night = smoothstep(0.62, 0.95, phase);
    this.bloom = o.bloom;
    const D = Math.PI / 180;
    // sun path; quantised so shadow edges stay still between tiny steps
    const el = Math.round(o.el / 0.05) * 0.05 * D;
    const az = Math.round((200 + phase * 18) / 0.05) * 0.05 * D;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    if (phase < 0.8) this.dir.copy(this.sunDir);
    else this.dir.set(Math.sin(20 * D) * Math.cos(38 * D), Math.sin(38 * D), Math.cos(20 * D) * Math.cos(38 * D));
    if (this.dir.y < 0.05) this.dir.y = 0.05;
    this.dir.normalize();
    this.sun.color.copy(o.sun);
    this.sun.intensity = o.li;
    this.hemi.color.copy(o.hs);
    this.hemi.groundColor.copy(o.hg);
    this.hemi.intensity = o.hi;
    this.fog.color.copy(o.hor);
    this.fog.density = o.fog;
    // texel-snapped shadow frustum centred on the player
    const texel = (2 * this.SH) / 2048;
    const d = this.dir;
    const right = new THREE.Vector3(0, 1, 0).cross(d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    const u = Math.round(center.dot(right) / texel) * texel;
    const v = Math.round(center.dot(up) / texel) * texel;
    const w = center.dot(d);
    const c = new THREE.Vector3().addScaledVector(right, u).addScaledVector(up, v).addScaledVector(d, w);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(d, 200);
    this.sun.target.updateMatrixWorld();
    // sky
    const su = this.sky.material.uniforms;
    su.uZen.value.copy(o.zen); su.uHor.value.copy(o.hor); su.uSunDir.value.copy(this.sunDir);
    su.uSunCol.value.copy(o.sun); su.uNight.value = this.night; su.uTime.value = time;
    su.uCloud.value.copy(o.cl); su.uCloudLit.value.copy(o.cll);
    // water
    const wu = this.water.material.uniforms;
    wu.uTime.value = time; wu.uWater.value = waterLevel; wu.uFogDen.value = o.fog; wu.uNight.value = this.night;
    wu.uShallow.value.copy(o.sh); wu.uDeep.value.copy(o.dp); wu.uFoam.value.copy(o.fo);
    wu.uSky.value.copy(o.hor); wu.uSunDir.value.copy(this.sunDir); wu.uSunCol.value.copy(o.sun); wu.uFogCol.value.copy(o.hor);
    this.water.position.y = waterLevel;
  }
}
