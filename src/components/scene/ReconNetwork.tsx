'use client';

/**
 * ReconNetwork — spatial intelligence graph for Recon mode.
 *
 * Real data only: nodes materialize from reconResult$ when a scan
 * completes (or streams in). Node kinds are distinguished by SHAPE, SIZE
 * and GLOW — not a rainbow of colours:
 *   domain     — large octahedron (the target)
 *   subdomain  — small spheres orbiting near the target
 *   technology — flat boxes (plates)
 *   endpoint   — tetrahedra
 *   finding    — small octahedra
 *   source     — thin rings
 *   warning    — pulsing tetrahedra (amber/red by severity — semantic)
 *
 * Nodes appear in waves (spring-in scale), seek their cluster positions
 * with damping, and lift when hovered/selected (set by the HUD store).
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldState } from '@/lib/scene-state';
import {
  reconResult$, reconToNodes, reconSelected$,
  ReconNodeDatum,
} from '@/lib/module-store';
import { damp, prefersReducedMotion } from '@/lib/visual-theme';

// Deterministic pseudo-random from id — stable layouts across renders
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

interface NodeSpec {
  datum: ReconNodeDatum;
  target: THREE.Vector3;
  seed: number;
  ring: number;
  angle: number;
  height: number;
}

const CLUSTER_COLORS: Record<ReconNodeDatum['kind'], string> = {
  domain: '#78DFFF',
  subdomain: '#9FC6D8',
  technology: '#B9C7D4',
  endpoint: '#8FB4C9',
  finding: '#7FA8BC',
  source: '#6E98AC',
  warning: '#D6AE5C',
};

export function ReconNetwork() {
  const group = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(false);
  const [specs, setSpecs] = useState<NodeSpec[]>([]);
  const specsRef = useRef<NodeSpec[]>([]);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const selectedId = useRef<string | null>(null);
  const hoverId = useRef<string | null>(null);
  const reduce = useRef(prefersReducedMotion());

  // Build node specs whenever a result lands (state update → JSX remounts
  // new nodes; the frame loop reads specsRef for zero-render animation)
  useEffect(() => {
    return reconResult$.subscribe(result => {
      if (!result) { specsRef.current = []; setSpecs([]); setVisible(false); return; }
      const nodes = reconToNodes(result).slice(0, 90); // cap for performance
      const specs: NodeSpec[] = nodes.map((datum, i) => {
        const seed = hash(datum.id);
        const ring = datum.kind === 'domain' ? 0
          : 1.6 + (hash(datum.id + 'r') * 3.4);
        const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 8 + seed * Math.PI * 2;
        return {
          datum,
          target: new THREE.Vector3(),
          seed,
          ring,
          angle,
          height: 1.2 + hash(datum.id + 'h') * 4.2,
        };
      });
      specsRef.current = specs;
      setSpecs(specs);
      setVisible(specs.length > 0);
    });
  }, []);

  useEffect(() => reconSelected$.subscribe(n => { selectedId.current = n?.id ?? null; }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ws = worldState.state;
    const active = visible && (ws === 'recon' || ws === 'research');
    if (group.current) group.current.visible = active;
    if (!active) return;

    const t = state.clock.elapsedTime;
    const center = new THREE.Vector3(0, 1.6, -1);

    for (const spec of specsRef.current) {
      const mesh = meshesRef.current.get(spec.datum.id);
      if (!mesh) continue;

      // Cluster position: domain center, subdomains inner ring, rest outer
      let r = spec.ring;
      if (spec.datum.kind === 'subdomain') r = 1.4 + spec.seed * 0.9;
      spec.target.set(
        center.x + Math.cos(spec.angle + t * 0.02) * r * 1.6,
        center.y + spec.height - 1.8,
        center.z + Math.sin(spec.angle + t * 0.02) * r,
      );

      const isSelected = selectedId.current === spec.datum.id;
      const isHovered = hoverId.current === spec.datum.id;
      const isLinked = selectedId.current != null && spec.datum.kind === 'subdomain'
        && selectedId.current.startsWith('f');
      const lift = isSelected ? 0.6 : isHovered ? 0.3 : isLinked ? 0.18 : 0;

      mesh.position.x = damp(mesh.position.x, spec.target.x, 2.2, dt);
      mesh.position.y = damp(mesh.position.y, spec.target.y + lift, 2.6, dt);
      mesh.position.z = damp(mesh.position.z, spec.target.z, 2.2, dt);

      // Wave-in scale on first appear (specs are new => scale starts 0)
      const isWarning = spec.datum.kind === 'warning';
      const pulse = isWarning && !reduce.current ? 1 + Math.sin(t * 3 + spec.seed * 9) * 0.12 : 1;
      const base = spec.datum.kind === 'domain' ? 0.5 : spec.datum.kind === 'subdomain' ? 0.16
        : spec.datum.kind === 'technology' ? 0.2 : spec.datum.kind === 'warning' ? 0.24
        : spec.datum.kind === 'source' ? 0.2 : 0.17;
      const targetScale = (base * pulse * (isSelected || isHovered ? 1.5 : 1));
      mesh.scale.setScalar(damp(mesh.scale.x, targetScale, 3.5, dt));

      // Emissive response on hover/selection
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const glow = isSelected ? 2.2 : isHovered ? 1.6 : isWarning ? 1.1 : 0.35;
      mat.emissiveIntensity = damp(mat.emissiveIntensity, glow, 5, dt);
      mesh.rotation.y += dt * (reduce.current ? 0.02 : 0.25);
    }
  });

  // Spec list lives in a ref (mutated by the store subscription, consumed
  // per-frame); specs snapshot drives JSX via React state updates instead.
  return (
    <group ref={group} visible={false}>
      {specs.map(spec => (
        <mesh
          key={spec.datum.id}
          position={[0, -10, 0]} // starts below; eases into place
          scale={0.001}
          ref={(m) => {
            if (m) meshesRef.current.set(spec.datum.id, m);
            else meshesRef.current.delete(spec.datum.id);
          }}
          onPointerOver={(e) => { e.stopPropagation(); hoverId.current = spec.datum.id; }}
          onPointerOut={() => { if (hoverId.current === spec.datum.id) hoverId.current = null; }}
          onClick={(e) => {
            e.stopPropagation();
            reconSelected$.set(spec.datum);
          }}
        >
          {spec.datum.kind === 'domain' && <octahedronGeometry args={[1, 0]} />}
          {spec.datum.kind === 'subdomain' && <sphereGeometry args={[1, 16, 16]} />}
          {spec.datum.kind === 'technology' && <boxGeometry args={[1.4, 0.5, 1]} />}
          {spec.datum.kind === 'endpoint' && <tetrahedronGeometry args={[1, 0]} />}
          {spec.datum.kind === 'finding' && <octahedronGeometry args={[1, 0]} />}
          {spec.datum.kind === 'source' && <torusGeometry args={[1, 0.18, 8, 24]} />}
          {spec.datum.kind === 'warning' && <tetrahedronGeometry args={[1.15, 0]} />}
          <meshStandardMaterial
            color={CLUSTER_COLORS[spec.datum.kind]}
            emissive={spec.datum.severity === 'critical' ? '#E56B78' : spec.datum.severity === 'high' ? '#D6AE5C' : CLUSTER_COLORS[spec.datum.kind]}
            emissiveIntensity={0.35}
            metalness={0.55}
            roughness={0.35}
          />
        </mesh>
      ))}
      {/* connection lines — rendered as one LineSegments for performance */}
      <ConnectionLines specs={specs} />
    </group>
  );
}

