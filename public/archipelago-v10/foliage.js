// Instanced trees, bushes and grass. Swaying in the shader (shadows sway too),
// and screen-door fading when they block the view of the apprentice.
import * as THREE from './three.module.min.js';
import { naturalH, naturalSurf, slopeAt, groundH } from './ground.js';
import {
  ISLANDS, FOREST_PATHS, TRAIL, WRECK, BEACONS, RING_C, RTUT, VTUT, TOTEM, HOUSES, OBS, SURF, TIDE, polyDist, segDist,
} from './layout.js';
import { GeoBuilder, mat, mulberry32, toonGradient, fbm } from './util.js';

export const foliageUniforms = {
  uTime: { value: 0 },
  uFadeA: { value: new THREE.Vector3(0, -999, 0) },
  uFadeB: { value: new THREE.Vector3(0, -999, 0) },
};

const COMMON = /* glsl */ `
uniform float uTime; uniform float uSway; uniform float uCanopyY; uniform float uCanopyR;
uniform vec3 uFadeA; uniform vec3 uFadeB;
float fSegDist(vec3 p, vec3 a, vec3 b){ vec3 ab=b-a; float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-4),0.,1.); return length(p-(a+ab*t)); }
`;
const SWAY = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 iOrg = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
  float iScale = length(instanceMatrix[1].xyz);
#else
  vec3 iOrg = (modelMatrix * vec4(0.,0.,0.,1.)).xyz;
  float iScale = 1.0;
#endif
  float swH = max(position.y, 0.0);
  float ph = uTime*1.6 + iOrg.x*0.31 + iOrg.z*0.23;
  transformed.x += (sin(ph) + 0.4*sin(ph*2.3+1.0)) * uSway * swH;
  transformed.z += cos(ph*0.83 + 0.7) * uSway * 0.7 * swH;
`;

function foliageMaterial({ sway, canopyY, canopyR, fade, side = THREE.FrontSide }) {
  const uni = { uSway: { value: sway }, uCanopyY: { value: canopyY }, uCanopyR: { value: canopyR } };
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni, foliageUniforms);
    sh.vertexShader = COMMON + 'varying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
${SWAY}
  vFade = 0.0;
  ${fade ? `vec3 cc = iOrg + vec3(0.0, uCanopyY*iScale, 0.0);
  float dd = fSegDist(cc, uFadeA, uFadeB);
  vFade = (1.0 - smoothstep(uCanopyR*iScale, uCanopyR*iScale + 1.2, dd)) * 0.88;` : ''}
`);
    sh.fragmentShader = 'varying float vFade;\nfloat bayer2(vec2 a){ a=floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }\nfloat bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }\n' +
      sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vFade > 0.01 && bayer4(gl_FragCoord.xy) + 0.03 < vFade) discard;`);
  };
  m.customProgramCacheKey = () => 'foliage' + (fade ? 'F' : 'N');
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni, foliageUniforms);
    sh.vertexShader = COMMON + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
${SWAY}
`);
  };
  d.customProgramCacheKey = () => 'foliageDepth';
  return { m, d };
}

function treeGeoBroad() {
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.16, 0.27, 3.4, 6), mat(0, 1.7, 0), '#6b4a32');
  b.add(new THREE.SphereGeometry(1.75, 8, 6), mat(0, 4.1, 0, 0, 0, 0, 1, 0.82, 1), '#4f9a3c');
  b.add(new THREE.SphereGeometry(1.25, 7, 5), mat(0.85, 3.5, 0.45), '#5aa844');
  b.add(new THREE.SphereGeometry(1.1, 7, 5), mat(-0.7, 4.75, -0.35), '#6cba4e');
  return b.build();
}
function treeGeoConifer() {
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6), mat(0, 1.1, 0), '#5e4030');
  b.add(new THREE.ConeGeometry(1.7, 2.6, 8), mat(0, 2.9, 0), '#2f6e4a');
  b.add(new THREE.ConeGeometry(1.3, 2.2, 8), mat(0, 4.1, 0), '#37814f');
  b.add(new THREE.ConeGeometry(0.85, 1.8, 8), mat(0, 5.2, 0), '#419159');
  return b.build();
}
function bushGeo() {
  const b = new GeoBuilder();
  b.add(new THREE.SphereGeometry(0.9, 7, 5), mat(0, 0.45, 0, 0, 0, 0, 1.25, 0.75, 1.25), '#4b8d39');
  b.add(new THREE.SphereGeometry(0.6, 6, 4), mat(0.6, 0.55, 0.2), '#5ea444');
  return b.build();
}
function grassGeo() {
  const rng = mulberry32(9);
  const p = [], n = [], c = [];
  const base = new THREE.Color('#4a8434'), tip = new THREE.Color('#b4dc6e');
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.18;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const ba = rng() * Math.PI;
    const w = 0.05 + rng() * 0.03, h = 0.38 + rng() * 0.3;
    const lean = (rng() - 0.5) * 0.25;
    const dx = Math.cos(ba) * w, dz = Math.sin(ba) * w;
    p.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox + lean, h, oz + lean * 0.5);
    for (let k = 0; k < 3; k++) n.push(0, 1, 0);
    c.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}

