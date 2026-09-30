import * as THREE from './three.module.min.js';
import { beamMaterial, toon } from './materials.js';
import { Fire } from './fire.js';
import { rng } from './noise.js';

// When the great lighthouse is lit: light rises from every beacon, links across the sky
// into a wheel around the lighthouse, and then the fishing boats come home with lanterns.
export function buildFinale(G, beacons, docks, lhPos) {
  const F = { active: false, t: 0, done: false };
  const rand = rng(5150);
  const group = new THREE.Group();
  G.scene.add(group);
  const outer = beacons.slice(0, 4).map((b) => b.firePos.clone());
  const hub = lhPos.clone();
  const skyOf = (p, hgt) => new THREE.Vector3(p.x, hgt, p.z);
  const links = [];
  const mkTube = (curve, radius, color, delay, dur, strength = 5) => {
    const mat = beamMaterial(color, strength, { along: true });
    mat.uniforms.uReveal.value = 0;
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 8, false), mat);
    m.frustumCulled = false;
    m.visible = false;
    group.add(m);
    links.push({ m, delay, dur });
  };
  // vertical shafts from each beacon
  outer.forEach((p, i) => mkTube(new THREE.LineCurve3(p.clone(), skyOf(p, 95)), 0.7, 0xffc070, 0.2 * i, 2.0));
  mkTube(new THREE.LineCurve3(hub.clone(), skyOf(hub, 135)), 1.1, 0xffe0a0, 0.0, 2.2);
  // rim arcs linking neighbouring beacons, ordered around the lighthouse
  const order = outer.map((p, i) => [Math.atan2(p.z - hub.z, p.x - hub.x), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (let k = 0; k < order.length; k++) {
    const a = skyOf(outer[order[k]], 95), b = skyOf(outer[order[(k + 1) % order.length]], 95);
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 30;
    mkTube(new THREE.QuadraticBezierCurve3(a, mid, b), 0.55, 0xffb060, 2.4 + k * 0.5, 2.4);
  }
  // spokes into the lighthouse
  outer.forEach((p, i) => {
    const a = skyOf(p, 95), b = skyOf(hub, 135);
    const mid = a.clone().lerp(b, 0.5); mid.y += 18;
    mkTube(new THREE.QuadraticBezierCurve3(a, mid, b), 0.5, 0xfff0c0, 4.8 + i * 0.3, 2.4);
  });
  const crown = new Fire({ size: [0.01, 0.01], embers: 0, halo: 18, haloColor: 0xffe0a0, haloDay: 0.5 });
  crown.group.position.copy(skyOf(hub, 135));
  group.add(crown.group);
  G.fires.push(crown);

  // boats
  const hullM = toon(0x7a4f30, { flatShading: true, side: THREE.DoubleSide }), sailM = toon(0xf1e6cf, { side: THREE.DoubleSide, flatShading: true }), trimM = toon(0x3d6f8f);
  const boats = [];
  const dests = docks.slice();
  const nBoats = 8;
  for (let i = 0; i < nBoats; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.4, 10, 1, false, Math.PI / 2, Math.PI), hullM);
    hull.rotation.x = -Math.PI / 2; hull.scale.set(1, 1, 0.8);
    hull.position.y = 0.55;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 4.3), trimM); trim.position.y = 0.55;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 5), hullM); mast.position.set(0, 2.3, 0.5);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.8, 0.45, 0, 4.0, 0.55, 0, 0.8, -1.7], 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, sailM);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), hullM); pole.position.set(0, 1.1, -1.9); pole.rotation.x = -0.4;
    b.add(hull, trim, mast, sail, pole);
    b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const fire = new Fire({ size: [0.2, 0.34], hdr: 1.9, embers: 3, halo: 1.8, emberHeight: 0.5, emberSize: 0.04, haloDay: 0.3 });
    fire.group.position.set(0, 1.5, -2.2);
    b.add(fire.group);
    G.fires.push(fire);
    const dest = dests[i % dests.length] || [hub.x + 40, hub.z];
    const ang = Math.atan2(dest[1] - hub.z, dest[0] - hub.x) + (rand() - 0.5) * 0.9;
    const start = new THREE.Vector3(hub.x + Math.cos(ang) * 520, 0, hub.z + Math.sin(ang) * 520);
    const end = new THREE.Vector3(dest[0] + (rand() - 0.5) * 6, 0, dest[1] + (rand() - 0.5) * 6);
    b.position.copy(start);
    b.visible = false;
    group.add(b);
    boats.push({ b, fire, start, end, delay: 7 + i * 1.3 + rand() * 2, dur: 70 + rand() * 25, ph: rand() * 6 });
  }

  F.start = (instant = false) => {
    F.active = true;
    F.t = instant ? 1000 : 0;
    if (!instant) G.audio.finale();
  };
  F.update = (dt, level) => {
    if (!F.active) return;
    F.t += dt;
    for (const L of links) {
      const r = Math.max(0, Math.min(1, (F.t - L.delay) / L.dur));
      L.m.visible = r > 0;
      L.m.material.uniforms.uReveal.value = r;
    }
    if (F.t > 6.5) crown.light(); else crown.snuff();
    const tt = G.U.uTime.value;
    for (const B of boats) {
      const k = Math.max(0, Math.min(1, (F.t - B.delay) / B.dur));
      B.b.visible = F.t > B.delay;
      if (!B.b.visible) continue;
      B.fire.light(F.t > 1000);
      const e = 1 - Math.pow(1 - k, 2.2);
      B.b.position.lerpVectors(B.start, B.end, e);
      B.b.position.y = level - 0.15 + Math.sin(tt * 1.4 + B.ph) * 0.12;
      B.b.rotation.y = Math.atan2(B.end.x - B.start.x, B.end.z - B.start.z) + Math.PI;
      B.b.rotation.z = Math.sin(tt * 1.1 + B.ph) * 0.06;
    }
  };
  F.clear = () => (F.active ? Math.min(1, F.t / 6) : 0);
  return F;
}
