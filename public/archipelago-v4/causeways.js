// Half-sunken stone causeways: worn slabs on piers, kerb stones with gaps,
// algae below the old waterline.
import * as THREE from './three.module.min.js';
import { CAUSEWAYS, heightAt } from './terrain.js';
import { TIDES } from './layout.js';
import { toon, xf, mergeGeoms } from './materials.js';
import { rng } from './util.js';

export function buildCausewayMeshes(scene) {
  const R = rng(808);
  const mat = toon(0xffffff, { vertexColors: true, flat: true });
  const stone = new THREE.Color(0xc2b8a4), dark = new THREE.Color(0x8c8678), algae = new THREE.Color(0x4a6a4c), c = new THREE.Color();
  for (const cw of CAUSEWAYS) {
    const parts = [];
    let acc = 0, n = 0;
    for (let i = 0; i < cw.pts.length - 1; i++) {
      const a = cw.pts[i], b = cw.pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      acc += seg;
      if (acc < 2.2) continue;
      acc = 0; n++;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const ground = heightAt(a.x, a.z);
      if (ground > cw.top + 0.25) continue;
      parts.push(xf(new THREE.BoxGeometry(3.5, 0.6, 2.15), a.x, cw.top - 0.3 - R() * 0.03, a.z, (R() - 0.5) * 0.02, yaw + (R() - 0.5) * 0.05, (R() - 0.5) * 0.02));
      // kerbs on both sides, some missing
      for (const s of [-1, 1]) {
        if (R() < 0.3) continue;
        const ox = Math.cos(yaw) * 1.72 * s, oz = -Math.sin(yaw) * 1.72 * s;
        parts.push(xf(new THREE.BoxGeometry(0.4, 0.35, 1.9), a.x + ox, cw.top - 0.05 + R() * 0.05, a.z + oz, 0, yaw + (R() - 0.5) * 0.1, 0));
      }
      if (n % 2 === 0 && ground < cw.top - 0.8) {
        const h = cw.top - 0.6 - ground + 0.6;
        parts.push(xf(new THREE.BoxGeometry(2.9, h, 1.5), a.x, ground - 0.6 + h / 2, a.z, 0, yaw, 0));
        // fallen block beside the pier
        if (R() < 0.35) parts.push(xf(new THREE.BoxGeometry(1.2, 0.8, 1.0), a.x + Math.cos(yaw) * 2.6, ground + 0.2, a.z - Math.sin(yaw) * 2.6, R(), R() * 3, R()));
      }
    }
    if (!parts.length) continue;
    const g = mergeGeoms(parts);
    const p = g.attributes.position, col = g.attributes.color;
    const oldWater = TIDES[cw.k - 1];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      c.copy(stone).lerp(dark, THREE.MathUtils.clamp((cw.top - 0.3 - y) / 1.5, 0, 1));
      if (y < oldWater) c.lerp(algae, THREE.MathUtils.clamp((oldWater - y) / 0.6, 0, 0.85));
      const j = 0.92 + ((i * 7919) % 97) / 97 * 0.16;
      col.setXYZ(i, c.r * j, c.g * j, c.b * j);
    }
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
}
