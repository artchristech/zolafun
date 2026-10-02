// The five beacons: fuse, fire, light pool and the finale's sky-linking beams.
import * as THREE from './three.module.min.js';
import { Fire } from './fire.js';
import { BEACONS } from './places.js';
import { terrainH } from './terrain.js';

const FUSE_VS = `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FUSE_FS = `uniform float uProg; uniform float uTime; varying float vY;
void main(){
  float on = step(vY, uProg);
  float head = smoothstep(0.06, 0.0, abs(vY - uProg)) * step(uProg, 0.999);
  vec3 dark = vec3(0.12, 0.1, 0.09);
  vec3 hot = vec3(1.0, 0.55, 0.15) * (2.2 + sin(uTime * 9.0 + vY * 20.0) * 0.4);
  gl_FragColor = vec4(mix(dark, hot, on) + vec3(1.0, 0.8, 0.5) * head * 4.0, 1.0);
}`;

export class Beacons {
  constructor(scene, tops, sound) {
    this.sound = sound;
    this.uTime = { value: 0 };
    this.list = BEACONS.map((B, i) => {
      const top = tops[i];
      const fire = new Fire(B.great ? 1.35 : 1.25, { embers: B.great ? 40 : 30, gain: B.great ? 7 : 6, seed: i * 3.1 });
      fire.group.position.set(B.x, top + (B.great ? 0.7 : 0.15), B.z);
      scene.add(fire.group);
      const base = terrainH(B.x, B.z);
      let fuse;
      const fm = new THREE.ShaderMaterial({ uniforms: { uProg: { value: 0 }, uTime: this.uTime }, vertexShader: FUSE_VS, fragmentShader: FUSE_FS });
      if (B.great) {
        // glowing line up the side of the tower, facing the door
        const h = top - 5;
        const g = new THREE.PlaneGeometry(0.35, h, 1, 1).translate(0, h / 2, 0);
        fuse = new THREE.Mesh(g, fm);
        const a = Math.atan2(0.565, -0.825);
        const r = 3.66;
        fuse.position.set(B.x + Math.sin(a) * r, 5, B.z + Math.cos(a) * r);
        fuse.rotation.set(0, a, 0);
        fuse.rotation.order = 'YXZ';
        fuse.rotation.x = -Math.atan2(1.1, h);
      } else {
        const h = B.tower;
        const g = new THREE.BoxGeometry(0.22, h, 0.22).translate(0, h / 2, 0);
        fuse = new THREE.Mesh(g, fm);
        fuse.position.set(B.x, base, B.z + 1.42);
        fuse.rotation.x = -Math.atan2(0.52, h);
      }
      scene.add(fuse);
      const audio = sound.addFire(B.x, top + 1, B.z, B.great);
      return { B, i, top, base, fire, fuse, fm, ready: false, lit: false, prog: 0, igniting: false, audio, pos: new THREE.Vector3(B.x, top + 1.2, B.z) };
    });
    this.onLit = null;
    // finale beams
    this.apex = new THREE.Vector3(BEACONS[4].x, 120, BEACONS[4].z);
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.38).multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.beams = this.list.map((b) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 1, 8, 1, true).translate(0, 0.5, 0), bm);
      m.position.copy(b.pos);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this.ring = this.list.map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 6, 1, true).translate(0, 0.5, 0), bm);
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this.beamProg = 0;
  }

  litCount() { return this.list.filter((b) => b.lit).length; }

  ignite(i) {
    const b = this.list[i];
    if (b.lit || b.igniting) return;
    b.igniting = true;
    b.prog = 0;
  }

  setLit(i, instant) {
    const b = this.list[i];
    b.lit = true; b.ready = true; b.igniting = false; b.prog = 1;
    b.fire.set(1, instant);
    b.fm.uniforms.uProg.value = 1;
  }

  update(dt, time) {
    this.uTime.value = time;
    for (const b of this.list) {
      if (b.igniting) {
        b.prog = Math.min(1, b.prog + dt / (b.B.great ? 3.5 : 2.0));
        b.fm.uniforms.uProg.value = b.prog;
        if (b.prog >= 1) {
          b.igniting = false;
          b.lit = true;
          b.fire.set(1);
          this.sound.ignite(b.pos, b.B.great);
          if (this.onLit) this.onLit(b.i);
        }
      }
      b.fire.update(dt);
      this.sound.setFire(b.audio, b.fire.lit);
    }
  }

  // nearest lit beacons -> point light slots 1..4
  assignLights(env, from, night) {
    const lit = this.list.filter((b) => b.fire.lit > 0.02)
      .map((b) => ({ b, d: b.pos.distanceToSquared(from) }))
      .sort((a, c) => a.d - c.d);
    for (let s = 1; s <= 4; s++) {
      const L = env.points[s];
      const e = lit[s - 1];
      if (e) {
        const flick = 0.9 + Math.sin(this.uTime.value * 13 + s) * 0.05 + Math.sin(this.uTime.value * 7.3 + s * 2) * 0.05;
        L.position.copy(e.b.pos);
        L.intensity = (e.b.B.great ? 160 : 60) * e.b.fire.lit * flick * (0.35 + 0.65 * night);
        L.distance = e.b.B.great ? 110 : 60;
      } else L.intensity = 0;
    }
    this.list.forEach((b, i) => env.setPointGlow(i, b.pos.x, b.pos.y, b.pos.z, b.fire.lit * (b.B.great ? 2 : 1)));
  }

  setBeams(p) {
    this.beamProg = p;
    const n = this.list.length;
    this.list.forEach((b, i) => {
      const m = this.beams[i];
      const local = Math.max(0, Math.min(1, p * 1.6 - i * 0.12));
      m.visible = local > 0.001;
      const dir = new THREE.Vector3().subVectors(this.apex, b.pos);
      const len = dir.length();
      m.position.copy(b.pos);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      m.scale.set(1, len * local, 1);
      // ring segment linking neighbours high in the sky
      const r = this.ring[i];
      const q = Math.max(0, Math.min(1, (p - 0.55) / 0.45));
      r.visible = q > 0.001 && i < n - 1;
      if (r.visible) {
        const a = this.list[i].pos.clone().lerp(this.apex, 0.55);
        const c = this.list[(i + 1) % (n - 1)].pos.clone().lerp(this.apex, 0.55);
        const d = new THREE.Vector3().subVectors(c, a);
        r.position.copy(a);
        r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
        r.scale.set(1, d.length() * q, 1);
      }
    });
  }

  allVisible(v) { for (const m of [...this.beams, ...this.ring]) m.visible = v; }
}