// keep-out test: true when foliage may grow here
function clearOf(x, z, isl) {
  for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < 6.5 + (isl === 0 ? 0 : 0)) return false;
  if (isl === 0) {
    for (const h of HOUSES) {
      const r = segDist(x, z, h.x, h.z, ISLANDS[0].x + (h.x - ISLANDS[0].x) * 0.45, ISLANDS[0].z + (h.z - ISLANDS[0].z) * 0.45);
      if (r.d < 2.8) return false;
    }
    if (Math.hypot(x - TOTEM.x, z - TOTEM.z) < 13) return false;
    if (Math.hypot(x - VTUT.x, z - VTUT.z) < 5) return false;
    // keep the opening sightline over the village open
    if (Math.abs(x - ISLANDS[0].x) < 7 && z > BEACONS[0].z - 3) return false;
  }
  for (let i = 0; i < 4; i++) if (Math.hypot(x - BEACONS[i].x, z - BEACONS[i].z) < 7) return false;
  if (isl === 1) {
    if (Math.hypot(x - RING_C.x, z - RING_C.z) < 15) return false;
    if (Math.hypot(x - RTUT.x, z - RTUT.z) < 6) return false;
  }
  if (isl === 2) {
    for (const p of FOREST_PATHS) if (polyDist(x, z, p) < 2.3) return false;
    const route = [WRECK.lamp, ...WRECK.mirrors, BEACONS[2]];
    for (let i = 0; i < route.length - 1; i++) if (segDist(x, z, route[i].x, route[i].z, route[i + 1].x, route[i + 1].z).d < 2.0) return false;
    if (Math.hypot(x - WRECK.clearing.x, z - WRECK.clearing.z) < 13.5) return false;
    // sightline from the forest beacon to the lighthouse
    const b = BEACONS[2];
    if (segDist(x, z, b.x, b.z, b.x * 0.55, b.z * 0.55).d < 3.2) return false;
  }
  if (isl === 3) {
    if (polyDist(x, z, TRAIL) < 3.6) return false;
    if (Math.hypot(x - ISLANDS[3].x, z - ISLANDS[3].z) < 17) return false;
  }
  if (isl === 4 && Math.hypot(x, z) < 17) return false;
  return true;
}

const PARAMS = [
  { spacing: 6.5, prob: 0.3, conifer: 0.15, bush: 0.25 },
  { spacing: 5.5, prob: 0.35, conifer: 0.7, bush: 0.3 },
  { spacing: 1.95, prob: 0.9, conifer: 0.38, bush: 0.8 },
  { spacing: 4.2, prob: 0.5, conifer: 0.9, bush: 0.2 },
  { spacing: 8, prob: 0.18, conifer: 0.4, bush: 0.3 },
];

