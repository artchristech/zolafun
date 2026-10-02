// Builds the archipelago: terrain, causeways, landmarks and their puzzles,
// beacons, foliage, grass, rocks and gulls. Static scenery is merged into one
// mesh per island.
import * as THREE from './three.module.min.js';
import { G, mat, GeoBuilder } from './geo.js';
import { toon, U } from './materials.js';
import { ISL, CW_HALF, BEACON_XZ } from './layout.js';
import { buildTerrain, buildHeightTexture, buildCauseways, terrainAt, cwH, PATHS, TRAIL } from './terrain.js';
import { addCircle } from './colliders.js';
import { Beacon } from './beacons.js';
import { buildVillage } from './village.js';
import { buildRing } from './ring.js';
import { buildWreck } from './wreck.js';
import { buildObservatory } from './observatory.js';
import { buildLighthouse } from './lighthouse.js';
import { buildFoliage, buildGrass } from './foliage.js';
import { rng, polyDist } from './util.js';

export function buildWorld(scene, audio, puffs, cb) {
  const toonMat = toon();
  const builders = {};
  const flat = new Map();
  const interactables = [];
  const excl = [], segs = [];
  const ctx = {
    scene, audio, puffs, toonMat,
    sb: (id) => (builders[id] ||= new GeoBuilder()),
    toonMatFlat: (c) => { if (!flat.has(c)) flat.set(c, toon({ vertexColors: false, color: c })); return flat.get(c); },
    addInteract: (o) => interactables.push(o),
    exclude: (x, z, r) => excl.push([x, z, r]),
    excludeSeg: (ax, az, bx, bz, r) => segs.push([ax, az, bx, bz, r]),
    onSolved: cb.onSolved, onTeach: cb.onTeach, lightBeacon: cb.lightBeacon,
  };

  const terrainMeshes = buildTerrain(scene, toonMat);
  const heightTex = buildHeightTexture();

  // causeway tops: slabs and a few bollards
  const cwInfo = [];
  buildCauseways(scene, toonMat, (c) => {
    const b = ctx.sb('CW' + c.k);
    const ry = Math.atan2(-c.uz, c.ux);
    const px = -c.uz, pz = c.ux;
    const R = rng(31 + c.k);
    for (let t = 1; t < c.len; t += 2) {
      const x = c.ax + c.ux * t, z = c.az + c.uz * t;
      const dy = (R() - 0.5) * 0.04;
      b.add(G.box(1.92, 0.3, CW_HALF * 2 - 0.08), mat(x, c.top - 0.15 + dy, z, 0, ry, (R() - 0.5) * 0.02), (t | 0) % 4 < 2 ? 0xa39d90 : 0x8f897c, { jitter: 0.1 });
    }
    for (let t = 4; t < c.len - 2; t += 7) for (const s of [-1, 1]) {
      if (R() < 0.35) continue;
      const x = c.ax + c.ux * t + px * s * 1.75, z = c.az + c.uz * t + pz * s * 1.75;
      const h = 0.5 + R() * 0.5;
      b.add(G.cyl(0.18, 0.24, h, 6), mat(x, c.top + h / 2, z, 0, 0, (R() - 0.5) * 0.2), 0x7f7a70, { jitter: 0.1 });
      addCircle(x, z, 0.24, c.top - 1, c.top + h);
    }
    cwInfo.push({ k: c.k, top: c.top, mid: [c.ax + c.ux * c.len / 2, c.top, c.az + c.uz * c.len / 2], ends: [[c.ax, c.az], [c.bx, c.bz]], washed: false });
  });

  // beacons on the four outer islands
  const beacons = [];
  ['V', 'M', 'F', 'P'].forEach((id, i) => { beacons.push(new Beacon(ctx, i, id)); ctx.exclude(BEACON_XZ[i][0], BEACON_XZ[i][1], 3); });

  const village = buildVillage(ctx);
  const ring = buildRing(ctx);
  const wreck = buildWreck(ctx, beacons[2]);
  const obs = buildObservatory(ctx);
  const light = buildLighthouse(ctx);
  beacons.push(new Beacon(ctx, 4, 'L', light.lampPos.clone().add(new THREE.Vector3(0, -0.9, 0))));
  const puzzles = [village, ring, wreck, obs, light];

  // trail edge stones and posts on the peak
  {
    const b = ctx.sb('P');
    const P = ISL[3];
    for (let i = 4; i < TRAIL.length - 4; i += 5) {
      const [x, z, h] = TRAIL[i];
      const [x2, z2] = TRAIL[i + 1];
      const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
      let nx = -dz / l, nz = dx / l;
      if ((x + nx - P.x) ** 2 + (z + nz - P.z) ** 2 < (x - P.x) ** 2 + (z - P.z) ** 2) { nx = -nx; nz = -nz; }
      const ex = x + nx * 1.75, ez = z + nz * 1.75;
      if (i % 15 === 4) {
        b.add(G.cyl(0.08, 0.1, 1.1, 5), mat(ex, h + 0.45, ez), 0x6b4a2e);
        addCircle(ex, ez, 0.12, h - 1, h + 1);
      } else {
        const s = 0.25 + ((i * 37) % 10) / 40;
        b.add(G.blob(s, 0), mat(ex, h + s * 0.3, ez, 0, i, 0, 1, 0.7, 1.2), 0x8d8578, { jitter: 0.15 });
      }
    }
  }

  // tidal boulders around the shores
  {
    const R = rng(555);
    for (const I of ISL) {
      const b = ctx.sb(I.id);
      let n = 0;
      for (let k = 0; k < 160 && n < 14; k++) {
        const a = R() * Math.PI * 2, r = I.r1 * (0.6 + R() * 0.5);
        const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
        const h = terrainAt(x, z);
        if (h < -1.2 || h > 3.4) continue;
        if (cwH(x, z) > h - 1.5) continue;
        let near = false;
        for (const p of PATHS) if (polyDist(x, z, p) < 4) near = true;
        for (const [ex, ez, er] of excl) if (Math.hypot(x - ex, z - ez) < er + 1.5) near = true;
        if (near) continue;
        const s = 0.6 + R() * 1.1;
        b.add(G.blob(s, 0), mat(x, h + s * 0.25, z, R(), R() * 6, R(), 1.2, 0.75, 1), 0x8a857a, { jitter: 0.16 });
        if (R() < 0.6) b.add(G.blob(s * 0.55, 0), mat(x + s * 0.8, h + s * 0.1, z + s * 0.3, 0, R() * 6, 0, 1, 0.7, 1), 0x7a756a, { jitter: 0.16 });
        addCircle(x, z, s * 1.05, h - 2, h + s);
        excl.push([x, z, s * 1.3]);
        n++;
      }
    }
  }

  const foliage = buildFoliage(scene, excl, segs);
  const grass = buildGrass(scene, heightTex);

  // merge static scenery
  const staticMeshes = [];
  for (const [id, b] of Object.entries(builders)) {
    if (!b.count) continue;
    const m = new THREE.Mesh(b.build(), toonMat);
    m.castShadow = !id.startsWith('CW');
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    staticMeshes.push(m);
  }

  // gulls
  const gullGeo = new GeoBuilder();
  gullGeo.add(G.box(0.18, 0.14, 0.5), mat(0, 0, 0), 0xf4f2ec);
  gullGeo.add(G.box(0.7, 0.03, 0.22), mat(0.42, 0.06, 0.02, 0, 0, 0.18), 0xf4f2ec);
  gullGeo.add(G.box(0.7, 0.03, 0.22), mat(-0.42, 0.06, 0.02, 0, 0, -0.18), 0xf4f2ec);
  gullGeo.add(G.box(0.25, 0.035, 0.2), mat(0.88, 0.14, 0.02, 0, 0, 0.18), 0x3a3a3e);
  gullGeo.add(G.box(0.25, 0.035, 0.2), mat(-0.88, 0.14, 0.02, 0, 0, -0.18), 0x3a3a3e);
  gullGeo.add(G.cone(0.04, 0.12, 4), mat(0, 0, 0.3, Math.PI / 2), 0xe0a020);
  const gullMat = toon();
  gullMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      transformed.y += abs(position.x) * sin(uTime * 7.0 + float(gl_InstanceID) * 1.7) * 0.45;
      #endif`);
  };
  gullMat.customProgramCacheKey = () => 'gull';
  const gulls = new THREE.InstancedMesh(gullGeo.build(), gullMat, 9);
  gulls.frustumCulled = false;
  scene.add(gulls);
  const R2 = rng(9);
  const gullPaths = [];
  for (let k = 0; k < 9; k++) {
    const I = ISL[k % 5];
    gullPaths.push({ cx: I.x + (R2() - 0.5) * 30, cz: I.z + (R2() - 0.5) * 30, r: 14 + R2() * 22, h: 16 + R2() * 16, w: (0.12 + R2() * 0.12) * (R2() < 0.5 ? -1 : 1), ph: R2() * 6.28, pos: new THREE.Vector3() });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1.4, 1.4, 1.4);
  function updateGulls(t) {
    gullPaths.forEach((g, k) => {
      const a = g.ph + t * g.w;
      g.pos.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * 0.3 + k) * 2, g.cz + Math.sin(a) * g.r);
      const head = Math.atan2(-Math.sin(a) * Math.sign(g.w), Math.cos(a) * Math.sign(g.w));
      e.set(0, head, -Math.sign(g.w) * 0.35);
      q.setFromEuler(e);
      m4.compose(g.pos, q, one);
      gulls.setMatrixAt(k, m4);
    });
    gulls.instanceMatrix.needsUpdate = true;
  }

  // shoreline wave emitters
  const waveSpots = [];
  for (const I of ISL) for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + I.seed;
    waveSpots.push([I.x + Math.cos(a) * I.r1 * 0.85, 0.5, I.z + Math.sin(a) * I.r1 * 0.85]);
  }

  return { terrainMeshes, staticMeshes, heightTex, beacons, puzzles, interactables, foliage, grass, cwInfo, gullPaths, updateGulls, waveSpots, toonMat };
}
