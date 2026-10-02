// Five Lights: boot, game state, the frame loop.
import * as THREE from './three.module.min.js';
import { U } from './materials.js';
import { TIDE, VILLAGE } from './layout.js';
import { groundAt, terrainAt } from './terrain.js';
import { buildWorld } from './world.js';
import { Sky, DAY_LENGTH } from './sky.js';
import { Water } from './water.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { Puffs } from './fire.js';
import { Finale, Shimmer } from './finale.js';
import { UI } from './ui.js';
import { clamp, lerp, easeInOut } from './util.js';

const SAVE_KEY = 'five-lights-save-v1';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const ui = new UI();
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.25, 3200);
const post = new Post(renderer);
const input = new Input(canvas);
const audio = new Audio();
const puffs = new Puffs(scene);

await nextFrame();
await nextFrame();

// ---------------------------------------------------------------- state
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.v === 1 ? s : null; } catch (e) { return null; }
}
const saved = loadSave();
const state = {
  mode: 'title',
  elapsed: saved ? saved.elapsed : 0,
  lit: saved ? saved.lit.slice() : [false, false, false, false, false],
  solved: saved ? saved.solved.slice() : [false, false, false, false, false],
  teach: saved ? saved.teach.slice() : [false, false, false, false, false],
  finaleDone: saved ? !!saved.finaleDone : false,
  tide: TIDE[0],
  restoring: true,
};
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, elapsed: state.elapsed, lit: state.lit, solved: state.solved, teach: state.teach, finaleDone: state.finaleDone,
      player: [player.pos.x, player.pos.y, player.pos.z, player.yaw],
    }));
  } catch (e) { /* storage unavailable: progress simply is not kept */ }
}

let lastInteract = -1e9;
const fireLoops = [];
const world = buildWorld(scene, audio, puffs, {
  onTeach(i, instant) { state.teach[i] = true; if (!instant) writeSave(); },
  onSolved(i, instant) {
    state.solved[i] = true;
    if (i < 4) world.beacons[i].setReady();
    else lightBeacon(4, instant);
    if (!instant) writeSave();
  },
  lightBeacon: (i) => lightBeacon(i, false),
});
const { beacons, puzzles } = world;

const sky = new Sky(scene);
const water = new Water(scene, world.heightTex);
const player = new Player(scene);
const follow = new FollowCam(camera);
const finale = new Finale(scene, beacons, world.toonMat);
const shimmer = new Shimmer(scene, U);
player.onStep = (surf, v) => audio.step(surf, v);

const plights = [];
for (let i = 0; i < 5; i++) {
  const l = new THREE.PointLight(i === 4 ? 0xffc27a : 0xff9a48, 0, i === 4 ? 18 : 70, 2);
  l.castShadow = false;
  scene.add(l);
  plights.push(l);
}

function lightBeacon(i, instant) {
  if (state.lit[i]) return;
  state.lit[i] = true;
  const b = beacons[i];
  b.light(instant);
  fireLoops.push(audio.fire([b.firePos.x, b.firePos.y, b.firePos.z], i === 4 ? 0.8 : 0.6));
  if (i === 4) puzzles[4].setLamp(true);
  if (!instant) {
    audio.beacon([b.firePos.x, b.firePos.y, b.firePos.z]);
    puffs.burst(b.firePos.x, b.firePos.y + 1, b.firePos.z, 12, 1.2);
    rumble();
    if (i === 4) startFinale();
    writeSave();
  }
}
function rumble() {
  const pad = input.pad;
  if (!pad) return;
  try {
    if (pad.vibrationActuator && pad.vibrationActuator.playEffect) {
      const p = pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: 750, weakMagnitude: 0.6, strongMagnitude: 1.0 });
      if (p && p.catch) p.catch(() => {});
    } else if (pad.hapticActuators && pad.hapticActuators[0]) pad.hapticActuators[0].pulse(1, 750);
  } catch (e) { /* no rumble on this pad */ }
}

