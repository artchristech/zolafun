// Five Lights — game bootstrap and loop.
import * as THREE from './three.module.min.js';
import { clamp, lerp, damp, smoothstep } from './util.js';
import { WATER_LEVELS, CAUSE_TOPS, DAY_LENGTH, VILLAGE, ISLANDS } from './layout.js';
import { CAUSEWAYS, TRAIL } from './terrain.js';
import { buildWorld, TITLE_VIEW } from './world.js';
import { Sky } from './sky.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Post } from './post.js';
import { UI } from './ui.js';
import { fireTime } from './fire.js';
import { foliageU } from './foliage.js';
import { Finale } from './finale.js';

const SAVE_KEY = 'five-lights-save-v1';
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);
const rig = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);
const post = new Post(renderer);
const ui = new UI();
const input = new Input(canvas);
const sound = new Sound();

const built = buildWorld(scene);
const ctx = built.ctx;
const W = built.finish(sound);
const { puzzles, water } = W;
const beacons = puzzles.map((p) => p.beacon);
const sky = new Sky(scene, puzzles[3].starDir);
const player = new Player(scene);
player.onStep = (surf) => sound.step(surf);
const follow = new FollowCam(rig);
const finale = new Finale(scene);
finale.prepare(beacons.map((b) => b.top.clone().add(new THREE.Vector3(0, 1.2, 0))));

// ---------------------------------------------------------------- state
const G = {
  mode: 'title', elapsed: 0, lit: [false, false, false, false, false],
  water: WATER_LEVELS[0], waterTarget: WATER_LEVELS[0],
  lastInteract: 0, clock: 0, saveT: 0, pending: [], freeze: 0,
  hintA: 0, hintOn: false, trans: 0, resetHold: 0, resetMouse: false,
};
const litCount = () => G.lit.filter(Boolean).length;

function save() {
  try {
    const data = {
      t: G.elapsed, lit: G.lit,
      pz: puzzles.map((p) => p.save()),
      p: { x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2), y: +player.yaw.toFixed(3) },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable: play continues unsaved */ }
}
function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
  return data && Array.isArray(data.lit) ? data : null;
}

ctx.save = () => { G.saveT = Math.min(G.saveT, 0.3); };
ctx.raiseLantern = (cb) => {
  player.raise();
  G.freeze = 1.1;
  G.pending.push({ t: 0.65, cb });
};
ctx.solved = () => { G.lastInteract = G.clock; G.saveT = 0; };
ctx.lightBeacon = (i) => lightBeacon(i);

function lightBeacon(i, instant = false) {
  if (G.lit[i]) return;
  G.lit[i] = true;
  beacons[i].setState(2, instant);
  G.waterTarget = WATER_LEVELS[litCount()];
  if (instant) { G.water = G.waterTarget; return; }
  sound.play('whoosh', beacons[i].top);
  sound.play('chime', beacons[i].top);
  input.rumble(i === 4 ? 1 : 0.8, 0.6, i === 4 ? 1200 : 700);
  if (i === 4) { finale.start(); sound.play('finale'); }
  ui.setLights(litCount());
  G.saveT = 0;
}

// beacon interactions (light a smouldering beacon with the lantern)
beacons.forEach((b, i) => {
  if (i === 4) return;
  ctx.interact({
    pos: b.top.clone().add(new THREE.Vector3(0, -1.6, 0)), r: 3.2, at: -1,
    enabled: () => b.state === 1,
    press: () => ctx.raiseLantern(() => lightBeacon(i)),
  });
});

function applySave(data) {
  if (!data) return;
  G.elapsed = clamp(+data.t || 0, 0, DAY_LENGTH * 4);
  puzzles.forEach((p, i) => { p.load(data.pz && data.pz[i]); if (p.solved && i < 4) p.beacon.setState(1, true); });
  data.lit.forEach((v, i) => { if (v) lightBeacon(i, true); });
  if (G.lit[4]) finale.start(true);
  if (data.p && Number.isFinite(data.p.x) && Number.isFinite(data.p.z)) player.place(data.p.x, data.p.z, data.p.y || 0);
}

// ---------------------------------------------------------------- setup
player.place(VILLAGE.start.x, VILLAGE.start.z, Math.PI);
const saved = load();
applySave(saved);
G.water = G.waterTarget;
ui.setLights(litCount());
ui.showReset(!!saved && (saved.t > 5 || saved.lit.some(Boolean)));
follow.yaw = player.yaw + Math.PI; follow.pitch = 0.3;
follow.snap(player.pos);
camera.position.copy(TITLE_VIEW.pos);
camera.lookAt(TITLE_VIEW.look);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  camera.aspect = rig.aspect = w / h;
  camera.updateProjectionMatrix(); rig.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// compile every shader while the title is up: show everything once, then restore
async function precompile() {
  G.compiling = true;
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) { renderer.compile(scene, camera); }
  sky.update(0, player.pos, camera, water);
  post.render(scene, camera, 0.4, 1);
  for (const o of hidden) o.visible = false;
  G.compiling = false;
  ui.setReady(true);
  G.ready = true;
}

