// The five beacons: stone pillars with iron baskets (the great lighthouse
// supplies its own lamp position), their fires and ready-state embers.
import * as THREE from './three.module.min.js';
import { G, mat } from './geo.js';
import { Fire } from './fire.js';
import { glow } from './materials.js';
import { BEACON_XZ } from './layout.js';
import { terrainAt } from './terrain.js';
import { addCircle } from './colliders.js';

export class Beacon {
  constructor(ctx, idx, island, firePos = null) {
    this.idx = idx;
    this.state = 'dead';
    const [x, z] = BEACON_XZ[idx];
    const y = terrainAt(x, z);
    this.ground = y;
    if (!firePos) {
      const sb = ctx.sb(island);
      const stone = 0x8e877a, dark = 0x3b3632, iron = 0x2c2a2a;
      sb.add(G.cyl(1.25, 1.45, 0.5, 8), mat(x, y + 0.05, z), stone, { jitter: 0.12 });
      sb.add(G.cyl(0.95, 1.1, 0.35, 8), mat(x, y + 0.45, z), stone, { jitter: 0.12 });
      sb.add(G.cyl(0.55, 0.72, 1.5, 8), mat(x, y + 1.35, z), 0x9a9284, { jitter: 0.12 });
      sb.add(G.cyl(0.85, 0.6, 0.25, 8), mat(x, y + 2.15, z), dark);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        sb.add(G.box(0.08, 0.75, 0.08), mat(x + Math.cos(a) * 0.82, y + 2.55, z + Math.sin(a) * 0.82, 0, -a, 0.18), iron);
      }
      sb.add(G.torus(0.95, 0.05, 4, 16), mat(x, y + 2.9, z, Math.PI / 2), iron);
      for (let k = 0; k < 4; k++) sb.add(G.cyl(0.09, 0.1, 1.3, 5), mat(x, y + 2.42, z, Math.PI / 2, k * 0.8, 0.3), 0x6b4a2e);
      firePos = new THREE.Vector3(x, y + 2.35, z);
      addCircle(x, z, 1.3, y - 1, y + 3.2);
      // embers for the ready state
      this.coals = new THREE.Mesh(G.blob(0.5, 0), glow(0xff6a20, 1));
      this.coals.scale.set(1.2, 0.35, 1.2);
      this.coals.position.copy(firePos).add(new THREE.Vector3(0, 0.08, 0));
      this.coals.visible = false;
      ctx.scene.add(this.coals);
      this.interact = {
        x, y: y + 1.6, z, r: 3.2, raise: true,
        enabled: () => this.state === 'ready',
        press: () => ctx.lightBeacon(idx),
      };
      ctx.addInteract(this.interact);
    }
    this.firePos = firePos.clone();
    this.lightPos = firePos.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.fire = new Fire(ctx.scene, firePos, idx === 4 ? 1.5 : 1.9, true);
    this.crackle = null;
    this.t = Math.random() * 10;
  }
  setReady() {
    if (this.state !== 'dead') return;
    this.state = 'ready';
    if (this.coals) this.coals.visible = true;
  }
  light(instant = false) {
    this.state = 'lit';
    if (this.coals) this.coals.visible = false;
    this.fire.set(1, instant);
  }
  update(dt) {
    this.t += dt;
    this.fire.update(dt);
    if (this.coals && this.coals.visible) {
      const k = 0.7 + 0.3 * Math.sin(this.t * 2.2) * Math.sin(this.t * 0.7 + 1);
      this.coals.material.color.setRGB(1.6 * k, 0.45 * k, 0.1 * k);
    }
  }
}
