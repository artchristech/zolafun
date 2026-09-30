// The five signal beacons: dead -> primed (smouldering, ready) -> lit (roaring fire, light, embers).
import * as THREE from './three.module.min.js';
import { Fire, Smoke } from './fire.js';
import { toon, addOutline } from './util.js';
import { groundH, addCircle, addKeepOut } from './world.js';

export class Beacon {
  constructor(scene, index, x, z, opts = {}) {
    this.index = index;
    this.state = 'dead';
    const y = opts.y ?? groundH(x, z);
    this.base = new THREE.Vector3(x, y, z);
    const g = (this.group = new THREE.Group());
    g.position.copy(this.base);
    scene.add(g);
    const stone = toon(0x9c948a), dark = toon(0x2e2a28), iron = toon(0x3a3431);
    const steps = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 10), stone);
    steps.position.y = 0.1;
    steps.receiveShadow = steps.castShadow = true;
    g.add(steps);
    const h = opts.pillar ?? 3.4;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, h, 8), toon(0xb1a999));
    pillar.position.y = 0.35 + h / 2;
    pillar.castShadow = pillar.receiveShadow = true;
    addOutline(pillar, 0.04);
    g.add(pillar);
    for (const yy of [0.9, h - 0.2]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.05, 0.22, 8), toon(0x7d756a));
      band.position.y = yy;
      g.add(band);
    }
    const bowlPts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      bowlPts.push(new THREE.Vector2(0.35 + Math.sin(t * Math.PI * 0.5) * 0.95, t * 0.75));
    }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 12), iron);
    bowl.material = toon(0x3a3431, { side: THREE.DoubleSide });
    bowl.position.y = 0.35 + h;
    bowl.castShadow = true;
    addOutline(bowl, 0.03);
    g.add(bowl);
    // iron prongs
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), dark);
      p.position.set(Math.cos(a) * 1.25, 0.35 + h + 0.85, Math.sin(a) * 1.25);
      g.add(p);
    }
    // kindling logs
    const logMat = toon(0x5a3b24);
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.4, 6), logMat);
      const a = (i / 5) * Math.PI;
      log.rotation.set(Math.PI / 2 - 0.35, a, 0);
      log.position.set(0, 0.35 + h + 0.45, 0);
      g.add(log);
    }
    this.charMat = toon(0x201a18, { unique: true, emissive: new THREE.Color(0, 0, 0) });
    const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.25, 8), this.charMat);
    coal.position.y = 0.35 + h + 0.25;
    g.add(coal);
    this.topY = y + 0.35 + h + 0.35;
    this.fire = new Fire({ height: 3.0, width: 2.0, embers: 70, emberHeight: 8, emberSize: 0.12, light: true, lightIntensity: 90, lightDistance: 80, lightDecay: 1.2, glow: true, glowSize: 16, glowIntensity: 0.9 });
    this.fire.group.position.y = 0.35 + h + 0.3;
    g.add(this.fire.group);
    this.smoke = new Smoke(26, 8);
    this.smoke.points.position.y = 0.35 + h + 0.4;
    g.add(this.smoke.points);
    this.interactPos = new THREE.Vector3(x, y + 1.2, z);
    this.lightPos = new THREE.Vector3(x, this.topY + 1, z);
    addCircle(x, z, 1.25, y - 2, y + h + 2, { cam: true });
    addKeepOut(x, z, 4);
  }
  setState(s, instant = false) {
    this.state = s;
    if (s === 'dead') { this.fire.set(0, instant); this.smoke.target = 0; }
    if (s === 'primed') { this.fire.set(0.16, instant); this.smoke.target = 1; }
    if (s === 'lit') { this.fire.set(1, instant); this.smoke.target = 0; }
  }
  update(dt, night, time) {
    this.fire.update(dt, night);
    this.smoke.update(dt, night);
    const glow = this.state === 'primed' ? 0.5 + 0.3 * Math.sin(time * 3) : this.state === 'lit' ? 1.2 : 0;
    this.charMat.emissive.setRGB(glow * 1.2, glow * 0.35, glow * 0.08);
  }
}
