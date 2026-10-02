// Five Lights: boot, world assembly, game state, beacons and tide, hints, finale, save/load, render loop.
import * as THREE from './three.module.min.js';
import { GeoBuilder, mat, makeStaticMesh, mulberry32, clamp, lerp, damp, smoothstep, fmtTime } from './util.js';
import { ISL, ORDER, SPOT, CAUSEWAYS, CAUSEWAY_HALF, TRAIL, TRAIL_TURNS, TRAIL_HALF, tideFor, DAY_LENGTH } from './layout.js';
import { bakeGround, buildTerrainMeshes, buildHeightTexture, terrainH, groundAt, islandAt, nearestCausewayPoint } from './terrain.js';
import { addCircle } from './colliders.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Post } from './post.js';
import { Sky } from './sky.js';
import { Water } from './water.js';
import { Foliage, exclude } from './foliage.js';
import { Beacon, setFireTime } from './fire.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Sparks, Beams, Shimmer } from './fx.js';
import { Village } from './village.js';
import { Monoliths } from './monoliths.js';
import { Observatory } from './observatory.js';
import { Shipwreck } from './shipwreck.js';
import { Lighthouse } from './lighthouse.js';
import { Finale, FINALE } from './finale.js';
import { Hud } from './hud.js';

const SAVE_KEY = 'five-lights-save-v1';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const canvas = document.getElementById('c');
const hud = new Hud();
const input = new Input(canvas);
const audio = new AudioSys();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2200);
const post = new Post(renderer);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(s.x, s.y);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- state
const G = {
  mode: 'loading',
  elapsed: 0,
  water: tideFor(0),
  waterTarget: tideFor(0),
  idle: 0,
  sinceInteract: 99,
  saveTimer: 0,
  finaleDone: false,
  finaleTime: 0,
  playTimeAtFinale: 0,
  restartK: 0,
  restartHeld: false,
  titleBlend: 1,
  gullTimer: 8,
  washTimer: 3,
  tideWash: 0,
  timers: [],
  statT: 0, frames: 0, fps: 60,
  hasSave: false,
};
const later = (sec, fn) => G.timers.push({ t: sec, fn });

let sky, water, foliage, player, fcam, sparks, beams, shimmer, finale;
let modules = [], beacons = [], lights = [], interactables = [], fireLoops = [];

// ---------------------------------------------------------------- build
async function build() {
  await nextFrame();
  bakeGround();
  await nextFrame();
  buildTerrainMeshes(scene);
  const htex = buildHeightTexture();
  sky = new Sky(scene);
  water = new Water(scene, htex);
  foliage = new Foliage(scene);
  sparks = new Sparks(scene);
  beams = new Beams(scene, 24);
  shimmer = new Shimmer(scene);
  await nextFrame();

  const mkCtx = (i) => ({
    scene, audio, sparks, beams,
    onSolved: (from) => puzzleSolved(i, from),
    save: () => { G.saveTimer = Math.min(G.saveTimer, 0.5); },
  });
  const village = new Village(mkCtx(0));
  const mono = new Monoliths(mkCtx(1));
  const obs = new Observatory(mkCtx(2));
  const ship = new Shipwreck(mkCtx(3));
  const outer = [village.beaconPos, mono.beaconPos, obs.beaconPos, ship.beaconPos];
  const light = new Lighthouse(mkCtx(4), outer);
  modules = [village, mono, obs, ship, light];

  buildCauseways();
  buildTrailMarks();
  buildDecor();
  await nextFrame();
  foliage.build();
  await nextFrame();

  // beacons
  outer.forEach((p, i) => beacons.push(new Beacon(scene, p, p.clone().add(new THREE.Vector3(0, -1.2, 0)))));
  const lb = new Beacon(scene, light.beaconPos, light.brazierPos, { scale: 1.9, glowSize: 9 });
  lb.ember.position.copy(light.brazierPos).add(new THREE.Vector3(0, 0.15, 0));
  lb.delay = 1.4;
  beacons.push(lb);
  beacons.forEach((b) => { b.loop = audio.addLoop('fire', b.pos); });
  // five point lights: four nearest lit beacons + the lantern
  for (let i = 0; i < 5; i++) {
    const l = new THREE.PointLight(i < 4 ? 0xffa050 : 0xffc070, 0, i < 4 ? 46 : 15, 1.6);
    l.castShadow = false;
    scene.add(l);
    lights.push(l);
  }

  player = new Player(scene, audio);
  fcam = new FollowCam(camera);
  finale = new Finale(scene, beacons.map((b) => b.pos));

  // interactables
  modules.forEach((m, i) => m.interactables().forEach((it) => interactables.push(Object.assign(it, { mod: i }))));
  beacons.forEach((b, i) => interactables.push({
    pos: b.interactPos, r: 2.7, lights: true, mod: i, beacon: true,
    can: () => b.state === 'ready' && !finale.playing,
    use: () => lightBeacon(i),
  }));

  load();
  player.waterLevel = G.water;
  fcam.snap(player.pos);
  fcam.yaw = player.yaw;
  setTitleCamera(0);
  fcam.update(0.016, player.pos, { dx: 0, dy: 0 });
  hud.setProgress(beacons.filter((b) => b.lit).length, G.hasSave);
  await warmup();
  G.mode = 'title';
  hud.setReady();
}

