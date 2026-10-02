// Five Lights — bootstrap, title, game loop.
import * as THREE from './three.module.min.js';
import { shared, clamp, damp, smoothstep, srgb } from './util.js';
import { TIDES, LAYOUT, CAUSEWAYS, groundAt, buildTerrain, buildHeightTexture, walkInfo, WADE } from './terrain.js';
import { buildWorld } from './world.js';
import { Foliage } from './foliage.js';
import { Water } from './water.js';
import { Sky, DAY_LENGTH } from './sky.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Puzzles } from './puzzles.js';
import { Finale } from './finale.js';
import { Post } from './post.js';

// ------------------------------------------------------------------ glyphs (no words anywhere)
const G = {
  E: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="10" fill="#f6efe2" stroke="#3b3346" stroke-width="3"/><rect x="6" y="48" width="52" height="10" rx="5" fill="#cfc4b2"/><text x="32" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="32" font-weight="700" fill="#2d2636">E</text></svg>`,
  R: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="10" fill="#f6efe2" stroke="#3b3346" stroke-width="3"/><text x="32" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="30" font-weight="700" fill="#2d2636">R</text></svg>`,
  A: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#3fae4a" stroke="#183d1d" stroke-width="3"/><circle cx="32" cy="29" r="22" fill="#55c460" opacity=".55"/><text x="32" y="43" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#fff">A</text></svg>`,
  Y: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#e7b51f" stroke="#5a4206" stroke-width="3"/><text x="32" y="43" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#fff">Y</text></svg>`,
  click: `<svg viewBox="0 0 64 64"><rect x="16" y="8" width="32" height="48" rx="16" fill="#f6efe2" stroke="#3b3346" stroke-width="3"/><path d="M32 8 v18 M16 26 h32" stroke="#3b3346" stroke-width="3"/><path d="M17.5 24.5 V24 a14.5 14.5 0 0 1 13 -14.4 V24.5 z" fill="#ff9a3c"/><circle cx="12" cy="10" r="3" fill="#ffb15e"/><circle cx="6" cy="18" r="2" fill="#ffb15e"/><circle cx="8" cy="4" r="2" fill="#ffb15e"/></svg>`,
  restart: `<svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="33" fill="rgba(20,16,30,.55)" stroke="rgba(255,247,232,.35)" stroke-width="3"/><circle id="rring" cx="37" cy="37" r="33" fill="none" stroke="#ffb15e" stroke-width="4" stroke-dasharray="207.3" stroke-dashoffset="207.3" transform="rotate(-90 37 37)"/><path d="M50 30 a15 15 0 1 0 2 12" fill="none" stroke="#fff7e8" stroke-width="5" stroke-linecap="round"/><path d="M52 18 L52 32 L39 30 z" fill="#fff7e8"/></svg>`,
};

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const titleEl = $('title'), promptEl = $('prompt'), statsEl = $('stats'), fadeEl = $('fade'), lockEl = $('lockhint'), restartEl = $('restart');
$('startRow').innerHTML = G.A + G.click;
lockEl.innerHTML = G.click;
restartEl.innerHTML = G.restart + `<div class="sub" id="rsub"></div>`;

// ------------------------------------------------------------------ renderer + scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;
const post = new Post(renderer);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x888888, 100, 800);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2600);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 60;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
// exactly five point lights, always present (constant shader permutations)
const beaconLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffa04a, 0, 48, 1.5); scene.add(l); return l; });
const lanternLight = new THREE.PointLight(0xffb866, 0, 20, 1.6);
scene.add(lanternLight);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ world
const world = buildWorld(scene);
const foliage = new Foliage(scene, world.exclusions);
const terrain = buildTerrain(scene, foliage.trees);
foliage.build();
const water = new Water(scene, buildHeightTexture());
const sky = new Sky(scene);
const sound = new Sound();
const input = new Input(canvas);
const player = new Player(scene);
const rig = new CameraRig(camera);
let env = sky.update(0);

