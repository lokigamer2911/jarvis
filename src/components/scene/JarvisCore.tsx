'use client';

/**
 * JarvisCore — the liquid-chrome core, now living INSIDE the persistent
 * world instead of owning a private canvas. Same KODE-style chrome DNA
 * (analytic studio environment, no HDR asset), but:
 *   · state colour derives from the world state (not a prop)
 *   · reacts to the real microphone level (voice energy)
 *   · glides to each world state's core position/scale with damping
 */

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { micLevel$ } from '@/lib/audio-levels';
import { damp, prefersReducedMotion } from '@/lib/visual-theme';
import { worldState, JarvisWorldState } from '@/lib/scene-state';

// ── State → one restrained energy light ───────────────────────────────────
const CORE_COLORS: Record<JarvisWorldState, string> = {
  idle: '#9FB4C4',
  listening: '#78DFFF',
  thinking: '#28B8D9',
  speaking: '#B7A9F5',
  recon: '#78DFFF',
  research: '#78DFFF',
  blueprint: '#7CC4EF',
  cad: '#C7D8E8',
  simulation: '#78DFFF',
  memory: '#B7A9F5',
  system: '#96CDF0',
  computer: '#78DFFF',
  error: '#E56B78',
};

function coreEnergy(ws: JarvisWorldState, mic: number): number {
  switch (ws) {
    case 'listening': return 0.35 + mic * 0.65;
    case 'thinking': return 0.62;
    case 'speaking': return 0.7;
    case 'recon': case 'research': return 0.5;
    case 'cad': case 'blueprint': return 0.32;
    case 'simulation': return 0.55;
    case 'system': return 0.45;
    case 'memory': return 0.4;
    case 'computer': return 0.5;
    case 'error': return 0.55;
    default: return 0.12 + mic * 0.1;
  }
}

// ── GLSL: compact 3D simplex noise (Ashima / IQ public domain) ────────────
const SIMPLEX = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

// ── Chrome environment: analytic "dark studio" reflections ────────────────
const CHROME_ENV = /* glsl */`
vec3 studioEnv(vec3 r){
  r = normalize(r);
  float key = smoothstep(0.72, 0.99, dot(r, normalize(vec3(0.15, 1.0, 0.18))));
  float fill = smoothstep(0.86, 0.995, dot(r, normalize(vec3(-0.7, 0.45, 0.25))));
  float ember = smoothstep(0.955, 0.999, dot(r, normalize(vec3(0.62, -0.28, 0.45))));
  float floorUp = smoothstep(-0.2, -0.95, r.y) * 0.07;
  float horizon = mix(0.05, 0.13, smoothstep(-0.4, 0.6, r.y));
  vec3 col = vec3(horizon);
  col += vec3(1.0, 0.98, 0.96) * key * 2.0;
  col += vec3(0.72, 0.8, 0.92) * fill * 1.05;
  // The ONE energy point — tinted by the active state, not hardcoded orange
  col += uEnvTint * ember * 3.0;
  col += vec3(0.5) * floorUp;
  return col;
}
`;

const ORB_VERT = /* glsl */`
uniform float uTime;
uniform float uEnergy;
uniform float uMic;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
varying float vFlow;
${SIMPLEX}
void main(){
  vec3 n = normalize(position);
  float t = uTime * (0.35 + uEnergy * 0.65);
  float flow = snoise(n * 1.8 + vec3(0.0, t * 0.55, t * 0.22)) * 0.6
             + snoise(n * 4.2 - vec3(t * 0.32, 0.0, t * 0.4)) * 0.18;
  vFlow = flow;
  float amp = 0.05 + uEnergy * 0.15 + uMic * 0.12;
  vec3 displaced = position + n * flow * amp;
  vNormal = normalize(normalMatrix * n);
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const ORB_FRAG = /* glsl */`
uniform vec3 uState;
uniform vec3 uEnvTint;
uniform float uEnergy;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
varying float vFlow;
${SIMPLEX}
${CHROME_ENV}
void main(){
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  vec3 r = reflect(-v, n);

  float rip = snoise(vWorld * 5.5 + vec3(0.0, uTime * 0.35, uTime * 0.2));
  r = normalize(r + n * rip * (0.05 + uEnergy * 0.05));

  vec3 env = studioEnv(r);

  float sheen = smoothstep(0.1, 0.9, vFlow) * 0.25;
  env += studioEnv(normalize(r + n * sheen * 0.5)) * 0.4;

  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  env *= mix(0.7, 1.6, fres);

  env = mix(env, env * (0.7 + uState * 0.65) + uState * 0.06, clamp(uEnergy * 0.55, 0.0, 0.5));

  vec3 col = env / (1.0 + env * 0.35);
  gl_FragColor = vec4(col, 1.0);
}
`;

const GLOW_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vPos;
void main(){
  float d = length(normalize(vPos));
  float falloff = smoothstep(1.0, 0.15, d);
  gl_FragColor = vec4(uColor, falloff * falloff * uIntensity);
}
`;

