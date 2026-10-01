// Stone braziers. Dead -> ready (coals glow once the landmark's puzzle is
// solved) -> lit (cel fire, embers, far-visible glow).
import * as THREE from './three.module.min.js';
import { createFire, createGlow } from './fire.js';
import { toon, paint, xf, mergeGeoms } from './materials.js';
import { addCircle } from './terrain.js';

export function createBeacon(scene, x, y, z, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  const top = opts.top ?? 1.55;
  if (!opts.noBase) {
    const base = mergeGeoms([
      paint(new THREE.CylinderGeometry(1.25, 1.45, 0.35, 8).translate(0, 0.17, 0), 0x8d867c, 0.12, 3),
      paint(new THREE.CylinderGeometry(0.55, 0.8, 1.0, 8).translate(0, 0.85, 0), 0x9b948a, 0.12, 5),
      paint(new THREE.CylinderGeometry(1.0, 0.6, 0.5, 10, 1, true).translate(0, 1.55, 0), 0x7a6a58, 0.1, 9),
      paint(new THREE.TorusGeometry(1.0, 0.08, 4, 12).rotateX(Math.PI / 2).translate(0, 1.8, 0), 0x5c4a3a, 0.1, 2),
    ]);
    const m = new THREE.Mesh(base, toon(0xffffff, { vertexColors: true, flat: true }));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    addCircle(x, z, 1.15, y - 1, y + 2.2, true);
  }
  // coals
  const coalMat = new THREE.MeshToonMaterial({ color: 0x2a2220, emissive: new THREE.Color(0xff5a1a), emissiveIntensity: 0 });
  const coals = new THREE.Mesh(mergeGeoms([
    xf(new THREE.DodecahedronGeometry(0.28, 0), 0.2, 0, 0.1), xf(new THREE.DodecahedronGeometry(0.25, 0), -0.22, 0.02, 0.05),
    xf(new THREE.DodecahedronGeometry(0.3, 0), 0.0, 0.05, -0.2), xf(new THREE.DodecahedronGeometry(0.22, 0), 0.05, 0.15, 0.2),
  ]), coalMat);
  coals.position.y = top;
  coals.scale.setScalar(opts.scale ?? 1);
  group.add(coals);

  const fire = createFire({ scale: opts.scale ?? 1.4, intensity: 3.0, embers: 40, rise: 3.6 });
  fire.group.position.y = top;
  group.add(fire.group);
  const glow = createGlow(0xffa040, 2.5 * (opts.scale ?? 1), 0.016);
  glow.position.y = top + 1.2 * (opts.scale ?? 1);
  group.add(glow);

  const b = {
    group, ready: false, lit: false, readyT: 0, litT: 0,
    pos: new THREE.Vector3(x, y, z),
    flamePos: new THREE.Vector3(x, y + top + 1.0 * (opts.scale ?? 1), z),
    fire, glow, coalMat,
    setReady() { if (!b.ready) { b.ready = true; b.readyT = 0; } },
    ignite(instant = false) { b.ready = true; b.lit = true; b.litT = instant ? 10 : 0; },
    update(dt, night) {
      if (b.ready) b.readyT += dt;
      if (b.lit) b.litT += dt;
      let level = 0, coal = 0;
      if (b.lit) {
        const t = b.litT;
        level = t < 1.6 ? Math.min(1.25, (t / 1.2) * 1.25) : 1 + (0.25 * Math.exp(-(t - 1.6) * 3));
        coal = 2.5;
      } else if (b.ready) {
        level = 0.16 + Math.sin(b.readyT * 3.1) * 0.03;
        coal = 1.0 + Math.sin(b.readyT * 2.3) * 0.6;
      }
      fire.setLevel(level);
      fire.setIntensity(2.2 + night * 2.6);
      coalMat.emissiveIntensity = coal;
      glow.material.uniforms.uAmount.value = b.lit ? (0.25 + night * 1.3) * Math.min(1, b.litT) : 0;
      glow.visible = b.lit;
    },
  };
  return b;
}
