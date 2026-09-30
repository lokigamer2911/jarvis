'use client';

/**
 * ScenePostFX — controlled post-processing pipeline.
 *
 * RenderPass → selective bloom → subtle vignette → OutputPass.
 * Bloom is intentionally gentle: only emissive objects (core glow, scan
 * ring, active node halos) cross the threshold. Panels/text are HTML and
 * never bloom. Everything is quality-gated — LOW skips the chain entirely.
 *
 * The composer is an external resource: created in an effect, stored in a
 * ref, mutated only inside the frame callback (React-Compiler safe).
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as THREE from 'three';
import { worldState } from '@/lib/scene-state';
import { QUALITY, damp, QualityTier } from '@/lib/visual-theme';

const VIGNETTE = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uStrength;
varying vec2 vUv;
void main(){
  float d = distance(vUv, vec2(0.5));
  float vig = smoothstep(0.92, 0.32, d);
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  gl_FragColor = vec4(col * mix(1.0, vig, uStrength), 1.0);
}
`;

const VIGNETTE_VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

interface Chain {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
}

function buildChain(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: QualityTier,
): Chain | null {
  if (!QUALITY[quality].postFx) return null;
  const composer = new EffectComposer(gl);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(gl.domElement.width, gl.domElement.height),
    QUALITY[quality].bloomStrength,
    0.55,
    0.72, // threshold — only bright emissives bloom
  );
  composer.addPass(bloom);
  const vignette = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.35 } },
    vertexShader: VIGNETTE_VERT,
    fragmentShader: VIGNETTE,
  });
  composer.addPass(vignette);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}

export function ScenePostFX({ quality }: { quality: QualityTier }) {
  const { gl, scene, camera } = useThree();
  const chainRef = useRef<Chain | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    chainRef.current = buildChain(gl, scene, camera, quality);
    const id = window.setTimeout(() => setReady(true), 0);
    return () => {
      window.clearTimeout(id);
      chainRef.current?.composer.dispose();
      chainRef.current = null;
    };
  }, [gl, scene, camera, quality]);

  // Priority 1: take over rendering from R3F's default loop. When the
  // quality tier disables post-processing, still render directly — a
  // priority>0 useFrame suppresses the default render, so returning early
  // here would leave the canvas black on LOW machines.
  useFrame((_, dt) => {
    const chain = chainRef.current;
    if (!chain) {
      gl.render(scene, camera);
      return;
    }
    // Bloom breathes with the world state (active modes push slightly)
    const target = QUALITY[quality].bloomStrength * (0.6 + worldState.env.bloom * 0.8);
    chain.bloom.strength = damp(chain.bloom.strength, target, 2.5, Math.min(dt, 0.1));
    chain.composer.render(dt);
  }, 1);

  // The composer render at priority 1 outputs the final frame every time
  // it exists. `ready` is intentionally unused in output — the effect above
  // only confirms construction; rendering reads the ref per frame.
  void ready;
  return null;
}

/** Tone mapping / colour space setup for the persistent canvas. */
export function useWorldGlConfig() {
  const { gl } = useThree();
  useEffect(() => {
    /* eslint-disable react-hooks/immutability -- configuring canvas-owned external renderer state */
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    /* eslint-enable react-hooks/immutability */
  }, [gl]);
}
