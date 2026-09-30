/**
 * JARVIS V2 — SCENE STATE
 *
 * One authoritative world state for the entire 3D environment. The world is
 * a machine with operational modes; every subsystem (camera, lighting,
 * particles, core, post-processing, HUD environment grade) derives its
 * behavior from this state. No component guesses what the world is doing.
 *
 * Derivation:
 *   worldModule  — which module owns the environment (home/recon/cad/…)
 *   voiceState   — the live AssistantState (listening/thinking/…)
 *   ↓
 *   JarvisWorldState — the resolved operational mode of the WORLD.
 */

import { useEffect, useState } from 'react';
import type { AssistantState } from './assistant-state';
import { prefersReducedMotion } from './visual-theme';

// ── The world's operational modes ─────────────────────────────────────────
export type JarvisWorldState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'recon'
  | 'research'
  | 'blueprint'
  | 'cad'
  | 'simulation'
  | 'memory'
  | 'system'
  | 'computer'
  | 'error';

/** Modules that own the environment while open. */
export type WorldModule =
  | 'home' | 'recon' | 'cad' | 'blueprint' | 'memory'
  | 'system' | 'computer' | 'settings';

// ── Environment configuration per world state ─────────────────────────────
export interface WorldEnv {
  /** Camera target position (world units). */
  camPos: [number, number, number];
  /** Camera look-at target. */
  camTarget: [number, number, number];
  /** Where the JARVIS core sits + how large it feels. */
  corePos: [number, number, number];
  coreScale: number;
  /** Key light colour + intensity of the environment. */
  lightColor: string;
  lightIntensity: number;
  /** Ambient particle behaviour. */
  particles: 'ambient' | 'toward-core' | 'compute' | 'network' | 'construct' | 'outward' | 'calm';
  particleOpacity: number;
  /** Perspective grid presence 0..1. */
  grid: number;
  /** Scanline overlay presence 0..1 (boot/diagnostic/technical ops). */
  scanfield: number;
  /** Selective bloom push 0..1 (multiplied by quality bloom strength). */
  bloom: number;
  /** HUD grading data-env attribute. */
  env: 'home' | 'recon' | 'cad' | 'blueprint' | 'memory' | 'system' | 'computer';
  /** Which module layer is mounted above the world. */
  module: WorldModule;
}

const HOME_CAM: [number, number, number] = [0, 0.4, 8.2];
const HOME_TARGET: [number, number, number] = [0, 0, 0];

export const WORLD_ENVS: Record<JarvisWorldState, WorldEnv> = {
  idle: {
    camPos: HOME_CAM, camTarget: HOME_TARGET,
    corePos: [0, 0, 0], coreScale: 1,
    lightColor: '#9FB4C4', lightIntensity: 1.0,
    particles: 'ambient', particleOpacity: 0.34,
    grid: 0.12, scanfield: 0,
    bloom: 0.55, env: 'home', module: 'home',
  },
  listening: {
    camPos: HOME_CAM, camTarget: HOME_TARGET,
    corePos: [0, 0, 0], coreScale: 1.03,
    lightColor: '#78DFFF', lightIntensity: 1.5,
    particles: 'toward-core', particleOpacity: 0.55,
    grid: 0.12, scanfield: 0,
    bloom: 0.8, env: 'home', module: 'home',
  },
  thinking: {
    camPos: [0, 0.9, 7.2], camTarget: [0, 0.1, 0],
    corePos: [0, 0, 0], coreScale: 1.0,
    lightColor: '#28B8D9', lightIntensity: 1.65,
    particles: 'compute', particleOpacity: 0.6,
    grid: 0.1, scanfield: 0,
    bloom: 0.95, env: 'home', module: 'home',
  },
  speaking: {
    camPos: HOME_CAM, camTarget: HOME_TARGET,
    corePos: [0, 0, 0], coreScale: 1.02,
    lightColor: '#B7A9F5', lightIntensity: 1.4,
    particles: 'outward', particleOpacity: 0.5,
    grid: 0.1, scanfield: 0,
    bloom: 0.75, env: 'home', module: 'home',
  },
  error: {
    camPos: HOME_CAM, camTarget: HOME_TARGET,
    corePos: [0, 0, 0], coreScale: 0.99,
    lightColor: '#E56B78', lightIntensity: 1.2,
    particles: 'ambient', particleOpacity: 0.3,
    grid: 0.08, scanfield: 0,
    bloom: 0.4, env: 'home', module: 'home',
  },
  recon: {
    camPos: [0, 7.5, 12.5], camTarget: [0, 1.2, 0],
    corePos: [0, 3.4, -2.6], coreScale: 0.5,
    lightColor: '#78DFFF', lightIntensity: 1.35,
    particles: 'network', particleOpacity: 0.5,
    grid: 0.06, scanfield: 0.5,
    bloom: 0.85, env: 'recon', module: 'recon',
  },
  research: {
    camPos: [0, 6.5, 12], camTarget: [0, 1, 0],
    corePos: [0, 3.2, -2.6], coreScale: 0.5,
    lightColor: '#78DFFF', lightIntensity: 1.3,
    particles: 'network', particleOpacity: 0.45,
    grid: 0.06, scanfield: 0.4,
    bloom: 0.8, env: 'recon', module: 'recon',
  },
  cad: {
    camPos: [46, 34, 46], camTarget: [0, 8, 0],
    corePos: [0, 52, -60], coreScale: 0.34,
    lightColor: '#C7D8E8', lightIntensity: 1.6,
    particles: 'construct', particleOpacity: 0.32,
    grid: 0.85, scanfield: 0,
    bloom: 0.5, env: 'cad', module: 'cad',
  },
  blueprint: {
    camPos: [0, 60, 78], camTarget: [0, 8, 0],
    corePos: [0, 56, -66], coreScale: 0.3,
    lightColor: '#7CC4EF', lightIntensity: 1.3,
    particles: 'calm', particleOpacity: 0.22,
    grid: 1, scanfield: 0.55,
    bloom: 0.55, env: 'blueprint', module: 'blueprint',
  },
  simulation: {
    camPos: [52, 40, 52], camTarget: [0, 8, 0],
    corePos: [0, 52, -60], coreScale: 0.34,
    lightColor: '#78DFFF', lightIntensity: 1.5,
    particles: 'compute', particleOpacity: 0.45,
    grid: 0.8, scanfield: 0.3,
    bloom: 0.75, env: 'cad', module: 'cad',
  },
  memory: {
    camPos: [0, 2.5, 10.5], camTarget: [0, 0.6, 0],
    corePos: [0, 2.2, -3.2], coreScale: 0.55,
    lightColor: '#B7A9F5', lightIntensity: 1.15,
    particles: 'calm', particleOpacity: 0.4,
    grid: 0.08, scanfield: 0,
    bloom: 0.7, env: 'memory', module: 'memory',
  },
  system: {
    camPos: [0, 1.2, 9.6], camTarget: [0, 0.6, 0],
    corePos: [0, 1.8, -3.4], coreScale: 0.5,
    lightColor: '#96CDF0', lightIntensity: 1.35,
    particles: 'compute', particleOpacity: 0.5,
    grid: 0.14, scanfield: 0.35,
    bloom: 0.7, env: 'system', module: 'system',
  },
  computer: {
    camPos: [0, 0.6, 9.0], camTarget: [0, 0.2, 0],
    corePos: [0, 1.4, -3.8], coreScale: 0.45,
    lightColor: '#78DFFF', lightIntensity: 1.25,
    particles: 'calm', particleOpacity: 0.3,
    grid: 0.06, scanfield: 0.7,
    bloom: 0.65, env: 'computer', module: 'computer',
  },
};

