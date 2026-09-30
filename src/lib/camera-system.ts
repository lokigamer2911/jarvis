/**
 * JARVIS V2 — CAMERA SYSTEM
 *
 * Semantic camera rig for the persistent world. The camera never snaps:
 * every move is a damped approach toward the active state's target pose,
 * so module transitions read as one continuous environment re-framing
 * itself. Mouse parallax adds a whisper of depth on top.
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { damp, prefersReducedMotion } from './visual-theme';
import { worldState } from './scene-state';
import { mouse } from './world-input';

export interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const _pos = new THREE.Vector3();
const _target = new THREE.Vector3();

/** Semantic module-camera poses for CAD (world units match the CAD grid). */
export const CAD_FOCUSES: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  assembly: { pos: [46, 34, 46], target: [0, 8, 0] },
  hero:     { pos: [60, 42, 60], target: [0, 10, 0] },
  frame:    { pos: [0, 30, 130], target: [0, 12, 0] },
  section:  { pos: [8, 18, 42],  target: [0, 10, 0] },
  component:{ pos: [22, 20, 34], target: [0, 10, 0] },
  motor:    { pos: [30, 16, 30], target: [0, 8, 0] },
};

/**
 * The persistent camera rig. Reads the world state every frame and eases
 * toward that state's pose. Parallax is reduced-motion aware and clamped.
 *
 * The camera is canvas-owned external state; per-frame pose updates inside
 * useFrame are the intended mutation point (compiler-exempted).
 */
export function CameraRig({ parallax = 0.35 }: { parallax?: number }) {
  const { camera } = useThree();
  const targetObj = useRef(new THREE.Vector3(0, 0, 0));

  /* eslint-disable react-hooks/immutability -- frame-loop pose damping on canvas-owned external state (the camera); this is the intended mutation point in R3F */
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1); // clamp tab-switch spikes
    const env = worldState.env;
    const reduce = prefersReducedMotion();
    const speed = reduce ? 14 : 3.2; // damp lambda — higher = snappier

    _pos.set(...env.camPos);
    _target.set(...env.camTarget);

    // Subtle parallax from pointer (disabled for reduced motion)
    if (!reduce) {
      const px = mouse().x * parallax;
      const py = mouse().y * parallax * 0.5;
      _pos.x += px * 0.6;
      _pos.y += py;
      _target.x += px * 0.2;
      _target.y += py * 0.2;
    }

    camera.position.x = damp(camera.position.x, _pos.x, speed, dt);
    camera.position.y = damp(camera.position.y, _pos.y, speed, dt);
    camera.position.z = damp(camera.position.z, _pos.z, speed, dt);
    targetObj.current.x = damp(targetObj.current.x, _target.x, speed, dt);
    targetObj.current.y = damp(targetObj.current.y, _target.y, speed, dt);
    targetObj.current.z = damp(targetObj.current.z, _target.z, speed, dt);
    camera.lookAt(targetObj.current);
  }, -1); // priority -1: run before scene content updates
  /* eslint-enable react-hooks/immutability */

  return null;
}


