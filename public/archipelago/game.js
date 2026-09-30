// Five Lights — a lighthouse keeper's apprentice relights a drowned archipelago
// before nightfall. Entry point: renderer, player, input, puzzles' glue, loop.
import * as THREE from "./three.module.min.js";
import {
  TIDE, WADE, STEP_UP, STEP_DOWN, DAY_SECONDS, ISLANDS, causeways, groundAt, terrainH,
  blockedByCollider, rng, smoothstep,
} from "./world.js";
import {
  makeSky, makeClouds, makeTerrain, makeSea, samplePalette, outline, outlineUniforms, toon, glowSprite,
  dirFrom, STAR_AZ, STAR_EL,
} from "./env.js";
import {
  buildVillage, buildShipwreck, buildMonoliths, buildObservatory, buildLighthouse, buildCauseways,
  buildScatter, makeGulls, makeBoats, makeEveningStar,
} from "./props.js";
import { Sound } from "./audio.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const $ = (id) => document.getElementById(id);
const SAVE_KEY = "fivelights.v1";

// ---------------------------------------------------------------------------
// Renderer

const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf7cf98, 160, 640);
const camera = new THREE.PerspectiveCamera(isTouch ? 60 : 55, 1, 0.3, 2600);

let portrait = false;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  portrait = w < h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // portrait phones: widen the view so islands still read
  camera.fov = w < h ? 72 : isTouch ? 60 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------------------
// Lights & environment

const sun = new THREE.DirectionalLight(0xffd59a, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -48;
sc.right = sc.top = 48;
sc.near = 1;
sc.far = 260;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffe7c4, 0x7c86b0, 1.25);
scene.add(hemi);

const sky = makeSky();
scene.add(sky.mesh);
const clouds = makeClouds(rng(12));
scene.add(clouds.group);
const terrain = makeTerrain();
scene.add(terrain);
const sea = makeSea();
scene.add(sea.mesh);
const star = makeEveningStar(scene);

// ---------------------------------------------------------------------------
// Game state and the context the landmarks talk to

const state = {
  started: false,
  t: 0, // seconds of the 20-minute dusk that have passed
  play: 0,
  lit: [0, 0, 0, 0, 0],
  tide: TIDE[0],
  tideTarget: TIDE[0],
  busy: false,
  done: false,
  rush: false,
};
const sound = new Sound();
const timers = [];
const interactables = [];

const ctx = {
  state,
  sound,
  hum: 0,
  interact(o) {
    interactables.push(o);
  },
  after(sec, fn) {
    timers.push({ at: clock + sec, fn });
  },
  wait(sec) {
    return new Promise((res) => ctx.after(sec, res));
  },
  solved(i, from, direct) {
    if (direct) ignite(i);
    else {
      for (const p of from) spark(p, beacons[i].world, 2.2);
      ctx.after(2.3, () => ignite(i));
    }
  },
  teleport(pos, yaw) {
    teleport(pos, yaw);
  },
};
let clock = 0;

const village = buildVillage(scene, ctx);
const wreck = buildShipwreck(scene, ctx);
const ring = buildMonoliths(scene, ctx);
const obs = buildObservatory(scene, ctx);
const lighthouse = buildLighthouse(scene, ctx);
const puzzles = [village, wreck, ring, obs, lighthouse];
const beacons = puzzles.map((p) => p.beacon);
buildCauseways(scene);
buildScatter(scene, [
  { x: ISLANDS[1].x + 6, z: ISLANDS[1].z + 6, r: 11 },
  ...beacons.map((b) => ({ x: b.world.x, z: b.world.z, r: 4 })),
  { x: ring.center.x, z: ring.center.z, r: 11 },
  { x: ISLANDS[3].x, z: ISLANDS[3].z, r: 17 },
  { x: ISLANDS[4].x, z: ISLANDS[4].z, r: 9 },
  { x: ISLANDS[0].x, z: ISLANDS[0].z + 12, r: 9 },
]);
const gulls = makeGulls(scene);
const boats = makeBoats(scene, lighthouse.center);

