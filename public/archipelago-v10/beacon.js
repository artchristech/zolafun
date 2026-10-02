// A beacon: stone column with an iron brazier under a lid. The landmark's puzzle opens the lid;
// the apprentice's lantern lights it.
import * as THREE from './three.module.min.js';
import { groundH } from './ground.js';
import { mat, damp } from './util.js';

export class Beacon {
  constructor(ctx, index, x, z, { low = false, facing = 0 } = {}) {
    this.ctx = ctx;
    this.index = index;
    this.x = x;
    this.z = z;
    this.base = groundH(x, z);
    this.unlocked = false;
    this.lit = false;
    this.busy = false;
    this.lidT = 0;
    const b = ctx.batch(index);
    const y0 = this.base;
    const stone = '#b3a893', stone2 = '#978d7c', iron = '#3c3632';
    let bowlY;
    if (!low) {
      b.add(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 10), mat(x, y0 - 0.08, z), stone2, { flat: true });
      b.add(new THREE.CylinderGeometry(0.62, 0.82, 3.7, 8), mat(x, y0 + 1.95, z), stone, { flat: true });
      b.add(new THREE.CylinderGeometry(0.98, 0.72, 0.4, 8), mat(x, y0 + 3.95, z), stone2, { flat: true });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        b.add(new THREE.BoxGeometry(0.22, 3.2, 0.22), mat(x + Math.sin(a) * 0.78, y0 + 1.9, z + Math.cos(a) * 0.78, 0, a, 0), stone2, { flat: true });
      }
      bowlY = y0 + 4.4;
      ctx.col.circle(x, z, 1.0, y0 - 1, y0 + 5);
    } else {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 5), mat(x + Math.sin(a) * 0.45, y0 + 0.6, z + Math.cos(a) * 0.45, Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3), iron);
      }
      bowlY = y0 + 1.15;
      ctx.col.circle(x, z, 0.75, y0 - 1, y0 + 1.6);
    }
    const bowlR = low ? 0.75 : 1.05;
    b.add(new THREE.CylinderGeometry(bowlR, bowlR * 0.55, 0.55, 12), mat(x, bowlY - 0.1, z), iron);
    b.add(new THREE.TorusGeometry(bowlR, 0.07, 5, 14), mat(x, bowlY + 0.17, z, Math.PI / 2, 0, 0), '#5a504a');
    this.bowlY = bowlY;
    // lid on a hinge
    const lb = new THREE.SphereGeometry(bowlR * 1.04, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    lb.translate(-bowlR, 0, 0);
    const lidMat = ctx.mats.toon('#4a433e');
    this.lid = new THREE.Mesh(lb, lidMat);
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.set(x, bowlY + 0.22, z);
    this.lidPivot.rotation.y = facing;
    const hinge = new THREE.Group();
    hinge.position.x = bowlR;
    hinge.add(this.lid);
    this.lidPivot.add(hinge);
    this.hinge = hinge;
    this.lid.castShadow = true;
    ctx.scene.add(this.lidPivot);
    // fire
    this.fire = ctx.fires.create({ scale: low ? 1.0 : 1.55, glow: low ? 7 : 15 });
    this.fire.group.position.set(x, bowlY + 0.05, z);
    ctx.scene.add(this.fire.group);
    this.firePos = new THREE.Vector3(x, bowlY + 0.4, z);
    this.lightPos = new THREE.Vector3(x, bowlY + 1.4, z);
    this.interact = {
      pos: new THREE.Vector3(x, y0 + 1.3, z),
      prompt: new THREE.Vector3(x, bowlY + 0.9, z),
      reach: low ? 2.4 : 3.3,
      can: () => this.unlocked && !this.lit && !this.busy,
      press: (api) => {
        this.busy = true;
        api.raise(() => {
          this.busy = false;
          this.light();
          ctx.onBeaconLit(index);
        }, this.firePos);
      },
    };
    ctx.interact.push(this.interact);
  }
  unlock(instant = false) {
    if (this.unlocked) return;
    this.unlocked = true;
    if (instant) this.lidT = 1;
    else this.ctx.audio.clank(this.firePos, 0.9);
  }
  light(instant = false) {
    this.lit = true;
    this.unlocked = true;
    if (instant) this.lidT = 1;
    this.fire.ignite(instant);
    if (!instant) this.ctx.audio.ignite(this.firePos);
    this.ctx.audio.fireLoop(this.firePos, this.fire.scale);
  }
  update(dt) {
    this.lidT = damp(this.lidT, this.unlocked ? 1 : 0, 3, dt);
    this.hinge.rotation.z = -this.lidT * 2.1;
  }
}
