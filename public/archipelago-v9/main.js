// Five Lights: boot, game loop, modes (title / play / paused), tide, saving.
import * as THREE from './three.module.min.js';
import { bake, TIDE, CAUSEWAYS, ISL, ISL_LIST } from './terrain.js';
import { createEnv } from './env.js';
import { buildStatic, buildFoliage, Grass } from './world.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Beacons } from './beacons.js';
import { Puzzles } from './puzzles.js';
import { Hud } from './hud.js';
import { Post } from './post.js';
import { Hint } from './hint.js';
import { Finale } from './finale.js';
import { fireUniforms } from './fire.js';
import { START, TITLE_CAM } from './places.js';
import { load, save, clear } from './save.js';
import { smooth, lerp } from './util.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1600);
const hud = new Hud();
const input = new Input(canvas);
const sound = new Sound();

// --- build the world -----------------------------------------------------------------------
bake();
const env = createEnv(scene);
const stat = buildStatic(scene);
const foliage = buildFoliage(scene);
const grass = new Grass(scene);
const player = new Player(scene);
player.onStep = (surf, s) => sound.step(surf, s);
const beacons = new Beacons(scene, stat.beaconTops, sound);
const follow = new FollowCam(camera, foliage.records);
const post = new Post(renderer);

const S = {
  mode: 'title', gameTime: 0, playTime: 0, finalTime: 0, anim: 0, level: TIDE[0], lastInteract: -1e9,
  wantLock: false, lockGrace: 0, titleW: 1, dirty: false, saveTimer: 0, resetHold: 0, mouseReset: false,
};
const ctx = {
  scene, sound, beacons, player,
  onSolved: (i) => { beacons.list[i].ready = true; persist(); },
  changed: () => { S.dirty = true; },
};
const puzzles = new Puzzles(ctx);
const hint = new Hint(scene, fireUniforms.uPx);
const finale = new Finale(scene, beacons, hud, follow);

// shore surf sources
for (const k of ISL_LIST) {
  const I = ISL[k];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + I.seed;
    sound.addWave(I.x + Math.cos(a) * I.r * 0.98, I.z + Math.sin(a) * I.r * 0.98);
  }
}
const washTimers = CAUSEWAYS.map(() => 0);

// --- restore ---------------------------------------------------------------------------------
const saved = load();
if (saved) {
  S.gameTime = saved.t || 0;
  S.playTime = saved.play || 0;
  S.finalTime = saved.ft || 0;
  (saved.lit || []).forEach((l, i) => { if (l && beacons.list[i]) beacons.setLit(i, true); });
  (saved.ready || []).forEach((r, i) => { if (r && beacons.list[i]) beacons.list[i].ready = true; });
  puzzles.setState(saved.pz);
}
S.level = TIDE[beacons.litCount()];
if (saved && saved.p) {
  player.place(saved.p[0], saved.p[1], saved.p[2], S.level);
  if (saved.cam) { follow.yaw = saved.cam[0]; follow.pitch = saved.cam[1]; }
} else {
  player.place(START.x, START.z, START.yaw, S.level);
  follow.yaw = START.yaw;
}
if (saved && (saved.fin || (saved.lit && saved.lit[4]))) finale.finish();
hud.setDots(beacons.list.map((b) => b.lit));

function persist() {
  save({
    t: S.gameTime, play: S.playTime, ft: S.finalTime,
    p: [player.pos.x, player.pos.z, player.yaw], cam: [follow.yaw, follow.pitch],
    lit: beacons.list.map((b) => b.lit), ready: beacons.list.map((b) => b.ready),
    pz: puzzles.getState(), fin: finale.done,
  });
  S.dirty = false;
}

beacons.onLit = (i) => {
  input.rumble(700, 1.0, 0.8);
  hud.setDots(beacons.list.map((b) => b.lit));
  if (i === 4) { S.finalTime = S.playTime; finale.start(); }
  persist();
};

// --- sizing ----------------------------------------------------------------------------------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const v = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(v.x, v.y);
  fireUniforms.uPx.value = v.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
addEventListener('resize', resize);
resize();

// --- compile everything while the title is up ----------------------------------------------------
function warmup() {
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const sc = env.sun.shadow.camera;
  const old = [sc.left, sc.right, sc.top, sc.bottom, sc.far];
  Object.assign(sc, { left: -400, right: 400, top: 400, bottom: -400, far: 900 });
  sc.updateProjectionMatrix();
  env.setTime(0);
  env.updateShadow(new THREE.Vector3(-20, 0, -95));
  camera.position.set(...TITLE_CAM.pos);
  camera.lookAt(...TITLE_CAM.look);
  grass.update(player.pos.x, player.pos.z, 0);
  renderer.setRenderTarget(post.scene);
  renderer.compile(scene, camera);
  renderer.setRenderTarget(null);
  renderer.info.reset();
  post.render(scene, camera);
  [sc.left, sc.right, sc.top, sc.bottom, sc.far] = old;
  sc.updateProjectionMatrix();
  for (const o of hidden) o.visible = false;
  renderer.info.reset();
}

