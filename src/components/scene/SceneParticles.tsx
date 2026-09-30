'use client';

/**
 * SceneParticles — ONE semantic particle field for the whole world.
 *
 * Behaviour is dictated by the world state (never random decoration):
 *   ambient     — slow sparse drift (idle)
 *   toward-core — particles feed the core (listening)
 *   compute     — tight orbital computation structures (thinking/system)
 *   network     — spread into data-node space (recon)
 *   construct   — hover near the CAD grid as construction points (cad)
 *   outward     — radiate from the core (speaking)
 *   calm        — nearly still, whisper-faint (memory/blueprint)
 *
 * Implementation: a single Points buffer with per-particle targets. Every
 * frame each particle eases toward its behavior-assigned target position —
 * a state change re-targets particles, producing fluid morphs (data flows
 * toward the core when Recon contracts, etc.). Counts scale with quality.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldState } from '@/lib/scene-state';
import { QUALITY, damp, prefersReducedMotion, QualityTier } from '@/lib/visual-theme';
import { micLevel$ } from '@/lib/audio-levels';

type Behavior = 'ambient' | 'toward-core' | 'compute' | 'network' | 'construct' | 'outward' | 'calm';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  seed: number;
}

interface Pool {
  particles: Particle[];
  positions: Float32Array;
  tex: THREE.Texture;
  target: THREE.Vector3;
  tmp: THREE.Vector3;
}

function makePool(count: number): Pool {
  const arr: Particle[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      pos: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 12),
      vel: new THREE.Vector3(),
      seed: Math.random(),
    });
  }
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return {
    particles: arr,
    positions: new Float32Array(count * 3),
    tex: new THREE.CanvasTexture(c),
    target: new THREE.Vector3(),
    tmp: new THREE.Vector3(),
  };
}

export function SceneParticles({ quality }: { quality: QualityTier }) {
  const count = QUALITY[quality].particles;
  const points = useRef<THREE.Points>(null);
  const behavior = useRef<Behavior>('ambient');
  const reduce = useRef(prefersReducedMotion());

  // Particle pool is an external resource — the child Points mounts with a
  // null buffer until the pool exists; the pool itself is built in an effect
  // (impure construction never runs during render).
  const poolRef = useRef<Pool | null>(null);
  const [poolReady, setPoolReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => {
      poolRef.current = makePool(count);
      setPoolReady(true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      poolRef.current?.tex.dispose();
      poolRef.current = null;
    };
  }, [count]);

  useFrame((state, dtRaw) => {
    const P = poolRef.current;
    if (!P || !points.current) return;
    const dt = Math.min(dtRaw, 0.1);
    const env = worldState.env;
    const ws = worldState.state;
    const b = env.particles;
    behavior.current = b;
    const mic = micLevel$.get();

    const t = state.clock.elapsedTime;
    const core = P.tmp.set(...env.corePos);
    const timeScale = reduce.current ? 0.35 : 1;

    const speed = b === 'compute' ? 3.4 : b === 'toward-core' ? 2.6 : b === 'outward' ? 2.2 : b === 'network' ? 1.6 : 1.1;

    const particles = P.particles;
    const target = P.target;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const s = p.seed;

      switch (b) {
        case 'toward-core': {
          // Spiral into the core
          const a = t * (0.4 + s * 0.5) + s * Math.PI * 2;
          const r = 5.5 + Math.sin(t * 0.6 + s * 9) * 1.4 - mic * 2.2;
          target.set(
            core.x + Math.cos(a) * r,
            core.y + Math.sin(t * 0.5 + s * 7) * 2.2,
            core.z + Math.sin(a) * r * 0.8,
          );
          break;
        }
        case 'compute': {
          // Tight orbital shells — computation structures
          const shell = 1.6 + (s * 3 % 2.4);
          const a = t * (0.9 + s * 0.7) + s * Math.PI * 2;
          target.set(
            core.x + Math.cos(a) * shell,
            core.y + Math.sin(a * 1.3 + s * 5) * shell * 0.5,
            core.z + Math.sin(a) * shell,
          );
          break;
        }
        case 'network': {
          // Spread into a wide data-cloud around the recon space
          target.set(
            (s * 12.9898 % 1 - 0.5) * 22,
            1.5 + (s * 7.823 % 1) * 5.5,
            (s * 3.733 % 1 - 0.5) * 14 - 1,
          );
          break;
        }
        case 'construct': {
          // Hover in loose columns above the CAD plane
          const gx = Math.round((s * 19.91 % 1 - 0.5) * 10) * 6;
          const gz = Math.round((s * 43.7 % 1 - 0.5) * 10) * 6;
          target.set(
            gx + Math.sin(t * 0.4 + s * 8) * 1.2,
            0.5 + (s * 5.7 % 1) * 14,
            gz + Math.cos(t * 0.35 + s * 6) * 1.2,
          );
          break;
        }
        case 'outward': {
          // Radiate from the core (speech pulses)
          const dir = new THREE.Vector3(Math.sin(s * 91.7), Math.sin(s * 33.3), Math.sin(s * 57.1)).normalize();
          const dist = 2.4 + ((t * (0.9 + s * 0.6) + s) % 1) * 6.5;
          target.copy(core).addScaledVector(dir, dist);
          break;
        }
        case 'calm': {
          target.set(
            p.pos.x + Math.sin(t * 0.12 + s * 10) * 0.3,
            p.pos.y + Math.cos(t * 0.1 + s * 4) * 0.18,
            p.pos.z,
          );
          break;
        }
        default: {
          // ambient — slow drift around the home volume
          target.set(
            Math.sin(t * 0.09 + s * 12) * 6.5,
            Math.sin(t * 0.07 + s * 8) * 3.2 + 0.6,
            Math.cos(t * 0.08 + s * 9) * 5 - 1,
          );
        }
      }

      // Damped seek
      p.vel.x = damp(p.vel.x, (target.x - p.pos.x) * speed, 2.2 * timeScale, dt);
      p.vel.y = damp(p.vel.y, (target.y - p.pos.y) * speed, 2.2 * timeScale, dt);
      p.vel.z = damp(p.vel.z, (target.z - p.pos.z) * speed, 2.2 * timeScale, dt);
      p.pos.addScaledVector(p.vel, dt);

      P.positions[i * 3] = p.pos.x;
      P.positions[i * 3 + 1] = p.pos.y;
      P.positions[i * 3 + 2] = p.pos.z;
    }

    if (points.current) {
      // The buffer is attached post-mount (ParticlePoints) — guard until then.
      const pos = points.current.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (pos) pos.needsUpdate = true;
      const mat = points.current.material as THREE.PointsMaterial | undefined;
      if (mat) {
        mat.opacity = damp(mat.opacity, env.particleOpacity * (mic > 0.02 && ws === 'listening' ? 1.25 : 1), 3, dt);
        mat.color.lerp(new THREE.Color(env.lightColor), 1 - Math.exp(-2 * dt));
      }
    }
  });

  // Render nothing until the pool exists — avoids flashing a bare <points>
  // whose auto-created default material would compile + dispose a program
  // inside the mount window (WebGL useProgram churn).
  if (!poolReady) return null;

  return (
    <ParticlePoints
      pointsRef={points}
      poolRef={poolRef}
    />
  );
}

/** The Points object — pool buffer is attached imperatively post-mount. */
function ParticlePoints({
  pointsRef,
  poolRef,
}: {
  pointsRef: React.RefObject<THREE.Points | null>;
  poolRef: React.RefObject<Pool | null>;
}) {
  useEffect(() => {
    // Attach the pool's position buffer + glow texture once both exist.
    const id = window.setInterval(() => {
      const pts = pointsRef.current;
      const P = poolRef.current;
      if (!pts || !P) return;
      const geo = pts.geometry;
      if (!geo.getAttribute('position')) {
        geo.setAttribute('position', new THREE.BufferAttribute(P.positions, 3));
      }
      const mat = pts.material as THREE.PointsMaterial | undefined;
      if (mat && !mat.map) mat.map = P.tex;
    }, 40);
    return () => window.clearInterval(id);
  }, [pointsRef, poolRef]);

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry />
      <pointsMaterial
        size={0.075}
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        color="#9FB4C4"
      />
    </points>
  );
}
