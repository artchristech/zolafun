// Five Lights — assembles the archipelago: terrain, sea, causeways, landmarks,
// foliage, beacon lights, ambient emitters and the wordless hint shimmer.
import * as THREE from './three.module.min.js';
import { Builder, vtoon, rng, lerp } from './util.js';
import { ISLANDS, VILLAGE } from './layout.js';
import { initTerrain, buildTerrain, bakeHeightTexture, CAUSEWAYS, terrainH } from './terrain.js';
import { createWater } from './water.js';
import { buildFoliage } from './foliage.js';
import { buildVillage } from './village.js';
import { buildRing } from './ring.js';
import { buildForest } from './forest.js';
import { buildPeak } from './peak.js';
import { buildLighthouse } from './lighthouse.js';
import { makeBoat } from './finale.js';

function buildCauseway(C, material) {
  const b = new Builder(), R = rng(C.k * 101 + 7);
  const ry = Math.atan2(C.ux, C.uz);
  const steps = Math.floor(C.len / 1.25);
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const x = C.ax + (C.bx - C.ax) * s, z = C.az + (C.bz - C.az) * s;
    const tone = 0.85 + R() * 0.2;
    const col = new THREE.Color(0.62 * tone, 0.6 * tone, 0.55 * tone);
    b.box(4.3, 0.55, 1.18, col, x, C.top - 0.27 + (R() - 0.5) * 0.04, z, ry + (R() - 0.5) * 0.05);
    // weed and barnacles along the flanks
    b.box(4.45, 0.3, 1.2, 0x4f6b4a, x, C.top - 0.62, z, ry);
    if (i % 5 === 0) {
      for (const side of [-1, 1]) {
        const px = x + Math.cos(ry) * side * 1.9 * 1, pz = z - Math.sin(ry) * side * 1.9;
        b.cyl(0.42, 0.55, C.top + 4.6, 6, 0x6f6a60, px, (C.top - 4.6) / 2 - 0.2, pz);
      }
    }
  }
  const m = b.build(material);
  m.receiveShadow = true;
  return m;
}

export function buildWorld(scene) {
  initTerrain();
  const mat = vtoon();
  const B = ISLANDS.map(() => new Builder());
  const ctx = {
    scene, B, floaters: [], makeBoat,
    interactables: [],
    interact(o) { ctx.interactables.push(o); },
    // these are rebound by the game once it exists
    solved() {}, save() {}, raiseLantern(cb) { cb(); }, lightBeacon() {},
    sound: null,
  };
  return { ctx, mat, B, finish: (sound) => finishWorld(scene, ctx, mat, B, sound) };
}

function finishWorld(scene, ctx, mat, B, sound) {
  ctx.sound = sound;
  const puzzles = [buildVillage(ctx), buildRing(ctx), buildForest(ctx), buildPeak(ctx), buildLighthouse(ctx)];
  for (const b of B) { const m = b.build(mat); if (m) scene.add(m); }
  buildTerrain(scene, mat);
  for (const C of CAUSEWAYS) scene.add(buildCauseway(C, mat));
  const water = createWater(bakeHeightTexture());
  scene.add(water);
  const exclusions = [];
  for (const p of puzzles) exclusions.push(...p.exclusions);
  const foliage = buildFoliage(scene, exclusions);

  // ambient emitters: surf around every shore, wash over every causeway
  const shoreEmit = [];
  for (const I of ISLANDS) {
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + I.seed;
      shoreEmit.push(sound.emitter('waves', I.x + Math.cos(a) * I.R * 0.8, 1.5, I.z + Math.sin(a) * I.R * 0.8, { ref: 9, level: 0.8 }));
    }
  }
  const causeEmit = CAUSEWAYS.map((C) => sound.emitter('waves', C.mid.x, C.top, C.mid.z, { ref: 8, level: 0.4 }));
  const fireEmit = puzzles.map((p) => sound.emitter('fire', p.beacon.top.x, p.beacon.top.y, p.beacon.top.z, { ref: 5, level: 0 }));

  // five point lights, always present so shaders never recompile
  const lantern = new THREE.PointLight(0xffb060, 0, 20, 1.6);
  scene.add(lantern);
  const beaconLights = [0, 1, 2, 3].map(() => {
    const l = new THREE.PointLight(0xff9a48, 0, 70, 1.25);
    scene.add(l);
    return l;
  });

  // hint shimmer
  const N = 90, seeds = new Float32Array(N), pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) seeds[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const shimmerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uAlpha; attribute float aSeed; varying float vA;
      void main(){
        float life = fract(uTime * (0.12 + aSeed * 0.1) + aSeed * 7.0);
        float ang = aSeed * 61.0 + uTime * 0.6;
        float r = 1.0 + 1.6 * fract(aSeed * 13.7);
        vec3 p = vec3(cos(ang) * r, life * 14.0, sin(ang) * r);
        vA = uAlpha * sin(life * 3.14159) * (0.5 + 0.5 * sin(uTime * 6.0 + aSeed * 40.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 220.0 / max(-mv.z, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = abs(c.x) + abs(c.y);
        if (d > 0.5) discard;
        float k = step(d, 0.12) + (1.0 - d * 2.0) * 0.5;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * 2.5 * k * vA, 1.0);
      }`,
  });
  const shimmer = new THREE.Points(g, shimmerMat);
  shimmer.frustumCulled = false;
  shimmer.visible = false;
  scene.add(shimmer);

  return { puzzles, water, foliage, lantern, beaconLights, shoreEmit, causeEmit, fireEmit, shimmer, shimmerMat };
}

export const TITLE_VIEW = {
  pos: new THREE.Vector3(46, 19, 104),
  look: new THREE.Vector3(-8, 5, 30),
};