// ---------------------------------------------------------------------------
// The apprentice

function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const tunic = outline(
    new THREE.Mesh(new THREE.LatheGeometry([V(0, 0), V(0.55, 0), V(0.5, 0.25), V(0.36, 0.8), V(0.26, 1.0), V(0, 1.02)], 14), toon(0x3d6fb6)),
    0.045
  );
  tunic.position.y = 0.32;
  const legGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.42, 6);
  legGeo.translate(0, -0.21, 0);
  const legMat = toon(0x3a3040);
  const legL = new THREE.Mesh(legGeo, legMat), legR = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.17, 0.42, 0);
  legR.position.set(0.17, 0.42, 0);
  const head = outline(new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), toon(0xf3c9a2)), 0.04);
  head.position.y = 1.72;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.47, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), toon(0x6b4128));
  hair.position.y = 1.76;
  hair.rotation.x = -0.35;
  const cap = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.26, 14), toon(0x26304f)), 0.03);
  cap.position.y = 2.1;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), toon(0x1c233b));
  brim.position.set(0, 2.0, 0.44);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.1, 6, 14), toon(0xd8453a));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.33;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.06), toon(0xd8453a));
  tail.position.set(0.12, 1.1, -0.3);
  tail.rotation.x = 0.3;
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1420 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat), eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.scale.set(0.8, 1.4, 0.6);
  eyeR.scale.copy(eyeL.scale);
  eyeL.position.set(-0.15, 1.74, 0.4);
  eyeR.position.set(0.15, 1.74, 0.4);
  // lantern arm
  const arm = new THREE.Group();
  arm.position.set(0.42, 1.18, 0.05);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 6), toon(0x3d6fb6));
  sleeve.position.y = -0.2;
  sleeve.rotation.z = 0.25;
  const lantern = new THREE.Group();
  lantern.position.set(0.18, -0.55, 0.12);
  const lframe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), toon(0xb8862f, { wireframe: false }));
  const lglass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.28), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  const lglass2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.2), lglass.material);
  const lcap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), toon(0x3b3040));
  lcap.position.y = 0.25;
  lcap.rotation.y = Math.PI / 4;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI), toon(0x3b3040));
  handle.position.y = 0.3;
  const lglow = glowSprite(0xffc070, 1.8);
  lantern.add(lframe, lglass, lglass2, lcap, handle, lglow);
  arm.add(sleeve, lantern);
  const lamp = new THREE.PointLight(0xffb45a, 1, 16, 1.4);
  lamp.position.set(0, 0.1, 0);
  lantern.add(lamp);
  body.add(tunic, legL, legR, head, hair, cap, brim, scarf, tail, eyeL, eyeR, arm);
  body.traverse((o) => o.isMesh && (o.castShadow = true));
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.9, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
  );
  ripple.rotation.x = -Math.PI / 2;
  scene.add(ripple);
  scene.add(g);
  return { group: g, body, legL, legR, arm, lantern, lamp, lglow, ripple, tail };
}

const player = {
  pos: V(-2, 0, ISLANDS[0].z + 9),
  facing: 0,
  phase: 0,
  moving: 0,
  model: makePlayer(),
};
player.pos.y = groundAt(player.pos.x, player.pos.z);

function standAt(x, z, y) {
  const g = groundAt(x, z, y);
  if (g > y + STEP_UP || g < y - STEP_DOWN) return null;
  if (g < state.tide - WADE) return null;
  if (blockedByCollider(x, z, g + 0.8, 0.38)) return null;
  return g;
}

function teleport(pos, yaw) {
  state.busy = true;
  sound.door();
  $("fade").classList.add("on");
  ctx.after(0.95, () => {
    player.pos.copy(pos);
    player.facing = yaw;
    cam.yaw = yaw + Math.PI;
    snapCamera();
    $("fade").classList.remove("on");
    state.busy = false;
  });
}

