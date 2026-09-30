// Five Lights - a drowned archipelago at golden hour.
import * as THREE from './three.module.min.js';
import * as W from './world.js';
import { clamp, lerp, smoothstep, damp } from './math.js';
import { globalUniforms, allOutlineMats, makeGlow, toonGradient } from './util.js';
const toonGrad = toonGradient();
import { Post } from './post.js';
import { Sky, DAY_LENGTH } from './sky.js';
import { Water, buildHeightTexture } from './water.js';
import { buildTerrain, buildVegetation } from './terrain.js';
import { Causeways } from './causeways.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Fire, allFires } from './fire.js';
import { Beacon } from './beacons.js';
import { Village } from './village.js';
import { Monoliths } from './monoliths.js';
import { Shipwreck } from './shipwreck.js';
import { Observatory } from './observatory.js';
import { Lighthouse } from './lighthouse.js';
import { Finale } from './finale.js';

const SAVE_KEY = 'five-lights-archipelago-v2';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const loadingBar = document.querySelector('#loading div');
const promptEl = document.getElementById('prompt');
const fpsEl = document.getElementById('fps');
const mutedEl = document.getElementById('muted');
const mouseHintEl = document.getElementById('mousehint');
const endEl = document.getElementById('end');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
const post = new Post(renderer);
const input = new Input(canvas);
const audio = new Audio();

const setProgress = (f) => { loadingBar.style.width = Math.round(f * 100) + '%'; };

// ------------------------------------------------------------------ game state
const game = {
  started: false,
  time: 0, // seconds of evening elapsed
  lit: [false, false, false, false, false],
  primed: [false, false, false, false, false],
  tide: 0,
  beacons: [],
  finaleStarted: false,
  primeBeacon(i) {
    if (this.primed[i]) return;
    this.primed[i] = true;
    if (!this.lit[i]) this.beacons[i].setState('primed');
    save();
  },
  setTide(n) {
    if (n <= this.tide) return;
    this.tide = n;
    tideWashT = 0;
    save();
  },
};
let tideWashT = 99;

const interactables = [];
const sparks = [];
let flashAmt = 0;
let saveTimer = -1;

const ctx = {
  scene, audio, game, post, input,
  register: (o) => interactables.push(o),
  save: () => save(),
  saveSoon: () => { if (saveTimer < 0) saveTimer = 1.0; },
  flash: (a) => { flashAmt = Math.max(flashAmt, a); },
  spark: (to, from, cb) => spawnSpark(to, from, cb),
  onLighthouseLit: () => onLighthouseLit(),
};

let player, camRig, sky, water, causewayFx, village, monoliths, shipwreck, observatory, lighthouse, finale;
let shimmer;

async function build() {
  setProgress(0.05);
  await nextFrame();
  W.initCauseways();
  player = new Player(scene);
  camRig = new CameraRig(camera);
  ctx.player = player;
  ctx.camRig = camRig;
  player.onStep = (surface, vol) => audio.footstep(surface, vol);
  // beacons
  W.BEACONS.forEach((b, i) => {
    const beacon = new Beacon(scene, i, b.x, b.z, i === 4 ? { pillar: 0.9 } : {});
    game.beacons.push(beacon);
    ctx.register({
      pos: beacon.interactPos, r: 3.4, promptY: 1.2,
      enabled: () => beacon.state === 'primed',
      press: () => lightBeacon(i),
      id: 'beacon' + i,
    });
  });
  setProgress(0.12);
  await nextFrame();
  village = new Village(ctx);
  monoliths = new Monoliths(ctx);
  shipwreck = new Shipwreck(ctx);
  observatory = new Observatory(ctx);
  lighthouse = new Lighthouse(ctx);
  ctx.village = village;
  ctx.lighthouse = lighthouse;
  finale = new Finale(ctx);
  addIslandPaths();
  buildRampRails();
  setProgress(0.25);
  await nextFrame();
  causewayFx = new Causeways(scene);
  setProgress(0.35);
  await nextFrame();
  buildTerrain(scene);
  setProgress(0.55);
  await nextFrame();
  buildVegetation(scene, (x, z, r, y0, y1, tree) => W.addCircle(x, z, r, y0, y1, { cam: false, tree }));
  setProgress(0.75);
  await nextFrame();
  const hTex = buildHeightTexture();
  water = new Water(scene, hTex);
  sky = new Sky(scene);
  shimmer = buildShimmer();
  scene.add(shimmer.points);
  setProgress(0.9);
  await nextFrame();
  load();
  camRig.snap(player.pos, player.facing);
  setProgress(1);
  // compile shaders up front to avoid hitches
  renderer.setRenderTarget(post.main);
  renderer.compile(scene, camera);
  renderer.setRenderTarget(null);
  document.getElementById('loading').style.display = 'none';
  document.getElementById('starts').style.visibility = 'visible';
  ready = true;
}