// --- modes -------------------------------------------------------------------------------------
let ready = false;
function start(dev) {
  if (!ready || S.mode !== 'title') return;
  sound.unlock();
  S.mode = 'play';
  S.wantLock = dev === 'kb';
  S.lockGrace = 1.5;
  if (S.wantLock) input.requestLock();
  hud.showTitle(false);
}
function pause() {
  if (S.mode !== 'play') return;
  S.mode = 'paused';
  hud.showPause(true);
  hud.showPrompt(null);
  sound.setPaused(true);
  persist();
}
function resume(dev) {
  if (S.mode !== 'paused') return;
  sound.unlock();
  if (dev === 'kb') {
    S.wantLock = true;
    if (input.locked) doResume(); else input.requestLock();
  } else { S.wantLock = false; doResume(); }
}
function doResume() {
  S.mode = 'play';
  S.lockGrace = 1.5;
  hud.showPause(false);
  sound.setPaused(false);
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { if (S.mode === 'paused' && S.wantLock) doResume(); }
  else if (S.mode === 'play' && S.wantLock) pause();
});
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('beforeunload', () => { if (S.mode !== 'title' || saved) persist(); });

hud.title.addEventListener('click', () => start('kb'));
hud.pause.addEventListener('click', () => resume('kb'));
canvas.addEventListener('click', () => { if (S.mode === 'paused') resume('kb'); else if (S.mode === 'play' && S.wantLock && !input.locked) input.requestLock(); });
addEventListener('mousedown', () => { if (S.mode !== 'title') sound.unlock(); });
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { hud.togglePerf(); return; }
  if (S.mode === 'title' && e.code !== 'KeyR' && !e.repeat) start('kb');
  else if (S.mode === 'paused' && !e.repeat && e.code !== 'Escape') resume('kb');
  else sound.unlock();
});
hud.reset.addEventListener('pointerdown', (e) => { S.mouseReset = true; e.stopPropagation(); });
addEventListener('pointerup', () => { S.mouseReset = false; });
hud.reset.addEventListener('pointerleave', () => { S.mouseReset = false; });

// --- per-frame helpers ---------------------------------------------------------------------------
const tmpV = new THREE.Vector3();
function updateTide(dt) {
  const target = TIDE[beacons.litCount()];
  const prev = S.level;
  if (S.level > target) S.level = Math.max(target, S.level - dt * 0.1);
  CAUSEWAYS.forEach((c, i) => {
    if (prev !== S.level && S.level < c.top + 0.5 && S.level > c.top - 0.25) {
      washTimers[i] -= dt;
      if (washTimers[i] <= 0) {
        washTimers[i] = 0.5 + Math.random() * 0.6;
        const s = Math.random() * c.len;
        sound.wash(c.x0 + c.ux * s, c.z0 + c.uz * s, 1);
      }
    }
  });
}

function islandOf(p) {
  let best = 0, bd = 1e9;
  ISL_LIST.forEach((k, i) => { const I = ISL[k]; const d = Math.hypot(p.x - I.x, p.z - I.z) / I.r; if (d < bd) { bd = d; best = i; } });
  return best;
}
function hintTarget() {
  const s = beacons.litCount();
  if (s >= 5 || finale.active) return null;
  if (player.stillTime < 22 || S.anim - S.lastInteract < 30) return null;
  if (puzzles.near(player.pos, 9)) return null;
  const j = islandOf(player.pos);
  if (j < s) { const c = CAUSEWAYS[j]; return tmpV.set(c.x0 + c.ux * 4, c.top + 1.5, c.z0 + c.uz * 4).clone(); }
  const b = beacons.list[s];
  if (b.ready && !b.lit && !b.igniting) return new THREE.Vector3(b.B.x, b.base + 2, b.B.z);
  return puzzles.list[s].hintPoint();
}

const perf = { acc: 0, frames: 0, fps: 60 };
function countLights() {
  let n = 0;
  for (const l of env.points) if (l.intensity > 0) n++;
  if (env.sun.intensity > 0) n++;
  if (env.hemi.intensity > 0) n++;
  return n;
}