// ---------------------------------------------------------------------------
// Camera

const cam = {
  yaw: Math.PI,
  pitch: 0.36,
  dist: isTouch ? 11.5 : 10.5,
  look: V(),
  lastLook: -10,
};
const cine = { active: false, pos: V(), look: V(), orbit: null, rate: 1.6 };

function followCameraPos(out) {
  const p = player.pos;
  // tall screens look down a little more so the ground doesn't fill the lower half
  const pitch = Math.min(1.2, cam.pitch + (portrait ? 0.14 : 0));
  const cp = Math.cos(pitch);
  out.set(p.x + Math.sin(cam.yaw) * cam.dist * cp, p.y + 1.6 + Math.sin(pitch) * cam.dist, p.z + Math.cos(cam.yaw) * cam.dist * cp);
  const floor = Math.max(terrainH(out.x, out.z), state.tide) + 1.2;
  if (out.y < floor) out.y = floor;
  return out;
}
function snapCamera() {
  followCameraPos(camera.position);
  cam.look.copy(player.pos).add(V(0, 2.3, 0));
  camera.lookAt(cam.look);
}

const tmpV = V(), tmpL = V();
function updateCamera(dt) {
  if (cine.active) {
    if (cine.orbit) {
      const o = cine.orbit;
      o.a += dt * o.speed;
      cine.pos.set(o.c.x + Math.cos(o.a) * o.r, o.c.y + o.h, o.c.z + Math.sin(o.a) * o.r);
      cine.look.copy(o.c).add(V(0, o.lookY, 0));
    }
    const k = 1 - Math.exp(-dt * cine.rate);
    camera.position.lerp(cine.pos, k);
    cam.look.lerp(cine.look, k);
  } else {
    followCameraPos(tmpV);
    tmpL.copy(player.pos).add(V(0, 2.3, 0));
    const k = 1 - Math.exp(-dt * 7);
    camera.position.lerp(tmpV, k);
    cam.look.lerp(tmpL, 1 - Math.exp(-dt * 10));
  }
  camera.lookAt(cam.look);
}

// ---------------------------------------------------------------------------
// Input: floating stick on the left, drag-to-look on the right (or mouse).

const input = { x: 0, y: 0, keys: new Set() };
const joy = { id: null, ox: 0, oy: 0 };
const look = { id: null, x: 0, y: 0 };
const stickEl = $("stick"), knobEl = $("knob");

