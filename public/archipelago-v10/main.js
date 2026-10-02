// Five Lights — boot, game state, update loop.
import * as THREE from './three.module.min.js';
import { buildGround, groundH } from './ground.js';
import {
  ISLANDS, TIDE, BEACONS, LH, CAUSEWAYS, DAY_LENGTH, PLAYER_START, pol,
} from './layout.js';
import { makeMaterials, GeoBuilder, clamp, lerp, smoothstep, damp, mulberry32 } from './util.js';
import { Colliders } from './colliders.js';
import { buildTerrain, bakeHeightTexture, buildWater, buildSky, buildCauseways, buildRocks, buildTrailMarkers, Env } from './world.js';
import { FireSystem } from './fire.js';
import { buildFoliage } from './foliage.js';
import { Beacon } from './beacon.js';
import { Village } from './village.js';
import { Ring } from './ring.js';
import { Wreck } from './wreck.js';
import { Observatory } from './observatory.js';
import { Lighthouse } from './lighthouse.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Post } from './post.js';
import { UI } from './ui.js';
import { Shimmer } from './hint.js';
import { Finale } from './finale.js';

const SAVE_KEY = 'fiveLights.save.v1';
const canvas = document.getElementById('c');
const ui = new UI();
const input = new Input(canvas);
const audio = new AudioSys();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1500);
const post = new Post(renderer);

let state = 'loading';
let world = null;

function loadSave() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* storage unavailable */ }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(Math.floor(w * PR), Math.floor(h * PR));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (world) world.fires.setPixelScale(h * PR, camera.fov);
}
window.addEventListener('resize', resize);

function nextFrame() {
  return new Promise((r) => setTimeout(r, 30));
}