// wooden posts and a rope rail along the outer edge of each switchback ramp, cairns at the landings
function buildRampRails() {
  const posts = [], rails = [];
  for (const rp of W.RAMPS) {
    const n = Math.floor(rp.len / 3.5);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const th = rp.A + rp.dir * (u * rp.len) / rp.R;
      const r = rp.R + 1.85;
      const x = W.PEAK.x + Math.cos(th) * r, z = W.PEAK.z + Math.sin(th) * r;
      const y = lerp(W.PEAK_LEVELS[rp.k], W.PEAK_LEVELS[rp.k + 1], u);
      const top = new THREE.Vector3(x, y + 1.0, z);
      posts.push(new THREE.Vector3(x, y, z));
      if (prev) rails.push([prev, top]);
      prev = top;
    }
  }
  const pg = new THREE.CylinderGeometry(0.07, 0.09, 1.1, 5);
  pg.translate(0, 0.55, 0);
  const pm = new THREE.InstancedMesh(pg, new THREE.MeshToonMaterial({ color: 0x6b4a33, gradientMap: toonGrad }), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => { m.makeTranslation(p.x, p.y - 0.05, p.z); pm.setMatrixAt(i, m); });
  pm.castShadow = true;
  pm.computeBoundingSphere();
  scene.add(pm);
  const rg = new THREE.CylinderGeometry(0.025, 0.025, 1, 4);
  const rm = new THREE.InstancedMesh(rg, new THREE.MeshToonMaterial({ color: 0xc8b48a, gradientMap: toonGrad }), rails.length);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  rails.forEach(([a, b], i) => {
    const d = b.clone().sub(a);
    q.setFromUnitVectors(up, d.clone().normalize());
    sc.set(1, d.length(), 1);
    m.compose(a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.08, 0)), q, sc);
    rm.setMatrixAt(i, m);
  });
  rm.computeBoundingSphere();
  scene.add(rm);
  // cairns where each ramp begins
  const cairnMat = new THREE.MeshToonMaterial({ color: 0x9a938a, gradientMap: toonGrad });
  for (const rp of W.RAMPS) {
    const th = rp.A - rp.dir * 2.5 / rp.R;
    const x = W.PEAK.x + Math.cos(th) * (rp.R + 2.6), z = W.PEAK.z + Math.sin(th) * (rp.R + 2.6);
    const y = W.PEAK_LEVELS[rp.k];
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 - i * 0.08, 0), cairnMat);
      st.position.set(x, y + 0.3 + i * 0.5, z);
      st.rotation.set(i, i * 2, 0);
      st.castShadow = true;
      scene.add(st);
    }
  }
}

function addIslandPaths() {
  const cw = W.causeways;
  const ring = W.ISLANDS.ring;
  W.addPath([[cw[0].b.x, cw[0].b.z], [ring.x - 4, ring.z - 11], [ring.x - 2, ring.z - 12.5]]);
  W.addPath([[ring.x + 12.5, ring.z - 1], [cw[1].a.x, cw[1].a.z]]);
  // peak: arrival to the first ramp, then around the base to the lighthouse causeway
  const P = W.PEAK;
  const at = (r, deg) => [P.x + Math.cos((deg * Math.PI) / 180) * r, P.z + Math.sin((deg * Math.PI) / 180) * r];
  W.addPath([[cw[2].b.x, cw[2].b.z], at(54, 115), at(52, 106)]);
  const arc = [];
  for (let d = 106; d <= 232; d += 6) arc.push(at(55, d));
  arc.push([cw[3].a.x, cw[3].a.z]);
  W.addPath(arc);
  W.addPath([at(19, 144), at(8.5, 144)]);
}