canvas.addEventListener("pointerdown", (e) => {
  if (!state.started) return;
  canvas.setPointerCapture?.(e.pointerId);
  if (e.pointerType !== "mouse" && e.clientX < window.innerWidth * 0.5 && joy.id === null) {
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    stickEl.style.left = e.clientX + "px";
    stickEl.style.top = e.clientY + "px";
    stickEl.classList.add("on");
    knobEl.style.transform = "";
  } else if (look.id === null) {
    look.id = e.pointerId;
    look.x = e.clientX;
    look.y = e.clientY;
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy), max = 52;
    if (l > max) {
      dx *= max / l;
      dy *= max / l;
    }
    input.x = dx / max;
    input.y = dy / max;
    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === look.id) {
    const s = e.pointerType === "mouse" ? 0.005 : 0.007;
    cam.yaw -= (e.clientX - look.x) * s;
    cam.pitch = Math.min(1.15, Math.max(0.05, cam.pitch + (e.clientY - look.y) * s * 0.7));
    look.x = e.clientX;
    look.y = e.clientY;
    cam.lastLook = clock;
  }
});
function release(e) {
  if (e.pointerId === joy.id) {
    joy.id = null;
    input.x = input.y = 0;
    stickEl.classList.remove("on");
  }
  if (e.pointerId === look.id) look.id = null;
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("wheel", (e) => {
  cam.dist = Math.min(18, Math.max(5, cam.dist + Math.sign(e.deltaY) * 0.8));
}, { passive: true });

window.addEventListener("keydown", (e) => {
  input.keys.add(e.code);
  if ((e.code === "KeyE" || e.code === "Space" || e.code === "Enter") && !e.repeat) {
    e.preventDefault();
    if (!state.started) begin();
    else activate();
  }
});
window.addEventListener("keyup", (e) => input.keys.delete(e.code));
window.addEventListener("blur", () => input.keys.clear());

// Gamepad (standard mapping, e.g. an Xbox controller): left stick or d-pad
// walks, right stick looks, A interacts, A/Start begins, triggers zoom.
const pad = { x: 0, y: 0, prev: [] };
const dead = (x, y, d = 0.18) => {
  const l = Math.hypot(x, y);
  if (l < d) return [0, 0];
  const k = (Math.min(1, l) - d) / (1 - d) / l;
  return [x * k, y * k];
};
function pollGamepad(dt) {
  pad.x = pad.y = 0;
  const gp = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !pad.prev[i];
  const [mx, my] = dead(gp.axes[0] || 0, gp.axes[1] || 0);
  pad.x = mx + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
  pad.y = my + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
  const [lx, ly] = dead(gp.axes[2] || 0, gp.axes[3] || 0);
  if (lx || ly) {
    cam.yaw -= lx * dt * 2.6;
    cam.pitch = Math.min(1.15, Math.max(0.05, cam.pitch + ly * dt * 1.6));
    cam.lastLook = clock;
  }
  const zoom = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
  if (zoom) cam.dist = Math.min(18, Math.max(5, cam.dist + zoom * dt * 8));
  if (pressed(0) || pressed(9)) {
    const end = $("end");
    if (!state.started) begin();
    else if (!end.classList.contains("gone")) end.dispatchEvent(new Event("pointerdown"));
    else if (pressed(0)) activate();
  }
  pad.prev = gp.buttons.map((x) => x.pressed);
}
// Browsers only unlock audio on a click, tap or key press; a controller button
// doesn't count, so retry on the next such gesture if we began from the pad.
for (const ev of ["pointerdown", "keydown"]) {
  window.addEventListener(ev, () => sound.ctx?.state === "suspended" && sound.ctx.resume(), { capture: true });
}

function readMove() {
  let x = input.x + pad.x, y = input.y + pad.y;
  const k = input.keys;
  if (k.has("KeyW") || k.has("ArrowUp")) y -= 1;
  if (k.has("KeyS") || k.has("ArrowDown")) y += 1;
  if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
  if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
  const l = Math.hypot(x, y);
  if (l > 1) {
    x /= l;
    y /= l;
  }
  return { x, y, m: Math.min(1, l) };
}

// ---------------------------------------------------------------------------
// Interaction button

const ICONS = {
  flame: '<path d="M24 6c5 7 11 12 11 21a11 11 0 0 1-22 0c0-5 3-8 5-11 1 4 3 6 5 6-1-6 0-11 1-16z"/>',
  turn: '<path d="M36 26a12 12 0 1 1-4.5-9.4"/><path d="M33 8.5v8.5h-8.5"/>',
  touch: '<circle cx="24" cy="24" r="4.5"/><circle cx="24" cy="24" r="11" stroke-dasharray="3 4"/><circle cx="24" cy="24" r="17.5" opacity=".5"/>',
  door: '<path d="M14 41V21a10 10 0 0 1 20 0v20"/><path d="M9 41h30"/><circle cx="29" cy="30" r="1.2"/>',
};
const actEl = $("act");
const actSvg = actEl.querySelector("svg");
let current = null, currentIcon = "";
actEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  activate();
});

function activate() {
  if (state.busy || !current) return;
  const it = current;
  current = null;
  it.act();
}