async function boot() {
  resize();
  await nextFrame();
  buildGround();
  await nextFrame();
  const mats = makeMaterials();
  const col = new Colliders();
  const fires = new FireSystem();
  fires.setPixelScale(window.innerHeight * PR, camera.fov);
  const batches = [0, 1, 2, 3, 4, 5].map(() => new GeoBuilder());
  const timers = [];
  let saveDirty = false;
  const W = (world = {
    mats, col, fires, timers, tide: TIDE[0], tideTarget: TIDE[0], playTime: 0, visTime: 0,
  });
  const ctx = {
    scene, mats, col, audio, fires,
    interact: [],
    batch: (i) => batches[i],
    water: () => W.tide,
    addTimer: (d, fn) => timers.push({ t: d, fn }),
    requestSave: () => (saveDirty = true),
    onSolved: (i) => {
      W.beacons[i].unlock();
      saveDirty = true;
    },
    onBeaconLit: (i) => onBeaconLit(i),
  };
  W.ctx = ctx;
  buildTerrain(scene, mats.vc);
  const water = buildWater(scene, bakeHeightTexture());
  const sky = buildSky(scene);
  const env = new Env(scene, sky, water);
  W.env = env;
  buildCauseways(batches[5], col);
  buildRocks((i) => batches[i], col);
  buildTrailMarkers(batches[3], col);
  await nextFrame();
  const beacons = [];
  for (let i = 0; i < 4; i++) beacons.push(new Beacon(ctx, i, BEACONS[i].x, BEACONS[i].z, { facing: (i * 72 + 90) * (Math.PI / 180) }));
  beacons.push(new Beacon(ctx, 4, LH.brazier.x, LH.brazier.z, { low: true, facing: (LH.doorBearing + 90) * (Math.PI / 180) }));
  W.beacons = beacons;
  const village = new Village(ctx, beacons[0]);
  const ring = new Ring(ctx, beacons[1]);
  const wreck = new Wreck(ctx, beacons[2]);
  const obs = new Observatory(ctx, beacons[3]);
  const lh = new Lighthouse(ctx, beacons);
  const landmarks = [village, ring, wreck, obs, lh];
  W.landmarks = landmarks;
  W.lh = lh;
  await nextFrame();
  const foliage = buildFoliage(scene, col);
  W.foliage = foliage;
  for (const b of batches) {
    if (b.empty) continue;
    const m = new THREE.Mesh(b.build(), mats.vc);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
  const player = new Player(ctx);
  W.player = player;
  const rig = new CameraRig(camera, col, ctx.water);
  W.rig = rig;
  const lightPositions = [beacons[0].lightPos, beacons[1].lightPos, beacons[2].lightPos, beacons[3].lightPos, lh.topPos];
  W.lightPositions = lightPositions;
  const finale = new Finale(ctx, lightPositions);
  W.finale = finale;
  const shimmer = new Shimmer(scene, fires.shared.uPx);
  W.shimmer = shimmer;
  // flying flames: lantern -> brazier, brazier -> lighthouse lamp
  W.flyers = [fires.create({ scale: 0.32, glow: 3 }), fires.create({ scale: 0.6, glow: 6 })];
  for (const f of W.flyers) scene.add(f.group);
  W.flights = [];
  // point lights: four nearest lit beacons
  W.beaconLights = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xff9a48, 0, 75, 1.0);
    l.position.set(0, -100, 0);
    scene.add(l);
    W.beaconLights.push(l);
  }
  // sound sources in the world
  const wavePts = [];
  for (const isl of ISLANDS) for (let k = 0; k < 4; k++) {
    const p = pol(k * 90 + 45 + isl.id * 17, isl.R * 0.95, isl.x, isl.z);
    wavePts.push(new THREE.Vector3(p.x, 1.5, p.z));
  }
  for (const c of CAUSEWAYS) for (const f of [0.3, 0.7]) wavePts.push(new THREE.Vector3(c.x0 + c.ux * c.len * f, c.top, c.z0 + c.uz * c.len * f));
  audio.setupWaves(wavePts);

  // ---------------------------------------------------------------- restore save
  const save = loadSave();
  W.hasSave = !!save;
  if (save) {
    try {
      landmarks.forEach((L, i) => L.load(save.lm && save.lm[i]));
      landmarks.forEach((L, i) => {
        if (L.solved) beacons[i].unlock(true);
      });
      for (let i = 0; i < 5; i++) if (save.lit && save.lit[i]) beacons[i].light(true);
      wreck.restoreVisuals();
      obs.restoreVisuals();
      lh.restoreVisuals();
      if (save.top || beacons[4].lit) {
        lh.lightTop(true);
        finale.finishInstant();
      }
      W.playTime = save.t || 0;
      const p = save.p || [PLAYER_START.x, PLAYER_START.z];
      player.place(p[0], p[1], save.yaw || 0);
      rig.yaw = save.cy || 0;
      rig.pitch = save.cp === undefined ? 0.32 : save.cp;
    } catch (e) {
      player.place(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
    }
  } else player.place(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
  ring.registerAudio();
  W.tide = W.tideTarget = TIDE[litCount()];
  W.saveDirty = () => saveDirty;
  W.clearDirty = () => (saveDirty = false);

  // ---------------------------------------------------------------- compile every shader now
  warmup();
  ui.ready(W.hasSave);
  state = 'title';
  W.revealT = 0;
}

function litCount() {
  const W = world;
  let n = 0;
  for (let i = 0; i < 4; i++) if (W.beacons[i].lit) n++;
  if (W.lh && W.lh.topLit) n++;
  return n;
}

const TITLE_POS = new THREE.Vector3(12, 15, 166);
const TITLE_LOOK = new THREE.Vector3(-1, 4, 100);

function warmup() {
  const W = world;
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  W.finale.setAllVisible(true);
  W.foliage.showAll();
  const sc = W.env.sun.shadow.camera;
  const saved = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
  sc.left = sc.bottom = -240;
  sc.right = sc.top = 240;
  sc.far = 1200;
  sc.updateProjectionMatrix();
  camera.position.copy(TITLE_POS);
  camera.lookAt(TITLE_LOOK);
  W.env.update(0, new THREE.Vector3(0, 0, 0), 0, W.tide);
  W.env.sun.position.set(0, 0, 0).addScaledVector(W.env.dir, 500);
  W.env.sun.target.position.set(0, 0, 0);
  W.env.sun.target.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  renderer.compile(scene, camera);
  renderer.info.reset();
  post.render(scene, camera, 0.5);
  [sc.left, sc.right, sc.top, sc.bottom, sc.far] = saved;
  sc.updateProjectionMatrix();
  for (const o of hidden) o.visible = false;
  W.finale.setAllVisible(false);
  if (W.finale.done) W.finale.finishInstant();
}

// ---------------------------------------------------------------- saving
function saveNow() {
  const W = world;
  if (!W || state === 'loading' || state === 'title') return;
  const s = {
    v: 1,
    t: W.playTime,
    p: [W.player.pos.x, W.player.pos.z],
    yaw: W.player.yaw,
    cy: W.rig.yaw,
    cp: W.rig.pitch,
    lit: W.beacons.map((b) => b.lit),
    top: W.lh.topLit,
    fin: W.finale.done,
    lm: W.landmarks.map((L) => L.save()),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (e) { /* storage unavailable */ }
  W.clearDirty();
}
window.addEventListener('pagehide', saveNow);
window.addEventListener('beforeunload', saveNow);

// ---------------------------------------------------------------- beacons
function flyTo(idx, from, to, dur, cb) {
  const W = world;
  W.flights = W.flights.filter((f) => f.idx !== idx);
  const f = W.flyers[idx];
  f.ignite(true);
  W.flights.push({ idx, from: from.clone(), to: to.clone(), t: 0, dur, cb, f });
}
function onBeaconLit(i) {
  const W = world;
  input.rumble(0.9, 0.6, 650);
  audio.success(W.beacons[i].firePos, 0.7);
  if (i < 4) {
    W.tideTarget = TIDE[litCount()];
    W.ctx.requestSave();
    saveNow();
    return;
  }
  // the door brazier sends its fire up the tower to the great lamp
  W.climbing = true;
  flyTo(1, W.beacons[4].firePos, W.lh.topPos, 2.8, () => {
    W.climbing = false;
    W.lh.lightTop();
    input.rumble(1, 1, 1200);
    W.tideTarget = TIDE[litCount()];
    W.finaleTime = W.playTime;
    W.finale.start();
    saveNow();
  });
}
const api = {
  raise(cb, target) {
    const W = world;
    W.player.raise();
    W.ctx.addTimer(0.42, () => {
      const from = W.player.lanternWorld.clone();
      const d = from.distanceTo(target);
      flyTo(0, from, target, clamp(d / 6, 0.3, 0.9), cb);
    });
  },
};

// ---------------------------------------------------------------- state changes
function requestLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* not available */ }
}
let usingLock = false;
function startGame(viaPad) {
  if (state !== 'title') return;
  const W = world;
  audio.unlock();
  requestLock();
  void viaPad;
  state = 'play';
  ui.showTitle(false);
  W.transT = 0;
  W.lastInteract = W.playTime;
  W.idle = 0;
  W.gullT = 4;
  W.saveT = 0;
  W.rig.snap(W.player.pos);
}
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  ui.showPause(true);
  ui.setPrompt(null);
  audio.setPaused(true);
  saveNow();
}
function resume() {
  if (state !== 'paused') return;
  state = 'play';
  ui.showPause(false);
  audio.setPaused(false);
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    usingLock = true;
    if (state === 'paused') resume();
  } else if (state === 'play' && usingLock) {
    usingLock = false;
    pause();
  }
});
window.addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    saveNow();
  }
});
input.onFirstGesture = () => {
  if (state === 'title' || state === 'play') audio.unlock();
};
// title: click anywhere (except the restart glyph) starts
ui.title.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('#restart')) return;
  if (state === 'title') startGame(false);
});
ui.pause.addEventListener('click', () => {
  if (state === 'paused') {
    audio.unlock();
    requestLock();
  }
});
canvas.addEventListener('click', () => {
  if (state === 'play' && document.pointerLockElement !== canvas) requestLock();
});
let holdMouse = false;
ui.restart.addEventListener('pointerdown', (e) => {
  holdMouse = true;
  e.stopPropagation();
});
window.addEventListener('pointerup', () => (holdMouse = false));
ui.restart.addEventListener('pointerleave', () => (holdMouse = false));
ui.restart.addEventListener('click', (e) => e.stopPropagation());

