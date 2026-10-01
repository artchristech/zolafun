// A glowing light shaft between two points (used for starlight, mirror route,
// lighthouse lenses and the finale). Fog-free so it reads at night.
import * as THREE from './three.module.min.js';

const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);

export function makeBeam(color = 0xffd27a, radius = 0.08, intensity = 3, glow = 3.5) {
  const group = new THREE.Group();
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const haloM = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity * 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const core = new THREE.Mesh(geo, coreM), halo = new THREE.Mesh(geo, haloM);
  core.scale.set(radius, radius, 1); halo.scale.set(radius * glow, radius * glow, 1);
  core.frustumCulled = false; halo.frustumCulled = false;
  core.renderOrder = 4; halo.renderOrder = 4;
  group.add(core, halo);
  group.visible = false;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let len = 1;
  const api = {
    group, core, halo, progress: 0,
    setEnds(p, q) { a.copy(p); b.copy(q); group.position.copy(a); group.lookAt(b); len = a.distanceTo(b); api.setProgress(api.progress); },
    setProgress(t) {
      api.progress = t;
      group.visible = t > 0.001;
      core.scale.z = Math.max(0.001, len * t); halo.scale.z = core.scale.z;
    },
    setStrength(s) {
      coreM.color.set(color).multiplyScalar(intensity * s);
      haloM.color.set(color).multiplyScalar(intensity * 0.12 * s);
    },
  };
  return api;
}
