import * as THREE from './three.module.min.js';
import { U } from './materials.js';
import { buildGrid, buildTerrainMeshes, LAYOUT, TIDE, CAUSEWAYS, ISLANDS, groundH, islandOf } from './terrain.js';
import { Sky, DAY_LENGTH } from './sky.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Physics } from './physics.js';
import { Interactions } from './interact.js';
import { buildWater, buildDressing } from './world.js';
import { Beacon } from './beacons.js';
import { buildRing } from './ring.js';
import { buildShip } from './ship.js';
import { buildVillage } from './village.js';
import { buildObservatory } from './observatory.js';
import { buildLighthouse } from './lighthouse.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { buildFinale } from './finale.js';
import { Sparkles } from './fire.js';
import { UI } from './ui.js';
import { segDist, smoothstep } from './noise.js';

const SAVE_KEY = 'archipelago-v3-save';

async function main() {
  await new Promise((r) => setTimeout(r, 30)); // let the title paint first

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false;
  U.uPixelRatio.value = pr;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf0c090, 140, 760);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2600);

  const G = {
    scene, camera, renderer, U,
    fires: [], lightSources: [], timers: [], busy: 0, time: 0,
    tide: { level: TIDE[0], target: TIDE[0] },
    later(t, fn) { G.timers.push({ t, fn }); },
  };
  G.physics = new Physics();
  G.audio = new GameAudio();
  G.input = new Input(canvas);
  G.interact = new Interactions();
  const ui = new UI();

  // ---------------- world ----------------
  buildGrid();
  buildTerrainMeshes(scene);
  const sky = new Sky(scene);
  G.water = buildWater(G);
  G.beacons = [];
  for (let i = 0; i < 4; i++) G.beacons.push(new Beacon(G, i, LAYOUT.beacons[i][0], LAYOUT.beacons[i][1]));
  const ring = buildRing(G);
  const ship = buildShip(G);
  const village = buildVillage(G);
  const obs = buildObservatory(G);
  const lh = buildLighthouse(G);
  G.beacons.push(lh.beacon);
  G.puzzles = [ring, ship, village, obs, lh];
  const dressing = buildDressing(G);
  G.player = new Player(G);
  const rig = new CameraRig(G, camera);
  const finale = buildFinale(G, G.beacons, village.docks, lh.lampPos);
  const sparkles = new Sparkles();
  scene.add(sparkles.points);
  // exactly four point lights, always present (constant light count = no shader recompiles)
  const pool = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffa050, 0, 30, 2); l.castShadow = false; scene.add(l); return l; });
  const post = new Post(renderer);

  const litCount = () => G.beacons.filter((b) => b.lit).length;
  let finaleOn = false;

  G.lightBeacon = (b) => {
    if (G.busy > 0) return;
    G.player.raiseLantern(1.4);
    G.busy = 1.5;
    G.later(0.55, () => {
      b.light();
      G.audio.ignite(b.base || b.firePos, false);
      G.input.rumble(0.85, 700);
      G.later(1.4, () => { G.tide.target = TIDE[litCount()]; });
      saveNow();
    });
  };
  G.startFinale = () => { finaleOn = true; finale.start(false); saveNow(); };

  // ---------------- save / load ----------------
  function saveNow() {
    if (!playing) return;
    try {
      const p = G.player.pos;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 3, time: G.time,
        lit: G.beacons.map((b) => b.lit), unlocked: G.beacons.map((b) => b.unlocked),
        puzzles: G.puzzles.map((q) => q.getState()),
        pos: [p.x, p.y, p.z], yaw: G.player.yaw, camYaw: rig.yaw, finale: finaleOn,
      }));
    } catch (e) { /* storage unavailable */ }
  }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    const st = LAYOUT.start;
    const startYaw = Math.atan2(LAYOUT.ringC[0] - st[0], LAYOUT.ringC[1] - st[1]);
    G.player.place(st[0], st[1], startYaw);
    if (!s || s.v !== 3) return false;
    G.time = s.time || 0;
    (s.puzzles || []).forEach((ps, i) => { try { G.puzzles[i].setState(ps); } catch (e) { /* ignore */ } });
    G.puzzles.forEach((q, i) => { if (q.solved) G.beacons[i].unlock(true); });
    (s.unlocked || []).forEach((u, i) => { if (u) G.beacons[i].unlock(true); });
    (s.lit || []).forEach((l, i) => { if (l) G.beacons[i].light(true); });
    G.tide.level = G.tide.target = TIDE[litCount()];
    if (s.pos) {
      G.player.place(s.pos[0], s.pos[2], s.yaw || 0);
      const gg = G.physics.groundAt(s.pos[0], s.pos[2], s.pos[1] + 0.2);
      G.player.pos.y = gg.h; G.player.groundY = gg.h;
    }
    if (s.finale) { finaleOn = true; finale.start(true); }
    return true;
  }
  const hadSave = load();
  G.water.setLevel(G.tide.level);
  rig.snap(G.player);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  // ---------------- sizing ----------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const v = new THREE.Vector2();
    renderer.getDrawingBufferSize(v);
    post.setSize(v.x, v.y);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------- title / start ----------------
  let playing = false, ready = false, pendingStart = false, compiling = false;
  const startGame = (fromPointer) => {
    if (playing) return;
    if (!ready) { pendingStart = true; return; }
    playing = true;
    ui.hideTitle();
    G.audio.unlock();
    G.audio.softChime();
    rig.snap(G.player);
    if (hadSave) rig.yaw = G.player.yaw + Math.PI;
    if (fromPointer && G.input.device === 'kbm') G.input.requestLock();
  };
  window.addEventListener('pointerdown', () => {
    G.audio.unlock();
    if (!playing) startGame(true);
    else G.input.requestLock();
  });
  window.addEventListener('keydown', (e) => {
    G.audio.unlock();
    if (!playing && !['KeyF', 'Escape', 'Tab'].includes(e.code)) startGame(false);
  });
  G.input.onGesture(() => G.audio.unlock());

  const titleCam = (t) => {
    const hub = ISLANDS[4].c;
    const a = -1.2 + t * 0.02;
    camera.position.set(hub[0] + Math.cos(a) * 250, 70, hub[1] + Math.sin(a) * 250 + 60);
    camera.lookAt(LAYOUT.start[0] * 0.6, 8, LAYOUT.start[1] * 0.6);
  };

  // Compile every shader while the title is up: everything visible, nothing culled, one frame.
  async function precompile() {
    compiling = true;
    titleCam(0);
    sky.update(G.time, G.player.pos, camera, 0);
    const hidden = [], culled = [];
    scene.traverse((o) => {
      if (!o.visible) { hidden.push(o); o.visible = true; }
      if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
    });
    try {
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch (e) { renderer.compile(scene, camera); }
    post.render(scene, camera, 0.6, 1.0, 0.5);
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    compiling = false;
    last = performance.now();
    ready = true;
    ui.setReady();
    if (pendingStart) startGame(true);
  }

  // ---------------- per-frame helpers ----------------
  const nearestCause = { k: -1, x: 0, z: 0, d: 1e9 };
  let waveT = 3, saveT = 4;
  function updateTide(dt) {
    const prev = G.tide.level;
    const d = G.tide.target - G.tide.level;
    G.tide.level += Math.sign(d) * Math.min(Math.abs(d), dt * 0.11);
    G.water.setLevel(G.tide.level);
    // causeway surfacing: waves wash over it
    CAUSEWAYS.forEach((cw) => {
      if (prev > cw.top && G.tide.level <= cw.top) {
        const a = ISLANDS[cw.a].c, b = ISLANDS[cw.b].c;
        for (let i = 1; i <= 5; i++) {
          const t = i / 6;
          G.later(i * 0.35, () => G.audio.wave(a[0] + (b[0] - a[0]) * t, cw.top, a[1] + (b[1] - a[1]) * t, 0.9));
        }
      }
    });
    // ongoing wash near low causeways
    const p = G.player.pos;
    nearestCause.d = 1e9;
    CAUSEWAYS.forEach((cw, k) => {
      const a = ISLANDS[cw.a].c, b = ISLANDS[cw.b].c;
      const [dd, t] = segDist(p.x, p.z, a[0], a[1], b[0], b[1]);
      if (dd < nearestCause.d) { nearestCause.d = dd; nearestCause.k = k; nearestCause.x = a[0] + (b[0] - a[0]) * t; nearestCause.z = a[1] + (b[1] - a[1]) * t; }
    });
    waveT -= dt;
    if (waveT <= 0) {
      waveT = 4 + Math.random() * 5;
      const cw = CAUSEWAYS[nearestCause.k];
      const above = cw.top - G.tide.level;
      if (nearestCause.d < 60 && above > -0.5 && above < 1.4) G.audio.wave(nearestCause.x, cw.top, nearestCause.z, 0.55 * (1 - nearestCause.d / 60));
    }
  }

  const tmpV = new THREE.Vector3();
  const lanternSrc = { pos: null, color: new THREE.Color(1.0, 0.72, 0.4), power: 10, range: 22, fire: null };
  function updateLights(night) {
    const p = G.player.pos;
    lanternSrc.pos = G.player.lanternWorld;
    lanternSrc.fire = G.player.lanternFire;
    lanternSrc.power = 3 + 16 * night + G.player.raise * 10;
    const cands = [];
    for (const s of G.lightSources) {
      if (s.fire.intensity < 0.02) continue;
      const d = s.pos.distanceToSquared(p);
      if (d > (s.range + 60) * (s.range + 60)) continue;
      cands.push([d, s]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const chosen = [lanternSrc, ...cands.slice(0, 3).map((c) => c[1])];
    const lp = G.water.uni.uLP.value, lc = G.water.uni.uLC.value;
    for (let i = 0; i < 4; i++) {
      const L = pool[i], s = chosen[i];
      if (s) {
        L.position.copy(s.pos);
        L.color.copy(s.color);
        L.distance = s.range;
        L.intensity = s.power * s.fire.intensity * s.fire.flicker * (0.35 + 0.65 * night);
        lp[i].set(s.pos.x, s.pos.y, s.pos.z, s.fire.intensity * (i === 0 ? 0.25 : 1.0));
        lc[i].copy(s.color).multiplyScalar(0.12 + 0.5 * night);
      } else {
        L.intensity = 0;
        lp[i].w = 0;
      }
    }
  }

  function hintTarget() {
    const n = litCount();
    if (n >= 5 || G.busy > 0) return null;
    const p = G.player.pos;
    const cur = islandOf(p.x, p.z);
    if (cur !== n) {
      const next = cur < n ? cur + 1 : cur - 1;
      const k = Math.min(cur, next);
      const land = LAYOUT.landings[k][cur < next ? 0 : 1];
      return tmpV.set(land[0], Math.max(groundH(land[0], land[1]), G.tide.level) + 1.2, land[1]);
    }
    const P = G.puzzles[n];
    if (!P.solved) return P.hintTarget();
    const B = G.beacons[n];
    if (B.unlocked && !B.lit) return B.hintPos;
    return null;
  }

  // ---------------- loop ----------------
  let last = performance.now();
  let titleT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (compiling) return;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = 0.001;
    U.uTime.value += dt;
    const t = U.uTime.value;
    G.input.poll();
    if (G.input.fpsToggleOut) ui.toggleFps();
    if (!playing && G.input.started && G.input.device === 'pad') startGame(false);
    renderer.info.reset();

    // timers
    for (let i = G.timers.length - 1; i >= 0; i--) {
      const tm = G.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); }
    }
    G.busy = Math.max(0, G.busy - dt);

    if (playing) {
      G.time += dt;
      const move = G.input.move();
      const look = G.input.look(dt);
      G.player.update(dt, move, rig.yaw, false);
      rig.extra += ((finaleOn ? 5 : 0) - rig.extra) * Math.min(1, dt * 0.5);
      rig.update(dt, look, G.player);
      const cur = G.interact.update(dt, G.player, G.input, G.busy > 0);
      ui.showPrompt(cur ? tmpV.copy(cur.pos).setY(cur.pos.y + cur.glyphY) : null, camera, G.input.device, window.innerWidth, window.innerHeight);
      updateTide(dt);
      saveT -= dt;
      if (saveT <= 0) { saveT = 4; saveNow(); }
    } else {
      titleT += dt;
      titleCam(titleT);
      G.player.update(dt, [0, 0], rig.yaw, true);
    }

    for (const P of G.puzzles) P.update(dt);
    for (const B of G.beacons) B.update(dt);
    for (const f of G.fires) f.update(dt, t);
    finale.update(dt, G.tide.level);

    const focus = playing ? G.player.pos : tmpV.set(LAYOUT.start[0], 5, LAYOUT.start[1]);
    sky.update(G.time, focus, camera, finale.clear() * 0.85);
    const night = sky.night;
    const w = G.water.uni;
    w.uSunDir.value.copy(sky.sunDir);
    w.uSunCol.value.copy(sky.light.color).multiplyScalar(sky.light.intensity * 0.3);
    w.uAmb.value.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.55);
    updateLights(night);
    dressing.update(dt, camera.position, U.uFogFar.value, t, night);

    // wordless hint: stand still a while and the next thing shimmers
    const ht = playing && G.player.idleT > 12 ? hintTarget() : null;
    sparkles.update(dt, ht, !!ht, 1.1);

    // audio
    G.audio.setListener(camera.position, rig.yaw);
    let fireLevel = 0;
    for (const s of G.lightSources) {
      if (s.fire.intensity < 0.05) continue;
      const d = s.pos.distanceTo(G.player.pos);
      fireLevel = Math.max(fireLevel, s.fire.intensity * Math.max(0, 1 - d / 16) * Math.min(1, s.power / 60));
    }
    G.audio.update(dt, G.player.pos, playing ? fireLevel : 0, (1 - night) * 0.9);
    G.audio.setNight(night, 1 - smoothstep(5, 14, G.player.pos.y));

    post.render(scene, camera, 0.32 + 0.8 * night, 1.35 - 0.5 * night, night);
    ui.tick(dt, Math.round(renderer.info.render.triangles / 1000) + 'k tri');
  }

  requestAnimationFrame(frame);
  // let one frame show the title scene, then compile everything behind it
  setTimeout(() => { precompile(); }, 50);
  window.__G = G;
}

main();
