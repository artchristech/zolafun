// Stylised sea: depth-tinted, Wind Waker-like foam rings around shores and causeways,
// banded sun glint, lantern/beacon reflections, fog aware. Water level animates with the tide.
import * as THREE from './three.module.min.js';
import { seabedH } from './world.js';
import { globalUniforms } from './util.js';

export const HM = { minX: -220, minZ: -250, size: 520, res: 512 };

export function buildHeightTexture() {
  const { minX, minZ, size, res } = HM;
  const data = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) {
    const z = minZ + (j / (res - 1)) * size;
    for (let i = 0; i < res; i++) {
      const x = minX + (i / (res - 1)) * size;
      data[j * res + i] = THREE.DataUtils.toHalfFloat(seabedH(x, z));
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export class Water {
  constructor(scene, heightTex) {
    this.uniforms = {
      uTime: globalUniforms.uTime,
      uNight: globalUniforms.uNight,
      uHeight: { value: heightTex },
      uHM: { value: new THREE.Vector4(HM.minX, HM.minZ, HM.size, HM.size) },
      uWaterY: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSun: { value: new THREE.Color(1, 0.8, 0.6) },
      uSkyHor: { value: new THREE.Color() },
      uSkyTop: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color(0x0a4f7a) },
      uShallow: { value: new THREE.Color(0x2fc4c0) },
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 50 },
      uFogFar: { value: 600 },
      uLights: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -100, 0, 0)) },
      uAmb: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime, uWaterY;
        varying vec3 vWorld;
        varying float vViewZ;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y = uWaterY + sin(wp.x*0.08 + uTime*0.9)*0.05 + sin(wp.z*0.11 - uTime*0.7)*0.05;
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uWaterY, uNight, uFogNear, uFogFar, uAmb;
        uniform sampler2D uHeight; uniform vec4 uHM;
        uniform vec3 uSunDir, uSun, uSkyHor, uSkyTop, uDeep, uShallow, uFogColor;
        uniform vec4 uLights[8];
        varying vec3 vWorld; varying float vViewZ;
        float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 huv = (vWorld.xz - uHM.xy) / uHM.zw;
          float ground = -12.0;
          if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ground = texture2D(uHeight, huv).r;
          float depth = uWaterY - ground;
          if (depth < -0.3) discard;
          // wave normal
          float t = uTime;
          vec2 p = vWorld.xz;
          float n1 = vn(p*0.35 + vec2(t*0.25, t*0.1));
          float n2 = vn(p*0.9 - vec2(t*0.2, -t*0.3));
          vec3 N = normalize(vec3((n1-0.5)*0.5 + (n2-0.5)*0.25, 1.0, (n2-0.5)*0.5 - (n1-0.5)*0.2));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 7.0, depth));
          vec3 skyRef = mix(uSkyHor, uSkyTop, 0.35);
          vec3 col = mix(base * uAmb, skyRef, fres * 0.55);
          // banded sun glint
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 220.0);
          col += uSun * step(0.4, spec) * 2.5 * (1.0 - uNight) * step(-0.02, uSunDir.y);
          col += uSun * pow(max(dot(reflect(-V, N), uSunDir), 0.0), 18.0) * 0.35 * (1.0 - uNight);
          // lights on the water (lantern, beacons)
          vec3 warm = vec3(0.0);
          for (int i = 0; i < 8; i++) {
            vec4 L = uLights[i];
            if (L.w <= 0.0) continue;
            vec3 d = L.xyz - vWorld;
            float dist2 = dot(d.xz, d.xz);
            float fall = L.w / (1.0 + dist2 * 0.02);
            vec3 Ld = normalize(d);
            float sp = pow(max(dot(reflect(-V, N), Ld), 0.0), 24.0);
            warm += vec3(1.0, 0.55, 0.2) * (fall * 0.12 + sp * fall * 1.2);
          }
          col += warm;
          // foam: solid near shore, moving rings further out (Wind Waker style)
          float wob = vn(p*0.6 + t*0.3) * 0.25;
          float shore = 1.0 - smoothstep(0.12, 0.3, depth + wob*0.4);
          float ringPhase = fract(depth * 0.9 - t * 0.35 + wob);
          float rings = step(ringPhase, 0.1) * (1.0 - smoothstep(0.6, 2.2, depth));
          float foam = max(shore, rings * 0.85);
          vec3 foamCol = mix(vec3(1.0, 0.98, 0.93), vec3(0.45, 0.52, 0.75), uNight) * (0.6 + 0.4*uAmb);
          col = mix(col, foamCol, foam);
          // sparkles
          float sk = step(0.985, vn(p*3.0 + t*1.3)) * (1.0 - uNight) * 0.8;
          col += uSun * sk * 0.6;
          float alpha = mix(0.55, 0.97, smoothstep(0.0, 3.0, depth));
          alpha = max(alpha, foam);
          // fog
          float fogF = smoothstep(uFogNear, uFogFar, vViewZ);
          col = mix(col, uFogColor, fogF);
          alpha = mix(alpha, 1.0, fogF);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const geo = new THREE.PlaneGeometry(5000, 5000, 64, 64);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }
  update(waterY, sky, fog) {
    const u = this.uniforms;
    u.uWaterY.value = waterY;
    u.uSunDir.value.copy(sky.sunDir);
    u.uSun.value.copy(sky.cur.sun);
    u.uSkyHor.value.copy(sky.cur.hor);
    u.uSkyTop.value.copy(sky.cur.top);
    u.uFogColor.value.copy(fog.color);
    u.uFogNear.value = fog.near;
    u.uFogFar.value = fog.far;
    u.uAmb.value = 0.35 + 0.65 * (1 - sky.night);
    u.uDeep.value.setHex(0x0a4f7a).lerp(new THREE.Color(0x06183a), sky.night);
    u.uShallow.value.setHex(0x2fc4c0).lerp(new THREE.Color(0x1a3a6a), sky.night);
  }
  setLights(arr) {
    const L = this.uniforms.uLights.value;
    for (let i = 0; i < 8; i++) {
      if (i < arr.length) L[i].set(arr[i].x, arr[i].y, arr[i].z, arr[i].w);
      else L[i].w = 0;
    }
  }
}