// ---------------------------------------------------------------- restore
for (let i = 0; i < 5; i++) if (state.teach[i]) puzzles[i].solveTeach(true);
for (let i = 0; i < 5; i++) if (state.solved[i]) puzzles[i].solveMain(true);
for (let i = 0; i < 4; i++) if (state.lit[i]) { state.lit[i] = false; lightBeacon(i, true); }
if (state.lit[4] && !state.solved[4]) { state.lit[4] = false; lightBeacon(4, true); }
if (state.lit[4]) state.finaleDone = true;
const litCount = () => state.lit.filter(Boolean).length;
state.tide = TIDE[litCount()];
U.uWater.value = state.tide;
for (const c of world.cwInfo) c.washed = state.tide < c.top + 0.15;
if (state.finaleDone) finale.finish(state.tide);
state.restoring = false;
{
  const sp = saved && saved.player;
  if (sp && groundAt(sp[0], sp[2], sp[1] + 0.5).h > state.tide - 0.3) player.place(sp[0], groundAt(sp[0], sp[2], sp[1] + 0.5).h, sp[2], sp[3]);
  else player.place(VILLAGE.spawn[0], terrainAt(VILLAGE.spawn[0], VILLAGE.spawn[1]), VILLAGE.spawn[1], Math.PI);
}
follow.snap(player);

// waves along the shores
for (const p of world.waveSpots) audio.waves(p);

// ---------------------------------------------------------------- sizing
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const v = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(v.x, v.y);
  U.uPointScale.value = v.y / (2 * Math.tan(camera.fov * Math.PI / 360));
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- opening view
const TITLE_POS = new THREE.Vector3(36, 23, 182), TITLE_LOOK = new THREE.Vector3(0, 6, 94);
function titlePose(t) {
  const p = TITLE_POS.clone().add(new THREE.Vector3(Math.sin(t * 0.05) * 3, Math.sin(t * 0.07) * 0.8, 0));
  return { pos: p, target: TITLE_LOOK };
}

// ---------------------------------------------------------------- shader warm-up
function warmup() {
  const changed = [];
  scene.traverse((o) => {
    changed.push([o, o.visible, o.frustumCulled]);
    o.visible = true;
    o.frustumCulled = false;
  });
  finale.forceVisible(true);
  for (const l of plights) l.intensity = 1;
  const pose = titlePose(0);
  camera.position.copy(pose.pos); camera.lookAt(pose.target);
  sky.update(clamp(state.elapsed / DAY_LENGTH, 0, 1), player.pos);
  renderer.compile(scene, camera);
  post.render(scene, camera);
  // a second view from above so every shadow caster is drawn once
  camera.position.set(0, 160, 160); camera.lookAt(0, 0, 0);
  post.render(scene, camera);
  for (const [o, v, f] of changed) { o.visible = v; o.frustumCulled = f; }
  finale.forceVisible(false);
  if (state.finaleDone) finale.finish(state.tide);
  for (const b of beacons) b.fire.apply();
  for (const p of puzzles) for (const f of p.fires || []) f.apply();
  shimmer.points.visible = false;
}
warmup();
await nextFrame();
ui.ready(!!saved);

// ---------------------------------------------------------------- title input
let restartHold = 0, restartHeld = false;
const restartEl = document.getElementById('restart');
restartEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); restartHeld = true; audio.unlock(); });
addEventListener('pointerup', () => { restartHeld = false; });
function startGame() {
  if (state.mode !== 'title') return;
  audio.unlock();
  state.mode = 'intro';
  state.introT = 0;
  ui.hideTitle();
  lastInteract = state.elapsed;
}
input.on('gesture', (e) => {
  audio.unlock();
  if (state.mode === 'title') {
    if (e.type === 'keydown' && ['KeyR', 'F3', 'Backquote', 'Escape', 'Tab'].includes(e.code)) return;
    if (e.type === 'mousedown' && restartEl.contains(e.target)) return;
    if (e.type === 'mousedown' || e.type === 'keydown') { input.lock(); startGame(); }
  } else if (e.type === 'mousedown' && !input.locked && state.mode !== 'title') input.lock();
});
let statsOn = false;
addEventListener('keydown', (e) => { if ((e.code === 'F3' || e.code === 'Backquote') && !e.repeat) statsOn = !statsOn; });

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let fpsAvg = 60, gullTimer = 6, idle = 0, finaleT = 0, camPose = null, cine = null;
const tmpV = new THREE.Vector3();

function nearestBeaconLights() {
  const list = [];
  for (const b of beacons) if (b.state === 'lit') list.push([b, b.lightPos.distanceToSquared(player.pos)]);
  list.sort((a, b) => a[1] - b[1]);
  return list.slice(0, 4).map((x) => x[0]);
}

function nextTarget() {
  const k = state.lit.indexOf(false);
  if (k < 0) return null;
  if (k < 4 && state.solved[k]) return [beacons[k].lightPos.x, beacons[k].lightPos.y, beacons[k].lightPos.z];
  return state.teach[k] ? puzzles[k].mainPos : puzzles[k].teachPos;
}

function startFinale() {
  state.mode = 'finale';
  finaleT = 0;
  finale.start();
  cine = { from: camera.position.clone(), fromLook: follow.pivot.clone() };
}