const camRight = new THREE.Vector3();
function pan(x, z) {
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const dx = x - camera.position.x, dz = z - camera.position.z, l = Math.hypot(dx, dz) || 1;
  return clamp((dx * camRight.x + dz * camRight.z) / l, -1, 1) * 0.8;
}
const state = { mode: 'title', dayT: 0, water: TIDES[0], finaleDone: false, visited: new Set(), blend: 0, saveT: 0, time: 0 };
const puzzles = new Puzzles(scene, world, {
  sound, player, pan,
  water: () => state.water,
  night: () => env.night,
  onBeaconLit: (i) => onBeaconLit(i),
});
const finale = new Finale(scene, puzzles.beacons, {
  arrive: (p) => sound.bell(pan(p.x, p.z), 520 + Math.random() * 300, 0.25),
  done: () => { state.finaleDone = true; $('endmark').classList.add('on'); save(); },
});

// hint shimmer: a column of sparkles over the next place to go
const shimmer = (() => {
  const n = 90, seeds = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) seeds[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const uA = { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uA },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSeed; uniform float uTime; varying float vT;
      void main(){ float life = fract(uTime * (0.12 + aSeed.x * 0.15) + aSeed.y);
        float a = aSeed.z * 6.2831 + uTime * 0.4; float r = 0.6 + aSeed.x * 1.4;
        vec3 p = vec3(cos(a) * r, life * 7.0, sin(a) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vT = sin(life * 3.1416) * (0.5 + 0.5 * sin(uTime * 9.0 + aSeed.y * 40.0));
        gl_PointSize = (2.0 + aSeed.z * 3.0) * (300.0 / max(-mv.z, 1.0)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; varying float vT;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
        gl_FragColor = vec4(vec3(1.4, 1.25, 0.9) * (1.0 - d * 4.0) * vT * uA, 1.0); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, uA, target: null };
})();

// ------------------------------------------------------------------ save / load
const SAVE_KEY = 'five-lights-save-v1';
function save() {
  if (state.mode !== 'play') return;
  try {
    const hl = puzzles.hintList();
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      dayT: state.dayT, pos: [player.pos.x, player.pos.z], yaw: player.yaw, camYaw: rig.yaw,
      puzzles: puzzles.serialize(), finale: puzzles.lit[4], visited: hl.map((p, i) => (state.visited.has(p) ? i : -1)).filter((i) => i >= 0),
    }));
  } catch (e) { /* storage unavailable */ }
}
addEventListener('pagehide', () => save());
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saved = null; }

const V = LAYOUT.village;
const startYaw = Math.atan2(-V.u.x, -V.u.z);
player.place(V.spawn.x, V.spawn.z, Math.atan2(V.u.x, V.u.z));
rig.yaw = startYaw;
if (saved) {
  puzzles.load(saved.puzzles);
  state.dayT = clamp(+saved.dayT || 0, 0, 1);
  state.water = TIDES[puzzles.litCount];
  player.waterLevel = state.water;
  if (Array.isArray(saved.pos)) {
    const w = walkInfo(saved.pos[0], saved.pos[1]);
    if (w.h > state.water - WADE) player.place(saved.pos[0], saved.pos[1], saved.yaw || 0);
  }
  if (typeof saved.camYaw === 'number') rig.yaw = saved.camYaw;
  const hl = puzzles.hintList();
  (saved.visited || []).forEach((i) => hl[i] && state.visited.add(hl[i]));
  if (puzzles.lit[4]) { finale.start(true); state.finaleDone = true; }
  restartEl.classList.add('has');
}
water.set(state.water);
player.waterLevel = state.water;

// title view: frames the village and the first beacon on its pier
{
  const u = V.u, v = V.v;
  rig.titlePos.set(V.c.x - u.x * 30 + v.x * 24, 24, V.c.z - u.z * 30 + v.z * 24);
  rig.titleLook.set(V.c.x + u.x * 40, 5, V.c.z + u.z * 40);
  rig.blend = 0;
  camera.position.copy(rig.titlePos); camera.lookAt(rig.titleLook);
}
rig.snap(player);
rig.blend = 0;

