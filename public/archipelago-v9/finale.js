// Finale: beams link across the sky, boats with lanterns come home, a wordless closing moment.
import * as THREE from './three.module.min.js';
import { toon, smooth } from './util.js';
import { boatGeometry } from './world.js';
import { ISL } from './terrain.js';

const N = 5;
export class Finale {
  constructor(scene, beacons, hud, cam) {
    this.beacons = beacons; this.hud = hud; this.cam = cam;
    this.t = -1;
    this.done = false;
    const geo = boatGeometry(true);
    const mat = toon({ vertexColors: true });
    this.glow = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = this.glow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEmit;\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.65, 0.3) * vEmit * uGlow;');
    };
    mat.customProgramCacheKey = () => 'boat';
    this.boats = new THREE.InstancedMesh(geo, mat, N);
    this.boats.castShadow = true;
    this.boats.frustumCulled = false;
    this.boats.visible = false;
    scene.add(this.boats);
    this.paths = [];
    for (let i = 0; i < N; i++) {
      const a0 = (30 + i * 30) * Math.PI / 180, a1 = (62 + i * 14) * Math.PI / 180;
      this.paths.push({
        from: new THREE.Vector3(ISL.V.x + Math.cos(a0) * 230, 0, ISL.V.z + Math.sin(a0) * 230),
        to: new THREE.Vector3(ISL.V.x + Math.cos(a1) * 45, 0, ISL.V.z + Math.sin(a1) * 45),
        delay: i * 1.6,
      });
    }
    this.dummy = new THREE.Object3D();
    this.camA = { pos: new THREE.Vector3(75, 60, 75), look: new THREE.Vector3(-20, 45, -100) };
    this.camB = { pos: new THREE.Vector3(26, 18, 92), look: new THREE.Vector3(0, 5, 34) };
    this.weight = 0;
    this.level = 0;
  }
  get active() { return this.t >= 0 && !this.done; }
  start() { this.t = 0; this.boats.visible = true; }
  // restore a completed game: beams on, boats moored
  finish() {
    this.done = true; this.t = 999;
    this.beacons.setBeams(1);
    this.boats.visible = true;
    this.placeBoats(999, 0);
    this.glow.value = 2.5;
  }
  placeBoats(t, time) {
    for (let i = 0; i < N; i++) {
      const p = this.paths[i];
      const u = smooth(0, 1, (t - 6 - p.delay) / 22);
      const pos = new THREE.Vector3().lerpVectors(p.from, p.to, u);
      pos.y = this.level + 0.05 + Math.sin(time * 1.3 + i) * 0.06;
      this.dummy.position.copy(pos);
      const d = new THREE.Vector3().subVectors(p.to, p.from);
      this.dummy.rotation.set(Math.sin(time * 1.1 + i * 2) * 0.05, Math.atan2(d.x, d.z), Math.sin(time * 0.9 + i) * 0.06);
      this.dummy.updateMatrix();
      this.boats.setMatrixAt(i, this.dummy.matrix);
    }
    this.boats.instanceMatrix.needsUpdate = true;
  }
  // returns camera script weight
  update(dt, time, level, playTime) {
    this.level = level;
    if (this.boats.visible) this.placeBoats(this.t, time);
    if (this.t < 0 || this.done) { this.weight = 0; return 0; }
    this.t += dt;
    const t = this.t;
    this.beacons.setBeams(smooth(1.5, 8, t));
    this.glow.value = 2.5;
    const k = smooth(10, 24, t);
    const pos = new THREE.Vector3().lerpVectors(this.camA.pos, this.camB.pos, k);
    const look = new THREE.Vector3().lerpVectors(this.camA.look, this.camB.look, k);
    pos.x += Math.sin(t * 0.1) * 4;
    this.cam.setScript(pos, look);
    if (t > 31 && t - dt <= 31) this.hud.closing(true, playTime);
    if (t > 41 && t - dt <= 41) this.hud.closing(false);
    this.weight = t < 42 ? smooth(0, 3, t) : 1 - smooth(42, 44.5, t);
    if (t > 44.5) { this.done = true; this.weight = 0; }
    return this.weight;
  }
}
