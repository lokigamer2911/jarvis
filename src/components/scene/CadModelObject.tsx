'use client';

/**
 * CadModelObject — the physical model inside the persistent world.
 *
 * REAL geometry from lib/cad (same TriSoup the STL export uses). The JARVIS
 * interface stays cyan; the model keeps its own engineering identity
 * (dark metal surfaces — never force-tinted by the UI accent).
 *
 * Presentation modes (realistic/wireframe/technical/xray/exploded/section/
 * blueprint) are damped material/opacity/edge transitions — the transition
 * itself communicates the mode change. Construction animation builds the
 * model from wireframe → solids as cadBuildProgress$ advances 0→1.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildShapeMesh } from '@/lib/cad';
import {
  cadModel$, cadPresentation$, cadSection$, cadBuildProgress$,
  CadPresentation,
} from '@/lib/module-store';
import { worldState } from '@/lib/scene-state';
import { damp, prefersReducedMotion, QualityTier } from '@/lib/visual-theme';

interface PartEntry {
  geo: THREE.BufferGeometry;
  center: THREE.Vector3;
  explodeDir: THREE.Vector3;
  index: number;
}

// Model materials — engineering identity, independent of the UI accent
const BODY_COLOR = '#3A4148';
const BODY_EMISSIVE = new THREE.Color('#10161C');

export function CadModelObject({ quality }: { quality: QualityTier }) {
  const group = useRef<THREE.Group>(null);
  const partsRef = useRef<PartEntry[]>([]);
  const live = useRef({
    build: 1, explode: 0, section: 0.5,
    solidOpacity: 0.95, wireOpacity: 0, edgeOpacity: 0, xray: 0, blueprint: 0,
  });
  const reduce = useRef(prefersReducedMotion());

  const segments = quality === 'low' ? 24 : quality === 'medium' ? 40 : 56;

  // Mesh registries — rebuilt when the model changes. Parts snapshot is
  // React state (drives JSX); partsRef stays the per-frame source of truth.
  const partMeshes = useRef<Map<number, THREE.Mesh>>(new Map());
  const partWires = useRef<Map<number, THREE.LineSegments>>(new Map());
  const partEdges = useRef<Map<number, THREE.LineSegments>>(new Map());
  const [partsSnapshot, setPartsSnapshot] = useState<PartEntry[]>([]);
  const [version, setVersion] = useState(0);

  void segments;

  // Rebuild part geometries when the model changes
  const modelVersion = useRef(0);
  useEffect(() => {
    return cadModel$.subscribe(model => {
      if (!model) { partsRef.current = []; return; }
      const parts: PartEntry[] = model.shapes.map((s, i) => {
        const soup = buildShapeMesh(s);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(soup.positions, 3));
        geo.computeVertexNormals();
        const center = new THREE.Vector3(
          s.position.x, s.position.y + (s.params.height ?? 0) * 0.5, s.position.z,
        );
        // Explode along the part's offset from assembly centroid
        const dir = center.clone().sub(new THREE.Vector3(0, center.y * 0.4, 0));
        if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
        return { geo, center: center.clone(), explodeDir: dir.normalize(), index: i };
      });
      partsRef.current = parts;
      modelVersion.current++;
      setPartsSnapshot(parts);
      setVersion(modelVersion.current);
    });
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ws = worldState.state;
    const active = ws === 'cad' || ws === 'blueprint' || ws === 'simulation';
    if (group.current) group.current.visible = active;
    if (!active) return;

    const L = live.current;
    const mode: CadPresentation = cadPresentation$.get();
    L.build = damp(L.build, cadBuildProgress$.get(), 3, dt);
    L.explode = damp(L.explode, mode === 'exploded' ? 1 : 0, reduce.current ? 8 : 3.2, dt);
    L.section = damp(L.section, cadSection$.get(), 4, dt);

    // Mode targets
    const wantWire = mode === 'wireframe' || mode === 'blueprint';
    const wantEdges = mode === 'technical' || mode === 'blueprint' || mode === 'section';
    const wantXray = mode === 'xray';
    const wantGhost = mode === 'blueprint';

    L.solidOpacity = damp(L.solidOpacity, wantGhost ? 0.08 : wantXray ? 0.28 : 0.95, 3.5, dt);
    L.wireOpacity = damp(L.wireOpacity, wantWire ? 0.85 : 0, 3.5, dt);
    L.edgeOpacity = damp(L.edgeOpacity, wantEdges ? 0.7 : 0, 3.5, dt);

    const t = state.clock.elapsedTime;

    for (const part of partsRef.current) {
      const mesh = partMeshes.current.get(part.index);
      const wire = partWires.current.get(part.index);
      if (mesh) {
        // Explode: separate along meaningful local axes with spring return
        const pos = part.center.clone().addScaledVector(part.explodeDir, L.explode * 9);
        // Build-up: rise from below while constructing
        pos.y -= (1 - L.build) * 14;
        mesh.position.lerp(pos, 1 - Math.exp(-6 * dt));
        // Section: hide geometry above the plane
        mesh.visible = !(mode === 'section' && part.center.y > L.section * 24);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = L.solidOpacity;
        mat.transparent = L.solidOpacity < 0.98;
        mat.depthWrite = L.solidOpacity > 0.5;
        void t;
      }
      if (wire) {
        wire.position.copy(mesh?.position ?? part.center);
        (wire.material as THREE.LineBasicMaterial).opacity = L.wireOpacity;
        wire.visible = L.wireOpacity > 0.01;
      }
      const edge = partEdges.current.get(part.index);
      if (edge) {
        edge.position.copy(mesh?.position ?? part.center);
        (edge.material as THREE.LineBasicMaterial).opacity = L.edgeOpacity;
        edge.visible = L.edgeOpacity > 0.01;
      }
    }
  });

  return (
    <group ref={group} visible={false} position={[0, 0, 0]}>
      {partsSnapshot.map(part => (
        <group key={`${part.index}-${version}`}>
          <mesh
            geometry={part.geo}
            ref={(m) => { if (m) partMeshes.current.set(part.index, m); }}
            castShadow={false}
          >
            <meshStandardMaterial
              color={BODY_COLOR}
              emissive={BODY_EMISSIVE}
              emissiveIntensity={0.4}
              metalness={0.62}
              roughness={0.38}
              transparent
              opacity={0.95}
            />
          </mesh>
        </group>
      ))}
      <PartOverlays
        wires={partWires}
        edges={partEdges}
        version={version}
        parts={partsSnapshot}
      />
    </group>
  );
}

/** Wireframe + edge overlays are lines sharing each part's transform. */
function PartOverlays({ wires, edges, version, parts }: {
  wires: React.RefObject<Map<number, THREE.LineSegments>>;
  edges: React.RefObject<Map<number, THREE.LineSegments>>;
  version: number;
  parts: PartEntry[];
}) {
  return (
    <>
      {parts.map(part => (
        <group key={`ov-${part.index}-${version}`}>
          <lineSegments
            ref={(l) => { if (l) wires.current?.set(part.index, l); }}
            visible={false}
          >
            <wireframeGeometry args={[part.geo]} />
            <lineBasicMaterial color="#7FB8CC" transparent opacity={0} depthWrite={false} />
          </lineSegments>
          <lineSegments
            ref={(l) => { if (l) edges.current?.set(part.index, l); }}
            visible={false}
          >
            <edgesGeometry args={[part.geo, 24]} />
            <lineBasicMaterial color="#9FDCEF" transparent opacity={0} depthWrite={false} />
          </lineSegments>
        </group>
      ))}
    </>
  );
}