function buildCauseways() {
  const b = new GeoBuilder({ seed: 61 });
  const rng = mulberry32(61);
  for (const c of CAUSEWAYS) {
    const pts = c.pts;
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const segLen = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      const nx = -Math.sin(ang), nz = Math.cos(ang);
      for (let s = 0; s < segLen; s += 1.9) {
        const t = s / segLen;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        acc++;
        for (const side of [-1, 1]) {
          const px = x + nx * side * 1.1, pz = z + nz * side * 1.1;
          if (terrainH(px, pz) > c.top + 0.25) continue;
          if (rng() < 0.04) continue; // a missing stone here and there
          const top = c.top + (rng() - 0.5) * 0.06;
          const h = top + 9;
          b.box(1.75, h, 2.05, mat(px, top - h / 2, pz, (rng() - 0.5) * 0.03, -ang, (rng() - 0.5) * 0.03), '#6f6a5f', { top: rng() < 0.5 ? '#9a9584' : '#7f8d6a', jitter: 0.12 });
        }
        // marker pillars every few stones, alternating sides
        if (acc % 7 === 0) {
          const side = acc % 14 === 0 ? 1 : -1;
          const px = x + nx * side * (CAUSEWAY_HALF + 0.4), pz = z + nz * side * (CAUSEWAY_HALF + 0.4);
          if (terrainH(px, pz) < c.top) {
            b.box(0.6, 10.5, 0.6, mat(px, c.top + 1.3 - 5.25, pz, 0, -ang, (rng() - 0.5) * 0.08), '#7a7466', { top: '#a7a08c' });
            addCircle(px, pz, 0.45, c.top - 1, c.top + 1.4);
          }
        }
      }
    }
  }
  scene.add(makeStaticMesh(b));
}

function buildTrailMarks() {
  const b = new GeoBuilder({ seed: 71 });
  const rng = mulberry32(71);
  // cairns at each hairpin
  for (const [x, z] of TRAIL_TURNS) {
    const y = groundAt(x, z);
    const ox = x + 2.6, oz = z + 0.4;
    const gy = groundAt(ox, oz);
    for (let k = 0; k < 4; k++) b.ico(0.55 - k * 0.1, 0, mat(ox, Math.max(y, gy) + 0.3 + k * 0.42, oz, rng(), rng(), 0), k % 2 ? '#a69c8a' : '#8e8576');
  }
  // edge stones along the downhill side of the trail
  for (let i = 0; i < TRAIL.length - 1; i += 2) {
    const [x, z] = TRAIL[i], [x2, z2] = TRAIL[i + 1];
    const a = Math.atan2(z2 - z, x2 - x);
    const nx = -Math.sin(a), nz = Math.cos(a);
    const d = TRAIL_HALF + 0.35;
    const h1 = terrainH(x + nx * d, z + nz * d), h2 = terrainH(x - nx * d, z - nz * d);
    const sgn = h1 < h2 ? 1 : -1;
    const sx = x + nx * d * sgn, sz = z + nz * d * sgn;
    const sy = groundAt(sx, sz);
    b.box(0.5, 0.45, 0.6, mat(sx, sy + 0.18, sz, rng() * 0.2, -a, rng() * 0.2), rng() < 0.5 ? '#bdb4a2' : '#9d9584');
  }
  scene.add(makeStaticMesh(b));
}