// ---------------------------------------------------------------- per-frame helpers
const _v = new THREE.Vector3();
function findInteract() {
  const W = world;
  const P = W.player;
  if (P.busy || W.finale.active || W.climbing) return null;
  const p = P.pos;
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  let best = null, bs = Infinity;
  for (const it of W.ctx.interact) {
    const dx = it.pos.x - p.x, dz = it.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > it.reach) continue;
    if (Math.abs(it.pos.y - (p.y + 1.0)) > 2.4) continue;
    if (!it.can()) continue;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (facing < -0.35 && d > 1.1) continue;
    const s = d - facing * 0.9;
    if (s < bs) {
      bs = s;
      best = it;
    }
  }
  return best;
}
function atPuzzle() {
  const p = world.player.pos;
  for (const L of world.landmarks) for (const z of L.zone) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) return true;
  return false;
}
function hintTarget() {
  const W = world;
  let stage = -1;
  for (let i = 0; i < 5; i++) if (!W.beacons[i].lit) { stage = i; break; }
  if (stage < 0) return null;
  const L = W.landmarks[stage];
  if (L.solved) return new THREE.Vector3(W.beacons[stage].x, W.beacons[stage].base, W.beacons[stage].z);
  if (!L.tutDone) return L.tutPos;
  return L.hintPos;
}
function assignLights() {
  const W = world;
  const p = W.player.pos;
  const lit = [];
  for (let i = 0; i < 4; i++) if (W.beacons[i].lit) lit.push(W.lightPositions[i]);
  if (W.lh.topLit) lit.push(W.lightPositions[4]);
  lit.sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
  const n = W.env.night;
  let active = 1;
  const wl = W.env.water.material.uniforms;
  for (let i = 0; i < 4; i++) {
    const L = W.beaconLights[i];
    if (lit[i]) {
      L.position.copy(lit[i]);
      L.intensity = lerp(6, 20, n) * (lit[i] === W.lightPositions[4] ? 1.5 : 1);
      active++;
    } else {
      L.intensity = 0;
      L.position.set(0, -100, 0);
    }
  }
  W.player.light.intensity = lerp(1.4, 5.0, n);
  if (W.player.light.intensity > 0) active++;
  // water reflections of every lit fire
  for (let i = 0; i < 5; i++) {
    const on = i < 4 ? W.beacons[i].lit : W.lh.topLit;
    wl.uLP.value[i].copy(W.lightPositions[i]);
    wl.uLC.value[i].setRGB(1.0, 0.55, 0.2).multiplyScalar(on ? 0.25 + n * 0.9 : 0);
  }
  return active;
}

