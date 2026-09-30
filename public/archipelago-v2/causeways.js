// Half-sunken stone causeways between the islands, plus the foam that washes over them as they surface.
import * as THREE from './three.module.min.js';
import { causeways, causewayProfile, causewayPoint } from './world.js';
import { toonGradient, globalUniforms, addOutline } from './util.js';
import { mulberry32 } from './math.js';

export class Causeways {
  constructor(scene) {
    const rng = mulberry32(555);
    const stones = [];
    const posts = [];
    for (const cw of causeways) {
      const rowLen = 1.5;
      const rows = Math.ceil(cw.len / rowLen);
      for (let r = 0; r <= rows; r++) {
        const s = Math.min(1, (r + 0.5) / rows);
        const p = causewayPoint(cw, s);
        const top = causewayProfile(cw, s);
        const ds = 0.01;
        const slope = (causewayProfile(cw, Math.min(1, s + ds)) - causewayProfile(cw, Math.max(0, s - ds))) / (2 * ds * cw.len);
        const yaw = Math.atan2(p.dz, p.dx);
        const lx = -Math.sin(yaw), lz = Math.cos(yaw);
        const offs = rng() < 0.5 ? [-cw.W / 4, cw.W / 4] : [-cw.W / 3, cw.W / 6];
        const widths = offs[0] === -cw.W / 4 ? [cw.W / 2, cw.W / 2] : [cw.W / 3, (cw.W * 2) / 3];
        for (let k = 0; k < 2; k++) {
          const cx = p.x + lx * offs[k], cz = p.z + lz * offs[k];
          const t = top + (rng() - 0.5) * 0.06 - 0.02;
          const bottom = -11;
          stones.push({ x: cx, z: cz, top: t, bottom, len: rowLen * (0.96 + rng() * 0.08), w: widths[k] - 0.06, yaw, pitch: Math.atan(slope), depth: cw.mid, tint: rng() });
        }
        // posts on the edges every so often
        if (r % 7 === 3) {
          for (const side of [-1, 1]) {
            if (rng() < 0.35) continue;
            const h = 0.6 + rng() * 1.4;
            posts.push({ x: p.x + lx * side * (cw.W / 2 + 0.25), z: p.z + lz * side * (cw.W / 2 + 0.25), y: top, h });
          }
        }
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // bevel-ish: shrink the top face slightly so rows read as separate stones
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      if (pa.getY(i) > 0) { pa.setX(i, pa.getX(i) * 0.94); pa.setZ(i, pa.getZ(i) * 0.94); }
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
    const im = new THREE.InstancedMesh(geo, mat, stones.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, 'YZX');
    const c = new THREE.Color();
    const dry = new THREE.Color(0xb4ab9a), wet = new THREE.Color(0x6f7a66), weed = new THREE.Color(0x4f6a4c);
    stones.forEach((s, i) => {
      const h = s.top - s.bottom;
      e.set(0, -s.yaw, s.pitch);
      q.setFromEuler(e);
      sc.set(s.len, h, s.w);
      p.set(s.x, s.bottom + h / 2, s.z);
      m.compose(p, q, sc);
      im.setMatrixAt(i, m);
      // stones that spend longer underwater are greener
      const sub = Math.min(1, Math.max(0, -s.top / 5));
      c.copy(dry).lerp(wet, sub).lerp(weed, sub * 0.4 * s.tint);
      c.offsetHSL(0, 0, (s.tint - 0.5) * 0.06);
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);

    const pg = new THREE.CylinderGeometry(0.28, 0.36, 1, 6);
    pg.translate(0, 0.5, 0);
    const pim = new THREE.InstancedMesh(pg, new THREE.MeshToonMaterial({ color: 0x9a927f, gradientMap: toonGradient() }), posts.length);
    posts.forEach((o, i) => {
      q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.2, rng() * 3, (rng() - 0.5) * 0.2));
      sc.set(1, o.h + 12, 1);
      p.set(o.x, o.y - 12, o.z);
      m.compose(p, q, sc);
      pim.setMatrixAt(i, m);
    });
    pim.instanceMatrix.needsUpdate = true;
    pim.castShadow = true;
    pim.receiveShadow = true;
    pim.computeBoundingSphere();
    scene.add(pim);

    // foam washing over each causeway
    this.foam = causeways.map((cw) => {
      const n = 520;
      const pos = new Float32Array(n * 3), seed = new Float32Array(n), side = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const s = rng();
        const pt = causewayPoint(cw, s);
        const yaw = Math.atan2(pt.dz, pt.dx);
        const lat = (rng() - 0.5) * cw.W * 1.1;
        pos[i * 3] = pt.x - Math.sin(yaw) * lat;
        pos[i * 3 + 1] = causewayProfile(cw, s);
        pos[i * 3 + 2] = pt.z + Math.cos(yaw) * lat;
        seed[i] = rng();
        side[i] = lat;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: globalUniforms.uTime, uNight: globalUniforms.uNight, uAmt: { value: 0 }, uWater: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aSeed; uniform float uTime, uAmt, uWater; varying float vA;
          void main(){
            float ph = fract(uTime * (0.35 + aSeed*0.3) + aSeed * 7.0);
            vec3 p = position;
            float wet = 1.0 - smoothstep(0.0, 0.9, abs(p.y - uWater + 0.1));
            p.y = max(p.y, uWater) + sin(ph * 3.14159) * 0.5 * uAmt + 0.05;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vA = sin(ph * 3.14159) * wet * uAmt;
            gl_PointSize = (0.35 + ph * 0.5) * (300.0 / max(-mv.z, 0.5));
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; uniform float uNight;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vA < 0.02) discard;
            gl_FragColor = vec4(mix(vec3(1.0), vec3(0.55, 0.62, 0.85), uNight), vA * 0.9 * step(d, 0.45)); }`,
        transparent: true, depthWrite: false,
      });
      const pts = new THREE.Points(g, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts, mat, cw, amt: 0 };
    });
  }
  update(dt, waterY) {
    for (const f of this.foam) {
      // foam is strongest while the water level is near the causeway's lowest stones
      const near = 1 - Math.min(1, Math.abs(waterY - f.cw.mid) / 1.2);
      const target = Math.max(0, near) * 1.0 + 0.15;
      f.amt += (target - f.amt) * Math.min(1, dt * 1.5);
      f.mat.uniforms.uAmt.value = f.amt;
      f.mat.uniforms.uWater.value = waterY;
    }
  }
}