function buildDecor() {
  const b = new GeoBuilder({ seed: 81 });
  const rng = mulberry32(81);
  // sea stacks for silhouette (kept clear of causeways)
  const stacks = [[-60, 120], [150, 60], [-170, -60], [60, -180], [-20, 70], [190, -150], [-150, 150], [90, 30]];
  for (const [x, z] of stacks) {
    let near = false;
    for (const c of CAUSEWAYS) if (nearestCausewayPoint(x, z, c.k).d < 14) near = true;
    if (near) continue;
    const h = 8 + rng() * 10;
    b.cyl(1.5 + rng(), 3.5 + rng() * 2, h + 9, 7, mat(x, h / 2 - 4.5, z, 0, rng() * 3, 0), '#857c6e', { flat: true, top: '#6f8a52' });
    b.ico(2.2, 0, mat(x + 1, h, z, rng(), rng(), rng()), '#6f8a52');
    addCircle(x, z, 3.5, -10, h + 1);
  }
  // distant islands on the horizon
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng() * 0.3;
    const r = 520 + rng() * 260;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 50 + rng() * 90, h = 20 + rng() * 55;
    b.cyl(w * 0.2, w, h, 9, mat(x, h / 2 - 3, z, 0, rng() * 3, 0, 1, 1, 0.6 + rng() * 0.6), '#5f7e5a', { flat: true });
  }
  // beach rocks
  for (const key in ISL) {
    const I = ISL[key];
    for (let n = 0; n < 14; n++) {
      const a = rng() * Math.PI * 2, r = I.r * (0.92 + rng() * 0.2);
      const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
      let near = false;
      for (const c of CAUSEWAYS) if (nearestCausewayPoint(x, z, c.k).d < 5) near = true;
      if (near) continue;
      const s = 0.6 + rng() * 1.4;
      b.ico(s, 0, mat(x, groundAt(x, z) + s * 0.3, z, rng(), rng(), rng(), 1, 0.7, 1), rng() < 0.5 ? '#8a8172' : '#9a9282');
      if (s > 1) addCircle(x, z, s * 0.8, -5, groundAt(x, z) + s);
      exclude(x, z, s + 0.5);
    }
  }
  const m = makeStaticMesh(b);
  m.castShadow = true;
  scene.add(m);
}

// ---------------------------------------------------------------- puzzle -> beacon -> tide
function puzzleSolved(i, from) {
  const b = beacons[i];
  let left = from.length;
  from.forEach((p, k) => {
    later(k * 0.25, () => sparks.fly(p, b.interactPos.clone().add(new THREE.Vector3(0, 0.8, 0)), 1.6, () => {
      left--;
      if (left === 0) { b.setReady(); audio.chime(523.25, b.interactPos, 0.35); requestSave(); }
    }));
  });
  audio.chord(i, 4);
}

