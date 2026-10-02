// Five Lights — beacon braziers: dormant, smouldering (puzzle solved), burning.
import * as THREE from './three.module.min.js';
import { Builder, vtoon } from './util.js';
import { Fire } from './fire.js';
import { addCircle } from './colliders.js';

let mat = null;
export class Beacon {
  // base: ground height; plinth: pedestal height
  constructor(scene, x, z, base, opts = {}) {
    mat = mat || vtoon();
    const b = new Builder();
    const ph = opts.plinth ?? 1.6;
    if (!opts.bare) {
      b.cyl(1.5, 1.8, 0.5, 8, 0x8d8679, x, base + 0.25, z);
      b.cyl(0.9, 1.25, ph, 8, 0x9f978a, x, base + 0.5 + ph / 2, z);
      b.cyl(1.25, 1.0, 0.25, 8, 0x8d8679, x, base + 0.5 + ph + 0.12, z);
      const top = base + 0.75 + ph;
      // iron basket
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.box(0.08, 1.0, 0.08, 0x2e2a28, x + Math.cos(a) * 0.95, top + 0.45, z + Math.sin(a) * 0.95, -a, 0, 0.32 * 1);
      }
      b.add(new THREE.TorusGeometry(1.15, 0.06, 4, 12), 0x2e2a28, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, top + 0.9, z));
      b.add(new THREE.TorusGeometry(0.75, 0.06, 4, 12), 0x2e2a28, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, top + 0.1, z));
      // kindling
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05;
        b.box(0.12, 0.12, 1.2, 0x5b3d26, x + Math.cos(a) * 0.2, top + 0.25 + (i % 2) * 0.12, z + Math.sin(a) * 0.2, a);
      }
      this.mesh = b.build(mat);
      scene.add(this.mesh);
      addCircle(x, z, 1.5, base - 1, top + 1);
      this.top = new THREE.Vector3(x, top + 0.3, z);
    } else {
      this.top = new THREE.Vector3(x, base, z);
    }
    this.fire = new Fire(opts.size || 2.4);
    this.fire.group.position.copy(this.top);
    scene.add(this.fire.group);
    this.coals = new Fire(0.55, { hot: 0.55 });
    this.coals.group.position.copy(this.top);
    scene.add(this.coals.group);
    this.state = 0; // 0 dormant, 1 ready, 2 lit
    this.lightPos = this.top.clone().add(new THREE.Vector3(0, 1.4, 0));
  }
  setState(s, instant = false) {
    this.state = s;
    this.coals.lit = s === 1;
    this.fire.lit = s === 2;
    if (instant) { this.coals.snap(); this.fire.snap(); }
  }
  update(dt) {
    this.fire.update(dt, 0.6);
    this.coals.update(dt, 1);
  }
}