// ---------------------------------------------------------------- input glue
document.getElementById('resetBox').addEventListener('mousedown', (e) => { G.resetMouse = true; e.stopPropagation(); });
addEventListener('mouseup', () => { G.resetMouse = false; });
addEventListener('keydown', (e) => {
  if (e.code === 'F3') e.preventDefault();
  if (e.code === 'Backquote' || e.code === 'F3') ui.toggleStats();
});
input.onGesture = (kind) => {
  sound.unlock();
  if (G.mode === 'play' && kind === 'click') input.lock();
  if (G.mode === 'title' && G.ready && !G.resetMouse) {
    if (kind === 'click') input.lock();
  }
};

function startGame() {
  if (G.mode !== 'title') return;
  G.mode = 'play';
  G.trans = 0;
  G.lastInteract = G.clock;
  sound.unlock();
  ui.hideTitle();
  ui.showReset(false);
}

// ---------------------------------------------------------------- per-frame helpers
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3();
let current = null;
function pickInteractable() {
  let best = null, bd = 1e9;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  for (const it of ctx.interactables) {
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.pos.y - player.pos.y) > 3.2) continue;
    if (d > 0.9 && (dx * fx + dz * fz) / d < -0.2) continue;
    if (!it.enabled()) continue;
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

function nextGoal() {
  const i = G.lit.findIndex((v) => !v);
  if (i < 0) return null;
  const p = puzzles[i];
  if (p.beacon.state === 1) return { pos: p.beacon.top.clone().setY(p.beacon.top.y - 2), p, beacon: true };
  if (i === 3) {
    const I = ISLANDS[3];
    const onPeak = Math.hypot(player.pos.x - I.x, player.pos.z - I.z) < 36 && player.pos.y > 8;
    return { pos: onPeak ? p.center : new THREE.Vector3(TRAIL[0].x, TRAIL[0].h, TRAIL[0].z), p };
  }
  return { pos: p.hint, p };
}

function updateHint(dt) {
  const goal = nextGoal();
  let want = false;
  if (goal) {
    const atPuzzle = player.pos.distanceTo(goal.p.center) < goal.p.focusR;
    const atGoal = Math.hypot(player.pos.x - goal.pos.x, player.pos.z - goal.pos.z) < 6;
    const quiet = G.clock - G.lastInteract > 30;
    if (!G.hintOn && player.stillTime > 16 && quiet && !atPuzzle) G.hintOn = true;
    if (G.hintOn && (atGoal || atPuzzle || !quiet)) G.hintOn = false;
    want = G.hintOn;
    W.shimmer.position.copy(goal.pos);
  }
  G.hintA = damp(G.hintA, want ? 1 : 0, 1.5, dt);
  W.shimmer.visible = G.hintA > 0.01;
  W.shimmerMat.uniforms.uAlpha.value = G.hintA;
  W.shimmerMat.uniforms.uTime.value = G.clock;
}

const litList = [];
function updateLights(night) {
  // the four nearest burning beacons plus the lantern
  litList.length = 0;
  beacons.forEach((b, i) => { if (b.state === 2 || b.fire.intensity > 0.05) litList.push(b); });
  litList.sort((a, b) => a.lightPos.distanceToSquared(player.pos) - b.lightPos.distanceToSquared(player.pos));
  const wl = water.material.uniforms.uLights.value;
  let active = 0;
  W.beaconLights.forEach((l, k) => {
    const b = litList[k];
    if (b) {
      l.position.copy(b.lightPos);
      l.intensity = lerp(25, 140, night) * b.fire.intensity * (0.92 + 0.08 * Math.sin(G.clock * 13 + k * 3));
      wl[k].set(b.lightPos.x, b.lightPos.y, b.lightPos.z, b.fire.intensity * lerp(0.15, 1, night));
      active++;
    } else { l.intensity = 0; wl[k].w = 0; }
  });
  const ln = W.lantern;
  ln.position.copy(player.lanternWorld);
  ln.intensity = lerp(1.2, 9, night) * (0.9 + 0.1 * Math.sin(G.clock * 17) * Math.sin(G.clock * 7.3));
  wl[4].set(ln.position.x, ln.position.y, ln.position.z, 0.25 * night);
  return active + 1;
}

let tideWasAbove = CAUSE_TOPS.map((t) => G.water > t + 0.02);
function updateTide(dt) {
  if (G.water > G.waterTarget) G.water = Math.max(G.waterTarget, G.water - dt * 0.07);
  water.position.y = G.water;
  water.material.uniforms.uWater.value = G.water;
  CAUSEWAYS.forEach((C, k) => {
    const above = G.water > C.top + 0.02;
    if (tideWasAbove[k] && !above) {
      // the stones break the surface: wash along the whole causeway
      for (let s = 0.15; s < 1; s += 0.35) sound.play('wash', { x: C.ax + (C.bx - C.ax) * s, y: C.top, z: C.az + (C.bz - C.az) * s });
    }
    tideWasAbove[k] = above;
    const near = Math.abs(G.water - C.top);
    W.causeEmit[k].level = 0.35 + 1.2 * (1 - smoothstep(0, 0.4, near));
  });
  for (const f of ctx.floaters) f.position.y = G.water - 0.05 + Math.sin(G.clock * 1.2 + f.position.x) * 0.06;
}