function lightBeacon(i) {
  const b = beacons[i];
  if (b.state !== 'ready') return;
  b.state = 'raising';
  const from = player.lanternPos.clone();
  later(0.45, () => {
    const to = i === 4 ? b.interactPos.clone() : b.pos.clone();
    sparks.fly(from, to, 0.7, () => {
      b.state = 'ready';
      b.light();
      if (i === 4) sparks.fly(b.interactPos, b.pos, 1.3, null, new THREE.Color(5, 2.6, 0.8), 2);
      later(i === 4 ? 1.4 : 0.1, () => {
        audio.ignite(b.pos);
        input.rumble(1.0, 0.8, 750);
        const n = beacons.filter((x) => x.lit).length;
        audio.chord(n, 6);
        G.waterTarget = tideFor(n);
        G.tideWash = 9;
        G.tideCauseway = n - 1;
        if (i === 4) startFinale();
        requestSave();
      });
    }, new THREE.Color(5, 2.4, 0.7), 1.5);
  });
}

function startFinale() {
  if (G.finaleDone) return;
  G.playTimeAtFinale = G.elapsed;
  later(1.5, () => { finale.start(); player.locked = true; });
}

// ---------------------------------------------------------------- save / load
function requestSave() { G.saveTimer = Math.min(G.saveTimer, 0.3); }
function save() {
  if (G.mode !== 'play') return;
  const data = {
    v: 1, t: G.elapsed,
    beacons: beacons.map((b) => (b.lit ? 'lit' : b.state === 'ready' || b.state === 'raising' ? 'ready' : 'dormant')),
    mods: modules.map((m) => m.getState()),
    pos: [player.pos.x, player.pos.y, player.pos.z], yaw: fcam.yaw,
    finale: G.finaleDone, ft: G.playTimeAtFinale,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}
function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
  const [sx, sz] = SPOT.start;
  player.place(sx, sz, 0);
  if (!data || data.v !== 1) return;
  G.hasSave = true;
  G.elapsed = data.t || 0;
  (data.mods || []).forEach((s, i) => modules[i] && modules[i].setState(s));
  let n = 0;
  (data.beacons || []).forEach((s, i) => {
    if (s === 'lit') { beacons[i].setLitInstant(); n++; }
    else if (s === 'ready') beacons[i].setReady();
  });
  G.water = G.waterTarget = tideFor(n);
  if (modules[4].solved || n >= 5) modules[4].setLit(n >= 5 ? 1 : 0);
  G.finaleDone = !!data.finale;
  G.playTimeAtFinale = data.ft || 0;
  if (n >= 5) {
    if (G.finaleDone) finale.settle();
    else { G.playTimeAtFinale = G.elapsed; finale.start(); player.locked = true; }
  }
  if (data.pos) {
    const [x, y, z] = data.pos;
    if (groundAt(x, z) > G.water - 0.3 || y > G.water) player.place(x, z, data.yaw || 0);
  }
}

// ---------------------------------------------------------------- shaders: compile everything behind the title
async function warmup() {
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  sky.update(G.elapsed / DAY_LENGTH, player.pos, camera, 0);
  sky.setShadowHalf(240);
  for (const l of lights) l.intensity = 0.001;
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) { renderer.compile(scene, camera); }
  // one full frame with shadows renders every depth variant too
  renderer.info.reset();
  post.render(scene, camera);
  await nextFrame();
  for (const o of hidden) o.visible = false;
  sky.setShadowHalf(sky.shadowHalf);
}

// ---------------------------------------------------------------- title camera
const TITLE_POS = new THREE.Vector3(36, 19, 58);
const TITLE_LOOK = new THREE.Vector3(50, 4.5, 126);
function setTitleCamera(t) {
  const p = TITLE_POS.clone().add(new THREE.Vector3(Math.sin(t * 0.05) * 4, Math.sin(t * 0.07) * 0.8, 0));
  fcam.override = { pos: p, look: TITLE_LOOK.clone(), k: 1 };
}

function startGame(fromClick) {
  if (G.mode !== 'title') return;
  G.mode = 'play';
  audio.unlock();
  if (fromClick) input.lockPointer();
  hud.hideTitle();
  G.titleBlend = 1;
  G.sinceInteract = 0;
}