// ------------------------------------------------------------------ effects
function spawnSpark(to, from, cb) {
  const start = from ? from.clone() : player.lanternWorldPos(new THREE.Vector3());
  const f = new Fire({ height: 0.5, width: 0.3, embers: 10, emberHeight: 1, emberSize: 0.05, glow: true, glowSize: 3, glowIntensity: 2, layers: [{ x: 0, z: 0, s: 1, seed: Math.random() * 9 }] });
  f.set(1, true);
  scene.add(f.group);
  const dist = start.distanceTo(to);
  sparks.push({ f, start, to: to.clone(), t: 0, dur: clamp(dist / 8, 0.6, 1.6), cb, arc: 1 + dist * 0.15 });
}
function updateSparks(dt, night) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.t += dt / s.dur;
    const t = Math.min(1, s.t);
    const e = t * t * (3 - 2 * t);
    s.f.group.position.lerpVectors(s.start, s.to, e);
    s.f.group.position.y += Math.sin(t * Math.PI) * s.arc;
    s.f.update(dt, night);
    if (s.t >= 1) {
      scene.remove(s.f.group);
      s.f.dispose();
      sparks.splice(i, 1);
      if (s.cb) s.cb();
    }
  }
}

function buildShimmer() {
  const n = 90;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: globalUniforms.uTime, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uAlpha; varying float vA;
      void main(){
        float col = step(0.6, aSeed);
        float ph = fract(uTime * (0.25 + aSeed * 0.2) + aSeed * 13.0);
        float ang = aSeed * 40.0 + uTime * (1.0 + aSeed);
        float r = mix(0.6 + 0.6 * fract(aSeed * 7.7), 0.25, col);
        vec3 p = vec3(cos(ang) * r, mix(ph * 2.5 - 0.5, ph * 16.0, col), sin(ang) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.5 + 0.5 * sin(uTime * 9.0 + aSeed * 50.0);
        vA = uAlpha * sin(ph * 3.14159) * tw;
        gl_PointSize = mix(0.16, 0.3, col) * (300.0 / max(-mv.z, 0.5)) + col * 2.0;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = abs(c.x) + abs(c.y); if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(2.6, 2.3, 1.5) * vA * (1.0 - d * 1.2), 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return { points, mat, alpha: 0 };
}

function currentHint() {
  const k = game.lit.indexOf(false);
  if (k < 0) return null;
  const b = game.beacons[k];
  if (b.state === 'primed') return b.interactPos.clone().add(new THREE.Vector3(0, 0.5, 0));
  const mod = [village, monoliths, shipwreck, observatory, lighthouse][k];
  return mod.hint();
}

// ------------------------------------------------------------------ beacons
function lightBeacon(i) {
  const b = game.beacons[i];
  if (b.state !== 'primed') return;
  b.state = 'lighting';
  player.raiseLantern(2.2);
  audio.whoosh(b.lightPos, 0.5);
  setTimeout(() => {
    spawnSpark(b.lightPos, null, () => {
      b.setState('lit');
      game.lit[i] = true;
      audio.whoosh(b.lightPos, 1.2);
      audio.fanfare(i, b.lightPos);
      input.rumble(0.9, 0.6, 700);
      flashAmt = Math.max(flashAmt, 0.7);
      if (i < 4) setTimeout(() => game.setTide(i + 1), 1800);
      else lighthouse.ignite();
      save();
    });
  }, 450);
}
function onLighthouseLit() {
  input.rumble(1.0, 1.0, 1200);
  audio.fanfare(4, lighthouse.lampPos);
  flashAmt = 1.2;
  finale.start();
  game.finaleStarted = true;
  save();
}

// ------------------------------------------------------------------ save / load
function save() {
  if (!player) return;
  const s = {
    v: 1, t: game.time, lit: game.lit, primed: game.primed, tide: game.tide,
    p: { x: player.pos.x, z: player.pos.z, f: player.facing, cy: camRig.yaw },
    village: village.getState(), ring: monoliths.getState(), ship: shipwreck.getState(),
    obs: observatory.getState(), light: lighthouse.getState(), fin: finale.done || game.finaleStarted,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
}
function load() {
  let s = null;
  try {
    if (new URLSearchParams(location.search).has('reset')) localStorage.removeItem(SAVE_KEY);
    s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  } catch (e) { s = null; }
  player.place(W.SPAWN.x, W.SPAWN.z, W.SPAWN.yaw);
  camRig.yaw = W.SPAWN.yaw;
  if (!s || s.v !== 1) { W.state.waterY = 0; return; }
  game.time = s.t || 0;
  village.setState(s.village);
  monoliths.setState(s.ring);
  shipwreck.setState(s.ship);
  observatory.setState(s.obs);
  lighthouse.setState(s.light);
  for (let i = 0; i < 5; i++) {
    game.lit[i] = !!(s.lit && s.lit[i]);
    game.primed[i] = !!(s.primed && s.primed[i]) || game.lit[i];
    game.beacons[i].setState(game.lit[i] ? 'lit' : game.primed[i] ? 'primed' : 'dead', true);
  }
  // tide follows the lit beacons (never higher than what was earned)
  const litCount = game.lit.slice(0, 4).filter(Boolean).length;
  game.tide = Math.max(s.tide | 0, litCount);
  if (game.lit[4]) {
    lighthouse.ignite(true);
    game.tide = 5;
    finale.setDone();
    game.finaleStarted = true;
    village.lightVillage();
  }
  W.state.waterY = -game.tide * W.TIDE_STEP;
  tideWashT = 99;
  if (s.p && Number.isFinite(s.p.x) && Number.isFinite(s.p.z)) {
    const h = W.groundH(s.p.x, s.p.z);
    if (h > W.state.waterY - 0.4) {
      player.place(s.p.x, s.p.z, s.p.f || 0);
      camRig.yaw = Number.isFinite(s.p.cy) ? s.p.cy : player.facing;
    }
  }
}

// ------------------------------------------------------------------ start / audio unlock
let ready = false;
function startGame(device) {
  if (!ready || game.started) return;
  game.started = true;
  overlay.classList.add('hide');
  canvas.focus();
  audio.setListener(player.pos.x, player.pos.y, player.pos.z, camRig.yaw);
  // greet with a gull and the sea so the start is audible
  setTimeout(() => audio.gull(player.pos.clone().add(new THREE.Vector3(-14, 18, -20))), 600);
  audio.wash(player.pos.clone().add(new THREE.Vector3(12, 0, 0)), 0.7);
}
input.onUserGesture = (kind) => {
  audio.unlock(); // must happen inside the key/click handler
  if (!ready) return;
  if (!game.started) startGame(kind);
  if (kind === 'mouse') input.requestLock();
};
overlay.addEventListener('click', () => { audio.unlock(); if (ready) { startGame('mouse'); input.requestLock(); } });
canvas.addEventListener('click', () => { audio.unlock(); if (game.started) input.requestLock(); });

// ------------------------------------------------------------------ interaction + prompt
let current = null;
const tmpV = new THREE.Vector3();
function updateInteract(dt) {
  let best = null, bs = Infinity;
  if (!player.frozen) {
    const fx = -Math.sin(player.facing), fz = -Math.cos(player.facing);
    for (const o of interactables) {
      if (!o.enabled()) continue;
      const dx = o.pos.x - player.pos.x, dz = o.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > o.r) continue;
      if (Math.abs(o.pos.y - (player.pos.y + 1.0)) > 2.3) continue;
      const facing = (dx * fx + dz * fz) / Math.max(d, 0.01);
      const score = d - facing * 0.9;
      if (score < bs) { bs = score; best = o; }
    }
  }
  current = best;
  if (best && game.started) {
    if (input.interactPressed && best.press) { best.press(); lastActionTime = performance.now(); }
    if (input.interact && best.hold) { best.hold(dt); lastActionTime = performance.now(); }
  }
  // prompt glyph
  if (best && game.started) {
    tmpV.copy(best.pos);
    tmpV.y += best.promptY ?? 1.2;
    tmpV.project(camera);
    if (tmpV.z < 1) {
      const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth, y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
      promptEl.style.left = x + 'px';
      promptEl.style.top = y + 'px';
      promptEl.classList.add('show');
    } else promptEl.classList.remove('show');
    promptEl.classList.toggle('hold', !!best.hold);
  } else promptEl.classList.remove('show');
  promptEl.classList.toggle('dev-kb', input.device === 'kb');
  promptEl.classList.toggle('dev-pad', input.device === 'pad');
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let lastActionTime = performance.now();
let fpsOn = false, fpsAcc = 0, fpsFrames = 0;
let gullT = 5, washT = 3;
let endShown = false;
const waterLights = [];

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!ready) return;
  const time = now / 1000;
  globalUniforms.uTime.value = time % 1000;
  input.update(dt);
  if (input.padActiveEdge) {
    // succeeds where gamepad presses count as activation, or once the page has been clicked/keyed before
    if (!audio.running) audio.unlock();
    if (!game.started) startGame('pad');
  }
  if (input.fpsPressed) { fpsOn = !fpsOn; fpsEl.style.display = fpsOn ? 'block' : 'none'; }

  if (game.started) game.time += dt;
  const dayT = game.time / DAY_LENGTH;
  sky.update(dayT, player.pos, camera, time);
  const night = sky.night;
  globalUniforms.uNight.value = night;
  for (const m of allOutlineMats()) m.uniforms.uNight.value = night;

  // tide
  const targetY = -game.tide * W.TIDE_STEP;
  const prevWater = W.state.waterY;
  if (W.state.waterY > targetY) W.state.waterY = Math.max(targetY, W.state.waterY - dt * 0.16);
  if (tideWashT < 12 && game.started) {
    tideWashT += dt;
    if (Math.floor(tideWashT / 1.6) !== Math.floor((tideWashT - dt) / 1.6)) {
      const cw = W.causeways[Math.max(0, game.tide - 1)];
      const pt = W.causewayNearest(cw, player.pos.x, player.pos.z);
      const p = W.causewayPoint(cw, pt.s);
      audio.wash(new THREE.Vector3(p.x, W.state.waterY, p.z), 1.2, 2.6);
    }
  }

  // player + camera
  const look = game.started && !player.frozen ? input.look : { x: 0, y: 0 };
  if (!game.started) camRig.yaw += dt * 0.03;
  player.update(dt, game.started ? input : { move: { x: 0, y: 0 }, run: false }, camRig.yaw, night, time);
  camRig.update(dt, player.pos, look);

  updateInteract(dt);
  village.update(dt, time);
  monoliths.update(dt, time, player.pos);
  shipwreck.update(dt, time, night);
  observatory.update(dt, time, night);
  lighthouse.update(dt, time, night);
  finale.update(dt, time, night);
  for (const b of game.beacons) b.update(dt, night, time);
  updateSparks(dt, night);
  causewayFx.update(dt, W.state.waterY);
  if (!endShown && finale.done && game.finaleStarted && finale.t > 60 && finale.t < 150) { endShown = true; endEl.classList.add('show'); setTimeout(() => endEl.classList.remove('show'), 9000); }

  // hint shimmer when the player has stood still for a while
  const idle = (now - Math.max(input.lastMove || 0, lastActionTime)) / 1000;
  const hint = game.started && idle > 14 ? currentHint() : null;
  shimmer.alpha = lerp(shimmer.alpha, hint ? 1 : 0, damp(hint ? 1.2 : 4, dt));
  if (hint) shimmer.points.position.copy(hint);
  shimmer.mat.uniforms.uAlpha.value = shimmer.alpha;
  shimmer.points.visible = shimmer.alpha > 0.01;

  // water + lights on water
  waterLights.length = 0;
  const lp = player.lanternWorldPos(tmpV);
  waterLights.push({ x: lp.x, y: lp.y, z: lp.z, w: 0.3 + night * 1.6 });
  for (const b of game.beacons) if (b.state === 'lit') waterLights.push({ x: b.lightPos.x, y: b.lightPos.y, z: b.lightPos.z, w: 1.5 + night * 5 });
  if (lighthouse.stage === 'lit') waterLights.push({ x: lighthouse.lampPos.x, y: lighthouse.lampPos.y, z: lighthouse.lampPos.z, w: 3 + night * 8 });
  water.setLights(waterLights);
  water.update(W.state.waterY, sky, scene.fog);

  // audio
  audio.setListener(camera.position.x, camera.position.y, camera.position.z, camRig.smoothYaw);
  let fireNear = 0;
  for (const f of allFires) {
    if (f.level < 0.05 || !f.light) continue;
    const d = f.group.getWorldPosition(tmpV).distanceTo(player.pos);
    fireNear = Math.max(fireNear, (1 - smoothstep(3, 26, d)) * f.level);
  }
  audio.update(dt, {
    seaNear: clamp(1 - (player.pos.y - W.state.waterY) / 9, 0.12, 1),
    height: Math.max(0, player.pos.y), night,
    hum: monoliths.humLevel(player.pos), humSolved: monoliths.solved, fire: fireNear,
  });
  if (game.started) {
    gullT -= dt;
    if (gullT < 0) {
      gullT = 7 + Math.random() * 14;
      if (night < 0.65) {
        const a = Math.random() * Math.PI * 2;
        audio.gull(new THREE.Vector3(player.pos.x + Math.cos(a) * 35, player.pos.y + 22, player.pos.z + Math.sin(a) * 35));
      }
    }
    washT -= dt;
    if (washT < 0) {
      washT = 3.5 + Math.random() * 4;
      // waves lap over the nearest surfaced causeway
      let best = null, bd = 50;
      for (const cw of W.causeways) {
        if (cw.mid > W.state.waterY + 1.5) continue;
        const n = W.causewayNearest(cw, player.pos.x, player.pos.z);
        if (n.d < bd) { bd = n.d; best = { cw, s: n.s }; }
      }
      if (best) {
        const p = W.causewayPoint(best.cw, best.s);
        audio.wash(new THREE.Vector3(p.x, W.state.waterY, p.z), 0.6, 2.4);
      }
    }
  }

  // bloom and exposure
  flashAmt = Math.max(0, flashAmt - dt * 0.6);
  sky.flash = flashAmt;
  post.strength = 0.35 + night * 0.75 + flashAmt * 0.8;
  post.threshold = lerp(1.5, 0.85, night);
  post.compMat.uniforms.uExposure.value = (sky.exposure || 1) * (1 + flashAmt * 0.15);

  // HUD bits
  mutedEl.style.display = game.started && !audio.running ? 'flex' : 'none';
  mouseHintEl.style.display = game.started && input.device === 'kb' && !input.locked ? 'block' : 'none';

  // autosave
  if (saveTimer >= 0) { saveTimer -= dt; if (saveTimer < 0) save(); }
  if (game.started && Math.floor(game.time / 5) !== Math.floor((game.time - dt) / 5)) save();

  post.render(scene, camera, time);

  if (fpsOn) {
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) { fpsEl.textContent = Math.round(fpsFrames / fpsAcc) + ' fps'; fpsAcc = 0; fpsFrames = 0; }
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.setSize();
});
window.addEventListener('beforeunload', () => save());
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

build().then(() => requestAnimationFrame(frame)).catch((e) => {
  console.error(e);
  document.getElementById('loading').style.background = '#a33';
});