function pickInteractable() {
  let best = null, bestScore = 1;
  if (!state.busy && state.started) {
    for (const it of interactables) {
      if (Math.abs(it.pos.y - player.pos.y) > 3.5) continue;
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      const s = d / it.r;
      if (s < bestScore && it.can()) {
        best = it;
        bestScore = s;
      }
    }
  }
  current = best;
  const icon = best ? best.icon : "";
  if (icon !== currentIcon) {
    if (icon) actSvg.innerHTML = ICONS[icon];
    actEl.classList.toggle("show", !!icon);
    currentIcon = icon;
  }
}

// ---------------------------------------------------------------------------
// Sparks that carry fire from lamps to a beacon

const sparks = [];
function spark(from, to, dur) {
  const s = glowSprite(0xffd080, 2.2);
  s.position.copy(from);
  scene.add(s);
  const mid = from.clone().lerp(to, 0.5);
  mid.y += 6 + from.distanceTo(to) * 0.15;
  sparks.push({ s, from: from.clone(), mid, to: to.clone(), t: 0, dur });
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const k = sparks[i];
    k.t += dt / k.dur;
    const t = Math.min(1, k.t), u = 1 - t;
    k.s.position.set(
      u * u * k.from.x + 2 * u * t * k.mid.x + t * t * k.to.x,
      u * u * k.from.y + 2 * u * t * k.mid.y + t * t * k.to.y,
      u * u * k.from.z + 2 * u * t * k.mid.z + t * t * k.to.z
    );
    k.s.material.opacity = 0.6 + 0.4 * Math.sin(clock * 30 + i);
    if (k.t >= 1) {
      scene.remove(k.s);
      sparks.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Beacons, tide and the finale

const litCount = () => state.lit.reduce((a, b) => a + b, 0);
const hudDots = [...document.querySelectorAll("#lights i")];
function updateHudLights() {
  hudDots.forEach((d, i) => d.classList.toggle("lit", !!state.lit[i]));
}

async function ignite(i) {
  if (state.lit[i]) return;
  state.lit[i] = 1;
  updateHudLights();
  save();
  state.busy = true;
  const b = beacons[i];
  const lookAt = b.world.clone();
  const away = camera.position.clone().sub(lookAt).setY(0);
  if (away.lengthSq() < 1) away.set(1, 0, 0);
  away.normalize().multiplyScalar(i === 4 ? 22 : 13);
  cine.pos.copy(lookAt).add(away).add(V(0, i === 4 ? 3 : 5, 0));
  cine.look.copy(lookAt);
  cine.rate = 1.6;
  cine.orbit = null;
  cine.active = true;
  await ctx.wait(0.8);
  b.light_();
  sound.ignite();
  await ctx.wait(2.6);
  if (i < 4) {
    const c = causeways[i];
    const mid = V(c.mx, c.top, c.mz);
    const perp = V(-c.uz, 0, c.ux);
    if (perp.dot(camera.position.clone().sub(mid)) < 0) perp.negate();
    cine.pos.copy(mid).addScaledVector(perp, 38).add(V(0, 26, 0));
    cine.look.copy(mid);
    cine.rate = 1.1;
    await ctx.wait(1.4);
    state.tideTarget = TIDE[litCount()];
    sound.tide(6);
    await ctx.wait(6.5);
    sound.setVoices(litCount());
    cine.active = false;
    state.busy = false;
  } else {
    await finale();
  }
}

async function finale() {
  state.done = true;
  save();
  state.rush = true;
  state.tideTarget = TIDE[5];
  sound.setVoices(5);
  sound.tide(9);
  sound.finale();
  boats.start();
  state.boatT = 0;
  cine.orbit = { c: V(lighthouse.center.x, 0, lighthouse.center.z), a: Math.atan2(camera.position.z - lighthouse.center.z, camera.position.x - lighthouse.center.x), r: 80, h: 46, speed: 0.05, lookY: 18 };
  cine.rate = 0.6;
  cine.active = true;
  await ctx.wait(15);
  showEnd();
}

function showEnd() {
  const s = Math.round(state.play);
  $("endtime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const end = $("end");
  end.classList.remove("gone");
  const dismiss = () => {
    end.classList.add("gone");
    cine.active = false;
    cine.orbit = null;
    state.busy = false;
    end.removeEventListener("pointerdown", dismiss);
  };
  setTimeout(() => end.addEventListener("pointerdown", dismiss), 1500);
}

// ---------------------------------------------------------------------------
// Save / restore

function save() {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ lit: state.lit, t: state.t, play: state.play, done: state.done, p: [player.pos.x, player.pos.y, player.pos.z] })
    );
  } catch {}
}
function load() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  } catch {
    return null;
  }
}
function applySave(s) {
  if (!s || !Array.isArray(s.lit)) return;
  state.lit = s.lit.map((v) => (v ? 1 : 0));
  state.t = Math.min(DAY_SECONDS, s.t || 0);
  state.play = s.play || 0;
  state.done = !!s.done;
  state.tide = state.tideTarget = TIDE[litCount()];
  state.lit.forEach((v, i) => {
    if (!v) return;
    beacons[i].target = beacons[i].level = 1;
    puzzles[i].restore();
  });
  if (state.done) {
    boats.start();
    state.boatT = 1;
  }
  sound.setVoices(litCount());
  updateHudLights();
  const [x, y, z] = s.p || [];
  if (Number.isFinite(x) && standAt(x, z, y) !== null) {
    player.pos.set(x, standAt(x, z, y), z);
  } else {
    // fall back to the most recent lit beacon
    const last = state.lit.lastIndexOf(1);
    if (last >= 0 && last < 4) {
      const b = beacons[last].world;
      for (let a = 0; a < 6.3; a += 0.4) {
        const px = b.x + Math.cos(a) * 3.5, pz = b.z + Math.sin(a) * 3.5;
        const g = standAt(px, pz, terrainH(px, pz));
        if (g !== null) {
          player.pos.set(px, g, pz);
          break;
        }
      }
    } else if (last === 4) player.pos.copy(lighthouse.door);
  }
}

