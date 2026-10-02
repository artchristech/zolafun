// Five Lights — stylised toon sea that reads depth from a baked height texture,
// so foam rings islands and washes over causeways as the tide falls.
import * as THREE from './three.module.min.js';
import { BOUNDS } from './layout.js';

export function createWater(heightTex) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uWater: { value: 2 },
    uHeight: { value: null },
    uBounds: { value: new THREE.Vector3(BOUNDS.x0, BOUNDS.z0, BOUNDS.size) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.8, 0.5) },
    uSky: { value: new THREE.Color(0.9, 0.7, 0.5) },
    uDeep: { value: new THREE.Color(0.05, 0.25, 0.4) },
    uShallow: { value: new THREE.Color(0.2, 0.7, 0.7) },
    uFoam: { value: new THREE.Color(1, 0.95, 0.85) },
    uLights: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4(0, -100, 0, 0)) },
    uLightCol: { value: new THREE.Color(1, 0.6, 0.25) },
  }]);
  uniforms.uHeight.value = heightTex;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uWater;
      uniform sampler2D uHeight;
      uniform vec3 uBounds, uSunDir, uSunCol, uSky, uDeep, uShallow, uFoam, uLightCol;
      uniform vec4 uLights[5];
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float bed(vec2 p){
        vec2 uv = (p - uBounds.xy) / uBounds.z;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -4.5;
        return texture2D(uHeight, uv).r;
      }
      void main(){
        vec2 p = vWorld.xz;
        float hb = bed(p);
        float depth = uWater - hb;
        if (depth < -0.02) discard;
        float w = sin(p.x*0.31 + uTime*0.9 + sin(p.y*0.17 + uTime*0.3)*2.0)
                + sin(p.y*0.27 - uTime*0.7 + sin(p.x*0.13)*2.0);
        vec3 n = normalize(vec3(cos(p.x*0.31+uTime*0.9)*0.08, 1.0, cos(p.y*0.27-uTime*0.7)*0.08));
        float t = clamp(depth / 4.0, 0.0, 1.0);
        t = floor(t * 4.0 + 0.5 + w * 0.08) / 4.0;
        vec3 col = mix(uShallow, uDeep, t);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);
        col = mix(col, uSky, step(0.35, fres) * 0.45 + fres * 0.2);
        vec3 R = reflect(-V, n);
        float sp = max(dot(R, normalize(uSunDir)), 0.0);
        float glint = step(0.985, sp + w * 0.006) * step(0.0, uSunDir.y + 0.05);
        col += uSunCol * glint * 1.6;
        // foam on shores and over freshly surfaced stones
        float foamEdge = 1.0 - smoothstep(0.12, 0.32 + 0.1 * sin(uTime * 1.7 + hb * 3.0 + p.x * 0.2), depth);
        float rings = step(0.86, fract(depth * 1.3 - uTime * 0.35 + w * 0.05)) * (1.0 - smoothstep(0.4, 1.6, depth));
        float foam = max(foamEdge, rings * 0.8);
        col = mix(col, uFoam, foam);
        // warm pools under burning beacons and the lantern
        for (int i = 0; i < 5; i++) {
          vec4 L = uLights[i];
          if (L.w <= 0.0) continue;
          vec2 d = p - L.xz;
          float r2 = dot(d, d);
          float pool = L.w * exp(-r2 / 260.0);
          float streak = L.w * exp(-abs(d.x * V.z - d.y * V.x) * 0.9) * exp(-sqrt(r2) / 40.0) * step(0.5, fract(w * 2.0 + sqrt(r2) * 0.5));
          col += uLightCol * (pool * 0.5 + streak * 0.35);
        }
        float alpha = mix(0.55, 0.95, smoothstep(0.0, 2.5, depth));
        alpha = max(alpha, foam);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}