// ---------------------------------------------------------------- loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, statT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.clock += dt;
  renderer.info.reset();
  input.poll();
  if (input.pressed.has('Pad0') || input.pressed.has('Pad9')) sound.unlock();

  if (G.mode === 'title') {
    const holding = input.keys.has('KeyR') || input.padHeld(3) || G.resetMouse;
    const canReset = document.getElementById('resetBox').style.display !== 'none';
    G.resetHold = holding && canReset ? G.resetHold + dt : 0;
    ui.resetProgress(clamp(G.resetHold / 1.6, 0, 1));
    if (G.resetHold > 1.6) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      location.reload();
      return;
    }
    if (G.ready && !holding) {
      for (const k of input.pressed) {
        if (k === 'KeyR' || k === 'Backquote' || k === 'F3' || k === 'Pad3') continue;
        if (k.startsWith('Key') || k.startsWith('Digit') || k === 'Space' || k === 'Enter' || k.startsWith('Arrow') || k === 'Mouse0' || k === 'Pad0' || k === 'Pad9') { startGame(); break; }
      }
    }
    // the opening view: a slow drift framing the village and its beacon
    const s = Math.sin(G.clock * 0.05) * 3;
    camera.position.set(TITLE_VIEW.pos.x + s, TITLE_VIEW.pos.y, TITLE_VIEW.pos.z);
    camera.lookAt(TITLE_VIEW.look);
  } else {
    G.elapsed += dt;
    const look = input.look(dt);
    follow.look(look.dx, look.dy);
    G.freeze = Math.max(0, G.freeze - dt);
    const mv = input.move();
    player.update(dt, mv, follow.sYaw, G.water, G.freeze > 0 || G.trans < 0.6);
    follow.update(dt, player.pos);
    G.trans = Math.min(1, G.trans + dt / 2.6);
    if (G.trans < 1) {
      const e = smoothstep(0, 1, G.trans);
      camera.position.lerpVectors(TITLE_VIEW.pos, rig.position, e);
      _v.copy(TITLE_VIEW.look).lerp(_fwd.copy(player.pos).setY(player.pos.y + 1.6), e);
      camera.lookAt(_v);
    } else {
      camera.position.copy(rig.position);
      camera.quaternion.copy(rig.quaternion);
    }
    // pending lantern raises
    for (let i = G.pending.length - 1; i >= 0; i--) {
      const p = G.pending[i];
      p.t -= dt;
      if (p.t <= 0) { G.pending.splice(i, 1); p.cb(); }
    }
    current = G.freeze > 0 ? null : pickInteractable();
    if (current && input.interact()) {
      current.press();
      G.lastInteract = G.clock;
      G.hintOn = false;
      current = null;
    }
    updateHint(dt);
    G.saveT -= dt;
    if (G.saveT <= 0) { save(); G.saveT = 5; }
  }

  // world
  const dayT = clamp(G.elapsed / DAY_LENGTH, 0, 1);
  fireTime.value = G.clock;
  foliageU.uTime.value = G.clock;
  foliageU.uCam.value.copy(camera.position);
  foliageU.uPlayer.value.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
  water.material.uniforms.uTime.value = G.clock;
  updateTide(dt);
  for (const p of puzzles) p.update(dt, player.pos);
  finale.update(dt, G.water);
  if (G.mode === 'title') player.update(dt, { x: 0, y: 0 }, follow.sYaw, G.water, true);
  sky.update(dayT, G.mode === 'title' ? TITLE_VIEW.look : player.pos, camera, water);
  const night = sky.night;
  const lights = updateLights(night);
  sound.setNight && sound.ready && sound.setNight(night);
  beacons.forEach((b, i) => { W.fireEmit[i].level = b.state === 2 ? 1 : b.state === 1 ? 0.2 : 0; });
  camera.getWorldDirection(_fwd);
  sound.update(dt, camera.position, _fwd);

  // prompt
  if (G.mode === 'play' && current) {
    _v.copy(current.pos).setY(current.pos.y + 0.9).project(camera);
    if (_v.z < 1) ui.setPrompt({ x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight }, input.device);
    else ui.setPrompt(null);
  } else ui.setPrompt(null);

  if (!G.compiling) post.render(scene, camera, lerp(0.3, 1.15, night), lerp(1.0, 1.35, night));

  fpsAcc += dt; fpsN++; statT += dt;
  if (statT > 0.5) {
    fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; statT = 0;
    const inf = renderer.info.render;
    ui.setStats(`fps ${fps.toFixed(0)}\ntris ${inf.triangles.toLocaleString()}\ncalls ${inf.calls}\nlights ${lights} point + sun + sky`);
  }
  input.endFrame();
}

precompile();
requestAnimationFrame(frame);
addEventListener('beforeunload', () => { if (G.mode === 'play') save(); });
