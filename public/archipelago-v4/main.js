// Five Beacons - entry point: builds the world, runs title / play / pause,
// time of day, tide, interactions, hints, lights, saving and the finale.
import * as THREE from './three.module.min.js';
import { TIDES, ISL, START, OBS, MONO, SHIP, LIGHT } from './layout.js';
import { buildWorldData, buildTerrainMeshes, buildHeightTexture, heightAt, groundAt, CAUSEWAYS, nearestIsland } from './terrain.js';
import { toon, shared } from './materials.js';
import { createSky, palette, makePalette } from './sky.js';
import { createWater } from './water.js';
import { buildFoliage } from './foliage.js';
import { buildCausewayMeshes } from './causeways.js';
import { createBeacon } from './beacons.js';
import { buildObservatory } from './observatory.js';
import { buildMonoliths } from './monoliths.js';
import { buildShipwreck } from './shipwreck.js';
import { buildVillage } from './village.js';
import { buildLighthouse } from './lighthouse.js';
import { buildFinale } from './finale.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { fireShared } from './fire.js';
import { makeBeam } from './beam.js';
import { clamp, damp, lerp, smoothstep, polyDist } from './util.js';

const SAVE_KEY = 'archipelago-v4-save';
const DAY_SECONDS = 20 * 60;

const canvas = document.getElementById('c');
const elTitle = document.getElementById('title');
const elPause = document.getElementById('pause');
const elPrompt = document.getElementById('prompt');
const elStats = document.getElementById('stats');
const elRestart = document.getElementById('restart');
const elHoldRing = document.getElementById('holdring');
const elRestartDev = document.getElementById('restartdev');
const elFade = document.getElementById('fade');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffc890, 0.0022);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2600);
const post = new Post(renderer);
const audio = new Audio();
const input = new Input(canvas);

// ---- lights: one sun/moon, one hemisphere, a fixed pool of 4 point lights ----
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 46;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 420 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xaaccff, 0x806040, 0.9);
scene.add(hemi);
const plights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffa050, 0, 50, 1.6); scene.add(l); return l; });

// ---- world ----
const t0 = performance.now();
const worldData = buildWorldData();
const terrainMat = toon(0xffffff, { vertexColors: true });
for (const m of buildTerrainMeshes(terrainMat)) scene.add(m);
const hm = buildHeightTexture();
const water = createWater(hm);
scene.add(water.mesh);
const sky = createSky();
scene.add(sky.mesh);
const foliage = buildFoliage(scene, worldData.corridors);
buildCausewayMeshes(scene);

const state = {
  mode: 'loading', elapsed: 0, lit: [false, false, false, false, false],
  tide: TIDES[0], tideTarget: TIDES[0], finale: false,
};
const litCount = () => state.lit.filter(Boolean).length;
const pal = makePalette();

const player = new Player(scene, audio);
const ctx = {
  scene, audio, player,
  save: () => save(),
  onReady: (k) => { audio.chime(); save(); },
  night: () => pal.night,
  litCount,
  beaconXZ: null,
};
const obs = buildObservatory(ctx);
const mono = buildMonoliths(ctx);
const ship = buildShipwreck(ctx);
const village = buildVillage(ctx);
ctx.beaconXZ = [OBS.brazier, MONO.brazier, SHIP.beacon, village.beaconXZ, { x: LIGHT.x, z: LIGHT.z }];
const light = buildLighthouse(ctx);
const landmarks = [obs, mono, ship, village, light];

const beacons = [];
for (let k = 0; k < 4; k++) {
  const p = ctx.beaconXZ[k];
  const y = k === 3 ? village.deck : groundAt(p.x, p.z, 999).h;
  beacons.push(createBeacon(scene, p.x, y, p.z));
}
beacons.push(createBeacon(scene, LIGHT.x, light.yG, LIGHT.z, { noBase: true, top: 1.0, scale: 1.15 }));

const finale = buildFinale(scene);

// interactables
const interactables = [];
for (const l of landmarks) interactables.push(...l.interactables);
beacons.forEach((b, k) => {
  interactables.push({
    pos: b.flamePos.clone().add(new THREE.Vector3(0, -0.8, 0)), r: k === 4 ? 3.9 : 2.9, lantern: true,
    enabled: () => b.ready && !b.lit,
    press: () => player.raiseLantern(() => lightBeacon(k)),
  });
});