input.onGesture = (kind, e) => {
  audio.unlock();
  if (G.mode === 'title') {
    if (kind === 'key' && e && (e.code === 'KeyR' || e.code === 'F3' || e.code === 'Backquote')) return;
    if (kind === 'click' && e && e.target && e.target.closest && e.target.closest('#restart')) return;
    startGame(kind === 'click' || kind === 'key');
  } else if (G.mode === 'play' && kind === 'click') {
    input.lockPointer();
  }
};
const restartEl = document.getElementById('restart');
restartEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); G.restartHeld = true; audio.unlock(); });
window.addEventListener('pointerup', () => { G.restartHeld = false; });
restartEl.addEventListener('pointerleave', () => { G.restartHeld = false; });

// ---------------------------------------------------------------- per-frame helpers
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
let currentIt = null;

function pickInteractable() {
  let best = null, bestS = 1e9;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  for (const it of interactables) {
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.pos.y - (player.pos.y + 1.2)) > 3.2) continue;
    if (!it.can()) continue;
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    const s = d * (1.6 - 0.6 * dot);
    if (s < bestS) { bestS = s; best = it; }
  }
  return best;
}

function hintTarget() {
  const n = beacons.filter((b) => b.lit).length;
  if (n >= 5) return null;
  const key = ORDER[n];
  const m = modules[n], b = beacons[n];
  const here = islandAt(player.pos.x, player.pos.z);
  if (here !== key) {
    const c = CAUSEWAYS[n - 1];
    if (!c) return new THREE.Vector3(ISL[key].x, groundAt(ISL[key].x, ISL[key].z), ISL[key].z);
    const a = c.pts[0], z = c.pts[c.pts.length - 1];
    const da = Math.hypot(a[0] - player.pos.x, a[1] - player.pos.z), dz = Math.hypot(z[0] - player.pos.x, z[1] - player.pos.z);
    const p = da < dz && da > 12 ? a : z;
    return new THREE.Vector3(p[0], c.top, p[1]);
  }
  if (b.state === 'ready') return b.interactPos.clone().setY(b.interactPos.y - 1.5);
  const ar = m.areas[0];
  return new THREE.Vector3(ar.x, groundAt(ar.x, ar.z), ar.z);
}

function atPuzzle() {
  for (const m of modules) for (const a of m.areas) if (Math.hypot(player.pos.x - a.x, player.pos.z - a.z) < a.r) return true;
  for (const b of beacons) if (b.state === 'ready' && b.interactPos.distanceTo(player.pos) < 5) return true;
  return false;
}

function updateLights(time, night) {
  const lit = beacons.filter((b) => b.level > 0.01);
  lit.sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
  for (let i = 0; i < 4; i++) {
    const l = lights[i], b = lit[i];
    if (b) { l.position.copy(b.pos).add(_v.set(0, 1.2, 0)); l.intensity = b.lightIntensity(time, night) * 6; l.distance = 40 + night * 25; }
    else l.intensity = 0;
  }
  const lan = lights[4];
  lan.position.copy(player.lanternPos);
  lan.intensity = (1.5 + night * 9) * (0.94 + 0.06 * Math.sin(time * 17));
  lan.distance = 12 + night * 8;
  const g = 1.2 + night * 2.2;
  player.glassMat.color.setRGB(2.2 * g, 1.35 * g, 0.5 * g);
}