export function buildFoliage(scene, colliders) {
  const rng = mulberry32(31337);
  const TILE = 40;
  const buckets = new Map(); // key -> {broad:[], conifer:[], bush:[], grass:[]}
  const bucket = (x, z) => {
    const k = Math.floor(x / TILE) * 1000 + Math.floor(z / TILE);
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { broad: [], conifer: [], bush: [], grass: [] }));
    return b;
  };
  const minH = TIDE[0] + 0.35;
  for (const isl of ISLANDS) {
    const P = PARAMS[isl.id];
    const R = isl.R * 1.05;
    for (let gx = -R; gx < R; gx += P.spacing) {
      for (let gz = -R; gz < R; gz += P.spacing) {
        const x = isl.x + gx + (rng() - 0.5) * P.spacing * 0.9;
        const z = isl.z + gz + (rng() - 0.5) * P.spacing * 0.9;
        const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
        const h = naturalH(x, z);
        if (h < minH || groundH(x, z) > h + 0.05) continue;
        if (slopeAt(x, z) > (isl.id === 3 ? 1.4 : 0.62)) continue;
        if (naturalSurf(x, z) === SURF.DIRT || naturalSurf(x, z) === SURF.STONE) continue;
        if (!clearOf(x, z, isl.id)) continue;
        const dens = P.prob * (isl.id === 2 ? 0.75 + 0.25 * fbm(x * 0.05, z * 0.05, 2, 3) : 1);
        if (r1 < dens) {
          const conifer = r2 < P.conifer;
          const s = (isl.id === 2 ? 1.0 : 0.85) + r3 * 0.55;
          const inst = { x, y: h - 0.15, z, s, r: r4 * Math.PI * 2, tint: r5 };
          (conifer ? bucket(x, z).conifer : bucket(x, z).broad).push(inst);
          colliders.circle(x, z, (conifer ? 0.22 : 0.3) * s, h - 1, h + 3 * s);
        } else if (r1 < dens + (1 - dens) * P.bush) {
          bucket(x, z).bush.push({ x, y: h - 0.1, z, s: 0.7 + r3 * 0.7, r: r4 * 6.28, tint: r5 });
        }
      }
    }
    // grass tufts
    const gcount = Math.round(isl.R * isl.R * (isl.id === 2 ? 2.4 : 3.6));
    for (let i = 0; i < gcount; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * isl.R * 0.95;
      const x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr;
      const s0 = rng(), s1 = rng(), s2 = rng();
      if (naturalSurf(x, z) !== SURF.GRASS) continue;
      const h = naturalH(x, z);
      if (h < minH - 0.2 || groundH(x, z) > h + 0.05) continue;
      if (fbm(x * 0.07, z * 0.07, 2, 11) < -0.25) continue;
      bucket(x, z).grass.push({ x, y: h - 0.03, z, s: 0.7 + s0 * 0.7, r: s1 * 6.28, tint: s2 });
    }
  }

  const geos = { broad: treeGeoBroad(), conifer: treeGeoConifer(), bush: bushGeo(), grass: grassGeo() };
  const mats = {
    broad: foliageMaterial({ sway: 0.022, canopyY: 4.1, canopyR: 2.2, fade: true }),
    conifer: foliageMaterial({ sway: 0.018, canopyY: 3.8, canopyR: 1.9, fade: true }),
    bush: foliageMaterial({ sway: 0.03, canopyY: 0.5, canopyR: 1.3, fade: true }),
    grass: foliageMaterial({ sway: 0.22, canopyY: 0, canopyR: 0, fade: false, side: THREE.DoubleSide }),
  };
  const grassChunks = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const b of buckets.values()) {
    for (const type of ['broad', 'conifer', 'bush', 'grass']) {
      const list = b[type];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geos[type], mats[type].m, list.length);
      let cx = 0, cz = 0;
      list.forEach((it, i) => {
        q.setFromAxisAngle(yAxis, it.r);
        m4.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s, it.s * (type === 'grass' ? 0.8 + it.tint * 0.5 : 1), it.s));
        im.setMatrixAt(i, m4);
        if (type === 'grass') col.setRGB(0.85 + it.tint * 0.25, 0.9 + it.tint * 0.15, 0.75 + it.tint * 0.2);
        else col.setRGB(0.82 + it.tint * 0.3, 0.88 + it.tint * 0.2, 0.8 + it.tint * 0.2);
        im.setColorAt(i, col);
        cx += it.x; cz += it.z;
      });
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      if (type === 'grass') {
        im.castShadow = false;
        im.receiveShadow = true;
        grassChunks.push({ mesh: im, x: cx / list.length, z: cz / list.length });
      } else {
        im.castShadow = true;
        im.receiveShadow = true;
        im.customDepthMaterial = mats[type].d;
      }
      scene.add(im);
    }
  }
  return {
    grassChunks,
    update(time, camPos, pivot) {
      foliageUniforms.uTime.value = time;
      foliageUniforms.uFadeA.value.copy(camPos);
      foliageUniforms.uFadeB.value.copy(pivot);
      for (const g of grassChunks) {
        const d = Math.hypot(g.x - camPos.x, g.z - camPos.z);
        g.mesh.visible = d < 62;
      }
    },
    showAll() {
      for (const g of grassChunks) g.mesh.visible = true;
    },
  };
}
