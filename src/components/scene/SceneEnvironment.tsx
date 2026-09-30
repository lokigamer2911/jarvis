'use client';

/**
 * SceneEnvironment — lighting, the environmental grid, and the scan ring.
 *
 * · Lighting: ambient + key + rim, colours/intensities damped toward the
 *   world state's values (the world visibly re-lights during transitions).
 * · Grid: a real perspective grid plane under the environment. Its opacity
 *   follows the state's `grid` factor — technical in CAD/blueprint,
 *   nearly absent at home, gone in voice focus.
 * · ScanRing: emerges when a recon scan runs, expands during phases, and
 *   collapses when the scan completes. Driven by reconScanning$ — no fake
 *   looping animation.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { worldState } from '@/lib/scene-state';
import { COLORS, damp, prefersReducedMotion } from '@/lib/visual-theme';
import { reconScanning$, reconPhase$ } from '@/lib/module-store';
import { mouse } from '@/lib/world-input';

export function SceneLighting() {
  const key = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const live = useRef({ color: new THREE.Color(COLORS.bg2), intensity: 1 });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const env = worldState.env;
    const target = new THREE.Color(env.lightColor);
    live.current.color.lerp(target, 1 - Math.exp(-2.5 * dt));
    live.current.intensity = damp(live.current.intensity, env.lightIntensity, 2.5, dt);
    if (key.current) {
      key.current.color.copy(live.current.color);
      key.current.intensity = live.current.intensity * 1.15;
    }
    if (rim.current) {
      rim.current.color.copy(live.current.color);
      rim.current.intensity = live.current.intensity * 0.5;
    }
    if (amb.current) amb.current.intensity = 0.3 + live.current.intensity * 0.1;
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.35} />
      <directionalLight ref={key} position={[6, 10, 4]} intensity={1.1} />
      <directionalLight ref={rim} position={[-6, 4, -6]} intensity={0.5} />
    </>
  );
}

/** Environmental perspective grid — an object in the world, not CSS. */
export function SceneGrid({ homeY = -2.2, cadY = 0 }: { homeY?: number; cadY?: number }) {
  const homeGrid = useRef<THREE.GridHelper>(null);
  const cadGrid = useRef<THREE.GridHelper>(null);
  const matHome = useRef<THREE.Material>(null);
  const matCad = useRef<THREE.Material>(null);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const env = worldState.env;
    const ws = worldState.state;
    const g = env.grid;
    // Home grid fades with global factor; CAD grid only in engineering modes
    const cadActive = ws === 'cad' || ws === 'blueprint' || ws === 'simulation';
    if (matHome.current) {
      (matHome.current as THREE.MeshBasicMaterial).opacity = damp(
        (matHome.current as THREE.MeshBasicMaterial).opacity, g * 0.4, 3, dt);
    }
    if (matCad.current) {
      (matCad.current as THREE.MeshBasicMaterial).opacity = damp(
        (matCad.current as THREE.MeshBasicMaterial).opacity, cadActive ? 0.55 : 0, 3, dt);
    }
    if (homeGrid.current) {
      homeGrid.current.visible = (matHome.current as THREE.MeshBasicMaterial)?.opacity > 0.01;
      const [x, y, z] = env.corePos;
      homeGrid.current.position.y = damp(homeGrid.current.position.y, homeY + y * 0.2, 2, dt);
    }
    if (cadGrid.current) {
      cadGrid.current.visible = (matCad.current as THREE.MeshBasicMaterial)?.opacity > 0.01;
    }
  });

  return (
    <group>
      <gridHelper ref={homeGrid} args={[60, 60, '#3A4A5A', '#222C38']} position={[0, homeY, 0]}>
        <meshBasicMaterial ref={matHome} transparent opacity={0.05} depthWrite={false} side={THREE.DoubleSide} />
      </gridHelper>
      <gridHelper ref={cadGrid} args={[400, 80, '#2E3E4E', '#1A242E']} position={[0, cadY, 0]}>
        <meshBasicMaterial ref={matCad} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </gridHelper>
    </group>
  );
}

/** Scanning ring — recon phase choreography. */
export function ScanRing() {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const live = useRef({ presence: 0, radius: 1 });
  const phaseSub = useRef<number>(0);

  useEffect(() => {
    const offScan = reconScanning$.subscribe(v => {
      if (v) phaseSub.current = 0;
    });
    const offPhase = reconPhase$.subscribe(() => { phaseSub.current++; });
    return () => { offScan(); offPhase(); };
  }, []);

  const uniformsRef = useRef<{ uOpacity: { value: number }; uColor: { value: THREE.Color } } | null>(null);
  if (uniformsRef.current === null) {
    uniformsRef.current = { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#78DFFF') } };
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ws = worldState.state;
    const scanning = reconScanning$.get();
    const inRecon = ws === 'recon' || ws === 'research';
    const target = scanning && inRecon ? 1 : 0;
    const L = live.current;
    const reduce = prefersReducedMotion();

    L.presence = damp(L.presence, target, 2.2, dt);
    if (L.presence > 0.001 && ring.current) {
      // Ring expands with each phase advance, then holds
      const t = state.clock.elapsedTime;
      const wobble = reduce ? 0 : Math.sin(t * 2) * 0.08;
      L.radius = damp(L.radius, 3.4 + phaseSub.current * 0.7 + wobble, 1.8, dt);
      ring.current.scale.setScalar(L.radius);
      ring.current.rotation.z += dt * (reduce ? 0 : 0.5);
      if (ring2.current) {
        ring2.current.scale.setScalar(L.radius * 0.82);
        ring2.current.rotation.z -= dt * (reduce ? 0 : 0.32);
      }
    }
    // Ring opacity via material (no shader needed)
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.4 * L.presence;
    }
    if (ring2.current) {
      const mat = ring2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 * L.presence;
    }
    ring.current!.visible = L.presence > 0.005;
    ring2.current!.visible = L.presence > 0.005;
  });

  const ringGeoRef = useRef<THREE.RingGeometry | null>(null);
  if (ringGeoRef.current === null) ringGeoRef.current = new THREE.RingGeometry(0.96, 1, 96);
  const ringGeo2Ref = useRef<THREE.RingGeometry | null>(null);
  if (ringGeo2Ref.current === null) ringGeo2Ref.current = new THREE.RingGeometry(0.985, 1, 96);

  return (
    <group position={[0, 1.2, -1]} rotation={[-Math.PI / 2.1, 0, 0]}>
      <mesh ref={ring} visible={false}>
        <ringGeometry args={[0.96, 1, 96]} />
        <meshBasicMaterial color="#78DFFF" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={ring2} visible={false}>
        <ringGeometry args={[0.985, 1, 96]} />
        <meshBasicMaterial color="#28B8D9" transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Subtle depth parallax for holographic planes. */
export function parallaxShift(scale = 1): { x: number; y: number } {
  const m = mouse();
  return { x: m.x * 0.12 * scale, y: m.y * 0.06 * scale };
}
