// Finale: light rises from all five beacons and links across the sky,
// then fishing boats with lanterns sail home to the village pier.
import * as THREE from './three.module.min.js';
import { makeBeam } from './beam.js';
import { createFire, createGlow } from './fire.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { rng, smoothstep, clamp } from './util.js';

function boatGeo() {
  const g = new THREE.BoxGeometry(1.6, 0.8, 4.4, 4, 2, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = z / 2.2;
    const w = 1 - Math.pow(Math.abs(t), 2.5) * (t > 0 ? 0.95 : 0.4);
    const k = 0.45 + 0.55 * (y + 0.4) / 0.8;
    p.setXYZ(i, x * w * k, y + Math.pow(Math.abs(t), 2) * 0.35, z);
  }
  g.computeVertexNormals();
  const parts = [paint(g, 0x8a5a36, 0.12),
    paint(xf(new THREE.BoxGeometry(1.2, 0.05, 2.6), 0, 0.36, -0.3), 0xd8c49a),
    paint(xf(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 5), 0, 2.1, 0.4), 0x5a4030)];
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0.45, 0, 3.7, 0.45, 0, 0.8, -1.6], 3));
  sail.computeVertexNormals();
  parts.push(paint(sail, 0xf2ead6));
  const sail2 = sail.clone(); sail2.scale(-1, 1, 1);
  parts.push(paint(sail2, 0xf2ead6));
  return mergeGeoms(parts);
}

export function buildFinale(scene) {
  const R = rng(31337);
  const vert = [], links = [], spokes = [];
  for (let i = 0; i < 5; i++) {
    const v = makeBeam(0xffe0a0, 0.35, 3.2, 5); scene.add(v.group); vert.push(v);
    const l = makeBeam(0xffd890, 0.25, 2.8, 5); scene.add(l.group); links.push(l);
    const s = makeBeam(0xfff0c8, 0.18, 2.4, 4); scene.add(s.group); spokes.push(s);
  }
  const crownGlow = createGlow(0xfff0c0, 18, 0.05);
  crownGlow.visible = false;
  scene.add(crownGlow);

  const bGeo = boatGeo();
  const bMat = toon(0xffffff, { vertexColors: true });
  const boats = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(bGeo, bMat); hull.castShadow = true;
    g.add(hull);
    const fire = createFire({ scale: 0.13, intensity: 3.5, embers: 0 });
    fire.group.position.set(0, 1.25, 1.7); fire.setLevel(1);
    g.add(fire.group);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4).translate(0, 0.9, 1.7), toon(0x3a2a20)));
    const glow = createGlow(0xffb060, 1.4, 0.006);
    glow.position.set(0, 1.4, 1.7);
    g.add(glow);
    g.visible = false;
    scene.add(g);
    boats.push({ g, glow, fire, delay: i * 3.2 + R() * 2, dur: 70 + R() * 20, seed: R() * 10, start: new THREE.Vector3(), ctrl: new THREE.Vector3(), end: new THREE.Vector3() });
  }

  const st = { active: false, t: 0 };
  let tops = [], bases = [], crown = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const api = {
    get active() { return st.active; },
    start(beaconPos, dockSlots, villageCentre, instant = false) {
      st.active = true; st.t = instant ? 200 : 0;
      bases = beaconPos.map((p) => p.clone());
      crown.set(0, 0, 0);
      bases.forEach((p) => crown.add(p));
      crown.multiplyScalar(1 / bases.length);
      crown.y = 170;
      tops = bases.map((p) => tmp.copy(p).lerp(crown, 0.18).setY(110).clone());
      vert.forEach((v, i) => v.setEnds(bases[i], tops[i]));
      links.forEach((l, i) => l.setEnds(tops[i], tops[(i + 1) % 5]));
      spokes.forEach((s, i) => s.setEnds(tops[i], crown));
      crownGlow.position.copy(crown);
      boats.forEach((b, i) => {
        const a = -Math.PI / 2 + (i - 3) * 0.22 + (R() - 0.5) * 0.1;
        const r = 420 + R() * 80;
        b.end.copy(dockSlots[i % dockSlots.length]);
        b.start.set(villageCentre.x + Math.cos(a) * r, 0, villageCentre.z + Math.sin(a) * r);
        b.ctrl.copy(b.start).lerp(b.end, 0.6).add(tmp2.set((R() - 0.5) * 60, 0, (R() - 0.5) * 60));
        b.g.visible = true;
      });
    },
    update(dt, tide, night, time) {
      if (!st.active) return;
      st.t += dt;
      const t = st.t;
      vert.forEach((v, i) => { v.setProgress(smoothstep(0, 1, clamp((t - i * 0.35) / 2.2, 0, 1))); v.setStrength(0.5 + night * 0.7); });
      links.forEach((l, i) => { l.setProgress(smoothstep(0, 1, clamp((t - 3.0 - i * 0.4) / 1.8, 0, 1))); l.setStrength(0.45 + night * 0.7); });
      spokes.forEach((s, i) => { s.setProgress(smoothstep(0, 1, clamp((t - 5.5 - i * 0.2) / 1.5, 0, 1))); s.setStrength(0.4 + night * 0.6); });
      crownGlow.visible = t > 6.5;
      crownGlow.material.uniforms.uAmount.value = clamp((t - 6.5) / 2, 0, 1) * (0.6 + night * 0.8) * (0.85 + 0.15 * Math.sin(time * 1.3));
      for (const b of boats) {
        const k = clamp((t - 8 - b.delay) / b.dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 2.2);
        const u = 1 - e;
        tmp.set(u * u * b.start.x + 2 * u * e * b.ctrl.x + e * e * b.end.x, 0, u * u * b.start.z + 2 * u * e * b.ctrl.z + e * e * b.end.z);
        const e2 = Math.min(1, e + 0.01), u2 = 1 - e2;
        tmp2.set(u2 * u2 * b.start.x + 2 * u2 * e2 * b.ctrl.x + e2 * e2 * b.end.x, 0, u2 * u2 * b.start.z + 2 * u2 * e2 * b.ctrl.z + e2 * e2 * b.end.z);
        b.g.position.set(tmp.x, tide + 0.15 + Math.sin(time * 1.3 + b.seed) * 0.12, tmp.z);
        if (k < 0.999) b.g.rotation.y = Math.atan2(tmp2.x - tmp.x, tmp2.z - tmp.z);
        b.g.rotation.z = Math.sin(time * 0.9 + b.seed) * 0.06;
        b.g.rotation.x = Math.sin(time * 1.1 + b.seed * 2) * 0.04;
        b.glow.material.uniforms.uAmount.value = 0.5 + night * 1.0;
        b.fire.setIntensity(2.5 + night * 3);
      }
    },
  };
  return api;
}
