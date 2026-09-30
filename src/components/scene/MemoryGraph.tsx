'use client';

/**
 * MemoryGraph — spatial knowledge graph for Memory mode.
 *
 * Real memories flow in from memoryGraphData$ (typed, tagged). Nodes
 * cluster by type; importance drives size, recency drives brightness.
 * Selecting a node (click in 3D) lifts + illuminates it. Everything
 * eases — no snapping. Reduced-motion disables drift.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldState } from '@/lib/scene-state';
import { memoryGraphData$ } from '@/lib/memory-bridge';
import { damp, prefersReducedMotion } from '@/lib/visual-theme';

export const memorySelected$ = { current: null as string | null };

const TYPE_COLORS: Record<string, string> = {
  conversation: '#8FB4C9',
  command: '#B9C7D4',
  pattern: '#9FDCEF',
  preference: '#7FA8BC',
  error: '#E56B78',
  discovery: '#78DFFF',
};

const TYPE_CLUSTERS: Record<string, THREE.Vector3> = {
  conversation: new THREE.Vector3(-3.2, 0.8, -0.5),
  command: new THREE.Vector3(0, 1.2, -1.2),
  pattern: new THREE.Vector3(3.1, 0.6, -0.8),
  preference: new THREE.Vector3(-1.6, -0.4, 1.1),
  error: new THREE.Vector3(1.8, -0.2, 1.4),
  discovery: new THREE.Vector3(0.2, 2.2, 0.6),
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

interface MemSpec {
  id: string;
  type: string;
  importance: number;
  ts: number;
  seed: number;
  target: THREE.Vector3;
}

export function MemoryGraph() {
  const group = useRef<THREE.Group>(null);
  const [specs, setSpecs] = useState<MemSpec[]>([]);
  const meshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const selected = useRef<string | null>(null);
  const reduce = useRef(prefersReducedMotion());

  // Data subscription — rebuild specs when new memory lists land
  useEffect(() => {
    return memoryGraphData$.subscribe(list => {
      const next: MemSpec[] = list.slice(0, 120).map(m => {
        const seed = hash(m.id);
        const cluster = TYPE_CLUSTERS[m.type] ?? TYPE_CLUSTERS.command;
        return {
          id: m.id,
          type: m.type,
          importance: m.importance,
          ts: m.timestamp,
          seed,
          target: cluster.clone().add(new THREE.Vector3(
            (hash(m.id + 'x') - 0.5) * 2.6,
            (hash(m.id + 'y') - 0.5) * 1.8,
            (hash(m.id + 'z') - 0.5) * 2.2,
          )),
        };
      });
      setSpecs(next);
    });
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ws = worldState.state;
    const active = ws === 'memory';
    if (group.current) group.current.visible = active;
    if (!active) return;

    const t = state.clock.elapsedTime;

    for (const spec of specs) {
      const mesh = meshes.current.get(spec.id);
      if (!mesh) continue;
      const isSel = selected.current === spec.id;
      const drift = reduce.current ? 0 : Math.sin(t * 0.5 + spec.seed * 12) * 0.06;
      mesh.position.set(
        damp(mesh.position.x, spec.target.x + drift, 2, dt),
        damp(mesh.position.y, spec.target.y + (isSel ? 0.5 : 0), 2.6, dt),
        damp(mesh.position.z, spec.target.z, 2, dt),
      );
      const base = 0.06 + spec.importance * 0.02;
      mesh.scale.setScalar(damp(mesh.scale.x, base * (isSel ? 1.9 : 1), 3, dt));
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const recent = Math.max(0, 1 - (Date.now() - spec.ts) / (1000 * 60 * 60 * 24 * 7));
      mat.emissiveIntensity = damp(mat.emissiveIntensity, isSel ? 2.4 : 0.25 + recent * 0.8, 3, dt);
      mesh.rotation.y += dt * 0.2;
    }
    void state;
  });

  const geoSphere = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);

  return (
    <group ref={group} visible={false} position={[0, 0.4, -0.5]}>
      {specs.map(spec => (
        <mesh
          key={spec.id}
          geometry={geoSphere}
          position={[0, -9, 0]}
          scale={0.001}
          ref={(m) => {
            if (m) meshes.current.set(spec.id, m);
            else meshes.current.delete(spec.id);
          }}
          onClick={(e) => { e.stopPropagation(); memorySelected$.current = spec.id; }}
        >
          <meshStandardMaterial
            color={TYPE_COLORS[spec.type] ?? '#8FB4C9'}
            emissive={TYPE_COLORS[spec.type] ?? '#8FB4C9'}
            emissiveIntensity={0.3}
            transparent
            opacity={0.88}
          />
        </mesh>
      ))}
    </group>
  );
}