function ConnectionLines({ specs }: { specs: NodeSpec[] }) {
  const ref = useRef<THREE.LineSegments>(null);

  // Buffer attaches imperatively after mount — sized to the node count and
  // regrown if a larger result arrives. Nothing ref-touching during render.
  const capRef = useRef(0);
  useEffect(() => {
    const attach = () => {
      const ls = ref.current;
      if (!ls || specs.length === 0) return;
      if (capRef.current >= specs.length && ls.geometry.getAttribute('position')) return;
      const positions = new Float32Array(specs.length * 6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      ls.geometry.dispose?.();
      ls.geometry = geo;
      capRef.current = specs.length;
    };
    attach();
  }, [specs]);

  useFrame(() => {
    if (!ref.current || specs.length === 0) return;
    const attr = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute | null;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < specs.length && (i + 1) * 6 <= arr.length; i++) {
      const mesh = (ref.current.parent as THREE.Group)?.children.find(
        c => (c as THREE.Mesh).userData?.id === specs[i].datum.id) as THREE.Mesh | undefined;
      const p = mesh?.position ?? specs[i].target;
      arr[i * 6] = 0; arr[i * 6 + 1] = 1.6; arr[i * 6 + 2] = -1; // core
      arr[i * 6 + 3] = p.x; arr[i * 6 + 4] = p.y; arr[i * 6 + 5] = p.z;
    }
    attr.needsUpdate = true;
  });

  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <lineBasicMaterial color="#2E5A6E" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}
