/**
 * JARVIS V2 — VISUAL THEME
 *
 * Single source of truth for the design language. Every colour, duration,
 * and easing constant in the application resolves from here.
 *
 * Hierarchy rule:
 *   CYAN   → active state / JARVIS energy (never a decorative flood)
 *   SILVER → neutral information
 *   GREEN  → validated / success ONLY
 *   AMBER  → attention / warning ONLY (replaces the old orange accent)
 *   RED    → actual error / failure ONLY
 *
 * The environment is cool, dark and restrained. Colour is information.
 */

// ── Core palette ─────────────────────────────────────────────────────────
export const COLORS = {
  bg: '#05070A',
  bg2: '#080C11',
  surface: 'rgba(15, 20, 27, 0.72)',
  surfaceStrong: 'rgba(15, 20, 27, 0.88)',
  surfaceHighlight: 'rgba(30, 40, 50, 0.50)',
  line: 'rgba(148, 170, 190, 0.10)',
  lineStrong: 'rgba(148, 170, 190, 0.20)',
  t1: '#E8EDF2',
  t2: '#8D9AA6',
  t3: '#53606C',
  energy: '#78DFFF',
  energyDeep: '#28B8D9',
  success: '#63D6A0',
  warning: '#D6AE5C',
  error: '#E56B78',
  violet: '#B7A9F5',
} as const;

/** CSS custom properties mirror (kept in sync with globals.css). */
export const STATE_COLORS: Record<string, string> = {
  idle: '#9FB4C4',
  listening: COLORS.energy,
  processing: COLORS.energyDeep,
  thinking: COLORS.energyDeep,
  planning: COLORS.energyDeep,
  executing: COLORS.violet,
  speaking: COLORS.violet,
  success: COLORS.success,
  error: COLORS.error,
};

// ── Motion system ────────────────────────────────────────────────────────
// Duration must correspond to movement distance + importance.
export const MOTION = {
  micro: 140,        // hover, focus rings
  button: 200,       // press, state toggle
  panel: 320,        // panel enter/exit
  module: 560,       // module transition (HUD morph)
  camera: 800,       // major camera move in the world
  environment: 950,  // lighting/particles/post FX transformation
} as const;

export const EASING = {
  /** Default cinematic settle. */
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  /** Overshoot for small elements. */
  spring: [0.32, 1.35, 0.5, 1] as [number, number, number, number],
  /** Linear only for continuous rotation. */
  linear: [0, 0, 1, 1] as [number, number, number, number],
};

/** Damped-lerp factor → per-second smoothing for 3D values (frame-rate safe). */
export const DAMPING = {
  gentle: 2.2,
  standard: 4.5,
  crisp: 8,
} as const;

/** Frame-rate-independent damped approach: value → target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// ── Adaptive quality ─────────────────────────────────────────────────────
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityProfile {
  particles: number;
  dprMax: number;
  postFx: boolean;
  bloomStrength: number;
  gridSegments: number;
  antialias: boolean;
}

export const QUALITY: Record<QualityTier, QualityProfile> = {
  low:    { particles: 500,  dprMax: 1.25, postFx: false, bloomStrength: 0,   gridSegments: 24, antialias: false },
  medium: { particles: 1400, dprMax: 1.6,  postFx: true,  bloomStrength: 0.55, gridSegments: 48, antialias: true },
  high:   { particles: 2600, dprMax: 2,    postFx: true,  bloomStrength: 0.8,  gridSegments: 64, antialias: true },
};

export function detectQuality(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return 'low';
  const nav = navigator as { hardwareConcurrency?: number; deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 4) <= 4 || (nav.deviceMemory ?? 4) <= 4) return 'low';
  if ((nav.hardwareConcurrency ?? 0) >= 8) return 'high';
  return 'medium';
}

/** Should the whole app minimize motion? (accessibility) */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