// ── Derivation: module + assistant state → world state ────────────────────
export function deriveWorldState(module: WorldModule, voice: AssistantState): JarvisWorldState {
  // Error always wins — a fault is a world-level condition.
  if (voice === 'error') return 'error';
  switch (module) {
    case 'recon': return 'recon';
    case 'cad': return 'cad';
    case 'blueprint': return 'blueprint';
    case 'memory': return 'memory';
    case 'system': return 'system';
    case 'computer': return 'computer';
    case 'settings': return 'idle';
    case 'home':
      switch (voice) {
        case 'listening': return 'listening';
        case 'processing': case 'thinking': case 'planning': return 'thinking';
        case 'executing': return 'thinking';
        case 'speaking': return 'speaking';
        default: return 'idle';
      }
  }
}

// ── Observable store ──────────────────────────────────────────────────────
type Listener = (ws: JarvisWorldState) => void;

class WorldStateStore {
  private module: WorldModule = 'home';
  private voice: AssistantState = 'idle';
  private resolved: JarvisWorldState = deriveWorldState(this.module, this.voice);
  private listeners = new Set<Listener>();
  /** Previous state — transitions read this to choose choreography direction. */
  previous: JarvisWorldState = this.resolved;
  /** Monotonic transition id — lets effects re-run per transition. */
  transitionId = 0;

  get state(): JarvisWorldState { return this.resolved; }
  get env(): WorldEnv { return WORLD_ENVS[this.resolved]; }
  get worldModule(): WorldModule { return this.module; }

  setModule(m: WorldModule) {
    if (m === this.module) return;
    this.module = m;
    this._resolve();
  }

  setVoice(v: AssistantState) {
    if (v === this.voice) return;
    this.voice = v;
    this._resolve();
  }

  private _resolve() {
    const next = deriveWorldState(this.module, this.voice);
    if (next === this.resolved) return;
    this.previous = this.resolved;
    this.resolved = next;
    this.transitionId++;
    this.listeners.forEach(fn => { try { fn(next); } catch (e) { console.error('[world-state]', e); } });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

/** Singleton — the world, the HUD, and all modules share this instance. */
export const worldState = new WorldStateStore();

// ── React bindings ────────────────────────────────────────────────────────
export function useWorldState(): JarvisWorldState {
  const [ws, setWs] = useState<JarvisWorldState>(worldState.state);
  useEffect(() => worldState.subscribe(setWs), []);
  return ws;
}

export function useWorldEnv(): WorldEnv {
  const ws = useWorldState();
  return WORLD_ENVS[ws];
}

/** The world follows the assistant state machine automatically. */
export function bindAssistantToWorld(getState: () => AssistantState): () => void {
  worldState.setVoice(getState());
  const id = window.setInterval(() => worldState.setVoice(getState()), 120);
  return () => window.clearInterval(id);
}

/** Reduced-motion override: world transitions become minimal. */
export function motionScale(): number {
  return prefersReducedMotion() ? 0.0 : 1.0;
}