// ---------------------------------------------------------------------------
// Title

const saved = load();
if (saved && saved.lit && (saved.lit.some(Boolean) || saved.t > 30)) {
  applySave(saved);
  const again = document.createElement("button");
  again.id = "again";
  again.setAttribute("aria-label", "Start over");
  again.style.cssText = "display:block;margin:18px auto 0;width:44px;height:44px;border-radius:50%;border:1.5px solid var(--glass-edge);background:none;opacity:.6;cursor:pointer;padding:9px";
  again.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff4dc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>';
  again.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    location.reload();
  });
  $("begin").after(again);
}
snapCamera();

function begin() {
  if (state.started) return;
  state.started = true;
  sound.start();
  $("title").classList.add("gone");
}
$("begin").addEventListener("click", begin);
$("title").addEventListener("click", (e) => {
  if (e.target.closest("#again")) return;
  begin();
});

let muted = false;
try {
  muted = localStorage.getItem("fivelights.muted") === "1";
} catch {}
function applyMute() {
  sound.setMuted(muted);
  $("waves").style.display = muted ? "none" : "";
}
applyMute();
$("mute").addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  muted = !muted;
  applyMute();
  try {
    localStorage.setItem("fivelights.muted", muted ? "1" : "0");
  } catch {}
});

// ---------------------------------------------------------------------------
// Frame

const pal = {};
const STAR_DIR = dirFrom(STAR_AZ, STAR_EL);
const lightDir = V();
let saveTimer = 0;
let last = performance.now();