// ------------------------------------------------------------------ shader warm-up while the title is up
let compiled = false, warming = false;
async function precompile() {
  warming = true;
  const vis = [], cull = [];
  scene.traverse((o) => {
    if (!o.visible) { vis.push(o); o.visible = true; }
    if ((o.isMesh || o.isPoints) && o.frustumCulled) { cull.push(o); o.frustumCulled = false; }
  });
  const lightsState = [...beaconLights, lanternLight].map((l) => l.intensity);
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) { renderer.compile(scene, camera); }
  // one real frame through every pass (shadow depth variants included)
  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(post.scene);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  for (const o of vis) o.visible = false;
  for (const o of cull) o.frustumCulled = true;
  [...beaconLights, lanternLight].forEach((l, i) => (l.intensity = lightsState[i]));
  compiled = true;
  warming = false;
  clock.getDelta();
  titleEl.classList.add('ready');
}

// ------------------------------------------------------------------ title input
let restartHold = 0, restartPointer = false;
function startGame() {
  if (state.mode !== 'title' || !compiled) return;
  state.mode = 'play';
  titleEl.classList.add('gone');
  sound.unlock();
  state.blend = 0;
}
titleEl.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (restartEl.contains(e.target) && restartEl.classList.contains('has')) { restartPointer = true; return; }
  input.requestLock();
  startGame();
});
addEventListener('pointerup', () => { restartPointer = false; });
canvas.addEventListener('pointerdown', () => { sound.unlock(); if (state.mode === 'play') input.requestLock(); });
input.onGesture = (kind, e) => {
  sound.unlock();
  if (state.mode === 'title' && kind === 'key' && e.code !== 'KeyR' && !['Backquote', 'F2', 'KeyP'].includes(e.code)) { input.requestLock(); startGame(); }
};

function doRestart() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  state.mode = 'restarting';
  fadeEl.classList.remove('clear');
  setTimeout(() => location.reload(), 900);
}

// ------------------------------------------------------------------ events
function onBeaconLit(i) {
  input.rumble(800, 1.0, 0.7);
  const chords = [[262, 330, 392], [294, 370, 440], [330, 415, 494], [349, 440, 523], [262, 330, 392, 523, 659]];
  sound.swell(0, chords[i], 0.4, 6);
  if (i === 4) {
    finale.start();
    setTimeout(() => sound.swell(0, [196, 247, 294, 392, 494], 0.45, 9), 2500);
    input.rumble(1400, 1, 1);
  }
  save();
}

// ------------------------------------------------------------------ frame
const clock = new THREE.Clock();
let statsOn = false, fpsAvg = 60, lastCross = CAUSEWAYS.map((c) => state.water > c.top + 0.25);
const proj = new THREE.Vector3();
let promptGlyph = '', rsubGlyph = '';
player.onStep = (surf, amt) => sound.step(surf, 0.6 + amt * 0.4);

function updateLights() {
  hemi.color.copy(env.hemiSky); hemi.groundColor.copy(env.hemiGround); hemi.intensity = env.hemiInt;
  sun.color.copy(env.sunColor); sun.intensity = env.sunInt;
  sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  sun.position.copy(sun.target.position).addScaledVector(env.sunDir, 160);
  // the sun drops below the horizon: stop paying for the shadow pass
  renderer.shadowMap.autoUpdate = env.sunInt > 0.02;
  scene.fog.color.copy(env.fogColor); scene.fog.near = env.fogNear; scene.fog.far = env.fogFar;
  // four nearest lit beacons get the point lights
  const lit = puzzles.beacons.filter((b, i) => puzzles.lit[i]).map((b) => ({ b, d: b.lightPos.distanceToSquared(player.pos) })).sort((a, b) => a.d - b.d);
  beaconLights.forEach((l, i) => {
    const e = lit[i];
    if (!e) { l.intensity = 0; return; }
    l.position.copy(e.b.lightPos);
    const flick = 0.85 + 0.15 * Math.sin(state.time * 13 + i * 2) * Math.sin(state.time * 7.3 + i);
    l.intensity = (40 + env.night * 160) * flick * e.b.fire.level.value;
  });
  player.lanternPoint.getWorldPosition(lanternLight.position);
  lanternLight.intensity = (3 + env.night * 22) * (0.9 + 0.1 * Math.sin(state.time * 17));
}