// hint shimmer (no words, never an answer: only the next place to go)
const shimmer = makeBeam(0xbff4ff, 0.6, 1.2, 2.2);
scene.add(shimmer.group);
const sparkGeo = new THREE.BufferGeometry();
{
  const n = 60, a = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) a[i] = Math.random();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  sparkGeo.setAttribute('aRand', new THREE.BufferAttribute(a, 4));
  sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 6);
}
const sparkMat = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.uTime, uAmt: { value: 0 }, uPix: fireShared.uPix },
  vertexShader: `uniform float uTime; uniform float uPix; attribute vec4 aRand; varying float vA;
    void main(){ float l = fract(uTime * (0.18 + aRand.x * 0.2) + aRand.w);
      float ang = aRand.y * 6.283 + uTime * 0.6; float r = 0.4 + aRand.z * 1.6;
      vec3 p = vec3(cos(ang) * r, l * 7.0, sin(ang) * r);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      vA = sin(l * 3.14159); gl_PointSize = 0.18 * uPix / max(-mv.z, 0.5); }`,
  fragmentShader: `uniform float uAmt; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
      if (d > 0.5) discard; float s = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * 2.5 * s * vA * uAmt, 1.0); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
sparks.frustumCulled = false;
scene.add(sparks);
let hintAmt = 0;
const hintPos = new THREE.Vector3();

function hintTarget() {
  const n = litCount();
  if (n >= 5) return null;
  const pi = nearestIsland(player.x, player.z);
  if (pi !== n && pi < n) {
    // walk to the causeway that leads onward from here
    const cw = CAUSEWAYS[pi];
    const p = cw.startPt;
    return new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z);
  }
  if (!beacons[n].ready) return landmarks[n].hintTarget();
  return beacons[n].pos.clone();
}

// ---- lighting a beacon ----
const cwSurfaced = CAUSEWAYS.map(() => false);
function lightBeacon(k) {
  const b = beacons[k];
  if (b.lit) return;
  b.ignite();
  state.lit[k] = true;
  audio.ignite(b.flamePos, 1);
  input.vibrate(1, 900);
  state.tideTarget = TIDES[litCount()];
  if (k === 4) startFinale(false);
  save();
}
function startFinale(instant) {
  state.finale = true;
  finale.start(beacons.map((b) => b.flamePos), village.dockSlots(), village.centre, instant);
  if (!instant) setTimeout(() => audio.finale(), 1500);
}

// ---- save / load ----
function save() {
  if (state.mode === 'loading') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, lit: state.lit, elapsed: state.elapsed,
      p: { x: player.x, y: player.y, z: player.z, f: player.facing, cy: player.cam.yaw },
      lm: landmarks.map((l) => l.getState()),
    }));
  } catch (e) { /* storage blocked */ }
}
function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
const saved = loadSave();
// start on dry sand just below the foot of the trail
let startZ = 70;
while (startZ > 40 && heightAt(START.x, startZ) < TIDES[0] + 1.0) startZ -= 0.5;
player.place(START.x, startZ - 1.5, START.yaw);
if (saved) {
  state.elapsed = saved.elapsed || 0;
  (saved.lm || []).forEach((s, i) => landmarks[i].setState(s));
  (saved.lit || []).forEach((v, i) => { if (v) { state.lit[i] = true; beacons[i].ignite(true); } });
  state.tide = state.tideTarget = TIDES[litCount()];
  if (saved.p) {
    player.place(saved.p.x, saved.p.z, saved.p.f || 0);
    const g = groundAt(saved.p.x, saved.p.z, (saved.p.y ?? 0) + 0.3);
    player.y = player.visY = g.h;
    if (saved.p.cy !== undefined) player.cam.yaw = player.cam.sy = saved.p.cy;
  }
  if (state.lit[4]) startFinale(true);
}
CAUSEWAYS.forEach((c, i) => { cwSurfaced[i] = state.tide < c.top - 0.05; });
if (saved) elRestart.classList.add('show');

// ---- resize ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const v = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(v.x, v.y);
  fireShared.uPix.value = v.y * 0.866;
}
addEventListener('resize', resize);
resize();

// ---- time of day ----
const lightDir = new THREE.Vector3(), moonDir = new THREE.Vector3(0.6, 0.45, 0.65).normalize(), sunClamp = new THREE.Vector3();
const moonCol = new THREE.Color(0.5, 0.62, 1.0), tmpC = new THREE.Color();
function applyTime(t) {
  palette(t, pal);
  const sw = pal.sunI, mw = pal.moon * 0.42;
  sunClamp.copy(pal.sunDir); sunClamp.y = Math.max(sunClamp.y, 0.12); sunClamp.normalize();
  lightDir.copy(sunClamp).multiplyScalar(sw + 1e-4).addScaledVector(moonDir, mw).normalize();
  tmpC.copy(pal.sun).multiplyScalar(sw).add(moonCol.clone().multiplyScalar(mw)).multiplyScalar(1 / (sw + mw + 1e-4));
  sun.color.copy(tmpC); sun.intensity = sw + mw;
  hemi.color.copy(pal.hemiS); hemi.groundColor.copy(pal.hemiG); hemi.intensity = pal.hemiI;
  scene.fog.color.copy(pal.fogc); scene.fog.density = pal.fog;
  const su = sky.mesh.material.uniforms;
  su.uZenith.value.copy(pal.zen); su.uHorizon.value.copy(pal.hor); su.uSunDir.value.copy(pal.sunDir); su.uSunColor.value.copy(pal.sun);
  su.uSunDisc.value = smoothstep(-0.06, 0.02, pal.sunDir.y); su.uStars.value = pal.stars; su.uStarBright.value = pal.starBright;
  su.uMoon.value = pal.moon; su.uCloudLit.value.copy(pal.cl); su.uCloudShade.value.copy(pal.cs); su.uMoonDir.value.copy(moonDir);
  const wu = water.u;
  wu.uDeep.value.copy(pal.deep); wu.uShallow.value.copy(pal.shal); wu.uSunDir.value.copy(lightDir); wu.uSunColor.value.copy(tmpC);
  wu.uSunI.value = Math.min(1.2, sw * 0.6 + mw * 0.8); wu.uHorizon.value.copy(pal.hor);
  wu.uFoam.value.setRGB(0.95, 0.95, 0.92).lerp(new THREE.Color(0.25, 0.32, 0.45), pal.night);
  post.bright.uniforms.uThreshold.value = 1.15 - pal.night * 0.35;
  post.comp.uniforms.uStrength.value = 0.35 + pal.night * 0.85;
  post.comp.uniforms.uVig.value = 0.25 + pal.night * 0.35;
  renderer.toneMappingExposure = 1.05 + pal.night * 0.35;
  shared.uWind.value = 1 + pal.night * 0.3;
}

function placeSun(cx, cz) {
  const snap = (SH * 2) / 2048;
  const tx = Math.round(cx / snap) * snap, tz = Math.round(cz / snap) * snap;
  sun.target.position.set(tx, heightAt(tx, tz), tz);
  sun.position.copy(sun.target.position).addScaledVector(lightDir, 200);
  sun.target.updateMatrixWorld();
}

// ---- point light pool: lantern + nearest lit beacons ----
const tmpV = new THREE.Vector3();
let activeLights = 0;
function assignLights() {
  const night = pal.night;
  player.lantern.getWorldPosition(tmpV);
  tmpV.y -= 0.15;
  const L0 = plights[0];
  L0.position.copy(tmpV);
  L0.color.setRGB(1.0, 0.68, 0.36);
  L0.intensity = state.mode === 'play' ? 0.6 + night * 16 + (player.raiseT >= 0 ? 6 : 0) : 0;
  L0.distance = 18;
  const lit = beacons.filter((b) => b.lit).map((b) => ({ b, d: b.flamePos.distanceToSquared(tmpV) })).sort((a, c) => a.d - c.d);
  for (let i = 1; i < 4; i++) {
    const L = plights[i], e = lit[i - 1];
    if (e) {
      L.position.copy(e.b.flamePos);
      L.color.setRGB(1.0, 0.6, 0.28);
      L.intensity = (6 + night * 70) * Math.min(1, e.b.litT) * (0.92 + 0.08 * Math.sin(shared.uTime.value * 13 + i));
      L.distance = 60;
    } else L.intensity = 0;
  }
  activeLights = plights.filter((l) => l.intensity > 0).length;
  // water reflections of the same lights
  const wu = water.u;
  for (let i = 0; i < 4; i++) {
    wu.uLightPos.value[i].copy(plights[i].position);
    const k = plights[i].intensity > 0 ? Math.min(1, plights[i].intensity / (i === 0 ? 16 : 70)) : 0;
    wu.uLightCol.value[i].setRGB(1.0, 0.62, 0.3).multiplyScalar(k * (i === 0 ? 0.6 : 1.6));
  }
}

// ---- stats readout (camera pass only) ----
const stats = { show: false, tris: 0, calls: 0, fps: 60, acc: 0, frames: 0 };
function countMesh(r, s, cam, geom, mat, group) {
  if (!stats.show) return;
  const g = geom;
  let n = g.index ? g.index.count : g.attributes.position.count;
  if (group && group.count !== undefined && group.count < Infinity) n = Math.min(n, group.count);
  n = n / 3;
  if (g.drawRange && g.drawRange.count !== Infinity) n = Math.min(n, g.drawRange.count / 3);
  const inst = this.isInstancedMesh ? this.count : 1;
  stats.tris += n * inst;
  stats.calls++;
}
scene.traverse((o) => { if (o.isMesh) o.onBeforeRender = countMesh; if (o.isPoints) o.onBeforeRender = () => { if (stats.show) stats.calls++; }; });

// ---- warm-up: compile every shader while the title is up ----
async function warmup() {
  const hidden = [];
  foliage.update(0, 0, true);
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  plights.forEach((l) => { l.intensity = 1; });
  applyTime(state.elapsed / DAY_SECONDS);
  camera.position.set(60, 140, 160); camera.lookAt(80, 0, -60);
  renderer.setRenderTarget(post.scene);
  try {
    await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 6000))]);
  } catch (e) { try { renderer.compile(scene, camera); } catch (e2) { /* rendering below still compiles */ } }
  renderer.setRenderTarget(null);
  // a frame with a world-sized shadow frustum compiles every shadow-caster variant
  const sc = sun.shadow.camera;
  Object.assign(sc, { left: -340, right: 340, top: 340, bottom: -340, far: 900 }); sc.updateProjectionMatrix();
  sun.target.position.set(90, 0, -70); sun.position.set(90, 400, -70).addScaledVector(lightDir, 50); sun.target.updateMatrixWorld();
  post.render(scene, camera);
  for (const [x, z] of [[0, 0], [130, 60], [200, -70], [95, -175], [-30, -150]]) {
    camera.position.set(x + 30, heightAt(x, z) + 25, z + 40); camera.lookAt(x, heightAt(x, z), z);
    post.render(scene, camera);
  }
  Object.assign(sc, { left: -SH, right: SH, top: SH, bottom: -SH, far: 420 }); sc.updateProjectionMatrix();
  hidden.forEach((o) => { o.visible = false; });
  plights.forEach((l) => { l.intensity = 0; });
  // let landmarks restore their own visibility next frame
  for (const b of beacons) b.update(0, pal.night);
}

// ---- modes ----
let holdT = 0, holdSrc = null;
function startGame() {
  if (state.mode !== 'title') return;
  audio.unlock();
  state.mode = 'play';
  elTitle.classList.add('hide');
  if (input.device === 'kb') input.requestLock();
  save();
}
function pauseGame() { if (state.mode !== 'play') return; state.mode = 'paused'; elPause.classList.remove('hide'); save(); }
function resumeGame() { if (state.mode !== 'paused') return; audio.unlock(); state.mode = 'play'; elPause.classList.add('hide'); if (input.device === 'kb') input.requestLock(); }

// any click or key unlocks audio (browsers require a gesture)
addEventListener('pointerdown', () => audio.unlock(), true);
addEventListener('keydown', () => audio.unlock(), true);

elTitle.addEventListener('click', (e) => { if (state.mode === 'title' && !elRestart.contains(e.target)) startGame(); });
elPause.addEventListener('click', () => resumeGame());
canvas.addEventListener('click', () => { if (state.mode === 'play' && !input.locked && input.device === 'kb') input.requestLock(); });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state.mode === 'play' && input.device === 'kb') pauseGame();
});
elRestart.addEventListener('pointerdown', (e) => { e.stopPropagation(); holdSrc = 'mouse'; });
addEventListener('pointerup', () => { if (holdSrc === 'mouse') holdSrc = null; });
addEventListener('keydown', (e) => {
  if (state.mode === 'title' && !e.repeat) {
    if (e.code === 'KeyR' && elRestart.classList.contains('show')) { holdSrc = 'key'; return; }
    if (['F3', 'Backquote', 'Escape', 'Tab'].includes(e.code)) return;
    startGame();
  } else if (state.mode === 'paused' && !e.repeat && e.code !== 'Escape') resumeGame();
});
addEventListener('keyup', (e) => { if (e.code === 'KeyR' && holdSrc === 'key') holdSrc = null; });

function restartAll() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  elFade.classList.remove('off');
  setTimeout(() => location.reload(), 700);
}

// ---- prompt glyph ----
let promptTarget = null;
const projV = new THREE.Vector3();
function updatePrompt() {
  elPrompt.className = (promptTarget ? 'show ' : '') + (input.device === 'pad' ? 'pad' : 'kb');
  if (!promptTarget) return;
  projV.copy(promptTarget.pos); projV.y += 0.9;
  projV.project(camera);
  if (projV.z > 1) { elPrompt.className = input.device === 'pad' ? 'pad' : 'kb'; return; }
  const x = (projV.x * 0.5 + 0.5) * innerWidth, y = (-projV.y * 0.5 + 0.5) * innerHeight;
  elPrompt.style.transform = `translate(${(clamp(x, 40, innerWidth - 40) - 27).toFixed(1)}px, ${(clamp(y, 40, innerHeight - 40) - 27).toFixed(1)}px)`;
}

// ---- main loop ----
let last = performance.now(), saveT = 0, washT = 4;
const chest = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.poll(dt);
  shared.uTime.value += dt;
  const time = shared.uTime.value;
  if (input.pressed('F3') || input.pressed('Backquote')) { stats.show = !stats.show; elStats.classList.toggle('show', stats.show); }

  if (state.mode === 'title') {
    elRestartDev.setAttribute('href', input.device === 'pad' ? '#g-pad-y' : '#g-key-r');
    if (input.padPressed(0)) startGame();
    const padHold = input.padDown(3) && elRestart.classList.contains('show');
    const holding = padHold || holdSrc;
    holdT = holding ? holdT + dt : Math.max(0, holdT - dt * 3);
    elHoldRing.setAttribute('stroke-dasharray', `${(holdT / 1.6) * 176} 200`);
    if (holdT >= 1.6 && state.mode === 'title') { state.mode = 'restarting'; restartAll(); }
    // slow cinematic orbit
    const a = time * 0.03;
    const cx = player.x, cz = player.z;
    const ox = cx + Math.cos(a) * 70, oz = cz + Math.sin(a) * 70;
    camera.position.set(ox, Math.max(player.y + 34, heightAt(ox, oz) + 10), oz);
    camera.lookAt(cx, player.y + 6, cz);
    player.animate(dt, 0);
  } else if (state.mode === 'paused') {
    if (input.padPressed(0) || input.padPressed(9)) resumeGame();
    player.applyCamera(camera);
  } else if (state.mode === 'play') {
    if (input.padPressed(9)) { pauseGame(); }
    state.elapsed += dt;
    player.water = state.tide;
    player.update(dt, input, false);
    player.applyCamera(camera);
    // interaction
    chest.set(player.x, player.y + 1.0, player.z);
    let best = null, bd = 1e9;
    if (player.raiseT < 0) for (const it of interactables) {
      if (!it.enabled()) continue;
      const d = chest.distanceTo(it.pos);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    promptTarget = best;
    if (best && input.interact()) {
      player.faceTo(best.pos.x, best.pos.z);
      best.press();
      if (!best.lantern) player.reach();
    }
    // tide
    if (Math.abs(state.tide - state.tideTarget) > 0.001) {
      state.tide += clamp(state.tideTarget - state.tide, -0.16 * dt, 0.16 * dt);
    }
    CAUSEWAYS.forEach((c, i) => {
      if (!cwSurfaced[i] && state.tide < c.top - 0.05) {
        cwSurfaced[i] = true;
        audio.wash(new THREE.Vector3(c.mid.x, c.top, c.mid.z), 1.2);
        audio.wash(new THREE.Vector3(c.startPt.x, c.top, c.startPt.z), 0.8);
      }
    });
    // gentle washes near surfaced causeways that sit close to the water
    washT -= dt;
    if (washT < 0) {
      washT = 5 + Math.random() * 6;
      for (const c of CAUSEWAYS) {
        if (c.top - state.tide > 1.4 || state.tide > c.top) continue;
        const r = polyDist(player.x, player.z, c.pts);
        if (r.d < 30) { const p = c.pts[r.i]; audio.wash(new THREE.Vector3(p.x, c.top, p.z), 0.35); break; }
      }
    }
    saveT += dt;
    if (saveT > 4) { saveT = 0; save(); }
  }

  // world updates (all modes so the title shows a living world)
  const dayT = Math.min(1, state.elapsed / DAY_SECONDS);
  applyTime(dayT);
  const night = pal.night;
  if (state.mode !== 'paused') {
    const pdt = state.mode === 'play' ? dt : dt;
    landmarks.forEach((l, k) => l.update(pdt, player, beacons[k], player.cam.sy, time, night, beacons));
    beacons.forEach((b) => b.update(pdt, night));
    finale.update(pdt, state.tide, night, time);
  }
  water.mesh.position.y = state.tide;
  water.u.uTide.value = state.tide;
  sky.mesh.position.copy(camera.position);
  sky.mesh.material.uniforms.uTime.value = time;
  foliage.update(player.x, player.z, false);
  shared.uFadeA.value.copy(camera.position);
  shared.uFadeB.value.set(player.x, player.visY + 1.2, player.z);
  placeSun(player.x, player.z);
  assignLights();

  // hint shimmer after standing still for a while
  const target = state.mode === 'play' && input.activity > 24 && player.raiseT < 0 ? hintTarget() : null;
  if (target) hintPos.copy(target);
  hintAmt = damp(hintAmt, target ? 1 : 0, target ? 0.8 : 4, dt);
  shimmer.setEnds(hintPos, tmpV.copy(hintPos).setY(hintPos.y + 7));
  shimmer.setProgress(hintAmt > 0.01 ? 1 : 0);
  shimmer.setStrength(hintAmt * (0.25 + 0.15 * Math.sin(time * 2.5)));
  sparks.position.copy(hintPos);
  sparks.visible = hintAmt > 0.01;
  sparkMat.uniforms.uAmt.value = hintAmt;

  // audio
  let fireD = 999;
  for (const b of beacons) if (b.lit) fireD = Math.min(fireD, b.flamePos.distanceTo(chest.set(player.x, player.y + 1, player.z)));
  if (ship.isLampLit()) fireD = Math.min(fireD, ship.lampPos.distanceTo(chest) + 6);
  const shore = clamp(1 - (heightAt(player.x, player.z) - state.tide - 1) / 12, 0.15, 1);
  audio.update(dt, { cx: camera.position.x, cy: camera.position.y, cz: camera.position.z, yaw: player.cam.sy, py: player.y, night, fireDist: fireD, shore });

  if (state.mode === 'play') updatePrompt(); else elPrompt.className = '';

  // render
  stats.tris = 0; stats.calls = 0;
  post.render(scene, camera);
  if (stats.show) {
    stats.frames++; stats.acc += dt;
    if (stats.acc > 0.5) {
      stats.fps = stats.frames / stats.acc; stats.frames = 0; stats.acc = 0;
      elStats.textContent = `fps    ${stats.fps.toFixed(0)}\ntris   ${(stats.tris / 1000).toFixed(1)}k\ncalls  ${stats.calls}\nlights ${activeLights}/4 point`;
    }
  }
  input.endFrame();
}

// boot: build is done, compile shaders behind the title, then reveal it
state.mode = 'loading';
applyTime(state.elapsed / DAY_SECONDS);
resize();
requestAnimationFrame(() => {
  warmup().then(() => {
    state.mode = 'title';
    elTitle.classList.remove('loading');
    elFade.classList.add('off');
    last = performance.now();
    requestAnimationFrame(frame);
    console.log(`world built in ${(performance.now() - t0).toFixed(0)} ms, trees ${foliage.treeCount}`);
  });
});