const GLOW_VERT = /* glsl */`
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// One shared uniform block — the orb and glow shaders each consume only
// the entries they declare (three.js uploads per active uniform).
interface CoreUniforms {
  uTime: { value: number };
  uEnergy: { value: number };
  uMic: { value: number };
  uState: { value: THREE.Color };
  uEnvTint: { value: THREE.Color };
  uColor: { value: THREE.Color };
  uIntensity: { value: number };
}

export function JarvisCore() {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);

  const live = useRef({
    color: new THREE.Color(CORE_COLORS.idle),
    tint: new THREE.Color('#78DFFF'),
    energy: 0.12,
    mic: 0,
    scale: 1,
  });

  // Materials + the shared uniform block are created ONCE via a lazy
  // useState initializer — stable across renders, present at first commit
  // (uniforms at first compile: no bind-then-patch, no WebGL warnings,
  // no primitive race). Uniforms are inherently mutable, so they are
  // reached through a ref for per-frame writes (compiler-safe: the ref
  // breaks the frozen-state provenance; materials themselves are only read).
  const [mats] = useState(() => {
    const uni: CoreUniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0.1 },
      uMic: { value: 0 },
      uState: { value: new THREE.Color(CORE_COLORS.idle) },
      uEnvTint: { value: new THREE.Color('#78DFFF') },
      uColor: { value: new THREE.Color(CORE_COLORS.idle) },
      uIntensity: { value: 0.1 },
    };
    return {
      uni,
      orb: new THREE.ShaderMaterial({
        vertexShader: ORB_VERT,
        fragmentShader: ORB_FRAG,
        uniforms: uni as unknown as Record<string, THREE.IUniform>,
      }),
      glow: new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: uni as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    };
  });
  const uniRef = useRef(mats.uni);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ws = worldState.state;
    const env = worldState.env;
    const mic = micLevel$.get();
    const L = live.current;
    const reduce = prefersReducedMotion();

    const energy = coreEnergy(ws, mic);
    const targetColor = CORE_COLORS[ws];

    L.energy = damp(L.energy, energy, 4, dt);
    L.mic = damp(L.mic, mic, 10, dt);
    L.color.lerp(new THREE.Color(targetColor), 1 - Math.exp(-3 * dt));
    L.tint.lerp(new THREE.Color(env.lightColor), 1 - Math.exp(-3 * dt));

    const uni = uniRef.current;
    uni.uTime.value += dt * (ws === 'idle' ? 0.5 : 1);
    uni.uEnergy.value = L.energy;
    uni.uMic.value = L.mic;
    uni.uState.value.copy(L.color);
    uni.uEnvTint.value.copy(L.tint);
    uni.uIntensity.value = damp(
      uni.uIntensity.value,
      (ws === 'idle' ? 0.09 : 0.16) + L.mic * 0.1 + L.energy * 0.05,
      4, dt,
    );
    uni.uColor.value.copy(L.color);

    if (light.current) {
      light.current.color.copy(L.color);
      light.current.intensity = 0.8 + L.mic * 1.2 + L.energy * 1.4;
    }

    // Glide the core toward the world state's position + scale
    if (group.current) {
      const [x, y, z] = env.corePos;
      const s = env.coreScale * (1 + Math.sin(performance.now() / (ws === 'idle' ? 1100 : 640)) * (0.012 + L.energy * 0.03));
      if (reduce) {
        group.current.position.set(x, y, z);
        group.current.scale.setScalar(s);
      } else {
        group.current.position.x = damp(group.current.position.x, x, 2.4, dt);
        group.current.position.y = damp(group.current.position.y, y, 2.4, dt);
        group.current.position.z = damp(group.current.position.z, z, 2.4, dt);
        L.scale = damp(L.scale, s, 2.6, dt);
        group.current.scale.setScalar(L.scale);
      }
    }
  });

  const segments = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 0) >= 8 ? 128 : 96;

  return (
    <group ref={group}>
      <pointLight ref={light} distance={30} intensity={1.2} />
      <CoreMesh mats={mats} segments={segments} />
    </group>
  );
}

/** Binds the once-created materials to the orb + glow meshes. */
function CoreMesh({
  mats,
  segments,
}: {
  mats: { orb: THREE.ShaderMaterial; glow: THREE.ShaderMaterial };
  segments: number;
}) {
  return (
    <>
      <mesh>
        <sphereGeometry args={[1, segments, segments]} />
        <primitive object={mats.orb} attach="material" />
      </mesh>
      <mesh scale={2.35}>
        <sphereGeometry args={[1, 48, 48]} />
        <primitive object={mats.glow} attach="material" />
      </mesh>
    </>
  );
}