function nearestItem() {
  let best = null, bs = 1e9;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  for (const it of puzzles.items) {
    if (!it.enabled()) continue;
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.pos.y - (player.pos.y + 1)) > 3) continue;
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (facing < -0.35 && d > 1.2) continue;
    const s = d - facing * 0.8;
    if (s < bs) { bs = s; best = it; }
  }
  return best;
}

function frame() {
  requestAnimationFrame(frame);
  if (warming) return; // hold the last title frame while every shader compiles
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  shared.uTime.value = state.time;
  renderer.info.reset();
  input.poll();
  if (input.take('stats')) { statsOn = !statsOn; statsEl.style.display = statsOn ? 'block' : 'none'; }

  if (state.mode === 'title') {
    if (input.edges.has('anypad')) sound.unlock();
    if (input.take('padA')) startGame();
    // hold-to-restart: mouse on the glyph, R on the keyboard, Y on the pad
    const holding = restartEl.classList.contains('has') && (restartPointer || input.keys.has('KeyR') || input.padHeld[3]);
    restartHold = holding ? restartHold + dt : Math.max(0, restartHold - dt * 2);
    const ring = document.getElementById('rring');
    if (ring) ring.setAttribute('stroke-dashoffset', String(207.3 * (1 - clamp(restartHold / 1.6, 0, 1))));
    const sub = input.device === 'pad' ? 'Y' : 'R';
    if (sub !== rsubGlyph) { rsubGlyph = sub; $('rsub').innerHTML = G[sub]; }
    if (restartHold >= 1.6) doRestart();
    camera.position.copy(rig.titlePos);
    camera.position.x += Math.sin(state.time * 0.1) * 2;
    camera.lookAt(rig.titleLook);
  }

  if (state.mode === 'play') {
    state.dayT = Math.min(1, state.dayT + dt / DAY_LENGTH);
    // tide
    const target = TIDES[puzzles.litCount];
    state.water = state.water > target ? Math.max(target, state.water - dt * 0.22) : target;
    water.set(state.water);
    player.waterLevel = state.water;
    // waves wash over causeways as they surface
    let wash = 0;
    CAUSEWAYS.forEach((c, i) => {
      const above = state.water > c.top + 0.25;
      const mx = (c.a.x + c.b.x) / 2, mz = (c.a.z + c.b.z) / 2;
      if (lastCross[i] && !above) { const d = Math.hypot(mx - player.pos.x, mz - player.pos.z); sound.waveWash(pan(mx, mz), clamp(1.2 - d / 180, 0.3, 1)); }
      lastCross[i] = above;
      if (Math.abs(c.top - state.water) < 0.7) {
        const t = clamp(((player.pos.x - c.a.x) * c.dir.x + (player.pos.z - c.a.z) * c.dir.z) / c.len, 0, 1);
        const px = c.a.x + (c.b.x - c.a.x) * t, pz = c.a.z + (c.b.z - c.a.z) * t;
        wash = Math.max(wash, (1 - Math.abs(c.top - state.water) / 0.7) * clamp(1 - Math.hypot(px - player.pos.x, pz - player.pos.z) / 30, 0, 1));
      }
    });
    sound.setWash(wash);
    // apprentice + camera
    if (rig.blend < 1) rig.blend = Math.min(1, rig.blend + dt / 2.5);
    player.update(dt, input, rig.yaw, state.time);
    rig.update(dt, input, player, state.water);
    // interaction
    const it = nearestItem();
    if (it && input.take('interact') && !player.busy) it.act();
    const glyph = input.device === 'pad' ? 'A' : 'E';
    if (it && !player.busy && rig.blend >= 1) {
      if (promptGlyph !== glyph) { promptEl.innerHTML = G[glyph]; promptGlyph = glyph; }
      proj.copy(it.pos); proj.y += 0.9; proj.project(camera);
      if (proj.z < 1) {
        promptEl.style.left = `${((proj.x + 1) / 2) * innerWidth}px`;
        promptEl.style.top = `${((1 - proj.y) / 2) * innerHeight}px`;
        promptEl.classList.add('on');
      } else promptEl.classList.remove('on');
    } else promptEl.classList.remove('on');
    lockEl.classList.toggle('on', input.device === 'kbm' && !input.locked && rig.blend >= 1);
    // places visited (for hints) and the shimmer after standing still a while
    for (const p of puzzles.hintList()) if (!state.visited.has(p) && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 8) state.visited.add(p);
    const ht = player.stillTime > 18 ? puzzles.hintTarget(state.visited) : null;
    if (ht && Math.hypot(ht.x - player.pos.x, ht.z - player.pos.z) > 4) {
      const by = Math.max(walkInfo(ht.x, ht.z).h, state.water);
      shimmer.pts.position.set(ht.x, typeof ht.y === 'number' && ht.y - 1.2 > by ? ht.y - 1.2 : by, ht.z);
      shimmer.uA.value = Math.min(1, shimmer.uA.value + dt * 0.5);
    } else shimmer.uA.value = Math.max(0, shimmer.uA.value - dt * 1.5);
    shimmer.pts.visible = shimmer.uA.value > 0.001;
    // crackle near lit fires
    puzzles.beacons.forEach((b, i) => {
      if (!puzzles.lit[i]) return;
      const d = b.base.distanceTo(player.pos);
      if (d < 20 && Math.random() < dt * 4) sound.crackle(pan(b.base.x, b.base.z), 0.35 * (1 - d / 20));
    });
    state.saveT += dt;
    if (state.saveT > 5) { state.saveT = 0; save(); }
  } else {
    promptEl.classList.remove('on');
    shimmer.pts.visible = false;
  }

  env = sky.update(state.dayT, camera.position);
  updateLights();
  puzzles.update(dt, player.pos);
  player.lanternFire.update(dt, env.night);
  finale.update(dt, state.time, state.water, env.night);
  foliage.update(dt, player.pos, camera.position);
  for (const b of world.moored || []) { b.position.y = state.water + 0.3 + Math.sin(state.time * 1.2 + b.position.x) * 0.06; }
  sound.update(dt, env.night);
  input.endFrame();

  const bloom = 0.25 + env.night * 0.85;
  const thresh = 1.0 + (1 - env.night) * 0.8;
  post.render(scene, camera, bloom, thresh, 1);

  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
  if (statsOn) {
    const inf = renderer.info.render;
    const activeLights = beaconLights.filter((l) => l.intensity > 0).length + (lanternLight.intensity > 0 ? 1 : 0) + (sun.intensity > 0 ? 1 : 0) + 1;
    statsEl.textContent = `${fpsAvg.toFixed(0)} fps\n${(inf.triangles / 1000).toFixed(1)}k tris\n${inf.calls} calls\n${activeLights} lights (${beaconLights.filter((l) => l.intensity > 0).length + (lanternLight.intensity > 0 ? 1 : 0)} point)\nshadow ${renderer.shadowMap.autoUpdate ? 'on' : 'off'}`;
  }
}

// first title frame, then warm up shaders, then reveal
rig.compute(0, true, state.water);
camera.position.copy(rig.titlePos); camera.lookAt(rig.titleLook);
requestAnimationFrame(() => {
  fadeEl.classList.add('clear');
  frame();
  setTimeout(() => precompile(), 60);
});
console.info('Five Lights', { terrainTris: terrain.tris, trees: foliage.trees.length, grass: foliage.grassCount });
