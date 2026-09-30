import * as THREE from './three.module.min.js';

// Merges static props into one mesh per material to keep draw calls low.
export class Batcher {
  constructor() { this.groups = new Map(); }

  add(geom, matrix, material, cast = true, receive = true) {
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let g = this.groups.get(key);
    if (!g) { g = { material, cast, receive, items: [] }; this.groups.set(key, g); }
    g.items.push({ geom, matrix: matrix.clone() });
  }

  addObject(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => { if (o.isMesh) this.add(o.geometry, o.matrixWorld, o.material, o.castShadow, o.receiveShadow); });
  }

  build(parent) {
    const out = [];
    for (const g of this.groups.values()) {
      const geo = mergeGeometries(g.items);
      const m = new THREE.Mesh(geo, g.material);
      m.castShadow = g.cast; m.receiveShadow = g.receive;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

const _n = new THREE.Vector3(), _p = new THREE.Vector3(), _nm = new THREE.Matrix3();
export function mergeGeometries(items) {
  let vc = 0, ic = 0, hasColor = false;
  for (const it of items) {
    const g = it.geom;
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
    if (g.attributes.color) hasColor = true;
  }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3);
  const col = hasColor ? new Float32Array(vc * 3) : null;
  const IndexArr = vc > 65535 ? Uint32Array : Uint16Array;
  const idx = new IndexArr(ic);
  let vo = 0, io = 0;
  for (const it of items) {
    const g = it.geom, m = it.matrix;
    _nm.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal, Cc = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(m);
      pos[(vo + i) * 3] = _p.x; pos[(vo + i) * 3 + 1] = _p.y; pos[(vo + i) * 3 + 2] = _p.z;
      if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      nor[(vo + i) * 3] = _n.x; nor[(vo + i) * 3 + 1] = _n.y; nor[(vo + i) * 3 + 2] = _n.z;
      if (col) {
        if (Cc) { col[(vo + i) * 3] = Cc.getX(i); col[(vo + i) * 3 + 1] = Cc.getY(i); col[(vo + i) * 3 + 2] = Cc.getZ(i); }
        else { col[(vo + i) * 3] = 1; col[(vo + i) * 3 + 1] = 1; col[(vo + i) * 3 + 2] = 1; }
      }
    }
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo; io += g.index.count; }
    else { for (let i = 0; i < P.count; i++) idx[io + i] = i + vo; io += P.count; }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Paint a geometry a single vertex colour (for vertex-coloured merged instancing geometry).
export function paint(geom, color) {
  const c = new THREE.Color(color);
  const n = geom.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geom.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geom;
}
