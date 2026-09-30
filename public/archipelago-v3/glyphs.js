import * as THREE from './three.module.min.js';

// Four carved symbols, built in the XY plane facing +Z (about 0.8m across).
export function makeGlyph(type, mat) {
  const g = new THREE.Group();
  if (type === 0) {
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.075, 6, 24), mat));
  } else if (type === 1) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.4, 3, 1), mat);
    r.rotation.z = Math.PI / 2;
    r.position.y = -0.04;
    g.add(r);
  } else if (type === 2) {
    for (const y of [-0.14, 0.14]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 0.07), mat);
      b.position.y = y;
      g.add(b);
    }
  } else {
    for (const [x, y] of [[0, 0.2], [-0.19, -0.13], [0.19, -0.13]]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12), mat);
      d.rotation.x = Math.PI / 2;
      d.position.set(x, y, 0);
      g.add(d);
    }
  }
  return g;
}