function updatePlayer(dt) {
  const mv = readMove();
  const moving = !state.busy && state.started && mv.m > 0.08;
  if (moving) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let dx = fx * -mv.y + rx * mv.x, dz = fz * -mv.y + rz * mv.x;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // uphill is slower; wading is slower still
    const ahead = terrainH(player.pos.x + dx, player.pos.z + dz) - terrainH(player.pos.x, player.pos.z);
    let speed = 6.4 * mv.m / (1 + Math.max(0, ahead) * 0.5);
    if (player.pos.y < state.tide) speed *= 0.6;
    let remaining = speed * dt;
    while (remaining > 1e-4) {
      const step = Math.min(0.25, remaining);
      remaining -= step;
      const p = player.pos;
      let g = standAt(p.x + dx * step, p.z + dz * step, p.y);
      if (g !== null) p.set(p.x + dx * step, g, p.z + dz * step);
      else if ((g = standAt(p.x + dx * step, p.z, p.y)) !== null) p.set(p.x + dx * step, g, p.z);
      else if ((g = standAt(p.x, p.z + dz * step, p.y)) !== null) p.set(p.x, g, p.z + dz * step);
      else break;
    }
    const target = Math.atan2(dx, dz);
    let d = target - player.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.facing += d * Math.min(1, dt * 12);
    // camera drifts behind the walker unless the player is steering it
    if (clock - cam.lastLook > 1.2) {
      let cd = player.facing + Math.PI - cam.yaw;
      cd = Math.atan2(Math.sin(cd), Math.cos(cd));
      cam.yaw += cd * Math.min(1, dt * 0.7 * mv.m) * (Math.abs(cd) < 2.6 ? 1 : 0);
    }
  } else {
    // settle onto whatever is underfoot (e.g. after the tide drops)
    const g = groundAt(player.pos.x, player.pos.z, player.pos.y);
    if (Math.abs(g - player.pos.y) < STEP_DOWN + 0.5) player.pos.y += (g - player.pos.y) * Math.min(1, dt * 10);
  }
  player.moving += ((moving ? mv.m : 0) - player.moving) * Math.min(1, dt * 8);
  player.phase += dt * 11 * player.moving;

  const M = player.model;
  M.group.position.copy(player.pos);
  M.group.rotation.y = player.facing;
  M.body.position.y = Math.abs(Math.sin(player.phase)) * 0.12 * player.moving;
  M.body.rotation.x = player.moving * 0.12;
  M.legL.rotation.x = Math.sin(player.phase) * 0.7 * player.moving;
  M.legR.rotation.x = -Math.sin(player.phase) * 0.7 * player.moving;
  M.arm.rotation.x = -Math.sin(player.phase) * 0.35 * player.moving - 0.1;
  M.lantern.rotation.z = Math.sin(clock * 3 + player.phase) * 0.12;
  M.tail.rotation.x = 0.3 + player.moving * 0.6 + Math.sin(clock * 8) * 0.1 * player.moving;
  const wading = player.pos.y < state.tide;
  M.ripple.visible = wading;
  if (wading) {
    M.ripple.position.set(player.pos.x, state.tide + 0.03, player.pos.z);
    const s = 1 + ((clock * 0.8) % 1) * 0.8;
    M.ripple.scale.setScalar(s);
    M.ripple.material.opacity = 0.9 * (1 - ((clock * 0.8) % 1));
  }
}