function updateAmbientSound(dt) {
  // gulls now and then, near the player, fewer at night
  G.gullTimer -= dt;
  if (G.gullTimer < 0) {
    G.gullTimer = 7 + Math.random() * 14 + sky.night * 25;
    if (sky.night < 0.8) {
      const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 40;
      audio.gull(_v.set(player.pos.x + Math.cos(a) * r, player.pos.y + 14 + Math.random() * 10, player.pos.z + Math.sin(a) * r));
    }
  }
  // waves washing over causeways near the waterline
  G.washTimer -= dt;
  if (G.tideWash > 0) {
    G.tideWash -= dt;
    if (G.washTimer < 0 && G.tideCauseway >= 0) {
      G.washTimer = 0.9 + Math.random() * 0.8;
      const c = CAUSEWAYS[G.tideCauseway];
      const p = c.pts[(Math.random() * c.pts.length) | 0];
      audio.wash(_v.set(p[0], c.top, p[1]), 0.9);
    }
  } else if (G.washTimer < 0) {
    G.washTimer = 3.5 + Math.random() * 4;
    let best = null, bd = 90;
    for (const c of CAUSEWAYS) {
      if (Math.abs(c.top - G.water) > 0.7) continue;
      const r = nearestCausewayPoint(player.pos.x, player.pos.z, c.k);
      if (r.d < bd) { bd = r.d; best = [r.p, c.top]; }
    }
    if (best) audio.wash(_v.set(best[0][0] + (Math.random() - 0.5) * 6, best[1], best[0][1] + (Math.random() - 0.5) * 6), 0.55);
  }
  for (const b of beacons) b.loop.level = b.level;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'loading') return;
  time += dt;
  input.poll();
  hud.setDevice(input.device);
  if (input.toggleStats) { input.toggleStats = false; hud.toggleStats(); }

  // timers
  for (let i = G.timers.length - 1; i >= 0; i--) {
    const t = G.timers[i];
    t.t -= dt;
    if (t.t <= 0) { G.timers.splice(i, 1); t.fn(); }
  }

  let move = { x: 0, y: 0 }, look = { dx: 0, dy: 0 };
  if (G.mode === 'title') {
    setTitleCamera(time);
    const holding = G.restartHeld || input.keys.has('KeyR') || input.padHold;
    G.restartK = holding && G.hasSave ? G.restartK + dt / 1.4 : Math.max(0, G.restartK - dt * 2);
    hud.setRestart(clamp(G.restartK, 0, 1));
    if (G.restartK >= 1) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      location.reload();
      return;
    }
    input.consumeInteract();
  } else {
    G.elapsed += dt;
    move = input.move();
    look = input.look(dt);
    // title -> follow camera blend
    if (G.titleBlend > 0) {
      G.titleBlend = Math.max(0, G.titleBlend - dt / 2.6);
      const k = smoothstep(0, 1, G.titleBlend);
      fcam.override.k = k;
      if (G.titleBlend <= 0 && !finale.playing) fcam.override = null;
    }
  }

  // world time
  const dayK = G.elapsed / DAY_LENGTH;
  setFireTime(time);

  // player
  player.waterLevel = G.water;
  player.update(dt, G.mode === 'play' ? move : { x: 0, y: 0 }, fcam.yaw, time);
  if (G.mode === 'play' && !finale.playing) {
    currentIt = player.locked ? null : pickInteractable();
    if (input.consumeInteract() && currentIt && !player.raising) {
      if (currentIt.lights) player.raise();
      currentIt.use();
      G.sinceInteract = 0;
      currentIt = null;
    }
  } else {
    input.consumeInteract();
    currentIt = null;
  }

  // tide
  if (Math.abs(G.water - G.waterTarget) > 0.001) {
    const step = 0.075 * dt;
    G.water = G.water > G.waterTarget ? Math.max(G.waterTarget, G.water - step) : Math.min(G.waterTarget, G.water + step);
  }

  // finale timeline
  if (finale.t >= 0 && (G.mode === 'play' || finale.done)) {
    finale.update(dt, time, G.water);
    if (!G.finaleDone && G.mode === 'play') {
      const t = finale.t;
      const V = ISL.V;
      let pos, lk;
      if (t < FINALE.boats) {
        const a = 0.9 + t * 0.03;
        pos = new THREE.Vector3(Math.cos(a) * 120, 60 + t * 2, Math.sin(a) * 120);
        lk = new THREE.Vector3(0, 55 + t * 3, 0);
      } else {
        pos = new THREE.Vector3(V.x - 4, 16, V.z - 6);
        lk = finale.centroid.lengthSq() > 0 ? finale.centroid.clone().setY(2) : new THREE.Vector3(V.x + 60, 2, V.z + 60);
      }
      const k = smoothstep(0, 2.5, t) * (1 - smoothstep(FINALE.overlayEnd, FINALE.end, t));
      if (!fcam.override) fcam.override = { pos: pos.clone(), look: lk.clone(), k: 0 };
      fcam.override.pos.lerp(pos, 1 - Math.exp(-dt * 1.5));
      fcam.override.look.lerp(lk, 1 - Math.exp(-dt * 1.5));
      fcam.override.k = k;
      hud.showClosing(t > FINALE.overlay && t < FINALE.overlayEnd, fmtTime(G.playTimeAtFinale), 5);
      if (finale.done) {
        G.finaleDone = true;
        player.locked = false;
        fcam.override = null;
        hud.showClosing(false);
        requestSave();
      }
    }
  }

  // camera
  fcam.update(dt, player.pos, look);

  // hint shimmer: only after standing still, away from puzzles, with no recent interaction
  G.sinceInteract += dt;
  const still = Math.hypot(move.x, move.y) < 0.05 && Math.abs(look.dx) + Math.abs(look.dy) < 0.02;
  if (G.mode !== 'play' || !still || atPuzzle() || finale.playing || player.raising) G.idle = 0;
  else G.idle += dt;
  if (G.idle > 24 && G.sinceInteract > 35) {
    const tgt = hintTarget();
    if (tgt) shimmer.show(tgt); else shimmer.hide();
  } else shimmer.hide();

  // world updates
  sky.update(dayK, player.pos, camera, time);
  const night = sky.night;
  for (const b of beacons) {
    if (b.state === 'lighting' && b.delay && b.t < b.delay) { b.t += dt; b.fire.setIntensity(0, night); b.ember.visible = false; continue; }
    if (b.delay && b.state === 'lighting' && b.t >= b.delay && !b._shift) { b._shift = true; b.t = 0; }
    b.update(dt, time, night);
  }
  modules[4].setLit(beacons[4].level);
  modules.forEach((m) => m.update(dt, time, night, G.water, player.pos));
  sparks.update(dt);
  beams.update(time);
  shimmer.update(dt, time);
  foliage.update(time, camera.position, player.pos);
  updateLights(time, night);
  water.update(time, sky, scene, lights, G.water);
  audio.setListener(camera.position, camera.getWorldDirection(_v2));
  audio.setNight(night);
  if (G.mode === 'play') updateAmbientSound(dt);
  audio.update(dt);

  // post params follow the time of day
  const st = sky.state;
  post.params.bloom = st.bloom;
  post.params.exposure = st.exp;
  post.params.sat = st.sat;
  post.params.threshold = 1.0;

  renderer.info.reset();
  post.render(scene, camera);

  // prompt glyph
  if (currentIt) {
    _v.copy(currentIt.pos).add(_v2.set(0, 0.6, 0)).project(camera);
    if (_v.z < 1) hud.showPrompt((_v.x * 0.5 + 0.5) * window.innerWidth, (-_v.y * 0.5 + 0.5) * window.innerHeight);
    else hud.hidePrompt();
  } else hud.hidePrompt();

  // save periodically
  G.saveTimer -= dt;
  if (G.saveTimer <= 0) { save(); G.saveTimer = 5; }

  // stats readout (includes the shadow pass and post passes)
  G.frames++;
  G.statT += dt;
  if (G.statT >= 0.5) {
    G.fps = G.frames / G.statT;
    G.frames = 0; G.statT = 0;
    const r = renderer.info.render;
    const pl = lights.filter((l) => l.intensity > 0).length;
    hud.setStats(`fps    ${G.fps.toFixed(0)}\ntris   ${(r.triangles / 1000).toFixed(1)}k\ncalls  ${r.calls}\nlights ${pl} point + 1 sun`);
  }
}

window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

build().then(() => { last = performance.now(); });
requestAnimationFrame(frame);