let fpsAvg = 60;
let last = performance.now();
let restartHold = 0;
const rngGull = mulberry32(99);

function update(dt) {
  const W = world;
  const P = W.player;
  W.playTime += dt;
  W.visTime += dt;
  for (let i = W.timers.length - 1; i >= 0; i--) {
    const t = W.timers[i];
    t.t -= dt;
    if (t.t <= 0) {
      W.timers.splice(i, 1);
      t.fn();
    }
  }
  for (let i = W.flights.length - 1; i >= 0; i--) {
    const f = W.flights[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    const e = k * k * (3 - 2 * k);
    if (f.idx === 1) {
      // the fire spirals up the outside of the tower to the lamp room
      const a0 = Math.atan2(f.from.x - f.to.x, f.from.z - f.to.z);
      const ang = a0 + k * Math.PI * 2.5;
      const r = k < 0.88 ? lerp(5.6, 4.0, k / 0.88) : lerp(4.0, 0.0, (k - 0.88) / 0.12);
      _v.set(f.to.x + Math.sin(ang) * r, lerp(f.from.y, f.to.y, k), f.to.z + Math.cos(ang) * r);
    } else {
      _v.copy(f.from).lerp(f.to, e);
      _v.y += Math.sin(Math.PI * k) * Math.min(2.2, f.from.distanceTo(f.to) * 0.25);
    }
    f.f.group.position.copy(_v).add(new THREE.Vector3(0, -0.2 * f.f.scale, 0));
    if (k >= 1) {
      W.flights.splice(i, 1);
      f.f.douse(true);
      f.cb();
    }
  }
  const phase = Math.min(1, W.playTime / DAY_LENGTH);
  // tide
  const dT = W.tideTarget - W.tide;
  W.tide += Math.sign(dT) * Math.min(Math.abs(dT), 0.06 * dt);
  if (Math.abs(dT) > 0.001) {
    W.washT = (W.washT || 0) - dt;
    for (const c of CAUSEWAYS) {
      if (W.tide > c.top - 0.25 && W.tide < c.top + 0.45 && W.washT <= 0) {
        const f = clamp(((P.pos.x - c.x0) * c.ux + (P.pos.z - c.z0) * c.uz) / c.len + (rngGull() - 0.5) * 0.3, 0.05, 0.95);
        audio.wash(new THREE.Vector3(c.x0 + c.ux * c.len * f, c.top, c.z0 + c.uz * c.len * f), 1);
        W.washT = 0.55;
      }
    }
  }
  // look
  const inFinale = W.finale.active;
  if (!inFinale) {
    const sens = 0.0022;
    W.rig.addLook(input.mdx * sens + input.pad.rx * 2.6 * dt, input.mdy * sens + input.pad.ry * 1.8 * dt);
  }
  const mv = input.move();
  P.update(dt, mv, W.rig.yaw, !inFinale && !W.climbing);
  // interaction
  const it = findInteract();
  W.current = it;
  if (it && input.interact()) {
    it.press(api);
    W.lastInteract = W.playTime;
  }
  for (const L of W.landmarks) L.update(dt, W.visTime, P.pos);
  for (const b of W.beacons) b.update(dt);
  // camera
  W.rig.update(dt, P.pos);
  if (W.transT < 1) {
    W.transT = Math.min(1, W.transT + dt / 1.8);
    const e = smoothstep(0, 1, W.transT);
    const rp = camera.position.clone();
    const rl = W.rig.look.clone();
    camera.position.copy(TITLE_POS).lerp(rp, e);
    camera.lookAt(TITLE_LOOK.clone().lerp(rl, e));
  }
  let shadowCenter = P.pos;
  if (inFinale || W.finale.active) {
    const r = W.finale.update(dt, W.visTime, W.tide);
    if (r) {
      ui.fade(r.fade);
      ui.showCard(r.card, W.finaleTime);
      if (!W.finale.handBack) {
        camera.position.copy(W.finale.camPos);
        camera.lookAt(W.finale.camLook);
        shadowCenter = new THREE.Vector3(W.finale.camLook.x, 0, W.finale.camLook.z);
      } else W.rig.snap(P.pos);
      if (r.ended) {
        ui.fade(0);
        ui.showCard(false);
        saveNow();
      }
    }
  } else W.finale.update(dt, W.visTime, W.tide);
  W.env.update(phase, shadowCenter, W.visTime, W.tide);
  W.fires.update(dt, W.visTime, W.env.night);
  W.foliage.update(W.visTime, camera.position, W.rig.pivotS || P.pos);
  W.activeLights = assignLights();
  // idle hint
  const moving = Math.hypot(mv.x, mv.y) > 0.1 || Math.abs(input.mdx) + Math.abs(input.mdy) > 30 || P.speed > 0.3;
  W.idle = moving ? 0 : (W.idle || 0) + dt;
  const tgt = hintTarget();
  if (tgt && !inFinale && W.idle > 18 && W.playTime - W.lastInteract > 25 && !atPuzzle() && !it) W.shimmer.show(tgt);
  else if (moving || !tgt || atPuzzle()) W.shimmer.hide();
  W.shimmer.update(dt, W.visTime);
  // gulls over the nearest island, fewer at night
  W.gullT -= dt;
  if (W.gullT <= 0) {
    W.gullT = (W.env.night > 0.6 ? 30 : 8) + rngGull() * 12;
    let best = ISLANDS[0], bd = Infinity;
    for (const isl of ISLANDS) {
      const d = Math.hypot(isl.x - P.pos.x, isl.z - P.pos.z);
      if (d < bd) { bd = d; best = isl; }
    }
    const a = rngGull() * Math.PI * 2, r = 10 + rngGull() * best.R;
    audio.gull(new THREE.Vector3(best.x + Math.cos(a) * r, 16 + rngGull() * 12, best.z + Math.sin(a) * r));
  }
  audio.listener(camera);
  // autosave
  W.saveT += dt;
  if (W.saveT > 3) {
    W.saveT = 0;
    saveNow();
  }
}

function titleUpdate(dt) {
  const W = world;
  W.visTime += dt;
  W.revealT += dt;
  ui.fade(Math.max(0, 1 - W.revealT / 1.2));
  camera.position.copy(TITLE_POS);
  camera.lookAt(TITLE_LOOK);
  const phase = Math.min(1, W.playTime / DAY_LENGTH);
  W.env.update(phase, new THREE.Vector3(0, 0, 112), W.visTime, W.tide);
  W.fires.update(dt, W.visTime, W.env.night);
  W.foliage.update(W.visTime, camera.position, new THREE.Vector3(0, -999, 0));
  for (const b of W.beacons) b.update(dt);
  W.finale.update(dt, W.visTime, W.tide);
  W.player.animate(dt, 0);
  W.activeLights = assignLights();
  // starting
  if (input.pressed('Pad0')) startGame(true);
  if (input.pressed('Enter') || input.pressed('Space') || input.pressed('KeyE')) startGame(false);
  // hold to start over
  const holding = W.hasSave && (holdMouse || input.pad.y);
  restartHold = holding ? restartHold + dt : Math.max(0, restartHold - dt * 3);
  ui.setRestart(Math.min(1, restartHold / 1.6));
  if (restartHold >= 1.6) {
    clearSave();
    W.hasSave = false;
    state = 'loading';
    window.removeEventListener('pagehide', saveNow);
    window.removeEventListener('beforeunload', saveNow);
    location.reload();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  fpsAvg = lerp(fpsAvg, 1 / dt, 0.05);
  input.poll();
  if (input.pressed('Backquote') || input.pressed('Pad8')) ui.toggleStats();
  if (state === 'loading') {
    input.endFrame();
    return;
  }
  if (state === 'paused') {
    if (input.pressed('Pad0')) {
      resume();
      requestLock();
    }
    input.endFrame();
    return;
  }
  if (state === 'title') titleUpdate(dt);
  else if (state === 'play') {
    if (input.pressed('Pad9')) {
      pause();
      input.endFrame();
      return;
    }
    update(dt);
  }
  renderer.info.reset();
  const W = world;
  W.env.sky.position.copy(camera.position);
  post.render(scene, camera, W.env.bloom);
  // prompt glyph over the thing that can be used
  if (state === 'play' && W.current && !W.finale.active) {
    _v.copy(W.current.prompt || W.current.pos).project(camera);
    if (_v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
      ui.setPrompt((_v.x * 0.5 + 0.5) * window.innerWidth, (-_v.y * 0.5 + 0.5) * window.innerHeight, input.device === 'pad' ? 'pad' : 'kb');
    } else ui.setPrompt(null);
  } else ui.setPrompt(null);
  ui.updateStats(fpsAvg, renderer.info.render.triangles, renderer.info.render.calls, W.activeLights || 1);
  input.endFrame();
}

boot().then(() => requestAnimationFrame(frame));