const raycastV = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (document.hidden) dt = 0;
  fpsAvg = lerp(fpsAvg, dt > 0 ? 1 / dt : fpsAvg, 0.05);
  input.poll();
  ui.setDevice(input.device);
  U.uTime.value += dt;
  const t = U.uTime.value;
  let pose;

  if (state.mode === 'title') {
    if (input.padAEdge) startGame();
    const holding = restartHeld || input.padY || input.keys.has('KeyR');
    if (holding && saved) {
      restartHold += dt / 1.6;
      if (restartHold >= 1) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } location.reload(); }
    } else restartHold = Math.max(0, restartHold - dt * 3);
    ui.restartProgress(clamp(restartHold, 0, 1));
    pose = titlePose(t);
  }

  const playing = state.mode === 'play' || state.mode === 'intro';
  if (playing || state.mode === 'finale') state.elapsed += dt;

  // movement
  let mx = 0, mz = 0;
  if (state.mode === 'play') {
    const lk = input.look(dt);
    follow.look(lk.dx, lk.dy);
    const mv = input.move();
    const fx = -Math.sin(follow.yaw), fz = -Math.cos(follow.yaw);
    const rx = Math.cos(follow.yaw), rz = -Math.sin(follow.yaw);
    mx = fx * mv.y + rx * mv.x; mz = fz * mv.y + rz * mv.x;
    if (Math.hypot(mv.x, mv.y) > 0.1) idle = 0; else idle += dt;
  } else input.look(dt);
  player.update(dt, mx, mz, state.tide, t);

  // tide
  const tideTarget = TIDE[litCount()];
  if (state.tide > tideTarget) state.tide = Math.max(tideTarget, state.tide - dt * 0.09);
  U.uWater.value = state.tide;
  for (const c of world.cwInfo) if (!c.washed && state.tide < c.top + 0.15) {
    c.washed = true;
    audio.wash(c.mid);
    audio.wash([c.ends[0][0], c.top, c.ends[0][1]]);
    audio.wash([c.ends[1][0], c.top, c.ends[1][1]]);
  }

  // interaction
  let best = null;
  if (state.mode === 'play' && !player.raising) {
    let bd = 1e9;
    const fx = player.pos.x + Math.sin(player.yaw) * 0.9, fz = player.pos.z + Math.cos(player.yaw) * 0.9;
    for (const it of world.interactables) {
      const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
      if (d > it.r || Math.abs(it.y - (player.pos.y + 1)) > 2.6) continue;
      if (!it.enabled()) continue;
      const s = Math.hypot(it.x - fx, it.z - fz);
      if (s < bd) { bd = s; best = it; }
    }
    if (best && input.interact()) {
      lastInteract = state.elapsed; idle = 0;
      const it = best;
      if (it.raise) player.raise(() => { if (it.enabled()) it.press(); });
      else it.press();
      audio.unlock();
    }
  }

  // world updates
  for (const p of puzzles) p.update(dt, t, player.pos);
  for (const b of beacons) b.update(dt);
  finale.update(dt, state.tide, t);
  puffs.update(dt);
  world.updateGulls(t);
  gullTimer -= dt;
  if (gullTimer <= 0) {
    gullTimer = 5 + Math.random() * 9;
    let g = null, gd = 1e9;
    for (const p of world.gullPaths) { const d = p.pos.distanceTo(camera.position); if (d < gd) { gd = d; g = p; } }
    if (g && gd < 90 && U.uNight.value < 0.8) audio.gull([g.pos.x, g.pos.y, g.pos.z]);
  }

  // time of day
  const p = clamp(state.elapsed / DAY_LENGTH, 0, 1);
  const sk = sky.update(p, player.pos);
  post.strength = sk.bloom; post.thresh = sk.thresh; post.night = sk.night;
  renderer.toneMappingExposure = lerp(1.05, 1.25, sk.night);

  // lights: the four nearest lit beacons and the lantern
  const near = nearestBeaconLights();
  const wl = [];
  for (let i = 0; i < 4; i++) {
    const l = plights[i], b = near[i];
    if (b) {
      l.position.copy(b.lightPos);
      const flick = 0.9 + 0.1 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7.3 + i);
      l.intensity = lerp(260, 950, sk.night) * flick * b.fire.level;
      l.distance = lerp(55, 75, sk.night);
      wl.push({ x: b.lightPos.x, y: b.lightPos.y, z: b.lightPos.z, w: b.fire.level * (0.35 + sk.night) });
    } else { l.intensity = 0; wl.push(null); }
  }
  const lan = plights[4];
  lan.position.copy(player.lanternWorld);
  lan.intensity = lerp(4, 26, sk.night) * (0.92 + 0.08 * Math.sin(t * 11));
  wl.push({ x: lan.position.x, y: lan.position.y, z: lan.position.z, w: 0.12 * sk.night });
  water.update(sk, sky.sunDir, wl);
  world.grass.uniforms.uFocus.value.copy(player.pos);

  // hint shimmer
  if (state.mode === 'play') {
    const tgt = nextTarget();
    let atPuzzle = false;
    const k = state.lit.indexOf(false);
    if (k >= 0) for (const pp of [puzzles[k].teachPos, puzzles[k].mainPos]) if (Math.hypot(pp[0] - player.pos.x, pp[2] - player.pos.z) < 14) atPuzzle = true;
    const quiet = state.elapsed - lastInteract > 45;
    if (tgt && idle > 35 && quiet && !atPuzzle && Math.hypot(tgt[0] - player.pos.x, tgt[2] - player.pos.z) > 12) shimmer.show(tgt);
    else if (idle < 0.5 || atPuzzle) shimmer.hide();
  } else shimmer.hide();
  shimmer.update(dt);

  // camera
  if (state.mode === 'intro') {
    state.introT += dt / 3.0;
    const a = titlePose(t), b = follow.update(dt, player, state.tide);
    const u = easeInOut(clamp(state.introT, 0, 1));
    pose = { pos: a.pos.clone().lerp(b.pos, u), target: a.target.clone().lerp(b.target, u) };
    if (state.introT >= 1) state.mode = 'play';
  } else if (state.mode === 'play') {
    pose = follow.update(dt, player, state.tide);
  } else if (state.mode === 'finale') {
    finaleT += dt;
    const ft = finaleT;
    const a = 0.75 + ft * 0.035;
    const high = { pos: new THREE.Vector3(Math.cos(a) * 205, 112, Math.sin(a) * 205), target: new THREE.Vector3(0, 48, 0) };
    const dock = { pos: new THREE.Vector3(48, 30, 222), target: new THREE.Vector3(0, 4, 132) };
    if (ft < 9) {
      const u = easeInOut(clamp(ft / 3.5, 0, 1));
      pose = { pos: cine.from.clone().lerp(high.pos, u), target: cine.fromLook.clone().lerp(high.target, u) };
    } else {
      const u = easeInOut(clamp((ft - 9) / 3.5, 0, 1));
      pose = { pos: high.pos.clone().lerp(dock.pos, u), target: high.target.clone().lerp(dock.target, u) };
    }
    if (ft > 23 && !state.fadeOn) { state.fadeOn = true; ui.fade(true); }
    if (ft > 25.5 && !state.closeOn) { state.closeOn = true; ui.closing(true, state.elapsed); }
    if (ft > 33 && state.closeOn) { state.closeOn = false; ui.closing(false); }
    if (ft > 35.5) {
      state.mode = 'play'; state.fadeOn = false; ui.fade(false);
      state.finaleDone = true; finale.settled = true;
      follow.snap(player);
      writeSave();
      pose = follow.update(dt, player, state.tide);
    }
  }
  if (pose) {
    if (state.mode === 'title' || !camPose) camPose = { pos: pose.pos.clone(), target: pose.target.clone() };
    else { camPose.pos.copy(pose.pos); camPose.target.copy(pose.target); }
    camera.position.copy(camPose.pos);
    camera.lookAt(camPose.target);
  }
  sky.mesh.position.copy(camera.position);
  camera.getWorldDirection(raycastV);
  audio.setListener(camera.position, raycastV);

  // prompt glyph
  if (best) {
    tmpV.set(best.x, best.y + 0.6, best.z).project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1;
    ui.prompt((tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight, vis);
  } else ui.prompt(0, 0, false);
  ui.pause(state.mode === 'play' && input.device === 'kbm' && !input.locked);

  // periodic save
  state.saveT = (state.saveT || 0) + dt;
  if (state.saveT > 5 && state.mode === 'play') { state.saveT = 0; writeSave(); }

  renderer.info.reset();
  post.render(scene, camera);
  if (statsOn) {
    const inf = renderer.info.render;
    const pts = plights.filter((l) => l.intensity > 0).length;
    ui.stats(true, `fps    ${fpsAvg.toFixed(0)}\ntris   ${inf.triangles.toLocaleString()}\ncalls  ${inf.calls}\nlights ${pts} point + sun + sky`);
  } else ui.stats(false);
  input.endFrame();
}
requestAnimationFrame(frame);