// --- loop ----------------------------------------------------------------------------------------
let last = performance.now();
const prompt = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  renderer.info.reset();
  input.poll(raw);
  hud.setDevice(input.device);

  // gamepad mode changes
  if (S.mode === 'title' && input.padPressed.has(0)) start('pad');
  else if (S.mode === 'paused' && input.padPressed.has(0)) resume('pad');
  else if (S.mode === 'play' && input.padPressed.has(9)) { pause(); }

  // hold to start over (title only)
  if (S.mode === 'title' && ready) {
    const holding = S.mouseReset || input.keys.has('KeyR') || input.padHeld.has(3);
    S.resetHold = holding ? S.resetHold + raw / 1.6 : Math.max(0, S.resetHold - raw * 2);
    hud.resetProgress(Math.min(1, S.resetHold));
    if (S.resetHold >= 1) { clear(); S.resetHold = -99; location.reload(); }
  }

  if (S.mode === 'play' && S.wantLock && !input.locked) {
    S.lockGrace -= raw;
    if (S.lockGrace <= 0) pause();
  }

  const running = S.mode !== 'paused';
  const dt = running ? raw : 0;
  if (running) S.anim += dt;
  const playing = S.mode === 'play';

  if (playing) {
    S.gameTime += dt;
    S.playTime += dt;
    const cin = finale.active;
    if (!cin) follow.rotate(input.look.x, input.look.y);
    const fx = Math.sin(follow.yaw), fz = Math.cos(follow.yaw);
    const mx = cin ? 0 : input.move.z * fx - input.move.x * fz;
    const mz = cin ? 0 : input.move.z * fz + input.move.x * fx;
    player.update(dt, mx, mz, S.level);
    // interaction
    const it = cin || player.locked > 0 ? null : puzzles.find(player);
    if (it && input.interact) { it.press(); S.lastInteract = S.anim; S.dirty = true; }
    if (it && S.titleW < 0.2) {
      prompt.copy(it.pos); prompt.y += 1.3;
      prompt.project(camera);
      if (prompt.z < 1) hud.showPrompt((prompt.x * 0.5 + 0.5) * innerWidth, (-prompt.y * 0.5 + 0.5) * innerHeight);
      else hud.showPrompt(null);
    } else hud.showPrompt(null);
    S.titleW = Math.max(0, S.titleW - dt / 2.6);
    updateTide(dt);
    S.saveTimer += dt;
    if (S.saveTimer > 3) { S.saveTimer = 0; persist(); }
  } else if (S.mode === 'title') {
    player.update(dt, 0, 0, S.level);
  }

  if (running) {
    puzzles.update(dt, S.anim, player);
    beacons.update(dt, S.anim);
  }

  // time of day, lights
  const t = S.gameTime / 1200;
  env.setTime(t);
  const night = env.night;
  env.update(S.anim, S.level);
  beacons.assignLights(env, player.pos, night);
  const lan = env.points[0];
  lan.position.copy(player.lanternWorld);
  lan.intensity = lerp(0.8, 5.0, night) * (1 + player.raise * 0.6) * (0.95 + Math.sin(S.anim * 11) * 0.05);
  player.glow.value = 1.2 + night * 2.5 + player.raise * 1.5;
  post.bloom = 0.25 + 0.8 * night;
  renderer.toneMappingExposure = 1.0 + night * 0.35;

  // camera
  const fw = finale.update(dt, S.anim, S.level, S.finalTime || S.playTime);
  let w = smooth(0, 1, S.titleW);
  if (fw > 0) w = Math.max(w, fw);
  else follow.setScript(tmpV.set(...TITLE_CAM.pos), new THREE.Vector3(...TITLE_CAM.look));
  if (running) follow.update(dt, player, w);
  env.updateShadow(w > 0.5 && fw > 0 ? follow.script.look : player.pos);
  grass.update(player.pos.x, player.pos.z, S.anim);
  fireUniforms.uTime.value = S.anim;
  hint.update(dt, S.anim, playing ? hintTarget() : null);

  // audio
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  sound.listen(camera.position, fwd);
  sound.update(dt, camera.position, !running || night > 0.8);

  post.render(scene, camera);

  // readout
  perf.acc += raw; perf.frames++;
  if (perf.acc > 0.4) {
    perf.fps = perf.frames / perf.acc; perf.acc = 0; perf.frames = 0;
    if (hud.perfOn) hud.setPerf({ fps: perf.fps, tris: renderer.info.render.triangles, calls: renderer.info.render.calls, lights: countLights() });
  }
  input.endFrame();
}

// build -> compile -> title
requestAnimationFrame(() => {
  warmup();
  ready = true;
  hud.ready();
  last = performance.now();
  requestAnimationFrame(frame);
});