function updateEnvironment(dt) {
  const f = state.t / DAY_SECONDS;
  samplePalette(f, pal);
  const night = pal.night;

  sky.uniforms.uTop.value.copy(pal.top);
  sky.uniforms.uHor.value.copy(pal.fog);
  sky.uniforms.uSun.value.copy(pal.sun);
  sky.uniforms.uSunDir.value.copy(pal.sunDir);
  sky.uniforms.uMoonDir.value.copy(pal.moonDir);
  sky.uniforms.uNight.value = night;
  sky.uniforms.uTime.value = clock;
  sky.mesh.position.copy(camera.position);
  clouds.group.position.copy(camera.position);
  star.position.copy(STAR_DIR).multiplyScalar(900).add(camera.position);
  star.material.opacity = 0.45 + 0.55 * smoothstep(0.2, 0.75, f);
  star.scale.setScalar(20 + 14 * night + Math.sin(clock * 2.3) * 1.5);

  scene.fog.color.copy(pal.fog);
  scene.fog.near = 150 - night * 70;
  scene.fog.far = 640 - night * 260;

  lightDir.copy(pal.moonDir).lerp(pal.sunDir, pal.day).normalize();
  sun.color.copy(pal.sun);
  sun.intensity = pal.sunI;
  sun.position.copy(player.pos).addScaledVector(lightDir, 120);
  sun.target.position.copy(player.pos);
  hemi.color.copy(pal.hs);
  hemi.groundColor.copy(pal.hg);
  hemi.intensity = pal.hI;
  outlineUniforms.uColor.value.copy(pal.ol);

  const U = sea.uniforms;
  U.uTide.value = state.tide;
  U.uTime.value = clock;
  U.uDeep.value.copy(pal.deep);
  U.uShallow.value.copy(pal.shal);
  U.uSun.value.copy(pal.sun);
  U.uSunDir.value.copy(pal.sunDir);
  U.uFogColor.value.copy(pal.fog);
  U.uFogNear.value = scene.fog.near;
  U.uFogFar.value = scene.fog.far;
  U.uNight.value = night;
  U.uFoam.value.setRGB(1, 0.98, 0.94).lerp(pal.shal, night * 0.45);
  sea.mesh.position.set(Math.round(camera.position.x / 20) * 20, state.tide, Math.round(camera.position.z / 20) * 20);

  for (const m of clouds.mats) {
    m.color.copy(pal.fog).lerp(pal.sun, 0.35).multiplyScalar(1.12 - night * 0.55);
  }
  gulls.mat.color.setRGB(0.98, 0.96, 0.93).multiplyScalar(1 - night * 0.7);

  const lampI = 0.6 + 7 * smoothstep(0.35, 0.9, f);
  player.model.lamp.intensity = lampI;
  player.model.lglow.material.opacity = 0.25 + 0.75 * night;
  return night;
}

function update(dt) {
  clock += dt;
  pollGamepad(dt);
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].at <= clock) {
      const fn = timers[i].fn;
      timers.splice(i, 1);
      fn();
    }
  }
  if (state.started && !document.hidden) {
    state.play += state.done ? 0 : dt;
    if (state.rush) {
      state.t += dt * Math.max(1, (DAY_SECONDS - state.t) / 7);
      if (state.t >= DAY_SECONDS) {
        state.t = DAY_SECONDS;
        state.rush = false;
      }
    } else state.t = Math.min(DAY_SECONDS, state.t + dt);
  }

  // tide eases toward its target
  const dT = state.tideTarget - state.tide;
  state.tide += Math.sign(dT) * Math.min(Math.abs(dT), dt * 0.26 * (0.35 + Math.min(1, Math.abs(dT))));

  updatePlayer(dt);
  const night = updateEnvironment(dt);

  for (const b of beacons) b.update(dt, clock, night);
  wreck.update(dt, clock, pal);
  ctx.hum = 0;
  ring.update(dt, clock, player.pos);
  obs.update(dt, clock);
  lighthouse.update(dt, clock, night);
  gulls.update(clock);
  if (state.boatT !== undefined) {
    state.boatT = Math.min(1, state.boatT + dt / 60);
    boats.update(clock, 1 - Math.pow(1 - state.boatT, 2), state.tide);
  }
  updateSparks(dt);
  pickInteractable();
  updateCamera(dt);

  sound.ambience({ wind: smoothstep(6, 26, player.pos.y), hum: ctx.hum, night });

  if (state.started && (saveTimer -= dt) <= 0) {
    saveTimer = 5;
    if (!state.busy) save();
  }
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
});

$("loading").remove();

// A small hook for automated checks; harmless for players.
window.__fivelights = { state, player, beacons, ignite, cam, camera, cine, renderer, scene, update, puzzles, interactables, activate, standAt, setTime: (s) => (state.t = s) };
