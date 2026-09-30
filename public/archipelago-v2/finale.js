// Finale: pillars of light rise from all five beacons, arcs link them across the sky,
// the last causeway surfaces, and the fishing boats come home with their lanterns lit.
import * as THREE from './three.module.min.js';
import { Fire } from './fire.js';
import { toon, addOutline, makeGlow, globalUniforms } from './util.js';
import { state as worldState } from './world.js';
import { wrapAngle } from './math.js';

const beamVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp; }`;
const beamFrag = /* glsl */ `
  uniform float uReveal, uTime, uAlpha, uNight; uniform vec3 uColor;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    if (vUv.x > uReveal) discard;
    float edge = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(edge, 2.0);
    float flow = 0.7 + 0.3 * sin(vUv.x * 40.0 - uTime * 4.0);
    float head = smoothstep(uReveal - 0.04, uReveal, vUv.x) * 2.0;
    vec3 c = uColor * (core * 2.5 + 0.4) * flow * (1.0 + head) * (0.6 + uNight);
    gl_FragColor = vec4(c * uAlpha, 1.0);
  }`;

function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 0 }, uTime: globalUniforms.uTime, uNight: globalUniforms.uNight, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: beamVert, fragmentShader: beamFrag,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
}

const DOCKS = [
  { path: [[-460, -300], [-60, -45], [-70, 22], [-76.5, 30.5]] },
  { path: [[-420, -200], [-50, -20], [-68, 45], [-75.5, 49.5]] },
  { path: [[-380, -320], [-70, -60], [-78, 0], [-82.5, 12.5]] },
  { path: [[-300, -380], [-40, -80], [-60, 60], [-82.5, 67.5]] },
  { path: [[-470, 60], [-230, 48], [-166, 42]] },
  { path: [[-450, 200], [-220, 110], [-160, 68]] },
  { path: [[-420, -80], [-220, -10], [-160, 14]] },
];

export class Finale {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = -1;
    this.done = false;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.pillars = [];
    this.arcs = [];
    this.boats = [];
    this.built = false;
  }
  build() {
    if (this.built) return;
    this.built = true;
    const g = this.ctx.game;
    const pts = g.beacons.map((b, i) => (i === 4 ? this.ctx.lighthouse.lampPos.clone() : b.lightPos.clone()));
    this.pts = pts;
    for (const p of pts) {
      const geo = new THREE.CylinderGeometry(0.5, 0.9, 1, 12, 1, true);
      geo.translate(0, 0.5, 0);
      // re-map uv.x along height for the reveal shader
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
      const m = new THREE.Mesh(geo, beamMaterial(0xffc070));
      m.position.copy(p);
      m.scale.set(1, 160, 1);
      m.frustumCulled = false;
      this.group.add(m);
      this.pillars.push(m);
    }
    for (let i = 0; i < 5; i++) {
      const a = pts[i].clone().add(new THREE.Vector3(0, 60, 0)), b = pts[(i + 1) % 5].clone().add(new THREE.Vector3(0, 60, 0));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 70 + a.distanceTo(b) * 0.15;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.TubeGeometry(curve, 96, 0.9, 8, false);
      const m = new THREE.Mesh(geo, beamMaterial(0xffd890));
      m.frustumCulled = false;
      this.group.add(m);
      this.arcs.push(m);
    }
    // spokes from every beacon to a crown above the centre of the archipelago
    const crown = new THREE.Vector3(40, 230, 10);
    for (let i = 0; i < 5; i++) {
      const a = pts[i].clone().add(new THREE.Vector3(0, 60, 0));
      const mid = a.clone().lerp(crown, 0.5);
      mid.y += 40;
      const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, crown), 64, 0.6, 6, false);
      const m = new THREE.Mesh(geo, beamMaterial(0xffe8b0));
      m.frustumCulled = false;
      this.group.add(m);
      this.arcs.push(m);
    }
    this.crownGlow = makeGlow(0xffd080, 60, 0);
    this.crownGlow.position.copy(crown);
    this.group.add(this.crownGlow);
    // boats
    const hullMats = [0x2f5f8a, 0xb84a32, 0x3f8f6e, 0xd49a2a, 0xe8e0d0, 0x9a4a8a, 0x2f5f8a];
    DOCKS.forEach((d, i) => {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(hullMats[i], { side: THREE.DoubleSide }));
      hull.scale.set(2.6, 0.9, 1.0);
      hull.castShadow = true;
      addOutline(hull, 0.03);
      boat.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6), toon(0x5a3b26));
      mast.position.y = 2.2;
      boat.add(mast);
      const sailShape = new THREE.Shape();
      sailShape.moveTo(0, 0); sailShape.lineTo(2.2, 0); sailShape.lineTo(0, 3.6); sailShape.lineTo(0, 0);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), toon(0xf0e6d0, { side: THREE.DoubleSide }));
      sail.position.set(0.1, 0.6, 0);
      boat.add(sail);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), toon(0x3a3431));
      pole.position.set(-2.0, 0.9, 0);
      pole.rotation.z = 0.3;
      boat.add(pole);
      const fire = new Fire({ height: 0.35, width: 0.2, embers: 6, emberHeight: 0.8, emberSize: 0.04, glow: true, glowSize: 5, glowIntensity: 1.4, layers: [{ x: 0, z: 0, s: 1, seed: i }] });
      fire.group.position.set(-2.25, 1.5, 0);
      boat.add(fire.group);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.5), transparent: true, opacity: 0.35, depthWrite: false }));
      cage.position.set(-2.25, 1.68, 0);
      boat.add(cage);
      boat.visible = false;
      this.group.add(boat);
      const path = d.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
      let len = 0;
      for (let k = 1; k < path.length; k++) len += path[k].distanceTo(path[k - 1]);
      this.boats.push({ boat, fire, path, len, delay: i * 1.8 + (i % 3) * 1.2, speed: len / (62 + i * 3), s: 0, yaw: 0 });
    });
  }
  start() {
    this.build();
    this.t = 0;
  }
  setDone() {
    this.build();
    this.t = 200;
    this.done = true;
  }
  boatAt(b, s) {
    let rem = s;
    for (let k = 1; k < b.path.length; k++) {
      const seg = b.path[k].distanceTo(b.path[k - 1]);
      if (rem <= seg) {
        const p = b.path[k - 1].clone().lerp(b.path[k], rem / seg);
        const d = b.path[k].clone().sub(b.path[k - 1]).normalize();
        return { p, d };
      }
      rem -= seg;
    }
    const n = b.path.length;
    return { p: b.path[n - 1].clone(), d: b.path[n - 1].clone().sub(b.path[n - 2]).normalize() };
  }
  update(dt, time, night) {
    if (this.t < 0) return;
    const prev = this.t;
    this.t += dt;
    const t = this.t;
    const cross = (x) => prev < x && t >= x;
    const g = this.ctx.game;
    this.pillars.forEach((p, i) => {
      const s = Math.min(1, Math.max(0, (t - 1 - i * 0.5) / 2.5));
      p.material.uniforms.uReveal.value = s;
    });
    this.arcs.forEach((a, i) => {
      const start = i < 5 ? 3.5 + i * 1.3 : 9 + (i - 5) * 0.5;
      a.material.uniforms.uReveal.value = Math.min(1, Math.max(0, (t - start) / 1.6));
    });
    if (this.crownGlow) this.crownGlow.material.color.setRGB(1, 0.8, 0.5).multiplyScalar(Math.min(1, Math.max(0, (t - 11) / 3)) * 0.8);
    if (!this.done) {
      for (let i = 0; i < 5; i++) if (cross(1 + i * 0.5)) this.ctx.audio.chime(440 * Math.pow(2, [0, 4, 7, 11, 12][i] / 12), null, 0.8);
      if (cross(9.5)) { g.setTide(5); this.ctx.audio.finaleMusic(); }
      if (cross(16)) this.ctx.village.lightVillage();
      if (t > 90 && !this.done) { this.done = true; this.ctx.save(); }
    }
    for (const b of this.boats) {
      const bt = t - 11 - b.delay;
      if (bt < 0) { b.boat.visible = false; continue; }
      b.boat.visible = true;
      // ease into the dock
      const raw = bt * b.speed;
      const k = Math.min(1, raw / b.len);
      const eased = k < 0.85 ? k : 0.85 + (1 - Math.pow(1 - (k - 0.85) / 0.15, 2)) * 0.15;
      const { p, d } = this.boatAt(b, eased * b.len);
      if (!b.placed) { b.placed = true; b.yaw = Math.atan2(-d.z, d.x); }
      const bob = Math.sin(time * 1.3 + b.delay) * 0.12;
      b.boat.position.set(p.x, worldState.waterY + 0.25 + bob, p.z);
      const yaw = Math.atan2(-d.z, d.x);
      b.yaw += wrapAngle(yaw - b.yaw) * Math.min(1, dt * 2);
      b.boat.rotation.set(Math.sin(time * 1.1 + b.delay) * 0.05, b.yaw, Math.sin(time * 0.9 + b.delay) * 0.06);
      b.fire.set(1);
      b.fire.update(dt, night);
    }
  }
}
