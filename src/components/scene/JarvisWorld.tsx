'use client';

/**
 * JarvisWorld — THE persistent 3D environment.
 *
 * One canvas, mounted once for the app's entire life. Modules do not get
 * their own scenes; they contribute objects + camera poses to this world
 * and the world state machine choreographs everything. HOME → RECON → CAD
 * is the same environment transforming — never a page swap.
 */

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { CameraRig } from '@/lib/camera-system';
import { JarvisCore } from './JarvisCore';
import { SceneParticles } from './SceneParticles';
import { SceneLighting, SceneGrid, ScanRing } from './SceneEnvironment';
import { ScenePostFX, useWorldGlConfig } from './ScenePostFX';
import { ReconNetwork } from './ReconNetwork';
import { CadModelObject } from './CadModelObject';
import { SystemRings } from './SystemRings';
import { MemoryGraph } from './MemoryGraph';
import { QUALITY, QualityTier, detectQuality } from '@/lib/visual-theme';

function WorldContent({ quality }: { quality: QualityTier }) {
  useWorldGlConfig();

  return (
    <>
      <CameraRig />
      <SceneLighting />
      <SceneGrid />
      <SceneParticles quality={quality} />
      <JarvisCore />
      <ScanRing />
      <ReconNetwork />
      <CadModelObject quality={quality} />
      <SystemRings />
      <MemoryGraph />
      <ScenePostFX quality={quality} />
      <color attach="background" args={['#05070A']} />
      <fog attach="fog" args={['#05070A', 18, 60]} />
    </>
  );
}

export default function JarvisWorld() {
  const [quality] = useState<QualityTier>(() => detectQuality());
  const dprMax = QUALITY[quality].dprMax;

  return (
    <div
      className="fixed inset-0 z-0"
      style={{ background: '#05070A' }}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0.4, 8.2], fov: 45, near: 0.1, far: 500 }}
        dpr={[1, dprMax]}
        gl={{
          antialias: QUALITY[quality].antialias,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <WorldContent quality={quality} />
      </Canvas>
    </div>
  );
}
