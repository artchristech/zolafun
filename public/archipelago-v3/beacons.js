import * as THREE from './three.module.min.js';
import { toon, toonUnique, U } from './materials.js';
import { Fire } from './fire.js';
import { groundH } from './terrain.js';

const COLUMN_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const COLUMN_FS = `uniform float uI, uNight, uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float rim = pow(abs(dot(normalize(vN), vV)), 2.0);
  float y = vUv.y;
  float fade = smoothstep(0.0, 0.04, y) * pow(1.0 - y, 1.6);
  float ripple = 0.8 + 0.2 * sin(y * 30.0 - uTime * 2.0);
  vec3 c = uColor * rim * fade * ripple * uI * (0.22 + 0.9 * uNight);
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeColumn(height, r0, r1, color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uNight: U.uNight, uTime: U.uTime, uColor: { value: new THREE.Color(color) } },
    vertexShader: COLUMN_VS, fragmentShader: COLUMN_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, height, 16, 1, true), mat);
  m.position.y = height / 2;
  m.renderOrder = 4;
  return m;
}

// Stone cairn beacon with a bronze lid. Solving its landmark's puzzle opens the lid;
// the apprentice then lights it with the lantern.
export class Beacon {
  constructor(G, index, x, z) {
    this.G = G;
    this.index = index;
    this.unlocked = false;
    this.lit = false;
    const h = groundH(x, z);
    this.base = new THREE.Vector3(x, h, z);
    this.group = new THREE.Group();
    this.group.position.copy(this.base);
    const stone = toon(0xa39b8a, { flatShading: true }), stone2 = toon(0x8a8374, { flatShading: true }), iron = toon(0x3a3431), bronze = toon(0xb9823e);
    const tiers = [[1.45, 1.25, 1.0, 0.5, stone], [1.2, 1.05, 0.9, 1.45, stone2], [1.0, 0.9, 0.6, 2.2, stone]];
    for (const [rb, rt, hh, y, m] of tiers) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, 8), m);
      c.position.y = y - 0.05; c.rotation.y = Math.random();
      c.castShadow = c.receiveShadow = true;
      this.group.add(c);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.55, 0.55, 12, 1, true), toon(0x3a3431, { side: THREE.DoubleSide }));
    bowl.position.y = 2.78; bowl.castShadow = true;
    this.group.add(bowl);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.08, 12), iron);
    bottom.position.y = 2.52; this.group.add(bottom);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), iron);
      p.position.set(Math.cos(a) * 0.95, 3.2, Math.sin(a) * 0.95);
      p.rotation.z = -Math.cos(a) * 0.35; p.rotation.x = Math.sin(a) * 0.35;
      this.group.add(p);
    }
    // lid on a hinge
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.set(-1.0, 3.06, 0);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(1.02, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), bronze);
    lid.scale.y = 0.55;
    lid.position.x = 1.0;
    lid.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bronze);
    knob.position.set(1.0, 0.58, 0);
    this.lidPivot.add(lid, knob);
    this.group.add(this.lidPivot);
    this.lidOpen = 0;

    this.fire = new Fire({ size: [1.5, 2.5], hdr: 1.8, embers: 26, halo: 5, emberHeight: 4.5, haloDay: 0.15 });
    this.fire.group.position.y = 2.85;
    this.group.add(this.fire.group);
    this.column = makeColumn(90, 0.9, 2.2, 0xffa850);
    this.column.position.y += 3.0;
    this.group.add(this.column);
    this.firePos = new THREE.Vector3(x, h + 3.6, z);

    G.scene.add(this.group);
    G.physics.addCircle(x, z, 1.5, h - 2, h + 3.3, true);
    G.lightSources.push({ pos: this.firePos, color: new THREE.Color(1.0, 0.62, 0.3), power: 140, range: 55, fire: this.fire });
    G.fires.push(this.fire);

    this.interact = G.interact.add({
      pos: new THREE.Vector3(x, h + 1.4, z), radius: 3.0, glyphY: 1.6,
      enabled: () => this.unlocked && !this.lit,
      action: () => G.lightBeacon(this),
    });
  }

  get hintPos() { return this.interact.pos; }

  unlock(instant = false) {
    if (this.unlocked) return;
    this.unlocked = true;
    if (instant) this.lidOpen = 1;
    else { this.G.audio.unlockChime(); this.G.audio.click('stone', this.base); }
  }

  light(instant = false) {
    this.lit = true;
    this.unlocked = true;
    this.fire.light(instant);
    if (instant) this.lidOpen = 1;
  }

  update(dt) {
    const target = this.unlocked ? 1 : 0;
    this.lidOpen += (target - this.lidOpen) * Math.min(1, dt * 2.5);
    this.lidPivot.rotation.z = this.lidOpen * 2.1;
    this.column.material.uniforms.uI.value = this.fire.intensity;
    this.column.visible = this.fire.intensity > 0.01;
  }
}
