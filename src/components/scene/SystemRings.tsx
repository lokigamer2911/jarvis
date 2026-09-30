'use client';

/**
 * SystemRings — spatial telemetry for System mode.
 *
 * CPU / RAM / NETWORK / DISK are rings orbiting the core; each ring's spin
 * speed, pulse and brightness are driven by REAL metrics pushed from the
 * SystemDashboard collector into systemMetrics$. When a metric is
 * unavailable, the ring rests calm — never faked activity.
 *
 * Ring colours stay in the JARVIS neutral-cyan family; semantic colour
 * appears only for genuine warning levels (amber/red thresholds).
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldState } from '@/lib/scene-state';
import { systemMetrics$, SystemMetrics } from '@/lib/module-store';
import { damp, prefersReducedMotion } from '@/lib/visual-theme';

interface RingState {
  angle: number;
  activity: number; // damped 0..1 activity
}

export function SystemRings() {
  const group = useRef<THREE.Group>(null);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);
  const haloRef = useRef<THREE.Mesh>(null);
  const rings = useRef<RingState[]>([
    { angle: 0, activity: 0 },
    { angle: 1.4, activity: 0 },
    { angle: 2.8, activity: 0 },
    { angle: 4.2, activity: 0 },
  ]);
  const reduce = useRef(prefersReducedMotion());

  useEffect(() => systemMetrics$.subscribe((m: SystemMetrics | null) => {
    // metrics consumed per-frame below
    void m;
  }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ws = worldState.state;
    const active = ws === 'system';
    if (group.current) group.current.visible = active;
    if (!active) return;

    const m = systemMetrics$.get();
    const t = state.clock.elapsedTime;

    // Real activity ratios (null = unavailable = calm 0.1)
    const cpu = m?.cpu.usage != null ? Math.min(m.cpu.usage / 100, 1) : 0.1;
    const ram = m && m.memory.usagePercent > 0 ? Math.min(m.memory.usagePercent / 100, 1) : 0.1;
    const net = m?.network.online ? Math.min((m.network.downlink ?? 1) / 100, 1) : 0.05;
    const disk = m?.disk ? Math.min(m.disk.usagePercent / 100, 1) : 0.08;
    const activities = [cpu, ram, net, disk];

    for (let i = 0; i < ringRefs.current.length; i++) {
      const mesh = ringRefs.current[i];
      if (!mesh) continue;
      const R = rings.current[i];
      R.activity = damp(R.activity, activities[i] ?? 0.1, 2.5, dt);

      const radius = 1.55 + i * 0.42;
      R.angle += dt * (reduce.current ? 0.05 : 0.25 + R.activity * 1.7);
      const a = rings.current[i].angle + (i * Math.PI) / 2;

      // Rings tilt differently — a gyroscope around the core
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(
        0.45 + i * 0.3,
        a,
        0.2 + R.activity * 0.25,
      );
      mesh.scale.setScalar(radius * (1 + Math.sin(t * (1.5 + R.activity * 3)) * 0.015 * R.activity));

      const mat = mesh.material as THREE.MeshStandardMaterial;
      const warn = R.activity > 0.85 ? 1 : R.activity > 0.65 ? 0.5 : 0;
      mat.color.setRGB(
        0.55 + warn * 0.35,
        0.75 - warn * 0.18,
        0.95 - warn * 0.35,
      );
      mat.emissiveIntensity = damp(mat.emissiveIntensity, 0.3 + R.activity * 1.6, 3, dt);
    }

    if (haloRef.current) {
      const mat = haloRef.current.material as THREE.MeshBasicMaterial;
      const total = (cpu + ram + net) / 3;
      mat.opacity = damp(mat.opacity, 0.08 + total * 0.16, 2.5, dt);
      haloRef.current.rotation.y += dt * (reduce.current ? 0.02 : 0.1 + total * 0.3);
    }
  });

  return (
    <group ref={group} position={[0, 0.6, -1]} visible={false}>
      {[0, 1, 2, 3].map(i => (
        <mesh
          key={i}
          ref={(m) => { ringRefs.current[i] = m; }}
          visible={false}
        >
          <torusGeometry args={[1, 0.02 - i * 0.002, 8, 96]} />
          <meshStandardMaterial
            color="#78DFFF"
            emissive="#78DFFF"
            emissiveIntensity={0.3}
            metalness={0.7}
            roughness={0.3}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
      <mesh ref={haloRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.4, 3.3, 64]} />
        <meshBasicMaterial color="#28B8D9" transparent opacity={0.08} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}
